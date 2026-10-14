//go:build !aix && !darwin && !dragonfly && !freebsd && !linux && !netbsd && !openbsd && !solaris && !windows

package pdfrender

// processExited cannot query process existence here, so no lock is stale.
func processExited(int) (bool, error) {
	return false, nil
}
