package experimentcli

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"reflect"
	"strings"
	"testing"

	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/clrsshakedown"
)

func containerCLIArguments() []string {
	return append(shakedownCLIArguments("--execute"), "--image-id", "sha256:"+strings.Repeat("b", 64))
}

func TestContainerCLIRejectsInvalidUseWithoutExecution(t *testing.T) {
	never := func(context.Context, clrsshakedown.ContainerOptions) (clrsshakedown.ContainerReport, error) {
		t.Fatal("invalid use invoked Docker path")
		return clrsshakedown.ContainerReport{}, nil
	}
	cases := [][]string{nil, {"--help"}, {"--check"}, {"--unknown"}, append(containerCLIArguments(), "--execute=false"), append(containerCLIArguments(), "positional")}
	for _, flag := range []string{"--root", "--dataset", "--expected-tree", "--output", "--run-id", "--image-id"} {
		cases = append(cases, append(containerCLIArguments(), flag, ""), append(containerCLIArguments(), flag))
	}
	for _, image := range []string{"tooling:latest", strings.Repeat("a", 64), "sha256:" + strings.Repeat("B", 64), "sha256:" + strings.Repeat("b", 63)} {
		cases = append(cases, append(containerCLIArguments(), "--image-id", image))
	}
	for _, args := range cases {
		var out, diagnostic bytes.Buffer
		if code := runContainerWithAction(args, &out, &diagnostic, never); code != 2 || out.Len() != 0 {
			t.Fatalf("invalid use code=%d stdout=%q args=%v", code, out.String(), args)
		}
	}
	var help, out, diagnostic bytes.Buffer
	Usage(&help)
	if !strings.Contains(help.String(), "run-clrs-shakedown-container --execute --image-id") {
		t.Fatal("new command absent from help")
	}
	if code, handled := Run([]string{"run-clrs-shakedown-container"}, &out, &diagnostic); code != 2 || !handled || out.Len() != 0 {
		t.Fatal("container command not dispatched without execution")
	}
}

func TestContainerCLIPreservesExactOptionsAndUnsignedMachineReport(t *testing.T) {
	for _, machine := range []bool{false, true} {
		calls := 0
		var observed context.Context
		want := clrsshakedown.ContainerReport{SchemaVersion: 1, Authority: "NO_RESULT", State: "container-bundle-consistent-unadmitted", Cases: 48, Events: 192, OutputDirectory: "/evidence/run"}
		action := func(ctx context.Context, options clrsshakedown.ContainerOptions) (clrsshakedown.ContainerReport, error) {
			calls++
			observed = ctx
			expected := clrsshakedown.ContainerOptions{Options: clrsshakedown.Options{RepositoryRoot: "/source", DatasetDirectory: "/fixtures", ExpectedTreeSHA256: strings.Repeat("a", 64), OutputDirectory: "/evidence/run", RunID: "local-development-1"}, ImageID: "sha256:" + strings.Repeat("b", 64)}
			if options != expected || ctx.Done() == nil || ctx.Err() != nil {
				t.Fatalf("changed options/cancellation: %+v", options)
			}
			return want, nil
		}
		args := containerCLIArguments()
		if machine {
			args = append(args, "--json")
		}
		var out, diagnostic bytes.Buffer
		if code := runContainerWithAction(args, &out, &diagnostic, action); code != 0 || calls != 1 || diagnostic.Len() != 0 || !errors.Is(observed.Err(), context.Canceled) {
			t.Fatalf("code=%d calls=%d stderr=%q", code, calls, diagnostic.String())
		}
		if machine {
			var got clrsshakedown.ContainerReport
			if json.Unmarshal(out.Bytes(), &got) != nil || !reflect.DeepEqual(got, want) {
				t.Fatalf("changed report: %q", out.String())
			}
		} else if !strings.Contains(out.String(), "48 cases, 192 events; NO_RESULT") || !strings.Contains(out.String(), "/evidence/run/witness/receipt.json") {
			t.Fatalf("incomplete human output: %q", out.String())
		}
	}
}

func TestContainerCLIRetainsFailuresAndChecksOutput(t *testing.T) {
	for _, machine := range []bool{false, true} {
		cause := errors.New("owned container cleanup failed")
		action := func(context.Context, clrsshakedown.ContainerOptions) (clrsshakedown.ContainerReport, error) {
			return clrsshakedown.ContainerReport{SchemaVersion: 1, Authority: "NO_RESULT", State: "incomplete", Error: cause.Error()}, cause
		}
		args := containerCLIArguments()
		if machine {
			args = append(args, "--json")
		}
		var out, diagnostic bytes.Buffer
		if code := runContainerWithAction(args, &out, &diagnostic, action); code != 1 || !strings.Contains(diagnostic.String(), cause.Error()) {
			t.Fatalf("lost operational failure: %d %q", code, diagnostic.String())
		}
		if machine && !strings.Contains(out.String(), `"state": "incomplete"`) {
			t.Fatal("lost machine failure")
		}
		if !machine && out.Len() != 0 {
			t.Fatal("human failure emitted success output")
		}
		for _, writer := range []io.Writer{clrsInvocationShortWriter{}, clrsInvocationErrorWriter{}} {
			if code := writeCLRSContainerReport(context.Background(), clrsshakedown.ContainerReport{}, nil, machine, writer, &diagnostic); code != 1 {
				t.Fatal("ignored output failure")
			}
		}
		ctx, cancel := context.WithCancel(context.Background())
		if code := writeCLRSContainerReport(ctx, clrsshakedown.ContainerReport{}, nil, machine, clrsOCICancelWriter{cancel}, &diagnostic); code != 1 {
			t.Fatal("ignored cancellation during output")
		}
	}
}
