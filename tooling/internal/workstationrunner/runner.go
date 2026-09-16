// Package workstationrunner executes the closed workstation test catalogue.
package workstationrunner

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/ciplan"
)

const (
	expectedArtifactJobs         = 19
	maximumSuiteJobs             = 32
	defaultConcurrency           = 4
	maximumConcurrency           = 8
	maximumJobDuration           = 30 * time.Minute
	maximumJobOutputBytes        = 2 << 20
	maximumCommandWaitDelay      = 2 * time.Second
	maximumJobArguments          = 32
	maximumJobArgumentBytes      = 8 << 10
	maximumJobArgumentsBytes     = 64 << 10
	maximumEnvironmentEntries    = 32
	maximumEnvironmentBytes      = 64 << 10
	maximumEnvironmentValueBytes = 8 << 10
	maximumPackageManifestBytes  = 1 << 20
)

var allowedEnvironmentNames = map[string]struct{}{
	"APPDATA": {}, "CI": {}, "COMSPEC": {}, "FORCE_COLOR": {}, "HOME": {},
	"LANG": {}, "LC_ALL": {}, "LC_CTYPE": {}, "LOCALAPPDATA": {},
	"NO_COLOR": {}, "PATH": {}, "PATHEXT": {}, "SYSTEMROOT": {}, "TEMP": {},
	"TMP": {}, "TMPDIR": {}, "TZ": {}, "HOMEDRIVE": {}, "HOMEPATH": {},
	"SYSTEMDRIVE": {}, "USERPROFILE": {}, "WINDIR": {}, "XDG_CACHE_HOME": {},
}

type job struct {
	artifact  string
	script    string
	arguments []string
}

type runOptions struct {
	concurrency int
	jobDuration time.Duration
	outputBytes int
	waitDelay   time.Duration
	executable  string
	environment []string
}

type resultStatus string

const (
	statusPassed    resultStatus = "PASS"
	statusFailed    resultStatus = "FAIL"
	statusCancelled resultStatus = "CANCELLED"
)

type jobResult struct {
	job      job
	status   resultStatus
	detail   string
	output   []byte
	exceeded bool
}

type boundedOutput struct {
	mutex    sync.Mutex
	buffer   bytes.Buffer
	limit    int
	exceeded bool
	cancel   context.CancelFunc
}

func newBoundedOutput(limit int, cancel context.CancelFunc) *boundedOutput {
	return &boundedOutput{limit: limit, cancel: cancel}
}

func (output *boundedOutput) Write(body []byte) (int, error) {
	output.mutex.Lock()
	available := output.limit - output.buffer.Len()
	if available > len(body) {
		available = len(body)
	}
	if available > 0 {
		_, _ = output.buffer.Write(body[:available])
	}
	firstOverflow := available < len(body) && !output.exceeded
	if available < len(body) {
		output.exceeded = true
	}
	output.mutex.Unlock()
	if firstOverflow {
		output.cancel()
	}
	return len(body), nil
}

func (output *boundedOutput) snapshot() ([]byte, bool) {
	output.mutex.Lock()
	defer output.mutex.Unlock()
	return bytes.Clone(output.buffer.Bytes()), output.exceeded
}

// Run executes core and every closed artifact script, then writes one ordered
// summary. Ordinary job failures do not cancel the remaining catalogue.
func Run(ctx context.Context, repositoryRoot string, summary io.Writer) error {
	if ctx == nil {
		return errors.New("workstation runner requires a context")
	}
	if summary == nil {
		return errors.New("workstation runner requires a summary writer")
	}
	root, err := resolveRepositoryRoot(repositoryRoot)
	if err != nil {
		return err
	}
	jobs, err := productionJobs()
	if err != nil {
		return err
	}
	jobs, err = freezeWorkstationInventory(root, jobs)
	if err != nil {
		return fmt.Errorf("freeze workstation inventory: %w", err)
	}
	nodeExecutable, err := exec.LookPath("node")
	if err != nil {
		return errors.New("locate Node executable")
	}
	nodeExecutable, err = filepath.Abs(nodeExecutable)
	if err != nil {
		return fmt.Errorf("resolve Node executable: %w", err)
	}
	return runSuite(ctx, root, jobs, runOptions{
		concurrency: defaultConcurrency,
		jobDuration: maximumJobDuration,
		outputBytes: maximumJobOutputBytes,
		waitDelay:   maximumCommandWaitDelay,
		executable:  nodeExecutable,
		environment: os.Environ(),
	}, summary)
}

func productionJobs() ([]job, error) {
	coreScript, artifacts, err := ciplan.WorkstationCatalogue()
	if err != nil {
		return nil, fmt.Errorf("load workstation job catalogue: %w", err)
	}
	if len(artifacts) != expectedArtifactJobs {
		return nil, fmt.Errorf(
			"workstation catalogue contains %d artifact jobs, want %d",
			len(artifacts),
			expectedArtifactJobs,
		)
	}
	jobs := make([]job, 1, len(artifacts)+1)
	jobs[0] = job{artifact: "core", script: coreScript}
	for _, artifact := range artifacts {
		jobs = append(jobs, job{artifact: artifact.Artifact, script: artifact.Script})
	}
	return jobs, nil
}

func runSuite(
	ctx context.Context,
	root string,
	jobs []job,
	options runOptions,
	summary io.Writer,
) error {
	if err := validateRunOptions(jobs, options); err != nil {
		return err
	}
	environment, err := filteredEnvironment(options.environment)
	if err != nil {
		return fmt.Errorf("prepare bounded workstation environment: %w", err)
	}
	options.environment = environment
	if _, err := fmt.Fprintf(
		summary,
		"Workstation suite: running %d jobs with at most %d concurrent commands; timeout %s and combined output limit %d bytes per job.\n",
		len(jobs),
		options.concurrency,
		options.jobDuration,
		options.outputBytes,
	); err != nil {
		return fmt.Errorf("write workstation plan: %w", err)
	}
	results := executeJobs(ctx, root, jobs, options)
	failed, cancelled := countIncomplete(results)
	writeErr := writeSummary(summary, results)
	var suiteErr error
	if failed > 0 || cancelled > 0 {
		suiteErr = fmt.Errorf(
			"workstation suite incomplete: %d failed, %d cancelled out of %d jobs",
			failed,
			cancelled,
			len(results),
		)
	}
	if writeErr != nil {
		writeErr = fmt.Errorf("write workstation summary: %w", writeErr)
	}
	return errors.Join(suiteErr, writeErr)
}

func validateRunOptions(jobs []job, options runOptions) error {
	if len(jobs) == 0 || len(jobs) > maximumSuiteJobs {
		return fmt.Errorf("workstation suite contains %d jobs, limit is 1..%d", len(jobs), maximumSuiteJobs)
	}
	if options.concurrency < 1 || options.concurrency > maximumConcurrency {
		return fmt.Errorf("workstation concurrency %d is outside 1..%d", options.concurrency, maximumConcurrency)
	}
	if options.jobDuration <= 0 || options.jobDuration > maximumJobDuration {
		return fmt.Errorf("workstation job duration %s is outside (0,%s]", options.jobDuration, maximumJobDuration)
	}
	if options.outputBytes < 1 || options.outputBytes > maximumJobOutputBytes {
		return fmt.Errorf("workstation output limit %d is outside 1..%d", options.outputBytes, maximumJobOutputBytes)
	}
	if options.waitDelay <= 0 || options.waitDelay > maximumCommandWaitDelay {
		return fmt.Errorf("workstation wait delay %s is outside (0,%s]", options.waitDelay, maximumCommandWaitDelay)
	}
	if options.executable == "" {
		return errors.New("workstation runner requires an executable")
	}
	seenArtifacts := make(map[string]struct{}, len(jobs))
	seenScripts := make(map[string]struct{}, len(jobs))
	for _, current := range jobs {
		if current.artifact == "" || current.script == "" {
			return errors.New("workstation job has an empty artifact or script")
		}
		if len(current.arguments) == 0 || len(current.arguments) > maximumJobArguments {
			return fmt.Errorf(
				"workstation job %q contains %d arguments, limit is 1..%d",
				current.artifact,
				len(current.arguments),
				maximumJobArguments,
			)
		}
		argumentBytes := 0
		for _, argument := range current.arguments {
			if argument == "" || strings.IndexByte(argument, 0) >= 0 || len(argument) > maximumJobArgumentBytes {
				return fmt.Errorf("workstation job %q contains an invalid argument", current.artifact)
			}
			argumentBytes += len(argument)
		}
		if argumentBytes > maximumJobArgumentsBytes {
			return fmt.Errorf(
				"workstation job %q arguments exceed %d bytes",
				current.artifact,
				maximumJobArgumentsBytes,
			)
		}
		if _, duplicate := seenArtifacts[current.artifact]; duplicate {
			return fmt.Errorf("workstation artifact is repeated: %q", current.artifact)
		}
		if _, duplicate := seenScripts[current.script]; duplicate {
			return fmt.Errorf("workstation script is repeated: %q", current.script)
		}
		seenArtifacts[current.artifact] = struct{}{}
		seenScripts[current.script] = struct{}{}
	}
	return nil
}

func executeJobs(ctx context.Context, root string, jobs []job, options runOptions) []jobResult {
	results := make([]jobResult, len(jobs))
	work := make(chan int)
	workerCount := options.concurrency
	if workerCount > len(jobs) {
		workerCount = len(jobs)
	}
	var workers sync.WaitGroup
	workers.Add(workerCount)
	for range workerCount {
		go func() {
			defer workers.Done()
			for index := range work {
				results[index] = executeJob(ctx, root, jobs[index], options)
			}
		}()
	}

	next := 0
dispatch:
	for next < len(jobs) {
		select {
		case work <- next:
			next++
		case <-ctx.Done():
			break dispatch
		}
	}
	close(work)
	for index := next; index < len(jobs); index++ {
		results[index] = cancelledResult(jobs[index], ctx.Err())
	}
	workers.Wait()
	return results
}

func executeJob(ctx context.Context, root string, current job, options runOptions) jobResult {
	if err := ctx.Err(); err != nil {
		return cancelledResult(current, err)
	}
	jobContext, cancel := context.WithTimeout(ctx, options.jobDuration)
	defer cancel()
	output := newBoundedOutput(options.outputBytes, cancel)
	command := exec.CommandContext(jobContext, options.executable, current.arguments...)
	command.Dir = root
	command.Env = options.environment
	command.Stdout = output
	command.Stderr = output
	command.WaitDelay = options.waitDelay
	tree, err := configureProcessTree(command)
	if err != nil {
		return jobResult{
			job: current, status: statusFailed,
			detail: fmt.Sprintf("configure bounded process tree: %v", err),
		}
	}
	if err := command.Start(); err != nil {
		return failedJobResult(current, errors.Join(err, tree.cleanup()))
	}
	if err := tree.attach(); err != nil {
		killErr := command.Process.Kill()
		waitErr := command.Wait()
		return failedJobResult(current, errors.Join(
			fmt.Errorf("attach bounded process tree: %w", err),
			killErr,
			waitErr,
			tree.cleanup(),
		))
	}
	runErr := command.Wait()
	cleanupErr := tree.cleanup()
	captured, exceeded := output.snapshot()
	result := jobResult{job: current, output: captured, exceeded: exceeded}
	switch {
	case cleanupErr != nil:
		result.status = statusFailed
		result.detail = errors.Join(runErr, fmt.Errorf("clean bounded process tree: %w", cleanupErr)).Error()
	case exceeded:
		result.status = statusFailed
		result.detail = fmt.Sprintf("combined output exceeded %d bytes", options.outputBytes)
	case runErr == nil:
		result.status = statusPassed
	case ctx.Err() != nil:
		return cancelledResultWithOutput(current, ctx.Err(), captured)
	case errors.Is(jobContext.Err(), context.DeadlineExceeded):
		result.status = statusFailed
		result.detail = fmt.Sprintf("exceeded %s timeout", options.jobDuration)
	default:
		result.status = statusFailed
		result.detail = runErr.Error()
	}
	return result
}

func failedJobResult(current job, err error) jobResult {
	detail := "command failed"
	if err != nil {
		detail = err.Error()
	}
	return jobResult{job: current, status: statusFailed, detail: detail}
}

func cancelledResult(current job, err error) jobResult {
	return cancelledResultWithOutput(current, err, nil)
}

func cancelledResultWithOutput(current job, err error, output []byte) jobResult {
	detail := context.Canceled.Error()
	if err != nil {
		detail = err.Error()
	}
	return jobResult{job: current, status: statusCancelled, detail: detail, output: output}
}

func countIncomplete(results []jobResult) (failed, cancelled int) {
	for _, result := range results {
		switch result.status {
		case statusFailed:
			failed++
		case statusCancelled:
			cancelled++
		}
	}
	return failed, cancelled
}

func writeSummary(writer io.Writer, results []jobResult) error {
	passed := 0
	failed := 0
	cancelled := 0
	for _, result := range results {
		if _, writeErr := fmt.Fprintf(writer, "%s %s (%s)", result.status, result.job.artifact, result.job.script); writeErr != nil {
			return writeErr
		}
		if result.detail != "" {
			if _, writeErr := fmt.Fprintf(writer, ": %s", result.detail); writeErr != nil {
				return writeErr
			}
		}
		if _, writeErr := io.WriteString(writer, "\n"); writeErr != nil {
			return writeErr
		}
		switch result.status {
		case statusPassed:
			passed++
		case statusFailed:
			failed++
		case statusCancelled:
			cancelled++
		}
		if result.status != statusPassed && len(result.output) > 0 {
			if _, writeErr := fmt.Fprintf(writer, "--- %s output ---\n", result.job.artifact); writeErr != nil {
				return writeErr
			}
			if _, writeErr := writer.Write(result.output); writeErr != nil {
				return writeErr
			}
			if result.output[len(result.output)-1] != '\n' {
				if _, writeErr := io.WriteString(writer, "\n"); writeErr != nil {
					return writeErr
				}
			}
			if _, writeErr := fmt.Fprintf(writer, "--- end %s output ---\n", result.job.artifact); writeErr != nil {
				return writeErr
			}
		}
	}
	_, err := fmt.Fprintf(
		writer,
		"Workstation suite: %d passed, %d failed, %d cancelled.\n",
		passed,
		failed,
		cancelled,
	)
	return err
}

func filteredEnvironment(environment []string) ([]string, error) {
	values := make(map[string]string, len(allowedEnvironmentNames))
	for _, entry := range environment {
		if entry == "" {
			return nil, errors.New("environment contains a malformed entry")
		}
		// Windows drive-current-directory entries begin with '='; find the
		// separator after the first byte so they can be discarded by the allowlist.
		separator := strings.IndexByte(entry[1:], '=')
		if separator < 0 {
			return nil, errors.New("environment contains a malformed entry")
		}
		separator++
		name, value := entry[:separator], entry[separator+1:]
		canonicalName := strings.ToUpper(name)
		if _, allowed := allowedEnvironmentNames[canonicalName]; !allowed {
			continue
		}
		if _, duplicate := values[canonicalName]; duplicate {
			return nil, fmt.Errorf("environment repeats %s", canonicalName)
		}
		if strings.IndexByte(value, 0) >= 0 {
			return nil, fmt.Errorf("environment value for %s contains NUL", canonicalName)
		}
		if len(value) > maximumEnvironmentValueBytes {
			return nil, fmt.Errorf("environment value for %s exceeds %d bytes", canonicalName, maximumEnvironmentValueBytes)
		}
		values[canonicalName] = value
	}
	if values["PATH"] == "" {
		return nil, errors.New("environment requires a non-empty PATH")
	}
	if len(values) > maximumEnvironmentEntries {
		return nil, fmt.Errorf("environment contains %d retained entries, limit is %d", len(values), maximumEnvironmentEntries)
	}
	names := make([]string, 0, len(values))
	for name := range values {
		names = append(names, name)
	}
	sort.Strings(names)
	filtered := make([]string, 0, len(names))
	totalBytes := 0
	for _, name := range names {
		entry := name + "=" + values[name]
		totalBytes += len(entry)
		if totalBytes > maximumEnvironmentBytes {
			return nil, fmt.Errorf("environment exceeds %d retained bytes", maximumEnvironmentBytes)
		}
		filtered = append(filtered, entry)
	}
	return filtered, nil
}

func resolveRepositoryRoot(root string) (string, error) {
	if root == "" {
		return "", errors.New("workstation runner requires a repository root")
	}
	absolute, err := filepath.Abs(root)
	if err != nil {
		return "", fmt.Errorf("resolve repository root: %w", err)
	}
	resolved, err := filepath.EvalSymlinks(absolute)
	if err != nil {
		return "", fmt.Errorf("resolve repository root symlinks: %w", err)
	}
	if !sameCanonicalPath(absolute, resolved) {
		return "", errors.New("repository root must not traverse symlinks")
	}
	information, err := os.Lstat(resolved)
	if err != nil {
		return "", fmt.Errorf("inspect repository root: %w", err)
	}
	if !information.IsDir() || information.Mode()&os.ModeSymlink != 0 {
		return "", errors.New("repository root is not a real directory")
	}
	packagePath := filepath.Join(resolved, "package.json")
	packageInformation, err := os.Lstat(packagePath)
	if err != nil {
		return "", fmt.Errorf("inspect package.json: %w", err)
	}
	if !packageInformation.Mode().IsRegular() || packageInformation.Size() <= 0 || packageInformation.Size() > maximumPackageManifestBytes {
		return "", fmt.Errorf("package.json is not a regular file of at most %d bytes", maximumPackageManifestBytes)
	}
	return resolved, nil
}
