package clrsfixture

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"os"
	"strings"
)

const generatorOCIManifestType = "application/vnd.oci.image.manifest.v1+json"
const generatorOCIConfigType = "application/vnd.oci.image.config.v1+json"
const generatorOCITarType = "application/vnd.oci.image.layer.v1.tar"

func readGeneratorOCIJSON(ctx context.Context, file *os.File, member generatorOCIMember, maximum int64) ([]byte, error) {
	if member.size < 1 || member.size > maximum {
		return nil, errors.New("OCI JSON member is missing or exceeds its byte boundary")
	}
	body, err := readBounded(generatorOCIReader{ctx, io.NewSectionReader(file, member.offset, member.size)}, maximum)
	if err != nil || int64(len(body)) != member.size || "sha256:"+rawSHA256(body) != member.digest {
		return nil, errors.Join(err, errors.New("OCI JSON section differs from scanned bytes"))
	}
	return body, ctx.Err()
}

func inspectGeneratorOCIMetadata(ctx context.Context, file *os.File, members map[string]generatorOCIMember, runtime GeneratorRuntime, limits GeneratorOCILimits) (GeneratorOCIReport, error) {
	report := newGeneratorOCIReport(limits)
	manifest, err := generatorOCIIndex(ctx, file, members, limits)
	if err != nil {
		return report, err
	}
	referenced := make(map[string]GeneratorOCIDescriptor)
	member, err := locateGeneratorOCI(members, referenced, manifest)
	if err != nil {
		return report, err
	}
	raw, err := readGeneratorOCIJSON(ctx, file, member, limits.JSONBytes)
	if err != nil {
		return report, err
	}
	config, layers, err := generatorOCIManifest(raw, limits)
	if err != nil {
		return report, err
	}
	member, err = locateGeneratorOCI(members, referenced, config)
	if err != nil {
		return report, err
	}
	configRaw, err := readGeneratorOCIJSON(ctx, file, member, limits.JSONBytes)
	if err != nil {
		return report, err
	}
	count, err := generationManifestConfig(raw, configRaw, config.Digest)
	if err != nil || count != len(layers) {
		return report, errors.Join(err, errors.New("OCI manifest/config link differs from the CLRS metadata profile"))
	}
	inspection, err := generatorOCIConfigInspection(configRaw, runtime)
	if err != nil || len(inspection.RootFS.Layers) != len(layers) {
		return report, errors.Join(err, errors.New("OCI config or ordered diff-ID count differs from the CLRS profile"))
	}
	report.Manifest, report.Config = &manifest, &config
	report.ManifestBytes, report.ConfigBytes = raw, configRaw
	for index, descriptor := range layers {
		member, err := locateGeneratorOCI(members, referenced, descriptor)
		if err != nil {
			return report, err
		}
		layer, err := inspectGeneratorOCILayer(ctx, file, member, descriptor, inspection.RootFS.Layers[index], limits.ExpandedBytes-report.ExpandedBytes)
		if err != nil {
			return report, err
		}
		report.Layers = append(report.Layers, layer)
		report.ExpandedBytes += layer.ExpandedBytes
	}
	for name := range members {
		if strings.HasPrefix(name, "blobs/sha256/") {
			if _, exists := referenced["sha256:"+strings.TrimPrefix(name, "blobs/sha256/")]; !exists {
				return report, errors.New("OCI archive contains an unreferenced blob outside its single-image closure")
			}
		}
	}
	return report, ctx.Err()
}

func generatorOCIConfigInspection(body []byte, runtime GeneratorRuntime) (generationImageInspection, error) {
	inspection, err := generationConfigInspection(body, runtime)
	if err != nil {
		return inspection, err
	}
	// The shared runtime check validates the complete object first. This narrower
	// archive profile also binds an explicit config variant to the index policy.
	var object map[string]json.RawMessage
	if err := json.Unmarshal(body, &object); err != nil {
		return generationImageInspection{}, err
	}
	if _, exists := object["variant"]; exists && jsonString(object, "variant") != "v1" {
		return generationImageInspection{}, errors.New("OCI config platform variant must be amd64 v1 when specified")
	}
	return inspection, nil
}

func generatorOCIIndex(ctx context.Context, file *os.File, members map[string]generatorOCIMember, limits GeneratorOCILimits) (GeneratorOCIDescriptor, error) {
	var zero GeneratorOCIDescriptor
	body, err := readGeneratorOCIJSON(ctx, file, members["oci-layout"], limits.JSONBytes)
	if err != nil {
		return zero, err
	}
	layout, err := generationImageObject(body, "imageLayoutVersion", "")
	if err != nil || jsonString(layout, "imageLayoutVersion") != "1.0.0" {
		return zero, errors.Join(err, errors.New("OCI layout requires the closed version-1.0.0 marker"))
	}
	body, err = readGeneratorOCIJSON(ctx, file, members["index.json"], limits.JSONBytes)
	if err != nil {
		return zero, err
	}
	index, err := generationImageObject(body, "schemaVersion manifests", "mediaType annotations")
	if err != nil {
		return zero, err
	}
	var schema int
	var manifests []json.RawMessage
	if json.Unmarshal(index["schemaVersion"], &schema) != nil || schema != 2 || json.Unmarshal(index["manifests"], &manifests) != nil || len(manifests) != 1 {
		return zero, errors.New("OCI index requires schema 2 and exactly one manifest")
	}
	if _, exists := index["mediaType"]; exists && jsonString(index, "mediaType") != "application/vnd.oci.image.index.v1+json" {
		return zero, errors.New("OCI index has an unsupported media type")
	}
	if err := generatorOCIAnnotations(index); err != nil {
		return zero, err
	}
	descriptor, err := parseGeneratorOCIDescriptor(manifests[0], true, limits.ArchiveBytes)
	if err != nil || descriptor.MediaType != generatorOCIManifestType {
		return zero, errors.Join(err, errors.New("OCI index must select an image manifest, not a nested index or artifact"))
	}
	return descriptor, nil
}

func generatorOCIManifest(body []byte, limits GeneratorOCILimits) (GeneratorOCIDescriptor, []GeneratorOCIDescriptor, error) {
	var zero GeneratorOCIDescriptor
	object, err := generationImageObject(body, "schemaVersion mediaType config layers", "annotations")
	if err != nil {
		return zero, nil, err
	}
	var schema int
	if json.Unmarshal(object["schemaVersion"], &schema) != nil || schema != 2 || jsonString(object, "mediaType") != generatorOCIManifestType {
		return zero, nil, errors.New("OCI manifest must use the schema-2 image media type")
	}
	if err := generatorOCIAnnotations(object); err != nil {
		return zero, nil, err
	}
	config, err := parseGeneratorOCIDescriptor(object["config"], false, limits.JSONBytes)
	if err != nil || config.MediaType != generatorOCIConfigType {
		return zero, nil, errors.Join(err, errors.New("OCI manifest requires an image configuration descriptor"))
	}
	var rawLayers []json.RawMessage
	if json.Unmarshal(object["layers"], &rawLayers) != nil || len(rawLayers) < 1 || len(rawLayers) > limits.Layers {
		return zero, nil, errors.New("OCI layer descriptor inventory exceeds its bounds")
	}
	layers := make([]GeneratorOCIDescriptor, 0, len(rawLayers))
	for _, raw := range rawLayers {
		layer, err := parseGeneratorOCIDescriptor(raw, false, limits.ArchiveBytes)
		if err != nil || (layer.MediaType != generatorOCITarType && layer.MediaType != generatorOCITarType+"+gzip") {
			return zero, nil, errors.Join(err, errors.New("OCI candidate layer encoding must be uncompressed tar or gzip"))
		}
		layers = append(layers, layer)
	}
	return config, layers, nil
}

func parseGeneratorOCIDescriptor(body []byte, allowPlatform bool, maximum int64) (GeneratorOCIDescriptor, error) {
	var result GeneratorOCIDescriptor
	optional := "annotations"
	if allowPlatform {
		optional += " platform"
	}
	object, err := generationImageObject(body, "mediaType digest size", optional)
	if err != nil {
		return result, err
	}
	result.MediaType, result.Digest = jsonString(object, "mediaType"), jsonString(object, "digest")
	if json.Unmarshal(object["size"], &result.Bytes) != nil || result.Bytes < 1 || result.Bytes > maximum || !generationImageDigest(result.Digest) {
		return result, errors.New("OCI descriptor requires a bounded positive size and lowercase sha256 identity")
	}
	if err := generatorOCIAnnotations(object); err != nil {
		return result, err
	}
	if body, exists := object["platform"]; exists {
		platform, err := generationImageObject(body, "os architecture", "variant")
		if err != nil || jsonString(platform, "os") != "linux" || jsonString(platform, "architecture") != "amd64" {
			return result, errors.Join(err, errors.New("OCI descriptor platform must be linux/amd64"))
		}
		if _, exists := platform["variant"]; exists && jsonString(platform, "variant") != "v1" {
			return result, errors.New("OCI descriptor platform variant must be amd64 v1 when specified")
		}
	}
	return result, nil
}

func generatorOCIAnnotations(object map[string]json.RawMessage) error {
	if body, exists := object["annotations"]; exists {
		var annotations map[string]json.RawMessage
		if json.Unmarshal(body, &annotations) != nil || annotations == nil || len(annotations) > 256 {
			return errors.New("OCI annotations require at most 256 string pairs")
		}
		for key, raw := range annotations {
			var value string
			if json.Unmarshal(raw, &value) != nil || bytes.Equal(bytes.TrimSpace(raw), []byte("null")) || key == "" || len(key) > 256 || len(value) > 4096 || strings.ContainsAny(key+value, "\x00") {
				return errors.New("OCI annotation exceeds its text bound")
			}
		}
	}
	return nil
}

func locateGeneratorOCI(members map[string]generatorOCIMember, referenced map[string]GeneratorOCIDescriptor, descriptor GeneratorOCIDescriptor) (generatorOCIMember, error) {
	member, exists := members["blobs/sha256/"+strings.TrimPrefix(descriptor.Digest, "sha256:")]
	if !exists || member.size != descriptor.Bytes || member.digest != descriptor.Digest {
		return member, errors.New("OCI descriptor differs from its retained archive blob")
	}
	if previous, exists := referenced[descriptor.Digest]; exists && previous != descriptor {
		return member, errors.New("OCI reused blob has conflicting descriptor interpretations")
	}
	referenced[descriptor.Digest] = descriptor
	return member, nil
}
