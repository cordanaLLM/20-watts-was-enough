package engineeringrelations

import (
	"errors"
	"fmt"
	"io"
	"os"
	"path"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
)

const (
	maximumPathBytes        = 256
	maximumDirectoryEntries = 256
)

var numberedMarkdownPattern = regexp.MustCompile(`^([0-9]{3})-[a-z0-9][a-z0-9-]*\.md$`)

// repository is a resolved, symlink-free repository root.
type repository struct {
	root string
}

func openRepository(root string) (repository, error) {
	absolute, err := filepath.Abs(root)
	if err != nil {
		return repository{}, fmt.Errorf("resolve repository root: %w", err)
	}
	resolved, err := filepath.EvalSymlinks(absolute)
	if err != nil {
		return repository{}, fmt.Errorf("resolve repository root: %w", err)
	}
	information, err := os.Lstat(resolved)
	if err != nil || !information.IsDir() {
		return repository{}, errors.New("repository root must be a directory")
	}
	return repository{root: filepath.Clean(resolved)}, nil
}

// regularFile resolves a clean relative path to a regular file that no
// symlink component reaches.
func (repo repository) regularFile(relative string) (string, error) {
	if !cleanRelativePath(relative) {
		return "", fmt.Errorf("path %q is not a clean repository-relative path", relative)
	}
	full := filepath.Join(repo.root, filepath.FromSlash(relative))
	information, err := os.Lstat(full)
	if err != nil {
		return "", fmt.Errorf("inspect %s: %w", relative, err)
	}
	if !information.Mode().IsRegular() {
		return "", fmt.Errorf("%s must be a regular file, not a link or special file", relative)
	}
	resolved, err := filepath.EvalSymlinks(full)
	if err != nil || filepath.Clean(resolved) != full {
		return "", fmt.Errorf("%s must not be reached through a symlink", relative)
	}
	return full, nil
}

// read returns the bytes of one regular file beneath the root and rejects a
// file larger than maximumBytes instead of truncating it.
func (repo repository) read(relative string, maximumBytes int64) ([]byte, error) {
	full, err := repo.regularFile(relative)
	if err != nil {
		return nil, err
	}
	file, err := os.Open(full)
	if err != nil {
		return nil, fmt.Errorf("open %s: %w", relative, err)
	}
	defer file.Close()
	body, err := io.ReadAll(io.LimitReader(file, maximumBytes+1))
	if err != nil {
		return nil, fmt.Errorf("read %s: %w", relative, err)
	}
	if int64(len(body)) > maximumBytes {
		return nil, fmt.Errorf("%s exceeds the %d-byte limit", relative, maximumBytes)
	}
	return body, nil
}

// entries lists one directory beneath the root in name order and rejects a
// directory with more than maximumDirectoryEntries entries.
func (repo repository) entries(relative string) ([]os.DirEntry, error) {
	if !cleanRelativePath(relative) {
		return nil, fmt.Errorf("path %q is not a clean repository-relative path", relative)
	}
	directory, err := os.Open(filepath.Join(repo.root, filepath.FromSlash(relative)))
	if err != nil {
		return nil, fmt.Errorf("open %s: %w", relative, err)
	}
	defer directory.Close()
	entries, err := directory.ReadDir(maximumDirectoryEntries + 1)
	if err != nil && !errors.Is(err, io.EOF) {
		return nil, fmt.Errorf("list %s: %w", relative, err)
	}
	if len(entries) > maximumDirectoryEntries {
		return nil, fmt.Errorf("%s holds more than %d entries", relative, maximumDirectoryEntries)
	}
	sort.Slice(entries, func(left, right int) bool { return entries[left].Name() < entries[right].Name() })
	return entries, nil
}

// numberedMarkdown maps each three-digit contract number in one directory to
// its repository-relative Markdown path.
func (repo repository) numberedMarkdown(relative string) (map[string]string, error) {
	entries, err := repo.entries(relative)
	if err != nil {
		return nil, err
	}
	files := make(map[string]string, len(entries))
	for _, entry := range entries {
		match := numberedMarkdownPattern.FindStringSubmatch(entry.Name())
		if match == nil {
			continue
		}
		if _, duplicate := files[match[1]]; duplicate {
			return nil, fmt.Errorf("%s holds two contracts numbered %s", relative, match[1])
		}
		files[match[1]] = relative + "/" + entry.Name()
	}
	return files, nil
}

// cleanRelativePath accepts a bounded slash-separated relative path with no
// empty, current or parent segment, drive letter, backslash or control byte.
func cleanRelativePath(value string) bool {
	if value == "" || len(value) > maximumPathBytes || strings.HasPrefix(value, "/") ||
		strings.ContainsAny(value, `\:`) || containsControl(value) || path.Clean(value) != value {
		return false
	}
	for _, segment := range strings.Split(value, "/") {
		if segment == "" || segment == "." || segment == ".." {
			return false
		}
	}
	return true
}

func containsControl(value string) bool {
	for _, character := range value {
		if character < 0x20 || character == 0x7f {
			return true
		}
	}
	return false
}
