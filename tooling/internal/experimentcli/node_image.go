package experimentcli

import (
	"flag"
	"fmt"
	"io"

	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/nodeimage"
)

func runPackageNodeImage(arguments []string, stdout, stderr io.Writer) int {
	flags := flag.NewFlagSet("experiment package-node-image", flag.ContinueOnError)
	flags.SetOutput(stderr)
	root := flags.String("root", ".", "repository root")
	artifact := flags.String("artifact", "", "supported experiment artifact")
	output := flags.String("output", "", "new Docker build-context directory")
	if err := flags.Parse(arguments); err != nil || flags.NArg() != 0 {
		return 2
	}
	if *artifact == "" || *output == "" {
		fmt.Fprintln(stderr, "experiment package-node-image requires --artifact and --output")
		return 2
	}
	if err := nodeimage.Package(nodeimage.Options{
		RepositoryRoot: *root,
		OutputRoot:     *output,
		Artifact:       *artifact,
	}); err != nil {
		fmt.Fprintf(stderr, "Package Node experiment image: %v\n", err)
		return 1
	}
	fmt.Fprintf(stdout, "Packaged %s experiment image context at %s.\n", *artifact, *output)
	return 0
}
