//go:build aix || darwin || dragonfly || freebsd || linux || netbsd || openbsd || solaris

package boundedexec

import (
	"errors"
	"os"
	"os/exec"
	"syscall"
)

// KillProcessGroupOnCancel starts command in its own process group and makes
// context cancellation kill the whole group, so descendants cannot outlive
// it. The returned cleanup kills the group once more after Wait; a group that
// is already gone counts as cleaned up.
func KillProcessGroupOnCancel(command *exec.Cmd) func() error {
	command.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
	cleanup := func() error {
		if command.Process == nil {
			return nil
		}
		err := syscall.Kill(-command.Process.Pid, syscall.SIGKILL)
		if errors.Is(err, syscall.ESRCH) || errors.Is(err, os.ErrProcessDone) {
			return nil
		}
		return err
	}
	command.Cancel = cleanup
	return cleanup
}
