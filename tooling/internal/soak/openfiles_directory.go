package soak

import (
	"fmt"
	"os"
)

func countDirectoryFiles(path string) (int, error) {
	directory, err := os.Open(path)
	if err != nil {
		return 0, fmt.Errorf("open descriptor directory %s: %w", path, err)
	}
	entries, readErr := directory.ReadDir(-1)
	closeErr := directory.Close()
	if readErr != nil {
		return 0, fmt.Errorf("read descriptor directory %s: %w", path, readErr)
	}
	if closeErr != nil {
		return 0, fmt.Errorf("close descriptor directory %s: %w", path, closeErr)
	}
	return max(0, len(entries)-1), nil
}
