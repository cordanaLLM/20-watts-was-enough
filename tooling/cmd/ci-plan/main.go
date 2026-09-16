// Command ci-plan is the dependency-isolated workflow adapter for CI selection.
package main

import (
	"os"

	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/ciplancli"
)

func main() {
	os.Exit(ciplancli.Run(os.Args[1:], os.Stdin, os.Stdout, os.Stderr))
}
