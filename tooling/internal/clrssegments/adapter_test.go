package clrssegments

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"reflect"
	"runtime"
	"strings"
	"testing"
	"time"

	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/clrsfixture"
	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/specialistcontrol"
)

const (
	testRunID        = "run-001"
	testSpecialistID = "exact-segment-intersection-v1"
)

var verticalNow = time.Date(2099, time.August, 31, 12, 0, 0, 0, time.UTC)

type recorderFunc func(context.Context, specialistcontrol.Decision) error

func (function recorderFunc) RecordDecision(ctx context.Context, decision specialistcontrol.Decision) error {
	return function(ctx, decision)
}

type specialistFunc func(context.Context, specialistcontrol.Invocation) (specialistcontrol.SpecialistResult, error)

func (function specialistFunc) Invoke(
	ctx context.Context,
	invocation specialistcontrol.Invocation,
) (specialistcontrol.SpecialistResult, error) {
	return function(ctx, invocation)
}

type verifierFunc func(
	context.Context,
	specialistcontrol.Invocation,
	specialistcontrol.Candidate,
) (specialistcontrol.Verification, error)

func (function verifierFunc) Verify(
	ctx context.Context,
	invocation specialistcontrol.Invocation,
	candidate specialistcontrol.Candidate,
) (specialistcontrol.Verification, error) {
	return function(ctx, invocation, candidate)
}

func TestBindDatasetBuildsFixedGeometryRequestsAndIsolatesReferences(t *testing.T) {
	t.Parallel()
	fixture := newImportFixture(t, clrsfixture.TaskSegmentsIntersect)
	reorderedVerifiers := cloneVerifierSet(fixture.verifiers)
	for left, right := 0, len(reorderedVerifiers.Examples)-1; left < right; left, right = left+1, right-1 {
		reorderedVerifiers.Examples[left], reorderedVerifiers.Examples[right] =
			reorderedVerifiers.Examples[right], reorderedVerifiers.Examples[left]
	}
	requestSet, verifier, err := BindDataset(
		testRunID,
		testSpecialistID,
		fixture.source,
		fixture.contract,
		fixture.candidates,
		reorderedVerifiers,
		testLimits(),
		testVerifierLimits(),
	)
	if err != nil {
		t.Fatal(err)
	}
	if fixture.task.Family != clrsfixture.FamilyGeometry ||
		fixture.task.LengthSemantics != clrsfixture.LengthFixedFourEndpoints ||
		len(fixture.task.Sizes) != 1 ||
		fixture.task.Sizes[0].Role != clrsfixture.SizeFixedGeometryControl ||
		fixture.task.Sizes[0].RequestedLength != coordinateCount {
		t.Fatalf("task plan is not the fixed geometry control: %#v", fixture.task)
	}
	requests, err := requestSet.Requests(verticalNow.Add(-time.Second), verticalNow.Add(time.Second))
	if err != nil {
		t.Fatal(err)
	}
	if len(requests) != fixture.task.ExpectedExamples || len(requests) != 3 {
		t.Fatalf("request count = %d, want three fixed-geometry seed cells", len(requests))
	}
	for index, request := range requests {
		candidate := fixture.candidates.Examples[index]
		if request.RunID != testRunID || request.RequestID != candidate.ID.String() ||
			request.Task != specialistcontrol.TaskSegmentsIntersect ||
			!bytes.Equal(request.Payload, []byte(candidate.Prompt)) ||
			candidate.RequestedLength != coordinateCount || candidate.EffectiveInputSize != coordinateCount {
			t.Fatalf("request %d = %#v, candidate %#v", index, request, candidate)
		}
		key := referenceKey{runID: testRunID, requestID: request.RequestID}
		held, present := verifier.references[key]
		expectedVerifier := fixture.verifiers.Examples[index]
		if !present || held.source != candidate.Source || held.contract != candidate.Contract ||
			held.candidateID != candidate.ID || held.verifierID != expectedVerifier.ID ||
			held.effectiveInputSize != coordinateCount ||
			!bytes.Equal(held.answer, []byte(expectedVerifier.Reference)) {
			t.Fatalf("held reference %d = %#v", index, held)
		}
	}
	for _, candidateType := range []reflect.Type{
		reflect.TypeOf(RequestSet{}),
		reflect.TypeOf(boundCandidate{}),
		reflect.TypeOf(specialistcontrol.Invocation{}),
	} {
		for index := 0; index < candidateType.NumField(); index++ {
			name := strings.ToLower(candidateType.Field(index).Name)
			if strings.Contains(name, "answer") || strings.Contains(name, "reference") {
				t.Fatalf("candidate-visible type %s exposes verifier field %q", candidateType, name)
			}
		}
	}
}

func TestSpecialistMatchesEveryContractBoundFixedGeometryCell(t *testing.T) {
	t.Parallel()
	fixture := newImportFixture(t, clrsfixture.TaskSegmentsIntersect)
	requestSet, _ := bindFixture(t, fixture, testLimits(), testVerifierLimits())
	requests, err := requestSet.Requests(verticalNow.Add(-time.Second), verticalNow.Add(time.Second))
	if err != nil {
		t.Fatal(err)
	}
	specialist, err := NewSpecialist(testSpecialistID, testLimits())
	if err != nil {
		t.Fatal(err)
	}
	for index, request := range requests {
		invocation, _ := verificationInputs(request, nil)
		result, invokeErr := specialist.Invoke(context.Background(), invocation)
		want := []byte(fixture.verifiers.Examples[index].Reference)
		if invokeErr != nil || result.State != specialistcontrol.ResultCompleted ||
			result.SpecialistID != testSpecialistID || result.Binding != invocation.Binding ||
			!bytes.Equal(result.Payload, want) {
			t.Fatalf("cell %d result/error = %#v/%v, want %q", index, result, invokeErr, want)
		}
	}
}

func TestBindDatasetRejectsForeignAndTamperedAuthorityRecords(t *testing.T) {
	t.Parallel()
	segments := newImportFixture(t, clrsfixture.TaskSegmentsIntersect)
	insertion := newImportFixture(t, clrsfixture.TaskInsertionSort)
	if _, _, err := BindDataset(
		testRunID, testSpecialistID, insertion.source, insertion.contract,
		insertion.candidates, insertion.verifiers, testLimits(), testVerifierLimits(),
	); err == nil {
		t.Fatal("BindDataset accepted a valid foreign task set")
	}

	recordMutations := []struct {
		name   string
		mutate func(*clrsfixture.CandidateSet, *clrsfixture.VerifierSet)
	}{
		{"candidate identity", func(c *clrsfixture.CandidateSet, _ *clrsfixture.VerifierSet) { c.Examples[0].ID[0] ^= 1 }},
		{"candidate prompt", func(c *clrsfixture.CandidateSet, _ *clrsfixture.VerifierSet) { c.Examples[0].Prompt += " mutation" }},
		{"candidate task", func(c *clrsfixture.CandidateSet, _ *clrsfixture.VerifierSet) {
			c.Examples[0].Task = clrsfixture.TaskInsertionSort
		}},
		{"candidate semantics", func(c *clrsfixture.CandidateSet, _ *clrsfixture.VerifierSet) {
			c.Examples[0].LengthSemantics = clrsfixture.LengthDeclaredInput
		}},
		{"candidate requested length", func(c *clrsfixture.CandidateSet, _ *clrsfixture.VerifierSet) { c.Examples[0].RequestedLength++ }},
		{"candidate effective size", func(c *clrsfixture.CandidateSet, _ *clrsfixture.VerifierSet) { c.Examples[0].EffectiveInputSize++ }},
		{"candidate hints", func(c *clrsfixture.CandidateSet, _ *clrsfixture.VerifierSet) { c.Examples[0].UseHints = true }},
		{"verifier identity", func(_ *clrsfixture.CandidateSet, v *clrsfixture.VerifierSet) { v.Examples[0].ID[0] ^= 1 }},
		{"verifier answer", func(_ *clrsfixture.CandidateSet, v *clrsfixture.VerifierSet) { v.Examples[0].Reference += " mutation" }},
		{"missing candidate", func(c *clrsfixture.CandidateSet, _ *clrsfixture.VerifierSet) { c.Examples = c.Examples[1:] }},
		{"missing verifier", func(_ *clrsfixture.CandidateSet, v *clrsfixture.VerifierSet) { v.Examples = v.Examples[1:] }},
		{"reordered candidates", func(c *clrsfixture.CandidateSet, _ *clrsfixture.VerifierSet) {
			c.Examples[0], c.Examples[1] = c.Examples[1], c.Examples[0]
		}},
	}
	for _, test := range recordMutations {
		test := test
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()
			candidates := cloneCandidateSet(segments.candidates)
			verifiers := cloneVerifierSet(segments.verifiers)
			test.mutate(&candidates, &verifiers)
			if _, _, err := BindDataset(
				testRunID, testSpecialistID, segments.source, segments.contract,
				candidates, verifiers, testLimits(), testVerifierLimits(),
			); err == nil {
				t.Fatalf("BindDataset accepted %s", test.name)
			}
		})
	}

	foreignSource := segments.source
	foreignSource.Commit = "a" + foreignSource.Commit[1:]
	if _, _, err := BindDataset(
		testRunID, testSpecialistID, foreignSource, segments.contract,
		segments.candidates, segments.verifiers, testLimits(), testVerifierLimits(),
	); err == nil {
		t.Fatal("BindDataset accepted a source outside the pinned geometry evidence")
	}
	contractMutations := []struct {
		name   string
		mutate func(*clrsfixture.GenerationContract)
	}{
		{"seed", func(contract *clrsfixture.GenerationContract) { contract.Seeds[0]++ }},
		{"length semantics", func(contract *clrsfixture.GenerationContract) {
			contract.Tasks[5].LengthSemantics = clrsfixture.LengthDeclaredInput
		}},
		{"size role", func(contract *clrsfixture.GenerationContract) {
			contract.Tasks[5].Sizes[0].Role = clrsfixture.SizePublishedTrain
		}},
		{"requested length", func(contract *clrsfixture.GenerationContract) { contract.Tasks[5].Sizes[0].RequestedLength = 5 }},
	}
	for _, test := range contractMutations {
		contract := cloneContract(segments.contract)
		test.mutate(&contract)
		if _, _, err := BindDataset(
			testRunID, testSpecialistID, segments.source, contract,
			segments.candidates, segments.verifiers, testLimits(), testVerifierLimits(),
		); err == nil {
			t.Fatalf("BindDataset accepted mutated contract %s", test.name)
		}
	}
}

func TestBindDatasetRejectsPromptSemanticsMissingFromGenericImporter(t *testing.T) {
	t.Parallel()
	tests := []struct {
		name   string
		mutate func(*testExample)
	}{
		{"three endpoints", func(example *testExample) {
			example.prompt = strings.Replace(example.prompt, "0.558854 0.259252 0.415101 0.283525", "0.558854 0.259252 0.415101", 1)
		}},
		{"hint-bearing prompt", func(example *testExample) { example.prompt += "hint:\n" }},
		{"out-of-range coordinate", func(example *testExample) { example.prompt = strings.Replace(example.prompt, "0.558854", "1.0", 1) }},
		{"wrong output marker", func(example *testExample) {
			example.prompt = strings.Replace(example.prompt, "\nintersect:\n", "\nreturn:\n", 1)
		}},
	}
	for _, test := range tests {
		test := test
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()
			fixture := newImportFixture(t, clrsfixture.TaskSegmentsIntersect)
			test.mutate(&fixture.dataset.examples[0])
			fixture.importDataset(t)
			if _, _, err := BindDataset(
				testRunID, testSpecialistID, fixture.source, fixture.contract,
				fixture.candidates, fixture.verifiers, testLimits(), testVerifierLimits(),
			); err == nil {
				t.Fatalf("BindDataset accepted %s", test.name)
			}
		})
	}
}

func TestBindDatasetRejectsSemanticallyWrongHeldAnswers(t *testing.T) {
	t.Parallel()
	for name, reference := range map[string]string{
		"wrong mask":         falseAnswer,
		"boolean spelling":   "true\n\n",
		"missing blank line": "1\n",
		"array spelling":     "[1]\n\n",
	} {
		name, reference := name, reference
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			fixture := newImportFixture(t, clrsfixture.TaskSegmentsIntersect)
			fixture.dataset.examples[0].reference = reference
			fixture.importDataset(t)
			if _, _, err := BindDataset(
				testRunID, testSpecialistID, fixture.source, fixture.contract,
				fixture.candidates, fixture.verifiers, testLimits(), testVerifierLimits(),
			); err == nil {
				t.Fatalf("BindDataset accepted %s held answer", name)
			}
		})
	}
}

func TestRequestSetAndVerifierSnapshotTheirSeparateInputs(t *testing.T) {
	t.Parallel()
	fixture := newImportFixture(t, clrsfixture.TaskSegmentsIntersect)
	originalPrompt := fixture.candidates.Examples[0].Prompt
	originalAnswer := fixture.verifiers.Examples[0].Reference
	requestSet, verifier := bindFixture(t, fixture, testLimits(), testVerifierLimits())
	fixture.candidates.Examples[0].Prompt = "mutated"
	fixture.verifiers.Examples[0].Reference = "mutated"

	requests, err := requestSet.Requests(verticalNow.Add(-time.Second), verticalNow.Add(time.Second))
	if err != nil {
		t.Fatal(err)
	}
	requests[0].Payload[0] = 'X'
	fresh, err := requestSet.Requests(verticalNow.Add(-time.Second), verticalNow.Add(time.Second))
	if err != nil {
		t.Fatal(err)
	}
	if string(fresh[0].Payload) != originalPrompt {
		t.Fatalf("fresh request payload = %q, want original prompt", fresh[0].Payload)
	}
	invocation, candidate := verificationInputs(fresh[0], []byte(originalAnswer))
	verification, err := verifier.Verify(context.Background(), invocation, candidate)
	if err != nil || verification.Verdict != specialistcontrol.VerificationExact {
		t.Fatalf("Verify(snapshot) = %#v, error %v", verification, err)
	}

	for name, window := range map[string][2]time.Time{
		"zero issued":   {{}, verticalNow},
		"zero deadline": {verticalNow, {}},
		"equal":         {verticalNow, verticalNow},
		"reverse":       {verticalNow, verticalNow.Add(-time.Second)},
	} {
		if _, err := requestSet.Requests(window[0], window[1]); err == nil {
			t.Fatalf("Requests accepted %s window", name)
		}
	}
	if _, err := (RequestSet{}).Requests(verticalNow, verticalNow.Add(time.Second)); err == nil {
		t.Fatal("zero RequestSet produced requests")
	}
}

func TestVerifierRejectsSubstitutionAndInvalidBindings(t *testing.T) {
	t.Parallel()
	fixture := newImportFixture(t, clrsfixture.TaskSegmentsIntersect)
	requestSet, verifier := bindFixture(t, fixture, testLimits(), testVerifierLimits())
	requests, err := requestSet.Requests(verticalNow.Add(-time.Second), verticalNow.Add(time.Second))
	if err != nil {
		t.Fatal(err)
	}
	answer := []byte(fixture.verifiers.Examples[0].Reference)
	invocation, candidate := verificationInputs(requests[0], answer)
	if verification, err := verifier.Verify(context.Background(), invocation, candidate); err != nil ||
		verification.Verdict != specialistcontrol.VerificationExact {
		t.Fatalf("baseline verification = %#v, error %v", verification, err)
	}

	invocationMutations := []struct {
		name   string
		mutate func(*specialistcontrol.Invocation)
	}{
		{"run", func(value *specialistcontrol.Invocation) { value.RunID = "run-foreign" }},
		{"candidate identity", func(value *specialistcontrol.Invocation) { value.RequestID = requests[1].RequestID }},
		{"prompt", func(value *specialistcontrol.Invocation) { value.Payload[0] = 'X' }},
		{"task", func(value *specialistcontrol.Invocation) { value.Task = specialistcontrol.TaskInsertionSort }},
		{"binding", func(value *specialistcontrol.Invocation) { value.Binding[0]++ }},
	}
	for _, test := range invocationMutations {
		changed := invocation
		changed.Payload = append([]byte(nil), invocation.Payload...)
		test.mutate(&changed)
		if _, err := verifier.Verify(context.Background(), changed, candidate); err == nil {
			t.Fatalf("Verify accepted %s substitution", test.name)
		}
	}
	candidateMutations := []struct {
		name   string
		mutate func(*specialistcontrol.Candidate)
	}{
		{"zero binding", func(value *specialistcontrol.Candidate) { value.Binding = specialistcontrol.Binding{} }},
		{"zero candidate binding", func(value *specialistcontrol.Candidate) {
			value.CandidateBinding = specialistcontrol.CandidateBinding{}
		}},
		{"foreign specialist", func(value *specialistcontrol.Candidate) { value.SpecialistID = "foreign" }},
		{"wrong state", func(value *specialistcontrol.Candidate) { value.State = specialistcontrol.ResultAbstained }},
		{"empty answer", func(value *specialistcontrol.Candidate) { value.Payload = nil }},
	}
	for _, test := range candidateMutations {
		changed := candidate
		test.mutate(&changed)
		if _, err := verifier.Verify(context.Background(), invocation, changed); err == nil {
			t.Fatalf("Verify accepted %s", test.name)
		}
	}
	cancelled := &cancelAfterChecksContext{Context: context.Background(), cancelAt: 3}
	if _, err := verifier.Verify(cancelled, invocation, candidate); !errors.Is(err, context.Canceled) {
		t.Fatalf("Verify(mid-parse cancellation) error = %v, want context.Canceled", err)
	}
	if _, err := verifier.Verify(nil, invocation, candidate); err == nil {
		t.Fatal("Verify accepted nil context")
	}
}

func TestBindDatasetClosesIdentityParserAndReferenceBounds(t *testing.T) {
	t.Parallel()
	fixture := newImportFixture(t, clrsfixture.TaskSegmentsIntersect)
	tests := []struct {
		name             string
		runID            string
		specialistID     string
		limits           Limits
		verifierLimits   VerifierLimits
		wantReferenceErr bool
	}{
		{"empty run", "", testSpecialistID, testLimits(), testVerifierLimits(), false},
		{"bad specialist", testRunID, "bad specialist", testLimits(), testVerifierLimits(), false},
		{"open reference count", testRunID, testSpecialistID, testLimits(), VerifierLimits{MaxReferenceBytes: 1024}, true},
		{"small reference count", testRunID, testSpecialistID, testLimits(), VerifierLimits{MaxReferences: 2, MaxReferenceBytes: 16 << 10}, true},
		{"small reference bytes", testRunID, testSpecialistID, testLimits(), VerifierLimits{MaxReferences: 16, MaxReferenceBytes: 1}, true},
		{"small token bound", testRunID, testSpecialistID, withLimits(func(value *Limits) { value.MaxTokenBytes = 3 }), testVerifierLimits(), false},
		{"small prompt bound", testRunID, testSpecialistID, withLimits(func(value *Limits) { value.MaxPromptBytes = 16 }), testVerifierLimits(), false},
		{"small answer bound", testRunID, testSpecialistID, withLimits(func(value *Limits) { value.MaxAnswerBytes = 2 }), testVerifierLimits(), false},
	}
	for _, test := range tests {
		test := test
		t.Run(test.name, func(t *testing.T) {
			_, _, err := BindDataset(
				test.runID, test.specialistID, fixture.source, fixture.contract,
				fixture.candidates, fixture.verifiers, test.limits, test.verifierLimits,
			)
			if err == nil {
				t.Fatalf("BindDataset accepted %s", test.name)
			}
			if test.wantReferenceErr && !errors.Is(err, ErrReferenceLimit) {
				t.Fatalf("BindDataset(%s) error = %v, want ErrReferenceLimit", test.name, err)
			}
		})
	}
}

func TestSegmentVerticalRecordsBeforeEffectAndKeepsReferenceOutOfSpecialist(t *testing.T) {
	t.Parallel()
	runner, events, request, reference := verticalRunner(t, nil)
	run, err := runner.Run(context.Background(), request)
	if err != nil {
		t.Fatal(err)
	}
	if run.Decision.State != specialistcontrol.DecisionInvoke ||
		run.Outcome.State != specialistcontrol.OutcomeVerified ||
		run.Outcome.Authority != specialistcontrol.ResultAuthority ||
		!bytes.Equal(run.Outcome.Payload, reference) {
		t.Fatalf("vertical outcome = %#v", run)
	}
	if !reflect.DeepEqual(*events, []string{"record", "invoke", "verify"}) {
		t.Fatalf("effect order = %v, want record/invoke/verify", *events)
	}
}

func TestSegmentVerticalRefusesMalformedAndOversizedInputBeforeVerification(t *testing.T) {
	t.Parallel()
	fixture := newImportFixture(t, clrsfixture.TaskSegmentsIntersect)
	requestSet, verifier := bindFixture(t, fixture, testLimits(), testVerifierLimits())
	requests, err := requestSet.Requests(verticalNow.Add(-time.Second), verticalNow.Add(time.Second))
	if err != nil {
		t.Fatal(err)
	}
	for name, setup := range map[string]struct {
		prompt []byte
		limits Limits
	}{
		"malformed": {[]byte("segments_intersect:\nx: [0.1 0.2], y: [0.1 0.2]\nintersect:\n"), testLimits()},
		"oversized": {[]byte(pinnedSeed3Prompt), withLimits(func(value *Limits) { value.MaxPromptBytes = 16 })},
	} {
		name, setup := name, setup
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			specialist, err := NewSpecialist(testSpecialistID, setup.limits)
			if err != nil {
				t.Fatal(err)
			}
			verifierCalled := false
			observedVerifier := verifierFunc(func(
				ctx context.Context,
				invocation specialistcontrol.Invocation,
				candidate specialistcontrol.Candidate,
			) (specialistcontrol.Verification, error) {
				verifierCalled = true
				return verifier.Verify(ctx, invocation, candidate)
			})
			runner := newVerticalRunner(
				t, specialist,
				recorderFunc(func(context.Context, specialistcontrol.Decision) error { return nil }),
				observedVerifier, func() time.Time { return verticalNow },
			)
			request := requests[0]
			request.Payload = setup.prompt
			run, runErr := runner.Run(context.Background(), request)
			if runErr != nil || verifierCalled || run.Outcome.State != specialistcontrol.OutcomeRefused ||
				run.Outcome.Reason != specialistcontrol.ReasonSpecialistRefused ||
				run.Outcome.Authority != specialistcontrol.ResultAuthority {
				t.Fatalf("Run(%s) error/verifier/outcome = %v/%t/%#v", name, runErr, verifierCalled, run.Outcome)
			}
		})
	}
}

func TestSegmentVerticalTypesCancellationAndDeadlineAsNoResult(t *testing.T) {
	t.Parallel()
	t.Run("cancelled", func(t *testing.T) {
		t.Parallel()
		runner, _, request, _ := verticalRunner(t, nil)
		ctx, cancel := context.WithCancel(context.Background())
		cancel()
		run, err := runner.Run(ctx, request)
		if !errors.Is(err, context.Canceled) || run.Outcome.State != specialistcontrol.OutcomeAbstained ||
			run.Outcome.Reason != specialistcontrol.ReasonCancelled ||
			run.Outcome.Authority != specialistcontrol.ResultAuthority {
			t.Fatalf("cancelled outcome/error = %#v/%v", run.Outcome, err)
		}
	})

	t.Run("deadline", func(t *testing.T) {
		t.Parallel()
		fixture := newImportFixture(t, clrsfixture.TaskSegmentsIntersect)
		requestSet, verifier := bindFixture(t, fixture, testLimits(), testVerifierLimits())
		requests, err := requestSet.Requests(verticalNow.Add(-time.Second), verticalNow.Add(time.Second))
		if err != nil {
			t.Fatal(err)
		}
		specialist, err := NewSpecialist(testSpecialistID, testLimits())
		if err != nil {
			t.Fatal(err)
		}
		calls := 0
		clock := func() time.Time {
			calls++
			if calls == 2 {
				return requests[0].Deadline
			}
			return verticalNow
		}
		invoked := false
		runner := newVerticalRunner(
			t,
			specialistFunc(func(ctx context.Context, invocation specialistcontrol.Invocation) (specialistcontrol.SpecialistResult, error) {
				invoked = true
				return specialist.Invoke(ctx, invocation)
			}),
			recorderFunc(func(context.Context, specialistcontrol.Decision) error { return nil }),
			verifier, clock,
		)
		run, runErr := runner.Run(context.Background(), requests[0])
		if runErr != nil || invoked || run.Outcome.State != specialistcontrol.OutcomeAbstained ||
			run.Outcome.Reason != specialistcontrol.ReasonDeadlineElapsed ||
			run.Outcome.Authority != specialistcontrol.ResultAuthority {
			t.Fatalf("deadline outcome/error/invoked = %#v/%v/%t", run.Outcome, runErr, invoked)
		}
	})
}

func TestSegmentVerticalAbstainsOnWrongAnswer(t *testing.T) {
	t.Parallel()
	fixture := newImportFixture(t, clrsfixture.TaskSegmentsIntersect)
	requestSet, verifier := bindFixture(t, fixture, testLimits(), testVerifierLimits())
	requests, err := requestSet.Requests(verticalNow.Add(-time.Second), verticalNow.Add(time.Second))
	if err != nil {
		t.Fatal(err)
	}
	wrong := specialistFunc(func(_ context.Context, invocation specialistcontrol.Invocation) (specialistcontrol.SpecialistResult, error) {
		return specialistcontrol.SpecialistResult{
			Binding: invocation.Binding, SpecialistID: testSpecialistID,
			State: specialistcontrol.ResultCompleted, Payload: []byte(falseAnswer),
		}, nil
	})
	runner := newVerticalRunner(
		t, wrong,
		recorderFunc(func(context.Context, specialistcontrol.Decision) error { return nil }),
		verifier, func() time.Time { return verticalNow },
	)
	run, runErr := runner.Run(context.Background(), requests[0])
	if runErr != nil || run.Outcome.State != specialistcontrol.OutcomeAbstained ||
		run.Outcome.Reason != specialistcontrol.ReasonVerificationMismatch ||
		run.Outcome.Authority != specialistcontrol.ResultAuthority || len(run.Outcome.Payload) != 0 {
		t.Fatalf("wrong-answer outcome/error = %#v/%v", run.Outcome, runErr)
	}
}

func TestSpecialistRefusesWrongTaskBindingAndResultCap(t *testing.T) {
	t.Parallel()
	specialist, err := NewSpecialist(testSpecialistID, testLimits())
	if err != nil {
		t.Fatal(err)
	}
	base := specialistcontrol.Invocation{
		Task: specialistcontrol.TaskSegmentsIntersect, Binding: specialistcontrol.Binding{1},
		Payload: []byte(pinnedSeed3Prompt), MaxResultBytes: len(trueAnswer),
	}
	for name, mutate := range map[string]func(*specialistcontrol.Invocation){
		"wrong task":       func(value *specialistcontrol.Invocation) { value.Task = specialistcontrol.TaskInsertionSort },
		"zero binding":     func(value *specialistcontrol.Invocation) { value.Binding = specialistcontrol.Binding{} },
		"zero result cap":  func(value *specialistcontrol.Invocation) { value.MaxResultBytes = 0 },
		"small result cap": func(value *specialistcontrol.Invocation) { value.MaxResultBytes = len(trueAnswer) - 1 },
	} {
		invocation := base
		mutate(&invocation)
		result, err := specialist.Invoke(context.Background(), invocation)
		if err != nil || result.State != specialistcontrol.ResultRefused || len(result.Payload) != 0 {
			t.Fatalf("Invoke(%s) = %#v, error %v", name, result, err)
		}
	}
	if _, err := NewSpecialist("bad specialist", testLimits()); err == nil {
		t.Fatal("NewSpecialist accepted invalid identity")
	}
	if _, err := specialist.Invoke(nil, base); err == nil {
		t.Fatal("Invoke accepted nil context")
	}
}

func verticalRunner(
	t *testing.T,
	clock func() time.Time,
) (specialistcontrol.Runner, *[]string, specialistcontrol.Request, []byte) {
	t.Helper()
	if clock == nil {
		clock = func() time.Time { return verticalNow }
	}
	fixture := newImportFixture(t, clrsfixture.TaskSegmentsIntersect)
	requestSet, verifier := bindFixture(t, fixture, testLimits(), testVerifierLimits())
	requests, err := requestSet.Requests(verticalNow.Add(-time.Second), verticalNow.Add(time.Second))
	if err != nil {
		t.Fatal(err)
	}
	reference := []byte(fixture.verifiers.Examples[0].Reference)
	specialist, err := NewSpecialist(testSpecialistID, testLimits())
	if err != nil {
		t.Fatal(err)
	}
	events := make([]string, 0, 3)
	observedSpecialist := specialistFunc(func(
		ctx context.Context,
		invocation specialistcontrol.Invocation,
	) (specialistcontrol.SpecialistResult, error) {
		events = append(events, "invoke")
		if bytes.Contains(invocation.Payload, reference) {
			t.Fatal("verifier-only reference bytes leaked into the specialist request")
		}
		return specialist.Invoke(ctx, invocation)
	})
	observedVerifier := verifierFunc(func(
		ctx context.Context,
		invocation specialistcontrol.Invocation,
		candidate specialistcontrol.Candidate,
	) (specialistcontrol.Verification, error) {
		events = append(events, "verify")
		return verifier.Verify(ctx, invocation, candidate)
	})
	runner := newVerticalRunner(
		t, observedSpecialist,
		recorderFunc(func(context.Context, specialistcontrol.Decision) error {
			events = append(events, "record")
			return nil
		}),
		observedVerifier, clock,
	)
	return runner, &events, requests[0], reference
}

func newVerticalRunner(
	t *testing.T,
	target specialistcontrol.Specialist,
	recorder specialistcontrol.DecisionRecorder,
	verifier specialistcontrol.ExactVerifier,
	clock func() time.Time,
) specialistcontrol.Runner {
	t.Helper()
	routes := make([]specialistcontrol.Route, 0, len(specialistcontrol.Tasks()))
	observations := make([]specialistcontrol.ReadinessObservation, 0, len(specialistcontrol.Tasks()))
	specialists := make(map[string]specialistcontrol.Specialist, len(specialistcontrol.Tasks()))
	for _, task := range specialistcontrol.Tasks() {
		id := "unavailable-" + string(task)
		if task == specialistcontrol.TaskSegmentsIntersect {
			id = testSpecialistID
			specialists[id] = target
		} else {
			specialists[id] = specialistFunc(func(
				_ context.Context,
				invocation specialistcontrol.Invocation,
			) (specialistcontrol.SpecialistResult, error) {
				return specialistcontrol.SpecialistResult{
					Binding: invocation.Binding, SpecialistID: "unavailable-" + string(invocation.Task),
					State: specialistcontrol.ResultAbstained,
				}, nil
			})
		}
		routes = append(routes, specialistcontrol.Route{Task: task, SpecialistID: id})
		observations = append(observations, specialistcontrol.ReadinessObservation{
			SpecialistID: id, State: specialistcontrol.ReadinessReady,
			ObservedAt: verticalNow.Add(-time.Second), ValidFor: 2 * time.Second,
			Fits: []specialistcontrol.RequestFit{{Task: task, State: specialistcontrol.FitTaskCompatible}},
		})
	}
	policy, err := specialistcontrol.NewPolicy(specialistcontrol.Limits{
		MaxRequestBytes:   64 << 10,
		MaxResultBytes:    8 << 10,
		MaxRequestAge:     2 * time.Second,
		MaxExecution:      2 * time.Second,
		MaxDecisionRecord: 100 * time.Millisecond,
	}, routes)
	if err != nil {
		t.Fatal(err)
	}
	admission, err := specialistcontrol.NewAdmission(policy, specialistcontrol.AdmissionLimits{
		MaxObservationValidity: 2 * time.Second, MaxQueueDepth: 2, MaxWait: time.Second,
		MaxRetries: 1, MaxConcurrencyPerSpecialist: 1, MaxTotalPending: 12, MaxTotalActive: 6,
	}, observations, verticalNow)
	if err != nil {
		t.Fatal(err)
	}
	runner, err := specialistcontrol.NewRunner(policy, admission, recorder, specialists, verifier, clock)
	if err != nil {
		t.Fatal(err)
	}
	return runner
}

type testExample struct {
	prompt    string
	reference string
	length    int64
	seed      int64
	useHints  bool
}

type testDataset struct {
	name     string
	examples []testExample
}

type importFixture struct {
	source     clrsfixture.SourceRecord
	contract   clrsfixture.GenerationContract
	task       clrsfixture.TaskPlan
	dataset    testDataset
	candidates clrsfixture.CandidateSet
	verifiers  clrsfixture.VerifierSet
}

func newImportFixture(t *testing.T, task clrsfixture.TaskKind) importFixture {
	t.Helper()
	sourceBody := readGeneratorFile(t, "upstream.json")
	source, err := clrsfixture.ParseSourceRecord(sourceBody)
	if err != nil {
		t.Fatal(err)
	}
	contractBody := readGeneratorFile(t, "contract.json")
	contract, err := clrsfixture.ParseGenerationContract(contractBody, source)
	if err != nil {
		t.Fatal(err)
	}
	plan, err := contract.Plan(source)
	if err != nil {
		t.Fatal(err)
	}
	var selected clrsfixture.TaskPlan
	for _, candidate := range plan.Tasks {
		if candidate.Task == task {
			selected = candidate
			break
		}
	}
	if selected.Task == "" {
		t.Fatalf("task %s is absent from tracked contract", task)
	}
	fixture := importFixture{
		source: source, contract: contract, task: selected,
		dataset: makeTestDataset(plan, selected),
	}
	fixture.importDataset(t)
	return fixture
}

func (fixture *importFixture) importDataset(t *testing.T) {
	t.Helper()
	body, err := json.Marshal(fixture.dataset.jsonValue())
	if err != nil {
		t.Fatal(err)
	}
	fixture.candidates, fixture.verifiers, err = clrsfixture.ImportDataset(
		bytes.NewReader(body),
		fixture.source,
		fixture.contract,
		fixture.task.OutputRelativePath,
		testImportLimits(),
	)
	if err != nil {
		t.Fatalf("import synthetic contract-bound %s dataset: %v", fixture.task.Task, err)
	}
}

func makeTestDataset(plan clrsfixture.GenerationPlan, task clrsfixture.TaskPlan) testDataset {
	dataset := testDataset{name: "clrs_text_" + string(task.Task)}
	for _, size := range task.Sizes {
		for _, seed := range plan.Seeds {
			for sample := 0; sample < plan.SamplesPerCell; sample++ {
				prompt := fmt.Sprintf("%s:\ninput: %d/%d/%d", task.Task, size.RequestedLength, seed, sample)
				reference := fmt.Sprintf("reference-%d-%d-%d", size.RequestedLength, seed, sample)
				if task.Task == clrsfixture.TaskSegmentsIntersect {
					prompt, reference = segmentExample(seed)
				}
				dataset.examples = append(dataset.examples, testExample{
					prompt: prompt, reference: reference,
					length: size.RequestedLength, seed: seed, useHints: plan.UseHints,
				})
			}
		}
	}
	return dataset
}

func (dataset testDataset) jsonValue() map[string]any {
	examples := make([]any, 0, len(dataset.examples))
	for _, example := range dataset.examples {
		examples = append(examples, map[string]any{
			"prompt":     example.prompt,
			"references": []string{example.reference},
			"auxiliary": map[string]any{
				"length": example.length, "seed": example.seed, "use_hints": example.useHints,
			},
		})
	}
	return map[string]any{"name": dataset.name, "examples": examples}
}

func segmentExample(seed int64) (string, string) {
	switch seed {
	case 3:
		return pinnedSeed3Prompt, trueAnswer
	case 14:
		return geometryPrompt(
			"0.257592 0.701151 0.657 0.182007",
			"0.322062 0.887537 0.083349 0.746564",
		), trueAnswer
	case 35:
		return geometryPrompt(
			"0.988724 0.750084 0.222386 0.147903",
			"0.51579 0.394258 0.06988 0.338225",
		), falseAnswer
	default:
		panic(fmt.Sprintf("unrecognised fixed segment seed %d", seed))
	}
}

func readGeneratorFile(t *testing.T, name string) []byte {
	t.Helper()
	_, filename, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("locate segment-intersection adapter test")
	}
	body, err := os.ReadFile(filepath.Join(filepath.Dir(filename), "..", "..", "clrs-generator", name))
	if err != nil {
		t.Fatal(err)
	}
	return body
}

func bindFixture(
	t *testing.T,
	fixture importFixture,
	limits Limits,
	verifierLimits VerifierLimits,
) (RequestSet, Verifier) {
	t.Helper()
	requestSet, verifier, err := BindDataset(
		testRunID,
		testSpecialistID,
		fixture.source,
		fixture.contract,
		fixture.candidates,
		fixture.verifiers,
		limits,
		verifierLimits,
	)
	if err != nil {
		t.Fatal(err)
	}
	return requestSet, verifier
}

func verificationInputs(
	request specialistcontrol.Request,
	answer []byte,
) (specialistcontrol.Invocation, specialistcontrol.Candidate) {
	invocation := specialistcontrol.Invocation{
		RunID: request.RunID, RequestID: request.RequestID, Task: request.Task,
		Payload: append([]byte(nil), request.Payload...), Binding: specialistcontrol.Binding{1},
		Deadline: request.Deadline, MaxResultBytes: 8 << 10,
	}
	candidate := specialistcontrol.Candidate{
		Binding: invocation.Binding, CandidateBinding: specialistcontrol.CandidateBinding{1},
		SpecialistID: testSpecialistID, State: specialistcontrol.ResultCompleted,
		Payload: append([]byte(nil), answer...),
	}
	return invocation, candidate
}

func cloneCandidateSet(set clrsfixture.CandidateSet) clrsfixture.CandidateSet {
	set.Examples = append([]clrsfixture.CandidateExample(nil), set.Examples...)
	return set
}

func cloneVerifierSet(set clrsfixture.VerifierSet) clrsfixture.VerifierSet {
	set.Examples = append([]clrsfixture.VerifierExample(nil), set.Examples...)
	return set
}

func cloneContract(contract clrsfixture.GenerationContract) clrsfixture.GenerationContract {
	contract.Seeds = append([]int64(nil), contract.Seeds...)
	contract.Tasks = append([]clrsfixture.GenerationTask(nil), contract.Tasks...)
	for index := range contract.Tasks {
		contract.Tasks[index].Sizes = append([]clrsfixture.SizeSelection(nil), contract.Tasks[index].Sizes...)
	}
	return contract
}

func testImportLimits() clrsfixture.ImportLimits {
	return clrsfixture.ImportLimits{
		MaxDatasetBytes: 1 << 20, MaxExamples: 16,
		MaxPromptBytes: 64 << 10, MaxReferenceBytes: 8 << 10, MaxDeclaredLength: 64,
	}
}

func testVerifierLimits() VerifierLimits {
	return VerifierLimits{MaxReferences: 16, MaxReferenceBytes: 16 << 10}
}

func withLimits(change func(*Limits)) Limits {
	limits := testLimits()
	change(&limits)
	return limits
}
