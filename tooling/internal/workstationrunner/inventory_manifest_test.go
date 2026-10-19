package workstationrunner

import (
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
)

func TestReadWorkstationManifestRefusesEveryMalformedManifest(t *testing.T) {
	expected := map[string]struct{}{"fixture-007": {}}
	for _, testCase := range []struct {
		name, filename, body, want string
	}{
		{"not json", "fixture-007.txt", "{}", "unsupported entry"},
		{"unknown artifact", "fixture-008.json", "{}", "no catalogue job"},
		{"duplicate name", "fixture-007.json", `{"artifact":"fixture-007","artifact":"fixture-007"}`, "validate unambiguous"},
		{"wrong shape", "fixture-007.json", `{"artifact":7}`, "decode workstation manifest"},
		{"artifact mismatch", "fixture-007.json", `{"artifact":"other","implementation":{"full_tests":["x"]}}`, "invalid artifact"},
		{"empty full_tests", "fixture-007.json", `{"artifact":"fixture-007","implementation":{"full_tests":[]}}`, "empty full_tests"},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			directory := t.TempDir()
			if err := os.WriteFile(filepath.Join(directory, testCase.filename), []byte(testCase.body), 0o600); err != nil {
				t.Fatal(err)
			}
			entry := onlyDirectoryEntry(t, directory)
			if _, _, err := readWorkstationManifest(directory, entry, expected); err == nil ||
				!strings.Contains(err.Error(), testCase.want) {
				t.Fatalf("readWorkstationManifest() error = %v, want %q", err, testCase.want)
			}
		})
	}
}

func TestReadWorkstationManifestRefusesASymlinkAndAcceptsOneManifest(t *testing.T) {
	expected := map[string]struct{}{"fixture-007": {}}
	directory := t.TempDir()
	target := filepath.Join(t.TempDir(), "fixture-007.json")
	body := `{"artifact":"fixture-007","implementation":{"full_tests":["experiments/workstation/a.test.mjs"]}}`
	if err := os.WriteFile(target, []byte(body), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(target, filepath.Join(directory, "fixture-007.json")); err != nil {
		t.Skipf("symlink unavailable: %v", err)
	}
	if _, _, err := readWorkstationManifest(directory, onlyDirectoryEntry(t, directory), expected); err == nil ||
		!strings.Contains(err.Error(), "unsupported entry") {
		t.Fatalf("symlinked manifest error = %v, want unsupported entry", err)
	}

	regular := t.TempDir()
	if err := os.WriteFile(filepath.Join(regular, "fixture-007.json"), []byte(body), 0o600); err != nil {
		t.Fatal(err)
	}
	artifact, paths, err := readWorkstationManifest(regular, onlyDirectoryEntry(t, regular), expected)
	if err != nil || artifact != "fixture-007" || !reflect.DeepEqual(paths, []string{"experiments/workstation/a.test.mjs"}) {
		t.Fatalf("readWorkstationManifest() = %q %q %v", artifact, paths, err)
	}
}

func TestAppendManifestFullTestsRefusesMalformedAndRepeatedPaths(t *testing.T) {
	for _, path := range []string{
		"experiments/other/a.test.mjs",
		"experiments/workstation/*.test.mjs",
		"experiments/workstation/a\\b.test.mjs",
		"experiments/workstation/./a.test.mjs",
		"experiments/workstation/a..b.test.mjs",
	} {
		if _, err := appendManifestFullTests(nil, map[string]struct{}{}, "fixture-007", []string{path}); err == nil ||
			!strings.Contains(err.Error(), "invalid full_tests path") {
			t.Fatalf("appendManifestFullTests(%q) error = %v, want invalid path", path, err)
		}
	}

	seen := map[string]struct{}{}
	first := "experiments/workstation/a.test.mjs"
	fullTests, err := appendManifestFullTests(nil, seen, "fixture-007", []string{first})
	if err != nil || !reflect.DeepEqual(fullTests, []manifestFullTest{{artifact: "fixture-007", path: first}}) {
		t.Fatalf("first append = %v %v", fullTests, err)
	}
	if _, err := appendManifestFullTests(fullTests, seen, "fixture-008", []string{first}); err == nil ||
		!strings.Contains(err.Error(), "repeat full_tests path") {
		t.Fatalf("repeated path error = %v, want duplicate refusal", err)
	}
}

func onlyDirectoryEntry(t *testing.T, directory string) os.DirEntry {
	t.Helper()
	entries, err := os.ReadDir(directory)
	if err != nil || len(entries) != 1 {
		t.Fatalf("ReadDir(%s) = %d entries, %v; want one", directory, len(entries), err)
	}
	return entries[0]
}
