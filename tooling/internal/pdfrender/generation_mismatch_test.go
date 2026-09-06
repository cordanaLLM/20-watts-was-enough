package pdfrender

import (
	"bytes"
	"context"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestGenerationMismatchRetainsExactComparedPairs(t *testing.T) {
	for _, change := range []string{"pdf", "manifest", "both"} {
		t.Run(change, func(t *testing.T) {
			configuration := renderConfiguration(t)
			oldPDF, oldManifest := []byte("old-pdf"), []byte("old-manifest")
			writePublicationFixture(t, configuration.RepositoryRoot, oldPDF, oldManifest)
			executor := generationMismatchExecutor(change)
			_, err := renderWithDependencies(context.Background(), configuration, "main", "", noOpPreparer{}, executor)
			if err == nil || !strings.Contains(err.Error(), "fresh PDF renders differ") {
				t.Fatalf("expected original mismatch: %v", err)
			}
			root := generationEvidenceRoot(t, configuration.RepositoryRoot)
			if !strings.Contains(err.Error(), filepath.ToSlash(root)) || strings.Contains(err.Error(), "incomplete") {
				t.Fatalf("complete evidence location missing: %v", err)
			}
			assertGenerationEvidence(t, configuration.RepositoryRoot, root, executor)
			assertPublicationFixture(t, configuration.RepositoryRoot, oldPDF, oldManifest)
			if executor.renderCount != 2 || len(requestsWithPrefix(executor.requests, "buildx", "build")) != 1 || len(requestsWithPrefix(executor.requests, "buildx", "rm")) != 1 {
				t.Fatal("ordinary generation must remain one build and two renders with cleanup")
			}
			for _, output := range executor.outputDirectories {
				if _, err := os.Stat(output); !errors.Is(err, os.ErrNotExist) {
					t.Fatalf("staging output retained unexpectedly: %s: %v", output, err)
				}
			}
		})
	}
}

func TestGenerationMismatchSurvivesBuilderCleanupFailure(t *testing.T) {
	configuration := renderConfiguration(t)
	oldPDF, oldManifest := []byte("old-pdf"), []byte("old-manifest")
	writePublicationFixture(t, configuration.RepositoryRoot, oldPDF, oldManifest)
	executor := generationMismatchExecutor("both")
	cleanupError := errors.New("injected builder cleanup failure")
	executor.cleanupError = cleanupError
	executor.beforeCleanup = func() {
		root := generationEvidenceRoot(t, configuration.RepositoryRoot)
		assertGenerationEvidence(t, configuration.RepositoryRoot, root, executor)
	}
	_, err := renderWithDependencies(context.Background(), configuration, "main", "", noOpPreparer{}, executor)
	if !errors.Is(err, cleanupError) || !strings.Contains(err.Error(), "fresh PDF renders differ") {
		t.Fatalf("mismatch or cleanup cause lost: %v", err)
	}
	assertPublicationFixture(t, configuration.RepositoryRoot, oldPDF, oldManifest)
	if len(requestsWithPrefix(executor.requests, "buildx", "rm")) != 1 {
		t.Fatal("mismatch cleanup should execute once")
	}
}

func TestGenerationEqualPairPublishesWithoutMismatchEvidence(t *testing.T) {
	configuration := renderConfiguration(t)
	executor := generationMismatchExecutor("")
	result, err := renderWithDependencies(context.Background(), configuration, "main", "", noOpPreparer{}, executor)
	if err != nil || result.ImageID != testImageID {
		t.Fatalf("ordinary successful generation changed: %+v %v", result, err)
	}
	assertPublicationFixture(t, configuration.RepositoryRoot, []byte("%PDF-test\n"), []byte("{\"render\":\"stable\"}\n"))
	if _, err := os.Stat(filepath.Join(configuration.RepositoryRoot, "build", "evidence")); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("equal pair must not create mismatch evidence: %v", err)
	}
}

func generationEvidenceRoot(t *testing.T, repositoryRoot string) string {
	t.Helper()
	entries, err := os.ReadDir(filepath.Join(repositoryRoot, "build", "evidence"))
	if err != nil || len(entries) != 1 || !entries[0].IsDir() || !strings.HasPrefix(entries[0].Name(), "pdf-generation-mismatch-") {
		t.Fatalf("expected exactly one generation mismatch directory: %v %v", entries, err)
	}
	return filepath.Join("build", "evidence", entries[0].Name())
}

func assertGenerationEvidence(t *testing.T, repositoryRoot, relative string, executor *generationRetentionExecutor) {
	t.Helper()
	root := filepath.Join(repositoryRoot, relative)
	entries, err := os.ReadDir(root)
	if err != nil || len(entries) != 2 || entries[0].Name() != "render-1" || entries[1].Name() != "render-2" {
		t.Fatalf("expected two renders, no proof receipt: %v %v", entries, err)
	}
	for index, label := range []string{"render-1", "render-2"} {
		entries, err := os.ReadDir(filepath.Join(root, label))
		if err != nil || len(entries) != 2 {
			t.Fatalf("expected exact two-file pair in %s: %v %v", label, entries, err)
		}
		want := [][]byte{[]byte("%PDF-test\n"), []byte("{\"render\":\"stable\"}\n")}
		if index == 1 {
			if executor.secondPDF != nil {
				want[0] = executor.secondPDF
			}
			if executor.secondManifest != nil {
				want[1] = executor.secondManifest
			}
		}
		for artifact, name := range []string{bookPDFName, bookManifestName} {
			body, err := os.ReadFile(filepath.Join(root, label, name))
			if err != nil || !bytes.Equal(body, want[artifact]) {
				t.Fatalf("retained %s/%s differs from compared bytes: %q %v", label, name, body, err)
			}
		}
	}
}

type generationRetentionExecutor struct {
	*recordingExecutor
	secondPDF         []byte
	secondManifest    []byte
	cleanupError      error
	emitWarning       bool
	beforeCleanup     func()
	outputDirectories []string
}

func generationMismatchExecutor(change string) *generationRetentionExecutor {
	executor := &generationRetentionExecutor{recordingExecutor: &recordingExecutor{imageID: testImageID}}
	if change == "pdf" || change == "both" {
		executor.secondPDF = []byte("%PDF-other\n")
	}
	if change == "manifest" || change == "both" {
		executor.secondManifest = []byte("{\"render\":\"other\"}\n")
	}
	return executor
}

func (executor *generationRetentionExecutor) run(ctx context.Context, request commandRequest) ([]byte, error) {
	body, err := executor.recordingExecutor.run(ctx, request)
	if err != nil {
		return body, err
	}
	if request.operation == "remove locked Docker BuildKit builder" {
		if executor.beforeCleanup != nil {
			executor.beforeCleanup()
		}
		return body, executor.cleanupError
	}
	if request.operation != "run pinned PDF renderer image" {
		return body, nil
	}
	directory := mountSource(request.arguments, "/workspace/public/downloads")
	executor.outputDirectories = append(executor.outputDirectories, directory)
	if executor.renderCount == 2 {
		for name, replacement := range map[string][]byte{bookPDFName: executor.secondPDF, bookManifestName: executor.secondManifest} {
			if replacement != nil {
				if err := os.WriteFile(filepath.Join(directory, name), replacement, 0o644); err != nil {
					return nil, err
				}
			}
		}
	}
	if executor.emitWarning {
		body = []byte(testRetryWarning + "\n")
	}
	return body, nil
}
