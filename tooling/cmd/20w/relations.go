package main

import (
	"flag"
	"fmt"
	"io"

	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/engineeringrelations"
)

// runValidateRelations checks the engineering-relation registry offline.
func runValidateRelations(arguments []string, stdout, stderr io.Writer) int {
	flags := flag.NewFlagSet("validate relations", flag.ContinueOnError)
	flags.SetOutput(stderr)
	root := flags.String("root", ".", "repository root")
	if err := flags.Parse(arguments); err != nil {
		return 2
	}
	if flags.NArg() != 0 {
		fmt.Fprintln(stderr, "validate relations accepts only --root <repository>")
		return 2
	}
	result := engineeringrelations.Validate(*root)
	if len(result.Errors) != 0 {
		fmt.Fprintf(stderr, "Engineering relation validation failed with %d error(s):\n", len(result.Errors))
		for _, message := range result.Errors {
			fmt.Fprintf(stderr, "- %s\n", message)
		}
		return 1
	}
	fmt.Fprintf(
		stdout,
		"Engineering relation validation passed: %d relations, result authority %s.\n",
		result.Relations,
		engineeringrelations.ResultAuthority,
	)
	return 0
}
