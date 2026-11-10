package soak

import (
	"context"
	"testing"
)

// minimumTestIterations is the sample count a repository soak test needs
// before its verdict counts; a shorter run fails instead of passing on noise.
const minimumTestIterations = 20

// StartTest prepares one soak test. It skips t only when no soak is requested,
// points TMPDIR at a fresh directory that t removes, and returns a Config with
// the repository defaults that watches that directory. The caller appends its
// own watched directories. An error means the requested duration is invalid
// or the platform cannot sample open files.
func StartTest(t testing.TB) (Config, error) {
	t.Helper()
	duration, skip, err := Requested()
	if err != nil {
		return Config{}, err
	}
	if skip != "" {
		t.Skip(skip)
	}
	temporary := t.TempDir()
	t.Setenv("TMPDIR", temporary)
	return Config{
		Duration:         duration,
		Interval:         DefaultInterval,
		MaxIterations:    DefaultMaxIterations,
		MinIterations:    minimumTestIterations,
		IterationTimeout: DefaultIterationTimeout,
		Watched:          []string{temporary},
	}, nil
}

// RunTest runs iterate through Run, writes the samples to report and logs
// the iteration count to t, so a failing soak still names how far it got.
// The context ends with t or after config.Duration plus FinishMargin,
// whichever comes first. It returns Run's error unchanged.
func RunTest(t testing.TB, config Config, report string, iterate func(context.Context, int) error) error {
	t.Helper()
	ctx, cancel := context.WithTimeout(t.Context(), config.Duration+FinishMargin)
	defer cancel()
	samples, err := Run(ctx, config, report, iterate)
	t.Logf("%s: %d soak iterations", report, len(samples))
	return err
}
