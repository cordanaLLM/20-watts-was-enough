package ciplancli

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"os/exec"
	"path/filepath"
	"slices"
	"strings"
	"testing"
	"time"
)

const toolingImport = "github.com/cordanaLLM/20-watts-was-enough/tooling/"

// Both workflow executables must remain outside experiment package initialisation.
// List production dependencies, not test imports; reject every unknown non-standard
// package, including newly introduced third-party dependencies.
func TestPrivateCommandDependencyClosures(t *testing.T) {
	goPath, err := exec.LookPath("go")
	if err != nil {
		t.Fatal(err)
	}
	moduleRoot, err := filepath.Abs(filepath.Join("..", ".."))
	if err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	for _, test := range []struct {
		command string
		allowed []string
	}{
		{"ci-plan", []string{"cmd/ci-plan", "internal/ciplancli", "internal/ciplan", "internal/strictjson"}},
		{"pdf-proof", []string{"cmd/pdf-proof", "internal/pdfrendercli", "internal/pdfrender", "internal/pdfrenderlock", "internal/strictjson"}},
	} {
		t.Run(test.command, func(t *testing.T) {
			command := exec.CommandContext(ctx, goPath, "list", "-mod=readonly", "-deps", "-f", "{{if not .Standard}}{{.ImportPath}}{{end}}", "./cmd/"+test.command)
			command.Dir = moduleRoot
			command.Env = []string{
				"PATH=" + filepath.Dir(goPath), "GOTOOLCHAIN=local", "GOENV=off", "GOWORK=off", "CGO_ENABLED=0",
				"GOOS=linux", "GOARCH=amd64",
				"GOPROXY=off", "GOSUMDB=off", "GOCACHE=" + t.TempDir(), "GOPATH=" + t.TempDir(),
			}
			command.WaitDelay = time.Second
			stdout := &boundedDependencyOutput{cancel: cancel}
			stderr := &boundedDependencyOutput{cancel: cancel}
			command.Stdout, command.Stderr = stdout, stderr
			if err := command.Run(); err != nil {
				t.Fatalf("bounded go list failed: %v; stderr=%q", err, stderr.String())
			}
			if stdout.exceeded || stderr.exceeded || stderr.Len() != 0 || ctx.Err() != nil {
				t.Fatalf("dependency readback exceeded its boundary or wrote diagnostics: %v; stderr=%q", ctx.Err(), stderr.String())
			}
			if err := validateDependencyClosure(stdout.String(), test.allowed); err != nil {
				t.Fatal(err)
			}
		})
	}
}

func validateDependencyClosure(output string, allowed []string) error {
	actual := strings.Fields(output)
	want := make([]string, len(allowed))
	for index, suffix := range allowed {
		want[index] = toolingImport + suffix
	}
	slices.Sort(actual)
	slices.Sort(want)
	if !slices.Equal(actual, want) {
		return fmt.Errorf("private command dependency closure changed: got %q, want %q", actual, want)
	}
	return nil
}

func TestDependencyClosureFailsOnGrowthLossDuplicatesAndForeignModules(t *testing.T) {
	allowed := []string{"cmd/ci-plan", "internal/ciplancli"}
	valid := toolingImport + allowed[0] + "\n" + toolingImport + allowed[1] + "\n"
	if err := validateDependencyClosure(valid, allowed); err != nil {
		t.Fatal(err)
	}
	for _, invalid := range []string{"", valid + toolingImport + "internal/experiment\n", valid + "example.org/foreign\n", valid + toolingImport + allowed[0], toolingImport + allowed[0]} {
		if err := validateDependencyClosure(invalid, allowed); err == nil {
			t.Fatalf("accepted changed dependency closure %q", invalid)
		}
	}
}

const maximumDependencyOutput = 64 << 10

type boundedDependencyOutput struct {
	buffer   bytes.Buffer
	cancel   context.CancelFunc
	exceeded bool
}

func (output *boundedDependencyOutput) Len() int { return output.buffer.Len() }

func (output *boundedDependencyOutput) String() string { return output.buffer.String() }

func (output *boundedDependencyOutput) Write(body []byte) (int, error) {
	if len(body) > maximumDependencyOutput-output.Len() {
		output.exceeded = true
		output.cancel()
		return 0, errors.New("dependency output exceeds 64 KiB")
	}
	return output.buffer.Write(body)
}

func TestDependencyOutputCapCancelsWithoutRetainingExcess(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	output := &boundedDependencyOutput{cancel: cancel}
	if _, err := output.Write(make([]byte, maximumDependencyOutput)); err != nil {
		t.Fatal(err)
	}
	if written, err := output.Write([]byte("x")); written != 0 || err == nil || !output.exceeded || ctx.Err() == nil || output.Len() != maximumDependencyOutput {
		t.Fatalf("cap: written=%d err=%v exceeded=%t context=%v retained=%d", written, err, output.exceeded, ctx.Err(), output.Len())
	}
}

func TestDependencyOutputCopyCannotBypassWriteCap(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	output := &boundedDependencyOutput{cancel: cancel}
	if _, err := io.Copy(output, strings.NewReader(strings.Repeat("x", maximumDependencyOutput+1))); err == nil || !output.exceeded || ctx.Err() == nil || output.Len() > maximumDependencyOutput {
		t.Fatalf("copy: err=%v exceeded=%t context=%v retained=%d", err, output.exceeded, ctx.Err(), output.Len())
	}
}
