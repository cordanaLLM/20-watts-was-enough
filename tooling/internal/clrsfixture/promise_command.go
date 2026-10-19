package clrsfixture

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path"
	"reflect"
	"strings"
	"sync"
	"time"
)

type promiseDockerRequest struct {
	operation string
	arguments []string
	stdin     []byte
	limit     int64
}

type promiseDockerResult struct {
	stdout []byte
	stderr []byte
}

type promiseDocker interface {
	run(context.Context, promiseDockerRequest) (promiseDockerResult, error)
}

type localPromiseDocker struct{}

type promiseCapture struct {
	mutex     sync.Mutex
	remaining int64
	exceeded  bool
	cancel    context.CancelFunc
	stdout    bytes.Buffer
	stderr    bytes.Buffer
}

type promiseCaptureWriter struct {
	capture *promiseCapture
	stderr  bool
}

func (writer promiseCaptureWriter) Write(body []byte) (int, error) {
	capture := writer.capture
	capture.mutex.Lock()
	defer capture.mutex.Unlock()
	accepted := min(int64(len(body)), capture.remaining)
	if accepted > 0 {
		buffer := &capture.stdout
		if writer.stderr {
			buffer = &capture.stderr
		}
		_, _ = buffer.Write(body[:accepted])
		capture.remaining -= accepted
	}
	if accepted < int64(len(body)) {
		capture.exceeded = true
		capture.cancel()
	}
	return len(body), nil
}

func (localPromiseDocker) run(ctx context.Context, request promiseDockerRequest) (promiseDockerResult, error) {
	if request.operation == "" || len(request.arguments) == 0 || request.limit < 1 || request.limit > promiseMaximumRunOutputBytes ||
		len(request.stdin) > 256<<10 {
		return promiseDockerResult{}, errors.New("invalid bounded Promise Docker request")
	}
	commandContext, cancel := context.WithCancel(ctx)
	defer cancel()
	binary, err := exec.LookPath("docker")
	if err != nil {
		return promiseDockerResult{}, errors.New("Promise reproduction needs the local Docker CLI and preloaded pinned runtime")
	}
	command := exec.CommandContext(commandContext, binary, append([]string{"--context", "default"}, request.arguments...)...) //#nosec G204 -- fixed docker binary from LookPath and bounded arguments validated by caller
	command.Env = promiseHostEnvironment()
	command.Stdin = bytes.NewReader(request.stdin)
	command.WaitDelay = 2 * time.Second
	capture := &promiseCapture{remaining: request.limit, cancel: cancel}
	command.Stdout = promiseCaptureWriter{capture: capture}
	command.Stderr = promiseCaptureWriter{capture: capture, stderr: true}
	cleanup, err := configurePromiseProcess(command)
	if err != nil {
		return promiseDockerResult{}, err
	}
	runErr := command.Run()
	cleanupErr := cleanup()
	result := promiseDockerResult{capture.stdout.Bytes(), capture.stderr.Bytes()}
	if capture.exceeded {
		return result, errors.Join(errors.New("Promise Docker captured output exceeded its remaining byte budget"), cleanupErr)
	}
	return result, errors.Join(runErr, cleanupErr, ctx.Err())
}

func promiseHostEnvironment() []string {
	environment := []string{"LANG=C.UTF-8", "LC_ALL=C.UTF-8", "TZ=UTC"}
	for _, key := range []string{"HOME", "PATH", "XDG_RUNTIME_DIR"} {
		if value, present := os.LookupEnv(key); present {
			environment = append(environment, key+"="+value)
		}
	}
	return environment
}

type promiseCommandEvidence struct {
	Operation      string   `json:"operation"`
	Arguments      []string `json:"arguments"`
	StdinSHA256    string   `json:"stdin_sha256"`
	StdinSizeBytes int64    `json:"stdin_size_bytes"`
	Stdout         []byte   `json:"stdout"`
	Stderr         []byte   `json:"stderr"`
	Error          string   `json:"error"`
}

type promiseCommandLog struct {
	docker           promiseDocker
	entries          []promiseCommandEvidence
	workRemaining    int64
	cleanupRemaining int64
}

func newPromiseCommandLog(docker promiseDocker) *promiseCommandLog {
	return &promiseCommandLog{docker: docker, workRemaining: 768 << 10, cleanupRemaining: 64 << 10}
}

func (log *promiseCommandLog) execute(ctx context.Context, operation string, arguments []string, stdin []byte, cleanup bool) (promiseDockerResult, error) {
	remaining := &log.workRemaining
	if cleanup {
		remaining = &log.cleanupRemaining
	}
	limit := *remaining
	if operation == "read-wheel" {
		limit = min(limit, promiseMaximumOutputTarBytes)
	}
	if limit < 1 {
		return promiseDockerResult{}, errors.New("Promise captured output budget exhausted")
	}
	result, err := log.docker.run(ctx, promiseDockerRequest{operation: operation, arguments: arguments, stdin: stdin, limit: limit})
	size := int64(len(result.stdout) + len(result.stderr))
	if size > limit {
		result.stdout = bytes.Clone(result.stdout[:min(int64(len(result.stdout)), limit)])
		result.stderr = bytes.Clone(result.stderr[:min(int64(len(result.stderr)), limit-int64(len(result.stdout)))])
		err = errors.Join(err, errors.New("Promise Docker executor exceeded output bound"))
		size = int64(len(result.stdout) + len(result.stderr))
	}
	*remaining -= size
	entry := promiseCommandEvidence{Operation: operation, Arguments: arguments, StdinSHA256: rawSHA256(stdin),
		StdinSizeBytes: int64(len(stdin)), Stdout: result.stdout, Stderr: result.stderr}
	if err != nil {
		entry.Error = boundedPromiseError(err)
	}
	log.entries = append(log.entries, entry)
	return result, err
}

func validatePromiseCommandLog(body []byte, run promiseRunReceipt, procedure promiseProcedure) error {
	var entries []promiseCommandEvidence
	if err := decodeCanonicalGeneratorJSON(body, 6, &entries); err != nil {
		return fmt.Errorf("parse Promise command evidence: %w", err)
	}
	want := []string{"verify-endpoint", "verify-image", "create", "start", "copy-source", "bootstrap", "install", "build", "read-wheel", "find-owned", "inspect-owner", "remove", "verify-absence"}
	if len(entries) != len(want) {
		return errors.New("Promise command evidence has incomplete step coverage")
	}
	var size int64
	for index, entry := range entries {
		size += int64(len(entry.Stdout) + len(entry.Stderr))
		if entry.Operation != want[index] || entry.Error != "" || len(entry.Arguments) < 1 || len(entry.Arguments) > 100 ||
			entry.StdinSizeBytes < 0 || entry.StdinSizeBytes > 256<<10 || !lowerHex(entry.StdinSHA256, 64) {
			return errors.New("Promise command evidence contains an invalid or unsuccessful step")
		}
		if entry.Operation == "copy-source" && (entry.StdinSHA256 != run.SourceTarSHA256 || entry.StdinSizeBytes != run.SourceTarSizeBytes) {
			return errors.New("Promise source transfer differs from its run identity")
		}
		if entry.Operation != "copy-source" && (entry.StdinSizeBytes != 0 || entry.StdinSHA256 != rawSHA256(nil)) {
			return errors.New("Promise command evidence has unexpected stdin")
		}
		arguments, err := expectedPromiseArguments(entry, run, procedure)
		if err != nil || !reflect.DeepEqual(entry.Arguments, arguments) {
			return fmt.Errorf("Promise command %s argv differs from the fixed procedure", entry.Operation)
		}
	}
	if size > promiseMaximumRunOutputBytes || strings.TrimSpace(string(entries[2].Stdout)) != run.ContainerID ||
		len(bytes.TrimSpace(entries[len(entries)-1].Stdout)) != 0 {
		return errors.New("Promise command evidence exceeds limits or lacks container creation/removal readback")
	}
	if err := validatePromiseRuntimeEvidence(entries, run, procedure); err != nil {
		return err
	}
	wheel, err := parsePromiseOutput(entries[8].Stdout)
	if err != nil || rawSHA256(wheel) != run.Wheel.SHA256 {
		return errors.New("Promise retained container output does not contain the recorded wheel")
	}
	return nil
}

func expectedPromiseArguments(entry promiseCommandEvidence, run promiseRunReceipt, procedure promiseProcedure) ([]string, error) {
	inputs := promiseInputs{manifest: GeneratorWheelhouseManifest{Platform: procedure.Platform, SourceBuild: procedure.SourceBuild}}
	source := procedure.SourceBuild
	switch entry.Operation {
	case "verify-endpoint":
		return promiseEndpointArguments(), nil
	case "verify-image":
		return promiseImageArguments(inputs), nil
	case "create":
		wheels, err := promiseRecordedWheelhouse(entry.Arguments, run.Name)
		if err != nil {
			return nil, err
		}
		return promiseContainerArguments(inputs, run.Name, wheels), nil
	case "start":
		return []string{"container", "start", run.Name}, nil
	case "copy-source":
		return promiseTransferArguments(source, run.Name, "copy-source"), nil
	case "bootstrap":
		return promiseExecArguments(source, run.Name, "bootstrap", source.CandidateBootstrapCommand), nil
	case "install":
		return promiseExecArguments(source, run.Name, "install", source.CandidateInstallCommand), nil
	case "build":
		return promiseExecArguments(source, run.Name, "build", source.CandidateBuildCommand), nil
	case "read-wheel":
		return promiseTransferArguments(source, run.Name, "read-wheel"), nil
	case "find-owned", "verify-absence":
		return promiseListArguments(run.Name), nil
	case "inspect-owner":
		return promiseOwnerArguments(run.ContainerID), nil
	case "remove":
		return []string{"container", "rm", "--force", "--volumes", run.ContainerID}, nil
	}
	return nil, errors.New("unknown Promise command")
}

func promiseRecordedWheelhouse(arguments []string, name string) (string, error) {
	for index, argument := range arguments {
		if argument != "--mount" || index+1 == len(arguments) {
			continue
		}
		mount := arguments[index+1]
		mountPath, found := strings.CutPrefix(mount, "type=bind,src=")
		mountPath, suffix := strings.CutSuffix(mountPath, ",dst=/inputs/wheelhouse,readonly,bind-propagation=rprivate")
		if !found || !suffix || !path.IsAbs(mountPath) || path.Clean(mountPath) != mountPath ||
			strings.ContainsAny(mountPath, ",\r\n\\") || path.Base(mountPath) != "wheelhouse" || path.Base(path.Dir(mountPath)) != name {
			return "", errors.New("invalid private Promise wheelhouse mount path")
		}
		return mountPath, nil
	}
	return "", errors.New("missing private Promise wheelhouse mount")
}

func validatePromiseRuntimeEvidence(entries []promiseCommandEvidence, run promiseRunReceipt, procedure promiseProcedure) error {
	var endpoint string
	if decodeStrict(entries[0].Stdout, 2, &endpoint) != nil || !strings.HasPrefix(endpoint, "unix:///") {
		return errors.New("Promise retained endpoint is not local")
	}
	imageID, err := parsePromiseRuntime(promiseDockerResult{entries[1].Stdout, entries[1].Stderr}, procedure.Image)
	if err != nil || imageID != run.ImageID {
		return errors.New("Promise retained runtime image differs from the run identity")
	}
	if strings.TrimSpace(string(entries[9].Stdout)) != run.ContainerID ||
		strings.TrimSpace(string(entries[11].Stdout)) != run.ContainerID {
		return errors.New("Promise retained cleanup identities differ")
	}
	var owner struct {
		ID    string `json:"id"`
		Owner string `json:"owner"`
	}
	if decodeStrict(entries[10].Stdout, 3, &owner) != nil || owner.ID != run.ContainerID || owner.Owner != run.Name {
		return errors.New("Promise retained cleanup ownership differs")
	}
	for _, index := range []int{0, 1, 2, 8, 9, 10, 11, 12} {
		if len(entries[index].Stderr) != 0 {
			return errors.New("Promise retained inspection or cleanup wrote unexpected stderr")
		}
	}
	return nil
}
