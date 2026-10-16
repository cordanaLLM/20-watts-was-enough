package boundedexec_test

import (
	"os"
	"slices"
	"strings"
	"testing"

	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/boundedexec"
)

func TestGitEnvironment(t *testing.T) {
	t.Setenv("PATH", "/bounded/git/path")
	t.Setenv("TMPDIR", "will-be-unset")
	if err := os.Unsetenv("TMPDIR"); err != nil {
		t.Fatal(err)
	}
	environment := boundedexec.GitEnvironment()
	fixed := []string{
		"GIT_CONFIG_GLOBAL=" + os.DevNull,
		"GIT_CONFIG_NOSYSTEM=1", "GIT_OPTIONAL_LOCKS=0", "LANG=C", "LC_ALL=C",
	}
	if len(environment) < len(fixed) || !slices.Equal(environment[:len(fixed)], fixed) {
		t.Fatalf("GitEnvironment() = %q, want fixed prefix %q", environment, fixed)
	}
	if !slices.Contains(environment, "PATH=/bounded/git/path") {
		t.Fatalf("GitEnvironment() = %q, missing PATH", environment)
	}
	for _, entry := range environment {
		if strings.HasPrefix(entry, "TMPDIR=") {
			t.Fatalf("GitEnvironment() retained unset TMPDIR: %q", environment)
		}
	}
}

func TestOutputBoundaries(t *testing.T) {
	t.Parallel()
	for _, testCase := range []struct {
		name     string
		limit    int
		writes   []string
		want     string
		exceeded bool
	}{
		{name: "exact", limit: 3, writes: []string{"abc"}, want: "abc"},
		{name: "overflow", limit: 3, writes: []string{"abcd"}, want: "abc", exceeded: true},
		{name: "zero-empty", writes: []string{""}},
		{name: "zero-overflow", writes: []string{"a"}, exceeded: true},
		{name: "chunked-exact", limit: 3, writes: []string{"a", "bc", ""}, want: "abc"},
		{name: "chunked-overflow", limit: 3, writes: []string{"ab", "cd", "ef", ""}, want: "abc", exceeded: true},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			t.Parallel()
			output := boundedexec.NewOutput(testCase.limit)
			for _, body := range testCase.writes {
				if written, err := output.Write([]byte(body)); written != len(body) || err != nil {
					t.Fatalf("Write(%q) = %d, %v, want %d, nil", body, written, err, len(body))
				}
			}
			body, exceeded := output.Result()
			if string(body) != testCase.want || exceeded != testCase.exceeded {
				t.Fatalf("Result() = %q, %t, want %q, %t", body, exceeded, testCase.want, testCase.exceeded)
			}
		})
	}
}

func TestOutputResultIsCopy(t *testing.T) {
	t.Parallel()
	output := boundedexec.NewOutput(3)
	if written, err := output.Write([]byte("abc")); written != 3 || err != nil {
		t.Fatalf("Write() = %d, %v, want 3, nil", written, err)
	}
	body, _ := output.Result()
	body[0] = 'x'
	next, exceeded := output.Result()
	if string(next) != "abc" || exceeded {
		t.Fatalf("Result() after mutating copy = %q, %t, want abc, false", next, exceeded)
	}
}

func TestCancellingOutput(t *testing.T) {
	t.Parallel()
	calls := 0
	var output *boundedexec.Output
	output = boundedexec.NewCancellingOutput(3, func() {
		calls++
		body, exceeded := output.Result()
		if string(body) != "abc" || !exceeded {
			t.Errorf("Result() during cancellation = %q, %t, want abc, true", body, exceeded)
		}
	})
	for _, body := range []string{"abc", "d", "ef"} {
		if written, err := output.Write([]byte(body)); written != len(body) || err != nil {
			t.Fatalf("Write(%q) = %d, %v, want %d, nil", body, written, err, len(body))
		}
		if body == "abc" && calls != 0 {
			t.Fatal("cancel called before overflow")
		}
	}
	if calls != 1 {
		t.Fatalf("cancel calls = %d, want 1", calls)
	}
}

func TestDockerBind(t *testing.T) {
	t.Parallel()
	for _, testCase := range []struct {
		name     string
		readOnly bool
		want     string
	}{
		{name: "writable", want: "type=bind,src=/source,dst=/destination"},
		{name: "read-only", readOnly: true, want: "type=bind,src=/source,dst=/destination,readonly"},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			t.Parallel()
			if got := boundedexec.DockerBind("/source", "/destination", testCase.readOnly); got != testCase.want {
				t.Fatalf("DockerBind() = %q, want %q", got, testCase.want)
			}
		})
	}
}
