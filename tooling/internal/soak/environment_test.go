package soak

import (
	"context"
	"encoding/json"
	"errors"
	"io/fs"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"
)

func TestParseDurationBounds(t *testing.T) {
	cases := []struct {
		value string
		want  time.Duration
		fail  bool
	}{
		{value: "9s", fail: true},
		{value: "10s", want: 10 * time.Second},
		{value: "15m", want: 15 * time.Minute},
		{value: "25m", want: 25 * time.Minute},
		{value: "25m1s", fail: true},
		{value: "30m", fail: true},
		{value: "-1m", fail: true},
		{value: "half an hour", fail: true},
	}
	for _, current := range cases {
		got, err := parseDuration(current.value)
		if current.fail && err == nil {
			t.Errorf("parseDuration(%q) accepted an out-of-bounds value", current.value)
		}
		if !current.fail && (err != nil || got != current.want) {
			t.Errorf("parseDuration(%q) = %s, %v; want %s", current.value, got, err, current.want)
		}
	}
}

func TestRequestedSkipsWhenUnset(t *testing.T) {
	t.Setenv(DurationVariable, "")
	duration, skip, err := Requested()
	if err != nil || duration != 0 || skip != DurationVariable+" is unset" {
		t.Fatalf("Requested() = %s, %q, %v", duration, skip, err)
	}
}

func TestRequestedRejectsInvalidDuration(t *testing.T) {
	t.Setenv(DurationVariable, "2h")
	if _, _, err := Requested(); err == nil || !strings.Contains(err.Error(), "outside 10s..25m0s") {
		t.Fatalf("Requested() error = %v", err)
	}
}

func TestRequestedReturnsDurationOrPlatformSkip(t *testing.T) {
	t.Setenv(DurationVariable, "15s")
	duration, skip, err := Requested()
	if err != nil {
		t.Fatal(err)
	}
	if CheckPlatformSupport() != nil {
		if !strings.Contains(skip, runtime.GOOS) {
			t.Fatalf("Requested() skip = %q, want platform named", skip)
		}
		return
	}
	if duration != 15*time.Second || skip != "" {
		t.Fatalf("Requested() = %s, %q", duration, skip)
	}
}

func TestWriteReportFromEnvironmentWithoutDirectoryWritesNothing(t *testing.T) {
	t.Setenv(ReportDirVariable, "")
	if err := WriteReportFromEnvironment("unused.jsonl", fixedSamples(1)); err != nil {
		t.Fatal(err)
	}
}

func TestWriteReportFromEnvironmentWritesIntoExistingDirectory(t *testing.T) {
	directory := t.TempDir()
	t.Setenv(ReportDirVariable, directory)
	if err := WriteReportFromEnvironment("samples.jsonl", fixedSamples(3)); err != nil {
		t.Fatal(err)
	}
	body, err := os.ReadFile(filepath.Join(directory, "samples.jsonl"))
	if err != nil {
		t.Fatal(err)
	}
	lines := strings.Split(strings.TrimSuffix(string(body), "\n"), "\n")
	if len(lines) != 3 {
		t.Fatalf("JSONL lines = %d, want 3", len(lines))
	}
	for index, line := range lines {
		var current Sample
		if err := json.Unmarshal([]byte(line), &current); err != nil || current.Iteration != index+1 {
			t.Fatalf("line %d = %q, %v; want sample %d", index+1, line, err, index+1)
		}
	}
}

func TestWriteReportFromEnvironmentRefusesMissingDirectory(t *testing.T) {
	directory := filepath.Join(t.TempDir(), "nested", "soak")
	t.Setenv(ReportDirVariable, directory)
	err := WriteReportFromEnvironment("samples.jsonl", fixedSamples(1))
	if err == nil || !strings.Contains(err.Error(), ReportDirVariable+" must name an existing directory") {
		t.Fatalf("WriteReportFromEnvironment() error = %v, want missing directory refused", err)
	}
	if _, statErr := os.Stat(directory); !errors.Is(statErr, fs.ErrNotExist) {
		t.Fatalf("report directory %s exists after refusal: %v", directory, statErr)
	}
}

func TestWriteReportFromEnvironmentRefusesRelativeDirectory(t *testing.T) {
	// A writer that accepted the relative path would write under the working
	// directory, so the test moves it out of the source tree.
	t.Chdir(t.TempDir())
	t.Setenv(ReportDirVariable, filepath.Join("reports", "soak"))
	err := WriteReportFromEnvironment("samples.jsonl", fixedSamples(1))
	if err == nil || !strings.Contains(err.Error(), ReportDirVariable+" must be an absolute directory path") {
		t.Fatalf("WriteReportFromEnvironment() error = %v, want relative directory refused", err)
	}
}

func TestWriteReportFromEnvironmentRefusesNamesOutsideDirectory(t *testing.T) {
	parent := t.TempDir()
	directory := filepath.Join(parent, "reports")
	outside := filepath.Join(parent, "outside")
	for _, created := range []string{directory, outside} {
		if err := os.Mkdir(created, 0o700); err != nil {
			t.Fatal(err)
		}
	}
	names := []string{filepath.Join("..", "outside", "dotdot.jsonl"), filepath.Join(outside, "absolute.jsonl")}
	if err := os.Symlink(outside, filepath.Join(directory, "link")); err == nil {
		names = append(names, filepath.Join("link", "symlink.jsonl"))
	} else {
		t.Logf("symbolic link case not run: %v", err)
	}
	t.Setenv(ReportDirVariable, directory)
	for _, name := range names {
		if err := WriteReportFromEnvironment(name, fixedSamples(1)); err == nil {
			t.Errorf("WriteReportFromEnvironment(%q) wrote outside %s", name, directory)
		}
	}
	entries, err := os.ReadDir(outside)
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) != 0 {
		t.Fatalf("%s holds %d entries after refused writes, want 0", outside, len(entries))
	}
}

func TestRunWritesSamplesBeforeFailingVerdict(t *testing.T) {
	requireSampling(t)
	directory := t.TempDir()
	t.Setenv(ReportDirVariable, directory)
	watched := t.TempDir()
	config := testConfig(12)
	config.Watched = []string{watched}
	samples, err := Run(context.Background(), config, "leak.jsonl", func(_ context.Context, index int) error {
		return os.WriteFile(filepath.Join(watched, strings.Repeat("x", index)), nil, 0o600)
	})
	if err == nil || !strings.Contains(err.Error(), "leftovers warmup max 3, tail min 10, growth 7, allowance 0") {
		t.Fatalf("Run() error = %v, want leftovers growth", err)
	}
	body, readErr := os.ReadFile(filepath.Join(directory, "leak.jsonl"))
	if readErr != nil {
		t.Fatal(readErr)
	}
	if lines := strings.Count(string(body), "\n"); lines != len(samples) || lines != 12 {
		t.Fatalf("JSONL lines = %d, samples = %d; want 12", lines, len(samples))
	}
}

func TestRunPassesCleanLoop(t *testing.T) {
	requireSampling(t)
	t.Setenv(ReportDirVariable, "")
	samples, err := Run(context.Background(), testConfig(8), "clean.jsonl", func(context.Context, int) error { return nil })
	if err != nil || len(samples) != 8 {
		t.Fatalf("Run() samples=%d error=%v", len(samples), err)
	}
}
