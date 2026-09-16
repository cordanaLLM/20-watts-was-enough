package experimentcli

import (
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"strings"

	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/experiment"
)

func runExperimentList(arguments []string, stdout, stderr io.Writer) int {
	flags := flag.NewFlagSet("experiment list", flag.ContinueOnError)
	flags.SetOutput(stderr)
	root := flags.String("root", ".", "repository root")
	jsonOutput := flags.Bool("json", false, "write the catalogue as JSON")
	if err := flags.Parse(arguments); err != nil || flags.NArg() != 0 {
		return 2
	}
	catalog, err := experiment.LoadCatalog(*root)
	if err != nil {
		fmt.Fprintf(stderr, "Load experiment catalogue: %v\n", err)
		return 1
	}
	if *jsonOutput {
		encoder := json.NewEncoder(stdout)
		encoder.SetIndent("", "  ")
		if err := encoder.Encode(catalog); err != nil {
			fmt.Fprintf(stderr, "Write experiment catalogue: %v\n", err)
			return 1
		}
		return 0
	}
	for _, entry := range catalog {
		fmt.Fprintf(stdout, "%s\t%s\t%s\n", entry.Artifact, entry.Readiness, entry.Distribution.State)
	}
	return 0
}

func runExperimentValidate(arguments []string, stdout, stderr io.Writer) int {
	flags := flag.NewFlagSet("experiment validate", flag.ContinueOnError)
	flags.SetOutput(stderr)
	root := flags.String("root", ".", "repository root")
	if err := flags.Parse(arguments); err != nil || flags.NArg() != 0 {
		return 2
	}
	catalog, err := experiment.LoadCatalog(*root)
	if err != nil {
		fmt.Fprintf(stderr, "Validate experiment catalogue: %v\n", err)
		return 1
	}
	plan, err := experiment.LoadReleasePlan(*root)
	if err != nil {
		fmt.Fprintf(stderr, "Validate experiment release plan: %v\n", err)
		return 1
	}
	fmt.Fprintf(stdout, "Experiment catalogue validation passed: %d manifests, %d release images.\n", len(catalog), len(plan))
	return 0
}

func runExperimentReleasePlan(arguments []string, stdout, stderr io.Writer) int {
	flags := flag.NewFlagSet("experiment release-plan", flag.ContinueOnError)
	flags.SetOutput(stderr)
	root := flags.String("root", ".", "repository root")
	jsonOutput := flags.Bool("json", false, "write the plan as JSON")
	if err := flags.Parse(arguments); err != nil || flags.NArg() != 0 {
		return 2
	}
	plan, err := experiment.LoadReleasePlan(*root)
	if err != nil {
		fmt.Fprintf(stderr, "Load experiment release plan: %v\n", err)
		return 1
	}
	if *jsonOutput {
		encoder := json.NewEncoder(stdout)
		encoder.SetIndent("", "  ")
		if err := encoder.Encode(plan); err != nil {
			fmt.Fprintf(stderr, "Write experiment release plan: %v\n", err)
			return 1
		}
		return 0
	}
	for _, entry := range plan {
		fmt.Fprintf(stdout, "%s\t%s\t%s\n", entry.Artifact, entry.Distribution.Image, strings.Join(entry.Distribution.Platforms, ","))
	}
	return 0
}
