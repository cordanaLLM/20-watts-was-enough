package pdfrender

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"sync"
	"testing"
	"time"
)

func TestVerifyReproducibilityRunsImageBuildChainsConcurrently(t *testing.T) {
	t.Parallel()
	configuration := renderConfiguration(t)
	receiptRelative := ".workingdir/evidence/publication/pdf-reproducibility.json"
	executor := newBarrierReproducibilityExecutor()
	sourceRevision := strings.Repeat("a", 40)

	receipt, err := verifyReproducibilityWithDependencies(
		context.Background(), configuration, "v1.2.3", sourceRevision, receiptRelative,
		reproducibilityFixturePreparer{}, executor,
	)
	if err != nil {
		t.Fatalf("verifyReproducibilityWithDependencies() error = %v", err)
	}
	if receipt.Status != "pass" {
		t.Fatalf("receipt status = %q, want pass", receipt.Status)
	}
	if count := executor.buildCount(); count != 2 {
		t.Fatalf("barrier observed %d builds, want 2", count)
	}
}

func TestVerifyReproducibilityFailureInBuildCancelsSiblingAndCleansBuilders(t *testing.T) {
	t.Parallel()
	configuration := renderConfiguration(t)
	receiptRelative := ".workingdir/evidence/publication/pdf-reproducibility.json"
	executor := newBuild2FailingExecutor()
	sourceRevision := strings.Repeat("a", 40)

	receipt, err := verifyReproducibilityWithDependencies(
		context.Background(), configuration, "v1.2.3", sourceRevision, receiptRelative,
		reproducibilityFixturePreparer{}, executor,
	)
	if err == nil || !strings.Contains(err.Error(), "injected build-2 failure") {
		t.Fatalf("expected injected build-2 failure, got error = %v", err)
	}
	if receipt.Status == "pass" {
		t.Fatalf("expected failed receipt status, got %q", receipt.Status)
	}
	receiptPath := filepath.Join(configuration.RepositoryRoot, filepath.FromSlash(receiptRelative))
	if _, statErr := os.Stat(receiptPath); !errors.Is(statErr, os.ErrNotExist) {
		t.Fatalf("receipt file should not exist on build failure: %v", statErr)
	}
	if !executor.wasBuild1Cancelled() {
		t.Fatal("build-1 context was not cancelled when build-2 failed")
	}
	creates := requestsWithPrefix(executor.requests, "buildx", "create")
	removals := requestsWithPrefix(executor.requests, "buildx", "rm")
	if len(creates) != 2 || len(removals) != 2 {
		t.Fatalf("expected 2 builders created and removed, got creates=%d removals=%d", len(creates), len(removals))
	}
}

func TestRenderPairExecutionRemainsSerial(t *testing.T) {
	t.Parallel()
	configuration := renderConfiguration(t)
	executor := newSerialPairVerificationExecutor()

	receipt, err := verifyProofWithDependencies(
		context.Background(), configuration, "main", "", "build/evidence/pair.json",
		reproducibilityFixturePreparer{}, executor, true,
	)
	if err != nil {
		t.Fatalf("verifyProofWithDependencies() error = %v", err)
	}
	if receipt.Status != "pass" {
		t.Fatalf("receipt status = %q, want pass", receipt.Status)
	}
	builds := requestsWithPrefix(executor.requests, "buildx", "build")
	if len(builds) != 1 {
		t.Fatalf("expected exactly 1 buildx build, got %d", len(builds))
	}
	runs := requestsWithPrefix(executor.requests, "run")
	if len(runs) != 2 {
		t.Fatalf("expected exactly 2 render runs, got %d", len(runs))
	}
	if !executor.wasRender1CompletedBeforeRender2() {
		t.Fatal("render-2 started before render-1 completed")
	}
	if executor.render2ImageID != testProofConfigDigest {
		t.Fatalf("render-2 image ID = %q, want %q", executor.render2ImageID, testProofConfigDigest)
	}
}

type barrierReproducibilityExecutor struct {
	*reproducibilityExecutor
	mu      sync.Mutex
	started chan struct{}
	count   int
}

func newBarrierReproducibilityExecutor() *barrierReproducibilityExecutor {
	return &barrierReproducibilityExecutor{
		reproducibilityExecutor: &reproducibilityExecutor{
			imageIDs:        []string{testProofConfigDigest, testProofConfigDigest},
			manifestDigests: []string{testManifestDigest, testManifestDigest},
		},
		started: make(chan struct{}),
	}
}

func (b *barrierReproducibilityExecutor) buildCount() int {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.count
}

func (b *barrierReproducibilityExecutor) run(ctx context.Context, request commandRequest) ([]byte, error) {
	if len(request.arguments) > 1 && slices.Equal(request.arguments[:2], []string{"buildx", "build"}) {
		b.mu.Lock()
		b.count++
		if b.count == 2 {
			close(b.started)
		}
		b.mu.Unlock()

		select {
		case <-b.started:
		case <-time.After(10 * time.Second):
			return nil, errors.New("barrier timeout: builds did not run concurrently within 10s")
		case <-ctx.Done():
			return nil, ctx.Err()
		}
	}
	return b.reproducibilityExecutor.run(ctx, request)
}

type build2FailingExecutor struct {
	*reproducibilityExecutor
	mu            sync.Mutex
	build1Started chan struct{}
	build1Done    chan struct{}
}

func newBuild2FailingExecutor() *build2FailingExecutor {
	return &build2FailingExecutor{
		reproducibilityExecutor: &reproducibilityExecutor{
			imageIDs:        []string{testProofConfigDigest, testProofConfigDigest},
			manifestDigests: []string{testManifestDigest, testManifestDigest},
		},
		build1Started: make(chan struct{}),
		build1Done:    make(chan struct{}),
	}
}

func (e *build2FailingExecutor) wasBuild1Cancelled() bool {
	select {
	case <-e.build1Done:
		return true
	default:
		return false
	}
}

func (e *build2FailingExecutor) run(ctx context.Context, request commandRequest) ([]byte, error) {
	if len(request.arguments) > 1 && slices.Equal(request.arguments[:2], []string{"buildx", "build"}) {
		tag := argumentAfterValue(request.arguments, "--tag")
		if strings.HasSuffix(tag, "-1") {
			e.mu.Lock()
			select {
			case <-e.build1Started:
			default:
				close(e.build1Started)
			}
			e.mu.Unlock()

			select {
			case <-ctx.Done():
				e.mu.Lock()
				select {
				case <-e.build1Done:
				default:
					close(e.build1Done)
				}
				e.mu.Unlock()
				return nil, ctx.Err()
			case <-time.After(10 * time.Second):
				return nil, errors.New("timeout waiting for build-1 cancellation")
			}
		} else if strings.HasSuffix(tag, "-2") {
			select {
			case <-e.build1Started:
			case <-ctx.Done():
				return nil, ctx.Err()
			case <-time.After(10 * time.Second):
				return nil, errors.New("timeout waiting for build-1 to start")
			}
			return nil, errors.New("injected build-2 failure")
		}
	}
	return e.reproducibilityExecutor.run(ctx, request)
}

type serialPairVerificationExecutor struct {
	*reproducibilityExecutor
	mu             sync.Mutex
	render1Done    bool
	render1Active  bool
	render2Started bool
	render2ImageID string
	serialValid    bool
}

func newSerialPairVerificationExecutor() *serialPairVerificationExecutor {
	return &serialPairVerificationExecutor{
		reproducibilityExecutor: &reproducibilityExecutor{
			imageIDs:        []string{testProofConfigDigest},
			manifestDigests: []string{testManifestDigest},
		},
	}
}

func (e *serialPairVerificationExecutor) wasRender1CompletedBeforeRender2() bool {
	e.mu.Lock()
	defer e.mu.Unlock()
	return e.serialValid
}

func (e *serialPairVerificationExecutor) run(ctx context.Context, request commandRequest) ([]byte, error) {
	if len(request.arguments) > 0 && request.arguments[0] == "run" {
		e.mu.Lock()
		if request.renderSequence == 1 {
			e.render1Active = true
		} else if request.renderSequence == 2 {
			e.render2Started = true
			if e.render1Done && !e.render1Active {
				e.serialValid = true
			}
			e.render2ImageID = findRunImageID(request.arguments)
		}
		e.mu.Unlock()

		body, err := e.reproducibilityExecutor.run(ctx, request)

		e.mu.Lock()
		if request.renderSequence == 1 {
			e.render1Active = false
			e.render1Done = true
		}
		e.mu.Unlock()

		return body, err
	}
	return e.reproducibilityExecutor.run(ctx, request)
}

func findRunImageID(arguments []string) string {
	for _, arg := range arguments {
		if strings.HasPrefix(arg, "BOOK_RENDERER_IMAGE_ID=") {
			return strings.TrimPrefix(arg, "BOOK_RENDERER_IMAGE_ID=")
		}
	}
	return ""
}
