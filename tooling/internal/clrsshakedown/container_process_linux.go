//go:build linux

package clrsshakedown

import (
	"os/exec"

	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/boundedexec"
)

func configureContainerProcess(command *exec.Cmd) (func() error, error) {
	return boundedexec.KillProcessGroupOnCancel(command), nil
}
