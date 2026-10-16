// Package clrsprompt provides shared prompt and answer grammar for the CLRS adapters.
package clrsprompt

import (
	"errors"
	"fmt"
	"math"
	"strconv"
	"strings"
)

// DecimalGrammar reports whether token matches the finite decimal grammar.
func DecimalGrammar(token string) bool {
	index := 0
	if index >= len(token) || token[index] < '0' || token[index] > '9' {
		return false
	}
	for index < len(token) && token[index] >= '0' && token[index] <= '9' {
		index++
	}
	if index < len(token) && token[index] == '.' {
		index++
		start := index
		for index < len(token) && token[index] >= '0' && token[index] <= '9' {
			index++
		}
		if start == index {
			return false
		}
	}
	if index < len(token) && token[index] == 'e' {
		index++
		if index < len(token) && (token[index] == '+' || token[index] == '-') {
			index++
		}
		start := index
		for index < len(token) && token[index] >= '0' && token[index] <= '9' {
			index++
		}
		if start == index {
			return false
		}
	}
	return index == len(token)
}

// ParseUnitScalar parses a bounded finite decimal in the range [0,1).
func ParseUnitScalar(token string, maximumBytes int, limit error) (float64, error) {
	if token == "" {
		return 0, errors.New("empty scalar")
	}
	if len(token) > maximumBytes {
		return 0, fmt.Errorf("%w: scalar exceeds %d bytes", limit, maximumBytes)
	}
	if !DecimalGrammar(token) {
		return 0, errors.New("scalar is outside the finite decimal grammar")
	}
	value, err := strconv.ParseFloat(token, 64)
	if err != nil || math.IsInf(value, 0) || math.IsNaN(value) {
		return 0, errors.New("scalar is not finite float64")
	}
	if value < 0 || value >= 1 {
		return 0, errors.New("scalar is outside the pinned sampler range [0,1)")
	}
	return value, nil
}

// FormatIndexList formats space-separated indices within the byte limit.
func FormatIndexList(values []int, prefix, suffix string, maximumBytes int, limit error) ([]byte, error) {
	var answer strings.Builder
	answer.Grow(len(prefix) + len(suffix) + len(values)*3)
	answer.WriteString(prefix)
	for index, value := range values {
		if index > 0 {
			answer.WriteByte(' ')
		}
		answer.WriteString(strconv.Itoa(value))
	}
	answer.WriteString(suffix)
	if answer.Len() > maximumBytes {
		return nil, fmt.Errorf("%w: %d bytes exceeds %d", limit, answer.Len(), maximumBytes)
	}
	return []byte(answer.String()), nil
}
