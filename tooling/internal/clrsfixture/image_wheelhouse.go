package clrsfixture

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"net/url"
	"os"
	"path"
	"path/filepath"
	"slices"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/strictjson"
)

const (
	generatorRuntimePackageCount = 61
	generatorSourceDateEpoch     = int64(1_787_658_740)
	generatorGlibcVersion        = "2.36"
	generatorMaximumGlibcMinor   = 36
	promiseWheelFilename         = "promise-2.3-py3-none-any.whl"
	promiseWheelSHA256           = "bef8aedf1f65bca04bed59a7dd784f94075ceeb61c13ea9aaf86c91f569f861b"
	promiseWheelSize             = int64(21_582)
	promiseLicensePath           = "LICENSES/promise-MIT.txt"
	promiseLicenseSHA256         = "5d328768394abffaa84512c90783941dd899a62bcc8009a4181e28b2743228ec"
	promiseLicenseSize           = int64(1_079)
)

var generatorSourceBuildEnvironment = []string{
	"LANG=C.UTF-8",
	"LC_ALL=C.UTF-8",
	"PYTHONHASHSEED=0",
	"SOURCE_DATE_EPOCH=1787658740",
	"TZ=UTC",
}

type lockedGeneratorArtifact struct {
	Package    string
	Version    string
	Filename   string
	URL        string
	SHA256     string
	SizeBytes  int64
	UploadTime string
	Wheel      bool
}

type lockedGeneratorPackage struct {
	Name      string
	Version   string
	Artifacts []lockedGeneratorArtifact
}

// ParseGeneratorWheelhouseManifest validates the complete selected artifact
// set against the exact uv lock. It does not require the artifact bytes to be
// present and grants no image or result authority.
func ParseGeneratorWheelhouseManifest(
	body, dependencyLockBody []byte,
	input GeneratorLockInput,
	imageContract GeneratorImageContract,
) (GeneratorWheelhouseManifest, error) {
	if len(body) == 0 || int64(len(body)) > imageContract.Limits.WheelhouseManifestBytes {
		return GeneratorWheelhouseManifest{}, fmt.Errorf(
			"CLRS generator wheelhouse manifest size = %d, want 1..%d",
			len(body),
			imageContract.Limits.WheelhouseManifestBytes,
		)
	}
	var manifest GeneratorWheelhouseManifest
	if err := decodeCanonicalGeneratorJSON(body, 8, &manifest); err != nil {
		return GeneratorWheelhouseManifest{}, fmt.Errorf("parse CLRS generator wheelhouse manifest: %w", err)
	}
	if rawSHA256(dependencyLockBody) != imageContract.DependencyLock.SHA256 {
		return GeneratorWheelhouseManifest{}, errors.New("CLRS generator wheelhouse dependency-lock digest is invalid")
	}
	packages, err := parseLockedGeneratorPackages(dependencyLockBody)
	if err != nil {
		return GeneratorWheelhouseManifest{}, err
	}
	if err := manifest.validate(input, imageContract, packages); err != nil {
		return GeneratorWheelhouseManifest{}, err
	}
	return manifest, nil
}

func (manifest GeneratorWheelhouseManifest) validate(
	input GeneratorLockInput,
	imageContract GeneratorImageContract,
	packages []lockedGeneratorPackage,
) error {
	if manifest.SchemaVersion != 1 || manifest.Authority != ResultAuthority || manifest.State != "locked-selection" ||
		manifest.Platform != input.Platform || manifest.PythonVersion != input.Python.Version ||
		manifest.BaseImage != input.Python.BaseImage || manifest.GlibcVersion != generatorGlibcVersion ||
		manifest.DependencyLockSHA256 != imageContract.DependencyLock.SHA256 ||
		manifest.SourceDateEpoch != generatorSourceDateEpoch {
		return errors.New("generator wheelhouse manifest header is invalid")
	}
	if manifest.PackageCount != generatorRuntimePackageCount || manifest.ArtifactCount != generatorRuntimePackageCount ||
		manifest.DownloadedWheelCount != generatorRuntimePackageCount-1 || manifest.SourceBuiltWheelCount != 1 ||
		len(manifest.Artifacts) != generatorRuntimePackageCount {
		return errors.New("generator wheelhouse manifest counts are invalid")
	}
	if manifest.TotalSizeBytes <= 0 || manifest.TotalSizeBytes > imageContract.Limits.DependencyArtifactBytes {
		return errors.New("generator wheelhouse manifest byte total is invalid")
	}
	locked := make(map[string]lockedGeneratorPackage, len(packages))
	for _, pkg := range packages {
		if pkg.Name == "twenty-watts-clrs-generator" {
			continue
		}
		locked[pkg.Name] = pkg
	}
	seen := make(map[string]bool, len(manifest.Artifacts))
	var total int64
	downloaded := 0
	built := 0
	previous := ""
	for _, artifact := range manifest.Artifacts {
		if artifact.Package <= previous || artifact.Package != canonicalGeneratorPackageName(artifact.Package) ||
			seen[artifact.Package] {
			return errors.New("generator wheelhouse artifacts must be unique and sorted by canonical package name")
		}
		previous = artifact.Package
		seen[artifact.Package] = true
		pkg, present := locked[artifact.Package]
		if !present || artifact.Version != pkg.Version || !validGeneratorWheelFilename(artifact.Filename) ||
			!lowerHex(artifact.SHA256, 64) || artifact.SizeBytes <= 0 {
			return fmt.Errorf("generator wheelhouse artifact %q is invalid", artifact.Package)
		}
		if artifact.SizeBytes > limitsSafeAddend(total) {
			return errors.New("generator wheelhouse byte total overflows")
		}
		total += artifact.SizeBytes
		switch artifact.Kind {
		case "downloaded-wheel":
			if !matchesLockedWheel(artifact, pkg.Artifacts) {
				return fmt.Errorf("generator wheelhouse artifact %q is not one exact locked wheel", artifact.Package)
			}
			downloaded++
		case "source-built-wheel":
			if artifact.Package != "promise" || artifact.Filename != promiseWheelFilename || artifact.URL != "" ||
				artifact.SHA256 != promiseWheelSHA256 || artifact.SizeBytes != promiseWheelSize {
				return errors.New("generator promise wheel differs from the frozen source-build output")
			}
			built++
		default:
			return fmt.Errorf("generator wheelhouse artifact %q has an invalid kind", artifact.Package)
		}
	}
	if len(seen) != len(locked) || downloaded != manifest.DownloadedWheelCount ||
		built != manifest.SourceBuiltWheelCount || total != manifest.TotalSizeBytes {
		return errors.New("generator wheelhouse manifest coverage or totals are invalid")
	}
	for name := range locked {
		if !seen[name] {
			return fmt.Errorf("generator wheelhouse manifest omits package %q", name)
		}
	}
	wantSourceBuild, err := lockedPromiseSourceBuild(input, packages, manifest.Artifacts)
	if err != nil {
		return err
	}
	if !equalGeneratorSourceBuild(manifest.SourceBuild, wantSourceBuild) {
		return errors.New("generator wheelhouse source-build recipe is invalid")
	}
	return nil
}

func matchesLockedWheel(entry GeneratorWheelhouseEntry, artifacts []lockedGeneratorArtifact) bool {
	for _, artifact := range artifacts {
		if artifact.Wheel && compatibleGeneratorWheelFilename(artifact.Filename) &&
			entry.Filename == artifact.Filename && entry.URL == artifact.URL &&
			entry.SHA256 == artifact.SHA256 && entry.SizeBytes == artifact.SizeBytes {
			return true
		}
	}
	return false
}

func validGeneratorWheelFilename(value string) bool {
	return value != "" && value == path.Base(value) && !strings.ContainsAny(value, "/\\\x00") &&
		strings.HasSuffix(value, ".whl")
}

func compatibleGeneratorWheelFilename(value string) bool {
	if !validGeneratorWheelFilename(value) {
		return false
	}
	fields := strings.Split(strings.TrimSuffix(value, ".whl"), "-")
	if len(fields) < 5 {
		return false
	}
	pythonTag := fields[len(fields)-3]
	abiTag := fields[len(fields)-2]
	platformTag := fields[len(fields)-1]
	if platformTag == "any" {
		return abiTag == "none" && (pythonTag == "py3" || pythonTag == "py2.py3")
	}
	for _, tag := range strings.Split(platformTag, ".") {
		if !compatibleGeneratorManylinuxTag(tag) {
			return false
		}
	}
	if pythonTag == "py3" || pythonTag == "py2.py3" {
		return abiTag == "none"
	}
	if pythonTag == "cp313" {
		return abiTag == "cp313" || abiTag == "abi3"
	}
	if !strings.HasPrefix(pythonTag, "cp3") || abiTag != "abi3" {
		return false
	}
	minor, err := strconv.Atoi(strings.TrimPrefix(pythonTag, "cp3"))
	return err == nil && minor >= 6 && minor <= 13
}

func compatibleGeneratorManylinuxTag(tag string) bool {
	switch tag {
	case "manylinux1_x86_64", "manylinux2010_x86_64", "manylinux2014_x86_64":
		return true
	}
	const prefix = "manylinux_2_"
	const suffix = "_x86_64"
	if !strings.HasPrefix(tag, prefix) || !strings.HasSuffix(tag, suffix) {
		return false
	}
	minorText := strings.TrimSuffix(strings.TrimPrefix(tag, prefix), suffix)
	minor, err := strconv.Atoi(minorText)
	return err == nil && minor >= 5 && minor <= generatorMaximumGlibcMinor
}

func lockedPromiseSourceBuild(
	input GeneratorLockInput,
	packages []lockedGeneratorPackage,
	selected []GeneratorWheelhouseEntry,
) (GeneratorWheelSourceBuild, error) {
	var source lockedGeneratorArtifact
	sourceCount := 0
	buildPackages := map[string]bool{"packaging": true, "setuptools": true, "wheel": true}
	lockedBuildPackages := make(map[string]lockedGeneratorPackage, len(buildPackages))
	for _, pkg := range packages {
		if pkg.Name == "promise" {
			for _, artifact := range pkg.Artifacts {
				if !artifact.Wheel {
					source = artifact
					sourceCount++
				}
			}
		}
		if buildPackages[pkg.Name] {
			lockedBuildPackages[pkg.Name] = pkg
		}
	}
	if sourceCount != 1 || source.Package != "promise" || source.Version != "2.3" || source.Wheel ||
		source.Filename != "promise-2.3.tar.gz" {
		return GeneratorWheelSourceBuild{}, errors.New("generator promise source artifact is invalid")
	}
	buildRequirements := make([]GeneratorWheelhouseEntry, 0, len(buildPackages))
	seenBuildPackages := make(map[string]bool, len(buildPackages))
	for _, artifact := range selected {
		if !buildPackages[artifact.Package] {
			continue
		}
		pkg, present := lockedBuildPackages[artifact.Package]
		if !present || seenBuildPackages[artifact.Package] || artifact.Version != pkg.Version ||
			artifact.Kind != "downloaded-wheel" || !matchesLockedWheel(artifact, pkg.Artifacts) {
			return GeneratorWheelSourceBuild{}, fmt.Errorf(
				"generator source-build requirement %q is not one selected exact locked wheel",
				artifact.Package,
			)
		}
		seenBuildPackages[artifact.Package] = true
		buildRequirements = append(buildRequirements, artifact)
	}
	for name := range buildPackages {
		if !seenBuildPackages[name] {
			return GeneratorWheelSourceBuild{}, fmt.Errorf(
				"generator source-build requirement %q is not selected",
				name,
			)
		}
	}
	sort.Slice(buildRequirements, func(left, right int) bool {
		return buildRequirements[left].Package < buildRequirements[right].Package
	})
	installCommand := []string{
		"/opt/build/bin/python", "-m", "pip", "install", "--isolated", "--disable-pip-version-check",
		"--no-input", "--no-cache-dir", "--no-index", "--no-deps",
	}
	for _, requirement := range buildRequirements {
		installCommand = append(installCommand, "/inputs/wheelhouse/"+requirement.Filename)
	}
	return GeneratorWheelSourceBuild{
		ProcedureState: "missing", ReproductionReceiptState: "missing",
		Package: "promise", Version: "2.3",
		Provenance: GeneratorWheelSourceProvenance{
			AcquiredOn: "2026-09-05", AccessRoute: "https-download-from-uv-lock-url", UploadTime: source.UploadTime,
			SPDX: "MIT", RepositoryLicensePath: promiseLicensePath, SourceLicensePath: "LICENSE",
			BuiltWheelLicensePath: "promise-2.3.dist-info/licenses/LICENSE",
			LicenseSHA256:         promiseLicenseSHA256, LicenseSizeBytes: promiseLicenseSize,
		},
		SourceURL: source.URL, SourceSHA256: source.SHA256, SourceSizeBytes: source.SizeBytes,
		BuilderImage:              input.Python.BaseImage,
		BuildRequirements:         buildRequirements,
		CandidateWorkingDirectory: "/work/promise-2.3",
		CandidateBootstrapCommand: []string{"python", "-m", "venv", "/opt/build"},
		CandidateInstallCommand:   installCommand,
		CandidateBuildCommand: []string{
			"/opt/build/bin/python", "setup.py", "bdist_wheel", "--dist-dir", "/output",
		},
		CandidateEnvironment:  slices.Clone(generatorSourceBuildEnvironment),
		RequiredReproductions: 2,
	}, nil
}

func equalGeneratorSourceBuild(left, right GeneratorWheelSourceBuild) bool {
	return left.ProcedureState == right.ProcedureState &&
		left.ReproductionReceiptState == right.ReproductionReceiptState &&
		left.Package == right.Package && left.Version == right.Version && left.Provenance == right.Provenance &&
		left.SourceURL == right.SourceURL &&
		left.SourceSHA256 == right.SourceSHA256 && left.SourceSizeBytes == right.SourceSizeBytes &&
		left.BuilderImage == right.BuilderImage && slices.Equal(left.BuildRequirements, right.BuildRequirements) &&
		left.CandidateWorkingDirectory == right.CandidateWorkingDirectory &&
		slices.Equal(left.CandidateBootstrapCommand, right.CandidateBootstrapCommand) &&
		slices.Equal(left.CandidateInstallCommand, right.CandidateInstallCommand) &&
		slices.Equal(left.CandidateBuildCommand, right.CandidateBuildCommand) &&
		slices.Equal(left.CandidateEnvironment, right.CandidateEnvironment) &&
		left.RequiredReproductions == right.RequiredReproductions
}

func parseLockedGeneratorPackages(body []byte) ([]lockedGeneratorPackage, error) {
	var packages []lockedGeneratorPackage
	var current *lockedGeneratorPackage
	for _, line := range strings.Split(string(body), "\n") {
		switch {
		case line == "[[package]]":
			packages = append(packages, lockedGeneratorPackage{})
			current = &packages[len(packages)-1]
		case current != nil && strings.HasPrefix(line, "name = \""):
			value, ok := quotedGeneratorField(line, "name")
			if !ok || current.Name != "" {
				return nil, errors.New("generator uv lock package name is malformed")
			}
			current.Name = canonicalGeneratorPackageName(value)
		case current != nil && strings.HasPrefix(line, "version = \""):
			value, ok := quotedGeneratorField(line, "version")
			if !ok || current.Version != "" {
				return nil, errors.New("generator uv lock package version is malformed")
			}
			current.Version = value
		case current != nil && (strings.HasPrefix(line, "sdist = { url = \"") || strings.HasPrefix(line, "    { url = \"")):
			artifact, err := lockedGeneratorArtifactFromLine(current.Name, current.Version, line)
			if err != nil {
				return nil, err
			}
			current.Artifacts = append(current.Artifacts, artifact)
		}
	}
	if len(packages) != lockedGeneratorPackageCount {
		return nil, fmt.Errorf("generator uv lock package count = %d, want %d", len(packages), lockedGeneratorPackageCount)
	}
	seen := make(map[string]bool, len(packages))
	for _, pkg := range packages {
		if pkg.Name == "" || pkg.Version == "" || seen[pkg.Name] {
			return nil, errors.New("generator uv lock contains an incomplete or duplicate package")
		}
		seen[pkg.Name] = true
	}
	return packages, nil
}

func lockedGeneratorArtifactFromLine(packageName, version, line string) (lockedGeneratorArtifact, error) {
	if packageName == "" || version == "" {
		return lockedGeneratorArtifact{}, errors.New("generator uv lock artifact precedes its package identity")
	}
	artifactURL, ok := quotedGeneratorField(line, "url")
	if !ok {
		return lockedGeneratorArtifact{}, errors.New("generator uv lock artifact URL is malformed")
	}
	parsed, err := url.Parse(artifactURL)
	if err != nil || parsed.Path == "" {
		return lockedGeneratorArtifact{}, errors.New("generator uv lock artifact URL is invalid")
	}
	filename := path.Base(parsed.Path)
	if filename == "." || filename == "/" || strings.Contains(filename, "%") {
		return lockedGeneratorArtifact{}, errors.New("generator uv lock artifact filename is invalid")
	}
	hash, ok := quotedGeneratorField(line, "hash")
	if !ok || !strings.HasPrefix(hash, "sha256:") {
		return lockedGeneratorArtifact{}, errors.New("generator uv lock artifact digest is malformed")
	}
	size, uploadTime, err := inspectGeneratorArtifact(line)
	if err != nil {
		return lockedGeneratorArtifact{}, err
	}
	return lockedGeneratorArtifact{
		Package: packageName, Version: version, Filename: filename, URL: artifactURL,
		SHA256: strings.TrimPrefix(hash, "sha256:"), SizeBytes: size,
		UploadTime: uploadTime.Format(time.RFC3339Nano), Wheel: strings.HasSuffix(filename, ".whl"),
	}, nil
}

// RenderGeneratorWheelhouseManifest derives a candidate manifest from one
// already materialised exact wheel directory. It performs no network access.
func RenderGeneratorWheelhouseManifest(repositoryRoot, wheelhouseDirectory string) ([]byte, error) {
	input, imageContract, dependencyLockBody, err := loadGeneratorWheelhouseInputs(repositoryRoot)
	if err != nil {
		return nil, err
	}
	packages, err := parseLockedGeneratorPackages(dependencyLockBody)
	if err != nil {
		return nil, err
	}
	artifacts, total, err := inspectMaterializedGeneratorWheelhouse(
		wheelhouseDirectory,
		packages,
		imageContract.Limits.DependencyArtifactBytes,
	)
	if err != nil {
		return nil, err
	}
	sourceBuild, err := lockedPromiseSourceBuild(input, packages, artifacts)
	if err != nil {
		return nil, err
	}
	manifest := GeneratorWheelhouseManifest{
		SchemaVersion: 1, Authority: ResultAuthority, State: "locked-selection", Platform: input.Platform,
		PythonVersion: input.Python.Version, BaseImage: input.Python.BaseImage, GlibcVersion: generatorGlibcVersion,
		DependencyLockSHA256: imageContract.DependencyLock.SHA256,
		SourceDateEpoch:      generatorSourceDateEpoch, PackageCount: len(artifacts), ArtifactCount: len(artifacts),
		DownloadedWheelCount: len(artifacts) - 1, SourceBuiltWheelCount: 1, TotalSizeBytes: total,
		Artifacts: artifacts, SourceBuild: sourceBuild,
	}
	body, err := strictjson.Canonical(manifest)
	if err != nil {
		return nil, fmt.Errorf("encode CLRS generator wheelhouse manifest: %w", err)
	}
	if _, err := ParseGeneratorWheelhouseManifest(body, dependencyLockBody, input, imageContract); err != nil {
		return nil, err
	}
	return body, nil
}

// VerifyGeneratorWheelhouse checks a materialised directory against the
// tracked manifest without invoking Python, a resolver, or the network.
func VerifyGeneratorWheelhouse(repositoryRoot, wheelhouseDirectory string) (GeneratorWheelhouseManifest, error) {
	if _, err := CheckGeneratorImageFoundation(repositoryRoot); err != nil {
		return GeneratorWheelhouseManifest{}, err
	}
	input, imageContract, dependencyLockBody, err := loadGeneratorWheelhouseInputs(repositoryRoot)
	if err != nil {
		return GeneratorWheelhouseManifest{}, err
	}
	root, err := cleanGeneratorRoot(repositoryRoot)
	if err != nil {
		return GeneratorWheelhouseManifest{}, err
	}
	tracked, err := readGeneratorFile(root, trackedGeneratorWheelhousePath, imageContract.Limits.WheelhouseManifestBytes)
	if err != nil {
		return GeneratorWheelhouseManifest{}, err
	}
	manifest, err := ParseGeneratorWheelhouseManifest(tracked, dependencyLockBody, input, imageContract)
	if err != nil {
		return GeneratorWheelhouseManifest{}, err
	}
	rendered, err := RenderGeneratorWheelhouseManifest(repositoryRoot, wheelhouseDirectory)
	if err != nil {
		return GeneratorWheelhouseManifest{}, err
	}
	if !bytes.Equal(rendered, tracked) {
		return GeneratorWheelhouseManifest{}, errors.New("materialised CLRS generator wheelhouse differs from the tracked manifest")
	}
	return manifest, nil
}

// WriteGeneratorWheelhouseManifest writes one new candidate manifest without
// replacing an existing path. Review and commit remain separate operations.
func WriteGeneratorWheelhouseManifest(repositoryRoot, wheelhouseDirectory, output string) (string, int64, error) {
	body, err := RenderGeneratorWheelhouseManifest(repositoryRoot, wheelhouseDirectory)
	if err != nil {
		return "", 0, err
	}
	return writeNewGeneratorWheelhouseManifest(wheelhouseDirectory, output, body)
}

func writeNewGeneratorWheelhouseManifest(wheelhouseDirectory, output string, body []byte) (string, int64, error) {
	return writeNewGeneratorWheelhouseManifestWithInterlock(wheelhouseDirectory, output, body, nil)
}

func writeNewGeneratorWheelhouseManifestWithInterlock(
	wheelhouseDirectory, output string,
	body []byte,
	afterClose func() error,
) (digest string, size int64, writeErr error) {
	if output == "" {
		return "", 0, errors.New("CLRS generator wheelhouse manifest output is required")
	}
	if len(body) == 0 {
		return "", 0, errors.New("CLRS generator wheelhouse manifest body is required")
	}
	absolute, err := filepath.Abs(output)
	if err != nil {
		return "", 0, fmt.Errorf("resolve CLRS generator wheelhouse manifest output: %w", err)
	}
	absolute = filepath.Clean(absolute)
	parent, err := cleanGeneratorRoot(filepath.Dir(absolute))
	if err != nil || parent != filepath.Dir(absolute) {
		return "", 0, errors.New("CLRS generator wheelhouse manifest output parent must be one real canonical directory")
	}
	wheelhouse, err := cleanGeneratorRoot(wheelhouseDirectory)
	if err != nil {
		return "", 0, fmt.Errorf("inspect CLRS generator wheelhouse output boundary: %w", err)
	}
	if relative, relativeErr := filepath.Rel(wheelhouse, absolute); relativeErr == nil &&
		(relative == "." || (relative != ".." && !strings.HasPrefix(relative, ".."+string(filepath.Separator)))) {
		return "", 0, errors.New("CLRS generator wheelhouse manifest output must be outside the wheel directory")
	}
	name := filepath.Base(absolute)
	if name == "." || name == string(filepath.Separator) {
		return "", 0, errors.New("CLRS generator wheelhouse manifest output needs a file name")
	}
	namedParentState, err := inspectGeneratorRootPath(parent)
	if err != nil {
		return "", 0, fmt.Errorf("inspect CLRS generator wheelhouse manifest output parent: %w", err)
	}
	parentRoot, err := os.OpenRoot(parent)
	if err != nil {
		return "", 0, fmt.Errorf("open CLRS generator wheelhouse manifest output parent: %w", err)
	}
	defer parentRoot.Close()
	parentState, err := parentRoot.Stat(".")
	if err != nil || !sameGeneratorDirectoryIdentity(namedParentState, parentState) {
		return "", 0, errors.New("CLRS generator wheelhouse manifest output parent is not a stable directory")
	}
	file, err := parentRoot.OpenFile(name, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o600)
	if err != nil {
		return "", 0, fmt.Errorf("create CLRS generator wheelhouse manifest output: %w", err)
	}
	createdState, err := file.Stat()
	if err != nil || !createdState.Mode().IsRegular() {
		_ = file.Close()
		return "", 0, errors.New("created CLRS generator wheelhouse manifest is not a regular file")
	}
	defer func() {
		_ = file.Close()
		if writeErr != nil {
			writeErr = fmt.Errorf(
				"%w; output name %q was left untouched under the opened output directory",
				writeErr,
				name,
			)
		}
	}()
	if _, err := file.Write(body); err != nil {
		return "", 0, fmt.Errorf("write CLRS generator wheelhouse manifest: %w", err)
	}
	if err := file.Sync(); err != nil {
		return "", 0, fmt.Errorf("synchronise CLRS generator wheelhouse manifest: %w", err)
	}
	if err := file.Chmod(0o644); err != nil {
		return "", 0, fmt.Errorf("set CLRS generator wheelhouse manifest mode: %w", err)
	}
	writtenState, err := file.Stat()
	if err != nil || !writtenState.Mode().IsRegular() || writtenState.Size() != int64(len(body)) {
		return "", 0, errors.New("written CLRS generator wheelhouse manifest is not the expected regular file")
	}
	if err := file.Close(); err != nil {
		return "", 0, fmt.Errorf("close CLRS generator wheelhouse manifest: %w", err)
	}
	if afterClose != nil {
		if err := afterClose(); err != nil {
			return "", 0, fmt.Errorf("run CLRS generator manifest write interlock: %w", err)
		}
	}
	published, err := parentRoot.Open(name)
	if err != nil {
		return "", 0, errors.New("published CLRS generator wheelhouse manifest could not be reopened")
	}
	defer published.Close()
	publishedState, err := published.Stat()
	if err != nil || !publishedState.Mode().IsRegular() || !os.SameFile(writtenState, publishedState) ||
		publishedState.Size() != int64(len(body)) {
		return "", 0, errors.New("published CLRS generator wheelhouse manifest is not the expected regular file")
	}
	publishedBody, err := io.ReadAll(io.LimitReader(published, int64(len(body))+1))
	if err != nil || len(publishedBody) != len(body) || !bytes.Equal(publishedBody, body) {
		return "", 0, errors.New("published CLRS generator wheelhouse manifest bytes do not match the candidate")
	}
	readState, err := published.Stat()
	if err != nil || !unchangedGeneratorFile(publishedState, readState) {
		return "", 0, errors.New("published CLRS generator wheelhouse manifest changed during confirmation")
	}
	if _, err := published.Seek(0, io.SeekStart); err != nil {
		return "", 0, errors.New("published CLRS generator wheelhouse manifest could not be rewound")
	}
	confirmation, err := io.ReadAll(io.LimitReader(published, int64(len(body))+1))
	if err != nil || !bytes.Equal(publishedBody, confirmation) {
		return "", 0, errors.New("published CLRS generator wheelhouse manifest changed during confirmation")
	}
	confirmedState, err := published.Stat()
	if err != nil || !unchangedGeneratorFile(readState, confirmedState) ||
		!unchangedGeneratorFile(writtenState, confirmedState) {
		return "", 0, errors.New("published CLRS generator wheelhouse manifest changed during confirmation")
	}
	rootInformation, err := parentRoot.Lstat(name)
	if err != nil || !unchangedGeneratorFile(confirmedState, rootInformation) {
		return "", 0, errors.New("published CLRS generator wheelhouse manifest is not the expected regular file")
	}
	namedParentState, err = os.Lstat(parent)
	if err != nil || !sameGeneratorDirectoryIdentity(parentState, namedParentState) {
		return "", 0, errors.New("CLRS generator wheelhouse manifest output parent changed during creation")
	}
	information, err := os.Lstat(absolute)
	if err != nil || !information.Mode().IsRegular() || information.Mode()&os.ModeSymlink != 0 ||
		!os.SameFile(rootInformation, information) || information.Size() != int64(len(body)) {
		return "", 0, errors.New("published CLRS generator wheelhouse manifest is not the expected regular file")
	}
	return rawSHA256(confirmation), int64(len(confirmation)), nil
}

func loadGeneratorWheelhouseInputs(
	repositoryRoot string,
) (GeneratorLockInput, GeneratorImageContract, []byte, error) {
	root, err := cleanGeneratorRoot(repositoryRoot)
	if err != nil {
		return GeneratorLockInput{}, GeneratorImageContract{}, nil, err
	}
	sourceBody, err := readGeneratorFile(root, trackedSourcePath, maximumSourceRecordBytes)
	if err != nil {
		return GeneratorLockInput{}, GeneratorImageContract{}, nil, err
	}
	source, err := ParseSourceRecord(sourceBody)
	if err != nil {
		return GeneratorLockInput{}, GeneratorImageContract{}, nil, err
	}
	generationBody, err := readGeneratorFile(root, trackedGenerationPath, maximumGenerationContractBytes)
	if err != nil {
		return GeneratorLockInput{}, GeneratorImageContract{}, nil, err
	}
	generation, err := ParseGenerationContract(generationBody, source)
	if err != nil {
		return GeneratorLockInput{}, GeneratorImageContract{}, nil, err
	}
	lockInputBody, err := readGeneratorFile(root, trackedLockInputPath, maximumGeneratorLockInputBytes)
	if err != nil {
		return GeneratorLockInput{}, GeneratorImageContract{}, nil, err
	}
	input, err := ParseGeneratorLockInput(lockInputBody, source)
	if err != nil {
		return GeneratorLockInput{}, GeneratorImageContract{}, nil, err
	}
	imageBody, err := readGeneratorFile(root, trackedImageContractPath, maximumGeneratorImageContractBytes)
	if err != nil {
		return GeneratorLockInput{}, GeneratorImageContract{}, nil, err
	}
	imageContract, err := ParseGeneratorImageContract(imageBody, lockInputBody, source, generation)
	if err != nil {
		return GeneratorLockInput{}, GeneratorImageContract{}, nil, err
	}
	projectBody, err := readGeneratorFile(root, imageContract.DependencyLock.ProjectPath, maximumGeneratorProjectBytes)
	if err != nil {
		return GeneratorLockInput{}, GeneratorImageContract{}, nil, err
	}
	dependencyLockBody, err := readGeneratorFile(
		root,
		imageContract.DependencyLock.Path,
		maximumGeneratorDependencyLockBytes,
	)
	if err != nil {
		return GeneratorLockInput{}, GeneratorImageContract{}, nil, err
	}
	if err := validateGeneratorDependencyFiles(
		imageContract.DependencyLock,
		projectBody,
		dependencyLockBody,
		input,
		imageContract.Limits,
	); err != nil {
		return GeneratorLockInput{}, GeneratorImageContract{}, nil, err
	}
	return input, imageContract, dependencyLockBody, nil
}

func inspectMaterializedGeneratorWheelhouse(
	directory string,
	packages []lockedGeneratorPackage,
	maximumBytes int64,
) ([]GeneratorWheelhouseEntry, int64, error) {
	root, err := cleanGeneratorRoot(directory)
	if err != nil {
		return nil, 0, fmt.Errorf("inspect CLRS generator wheelhouse: %w", err)
	}
	initial, err := readGeneratorWheelhouseSnapshot(root, generatorRuntimePackageCount)
	if err != nil {
		return nil, 0, err
	}
	byFilename := make(map[string]lockedGeneratorArtifact)
	for _, pkg := range packages {
		for _, artifact := range pkg.Artifacts {
			if artifact.Wheel && compatibleGeneratorWheelFilename(artifact.Filename) {
				if _, duplicate := byFilename[artifact.Filename]; duplicate {
					return nil, 0, fmt.Errorf("generator uv lock repeats wheel filename %q", artifact.Filename)
				}
				byFilename[artifact.Filename] = artifact
			}
		}
	}
	selected := make([]GeneratorWheelhouseEntry, 0, len(initial.Entries))
	seenPackages := make(map[string]bool, len(initial.Entries))
	var total int64
	for _, snapshot := range initial.Entries {
		name := snapshot.Name
		var selectedEntry GeneratorWheelhouseEntry
		var expectedSHA256 string
		var expectedSize int64
		if name == promiseWheelFilename {
			expectedSHA256 = promiseWheelSHA256
			expectedSize = promiseWheelSize
			selectedEntry = GeneratorWheelhouseEntry{
				Package: "promise", Version: "2.3", Kind: "source-built-wheel", Filename: name,
				URL: "", SHA256: expectedSHA256, SizeBytes: expectedSize,
			}
		} else {
			locked, present := byFilename[name]
			if !present {
				return nil, 0, fmt.Errorf("CLRS generator wheelhouse entry %q is not a compatible uv-lock wheel", name)
			}
			expectedSHA256 = locked.SHA256
			expectedSize = locked.SizeBytes
			selectedEntry = GeneratorWheelhouseEntry{
				Package: locked.Package, Version: locked.Version, Kind: "downloaded-wheel", Filename: locked.Filename,
				URL: locked.URL, SHA256: locked.SHA256, SizeBytes: locked.SizeBytes,
			}
		}
		if snapshot.Information.Size() != expectedSize || expectedSize <= 0 || maximumBytes <= 0 ||
			expectedSize > limitsSafeAddend(total) || expectedSize > maximumBytes-total {
			return nil, 0, fmt.Errorf("CLRS generator wheelhouse entry %q has an invalid or unbounded size", name)
		}
		digest, err := digestGeneratorWheel(filepath.Join(root, name), snapshot.Information, expectedSize)
		if err != nil {
			return nil, 0, err
		}
		if digest != expectedSHA256 {
			return nil, 0, fmt.Errorf("CLRS generator wheelhouse entry %q has the wrong digest", name)
		}
		if seenPackages[selectedEntry.Package] {
			return nil, 0, fmt.Errorf("CLRS generator wheelhouse repeats package %q", selectedEntry.Package)
		}
		seenPackages[selectedEntry.Package] = true
		total += expectedSize
		selected = append(selected, selectedEntry)
	}
	if err := confirmGeneratorWheelhouseSnapshot(root, initial); err != nil {
		return nil, 0, err
	}
	sort.Slice(selected, func(left, right int) bool { return selected[left].Package < selected[right].Package })
	return selected, total, nil
}

type generatorWheelhouseSnapshot struct {
	Directory os.FileInfo
	Entries   []generatorWheelhouseSnapshotEntry
}

type generatorWheelhouseSnapshotEntry struct {
	Name        string
	Information os.FileInfo
}

func readGeneratorWheelhouseSnapshot(root string, expectedCount int) (generatorWheelhouseSnapshot, error) {
	if expectedCount < 1 || expectedCount > generatorRuntimePackageCount {
		return generatorWheelhouseSnapshot{}, errors.New("CLRS generator wheelhouse expected count is outside the bounded runtime set")
	}
	directory, err := os.Open(root)
	if err != nil {
		return generatorWheelhouseSnapshot{}, fmt.Errorf("open CLRS generator wheelhouse: %w", err)
	}
	defer directory.Close()
	opened, err := directory.Stat()
	if err != nil || !opened.IsDir() {
		return generatorWheelhouseSnapshot{}, errors.New("CLRS generator wheelhouse is not a stable directory")
	}
	named, err := os.Lstat(root)
	if err != nil || !unchangedGeneratorDirectory(opened, named) {
		return generatorWheelhouseSnapshot{}, errors.New("CLRS generator wheelhouse changed before it was opened")
	}
	entries := make([]os.DirEntry, 0, expectedCount+1)
	for len(entries) <= expectedCount {
		batch, readErr := directory.ReadDir(expectedCount + 1 - len(entries))
		entries = append(entries, batch...)
		if errors.Is(readErr, io.EOF) {
			break
		}
		if readErr != nil {
			return generatorWheelhouseSnapshot{}, fmt.Errorf("read CLRS generator wheelhouse: %w", readErr)
		}
		if len(batch) == 0 {
			return generatorWheelhouseSnapshot{}, errors.New("read CLRS generator wheelhouse made no bounded progress")
		}
	}
	if len(entries) != expectedCount {
		return generatorWheelhouseSnapshot{}, fmt.Errorf(
			"CLRS generator wheelhouse contains %d files, want %d",
			len(entries),
			expectedCount,
		)
	}
	sort.Slice(entries, func(left, right int) bool { return entries[left].Name() < entries[right].Name() })
	snapshot := generatorWheelhouseSnapshot{Directory: opened, Entries: make([]generatorWheelhouseSnapshotEntry, 0, len(entries))}
	for _, entry := range entries {
		if entry.IsDir() || entry.Type()&os.ModeSymlink != 0 || !validGeneratorWheelFilename(entry.Name()) {
			return generatorWheelhouseSnapshot{}, fmt.Errorf("CLRS generator wheelhouse entry %q is not one regular wheel", entry.Name())
		}
		information, inspectErr := os.Lstat(filepath.Join(root, entry.Name()))
		if inspectErr != nil || !information.Mode().IsRegular() || information.Mode()&os.ModeSymlink != 0 ||
			information.Size() <= 0 {
			return generatorWheelhouseSnapshot{}, fmt.Errorf("CLRS generator wheelhouse entry %q changed before hashing", entry.Name())
		}
		snapshot.Entries = append(snapshot.Entries, generatorWheelhouseSnapshotEntry{
			Name: entry.Name(), Information: information,
		})
	}
	closed, err := directory.Stat()
	if err != nil || !unchangedGeneratorDirectory(opened, closed) {
		return generatorWheelhouseSnapshot{}, errors.New("CLRS generator wheelhouse changed while it was listed")
	}
	named, err = os.Lstat(root)
	if err != nil || !unchangedGeneratorDirectory(closed, named) {
		return generatorWheelhouseSnapshot{}, errors.New("CLRS generator wheelhouse changed while it was listed")
	}
	return snapshot, nil
}

func confirmGeneratorWheelhouseSnapshot(root string, initial generatorWheelhouseSnapshot) error {
	final, err := readGeneratorWheelhouseSnapshot(root, len(initial.Entries))
	if err != nil {
		return err
	}
	if !unchangedGeneratorDirectory(initial.Directory, final.Directory) || len(initial.Entries) != len(final.Entries) {
		return errors.New("CLRS generator wheelhouse changed while it was verified")
	}
	for index := range initial.Entries {
		before := initial.Entries[index]
		after := final.Entries[index]
		if before.Name != after.Name || !unchangedGeneratorFile(before.Information, after.Information) {
			return errors.New("CLRS generator wheelhouse changed while it was verified")
		}
	}
	return nil
}

func unchangedGeneratorDirectory(before, after os.FileInfo) bool {
	return sameGeneratorDirectoryIdentity(before, after) && before.Mode() == after.Mode() &&
		before.Size() == after.Size() && before.ModTime().Equal(after.ModTime())
}

func sameGeneratorDirectoryIdentity(before, after os.FileInfo) bool {
	return before.IsDir() && after.IsDir() && before.Mode()&os.ModeSymlink == 0 && after.Mode()&os.ModeSymlink == 0 &&
		os.SameFile(before, after)
}

func digestGeneratorWheel(file string, initial os.FileInfo, expectedSize int64) (string, error) {
	return digestGeneratorWheelWithInterlock(file, initial, expectedSize, nil)
}

func digestGeneratorWheelWithInterlock(
	file string,
	initial os.FileInfo,
	expectedSize int64,
	afterRead func() error,
) (string, error) {
	namedBefore, err := os.Lstat(file)
	if err != nil || !unchangedGeneratorFile(initial, namedBefore) {
		return "", errors.New("CLRS generator wheel changed before it was opened")
	}
	input, err := os.Open(file)
	if err != nil {
		return "", fmt.Errorf("open CLRS generator wheel: %w", err)
	}
	defer input.Close()
	opened, err := input.Stat()
	if err != nil || !unchangedGeneratorFile(initial, opened) {
		return "", errors.New("CLRS generator wheel changed before it was opened")
	}
	namedOpened, err := os.Lstat(file)
	if err != nil || !unchangedGeneratorFile(opened, namedOpened) {
		return "", errors.New("CLRS generator wheel changed before it was hashed")
	}
	digest := sha256.New()
	written, err := io.Copy(digest, io.LimitReader(input, expectedSize+1))
	if err != nil || written != expectedSize {
		return "", errors.New("CLRS generator wheel changed while it was read")
	}
	if afterRead != nil {
		if err := afterRead(); err != nil {
			return "", fmt.Errorf("run CLRS generator wheel stable-read interlock: %w", err)
		}
	}
	final, err := input.Stat()
	if err != nil || !unchangedGeneratorFile(opened, final) {
		return "", errors.New("CLRS generator wheel changed while it was hashed")
	}
	namedFinal, err := os.Lstat(file)
	if err != nil || !unchangedGeneratorFile(final, namedFinal) {
		return "", errors.New("CLRS generator wheel changed while it was hashed")
	}
	return hex.EncodeToString(digest.Sum(nil)), nil
}
