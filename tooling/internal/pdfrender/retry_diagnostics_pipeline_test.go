package pdfrender

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestRetryDiagnosticsSurviveProofMismatchAndSinkFailure(t *testing.T) {
	for _, pairOnly := range []bool{false, true} {
		for _, mismatch := range []bool{false, true} {
			for _, sinkFails := range []bool{false, true} {
				name := "image-build"
				if pairOnly {
					name = "render-pair"
				}
				if mismatch {
					name += "/mismatch"
				} else {
					name += "/pass"
				}
				if sinkFails {
					name += "/sink-failure"
				}
				t.Run(name, func(t *testing.T) {
					configuration := renderConfiguration(t)
					var diagnostic bytes.Buffer
					sinkError := errors.New("diagnostic sink unavailable")
					var writer io.Writer = &diagnostic
					if sinkFails {
						writer = &retryFailingWriter{err: sinkError}
					}
					inner := &retryProofExecutor{reproducibilityExecutor: &reproducibilityExecutor{
						imageIDs:                []string{testProofConfigDigest, testProofConfigDigest},
						manifestDigests:         []string{testManifestDigest, testManifestDigest},
						differentSecondManifest: mismatch,
					}}
					inner.beforeRender = func(sequence int) {
						if sequence == 2 && !sinkFails && diagnostic.String() != "PDF renderer render-1: "+testRetryWarning+"\n" {
							t.Fatalf("first warning was not delivered before render 2: %q", diagnostic.String())
						}
					}
					executor := &rendererDiagnosticExecutor{commandExecutor: inner, writer: writer}
					receiptPath := "build/evidence/retry-proof.json"
					receipt, err := verifyProofWithDependencies(context.Background(), configuration, "main", "", receiptPath, reproducibilityFixturePreparer{}, executor, pairOnly)
					if (err != nil) != (mismatch || sinkFails) || errors.Is(err, sinkError) != sinkFails {
						t.Fatalf("wrong operational result: mismatch=%t sink=%t error=%v", mismatch, sinkFails, err)
					}
					wantStatus := "pass"
					if mismatch {
						wantStatus = "mismatch"
					}
					if receipt.Status != wantStatus || receipt.ScientificResult || inner.renderCount != 2 || !executor.seen[0] || !executor.seen[1] {
						t.Fatalf("receipt/render boundary changed: status=%s renders=%d seen=%v", receipt.Status, inner.renderCount, executor.seen)
					}
					body, readErr := os.ReadFile(filepath.Join(configuration.RepositoryRoot, receiptPath))
					var retained ReproducibilityReceipt
					if readErr != nil || json.Unmarshal(body, &retained) != nil || retained.Status != wantStatus || bytes.Contains(body, []byte("Printing failed")) || bytes.Contains(body, []byte("diagnostic")) {
						t.Fatalf("diagnostics changed or prevented the proof receipt: %s %v", body, readErr)
					}
					if mismatch {
						if !strings.Contains(err.Error(), "comparison failed") || receipt.MismatchEvidence == nil || len(receipt.MismatchEvidence.Builds) != 2 {
							t.Fatal("original mismatch/evidence lost")
						}
						for _, build := range receipt.MismatchEvidence.Builds {
							for _, relative := range []string{build.PDF, build.Manifest} {
								if info, err := os.Stat(filepath.Join(configuration.RepositoryRoot, filepath.FromSlash(relative))); err != nil || info.Size() == 0 {
									t.Fatalf("lost mismatch artifact %s: %v", relative, err)
								}
							}
						}
					}
					wantBuilds := 2
					if pairOnly {
						wantBuilds = 1
					}
					if inner.buildCount != wantBuilds || len(requestsWithPrefix(inner.requests, "image", "rm", "--force")) != wantBuilds || len(requestsWithPrefix(inner.requests, "buildx", "rm")) != wantBuilds {
						t.Fatal("diagnostic delivery interrupted owned cleanup")
					}
					if !sinkFails && diagnostic.String() != "PDF renderer render-1: "+testRetryWarning+"\nPDF renderer render-2: "+testRetryWarning+"\n" {
						t.Fatalf("warning identity/order changed: %q", diagnostic.String())
					}
				})
			}
		}
	}
}

func TestRetryDiagnosticsDoNotTurnSuccessfulPublicationIntoMismatch(t *testing.T) {
	for _, short := range []bool{false, true} {
		configuration := renderConfiguration(t)
		sinkError := errors.New("sink failed")
		writer := &retryFailingWriter{err: sinkError, short: short}
		inner := &retryRenderExecutor{recordingExecutor: &recordingExecutor{imageID: testImageID}}
		executor := &rendererDiagnosticExecutor{commandExecutor: inner, writer: writer}
		result, err := renderWithDependencies(context.Background(), configuration, "main", "", noOpPreparer{}, executor)
		wantError := sinkError
		if short {
			wantError = io.ErrShortWrite
		}
		if !errors.Is(err, wantError) || result.ImageID != testImageID || writer.calls != 2 || inner.renderCount != 2 {
			t.Fatalf("publication/operational outcome: %+v %v writes=%d renders=%d", result, err, writer.calls, inner.renderCount)
		}
		pdf, pdfError := os.ReadFile(filepath.Join(configuration.RepositoryRoot, "public/downloads", bookPDFName))
		manifest, manifestError := os.ReadFile(filepath.Join(configuration.RepositoryRoot, "public/downloads", bookManifestName))
		if pdfError != nil || manifestError != nil || string(pdf) != "%PDF-test\n" || string(manifest) != "{\"render\":\"stable\"}\n" {
			t.Fatalf("successful publication was lost/changed: %q %v %q %v", pdf, pdfError, manifest, manifestError)
		}
		if len(requestsWithPrefix(inner.requests, "buildx", "rm")) != 1 {
			t.Fatal("diagnostic error interrupted builder cleanup")
		}
	}
}

type retryProofExecutor struct {
	*reproducibilityExecutor
	beforeRender func(int)
}

func (executor *retryProofExecutor) run(ctx context.Context, request commandRequest) ([]byte, error) {
	if request.operation == "run pinned PDF renderer image" && executor.beforeRender != nil {
		executor.beforeRender(request.renderSequence)
	}
	body, err := executor.reproducibilityExecutor.run(ctx, request)
	if err == nil && request.operation == "run pinned PDF renderer image" {
		return []byte(testRetryWarning + "\n"), nil
	}
	return body, err
}

type retryRenderExecutor struct{ *recordingExecutor }

func (executor *retryRenderExecutor) run(ctx context.Context, request commandRequest) ([]byte, error) {
	body, err := executor.recordingExecutor.run(ctx, request)
	if err == nil && request.operation == "run pinned PDF renderer image" {
		return []byte(testRetryWarning + "\n"), nil
	}
	return body, err
}
