package specialistcontrol

import (
	"encoding/hex"
	"testing"
	"time"
)

// The digests were recorded from the stream-writing implementation before
// the bindings moved to one appended buffer; they must never change.
const (
	goldenRequestBinding   = "b0d663c4e138673634094c2f686100ab06f93e96544877d6be2e439cf3222046"
	goldenCandidateBinding = "305101c242d31ec91744b0a6c8809432adfc86b538efbfdaab6d07d48a327449"
	goldenEmptyBinding     = "db31fe0bad84322de036ea4b6178cd5b96b745cdbd740b9108dfb1ab9fcc09b4"
)

func goldenBindingInputs() (Request, AdmissionDecision, time.Time) {
	base := time.Date(2026, time.October, 18, 12, 0, 0, 123456789, time.UTC)
	request := Request{
		RunID: "run-1", RequestID: "request-1", Task: TaskKind("clrs"),
		Payload: []byte("payload"), IssuedAt: base, Deadline: base.Add(time.Minute),
	}
	admission := AdmissionDecision{
		State: AdmissionState("admitted"), Reason: AdmissionReason("fit"), Authority: "NO_RESULT",
		SpecialistID: "specialist-a", Fit: FitState("fits"), FitMeasurementBasis: "basis",
		FitMeasuredAt: base.Add(-time.Hour), FitValidUntil: base.Add(time.Hour), Readiness: ReadinessState("ready"),
		ObservedAt: base.Add(-time.Second), ValidUntil: base.Add(time.Second), QueuedAt: base,
		DecidedAt: base.Add(2 * time.Second), Attempts: 3, DeclaredCost: 1 << 63,
	}
	return request, admission, base.Add(3 * time.Second)
}

func TestBindingDigestsStayByteIdentical(t *testing.T) {
	request, admission, decidedAt := goldenBindingInputs()
	binding := bindRequest(request, "specialist-a", decidedAt, admission)
	if got := hex.EncodeToString(binding[:]); got != goldenRequestBinding {
		t.Fatalf("request binding = %s, want %s", got, goldenRequestBinding)
	}
	candidate := bindCandidate(binding, "specialist-a", ResultState("candidate"), []byte("answer"))
	if got := hex.EncodeToString(candidate[:]); got != goldenCandidateBinding {
		t.Fatalf("candidate binding = %s, want %s", got, goldenCandidateBinding)
	}
}

func TestEmptyBindingInputsStayByteIdentical(t *testing.T) {
	binding := bindRequest(Request{}, "", time.Time{}, AdmissionDecision{})
	if got := hex.EncodeToString(binding[:]); got != goldenEmptyBinding {
		t.Fatalf("empty request binding = %s, want %s", got, goldenEmptyBinding)
	}
}

func TestBindingSeparatesAdjacentFields(t *testing.T) {
	request, admission, decidedAt := goldenBindingInputs()
	shifted := request
	shifted.RunID, shifted.RequestID = request.RunID+request.RequestID[:1], request.RequestID[1:]
	if bindRequest(request, "specialist-a", decidedAt, admission) == bindRequest(shifted, "specialist-a", decidedAt, admission) {
		t.Fatal("moving one byte between adjacent fields kept the request binding")
	}
	binding := bindRequest(request, "specialist-a", decidedAt, admission)
	if bindCandidate(binding, "ab", ResultState("c"), nil) == bindCandidate(binding, "a", ResultState("bc"), nil) {
		t.Fatal("moving one byte between adjacent fields kept the candidate binding")
	}
}
