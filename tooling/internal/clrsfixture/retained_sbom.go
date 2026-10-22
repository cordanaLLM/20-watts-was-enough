package clrsfixture

import (
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
)

// RetainedSBOMBundleDirectory is the scanner bundle's directory inside a
// fetched retained-input directory.
const RetainedSBOMBundleDirectory = "sbom-bundle"

const (
	sbomBundleLockPath     = "tooling/clrs-generator/sbom-bundle.json"
	sbomBundleLockMaxBytes = 64 << 10
	// releaseDownloadHost serves locked release downloads and redirects each
	// one to releaseAssetHost; no other redirect is followed.
	releaseDownloadHost = "github.com"
	releaseAssetHost    = "release-assets.githubusercontent.com"
)

// SBOMBundleLock records the published scanner bundle and the image digests
// it must match. The digests come from the separate image inspection, not
// from the bundle.
type SBOMBundleLock struct {
	Schema              int                  `json:"schema"`
	Description         string               `json:"description"`
	ImageManifestDigest string               `json:"image_manifest_digest"`
	ImageConfigDigest   string               `json:"image_config_digest"`
	Files               []sbomBundleLockFile `json:"files"`
}

type sbomBundleLockFile struct {
	Name      string `json:"name"`
	URL       string `json:"url"`
	SHA256    string `json:"sha256"`
	SizeBytes int64  `json:"size_bytes"`
}

// LoadSBOMBundleLock reads and checks the tracked scanner-bundle lock.
func LoadSBOMBundleLock(root string) (SBOMBundleLock, error) {
	var lock SBOMBundleLock
	path := filepath.Join(root, filepath.FromSlash(sbomBundleLockPath))
	info, err := os.Lstat(path)
	if err != nil {
		return lock, fmt.Errorf("read SBOM bundle lock: %w", err)
	}
	if !info.Mode().IsRegular() || info.Size() > sbomBundleLockMaxBytes {
		return lock, errors.New("SBOM bundle lock must be a regular file of at most 64 KiB")
	}
	body, err := os.ReadFile(path) //#nosec G304 -- path built from repository root + fixed relative lock path
	if err != nil {
		return lock, fmt.Errorf("read SBOM bundle lock: %w", err)
	}
	if err := decodeStrict(body, 4, &lock); err != nil {
		return SBOMBundleLock{}, err
	}
	if err := lock.validate(); err != nil {
		return SBOMBundleLock{}, fmt.Errorf("SBOM bundle lock: %w", err)
	}
	return lock, nil
}

func (lock SBOMBundleLock) validate() error {
	if lock.Schema != 1 || !sbomDigest(lock.ImageManifestDigest) || !sbomDigest(lock.ImageConfigDigest) {
		return errors.New("schema must be 1 with sha256 image manifest and config digests")
	}
	if len(lock.Files) != len(sbomBundleFiles) {
		return fmt.Errorf("lists %d files, want %d", len(lock.Files), len(sbomBundleFiles))
	}
	for index, file := range lock.Files {
		want := sbomBundleFiles[index]
		if file.Name != want.name || file.SizeBytes <= 0 || file.SizeBytes > want.limit || !lowerHex(file.SHA256, 64) {
			return fmt.Errorf("file %d must be %s with a SHA-256 and a size within %d bytes", index, want.name, want.limit)
		}
		parsed, err := url.Parse(file.URL)
		if err != nil || parsed.Scheme != "https" || parsed.Host != releaseDownloadHost || parsed.RawQuery != "" ||
			!strings.HasSuffix(releaseDownloadTail(parsed.Path), "/"+file.Name) {
			return fmt.Errorf("%s URL must be an HTTPS release download named after the file", file.Name)
		}
	}
	return nil
}

// releaseDownloadTail returns "<tag>/<file>" of a release download path, or
// "" for any other path.
func releaseDownloadTail(path string) string {
	_, tail, found := strings.Cut(path, "/releases/download/")
	if !found || strings.Count(tail, "/") != 1 {
		return ""
	}
	return tail
}

func (lock SBOMBundleLock) retainedFiles() []retainedInputFile {
	files := make([]retainedInputFile, 0, len(lock.Files))
	for _, file := range lock.Files {
		files = append(files, retainedInputFile{RetainedSBOMBundleDirectory + "/" + file.Name, file.URL, file.SHA256, file.SizeBytes})
	}
	return files
}

// retainedRedirect follows only the single hop from a release download to
// the release asset host; the locked hash checks the bytes either way.
func retainedRedirect(request *http.Request, via []*http.Request) error {
	if len(via) == 1 && via[0].URL.Scheme == "https" && via[0].URL.Host == releaseDownloadHost &&
		strings.Contains(via[0].URL.Path, "/releases/download/") &&
		request.URL.Scheme == "https" && request.URL.Host == releaseAssetHost {
		return nil
	}
	return errors.New("retained input download redirect refused")
}
