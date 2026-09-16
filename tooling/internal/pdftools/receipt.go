package pdftools

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"runtime/debug"
	"slices"
	"strings"
	"time"

	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/buildinfo"
)

const (
	reproductionReceiptSchema        = 2
	maximumComparatorExecutableBytes = int64(256 * 1024 * 1024)
	maximumComparatorSourceEntries   = 16_384
	maximumComparatorSourceDepth     = 32
)

// ReproductionReceipt is local construction evidence. Its explicit block
// state prevents a successful comparison from becoming publication, release,
// source-delivery, legal, or scientific authority.
type ReproductionReceipt struct {
	Schema           int                    `json:"schema"`
	Status           string                 `json:"status"`
	Scope            string                 `json:"scope"`
	Authority        string                 `json:"authority"`
	ScientificResult bool                   `json:"scientific_result"`
	BlockState       ReproductionBlockState `json:"block_state"`
	Contract         ReproductionContract   `json:"contract"`
	Builders         ReproductionBuilders   `json:"builders"`
	Comparator       ReproductionComparator `json:"comparator"`
	Context          ReproductionContext    `json:"normalized_notice_context"`
	BaseBuilds       []ReproductionBuild    `json:"base_builds"`
	FinalBuilds      []ReproductionBuild    `json:"final_builds"`
	Notices          []NoticeObservation    `json:"notices"`
	ManPages         []string               `json:"man_pages"`
	Runtime          *RuntimeObservation    `json:"runtime,omitempty"`
	Candidate        *ReproductionCandidate `json:"candidate,omitempty"`
	Comparison       ReproductionComparison `json:"comparison"`
}

type ReproductionComparator struct {
	Version          string `json:"version"`
	Revision         string `json:"revision"`
	BuiltAt          string `json:"built_at"`
	GoVersion        string `json:"go_version"`
	OperatingSystem  string `json:"os"`
	Architecture     string `json:"architecture"`
	ExecutableSHA256 string `json:"executable_sha256"`
	ExecutableBytes  int64  `json:"executable_bytes"`
	VCSRevision      string `json:"vcs_revision"`
	VCSModified      bool   `json:"vcs_modified"`
	SourceSHA256     string `json:"source_sha256"`
	SourceFiles      int    `json:"source_files"`
}

type ReproductionBlockState struct {
	RemotePublication string `json:"remote_publication"`
	DigestAdmission   string `json:"digest_admission"`
	SourceBundle      string `json:"source_bundle"`
	ScientificUse     string `json:"scientific_use"`
	LegalConclusion   string `json:"legal_conclusion"`
}

type ReproductionContract struct {
	SHA256          string `json:"sha256"`
	ResultAuthority string `json:"result_authority"`
	Platform        string `json:"platform"`
}

type ReproductionBuilders struct {
	ApkoImage                  string   `json:"apko_image"`
	ApkoVersion                string   `json:"apko_version"`
	ApkoRevision               string   `json:"apko_revision"`
	ApkoGoVersion              string   `json:"apko_go_version"`
	ApkoTreeState              string   `json:"apko_tree_state"`
	ApkoBuildDate              string   `json:"apko_build_date"`
	ApkoRequestedNetwork       string   `json:"apko_requested_network"`
	ApkoRequestedReadOnlyRoot  bool     `json:"apko_requested_read_only_root"`
	ApkoRequestedCapabilities  string   `json:"apko_requested_capabilities"`
	ApkoRequestedNoNewPrivs    bool     `json:"apko_requested_no_new_privileges"`
	ApkoRequestedMemoryBytes   int64    `json:"apko_requested_memory_bytes"`
	ApkoRequestedMemorySwap    int64    `json:"apko_requested_memory_swap_bytes"`
	ApkoRequestedPIDs          int      `json:"apko_requested_pids"`
	ApkoRequestedTemporary     int64    `json:"apko_requested_temporary_bytes"`
	BuildxVersion              string   `json:"buildx_version"`
	BuildxRevision             string   `json:"buildx_revision"`
	BuildKitImage              string   `json:"buildkit_image"`
	BuildKitVersion            string   `json:"buildkit_version"`
	FreshBuildKits             int      `json:"fresh_buildkits"`
	DaemonNetwork              string   `json:"buildkit_daemon_network"`
	DaemonPrivileged           bool     `json:"buildkit_daemon_privileged"`
	DaemonAllowedEntitlements  []string `json:"buildkit_daemon_allowed_insecure_entitlements"`
	RequestedBuildEntitlements []string `json:"requested_build_entitlements"`
	DaemonMemoryBytes          int64    `json:"buildkit_daemon_memory_bytes"`
	DaemonPIDs                 int      `json:"buildkit_daemon_pids"`
	DaemonCPUPeriod            int64    `json:"buildkit_daemon_cpu_period"`
	DaemonCPUQuota             int64    `json:"buildkit_daemon_cpu_quota"`
	DaemonMaximumParallelism   int      `json:"buildkit_daemon_maximum_parallelism"`
	NoCache                    bool     `json:"no_cache"`
	FinalNetwork               string   `json:"final_build_network"`
	RemotePush                 bool     `json:"remote_push"`
}

type ReproductionContext struct {
	SHA256           string `json:"sha256"`
	Entries          int    `json:"entries"`
	FileBytes        int64  `json:"file_bytes"`
	DockerfileSHA256 string `json:"dockerfile_sha256"`
	SourceDateEpoch  int64  `json:"source_date_epoch"`
}

type ReproductionBuild struct {
	Sequence      int               `json:"sequence"`
	ArchiveSHA256 string            `json:"archive_sha256"`
	ArchiveBytes  int64             `json:"archive_bytes"`
	Manifest      string            `json:"manifest_digest"`
	Config        string            `json:"config_digest"`
	Layers        []string          `json:"layer_digests"`
	DiffIDs       []string          `json:"layer_diff_ids"`
	SPDX          *ReproductionSPDX `json:"spdx,omitempty"`
	SPDXIndex     *ReproductionSPDX `json:"spdx_index,omitempty"`
}

type ReproductionSPDX struct {
	RawSHA256       string `json:"raw_sha256"`
	RawBytes        int64  `json:"raw_bytes"`
	CanonicalSHA256 string `json:"canonical_sha256"`
	CanonicalBytes  int64  `json:"canonical_bytes"`
	Packages        int    `json:"packages"`
	Relationships   int    `json:"relationships"`
}

// ReproductionCandidate records local release inputs without granting remote
// publication, digest admission, legal, or scientific authority. CanonicalSPDX
// is the retained deterministic projection; BaseBuilds preserve both raw SPDX
// identities separately for audit.
type ReproductionCandidate struct {
	// PublicationBundle is populated only in the in-process return value after
	// successful placement. It cannot be embedded because a bundle cannot
	// contain its own digest.
	PublicationBundle        *ReproductionArtifact      `json:"-"`
	BundleFormat             string                     `json:"bundle_format"`
	StandaloneFilesAuthority string                     `json:"standalone_files_authority"`
	State                    string                     `json:"state"`
	SPDXCanonicalBuildsMatch bool                       `json:"spdx_canonical_builds_match"`
	FinalArchive             ReproductionArtifact       `json:"final_oci_archive"`
	CanonicalSPDX            ReproductionArtifact       `json:"canonical_apko_spdx"`
	SourceBundle             ReproductionBundleArtifact `json:"source_bundle"`
	RetainedAPKs             int                        `json:"retained_apks"`
	RetainedBytes            int64                      `json:"retained_apk_bytes"`
}

type ReproductionArtifact struct {
	Path   string `json:"path"`
	SHA256 string `json:"sha256"`
	Bytes  int64  `json:"bytes"`
}

type ReproductionBundleArtifact struct {
	ReproductionArtifact
	Root                  string `json:"root"`
	ChecksumManifest      string `json:"checksum_manifest"`
	ChecksumSHA256        string `json:"checksum_sha256"`
	ChecksumBytes         int64  `json:"checksum_bytes"`
	PayloadFiles          int    `json:"payload_files"`
	ArchiveFiles          int    `json:"archive_files"`
	UncompressedFileBytes int64  `json:"uncompressed_file_bytes"`
	Deterministic         bool   `json:"deterministic"`
}

type ReproductionComparison struct {
	BaseArchiveBytes     bool `json:"base_archive_bytes"`
	BaseManifest         bool `json:"base_manifest"`
	BaseConfig           bool `json:"base_config"`
	BaseLayers           bool `json:"base_layers"`
	BaseDiffIDs          bool `json:"base_diff_ids"`
	SPDXCanonicalBytes   bool `json:"spdx_canonical_bytes"`
	SPDXIndexCanonical   bool `json:"spdx_index_canonical_bytes"`
	NoticeContextStable  bool `json:"notice_context_stable"`
	FinalArchiveBytes    bool `json:"final_archive_bytes"`
	FinalManifest        bool `json:"final_manifest"`
	FinalConfig          bool `json:"final_config"`
	FinalLayers          bool `json:"final_layers"`
	FinalDiffIDs         bool `json:"final_diff_ids"`
	NoticeFiles          bool `json:"notice_files"`
	ManPages             bool `json:"man_pages"`
	ForbiddenPathsAbsent bool `json:"forbidden_paths_absent"`
	ConstructionMatch    bool `json:"construction_match"`
	Runtime              bool `json:"runtime"`
	AllMatch             bool `json:"all_match"`
}

func newReproductionReceipt(
	authority checkedAuthority,
	apkoBuilder apkoBuilderIdentity,
	comparator ReproductionComparator,
	contextIdentity noticeContextIdentity,
	bases []baseBuild,
	finals []finalBuild,
	inspection layerInspection,
	comparison ReproductionComparison,
	candidate *ReproductionCandidate,
) ReproductionReceipt {
	status := "construction-mismatch"
	if comparison.AllMatch {
		status = "local-construction-pass"
	}
	if candidate != nil {
		status = "local-candidate-preparation-pass"
	}
	baseReceipts := make([]ReproductionBuild, len(bases))
	for index, build := range bases {
		baseReceipts[index] = reproductionBuildReceipt(build.Sequence, build.Image, &build.SPDX, &build.SPDXIndex)
	}
	finalReceipts := make([]ReproductionBuild, len(finals))
	for index, build := range finals {
		finalReceipts[index] = reproductionBuildReceipt(build.Sequence, build.Image.Identity, nil, nil)
	}
	builder := authority.renderer.Lock.Builder
	receipt := ReproductionReceipt{
		Schema:           reproductionReceiptSchema,
		Status:           status,
		Scope:            "local-pdf-tools-final-image-reproduction",
		Authority:        "NO_RESULT",
		ScientificResult: false,
		BlockState: ReproductionBlockState{
			RemotePublication: "blocked",
			DigestAdmission:   "blocked",
			SourceBundle:      "not-produced",
			ScientificUse:     "blocked",
			LegalConclusion:   "not-made",
		},
		Contract: ReproductionContract{
			SHA256:          authority.contractSHA256,
			ResultAuthority: authority.contract.ResultAuthority,
			Platform:        authority.contract.Platform,
		},
		Builders: ReproductionBuilders{
			ApkoImage:                  authority.contract.Builder.Image,
			ApkoVersion:                apkoBuilder.Version,
			ApkoRevision:               apkoBuilder.Revision,
			ApkoGoVersion:              apkoBuilder.GoVersion,
			ApkoTreeState:              apkoBuilder.TreeState,
			ApkoBuildDate:              apkoBuilder.BuildDate,
			ApkoRequestedNetwork:       "docker-default",
			ApkoRequestedReadOnlyRoot:  true,
			ApkoRequestedCapabilities:  "drop-all",
			ApkoRequestedNoNewPrivs:    true,
			ApkoRequestedMemoryBytes:   authority.contract.Limits.ApkoMemoryBytes,
			ApkoRequestedMemorySwap:    authority.contract.Limits.ApkoMemoryBytes,
			ApkoRequestedPIDs:          authority.contract.Limits.ApkoPIDs,
			ApkoRequestedTemporary:     authority.contract.Limits.ApkoTemporaryBytes,
			BuildxVersion:              builder.BuildxVersion,
			BuildxRevision:             builder.BuildxRevision,
			BuildKitImage:              builder.BuildKitImage,
			BuildKitVersion:            builder.BuildKitVersion,
			FreshBuildKits:             reproductionBuildCount,
			DaemonNetwork:              "none",
			DaemonPrivileged:           true,
			DaemonAllowedEntitlements:  []string{"network.host"},
			RequestedBuildEntitlements: []string{},
			DaemonMemoryBytes:          authority.contract.Limits.BuildKitMemoryBytes,
			DaemonPIDs:                 authority.contract.Limits.BuildKitPIDs,
			DaemonCPUPeriod:            authority.contract.Limits.BuildKitCPUPeriod,
			DaemonCPUQuota:             authority.contract.Limits.BuildKitCPUQuota,
			DaemonMaximumParallelism:   1,
			NoCache:                    true,
			FinalNetwork:               authority.contract.Runtime.Network,
			RemotePush:                 false,
		},
		Comparator: comparator,
		Context: ReproductionContext{
			SHA256:           contextIdentity.SHA256,
			Entries:          contextIdentity.Entries,
			FileBytes:        contextIdentity.FileBytes,
			DockerfileSHA256: contextIdentity.Dockerfile,
			SourceDateEpoch:  authority.contract.SourceDateEpoch,
		},
		BaseBuilds:  baseReceipts,
		FinalBuilds: finalReceipts,
		Notices:     slices.Clone(inspection.Notices),
		ManPages:    slices.Clone(inspection.ManPages),
		Comparison:  comparison,
	}
	if candidate != nil {
		receipt.Scope = "local-pdf-tools-candidate-preparation"
		receipt.BlockState.SourceBundle = "candidate-prepared"
		receipt.Candidate = candidate
	}
	return receipt
}

func currentComparatorIdentity(root string) (ReproductionComparator, error) {
	path, err := os.Executable()
	if err != nil {
		return ReproductionComparator{}, fmt.Errorf("resolve PDF-tools comparator executable: %w", err)
	}
	file, err := openBoundedRegular(path, maximumComparatorExecutableBytes, "PDF-tools comparator executable")
	if err != nil {
		return ReproductionComparator{}, err
	}
	defer file.Close()
	hasher := sha256.New()
	written, err := io.Copy(hasher, io.LimitReader(file, maximumComparatorExecutableBytes+1))
	if err != nil {
		return ReproductionComparator{}, fmt.Errorf("hash PDF-tools comparator executable: %w", err)
	}
	if written > maximumComparatorExecutableBytes {
		return ReproductionComparator{}, errors.New("PDF-tools comparator executable exceeds its byte boundary while hashing")
	}
	if err := verifyOpenedRegular(path, file, written, "PDF-tools comparator executable"); err != nil {
		return ReproductionComparator{}, err
	}
	identity := buildinfo.Current()
	vcsRevision, vcsModified, err := comparatorVCSIdentity(root)
	if err != nil {
		return ReproductionComparator{}, err
	}
	sourceSHA256, sourceFiles, err := comparatorSourceIdentity(root)
	if err != nil {
		return ReproductionComparator{}, err
	}
	return ReproductionComparator{
		Version:          identity.Version,
		Revision:         identity.Revision,
		BuiltAt:          identity.BuiltAt,
		GoVersion:        identity.GoVersion,
		OperatingSystem:  identity.OperatingSys,
		Architecture:     identity.Architecture,
		ExecutableSHA256: hex.EncodeToString(hasher.Sum(nil)),
		ExecutableBytes:  written,
		VCSRevision:      vcsRevision,
		VCSModified:      vcsModified,
		SourceSHA256:     sourceSHA256,
		SourceFiles:      sourceFiles,
	}, nil
}

func comparatorVCSIdentity(root string) (string, bool, error) {
	revisionBody, err := runBoundedGit(root, []string{"rev-parse", "--verify", "HEAD^{commit}"}, 1024)
	if err != nil {
		return "", false, err
	}
	revision := strings.TrimSpace(string(revisionBody))
	if strings.Contains(revision, "\n") || !revisionPattern.MatchString(revision) {
		return "", false, errors.New("PDF-tools comparator repository has no exact HEAD revision")
	}
	if information, available := debug.ReadBuildInfo(); available {
		for _, setting := range information.Settings {
			if setting.Key == "vcs.revision" && revisionPattern.MatchString(setting.Value) && setting.Value != revision {
				return "", false, errors.New("PDF-tools comparator binary revision differs from repository HEAD")
			}
		}
	}
	status, err := runBoundedGit(root, []string{
		"status", "--porcelain=v1", "--untracked-files=all", "--", "tooling",
	}, 2*1024*1024)
	if err != nil {
		return "", false, err
	}
	return revision, len(status) != 0, nil
}

func runBoundedGit(root string, arguments []string, maximum int64) ([]byte, error) {
	gitBinary, err := exec.LookPath("git")
	if err != nil {
		return nil, errors.New("Git is required to identify the local PDF-tools comparator")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	stdout := &boundedDockerOutput{limit: maximum}
	stderr := &boundedDockerOutput{limit: 64 * 1024}
	commandArguments := append([]string{"-C", root}, arguments...)
	command := exec.CommandContext(ctx, gitBinary, commandArguments...)
	command.Env = boundedDockerEnvironment()
	command.Stdout = stdout
	command.Stderr = stderr
	command.WaitDelay = maximumDockerWaitDelay
	err = command.Run()
	stdoutBody, stdoutExceeded := stdout.result()
	stderrBody, stderrExceeded := stderr.result()
	if ctx.Err() != nil {
		return nil, fmt.Errorf("identify PDF-tools comparator with Git: %w", ctx.Err())
	}
	if stdoutExceeded || stderrExceeded {
		return nil, errors.New("Git comparator identity output exceeds its byte boundary")
	}
	if err != nil {
		return nil, fmt.Errorf("identify PDF-tools comparator with Git: %w: %s", err, strings.TrimSpace(string(stderrBody)))
	}
	if len(stderrBody) != 0 {
		return nil, errors.New("Git comparator identity wrote unexpected stderr")
	}
	return stdoutBody, nil
}

func comparatorSourceIdentity(root string) (string, int, error) {
	toolingRoot := filepath.Join(root, "tooling")
	type sourceFile struct {
		relative string
		body     []byte
	}
	files := make([]sourceFile, 0, 128)
	var total int64
	err := walkBoundedTree(
		toolingRoot,
		maximumComparatorSourceEntries,
		maximumComparatorSourceDepth,
		func(path string, _ string, information os.FileInfo) error {
			if information.IsDir() {
				return nil
			}
			name := filepath.Base(path)
			if filepath.Ext(name) != ".go" && name != "go.mod" && name != "go.sum" {
				return nil
			}
			if len(files) >= 4096 {
				return errors.New("PDF-tools comparator source closure exceeds its file-count boundary")
			}
			relative, err := filepath.Rel(root, path)
			if err != nil {
				return err
			}
			relative = filepath.ToSlash(relative)
			body, err := readRelative(root, relative, "PDF-tools comparator source "+relative, 4*1024*1024)
			if err != nil {
				return err
			}
			total += int64(len(body))
			if total > 64*1024*1024 {
				return errors.New("PDF-tools comparator source closure exceeds its byte boundary")
			}
			files = append(files, sourceFile{relative: relative, body: body})
			return nil
		},
	)
	if err != nil {
		return "", 0, fmt.Errorf("hash PDF-tools comparator source closure: %w", err)
	}
	if len(files) == 0 {
		return "", 0, errors.New("PDF-tools comparator source closure is empty")
	}
	slices.SortFunc(files, func(left, right sourceFile) int {
		return strings.Compare(left.relative, right.relative)
	})
	digest := sha256.New()
	for _, file := range files {
		writeContextDigestField(digest, []byte(file.relative))
		writeContextDigestField(digest, file.body)
	}
	return hex.EncodeToString(digest.Sum(nil)), len(files), nil
}

func reproductionBuildReceipt(sequence int, identity imageIdentity, spdx, spdxIndex *spdxIdentity) ReproductionBuild {
	receipt := ReproductionBuild{
		Sequence:      sequence,
		ArchiveSHA256: identity.ArchiveSHA256,
		ArchiveBytes:  identity.ArchiveSize,
		Manifest:      identity.ManifestDigest,
		Config:        identity.ConfigDigest,
		Layers:        slices.Clone(identity.LayerDigests),
		DiffIDs:       slices.Clone(identity.LayerDiffIDs),
	}
	if spdx != nil {
		receipt.SPDX = reproductionSPDXReceipt(*spdx)
	}
	if spdxIndex != nil {
		receipt.SPDXIndex = reproductionSPDXReceipt(*spdxIndex)
	}
	return receipt
}

func reproductionSPDXReceipt(identity spdxIdentity) *ReproductionSPDX {
	return &ReproductionSPDX{
		RawSHA256:       identity.RawSHA256,
		RawBytes:        identity.RawSize,
		CanonicalSHA256: identity.CanonicalSHA256,
		CanonicalBytes:  identity.CanonicalSize,
		Packages:        identity.Packages,
		Relationships:   identity.Relationships,
	}
}

func prepareReproductionReceiptPath(root, relative string) (string, error) {
	repository, err := publicationRoot(root, nil)
	if err != nil {
		return "", err
	}
	return prepareReproductionReceiptPathAtRoot(repository, relative, nil)
}

func prepareReproductionReceiptPathAtRoot(
	repository publicationRootIdentity,
	relative string,
	beforeComponent func(string) error,
) (string, error) {
	clean, err := validateReproductionReceiptRelative(relative)
	if err != nil {
		return "", err
	}
	parent, err := openPinnedPublicationDirectory(
		repository, filepath.Dir(clean), true, beforeComponent,
	)
	if err != nil {
		return "", err
	}
	defer parent.close()
	name, err := publicationFilename(clean)
	if err != nil {
		return "", errors.New("PDF-tools reproduction receipt filename is invalid")
	}
	if _, err := parent.root.Lstat(name); err == nil {
		return "", errors.New("PDF-tools reproduction receipt already exists")
	} else if !errors.Is(err, os.ErrNotExist) {
		return "", fmt.Errorf("inspect PDF-tools reproduction receipt: %w", err)
	}
	return filepath.Join(repository.path, clean), nil
}

func validateReproductionReceiptRelative(relative string) (string, error) {
	if relative == "" || filepath.IsAbs(relative) || strings.Contains(relative, "\\") ||
		containsConfusingPathControl(relative) || !validRelativePath(filepath.ToSlash(relative)) {
		return "", errors.New("PDF-tools reproduction receipt must be a safe repository-relative JSON path")
	}
	clean := filepath.Clean(relative)
	if clean == "." || clean == ".." || strings.HasPrefix(clean, ".."+string(filepath.Separator)) ||
		filepath.Ext(clean) != ".json" {
		return "", errors.New("PDF-tools reproduction receipt must be a safe repository-relative JSON path")
	}
	slash := filepath.ToSlash(clean)
	allowed := slices.ContainsFunc([]string{
		".workingdir2/evidence/publication/",
		"build/evidence/",
		"build/release-inputs/",
	}, func(prefix string) bool { return strings.HasPrefix(slash, prefix) })
	if !allowed {
		return "", errors.New("PDF-tools reproduction receipt must be under publication or release evidence")
	}
	return clean, nil
}

func writeReproductionReceipt(root, path string, receipt ReproductionReceipt, maximum int64) error {
	return writeReproductionReceiptChecked(root, path, receipt, maximum, nil)
}

func writeReproductionReceiptChecked(
	root string,
	path string,
	receipt ReproductionReceipt,
	maximum int64,
	beforePublish func() error,
) error {
	repository, err := publicationRoot(root, nil)
	if err != nil {
		return err
	}
	return writeReproductionReceiptCheckedAtRoot(
		repository, path, receipt, maximum, beforePublish, nil,
	)
}

func writeReproductionReceiptCheckedAtRoot(
	repository publicationRootIdentity,
	path string,
	receipt ReproductionReceipt,
	maximum int64,
	beforePublish func() error,
	afterLink func(*pinnedPublicationDirectory, string) error,
) (returnError error) {
	body, err := json.MarshalIndent(receipt, "", "  ")
	if err != nil {
		return fmt.Errorf("encode PDF-tools reproduction receipt: %w", err)
	}
	body = append(body, '\n')
	if maximum <= 0 || int64(len(body)) > maximum {
		return errors.New("PDF-tools reproduction receipt exceeds its byte boundary")
	}
	path = filepath.Clean(path)
	relative, err := filepath.Rel(repository.path, path)
	if err != nil || relative == ".." || strings.HasPrefix(relative, ".."+string(filepath.Separator)) {
		return errors.New("PDF-tools reproduction receipt escapes the repository root")
	}
	cleanRelative, err := validateReproductionReceiptRelative(filepath.ToSlash(relative))
	if err != nil || cleanRelative != relative {
		return errors.New("PDF-tools reproduction receipt path is not an admitted repository-relative JSON path")
	}
	parent, err := openPinnedPublicationDirectory(repository, filepath.Dir(relative), false, nil)
	if err != nil {
		return err
	}
	defer func() { returnError = errors.Join(returnError, parent.close()) }()
	name, err := publicationFilename(path)
	if err != nil {
		return errors.New("PDF-tools reproduction receipt filename is invalid")
	}
	if _, err := parent.root.Lstat(name); err == nil {
		return errors.New("PDF-tools reproduction receipt already exists")
	} else if !errors.Is(err, os.ErrNotExist) {
		return fmt.Errorf("inspect PDF-tools reproduction receipt before publication: %w", err)
	}
	temporary, temporaryInformation, err := createUnnamedPublicationFile(parent, "PDF-tools reproduction receipt")
	if err != nil {
		return err
	}
	defer func() {
		if closeError := temporary.Close(); closeError != nil {
			returnError = errors.Join(returnError, fmt.Errorf("close unnamed PDF-tools reproduction receipt: %w", closeError))
		}
	}()
	if _, err := temporary.Write(body); err != nil {
		return fmt.Errorf("write unnamed PDF-tools reproduction receipt: %w", err)
	}
	if err := temporary.Chmod(0o644); err != nil {
		return fmt.Errorf("normalise unnamed PDF-tools reproduction receipt: %w", err)
	}
	if err := temporary.Sync(); err != nil {
		return fmt.Errorf("sync unnamed PDF-tools reproduction receipt: %w", err)
	}
	writtenInformation, err := temporary.Stat()
	if err != nil || !writtenInformation.Mode().IsRegular() || writtenInformation.Mode().Perm() != 0o644 ||
		!os.SameFile(temporaryInformation, writtenInformation) || writtenInformation.Size() != int64(len(body)) {
		return errors.New("unnamed PDF-tools reproduction receipt changed before publication")
	}
	if beforePublish != nil {
		if err := beforePublish(); err != nil {
			return fmt.Errorf("verify PDF-tools candidate outputs before receipt publication: %w", err)
		}
	}
	if err := parent.verify(); err != nil {
		return errors.New("PDF-tools reproduction receipt directory changed before publication")
	}
	if err := linkUnnamedPublicationFile(temporary, parent.descriptor, name); err != nil {
		return fmt.Errorf("atomically publish new PDF-tools reproduction receipt: %w", err)
	}
	if afterLink != nil {
		if err := afterLink(parent, name); err != nil {
			return fmt.Errorf("validate PDF-tools reproduction receipt after atomic publication: %w", err)
		}
	}
	finalInfo, finalError := parent.root.Lstat(name)
	if finalError != nil || !finalInfo.Mode().IsRegular() || finalInfo.Mode()&os.ModeSymlink != 0 ||
		!os.SameFile(writtenInformation, finalInfo) || finalInfo.Size() != int64(len(body)) {
		return errors.New("published PDF-tools reproduction receipt changed during atomic placement")
	}
	if err := verifyPublishedReceiptBytes(parent.root, name, finalInfo, body); err != nil {
		return err
	}
	if err := parent.sync(); err != nil {
		return fmt.Errorf("sync published PDF-tools reproduction receipt: %w", err)
	}
	currentInformation, err := parent.root.Lstat(name)
	if err != nil || !currentInformation.Mode().IsRegular() || currentInformation.Mode()&os.ModeSymlink != 0 ||
		!os.SameFile(finalInfo, currentInformation) || currentInformation.Size() != int64(len(body)) {
		return errors.New("published PDF-tools reproduction receipt path changed during confirmation")
	}
	return nil
}

func verifyPublishedReceiptBytes(root *os.Root, name string, expected os.FileInfo, body []byte) error {
	file, err := root.Open(name)
	if err != nil {
		return fmt.Errorf("open published PDF-tools reproduction receipt: %w", err)
	}
	defer file.Close()
	opened, err := file.Stat()
	if err != nil || !os.SameFile(expected, opened) || opened.Size() != int64(len(body)) {
		return errors.New("published PDF-tools reproduction receipt changed while it was opened")
	}
	hasher := sha256.New()
	written, copyError := io.Copy(hasher, io.LimitReader(file, int64(len(body))+1))
	if copyError != nil || written != int64(len(body)) ||
		hex.EncodeToString(hasher.Sum(nil)) != rawDigest(body) {
		return errors.New("published PDF-tools reproduction receipt bytes changed")
	}
	current, err := root.Lstat(name)
	if err != nil || !os.SameFile(opened, current) {
		return errors.New("published PDF-tools reproduction receipt path changed while it was read")
	}
	return nil
}
