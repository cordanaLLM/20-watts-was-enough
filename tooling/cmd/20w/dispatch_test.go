package main

import (
	"bytes"
	"strings"
	"testing"
)

// Every two-word command in the usage text resolves through the dispatch
// table, so a documented command cannot lose its handler unnoticed.
func TestLookupSubcommandResolvesEveryDocumentedTwoWordCommand(t *testing.T) {
	t.Parallel()
	var help bytes.Buffer
	usage(&help)
	checked := 0
	for _, line := range strings.Split(help.String(), "\n") {
		fields := strings.Fields(line)
		if len(fields) < 3 || fields[0] != "20w" || fields[1] == "experiment" || fields[1] == "version" {
			continue
		}
		if _, ok := lookupSubcommand(fields[1:3]); !ok {
			t.Errorf("documented command %q has no handler", fields[1]+" "+fields[2])
		}
		checked++
	}
	if checked < 20 {
		t.Fatalf("checked %d documented two-word commands, want at least 20", checked)
	}
}

func TestLookupSubcommandRejectsUnknownAndIncompleteCommands(t *testing.T) {
	t.Parallel()
	for _, arguments := range [][]string{
		nil,
		{"ci"},
		{"ci", "unknown"},
		{"unknown", "plan"},
		{"experiment", "validate"},
		{"version", "--json"},
	} {
		if _, ok := lookupSubcommand(arguments); ok {
			t.Errorf("lookupSubcommand(%q) resolved, want no handler", arguments)
		}
	}
}

func TestRunReportsAGroupWithoutACommandAsUnknown(t *testing.T) {
	t.Parallel()
	var stdout bytes.Buffer
	var stderr bytes.Buffer
	if exitCode := run([]string{"release"}, &stdout, &stderr); exitCode != 2 {
		t.Fatalf("run() exit code = %d, want 2", exitCode)
	}
	if !strings.Contains(stderr.String(), "Unknown 20w command: release") {
		t.Fatalf("run() stderr = %q, want the unknown-command diagnostic", stderr.String())
	}
}
