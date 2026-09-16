package experimentcli

import (
	"context"
	"flag"
	"fmt"
	"io"
	"os"
	"os/signal"
	"syscall"

	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/clrsshakedown"
)

type clrsShakedownAction func(context.Context, clrsshakedown.Options) (clrsshakedown.Report, error)

func runExperimentCLRSShakedown(arguments []string, stdout, stderr io.Writer) int {
	return runShakedownWithActions(arguments, stdout, stderr, clrsshakedown.Run, clrsshakedown.Check)
}

func runShakedownWithActions(arguments []string, stdout, stderr io.Writer, execute, check clrsShakedownAction) int {
	flags := flag.NewFlagSet("experiment run-clrs-shakedown", flag.ContinueOnError)
	flags.SetOutput(stderr)
	var options clrsshakedown.Options
	flags.StringVar(&options.RepositoryRoot, "root", ".", "repository containing the frozen development authorities")
	flags.StringVar(&options.DatasetDirectory, "dataset", "", "existing frozen dataset directory; never generated or changed")
	flags.StringVar(&options.ExpectedTreeSHA256, "expected-tree", "", "independently supplied 64-character lowercase dataset tree SHA-256")
	flags.StringVar(&options.OutputDirectory, "output", "", "new run directory, or existing retained bundle with --check")
	flags.StringVar(&options.RunID, "run-id", "", "explicit development run identity")
	run := flags.Bool("execute", false, "run the bounded frozen Go controller development slice once")
	checkOnly := flags.Bool("check", false, "check retained bundle consistency without execution or writes")
	machine := flags.Bool("json", false, "emit the bounded schema-1 report, including operational failures")
	if flags.Parse(arguments) != nil || flags.NArg() != 0 {
		return 2
	}
	if *run == *checkOnly || options.RepositoryRoot == "" || options.DatasetDirectory == "" ||
		options.OutputDirectory == "" || options.RunID == "" || !validCLRSSBOMDigest("sha256:"+options.ExpectedTreeSHA256) {
		fmt.Fprintln(stderr, "run-clrs-shakedown requires exactly one of --execute/--check, --dataset, --expected-tree, --output, --run-id and nonempty --root; tree hash must be 64 lowercase hex characters")
		return 2
	}
	ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer cancel()
	action := execute
	if *checkOnly {
		action = check
	}
	report, err := action(ctx, options)
	return writeCLRSShakedownReport(ctx, report, err, *checkOnly, *machine, stdout, stderr)
}

func writeCLRSShakedownReport(ctx context.Context, report clrsshakedown.Report, runErr error, checkOnly, machine bool, stdout, stderr io.Writer) int {
	if runErr == nil && ctx.Err() != nil {
		fmt.Fprintf(stderr, "CLRS shakedown cancelled: %v\n", ctx.Err())
		return 1
	}
	if machine {
		body, err := clrsshakedown.MarshalReport(report)
		if err == nil {
			err = writeCLRSGenerationOutput(stdout, body)
		}
		if err != nil {
			fmt.Fprintf(stderr, "CLRS shakedown report output: %v\n", err)
			return 1
		}
	}
	if runErr != nil {
		fmt.Fprintf(stderr, "CLRS shakedown: %v\n", runErr)
		return 1
	}
	if !machine {
		operation := "completed"
		if checkOnly {
			operation = "bundle checked"
		}
		body := []byte(fmt.Sprintf("CLRS shakedown %s: %d cases, %d events; NO_RESULT, image admission remains blocked.\n", operation, len(report.Cases), len(report.Events)))
		if err := writeCLRSGenerationOutput(stdout, body); err != nil {
			fmt.Fprintf(stderr, "CLRS shakedown report output: %v\n", err)
			return 1
		}
	}
	if err := ctx.Err(); err != nil {
		fmt.Fprintf(stderr, "CLRS shakedown report cancelled: %v\n", err)
		return 1
	}
	return 0
}
