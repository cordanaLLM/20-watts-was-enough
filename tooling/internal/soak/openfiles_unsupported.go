//go:build !linux && !darwin

package soak

import (
	"fmt"
	"runtime"
)

func countOpenFiles() (int, error) {
	return 0, fmt.Errorf("open-file sampling is unsupported on %s", runtime.GOOS)
}
