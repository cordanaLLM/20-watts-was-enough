package experimentcli

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"os"
	"os/signal"
	"syscall"

	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/clrsfixture"
)

type clrsInvocationReport struct {
	SchemaVersion    int      `json:"schema_version"`
	Authority        string   `json:"authority"`
	State            string   `json:"state"`
	SourceID         string   `json:"source_id"`
	ContractID       string   `json:"contract_id"`
	ProgramSHA256    string   `json:"program_sha256"`
	PythonExecutable string   `json:"python_executable"`
	PythonArguments  []string `json:"python_arguments"`
	OutputDirectory  string   `json:"output_directory"`
	ExpectedPaths    []string `json:"expected_paths"`
	ExpectedExamples int      `json:"expected_examples"`
}

func runExperimentRenderCLRSInvocation(arguments []string, stdout, stderr io.Writer) int {
	flags := flag.NewFlagSet("experiment render-clrs-generation-program", flag.ContinueOnError)
	flags.SetOutput(stderr)
	root := flags.String("root", ".", "repository containing the frozen generator authorities")
	machine := flags.Bool("json", false, "emit prepared invocation metadata and argv instead of Python source")
	if flags.Parse(arguments) != nil || flags.NArg() != 0 || *root == "" {
		return 2
	}
	ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer cancel()
	invocation, err := clrsfixture.PrepareGeneratorInvocation(ctx, *root)
	if err != nil {
		fmt.Fprintf(stderr, "CLRS generation program: %v\n", err)
		return 1
	}
	body := []byte(invocation.Program)
	if *machine {
		body, err = json.MarshalIndent(clrsInvocationReport{
			SchemaVersion: 1, Authority: invocation.Authority, State: "prepared-unexecuted",
			SourceID: invocation.SourceID.String(), ContractID: invocation.ContractID.String(),
			ProgramSHA256: invocation.ProgramSHA256, PythonExecutable: invocation.PythonExecutable,
			PythonArguments: invocation.PythonArguments(), OutputDirectory: invocation.OutputDirectory,
			ExpectedPaths: invocation.ExpectedPaths, ExpectedExamples: invocation.ExpectedExamples,
		}, "", "  ")
		body = append(body, '\n')
	}
	if err != nil || len(body) == 0 || len(body) > 64<<10 {
		fmt.Fprintln(stderr, "CLRS generation program output cannot be encoded within 64 KiB")
		return 1
	}
	written, err := stdout.Write(body)
	if err == nil && written != len(body) {
		err = io.ErrShortWrite
	}
	if err != nil {
		fmt.Fprintf(stderr, "CLRS generation program output: %v\n", err)
		return 1
	}
	return 0
}
