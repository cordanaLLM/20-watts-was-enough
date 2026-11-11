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
	config, err := soak.StartTest(t)
	if err != nil {
		t.Fatal(err)
	}
	configuration := renderConfiguration(t)
	root := configuration.RepositoryRoot
	config.Watched = append(config.Watched, root, filepath.Join(root, "public", "downloads"), filepath.Join(root, "tmp"))
	err = soak.RunTest(t, config, "book-renderer.jsonl", func(ctx context.Context, _ int) error {
		_, renderErr := renderWithDependencies(ctx, configuration, "main", "", noOpPreparer{}, &recordingExecutor{imageID: testImageID})
		return renderErr
	})
	if err != nil {
		t.Fatal(err)
	}
}
