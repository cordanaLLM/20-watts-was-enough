package relpath_test

import (
	"testing"

	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/relpath"
)

func TestValid(t *testing.T) {
	t.Parallel()
	for _, testCase := range []struct {
		name  string
		value string
		want  bool
	}{
		{name: "relative", value: "a/b", want: true},
		{name: "empty"},
		{name: "absolute", value: "/a"},
		{name: "backslash", value: "a\\b"},
		{name: "dot", value: "."},
		{name: "parent", value: "../a"},
		{name: "embedded-parent", value: "a/../b"},
		{name: "double-slash", value: "a//b"},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			t.Parallel()
			if got := relpath.Valid(testCase.value); got != testCase.want {
				t.Fatalf("Valid(%q) = %t, want %t", testCase.value, got, testCase.want)
			}
		})
	}
}
