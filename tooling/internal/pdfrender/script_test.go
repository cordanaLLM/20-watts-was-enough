package pdfrender

import (
	"context"
	"errors"
	"path/filepath"
	"slices"
	"strings"
	"testing"
	"time"
)

type visualExecutor struct {
	recordingExecutor
	failVisual bool
}

func (executor *visualExecutor) run(ctx context.Context, request commandRequest) ([]byte, error) {
	if request.operation != "run pinned visual capture" {
		return executor.recordingExecutor.run(ctx, request)
	}
	executor.mu.Lock()
	executor.requests = append(executor.requests, request)
	executor.mu.Unlock()
	if executor.failVisual {
		return nil, errors.New("planted capture failure")
	}
	return nil, nil
}

func TestVisualArgumentsReuseThePDFHardening(t *testing.T) {
	configuration := renderConfiguration(t)
	directory := t.TempDir()
	arguments := visualRunArguments(configuration, testImageID, "capture", directory)
	prefix := hardenedRunArguments(configuration, testImageID, "capture", filepath.Join(configuration.RepositoryRoot, "public/downloads"), directory)
	if !slices.Equal(arguments[:len(prefix)], prefix) {
		t.Fatal("visual hardening differs from PDF hardening")
	}
	if !slices.Equal(arguments[len(prefix):], []string{"--entrypoint", "/usr/local/bin/node", testImageID, "scripts/capture-visual-views.mjs"}) {
		t.Fatal(arguments)
	}
	if mountSource(arguments, "/workspace/tmp") != directory || slices.Contains(arguments, "--ref") {
		t.Fatal(arguments)
	}
	for _, flag := range []string{"--read-only", "--cap-drop", "--security-opt", "--network", "--memory", "--pids-limit"} {
		if !slices.Contains(prefix, flag) {
			t.Fatalf("missing hardening %s", flag)
		}
	}
}

func TestVisualCaptureBuildOrderAndCleanup(t *testing.T) {
	for _, fail := range []bool{false, true} {
		t.Run(map[bool]string{false: "success", true: "capture failure"}[fail], func(t *testing.T) {
			configuration := renderConfiguration(t)
			executor := &visualExecutor{recordingExecutor: recordingExecutor{imageID: testImageID}, failVisual: fail}
			result, err := captureVisualWithDependencies(context.Background(), configuration, t.TempDir(), noOpPreparer{}, executor)
			if fail && (err == nil || !strings.Contains(err.Error(), "planted capture failure")) {
				t.Fatalf("error=%v", err)
			}
			if !fail && (err != nil || result.ImageID != testImageID || result.LockSHA256 != configuration.LockSHA256) {
				t.Fatalf("result=%+v error=%v", result, err)
			}
			assertVisualRequestOrder(t, executor.requests, fail)
			capture := requestWithPrefix(t, executor.requests, "run")
			if capture.operation != "run pinned visual capture" || capture.timeout != time.Duration(configuration.Lock.Limits.RenderSeconds)*time.Second {
				t.Fatal(capture)
			}
		})
	}
}

func assertVisualRequestOrder(t *testing.T, requests []commandRequest, failed bool) {
	t.Helper()
	expected := []string{"verify locked Docker Buildx client", "create locked Docker BuildKit builder", "fetch PDF renderer base image", "fetch PDF renderer base image", "build pinned PDF renderer image", "run pinned visual capture"}
	if len(requests) < len(expected)+1 {
		t.Fatalf("too few requests: %+v", requests)
	}
	for index, operation := range expected {
		if requests[index].operation != operation {
			t.Fatalf("request %d=%s, want %s", index, requests[index].operation, operation)
		}
	}
	cleanups := requestsWithPrefix(requests, "buildx", "rm")
	if len(cleanups) != 1 {
		t.Fatalf("builder cleanup=%+v", cleanups)
	}
	if failed && len(requestsWithPrefix(requests, "rm", "--force")) != 1 {
		t.Fatal("failed visual container was not removed")
	}
	if requests[len(requests)-1].arguments[1] != "rm" {
		t.Fatal("builder cleanup did not run last")
	}
}

func TestVisualCaptureRejectsConcurrentPublicationBeforeExecutor(t *testing.T) {
	configuration := renderConfiguration(t)
	lock, err := acquirePublicationLock(configuration.RepositoryRoot)
	if err != nil {
		t.Fatal(err)
	}
	defer lock.release()
	executor := &visualExecutor{}
	if _, err := captureVisualWithDependencies(context.Background(), configuration, t.TempDir(), noOpPreparer{}, executor); err == nil {
		t.Fatal("concurrent capture accepted")
	}
	if len(executor.requests) != 0 {
		t.Fatal("executor started before publication lock")
	}
}
