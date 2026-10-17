package vulnscan

import (
	"bytes"
	"context"
	"errors"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"
)

type call struct{ toolsDir, target string }

// fakeRunner answers the planted scan with canary and the tooling scan with
// scan, and records each call.
func fakeRunner(calls *[]call, canary, scan func() (int, []byte, error)) Runner {
	return func(_ context.Context, toolsDir, target string) (int, []byte, error) {
		*calls = append(*calls, call{toolsDir, target})
		if filepath.Base(target) == ScanTarget {
			return scan()
		}
		for name, content := range canaryFiles {
			got, err := os.ReadFile(filepath.Join(target, name))
			if err != nil || string(got) != content {
				return 0, nil, errors.New("planted module not written: " + name)
			}
		}
		return canary()
	}
}

func answer(status int, output string, err error) func() (int, []byte, error) {
	return func() (int, []byte, error) { return status, []byte(output), err }
}

var canaryFound = answer(3, "Vulnerability #1: "+CanaryAdvisory, nil)

func TestRunScansToolingAfterTheCanary(t *testing.T) {
	var calls []call
	var stdout bytes.Buffer
	root := t.TempDir()
	if err := Run(context.Background(), root, fakeRunner(&calls, canaryFound, answer(0, "No vulnerabilities found.\n", nil)), &stdout); err != nil {
		t.Fatal(err)
	}
	if len(calls) != 2 || calls[1].target != filepath.Join(root, ScanTarget) {
		t.Fatalf("calls = %+v", calls)
	}
	for _, c := range calls {
		if c.toolsDir != filepath.Join(root, "tooling", "tools") {
			t.Fatalf("tools module = %s", c.toolsDir)
		}
	}
	if !strings.Contains(stdout.String(), "No vulnerabilities found.") {
		t.Fatalf("scan report not copied: %q", stdout.String())
	}
	if _, err := os.Stat(calls[0].target); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("planted module left on disk: %v", err)
	}
}

func TestRunRefusesAScannerThatMissesTheCanary(t *testing.T) {
	for name, canary := range map[string]func() (int, []byte, error){
		"clean exit":          answer(0, "No vulnerabilities found.", nil),
		"other advisory":      answer(3, "Vulnerability #1: GO-2022-1059", nil),
		"advisory, exit 1":    answer(1, CanaryAdvisory, nil),
		"scanner not started": answer(0, "", errors.New("start govulncheck: not found")),
	} {
		t.Run(name, func(t *testing.T) {
			var calls []call
			err := Run(context.Background(), t.TempDir(), fakeRunner(&calls, canary, answer(0, "", nil)), &bytes.Buffer{})
			if err == nil {
				t.Fatal("scanner without a canary finding accepted")
			}
			if len(calls) != 1 {
				t.Fatalf("tooling scanned after a failed canary: %+v", calls)
			}
		})
	}
}

func TestRunFailsOnToolingFindingsAndScannerErrors(t *testing.T) {
	for name, scan := range map[string]func() (int, []byte, error){
		"findings":   answer(3, "Vulnerability #1: GO-2099-0001", nil),
		"error exit": answer(1, "go: module lookup disabled", nil),
		"deadline":   answer(0, "", context.DeadlineExceeded),
	} {
		t.Run(name, func(t *testing.T) {
			var calls []call
			if err := Run(context.Background(), t.TempDir(), fakeRunner(&calls, canaryFound, scan), &bytes.Buffer{}); err == nil {
				t.Fatal("failing tooling scan accepted")
			}
		})
	}
}

func TestCheckScanAcceptsOnlyACleanExit(t *testing.T) {
	for status, want := range map[int]bool{0: true, 1: false, 2: false, 3: false, -1: false} {
		if got := CheckScan(status) == nil; got != want {
			t.Errorf("CheckScan(%d) accepted = %v, want %v", status, got, want)
		}
	}
}

// pinnedGovulncheck matches the tool directive and an exact release of
// golang.org/x/vuln. The version itself lives only in go.mod, so an update
// moves it without a second record here.
var pinnedGovulncheck = regexp.MustCompile(`(?m)^\s*golang\.org/x/vuln v\d+\.\d+\.\d+( // indirect)?$`)

func govulncheckPinned(mod string) bool {
	return strings.Contains(mod, "tool golang.org/x/vuln/cmd/govulncheck") && pinnedGovulncheck.MatchString(mod)
}

func TestToolsModulePinsGovulncheck(t *testing.T) {
	content, err := os.ReadFile(filepath.Join("..", "..", "tools", "go.mod"))
	if err != nil {
		t.Fatal(err)
	}
	if !govulncheckPinned(string(content)) {
		t.Error("tooling/tools/go.mod lacks the govulncheck tool directive or an exact golang.org/x/vuln release")
	}
}

func TestGovulncheckPinRefusesLooseModules(t *testing.T) {
	const tool = "tool golang.org/x/vuln/cmd/govulncheck\n"
	for name, mod := range map[string]string{
		"no tool directive": "require golang.org/x/vuln v1.9.0\n",
		"no requirement":    tool,
		"pseudo-version":    tool + "\tgolang.org/x/vuln v0.0.0-20261010193011-f71dc92da45e // indirect\n",
		"pre-release":       tool + "\tgolang.org/x/vuln v1.9.0-rc.1 // indirect\n",
	} {
		if govulncheckPinned(mod) {
			t.Errorf("%s: accepted %q", name, mod)
		}
	}
	if !govulncheckPinned(tool + "\tgolang.org/x/vuln v1.9.0 // indirect\n") {
		t.Error("exact release refused")
	}
}
