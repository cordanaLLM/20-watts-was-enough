package ciplancli

import (
	"bytes"
	"context"
	"strings"
	"testing"
	"time"

	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/ciplan"
)

func TestPlanDerivesDeadlineContext(t *testing.T) {
	called := false
	build := func(ctx context.Context, _ ciplan.Options) (ciplan.Plan, error) {
		called = true
		deadline, ok := ctx.Deadline()
		if !ok {
			t.Fatal("expected context to carry a deadline")
		}
		remaining := time.Until(deadline)
		// The deadline must leave the plan builder's own bound intact.
		if remaining <= ciplan.MaximumBuildDuration-5*time.Second || remaining > planDeadline {
			t.Fatalf("unexpected deadline remaining: %v", remaining)
		}
		return fullPlan(), nil
	}
	var stdout, stderr bytes.Buffer
	code := runPlan([]string{"--root", ".", "--base", strings.Repeat("1", 40), "--head", strings.Repeat("2", 40)}, &stdout, &stderr, build)
	if code != 0 || !called {
		t.Fatalf("exit = %d, called = %v, stderr = %s", code, called, stderr.String())
	}
}
