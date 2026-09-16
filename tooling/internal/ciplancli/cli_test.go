package ciplancli

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

	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/ciplan"
)

const fullJSON = `{"schema":2,"mode":"full","reason":"explicit-full","changed_paths":[],"lanes":["full","renderer"]}` + "\n"

const impactJSON = `{"schema":2,"mode":"impact","reason":"mapped-change-set","base_revision":"1111111111111111111111111111111111111111","head_revision":"2222222222222222222222222222222222222222","changed_paths":["app/main.tsx"],"lanes":["site"]}`

func TestRunPlanUsesExistingAuthorityAndStableOutput(t *testing.T) {
	root := planFixture(t)
	for _, test := range []struct {
		name string
		args []string
		want string
	}{
		{"JSON", []string{"--json"}, fullJSON},
		{"human", nil, "CI plan: full (explicit-full)\nCI lanes: full,renderer\n"},
	} {
		t.Run(test.name, func(t *testing.T) {
			var stdout, stderr bytes.Buffer
			args := append([]string{"plan", "--root", root, "--full"}, test.args...)
			if code := Run(args, nil, &stdout, &stderr); code != 0 || stderr.Len() != 0 || stdout.String() != test.want {
				t.Fatalf("exit=%d, stdout=%q, stderr=%q", code, stdout.String(), stderr.String())
			}
		})
	}
}

func TestPlanPreservesParsedOptions(t *testing.T) {
	want := ciplan.Options{RepositoryRoot: "chosen-root", BaseRevision: strings.Repeat("1", 40), HeadRevision: strings.Repeat("2", 40), ForceFull: true}
	called := 0
	build := func(_ context.Context, got ciplan.Options) (ciplan.Plan, error) {
		called++
		if !reflect.DeepEqual(got, want) {
			t.Fatalf("options=%#v, want %#v", got, want)
		}
		return fullPlan(), nil
	}
	var stdout, stderr bytes.Buffer
	code := runPlan([]string{"--root", want.RepositoryRoot, "--base", want.BaseRevision, "--head", want.HeadRevision, "--full", "--json"}, &stdout, &stderr, build)
	if code != 0 || called != 1 || stdout.String() != fullJSON || stderr.Len() != 0 {
		t.Fatalf("exit=%d, calls=%d, stdout=%q, stderr=%q", code, called, stdout.String(), stderr.String())
	}
}

func TestPlanRejectsArgumentsBeforeBuilding(t *testing.T) {
	for _, args := range [][]string{{"--base", strings.Repeat("1", 40)}, {"--head", strings.Repeat("2", 40)}, {"--unknown"}, {"--root"}, {"unexpected"}, {"--help"}} {
		var stdout, stderr bytes.Buffer
		code := runPlan(args, &stdout, &stderr, func(context.Context, ciplan.Options) (ciplan.Plan, error) {
			t.Fatal("invalid arguments reached the planner")
			return ciplan.Plan{}, nil
		})
		if code != 2 || stdout.Len() != 0 {
			t.Fatalf("args=%q: exit=%d stdout=%q", args, code, stdout.String())
		}
	}
}

func TestPlanRejectsMissingOrMalformedMappingEvenWithFull(t *testing.T) {
	for _, malformed := range []bool{false, true} {
		root := planFixture(t)
		mapping := filepath.Join(root, ".github", "ci-impact.json")
		var err error
		if malformed {
			err = os.WriteFile(mapping, []byte(`{"schema":1,"schema":1}`), 0o600)
		} else {
			err = os.Remove(mapping)
		}
		if err != nil {
			t.Fatal(err)
		}
		var stdout, stderr bytes.Buffer
		if code := RunPlan([]string{"--root", root, "--full", "--json"}, &stdout, &stderr); code != 1 || stdout.Len() != 0 || !strings.Contains(stderr.String(), "Build bounded CI plan:") {
			t.Fatalf("malformed=%t exit=%d stdout=%q stderr=%q", malformed, code, stdout.String(), stderr.String())
		}
	}
}

func TestProjectWritesOnlyFixedOutputs(t *testing.T) {
	var stdout, stderr bytes.Buffer
	code := Run([]string{"project"}, strings.NewReader(impactJSON), &stdout, &stderr)
	want := "mode=impact\nreason=mapped-change-set\ncontainer=false\ndependency=false\ngo=false\nrelease=false\nrenderer=false\nrenderer_proof=none\nresearch=false\nsite=true\nworkstation_any=false\nworkstation_matrix=[]\n"
	if code != 0 || stdout.String() != want || stderr.Len() != 0 {
		t.Fatalf("exit=%d stdout=%q stderr=%q", code, stdout.String(), stderr.String())
	}
}

func TestProjectRejectsUntrustedOrExcessiveInputWithoutOutput(t *testing.T) {
	for _, body := range []string{
		"", impactJSON + "{}", strings.Replace(impactJSON, `"schema":2`, `"schema":2,"schema":2`, 1),
		strings.Replace(impactJSON, `"schema":2`, `"unknown":true,"schema":2`, 1),
		strings.Replace(impactJSON, `"site"`, `"not-a-lane"`, 1), strings.Repeat(" ", (8<<20)+1),
	} {
		var stdout, stderr bytes.Buffer
		if code := RunProject(nil, strings.NewReader(body), &stdout, &stderr); code != 1 || stdout.Len() != 0 || !strings.Contains(stderr.String(), "Project bounded CI plan:") {
			t.Fatalf("input bytes=%d: exit=%d stdout=%q stderr=%q", len(body), code, stdout.String(), stderr.String())
		}
	}
}

func TestPrivateDispatchRejectsUnknownCommandsWithoutReading(t *testing.T) {
	for _, args := range [][]string{nil, {"unknown"}, {"run-workstation"}, {"project", "extra"}} {
		var stdout, stderr bytes.Buffer
		if code := Run(args, rejectReader{t}, &stdout, &stderr); code != 2 || stdout.Len() != 0 || stderr.Len() == 0 {
			t.Fatalf("args=%q exit=%d stdout=%q stderr=%q", args, code, stdout.String(), stderr.String())
		}
	}
}

func TestOutputErrorsAndSilentShortWritesFail(t *testing.T) {
	for _, mode := range []string{"json", "human-first", "human-second", "project"} {
		for _, short := range []bool{false, true} {
			writer := &failingWriter{short: short, failAt: 1}
			if mode == "human-second" {
				writer.failAt = 2
			}
			var stderr bytes.Buffer
			var code int
			if mode == "project" {
				code = RunProject(nil, strings.NewReader(impactJSON), writer, &stderr)
			} else {
				var args []string
				if mode == "json" {
					args = []string{"--json"}
				}
				code = runPlan(args, writer, &stderr, func(context.Context, ciplan.Options) (ciplan.Plan, error) { return fullPlan(), nil })
			}
			if code != 1 || stderr.Len() == 0 || writer.calls != writer.failAt {
				t.Fatalf("mode=%s short=%t exit=%d calls=%d stderr=%q", mode, short, code, writer.calls, stderr.String())
			}
		}
	}
}

func planFixture(t *testing.T) string {
	t.Helper()
	root := t.TempDir()
	for _, directory := range []string{".git", ".github"} {
		if err := os.Mkdir(filepath.Join(root, directory), 0o700); err != nil {
			t.Fatal(err)
		}
	}
	body, err := os.ReadFile(filepath.Join("..", "..", "..", ".github", "ci-impact.json"))
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, ".github", "ci-impact.json"), body, 0o600); err != nil {
		t.Fatal(err)
	}
	return root
}

func fullPlan() ciplan.Plan {
	return ciplan.Plan{Schema: 2, Mode: "full", Reason: "explicit-full", ChangedPaths: []string{}, Lanes: []string{"full", "renderer"}}
}

type rejectReader struct{ t *testing.T }

func (reader rejectReader) Read([]byte) (int, error) {
	reader.t.Fatal("invalid command read its input")
	return 0, io.EOF
}

type failingWriter struct {
	short  bool
	failAt int
	calls  int
}

func (writer *failingWriter) Write(body []byte) (int, error) {
	writer.calls++
	if writer.calls != writer.failAt {
		return len(body), nil
	}
	if writer.short {
		return len(body) - 1, nil
	}
	return 0, errors.New("writer rejected output")
}
