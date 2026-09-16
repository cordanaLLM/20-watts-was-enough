// Package pdfrender validates and runs the repository's pinned PDF renderer.
package pdfrender

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"

	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/pdfrenderlock"
)

const (
	lockRelativePath = pdfrenderlock.RelativePath
	maximumLockBytes = pdfrenderlock.MaximumBytes
)

var (
	rawSHA256Pattern   = regexp.MustCompile(`^[0-9a-f]{64}$`)
	gitRevisionPattern = regexp.MustCompile(`^[0-9a-f]{40}$`)
)

// Lock is the single checked-in identity and resource contract for PDF rendering.
type Lock = pdfrenderlock.Lock

// Builder binds the Buildx client and BuildKit daemon used to derive the
// renderer image instead of trusting the caller's ambient builder.
type Builder = pdfrenderlock.Builder

// Exporter binds digest-affecting image assembly choices. CompatibilityVersion
// records the reviewed BuildKit default; it is not passed as an exporter option.
type Exporter = pdfrenderlock.Exporter

// RuntimeImage binds a named runtime version to one immutable OCI image index.
type RuntimeImage = pdfrenderlock.RuntimeImage

// ChromeForTesting binds the browser bytes staged into the renderer image to
// Google's generation-addressed archive.
type ChromeForTesting = pdfrenderlock.ChromeForTesting

// Limits closes every material local subprocess and container resource boundary.
type Limits = pdfrenderlock.Limits

// Configuration is one validated renderer lock resolved beneath a repository.
type Configuration struct {
	RepositoryRoot              string
	LockPath                    string
	LockSHA256                  string
	Lock                        Lock
	installedDependenciesSHA256 string
}

// Check validates the local renderer authority without invoking Docker or the network.
func Check(repositoryRoot string) (Configuration, error) {
	root, err := cleanRepositoryRoot(repositoryRoot)
	if err != nil {
		return Configuration{}, err
	}
	lockPath := filepath.Join(root, filepath.FromSlash(lockRelativePath))
	body, err := readRegularBounded(root, lockPath, maximumLockBytes, "PDF renderer lock")
	if err != nil {
		return Configuration{}, err
	}
	lock, err := pdfrenderlock.Parse(body)
	if err != nil {
		return Configuration{}, err
	}
	lockDigest := sha256.Sum256(body)
	return Configuration{
		RepositoryRoot: root,
		LockPath:       lockPath,
		LockSHA256:     hex.EncodeToString(lockDigest[:]),
		Lock:           lock,
	}, nil
}

func validateLock(lock Lock) error {
	return pdfrenderlock.Validate(lock)
}

func cleanRepositoryRoot(repositoryRoot string) (string, error) {
	if repositoryRoot == "" {
		return "", errors.New("repository root is required")
	}
	root, err := filepath.Abs(repositoryRoot)
	if err != nil {
		return "", fmt.Errorf("resolve repository root: %w", err)
	}
	root = filepath.Clean(root)
	information, err := os.Lstat(root)
	if err != nil {
		return "", fmt.Errorf("inspect repository root: %w", err)
	}
	if !information.IsDir() || information.Mode()&os.ModeSymlink != 0 {
		return "", errors.New("repository root must be a non-symlink directory")
	}
	if strings.ContainsAny(root, ",\n\r\x00") {
		return "", errors.New("repository root contains a character unsupported by Docker bind mounts")
	}
	return root, nil
}

func readRegularBounded(root, file string, maximumBytes int64, label string) ([]byte, error) {
	return readRegularBoundedWithInterlock(root, file, maximumBytes, label, nil)
}

func readRegularBoundedWithInterlock(
	root, file string,
	maximumBytes int64,
	label string,
	afterRead func() error,
) ([]byte, error) {
	pathBefore, err := inspectRegularBoundedPath(root, file, label)
	if err != nil {
		return nil, err
	}
	information := pathBefore[len(pathBefore)-1]
	if information.Size() <= 0 || information.Size() > maximumBytes {
		return nil, fmt.Errorf("%s size must be between 1 and %d bytes", label, maximumBytes)
	}
	opened, err := os.Open(file)
	if err != nil {
		return nil, fmt.Errorf("open %s: %w", label, err)
	}
	defer opened.Close()
	openedInformation, err := opened.Stat()
	if err != nil || !unchangedRegularBoundedFile(information, openedInformation) {
		return nil, fmt.Errorf("%s changed before it was opened", label)
	}
	body, err := io.ReadAll(io.LimitReader(opened, maximumBytes+1))
	if err != nil {
		return nil, fmt.Errorf("read %s: %w", label, err)
	}
	if int64(len(body)) > maximumBytes {
		return nil, fmt.Errorf("%s exceeds %d bytes", label, maximumBytes)
	}
	if afterRead != nil {
		if err := afterRead(); err != nil {
			return nil, fmt.Errorf("run %s stable-read interlock: %w", label, err)
		}
	}
	readInformation, err := opened.Stat()
	if err != nil || !unchangedRegularBoundedFile(openedInformation, readInformation) {
		return nil, fmt.Errorf("%s changed while it was read", label)
	}
	if _, err := opened.Seek(0, io.SeekStart); err != nil {
		return nil, fmt.Errorf("rewind %s for stable-read verification: %w", label, err)
	}
	confirmation, err := io.ReadAll(io.LimitReader(opened, maximumBytes+1))
	if err != nil {
		return nil, fmt.Errorf("confirm %s: %w", label, err)
	}
	confirmedInformation, err := opened.Stat()
	if err != nil || int64(len(confirmation)) > maximumBytes || !bytes.Equal(body, confirmation) ||
		!unchangedRegularBoundedFile(readInformation, confirmedInformation) {
		return nil, fmt.Errorf("%s changed while it was read", label)
	}
	pathAfter, err := inspectRegularBoundedPath(root, file, label)
	if err != nil || !unchangedRegularBoundedPath(pathBefore, pathAfter) ||
		!unchangedRegularBoundedFile(confirmedInformation, pathAfter[len(pathAfter)-1]) ||
		int64(len(body)) != confirmedInformation.Size() {
		return nil, fmt.Errorf("%s changed while it was read", label)
	}
	return body, nil
}

func inspectRegularBoundedPath(root, file, label string) ([]os.FileInfo, error) {
	relative, err := filepath.Rel(root, file)
	if err != nil || relative == "." || relative == ".." || strings.HasPrefix(relative, ".."+string(filepath.Separator)) {
		return nil, fmt.Errorf("%s escapes the repository root", label)
	}
	rootInformation, err := os.Lstat(root)
	if err != nil {
		return nil, fmt.Errorf("inspect %s path root: %w", label, err)
	}
	if !rootInformation.IsDir() || rootInformation.Mode()&os.ModeSymlink != 0 {
		return nil, fmt.Errorf("%s path root must be a real directory", label)
	}
	components := strings.Split(relative, string(filepath.Separator))
	path := make([]os.FileInfo, 0, len(components)+1)
	path = append(path, rootInformation)
	current := root
	for index, component := range components {
		current = filepath.Join(current, component)
		information, componentError := os.Lstat(current)
		if componentError != nil {
			return nil, fmt.Errorf("inspect %s: %w", label, componentError)
		}
		if information.Mode()&os.ModeSymlink != 0 {
			return nil, fmt.Errorf("%s path contains a symlink", label)
		}
		if index < len(components)-1 && !information.IsDir() {
			return nil, fmt.Errorf("%s path ancestor must be a real directory", label)
		}
		path = append(path, information)
	}
	information := path[len(path)-1]
	if !information.Mode().IsRegular() || information.Mode()&os.ModeSymlink != 0 {
		return nil, fmt.Errorf("%s must be a regular non-symlink file", label)
	}
	return path, nil
}

func unchangedRegularBoundedPath(before, after []os.FileInfo) bool {
	if len(before) != len(after) || len(before) < 2 {
		return false
	}
	for index := 0; index < len(before)-1; index++ {
		if !before[index].IsDir() || !after[index].IsDir() || !os.SameFile(before[index], after[index]) ||
			before[index].Mode() != after[index].Mode() {
			return false
		}
	}
	return unchangedRegularBoundedFile(before[len(before)-1], after[len(after)-1])
}

func unchangedRegularBoundedFile(before, after os.FileInfo) bool {
	return before.Mode().IsRegular() && after.Mode().IsRegular() && os.SameFile(before, after) &&
		before.Mode() == after.Mode() && before.Size() == after.Size() && before.ModTime().Equal(after.ModTime())
}

func decimal(value int64) string { return strconv.FormatInt(value, 10) }
