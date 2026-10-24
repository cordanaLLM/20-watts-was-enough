package pdfrender

import (
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sync"
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

// proofRequest carries the caller's proof selection through the staged steps.
type proofRequest struct {
	sourceRef, sourceRevision, receiptPath, cacheDirectory string
	renderPairOnly                                         bool
}

func validateProofSelection(sourceRef, sourceRevision string, renderPairOnly bool, cacheDirectory string) error {
	if renderPairOnly && sourceRef != "main" {
		return errors.New("render-pair proof is restricted to main; releases require independent image builds")
	}
	if cacheDirectory != "" && (cacheDirectory != RendererCacheDirectory || sourceRef != "main") {
		return errors.New("PDF renderer cache requires --ref main and build/cache/pdf-renderer")
	}
	return ValidateSourceRevision(sourceRef, sourceRevision)
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
	if err := validateProofSelection(sourceRef, sourceRevision, renderPairOnly, cacheDirectory); err != nil {
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
	request := proofRequest{
		sourceRef: sourceRef, sourceRevision: sourceRevision, receiptPath: receiptPath,
		cacheDirectory: cacheDirectory, renderPairOnly: renderPairOnly,
	}
	return proveInStagingRoot(ctx, acceptanceContext, configuration, executor, preparer, request, temporaryRoot)
}

func prepareProofContext(
	ctx context.Context,
	configuration Configuration,
	executor commandExecutor,
	preparer buildContextPreparer,
	temporaryRoot string,
) (string, ReproducibilityContext, error) {
	contextRoot := filepath.Join(temporaryRoot, "context")
	if err := os.Mkdir(contextRoot, 0o755); err != nil { //#nosec G301 -- container build context directory must be readable by container builder
		return "", ReproducibilityContext{}, fmt.Errorf("create PDF reproducibility build context: %w", err)
	}
	if err := verifyBuildxIdentity(ctx, configuration, executor); err != nil {
		return "", ReproducibilityContext{}, err
	}
	if err := preparer.prepare(ctx, configuration, contextRoot); err != nil {
		return "", ReproducibilityContext{}, fmt.Errorf("prepare PDF reproducibility build context: %w", err)
	}
	contextIdentity, err := inspectNormalizedBuildContext(ctx, contextRoot, configuration.Lock.SourceDateEpoch)
	return contextRoot, contextIdentity, err
}

func proveInStagingRoot(
	ctx, acceptanceContext context.Context,
	configuration Configuration,
	executor commandExecutor,
	preparer buildContextPreparer,
	request proofRequest,
	temporaryRoot string,
) (_ ReproducibilityReceipt, returnError error) {
	contextRoot, contextIdentity, err := prepareProofContext(acceptanceContext, configuration, executor, preparer, temporaryRoot)
	if err != nil {
		return ReproducibilityReceipt{}, err
	}
	cache, err := prepareRendererBuildCache(acceptanceContext, configuration, contextIdentity, request.cacheDirectory, request.renderPairOnly)
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
	builds, err := collectProofBuilds(acceptanceContext, configuration, executor, contextRoot, temporaryRoot, request.sourceRef, request.sourceRevision, request.renderPairOnly, ownedImageTags, cache)
	if err != nil {
		return ReproducibilityReceipt{}, err
	}
	receipt, err := recordProofReceipt(ctx, acceptanceContext, configuration, request, contextIdentity, builds, cache)
	if err != nil {
		return receipt, err
	}
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

func newProofReceipt(
	configuration Configuration,
	request proofRequest,
	contextIdentity ReproducibilityContext,
	builds []ReproducibilityBuild,
) ReproducibilityReceipt {
	comparison := compareReproducibilityBuilds(builds[0], builds[1])
	receipt := newReproducibilityReceipt(
		configuration, request.sourceRef, request.sourceRevision, contextIdentity, builds, comparison,
	)
	if request.renderPairOnly {
		// Schema 4 continues to mean two independent image builds. A pair-only
		// receipt records the single actual build and both render observations.
		receipt.Schema = 5
		receipt.Scope = "pdf-render-pair-reproducibility"
		receipt.Renderer.FreshBuilderCount = 1
		receipt.Builds = builds[:1]
		receipt.Renders = []ReproducibilityPair{builds[0].Pair, builds[1].Pair}
	}
	return receipt
}

// recordProofReceipt writes the receipt and keeps mismatch evidence only once
// that receipt names it.
func recordProofReceipt(
	ctx, acceptanceContext context.Context,
	configuration Configuration,
	request proofRequest,
	contextIdentity ReproducibilityContext,
	builds []ReproducibilityBuild,
	cache *rendererBuildCache,
) (_ ReproducibilityReceipt, returnError error) {
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
	receipt := newProofReceipt(configuration, request, contextIdentity, builds)
	cache.describe(&receipt)
	if receipt.Status != "pass" {
		evidence, err := retainReproducibilityMismatch(
			configuration.RepositoryRoot, request.receiptPath, builds, os.RemoveAll,
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
	if err := writeReproducibilityReceipt(request.receiptPath, receipt); err != nil {
		return ReproducibilityReceipt{}, err
	}
	mismatchEvidenceCommitted = true
	return receipt, nil
}

func collectProofBuilds(
	ctx context.Context,
	configuration Configuration,
	executor commandExecutor,
	contextRoot, temporaryRoot, sourceRef, sourceRevision string,
	renderPairOnly bool,
	ownedImageTags map[string]struct{},
	cache *rendererBuildCache,
) ([]ReproducibilityBuild, error) {
	runIdentity, err := randomIdentity(8)
	if err != nil {
		return nil, err
	}
	if renderPairOnly {
		return collectRenderPairBuilds(
			ctx, configuration, executor, contextRoot, temporaryRoot,
			sourceRef, sourceRevision, runIdentity, ownedImageTags, cache,
		)
	}
	return collectImageBuildsConcurrently(
		ctx, configuration, executor, contextRoot, temporaryRoot,
		sourceRef, sourceRevision, runIdentity, ownedImageTags, cache,
	)
}

func collectRenderPairBuilds(
	ctx context.Context,
	configuration Configuration,
	executor commandExecutor,
	contextRoot, temporaryRoot, sourceRef, sourceRevision, runIdentity string,
	ownedImageTags map[string]struct{},
	cache *rendererBuildCache,
) ([]ReproducibilityBuild, error) {
	imageTag := fmt.Sprintf("20w-pdf-reproducibility:%s-1", runIdentity)
	ownedImageTags[imageTag] = struct{}{}
	firstBuild, err := reproducibilityBuild(
		ctx, configuration, executor, contextRoot, temporaryRoot,
		sourceRef, sourceRevision, imageTag, 0, cache,
	)
	if err != nil {
		return nil, err
	}
	secondBuild, err := reproducibilityRender(
		ctx, configuration, executor, temporaryRoot,
		sourceRef, sourceRevision, firstBuild, 1,
	)
	if err != nil {
		return nil, err
	}
	return []ReproducibilityBuild{firstBuild, secondBuild}, nil
}

func collectImageBuildsConcurrently(
	ctx context.Context,
	configuration Configuration,
	executor commandExecutor,
	contextRoot, temporaryRoot, sourceRef, sourceRevision, runIdentity string,
	ownedImageTags map[string]struct{},
	cache *rendererBuildCache,
) ([]ReproducibilityBuild, error) {
	imageTags := [reproducibilityBuildCount]string{
		fmt.Sprintf("20w-pdf-reproducibility:%s-1", runIdentity),
		fmt.Sprintf("20w-pdf-reproducibility:%s-2", runIdentity),
	}
	for _, tag := range imageTags {
		ownedImageTags[tag] = struct{}{}
	}

	runCtx, cancel := context.WithCancel(ctx)
	defer cancel()

	builds := make([]ReproducibilityBuild, reproducibilityBuildCount)
	var chainErrors [reproducibilityBuildCount]error
	var wg sync.WaitGroup

	for index := 0; index < reproducibilityBuildCount; index++ {
		wg.Add(1)
		go func(idx int) {
			defer wg.Done()
			build, err := reproducibilityBuild(
				runCtx, configuration, executor, contextRoot, temporaryRoot,
				sourceRef, sourceRevision, imageTags[idx], idx, cache,
			)
			if err != nil {
				chainErrors[idx] = err
				cancel()
				return
			}
			builds[idx] = build
		}(index)
	}
	wg.Wait()

	if err := errors.Join(chainErrors[:]...); err != nil {
		return nil, err
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
	result, err = buildReproducibilityImage(ctx, configuration, executor, builderName, contextRoot, temporaryRoot, imageTag, index, cache)
	if err != nil {
		return result, err
	}
	if err := removeBuilder(executor, builderName, configuration.Lock.Limits.OutputBytes); err != nil {
		return result, err
	}
	builderActive = false
	if err := cache.verifyImage(result); err != nil {
		return result, err
	}
	return reproducibilityRender(ctx, configuration, executor, temporaryRoot, sourceRef, sourceRevision, result, index)
}

// buildReproducibilityImage builds one no-cache image on a fresh builder and
// verifies the loaded image against the build's own metadata.
func buildReproducibilityImage(
	ctx context.Context,
	configuration Configuration,
	executor commandExecutor,
	builderName, contextRoot, temporaryRoot, imageTag string,
	index int,
	cache *rendererBuildCache,
) (result ReproducibilityBuild, _ error) {
	label := fmt.Sprintf("build-%d", index+1)
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
	result.ManifestDigest = metadata.ManifestDigest
	result.ConfigDigest = digestBytes(proof.Config)
	result.ConfigProof = proof
	return result, nil
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
		if err := os.MkdirAll(directory, 0o755); err != nil { //#nosec G301 -- container bind mount directory must be accessible by container user
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
