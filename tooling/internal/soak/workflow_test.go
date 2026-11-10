package soak

import (
	"errors"
	"fmt"
	"os"
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
	paths, err := filepath.Glob("../*/soak_test.go")
	if err != nil {
		t.Fatal(err)
	}
	reports := make(map[string]bool)
	for _, path := range paths {
		body, err := os.ReadFile(path)
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
	body, err := os.ReadFile(workflowPath)
	if err != nil {
		t.Fatal(err)
	}
	if err := workflowReportMismatch(string(body), reports); err != nil {
		t.Fatalf("%s: %v", workflowPath, err)
	}
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
