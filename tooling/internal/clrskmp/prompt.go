package clrskmp

import (
	"context"
	"errors"
	"fmt"
	"strconv"
	"strings"
	"unicode/utf8"
)

const (
	promptPrefix = "kmp_matcher:\nstring: ["
	keyMarker    = "], key: ["
	promptSuffix = "]\nmatch:\n"
	answerSuffix = "\n\n"

	alphabetSize              = 4
	maximumPromptBytesCeiling = 1 << 20
	maximumValuesCeiling      = 4_096
	maximumAnswerBytesCeiling = 1 << 20
)

var (
	// ErrInvalidLimits means a caller did not close every parser/output bound.
	ErrInvalidLimits = errors.New("invalid KMP limits")
	// ErrMalformedPrompt means bytes do not match the bounded no-hint grammar.
	ErrMalformedPrompt = errors.New("malformed KMP prompt")
	// ErrPromptLimit means candidate-visible input crossed a configured bound.
	ErrPromptLimit = errors.New("KMP prompt limit exceeded")
	// ErrAnswerLimit means the exact answer crossed a configured output bound.
	ErrAnswerLimit = errors.New("KMP answer limit exceeded")
)

// Limits are parser safety caps, not selected experiment sizes.
type Limits struct {
	MaxPromptBytes int
	MaxValues      int
	MaxAnswerBytes int
}

// Validate rejects open or impractically large bounds.
func (limits Limits) Validate() error {
	if limits.MaxPromptBytes <= 0 || limits.MaxPromptBytes > maximumPromptBytesCeiling ||
		limits.MaxValues <= 0 || limits.MaxValues > maximumValuesCeiling ||
		limits.MaxAnswerBytes <= 0 || limits.MaxAnswerBytes > maximumAnswerBytesCeiling {
		return ErrInvalidLimits
	}
	return nil
}

type matchInput struct {
	haystack []byte
	needle   []byte
}

func (input matchInput) totalSize() int {
	return len(input.haystack) + len(input.needle)
}

// Solve returns the first exact haystack match, or the haystack length when no
// match exists, for the bounded no-hint categorical grammar. A successful
// answer is construction evidence and remains NO_RESULT.
func Solve(ctx context.Context, prompt []byte, limits Limits) ([]byte, error) {
	if ctx == nil {
		return nil, errors.New("solve KMP matcher: nil context")
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
	index, err := kmpFirstMatch(ctx, input)
	if err != nil {
		return nil, err
	}
	answer := []byte(strconv.Itoa(index) + answerSuffix)
	if len(answer) > limits.MaxAnswerBytes {
		return nil, fmt.Errorf("%w: %d bytes exceeds %d", ErrAnswerLimit, len(answer), limits.MaxAnswerBytes)
	}
	return answer, nil
}

func parsePrompt(ctx context.Context, prompt []byte, limits Limits) (matchInput, error) {
	if len(prompt) > limits.MaxPromptBytes {
		return matchInput{}, fmt.Errorf("%w: %d bytes exceeds %d", ErrPromptLimit, len(prompt), limits.MaxPromptBytes)
	}
	if len(prompt) == 0 || !utf8.Valid(prompt) {
		return matchInput{}, ErrMalformedPrompt
	}
	body, found := strings.CutPrefix(string(prompt), promptPrefix)
	if !found {
		return matchInput{}, fmt.Errorf("%w: wrong task or string marker", ErrMalformedPrompt)
	}
	body, found = strings.CutSuffix(body, promptSuffix)
	if !found {
		return matchInput{}, fmt.Errorf("%w: wrong output marker", ErrMalformedPrompt)
	}
	maskBody, keyBody, found := strings.Cut(body, keyMarker)
	if !found || maskBody == "" || keyBody == "" {
		return matchInput{}, fmt.Errorf("%w: missing string mask or categorical key", ErrMalformedPrompt)
	}
	maskTokens, err := boundedTokens(maskBody, limits.MaxValues, "string mask")
	if err != nil {
		return matchInput{}, err
	}
	keyTokens, err := boundedTokens(keyBody, limits.MaxValues, "categorical key")
	if err != nil {
		return matchInput{}, err
	}
	if len(maskTokens) != len(keyTokens) {
		return matchInput{}, fmt.Errorf("%w: string mask has %d nodes but key has %d", ErrMalformedPrompt, len(maskTokens), len(keyTokens))
	}
	haystackLength, err := parseStringMask(ctx, maskTokens)
	if err != nil {
		return matchInput{}, err
	}
	keys, err := parseCategoricalKey(ctx, keyTokens)
	if err != nil {
		return matchInput{}, err
	}
	return matchInput{
		haystack: append([]byte(nil), keys[:haystackLength]...),
		needle:   append([]byte(nil), keys[haystackLength:]...),
	}, nil
}

func boundedTokens(body string, maximum int, field string) ([]string, error) {
	tokens := strings.Split(body, " ")
	if len(tokens) > maximum {
		return nil, fmt.Errorf("%w: %s has %d nodes, exceeds %d", ErrPromptLimit, field, len(tokens), maximum)
	}
	if len(tokens) == 0 || tokens[0] == "" {
		return nil, fmt.Errorf("%w: %s is empty", ErrMalformedPrompt, field)
	}
	return tokens, nil
}

func parseStringMask(ctx context.Context, tokens []string) (int, error) {
	haystackLength := 0
	needleLength := 0
	inNeedle := false
	for index, token := range tokens {
		if err := ctx.Err(); err != nil {
			return 0, err
		}
		switch token {
		case "0":
			if inNeedle {
				return 0, fmt.Errorf("%w: string mask returns to the haystack at node %d", ErrMalformedPrompt, index)
			}
			haystackLength++
		case "1":
			inNeedle = true
			needleLength++
		default:
			return 0, fmt.Errorf("%w: string mask node %d is not 0 or 1", ErrMalformedPrompt, index)
		}
	}
	if haystackLength == 0 || needleLength == 0 || haystackLength <= needleLength {
		return 0, fmt.Errorf("%w: string mask does not contain a longer haystack followed by a needle", ErrMalformedPrompt)
	}
	expectedNeedle := pinnedNeedleLength(len(tokens))
	if needleLength != expectedNeedle {
		return 0, fmt.Errorf("%w: needle length = %d, want pinned sampler length %d", ErrMalformedPrompt, needleLength, expectedNeedle)
	}
	return haystackLength, nil
}

func parseCategoricalKey(ctx context.Context, tokens []string) ([]byte, error) {
	values := make([]byte, 0, len(tokens))
	for index, token := range tokens {
		if err := ctx.Err(); err != nil {
			return nil, err
		}
		if len(token) != 1 || token[0] < '0' || token[0] >= '0'+alphabetSize {
			return nil, fmt.Errorf("%w: key node %d is outside categorical alphabet 0..%d", ErrMalformedPrompt, index, alphabetSize-1)
		}
		values = append(values, token[0]-'0')
	}
	return values, nil
}

func pinnedNeedleLength(totalLength int) int {
	if totalLength < 5 {
		return 1
	}
	return totalLength / 5
}

func kmpFirstMatch(ctx context.Context, input matchInput) (int, error) {
	if ctx == nil {
		return 0, errors.New("match KMP input: nil context")
	}
	if len(input.haystack) == 0 || len(input.needle) == 0 {
		return 0, errors.New("match KMP input: haystack and needle must be non-empty")
	}
	prefix, err := prefixTable(ctx, input.needle)
	if err != nil {
		return 0, err
	}
	matched := 0
	for index, value := range input.haystack {
		if err := ctx.Err(); err != nil {
			return 0, err
		}
		for matched > 0 && input.needle[matched] != value {
			if err := ctx.Err(); err != nil {
				return 0, err
			}
			matched = prefix[matched-1]
		}
		if input.needle[matched] == value {
			matched++
		}
		if matched == len(input.needle) {
			return index - len(input.needle) + 1, nil
		}
	}
	return len(input.haystack), nil
}

func prefixTable(ctx context.Context, needle []byte) ([]int, error) {
	prefix := make([]int, len(needle))
	for index, matched := 1, 0; index < len(needle); index++ {
		if err := ctx.Err(); err != nil {
			return nil, err
		}
		for matched > 0 && needle[matched] != needle[index] {
			if err := ctx.Err(); err != nil {
				return nil, err
			}
			matched = prefix[matched-1]
		}
		if needle[matched] == needle[index] {
			matched++
		}
		prefix[index] = matched
	}
	return prefix, nil
}

func parseAnswer(reference []byte, limits Limits, haystackLength int) (int, error) {
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
	if haystackLength < 0 {
		return 0, errors.New("haystack length must be non-negative")
	}
	parsed, err := strconv.ParseUint(body, 10, 31)
	if err != nil || parsed > uint64(haystackLength) { //#nosec G115 -- haystackLength bounded >= 0 by preceding check
		return 0, fmt.Errorf("reference index is outside 0..%d", haystackLength)
	}
	return int(parsed), nil
}

// validateReference independently proves the held index with a naive scan. It
// deliberately does not call Solve, kmpFirstMatch or prefixTable.
func validateReference(ctx context.Context, reference []byte, limits Limits, input matchInput) error {
	index, err := parseAnswer(reference, limits, len(input.haystack))
	if err != nil {
		return err
	}
	expected, err := naiveFirstMatch(ctx, input)
	if err != nil {
		return err
	}
	if index != expected {
		return fmt.Errorf("reference index = %d, want first-match index %d", index, expected)
	}
	return nil
}

func naiveFirstMatch(ctx context.Context, input matchInput) (int, error) {
	lastStart := len(input.haystack) - len(input.needle)
	for start := 0; start <= lastStart; start++ {
		if err := ctx.Err(); err != nil {
			return 0, err
		}
		matches := true
		for offset, value := range input.needle {
			if err := ctx.Err(); err != nil {
				return 0, err
			}
			if input.haystack[start+offset] != value {
				matches = false
				break
			}
		}
		if matches {
			return start, nil
		}
	}
	return len(input.haystack), nil
}
