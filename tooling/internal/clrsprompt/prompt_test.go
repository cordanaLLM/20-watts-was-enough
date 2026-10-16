package clrsprompt_test

import (
	"errors"
	"testing"

	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/clrsprompt"
)

func TestDecimalGrammar(t *testing.T) {
	t.Parallel()
	tests := []struct {
		token string
		want  bool
	}{
		{"0", true}, {"0.5", true}, {"1e-3", true}, {"1e+3", true},
		{"01", true}, {"5", true}, {"0.5e0", true},
		{"", false}, {".5", false}, {"5.", false}, {"a", false},
		{"-0.5", false}, {"+0.5", false}, {"1E-3", false},
		{"1e", false}, {"1e+", false}, {"0.5 ", false}, {"0.5x", false},
	}
	for _, test := range tests {
		t.Run(test.token, func(t *testing.T) {
			if got := clrsprompt.DecimalGrammar(test.token); got != test.want {
				t.Fatalf("DecimalGrammar(%q) = %v, want %v", test.token, got, test.want)
			}
		})
	}
}

func TestParseUnitScalar(t *testing.T) {
	t.Parallel()
	limit := errors.New("test prompt limit")
	tests := []struct {
		name, token string
		maximum     int
		want        float64
		message     string
		wantLimit   bool
	}{
		{"decimal", "0.25", 128, 0.25, "", false},
		{"exact byte limit", "0.25", 4, 0.25, "", false},
		{"lower boundary", "0", 1, 0, "", false},
		{"below upper boundary", "0.9999999999999999", 18, 0.9999999999999999, "", false},
		{"exponent", "1e-3", 4, 0.001, "", false},
		{"empty", "", 4, 0, "empty scalar", false},
		{"empty before limit", "", -1, 0, "empty scalar", false},
		{"over byte limit", "0.25", 3, 0, "test prompt limit: scalar exceeds 3 bytes", true},
		{"zero byte limit", "0", 0, 0, "test prompt limit: scalar exceeds 0 bytes", true},
		{"upper boundary", "1", 1, 0, "scalar is outside the pinned sampler range [0,1)", false},
		{"above range", "2", 1, 0, "scalar is outside the pinned sampler range [0,1)", false},
		{"bad grammar", ".5", 2, 0, "scalar is outside the finite decimal grammar", false},
		{"not finite", "1e999", 5, 0, "scalar is not finite float64", false},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			got, err := clrsprompt.ParseUnitScalar(test.token, test.maximum, limit)
			if got != test.want {
				t.Errorf("value = %v, want %v", got, test.want)
			}
			message := ""
			if err != nil {
				message = err.Error()
			}
			if message != test.message || errors.Is(err, limit) != test.wantLimit {
				t.Fatalf("error = %v (limit: %v), want %q (limit: %v)", err, errors.Is(err, limit), test.message, test.wantLimit)
			}
		})
	}
}

func TestFormatIndexList(t *testing.T) {
	t.Parallel()
	limit := errors.New("test answer limit")
	tests := []struct {
		name           string
		values         []int
		prefix, suffix string
		maximum        int
		want, message  string
	}{
		{"indices", []int{0, 1, 2}, "[", "]\n\n", 128, "[0 1 2]\n\n", ""},
		{"exact byte limit", []int{0, 1, 2}, "[", "]\n\n", 9, "[0 1 2]\n\n", ""},
		{"over byte limit", []int{0, 1, 2}, "[", "]\n\n", 8, "", "test answer limit: 9 bytes exceeds 8"},
		{"empty", []int{}, "[", "]\n\n", 4, "[]\n\n", ""},
		{"nil", nil, "[", "]\n\n", 4, "[]\n\n", ""},
		{"empty over limit", []int{}, "[", "]\n\n", 3, "", "test answer limit: 4 bytes exceeds 3"},
		{"custom markers", []int{-1, 12}, "indices: ", "!", 15, "indices: -1 12!", ""},
		{"no markers", []int{}, "", "", 0, "", ""},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			got, err := clrsprompt.FormatIndexList(test.values, test.prefix, test.suffix, test.maximum, limit)
			if string(got) != test.want {
				t.Errorf("answer = %q, want %q", got, test.want)
			}
			if test.message == "" {
				if err != nil || got == nil {
					t.Fatalf("answer = %q, error = %v, want non-nil bytes and no error", got, err)
				}
				return
			}
			if got != nil || !errors.Is(err, limit) || err.Error() != test.message {
				t.Fatalf("answer = %q, error = %v, want nil answer and wrapped limit %q", got, err, test.message)
			}
		})
	}
}
