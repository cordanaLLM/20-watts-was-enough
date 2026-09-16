package experimentcli

import (
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"strings"
	"testing"

	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/clrsfixture"
)

func TestCLRSSBOMCLIUsage(t *testing.T) {
	digest := "sha256:" + strings.Repeat("a", 64)
	valid := []string{"--bundle", "bundle", "--image-manifest", digest, "--image-config", digest}
	for _, arguments := range [][]string{
		nil, {"--json"}, {"--bundle"}, {"--unknown"}, {"extra"},
		{"--bundle", "bundle", "--image-manifest", digest},
		{"--bundle", "bundle", "--image-manifest", "sha256:bad", "--image-config", digest},
		{"--bundle", "bundle", "--image-manifest", digest, "--image-config", strings.ToUpper(digest)},
		append(append([]string{}, valid...), "extra"),
		append(append([]string{}, valid...), "--root="),
		append(append([]string{}, valid...), "--json=invalid"),
	} {
		var stdout, stderr bytes.Buffer
		if code := runCommand(t, append([]string{"check-clrs-sbom-bundle"}, arguments...), &stdout, &stderr); code != 2 || stdout.Len() != 0 {
			t.Fatalf("arguments %v: code=%d stdout=%q", arguments, code, stdout.String())
		}
	}
}

func TestCLRSSBOMCLIMissingAuthorityReportsFailureJSON(t *testing.T) {
	digest := "sha256:" + strings.Repeat("a", 64)
	var stdout, stderr bytes.Buffer
	code := runCommand(t, []string{"check-clrs-sbom-bundle", "--root", t.TempDir(), "--bundle", "missing", "--image-manifest", digest, "--image-config", digest, "--json"}, &stdout, &stderr)
	if code != 1 || stderr.Len() == 0 {
		t.Fatalf("missing authority: code=%d stderr=%q", code, stderr.String())
	}
	var report clrsfixture.GeneratorSBOMReport
	if err := json.Unmarshal(stdout.Bytes(), &report); err != nil || report.Authority != "NO_RESULT" || report.Error == "" || report.State == "bundle-consistent-unadmitted" {
		t.Fatalf("failure report: %+v %v", report, err)
	}
}

func TestCLRSSBOMReportOutputContract(t *testing.T) {
	report := clrsfixture.GeneratorSBOMReport{Schema: 1, Authority: "NO_RESULT", State: "bundle-consistent-unadmitted", PackageCount: 217,
		LockedPackages: make([]clrsfixture.GeneratorSBOMPackage, 61), ExtraTopLevelPython: []clrsfixture.GeneratorSBOMPackage{{Name: "pip", Version: "26.2.1"}}}
	var stdout, stderr bytes.Buffer
	if code := writeCLRSSBOMReport(report, nil, false, &stdout, &stderr); code != 0 || stderr.Len() != 0 || !strings.Contains(stdout.String(), "217 package records, 61 locked runtime packages, 1 extra") || !strings.Contains(stdout.String(), "NO_RESULT") {
		t.Fatalf("human output: %d %q %q", code, stdout.String(), stderr.String())
	}
	stdout.Reset()
	if code := writeCLRSSBOMReport(report, nil, true, &stdout, &stderr); code != 0 || stderr.Len() != 0 || !json.Valid(stdout.Bytes()) {
		t.Fatalf("JSON output: %d %q %q", code, stdout.String(), stderr.String())
	}
	first := append([]byte(nil), stdout.Bytes()...)
	stdout.Reset()
	if code := writeCLRSSBOMReport(report, nil, true, &stdout, &stderr); code != 0 || !bytes.Equal(first, stdout.Bytes()) {
		t.Fatal("machine output is not deterministic")
	}
	stdout.Reset()
	report.State, report.Error = "incomplete", "test failure"
	if code := writeCLRSSBOMReport(report, errors.New("test failure"), true, &stdout, &stderr); code != 1 || !json.Valid(stdout.Bytes()) || !strings.Contains(stderr.String(), "test failure") {
		t.Fatal("validation failure lost machine report or error status")
	}
	stdout.Reset()
	if code := writeCLRSSBOMReport(report, errors.New("test failure"), false, &stdout, &stderr); code != 1 || stdout.Len() != 0 {
		t.Fatal("human failure emitted success output")
	}
	stderr.Reset()
	if code := writeCLRSSBOMReport(report, nil, true, sbomShortWriter{}, &stderr); code != 1 || !strings.Contains(stderr.String(), io.ErrShortWrite.Error()) {
		t.Fatal("short machine write returned success")
	}
	if code := writeCLRSSBOMReport(report, nil, false, sbomErrorWriter{}, &stderr); code != 1 {
		t.Fatal("failed human write returned success")
	}
}

type sbomShortWriter struct{}

func (sbomShortWriter) Write(body []byte) (int, error) { return len(body) - 1, nil }

type sbomErrorWriter struct{}

func (sbomErrorWriter) Write([]byte) (int, error) { return 0, errors.New("writer unavailable") }
