package clrsinsertion

import (
	"context"
	"errors"
	"fmt"
	"math"
	"strconv"
	"strings"
	"unicode/utf8"

	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/clrsprompt"
)

const (
	promptPrefix = "insertion_sort:\nkey: ["
	promptSuffix = "]\npred:\n"
	answerPrefix = "["
	answerSuffix = "]\n\n"

	maximumPromptBytesCeiling = 1 << 20
	maximumValuesCeiling      = 4_096
	maximumTokenBytesCeiling  = 128
	maximumAnswerBytesCeiling = 1 << 20
)

var (
	// ErrInvalidLimits means a caller did not close every parser/output bound.
	ErrInvalidLimits = errors.New("invalid insertion-sort limits")
	// ErrMalformedPrompt means bytes do not match the bounded no-hint grammar.
	ErrMalformedPrompt = errors.New("malformed insertion-sort prompt")
	// ErrPromptLimit means candidate-visible input crossed a configured bound.
	ErrPromptLimit = errors.New("insertion-sort prompt limit exceeded")
	// ErrAnswerLimit means the exact answer crossed a configured output bound.
	ErrAnswerLimit = errors.New("insertion-sort answer limit exceeded")
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
	text  string
	value float64
}

// Solve returns the exact conventional insertion-sort answer for the bounded
// no-hint structural grammar derived from the pinned CLRS-Text source. It
// preserves scalar spellings and checks cancellation while performing stable
// insertion sort. A successful answer is still NO_RESULT.
func Solve(ctx context.Context, prompt []byte, limits Limits) ([]byte, error) {
	if ctx == nil {
		return nil, errors.New("solve insertion sort: nil context")
	}
	if err := limits.Validate(); err != nil {
		return nil, err
	}
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	values, err := parsePrompt(ctx, prompt, limits)
	if err != nil {
		return nil, err
	}
	if err := insertionSort(ctx, values); err != nil {
		return nil, err
	}
	answer := formatAnswer(values)
	if len(answer) > limits.MaxAnswerBytes {
		return nil, fmt.Errorf("%w: %d bytes exceeds %d", ErrAnswerLimit, len(answer), limits.MaxAnswerBytes)
	}
	return answer, nil
}

func parsePrompt(ctx context.Context, prompt []byte, limits Limits) ([]scalar, error) {
	if len(prompt) > limits.MaxPromptBytes {
		return nil, fmt.Errorf("%w: %d bytes exceeds %d", ErrPromptLimit, len(prompt), limits.MaxPromptBytes)
	}
	if !utf8.Valid(prompt) || len(prompt) == 0 {
		return nil, ErrMalformedPrompt
	}
	body, found := strings.CutPrefix(string(prompt), promptPrefix)
	if !found {
		return nil, fmt.Errorf("%w: wrong task or input marker", ErrMalformedPrompt)
	}
	body, found = strings.CutSuffix(body, promptSuffix)
	if !found || body == "" {
		return nil, fmt.Errorf("%w: wrong output marker or empty key", ErrMalformedPrompt)
	}
	tokens := strings.Split(body, " ")
	if len(tokens) > limits.MaxValues {
		return nil, fmt.Errorf("%w: %d values exceeds %d", ErrPromptLimit, len(tokens), limits.MaxValues)
	}
	values := make([]scalar, 0, len(tokens))
	for index, token := range tokens {
		if err := ctx.Err(); err != nil {
			return nil, err
		}
		if token == "" {
			return nil, fmt.Errorf("%w: empty scalar at position %d", ErrMalformedPrompt, index)
		}
		if len(token) > limits.MaxTokenBytes {
			return nil, fmt.Errorf("%w: scalar %d exceeds %d bytes", ErrPromptLimit, index, limits.MaxTokenBytes)
		}
		value, err := parseUpstreamScalar(token)
		if err != nil {
			return nil, fmt.Errorf("%w at position %d: %v", ErrMalformedPrompt, index, err)
		}
		values = append(values, scalar{text: token, value: value})
	}
	return values, nil
}

func parseUpstreamScalar(token string) (float64, error) {
	if !clrsprompt.DecimalGrammar(token) {
		return 0, errors.New("scalar is outside the finite decimal grammar")
	}
	value, err := strconv.ParseFloat(token, 64)
	if err != nil || math.IsInf(value, 0) || math.IsNaN(value) {
		return 0, errors.New("scalar is not finite float64")
	}
	// The pinned generator calls SortingSampler with its default U[0,1) range.
	if value < 0 || value >= 1 {
		return 0, errors.New("scalar is outside the pinned sampler range [0,1)")
	}
	return value, nil
}

func insertionSort(ctx context.Context, values []scalar) error {
	for outer := 1; outer < len(values); outer++ {
		if err := ctx.Err(); err != nil {
			return err
		}
		item := values[outer]
		inner := outer
		for inner > 0 && values[inner-1].value > item.value {
			if err := ctx.Err(); err != nil {
				return err
			}
			values[inner] = values[inner-1]
			inner--
		}
		values[inner] = item
	}
	return nil
}

func formatAnswer(values []scalar) []byte {
	var builder strings.Builder
	builder.Grow(len(answerPrefix) + len(answerSuffix) + len(values)*4)
	builder.WriteString(answerPrefix)
	for index, value := range values {
		if index > 0 {
			builder.WriteByte(' ')
		}
		builder.WriteString(value.text)
	}
	builder.WriteString(answerSuffix)
	return []byte(builder.String())
}

type stableTokenQueue struct {
	tokens   []string
	consumed int
}

// validateReference independently proves that a held answer is the stable,
// sorted permutation of the prompt. It deliberately does not call Solve or
// insertionSort, so verifier construction cannot merely repeat the candidate
// implementation.
func validateReference(ctx context.Context, reference []byte, limits Limits, promptValues []scalar) error {
	if len(reference) > limits.MaxAnswerBytes {
		return fmt.Errorf("%w: reference is %d bytes", ErrAnswerLimit, len(reference))
	}
	body, found := strings.CutPrefix(string(reference), answerPrefix)
	if !found {
		return errors.New("reference lacks answer prefix")
	}
	body, found = strings.CutSuffix(body, answerSuffix)
	if !found || body == "" || !utf8.Valid(reference) {
		return errors.New("reference lacks exact answer suffix or values")
	}
	tokens := strings.Split(body, " ")
	if len(tokens) != len(promptValues) {
		return fmt.Errorf("reference value count = %d, want %d", len(tokens), len(promptValues))
	}
	stableGroups := make(map[uint64]*stableTokenQueue, len(promptValues))
	for _, value := range promptValues {
		key := math.Float64bits(value.value)
		group := stableGroups[key]
		if group == nil {
			group = &stableTokenQueue{}
			stableGroups[key] = group
		}
		group.tokens = append(group.tokens, value.text)
	}
	var previous float64
	for index, token := range tokens {
		if err := ctx.Err(); err != nil {
			return err
		}
		if len(token) == 0 || len(token) > limits.MaxTokenBytes {
			return errors.New("reference scalar crosses token bounds")
		}
		value, err := parseUpstreamScalar(token)
		if err != nil {
			return fmt.Errorf("reference scalar %q: %w", token, err)
		}
		if index > 0 && value < previous {
			return errors.New("reference values are not nondecreasing")
		}
		previous = value
		group := stableGroups[math.Float64bits(value)]
		if group == nil || group.consumed >= len(group.tokens) {
			return fmt.Errorf("reference scalar %q is absent from the prompt multiplicity", token)
		}
		if token != group.tokens[group.consumed] {
			return fmt.Errorf("reference scalar %q changes prompt spelling or equal-value order", token)
		}
		group.consumed++
	}
	for _, group := range stableGroups {
		if group.consumed != len(group.tokens) {
			return errors.New("reference omits one or more prompt scalar occurrences")
		}
	}
	return nil
}
