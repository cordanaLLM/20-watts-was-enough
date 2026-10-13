package main

import (
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/translationbundle"
)

func TestRunTranslationCandidateCommandsRequireClosedArguments(t *testing.T) {
	t.Parallel()
	for _, arguments := range [][]string{
		{"translation", "export-candidate", "--language", "de"},
		{"translation", "validate-candidate", "--input", "candidate.json"},
		{"translation", "import-candidate", "--input", "candidate.json"},
	} {
		var stdout bytes.Buffer
		var stderr bytes.Buffer
		if exitCode := run(arguments, &stdout, &stderr); exitCode != 2 || !strings.Contains(stderr.String(), "requires") {
			t.Fatalf("run(%v) exit/stderr = %d/%q, want usage refusal", arguments, exitCode, stderr.String())
		}
	}
}

func TestRunTranslationValidateCandidateWritesNothingAndClaimsNoQuality(t *testing.T) {
	t.Parallel()
	root := t.TempDir()
	source := filepath.Join(root, "concept", "00-test.md")
	if err := os.MkdirAll(filepath.Dir(source), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(source, []byte("# Source\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	registry := filepath.Join(root, "translations", "eu-languages.json")
	if err := os.MkdirAll(filepath.Dir(registry), 0o755); err != nil {
		t.Fatal(err)
	}
	registryBody, err := os.ReadFile(filepath.Join("..", "..", "..", "translations", "eu-languages.json"))
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(registry, registryBody, 0o644); err != nil {
		t.Fatal(err)
	}
	input := filepath.Join(t.TempDir(), "candidate.json")
	bundle, err := translationbundle.ExportCandidate(translationbundle.ExportOptions{
		RepositoryRoot: root,
		SourcePath:     "concept/00-test.md",
		TargetLanguage: "de",
		OutputPath:     input,
	})
	if err != nil {
		t.Fatal(err)
	}
	bundle.Target.Markdown = "# Quelle\n"
	bundle.Drafting = translationbundle.Drafting{
		Mode: "human-only", Tools: []translationbundle.DraftingTool{}, Notes: "",
	}
	body, err := json.MarshalIndent(bundle, "", "  ")
	if err != nil {
		t.Fatal(err)
	}
	body = append(body, '\n')
	if err := os.WriteFile(input, body, 0o600); err != nil {
		t.Fatal(err)
	}
	var stdout bytes.Buffer
	var stderr bytes.Buffer
	exitCode := run([]string{
		"translation", "validate-candidate",
		"--root", root,
		"--input", input,
		"--source", "concept/00-test.md",
		"--language", "de",
	}, &stdout, &stderr)
	if exitCode != 0 || !strings.Contains(stdout.String(), "No files were written") ||
		!strings.Contains(stdout.String(), "translation quality was not assessed") {
		t.Fatalf("run() exit/stdout/stderr = %d/%q/%q", exitCode, stdout.String(), stderr.String())
	}
	if _, err := os.Lstat(filepath.Join(root, ".workingdir2")); !os.IsNotExist(err) {
		t.Fatalf("validate command created candidate output: %v", err)
	}
	if _, err := os.Lstat(filepath.Join(root, "translations", "manifest.json")); !os.IsNotExist(err) {
		t.Fatalf("validate command touched translation authority: %v", err)
	}
}

func TestRunTranslationExportCandidateCreatesNoAuthorityFile(t *testing.T) {
	t.Parallel()
	root := t.TempDir()
	source := filepath.Join(root, "concept", "00-test.md")
	if err := os.MkdirAll(filepath.Dir(source), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(source, []byte("# Source\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	registry := filepath.Join(root, "translations", "eu-languages.json")
	if err := os.MkdirAll(filepath.Dir(registry), 0o755); err != nil {
		t.Fatal(err)
	}
	registryBody, err := os.ReadFile(filepath.Join("..", "..", "..", "translations", "eu-languages.json"))
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(registry, registryBody, 0o644); err != nil {
		t.Fatal(err)
	}
	output := filepath.Join(t.TempDir(), "candidate.json")
	var stdout bytes.Buffer
	var stderr bytes.Buffer
	exitCode := run([]string{
		"translation", "export-candidate",
		"--root", root,
		"--source", "concept/00-test.md",
		"--language", "de",
		"--output", output,
	}, &stdout, &stderr)
	if exitCode != 0 || !strings.Contains(stdout.String(), "undisclosed/unreviewed") {
		t.Fatalf("run() exit/stdout/stderr = %d/%q/%q", exitCode, stdout.String(), stderr.String())
	}
	if _, err := os.Stat(output); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Lstat(filepath.Join(root, "translations", "manifest.json")); !os.IsNotExist(err) {
		t.Fatalf("export command touched translation authority: %v", err)
	}
}

func setupTranslationTestRoot(t *testing.T) string {
	t.Helper()
	root := t.TempDir()
	source := filepath.Join(root, "concept", "00-test.md")
	if err := os.MkdirAll(filepath.Dir(source), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(source, []byte("# Source\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	registry := filepath.Join(root, "translations", "eu-languages.json")
	if err := os.MkdirAll(filepath.Dir(registry), 0o755); err != nil {
		t.Fatal(err)
	}
	registryBody, err := os.ReadFile(filepath.Join("..", "..", "..", "translations", "eu-languages.json"))
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(registry, registryBody, 0o644); err != nil {
		t.Fatal(err)
	}
	return root
}

func writeTestCandidateBundleFile(t *testing.T, path string, bundle translationbundle.Bundle) {
	t.Helper()
	body, err := json.MarshalIndent(bundle, "", "  ")
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, append(body, '\n'), 0o600); err != nil {
		t.Fatal(err)
	}
}

func exportTestCandidateBundle(t *testing.T, root, input string) translationbundle.Bundle {
	t.Helper()
	bundle, err := translationbundle.ExportCandidate(translationbundle.ExportOptions{
		RepositoryRoot: root,
		SourcePath:     "concept/00-test.md",
		TargetLanguage: "de",
		OutputPath:     input,
	})
	if err != nil {
		t.Fatal(err)
	}
	bundle.Target.Markdown = "# Quelle\n"
	bundle.Drafting = translationbundle.Drafting{
		Mode: "human-only", Tools: []translationbundle.DraftingTool{}, Notes: "",
	}
	return bundle
}

func TestRunTranslationImportCandidateImportsValidBundle(t *testing.T) {
	t.Parallel()
	root := setupTranslationTestRoot(t)
	input := filepath.Join(t.TempDir(), "candidate.json")
	bundle := exportTestCandidateBundle(t, root, input)
	writeTestCandidateBundleFile(t, input, bundle)
	output := filepath.Join(t.TempDir(), "imported")
	var stdout bytes.Buffer
	var stderr bytes.Buffer
	exitCode := run([]string{
		"translation", "import-candidate",
		"--root", root,
		"--input", input,
		"--source", "concept/00-test.md",
		"--language", "de",
		"--output", output,
	}, &stdout, &stderr)
	if exitCode != 0 || !strings.Contains(stdout.String(), "Imported candidate") ||
		!strings.Contains(stdout.String(), "It is not publication authority") {
		t.Fatalf("run() exit/stdout/stderr = %d/%q/%q", exitCode, stdout.String(), stderr.String())
	}
	if _, err := os.Stat(filepath.Join(output, "candidate-not-for-publication.md")); err != nil {
		t.Fatalf("candidate-not-for-publication.md missing: %v", err)
	}
	if _, err := os.Stat(filepath.Join(output, "candidate-receipt.json")); err != nil {
		t.Fatalf("candidate-receipt.json missing: %v", err)
	}
	if _, err := os.Lstat(filepath.Join(root, "translations", "manifest.json")); !os.IsNotExist(err) {
		t.Fatalf("import candidate touched translation authority: %v", err)
	}
}

func TestRunTranslationImportCandidateRejectsStaleOrAlteredSource(t *testing.T) {
	t.Parallel()
	root := setupTranslationTestRoot(t)
	input := filepath.Join(t.TempDir(), "candidate.json")
	bundle := exportTestCandidateBundle(t, root, input)
	writeTestCandidateBundleFile(t, input, bundle)
	if err := os.WriteFile(filepath.Join(root, "concept", "00-test.md"), []byte("# Changed on disk\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	output := filepath.Join(t.TempDir(), "imported")
	var stdout bytes.Buffer
	var stderr bytes.Buffer
	exitCode := run([]string{
		"translation", "import-candidate",
		"--root", root,
		"--input", input,
		"--source", "concept/00-test.md",
		"--language", "de",
		"--output", output,
	}, &stdout, &stderr)
	if exitCode != 1 || !strings.Contains(stderr.String(), "candidate source is stale or altered: concept/00-test.md") {
		t.Fatalf("run() exit/stderr = %d/%q", exitCode, stderr.String())
	}
}

func TestRunTranslationImportCandidateRejectsExistingOutputDirectory(t *testing.T) {
	t.Parallel()
	root := setupTranslationTestRoot(t)
	input := filepath.Join(t.TempDir(), "candidate.json")
	bundle := exportTestCandidateBundle(t, root, input)
	writeTestCandidateBundleFile(t, input, bundle)
	output := filepath.Join(t.TempDir(), "imported")
	if err := os.MkdirAll(output, 0o755); err != nil {
		t.Fatal(err)
	}
	var stdout bytes.Buffer
	var stderr bytes.Buffer
	exitCode := run([]string{
		"translation", "import-candidate",
		"--root", root,
		"--input", input,
		"--source", "concept/00-test.md",
		"--language", "de",
		"--output", output,
	}, &stdout, &stderr)
	if exitCode != 1 || !strings.Contains(stderr.String(), "create new candidate output directory:") {
		t.Fatalf("run() exit/stderr = %d/%q", exitCode, stderr.String())
	}
}

func TestRunTranslationImportCandidateRejectsUnconfinedOutputDirectory(t *testing.T) {
	t.Parallel()
	root := setupTranslationTestRoot(t)
	input := filepath.Join(t.TempDir(), "candidate.json")
	bundle := exportTestCandidateBundle(t, root, input)
	writeTestCandidateBundleFile(t, input, bundle)
	output := filepath.Join(root, "concept", "forbidden-import")
	var stdout bytes.Buffer
	var stderr bytes.Buffer
	exitCode := run([]string{
		"translation", "import-candidate",
		"--root", root,
		"--input", input,
		"--source", "concept/00-test.md",
		"--language", "de",
		"--output", output,
	}, &stdout, &stderr)
	if exitCode != 1 || !strings.Contains(stderr.String(), "candidate output inside the repository must remain under .workingdir2/cache/translation-candidates") {
		t.Fatalf("run() exit/stderr = %d/%q", exitCode, stderr.String())
	}
}
