package experimentcli

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"syscall"
	"testing"
	"time"

	"github.com/lusoris/20-watts-was-enough/tooling/internal/clrsshakedown"
)

func TestShakedownCLISignalsRetainIncompleteMachineReport(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("os.Process.Signal and ExtraFiles require Unix process semantics")
	}
	for _, mode := range []string{"--execute", "--check"} {
		for _, received := range []os.Signal{os.Interrupt, syscall.SIGTERM} {
			t.Run(mode+"/"+received.String(), func(t *testing.T) {
				checkShakedownSignal(t, mode, received)
			})
		}
	}
}

func checkShakedownSignal(t *testing.T, mode string, received os.Signal) {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	root := t.TempDir()
	// This retained sentinel is outside the action-owned lease and must survive
	// both modes unchanged. The injected action does not execute/check a bundle.
	retained := filepath.Join(root, "retained-evidence")
	if err := os.WriteFile(retained, []byte("previous NO_RESULT evidence\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	readyReader, readyWriter, err := os.Pipe()
	if err != nil {
		t.Fatal(err)
	}
	defer readyReader.Close()
	defer readyWriter.Close()
	command := exec.CommandContext(ctx, os.Args[0], "-test.run=^TestShakedownCLISignalProcessHelper$")
	command.Env = append(os.Environ(), "TWENTYW_SHAKEDOWN_SIGNAL_ROOT="+root, "TWENTYW_SHAKEDOWN_SIGNAL_MODE="+mode)
	command.ExtraFiles = []*os.File{readyWriter}
	command.WaitDelay = time.Second
	var stdout, stderr shakedownSignalOutput
	command.Stdout, command.Stderr = &stdout, &stderr
	if err := command.Start(); err != nil {
		t.Fatal(err)
	}
	waited := false
	defer func() {
		if !waited {
			cancel()
			_ = command.Wait()
		}
	}()
	if err := readyWriter.Close(); err != nil {
		t.Fatal(err)
	}
	ready, err := bufio.NewReader(io.LimitReader(readyReader, 64)).ReadString('\n')
	if err != nil || ready != mode+" ready\n" {
		t.Fatalf("action did not reach signal boundary: %q, %v", ready, err)
	}
	if _, err := os.Stat(filepath.Join(root, "action-owned.lock")); err != nil {
		t.Fatalf("signal handshake preceded resource acquisition: %v", err)
	}
	if err := command.Process.Signal(received); err != nil {
		t.Fatal(err)
	}
	waitError := command.Wait()
	waited = true
	var exitError *exec.ExitError
	if !errors.As(waitError, &exitError) || exitError.ExitCode() != 1 || ctx.Err() != nil {
		t.Fatalf("signal bypassed orderly failure: error=%v, context=%v, stderr=%s", waitError, ctx.Err(), &stderr)
	}
	if stderr.String() != "CLRS shakedown: context canceled\n" {
		t.Fatalf("unexpected cancellation diagnostic: %q", stderr.String())
	}
	assertShakedownSignalReport(t, stdout.Bytes())
	if _, err := os.Lstat(filepath.Join(root, "action-owned.lock")); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("action-owned resource survived orderly cancellation: %v", err)
	}
	cleanup, err := os.ReadFile(filepath.Join(root, "cleanup-complete"))
	if err != nil || string(cleanup) != mode+" context canceled\n" {
		t.Fatalf("action cleanup did not finish before exit: %q, %v", cleanup, err)
	}
	body, err := os.ReadFile(retained)
	if err != nil || string(body) != "previous NO_RESULT evidence\n" {
		t.Fatalf("cancellation changed unrelated retained evidence: %q, %v", body, err)
	}
}

func assertShakedownSignalReport(t *testing.T, body []byte) {
	t.Helper()
	decoder := json.NewDecoder(bytes.NewReader(body))
	decoder.DisallowUnknownFields()
	var report clrsshakedown.Report
	if err := decoder.Decode(&report); err != nil {
		t.Fatalf("cancelled command omitted valid JSON: %v, %q", err, body)
	}
	if err := decoder.Decode(new(any)); !errors.Is(err, io.EOF) {
		t.Fatalf("JSON report contains trailing output: %v", err)
	}
	if report.SchemaVersion != 1 || report.State != "incomplete" || report.Authority != "NO_RESULT" ||
		report.RunID != "local-development-1" || report.Error != context.Canceled.Error() ||
		report.ImageAdmitted || report.ScientificResult || len(report.Cases) != 0 || len(report.Events) != 0 {
		t.Fatalf("cancelled report changed its development boundary: %+v", report)
	}
	var fields map[string]json.RawMessage
	if err := json.Unmarshal(body, &fields); err != nil {
		t.Fatal(err)
	}
	for _, name := range []string{"image_admitted", "scientific_result"} {
		if !bytes.Equal(bytes.TrimSpace(fields[name]), []byte("false")) {
			t.Fatalf("report omitted explicit false authority field %q", name)
		}
	}
}

type shakedownSignalOutput struct{ bytes.Buffer }

func (output *shakedownSignalOutput) Write(body []byte) (int, error) {
	if len(body) > (16<<10)-output.Len() {
		return 0, errors.New("signal-test output exceeded 16 KiB")
	}
	return output.Buffer.Write(body)
}

func TestShakedownCLISignalProcessHelper(t *testing.T) {
	root := os.Getenv("TWENTYW_SHAKEDOWN_SIGNAL_ROOT")
	if root == "" {
		return
	}
	mode := os.Getenv("TWENTYW_SHAKEDOWN_SIGNAL_MODE")
	if mode != "--execute" && mode != "--check" {
		t.Fatal("invalid helper mode")
	}
	ready := os.NewFile(3, "shakedown-signal-ready")
	if ready == nil {
		t.Fatal("missing readiness descriptor")
	}
	action := func(ctx context.Context, options clrsshakedown.Options) (report clrsshakedown.Report, err error) {
		if options.RepositoryRoot != root || options.OutputDirectory != filepath.Join(root, "bundle") || options.RunID != "local-development-1" {
			return report, errors.New("unexpected action options")
		}
		leasePath := filepath.Join(root, "action-owned.lock")
		lease, err := os.OpenFile(leasePath, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o600)
		if err != nil {
			return report, err
		}
		// This test-only lease witnesses action cleanup; production partial-journal
		// retention and read-only bundle checks retain their separate package tests.
		defer func() {
			err = errors.Join(err, lease.Close(), os.Remove(leasePath))
			if ctx.Err() != nil {
				err = errors.Join(err, os.WriteFile(filepath.Join(root, "cleanup-complete"), []byte(mode+" "+ctx.Err().Error()+"\n"), 0o600))
			}
		}()
		if _, err := fmt.Fprintln(ready, mode+" ready"); err != nil {
			return report, err
		}
		if err := ready.Close(); err != nil {
			return report, err
		}
		select {
		case <-ctx.Done():
			return clrsshakedown.Report{SchemaVersion: 1, Authority: "NO_RESULT", State: "incomplete", RunID: options.RunID, Error: ctx.Err().Error()}, ctx.Err()
		case <-time.After(8 * time.Second):
			return report, errors.New("test action did not receive cancellation")
		}
	}
	unwanted := func(context.Context, clrsshakedown.Options) (clrsshakedown.Report, error) {
		return clrsshakedown.Report{}, errors.New("wrong action selected")
	}
	execute, check := unwanted, action
	if mode == "--execute" {
		execute, check = action, unwanted
	}
	arguments := append(shakedownCLIArguments(mode), "--root", root, "--output", filepath.Join(root, "bundle"), "--json")
	os.Exit(runShakedownWithActions(arguments, os.Stdout, os.Stderr, execute, check))
}
