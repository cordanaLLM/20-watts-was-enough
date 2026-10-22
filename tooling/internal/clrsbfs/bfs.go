package clrsbfs

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
	promptPrefix = "bfs:\ns: "
	matrixMarker = ", A: [["
	promptSuffix = "]]\npi:\n"
	answerPrefix = "["
	answerSuffix = "]\n\n"
	rowSeparator = "], ["

	maximumPromptBytesCeiling = 1 << 20
	maximumNodesCeiling       = 128
	maximumTokenBytesCeiling  = 128
	maximumAnswerBytesCeiling = 1 << 20
)

var (
	// ErrInvalidLimits means a caller did not close every parser/output bound.
	ErrInvalidLimits = errors.New("invalid BFS limits")
	// ErrMalformedPrompt means bytes do not match the bounded no-hint grammar.
	ErrMalformedPrompt = errors.New("malformed BFS prompt")
	// ErrPromptLimit means candidate-visible input crossed a configured bound.
	ErrPromptLimit = errors.New("BFS prompt limit exceeded")
	// ErrMalformedAnswer means bytes do not match the exact predecessor grammar.
	ErrMalformedAnswer = errors.New("malformed BFS answer")
	// ErrAnswerLimit means the exact answer crossed a configured output bound.
	ErrAnswerLimit = errors.New("BFS answer limit exceeded")
	// ErrVerificationMismatch means the answer is not the pinned BFS predecessor vector.
	ErrVerificationMismatch = errors.New("BFS verification mismatch")
)

// Limits are parser and bounded-work safety caps, not selected experiment sizes.
type Limits struct {
	MaxPromptBytes int
	MaxNodes       int
	MaxTokenBytes  int
	MaxAnswerBytes int
}

// Validate rejects open or impractically large bounds.
func (limits Limits) Validate() error {
	if limits.MaxPromptBytes <= 0 || limits.MaxPromptBytes > maximumPromptBytesCeiling ||
		limits.MaxNodes <= 0 || limits.MaxNodes > maximumNodesCeiling ||
		limits.MaxTokenBytes <= 0 || limits.MaxTokenBytes > maximumTokenBytesCeiling ||
		limits.MaxAnswerBytes <= 0 || limits.MaxAnswerBytes > maximumAnswerBytesCeiling {
		return ErrInvalidLimits
	}
	return nil
}

type graphInput struct {
	source    int
	adjacency [][]bool
}

// Solve returns the pinned synchronous BFS predecessor vector for the bounded
// no-hint CLRS-Text grammar. A successful answer remains NO_RESULT.
func Solve(ctx context.Context, prompt []byte, limits Limits) ([]byte, error) {
	if ctx == nil {
		return nil, errors.New("solve BFS: nil context")
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
	predecessors, err := synchronousBFS(ctx, input)
	if err != nil {
		return nil, err
	}
	return clrsprompt.FormatIndexList(
		predecessors, answerPrefix, answerSuffix, limits.MaxAnswerBytes, ErrAnswerLimit,
	)
}

// Verify checks an answer through an independently arranged shortest-hop
// characterization. It does not call Solve or synchronousBFS.
func Verify(ctx context.Context, prompt, answer []byte, limits Limits) error {
	if ctx == nil {
		return errors.New("verify BFS: nil context")
	}
	if err := limits.Validate(); err != nil {
		return err
	}
	if err := ctx.Err(); err != nil {
		return err
	}
	input, err := parsePrompt(ctx, prompt, limits)
	if err != nil {
		return fmt.Errorf("verify BFS prompt: %w", err)
	}
	predecessors, err := parseAnswer(answer, limits, len(input.adjacency))
	if err != nil {
		return err
	}
	expected, err := referencePredecessors(ctx, input)
	if err != nil {
		return err
	}
	for node := range expected {
		if predecessors[node] != expected[node] {
			return fmt.Errorf("%w: predecessor[%d] = %d, want %d", ErrVerificationMismatch, node, predecessors[node], expected[node])
		}
	}
	return nil
}

func parsePrompt(ctx context.Context, prompt []byte, limits Limits) (graphInput, error) {
	if len(prompt) > limits.MaxPromptBytes {
		return graphInput{}, fmt.Errorf("%w: %d bytes exceeds %d", ErrPromptLimit, len(prompt), limits.MaxPromptBytes)
	}
	if len(prompt) == 0 || !utf8.Valid(prompt) {
		return graphInput{}, ErrMalformedPrompt
	}
	body, found := strings.CutPrefix(string(prompt), promptPrefix)
	if !found {
		return graphInput{}, fmt.Errorf("%w: wrong task or source marker", ErrMalformedPrompt)
	}
	body, found = strings.CutSuffix(body, promptSuffix)
	if !found {
		return graphInput{}, fmt.Errorf("%w: wrong predecessor marker", ErrMalformedPrompt)
	}
	sourceToken, matrixBody, found := strings.Cut(body, matrixMarker)
	if !found || sourceToken == "" || matrixBody == "" {
		return graphInput{}, fmt.Errorf("%w: missing source or adjacency matrix", ErrMalformedPrompt)
	}
	adjacency, err := parseMatrix(ctx, matrixBody, limits)
	if err != nil {
		return graphInput{}, err
	}
	source, err := parseIndex(sourceToken, len(adjacency), limits.MaxTokenBytes)
	if err != nil {
		return graphInput{}, fmt.Errorf("%w: source: %v", ErrMalformedPrompt, err)
	}
	return graphInput{source: source, adjacency: adjacency}, nil
}

func parseMatrix(ctx context.Context, body string, limits Limits) ([][]bool, error) {
	rows := strings.Split(body, rowSeparator)
	if len(rows) == 0 || len(rows) > limits.MaxNodes {
		return nil, fmt.Errorf("%w: %d nodes exceeds 1..%d", ErrPromptLimit, len(rows), limits.MaxNodes)
	}
	adjacency := make([][]bool, 0, len(rows))
	for rowIndex, rowBody := range rows {
		if err := ctx.Err(); err != nil {
			return nil, err
		}
		row, err := parseRow(rowBody, limits, rowIndex)
		if err != nil {
			return nil, err
		}
		adjacency = append(adjacency, row)
	}
	for row := range adjacency {
		if len(adjacency[row]) != len(adjacency) {
			return nil, fmt.Errorf("%w: row %d has %d values, want square size %d", ErrMalformedPrompt, row, len(adjacency[row]), len(adjacency))
		}
		for column := 0; column < row; column++ {
			if adjacency[row][column] != adjacency[column][row] {
				return nil, fmt.Errorf("%w: matrix differs at symmetric cells %d,%d", ErrMalformedPrompt, row, column)
			}
		}
	}
	return adjacency, nil
}

func parseRow(body string, limits Limits, row int) ([]bool, error) {
	if body == "" {
		return nil, fmt.Errorf("%w: row %d is empty", ErrMalformedPrompt, row)
	}
	tokens := strings.Split(body, " ")
	if len(tokens) > limits.MaxNodes {
		return nil, fmt.Errorf("%w: row %d has %d values", ErrPromptLimit, row, len(tokens))
	}
	values := make([]bool, 0, len(tokens))
	for column, token := range tokens {
		value, err := parseEdge(token, limits.MaxTokenBytes)
		if err != nil {
			if errors.Is(err, ErrPromptLimit) {
				return nil, fmt.Errorf("%w at matrix cell %d,%d: %v", ErrPromptLimit, row, column, err)
			}
			return nil, fmt.Errorf("%w at matrix cell %d,%d: %v", ErrMalformedPrompt, row, column, err)
		}
		values = append(values, value)
	}
	return values, nil
}

func parseEdge(token string, maximumBytes int) (bool, error) {
	if len(token) > maximumBytes {
		return false, fmt.Errorf("%w: edge token exceeds %d bytes", ErrPromptLimit, maximumBytes)
	}
	switch token {
	case "0":
		return false, nil
	case "1":
		return true, nil
	default:
		return false, errors.New("edge is not a pinned unweighted sampler value")
	}
}

func parseIndex(token string, size, maximumBytes int) (int, error) {
	if token == "" || len(token) > maximumBytes || (len(token) > 1 && token[0] == '0') {
		return 0, errors.New("value is not one bounded canonical non-negative index")
	}
	for index := range len(token) {
		if token[index] < '0' || token[index] > '9' {
			return 0, errors.New("value is not one canonical non-negative index")
		}
	}
	if size <= 0 {
		return 0, errors.New("vertex size must be positive")
	}
	parsed, err := strconv.ParseUint(token, 10, 31)
	if err != nil || parsed >= uint64(size) { //#nosec G115 -- size bounded >= 1 by preceding positive check
		return 0, fmt.Errorf("value is outside 0..%d", size-1)
	}
	return int(parsed), nil
}

// synchronousBFS mirrors the pinned reachability-wave update and its strict
// row-major first-predecessor rule.
func synchronousBFS(ctx context.Context, input graphInput) ([]int, error) {
	size := len(input.adjacency)
	reached := make([]bool, size)
	predecessors := make([]int, size)
	for node := range size {
		predecessors[node] = node
	}
	reached[input.source] = true
	for wave := 0; wave < size; wave++ {
		previous := append([]bool(nil), reached...)
		for from := range size {
			if err := ctx.Err(); err != nil {
				return nil, err
			}
			if !previous[from] {
				continue
			}
			for to, edge := range input.adjacency[from] {
				if !edge {
					continue
				}
				if predecessors[to] == to && to != input.source {
					predecessors[to] = from
				}
				reached[to] = true
			}
		}
		if equalReachability(previous, reached) {
			return predecessors, nil
		}
	}
	return nil, errors.New("BFS reachability did not converge within the node bound")
}

func equalReachability(left, right []bool) bool {
	for index := range left {
		if left[index] != right[index] {
			return false
		}
	}
	return true
}

func parseAnswer(answer []byte, limits Limits, size int) ([]int, error) {
	if len(answer) == 0 || len(answer) > limits.MaxAnswerBytes || !utf8.Valid(answer) {
		return nil, fmt.Errorf("%w: answer must contain 1..%d UTF-8 bytes", ErrAnswerLimit, limits.MaxAnswerBytes)
	}
	body, found := strings.CutPrefix(string(answer), answerPrefix)
	if !found {
		return nil, fmt.Errorf("%w: missing predecessor-vector prefix", ErrMalformedAnswer)
	}
	body, found = strings.CutSuffix(body, answerSuffix)
	if !found || body == "" {
		return nil, fmt.Errorf("%w: missing exact predecessor-vector suffix", ErrMalformedAnswer)
	}
	tokens := strings.Split(body, " ")
	if len(tokens) != size {
		return nil, fmt.Errorf("%w: predecessor count = %d, want %d", ErrMalformedAnswer, len(tokens), size)
	}
	predecessors := make([]int, 0, size)
	for index, token := range tokens {
		value, err := parseIndex(token, size, limits.MaxTokenBytes)
		if err != nil {
			return nil, fmt.Errorf("%w: predecessor %d: %v", ErrMalformedAnswer, index, err)
		}
		predecessors = append(predecessors, value)
	}
	return predecessors, nil
}

// referencePredecessors computes shortest-hop distances with a FIFO queue,
// then derives the pinned row-major tie rule from the previous distance layer.
func referencePredecessors(ctx context.Context, input graphInput) ([]int, error) {
	size := len(input.adjacency)
	distances := make([]int, size)
	for node := range size {
		distances[node] = -1
	}
	distances[input.source] = 0
	queue := make([]int, 1, size)
	queue[0] = input.source
	for head := 0; head < len(queue); head++ {
		if err := ctx.Err(); err != nil {
			return nil, err
		}
		from := queue[head]
		for to, edge := range input.adjacency[from] {
			if edge && distances[to] < 0 {
				distances[to] = distances[from] + 1
				queue = append(queue, to)
			}
		}
	}
	predecessors := make([]int, size)
	for node := range size {
		predecessors[node] = node
		if node == input.source || distances[node] < 0 {
			continue
		}
		for from := range size {
			if input.adjacency[from][node] && distances[from] == distances[node]-1 {
				predecessors[node] = from
				break
			}
		}
	}
	return predecessors, nil
}
