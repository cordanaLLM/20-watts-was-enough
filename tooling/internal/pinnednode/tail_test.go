package pinnednode

import (
	"sync"
	"testing"
)

func TestOutputTailBoundaries(t *testing.T) {
	t.Parallel()
	for _, testCase := range []struct {
		name   string
		limit  int
		writes []string
		want   string
	}{
		{name: "under", limit: 3, writes: []string{"ab"}, want: "ab"},
		{name: "exact", limit: 3, writes: []string{"abc"}, want: "abc"},
		{name: "one-over", limit: 3, writes: []string{"abcd"}, want: "bcd"},
		{name: "zero", writes: []string{"abc"}},
		{name: "negative", limit: -1, writes: []string{"abc"}},
		{name: "empty-write", limit: 3, writes: []string{"ab", ""}, want: "ab"},
		{name: "chunked-exact", limit: 3, writes: []string{"a", "bc"}, want: "abc"},
		{name: "chunked-one-over", limit: 3, writes: []string{"ab", "cd"}, want: "bcd"},
		{name: "chunked-rolls", limit: 3, writes: []string{"ab", "cd", "e"}, want: "cde"},
		{name: "long-after-short", limit: 3, writes: []string{"a", "bcdefg"}, want: "efg"},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			t.Parallel()
			tail := newOutputTail(testCase.limit)
			for _, body := range testCase.writes {
				if written, err := tail.Write([]byte(body)); written != len(body) || err != nil {
					t.Fatalf("Write(%q) = %d, %v, want %d, nil", body, written, err, len(body))
				}
			}
			if got := tail.Bytes(); string(got) != testCase.want {
				t.Fatalf("Bytes() = %q, want %q", got, testCase.want)
			}
		})
	}
}

func TestOutputTailBytesIsCopy(t *testing.T) {
	t.Parallel()
	tail := newOutputTail(3)
	if written, err := tail.Write([]byte("abc")); written != 3 || err != nil {
		t.Fatalf("Write() = %d, %v, want 3, nil", written, err)
	}
	tail.Bytes()[0] = 'x'
	if got := tail.Bytes(); string(got) != "abc" {
		t.Fatalf("Bytes() after mutating copy = %q, want abc", got)
	}
}

// Stdout and stderr copy goroutines may write concurrently; run with -race.
func TestOutputTailConcurrentWrites(t *testing.T) {
	t.Parallel()
	const writers, writes = 8, 100
	tail := newOutputTail(16)
	var group sync.WaitGroup
	for range writers {
		group.Go(func() {
			for range writes {
				if _, err := tail.Write([]byte("abcd")); err != nil {
					t.Error(err)
				}
			}
		})
	}
	group.Wait()
	if got := tail.Bytes(); string(got) != "abcdabcdabcdabcd" {
		t.Fatalf("Bytes() = %q, want four whole writes", got)
	}
}
