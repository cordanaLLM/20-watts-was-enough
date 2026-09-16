package pdftools

import (
	"archive/tar"
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"time"

	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/strictjson"
)

const (
	ociConfigMediaType   = "application/vnd.oci.image.config.v1+json"
	ociIndexMediaType    = "application/vnd.oci.image.index.v1+json"
	ociLayerMediaType    = "application/vnd.oci.image.layer.v1.tar+gzip"
	ociManifestMediaType = "application/vnd.oci.image.manifest.v1+json"
)

type imageIdentity struct {
	ArchiveSHA256  string
	ArchiveSize    int64
	ManifestDigest string
	ConfigDigest   string
	LayerDigests   []string
	LayerDiffIDs   []string
}

type ociDescriptor struct {
	MediaType    string            `json:"mediaType"`
	Digest       string            `json:"digest"`
	Size         int64             `json:"size"`
	Annotations  map[string]string `json:"annotations,omitempty"`
	Platform     *ociPlatform      `json:"platform,omitempty"`
	ArtifactType string            `json:"artifactType,omitempty"`
}

type ociPlatform struct {
	Architecture string `json:"architecture"`
	OS           string `json:"os"`
}

type ociIndex struct {
	SchemaVersion int               `json:"schemaVersion"`
	MediaType     string            `json:"mediaType"`
	Manifests     []ociDescriptor   `json:"manifests"`
	Annotations   map[string]string `json:"annotations,omitempty"`
}

type ociManifest struct {
	SchemaVersion int               `json:"schemaVersion"`
	MediaType     string            `json:"mediaType"`
	Config        ociDescriptor     `json:"config"`
	Layers        []ociDescriptor   `json:"layers"`
	Annotations   map[string]string `json:"annotations,omitempty"`
}

type ociImageConfig struct {
	Architecture string `json:"architecture"`
	Author       string `json:"author"`
	Created      string `json:"created"`
	History      []struct {
		Author     string `json:"author"`
		Created    string `json:"created"`
		CreatedBy  string `json:"created_by"`
		Comment    string `json:"comment"`
		EmptyLayer bool   `json:"empty_layer,omitempty"`
	} `json:"history"`
	OS     string `json:"os"`
	RootFS struct {
		Type    string   `json:"type"`
		DiffIDs []string `json:"diff_ids"`
	} `json:"rootfs"`
	Config struct {
		Env    []string          `json:"Env"`
		Labels map[string]string `json:"Labels"`
		User   string            `json:"User"`
	} `json:"config"`
}

type dockerArchiveEntry struct {
	Config   string   `json:"Config"`
	RepoTags []string `json:"RepoTags"`
	Layers   []string `json:"Layers"`
}

func projectBaseArchive(ctx context.Context, archivePath, layoutRoot string, authority checkedAuthority) (imageIdentity, error) {
	contract := authority.contract
	if _, err := os.Lstat(layoutRoot); !errors.Is(err, os.ErrNotExist) {
		if err == nil {
			return imageIdentity{}, errors.New("base OCI projection root already exists")
		}
		return imageIdentity{}, fmt.Errorf("inspect base OCI projection root: %w", err)
	}
	if err := os.Mkdir(layoutRoot, 0o700); err != nil {
		return imageIdentity{}, fmt.Errorf("create base OCI projection root: %w", err)
	}
	if err := os.MkdirAll(filepath.Join(layoutRoot, "blobs", "sha256"), 0o700); err != nil {
		return imageIdentity{}, fmt.Errorf("create base OCI layout: %w", err)
	}
	archive, err := openBoundedRegular(archivePath, contract.Limits.BaseArchiveBytes, "apko Docker archive")
	if err != nil {
		return imageIdentity{}, err
	}
	defer archive.Close()
	hasher := sha256.New()
	counting := &countingReader{source: io.TeeReader(archive, hasher)}
	reader := tar.NewReader(counting)
	small, err := projectBaseTarEntries(ctx, reader, layoutRoot, contract)
	if err != nil {
		return imageIdentity{}, err
	}
	remaining := contract.Limits.BaseArchiveBytes - counting.count
	if remaining < 0 {
		return imageIdentity{}, errors.New("apko Docker archive exceeds the base archive boundary")
	}
	if _, err := io.Copy(io.Discard, io.LimitReader(counting, remaining+1)); err != nil {
		return imageIdentity{}, fmt.Errorf("finish hashing apko Docker archive: %w", err)
	}
	if counting.count > contract.Limits.BaseArchiveBytes {
		return imageIdentity{}, errors.New("apko Docker archive grew beyond the base archive boundary")
	}
	archiveSHA := hex.EncodeToString(hasher.Sum(nil))
	if counting.count != contract.BaseImage.ArchiveSize || archiveSHA != contract.BaseImage.ArchiveSHA256 {
		return imageIdentity{}, errors.New("apko Docker archive bytes differ from the committed base identity")
	}
	if err := verifyOpenedRegular(archivePath, archive, counting.count, "apko Docker archive"); err != nil {
		return imageIdentity{}, err
	}
	if err := writeOCILayoutFile(layoutRoot, contract.SourceDateEpoch); err != nil {
		return imageIdentity{}, err
	}
	identity, err := validateProjectedBase(layoutRoot, small, contract)
	if err != nil {
		return imageIdentity{}, err
	}
	identity.ArchiveSHA256 = archiveSHA
	identity.ArchiveSize = counting.count
	return identity, nil
}

type projectedSmallFiles struct {
	dockerManifest []byte
	index          []byte
	manifest       []byte
	config         []byte
}

func projectBaseTarEntries(ctx context.Context, reader *tar.Reader, layoutRoot string, contract Contract) (projectedSmallFiles, error) {
	base := contract.BaseImage
	wanted := map[string]string{
		"manifest.json":     "docker",
		"index.json":        "index",
		base.ManifestDigest: "manifest",
		base.ConfigDigest:   "config",
		strings.TrimPrefix(base.LayerDigest, "sha256:") + ".tar.gz": "layer",
	}
	seen := make(map[string]bool, len(wanted))
	var files projectedSmallFiles
	for {
		if err := ctx.Err(); err != nil {
			return files, err
		}
		header, err := reader.Next()
		if errors.Is(err, io.EOF) {
			break
		}
		if err != nil {
			return files, fmt.Errorf("read apko Docker archive: %w", err)
		}
		role, admitted := wanted[header.Name]
		if !admitted || seen[header.Name] || header.Typeflag != tar.TypeReg || header.Size <= 0 ||
			header.Mode != 0o644 || header.Uid != 0 || header.Gid != 0 {
			return files, fmt.Errorf("apko Docker archive entry %q is not admitted", header.Name)
		}
		seen[header.Name] = true
		if err := projectBaseTarEntry(reader, header.Size, role, layoutRoot, contract, &files); err != nil {
			return files, err
		}
	}
	if len(seen) != len(wanted) {
		return files, errors.New("apko Docker archive omits one or more exact entries")
	}
	return files, nil
}

func projectBaseTarEntry(reader io.Reader, size int64, role, layoutRoot string, contract Contract, files *projectedSmallFiles) error {
	if size > contract.Limits.BaseArchiveBytes {
		return errors.New("apko Docker archive entry exceeds the base archive boundary")
	}
	if role == "layer" {
		destination := filepath.Join(layoutRoot, "blobs", "sha256", strings.TrimPrefix(contract.BaseImage.LayerDigest, "sha256:"))
		return writeExactStream(destination, reader, size, contract.BaseImage.LayerDigest, contract.SourceDateEpoch)
	}
	if size > 64*1024 {
		return fmt.Errorf("apko Docker archive %s metadata exceeds 65536 bytes", role)
	}
	body, err := io.ReadAll(io.LimitReader(reader, size+1))
	if err != nil || int64(len(body)) != size {
		return fmt.Errorf("read apko Docker archive %s metadata", role)
	}
	var destination string
	switch role {
	case "docker":
		files.dockerManifest = body
		return nil
	case "index":
		files.index = body
		destination = filepath.Join(layoutRoot, "index.json")
	case "manifest":
		files.manifest = body
		destination = filepath.Join(layoutRoot, "blobs", "sha256", strings.TrimPrefix(contract.BaseImage.ManifestDigest, "sha256:"))
	case "config":
		files.config = body
		destination = filepath.Join(layoutRoot, "blobs", "sha256", strings.TrimPrefix(contract.BaseImage.ConfigDigest, "sha256:"))
	default:
		return errors.New("unknown apko Docker archive projection role")
	}
	return writeExactBytes(destination, body, contract.SourceDateEpoch)
}

func validateProjectedBase(layoutRoot string, files projectedSmallFiles, contract Contract) (imageIdentity, error) {
	base := contract.BaseImage
	if digestRaw(files.manifest) != strings.TrimPrefix(base.ManifestDigest, "sha256:") ||
		digestRaw(files.config) != strings.TrimPrefix(base.ConfigDigest, "sha256:") {
		return imageIdentity{}, errors.New("apko OCI manifest or config bytes do not match their names")
	}
	dockerManifest, err := decodeArtifactJSON[[]dockerArchiveEntry](files.dockerManifest, 5, "apko Docker manifest")
	if err != nil {
		return imageIdentity{}, err
	}
	wantDocker := []dockerArchiveEntry{{
		Config:   base.ConfigDigest,
		RepoTags: []string{"index.docker.io/library/pdf-tools:26.08.0-r0-amd64"},
		Layers:   []string{strings.TrimPrefix(base.LayerDigest, "sha256:") + ".tar.gz"},
	}}
	if !slices.EqualFunc(dockerManifest, wantDocker, equalDockerArchiveEntry) {
		return imageIdentity{}, errors.New("apko Docker manifest differs from its exact single-platform projection")
	}
	index, err := decodeArtifactJSON[ociIndex](files.index, 8, "apko OCI index")
	if err != nil {
		return imageIdentity{}, err
	}
	manifest, err := decodeArtifactJSON[ociManifest](files.manifest, 8, "apko OCI manifest")
	if err != nil {
		return imageIdentity{}, err
	}
	config, err := decodeArtifactJSON[ociImageConfig](files.config, 8, "apko OCI config")
	if err != nil {
		return imageIdentity{}, err
	}
	if err := validateBaseOCI(index, manifest, config, int64(len(files.manifest)), int64(len(files.config)), contract); err != nil {
		return imageIdentity{}, err
	}
	layerPath := filepath.Join(layoutRoot, "blobs", "sha256", strings.TrimPrefix(base.LayerDigest, "sha256:"))
	if err := verifyBlobFile(layerPath, manifest.Layers[0]); err != nil {
		return imageIdentity{}, err
	}
	return imageIdentity{
		ManifestDigest: base.ManifestDigest,
		ConfigDigest:   base.ConfigDigest,
		LayerDigests:   []string{base.LayerDigest},
		LayerDiffIDs:   []string{base.LayerDiffID},
	}, nil
}

func validateBaseOCI(index ociIndex, manifest ociManifest, config ociImageConfig, manifestSize, configSize int64, contract Contract) error {
	base := contract.BaseImage
	annotations := expectedImageAnnotations(contract)
	if index.SchemaVersion != 2 || index.MediaType != ociIndexMediaType || len(index.Manifests) != 1 ||
		!equalStringMap(index.Annotations, annotations) {
		return errors.New("apko OCI index identity or annotations are invalid")
	}
	descriptor := index.Manifests[0]
	if descriptor.MediaType != ociManifestMediaType || descriptor.Digest != base.ManifestDigest || descriptor.Size != manifestSize ||
		descriptor.Platform == nil || *descriptor.Platform != (ociPlatform{Architecture: "amd64", OS: "linux"}) ||
		descriptor.ArtifactType != ociConfigMediaType || len(descriptor.Annotations) != 0 {
		return errors.New("apko OCI index descriptor is invalid")
	}
	if manifest.SchemaVersion != 2 || manifest.MediaType != ociManifestMediaType || len(manifest.Layers) != 1 ||
		!equalStringMap(manifest.Annotations, annotations) {
		return errors.New("apko OCI manifest identity or annotations are invalid")
	}
	if manifest.Config.MediaType != ociConfigMediaType || manifest.Config.Digest != base.ConfigDigest ||
		manifest.Config.Size != configSize || manifest.Config.Platform != nil || manifest.Config.ArtifactType != "" ||
		len(manifest.Config.Annotations) != 0 {
		return errors.New("apko OCI config descriptor is invalid")
	}
	layer := manifest.Layers[0]
	if layer.MediaType != ociLayerMediaType || layer.Digest != base.LayerDigest || layer.Size <= 0 ||
		layer.Platform != nil || layer.ArtifactType != "" || len(layer.Annotations) != 0 {
		return errors.New("apko OCI layer descriptor is invalid")
	}
	return validateBaseOCIConfig(config, contract)
}

func validateBaseOCIConfig(config ociImageConfig, contract Contract) error {
	created := time.Unix(contract.SourceDateEpoch, 0).UTC().Format(time.RFC3339)
	if config.Architecture != "amd64" || config.OS != "linux" || config.Author != "github.com/chainguard-dev/apko" ||
		config.Created != created || config.RootFS.Type != "layers" ||
		!slices.Equal(config.RootFS.DiffIDs, []string{contract.BaseImage.LayerDiffID}) ||
		config.Config.User != "65532" ||
		!slices.Equal(config.Config.Env, []string{"PATH=/usr/bin", "SSL_CERT_FILE=/etc/ssl/certs/ca-certificates.crt"}) ||
		!equalStringMap(config.Config.Labels, expectedImageAnnotations(contract)) {
		return errors.New("apko OCI config differs from the committed runtime identity")
	}
	if len(config.History) != 1 || config.History[0].Author != "apko" || config.History[0].Created != created ||
		config.History[0].CreatedBy != "apko" || config.History[0].Comment != "This is an apko single-layer image" ||
		config.History[0].EmptyLayer {
		return errors.New("apko OCI history differs from the deterministic base identity")
	}
	return nil
}

func expectedImageAnnotations(contract Contract) map[string]string {
	return map[string]string{
		"io.github.lusoris.20-watts-was-enough.image-name":       contract.Image,
		"io.github.lusoris.20-watts-was-enough.poppler-version":  contract.Runtime.RequiredTools[0].Version,
		"io.github.lusoris.20-watts-was-enough.result-authority": contract.ResultAuthority,
		"org.opencontainers.image.created":                       time.Unix(contract.SourceDateEpoch, 0).UTC().Format(time.RFC3339),
		"org.opencontainers.image.description":                   "Locked Poppler tools for bounded publication audits",
		"org.opencontainers.image.source":                        "https://github.com/lusoris/20-watts-was-enough",
		"org.opencontainers.image.title":                         "20 Watts Was Enough PDF tools",
	}
}

func equalDockerArchiveEntry(left, right dockerArchiveEntry) bool {
	return left.Config == right.Config && slices.Equal(left.RepoTags, right.RepoTags) && slices.Equal(left.Layers, right.Layers)
}

func equalStringMap(left, right map[string]string) bool {
	return len(left) == len(right) && slices.EqualFunc(sortedMapPairs(left), sortedMapPairs(right), func(a, b string) bool { return a == b })
}

func sortedMapPairs(values map[string]string) []string {
	pairs := make([]string, 0, len(values))
	for key, value := range values {
		pairs = append(pairs, key+"\x00"+value)
	}
	slices.Sort(pairs)
	return pairs
}

func decodeArtifactJSON[T any](body []byte, depth int, label string) (T, error) {
	var value T
	if err := strictjson.Validate(body, depth); err != nil {
		return value, fmt.Errorf("validate %s JSON: %w", label, err)
	}
	decoder := json.NewDecoder(bytes.NewReader(body))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&value); err != nil {
		return value, fmt.Errorf("decode %s: %w", label, err)
	}
	if err := decoder.Decode(&struct{}{}); !errors.Is(err, io.EOF) {
		return value, fmt.Errorf("%s contains trailing JSON data", label)
	}
	return value, nil
}

type countingReader struct {
	source io.Reader
	count  int64
}

func (reader *countingReader) Read(body []byte) (int, error) {
	count, err := reader.source.Read(body)
	reader.count += int64(count)
	return count, err
}

func openBoundedRegular(path string, maximum int64, label string) (*os.File, error) {
	information, err := os.Lstat(path)
	if err != nil || !information.Mode().IsRegular() || information.Mode()&os.ModeSymlink != 0 ||
		information.Size() <= 0 || information.Size() > maximum {
		return nil, fmt.Errorf("%s must be a regular non-symlink file between 1 and %d bytes", label, maximum)
	}
	file, err := os.Open(path)
	if err != nil {
		return nil, fmt.Errorf("open %s: %w", label, err)
	}
	opened, err := file.Stat()
	if err != nil || !os.SameFile(information, opened) || information.Mode() != opened.Mode() || information.Size() != opened.Size() {
		_ = file.Close()
		return nil, fmt.Errorf("%s changed before it was opened", label)
	}
	return file, nil
}

func verifyOpenedRegular(path string, file *os.File, size int64, label string) error {
	opened, err := file.Stat()
	current, currentErr := os.Lstat(path)
	if err != nil || currentErr != nil || !opened.Mode().IsRegular() || !current.Mode().IsRegular() ||
		!os.SameFile(opened, current) || opened.Mode() != current.Mode() || opened.Size() != size || current.Size() != size ||
		!opened.ModTime().Equal(current.ModTime()) {
		return fmt.Errorf("%s changed while it was read", label)
	}
	return nil
}

func writeExactStream(path string, source io.Reader, size int64, expectedDigest string, epoch int64) (returnError error) {
	file, err := os.OpenFile(path, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o644)
	if err != nil {
		return fmt.Errorf("create projected OCI blob: %w", err)
	}
	complete := false
	defer func() {
		_ = file.Close()
		if !complete {
			_ = os.Remove(path)
		}
	}()
	hasher := sha256.New()
	written, err := io.CopyN(io.MultiWriter(file, hasher), source, size)
	if err != nil || written != size || "sha256:"+hex.EncodeToString(hasher.Sum(nil)) != expectedDigest {
		return errors.New("projected OCI blob bytes differ from their descriptor")
	}
	if err := file.Sync(); err != nil {
		return fmt.Errorf("sync projected OCI blob: %w", err)
	}
	if err := file.Close(); err != nil {
		return fmt.Errorf("close projected OCI blob: %w", err)
	}
	if err := os.Chtimes(path, time.Unix(epoch, 0), time.Unix(epoch, 0)); err != nil {
		return fmt.Errorf("normalize projected OCI blob timestamp: %w", err)
	}
	complete = true
	return nil
}

func writeExactBytes(path string, body []byte, epoch int64) error {
	file, err := os.OpenFile(path, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o644)
	if err != nil {
		return fmt.Errorf("create projected OCI metadata: %w", err)
	}
	complete := false
	defer func() {
		_ = file.Close()
		if !complete {
			_ = os.Remove(path)
		}
	}()
	if _, err := file.Write(body); err != nil {
		return fmt.Errorf("write projected OCI metadata: %w", err)
	}
	if err := file.Sync(); err != nil {
		return fmt.Errorf("sync projected OCI metadata: %w", err)
	}
	if err := file.Close(); err != nil {
		return fmt.Errorf("close projected OCI metadata: %w", err)
	}
	if err := os.Chmod(path, 0o644); err != nil {
		return fmt.Errorf("normalize projected OCI metadata mode: %w", err)
	}
	if err := os.Chtimes(path, time.Unix(epoch, 0), time.Unix(epoch, 0)); err != nil {
		return fmt.Errorf("normalize projected OCI metadata timestamp: %w", err)
	}
	complete = true
	return nil
}

func writeOCILayoutFile(root string, epoch int64) error {
	if err := writeExactBytes(filepath.Join(root, "oci-layout"), []byte("{\"imageLayoutVersion\":\"1.0.0\"}\n"), epoch); err != nil {
		return err
	}
	for _, directory := range []string{filepath.Join(root, "blobs"), filepath.Join(root, "blobs", "sha256"), root} {
		if err := os.Chmod(directory, 0o755); err != nil {
			return fmt.Errorf("normalize projected OCI directory mode: %w", err)
		}
		if err := os.Chtimes(directory, time.Unix(epoch, 0), time.Unix(epoch, 0)); err != nil {
			return fmt.Errorf("normalize projected OCI directory timestamp: %w", err)
		}
	}
	return nil
}

func verifyBlobFile(path string, descriptor ociDescriptor) error {
	file, err := openBoundedRegular(path, descriptor.Size, "OCI blob")
	if err != nil {
		return err
	}
	defer file.Close()
	hasher := sha256.New()
	written, err := io.Copy(hasher, io.LimitReader(file, descriptor.Size+1))
	if err != nil || written != descriptor.Size || "sha256:"+hex.EncodeToString(hasher.Sum(nil)) != descriptor.Digest {
		return errors.New("OCI blob bytes differ from their descriptor")
	}
	return verifyOpenedRegular(path, file, written, "OCI blob")
}
