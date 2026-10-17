package clrsfixture

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"slices"
	"strings"
)

const generationImageJSONBytes = 64 << 10

type generationImageConfig struct {
	Image, User, WorkingDir       string
	Entrypoint, Cmd, Env, OnBuild []string
	Labels                        map[string]string
	Volumes, ExposedPorts         map[string]json.RawMessage
	Healthcheck                   *json.RawMessage
	StopTimeout                   *int
	StopSignal                    string
	Tty, OpenStdin                bool
}

type generationImageInspection struct {
	ID, Os, Architecture string
	Config               generationImageConfig
	RootFS               struct {
		Type   string
		Layers []string
	}
}

// This binds supplied original OCI metadata, not a registry identity or layer
// bytes. The caller separately verifies the loaded image and runtime isolation.
func parseGenerationRunImage(manifest, config []byte, expected GeneratorFixtureImage, runtime GeneratorRuntime) (generationImageInspection, error) {
	if !generationImageDigest(expected.ManifestDigest) || !generationImageDigest(expected.ConfigDigest) ||
		!generationImageDigest(expected.LoadedID) ||
		(expected.LoadedID != expected.ManifestDigest && expected.LoadedID != expected.ConfigDigest) {
		return generationImageInspection{}, errors.New("generator image needs exact independent manifest/config digests and a matching loaded ID")
	}
	if len(manifest) < 1 || len(manifest) > generationImageJSONBytes || len(config) < 1 || len(config) > generationImageJSONBytes {
		return generationImageInspection{}, errors.New("generator OCI manifest/config exceeds its 64 KiB byte boundary")
	}
	if "sha256:"+rawSHA256(manifest) != expected.ManifestDigest || "sha256:"+rawSHA256(config) != expected.ConfigDigest {
		return generationImageInspection{}, errors.New("generator original manifest/config bytes differ from supplied digests")
	}
	layers, err := generationManifestConfig(manifest, config, expected.ConfigDigest)
	if err != nil {
		return generationImageInspection{}, err
	}
	result, err := generationConfigInspection(config, runtime)
	if err != nil {
		return generationImageInspection{}, err
	}
	if len(result.RootFS.Layers) != layers {
		return generationImageInspection{}, errors.New("generator manifest layers and config diff IDs have different counts")
	}
	result.ID = expected.LoadedID
	return result, nil
}

func generationManifestConfig(body, config []byte, digest string) (int, error) {
	object, err := generationImageObject(body, "schemaVersion mediaType config layers", "annotations")
	if err != nil {
		return 0, err
	}
	var schema int
	if err := json.Unmarshal(object["schemaVersion"], &schema); err != nil || schema != 2 ||
		jsonString(object, "mediaType") != "application/vnd.oci.image.manifest.v1+json" {
		return 0, errors.New("generator requires a schema-2 OCI image manifest")
	}
	descriptor, err := generationImageObject(object["config"], "mediaType digest size", "annotations")
	if err != nil {
		return 0, err
	}
	var size int64
	if err := json.Unmarshal(descriptor["size"], &size); err != nil || size != int64(len(config)) ||
		jsonString(descriptor, "mediaType") != "application/vnd.oci.image.config.v1+json" ||
		jsonString(descriptor, "digest") != digest {
		return 0, errors.New("generator original manifest does not bind the supplied config bytes")
	}
	var layers []json.RawMessage
	if err := json.Unmarshal(object["layers"], &layers); err != nil || len(layers) < 1 || len(layers) > 128 {
		return 0, errors.New("generator manifest requires 1 to 128 layer descriptors")
	}
	for _, layer := range layers {
		if err := generationLayerDescriptor(layer); err != nil {
			return 0, err
		}
	}
	return len(layers), nil
}

func generationLayerDescriptor(body []byte) error {
	object, err := generationImageObject(body, "mediaType digest size", "annotations")
	if err != nil {
		return err
	}
	var size int64
	media := jsonString(object, "mediaType")
	if err := json.Unmarshal(object["size"], &size); err != nil || size <= 0 ||
		!generationImageDigest(jsonString(object, "digest")) ||
		!slices.Contains([]string{"application/vnd.oci.image.layer.v1.tar", "application/vnd.oci.image.layer.v1.tar+gzip", "application/vnd.oci.image.layer.v1.tar+zstd"}, media) {
		return errors.New("generator manifest has an invalid OCI layer descriptor")
	}
	return nil
}

func generationConfigInspection(body []byte, runtime GeneratorRuntime) (generationImageInspection, error) {
	object, err := generationImageObject(body, "architecture os config rootfs", "created author history variant os.version os.features")
	if err != nil {
		return generationImageInspection{}, err
	}
	if jsonString(object, "architecture") != "amd64" || jsonString(object, "os") != "linux" {
		return generationImageInspection{}, errors.New("generator image platform must be linux/amd64")
	}
	if _, err := generationImageObject(object["config"], "User WorkingDir Entrypoint Env", "Image Cmd OnBuild Labels Volumes ExposedPorts Healthcheck StopTimeout StopSignal Tty OpenStdin"); err != nil {
		return generationImageInspection{}, err
	}
	var result generationImageInspection
	if err := json.Unmarshal(object["config"], &result.Config); err != nil {
		return generationImageInspection{}, fmt.Errorf("decode generator image runtime config: %w", err)
	}
	if err := generationImageRuntime(result.Config, runtime); err != nil {
		return generationImageInspection{}, err
	}
	rootfs, err := generationImageObject(object["rootfs"], "type diff_ids", "")
	if err != nil {
		return generationImageInspection{}, err
	}
	if err := json.Unmarshal(rootfs["diff_ids"], &result.RootFS.Layers); err != nil ||
		jsonString(rootfs, "type") != "layers" || len(result.RootFS.Layers) < 1 || len(result.RootFS.Layers) > 128 {
		return generationImageInspection{}, errors.New("generator config requires layers rootfs and 1 to 128 diff IDs")
	}
	for _, digest := range result.RootFS.Layers {
		if !generationImageDigest(digest) {
			return generationImageInspection{}, errors.New("generator config contains an invalid diff ID")
		}
	}
	result.Os, result.Architecture, result.RootFS.Type = "linux", "amd64", "layers"
	return result, nil
}

func generationImageRuntime(config generationImageConfig, runtime GeneratorRuntime) error {
	if runtime.UID < 1 || runtime.GID < 1 || len(runtime.Entrypoint) < 1 || runtime.WorkingDirectory == "" ||
		config.User != fmt.Sprintf("%d:%d", runtime.UID, runtime.GID) || config.WorkingDir != runtime.WorkingDirectory ||
		!slices.Equal(config.Entrypoint, runtime.Entrypoint) {
		return errors.New("generator image user, working directory or entrypoint differs from runtime authority")
	}
	if config.Image != "" || config.Tty || config.OpenStdin || len(config.Cmd)+len(config.OnBuild)+len(config.Labels)+len(config.Volumes)+len(config.ExposedPorts) != 0 ||
		config.Healthcheck != nil || config.StopTimeout != nil || (config.StopSignal != "" && config.StopSignal != "SIGTERM") {
		return errors.New("generator image has unexpected inherited execution configuration")
	}
	actual, err := generationImageEnvironment(config.Env)
	if err != nil {
		return err
	}
	required, err := generationImageEnvironment(runtime.Environment)
	if err != nil {
		return err
	}
	for key, value := range required {
		if found, exists := actual[key]; !exists || found != value {
			return errors.New("generator image environment differs from runtime authority")
		}
	}
	return nil
}

func generationImageEnvironment(entries []string) (map[string]string, error) {
	if len(entries) < 1 || len(entries) > 128 {
		return nil, errors.New("generator environment requires 1 to 128 entries")
	}
	result := make(map[string]string, len(entries))
	for _, entry := range entries {
		key, value, found := strings.Cut(entry, "=")
		if !found || key == "" || strings.ContainsRune(entry, 0) {
			return nil, errors.New("generator environment contains an invalid entry")
		}
		if _, exists := result[key]; exists {
			return nil, errors.New("generator environment repeats a variable name")
		}
		result[key] = value
	}
	return result, nil
}

func generationImageObject(body []byte, required, optional string) (map[string]json.RawMessage, error) {
	var object map[string]json.RawMessage
	if err := decodeStrict(body, 12, &object); err != nil {
		return nil, err
	}
	if object == nil {
		return nil, errors.New("generator OCI object must not be null")
	}
	allowed := make(map[string]bool)
	for _, name := range strings.Fields(required) {
		if _, exists := object[name]; !exists {
			return nil, fmt.Errorf("generator OCI object lacks exact field %s", name)
		}
		allowed[name] = true
	}
	for _, name := range strings.Fields(optional) {
		allowed[name] = true
	}
	for name, value := range object {
		if !allowed[name] || bytes.Equal(bytes.TrimSpace(value), []byte("null")) {
			return nil, errors.New("generator OCI object contains unknown, case-aliased or null fields")
		}
	}
	return object, nil
}

func jsonString(object map[string]json.RawMessage, key string) string {
	var value string
	if err := json.Unmarshal(object[key], &value); err != nil {
		return ""
	}
	return value
}

func generationImageDigest(value string) bool {
	return strings.HasPrefix(value, "sha256:") && lowerHex(strings.TrimPrefix(value, "sha256:"), 64)
}
