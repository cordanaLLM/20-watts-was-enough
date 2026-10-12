package main

import (
	"context"
	"flag"
	"fmt"
	"io"
	"os"
	"os/signal"
	"syscall"

	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/vulnscan"
)

// runSecurityGovulncheck scans the tooling module with the pinned govulncheck
// after the scanner has reported the planted advisory.
func runSecurityGovulncheck(arguments []string, stdout, stderr io.Writer) int {
	flags := flag.NewFlagSet("security govulncheck", flag.ContinueOnError)
	flags.SetOutput(stderr)
	root := flags.String("root", ".", "repository root")
	if err := flags.Parse(arguments); err != nil {
		return 2
	}
	if flags.NArg() != 0 {
		fmt.Fprintln(stderr, "security govulncheck accepts only --root <repository>")
		return 2
	}
	// One deadline for the planted scan and one for the tooling scan.
	ctx, cancel := context.WithTimeout(context.Background(), 2*vulnscan.ScanDeadline)
	defer cancel()
	ctx, stop := signal.NotifyContext(ctx, os.Interrupt, syscall.SIGTERM)
	defer stop()
	if err := vulnscan.Run(ctx, *root, vulnscan.ExecRunner, stdout); err != nil {
		fmt.Fprintf(stderr, "Vulnerability scan failed: %v\n", err)
		return 1
	}
	return 0
}
