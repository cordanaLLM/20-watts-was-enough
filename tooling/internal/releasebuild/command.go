package releasebuild

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os/exec"
	"sort"
	"strings"
	"sync"

	projectbuildinfo "github.com/cordanaLLM/20-watts-was-enough/tooling/internal/buildinfo"
)

type boundedOutput struct {
	mutex    sync.Mutex
	buffer   bytes.Buffer
	limit    int
	exceeded bool
}

func newBoundedOutput(limit int) *boundedOutput {
	return &boundedOutput{limit: limit}
}

func (output *boundedOutput) Write(bytesToWrite []byte) (int, error) {
	output.mutex.Lock()
	defer output.mutex.Unlock()
	available := output.limit - output.buffer.Len()
	if available > len(bytesToWrite) {
		available = len(bytesToWrite)
	}
	if available > 0 {
		_, _ = output.buffer.Write(bytesToWrite[:available])
	}
	if available < len(bytesToWrite) {
		output.exceeded = true
	}
	return len(bytesToWrite), nil
}

func (output *boundedOutput) result() commandResult {
	output.mutex.Lock()
	defer output.mutex.Unlock()
	return commandResult{
		output:   bytes.Clone(output.buffer.Bytes()),
		exceeded: output.exceeded,
	}
}

type commandResult struct {
	output   []byte
	exceeded bool
}

func runBoundedCommand(ctx context.Context, directory string, environment []string, executable string, arguments ...string) (commandResult, error) {
	commandContext, cancel := context.WithTimeout(ctx, maximumCommandDuration)
	defer cancel()
	output := newBoundedOutput(maximumCommandOutputBytes)
	command := exec.CommandContext(commandContext, executable, arguments...)
	command.Dir = directory
	command.Env = environment
	command.Stdout = output
	command.Stderr = output
	command.WaitDelay = maximumCommandWaitDelay
	err := command.Run()
	result := output.result()
	if commandContext.Err() != nil {
		return result, commandContext.Err()
	}
	if result.exceeded {
		return result, fmt.Errorf("subprocess output exceeds %d bytes", maximumCommandOutputBytes)
	}
	return result, err
}

func commandError(operation string, err error, result commandResult) error {
	diagnostic := strings.TrimSpace(string(result.output))
	if diagnostic == "" {
		return fmt.Errorf("%s: %w", operation, err)
	}
	return fmt.Errorf("%s: %w: %s", operation, err, diagnostic)
}

func closedBuildEnvironment(environment []string, artifact Artifact) []string {
	filtered := make([]string, 0, len(environment)+16)
	for _, entry := range environment {
		name, _, found := strings.Cut(entry, "=")
		upperName := strings.ToUpper(name)
		if found && (upperName == "CGO_ENABLED" || strings.HasPrefix(upperName, "GO")) {
			continue
		}
		filtered = append(filtered, entry)
	}
	sort.Strings(filtered)
	return append(filtered,
		"CGO_ENABLED=0",
		"GOAMD64=v1",
		"GOARCH="+artifact.Arch,
		"GOARM64=v8.0",
		"GOENV=off",
		"GOEXPERIMENT=",
		"GOFIPS140=off",
		"GOFLAGS=",
		"GONOPROXY=",
		"GONOSUMDB=",
		"GOPRIVATE=",
		"GOPROXY=off",
		"GOSUMDB=off",
		"GOOS="+artifact.OS,
		"GOTOOLCHAIN=local",
		"GOWORK=off",
	)
}

func exerciseArtifact(ctx context.Context, path string, artifact Artifact, options Options) error {
	result, err := runBoundedCommand(ctx, "", []string{"LANG=C", "LC_ALL=C", "TZ=UTC"}, path, "version", "--json")
	if err != nil {
		return commandError("exercise "+artifact.Name, err, result)
	}
	decoder := json.NewDecoder(bytes.NewReader(result.output))
	decoder.DisallowUnknownFields()
	var identity projectbuildinfo.Info
	if err := decoder.Decode(&identity); err != nil {
		return fmt.Errorf("decode %s version identity: %w", artifact.Name, err)
	}
	if err := rejectTrailingJSON(decoder); err != nil {
		return fmt.Errorf("decode %s version identity: %w", artifact.Name, err)
	}
	expected := projectbuildinfo.Info{
		Version:      options.Version,
		Revision:     options.Revision,
		BuiltAt:      options.BuiltAt,
		GoVersion:    releaseGoVersion,
		OperatingSys: artifact.OS,
		Architecture: artifact.Arch,
	}
	if identity != expected {
		return fmt.Errorf("%s reported unexpected build identity: %+v", artifact.Name, identity)
	}
	return nil
}

func rejectTrailingJSON(decoder *json.Decoder) error {
	var trailing any
	err := decoder.Decode(&trailing)
	if errors.Is(err, io.EOF) {
		return nil
	}
	if err != nil {
		return err
	}
	return errors.New("unexpected trailing JSON value")
}
