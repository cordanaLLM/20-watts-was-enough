package clrsmatrixchain

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
	promptPrefix = "matrix_chain_order:\np: ["
	promptSuffix = "]\ns:\n"
	answerSuffix = "\n\n"

	maximumPromptBytesCeiling = 1 << 20
	maximumDimensionsCeiling  = 128
	maximumTokenBytesCeiling  = 128
	maximumAnswerBytesCeiling = 1 << 20
)

var (
	// ErrInvalidLimits means a caller did not close every parser/output bound.
	ErrInvalidLimits = errors.New("invalid matrix-chain limits")
	// ErrMalformedPrompt means bytes do not match the bounded no-hint grammar.
	ErrMalformedPrompt = errors.New("malformed matrix-chain prompt")
	// ErrPromptLimit means candidate-visible input crossed a configured bound.
	ErrPromptLimit = errors.New("matrix-chain prompt limit exceeded")
	// ErrAnswerLimit means the exact answer crossed a configured output bound.
	ErrAnswerLimit = errors.New("matrix-chain answer limit exceeded")
)

// Limits are parser and bounded-work safety caps, not selected experiment sizes.
type Limits struct {
	MaxPromptBytes int
	MaxDimensions  int
	MaxTokenBytes  int
	MaxAnswerBytes int
}

// Validate rejects open or impractically large bounds.
func (limits Limits) Validate() error {
	if limits.MaxPromptBytes <= 0 || limits.MaxPromptBytes > maximumPromptBytesCeiling ||
		limits.MaxDimensions < 2 || limits.MaxDimensions > maximumDimensionsCeiling ||
		limits.MaxTokenBytes <= 0 || limits.MaxTokenBytes > maximumTokenBytesCeiling ||
		limits.MaxAnswerBytes <= 0 || limits.MaxAnswerBytes > maximumAnswerBytesCeiling {
		return ErrInvalidLimits
	}
	return nil
}

type scalar struct {
	value float64
}

type chainInput struct {
	dimensions []scalar
}

// Solve returns the pinned CLRS matrix-chain split-pointer matrix for the
// bounded no-hint structural grammar. A successful answer is NO_RESULT.
func Solve(ctx context.Context, prompt []byte, limits Limits) ([]byte, error) {
	if ctx == nil {
		return nil, errors.New("solve matrix chain: nil context")
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
	splits, err := matrixChainOrder(ctx, input)
	if err != nil {
		return nil, err
	}
	return formatAnswer(splits, limits.MaxAnswerBytes)
}

func parsePrompt(ctx context.Context, prompt []byte, limits Limits) (chainInput, error) {
	if len(prompt) > limits.MaxPromptBytes {
		return chainInput{}, fmt.Errorf("%w: %d bytes exceeds %d", ErrPromptLimit, len(prompt), limits.MaxPromptBytes)
	}
	if len(prompt) == 0 || !utf8.Valid(prompt) {
		return chainInput{}, ErrMalformedPrompt
	}
	body, found := strings.CutPrefix(string(prompt), promptPrefix)
	if !found {
		return chainInput{}, fmt.Errorf("%w: wrong task or dimension marker", ErrMalformedPrompt)
	}
	body, found = strings.CutSuffix(body, promptSuffix)
	if !found || body == "" {
		return chainInput{}, fmt.Errorf("%w: wrong output marker or empty dimensions", ErrMalformedPrompt)
	}
	tokens := strings.Split(body, " ")
	if len(tokens) < 2 {
		return chainInput{}, fmt.Errorf("%w: matrix chain needs at least two dimensions", ErrMalformedPrompt)
	}
	if len(tokens) > limits.MaxDimensions {
		return chainInput{}, fmt.Errorf("%w: %d dimensions exceeds %d", ErrPromptLimit, len(tokens), limits.MaxDimensions)
	}
	dimensions := make([]scalar, 0, len(tokens))
	for index, token := range tokens {
		if err := ctx.Err(); err != nil {
			return chainInput{}, err
		}
		value, err := parseBoundedScalar(token, limits.MaxTokenBytes)
		if err != nil {
			if errors.Is(err, ErrPromptLimit) {
				return chainInput{}, fmt.Errorf("%w at dimension %d: %v", ErrPromptLimit, index, err)
			}
			return chainInput{}, fmt.Errorf("%w at dimension %d: %v", ErrMalformedPrompt, index, err)
		}
		dimensions = append(dimensions, value)
	}
	return chainInput{dimensions: dimensions}, nil
}

func parseBoundedScalar(token string, maximumBytes int) (scalar, error) {
	// The pinned SortingSampler draws matrix dimensions from U[0,1).
	value, err := clrsprompt.ParseUnitScalar(token, maximumBytes, ErrPromptLimit)
	return scalar{value: value}, err
}

// matrixChainOrder mirrors the pinned synchronous relaxation, including its
// first-discovered tie rule. The interval graph has depth below n, so n sweeps
// close the otherwise open upstream while loop.
func matrixChainOrder(ctx context.Context, input chainInput) ([][]int, error) {
	size := len(input.dimensions)
	costs := makeFloatMatrix(size)
	splits := makeIntMatrix(size)
	known := makeBoolMatrix(size)
	for index := 1; index < size; index++ {
		known[index][index] = true
	}
	for sweep := 0; sweep < size; sweep++ {
		previousCosts := cloneFloatMatrix(costs)
		previousKnown := cloneBoolMatrix(known)
		for left := 1; left < size; left++ {
			for right := left + 1; right < size; right++ {
				if err := ctx.Err(); err != nil {
					return nil, err
				}
				found := previousKnown[left][right]
				for split := left; split < right; split++ {
					if !previousKnown[left][split] || !previousKnown[split+1][right] {
						continue
					}
					known[left][right] = true
					candidate := previousCosts[left][split] + previousCosts[split+1][right] +
						input.dimensions[left-1].value*input.dimensions[split].value*input.dimensions[right].value
					if !found || candidate < costs[left][right] {
						costs[left][right] = candidate
						splits[left][right] = split
						found = true
					}
				}
			}
		}
		if equalFloatMatrices(previousCosts, costs) {
			return splits, nil
		}
	}
	return nil, errors.New("matrix-chain relaxation did not converge within the dimension bound")
}

func formatAnswer(matrix [][]int, maximumBytes int) ([]byte, error) {
	answer := make([]byte, 0, len(matrix)*len(matrix)*3)
	answer = append(answer, '[')
	for row := range matrix {
		if row > 0 {
			answer = append(answer, ',', ' ')
		}
		answer = append(answer, '[')
		for column, value := range matrix[row] {
			if column > 0 {
				answer = append(answer, ' ')
			}
			answer = strconv.AppendInt(answer, int64(value), 10)
			if len(answer) > maximumBytes {
				return nil, fmt.Errorf("%w: output exceeds %d bytes", ErrAnswerLimit, maximumBytes)
			}
		}
		answer = append(answer, ']')
	}
	answer = append(answer, ']', '\n', '\n')
	if len(answer) > maximumBytes {
		return nil, fmt.Errorf("%w: %d bytes exceeds %d", ErrAnswerLimit, len(answer), maximumBytes)
	}
	return answer, nil
}

func parseAnswer(reference []byte, limits Limits, size int) ([][]int, error) {
	if len(reference) == 0 || len(reference) > limits.MaxAnswerBytes || !utf8.Valid(reference) {
		return nil, fmt.Errorf("%w: reference must contain 1..%d UTF-8 bytes", ErrAnswerLimit, limits.MaxAnswerBytes)
	}
	body, found := strings.CutSuffix(string(reference), answerSuffix)
	if !found {
		return nil, errors.New("reference is not one canonical split matrix")
	}
	position := 0
	expect := func(literal string) bool {
		if !strings.HasPrefix(body[position:], literal) {
			return false
		}
		position += len(literal)
		return true
	}
	if !expect("[") {
		return nil, errors.New("reference is not one canonical split matrix")
	}
	matrix := makeIntMatrix(size)
	for row := 0; row < size; row++ {
		if row > 0 && !expect(", ") {
			return nil, errors.New("reference row separator is not canonical")
		}
		if !expect("[") {
			return nil, errors.New("reference row is not bracketed")
		}
		for column := 0; column < size; column++ {
			if column > 0 && !expect(" ") {
				return nil, errors.New("reference column separator is not canonical")
			}
			value, next, err := parseCanonicalIndex(body, position, size)
			if err != nil {
				return nil, err
			}
			matrix[row][column] = value
			position = next
		}
		if !expect("]") {
			return nil, errors.New("reference row has extra or missing columns")
		}
	}
	if !expect("]") || position != len(body) {
		return nil, errors.New("reference has extra or missing rows")
	}
	return matrix, nil
}

func parseCanonicalIndex(body string, position, size int) (int, int, error) {
	if position >= len(body) || body[position] < '0' || body[position] > '9' {
		return 0, position, errors.New("reference split is not a non-negative integer")
	}
	start := position
	for position < len(body) && body[position] >= '0' && body[position] <= '9' {
		position++
	}
	if position-start > 1 && body[start] == '0' {
		return 0, position, errors.New("reference split has a leading zero")
	}
	if size <= 0 {
		return 0, position, errors.New("matrix dimension size must be positive")
	}
	parsed, err := strconv.ParseUint(body[start:position], 10, 31)
	if err != nil || parsed >= uint64(size) { //#nosec G115 -- size bounded >= 1 by preceding positive check
		return 0, position, fmt.Errorf("reference split is outside 0..%d", size-1)
	}
	return int(parsed), position, nil
}

// validateReference proves every held split independently with conventional
// interval-order dynamic programming; it never calls Solve or its relaxation.
func validateReference(ctx context.Context, reference []byte, limits Limits, input chainInput) error {
	size := len(input.dimensions)
	matrix, err := parseAnswer(reference, limits, size)
	if err != nil {
		return err
	}
	for row := 0; row < size; row++ {
		for column := 0; column <= row; column++ {
			if matrix[row][column] != 0 {
				return fmt.Errorf("reference split[%d][%d] = %d, want structural zero", row, column, matrix[row][column])
			}
		}
		if matrix[0][row] != 0 {
			return fmt.Errorf("reference split[0][%d] = %d, want structural zero", row, matrix[0][row])
		}
	}
	costs := makeFloatMatrix(size)
	for width := 2; width < size; width++ {
		for left := 1; left+width-1 < size; left++ {
			if err := ctx.Err(); err != nil {
				return err
			}
			right := left + width - 1
			selected := matrix[left][right]
			if selected < left || selected >= right {
				return fmt.Errorf("reference split[%d][%d] = %d, want %d..%d", left, right, selected, left, right-1)
			}
			best := math.Inf(1)
			selectedCost := math.Inf(1)
			for split := left; split < right; split++ {
				candidate := costs[left][split] + costs[split+1][right] +
					input.dimensions[left-1].value*input.dimensions[split].value*input.dimensions[right].value
				if candidate < best {
					best = candidate
				}
				if split == selected {
					selectedCost = candidate
				}
			}
			if selectedCost != best {
				return fmt.Errorf("reference split[%d][%d] = %d is not cost-minimal", left, right, selected)
			}
			costs[left][right] = best
		}
	}
	return nil
}

func makeFloatMatrix(size int) [][]float64 {
	matrix := make([][]float64, size)
	for row := range matrix {
		matrix[row] = make([]float64, size)
	}
	return matrix
}

func makeIntMatrix(size int) [][]int {
	matrix := make([][]int, size)
	for row := range matrix {
		matrix[row] = make([]int, size)
	}
	return matrix
}

func makeBoolMatrix(size int) [][]bool {
	matrix := make([][]bool, size)
	for row := range matrix {
		matrix[row] = make([]bool, size)
	}
	return matrix
}

func cloneFloatMatrix(matrix [][]float64) [][]float64 {
	clone := make([][]float64, len(matrix))
	for row := range matrix {
		clone[row] = append([]float64(nil), matrix[row]...)
	}
	return clone
}

func cloneBoolMatrix(matrix [][]bool) [][]bool {
	clone := make([][]bool, len(matrix))
	for row := range matrix {
		clone[row] = append([]bool(nil), matrix[row]...)
	}
	return clone
}

func equalFloatMatrices(left, right [][]float64) bool {
	for row := range left {
		for column := range left[row] {
			if left[row][column] != right[row][column] {
				return false
			}
		}
	}
	return true
}
