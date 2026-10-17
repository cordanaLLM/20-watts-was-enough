// Package nodeimage materializes the bounded repository closure for a runnable
// JavaScript experiment image.
package nodeimage

import (
	"bufio"
	"crypto/sha256"
	"encoding/binary"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/fileidentity"
)

const (
	deterministicTimestampWindowSeconds = 20 * 365 * 24 * 60 * 60
	maximumClosureFiles                 = 32
	maximumFileBytes                    = 8 * 1024 * 1024
	maximumClosureBytes                 = 32 * 1024 * 1024
)

type descriptor struct {
	artifact string
	runner   string
	files    []string
}

var descriptors = map[string]descriptor{
	"fixture-007": {
		artifact: "fixture-007",
		runner:   "experiments/workstation/fixture-007/runner.mjs",
		files: []string{
			"experiments/workstation/fixture-007/configs/development.json",
			"experiments/workstation/fixture-007/configs/smoke.json",
			"experiments/workstation/fixture-007/contract.mjs",
			"experiments/workstation/fixture-007/generator.mjs",
			"experiments/workstation/fixture-007/runner.mjs",
			"experiments/workstation/fixture-007/seeds/development.json",
			"experiments/workstation/lib/execution-receipt.mjs",
		},
	},
	"fixture-019": {
		artifact: "fixture-019",
		runner:   "experiments/workstation/fixture-019/runner.mjs",
		files: []string{
			"experiments/workstation/fixture-019/analysis.py",
			"experiments/workstation/fixture-019/configs/development.json",
			"experiments/workstation/fixture-019/configs/smoke.json",
			"experiments/workstation/fixture-019/contract.mjs",
			"experiments/workstation/fixture-019/evaluator.py",
			"experiments/workstation/fixture-019/generator.py",
			"experiments/workstation/fixture-019/output.schema.json",
			"experiments/workstation/fixture-019/python-environment.lock.json",
			"experiments/workstation/fixture-019/runner.mjs",
			"experiments/workstation/fixture-019/seeds/development.reveal.json",
			"experiments/workstation/fixture-019/simulator.py",
			"experiments/workstation/fixture-019/worker.py",
			"experiments/workstation/lib/checkpoint-ledger.mjs",
			"experiments/workstation/lib/execution-receipt.mjs",
			"requirements-ci.txt",
		},
	},
}

// Options identifies one closed experiment image context.
type Options struct {
	RepositoryRoot string
	OutputRoot     string
	Artifact       string
}

// SupportedArtifacts returns the sorted, closed set accepted by Package.
func SupportedArtifacts() []string {
	artifacts := make([]string, 0, len(descriptors))
	for artifact := range descriptors {
		artifacts = append(artifacts, artifact)
	}
	sort.Strings(artifacts)
	return artifacts
}

// Package copies only the declared runtime closure into a new deterministic
// Docker build context. It never traverses the repository or follows symlinks.
func Package(options Options) (returnError error) {
	descriptor, ok := descriptors[options.Artifact]
	if !ok {
		return fmt.Errorf("artifact %q is not supported by the scoped experiment image packager", options.Artifact)
	}
	if options.RepositoryRoot == "" {
		return errors.New("repository root is required")
	}
	if options.OutputRoot == "" {
		return errors.New("output root is required")
	}
	if err := validateDescriptor(descriptor); err != nil {
		return err
	}

	repositoryRoot, err := cleanExistingDirectory(options.RepositoryRoot, "repository root")
	if err != nil {
		return err
	}
	outputRoot, err := filepath.Abs(options.OutputRoot)
	if err != nil {
		return fmt.Errorf("resolve output root: %w", err)
	}
	if _, err := fileidentity.Lstat(outputRoot); err == nil {
		return errors.New("output root already exists")
	} else if !errors.Is(err, os.ErrNotExist) {
		return fmt.Errorf("inspect output root: %w", err)
	}

	outputParent := filepath.Dir(outputRoot)
	if err := os.MkdirAll(outputParent, 0o755); err != nil {
		return fmt.Errorf("create output parent: %w", err)
	}
	if _, err := cleanExistingDirectory(outputParent, "output parent"); err != nil {
		return err
	}
	stagingRoot, err := os.MkdirTemp(outputParent, ".node-image-context-")
	if err != nil {
		return fmt.Errorf("create staging context: %w", err)
	}
	defer func() {
		if returnError != nil {
			_ = os.RemoveAll(stagingRoot)
		}
	}()

	checksums := make([]checksum, 0, len(descriptor.files))
	var totalBytes int64
	for _, relativePath := range descriptor.files {
		digest, size, err := copyRegularFile(repositoryRoot, stagingRoot, relativePath)
		if err != nil {
			return err
		}
		totalBytes += size
		if totalBytes > maximumClosureBytes {
			return fmt.Errorf("artifact %s runtime closure exceeds %d bytes", descriptor.artifact, maximumClosureBytes)
		}
		checksums = append(checksums, checksum{path: relativePath, digest: digest})
	}

	if err := writeExclusive(filepath.Join(stagingRoot, ".experiment-artifact"), descriptor.artifact+"\n"); err != nil {
		return err
	}
	if err := writeExclusive(filepath.Join(stagingRoot, ".experiment-runner"), descriptor.runner+"\n"); err != nil {
		return err
	}
	if err := writeChecksumManifest(filepath.Join(stagingRoot, "closure.sha256"), checksums); err != nil {
		return err
	}
	if err := normalizeContextMetadata(stagingRoot); err != nil {
		return err
	}
	if err := os.Rename(stagingRoot, outputRoot); err != nil {
		return fmt.Errorf("publish experiment image context: %w", err)
	}
	return nil
}

func validateDescriptor(value descriptor) error {
	if value.artifact == "" || value.runner == "" {
		return errors.New("experiment image descriptor is incomplete")
	}
	if len(value.files) == 0 || len(value.files) > maximumClosureFiles {
		return fmt.Errorf("artifact %s has an invalid runtime closure size", value.artifact)
	}
	if !sort.StringsAreSorted(value.files) {
		return fmt.Errorf("artifact %s runtime closure is not sorted", value.artifact)
	}
	seen := make(map[string]struct{}, len(value.files))
	runnerPresent := false
	for _, relativePath := range value.files {
		if err := validateRelativePath(relativePath); err != nil {
			return fmt.Errorf("artifact %s: %w", value.artifact, err)
		}
		if _, ok := seen[relativePath]; ok {
			return fmt.Errorf("artifact %s repeats runtime path %s", value.artifact, relativePath)
		}
		seen[relativePath] = struct{}{}
		if relativePath == value.runner {
			runnerPresent = true
		}
	}
	if !runnerPresent {
		return fmt.Errorf("artifact %s runtime closure omits its runner", value.artifact)
	}
	return nil
}

func validateRelativePath(value string) error {
	if value == "" || filepath.IsAbs(value) || strings.Contains(value, "\\") {
		return fmt.Errorf("runtime path %q is not a portable repository-relative path", value)
	}
	cleaned := filepath.ToSlash(filepath.Clean(filepath.FromSlash(value)))
	if cleaned != value || value == "." || strings.HasPrefix(value, "../") {
		return fmt.Errorf("runtime path %q is not clean", value)
	}
	for _, component := range strings.Split(value, "/") {
		if component == "" || component == "." || component == ".." {
			return fmt.Errorf("runtime path %q contains an invalid component", value)
		}
	}
	return nil
}

func cleanExistingDirectory(value, label string) (string, error) {
	absolute, err := filepath.Abs(value)
	if err != nil {
		return "", fmt.Errorf("resolve %s: %w", label, err)
	}
	information, err := fileidentity.Lstat(absolute)
	if err != nil {
		return "", fmt.Errorf("inspect %s: %w", label, err)
	}
	if !information.IsDir() || information.Mode()&os.ModeSymlink != 0 {
		return "", fmt.Errorf("%s must be a real directory", label)
	}
	resolved, err := filepath.EvalSymlinks(absolute)
	if err != nil {
		return "", fmt.Errorf("resolve %s symlinks: %w", label, err)
	}
	if resolved != absolute {
		return "", fmt.Errorf("%s path must not contain symlinks", label)
	}
	return absolute, nil
}

func copyRegularFile(repositoryRoot, stagingRoot, relativePath string) (string, int64, error) {
	sourcePath := filepath.Join(repositoryRoot, filepath.FromSlash(relativePath))
	if !inside(repositoryRoot, sourcePath) {
		return "", 0, fmt.Errorf("runtime path escapes repository root: %s", relativePath)
	}
	information, err := fileidentity.Lstat(sourcePath)
	if err != nil {
		return "", 0, fmt.Errorf("inspect runtime file %s: %w", relativePath, err)
	}
	if !information.Mode().IsRegular() || information.Mode()&os.ModeSymlink != 0 {
		return "", 0, fmt.Errorf("runtime file %s must be a regular file, not a symlink", relativePath)
	}
	if information.Size() < 0 || information.Size() > maximumFileBytes {
		return "", 0, fmt.Errorf("runtime file %s exceeds %d bytes", relativePath, maximumFileBytes)
	}
	resolved, err := filepath.EvalSymlinks(sourcePath)
	if err != nil {
		return "", 0, fmt.Errorf("resolve runtime file %s: %w", relativePath, err)
	}
	if resolved != sourcePath {
		return "", 0, fmt.Errorf("runtime file %s path must not contain symlinks", relativePath)
	}

	source, err := os.Open(sourcePath)
	if err != nil {
		return "", 0, fmt.Errorf("open runtime file %s: %w", relativePath, err)
	}
	defer source.Close()
	openedInformation, err := source.Stat()
	if err != nil || !openedInformation.Mode().IsRegular() || !os.SameFile(information, openedInformation) {
		return "", 0, fmt.Errorf("runtime file %s changed while opening", relativePath)
	}
	currentInformation, err := fileidentity.Lstat(sourcePath)
	if err != nil || !currentInformation.Mode().IsRegular() || !os.SameFile(openedInformation, currentInformation) {
		return "", 0, fmt.Errorf("runtime file %s changed while opening", relativePath)
	}

	destinationPath := filepath.Join(stagingRoot, filepath.FromSlash(relativePath))
	if err := os.MkdirAll(filepath.Dir(destinationPath), 0o755); err != nil {
		return "", 0, fmt.Errorf("create runtime directory for %s: %w", relativePath, err)
	}
	destination, err := os.OpenFile(destinationPath, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0o644)
	if err != nil {
		return "", 0, fmt.Errorf("create runtime file %s: %w", relativePath, err)
	}
	hash := sha256.New()
	written, copyError := io.Copy(io.MultiWriter(destination, hash), io.LimitReader(source, maximumFileBytes+1))
	closeError := destination.Close()
	if copyError != nil {
		return "", 0, fmt.Errorf("copy runtime file %s: %w", relativePath, copyError)
	}
	if closeError != nil {
		return "", 0, fmt.Errorf("close runtime file %s: %w", relativePath, closeError)
	}
	if written != information.Size() || written > maximumFileBytes {
		return "", 0, fmt.Errorf("runtime file %s changed while copying", relativePath)
	}
	finalOpenedInformation, err := source.Stat()
	if err != nil || !os.SameFile(information, finalOpenedInformation) || finalOpenedInformation.Size() != information.Size() || !finalOpenedInformation.ModTime().Equal(information.ModTime()) {
		return "", 0, fmt.Errorf("runtime file %s changed while copying", relativePath)
	}
	finalPathInformation, err := fileidentity.Lstat(sourcePath)
	if err != nil || !finalPathInformation.Mode().IsRegular() || !os.SameFile(finalOpenedInformation, finalPathInformation) {
		return "", 0, fmt.Errorf("runtime file %s changed while copying", relativePath)
	}
	return hex.EncodeToString(hash.Sum(nil)), written, nil
}

func inside(root, target string) bool {
	relative, err := filepath.Rel(root, target)
	return err == nil && relative != ".." && !strings.HasPrefix(relative, ".."+string(filepath.Separator)) && !filepath.IsAbs(relative)
}

type checksum struct {
	path   string
	digest string
}

func writeChecksumManifest(path string, checksums []checksum) error {
	file, err := os.OpenFile(path, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0o644)
	if err != nil {
		return fmt.Errorf("create closure checksum manifest: %w", err)
	}
	writer := bufio.NewWriter(file)
	for _, entry := range checksums {
		if _, err := fmt.Fprintf(writer, "%s  %s\n", entry.digest, entry.path); err != nil {
			_ = file.Close()
			return fmt.Errorf("write closure checksum manifest: %w", err)
		}
	}
	if err := writer.Flush(); err != nil {
		_ = file.Close()
		return fmt.Errorf("flush closure checksum manifest: %w", err)
	}
	if err := file.Close(); err != nil {
		return fmt.Errorf("close closure checksum manifest: %w", err)
	}
	return nil
}

func writeExclusive(path, body string) error {
	file, err := os.OpenFile(path, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0o644)
	if err != nil {
		return fmt.Errorf("create packaging metadata %s: %w", filepath.Base(path), err)
	}
	if _, err := io.WriteString(file, body); err != nil {
		_ = file.Close()
		return fmt.Errorf("write packaging metadata %s: %w", filepath.Base(path), err)
	}
	if err := file.Close(); err != nil {
		return fmt.Errorf("close packaging metadata %s: %w", filepath.Base(path), err)
	}
	return nil
}

func normalizeContextMetadata(root string) error {
	fixed := time.Date(2000, time.January, 1, 0, 0, 0, 0, time.UTC)
	entries := 0
	err := filepath.WalkDir(root, func(path string, entry os.DirEntry, walkError error) error {
		if walkError != nil {
			return walkError
		}
		entries++
		if entries > maximumClosureFiles+16 {
			return errors.New("generated experiment image context contains too many entries")
		}
		information, err := fileidentity.Info(entry)
		if err != nil {
			return err
		}
		if !information.IsDir() && !information.Mode().IsRegular() {
			return fmt.Errorf("generated experiment image context contains a non-regular entry: %s", path)
		}
		mode := os.FileMode(0o755)
		timestamp := fixed
		if information.Mode().IsRegular() {
			mode = 0o644
		}
		if err := os.Chmod(path, mode); err != nil {
			return err
		}
		if information.Mode().IsRegular() {
			timestamp, err = deterministicFileTimestamp(path)
			if err != nil {
				return err
			}
		}
		if err := os.Chtimes(path, timestamp, timestamp); err != nil {
			return err
		}
		return nil
	})
	if err != nil {
		return fmt.Errorf("normalize experiment image context metadata: %w", err)
	}
	return nil
}

func deterministicFileTimestamp(path string) (time.Time, error) {
	// Content-derived metadata keeps fixed input reproducible while preventing
	// BuildKit from reusing a stale same-size file from a previous context.
	file, err := os.Open(path)
	if err != nil {
		return time.Time{}, fmt.Errorf("open generated context file for timestamp: %w", err)
	}
	hash := sha256.New()
	written, copyError := io.Copy(hash, io.LimitReader(file, maximumClosureBytes+1))
	closeError := file.Close()
	if copyError != nil {
		return time.Time{}, fmt.Errorf("hash generated context file for timestamp: %w", copyError)
	}
	if closeError != nil {
		return time.Time{}, fmt.Errorf("close generated context file after timestamp hash: %w", closeError)
	}
	if written > maximumClosureBytes {
		return time.Time{}, fmt.Errorf("generated context file exceeds timestamp hash bound: %s", path)
	}
	digest := hash.Sum(nil)
	seconds := binary.BigEndian.Uint32(digest[:4]) % uint32(deterministicTimestampWindowSeconds)
	nanoseconds := binary.BigEndian.Uint32(digest[4:8]) % uint32(time.Second)
	epoch := time.Date(2000, time.January, 1, 0, 0, 0, 0, time.UTC)
	return epoch.Add(time.Duration(seconds)*time.Second + time.Duration(nanoseconds)), nil
}
