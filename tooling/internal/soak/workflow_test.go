package soak

import (
	"context"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"testing"
	"time"
)

const workflowPath = "../../../.github/workflows/soak.yml"

var (
	workflowDurationPattern = regexp.MustCompile(`(?m)^\s+` + DurationVariable + `: (\S+)\s*$`)
	workflowTimeoutPattern  = regexp.MustCompile(`go -C tooling test .*-timeout (\S+) `)
	// soakReportPattern assumes consumer soak tests pass the report name as
	// a string literal to RunTest(t, config, ...); consumerReports refuses
	// any other call form.
	soakReportPattern      = regexp.MustCompile(`RunTest\(t, config, "([^"]+\.jsonl)"`)
	workflowReportsPattern = regexp.MustCompile(`(?m)^\s*for report in ([^\n;]+); do\s*$`)
)

// TestWorkflowDurationsFitBounds keeps the scheduled workflow's one fixed
// duration and its test timeout inside the bounds Requested enforces, so a
// drifted value fails here instead of on the weekly run.
func TestWorkflowDurationsFitBounds(t *testing.T) {
	body, err := os.ReadFile(workflowPath)
	if err != nil {
		t.Fatal(err)
	}
	durations := workflowDurations(string(body))
	if len(durations) != 1 {
		t.Fatalf("%s: found %s values %q, want exactly one", workflowPath, DurationVariable, durations)
	}
	if _, err := parseDuration(durations[0]); err != nil {
		t.Errorf("%s: %v", workflowPath, err)
	}
	timeout, err := workflowTimeout(string(body))
	if err != nil {
		t.Fatalf("%s: %v", workflowPath, err)
	}
	if timeout < maximumDuration+FinishMargin {
		t.Errorf("%s: go test -timeout %s is shorter than %s plus %s", workflowPath, timeout, maximumDuration, FinishMargin)
	}
}

// TestWorkflowDurationsRejectDrift pins the negative case: a workflow
// duration above the maximum is found and refused.
func TestWorkflowDurationsRejectDrift(t *testing.T) {
	drifted := "        env:\n          " + DurationVariable + ": 30m\n"
	durations := workflowDurations(drifted)
	if len(durations) != 1 || durations[0] != "30m" {
		t.Fatalf("workflowDurations(%q) = %q, want [30m]", drifted, durations)
	}
	if _, err := parseDuration(durations[0]); err == nil {
		t.Fatal("parseDuration accepted a workflow duration above the maximum")
	}
}

// TestWorkflowRequiresEveryReport pins the positive case: the workflow requires
// exactly the reports produced by every consumer soak test.
func TestWorkflowRequiresEveryReport(t *testing.T) {
	reports := collectConsumerReports(t)
	body, err := os.ReadFile(workflowPath)
	if err != nil {
		t.Fatal(err)
	}
	if err := workflowReportMismatch(string(body), reports); err != nil {
		t.Fatalf("%s: %v", workflowPath, err)
	}
}

// collectConsumerReports returns the report names of every consumer soak test
// in the sibling packages, read through an os.Root on the parent directory,
// failing t when a file cannot be read, a RunTest call has no literal report
// name, or no names are found.
func collectConsumerReports(t *testing.T) map[string]bool {
	t.Helper()
	root, err := os.OpenRoot("..")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if err := root.Close(); err != nil {
			t.Error(err)
		}
	})
	paths, err := fs.Glob(root.FS(), "*/soak_test.go")
	if err != nil {
		t.Fatal(err)
	}
	reports := make(map[string]bool)
	for _, path := range paths {
		body, err := fs.ReadFile(root.FS(), path)
		if err != nil {
			t.Fatal(err)
		}
		names, err := consumerReports(path, string(body))
		if err != nil {
			t.Fatal(err)
		}
		for _, name := range names {
			reports[name] = true
		}
	}
	if len(reports) == 0 {
		t.Fatal("no consumer soak report names found")
	}
	return reports
}

// TestWorkflowReportStepRejectsMissingOrEmptyReport pins the positive,
// negative and boundary cases by executing the workflow's report guard.
func TestWorkflowReportStepRejectsMissingOrEmptyReport(t *testing.T) {
	if _, err := exec.LookPath("bash"); err != nil {
		t.Skipf("workflow report step requires bash: %v", err)
	}
	reports := collectConsumerReports(t)
	body, err := os.ReadFile(workflowPath)
	if err != nil {
		t.Fatal(err)
	}
	script, err := reportStepScript(string(body))
	if err != nil {
		t.Fatalf("%s: %v", workflowPath, err)
	}
	t.Run("all non-empty", func(t *testing.T) {
		dir := writeReportFixtures(t, reports, "", false)
		if err := runReportStep(t, script, dir); err != nil {
			t.Fatal(err)
		}
	})
	names := make([]string, 0, len(reports))
	for name := range reports {
		names = append(names, name)
	}
	sort.Strings(names)
	for _, name := range names {
		for _, state := range []string{"missing", "empty"} {
			t.Run(state+"/"+name, func(t *testing.T) {
				dir := writeReportFixtures(t, reports, name, state == "empty")
				err := runReportStep(t, script, dir)
				want := "missing or empty soak report " + name
				if err == nil || !strings.Contains(err.Error(), want) {
					t.Fatalf("runReportStep() = %v, want %q", err, want)
				}
			})
		}
	}
}

// writeReportFixtures writes every report in a fresh directory with one
// non-empty line, except target: left out, or written empty when empty is true.
func writeReportFixtures(t *testing.T, reports map[string]bool, target string, empty bool) string {
	t.Helper()
	dir := t.TempDir()
	for name := range reports {
		content := []byte("{}\n")
		if name == target {
			if !empty {
				continue
			}
			content = nil
		}
		if err := os.WriteFile(filepath.Join(dir, name), content, 0o600); err != nil {
			t.Fatal(err)
		}
	}
	return dir
}

// TestWorkflowReportStepScript pins extraction, indentation and refusal of
// missing run blocks, including a block that belongs to the following step.
func TestWorkflowReportStepScript(t *testing.T) {
	const step = "  - name: Require every soak report\n"
	for _, tc := range []struct {
		name string
		body string
		want string
	}{
		{"nested shell", step + "    run: |\n      for report in a; do\n        echo done\n      done\n  - name: next\n    run: |\n      false\n", "for report in a; do\n  echo done\ndone\n"},
		{"blank line", step + "    run: |\n\n      true\n    shell: bash\n", "\ntrue\n"},
		{"missing step", "  - name: another step\n    run: |\n      true\n", ""},
		{"missing run", step + "    shell: bash\n", ""},
		{"following run", step + "  - name: next\n    run: |\n      true\n", ""},
		{"nested run key", step + "    env:\n      run: |\n        true\n", ""},
		{"empty run", step + "    run: |\n    shell: bash\n", ""},
	} {
		t.Run(tc.name, func(t *testing.T) {
			got, err := reportStepScript(tc.body)
			if tc.want == "" {
				if err == nil {
					t.Fatalf("reportStepScript() = %q, want an extraction error", got)
				}
				return
			}
			if err != nil || got != tc.want {
				t.Fatalf("reportStepScript() = %q, %v; want %q, nil", got, err, tc.want)
			}
		})
	}
}

// reportStepScript returns the run: | block of the workflow step named
// "Require every soak report", with its indentation removed. It refuses a
// missing step or block instead of returning a neighbouring step's script.
func reportStepScript(body string) (string, error) {
	lines := strings.Split(body, "\n")
	stepIndent := -1
	for i, line := range lines {
		trimmed := strings.TrimSpace(line)
		if trimmed == "" {
			continue
		}
		indent := len(line) - len(strings.TrimLeft(line, " "))
		if stepIndent < 0 {
			if trimmed == "- name: Require every soak report" {
				stepIndent = indent
			}
			continue
		}
		if indent <= stepIndent {
			break
		}
		if trimmed == "run: |" && indent == stepIndent+2 {
			return reportBlockScript(lines[i+1:], indent)
		}
	}
	return "", errors.New("missing Require every soak report step or its run: | block")
}

// reportBlockScript returns the block-scalar lines that follow a run: key at
// runIndent, with only their common indentation removed, so deeper shell
// indentation survives.
func reportBlockScript(lines []string, runIndent int) (string, error) {
	var block []string
	commonIndent := -1
	for _, line := range lines {
		if strings.TrimSpace(line) == "" {
			block = append(block, "")
			continue
		}
		indent := len(line) - len(strings.TrimLeft(line, " "))
		if indent <= runIndent {
			break
		}
		if commonIndent < 0 || indent < commonIndent {
			commonIndent = indent
		}
		block = append(block, line)
	}
	if commonIndent < 0 {
		return "", errors.New("empty Require every soak report run: | block")
	}
	prefix := strings.Repeat(" ", commonIndent)
	for i, line := range block {
		block[i] = strings.TrimPrefix(line, prefix)
	}
	return strings.Join(block, "\n") + "\n", nil
}

// runReportStep runs script under bash with a 10 s deadline and an environment
// of only PATH and TWENTYW_SOAK_REPORT_DIR=dir, and returns its exit error
// wrapped with the combined output.
func runReportStep(t *testing.T, script, dir string) error {
	t.Helper()
	ctx, cancel := context.WithTimeout(t.Context(), 10*time.Second)
	defer cancel()
	cmd := exec.CommandContext(ctx, "bash", "-s")
	cmd.Stdin = strings.NewReader(script)
	cmd.Env = []string{"PATH=" + os.Getenv("PATH"), "TWENTYW_SOAK_REPORT_DIR=" + dir}
	output, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("report step: %w\n%s", err, output)
	}
	return nil
}

// TestWorkflowRejectsNonLiteralReport pins the negative case: a consumer call
// without a literal report name fails extraction and names its source path.
func TestWorkflowRejectsNonLiteralReport(t *testing.T) {
	body := `err = soak.RunTest(t, config, reportName, func(ctx context.Context, _ int) error {`
	_, err := consumerReports("consumer/soak_test.go", body)
	if err == nil || !strings.Contains(err.Error(), "consumer/soak_test.go: 1 RunTest calls, 0 with a literal report name") {
		t.Fatalf("consumerReports() = %v, want source path and nonliteral report diagnostic", err)
	}
}

// TestConsumerReportsReadsLiteralNames pins the positive case: two literal
// report names are extracted in source order without an error.
func TestConsumerReportsReadsLiteralNames(t *testing.T) {
	body := `soak.RunTest(t, config, "a.jsonl", f)
soak.RunTest(t, config, "b.jsonl", f)`
	names, err := consumerReports("consumer/soak_test.go", body)
	if err != nil {
		t.Fatal(err)
	}
	if len(names) != 2 || names[0] != "a.jsonl" || names[1] != "b.jsonl" {
		t.Fatalf("consumerReports() = %q, want [a.jsonl b.jsonl]", names)
	}
}

// consumerReports returns, in source order, the report names a consumer soak
// test passes to RunTest. It refuses the file, naming path, when any RunTest
// call does not pass its report as a string literal, so a drifted call fails
// here instead of shrinking the set the workflow is compared with.
func consumerReports(path, body string) ([]string, error) {
	matches := soakReportPattern.FindAllStringSubmatch(body, -1)
	if calls := strings.Count(body, "RunTest("); calls != len(matches) {
		return nil, fmt.Errorf("%s: %d RunTest calls, %d with a literal report name; pass the report as a string literal: RunTest(t, config, \"<name>.jsonl\", ...)", path, calls, len(matches))
	}
	var names []string
	for _, match := range matches {
		names = append(names, match[1])
	}
	return names, nil
}

// TestWorkflowRejectsMissingReport pins the negative case: a workflow missing
// one required report fails comparison and names the missing report.
func TestWorkflowRejectsMissingReport(t *testing.T) {
	reports := map[string]bool{"first.jsonl": true, "second.jsonl": true}
	err := workflowReportMismatch("for report in first.jsonl; do\n", reports)
	if err == nil || !strings.Contains(err.Error(), "missing [second.jsonl]") {
		t.Fatalf("workflowReportMismatch() = %v, want missing second.jsonl", err)
	}
}

// workflowReportMismatch compares the names in the workflow's report-check
// loop with reports and returns an error naming the missing and extra
// entries in sorted order, or nil when both sets match.
func workflowReportMismatch(body string, reports map[string]bool) error {
	match := workflowReportsPattern.FindStringSubmatch(body)
	if match == nil {
		return errors.New("no for report in loop in the soak step")
	}
	required := make(map[string]bool)
	for _, name := range strings.Fields(match[1]) {
		required[name] = true
	}
	var missing, extra []string
	for name := range reports {
		if !required[name] {
			missing = append(missing, name)
		}
	}
	for name := range required {
		if !reports[name] {
			extra = append(extra, name)
		}
	}
	if len(missing) == 0 && len(extra) == 0 {
		return nil
	}
	sort.Strings(missing)
	sort.Strings(extra)
	return fmt.Errorf("soak report mismatch: missing %v; extra %v", missing, extra)
}

// workflowDurations returns every value the workflow assigns to
// DurationVariable.
func workflowDurations(body string) []string {
	var durations []string
	for _, match := range workflowDurationPattern.FindAllStringSubmatch(body, -1) {
		durations = append(durations, match[1])
	}
	return durations
}

// workflowTimeout returns the -timeout flag of the soak step's go test
// command.
func workflowTimeout(body string) (time.Duration, error) {
	match := workflowTimeoutPattern.FindStringSubmatch(body)
	if match == nil {
		return 0, errors.New("no go test -timeout flag in the soak step")
	}
	return time.ParseDuration(match[1])
}
