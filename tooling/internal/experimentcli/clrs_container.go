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

type clrsContainerAction func(context.Context, clrsshakedown.ContainerOptions) (clrsshakedown.ContainerReport, error)

func runExperimentCLRSContainer(arguments []string, stdout, stderr io.Writer) int {
	return runContainerWithAction(arguments, stdout, stderr, clrsshakedown.RunContainer)
}

func runContainerWithAction(arguments []string, stdout, stderr io.Writer, execute clrsContainerAction) int {
	flags := flag.NewFlagSet("experiment run-clrs-shakedown-container", flag.ContinueOnError)
	flags.SetOutput(stderr)
	var options clrsshakedown.ContainerOptions
	flags.StringVar(&options.RepositoryRoot, "root", ".", "repository containing frozen development authorities; mounted read-only")
	flags.StringVar(&options.DatasetDirectory, "dataset", "", "existing frozen dataset directory; mounted read-only")
	flags.StringVar(&options.ExpectedTreeSHA256, "expected-tree", "", "independently supplied lowercase dataset tree SHA-256")
	flags.StringVar(&options.OutputDirectory, "output", "", "new exclusive parent containing host witness/ and mounted outputs/run/; never overwritten")
	flags.StringVar(&options.RunID, "run-id", "", "explicit development run identity")
	flags.StringVar(&options.ImageID, "image-id", "", "operator-trusted already-loaded sha256 image ID; never pulled, built or admitted")
	run := flags.Bool("execute", false, "run once and check in a separate read-only container; no hostile-image sandbox or hard disk quota")
	machine := flags.Bool("json", false, "emit bounded unsigned schema-1 container witness; inner receipt remains unchanged, NO_RESULT")
	if flags.Parse(arguments) != nil || flags.NArg() != 0 {
		return 2
	}
	if !*run || options.RepositoryRoot == "" || options.DatasetDirectory == "" || options.OutputDirectory == "" || options.RunID == "" ||
		!validCLRSSBOMDigest(options.ImageID) || !validCLRSSBOMDigest("sha256:"+options.ExpectedTreeSHA256) {
		fmt.Fprintln(stderr, "run-clrs-shakedown-container requires --execute, an exact loaded --image-id, --dataset, --expected-tree, --output, --run-id and nonempty --root")
		return 2
	}
	ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer cancel()
	ctx, deadlineCancel := context.WithTimeout(ctx, clrsshakedown.ContainerDeadline)
	defer deadlineCancel()
	report, err := execute(ctx, options)
	return writeCLRSContainerReport(ctx, report, err, *machine, stdout, stderr)
}

func writeCLRSContainerReport(ctx context.Context, report clrsshakedown.ContainerReport, runErr error, machine bool, stdout, stderr io.Writer) int {
	if machine {
		body, err := clrsshakedown.MarshalContainerReport(report)
		if err == nil {
			err = writeCLRSGenerationOutput(stdout, body)
		}
		if err != nil {
			fmt.Fprintf(stderr, "CLRS container report output: %v\n", err)
			return 1
		}
	}
	if runErr != nil {
		fmt.Fprintf(stderr, "CLRS container execution: %v\n", runErr)
		return 1
	}
	if err := ctx.Err(); err != nil {
		fmt.Fprintf(stderr, "CLRS container cancelled: %v\n", err)
		return 1
	}
	if !machine {
		body := []byte(fmt.Sprintf("CLRS container bundle checked: %d cases, %d events; NO_RESULT, image admission remains blocked. Witness: %s/witness/receipt.json\n", report.Cases, report.Events, report.OutputDirectory))
		if err := writeCLRSGenerationOutput(stdout, body); err != nil {
			fmt.Fprintf(stderr, "CLRS container report output: %v\n", err)
			return 1
		}
	}
	if err := ctx.Err(); err != nil {
		fmt.Fprintf(stderr, "CLRS container report cancelled: %v\n", err)
		return 1
	}
	return 0
}
