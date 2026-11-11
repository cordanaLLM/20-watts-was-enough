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
	config, err := soak.StartTest(t)
	if err != nil {
		t.Fatal(err)
	}
	root := repositoryFixture(t)
	config.Watched = append(config.Watched, root)
	options := withOutputBytes(helperOptions(t, 2), 256)
	jobs := []job{
		helperJob("slow-first", "test:workstation:slow-first"),
		helperJob("fail-second", "test:workstation:fail-second"),
		helperJob("overflow-third", "test:workstation:overflow-third"),
	}
	err = soak.RunTest(t, config, "workstation-runner.jsonl", func(ctx context.Context, _ int) error {
		return runWorkstationSoakIteration(ctx, root, jobs, options)
	})
	if err != nil {
		t.Fatal(err)
	}
}

// runWorkstationSoakIteration runs the suite once and accepts only the
// expected outcome: two of three jobs fail and none is cancelled. Any other
// result, a pass included, ends the soak.
func runWorkstationSoakIteration(ctx context.Context, root string, jobs []job, options runOptions) error {
	err := runSuite(ctx, root, jobs, options, io.Discard)
	if err == nil || !strings.Contains(err.Error(), "2 failed, 0 cancelled out of 3 jobs") {
		return fmt.Errorf("expected failing and output-bounded jobs, got %v", err)
	}
	return nil
}
