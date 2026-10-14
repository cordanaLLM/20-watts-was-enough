//go:build aix || darwin || dragonfly || freebsd || linux || netbsd || openbsd || solaris

package pdfrender

import (
	"errors"
	"syscall"
)

// processExited reports true only when the kernel says no process has this
// identifier. A permission error means some process holds it.
func processExited(pid int) (bool, error) {
	err := syscall.Kill(pid, 0)
	switch {
	case err == nil, errors.Is(err, syscall.EPERM):
		return false, nil
	case errors.Is(err, syscall.ESRCH):
		return true, nil
	default:
		return false, err
	}
}
