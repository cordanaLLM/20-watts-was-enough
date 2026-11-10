// Package soak measures bounded in-process repetitions of repository work.
//
// Each sample runs runtime.GC first, so the finalizer of an unreachable
// *os.File may close it before the open-file count is read. The open-file check
// therefore catches handles that stay reachable (held in a slice, map,
// goroutine or struct field), not a handle whose only reference is dropped.
package soak

import (
	"context"
	"errors"
	"fmt"
	"os"
	"runtime"
	"strings"
	"time"
)

const minimumWindow = 3

// MinimumSamples is the smallest sample count whose warmup and tail windows
// do not overlap.
const MinimumSamples = 2 * minimumWindow

// Sample records process resources after one completed iteration.
type Sample struct {
	Iteration  int    `json:"iteration"`
	OpenFiles  int    `json:"open_files"`
	HeapBytes  uint64 `json:"heap_bytes"`
	Goroutines int    `json:"goroutines"`
	Leftovers  int    `json:"leftovers"`
}

// Config bounds a soak by wall time, iteration count, and per-iteration time.
// Interval is the minimum spacing between iteration starts; it keeps the
// sample count, and so the preallocated sample slice, proportional to
// Duration when one iteration takes far less than Interval.
type Config struct {
	Duration         time.Duration
	Interval         time.Duration
	MaxIterations    int
	MinIterations    int
	IterationTimeout time.Duration
	Watched          []string
}

// Allowance defines permitted tail growth and the minimum sample count.
type Allowance struct {
	OpenFiles     int
	HeapBytes     uint64
	Goroutines    int
	Leftovers     int
	MinIterations int
}

// Run loops iterate, writes the samples to report under the report
// directory, then applies Verdict with DefaultAllowance. Samples are written
// before the verdict so a failing soak still leaves its evidence.
func Run(ctx context.Context, config Config, report string, iterate func(context.Context, int) error) ([]Sample, error) {
	samples, loopErr := Loop(ctx, config, iterate)
	if err := WriteReportFromEnvironment(report, samples); err != nil {
		return samples, errors.Join(loopErr, err)
	}
	if loopErr != nil {
		return samples, loopErr
	}
	return samples, Verdict(samples, DefaultAllowance(samples, config.MinIterations))
}

// Loop runs iterate under duration, count, and per-iteration bounds.
func Loop(ctx context.Context, config Config, iterate func(context.Context, int) error) ([]Sample, error) {
	if err := validateConfig(ctx, config, iterate); err != nil {
		return nil, err
	}
	bounded, cancel := context.WithTimeout(ctx, config.Duration)
	defer cancel()
	started := time.Now()
	// Preallocated before the first sample so the slice never adds heap growth.
	samples := make([]Sample, 0, config.MaxIterations)
	for index := 1; index <= config.MaxIterations && bounded.Err() == nil; index++ {
		iterationStarted := time.Now()
		if err := runIteration(bounded, config, index, iterate); err != nil {
			if errors.Is(bounded.Err(), context.DeadlineExceeded) {
				break
			}
			return samples, fmt.Errorf("iteration %d: %w", index, err)
		}
		sample, err := sample(index, config.Watched)
		if err != nil {
			return samples, fmt.Errorf("sample iteration %d: %w", index, err)
		}
		samples = append(samples, sample)
		if time.Since(started) >= config.Duration {
			break
		}
		pace(bounded, iterationStarted, config.Interval)
	}
	return samples, nil
}

// pace waits until interval has passed since started, or until ctx ends.
func pace(ctx context.Context, started time.Time, interval time.Duration) {
	wait := interval - time.Since(started)
	if wait <= 0 {
		return
	}
	timer := time.NewTimer(wait)
	defer timer.Stop()
	select {
	case <-ctx.Done():
	case <-timer.C:
	}
}

// validateConfig rejects missing execution inputs and invalid time or iteration
// bounds before the loop allocates samples or invokes the callback.
func validateConfig(ctx context.Context, config Config, iterate func(context.Context, int) error) error {
	if ctx == nil {
		return errors.New("context is required")
	}
	if config.Duration <= 0 || config.Interval < 0 || config.MaxIterations < 1 || config.MinIterations < 1 || config.MinIterations > config.MaxIterations {
		return errors.New("duration and iteration bounds must be positive and ordered; interval must not be negative")
	}
	if config.IterationTimeout <= 0 || iterate == nil {
		return errors.New("iteration timeout and callback are required")
	}
	return nil
}

// runIteration gives the callback a bounded context and returns its error or
// context failure, so an expired iteration cannot count as a successful sample.
func runIteration(parent context.Context, config Config, index int, iterate func(context.Context, int) error) error {
	iteration, cancel := context.WithTimeout(parent, config.IterationTimeout)
	defer cancel()
	if err := iterate(iteration, index); err != nil {
		return err
	}
	if err := iteration.Err(); err != nil {
		return err
	}
	return nil
}

// sample returns process resources after garbage collection and watched entry
// counts, refusing a partial sample if either filesystem measurement fails.
func sample(index int, watched []string) (Sample, error) {
	runtime.GC()
	var memory runtime.MemStats
	runtime.ReadMemStats(&memory)
	openFiles, err := countOpenFiles()
	if err != nil {
		return Sample{}, err
	}
	leftovers, err := countLeftovers(watched)
	if err != nil {
		return Sample{}, err
	}
	return Sample{Iteration: index, OpenFiles: openFiles, HeapBytes: memory.HeapAlloc,
		Goroutines: runtime.NumGoroutine(), Leftovers: leftovers}, nil
}

// CheckPlatformSupport reports whether open-file sampling is available.
func CheckPlatformSupport() error {
	_, err := countOpenFiles()
	return err
}

// countLeftovers totals immediate entries in watched directories, returning an
// error naming any unreadable directory rather than an incomplete count.
func countLeftovers(directories []string) (int, error) {
	total := 0
	for _, directory := range directories {
		entries, err := os.ReadDir(directory)
		if err != nil {
			return 0, fmt.Errorf("read watched directory %s: %w", directory, err)
		}
		total += len(entries)
	}
	return total, nil
}

// DefaultAllowance sets strict resource bounds and a heap allowance based on warmup.
func DefaultAllowance(samples []Sample, minIterations int) Allowance {
	warmup := windowSize(len(samples), 10)
	var maximum uint64
	for _, current := range samples[:min(warmup, len(samples))] {
		maximum = max(maximum, current.HeapBytes)
	}
	const minimumHeapAllowance = 8 << 20
	return Allowance{HeapBytes: max(maximum/2, minimumHeapAllowance), MinIterations: minIterations}
}

// Verdict rejects insufficient samples and growth beyond each metric allowance.
func Verdict(samples []Sample, allowance Allowance) error {
	want := max(allowance.MinIterations, MinimumSamples)
	if len(samples) < want {
		return fmt.Errorf("too few iterations: got %d, want >= %d", len(samples), want)
	}
	warmup := samples[:windowSize(len(samples), 10)]
	tail := samples[len(samples)-windowSize(len(samples), 4):]
	return growthError(warmup, tail, allowance)
}

// windowSize returns the sample fraction with a minimum of three, keeping
// verdict windows large enough to disregard isolated resource spikes.
func windowSize(count, divisor int) int { return max(minimumWindow, count/divisor) }

// growthError returns all resource metrics whose sustained tail growth exceeds
// their allowances, or nil when every metric stays within its bound.
func growthError(warmup, tail []Sample, allowance Allowance) error {
	var findings []string
	findings = appendGrowth(findings, "open files", warmup, tail, func(s Sample) int { return s.OpenFiles }, allowance.OpenFiles)
	findings = appendGrowth(findings, "goroutines", warmup, tail, func(s Sample) int { return s.Goroutines }, allowance.Goroutines)
	findings = appendGrowth(findings, "leftovers", warmup, tail, func(s Sample) int { return s.Leftovers }, allowance.Leftovers)
	findings = appendGrowth(findings, "heap bytes", warmup, tail, func(s Sample) uint64 { return s.HeapBytes }, allowance.HeapBytes)
	if len(findings) == 0 {
		return nil
	}
	return errors.New("resource growth: " + strings.Join(findings, "; "))
}

// appendGrowth compares the warmup maximum with the tail minimum, so a
// transient spike in either window never counts as growth.
func appendGrowth[T ~int | ~uint64](findings []string, name string, warmup, tail []Sample, value func(Sample) T, limit T) []string {
	start := value(warmup[0])
	for _, current := range warmup[1:] {
		start = max(start, value(current))
	}
	end := value(tail[0])
	for _, current := range tail[1:] {
		end = min(end, value(current))
	}
	if end <= start || end-start <= limit {
		return findings
	}
	return append(findings, fmt.Sprintf("%s warmup max %d, tail min %d, growth %d, allowance %d", name, start, end, end-start, limit))
}
