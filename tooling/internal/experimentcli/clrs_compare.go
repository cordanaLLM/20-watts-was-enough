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

func runExperimentCompareCLRSFixtures(arguments []string, stdout, stderr io.Writer) int {
	flags := flag.NewFlagSet("experiment compare-clrs-fixtures", flag.ContinueOnError)
	flags.SetOutput(stderr)
	var options clrsfixture.FixtureComparisonOptions
	flags.StringVar(&options.RepositoryRoot, "root", ".", "repository containing the frozen CLRS source and generation contract")
	flags.StringVar(&options.FirstDirectory, "first", "", "first dataset root, absolute or relative to --root")
	flags.StringVar(&options.SecondDirectory, "second", "", "distinct second dataset root, absolute or relative to --root")
	machine := flags.Bool("json", false, "emit a bounded schema-1 report, also for validation failures")
	if flags.Parse(arguments) != nil || flags.NArg() != 0 {
		return 2
	}
	if options.RepositoryRoot == "" || options.FirstDirectory == "" || options.SecondDirectory == "" {
		fmt.Fprintln(stderr, "compare-clrs-fixtures requires nonempty --root, --first and --second; --root defaults to .")
		return 2
	}
	ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer cancel()
	report, comparisonErr := clrsfixture.CompareFixtures(ctx, options)
	if *machine {
		body, err := clrsfixture.MarshalFixtureComparison(report)
		if err == nil {
			var written int
			written, err = stdout.Write(body)
			if err == nil && written != len(body) {
				err = io.ErrShortWrite
			}
		}
		if err != nil {
			fmt.Fprintf(stderr, "CLRS fixture comparison output: %v\n", err)
			return 1
		}
	}
	if comparisonErr != nil {
		fmt.Fprintf(stderr, "CLRS fixture comparison: %s\n", report.Error)
		return 1
	}
	if !*machine {
		if _, err := fmt.Fprintf(stdout, "CLRS fixtures match: %d files, %d imported examples per tree; NO_RESULT, image admission remains blocked.\n", len(report.Files), report.FirstExamples); err != nil {
			fmt.Fprintf(stderr, "CLRS fixture comparison output: %v\n", err)
			return 1
		}
	}
	return 0
}
