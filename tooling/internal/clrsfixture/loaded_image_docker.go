package clrsfixture

import (
	"context"
	"errors"
	"fmt"
	"os/exec"
	"path/filepath"
	"slices"
	"strings"
	"time"
)

type loadedImageObserver struct {
	execute  generationExecutor
	commands []generationCommandEvidence
}

func (observer *loadedImageObserver) command(ctx context.Context, args ...string) (generationCommandEvidence, error) {
	if len(observer.commands) >= 4 || !loadedImageReadOnlyArguments(args) {
		return generationCommandEvidence{ExitCode: -1}, errors.New("loaded-image read-only command budget or allowlist exceeded")
	}
	if err := ctx.Err(); err != nil {
		return generationCommandEvidence{ExitCode: -1}, err
	}
	child, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()
	record, err := observer.execute(child, args, nil, 64<<10)
	if record.Error != "" && err != nil && len(record.Error) <= 4096 && record.Error != boundedGenerationError(err) {
		err = errors.Join(err, errors.New("loaded-image recorded diagnostic differs from its execution error"))
	}
	if len(record.Stdout) > 64<<10 || len(record.Stdout)+len(record.Stderr) > 1<<20 || len(record.Arguments) > 16 {
		record = generationCommandEvidence{ExitCode: -1, Error: "loaded-image executor exceeded its captured-output boundary"}
		err = errors.Join(err, errors.New(record.Error))
	}
	want := append([]string{"--host", generationDockerEndpoint}, args...)
	if len(record.Arguments) != len(want)+1 || !filepath.IsAbs(record.Arguments[0]) || len(record.Arguments[0]) > 4096 || !slices.Equal(record.Arguments[1:], want) {
		err = errors.Join(err, errors.New("loaded-image command evidence differs from the fixed local invocation"))
	}
	if len(record.Error) > 4096 {
		record.Error = boundedGenerationError(errors.New(record.Error))
		err = errors.Join(err, errors.New("loaded-image executor diagnostic exceeded its boundary"))
	}
	if err == nil && (record.ExitCode != 0 || record.Error != "") {
		err = errors.New("loaded-image command returned a failed recorded status")
	}
	err = errors.Join(err, child.Err())
	if err != nil {
		record.Error = boundedGenerationError(err)
	}
	observer.commands = append(observer.commands, record)
	return record, err
}

func loadedImageReadOnlyArguments(args []string) bool {
	if slices.Equal(args, []string{"version", "--format", "{{.Client.Version}} {{.Server.Version}}"}) ||
		slices.Equal(args, []string{"info", "--format", "{{json .}}"}) {
		return true
	}
	return len(args) == 5 && slices.Equal(args[:4], []string{"image", "inspect", "--format", "{{json .}}"}) && generationImageDigest(args[4])
}

func (observer *loadedImageObserver) inspect(ctx context.Context, proof GeneratorOCIReport, runtime GeneratorRuntime) (string, error) {
	record, err := observer.command(ctx, "version", "--format", "{{.Client.Version}} {{.Server.Version}}")
	if err != nil {
		return "", err
	}
	if len(record.Stderr) != 0 || strings.TrimSpace(string(record.Stdout)) != "29.7.2 29.7.2" {
		return "", errors.New("loaded-image preparation requires the reviewed Docker 29.7.2 client and server without control stderr")
	}
	record, err = observer.command(ctx, "info", "--format", "{{json .}}")
	if err != nil {
		return "", err
	}
	if len(record.Stderr) != 0 {
		return "", errors.New("Docker info wrote unexpected stderr")
	}
	if err := validateGenerationDockerInfo(record.Stdout); err != nil {
		return "", err
	}
	loaded := ""
	for _, digest := range []string{proof.Manifest.Digest, proof.Config.Digest} {
		record, err := observer.command(ctx, "image", "inspect", "--format", "{{json .}}", digest)
		if ctx.Err() != nil {
			return "", errors.Join(err, ctx.Err())
		}
		if loadedImageMissing(record, err, digest) {
			continue
		}
		if err != nil {
			return "", fmt.Errorf("inspect loaded image %s: %w", digest, err)
		}
		if len(record.Stderr) != 0 {
			return "", errors.New("loaded image inspection wrote unexpected stderr")
		}
		id, err := bindLoadedImageInspection(record.Stdout, proof, runtime)
		if err != nil {
			return "", err
		}
		if loaded != "" && loaded != id {
			return "", errors.New("manifest and config lookups resolved to different loaded image IDs")
		}
		loaded = id
	}
	if loaded == "" {
		return "", errors.New("neither exact image identity is already loaded; no image was acquired")
	}
	return loaded, ctx.Err()
}

func loadedImageMissing(record generationCommandEvidence, err error, digest string) bool {
	return record.ExitCode == 1 && loadedImageOnlyExitError(err) && strings.TrimSpace(string(record.Stdout)) == "" &&
		strings.TrimSpace(string(record.Stderr)) == "Error response from daemon: No such image: "+digest
}

// The shared executor joins process, cancellation and cleanup errors. Only an
// ordinary exit-1 process error is an absence observation; matching daemon text
// must never hide any additional command-contract or lifecycle failure.
func loadedImageOnlyExitError(err error) bool {
	remaining := 16
	return loadedImageExitCauses(err, &remaining)
}

func loadedImageExitCauses(err error, remaining *int) bool {
	if err == nil || remaining == nil || *remaining <= 0 {
		return false
	}
	stack := []error{err}
	limit := *remaining
	for step := 0; step < limit && len(stack) > 0; step++ {
		*remaining--
		current := stack[len(stack)-1]
		stack = stack[:len(stack)-1]
		if value, ok := current.(*exec.ExitError); ok {
			if value.ProcessState == nil || value.ExitCode() != 1 {
				return false
			}
			continue
		}
		if value, ok := current.(interface{ Unwrap() []error }); ok {
			causes := value.Unwrap()
			if len(causes) == 0 {
				return false
			}
			for i := len(causes) - 1; i >= 0; i-- {
				stack = append(stack, causes[i])
			}
			continue
		}
		return false
	}
	return len(stack) == 0
}

func bindLoadedImageInspection(body []byte, proof GeneratorOCIReport, runtime GeneratorRuntime) (string, error) {
	object, err := generationInspectionObject(body, "Id Os Architecture Config RootFS", "")
	if err != nil {
		return "", err
	}
	id := jsonString(object, "Id")
	expected, err := parseGenerationRunImage(proof.ManifestBytes, proof.ConfigBytes, GeneratorFixtureImage{
		LoadedID: id, ManifestDigest: proof.Manifest.Digest, ConfigDigest: proof.Config.Digest}, runtime)
	if err != nil {
		return "", err
	}
	if err := validateGenerationImageInspection(body, expected); err != nil {
		return "", err
	}
	return id, nil
}
