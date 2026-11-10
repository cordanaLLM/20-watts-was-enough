package soak

import (
	"context"
	"errors"
	"os"
	"reflect"
	"strings"
	"testing"
	"time"
)

// TestStartTestSkipsWithoutRequest pins the boundary case: with the duration
// variable unset, StartTest skips the test and returns nothing to it.
func TestStartTestSkipsWithoutRequest(t *testing.T) {
	t.Setenv(DurationVariable, "")
	var inner *testing.T
	reached := false
	t.Run("unset", func(t *testing.T) {
		inner = t
		_, _ = StartTest(t)
		reached = true
	})
	if !inner.Skipped() || reached {
		t.Fatalf("StartTest without %s: skipped=%v, returned=%v; want a skip", DurationVariable, inner.Skipped(), reached)
	}
}

// TestStartTestRefusesInvalidDuration pins the negative case: a duration above
// the maximum is returned as an error instead of starting a soak.
func TestStartTestRefusesInvalidDuration(t *testing.T) {
	t.Setenv(DurationVariable, "30m")
	if _, err := StartTest(t); err == nil || !strings.Contains(err.Error(), "outside") {
		t.Fatalf("StartTest(30m) error = %v, want the range refusal", err)
	}
}

// TestStartTestReturnsDefaultsAndWatchedTemporary pins the positive case at
// the minimum duration: the Config carries the repository defaults and
// watches the fresh TMPDIR that StartTest set.
func TestStartTestReturnsDefaultsAndWatchedTemporary(t *testing.T) {
	requireSampling(t)
	t.Setenv(DurationVariable, "10s")
	config, err := StartTest(t)
	if err != nil {
		t.Fatal(err)
	}
	want := Config{Duration: 10 * time.Second, Interval: DefaultInterval, MaxIterations: DefaultMaxIterations,
		MinIterations: minimumTestIterations, IterationTimeout: DefaultIterationTimeout}
	got := config
	got.Watched = nil
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("StartTest() = %+v, want %+v", got, want)
	}
	temporary := os.Getenv("TMPDIR")
	if len(config.Watched) != 1 || config.Watched[0] != temporary {
		t.Fatalf("Watched = %q, want only TMPDIR %q", config.Watched, temporary)
	}
	if info, err := os.Stat(temporary); err != nil || !info.IsDir() {
		t.Fatalf("TMPDIR %q: %v, want an existing directory", temporary, err)
	}
}

// TestRunTestReturnsRunResult pins both outcomes of RunTest: nil for a clean
// loop and the iteration error, unwrapped by errors.Is, for a failing one.
func TestRunTestReturnsRunResult(t *testing.T) {
	requireSampling(t)
	t.Setenv(ReportDirVariable, "")
	config := testConfig(8)
	config.Watched = []string{t.TempDir()}
	if err := RunTest(t, config, "clean.jsonl", func(context.Context, int) error { return nil }); err != nil {
		t.Fatalf("RunTest(clean) error = %v", err)
	}
	failure := errors.New("planted iteration failure")
	err := RunTest(t, config, "failing.jsonl", func(context.Context, int) error { return failure })
	if !errors.Is(err, failure) {
		t.Fatalf("RunTest(failing) error = %v, want the iteration error", err)
	}
}

// readReport reads one report file through an os.Root opened on directory,
// the same confinement WriteReportFromEnvironment writes under.
func readReport(t *testing.T, directory, name string) []byte {
	t.Helper()
	root, err := os.OpenRoot(directory)
	if err != nil {
		t.Fatal(err)
	}
	defer func() {
		if err := root.Close(); err != nil {
			t.Error(err)
		}
	}()
	body, err := root.ReadFile(name)
	if err != nil {
		t.Fatal(err)
	}
	return body
}
