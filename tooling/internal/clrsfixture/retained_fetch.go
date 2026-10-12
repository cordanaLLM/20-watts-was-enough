package clrsfixture

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"time"
)

// RetainedSourceArchiveName is the CLRS source archive's file name inside a
// fetched retained-input directory.
const RetainedSourceArchiveName = "clrs-source.tar.gz"

// RetainedInputsRequiredVariable names the switch that turns a missing
// downloadable retained input into a test failure instead of a skip.
const RetainedInputsRequiredVariable = "CLRS_RETAINED_INPUTS_REQUIRED"

const (
	retainedFetchTimeout = 5 * time.Minute
	// RetainedFetchDeadline bounds one complete fetch of every locked input.
	RetainedFetchDeadline = 15 * time.Minute
)

type retainedInputFile struct {
	relative  string
	url       string
	sha256    string
	sizeBytes int64
}

// RetainedInputsRequired reports whether the caller promised that every
// downloadable retained input is present.
func RetainedInputsRequired() bool {
	return os.Getenv(RetainedInputsRequiredVariable) == "1"
}

// FetchRetainedInputs downloads the public, hash-locked CLRS source archive,
// Promise sdist and Promise build wheels into a new directory. The layout is
// the one reproduce-clrs-promise-wheel and the retained-input tests read.
func FetchRetainedInputs(ctx context.Context, root, output string) error {
	files, err := retainedInputFiles(root)
	if err != nil {
		return err
	}
	client := &http.Client{
		Timeout: retainedFetchTimeout,
		CheckRedirect: func(_ *http.Request, _ []*http.Request) error {
			return errors.New("retained input download redirect refused")
		},
	}
	return fetchRetainedFiles(ctx, client, files, output)
}

func retainedInputFiles(root string) ([]retainedInputFile, error) {
	inputs, err := loadPromiseAuthority(root)
	if err != nil {
		return nil, err
	}
	lock, _, _, err := loadGeneratorWheelhouseInputs(root)
	if err != nil {
		return nil, err
	}
	archive := lock.SourceContext
	source := inputs.manifest.SourceBuild
	files := []retainedInputFile{
		{RetainedSourceArchiveName, archive.ArchiveURL, archive.ArchiveSHA256, archive.ArchiveSizeBytes},
		{"source-build-inputs/promise-2.3.tar.gz", source.SourceURL, source.SourceSHA256, source.SourceSizeBytes},
	}
	for _, wheel := range source.BuildRequirements {
		files = append(files, retainedInputFile{"build-tools/" + wheel.Filename, wheel.URL, wheel.SHA256, wheel.SizeBytes})
	}
	return files, nil
}

func fetchRetainedFiles(ctx context.Context, client *http.Client, files []retainedInputFile, output string) error {
	if output == "" {
		return errors.New("retained input output directory is required")
	}
	if err := os.Mkdir(output, 0o700); err != nil {
		return fmt.Errorf("create retained input directory: %w", err)
	}
	for _, file := range files {
		target := filepath.Join(output, filepath.FromSlash(file.relative))
		if err := os.MkdirAll(filepath.Dir(target), 0o700); err != nil {
			return fmt.Errorf("create retained input parent: %w", err)
		}
		if err := fetchRetainedFile(ctx, client, file, target); err != nil {
			return fmt.Errorf("retained input %s: %w", file.relative, err)
		}
	}
	return nil
}

func fetchRetainedFile(ctx context.Context, client *http.Client, file retainedInputFile, target string) (returnError error) {
	parsed, err := url.Parse(file.url)
	if err != nil || parsed.Scheme != "https" || parsed.Host == "" || file.sizeBytes <= 0 {
		return errors.New("locked URL must be absolute HTTPS with a positive locked size")
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, file.url, nil)
	if err != nil {
		return err
	}
	request.Header.Set("Accept-Encoding", "identity")
	request.Header.Set("User-Agent", "20w-clrs-retained-inputs/1")
	response, err := client.Do(request)
	if err != nil {
		return err
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return fmt.Errorf("unexpected HTTP status %d", response.StatusCode)
	}
	handle, err := os.OpenFile(target, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o600)
	if err != nil {
		return err
	}
	defer func() {
		if closeError := handle.Close(); returnError == nil && closeError != nil {
			returnError = closeError
		}
		if returnError != nil {
			if removeError := os.Remove(target); removeError != nil && !errors.Is(removeError, os.ErrNotExist) {
				returnError = errors.Join(returnError, fmt.Errorf("remove refused input: %w", removeError))
			}
		}
	}()
	hash := sha256.New()
	written, err := io.Copy(io.MultiWriter(handle, hash), io.LimitReader(response.Body, file.sizeBytes+1))
	if err != nil {
		return err
	}
	if written != file.sizeBytes || hex.EncodeToString(hash.Sum(nil)) != file.sha256 {
		return errors.New("downloaded bytes differ from the locked size or SHA-256")
	}
	return nil
}
