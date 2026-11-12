package main

import (
	"bytes"
	"strings"
	"testing"
)

func TestHooksPrePushGateArguments(t *testing.T) {
	t.Parallel()
	for _, tc := range []struct {
		name      string
		arguments []string
		status    int
		message   string
	}{
		{"root parsed without help", []string{"--root", t.TempDir()}, 1, "Pre-push gate refused: read"},
		{"extra argument", []string{"stray"}, 2, "hooks pre-push-gate accepts only --root <repository>"},
		{"unknown flag", []string{"--unknown"}, 2, "flag provided but not defined"},
		{"missing root", []string{"--root"}, 2, "flag needs an argument"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			var stdout, stderr bytes.Buffer
			status := runHooksPrePushGate(tc.arguments, &stdout, &stderr)
			if status != tc.status || !strings.Contains(stderr.String(), tc.message) || stdout.Len() != 0 {
				t.Fatalf("status %d stdout %q stderr %q; want %d containing %q", status, stdout.String(), stderr.String(), tc.status, tc.message)
			}
		})
	}
}
