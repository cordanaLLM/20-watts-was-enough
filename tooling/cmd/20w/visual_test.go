package main

import (
	"bytes"
	"context"
	"errors"
	"io"
	"testing"
	"time"
)

func TestVisualCheckFlagsAndDeadline(t *testing.T) {
	for _, record := range []bool{false, true} {
		arguments := []string{"--root", "fixture"}
		if record {
			arguments = append(arguments, "--record")
		}
		called := false
		runner := func(ctx context.Context, root string, gotRecord bool, _, _ io.Writer) error {
			called = true
			if root != "fixture" || gotRecord != record {
				t.Fatalf("root=%s record=%t", root, gotRecord)
			}
			deadline, ok := ctx.Deadline()
			if !ok || time.Until(deadline) <= publicationRenderDeadline-time.Minute || time.Until(deadline) > publicationRenderDeadline {
				t.Fatal("publication render deadline not reused")
			}
			return nil
		}
		var stdout, stderr bytes.Buffer
		if code := runPublicationVisualCheckWithRunner(arguments, &stdout, &stderr, runner); code != 0 || !called {
			t.Fatalf("code=%d called=%t error=%s", code, called, &stderr)
		}
	}
}

func TestVisualCheckInvalidFlagsAndFailureCodes(t *testing.T) {
	for _, arguments := range [][]string{{"--unknown"}, {"--record=perhaps"}, {"stray"}} {
		var output bytes.Buffer
		runner := func(context.Context, string, bool, io.Writer, io.Writer) error {
			t.Fatal("runner reached for invalid flags")
			return nil
		}
		if code := runPublicationVisualCheckWithRunner(arguments, &output, &output, runner); code != 2 {
			t.Fatalf("%v code=%d", arguments, code)
		}
	}
	for _, test := range []struct {
		err  error
		code int
	}{{errors.New("capture failed"), 1}, {visualConfigurationError{errors.New("invalid plan")}, 2}} {
		var output bytes.Buffer
		runner := func(context.Context, string, bool, io.Writer, io.Writer) error { return test.err }
		if code := runPublicationVisualCheckWithRunner(nil, &output, &output, runner); code != test.code {
			t.Fatalf("error=%v code=%d", test.err, code)
		}
	}
}
