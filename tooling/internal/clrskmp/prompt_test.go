package clrskmp

import (
	"bytes"
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
	prompt := []byte("kmp_matcher:\nstring: [0 0 0 0 0 0 0 0 1 1], key: [3 2 1 2 3 0 0 0 1 2]\nmatch:\n")
	want := "2\n\n"
	first, err := Solve(context.Background(), prompt, testLimits())
	if err != nil {
		t.Fatal(err)
	}
	second, err := Solve(context.Background(), prompt, testLimits())
	if err != nil || string(first) != want || string(second) != want {
		t.Fatalf("Solve() = %q/%q, error %v, want exact %q", first, second, err, want)
	}
}

func TestSolveReturnsFirstOverlapOrHaystackLength(t *testing.T) {
	t.Parallel()
	tests := map[string]struct {
		prompt string
		want   string
	}{
		"first match": {
			prompt: "kmp_matcher:\nstring: [0 0 0 0 0 0 0 0 1 1], key: [1 2 1 2 3 0 0 0 1 2]\nmatch:\n",
			want:   "0\n\n",
		},
		"overlap fallback": {
			prompt: "kmp_matcher:\nstring: [0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 1 1 1 1], key: [0 1 0 0 1 0 1 3 3 3 3 3 3 3 3 3 0 1 0 1]\nmatch:\n",
			want:   "3\n\n",
		},
		"single-symbol needle": {
			prompt: "kmp_matcher:\nstring: [0 0 0 0 0 0 0 1], key: [3 2 1 0 3 3 3 0]\nmatch:\n",
			want:   "3\n\n",
		},
		"no match sentinel": {
			prompt: "kmp_matcher:\nstring: [0 0 0 0 0 0 0 0 1 1], key: [3 3 3 3 3 3 3 3 0 1]\nmatch:\n",
			want:   "8\n\n",
		},
	}
	for name, test := range tests {
		name, test := name, test
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			answer, err := Solve(context.Background(), []byte(test.prompt), testLimits())
			if err != nil || string(answer) != test.want {
				t.Fatalf("Solve() = %q, error %v, want %q", answer, err, test.want)
			}
		})
	}
}

func TestKMPMatchesIndependentStandardLibraryOracleExhaustively(t *testing.T) {
	t.Parallel()
	for haystackLength := 1; haystackLength <= 7; haystackLength++ {
		for needleLength := 1; needleLength <= 4; needleLength++ {
			for haystackWord := 0; haystackWord < 1<<haystackLength; haystackWord++ {
				haystack := binaryWord(haystackWord, haystackLength)
				for needleWord := 0; needleWord < 1<<needleLength; needleWord++ {
					needle := binaryWord(needleWord, needleLength)
					got, err := kmpFirstMatch(context.Background(), matchInput{haystack: haystack, needle: needle})
					if err != nil {
						t.Fatal(err)
					}
					want := bytes.Index(haystack, needle)
					if want < 0 {
						want = len(haystack)
					}
					if got != want {
						t.Fatalf("KMP(%v, %v) = %d, want %d", haystack, needle, got, want)
					}
				}
			}
		}
	}
}

func TestSolveRejectsMalformedAndOversizedPrompts(t *testing.T) {
	t.Parallel()
	valid := "kmp_matcher:\nstring: [0 0 0 0 0 0 0 0 1 1], key: [3 2 1 2 3 0 0 0 1 2]\nmatch:\n"
	tests := map[string]struct {
		prompt string
		mutate func(*Limits)
		want   error
	}{
		"wrong task":       {prompt: strings.Replace(valid, "kmp_matcher", "naive_string_matcher", 1), want: ErrMalformedPrompt},
		"hinted trace":     {prompt: strings.Replace(valid, "\nmatch:\n", ", initial_trace: [0]\ntrace | s:\n", 1), want: ErrMalformedPrompt},
		"needle first":     {prompt: strings.Replace(valid, "string: [0", "string: [1", 1), want: ErrMalformedPrompt},
		"split returns":    {prompt: strings.Replace(valid, "0 0 1 1]", "0 1 0 1]", 1), want: ErrMalformedPrompt},
		"wrong split size": {prompt: strings.Replace(valid, "0 0 1 1]", "0 1 1 1]", 1), want: ErrMalformedPrompt},
		"mask category":    {prompt: strings.Replace(valid, "string: [0", "string: [2", 1), want: ErrMalformedPrompt},
		"key category":     {prompt: strings.Replace(valid, "key: [3", "key: [4", 1), want: ErrMalformedPrompt},
		"key count":        {prompt: strings.Replace(valid, " 1 2]\nmatch", "]\nmatch", 1), want: ErrMalformedPrompt},
		"missing newline":  {prompt: strings.TrimSuffix(valid, "\n"), want: ErrMalformedPrompt},
		"comma separator":  {prompt: strings.Replace(valid, "0 0 0", "0, 0 0", 1), want: ErrMalformedPrompt},
		"double space":     {prompt: strings.Replace(valid, "0 0 0", "0  0 0", 1), want: ErrMalformedPrompt},
		"too many nodes":   {prompt: valid, mutate: func(limits *Limits) { limits.MaxValues = 9 }, want: ErrPromptLimit},
		"oversized prompt": {prompt: valid, mutate: func(limits *Limits) {
			limits.MaxPromptBytes = len(valid) - 1
		}, want: ErrPromptLimit},
		"oversized answer": {prompt: valid, mutate: func(limits *Limits) {
			limits.MaxAnswerBytes = 2
		}, want: ErrAnswerLimit},
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
	prompt := []byte("kmp_matcher:\nstring: [0 0 0 0 0 0 0 1], key: [3 2 1 0 3 3 3 0]\nmatch:\n")
	if _, err := Solve(ctx, prompt, testLimits()); !errors.Is(err, context.Canceled) {
		t.Fatalf("Solve(cancelled) error = %v, want context.Canceled", err)
	}
	limits := testLimits()
	limits.MaxValues = 0
	if _, err := Solve(context.Background(), prompt, limits); !errors.Is(err, ErrInvalidLimits) {
		t.Fatalf("Solve(open limits) error = %v, want ErrInvalidLimits", err)
	}
}

func TestMatcherAndIndependentVerifierCheckCancellationInsideWork(t *testing.T) {
	t.Parallel()
	prefixContext := &cancelAfterChecksContext{Context: context.Background(), cancelAt: 2}
	if _, err := kmpFirstMatch(prefixContext, matchInput{
		haystack: []byte{0, 1, 0, 1, 0, 1}, needle: []byte{0, 1, 0, 1},
	}); !errors.Is(err, context.Canceled) {
		t.Fatalf("KMP prefix cancellation error = %v, want context.Canceled", err)
	}
	searchContext := &cancelAfterChecksContext{Context: context.Background(), cancelAt: 3}
	if _, err := kmpFirstMatch(searchContext, matchInput{
		haystack: []byte{3, 3, 3, 3, 3, 3}, needle: []byte{0},
	}); !errors.Is(err, context.Canceled) {
		t.Fatalf("KMP search cancellation error = %v, want context.Canceled", err)
	}
	verifierContext := &cancelAfterChecksContext{Context: context.Background(), cancelAt: 3}
	if _, err := naiveFirstMatch(verifierContext, matchInput{
		haystack: []byte{3, 3, 3, 3, 3, 3}, needle: []byte{0},
	}); !errors.Is(err, context.Canceled) {
		t.Fatalf("naive verifier cancellation error = %v, want context.Canceled", err)
	}
}

func TestValidateReferenceRejectsWrongOrNonCanonicalIndexes(t *testing.T) {
	t.Parallel()
	input := matchInput{haystack: []byte{3, 2, 1, 2, 3, 0, 0, 0}, needle: []byte{1, 2}}
	for name, reference := range map[string]string{
		"wrong first match": "3\n\n",
		"leading zero":      "02\n\n",
		"out of range":      "9\n\n",
		"foreign syntax":    "[2]\n\n",
	} {
		if err := validateReference(context.Background(), []byte(reference), testLimits(), input); err == nil {
			t.Fatalf("validateReference accepted %s reference %q", name, reference)
		}
	}
	if err := validateReference(context.Background(), []byte("2\n\n"), testLimits(), input); err != nil {
		t.Fatalf("validateReference rejected exact first match: %v", err)
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
		evidence.Algorithm.Path != "clrs/_src/algorithms/strings.py" ||
		evidence.Algorithm.GitBlob != "3d5bbe3ae5e3b684afb56dcddbbff52b5f1cf30e" ||
		evidence.Algorithm.SHA256 != "b9a7c21460c1689c283f7353b827add518c99800adcd39f85f1be84ac220bc75" ||
		evidence.Sampler.SHA256 != "01921e9ca7fa0cc81a8ce82dd76869820f1e9ad8863d5b76b088b0610a2e0473" ||
		evidence.Probing.SHA256 != "6ee8bea717c6a820fec0457c8be01a4459d5b2daab9c2c883ab8db333478f064" {
		t.Fatalf("source file identities = %#v", evidence)
	}
	_, filename, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("locate KMP source test")
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
		func(value *SourceEvidence) { value.Algorithm.Path = "strings-other.py" },
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

func binaryWord(word, length int) []byte {
	values := make([]byte, length)
	for index := range length {
		values[index] = byte((word >> index) & 1)
	}
	return values
}

func testLimits() Limits {
	return Limits{MaxPromptBytes: 512, MaxValues: 64, MaxAnswerBytes: 32}
}
