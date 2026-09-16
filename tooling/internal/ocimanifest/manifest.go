// Package ocimanifest owns the immutable release record for published OCI images.
package ocimanifest

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"

	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/strictjson"
)

const (
	Schema          = 1
	Contract        = "release.oci-images.v1"
	Platform        = "linux/amd64"
	ResultAuthority = "NO_RESULT"
	maximumBytes    = 64 << 10
)

var (
	tagPattern        = regexp.MustCompile(`^v(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$`)
	commitPattern     = regexp.MustCompile(`^[0-9a-f]{40}$`)
	digestPattern     = regexp.MustCompile(`^sha256:[0-9a-f]{64}$`)
	repositoryPattern = regexp.MustCompile(`^[a-z0-9](?:[a-z0-9._-]{0,99}[a-z0-9])?/[a-z0-9](?:[a-z0-9._-]{0,99}[a-z0-9])?$`)
)

// Source binds the image identities to the exact Git release input.
type Source struct {
	Tag    string `json:"tag"`
	Commit string `json:"commit"`
}

// Manifest is the one closed, deterministic release-image authority.
type Manifest struct {
	Schema          int      `json:"schema"`
	Contract        string   `json:"contract"`
	Source          Source   `json:"source"`
	Platform        string   `json:"platform"`
	ResultAuthority string   `json:"result_authority"`
	Images          []string `json:"images"`
}

// Options supplies the source and three exact image identities.
type Options struct {
	Repository       string
	Tag              string
	Commit           string
	ToolingDigest    string
	Fixture007Digest string
	Fixture019Digest string
}

// Release identifies the Git repository source that a persisted manifest must match.
type Release struct {
	Repository string
	Tag        string
	Commit     string
}

// New constructs and validates the canonical release-image manifest.
func New(options Options) (Manifest, error) {
	if err := validateOptions(options); err != nil {
		return Manifest{}, err
	}
	base := "ghcr.io/" + options.Repository
	images := []string{
		base + "-20w@" + options.ToolingDigest,
		base + "-fixture-007@" + options.Fixture007Digest,
		base + "-fixture-019@" + options.Fixture019Digest,
	}
	sort.Strings(images)
	manifest := Manifest{
		Schema:          Schema,
		Contract:        Contract,
		Source:          Source{Tag: options.Tag, Commit: options.Commit},
		Platform:        Platform,
		ResultAuthority: ResultAuthority,
		Images:          images,
	}
	if err := validateManifest(manifest, Release{
		Repository: options.Repository,
		Tag:        options.Tag,
		Commit:     options.Commit,
	}); err != nil {
		return Manifest{}, err
	}
	return manifest, nil
}

// Marshal returns the unique canonical JSON representation.
func Marshal(manifest Manifest) ([]byte, error) {
	body, err := json.MarshalIndent(manifest, "", "  ")
	if err != nil {
		return nil, fmt.Errorf("encode OCI image manifest: %w", err)
	}
	return append(body, '\n'), nil
}

// Write creates a canonical manifest without replacing any existing path.
func Write(path string, options Options) error {
	manifest, err := New(options)
	if err != nil {
		return err
	}
	body, err := Marshal(manifest)
	if err != nil {
		return err
	}
	directory, err := filepath.Abs(filepath.Dir(path))
	if err != nil {
		return fmt.Errorf("resolve OCI manifest output directory: %w", err)
	}
	directory = filepath.Clean(directory)
	information, err := os.Lstat(directory)
	if err != nil {
		return fmt.Errorf("inspect OCI manifest output directory: %w", err)
	}
	if !information.IsDir() || information.Mode()&os.ModeSymlink != 0 {
		return errors.New("OCI manifest output directory must be a real directory")
	}
	resolvedDirectory, err := filepath.EvalSymlinks(directory)
	if err != nil {
		return fmt.Errorf("resolve OCI manifest output directory links: %w", err)
	}
	if filepath.Clean(resolvedDirectory) != directory {
		return errors.New("OCI manifest output directory path must not contain symlinks")
	}
	path = filepath.Join(directory, filepath.Base(path))
	file, err := os.OpenFile(path, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o600)
	if err != nil {
		return fmt.Errorf("create OCI image manifest: %w", err)
	}
	complete := false
	defer func() {
		_ = file.Close()
		if !complete {
			_ = os.Remove(path)
		}
	}()
	if _, err := file.Write(body); err != nil {
		return fmt.Errorf("write OCI image manifest: %w", err)
	}
	if err := file.Sync(); err != nil {
		return fmt.Errorf("synchronize OCI image manifest: %w", err)
	}
	if err := file.Close(); err != nil {
		return fmt.Errorf("close OCI image manifest: %w", err)
	}
	complete = true
	return nil
}

// Load verifies a regular canonical file against the expected release identity.
func Load(path string, expected Release) (Manifest, error) {
	if err := validateRelease(expected); err != nil {
		return Manifest{}, err
	}
	absolutePath, err := filepath.Abs(path)
	if err != nil {
		return Manifest{}, fmt.Errorf("resolve OCI image manifest path: %w", err)
	}
	absolutePath = filepath.Clean(absolutePath)
	directory := filepath.Dir(absolutePath)
	resolvedDirectory, err := filepath.EvalSymlinks(directory)
	if err != nil {
		return Manifest{}, fmt.Errorf("resolve OCI image manifest directory links: %w", err)
	}
	if filepath.Clean(resolvedDirectory) != directory {
		return Manifest{}, errors.New("OCI image manifest directory path must not contain symlinks")
	}
	path = absolutePath
	information, err := os.Lstat(path)
	if err != nil {
		return Manifest{}, fmt.Errorf("inspect OCI image manifest: %w", err)
	}
	if !information.Mode().IsRegular() || information.Mode()&os.ModeSymlink != 0 {
		return Manifest{}, errors.New("OCI image manifest must be a regular non-symlinked file")
	}
	if information.Size() > maximumBytes {
		return Manifest{}, fmt.Errorf("OCI image manifest exceeds the %d-byte limit", maximumBytes)
	}
	file, err := os.Open(path)
	if err != nil {
		return Manifest{}, fmt.Errorf("open OCI image manifest: %w", err)
	}
	defer file.Close()
	opened, err := file.Stat()
	if err != nil || !opened.Mode().IsRegular() || !os.SameFile(information, opened) {
		return Manifest{}, errors.New("OCI image manifest changed while it was opened")
	}
	body, err := io.ReadAll(io.LimitReader(file, maximumBytes+1))
	if err != nil {
		return Manifest{}, fmt.Errorf("read OCI image manifest: %w", err)
	}
	if len(body) > maximumBytes {
		return Manifest{}, fmt.Errorf("OCI image manifest exceeds the %d-byte limit", maximumBytes)
	}
	after, err := os.Lstat(path)
	if err != nil || !after.Mode().IsRegular() || !os.SameFile(information, after) {
		return Manifest{}, errors.New("OCI image manifest changed while it was read")
	}
	if err := strictjson.Validate(body, 8); err != nil {
		return Manifest{}, fmt.Errorf("validate unambiguous OCI image manifest: %w", err)
	}
	decoder := json.NewDecoder(bytes.NewReader(body))
	decoder.DisallowUnknownFields()
	var manifest Manifest
	if err := decoder.Decode(&manifest); err != nil {
		return Manifest{}, fmt.Errorf("decode OCI image manifest: %w", err)
	}
	if err := decoder.Decode(&struct{}{}); err != io.EOF {
		return Manifest{}, errors.New("OCI image manifest contains trailing data")
	}
	if err := validateManifest(manifest, expected); err != nil {
		return Manifest{}, err
	}
	canonical, err := Marshal(manifest)
	if err != nil {
		return Manifest{}, err
	}
	if !bytes.Equal(body, canonical) {
		return Manifest{}, errors.New("OCI image manifest is not in canonical JSON form")
	}
	return manifest, nil
}

// Digests returns the exact persisted digests by stable image role.
func Digests(manifest Manifest, repository string) (tooling, fixture007, fixture019 string, err error) {
	prefixes := map[string]*string{
		"ghcr.io/" + repository + "-20w@":         &tooling,
		"ghcr.io/" + repository + "-fixture-007@": &fixture007,
		"ghcr.io/" + repository + "-fixture-019@": &fixture019,
	}
	for _, identity := range manifest.Images {
		matched := false
		for prefix, destination := range prefixes {
			if strings.HasPrefix(identity, prefix) {
				*destination = strings.TrimPrefix(identity, prefix)
				matched = true
				break
			}
		}
		if !matched {
			return "", "", "", fmt.Errorf("OCI image identity %q has no release role", identity)
		}
	}
	if tooling == "" || fixture007 == "" || fixture019 == "" {
		return "", "", "", errors.New("OCI image manifest does not define every release role")
	}
	return tooling, fixture007, fixture019, nil
}

func validateOptions(options Options) error {
	if err := validateRelease(Release{
		Repository: options.Repository,
		Tag:        options.Tag,
		Commit:     options.Commit,
	}); err != nil {
		return err
	}
	for _, image := range []struct {
		role   string
		digest string
	}{
		{role: "tooling", digest: options.ToolingDigest},
		{role: "fixture-007", digest: options.Fixture007Digest},
		{role: "fixture-019", digest: options.Fixture019Digest},
	} {
		if !digestPattern.MatchString(image.digest) {
			return fmt.Errorf("%s OCI image digest must have the exact sha256 form", image.role)
		}
	}
	return nil
}

func validateRelease(release Release) error {
	if !repositoryPattern.MatchString(release.Repository) || strings.ToLower(release.Repository) != release.Repository {
		return errors.New("OCI image repository must be a lowercase owner/name identity")
	}
	if !tagPattern.MatchString(release.Tag) {
		return errors.New("OCI image source tag must have the exact form vMAJOR.MINOR.PATCH")
	}
	if !commitPattern.MatchString(release.Commit) {
		return errors.New("OCI image source commit must be a lowercase 40-character identity")
	}
	return nil
}

func validateManifest(manifest Manifest, expected Release) error {
	if manifest.Schema != Schema || manifest.Contract != Contract {
		return errors.New("OCI image manifest schema or contract is unsupported")
	}
	if manifest.Source.Tag != expected.Tag || manifest.Source.Commit != expected.Commit {
		return errors.New("OCI image manifest source does not match the release tag and commit")
	}
	if manifest.Platform != Platform {
		return fmt.Errorf("OCI image manifest platform must be %s", Platform)
	}
	if manifest.ResultAuthority != ResultAuthority {
		return fmt.Errorf("OCI image manifest result authority must be %s", ResultAuthority)
	}
	if len(manifest.Images) != 3 {
		return errors.New("OCI image manifest must contain exactly three image identities")
	}
	for index := 1; index < len(manifest.Images); index++ {
		if manifest.Images[index-1] >= manifest.Images[index] {
			return errors.New("OCI image identities must be strictly sorted and unique")
		}
	}
	base := "ghcr.io/" + expected.Repository
	prefixes := []string{
		base + "-20w@",
		base + "-fixture-007@",
		base + "-fixture-019@",
	}
	sort.Strings(prefixes)
	for index, prefix := range prefixes {
		if !strings.HasPrefix(manifest.Images[index], prefix) ||
			!digestPattern.MatchString(strings.TrimPrefix(manifest.Images[index], prefix)) {
			return errors.New("OCI image identities must match the three exact repository release roles and sha256 digests")
		}
	}
	return nil
}
