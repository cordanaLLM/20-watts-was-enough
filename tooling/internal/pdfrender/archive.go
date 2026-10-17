package pdfrender

import (
	"archive/zip"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/fileidentity"
)

const (
	maximumArchiveEntries            = 1024
	maximumExtractedFileBytes  int64 = 512 * 1024 * 1024
	maximumExtractedTotalBytes       = 768 * 1024 * 1024
)

type buildContextPreparer interface {
	prepare(context.Context, Configuration, string) error
}

type remoteBuildContextPreparer struct{}

func (remoteBuildContextPreparer) prepare(ctx context.Context, configuration Configuration, destination string) error {
	dockerfile, err := generateDockerfile(configuration.Lock)
	if err != nil {
		return err
	}
	if err := os.WriteFile(filepath.Join(destination, "Dockerfile"), dockerfile, 0o600); err != nil {
		return fmt.Errorf("stage PDF renderer Dockerfile: %w", err)
	}
	archivePath, err := cachedChromeArchive(ctx, configuration)
	if err != nil {
		return err
	}
	stagedArchive := filepath.Join(destination, "chrome-linux64.zip")
	if err := copyVerifiedArchive(archivePath, stagedArchive, configuration.Lock.ChromeForTesting); err != nil {
		return err
	}
	if err := extractChromeArchive(stagedArchive, destination); err != nil {
		return err
	}
	if err := os.Remove(stagedArchive); err != nil {
		return fmt.Errorf("remove staged Chrome for Testing archive: %w", err)
	}
	executable := filepath.Join(destination, "chrome-linux64", "chrome")
	digest, err := digestRegularFile(executable, maximumExtractedFileBytes)
	if err != nil {
		return fmt.Errorf("hash extracted Chrome for Testing executable: %w", err)
	}
	if digest != configuration.Lock.ChromeForTesting.ExecutableSHA256 {
		return errors.New("extracted Chrome for Testing executable SHA-256 does not match its lock")
	}
	return normalizeBuildContext(destination, configuration.Lock.SourceDateEpoch)
}

func copyVerifiedArchive(source, destination string, chrome ChromeForTesting) (returnError error) {
	information, err := fileidentity.Lstat(source)
	if err != nil {
		return fmt.Errorf("inspect cached Chrome for Testing archive: %w", err)
	}
	if !information.Mode().IsRegular() || information.Mode()&os.ModeSymlink != 0 || information.Size() != chrome.ArchiveSizeBytes {
		return errors.New("cached Chrome for Testing archive changed before staging")
	}
	input, err := os.Open(source)
	if err != nil {
		return fmt.Errorf("open cached Chrome for Testing archive: %w", err)
	}
	defer input.Close()
	output, err := os.OpenFile(destination, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o600)
	if err != nil {
		return fmt.Errorf("create staged Chrome for Testing archive: %w", err)
	}
	defer func() {
		if closeError := output.Close(); returnError == nil && closeError != nil {
			returnError = fmt.Errorf("close staged Chrome for Testing archive: %w", closeError)
		}
		if returnError != nil {
			_ = os.Remove(destination)
		}
	}()
	hash := sha256.New()
	written, err := io.Copy(io.MultiWriter(output, hash), io.LimitReader(input, chrome.ArchiveSizeBytes+1))
	if err != nil {
		return fmt.Errorf("stage Chrome for Testing archive: %w", err)
	}
	finalInformation, statError := input.Stat()
	if statError != nil || !os.SameFile(information, finalInformation) || written != chrome.ArchiveSizeBytes ||
		hex.EncodeToString(hash.Sum(nil)) != chrome.ArchiveSHA256 {
		return errors.New("cached Chrome for Testing archive changed or failed verification while staging")
	}
	return nil
}

func cachedChromeArchive(ctx context.Context, configuration Configuration) (string, error) {
	const cacheRelative = "tmp/pdf-renderer-cache"
	if err := requireContainedDirectory(configuration.RepositoryRoot, cacheRelative, true); err != nil {
		return "", err
	}
	chrome := configuration.Lock.ChromeForTesting
	cacheRoot := filepath.Join(configuration.RepositoryRoot, filepath.FromSlash(cacheRelative))
	cacheName := "chrome-linux64-" + chrome.Version + "-generation-" + chrome.ArchiveGeneration + ".zip"
	cachePath := filepath.Join(cacheRoot, cacheName)
	if validArchiveFile(cachePath, chrome) == nil {
		return cachePath, nil
	}
	if err := os.Remove(cachePath); err != nil && !errors.Is(err, os.ErrNotExist) {
		return "", fmt.Errorf("remove invalid Chrome for Testing cache entry: %w", err)
	}
	temporary, err := os.CreateTemp(cacheRoot, ".chrome-linux64-*.tmp")
	if err != nil {
		return "", fmt.Errorf("create Chrome for Testing cache staging file: %w", err)
	}
	temporaryPath := temporary.Name()
	if err := temporary.Close(); err != nil {
		return "", fmt.Errorf("close Chrome for Testing cache staging file: %w", err)
	}
	if err := os.Remove(temporaryPath); err != nil {
		return "", fmt.Errorf("prepare Chrome for Testing cache staging path: %w", err)
	}
	defer os.Remove(temporaryPath)
	if err := downloadChromeArchive(ctx, chrome, temporaryPath); err != nil {
		return "", err
	}
	fixedTime := time.Unix(configuration.Lock.SourceDateEpoch, 0).UTC()
	if err := os.Chtimes(temporaryPath, fixedTime, fixedTime); err != nil {
		return "", fmt.Errorf("normalize Chrome for Testing cache timestamp: %w", err)
	}
	if err := os.Rename(temporaryPath, cachePath); err != nil {
		if validArchiveFile(cachePath, chrome) == nil {
			return cachePath, nil
		}
		return "", fmt.Errorf("publish Chrome for Testing cache entry: %w", err)
	}
	if err := validArchiveFile(cachePath, chrome); err != nil {
		return "", err
	}
	return cachePath, nil
}

func validArchiveFile(file string, chrome ChromeForTesting) error {
	information, err := fileidentity.Lstat(file)
	if err != nil {
		return err
	}
	if !information.Mode().IsRegular() || information.Mode()&os.ModeSymlink != 0 || information.Size() != chrome.ArchiveSizeBytes {
		return errors.New("cached Chrome for Testing archive is not the locked regular file")
	}
	digest, err := digestRegularFile(file, chrome.ArchiveSizeBytes)
	if err != nil {
		return fmt.Errorf("hash cached Chrome for Testing archive: %w", err)
	}
	if digest != chrome.ArchiveSHA256 {
		return errors.New("cached Chrome for Testing archive SHA-256 does not match its lock")
	}
	return nil
}

func downloadChromeArchive(ctx context.Context, chrome ChromeForTesting, destination string) (returnError error) {
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, chrome.ArchiveURL, nil)
	if err != nil {
		return fmt.Errorf("create Chrome for Testing request: %w", err)
	}
	request.Header.Set("Accept-Encoding", "identity")
	request.Header.Set("User-Agent", "20w-pdf-renderer/1")
	client := &http.Client{
		Timeout: 10 * time.Minute,
		CheckRedirect: func(_ *http.Request, _ []*http.Request) error {
			return errors.New("Chrome for Testing download redirect refused")
		},
	}
	response, err := client.Do(request)
	if err != nil {
		return fmt.Errorf("download Chrome for Testing archive: %w", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return fmt.Errorf("download Chrome for Testing archive: unexpected HTTP status %d", response.StatusCode)
	}
	if response.ContentLength != chrome.ArchiveSizeBytes || response.Header.Get("X-Goog-Generation") != chrome.ArchiveGeneration {
		return errors.New("Chrome for Testing response size or generation does not match its lock")
	}
	file, err := os.OpenFile(destination, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o600)
	if err != nil {
		return fmt.Errorf("create staged Chrome for Testing archive: %w", err)
	}
	defer func() {
		if closeError := file.Close(); returnError == nil && closeError != nil {
			returnError = fmt.Errorf("close staged Chrome for Testing archive: %w", closeError)
		}
		if returnError != nil {
			_ = os.Remove(destination)
		}
	}()
	hash := sha256.New()
	written, err := io.Copy(io.MultiWriter(file, hash), io.LimitReader(response.Body, chrome.ArchiveSizeBytes+1))
	if err != nil {
		return fmt.Errorf("write Chrome for Testing archive: %w", err)
	}
	if written != chrome.ArchiveSizeBytes || hex.EncodeToString(hash.Sum(nil)) != chrome.ArchiveSHA256 {
		return errors.New("Chrome for Testing archive size or SHA-256 does not match its lock")
	}
	return nil
}

func extractChromeArchive(archivePath, destination string) error {
	archive, err := zip.OpenReader(archivePath)
	if err != nil {
		return fmt.Errorf("open Chrome for Testing archive: %w", err)
	}
	defer archive.Close()
	if len(archive.File) == 0 || len(archive.File) > maximumArchiveEntries {
		return fmt.Errorf("Chrome for Testing archive entry count must be between 1 and %d", maximumArchiveEntries)
	}
	seen := make(map[string]struct{}, len(archive.File))
	var total uint64
	for _, entry := range archive.File {
		clean, err := cleanArchiveEntry(entry.Name)
		if err != nil {
			return err
		}
		if _, duplicate := seen[clean]; duplicate {
			return fmt.Errorf("Chrome for Testing archive repeats %q", clean)
		}
		seen[clean] = struct{}{}
		if entry.Mode()&os.ModeSymlink != 0 || (!entry.FileInfo().IsDir() && !entry.Mode().IsRegular()) {
			return fmt.Errorf("Chrome for Testing archive entry %q has an unsupported type", clean)
		}
		if entry.UncompressedSize64 > uint64(maximumExtractedFileBytes) || total > uint64(maximumExtractedTotalBytes)-entry.UncompressedSize64 {
			return errors.New("Chrome for Testing archive exceeds its extracted-size boundary")
		}
		total += entry.UncompressedSize64
		if err := extractArchiveEntry(entry, destination, clean); err != nil {
			return err
		}
	}
	return nil
}

func cleanArchiveEntry(name string) (string, error) {
	if name == "" || strings.Contains(name, "..") || strings.ContainsAny(name, "\\\x00") || strings.HasPrefix(name, "/") {
		return "", errors.New("Chrome for Testing archive contains an invalid path")
	}
	clean := path.Clean(name)
	if clean != strings.TrimSuffix(name, "/") {
		return "", fmt.Errorf("Chrome for Testing archive entry %q is not canonical", name)
	}
	if clean != "chrome-linux64" && !strings.HasPrefix(clean, "chrome-linux64/") {
		return "", fmt.Errorf("Chrome for Testing archive entry %q escapes its expected root", name)
	}
	return clean, nil
}

func extractArchiveEntry(entry *zip.File, destination, clean string) (returnError error) {
	cleanDestination := filepath.Clean(destination)
	target := filepath.Join(cleanDestination, filepath.FromSlash(clean))
	rel, err := filepath.Rel(cleanDestination, target)
	if err != nil || rel == ".." || strings.HasPrefix(rel, ".."+string(os.PathSeparator)) {
		return fmt.Errorf("Chrome for Testing archive entry %q escapes destination", clean)
	}
	if entry.FileInfo().IsDir() {
		if err := os.MkdirAll(target, 0o755); err != nil {
			return fmt.Errorf("create Chrome for Testing directory %q: %w", clean, err)
		}
		return nil
	}
	if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
		return fmt.Errorf("create Chrome for Testing parent for %q: %w", clean, err)
	}
	reader, err := entry.Open()
	if err != nil {
		return fmt.Errorf("open Chrome for Testing archive entry %q: %w", clean, err)
	}
	defer reader.Close()
	mode := entry.Mode().Perm()
	if mode == 0 {
		mode = 0o644
	}
	file, err := os.OpenFile(target, os.O_WRONLY|os.O_CREATE|os.O_EXCL, mode)
	if err != nil {
		return fmt.Errorf("create Chrome for Testing file %q: %w", clean, err)
	}
	defer func() {
		if closeError := file.Close(); returnError == nil && closeError != nil {
			returnError = fmt.Errorf("close Chrome for Testing file %q: %w", clean, closeError)
		}
	}()
	written, err := io.Copy(file, io.LimitReader(reader, int64(entry.UncompressedSize64)+1))
	if err != nil {
		return fmt.Errorf("extract Chrome for Testing file %q: %w", clean, err)
	}
	if written != int64(entry.UncompressedSize64) {
		return fmt.Errorf("Chrome for Testing file %q size changed during extraction", clean)
	}
	return nil
}

func digestRegularFile(file string, maximumBytes int64) (string, error) {
	information, err := fileidentity.Lstat(file)
	if err != nil {
		return "", err
	}
	if !information.Mode().IsRegular() || information.Mode()&os.ModeSymlink != 0 || information.Size() <= 0 || information.Size() > maximumBytes {
		return "", errors.New("file is not a bounded regular file")
	}
	opened, err := os.Open(file)
	if err != nil {
		return "", err
	}
	defer opened.Close()
	hash := sha256.New()
	written, err := io.Copy(hash, io.LimitReader(opened, maximumBytes+1))
	if err != nil {
		return "", fmt.Errorf("hash regular file of %s bytes: %w", strconv.FormatInt(information.Size(), 10), err)
	}
	if written != information.Size() {
		return "", fmt.Errorf("hash regular file: size changed from %s bytes", strconv.FormatInt(information.Size(), 10))
	}
	return hex.EncodeToString(hash.Sum(nil)), nil
}

func normalizeBuildContext(root string, sourceDateEpoch int64) error {
	fixedTime := time.Unix(sourceDateEpoch, 0).UTC()
	directories := make([]string, 0, 32)
	err := filepath.WalkDir(root, func(file string, entry os.DirEntry, walkError error) error {
		if walkError != nil {
			return walkError
		}
		information, err := fileidentity.Info(entry)
		if err != nil {
			return err
		}
		if information.Mode()&os.ModeSymlink != 0 {
			return fmt.Errorf("PDF renderer build context contains symlink %s", file)
		}
		if entry.IsDir() {
			directories = append(directories, file)
			return os.Chmod(file, 0o755)
		}
		if !information.Mode().IsRegular() {
			return fmt.Errorf("PDF renderer build context contains unsupported file %s", file)
		}
		mode := os.FileMode(0o644)
		if information.Mode().Perm()&0o111 != 0 {
			mode = 0o755
		}
		if err := os.Chmod(file, mode); err != nil {
			return err
		}
		return os.Chtimes(file, fixedTime, fixedTime)
	})
	if err != nil {
		return fmt.Errorf("normalize PDF renderer build context: %w", err)
	}
	for index := len(directories) - 1; index >= 0; index-- {
		if err := os.Chtimes(directories[index], fixedTime, fixedTime); err != nil {
			return fmt.Errorf("normalize PDF renderer directory timestamp: %w", err)
		}
	}
	return nil
}
