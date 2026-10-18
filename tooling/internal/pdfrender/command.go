package pdfrender

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"os/exec"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/boundedexec"
)

const (
	maximumDiagnosticBytes = 8 * 1024
	maximumWaitDelay       = 5 * time.Second
	sourceRevisionTimeout  = 15 * time.Second
)

type commandRequest struct {
	operation      string
	directory      string
	timeout        time.Duration
	outputSize     int
	arguments      []string
	renderSequence int
}

type commandExecutor interface {
	run(context.Context, commandRequest) ([]byte, error)
}

type localCommandExecutor struct{}

// rendererDiagnosticExecutor is concurrent-safe across renderer executions.
// Diagnostics are observations, never receipt fields or an alternative proof
// result. Keep write errors until the pipeline has retained its evidence and
// finished cleanup.
type rendererDiagnosticExecutor struct {
	commandExecutor
	writer   io.Writer
	mu       sync.Mutex
	seen     [2]bool
	failures [2]error
}

func (executor *rendererDiagnosticExecutor) run(ctx context.Context, request commandRequest) ([]byte, error) {
	body, err := executor.commandExecutor.run(ctx, request)
	if err != nil || executor.writer == nil {
		return body, err
	}
	if request.renderSequence == 0 && request.operation != "run pinned PDF renderer image" {
		return body, nil
	}
	index := request.renderSequence - 1
	executor.mu.Lock()
	defer executor.mu.Unlock()
	if index < 0 || index >= len(executor.seen) || request.operation != "run pinned PDF renderer image" {
		executor.rememberFailureLocked(0, errors.New("invalid PDF renderer diagnostic identity"))
		return body, nil
	}
	if executor.seen[index] {
		executor.rememberFailureLocked(index, errors.New("repeated PDF renderer diagnostic identity"))
		return body, nil
	}
	executor.seen[index] = true
	warning, diagnosticErr := rendererRetryWarning(body, request.outputSize)
	if diagnosticErr == nil && warning != "" {
		diagnosticErr = writeDiagnosticLine(executor.writer, request.renderSequence, warning)
	}
	executor.rememberFailureLocked(index, diagnosticErr)
	return body, nil
}

func writeDiagnosticLine(writer io.Writer, renderSequence int, warning string) error {
	line := fmt.Sprintf("PDF renderer render-%d: %s\n", renderSequence, warning)
	written, writeErr := io.WriteString(writer, line)
	if writeErr == nil && written != len(line) {
		writeErr = io.ErrShortWrite
	}
	if writeErr != nil {
		return fmt.Errorf("write PDF renderer retry diagnostic: %w", writeErr)
	}
	return nil
}

func (executor *rendererDiagnosticExecutor) rememberFailure(index int, err error) {
	if err == nil {
		return
	}
	executor.mu.Lock()
	defer executor.mu.Unlock()
	executor.rememberFailureLocked(index, err)
}

func (executor *rendererDiagnosticExecutor) rememberFailureLocked(index int, err error) {
	if err != nil && index >= 0 && index < len(executor.failures) && executor.failures[index] == nil {
		executor.failures[index] = err
	}
}

func (executor *rendererDiagnosticExecutor) diagnosticError() error {
	executor.mu.Lock()
	defer executor.mu.Unlock()
	return errors.Join(executor.failures[0], executor.failures[1])
}

func joinRendererDiagnostics(executor commandExecutor, primary error) error {
	if observer, ok := executor.(*rendererDiagnosticExecutor); ok {
		if err := observer.diagnosticError(); err != nil {
			return errors.Join(primary, err)
		}
	}
	return primary
}

func (executor *rendererDiagnosticExecutor) inspectImageArchive(ctx context.Context, configuration Configuration, imageID, manifestDigest string) (ImageConfigProof, error) {
	observer, ok := executor.commandExecutor.(imageArchiveExecutor)
	if !ok {
		return ImageConfigProof{}, errors.New("renderer executor has no bounded image-config proof adapter")
	}
	return observer.inspectImageArchive(ctx, configuration, imageID, manifestDigest)
}

// Match only the source-bound generator's single retry warning, never arbitrary
// subprocess prose, URLs, terminal controls or workflow commands. No recognised
// warning is not proof of zero print retries.
var rendererRetryWarningPattern = regexp.MustCompile(`^Headless Chrome returned "Printing failed"; retrying Page\.printToPDF once after ([1-9][0-9]{0,4}) ms with ([1-9][0-9]{0,5}) ms left in the original print budget\.$`)

func rendererRetryWarning(body []byte, limit int) (string, error) {
	if limit <= 0 || limit > 64*1024*1024 || len(body) > limit {
		return "", errors.New("PDF renderer diagnostic output exceeded its bound")
	}
	warning := ""
	for len(body) > 0 {
		line, rest, _ := bytes.Cut(body, []byte{'\n'})
		body = rest
		line = bytes.TrimSuffix(line, []byte{'\r'})
		if len(line) > 256 {
			continue
		}
		fields := rendererRetryWarningPattern.FindSubmatch(line)
		if len(fields) == 0 {
			continue
		}
		delay, delayErr := strconv.Atoi(string(fields[1]))
		remaining, remainingErr := strconv.Atoi(string(fields[2]))
		if delayErr != nil || remainingErr != nil || delay > 10_000 || remaining > 300_000 || remaining <= delay {
			continue
		}
		if warning != "" {
			return "", errors.New("PDF renderer retry warnings exceeded one per render")
		}
		warning = string(line)
	}
	return warning, nil
}

// verifySourceRevision rejects a revision-bound render unless the checked-out
// repository HEAD is the exact commit already verified by release preflight.
func verifySourceRevision(ctx context.Context, root, sourceRef, expected string) error {
	if err := ValidateSourceRevision(sourceRef, expected); err != nil {
		return err
	}
	if expected == "" {
		return nil
	}
	gitExecutable, err := exec.LookPath("git")
	if err != nil {
		return errors.New("locate Git executable for PDF source revision")
	}
	commandContext, cancel := context.WithTimeout(ctx, sourceRevisionTimeout)
	defer cancel()
	standardOutput := boundedexec.NewOutput(128)
	standardError := boundedexec.NewOutput(maximumDiagnosticBytes)
	command := exec.CommandContext(
		commandContext,
		gitExecutable,
		"-C", root,
		"rev-parse", "--verify", "HEAD^{commit}",
	)
	command.Env = boundedexec.GitEnvironment()
	command.Stdout = standardOutput
	command.Stderr = standardError
	command.WaitDelay = maximumWaitDelay
	runError := command.Run()
	resolvedBytes, outputExceeded := standardOutput.Result()
	diagnostic, diagnosticExceeded := standardError.Result()
	if commandContext.Err() != nil {
		return fmt.Errorf("resolve PDF source revision: %w", commandContext.Err())
	}
	if outputExceeded || diagnosticExceeded {
		return errors.New("resolve PDF source revision: subprocess output exceeded its bound")
	}
	if runError != nil {
		return commandFailure("resolve PDF source revision", runError, diagnostic)
	}
	resolved := strings.TrimSpace(string(resolvedBytes))
	if !gitRevisionPattern.MatchString(resolved) {
		return errors.New("resolved PDF source revision is not a lowercase 40-character Git identity")
	}
	if resolved != expected {
		return fmt.Errorf("PDF source revision is %s, not verified commit %s", resolved, expected)
	}
	return nil
}

func (localCommandExecutor) run(ctx context.Context, request commandRequest) ([]byte, error) {
	return runDockerCommand(ctx, request, nil)
}

func runDockerCommand(ctx context.Context, request commandRequest, environment []string) ([]byte, error) {
	if request.timeout <= 0 || request.outputSize <= 0 || len(request.arguments) == 0 {
		return nil, errors.New("invalid bounded subprocess request")
	}
	commandContext, cancel := context.WithTimeout(ctx, request.timeout)
	defer cancel()
	output := boundedexec.NewOutput(request.outputSize)
	command := exec.CommandContext(commandContext, "docker", request.arguments...)
	command.Dir = request.directory
	command.Env = environment
	command.Stdout = output
	command.Stderr = output
	command.WaitDelay = maximumWaitDelay
	err := command.Run()
	result, exceeded := output.Result()
	if commandContext.Err() != nil {
		return result, fmt.Errorf("%s: %w", request.operation, commandContext.Err())
	}
	if exceeded {
		return result, fmt.Errorf("%s: subprocess output exceeds %d bytes", request.operation, request.outputSize)
	}
	if err != nil {
		return result, commandFailure(request.operation, err, result)
	}
	return result, nil
}

func commandFailure(operation string, err error, output []byte) error {
	diagnostic := strings.TrimSpace(string(output))
	if len(diagnostic) > maximumDiagnosticBytes {
		diagnostic = diagnostic[:maximumDiagnosticBytes] + "..."
	}
	if diagnostic == "" {
		return fmt.Errorf("%s: %w", operation, err)
	}
	return fmt.Errorf("%s: %w: %s", operation, err, diagnostic)
}
