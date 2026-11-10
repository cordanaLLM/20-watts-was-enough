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
	soakReportPattern       = regexp.MustCompile(`RunTest\(t, config, "([^"]+\.jsonl)"`)
	workflowReportsPattern  = regexp.MustCompile(`(?m)^\s*for report in ([^\n;]+); do\s*$`)
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
		for _, match := range soakReportPattern.FindAllStringSubmatch(string(body), -1) {
			reports[match[1]] = true
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
