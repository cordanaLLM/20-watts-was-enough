package clrsfixture

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/fileidentity"
	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/strictjson"
)

const (
	promiseLegacyProcedureVersion = "promise-wheel-reproduction-v2"
	promiseProcedureVersion       = "promise-wheel-reproduction-v3"
	promiseMaximumReceiptBytes    = int64(64 << 10)
	promiseMaximumRunOutputBytes  = int64(1 << 20)
	promiseMaximumOutputTarBytes  = int64(128 << 10)
	promiseCanonicalTarSHA256     = "460b0ce320c4da18784e97b99839a0ba74fa19e26e11320fc44037c791e38fe4"
	promiseCanonicalTarSize       = int64(108032)
)

type promiseInputs struct {
	manifest            GeneratorWheelhouseManifest
	manifestSHA256      string
	imageContractSHA256 string
	sourceTar           []byte
	wheels              [][]byte
	procedure           promiseProcedure
	producer            promiseProducer
}

// ReproducePromiseWheel builds the one locked source-built dependency twice.
// It never acquires inputs, publishes an image, or changes admission authority.
// A failure leaves its bounded diagnostic bundle without a success receipt.
func ReproducePromiseWheel(ctx context.Context, repositoryRoot, inputsDirectory, outputDirectory string) error {
	return reproducePromiseWheel(ctx, repositoryRoot, inputsDirectory, outputDirectory, localPromiseDocker{})
}

func reproducePromiseWheel(ctx context.Context, root, inputDirectory, output string, docker promiseDocker) error {
	inputs, err := readPromiseInputs(root, inputDirectory)
	if err != nil {
		return err
	}
	inputs.procedure, err = currentPromiseProcedure(root, inputs)
	if err != nil {
		return err
	}
	inputs.producer, err = currentPromiseProducer()
	if err != nil {
		return err
	}
	if err := ctx.Err(); err != nil {
		return err
	}
	bundle, err := newPromiseBundle(output, inputDirectory)
	if err != nil {
		return err
	}
	defer bundle.Close()
	err = runPromiseReproductions(ctx, root, inputs, bundle, docker)
	if err != nil {
		failure := struct {
			SchemaVersion int    `json:"schema_version"`
			Authority     string `json:"authority"`
			State         string `json:"state"`
			Error         string `json:"error"`
		}{1, ResultAuthority, "incomplete", boundedPromiseError(err)}
		body, encodeErr := strictjson.Canonical(failure)
		if encodeErr == nil {
			encodeErr = writePromiseFile(bundle, "failure.json", body)
		}
		return errors.Join(err, encodeErr)
	}
	return nil
}

func loadPromiseAuthority(root string) (promiseInputs, error) {
	foundation, err := CheckGeneratorImageFoundation(root)
	if err != nil {
		return promiseInputs{}, err
	}
	input, contract, lock, err := loadGeneratorWheelhouseInputs(root)
	if err != nil {
		return promiseInputs{}, err
	}
	root, err = cleanGeneratorRoot(root)
	if err != nil {
		return promiseInputs{}, err
	}
	body, err := readGeneratorFile(root, trackedGeneratorWheelhousePath, contract.Limits.WheelhouseManifestBytes)
	if err != nil {
		return promiseInputs{}, err
	}
	manifest, err := ParseGeneratorWheelhouseManifest(body, lock, input, contract)
	if err != nil {
		return promiseInputs{}, err
	}
	return promiseInputs{
		manifest: manifest, manifestSHA256: rawSHA256(body),
		imageContractSHA256: foundation.ImageContractSHA256,
	}, nil
}

func readPromiseInputs(root, directory string) (promiseInputs, error) {
	inputs, err := loadPromiseAuthority(root)
	if err != nil {
		return promiseInputs{}, err
	}
	directory, err = cleanGeneratorRoot(directory)
	if err != nil {
		return promiseInputs{}, fmt.Errorf("Promise input directory: %w", err)
	}
	source := inputs.manifest.SourceBuild
	body, err := readPromisePinnedFile(directory, "source-build-inputs/promise-2.3.tar.gz", source.SourceSHA256, source.SourceSizeBytes)
	if err != nil {
		return promiseInputs{}, err
	}
	for _, wheel := range source.BuildRequirements {
		wheelBody, err := readPromisePinnedFile(directory, "build-tools/"+wheel.Filename, wheel.SHA256, wheel.SizeBytes)
		if err != nil {
			return promiseInputs{}, err
		}
		inputs.wheels = append(inputs.wheels, wheelBody)
	}
	inputs.sourceTar, err = preparePromiseSource(body, source)
	if err != nil {
		return promiseInputs{}, fmt.Errorf("prepare Promise source: %w", err)
	}
	if rawSHA256(inputs.sourceTar) != promiseCanonicalTarSHA256 || int64(len(inputs.sourceTar)) != promiseCanonicalTarSize {
		return promiseInputs{}, errors.New("Promise canonical source transfer differs from the frozen preparation identity")
	}
	return inputs, nil
}

func readPromisePinnedFile(root, relative, digest string, size int64) ([]byte, error) {
	body, err := readGeneratorFile(root, relative, size)
	if err != nil {
		return nil, err
	}
	if int64(len(body)) != size || rawSHA256(body) != digest {
		return nil, fmt.Errorf("Promise input %s differs from its locked size or SHA-256", relative)
	}
	return body, nil
}

func newPromiseBundle(output, inputDirectory string) (*os.Root, error) {
	if output == "" {
		return nil, errors.New("Promise output directory is required")
	}
	absolute, err := filepath.Abs(output)
	if err != nil {
		return nil, err
	}
	parent, err := cleanGeneratorRoot(filepath.Dir(absolute))
	if err != nil || strings.ContainsAny(parent, ",\r\n") {
		return nil, errors.New("Promise output parent must be an existing real directory without mount separators")
	}
	input, err := cleanGeneratorRoot(inputDirectory)
	if err != nil {
		return nil, err
	}
	if relative, err := filepath.Rel(input, absolute); err == nil && (relative == "." ||
		(relative != ".." && !strings.HasPrefix(relative, ".."+string(filepath.Separator)))) {
		return nil, errors.New("Promise output must be outside the retained input directory")
	}
	parentRoot, err := os.OpenRoot(parent)
	if err != nil {
		return nil, err
	}
	defer parentRoot.Close()
	name := filepath.Base(absolute)
	if err := parentRoot.Mkdir(name, 0o700); err != nil {
		return nil, fmt.Errorf("create new Promise output directory: %w", err)
	}
	return parentRoot.OpenRoot(name)
}

func writePromiseFile(root *os.Root, name string, body []byte) error {
	if err := checkPromiseRootName(root); err != nil {
		return err
	}
	file, err := root.OpenFile(name, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o600)
	if err != nil {
		return fmt.Errorf("create Promise evidence %s: %w", name, err)
	}
	defer file.Close()
	if _, err := file.Write(body); err != nil {
		return err
	}
	if err := file.Sync(); err != nil {
		return err
	}
	if err := file.Chmod(0o444); err != nil {
		return err
	}
	if err := file.Close(); err != nil {
		return err
	}
	written, err := readGeneratorFile(root.Name(), name, int64(len(body)))
	if err != nil || !bytes.Equal(body, written) {
		return fmt.Errorf("Promise evidence %s readback differs", name)
	}
	return checkPromiseRootName(root)
}

func checkPromiseRootName(root *os.Root) error {
	held, err := root.Stat(".")
	if err != nil {
		return err
	}
	named, err := fileidentity.Lstat(root.Name())
	if err != nil || !named.IsDir() || named.Mode()&os.ModeSymlink != 0 || !os.SameFile(held, named) {
		return errors.New("Promise directory name no longer identifies the held root")
	}
	return nil
}

func boundedPromiseError(err error) string {
	message := err.Error()
	if len(message) > 4096 {
		return message[:4096] + " [diagnostic limit]"
	}
	return message
}
