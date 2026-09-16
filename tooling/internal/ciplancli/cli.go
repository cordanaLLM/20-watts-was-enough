// Package ciplancli shares the CI plan and projection command-line protocol.
package ciplancli

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"strings"

	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/ciplan"
)

// Run dispatches only the private plan and project commands.
func Run(arguments []string, stdin io.Reader, stdout, stderr io.Writer) int {
	if len(arguments) > 0 {
		switch arguments[0] {
		case "plan":
			return RunPlan(arguments[1:], stdout, stderr)
		case "project":
			return RunProject(arguments[1:], stdin, stdout, stderr)
		}
	}
	fmt.Fprintln(stderr, "Usage: ci-plan plan [options] | ci-plan project")
	return 2
}

// RunProject writes only the fixed outputs of an already validated CI plan.
func RunProject(arguments []string, stdin io.Reader, stdout, stderr io.Writer) int {
	if len(arguments) != 0 {
		fmt.Fprintln(stderr, "ci project accepts a plan on standard input and no arguments")
		return 2
	}
	projection, err := ciplan.ReadProjection(stdin)
	if err != nil {
		fmt.Fprintf(stderr, "Project bounded CI plan: %v\n", err)
		return 1
	}
	if err := ciplan.WriteGitHubOutputs(completeWriter{stdout}, projection); err != nil {
		fmt.Fprintf(stderr, "Write bounded CI outputs: %v\n", err)
		return 1
	}
	return 0
}

// RunPlan retains the public CI planning flags and delegates to ciplan.Build.
func RunPlan(arguments []string, stdout, stderr io.Writer) int {
	return runPlan(arguments, stdout, stderr, ciplan.Build)
}

func runPlan(arguments []string, stdout, stderr io.Writer, build func(context.Context, ciplan.Options) (ciplan.Plan, error)) int {
	flags := flag.NewFlagSet("ci plan", flag.ContinueOnError)
	flags.SetOutput(stderr)
	root := flags.String("root", ".", "repository root")
	baseRevision := flags.String("base", "", "exact 40-character base commit")
	headRevision := flags.String("head", "", "exact 40-character head commit")
	forceFull := flags.Bool("full", false, "select the complete repository gate")
	jsonOutput := flags.Bool("json", false, "write one stable JSON plan")
	if err := flags.Parse(arguments); err != nil || flags.NArg() != 0 {
		return 2
	}
	if (*baseRevision == "") != (*headRevision == "") {
		fmt.Fprintln(stderr, "ci plan requires --base and --head together")
		return 2
	}
	plan, err := build(context.Background(), ciplan.Options{
		RepositoryRoot: *root,
		BaseRevision:   *baseRevision,
		HeadRevision:   *headRevision,
		ForceFull:      *forceFull,
	})
	if err != nil {
		fmt.Fprintf(stderr, "Build bounded CI plan: %v\n", err)
		return 1
	}
	writer := completeWriter{stdout}
	if *jsonOutput {
		if err := json.NewEncoder(writer).Encode(plan); err != nil {
			fmt.Fprintf(stderr, "Write CI plan: %v\n", err)
			return 1
		}
		return 0
	}
	if _, err := fmt.Fprintf(writer, "CI plan: %s (%s)\n", plan.Mode, plan.Reason); err != nil {
		fmt.Fprintf(stderr, "Write CI plan: %v\n", err)
		return 1
	}
	if _, err := fmt.Fprintf(writer, "CI lanes: %s\n", strings.Join(plan.Lanes, ",")); err != nil {
		fmt.Fprintf(stderr, "Write CI plan: %v\n", err)
		return 1
	}
	return 0
}

// completeWriter also rejects a writer that silently accepts only a prefix.
type completeWriter struct{ io.Writer }

func (writer completeWriter) Write(body []byte) (int, error) {
	written, err := writer.Writer.Write(body)
	if err == nil && written != len(body) {
		err = io.ErrShortWrite
	}
	return written, err
}
