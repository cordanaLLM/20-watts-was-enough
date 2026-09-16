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

	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/clrsfixture"
)

func generationCLIArguments(mode string) []string {
	return []string{mode, "--root", "/source", "--output", "/evidence/run", "--image-id", "sha256:" + strings.Repeat("a", 64),
		"--image-manifest", "sha256:" + strings.Repeat("a", 64), "--image-config", "sha256:" + strings.Repeat("b", 64),
		"--manifest-file", "/evidence/manifest.json", "--config-file", "/evidence/config.json"}
}

func TestGenerationCLIRejectsInvalidUseWithoutInvokingActions(t *testing.T) {
	unexpected := func(context.Context, clrsfixture.GeneratorFixtureRunOptions) (clrsfixture.GeneratorFixtureRun, error) {
		t.Fatal("invalid arguments invoked an action")
		return clrsfixture.GeneratorFixtureRun{}, nil
	}
	cases := [][]string{nil, {"--help"}, {"--unknown"}, {"--execute"}, {"--check"}, generationCLIArguments("--execute=false"),
		append(generationCLIArguments("--execute"), "--check"), append(generationCLIArguments("--check"), "positional")}
	for _, flag := range []string{"--root", "--output", "--image-id", "--image-manifest", "--image-config", "--manifest-file", "--config-file"} {
		cases = append(cases, append(generationCLIArguments("--check"), flag, ""))
	}
	for _, args := range cases {
		var out, diagnostic bytes.Buffer
		if code := runCLRSGenerationWithActions(args, &out, &diagnostic, unexpected, unexpected); code != 2 || out.Len() != 0 {
			t.Fatalf("%v: code=%d output=%q diagnostics=%q", args, code, out.String(), diagnostic.String())
		}
	}
}

func TestGenerationCLISelectsOneActionAndPreservesExplicitInputs(t *testing.T) {
	for _, mode := range []string{"--execute", "--check"} {
		var calls []string
		action := func(name string) clrsGenerationAction {
			return func(ctx context.Context, options clrsfixture.GeneratorFixtureRunOptions) (clrsfixture.GeneratorFixtureRun, error) {
				calls = append(calls, name)
				if ctx.Err() != nil || options.RepositoryRoot != "/source" || options.OutputDirectory != "/evidence/run" ||
					options.Image.LoadedID != "sha256:"+strings.Repeat("a", 64) || options.Image.ManifestDigest != options.Image.LoadedID ||
					options.Image.ConfigDigest != "sha256:"+strings.Repeat("b", 64) || options.Image.ManifestFile != "/evidence/manifest.json" || options.Image.ConfigFile != "/evidence/config.json" {
					t.Fatalf("changed explicit inputs: %#v", options)
				}
				return clrsfixture.GeneratorFixtureRun{Files: make([]clrsfixture.GeneratorFixtureFile, 6), ImportedExamples: 48}, nil
			}
		}
		var out, diagnostic bytes.Buffer
		code := runCLRSGenerationWithActions(generationCLIArguments(mode), &out, &diagnostic, action("--execute"), action("--check"))
		verb := "generated"
		if mode == "--check" {
			verb = "bundle checked"
		}
		want := "CLRS fixtures " + verb + ": 6 files, 48 imported examples; NO_RESULT, image admission remains blocked.\n"
		if code != 0 || !reflect.DeepEqual(calls, []string{mode}) || out.String() != want || diagnostic.Len() != 0 {
			t.Fatalf("%s: code=%d calls=%v stdout=%q stderr=%q", mode, code, calls, out.String(), diagnostic.String())
		}
	}
}

func TestGenerationCLIReportsValidationFailureWithoutDocker(t *testing.T) {
	for _, machine := range []bool{false, true} {
		args := append(generationCLIArguments("--check"), "--root", t.TempDir())
		if machine {
			args = append(args, "--json")
		}
		var out, diagnostic bytes.Buffer
		if code := runExperimentGenerateCLRSFixtures(args, &out, &diagnostic); code != 1 || !strings.Contains(diagnostic.String(), "CLRS generation:") {
			t.Fatalf("validation code=%d out=%q err=%q", code, out.String(), diagnostic.String())
		}
		if machine {
			var report clrsfixture.GeneratorFixtureRun
			if err := json.Unmarshal(out.Bytes(), &report); err != nil || report.State != "failed" || report.Authority != "NO_RESULT" || report.Error == "" {
				t.Fatalf("failure JSON: %q %v", out.String(), err)
			}
		} else if out.Len() != 0 {
			t.Fatalf("human failure wrote stdout: %q", out.String())
		}
	}
}

type generationCLIWriter struct{ err error }

func (writer generationCLIWriter) Write([]byte) (int, error) { return 0, writer.err }

func TestGenerationCLIRejectsFailedAndSilentShortOutput(t *testing.T) {
	for _, cause := range []error{nil, errors.New("output failed")} {
		if err := writeCLRSGenerationOutput(generationCLIWriter{cause}, []byte("report\n")); cause == nil && !errors.Is(err, io.ErrShortWrite) || cause != nil && !errors.Is(err, cause) {
			t.Fatalf("write cause=%v error=%v", cause, err)
		}
		var diagnostic bytes.Buffer
		action := func(context.Context, clrsfixture.GeneratorFixtureRunOptions) (clrsfixture.GeneratorFixtureRun, error) {
			return clrsfixture.GeneratorFixtureRun{}, nil
		}
		if code := runCLRSGenerationWithActions(generationCLIArguments("--check"), generationCLIWriter{cause}, &diagnostic, action, action); code != 1 || !strings.Contains(diagnostic.String(), "output:") {
			t.Fatalf("output code=%d err=%q", code, diagnostic.String())
		}
	}
}
