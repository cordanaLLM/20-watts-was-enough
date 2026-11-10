package soak

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"
)

func TestCleanIterationsPass(t *testing.T) {
	requireSampling(t)
	samples, err := Loop(context.Background(), testConfig(10), func(context.Context, int) error { return nil })
	if err != nil {
		t.Fatal(err)
	}
	if len(samples) != 10 || samples[0].Iteration != 1 || samples[9].Iteration != 10 {
		t.Fatalf("samples = %d, range %d..%d; want 10, 1..10", len(samples), samples[0].Iteration, samples[len(samples)-1].Iteration)
	}
	if err := Verdict(samples, DefaultAllowance(samples, 10)); err != nil {
		t.Fatalf("clean Verdict() error = %v", err)
	}
}

func TestOpenFileLeakFails(t *testing.T) {
	requireSampling(t)
	files := make([]*os.File, 0, 12)
	t.Cleanup(func() {
		for _, file := range files {
			_ = file.Close()
		}
	})
	samples, err := Loop(context.Background(), testConfig(12), func(_ context.Context, _ int) error {
		file, openErr := os.Open(os.DevNull)
		if openErr != nil {
			return openErr
		}
		files = append(files, file)
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	assertVerdictMetric(t, samples, "open files")
}

func TestGoroutineLeakFails(t *testing.T) {
	requireSampling(t)
	release := make(chan struct{})
	t.Cleanup(func() { close(release) })
	samples, err := Loop(context.Background(), testConfig(12), func(context.Context, int) error {
		go func() { <-release }()
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	assertVerdictMetric(t, samples, "goroutines")
}

func TestLeftoverFilesFail(t *testing.T) {
	requireSampling(t)
	watched := t.TempDir()
	config := testConfig(12)
	config.Watched = []string{watched}
	samples, err := Loop(context.Background(), config, func(_ context.Context, index int) error {
		return os.WriteFile(filepath.Join(watched, fmt.Sprintf("left-%d", index)), []byte("left"), 0o600)
	})
	if err != nil {
		t.Fatal(err)
	}
	assertVerdictMetric(t, samples, "leftovers")
}

func TestMissingWatchedDirectoryFails(t *testing.T) {
	requireSampling(t)
	config := testConfig(3)
	config.Watched = []string{filepath.Join(t.TempDir(), "missing")}
	_, err := Loop(context.Background(), config, func(context.Context, int) error { return nil })
	if err == nil || !strings.Contains(err.Error(), "sample iteration 1: read watched directory") {
		t.Fatalf("Loop() error = %v", err)
	}
}

func TestMetricAllowanceBoundary(t *testing.T) {
	samples := fixedSamples(8)
	for index := range samples {
		if index >= 5 {
			samples[index].OpenFiles = 4
		}
	}
	if err := Verdict(samples, Allowance{OpenFiles: 4, MinIterations: 8}); err != nil {
		t.Fatalf("growth equal to allowance failed: %v", err)
	}
	err := Verdict(samples, Allowance{OpenFiles: 3, MinIterations: 8})
	if err == nil || !strings.Contains(err.Error(), "open files warmup max 0, tail min 4, growth 4, allowance 3") {
		t.Fatalf("growth above allowance error = %v", err)
	}
}

func TestHeapAllowanceBoundary(t *testing.T) {
	samples := fixedSamples(8)
	for index := range samples {
		if index >= 5 {
			samples[index].HeapBytes = 1024 + 512
		}
	}
	if err := Verdict(samples, Allowance{HeapBytes: 512, MinIterations: 8}); err != nil {
		t.Fatalf("heap growth equal to allowance failed: %v", err)
	}
	err := Verdict(samples, Allowance{HeapBytes: 511, MinIterations: 8})
	if err == nil || !strings.Contains(err.Error(), "heap bytes warmup max 1024, tail min 1536, growth 512, allowance 511") {
		t.Fatalf("heap growth above allowance error = %v", err)
	}
}

func TestTransientSpikeIsNotGrowth(t *testing.T) {
	samples := fixedSamples(12)
	samples[10].OpenFiles, samples[10].Goroutines = 9, 9
	if err := Verdict(samples, Allowance{MinIterations: 12}); err != nil {
		t.Fatalf("Verdict() treated a one-sample spike as growth: %v", err)
	}
}

func TestVerdictReportsEveryGrowingMetric(t *testing.T) {
	samples := fixedSamples(8)
	for index := range samples {
		if index >= 5 {
			samples[index].OpenFiles, samples[index].Goroutines, samples[index].Leftovers = 1, 2, 3
		}
	}
	err := Verdict(samples, Allowance{MinIterations: 8})
	if err == nil {
		t.Fatal("Verdict() unexpectedly accepted growth")
	}
	for _, metric := range []string{"open files", "goroutines", "leftovers"} {
		if !strings.Contains(err.Error(), metric) {
			t.Errorf("Verdict() error %q omits %q", err, metric)
		}
	}
}

func TestVerdictRejectsTooFewIterations(t *testing.T) {
	cases := []struct {
		count, minimum int
		want           string
	}{
		{count: MinimumSamples - 1, minimum: 1, want: fmt.Sprintf("too few iterations: got %d, want >= %d", MinimumSamples-1, MinimumSamples)},
		{count: MinimumSamples, minimum: 1},
		{count: 7, minimum: 8, want: "too few iterations: got 7, want >= 8"},
		{count: 8, minimum: 8},
	}
	for _, current := range cases {
		err := Verdict(fixedSamples(current.count), Allowance{MinIterations: current.minimum})
		if current.want == "" && err != nil {
			t.Errorf("Verdict(%d samples, min %d) error = %v", current.count, current.minimum, err)
		}
		if current.want != "" && (err == nil || err.Error() != current.want) {
			t.Errorf("Verdict(%d samples, min %d) error = %v, want %q", current.count, current.minimum, err, current.want)
		}
	}
}

func TestLoopStopsAtMaximumIterations(t *testing.T) {
	requireSampling(t)
	calls := 0
	samples, err := Loop(context.Background(), testConfig(3), func(context.Context, int) error { calls++; return nil })
	if err != nil || calls != 3 || len(samples) != 3 {
		t.Fatalf("Loop() samples=%d calls=%d error=%v", len(samples), calls, err)
	}
}

func TestLoopStopsAtDuration(t *testing.T) {
	requireSampling(t)
	config := testConfig(1000)
	config.Duration = 200 * time.Millisecond
	samples, err := Loop(context.Background(), config, func(ctx context.Context, _ int) error {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(5 * time.Millisecond):
			return nil
		}
	})
	if err != nil || len(samples) == 0 || len(samples) >= config.MaxIterations {
		t.Fatalf("Loop() samples=%d error=%v", len(samples), err)
	}
}

func TestLoopPacesIterationsByInterval(t *testing.T) {
	requireSampling(t)
	config := testConfig(1000)
	config.Duration = 200 * time.Millisecond
	config.Interval = 25 * time.Millisecond
	samples, err := Loop(context.Background(), config, func(context.Context, int) error { return nil })
	// 200 ms / 25 ms = 8 iteration starts; one more fits at the boundary.
	if err != nil || len(samples) == 0 || len(samples) > 9 {
		t.Fatalf("Loop() samples=%d error=%v; want 1..9", len(samples), err)
	}
}

func TestIterationErrorCarriesIndex(t *testing.T) {
	requireSampling(t)
	_, err := Loop(context.Background(), testConfig(5), func(_ context.Context, index int) error {
		if index == 2 {
			return errors.New("planted failure")
		}
		return nil
	})
	if err == nil || !strings.Contains(err.Error(), "iteration 2: planted failure") {
		t.Fatalf("Loop() error = %v", err)
	}
}

func TestLoopEnforcesIterationTimeout(t *testing.T) {
	config := testConfig(2)
	config.IterationTimeout = 10 * time.Millisecond
	_, err := Loop(context.Background(), config, func(ctx context.Context, _ int) error {
		<-ctx.Done()
		return ctx.Err()
	})
	if err == nil || !strings.Contains(err.Error(), "iteration 1: context deadline exceeded") {
		t.Fatalf("Loop() error = %v", err)
	}
}

func TestLoopRejectsInvalidConfig(t *testing.T) {
	iterate := func(context.Context, int) error { return nil }
	cases := map[string]Config{
		"zero duration":         {MaxIterations: 3, MinIterations: 3, IterationTimeout: time.Second},
		"zero maximum":          {Duration: time.Second, MinIterations: 1, IterationTimeout: time.Second},
		"minimum above maximum": {Duration: time.Second, MaxIterations: 2, MinIterations: 3, IterationTimeout: time.Second},
		"zero timeout":          {Duration: time.Second, MaxIterations: 3, MinIterations: 3},
		"negative interval":     {Duration: time.Second, Interval: -time.Millisecond, MaxIterations: 3, MinIterations: 3, IterationTimeout: time.Second},
	}
	for name, config := range cases {
		if _, err := Loop(context.Background(), config, iterate); err == nil {
			t.Errorf("%s: Loop() accepted invalid config", name)
		}
	}
	if _, err := Loop(context.Background(), testConfig(3), nil); err == nil {
		t.Error("Loop() accepted a nil callback")
	}
}

func TestPlatformSupport(t *testing.T) {
	err := CheckPlatformSupport()
	switch runtime.GOOS {
	case "linux", "darwin":
		if err != nil {
			t.Fatal(err)
		}
	default:
		if err == nil || !strings.Contains(err.Error(), runtime.GOOS) {
			t.Fatalf("CheckPlatformSupport() on %s error = %v, want platform named", runtime.GOOS, err)
		}
	}
}

func TestWriteJSONLines(t *testing.T) {
	path := filepath.Join(t.TempDir(), "samples.jsonl")
	if err := WriteJSONLines(path, fixedSamples(2)); err != nil {
		t.Fatal(err)
	}
	body, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if lines := strings.Count(string(body), "\n"); lines != 2 {
		t.Fatalf("JSONL lines = %d, want 2", lines)
	}
}

func testConfig(maximum int) Config {
	return Config{Duration: 5 * time.Second, MaxIterations: maximum, MinIterations: maximum,
		IterationTimeout: time.Second}
}

func fixedSamples(count int) []Sample {
	samples := make([]Sample, count)
	for index := range samples {
		samples[index] = Sample{Iteration: index + 1, HeapBytes: 1024}
	}
	return samples
}

func requireSampling(t *testing.T) {
	t.Helper()
	if err := CheckPlatformSupport(); err != nil {
		t.Skip(err)
	}
}

func assertVerdictMetric(t *testing.T, samples []Sample, metric string) {
	t.Helper()
	err := Verdict(samples, DefaultAllowance(samples, len(samples)))
	if err == nil || !strings.Contains(err.Error(), metric) {
		t.Fatalf("Verdict() error = %v, want %s growth", err, metric)
	}
}
