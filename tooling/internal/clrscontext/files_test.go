package clrscontext

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestRealDirectoryAcceptsDeepNesting(t *testing.T) {
	parts := []string{t.TempDir()}
	for range 96 {
		parts = append(parts, "d")
	}
	deep := filepath.Join(parts...)
	if err := os.MkdirAll(deep, 0o700); err != nil {
		t.Fatalf("create nested directories: %v", err)
	}
	resolved, err := realDirectory(deep)
	if err != nil {
		t.Fatalf("realDirectory refused a %d-level directory: %v", len(parts)-1, err)
	}
	if resolved != deep {
		t.Fatalf("realDirectory = %q, want %q", resolved, deep)
	}
}

func TestRealDirectoryRefusesSymlinkAncestor(t *testing.T) {
	root := t.TempDir()
	target := filepath.Join(root, "target")
	if err := os.MkdirAll(filepath.Join(target, "child"), 0o700); err != nil {
		t.Fatalf("create target: %v", err)
	}
	link := filepath.Join(root, "link")
	if err := os.Symlink(target, link); err != nil {
		t.Skipf("symlinks unavailable: %v", err)
	}
	_, err := realDirectory(filepath.Join(link, "child"))
	if err == nil || !strings.Contains(err.Error(), "must contain only real directories") {
		t.Fatalf("expected symlink ancestor refusal, got %v", err)
	}
}
