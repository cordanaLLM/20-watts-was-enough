package experimentcli

import (
	"context"
	"flag"
	"fmt"
	"io"
	"os"
	"os/signal"
	"syscall"

	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/clrscontext"
)

func runExperimentCLRSContext(arguments []string, stdout, stderr io.Writer) int {
	flags := flag.NewFlagSet("experiment materialize-clrs-context", flag.ContinueOnError)
	flags.SetOutput(stderr)
	var options clrscontext.Options
	flags.StringVar(&options.RepositoryRoot, "root", ".", "current repository root")
	flags.StringVar(&options.Wheelhouse, "wheelhouse", "", "complete retained 61-wheel directory")
	flags.StringVar(&options.SourceArchive, "source-archive", "", "pinned CLRS upstream tar.gz")
	flags.StringVar(&options.PromiseSourceRoot, "promise-source-root", "", "frozen source root for the original Promise execution")
	flags.StringVar(&options.PromiseEvidence, "promise-evidence", "", "retained two-run Promise evidence bundle")
	flags.StringVar(&options.Output, "output", "", "new candidate context.tar, or existing tar with --check")
	check := flags.Bool("check", false, "verify exact context bytes using the same retained inputs; no writes")
	if flags.Parse(arguments) != nil || flags.NArg() != 0 {
		return 2
	}
	if options.Wheelhouse == "" || options.SourceArchive == "" || options.PromiseSourceRoot == "" || options.PromiseEvidence == "" || options.Output == "" {
		fmt.Fprintln(stderr, "materialize-clrs-context requires --wheelhouse, --source-archive, --promise-source-root, --promise-evidence and --output (also with --check)")
		return 2
	}
	ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer cancel()
	result, err := clrscontext.Prepare(ctx, options, *check)
	if err != nil {
		fmt.Fprintf(stderr, "CLRS context: %v\n", err)
		return 1
	}
	fmt.Fprintf(stdout, "CLRS candidate context verified: %d files, %d bytes, sha256:%s; NO_RESULT, image admission remains blocked.\n", result.Files, result.SizeBytes, result.SHA256)
	return 0
}
