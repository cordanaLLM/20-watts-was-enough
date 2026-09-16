package experimentcli

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"io"
	"path/filepath"
	"reflect"
	"testing"

	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/clrsfixture"
)

func TestCLRSInvocationCLIUsageAndAuthorityFailures(t *testing.T) {
	for _, arguments := range [][]string{{"--unknown"}, {"extra"}, {"--root"}, {"--root="}, {"--json=invalid"}} {
		var stdout, stderr bytes.Buffer
		if code := runCommand(t, append([]string{"render-clrs-generation-program"}, arguments...), &stdout, &stderr); code != 2 || stdout.Len() != 0 {
			t.Fatalf("arguments %v: status %d output %q", arguments, code, stdout.String())
		}
	}
	for _, machine := range []bool{false, true} {
		arguments := []string{"render-clrs-generation-program", "--root", t.TempDir()}
		if machine {
			arguments = append(arguments, "--json")
		}
		var stdout, stderr bytes.Buffer
		if code := runCommand(t, arguments, &stdout, &stderr); code != 1 || stdout.Len() != 0 || stderr.Len() == 0 {
			t.Fatalf("invalid authority: status %d output %q error %q", code, stdout.String(), stderr.String())
		}
	}
}

func TestCLRSInvocationCLIExactProgramAndMetadata(t *testing.T) {
	root, err := filepath.Abs("../../..")
	if err != nil {
		t.Fatal(err)
	}
	want, err := clrsfixture.PrepareGeneratorInvocation(context.Background(), root)
	if err != nil {
		t.Fatal(err)
	}
	arguments := []string{"render-clrs-generation-program", "--root", root}
	var stdout, stderr bytes.Buffer
	if code := runCommand(t, arguments, &stdout, &stderr); code != 0 || stdout.String() != want.Program || stderr.Len() != 0 {
		t.Fatalf("program: status %d error %q", code, stderr.String())
	}
	stdout.Reset()
	if code := runCommand(t, append(arguments, "--json"), &stdout, &stderr); code != 0 || stderr.Len() != 0 {
		t.Fatalf("metadata: status %d error %q", code, stderr.String())
	}
	var report clrsInvocationReport
	if err := json.Unmarshal(stdout.Bytes(), &report); err != nil {
		t.Fatal(err)
	}
	hash := sha256.Sum256([]byte(want.Program))
	if report.SchemaVersion != 1 || report.Authority != "NO_RESULT" || report.State != "prepared-unexecuted" || report.SourceID != want.SourceID.String() || report.ContractID != want.ContractID.String() || report.ProgramSHA256 != hex.EncodeToString(hash[:]) || report.PythonExecutable != want.PythonExecutable || !reflect.DeepEqual(report.PythonArguments, want.PythonArguments()) || report.OutputDirectory != want.OutputDirectory || !reflect.DeepEqual(report.ExpectedPaths, want.ExpectedPaths) || report.ExpectedExamples != 48 {
		t.Fatal("CLI metadata differs from the prepared invocation")
	}
	first := append([]byte(nil), stdout.Bytes()...)
	stdout.Reset()
	if code := runCommand(t, append(arguments, "--json"), &stdout, &stderr); code != 0 || !bytes.Equal(stdout.Bytes(), first) {
		t.Fatal("identical authority did not yield identical output")
	}
	for _, writer := range []io.Writer{clrsInvocationErrorWriter{}, clrsInvocationShortWriter{}} {
		if code := runCommand(t, arguments, writer, &stderr); code != 1 {
			t.Fatalf("output failure returned %d", code)
		}
	}
}

type clrsInvocationErrorWriter struct{}

func (clrsInvocationErrorWriter) Write([]byte) (int, error) { return 0, io.ErrClosedPipe }

type clrsInvocationShortWriter struct{}

func (clrsInvocationShortWriter) Write(body []byte) (int, error) { return len(body) - 1, nil }
