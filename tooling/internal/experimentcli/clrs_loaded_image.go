package experimentcli

import (
	"context"
	"flag"
	"fmt"
	"io"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/clrsfixture"
)

type clrsLoadedImageAction func(context.Context, clrsfixture.GeneratorLoadedImageOptions) (clrsfixture.GeneratorLoadedImageReport, error)

func runExperimentPrepareCLRSLoadedImage(arguments []string, stdout, stderr io.Writer) int {
	return runCLRSLoadedImageWithAction(arguments, stdout, stderr, clrsfixture.PrepareGeneratorLoadedImage)
}

func runCLRSLoadedImageWithAction(arguments []string, stdout, stderr io.Writer, action clrsLoadedImageAction) int {
	flags := flag.NewFlagSet("experiment prepare-clrs-loaded-image", flag.ContinueOnError)
	flags.SetOutput(stderr)
	var options clrsfixture.GeneratorLoadedImageOptions
	flags.StringVar(&options.Archive.RepositoryRoot, "root", ".", "repository containing the frozen generator authorities")
	flags.StringVar(&options.Archive.ArchivePath, "archive", "", "retained OCI archive; never loaded or extracted by this command")
	flags.StringVar(&options.Archive.ExpectedArchiveSHA256, "sha256", "", "independently supplied 64-character lowercase archive SHA-256")
	flags.Int64Var(&options.Archive.ExpectedArchiveBytes, "bytes", 0, "independently supplied exact archive byte count, at most 2 GiB")
	flags.StringVar(&options.OutputDirectory, "output", "", "new exclusive local handoff directory; Docker is read-only")
	machine := flags.Bool("json", false, "emit the bounded schema-1 report, including operational failures")
	if flags.Parse(arguments) != nil || flags.NArg() != 0 {
		return 2
	}
	if options.Archive.RepositoryRoot == "" || options.Archive.ArchivePath == "" || options.OutputDirectory == "" ||
		!validCLRSSBOMDigest("sha256:"+options.Archive.ExpectedArchiveSHA256) || options.Archive.ExpectedArchiveBytes < 1 || options.Archive.ExpectedArchiveBytes > 2<<30 {
		fmt.Fprintln(stderr, "prepare-clrs-loaded-image requires --archive, --sha256, --bytes and --output; hash must be 64 lowercase hex characters and bytes 1 to 2147483648; --root must be nonempty")
		return 2
	}
	ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer cancel()
	ctx, stop := context.WithTimeout(ctx, 300*time.Second)
	defer stop()
	report, err := action(ctx, options)
	return writeCLRSLoadedImageReport(ctx, report, err, *machine, stdout, stderr)
}

func writeCLRSLoadedImageReport(ctx context.Context, report clrsfixture.GeneratorLoadedImageReport, preparationErr error,
	machine bool, stdout, stderr io.Writer) int {
	if preparationErr == nil && ctx.Err() != nil {
		fmt.Fprintf(stderr, "loaded CLRS image preparation cancelled: %v\n", ctx.Err())
		return 1
	}
	if machine {
		body, err := clrsfixture.MarshalGeneratorLoadedImageReport(report)
		if err == nil {
			err = writeCLRSGenerationOutput(stdout, body)
		}
		if err != nil {
			fmt.Fprintf(stderr, "loaded CLRS image report output: %v\n", err)
			return 1
		}
	}
	if preparationErr != nil {
		fmt.Fprintf(stderr, "loaded CLRS image preparation: %v\n", preparationErr)
		return 1
	}
	if !machine {
		body := []byte(fmt.Sprintf("Loaded CLRS image bound: %s; handoff %s; NO_RESULT, image not admitted.\n", report.LoadedImageID, report.OutputDirectory))
		if err := writeCLRSGenerationOutput(stdout, body); err != nil {
			fmt.Fprintf(stderr, "loaded CLRS image report output: %v\n", err)
			return 1
		}
	}
	if err := ctx.Err(); err != nil {
		fmt.Fprintf(stderr, "loaded CLRS image report cancelled: %v\n", err)
		return 1
	}
	return 0
}
