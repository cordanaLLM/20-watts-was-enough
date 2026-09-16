package main

import (
	"io"

	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/pdfrendercli"
)

func runPublicationVerifyPDFReproducibility(arguments []string, stdout, stderr io.Writer) int {
	return pdfrendercli.RunVerifyReproducibility(arguments, stdout, stderr)
}
