//go:build !linux && !darwin

package soak

import (
	"fmt"
	"runtime"
)

// countOpenFiles returns zero and an error naming the unsupported platform, so
// callers can skip sampling without treating zero as a measured count.
func countOpenFiles() (int, error) {
	return 0, fmt.Errorf("open-file sampling is unsupported on %s", runtime.GOOS)
}
