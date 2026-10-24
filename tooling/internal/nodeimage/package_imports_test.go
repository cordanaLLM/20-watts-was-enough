package nodeimage

import (
	"os"
	"path"
	"path/filepath"
	"regexp"
	"strings"
	"testing"
)

var relativeModuleSpecifier = regexp.MustCompile(`(?:\bfrom|\bimport)\s*\(?\s*"(\.{1,2}/[^"]+)"`)

func TestDescriptorsCloseOverRepositoryModuleImports(t *testing.T) {
	t.Parallel()
	repositoryRoot, err := filepath.Abs(filepath.Join("..", "..", ".."))
	if err != nil {
		t.Fatalf("resolve repository root: %v", err)
	}
	for _, artifact := range SupportedArtifacts() {
		artifact := artifact
		t.Run(artifact, func(t *testing.T) {
			t.Parallel()
			missing := missingModuleImports(t, repositoryRoot, descriptors[artifact].files)
			if len(missing) > 0 {
				t.Fatalf("%s descriptor omits imported modules:\n%s", artifact, strings.Join(missing, "\n"))
			}
		})
	}
}

func TestMissingModuleImportsReportsUndeclaredImport(t *testing.T) {
	t.Parallel()
	repositoryRoot := t.TempDir()
	writeModule(t, repositoryRoot, "experiments/workstation/fixture-x/runner.mjs",
		"import { a } from \"./generator.mjs\";\nconst b = await import(\"../lib/late.mjs\");\n")
	writeModule(t, repositoryRoot, "experiments/workstation/fixture-x/generator.mjs",
		"import { mulberry32 } from \"../lib/mulberry32.mjs\";\nimport \"../lib/side-effect.mjs\";\n")
	files := []string{
		"experiments/workstation/fixture-x/generator.mjs",
		"experiments/workstation/fixture-x/runner.mjs",
	}

	missing := missingModuleImports(t, repositoryRoot, files)
	want := []string{
		"experiments/workstation/fixture-x/generator.mjs -> experiments/workstation/lib/mulberry32.mjs",
		"experiments/workstation/fixture-x/generator.mjs -> experiments/workstation/lib/side-effect.mjs",
		"experiments/workstation/fixture-x/runner.mjs -> experiments/workstation/lib/late.mjs",
	}
	if strings.Join(missing, "\n") != strings.Join(want, "\n") {
		t.Fatalf("missingModuleImports() =\n%s\nwant =\n%s", strings.Join(missing, "\n"), strings.Join(want, "\n"))
	}
}

func TestMissingModuleImportsAcceptsClosedSet(t *testing.T) {
	t.Parallel()
	repositoryRoot := t.TempDir()
	writeModule(t, repositoryRoot, "a/runner.mjs", "import { x } from \"./b.mjs\";\n")
	writeModule(t, repositoryRoot, "a/b.mjs", "export const x = 1;\n")

	if missing := missingModuleImports(t, repositoryRoot, []string{"a/b.mjs", "a/runner.mjs"}); len(missing) != 0 {
		t.Fatalf("missingModuleImports() = %v, want none", missing)
	}
}

func missingModuleImports(t *testing.T, repositoryRoot string, files []string) []string {
	t.Helper()
	declared := make(map[string]bool, len(files))
	for _, file := range files {
		declared[file] = true
	}
	var missing []string
	for _, file := range files {
		if !strings.HasSuffix(file, ".mjs") {
			continue
		}
		body, err := os.ReadFile(filepath.Join(repositoryRoot, filepath.FromSlash(file)))
		if err != nil {
			t.Fatalf("read %s: %v", file, err)
		}
		for _, match := range relativeModuleSpecifier.FindAllStringSubmatch(string(body), -1) {
			imported := path.Join(path.Dir(file), match[1])
			if !declared[imported] {
				missing = append(missing, file+" -> "+imported)
			}
		}
	}
	return missing
}

func writeModule(t *testing.T, root, relativePath, body string) {
	t.Helper()
	target := filepath.Join(root, filepath.FromSlash(relativePath))
	if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
		t.Fatalf("create %s: %v", relativePath, err)
	}
	if err := os.WriteFile(target, []byte(body), 0o644); err != nil {
		t.Fatalf("write %s: %v", relativePath, err)
	}
}
