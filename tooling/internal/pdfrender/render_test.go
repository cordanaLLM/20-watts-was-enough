package pdfrender

import (
	"context"
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"slices"
	"strings"
	"sync"
	"testing"

	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/boundedexec"
)

const testImageID = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"

func TestValidateSourceRevisionRequiresExactReleaseIdentity(t *testing.T) {
	t.Parallel()
	revision := strings.Repeat("a", 40)
	for _, testCase := range []struct {
		name            string
		ref             string
		revision        string
		expectedFailure string
	}{
		{name: "continuous-main", ref: "main"},
		{name: "source-bound-main", ref: "main", revision: revision},
		{name: "immutable-release", ref: "v1.2.3", revision: revision},
		{name: "release-without-commit", ref: "v1.2.3", expectedFailure: "requires an exact source revision"},
		{name: "uppercase-commit", ref: "v1.2.3", revision: strings.ToUpper(revision), expectedFailure: "lowercase 40-character"},
		{name: "short-commit", ref: "v1.2.3", revision: revision[:39], expectedFailure: "lowercase 40-character"},
	} {
		testCase := testCase
		t.Run(testCase.name, func(t *testing.T) {
			t.Parallel()
			err := ValidateSourceRevision(testCase.ref, testCase.revision)
			if testCase.expectedFailure == "" {
				if err != nil {
					t.Fatalf("ValidateSourceRevision() error = %v", err)
				}
				return
			}
			if err == nil || !strings.Contains(err.Error(), testCase.expectedFailure) {
				t.Fatalf("ValidateSourceRevision() error = %v, want %q", err, testCase.expectedFailure)
			}
		})
	}
}

func TestSourceRevisionBindingRejectsMissingMalformedAndWrongCommits(t *testing.T) {
	t.Parallel()
	root := t.TempDir()
	head := commitRenderTestRepository(t, root)
	if err := verifySourceRevision(context.Background(), root, "v1.2.3", head); err != nil {
		t.Fatalf("verifySourceRevision() valid error = %v", err)
	}
	wrongRevision := strings.Repeat("f", 40)
	if wrongRevision == head {
		wrongRevision = strings.Repeat("e", 40)
	}
	for name, revision := range map[string]string{
		"missing":   "",
		"malformed": "HEAD",
		"wrong":     wrongRevision,
	} {
		name, revision := name, revision
		t.Run(name, func(t *testing.T) {
			err := verifySourceRevision(context.Background(), root, "v1.2.3", revision)
			if err == nil {
				t.Fatal("verifySourceRevision() unexpectedly accepted an invalid binding")
			}
		})
	}
}

func TestRenderRejectsAWellFormedRevisionOtherThanRepositoryHEAD(t *testing.T) {
	t.Parallel()
	configuration := renderConfiguration(t)
	head := commitRenderTestRepository(t, configuration.RepositoryRoot)
	wrongRevision := strings.Repeat("f", 40)
	if wrongRevision == head {
		wrongRevision = strings.Repeat("e", 40)
	}
	_, err := Render(context.Background(), Options{
		RepositoryRoot: configuration.RepositoryRoot,
		SourceRef:      "v1.2.3",
		SourceRevision: wrongRevision,
	})
	if err == nil || !strings.Contains(err.Error(), "not verified commit") {
		t.Fatalf("Render() error = %v, want repository HEAD mismatch", err)
	}
}

func TestRenderPlanUsesTheExactImageAndHardenedContainer(t *testing.T) {
	t.Parallel()
	configuration := renderConfiguration(t)
	executor := &recordingExecutor{imageID: testImageID}
	result, err := renderWithDependencies(
		context.Background(), configuration, "main", "", noOpPreparer{}, executor,
	)
	if err != nil {
		t.Fatalf("renderWithDependencies() error = %v", err)
	}
	if result.ImageID != testImageID || result.LockSHA256 != configuration.LockSHA256 {
		t.Fatalf("renderWithDependencies() result = %+v", result)
	}
	if len(executor.requests) != 6 {
		t.Fatalf("renderer executed %d commands, want version, create, build, two runs, and cleanup", len(executor.requests))
	}
	build := requestWithPrefix(t, executor.requests, "buildx", "build").arguments
	for _, expected := range []string{
		"SOURCE_DATE_EPOCH=" + decimal(configuration.Lock.SourceDateEpoch),
		"RENDERER_LOCK_SHA256=" + configuration.LockSHA256,
		"type=docker,rewrite-timestamp=true",
		"--builder",
	} {
		if !slices.Contains(build, expected) {
			t.Fatalf("build arguments omit %q: %v", expected, build)
		}
	}
	if strings.Contains(strings.Join(build, "\n"), "NODE_IMAGE=") ||
		strings.Contains(strings.Join(build, "\n"), "PUPPETEER_IMAGE=") {
		t.Fatalf("build arguments retain an ARG-based base image: %v", build)
	}
	if slices.Contains(build, "--load") || strings.Contains(strings.Join(build, "\n"), "compatibility-version") {
		t.Fatalf("build arguments bypass the locked exporter boundary: %v", build)
	}
	create := requestWithPrefix(t, executor.requests, "buildx", "create").arguments
	for _, expected := range []string{
		"docker-container",
		"image=" + configuration.Lock.Builder.BuildKitImage,
		configuration.Lock.Platform,
		"--bootstrap",
	} {
		if !slices.Contains(create, expected) {
			t.Fatalf("builder creation omits %q: %v", expected, create)
		}
	}
	runs := requestsWithPrefix(executor.requests, "run")
	if len(runs) != 2 {
		t.Fatalf("renderer run count = %d, want two", len(runs))
	}
	run := runs[0].arguments
	for _, expected := range []string{
		"none", "never", "ALL", "no-new-privileges", "BOOK_RENDERER_IMAGE_ID=" + testImageID,
		"BOOK_RENDERER_LOCK_SHA256=" + configuration.LockSHA256,
		"VITE_CACHE_DIR=/tmp/vite-cache", testImageID,
	} {
		if !slices.Contains(run, expected) {
			t.Fatalf("run arguments omit %q: %v", expected, run)
		}
	}
	if !slices.Contains(run, boundedexec.DockerBind(configuration.RepositoryRoot, "/workspace", true)) ||
		mountSource(run, "/workspace/public/downloads") == "" {
		t.Fatalf("run bind mounts are incomplete: %v", run)
	}
	if mountSource(runs[0].arguments, "/workspace/public/downloads") ==
		mountSource(runs[1].arguments, "/workspace/public/downloads") {
		t.Fatalf("fresh renders share an output directory")
	}
	if strings.Contains(strings.Join(run, "\n"), "node_modules/.vite") {
		t.Fatalf("run arguments depend on pre-existing Vite cache mountpoints: %v", run)
	}
}

func TestRenderRejectsTimestampRewriteWarnings(t *testing.T) {
	t.Parallel()
	for name, buildOutput := range map[string]string{
		"missing-epoch": "rewrite-timestamp is specified, but no source-date-epoch was found",
		"layer-failure": "failed to rewrite layer 17/19 to match source-date-epoch 1787612224 (date)",
	} {
		name, buildOutput := name, buildOutput
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			configuration := renderConfiguration(t)
			executor := &recordingExecutor{imageID: testImageID, buildOutput: buildOutput}
			_, err := renderWithDependencies(
				context.Background(), configuration, "main", "", noOpPreparer{}, executor,
			)
			if err == nil || !strings.Contains(err.Error(), "did not apply") {
				t.Fatalf("renderWithDependencies() error = %v", err)
			}
			if len(executor.requests) != 4 {
				t.Fatalf("rewrite warning executed %d commands, want version, create, build, cleanup", len(executor.requests))
			}
		})
	}
}

func TestRenderRejectsMalformedImageIDBeforeStartingAContainer(t *testing.T) {
	t.Parallel()
	configuration := renderConfiguration(t)
	executor := &recordingExecutor{imageID: testImageID + " "}
	_, err := renderWithDependencies(
		context.Background(), configuration, "main", "", noOpPreparer{}, executor,
	)
	if err == nil || !strings.Contains(err.Error(), "trailing") {
		t.Fatalf("renderWithDependencies() error = %v", err)
	}
	if len(executor.requests) != 4 {
		t.Fatalf("malformed IID executed %d commands, want version, create, build, cleanup", len(executor.requests))
	}
}

func TestReadImageIDRejectsAnOversizedOrSymlinkedFile(t *testing.T) {
	t.Parallel()
	root := t.TempDir()
	oversized := filepath.Join(root, "oversized.iid")
	if err := os.WriteFile(oversized, []byte(strings.Repeat("a", 81)), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := readImageID(oversized); err == nil || !strings.Contains(err.Error(), "bounded") {
		t.Fatalf("readImageID() oversized error = %v", err)
	}
	link := filepath.Join(root, "link.iid")
	if err := os.Symlink(oversized, link); err != nil {
		t.Fatal(err)
	}
	if _, err := readImageID(link); err == nil || !strings.Contains(err.Error(), "non-symlink") {
		t.Fatalf("readImageID() symlink error = %v", err)
	}
}

func TestRenderRejectsAuthorityDriftDuringTheImageBuild(t *testing.T) {
	t.Parallel()
	configuration := renderConfiguration(t)
	executor := &recordingExecutor{
		imageID: testImageID,
		afterBuild: func() error {
			file, err := os.OpenFile(configuration.LockPath, os.O_APPEND|os.O_WRONLY, 0)
			if err != nil {
				return err
			}
			if _, err := file.WriteString("\n"); err != nil {
				_ = file.Close()
				return err
			}
			return file.Close()
		},
	}
	_, err := renderWithDependencies(
		context.Background(), configuration, "main", "", noOpPreparer{}, executor,
	)
	if err == nil || !strings.Contains(err.Error(), "changed during") {
		t.Fatalf("renderWithDependencies() error = %v", err)
	}
	if len(executor.requests) != 4 {
		t.Fatalf("authority drift executed %d commands, want version, create, build, cleanup", len(executor.requests))
	}
}

func TestRenderFailureForcesCleanupOfTheNamedContainer(t *testing.T) {
	t.Parallel()
	configuration := renderConfiguration(t)
	executor := &recordingExecutor{imageID: testImageID, failRun: true}
	sourceRevision := strings.Repeat("b", 40)
	_, err := renderWithDependencies(
		context.Background(), configuration, "v1.2.3", sourceRevision, noOpPreparer{}, executor,
	)
	if err == nil || !strings.Contains(err.Error(), "injected run failure") {
		t.Fatalf("renderWithDependencies() error = %v", err)
	}
	if len(executor.requests) != 6 {
		t.Fatalf("failed render executed %d commands, want version, create, build, run, container and builder cleanup", len(executor.requests))
	}
	runRequest := requestWithPrefix(t, executor.requests, "run")
	runName := argumentAfter(t, runRequest.arguments, "--name")
	cleanup := requestWithPrefix(t, executor.requests, "rm", "--force").arguments
	if !slices.Equal(cleanup, []string{"rm", "--force", runName}) {
		t.Fatalf("cleanup arguments = %v", cleanup)
	}
	if !slices.Contains(runRequest.arguments, "v1.2.3") {
		t.Fatalf("release ref is absent from run arguments: %v", runRequest.arguments)
	}
	if !slices.Contains(runRequest.arguments, sourceRevision) {
		t.Fatalf("release revision is absent from run arguments: %v", runRequest.arguments)
	}
}

func TestRenderRejectsDifferentFreshOutputsWithoutReplacingPublication(t *testing.T) {
	t.Parallel()
	configuration := renderConfiguration(t)
	oldPDF := []byte("old-pdf")
	oldManifest := []byte("old-manifest")
	writePublicationFixture(t, configuration.RepositoryRoot, oldPDF, oldManifest)
	executor := &recordingExecutor{imageID: testImageID, differentSecondRender: true}
	_, err := renderWithDependencies(
		context.Background(), configuration, "main", "", noOpPreparer{}, executor,
	)
	if err == nil || !strings.Contains(err.Error(), "fresh PDF renders differ") {
		t.Fatalf("renderWithDependencies() error = %v", err)
	}
	assertPublicationFixture(t, configuration.RepositoryRoot, oldPDF, oldManifest)
}

func TestRenderRejectsAnUnreviewedBuildxBinaryBeforeCreatingABuilder(t *testing.T) {
	t.Parallel()
	configuration := renderConfiguration(t)
	executor := &recordingExecutor{imageID: testImageID, buildxOutput: "github.com/docker/buildx 0.0.0 bad"}
	_, err := renderWithDependencies(
		context.Background(), configuration, "main", "", noOpPreparer{}, executor,
	)
	if err == nil || !strings.Contains(err.Error(), "does not match the renderer lock") {
		t.Fatalf("renderWithDependencies() error = %v", err)
	}
	if len(executor.requests) != 1 {
		t.Fatalf("unreviewed Buildx executed %d commands, want version only", len(executor.requests))
	}
}

func TestRenderRejectsAConcurrentPublicationBeforeDocker(t *testing.T) {
	t.Parallel()
	configuration := renderConfiguration(t)
	lock, err := acquirePublicationLock(configuration.RepositoryRoot)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if err := lock.release(); err != nil {
			t.Error(err)
		}
	})
	executor := &recordingExecutor{imageID: testImageID}
	_, err = renderWithDependencies(
		context.Background(), configuration, "main", "", noOpPreparer{}, executor,
	)
	if err == nil || !strings.Contains(err.Error(), "already locked") {
		t.Fatalf("renderWithDependencies() error = %v", err)
	}
	if len(executor.requests) != 0 {
		t.Fatalf("concurrent publication executed %d Docker commands", len(executor.requests))
	}
}

func TestContainerUserNeverElevatesRoot(t *testing.T) {
	t.Parallel()
	if observed := containerUserFor("linux", "0", "0"); observed != "" {
		t.Fatalf("containerUserFor(root) = %q", observed)
	}
	if observed := containerUserFor("windows", "1000", "1000"); observed != "" {
		t.Fatalf("containerUserFor(windows) = %q", observed)
	}
	if observed := containerUserFor("linux", "1000", "1001"); observed != "1000:1001" {
		t.Fatalf("containerUserFor(user) = %q", observed)
	}
}

type noOpPreparer struct{}

func (noOpPreparer) prepare(context.Context, Configuration, string) error { return nil }

type recordingExecutor struct {
	mu                    sync.Mutex
	requests              []commandRequest
	imageID               string
	failRun               bool
	differentSecondRender bool
	buildxOutput          string
	buildOutput           string
	renderCount           int
	afterBuild            func() error
}

func (executor *recordingExecutor) run(_ context.Context, request commandRequest) ([]byte, error) {
	executor.mu.Lock()
	defer executor.mu.Unlock()
	executor.requests = append(executor.requests, request)
	if slices.Equal(request.arguments, []string{"buildx", "version"}) {
		output := executor.buildxOutput
		if output == "" {
			output = "github.com/docker/buildx 0.38.0 0dbe87f36ed472fe36b6796c3f70b4210a731fc5"
		}
		return []byte(output + "\n"), nil
	}
	if len(request.arguments) > 1 && request.arguments[0] == "buildx" && request.arguments[1] == "build" {
		iidPath := argumentAfterValue(request.arguments, "--iidfile")
		if err := os.WriteFile(iidPath, []byte(executor.imageID+"\n"), 0o600); err != nil {
			return nil, err
		}
		if executor.afterBuild != nil {
			if err := executor.afterBuild(); err != nil {
				return nil, err
			}
		}
		return []byte(executor.buildOutput), nil
	}
	if len(request.arguments) > 0 && request.arguments[0] == "run" {
		if executor.failRun {
			return nil, errors.New("injected run failure")
		}
		executor.renderCount++
		outputDirectory := mountSource(request.arguments, "/workspace/public/downloads")
		if outputDirectory == "" {
			return nil, errors.New("missing output mount")
		}
		manifest := []byte("{\"render\":\"stable\"}\n")
		isSecond := request.renderSequence == 2 || (request.renderSequence == 0 && executor.renderCount == 2)
		if executor.differentSecondRender && isSecond {
			manifest = []byte("{\"render\":\"different\"}\n")
		}
		if err := os.WriteFile(filepath.Join(outputDirectory, bookPDFName), []byte("%PDF-test\n"), 0o644); err != nil {
			return nil, err
		}
		if err := os.WriteFile(filepath.Join(outputDirectory, bookManifestName), manifest, 0o644); err != nil {
			return nil, err
		}
	}
	return nil, nil
}

func renderConfiguration(t *testing.T) Configuration {
	t.Helper()
	root := rendererFixture(t)
	for _, relative := range []string{"node_modules", "public/downloads", "tmp"} {
		if err := os.MkdirAll(filepath.Join(root, filepath.FromSlash(relative)), 0o755); err != nil {
			t.Fatal(err)
		}
	}
	writeInstalledDependencyFixture(t, root)
	configuration, err := Check(root)
	if err != nil {
		t.Fatal(err)
	}
	return configuration
}

func commitRenderTestRepository(t *testing.T, root string) string {
	t.Helper()
	runRenderTestGit(t, root, "init", "--quiet")
	if err := os.WriteFile(filepath.Join(root, "source.txt"), []byte("source\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	runRenderTestGit(t, root, "add", "source.txt")
	runRenderTestGit(
		t, root,
		"-c", "user.name=PDF test", "-c", "user.email=pdf-test@example.invalid",
		"commit", "--quiet", "-m", "source",
	)
	return strings.TrimSpace(runRenderTestGit(t, root, "rev-parse", "HEAD"))
}

func runRenderTestGit(t *testing.T, root string, arguments ...string) string {
	t.Helper()
	commandContext, cancel := context.WithTimeout(context.Background(), sourceRevisionTimeout)
	defer cancel()
	command := exec.CommandContext(commandContext, "git", append([]string{"-C", root}, arguments...)...)
	command.Env = boundedexec.GitEnvironment()
	command.WaitDelay = maximumWaitDelay
	output, err := command.CombinedOutput()
	if commandContext.Err() != nil {
		t.Fatalf("git %v timed out: %v", arguments, commandContext.Err())
	}
	if err != nil {
		t.Fatalf("git %v: %v: %s", arguments, err, output)
	}
	return string(output)
}

func argumentAfter(t *testing.T, arguments []string, flag string) string {
	t.Helper()
	value := argumentAfterValue(arguments, flag)
	if value == "" {
		t.Fatalf("arguments %v omit %s", arguments, flag)
	}
	return value
}

func argumentAfterValue(arguments []string, flag string) string {
	for index := 0; index+1 < len(arguments); index++ {
		if arguments[index] == flag {
			return arguments[index+1]
		}
	}
	return ""
}

func requestsWithPrefix(requests []commandRequest, prefix ...string) []commandRequest {
	var matches []commandRequest
	for _, request := range requests {
		if len(request.arguments) >= len(prefix) && slices.Equal(request.arguments[:len(prefix)], prefix) {
			matches = append(matches, request)
		}
	}
	return matches
}

func requestWithPrefix(t *testing.T, requests []commandRequest, prefix ...string) commandRequest {
	t.Helper()
	matches := requestsWithPrefix(requests, prefix...)
	if len(matches) != 1 {
		t.Fatalf("requests with prefix %v = %d, want one", prefix, len(matches))
	}
	return matches[0]
}

func mountSource(arguments []string, destination string) string {
	for index := 0; index+1 < len(arguments); index++ {
		if arguments[index] != "--mount" {
			continue
		}
		mount := arguments[index+1]
		suffix := ",dst=" + destination
		if strings.HasPrefix(mount, "type=bind,src=") && strings.HasSuffix(mount, suffix) {
			return strings.TrimSuffix(strings.TrimPrefix(mount, "type=bind,src="), suffix)
		}
	}
	return ""
}

func writePublicationFixture(t *testing.T, root string, pdf, manifest []byte) {
	t.Helper()
	directory := filepath.Join(root, "public", "downloads")
	if err := os.WriteFile(filepath.Join(directory, bookPDFName), pdf, 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(directory, bookManifestName), manifest, 0o644); err != nil {
		t.Fatal(err)
	}
}

func assertPublicationFixture(t *testing.T, root string, pdf, manifest []byte) {
	t.Helper()
	for name, expected := range map[string][]byte{bookPDFName: pdf, bookManifestName: manifest} {
		observed, err := os.ReadFile(filepath.Join(root, "public", "downloads", name))
		if err != nil {
			t.Fatal(err)
		}
		if !slices.Equal(observed, expected) {
			t.Fatalf("%s = %q, want %q", name, observed, expected)
		}
	}
}

func TestReleaseTagGrammar(t *testing.T) {
	t.Parallel()
	for _, test := range []struct {
		tag   string
		valid bool
	}{
		{"v0.0.0", true},
		{"v0.5.0", true},
		{"v12.34.56", true},
		{"v0.0.0-rc.0", true},
		{"v0.5.0-rc.1", true},
		{"v0.5.0-rc.10", true},
		{"v999999999999999999999.0.0-rc.999999999999999999999", true},
		{"", false},
		{"0.5.0", false},
		{"v0.5.0-rc", false},
		{"v0.5.0-rc.01", false},
		{"v0.5.0-rc.1.2", false},
		{"v0.5.0-beta.1", false},
		{"v0.5.0-RC.1", false},
		{"v05.0.0", false},
		{"v0.05.0", false},
		{"v0.5.00", false},
		{"v0.5.0+meta", false},
		{"v0.5.0-rc.1-x", false},
		{"v0.5.0-rc.-1", false},
		{"v0.5.0-rc.", false},
		{"v0.5.0\n", false},
		{" v0.5.0", false},
		{"v0.5.0 ", false},
	} {
		t.Run(test.tag, func(t *testing.T) {
			t.Parallel()
			err := ValidateSourceRevision(test.tag, "0123456789abcdef0123456789abcdef01234567")
			if (err == nil) != test.valid {
				t.Fatalf("tag %q: error = %v, want valid = %t", test.tag, err, test.valid)
			}
		})
	}
}

type failedContainerCleanupExecutor struct {
	*recordingExecutor
	runError     error
	cleanupError error
}

func (executor failedContainerCleanupExecutor) run(ctx context.Context, request commandRequest) ([]byte, error) {
	if len(request.arguments) > 0 && request.arguments[0] == "run" {
		return nil, executor.runError
	}
	if len(request.arguments) > 0 && request.arguments[0] == "rm" {
		return nil, executor.cleanupError
	}
	return executor.recordingExecutor.run(ctx, request)
}

func TestRenderFailureRetainsContainerCleanupFailure(t *testing.T) {
	t.Parallel()
	configuration := renderConfiguration(t)
	runError := errors.New("injected render failure")
	cleanupError := errors.New("injected container cleanup failure")
	executor := failedContainerCleanupExecutor{
		recordingExecutor: &recordingExecutor{imageID: testImageID},
		runError:          runError,
		cleanupError:      cleanupError,
	}
	_, err := renderWithDependencies(context.Background(), configuration, "main", "", noOpPreparer{}, executor)
	if !errors.Is(err, runError) || !errors.Is(err, cleanupError) {
		t.Fatalf("render lost primary or cleanup error: %v", err)
	}
	if !strings.Contains(err.Error(), "remove failed PDF renderer container 20w-pdf-") {
		t.Fatalf("cleanup error lacks container context: %v", err)
	}
	requestWithPrefix(t, executor.requests, "buildx", "rm")
}
