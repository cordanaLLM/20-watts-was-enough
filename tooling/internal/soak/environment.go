package soak

import (
	"encoding/json"
	"errors"
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

// WriteReportFromEnvironment writes one JSON sample per line to the file name
// inside the report directory; it does nothing when no report directory is
// set. The directory must be an existing absolute path. The file is created
// through an os.Root opened on that directory, so a name that would leave the
// directory, by "..", an absolute path or a symbolic link, is refused.
func WriteReportFromEnvironment(name string, samples []Sample) (returnErr error) {
	directory := os.Getenv(ReportDirVariable)
	if directory == "" {
		return nil
	}
	if !filepath.IsAbs(directory) {
		return fmt.Errorf("%s must be an absolute directory path, got %q", ReportDirVariable, directory)
	}
	root, err := os.OpenRoot(directory)
	if err != nil {
		return fmt.Errorf("open soak report directory %s (%s must name an existing directory): %w", directory, ReportDirVariable, err)
	}
	defer func() {
		if closeErr := root.Close(); closeErr != nil {
			returnErr = errors.Join(returnErr, fmt.Errorf("close soak report directory %s: %w", directory, closeErr))
		}
	}()
	file, err := root.OpenFile(name, os.O_CREATE|os.O_TRUNC|os.O_WRONLY, 0o600)
	if err != nil {
		return fmt.Errorf("create soak report %s in %s: %w", name, directory, err)
	}
	defer func() {
		if closeErr := file.Close(); closeErr != nil {
			returnErr = errors.Join(returnErr, fmt.Errorf("close soak report %s in %s: %w", name, directory, closeErr))
		}
	}()
	encoder := json.NewEncoder(file)
	for _, current := range samples {
		if err := encoder.Encode(current); err != nil {
			return fmt.Errorf("write soak report %s in %s: %w", name, directory, err)
		}
	}
	return nil
}
