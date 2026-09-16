// Command build-release cross-compiles the closed native 20w release set.
package main

import (
	"context"
	"flag"
	"fmt"
	"io"
	"os"
	"time"

	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/releasebuild"
)

const (
	defaultBuildTimeout = 5 * time.Minute
	minimumBuildTimeout = time.Second
	maximumBuildTimeout = 15 * time.Minute
)

func run(parent context.Context, arguments []string, stdout, stderr io.Writer) int {
	flags := flag.NewFlagSet("build-release", flag.ContinueOnError)
	flags.SetOutput(stderr)
	moduleRoot := flags.String("module-root", ".", "directory containing the tooling Go module")
	outputRoot := flags.String("output-root", "../build/release-inputs", "new directory for native release binaries")
	version := flags.String("version", "", "immutable vMAJOR.MINOR.PATCH release tag")
	revision := flags.String("revision", "", "lowercase 40-character source commit")
	builtAt := flags.String("built-at", "", "canonical RFC 3339 source timestamp")
	timeout := flags.Duration("timeout", defaultBuildTimeout, "total native build deadline")
	if err := flags.Parse(arguments); err != nil {
		return 2
	}
	if flags.NArg() != 0 {
		fmt.Fprintln(stderr, "build-release accepts only named arguments")
		return 2
	}
	if *timeout < minimumBuildTimeout || *timeout > maximumBuildTimeout {
		fmt.Fprintf(stderr, "build-release timeout must be between %s and %s\n", minimumBuildTimeout, maximumBuildTimeout)
		return 2
	}

	ctx, cancel := context.WithTimeout(parent, *timeout)
	defer cancel()
	artifacts, err := releasebuild.Build(ctx, releasebuild.Options{
		ModuleRoot: *moduleRoot,
		OutputRoot: *outputRoot,
		Version:    *version,
		Revision:   *revision,
		BuiltAt:    *builtAt,
	})
	if err != nil {
		fmt.Fprintf(stderr, "Build native release binaries: %v\n", err)
		return 1
	}
	for _, artifact := range artifacts {
		fmt.Fprintf(stdout, "Built and exercised %s (%s/%s).\n", artifact.Name, artifact.OS, artifact.Arch)
	}
	return 0
}

func main() {
	os.Exit(run(context.Background(), os.Args[1:], os.Stdout, os.Stderr))
}
