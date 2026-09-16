package pdfrender

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"strings"

	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/strictjson"
)

const imageManifestMediaType = "application/vnd.oci.image.manifest.v1+json"
const imageConfigMediaType = "application/vnd.oci.image.config.v1+json"

// ImageConfigProof retains exact config bytes and, when execution uses a
// manifest ID, its original manifest. Byte slices survive JSON as base64.
type ImageConfigProof struct {
	Method   string `json:"method"`
	Manifest []byte `json:"manifest_base64,omitempty"`
	Config   []byte `json:"config_base64"`
}

type imageProofDescriptor struct {
	MediaType   string            `json:"mediaType"`
	Digest      string            `json:"digest"`
	Size        int64             `json:"size"`
	Annotations map[string]string `json:"annotations,omitempty"`
	Platform    *struct {
		OS           string `json:"os"`
		Architecture string `json:"architecture"`
	} `json:"platform,omitempty"`
}

type imageProofManifest struct {
	SchemaVersion int                    `json:"schemaVersion"`
	MediaType     string                 `json:"mediaType"`
	Config        imageProofDescriptor   `json:"config"`
	Layers        []imageProofDescriptor `json:"layers"`
	Annotations   map[string]string      `json:"annotations,omitempty"`
}

type imageArchiveExecutor interface {
	inspectImageArchive(context.Context, Configuration, string, string) (ImageConfigProof, error)
}

func inspectImageProof(ctx context.Context, source io.Reader, imageID, manifestDigest string) (ImageConfigProof, error) {
	if !imageIDPattern.MatchString(imageID) || !imageIDPattern.MatchString(manifestDigest) {
		return ImageConfigProof{}, errors.New("image proof requires exact execution and manifest digests")
	}
	archive, err := readImageProofArchive(ctx, source)
	if err != nil {
		return ImageConfigProof{}, fmt.Errorf("read renderer image proof archive: %w", err)
	}
	manifestBytes := archive.small[imageProofBlobPath(manifestDigest)]
	if len(manifestBytes) == 0 {
		return inspectDirectConfigProof(archive, imageID, manifestDigest)
	}
	if digestBytes(manifestBytes) != manifestDigest {
		return ImageConfigProof{}, errors.New("original manifest digest mismatch")
	}
	var manifest imageProofManifest
	if err := decodeImageProofJSON(manifestBytes, &manifest, "original manifest"); err != nil {
		return ImageConfigProof{}, err
	}
	if err := validateImageProofManifest(manifest); err != nil {
		return ImageConfigProof{}, err
	}
	config := archive.small[imageProofBlobPath(manifest.Config.Digest)]
	if int64(len(config)) != manifest.Config.Size || digestBytes(config) != manifest.Config.Digest {
		return ImageConfigProof{}, errors.New("renderer config bytes do not match the original manifest descriptor")
	}
	if imageID != manifestDigest && imageID != manifest.Config.Digest {
		return ImageConfigProof{}, errors.New("loaded execution ID is neither the original manifest nor its verified config")
	}
	if err := validateImageProofConfig(config); err != nil {
		return ImageConfigProof{}, err
	}
	if err := validateImageProofIndex(archive, manifestDigest, int64(len(manifestBytes))); err != nil {
		return ImageConfigProof{}, err
	}
	return ImageConfigProof{Method: "docker-save-original-manifest-config-v1", Manifest: manifestBytes, Config: config}, nil
}

func inspectDirectConfigProof(archive imageProofArchive, imageID, manifestDigest string) (ImageConfigProof, error) {
	if imageID == manifestDigest {
		return ImageConfigProof{}, errors.New("manifest-ID execution requires its original manifest bytes, not a reconstructed export")
	}
	var entries []struct {
		Config       string          `json:"Config"`
		RepoTags     []string        `json:"RepoTags"`
		Layers       []string        `json:"Layers"`
		Parent       string          `json:"Parent,omitempty"`
		LayerSources json.RawMessage `json:"LayerSources,omitempty"`
	}
	if err := decodeImageProofJSON(archive.small["manifest.json"], &entries, "Docker archive manifest"); err != nil {
		return ImageConfigProof{}, err
	}
	if len(entries) != 1 || entries[0].Config != imageProofBlobPath(imageID) ||
		len(entries[0].Layers) == 0 || len(entries[0].Layers) > 64 {
		return ImageConfigProof{}, errors.New("classic-store export does not select the exact loaded config ID")
	}
	config := archive.small[entries[0].Config]
	if len(config) == 0 || digestBytes(config) != imageID {
		return ImageConfigProof{}, errors.New("classic-store config bytes do not hash to the loaded execution ID")
	}
	if err := validateImageProofConfig(config); err != nil {
		return ImageConfigProof{}, err
	}
	// The original Buildx manifest remains a separate metadata observation:
	// classic Docker's newly serialised OCI manifest is not evidence of it.
	return ImageConfigProof{Method: "docker-save-execution-config-id-v1", Config: config}, nil
}

func validateImageProofManifest(manifest imageProofManifest) error {
	if manifest.SchemaVersion != 2 || manifest.MediaType != imageManifestMediaType ||
		manifest.Config.MediaType != imageConfigMediaType || !validImageProofDescriptor(manifest.Config) ||
		manifest.Config.Size > maximumImageProofBlobBytes || len(manifest.Layers) == 0 || len(manifest.Layers) > 64 {
		return errors.New("renderer original manifest has unsupported schema, config or layer inventory")
	}
	for _, layer := range manifest.Layers {
		if !validImageProofDescriptor(layer) || (layer.MediaType != "application/vnd.oci.image.layer.v1.tar+gzip" &&
			layer.MediaType != "application/vnd.oci.image.layer.v1.tar") {
			return errors.New("renderer original manifest has an invalid layer descriptor")
		}
	}
	return nil
}

func validImageProofDescriptor(value imageProofDescriptor) bool {
	return imageIDPattern.MatchString(value.Digest) && value.Size > 0 && value.Size <= maximumImageProofArchiveBytes
}

func validateImageProofConfig(body []byte) error {
	// OCI's execution config and history are retained verbatim, not interpreted
	// as another authority. Strict validation still covers every nested key.
	var config struct {
		Architecture string          `json:"architecture"`
		OS           string          `json:"os"`
		Created      string          `json:"created,omitempty"`
		Author       string          `json:"author,omitempty"`
		Config       json.RawMessage `json:"config"`
		RootFS       json.RawMessage `json:"rootfs"`
		History      json.RawMessage `json:"history,omitempty"`
	}
	if err := decodeImageProofJSON(body, &config, "config"); err != nil {
		return err
	}
	if config.OS != "linux" || config.Architecture != "amd64" || !imageProofJSONObject(config.Config) || !imageProofJSONObject(config.RootFS) {
		return errors.New("renderer verified config is not a complete linux/amd64 image")
	}
	return nil
}

func imageProofJSONObject(body []byte) bool {
	trimmed := bytes.TrimSpace(body)
	return len(trimmed) >= 2 && trimmed[0] == '{' && trimmed[len(trimmed)-1] == '}'
}

func validateImageProofIndex(archive imageProofArchive, expected string, size int64) error {
	var layout struct {
		Version string `json:"imageLayoutVersion"`
	}
	if err := decodeImageProofJSON(archive.small["oci-layout"], &layout, "OCI layout"); err != nil {
		return err
	}
	if layout.Version != "1.0.0" {
		return errors.New("renderer image proof requires OCI layout 1.0.0")
	}
	var index struct {
		SchemaVersion int                    `json:"schemaVersion"`
		MediaType     string                 `json:"mediaType"`
		Manifests     []imageProofDescriptor `json:"manifests"`
		Annotations   map[string]string      `json:"annotations,omitempty"`
	}
	if err := decodeImageProofJSON(archive.small["index.json"], &index, "OCI index"); err != nil {
		return err
	}
	if index.SchemaVersion != 2 || index.MediaType != "application/vnd.oci.image.index.v1+json" ||
		len(index.Manifests) != 1 || index.Manifests[0].Digest != expected || index.Manifests[0].Size != size ||
		index.Manifests[0].MediaType != imageManifestMediaType {
		return errors.New("renderer exported OCI index does not select the exact original build manifest")
	}
	return nil
}

func imageProofBlobPath(digest string) string {
	return "blobs/sha256/" + strings.TrimPrefix(digest, "sha256:")
}

func decodeImageProofJSON(body []byte, target any, label string) error {
	if len(body) == 0 || int64(len(body)) > maximumImageProofBlobBytes {
		return fmt.Errorf("renderer image proof %s exceeds its small-blob boundary or is missing", label)
	}
	if err := strictjson.Validate(body, 16); err != nil {
		return fmt.Errorf("renderer image proof %s: %w", label, err)
	}
	decoder := json.NewDecoder(bytes.NewReader(body))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(target); err != nil {
		return fmt.Errorf("renderer image proof %s: %w", label, err)
	}
	return nil
}
