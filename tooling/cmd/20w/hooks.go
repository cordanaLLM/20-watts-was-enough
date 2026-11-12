package main

import (
	"context"
	"flag"
	"fmt"
	"io"
	"os"
	"os/signal"
	"syscall"

	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/pinnednode"
)

func runHooksPrePushGate(arguments []string, stdout, stderr io.Writer) int {
	return prePushGate(arguments, pinnednode.ExecDeps(), stdout, stderr)
}

func prePushGate(arguments []string, deps pinnednode.Deps, stdout, stderr io.Writer) int {
	flags := flag.NewFlagSet("hooks pre-push-gate", flag.ContinueOnError)
	flags.SetOutput(stderr)
	root := flags.String("root", ".", "repository root")
	if err := flags.Parse(arguments); err != nil {
		return 2
	}
	if flags.NArg() != 0 {
		fmt.Fprintln(stderr, "hooks pre-push-gate accepts only --root <repository>")
		return 2
	}
	ctx, cancel := context.WithTimeout(context.Background(), pinnednode.RunDeadline)
	defer cancel()
	ctx, stop := signal.NotifyContext(ctx, os.Interrupt, syscall.SIGTERM)
	defer stop()
	status, err := pinnednode.Run(ctx, *root, deps, stdout, stderr)
	if err != nil {
		fmt.Fprintf(stderr, "Pre-push gate refused: %v\n", err)
		return 1
	}
	return status
}
