package soak

import (
	"fmt"
	"os"
	"path/filepath"
	"time"
)

// Environment variables that request a soak and collect its samples.
const (
	DurationVariable  = "TWENTYW_SOAK_DURATION"
	ReportDirVariable = "TWENTYW_SOAK_REPORT_DIR"
)

// maximumDuration plus FinishMargin stays within the repository's 30-minute
// go test -timeout bound, which .github/workflows/soak.yml uses.
const (
	minimumDuration = 10 * time.Second
	maximumDuration = 25 * time.Minute
)

// DefaultIterationTimeout bounds one consumer iteration. FinishMargin is the
// time a soak test needs after its loop ends: the last iteration, the
// verdict and the report.
const (
	DefaultIterationTimeout = 2 * time.Minute
	FinishMargin            = 5 * time.Minute
)

// DefaultInterval and DefaultMaxIterations pace a requested soak so the
// longest accepted duration still fits the iteration bound: at most 60,001
// samples (about 2.3 MiB preallocated) at one iteration start per 25 ms.
const (
	DefaultInterval      = 25 * time.Millisecond
	DefaultMaxIterations = int(maximumDuration/DefaultInterval) + 1
)

// Requested returns the soak duration from the environment. A non-empty
// skip reason means the soak was not requested or this platform cannot
// sample open files; an error means the request itself is invalid.
func Requested() (time.Duration, string, error) {
	value := os.Getenv(DurationVariable)
	if value == "" {
		return 0, DurationVariable + " is unset", nil
	}
	duration, err := parseDuration(value)
	if err != nil {
		return 0, "", err
	}
	if err := CheckPlatformSupport(); err != nil {
		return 0, err.Error(), nil
	}
	return duration, "", nil
}

func parseDuration(value string) (time.Duration, error) {
	duration, err := time.ParseDuration(value)
	if err != nil {
		return 0, fmt.Errorf("parse %s: %w", DurationVariable, err)
	}
	if duration < minimumDuration || duration > maximumDuration {
		return 0, fmt.Errorf("%s %s outside %s..%s", DurationVariable, value, minimumDuration, maximumDuration)
	}
	return duration, nil
}

// WriteReportFromEnvironment writes samples to name under the report
// directory; it does nothing when no report directory is set.
func WriteReportFromEnvironment(name string, samples []Sample) error {
	directory := os.Getenv(ReportDirVariable)
	if directory == "" {
		return nil
	}
	if err := os.MkdirAll(directory, 0o700); err != nil {
		return fmt.Errorf("create soak report directory %s: %w", directory, err)
	}
	return WriteJSONLines(filepath.Join(directory, name), samples)
}
