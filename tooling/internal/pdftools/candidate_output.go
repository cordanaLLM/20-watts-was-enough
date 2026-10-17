package pdftools

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"slices"
	"strings"

	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/relpath"
)

// CandidateOutputOptions selects one authoritative local publication bundle
// and three non-authoritative convenience copies. The set is all-or-none and
// never performs a remote publication.
type CandidateOutputOptions struct {
	PublicationBundlePath string
	FinalArchivePath      string
	SPDXPath              string
	SourceBundlePath      string
}

type candidateOutputPath struct {
	relative string
	absolute string
}

type candidateOutputPlan struct {
	repository        publicationRootIdentity
	publicationBundle candidateOutputPath
	finalArchive      candidateOutputPath
	spdx              candidateOutputPath
	sourceBundle      candidateOutputPath
}

type stagedCandidateArtifact struct {
	parent               *pinnedPublicationDirectory
	unnamed              *os.File
	unnamedInformation   os.FileInfo
	destination          candidateOutputPath
	destinationName      string
	identity             ReproductionArtifact
	publishedInformation os.FileInfo
}

type stagedCandidate struct {
	artifacts     []*stagedCandidateArtifact
	bundle        sourceBundleIdentity
	retainedAPKs  int
	retainedBytes int64
}

func prepareCandidateOutputPlan(
	authority checkedAuthority,
	options *CandidateOutputOptions,
	receiptPath string,
) (*candidateOutputPlan, error) {
	if options == nil {
		return nil, nil
	}
	values := []string{
		options.PublicationBundlePath,
		options.FinalArchivePath,
		options.SPDXPath,
		options.SourceBundlePath,
	}
	if slices.Contains(values, "") {
		return nil, errors.New("PDF-tools candidate output paths are an all-or-none set")
	}
	repository, err := publicationRoot(authority.root, authority.rootInformation)
	if err != nil {
		return nil, err
	}
	publicationBundle, err := prepareCandidateOutputPath(
		authority.root, options.PublicationBundlePath, ".tar", "candidate publication bundle",
	)
	if err != nil {
		return nil, err
	}
	finalArchive, err := prepareCandidateOutputPath(authority.root, options.FinalArchivePath, ".tar", "final OCI archive")
	if err != nil {
		return nil, err
	}
	spdx, err := prepareCandidateOutputPath(authority.root, options.SPDXPath, ".spdx.json", "apko SPDX")
	if err != nil {
		return nil, err
	}
	bundle, err := prepareCandidateOutputPath(authority.root, options.SourceBundlePath, ".tar.gz", "source bundle")
	if err != nil {
		return nil, err
	}
	if filepath.Base(bundle.relative) != authority.contract.SourceDelivery.CandidateBundle {
		return nil, errors.New("PDF-tools source-bundle filename differs from contract.json")
	}
	paths := []string{
		filepath.Clean(receiptPath), publicationBundle.relative,
		finalArchive.relative, spdx.relative, bundle.relative,
	}
	for left, value := range paths {
		for right := left + 1; right < len(paths); right++ {
			if outputPathsConflict(value, paths[right]) {
				return nil, errors.New("PDF-tools receipt and candidate output paths must be distinct non-ancestor paths")
			}
		}
	}
	outputs := []candidateOutputPath{publicationBundle, finalArchive, spdx, bundle}
	for _, output := range outputs {
		if err := prepareCandidateOutputDirectory(repository, output); err != nil {
			return nil, err
		}
	}
	return &candidateOutputPlan{
		repository: repository, publicationBundle: publicationBundle,
		finalArchive: finalArchive, spdx: spdx, sourceBundle: bundle,
	}, nil
}

func outputPathsConflict(left, right string) bool {
	left = filepath.Clean(left)
	right = filepath.Clean(right)
	separator := string(filepath.Separator)
	return left == right || strings.HasPrefix(left, right+separator) || strings.HasPrefix(right, left+separator)
}

func prepareCandidateOutputPath(root, relative, suffix, label string) (candidateOutputPath, error) {
	normalized := filepath.ToSlash(relative)
	if strings.Contains(relative, "\\") || containsConfusingPathControl(relative) ||
		!relpath.Valid(normalized) || !strings.HasSuffix(normalized, suffix) ||
		!allowedReproductionOutputPath(normalized) {
		return candidateOutputPath{}, fmt.Errorf("PDF-tools %s must be a safe repository-relative %s path under publication or release evidence", label, suffix)
	}
	clean := filepath.Clean(relative)
	destination := filepath.Join(root, clean)
	return candidateOutputPath{relative: filepath.ToSlash(clean), absolute: destination}, nil
}

func prepareCandidateOutputDirectory(repository publicationRootIdentity, output candidateOutputPath) error {
	parent, err := openPinnedPublicationDirectory(repository, filepath.Dir(output.relative), true, nil)
	if err != nil {
		return err
	}
	defer parent.close()
	name, err := publicationFilename(output.absolute)
	if err != nil || filepath.Base(output.relative) != name {
		return errors.New("PDF-tools candidate output filename is invalid")
	}
	if _, err := parent.root.Lstat(name); err == nil {
		return fmt.Errorf("PDF-tools candidate output %s already exists", output.relative)
	} else if !errors.Is(err, os.ErrNotExist) {
		return fmt.Errorf("inspect PDF-tools candidate output %s: %w", output.relative, err)
	}
	return nil
}

func allowedReproductionOutputPath(relative string) bool {
	return slices.ContainsFunc([]string{
		".workingdir/evidence/publication/",
		"build/evidence/",
		"build/release-inputs/",
	}, func(prefix string) bool { return strings.HasPrefix(relative, prefix) })
}

func stageCandidateOutputs(
	ctx context.Context,
	authority checkedAuthority,
	plan *candidateOutputPlan,
	bases []baseBuild,
	finals []finalBuild,
	fetch sourceFetcher,
) (_ *stagedCandidate, returnError error) {
	if plan == nil || len(bases) != reproductionBuildCount || len(finals) != reproductionBuildCount {
		return nil, errors.New("candidate staging requires one complete two-build comparison")
	}
	if !slices.Equal(bases[0].SPDX.canonical, bases[1].SPDX.canonical) {
		return nil, errors.New("candidate preparation requires byte-identical canonical apko SPDX outputs")
	}
	repository, err := publicationRoot(authority.root, authority.rootInformation)
	if err != nil || plan.repository.path != repository.path ||
		plan.repository.information == nil || repository.information == nil ||
		!os.SameFile(plan.repository.information, repository.information) {
		return nil, errors.New("candidate output plan differs from the checked repository root")
	}
	entries, err := candidateSourceEntries(ctx, authority, bases[0].SPDX, fetch)
	if err != nil {
		return nil, err
	}
	staged := &stagedCandidate{
		artifacts:    make([]*stagedCandidateArtifact, 0, 3),
		retainedAPKs: len(authority.retention.Packages), retainedBytes: authority.retention.TotalBytes,
	}
	defer func() {
		if returnError != nil {
			returnError = errors.Join(returnError, staged.cleanup())
		}
	}()
	finalArtifact, err := stageCandidateRegular(
		plan.repository, finals[0].Archive, plan.finalArchive, authority.contract.Limits.FinalArchiveBytes,
		finals[0].Image.Identity.ArchiveSHA256,
	)
	if err != nil {
		return nil, err
	}
	staged.artifacts = append(staged.artifacts, finalArtifact)
	spdxArtifact, err := stageCandidateBytes(
		plan.repository, bases[0].SPDX.canonical, plan.spdx, authority.contract.Limits.SPDXBytes,
		bases[0].SPDX.CanonicalSHA256,
	)
	if err != nil {
		return nil, err
	}
	staged.artifacts = append(staged.artifacts, spdxArtifact)
	bundleArtifact, bundle, err := stageCandidateBundle(authority, plan.repository, plan.sourceBundle, entries)
	if err != nil {
		return nil, err
	}
	staged.artifacts = append(staged.artifacts, bundleArtifact)
	staged.bundle = bundle
	return staged, nil
}

func stageCandidateRegular(
	repository publicationRootIdentity,
	source string,
	destination candidateOutputPath,
	maximum int64,
	expectedSHA256 string,
) (_ *stagedCandidateArtifact, returnError error) {
	input, err := openBoundedRegular(source, maximum, "retained final OCI archive")
	if err != nil {
		return nil, err
	}
	defer input.Close()
	staged, output, err := newStagedCandidateArtifact(repository, destination)
	if err != nil {
		return nil, err
	}
	defer func() {
		if returnError != nil {
			returnError = errors.Join(returnError, staged.cleanup())
		}
	}()
	hasher := sha256.New()
	written, err := io.Copy(io.MultiWriter(output, hasher), io.LimitReader(input, maximum+1))
	if err != nil || written <= 0 || written > maximum || hex.EncodeToString(hasher.Sum(nil)) != expectedSHA256 {
		return nil, errors.New("retained final OCI archive differs from the reproduced identity")
	}
	if err := verifyOpenedRegular(source, input, written, "retained final OCI archive"); err != nil {
		return nil, err
	}
	if err := finishStagedCandidateArtifact(staged, output, written, expectedSHA256); err != nil {
		return nil, err
	}
	return staged, nil
}

func stageCandidateBytes(
	repository publicationRootIdentity,
	body []byte,
	destination candidateOutputPath,
	maximum int64,
	expectedSHA256 string,
) (_ *stagedCandidateArtifact, returnError error) {
	if len(body) == 0 || int64(len(body)) > maximum || digestRaw(body) != expectedSHA256 {
		return nil, errors.New("retained candidate bytes differ from their authority")
	}
	staged, output, err := newStagedCandidateArtifact(repository, destination)
	if err != nil {
		return nil, err
	}
	defer func() {
		if returnError != nil {
			returnError = errors.Join(returnError, staged.cleanup())
		}
	}()
	if _, err := output.Write(body); err != nil {
		return nil, fmt.Errorf("write retained candidate bytes: %w", err)
	}
	if err := finishStagedCandidateArtifact(staged, output, int64(len(body)), expectedSHA256); err != nil {
		return nil, err
	}
	return staged, nil
}

func stageCandidateBundle(
	authority checkedAuthority,
	repository publicationRootIdentity,
	destination candidateOutputPath,
	entries []sourceBundleEntry,
) (_ *stagedCandidateArtifact, _ sourceBundleIdentity, returnError error) {
	staged, output, err := newStagedCandidateArtifact(repository, destination)
	if err != nil {
		return nil, sourceBundleIdentity{}, err
	}
	defer func() {
		if returnError != nil {
			returnError = errors.Join(returnError, staged.cleanup())
		}
	}()
	contract := authority.contract
	identity, err := writeDeterministicSourceBundle(
		output, entries, contract.SourceDelivery.BundleLayout,
		contract.SourceDateEpoch, contract.Limits.SourceBundleBytes,
	)
	if err != nil {
		return nil, sourceBundleIdentity{}, err
	}
	second, err := writeDeterministicSourceBundle(
		io.Discard, entries, contract.SourceDelivery.BundleLayout,
		contract.SourceDateEpoch, contract.Limits.SourceBundleBytes,
	)
	if err != nil || identity != second {
		return nil, sourceBundleIdentity{}, errors.New("source bundle did not reproduce deterministically")
	}
	if err := finishStagedCandidateArtifact(staged, output, identity.Bytes, identity.SHA256); err != nil {
		return nil, sourceBundleIdentity{}, err
	}
	return staged, identity, nil
}

func newStagedCandidateArtifact(
	repository publicationRootIdentity,
	destination candidateOutputPath,
) (_ *stagedCandidateArtifact, _ *os.File, returnError error) {
	if filepath.Clean(destination.absolute) != filepath.Join(repository.path, filepath.FromSlash(destination.relative)) {
		return nil, nil, errors.New("candidate output path differs from its checked repository identity")
	}
	parent, err := openPinnedPublicationDirectory(repository, filepath.Dir(destination.relative), false, nil)
	if err != nil {
		return nil, nil, err
	}
	defer func() {
		if returnError != nil {
			returnError = errors.Join(returnError, parent.close())
		}
	}()
	destinationName, err := publicationFilename(destination.absolute)
	if err != nil || filepath.Base(destination.relative) != destinationName {
		return nil, nil, errors.New("candidate output filename is invalid")
	}
	if _, err := parent.root.Lstat(destinationName); err == nil {
		return nil, nil, errors.New("candidate output appeared before staging")
	} else if !errors.Is(err, os.ErrNotExist) {
		return nil, nil, fmt.Errorf("inspect candidate output before staging: %w", err)
	}
	file, information, err := createUnnamedPublicationFile(parent, "candidate output")
	if err != nil {
		return nil, nil, err
	}
	return &stagedCandidateArtifact{
		parent: parent, unnamed: file, unnamedInformation: information,
		destination: destination, destinationName: destinationName,
	}, file, nil
}

func finishStagedCandidateArtifact(
	staged *stagedCandidateArtifact,
	file *os.File,
	size int64,
	sha256 string,
) error {
	if staged == nil || staged.parent == nil || staged.unnamed == nil || staged.unnamed != file ||
		staged.unnamedInformation == nil ||
		size <= 0 || !rawDigestPattern.MatchString(sha256) {
		return errors.New("candidate output identity is invalid")
	}
	if err := file.Chmod(0o644); err != nil {
		return fmt.Errorf("normalise candidate output mode: %w", err)
	}
	if err := file.Sync(); err != nil {
		return fmt.Errorf("sync candidate output staging file: %w", err)
	}
	information, err := file.Stat()
	if err != nil || !information.Mode().IsRegular() || information.Mode().Perm() != 0o644 ||
		!os.SameFile(staged.unnamedInformation, information) || information.Size() != size {
		return errors.New("candidate output staging file changed before local placement")
	}
	staged.unnamedInformation = information
	staged.identity = ReproductionArtifact{Path: staged.destination.relative, SHA256: sha256, Bytes: size}
	return nil
}

func (staged *stagedCandidate) install(root string) error {
	return staged.installWithPublicationHooks(root, nil, nil)
}

func (staged *stagedCandidate) installWithPostLinkHook(
	root string,
	afterLink func(*stagedCandidateArtifact) error,
) (returnError error) {
	return staged.installWithPublicationHooks(root, nil, afterLink)
}

func (staged *stagedCandidate) installWithPublicationHooks(
	root string,
	beforeLink func(*stagedCandidateArtifact) error,
	afterLink func(*stagedCandidateArtifact) error,
) (returnError error) {
	for _, artifact := range staged.artifacts {
		if err := verifyCandidateOutputParent(root, artifact); err != nil {
			return err
		}
		if _, err := artifact.parent.root.Lstat(artifact.destinationName); err == nil {
			return errors.New("candidate output appeared before atomic placement")
		} else if !errors.Is(err, os.ErrNotExist) {
			return fmt.Errorf("inspect candidate output before atomic placement: %w", err)
		}
		if beforeLink != nil {
			if err := beforeLink(artifact); err != nil {
				return fmt.Errorf("candidate output pre-link test boundary: %w", err)
			}
		}
		if err := linkUnnamedPublicationFile(
			artifact.unnamed, artifact.parent.descriptor, artifact.destinationName,
		); err != nil {
			return fmt.Errorf("atomically place candidate output: %w", err)
		}
		artifact.publishedInformation = artifact.unnamedInformation
		if afterLink != nil {
			if err := afterLink(artifact); err != nil {
				return fmt.Errorf("validate candidate output after atomic placement: %w", err)
			}
		}
		unnamedInfo, unnamedError := artifact.unnamed.Stat()
		finalInfo, finalError := artifact.parent.root.Lstat(artifact.destinationName)
		if unnamedError != nil || finalError != nil || !finalInfo.Mode().IsRegular() ||
			finalInfo.Mode()&os.ModeSymlink != 0 || !os.SameFile(artifact.unnamedInformation, unnamedInfo) ||
			!os.SameFile(unnamedInfo, finalInfo) ||
			finalInfo.Size() != artifact.identity.Bytes {
			return errors.New("candidate output changed during atomic placement")
		}
		artifact.publishedInformation = finalInfo
		if err := verifyInstalledCandidateArtifact(root, artifact); err != nil {
			return err
		}
		if err := artifact.parent.sync(); err != nil {
			return fmt.Errorf("sync atomically placed candidate output: %w", err)
		}
	}
	return nil
}

func verifyInstalledCandidateArtifact(root string, artifact *stagedCandidateArtifact) error {
	label := "installed PDF-tools candidate output " + artifact.identity.Path
	if artifact.parent == nil || artifact.parent.root == nil || artifact.destinationName == "" || artifact.publishedInformation == nil ||
		artifact.identity.Bytes <= 0 ||
		!rawDigestPattern.MatchString(artifact.identity.SHA256) {
		return fmt.Errorf("%s has no stable publication identity", label)
	}
	if err := verifyCandidateOutputParent(root, artifact); err != nil {
		return err
	}
	current, err := artifact.parent.root.Lstat(artifact.destinationName)
	if err != nil || !sameCandidatePublication(current, artifact.publishedInformation, artifact.identity.Bytes) {
		return fmt.Errorf("%s changed after atomic placement", label)
	}
	file, err := artifact.parent.root.Open(artifact.destinationName)
	if err != nil {
		return fmt.Errorf("open %s for receipt verification: %w", label, err)
	}
	opened, err := file.Stat()
	if err != nil || !sameCandidatePublication(opened, artifact.publishedInformation, artifact.identity.Bytes) ||
		!os.SameFile(opened, current) {
		_ = file.Close()
		return fmt.Errorf("%s changed while it was reopened", label)
	}
	hasher := sha256.New()
	written, copyError := io.Copy(hasher, io.LimitReader(file, artifact.identity.Bytes+1))
	digest := hex.EncodeToString(hasher.Sum(nil))
	if copyError != nil || written != artifact.identity.Bytes || digest != artifact.identity.SHA256 {
		_ = file.Close()
		return fmt.Errorf("%s bytes differ from the receipt identity", label)
	}
	openedAfterRead, err := file.Stat()
	if err != nil || !sameCandidatePublication(openedAfterRead, artifact.publishedInformation, written) ||
		!os.SameFile(opened, openedAfterRead) {
		_ = file.Close()
		return fmt.Errorf("%s changed while it was read", label)
	}
	current, err = artifact.parent.root.Lstat(artifact.destinationName)
	if err != nil || !sameCandidatePublication(current, artifact.publishedInformation, artifact.identity.Bytes) ||
		!os.SameFile(opened, current) {
		_ = file.Close()
		return fmt.Errorf("%s changed during receipt verification", label)
	}
	if err := file.Close(); err != nil {
		return fmt.Errorf("close %s after receipt verification: %w", label, err)
	}
	if err := verifyCandidateOutputParent(root, artifact); err != nil {
		return err
	}
	return nil
}

func sameCandidatePublication(current, published os.FileInfo, size int64) bool {
	return current != nil && published != nil && current.Mode().IsRegular() &&
		current.Mode()&os.ModeSymlink == 0 && os.SameFile(current, published) &&
		current.Mode() == published.Mode() && current.Size() == size && published.Size() == size &&
		current.ModTime().Equal(published.ModTime())
}

func (staged *stagedCandidate) cleanup() error {
	var result error
	for _, artifact := range staged.artifacts {
		result = errors.Join(result, artifact.cleanup())
	}
	return result
}

func (artifact *stagedCandidateArtifact) cleanup() error {
	if artifact == nil {
		return nil
	}
	var result error
	if artifact.unnamed != nil {
		result = errors.Join(result, artifact.unnamed.Close())
		artifact.unnamed = nil
	}
	if artifact.parent != nil {
		result = errors.Join(result, artifact.parent.close())
		artifact.parent = nil
	}
	return result
}

func (staged *stagedCandidate) receipt(authority checkedAuthority) *ReproductionCandidate {
	finalArchive := staged.artifacts[0].identity
	finalArchive.Path = candidateBundleFinalArchiveMember
	canonicalSPDX := staged.artifacts[1].identity
	canonicalSPDX.Path = candidateBundleSPDXMember
	sourceBundle := staged.artifacts[2].identity
	sourceBundle.Path = candidateBundleSourceBundleMember
	return &ReproductionCandidate{
		BundleFormat:             candidatePublicationBundleFormat,
		StandaloneFilesAuthority: "non-authoritative-convenience",
		State:                    "local-bundle-prepared",
		SPDXCanonicalBuildsMatch: true,
		FinalArchive:             finalArchive,
		CanonicalSPDX:            canonicalSPDX,
		SourceBundle: ReproductionBundleArtifact{
			ReproductionArtifact: sourceBundle,
			Root:                 authority.contract.SourceDelivery.BundleLayout.Root,
			ChecksumManifest:     authority.contract.SourceDelivery.BundleLayout.ChecksumManifest,
			ChecksumSHA256:       staged.bundle.ChecksumSHA256, ChecksumBytes: staged.bundle.ChecksumBytes,
			PayloadFiles: staged.bundle.PayloadFiles, ArchiveFiles: staged.bundle.ArchiveFiles,
			UncompressedFileBytes: staged.bundle.UncompressedFileBytes, Deterministic: true,
		},
		RetainedAPKs: staged.retainedAPKs, RetainedBytes: staged.retainedBytes,
	}
}

func verifyCandidateOutputParent(repositoryRoot string, artifact *stagedCandidateArtifact) error {
	if artifact == nil || artifact.parent == nil || artifact.parent.repository.path != repositoryRoot ||
		filepath.Dir(artifact.destination.relative) != artifact.parent.relative ||
		filepath.Dir(artifact.destination.absolute) != filepath.Join(repositoryRoot, artifact.parent.relative) {
		return errors.New("candidate output has no stable pinned directory")
	}
	return artifact.parent.verify()
}
