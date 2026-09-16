package clrsshakedown

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"reflect"
	"testing"
	"testing/synctest"
	"time"

	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/specialistcontrol"
)

func TestRunAndCheckAllFrozenCasesWithoutChangingInputs(t *testing.T) {
	options := fixtureOptions(t)
	before := snapshot(t, options.DatasetDirectory)
	var report Report
	var err error
	// Only the semantic run uses fake time; fixture lifetime and Check remain
	// outside the bubble. Host filesystem latency is not this test's subject.
	synctest.Test(t, func(*testing.T) {
		report, err = Run(context.Background(), options)
	})
	if err != nil {
		t.Fatal(err)
	}
	if report.Authority != "NO_RESULT" || report.State != "completed-unadmitted" || report.ImageAdmitted || report.ScientificResult ||
		len(report.Cases) != 48 || len(report.Events) != 192 || report.Energy.State != "unavailable" || report.Energy.Joules != nil || !report.InputsRechecked {
		t.Fatalf("misleading report: %+v", report)
	}
	requireCompleteSyntheticExecution(t, report)
	if !reflect.DeepEqual(before, snapshot(t, options.DatasetDirectory)) {
		t.Fatal("run changed fixture bytes")
	}
	bundle := snapshot(t, options.OutputDirectory)
	checked, err := Check(context.Background(), options)
	if err != nil {
		t.Fatal(err)
	}
	if checked.State != "bundle-consistent-unadmitted" || !reflect.DeepEqual(checked.Cases, report.Cases) {
		t.Fatalf("check result differs: %+v", checked)
	}
	if !reflect.DeepEqual(bundle, snapshot(t, options.OutputDirectory)) {
		t.Fatal("checker changed retained evidence")
	}
	if _, err := Run(context.Background(), options); err == nil {
		t.Fatal("run overwrote existing evidence")
	}
	if !reflect.DeepEqual(bundle, snapshot(t, options.OutputDirectory)) {
		t.Fatal("repeated run changed retained evidence")
	}
}

func TestRunRejectsUnpinnedInputBeforeCreatingOutput(t *testing.T) {
	options := fixtureOptions(t)
	options.ExpectedTreeSHA256 = "0000000000000000000000000000000000000000000000000000000000000000"
	report, err := Run(context.Background(), options)
	if err == nil || report.Authority != "NO_RESULT" || report.State != "incomplete" || report.Error == "" {
		t.Fatalf("unpinned input passed: %+v %v", report, err)
	}
	if _, err := os.Lstat(options.OutputDirectory); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("unpinned input created output: %v", err)
	}
}

func TestRunFailureAndCancellationRetainPartialJournal(t *testing.T) {
	for _, cancelRun := range []bool{false, true} {
		options := fixtureOptions(t)
		ctx, cancel := context.WithCancel(context.Background())
		report, err := run(ctx, options, func(bound *boundInputs, _ *journal) {
			original := bound.tasks[0].verifier
			bound.tasks[0].verifier = verifierFunc(func(ctx context.Context, in specialistcontrol.Invocation, c specialistcontrol.Candidate) (specialistcontrol.Verification, error) {
				result, err := original.Verify(ctx, in, c)
				if cancelRun {
					cancel()
				} else {
					result.Verdict = specialistcontrol.VerificationMismatch
				}
				return result, err
			})
		})
		cancel()
		if err == nil || report.State != "incomplete" || len(report.Cases) != 1 || report.Cases[0].Exact || len(report.Events) != 4 {
			t.Fatalf("failure not retained: %+v %v", report, err)
		}
		if cancelRun && !errors.Is(err, context.Canceled) {
			t.Fatalf("cancellation lost: %v", err)
		}
		var retained Report
		body, readErr := os.ReadFile(filepath.Join(options.OutputDirectory, "receipt.json"))
		if readErr != nil || json.Unmarshal(body, &retained) != nil || retained.State != "incomplete" || len(retained.Events) != 4 {
			t.Fatalf("partial receipt missing: %s %v", body, readErr)
		}
		if _, err := Check(context.Background(), options); err == nil {
			t.Fatal("partial run passed checker")
		}
	}
}

func TestDecisionRecordFailurePreventsEverySpecialistEffect(t *testing.T) {
	options := fixtureOptions(t)
	report, err := run(context.Background(), options, func(_ *boundInputs, j *journal) {
		if err := writeNew(j.root, "events/001-decision.json", []byte("owned-collision")); err != nil {
			t.Fatal(err)
		}
	})
	if err == nil || report.State != "incomplete" || len(report.Events) != 1 || report.Events[0].Path != "events/001-terminal.json" || len(report.Cases) != 1 {
		t.Fatalf("record failure evidence differs: %+v %v", report, err)
	}
}

func TestInputMutationDuringRunInvalidatesCompletedWork(t *testing.T) {
	options := fixtureOptions(t)
	var changedPath string
	var original []byte
	var report Report
	var err error
	synctest.Test(t, func(t *testing.T) {
		report, err = run(context.Background(), options, func(bound *boundInputs, _ *journal) {
			changedPath = bound.tree.Files[0].Path
			path := filepath.Join(options.DatasetDirectory, changedPath)
			body, err := os.ReadFile(path)
			if err != nil {
				t.Fatal(err)
			}
			original = append([]byte(nil), body...)
			writeTestFile(t, path, append(body, '\n'))
		})
	})
	if err == nil || report.State != "incomplete" || report.InputsRechecked || len(report.Cases) != 48 {
		t.Fatalf("changed input accepted: %+v %v", report, err)
	}
	requireCompleteSyntheticExecution(t, report)
	wantError := "fixture file " + changedPath + " changed after comparison"
	if err.Error() != wantError || report.Error != wantError {
		t.Fatalf("run did not reach the final input recheck: %+v %v", report, err)
	}
	requireCheckHashesMatch(t, options, report)
	var retained Report
	readCheckJSON(t, filepath.Join(options.OutputDirectory, "receipt.json"), &retained)
	if !reflect.DeepEqual(retained, report) {
		t.Fatalf("invalidation was not retained: %+v", retained)
	}
	// Restore the input so Check must reject the incomplete receipt itself.
	writeTestFile(t, filepath.Join(options.DatasetDirectory, changedPath), original)
	before := snapshot(t, options.OutputDirectory)
	if _, err := Check(context.Background(), options); err == nil || err.Error() != "shakedown receipt is incomplete or changes the closed execution boundary" {
		t.Fatalf("invalidated receipt passed or failed before receipt validation: %v", err)
	}
	if !reflect.DeepEqual(before, snapshot(t, options.OutputDirectory)) {
		t.Fatal("checker changed invalidated evidence")
	}
}

func requireCompleteSyntheticExecution(t *testing.T, report Report) {
	t.Helper()
	start := time.Date(2000, time.January, 1, 0, 0, 0, 0, time.UTC)
	if !report.Started.Equal(start) || !report.Finished.Equal(start) {
		t.Fatalf("semantic execution left the synthetic clock: %s to %s", report.Started, report.Finished)
	}
	if report.Authority != "NO_RESULT" || report.ImageAdmitted || report.ScientificResult || len(report.Cases) != 48 || len(report.Events) != 192 {
		t.Fatalf("incomplete or promoted execution: %+v", report)
	}
	for _, c := range report.Cases {
		if !c.Exact || c.Answer.SizeBytes <= 0 || c.ElapsedNanoseconds != 0 {
			t.Fatalf("incomplete or non-synthetic case: %+v", c)
		}
	}
}

type verifierFunc func(context.Context, specialistcontrol.Invocation, specialistcontrol.Candidate) (specialistcontrol.Verification, error)

func (f verifierFunc) Verify(ctx context.Context, in specialistcontrol.Invocation, c specialistcontrol.Candidate) (specialistcontrol.Verification, error) {
	return f(ctx, in, c)
}
