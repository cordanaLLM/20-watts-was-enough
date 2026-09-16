// Command pdf-proof is the dependency-isolated workflow adapter for PDF proof.
package main

import (
	"os"

	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/pdfrendercli"
)

func main() {
	os.Exit(pdfrendercli.RunVerifyReproducibility(os.Args[1:], os.Stdout, os.Stderr))
}
