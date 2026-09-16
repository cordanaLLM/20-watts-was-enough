package experimentcli

import (
	"context"
	"flag"
	"fmt"
	"io"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"syscall"

	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/clrsfixture"
)

func runExperimentCheckCLRSSBOM(arguments []string, stdout, stderr io.Writer) int {
	flags := flag.NewFlagSet("experiment check-clrs-sbom-bundle", flag.ContinueOnError)
	flags.SetOutput(stderr)
	var options clrsfixture.GeneratorSBOMOptions
	flags.StringVar(&options.RepositoryRoot, "root", ".", "repository containing the frozen image and wheelhouse authorities")
	flags.StringVar(&options.BundleRoot, "bundle", "", "five-file SBOM evidence directory, absolute or relative to --root")
	flags.StringVar(&options.ExpectedManifestDigest, "image-manifest", "", "independently supplied expected sha256 image manifest digest")
	flags.StringVar(&options.ExpectedConfigDigest, "image-config", "", "independently supplied expected sha256 raw image config digest")
	machine := flags.Bool("json", false, "emit a bounded schema-1 consistency report, including validation failures")
	if flags.Parse(arguments) != nil || flags.NArg() != 0 {
		return 2
	}
	if options.RepositoryRoot == "" || options.BundleRoot == "" || !validCLRSSBOMDigest(options.ExpectedManifestDigest) || !validCLRSSBOMDigest(options.ExpectedConfigDigest) {
		fmt.Fprintln(stderr, "check-clrs-sbom-bundle requires --bundle, --image-manifest and --image-config; digests must be sha256: followed by 64 lowercase hex characters; --root must be nonempty")
		return 2
	}
	if !filepath.IsAbs(options.BundleRoot) {
		options.BundleRoot = filepath.Join(options.RepositoryRoot, options.BundleRoot)
	}
	ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer cancel()
	report, err := clrsfixture.CheckGeneratorSBOMBundle(ctx, options)
	return writeCLRSSBOMReport(report, err, *machine, stdout, stderr)
}

func validCLRSSBOMDigest(value string) bool {
	if len(value) != 71 || !strings.HasPrefix(value, "sha256:") {
		return false
	}
	for _, digit := range value[7:] {
		if (digit < '0' || digit > '9') && (digit < 'a' || digit > 'f') {
			return false
		}
	}
	return true
}

func writeCLRSSBOMReport(report clrsfixture.GeneratorSBOMReport, checkErr error, machine bool, stdout, stderr io.Writer) int {
	if machine {
		body, err := clrsfixture.MarshalGeneratorSBOMReport(report)
		if err == nil {
			var written int
			written, err = stdout.Write(body)
			if err == nil && written != len(body) {
				err = io.ErrShortWrite
			}
		}
		if err != nil {
			fmt.Fprintf(stderr, "CLRS SBOM report output: %v\n", err)
			return 1
		}
	}
	if checkErr != nil {
		fmt.Fprintf(stderr, "CLRS SBOM bundle check: %s\n", report.Error)
		return 1
	}
	if !machine {
		if _, err := fmt.Fprintf(stdout, "CLRS SBOM bundle consistent: %d package records, %d locked runtime packages, %d extra top-level Python packages; NO_RESULT, image not admitted.\n", report.PackageCount, len(report.LockedPackages), len(report.ExtraTopLevelPython)); err != nil {
			fmt.Fprintf(stderr, "CLRS SBOM report output: %v\n", err)
			return 1
		}
	}
	return 0
}
