//go:build !linux

package clrsshakedown

import (
	"errors"
	"os/exec"
)

func configureContainerProcess(_ *exec.Cmd) (func() error, error) {
	return nil, errors.New("CLRS container orchestration requires a local Linux Docker engine; inner Go checks remain portable")
}
