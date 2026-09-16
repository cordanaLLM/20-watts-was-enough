// Package experiment reads the public experiment execution catalogue.
package experiment

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
	maxManifestBytes = 1 << 20
	maxManifestFiles = 128
	maxLockfiles     = 16
)

var (
	artifactPattern = regexp.MustCompile(`^(candidate|fixture)-[0-9]{3}$`)
	imagePattern    = regexp.MustCompile(`^ghcr\.io/cordanallm/20-watts-was-enough-(candidate|fixture)-[0-9]{3}$`)
	lockfilePattern = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9._/-]{0,511}$`)
	platformPattern = regexp.MustCompile(`^linux/(amd64|arm64)$`)
	readinessLevels = map[string]bool{
		"scaffold":          true,
		"smoke-ready":       true,
		"workstation-ready": true,
	}
)

// Distribution is the manifest-owned public release boundary for one artifact.
type Distribution struct {
	State        string   `json:"state"`
	RuntimeClass string   `json:"runtime_class"`
	Image        string   `json:"image,omitempty"`
	Platforms    []string `json:"platforms,omitempty"`
	BuildContext string   `json:"build_context,omitempty"`
	Dockerfile   string   `json:"dockerfile,omitempty"`
	Authority    string   `json:"authority"`
}

// UnmarshalJSON keeps the release authority object closed even though the
// surrounding research manifest intentionally contains fields this package
// does not project.
func (distribution *Distribution) UnmarshalJSON(body []byte) error {
	type plainDistribution Distribution
	decoder := json.NewDecoder(bytes.NewReader(body))
	decoder.DisallowUnknownFields()
	var parsed plainDistribution
	if err := decoder.Decode(&parsed); err != nil {
		return err
	}
	if decoder.Decode(&struct{}{}) != io.EOF {
		return errors.New("distribution has trailing JSON data")
	}
	*distribution = Distribution(parsed)
	return nil
}

// Entry is the distribution-relevant projection of an execution manifest.
type Entry struct {
	Artifact     string       `json:"artifact"`
	Readiness    string       `json:"readiness"`
	Runtime      string       `json:"runtime"`
	Lockfiles    []string     `json:"lockfiles"`
	Distribution Distribution `json:"distribution"`
}

type manifest struct {
	Schema       int          `json:"schema"`
	Artifact     string       `json:"artifact"`
	Readiness    string       `json:"readiness"`
	Distribution Distribution `json:"distribution"`
	Environment  struct {
		Runtime   string   `json:"runtime"`
		Lockfiles []string `json:"lockfiles"`
	} `json:"environment"`
}

// LoadCatalog returns a deterministic, bounded manifest projection.
func LoadCatalog(repositoryRoot string) ([]Entry, error) {
	root, err := resolveRepositoryRoot(repositoryRoot)
	if err != nil {
		return nil, err
	}
	manifestRoot := filepath.Join(root, "experiments", "workstation", "manifests")
	if err := validateRepositoryDirectory(root, "experiments/workstation/manifests"); err != nil {
		return nil, fmt.Errorf("validate experiment manifest directory: %w", err)
	}
	entries, err := os.ReadDir(manifestRoot)
	if err != nil {
		return nil, fmt.Errorf("read experiment manifests: %w", err)
	}
	if len(entries) > maxManifestFiles {
		return nil, fmt.Errorf("experiment manifest limit exceeded (%d)", maxManifestFiles)
	}

	catalog := make([]Entry, 0, len(entries))
	seen := make(map[string]struct{}, len(entries))
	for _, directoryEntry := range entries {
		if directoryEntry.IsDir() || filepath.Ext(directoryEntry.Name()) != ".json" {
			continue
		}
		if directoryEntry.Type()&os.ModeSymlink != 0 {
			return nil, fmt.Errorf("experiment manifest must not be a symlink: %s", directoryEntry.Name())
		}
		parsed, err := readManifest(filepath.Join(manifestRoot, directoryEntry.Name()))
		if err != nil {
			return nil, fmt.Errorf("%s: %w", directoryEntry.Name(), err)
		}
		if parsed.Schema != 1 || !artifactPattern.MatchString(parsed.Artifact) || !readinessLevels[parsed.Readiness] || parsed.Environment.Runtime == "" {
			return nil, fmt.Errorf("%s has an invalid catalogue projection", directoryEntry.Name())
		}
		if err := validateLockfiles(root, parsed.Environment.Lockfiles); err != nil {
			return nil, fmt.Errorf("%s: %w", directoryEntry.Name(), err)
		}
		if err := validateDistribution(root, parsed.Artifact, parsed.Distribution); err != nil {
			return nil, fmt.Errorf("%s: %w", directoryEntry.Name(), err)
		}
		if parsed.Artifact+".json" != directoryEntry.Name() {
			return nil, fmt.Errorf("%s does not match artifact %s", directoryEntry.Name(), parsed.Artifact)
		}
		if _, duplicate := seen[parsed.Artifact]; duplicate {
			return nil, fmt.Errorf("duplicate experiment artifact: %s", parsed.Artifact)
		}
		seen[parsed.Artifact] = struct{}{}
		catalog = append(catalog, Entry{
			Artifact:     parsed.Artifact,
			Readiness:    parsed.Readiness,
			Runtime:      parsed.Environment.Runtime,
			Lockfiles:    append([]string(nil), parsed.Environment.Lockfiles...),
			Distribution: copyDistribution(parsed.Distribution),
		})
	}
	if len(catalog) == 0 {
		return nil, errors.New("no experiment manifests found")
	}
	sort.Slice(catalog, func(left, right int) bool {
		return catalog[left].Artifact < catalog[right].Artifact
	})
	return catalog, nil
}

func copyDistribution(distribution Distribution) Distribution {
	distribution.Platforms = append([]string(nil), distribution.Platforms...)
	return distribution
}

// LoadReleasePlan returns only manifest-declared release images.
func LoadReleasePlan(repositoryRoot string) ([]Entry, error) {
	catalog, err := LoadCatalog(repositoryRoot)
	if err != nil {
		return nil, err
	}
	plan := make([]Entry, 0, len(catalog))
	for _, entry := range catalog {
		if entry.Distribution.State == "release-image" {
			plan = append(plan, entry)
		}
	}
	if len(plan) == 0 {
		return nil, errors.New("no release images are declared")
	}
	return plan, nil
}

func readManifest(path string) (manifest, error) {
	information, err := os.Lstat(path)
	if err != nil {
		return manifest{}, err
	}
	if !information.Mode().IsRegular() {
		return manifest{}, errors.New("manifest must be a regular file")
	}
	if information.Size() > maxManifestBytes {
		return manifest{}, fmt.Errorf("manifest exceeds the %d-byte limit", maxManifestBytes)
	}
	file, err := os.Open(path)
	if err != nil {
		return manifest{}, err
	}
	defer file.Close()
	openedInformation, err := file.Stat()
	if err != nil || !openedInformation.Mode().IsRegular() || !os.SameFile(information, openedInformation) {
		return manifest{}, errors.New("manifest changed before it was opened")
	}
	body, err := io.ReadAll(io.LimitReader(file, maxManifestBytes+1))
	if err != nil {
		return manifest{}, err
	}
	if len(body) > maxManifestBytes {
		return manifest{}, fmt.Errorf("manifest exceeds the %d-byte limit", maxManifestBytes)
	}
	finalInformation, err := os.Lstat(path)
	if err != nil || finalInformation.Mode()&os.ModeSymlink != 0 || !os.SameFile(openedInformation, finalInformation) {
		return manifest{}, errors.New("manifest changed while it was read")
	}
	if err := strictjson.Validate(body, 64); err != nil {
		return manifest{}, fmt.Errorf("validate unambiguous JSON: %w", err)
	}
	decoder := json.NewDecoder(bytes.NewReader(body))
	var parsed manifest
	if err := decoder.Decode(&parsed); err != nil {
		return manifest{}, fmt.Errorf("decode JSON: %w", err)
	}
	if decoder.Decode(&struct{}{}) != io.EOF {
		return manifest{}, errors.New("manifest has trailing JSON data or exceeds the byte limit")
	}
	return parsed, nil
}

func validateLockfiles(root string, lockfiles []string) error {
	if len(lockfiles) == 0 || len(lockfiles) > maxLockfiles {
		return fmt.Errorf("lockfile inventory must contain between 1 and %d entries", maxLockfiles)
	}
	seen := make(map[string]bool, len(lockfiles))
	for _, lockfile := range lockfiles {
		if !lockfilePattern.MatchString(lockfile) || filepath.IsAbs(lockfile) {
			return fmt.Errorf("invalid repository-relative lockfile path: %q", lockfile)
		}
		for _, component := range strings.Split(lockfile, "/") {
			if component == "" || component == "." || component == ".." {
				return fmt.Errorf("invalid repository-relative lockfile path: %q", lockfile)
			}
		}
		if seen[lockfile] {
			return fmt.Errorf("duplicate lockfile path: %s", lockfile)
		}
		if err := validateRepositoryFile(root, lockfile); err != nil {
			return fmt.Errorf("lockfile %q: %w", lockfile, err)
		}
		seen[lockfile] = true
	}
	return nil
}

func validateDistribution(root, artifact string, distribution Distribution) error {
	if distribution.Authority != "NO_RESULT" {
		return errors.New("distribution authority must remain NO_RESULT")
	}
	switch distribution.State {
	case "source-only":
		if distribution.RuntimeClass != "node-source" || hasImageFields(distribution) {
			return errors.New("source-only distribution contains an image boundary")
		}
	case "release-image":
		if err := validateReleaseImage(root, artifact, distribution); err != nil {
			return err
		}
	default:
		return fmt.Errorf("unknown distribution state %q", distribution.State)
	}
	return nil
}

func hasImageFields(distribution Distribution) bool {
	return distribution.Image != "" || len(distribution.Platforms) != 0 || distribution.BuildContext != "" || distribution.Dockerfile != ""
}

func validateReleaseImage(root, artifact string, distribution Distribution) error {
	if !imagePattern.MatchString(distribution.Image) || distribution.Image != "ghcr.io/cordanallm/20-watts-was-enough-"+artifact {
		return errors.New("release image name does not match its artifact")
	}
	if distribution.RuntimeClass != "transitional-node" && distribution.RuntimeClass != "node-python" {
		return errors.New("release image has an unknown runtime class")
	}
	if distribution.BuildContext != "closed-go-package" && distribution.BuildContext != "repository-root" {
		return errors.New("release image has an unknown build-context class")
	}
	if len(distribution.Platforms) == 0 || len(distribution.Platforms) > 4 {
		return errors.New("release image must declare one to four platforms")
	}
	seen := make(map[string]bool, len(distribution.Platforms))
	for _, platform := range distribution.Platforms {
		if !platformPattern.MatchString(platform) || seen[platform] {
			return fmt.Errorf("release image has invalid or repeated platform %q", platform)
		}
		seen[platform] = true
	}
	if err := validateRepositoryFile(root, distribution.Dockerfile); err != nil {
		return fmt.Errorf("release image Dockerfile: %w", err)
	}
	return nil
}

func validateRepositoryFile(root, relative string) error {
	if err := validateRepositoryPath(relative); err != nil {
		return err
	}
	path, information, err := inspectRepositoryPath(root, relative, false)
	if err != nil {
		return err
	}
	file, err := os.Open(path)
	if err != nil {
		return fmt.Errorf("open repository file %q: %w", relative, err)
	}
	openedInformation, statErr := file.Stat()
	closeErr := file.Close()
	if statErr != nil {
		return fmt.Errorf("inspect opened repository file %q: %w", relative, statErr)
	}
	if closeErr != nil {
		return fmt.Errorf("close repository file %q: %w", relative, closeErr)
	}
	finalInformation, err := os.Lstat(path)
	if err != nil || !openedInformation.Mode().IsRegular() || !os.SameFile(information, openedInformation) || !os.SameFile(openedInformation, finalInformation) {
		return fmt.Errorf("repository file %q changed while its identity was checked", relative)
	}
	return nil
}

func resolveRepositoryRoot(repositoryRoot string) (string, error) {
	root, err := filepath.Abs(repositoryRoot)
	if err != nil {
		return "", fmt.Errorf("resolve repository root: %w", err)
	}
	root = filepath.Clean(root)
	information, err := os.Lstat(root)
	if err != nil {
		return "", fmt.Errorf("inspect repository root: %w", err)
	}
	if !information.IsDir() || information.Mode()&os.ModeSymlink != 0 {
		return "", errors.New("repository root must be a real directory")
	}
	resolved, err := filepath.EvalSymlinks(root)
	if err != nil {
		return "", fmt.Errorf("resolve repository root components: %w", err)
	}
	if filepath.Clean(resolved) != root {
		return "", errors.New("repository root must not contain symlinked path components")
	}
	return root, nil
}

func validateRepositoryDirectory(root, relative string) error {
	if err := validateRepositoryPath(relative); err != nil {
		return err
	}
	_, _, err := inspectRepositoryPath(root, relative, true)
	return err
}

func validateRepositoryPath(relative string) error {
	if !lockfilePattern.MatchString(relative) || filepath.IsAbs(relative) || strings.Contains(relative, "\\") {
		return fmt.Errorf("invalid repository-relative path %q", relative)
	}
	for _, component := range strings.Split(relative, "/") {
		if component == "" || component == "." || component == ".." {
			return fmt.Errorf("invalid repository-relative path %q", relative)
		}
	}
	return nil
}

func inspectRepositoryPath(root, relative string, wantDirectory bool) (string, os.FileInfo, error) {
	current := root
	components := strings.Split(relative, "/")
	for index, component := range components {
		current = filepath.Join(current, filepath.FromSlash(component))
		information, err := os.Lstat(current)
		if err != nil {
			return "", nil, fmt.Errorf("inspect repository path %q: %w", relative, err)
		}
		if information.Mode()&os.ModeSymlink != 0 {
			return "", nil, fmt.Errorf("repository path %q must not contain symlinks", relative)
		}
		last := index == len(components)-1
		if !last && !information.IsDir() {
			return "", nil, fmt.Errorf("repository path %q has a non-directory parent", relative)
		}
		if last && wantDirectory && !information.IsDir() {
			return "", nil, fmt.Errorf("repository path %q must be a directory", relative)
		}
		if last && !wantDirectory && !information.Mode().IsRegular() {
			return "", nil, fmt.Errorf("repository path %q must be a regular file", relative)
		}
		if last {
			return current, information, nil
		}
	}
	return "", nil, fmt.Errorf("repository path %q is empty", relative)
}
