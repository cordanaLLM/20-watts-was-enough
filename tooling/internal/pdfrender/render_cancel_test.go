package pdfrender

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"slices"
	"testing"
)

func TestRenderCancellationCleansOwnedResourcesWithoutPublishing(t *testing.T) {
	t.Parallel()
	for _, operation := range []string{"run pinned PDF renderer image", "remove locked Docker BuildKit builder"} {
		t.Run(operation, func(t *testing.T) {
			configuration := renderConfiguration(t)
			oldPDF, oldManifest := []byte("previous PDF"), []byte("previous manifest")
			writePublicationFixture(t, configuration.RepositoryRoot, oldPDF, oldManifest)
			ctx, cancel := context.WithCancel(context.Background())
			defer cancel()
			executor := &cancellingRenderExecutor{
				recordingExecutor: recordingExecutor{imageID: testImageID},
				cancel:            cancel, atOperation: operation,
			}
			_, err := renderWithDependencies(ctx, configuration, "main", "", noOpPreparer{}, executor)
			if !errors.Is(err, context.Canceled) || !executor.cancelled {
				t.Fatalf("render did not preserve cancellation: %v, cancelled=%t", err, executor.cancelled)
			}
			assertPublicationFixture(t, configuration.RepositoryRoot, oldPDF, oldManifest)
			for _, file := range []string{executor.stagingRoot, filepath.Join(configuration.RepositoryRoot, "tmp", "pdf-renderer-book.lock")} {
				if file == "" {
					t.Fatal("test did not identify renderer-owned staging")
				}
				if _, err := os.Lstat(file); !errors.Is(err, os.ErrNotExist) {
					t.Fatalf("owned resource survived cancellation: %s: %v", file, err)
				}
			}
			if executor.cancelledCleanupContext || executor.unboundedCleanup {
				t.Fatal("cleanup did not receive its independent finite context")
			}
			builders := requestsWithPrefix(executor.requests, "buildx", "rm", "--force")
			if len(builders) != 1 {
				t.Fatalf("builder cleanup count = %d, want one", len(builders))
			}
			created := requestWithPrefix(t, executor.requests, "buildx", "create")
			if !slices.Equal(builders[0].arguments, []string{"buildx", "rm", "--force", argumentAfter(t, created.arguments, "--name")}) {
				t.Fatalf("cleanup targeted a different builder: %v", builders[0].arguments)
			}
			containers := requestsWithPrefix(executor.requests, "rm", "--force")
			if operation == "run pinned PDF renderer image" {
				runs := requestsWithPrefix(executor.requests, "run")
				if len(runs) != 1 || len(containers) != 1 || !slices.Equal(containers[0].arguments, []string{"rm", "--force", argumentAfter(t, runs[0].arguments, "--name")}) {
					t.Fatalf("cancelled container cleanup is not exact: runs=%v cleanup=%v", runs, containers)
				}
			} else if executor.renderCount != 2 || len(containers) != 0 {
				t.Fatalf("late cancellation did not preserve two completed renders: renders=%d cleanup=%v", executor.renderCount, containers)
			}
		})
	}
}

type cancellingRenderExecutor struct {
	recordingExecutor
	cancel                  context.CancelFunc
	atOperation             string
	stagingRoot             string
	cancelled               bool
	cancelledCleanupContext bool
	unboundedCleanup        bool
}

func (executor *cancellingRenderExecutor) run(ctx context.Context, request commandRequest) ([]byte, error) {
	if request.operation == "build pinned PDF renderer image" {
		executor.stagingRoot = filepath.Dir(argumentAfterValue(request.arguments, "--iidfile"))
	}
	if request.operation == executor.atOperation {
		executor.cancel()
		executor.cancelled = true
		if request.operation == "run pinned PDF renderer image" {
			executor.requests = append(executor.requests, request)
			return nil, ctx.Err()
		}
	}
	if request.operation == "remove failed PDF renderer container" || request.operation == "remove locked Docker BuildKit builder" {
		_, deadline := ctx.Deadline()
		executor.cancelledCleanupContext = executor.cancelledCleanupContext || ctx.Err() != nil
		executor.unboundedCleanup = executor.unboundedCleanup || !deadline || request.timeout <= 0
	}
	return executor.recordingExecutor.run(ctx, request)
}
