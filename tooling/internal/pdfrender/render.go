package pdfrender

import (
	"context"
	"crypto/rand"
	"errors"
	"fmt"
	"io"
	"os"
	"os/user"
	"path/filepath"
	"regexp"
	"runtime"
	"strings"
	"time"
)

var (
	imageIDPattern   = regexp.MustCompile(`^sha256:[0-9a-f]{64}$`)
	sourceRefPattern = regexp.MustCompile(`^(?:main|v(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*))$`)
	numericIDPattern = regexp.MustCompile(`^[0-9]+$`)
)

// Options selects the repository and source identity rendered into the book.
type Options struct {
	RepositoryRoot string
	SourceRef      string
	SourceRevision string
	// Diagnostics receives bounded retry warnings, not raw subprocess output.
	// Nil is silent. A delivery error is returned after publication and cleanup.
	Diagnostics io.Writer
}

// Result records the exact local image and checked-in lock used for rendering.
type Result struct {
	ImageID    string
	LockSHA256 string
	Platform   string
}

// Render builds and runs the exact locked PDF renderer.
func Render(ctx context.Context, options Options) (Result, error) {
	configuration, err := Check(options.RepositoryRoot)
	if err != nil {
		return Result{}, err
	}
	if err := verifySourceRevision(
		ctx,
		configuration.RepositoryRoot,
		options.SourceRef,
		options.SourceRevision,
	); err != nil {
		return Result{}, err
	}
	return renderWithDependencies(
		ctx,
		configuration,
		options.SourceRef,
		options.SourceRevision,
		remoteBuildContextPreparer{},
		&rendererDiagnosticExecutor{commandExecutor: localCommandExecutor{}, writer: options.Diagnostics},
	)
}

// ValidateSourceRef rejects a mutable or ambiguous publication source identity.
func ValidateSourceRef(sourceRef string) error {
	if !sourceRefPattern.MatchString(sourceRef) {
		return errors.New("source ref must be main or vMAJOR.MINOR.PATCH")
	}
	return nil
}

// ValidateSourceRevision requires immutable tag renders to name the exact
// lowercase Git commit already verified by the release preflight.
func ValidateSourceRevision(sourceRef, sourceRevision string) error {
	if err := ValidateSourceRef(sourceRef); err != nil {
		return err
	}
	if sourceRef != "main" && sourceRevision == "" {
		return errors.New("tag-bound rendering requires an exact source revision")
	}
	if sourceRevision != "" && !gitRevisionPattern.MatchString(sourceRevision) {
		return errors.New("source revision must be a lowercase 40-character Git identity")
	}
	return nil
}

func renderWithDependencies(
	ctx context.Context,
	configuration Configuration,
	sourceRef, sourceRevision string,
	preparer buildContextPreparer,
	executor commandExecutor,
) (result Result, returnError error) {
	defer func() { returnError = joinRendererDiagnostics(executor, returnError) }()
	if err := ValidateSourceRevision(sourceRef, sourceRevision); err != nil {
		return Result{}, err
	}
	configuration, err := bindInstalledDependencies(ctx, configuration)
	if err != nil {
		return Result{}, err
	}
	if err := prepareWritableRenderPaths(configuration.RepositoryRoot); err != nil {
		return Result{}, err
	}
	publication, err := acquirePublicationLock(configuration.RepositoryRoot)
	if err != nil {
		return Result{}, err
	}
	defer func() {
		if releaseError := publication.release(); releaseError != nil {
			if returnError == nil {
				returnError = releaseError
			} else {
				returnError = errors.Join(returnError, releaseError)
			}
		}
	}()
	temporaryRoot, err := os.MkdirTemp("", "20w-pdf-renderer-")
	if err != nil {
		return Result{}, fmt.Errorf("create PDF renderer staging root: %w", err)
	}
	defer func() {
		if removeError := os.RemoveAll(temporaryRoot); removeError != nil {
			returnError = errors.Join(returnError, fmt.Errorf("remove PDF renderer staging root: %w", removeError))
		}
	}()
	contextRoot := filepath.Join(temporaryRoot, "context")
	if err := os.Mkdir(contextRoot, 0o755); err != nil {
		return Result{}, fmt.Errorf("create PDF renderer build context: %w", err)
	}
	buildContext, cancelBuild := context.WithTimeout(ctx, time.Duration(configuration.Lock.Limits.BuildSeconds)*time.Second)
	defer cancelBuild()
	if err := verifyBuildxIdentity(buildContext, configuration, executor); err != nil {
		return Result{}, err
	}
	if err := preparer.prepare(buildContext, configuration, contextRoot); err != nil {
		return Result{}, fmt.Errorf("prepare PDF renderer build context: %w", err)
	}
	if err := checkAuthorityUnchanged(ctx, configuration); err != nil {
		return Result{}, err
	}
	builderName, err := createLockedBuilder(buildContext, configuration, executor)
	if err != nil {
		return Result{}, err
	}
	builderActive := true
	defer func() {
		if builderActive {
			if cleanupError := removeBuilder(executor, builderName, configuration.Lock.Limits.OutputBytes); cleanupError != nil {
				if returnError == nil {
					returnError = cleanupError
				} else {
					returnError = errors.Join(returnError, cleanupError)
				}
			}
		}
	}()
	iidPath := filepath.Join(temporaryRoot, "renderer.iid")
	buildOutput, err := executor.run(buildContext, commandRequest{
		operation:  "build pinned PDF renderer image",
		directory:  configuration.RepositoryRoot,
		timeout:    time.Duration(configuration.Lock.Limits.BuildSeconds) * time.Second,
		outputSize: configuration.Lock.Limits.OutputBytes,
		arguments:  buildArguments(configuration, builderName, contextRoot, iidPath),
	})
	if err != nil {
		return Result{}, err
	}
	if err := rejectTimestampRewriteWarnings(buildOutput); err != nil {
		return Result{}, err
	}
	if err := checkAuthorityUnchanged(ctx, configuration); err != nil {
		return Result{}, err
	}
	imageID, err := readImageID(iidPath)
	if err != nil {
		return Result{}, err
	}
	renderDirectories := make([]string, 2)
	for index, label := range []string{"run-a", "run-b"} {
		outputDirectory := filepath.Join(temporaryRoot, label, "downloads")
		temporaryDirectory := filepath.Join(temporaryRoot, label, "workspace-tmp")
		if err := os.MkdirAll(outputDirectory, 0o755); err != nil {
			return Result{}, fmt.Errorf("create isolated PDF output: %w", err)
		}
		if err := os.MkdirAll(temporaryDirectory, 0o755); err != nil {
			return Result{}, fmt.Errorf("create isolated PDF temporary directory: %w", err)
		}
		if err := runRendererOnce(ctx, configuration, executor, imageID, sourceRef, sourceRevision, outputDirectory, temporaryDirectory, index+1); err != nil {
			return Result{}, err
		}
		renderDirectories[index] = outputDirectory
	}
	artifacts, err := compareRenderPairs(configuration.RepositoryRoot, renderDirectories[0], renderDirectories[1])
	if err != nil {
		return Result{}, err
	}
	if err := removeBuilder(executor, builderName, configuration.Lock.Limits.OutputBytes); err != nil {
		return Result{}, err
	}
	builderActive = false
	if err := checkAuthorityUnchanged(ctx, configuration); err != nil {
		return Result{}, err
	}
	if err := publishRenderPair(configuration.RepositoryRoot, artifacts); err != nil {
		return Result{}, err
	}
	return Result{ImageID: imageID, LockSHA256: configuration.LockSHA256, Platform: configuration.Lock.Platform}, nil
}

func verifyBuildxIdentity(ctx context.Context, configuration Configuration, executor commandExecutor) error {
	output, err := executor.run(ctx, commandRequest{
		operation:  "verify locked Docker Buildx client",
		directory:  configuration.RepositoryRoot,
		timeout:    30 * time.Second,
		outputSize: configuration.Lock.Limits.OutputBytes,
		arguments:  []string{"buildx", "version"},
	})
	if err != nil {
		return err
	}
	fields := strings.Fields(string(output))
	if len(fields) != 3 || fields[0] != "github.com/docker/buildx" ||
		strings.TrimPrefix(fields[1], "v") != configuration.Lock.Builder.BuildxVersion ||
		fields[2] != configuration.Lock.Builder.BuildxRevision {
		return errors.New("Docker Buildx version or revision does not match the renderer lock")
	}
	return nil
}

func createLockedBuilder(ctx context.Context, configuration Configuration, executor commandExecutor) (string, error) {
	identity, err := randomIdentity(8)
	if err != nil {
		return "", err
	}
	name := fmt.Sprintf("pdf20w-%d-%s", os.Getpid(), identity)
	_, err = executor.run(ctx, commandRequest{
		operation:  "create locked Docker BuildKit builder",
		directory:  configuration.RepositoryRoot,
		timeout:    time.Duration(configuration.Lock.Limits.BuildSeconds) * time.Second,
		outputSize: configuration.Lock.Limits.OutputBytes,
		arguments: []string{
			"buildx", "create",
			"--name", name,
			"--driver", "docker-container",
			"--driver-opt", "image=" + configuration.Lock.Builder.BuildKitImage,
			"--platform", configuration.Lock.Platform,
			"--bootstrap",
		},
	})
	if err != nil {
		return "", err
	}
	return name, nil
}

func runRendererOnce(
	ctx context.Context,
	configuration Configuration,
	executor commandExecutor,
	imageID, sourceRef, sourceRevision, outputDirectory, temporaryDirectory string,
	renderSequence int,
) error {
	if err := checkAuthorityUnchanged(ctx, configuration); err != nil {
		return err
	}
	containerName, err := randomContainerName()
	if err != nil {
		return err
	}
	_, err = executor.run(ctx, commandRequest{
		operation:      "run pinned PDF renderer image",
		renderSequence: renderSequence,
		directory:      configuration.RepositoryRoot,
		timeout:        time.Duration(configuration.Lock.Limits.RenderSeconds) * time.Second,
		outputSize:     configuration.Lock.Limits.OutputBytes,
		arguments: runArguments(
			configuration, imageID, containerName, sourceRef, sourceRevision, outputDirectory, temporaryDirectory,
		),
	})
	if err != nil {
		cleanupContainer(executor, containerName, configuration.Lock.Limits.OutputBytes)
		return err
	}
	return checkAuthorityUnchanged(ctx, configuration)
}

func checkAuthorityUnchanged(ctx context.Context, configuration Configuration) error {
	current, err := Check(configuration.RepositoryRoot)
	if err != nil || current.LockSHA256 != configuration.LockSHA256 {
		return errors.New("PDF renderer lock changed during the render operation")
	}
	return checkInstalledDependencies(ctx, configuration)
}

func buildArguments(configuration Configuration, builderName, contextRoot, iidPath string) []string {
	lock := configuration.Lock
	return []string{
		"buildx", "build",
		"--builder", builderName,
		"--output", fmt.Sprintf("type=docker,rewrite-timestamp=%t", lock.Exporter.RewriteTimestamp),
		"--pull",
		"--platform", lock.Platform,
		"--provenance=false",
		"--sbom=false",
		"--iidfile", iidPath,
		"--build-arg", "NODE_VERSION=" + lock.Node.Version,
		"--build-arg", "CHROME_VERSION=" + lock.ChromeForTesting.Version,
		"--build-arg", "CHROME_EXECUTABLE_PATH=" + lock.ChromeForTesting.ExecutablePath,
		"--build-arg", "CHROME_EXECUTABLE_SHA256=" + lock.ChromeForTesting.ExecutableSHA256,
		"--build-arg", "RENDERER_LOCK_SHA256=" + configuration.LockSHA256,
		"--build-arg", "SOURCE_DATE_EPOCH=" + decimal(lock.SourceDateEpoch),
		"--file", filepath.Join(contextRoot, "Dockerfile"),
		contextRoot,
	}
}

func rejectTimestampRewriteWarnings(output []byte) error {
	message := string(output)
	missingEpoch := "rewrite-timestamp is specified, but no source-date-epoch was found"
	rewriteFailure := strings.Contains(message, "failed to rewrite layer ") &&
		strings.Contains(message, " to match source-date-epoch ")
	if strings.Contains(message, missingEpoch) || rewriteFailure {
		return errors.New("BuildKit did not apply the required PDF renderer timestamp rewrite")
	}
	return nil
}

func runArguments(
	configuration Configuration,
	imageID, containerName, sourceRef, sourceRevision, outputDirectory, temporaryDirectory string,
) []string {
	root := configuration.RepositoryRoot
	limits := configuration.Lock.Limits
	arguments := []string{
		"run", "--rm", "--init", "--pull", "never",
		"--name", containerName,
		"--hostname", "20w-pdf-renderer",
		"--platform", configuration.Lock.Platform,
		"--network", "none",
		"--read-only",
		"--cap-drop", "ALL",
		"--security-opt", "no-new-privileges",
		"--memory", decimal(limits.MemoryBytes),
		"--pids-limit", decimal(int64(limits.PIDs)),
		"--ulimit", "core=0:0",
		"--ulimit", "nofile=1024:1024",
		"--env", "BOOK_RENDERER_IMAGE_ID=" + imageID,
		"--env", "BOOK_RENDERER_LOCK_SHA256=" + configuration.LockSHA256,
		"--env", "BOOK_RENDERER_PLATFORM=" + configuration.Lock.Platform,
		"--env", "VITE_CACHE_DIR=/tmp/vite-cache",
		"--mount", dockerBind(root, "/workspace", true),
		"--mount", dockerBind(outputDirectory, "/workspace/public/downloads", false),
		"--mount", dockerBind(temporaryDirectory, "/workspace/tmp", false),
		"--tmpfs", dockerTmpfs("/tmp", limits.TemporaryBytes),
	}
	if containerUser := currentContainerUser(); containerUser != "" {
		arguments = append(arguments, "--user", containerUser)
	}
	arguments = append(arguments, imageID)
	if sourceRef != "main" {
		arguments = append(arguments, "--ref", sourceRef)
	}
	if sourceRevision != "" {
		arguments = append(arguments, "--revision", sourceRevision)
	}
	return arguments
}

func dockerBind(source, destination string, readOnly bool) string {
	mount := "type=bind,src=" + source + ",dst=" + destination
	if readOnly {
		mount += ",readonly"
	}
	return mount
}

func dockerTmpfs(destination string, size int64) string {
	return destination + ":rw,noexec,nosuid,nodev,size=" + decimal(size) + ",mode=1777"
}

func readImageID(path string) (string, error) {
	information, err := os.Lstat(path)
	if err != nil {
		return "", fmt.Errorf("inspect PDF renderer image ID: %w", err)
	}
	if !information.Mode().IsRegular() || information.Mode()&os.ModeSymlink != 0 || information.Size() <= 0 || information.Size() > 80 {
		return "", errors.New("PDF renderer image ID file must be a bounded regular non-symlink file")
	}
	opened, err := os.Open(path)
	if err != nil {
		return "", fmt.Errorf("open PDF renderer image ID: %w", err)
	}
	defer opened.Close()
	body, err := io.ReadAll(io.LimitReader(opened, 81))
	if err != nil {
		return "", fmt.Errorf("read PDF renderer image ID: %w", err)
	}
	openedInformation, err := opened.Stat()
	currentInformation, currentError := os.Lstat(path)
	if err != nil || currentError != nil || !os.SameFile(information, openedInformation) ||
		!os.SameFile(information, currentInformation) || int64(len(body)) != information.Size() {
		return "", errors.New("PDF renderer image ID changed while it was read")
	}
	if string(body) != strings.TrimSpace(string(body)) && string(body) != strings.TrimSpace(string(body))+"\n" {
		return "", errors.New("PDF renderer image ID file has trailing or excessive data")
	}
	imageID := strings.TrimSpace(string(body))
	if !imageIDPattern.MatchString(imageID) {
		return "", errors.New("PDF renderer image ID is not an exact sha256 identity")
	}
	return imageID, nil
}

func prepareWritableRenderPaths(root string) error {
	for _, relative := range []string{"node_modules", "public/downloads", "tmp"} {
		create := relative == "tmp"
		if err := requireContainedDirectory(root, relative, create); err != nil {
			return err
		}
	}
	return nil
}

func requireContainedDirectory(root, relative string, create bool) error {
	current := root
	for _, component := range strings.Split(filepath.FromSlash(relative), string(filepath.Separator)) {
		current = filepath.Join(current, component)
		information, err := os.Lstat(current)
		if errors.Is(err, os.ErrNotExist) && create {
			if err := os.Mkdir(current, 0o755); err != nil {
				return fmt.Errorf("create PDF renderer directory %s: %w", relative, err)
			}
			continue
		}
		if err != nil {
			return fmt.Errorf("inspect PDF renderer directory %s: %w", relative, err)
		}
		if !information.IsDir() || information.Mode()&os.ModeSymlink != 0 {
			return fmt.Errorf("PDF renderer directory %s must be a non-symlink directory", relative)
		}
	}
	return nil
}

func currentContainerUser() string {
	current, err := user.Current()
	if err != nil {
		return ""
	}
	return containerUserFor(runtime.GOOS, current.Uid, current.Gid)
}

func containerUserFor(operatingSystem, uid, gid string) string {
	if operatingSystem == "windows" || uid == "0" || !numericIDPattern.MatchString(uid) || !numericIDPattern.MatchString(gid) {
		return ""
	}
	return uid + ":" + gid
}

func randomContainerName() (string, error) {
	random := make([]byte, 8)
	if _, err := rand.Read(random); err != nil {
		return "", fmt.Errorf("create PDF renderer container identity: %w", err)
	}
	return fmt.Sprintf("20w-pdf-%d-%x", os.Getpid(), random), nil
}

func cleanupContainer(executor commandExecutor, containerName string, outputSize int) {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	_, _ = executor.run(ctx, commandRequest{
		operation:  "remove failed PDF renderer container",
		timeout:    30 * time.Second,
		outputSize: outputSize,
		arguments:  []string{"rm", "--force", containerName},
	})
}

func removeBuilder(executor commandExecutor, builderName string, outputSize int) error {
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()
	_, err := executor.run(ctx, commandRequest{
		operation:  "remove locked Docker BuildKit builder",
		timeout:    60 * time.Second,
		outputSize: outputSize,
		arguments:  []string{"buildx", "rm", "--force", builderName},
	})
	return err
}
