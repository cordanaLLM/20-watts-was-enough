package clrssegments

import (
	"context"
	"errors"
	"fmt"
	"math"
	"strconv"
	"strings"
	"unicode/utf8"
)

const (
	promptPrefix    = "segments_intersect:\nx: ["
	vectorMarker    = "], y: ["
	promptSuffix    = "]\nintersect:\n"
	falseAnswer     = "0\n\n"
	trueAnswer      = "1\n\n"
	coordinateCount = 4

	maximumPromptBytesCeiling = 1 << 20
	maximumTokenBytesCeiling  = 128
	maximumAnswerBytesCeiling = 1 << 20
	coordinateGridScale       = 1_000_000.0
	coordinateGridTolerance   = 1e-7
)

var (
	// ErrInvalidLimits means a caller did not close every parser/output bound.
	ErrInvalidLimits = errors.New("invalid segment-intersection limits")
	// ErrMalformedPrompt means bytes do not match the bounded no-hint grammar.
	ErrMalformedPrompt = errors.New("malformed segment-intersection prompt")
	// ErrPromptLimit means candidate-visible input crossed a configured bound.
	ErrPromptLimit = errors.New("segment-intersection prompt limit exceeded")
	// ErrAnswerLimit means the exact answer crossed a configured output bound.
	ErrAnswerLimit = errors.New("segment-intersection answer limit exceeded")
)

// Limits are parser and bounded-output safety caps. The endpoint count remains
// fixed by the generation contract rather than caller configuration.
type Limits struct {
	MaxPromptBytes int
	MaxTokenBytes  int
	MaxAnswerBytes int
}

// Validate rejects open or impractically large bounds.
func (limits Limits) Validate() error {
	if limits.MaxPromptBytes <= 0 || limits.MaxPromptBytes > maximumPromptBytesCeiling ||
		limits.MaxTokenBytes <= 0 || limits.MaxTokenBytes > maximumTokenBytesCeiling ||
		limits.MaxAnswerBytes <= 0 || limits.MaxAnswerBytes > maximumAnswerBytesCeiling {
		return ErrInvalidLimits
	}
	return nil
}

type point struct {
	x float64
	y float64
}

type geometryInput struct {
	endpoints [coordinateCount]point
}

// Solve returns the pinned closed-segment intersection mask for the bounded
// no-hint CLRS-Text grammar. A successful answer remains NO_RESULT.
func Solve(ctx context.Context, prompt []byte, limits Limits) ([]byte, error) {
	if ctx == nil {
		return nil, errors.New("solve segment intersection: nil context")
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
	intersects, err := segmentsIntersect(ctx, input)
	if err != nil {
		return nil, err
	}
	return formatAnswer(intersects, limits.MaxAnswerBytes)
}

func parsePrompt(ctx context.Context, prompt []byte, limits Limits) (geometryInput, error) {
	if len(prompt) > limits.MaxPromptBytes {
		return geometryInput{}, fmt.Errorf("%w: %d bytes exceeds %d", ErrPromptLimit, len(prompt), limits.MaxPromptBytes)
	}
	if len(prompt) == 0 || !utf8.Valid(prompt) {
		return geometryInput{}, ErrMalformedPrompt
	}
	body, found := strings.CutPrefix(string(prompt), promptPrefix)
	if !found {
		return geometryInput{}, fmt.Errorf("%w: wrong task or x marker", ErrMalformedPrompt)
	}
	body, found = strings.CutSuffix(body, promptSuffix)
	if !found {
		return geometryInput{}, fmt.Errorf("%w: wrong intersection marker", ErrMalformedPrompt)
	}
	xBody, yBody, found := strings.Cut(body, vectorMarker)
	if !found || strings.Contains(yBody, vectorMarker) {
		return geometryInput{}, fmt.Errorf("%w: missing or repeated coordinate-vector marker", ErrMalformedPrompt)
	}
	xs, err := parseCoordinateVector(ctx, xBody, limits, "x")
	if err != nil {
		return geometryInput{}, err
	}
	ys, err := parseCoordinateVector(ctx, yBody, limits, "y")
	if err != nil {
		return geometryInput{}, err
	}
	var input geometryInput
	for index := range coordinateCount {
		input.endpoints[index] = point{x: xs[index], y: ys[index]}
	}
	return input, nil
}

func parseCoordinateVector(
	ctx context.Context,
	body string,
	limits Limits,
	axis string,
) ([coordinateCount]float64, error) {
	var coordinates [coordinateCount]float64
	tokens := strings.Split(body, " ")
	if len(tokens) != coordinateCount {
		return coordinates, fmt.Errorf("%w: %s coordinate count = %d, want %d", ErrMalformedPrompt, axis, len(tokens), coordinateCount)
	}
	for index, token := range tokens {
		if err := ctx.Err(); err != nil {
			return coordinates, err
		}
		value, err := parseCoordinate(token, limits.MaxTokenBytes)
		if err != nil {
			if errors.Is(err, ErrPromptLimit) {
				return coordinates, fmt.Errorf("%w at %s[%d]: %v", ErrPromptLimit, axis, index, err)
			}
			return coordinates, fmt.Errorf("%w at %s[%d]: %v", ErrMalformedPrompt, axis, index, err)
		}
		coordinates[index] = value
	}
	return coordinates, nil
}

func parseCoordinate(token string, maximumBytes int) (float64, error) {
	if token == "" {
		return 0, errors.New("empty coordinate")
	}
	if len(token) > maximumBytes {
		return 0, fmt.Errorf("%w: coordinate exceeds %d bytes", ErrPromptLimit, maximumBytes)
	}
	if !coordinateGrammar(token) {
		return 0, errors.New("coordinate is outside the truncated decimal grammar")
	}
	value, err := strconv.ParseFloat(token, 64)
	if err != nil || math.IsInf(value, 0) || math.IsNaN(value) {
		return 0, errors.New("coordinate is not finite float64")
	}
	if value < 0 || value >= 1 {
		return 0, errors.New("coordinate is outside the pinned sampler range [0,1)")
	}
	scaled := value * coordinateGridScale
	if math.Abs(scaled-math.Round(scaled)) > coordinateGridTolerance {
		return 0, errors.New("coordinate is outside the pinned six-decimal grid")
	}
	if token != canonicalCoordinate(value) {
		return 0, errors.New("coordinate is not the pinned NumPy scalar spelling")
	}
	return value, nil
}

func canonicalCoordinate(value float64) string {
	if value == 0 {
		return "0.0"
	}
	return strconv.FormatFloat(value, 'g', -1, 64)
}

func coordinateGrammar(token string) bool {
	mantissa, exponent, scientific := strings.Cut(token, "e")
	if strings.Contains(exponent, "e") || !coordinateMantissa(mantissa, scientific) {
		return false
	}
	if !scientific {
		return len(mantissa) >= 3 && mantissa[0] == '0' && mantissa[1] == '.'
	}
	if len(exponent) != 3 || exponent[0] != '-' || exponent[1] < '0' || exponent[1] > '9' ||
		exponent[2] < '0' || exponent[2] > '9' || mantissa[0] == '0' {
		return false
	}
	power := int(exponent[1]-'0')*10 + int(exponent[2]-'0')
	return power >= 1 && power <= 6
}

func coordinateMantissa(mantissa string, scientific bool) bool {
	if mantissa == "" || mantissa[0] < '0' || mantissa[0] > '9' {
		return false
	}
	dot := strings.IndexByte(mantissa, '.')
	if dot < 0 {
		return scientific && len(mantissa) == 1
	}
	if dot != 1 || dot == len(mantissa)-1 || strings.Contains(mantissa[dot+1:], ".") {
		return false
	}
	fraction := mantissa[dot+1:]
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

// segmentsIntersect mirrors the pinned direction order and inclusive
// collinear checks over endpoints 0--1 and 2--3.
func segmentsIntersect(ctx context.Context, input geometryInput) (bool, error) {
	triples := [coordinateCount][3]int{{2, 3, 0}, {2, 3, 1}, {0, 1, 2}, {0, 1, 3}}
	var directions [coordinateCount]float64
	var onSegment [coordinateCount]bool
	for index, triple := range triples {
		if err := ctx.Err(); err != nil {
			return false, err
		}
		first := input.endpoints[triple[0]]
		second := input.endpoints[triple[1]]
		probe := input.endpoints[triple[2]]
		directions[index] = pinnedDirection(first, second, probe)
		onSegment[index] = insideClosedBox(first, second, probe)
	}
	proper := oppositeSigns(directions[0], directions[1]) && oppositeSigns(directions[2], directions[3])
	if proper {
		return true, nil
	}
	for index := range coordinateCount {
		if directions[index] == 0 && onSegment[index] {
			return true, nil
		}
	}
	return false, nil
}

func pinnedDirection(first, second, probe point) float64 {
	probeX := probe.x - first.x
	probeY := probe.y - first.y
	segmentX := second.x - first.x
	segmentY := second.y - first.y
	// Explicit conversions forbid fused multiply-add (Go spec, Floating-point
	// operators); arm64 would otherwise turn an exact zero into a rounding residue.
	return float64(probeX*segmentY) - float64(segmentX*probeY)
}

func oppositeSigns(left, right float64) bool {
	return (left > 0 && right < 0) || (left < 0 && right > 0)
}

func insideClosedBox(first, second, probe point) bool {
	return math.Min(first.x, second.x) <= probe.x && probe.x <= math.Max(first.x, second.x) &&
		math.Min(first.y, second.y) <= probe.y && probe.y <= math.Max(first.y, second.y)
}

func formatAnswer(intersects bool, maximumBytes int) ([]byte, error) {
	answer := falseAnswer
	if intersects {
		answer = trueAnswer
	}
	if len(answer) > maximumBytes {
		return nil, fmt.Errorf("%w: %d bytes exceeds %d", ErrAnswerLimit, len(answer), maximumBytes)
	}
	return []byte(answer), nil
}

func parseAnswer(reference []byte, limits Limits) (bool, error) {
	if len(reference) == 0 || len(reference) > limits.MaxAnswerBytes || !utf8.Valid(reference) {
		return false, fmt.Errorf("%w: reference must contain 1..%d UTF-8 bytes", ErrAnswerLimit, limits.MaxAnswerBytes)
	}
	switch string(reference) {
	case falseAnswer:
		return false, nil
	case trueAnswer:
		return true, nil
	default:
		return false, errors.New("reference is not the exact graph-mask grammar")
	}
}

// validateReference checks the held mask through an independently arranged
// conventional orientation test. It never calls Solve or segmentsIntersect.
func validateReference(ctx context.Context, reference []byte, limits Limits, input geometryInput) error {
	if ctx == nil {
		return errors.New("validate segment-intersection reference: nil context")
	}
	want, err := parseAnswer(reference, limits)
	if err != nil {
		return err
	}
	got, err := referenceIntersects(ctx, input)
	if err != nil {
		return err
	}
	if got != want {
		return fmt.Errorf("reference intersection mask = %t, want %t from the closed-segment verifier", want, got)
	}
	return nil
}

func referenceIntersects(ctx context.Context, input geometryInput) (bool, error) {
	first := input.endpoints[0]
	second := input.endpoints[1]
	third := input.endpoints[2]
	fourth := input.endpoints[3]
	triples := [coordinateCount][3]point{
		{first, second, third},
		{first, second, fourth},
		{third, fourth, first},
		{third, fourth, second},
	}
	var orientations [coordinateCount]float64
	for index, triple := range triples {
		if err := ctx.Err(); err != nil {
			return false, err
		}
		orientations[index] = conventionalOrientation(triple[0], triple[1], triple[2])
	}
	if referenceOppositeSides(orientations[0], orientations[1]) &&
		referenceOppositeSides(orientations[2], orientations[3]) {
		return true, nil
	}
	return (orientations[0] == 0 && referenceInsideClosedBox(first, second, third)) ||
		(orientations[1] == 0 && referenceInsideClosedBox(first, second, fourth)) ||
		(orientations[2] == 0 && referenceInsideClosedBox(third, fourth, first)) ||
		(orientations[3] == 0 && referenceInsideClosedBox(third, fourth, second)), nil
}

func conventionalOrientation(first, second, probe point) float64 {
	// Explicit conversions forbid fused multiply-add, as in pinnedDirection.
	return float64((second.x-first.x)*(probe.y-first.y)) - float64((second.y-first.y)*(probe.x-first.x))
}

// These verifier-side predicates deliberately do not reuse the candidate's
// sign or bounding-box helpers. That keeps the held reference check from
// reproducing a defect in either candidate predicate.
func referenceOppositeSides(left, right float64) bool {
	return left != 0 && right != 0 && math.Signbit(left) != math.Signbit(right)
}

func referenceInsideClosedBox(first, second, probe point) bool {
	return referenceBetween(first.x, second.x, probe.x) &&
		referenceBetween(first.y, second.y, probe.y)
}

func referenceBetween(first, second, probe float64) bool {
	if first > second {
		first, second = second, first
	}
	return first <= probe && probe <= second
}
