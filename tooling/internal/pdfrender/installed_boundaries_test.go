package pdfrender

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestInstalledDependencyPreflightStopsBothCommandsBeforeDocker(t *testing.T) {
	t.Parallel()
	for _, verification := range []bool{false, true} {
		t.Run(fmt.Sprint(verification), func(t *testing.T) {
			t.Parallel()
			configuration := renderConfiguration(t)
			root := configuration.RepositoryRoot
			mutateDependencyFile(t, root, "node_modules/.package-lock.json", "0.18.5", "0.18.4")
			executor := &recordingExecutor{imageID: testImageID}
			var err error
			if verification {
				_, err = verifyReproducibilityWithDependencies(context.Background(), configuration, "main", "", ".workingdir/evidence/proof.json", noOpPreparer{}, executor)
			} else {
				_, err = renderWithDependencies(context.Background(), configuration, "main", "", noOpPreparer{}, executor)
			}
			if err == nil || !strings.Contains(err.Error(), "hidden lock identity differs") {
				t.Fatalf("preflight error = %v", err)
			}
			if len(executor.requests) != 0 {
				t.Fatalf("stale installation started %d Docker commands", len(executor.requests))
			}
		})
	}
}

type installedDriftExecutor struct {
	t           *testing.T
	root        string
	delegate    commandExecutor
	trigger     string
	triggered   bool
	renderCount int
}

func (executor *installedDriftExecutor) run(ctx context.Context, request commandRequest) ([]byte, error) {
	body, err := executor.delegate.run(ctx, request)
	phase := request.operation
	if phase == "run pinned PDF renderer image" {
		executor.renderCount++
		phase = fmt.Sprintf("render-%d", executor.renderCount)
	}
	if err == nil && !executor.triggered && phase == executor.trigger {
		executor.triggered = true
		// A consistent metadata edit still invalidates the frozen render input.
		writeDependencyJSON(executor.t, executor.root, installedTestPackage+"/package.json", map[string]string{"name": "katex", "version": "0.18.5", "description": "changed during render"})
	}
	return body, err
}

func TestInstalledDependencyDriftNeverPublishesTheRenderedPair(t *testing.T) {
	t.Parallel()
	for _, phase := range []string{"build pinned PDF renderer image", "render-1", "render-2", "remove locked Docker BuildKit builder"} {
		t.Run(phase, func(t *testing.T) {
			t.Parallel()
			configuration := renderConfiguration(t)
			root := configuration.RepositoryRoot
			pdf, manifest := []byte("old PDF"), []byte("old manifest")
			writePublicationFixture(t, root, pdf, manifest)
			delegate := &recordingExecutor{imageID: testImageID}
			executor := &installedDriftExecutor{t: t, root: root, delegate: delegate, trigger: phase}
			_, err := renderWithDependencies(context.Background(), configuration, "main", "", noOpPreparer{}, executor)
			if !executor.triggered || err == nil || !strings.Contains(err.Error(), "metadata changed during rendering") {
				t.Fatalf("phase %q triggered=%t error=%v", phase, executor.triggered, err)
			}
			assertPublicationFixture(t, root, pdf, manifest)
			if len(requestsWithPrefix(delegate.requests, "buildx", "rm")) != 1 {
				t.Fatal("owned builder was not cleaned exactly once")
			}
		})
	}
}

func TestInstalledDependencyDriftNeverWritesAPassingReproducibilityReceipt(t *testing.T) {
	t.Parallel()
	configuration := renderConfiguration(t)
	delegate := &reproducibilityExecutor{
		imageIDs: []string{testProofConfigDigest, testProofConfigDigest}, manifestDigests: []string{testManifestDigest, testManifestDigest},
	}
	executor := &installedDriftExecutor{t: t, root: configuration.RepositoryRoot, delegate: delegate, trigger: "render-2"}
	relative := ".workingdir/evidence/publication/dependency-drift.json"
	_, err := verifyReproducibilityWithDependencies(context.Background(), configuration, "main", "", relative, reproducibilityFixturePreparer{}, executor)
	if !executor.triggered || err == nil || !strings.Contains(err.Error(), "metadata changed during rendering") {
		t.Fatalf("second-render drift: triggered=%t error=%v", executor.triggered, err)
	}
	if _, err := os.Stat(filepath.Join(configuration.RepositoryRoot, filepath.FromSlash(relative))); !os.IsNotExist(err) {
		t.Fatalf("invalid receipt exists or cannot be inspected: %v", err)
	}
	if len(requestsWithPrefix(delegate.requests, "buildx", "rm")) != 2 || len(requestsWithPrefix(delegate.requests, "image", "rm", "--force")) != 2 {
		t.Fatal("reproducibility failure did not clean both owned builders/images")
	}
}

func (executor *installedDriftExecutor) inspectImageArchive(ctx context.Context, configuration Configuration, imageID, manifestDigest string) (ImageConfigProof, error) {
	return executor.delegate.(imageArchiveExecutor).inspectImageArchive(ctx, configuration, imageID, manifestDigest)
}

func TestInstalledDependencyInventoryRejectsInvalidEmptyScopesAndAuxiliaries(t *testing.T) {
	t.Parallel()
	for _, name := range []string{"@..", "@", "@bad scope", ".unknown"} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			root := t.TempDir()
			writeInstalledDependencyFixture(t, root)
			if err := os.Mkdir(filepath.Join(root, "node_modules", name), 0o755); err != nil {
				t.Fatal(err)
			}
			_, err := inspectInstalledDependencies(context.Background(), root)
			if err == nil || !strings.Contains(err.Error(), "unsafe") {
				t.Fatalf("invalid empty directory %q accepted: %v", name, err)
			}
		})
	}
	root := t.TempDir()
	writeInstalledDependencyFixture(t, root)
	for _, name := range []string{".bin", ".cache", ".vite", ".vite-temp", "@empty-valid"} {
		if err := os.Mkdir(filepath.Join(root, "node_modules", name), 0o755); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := inspectInstalledDependencies(context.Background(), root); err != nil {
		t.Fatalf("npm/Vite auxiliary directories rejected: %v", err)
	}
}

func TestInstalledDependencyInventoryBoundsDirectoryEntries(t *testing.T) {
	t.Parallel()
	root := t.TempDir()
	writeInstalledDependencyFixture(t, root)
	for index := 0; index < maximumInstalledPackages; index++ {
		if err := os.Mkdir(filepath.Join(root, "node_modules", fmt.Sprintf("@scope-%04d", index)), 0o755); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := installedPackagePaths(context.Background(), root); err == nil || !strings.Contains(err.Error(), "directory bound") {
		t.Fatalf("directory bound = %v", err)
	}
}

func TestInstalledDependencyInventoryBoundsPackagesAcrossScopes(t *testing.T) {
	t.Parallel()
	root := t.TempDir()
	for _, scope := range []string{"@first", "@second"} {
		for index := 0; index < maximumInstalledPackages/2+1; index++ {
			if err := os.MkdirAll(filepath.Join(root, "node_modules", scope, fmt.Sprintf("pkg-%04d", index)), 0o755); err != nil {
				t.Fatal(err)
			}
		}
	}
	if _, err := installedPackagePaths(context.Background(), root); err == nil || !strings.Contains(err.Error(), "4096-package bound") {
		t.Fatalf("package count bound = %v", err)
	}
}
