package clrsshakedown

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
	"testing/synctest"
	"time"

	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/clrsfixture"
	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/specialistcontrol"
)

func retainedCheckFixture(t *testing.T) (Options, Report) {
	t.Helper()
	options := fixtureOptions(t)
	var report Report
	// Semantic tampering needs a complete synthetic bundle, not a measurement of
	// host fsync latency. Keep its real files alive outside the clock bubble;
	// production execution and cancellation tests retain their real-time clocks.
	synctest.Test(t, func(t *testing.T) {
		var err error
		report, err = Run(context.Background(), options)
		if err != nil {
			t.Fatalf("synthetic fixture: state=%s cases=%d events=%d: %v", report.State, len(report.Cases), len(report.Events), err)
		}
	})
	if t.Failed() {
		t.Fatal("synthetic fixture construction failed")
	}
	if checked, err := Check(context.Background(), options); err != nil || checked.State != "bundle-consistent-unadmitted" {
		t.Fatalf("unmodified control failed: %s %v", checked.State, err)
	}
	return options, report
}

func cloneCheckBundle(t *testing.T, source Options, original Report) (Options, Report) {
	t.Helper()
	options := source
	options.OutputDirectory = t.TempDir()
	paths := []string{"receipt.json", "run-start.json"}
	for _, artifact := range original.Events {
		paths = append(paths, artifact.Path)
	}
	for _, path := range paths {
		body, err := os.ReadFile(filepath.Join(source.OutputDirectory, path))
		if err != nil {
			t.Fatal(err)
		}
		writeTestFile(t, filepath.Join(options.OutputDirectory, path), body)
	}
	var report Report
	readCheckJSON(t, filepath.Join(options.OutputDirectory, "receipt.json"), &report)
	return options, report
}

func readCheckJSON(t *testing.T, path string, value any) {
	t.Helper()
	body, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal(body, value); err != nil {
		t.Fatal(err)
	}
}

func mutateCheckEvent(t *testing.T, options Options, report *Report, index int, change func(*event)) {
	t.Helper()
	artifact := &report.Events[index]
	path := filepath.Join(options.OutputDirectory, artifact.Path)
	var record event
	readCheckJSON(t, path, &record)
	change(&record)
	body, err := marshal(record, maximumEventBytes)
	if err != nil {
		t.Fatal(err)
	}
	report.EventBytes += int64(len(body)) - artifact.Identity.SizeBytes
	artifact.Identity = identify(body)
	writeTestFile(t, path, body)
}

func rewriteCheckReports(t *testing.T, options Options, report Report) {
	t.Helper()
	start := report
	start.State, start.Finished, start.InputsRechecked = "incomplete", time.Time{}, false
	start.Cases, start.Events, start.EventBytes = []Case{}, []Artifact{}, 0
	for path, value := range map[string]Report{"receipt.json": report, "run-start.json": start} {
		body, err := MarshalReport(value)
		if err != nil {
			t.Fatal(err)
		}
		writeTestFile(t, filepath.Join(options.OutputDirectory, path), body)
	}
}

func requireCheckHashesMatch(t *testing.T, options Options, report Report) {
	t.Helper()
	var total int64
	for _, artifact := range report.Events {
		body, err := os.ReadFile(filepath.Join(options.OutputDirectory, artifact.Path))
		if err != nil || identify(body) != artifact.Identity {
			t.Fatalf("forgery left inconsistent event hash %s: %v", artifact.Path, err)
		}
		total += int64(len(body))
	}
	if total != report.EventBytes {
		t.Fatalf("forgery left inconsistent aggregate bytes: %d != %d", total, report.EventBytes)
	}
}

func requireCheckRejected(t *testing.T, ctx context.Context, options Options, diagnostic string) {
	t.Helper()
	before := snapshot(t, options.OutputDirectory)
	report, err := Check(ctx, options)
	if err == nil || report.State != "incomplete" || report.Error == "" || report.Authority != "NO_RESULT" {
		t.Fatalf("tampered bundle accepted or promoted: state=%s authority=%s report error=%q error=%v", report.State, report.Authority, report.Error, err)
	}
	if diagnostic != "" && !strings.Contains(err.Error(), diagnostic) {
		t.Fatalf("wrong rejection boundary: %v; want %q", err, diagnostic)
	}
	if !reflect.DeepEqual(before, snapshot(t, options.OutputDirectory)) {
		t.Fatal("rejected check changed retained evidence")
	}
}

func TestCheckRejectsRehashedSemanticTampering(t *testing.T) {
	base, original := retainedCheckFixture(t)
	tests := []struct {
		name, diagnostic string
		index            int
		change           func(*event)
	}{
		{"sequence", "event sequence", 0, func(e *event) { e.Sequence++ }},
		{"kind", "record kinds", 0, func(e *event) { e.Kind = "terminal" }},
		{"extra-payload", "record kinds", 0, func(e *event) { e.Invocation = &invocationEvent{} }},
		{"event-authority", "event sequence, authority", 1, func(e *event) { e.Authority = "RESULT" }},
		{"decision-binding", "pre-effect decision", 0, func(e *event) { e.Decision.Binding[0] ^= 1 }},
		{"decision-identity", "pre-effect decision", 0, func(e *event) { e.Decision.SpecialistID = "other-specialist" }},
		{"decision-admission", "pre-effect decision", 0, func(e *event) { e.Decision.Admission.SpecialistID = "other-specialist" }},
		{"terminal-admission", "admission", 3, func(e *event) { e.Terminal.Result.Admission.SpecialistID = "other-specialist" }},
		{"revalidation-retries", "admission revalidation", 3, func(e *event) { e.Terminal.Result.Admission.Attempts++ }},
		{"revalidation-before-record", "revalidation time", 3, func(e *event) {
			e.Terminal.Result.Admission.DecidedAt = e.Terminal.Result.Decision.DecidedAt.Add(-time.Nanosecond)
		}},
		{"terminal-authority", "terminal payload", 3, func(e *event) { e.Terminal.Result.Outcome.Authority = "RESULT" }},
		{"effect-before-decision", "time order", 1, func(e *event) { e.Invocation.Started = original.Started.Add(-time.Second) }},
		{"event-after-finish", "event sequence, authority or time", 2, func(e *event) { e.ObservedAt = original.Finished.Add(time.Second) }},
		{"reference-verdict", "held-reference verification", 2, func(e *event) { e.Verification.Verification.Verdict = specialistcontrol.VerificationMismatch }},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			options, report := cloneCheckBundle(t, base, original)
			mutateCheckEvent(t, options, &report, test.index, test.change)
			rewriteCheckReports(t, options, report)
			requireCheckHashesMatch(t, options, report)
			requireCheckRejected(t, context.Background(), options, test.diagnostic)
		})
	}
}

func TestCheckRejectsForgedAnswerWithConsistentBindingsAndHashes(t *testing.T) {
	options, report := retainedCheckFixture(t)
	bound := checkFixtureBound(t, options)
	var terminal event
	readCheckJSON(t, filepath.Join(options.OutputDirectory, report.Events[3].Path), &terminal)
	request, decision := terminal.Terminal.Request, terminal.Terminal.Result.Decision
	var candidate specialistcontrol.Candidate
	mutateCheckEvent(t, options, &report, 1, func(e *event) {
		e.Invocation.Result.Payload = []byte("forged-wrong-answer")
		result := bound.policy.InspectResult(e.Invocation.Finished, request, decision, e.Invocation.Result)
		if result.State != specialistcontrol.ResultVerify {
			t.Fatalf("forged answer did not reach the reference boundary: %s", result.State)
		}
		candidate = specialistcontrol.Candidate{Binding: result.Binding, CandidateBinding: result.CandidateBinding,
			SpecialistID: result.SpecialistID, State: specialistcontrol.ResultCompleted, Payload: result.Payload}
	})
	mutateCheckEvent(t, options, &report, 2, func(e *event) {
		e.Verification.Candidate = candidate
		e.Verification.Verification = specialistcontrol.Verification{Binding: candidate.Binding, CandidateBinding: candidate.CandidateBinding, Verdict: specialistcontrol.VerificationExact}
	})
	report.Cases[0].Answer = identify(candidate.Payload)
	mutateCheckEvent(t, options, &report, 3, func(e *event) {
		e.Terminal.Result.Outcome.Payload = candidate.Payload
		e.Terminal.Case = report.Cases[0]
	})
	rewriteCheckReports(t, options, report)
	requireCheckHashesMatch(t, options, report)
	requireCheckRejected(t, context.Background(), options, "held-reference verification")
}

func checkFixtureBound(t *testing.T, options Options) boundInputs {
	t.Helper()
	tree, err := clrsfixture.LoadFixtureTree(context.Background(), clrsfixture.FixtureTreeOptions{RepositoryRoot: options.RepositoryRoot,
		DatasetDirectory: options.DatasetDirectory, ExpectedTreeSHA256: options.ExpectedTreeSHA256})
	if err != nil {
		t.Fatal(err)
	}
	bound, err := bindInputs(options, tree)
	if err != nil {
		t.Fatal(err)
	}
	return bound
}

func TestCheckRejectsReboundAdmissionPromotion(t *testing.T) {
	base, original := retainedCheckFixture(t)
	tests := []struct {
		name   string
		change func(*specialistcontrol.AdmissionDecision)
	}{
		{"measured-fit", func(a *specialistcontrol.AdmissionDecision) {
			a.Fit, a.FitMeasurementBasis = specialistcontrol.FitMeasured, "fabricated-measurement"
			a.FitMeasuredAt, a.FitValidUntil = a.ObservedAt, a.ValidUntil
		}},
		{"forbidden-retry", func(a *specialistcontrol.AdmissionDecision) { a.Attempts++ }},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			options, report := cloneCheckBundle(t, base, original)
			bound := checkFixtureBound(t, options)
			var records [4]event
			for index := range records {
				readCheckJSON(t, filepath.Join(options.OutputDirectory, report.Events[index].Path), &records[index])
			}
			decision, terminal := *records[0].Decision, records[3].Terminal
			test.change(&decision.Admission)
			decision = bound.policy.Decide(decision.DecidedAt, terminal.Request, decision.Admission)
			if decision.State != specialistcontrol.DecisionInvoke {
				t.Fatalf("forgery did not pass pure decision validation: %s", decision.State)
			}
			records[0].Decision, terminal.Result.Decision = &decision, decision
			test.change(&terminal.Result.Admission)
			rebindCheckCase(t, bound.policy, records)
			for index, record := range records {
				mutateCheckEvent(t, options, &report, index, func(e *event) { *e = record })
			}
			rewriteCheckReports(t, options, report)
			requireCheckHashesMatch(t, options, report)
			requireCheckRejected(t, context.Background(), options, "canonical construction readiness")
		})
	}
}

func rebindCheckCase(t *testing.T, policy specialistcontrol.Policy, records [4]event) {
	t.Helper()
	decision, terminal := *records[0].Decision, records[3].Terminal
	invocation, verification := records[1].Invocation, records[2].Verification
	invocation.Result.Binding = decision.Binding
	result := policy.InspectResult(invocation.Finished, terminal.Request, decision, invocation.Result)
	if result.State != specialistcontrol.ResultVerify {
		t.Fatalf("rebound effect rejected by pure policy: %s", result.State)
	}
	verification.Candidate.Binding, verification.Candidate.CandidateBinding = result.Binding, result.CandidateBinding
	verification.Verification.Binding, verification.Verification.CandidateBinding = result.Binding, result.CandidateBinding
	terminal.Result.Outcome = policy.Finalise(terminal.Finished, terminal.Request, decision, result, verification.Verification)
	if terminal.Result.Outcome.State != specialistcontrol.OutcomeVerified {
		t.Fatalf("rebound outcome rejected by pure policy: %s", terminal.Result.Outcome.State)
	}
}

func TestCheckRejectsPromotedOrChangedReportIdentity(t *testing.T) {
	base, original := retainedCheckFixture(t)
	tests := []struct {
		name   string
		change func(*Report)
	}{
		{"authority", func(r *Report) { r.Authority = "RESULT" }},
		{"scientific-result", func(r *Report) { r.ScientificResult = true }},
		{"image-admission", func(r *Report) { r.ImageAdmitted = true }},
		{"energy", func(r *Report) { measured := 1.0; r.Energy.Joules = &measured }},
		{"source-identity", func(r *Report) { r.SourceSHA256 = strings.Repeat("1", 64) }},
		{"tree-identity", func(r *Report) { r.TreeSHA256 = strings.Repeat("1", 64) }},
		{"run-identity", func(r *Report) { r.RunID = "different-run" }},
		{"event-order", func(r *Report) { r.Events[0], r.Events[1] = r.Events[1], r.Events[0] }},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			options, report := cloneCheckBundle(t, base, original)
			test.change(&report)
			rewriteCheckReports(t, options, report)
			requireCheckHashesMatch(t, options, report)
			requireCheckRejected(t, context.Background(), options, "")
		})
	}
}

func TestCheckRejectsMissingExtraAndSymlinkBundleFiles(t *testing.T) {
	base, original := retainedCheckFixture(t)
	for _, path := range []string{"receipt.json", "run-start.json", original.Events[0].Path} {
		for _, kind := range []string{"missing", "symlink"} {
			t.Run(kind+"/"+path, func(t *testing.T) {
				options, _ := cloneCheckBundle(t, base, original)
				target := filepath.Join(options.OutputDirectory, path)
				if err := os.Remove(target); err != nil {
					t.Fatal(err)
				}
				if kind == "symlink" {
					if err := os.Symlink(filepath.Join(base.OutputDirectory, path), target); err != nil {
						t.Fatal(err)
					}
				}
				requireCheckRejected(t, context.Background(), options, "")
			})
		}
	}
	for _, path := range []string{"unlisted.json", "events/unlisted.json"} {
		t.Run("extra/"+path, func(t *testing.T) {
			options, _ := cloneCheckBundle(t, base, original)
			writeTestFile(t, filepath.Join(options.OutputDirectory, path), []byte("unexpected"))
			requireCheckRejected(t, context.Background(), options, "missing, extra or excessive")
		})
	}
}

func TestCheckRejectsSourceMutationAndCancellationWithoutWrites(t *testing.T) {
	options, report := retainedCheckFixture(t)
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	requireCheckRejected(t, ctx, options, "")
	if _, err := Check(ctx, options); !errors.Is(err, context.Canceled) {
		t.Fatalf("cancelled check lost cancellation: %v", err)
	}
	requireCheckRejected(t, nil, options, "requires a context")
	path := filepath.Join(options.DatasetDirectory, report.Inputs[0].Path)
	body, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	writeTestFile(t, path, append(body, '\n'))
	before := snapshot(t, options.DatasetDirectory)
	requireCheckRejected(t, context.Background(), options, "independently supplied SHA-256")
	if !reflect.DeepEqual(before, snapshot(t, options.DatasetDirectory)) {
		t.Fatal("checker changed the rejected input tree")
	}
}

func TestCheckEventsCancellationDuringVerificationIsReadOnly(t *testing.T) {
	options, report := retainedCheckFixture(t)
	bound := checkFixtureBound(t, options)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	verifier, calls := bound.tasks[0].verifier, 0
	bound.tasks[0].verifier = verifierFunc(func(ctx context.Context, invocation specialistcontrol.Invocation, candidate specialistcontrol.Candidate) (specialistcontrol.Verification, error) {
		calls++
		result, err := verifier.Verify(ctx, invocation, candidate)
		cancel()
		return result, err
	})
	root, err := openDirectory(options.OutputDirectory)
	if err != nil {
		t.Fatal(err)
	}
	before := snapshot(t, options.OutputDirectory)
	checkErr := checkEvents(ctx, root, bound, report)
	if err := root.Close(); err != nil {
		t.Fatal(err)
	}
	if !errors.Is(checkErr, context.Canceled) || calls != 1 {
		t.Fatalf("mid-check cancellation lost or verification continued: calls=%d error=%v", calls, checkErr)
	}
	if !reflect.DeepEqual(before, snapshot(t, options.OutputDirectory)) {
		t.Fatal("cancelled semantic check changed retained evidence")
	}
}

func TestCheckRejectsRehashedNoncanonicalJSON(t *testing.T) {
	base, original := retainedCheckFixture(t)
	tests := []struct {
		name, diagnostic string
		change           func([]byte) []byte
	}{
		{"case-insensitive-field", "canonical field names", func(body []byte) []byte {
			return bytes.Replace(body, []byte(`"authority":`), []byte(`"Authority":`), 1)
		}},
		{"unknown-field", "unknown field", func(body []byte) []byte {
			return bytes.Replace(body, []byte(`"sequence":`), []byte(`"untracked":true,"sequence":`), 1)
		}},
		{"duplicate-field", "repeats name", func(body []byte) []byte {
			return bytes.Replace(body, []byte(`"sequence":`), []byte(`"sequence":1,"sequence":`), 1)
		}},
		{"trailing-value", "", func(body []byte) []byte { return append(body, []byte("{}\n")...) }},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			options, report := cloneCheckBundle(t, base, original)
			artifact := &report.Events[0]
			path := filepath.Join(options.OutputDirectory, artifact.Path)
			originalBytes, err := os.ReadFile(path)
			if err != nil {
				t.Fatal(err)
			}
			body := test.change(originalBytes)
			if bytes.Equal(body, originalBytes) {
				t.Fatal("JSON tamper did not change the event")
			}
			report.EventBytes += int64(len(body)) - artifact.Identity.SizeBytes
			artifact.Identity = identify(body)
			writeTestFile(t, path, body)
			rewriteCheckReports(t, options, report)
			requireCheckHashesMatch(t, options, report)
			requireCheckRejected(t, context.Background(), options, test.diagnostic)
		})
	}
}
