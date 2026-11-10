package workstationrunner

import (
	"context"
	"fmt"
	"io"
	"strings"
	"testing"

	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/soak"
)

// TestSoakWorkstationRunner repeats one failing, output-bounded suite until
// the requested soak duration ends; .github/workflows/soak.yml requests it.
func TestSoakWorkstationRunner(t *testing.T) {
	duration, skip, err := soak.Requested()
	if err != nil {
		t.Fatal(err)
	}
	if skip != "" {
		t.Skip(skip)
	}
	temporary := t.TempDir()
	t.Setenv("TMPDIR", temporary)
	root := repositoryFixture(t)
	options := withOutputBytes(helperOptions(t, 2), 256)
	jobs := []job{
		helperJob("slow-first", "test:workstation:slow-first"),
		helperJob("fail-second", "test:workstation:fail-second"),
		helperJob("overflow-third", "test:workstation:overflow-third"),
	}
	config := soak.Config{Duration: duration, Interval: soak.DefaultInterval, MaxIterations: soak.DefaultMaxIterations, MinIterations: 20,
		IterationTimeout: soak.DefaultIterationTimeout, Watched: []string{temporary, root}}
	samples, err := soak.Run(context.Background(), config, "workstation-runner.jsonl", func(ctx context.Context, _ int) error {
		return runWorkstationSoakIteration(ctx, root, jobs, options)
	})
	t.Logf("workstation runner soak iterations: %d", len(samples))
	if err != nil {
		t.Fatal(err)
	}
}

func runWorkstationSoakIteration(ctx context.Context, root string, jobs []job, options runOptions) error {
	err := runSuite(ctx, root, jobs, options, io.Discard)
	if err == nil || !strings.Contains(err.Error(), "2 failed, 0 cancelled out of 3 jobs") {
		return fmt.Errorf("expected failing and output-bounded jobs, got %v", err)
	}
	return nil
}
