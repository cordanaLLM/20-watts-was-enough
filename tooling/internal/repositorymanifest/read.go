// Package repositorymanifest reads bounded canonical manifests beneath .github.
package repositorymanifest

import (
	"bytes"
	"errors"
	"fmt"
	"io"
	"os"
	"path"
	"path/filepath"
	"reflect"
	"strings"
)

const maximumAllowedBytes = 16 << 20

// Read returns one stable, real, regular manifest beneath a real .github
// directory. The repeated read and identity checks reject replacement or
// same-inode mutation while authority bytes are consumed.
func Read(root, relativePath string, maximumBytes int64) ([]byte, error) {
	if maximumBytes < 1 || maximumBytes > maximumAllowedBytes {
		return nil, fmt.Errorf("manifest byte limit must be between 1 and %d", maximumAllowedBytes)
	}
	normalized := filepath.ToSlash(relativePath)
	parts := strings.Split(normalized, "/")
	if filepath.IsAbs(relativePath) || path.Clean(normalized) != normalized ||
		len(parts) != 2 || parts[0] != ".github" || parts[1] == "" || parts[1] == "." || parts[1] == ".." {
		return nil, errors.New("manifest path must name one file directly beneath .github")
	}

	absoluteRoot, err := filepath.Abs(root)
	if err != nil {
		return nil, fmt.Errorf("resolve repository root: %w", err)
	}
	absoluteRoot = filepath.Clean(absoluteRoot)
	rootIdentity, err := realDirectoryIdentity(absoluteRoot, "repository root")
	if err != nil {
		return nil, err
	}
	githubDirectory := filepath.Join(absoluteRoot, ".github")
	githubIdentity, err := realDirectoryIdentity(githubDirectory, ".github directory")
	if err != nil {
		return nil, err
	}
	body, err := readStableRegularFile(filepath.Join(githubDirectory, parts[1]), maximumBytes, nil)
	if err != nil {
		return nil, fmt.Errorf("read %s: %w", normalized, err)
	}
	if err := unchangedDirectoryIdentity(absoluteRoot, rootIdentity, "repository root"); err != nil {
		return nil, err
	}
	if err := unchangedDirectoryIdentity(githubDirectory, githubIdentity, ".github directory"); err != nil {
		return nil, err
	}
	return body, nil
}

func realDirectoryIdentity(path, label string) (os.FileInfo, error) {
	information, err := os.Lstat(path)
	if err != nil {
		return nil, fmt.Errorf("inspect %s: %w", label, err)
	}
	if !information.IsDir() || information.Mode()&os.ModeSymlink != 0 {
		return nil, fmt.Errorf("%s must be a real directory", label)
	}
	resolved, err := filepath.EvalSymlinks(path)
	if err != nil {
		return nil, fmt.Errorf("resolve %s: %w", label, err)
	}
	if filepath.Clean(resolved) != filepath.Clean(path) {
		return nil, fmt.Errorf("%s path must not contain symlinks", label)
	}
	return information, nil
}

func unchangedDirectoryIdentity(path string, expected os.FileInfo, label string) error {
	current, err := os.Lstat(path)
	if err != nil || !current.IsDir() || current.Mode()&os.ModeSymlink != 0 || !os.SameFile(expected, current) {
		return fmt.Errorf("%s changed while the manifest was read", label)
	}
	return nil
}

func readStableRegularFile(path string, maximumBytes int64, afterRead func() error) ([]byte, error) {
	before, err := os.Lstat(path)
	if err != nil {
		return nil, err
	}
	if !before.Mode().IsRegular() {
		return nil, errors.New("manifest must be a regular file, not a link or special file")
	}
	if before.Size() > maximumBytes {
		return nil, fmt.Errorf("manifest exceeds the %d-byte limit", maximumBytes)
	}
	file, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer file.Close()
	opened, err := file.Stat()
	if err != nil || !unchangedRegularFile(before, opened) {
		return nil, errors.New("manifest changed before it was opened")
	}
	body, err := io.ReadAll(io.LimitReader(file, maximumBytes+1))
	if err != nil {
		return nil, err
	}
	if int64(len(body)) > maximumBytes {
		return nil, fmt.Errorf("manifest exceeds the %d-byte limit", maximumBytes)
	}
	if afterRead != nil {
		if err := afterRead(); err != nil {
			return nil, fmt.Errorf("run stable-read interlock: %w", err)
		}
	}
	readState, err := file.Stat()
	if err != nil || !unchangedRegularFile(opened, readState) {
		return nil, errors.New("manifest changed while it was read")
	}
	if _, err := file.Seek(0, io.SeekStart); err != nil {
		return nil, fmt.Errorf("rewind manifest for stable-read verification: %w", err)
	}
	confirmation, err := io.ReadAll(io.LimitReader(file, maximumBytes+1))
	if err != nil {
		return nil, err
	}
	confirmedState, err := file.Stat()
	if err != nil || int64(len(confirmation)) > maximumBytes || !bytes.Equal(body, confirmation) ||
		!unchangedRegularFile(readState, confirmedState) {
		return nil, errors.New("manifest changed while it was read")
	}
	after, err := os.Lstat(path)
	if err != nil || after.Mode()&os.ModeSymlink != 0 || !unchangedRegularFile(confirmedState, after) {
		return nil, errors.New("manifest changed while it was read")
	}
	return body, nil
}

func unchangedRegularFile(before, after os.FileInfo) bool {
	if !before.Mode().IsRegular() || !after.Mode().IsRegular() || !os.SameFile(before, after) {
		return false
	}
	if before.Mode() != after.Mode() || before.Size() != after.Size() || !before.ModTime().Equal(after.ModTime()) {
		return false
	}
	beforeChange, beforeHasChange := changeTimeIdentity(before)
	afterChange, afterHasChange := changeTimeIdentity(after)
	if beforeHasChange != afterHasChange {
		return false
	}
	return !beforeHasChange || reflect.DeepEqual(beforeChange, afterChange)
}

type changeTimeComponent struct {
	name  string
	value any
}

// changeTimeIdentity reads the opaque FileInfo system payload instead of
// importing an operating-system-specific Stat_t. The repeated bounded content
// read remains the fallback when FileInfo has no change-time field.
func changeTimeIdentity(information os.FileInfo) ([]changeTimeComponent, bool) {
	value := reflect.ValueOf(information.Sys())
	for value.IsValid() && (value.Kind() == reflect.Interface || value.Kind() == reflect.Pointer) {
		if value.IsNil() {
			return nil, false
		}
		value = value.Elem()
	}
	if !value.IsValid() || value.Kind() != reflect.Struct {
		return nil, false
	}

	components := make([]changeTimeComponent, 0, 2)
	structure := value.Type()
	for index := 0; index < value.NumField(); index++ {
		fieldName := strings.ToLower(structure.Field(index).Name)
		if fieldName != "changetime" && !strings.HasPrefix(fieldName, "ctim") {
			continue
		}
		field := value.Field(index)
		if !field.CanInterface() {
			return nil, false
		}
		components = append(components, changeTimeComponent{name: fieldName, value: field.Interface()})
	}
	return components, len(components) > 0
}
