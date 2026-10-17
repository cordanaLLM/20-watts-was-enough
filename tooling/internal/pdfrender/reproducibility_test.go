package pdfrender

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"
)

const (
	testSecondImageID  = "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"
	testSecondManifest = "sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
)

func TestVerifyReproducibilityRejectsAWellFormedRevisionOtherThanRepositoryHEAD(t *testing.T) {
	t.Parallel()
	configuration := renderConfiguration(t)
	head := commitRenderTestRepository(t, configuration.RepositoryRoot)
	wrongRevision := strings.Repeat("f", 40)
	if wrongRevision == head {
		wrongRevision = strings.Repeat("e", 40)
	}
	_, err := VerifyReproducibility(context.Background(), ReproducibilityOptions{
		RepositoryRoot: configuration.RepositoryRoot,
		SourceRef:      "v1.2.3",
		SourceRevision: wrongRevision,
		ReceiptPath:    "build/evidence/pdf-reproducibility.json",
	})
	if err == nil || !strings.Contains(err.Error(), "not verified commit") {
		t.Fatalf("VerifyReproducibility() error = %v, want repository HEAD mismatch", err)
	}
}

func TestVerifyReproducibilityUsesTwoFreshNoCacheBuildersAndRetainsAReceipt(t *testing.T) {
	t.Parallel()
	configuration := renderConfiguration(t)
	receiptRelative := ".workingdir2/evidence/publication/pdf-reproducibility.json"
	executor := &reproducibilityExecutor{
		imageIDs:        []string{testManifestDigest, testManifestDigest},
		manifestDigests: []string{testManifestDigest, testManifestDigest},
	}
	sourceRevision := strings.Repeat("a", 40)

	receipt, err := verifyReproducibilityWithDependencies(
		context.Background(), configuration, "v1.2.3", sourceRevision, receiptRelative,
		reproducibilityFixturePreparer{}, executor,
	)
	if err != nil {
		t.Fatalf("verifyReproducibilityWithDependencies() error = %v", err)
	}
	if receipt.Schema != 4 || receipt.Status != "pass" || !receipt.Comparison.AllMatch ||
		receipt.ScientificResult || receipt.MismatchEvidence != nil {
		t.Fatalf("reproducibility receipt = %+v", receipt)
	}
	if receipt.SourceRef != "v1.2.3" || receipt.SourceRevision != sourceRevision {
		t.Fatalf("reproducibility receipt lost release identity: %+v", receipt)
	}
	if receipt.Builds[0].ConfigDigest != testProofConfigDigest || receipt.Builds[0].ConfigDigest == receipt.Builds[0].ManifestDigest ||
		receipt.Builds[0].ConfigProof.Method != "docker-save-original-manifest-config-v1" {
		t.Fatal("containerd receipt did not separate the actual config from manifest execution identity")
	}
	if receipt.Renderer.LockSchema != 3 || !receipt.Renderer.NoCache ||
		receipt.Renderer.FreshBuilderCount != 2 || !strings.HasPrefix(receipt.Context.SHA256, "sha256:") {
		t.Fatalf("reproducibility authority is incomplete: %+v", receipt)
	}
	receiptPath := filepath.Join(configuration.RepositoryRoot, filepath.FromSlash(receiptRelative))
	if _, err := os.Stat(receiptPath); err != nil {
		t.Fatalf("retained receipt: %v", err)
	}
	receiptBytes, err := os.ReadFile(receiptPath)
	if err != nil || !bytes.Contains(receiptBytes, []byte(`"source_revision": "`+sourceRevision+`"`)) {
		t.Fatalf("retained receipt source revision = %q, error = %v", receiptBytes, err)
	}

	creates := requestsWithPrefix(executor.requests, "buildx", "create")
	builds := requestsWithPrefix(executor.requests, "buildx", "build")
	removals := requestsWithPrefix(executor.requests, "buildx", "rm")
	if len(creates) != 2 || len(builds) != 2 || len(removals) != 2 {
		t.Fatalf("builder create/build/remove counts = %d/%d/%d", len(creates), len(builds), len(removals))
	}
	firstBuilder := argumentAfter(t, creates[0].arguments, "--name")
	secondBuilder := argumentAfter(t, creates[1].arguments, "--name")
	if firstBuilder == secondBuilder {
		t.Fatalf("fresh builds reused builder %q", firstBuilder)
	}
	imageTags := make([]string, 0, len(builds))
	for index, build := range builds {
		for _, expected := range []string{"--no-cache", "--metadata-file", "--progress", "plain", "--tag"} {
			if !slices.Contains(build.arguments, expected) {
				t.Fatalf("build %d omits %q: %v", index+1, expected, build.arguments)
			}
		}
		imageTags = append(imageTags, argumentAfter(t, build.arguments, "--tag"))
	}
	if imageTags[0] == imageTags[1] {
		t.Fatalf("fresh builds reused owned image tag %q", imageTags[0])
	}
	imageCleanups := requestsWithPrefix(executor.requests, "image", "rm", "--force")
	if len(imageCleanups) != len(imageTags) {
		t.Fatalf("owned image cleanup count = %d, want %d", len(imageCleanups), len(imageTags))
	}
	cleanedTags := make([]string, 0, len(imageCleanups))
	for _, cleanup := range imageCleanups {
		cleanedTags = append(cleanedTags, cleanup.arguments[len(cleanup.arguments)-1])
	}
	for _, tag := range imageTags {
		if !slices.Contains(cleanedTags, tag) {
			t.Fatalf("owned image cleanup omits %q: %v", tag, imageCleanups)
		}
	}
	for _, request := range executor.requests {
		if request.timeout <= 0 || request.outputSize <= 0 {
			t.Fatalf("unbounded Docker request: %+v", request)
		}
	}
}

func TestVerifyReproducibilityWritesMismatchReceiptAndFails(t *testing.T) {
	t.Parallel()
	configuration := renderConfiguration(t)
	receiptRelative := "build/evidence/pdf-reproducibility.json"
	executor := &reproducibilityExecutor{
		imageIDs:                []string{testProofConfigDigest, testProofConfigDigest},
		manifestDigests:         []string{testManifestDigest, testManifestDigest},
		differentSecondManifest: true,
	}

	receipt, err := verifyReproducibilityWithDependencies(
		context.Background(), configuration, "main", "", receiptRelative,
		reproducibilityFixturePreparer{}, executor,
	)
	if err == nil || !strings.Contains(err.Error(), "comparison failed") {
		t.Fatalf("verifyReproducibilityWithDependencies() error = %v", err)
	}
	if receipt.Status != "mismatch" || receipt.Comparison.ManifestBytes || receipt.Comparison.CompletePair {
		t.Fatalf("mismatch receipt = %+v", receipt)
	}
	if receipt.MismatchEvidence == nil ||
		receipt.MismatchEvidence.Root != "build/evidence/pdf-reproducibility-mismatch" ||
		len(receipt.MismatchEvidence.Builds) != 2 {
		t.Fatalf("mismatch evidence = %+v", receipt.MismatchEvidence)
	}
	body, readError := os.ReadFile(filepath.Join(configuration.RepositoryRoot, filepath.FromSlash(receiptRelative)))
	if readError != nil || !strings.Contains(string(body), `"status": "mismatch"`) ||
		!strings.Contains(string(body), `"mismatch_evidence"`) {
		t.Fatalf("retained mismatch receipt = %q, error = %v", body, readError)
	}
	for index, evidence := range receipt.MismatchEvidence.Builds {
		if evidence.Sequence != index+1 {
			t.Fatalf("mismatch evidence sequence = %+v", evidence)
		}
		pdf, pdfError := os.ReadFile(filepath.Join(
			configuration.RepositoryRoot, filepath.FromSlash(evidence.PDF),
		))
		manifest, manifestError := os.ReadFile(filepath.Join(
			configuration.RepositoryRoot, filepath.FromSlash(evidence.Manifest),
		))
		expectedManifest := "{\"render\":\"stable\"}\n"
		if index == 1 {
			expectedManifest = "{\"render\":\"change\"}\n"
		}
		if pdfError != nil || manifestError != nil || string(pdf) != "%PDF-stable\n" ||
			string(manifest) != expectedManifest {
			t.Fatalf(
				"mismatch evidence build %d = pdf %q (%v), manifest %q (%v)",
				index+1, pdf, pdfError, manifest, manifestError,
			)
		}
	}
	if len(requestsWithPrefix(executor.requests, "image", "rm", "--force")) != 2 {
		t.Fatalf("mismatch did not clean its owned images: %v", executor.requests)
	}
}

func TestVerifyReproducibilityRetainsMismatchBeforeImageCleanupFailure(t *testing.T) {
	t.Parallel()
	configuration := renderConfiguration(t)
	receiptRelative := "build/evidence/pdf-reproducibility.json"
	executor := &reproducibilityExecutor{
		imageIDs:                []string{testProofConfigDigest, testProofConfigDigest},
		manifestDigests:         []string{testManifestDigest, testManifestDigest},
		differentSecondManifest: true,
		failImageCleanup:        true,
	}

	receipt, err := verifyReproducibilityWithDependencies(
		context.Background(), configuration, "main", "", receiptRelative,
		reproducibilityFixturePreparer{}, executor,
	)
	if err == nil || !strings.Contains(err.Error(), "comparison failed") ||
		!strings.Contains(err.Error(), "injected image cleanup failure") {
		t.Fatalf("verifyReproducibilityWithDependencies() error = %v", err)
	}
	if receipt.MismatchEvidence == nil {
		t.Fatalf("mismatch receipt omitted evidence: %+v", receipt)
	}
	for _, file := range []string{
		filepath.Join(configuration.RepositoryRoot, filepath.FromSlash(receiptRelative)),
		filepath.Join(
			configuration.RepositoryRoot,
			filepath.FromSlash(receipt.MismatchEvidence.Builds[0].PDF),
		),
	} {
		if _, statError := os.Stat(file); statError != nil {
			t.Fatalf("retained mismatch file %s: %v", file, statError)
		}
	}
}

func TestRetainReproducibilityMismatchReportsPartialCleanupFailure(t *testing.T) {
	t.Parallel()
	configuration := renderConfiguration(t)
	evidenceParent := filepath.Join(configuration.RepositoryRoot, "build", "evidence")
	if err := os.MkdirAll(evidenceParent, 0o755); err != nil {
		t.Fatal(err)
	}
	receiptPath := filepath.Join(evidenceParent, "pdf-reproducibility.json")
	pair := ReproducibilityPair{artifacts: []renderedArtifact{
		{name: bookPDFName, body: []byte("%PDF-first\n")},
		{name: bookManifestName, body: []byte("{\"build\":1}\n")},
	}}
	builds := []ReproducibilityBuild{
		{Sequence: 1, Pair: pair},
		{Sequence: 3, Pair: pair},
	}
	evidenceRoot := filepath.Join(evidenceParent, "pdf-reproducibility-mismatch")
	t.Cleanup(func() { _ = os.RemoveAll(evidenceRoot) })
	removeCalls := 0

	evidence, err := retainReproducibilityMismatch(
		configuration.RepositoryRoot,
		receiptPath,
		builds,
		func(string) error {
			removeCalls++
			return errors.New("injected partial evidence cleanup failure")
		},
	)
	if evidence != nil || err == nil ||
		!strings.Contains(err.Error(), "does not contain the exact compared pair") ||
		!strings.Contains(err.Error(), "remove partial PDF reproducibility mismatch evidence") ||
		!strings.Contains(err.Error(), "injected partial evidence cleanup failure") {
		t.Fatalf("retainReproducibilityMismatch() = %+v, %v", evidence, err)
	}
	if removeCalls != 1 {
		t.Fatalf("partial mismatch cleanup calls = %d, want 1", removeCalls)
	}
	if _, statError := os.Stat(filepath.Join(evidenceRoot, "build-1", bookPDFName)); statError != nil {
		t.Fatalf("injected cleanup failure did not leave its auditable partial file: %v", statError)
	}
}

func TestVerifyReproducibilityRefusesExistingMismatchEvidence(t *testing.T) {
	t.Parallel()
	configuration := renderConfiguration(t)
	receiptRelative := "build/evidence/pdf-reproducibility.json"
	evidenceRoot := filepath.Join(
		configuration.RepositoryRoot, "build", "evidence", "pdf-reproducibility-mismatch",
	)
	if err := os.MkdirAll(evidenceRoot, 0o755); err != nil {
		t.Fatal(err)
	}
	sentinel := filepath.Join(evidenceRoot, "preserve")
	if err := os.WriteFile(sentinel, []byte("keep\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	executor := &reproducibilityExecutor{
		imageIDs:                []string{testProofConfigDigest, testProofConfigDigest},
		manifestDigests:         []string{testManifestDigest, testManifestDigest},
		differentSecondManifest: true,
	}

	_, err := verifyReproducibilityWithDependencies(
		context.Background(), configuration, "main", "", receiptRelative,
		reproducibilityFixturePreparer{}, executor,
	)
	if err == nil || !strings.Contains(err.Error(), "mismatch evidence already exists") {
		t.Fatalf("verifyReproducibilityWithDependencies() error = %v", err)
	}
	body, readError := os.ReadFile(sentinel)
	if readError != nil || string(body) != "keep\n" {
		t.Fatalf("existing mismatch evidence changed to %q, error = %v", body, readError)
	}
	if _, receiptError := os.Stat(filepath.Join(
		configuration.RepositoryRoot, filepath.FromSlash(receiptRelative),
	)); !errors.Is(receiptError, os.ErrNotExist) {
		t.Fatalf("mismatch receipt unexpectedly exists: %v", receiptError)
	}
}

func TestVerifyReproducibilityRejectsMalformedMetadataAndCleansOwnedResources(t *testing.T) {
	t.Parallel()
	configuration := renderConfiguration(t)
	executor := &reproducibilityExecutor{
		imageIDs:        []string{testProofConfigDigest},
		manifestDigests: []string{"malformed"},
	}

	_, err := verifyReproducibilityWithDependencies(
		context.Background(), configuration, "main", "", "build/evidence/malformed.json",
		reproducibilityFixturePreparer{}, executor,
	)
	if err == nil || !strings.Contains(err.Error(), "containerimage.digest") {
		t.Fatalf("verifyReproducibilityWithDependencies() error = %v", err)
	}
	if len(requestsWithPrefix(executor.requests, "buildx", "rm")) != 1 ||
		len(requestsWithPrefix(executor.requests, "image", "rm", "--force")) != 1 {
		t.Fatalf("malformed metadata cleanup requests = %v", executor.requests)
	}
}

func TestVerifyReproducibilityRefusesAnExistingReceiptBeforeDocker(t *testing.T) {
	t.Parallel()
	configuration := renderConfiguration(t)
	relative := "build/release-inputs/pdf-reproducibility.json"
	file := filepath.Join(configuration.RepositoryRoot, filepath.FromSlash(relative))
	if err := os.MkdirAll(filepath.Dir(file), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(file, []byte("preserve\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	executor := &reproducibilityExecutor{}

	_, err := verifyReproducibilityWithDependencies(
		context.Background(), configuration, "main", "", relative,
		reproducibilityFixturePreparer{}, executor,
	)
	if err == nil || !strings.Contains(err.Error(), "already exists") {
		t.Fatalf("verifyReproducibilityWithDependencies() error = %v", err)
	}
	if len(executor.requests) != 0 {
		t.Fatalf("existing receipt executed Docker requests: %v", executor.requests)
	}
	body, readError := os.ReadFile(file)
	if readError != nil || string(body) != "preserve\n" {
		t.Fatalf("existing receipt changed to %q, error = %v", body, readError)
	}
}

func TestNormalizedBuildContextIdentityIsIndependentOfItsTemporaryRoot(t *testing.T) {
	t.Parallel()
	configuration := renderConfiguration(t)
	identities := make([]ReproducibilityContext, 2)
	for index := range identities {
		root := t.TempDir()
		if err := (reproducibilityFixturePreparer{}).prepare(context.Background(), configuration, root); err != nil {
			t.Fatal(err)
		}
		identity, err := inspectNormalizedBuildContext(
			context.Background(), root, configuration.Lock.SourceDateEpoch,
		)
		if err != nil {
			t.Fatal(err)
		}
		identities[index] = identity
	}
	if identities[0] != identities[1] {
		t.Fatalf("normalized identities differ: %+v != %+v", identities[0], identities[1])
	}
}

func TestInspectLoadedImageIDRequiresTheIIDFileIdentity(t *testing.T) {
	t.Parallel()
	configuration := renderConfiguration(t)
	executor := &reproducibilityExecutor{loadedTags: map[string]string{
		"20w-pdf-reproducibility:test-1": testSecondImageID,
	}}
	_, err := inspectLoadedImageID(
		context.Background(),
		configuration,
		executor,
		"20w-pdf-reproducibility:test-1",
		testProofConfigDigest,
	)
	if err == nil || !strings.Contains(err.Error(), "disagree") {
		t.Fatalf("inspectLoadedImageID() error = %v", err)
	}
}

type reproducibilityFixturePreparer struct{}

func (reproducibilityFixturePreparer) prepare(
	_ context.Context, configuration Configuration, destination string,
) error {
	files := map[string][]byte{
		"Dockerfile":            []byte("FROM scratch\n"),
		"chrome-linux64/chrome": []byte("pinned-browser\n"),
	}
	for relative, body := range files {
		file := filepath.Join(destination, filepath.FromSlash(relative))
		if err := os.MkdirAll(filepath.Dir(file), 0o755); err != nil {
			return err
		}
		if err := os.WriteFile(file, body, 0o600); err != nil {
			return err
		}
	}
	return normalizeBuildContext(destination, configuration.Lock.SourceDateEpoch)
}

type reproducibilityExecutor struct {
	requests                []commandRequest
	imageIDs                []string
	manifestDigests         []string
	classicArchive          bool
	differentSecondManifest bool
	failImageCleanup        bool
	buildCount              int
	renderCount             int
	loadedTags              map[string]string
}

func (executor *reproducibilityExecutor) run(_ context.Context, request commandRequest) ([]byte, error) {
	executor.requests = append(executor.requests, request)
	if slices.Equal(request.arguments, []string{"buildx", "version"}) {
		return []byte("github.com/docker/buildx 0.38.0 0dbe87f36ed472fe36b6796c3f70b4210a731fc5\n"), nil
	}
	if len(request.arguments) > 1 && slices.Equal(request.arguments[:2], []string{"buildx", "build"}) {
		index := executor.buildCount
		executor.buildCount++
		if index >= len(executor.imageIDs) || index >= len(executor.manifestDigests) {
			return nil, errors.New("missing injected reproducibility build identity")
		}
		if err := os.WriteFile(
			argumentAfterValue(request.arguments, "--iidfile"), []byte(executor.imageIDs[index]+"\n"), 0o600,
		); err != nil {
			return nil, err
		}
		if executor.loadedTags == nil {
			executor.loadedTags = make(map[string]string)
		}
		executor.loadedTags[argumentAfterValue(request.arguments, "--tag")] = executor.imageIDs[index]
		metadata := fmt.Sprintf(
			"{\"containerimage.digest\":%q}\n",
			executor.manifestDigests[index],
		)
		if err := os.WriteFile(
			argumentAfterValue(request.arguments, "--metadata-file"), []byte(metadata), 0o600,
		); err != nil {
			return nil, err
		}
		return nil, nil
	}
	if len(request.arguments) > 1 && slices.Equal(request.arguments[:2], []string{"image", "ls"}) {
		tag := strings.TrimPrefix(argumentAfterValue(request.arguments, "--filter"), "reference=")
		if identity := executor.loadedTags[tag]; identity != "" {
			return []byte(identity + "\n"), nil
		}
		return nil, nil
	}
	if len(request.arguments) > 1 && slices.Equal(request.arguments[:2], []string{"image", "inspect"}) {
		if identity := executor.loadedTags[request.arguments[len(request.arguments)-1]]; identity != "" {
			return []byte(identity + "\n"), nil
		}
		return nil, errors.New("missing loaded image tag")
	}
	if len(request.arguments) == 4 && slices.Equal(request.arguments[:3], []string{"image", "rm", "--force"}) {
		if executor.failImageCleanup {
			return nil, errors.New("injected image cleanup failure")
		}
		delete(executor.loadedTags, request.arguments[3])
		return nil, nil
	}
	if len(request.arguments) > 0 && request.arguments[0] == "run" {
		executor.renderCount++
		outputDirectory := mountSource(request.arguments, "/workspace/public/downloads")
		if outputDirectory == "" {
			return nil, errors.New("missing reproducibility output mount")
		}
		manifest := []byte("{\"render\":\"stable\"}\n")
		if executor.differentSecondManifest && executor.renderCount == 2 {
			manifest = []byte("{\"render\":\"change\"}\n")
		}
		if err := os.WriteFile(filepath.Join(outputDirectory, bookPDFName), []byte("%PDF-stable\n"), 0o644); err != nil {
			return nil, err
		}
		if err := os.WriteFile(filepath.Join(outputDirectory, bookManifestName), manifest, 0o644); err != nil {
			return nil, err
		}
	}
	return nil, nil
}

func TestCompareReproducibilityBuildsRequiresEveryImageIdentity(t *testing.T) {
	t.Parallel()
	pair := ReproducibilityPair{
		PairSHA256: "sha256:" + strings.Repeat("e", 64),
		artifacts: []renderedArtifact{
			{name: bookPDFName, body: []byte("pdf")},
			{name: bookManifestName, body: []byte("manifest")},
		},
	}
	first := ReproducibilityBuild{
		ImageID: testProofConfigDigest, ManifestDigest: testManifestDigest, ConfigDigest: testProofConfigDigest, Pair: pair,
	}
	second := first
	second.ImageID = testSecondImageID
	second.ManifestDigest = testSecondManifest
	comparison := compareReproducibilityBuilds(first, second)
	if comparison.ImageID || comparison.ManifestDigest || comparison.AllMatch || !comparison.CompletePair {
		t.Fatalf("identity mismatch comparison = %+v", comparison)
	}
}
