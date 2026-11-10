//go:build linux

package soak

func countOpenFiles() (int, error) {
	return countDirectoryFiles("/proc/self/fd")
}
