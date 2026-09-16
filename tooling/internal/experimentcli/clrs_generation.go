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

type clrsGenerationAction func(context.Context, clrsfixture.GeneratorFixtureRunOptions) (clrsfixture.GeneratorFixtureRun, error)

func runExperimentGenerateCLRSFixtures(arguments []string, stdout, stderr io.Writer) int {
	return runCLRSGenerationWithActions(arguments, stdout, stderr, clrsfixture.RunGeneratorFixtures, clrsfixture.CheckGeneratorFixtureRun)
}

func runCLRSGenerationWithActions(arguments []string, stdout, stderr io.Writer, execute, check clrsGenerationAction) int {
	flags := flag.NewFlagSet("experiment generate-clrs-fixtures", flag.ContinueOnError)
	flags.SetOutput(stderr)
	var options clrsfixture.GeneratorFixtureRunOptions
	flags.StringVar(&options.RepositoryRoot, "root", ".", "repository containing the frozen generator authorities")
	flags.StringVar(&options.OutputDirectory, "output", "", "new run directory, or existing bundle with --check")
	flags.StringVar(&options.Image.LoadedID, "image-id", "", "already-loaded sha256 image ID; no pull or load")
	flags.StringVar(&options.Image.ManifestDigest, "image-manifest", "", "independently pinned sha256 OCI manifest digest")
	flags.StringVar(&options.Image.ConfigDigest, "image-config", "", "independently pinned sha256 OCI config digest")
	flags.StringVar(&options.Image.ManifestFile, "manifest-file", "", "original OCI manifest JSON file")
	flags.StringVar(&options.Image.ConfigFile, "config-file", "", "original OCI config JSON file")
	run := flags.Bool("execute", false, "perform exactly one bounded local development generation")
	checkOnly := flags.Bool("check", false, "check retained bundle consistency without Docker or writes")
	machine := flags.Bool("json", false, "emit the bounded schema-1 report, including operational failures")
	if flags.Parse(arguments) != nil || flags.NArg() != 0 {
		return 2
	}
	if *run == *checkOnly || options.RepositoryRoot == "" || options.OutputDirectory == "" ||
		options.Image.LoadedID == "" || options.Image.ManifestDigest == "" || options.Image.ConfigDigest == "" ||
		options.Image.ManifestFile == "" || options.Image.ConfigFile == "" {
		fmt.Fprintln(stderr, "generate-clrs-fixtures requires exactly one of --execute/--check, --output, --image-id, --image-manifest, --image-config, --manifest-file, --config-file and nonempty --root")
		return 2
	}
	ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer cancel()
	action := execute
	if *checkOnly {
		action = check
	}
	report, runErr := action(ctx, options)
	if *machine {
		body, err := clrsfixture.MarshalGeneratorFixtureRun(report)
		if err == nil {
			err = writeCLRSGenerationOutput(stdout, body)
		}
		if err != nil {
			fmt.Fprintf(stderr, "CLRS generation report output: %v\n", err)
			return 1
		}
	}
	if runErr != nil {
		fmt.Fprintf(stderr, "CLRS generation: %v\n", runErr)
		return 1
	}
	if !*machine {
		operation := "generated"
		if *checkOnly {
			operation = "bundle checked"
		}
		body := []byte(fmt.Sprintf("CLRS fixtures %s: %d files, %d imported examples; NO_RESULT, image admission remains blocked.\n", operation, len(report.Files), report.ImportedExamples))
		if err := writeCLRSGenerationOutput(stdout, body); err != nil {
			fmt.Fprintf(stderr, "CLRS generation report output: %v\n", err)
			return 1
		}
	}
	return 0
}

func writeCLRSGenerationOutput(writer io.Writer, body []byte) error {
	n, err := writer.Write(body)
	if err == nil && n != len(body) {
		err = io.ErrShortWrite
	}
	return err
}
