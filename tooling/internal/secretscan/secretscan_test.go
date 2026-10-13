package secretscan

import (
	"bytes"
	"context"
	"errors"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"
)

type call struct {
	toolsDir string
	args     []string
}

// fakeRunner checks the planted repository, writes report into the report
// path when it is not empty, and answers with status, output and err.
func fakeRunner(calls *[]call, status int, report, output string, err error) Runner {
	return func(_ context.Context, toolsDir string, args []string) (int, []byte, error) {
		*calls = append(*calls, call{toolsDir, args})
		source := args[len(args)-1]
		content, readErr := os.ReadFile(filepath.Join(source, CanaryFile))
		if readErr != nil || !strings.Contains(string(content), canaryToken()) {
			return 0, nil, errors.New("planted secret not written")
		}
		if _, statErr := os.Stat(filepath.Join(source, ".git")); statErr != nil {
			return 0, nil, errors.New("planted repository not created")
		}
		if report != "" {
			path := args[slices.Index(args, "--report-path")+1]
			if writeErr := os.WriteFile(path, []byte(report), 0o600); writeErr != nil {
				return 0, nil, writeErr
			}
		}
		return status, []byte(output), err
	}
}

const plantedReport = `[{"RuleID":"github-pat","File":"settings.env","Secret":"REDACTED"}]`

func TestRunAcceptsTheReportedCanary(t *testing.T) {
	var calls []call
	var stdout bytes.Buffer
	root := t.TempDir()
	if err := Run(context.Background(), root, fakeRunner(&calls, 3, plantedReport, "leaks found: 1", nil), &stdout); err != nil {
		t.Fatal(err)
	}
	if len(calls) != 1 || calls[0].toolsDir != filepath.Join(root, "tooling", "tools") {
		t.Fatalf("calls = %+v", calls)
	}
	if !strings.Contains(stdout.String(), CanaryRule) {
		t.Fatalf("stdout = %q", stdout.String())
	}
	source := calls[0].args[len(calls[0].args)-1]
	if _, err := os.Stat(source); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("planted repository left on disk: %v", err)
	}
}

func TestRunRefusesAScannerThatMissesTheCanary(t *testing.T) {
	for name, runner := range map[string]struct {
		status         int
		report, output string
		err            error
	}{
		"clean exit":          {0, "[]", "no leaks found", nil},
		"error exit":          {1, "", "fatal: not a git repository", nil},
		"findings, no report": {3, "", "leaks found: 1", nil},
		"wrong rule":          {3, `[{"RuleID":"generic-api-key","File":"settings.env"}]`, "", nil},
		"wrong file":          {3, `[{"RuleID":"github-pat","File":"other.env"}]`, "", nil},
		"two findings":        {3, `[{"RuleID":"github-pat","File":"settings.env"},{"RuleID":"github-pat","File":"settings.env"}]`, "", nil},
		"empty report":        {3, "[]", "", nil},
		"malformed report":    {3, "not json", "", nil},
		"scanner not started": {0, "", "", errors.New("start gitleaks: not found")},
		"deadline":            {0, "", "", context.DeadlineExceeded},
	} {
		t.Run(name, func(t *testing.T) {
			var calls []call
			err := Run(context.Background(), t.TempDir(), fakeRunner(&calls, runner.status, runner.report, runner.output, runner.err), &bytes.Buffer{})
			if err == nil {
				t.Fatal("scanner without the planted finding accepted")
			}
		})
	}
}

func TestArgsKeepTheRepositoryIgnoreListAway(t *testing.T) {
	args := Args("/planted", "/report.json")
	if args[0] != "git" || args[len(args)-1] != "/planted" {
		t.Fatalf("args = %q", args)
	}
	for flag, want := range map[string]string{
		"--gitleaks-ignore-path": "/planted",
		"--exit-code":            "3",
		"--report-format":        "json",
		"--report-path":          "/report.json",
		"--timeout":              "300",
	} {
		index := slices.Index(args, flag)
		if index < 0 || args[index+1] != want {
			t.Errorf("%s = %q, want %q", flag, args, want)
		}
	}
	for _, flag := range []string{"--redact", "--ignore-gitleaks-allow", "--log-opts=HEAD", "--no-banner"} {
		if !slices.Contains(args, flag) {
			t.Errorf("args lack %s", flag)
		}
	}
}

func TestCanaryTokenHasTheGitHubTokenShape(t *testing.T) {
	token := canaryToken()
	if len(token) != 40 || !strings.HasPrefix(token, "ghp_") {
		t.Fatalf("token shape = %d characters", len(token))
	}
}

func TestReportBeyondTheLimitIsRefused(t *testing.T) {
	report := filepath.Join(t.TempDir(), "report.json")
	padding := strings.Repeat(" ", maxReportBytes)
	if err := os.WriteFile(report, []byte(padding+plantedReport), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := CheckCanary(3, nil, report); err == nil {
		t.Fatal("report beyond the size limit accepted")
	}
}

func TestWithoutVariablesDropsOnlyTheNamedEntries(t *testing.T) {
	got := withoutVariables([]string{"GITLEAKS_CONFIG=/x", "PATH=/bin", "GITLEAKS_CONFIG_TOML=y", "GITLEAKS_CONFIGX=z"}, "GITLEAKS_CONFIG", "GITLEAKS_CONFIG_TOML")
	if !slices.Equal(got, []string{"PATH=/bin", "GITLEAKS_CONFIGX=z"}) {
		t.Fatalf("got %q", got)
	}
}

func TestToolsModulePinsGitleaks(t *testing.T) {
	content, err := os.ReadFile(filepath.Join("..", "..", "tools", "go.mod"))
	if err != nil {
		t.Fatal(err)
	}
	for _, line := range []string{"tool github.com/zricethezav/gitleaks/v8", "github.com/zricethezav/gitleaks/v8 v8.30.1"} {
		if !strings.Contains(string(content), line) {
			t.Errorf("tooling/tools/go.mod lacks %q", line)
		}
	}
}
