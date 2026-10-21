package specialistcontrol

import "testing"

func TestSelectBestChoicePrefersLowestCostThenLowestID(t *testing.T) {
	for _, testCase := range []struct {
		name    string
		choices []eligibleSpecialist
		want    string
	}{
		{"one choice", []eligibleSpecialist{{id: "b", cost: 9}}, "b"},
		{"lower cost wins", []eligibleSpecialist{{id: "a", cost: 5}, {id: "b", cost: 2}}, "b"},
		{"equal cost falls back to id", []eligibleSpecialist{{id: "c", cost: 3}, {id: "a", cost: 3}, {id: "b", cost: 4}}, "a"},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			if got := selectBestChoice(testCase.choices); got != testCase.want {
				t.Fatalf("selectBestChoice() = %q, want %q", got, testCase.want)
			}
		})
	}
}

func TestUpdateRepresentativeKeepsTheMostWaitableReason(t *testing.T) {
	var representative AdmissionDecision
	updateRepresentative(&representative, AdmissionDecision{})
	if representative.Reason != "" {
		t.Fatalf("empty candidate replaced representative: %q", representative.Reason)
	}
	for _, step := range []struct {
		id              string
		candidate, want AdmissionReason
		wantID          string
	}{
		{"no-fit", AdmissionReasonKnownNoFit, AdmissionReasonKnownNoFit, "no-fit"},
		{"stale", AdmissionReasonStale, AdmissionReasonStale, "stale"},
		{"empty-after-stale", "", AdmissionReasonStale, "stale"},
		{"absent", AdmissionReasonAbsent, AdmissionReasonStale, "stale"},
		{"first-saturated", AdmissionReasonSaturated, AdmissionReasonSaturated, "first-saturated"},
		{"second-saturated", AdmissionReasonSaturated, AdmissionReasonSaturated, "first-saturated"},
		{"empty", "", AdmissionReasonSaturated, "first-saturated"},
	} {
		updateRepresentative(&representative, AdmissionDecision{Reason: step.candidate, SpecialistID: step.id})
		if representative.Reason != step.want || representative.SpecialistID != step.wantID {
			t.Fatalf("after %s representative = %q/%q, want %q/%q",
				step.id, representative.Reason, representative.SpecialistID, step.want, step.wantID)
		}
	}
}
