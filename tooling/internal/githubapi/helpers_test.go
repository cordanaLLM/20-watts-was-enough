package githubapi

import (
	"errors"
	"fmt"
	"reflect"
	"strings"
	"testing"
	"testing/iotest"
)

func TestNormalizedLabels(t *testing.T) {
	t.Parallel()
	cases := []struct {
		name   string
		labels []Label
		want   []string
	}{
		{name: "lowercase and sort", labels: []Label{{Name: "Zebra"}, {Name: "APPLE"}}, want: []string{"apple", "zebra"}},
		{name: "empty input", want: []string{}},
		{name: "256 bytes", labels: []Label{{Name: strings.Repeat("A", 256)}}, want: []string{strings.Repeat("a", 256)}},
		{name: "256 UTF-8 bytes", labels: []Label{{Name: strings.Repeat("É", 128)}}, want: []string{strings.Repeat("é", 128)}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, err := NormalizedLabels(tc.labels)
			if err != nil || !reflect.DeepEqual(got, tc.want) {
				t.Fatalf("NormalizedLabels() = %v, %v; want %v, nil", got, err, tc.want)
			}
		})
	}
}

func TestNormalizedLabelsRejectsInvalidNames(t *testing.T) {
	t.Parallel()
	cases := []struct {
		name   string
		labels []Label
		want   string
	}{
		{name: "empty name", labels: []Label{{Name: ""}}, want: `label "" is invalid`},
		{name: "257 bytes", labels: []Label{{Name: strings.Repeat("a", 257)}}, want: fmt.Sprintf("label %q is invalid", strings.Repeat("a", 257))},
		{name: "258 UTF-8 bytes", labels: []Label{{Name: strings.Repeat("é", 129)}}, want: fmt.Sprintf("label %q is invalid", strings.Repeat("é", 129))},
		{name: "leading space", labels: []Label{{Name: " bug"}}, want: `label " bug" is invalid`},
		{name: "trailing space", labels: []Label{{Name: "bug "}}, want: `label "bug " is invalid`},
		{name: "NUL", labels: []Label{{Name: "b\x00ug"}}, want: `label "b\x00ug" is invalid`},
		{name: "case folded repeat", labels: []Label{{Name: "Bug"}, {Name: "BUG"}}, want: `label "BUG" is repeated`},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, err := NormalizedLabels(tc.labels)
			if err == nil || err.Error() != tc.want || got != nil {
				t.Fatalf("NormalizedLabels() = %v, %v; want nil, %q", got, err, tc.want)
			}
		})
	}
}

func TestDrainBounded(t *testing.T) {
	t.Parallel()
	const message = "response exceeds test limit"
	cases := []struct {
		name  string
		body  string
		limit int64
		want  string
		left  int
	}{
		{name: "below limit", body: "ab", limit: 3},
		{name: "at limit", body: "abc", limit: 3},
		{name: "limit plus one", body: "abcd", limit: 3, want: message},
		{name: "bounded read", body: "abcdef", limit: 3, want: message, left: 2},
		{name: "zero limit empty", limit: 0},
		{name: "zero limit exceeded", body: "a", limit: 0, want: message},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			reader := strings.NewReader(tc.body)
			err := DrainBounded(reader, tc.limit, message)
			if tc.want == "" {
				if err != nil {
					t.Fatalf("DrainBounded() = %v, want nil", err)
				}
			} else if err == nil || err.Error() != tc.want {
				t.Fatalf("DrainBounded() = %v, want %q", err, tc.want)
			}
			if reader.Len() != tc.left {
				t.Fatalf("remaining bytes = %d, want %d", reader.Len(), tc.left)
			}
		})
	}
}

func TestDrainBoundedReturnsReaderError(t *testing.T) {
	t.Parallel()
	want := errors.New("reader failed")
	if got := DrainBounded(iotest.ErrReader(want), 3, "too large"); got != want {
		t.Fatalf("DrainBounded() = %v, want original error %v", got, want)
	}
}

func TestFoldedSet(t *testing.T) {
	t.Parallel()
	cases := []struct {
		name   string
		values []string
		want   map[string]struct{}
	}{
		{name: "case folding", values: []string{"Bug", "BUG", "ÉTÉ"}, want: map[string]struct{}{"bug": {}, "été": {}}},
		{name: "nil input", want: map[string]struct{}{}},
		{name: "empty input", values: []string{}, want: map[string]struct{}{}},
		{name: "empty value", values: []string{""}, want: map[string]struct{}{"": {}}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := FoldedSet(tc.values); !reflect.DeepEqual(got, tc.want) {
				t.Fatalf("FoldedSet() = %v, want %v", got, tc.want)
			}
		})
	}
}

func TestEscapedPath(t *testing.T) {
	t.Parallel()
	cases := []struct {
		name string
		path string
		want string
	}{
		{name: "segments escaped", path: "/a b/c?d/x#y/%", want: "/a%20b/c%3Fd/x%23y/%25"},
		{name: "slash preserved", path: "/", want: "/"},
		{name: "empty segments", path: "a//b/", want: "a//b/"},
		{name: "empty path", path: "", want: ""},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := EscapedPath(tc.path); got != tc.want {
				t.Fatalf("EscapedPath(%q) = %q, want %q", tc.path, got, tc.want)
			}
		})
	}
}
