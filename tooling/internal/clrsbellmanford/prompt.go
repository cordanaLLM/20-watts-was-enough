package clrsbellmanford

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
	promptPrefix = "bellman_ford:\ns: "
	matrixMarker = ", A: [["
	promptSuffix = "]]\npi:\n"
	answerPrefix = "["
	answerSuffix = "]\n\n"
	rowSeparator = "], ["

	maximumPromptBytesCeiling = 1 << 20
	maximumNodesCeiling       = 128
	maximumTokenBytesCeiling  = 128
	maximumAnswerBytesCeiling = 1 << 20

	// The pinned sampler truncates sqrt(U*U + 0.001) to six decimals.
	minimumNonzeroWeight = 0.031622
	maximumSampledWeight = 1.000499
)

var (
	// ErrInvalidLimits means a caller did not close every parser/output bound.
	ErrInvalidLimits = errors.New("invalid Bellman-Ford limits")
	// ErrMalformedPrompt means bytes do not match the bounded no-hint grammar.
	ErrMalformedPrompt = errors.New("malformed Bellman-Ford prompt")
	// ErrPromptLimit means candidate-visible input crossed a configured bound.
	ErrPromptLimit = errors.New("Bellman-Ford prompt limit exceeded")
	// ErrAnswerLimit means the exact answer crossed a configured output bound.
	ErrAnswerLimit = errors.New("Bellman-Ford answer limit exceeded")
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

type scalar struct {
	text  string
	value float64
}

type graphInput struct {
	source  int
	weights [][]scalar
}

// Solve returns the pinned synchronous Bellman-Ford predecessor vector for the
// bounded no-hint CLRS-Text grammar. A successful answer remains NO_RESULT.
func Solve(ctx context.Context, prompt []byte, limits Limits) ([]byte, error) {
	if ctx == nil {
		return nil, errors.New("solve Bellman-Ford: nil context")
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
	predecessors, err := bellmanFord(ctx, input)
	if err != nil {
		return nil, err
	}
	return clrsprompt.FormatIndexList(
		predecessors, answerPrefix, answerSuffix, limits.MaxAnswerBytes, ErrAnswerLimit,
	)
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
	weights, err := parseMatrix(ctx, matrixBody, limits)
	if err != nil {
		return graphInput{}, err
	}
	source, err := parseSourceIndex(sourceToken, len(weights))
	if err != nil {
		return graphInput{}, fmt.Errorf("%w: %v", ErrMalformedPrompt, err)
	}
	return graphInput{source: source, weights: weights}, nil
}

func parseMatrix(ctx context.Context, body string, limits Limits) ([][]scalar, error) {
	rows := strings.Split(body, rowSeparator)
	if len(rows) == 0 || len(rows) > limits.MaxNodes {
		return nil, fmt.Errorf("%w: %d nodes exceeds 1..%d", ErrPromptLimit, len(rows), limits.MaxNodes)
	}
	weights := make([][]scalar, 0, len(rows))
	for rowIndex, rowBody := range rows {
		if err := ctx.Err(); err != nil {
			return nil, err
		}
		row, err := parseRow(rowBody, limits, rowIndex)
		if err != nil {
			return nil, err
		}
		weights = append(weights, row)
	}
	for row := range weights {
		if len(weights[row]) != len(weights) {
			return nil, fmt.Errorf("%w: row %d has %d values, want square size %d", ErrMalformedPrompt, row, len(weights[row]), len(weights))
		}
		for column := 0; column < row; column++ {
			if weights[row][column].text != weights[column][row].text {
				return nil, fmt.Errorf("%w: matrix differs at symmetric cells %d,%d", ErrMalformedPrompt, row, column)
			}
		}
	}
	return weights, nil
}

func parseRow(body string, limits Limits, row int) ([]scalar, error) {
	if body == "" {
		return nil, fmt.Errorf("%w: row %d is empty", ErrMalformedPrompt, row)
	}
	tokens := strings.Split(body, " ")
	if len(tokens) > limits.MaxNodes {
		return nil, fmt.Errorf("%w: row %d has %d values", ErrPromptLimit, row, len(tokens))
	}
	values := make([]scalar, 0, len(tokens))
	for column, token := range tokens {
		value, err := parseGraphScalar(token, limits.MaxTokenBytes)
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

func parseSourceIndex(token string, size int) (int, error) {
	if token == "" || (len(token) > 1 && token[0] == '0') {
		return 0, errors.New("source is not one canonical non-negative index")
	}
	for index := range len(token) {
		if token[index] < '0' || token[index] > '9' {
			return 0, errors.New("source is not one canonical non-negative index")
		}
	}
	parsed, err := strconv.ParseUint(token, 10, 31)
	if err != nil || parsed >= uint64(size) {
		return 0, fmt.Errorf("source is outside 0..%d", size-1)
	}
	return int(parsed), nil
}

func parseGraphScalar(token string, maximumBytes int) (scalar, error) {
	if token == "" {
		return scalar{}, errors.New("empty scalar")
	}
	if len(token) > maximumBytes {
		return scalar{}, fmt.Errorf("%w: scalar exceeds %d bytes", ErrPromptLimit, maximumBytes)
	}
	if !decimalGrammar(token) {
		return scalar{}, errors.New("scalar is outside the truncated decimal grammar")
	}
	value, err := strconv.ParseFloat(token, 64)
	if err != nil || math.IsInf(value, 0) || math.IsNaN(value) {
		return scalar{}, errors.New("scalar is not finite float64")
	}
	if value != 0 && (value < minimumNonzeroWeight || value > maximumSampledWeight) {
		return scalar{}, errors.New("scalar is outside the pinned weighted-sampler range")
	}
	return scalar{text: token, value: value}, nil
}

func decimalGrammar(token string) bool {
	dot := strings.IndexByte(token, '.')
	if dot <= 0 || dot == len(token)-1 || dot > 1 || token[0] < '0' || token[0] > '1' {
		return false
	}
	fraction := token[dot+1:]
	if len(fraction) > 6 || (len(fraction) > 1 && fraction[len(fraction)-1] == '0') {
		return false
	}
	for index := range len(fraction) {
		if fraction[index] < '0' || fraction[index] > '9' {
			return false
		}
	}
	return true
}

// bellmanFord mirrors the pinned synchronous relaxation and strict tie rule.
// Positive sampled weights make n sweeps sufficient for n vertices.
func bellmanFord(ctx context.Context, input graphInput) ([]int, error) {
	size := len(input.weights)
	distances := make([]float64, size)
	predecessors := make([]int, size)
	reached := make([]bool, size)
	for node := range size {
		predecessors[node] = node
	}
	reached[input.source] = true
	for sweep := 0; sweep < size; sweep++ {
		previousDistances := append([]float64(nil), distances...)
		previousReached := append([]bool(nil), reached...)
		for from := range size {
			if err := ctx.Err(); err != nil {
				return nil, err
			}
			if !previousReached[from] {
				continue
			}
			for to, edge := range input.weights[from] {
				if edge.value == 0 {
					continue
				}
				candidate := previousDistances[from] + edge.value
				if !reached[to] || candidate < distances[to] {
					distances[to] = candidate
					predecessors[to] = from
				}
				reached[to] = true
			}
		}
		if equalDistances(previousDistances, distances) {
			return predecessors, nil
		}
	}
	return nil, errors.New("Bellman-Ford relaxation did not converge within the node bound")
}

func parseAnswer(reference []byte, limits Limits, size int) ([]int, error) {
	if len(reference) == 0 || len(reference) > limits.MaxAnswerBytes || !utf8.Valid(reference) {
		return nil, fmt.Errorf("%w: reference must contain 1..%d UTF-8 bytes", ErrAnswerLimit, limits.MaxAnswerBytes)
	}
	body, found := strings.CutPrefix(string(reference), answerPrefix)
	if !found {
		return nil, errors.New("reference lacks predecessor-vector prefix")
	}
	body, found = strings.CutSuffix(body, answerSuffix)
	if !found || body == "" {
		return nil, errors.New("reference lacks exact predecessor-vector suffix")
	}
	tokens := strings.Split(body, " ")
	if len(tokens) != size {
		return nil, fmt.Errorf("reference predecessor count = %d, want %d", len(tokens), size)
	}
	predecessors := make([]int, 0, size)
	for index, token := range tokens {
		value, err := parseSourceIndex(token, size)
		if err != nil {
			return nil, fmt.Errorf("reference predecessor %d: %w", index, err)
		}
		predecessors = append(predecessors, value)
	}
	return predecessors, nil
}

// validateReference proves the held predecessor forest against independently
// computed Dijkstra distances. It never calls Solve or bellmanFord.
func validateReference(ctx context.Context, reference []byte, limits Limits, input graphInput) error {
	predecessors, err := parseAnswer(reference, limits, len(input.weights))
	if err != nil {
		return err
	}
	distances, reachable, err := dijkstraDistances(ctx, input)
	if err != nil {
		return err
	}
	for node := range predecessors {
		if err := ctx.Err(); err != nil {
			return err
		}
		if node == input.source {
			if predecessors[node] != node {
				return errors.New("reference changes the source predecessor")
			}
			continue
		}
		if !reachable[node] {
			if predecessors[node] != node {
				return fmt.Errorf("reference gives unreachable node %d a foreign predecessor", node)
			}
			continue
		}
		if err := validatePredecessorPath(input, predecessors, distances[node], node); err != nil {
			return err
		}
	}
	return nil
}

func dijkstraDistances(ctx context.Context, input graphInput) ([]float64, []bool, error) {
	size := len(input.weights)
	distances := make([]float64, size)
	visited := make([]bool, size)
	reachable := make([]bool, size)
	for node := range size {
		distances[node] = math.Inf(1)
	}
	distances[input.source] = 0
	reachable[input.source] = true
	for step := 0; step < size; step++ {
		if err := ctx.Err(); err != nil {
			return nil, nil, err
		}
		selected := -1
		for node := range size {
			if !visited[node] && (selected < 0 || distances[node] < distances[selected]) {
				selected = node
			}
		}
		if selected < 0 || math.IsInf(distances[selected], 1) {
			break
		}
		visited[selected] = true
		for node, edge := range input.weights[selected] {
			if edge.value == 0 {
				continue
			}
			candidate := distances[selected] + edge.value
			if candidate < distances[node] {
				distances[node] = candidate
			}
			reachable[node] = true
		}
	}
	return distances, reachable, nil
}

func validatePredecessorPath(input graphInput, predecessors []int, shortest float64, target int) error {
	chain := make([]int, 0, len(predecessors))
	seen := make([]bool, len(predecessors))
	current := target
	for current != input.source && len(chain) < len(predecessors) {
		if seen[current] {
			return fmt.Errorf("reference predecessor path for node %d contains a cycle", target)
		}
		seen[current] = true
		previous := predecessors[current]
		if previous == current || input.weights[previous][current].value == 0 {
			return fmt.Errorf("reference predecessor path for node %d uses a missing edge", target)
		}
		chain = append(chain, current)
		current = previous
	}
	if current != input.source {
		return fmt.Errorf("reference predecessor path for node %d does not reach the source", target)
	}
	cost := 0.0
	for index := len(chain) - 1; index >= 0; index-- {
		next := chain[index]
		cost += input.weights[current][next].value
		current = next
	}
	if cost != shortest {
		return fmt.Errorf("reference predecessor path for node %d costs %g, want shortest %g", target, cost, shortest)
	}
	return nil
}

func equalDistances(left, right []float64) bool {
	for index := range left {
		if left[index] != right[index] {
			return false
		}
	}
	return true
}
