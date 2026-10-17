package pdfrender

import (
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"regexp"
	"slices"
	"strings"

	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/fileidentity"
)

var dependencyNamePattern = regexp.MustCompile(`^[A-Za-z0-9_-][A-Za-z0-9._-]*$`)

func validDependencyPath(relative string) bool {
	if len(relative) > 2048 || strings.Contains(relative, "\\") {
		return false
	}
	parts := strings.Split(relative, "/")
	if len(parts) > maximumDependencyPathDepth {
		return false
	}
	for index := 0; index < len(parts); {
		if parts[index] != "node_modules" || index+1 >= len(parts) {
			return false
		}
		index++
		if strings.HasPrefix(parts[index], "@") {
			if !dependencyNamePattern.MatchString(strings.TrimPrefix(parts[index], "@")) || index+1 >= len(parts) {
				return false
			}
			index++
		}
		if !dependencyNamePattern.MatchString(parts[index]) {
			return false
		}
		index++
	}
	return true
}

func installedPackagePaths(ctx context.Context, root string) ([]string, error) {
	queue := []string{"node_modules"}
	packages := make([]string, 0)
	for index := 0; index < len(queue); index++ {
		if err := ctx.Err(); err != nil {
			return nil, err
		}
		directory := queue[index]
		names, err := dependencyDirectoryNames(root, directory)
		if err != nil {
			return nil, err
		}
		for _, name := range names {
			if err := ctx.Err(); err != nil {
				return nil, err
			}
			if dependencyInstallationAuxiliary(name) {
				continue
			}
			paths, err := dependencyEntryPaths(ctx, root, directory, name)
			if err != nil {
				return nil, err
			}
			packages = append(packages, paths...)
			if len(packages) > maximumInstalledPackages {
				return nil, errors.New("installed package inventory exceeds its 4096-package bound")
			}
			for _, relative := range paths {
				if err := ctx.Err(); err != nil {
					return nil, err
				}
				exists, err := nestedDependencyDirectory(root, relative)
				if err != nil {
					return nil, err
				}
				if exists {
					queue = append(queue, relative+"/node_modules")
				}
			}
		}
	}
	slices.Sort(packages)
	return packages, ctx.Err()
}

func dependencyInstallationAuxiliary(name string) bool {
	// npm command shims, its hidden lock, and Vite caches are not packages.
	// The hidden lock is checked separately; no other dot directory is ignored.
	switch name {
	case ".bin", ".cache", ".vite", ".vite-temp", ".package-lock.json":
		return true
	default:
		return false
	}
}

func dependencyEntryPaths(ctx context.Context, root, directory, name string) ([]string, error) {
	paths := []string{directory + "/" + name}
	if strings.HasPrefix(name, "@") {
		if !dependencyNamePattern.MatchString(strings.TrimPrefix(name, "@")) {
			return nil, fmt.Errorf("unsafe installed package scope %q", name)
		}
		names, err := dependencyDirectoryNames(root, paths[0])
		if err != nil {
			return nil, err
		}
		paths = make([]string, 0, len(names))
		for _, child := range names {
			if err := ctx.Err(); err != nil {
				return nil, err
			}
			paths = append(paths, directory+"/"+name+"/"+child)
		}
	}
	for _, relative := range paths {
		if err := ctx.Err(); err != nil {
			return nil, err
		}
		if !validDependencyPath(relative) {
			return nil, fmt.Errorf("unsafe installed package path %q", relative)
		}
		if err := requireContainedDirectory(root, relative, false); err != nil {
			return nil, err
		}
	}
	return paths, nil
}

func nestedDependencyDirectory(root, relative string) (bool, error) {
	name := relative + "/node_modules"
	_, err := fileidentity.Lstat(filepath.Join(root, filepath.FromSlash(name)))
	if errors.Is(err, os.ErrNotExist) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	return true, requireContainedDirectory(root, name, false)
}

func dependencyDirectoryNames(root, relative string) ([]string, error) {
	if err := requireContainedDirectory(root, relative, false); err != nil {
		return nil, err
	}
	name := filepath.Join(root, filepath.FromSlash(relative))
	before, err := fileidentity.Lstat(name)
	if err != nil {
		return nil, err
	}
	directory, err := os.Open(name)
	if err != nil {
		return nil, err
	}
	defer directory.Close()
	entries, err := directory.ReadDir(maximumInstalledPackages + 1)
	if err != nil && !errors.Is(err, io.EOF) {
		return nil, err
	}
	if len(entries) > maximumInstalledPackages {
		return nil, fmt.Errorf("%s exceeds the 4096-entry directory bound", relative)
	}
	opened, err := directory.Stat()
	if err != nil {
		return nil, err
	}
	after, err := fileidentity.Lstat(name)
	if err != nil || !os.SameFile(before, opened) || !os.SameFile(before, after) || !before.ModTime().Equal(after.ModTime()) {
		return nil, fmt.Errorf("%s changed while its inventory was read", relative)
	}
	names := make([]string, 0, len(entries))
	for _, entry := range entries {
		names = append(names, entry.Name())
	}
	slices.Sort(names)
	return names, nil
}
