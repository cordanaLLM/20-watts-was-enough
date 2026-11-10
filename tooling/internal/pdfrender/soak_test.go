package pdfrender

import (
	"context"
	"path/filepath"
	"testing"

	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/soak"
)

// TestSoakBookRenderer repeats render orchestration with stub preparation
// and execution until the requested soak duration ends;
// .github/workflows/soak.yml requests it.
func TestSoakBookRenderer(t *testing.T) {
	duration, skip, err := soak.Requested()
	if err != nil {
		t.Fatal(err)
	}
	if skip != "" {
		t.Skip(skip)
	}
	temporary := t.TempDir()
	t.Setenv("TMPDIR", temporary)
	configuration := renderConfiguration(t)
	root := configuration.RepositoryRoot
	watched := []string{root, filepath.Join(root, "public", "downloads"), filepath.Join(root, "tmp"), temporary}
	config := soak.Config{Duration: duration, Interval: soak.DefaultInterval, MaxIterations: soak.DefaultMaxIterations, MinIterations: 20,
		IterationTimeout: soak.DefaultIterationTimeout, Watched: watched}
	samples, err := soak.Run(context.Background(), config, "book-renderer.jsonl", func(ctx context.Context, _ int) error {
		_, renderErr := renderWithDependencies(ctx, configuration, "main", "", noOpPreparer{}, &recordingExecutor{imageID: testImageID})
		return renderErr
	})
	t.Logf("book renderer soak iterations: %d", len(samples))
	if err != nil {
		t.Fatal(err)
	}
}
