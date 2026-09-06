package main

import (
	"bufio"
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"syscall"
	"testing"
	"time"

	"github.com/lusoris/20-watts-was-enough/tooling/internal/pdfrender"
)

func TestPublicationRenderSignalsCancelOperationBeforeExit(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("os.Process.Signal does not send these Unix signals on Windows")
	}
	for _, received := range []os.Signal{os.Interrupt, syscall.SIGTERM} {
		t.Run(received.String(), func(t *testing.T) {
			ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
			defer cancel()
			root := t.TempDir()
			command := exec.CommandContext(ctx, os.Args[0], "-test.run=^TestPublicationRenderSignalProcessHelper$")
			command.Env = append(os.Environ(), "TWENTYW_PDF_SIGNAL_HELPER="+root)
			command.WaitDelay = time.Second
			var stderr renderSignalOutput
			command.Stderr = &stderr
			output, err := command.StdoutPipe()
			if err != nil {
				t.Fatal(err)
			}
			if err := command.Start(); err != nil {
				t.Fatal(err)
			}
			reader := bufio.NewReader(io.LimitReader(output, 4096))
			ready, err := reader.ReadString('\n')
			if err != nil || ready != "ready\n" {
				cancel()
				_ = command.Wait()
				t.Fatalf("renderer did not reach signal boundary: %q, %v, %s", ready, err, &stderr)
			}
			if err := command.Process.Signal(received); err != nil {
				cancel()
				_ = command.Wait()
				t.Fatal(err)
			}
			err = command.Wait()
			var exitError *exec.ExitError
			if !errors.As(err, &exitError) || exitError.ExitCode() != 1 || ctx.Err() != nil {
				t.Fatalf("signal bypassed orderly failure: error=%v, context=%v, stderr=%s", err, ctx.Err(), &stderr)
			}
			if !strings.Contains(stderr.String(), "Render PDF publication: context canceled") {
				t.Fatalf("missing cancellation diagnostic: %s", &stderr)
			}
			body, err := os.ReadFile(filepath.Join(root, "cleanup-complete"))
			if err != nil || string(body) != "context canceled\n" {
				t.Fatalf("renderer cleanup did not complete before CLI exit: %q, %v", body, err)
			}
		})
	}
}

type renderSignalOutput struct{ bytes.Buffer }

func (output *renderSignalOutput) Write(body []byte) (int, error) {
	if len(body) > 4096-output.Len() {
		return 0, errors.New("signal-test output exceeded 4096 bytes")
	}
	return output.Buffer.Write(body)
}

func TestPublicationRenderSignalProcessHelper(t *testing.T) {
	root := os.Getenv("TWENTYW_PDF_SIGNAL_HELPER")
	if root == "" {
		return
	}
	render := func(ctx context.Context, options pdfrender.Options) (pdfrender.Result, error) {
		if options.RepositoryRoot != root || options.SourceRef != "main" || options.SourceRevision != "" {
			return pdfrender.Result{}, errors.New("unexpected renderer options")
		}
		defer func() {
			if err := os.WriteFile(filepath.Join(root, "cleanup-complete"), []byte(fmt.Sprintln(ctx.Err())), 0o600); err != nil {
				fmt.Fprintln(os.Stderr, err)
			}
		}()
		fmt.Fprintln(os.Stdout, "ready")
		select {
		case <-ctx.Done():
			return pdfrender.Result{}, ctx.Err()
		case <-time.After(8 * time.Second):
			return pdfrender.Result{}, errors.New("test renderer did not receive cancellation")
		}
	}
	os.Exit(runPublicationRenderPDFWithRenderer([]string{"--root", root}, os.Stdout, os.Stderr, render))
}
