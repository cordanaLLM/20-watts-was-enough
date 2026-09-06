package pdfrender

import (
	"bytes"
	"crypto/rand"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
)

const (
	bookPDFName             = "20-watts-was-enough-full-concept-book.pdf"
	bookManifestName        = "book-manifest.json"
	maximumRenderedPDFBytes = 64 * 1024 * 1024
	maximumManifestBytes    = 2 * 1024 * 1024
)

type renderedArtifact struct {
	name string
	body []byte
}

type publicationLock struct {
	file     *os.File
	identity os.FileInfo
	path     string
}

func acquirePublicationLock(repositoryRoot string) (_ *publicationLock, returnError error) {
	lockPath := filepath.Join(repositoryRoot, "tmp", "pdf-renderer-book.lock")
	file, err := os.OpenFile(lockPath, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o600)
	if errors.Is(err, os.ErrExist) {
		return nil, errors.New("full-book PDF generation is already locked")
	}
	if err != nil {
		return nil, fmt.Errorf("acquire full-book PDF generation lock: %w", err)
	}
	identity, err := file.Stat()
	if err != nil {
		_ = file.Close()
		return nil, fmt.Errorf("inspect full-book PDF generation lock: %w", err)
	}
	defer func() {
		if returnError != nil {
			_ = file.Close()
			current, currentError := os.Lstat(lockPath)
			if currentError == nil && os.SameFile(identity, current) {
				_ = os.Remove(lockPath)
			}
		}
	}()
	token, err := randomIdentity(16)
	if err != nil {
		return nil, err
	}
	if _, err := file.WriteString(token + "\n"); err != nil {
		return nil, fmt.Errorf("write full-book PDF generation lock: %w", err)
	}
	if err := file.Sync(); err != nil {
		return nil, fmt.Errorf("sync full-book PDF generation lock: %w", err)
	}
	return &publicationLock{file: file, identity: identity, path: lockPath}, nil
}

func (lock *publicationLock) release() error {
	current, err := os.Lstat(lock.path)
	if err != nil || !current.Mode().IsRegular() || current.Mode()&os.ModeSymlink != 0 ||
		!os.SameFile(lock.identity, current) {
		return errors.New("full-book PDF generation lock changed while held")
	}
	if err := lock.file.Close(); err != nil {
		return fmt.Errorf("close full-book PDF generation lock: %w", err)
	}
	if err := os.Remove(lock.path); err != nil {
		return fmt.Errorf("release full-book PDF generation lock: %w", err)
	}
	return nil
}

func compareRenderPairs(repositoryRoot, firstDirectory, secondDirectory string) ([]renderedArtifact, error) {
	first, err := readRenderPair(firstDirectory)
	if err != nil {
		return nil, fmt.Errorf("read first PDF render: %w", err)
	}
	second, err := readRenderPair(secondDirectory)
	if err != nil {
		return nil, fmt.Errorf("read second PDF render: %w", err)
	}
	for index := range first {
		if first[index].name != second[index].name || !bytes.Equal(first[index].body, second[index].body) {
			mismatch := fmt.Errorf("fresh PDF renders differ for %s", first[index].name)
			location, err := retainGenerationMismatch(repositoryRoot, [2][]renderedArtifact{first, second})
			if err != nil {
				return nil, errors.Join(mismatch, err)
			}
			return nil, fmt.Errorf("%w; exact compared renders retained at %s", mismatch, location)
		}
	}
	return second, nil
}

func readRenderPair(directory string) ([]renderedArtifact, error) {
	entries, err := os.ReadDir(directory)
	if err != nil {
		return nil, fmt.Errorf("list render directory: %w", err)
	}
	if len(entries) != 2 {
		return nil, fmt.Errorf("render directory contains %d entries, want exactly two", len(entries))
	}
	artifacts := make([]renderedArtifact, 0, 2)
	for _, specification := range []struct {
		name    string
		maximum int64
	}{
		{name: bookPDFName, maximum: maximumRenderedPDFBytes},
		{name: bookManifestName, maximum: maximumManifestBytes},
	} {
		file := filepath.Join(directory, specification.name)
		body, err := readRegularBounded(directory, file, specification.maximum, specification.name)
		if err != nil {
			return nil, err
		}
		artifacts = append(artifacts, renderedArtifact{name: specification.name, body: body})
	}
	return artifacts, nil
}

func publishRenderPair(repositoryRoot string, artifacts []renderedArtifact) (returnError error) {
	if len(artifacts) != 2 || artifacts[0].name != bookPDFName || artifacts[1].name != bookManifestName {
		return errors.New("PDF publication requires the exact PDF and manifest pair")
	}
	directory := filepath.Join(repositoryRoot, "public", "downloads")
	staged := make([]string, len(artifacts))
	defer func() {
		for _, file := range staged {
			if file != "" {
				_ = os.Remove(file)
			}
		}
	}()
	for index, artifact := range artifacts {
		file, err := os.CreateTemp(directory, ".20w-publication-*.tmp")
		if err != nil {
			return fmt.Errorf("create staged %s: %w", artifact.name, err)
		}
		staged[index] = file.Name()
		if err := writePublicationStage(file, artifact.body); err != nil {
			_ = file.Close()
			returnError = fmt.Errorf("stage %s: %w", artifact.name, err)
			break
		}
	}
	if returnError != nil {
		return returnError
	}
	destinations := []string{
		filepath.Join(directory, bookPDFName),
		filepath.Join(directory, bookManifestName),
	}
	return replacePublishedPair(staged, destinations)
}

func writePublicationStage(file *os.File, body []byte) error {
	if err := file.Chmod(0o644); err != nil {
		return err
	}
	if _, err := file.Write(body); err != nil {
		return err
	}
	if err := file.Sync(); err != nil {
		return err
	}
	return file.Close()
}

func replacePublishedPair(staged, destinations []string) (returnError error) {
	if len(staged) != 2 || len(destinations) != 2 {
		return errors.New("publication replacement requires exactly two files")
	}
	suffix, err := randomIdentity(12)
	if err != nil {
		return err
	}
	backups := []string{destinations[0] + ".backup-" + suffix, destinations[1] + ".backup-" + suffix}
	hadPrevious := make([]bool, 2)
	preserveBackups := false
	defer func() {
		if !preserveBackups {
			for _, backup := range backups {
				_ = os.Remove(backup)
			}
		}
	}()
	for index, destination := range destinations {
		exists, err := regularFileExists(destination)
		if err != nil {
			return err
		}
		hadPrevious[index] = exists
		if exists {
			if err := copyRegularFileExclusive(destination, backups[index]); err != nil {
				return fmt.Errorf("back up %s: %w", filepath.Base(destination), err)
			}
		}
	}
	publicationStarted := false
	for index := range staged {
		if err := os.Rename(staged[index], destinations[index]); err != nil {
			if !publicationStarted {
				return fmt.Errorf("publish %s: %w", filepath.Base(destinations[index]), err)
			}
			rollbackErrors := rollbackPublishedPair(destinations, backups, hadPrevious)
			if len(rollbackErrors) > 0 {
				preserveBackups = true
				return errors.Join(append([]error{fmt.Errorf("publish %s: %w", filepath.Base(destinations[index]), err)}, rollbackErrors...)...)
			}
			return fmt.Errorf("publish %s: %w", filepath.Base(destinations[index]), err)
		}
		publicationStarted = true
	}
	return nil
}

func rollbackPublishedPair(destinations, backups []string, hadPrevious []bool) []error {
	var failures []error
	for index, destination := range destinations {
		if err := os.Remove(destination); err != nil && !errors.Is(err, os.ErrNotExist) {
			failures = append(failures, fmt.Errorf("remove partial %s: %w", filepath.Base(destination), err))
			continue
		}
		if hadPrevious[index] {
			if err := os.Rename(backups[index], destination); err != nil {
				failures = append(failures, fmt.Errorf("restore %s: %w", filepath.Base(destination), err))
			}
		}
	}
	return failures
}

func regularFileExists(file string) (bool, error) {
	information, err := os.Lstat(file)
	if errors.Is(err, os.ErrNotExist) {
		return false, nil
	}
	if err != nil {
		return false, fmt.Errorf("inspect publication file: %w", err)
	}
	if !information.Mode().IsRegular() || information.Mode()&os.ModeSymlink != 0 {
		return false, fmt.Errorf("publication path must be a regular non-symlink file: %s", file)
	}
	return true, nil
}

func copyRegularFileExclusive(source, destination string) (returnError error) {
	information, err := os.Lstat(source)
	if err != nil || !information.Mode().IsRegular() || information.Mode()&os.ModeSymlink != 0 {
		return errors.New("publication backup source must be a regular non-symlink file")
	}
	input, err := os.Open(source)
	if err != nil {
		return err
	}
	defer input.Close()
	output, err := os.OpenFile(destination, os.O_WRONLY|os.O_CREATE|os.O_EXCL, information.Mode().Perm())
	if err != nil {
		return err
	}
	defer func() {
		if closeError := output.Close(); returnError == nil && closeError != nil {
			returnError = closeError
		}
		if returnError != nil {
			_ = os.Remove(destination)
		}
	}()
	if _, err := io.Copy(output, input); err != nil {
		return err
	}
	if err := output.Sync(); err != nil {
		return err
	}
	opened, err := input.Stat()
	current, currentError := os.Lstat(source)
	if err != nil || currentError != nil || !os.SameFile(information, opened) || !os.SameFile(information, current) {
		return errors.New("publication backup source changed while copied")
	}
	return nil
}

func randomIdentity(bytesCount int) (string, error) {
	body := make([]byte, bytesCount)
	if _, err := rand.Read(body); err != nil {
		return "", fmt.Errorf("create publication identity: %w", err)
	}
	return fmt.Sprintf("%x", body), nil
}
