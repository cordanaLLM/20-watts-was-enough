package clrsfixture

// GeneratorLockInput records the exact source and high-impact package
// candidates admitted to dependency resolution. It is not a dependency lock.
type GeneratorLockInput struct {
	SchemaVersion            int                       `json:"schema_version"`
	Authority                string                    `json:"authority"`
	State                    string                    `json:"state"`
	Platform                 string                    `json:"platform"`
	PackageIndex             string                    `json:"package_index"`
	SourceContext            GeneratorSourceContext    `json:"source_context"`
	Python                   GeneratorPython           `json:"python"`
	Resolver                 GeneratorResolver         `json:"resolver"`
	UpstreamRequirements     GeneratorRequirements     `json:"upstream_requirements"`
	SelectedCandidates       []GeneratorWheel          `json:"selected_candidates"`
	SupplementalRequirements []SupplementalRequirement `json:"supplemental_requirements"`
}

type GeneratorSourceContext struct {
	Repository       string `json:"repository"`
	Commit           string `json:"commit"`
	Tree             string `json:"tree"`
	SourceID         string `json:"source_id"`
	ArchiveURL       string `json:"archive_url"`
	ArchiveRoot      string `json:"archive_root"`
	ArchiveSHA256    string `json:"archive_sha256"`
	ArchiveSizeBytes int64  `json:"archive_size_bytes"`
}

type GeneratorPython struct {
	Version                string `json:"version"`
	ABI                    string `json:"abi"`
	BaseImage              string `json:"base_image"`
	PlatformManifestDigest string `json:"platform_manifest_digest"`
	PythonSourceSHA256     string `json:"python_source_sha256"`
}

type GeneratorResolver struct {
	Name                string            `json:"name"`
	Version             string            `json:"version"`
	Image               string            `json:"image"`
	Revision            string            `json:"revision"`
	Resolution          string            `json:"resolution"`
	Prerelease          string            `json:"prerelease"`
	ExcludeNewer        string            `json:"exclude_newer"`
	ExcludeNewerPackage map[string]string `json:"exclude_newer_package"`
}

type GeneratorRequirements struct {
	Path        string   `json:"path"`
	SHA256      string   `json:"sha256"`
	Constraints []string `json:"constraints"`
}

type GeneratorWheel struct {
	Name           string `json:"name"`
	Version        string `json:"version"`
	Requirement    string `json:"requirement"`
	RequiresPython string `json:"requires_python"`
	Filename       string `json:"filename"`
	URL            string `json:"url"`
	SHA256         string `json:"sha256"`
	SizeBytes      int64  `json:"size_bytes"`
}

type SupplementalRequirement struct {
	Requirement string `json:"requirement"`
	Reason      string `json:"reason"`
}

// GeneratorImageContract records closed construction inputs and the remaining
// blocked image evidence. It never grants scientific result authority.
type GeneratorImageContract struct {
	SchemaVersion        int                      `json:"schema_version"`
	Contract             string                   `json:"contract"`
	Authority            string                   `json:"authority"`
	State                string                   `json:"state"`
	Issue                string                   `json:"issue"`
	Image                string                   `json:"image"`
	Platform             string                   `json:"platform"`
	SourceID             string                   `json:"source_id"`
	GenerationContractID string                   `json:"generation_contract_id"`
	LockInput            GeneratorFileBinding     `json:"lock_input"`
	Builder              GeneratorBuilder         `json:"builder"`
	DependencyLock       GeneratorDependencyLock  `json:"dependency_lock"`
	BuildContext         GeneratorBuildContext    `json:"build_context"`
	LicenseMaterial      MissingLicenseMaterial   `json:"license_material"`
	ImageIdentity        MissingImageIdentity     `json:"image_identity"`
	SBOM                 MissingSBOM              `json:"sbom"`
	Runtime              GeneratorRuntime         `json:"runtime"`
	Limits               GeneratorImageLimits     `json:"limits"`
	RuntimeSmoke         MissingRuntimeSmoke      `json:"runtime_smoke"`
	FixtureComparison    MissingFixtureComparison `json:"fixture_comparison"`
	Acceptance           GeneratorImageAcceptance `json:"acceptance"`
}

type GeneratorFileBinding struct {
	Path   string `json:"path"`
	SHA256 string `json:"sha256"`
}

type GeneratorBuilder struct {
	AuthorityPath         string `json:"authority_path"`
	AuthoritySubsetSHA256 string `json:"authority_subset_sha256"`
	BuildxVersion         string `json:"buildx_version"`
	BuildxRevision        string `json:"buildx_revision"`
	BuildKitVersion       string `json:"buildkit_version"`
	BuildKitImage         string `json:"buildkit_image"`
	RewriteTimestamp      bool   `json:"rewrite_timestamp"`
	CompatibilityVersion  int    `json:"compatibility_version"`
	SourceDateEpoch       int64  `json:"source_date_epoch"`
}

type GeneratorDependencyLock struct {
	State         string `json:"state"`
	ProjectPath   string `json:"project_path"`
	ProjectSHA256 string `json:"project_sha256"`
	Path          string `json:"path"`
	SHA256        string `json:"sha256"`
	PackageCount  int    `json:"package_count"`
	ArtifactCount int    `json:"artifact_count"`
}

type GeneratorBuildContext struct {
	State                    string `json:"state"`
	DockerfilePath           string `json:"dockerfile_path"`
	DockerfileSHA256         string `json:"dockerfile_sha256"`
	WheelhouseManifestPath   string `json:"wheelhouse_manifest_path"`
	WheelhouseManifestSHA256 string `json:"wheelhouse_manifest_sha256"`
	ContextSHA256            string `json:"context_sha256"`
	InstallNetwork           string `json:"install_network"`
}

type MissingLicenseMaterial struct {
	State            string `json:"state"`
	SPDX             string `json:"spdx"`
	SourcePath       string `json:"source_path"`
	SourceSHA256     string `json:"source_sha256"`
	SourceSizeBytes  int64  `json:"source_size_bytes"`
	DestinationPath  string `json:"destination_path"`
	ImageDigest      string `json:"image_digest"`
	ReceiptPath      string `json:"receipt_path"`
	ReceiptSHA256    string `json:"receipt_sha256"`
	ReceiptSizeBytes int64  `json:"receipt_size_bytes"`
}

type MissingImageIdentity struct {
	State          string   `json:"state"`
	RequiredBuilds int      `json:"required_builds"`
	ObservedBuilds int      `json:"observed_builds"`
	ManifestDigest string   `json:"manifest_digest"`
	ConfigDigest   string   `json:"config_digest"`
	LayerDigests   []string `json:"layer_digests"`
}

type MissingSBOM struct {
	State            string `json:"state"`
	Format           string `json:"format"`
	GeneratorImage   string `json:"generator_image"`
	Path             string `json:"path"`
	ImageDigest      string `json:"image_digest"`
	SHA256           string `json:"sha256"`
	SizeBytes        int64  `json:"size_bytes"`
	PackageCount     int    `json:"package_count"`
	ReceiptPath      string `json:"receipt_path"`
	ReceiptSHA256    string `json:"receipt_sha256"`
	ReceiptSizeBytes int64  `json:"receipt_size_bytes"`
}

type GeneratorRuntime struct {
	Entrypoint          []string `json:"entrypoint"`
	WorkingDirectory    string   `json:"working_directory"`
	SourceRoot          string   `json:"source_root"`
	OutputRoot          string   `json:"output_root"`
	TemporaryRoot       string   `json:"temporary_root"`
	UID                 int      `json:"uid"`
	GID                 int      `json:"gid"`
	Network             string   `json:"network"`
	ReadOnlyRoot        bool     `json:"read_only_root"`
	Capabilities        string   `json:"capabilities"`
	NoNewPrivileges     bool     `json:"no_new_privileges"`
	CPUMillis           int      `json:"cpu_millis"`
	MemoryBytes         int64    `json:"memory_bytes"`
	PIDs                int      `json:"pids"`
	WallClockSeconds    int      `json:"wall_clock_seconds"`
	StopGraceSeconds    int      `json:"stop_grace_seconds"`
	TemporaryBytes      int64    `json:"temporary_bytes"`
	OutputBytes         int64    `json:"output_bytes"`
	CapturedOutputBytes int64    `json:"captured_output_bytes"`
	Environment         []string `json:"environment"`
}

type GeneratorImageLimits struct {
	SourceArchiveBytes      int64 `json:"source_archive_bytes"`
	DependencyArtifactBytes int64 `json:"dependency_artifact_bytes"`
	DependencyLockBytes     int64 `json:"dependency_lock_bytes"`
	WheelhouseManifestBytes int64 `json:"wheelhouse_manifest_bytes"`
	DependencyPackageCount  int   `json:"dependency_package_count"`
	DependencyArtifactCount int   `json:"dependency_artifact_count"`
	BuildContextBytes       int64 `json:"build_context_bytes"`
	CompressedImageBytes    int64 `json:"compressed_image_bytes"`
	UnpackedImageBytes      int64 `json:"unpacked_image_bytes"`
	SBOMBytes               int64 `json:"sbom_bytes"`
	SBOMPackageCount        int   `json:"sbom_package_count"`
	AcceptanceReceiptBytes  int64 `json:"acceptance_receipt_bytes"`
	BuildSeconds            int   `json:"build_seconds"`
}

type MissingRuntimeSmoke struct {
	State               string `json:"state"`
	RequiredNetwork     string `json:"required_network"`
	RequireSourceImport bool   `json:"require_source_import"`
	ImageDigest         string `json:"image_digest"`
	ReceiptSHA256       string `json:"receipt_sha256"`
}

type MissingFixtureComparison struct {
	State            string `json:"state"`
	RequiredRuns     int    `json:"required_runs"`
	Comparison       string `json:"comparison"`
	ExpectedFiles    int    `json:"expected_files"`
	ExpectedExamples int    `json:"expected_examples"`
	ImageDigest      string `json:"image_digest"`
	FirstTreeSHA256  string `json:"first_tree_sha256"`
	SecondTreeSHA256 string `json:"second_tree_sha256"`
	ReceiptSHA256    string `json:"receipt_sha256"`
}

type GeneratorImageAcceptance struct {
	State         string   `json:"state"`
	SourceContext string   `json:"source_context"`
	BlockedOn     []string `json:"blocked_on"`
}

// GeneratorImageFoundation is the offline validation result. It records
// construction closure only and never carries scientific result authority.
type GeneratorImageFoundation struct {
	Authority            string
	State                string
	SourceID             SourceID
	GenerationContract   ContractID
	LockInputSHA256      string
	DependencyLockSHA256 string
	WheelhouseSHA256     string
	ImageContractSHA256  string
}

// GeneratorWheelhouseManifest binds the one Linux amd64 artifact selected for
// every locked runtime package. It is a construction input, not an admitted
// image or scientific result.
type GeneratorWheelhouseManifest struct {
	SchemaVersion         int                        `json:"schema_version"`
	Authority             string                     `json:"authority"`
	State                 string                     `json:"state"`
	Platform              string                     `json:"platform"`
	PythonVersion         string                     `json:"python_version"`
	BaseImage             string                     `json:"base_image"`
	GlibcVersion          string                     `json:"glibc_version"`
	DependencyLockSHA256  string                     `json:"dependency_lock_sha256"`
	SourceDateEpoch       int64                      `json:"source_date_epoch"`
	PackageCount          int                        `json:"package_count"`
	ArtifactCount         int                        `json:"artifact_count"`
	DownloadedWheelCount  int                        `json:"downloaded_wheel_count"`
	SourceBuiltWheelCount int                        `json:"source_built_wheel_count"`
	TotalSizeBytes        int64                      `json:"total_size_bytes"`
	Artifacts             []GeneratorWheelhouseEntry `json:"artifacts"`
	SourceBuild           GeneratorWheelSourceBuild  `json:"source_build"`
}

type GeneratorWheelhouseEntry struct {
	Package   string `json:"package"`
	Version   string `json:"version"`
	Kind      string `json:"kind"`
	Filename  string `json:"filename"`
	URL       string `json:"url"`
	SHA256    string `json:"sha256"`
	SizeBytes int64  `json:"size_bytes"`
}

type GeneratorWheelSourceBuild struct {
	ProcedureState            string                         `json:"procedure_state"`
	ReproductionReceiptState  string                         `json:"reproduction_receipt_state"`
	Package                   string                         `json:"package"`
	Version                   string                         `json:"version"`
	Provenance                GeneratorWheelSourceProvenance `json:"provenance"`
	SourceURL                 string                         `json:"source_url"`
	SourceSHA256              string                         `json:"source_sha256"`
	SourceSizeBytes           int64                          `json:"source_size_bytes"`
	BuilderImage              string                         `json:"builder_image"`
	BuildRequirements         []GeneratorWheelhouseEntry     `json:"build_requirements"`
	CandidateWorkingDirectory string                         `json:"candidate_working_directory"`
	CandidateBootstrapCommand []string                       `json:"candidate_bootstrap_argv"`
	CandidateInstallCommand   []string                       `json:"candidate_install_argv"`
	CandidateBuildCommand     []string                       `json:"candidate_build_argv"`
	CandidateEnvironment      []string                       `json:"candidate_environment"`
	RequiredReproductions     int                            `json:"required_reproductions"`
}

type GeneratorWheelSourceProvenance struct {
	AcquiredOn            string `json:"acquired_on"`
	AccessRoute           string `json:"access_route"`
	UploadTime            string `json:"upload_time"`
	SPDX                  string `json:"spdx"`
	RepositoryLicensePath string `json:"repository_license_path"`
	SourceLicensePath     string `json:"source_license_path"`
	BuiltWheelLicensePath string `json:"built_wheel_license_path"`
	LicenseSHA256         string `json:"license_sha256"`
	LicenseSizeBytes      int64  `json:"license_size_bytes"`
}
