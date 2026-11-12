//go:build aix || darwin || dragonfly || freebsd || linux || netbsd || openbsd || solaris

package pinnednode

import (
	"os/exec"

	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/boundedexec"
)

func configureProcess(command *exec.Cmd) (func() error, error) {
	return boundedexec.KillProcessGroupOnCancel(command), nil
}
