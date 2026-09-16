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

func shakedownCLIArguments(mode string) []string {
	return []string{mode, "--root", "/source", "--dataset", "/fixtures", "--expected-tree", strings.Repeat("a", 64),
		"--output", "/evidence/run", "--run-id", "local-development-1"}
}

func TestShakedownCLIRejectsInvalidUseWithoutActions(t *testing.T) {
	unwanted := func(context.Context, clrsshakedown.Options) (clrsshakedown.Report, error) {
		t.Fatal("invalid arguments invoked the runner or checker")
		return clrsshakedown.Report{}, nil
	}
	cases := [][]string{nil, {"--help"}, {"--unknown"}, {"--execute"}, {"--check"},
		shakedownCLIArguments("--execute=false"), append(shakedownCLIArguments("--execute"), "--check"),
		append(shakedownCLIArguments("--check"), "positional"), append(shakedownCLIArguments("--execute"), "--json=invalid")}
	for _, flag := range []string{"--root", "--dataset", "--expected-tree", "--output", "--run-id"} {
		cases = append(cases, append(shakedownCLIArguments("--execute"), flag, ""))
		cases = append(cases, append(shakedownCLIArguments("--check"), flag))
		if flag != "--root" {
			args := shakedownCLIArguments("--execute")
			for index := 1; index < len(args); index += 2 {
				if args[index] == flag {
					cases = append(cases, append(args[:index], args[index+2:]...))
					break
				}
			}
		}
	}
	for _, hash := range []string{strings.Repeat("A", 64), strings.Repeat("a", 63), strings.Repeat("a", 65),
		strings.Repeat("g", 64), "sha256:" + strings.Repeat("a", 64), " " + strings.Repeat("a", 63)} {
		cases = append(cases, append(shakedownCLIArguments("--check"), "--expected-tree", hash))
	}
	for _, args := range cases {
		var out, diagnostic bytes.Buffer
		if code := runShakedownWithActions(args, &out, &diagnostic, unwanted, unwanted); code != 2 || out.Len() != 0 {
			t.Fatalf("arguments %v: code=%d output=%q diagnostic=%q", args, code, out.String(), diagnostic.String())
		}
	}
}

func TestShakedownCLISelectsOneActionAndPreservesInputs(t *testing.T) {
	for _, mode := range []string{"--execute", "--check"} {
		for _, machine := range []bool{false, true} {
			state := "completed-unadmitted"
			if mode == "--check" {
				state = "bundle-consistent-unadmitted"
			}
			var calls []string
			var observed context.Context
			action := func(name string) clrsShakedownAction {
				return func(ctx context.Context, options clrsshakedown.Options) (clrsshakedown.Report, error) {
					calls = append(calls, name)
					observed = ctx
					want := clrsshakedown.Options{RepositoryRoot: "/source", DatasetDirectory: "/fixtures",
						ExpectedTreeSHA256: strings.Repeat("a", 64), OutputDirectory: "/evidence/run", RunID: "local-development-1"}
					if ctx == nil || ctx.Done() == nil || ctx.Err() != nil || options != want {
						t.Fatalf("changed options or missing live cancellation: %#v", options)
					}
					return clrsshakedown.Report{SchemaVersion: 1, State: state, Authority: "NO_RESULT", RunID: options.RunID,
						Cases: make([]clrsshakedown.Case, 48), Events: make([]clrsshakedown.Artifact, 192)}, nil
				}
			}
			args := shakedownCLIArguments(mode)
			if machine {
				args = append(args, "--json")
			}
			var out, diagnostic bytes.Buffer
			code := runShakedownWithActions(args, &out, &diagnostic, action("--execute"), action("--check"))
			if code != 0 || !reflect.DeepEqual(calls, []string{mode}) || diagnostic.Len() != 0 || !errors.Is(observed.Err(), context.Canceled) {
				t.Fatalf("mode=%s json=%v code=%d calls=%v output=%q diagnostic=%q", mode, machine, code, calls, out.String(), diagnostic.String())
			}
			if machine {
				var report clrsshakedown.Report
				if json.Unmarshal(out.Bytes(), &report) != nil || report.State != state || report.Authority != "NO_RESULT" ||
					report.RunID != "local-development-1" || len(report.Cases) != 48 || len(report.Events) != 192 || report.ScientificResult || report.ImageAdmitted {
					t.Fatalf("invalid machine report: %q", out.String())
				}
			} else {
				verb := "completed"
				if mode == "--check" {
					verb = "bundle checked"
				}
				want := "CLRS shakedown " + verb + ": 48 cases, 192 events; NO_RESULT, image admission remains blocked.\n"
				if out.String() != want {
					t.Fatalf("human output=%q want=%q", out.String(), want)
				}
			}
		}
	}
}

func TestShakedownCLIAllowsDefaultRootAndSyntacticallyValidZeroHash(t *testing.T) {
	args := append(shakedownCLIArguments("--check")[:1], shakedownCLIArguments("--check")[3:]...)
	args = append(args, "--expected-tree", strings.Repeat("0", 64))
	calls := 0
	action := func(ctx context.Context, options clrsshakedown.Options) (clrsshakedown.Report, error) {
		calls++
		if ctx == nil || options.RepositoryRoot != "." || options.ExpectedTreeSHA256 != strings.Repeat("0", 64) {
			t.Fatalf("default root or explicit zero hash changed: %#v", options)
		}
		return clrsshakedown.Report{}, errors.New("supplied tree does not match")
	}
	var out, diagnostic bytes.Buffer
	if code := runShakedownWithActions(args, &out, &diagnostic, action, action); code != 1 || calls != 1 || out.Len() != 0 || !strings.Contains(diagnostic.String(), "supplied tree does not match") {
		t.Fatalf("zero hash code=%d calls=%d output=%q diagnostic=%q", code, calls, out.String(), diagnostic.String())
	}
}

func TestShakedownCLIRetainsMachineOperationalFailure(t *testing.T) {
	for _, cause := range []error{errors.New("journal write failed"), context.Canceled, context.DeadlineExceeded} {
		for _, machine := range []bool{false, true} {
			action := func(context.Context, clrsshakedown.Options) (clrsshakedown.Report, error) {
				return clrsshakedown.Report{SchemaVersion: 1, State: "incomplete", Authority: "NO_RESULT", Error: cause.Error()}, cause
			}
			args := shakedownCLIArguments("--execute")
			if machine {
				args = append(args, "--json")
			}
			var out, diagnostic bytes.Buffer
			if code := runShakedownWithActions(args, &out, &diagnostic, action, action); code != 1 || !strings.Contains(diagnostic.String(), cause.Error()) {
				t.Fatalf("failure code=%d output=%q diagnostic=%q", code, out.String(), diagnostic.String())
			}
			if machine {
				var report clrsshakedown.Report
				if json.Unmarshal(out.Bytes(), &report) != nil || report.State != "incomplete" || report.Authority != "NO_RESULT" || report.Error != cause.Error() {
					t.Fatalf("lost failure report: %q", out.String())
				}
			} else if out.Len() != 0 {
				t.Fatalf("human failure wrote success output: %q", out.String())
			}
		}
	}
}

func TestShakedownCLIOutputFailuresAndCancellation(t *testing.T) {
	report := clrsshakedown.Report{SchemaVersion: 1, State: "completed-unadmitted", Authority: "NO_RESULT"}
	for _, machine := range []bool{false, true} {
		for _, writer := range []io.Writer{clrsInvocationShortWriter{}, clrsInvocationErrorWriter{}} {
			var diagnostic bytes.Buffer
			if code := writeCLRSShakedownReport(context.Background(), report, nil, false, machine, writer, &diagnostic); code != 1 || !strings.Contains(diagnostic.String(), "report output:") {
				t.Fatalf("failed or short output: code=%d diagnostic=%q", code, diagnostic.String())
			}
		}
		ctx, cancel := context.WithCancel(context.Background())
		var out, diagnostic bytes.Buffer
		if code := writeCLRSShakedownReport(ctx, report, nil, false, machine, clrsOCICancelWriter{cancel}, &diagnostic); code != 1 || !strings.Contains(diagnostic.String(), "cancelled:") {
			t.Fatalf("cancellation during output: code=%d diagnostic=%q", code, diagnostic.String())
		}
		diagnostic.Reset()
		if code := writeCLRSShakedownReport(ctx, report, nil, false, machine, &out, &diagnostic); code != 1 || out.Len() != 0 || !strings.Contains(diagnostic.String(), "cancelled:") {
			t.Fatalf("pre-output cancellation: code=%d output=%q diagnostic=%q", code, out.String(), diagnostic.String())
		}
	}
}

func TestShakedownCLIRejectsOversizedMachineReport(t *testing.T) {
	report := clrsshakedown.Report{Authority: "NO_RESULT", Error: strings.Repeat("x", 2<<20)}
	var out, diagnostic bytes.Buffer
	if code := writeCLRSShakedownReport(context.Background(), report, errors.New("run failed"), false, true, &out, &diagnostic); code != 1 || out.Len() != 0 || !strings.Contains(diagnostic.String(), "report output:") {
		t.Fatalf("oversized report: code=%d output bytes=%d diagnostic=%q", code, out.Len(), diagnostic.String())
	}
}

func TestShakedownCLIDispatchRejectsMissingSource(t *testing.T) {
	for _, mode := range []string{"--execute", "--check"} {
		args := append([]string{"run-clrs-shakedown"}, shakedownCLIArguments(mode)...)
		args = append(args, "--root", t.TempDir(), "--json")
		var out, diagnostic bytes.Buffer
		if code := runCommand(t, args, &out, &diagnostic); code != 1 || !strings.Contains(diagnostic.String(), "CLRS shakedown:") {
			t.Fatalf("missing source: code=%d output=%q diagnostic=%q", code, out.String(), diagnostic.String())
		}
		var report clrsshakedown.Report
		if json.Unmarshal(out.Bytes(), &report) != nil || report.Error == "" || report.Authority != "NO_RESULT" || report.State != "incomplete" {
			t.Fatalf("missing source report: %q", out.String())
		}
	}
}
