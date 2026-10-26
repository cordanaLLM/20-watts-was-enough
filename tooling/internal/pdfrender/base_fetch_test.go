package pdfrender

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"sync"
	"testing"
	"time"
)

func TestMaximumBaseFetchDurationMatchesPolicy(t *testing.T) {
	t.Parallel()
	if MaximumBaseFetchDuration != defaultBaseFetchPolicy.phaseTimeout {
		t.Fatalf("MaximumBaseFetchDuration = %v, want %v", MaximumBaseFetchDuration, defaultBaseFetchPolicy.phaseTimeout)
	}
}

type stallBaseFetchExecutor struct {
	mu       sync.Mutex
	requests []commandRequest
}

func (e *stallBaseFetchExecutor) run(ctx context.Context, request commandRequest) ([]byte, error) {
	e.mu.Lock()
	e.requests = append(e.requests, request)
	e.mu.Unlock()
	cmdCtx, cancel := context.WithTimeout(ctx, request.timeout)
	defer cancel()
	<-cmdCtx.Done()
	return nil, fmt.Errorf("%s: %w", request.operation, cmdCtx.Err())
}

func TestBaseFetchPlantedStall(t *testing.T) {
	t.Parallel()
	configuration := renderConfiguration(t)
	executor := &stallBaseFetchExecutor{}
	policy := baseFetchPolicy{
		attemptTimeout: 50 * time.Millisecond,
		attempts:       2,
		backoff:        10 * time.Millisecond,
		phaseTimeout:   1 * time.Second,
	}
	fetchRoot := filepath.Join(t.TempDir(), "base-fetch")
	start := time.Now()
	err := fetchBaseImages(context.Background(), configuration, executor, "pdf20w-test", fetchRoot, policy)
	elapsed := time.Since(start)

	if elapsed > 1*time.Second {
		t.Fatalf("fetchBaseImages wall clock = %v, want <= 1s", elapsed)
	}
	if err == nil {
		t.Fatal("fetchBaseImages unexpectedly succeeded on planted stall")
	}
	if !strings.Contains(err.Error(), "fetch PDF renderer base image") {
		t.Fatalf("error %q does not contain 'fetch PDF renderer base image'", err.Error())
	}
	if !strings.Contains(err.Error(), configuration.Lock.Node.Image) {
		t.Fatalf("error %q does not contain node image %s", err.Error(), configuration.Lock.Node.Image)
	}
	executor.mu.Lock()
	attempts := len(executor.requests)
	executor.mu.Unlock()
	if attempts != 2 {
		t.Fatalf("attempts recorded = %d, want 2", attempts)
	}
}

func TestBaseFetchPhaseBound(t *testing.T) {
	t.Parallel()
	configuration := renderConfiguration(t)
	executor := &stallBaseFetchExecutor{}
	policy := baseFetchPolicy{
		attemptTimeout: 200 * time.Millisecond,
		attempts:       5,
		backoff:        10 * time.Millisecond,
		phaseTimeout:   300 * time.Millisecond,
	}
	fetchRoot := filepath.Join(t.TempDir(), "base-fetch")
	start := time.Now()
	err := fetchBaseImages(context.Background(), configuration, executor, "pdf20w-test", fetchRoot, policy)
	elapsed := time.Since(start)

	if elapsed >= 600*time.Millisecond {
		t.Fatalf("fetchBaseImages returned after %v, want < 600ms", elapsed)
	}
	if err == nil {
		t.Fatal("fetchBaseImages unexpectedly succeeded on phase timeout")
	}
	if !strings.Contains(err.Error(), configuration.Lock.Node.Image) {
		t.Fatalf("error %q does not contain node image %s", err.Error(), configuration.Lock.Node.Image)
	}
	if !strings.Contains(err.Error(), "fetch PDF renderer base image") {
		t.Fatalf("error %q does not contain 'fetch PDF renderer base image'", err.Error())
	}
}

type retrySuccessExecutor struct {
	mu           sync.Mutex
	requests     []commandRequest
	failAttempts int
}

func (e *retrySuccessExecutor) run(ctx context.Context, request commandRequest) ([]byte, error) {
	e.mu.Lock()
	defer e.mu.Unlock()
	e.requests = append(e.requests, request)
	if len(e.requests) <= e.failAttempts {
		return nil, errors.New("simulated transient failure")
	}
	return nil, nil
}

func TestBaseFetchRetrySuccess(t *testing.T) {
	t.Parallel()
	configuration := renderConfiguration(t)
	executor := &retrySuccessExecutor{failAttempts: 1}
	policy := baseFetchPolicy{
		attemptTimeout: 10 * time.Second,
		attempts:       3,
		backoff:        5 * time.Millisecond,
		phaseTimeout:   30 * time.Second,
	}
	fetchRoot := filepath.Join(t.TempDir(), "base-fetch")
	err := fetchBaseImages(context.Background(), configuration, executor, "pdf20w-test", fetchRoot, policy)
	if err != nil {
		t.Fatalf("fetchBaseImages error = %v, want nil", err)
	}

	executor.mu.Lock()
	requests := slices.Clone(executor.requests)
	executor.mu.Unlock()

	if len(requests) != 3 {
		t.Fatalf("total requests = %d, want 3", len(requests))
	}
	for i, req := range requests {
		if slices.Contains(req.arguments, "--pull") {
			t.Fatalf("request %d contains --pull: %v", i, req.arguments)
		}
		outputArg := argumentAfterValue(req.arguments, "--output")
		if outputArg != "type=cacheonly" {
			t.Fatalf("request %d output = %q, want 'type=cacheonly'", i, outputArg)
		}
	}

	for _, target := range []struct {
		label string
		image string
	}{
		{label: "node", image: configuration.Lock.Node.Image},
		{label: "browser-environment", image: configuration.Lock.BrowserEnvironment.Image},
	} {
		dockerfilePath := filepath.Join(fetchRoot, target.label, "Dockerfile")
		body, err := os.ReadFile(dockerfilePath)
		if err != nil {
			t.Fatalf("read %s Dockerfile: %v", target.label, err)
		}
		expected := "FROM " + target.image + "\nRUN [\"true\"]\n"
		if string(body) != expected {
			t.Fatalf("%s Dockerfile = %q, want %q", target.label, string(body), expected)
		}
	}
}

type cancelDuringRunExecutor struct {
	mu       sync.Mutex
	requests []commandRequest
	onRun    func()
}

func (e *cancelDuringRunExecutor) run(ctx context.Context, request commandRequest) ([]byte, error) {
	e.mu.Lock()
	e.requests = append(e.requests, request)
	e.mu.Unlock()
	if e.onRun != nil {
		e.onRun()
	}
	return nil, errors.New("simulated failure with cancellation")
}

func TestBaseFetchParentCancel(t *testing.T) {
	t.Parallel()
	configuration := renderConfiguration(t)
	executor := &retrySuccessExecutor{failAttempts: 10}
	policy := baseFetchPolicy{
		attemptTimeout: 1 * time.Second,
		attempts:       3,
		backoff:        100 * time.Millisecond,
		phaseTimeout:   5 * time.Second,
	}
	fetchRoot := filepath.Join(t.TempDir(), "base-fetch")

	// Pre-cancelled context: no retry, wraps context.Canceled
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	err := fetchBaseImages(ctx, configuration, executor, "pdf20w-test", fetchRoot, policy)
	if err == nil || !errors.Is(err, context.Canceled) {
		t.Fatalf("pre-cancelled err = %v, want wrapping context.Canceled", err)
	}
	if len(executor.requests) != 0 {
		t.Fatalf("pre-cancelled made %d requests, want 0", len(executor.requests))
	}

	// Cancelled during first attempt: no retry, exactly 1 attempt
	cancelExecutor := &cancelDuringRunExecutor{}
	parentCtx, parentCancel := context.WithCancel(context.Background())
	cancelExecutor.onRun = parentCancel
	err = fetchBaseImages(parentCtx, configuration, cancelExecutor, "pdf20w-test", fetchRoot, policy)
	if err == nil || !errors.Is(err, context.Canceled) {
		t.Fatalf("cancelled during run err = %v, want wrapping context.Canceled", err)
	}
	if len(cancelExecutor.requests) != 1 {
		t.Fatalf("cancelled during run made %d requests, want 1", len(cancelExecutor.requests))
	}
}

type failingFetchInventoryExecutor struct {
	*builderInventoryExecutor
	failFetch bool
}

func (e *failingFetchInventoryExecutor) run(ctx context.Context, request commandRequest) ([]byte, error) {
	if e.failFetch && request.operation == "fetch PDF renderer base image" {
		return nil, errors.New("simulated base fetch failure")
	}
	return e.builderInventoryExecutor.run(ctx, request)
}

func TestRenderRemovesOwnedBuilderWhenBaseFetchFails(t *testing.T) {
	t.Parallel()
	configuration := renderConfiguration(t)
	recording := &recordingExecutor{imageID: testImageID}
	executor := &failingFetchInventoryExecutor{
		builderInventoryExecutor: newBuilderInventoryExecutor(configuration, recording, "default"),
		failFetch:                true,
	}
	_, err := renderWithDependencies(context.Background(), configuration, "main", "", noOpPreparer{}, executor)
	if err == nil || !strings.Contains(err.Error(), "fetch PDF renderer base image") {
		t.Fatalf("renderWithDependencies() error = %v, want base fetch failure", err)
	}
	want := []string{"default"}
	if !slices.Equal(executor.builders, want) {
		t.Fatalf("leftover builders = %v, want %v", executor.builders, want)
	}
}
