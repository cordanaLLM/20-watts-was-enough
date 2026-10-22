// Package pdfrendercli shares the renderer reproducibility command-line protocol.
package pdfrendercli

import (
	"context"
	"flag"
	"fmt"
	"io"
	"time"

	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/pdfrender"
	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/pdfrenderlock"
)

// verifyReproducibilityDeadline covers the two builds and two renders that
// pdfrender bounds itself, using the largest limits a lock may declare, plus
// dependency binding and lock acquisition before that inner bound starts.
const verifyReproducibilityDeadline = 2*time.Duration(pdfrenderlock.MaximumBuildSeconds+pdfrenderlock.MaximumRenderSeconds)*time.Second + 10*time.Minute

// RunVerifyReproducibility retains the public proof flags and uses the existing
// pdfrender verifier. It does not implement another renderer acceptance path.
func RunVerifyReproducibility(arguments []string, stdout, stderr io.Writer) int {
	return runVerifyReproducibility(arguments, stdout, stderr, pdfrender.VerifyReproducibility)
}

func runVerifyReproducibility(arguments []string, stdout, stderr io.Writer, verify func(context.Context, pdfrender.ReproducibilityOptions) (pdfrender.ReproducibilityReceipt, error)) int {
	flags := flag.NewFlagSet("publication verify-pdf-reproducibility", flag.ContinueOnError)
	flags.SetOutput(stderr)
	root := flags.String("root", ".", "repository root")
	sourceRef := flags.String("ref", "main", "book source ref")
	sourceRevision := flags.String("revision", "", "exact lowercase 40-character book source commit")
	receiptPath := flags.String("receipt", "", "new repository-relative JSON receipt path")
	proof := flags.String("proof", "image-build", "image-build (two builds) or render-pair (one build, two renders; main only)")
	cacheDirectory := flags.String("cache-dir", "", "optional build/cache/pdf-renderer cache directory (main only)")
	if err := flags.Parse(arguments); err != nil {
		return 2
	}
	if flags.NArg() != 0 {
		fmt.Fprintf(stderr, "publication verify-pdf-reproducibility accepts no positional arguments: %s\n", flags.Arg(0))
		return 2
	}
	if *receiptPath == "" {
		fmt.Fprintln(stderr, "publication verify-pdf-reproducibility requires --receipt")
		return 2
	}
	if code := validateProofConfiguration(stderr, *sourceRef, *sourceRevision, *proof, *cacheDirectory); code != 0 {
		return code
	}
	ctx, cancel := context.WithTimeout(context.Background(), verifyReproducibilityDeadline)
	defer cancel()
	receipt, err := verify(ctx, pdfrender.ReproducibilityOptions{
		RepositoryRoot: *root,
		SourceRef:      *sourceRef,
		SourceRevision: *sourceRevision,
		ReceiptPath:    *receiptPath,
		RenderPairOnly: *proof == "render-pair",
		CacheDirectory: *cacheDirectory,
		Diagnostics:    stderr,
	})
	if err != nil {
		fmt.Fprintf(stderr, "Verify PDF renderer reproducibility: %v\n", err)
		return 1
	}
	return writeProofResult(stdout, stderr, *sourceRef, *proof, *receiptPath, receipt)
}

func validateProofConfiguration(stderr io.Writer, sourceRef, sourceRevision, proof, cacheDirectory string) int {
	if (proof != "image-build" && proof != "render-pair") || (proof == "render-pair" && sourceRef != "main") {
		fmt.Fprintln(stderr, "publication verify-pdf-reproducibility: proof must be image-build, or render-pair with --ref main")
		return 2
	}
	if cacheDirectory != "" && (cacheDirectory != pdfrender.RendererCacheDirectory || sourceRef != "main") {
		fmt.Fprintln(stderr, "publication verify-pdf-reproducibility: cache-dir must be empty, or build/cache/pdf-renderer with --ref main")
		return 2
	}
	if err := pdfrender.ValidateSourceRevision(sourceRef, sourceRevision); err != nil {
		fmt.Fprintf(stderr, "publication verify-pdf-reproducibility: %v\n", err)
		return 2
	}
	return 0
}

func writeProofResult(stdout, stderr io.Writer, sourceRef, proof, receiptPath string, receipt pdfrender.ReproducibilityReceipt) int {
	label := "PDF renderer reproducibility"
	if proof == "render-pair" {
		label = "PDF render-pair reproducibility (one image build)"
	}
	body := fmt.Sprintf(
		"%s passed for %s: %s, %s, complete PDF/manifest pair %s; receipt %s.\n",
		label,
		sourceRef,
		receipt.Builds[0].ImageID,
		receipt.Builds[0].ManifestDigest,
		receipt.Builds[0].Pair.PairSHA256,
		receiptPath,
	)
	written, err := io.WriteString(stdout, body)
	if err == nil && written != len(body) {
		err = io.ErrShortWrite
	}
	if err != nil {
		fmt.Fprintf(stderr, "Write PDF renderer reproducibility result: %v\n", err)
		return 1
	}
	return 0
}
