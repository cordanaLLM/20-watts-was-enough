package main

import (
	"context"
	"flag"
	"fmt"
	"io"
	"time"

	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/publictransport"
)

func runPublicationVerifyPublicTransport(arguments []string, stdout, stderr io.Writer) int {
	flags := flag.NewFlagSet("publication verify-public-transport", flag.ContinueOnError)
	flags.SetOutput(stderr)
	root := flags.String("root", ".", "repository root")
	check := flags.Bool("check", false, "validate the manifest without network access")
	if err := flags.Parse(arguments); err != nil || flags.NArg() != 0 {
		return 2
	}
	if *check {
		manifest, err := publictransport.Load(*root)
		if err != nil {
			fmt.Fprintf(stderr, "Validate public-transport manifest: %v\n", err)
			return 1
		}
		fmt.Fprintf(
			stdout,
			"Public-transport manifest passed: %s redirects to %s; timeout %ds.\n",
			manifest.HTTPURL,
			manifest.HTTPSURL,
			manifest.TimeoutSeconds,
		)
		return 0
	}
	result, err := publictransport.Verify(context.Background(), *root, publictransport.Dependencies{})
	if err != nil {
		fmt.Fprintf(stderr, "Verify public transport: %v\n", err)
		return 1
	}
	remainingDays := int(result.CertificateRemaining.Hours() / 24)
	fmt.Fprintf(
		stdout,
		"Public transport verified: HTTP %d Location=%q; HTTPS %d Server=%q; certificate NotAfter=%s (%d whole days remaining).\n",
		result.HTTPStatus,
		result.RedirectLocation,
		result.HTTPSStatus,
		result.Server,
		result.CertificateNotAfter.UTC().Format(time.RFC3339),
		remainingDays,
	)
	return 0
}
