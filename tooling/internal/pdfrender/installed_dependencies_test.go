package pdfrender

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

const installedTestPackage = "node_modules/katex"

func writeInstalledDependencyFixture(t *testing.T, root string) {
	t.Helper()
	entry := dependencyPackage{Version: "0.18.5", Resolved: "https://registry.npmjs.org/katex/-/katex-0.18.5.tgz", Integrity: "sha512-test-fixture"}
	encoded, err := json.Marshal(entry)
	if err != nil {
		t.Fatal(err)
	}
	lock := dependencyLock{LockfileVersion: 3, Packages: map[string]json.RawMessage{installedTestPackage: encoded}}
	writeDependencyJSON(t, root, "package-lock.json", lock)
	writeDependencyJSON(t, root, "node_modules/.package-lock.json", lock)
	writeDependencyJSON(t, root, installedTestPackage+"/package.json", map[string]string{"name": "katex", "version": "0.18.5"})
}

func writeDependencyJSON(t *testing.T, root, relative string, value any) {
	t.Helper()
	body, err := json.Marshal(value)
	if err != nil {
		t.Fatal(err)
	}
	writeDependencyBytes(t, root, relative, body)
}

func writeDependencyBytes(t *testing.T, root, relative string, body []byte) {
	t.Helper()
	name := filepath.Join(root, filepath.FromSlash(relative))
	if err := os.MkdirAll(filepath.Dir(name), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(name, body, 0o644); err != nil {
		t.Fatal(err)
	}
}

func mutateDependencyFile(t *testing.T, root, relative, old, replacement string) {
	t.Helper()
	body, err := os.ReadFile(filepath.Join(root, filepath.FromSlash(relative)))
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(body), old) {
		t.Fatalf("fixture %s omits %q", relative, old)
	}
	writeDependencyBytes(t, root, relative, []byte(strings.ReplaceAll(string(body), old, replacement)))
}

func TestInstalledDependenciesAcceptMatchingMetadataWithoutWriting(t *testing.T) {
	t.Parallel()
	root := t.TempDir()
	writeInstalledDependencyFixture(t, root)
	before, err := os.Stat(filepath.Join(root, "node_modules/.package-lock.json"))
	if err != nil {
		t.Fatal(err)
	}
	first, err := inspectInstalledDependencies(context.Background(), root)
	if err != nil || !rawSHA256Pattern.MatchString(first) {
		t.Fatalf("inspection = %q, %v", first, err)
	}
	second, err := inspectInstalledDependencies(context.Background(), root)
	after, statError := os.Stat(filepath.Join(root, "node_modules/.package-lock.json"))
	if err != nil || statError != nil || first != second || !before.ModTime().Equal(after.ModTime()) {
		t.Fatalf("read-only repeat changed identity or install: %q %q %v %v", first, second, err, statError)
	}
}

func TestInstalledDependenciesRejectStaleLockAndActualManifest(t *testing.T) {
	t.Parallel()
	for _, testCase := range []struct{ name, file, old, replacement, failure string }{
		{"copied-katex-0184", "node_modules/.package-lock.json", "0.18.5", "0.18.4", "hidden lock identity differs"},
		{"forged-hidden-lock", installedTestPackage + "/package.json", "0.18.5", "0.18.4", "want katex@0.18.5"},
		{"wrong-name", installedTestPackage + "/package.json", "katex", "unrelated", "want katex@0.18.5"},
		{"wrong-integrity", "node_modules/.package-lock.json", "sha512-test-fixture", "sha512-other-fixture", "hidden lock identity differs"},
		{"wrong-resolved", "node_modules/.package-lock.json", "registry.npmjs.org", "example.invalid", "hidden lock identity differs"},
		{"unsupported-lock", "package-lock.json", "\"lockfileVersion\":3", "\"lockfileVersion\":2", "lockfileVersion 3"},
		{"unsafe-path", "package-lock.json", "node_modules/katex", "node_modules/../katex", "unsafe package path"},
		{"linked-lock", "package-lock.json", "\"link\":false", "\"link\":true", "linked installs"},
		{"null-metadata", "package-lock.json", "\"version\":\"0.18.5\"", "\"version\":null", "requires version"},
		{"missing-integrity", "package-lock.json", "sha512-test-fixture", "", "requires version"},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			t.Parallel()
			root := t.TempDir()
			writeInstalledDependencyFixture(t, root)
			mutateDependencyFile(t, root, testCase.file, testCase.old, testCase.replacement)
			_, err := inspectInstalledDependencies(context.Background(), root)
			if err == nil || !strings.Contains(err.Error(), testCase.failure) || !strings.Contains(err.Error(), "npm ci --no-audit") {
				t.Fatalf("inspection error = %v, want %q and repair command", err, testCase.failure)
			}
		})
	}
}

func TestInstalledDependenciesRejectMissingExtraAndMalformedMetadata(t *testing.T) {
	t.Parallel()
	for _, testCase := range []struct {
		name    string
		mutate  func(*testing.T, string)
		failure string
	}{
		{"missing-hidden-lock", func(t *testing.T, r string) {
			if err := os.Remove(filepath.Join(r, "node_modules/.package-lock.json")); err != nil {
				t.Fatal(err)
			}
		}, "node_modules/.package-lock.json"},
		{"missing-manifest", func(t *testing.T, r string) {
			if err := os.Remove(filepath.Join(r, installedTestPackage, "package.json")); err != nil {
				t.Fatal(err)
			}
		}, "package.json"},
		{"extra-installed", func(t *testing.T, r string) {
			writeDependencyJSON(t, r, "node_modules/extra/package.json", map[string]string{"name": "extra", "version": "1.0.0"})
		}, "unexpected installed package"},
		{"missing-installed", func(t *testing.T, r string) {
			if err := os.Rename(filepath.Join(r, installedTestPackage), filepath.Join(r, "saved-katex")); err != nil {
				t.Fatal(err)
			}
		}, "hidden lock names missing"},
		{"duplicate-json", func(t *testing.T, r string) {
			mutateDependencyFile(t, r, "package-lock.json", "\"lockfileVersion\":3", "\"lockfileVersion\":3,\"lockfileVersion\":3")
		}, "repeats name"},
		{"trailing-json", func(t *testing.T, r string) {
			writeDependencyBytes(t, r, "node_modules/.package-lock.json", []byte("{} {}"))
		}, "trailing data"},
		{"malformed-json", func(t *testing.T, r string) {
			writeDependencyBytes(t, r, installedTestPackage+"/package.json", []byte("{"))
		}, "decode JSON"},
		{"oversized-lock", func(t *testing.T, r string) {
			writeDependencyBytes(t, r, "package-lock.json", []byte(strings.Repeat(" ", maximumDependencyLockBytes+1)))
		}, "size must be"},
		{"oversized-manifest", func(t *testing.T, r string) {
			writeDependencyBytes(t, r, installedTestPackage+"/package.json", []byte(strings.Repeat(" ", maximumDependencyManifestBytes+1)))
		}, "size must be"},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			t.Parallel()
			root := t.TempDir()
			writeInstalledDependencyFixture(t, root)
			testCase.mutate(t, root)
			_, err := inspectInstalledDependencies(context.Background(), root)
			if err == nil || !strings.Contains(err.Error(), testCase.failure) {
				t.Fatalf("inspection error = %v, want %q", err, testCase.failure)
			}
		})
	}
}

func TestInstalledDependenciesRejectSymlinks(t *testing.T) {
	t.Parallel()
	for _, relative := range []string{"node_modules", "node_modules/.package-lock.json", installedTestPackage, installedTestPackage + "/package.json"} {
		t.Run(relative, func(t *testing.T) {
			t.Parallel()
			root := t.TempDir()
			writeInstalledDependencyFixture(t, root)
			name := filepath.Join(root, filepath.FromSlash(relative))
			saved := filepath.Join(root, "saved")
			if err := os.Rename(name, saved); err != nil {
				t.Fatal(err)
			}
			if err := os.Symlink(saved, name); err != nil {
				t.Fatal(err)
			}
			_, err := inspectInstalledDependencies(context.Background(), root)
			if err == nil || (!strings.Contains(err.Error(), "symlink") && !strings.Contains(err.Error(), "non-symlink")) {
				t.Fatalf("linked %s accepted: %v", relative, err)
			}
		})
	}
}

func TestInstalledDependenciesBoundPathsCountsMetadataAndCancellation(t *testing.T) {
	t.Parallel()
	for _, relative := range []string{"../node_modules/foo", "node_modules/@scope/../foo", "node_modules/foo\\bar", strings.Repeat("node_modules/foo/", 9) + "node_modules/bar", strings.Repeat("a", 2049)} {
		if validDependencyPath(relative) {
			t.Fatalf("unsafe or over-depth path accepted: %q", relative)
		}
	}
	root := t.TempDir()
	writeInstalledDependencyFixture(t, root)
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err := inspectInstalledDependencies(ctx, root); err == nil || !strings.Contains(err.Error(), "canceled") {
		t.Fatalf("cancelled inspection = %v", err)
	}
	snapshot := installedDependencySnapshot{root: root, bytes: maximumDependencyMetadataBytes}
	if _, err := snapshot.read(context.Background(), "package-lock.json", maximumDependencyLockBytes); err == nil || !strings.Contains(err.Error(), "32 MiB") {
		t.Fatalf("metadata cap = %v", err)
	}
	packages := make(map[string]json.RawMessage, maximumInstalledPackages+2)
	for index := 0; index < maximumInstalledPackages+2; index++ {
		packages[fmt.Sprintf("node_modules/pkg-%d", index)] = json.RawMessage(`{"version":"1.0.0","resolved":"https://example.invalid/p.tgz","integrity":"sha512-test"}`)
	}
	writeDependencyJSON(t, root, "package-lock.json", dependencyLock{LockfileVersion: 3, Packages: packages})
	if _, err := inspectInstalledDependencies(context.Background(), root); err == nil || !strings.Contains(err.Error(), "package records") {
		t.Fatalf("package inventory bound = %v", err)
	}
}
