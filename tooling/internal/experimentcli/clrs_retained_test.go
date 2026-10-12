package experimentcli

import (
	"bytes"
	"testing"
)

func TestFetchRetainedInputsCLIUsage(t *testing.T) {
	for _, arguments := range [][]string{{}, {"--root", "."}, {"--output", "x", "positional"}, {"--unknown"}} {
		var stdout, stderr bytes.Buffer
		full := append([]string{"fetch-clrs-retained-inputs"}, arguments...)
		if code := runCommand(t, full, &stdout, &stderr); code != 2 || stdout.Len() != 0 {
			t.Fatalf("%v: code=%d stdout=%s stderr=%s", arguments, code, &stdout, &stderr)
		}
	}
}

func TestFetchRetainedInputsRefusesInvalidRootBeforeDownload(t *testing.T) {
	var stdout, stderr bytes.Buffer
	code := runCommand(t, []string{"fetch-clrs-retained-inputs", "--root", t.TempDir(), "--output", t.TempDir() + "/inputs"}, &stdout, &stderr)
	if code != 1 || stdout.Len() != 0 {
		t.Fatalf("code=%d stdout=%s stderr=%s", code, &stdout, &stderr)
	}
}
