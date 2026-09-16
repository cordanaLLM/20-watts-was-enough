package pdftools

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"unicode"
	"unicode/utf8"

	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/strictjson"
)

func cleanRoot(value string) (string, os.FileInfo, error) {
	if value == "" {
		return "", nil, errors.New("repository root is required")
	}
	root, err := filepath.Abs(value)
	if err != nil {
		return "", nil, fmt.Errorf("resolve repository root: %w", err)
	}
	info, err := os.Lstat(root)
	if err != nil || !info.IsDir() || info.Mode()&os.ModeSymlink != 0 {
		return "", nil, errors.New("repository root must be a real non-symlink directory")
	}
	return filepath.Clean(root), info, nil
}

func readRelative(root, relative, label string, maximum int64) ([]byte, error) {
	if !validRelativePath(relative) {
		return nil, fmt.Errorf("%s path is not a clean repository-relative path", label)
	}
	path := filepath.Join(root, filepath.FromSlash(relative))
	if err := rejectLinkedPath(root, path, label); err != nil {
		return nil, err
	}
	info, err := os.Lstat(path)
	if err != nil || !info.Mode().IsRegular() || info.Size() <= 0 || info.Size() > maximum {
		return nil, fmt.Errorf("%s must be a regular file between 1 and %d bytes", label, maximum)
	}
	file, err := os.Open(path)
	if err != nil {
		return nil, fmt.Errorf("open %s: %w", label, err)
	}
	defer file.Close()
	body, err := io.ReadAll(io.LimitReader(file, maximum+1))
	if err != nil {
		return nil, fmt.Errorf("read stable %s: %w", label, err)
	}
	if int64(len(body)) != info.Size() {
		return nil, fmt.Errorf("%s size changed while it was read", label)
	}
	opened, err := file.Stat()
	if err != nil || !os.SameFile(info, opened) {
		return nil, fmt.Errorf("%s changed while it was read", label)
	}
	current, err := os.Lstat(path)
	if err != nil || !os.SameFile(opened, current) {
		return nil, fmt.Errorf("%s path changed while it was read", label)
	}
	return body, nil
}

func rejectLinkedPath(root, target, label string) error {
	relative, err := filepath.Rel(root, target)
	if err != nil || relative == ".." || strings.HasPrefix(relative, ".."+string(filepath.Separator)) {
		return fmt.Errorf("%s escapes the repository root", label)
	}
	current := root
	for _, component := range strings.Split(relative, string(filepath.Separator)) {
		current = filepath.Join(current, component)
		info, componentError := os.Lstat(current)
		if componentError != nil {
			return fmt.Errorf("inspect %s: %w", label, componentError)
		}
		if info.Mode()&os.ModeSymlink != 0 {
			return fmt.Errorf("%s path contains a symlink", label)
		}
	}
	return nil
}

func validRelativePath(value string) bool {
	if value == "" || filepath.IsAbs(value) || strings.Contains(value, "\\") {
		return false
	}
	cleaned := filepath.ToSlash(filepath.Clean(filepath.FromSlash(value)))
	return cleaned == value && value != "." && !strings.HasPrefix(value, "../")
}

func containsConfusingPathControl(value string) bool {
	if !utf8.ValidString(value) {
		return true
	}
	return strings.ContainsFunc(value, func(character rune) bool {
		return unicode.IsControl(character) || unicode.Is(unicode.Cf, character) ||
			character == '\u2028' || character == '\u2029'
	})
}

func decodeCanonical[T any](body []byte, depth int, label string) (T, error) {
	var value T
	if err := strictjson.Validate(body, depth); err != nil {
		return value, fmt.Errorf("validate %s JSON: %w", label, err)
	}
	decoder := json.NewDecoder(bytes.NewReader(body))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&value); err != nil {
		return value, fmt.Errorf("decode %s: %w", label, err)
	}
	canonical, err := json.MarshalIndent(value, "", "  ")
	if err != nil {
		return value, fmt.Errorf("marshal canonical %s: %w", label, err)
	}
	canonical = append(canonical, '\n')
	if !bytes.Equal(body, canonical) {
		return value, fmt.Errorf("%s is not canonical JSON", label)
	}
	return value, nil
}

func rawDigest(body []byte) string {
	digest := sha256.Sum256(body)
	return hex.EncodeToString(digest[:])
}
