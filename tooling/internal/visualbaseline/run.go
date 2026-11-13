package visualbaseline

import (
	"context"
	"errors"
	"fmt"
	"image"
	"io"
	"os"
	"path/filepath"
	"strings"

	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/pdfrenderlock"
	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/strictjson"
)

// Options selects check or explicit record without granting container access to baselines.
type Options struct {
	RepositoryRoot string
	Plan           Plan
	Lock           pdfrenderlock.Lock
	Record         bool
	Output         io.Writer
}

type Failure struct {
	View     string `json:"view"`
	Viewport string `json:"viewport"`
	Comparison
	Actual string `json:"actual"`
	Diff   string `json:"diff"`
}

type captureComparison struct {
	View     string `json:"view"`
	Viewport string `json:"viewport"`
	Comparison
	Pass bool `json:"pass"`
}

type report struct {
	Schema                 int                 `json:"schema"`
	ChannelTolerance       int                 `json:"channel_tolerance"`
	MaximumDifferingPixels int                 `json:"maximum_differing_pixels"`
	Failures               []Failure           `json:"failures"`
	Comparisons            []captureComparison `json:"comparisons"`
	Error                  string              `json:"error,omitempty"`
}

// Execute stages a plan, validates every output, then compares or explicitly records.
func Execute(ctx context.Context, options Options, capture func(context.Context, string) error) (returnError error) {
	if err := options.Plan.validate(); err != nil {
		return err
	}
	staging, err := prepareCapture(options.RepositoryRoot, options.Plan.Captures())
	if err != nil {
		return err
	}
	defer func() { returnError = errors.Join(returnError, os.RemoveAll(staging)) }()
	if err := capture(ctx, staging); err != nil {
		return writeCaptureError(options, err)
	}
	if _, err := ValidateManifest(staging, options.Plan.Captures(), options.Lock); err != nil {
		return writeCaptureError(options, err)
	}
	return processCaptures(options, staging)
}

func prepareCapture(root string, plan CapturePlan) (string, error) {
	directory, err := openDirectory(root, "tmp", true)
	if err != nil {
		return "", err
	}
	if err := directory.Close(); err != nil {
		return "", fmt.Errorf("close visual tmp directory: %w", err)
	}
	staging, err := os.MkdirTemp(filepath.Join(root, "tmp"), "visual-check-")
	if err != nil {
		return "", fmt.Errorf("create visual staging directory: %w", err)
	}
	body, err := strictjson.Canonical(plan)
	if err == nil {
		err = os.WriteFile(filepath.Join(staging, "capture-plan.json"), body, 0o600)
	}
	if err != nil {
		return "", errors.Join(err, os.RemoveAll(staging))
	}
	return staging, nil
}

func processCaptures(options Options, staging string) error {
	actuals, err := openDirectory(staging, "visual-capture", false)
	if err != nil {
		return err
	}
	defer actuals.Close()
	result := report{
		Schema: 1, ChannelTolerance: options.Plan.ChannelTolerance, MaximumDifferingPixels: options.Plan.MaximumDifferingPixels,
		Failures: []Failure{}, Comparisons: []captureComparison{},
	}
	for _, capture := range options.Plan.Captures().Captures {
		comparison, failure, err := processCapture(options, actuals, capture)
		if err != nil {
			return writeCaptureError(options, err)
		}
		if !options.Record {
			result.Comparisons = append(result.Comparisons, comparison)
		}
		if failure != nil {
			result.Failures = append(result.Failures, *failure)
		}
	}
	if options.Record {
		return nil
	}
	if err := writeReport(options.RepositoryRoot, result); err != nil {
		return err
	}
	if len(result.Failures) > 0 {
		return fmt.Errorf("visual comparison failed for %d captures; see build/visual-check/report.json", len(result.Failures))
	}
	return nil
}

func processCapture(options Options, actuals *os.Root, capture Capture) (captureComparison, *Failure, error) {
	body, err := readFile(actuals, capture.File, maximumPNGBytes)
	if err != nil {
		return captureComparison{}, nil, err
	}
	if options.Record {
		changed, err := Record(options.RepositoryRoot, capture.File, body)
		if err != nil {
			return captureComparison{}, nil, err
		}
		if changed {
			_, err = fmt.Fprintf(options.Output, "Recorded %s/%s\n", BaselineDirectory, capture.File)
		}
		return captureComparison{}, nil, err
	}
	return checkCapture(options, capture, body)
}

func checkCapture(options Options, capture Capture, body []byte) (captureComparison, *Failure, error) {
	directory, err := openDirectory(options.RepositoryRoot, BaselineDirectory, false)
	if err != nil {
		return captureComparison{}, nil, err
	}
	defer directory.Close()
	baselineBody, err := readFile(directory, capture.File, maximumPNGBytes)
	if errors.Is(err, os.ErrNotExist) {
		return captureComparison{}, nil, fmt.Errorf("missing baseline %s; run npm run record:visual for an intended visual change", capture.File)
	}
	if err != nil {
		return captureComparison{}, nil, err
	}
	baseline, err := decodePNG(baselineBody)
	if err != nil {
		return captureComparison{}, nil, fmt.Errorf("baseline %s: %w", capture.File, err)
	}
	actual, err := decodePNG(body)
	if err != nil {
		return captureComparison{}, nil, err
	}
	comparison := Compare(baseline, actual, options.Plan.ChannelTolerance)
	entry := captureComparison{
		View: capture.View, Viewport: capture.Viewport, Comparison: comparison,
		Pass: comparison.Pass(options.Plan.MaximumDifferingPixels),
	}
	if entry.Pass {
		return entry, nil, nil
	}
	failure, err := retainFailure(options, capture, comparison, baseline, actual, body)
	return entry, failure, err
}

func retainFailure(options Options, capture Capture, comparison Comparison, baseline, actual image.Image, body []byte) (*Failure, error) {
	stem := strings.TrimSuffix(capture.File, ".png")
	failure := &Failure{View: capture.View, Viewport: capture.Viewport, Comparison: comparison,
		Actual: "build/visual-check/" + stem + ".actual.png", Diff: "build/visual-check/" + stem + ".diff.png"}
	directory, err := openDirectory(options.RepositoryRoot, "build/visual-check", true)
	if err != nil {
		return nil, err
	}
	defer directory.Close()
	diff, err := encodePNG(Diff(baseline, actual, options.Plan.ChannelTolerance))
	if err != nil {
		return nil, err
	}
	if err := replaceFile(directory, filepath.Base(failure.Actual), body); err != nil {
		return nil, err
	}
	if err := replaceFile(directory, filepath.Base(failure.Diff), diff); err != nil {
		return nil, err
	}
	_, err = fmt.Fprintf(options.Output, "%s %s: differing pixels=%d, channel tolerance=%d, maximum=%d, dimensions match=%t, diff=%s\n",
		capture.View, capture.Viewport, comparison.DifferingPixels, options.Plan.ChannelTolerance, options.Plan.MaximumDifferingPixels, comparison.DimensionsMatch, failure.Diff)
	return failure, err
}

func writeCaptureError(options Options, cause error) error {
	result := report{
		Schema: 1, ChannelTolerance: options.Plan.ChannelTolerance, MaximumDifferingPixels: options.Plan.MaximumDifferingPixels,
		Failures: []Failure{}, Comparisons: []captureComparison{}, Error: cause.Error(),
	}
	return errors.Join(cause, writeReport(options.RepositoryRoot, result))
}

func writeReport(root string, result report) error {
	directory, err := openDirectory(root, "build/visual-check", true)
	if err != nil {
		return err
	}
	defer directory.Close()
	body, err := strictjson.Canonical(result)
	if err != nil {
		return fmt.Errorf("encode visual report: %w", err)
	}
	return replaceFile(directory, "report.json", body)
}
