package pdftools

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"slices"
	"time"
)

// ReproductionOptions selects one local final-image reproduction. ReceiptPath
// receives an ordinary success receipt or candidate-run mismatch evidence; a
// successful candidate receipt is embedded only in its publication bundle.
type ReproductionOptions struct {
	RepositoryRoot string
	ReceiptPath    string
	Candidate      *CandidateOutputOptions
}

func verifyReproductionPreconditions(
	ctx context.Context,
	executor dockerExecutor,
	authority checkedAuthority,
) (ReproductionComparator, apkoBuilderIdentity, error) {
	comparator, err := currentComparatorIdentity(authority.root)
	if err != nil {
		return ReproductionComparator{}, apkoBuilderIdentity{}, err
	}
	if err := verifyLocalDockerEndpoint(ctx, executor, authority); err != nil {
		return ReproductionComparator{}, apkoBuilderIdentity{}, err
	}
	if err := verifyBuildxIdentity(ctx, executor, authority); err != nil {
		return ReproductionComparator{}, apkoBuilderIdentity{}, err
	}
	apkoBuilder, err := inspectApkoBuilderIdentity(ctx, executor, authority)
	if err != nil {
		return ReproductionComparator{}, apkoBuilderIdentity{}, err
	}
	return comparator, apkoBuilder, nil
}

func runReproductionBaseBuilds(
	ctx context.Context,
	executor dockerExecutor,
	authority checkedAuthority,
	temporaryRoot string,
) ([]baseBuild, bool, error) {
	bases := make([]baseBuild, 0, reproductionBuildCount)
	for sequence := 1; sequence <= reproductionBuildCount; sequence++ {
		build, err := runApkoBuild(ctx, executor, authority, temporaryRoot, sequence)
		if err != nil {
			return nil, false, err
		}
		if err := ensureAuthorityUnchanged(authority); err != nil {
			return nil, false, err
		}
		bases = append(bases, build)
	}
	baseArchiveEqual, err := equalRegularFiles(
		bases[0].Archive, bases[1].Archive, authority.contract.Limits.BaseArchiveBytes,
	)
	if err != nil {
		return nil, false, err
	}
	return bases, baseArchiveEqual, nil
}

func runReproductionFinalBuilds(
	ctx context.Context,
	executor dockerExecutor,
	authority checkedAuthority,
	temporaryRoot string,
	bases []baseBuild,
) (noticeContextIdentity, []finalBuild, []layerInspection, bool, bool, error) {
	contextRoot := filepath.Join(temporaryRoot, "notice-context")
	if err := os.Mkdir(contextRoot, 0o700); err != nil {
		return noticeContextIdentity{}, nil, nil, false, false, fmt.Errorf("create PDF-tools final-image context: %w", err)
	}
	contextIdentity, err := prepareNoticeContext(ctx, contextRoot, authority)
	if err != nil {
		return noticeContextIdentity{}, nil, nil, false, false, err
	}
	finals := make([]finalBuild, 0, reproductionBuildCount)
	inspections := make([]layerInspection, 0, reproductionBuildCount)
	contextStable := true
	for sequence := 1; sequence <= reproductionBuildCount; sequence++ {
		build, err := runFinalBuild(
			ctx, executor, authority, bases[sequence-1], contextRoot, temporaryRoot, sequence,
		)
		if err != nil {
			return noticeContextIdentity{}, nil, nil, false, false, err
		}
		currentContext, err := inspectNoticeContext(ctx, contextRoot, authority.contract)
		if err != nil {
			return noticeContextIdentity{}, nil, nil, false, false, err
		}
		contextStable = contextStable && currentContext == contextIdentity
		inspection, err := inspectFinalLayers(ctx, build.Image, authority.contract)
		if err != nil {
			return noticeContextIdentity{}, nil, nil, false, false, err
		}
		finals = append(finals, build)
		inspections = append(inspections, inspection)
	}
	finalArchiveEqual, err := equalRegularFiles(
		finals[0].Archive, finals[1].Archive, authority.contract.Limits.FinalArchiveBytes,
	)
	if err != nil {
		return noticeContextIdentity{}, nil, nil, false, false, err
	}
	return contextIdentity, finals, inspections, finalArchiveEqual, contextStable, nil
}

func handleReproductionMismatch(
	authority checkedAuthority,
	repository publicationRootIdentity,
	receiptPath string,
	receipt ReproductionReceipt,
	comparator ReproductionComparator,
) error {
	if err := ensureReproductionInputsUnchanged(authority, comparator); err != nil {
		return err
	}
	if err := writeReproductionReceiptCheckedAtRoot(
		repository, receiptPath, receipt, authority.contract.Limits.ReceiptBytes, nil, nil,
	); err != nil {
		return err
	}
	return errors.New("PDF-tools final-image reproduction mismatch; inspect the retained NO_RESULT receipt")
}

func prepareReproductionPlan(
	authority checkedAuthority,
	options ReproductionOptions,
) (publicationRootIdentity, string, *candidateOutputPlan, error) {
	repository := publicationRootIdentity{path: authority.root, information: authority.rootInformation}
	receiptPath, err := prepareReproductionReceiptPathAtRoot(repository, options.ReceiptPath, nil)
	if err != nil {
		return publicationRootIdentity{}, "", nil, err
	}
	candidatePlan, err := prepareCandidateOutputPlan(authority, options.Candidate, options.ReceiptPath)
	if err != nil {
		return publicationRootIdentity{}, "", nil, err
	}
	return repository, receiptPath, candidatePlan, nil
}

// ReproduceFinalImage builds and compares two complete local PDF-tools images.
// When one bundle path and three convenience paths are supplied, it also
// retains one exact final archive, the byte-identical canonical apko SPDX
// output, and a checksum-closed source bundle inside one authoritative local
// bundle. It never pushes or grants scientific or release authority.
func ReproduceFinalImage(
	ctx context.Context,
	options ReproductionOptions,
) (_ ReproductionReceipt, returnError error) {
	authority, err := checkAuthority(options.RepositoryRoot)
	if err != nil {
		return ReproductionReceipt{}, err
	}
	repository, receiptPath, candidatePlan, err := prepareReproductionPlan(authority, options)
	if err != nil {
		return ReproductionReceipt{}, err
	}
	totalDuration := 6*time.Duration(authority.contract.Limits.BuildSeconds)*time.Second +
		6*time.Duration(authority.contract.Limits.RuntimeSeconds)*time.Second + 5*time.Minute
	reproductionContext, cancel := context.WithTimeout(ctx, totalDuration)
	defer cancel()
	temporaryRoot, err := os.MkdirTemp("", "20w-pdf-tools-reproduction-")
	if err != nil {
		return ReproductionReceipt{}, fmt.Errorf("create PDF-tools reproduction staging root: %w", err)
	}
	defer func() {
		if removeError := os.RemoveAll(temporaryRoot); removeError != nil {
			returnError = errors.Join(returnError, fmt.Errorf("remove PDF-tools reproduction staging root: %w", removeError))
		}
	}()
	executor := localDockerExecutor{}
	comparator, apkoBuilder, err := verifyReproductionPreconditions(reproductionContext, executor, authority)
	if err != nil {
		return ReproductionReceipt{}, err
	}
	bases, baseArchiveEqual, err := runReproductionBaseBuilds(reproductionContext, executor, authority, temporaryRoot)
	if err != nil {
		return ReproductionReceipt{}, err
	}
	contextIdentity, finals, inspections, finalArchiveEqual, contextStable, err := runReproductionFinalBuilds(
		reproductionContext, executor, authority, temporaryRoot, bases,
	)
	if err != nil {
		return ReproductionReceipt{}, err
	}
	comparison := compareReproduction(
		bases, finals, inspections, baseArchiveEqual, finalArchiveEqual, contextStable,
	)
	receipt := newReproductionReceipt(authority, apkoBuilder, comparator, contextIdentity, bases, finals, inspections[0], comparison, nil)
	if !comparison.ConstructionMatch {
		return receipt, handleReproductionMismatch(authority, repository, receiptPath, receipt, comparator)
	}
	runtimeObservation, err := inspectFinalRuntime(reproductionContext, executor, authority, finals[0])
	if err != nil {
		return ReproductionReceipt{}, err
	}
	comparison.Runtime = true
	comparison.AllMatch = comparison.ConstructionMatch && comparison.Runtime
	return finishSuccessfulReproduction(
		reproductionContext, authority, receiptPath, candidatePlan, apkoBuilder, comparator,
		contextIdentity, bases, finals, inspections[0], comparison, runtimeObservation,
	)
}

func writeUnplannedReproductionReceipt(
	authority checkedAuthority,
	receiptPath string,
	apkoBuilder apkoBuilderIdentity,
	comparator ReproductionComparator,
	contextIdentity noticeContextIdentity,
	bases []baseBuild,
	finals []finalBuild,
	inspection layerInspection,
	comparison ReproductionComparison,
	runtimeObservation RuntimeObservation,
) (ReproductionReceipt, error) {
	receipt := newReproductionReceipt(
		authority, apkoBuilder, comparator, contextIdentity, bases, finals, inspection, comparison, nil,
	)
	receipt.Runtime = &runtimeObservation
	if err := writeReproductionReceiptCheckedAtRoot(
		publicationRootIdentity{path: authority.root, information: authority.rootInformation},
		receiptPath, receipt, authority.contract.Limits.ReceiptBytes, nil, nil,
	); err != nil {
		return ReproductionReceipt{}, err
	}
	return receipt, nil
}

func publishCandidatePublicationBundle(
	authority checkedAuthority,
	publicationBundle *stagedCandidateArtifact,
	comparator ReproductionComparator,
) (CandidateBundleVerification, error) {
	bundle := &stagedCandidate{artifacts: []*stagedCandidateArtifact{publicationBundle}}
	if err := bundle.install(authority.root); err != nil {
		return CandidateBundleVerification{}, err
	}
	verification, err := verifyPublishedCandidatePublicationBundle(authority, publicationBundle)
	if err != nil {
		return CandidateBundleVerification{}, err
	}
	if err := ensureReproductionInputsUnchanged(authority, comparator); err != nil {
		return CandidateBundleVerification{}, err
	}
	return verification, nil
}

func finishCandidateReproduction(
	ctx context.Context,
	authority checkedAuthority,
	plan *candidateOutputPlan,
	apkoBuilder apkoBuilderIdentity,
	comparator ReproductionComparator,
	contextIdentity noticeContextIdentity,
	bases []baseBuild,
	finals []finalBuild,
	inspection layerInspection,
	comparison ReproductionComparison,
	runtimeObservation RuntimeObservation,
) (_ ReproductionReceipt, returnError error) {
	downloader, err := newCandidateDownloader(time.Duration(authority.contract.Limits.BuildSeconds) * time.Second)
	if err != nil {
		return ReproductionReceipt{}, err
	}
	defer downloader.close()
	staged, err := stageCandidateOutputs(ctx, authority, plan, bases, finals, downloader.fetch)
	if err != nil {
		return ReproductionReceipt{}, err
	}
	defer func() { returnError = errors.Join(returnError, staged.cleanup()) }()
	if err := ensureReproductionInputsUnchanged(authority, comparator); err != nil {
		return ReproductionReceipt{}, err
	}
	receipt := newReproductionReceipt(
		authority, apkoBuilder, comparator, contextIdentity, bases, finals, inspection, comparison, staged.receipt(authority),
	)
	receipt.Runtime = &runtimeObservation
	publicationBundle, err := stageCandidatePublicationBundle(authority, plan, staged, receipt)
	if err != nil {
		return ReproductionReceipt{}, err
	}
	defer func() { returnError = errors.Join(returnError, publicationBundle.cleanup()) }()
	// These three named files preserve the pre-bundle operator workflow, but
	// they are convenience copies only. The independently hash-bound bundle is
	// the sole complete candidate publication unit.
	if err := staged.install(authority.root); err != nil {
		return ReproductionReceipt{}, err
	}
	if err := ensureReproductionInputsUnchanged(authority, comparator); err != nil {
		return ReproductionReceipt{}, err
	}
	verification, err := publishCandidatePublicationBundle(authority, publicationBundle, comparator)
	if err != nil {
		return ReproductionReceipt{}, err
	}
	receipt.Candidate.PublicationBundle = &ReproductionArtifact{
		Path: plan.publicationBundle.relative, SHA256: verification.SHA256, Bytes: verification.Bytes,
	}
	return receipt, nil
}

func finishSuccessfulReproduction(
	ctx context.Context,
	authority checkedAuthority,
	receiptPath string,
	plan *candidateOutputPlan,
	apkoBuilder apkoBuilderIdentity,
	comparator ReproductionComparator,
	contextIdentity noticeContextIdentity,
	bases []baseBuild,
	finals []finalBuild,
	inspection layerInspection,
	comparison ReproductionComparison,
	runtimeObservation RuntimeObservation,
) (ReproductionReceipt, error) {
	if err := ensureReproductionInputsUnchanged(authority, comparator); err != nil {
		return ReproductionReceipt{}, err
	}
	if plan == nil {
		return writeUnplannedReproductionReceipt(
			authority, receiptPath, apkoBuilder, comparator, contextIdentity, bases, finals, inspection, comparison, runtimeObservation,
		)
	}
	return finishCandidateReproduction(
		ctx, authority, plan, apkoBuilder, comparator, contextIdentity, bases, finals, inspection, comparison, runtimeObservation,
	)
}

func ensureReproductionInputsUnchanged(authority checkedAuthority, comparator ReproductionComparator) error {
	if err := ensureAuthorityUnchanged(authority); err != nil {
		return err
	}
	current, err := currentComparatorIdentity(authority.root)
	if err != nil || current != comparator {
		return errors.New("PDF-tools comparator identity changed during local reproduction")
	}
	return nil
}

func compareReproduction(
	bases []baseBuild,
	finals []finalBuild,
	inspections []layerInspection,
	baseArchiveEqual, finalArchiveEqual, contextStable bool,
) ReproductionComparison {
	comparison := ReproductionComparison{
		BaseArchiveBytes:     baseArchiveEqual,
		BaseManifest:         bases[0].Image.ManifestDigest == bases[1].Image.ManifestDigest,
		BaseConfig:           bases[0].Image.ConfigDigest == bases[1].Image.ConfigDigest,
		BaseLayers:           slices.Equal(bases[0].Image.LayerDigests, bases[1].Image.LayerDigests),
		BaseDiffIDs:          slices.Equal(bases[0].Image.LayerDiffIDs, bases[1].Image.LayerDiffIDs),
		SPDXCanonicalBytes:   bytes.Equal(bases[0].SPDX.canonical, bases[1].SPDX.canonical),
		SPDXIndexCanonical:   bytes.Equal(bases[0].SPDXIndex.canonical, bases[1].SPDXIndex.canonical),
		NoticeContextStable:  contextStable,
		FinalArchiveBytes:    finalArchiveEqual,
		FinalManifest:        finals[0].Image.Identity.ManifestDigest == finals[1].Image.Identity.ManifestDigest,
		FinalConfig:          finals[0].Image.Identity.ConfigDigest == finals[1].Image.Identity.ConfigDigest,
		FinalLayers:          slices.Equal(finals[0].Image.Identity.LayerDigests, finals[1].Image.Identity.LayerDigests),
		FinalDiffIDs:         slices.Equal(finals[0].Image.Identity.LayerDiffIDs, finals[1].Image.Identity.LayerDiffIDs),
		NoticeFiles:          slices.Equal(inspections[0].Notices, inspections[1].Notices),
		ManPages:             slices.Equal(inspections[0].ManPages, inspections[1].ManPages),
		ForbiddenPathsAbsent: len(inspections[0].ForbiddenPaths) == 0 && len(inspections[1].ForbiddenPaths) == 0,
	}
	comparison.ConstructionMatch = comparison.BaseArchiveBytes && comparison.BaseManifest && comparison.BaseConfig &&
		comparison.BaseLayers && comparison.BaseDiffIDs && comparison.SPDXCanonicalBytes &&
		comparison.SPDXIndexCanonical && comparison.NoticeContextStable && comparison.FinalArchiveBytes &&
		comparison.FinalManifest && comparison.FinalConfig && comparison.FinalLayers && comparison.FinalDiffIDs &&
		comparison.NoticeFiles && comparison.ManPages && comparison.ForbiddenPathsAbsent
	return comparison
}
