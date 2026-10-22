package clrsfixture

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"os/exec"
	"path/filepath"
	"sync"
	"time"
)

type generationCommandEvidence struct {
	Arguments []string `json:"arguments"`
	Stdout    []byte   `json:"stdout"`
	Stderr    []byte   `json:"stderr"`
	ExitCode  int      `json:"exit_code"`
	Error     string   `json:"error"`
}

type generationCommandBudget struct {
	mutex     sync.Mutex
	remaining int64
}

type generationCommandWriter struct {
	mutex       sync.Mutex
	destination io.Writer
	remaining   int64
	shared      *generationCommandBudget
	cancel      context.CancelCauseFunc
}

func (writer *generationCommandWriter) Write(body []byte) (int, error) {
	writer.mutex.Lock()
	defer writer.mutex.Unlock()
	allowed := min(int64(len(body)), writer.remaining)
	if writer.shared != nil {
		writer.shared.mutex.Lock()
		defer writer.shared.mutex.Unlock()
		allowed = min(allowed, writer.shared.remaining)
	}
	n, err := writer.destination.Write(body[:allowed])
	if n < 0 || int64(n) > allowed {
		err = errors.New("generator output sink returned an invalid write count")
		writer.cancel(err)
		return 0, err
	}
	writer.remaining -= int64(n)
	if writer.shared != nil {
		writer.shared.remaining -= int64(n)
	}
	if err == nil && int64(n) != allowed {
		err = io.ErrShortWrite
	}
	if err == nil && allowed < int64(len(body)) {
		err = errors.New("generator command output exceeded its byte bound")
	}
	if err != nil {
		writer.cancel(err)
	}
	return n, err
}

// Streaming output remains in the caller-owned bounded sink, not the command
// log. This cannot preempt a blocked arbitrary sink or filesystem write.
func executeGenerationCommand(ctx context.Context, binary string, args, environment []string, sink io.Writer, limit int64) (record generationCommandEvidence, err error) {
	record.ExitCode = -1
	defer func() {
		if err != nil {
			record.Error = boundedPromiseError(err)
		}
	}()
	if err := validateGenerationCommand(ctx, binary, args, environment, sink, limit); err != nil {
		return record, err
	}
	record.Arguments = append([]string{binary}, args...)
	commandContext, cancel := context.WithCancelCause(ctx)
	defer cancel(nil)
	var stdout, stderr bytes.Buffer
	var shared *generationCommandBudget
	if sink == nil {
		sink = &stdout
		shared = &generationCommandBudget{remaining: 1 << 20}
	}
	command := exec.CommandContext(commandContext, binary, args...) //#nosec G204 -- binary and arguments validated by validateGenerationCommand
	command.Env = environment
	command.WaitDelay = 2 * time.Second
	command.Stdout = &generationCommandWriter{destination: sink, remaining: limit, shared: shared, cancel: cancel}
	command.Stderr = &generationCommandWriter{destination: &stderr, remaining: 1 << 20, shared: shared, cancel: cancel}
	cleanup, err := configurePromiseProcess(command)
	if err != nil {
		return record, err
	}
	err = command.Run()
	if command.ProcessState != nil {
		record.ExitCode = command.ProcessState.ExitCode()
	}
	err = errors.Join(err, cleanup(), context.Cause(commandContext))
	record.Stdout, record.Stderr = stdout.Bytes(), stderr.Bytes()
	return record, err
}

func validateGenerationCommand(ctx context.Context, binary string, args, environment []string, sink io.Writer, limit int64) error {
	if ctx == nil {
		return errors.New("generator command requires a context")
	}
	if _, bounded := ctx.Deadline(); !bounded {
		return errors.New("generator command requires a deadline")
	}
	if err := ctx.Err(); err != nil {
		return err
	}
	if !filepath.IsAbs(binary) || len(args) > 128 || len(environment) > 128 {
		return errors.New("generator command needs an absolute executable and bounded arguments/environment")
	}
	argumentBytes, environmentBytes := len(binary), 0
	for _, value := range args {
		argumentBytes += len(value)
	}
	for _, value := range environment {
		environmentBytes += len(value)
	}
	if argumentBytes > 64<<10 || environmentBytes > 64<<10 {
		return errors.New("generator command arguments or environment exceed 64 KiB")
	}
	if limit < 1 || limit > generationRunMaximumTar || (sink == nil && limit > 64<<10) {
		return errors.New("generator command requires bounded control output or a bounded streaming sink")
	}
	return nil
}

func localGenerationDocker(ctx context.Context, args []string, sink io.Writer, limit int64) (generationCommandEvidence, error) {
	binary, err := exec.LookPath("docker")
	if err != nil {
		err = fmt.Errorf("locate local generator Docker CLI: %w", err)
		return generationCommandEvidence{ExitCode: -1, Error: boundedPromiseError(err)}, err
	}
	binary, err = filepath.Abs(binary)
	if err != nil {
		return generationCommandEvidence{ExitCode: -1, Error: boundedPromiseError(err)}, err
	}
	arguments := append([]string{"--host", "unix:///var/run/docker.sock"}, args...)
	return executeGenerationCommand(ctx, binary, arguments, promiseHostEnvironment(), sink, limit)
}
