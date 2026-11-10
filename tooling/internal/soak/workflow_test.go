package soak

import (
	"errors"
	"os"
	"regexp"
	"testing"
	"time"
)

const workflowPath = "../../../.github/workflows/soak.yml"

var (
	workflowDurationPattern = regexp.MustCompile(`(?m)^\s+` + DurationVariable + `: (\S+)\s*$`)
	workflowTimeoutPattern  = regexp.MustCompile(`go -C tooling test .*-timeout (\S+) `)
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
