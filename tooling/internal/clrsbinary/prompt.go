package clrsbinary

import (
	"context"
	"errors"
	"fmt"
	"strconv"
	"strings"
	"unicode/utf8"

	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/clrsprompt"
)

const (
	promptPrefix = "binary_search:\nkey: ["
	targetMarker = "], target: "
	promptSuffix = "\nreturn:\n"
	answerSuffix = "\n\n"

	maximumPromptBytesCeiling = 1 << 20
	maximumValuesCeiling      = 4_096
	maximumTokenBytesCeiling  = 128
	maximumAnswerBytesCeiling = 1 << 20
)

var (
	// ErrInvalidLimits means a caller did not close every parser/output bound.
	ErrInvalidLimits = errors.New("invalid binary-search limits")
	// ErrMalformedPrompt means bytes do not match the bounded no-hint grammar.
	ErrMalformedPrompt = errors.New("malformed binary-search prompt")
	// ErrPromptLimit means candidate-visible input crossed a configured bound.
	ErrPromptLimit = errors.New("binary-search prompt limit exceeded")
	// ErrAnswerLimit means the exact answer crossed a configured output bound.
	ErrAnswerLimit = errors.New("binary-search answer limit exceeded")
)

// Limits are parser safety caps, not selected experiment sizes.
type Limits struct {
	MaxPromptBytes int
	MaxValues      int
	MaxTokenBytes  int
	MaxAnswerBytes int
}

// Validate rejects open or impractically large bounds.
func (limits Limits) Validate() error {
	if limits.MaxPromptBytes <= 0 || limits.MaxPromptBytes > maximumPromptBytesCeiling ||
		limits.MaxValues <= 0 || limits.MaxValues > maximumValuesCeiling ||
		limits.MaxTokenBytes <= 0 || limits.MaxTokenBytes > maximumTokenBytesCeiling ||
		limits.MaxAnswerBytes <= 0 || limits.MaxAnswerBytes > maximumAnswerBytesCeiling {
		return ErrInvalidLimits
	}
	return nil
}

type scalar struct {
	value float64
}

type searchInput struct {
	values []scalar
	target scalar
}

// Solve returns the exact conventional CLRS binary-search answer for the
// bounded no-hint structural grammar. The pinned operation is a lower-bound
// search clamped to the final array index. A successful answer is NO_RESULT.
func Solve(ctx context.Context, prompt []byte, limits Limits) ([]byte, error) {
	if ctx == nil {
		return nil, errors.New("solve binary search: nil context")
	}
	if err := limits.Validate(); err != nil {
		return nil, err
	}
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	input, err := parsePrompt(ctx, prompt, limits)
	if err != nil {
		return nil, err
	}
	index, err := binarySearch(ctx, input)
	if err != nil {
		return nil, err
	}
	answer := []byte(strconv.Itoa(index) + answerSuffix)
	if len(answer) > limits.MaxAnswerBytes {
		return nil, fmt.Errorf("%w: %d bytes exceeds %d", ErrAnswerLimit, len(answer), limits.MaxAnswerBytes)
	}
	return answer, nil
}

func parsePrompt(ctx context.Context, prompt []byte, limits Limits) (searchInput, error) {
	if len(prompt) > limits.MaxPromptBytes {
		return searchInput{}, fmt.Errorf("%w: %d bytes exceeds %d", ErrPromptLimit, len(prompt), limits.MaxPromptBytes)
	}
	if len(prompt) == 0 || !utf8.Valid(prompt) {
		return searchInput{}, ErrMalformedPrompt
	}
	body, found := strings.CutPrefix(string(prompt), promptPrefix)
	if !found {
		return searchInput{}, fmt.Errorf("%w: wrong task or key marker", ErrMalformedPrompt)
	}
	body, found = strings.CutSuffix(body, promptSuffix)
	if !found {
		return searchInput{}, fmt.Errorf("%w: wrong output marker", ErrMalformedPrompt)
	}
	keyBody, targetBody, found := strings.Cut(body, targetMarker)
	if !found || keyBody == "" || targetBody == "" {
		return searchInput{}, fmt.Errorf("%w: missing key values or target", ErrMalformedPrompt)
	}
	tokens := strings.Split(keyBody, " ")
	if len(tokens) > limits.MaxValues {
		return searchInput{}, fmt.Errorf("%w: %d values exceeds %d", ErrPromptLimit, len(tokens), limits.MaxValues)
	}
	values := make([]scalar, 0, len(tokens))
	for index, token := range tokens {
		if err := ctx.Err(); err != nil {
			return searchInput{}, err
		}
		value, err := parseBoundedScalar(token, limits.MaxTokenBytes)
		if err != nil {
			if errors.Is(err, ErrPromptLimit) {
				return searchInput{}, fmt.Errorf("%w at key position %d: %v", ErrPromptLimit, index, err)
			}
			return searchInput{}, fmt.Errorf("%w at key position %d: %v", ErrMalformedPrompt, index, err)
		}
		if index > 0 && value.value < values[index-1].value {
			return searchInput{}, fmt.Errorf("%w: key values are not nondecreasing", ErrMalformedPrompt)
		}
		values = append(values, value)
	}
	if err := ctx.Err(); err != nil {
		return searchInput{}, err
	}
	target, err := parseBoundedScalar(targetBody, limits.MaxTokenBytes)
	if err != nil {
		if errors.Is(err, ErrPromptLimit) {
			return searchInput{}, fmt.Errorf("%w target: %v", ErrPromptLimit, err)
		}
		return searchInput{}, fmt.Errorf("%w target: %v", ErrMalformedPrompt, err)
	}
	return searchInput{values: values, target: target}, nil
}

func parseBoundedScalar(token string, maximumBytes int) (scalar, error) {
	// The pinned SearchSampler draws both the sorted key and target from U[0,1).
	value, err := clrsprompt.ParseUnitScalar(token, maximumBytes, ErrPromptLimit)
	return scalar{value: value}, err
}

func binarySearch(ctx context.Context, input searchInput) (int, error) {
	low := 0
	high := len(input.values) - 1
	for low < high {
		if err := ctx.Err(); err != nil {
			return 0, err
		}
		middle := (low + high) / 2
		if input.target.value <= input.values[middle].value {
			high = middle
		} else {
			low = middle + 1
		}
	}
	return high, nil
}

func parseAnswer(reference []byte, limits Limits, valueCount int) (int, error) {
	if len(reference) == 0 || len(reference) > limits.MaxAnswerBytes || !utf8.Valid(reference) {
		return 0, fmt.Errorf("%w: reference must contain 1..%d UTF-8 bytes", ErrAnswerLimit, limits.MaxAnswerBytes)
	}
	body, found := strings.CutSuffix(string(reference), answerSuffix)
	if !found || body == "" || (len(body) > 1 && body[0] == '0') {
		return 0, errors.New("reference is not one canonical non-negative index")
	}
	for index := range len(body) {
		if body[index] < '0' || body[index] > '9' {
			return 0, errors.New("reference is not one canonical non-negative index")
		}
	}
	parsed, err := strconv.ParseUint(body, 10, 31)
	if err != nil || parsed >= uint64(valueCount) {
		return 0, fmt.Errorf("reference index is outside 0..%d", valueCount-1)
	}
	return int(parsed), nil
}

// validateReference independently proves the held index with a linear scan.
// It deliberately does not call Solve or binarySearch.
func validateReference(ctx context.Context, reference []byte, limits Limits, input searchInput) error {
	index, err := parseAnswer(reference, limits, len(input.values))
	if err != nil {
		return err
	}
	expected := len(input.values) - 1
	for position, value := range input.values {
		if err := ctx.Err(); err != nil {
			return err
		}
		if input.target.value <= value.value {
			expected = position
			break
		}
	}
	if index != expected {
		return fmt.Errorf("reference index = %d, want lower-bound index %d", index, expected)
	}
	return nil
}
