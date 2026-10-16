package clrsfixture

import (
	"bytes"
	"encoding/json"
	"reflect"
	"strings"
	"testing"
)

func TestJSONString(t *testing.T) {
	t.Parallel()
	tests := []struct {
		name string
		raw  json.RawMessage
		want string
	}{
		{"string", json.RawMessage(`"image-id"`), "image-id"},
		{"escaped string", json.RawMessage(`"line\nnext"`), "line\nnext"},
		{"empty string", json.RawMessage(`""`), ""},
		{"missing key", nil, ""},
		{"null", json.RawMessage(`null`), ""},
		{"wrong type", json.RawMessage(`42`), ""},
		{"malformed", json.RawMessage(`"unfinished`), ""},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			object := map[string]json.RawMessage{}
			if test.raw != nil {
				object["key"] = test.raw
			}
			if got := jsonString(object, "key"); got != test.want {
				t.Fatalf("jsonString() = %q, want %q", got, test.want)
			}
		})
	}
}

func generationImageFixture(t *testing.T) (map[string]any, map[string]any, GeneratorRuntime) {
	t.Helper()
	runtime := GeneratorRuntime{UID: 65532, GID: 65532, WorkingDirectory: "/work",
		Entrypoint:  []string{"/opt/venv/bin/python", "-m", "clrs._src.clrs_text.generate_clrs_text"},
		Environment: []string{"JAX_PLATFORMS=cpu", "CUDA_VISIBLE_DEVICES="}}
	config := map[string]any{"architecture": "amd64", "os": "linux", "config": map[string]any{
		"User": "65532:65532", "WorkingDir": "/work", "Entrypoint": runtime.Entrypoint,
		"Env": append([]string{"PATH=/opt/venv/bin:/usr/bin"}, runtime.Environment...),
	}, "rootfs": map[string]any{"type": "layers", "diff_ids": []string{"sha256:" + strings.Repeat("1", 64)}}}
	manifest := map[string]any{"schemaVersion": 2, "mediaType": "application/vnd.oci.image.manifest.v1+json",
		"config": map[string]any{"mediaType": "application/vnd.oci.image.config.v1+json"},
		"layers": []any{map[string]any{"mediaType": "application/vnd.oci.image.layer.v1.tar+gzip", "digest": "sha256:" + strings.Repeat("2", 64), "size": 1}}}
	return manifest, config, runtime
}

func generationImageJSON(t *testing.T, value any) []byte {
	t.Helper()
	body, err := json.Marshal(value)
	if err != nil {
		t.Fatal(err)
	}
	return body
}

func generationImagePair(t *testing.T, manifest map[string]any, config []byte) ([]byte, GeneratorFixtureImage) {
	t.Helper()
	digest := "sha256:" + rawSHA256(config)
	descriptor := manifest["config"].(map[string]any)
	descriptor["digest"], descriptor["size"] = digest, len(config)
	body := generationImageJSON(t, manifest)
	return body, GeneratorFixtureImage{ManifestDigest: "sha256:" + rawSHA256(body), ConfigDigest: digest, LoadedID: digest}
}

func TestGenerationImageBindsOriginalBytesAndDistinctExecutionIdentities(t *testing.T) {
	manifest, config, runtime := generationImageFixture(t)
	body := generationImageJSON(t, config)
	raw, identity := generationImagePair(t, manifest, body)
	if identity.ManifestDigest == identity.ConfigDigest {
		t.Fatal("fixture must exercise distinct manifest/config identities")
	}
	for _, loaded := range []string{identity.ManifestDigest, identity.ConfigDigest} {
		identity.LoadedID = loaded
		got, err := parseGenerationRunImage(raw, body, identity, runtime)
		if err != nil || got.ID != loaded || got.Os != "linux" || got.Architecture != "amd64" ||
			got.Config.User != "65532:65532" || !reflect.DeepEqual(got.Config.Entrypoint, runtime.Entrypoint) ||
			got.RootFS.Type != "layers" || !reflect.DeepEqual(got.RootFS.Layers, []string{"sha256:" + strings.Repeat("1", 64)}) {
			t.Fatalf("loaded %s: %#v, %v", loaded, got, err)
		}
	}
	// Formatting is part of the supplied original identity, not reconstructed.
	changed := append(bytes.Clone(body), '\n')
	assertGenerationImageFailure(t, raw, changed, identity, runtime)
	raw, identity = generationImagePair(t, manifest, changed)
	if _, err := parseGenerationRunImage(raw, changed, identity, runtime); err != nil {
		t.Fatalf("hash-bound non-canonical OCI JSON must remain usable: %v", err)
	}
}

func assertGenerationImageFailure(t *testing.T, manifest, config []byte, identity GeneratorFixtureImage, runtime GeneratorRuntime) {
	t.Helper()
	got, err := parseGenerationRunImage(manifest, config, identity, runtime)
	if err == nil || !reflect.DeepEqual(got, generationImageInspection{}) {
		t.Fatalf("invalid image returned %#v, %v", got, err)
	}
}

func TestGenerationImageRejectsUnboundIdentitiesAndDescriptors(t *testing.T) {
	for _, mutate := range []func(*GeneratorFixtureImage){
		func(i *GeneratorFixtureImage) { i.LoadedID = "sha256:" + strings.Repeat("f", 64) },
		func(i *GeneratorFixtureImage) { i.ConfigDigest = strings.ToUpper(i.ConfigDigest) },
		func(i *GeneratorFixtureImage) {
			i.ConfigDigest = "sha256:" + strings.ToUpper(strings.TrimPrefix(i.ConfigDigest, "sha256:"))
		},
		func(i *GeneratorFixtureImage) { i.ManifestDigest = "sha256:123" },
		func(i *GeneratorFixtureImage) { i.LoadedID = strings.TrimPrefix(i.LoadedID, "sha256:") },
		func(i *GeneratorFixtureImage) { i.ManifestDigest, i.ConfigDigest = i.ConfigDigest, i.ManifestDigest },
	} {
		manifest, config, runtime := generationImageFixture(t)
		body := generationImageJSON(t, config)
		raw, identity := generationImagePair(t, manifest, body)
		mutate(&identity)
		assertGenerationImageFailure(t, raw, body, identity, runtime)
	}
	for name, mutate := range map[string]func(map[string]any){
		"schema":            func(m map[string]any) { m["schemaVersion"] = 1 },
		"media":             func(m map[string]any) { m["mediaType"] = "application/vnd.oci.image.index.v1+json" },
		"descriptor media":  func(m map[string]any) { m["config"].(map[string]any)["mediaType"] = "text/plain" },
		"descriptor size":   func(m map[string]any) { m["config"].(map[string]any)["size"] = 1 },
		"descriptor digest": func(m map[string]any) { m["config"].(map[string]any)["digest"] = "sha256:" + strings.Repeat("9", 64) },
		"descriptor alias":  func(m map[string]any) { m["config"].(map[string]any)["Digest"] = "ignored" },
		"descriptor null":   func(m map[string]any) { m["config"] = nil },
		"empty layers":      func(m map[string]any) { m["layers"] = []any{} },
		"null layer":        func(m map[string]any) { m["layers"] = []any{nil} },
		"layer size":        func(m map[string]any) { m["layers"].([]any)[0].(map[string]any)["size"] = -1 },
		"layer alias":       func(m map[string]any) { m["layers"].([]any)[0].(map[string]any)["Digest"] = "ignored" },
		"manifest alias":    func(m map[string]any) { m["Config"] = m["config"] },
	} {
		t.Run(name, func(t *testing.T) {
			manifest, config, runtime := generationImageFixture(t)
			body := generationImageJSON(t, config)
			_, identity := generationImagePair(t, manifest, body)
			mutate(manifest)
			raw := generationImageJSON(t, manifest)
			identity.ManifestDigest = "sha256:" + rawSHA256(raw)
			assertGenerationImageFailure(t, raw, body, identity, runtime)
		})
	}
}

func TestGenerationImageRejectsHashReclosedInvalidConfig(t *testing.T) {
	for name, mutate := range map[string]func(map[string]any){
		"platform":        func(c map[string]any) { c["architecture"] = "arm64" },
		"root alias":      func(c map[string]any) { c["Config"] = c["config"] },
		"null rootfs":     func(c map[string]any) { c["rootfs"] = nil },
		"rootfs alias":    func(c map[string]any) { c["rootfs"].(map[string]any)["Type"] = "layers" },
		"invalid diff ID": func(c map[string]any) { c["rootfs"].(map[string]any)["diff_ids"] = []string{"sha256:abc"} },
		"null diff ID":    func(c map[string]any) { c["rootfs"].(map[string]any)["diff_ids"] = []any{nil} },
		"user alias":      func(c map[string]any) { c["config"].(map[string]any)["user"] = "65532:65532" },
		"root user":       func(c map[string]any) { c["config"].(map[string]any)["User"] = "0:0" },
		"workdir":         func(c map[string]any) { c["config"].(map[string]any)["WorkingDir"] = "/tmp" },
		"entrypoint":      func(c map[string]any) { c["config"].(map[string]any)["Entrypoint"] = []string{"/bin/sh"} },
		"null command":    func(c map[string]any) { c["config"].(map[string]any)["Cmd"] = nil },
		"command":         func(c map[string]any) { c["config"].(map[string]any)["Cmd"] = []string{"arbitrary"} },
		"healthcheck": func(c map[string]any) {
			c["config"].(map[string]any)["Healthcheck"] = map[string]any{"Test": []string{"CMD", "true"}}
		},
		"unknown":     func(c map[string]any) { c["config"].(map[string]any)["FutureExecution"] = true },
		"env missing": func(c map[string]any) { c["config"].(map[string]any)["Env"] = []string{"PATH=/bin"} },
		"env duplicate": func(c map[string]any) {
			c["config"].(map[string]any)["Env"] = []string{"JAX_PLATFORMS=cpu", "JAX_PLATFORMS=gpu", "CUDA_VISIBLE_DEVICES="}
		},
		"env null": func(c map[string]any) { c["config"].(map[string]any)["Env"] = []any{nil} },
	} {
		t.Run(name, func(t *testing.T) {
			manifest, config, runtime := generationImageFixture(t)
			mutate(config)
			body := generationImageJSON(t, config)
			raw, identity := generationImagePair(t, manifest, body)
			assertGenerationImageFailure(t, raw, body, identity, runtime)
		})
	}
}

func TestGenerationImageJSONAmbiguityAndBounds(t *testing.T) {
	manifest, config, runtime := generationImageFixture(t)
	valid := generationImageJSON(t, config)
	for _, body := range [][]byte{
		[]byte("null"), append(bytes.Clone(valid), []byte(" {}")...),
		bytes.Replace(valid, []byte(`"os":"linux"`), []byte(`"os":"linux","os":"linux"`), 1),
		bytes.Replace(valid, []byte(`"User":"65532:65532"`), []byte(`"User":"65532:65532","User":"65532:65532"`), 1),
		bytes.Repeat([]byte(" "), generationImageJSONBytes+1),
	} {
		raw, identity := generationImagePair(t, manifest, body)
		assertGenerationImageFailure(t, raw, body, identity, runtime)
	}
	maximum := append(bytes.Clone(valid), bytes.Repeat([]byte(" "), generationImageJSONBytes-len(valid))...)
	raw, identity := generationImagePair(t, manifest, maximum)
	if _, err := parseGenerationRunImage(raw, maximum, identity, runtime); err != nil {
		t.Fatalf("exact 64 KiB config rejected: %v", err)
	}
	oversize := append(bytes.Clone(maximum), ' ')
	raw, identity = generationImagePair(t, manifest, oversize)
	assertGenerationImageFailure(t, raw, oversize, identity, runtime)
	raw, identity = generationImagePair(t, manifest, valid)
	raw = append(raw, bytes.Repeat([]byte(" "), generationImageJSONBytes-len(raw))...)
	identity.ManifestDigest = "sha256:" + rawSHA256(raw)
	if _, err := parseGenerationRunImage(raw, valid, identity, runtime); err != nil {
		t.Fatalf("exact 64 KiB manifest rejected: %v", err)
	}
	raw = append(raw, ' ')
	identity.ManifestDigest = "sha256:" + rawSHA256(raw)
	assertGenerationImageFailure(t, raw, valid, identity, runtime)
}

func TestGenerationImageLayerCountBounds(t *testing.T) {
	for _, count := range []int{0, 128, 129} {
		manifest, config, runtime := generationImageFixture(t)
		layers := make([]any, count)
		diffs := make([]string, count)
		for index := range layers {
			layers[index] = manifest["layers"].([]any)[0]
			diffs[index] = "sha256:" + strings.Repeat("1", 64)
		}
		manifest["layers"], config["rootfs"].(map[string]any)["diff_ids"] = layers, diffs
		body := generationImageJSON(t, config)
		raw, identity := generationImagePair(t, manifest, body)
		if count == 128 {
			if got, err := parseGenerationRunImage(raw, body, identity, runtime); err != nil || len(got.RootFS.Layers) != 128 {
				t.Fatalf("128-layer boundary: got %d, %v", len(got.RootFS.Layers), err)
			}
		} else {
			assertGenerationImageFailure(t, raw, body, identity, runtime)
		}
	}
}

func TestGenerationImageRejectsMissingAndNullConsumedFields(t *testing.T) {
	for _, name := range []string{"User", "WorkingDir", "Entrypoint", "Env", "Tty", "OpenStdin", "Labels", "Volumes", "StopSignal"} {
		t.Run(name, func(t *testing.T) {
			manifest, config, runtime := generationImageFixture(t)
			config["config"].(map[string]any)[name] = nil
			body := generationImageJSON(t, config)
			raw, identity := generationImagePair(t, manifest, body)
			assertGenerationImageFailure(t, raw, body, identity, runtime)
		})
	}
	manifest, config, runtime := generationImageFixture(t)
	delete(config["config"].(map[string]any), "User")
	body := generationImageJSON(t, config)
	raw, identity := generationImagePair(t, manifest, body)
	assertGenerationImageFailure(t, raw, body, identity, runtime)
	manifest, config, runtime = generationImageFixture(t)
	config["rootfs"].(map[string]any)["diff_ids"] = []string{"sha256:" + strings.Repeat("1", 64), "sha256:" + strings.Repeat("2", 64)}
	body = generationImageJSON(t, config)
	raw, identity = generationImagePair(t, manifest, body)
	assertGenerationImageFailure(t, raw, body, identity, runtime)
}
