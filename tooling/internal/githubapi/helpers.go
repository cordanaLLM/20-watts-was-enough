package githubapi

import (
	"errors"
	"fmt"
	"io"
	"net/url"
	"sort"
	"strings"
)

// Label holds the name returned by the GitHub labels API.
type Label struct {
	Name string `json:"name"`
}

// NormalizedLabels validates label names and returns them lowercased and sorted.
func NormalizedLabels(labels []Label) ([]string, error) {
	names := make([]string, 0, len(labels))
	seen := make(map[string]struct{}, len(labels))
	for _, label := range labels {
		name := strings.ToLower(label.Name)
		if name == "" || len(label.Name) > 256 || strings.TrimSpace(label.Name) != label.Name ||
			strings.ContainsRune(label.Name, '\x00') {
			return nil, fmt.Errorf("label %q is invalid", label.Name)
		}
		if _, duplicate := seen[name]; duplicate {
			return nil, fmt.Errorf("label %q is repeated", label.Name)
		}
		seen[name] = struct{}{}
		names = append(names, name)
	}
	sort.Strings(names)
	return names, nil
}

// DrainBounded discards up to limit+1 bytes and returns message if the limit is exceeded.
func DrainBounded(reader io.Reader, limit int64, message string) error {
	written, err := io.Copy(io.Discard, io.LimitReader(reader, limit+1))
	if err != nil {
		return err
	}
	if written > limit {
		return errors.New(message)
	}
	return nil
}

// FoldedSet returns the lowercased values as a set.
func FoldedSet(values []string) map[string]struct{} {
	result := make(map[string]struct{}, len(values))
	for _, value := range values {
		result[strings.ToLower(value)] = struct{}{}
	}
	return result
}

// EscapedPath escapes each path segment while preserving slash separators.
func EscapedPath(path string) string {
	segments := strings.Split(path, "/")
	for index, segment := range segments {
		segments[index] = url.PathEscape(segment)
	}
	return strings.Join(segments, "/")
}
