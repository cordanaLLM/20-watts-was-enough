//go:build darwin

package soak

func countOpenFiles() (int, error) {
	return countDirectoryFiles("/dev/fd")
}
