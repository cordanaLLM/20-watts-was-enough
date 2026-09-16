package main

import (
	"bytes"
	"strings"
	"testing"

	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/experimentcli"
)

func TestRunExperimentUsesOneHelpFragmentAndPublicUnknownFallback(t *testing.T) {
	var help, helpErrors, fragment bytes.Buffer
	if code := run([]string{"--help"}, &help, &helpErrors); code != 0 || helpErrors.Len() != 0 {
		t.Fatalf("public help: exit=%d stderr=%q", code, helpErrors.String())
	}
	experimentcli.Usage(&fragment)
	if fragment.Len() == 0 || strings.Count(help.String(), fragment.String()) != 1 {
		t.Fatal("public help does not contain exactly one experiment fragment")
	}
	for _, args := range [][]string{{"experiment"}, {"experiment", "unknown"}, {"experiment", "--help"}} {
		var stdout, stderr bytes.Buffer
		if code := run(args, &stdout, &stderr); code != 2 || stdout.Len() != 0 || stderr.String() != "Unknown 20w command: experiment\n"+help.String() {
			t.Fatalf("args=%q exit=%d stdout=%q stderr=%q", args, code, stdout.String(), stderr.String())
		}
	}
}
