package docscheck

import (
	"os"
	"path/filepath"
	"testing"
)

func TestScanMermaidEntriesValidDirectory(t *testing.T) {
	diagramRoot := t.TempDir()
	content := "flowchart TD\n  A --> B\n"
	if err := os.WriteFile(filepath.Join(diagramRoot, "valid.mmd"), []byte(content), 0o600); err != nil {
		t.Fatalf("WriteFile() error = %v", err)
	}
	report := &collector{}
	entries, count, ok := scanMermaidEntries(diagramRoot, report)
	if !ok || len(report.errors) != 0 || count != 1 || len(entries) != 1 {
		t.Fatalf("scanMermaidEntries() ok=%v, count=%d, entries=%d, errors=%v", ok, count, len(entries), report.errors)
	}
}

func TestScanMermaidEntriesRejectsMissingDirectory(t *testing.T) {
	missing := filepath.Join(t.TempDir(), "missing")
	report := &collector{}
	entries, count, ok := scanMermaidEntries(missing, report)
	if ok || len(report.errors) == 0 || count != 0 || entries != nil {
		t.Fatalf("expected error for missing directory, got ok=%v, errors=%v", ok, report.errors)
	}
}
