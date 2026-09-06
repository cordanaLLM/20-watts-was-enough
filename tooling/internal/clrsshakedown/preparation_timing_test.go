package clrsshakedown

import (
	"context"
	"errors"
	"path/filepath"
	"testing"
	"time"

	"github.com/lusoris/20-watts-was-enough/tooling/internal/clrsfixture"
)

func TestNewReportPreservesExplicitPreparationStart(t *testing.T) {
	started := time.Date(2000, time.January, 1, 0, 0, 0, 0, time.UTC)
	report := newReport(Options{RunID: "preparation-timing"}, clrsfixture.FixtureTree{}, FileIdentity{}, started)
	if report.Started != started || !report.Finished.IsZero() || report.State != "incomplete" {
		t.Fatalf("constructor replaced the preparation start or invented completion: %+v", report)
	}
	if report.SchemaVersion != 1 || report.Authority != "NO_RESULT" || report.ImageAdmitted || report.ScientificResult ||
		report.Energy.State != "unavailable" || report.Energy.Joules != nil || report.TimeoutSeconds != 60 || report.RequestTimeoutMillis != 1000 {
		t.Fatalf("constructor changed the execution or measurement boundary: %+v", report)
	}
}

func TestRunStartedIncludesPreparationBeforeSpecialistEffects(t *testing.T) {
	options := fixtureOptions(t)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	var preparationTimes []time.Time
	// Existing admission observations were created while binding the inputs.
	// Check their logical order, not a wall-clock duration or performance floor.
	report, err := run(ctx, options, func(bound *boundInputs, _ *journal) {
		for _, observation := range bound.observations {
			preparationTimes = append(preparationTimes, observation.ObservedAt)
		}
		cancel()
	})
	if !errors.Is(err, context.Canceled) || report.State != "incomplete" || report.Error == "" {
		t.Fatalf("pre-effect cancellation was not retained: %+v %v", report, err)
	}
	if len(preparationTimes) != 6 || len(report.Cases) != 0 || len(report.Events) != 0 {
		t.Fatalf("unexpected preparation or effects: observations=%d cases=%d events=%d", len(preparationTimes), len(report.Cases), len(report.Events))
	}
	if report.SchemaVersion != 1 || report.Authority != "NO_RESULT" || report.ImageAdmitted || report.ScientificResult ||
		report.Energy.State != "unavailable" || report.Energy.Joules != nil || report.TimeoutSeconds != 60 || report.RequestTimeoutMillis != 1000 {
		t.Fatalf("preparation changed the execution or measurement boundary: %+v", report)
	}
	if report.Started.IsZero() || report.Finished.Before(report.Started) {
		t.Fatalf("missing or reversed run interval: %s to %s", report.Started, report.Finished)
	}
	for _, observedAt := range preparationTimes {
		if observedAt.IsZero() || report.Started.After(observedAt) || observedAt.After(report.Finished) {
			t.Fatalf("run interval excludes input preparation: started=%s observed=%s finished=%s", report.Started, observedAt, report.Finished)
		}
	}
	for _, name := range []string{"run-start.json", "receipt.json"} {
		var retained Report
		readCheckJSON(t, filepath.Join(options.OutputDirectory, name), &retained)
		if !retained.Started.Equal(report.Started) || retained.Authority != "NO_RESULT" || retained.ImageAdmitted || retained.ScientificResult {
			t.Fatalf("%s changed the start boundary or authority: %+v", name, retained)
		}
	}
}
