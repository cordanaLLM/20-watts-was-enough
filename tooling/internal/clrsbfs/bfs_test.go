package clrsbfs

import (
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

const tiePrompt = "bfs:\ns: 5, A: [[0 0 0 1 1 0 0], [0 0 1 0 0 1 0], [0 1 0 1 0 0 1], [1 0 1 0 0 0 0], [1 0 0 0 0 1 1], [0 1 0 0 1 0 0], [0 0 1 0 1 0 0]]\npi:\n"

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

func TestSolveMatchesPinnedSynchronousTieRule(t *testing.T) {
	t.Parallel()
	want := "[4 5 1 0 5 5 4]\n\n"
	first, err := Solve(context.Background(), []byte(tiePrompt), testLimits())
	if err != nil {
		t.Fatal(err)
	}
	second, err := Solve(context.Background(), []byte(tiePrompt), testLimits())
	if err != nil || string(first) != want || string(second) != want {
		t.Fatalf("Solve() = %q/%q, error %v, want exact %q", first, second, err, want)
	}
	if err := Verify(context.Background(), []byte(tiePrompt), first, testLimits()); err != nil {
		t.Fatalf("Verify(Solve()) error = %v", err)
	}
	if err := Verify(context.Background(), []byte(tiePrompt), []byte("[4 5 1 2 5 5 4]\n\n"), testLimits()); !errors.Is(err, ErrVerificationMismatch) {
		t.Fatalf("Verify(alternative shortest tree) error = %v, want ErrVerificationMismatch", err)
	}
}

func TestSolveAndVerifierCrossCheckDeterministicGraphCatalogue(t *testing.T) {
	t.Parallel()
	random := rand.New(rand.NewSource(20260904))
	const cases = 512
	for index := range cases {
		size := 1 + random.Intn(16)
		adjacency := make([][]bool, size)
		for row := range size {
			adjacency[row] = make([]bool, size)
			adjacency[row][row] = random.Intn(4) == 0
			for column := 0; column < row; column++ {
				edge := random.Intn(3) == 0
				adjacency[row][column] = edge
				adjacency[column][row] = edge
			}
		}
		source := random.Intn(size)
		prompt := buildPrompt(source, adjacency)
		answer, err := Solve(context.Background(), prompt, testLimits())
		if err != nil {
			t.Fatalf("case %d Solve() error = %v", index, err)
		}
		if err := Verify(context.Background(), prompt, answer, testLimits()); err != nil {
			t.Fatalf("case %d Verify(Solve()) error = %v; prompt = %q; answer = %q", index, err, prompt, answer)
		}
	}
}

func TestBFSRemainsOutsideFrozenShakedownRegistry(t *testing.T) {
	t.Parallel()
	if ResultAuthority != "NO_RESULT" {
		t.Fatalf("ResultAuthority = %q, want NO_RESULT", ResultAuthority)
	}
	for _, task := range clrsfixture.ShakedownTasks() {
		if task == clrsfixture.TaskKind("bfs") {
			t.Fatal("BFS was admitted without superseding Decision 0055")
		}
	}
}

func TestSolveCoversSingleNodeDisconnectedAndCompleteGraphs(t *testing.T) {
	t.Parallel()
	tests := []struct {
		name   string
		prompt string
		want   string
	}{
		{name: "single self loop", prompt: "bfs:\ns: 0, A: [[1]]\npi:\n", want: "[0]\n\n"},
		{name: "disconnected", prompt: "bfs:\ns: 2, A: [[0 1 0 0], [1 0 0 0], [0 0 0 0], [0 0 0 1]]\npi:\n", want: "[0 1 2 3]\n\n"},
		{name: "complete", prompt: "bfs:\ns: 2, A: [[0 1 1 1], [1 0 1 1], [1 1 0 1], [1 1 1 0]]\npi:\n", want: "[2 2 2 2]\n\n"},
	}
	for _, test := range tests {
		test := test
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()
			answer, err := Solve(context.Background(), []byte(test.prompt), testLimits())
			if err != nil || string(answer) != test.want {
				t.Fatalf("Solve() = %q, error %v, want %q", answer, err, test.want)
			}
			if err := Verify(context.Background(), []byte(test.prompt), answer, testLimits()); err != nil {
				t.Fatalf("Verify(Solve()) error = %v", err)
			}
		})
	}
}

func TestSolveRejectsMalformedAndOversizedPrompts(t *testing.T) {
	t.Parallel()
	tests := map[string]struct {
		prompt []byte
		mutate func(*Limits)
		want   error
	}{
		"empty":                {prompt: nil, want: ErrMalformedPrompt},
		"invalid UTF-8":        {prompt: []byte{0xff}, want: ErrMalformedPrompt},
		"wrong task":           {prompt: []byte(strings.Replace(tiePrompt, "bfs:", "dfs:", 1)), want: ErrMalformedPrompt},
		"hinted trace":         {prompt: []byte(strings.Replace(tiePrompt, "\npi:\n", ", initial_trace: [0]\ntrace | pi:\n", 1)), want: ErrMalformedPrompt},
		"wrong source marker":  {prompt: []byte(strings.Replace(tiePrompt, "\ns: ", "\nsource: ", 1)), want: ErrMalformedPrompt},
		"leading-zero source":  {prompt: []byte(strings.Replace(tiePrompt, "\ns: 5", "\ns: 05", 1)), want: ErrMalformedPrompt},
		"source out of range":  {prompt: []byte(strings.Replace(tiePrompt, "\ns: 5", "\ns: 7", 1)), want: ErrMalformedPrompt},
		"wrong output":         {prompt: []byte(strings.Replace(tiePrompt, "\npi:\n", "\nreach:\n", 1)), want: ErrMalformedPrompt},
		"missing newline":      {prompt: []byte(strings.TrimSuffix(tiePrompt, "\n")), want: ErrMalformedPrompt},
		"bad row separator":    {prompt: []byte(strings.Replace(tiePrompt, "], [", "],[", 1)), want: ErrMalformedPrompt},
		"double space":         {prompt: []byte(strings.Replace(tiePrompt, "0 0 0", "0  0 0", 1)), want: ErrMalformedPrompt},
		"non-square":           {prompt: []byte("bfs:\ns: 0, A: [[0 1], [1]]\npi:\n"), want: ErrMalformedPrompt},
		"asymmetric":           {prompt: []byte(strings.Replace(tiePrompt, "[0 0 1 0 0 1 0]", "[1 0 1 0 0 1 0]", 1)), want: ErrMalformedPrompt},
		"float edge":           {prompt: []byte(strings.Replace(tiePrompt, "0 0 0", "0.0 0 0", 1)), want: ErrMalformedPrompt},
		"negative edge":        {prompt: []byte(strings.Replace(tiePrompt, "0 0 0", "-1 0 0", 1)), want: ErrMalformedPrompt},
		"nonbinary edge":       {prompt: []byte(strings.Replace(tiePrompt, "0 0 0", "2 0 0", 1)), want: ErrMalformedPrompt},
		"too many nodes":       {prompt: []byte(tiePrompt), mutate: func(limits *Limits) { limits.MaxNodes = 6 }, want: ErrPromptLimit},
		"oversized edge token": {prompt: []byte(strings.Replace(tiePrompt, "[[0 ", "[["+strings.Repeat("1", 33)+" ", 1)), want: ErrPromptLimit},
		"oversized prompt":     {prompt: []byte(tiePrompt), mutate: func(limits *Limits) { limits.MaxPromptBytes = len(tiePrompt) - 1 }, want: ErrPromptLimit},
		"oversized answer":     {prompt: []byte(tiePrompt), mutate: func(limits *Limits) { limits.MaxAnswerBytes = 4 }, want: ErrAnswerLimit},
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

func TestVerifyRejectsMalformedAndIncorrectAnswers(t *testing.T) {
	t.Parallel()
	tests := map[string]struct {
		answer []byte
		mutate func(*Limits)
		want   error
	}{
		"empty":            {answer: nil, want: ErrAnswerLimit},
		"invalid UTF-8":    {answer: []byte{0xff}, want: ErrAnswerLimit},
		"missing prefix":   {answer: []byte("4 5 1 0 5 5 4]\n\n"), want: ErrMalformedAnswer},
		"missing suffix":   {answer: []byte("[4 5 1 0 5 5 4]"), want: ErrMalformedAnswer},
		"wrong count":      {answer: []byte("[4 5 1]\n\n"), want: ErrMalformedAnswer},
		"double space":     {answer: []byte("[4 5  1 0 5 5 4]\n\n"), want: ErrMalformedAnswer},
		"leading zero":     {answer: []byte("[4 05 1 0 5 5 4]\n\n"), want: ErrMalformedAnswer},
		"out of range":     {answer: []byte("[4 7 1 0 5 5 4]\n\n"), want: ErrMalformedAnswer},
		"wrong source":     {answer: []byte("[4 5 1 0 5 4 4]\n\n"), want: ErrVerificationMismatch},
		"wrong tie":        {answer: []byte("[4 5 1 2 5 5 4]\n\n"), want: ErrVerificationMismatch},
		"oversized answer": {answer: []byte("[4 5 1 0 5 5 4]\n\n"), mutate: func(limits *Limits) { limits.MaxAnswerBytes = 8 }, want: ErrAnswerLimit},
	}
	for name, test := range tests {
		name, test := name, test
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			limits := testLimits()
			if test.mutate != nil {
				test.mutate(&limits)
			}
			if err := Verify(context.Background(), []byte(tiePrompt), test.answer, limits); !errors.Is(err, test.want) {
				t.Fatalf("Verify() error = %v, want %v", err, test.want)
			}
		})
	}
}

func TestSolveAndVerifyHonourCancellationAndClosedLimits(t *testing.T) {
	t.Parallel()
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err := Solve(ctx, []byte(tiePrompt), testLimits()); !errors.Is(err, context.Canceled) {
		t.Fatalf("Solve(cancelled) error = %v, want context.Canceled", err)
	}
	if err := Verify(ctx, []byte(tiePrompt), []byte("[4 5 1 0 5 5 4]\n\n"), testLimits()); !errors.Is(err, context.Canceled) {
		t.Fatalf("Verify(cancelled) error = %v, want context.Canceled", err)
	}
	if _, err := Solve(nil, []byte(tiePrompt), testLimits()); err == nil {
		t.Fatal("Solve(nil context) succeeded")
	}
	if err := Verify(nil, []byte(tiePrompt), []byte("[4 5 1 0 5 5 4]\n\n"), testLimits()); err == nil {
		t.Fatal("Verify(nil context) succeeded")
	}
	limits := testLimits()
	limits.MaxNodes = 0
	if _, err := Solve(context.Background(), []byte(tiePrompt), limits); !errors.Is(err, ErrInvalidLimits) {
		t.Fatalf("Solve(open limits) error = %v, want ErrInvalidLimits", err)
	}
	if err := Verify(context.Background(), []byte(tiePrompt), nil, limits); !errors.Is(err, ErrInvalidLimits) {
		t.Fatalf("Verify(open limits) error = %v, want ErrInvalidLimits", err)
	}
}

func TestSolveAndVerifyCheckCancellationInsideGraphWork(t *testing.T) {
	t.Parallel()
	solveContext := &cancelAfterChecksContext{Context: context.Background(), cancelAt: 12}
	if _, err := Solve(solveContext, []byte(tiePrompt), testLimits()); !errors.Is(err, context.Canceled) {
		t.Fatalf("Solve(graph cancellation) error = %v, want context.Canceled", err)
	}
	verifyContext := &cancelAfterChecksContext{Context: context.Background(), cancelAt: 12}
	if err := Verify(verifyContext, []byte(tiePrompt), []byte("[4 5 1 0 5 5 4]\n\n"), testLimits()); !errors.Is(err, context.Canceled) {
		t.Fatalf("Verify(graph cancellation) error = %v, want context.Canceled", err)
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
		t.Fatal("locate BFS source test")
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
	source.Commit = strings.Repeat("f", 40)
	if err := evidence.ValidateSource(source); err == nil {
		t.Fatal("ValidateSource accepted a different canonical source identity")
	}
}

func buildPrompt(source int, adjacency [][]bool) []byte {
	var prompt strings.Builder
	prompt.WriteString("bfs:\ns: ")
	prompt.WriteString(strconv.Itoa(source))
	prompt.WriteString(", A: [[")
	for row := range adjacency {
		if row > 0 {
			prompt.WriteString("], [")
		}
		for column, edge := range adjacency[row] {
			if column > 0 {
				prompt.WriteByte(' ')
			}
			if edge {
				prompt.WriteByte('1')
			} else {
				prompt.WriteByte('0')
			}
		}
	}
	prompt.WriteString("]]\npi:\n")
	return []byte(prompt.String())
}

func testLimits() Limits {
	return Limits{
		MaxPromptBytes: 64 << 10,
		MaxNodes:       64,
		MaxTokenBytes:  32,
		MaxAnswerBytes: 8 << 10,
	}
}
