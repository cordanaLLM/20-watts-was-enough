package clrsfixture

import (
	"errors"
	"fmt"
	"slices"
)

const maximumGeneratorImageContractBytes = 16 << 10

var (
	lockedGeneratorEnvironment = []string{
		"CUDA_VISIBLE_DEVICES=",
		"HOME=/tmp/home",
		"JAX_PLATFORMS=cpu",
		"LANG=C.UTF-8",
		"LC_ALL=C.UTF-8",
		"OMP_NUM_THREADS=1",
		"PYTHONHASHSEED=0",
		"PYTHONPATH=/opt/clrs",
		"TF_CPP_MIN_LOG_LEVEL=2",
	}
	lockedGeneratorBlockers = []string{
		"checksum_closed_build_context",
		"pinned_upstream_license_material",
		"promise_source_build_procedure",
		"promise_source_build_reproduction_receipt",
		"image_bound_spdx_sbom",
		"no_network_runtime_smoke",
		"pinned_source_import_smoke",
		"two_build_image_identity",
		"two_run_fixture_byte_comparison",
	}
)

// ParseGeneratorImageContract validates one complete blocked image contract.
func ParseGeneratorImageContract(
	body, lockInputBody []byte,
	source SourceRecord,
	generation GenerationContract,
) (GeneratorImageContract, error) {
	if len(body) == 0 || len(body) > maximumGeneratorImageContractBytes {
		return GeneratorImageContract{}, fmt.Errorf("CLRS generator image contract size = %d, want 1..%d", len(body), maximumGeneratorImageContractBytes)
	}
	var contract GeneratorImageContract
	if err := decodeCanonicalGeneratorJSON(body, 8, &contract); err != nil {
		return GeneratorImageContract{}, fmt.Errorf("parse CLRS generator image contract: %w", err)
	}
	if err := contract.Validate(lockInputBody, source, generation); err != nil {
		return GeneratorImageContract{}, err
	}
	return contract, nil
}

// Validate keeps every unexecuted acceptance field empty and the image blocked.
func (contract GeneratorImageContract) Validate(
	lockInputBody []byte,
	source SourceRecord,
	generation GenerationContract,
) error {
	sourceID, err := source.Identity()
	if err != nil {
		return fmt.Errorf("validate generator image source: %w", err)
	}
	generationID, err := generation.Identity(source)
	if err != nil {
		return fmt.Errorf("validate generator image generation contract: %w", err)
	}
	if err := contract.validateHeader(sourceID, generationID, lockInputBody); err != nil {
		return err
	}
	if err := validateGeneratorBuilder(contract.Builder); err != nil {
		return err
	}
	if err := validateGeneratorBuildEvidence(contract, source.License); err != nil {
		return err
	}
	if err := validateGeneratorRuntime(contract.Runtime, generation.Output); err != nil {
		return err
	}
	if err := validateGeneratorImageLimits(contract.Limits); err != nil {
		return err
	}
	return validateMissingGeneratorAcceptance(contract, generation.Output)
}

func (contract GeneratorImageContract) validateHeader(
	sourceID SourceID,
	generationID ContractID,
	lockInputBody []byte,
) error {
	if contract.SchemaVersion != 1 || contract.Contract != "experiment.clrs-generator-image.v1" ||
		contract.Authority != ResultAuthority || contract.State != "blocked" || contract.Issue != generationIssue {
		return errors.New("generator image contract header is invalid")
	}
	if contract.Image != "ghcr.io/lusoris/20-watts-was-enough-clrs-generator" || contract.Platform != "linux/amd64" ||
		contract.SourceID != sourceID.String() || contract.GenerationContractID != generationID.String() {
		return errors.New("generator image, platform, source, or generation identity is invalid")
	}
	if contract.LockInput.Path != "tooling/clrs-generator/lock-input.json" ||
		contract.LockInput.SHA256 != rawSHA256(lockInputBody) {
		return errors.New("generator image lock-input binding is invalid")
	}
	return nil
}

func validateGeneratorBuilder(builder GeneratorBuilder) error {
	want := GeneratorBuilder{
		AuthorityPath:         "tooling/pdf-renderer/lock.json",
		AuthoritySubsetSHA256: "bb833df0aa38edd08341868bbae0a96cb069c06b939c055e80a0146bd2dff758",
		BuildxVersion:         "0.37.2",
		BuildxRevision:        "2d379c0c3f22da0d2759d132a0ec81ca949098f0",
		BuildKitVersion:       "0.32.2",
		BuildKitImage:         "moby/buildkit:v0.32.2@sha256:28a898719c18a33f4e8000685287fa36fd0dd9560c6440227d3a732d79bb41d8",
		RewriteTimestamp:      true,
		CompatibilityVersion:  30,
		SourceDateEpoch:       1_787_658_740,
	}
	if builder != want {
		return errors.New("generator image builder differs from the reviewed deterministic authority")
	}
	return nil
}

func validateGeneratorBuildEvidence(contract GeneratorImageContract, sourceLicense LicenseIdentity) error {
	lock := contract.DependencyLock
	if lock.State != "locked" || lock.ProjectPath != trackedGeneratorProjectPath ||
		!lowerHex(lock.ProjectSHA256, 64) || lock.Path != trackedGeneratorDependencyLockPath ||
		!lowerHex(lock.SHA256, 64) || lock.PackageCount <= 0 ||
		lock.PackageCount > contract.Limits.DependencyPackageCount || lock.ArtifactCount <= 0 ||
		lock.ArtifactCount > contract.Limits.DependencyArtifactCount {
		return errors.New("generator dependency lock metadata is invalid")
	}
	context := contract.BuildContext
	if context.State != "wheelhouse-manifest-locked" || context.DockerfilePath != "tooling/clrs-generator/Dockerfile" ||
		context.DockerfileSHA256 != "" || context.WheelhouseManifestPath != trackedGeneratorWheelhousePath ||
		!lowerHex(context.WheelhouseManifestSHA256, 64) || context.ContextSHA256 != "" || context.InstallNetwork != "none" {
		return errors.New("generator build context must bind the locked wheelhouse manifest and keep the Dockerfile explicitly missing")
	}
	license := contract.LicenseMaterial
	if license.State != "missing" || license.SPDX != sourceLicense.SPDX || license.SourcePath != sourceLicense.Path ||
		license.SourceSHA256 != sourceLicense.SHA256 || license.SourceSizeBytes != 11_358 ||
		license.DestinationPath != "/usr/share/licenses/clrs/LICENSE" || license.ImageDigest != "" ||
		license.ReceiptPath != "build/evidence/clrs-generator/license-material-receipt.json" ||
		license.ReceiptSHA256 != "" || license.ReceiptSizeBytes != 0 {
		return errors.New("generator pinned upstream licence material must remain explicitly missing")
	}
	identity := contract.ImageIdentity
	if identity.State != "missing" || identity.RequiredBuilds != 2 || identity.ObservedBuilds != 0 ||
		identity.ManifestDigest != "" || identity.ConfigDigest != "" || identity.LayerDigests == nil ||
		len(identity.LayerDigests) != 0 {
		return errors.New("generator two-build image identity must remain explicitly missing")
	}
	sbom := contract.SBOM
	if sbom.State != "missing" || sbom.Format != "spdx-json" ||
		sbom.GeneratorImage != "docker.io/docker/buildkit-syft-scanner@sha256:ae4f3b554449e7e25548e7d8ccc029d17357348e30c6e3df01b92bc93654d6a9" ||
		sbom.Path != "build/evidence/clrs-generator/image.spdx.json" || sbom.ImageDigest != "" || sbom.SHA256 != "" ||
		sbom.SizeBytes != 0 || sbom.PackageCount != 0 ||
		sbom.ReceiptPath != "build/evidence/clrs-generator/sbom-receipt.json" ||
		sbom.ReceiptSHA256 != "" || sbom.ReceiptSizeBytes != 0 {
		return errors.New("generator image-bound SPDX SBOM must remain explicitly missing")
	}
	return nil
}

func validateGeneratorRuntime(runtime GeneratorRuntime, output GenerationOutput) error {
	wantEntrypoint := []string{"/opt/venv/bin/python", "-m", "clrs._src.clrs_text.generate_clrs_text"}
	if !slices.Equal(runtime.Entrypoint, wantEntrypoint) || runtime.WorkingDirectory != "/work" ||
		runtime.SourceRoot != "/opt/clrs" || runtime.OutputRoot != "/output" || runtime.TemporaryRoot != "/tmp" {
		return errors.New("generator runtime paths or entrypoint are invalid")
	}
	if runtime.UID != 65532 || runtime.GID != 65532 || runtime.Network != "none" || !runtime.ReadOnlyRoot ||
		runtime.Capabilities != "drop-all" || !runtime.NoNewPrivileges {
		return errors.New("generator runtime containment is invalid")
	}
	if runtime.CPUMillis != 1000 || runtime.MemoryBytes != 4<<30 || runtime.PIDs != 256 ||
		runtime.WallClockSeconds != 300 || runtime.StopGraceSeconds != 5 || runtime.TemporaryBytes != 512<<20 ||
		runtime.OutputBytes != output.MaxTotalBytes || runtime.CapturedOutputBytes != 1<<20 {
		return errors.New("generator runtime limits differ from the bounded shakedown")
	}
	if !slices.Equal(runtime.Environment, lockedGeneratorEnvironment) {
		return errors.New("generator runtime environment is invalid")
	}
	return nil
}

func validateGeneratorImageLimits(limits GeneratorImageLimits) error {
	if limits.SourceArchiveBytes != 64<<20 || limits.DependencyArtifactBytes != 2<<30 ||
		limits.DependencyLockBytes != 16<<20 || limits.WheelhouseManifestBytes != 16<<20 ||
		limits.DependencyPackageCount != 1_024 || limits.DependencyArtifactCount != 2_048 ||
		limits.BuildContextBytes != 2<<30 || limits.CompressedImageBytes != 2<<30 ||
		limits.UnpackedImageBytes != 4<<30 || limits.SBOMBytes != 64<<20 || limits.SBOMPackageCount != 10_000 ||
		limits.AcceptanceReceiptBytes != 4<<20 || limits.BuildSeconds != 1800 {
		return errors.New("generator image construction limits are invalid")
	}
	return nil
}

func validateMissingGeneratorAcceptance(contract GeneratorImageContract, output GenerationOutput) error {
	smoke := contract.RuntimeSmoke
	if smoke.State != "missing" || smoke.RequiredNetwork != "none" || !smoke.RequireSourceImport ||
		smoke.ImageDigest != "" || smoke.ReceiptSHA256 != "" {
		return errors.New("generator no-network source-import smoke must remain explicitly missing")
	}
	comparison := contract.FixtureComparison
	if comparison.State != "missing" || comparison.RequiredRuns != 2 || comparison.Comparison != "recursive-byte-for-byte" ||
		comparison.ExpectedFiles != output.ExpectedFiles || comparison.ExpectedExamples != output.ExpectedExamples ||
		comparison.ImageDigest != "" || comparison.FirstTreeSHA256 != "" || comparison.SecondTreeSHA256 != "" ||
		comparison.ReceiptSHA256 != "" {
		return errors.New("generator two-run fixture-byte comparison must remain explicitly missing")
	}
	if contract.Acceptance.State != "blocked" || contract.Acceptance.SourceContext != "locked" ||
		!slices.Equal(contract.Acceptance.BlockedOn, lockedGeneratorBlockers) {
		return errors.New("generator image acceptance must remain blocked on every missing gate")
	}
	return nil
}
