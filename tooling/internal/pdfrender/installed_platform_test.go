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

const linuxBindingPackage = "node_modules/@rolldown/binding-linux-x64-gnu"

func addPlatformDependency(t *testing.T, root, relative string, constraints map[string]any, installed bool) {
	t.Helper()
	entry := map[string]any{"version": "1.0.0", "resolved": "https://example.invalid/binding.tgz", "integrity": "sha512-test", "optional": true}
	for key, value := range constraints {
		entry[key] = value
	}
	for _, file := range []string{"package-lock.json", "node_modules/.package-lock.json"} {
		if file != "package-lock.json" && !installed {
			continue
		}
		body, err := os.ReadFile(filepath.Join(root, file))
		if err != nil {
			t.Fatal(err)
		}
		var lock dependencyLock
		if err := json.Unmarshal(body, &lock); err != nil {
			t.Fatal(err)
		}
		lock.Packages[relative], err = json.Marshal(entry)
		if err != nil {
			t.Fatal(err)
		}
		writeDependencyJSON(t, root, file, lock)
	}
	if installed {
		name := relative[strings.LastIndex(relative, "node_modules/")+len("node_modules/"):]
		writeDependencyJSON(t, root, relative+"/package.json", map[string]string{"name": name, "version": "1.0.0"})
	}
}

func TestInstalledDependenciesRequireRendererPlatform(t *testing.T) {
	t.Parallel()
	for _, testCase := range []struct {
		name        string
		constraints map[string]any
		installed   bool
		mismatch    string
		failure     string
	}{
		{"linux-complete", map[string]any{"os": []string{"linux"}, "cpu": []string{"x64"}, "libc": []string{"glibc"}}, true, "", ""},
		{"linux-missing", map[string]any{"os": []string{"linux"}, "cpu": []string{"x64"}, "libc": []string{"glibc"}}, false, "", "required installed package"},
		{"unconstrained-required-missing", map[string]any{"optional": false}, false, "", "required installed package"},
		{"darwin-required-absent", map[string]any{"os": []string{"darwin"}, "optional": false}, false, "", ""},
		{"darwin-absent", map[string]any{"os": []string{"darwin"}}, false, "", ""},
		{"musl-absent", map[string]any{"os": []string{"linux"}, "cpu": []string{"x64"}, "libc": []string{"musl"}}, false, "", ""},
		{"arm64-absent", map[string]any{"cpu": []string{"arm64"}}, false, "", ""},
		{"unconstrained-optional-missing", nil, false, "", "required installed package"},
		{"negated-linux-absent", map[string]any{"os": []string{"!linux"}}, false, "", ""},
		{"negated-darwin-missing", map[string]any{"os": []string{"!darwin"}}, false, "", "required installed package"},
		{"allow-linux-missing", map[string]any{"os": []string{"darwin", "linux"}}, false, "", "required installed package"},
		{"deny-overrides-allow", map[string]any{"os": []string{"linux", "!linux"}}, false, "", ""},
		{"any-missing", map[string]any{"os": []string{"any"}}, false, "", "required installed package"},
		{"empty-missing", map[string]any{"os": []string{}}, false, "", "required installed package"},
		{"hidden-binding-version", map[string]any{"os": []string{"linux"}}, true, "node_modules/.package-lock.json", "hidden lock identity differs"},
		{"actual-binding-version", map[string]any{"os": []string{"linux"}}, true, linuxBindingPackage + "/package.json", "want @rolldown/binding-linux-x64-gnu@1.0.0"},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			t.Parallel()
			root := t.TempDir()
			writeInstalledDependencyFixture(t, root)
			addPlatformDependency(t, root, linuxBindingPackage, testCase.constraints, testCase.installed)
			if testCase.mismatch != "" {
				mutateDependencyFile(t, root, testCase.mismatch, "1.0.0", "0.9.0")
			}
			digest, err := inspectInstalledDependencies(context.Background(), root)
			if testCase.failure == "" {
				if err != nil || !rawSHA256Pattern.MatchString(digest) {
					t.Fatalf("inspection = %q, %v", digest, err)
				}
			} else if err == nil || !strings.Contains(err.Error(), testCase.failure) || !strings.Contains(err.Error(), linuxBindingPackage) {
				t.Fatalf("inspection = %q, %v; want %s and package path", digest, err, testCase.failure)
			}
		})
	}
}

func TestRendererPlatformRefusalBeforeDocker(t *testing.T) {
	t.Parallel()
	for _, verification := range []bool{false, true} {
		t.Run(fmt.Sprint(verification), func(t *testing.T) {
			t.Parallel()
			configuration := renderConfiguration(t)
			root := configuration.RepositoryRoot
			addPlatformDependency(t, root, linuxBindingPackage, map[string]any{"os": []string{"linux"}, "cpu": []string{"x64"}, "libc": []string{"glibc"}}, false)
			addPlatformDependency(t, root, "node_modules/@rolldown/binding-win32-x64-msvc", map[string]any{"os": []string{"win32"}, "cpu": []string{"x64"}}, true)
			npmLock, err := os.ReadFile(filepath.Join(projectRoot(t), "scripts/npm-runtime-lock.json"))
			if err != nil {
				t.Fatal(err)
			}
			writeDependencyBytes(t, root, "scripts/npm-runtime-lock.json", npmLock)
			var npm struct {
				Version string `json:"version"`
			}
			if err := json.Unmarshal(npmLock, &npm); err != nil {
				t.Fatal(err)
			}
			executor := &recordingExecutor{imageID: testImageID}
			if verification {
				_, err = verifyReproducibilityWithDependencies(context.Background(), configuration, "main", "", "build/evidence/proof.json", noOpPreparer{}, executor)
			} else {
				_, err = renderWithDependencies(context.Background(), configuration, "main", "", noOpPreparer{}, executor)
			}
			if len(executor.requests) != 0 {
				t.Errorf("platform-incompatible tree started %d Docker/Buildx commands", len(executor.requests))
			}
			for _, want := range []string{linuxBindingPackage, "host tree was installed for another platform", configuration.Lock.Node.Image, "npm " + npm.Version, "--platform linux/amd64", "node scripts/install-locked-npm.mjs && npm ci --no-audit"} {
				if err == nil || !strings.Contains(err.Error(), want) {
					t.Errorf("refusal = %v; want %q", err, want)
				}
			}
		})
	}
}

func TestRendererPlatformMissingPathsBoundedAndSorted(t *testing.T) {
	t.Parallel()
	for _, count := range []int{1, 5, 6} {
		t.Run(fmt.Sprint(count), func(t *testing.T) {
			t.Parallel()
			root := t.TempDir()
			writeInstalledDependencyFixture(t, root)
			for index := count - 1; index >= 0; index-- {
				addPlatformDependency(t, root, fmt.Sprintf("node_modules/binding-%d", index), map[string]any{"os": []string{"linux"}}, false)
			}
			_, err := inspectInstalledDependencies(context.Background(), root)
			if err == nil {
				t.Fatal("missing bindings accepted")
			}
			message := err.Error()
			previous := -1
			for index := 0; index < min(count, 5); index++ {
				position := strings.Index(message, fmt.Sprintf("node_modules/binding-%d", index))
				if position <= previous {
					t.Fatalf("missing or unsorted paths: %s", message)
				}
				previous = position
			}
			if count > 5 && (!strings.Contains(message, "6 total") || strings.Contains(message, "node_modules/binding-5")) {
				t.Fatalf("missing-path diagnostic unbounded or count absent: %s", message)
			}
		})
	}
}
