package clrsfixture

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"path"
	"sort"
	"strings"
)

func checkSBOMInventoryPackages(ctx context.Context, body []byte, wheels GeneratorWheelhouseManifest) (int, []GeneratorSBOMPackage, []GeneratorSBOMPackage, error) {
	object, err := sbomObject(body, "SPDXID creationInfo dataLicense documentNamespace files hasExtractedLicensingInfos name packages relationships spdxVersion", "")
	if err != nil {
		return 0, nil, nil, err
	}
	if jsonString(object, "SPDXID") != "SPDXRef-DOCUMENT" || jsonString(object, "spdxVersion") != "SPDX-2.3" ||
		jsonString(object, "dataLicense") != "CC0-1.0" || !sbomText(jsonString(object, "documentNamespace"), 4096) ||
		!sbomText(jsonString(object, "name"), 4096) {
		return 0, nil, nil, errors.New("SBOM predicate requires the retained SPDX-2.3 document identity profile")
	}
	var packages []json.RawMessage
	if err := json.Unmarshal(object["packages"], &packages); err != nil || len(packages) == 0 || len(packages) > sbomMaximumPackages {
		return 0, nil, nil, errors.New("SBOM predicate requires 1 to 10000 package records")
	}
	python := strings.Split(wheels.PythonVersion, ".")
	if len(python) != 3 {
		return 0, nil, nil, errors.New("SBOM wheelhouse Python version is invalid")
	}
	prefix := "/opt/venv/lib/python" + python[0] + "." + python[1] + "/site-packages/"
	seenIDs := make(map[string]bool)
	installed := make(map[string]GeneratorSBOMPackage)
	for _, body := range packages {
		if err := ctx.Err(); err != nil {
			return 0, nil, nil, err
		}
		pkg, source, err := parseSBOMPackage(body)
		if err != nil {
			return 0, nil, nil, err
		}
		if seenIDs[pkg.SPDXID] {
			return 0, nil, nil, errors.New("SBOM predicate contains duplicate package SPDX identifiers")
		}
		seenIDs[pkg.SPDXID] = true
		metadata, err := sbomTopLevelMetadata(source, prefix, pkg)
		if err != nil {
			return 0, nil, nil, err
		}
		if metadata == "" {
			continue
		}
		pkg.Name = sbomNormalizedName(pkg.Name)
		pkg.MetadataPath = metadata
		if _, duplicate := installed[pkg.Name]; duplicate {
			return 0, nil, nil, errors.New("SBOM predicate contains duplicate installed top-level Python distributions")
		}
		installed[pkg.Name] = pkg
	}
	locked, extra, err := matchSBOMWheels(installed, wheels)
	return len(packages), locked, extra, err
}

func parseSBOMPackage(body []byte) (GeneratorSBOMPackage, string, error) {
	object, err := sbomObject(body, "SPDXID name versionInfo", "checksums copyrightText downloadLocation externalRefs filesAnalyzed licenseConcluded licenseDeclared originator packageVerificationCode primaryPackagePurpose sourceInfo supplier")
	if err != nil {
		return GeneratorSBOMPackage{}, "", err
	}
	pkg := GeneratorSBOMPackage{Name: jsonString(object, "name"), Version: jsonString(object, "versionInfo"), SPDXID: jsonString(object, "SPDXID")}
	if !sbomText(pkg.Name, 256) || !sbomText(pkg.Version, 256) || !sbomText(pkg.SPDXID, 256) ||
		!strings.HasPrefix(pkg.SPDXID, "SPDXRef-") || len(pkg.SPDXID) == len("SPDXRef-") {
		return GeneratorSBOMPackage{}, "", errors.New("SBOM package identity fields are missing, oversized, or invalid")
	}
	source := ""
	if value, exists := object["sourceInfo"]; exists {
		if err := json.Unmarshal(value, &source); err != nil || !sbomText(source, 16<<10) {
			return GeneratorSBOMPackage{}, "", errors.New("SBOM package sourceInfo must be bounded text")
		}
	}
	return pkg, source, nil
}

func sbomTopLevelMetadata(source, prefix string, pkg GeneratorSBOMPackage) (string, error) {
	const marker = "acquired package info from installed python package manifest file: "
	if !strings.HasPrefix(source, marker+prefix) {
		return "", nil
	}
	paths := strings.Split(strings.TrimPrefix(source, marker), ", ")
	if len(paths) > 16 {
		return "", errors.New("SBOM installed Python sourceInfo exceeds 16 paths")
	}
	first := strings.TrimPrefix(paths[0], prefix)
	parts := strings.Split(first, "/")
	// Nested vendor metadata remains in the original inventory, but cannot
	// satisfy a locked top-level distribution, even with the same name/version.
	if len(parts) != 2 || !strings.HasSuffix(parts[0], ".dist-info") {
		return "", nil
	}
	if parts[1] != "METADATA" || path.Clean(paths[0]) != paths[0] || strings.Contains(paths[0], "\\") {
		return "", errors.New("SBOM installed top-level metadata path is not canonical")
	}
	suffix := "-" + pkg.Version + ".dist-info"
	stem := strings.TrimSuffix(parts[0], suffix)
	if !strings.HasSuffix(parts[0], suffix) || !validSBOMDistributionName(pkg.Name) || !validSBOMDistributionName(stem) ||
		sbomNormalizedName(stem) != sbomNormalizedName(pkg.Name) {
		return "", errors.New("SBOM installed metadata path disagrees with distribution name/version")
	}
	directory := prefix + parts[0] + "/"
	seen := make(map[string]bool)
	for _, entry := range paths {
		base := strings.TrimPrefix(entry, directory)
		if !strings.HasPrefix(entry, directory) || base == "" || base == "." || base == ".." ||
			strings.ContainsAny(base, "/\\") || path.Clean(entry) != entry || seen[entry] {
			return "", errors.New("SBOM installed sourceInfo must name unique files in one top-level dist-info directory")
		}
		seen[entry] = true
	}
	return paths[0], nil
}

func matchSBOMWheels(installed map[string]GeneratorSBOMPackage, wheels GeneratorWheelhouseManifest) ([]GeneratorSBOMPackage, []GeneratorSBOMPackage, error) {
	locked := make([]GeneratorSBOMPackage, 0, len(wheels.Artifacts))
	required := make(map[string]bool)
	for _, wheel := range wheels.Artifacts {
		name := sbomNormalizedName(wheel.Package)
		pkg, exists := installed[name]
		if !exists || pkg.Version != wheel.Version || required[name] {
			return nil, nil, fmt.Errorf("SBOM installed top-level package does not uniquely match locked package %s", name)
		}
		required[name] = true
		locked = append(locked, pkg)
	}
	extra := make([]GeneratorSBOMPackage, 0)
	for name, pkg := range installed {
		if !required[name] {
			extra = append(extra, pkg)
		}
	}
	sort.Slice(locked, func(i, j int) bool { return locked[i].Name < locked[j].Name })
	sort.Slice(extra, func(i, j int) bool { return extra[i].Name < extra[j].Name })
	return locked, extra, nil
}

func sbomText(value string, maximum int) bool {
	return len(value) > 0 && len(value) <= maximum && strings.TrimSpace(value) == value &&
		!strings.ContainsAny(value, "\x00\r\n\t")
}

func validSBOMDistributionName(value string) bool {
	if value == "" || len(value) > 256 {
		return false
	}
	for _, r := range value {
		if (r < 'a' || r > 'z') && (r < 'A' || r > 'Z') && (r < '0' || r > '9') && r != '.' && r != '_' && r != '-' {
			return false
		}
	}
	return value[0] != '.' && value[0] != '_' && value[0] != '-' &&
		value[len(value)-1] != '.' && value[len(value)-1] != '_' && value[len(value)-1] != '-'
}

// Apply PyPA name normalization only at this external-metadata boundary; the
// existing canonical wheelhouse parser remains unchanged.
func sbomNormalizedName(value string) string {
	var output strings.Builder
	separator := false
	for _, character := range strings.ToLower(value) {
		if character == '.' || character == '_' || character == '-' {
			if !separator {
				output.WriteByte('-')
			}
			separator = true
		} else {
			output.WriteRune(character)
			separator = false
		}
	}
	return output.String()
}
