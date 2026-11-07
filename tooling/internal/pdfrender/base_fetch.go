package pdfrender

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"time"
)

// MaximumBaseFetchDuration bounds the phase that fetches both locked base
// images into the builder store before the image build.
const MaximumBaseFetchDuration = 30 * time.Minute

// baseFetchPolicy bounds each fetch attempt, the attempts per image and the
// whole phase, so a stalled first fill fails by name instead of hanging.

type baseFetchPolicy struct {
	attemptTimeout time.Duration
	attempts       int
	backoff        time.Duration
	phaseTimeout   time.Duration
}

var defaultBaseFetchPolicy = baseFetchPolicy{
	attemptTimeout: 10 * time.Minute,
	attempts:       3,
	backoff:        5 * time.Second,
	phaseTimeout:   MaximumBaseFetchDuration,
}

// fetchBaseImages fills the builder store with the locked Node and browser
// base images. A FROM-only cacheonly build only resolves the manifest; the
// RUN step forces BuildKit to download and unpack every layer, which the
// following image build then reuses without a download.
func fetchBaseImages(
	ctx context.Context,
	configuration Configuration,
	executor commandExecutor,
	builderName, fetchRoot string,
	policy baseFetchPolicy,
) error {
	phaseCtx, cancelPhase := context.WithTimeout(ctx, policy.phaseTimeout)
	defer cancelPhase()

	targets := []struct {
		label string
		image string
	}{
		{label: "node", image: configuration.Lock.Node.Image},
		{label: "browser-environment", image: configuration.Lock.BrowserEnvironment.Image},
	}

	for _, target := range targets {
		if err := fetchSingleBaseImage(ctx, phaseCtx, configuration, executor, builderName, fetchRoot, target.label, target.image, policy); err != nil {
			return err
		}
	}
	return nil
}

func fetchSingleBaseImage(
	ctx, phaseCtx context.Context,
	configuration Configuration,
	executor commandExecutor,
	builderName, fetchRoot, label, image string,
	policy baseFetchPolicy,
) error {
	if ctx.Err() != nil {
		return fmt.Errorf("fetch PDF renderer base image %s: %w", image, ctx.Err())
	}
	dockerfilePath, targetDir, err := prepareBaseFetchContext(fetchRoot, label, image)
	if err != nil {
		return err
	}
	arguments := []string{
		"buildx", "build",
		"--builder", builderName,
		"--platform", configuration.Lock.Platform,
		"--provenance=false",
		"--sbom=false",
		"--output", "type=cacheonly",
		"--file", dockerfilePath,
		targetDir,
	}

	var lastErr error
	attemptsMade := 0
	for attemptsMade < policy.attempts && phaseCtx.Err() == nil {
		if attemptsMade > 0 {
			if err := waitBaseFetchBackoff(ctx, phaseCtx, policy.backoff); err != nil {
				return fmt.Errorf("fetch PDF renderer base image %s: %w", image, errors.Join(lastErr, err))
			}
		}
		attemptsMade++
		_, lastErr = executor.run(phaseCtx, commandRequest{
			operation:  "fetch PDF renderer base image",
			directory:  configuration.RepositoryRoot,
			timeout:    policy.attemptTimeout,
			outputSize: configuration.Lock.Limits.OutputBytes,
			arguments:  arguments,
		})
		if lastErr == nil {
			return nil
		}
		if ctx.Err() != nil {
			return fmt.Errorf("fetch PDF renderer base image %s: %w", image, errors.Join(lastErr, ctx.Err()))
		}
	}
	if phaseCtx.Err() != nil && !errors.Is(lastErr, phaseCtx.Err()) {
		lastErr = errors.Join(lastErr, phaseCtx.Err())
	}
	return fmt.Errorf("fetch PDF renderer base image %s: failed after %d of %d attempts (%s each, %s phase): %w",
		image, attemptsMade, policy.attempts, policy.attemptTimeout, policy.phaseTimeout, lastErr)
}

func waitBaseFetchBackoff(ctx, phaseCtx context.Context, backoff time.Duration) error {
	timer := time.NewTimer(backoff)
	defer timer.Stop()
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-phaseCtx.Done():
		return nil
	case <-timer.C:
		return nil
	}
}

func prepareBaseFetchContext(fetchRoot, label, image string) (string, string, error) {
	targetDir := filepath.Join(fetchRoot, label)
	if err := os.MkdirAll(targetDir, 0o755); err != nil { //#nosec G301 -- container build context directory must be readable by container builder
		return "", "", fmt.Errorf("fetch PDF renderer base image %s: create directory: %w", image, err)
	}
	dockerfilePath := filepath.Join(targetDir, "Dockerfile")
	dockerfileContent := "FROM " + image + "\nRUN [\"true\"]\n"
	if err := os.WriteFile(dockerfilePath, []byte(dockerfileContent), 0o600); err != nil {
		return "", "", fmt.Errorf("fetch PDF renderer base image %s: write Dockerfile: %w", image, err)
	}
	return dockerfilePath, targetDir, nil
}
