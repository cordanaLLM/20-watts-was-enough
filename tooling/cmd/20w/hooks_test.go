package main

import (
	"bytes"
	"context"
	"errors"
	"io"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/pinnednode"
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

// fakeGateDeps answers the three mise queries for pin 26.13.0 and returns
// the given status and error from the admitted gate.
func fakeGateDeps(t *testing.T, gateStatus int, gateErr error, gateArgv *[]string) pinnednode.Deps {
	t.Helper()
	install := filepath.Join(t.TempDir(), "node")
	answers := map[string]string{
		"install node": "",
		"where node":   install + "\n",
		"--version":    "v26.13.0\n",
	}
	cache := t.TempDir()
	return pinnednode.Deps{
		LookPath: func(string) (string, error) { return "/fake/mise", nil },
		Output: func(_ context.Context, _ string, _ []string, _ string, args ...string) (int, []byte, error) {
			answer, ok := answers[strings.Join(args, " ")]
			if !ok {
				return 1, nil, errors.New("unexpected query " + strings.Join(args, " "))
			}
			return 0, []byte(answer), nil
		},
		Exec: func(_ context.Context, _ string, _ []string, argv []string, stdout, _ io.Writer) (int, error) {
			*gateArgv = append([]string(nil), argv...)
			if _, err := io.WriteString(stdout, "gate output\n"); err != nil {
				return 1, err
			}
			return gateStatus, gateErr
		},
		CacheDir: func() (string, error) { return cache, nil },
		Environ:  func() []string { return []string{"PATH=/host/bin"} },
	}
}

func TestHooksPrePushGatePropagatesGateStatus(t *testing.T) {
	t.Parallel()
	for _, tc := range []struct {
		name       string
		gateStatus int
		gateErr    error
		status     int
		refusal    string
	}{
		{"gate passes", 0, nil, 0, ""},
		{"gate fails", 7, nil, 7, ""},
		{"gate status 1", 1, nil, 1, ""},
		{"gate cannot start", 0, errors.New("start failed"), 1, "Pre-push gate refused: run admitted pre-push gate: start failed"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			root := t.TempDir()
			if err := os.WriteFile(filepath.Join(root, pinnednode.PinFile), []byte("26.13.0\n"), 0o600); err != nil {
				t.Fatal(err)
			}
			var gateArgv []string
			var stdout, stderr bytes.Buffer
			status := prePushGate([]string{"--root", root}, fakeGateDeps(t, tc.gateStatus, tc.gateErr, &gateArgv), &stdout, &stderr)
			if status != tc.status {
				t.Fatalf("status %d, want %d; stderr %q", status, tc.status, stderr.String())
			}
			if !reflect.DeepEqual(gateArgv, pinnednode.GateArgv) || stdout.String() != "gate output\n" {
				t.Fatalf("gate argv %q stdout %q", gateArgv, stdout.String())
			}
			refused := strings.Contains(stderr.String(), "Pre-push gate refused")
			if tc.refusal == "" && refused || tc.refusal != "" && !strings.Contains(stderr.String(), tc.refusal) {
				t.Fatalf("stderr %q; want refusal %q", stderr.String(), tc.refusal)
			}
		})
	}
}
