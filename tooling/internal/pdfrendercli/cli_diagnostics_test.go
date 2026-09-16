package pdfrendercli

import (
	"bytes"
	"context"
	"errors"
	"io"
	"strings"
	"testing"

	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/pdfrender"
)

func TestProofDiagnosticsPreserveSuccessAndFailureChannels(t *testing.T) {
	const diagnostic = "PDF renderer render 1: bounded print retry diagnostic.\n"
	for _, proof := range []string{"image-build", "render-pair"} {
		for _, outcome := range []struct {
			name string
			err  error
		}{
			{"success", nil},
			{"mismatch", errors.New("retained complete pair comparison failed")},
			{"operational failure", errors.New("renderer cleanup failed")},
		} {
			t.Run(proof+"/"+outcome.name, func(t *testing.T) {
				var stdout, stderr bytes.Buffer
				calls := 0
				code := runVerifyReproducibility([]string{"--receipt", "proof.json", "--proof", proof}, &stdout, &stderr, func(_ context.Context, got pdfrender.ReproducibilityOptions) (pdfrender.ReproducibilityReceipt, error) {
					calls++
					if got.Diagnostics != &stderr {
						t.Fatal("diagnostics do not use the caller's stderr")
					}
					if written, err := io.WriteString(got.Diagnostics, diagnostic); err != nil || written != len(diagnostic) {
						t.Fatalf("write injected diagnostic: bytes=%d error=%v", written, err)
					}
					receipt := proofReceipt()
					if outcome.name == "mismatch" {
						receipt.Status = "mismatch"
					}
					return receipt, outcome.err
				})
				wantCode, wantStderr := 0, diagnostic
				label := "PDF renderer reproducibility"
				if proof == "render-pair" {
					label = "PDF render-pair reproducibility (one image build)"
				}
				wantStdout := label + " passed for main: image-id, manifest-id, complete PDF/manifest pair pair-id; receipt proof.json.\n"
				if outcome.err != nil {
					wantCode, wantStdout = 1, ""
					wantStderr += "Verify PDF renderer reproducibility: " + outcome.err.Error() + "\n"
				}
				if calls != 1 || code != wantCode || stdout.String() != wantStdout || stderr.String() != wantStderr {
					t.Fatalf("calls=%d exit=%d stdout=%q stderr=%q", calls, code, stdout.String(), stderr.String())
				}
			})
		}
	}
}

func TestInvalidProofUsageDoesNotReachDiagnosticProducer(t *testing.T) {
	for _, arguments := range [][]string{
		nil,
		{"--receipt", "proof.json", "--proof", "invalid"},
		{"--receipt", "proof.json", "--cache-dir", "invalid"},
	} {
		var stdout, stderr bytes.Buffer
		calls := 0
		code := runVerifyReproducibility(arguments, &stdout, &stderr, func(_ context.Context, got pdfrender.ReproducibilityOptions) (pdfrender.ReproducibilityReceipt, error) {
			calls++
			if got.Diagnostics != nil {
				_, _ = io.WriteString(got.Diagnostics, "unexpected renderer diagnostic\n")
			}
			return proofReceipt(), nil
		})
		if calls != 0 || code != 2 || stdout.Len() != 0 || strings.Contains(stderr.String(), "unexpected renderer diagnostic") {
			t.Fatalf("args=%q calls=%d exit=%d stdout=%q stderr=%q", arguments, calls, code, stdout.String(), stderr.String())
		}
	}
}
