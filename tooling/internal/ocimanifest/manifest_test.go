package ocimanifest

import (
	"encoding/json"
	"errors"
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

func TestReleaseTagGrammar(t *testing.T) {
	t.Parallel()
	for _, test := range []struct {
		tag   string
		valid bool
	}{
		{"v0.0.0", true},
		{"v0.5.0", true},
		{"v12.34.56", true},
		{"v0.0.0-rc.0", true},
		{"v0.5.0-rc.1", true},
		{"v0.5.0-rc.10", true},
		{"v999999999999999999999.0.0-rc.999999999999999999999", true},
		{"", false},
		{"0.5.0", false},
		{"v0.5.0-rc", false},
		{"v0.5.0-rc.01", false},
		{"v0.5.0-rc.1.2", false},
		{"v0.5.0-beta.1", false},
		{"v0.5.0-RC.1", false},
		{"v05.0.0", false},
		{"v0.05.0", false},
		{"v0.5.00", false},
		{"v0.5.0+meta", false},
		{"v0.5.0-rc.1-x", false},
		{"v0.5.0-rc.-1", false},
		{"v0.5.0-rc.", false},
		{"v0.5.0\n", false},
		{" v0.5.0", false},
		{"v0.5.0 ", false},
	} {
		t.Run(test.tag, func(t *testing.T) {
			t.Parallel()
			options := validOptions()
			options.Tag = test.tag
			_, err := New(options)
			if (err == nil) != test.valid {
				t.Fatalf("tag %q: error = %v, want valid = %t", test.tag, err, test.valid)
			}
		})
	}
}

type manifestTestCloser struct {
	err    error
	closed bool
}

func (closer *manifestTestCloser) Close() error {
	closer.closed = true
	return closer.err
}

func TestCloseManifestFileRemovesOutputOnCloseFailure(t *testing.T) {
	t.Parallel()
	path := filepath.Join(t.TempDir(), "manifest.json")
	if err := os.WriteFile(path, []byte("incomplete"), 0o600); err != nil {
		t.Fatal(err)
	}
	primary := errors.New("write failed")
	closeError := errors.New("close failed")
	closer := &manifestTestCloser{err: closeError}
	err := closeManifestFile(closer, path, primary)
	if !errors.Is(err, primary) || !errors.Is(err, closeError) || !strings.Contains(err.Error(), "close OCI image manifest "+path) {
		t.Fatalf("cleanup lost error context or causes: %v", err)
	}
	if _, statError := os.Stat(path); !errors.Is(statError, os.ErrNotExist) || !closer.closed {
		t.Fatalf("cleanup closed=%v, output stat=%v", closer.closed, statError)
	}
}

func TestCloseManifestFileReportsRemovalFailure(t *testing.T) {
	t.Parallel()
	path := t.TempDir()
	if err := os.WriteFile(filepath.Join(path, "retained"), []byte("data"), 0o600); err != nil {
		t.Fatal(err)
	}
	primary := errors.New("write failed")
	closer := &manifestTestCloser{}
	err := closeManifestFile(closer, path, primary)
	var pathError *os.PathError
	if !errors.Is(err, primary) || !errors.As(err, &pathError) || !strings.Contains(err.Error(), "remove incomplete OCI image manifest "+path) {
		t.Fatalf("cleanup lost removal failure: %v", err)
	}
	if !closer.closed || pathError.Path != path {
		t.Fatalf("cleanup closed=%v, failure path=%q", closer.closed, pathError.Path)
	}
}
