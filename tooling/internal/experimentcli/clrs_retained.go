package experimentcli

import (
	"context"
	"flag"
	"fmt"
	"io"
	"os"
	"os/signal"
	"syscall"

	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/clrsfixture"
)

func runExperimentFetchCLRSRetainedInputs(arguments []string, stdout, stderr io.Writer) int {
	flags := flag.NewFlagSet("experiment fetch-clrs-retained-inputs", flag.ContinueOnError)
	flags.SetOutput(stderr)
	root := flags.String("root", ".", "repository root")
	output := flags.String("output", "", "new directory for the downloaded locked inputs")
	if flags.Parse(arguments) != nil || flags.NArg() != 0 {
		return 2
	}
	if *output == "" {
		fmt.Fprintln(stderr, "fetch-clrs-retained-inputs requires --output")
		return 2
	}
	deadline, cancelDeadline := context.WithTimeout(context.Background(), clrsfixture.RetainedFetchDeadline)
	defer cancelDeadline()
	ctx, cancel := signal.NotifyContext(deadline, os.Interrupt, syscall.SIGTERM)
	defer cancel()
	if err := clrsfixture.FetchRetainedInputs(ctx, *root, *output); err != nil {
		fmt.Fprintf(stderr, "CLRS retained inputs: %v\n", err)
		return 1
	}
	fmt.Fprintln(stdout, "CLRS retained inputs fetched: source archive, Promise sdist and three build wheels match their locks; NO_RESULT.")
	return 0
}
