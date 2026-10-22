package main

import (
	"bytes"
	"fmt"
	"slices"
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

type usageTestCase struct {
	name      string
	arguments []string
	wantUsage string
}

func sortedMapKeys[V any](m map[string]V) []string {
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	slices.Sort(keys)
	return keys
}

func buildUsageTestCases() []usageTestCase {
	silent := map[string]map[string]bool{
		"ci":          {"run-workstation": true},
		"publication": {"render-pdf": true, "verify-pdf-tools": true, "verify-public-transport": true},
		"github":      {"sync-metadata": true, "sync-pr-metadata": true, "sync-issue-lifecycle": true, "sync-labels": true},
		"release": {
			"inspect-image": true, "asset-inventory": true, "fetch-assets": true, "state": true,
			"compare-publication-manifest": true, "verify-tag": true, "write-oci-images": true, "validate-oci-images": true,
		},
	}
	allSubcommands := subcommands()
	groups := sortedMapKeys(allSubcommands)
	var cases []usageTestCase
	for _, group := range groups {
		names := sortedMapKeys(allSubcommands[group])
		for _, name := range names {
			if group == "ci" && name == "project" {
				continue
			}
			wantUsage := ""
			if silent[group][name] {
				wantUsage = fmt.Sprintf("Usage:\n  20w %s %s", group, name)
			}
			cases = append(cases, usageTestCase{
				name:      group + "/" + name,
				arguments: []string{group, name, "stray-positional"},
				wantUsage: wantUsage,
			})
		}
	}
	cases = append(cases, usageTestCase{
		name:      "version",
		arguments: []string{"version", "stray-positional"},
		wantUsage: "Usage:\n  20w version",
	})
	return cases
}

func TestCommandsReportUsageOnStrayPositionalArguments(t *testing.T) {
	t.Parallel()
	testCases := buildUsageTestCases()
	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			var stdout bytes.Buffer
			var stderr bytes.Buffer
			exitCode := run(tc.arguments, &stdout, &stderr)
			if exitCode != 2 {
				t.Fatalf("run(%v) exit code = %d, want 2", tc.arguments, exitCode)
			}
			if stderr.Len() == 0 {
				t.Fatalf("run(%v) stderr is empty, want usage diagnostic", tc.arguments)
			}
			if tc.wantUsage != "" {
				if !strings.Contains(stderr.String(), tc.wantUsage) {
					t.Fatalf("run(%v) stderr = %q, want it to contain %q", tc.arguments, stderr.String(), tc.wantUsage)
				}
			} else if strings.Contains(stderr.String(), "invalid arguments") {
				t.Fatalf("run(%v) stderr = %q, want no appended usage block", tc.arguments, stderr.String())
			}
		})
	}
}

func TestRunReleaseStateReportsExactUsageOnMissingFlags(t *testing.T) {
	t.Parallel()
	var stdout bytes.Buffer
	var stderr bytes.Buffer
	exitCode := run([]string{"release", "state"}, &stdout, &stderr)
	if exitCode != 2 {
		t.Fatalf("run(release state) exit code = %d, want 2", exitCode)
	}
	wantStderr := "20w release state: invalid arguments\nUsage:\n  20w release state --repository <owner/name> --tag <vX.Y.Z> [--json]\n"
	if stderr.String() != wantStderr {
		t.Fatalf("run(release state) stderr = %q, want %q", stderr.String(), wantStderr)
	}
}

func TestRunHandlerWritingStderrOmitsUsageBlock(t *testing.T) {
	t.Parallel()
	var stdout bytes.Buffer
	var stderr bytes.Buffer
	exitCode := run([]string{"validate", "docs", "stray"}, &stdout, &stderr)
	if exitCode != 2 {
		t.Fatalf("run(validate docs stray) exit code = %d, want 2", exitCode)
	}
	if strings.Contains(stderr.String(), "invalid arguments") {
		t.Fatalf("run(validate docs stray) stderr = %q, want no appended usage block", stderr.String())
	}
	if !strings.Contains(stderr.String(), "validate docs accepts only --root") {
		t.Fatalf("run(validate docs stray) stderr = %q, want original diagnostic", stderr.String())
	}
}
