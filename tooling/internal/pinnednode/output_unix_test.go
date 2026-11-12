//go:build aix || darwin || dragonfly || freebsd || linux || netbsd || openbsd || solaris

package pinnednode

import (
	"bytes"
	"fmt"
	"os"
	"strings"
	"testing"
)

func TestCommandOutputBoundsRealProcess(t *testing.T) {
	t.Parallel()
	for _, tc := range []struct {
		mode, suffix, message string
		status, length        int
	}{
		{mode: "exact-ok", status: 0, length: outputLimit},
		{mode: "flood-ok", status: 0, length: outputLimit, message: fmt.Sprintf("output exceeds %d bytes", outputLimit)},
		{mode: "flood-fail", status: 3, length: failureTail, suffix: "REAL REASON"},
		{mode: "short-fail", status: 3, length: len("short reason"), suffix: "short reason"},
	} {
		t.Run(tc.mode, func(t *testing.T) {
			t.Parallel()
			status, output, err := commandOutput(t.Context(), t.TempDir(), helperEnvironment(tc.mode), os.Args[0], "-test.run=^$")
			if status != tc.status || len(output) != tc.length || !bytes.HasSuffix(output, []byte(tc.suffix)) {
				t.Fatalf("commandOutput = %d, %d bytes ending %q, %v", status, len(output), output[max(len(output)-16, 0):], err)
			}
			if tc.message == "" && err != nil || tc.message != "" && (err == nil || !strings.Contains(err.Error(), tc.message)) {
				t.Fatalf("commandOutput error = %v, want %q", err, tc.message)
			}
		})
	}
}
