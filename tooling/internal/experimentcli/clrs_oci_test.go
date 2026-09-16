package experimentcli

import (
	"bytes"
	"context"
	"errors"
	"io"
	"strings"
	"testing"

	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/clrsfixture"
)

func TestCLRSOCICommandArgumentsAndFailureOutput(t *testing.T) {
	base := []string{"inspect-clrs-image-archive", "--archive", "missing.tar", "--sha256", strings.Repeat("1", 64), "--bytes", "1024"}
	for _, arguments := range [][]string{{"inspect-clrs-image-archive"}, append(append([]string{}, base...), "--unknown"), append(append([]string{}, base...), "extra"),
		append(append([]string{}, base...), "--bytes=0"), append(append([]string{}, base...), "--bytes=2147483649"), append(append([]string{}, base...), "--sha256=ABC"),
		append(append([]string{}, base...), "--root="), append(append([]string{}, base...), "--json=invalid")} {
		var stdout, stderr bytes.Buffer
		if code := runCommand(t, arguments, &stdout, &stderr); code != 2 || stdout.Len() != 0 {
			t.Fatalf("arguments %v: code=%d stdout=%q stderr=%q", arguments, code, stdout.String(), stderr.String())
		}
	}
	for _, machine := range []bool{false, true} {
		arguments := append(append([]string{}, base...), "--root", t.TempDir())
		if machine {
			arguments = append(arguments, "--json")
		}
		var stdout, stderr bytes.Buffer
		if code := runCommand(t, arguments, &stdout, &stderr); code != 1 || stderr.Len() == 0 {
			t.Fatalf("invalid source returned %d: %q", code, stderr.String())
		}
		if machine && (!strings.Contains(stdout.String(), `"authority": "NO_RESULT"`) || !strings.Contains(stdout.String(), `"state": "incomplete"`)) {
			t.Fatalf("missing bounded failure report: %q", stdout.String())
		}
		if !machine && stdout.Len() != 0 {
			t.Fatal("human failure wrote success output")
		}
	}
	var usage bytes.Buffer
	Usage(&usage)
	if strings.Count(usage.String(), "inspect-clrs-image-archive") != 1 {
		t.Fatal("OCI command help is missing or duplicated")
	}
}

func TestCLRSOCIOutputWritesAndFinalCancellation(t *testing.T) {
	report := clrsfixture.GeneratorOCIReport{Schema: 1, Authority: "NO_RESULT", State: "archive-consistent-unadmitted", ArchiveSHA256: strings.Repeat("1", 64), ArchiveBytes: 1024}
	for _, machine := range []bool{false, true} {
		var stdout, stderr bytes.Buffer
		if code := writeCLRSOCIReport(context.Background(), report, nil, machine, &stdout, &stderr); code != 0 || stdout.Len() == 0 || stderr.Len() != 0 {
			t.Fatalf("success output: code=%d stderr=%q", code, stderr.String())
		}
		for _, writer := range []io.Writer{clrsInvocationShortWriter{}, clrsInvocationErrorWriter{}} {
			if code := writeCLRSOCIReport(context.Background(), report, nil, machine, writer, &stderr); code != 1 {
				t.Fatalf("write failure returned %d", code)
			}
		}
		ctx, cancel := context.WithCancel(context.Background())
		if code := writeCLRSOCIReport(ctx, report, nil, machine, clrsOCICancelWriter{cancel}, &stderr); code != 1 {
			t.Fatal("cancellation during output returned success")
		}
		stdout.Reset()
		if code := writeCLRSOCIReport(ctx, report, nil, machine, &stdout, &stderr); code != 1 || stdout.Len() != 0 {
			t.Fatal("pre-output cancellation emitted success data")
		}
	}
	var stdout, stderr bytes.Buffer
	if code := writeCLRSOCIReport(context.Background(), report, errors.New("test failure"), false, &stdout, &stderr); code != 1 || stdout.Len() != 0 {
		t.Fatal("validation error returned success")
	}
}

type clrsOCICancelWriter struct{ cancel context.CancelFunc }

func (writer clrsOCICancelWriter) Write(body []byte) (int, error) {
	writer.cancel()
	return len(body), nil
}
