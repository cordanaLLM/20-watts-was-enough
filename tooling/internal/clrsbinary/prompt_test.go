package clrsbinary

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

func TestSolveMatchesPinnedNoHintPromptAndReferenceGrammar(t *testing.T) {
	t.Parallel()
	prompt := []byte("binary_search:\nkey: [0.424 0.545 0.549 0.603 0.715], target: 0.646\nreturn:\n")
	want := "4\n\n"
	first, err := Solve(context.Background(), prompt, testLimits())
	if err != nil {
		t.Fatal(err)
	}
	second, err := Solve(context.Background(), prompt, testLimits())
	if err != nil || string(first) != want || string(second) != want {
		t.Fatalf("Solve() = %q/%q, error %v, want exact %q", first, second, err, want)
	}
}

func TestSolveUsesLowerBoundClampedToTheFinalIndex(t *testing.T) {
	t.Parallel()
	tests := map[string]struct {
		target string
		want   string
	}{
		"below range":     {target: "0.1", want: "0\n\n"},
		"first duplicate": {target: "0.3", want: "1\n\n"},
		"between values":  {target: "0.4", want: "3\n\n"},
		"above range":     {target: "0.9", want: "3\n\n"},
	}
	for name, test := range tests {
		name, test := name, test
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			prompt := []byte("binary_search:\nkey: [0.2 0.3 0.3 0.5], target: " + test.target + "\nreturn:\n")
			answer, err := Solve(context.Background(), prompt, testLimits())
			if err != nil || string(answer) != test.want {
				t.Fatalf("Solve() = %q, error %v, want %q", answer, err, test.want)
			}
		})
	}
}

func TestSolveRejectsMalformedAndOversizedPrompts(t *testing.T) {
	t.Parallel()
	valid := "binary_search:\nkey: [0.1 0.3 0.5], target: 0.4\nreturn:\n"
	tests := map[string]struct {
		prompt string
		mutate func(*Limits)
		want   error
	}{
		"wrong task":       {prompt: strings.Replace(valid, "binary_search", "minimum", 1), want: ErrMalformedPrompt},
		"hinted trace":     {prompt: "binary_search:\nkey: [0.1 0.3], target: 0.2, initial_trace: (0, 1)\ntrace | (low, high):\n", want: ErrMalformedPrompt},
		"unsorted key":     {prompt: strings.Replace(valid, "0.1 0.3 0.5", "0.3 0.1 0.5", 1), want: ErrMalformedPrompt},
		"missing target":   {prompt: "binary_search:\nkey: [0.1 0.3 0.5]\nreturn:\n", want: ErrMalformedPrompt},
		"missing newline":  {prompt: strings.TrimSuffix(valid, "\n"), want: ErrMalformedPrompt},
		"comma separator":  {prompt: strings.Replace(valid, "0.1 0.3", "0.1, 0.3", 1), want: ErrMalformedPrompt},
		"double space":     {prompt: strings.Replace(valid, "0.1 0.3", "0.1  0.3", 1), want: ErrMalformedPrompt},
		"non-finite":       {prompt: strings.Replace(valid, "0.4", "NaN", 1), want: ErrMalformedPrompt},
		"sampler range":    {prompt: strings.Replace(valid, "0.4", "1.0", 1), want: ErrMalformedPrompt},
		"too many values":  {prompt: valid, mutate: func(limits *Limits) { limits.MaxValues = 2 }, want: ErrPromptLimit},
		"oversized token":  {prompt: valid, mutate: func(limits *Limits) { limits.MaxTokenBytes = 2 }, want: ErrPromptLimit},
		"oversized prompt": {prompt: valid, mutate: func(limits *Limits) { limits.MaxPromptBytes = len(valid) - 1 }, want: ErrPromptLimit},
		"oversized answer": {prompt: valid, mutate: func(limits *Limits) { limits.MaxAnswerBytes = 2 }, want: ErrAnswerLimit},
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
	prompt := []byte("binary_search:\nkey: [0.1 0.3], target: 0.2\nreturn:\n")
	if _, err := Solve(ctx, prompt, testLimits()); !errors.Is(err, context.Canceled) {
		t.Fatalf("Solve(cancelled) error = %v, want context.Canceled", err)
	}
	limits := testLimits()
	limits.MaxValues = 0
	if _, err := Solve(context.Background(), prompt, limits); !errors.Is(err, ErrInvalidLimits) {
		t.Fatalf("Solve(open limits) error = %v, want ErrInvalidLimits", err)
	}
}

func TestSolveChecksCancellationInsideBinarySearch(t *testing.T) {
	t.Parallel()
	ctx := &cancelAfterChecksContext{Context: context.Background(), cancelAt: 12}
	prompt := []byte("binary_search:\nkey: [0.1 0.2 0.3 0.4 0.5 0.6 0.7 0.8], target: 0.65\nreturn:\n")
	if _, err := Solve(ctx, prompt, testLimits()); !errors.Is(err, context.Canceled) {
		t.Fatalf("Solve(search cancellation) error = %v, want context.Canceled", err)
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
		evidence.Algorithm.Path != "clrs/_src/algorithms/searching.py" ||
		evidence.Algorithm.GitBlob != "bc59a9eae7d86881b918d08a16279493ac6dc7a6" ||
		evidence.Algorithm.SHA256 != "4a410b290d94efacb112235757185dcafe97d27a59b4faec29e6196a5f0af117" ||
		evidence.Sampler.SHA256 != "01921e9ca7fa0cc81a8ce82dd76869820f1e9ad8863d5b76b088b0610a2e0473" ||
		evidence.Probing.SHA256 != "6ee8bea717c6a820fec0457c8be01a4459d5b2daab9c2c883ab8db333478f064" {
		t.Fatalf("source file identities = %#v", evidence)
	}
	_, filename, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("locate binary-search source test")
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
		func(value *SourceEvidence) { value.Algorithm.Path = "searching-other.py" },
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
		MaxPromptBytes: 512,
		MaxValues:      64,
		MaxTokenBytes:  32,
		MaxAnswerBytes: 32,
	}
}
