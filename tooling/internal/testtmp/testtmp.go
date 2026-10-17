// Package testtmp pins the temporary directory of a test binary to its
// canonical path. Production path checks refuse any symlinked or aliased
// component, and the default temporary directory contains one on common
// platforms: /var -> /private/var on macOS, an 8.3 short name such as
// RUNNER~1 on Windows. Call Run from TestMain; the checks stay unchanged.
package testtmp

import (
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"testing"
)

// Run pins the temporary directory, then runs the tests. A failed pin stops
// the run: tests that need a canonical root would otherwise fail one by one.
func Run(tests *testing.M) int {
	if err := Pin(); err != nil {
		fmt.Fprintf(os.Stderr, "testtmp: %v\n", err)
		return 2
	}
	return tests.Run()
}

// Pin points the temporary-directory variables at the symlink-free, long-name
// form of the current temporary directory. A package that already has a
// TestMain calls it from an init function instead of Run.
func Pin() error {
	resolved, err := filepath.EvalSymlinks(os.TempDir())
	if err != nil {
		return fmt.Errorf("resolve temporary directory %q: %w", os.TempDir(), err)
	}
	for _, name := range variables(runtime.GOOS) {
		if err := os.Setenv(name, resolved); err != nil {
			return fmt.Errorf("set %s: %w", name, err)
		}
	}
	return nil
}

func variables(goos string) []string {
	if goos == "windows" {
		return []string{"TMP", "TEMP"}
	}
	return []string{"TMPDIR"}
}
