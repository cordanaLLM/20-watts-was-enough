package pdfrender

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
)

const maximumRendererCacheLayers = 128
const maximumRendererCacheBytes int64 = 4 * 1024 * 1024 * 1024

// inspectRendererCache hashes compressed blobs without unpacking layers. The
// pinned BuildKit parser owns cacheconfig semantics; this boundary validates
// the exact descriptor closure, sizes, strict JSON and safe filesystem shape.
func inspectRendererCache(ctx context.Context, root string) (ReproducibilityCache, error) {
	allowed, err := rendererCacheRootEntries(root)
	if err != nil {
		return ReproducibilityCache{}, err
	}
	if err := exactCacheDirectory(root, allowed); err != nil {
		return ReproducibilityCache{}, err
	}
	if err := exactCacheDirectory(filepath.Join(root, "blobs"), map[string]bool{"sha256": true}); err != nil {
		return ReproducibilityCache{}, err
	}
	manifestDescriptor, err := rendererCacheManifest(root)
	if err != nil {
		return ReproducibilityCache{}, err
	}
	manifestBytes, err := readCacheJSONBlob(root, manifestDescriptor)
	if err != nil {
		return ReproducibilityCache{}, err
	}
	var manifest imageProofManifest
	if err := decodeImageProofJSON(manifestBytes, &manifest, "cache manifest"); err != nil {
		return ReproducibilityCache{}, err
	}
	if manifest.SchemaVersion != 2 || manifest.MediaType != imageManifestMediaType ||
		manifest.Config.MediaType != "application/vnd.buildkit.cacheconfig.v0" || len(manifest.Layers) == 0 || len(manifest.Layers) > maximumRendererCacheLayers {
		return ReproducibilityCache{}, errors.New("unsupported PDF renderer cache manifest or layer count")
	}
	configBytes, err := readCacheJSONBlob(root, manifest.Config)
	if err != nil {
		return ReproducibilityCache{}, err
	}
	var config map[string]json.RawMessage
	if err := decodeImageProofJSON(configBytes, &config, "BuildKit cache config"); err != nil || config == nil {
		return ReproducibilityCache{}, errors.New("invalid PDF renderer BuildKit cache config")
	}
	descriptors := append([]imageProofDescriptor{manifestDescriptor, manifest.Config}, manifest.Layers...)
	return inspectCacheBlobs(ctx, root, manifestDescriptor.Digest, descriptors)
}

func rendererCacheManifest(root string) (imageProofDescriptor, error) {
	var layout struct {
		Version string `json:"imageLayoutVersion"`
	}
	if err := readCacheJSON(root, "oci-layout", &layout); err != nil {
		return imageProofDescriptor{}, err
	}
	if layout.Version != "1.0.0" {
		return imageProofDescriptor{}, errors.New("PDF renderer cache requires OCI layout 1.0.0")
	}
	var index struct {
		SchemaVersion int                    `json:"schemaVersion"`
		MediaType     string                 `json:"mediaType"`
		Manifests     []imageProofDescriptor `json:"manifests"`
		Annotations   map[string]string      `json:"annotations,omitempty"`
	}
	if err := readCacheJSON(root, "index.json", &index); err != nil {
		return imageProofDescriptor{}, err
	}
	if index.SchemaVersion != 2 || index.MediaType != "application/vnd.oci.image.index.v1+json" || len(index.Manifests) != 1 ||
		index.Manifests[0].MediaType != imageManifestMediaType || !validImageProofDescriptor(index.Manifests[0]) {
		return imageProofDescriptor{}, errors.New("PDF renderer cache must select one exact OCI cache manifest")
	}
	return index.Manifests[0], nil
}

func readCacheJSON(root, relative string, target any) error {
	body, err := readRegularBounded(root, filepath.Join(root, relative), maximumImageProofBlobBytes, "PDF renderer cache JSON")
	if err != nil {
		return err
	}
	return decodeImageProofJSON(body, target, "cache "+relative)
}

func readCacheJSONBlob(root string, descriptor imageProofDescriptor) ([]byte, error) {
	if !validImageProofDescriptor(descriptor) || descriptor.Size > maximumImageProofBlobBytes {
		return nil, errors.New("invalid PDF renderer cache JSON descriptor")
	}
	body, err := readRegularBounded(root, filepath.Join(root, imageProofBlobPath(descriptor.Digest)), maximumImageProofBlobBytes, "PDF renderer cache JSON blob")
	if err != nil {
		return nil, err
	}
	if int64(len(body)) != descriptor.Size || digestBytes(body) != descriptor.Digest {
		return nil, errors.New("PDF renderer cache JSON blob does not match its descriptor")
	}
	return body, nil
}

func inspectCacheBlobs(ctx context.Context, root, manifestDigest string, descriptors []imageProofDescriptor) (ReproducibilityCache, error) {
	observation := ReproducibilityCache{ManifestDigest: manifestDigest}
	allowed := make(map[string]bool, len(descriptors))
	unique := make([]imageProofDescriptor, 0, len(descriptors))
	seen := make(map[string]imageProofDescriptor, len(descriptors))
	for index, descriptor := range descriptors {
		if !validImageProofDescriptor(descriptor) {
			return ReproducibilityCache{}, errors.New("PDF renderer cache exceeds its 4 GiB blob boundary or has an invalid descriptor")
		}
		if index >= 2 && descriptor.MediaType != "application/vnd.oci.image.layer.v1.tar+gzip" {
			return ReproducibilityCache{}, errors.New("PDF renderer cache requires gzip layer blobs")
		}
		name := strings.TrimPrefix(descriptor.Digest, "sha256:")
		if previous, duplicate := seen[name]; duplicate {
			if previous.Size != descriptor.Size || previous.MediaType != descriptor.MediaType {
				return ReproducibilityCache{}, errors.New("PDF renderer cache reuses a blob with conflicting size or media type")
			}
			continue
		}
		if descriptor.Size > maximumRendererCacheBytes-observation.BlobBytes {
			return ReproducibilityCache{}, errors.New("PDF renderer cache exceeds its 4 GiB blob boundary")
		}
		allowed[name] = false
		seen[name] = descriptor
		unique = append(unique, descriptor)
		observation.BlobBytes += descriptor.Size
	}
	if err := exactCacheDirectory(filepath.Join(root, "blobs", "sha256"), allowed); err != nil {
		return ReproducibilityCache{}, err
	}
	for _, descriptor := range unique {
		if err := hashCacheBlob(ctx, root, descriptor); err != nil {
			return ReproducibilityCache{}, err
		}
	}
	observation.BlobCount = len(unique)
	return observation, nil
}

// rendererCacheRootEntries admits two optional root entries next to the OCI
// layout: an empty ingest directory, and the empty cache.lock file that the
// BuildKit client creates from v0.34.0 (Buildx 0.38.0) to serialise exports
// and deliberately keeps (client/solve.go, resetCacheStore).
func rendererCacheRootEntries(root string) (map[string]bool, error) {
	allowed := map[string]bool{"index.json": false, "oci-layout": false, "blobs": true}
	if _, err := os.Lstat(filepath.Join(root, "ingest")); err == nil {
		allowed["ingest"] = true
		if err := exactCacheDirectory(filepath.Join(root, "ingest"), nil); err != nil {
			return nil, err
		}
	} else if !errors.Is(err, os.ErrNotExist) {
		return nil, err
	}
	if lock, err := os.Lstat(filepath.Join(root, "cache.lock")); err == nil {
		if !lock.Mode().IsRegular() || lock.Size() != 0 {
			return nil, errors.New("PDF renderer cache lock must be one empty regular file")
		}
		allowed["cache.lock"] = false
	} else if !errors.Is(err, os.ErrNotExist) {
		return nil, err
	}
	return allowed, nil
}

func hashCacheBlob(ctx context.Context, root string, descriptor imageProofDescriptor) (returnError error) {
	file := filepath.Join(root, imageProofBlobPath(descriptor.Digest))
	before, err := inspectRegularBoundedPath(root, file, "PDF renderer cache blob")
	if err != nil {
		return err
	}
	initial := before[len(before)-1]
	if initial.Size() != descriptor.Size {
		return errors.New("PDF renderer cache blob size does not match its descriptor")
	}
	opened, err := os.Open(file)
	if err != nil {
		return err
	}
	defer func() { returnError = errors.Join(returnError, opened.Close()) }()
	digest := sha256.New()
	stream := &imageProofStream{ctx: ctx, source: opened, remaining: descriptor.Size}
	count, err := io.CopyBuffer(digest, stream, make([]byte, 128*1024))
	if err != nil {
		return fmt.Errorf("hash PDF renderer cache blob: %w", err)
	}
	final, err := opened.Stat()
	if err != nil || !os.SameFile(initial, final) || count != descriptor.Size || final.Size() != initial.Size() || !final.ModTime().Equal(initial.ModTime()) {
		return errors.New("PDF renderer cache blob changed during inspection")
	}
	if "sha256:"+hex.EncodeToString(digest.Sum(nil)) != descriptor.Digest {
		return errors.New("PDF renderer cache blob digest does not match its descriptor")
	}
	return nil
}

func exactCacheDirectory(directory string, expected map[string]bool) (returnError error) {
	initial, err := os.Lstat(directory)
	if err != nil || !initial.IsDir() || initial.Mode()&os.ModeSymlink != 0 {
		return fmt.Errorf("PDF renderer cache requires a non-symlink directory: %s", directory)
	}
	opened, err := os.Open(directory)
	if err != nil {
		return err
	}
	defer func() { returnError = errors.Join(returnError, opened.Close()) }()
	entries, err := opened.ReadDir(maximumRendererCacheLayers + 4)
	if err != nil && !errors.Is(err, io.EOF) {
		return err
	}
	if len(entries) != len(expected) {
		return fmt.Errorf("PDF renderer cache has missing, extra or excessive entries: %s", directory)
	}
	for _, entry := range entries {
		directoryExpected, exists := expected[entry.Name()]
		info, err := entry.Info()
		if err != nil || !exists || info.Mode()&os.ModeSymlink != 0 || info.IsDir() != directoryExpected || (!directoryExpected && !info.Mode().IsRegular()) {
			return fmt.Errorf("PDF renderer cache has an unsupported entry: %s", entry.Name())
		}
	}
	final, err := opened.Stat()
	if err != nil || !os.SameFile(initial, final) {
		return errors.New("PDF renderer cache directory changed during inspection")
	}
	return nil
}

func writeRendererCacheIdentity(file string, identity rendererCacheIdentity) error {
	body, err := json.MarshalIndent(identity, "", "  ")
	if err != nil {
		return err
	}
	return writeReproducibilityMismatchArtifact(file, append(body, '\n'))
}
