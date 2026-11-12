package pinnednode

import (
	"bytes"
	"context"
	"errors"
	"io"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
	"time"
)

type outputResult struct {
	status int
	output string
	err    error
}

type fakeRun struct {
	deps                 Deps
	root, cache, install string
	calls                []string
	results              []outputResult
	miseEnv, gateEnv     []string
	gateArgv             []string
	gateStdout           io.Writer
	gateStatus           int
	gateErr              error
}

func newFakeRun(t *testing.T) *fakeRun {
	t.Helper()
	f := &fakeRun{root: t.TempDir(), cache: t.TempDir(), install: filepath.Join(t.TempDir(), "node")}
	writePin(t, f.root, "26.13.0\n")
	f.results = []outputResult{{}, {output: f.install + "\n"}, {output: "v26.13.0\n"}}
	f.deps = Deps{
		LookPath: func(name string) (string, error) {
			f.calls = append(f.calls, "look:"+name)
			return filepath.Join(f.root, "mise"), nil
		},
		Output: f.output(t), Exec: f.execute(t),
		CacheDir: func() (string, error) { return f.cache, nil },
		Environ: func() []string {
			return []string{"PATH=/host/bin", "PATH=/last/bin", "npm_config_cache=old", "NPM_CONFIG_CACHE=OLD", "MISE_NODE_VERIFY=false", "MISE_NODE_GPG_VERIFY=false", "MISE_IDIOMATIC_VERSION_FILE_ENABLE_TOOLS=python", "KEEP=yes"}
		},
	}
	return f
}

func (f *fakeRun) output(t *testing.T) func(context.Context, string, []string, string, ...string) (int, []byte, error) {
	return func(ctx context.Context, dir string, env []string, name string, args ...string) (int, []byte, error) {
		t.Helper()
		index := len(f.calls) - 1
		f.calls = append(f.calls, name+" "+strings.Join(args, " "))
		if dir != f.root || index >= len(f.results) {
			t.Fatalf("unexpected output call %q in %q", f.calls, dir)
		}
		wantDeadline := QueryDeadline
		if index == 0 {
			wantDeadline = InstallDeadline
		}
		assertDeadline(t, ctx, wantDeadline)
		if index == 0 {
			f.miseEnv = append([]string(nil), env...)
		}
		if !reflect.DeepEqual(env, f.miseEnv) {
			t.Fatalf("query env changed: %q", env)
		}
		result := f.results[index]
		return result.status, []byte(result.output), result.err
	}
}

func (f *fakeRun) execute(t *testing.T) func(context.Context, string, []string, []string, io.Writer, io.Writer) (int, error) {
	return func(ctx context.Context, dir string, env, argv []string, stdout, stderr io.Writer) (int, error) {
		t.Helper()
		f.calls = append(f.calls, "exec")
		if dir != f.root || stdout == nil || stderr == nil {
			t.Fatalf("invalid exec in %q", dir)
		}
		assertDeadline(t, ctx, RunDeadline)
		f.gateEnv, f.gateArgv, f.gateStdout = env, argv, stdout
		return f.gateStatus, f.gateErr
	}
}

func assertDeadline(t *testing.T, ctx context.Context, want time.Duration) {
	t.Helper()
	deadline, ok := ctx.Deadline()
	if remaining := time.Until(deadline); !ok || remaining <= 0 || remaining > want {
		t.Fatalf("deadline remaining %s, want positive and <= %s", remaining, want)
	}
}

func writePin(t *testing.T, root, content string) {
	t.Helper()
	if err := os.WriteFile(filepath.Join(root, PinFile), []byte(content), 0o600); err != nil {
		t.Fatal(err)
	}
}

func environmentValues(environment []string, key string) []string {
	var values []string
	for _, entry := range environment {
		name, value, _ := strings.Cut(entry, "=")
		if strings.EqualFold(name, key) {
			values = append(values, value)
		}
	}
	return values
}

func TestRunPinnedNodeGate(t *testing.T) {
	t.Parallel()
	for _, wantStatus := range []int{0, 7} {
		t.Run(string(rune('0'+wantStatus)), func(t *testing.T) {
			f := newFakeRun(t)
			f.gateStatus = wantStatus
			var stdout, stderr bytes.Buffer
			status, err := Run(t.Context(), f.root, f.deps, &stdout, &stderr)
			if err != nil || status != wantStatus {
				t.Fatalf("Run = %d, %v", status, err)
			}
			wantCalls := []string{"look:mise", filepath.Join(f.root, "mise") + " install node", filepath.Join(f.root, "mise") + " where node", filepath.Join(f.install, "bin", "node") + " --version", "exec"}
			if !reflect.DeepEqual(f.calls, wantCalls) || !reflect.DeepEqual(f.gateArgv, GateArgv) || f.gateStdout != &stdout {
				t.Fatalf("calls %q argv %q", f.calls, f.gateArgv)
			}
			assertGateEnvironment(t, f)
			wantLine := "pinned-node-gate: node v26.13.0 from " + filepath.Join(f.install, "bin") + " first on PATH; npm cache " + filepath.Join(f.cache, "20-watts-was-enough", "npm") + "; gate under admit\n"
			if stderr.String() != wantLine {
				t.Fatalf("stderr = %q", stderr.String())
			}
		})
	}
}

func TestRunKeepsMiseSettingsOutOfGate(t *testing.T) {
	t.Parallel()
	f := newFakeRun(t)
	f.deps.Environ = func() []string { return []string{"PATH=/host/bin", "KEEP=yes"} }
	if _, err := Run(t.Context(), f.root, f.deps, io.Discard, io.Discard); err != nil {
		t.Fatal(err)
	}
	for _, entry := range f.gateEnv {
		if strings.HasPrefix(entry, "MISE_") {
			t.Fatalf("mise setting leaked into gate: %q", entry)
		}
	}
}

func assertGateEnvironment(t *testing.T, f *fakeRun) {
	t.Helper()
	cache := filepath.Join(f.cache, "20-watts-was-enough", "npm")
	for key, want := range map[string]string{"PATH": filepath.Join(f.install, "bin") + string(os.PathListSeparator) + "/last/bin", "npm_config_cache": cache, "KEEP": "yes", "MISE_NODE_VERIFY": "false", "MISE_NODE_GPG_VERIFY": "false", "MISE_IDIOMATIC_VERSION_FILE_ENABLE_TOOLS": "python"} {
		if got := environmentValues(f.gateEnv, key); !reflect.DeepEqual(got, []string{want}) {
			t.Errorf("gate %s = %q", key, got)
		}
	}
	for key, want := range map[string]string{"MISE_IDIOMATIC_VERSION_FILE_ENABLE_TOOLS": "node", "MISE_NODE_VERIFY": "true", "MISE_NODE_GPG_VERIFY": "true"} {
		if got := environmentValues(f.miseEnv, key); !reflect.DeepEqual(got, []string{want}) {
			t.Errorf("mise %s = %q", key, got)
		}
	}
	if info, err := os.Stat(cache); err != nil || !info.IsDir() {
		t.Fatalf("cache missing: %v", err)
	}
}

func TestReadPin(t *testing.T) {
	t.Parallel()
	for _, tc := range []struct{ name, content, want, message string }{
		{"release", "26.13.0\n", "26.13.0", ""},
		{"no final LF", "26.13.0", "26.13.0", ""},
		{"zero", "0.0.0", "0.0.0", ""},
		{"short", "26.13", "", "MAJOR.MINOR.PATCH"},
		{"prefix", "v26.13.0", "", "MAJOR.MINOR.PATCH"},
		{"CRLF", "26.13.0\r\n", "", "MAJOR.MINOR.PATCH"},
		{"space", " 26.13.0", "", "MAJOR.MINOR.PATCH"},
		{"two lines", "26.13.0\n26.13.0", "", "MAJOR.MINOR.PATCH"},
		{"leading zero", "01.2.3", "", "MAJOR.MINOR.PATCH"},
		{"empty", "", "", "MAJOR.MINOR.PATCH"},
		{"64 invalid", strings.Repeat("x", 64), "", "MAJOR.MINOR.PATCH"},
		{"65 oversized", strings.Repeat("x", 65), "", "exceeds 64 bytes"},
		{"64 valid", strings.Repeat("1", 60) + ".0.0", strings.Repeat("1", 60) + ".0.0", ""},
	} {
		t.Run(tc.name, func(t *testing.T) {
			root := t.TempDir()
			writePin(t, root, tc.content)
			got, err := ReadPin(root)
			if tc.message == "" {
				if err != nil || got != tc.want {
					t.Fatalf("ReadPin = %q, %v", got, err)
				}
			} else if err == nil || !strings.Contains(err.Error(), tc.message) || !strings.Contains(err.Error(), PinFile) || !strings.Contains(err.Error(), `"`) {
				t.Fatalf("ReadPin error = %v, want %s with quoted content", err, tc.message)
			}
		})
	}
}

func TestRunRefusesMissingPinAndMise(t *testing.T) {
	t.Parallel()
	for _, name := range []string{"pin", "mise"} {
		t.Run(name, func(t *testing.T) {
			f := newFakeRun(t)
			message := PinFile
			if name == "pin" {
				if err := os.Remove(filepath.Join(f.root, PinFile)); err != nil {
					t.Fatal(err)
				}
			} else {
				f.deps.LookPath = func(string) (string, error) { return "", errors.New("missing") }
				message = "mise is not on PATH; the pre-push gate takes node 26.13.0 from .node-version through mise (decision 0129)"
			}
			_, err := Run(t.Context(), f.root, f.deps, io.Discard, io.Discard)
			if err == nil || !strings.Contains(err.Error(), message) || f.gateArgv != nil {
				t.Fatalf("Run = %v; exec = %q", err, f.gateArgv)
			}
		})
	}
}

func TestRunRefusesFailedNodePreparation(t *testing.T) {
	t.Parallel()
	for _, tc := range []struct {
		name    string
		step    int
		result  outputResult
		message string
	}{
		{"checksum", 0, outputResult{status: 1, output: "Checksum mismatch"}, "mise install node failed (exit 1): Checksum mismatch"},
		{"install deadline", 0, outputResult{err: context.DeadlineExceeded}, "context deadline exceeded"},
		{"empty where", 1, outputResult{}, "one absolute install directory"},
		{"relative where", 1, outputResult{output: "relative"}, "one absolute install directory"},
		{"two line where", 1, outputResult{output: "/one\n/two\n"}, "one absolute install directory"},
		{"where error", 1, outputResult{status: 2}, "mise where node failed (exit 2)"},
		{"version error", 2, outputResult{err: context.DeadlineExceeded}, "node --version failed"},
		{"version mismatch", 2, outputResult{output: "v26.13.1"}, `.node-version pins 26.13.0`},
	} {
		t.Run(tc.name, func(t *testing.T) {
			f := newFakeRun(t)
			f.results[tc.step] = tc.result
			_, err := Run(t.Context(), f.root, f.deps, io.Discard, io.Discard)
			if err == nil || !strings.Contains(err.Error(), tc.message) || f.gateArgv != nil {
				t.Fatalf("Run = %v, exec = %q", err, f.gateArgv)
			}
			if tc.name == "version mismatch" && !strings.Contains(err.Error(), "v26.13.1") {
				t.Fatalf("missing reported version: %v", err)
			}
			if tc.result.err != nil && !errors.Is(err, tc.result.err) {
				t.Fatalf("lost cause: %v", err)
			}
		})
	}
}

func TestRunReportsOnlyInstallOutputTail(t *testing.T) {
	t.Parallel()
	f := newFakeRun(t)
	f.results[0] = outputResult{status: 1, output: "DROP THIS" + strings.Repeat("x", 4096) + "Checksum mismatch"}
	_, err := Run(t.Context(), f.root, f.deps, io.Discard, io.Discard)
	if err == nil || strings.Contains(err.Error(), "DROP THIS") || !strings.HasSuffix(err.Error(), "Checksum mismatch") {
		t.Fatalf("unexpected output tail: %v", err)
	}
	prefix := "mise install node failed (exit 1): "
	if len(strings.TrimPrefix(err.Error(), prefix)) != 2048 || f.gateArgv != nil {
		t.Fatalf("tail length or exec: %d %q", len(err.Error()), f.gateArgv)
	}
}

func TestRunRefusesCacheFailure(t *testing.T) {
	t.Parallel()
	for _, name := range []string{"lookup", "mkdir"} {
		t.Run(name, func(t *testing.T) {
			f := newFakeRun(t)
			if name == "lookup" {
				f.deps.CacheDir = func() (string, error) { return "", errors.New("cache unavailable") }
			} else {
				f.deps.CacheDir = func() (string, error) { return filepath.Join(f.root, PinFile), nil }
			}
			_, err := Run(t.Context(), f.root, f.deps, io.Discard, io.Discard)
			if err == nil || !strings.Contains(err.Error(), "npm cache") || f.gateArgv != nil {
				t.Fatalf("Run = %v, exec = %q", err, f.gateArgv)
			}
		})
	}
}

func TestRunWrapsGateFailure(t *testing.T) {
	t.Parallel()
	f := newFakeRun(t)
	f.gateErr = context.Canceled
	_, err := Run(t.Context(), f.root, f.deps, io.Discard, io.Discard)
	if !errors.Is(err, context.Canceled) || !strings.Contains(err.Error(), "admitted pre-push gate") {
		t.Fatalf("Run = %v", err)
	}
}

func TestGateArgvMatchesRepositoryPins(t *testing.T) {
	t.Parallel()
	for _, tc := range []struct{ name, line string }{
		{"lefthook.yml", "run: " + GeneratedGateLine},
		{"lefthook-local.yml", "run: go -C tooling run ./cmd/20w hooks pre-push-gate --root .."},
	} {
		t.Run(tc.name, func(t *testing.T) {
			body, err := os.ReadFile(filepath.Join("..", "..", "..", tc.name))
			if err != nil {
				t.Fatal(err)
			}
			if strings.Count(string(body), tc.line) != 1 {
				t.Fatalf("%s must contain %q exactly once", tc.name, tc.line)
			}
		})
	}
	if len(GateArgv) != 16 || GateArgv[9] != "--" || strings.Join(GateArgv[10:], " ") != GeneratedGateLine {
		t.Fatalf("gate argv = %q", GateArgv)
	}
	for flag, want := range map[int]time.Duration{6: AdmitWait, 8: AdmitTimeout} {
		got, err := time.ParseDuration(GateArgv[flag])
		if err != nil || got != want {
			t.Fatalf("duration %q = %s, %v; want %s", GateArgv[flag], got, err, want)
		}
	}
}
