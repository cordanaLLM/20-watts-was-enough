package releasebuild

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

type releasePaths struct {
	moduleRoot   string
	outputRoot   string
	outputParent string
	repository   string
}

func prepareReleasePaths(options Options) (releasePaths, error) {
	moduleRoot, err := resolveUnsymlinkedDirectory(options.ModuleRoot, "module root")
	if err != nil {
		return releasePaths{}, err
	}
	moduleFile := filepath.Join(moduleRoot, "go.mod")
	moduleInformation, err := os.Lstat(moduleFile)
	if err != nil || !moduleInformation.Mode().IsRegular() {
		return releasePaths{}, errors.New("module root must contain a regular, non-symlinked go.mod")
	}

	repository := filepath.Dir(moduleRoot)
	outputRoot, err := filepath.Abs(options.OutputRoot)
	if err != nil {
		return releasePaths{}, fmt.Errorf("resolve output root: %w", err)
	}
	outputRoot = filepath.Clean(outputRoot)
	if err := requireDescendant(repository, outputRoot, "output root"); err != nil {
		return releasePaths{}, err
	}
	if _, err := os.Lstat(outputRoot); err == nil {
		return releasePaths{}, errors.New("output root already exists")
	} else if !errors.Is(err, os.ErrNotExist) {
		return releasePaths{}, fmt.Errorf("inspect output root: %w", err)
	}

	outputParent := filepath.Dir(outputRoot)
	if err := rejectSymlinkedComponents(repository, outputParent, "output parent"); err != nil {
		return releasePaths{}, err
	}
	if err := os.MkdirAll(outputParent, 0o755); err != nil { //#nosec G301 -- release build output directory must be world-readable for packaging and publishing
		return releasePaths{}, fmt.Errorf("create output parent: %w", err)
	}
	if err := rejectSymlinkedComponents(repository, outputParent, "output parent"); err != nil {
		return releasePaths{}, err
	}
	return releasePaths{
		moduleRoot:   moduleRoot,
		outputRoot:   outputRoot,
		outputParent: outputParent,
		repository:   repository,
	}, nil
}

func recheckPublishPaths(paths releasePaths, stagingRoot string) error {
	if err := rejectSymlinkedComponents(paths.repository, paths.outputParent, "output parent"); err != nil {
		return err
	}
	if err := rejectSymlinkedComponents(paths.repository, stagingRoot, "staging root"); err != nil {
		return err
	}
	if _, err := os.Lstat(paths.outputRoot); err == nil {
		return errors.New("output root appeared before publication")
	} else if !errors.Is(err, os.ErrNotExist) {
		return fmt.Errorf("reinspect output root: %w", err)
	}
	return nil
}

func resolveUnsymlinkedDirectory(path, label string) (string, error) {
	absolute, err := filepath.Abs(path)
	if err != nil {
		return "", fmt.Errorf("resolve %s: %w", label, err)
	}
	absolute = filepath.Clean(absolute)
	information, err := os.Lstat(absolute)
	if err != nil {
		return "", fmt.Errorf("inspect %s: %w", label, err)
	}
	if information.Mode()&os.ModeSymlink != 0 || !information.IsDir() {
		return "", fmt.Errorf("%s must be a non-symlinked directory", label)
	}
	resolved, err := filepath.EvalSymlinks(absolute)
	if err != nil {
		return "", fmt.Errorf("resolve %s symlinks: %w", label, err)
	}
	if filepath.Clean(resolved) != absolute {
		return "", fmt.Errorf("%s must not contain symlinked path components", label)
	}
	return absolute, nil
}

func rejectSymlinkedComponents(root, target, label string) error {
	if err := requireContained(root, target, label); err != nil {
		return err
	}
	relative, err := filepath.Rel(root, target)
	if err != nil {
		return fmt.Errorf("resolve %s relative path: %w", label, err)
	}
	current := root
	components := []string{}
	if relative != "." {
		components = strings.Split(relative, string(filepath.Separator))
	}
	for _, component := range append([]string{"."}, components...) {
		if component != "." {
			current = filepath.Join(current, component)
		}
		information, inspectErr := os.Lstat(current)
		if errors.Is(inspectErr, os.ErrNotExist) {
			return nil
		}
		if inspectErr != nil {
			return fmt.Errorf("inspect %s component: %w", label, inspectErr)
		}
		if information.Mode()&os.ModeSymlink != 0 {
			return fmt.Errorf("%s must not contain symlinked path components", label)
		}
		if !information.IsDir() {
			return fmt.Errorf("%s path component must be a directory", label)
		}
	}
	return nil
}

func requireDescendant(root, target, label string) error {
	if filepath.Clean(root) == filepath.Clean(target) {
		return fmt.Errorf("%s must be below the repository root", label)
	}
	return requireContained(root, target, label)
}

func requireContained(root, target, label string) error {
	relative, err := filepath.Rel(root, target)
	if err != nil || filepath.IsAbs(relative) || relative == ".." || strings.HasPrefix(relative, ".."+string(filepath.Separator)) {
		return fmt.Errorf("%s escapes the repository root", label)
	}
	return nil
}
