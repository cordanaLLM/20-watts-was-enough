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

func runExperimentReproducePromise(arguments []string, stdout, stderr io.Writer) int {
	flags := flag.NewFlagSet("experiment reproduce-clrs-promise-wheel", flag.ContinueOnError)
	flags.SetOutput(stderr)
	root := flags.String("root", ".", "repository root")
	inputs := flags.String("inputs", "", "retained source-build-inputs and build-tools parent")
	output := flags.String("output", "", "new evidence bundle directory, or existing bundle with --check")
	check := flags.Bool("check", false, "verify an existing bundle without writes or Docker")
	if flags.Parse(arguments) != nil || flags.NArg() != 0 {
		return 2
	}
	if *output == "" || (!*check && *inputs == "") || (*check && *inputs != "") {
		fmt.Fprintln(stderr, "reproduce-clrs-promise-wheel requires --inputs and --output, or --check and --output")
		return 2
	}
	var err error
	if *check {
		err = clrsfixture.CheckPromiseWheelReproduction(*root, *output)
	} else {
		ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
		defer cancel()
		err = clrsfixture.ReproducePromiseWheel(ctx, *root, *inputs, *output)
	}
	if err != nil {
		fmt.Fprintf(stderr, "Promise wheel reproduction: %v\n", err)
		return 1
	}
	fmt.Fprintln(stdout, "Promise wheel reproduction verified: two exact wheels and MIT licenses, NO_RESULT; generator image remains blocked.")
	return 0
}
