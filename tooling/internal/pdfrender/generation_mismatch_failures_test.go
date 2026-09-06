package pdfrender

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

func TestGenerationMismatchJoinsRetentionCleanupAndDiagnosticFailures(t *testing.T) {
	configuration := renderConfiguration(t)
	oldPDF, oldManifest := []byte("old-pdf"), []byte("old-manifest")
	writePublicationFixture(t, configuration.RepositoryRoot, oldPDF, oldManifest)
	blockedParent := filepath.Join(configuration.RepositoryRoot, "build")
	if err := os.WriteFile(blockedParent, []byte("existing user file"), 0o600); err != nil {
		t.Fatal(err)
	}
	inner := generationMismatchExecutor("both")
	inner.cleanupError = errors.New("injected builder cleanup failure")
	inner.emitWarning = true
	sinkError := errors.New("injected diagnostic failure")
	writer := &retryFailingWriter{err: sinkError}
	executor := &rendererDiagnosticExecutor{commandExecutor: inner, writer: writer}
	_, err := renderWithDependencies(context.Background(), configuration, "main", "", noOpPreparer{}, executor)
	if !errors.Is(err, inner.cleanupError) || !errors.Is(err, sinkError) ||
		!strings.Contains(err.Error(), "fresh PDF renders differ") || !strings.Contains(err.Error(), "non-symlink directory") {
		t.Fatalf("mismatch, retention, cleanup, or diagnostic cause lost: %v", err)
	}
	if strings.Contains(err.Error(), "renders retained at") || writer.calls != 2 {
		t.Fatalf("false complete retention or altered diagnostics: %v, writes=%d", err, writer.calls)
	}
	body, readError := os.ReadFile(blockedParent)
	if readError != nil || string(body) != "existing user file" {
		t.Fatalf("blocking user file changed: %q %v", body, readError)
	}
	assertPublicationFixture(t, configuration.RepositoryRoot, oldPDF, oldManifest)
}

func TestGenerationEqualPairStillRequiresCleanupAndAuthorityCheck(t *testing.T) {
	for _, failure := range []string{"cleanup", "authority"} {
		t.Run(failure, func(t *testing.T) {
			configuration := renderConfiguration(t)
			oldPDF, oldManifest := []byte("old-pdf"), []byte("old-manifest")
			writePublicationFixture(t, configuration.RepositoryRoot, oldPDF, oldManifest)
			executor := generationMismatchExecutor("")
			if failure == "cleanup" {
				executor.cleanupError = errors.New("injected builder cleanup failure")
			} else {
				executor.beforeCleanup = func() {
					file := filepath.Join(configuration.RepositoryRoot, "tooling", "pdf-renderer", "lock.json")
					if err := os.WriteFile(file, []byte("changed lock"), 0o600); err != nil {
						t.Fatal(err)
					}
				}
			}
			_, err := renderWithDependencies(context.Background(), configuration, "main", "", noOpPreparer{}, executor)
			if err == nil || (failure == "cleanup" && !errors.Is(err, executor.cleanupError)) ||
				(failure == "authority" && !strings.Contains(err.Error(), "lock changed")) {
				t.Fatalf("matching pair bypassed %s failure: %v", failure, err)
			}
			assertPublicationFixture(t, configuration.RepositoryRoot, oldPDF, oldManifest)
			if _, err := os.Stat(filepath.Join(configuration.RepositoryRoot, "build", "evidence")); !errors.Is(err, os.ErrNotExist) {
				t.Fatalf("operational failure misclassified as mismatch: %v", err)
			}
		})
	}
}

func TestGenerationMismatchReportsStagingCleanupFailure(t *testing.T) {
	if runtime.GOOS != "linux" || os.Geteuid() == 0 {
		t.Skip("fault injection requires non-root Linux directory permissions")
	}
	configuration := renderConfiguration(t)
	oldPDF, oldManifest := []byte("old-pdf"), []byte("old-manifest")
	writePublicationFixture(t, configuration.RepositoryRoot, oldPDF, oldManifest)
	executor := generationMismatchExecutor("both")
	executor.beforeCleanup = func() {
		directory := executor.outputDirectories[0]
		stagingRoot := filepath.Dir(filepath.Dir(directory))
		t.Cleanup(func() {
			if err := os.Chmod(directory, 0o755); err != nil {
				t.Error(err)
			}
			if err := os.RemoveAll(stagingRoot); err != nil {
				t.Error(err)
			}
		})
		if err := os.Chmod(directory, 0o500); err != nil {
			t.Fatal(err)
		}
	}
	_, err := renderWithDependencies(context.Background(), configuration, "main", "", noOpPreparer{}, executor)
	if !errors.Is(err, os.ErrPermission) || !strings.Contains(err.Error(), "fresh PDF renders differ") ||
		!strings.Contains(err.Error(), "remove PDF renderer staging root") {
		t.Fatalf("staging cleanup or original mismatch lost: %v", err)
	}
	root := generationEvidenceRoot(t, configuration.RepositoryRoot)
	assertGenerationEvidence(t, configuration.RepositoryRoot, root, executor)
	assertPublicationFixture(t, configuration.RepositoryRoot, oldPDF, oldManifest)
}

func TestGenerationMalformedPairNeverPublishesOrRetainsCompleteEvidence(t *testing.T) {
	for _, defect := range []string{"extra", "missing", "symlink", "oversize"} {
		t.Run(defect, func(t *testing.T) {
			root, first, second := t.TempDir(), t.TempDir(), t.TempDir()
			pairs := generationFixturePairs()
			for index, directory := range []string{first, second} {
				for _, artifact := range pairs[index] {
					if err := os.WriteFile(filepath.Join(directory, artifact.name), artifact.body, 0o600); err != nil {
						t.Fatal(err)
					}
				}
			}
			manifest := filepath.Join(second, bookManifestName)
			var err error
			switch defect {
			case "extra":
				err = os.WriteFile(filepath.Join(second, "unexpected"), []byte("extra"), 0o600)
			case "missing":
				err = os.Remove(manifest)
			case "symlink":
				if err = os.Remove(manifest); err == nil {
					err = os.Symlink(filepath.Join(first, bookManifestName), manifest)
				}
			case "oversize":
				err = os.Truncate(manifest, maximumManifestBytes+1)
			}
			if err != nil {
				t.Fatal(err)
			}
			artifacts, err := compareRenderPairs(root, first, second)
			entries, listError := os.ReadDir(root)
			if err == nil || artifacts != nil || listError != nil || len(entries) != 0 || strings.Contains(err.Error(), "renders retained at") {
				t.Fatalf("malformed output published or retained: %v %v %v %v", artifacts, err, entries, listError)
			}
		})
	}
}
