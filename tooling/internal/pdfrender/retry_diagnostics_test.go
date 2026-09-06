package pdfrender

import (
	"bytes"
	"context"
	"errors"
	"io"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

const testRetryWarning = `Headless Chrome returned "Printing failed"; retrying Page.printToPDF once after 1000 ms with 280000 ms left in the original print budget.`

func TestRendererRetryWarningGrammarAndBounds(t *testing.T) {
	for _, ending := range []string{"", "\n", "\r\n"} {
		got, err := rendererRetryWarning([]byte("ordinary output\n"+testRetryWarning+ending), 4096)
		if err != nil || got != testRetryWarning {
			t.Fatalf("ending=%q warning=%q error=%v", ending, got, err)
		}
	}
	for name, body := range map[string]string{
		"prefix":          "secret " + testRetryWarning,
		"suffix":          testRetryWarning + " https://user:secret@example.invalid/?token=secret",
		"ansi":            "\x1b[31m" + testRetryWarning,
		"workflow":        "::warning::" + testRetryWarning,
		"newline":         strings.Replace(testRetryWarning, "after 1000", "after\n1000", 1),
		"unicode digits":  strings.Replace(testRetryWarning, "1000", "１０００", 1),
		"zero delay":      strings.Replace(testRetryWarning, "1000", "0", 1),
		"delay bound":     strings.Replace(testRetryWarning, "1000", "10001", 1),
		"remaining bound": strings.Replace(testRetryWarning, "280000", "300001", 1),
		"no retry time":   strings.Replace(testRetryWarning, "280000", "1000", 1),
	} {
		t.Run(name, func(t *testing.T) {
			got, err := rendererRetryWarning([]byte(body), 4096)
			if err != nil || got != "" {
				t.Fatalf("hostile/unrecognised line forwarded: %q %v", got, err)
			}
		})
	}
	for _, body := range []string{testRetryWarning + "\n" + testRetryWarning, strings.Repeat("x", 4097)} {
		if got, err := rendererRetryWarning([]byte(body), 4096); err == nil || got != "" {
			t.Fatalf("exceeded warning/output bound accepted: %q %v", got, err)
		}
	}
}

func TestRendererDiagnosticPreservesOutputErrorAndArchiveAdapter(t *testing.T) {
	primary := errors.New("original renderer failure")
	for _, failure := range []error{nil, primary} {
		var diagnostic bytes.Buffer
		inner := &retryDiagnosticFixture{output: []byte(testRetryWarning + "\n"), err: failure}
		executor := &rendererDiagnosticExecutor{commandExecutor: inner, writer: &diagnostic}
		request := commandRequest{operation: "run pinned PDF renderer image", outputSize: 4096, renderSequence: 2}
		output, err := executor.run(context.Background(), request)
		if !bytes.Equal(output, inner.output) || err != failure || inner.calls != 1 || executor.diagnosticError() != nil {
			t.Fatalf("underlying result changed: %q %v calls=%d diagnostic=%v", output, err, inner.calls, executor.diagnosticError())
		}
		want := ""
		if failure == nil {
			want = "PDF renderer render-2: " + testRetryWarning + "\n"
		}
		if diagnostic.String() != want {
			t.Fatalf("wrong diagnostic channel/identity: %q", diagnostic.String())
		}
		ctx := context.WithValue(context.Background(), retryContextKey{}, "identity")
		configuration := Configuration{RepositoryRoot: "chosen-root"}
		proof, archiveErr := executor.inspectImageArchive(ctx, configuration, "image", "manifest")
		if archiveErr != failure || proof.Method != "fixture-proof" || inner.archiveCalls != 1 || inner.archiveContext != ctx || inner.archiveConfiguration.RepositoryRoot != configuration.RepositoryRoot || inner.archiveImage != "image" || inner.archiveManifest != "manifest" {
			t.Fatal("image archive adapter lost exact arguments/result")
		}
	}
	missing := &rendererDiagnosticExecutor{commandExecutor: &recordingExecutor{}}
	if _, err := missing.inspectImageArchive(context.Background(), Configuration{}, "image", "manifest"); err == nil || !strings.Contains(err.Error(), "no bounded image-config proof adapter") {
		t.Fatalf("missing archive adapter accepted: %v", err)
	}
}

func TestRendererDiagnosticWritesAreBoundedAndDeferred(t *testing.T) {
	primary, sink := errors.New("original renderer failure"), errors.New("diagnostic sink failure")
	for _, short := range []bool{false, true} {
		writer := &retryFailingWriter{err: sink, short: short}
		inner := &retryDiagnosticFixture{output: []byte(testRetryWarning)}
		executor := &rendererDiagnosticExecutor{commandExecutor: inner, writer: writer}
		request := commandRequest{operation: "run pinned PDF renderer image", outputSize: 4096, renderSequence: 1}
		for range 3 {
			if _, err := executor.run(context.Background(), request); err != nil {
				t.Fatalf("logger interrupted successful execution: %v", err)
			}
		}
		want := sink
		if short {
			want = io.ErrShortWrite
		}
		if writer.calls != 1 || !errors.Is(executor.diagnosticError(), want) || inner.calls != 3 {
			t.Fatalf("writes=%d underlying=%d deferred=%v", writer.calls, inner.calls, executor.diagnosticError())
		}
		if joined := joinRendererDiagnostics(executor, primary); !errors.Is(joined, primary) || !errors.Is(joined, want) {
			t.Fatalf("final diagnostic join lost original cause: %v", joined)
		}
	}
	for _, request := range []commandRequest{
		{operation: "build pinned PDF renderer image", outputSize: 4096},
		{operation: "run pinned PDF renderer image", outputSize: 4096, renderSequence: 3},
		{operation: "run pinned PDF renderer image", outputSize: 4096},
	} {
		var diagnostic bytes.Buffer
		executor := &rendererDiagnosticExecutor{commandExecutor: &retryDiagnosticFixture{output: []byte(testRetryWarning)}, writer: &diagnostic}
		if _, err := executor.run(context.Background(), request); err != nil || diagnostic.Len() != 0 {
			t.Fatalf("nonrender/invalid identity forwarded output: %q %v", diagnostic.String(), err)
		}
		if request.operation == "run pinned PDF renderer image" && executor.diagnosticError() == nil {
			t.Fatal("invalid render identity lost its diagnostic error")
		}
	}
}

func TestRetryDiagnosticGrammarRemainsBoundToGenerator(t *testing.T) {
	body, err := os.ReadFile(filepath.Join("../../..", "scripts/generate-book-pdf.mjs"))
	if err != nil {
		t.Fatal(err)
	}
	for _, source := range []string{
		"`Headless Chrome returned \"Printing failed\"; retrying Page.printToPDF once after `",
		"`${delayMs} ms with ${remainingMs} ms left in the original print budget.`",
	} {
		if !bytes.Contains(body, []byte(source)) {
			t.Fatalf("retry warning producer changed: %s", source)
		}
	}
}

type retryContextKey struct{}

type retryDiagnosticFixture struct {
	output                        []byte
	err                           error
	calls, archiveCalls           int
	archiveContext                context.Context
	archiveConfiguration          Configuration
	archiveImage, archiveManifest string
}

func (executor *retryDiagnosticFixture) run(_ context.Context, _ commandRequest) ([]byte, error) {
	executor.calls++
	return executor.output, executor.err
}

func (executor *retryDiagnosticFixture) inspectImageArchive(ctx context.Context, configuration Configuration, image, manifest string) (ImageConfigProof, error) {
	executor.archiveCalls++
	executor.archiveContext, executor.archiveConfiguration = ctx, configuration
	executor.archiveImage, executor.archiveManifest = image, manifest
	return ImageConfigProof{Method: "fixture-proof"}, executor.err
}

type retryFailingWriter struct {
	err   error
	short bool
	calls int
}

func (writer *retryFailingWriter) Write(body []byte) (int, error) {
	writer.calls++
	if writer.short {
		return len(body) - 1, nil
	}
	return 0, writer.err
}
