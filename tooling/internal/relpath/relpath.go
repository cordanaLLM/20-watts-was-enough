// Package relpath validates clean relative paths.
package relpath

import (
	"path/filepath"
	"strings"
)

// Valid reports whether value is a clean slash-separated relative path.
func Valid(value string) bool {
	if value == "" || filepath.IsAbs(value) || strings.Contains(value, "\\") {
		return false
	}
	cleaned := filepath.ToSlash(filepath.Clean(filepath.FromSlash(value)))
	return cleaned == value && value != "." && !strings.HasPrefix(value, "../")
}
