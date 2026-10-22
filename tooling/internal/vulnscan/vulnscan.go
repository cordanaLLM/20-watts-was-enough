// Package vulnscan runs the pinned govulncheck over the tooling module. Each
// run first scans a planted module with a known advisory, so a scanner that
// cannot report findings fails instead of passing.
package vulnscan

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"time"
)

const (
	// ToolsModule is the module, relative to the repository root, whose tool
	// directive pins govulncheck.
	ToolsModule = "tooling/tools"
	// ScanTarget is the module, relative to the repository root, that is scanned.
	ScanTarget = "tooling"
	// CanaryAdvisory is the advisory govulncheck must report on the planted module.
	CanaryAdvisory = "GO-2021-0113"
	// ScanDeadline bounds one govulncheck invocation, module downloads included.
	ScanDeadline = 10 * time.Minute
	// findingsExit is govulncheck's exit status when a vulnerability is reachable.
	findingsExit = 3
)

// The planted module calls language.Parse from golang.org/x/text v0.3.5, which
// GO-2021-0113 (CVE-2020-28851) marks as vulnerable and reachable.
var canaryFiles = map[string]string{
	"go.mod": "module example.com/govulncheck-canary\n\ngo 1.22\n\nrequire golang.org/x/text v0.3.5\n",
	"go.sum": "golang.org/x/text v0.3.5 h1:i6eZZ+zk0SOf0xgBpEpPD18qWcJda6q1sxt3S0kzyUQ=\n" +
		"golang.org/x/text v0.3.5/go.mod h1:5Zoc/QRtKVWzQhOtBMvqHzDpF6irO9z98xDceosuGiQ=\n" +
		"golang.org/x/tools v0.0.0-20180917221912-90fa682c2a6e/go.mod h1:n7NCudcB/nEzxVGmLbDWY5pfWTLqBcC2KZ6jyYvM4mQ=\n",
	"main.go": "package main\n\nimport \"golang.org/x/text/language\"\n\nfunc main() { _, _ = language.Parse(\"en\") }\n",
}

// Runner runs the govulncheck pinned in toolsDir over every package of the
// module in target. It returns the exit status and the combined output; err
// is set only when the scanner could not be started or did not exit.
type Runner func(ctx context.Context, toolsDir, target string) (status int, output []byte, err error)

// ExecRunner runs "go tool govulncheck" from the tools module.
func ExecRunner(ctx context.Context, toolsDir, target string) (int, []byte, error) {
	ctx, cancel := context.WithTimeout(ctx, ScanDeadline)
	defer cancel()
	command := exec.CommandContext(ctx, "go", "tool", "govulncheck", "-C", target, "./...") //#nosec G204 -- fixed go tool invocation with caller-specified target module directory
	command.Dir = toolsDir
	output, err := command.CombinedOutput()
	if ctx.Err() != nil {
		return 0, output, fmt.Errorf("govulncheck on %s stopped: %w", target, ctx.Err())
	}
	var exitError *exec.ExitError
	if errors.As(err, &exitError) {
		return exitError.ExitCode(), output, nil
	}
	if err != nil {
		return 0, output, fmt.Errorf("start govulncheck: %w", err)
	}
	return 0, output, nil
}

// Run proves the scanner on the planted module, then scans the tooling module
// and copies that scan's report to stdout.
func Run(ctx context.Context, root string, run Runner, stdout io.Writer) error {
	// The scanner runs from the tools module, so a relative target would
	// resolve against that directory instead of the caller's.
	root, err := filepath.Abs(root)
	if err != nil {
		return fmt.Errorf("resolve repository root: %w", err)
	}
	toolsDir := filepath.Join(root, filepath.FromSlash(ToolsModule))
	canary, err := os.MkdirTemp("", "govulncheck-canary-")
	if err != nil {
		return fmt.Errorf("create planted module: %w", err)
	}
	defer os.RemoveAll(canary)
	if err := writeCanary(canary); err != nil {
		return err
	}
	status, output, err := run(ctx, toolsDir, canary)
	if err != nil {
		return err
	}
	if err := CheckCanary(status, output); err != nil {
		return err
	}
	fmt.Fprintf(stdout, "govulncheck reported %s on the planted module.\n", CanaryAdvisory)
	status, output, err = run(ctx, toolsDir, filepath.Join(root, ScanTarget))
	if err != nil {
		return err
	}
	if _, err := stdout.Write(output); err != nil {
		return fmt.Errorf("write scan report: %w", err)
	}
	return CheckScan(status)
}

func writeCanary(directory string) error {
	for name, content := range canaryFiles {
		if err := os.WriteFile(filepath.Join(directory, name), []byte(content), 0o600); err != nil {
			return fmt.Errorf("write planted module: %w", err)
		}
	}
	return nil
}

// CheckCanary accepts only a findings exit that names the planted advisory.
func CheckCanary(status int, output []byte) error {
	if status != findingsExit || !bytes.Contains(output, []byte(CanaryAdvisory)) {
		return fmt.Errorf(
			"govulncheck did not report %s on the planted module (exit %d); a scanner that misses a known advisory proves nothing:\n%s",
			CanaryAdvisory, status, output,
		)
	}
	return nil
}

// CheckScan accepts only a clean exit from the tooling scan.
func CheckScan(status int) error {
	switch status {
	case 0:
		return nil
	case findingsExit:
		return errors.New("govulncheck reports reachable vulnerabilities in the tooling module")
	default:
		return fmt.Errorf("govulncheck failed with exit %d", status)
	}
}
