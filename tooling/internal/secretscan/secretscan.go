// Package secretscan proves that the pinned gitleaks reports a planted secret.
// CI runs this proof before it scans the repository history, so a scanner that
// cannot report findings fails instead of passing.
package secretscan

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

const (
	// ToolsModule is the module, relative to the repository root, whose tool
	// directive pins gitleaks.
	ToolsModule = "tooling/tools"
	// CanaryRule is the gitleaks rule that must report the planted secret.
	CanaryRule = "github-pat"
	// CanaryFile is the file of the planted repository that holds the secret.
	CanaryFile = "settings.env"
	// ScanDeadline bounds the planted repository setup and one gitleaks run.
	ScanDeadline = 5 * time.Minute
	// findingsExit is the exit status the planted scan requests for findings.
	// It differs from 1, the status gitleaks also uses for its own errors.
	findingsExit = 3
	// maxReportBytes bounds the planted scan's JSON report.
	maxReportBytes = 1 << 20
)

// Args returns the gitleaks arguments of the planted scan. They match the CI
// history scan except for the exit status, the JSON report and the ignore
// file, which is looked up in the planted repository, so the repository's own
// ignore list cannot hide the planted secret.
func Args(source, report string) []string {
	return []string{
		"git", "--no-banner", "--redact", "--ignore-gitleaks-allow",
		"--timeout", strconv.Itoa(int(ScanDeadline / time.Second)),
		"--log-opts=HEAD", "--gitleaks-ignore-path", source,
		"--exit-code", strconv.Itoa(findingsExit),
		"--report-format", "json", "--report-path", report,
		source,
	}
}

// canaryToken builds a GitHub personal access token shape at run time, so no
// file in this repository holds a string the scanner would report.
func canaryToken() string {
	sum := sha256.Sum256([]byte("20w gitleaks canary"))
	return "ghp_" + hex.EncodeToString(sum[:])[:36]
}

// Runner runs the gitleaks pinned in toolsDir with the arguments. It returns
// the exit status and the combined output; err is set only when the scanner
// could not be started or did not exit.
type Runner func(ctx context.Context, toolsDir string, args []string) (status int, output []byte, err error)

// ExecRunner runs "go tool gitleaks" from the tools module. A gitleaks
// configuration named by the environment is dropped, so the planted scan uses
// the default rules.
func ExecRunner(ctx context.Context, toolsDir string, args []string) (int, []byte, error) {
	command := exec.CommandContext(ctx, "go", append([]string{"tool", "gitleaks"}, args...)...) //#nosec G204 -- fixed go tool gitleaks execution with bounded arguments
	command.Dir = toolsDir
	command.Env = withoutVariables(os.Environ(), "GITLEAKS_CONFIG", "GITLEAKS_CONFIG_TOML")
	output, err := command.CombinedOutput()
	if ctx.Err() != nil {
		return 0, output, fmt.Errorf("gitleaks stopped: %w", ctx.Err())
	}
	var exitError *exec.ExitError
	if errors.As(err, &exitError) {
		return exitError.ExitCode(), output, nil
	}
	if err != nil {
		return 0, output, fmt.Errorf("start gitleaks: %w", err)
	}
	return 0, output, nil
}

func withoutVariables(environment []string, names ...string) []string {
	kept := make([]string, 0, len(environment))
	for _, entry := range environment {
		name, _, _ := strings.Cut(entry, "=")
		dropped := false
		for _, drop := range names {
			dropped = dropped || name == drop
		}
		if !dropped {
			kept = append(kept, entry)
		}
	}
	return kept
}

// Plant creates a Git repository in directory whose one commit adds the
// planted secret. The user's Git configuration is not read, so no signing
// or hook setting applies.
func Plant(ctx context.Context, directory string) error {
	if err := os.WriteFile(filepath.Join(directory, CanaryFile), []byte("GITHUB_TOKEN="+canaryToken()+"\n"), 0o600); err != nil {
		return fmt.Errorf("write planted secret: %w", err)
	}
	for _, args := range [][]string{
		{"init", "--quiet", "--initial-branch=main"},
		{"add", CanaryFile},
		{"-c", "user.name=20w canary", "-c", "user.email=canary@invalid", "-c", "commit.gpgsign=false",
			"commit", "--quiet", "--no-verify", "--message", "Plant a secret for the scanner proof"},
	} {
		command := exec.CommandContext(ctx, "git", args...) //#nosec G204 -- fixed git binary with fixed internal arguments for canary creation
		command.Dir = directory
		command.Env = append(os.Environ(), "GIT_CONFIG_GLOBAL="+os.DevNull, "GIT_CONFIG_NOSYSTEM=1")
		if output, err := command.CombinedOutput(); err != nil {
			return fmt.Errorf("git %s in the planted repository: %w\n%s", args[len(args)-1], err, output)
		}
	}
	return nil
}

// Run plants a secret in a temporary repository, scans it with the pinned
// gitleaks and accepts only a report of exactly that secret.
func Run(ctx context.Context, root string, run Runner, stdout io.Writer) error {
	ctx, cancel := context.WithTimeout(ctx, ScanDeadline)
	defer cancel()
	// The scanner runs from the tools module, so a relative path would resolve
	// against that directory instead of the caller's.
	root, err := filepath.Abs(root)
	if err != nil {
		return fmt.Errorf("resolve repository root: %w", err)
	}
	scratch, err := os.MkdirTemp("", "gitleaks-canary-")
	if err != nil {
		return fmt.Errorf("create planted repository: %w", err)
	}
	defer os.RemoveAll(scratch)
	source := filepath.Join(scratch, "repository")
	if err := os.Mkdir(source, 0o700); err != nil {
		return fmt.Errorf("create planted repository: %w", err)
	}
	if err := Plant(ctx, source); err != nil {
		return err
	}
	report := filepath.Join(scratch, "report.json")
	status, output, err := run(ctx, filepath.Join(root, filepath.FromSlash(ToolsModule)), Args(source, report))
	if err != nil {
		return err
	}
	if err := CheckCanary(status, output, report); err != nil {
		return err
	}
	_, err = fmt.Fprintf(stdout, "gitleaks reported the planted %s secret in %s.\n", CanaryRule, CanaryFile)
	return err
}

type finding struct {
	RuleID string `json:"RuleID"`
	File   string `json:"File"`
}

// CheckCanary accepts only the findings exit and a report that holds exactly
// the planted secret.
func CheckCanary(status int, output []byte, report string) error {
	if status != findingsExit {
		return fmt.Errorf(
			"gitleaks exited %d on the planted repository, want %d; a scanner that misses a planted secret proves nothing:\n%s",
			status, findingsExit, output,
		)
	}
	file, err := os.Open(report) //#nosec G304 -- path within temporary scratch directory created for canary report
	if err != nil {
		return fmt.Errorf("read planted scan report: %w", err)
	}
	defer file.Close()
	var findings []finding
	if err := json.NewDecoder(io.LimitReader(file, maxReportBytes)).Decode(&findings); err != nil {
		return fmt.Errorf("decode planted scan report: %w", err)
	}
	if len(findings) != 1 || findings[0].RuleID != CanaryRule || findings[0].File != CanaryFile {
		return fmt.Errorf("planted scan reported %+v, want one %s finding in %s", findings, CanaryRule, CanaryFile)
	}
	return nil
}
