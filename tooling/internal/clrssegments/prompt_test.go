package clrssegments

import (
	"bytes"
	"context"
	"errors"
	"math/rand"
	"os"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"testing"

	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/clrsfixture"
)

const pinnedSeed3Prompt = `segments_intersect:
x: [0.558854 0.259252 0.415101 0.283525], y: [0.693137 0.440453 0.156867 0.544649]
intersect:
`

type cancelAfterChecksContext struct {
	context.Context
	cancelAt int
	checks   int
}

func (ctx *cancelAfterChecksContext) Err() error {
	ctx.checks++
	if ctx.checks >= ctx.cancelAt {
		return context.Canceled
	}
	return nil
}

func TestSolveMatchesPinnedSeed3FixedGeometryCell(t *testing.T) {
	t.Parallel()
	first, err := Solve(context.Background(), []byte(pinnedSeed3Prompt), testLimits())
	if err != nil {
		t.Fatal(err)
	}
	second, err := Solve(context.Background(), []byte(pinnedSeed3Prompt), testLimits())
	if err != nil || string(first) != trueAnswer || string(second) != trueAnswer {
		t.Fatalf("Solve(seed=3,fixed-four) = %q/%q, error %v, want %q", first, second, err, trueAnswer)
	}
	input, err := parsePrompt(context.Background(), []byte(pinnedSeed3Prompt), testLimits())
	if err != nil {
		t.Fatal(err)
	}
	if err := validateReference(context.Background(), []byte(trueAnswer), testLimits(), input); err != nil {
		t.Fatalf("validateReference(seed=3,fixed-four): %v", err)
	}
}

func TestSolveMatchesClosedSegmentBoundarySemantics(t *testing.T) {
	t.Parallel()
	tests := []struct {
		name string
		xs   string
		ys   string
		want string
	}{
		{"proper crossing", "0.1 0.9 0.1 0.9", "0.1 0.9 0.9 0.1", trueAnswer},
		{"parallel disjoint", "0.1 0.2 0.1 0.2", "0.1 0.1 0.2 0.2", falseAnswer},
		{"endpoint touch", "0.1 0.5 0.5 0.9", "0.1 0.5 0.5 0.1", trueAnswer},
		{"collinear overlap", "0.1 0.7 0.3 0.9", "0.1 0.7 0.3 0.9", trueAnswer},
		{"collinear separated", "0.1 0.2 0.5 0.6", "0.1 0.2 0.5 0.6", falseAnswer},
		{"point on segment", "0.5 0.5 0.1 0.9", "0.5 0.5 0.1 0.9", trueAnswer},
		{"point off segment", "0.5 0.5 0.1 0.9", "0.6 0.6 0.1 0.9", falseAnswer},
		{"identical point segments", "0.5 0.5 0.5 0.5", "0.5 0.5 0.5 0.5", trueAnswer},
		{"distinct point segments", "0.2 0.2 0.8 0.8", "0.2 0.2 0.8 0.8", falseAnswer},
	}
	for _, test := range tests {
		test := test
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()
			prompt := geometryPrompt(test.xs, test.ys)
			answer, err := Solve(context.Background(), []byte(prompt), testLimits())
			if err != nil || string(answer) != test.want {
				t.Fatalf("Solve(%s) = %q, error %v, want %q", test.name, answer, err, test.want)
			}
			input, err := parsePrompt(context.Background(), []byte(prompt), testLimits())
			if err != nil {
				t.Fatal(err)
			}
			if err := validateReference(context.Background(), []byte(test.want), testLimits(), input); err != nil {
				t.Fatalf("validateReference(%s): %v", test.name, err)
			}
		})
	}
}

func TestSolverAndReferenceVerifierAgreeAcrossDeterministicGrid(t *testing.T) {
	t.Parallel()
	random := rand.New(rand.NewSource(0x20))
	for cell := 0; cell < 4_096; cell++ {
		xs := make([]string, 0, coordinateCount)
		ys := make([]string, 0, coordinateCount)
		for range coordinateCount {
			xs = append(xs, gridCoordinate(random.Intn(1_000_000)))
			ys = append(ys, gridCoordinate(random.Intn(1_000_000)))
		}
		prompt := geometryPrompt(strings.Join(xs, " "), strings.Join(ys, " "))
		input, err := parsePrompt(context.Background(), []byte(prompt), testLimits())
		if err != nil {
			t.Fatalf("parse deterministic cell %d: %v", cell, err)
		}
		intersects, err := referenceIntersects(context.Background(), input)
		if err != nil {
			t.Fatalf("verify deterministic cell %d: %v", cell, err)
		}
		want, err := formatAnswer(intersects, testLimits().MaxAnswerBytes)
		if err != nil {
			t.Fatal(err)
		}
		got, err := Solve(context.Background(), []byte(prompt), testLimits())
		if err != nil || !bytes.Equal(got, want) {
			t.Fatalf("cell %d solver/verifier = %q/%q, error %v", cell, got, want, err)
		}
	}
}

func TestValidateReferenceRejectsWrongMaskAndForeignGrammar(t *testing.T) {
	t.Parallel()
	input, err := parsePrompt(context.Background(), []byte(pinnedSeed3Prompt), testLimits())
	if err != nil {
		t.Fatal(err)
	}
	for name, reference := range map[string][]byte{
		"wrong mask":         []byte(falseAnswer),
		"missing blank line": []byte("1\n"),
		"boolean":            []byte("true\n\n"),
		"array":              []byte("[1]\n\n"),
		"trailing bytes":     []byte("1\n\nextra"),
	} {
		name, reference := name, reference
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			if err := validateReference(context.Background(), reference, testLimits(), input); err == nil {
				t.Fatalf("validateReference accepted %s", name)
			}
		})
	}
	if err := validateReference(nil, []byte(trueAnswer), testLimits(), input); err == nil {
		t.Fatal("validateReference accepted nil context")
	}
}

func TestSolveAcceptsSixDecimalScientificCoordinateGrammar(t *testing.T) {
	t.Parallel()
	prompt := geometryPrompt("1e-06 0.2 0.3 0.4", "9.9e-05 0.2 0.4 0.3")
	answer, err := Solve(context.Background(), []byte(prompt), testLimits())
	if err != nil || len(answer) != len(falseAnswer) {
		t.Fatalf("Solve(scientific coordinates) = %q, error %v", answer, err)
	}
}

func TestCoordinateGrammarMatchesPinnedNumPyScalarSpellings(t *testing.T) {
	t.Parallel()
	for _, token := range []string{
		"0.0", "1e-06", "9e-06", "1e-05", "1.1e-05", "9.9e-05",
		"0.0001", "0.001", "0.01", "0.1", "0.999999",
	} {
		if _, err := parseCoordinate(token, testLimits().MaxTokenBytes); err != nil {
			t.Errorf("parseCoordinate(%q): %v", token, err)
		}
	}
	for _, token := range []string{
		"0", "0.000001", "0.00001", "1e-04", "1e-03", "1e-02", "1e-01", "1.0e-05",
	} {
		if _, err := parseCoordinate(token, testLimits().MaxTokenBytes); err == nil {
			t.Errorf("parseCoordinate accepted noncanonical spelling %q", token)
		}
	}
}

func TestSolveRejectsMalformedAndOversizedPrompts(t *testing.T) {
	t.Parallel()
	tests := map[string]struct {
		prompt []byte
		mutate func(*Limits)
		want   error
	}{
		"empty":               {prompt: nil, want: ErrMalformedPrompt},
		"bad UTF-8":           {prompt: []byte{0xff}, want: ErrMalformedPrompt},
		"wrong task":          {prompt: []byte(strings.Replace(pinnedSeed3Prompt, "segments_intersect", "jarvis_march", 1)), want: ErrMalformedPrompt},
		"wrong x marker":      {prompt: []byte(strings.Replace(pinnedSeed3Prompt, "\nx: [", "\nxs: [", 1)), want: ErrMalformedPrompt},
		"wrong y marker":      {prompt: []byte(strings.Replace(pinnedSeed3Prompt, "], y: [", "]; y: [", 1)), want: ErrMalformedPrompt},
		"wrong output":        {prompt: []byte(strings.Replace(pinnedSeed3Prompt, "\nintersect:\n", "\nreturn:\n", 1)), want: ErrMalformedPrompt},
		"hinted trace":        {prompt: []byte(strings.Replace(pinnedSeed3Prompt, "\nintersect:\n", ", initial_trace: 0\ntrace | intersect:\n", 1)), want: ErrMalformedPrompt},
		"missing newline":     {prompt: []byte(strings.TrimSuffix(pinnedSeed3Prompt, "\n")), want: ErrMalformedPrompt},
		"three x coordinates": {prompt: []byte(strings.Replace(pinnedSeed3Prompt, "0.558854 0.259252 0.415101 0.283525", "0.558854 0.259252 0.415101", 1)), want: ErrMalformedPrompt},
		"five y coordinates":  {prompt: []byte(strings.Replace(pinnedSeed3Prompt, "0.693137 0.440453 0.156867 0.544649", "0.693137 0.440453 0.156867 0.544649 0.1", 1)), want: ErrMalformedPrompt},
		"double space":        {prompt: []byte(strings.Replace(pinnedSeed3Prompt, "0.558854 0.259252", "0.558854  0.259252", 1)), want: ErrMalformedPrompt},
		"comma separator":     {prompt: []byte(strings.Replace(pinnedSeed3Prompt, "0.558854 0.259252", "0.558854, 0.259252", 1)), want: ErrMalformedPrompt},
		"non-finite":          {prompt: []byte(strings.Replace(pinnedSeed3Prompt, "0.558854", "NaN", 1)), want: ErrMalformedPrompt},
		"negative":            {prompt: []byte(strings.Replace(pinnedSeed3Prompt, "0.558854", "-0.1", 1)), want: ErrMalformedPrompt},
		"upper boundary":      {prompt: []byte(strings.Replace(pinnedSeed3Prompt, "0.558854", "1.0", 1)), want: ErrMalformedPrompt},
		"integer zero":        {prompt: []byte(strings.Replace(pinnedSeed3Prompt, "0.558854", "0", 1)), want: ErrMalformedPrompt},
		"leading zero":        {prompt: []byte(strings.Replace(pinnedSeed3Prompt, "0.558854", "00.558854", 1)), want: ErrMalformedPrompt},
		"trailing zero":       {prompt: []byte(strings.Replace(pinnedSeed3Prompt, "0.558854", "0.5588540", 1)), want: ErrMalformedPrompt},
		"sub-grid exponent":   {prompt: []byte(strings.Replace(pinnedSeed3Prompt, "0.558854", "1e-07", 1)), want: ErrMalformedPrompt},
		"positive exponent":   {prompt: []byte(strings.Replace(pinnedSeed3Prompt, "0.558854", "5e+00", 1)), want: ErrMalformedPrompt},
		"oversized token":     {prompt: []byte(pinnedSeed3Prompt), mutate: func(limits *Limits) { limits.MaxTokenBytes = 3 }, want: ErrPromptLimit},
		"oversized prompt":    {prompt: []byte(pinnedSeed3Prompt), mutate: func(limits *Limits) { limits.MaxPromptBytes = len(pinnedSeed3Prompt) - 1 }, want: ErrPromptLimit},
		"oversized answer":    {prompt: []byte(pinnedSeed3Prompt), mutate: func(limits *Limits) { limits.MaxAnswerBytes = 2 }, want: ErrAnswerLimit},
	}
	for name, test := range tests {
		name, test := name, test
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			limits := testLimits()
			if test.mutate != nil {
				test.mutate(&limits)
			}
			if _, err := Solve(context.Background(), test.prompt, limits); !errors.Is(err, test.want) {
				t.Fatalf("Solve() error = %v, want %v", err, test.want)
			}
		})
	}
}

func TestSolveHonoursCancellationAndClosedLimits(t *testing.T) {
	t.Parallel()
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err := Solve(ctx, []byte(pinnedSeed3Prompt), testLimits()); !errors.Is(err, context.Canceled) {
		t.Fatalf("Solve(cancelled) error = %v, want context.Canceled", err)
	}
	if _, err := Solve(nil, []byte(pinnedSeed3Prompt), testLimits()); err == nil {
		t.Fatal("Solve(nil context) succeeded")
	}
	for name, mutate := range map[string]func(*Limits){
		"prompt": func(limits *Limits) { limits.MaxPromptBytes = 0 },
		"token":  func(limits *Limits) { limits.MaxTokenBytes = 0 },
		"answer": func(limits *Limits) { limits.MaxAnswerBytes = 0 },
	} {
		limits := testLimits()
		mutate(&limits)
		if _, err := Solve(context.Background(), []byte(pinnedSeed3Prompt), limits); !errors.Is(err, ErrInvalidLimits) {
			t.Fatalf("Solve(open %s limit) error = %v, want ErrInvalidLimits", name, err)
		}
	}
}

func TestSolveAndVerifierCheckCancellationInsideFixedWork(t *testing.T) {
	t.Parallel()
	solverContext := &cancelAfterChecksContext{Context: context.Background(), cancelAt: 11}
	if _, err := Solve(solverContext, []byte(pinnedSeed3Prompt), testLimits()); !errors.Is(err, context.Canceled) {
		t.Fatalf("Solve(mid-work cancellation) error = %v, want context.Canceled", err)
	}
	if solverContext.checks != solverContext.cancelAt {
		t.Fatalf("solver context checks = %d, want %d", solverContext.checks, solverContext.cancelAt)
	}
	input, err := parsePrompt(context.Background(), []byte(pinnedSeed3Prompt), testLimits())
	if err != nil {
		t.Fatal(err)
	}
	verifierContext := &cancelAfterChecksContext{Context: context.Background(), cancelAt: 2}
	if err := validateReference(verifierContext, []byte(trueAnswer), testLimits(), input); !errors.Is(err, context.Canceled) {
		t.Fatalf("validateReference(mid-work cancellation) error = %v, want context.Canceled", err)
	}
}

func TestPinnedSourceEvidenceIsExact(t *testing.T) {
	t.Parallel()
	evidence := PinnedSourceEvidence()
	if evidence.SourceRecordPath != "tooling/clrs-generator/upstream.json" ||
		evidence.SourceID != "sha256:7ec3b6b7528d04f517c4e9b7c3e0cd0f7034a775d225d469d1aca5c00fec10d1" {
		t.Fatalf("source identity = %#v", evidence)
	}
	if evidence.Formatter.GitBlob != "64a2714ca879cd62a4c1d1db0a80e6c23bf61541" ||
		evidence.Formatter.SHA256 != "d6d320eb1536be8fbdb512315d55eada2db3ff87afd613762f125d38a9e7a53c" ||
		evidence.Spec.GitBlob != "db3b02e14072152df590a8df518ef058fd167930" ||
		evidence.Spec.SHA256 != "51f1cc936b28189c7b2e3b2030c30e224fb448f3d2846181983329448f1ed018" ||
		evidence.Algorithm.Path != "clrs/_src/algorithms/geometry.py" ||
		evidence.Algorithm.GitBlob != "502823d877fc184b790955c1c0fe9b32e496f823" ||
		evidence.Algorithm.SHA256 != "d0ad3ee0eacd35ab54a601cd5b37f55bcffe36146455d70e71fb7c1c67aaf776" ||
		evidence.Sampler.SHA256 != "01921e9ca7fa0cc81a8ce82dd76869820f1e9ad8863d5b76b088b0610a2e0473" ||
		evidence.Probing.SHA256 != "6ee8bea717c6a820fec0457c8be01a4459d5b2daab9c2c883ab8db333478f064" {
		t.Fatalf("source file identities = %#v", evidence)
	}
	_, filename, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("locate segment-intersection source test")
	}
	body, err := os.ReadFile(filepath.Join(filepath.Dir(filename), "..", "..", "clrs-generator", "upstream.json"))
	if err != nil {
		t.Fatal(err)
	}
	source, err := clrsfixture.ParseSourceRecord(body)
	if err != nil {
		t.Fatal(err)
	}
	if err := evidence.ValidateSource(source); err != nil {
		t.Fatal(err)
	}
	mutations := []func(*SourceEvidence){
		func(value *SourceEvidence) { value.SourceRecordPath = "other.json" },
		func(value *SourceEvidence) { value.Formatter.SHA256 = strings.Repeat("0", 64) },
		func(value *SourceEvidence) { value.Spec.GitBlob = strings.Repeat("0", 40) },
		func(value *SourceEvidence) { value.Algorithm.Path = "geometry-other.py" },
		func(value *SourceEvidence) { value.Sampler.SHA256 = strings.Repeat("f", 64) },
		func(value *SourceEvidence) { value.Probing.GitBlob = strings.Repeat("a", 40) },
	}
	for index, mutate := range mutations {
		changed := evidence
		mutate(&changed)
		if err := changed.ValidateSource(source); err == nil {
			t.Fatalf("ValidateSource accepted supporting-evidence mutation %d", index)
		}
	}
}

func geometryPrompt(xs, ys string) string {
	return "segments_intersect:\nx: [" + xs + "], y: [" + ys + "]\nintersect:\n"
}

func gridCoordinate(micro int) string {
	if micro == 0 {
		return "0.0"
	}
	return strconv.FormatFloat(float64(micro)/coordinateGridScale, 'g', -1, 64)
}

func testLimits() Limits {
	return Limits{MaxPromptBytes: 64 << 10, MaxTokenBytes: 32, MaxAnswerBytes: 8 << 10}
}
