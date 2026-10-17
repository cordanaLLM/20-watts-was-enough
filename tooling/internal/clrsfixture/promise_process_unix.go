//go:build aix || darwin || dragonfly || freebsd || linux || netbsd || openbsd || solaris

package clrsfixture

import (
	"os/exec"

	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/boundedexec"
)

func configurePromiseProcess(command *exec.Cmd) (func() error, error) {
	return boundedexec.KillProcessGroupOnCancel(command), nil
}
