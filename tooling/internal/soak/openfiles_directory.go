//go:build linux || darwin

package soak

import (
	"fmt"
	"os"
)

// countOpenFiles counts the entries of descriptorDirectory, less the
// descriptor that reading the directory itself holds open.
func countOpenFiles() (int, error) {
	directory, err := os.Open(descriptorDirectory)
	if err != nil {
		return 0, fmt.Errorf("open descriptor directory %s: %w", descriptorDirectory, err)
	}
	entries, readErr := directory.ReadDir(-1)
	closeErr := directory.Close()
	if readErr != nil {
		return 0, fmt.Errorf("read descriptor directory %s: %w", descriptorDirectory, readErr)
	}
	if closeErr != nil {
		return 0, fmt.Errorf("close descriptor directory %s: %w", descriptorDirectory, closeErr)
	}
	return max(0, len(entries)-1), nil
}
