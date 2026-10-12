package docscheck

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestValidateAcceptsMinimalRepository(t *testing.T) {
	t.Parallel()
	root := validRepository(t)
	result := validateFixture(root)
	if len(result.Errors) != 0 {
		t.Fatalf("Validate() errors = %v", result.Errors)
	}
	if result.MarkdownFiles != 4 || result.Chapters != 1 || result.MermaidFiles != 1 {
		t.Fatalf("Validate() counts = %+v", result)
	}
}

func TestValidateReportsTampering(t *testing.T) {
	t.Parallel()
	tests := []struct {
		name       string
		mutate     func(t *testing.T, root string)
		diagnostic string
	}{
		{
			name: "broken reference link",
			mutate: func(t *testing.T, root string) {
				writeFile(t, root, "README.md", "[missing][target]\n\n[target]: docs/missing.md\n")
			},
			diagnostic: "Broken link in README.md",
		},
		{
			name: "link escapes root",
			mutate: func(t *testing.T, root string) {
				writeFile(t, root, "README.md", "[outside](../outside.md)\n")
			},
			diagnostic: "escapes repository root",
		},
		{
			name: "undefined stable claim",
			mutate: func(t *testing.T, root string) {
				writeFile(t, root, "README.md", "C-999\n")
			},
			diagnostic: "Undefined claim C-999 in README.md",
		},
		{
			name: "missing bibliography key",
			mutate: func(t *testing.T, root string) {
				writeFile(t, root, "research/claims.md", "### C-001\n\n- **Primary sources:** `missing`\n")
			},
			diagnostic: "missing bibliography key: missing",
		},
		{
			name: "control character",
			mutate: func(t *testing.T, root string) {
				writeFile(t, root, "README.md", "line one\nline two\b\n")
			},
			diagnostic: "U+0008 in README.md:2",
		},
		{
			name: "unsupported inherited phrase",
			mutate: func(t *testing.T, root string) {
				writeFile(t, root, "README.md", "This eradicates hallucinations.\n")
			},
			diagnostic: "Unsupported inherited phrase",
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()
			root := validRepository(t)
			test.mutate(t, root)
			result := validateFixture(root)
			if !containsDiagnostic(result.Errors, test.diagnostic) {
				t.Fatalf("Validate() errors = %v, want diagnostic containing %q", result.Errors, test.diagnostic)
			}
		})
	}
}

func TestValidateIgnoresCodeLinksAndImportedClaims(t *testing.T) {
	t.Parallel()
	root := validRepository(t)
	writeFile(t, root, "README.md", "`[not a link](missing.md)`\n")
	writeFile(t, root, "sources/imported.md", "C-999 and eradicates hallucinations\n")

	result := validateFixture(root)
	if len(result.Errors) != 0 {
		t.Fatalf("Validate() errors = %v", result.Errors)
	}
}

// The engine keeps backups of the files it replaces under .workingdir/, which
// Git ignores. A copy there links to paths that only exist at the root.
func TestValidateSkipsPrivateStateFolder(t *testing.T) {
	t.Parallel()
	root := validRepository(t)
	writeFile(t, root, ".workingdir/adopt-backups/20261011T140934Z/AGENTS.md", "[principles](docs/principles.md)\n")
	result := validateFixture(root)
	if len(result.Errors) != 0 {
		t.Fatalf("Validate() errors = %v", result.Errors)
	}
	if result.MarkdownFiles != 4 {
		t.Fatalf("Validate() counted %d Markdown files, want 4", result.MarkdownFiles)
	}

	writeFile(t, root, "workingdir/notes.md", "[principles](docs/principles.md)\n")
	result = validateFixture(root)
	if !containsDiagnostic(result.Errors, "Broken link in workingdir/notes.md") {
		t.Fatalf("Validate() errors = %v, want the tracked look-alike folder checked", result.Errors)
	}
}

func validRepository(t *testing.T) string {
	t.Helper()
	root := t.TempDir()
	writeFile(t, root, "README.md", "[claims](research/claims.md)\n")
	writeFile(t, root, "research/claims.md", "### C-001\n\n- **Primary sources:** `reference`\n")
	writeFile(t, root, "research/principle-registry.md", "## P-001 First principle\n")
	writeFile(t, root, "research/references.bib", "@article{reference,\n  title = {Reference}\n}\n")
	writeFile(t, root, "concept/01-example.md", strings.Join(requiredChapterSections, "\n\n")+"\n")
	writeFile(t, root, "assets/diagrams/example.mmd", "flowchart LR\n  A --> B\n")
	writeFile(t, root, mermaidBaselineRelativePath, "{\n  \"schemaVersion\": 1,\n  \"groups\": []\n}\n")
	return root
}

func writeFile(t *testing.T, root, relative, content string) {
	t.Helper()
	path := filepath.Join(root, filepath.FromSlash(relative))
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatalf("MkdirAll(%s): %v", relative, err)
	}
	if err := os.WriteFile(path, []byte(content), 0o600); err != nil {
		t.Fatalf("WriteFile(%s): %v", relative, err)
	}
}

func containsDiagnostic(diagnostics []string, substring string) bool {
	for _, diagnostic := range diagnostics {
		if strings.Contains(diagnostic, substring) {
			return true
		}
	}
	return false
}
