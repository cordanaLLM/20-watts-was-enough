package clrsfixture

import (
	"fmt"
	"maps"
	"strings"
	"testing"
)

func TestGeneratorPackageCutoffsAcceptReviewedOverride(t *testing.T) {
	t.Parallel()
	input, err := ParseGeneratorLockInput(trackedGeneratorFile(t, "lock-input.json"), trackedSourceRecord(t))
	if err != nil {
		t.Fatal(err)
	}
	if input.Resolver.ExcludeNewer != "2026-08-31T13:22:50Z" ||
		!maps.Equal(input.Resolver.ExcludeNewerPackage, map[string]string{"certifi": "2026-10-21T00:00:00Z", "urllib3": "2026-09-16T00:00:00Z"}) {
		t.Fatalf("unexpected reviewed cutoff policy: %+v", input.Resolver)
	}
}

func TestParseGeneratorLockInputRejectsPackageCutoffDrift(t *testing.T) {
	t.Parallel()
	source := trackedSourceRecord(t)
	input, err := ParseGeneratorLockInput(trackedGeneratorFile(t, "lock-input.json"), source)
	if err != nil {
		t.Fatal(err)
	}
	const cutoff = "2026-09-16T00:00:00Z"
	tests := []struct {
		name    string
		cutoffs map[string]string
		want    string
	}{
		{"missing", nil, "reviewed Linux amd64 boundary"},
		{"empty", map[string]string{}, "reviewed Linux amd64 boundary"},
		{"unknown", map[string]string{"unknown-package": cutoff}, "reviewed Linux amd64 boundary"},
		{"extra known package", map[string]string{"urllib3": cutoff, "requests": cutoff}, "reviewed Linux amd64 boundary"},
		{"extra unknown package", map[string]string{"urllib3": cutoff, "unknown-package": cutoff}, "reviewed Linux amd64 boundary"},
		{"uppercase", map[string]string{"URLLib3": cutoff}, "not canonical"},
		{"underscore", map[string]string{"urllib_3": cutoff}, "not canonical"},
		{"dot", map[string]string{"urllib.3": cutoff}, "not canonical"},
		{"repeated separator", map[string]string{"urllib--3": cutoff}, "not canonical"},
		{"empty name", map[string]string{"": cutoff}, "not canonical"},
		{"invalid name", map[string]string{"urllib3\n[options]": cutoff}, "not canonical"},
		{"invalid date", map[string]string{"urllib3": "2026-09-16"}, "must be RFC3339 and after"},
		{"equal to global", map[string]string{"urllib3": input.Resolver.ExcludeNewer}, "must be RFC3339 and after"},
		{"before global", map[string]string{"urllib3": "2026-08-30T00:00:00Z"}, "must be RFC3339 and after"},
		{"unreviewed date", map[string]string{"urllib3": "2026-09-17T00:00:00Z"}, "reviewed Linux amd64 boundary"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			candidate := input
			candidate.Resolver.ExcludeNewerPackage = tt.cutoffs
			body, err := marshalGenerationJSON(candidate, maximumGeneratorLockInputBytes)
			if err != nil {
				t.Fatal(err)
			}
			_, err = ParseGeneratorLockInput(body, source)
			if err == nil || !strings.Contains(err.Error(), tt.want) {
				t.Fatalf("ParseGeneratorLockInput error = %v, want %q", err, tt.want)
			}
		})
	}
}

func TestGeneratorPackageCutoffEntryLimit(t *testing.T) {
	t.Parallel()
	resolver := GeneratorResolver{ExcludeNewer: "2026-08-31T13:22:50Z", ExcludeNewerPackage: map[string]string{}}
	for index := range maximumGeneratorPackageCutoffs {
		resolver.ExcludeNewerPackage[fmt.Sprintf("package-%d", index)] = "2026-09-16T00:00:00Z"
	}
	cutoffs, err := generatorPackageCutoffs(resolver)
	if err != nil || len(cutoffs) != maximumGeneratorPackageCutoffs {
		t.Fatalf("eight-entry cutoff validation = %v, %v", cutoffs, err)
	}
	resolver.ExcludeNewerPackage["package-extra"] = "2026-09-16T00:00:00Z"
	if _, err := generatorPackageCutoffs(resolver); err == nil || !strings.Contains(err.Error(), "exceed 8 entries") {
		t.Fatalf("nine-entry cutoff validation = %v", err)
	}
}
