package main

import (
	"bytes"
	"context"
	"io"
	"testing"
	"time"

	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/pdfrender"
	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/pdfrenderlock"
	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/workstationrunner"
)

func TestPublicationRenderEnforcesDeadline(t *testing.T) {
	root := t.TempDir()
	called := false
	render := func(ctx context.Context, _ pdfrender.Options) (pdfrender.Result, error) {
		called = true
		deadline, ok := ctx.Deadline()
		if !ok {
			t.Fatal("expected publication render context to carry a deadline")
		}
		remaining := time.Until(deadline)
		// The deadline must leave the lock's build and render ceilings intact.
		floor := time.Duration(pdfrenderlock.MaximumBuildSeconds+pdfrenderlock.MaximumRenderSeconds) * time.Second
		if remaining <= floor || remaining > publicationRenderDeadline {
			t.Fatalf("unexpected deadline remaining duration: %v", remaining)
		}
		return pdfrender.Result{}, nil
	}
	var stdout, stderr bytes.Buffer
	code := runPublicationRenderPDFWithRenderer([]string{"--root", root}, &stdout, &stderr, render)
	if code != 0 || !called {
		t.Fatalf("exit code = %d, called = %v, stderr = %s", code, called, stderr.String())
	}
}

func TestWorkstationSuiteEnforcesDeadline(t *testing.T) {
	root := t.TempDir()
	called := false
	runner := func(ctx context.Context, _ string, _ io.Writer) error {
		called = true
		deadline, ok := ctx.Deadline()
		if !ok {
			t.Fatal("expected workstation suite context to carry a deadline")
		}
		remaining := time.Until(deadline)
		// The deadline must leave every wave of the largest catalogue intact.
		if remaining <= workstationrunner.MaximumSuiteDuration-time.Minute || remaining > workstationSuiteDeadline {
			t.Fatalf("unexpected deadline remaining duration: %v", remaining)
		}
		return nil
	}
	var stdout, stderr bytes.Buffer
	code := runCIWorkstationWithRunner([]string{"--root", root}, &stdout, &stderr, runner)
	if code != 0 || !called {
		t.Fatalf("exit code = %d, called = %v, stderr = %s", code, called, stderr.String())
	}
}
