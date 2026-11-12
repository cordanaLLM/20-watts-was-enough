// Package pinnednode runs the pre-push gate with the repository's Node pin.
package pinnednode

import (
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/boundedexec"
)

const (
	PinFile           = ".node-version"
	maximumPinBytes   = 64
	InstallDeadline   = 10 * time.Minute
	QueryDeadline     = time.Minute
	outputLimit       = 64 * 1024
	failureTail       = 2048
	AdmitWait         = 30 * time.Minute
	AdmitTimeout      = 3 * time.Hour
	RunDeadline       = InstallDeadline + 2*QueryDeadline + AdmitWait + AdmitTimeout + 5*time.Minute
	GeneratedGateLine = "sh .config/lefthook/engine.sh gate run --path=. --admit-unsupported"
)

// GateArgv replays the generated gate command under the pinned engine's admit.
var GateArgv = []string{
	"sh", ".config/lefthook/engine.sh", "admit", "--label", "pre-push-gate",
	"--wait", "30m", "--timeout", "3h", "--",
	"sh", ".config/lefthook/engine.sh", "gate", "run", "--path=.", "--admit-unsupported",
}

var pinPattern = regexp.MustCompile(`^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\n?$`)

// Deps isolates tool discovery, subprocesses, and the caller's environment.
type Deps struct {
	LookPath func(string) (string, error)
	Output   func(ctx context.Context, dir string, env []string, name string, args ...string) (int, []byte, error)
	Exec     func(ctx context.Context, dir string, env []string, argv []string, stdout, stderr io.Writer) (int, error)
	CacheDir func() (string, error)
	Environ  func() []string
}

// ReadPin accepts one exact numeric release, with an optional final LF.
func ReadPin(root string) (string, error) {
	name := filepath.Join(root, PinFile)
	directory, err := os.OpenRoot(root)
	if err != nil {
		return "", fmt.Errorf("read %s: %w", name, err)
	}
	content, err := readPinFile(directory)
	if err = errors.Join(err, directory.Close()); err != nil {
		return "", fmt.Errorf("read %s: %w", name, err)
	}
	if len(content) > maximumPinBytes {
		return "", fmt.Errorf("%s exceeds %d bytes: %q (truncated)", name, maximumPinBytes, content[:maximumPinBytes])
	}
	if !pinPattern.Match(content) {
		return "", fmt.Errorf("%s must contain one MAJOR.MINOR.PATCH release: %q", name, content)
	}
	return strings.TrimSuffix(string(content), "\n"), nil
}

// readPinFile reads at most one byte past the pin limit. It refuses a symlink
// or other non-regular file, and a file replaced between inspection and open.
func readPinFile(directory *os.Root) ([]byte, error) {
	before, err := directory.Lstat(PinFile)
	if err != nil {
		return nil, err
	}
	if !before.Mode().IsRegular() {
		return nil, fmt.Errorf("not a regular file (mode %s); symlinks are refused", before.Mode())
	}
	file, err := directory.Open(PinFile)
	if err != nil {
		return nil, err
	}
	opened, statErr := file.Stat()
	content, readErr := io.ReadAll(io.LimitReader(file, maximumPinBytes+1))
	if err := errors.Join(statErr, readErr, file.Close()); err != nil {
		return nil, err
	}
	if !os.SameFile(before, opened) {
		return nil, errors.New("replaced while it was opened")
	}
	return content, nil
}

// ExecDeps returns bounded process implementations without changing global state.
func ExecDeps() Deps {
	return Deps{LookPath: exec.LookPath, Output: commandOutput, Exec: commandExec,
		CacheDir: os.UserCacheDir, Environ: os.Environ}
}

// commandOutput returns the first outputLimit bytes on success and the final
// failureTail bytes otherwise, so a reason printed after long output survives.
func commandOutput(ctx context.Context, dir string, env []string, name string, args ...string) (int, []byte, error) {
	output := boundedexec.NewOutput(outputLimit)
	tail := newOutputTail(failureTail)
	writer := io.MultiWriter(output, tail)
	status, err := commandExec(ctx, dir, env, append([]string{name}, args...), writer, writer)
	if status != 0 || err != nil {
		return status, tail.Bytes(), err
	}
	body, overflow := output.Result()
	if overflow {
		return status, body, fmt.Errorf("%s output exceeds %d bytes", name, outputLimit)
	}
	return status, body, nil
}

func commandExec(ctx context.Context, dir string, env []string, argv []string, stdout, stderr io.Writer) (int, error) {
	command := exec.CommandContext(ctx, argv[0], argv[1:]...) //#nosec G204 -- fixed gate or discovered mise/node executable, validated by Run
	command.Dir, command.Env = dir, env
	command.Stdout, command.Stderr = stdout, stderr
	command.WaitDelay = 5 * time.Second
	cleanup, err := configureProcess(command)
	if err != nil {
		return 0, err
	}
	err = command.Run()
	cleanupErr := cleanup()
	if ctx.Err() != nil {
		return 0, fmt.Errorf("%s stopped: %w", argv[0], errors.Join(ctx.Err(), cleanupErr))
	}
	var exitError *exec.ExitError
	if errors.As(err, &exitError) {
		return exitError.ExitCode(), cleanupErr
	}
	if err = errors.Join(err, cleanupErr); err != nil {
		return 0, fmt.Errorf("run %s: %w", argv[0], err)
	}
	return 0, nil
}

func query(ctx context.Context, deps Deps, deadline time.Duration, root string, env []string, name string, args ...string) ([]byte, error) {
	ctx, cancel := context.WithTimeout(ctx, deadline)
	defer cancel()
	status, output, err := deps.Output(ctx, root, env, name, args...)
	if status == 0 && err == nil {
		return output, nil
	}
	if len(output) > failureTail {
		output = output[len(output)-failureTail:]
	}
	message := fmt.Sprintf("%s %s failed (exit %d): %s", filepath.Base(name), strings.Join(args, " "), status, output)
	if err != nil {
		return nil, fmt.Errorf("%s: %w", message, err)
	}
	return nil, errors.New(message)
}

func miseEnvironment(environment []string) []string {
	settings := []string{"MISE_IDIOMATIC_VERSION_FILE_ENABLE_TOOLS=node", "MISE_NODE_VERIFY=true", "MISE_NODE_GPG_VERIFY=true"}
	result := make([]string, 0, len(environment)+len(settings))
	for _, entry := range environment {
		key, _, _ := strings.Cut(entry, "=")
		if key != "MISE_IDIOMATIC_VERSION_FILE_ENABLE_TOOLS" && key != "MISE_NODE_VERIFY" && key != "MISE_NODE_GPG_VERIFY" {
			result = append(result, entry)
		}
	}
	return append(result, settings...)
}

func gateEnvironment(environment []string, nodeBin, cache string) []string {
	result := make([]string, 0, len(environment)+2)
	inheritedPath := ""
	for _, entry := range environment {
		key, value, _ := strings.Cut(entry, "=")
		if key == "PATH" {
			inheritedPath = value
		} else if !strings.EqualFold(key, "npm_config_cache") {
			result = append(result, entry)
		}
	}
	return append(result, "PATH="+nodeBin+string(os.PathListSeparator)+inheritedPath, "npm_config_cache="+cache)
}

func installNode(ctx context.Context, root, pin string, deps Deps, env []string) (string, error) {
	mise, err := deps.LookPath("mise")
	if err != nil {
		return "", fmt.Errorf("mise is not on PATH; the pre-push gate takes node %s from %s through mise (decision 0129): %w", pin, PinFile, err)
	}
	if _, err := query(ctx, deps, InstallDeadline, root, env, mise, "install", "node"); err != nil {
		return "", err
	}
	output, err := query(ctx, deps, QueryDeadline, root, env, mise, "where", "node")
	if err != nil {
		return "", err
	}
	directory := strings.TrimSpace(string(output))
	if !filepath.IsAbs(directory) || strings.ContainsAny(directory, "\r\n") {
		return "", fmt.Errorf("mise where node must return one absolute install directory; got %q", directory)
	}
	nodeBin := filepath.Join(directory, "bin")
	output, err = query(ctx, deps, QueryDeadline, root, env, filepath.Join(nodeBin, "node"), "--version")
	if err != nil {
		return "", err
	}
	if got := strings.TrimSpace(string(output)); got != "v"+pin {
		return "", fmt.Errorf("mise node at %s reports %q; %s pins %s", directory, got, PinFile, pin)
	}
	return nodeBin, nil
}

// Run installs and verifies the pin, then returns the admitted gate's status.
func Run(ctx context.Context, root string, deps Deps, stdout, stderr io.Writer) (int, error) {
	ctx, cancel := context.WithTimeout(ctx, RunDeadline)
	defer cancel()
	root, err := filepath.Abs(root)
	if err != nil {
		return 0, fmt.Errorf("resolve repository root: %w", err)
	}
	pin, err := ReadPin(root)
	if err != nil {
		return 0, err
	}
	environment := deps.Environ()
	nodeBin, err := installNode(ctx, root, pin, deps, miseEnvironment(environment))
	if err != nil {
		return 0, err
	}
	cache, err := deps.CacheDir()
	if err != nil {
		return 0, fmt.Errorf("find npm cache directory: %w", err)
	}
	cache = filepath.Join(cache, "20-watts-was-enough", "npm")
	if err := os.MkdirAll(cache, 0o700); err != nil {
		return 0, fmt.Errorf("create npm cache %s: %w", cache, err)
	}
	if _, err := fmt.Fprintf(stderr, "pinned-node-gate: node v%s from %s first on PATH; npm cache %s; gate under admit\n", pin, nodeBin, cache); err != nil {
		return 0, fmt.Errorf("write pinned-node gate diagnostic: %w", err)
	}
	status, err := deps.Exec(ctx, root, gateEnvironment(environment, nodeBin, cache), GateArgv, stdout, stderr)
	if err != nil {
		return status, fmt.Errorf("run admitted pre-push gate: %w", err)
	}
	return status, nil
}
