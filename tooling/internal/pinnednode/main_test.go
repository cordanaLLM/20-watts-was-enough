package pinnednode

import (
	"bytes"
	"os"
	"testing"

	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/testtmp"
)

// helperVariable turns the test binary into a child process whose output
// shape commandOutput must bound.
const helperVariable = "PINNEDNODE_TEST_HELPER"

func TestMain(tests *testing.M) {
	if mode, present := os.LookupEnv(helperVariable); present {
		os.Exit(runHelper(mode))
	}
	os.Exit(testtmp.Run(tests))
}

func runHelper(mode string) int {
	body, status := map[string][]byte{
		"flood-fail": append(bytes.Repeat([]byte("x"), outputLimit+1), "REAL REASON"...),
		"flood-ok":   bytes.Repeat([]byte("x"), outputLimit+1),
		"exact-ok":   bytes.Repeat([]byte("x"), outputLimit),
		"short-fail": []byte("short reason"),
	}[mode], 0
	if body == nil {
		return 99
	}
	if mode == "flood-fail" || mode == "short-fail" {
		status = 3
	}
	if _, err := os.Stdout.Write(body); err != nil {
		return 98
	}
	return status
}

func helperEnvironment(mode string) []string {
	return append(os.Environ(), helperVariable+"="+mode)
}
