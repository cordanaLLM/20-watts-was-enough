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
	workflowDurationPattern = regexp.MustCompile(`(?m)^\s+(?:default:|-) (\d+m)\s*$|inputs\.duration \|\| '([^']+)'`)
	workflowTimeoutPattern  = regexp.MustCompile(`go -C tooling test .*-timeout (\S+) `)
)

// TestWorkflowDurationsFitBounds keeps the scheduled workflow's durations
// and test timeout inside the bounds Requested enforces, so a drifted choice
// fails here instead of on the weekly run.
func TestWorkflowDurationsFitBounds(t *testing.T) {
	body, err := os.ReadFile(workflowPath)
	if err != nil {
		t.Fatal(err)
	}
	durations := workflowDurations(string(body))
	// default, three dispatch options, and the scheduled fallback.
	if len(durations) != 5 {
		t.Fatalf("%s: found durations %q, want default, three options and the fallback", workflowPath, durations)
	}
	for _, value := range durations {
		if _, err := parseDuration(value); err != nil {
			t.Errorf("%s: %v", workflowPath, err)
		}
	}
	timeout, err := workflowTimeout(string(body))
	if err != nil {
		t.Fatalf("%s: %v", workflowPath, err)
	}
	if timeout < maximumDuration+FinishMargin {
		t.Errorf("%s: go test -timeout %s is shorter than %s plus %s", workflowPath, timeout, maximumDuration, FinishMargin)
	}
}

func TestWorkflowDurationsRejectDrift(t *testing.T) {
	drifted := "        default: 25m\n        options:\n          - 30m\n"
	for _, value := range workflowDurations(drifted) {
		if value == "30m" {
			if _, err := parseDuration(value); err == nil {
				t.Fatal("parseDuration accepted a dispatch option above the maximum")
			}
			return
		}
	}
	t.Fatal("workflowDurations missed the drifted option")
}

func workflowDurations(body string) []string {
	var durations []string
	for _, match := range workflowDurationPattern.FindAllStringSubmatch(body, -1) {
		if match[1] != "" {
			durations = append(durations, match[1])
		} else {
			durations = append(durations, match[2])
		}
	}
	return durations
}

func workflowTimeout(body string) (time.Duration, error) {
	match := workflowTimeoutPattern.FindStringSubmatch(body)
	if match == nil {
		return 0, errors.New("no go test -timeout flag in the soak step")
	}
	return time.ParseDuration(match[1])
}
