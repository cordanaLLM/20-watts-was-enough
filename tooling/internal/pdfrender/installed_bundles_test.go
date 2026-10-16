package pdfrender

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestInstalledDependenciesBindBundledChildrenToTheContainingArchive(t *testing.T) {
	t.Parallel()
	for _, testCase := range []bundledDependencyTestCase{
		{name: "omitted-optional-bundle", listed: true},
		{name: "excluded-platform-bundle", listed: true, excluded: true},
		{name: "installed-bundle", listed: true, installed: true},
		{name: "unlisted-child"},
		{name: "orphan-child", listed: true, orphan: true},
		{name: "required-bundle-omission", listed: true, required: true},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			t.Parallel()
			root := t.TempDir()
			writeInstalledDependencyFixture(t, root)
			writeBundledDependencyFixture(t, root, testCase)
			digest, err := inspectInstalledDependencies(context.Background(), root)
			failure := ""
			switch {
			case testCase.orphan:
				failure = "no locked parent"
			case !testCase.listed:
				failure = "not listed"
			case !testCase.installed && !testCase.excluded:
				failure = "required installed package"
			}
			if failure == "" {
				if err != nil || !rawSHA256Pattern.MatchString(digest) {
					t.Fatalf("bundled metadata = %q %v", digest, err)
				}
			} else if err == nil || !strings.Contains(err.Error(), failure) {
				t.Fatalf("bundled metadata error = %v, want %q", err, failure)
			}
		})
	}
}

type bundledDependencyTestCase struct {
	name                                          string
	installed, listed, orphan, required, excluded bool
}

func writeBundledDependencyFixture(t *testing.T, root string, testCase bundledDependencyTestCase) {
	t.Helper()
	body, err := os.ReadFile(filepath.Join(root, "package-lock.json"))
	if err != nil {
		t.Fatal(err)
	}
	var lock dependencyLock
	if err := json.Unmarshal(body, &lock); err != nil {
		t.Fatal(err)
	}
	parent := map[string]any{"version": "1.0.0", "resolved": "https://example.invalid/bundle.tgz", "integrity": "sha512-parent", "optional": !testCase.required}
	if testCase.excluded {
		parent["cpu"] = []string{"wasm32"}
	}
	if testCase.listed {
		parent["bundleDependencies"] = []string{"child"}
	}
	child := map[string]any{"version": "2.0.0", "inBundle": true, "optional": !testCase.required}
	if !testCase.orphan {
		lock.Packages["node_modules/@vendor/bundle"], err = json.Marshal(parent)
		if err != nil {
			t.Fatal(err)
		}
	}
	lock.Packages["node_modules/@vendor/bundle/node_modules/child"], err = json.Marshal(child)
	if err != nil {
		t.Fatal(err)
	}
	writeDependencyJSON(t, root, "package-lock.json", lock)
	if testCase.installed {
		writeDependencyJSON(t, root, "node_modules/.package-lock.json", lock)
		writeDependencyJSON(t, root, "node_modules/@vendor/bundle/package.json", map[string]string{"name": "@vendor/bundle", "version": "1.0.0"})
		writeDependencyJSON(t, root, "node_modules/@vendor/bundle/node_modules/child/package.json", map[string]string{"name": "child", "version": "2.0.0"})
	}
}
