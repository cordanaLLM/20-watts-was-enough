package clrsfixture

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"reflect"
	"strings"
	"time"
)

const (
	sbomMaximumBytes        = 64 << 20
	sbomMaximumReceiptBytes = 4 << 20
	sbomMaximumBindingBytes = 16 << 10
	sbomMaximumBundleBytes  = 137 << 20
	sbomMaximumPackages     = 10000
	sbomMaximumReportBytes  = 64 << 10
	sbomMaximumDepth        = 32
	sbomCheckTimeout        = 30 * time.Second
)

// SBOMCheckDeadline bounds one CheckGeneratorSBOMBundle call, which runs all of
// its work under sbomCheckTimeout.
const SBOMCheckDeadline = sbomCheckTimeout

// GeneratorSBOMOptions requires image identities supplied independently of the
// bundle. The checker does not discover, load, execute, or authenticate images.
type GeneratorSBOMOptions struct {
	RepositoryRoot         string
	BundleRoot             string
	ExpectedManifestDigest string
	ExpectedConfigDigest   string
}

type GeneratorSBOMFile struct {
	Name   string `json:"name"`
	SHA256 string `json:"sha256"`
	Bytes  int64  `json:"bytes"`
}

type GeneratorSBOMPackage struct {
	Name         string `json:"name"`
	Version      string `json:"version"`
	SPDXID       string `json:"spdx_id"`
	MetadataPath string `json:"metadata_path"`
}

// GeneratorSBOMReport describes supplied-byte consistency, not scanner execution,
// inventory completeness, redistribution permission, or image admission.
type GeneratorSBOMReport struct {
	Schema                 int                    `json:"schema"`
	Authority              string                 `json:"authority"`
	State                  string                 `json:"state"`
	ManifestDigest         string                 `json:"image_manifest_digest,omitempty"`
	ConfigDigest           string                 `json:"image_config_digest,omitempty"`
	ImageContractSHA256    string                 `json:"image_contract_sha256,omitempty"`
	WheelhouseSHA256       string                 `json:"wheelhouse_sha256,omitempty"`
	Files                  []GeneratorSBOMFile    `json:"files,omitempty"`
	StatementSubject       string                 `json:"statement_subject,omitempty"`
	PackageCount           int                    `json:"package_count,omitempty"`
	OtherPackageCount      int                    `json:"other_package_count,omitempty"`
	LockedPackages         []GeneratorSBOMPackage `json:"locked_packages,omitempty"`
	ExtraTopLevelPython    []GeneratorSBOMPackage `json:"extra_top_level_python,omitempty"`
	ExecutionAuthenticated bool                   `json:"execution_authenticated"`
	ImageAdmitted          bool                   `json:"image_admitted"`
	LicensesApproved       bool                   `json:"licenses_approved"`
	Limitations            []string               `json:"limitations"`
	Error                  string                 `json:"error,omitempty"`
}

func newGeneratorSBOMReport() GeneratorSBOMReport {
	return GeneratorSBOMReport{Schema: 1, Authority: ResultAuthority, State: "incomplete", Limitations: []string{
		"Selected receipt identity, status, owner, and cleanup claims are checked for consistency. Resource, mount, and network payloads are hash-bound but not validated or authenticated.",
		"The original statement has subject:null; image identities are independently supplied expectations, not a signed scanner subject or build provenance.",
		"Archive, scanner, launcher, supervisor, and command-log payloads are not read; only their recorded identity syntax and cross-references are checked.",
		"All original SPDX bytes and package records remain unchanged. Selected identity and installed top-level Python metadata are checked, not complete SPDX conformance or inventory completeness.",
		"Matching installed metadata does not verify installed wheel contents, licence approval, image admission, or scientific results.",
		"The 30-second context deadline is cooperative between bounded operations; it does not preempt a blocked filesystem call or JSON decode.",
	}}
}

// CheckGeneratorSBOMBundle checks exactly five regular files without writes or
// subprocesses. Any failure clears successful fields from the returned report.
func CheckGeneratorSBOMBundle(ctx context.Context, options GeneratorSBOMOptions) (GeneratorSBOMReport, error) {
	return checkGeneratorSBOMBundle(ctx, options, nil)
}

func checkGeneratorSBOMBundle(ctx context.Context, options GeneratorSBOMOptions, beforeRecheck func() error) (report GeneratorSBOMReport, err error) {
	report = newGeneratorSBOMReport()
	defer func() {
		if err != nil {
			report = newGeneratorSBOMReport()
			report.Error = sbomDiagnostic(err)
		}
	}()
	if ctx == nil || !sbomDigest(options.ExpectedManifestDigest) || !sbomDigest(options.ExpectedConfigDigest) {
		return report, errors.New("SBOM check requires a context and explicit sha256 manifest/config digests")
	}
	ctx, cancel := context.WithTimeout(ctx, sbomCheckTimeout)
	defer cancel()
	if err = ctx.Err(); err != nil {
		return report, err
	}
	root, err := cleanGeneratorRoot(options.RepositoryRoot)
	if err != nil {
		return report, err
	}
	authority, contract, err := loadSBOMAuthority(root)
	if err != nil {
		return report, err
	}
	bundle, err := readSBOMBundle(ctx, options.BundleRoot)
	if err != nil {
		return report, err
	}
	count, locked, extra, err := checkSBOMDocuments(ctx, bundle, options, authority.manifest, contract)
	if err != nil {
		return report, err
	}
	if beforeRecheck != nil {
		if err = beforeRecheck(); err != nil {
			return report, err
		}
	}
	if err = recheckSBOMBundle(ctx, bundle); err != nil {
		return report, err
	}
	current, currentContract, err := loadSBOMAuthority(root)
	if err != nil {
		return report, err
	}
	if !reflect.DeepEqual(authority, current) || !reflect.DeepEqual(contract, currentContract) {
		return report, errors.New("SBOM repository authority changed during the check")
	}
	if err = ctx.Err(); err != nil {
		return report, err
	}
	report.State = "bundle-consistent-unadmitted"
	report.ManifestDigest, report.ConfigDigest = options.ExpectedManifestDigest, options.ExpectedConfigDigest
	report.ImageContractSHA256, report.WheelhouseSHA256 = authority.imageContractSHA256, authority.manifestSHA256
	report.Files, report.StatementSubject = bundle.identities(), "null"
	report.PackageCount, report.OtherPackageCount = count, count-len(locked)-len(extra)
	report.LockedPackages, report.ExtraTopLevelPython = locked, extra
	_, err = MarshalGeneratorSBOMReport(report)
	return report, errors.Join(err, ctx.Err())
}

func loadSBOMAuthority(root string) (promiseInputs, GeneratorImageContract, error) {
	authority, err := loadPromiseAuthority(root)
	if err != nil {
		return promiseInputs{}, GeneratorImageContract{}, fmt.Errorf("SBOM foundation: %w", err)
	}
	_, contract, _, err := loadGeneratorWheelhouseInputs(root)
	if err == nil && (contract.Limits.SBOMBytes != sbomMaximumBytes || contract.Limits.SBOMPackageCount != sbomMaximumPackages ||
		contract.Limits.AcceptanceReceiptBytes != sbomMaximumReceiptBytes) {
		err = errors.New("SBOM checker limits differ from the current image contract")
	}
	return authority, contract, err
}

// MarshalGeneratorSBOMReport emits bounded deterministic JSON, with no progress
// text. The fixed struct order and sorted package/file lists make output stable.
func MarshalGeneratorSBOMReport(report GeneratorSBOMReport) ([]byte, error) {
	body, err := json.MarshalIndent(report, "", "  ")
	if err == nil && len(body)+1 > sbomMaximumReportBytes {
		err = errors.New("SBOM report exceeds 65536 bytes")
	}
	if err != nil {
		return nil, err
	}
	return append(body, '\n'), nil
}

func sbomDigest(value string) bool {
	return strings.HasPrefix(value, "sha256:") && lowerHex(strings.TrimPrefix(value, "sha256:"), 64)
}

func sbomDiagnostic(err error) string {
	text := strings.ToValidUTF8(err.Error(), "?")
	if len(text) > 4096 {
		text = strings.ToValidUTF8(text[:4076], "?") + " [diagnostic limit]"
	}
	return text
}
