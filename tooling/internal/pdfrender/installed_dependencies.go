package pdfrender

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"hash"
	"path/filepath"
	"slices"
	"strings"
	"time"

	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/strictjson"
)

const (
	maximumDependencyLockBytes     = 2 * 1024 * 1024
	maximumDependencyManifestBytes = 1024 * 1024
	maximumDependencyMetadataBytes = 32 * 1024 * 1024
	maximumInstalledPackages       = 4096
	maximumDependencyPathDepth     = 16
	installedDependencyTimeout     = 30 * time.Second
)

type dependencyLock struct {
	LockfileVersion int                        `json:"lockfileVersion"`
	Packages        map[string]json.RawMessage `json:"packages"`
}

type dependencyPackage struct {
	Name      string `json:"name"`
	Version   string `json:"version"`
	Resolved  string `json:"resolved"`
	Integrity string `json:"integrity"`
	Optional  bool   `json:"optional"`
	Link      bool   `json:"link"`
	InBundle  bool   `json:"inBundle"`
}

// This snapshot checks installed graph metadata, not package payload bytes or
// tarball authenticity. npm ci remains the installation/integrity boundary.
type installedDependencySnapshot struct {
	root   string
	bytes  int
	digest hash.Hash
}

func bindInstalledDependencies(ctx context.Context, configuration Configuration) (Configuration, error) {
	digest, err := inspectInstalledDependencies(ctx, configuration.RepositoryRoot)
	if err != nil {
		return Configuration{}, err
	}
	configuration.installedDependenciesSHA256 = digest
	return configuration, nil
}

func checkInstalledDependencies(ctx context.Context, configuration Configuration) error {
	if configuration.installedDependenciesSHA256 == "" {
		return errors.New("PDF installed dependencies were not bound before rendering")
	}
	digest, err := inspectInstalledDependencies(ctx, configuration.RepositoryRoot)
	if err != nil {
		return err
	}
	if digest != configuration.installedDependenciesSHA256 {
		return errors.New("PDF installed dependency metadata changed during rendering; rerun npm ci --no-audit with the locked toolchain")
	}
	return nil
}

func inspectInstalledDependencies(ctx context.Context, root string) (string, error) {
	ctx, cancel := context.WithTimeout(ctx, installedDependencyTimeout)
	defer cancel()
	snapshot := installedDependencySnapshot{root: root, digest: sha256.New()}
	digest, err := snapshot.inspect(ctx)
	if err != nil {
		return "", fmt.Errorf("PDF installed dependency preflight: %w; rerun npm ci --no-audit with the locked toolchain", err)
	}
	return digest, nil
}

func (snapshot *installedDependencySnapshot) inspect(ctx context.Context) (string, error) {
	declared, err := snapshot.readLock(ctx, "package-lock.json")
	if err != nil {
		return "", err
	}
	installed, err := snapshot.readLock(ctx, "node_modules/.package-lock.json")
	if err != nil {
		return "", err
	}
	paths, err := installedPackagePaths(ctx, snapshot.root)
	if err != nil {
		return "", err
	}
	if err := compareInstalledInventory(declared, installed, paths); err != nil {
		return "", err
	}
	for _, relative := range paths {
		if err := snapshot.comparePackage(ctx, relative, declared.Packages[relative], installed.Packages[relative]); err != nil {
			return "", err
		}
	}
	return hex.EncodeToString(snapshot.digest.Sum(nil)), ctx.Err()
}

func (snapshot *installedDependencySnapshot) read(ctx context.Context, relative string, maximumBytes int64) ([]byte, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	body, err := readRegularBounded(snapshot.root, filepath.Join(snapshot.root, filepath.FromSlash(relative)), maximumBytes, relative)
	if err != nil {
		return nil, err
	}
	snapshot.bytes += len(body)
	if snapshot.bytes > maximumDependencyMetadataBytes {
		return nil, errors.New("installed package metadata exceeds the 32 MiB total bound")
	}
	if err := strictjson.Validate(body, 32); err != nil {
		return nil, fmt.Errorf("%s: %w", relative, err)
	}
	// Length-prefix every record so path/body concatenations cannot collide.
	fmt.Fprintf(snapshot.digest, "%d:%s:%d:", len(relative), relative, len(body))
	snapshot.digest.Write(body)
	return body, ctx.Err()
}

func (snapshot *installedDependencySnapshot) readLock(ctx context.Context, relative string) (dependencyLock, error) {
	body, err := snapshot.read(ctx, relative, maximumDependencyLockBytes)
	if err != nil {
		return dependencyLock{}, err
	}
	var lock dependencyLock
	if err := json.Unmarshal(body, &lock); err != nil {
		return lock, fmt.Errorf("decode %s: %w", relative, err)
	}
	if lock.LockfileVersion != 3 || len(lock.Packages) == 0 || len(lock.Packages) > maximumInstalledPackages+1 {
		return lock, fmt.Errorf("%s requires lockfileVersion 3 and 1..%d package records", relative, maximumInstalledPackages+1)
	}
	for _, name := range sortedDependencyKeys(lock.Packages) {
		if err := ctx.Err(); err != nil {
			return lock, err
		}
		if name == "" && relative == "package-lock.json" {
			continue
		}
		if !validDependencyPath(name) {
			return lock, fmt.Errorf("%s has unsafe package path %q", relative, name)
		}
		metadata, err := parseDependencyPackage(lock.Packages[name])
		if err != nil {
			return lock, fmt.Errorf("%s package %s: %w", relative, name, err)
		}
		if metadata.InBundle {
			if err := validateBundledDependency(lock, name); err != nil {
				return lock, fmt.Errorf("%s package %s: %w", relative, name, err)
			}
		}
	}
	return lock, nil
}

func parseDependencyPackage(body []byte) (dependencyPackage, error) {
	var metadata dependencyPackage
	if err := json.Unmarshal(body, &metadata); err != nil {
		return metadata, err
	}
	if metadata.Version == "" || metadata.Link || (!metadata.InBundle && (metadata.Resolved == "" || metadata.Integrity == "")) {
		return metadata, errors.New("package requires version, resolved URL and integrity; linked installs are unsupported")
	}
	return metadata, nil
}

func validateBundledDependency(lock dependencyLock, relative string) error {
	boundary := strings.LastIndex(relative, "/node_modules/")
	if boundary < 0 {
		return errors.New("bundled package has no containing package")
	}
	var parent struct {
		InBundle           bool     `json:"inBundle"`
		BundleDependencies []string `json:"bundleDependencies"`
	}
	body := lock.Packages[relative[:boundary]]
	if body == nil {
		return errors.New("bundled package has no locked parent")
	}
	if err := json.Unmarshal(body, &parent); err != nil {
		return fmt.Errorf("decode bundled-package parent: %w", err)
	}
	name := relative[boundary+len("/node_modules/"):]
	// Bundled descendants inherit the enclosing archive's identity. An
	// unbundled parent must explicitly list the direct bundled dependency.
	if !parent.InBundle && !slices.Contains(parent.BundleDependencies, name) {
		return errors.New("bundled package is not listed by its containing archive")
	}
	return nil
}

func sortedDependencyKeys(packages map[string]json.RawMessage) []string {
	keys := make([]string, 0, len(packages))
	for key := range packages {
		keys = append(keys, key)
	}
	slices.Sort(keys)
	return keys
}

func compareInstalledInventory(declared, installed dependencyLock, paths []string) error {
	actual := make(map[string]bool, len(paths))
	for _, relative := range paths {
		actual[relative] = true
		if declared.Packages[relative] == nil || installed.Packages[relative] == nil {
			return fmt.Errorf("unexpected installed package %s absent from a lock", relative)
		}
	}
	for _, relative := range sortedDependencyKeys(installed.Packages) {
		if !actual[relative] {
			return fmt.Errorf("hidden lock names missing installed package %s", relative)
		}
	}
	for _, relative := range sortedDependencyKeys(declared.Packages) {
		if relative == "" || actual[relative] {
			continue
		}
		metadata, err := parseDependencyPackage(declared.Packages[relative])
		if err != nil {
			return err
		}
		// npm propagates optional:true into omitted platform-package subtrees.
		// Do not require the 52 other-platform records in this repository's lock.
		if !metadata.Optional {
			return fmt.Errorf("required installed package is missing: %s", relative)
		}
	}
	return nil
}

func (snapshot *installedDependencySnapshot) comparePackage(ctx context.Context, relative string, declared, installed json.RawMessage) error {
	want, err := parseDependencyPackage(declared)
	if err != nil {
		return err
	}
	got, err := parseDependencyPackage(installed)
	if err != nil {
		return err
	}
	if want != got {
		return fmt.Errorf("%s hidden lock identity differs from package-lock.json (declared %s, installed %s)", relative, want.Version, got.Version)
	}
	body, err := snapshot.read(ctx, relative+"/package.json", maximumDependencyManifestBytes)
	if err != nil {
		return err
	}
	var actual dependencyPackage
	if err := json.Unmarshal(body, &actual); err != nil {
		return fmt.Errorf("decode %s/package.json: %w", relative, err)
	}
	name := want.Name
	if name == "" {
		name = relative[strings.LastIndex(relative, "node_modules/")+len("node_modules/"):]
	}
	if actual.Name != name || actual.Version != want.Version {
		return fmt.Errorf("%s/package.json declares %s@%s, want %s@%s", relative, actual.Name, actual.Version, name, want.Version)
	}
	return nil
}
