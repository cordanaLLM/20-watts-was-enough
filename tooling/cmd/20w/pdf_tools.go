package main

import (
	"context"
	"flag"
	"fmt"
	"io"
	"os"
	"os/signal"
	"syscall"

	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/pdftools"
)

func runPublicationVerifyPDFTools(arguments []string, stdout, stderr io.Writer) int {
	flags := flag.NewFlagSet("publication verify-pdf-tools", flag.ContinueOnError)
	flags.SetOutput(stderr)
	root := flags.String("root", ".", "repository root")
	if err := flags.Parse(arguments); err != nil || flags.NArg() != 0 {
		return 2
	}
	result, err := pdftools.Check(*root)
	if err != nil {
		fmt.Fprintf(stderr, "Verify PDF-tools image authority: %v\n", err)
		return 1
	}
	fmt.Fprintf(
		stdout,
		"PDF-tools authority passed: %d locked APKs, %d Poppler notices, %d declared APK bytes; lock %s.\n",
		result.Packages,
		result.Notices,
		result.RetainedBytes,
		result.LockSHA256,
	)
	return 0
}

func runPublicationReproducePDFToolsImage(arguments []string, stdout, stderr io.Writer) int {
	flags := flag.NewFlagSet("publication reproduce-pdf-tools-image", flag.ContinueOnError)
	flags.SetOutput(stderr)
	root := flags.String("root", ".", "repository root")
	receipt := flags.String("receipt", "", "new repository-relative NO_RESULT receipt or candidate mismatch receipt")
	candidateBundle := flags.String("candidate-bundle", "", "new repository-relative authoritative candidate bundle")
	finalArchive := flags.String("final-archive", "", "new repository-relative final OCI archive")
	spdx := flags.String("spdx", "", "new repository-relative canonical apko SPDX")
	sourceBundle := flags.String("source-bundle", "", "new repository-relative checksum-closed source bundle")
	if err := flags.Parse(arguments); err != nil || flags.NArg() != 0 || *receipt == "" {
		if *receipt == "" {
			fmt.Fprintln(stderr, "publication reproduce-pdf-tools-image requires --receipt <new.json>")
		}
		return 2
	}
	candidatePaths := []string{*candidateBundle, *finalArchive, *spdx, *sourceBundle}
	candidateCount := 0
	for _, path := range candidatePaths {
		if path != "" {
			candidateCount++
		}
	}
	var candidate *pdftools.CandidateOutputOptions
	if candidateCount != 0 && candidateCount != len(candidatePaths) {
		fmt.Fprintln(stderr, "publication reproduce-pdf-tools-image requires all of --candidate-bundle, --final-archive, --spdx and --source-bundle")
		return 2
	}
	if candidateCount == len(candidatePaths) {
		candidate = &pdftools.CandidateOutputOptions{
			PublicationBundlePath: *candidateBundle,
			FinalArchivePath:      *finalArchive, SPDXPath: *spdx, SourceBundlePath: *sourceBundle,
		}
	}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	result, err := pdftools.ReproduceFinalImage(ctx, pdftools.ReproductionOptions{
		RepositoryRoot: *root,
		ReceiptPath:    *receipt,
		Candidate:      candidate,
	})
	if err != nil {
		fmt.Fprintf(stderr, "Reproduce local PDF-tools final image: %v\n", err)
		return 1
	}
	if result.Candidate == nil {
		fmt.Fprintf(
			stdout,
			"Local PDF-tools construction passed under %s; final manifest %s; retained %s.\n",
			result.Authority,
			result.FinalBuilds[0].Manifest,
			*receipt,
		)
	} else {
		if result.Candidate.PublicationBundle == nil {
			fmt.Fprintln(stderr, "Reproduce local PDF-tools final image: candidate publication identity is missing")
			return 1
		}
		fmt.Fprintf(
			stdout,
			"Local PDF-tools construction passed under %s; final manifest %s. NO_RESULT candidate bundle prepared at %s (sha256:%s, %d bytes); non-authoritative convenience copies: %s, %s and %s.\n",
			result.Authority,
			result.FinalBuilds[0].Manifest,
			result.Candidate.PublicationBundle.Path,
			result.Candidate.PublicationBundle.SHA256,
			result.Candidate.PublicationBundle.Bytes,
			*finalArchive,
			*spdx,
			*sourceBundle,
		)
	}
	return 0
}

func runPublicationVerifyPDFToolsCandidateBundle(arguments []string, stdout, stderr io.Writer) int {
	flags := flag.NewFlagSet("publication verify-pdf-tools-candidate-bundle", flag.ContinueOnError)
	flags.SetOutput(stderr)
	root := flags.String("root", ".", "repository root")
	bundle := flags.String("bundle", "", "repository-relative candidate publication bundle")
	sha256 := flags.String("sha256", "", "independently recorded candidate bundle SHA-256")
	if err := flags.Parse(arguments); err != nil || flags.NArg() != 0 || *bundle == "" || *sha256 == "" {
		fmt.Fprintln(stderr, "publication verify-pdf-tools-candidate-bundle requires --bundle <candidate.tar> --sha256 <digest>")
		return 2
	}
	verification, err := pdftools.VerifyCandidatePublicationBundle(*root, *bundle, *sha256)
	if err != nil {
		fmt.Fprintf(stderr, "Verify PDF-tools candidate bundle: %v\n", err)
		return 1
	}
	fmt.Fprintf(
		stdout,
		"Verified NO_RESULT PDF-tools candidate bundle sha256:%s (%d bytes); all three members match its embedded receipt.\n",
		verification.SHA256,
		verification.Bytes,
	)
	return 0
}
