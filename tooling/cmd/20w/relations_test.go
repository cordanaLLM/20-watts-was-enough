package main

import (
	"bytes"
	"path/filepath"
	"strings"
	"testing"
)

func TestRunValidateRelationsAcceptsTheRepositoryRegistry(t *testing.T) {
	t.Parallel()
	var stdout bytes.Buffer
	var stderr bytes.Buffer
	root := filepath.Clean(filepath.Join("..", "..", ".."))
	exitCode := run([]string{"validate", "relations", "--root", root}, &stdout, &stderr)
	if exitCode != 0 || !strings.Contains(stdout.String(), "result authority NO_RESULT") || stderr.Len() != 0 {
		t.Fatalf("run() exit/stdout/stderr = %d/%q/%q", exitCode, stdout.String(), stderr.String())
	}
}

func TestRunValidateRelationsRejectsPositionalArgumentsAsUsage(t *testing.T) {
	t.Parallel()
	var stdout bytes.Buffer
	var stderr bytes.Buffer
	exitCode := run([]string{"validate", "relations", "--root", ".", "extra"}, &stdout, &stderr)
	if exitCode != 2 || !strings.Contains(stderr.String(), "accepts only --root") || stdout.Len() != 0 {
		t.Fatalf("run() exit/stdout/stderr = %d/%q/%q", exitCode, stdout.String(), stderr.String())
	}
}

func TestRunValidateRelationsReportsAMissingRegistryAsFailure(t *testing.T) {
	t.Parallel()
	var stdout bytes.Buffer
	var stderr bytes.Buffer
	exitCode := run([]string{"validate", "relations", "--root", t.TempDir()}, &stdout, &stderr)
	if exitCode != 1 || !strings.Contains(stderr.String(), "Engineering relation validation failed") || stdout.Len() != 0 {
		t.Fatalf("run() exit/stdout/stderr = %d/%q/%q", exitCode, stdout.String(), stderr.String())
	}
}
