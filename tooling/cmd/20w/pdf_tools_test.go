package main

import (
	"bytes"
	"path/filepath"
	"strings"
	"testing"
)

func TestRunPublicationVerifyPDFToolsIsOfflineAndReportsClosure(t *testing.T) {
	t.Parallel()
	var stdout bytes.Buffer
	var stderr bytes.Buffer
	root := filepath.Clean(filepath.Join("..", "..", ".."))
	exit := run([]string{"publication", "verify-pdf-tools", "--root", root}, &stdout, &stderr)
	if exit != 0 || !strings.Contains(stdout.String(), "45 locked APKs") ||
		!strings.Contains(stdout.String(), "5 Poppler notices") ||
		!strings.Contains(stdout.String(), "33667496 declared APK bytes") {
		t.Fatalf("run() exit/stdout/stderr = %d/%q/%q", exit, stdout.String(), stderr.String())
	}
}

func TestRunPublicationVerifyPDFToolsRejectsUnexpectedArguments(t *testing.T) {
	t.Parallel()
	var stdout bytes.Buffer
	var stderr bytes.Buffer
	if exit := run([]string{"publication", "verify-pdf-tools", "unexpected"}, &stdout, &stderr); exit != 2 {
		t.Fatalf("run() exit = %d, want 2", exit)
	}
}

func TestRunPublicationReproducePDFToolsImageRequiresNewReceipt(t *testing.T) {
	t.Parallel()
	var stdout bytes.Buffer
	var stderr bytes.Buffer
	exit := run([]string{"publication", "reproduce-pdf-tools-image"}, &stdout, &stderr)
	if exit != 2 || !strings.Contains(stderr.String(), "requires --receipt") {
		t.Fatalf("run() exit/stdout/stderr = %d/%q/%q", exit, stdout.String(), stderr.String())
	}
}

func TestRunPublicationReproducePDFToolsImageRequiresCompleteCandidatePaths(t *testing.T) {
	t.Parallel()
	var stdout bytes.Buffer
	var stderr bytes.Buffer
	exit := run([]string{
		"publication", "reproduce-pdf-tools-image",
		"--receipt", "build/evidence/receipt.json",
		"--final-archive", "build/release-inputs/final.tar",
	}, &stdout, &stderr)
	if exit != 2 || !strings.Contains(stderr.String(), "requires all of --candidate-bundle") {
		t.Fatalf("run() exit/stdout/stderr = %d/%q/%q", exit, stdout.String(), stderr.String())
	}
}

func TestRunPublicationVerifyPDFToolsCandidateBundleRequiresIndependentIdentity(t *testing.T) {
	t.Parallel()
	var stdout bytes.Buffer
	var stderr bytes.Buffer
	exit := run([]string{
		"publication", "verify-pdf-tools-candidate-bundle",
		"--bundle", "build/release-inputs/candidate.tar",
	}, &stdout, &stderr)
	if exit != 2 || !strings.Contains(stderr.String(), "requires --bundle") ||
		!strings.Contains(stderr.String(), "--sha256") {
		t.Fatalf("run() exit/stdout/stderr = %d/%q/%q", exit, stdout.String(), stderr.String())
	}
}

func TestRunPublicationVerifyPDFToolsCandidateBundleRejectsMalformedSHA256(t *testing.T) {
	t.Parallel()
	var stdout bytes.Buffer
	var stderr bytes.Buffer
	exit := run([]string{
		"publication", "verify-pdf-tools-candidate-bundle",
		"--bundle", "build/release-inputs/candidate.tar",
		"--sha256", "not-a-valid-sha256",
	}, &stdout, &stderr)
	if exit != 1 || !strings.Contains(stderr.String(), "candidate publication bundle requires an exact SHA-256 identity") {
		t.Fatalf("run() exit/stdout/stderr = %d/%q/%q", exit, stdout.String(), stderr.String())
	}
}

func TestRunPublicationVerifyPDFToolsCandidateBundleRejectsDisallowedBundleLocation(t *testing.T) {
	t.Parallel()
	root := filepath.Clean(filepath.Join("..", "..", ".."))
	var stdout bytes.Buffer
	var stderr bytes.Buffer
	exit := run([]string{
		"publication", "verify-pdf-tools-candidate-bundle",
		"--root", root,
		"--bundle", "concept/candidate.tar",
		"--sha256", strings.Repeat("a", 64),
	}, &stdout, &stderr)
	if exit != 1 || !strings.Contains(stderr.String(), "PDF-tools candidate publication bundle must be a safe repository-relative .tar path under publication or release evidence") {
		t.Fatalf("run() exit/stdout/stderr = %d/%q/%q", exit, stdout.String(), stderr.String())
	}
}

func TestRunPublicationVerifyPDFToolsCandidateBundleBoundaryDigestLength(t *testing.T) {
	t.Parallel()
	for _, sha := range []string{strings.Repeat("a", 63), strings.Repeat("a", 65)} {
		var stdout bytes.Buffer
		var stderr bytes.Buffer
		exit := run([]string{
			"publication", "verify-pdf-tools-candidate-bundle",
			"--bundle", "build/release-inputs/candidate.tar",
			"--sha256", sha,
		}, &stdout, &stderr)
		if exit != 1 || !strings.Contains(stderr.String(), "candidate publication bundle requires an exact SHA-256 identity") {
			t.Fatalf("run() exit/stdout/stderr = %d/%q/%q", exit, stdout.String(), stderr.String())
		}
	}
}
