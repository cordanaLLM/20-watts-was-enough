package pdftools

import (
	"errors"
	"fmt"
	"net/url"
	"path"
	"regexp"
	"slices"
	"strings"

	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/relpath"
)

var (
	rawDigestPattern = regexp.MustCompile(`^[0-9a-f]{64}$`)
	digestPattern    = regexp.MustCompile(`^sha256:[0-9a-f]{64}$`)
	builderPattern   = regexp.MustCompile(`^cgr\.dev/chainguard/apko@sha256:[0-9a-f]{64}$`)
	revisionPattern  = regexp.MustCompile(`^[0-9a-f]{40}$`)
	versionPattern   = regexp.MustCompile(`^[1-9][0-9]*\.[0-9]+\.[0-9]+$`)
	packagePattern   = regexp.MustCompile(`^[a-z0-9][a-z0-9+._-]*=[A-Za-z0-9][A-Za-z0-9._+~-]*-r[0-9]+$`)
)

func validateContract(value Contract) error {
	if value.Schema != 1 || value.Contract != "publication.pdf-tools-image.v1" {
		return errors.New("schema or contract identity is unsupported")
	}
	if value.Image != "ghcr.io/lusoris/20-watts-was-enough-pdf-tools" ||
		value.Platform != "linux/amd64" || value.ResultAuthority != "NO_RESULT" {
		return errors.New("image, platform, or result authority is invalid")
	}
	if err := validateBuilder(value.Builder); err != nil {
		return err
	}
	if value.SourceDateEpoch < 1_577_836_800 || value.SourceDateEpoch > 4_102_444_800 {
		return errors.New("source_date_epoch must be between 2020 and 2100")
	}
	if err := validateApko(value.Apko); err != nil {
		return err
	}
	if err := validateBase(value.BaseImage, value.Limits); err != nil {
		return err
	}
	if err := validateRuntime(value.Runtime); err != nil {
		return err
	}
	if err := validateUpstream(value.Upstream); err != nil {
		return err
	}
	if err := validateNoticeLayer(value.NoticeLayer, value.Upstream.PopplerArchive.Root); err != nil {
		return err
	}
	return validateDeliveryAndLimits(value.SourceDelivery, value.Apko, value.Limits)
}

func validateBuilder(value Builder) error {
	if !builderPattern.MatchString(value.Image) {
		return errors.New("apko builder image must be one cgr.dev/chainguard/apko digest")
	}
	if !versionPattern.MatchString(value.Version) ||
		!revisionPattern.MatchString(value.Revision) || !versionPattern.MatchString(value.GoVersion) {
		return errors.New("apko builder versions, revision, or digest are invalid")
	}
	return nil
}

func validateApko(value Apko) error {
	if value.Config != "apko.yaml" || value.Lock != "apko.lock.json" || value.OutputTag != "pdf-tools:26.08.0-r0" ||
		!rawDigestPattern.MatchString(value.ConfigSHA256) || !rawDigestPattern.MatchString(value.LockSHA256) {
		return errors.New("apko paths or digests are invalid")
	}
	if value.Repository != "https://packages.wolfi.dev/os" ||
		value.Keyring != "https://packages.wolfi.dev/os/wolfi-signing.rsa.pub" {
		return errors.New("apko repository or keyring is invalid")
	}
	want := []string{"poppler=26.08.0-r0", "poppler-doc=26.08.0-r0", "poppler-utils=26.08.0-r0"}
	if !slices.Equal(value.DirectPackages, want) || value.LockedPackageCount != 45 {
		return errors.New("apko direct packages or locked package count are invalid")
	}
	for _, identity := range value.DirectPackages {
		if !packagePattern.MatchString(identity) {
			return fmt.Errorf("direct package %q is malformed", identity)
		}
	}
	return nil
}

func validateBase(value BaseImage, limits Limits) error {
	for _, digest := range []string{
		value.ArchiveSHA256,
		value.SPDXCanonicalSHA256,
		value.SPDXIndexCanonicalSHA256,
	} {
		if !rawDigestPattern.MatchString(digest) {
			return errors.New("base archive or SPDX digest is invalid")
		}
	}
	for _, digest := range []string{value.ManifestDigest, value.ConfigDigest, value.LayerDigest, value.LayerDiffID} {
		if !digestPattern.MatchString(digest) {
			return errors.New("base OCI digest is invalid")
		}
	}
	if value.ArchiveSize < 1_000_000 || value.ArchiveSize > limits.BaseArchiveBytes ||
		value.SPDXSize < 10_000 || value.SPDXSize > limits.SPDXBytes ||
		value.SPDXCanonicalSize < 10_000 || value.SPDXCanonicalSize > limits.SPDXBytes ||
		value.SPDXIndexCanonicalSize <= 0 || value.SPDXIndexCanonicalSize > limits.SPDXBytes {
		return errors.New("base archive or SPDX size is outside its bound")
	}
	if value.SPDXPackages != 209 || value.SPDXPackages > limits.SPDXPackages ||
		value.SPDXRelationships != 225 || value.SPDXRelationships > limits.SPDXRelationships {
		return errors.New("base SPDX graph count is invalid")
	}
	return nil
}

func validateRuntime(value Runtime) error {
	if value.UID != 65532 || value.GID != 65532 || value.Path != "/usr/bin" || value.Network != "none" ||
		!value.ReadOnlyRoot || value.Capabilities != "drop-all" || !value.NoNewPrivileges {
		return errors.New("runtime identity or containment contract is invalid")
	}
	wantTools := []Tool{{Name: "pdfinfo", Version: "26.08.0", VersionStream: "stderr"}, {Name: "pdftotext", Version: "26.08.0", VersionStream: "stderr"}}
	if !slices.Equal(value.RequiredTools, wantTools) || !slices.Equal(value.ForbiddenPaths, []string{"/bin/sh", "/sbin/apk"}) {
		return errors.New("required tools or forbidden runtime paths are invalid")
	}
	wantManPages := []string{
		"pdfattach.1", "pdfdetach.1", "pdffonts.1", "pdfimages.1", "pdfinfo.1",
		"pdfseparate.1", "pdfsig.1", "pdftocairo.1", "pdftohtml.1", "pdftoppm.1",
		"pdftops.1", "pdftotext.1", "pdfunite.1",
	}
	if !slices.Equal(value.ManPages, wantManPages) {
		return errors.New("Poppler man-page inventory is invalid")
	}
	return uniqueStrings(value.ManPages, "man page")
}

func validateUpstream(value Upstream) error {
	archiveURL, err := url.Parse(value.PopplerArchive.URL)
	if err != nil || archiveURL.Scheme != "https" || archiveURL.Host != "poppler.freedesktop.org" || archiveURL.User != nil ||
		archiveURL.RawPath != "" || archiveURL.RawQuery != "" || archiveURL.Fragment != "" ||
		archiveURL.Path != "/poppler-26.08.0.tar.xz" || value.PopplerArchive.Root != "poppler-26.08.0" ||
		!rawDigestPattern.MatchString(value.PopplerArchive.SHA256) || value.PopplerArchive.Size <= 0 {
		return errors.New("Poppler source archive identity is invalid")
	}
	recipe := value.WolfiRecipe
	recipeURL, err := url.Parse(recipe.URL)
	wantPath := "/wolfi-dev/os/" + recipe.Revision + "/poppler.yaml"
	if err != nil || recipeURL.Scheme != "https" || recipeURL.Host != "raw.githubusercontent.com" || recipeURL.User != nil ||
		recipeURL.RawPath != "" || recipeURL.RawQuery != "" || recipeURL.Fragment != "" ||
		recipeURL.Path != wantPath || !revisionPattern.MatchString(recipe.Revision) ||
		!rawDigestPattern.MatchString(recipe.SHA256) || recipe.Size <= 0 || recipe.Size > 64*1024 ||
		recipe.Snapshot != "upstream/wolfi-poppler.yaml" {
		return errors.New("Wolfi recipe identity or snapshot is invalid")
	}
	return validateWolfiRecipeLicense(recipe.License, recipe.Revision)
}

func validateWolfiRecipeLicense(value UpstreamLicense, recipeRevision string) error {
	licenseURL, err := url.Parse(value.URL)
	wantPath := "/wolfi-dev/os/" + recipeRevision + "/LICENSE"
	if err != nil || licenseURL.Scheme != "https" || licenseURL.Host != "raw.githubusercontent.com" || licenseURL.User != nil ||
		licenseURL.RawPath != "" || licenseURL.RawQuery != "" || licenseURL.Fragment != "" || licenseURL.Path != wantPath ||
		value.SPDX != "Apache-2.0" || value.Revision != recipeRevision || !revisionPattern.MatchString(value.Revision) ||
		!rawDigestPattern.MatchString(value.SHA256) || value.Size <= 0 || value.Size > 64*1024 ||
		value.Snapshot != "upstream/wolfi-LICENSE" {
		return errors.New("Wolfi recipe licence identity or snapshot is invalid")
	}
	return nil
}

func validateNoticeLayer(value NoticeLayer, archiveRoot string) error {
	if value.Assembly != "deterministic-final-layer" || value.BuildKitLock != "../pdf-renderer/lock.json" ||
		!rawDigestPattern.MatchString(value.BuildKitAuthoritySHA256) || len(value.Entries) != 5 {
		return errors.New("notice-layer assembly, builder lock, or entry count is invalid")
	}
	wantSources := []string{
		"notices/AUTHORS",
		"notices/COPYING",
		"notices/COPYING3",
		"notices/README-XPDF",
		"notices/README.contributors",
	}
	previous := ""
	for index, entry := range value.Entries {
		if !relpath.Valid(entry.Source) || !strings.HasPrefix(entry.Source, "notices/") || entry.Source <= previous {
			return errors.New("notice sources must be sorted, unique, and beneath notices")
		}
		if entry.Source != wantSources[index] {
			return errors.New("Poppler notice inventory is invalid")
		}
		name := path.Base(entry.Source)
		if entry.ArchivePath != archiveRoot+"/"+name || entry.Destination != "/usr/share/licenses/poppler/"+name ||
			!rawDigestPattern.MatchString(entry.SHA256) || entry.Size <= 0 {
			return fmt.Errorf("notice entry %s has an invalid provenance or destination", entry.Source)
		}
		previous = entry.Source
	}
	return nil
}

func validateDeliveryAndLimits(delivery SourceDelivery, apko Apko, limits Limits) error {
	wantContents := []string{
		fmt.Sprintf("%d exact APK files", delivery.APKCount),
		"apko.yaml",
		"apko.lock.json",
		"apk-retention.json",
		"contract.json",
		"Poppler 26.08.0 source archive",
		"pinned Wolfi recipe",
		"Wolfi root Apache-2.0 recipe licence",
		"Poppler notices",
		"generated SPDX SBOM",
		"deterministic SHA256SUMS",
	}
	if delivery.APKManifest != "apk-retention.json" || !rawDigestPattern.MatchString(delivery.APKManifestSHA256) ||
		delivery.CandidateBundle != "20w-pdf-tools-26.08.0-r0-linux-amd64-sources.tar.gz" ||
		delivery.CandidateRetentionDays != 30 || delivery.ReleaseRoute != "checksum-bound GitHub Release asset" {
		return errors.New("source-delivery route or manifest is invalid")
	}
	wantLayout := BundleLayout{
		Root:             "20w-pdf-tools-26.08.0-r0-linux-amd64-sources",
		ChecksumManifest: "SHA256SUMS",
		APKDirectory:     "packages",
		PopplerArchive:   "upstream/poppler-26.08.0.tar.xz",
		SPDX:             "sbom/sbom-x86_64.spdx.json",
	}
	if delivery.BundleLayout != wantLayout || delivery.CandidateBundle != delivery.BundleLayout.Root+".tar.gz" {
		return errors.New("source-delivery bundle layout is invalid")
	}
	if delivery.APKCount != apko.LockedPackageCount {
		return errors.New("source-delivery APK count does not match the locked package count")
	}
	if !slices.Equal(delivery.Contents, wantContents) {
		return errors.New("source-delivery inventory does not match its declared APK count")
	}
	checks := []bool{
		limits.LockBytes >= 16*1024 && limits.LockBytes <= 1024*1024,
		limits.Packages >= delivery.APKCount && limits.Packages <= 256,
		limits.NoticeBytes >= 64*1024 && limits.NoticeBytes <= 4*1024*1024,
		limits.BaseArchiveBytes >= 32*1024*1024 && limits.BaseArchiveBytes <= 512*1024*1024,
		limits.FinalArchiveBytes >= limits.BaseArchiveBytes && limits.FinalArchiveBytes <= 512*1024*1024,
		limits.SourceBundleBytes >= 32*1024*1024 && limits.SourceBundleBytes <= 512*1024*1024,
		limits.SPDXBytes >= 256*1024 && limits.SPDXBytes <= 16*1024*1024,
		limits.SPDXPackages >= 209 && limits.SPDXPackages <= 4_096,
		limits.SPDXRelationships >= 225 && limits.SPDXRelationships <= 16_384,
		limits.APKControlBytes >= 1024*1024 && limits.APKControlBytes <= 64*1024*1024,
		limits.APKDataBytes >= 64*1024*1024 && limits.APKDataBytes <= limits.SourceBundleBytes,
		limits.APKIndexBytes >= 16*1024*1024 && limits.APKIndexBytes <= 512*1024*1024,
		limits.HTTPResponseBytes >= 64*1024*1024 && limits.HTTPResponseBytes <= limits.SourceBundleBytes,
		limits.LockSeconds >= 30 && limits.LockSeconds <= 600,
		limits.BuildSeconds >= 60 && limits.BuildSeconds <= 1800,
		limits.RuntimeSeconds >= 5 && limits.RuntimeSeconds <= 120,
		limits.CapturedOutputBytes >= 64*1024 && limits.CapturedOutputBytes <= 16*1024*1024,
		limits.ReceiptBytes >= 64*1024 && limits.ReceiptBytes <= 4*1024*1024,
		limits.ApkoMemoryBytes >= 512*1024*1024 && limits.ApkoMemoryBytes <= 16*1024*1024*1024,
		limits.ApkoPIDs >= 64 && limits.ApkoPIDs <= 2_048,
		limits.ApkoTemporaryBytes >= 128*1024*1024 && limits.ApkoTemporaryBytes <= 8*1024*1024*1024,
		limits.BuildKitMemoryBytes >= 512*1024*1024 && limits.BuildKitMemoryBytes <= 8*1024*1024*1024,
		limits.BuildKitPIDs >= 64 && limits.BuildKitPIDs <= 1_024,
		limits.BuildKitCPUPeriod >= 10_000 && limits.BuildKitCPUPeriod <= 1_000_000,
		limits.BuildKitCPUQuota >= limits.BuildKitCPUPeriod && limits.BuildKitCPUQuota <= 8*limits.BuildKitCPUPeriod,
		limits.RuntimeMemoryBytes >= 64*1024*1024 && limits.RuntimeMemoryBytes <= 2*1024*1024*1024,
		limits.RuntimePIDs >= 16 && limits.RuntimePIDs <= 256,
		limits.RuntimeTemporaryBytes >= 1024*1024 && limits.RuntimeTemporaryBytes <= 256*1024*1024,
	}
	if slices.Contains(checks, false) {
		return errors.New("one or more PDF-tools resource limits are invalid")
	}
	return uniqueStrings(delivery.Contents, "source bundle item")
}

func uniqueStrings(values []string, label string) error {
	seen := make(map[string]struct{}, len(values))
	for _, value := range values {
		if value == "" {
			return fmt.Errorf("%s identity is empty", label)
		}
		if _, exists := seen[value]; exists {
			return fmt.Errorf("%s identity %q is repeated", label, value)
		}
		seen[value] = struct{}{}
	}
	return nil
}
