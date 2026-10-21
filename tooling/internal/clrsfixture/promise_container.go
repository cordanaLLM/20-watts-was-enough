package clrsfixture

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"time"

	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/strictjson"
)

const promiseOwnershipLabel = "org.20watts.promise-reproduction"

func promiseTmpfs() []string {
	return []string{
		"/work:rw,nosuid,nodev,noexec,size=16777216,uid=65532,gid=65532,mode=0755",
		"/opt/build:rw,nosuid,nodev,size=134217728,uid=65532,gid=65532,mode=0755",
		"/output:rw,nosuid,nodev,noexec,size=1048576,uid=65532,gid=65532,mode=0755",
		"/tmp:rw,nosuid,nodev,noexec,size=16777216,uid=65532,gid=65532,mode=0700",
	}
}

func promiseEnvironment(source GeneratorWheelSourceBuild) []string {
	environment := []string{"PATH=/opt/build/bin:/usr/local/bin:/usr/bin:/bin", "HOME=/tmp", "TMPDIR=/tmp", "PYTHONNOUSERSITE=1"}
	return append(environment, source.CandidateEnvironment...)
}

func promiseContainerArguments(inputs promiseInputs, name, wheels string) []string {
	arguments := []string{
		"container", "create", "--name", name, "--label", promiseOwnershipLabel + "=" + name,
		"--platform", inputs.manifest.Platform, "--pull=never", "--network=none", "--read-only",
		"--user=65532:65532", "--cpus=1", "--memory=1073741824", "--memory-swap=1073741824",
		"--pids-limit=64", "--cap-drop=ALL", "--security-opt=no-new-privileges", "--restart=no",
		"--no-healthcheck", "--log-driver=none", "--ipc=none", "--stop-timeout=1",
		"--mount", "type=bind,src=" + wheels + ",dst=/inputs/wheelhouse,readonly,bind-propagation=rprivate",
		"--entrypoint=/usr/bin/env",
	}
	for _, mount := range promiseTmpfs() {
		arguments = append(arguments, "--tmpfs", mount)
	}
	arguments = append(arguments, inputs.manifest.SourceBuild.BuilderImage, "-i")
	arguments = append(arguments, promiseEnvironment(inputs.manifest.SourceBuild)...)
	return append(arguments, "/bin/sleep", "120")
}

func promiseExecArguments(source GeneratorWheelSourceBuild, name, operation string, command []string) []string {
	arguments := []string{"container", "exec", "--user=65532:65532"}
	if operation == "copy-source" {
		arguments = append(arguments, "--interactive")
	}
	if operation == "build" {
		arguments = append(arguments, "--workdir", source.CandidateWorkingDirectory)
	} else {
		arguments = append(arguments, "--workdir", "/work")
	}
	arguments = append(arguments, name, "/usr/bin/env", "-i")
	arguments = append(arguments, promiseEnvironment(source)...)
	return append(arguments, command...)
}

func runPromiseReproductions(ctx context.Context, root string, inputs promiseInputs, bundle *os.Root, docker promiseDocker) error {
	receipt := promiseReceipt{
		SchemaVersion: 1, Authority: ResultAuthority, State: "two-build-byte-match", GeneratorImageState: "blocked",
		WheelhouseSHA256: inputs.manifestSHA256, ImageContractSHA256: inputs.imageContractSHA256,
		Procedure: inputs.procedure, Producer: inputs.producer,
	}
	for index := 1; index <= 2; index++ {
		run, err := runPromiseContainer(ctx, inputs, bundle, docker, index)
		if err != nil {
			return fmt.Errorf("Promise reproduction %d: %w", index, err)
		}
		receipt.Runs = append(receipt.Runs, run)
	}
	if err := validatePromiseReceipt(receipt, inputs, inputs.procedure); err != nil {
		return err
	}
	for _, run := range receipt.Runs {
		if err := checkPromiseRunFiles(bundle.Name(), run, inputs.procedure); err != nil {
			return err
		}
	}
	if err := recheckPromiseAuthority(root, inputs); err != nil {
		return err
	}
	if err := ctx.Err(); err != nil {
		return err
	}
	body, err := strictjson.Canonical(receipt)
	if err != nil {
		return err
	}
	if int64(len(body)) > promiseMaximumReceiptBytes {
		return errors.New("Promise reproduction receipt exceeds its byte limit")
	}
	return writePromiseFile(bundle, "receipt.json", body)
}

func recheckPromiseAuthority(root string, before promiseInputs) error {
	after, err := loadPromiseAuthority(root)
	if err != nil {
		return err
	}
	procedure, err := currentPromiseProcedure(root, after)
	if err != nil {
		return err
	}
	if before.manifestSHA256 != after.manifestSHA256 || before.imageContractSHA256 != after.imageContractSHA256 ||
		!reflect.DeepEqual(before.procedure, procedure) {
		return errors.New("Promise authority or implementation changed during reproduction; no success receipt written")
	}
	return nil
}

func runPromiseContainer(ctx context.Context, inputs promiseInputs, bundle *os.Root, docker promiseDocker, index int) (receipt promiseRunReceipt, runErr error) {
	name, err := newPromiseContainerName()
	if err != nil {
		return receipt, err
	}
	runDirectory := fmt.Sprintf("run-%d", index)
	if err := bundle.Mkdir(runDirectory, 0o700); err != nil {
		return receipt, err
	}
	receipt = promiseRunReceipt{Index: index, Name: name, SourceTarSHA256: rawSHA256(inputs.sourceTar), SourceTarSizeBytes: int64(len(inputs.sourceTar))}
	log := newPromiseCommandLog(docker)
	staging, err := stagePromiseWheels(bundle, name, inputs)
	if err != nil {
		return receipt, err
	}
	defer func() {
		runErr = errors.Join(runErr, finalizePromiseStagingAndLog(bundle, name, staging, log, runDirectory, &receipt))
	}()
	runContext, cancel := context.WithTimeout(ctx, 120*time.Second)
	defer cancel()
	imageID, err := inspectPromiseRuntime(runContext, inputs, log)
	if err != nil {
		return receipt, err
	}
	receipt.ImageID = imageID
	defer func() {
		cleanupContext, cleanupCancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cleanupCancel()
		cleanupErr := cleanupPromiseContainer(cleanupContext, log, name, receipt.ContainerID)
		receipt.CleanupVerified = cleanupErr == nil
		runErr = errors.Join(runErr, cleanupErr)
	}()
	containerID, err := createAndStartPromiseContainer(runContext, log, inputs, name, staging)
	receipt.ContainerID = containerID
	if err != nil {
		return receipt, err
	}
	wheel, err := buildAndReadPromiseWheel(runContext, log, inputs.manifest.SourceBuild, name, inputs.sourceTar)
	if err != nil {
		return receipt, err
	}
	if err := runContext.Err(); err != nil {
		return receipt, err
	}
	wheelPath := runDirectory + "/" + promiseWheelFilename
	if err := writePromiseFile(bundle, wheelPath, wheel); err != nil {
		return receipt, err
	}
	receipt.Wheel = promiseIdentity(wheelPath, wheel)
	receipt.LicenseSHA256 = promiseLicenseSHA256
	return receipt, nil
}

func finalizePromiseStagingAndLog(bundle *os.Root, name string, staging *os.Root, log *promiseCommandLog, runDirectory string, receipt *promiseRunReceipt) error {
	cleanupErr := removePromiseStaging(bundle, name, staging)
	receipt.StagingRemoved = cleanupErr == nil
	body, encodeErr := strictjson.Canonical(log.entries)
	if encodeErr == nil && len(body) > 2<<20 {
		encodeErr = errors.New("Promise command evidence exceeds its byte limit")
	}
	logPath := runDirectory + "/commands.json"
	if encodeErr == nil {
		encodeErr = writePromiseFile(bundle, logPath, body)
	}
	receipt.Log = promiseIdentity(logPath, body)
	return errors.Join(cleanupErr, encodeErr)
}

func createAndStartPromiseContainer(runContext context.Context, log *promiseCommandLog, inputs promiseInputs, name string, staging *os.Root) (string, error) {
	result, err := log.execute(runContext, "create", promiseContainerArguments(inputs, name, filepath.Join(staging.Name(), "wheelhouse")), nil, false)
	if err != nil {
		return "", err
	}
	containerID := strings.TrimSpace(string(result.stdout))
	if !lowerHex(containerID, 64) || len(result.stderr) != 0 {
		return "", errors.New("Promise container create returned an invalid identity")
	}
	if _, err := log.execute(runContext, "start", []string{"container", "start", name}, nil, false); err != nil {
		return containerID, err
	}
	return containerID, nil
}

func buildAndReadPromiseWheel(runContext context.Context, log *promiseCommandLog, source GeneratorWheelSourceBuild, name string, sourceTar []byte) ([]byte, error) {
	if _, err := log.execute(runContext, "copy-source", promiseTransferArguments(source, name, "copy-source"), sourceTar, false); err != nil {
		return nil, err
	}
	if err := executePromiseBuild(runContext, log, source, name); err != nil {
		return nil, err
	}
	result, err := log.execute(runContext, "read-wheel", promiseTransferArguments(source, name, "read-wheel"), nil, false)
	if err != nil {
		return nil, err
	}
	if len(result.stderr) != 0 {
		return nil, errors.New("Promise wheel readback wrote unexpected stderr")
	}
	return parsePromiseOutput(result.stdout)
}

func executePromiseBuild(ctx context.Context, log *promiseCommandLog, source GeneratorWheelSourceBuild, name string) error {
	steps := []struct {
		name    string
		command []string
	}{
		{"bootstrap", source.CandidateBootstrapCommand},
		{"install", source.CandidateInstallCommand},
		{"build", source.CandidateBuildCommand},
	}
	for _, step := range steps {
		if _, err := log.execute(ctx, step.name, promiseExecArguments(source, name, step.name, step.command), nil, false); err != nil {
			return fmt.Errorf("Promise %s: %w", step.name, err)
		}
	}
	return nil
}

func inspectPromiseRuntime(ctx context.Context, inputs promiseInputs, log *promiseCommandLog) (string, error) {
	result, err := log.execute(ctx, "verify-endpoint", promiseEndpointArguments(), nil, false)
	if err != nil {
		return "", err
	}
	var endpoint string
	if decodeStrict(result.stdout, 2, &endpoint) != nil || !strings.HasPrefix(endpoint, "unix:///") || len(result.stderr) != 0 {
		return "", errors.New("Promise reproduction requires the default local Unix Docker endpoint")
	}
	result, err = log.execute(ctx, "verify-image", promiseImageArguments(inputs), nil, false)
	if err != nil {
		return "", err
	}
	return parsePromiseRuntime(result, inputs.manifest.SourceBuild.BuilderImage)
}

func promiseEndpointArguments() []string {
	return []string{"context", "inspect", "default", "--format", "{{json .Endpoints.docker.Host}}"}
}

func promiseImageArguments(inputs promiseInputs) []string {
	format := `{"id":{{json .Id}},"os":{{json .Os}},"architecture":{{json .Architecture}},"digests":{{json .RepoDigests}},"volumes":{{json (index .Config "Volumes")}}}`
	return []string{"image", "inspect", "--platform", inputs.manifest.Platform, "--format", format, inputs.manifest.SourceBuild.BuilderImage}
}

func parsePromiseRuntime(result promiseDockerResult, image string) (string, error) {
	var identity struct {
		ID           string                     `json:"id"`
		OS           string                     `json:"os"`
		Architecture string                     `json:"architecture"`
		Digests      []string                   `json:"digests"`
		Volumes      map[string]json.RawMessage `json:"volumes"`
	}
	if decodeStrict(result.stdout, 4, &identity) != nil || len(result.stderr) != 0 || identity.OS != "linux" ||
		identity.Architecture != "amd64" || !strings.HasPrefix(identity.ID, "sha256:") ||
		!lowerHex(strings.TrimPrefix(identity.ID, "sha256:"), 64) || len(identity.Volumes) != 0 || len(identity.Digests) > 32 {
		return "", errors.New("Promise runtime is not the exact Linux amd64 image without implicit volumes")
	}
	_, digest, found := strings.Cut(image, "@")
	for _, reference := range identity.Digests {
		if found && strings.HasSuffix(reference, "@"+digest) {
			return identity.ID, nil
		}
	}
	return "", errors.New("Promise locally available runtime does not report the pinned repository digest")
}

func cleanupPromiseContainer(ctx context.Context, log *promiseCommandLog, name, expectedID string) error {
	list := promiseListArguments(name)
	result, err := log.execute(ctx, "find-owned", list, nil, true)
	if err != nil || len(result.stderr) != 0 {
		return errors.Join(err, errors.New("cannot determine owned Promise container before cleanup"))
	}
	identity := strings.TrimSpace(string(result.stdout))
	if identity == "" {
		return nil
	}
	if !lowerHex(identity, 64) || (expectedID != "" && identity != expectedID) {
		return errors.New("Promise cleanup found an unexpected container identity; no removal attempted")
	}
	result, err = log.execute(ctx, "inspect-owner", promiseOwnerArguments(identity), nil, true)
	var owner struct {
		ID    string `json:"id"`
		Owner string `json:"owner"`
	}
	if err != nil || len(result.stderr) != 0 || decodeStrict(result.stdout, 3, &owner) != nil || owner.ID != identity || owner.Owner != name {
		return errors.Join(err, errors.New("Promise cleanup ownership label does not match; no removal attempted"))
	}
	if _, err := log.execute(ctx, "remove", []string{"container", "rm", "--force", "--volumes", identity}, nil, true); err != nil {
		return err
	}
	result, err = log.execute(ctx, "verify-absence", list, nil, true)
	if err != nil || len(bytes.TrimSpace(result.stdout)) != 0 || len(result.stderr) != 0 {
		return errors.Join(err, errors.New("Promise container absence was not verified"))
	}
	return nil
}

func promiseListArguments(name string) []string {
	return []string{"container", "ls", "--all", "--no-trunc", "--filter", "name=^/" + name + "$", "--format", "{{.ID}}"}
}

func promiseOwnerArguments(identity string) []string {
	format := `{"id":{{json .Id}},"owner":{{json (index .Config.Labels "` + promiseOwnershipLabel + `")}}}`
	return []string{"container", "inspect", "--format", format, identity}
}

func newPromiseContainerName() (string, error) {
	var identifier [16]byte
	if _, err := rand.Read(identifier[:]); err != nil {
		return "", err
	}
	return "20w-promise-" + hex.EncodeToString(identifier[:]), nil
}

func validPromiseContainerName(name string) bool {
	return strings.HasPrefix(name, "20w-promise-") && lowerHex(strings.TrimPrefix(name, "20w-promise-"), 32)
}

func stagePromiseWheels(bundle *os.Root, name string, inputs promiseInputs) (*os.Root, error) {
	if !validPromiseContainerName(name) {
		return nil, errors.New("invalid Promise staging identity")
	}
	if err := bundle.Mkdir(name, 0o700); err != nil {
		return nil, err
	}
	staging, err := bundle.OpenRoot(name)
	if err != nil {
		return nil, err
	}
	if err := staging.Mkdir("wheelhouse", 0o755); err != nil {
		return nil, errors.Join(err, removePromiseStaging(bundle, name, staging))
	}
	if err := staging.Chmod("wheelhouse", 0o755); err != nil {
		return nil, errors.Join(err, removePromiseStaging(bundle, name, staging))
	}
	for index, wheel := range inputs.manifest.SourceBuild.BuildRequirements {
		if err := writePromiseFile(staging, "wheelhouse/"+wheel.Filename, inputs.wheels[index]); err != nil {
			return nil, errors.Join(err, removePromiseStaging(bundle, name, staging))
		}
	}
	return staging, nil
}

func removePromiseStaging(bundle *os.Root, name string, staging *os.Root) error {
	defer staging.Close()
	held, err := staging.Stat(".")
	if err != nil {
		return err
	}
	named, err := bundle.Lstat(name)
	if err != nil || !named.IsDir() || !os.SameFile(held, named) {
		return errors.New("Promise staging identity changed; cleanup left it untouched")
	}
	if err := bundle.RemoveAll(name); err != nil {
		return fmt.Errorf("remove owned Promise staging: %w", err)
	}
	if _, err := bundle.Lstat(name); !errors.Is(err, os.ErrNotExist) {
		return errors.New("Promise staging removal was not verified")
	}
	return nil
}
