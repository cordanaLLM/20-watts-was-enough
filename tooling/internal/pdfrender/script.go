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

// VisualOptions binds a capture plan directory to the pinned renderer image.
type VisualOptions struct {
	RepositoryRoot     string
	TemporaryDirectory string
	Diagnostics        io.Writer
}

// CaptureVisual runs the visual executor with the PDF renderer's authority checks.
func CaptureVisual(ctx context.Context, options VisualOptions) (Result, error) {
	configuration, err := Check(options.RepositoryRoot)
	if err != nil {
		return Result{}, err
	}
	return captureVisualWithDependencies(ctx, configuration, options.TemporaryDirectory, remoteBuildContextPreparer{},
		&rendererDiagnosticExecutor{commandExecutor: localCommandExecutor{}, writer: options.Diagnostics})
}

func captureVisualWithDependencies(
	ctx context.Context, configuration Configuration, directory string,
	preparer buildContextPreparer, executor commandExecutor,
) (result Result, returnError error) {
	defer func() { returnError = joinRendererDiagnostics(executor, returnError) }()
	configuration, err := bindInstalledDependencies(ctx, configuration)
	if err != nil {
		return Result{}, err
	}
	if err := prepareWritableRenderPaths(configuration.RepositoryRoot); err != nil {
		return Result{}, err
	}
	directory, err = validateVisualDirectory(directory)
	if err != nil {
		return Result{}, err
	}
	publication, err := acquirePublicationLock(configuration.RepositoryRoot)
	if err != nil {
		return Result{}, err
	}
	defer func() { returnError = errors.Join(returnError, publication.release()) }()
	staging, err := os.MkdirTemp(filepath.Join(configuration.RepositoryRoot, "tmp"), "visual-builder-")
	if err != nil {
		return Result{}, fmt.Errorf("stage visual renderer: %w", err)
	}
	defer func() { returnError = errors.Join(returnError, os.RemoveAll(staging)) }()
	return captureVisualWithBuilder(ctx, configuration, directory, staging, preparer, executor)
}

func validateVisualDirectory(directory string) (string, error) {
	absolute, err := filepath.Abs(directory)
	if err != nil {
		return "", fmt.Errorf("resolve visual capture directory: %w", err)
	}
	info, err := os.Lstat(absolute)
	if err != nil {
		return "", fmt.Errorf("inspect visual capture directory: %w", err)
	}
	if !info.IsDir() || info.Mode()&os.ModeSymlink != 0 {
		return "", errors.New("visual capture directory must be a non-symlink directory")
	}
	return absolute, nil
}

func captureVisualWithBuilder(
	ctx context.Context, configuration Configuration, directory, staging string,
	preparer buildContextPreparer, executor commandExecutor,
) (result Result, returnError error) {
	imageID, builder, err := prepareRendererImage(ctx, configuration, preparer, executor, staging, defaultBaseFetchPolicy)
	if err != nil {
		return Result{}, err
	}
	builderActive := builder.owned
	defer func() {
		if builderActive {
			returnError = errors.Join(returnError, removeBuilder(executor, builder.name, configuration.Lock.Limits.OutputBytes))
		}
	}()
	if err := runVisualCapture(ctx, configuration, executor, imageID, directory); err != nil {
		return Result{}, err
	}
	if builderActive {
		if err := removeBuilder(executor, builder.name, configuration.Lock.Limits.OutputBytes); err != nil {
			return Result{}, err
		}
		builderActive = false
	}
	if err := checkAuthorityUnchanged(ctx, configuration); err != nil {
		return Result{}, err
	}
	return Result{ImageID: imageID, LockSHA256: configuration.LockSHA256, Platform: configuration.Lock.Platform, Builder: describeBuilder(builder)}, nil
}

func runVisualCapture(ctx context.Context, configuration Configuration, executor commandExecutor, imageID, directory string) error {
	if err := checkAuthorityUnchanged(ctx, configuration); err != nil {
		return err
	}
	name, err := randomContainerName()
	if err != nil {
		return err
	}
	_, err = executor.run(ctx, commandRequest{
		operation: "run pinned visual capture", directory: configuration.RepositoryRoot,
		timeout: time.Duration(configuration.Lock.Limits.RenderSeconds) * time.Second, outputSize: configuration.Lock.Limits.OutputBytes,
		arguments: visualRunArguments(configuration, imageID, name, directory),
	})
	if err != nil {
		return errors.Join(err, cleanupContainer(executor, name, configuration.Lock.Limits.OutputBytes))
	}
	return checkAuthorityUnchanged(ctx, configuration)
}

func visualRunArguments(configuration Configuration, imageID, name, directory string) []string {
	arguments := hardenedRunArguments(configuration, imageID, name, filepath.Join(configuration.RepositoryRoot, "public", "downloads"), directory)
	return append(arguments, "--entrypoint", "/usr/local/bin/node", imageID, "scripts/capture-visual-views.mjs")
}
