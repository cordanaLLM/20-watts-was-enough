package pdfrender

import (
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"time"
)

const reproducibilityBuildCount = 2

// ReproducibilityOptions selects one non-publishing renderer acceptance run.
type ReproducibilityOptions struct {
	RepositoryRoot string
	SourceRef      string
	SourceRevision string
	ReceiptPath    string
	RenderPairOnly bool
	CacheDirectory string
	// Diagnostics receives bounded retry warnings, not raw subprocess output.
	// Delivery errors do not change the proof receipt or prevent its retention.
	Diagnostics io.Writer
}

// VerifyReproducibility records a non-publishing comparison. By default it
// uses two fresh, cache-free builders; RenderPairOnly builds once and compares
// two isolated renders without claiming independent image-build agreement.
func VerifyReproducibility(ctx context.Context, options ReproducibilityOptions) (_ ReproducibilityReceipt, returnError error) {
	if options.RenderPairOnly && options.SourceRef != "main" {
		return ReproducibilityReceipt{}, errors.New("render-pair proof is restricted to main; releases require independent image builds")
	}
	if options.CacheDirectory != "" && (options.CacheDirectory != RendererCacheDirectory || options.SourceRef != "main") {
		return ReproducibilityReceipt{}, errors.New("PDF renderer cache requires --ref main and build/cache/pdf-renderer")
	}
	configuration, err := Check(options.RepositoryRoot)
	if err != nil {
		return ReproducibilityReceipt{}, err
	}
	if err := verifySourceRevision(
		ctx,
		configuration.RepositoryRoot,
		options.SourceRef,
		options.SourceRevision,
	); err != nil {
		return ReproducibilityReceipt{}, err
	}
	return verifyCachedProofWithDependencies(
		ctx,
		configuration,
		options.SourceRef,
		options.SourceRevision,
		options.ReceiptPath,
		remoteBuildContextPreparer{},
		&rendererDiagnosticExecutor{commandExecutor: localReproducibilityExecutor{}, writer: options.Diagnostics},
		options.RenderPairOnly,
		options.CacheDirectory,
	)
}

func verifyReproducibilityWithDependencies(
	ctx context.Context,
	configuration Configuration,
	sourceRef, sourceRevision, receiptRelativePath string,
	preparer buildContextPreparer,
	executor commandExecutor,
) (_ ReproducibilityReceipt, returnError error) {
	return verifyProofWithDependencies(ctx, configuration, sourceRef, sourceRevision, receiptRelativePath, preparer, executor, false)
}

func verifyProofWithDependencies(
	ctx context.Context,
	configuration Configuration,
	sourceRef, sourceRevision, receiptRelativePath string,
	preparer buildContextPreparer,
	executor commandExecutor,
	renderPairOnly bool,
) (_ ReproducibilityReceipt, returnError error) {
	return verifyCachedProofWithDependencies(ctx, configuration, sourceRef, sourceRevision, receiptRelativePath, preparer, executor, renderPairOnly, "")
}

func verifyCachedProofWithDependencies(
	ctx context.Context,
	configuration Configuration,
	sourceRef, sourceRevision, receiptRelativePath string,
	preparer buildContextPreparer,
	executor commandExecutor,
	renderPairOnly bool,
	cacheDirectory string,
) (_ ReproducibilityReceipt, returnError error) {
	defer func() { returnError = joinRendererDiagnostics(executor, returnError) }()
	if renderPairOnly && sourceRef != "main" {
		return ReproducibilityReceipt{}, errors.New("render-pair proof is restricted to main; releases require independent image builds")
	}
	if cacheDirectory != "" && (cacheDirectory != RendererCacheDirectory || sourceRef != "main") {
		return ReproducibilityReceipt{}, errors.New("PDF renderer cache requires --ref main and build/cache/pdf-renderer")
	}
	if err := ValidateSourceRevision(sourceRef, sourceRevision); err != nil {
		return ReproducibilityReceipt{}, err
	}
	configuration, err := bindInstalledDependencies(ctx, configuration)
	if err != nil {
		return ReproducibilityReceipt{}, err
	}
	receiptPath, err := prepareReproducibilityReceiptPath(configuration.RepositoryRoot, receiptRelativePath)
	if err != nil {
		return ReproducibilityReceipt{}, err
	}
	retainedMismatchRoot := ""
	mismatchEvidenceCommitted := false
	defer func() {
		if retainedMismatchRoot == "" || mismatchEvidenceCommitted {
			return
		}
		if removeError := os.RemoveAll(retainedMismatchRoot); removeError != nil {
			returnError = errors.Join(
				returnError,
				fmt.Errorf("remove uncommitted PDF reproducibility mismatch evidence: %w", removeError),
			)
		}
	}()
	if err := prepareWritableRenderPaths(configuration.RepositoryRoot); err != nil {
		return ReproducibilityReceipt{}, err
	}
	publication, err := acquirePublicationLock(configuration.RepositoryRoot)
	if err != nil {
		return ReproducibilityReceipt{}, err
	}
	defer func() {
		if releaseError := publication.release(); releaseError != nil {
			returnError = errors.Join(returnError, releaseError)
		}
	}()

	totalDuration := 2*time.Duration(configuration.Lock.Limits.BuildSeconds)*time.Second +
		2*time.Duration(configuration.Lock.Limits.RenderSeconds)*time.Second + 5*time.Minute
	acceptanceContext, cancel := context.WithTimeout(ctx, totalDuration)
	defer cancel()
	temporaryRoot, err := os.MkdirTemp("", "20w-pdf-reproducibility-")
	if err != nil {
		return ReproducibilityReceipt{}, fmt.Errorf("create PDF reproducibility staging root: %w", err)
	}
	defer func() {
		if removeError := os.RemoveAll(temporaryRoot); removeError != nil {
			returnError = errors.Join(returnError, fmt.Errorf("remove PDF reproducibility staging root: %w", removeError))
		}
	}()

	contextRoot := filepath.Join(temporaryRoot, "context")
	if err := os.Mkdir(contextRoot, 0o755); err != nil {
		return ReproducibilityReceipt{}, fmt.Errorf("create PDF reproducibility build context: %w", err)
	}
	if err := verifyBuildxIdentity(acceptanceContext, configuration, executor); err != nil {
		return ReproducibilityReceipt{}, err
	}
	if err := preparer.prepare(acceptanceContext, configuration, contextRoot); err != nil {
		return ReproducibilityReceipt{}, fmt.Errorf("prepare PDF reproducibility build context: %w", err)
	}
	contextIdentity, err := inspectNormalizedBuildContext(
		acceptanceContext, contextRoot, configuration.Lock.SourceDateEpoch,
	)
	if err != nil {
		return ReproducibilityReceipt{}, err
	}
	cache, err := prepareRendererBuildCache(acceptanceContext, configuration, contextIdentity, cacheDirectory, renderPairOnly)
	if err != nil {
		return ReproducibilityReceipt{}, err
	}
	defer func() { returnError = errors.Join(returnError, cache.close()) }()

	ownedImageTags := make(map[string]struct{}, reproducibilityBuildCount)
	cleanedImages := false
	defer func() {
		if !cleanedImages {
			returnError = errors.Join(
				returnError,
				removeOwnedImages(configuration, executor, ownedImageTags),
			)
		}
	}()
	builds, err := collectProofBuilds(acceptanceContext, configuration, executor, contextRoot, temporaryRoot, sourceRef, sourceRevision, renderPairOnly, ownedImageTags, cache)
	if err != nil {
		return ReproducibilityReceipt{}, err
	}
	comparison := compareReproducibilityBuilds(builds[0], builds[1])
	receipt := newReproducibilityReceipt(
		configuration, sourceRef, sourceRevision, contextIdentity, builds, comparison,
	)
	if renderPairOnly {
		// Schema 4 continues to mean two independent image builds. A pair-only
		// receipt records the single actual build and both render observations.
		receipt.Schema = 5
		receipt.Scope = "pdf-render-pair-reproducibility"
		receipt.Renderer.FreshBuilderCount = 1
		receipt.Builds = builds[:1]
		receipt.Renders = []ReproducibilityPair{builds[0].Pair, builds[1].Pair}
	}
	cache.describe(&receipt)
	if receipt.Status != "pass" {
		evidence, err := retainReproducibilityMismatch(
			configuration.RepositoryRoot, receiptPath, builds, os.RemoveAll,
		)
		if err != nil {
			return receipt, err
		}
		receipt.MismatchEvidence = evidence
		retainedMismatchRoot = filepath.Join(
			configuration.RepositoryRoot, filepath.FromSlash(evidence.Root),
		)
	}
	if err := checkAuthorityUnchanged(ctx, configuration); err != nil {
		return ReproducibilityReceipt{}, err
	}
	if receipt.Status == "pass" {
		if err := cache.observe(acceptanceContext, &receipt); err != nil {
			return ReproducibilityReceipt{}, err
		}
	}
	if err := writeReproducibilityReceipt(receiptPath, receipt); err != nil {
		return ReproducibilityReceipt{}, err
	}
	mismatchEvidenceCommitted = true
	var comparisonError error
	if receipt.Status != "pass" {
		comparisonError = fmt.Errorf(
			"PDF renderer reproducibility comparison failed; inspect the retained receipt and %s",
			receipt.MismatchEvidence.Root,
		)
	}
	cleanupError := removeOwnedImages(configuration, executor, ownedImageTags)
	if cleanupError == nil {
		cleanedImages = true
	}
	if comparisonError == nil && cleanupError == nil {
		if err := acceptanceContext.Err(); err != nil {
			return receipt, fmt.Errorf("complete PDF renderer reproducibility proof: %w", err)
		}
		return receipt, cache.promote(acceptanceContext)
	}
	return receipt, errors.Join(comparisonError, cleanupError)
}

func collectProofBuilds(ctx context.Context, configuration Configuration, executor commandExecutor, contextRoot, temporaryRoot, sourceRef, sourceRevision string, renderPairOnly bool, ownedImageTags map[string]struct{}, cache *rendererBuildCache) ([]ReproducibilityBuild, error) {
	runIdentity, err := randomIdentity(8)
	if err != nil {
		return nil, err
	}
	builds := make([]ReproducibilityBuild, 0, reproducibilityBuildCount)
	for index := 0; index < reproducibilityBuildCount; index++ {
		var build ReproducibilityBuild
		if renderPairOnly && index == 1 {
			build, err = reproducibilityRender(ctx, configuration, executor, temporaryRoot, sourceRef, sourceRevision, builds[0], index)
		} else {
			imageTag := fmt.Sprintf("20w-pdf-reproducibility:%s-%d", runIdentity, index+1)
			ownedImageTags[imageTag] = struct{}{}
			build, err = reproducibilityBuild(ctx, configuration, executor, contextRoot, temporaryRoot, sourceRef, sourceRevision, imageTag, index, cache)
		}
		if err != nil {
			return nil, err
		}
		builds = append(builds, build)
	}
	return builds, nil
}

func reproducibilityBuild(
	ctx context.Context,
	configuration Configuration,
	executor commandExecutor,
	contextRoot, temporaryRoot, sourceRef, sourceRevision, imageTag string,
	index int,
	cache *rendererBuildCache,
) (result ReproducibilityBuild, returnError error) {
	label := fmt.Sprintf("build-%d", index+1)
	builderName, err := createLockedBuilder(ctx, configuration, executor)
	if err != nil {
		return result, err
	}
	builderActive := true
	defer func() {
		if builderActive {
			returnError = errors.Join(returnError, removeBuilder(executor, builderName, configuration.Lock.Limits.OutputBytes))
		}
	}()
	iidPath := filepath.Join(temporaryRoot, label+".iid")
	metadataPath := filepath.Join(temporaryRoot, label+".metadata.json")
	output, err := executor.run(ctx, commandRequest{
		operation:  "build reproducibility PDF renderer image " + label,
		directory:  configuration.RepositoryRoot,
		timeout:    time.Duration(configuration.Lock.Limits.BuildSeconds) * time.Second,
		outputSize: configuration.Lock.Limits.OutputBytes,
		arguments: cache.buildArguments(reproducibilityBuildArguments(
			configuration, builderName, contextRoot, iidPath, metadataPath, imageTag,
		), index),
	})
	if err != nil {
		return result, err
	}
	if err := rejectTimestampRewriteWarnings(output); err != nil {
		return result, err
	}
	imageID, err := readImageID(iidPath)
	if err != nil {
		return result, err
	}
	result.ImageID = imageID
	result.Sequence = index + 1
	metadata, err := readReproducibilityBuildMetadata(temporaryRoot, metadataPath)
	if err != nil {
		return result, err
	}
	proof, err := inspectLoadedImageProof(ctx, configuration, executor, imageTag, imageID, metadata.ManifestDigest)
	if err != nil {
		return result, err
	}
	if err := removeBuilder(executor, builderName, configuration.Lock.Limits.OutputBytes); err != nil {
		return result, err
	}
	builderActive = false
	result.ManifestDigest = metadata.ManifestDigest
	result.ConfigDigest = digestBytes(proof.Config)
	result.ConfigProof = proof
	if err := cache.verifyImage(result); err != nil {
		return result, err
	}
	return reproducibilityRender(ctx, configuration, executor, temporaryRoot, sourceRef, sourceRevision, result, index)
}

func reproducibilityRender(
	ctx context.Context,
	configuration Configuration,
	executor commandExecutor,
	temporaryRoot, sourceRef, sourceRevision string,
	result ReproducibilityBuild,
	index int,
) (ReproducibilityBuild, error) {
	result.Sequence = index + 1
	if err := checkAuthorityUnchanged(ctx, configuration); err != nil {
		return result, err
	}

	label := fmt.Sprintf("render-%d", index+1)
	outputDirectory := filepath.Join(temporaryRoot, label, "downloads")
	workspaceDirectory := filepath.Join(temporaryRoot, label, "workspace-tmp")
	for _, directory := range []string{outputDirectory, workspaceDirectory} {
		if err := os.MkdirAll(directory, 0o755); err != nil {
			return result, fmt.Errorf("create isolated PDF reproducibility directory: %w", err)
		}
	}
	if err := runRendererOnce(ctx, configuration, executor, result.ImageID, sourceRef, sourceRevision, outputDirectory, workspaceDirectory, index+1); err != nil {
		return result, err
	}
	pair, err := inspectReproducibilityPair(outputDirectory)
	if err != nil {
		return result, err
	}
	result.Pair = pair
	return result, checkAuthorityUnchanged(ctx, configuration)
}

func reproducibilityBuildArguments(
	configuration Configuration,
	builderName, contextRoot, iidPath, metadataPath, imageTag string,
) []string {
	base := buildArguments(configuration, builderName, contextRoot, iidPath)
	arguments := make([]string, 0, len(base)+5)
	arguments = append(arguments, base[:len(base)-1]...)
	arguments = append(
		arguments,
		"--no-cache",
		"--metadata-file", metadataPath,
		"--progress", "plain",
		"--tag", imageTag,
	)
	return append(arguments, base[len(base)-1])
}
