package clrsfixture

import (
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

// testAbsolutePath builds an absolute fake path on every platform. Production
// evidence checks require filepath.IsAbs, which rejects "/usr/bin/docker" on
// Windows because it carries no volume.
func testAbsolutePath(elements ...string) string {
	root := string(filepath.Separator)
	if volume := filepath.VolumeName(os.TempDir()); volume != "" {
		root = volume + root
	}
	return filepath.Join(append([]string{root}, elements...)...)
}

// fakeDockerExecutableName is the file name that exec.LookPath("docker")
// resolves: Windows resolves only PATHEXT suffixes such as .exe.
func fakeDockerExecutableName() string {
	if runtime.GOOS == "windows" {
		return "docker.exe"
	}
	return "docker"
}

// fakeDockerInvocationExit asserts how the adapter reports the fake "docker"
// that is this Go test executable. Unix runs it and the testing flag parser
// rejects --host with exit 2 before any test runs. Windows resolves and pins
// the executable identically but configurePromiseProcess refuses to start it
// without Unix process-group cleanup, so it records exit -1 and that reason.
func fakeDockerInvocationExit(t *testing.T, record generationCommandEvidence, err error) {
	t.Helper()
	if runtime.GOOS == "windows" {
		if err == nil || record.ExitCode != -1 || !strings.Contains(err.Error(), "process-group cleanup") {
			t.Fatalf("Windows adapter started or misreported the fake executable: %+v %v", record, err)
		}
		return
	}
	if err == nil || record.ExitCode != 2 {
		t.Fatalf("fake executable invocation: %+v %v", record, err)
	}
}

// requirePOSIXModeBits skips a permission-bit assertion on Windows, which
// reports 0o666 and 0o777 for writable files and directories and only the
// read-only attribute as 0o444. Callers keep every portable assertion
// outside the skipped scope.
func requirePOSIXModeBits(t *testing.T, what string) {
	t.Helper()
	if runtime.GOOS == "windows" {
		t.Skipf("%s: POSIX permission bits are not represented on Windows", what)
	}
}

// skipWindowsPinnedName covers interlocks that unlink or rename a name while
// production still holds its handle. Windows pins an open handle to its name,
// so the interlock itself fails there. Production must then surface that
// failure instead of a digest or publication; the POSIX replacement
// assertions that follow are skipped.
func skipWindowsPinnedName(t *testing.T, err error, interlock string) {
	t.Helper()
	if runtime.GOOS != "windows" {
		return
	}
	if err == nil || !strings.Contains(err.Error(), interlock) {
		t.Fatalf("pinned-name interlock failure was not surfaced: %v", err)
	}
	t.Skipf("%s: replacing a name beneath an open handle needs POSIX unlink semantics", interlock)
}
