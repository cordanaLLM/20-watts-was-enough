//go:build !aix && !darwin && !dragonfly && !freebsd && !linux && !netbsd && !openbsd && !solaris

package pinnednode

import (
	"io"
	"os"
	"strings"
	"testing"
)

func TestCommandExecRefusesPlatformWithoutProcessGroups(t *testing.T) {
	t.Parallel()
	status, err := commandExec(t.Context(), t.TempDir(), helperEnvironment("exact-ok"), []string{os.Args[0], "-test.run=^$"}, io.Discard, io.Discard)
	if status != 0 || err == nil || !strings.Contains(err.Error(), "push from Linux or macOS (decision 0129)") {
		t.Fatalf("commandExec = %d, %v", status, err)
	}
}
