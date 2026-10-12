package ciplancli

import (
	"bytes"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestMessagesAcceptsCleanMessageFile(t *testing.T) {
	messagePath := messageFixture(t, "Body.\n\nSigned-off-by: A Maintainer <maintainer@example.org>\n")
	var stdout, stderr bytes.Buffer
	code := Run([]string{"messages", "--message-file", messagePath}, nil, &stdout, &stderr)
	want := "Commit messages: 1 checked (message file), no tool attribution\n"
	if code != 0 || stdout.String() != want || stderr.Len() != 0 {
		t.Fatalf("exit=%d, stdout=%q, stderr=%q", code, stdout.String(), stderr.String())
	}
}

func TestMessagesRefusesPlantedAttributionWithItsLine(t *testing.T) {
	for _, planted := range []string{
		"Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>",
		"🤖 Generated with [Claude Code](https://claude.com/claude-code)",
	} {
		messagePath := messageFixture(t, "Body.\n\n"+planted+"\n")
		var stdout, stderr bytes.Buffer
		code := Run([]string{"messages", "--message-file", messagePath}, nil, &stdout, &stderr)
		if code != 1 || stdout.Len() != 0 ||
			!strings.Contains(stderr.String(), "message file, line 3: ") ||
			!strings.Contains(stderr.String(), planted) ||
			!strings.Contains(stderr.String(), "Commit messages: 1 refused line(s).") {
			t.Fatalf("planted %q: exit=%d, stdout=%q, stderr=%q", planted, code, stdout.String(), stderr.String())
		}
	}
}

func TestMessagesRejectsArgumentsBeforeChecking(t *testing.T) {
	revision := strings.Repeat("1", 40)
	for _, args := range [][]string{
		nil,
		{"--base", revision},
		{"--head", revision, "--message-file", "message.txt"},
		{"--base", revision, "--message-file", "message.txt"},
		{"--unknown"},
		{"--head"},
		{"unexpected"},
	} {
		var stdout, stderr bytes.Buffer
		if code := RunMessages(args, &stdout, &stderr); code != 2 || stdout.Len() != 0 {
			t.Fatalf("args=%q: exit=%d, stdout=%q, stderr=%q", args, code, stdout.String(), stderr.String())
		}
	}
}

func TestMessagesFailsClosedOnUnreadableInput(t *testing.T) {
	for name, args := range map[string][]string{
		"absent file":    {"--message-file", filepath.Join(t.TempDir(), "absent.txt")},
		"root not a Git": {"--root", t.TempDir(), "--head", strings.Repeat("1", 40)},
		"abbreviated":    {"--root", planFixture(t), "--head", "1111111"},
	} {
		var stdout, stderr bytes.Buffer
		if code := RunMessages(args, &stdout, &stderr); code != 1 || stdout.Len() != 0 ||
			!strings.HasPrefix(stderr.String(), "Check commit messages: ") {
			t.Fatalf("%s: exit=%d, stdout=%q, stderr=%q", name, code, stdout.String(), stderr.String())
		}
	}
}

func TestMessagesReportsAFailedResultWrite(t *testing.T) {
	messagePath := messageFixture(t, "Body.\n")
	for _, short := range []bool{false, true} {
		var stderr bytes.Buffer
		writer := &failingWriter{short: short, failAt: 1}
		if code := RunMessages([]string{"--message-file", messagePath}, writer, &stderr); code != 1 ||
			!strings.HasPrefix(stderr.String(), "Write commit-message result: ") {
			t.Fatalf("short=%t: exit=%d, stderr=%q", short, code, stderr.String())
		}
	}
}

func messageFixture(t *testing.T, body string) string {
	t.Helper()
	messagePath := filepath.Join(t.TempDir(), "message.txt")
	if err := os.WriteFile(messagePath, []byte(body), 0o600); err != nil {
		t.Fatal(err)
	}
	return messagePath
}
