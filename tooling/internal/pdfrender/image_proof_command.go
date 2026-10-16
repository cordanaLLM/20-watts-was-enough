package pdfrender

import (
	"context"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"runtime"
	"time"

	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/boundedexec"
)

const reproducibilityDockerEndpoint = "unix:///var/run/docker.sock"

type localReproducibilityExecutor struct{}

func newLocalReproducibilityExecutor() (localReproducibilityExecutor, error) {
	if runtime.GOOS != "linux" {
		return localReproducibilityExecutor{}, errors.New("renderer reproducibility requires the local Linux Docker socket")
	}
	information, err := os.Stat("/var/run/docker.sock")
	if err != nil || information.Mode()&os.ModeSocket == 0 {
		return localReproducibilityExecutor{}, errors.New("renderer reproducibility requires /var/run/docker.sock to be a local Unix socket")
	}
	return localReproducibilityExecutor{}, nil
}

func (localReproducibilityExecutor) run(ctx context.Context, request commandRequest) ([]byte, error) {
	if _, err := newLocalReproducibilityExecutor(); err != nil {
		return nil, err
	}
	request.arguments = pinnedReproducibilityArguments(request.arguments)
	return runDockerCommand(ctx, request, reproducibilityDockerEnvironment())
}

func pinnedReproducibilityArguments(arguments []string) []string {
	return append([]string{"--host", reproducibilityDockerEndpoint}, arguments...)
}

func reproducibilityDockerEnvironment() []string {
	// Keep only executable/plugin discovery, ordinary Docker credentials and
	// temporary-directory selection. No inherited daemon or builder routing.
	result := []string{"LANG=C.UTF-8", "LC_ALL=C.UTF-8", "TZ=UTC"}
	for _, name := range []string{"HOME", "PATH", "TMPDIR"} {
		if value, ok := os.LookupEnv(name); ok {
			result = append(result, name+"="+value)
		}
	}
	return result
}

func (localReproducibilityExecutor) inspectImageArchive(
	ctx context.Context, configuration Configuration, imageID, manifestDigest string,
) (ImageConfigProof, error) {
	if _, err := newLocalReproducibilityExecutor(); err != nil {
		return ImageConfigProof{}, err
	}
	command := exec.Command("docker", pinnedReproducibilityArguments([]string{
		"image", "save", "--platform", configuration.Lock.Platform, imageID,
	})...)
	command.Dir = configuration.RepositoryRoot
	command.Env = reproducibilityDockerEnvironment()
	return inspectImageProofCommand(ctx, command, imageID, manifestDigest, 120*time.Second)
}

func inspectImageProofCommand(
	parent context.Context, command *exec.Cmd, imageID, manifestDigest string, timeout time.Duration,
) (ImageConfigProof, error) {
	if timeout <= 0 || timeout > 120*time.Second {
		return ImageConfigProof{}, errors.New("invalid renderer image export timeout")
	}
	ctx, cancel := context.WithTimeout(parent, timeout)
	defer cancel()
	if err := ctx.Err(); err != nil {
		return ImageConfigProof{}, err
	}
	if err := configureImageProofProcess(command); err != nil {
		return ImageConfigProof{}, err
	}
	diagnostic := boundedexec.NewOutput(maximumDiagnosticBytes)
	command.Stderr = diagnostic
	command.WaitDelay = maximumWaitDelay
	output, err := command.StdoutPipe()
	if err != nil {
		return ImageConfigProof{}, err
	}
	if err := command.Start(); err != nil {
		_ = output.Close()
		return ImageConfigProof{}, err
	}
	cleanupDone := make(chan struct{})
	stop := context.AfterFunc(ctx, func() {
		defer close(cleanupDone)
		_ = output.Close()
		_ = killImageProofProcess(command)
	})
	defer func() {
		if !stop() {
			<-cleanupDone
		}
	}()
	proof, readError := inspectImageProof(ctx, output, imageID, manifestDigest)
	if readError != nil {
		_ = output.Close()
		_ = killImageProofProcess(command)
	}
	waitError := command.Wait()
	body, exceeded := diagnostic.Result()
	if exceeded {
		waitError = errors.Join(waitError, errors.New("renderer image export stderr exceeded its bound"))
	}
	if err := errors.Join(readError, waitError, ctx.Err()); err != nil {
		return ImageConfigProof{}, commandFailure("inspect renderer image config bytes", err, body)
	}
	return proof, nil
}

func inspectLoadedImageProof(ctx context.Context, configuration Configuration, executor commandExecutor, tag, imageID, manifestDigest string) (ImageConfigProof, error) {
	if _, err := inspectLoadedImageID(ctx, configuration, executor, tag, imageID); err != nil {
		return ImageConfigProof{}, err
	}
	observer, ok := executor.(imageArchiveExecutor)
	if !ok {
		return ImageConfigProof{}, errors.New("renderer executor has no bounded image-config proof adapter")
	}
	proof, err := observer.inspectImageArchive(ctx, configuration, imageID, manifestDigest)
	if err != nil {
		return ImageConfigProof{}, fmt.Errorf("verify loaded renderer image config: %w", err)
	}
	return proof, nil
}
