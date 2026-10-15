package clrsfixture

import (
	"bytes"
	"errors"
	"fmt"
	"maps"
	"net/url"
	"slices"
	"strconv"
	"strings"
	"time"
)

const (
	maximumGeneratorProjectBytes        = 64 << 10
	maximumGeneratorDependencyLockBytes = 16 << 20
	lockedGeneratorPackageCount         = 62
	lockedGeneratorArtifactCount        = 135
	generatorResolutionMarker           = "implementation_name == 'cpython' and platform_machine == 'x86_64' and sys_platform == 'linux'"
)

func validateGeneratorDependencyFiles(
	metadata GeneratorDependencyLock,
	projectBody, lockBody []byte,
	input GeneratorLockInput,
	limits GeneratorImageLimits,
) error {
	if metadata.PackageCount != lockedGeneratorPackageCount || metadata.ArtifactCount != lockedGeneratorArtifactCount {
		return errors.New("generator dependency lock counts differ from the reviewed graph")
	}
	if rawSHA256(projectBody) != metadata.ProjectSHA256 || rawSHA256(lockBody) != metadata.SHA256 {
		return errors.New("generator dependency project or lock digest is invalid")
	}
	wantProject, err := renderGeneratorProject(input)
	if err != nil {
		return err
	}
	if !bytes.Equal(projectBody, wantProject) {
		return errors.New("generator pyproject does not match the reviewed lock input")
	}
	packages, artifacts, artifactBytes, err := inspectGeneratorDependencyLock(lockBody, input)
	if err != nil {
		return err
	}
	if packages != metadata.PackageCount || artifacts != metadata.ArtifactCount {
		return fmt.Errorf(
			"generator dependency lock contains %d packages and %d artifacts, want %d and %d",
			packages,
			artifacts,
			metadata.PackageCount,
			metadata.ArtifactCount,
		)
	}
	if artifactBytes > limits.DependencyArtifactBytes {
		return fmt.Errorf(
			"generator dependency lock records %d artifact bytes, limit %d",
			artifactBytes,
			limits.DependencyArtifactBytes,
		)
	}
	return nil
}

func renderGeneratorProject(input GeneratorLockInput) ([]byte, error) {
	if _, err := generatorPackageCutoffs(input.Resolver); err != nil {
		return nil, err
	}
	pythonRequirement, err := generatorPythonRequirement(input.Python.Version)
	if err != nil {
		return nil, err
	}
	requirements, err := generatorProjectRequirements(input)
	if err != nil {
		return nil, err
	}

	var body strings.Builder
	body.WriteString("[project]\n")
	body.WriteString("name = \"twenty-watts-clrs-generator\"\n")
	body.WriteString("version = \"0.0.0\"\n")
	fmt.Fprintf(&body, "requires-python = %s\n", strconv.Quote(pythonRequirement))
	body.WriteString("dependencies = [\n")
	for _, requirement := range requirements {
		fmt.Fprintf(&body, "  %s,\n", strconv.Quote(requirement))
	}
	body.WriteString("]\n\n[tool.uv]\n")
	body.WriteString("package = false\n")
	body.WriteString("resolution = \"highest\"\n")
	fmt.Fprintf(&body, "prerelease = %s\n", strconv.Quote(input.Resolver.Prerelease))
	fmt.Fprintf(&body, "exclude-newer = %s\n", strconv.Quote(input.Resolver.ExcludeNewer))
	body.WriteString("environments = [\n")
	body.WriteString("  \"implementation_name == 'cpython' and sys_platform == 'linux' and platform_machine == 'x86_64'\",\n")
	body.WriteString("]\n")
	body.WriteString("required-environments = [\n")
	body.WriteString("  \"implementation_name == 'cpython' and sys_platform == 'linux' and platform_machine == 'x86_64'\",\n")
	body.WriteString("]\n")
	body.WriteString(renderGeneratorPackageCutoffs("tool.uv", input.Resolver))
	return []byte(body.String()), nil
}

func generatorProjectRequirements(input GeneratorLockInput) ([]string, error) {
	pinned := make(map[string]string, len(input.SelectedCandidates))
	for _, candidate := range input.SelectedCandidates {
		name := canonicalGeneratorPackageName(candidate.Name)
		if name == "" || pinned[name] != "" {
			return nil, errors.New("generator selected requirements contain a duplicate or empty name")
		}
		pinned[name] = candidate.Requirement
	}

	requirements := make([]string, 0, len(input.UpstreamRequirements.Constraints)+len(input.SupplementalRequirements))
	seen := make(map[string]bool, cap(requirements))
	for _, constraint := range input.UpstreamRequirements.Constraints {
		name, suffix, err := splitGeneratorRequirement(constraint)
		if err != nil {
			return nil, err
		}
		name = canonicalGeneratorPackageName(name)
		requirement := name + suffix
		if selected := pinned[name]; selected != "" {
			requirement = selected
		}
		if seen[name] {
			return nil, fmt.Errorf("generator project requirement %q is repeated", name)
		}
		seen[name] = true
		requirements = append(requirements, requirement)
	}
	for _, supplemental := range input.SupplementalRequirements {
		name, _, err := splitGeneratorRequirement(supplemental.Requirement)
		if err != nil {
			return nil, err
		}
		name = canonicalGeneratorPackageName(name)
		if seen[name] {
			return nil, fmt.Errorf("generator supplemental requirement %q duplicates an upstream requirement", name)
		}
		seen[name] = true
		requirements = append(requirements, supplemental.Requirement)
	}
	for _, candidate := range input.SelectedCandidates {
		name := canonicalGeneratorPackageName(candidate.Name)
		if !seen[name] {
			return nil, fmt.Errorf("generator selected requirement %q is absent from the project", name)
		}
	}

	return requirements, nil
}

func renderGeneratorPackageCutoffs(table string, resolver GeneratorResolver) string {
	if len(resolver.ExcludeNewerPackage) == 0 {
		return ""
	}
	var body strings.Builder
	fmt.Fprintf(&body, "\n[%s.exclude-newer-package]\n", table)
	for _, name := range slices.Sorted(maps.Keys(resolver.ExcludeNewerPackage)) {
		fmt.Fprintf(&body, "%s = %s\n", name, strconv.Quote(resolver.ExcludeNewerPackage[name]))
	}
	return body.String()
}

func inspectGeneratorDependencyLock(body []byte, input GeneratorLockInput) (int, int, int64, error) {
	if len(body) == 0 || len(body) > maximumGeneratorDependencyLockBytes || body[len(body)-1] != '\n' || bytes.Contains(body, []byte{'\r'}) {
		return 0, 0, 0, errors.New("generator uv lock has an invalid size or line encoding")
	}
	pythonRequirement, err := generatorPythonRequirement(input.Python.Version)
	if err != nil {
		return 0, 0, 0, err
	}
	prefix := fmt.Sprintf(
		"version = 1\nrevision = 3\nrequires-python = %s\nresolution-markers = [\n    %s,\n]\nsupported-markers = [\n    %s,\n]\nrequired-markers = [\n    %s,\n]\n\n[options]\nexclude-newer = %s\n\n",
		strconv.Quote(pythonRequirement),
		strconv.Quote(generatorResolutionMarker),
		strconv.Quote(generatorResolutionMarker),
		strconv.Quote(generatorResolutionMarker),
		strconv.Quote(input.Resolver.ExcludeNewer),
	)
	prefix = strings.TrimSuffix(prefix, "\n") + renderGeneratorPackageCutoffs("options", input.Resolver) + "\n"
	if !bytes.HasPrefix(body, []byte(prefix)) {
		return 0, 0, 0, errors.New("generator uv lock header differs from the reviewed resolver boundary")
	}
	packages, err := parseLockedGeneratorPackages(body)
	if err != nil {
		return 0, 0, 0, err
	}
	artifacts, artifactBytes, err := inspectGeneratorPackageArtifacts(packages, input.Resolver)
	if err != nil {
		return 0, 0, 0, err
	}
	for _, candidate := range input.SelectedCandidates {
		identity := "name = " + strconv.Quote(canonicalGeneratorPackageName(candidate.Name)) + "\nversion = " + strconv.Quote(candidate.Version) + "\n"
		artifact := "url = " + strconv.Quote(candidate.URL) + ", hash = " + strconv.Quote("sha256:"+candidate.SHA256) + ", size = " + strconv.FormatInt(candidate.SizeBytes, 10)
		if !strings.Contains(string(body), identity) || !strings.Contains(string(body), artifact) {
			return 0, 0, 0, fmt.Errorf("generator dependency lock is missing selected candidate %q", candidate.Name)
		}
	}
	return len(packages), artifacts, artifactBytes, nil
}

func inspectGeneratorPackageArtifacts(packages []lockedGeneratorPackage, resolver GeneratorResolver) (int, int64, error) {
	cutoffs, err := generatorPackageCutoffs(resolver)
	if err != nil {
		return 0, 0, err
	}
	global, err := time.Parse(time.RFC3339, resolver.ExcludeNewer)
	if err != nil {
		return 0, 0, fmt.Errorf("parse generator global cutoff: %w", err)
	}
	artifacts := 0
	var artifactBytes int64
	for _, pkg := range packages {
		cutoff := global
		if specific, exists := cutoffs[pkg.Name]; exists {
			cutoff = specific
			delete(cutoffs, pkg.Name)
		}
		for _, artifact := range pkg.Artifacts {
			uploadTime, err := time.Parse(time.RFC3339Nano, artifact.UploadTime)
			if err != nil {
				return 0, 0, fmt.Errorf("parse generator artifact upload time for %q: %w", pkg.Name, err)
			}
			if uploadTime.After(cutoff) {
				return 0, 0, fmt.Errorf("generator dependency artifact for %q was uploaded after the resolution cutoff %s", pkg.Name, cutoff.Format(time.RFC3339))
			}
			if artifact.SizeBytes > limitsSafeAddend(artifactBytes) {
				return 0, 0, errors.New("generator dependency artifact byte sum overflows")
			}
			artifactBytes += artifact.SizeBytes
			artifacts++
		}
	}
	if len(cutoffs) != 0 {
		return 0, 0, errors.New("generator package cutoff names a package absent from the lock")
	}
	return artifacts, artifactBytes, nil
}

func inspectGeneratorArtifact(line string) (int64, time.Time, error) {
	artifactURL, ok := quotedGeneratorField(line, "url")
	if !ok {
		return 0, time.Time{}, errors.New("generator dependency artifact URL is malformed")
	}
	parsed, err := url.Parse(artifactURL)
	if err != nil || parsed.Scheme != "https" || parsed.Host != "files.pythonhosted.org" || parsed.User != nil ||
		parsed.RawQuery != "" || parsed.Fragment != "" || parsed.Path == "" {
		return 0, time.Time{}, errors.New("generator dependency artifact URL is outside the locked PyPI host")
	}
	hash, ok := quotedGeneratorField(line, "hash")
	if !ok || !strings.HasPrefix(hash, "sha256:") || !lowerHex(strings.TrimPrefix(hash, "sha256:"), 64) {
		return 0, time.Time{}, errors.New("generator dependency artifact digest is invalid")
	}
	sizeText, ok := scalarGeneratorField(line, "size")
	if !ok {
		return 0, time.Time{}, errors.New("generator dependency artifact size is malformed")
	}
	size, err := strconv.ParseInt(sizeText, 10, 64)
	if err != nil || size <= 0 {
		return 0, time.Time{}, errors.New("generator dependency artifact size is invalid")
	}
	uploadText, ok := quotedGeneratorField(line, "upload-time")
	if !ok {
		return 0, time.Time{}, errors.New("generator dependency artifact upload time is malformed")
	}
	uploadTime, err := time.Parse(time.RFC3339Nano, uploadText)
	if err != nil {
		return 0, time.Time{}, errors.New("generator dependency artifact upload time is invalid")
	}
	return size, uploadTime, nil
}

func quotedGeneratorField(line, name string) (string, bool) {
	prefix := name + " = \""
	start := strings.Index(line, prefix)
	if start < 0 {
		return "", false
	}
	start += len(prefix)
	end := strings.IndexByte(line[start:], '"')
	if end < 0 {
		return "", false
	}
	return line[start : start+end], true
}

func scalarGeneratorField(line, name string) (string, bool) {
	prefix := name + " = "
	start := strings.Index(line, prefix)
	if start < 0 {
		return "", false
	}
	start += len(prefix)
	end := strings.IndexByte(line[start:], ',')
	if end < 0 {
		return "", false
	}
	return line[start : start+end], true
}

func splitGeneratorRequirement(requirement string) (string, string, error) {
	boundary := strings.IndexAny(requirement, "<=>!~ ")
	if boundary <= 0 {
		return "", "", fmt.Errorf("generator requirement %q has no version boundary", requirement)
	}
	return requirement[:boundary], requirement[boundary:], nil
}

func generatorPythonRequirement(version string) (string, error) {
	parts := strings.Split(version, ".")
	if len(parts) != 3 {
		return "", fmt.Errorf("generator Python version %q is invalid", version)
	}
	for _, part := range parts {
		if part == "" || strings.Trim(part, "0123456789") != "" {
			return "", fmt.Errorf("generator Python version %q is invalid", version)
		}
	}
	return "==" + parts[0] + "." + parts[1] + ".*", nil
}

func canonicalGeneratorPackageName(name string) string {
	return strings.ToLower(strings.ReplaceAll(name, "_", "-"))
}

func limitsSafeAddend(current int64) int64 {
	return int64(^uint64(0)>>1) - current
}
