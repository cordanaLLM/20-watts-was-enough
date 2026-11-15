package pdfrender

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
)

type cacheInventoryTestIndex struct {
	SchemaVersion int                    `json:"schemaVersion"`
	MediaType     string                 `json:"mediaType"`
	Manifests     []imageProofDescriptor `json:"manifests"`
}

func cacheInventoryFixture(t *testing.T) string {
	t.Helper()
	root := filepath.Join(t.TempDir(), "oci")
	if err := writeFixtureBuildCache(root); err != nil {
		t.Fatal(err)
	}
	return root
}

func readCacheInventoryFixture(t *testing.T, root, relative string) []byte {
	t.Helper()
	body, err := os.ReadFile(filepath.Join(root, relative))
	if err != nil {
		t.Fatal(err)
	}
	return body
}

func writeCacheInventoryFixture(t *testing.T, root, relative string, body []byte) {
	t.Helper()
	if err := os.WriteFile(filepath.Join(root, relative), body, 0o600); err != nil {
		t.Fatal(err)
	}
}

func cacheInventoryIndex(t *testing.T, root string) cacheInventoryTestIndex {
	t.Helper()
	var index cacheInventoryTestIndex
	if err := json.Unmarshal(readCacheInventoryFixture(t, root, "index.json"), &index); err != nil {
		t.Fatal(err)
	}
	return index
}

func cacheInventoryManifest(t *testing.T, root string) imageProofManifest {
	t.Helper()
	index := cacheInventoryIndex(t, root)
	var manifest imageProofManifest
	if err := json.Unmarshal(readCacheInventoryFixture(t, root, imageProofBlobPath(index.Manifests[0].Digest)), &manifest); err != nil {
		t.Fatal(err)
	}
	return manifest
}

func encodeCacheInventoryFixture(t *testing.T, value any) []byte {
	t.Helper()
	body, err := json.Marshal(value)
	if err != nil {
		t.Fatal(err)
	}
	return body
}

// Rebind the surrounding descriptor graph so a malformed inner payload reaches
// its own parser rather than failing an unrelated outer digest check.
func replaceCacheInventoryManifest(t *testing.T, root string, body []byte) {
	t.Helper()
	index := cacheInventoryIndex(t, root)
	old := imageProofBlobPath(index.Manifests[0].Digest)
	updated := imageProofBlobPath(digestBytes(body))
	if old != updated {
		if err := os.Remove(filepath.Join(root, old)); err != nil {
			t.Fatal(err)
		}
	}
	writeCacheInventoryFixture(t, root, updated, body)
	index.Manifests[0].Digest, index.Manifests[0].Size = digestBytes(body), int64(len(body))
	writeCacheInventoryFixture(t, root, "index.json", encodeCacheInventoryFixture(t, index))
}

func rewriteCacheInventoryManifest(t *testing.T, root string, mutate func(*imageProofManifest)) {
	t.Helper()
	manifest := cacheInventoryManifest(t, root)
	mutate(&manifest)
	replaceCacheInventoryManifest(t, root, encodeCacheInventoryFixture(t, manifest))
}

func replaceCacheInventoryConfig(t *testing.T, root string, body []byte) {
	t.Helper()
	rewriteCacheInventoryManifest(t, root, func(manifest *imageProofManifest) {
		old, updated := imageProofBlobPath(manifest.Config.Digest), imageProofBlobPath(digestBytes(body))
		if old != updated {
			if err := os.Remove(filepath.Join(root, old)); err != nil {
				t.Fatal(err)
			}
		}
		writeCacheInventoryFixture(t, root, updated, body)
		manifest.Config.Digest, manifest.Config.Size = digestBytes(body), int64(len(body))
	})
}

func requireRejectedCacheInventory(t *testing.T, root, diagnostic string) {
	t.Helper()
	observation, err := inspectRendererCache(context.Background(), root)
	if err == nil || !strings.Contains(err.Error(), diagnostic) || observation != (ReproducibilityCache{}) {
		t.Fatalf("invalid inventory observation=%+v error=%v; want zero observation and %q", observation, err, diagnostic)
	}
}

func cacheIngestLockName(seed string) string {
	return strings.TrimPrefix(digestBytes([]byte(seed)), "sha256:")
}

func writeCacheIngestLocks(t *testing.T, root string, count int) {
	t.Helper()
	directory := filepath.Join(root, "ingest-locks")
	if err := os.RemoveAll(directory); err != nil {
		t.Fatal(err)
	}
	if err := os.Mkdir(directory, 0o700); err != nil {
		t.Fatal(err)
	}
	for index := range count {
		name := cacheIngestLockName("ingest-ref-" + strconv.Itoa(index))
		writeCacheInventoryFixture(t, root, filepath.Join("ingest-locks", name), nil)
	}
}

func TestRendererCacheInventoryRecordsExactClosureAndAllowsEmptyIngest(t *testing.T) {
	t.Parallel()
	root := cacheInventoryFixture(t)
	index := cacheInventoryIndex(t, root)
	manifest := cacheInventoryManifest(t, root)
	expected := ReproducibilityCache{
		ManifestDigest: index.Manifests[0].Digest, BlobCount: 3,
		BlobBytes: index.Manifests[0].Size + manifest.Config.Size + manifest.Layers[0].Size,
	}
	for _, optional := range []string{"", "ingest", "cache.lock", "empty ingest-locks", "ingest-locks", "maximum ingest-locks"} {
		applyOptionalCacheInventoryEntry(t, root, optional)
		observed, err := inspectRendererCache(context.Background(), root)
		if err != nil || observed != expected || observed.Imported {
			t.Fatalf("cache closure differs after adding %q: %+v %v", optional, observed, err)
		}
	}
}

func applyOptionalCacheInventoryEntry(t *testing.T, root, optional string) {
	t.Helper()
	switch optional {
	case "ingest":
		if err := os.Mkdir(filepath.Join(root, "ingest"), 0o700); err != nil {
			t.Fatal(err)
		}
	case "cache.lock":
		// The BuildKit client of Buildx 0.38.0 leaves this empty lock file.
		writeCacheInventoryFixture(t, root, "cache.lock", nil)
	case "empty ingest-locks":
		writeCacheIngestLocks(t, root, 0)
	case "ingest-locks":
		// The BuildKit client of Buildx 0.39.0 leaves one empty lock file per ref.
		writeCacheIngestLocks(t, root, 3)
	case "maximum ingest-locks":
		writeCacheIngestLocks(t, root, maximumRendererCacheLayers+2)
	}
}

func TestRendererCacheInventoryCountsRepeatedLayerBlobOnce(t *testing.T) {
	t.Parallel()
	for _, references := range []int{2, maximumRendererCacheLayers} {
		root := cacheInventoryFixture(t)
		rewriteCacheInventoryManifest(t, root, func(manifest *imageProofManifest) {
			manifest.Layers = repeatedCacheInventoryLayers(manifest.Layers[0], references)
		})
		index := cacheInventoryIndex(t, root)
		manifest := cacheInventoryManifest(t, root)
		expected := ReproducibilityCache{
			ManifestDigest: index.Manifests[0].Digest, BlobCount: 3,
			BlobBytes: index.Manifests[0].Size + manifest.Config.Size + manifest.Layers[0].Size,
		}
		observed, err := inspectRendererCache(context.Background(), root)
		if err != nil || observed != expected || len(manifest.Layers) != references {
			t.Fatalf("%d references did not retain one physical layer: %+v error=%v", references, observed, err)
		}
		// Repeated references must still cause their one physical blob to be
		// hash-verified, rather than being skipped along with duplicate work.
		layer := imageProofBlobPath(manifest.Layers[0].Digest)
		body := readCacheInventoryFixture(t, root, layer)
		body[0] ^= 1
		writeCacheInventoryFixture(t, root, layer, body)
		requireRejectedCacheInventory(t, root, "digest does not match")
	}
}

func TestRendererCacheInventoryRejectsSymlinkBoundaries(t *testing.T) {
	t.Parallel()
	ingestLockFile := "ingest-locks/" + cacheIngestLockName("ingest-ref-0")
	for _, target := range []string{".", "blobs", "blobs/sha256", "index.json", "oci-layout", "manifest", "config", "layer", "ingest", "cache.lock", "ingest-locks", ingestLockFile} {
		t.Run(target, func(t *testing.T) {
			root := cacheInventoryFixture(t)
			relative := prepareCacheSymlinkBoundaryTarget(t, root, target, ingestLockFile)
			original := filepath.Join(root, relative)
			saved := filepath.Join(t.TempDir(), "original")
			if err := os.Rename(original, saved); err != nil {
				t.Fatal(err)
			}
			if err := os.Symlink(saved, original); err != nil {
				t.Fatal(err)
			}
			requireRejectedCacheInventory(t, root, "PDF renderer cache")
			if info, err := os.Lstat(original); err != nil || info.Mode()&os.ModeSymlink == 0 {
				t.Fatalf("inspection replaced the rejected symlink: %v", err)
			}
		})
	}
}

func prepareCacheSymlinkBoundaryTarget(t *testing.T, root, target, ingestLockFile string) string {
	t.Helper()
	manifest := cacheInventoryManifest(t, root)
	switch target {
	case "manifest":
		return imageProofBlobPath(cacheInventoryIndex(t, root).Manifests[0].Digest)
	case "config":
		return imageProofBlobPath(manifest.Config.Digest)
	case "layer":
		return imageProofBlobPath(manifest.Layers[0].Digest)
	case "ingest":
		if err := os.Mkdir(filepath.Join(root, target), 0o700); err != nil {
			t.Fatal(err)
		}
	case "cache.lock":
		writeCacheInventoryFixture(t, root, target, nil)
	case "ingest-locks", ingestLockFile:
		writeCacheIngestLocks(t, root, 1)
	}
	return target
}

func TestRendererCacheInventoryRejectsMissingExtraAndCorruptedBlobs(t *testing.T) {
	t.Parallel()
	mutations := []string{
		"missing layer", "extra blob", "wrong size", "wrong digest", "directory blob",
		"extra root", "extra algorithm", "nonempty ingest", "nonempty lock", "directory lock",
		"nonempty ingest lock", "directory ingest lock", "bad ingest lock name",
		"excessive ingest locks", "ingest-locks file", "excessive entries",
	}
	for _, mutation := range mutations {
		t.Run(mutation, func(t *testing.T) {
			if mutation == "bad ingest lock name" {
				assertRejectedBadCacheIngestLockNames(t)
				return
			}
			root := cacheInventoryFixture(t)
			diagnostic := applyCacheInventoryMutation(t, root, mutation)
			requireRejectedCacheInventory(t, root, diagnostic)
		})
	}
}

func assertRejectedBadCacheIngestLockNames(t *testing.T) {
	t.Helper()
	const diagnostic = "PDF renderer cache ingest lock must be one empty regular file with a SHA-256 hex name"
	badNames := []string{
		"A" + strings.Repeat("0", 63),
		strings.ToUpper(cacheIngestLockName("ingest-ref-0")),
		strings.Repeat("a", 63),
		strings.Repeat("a", 65),
		"not-a-sha256-hex-name",
		strings.Repeat("g", 64),
	}
	for _, badName := range badNames {
		root := cacheInventoryFixture(t)
		writeCacheIngestLocks(t, root, 0)
		writeCacheInventoryFixture(t, root, filepath.Join("ingest-locks", badName), nil)
		requireRejectedCacheInventory(t, root, diagnostic)
	}
}

func applyCacheInventoryMutation(t *testing.T, root, mutation string) string {
	t.Helper()
	if diagnostic, handled := applyCacheInventoryBlobMutation(t, root, mutation); handled {
		return diagnostic
	}
	if diagnostic, handled := applyCacheInventoryDirectoryMutation(t, root, mutation); handled {
		return diagnostic
	}
	if diagnostic, handled := applyCacheInventoryLockMutation(t, root, mutation); handled {
		return diagnostic
	}
	t.Fatalf("unhandled mutation %q", mutation)
	return ""
}

func applyCacheInventoryBlobMutation(t *testing.T, root, mutation string) (string, bool) {
	t.Helper()
	layer := imageProofBlobPath(cacheInventoryManifest(t, root).Layers[0].Digest)
	switch mutation {
	case "missing layer", "directory blob":
		if err := os.Remove(filepath.Join(root, layer)); err != nil {
			t.Fatal(err)
		}
		if mutation == "directory blob" {
			if err := os.Mkdir(filepath.Join(root, layer), 0o700); err != nil {
				t.Fatal(err)
			}
		}
		return "PDF renderer cache", true
	case "extra blob":
		writeCacheInventoryFixture(t, root, imageProofBlobPath(digestBytes([]byte("extra"))), []byte("extra"))
		return "PDF renderer cache", true
	case "wrong size":
		writeCacheInventoryFixture(t, root, layer, []byte("short"))
		return "size does not match", true
	case "wrong digest":
		body := readCacheInventoryFixture(t, root, layer)
		body[0] ^= 1
		writeCacheInventoryFixture(t, root, layer, body)
		return "digest does not match", true
	}
	return "", false
}

func applyCacheInventoryDirectoryMutation(t *testing.T, root, mutation string) (string, bool) {
	t.Helper()
	switch mutation {
	case "extra root":
		writeCacheInventoryFixture(t, root, "unexpected", []byte("extra"))
		return "PDF renderer cache", true
	case "extra algorithm":
		if err := os.Mkdir(filepath.Join(root, "blobs", "sha512"), 0o700); err != nil {
			t.Fatal(err)
		}
		return "PDF renderer cache", true
	case "nonempty ingest":
		if err := os.Mkdir(filepath.Join(root, "ingest"), 0o700); err != nil {
			t.Fatal(err)
		}
		writeCacheInventoryFixture(t, root, "ingest/partial", []byte("partial"))
		return "PDF renderer cache", true
	case "excessive entries":
		for index := range maximumRendererCacheLayers + 5 {
			body := []byte{byte(index)}
			writeCacheInventoryFixture(t, root, imageProofBlobPath(digestBytes(body)), body)
		}
		return "PDF renderer cache", true
	}
	return "", false
}

func applyCacheInventoryLockMutation(t *testing.T, root, mutation string) (string, bool) {
	t.Helper()
	const ingestLockDiagnostic = "PDF renderer cache ingest lock must be one empty regular file with a SHA-256 hex name"
	switch mutation {
	case "nonempty lock":
		writeCacheInventoryFixture(t, root, "cache.lock", []byte("x"))
		return "lock must be one empty regular file", true
	case "directory lock":
		if err := os.Mkdir(filepath.Join(root, "cache.lock"), 0o700); err != nil {
			t.Fatal(err)
		}
		return "lock must be one empty regular file", true
	case "nonempty ingest lock":
		writeCacheIngestLocks(t, root, 0)
		writeCacheInventoryFixture(t, root, filepath.Join("ingest-locks", cacheIngestLockName("nonempty")), []byte("x"))
		return ingestLockDiagnostic, true
	case "directory ingest lock":
		writeCacheIngestLocks(t, root, 0)
		if err := os.Mkdir(filepath.Join(root, "ingest-locks", cacheIngestLockName("subdir")), 0o700); err != nil {
			t.Fatal(err)
		}
		return ingestLockDiagnostic, true
	case "excessive ingest locks":
		writeCacheIngestLocks(t, root, maximumRendererCacheLayers+3)
		return "PDF renderer cache has missing, extra or excessive entries: " + filepath.Join(root, "ingest-locks"), true
	case "ingest-locks file":
		writeCacheInventoryFixture(t, root, "ingest-locks", nil)
		return "PDF renderer cache requires a non-symlink directory: " + filepath.Join(root, "ingest-locks"), true
	}
	return "", false
}

func TestRendererCacheInventoryRejectsInvalidDescriptorsBeforeBlobReads(t *testing.T) {
	t.Parallel()
	cases := map[string]func(*imageProofManifest){
		"negative size": func(manifest *imageProofManifest) { manifest.Layers[0].Size = -1 },
		"zero size":     func(manifest *imageProofManifest) { manifest.Layers[0].Size = 0 },
		"huge size":     func(manifest *imageProofManifest) { manifest.Layers[0].Size = maximumRendererCacheBytes + 1 },
		"huge total":    func(manifest *imageProofManifest) { manifest.Layers[0].Size = maximumRendererCacheBytes },
		"too many layers": func(manifest *imageProofManifest) {
			manifest.Layers = repeatedCacheInventoryLayers(manifest.Layers[0], maximumRendererCacheLayers+1)
		},
		"empty layers": func(manifest *imageProofManifest) { manifest.Layers = nil },
		"conflicting duplicate size": func(manifest *imageProofManifest) {
			duplicate := manifest.Layers[0]
			duplicate.Size++
			manifest.Layers = append(manifest.Layers, duplicate)
		},
		"conflicting duplicate media type": func(manifest *imageProofManifest) {
			manifest.Layers[0].Digest = manifest.Config.Digest
			manifest.Layers[0].Size = manifest.Config.Size
		},
		"bad digest": func(manifest *imageProofManifest) { manifest.Layers[0].Digest = "sha256:../../outside" },
		"wrong compression": func(manifest *imageProofManifest) {
			manifest.Layers[0].MediaType = "application/vnd.oci.image.layer.v1.tar+zstd"
		},
		"oversized config":  func(manifest *imageProofManifest) { manifest.Config.Size = maximumImageProofBlobBytes + 1 },
		"wrong config type": func(manifest *imageProofManifest) { manifest.Config.MediaType = imageConfigMediaType },
		"wrong schema":      func(manifest *imageProofManifest) { manifest.SchemaVersion++ },
	}
	for name, mutate := range cases {
		t.Run(name, func(t *testing.T) {
			root := cacheInventoryFixture(t)
			rewriteCacheInventoryManifest(t, root, mutate)
			diagnostic := map[string]string{
				"negative size": "4 GiB blob boundary", "zero size": "4 GiB blob boundary",
				"huge size": "4 GiB blob boundary", "huge total": "4 GiB blob boundary",
				"bad digest": "4 GiB blob boundary", "too many layers": "layer count",
				"empty layers": "layer count", "conflicting duplicate size": "conflicting size or media type",
				"conflicting duplicate media type": "conflicting size or media type",
				"wrong compression":                "requires gzip layer blobs", "oversized config": "invalid PDF renderer cache JSON descriptor",
				"wrong config type": "unsupported PDF renderer cache manifest", "wrong schema": "unsupported PDF renderer cache manifest",
			}[name]
			requireRejectedCacheInventory(t, root, diagnostic)
		})
	}
}

func repeatedCacheInventoryLayers(descriptor imageProofDescriptor, count int) []imageProofDescriptor {
	layers := make([]imageProofDescriptor, count)
	for index := range layers {
		layers[index] = descriptor
	}
	return layers
}

func TestRendererCacheInventoryRejectsDescriptorAndJSONBlobMismatch(t *testing.T) {
	t.Parallel()
	for _, mutation := range []string{"manifest size", "config size", "layer size", "missing manifest", "missing config", "corrupted manifest", "corrupted config", "extra manifest descriptor", "oversized JSON"} {
		t.Run(mutation, func(t *testing.T) {
			root := cacheInventoryFixture(t)
			index := cacheInventoryIndex(t, root)
			manifest := cacheInventoryManifest(t, root)
			switch mutation {
			case "manifest size":
				index.Manifests[0].Size++
				writeCacheInventoryFixture(t, root, "index.json", encodeCacheInventoryFixture(t, index))
			case "config size":
				rewriteCacheInventoryManifest(t, root, func(value *imageProofManifest) { value.Config.Size++ })
			case "layer size":
				rewriteCacheInventoryManifest(t, root, func(value *imageProofManifest) { value.Layers[0].Size++ })
			case "extra manifest descriptor":
				index.Manifests = append(index.Manifests, index.Manifests[0])
				writeCacheInventoryFixture(t, root, "index.json", encodeCacheInventoryFixture(t, index))
			case "oversized JSON":
				writeCacheInventoryFixture(t, root, "index.json", bytes.Repeat([]byte{' '}, int(maximumImageProofBlobBytes)+1))
			default:
				descriptor := index.Manifests[0]
				if strings.HasSuffix(mutation, "config") {
					descriptor = manifest.Config
				}
				relative := imageProofBlobPath(descriptor.Digest)
				if strings.HasPrefix(mutation, "missing") {
					if err := os.Remove(filepath.Join(root, relative)); err != nil {
						t.Fatal(err)
					}
				} else {
					body := readCacheInventoryFixture(t, root, relative)
					body[0] ^= 1
					writeCacheInventoryFixture(t, root, relative, body)
				}
			}
			requireRejectedCacheInventory(t, root, "")
		})
	}
}

func TestRendererCacheInventoryRejectsNonObjectBuildKitConfig(t *testing.T) {
	t.Parallel()
	for _, body := range []string{"null", "[]", `"not an object"`} {
		t.Run(body, func(t *testing.T) {
			root := cacheInventoryFixture(t)
			replaceCacheInventoryConfig(t, root, []byte(body))
			requireRejectedCacheInventory(t, root, "invalid PDF renderer BuildKit cache config")
		})
	}
}

func TestRendererCacheInventoryRejectsAmbiguousAuthorityJSON(t *testing.T) {
	t.Parallel()
	for _, target := range []string{"oci-layout", "index.json", "manifest", "config"} {
		for _, mutation := range []string{"duplicate", "trailing", "unknown"} {
			if target == "config" && mutation == "unknown" {
				continue // The pinned BuildKit parser owns cacheconfig fields.
			}
			t.Run(target+"/"+mutation, func(t *testing.T) {
				root := cacheInventoryFixture(t)
				relative := target
				if target == "manifest" {
					relative = imageProofBlobPath(cacheInventoryIndex(t, root).Manifests[0].Digest)
				} else if target == "config" {
					relative = imageProofBlobPath(cacheInventoryManifest(t, root).Config.Digest)
				}
				body := mutateCacheInventoryJSON(readCacheInventoryFixture(t, root, relative), mutation)
				switch target {
				case "manifest":
					replaceCacheInventoryManifest(t, root, body)
				case "config":
					replaceCacheInventoryConfig(t, root, body)
				default:
					writeCacheInventoryFixture(t, root, relative, body)
				}
				requireRejectedCacheInventory(t, root, "cache")
			})
		}
	}
}

func mutateCacheInventoryJSON(body []byte, mutation string) []byte {
	switch mutation {
	case "duplicate":
		// Duplicate an existing field so unknown-field rejection cannot mask a
		// broken duplicate-key validator. Ordinary JSON decoding keeps the last.
		prefix := append([]byte(nil), body[:bytes.IndexByte(body, ':')+1]...)
		return append(append(prefix, []byte("null,")...), body[1:]...)
	case "trailing":
		return append(body, []byte(` {"trailing":true}`)...)
	default:
		return append([]byte(`{"unexpected":true,`), body[1:]...)
	}
}

func TestRendererCacheInventoryHonoursCancellation(t *testing.T) {
	t.Parallel()
	root := cacheInventoryFixture(t)
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	observation, err := inspectRendererCache(ctx, root)
	if !errors.Is(err, context.Canceled) || observation != (ReproducibilityCache{}) {
		t.Fatalf("cancelled cache produced observation=%+v error=%v", observation, err)
	}
}

func TestRendererCacheRestoreRejectsIdentityTamperingBeforeBuild(t *testing.T) {
	t.Parallel()
	for _, mutation := range []string{"lock", "context", "schema", "imported", "unbound image", "malformed image", "blob count", "blob bytes", "cache digest", "duplicate", "trailing", "unknown", "identity symlink", "extra entry"} {
		t.Run(mutation, func(t *testing.T) {
			configuration := renderConfiguration(t)
			if _, err := verifyCacheFixture(configuration, newCacheFixtureExecutor(), "seed", true); err != nil {
				t.Fatal(err)
			}
			root := filepath.Join(configuration.RepositoryRoot, RendererCacheDirectory)
			mutateCacheRestoreIdentity(t, root, mutation)
			before := readCacheInventoryFixture(t, root, "identity.json")
			executor := newCacheFixtureExecutor()
			_, err := verifyCacheFixture(configuration, executor, "rejected", true)
			if err == nil || executor.renderCount != 0 || len(requestsWithPrefix(executor.requests, "buildx", "build")) != 0 {
				t.Fatalf("invalid restore reached build/render: error=%v renders=%d", err, executor.renderCount)
			}
			if after := readCacheInventoryFixture(t, root, "identity.json"); !bytes.Equal(before, after) {
				t.Fatal("rejected restore replaced its retained identity")
			}
			if _, err := os.Stat(filepath.Join(configuration.RepositoryRoot, "build/evidence/rejected.json")); !errors.Is(err, os.ErrNotExist) {
				t.Fatalf("rejected restore wrote a successful receipt: %v", err)
			}
		})
	}
}

func mutateCacheRestoreIdentity(t *testing.T, root, mutation string) {
	t.Helper()
	body := readCacheInventoryFixture(t, root, "identity.json")
	if mutation == "identity symlink" {
		saved := filepath.Join(t.TempDir(), "identity.json")
		if err := os.Rename(filepath.Join(root, "identity.json"), saved); err != nil {
			t.Fatal(err)
		}
		if err := os.Symlink(saved, filepath.Join(root, "identity.json")); err != nil {
			t.Fatal(err)
		}
		return
	}
	if mutation == "extra entry" {
		writeCacheInventoryFixture(t, root, "extra", []byte("not part of the cache"))
		return
	}
	if mutation == "duplicate" || mutation == "trailing" || mutation == "unknown" {
		writeCacheInventoryFixture(t, root, "identity.json", mutateCacheInventoryJSON(body, mutation))
		return
	}
	var identity rendererCacheIdentity
	if err := json.Unmarshal(body, &identity); err != nil {
		t.Fatal(err)
	}
	switch mutation {
	case "lock":
		identity.LockSHA256 = "sha256:" + strings.Repeat("b", 64)
	case "context":
		identity.ContextSHA256 = "sha256:" + strings.Repeat("b", 64)
	case "schema":
		identity.Schema++
	case "imported":
		identity.Cache.Imported = true
	case "unbound image":
		identity.ImageID = testSecondImageID
	case "malformed image":
		identity.ImageID = "sha256:not-a-digest"
	case "blob count":
		identity.Cache.BlobCount++
	case "blob bytes":
		identity.Cache.BlobBytes++
	case "cache digest":
		identity.Cache.ManifestDigest = "sha256:" + strings.Repeat("b", 64)
	}
	writeCacheInventoryFixture(t, root, "identity.json", encodeCacheInventoryFixture(t, identity))
}
