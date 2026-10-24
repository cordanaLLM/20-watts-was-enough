package pdftools

import (
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"time"

	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/boundedexec"
	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/fileidentity"
)

const maximumDockerWaitDelay = 5 * time.Second

type dockerRequest struct {
	operation   string
	directory   string
	timeout     time.Duration
	output      int64
	arguments   []string
	files       []boundedDockerFile
	directories []boundedDockerDirectory
}

type boundedDockerFile struct {
	path    string
	maximum int64
	label   string
}

type boundedDockerDirectory struct {
	path           string
	maximum        int64
	maximumEntries int
	maximumDepth   int
	label          string
}

type dockerResult struct {
	stdout []byte
	stderr []byte
}

type dockerExecutor interface {
	run(context.Context, dockerRequest) (dockerResult, error)
}

type localDockerExecutor struct{}

func verifyLocalDockerEndpoint(
	ctx context.Context,
	executor dockerExecutor,
	authority checkedAuthority,
) error {
	result, err := executor.run(ctx, dockerRequest{
		operation: "verify local Docker endpoint",
		directory: authority.root,
		timeout:   30 * time.Second,
		output:    authority.contract.Limits.CapturedOutputBytes,
		arguments: []string{"context", "inspect", "default", "--format", "{{json .Endpoints.docker.Host}}"},
	})
	if err != nil {
		return err
	}
	if len(result.stderr) != 0 {
		return errors.New("Docker context inspection wrote unexpected stderr")
	}
	endpoint, err := decodeArtifactJSON[string](result.stdout, 4, "Docker endpoint")
	if err != nil {
		return err
	}
	if !strings.HasPrefix(endpoint, "unix://") && !strings.HasPrefix(endpoint, "npipe://") {
		return errors.New("Docker default context is not a local Unix socket or Windows named pipe")
	}
	return nil
}

func (localDockerExecutor) run(ctx context.Context, request dockerRequest) (dockerResult, error) {
	if request.operation == "" || request.timeout <= 0 || request.output <= 0 || len(request.arguments) == 0 {
		return dockerResult{}, errors.New("invalid bounded Docker request")
	}
	timeoutContext, timeoutCancel := context.WithTimeout(ctx, request.timeout)
	defer timeoutCancel()
	commandContext, commandCancel := context.WithCancelCause(timeoutContext)
	defer commandCancel(nil)
	stdout := boundedexec.NewOutput(int(request.output))
	stderr := boundedexec.NewOutput(int(request.output))
	dockerBinary, err := exec.LookPath("docker")
	if err != nil {
		return dockerResult{}, errors.New("Docker CLI is required for local PDF-tools reproduction")
	}
	arguments := append([]string{"--context", "default"}, request.arguments...)
	command := exec.CommandContext(commandContext, dockerBinary, arguments...) //#nosec G204 -- fixed docker binary from LookPath and bounded arguments validated by caller
	command.Dir = request.directory
	command.Env = boundedDockerEnvironment()
	command.Stdout = stdout
	command.Stderr = stderr
	command.WaitDelay = maximumDockerWaitDelay
	monitorDone := make(chan error, 1)
	go monitorBoundedDockerOutputs(commandContext, commandCancel, request.files, request.directories, monitorDone)
	err = command.Run()
	commandCause := context.Cause(commandContext)
	commandCancel(nil)
	monitorError := <-monitorDone
	stdoutBody, stdoutExceeded := stdout.Result()
	stderrBody, stderrExceeded := stderr.Result()
	result := dockerResult{stdout: stdoutBody, stderr: stderrBody}
	if monitorError != nil {
		return result, fmt.Errorf("%s: %w", request.operation, monitorError)
	}
	if commandCause != nil {
		return result, fmt.Errorf("%s: %w", request.operation, commandCause)
	}
	if stdoutExceeded || stderrExceeded {
		return result, fmt.Errorf("%s: Docker output exceeds %d bytes per stream", request.operation, request.output)
	}
	if err != nil {
		return result, dockerCommandFailure(request.operation, err, result)
	}
	return result, nil
}

func boundedDockerEnvironment() []string {
	wanted := []string{"HOME", "PATH", "TEMP", "TMP", "USERPROFILE", "XDG_RUNTIME_DIR"}
	if runtime.GOOS == "windows" {
		wanted = append(wanted, "COMSPEC", "PATHEXT", "SYSTEMROOT")
	}
	environment := make([]string, 0, len(wanted)+3)
	for _, name := range wanted {
		if value := os.Getenv(name); value != "" && !strings.ContainsRune(value, '\x00') {
			environment = append(environment, name+"="+value)
		}
	}
	return append(environment, "LANG=C.UTF-8", "LC_ALL=C.UTF-8", "TZ=UTC")
}

func monitorBoundedDockerOutputs(
	ctx context.Context,
	cancel context.CancelCauseFunc,
	files []boundedDockerFile,
	directories []boundedDockerDirectory,
	done chan<- error,
) {
	if len(files) == 0 && len(directories) == 0 {
		done <- nil
		return
	}
	ticker := time.NewTicker(50 * time.Millisecond)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			done <- validateBoundedDockerOutputs(files, directories)
			return
		case <-ticker.C:
			if err := validateBoundedDockerOutputs(files, directories); err != nil {
				cancel(err)
				done <- err
				return
			}
		}
	}
}

func validateBoundedDockerOutputs(files []boundedDockerFile, directories []boundedDockerDirectory) error {
	for _, file := range files {
		if file.path == "" || file.maximum <= 0 || file.label == "" {
			return errors.New("invalid Docker output-file boundary")
		}
		information, err := fileidentity.Lstat(file.path)
		if errors.Is(err, os.ErrNotExist) {
			continue
		}
		if err != nil {
			return fmt.Errorf("inspect bounded %s: %w", file.label, err)
		}
		if !information.Mode().IsRegular() || information.Mode()&os.ModeSymlink != 0 {
			return fmt.Errorf("%s output is not a regular file", file.label)
		}
		if information.Size() > file.maximum {
			return fmt.Errorf("%s output exceeds %d bytes", file.label, file.maximum)
		}
	}
	for _, directory := range directories {
		if err := validateBoundedDockerDirectory(directory); err != nil {
			return err
		}
	}
	return nil
}

func validateBoundedDockerDirectory(directory boundedDockerDirectory) error {
	if directory.path == "" || directory.maximum <= 0 || directory.maximumEntries <= 0 ||
		directory.maximumDepth <= 0 || directory.label == "" {
		return errors.New("invalid Docker output-directory boundary")
	}
	var bytes int64
	if _, err := fileidentity.Lstat(directory.path); errors.Is(err, os.ErrNotExist) {
		return nil
	} else if err != nil {
		return fmt.Errorf("inspect bounded %s: %w", directory.label, err)
	}
	err := walkBoundedTree(
		directory.path,
		directory.maximumEntries,
		directory.maximumDepth,
		func(_ string, _ string, information os.FileInfo) error {
			if information.Mode().IsRegular() {
				bytes += information.Size()
				if bytes > directory.maximum {
					return fmt.Errorf("%s output exceeds its aggregate-byte boundary", directory.label)
				}
			}
			return nil
		},
	)
	if err != nil {
		return fmt.Errorf("inspect bounded %s: %w", directory.label, err)
	}
	return nil
}

// walkBoundedTree enumerates directory entries in fixed-size batches so the
// entry limit applies before a filesystem can force an unbounded ReadDir or
// filepath.WalkDir allocation. The callback excludes root itself.
func walkBoundedTree(
	root string,
	maximumEntries, maximumDepth int,
	visit func(path, relative string, information os.FileInfo) error,
) error {
	if maximumEntries <= 0 || maximumDepth <= 0 || visit == nil {
		return errors.New("invalid bounded filesystem traversal")
	}
	rootInformation, err := fileidentity.Lstat(root)
	if err != nil {
		return err
	}
	if !rootInformation.IsDir() || rootInformation.Mode()&os.ModeSymlink != 0 {
		return errors.New("bounded filesystem root is not a real directory")
	}
	type pendingDirectory struct {
		path        string
		depth       int
		information os.FileInfo
	}
	pending := []pendingDirectory{{path: root, depth: 0, information: rootInformation}}
	entries := 0
	for len(pending) > 0 {
		directory := pending[len(pending)-1]
		pending = pending[:len(pending)-1]
		file, err := os.Open(directory.path)
		if err != nil {
			return err
		}
		opened, statError := file.Stat()
		current, lstatError := fileidentity.Lstat(directory.path)
		if statError != nil || lstatError != nil || !opened.IsDir() || !current.IsDir() ||
			current.Mode()&os.ModeSymlink != 0 || !os.SameFile(directory.information, opened) ||
			!os.SameFile(opened, current) {
			_ = file.Close()
			return errors.New("bounded filesystem directory changed before enumeration")
		}
		for {
			batch, readError := file.ReadDir(64)
			for _, entry := range batch {
				entries++
				depth := directory.depth + 1
				if entries > maximumEntries || depth > maximumDepth {
					_ = file.Close()
					return errors.New("bounded filesystem exceeds its entry-count or path-depth boundary")
				}
				name := entry.Name()
				if name == "" || name == "." || name == ".." || strings.ContainsAny(name, "/\\\x00") {
					_ = file.Close()
					return errors.New("bounded filesystem contains a non-canonical entry name")
				}
				path := filepath.Join(directory.path, name)
				information, err := fileidentity.Lstat(path)
				if err != nil {
					_ = file.Close()
					return err
				}
				if information.Mode()&os.ModeSymlink != 0 || (!information.IsDir() && !information.Mode().IsRegular()) {
					_ = file.Close()
					return errors.New("bounded filesystem contains an unsupported entry type")
				}
				relative, err := filepath.Rel(root, path)
				if err != nil || relative == "." || filepath.IsAbs(relative) ||
					strings.HasPrefix(relative, ".."+string(filepath.Separator)) {
					_ = file.Close()
					return errors.New("bounded filesystem entry escapes its root")
				}
				if err := visit(path, filepath.ToSlash(relative), information); err != nil {
					_ = file.Close()
					return err
				}
				if information.IsDir() {
					pending = append(pending, pendingDirectory{path: path, depth: depth, information: information})
				}
			}
			if errors.Is(readError, io.EOF) {
				break
			}
			if readError != nil {
				_ = file.Close()
				return readError
			}
		}
		if err := file.Close(); err != nil {
			return err
		}
	}
	return nil
}

func dockerCommandFailure(operation string, err error, result dockerResult) error {
	diagnostic := strings.TrimSpace(string(result.stderr))
	if diagnostic == "" {
		diagnostic = strings.TrimSpace(string(result.stdout))
	}
	if len(diagnostic) > 8*1024 {
		diagnostic = diagnostic[:8*1024] + "..."
	}
	if diagnostic == "" {
		return fmt.Errorf("%s: %w", operation, err)
	}
	return fmt.Errorf("%s: %w: %s", operation, err, diagnostic)
}
