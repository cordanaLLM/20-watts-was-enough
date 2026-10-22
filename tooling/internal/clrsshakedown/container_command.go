package clrsshakedown

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"os/exec"
	"path/filepath"
	"sync"
	"time"
)

type containerStreamBudget struct {
	mutex     sync.Mutex
	remaining int
	cancel    context.CancelCauseFunc
}
type containerStreamWriter struct {
	buffer *bytes.Buffer
	budget *containerStreamBudget
}

func (w containerStreamWriter) Write(body []byte) (int, error) {
	w.budget.mutex.Lock()
	defer w.budget.mutex.Unlock()
	allowed := min(len(body), w.budget.remaining)
	n, err := w.buffer.Write(body[:allowed])
	w.budget.remaining -= n
	if allowed != len(body) {
		err = errors.Join(err, errors.New("container command exceeded its combined output bound"))
	}
	if err != nil {
		w.budget.cancel(err)
	}
	return n, err
}

func executeContainerCommand(ctx context.Context, binary string, args, environment []string, maximum int) (result containerCommandResult, err error) {
	result.ExitCode = -1
	if ctx == nil {
		return result, errors.New("container command needs a context")
	}
	if _, bounded := ctx.Deadline(); !bounded {
		return result, errors.New("container command needs a deadline")
	}
	if err := ctx.Err(); err != nil {
		return result, err
	}
	if !filepath.IsAbs(binary) || len(args) > 128 || len(environment) > 8 || maximum < 1 || maximum > containerAttachedBytes {
		return result, errors.New("invalid container command bounds")
	}
	argumentBytes := len(binary)
	for _, item := range append(append([]string{}, args...), environment...) {
		argumentBytes += len(item)
	}
	if argumentBytes > 64<<10 {
		return result, errors.New("container command arguments/environment exceed 64 KiB")
	}
	child, cancel := context.WithCancelCause(ctx)
	defer cancel(nil)
	var stdout, stderr bytes.Buffer
	budget := &containerStreamBudget{remaining: maximum, cancel: cancel}
	command := exec.CommandContext(child, binary, args...) //#nosec G204 -- absolute binary path and bounded argument slice validated by preceding checks
	command.Env = environment
	command.WaitDelay = containerProcessWaitDelay
	command.Stdout, command.Stderr = containerStreamWriter{&stdout, budget}, containerStreamWriter{&stderr, budget}
	cleanup, err := configureContainerProcess(command)
	if err != nil {
		return result, err
	}
	err = command.Run()
	if command.ProcessState != nil {
		result.ExitCode = command.ProcessState.ExitCode()
	}
	result.Stdout, result.Stderr = stdout.Bytes(), stderr.Bytes()
	return result, errors.Join(err, cleanup(), context.Cause(child))
}

func localContainerDocker(ctx context.Context, args []string, maximum int) (containerCommandResult, error) {
	// Global --host and --config are supplied and recorded by command(). No HOME,
	// Docker context, API-version, TLS, proxy or credential-routing environment.
	return executeContainerCommand(ctx, "/usr/bin/docker", args, []string{"PATH=/usr/bin:/bin", "LANG=C", "LC_ALL=C"}, maximum)
}

func (r *containerRunner) writeWitness(name string, body []byte) error {
	if len(body) > containerAttachedBytes || r.witnessBytes+len(body) > containerWitnessBytes {
		return errors.New("container witness exceeds its 16 MiB aggregate byte bound")
	}
	r.witnessBytes += len(body)
	return writeNew(r.witness, name, body)
}

func (r *containerRunner) command(ctx context.Context, duration time.Duration, maximum int, cleanup bool, args ...string) (result containerCommandResult, err error) {
	result.ExitCode = -1
	if cleanup {
		if r.cleanupCalls >= containerCleanupCommands {
			return result, errors.New("container cleanup command budget exhausted")
		}
		r.cleanupCalls++
	} else {
		if r.workCalls >= containerWorkCommands {
			return result, errors.New("container work command budget exhausted")
		}
		r.workCalls++
	}
	sequence := r.workCalls + r.cleanupCalls
	prefix := fmt.Sprintf("command-%02d", sequence)
	arguments := append([]string{"--host", containerEndpoint, "--config", filepath.Join(r.witness.Name(), "docker-config")}, args...)
	before := struct {
		Executable    string   `json:"executable"`
		Arguments     []string `json:"arguments"`
		TimeoutMillis int64    `json:"timeout_milliseconds"`
		MaximumBytes  int      `json:"maximum_output_bytes"`
		Cleanup       bool     `json:"cleanup"`
	}{
		"/usr/bin/docker", arguments, duration.Milliseconds(), maximum, cleanup}
	body, encodeErr := marshal(before, containerControlBytes)
	if encodeErr != nil {
		return result, encodeErr
	}
	beforeErr := r.writeWitness(prefix+"-before.json", body)
	if beforeErr != nil && !cleanup {
		return result, beforeErr
	}
	r.report.Commands = append(r.report.Commands, prefix)
	child, cancel := context.WithTimeout(ctx, duration)
	defer cancel()
	result, err = r.execute(child, arguments, maximum)
	err = errors.Join(err, child.Err())
	if result.ExitCode != 0 {
		err = errors.Join(err, fmt.Errorf("container command external exit %d", result.ExitCode))
	}
	if len(result.Stdout)+len(result.Stderr) > maximum {
		err = errors.Join(err, errors.New("executor returned excessive container output"))
		result.Stdout, result.Stderr = nil, nil
	}
	stdoutErr := r.writeWitness(prefix+"-stdout.bin", result.Stdout)
	stderrErr := r.writeWitness(prefix+"-stderr.bin", result.Stderr)
	after := struct {
		ExitCode       int    `json:"exit_code"`
		Error          string `json:"error"`
		Stdout, Stderr FileIdentity
	}{result.ExitCode, diagnostic(err), identify(result.Stdout), identify(result.Stderr)}
	body, encodeErr = marshal(after, containerControlBytes)
	var afterErr error
	if encodeErr == nil {
		afterErr = r.writeWitness(prefix+"-after.json", body)
	}
	return result, errors.Join(err, beforeErr, stdoutErr, stderrErr, encodeErr, afterErr)
}

func (r *containerRunner) control(ctx context.Context, cleanup bool, args ...string) (containerCommandResult, error) {
	result, err := r.command(ctx, containerControlTimeout, containerControlBytes, cleanup, args...)
	if len(result.Stderr) != 0 {
		err = errors.Join(err, errors.New("Docker control command wrote stderr"))
	}
	return result, err
}
