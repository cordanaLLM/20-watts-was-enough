// Package releasebuild creates the bounded set of native 20w release binaries.
package releasebuild

import (
	"context"
	"crypto/sha256"
	"debug/buildinfo"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime"
	"sort"
	"strings"
	"time"
)

const (
	maximumBinaryBytes        = 128 * 1024 * 1024
	maximumCommandOutputBytes = 64 * 1024
	maximumCommandDuration    = 5 * time.Minute
	maximumCommandWaitDelay   = 5 * time.Second
	maximumBuildDuration      = 15 * time.Minute
	releaseGoVersion          = "go1.27.1"
)

const (
	goSBOMName      = "20w-go-modules.spdx.json"
	goNoticesName   = "20w-third-party-notices.txt"
	toolingModule   = "github.com/cordanaLLM/20-watts-was-enough/tooling"
	goldmarkModule  = "github.com/yuin/goldmark/v2"
	goldmarkVersion = "v2.0.1"
)

var (
	releaseVersionPattern = regexp.MustCompile(`^v(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$`)
	revisionPattern       = regexp.MustCompile(`^[0-9a-f]{40}$`)
)

// Options binds all generated binaries to one immutable source identity.
type Options struct {
	ModuleRoot string
	OutputRoot string
	Version    string
	Revision   string
	BuiltAt    string
	GoBinary   string
}

// Artifact describes one supported release target.
type Artifact struct {
	Name string
	OS   string
	Arch string
}

// Artifacts returns the closed, deterministic release target set.
func Artifacts() []Artifact {
	return []Artifact{
		{Name: "20w-linux-amd64", OS: "linux", Arch: "amd64"},
	}
}

// Validate checks the immutable build identity and paths before any output is created.
func Validate(options Options) error {
	if !releaseVersionPattern.MatchString(options.Version) {
		return errors.New("version must have the exact form vMAJOR.MINOR.PATCH")
	}
	if !revisionPattern.MatchString(options.Revision) {
		return errors.New("revision must be a lowercase 40-character Git commit")
	}
	parsedTime, err := time.Parse(time.RFC3339, options.BuiltAt)
	if err != nil || parsedTime.Format(time.RFC3339) != options.BuiltAt {
		return errors.New("built-at must be a canonical RFC 3339 timestamp")
	}
	if options.ModuleRoot == "" {
		return errors.New("module root is required")
	}
	if options.OutputRoot == "" {
		return errors.New("output root is required")
	}
	return nil
}

// Build cross-compiles the closed artifact set without C dependencies.
func Build(ctx context.Context, options Options) (artifacts []Artifact, returnError error) {
	if err := Validate(options); err != nil {
		return nil, err
	}
	if ctx == nil {
		return nil, errors.New("build context is required")
	}
	buildContext, cancel := context.WithTimeout(ctx, maximumBuildDuration)
	defer cancel()
	if err := buildContext.Err(); err != nil {
		return nil, fmt.Errorf("start native release build: %w", err)
	}

	paths, err := prepareReleasePaths(options)
	if err != nil {
		return nil, err
	}
	stagingRoot, err := os.MkdirTemp(paths.outputParent, ".release-binaries-")
	if err != nil {
		return nil, fmt.Errorf("create staging root: %w", err)
	}
	defer func() {
		if returnError != nil {
			_ = os.RemoveAll(stagingRoot)
		}
	}()

	goBinary := options.GoBinary
	if goBinary == "" {
		goBinary = "go"
	}
	goBinary, err = exec.LookPath(goBinary)
	if err != nil {
		return nil, fmt.Errorf("resolve Go binary: %w", err)
	}
	linkerFlags := fmt.Sprintf(
		"-s -w -buildid= -X github.com/cordanaLLM/20-watts-was-enough/tooling/internal/buildinfo.version=%s -X github.com/cordanaLLM/20-watts-was-enough/tooling/internal/buildinfo.revision=%s -X github.com/cordanaLLM/20-watts-was-enough/tooling/internal/buildinfo.builtAt=%s",
		options.Version,
		options.Revision,
		options.BuiltAt,
	)
	artifacts = Artifacts()
	for _, artifact := range artifacts {
		if err := buildArtifact(buildContext, goBinary, paths.moduleRoot, stagingRoot, linkerFlags, artifact, options); err != nil {
			return nil, err
		}
	}
	if !sort.SliceIsSorted(artifacts, func(left, right int) bool {
		return artifacts[left].Name < artifacts[right].Name
	}) {
		return nil, errors.New("release artifact plan is not sorted")
	}
	if err := writeDependencyMetadata(stagingRoot, paths.moduleRoot, artifacts, options); err != nil {
		return nil, err
	}
	if err := recheckPublishPaths(paths, stagingRoot); err != nil {
		return nil, err
	}
	if err := os.Rename(stagingRoot, paths.outputRoot); err != nil {
		return nil, fmt.Errorf("publish release binaries: %w", err)
	}
	return artifacts, nil
}

func buildArtifact(ctx context.Context, goBinary, moduleRoot, stagingRoot, linkerFlags string, artifact Artifact, options Options) error {
	if filepath.Base(artifact.Name) != artifact.Name || artifact.Name == "." || artifact.Name == ".." {
		return fmt.Errorf("release artifact has unsafe name %q", artifact.Name)
	}
	if runtime.GOOS != artifact.OS || runtime.GOARCH != artifact.Arch {
		return fmt.Errorf("withhold unexercised target %s: build host is %s/%s", artifact.Name, runtime.GOOS, runtime.GOARCH)
	}
	outputPath := filepath.Join(stagingRoot, artifact.Name)
	verificationPath := filepath.Join(stagingRoot, ".verify-"+artifact.Name)
	for _, path := range []string{outputPath, verificationPath} {
		result, err := runBoundedCommand(ctx, moduleRoot, closedBuildEnvironment(os.Environ(), artifact), goBinary, buildArguments(path, linkerFlags)...)
		if err != nil {
			return commandError("build "+artifact.Name, err, result)
		}
		if err := validateBinary(path, artifact.Name); err != nil {
			return err
		}
	}
	firstDigest, err := digestBoundedFile(outputPath)
	if err != nil {
		return fmt.Errorf("hash %s: %w", artifact.Name, err)
	}
	secondDigest, err := digestBoundedFile(verificationPath)
	if err != nil {
		return fmt.Errorf("hash repeated %s build: %w", artifact.Name, err)
	}
	if firstDigest != secondDigest {
		return fmt.Errorf("%s is not byte-deterministic across two clean output paths", artifact.Name)
	}
	if err := os.Remove(verificationPath); err != nil {
		return fmt.Errorf("remove repeated %s build: %w", artifact.Name, err)
	}
	return exerciseArtifact(ctx, outputPath, artifact, options)
}

func buildArguments(outputPath, linkerFlags string) []string {
	return []string{
		"build",
		"-buildmode=exe",
		"-compiler=gc",
		"-trimpath",
		"-buildvcs=false",
		"-mod=readonly",
		"-pgo=off",
		"-ldflags",
		linkerFlags,
		"-o",
		outputPath,
		"./cmd/20w",
	}
}

func validateBinary(path, name string) error {
	information, err := os.Lstat(path)
	if err != nil {
		return fmt.Errorf("inspect %s: %w", name, err)
	}
	if !information.Mode().IsRegular() || information.Size() <= 0 || information.Size() > maximumBinaryBytes {
		return fmt.Errorf("%s is not a bounded regular binary", name)
	}
	return nil
}

func digestBoundedFile(path string) ([sha256.Size]byte, error) {
	file, err := os.Open(path)
	if err != nil {
		return [sha256.Size]byte{}, err
	}
	defer file.Close()
	hash := sha256.New()
	written, err := io.Copy(hash, io.LimitReader(file, maximumBinaryBytes+1))
	if err != nil {
		return [sha256.Size]byte{}, err
	}
	if written <= 0 || written > maximumBinaryBytes {
		return [sha256.Size]byte{}, errors.New("binary exceeds its byte limit")
	}
	var digest [sha256.Size]byte
	copy(digest[:], hash.Sum(nil))
	return digest, nil
}

type dependency struct {
	Path    string
	Version string
	Sum     string
}

func readDependencies(stagingRoot string, artifacts []Artifact) ([]dependency, error) {
	var expected []dependency
	for index, artifact := range artifacts {
		information, err := buildinfo.ReadFile(filepath.Join(stagingRoot, artifact.Name))
		if err != nil {
			return nil, fmt.Errorf("read Go build information from %s: %w", artifact.Name, err)
		}
		if information.Path != toolingModule+"/cmd/20w" || information.Main.Path != toolingModule {
			return nil, fmt.Errorf("%s has unexpected Go module identity", artifact.Name)
		}
		if err := verifyBuildSettings(information, artifact); err != nil {
			return nil, fmt.Errorf("%s has unsafe Go build settings: %w", artifact.Name, err)
		}
		dependencies := make([]dependency, 0, len(information.Deps))
		for _, module := range information.Deps {
			if module.Replace != nil {
				return nil, fmt.Errorf("%s contains a replaced module dependency: %s", artifact.Name, module.Path)
			}
			dependencies = append(dependencies, dependency{
				Path:    module.Path,
				Version: module.Version,
				Sum:     module.Sum,
			})
		}
		sort.Slice(dependencies, func(left, right int) bool {
			return dependencies[left].Path < dependencies[right].Path
		})
		if index == 0 {
			expected = dependencies
			continue
		}
		if !dependenciesEqual(expected, dependencies) {
			return nil, fmt.Errorf("%s has a different Go dependency graph", artifact.Name)
		}
	}
	if len(expected) == 0 {
		return nil, errors.New("release binaries contain no recorded Go dependency graph")
	}
	return expected, nil
}

func verifyBuildSettings(information *buildinfo.BuildInfo, artifact Artifact) error {
	if information.GoVersion != releaseGoVersion {
		return fmt.Errorf("Go version is %q, want %q", information.GoVersion, releaseGoVersion)
	}
	expected := map[string]string{
		"-buildmode":  "exe",
		"-compiler":   "gc",
		"-trimpath":   "true",
		"CGO_ENABLED": "0",
		"GOARCH":      artifact.Arch,
		"GOOS":        artifact.OS,
		"GOAMD64":     "v1",
	}
	actual := make(map[string]string, len(information.Settings))
	for _, setting := range information.Settings {
		if _, exists := actual[setting.Key]; exists {
			return fmt.Errorf("duplicate setting %q", setting.Key)
		}
		actual[setting.Key] = setting.Value
	}
	if len(actual) != len(expected) {
		return fmt.Errorf("settings are not exact: got %s, want %s", formatBuildSettings(actual), formatBuildSettings(expected))
	}
	keys := make([]string, 0, len(expected))
	for key := range expected {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	for _, key := range keys {
		expectedValue := expected[key]
		if actual[key] != expectedValue {
			return fmt.Errorf("setting %s is %q, want %q", key, actual[key], expectedValue)
		}
	}
	return nil
}

func formatBuildSettings(settings map[string]string) string {
	entries := make([]string, 0, len(settings))
	for key, value := range settings {
		entries = append(entries, key+"="+value)
	}
	sort.Strings(entries)
	return strings.Join(entries, ",")
}

func dependenciesEqual(left, right []dependency) bool {
	if len(left) != len(right) {
		return false
	}
	for index := range left {
		if left[index] != right[index] {
			return false
		}
	}
	return true
}

func writeDependencyMetadata(stagingRoot, moduleRoot string, artifacts []Artifact, options Options) error {
	dependencies, err := readDependencies(stagingRoot, artifacts)
	if err != nil {
		return err
	}
	if len(dependencies) != 1 || dependencies[0].Path != goldmarkModule || dependencies[0].Version != goldmarkVersion {
		return fmt.Errorf("unreviewed Go release dependency graph: %+v", dependencies)
	}
	licensePath := filepath.Join(filepath.Dir(moduleRoot), "LICENSES", "goldmark-MIT.txt")
	licenseInformation, err := os.Lstat(licensePath)
	if err != nil || !licenseInformation.Mode().IsRegular() {
		return errors.New("tracked Goldmark licence must be a regular file")
	}
	licenseBytes, err := os.ReadFile(licensePath)
	if err != nil {
		return fmt.Errorf("read tracked Goldmark licence: %w", err)
	}
	if len(licenseBytes) == 0 || len(licenseBytes) > 1_000_000 {
		return errors.New("tracked Goldmark licence is empty or exceeds its byte limit")
	}
	licenseDigest := sha256.Sum256(licenseBytes)
	if hex.EncodeToString(licenseDigest[:]) != "c1d6f653c38c80294dc7994647ba0dcc508ce64a86996303c804efa2f7982bff" {
		return errors.New("tracked Goldmark licence does not match the reviewed upstream text")
	}

	sbomBytes, err := renderGoSBOM(options, dependencies)
	if err != nil {
		return err
	}
	noticeBytes := renderGoNotices(dependencies[0], licenseBytes, hex.EncodeToString(licenseDigest[:]))
	for name, bytes := range map[string][]byte{
		goSBOMName:    sbomBytes,
		goNoticesName: noticeBytes,
	} {
		if err := os.WriteFile(filepath.Join(stagingRoot, name), bytes, 0o600); err != nil {
			return fmt.Errorf("write %s: %w", name, err)
		}
	}
	return nil
}

func renderGoSBOM(options Options, dependencies []dependency) ([]byte, error) {
	created, err := time.Parse(time.RFC3339, options.BuiltAt)
	if err != nil {
		return nil, fmt.Errorf("parse SBOM creation time: %w", err)
	}
	packages := []map[string]any{
		{
			"name":             "20w",
			"SPDXID":           "SPDXRef-Package-20w",
			"versionInfo":      strings.TrimPrefix(options.Version, "v"),
			"downloadLocation": "NOASSERTION",
			"filesAnalyzed":    false,
			"licenseConcluded": "EUPL-1.2",
			"licenseDeclared":  "EUPL-1.2",
			"copyrightText":    "Copyright (c) 2026 lusoris contributors",
		},
	}
	for index, module := range dependencies {
		packages = append(packages, map[string]any{
			"name":             module.Path,
			"SPDXID":           fmt.Sprintf("SPDXRef-Package-Go-%03d", index+1),
			"versionInfo":      module.Version,
			"downloadLocation": "https://proxy.golang.org/github.com/yuin/goldmark/v2/@v/v2.0.1.zip",
			"filesAnalyzed":    false,
			"licenseConcluded": "MIT",
			"licenseDeclared":  "MIT",
			"copyrightText":    "Copyright (c) 2019 Yusuke Inuzuka",
			"externalRefs": []map[string]string{{
				"referenceCategory": "PACKAGE-MANAGER",
				"referenceType":     "purl",
				"referenceLocator":  "pkg:golang/github.com/yuin/goldmark/v2@v2.0.1",
			}},
			"comment": "Go module checksum " + module.Sum,
		})
	}
	relationships := []map[string]string{{
		"spdxElementId":      "SPDXRef-DOCUMENT",
		"relationshipType":   "DESCRIBES",
		"relatedSpdxElement": "SPDXRef-Package-20w",
	}}
	for index := range dependencies {
		relationships = append(relationships, map[string]string{
			"spdxElementId":      "SPDXRef-Package-20w",
			"relationshipType":   "DEPENDS_ON",
			"relatedSpdxElement": fmt.Sprintf("SPDXRef-Package-Go-%03d", index+1),
		})
	}
	document := map[string]any{
		"spdxVersion":       "SPDX-2.3",
		"dataLicense":       "CC0-1.0",
		"SPDXID":            "SPDXRef-DOCUMENT",
		"name":              "20w-native-" + strings.TrimPrefix(options.Version, "v"),
		"documentNamespace": "https://github.com/cordanaLLM/20-watts-was-enough/releases/download/" + options.Version + "/" + goSBOMName,
		"creationInfo": map[string]any{
			"created": created.UTC().Format(time.RFC3339),
			"creators": []string{
				"Tool: 20w/build-release",
				"Organization: lusoris contributors",
			},
		},
		"packages":      packages,
		"relationships": relationships,
	}
	bytes, err := json.MarshalIndent(document, "", "  ")
	if err != nil {
		return nil, fmt.Errorf("encode Go SPDX document: %w", err)
	}
	return append(bytes, '\n'), nil
}

func renderGoNotices(module dependency, licenseBytes []byte, digest string) []byte {
	return []byte(fmt.Sprintf(
		"THIRD-PARTY NOTICES — 20w native command\n\nIncluded Go module\n------------------\n- %s@%s — MIT\n- Go module checksum: %s\n- Licence source: LICENSES/goldmark-MIT.txt\n- Licence SHA-256: %s\n\n%s",
		module.Path,
		module.Version,
		module.Sum,
		digest,
		licenseBytes,
	))
}
