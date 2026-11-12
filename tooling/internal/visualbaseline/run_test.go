package visualbaseline

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func fakeCapture(t *testing.T, body []byte) func(context.Context, string) error {
	t.Helper()
	return func(_ context.Context, root string) error {
		_, plan, _, manifest := manifestFixture(t)
		if err := os.Mkdir(filepath.Join(root, "visual-capture"), 0o755); err != nil {
			return err
		}
		writeTestFile(t, filepath.Join(root, "visual-capture", plan.Captures[0].File), body)
		saveManifest(t, root, manifest)
		return nil
	}
}

func runOptions(t *testing.T) (Options, []byte) {
	t.Helper()
	root, body := baselineFixture(t)
	_, _, lock, _ := manifestFixture(t)
	plan, err := loadTestPlan(t, validPlan)
	if err != nil {
		t.Fatal(err)
	}
	return Options{RepositoryRoot: root, Plan: plan, Lock: lock, Output: &bytes.Buffer{}}, body
}

func TestExecuteRecordsThenChecksAndRetainsFailure(t *testing.T) {
	options, body := runOptions(t)
	options.Record = true
	if err := Execute(context.Background(), options, fakeCapture(t, body)); err != nil {
		t.Fatal(err)
	}
	options.Record = false
	if err := Execute(context.Background(), options, fakeCapture(t, body)); err != nil {
		t.Fatal(err)
	}
	changed := solid(2, 2)
	changed.Pix[0] = 0
	changedBody, err := encodePNG(changed)
	if err != nil {
		t.Fatal(err)
	}
	options.Plan.MaximumDifferingPixels = 0
	if err := Execute(context.Background(), options, fakeCapture(t, changedBody)); err == nil {
		t.Fatal("visual change passed")
	}
	reportBody, err := os.ReadFile(filepath.Join(options.RepositoryRoot, "build/visual-check/report.json"))
	if err != nil {
		t.Fatal(err)
	}
	var result report
	if err := json.Unmarshal(reportBody, &result); err != nil {
		t.Fatal(err)
	}
	if len(result.Failures) != 1 || result.Failures[0].DifferingPixels != 1 {
		t.Fatalf("report=%s", reportBody)
	}
	for _, path := range []string{result.Failures[0].Actual, result.Failures[0].Diff} {
		if _, err := os.Stat(filepath.Join(options.RepositoryRoot, path)); err != nil {
			t.Fatal(err)
		}
	}
	baseline, err := os.ReadFile(filepath.Join(options.RepositoryRoot, BaselineDirectory, "home-desktop.png"))
	if err != nil || !bytes.Equal(baseline, body) {
		t.Fatalf("check changed baseline: %v", err)
	}
	entries, err := os.ReadDir(filepath.Join(options.RepositoryRoot, "tmp"))
	if err != nil || len(entries) != 0 {
		t.Fatalf("staging retained: %v %v", entries, err)
	}
}

func TestMissingBaselineAndCaptureFailureFailClosed(t *testing.T) {
	options, body := runOptions(t)
	err := Execute(context.Background(), options, fakeCapture(t, body))
	if err == nil || !strings.Contains(err.Error(), "npm run record:visual") {
		t.Fatal(err)
	}
	options.Record = true
	err = Execute(context.Background(), options, func(context.Context, string) error { return errors.New("planted capture failure") })
	if err == nil || !strings.Contains(err.Error(), "planted capture failure") {
		t.Fatal(err)
	}
	entries, err := os.ReadDir(filepath.Join(options.RepositoryRoot, BaselineDirectory))
	if err != nil || len(entries) != 0 {
		t.Fatalf("failed capture wrote baselines: %v %v", entries, err)
	}
}
