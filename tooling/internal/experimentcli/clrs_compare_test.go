package experimentcli

import (
	"bytes"
	"encoding/json"
	"io"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/clrsfixture"
)

func TestCLRSComparisonCLIUsageFailures(t *testing.T) {
	for _, args := range [][]string{
		nil, {"--json"}, {"--first", "one"}, {"--second", "two"}, {"--first"}, {"--unknown"}, {"extra"},
		{"--first", "one", "--second", "two", "extra"}, {"--first", "one", "--second", "two", "--json=invalid"},
		{"--root=", "--first", "one", "--second", "two"},
	} {
		var stdout, stderr bytes.Buffer
		code := runCommand(t, append([]string{"compare-clrs-fixtures"}, args...), &stdout, &stderr)
		if code != 2 || stdout.Len() != 0 {
			t.Fatalf("args %v: code=%d stdout=%q", args, code, stdout.String())
		}
	}
}

func TestCLRSComparisonCLIReportsSuccessAndFailureJSON(t *testing.T) {
	root := cliComparisonFixture(t)
	args := []string{"compare-clrs-fixtures", "--root", root, "--first", "first", "--second", "second"}
	var stdout, stderr bytes.Buffer
	if code := runCommand(t, args, &stdout, &stderr); code != 0 || stderr.Len() != 0 || !strings.Contains(stdout.String(), "48 imported examples") || !strings.Contains(stdout.String(), "NO_RESULT") {
		t.Fatalf("human result: %d %q %q", code, stdout.String(), stderr.String())
	}
	stdout.Reset()
	if code := runCommand(t, append(args, "--json"), &stdout, &stderr); code != 0 || stderr.Len() != 0 {
		t.Fatalf("JSON result: %d %q", code, stderr.String())
	}
	var report clrsfixture.FixtureComparison
	if err := json.Unmarshal(stdout.Bytes(), &report); err != nil || report.State != "fixtures-byte-equal-and-import-valid" || report.FirstExamples != 48 || report.Authority != "NO_RESULT" {
		t.Fatalf("success report: %#v %v", report, err)
	}
	first := append([]byte(nil), stdout.Bytes()...)
	stdout.Reset()
	if code := runCommand(t, append(args, "--json"), &stdout, &stderr); code != 0 || !bytes.Equal(first, stdout.Bytes()) {
		t.Fatal("JSON output changed between identical checks")
	}
	path := filepath.Join(root, "second/shakedown/insertion_sort.json")
	body, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, append(body, ' '), 0o600); err != nil {
		t.Fatal(err)
	}
	stdout.Reset()
	stderr.Reset()
	if code := runCommand(t, append(args, "--json"), &stdout, &stderr); code != 1 || stderr.Len() == 0 {
		t.Fatalf("mismatch result: %d %q", code, stderr.String())
	}
	if err := json.Unmarshal(stdout.Bytes(), &report); err != nil || report.State != "failed" || report.Error == "" || report.FirstExamples != 48 || report.SecondExamples != 48 {
		t.Fatalf("failure report: %#v %v", report, err)
	}
	stdout.Reset()
	if code := runCommand(t, args, &stdout, &stderr); code != 1 || stdout.Len() != 0 {
		t.Fatal("human validation failure must not emit success stdout")
	}
}

func TestCLRSComparisonCLIRejectsMissingPathsAndOutputFailure(t *testing.T) {
	var stdout, stderr bytes.Buffer
	args := []string{"compare-clrs-fixtures", "--root", t.TempDir(), "--first", "missing", "--second", "also-missing", "--json"}
	if code := runCommand(t, args, &stdout, &stderr); code != 1 || !json.Valid(stdout.Bytes()) || stderr.Len() == 0 {
		t.Fatalf("missing path: %d %q %q", code, stdout.String(), stderr.String())
	}
	root := cliComparisonFixture(t)
	args = []string{"compare-clrs-fixtures", "--root", root, "--first", "first", "--second", "second", "--json"}
	stderr.Reset()
	if code := runCommand(t, args, comparisonShortWriter{}, &stderr); code != 1 || !strings.Contains(stderr.String(), io.ErrShortWrite.Error()) {
		t.Fatalf("short output: %d %q", code, stderr.String())
	}
}

type comparisonShortWriter struct{}

func (comparisonShortWriter) Write(body []byte) (int, error) { return len(body) - 1, nil }

func cliComparisonFixture(t *testing.T) string {
	t.Helper()
	root := t.TempDir()
	for _, name := range []string{"upstream.json", "contract.json"} {
		body, err := os.ReadFile(filepath.Join("..", "..", "clrs-generator", name))
		if err != nil {
			t.Fatal(err)
		}
		writeCLIComparisonFile(t, filepath.Join(root, "tooling/clrs-generator", name), body)
	}
	sourceBody, err := os.ReadFile(filepath.Join(root, "tooling/clrs-generator/upstream.json"))
	if err != nil {
		t.Fatal(err)
	}
	source, err := clrsfixture.ParseSourceRecord(sourceBody)
	if err != nil {
		t.Fatal(err)
	}
	contractBody, err := os.ReadFile(filepath.Join(root, "tooling/clrs-generator/contract.json"))
	if err != nil {
		t.Fatal(err)
	}
	contract, err := clrsfixture.ParseGenerationContract(contractBody, source)
	if err != nil {
		t.Fatal(err)
	}
	plan, err := contract.Plan(source)
	if err != nil {
		t.Fatal(err)
	}
	for _, task := range plan.Tasks {
		examples := []any{}
		for _, size := range task.Sizes {
			for _, seed := range plan.Seeds {
				examples = append(examples, map[string]any{"prompt": string(task.Task) + ":\nsynthetic candidate input", "references": []string{"synthetic verifier answer"}, "auxiliary": map[string]any{"length": size.RequestedLength, "seed": seed, "use_hints": false}})
			}
		}
		body, err := json.Marshal(map[string]any{"name": "clrs_text_" + string(task.Task), "examples": examples})
		if err != nil {
			t.Fatal(err)
		}
		for _, tree := range []string{"first", "second"} {
			writeCLIComparisonFile(t, filepath.Join(root, tree, task.OutputRelativePath), body)
		}
	}
	return root
}

func writeCLIComparisonFile(t *testing.T, path string, body []byte) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, body, 0o600); err != nil {
		t.Fatal(err)
	}
}
