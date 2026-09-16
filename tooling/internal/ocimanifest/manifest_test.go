package ocimanifest

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func validOptions() Options {
	return Options{
		Repository:       "lusoris/20-watts-was-enough",
		Tag:              "v0.3.0",
		Commit:           strings.Repeat("a", 40),
		ToolingDigest:    "sha256:" + strings.Repeat("1", 64),
		Fixture007Digest: "sha256:" + strings.Repeat("2", 64),
		Fixture019Digest: "sha256:" + strings.Repeat("3", 64),
	}
}

func validRelease() Release {
	options := validOptions()
	return Release{Repository: options.Repository, Tag: options.Tag, Commit: options.Commit}
}

func TestWriteAndLoadCanonicalManifest(t *testing.T) {
	t.Parallel()
	options := validOptions()
	path := filepath.Join(t.TempDir(), "oci-images.json")
	if err := Write(path, options); err != nil {
		t.Fatal(err)
	}
	body, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	manifest, err := Load(path, validRelease())
	if err != nil {
		t.Fatal(err)
	}
	if manifest.ResultAuthority != ResultAuthority || manifest.Platform != Platform {
		t.Fatalf("manifest authority/platform = %q/%q", manifest.ResultAuthority, manifest.Platform)
	}
	if len(manifest.Images) != 3 || !strings.HasSuffix(string(body), "\n") {
		t.Fatalf("manifest image count/newline = %d/%t", len(manifest.Images), strings.HasSuffix(string(body), "\n"))
	}
	for index := 1; index < len(manifest.Images); index++ {
		if manifest.Images[index-1] >= manifest.Images[index] {
			t.Fatalf("manifest images are not strictly sorted: %v", manifest.Images)
		}
	}
}

func TestWriteIsDeterministicAndRefusesReplacement(t *testing.T) {
	t.Parallel()
	options := validOptions()
	first := filepath.Join(t.TempDir(), "oci-images.json")
	second := filepath.Join(t.TempDir(), "oci-images.json")
	if err := Write(first, options); err != nil {
		t.Fatal(err)
	}
	if err := Write(second, options); err != nil {
		t.Fatal(err)
	}
	left, _ := os.ReadFile(first)
	right, _ := os.ReadFile(second)
	if string(left) != string(right) {
		t.Fatal("fixed release identity produced different manifest bytes")
	}
	if err := Write(first, options); err == nil {
		t.Fatal("Write replaced an existing manifest")
	}
}

func TestWriteRejectsSymlinkedOutputDirectory(t *testing.T) {
	t.Parallel()
	realDirectory := t.TempDir()
	linkRoot := t.TempDir()
	linkedDirectory := filepath.Join(linkRoot, "assets")
	if err := os.Symlink(realDirectory, linkedDirectory); err != nil {
		t.Fatal(err)
	}
	if err := Write(filepath.Join(linkedDirectory, "oci-images.json"), validOptions()); err == nil {
		t.Fatal("Write accepted an output directory reached through a symlink")
	}
}

func TestLoadRejectsAmbiguousOrNoncanonicalJSON(t *testing.T) {
	t.Parallel()
	options := validOptions()
	valid, err := New(options)
	if err != nil {
		t.Fatal(err)
	}
	body, err := Marshal(valid)
	if err != nil {
		t.Fatal(err)
	}
	cases := map[string][]byte{
		"duplicate":  []byte(`{"schema":1,"schema":1}`),
		"trailing":   append(append([]byte{}, body...), []byte(` {}`)...),
		"unknown":    []byte(strings.Replace(string(body), `"schema": 1,`, "\"schema\": 1,\n  \"unknown\": true,", 1)),
		"formatting": []byte(strings.ReplaceAll(string(body), "  ", "    ")),
	}
	for name, candidate := range cases {
		name, candidate := name, candidate
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			path := filepath.Join(t.TempDir(), "oci-images.json")
			if err := os.WriteFile(path, candidate, 0o600); err != nil {
				t.Fatal(err)
			}
			if _, err := Load(path, validRelease()); err == nil {
				t.Fatal("Load accepted ambiguous or noncanonical JSON")
			}
		})
	}
}

func TestLoadRejectsSourceDigestOrderAndAuthorityTampering(t *testing.T) {
	t.Parallel()
	options := validOptions()
	manifest, err := New(options)
	if err != nil {
		t.Fatal(err)
	}
	cases := map[string]func(*Manifest){
		"source": func(candidate *Manifest) { candidate.Source.Commit = strings.Repeat("b", 40) },
		"digest": func(candidate *Manifest) {
			candidate.Images[0] = strings.TrimSuffix(candidate.Images[0], "1")
		},
		"order": func(candidate *Manifest) {
			candidate.Images[0], candidate.Images[1] = candidate.Images[1], candidate.Images[0]
		},
		"authority": func(candidate *Manifest) { candidate.ResultAuthority = "RESULT" },
	}
	for name, mutate := range cases {
		name, mutate := name, mutate
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			candidate := manifest
			candidate.Images = append([]string(nil), manifest.Images...)
			mutate(&candidate)
			body, err := json.MarshalIndent(candidate, "", "  ")
			if err != nil {
				t.Fatal(err)
			}
			path := filepath.Join(t.TempDir(), "oci-images.json")
			if err := os.WriteFile(path, append(body, '\n'), 0o600); err != nil {
				t.Fatal(err)
			}
			if _, err := Load(path, validRelease()); err == nil {
				t.Fatal("Load accepted tampered manifest")
			}
		})
	}
}

func TestLoadRejectsSymlinkAndOversize(t *testing.T) {
	t.Parallel()
	directory := t.TempDir()
	target := filepath.Join(directory, "target")
	if err := os.WriteFile(target, []byte("{}\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	link := filepath.Join(directory, "oci-images.json")
	if err := os.Symlink(target, link); err != nil {
		t.Fatal(err)
	}
	if _, err := Load(link, validRelease()); err == nil {
		t.Fatal("Load accepted a symlink")
	}
	validDirectory := t.TempDir()
	validPath := filepath.Join(validDirectory, "oci-images.json")
	if err := Write(validPath, validOptions()); err != nil {
		t.Fatal(err)
	}
	linkedDirectory := filepath.Join(directory, "linked-assets")
	if err := os.Symlink(validDirectory, linkedDirectory); err != nil {
		t.Fatal(err)
	}
	if _, err := Load(filepath.Join(linkedDirectory, "oci-images.json"), validRelease()); err == nil {
		t.Fatal("Load accepted a manifest reached through a symlinked directory")
	}
	oversize := filepath.Join(directory, "oversize.json")
	if err := os.WriteFile(oversize, make([]byte, maximumBytes+1), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := Load(oversize, validRelease()); err == nil {
		t.Fatal("Load accepted an oversized manifest")
	}
}
