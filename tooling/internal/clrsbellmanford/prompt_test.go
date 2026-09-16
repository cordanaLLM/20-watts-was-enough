package clrsbellmanford

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"

	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/clrsfixture"
)

const pinnedGraphPrompt = "bellman_ford:\ns: 0, A: [[0.0 0.2 0.9 0.0 0.95], [0.2 0.0 0.2 0.8 0.0], [0.9 0.2 0.0 0.2 0.0], [0.0 0.8 0.2 0.0 0.2], [0.95 0.0 0.0 0.2 0.0]]\npi:\n"

const pinnedSeed3Length8Prompt = `bellman_ford:
s: 4, A: [[0.327338 0.0 0.0 0.475282 0.785284 0.0 0.0 0.0], [0.0 0.0 0.0 0.0 0.165992 0.0 0.0 0.272299], [0.0 0.0 0.0 0.0 0.0 0.0 0.0 0.0], [0.475282 0.0 0.0 0.0 0.0 0.0 0.0 0.6624], [0.785284 0.165992 0.0 0.0 0.194658 0.0 0.0 0.0], [0.0 0.0 0.0 0.0 0.0 0.788252 0.0 0.0], [0.0 0.0 0.0 0.0 0.0 0.0 0.0 0.0], [0.0 0.272299 0.0 0.6624 0.0 0.0 0.0 0.436667]]
pi:
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

func TestSolveMatchesPinnedNoHintPredecessorGrammar(t *testing.T) {
	t.Parallel()
	want := "[0 0 1 2 3]\n\n"
	first, err := Solve(context.Background(), []byte(pinnedGraphPrompt), testLimits())
	if err != nil {
		t.Fatal(err)
	}
	second, err := Solve(context.Background(), []byte(pinnedGraphPrompt), testLimits())
	if err != nil || string(first) != want || string(second) != want {
		t.Fatalf("Solve() = %q/%q, error %v, want exact %q", first, second, err, want)
	}
}

func TestSolveMatchesPinnedSeed3Length8Cell(t *testing.T) {
	t.Parallel()
	want := "[4 4 2 7 4 5 6 1]\n\n"
	answer, err := Solve(context.Background(), []byte(pinnedSeed3Length8Prompt), testLimits())
	if err != nil || string(answer) != want {
		t.Fatalf("Solve(seed=3,length=8) = %q, error %v, want %q", answer, err, want)
	}
	input, err := parsePrompt(context.Background(), []byte(pinnedSeed3Length8Prompt), testLimits())
	if err != nil {
		t.Fatal(err)
	}
	if err := validateReference(context.Background(), []byte(want), testLimits(), input); err != nil {
		t.Fatalf("validateReference(seed=3,length=8): %v", err)
	}
}

func TestSolvePreservesPinnedSynchronousTieRule(t *testing.T) {
	t.Parallel()
	prompt := []byte("bellman_ford:\ns: 0, A: [[0.0 0.1 0.1 0.0], [0.1 0.0 0.0 0.2], [0.1 0.0 0.0 0.2], [0.0 0.2 0.2 0.0]]\npi:\n")
	want := "[0 0 0 1]\n\n"
	answer, err := Solve(context.Background(), prompt, testLimits())
	if err != nil || string(answer) != want {
		t.Fatalf("Solve(tie) = %q, error %v, want %q", answer, err, want)
	}

	input, err := parsePrompt(context.Background(), prompt, testLimits())
	if err != nil {
		t.Fatal(err)
	}
	alternativeShortest := []byte("[0 0 0 2]\n\n")
	if err := validateReference(context.Background(), alternativeShortest, testLimits(), input); err != nil {
		t.Fatalf("independent verifier rejected an alternative shortest-path tie: %v", err)
	}
}

func TestValidateReferenceRejectsInvalidPredecessorForests(t *testing.T) {
	t.Parallel()
	input, err := parsePrompt(context.Background(), []byte(pinnedGraphPrompt), testLimits())
	if err != nil {
		t.Fatal(err)
	}
	for name, reference := range map[string][]byte{
		"missing edge":      []byte("[0 0 1 0 3]\n\n"),
		"suboptimal path":   []byte("[0 0 0 1 0]\n\n"),
		"cycle":             []byte("[0 2 1 2 3]\n\n"),
		"changed source":    []byte("[1 0 1 2 3]\n\n"),
		"wrong vector size": []byte("[0 0 1 2]\n\n"),
	} {
		name, reference := name, reference
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			if err := validateReference(context.Background(), reference, testLimits(), input); err == nil {
				t.Fatalf("validateReference accepted %s", name)
			}
		})
	}

	disconnected := []byte("bellman_ford:\ns: 0, A: [[0.0 0.2 0.0], [0.2 0.0 0.0], [0.0 0.0 0.0]]\npi:\n")
	disconnectedInput, err := parsePrompt(context.Background(), disconnected, testLimits())
	if err != nil {
		t.Fatal(err)
	}
	if err := validateReference(context.Background(), []byte("[0 0 0]\n\n"), testLimits(), disconnectedInput); err == nil {
		t.Fatal("validateReference gave an unreachable node a foreign predecessor")
	}
}

func TestSolveAcceptsClosedSingleNodeBoundary(t *testing.T) {
	t.Parallel()
	prompt := []byte("bellman_ford:\ns: 0, A: [[0.0]]\npi:\n")
	answer, err := Solve(context.Background(), prompt, testLimits())
	if err != nil || string(answer) != "[0]\n\n" {
		t.Fatalf("Solve(single node) = %q, error %v", answer, err)
	}
}

func TestSolveRejectsMalformedAndOversizedPrompts(t *testing.T) {
	t.Parallel()
	tests := map[string]struct {
		prompt string
		mutate func(*Limits)
		want   error
	}{
		"wrong task":           {prompt: strings.Replace(pinnedGraphPrompt, "bellman_ford", "dijkstra", 1), want: ErrMalformedPrompt},
		"hinted trace":         {prompt: strings.Replace(pinnedGraphPrompt, "\npi:\n", ", initial_trace: [0 1]\ntrace | pi:\n", 1), want: ErrMalformedPrompt},
		"wrong source marker":  {prompt: strings.Replace(pinnedGraphPrompt, "\ns: ", "\nsource: ", 1), want: ErrMalformedPrompt},
		"leading-zero source":  {prompt: strings.Replace(pinnedGraphPrompt, "\ns: 0", "\ns: 00", 1), want: ErrMalformedPrompt},
		"source out of range":  {prompt: strings.Replace(pinnedGraphPrompt, "\ns: 0", "\ns: 5", 1), want: ErrMalformedPrompt},
		"wrong output":         {prompt: strings.Replace(pinnedGraphPrompt, "\npi:\n", "\nd:\n", 1), want: ErrMalformedPrompt},
		"missing newline":      {prompt: strings.TrimSuffix(pinnedGraphPrompt, "\n"), want: ErrMalformedPrompt},
		"bad row separator":    {prompt: strings.Replace(pinnedGraphPrompt, "], [", "],[", 1), want: ErrMalformedPrompt},
		"double space":         {prompt: strings.Replace(pinnedGraphPrompt, "0.0 0.2", "0.0  0.2", 1), want: ErrMalformedPrompt},
		"non-square":           {prompt: "bellman_ford:\ns: 0, A: [[0.0 0.2], [0.2]]\npi:\n", want: ErrMalformedPrompt},
		"asymmetric":           {prompt: strings.Replace(pinnedGraphPrompt, "[0.2 0.0 0.2", "[0.3 0.0 0.2", 1), want: ErrMalformedPrompt},
		"non-finite":           {prompt: strings.Replace(pinnedGraphPrompt, "0.95", "NaN", 1), want: ErrMalformedPrompt},
		"negative":             {prompt: strings.Replace(pinnedGraphPrompt, "0.95", "-0.95", 1), want: ErrMalformedPrompt},
		"integer scalar":       {prompt: strings.Replace(pinnedGraphPrompt, "0.95", "0", 1), want: ErrMalformedPrompt},
		"trailing zero scalar": {prompt: strings.Replace(pinnedGraphPrompt, "0.95", "0.950", 1), want: ErrMalformedPrompt},
		"exponent scalar":      {prompt: strings.Replace(pinnedGraphPrompt, "0.95", "9.5e-1", 1), want: ErrMalformedPrompt},
		"too many decimals":    {prompt: strings.Replace(pinnedGraphPrompt, "0.95", "0.9500001", 1), want: ErrMalformedPrompt},
		"below sampler range":  {prompt: strings.Replace(pinnedGraphPrompt, "0.95", "0.01", 1), want: ErrMalformedPrompt},
		"above sampler range":  {prompt: strings.Replace(pinnedGraphPrompt, "0.95", "1.0005", 1), want: ErrMalformedPrompt},
		"too many nodes":       {prompt: pinnedGraphPrompt, mutate: func(limits *Limits) { limits.MaxNodes = 4 }, want: ErrPromptLimit},
		"oversized token":      {prompt: pinnedGraphPrompt, mutate: func(limits *Limits) { limits.MaxTokenBytes = 3 }, want: ErrPromptLimit},
		"oversized prompt":     {prompt: pinnedGraphPrompt, mutate: func(limits *Limits) { limits.MaxPromptBytes = len(pinnedGraphPrompt) - 1 }, want: ErrPromptLimit},
		"oversized answer":     {prompt: pinnedGraphPrompt, mutate: func(limits *Limits) { limits.MaxAnswerBytes = 4 }, want: ErrAnswerLimit},
	}
	for name, test := range tests {
		name, test := name, test
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			limits := testLimits()
			if test.mutate != nil {
				test.mutate(&limits)
			}
			if _, err := Solve(context.Background(), []byte(test.prompt), limits); !errors.Is(err, test.want) {
				t.Fatalf("Solve() error = %v, want %v", err, test.want)
			}
		})
	}
}

func TestSolveHonoursCancellationAndClosedLimits(t *testing.T) {
	t.Parallel()
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err := Solve(ctx, []byte(pinnedGraphPrompt), testLimits()); !errors.Is(err, context.Canceled) {
		t.Fatalf("Solve(cancelled) error = %v, want context.Canceled", err)
	}
	if _, err := Solve(nil, []byte(pinnedGraphPrompt), testLimits()); err == nil {
		t.Fatal("Solve(nil context) succeeded")
	}
	limits := testLimits()
	limits.MaxNodes = 0
	if _, err := Solve(context.Background(), []byte(pinnedGraphPrompt), limits); !errors.Is(err, ErrInvalidLimits) {
		t.Fatalf("Solve(open limits) error = %v, want ErrInvalidLimits", err)
	}
}

func TestSolveChecksCancellationInsideGraphWork(t *testing.T) {
	t.Parallel()
	ctx := &cancelAfterChecksContext{Context: context.Background(), cancelAt: 15}
	if _, err := Solve(ctx, []byte(pinnedGraphPrompt), testLimits()); !errors.Is(err, context.Canceled) {
		t.Fatalf("Solve(graph cancellation) error = %v, want context.Canceled", err)
	}
	if ctx.checks != ctx.cancelAt {
		t.Fatalf("context checks = %d, want cancellation at check %d", ctx.checks, ctx.cancelAt)
	}
}

func TestPinnedSourceEvidenceIsExact(t *testing.T) {
	t.Parallel()
	evidence := PinnedSourceEvidence()
	if evidence.SourceRecordPath != "tooling/clrs-generator/upstream.json" ||
		evidence.SourceID != "sha256:7ec3b6b7528d04f517c4e9b7c3e0cd0f7034a775d225d469d1aca5c00fec10d1" {
		t.Fatalf("source identity = %#v", evidence)
	}
	if evidence.Formatter.SHA256 != "d6d320eb1536be8fbdb512315d55eada2db3ff87afd613762f125d38a9e7a53c" ||
		evidence.Spec.SHA256 != "51f1cc936b28189c7b2e3b2030c30e224fb448f3d2846181983329448f1ed018" ||
		evidence.Algorithm.Path != "clrs/_src/algorithms/graphs.py" ||
		evidence.Algorithm.GitBlob != "09303e6eab24e4c35dee510589daceb4e3cc5ee7" ||
		evidence.Algorithm.SHA256 != "75366fdd2bd72e8f84103dbda6417214fa071bd42237130909b0035b3cd34940" ||
		evidence.Sampler.SHA256 != "01921e9ca7fa0cc81a8ce82dd76869820f1e9ad8863d5b76b088b0610a2e0473" ||
		evidence.Probing.SHA256 != "6ee8bea717c6a820fec0457c8be01a4459d5b2daab9c2c883ab8db333478f064" {
		t.Fatalf("source file identities = %#v", evidence)
	}
	_, filename, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("locate Bellman-Ford source test")
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
		func(value *SourceEvidence) { value.Algorithm.Path = "graphs-other.py" },
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

func testLimits() Limits {
	return Limits{
		MaxPromptBytes: 64 << 10,
		MaxNodes:       64,
		MaxTokenBytes:  32,
		MaxAnswerBytes: 8 << 10,
	}
}
