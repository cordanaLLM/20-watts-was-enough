package docscheck

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"testing"
)

const exampleMermaidBody = "flowchart LR\n  A --> B\n"

func TestValidateRejectsUnbaselinedMarkdownToMMDMermaidDuplicate(t *testing.T) {
	t.Parallel()
	root := validRepository(t)
	writeFile(t, root, "docs/duplicate.md", mermaidFence("```", exampleMermaidBody))

	assertMermaidDiagnostic(t, Validate(root), "Unbaselined duplicate Mermaid body")
}

func TestValidateRejectsUnbaselinedMarkdownToMarkdownMermaidDuplicate(t *testing.T) {
	t.Parallel()
	root := validRepository(t)
	body := "flowchart LR\n  C --> D\n"
	writeFile(t, root, "docs/left.md", mermaidFence("```", body))
	writeFile(t, root, "docs/right.md", mermaidFence("```", body))

	assertMermaidDiagnostic(t, Validate(root), "Unbaselined duplicate Mermaid body")
}

func TestValidateRecognizesTildeMermaidFences(t *testing.T) {
	t.Parallel()
	root := validRepository(t)
	writeFile(t, root, "docs/duplicate.md", mermaidFence("~~~", exampleMermaidBody))

	assertMermaidDiagnostic(t, Validate(root), "Unbaselined duplicate Mermaid body")
}

func TestValidateAcceptsDistinctMermaidBodies(t *testing.T) {
	t.Parallel()
	root := validRepository(t)
	writeFile(t, root, "docs/left.md", mermaidFence("```", "flowchart LR\n  C --> D\n"))
	writeFile(t, root, "docs/right.md", mermaidFence("```", "flowchart LR\n  E --> F\n"))

	result := Validate(root)
	if len(result.Errors) != 0 {
		t.Fatalf("Validate() errors = %v", result.Errors)
	}
}

func TestValidateAcceptsExactMermaidDuplicateBaseline(t *testing.T) {
	t.Parallel()
	root := validRepository(t)
	writeFile(t, root, "docs/duplicate.md", mermaidFence("```", exampleMermaidBody))
	writeMermaidBaseline(t, root, exampleMermaidBody, "assets/diagrams/example.mmd", "docs/duplicate.md")

	result := Validate(root)
	if len(result.Errors) != 0 {
		t.Fatalf("Validate() errors = %v", result.Errors)
	}
}

func TestValidateCountsRepeatedMermaidBodiesWithinOnePath(t *testing.T) {
	t.Parallel()
	root := validRepository(t)
	body := "flowchart LR\n  C --> D\n"
	writeFile(t, root, "docs/repeated.md", mermaidFence("```", body)+mermaidFence("~~~", body))
	writeMermaidBaseline(t, root, body, "docs/repeated.md", "docs/repeated.md")

	result := Validate(root)
	if len(result.Errors) != 0 {
		t.Fatalf("Validate() errors = %v", result.Errors)
	}
}

func TestValidateRejectsChangedMermaidDuplicateDebt(t *testing.T) {
	t.Parallel()
	tests := []struct {
		name          string
		baselinePaths []string
		actualPaths   []string
	}{
		{
			name:          "enlarged group",
			baselinePaths: []string{"assets/diagrams/example.mmd", "docs/left.md"},
			actualPaths:   []string{"docs/left.md", "docs/right.md"},
		},
		{
			name:          "changed path",
			baselinePaths: []string{"assets/diagrams/example.mmd", "docs/old.md"},
			actualPaths:   []string{"docs/current.md"},
		},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()
			root := validRepository(t)
			for _, relative := range test.actualPaths {
				writeFile(t, root, relative, mermaidFence("```", exampleMermaidBody))
			}
			writeMermaidBaseline(t, root, exampleMermaidBody, test.baselinePaths...)

			assertMermaidDiagnostic(t, Validate(root), "Mermaid duplicate debt changed")
		})
	}
}

func TestValidateRejectsMalformedAndStaleMermaidBaselines(t *testing.T) {
	t.Parallel()
	t.Run("malformed", func(t *testing.T) {
		t.Parallel()
		root := validRepository(t)
		writeFile(t, root, mermaidBaselineRelativePath, `{"schemaVersion":1,"groups":[],"schemaVersion":1}`)

		assertMermaidDiagnostic(t, Validate(root), "repeats name")
	})
	t.Run("stale", func(t *testing.T) {
		t.Parallel()
		root := validRepository(t)
		writeMermaidBaseline(t, root, exampleMermaidBody, "assets/diagrams/example.mmd", "docs/removed.md")

		assertMermaidDiagnostic(t, Validate(root), "Stale Mermaid duplicate baseline entry")
	})
}

func TestValidateRejectsMermaidBaselineBoundaryViolations(t *testing.T) {
	t.Parallel()
	tests := []struct {
		name       string
		mutate     func(t *testing.T, root string)
		diagnostic string
	}{
		{
			name: "missing",
			mutate: func(t *testing.T, root string) {
				t.Helper()
				if err := os.Remove(filepath.Join(root, filepath.FromSlash(mermaidBaselineRelativePath))); err != nil {
					t.Fatalf("Remove() error = %v", err)
				}
			},
			diagnostic: notExistText(t),
		},
		{
			name: "trailing data",
			mutate: func(t *testing.T, root string) {
				writeFile(t, root, mermaidBaselineRelativePath, `{"schemaVersion":1,"groups":[]} {}`)
			},
			diagnostic: "trailing data",
		},
		{
			name: "unknown field",
			mutate: func(t *testing.T, root string) {
				writeFile(t, root, mermaidBaselineRelativePath, `{"schemaVersion":1,"groups":[],"repair":true}`)
			},
			diagnostic: "unknown field",
		},
		{
			name: "path escape",
			mutate: func(t *testing.T, root string) {
				writeMermaidBaseline(t, root, exampleMermaidBody, "../escape.md", "assets/diagrams/example.mmd")
			},
			diagnostic: "non-canonical repository path",
		},
		{
			name: "oversized",
			mutate: func(t *testing.T, root string) {
				writeFile(t, root, mermaidBaselineRelativePath, strings.Repeat(" ", maximumMermaidBaselineBytes+1))
			},
			diagnostic: "exceeds",
		},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()
			root := validRepository(t)
			test.mutate(t, root)

			assertMermaidDiagnostic(t, Validate(root), test.diagnostic)
		})
	}
}

func TestValidateRejectsSymlinkedMermaidBaseline(t *testing.T) {
	t.Parallel()
	root := validRepository(t)
	baselinePath := filepath.Join(root, filepath.FromSlash(mermaidBaselineRelativePath))
	if err := os.Remove(baselinePath); err != nil {
		t.Fatalf("Remove() error = %v", err)
	}
	if err := os.Symlink(filepath.Join(root, "README.md"), baselinePath); err != nil {
		t.Skipf("Symlink() unavailable: %v", err)
	}

	assertMermaidDiagnostic(t, Validate(root), "must not contain symlinks")
}

func TestValidateRejectsIntermediateSymlinksForMermaidInputs(t *testing.T) {
	t.Parallel()
	for _, test := range []struct {
		name      string
		component string
	}{
		{name: "diagram directory ancestor", component: "assets"},
		{name: "baseline ancestor", component: "tooling/internal"},
	} {
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()
			root := validRepository(t)
			original := filepath.Join(root, filepath.FromSlash(test.component))
			moved := original + "-real"
			if err := os.Rename(original, moved); err != nil {
				t.Fatalf("Rename() error = %v", err)
			}
			if err := os.Symlink(moved, original); err != nil {
				t.Skipf("Symlink() unavailable: %v", err)
			}

			assertMermaidDiagnostic(t, Validate(root), "must not contain symlinks")
		})
	}
}

func TestValidateSkipsDebtComparisonForIncompleteMermaidInventory(t *testing.T) {
	t.Parallel()
	for _, test := range []struct {
		name       string
		invalidate func(t *testing.T, root, sourcePath string)
		diagnostic string
	}{
		{
			name: "symlinked source",
			invalidate: func(t *testing.T, root, sourcePath string) {
				t.Helper()
				if err := os.Remove(sourcePath); err != nil {
					t.Fatalf("Remove() error = %v", err)
				}
				if err := os.Symlink(filepath.Join(root, "README.md"), sourcePath); err != nil {
					t.Skipf("Symlink() unavailable: %v", err)
				}
			},
			diagnostic: "must be a regular file",
		},
		{
			name: "oversized source",
			invalidate: func(t *testing.T, _ string, sourcePath string) {
				t.Helper()
				if err := os.WriteFile(sourcePath, []byte(strings.Repeat(" ", maxMarkdownFileBytes+1)), 0o600); err != nil {
					t.Fatalf("WriteFile() error = %v", err)
				}
			},
			diagnostic: "Mermaid source exceeds",
		},
	} {
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()
			root := validRepository(t)
			writeMermaidBaseline(t, root, exampleMermaidBody, "assets/diagrams/example.mmd", "docs/missing.md")
			sourcePath := filepath.Join(root, "assets", "diagrams", "example.mmd")
			test.invalidate(t, root, sourcePath)

			result := Validate(root)
			assertMermaidDiagnostic(t, result, test.diagnostic)
			assertNoMermaidDebtDiagnostic(t, result)
		})
	}
}

func TestCollectMarkdownMermaidMarksTruncatedInventoryIncomplete(t *testing.T) {
	t.Parallel()
	report := &collector{}
	documents := []markdownDocument{{
		relative: "docs/example.md",
		content:  []byte(mermaidFence("```", exampleMermaidBody)),
	}}
	sources, complete := collectMarkdownMermaid(documents, 0, report)
	if complete {
		t.Fatal("collectMarkdownMermaid() complete = true, want false")
	}
	if len(sources) != 0 {
		t.Fatalf("collectMarkdownMermaid() sources = %v, want none after zero-source limit", sources)
	}
	if !containsDiagnostic(report.errors, "Mermaid source count exceeds") {
		t.Fatalf("collectMarkdownMermaid() errors = %v, want source-count diagnostic", report.errors)
	}
}

func TestValidateSkipsDebtComparisonForIncompleteMarkdownInventory(t *testing.T) {
	t.Parallel()
	root := validRepository(t)
	writeMermaidBaseline(t, root, exampleMermaidBody, "assets/diagrams/example.mmd", "docs/missing.md")
	oversized := filepath.Join(root, "aaa-oversized.md")
	if err := os.WriteFile(oversized, nil, 0o600); err != nil {
		t.Fatalf("WriteFile() error = %v", err)
	}
	if err := os.Truncate(oversized, maxMarkdownFileBytes+1); err != nil {
		t.Fatalf("Truncate() error = %v", err)
	}

	result := Validate(root)
	assertMermaidDiagnostic(t, result, "Markdown file exceeds")
	assertNoMermaidDebtDiagnostic(t, result)
}

func TestValidateRejectsSymlinkedMarkdownInventoryWithoutComparingDebt(t *testing.T) {
	t.Parallel()
	for _, test := range []struct {
		name         string
		baselinePath string
		createLink   func(t *testing.T, root string)
	}{
		{
			name:         "file",
			baselinePath: "docs/linked.md",
			createLink: func(t *testing.T, root string) {
				t.Helper()
				link := filepath.Join(root, "docs", "linked.md")
				if err := os.MkdirAll(filepath.Dir(link), 0o755); err != nil {
					t.Fatalf("MkdirAll() error = %v", err)
				}
				if err := os.Symlink(filepath.Join(root, "README.md"), link); err != nil {
					t.Skipf("Symlink() unavailable: %v", err)
				}
			},
		},
		{
			name:         "directory",
			baselinePath: "linked-docs/example.md",
			createLink: func(t *testing.T, root string) {
				t.Helper()
				outside := t.TempDir()
				writeFile(t, outside, "example.md", mermaidFence("```", exampleMermaidBody))
				if err := os.Symlink(outside, filepath.Join(root, "linked-docs")); err != nil {
					t.Skipf("Symlink() unavailable: %v", err)
				}
			},
		},
	} {
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()
			root := validRepository(t)
			writeMermaidBaseline(t, root, exampleMermaidBody, "assets/diagrams/example.mmd", test.baselinePath)
			test.createLink(t, root)

			result := Validate(root)
			assertMermaidDiagnostic(t, result, "Markdown inventory path must not be a symlink")
			assertNoMermaidDebtDiagnostic(t, result)
		})
	}
}

func TestValidateMermaidBaselineRejectsNondeterministicOrder(t *testing.T) {
	t.Parallel()
	orderedOccurrences := []mermaidBaselineOccurrence{
		{Path: "docs/a.md", Count: 1},
		{Path: "docs/b.md", Count: 1},
	}
	tests := []struct {
		name       string
		document   mermaidDuplicateBaseline
		diagnostic string
	}{
		{
			name: "groups",
			document: mermaidDuplicateBaseline{SchemaVersion: 1, Groups: []mermaidBaselineGroup{
				{SHA256: strings.Repeat("b", 64), Occurrences: orderedOccurrences},
				{SHA256: strings.Repeat("a", 64), Occurrences: orderedOccurrences},
			}},
			diagnostic: "unique SHA-256 order",
		},
		{
			name: "occurrences",
			document: mermaidDuplicateBaseline{SchemaVersion: 1, Groups: []mermaidBaselineGroup{{
				SHA256: strings.Repeat("a", 64),
				Occurrences: []mermaidBaselineOccurrence{
					{Path: "docs/b.md", Count: 1},
					{Path: "docs/a.md", Count: 1},
				},
			}}},
			diagnostic: "unique path order",
		},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()
			_, err := validateMermaidBaseline(test.document)
			if err == nil || !strings.Contains(err.Error(), test.diagnostic) {
				t.Fatalf("validateMermaidBaseline() error = %v, want diagnostic containing %q", err, test.diagnostic)
			}
		})
	}
}

func TestValidateExcludesDerivativeAndGeneratedMermaidBodies(t *testing.T) {
	t.Parallel()
	root := validRepository(t)
	for _, relative := range []string{
		"sources/imported.md",
		"translations/de/derivative.md",
		"dist/generated.md",
	} {
		writeFile(t, root, relative, mermaidFence("```", exampleMermaidBody))
	}

	result := Validate(root)
	if len(result.Errors) != 0 {
		t.Fatalf("Validate() errors = %v", result.Errors)
	}
}

func mermaidFence(marker, body string) string {
	return fmt.Sprintf("%smermaid\n%s%s\n", marker, body, marker)
}

func writeMermaidBaseline(t *testing.T, root, body string, paths ...string) {
	t.Helper()
	counts := make(map[string]int)
	for _, relative := range paths {
		counts[relative]++
	}
	sortedPaths := make([]string, 0, len(counts))
	for relative := range counts {
		sortedPaths = append(sortedPaths, relative)
	}
	sort.Strings(sortedPaths)
	occurrences := make([]mermaidBaselineOccurrence, 0, len(sortedPaths))
	for _, relative := range sortedPaths {
		occurrences = append(occurrences, mermaidBaselineOccurrence{Path: relative, Count: counts[relative]})
	}
	digest := sha256.Sum256([]byte(body))
	document := mermaidDuplicateBaseline{
		SchemaVersion: 1,
		Groups: []mermaidBaselineGroup{{
			SHA256:      hex.EncodeToString(digest[:]),
			Occurrences: occurrences,
		}},
	}
	encoded, err := json.MarshalIndent(document, "", "  ")
	if err != nil {
		t.Fatalf("MarshalIndent() error = %v", err)
	}
	writeFile(t, root, mermaidBaselineRelativePath, string(encoded)+"\n")
}

func assertMermaidDiagnostic(t *testing.T, result Result, substring string) {
	t.Helper()
	if !containsDiagnostic(result.Errors, substring) {
		t.Fatalf("Validate() errors = %v, want diagnostic containing %q", result.Errors, substring)
	}
}

// notExistText returns the operating system's own wording for a missing path.
// inspectMermaidRepositoryPath wraps the os.Lstat error verbatim, so the
// boundary test asserts the not-exist cause without hard-coding POSIX text.
func notExistText(t *testing.T) string {
	t.Helper()
	_, err := os.Lstat(filepath.Join(t.TempDir(), "missing"))
	var pathError *fs.PathError
	if !errors.As(err, &pathError) || !errors.Is(err, fs.ErrNotExist) {
		t.Fatalf("Lstat(missing) error = %v, want *fs.PathError wrapping fs.ErrNotExist", err)
	}
	return pathError.Err.Error()
}

func assertNoMermaidDebtDiagnostic(t *testing.T, result Result) {
	t.Helper()
	for _, diagnostic := range []string{
		"Unbaselined duplicate Mermaid body",
		"Mermaid duplicate debt changed",
		"Stale Mermaid duplicate baseline entry",
	} {
		if containsDiagnostic(result.Errors, diagnostic) {
			t.Fatalf("Validate() errors = %v, want no debt comparison after incomplete inventory", result.Errors)
		}
	}
}
