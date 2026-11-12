package visualbaseline

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"
)

func fakeCapture(t *testing.T, body []byte) func(context.Context, string) error {
	t.Helper()
	return func(_ context.Context, root string) error {
		_, _, lock, _ := manifestFixture(t)
		planBody, err := os.ReadFile(filepath.Join(root, "capture-plan.json"))
		if err != nil {
			return err
		}
		var plan CapturePlan
		if err := json.Unmarshal(planBody, &plan); err != nil {
			return err
		}
		if err := os.Mkdir(filepath.Join(root, "visual-capture"), 0o755); err != nil {
			return err
		}
		manifest := Manifest{Schema: 1, Captures: make([]Captured, 0, len(plan.Captures))}
		for _, capture := range plan.Captures {
			writeTestFile(t, filepath.Join(root, "visual-capture", capture.File), body)
			manifest.Captures = append(manifest.Captures, Captured{
				File: capture.File, View: capture.View, Viewport: capture.Viewport,
				Width: capture.Width, Height: capture.Height, URL: "http://127.0.0.1:3137" + capture.URL,
				BrowserProduct: "Chrome/" + lock.ChromeForTesting.Version,
			})
		}
		slices.Reverse(manifest.Captures)
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

func readTestReport(t *testing.T, root string) report {
	t.Helper()
	body, err := os.ReadFile(filepath.Join(root, "build/visual-check/report.json"))
	if err != nil {
		t.Fatal(err)
	}
	var result report
	if err := json.Unmarshal(body, &result); err != nil {
		t.Fatal(err)
	}
	return result
}

func TestExecuteReportsPassingComparisonMeasurements(t *testing.T) {
	options, body := runOptions(t)
	if _, err := Record(options.RepositoryRoot, "home-desktop.png", body); err != nil {
		t.Fatal(err)
	}
	changed := solid(2, 2)
	changed.Pix[0] -= 3
	changedBody, err := encodePNG(changed)
	if err != nil {
		t.Fatal(err)
	}
	if err := Execute(context.Background(), options, fakeCapture(t, changedBody)); err != nil {
		t.Fatal(err)
	}
	result := readTestReport(t, options.RepositoryRoot)
	if len(result.Failures) != 0 || len(result.Comparisons) != 1 {
		t.Fatalf("report=%+v", result)
	}
	got := result.Comparisons[0]
	if got.View != "home" || got.Viewport != "desktop" || !got.Pass || !got.DimensionsMatch || got.DifferingPixels != 1 || got.MaxChannelDelta != 3 {
		t.Fatalf("comparison=%+v", got)
	}
}

func TestExecuteReportsEveryComparisonInCaptureOrder(t *testing.T) {
	options, body := runOptions(t)
	options.Plan.Views = []View{{Name: "z-last", ReadySelector: "main"}, {Name: "a-first", ReadySelector: "main"}}
	options.Plan.Viewports = append(options.Plan.Viewports, Viewport{Name: "mobile", Width: 2, Height: 2, Mobile: true})
	options.Record = true
	if err := Execute(context.Background(), options, fakeCapture(t, body)); err != nil {
		t.Fatal(err)
	}
	captures := options.Plan.Captures().Captures
	differentDimensions, err := encodePNG(solid(3, 2))
	if err != nil {
		t.Fatal(err)
	}
	if _, err := Record(options.RepositoryRoot, captures[0].File, differentDimensions); err != nil {
		t.Fatal(err)
	}
	options.Record = false
	if err := Execute(context.Background(), options, fakeCapture(t, body)); err == nil || !strings.Contains(err.Error(), "failed for 1 captures") {
		t.Fatalf("dimension mismatch error=%v", err)
	}
	result := readTestReport(t, options.RepositoryRoot)
	if len(result.Comparisons) != len(captures) || len(result.Failures) != 1 {
		t.Fatalf("report=%+v", result)
	}
	for index, capture := range captures {
		got := result.Comparisons[index]
		if got.View != capture.View || got.Viewport != capture.Viewport || got.Pass != (index != 0) || got.DimensionsMatch != (index != 0) {
			t.Fatalf("capture %d=%+v, want %+v", index, got, capture)
		}
	}
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
	if len(result.Comparisons) != 1 || result.Comparisons[0].Pass || result.Comparisons[0].Comparison != result.Failures[0].Comparison {
		t.Fatalf("failure missing from comparisons: %s", reportBody)
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
	result := readTestReport(t, options.RepositoryRoot)
	if result.Comparisons == nil || len(result.Comparisons) != 0 || len(result.Failures) != 0 || !strings.Contains(result.Error, "planted capture failure") {
		t.Fatalf("error report=%+v", result)
	}
	entries, err := os.ReadDir(filepath.Join(options.RepositoryRoot, BaselineDirectory))
	if err != nil || len(entries) != 0 {
		t.Fatalf("failed capture wrote baselines: %v %v", entries, err)
	}
}
