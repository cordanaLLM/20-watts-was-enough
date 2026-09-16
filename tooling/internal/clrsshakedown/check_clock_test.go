package clrsshakedown

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"reflect"
	"testing"
	"testing/synctest"
	"time"

	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/specialistcontrol"
)

func TestRetainedCheckFixtureUsesSyntheticClock(t *testing.T) {
	// The helper performs the initial Check outside the Run-only clock bubble.
	_, report := retainedCheckFixture(t)
	start := time.Date(2000, time.January, 1, 0, 0, 0, 0, time.UTC)
	if !report.Started.Equal(start) || !report.Finished.Equal(start) {
		t.Fatalf("semantic fixture did not retain its synthetic clock: %s to %s", report.Started, report.Finished)
	}
	if report.State != "completed-unadmitted" || report.Authority != "NO_RESULT" || report.ImageAdmitted || report.ScientificResult || len(report.Cases) != 48 || len(report.Events) != 192 {
		t.Fatalf("incomplete or promoted semantic fixture: state=%s authority=%s cases=%d events=%d", report.State, report.Authority, len(report.Cases), len(report.Events))
	}
	for _, item := range report.Cases {
		if !item.Exact || item.ElapsedNanoseconds != 0 {
			t.Fatalf("synthetic case failed or acquired a wall-time measurement: %+v", item)
		}
	}
}

func TestJournalDeadlineStillRejectsInSyntheticClock(t *testing.T) {
	synctest.Test(t, func(t *testing.T) {
		if recordTimeout != 100*time.Millisecond {
			t.Fatal("journal deadline regression requires the production 100ms budget")
		}
		directory := t.TempDir()
		if err := os.Mkdir(filepath.Join(directory, "events"), 0o700); err != nil {
			t.Fatal(err)
		}
		root, err := os.OpenRoot(directory)
		if err != nil {
			t.Fatal(err)
		}
		defer root.Close()
		j := &journal{root: root}
		ctx, cancel := context.WithTimeout(context.Background(), recordTimeout)
		defer cancel()
		record := event{Kind: "decision", Decision: &specialistcontrol.Decision{}}
		if err := j.append(ctx, record, maximumEventBytes); err != nil || len(j.files) != 1 || j.bytes == 0 {
			t.Fatalf("live deadline did not permit the real journal writer: %v", err)
		}
		before, previousBytes := snapshot(t, directory), j.bytes
		time.Sleep(recordTimeout - time.Nanosecond)
		synctest.Wait()
		if err := ctx.Err(); err != nil {
			t.Fatalf("record deadline expired early: %v", err)
		}
		time.Sleep(time.Nanosecond)
		synctest.Wait()
		if err := j.append(ctx, record, maximumEventBytes); !errors.Is(err, context.DeadlineExceeded) {
			t.Fatalf("expired record deadline accepted: %v", err)
		}
		if len(j.files) != 1 || j.bytes != previousBytes || !reflect.DeepEqual(before, snapshot(t, directory)) {
			t.Fatal("expired journal append changed files or accounting")
		}
	})
}
