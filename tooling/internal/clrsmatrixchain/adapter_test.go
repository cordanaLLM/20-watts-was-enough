package clrsmatrixchain

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"os"
	"path/filepath"
	"reflect"
	"runtime"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/clrsfixture"
	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/specialistcontrol"
)

const (
	testRunID        = "run-001"
	testSpecialistID = "exact-matrix-chain-v1"
)

var verticalNow = time.Date(2099, time.August, 31, 12, 0, 0, 0, time.UTC)

type recorderFunc func(context.Context, specialistcontrol.Decision) error

func (function recorderFunc) RecordDecision(ctx context.Context, decision specialistcontrol.Decision) error {
	return function(ctx, decision)
}

type specialistFunc func(context.Context, specialistcontrol.Invocation) (specialistcontrol.SpecialistResult, error)

func (function specialistFunc) Invoke(ctx context.Context, invocation specialistcontrol.Invocation) (specialistcontrol.SpecialistResult, error) {
	return function(ctx, invocation)
}

type verifierFunc func(context.Context, specialistcontrol.Invocation, specialistcontrol.Candidate) (specialistcontrol.Verification, error)

func (function verifierFunc) Verify(ctx context.Context, invocation specialistcontrol.Invocation, candidate specialistcontrol.Candidate) (specialistcontrol.Verification, error) {
	return function(ctx, invocation, candidate)
}

func TestBindDatasetBuildsContractBoundRequestsAndIsolatesReferences(t *testing.T) {
	t.Parallel()
	fixture := newImportFixture(t, clrsfixture.TaskMatrixChainOrder)
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
	requests, err := requestSet.Requests(verticalNow.Add(-time.Second), verticalNow.Add(time.Second))
	if err != nil {
		t.Fatal(err)
	}
	if len(requests) != fixture.task.ExpectedExamples {
		t.Fatalf("request count = %d, want %d", len(requests), fixture.task.ExpectedExamples)
	}
	for index, request := range requests {
		candidate := fixture.candidates.Examples[index]
		if request.RunID != testRunID || request.RequestID != candidate.ID.String() ||
			request.Task != specialistcontrol.TaskMatrixChainOrder ||
			!bytes.Equal(request.Payload, []byte(candidate.Prompt)) {
			t.Fatalf("request %d = %#v, candidate %#v", index, request, candidate)
		}
		key := referenceKey{runID: testRunID, requestID: request.RequestID}
		held, present := verifier.references[key]
		expectedVerifier := fixture.verifiers.Examples[index]
		if !present || held.source != candidate.Source || held.contract != candidate.Contract ||
			held.candidateID != candidate.ID || held.verifierID != expectedVerifier.ID ||
			held.effectiveInputSize != candidate.EffectiveInputSize ||
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

func TestSpecialistMatchesEveryContractBoundSyntheticCell(t *testing.T) {
	t.Parallel()
	fixture := newImportFixture(t, clrsfixture.TaskMatrixChainOrder)
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

func TestBindDatasetRejectsForeignAndTamperedContractRecords(t *testing.T) {
	t.Parallel()
	matrix := newImportFixture(t, clrsfixture.TaskMatrixChainOrder)
	insertion := newImportFixture(t, clrsfixture.TaskInsertionSort)
	if _, _, err := BindDataset(
		testRunID,
		testSpecialistID,
		insertion.source,
		insertion.contract,
		insertion.candidates,
		insertion.verifiers,
		testLimits(),
		testVerifierLimits(),
	); err == nil {
		t.Fatal("BindDataset accepted a valid foreign task set")
	}

	tests := []struct {
		name   string
		mutate func(*clrsfixture.CandidateSet, *clrsfixture.VerifierSet)
	}{
		{"candidate identity", func(c *clrsfixture.CandidateSet, _ *clrsfixture.VerifierSet) { c.Examples[0].ID[0] ^= 1 }},
		{"candidate prompt", func(c *clrsfixture.CandidateSet, _ *clrsfixture.VerifierSet) { c.Examples[0].Prompt += " mutation" }},
		{"candidate task", func(c *clrsfixture.CandidateSet, _ *clrsfixture.VerifierSet) {
			c.Examples[0].Task = clrsfixture.TaskInsertionSort
		}},
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
	for _, test := range tests {
		test := test
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()
			candidates := cloneCandidateSet(matrix.candidates)
			verifiers := cloneVerifierSet(matrix.verifiers)
			test.mutate(&candidates, &verifiers)
			if _, _, err := BindDataset(
				testRunID,
				testSpecialistID,
				matrix.source,
				matrix.contract,
				candidates,
				verifiers,
				testLimits(),
				testVerifierLimits(),
			); err == nil {
				t.Fatalf("BindDataset accepted %s", test.name)
			}
		})
	}

	foreignSource := matrix.source
	foreignSource.Commit = "a" + foreignSource.Commit[1:]
	if _, _, err := BindDataset(
		testRunID, testSpecialistID, foreignSource, matrix.contract,
		matrix.candidates, matrix.verifiers, testLimits(), testVerifierLimits(),
	); err == nil {
		t.Fatal("BindDataset accepted a source record outside the pinned matrix-chain evidence")
	}
	foreignContract := matrix.contract
	foreignContract.Seeds = append([]int64(nil), matrix.contract.Seeds...)
	foreignContract.Seeds[0]++
	if _, _, err := BindDataset(
		testRunID, testSpecialistID, matrix.source, foreignContract,
		matrix.candidates, matrix.verifiers, testLimits(), testVerifierLimits(),
	); err == nil {
		t.Fatal("BindDataset accepted a mutated generation contract")
	}
}

func TestBindDatasetRejectsPromptSemanticsMissingFromTheGenericImporter(t *testing.T) {
	t.Parallel()
	tests := []struct {
		name   string
		mutate func(*testExample)
	}{
		{"effective input size mismatch", func(example *testExample) {
			example.prompt, example.reference = matrixExample(3, example.seed)
		}},
		{"hint-bearing prompt", func(example *testExample) { example.prompt += "hint:\n" }},
		{"wrong input marker", func(example *testExample) {
			example.prompt = strings.Replace(example.prompt, "\np: [", "\nkey: [", 1)
		}},
		{"wrong output marker", func(example *testExample) {
			example.prompt = strings.Replace(example.prompt, "\ns:\n", "\nm:\n", 1)
		}},
	}
	for _, test := range tests {
		test := test
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()
			fixture := newImportFixture(t, clrsfixture.TaskMatrixChainOrder)
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
	tests := []struct {
		name   string
		mutate func(*testExample)
	}{
		{"wrong shape", func(example *testExample) { example.reference = "1\n\n" }},
		{"leading zero", func(example *testExample) { example.reference = "00\n\n" }},
		{"out of range", func(example *testExample) { example.reference = "99\n\n" }},
		{"foreign syntax", func(example *testExample) { example.reference = "[0]\n\n" }},
	}
	for _, test := range tests {
		test := test
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()
			fixture := newImportFixture(t, clrsfixture.TaskMatrixChainOrder)
			test.mutate(&fixture.dataset.examples[0])
			fixture.importDataset(t)
			if _, _, err := BindDataset(
				testRunID, testSpecialistID, fixture.source, fixture.contract,
				fixture.candidates, fixture.verifiers, testLimits(), testVerifierLimits(),
			); err == nil {
				t.Fatalf("BindDataset accepted %s held answer", test.name)
			}
		})
	}
}

func TestRequestSetAndVerifierSnapshotTheirSeparateInputs(t *testing.T) {
	t.Parallel()
	fixture := newImportFixture(t, clrsfixture.TaskMatrixChainOrder)
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

func TestVerifierRejectsRunCandidateAndPromptSubstitution(t *testing.T) {
	t.Parallel()
	fixture := newImportFixture(t, clrsfixture.TaskMatrixChainOrder)
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

	tests := []struct {
		name   string
		mutate func(*specialistcontrol.Invocation)
	}{
		{"run", func(value *specialistcontrol.Invocation) { value.RunID = "run-foreign" }},
		{"candidate identity", func(value *specialistcontrol.Invocation) { value.RequestID = requests[3].RequestID }},
		{"prompt", func(value *specialistcontrol.Invocation) { value.Payload[0] = 'X' }},
	}
	for _, test := range tests {
		test := test
		t.Run(test.name, func(t *testing.T) {
			changed := invocation
			changed.Payload = append([]byte(nil), invocation.Payload...)
			test.mutate(&changed)
			if _, err := verifier.Verify(context.Background(), changed, candidate); err == nil {
				t.Fatalf("Verify accepted %s substitution", test.name)
			}
		})
	}
	cancelled := &cancelAfterChecksContext{Context: context.Background(), cancelAt: 3}
	if _, err := verifier.Verify(cancelled, invocation, candidate); !errors.Is(err, context.Canceled) {
		t.Fatalf("Verify(mid-parse cancellation) error = %v, want context.Canceled", err)
	}
}

func TestBindDatasetClosesRunAndReferenceBounds(t *testing.T) {
	t.Parallel()
	fixture := newImportFixture(t, clrsfixture.TaskMatrixChainOrder)
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
		{"small reference count", testRunID, testSpecialistID, testLimits(), VerifierLimits{MaxReferences: 8, MaxReferenceBytes: 16 << 10}, true},
		{"small reference bytes", testRunID, testSpecialistID, testLimits(), VerifierLimits{MaxReferences: 16, MaxReferenceBytes: 1}, true},
		{"small value count", testRunID, testSpecialistID, withLimits(func(value *Limits) { value.MaxDimensions = 8 }), testVerifierLimits(), false},
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

func TestMatrixChainOrderVerticalRecordsBeforeEffectAndKeepsReferenceOutOfSpecialist(t *testing.T) {
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

func TestMatrixChainOrderVerticalRefusesMalformedAndOversizedInputBeforeVerification(t *testing.T) {
	t.Parallel()
	fixture := newImportFixture(t, clrsfixture.TaskMatrixChainOrder)
	requestSet, verifier := bindFixture(t, fixture, testLimits(), testVerifierLimits())
	requests, err := requestSet.Requests(verticalNow.Add(-time.Second), verticalNow.Add(time.Second))
	if err != nil {
		t.Fatal(err)
	}
	for name, prompt := range map[string][]byte{
		"malformed": []byte("matrix_chain_order:\nkey: [0.3 0.1 0.2]\ns:\n"),
		"oversized": []byte("matrix_chain_order:\np: [0.1 0.2 0.3 0.4]\ns:\n"),
	} {
		name, prompt := name, prompt
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			limits := testLimits()
			limits.MaxDimensions = 3
			specialist, err := NewSpecialist(testSpecialistID, limits)
			if err != nil {
				t.Fatal(err)
			}
			verifierCalled := false
			observedVerifier := verifierFunc(func(ctx context.Context, invocation specialistcontrol.Invocation, candidate specialistcontrol.Candidate) (specialistcontrol.Verification, error) {
				verifierCalled = true
				return verifier.Verify(ctx, invocation, candidate)
			})
			runner := newVerticalRunner(
				t, specialist,
				recorderFunc(func(context.Context, specialistcontrol.Decision) error { return nil }),
				observedVerifier, func() time.Time { return verticalNow },
			)
			request := requests[0]
			request.Payload = prompt
			run, runErr := runner.Run(context.Background(), request)
			if runErr != nil || verifierCalled || run.Outcome.State != specialistcontrol.OutcomeRefused ||
				run.Outcome.Reason != specialistcontrol.ReasonSpecialistRefused ||
				run.Outcome.Authority != specialistcontrol.ResultAuthority {
				t.Fatalf("Run(%s) error/verifier/outcome = %v/%t/%#v", name, runErr, verifierCalled, run.Outcome)
			}
		})
	}
}

func TestMatrixChainOrderVerticalTypesCancellationAndDeadlineAsNoResult(t *testing.T) {
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
		fixture := newImportFixture(t, clrsfixture.TaskMatrixChainOrder)
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

func TestMatrixChainOrderVerticalAbstainsOnWrongAnswer(t *testing.T) {
	t.Parallel()
	fixture := newImportFixture(t, clrsfixture.TaskMatrixChainOrder)
	requestSet, verifier := bindFixture(t, fixture, testLimits(), testVerifierLimits())
	requests, err := requestSet.Requests(verticalNow.Add(-time.Second), verticalNow.Add(time.Second))
	if err != nil {
		t.Fatal(err)
	}
	wrong := specialistFunc(func(_ context.Context, invocation specialistcontrol.Invocation) (specialistcontrol.SpecialistResult, error) {
		return specialistcontrol.SpecialistResult{
			Binding: invocation.Binding, SpecialistID: testSpecialistID,
			State: specialistcontrol.ResultCompleted, Payload: []byte("99\n\n"),
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

func verticalRunner(
	t *testing.T,
	clock func() time.Time,
) (specialistcontrol.Runner, *[]string, specialistcontrol.Request, []byte) {
	t.Helper()
	if clock == nil {
		clock = func() time.Time { return verticalNow }
	}
	fixture := newImportFixture(t, clrsfixture.TaskMatrixChainOrder)
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
	observedSpecialist := specialistFunc(func(ctx context.Context, invocation specialistcontrol.Invocation) (specialistcontrol.SpecialistResult, error) {
		events = append(events, "invoke")
		if bytes.Contains(invocation.Payload, reference) {
			t.Fatal("verifier-only reference bytes leaked into the specialist request")
		}
		return specialist.Invoke(ctx, invocation)
	})
	observedVerifier := verifierFunc(func(ctx context.Context, invocation specialistcontrol.Invocation, candidate specialistcontrol.Candidate) (specialistcontrol.Verification, error) {
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
		if task == specialistcontrol.TaskMatrixChainOrder {
			id = testSpecialistID
			specialists[id] = target
		} else {
			specialists[id] = specialistFunc(func(_ context.Context, invocation specialistcontrol.Invocation) (specialistcontrol.SpecialistResult, error) {
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
		MaxRequestBytes:   1024,
		MaxResultBytes:    1024,
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
				if task.Task == clrsfixture.TaskMatrixChainOrder {
					prompt, reference = matrixExample(size.RequestedLength, seed)
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

func matrixExample(length, seed int64) (string, string) {
	values := make([]string, 0, length)
	dimensions := make([]float64, 0, length)
	for index := int64(0); index < length; index++ {
		raw := (seed*104729+(index+1)*(index+3)*7919)%900000 + 50000
		values = append(values, fmt.Sprintf("0.%06d", raw))
		dimensions = append(dimensions, float64(raw)/1_000_000)
	}
	prompt := "matrix_chain_order:\np: [" + strings.Join(values, " ") + "]\ns:\n"
	return prompt, independentMatrixReference(dimensions)
}

func independentMatrixReference(dimensions []float64) string {
	size := len(dimensions)
	costs := make([][]float64, size)
	splits := make([][]int, size)
	for row := 0; row < size; row++ {
		costs[row] = make([]float64, size)
		splits[row] = make([]int, size)
	}
	for width := 2; width < size; width++ {
		for left := 1; left+width-1 < size; left++ {
			right := left + width - 1
			best := math.Inf(1)
			for split := left; split < right; split++ {
				candidate := costs[left][split] + costs[split+1][right] +
					dimensions[left-1]*dimensions[split]*dimensions[right]
				if candidate < best {
					best = candidate
					splits[left][right] = split
				}
			}
			costs[left][right] = best
		}
	}
	var answer strings.Builder
	answer.WriteByte('[')
	for row := range splits {
		if row > 0 {
			answer.WriteString(", ")
		}
		answer.WriteByte('[')
		for column, split := range splits[row] {
			if column > 0 {
				answer.WriteByte(' ')
			}
			answer.WriteString(strconv.Itoa(split))
		}
		answer.WriteByte(']')
	}
	answer.WriteString("]\n\n")
	return answer.String()
}

func readGeneratorFile(t *testing.T, name string) []byte {
	t.Helper()
	_, filename, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("locate matrix-chain adapter test")
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
		Deadline: request.Deadline, MaxResultBytes: 1024,
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

func testImportLimits() clrsfixture.ImportLimits {
	return clrsfixture.ImportLimits{
		MaxDatasetBytes: 1 << 20, MaxExamples: 16,
		MaxPromptBytes: 512, MaxReferenceBytes: 512, MaxDeclaredLength: 64,
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
