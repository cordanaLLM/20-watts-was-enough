package experimentcli

import (
	"flag"
	"fmt"
	"io"

	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/clrsfixture"
)

func runExperimentRenderCLRSWheelhouseManifest(arguments []string, stdout, stderr io.Writer) int {
	flags := flag.NewFlagSet("experiment render-clrs-wheelhouse-manifest", flag.ContinueOnError)
	flags.SetOutput(stderr)
	root := flags.String("root", ".", "repository root")
	wheelhouse := flags.String("wheelhouse", "", "materialised wheel directory")
	output := flags.String("output", "", "new candidate manifest path")
	if err := flags.Parse(arguments); err != nil {
		return 2
	}
	if flags.NArg() != 0 {
		fmt.Fprintln(stderr, "experiment render-clrs-wheelhouse-manifest accepts no positional arguments")
		return 2
	}
	if *wheelhouse == "" || *output == "" {
		fmt.Fprintln(stderr, "experiment render-clrs-wheelhouse-manifest requires --wheelhouse and --output")
		return 2
	}
	digest, size, err := clrsfixture.WriteGeneratorWheelhouseManifest(*root, *wheelhouse, *output)
	if err != nil {
		fmt.Fprintf(stderr, "Render CLRS generator wheelhouse manifest: %v\n", err)
		return 1
	}
	fmt.Fprintf(
		stdout,
		"CLRS generator wheelhouse manifest rendered: sha256:%s, %d bytes, NO_RESULT.\n",
		digest,
		size,
	)
	return 0
}

func runExperimentVerifyCLRSWheelhouse(arguments []string, stdout, stderr io.Writer) int {
	flags := flag.NewFlagSet("experiment verify-clrs-wheelhouse", flag.ContinueOnError)
	flags.SetOutput(stderr)
	root := flags.String("root", ".", "repository root")
	wheelhouse := flags.String("wheelhouse", "", "materialised wheel directory")
	if err := flags.Parse(arguments); err != nil {
		return 2
	}
	if flags.NArg() != 0 {
		fmt.Fprintln(stderr, "experiment verify-clrs-wheelhouse accepts no positional arguments")
		return 2
	}
	if *wheelhouse == "" {
		fmt.Fprintln(stderr, "experiment verify-clrs-wheelhouse requires --wheelhouse")
		return 2
	}
	manifest, err := clrsfixture.VerifyGeneratorWheelhouse(*root, *wheelhouse)
	if err != nil {
		fmt.Fprintf(stderr, "Verify CLRS generator wheelhouse: %v\n", err)
		return 1
	}
	fmt.Fprintf(
		stdout,
		"CLRS generator wheelhouse verified: %d artifacts, %d bytes, NO_RESULT.\n",
		manifest.ArtifactCount,
		manifest.TotalSizeBytes,
	)
	return 0
}
