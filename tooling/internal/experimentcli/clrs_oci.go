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

func runExperimentInspectCLRSOCI(arguments []string, stdout, stderr io.Writer) int {
	flags := flag.NewFlagSet("experiment inspect-clrs-image-archive", flag.ContinueOnError)
	flags.SetOutput(stderr)
	var options clrsfixture.GeneratorOCIOptions
	flags.StringVar(&options.RepositoryRoot, "root", ".", "repository containing the frozen CLRS image authority")
	flags.StringVar(&options.ArchivePath, "archive", "", "retained OCI tar, absolute or relative to --root")
	flags.StringVar(&options.ExpectedArchiveSHA256, "sha256", "", "independently supplied 64-character lowercase archive SHA-256")
	flags.Int64Var(&options.ExpectedArchiveBytes, "bytes", 0, "independently supplied exact archive byte count, at most 2 GiB")
	machine := flags.Bool("json", false, "emit bounded schema-1 JSON with original manifest/config bytes encoded as base64")
	if flags.Parse(arguments) != nil || flags.NArg() != 0 {
		return 2
	}
	if options.RepositoryRoot == "" || options.ArchivePath == "" || !validCLRSSBOMDigest("sha256:"+options.ExpectedArchiveSHA256) ||
		options.ExpectedArchiveBytes < 1 || options.ExpectedArchiveBytes > 2<<30 {
		fmt.Fprintln(stderr, "inspect-clrs-image-archive requires --archive, --sha256 and --bytes; hash must be 64 lowercase hex characters and byte count 1 to 2147483648; --root must be nonempty")
		return 2
	}
	ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer cancel()
	ctx, deadlineCancel := context.WithTimeout(ctx, 180*time.Second)
	defer deadlineCancel()
	report, err := clrsfixture.InspectGeneratorOCIArchive(ctx, options)
	return writeCLRSOCIReport(ctx, report, err, *machine, stdout, stderr)
}

func writeCLRSOCIReport(ctx context.Context, report clrsfixture.GeneratorOCIReport, checkErr error, machine bool, stdout, stderr io.Writer) int {
	if checkErr == nil && ctx.Err() != nil {
		fmt.Fprintf(stderr, "CLRS OCI report cancelled: %v\n", ctx.Err())
		return 1
	}
	if machine {
		body, err := clrsfixture.MarshalGeneratorOCIReport(report)
		if err == nil {
			var written int
			written, err = stdout.Write(body)
			if err == nil && written != len(body) {
				err = io.ErrShortWrite
			}
		}
		if err != nil {
			fmt.Fprintf(stderr, "CLRS OCI report output: %v\n", err)
			return 1
		}
	}
	if checkErr != nil {
		fmt.Fprintf(stderr, "CLRS OCI archive check: %v\n", checkErr)
		return 1
	}
	if !machine {
		body := []byte(fmt.Sprintf("CLRS OCI archive consistent: %s, %d bytes, %d layers, %d decoded tar bytes; NO_RESULT, image not admitted.\n", report.ArchiveSHA256, report.ArchiveBytes, len(report.Layers), report.ExpandedBytes))
		if n, err := stdout.Write(body); err != nil || n != len(body) {
			fmt.Fprintln(stderr, "CLRS OCI report output failed or was short")
			return 1
		}
	}
	if err := ctx.Err(); err != nil {
		fmt.Fprintf(stderr, "CLRS OCI report cancelled: %v\n", err)
		return 1
	}
	return 0
}
