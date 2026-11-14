// Package workstationrunner executes the closed workstation test catalogue.
package workstationrunner

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/boundedexec"
	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/ciplan"
	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/fileidentity"
	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/strictjson"
)

const (
	expectedArtifactJobs         = 20
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
	maximumMemoryPeakBytes       = 32
	defaultScopePipeReadTimeout  = 2 * time.Second
)

var (
	errMissingShell      = errors.New("workstation runner requires a shell executable for scoped jobs")
	errEmptyMemoryReport = errors.New("did not report memory.peak")
)

// MaximumSuiteDuration bounds one Run: the largest catalogue runs in waves of
// the default concurrency, and each job may use its duration ceiling plus the
// wait delay.
const MaximumSuiteDuration = ((maximumSuiteJobs + defaultConcurrency - 1) / defaultConcurrency) *
	(maximumJobDuration + maximumCommandWaitDelay)

// allowedEnvironmentNames is the closed set of variables a suite job
// inherits. TWENTYW_FIXTURE_019_PYTHON names the lock-matching interpreter
// for the Fixture 019 tests (experiments/workstation/fixture-019/README.md).
var allowedEnvironmentNames = map[string]struct{}{
	"APPDATA": {}, "CI": {}, "COMSPEC": {}, "DBUS_SESSION_BUS_ADDRESS": {},
	"FORCE_COLOR": {}, "HOME": {}, "LANG": {}, "LC_ALL": {}, "LC_CTYPE": {},
	"LOCALAPPDATA": {}, "NO_COLOR": {}, "PATH": {}, "PATHEXT": {},
	"SYSTEMROOT": {}, "TEMP": {}, "TMP": {}, "TMPDIR": {}, "TZ": {},
	"HOMEDRIVE": {}, "HOMEPATH": {}, "SYSTEMDRIVE": {}, "USERPROFILE": {},
	"WINDIR": {}, "XDG_CACHE_HOME": {}, "XDG_RUNTIME_DIR": {},
	"TWENTYW_FIXTURE_019_PYTHON": {},
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
	shell       string
	environment []string
	profile     string
	systemdRun  string
	cgroupRoot  string
}

type resultStatus string

const (
	statusPassed    resultStatus = "PASS"
	statusFailed    resultStatus = "FAIL"
	statusCancelled resultStatus = "CANCELLED"
)

type jobResult struct {
	job       job
	status    resultStatus
	detail    string
	output    []byte
	exceeded  bool
	scopeUnit string
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
	shellExecutable, err := optionalExecutable("sh")
	if err != nil {
		return err
	}
	systemdRun, err := optionalExecutable("systemd-run")
	if err != nil {
		return err
	}
	return runSuite(ctx, root, jobs, runOptions{
		concurrency: defaultConcurrency,
		jobDuration: maximumJobDuration,
		outputBytes: maximumJobOutputBytes,
		waitDelay:   maximumCommandWaitDelay,
		executable:  nodeExecutable,
		shell:       shellExecutable,
		environment: os.Environ(),
		systemdRun:  systemdRun,
		cgroupRoot:  "/sys/fs/cgroup",
	}, summary)
}

// optionalExecutable resolves name on PATH to an absolute path. An absent
// executable yields "": only jobs that need it fail, with their own named error.
// Any other lookup error, such as a match through a relative PATH entry
// (exec.ErrDot), is returned.
func optionalExecutable(name string) (string, error) {
	lookedUp, err := exec.LookPath(name)
	if errors.Is(err, exec.ErrNotFound) {
		return "", nil
	}
	if err != nil {
		return "", fmt.Errorf("locate %s executable: %w", name, err)
	}
	resolved, err := filepath.Abs(lookedUp)
	if err != nil {
		return "", fmt.Errorf("resolve %s executable: %w", name, err)
	}
	return resolved, nil
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
	if options.profile != "" && options.profile != "smoke" && options.profile != "workstation" {
		return fmt.Errorf("workstation profile %q is not smoke or workstation", options.profile)
	}
	if options.executable == "" {
		return errors.New("workstation runner requires an executable")
	}
	return validateJobCatalogue(jobs)
}

func validateJobCatalogue(jobs []job) error {
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

type manifestHardwareProfile struct {
	CPU         string `json:"cpu,omitempty"`
	MemoryBytes *int64 `json:"memory_bytes,omitempty"`
	DiskBytes   *int64 `json:"disk_bytes,omitempty"`
	Energy      string `json:"energy,omitempty"`
}

type manifestOutputs struct {
	Directory string `json:"directory,omitempty"`
}

type manifestResourceDocument struct {
	Artifact string                             `json:"artifact"`
	Hardware map[string]manifestHardwareProfile `json:"hardware"`
	Outputs  *manifestOutputs                   `json:"outputs,omitempty"`
}

func loadManifestResourceDocument(manifestPath string) (*manifestResourceDocument, error) {
	body, err := readStableBoundedFile(manifestPath, maximumWorkstationManifestBytes)
	if err != nil {
		return nil, err
	}
	if err := strictjson.Validate(body, 64); err != nil {
		return nil, err
	}
	var doc manifestResourceDocument
	if err := json.Unmarshal(body, &doc); err != nil {
		return nil, err
	}
	return &doc, nil
}

func resolveActiveProfile(job job, options runOptions) string {
	for i := 0; i < len(job.arguments)-1; i++ {
		if job.arguments[i] == "--profile" {
			p := job.arguments[i+1]
			if p == "smoke" || p == "workstation" {
				return p
			}
		}
	}
	if options.profile == "smoke" || options.profile == "workstation" {
		return options.profile
	}
	if env := os.Getenv("WORKSTATION_PROFILE"); env == "smoke" || env == "workstation" {
		return env
	}
	return "workstation"
}

func sanitizeUnitName(name string) string {
	var builder strings.Builder
	for _, r := range name {
		switch {
		case r >= 'a' && r <= 'z', r >= 'A' && r <= 'Z', r >= '0' && r <= '9', r == '-', r == '_':
			builder.WriteRune(r)
		default:
			builder.WriteByte('-')
		}
	}
	res := builder.String()
	if res == "" {
		return "job"
	}
	return res
}

// scopeWrapperScript executes the job payload inside the systemd scope, closes
// file descriptor 3 for the payload, preserves the payload exit status (signal
// death produces 128+N under POSIX shells), and reports the scope's memory.peak
// to fd 3 while the scope cgroup is still alive before exiting.
const scopeWrapperScript = `root=$1
shift
"$@" 3>&-
status=$?
IFS= read -r membership </proc/self/cgroup || exit "$status"
case $membership in 0::/*) ;; *) exit "$status" ;; esac
cat -- "$root${membership#0::}/memory.peak" >&3
exit "$status"
`

// buildJobCommand returns the job's command and, for a job that declares
// memory_bytes, the scope unit name. Such a job runs under systemd-run in a
// transient scope with MemoryHigh set, wrapped by scopeWrapperScript; any
// other job runs the executable directly.
func buildJobCommand(
	ctx context.Context,
	current job,
	options runOptions,
	declaredMemoryBytes *int64,
	manifestArtifact string,
) (*exec.Cmd, string) {
	if declaredMemoryBytes != nil {
		scopeUnit := fmt.Sprintf("workstation-%s-%d.scope", sanitizeUnitName(manifestArtifact), time.Now().UnixNano())
		systemdRun := options.systemdRun
		if systemdRun == "" {
			if lookedUp, err := exec.LookPath("systemd-run"); err == nil {
				systemdRun = lookedUp
			} else {
				systemdRun = "systemd-run"
			}
		}
		cgroupRoot := options.cgroupRoot
		if cgroupRoot == "" {
			cgroupRoot = "/sys/fs/cgroup"
		}
		cmdArgs := []string{
			"--user",
			"--scope",
			"-p", fmt.Sprintf("MemoryHigh=%d", *declaredMemoryBytes),
			"--unit=" + scopeUnit,
			"--",
			options.shell,
			"-c",
			scopeWrapperScript,
			"workstation-scope",
			cgroupRoot,
			options.executable,
		}
		cmdArgs = append(cmdArgs, current.arguments...)
		return exec.CommandContext(ctx, systemdRun, cmdArgs...), scopeUnit //#nosec G204 -- bounded workstation execution with optional systemd resource containment
	}
	return exec.CommandContext(ctx, options.executable, current.arguments...), "" //#nosec G204 -- executable and argument slice from validated workstation inventory job
}

// scopeMemoryPipe carries the wrapper's memory.peak report. The child gets
// writeEnd as fd 3; the runner reads readEnd after the job exits.
type scopeMemoryPipe struct {
	readEnd  *os.File
	writeEnd *os.File
}

// openScopeMemoryPipe creates the report pipe for one scoped job.
func openScopeMemoryPipe() (*scopeMemoryPipe, error) {
	r, w, err := os.Pipe()
	if err != nil {
		return nil, fmt.Errorf("create memory report pipe: %w", err)
	}
	return &scopeMemoryPipe{readEnd: r, writeEnd: w}, nil
}

// closeAll releases the ends still open on early returns, where the job
// verdict is already set; readPeak closes both ends on the normal path.
func (p *scopeMemoryPipe) closeAll() error {
	if p == nil {
		return nil
	}
	var closeErrs []error
	for _, end := range []**os.File{&p.writeEnd, &p.readEnd} {
		if *end != nil {
			closeErrs = append(closeErrs, (*end).Close())
			*end = nil
		}
	}
	return errors.Join(closeErrs...)
}

// withPipeCloseError records a failed pipe release in the job detail. The
// verdict stays as set: only early returns, already failed or cancelled,
// leave ends open for closeAll.
func withPipeCloseError(result jobResult, closeErr error) jobResult {
	if closeErr == nil {
		return result
	}
	text := fmt.Sprintf("close memory report pipe: %v", closeErr)
	if result.detail == "" {
		result.detail = text
	} else {
		result.detail += "; " + text
	}
	return result
}

// attachJobIO binds the job's working directory, environment, output sink
// and wait delay to command.
func attachJobIO(command *exec.Cmd, root string, options runOptions, output io.Writer) {
	command.Dir = root
	command.Env = options.environment
	command.Stdout = output
	command.Stderr = output
	command.WaitDelay = options.waitDelay
}

// readPeak closes the parent's write end, so the read ends once the wrapper
// has exited, then reads the wrapper's report under a deadline.
func (p *scopeMemoryPipe) readPeak(waitDelay time.Duration, source string) (peak int64, returnErr error) {
	if p == nil || p.readEnd == nil {
		return 0, nil
	}
	defer func() {
		if p.readEnd != nil {
			if closeErr := p.readEnd.Close(); closeErr != nil {
				peak = 0
				returnErr = errors.Join(returnErr, closeErr)
			}
			p.readEnd = nil
		}
	}()
	if p.writeEnd != nil {
		writeCloseErr := p.writeEnd.Close()
		p.writeEnd = nil
		if writeCloseErr != nil {
			return 0, fmt.Errorf("close memory report writer: %w", writeCloseErr)
		}
	}
	timeout := waitDelay
	if timeout <= 0 {
		timeout = defaultScopePipeReadTimeout
	}
	if err := p.readEnd.SetReadDeadline(time.Now().Add(timeout)); err != nil {
		return 0, fmt.Errorf("set memory report deadline: %w", err)
	}
	return parseReportedMemoryPeak(p.readEnd, source)
}

// prepareJobCommand builds the job command and, for a job that declares
// memory_bytes, passes it the write end of a new report pipe as fd 3. Such a
// job fails with errMissingShell when no shell was resolved.
func prepareJobCommand(
	ctx context.Context,
	current job,
	options runOptions,
	declaredMemoryBytes *int64,
	manifestArtifact string,
) (*exec.Cmd, string, *scopeMemoryPipe, error) {
	if declaredMemoryBytes != nil && options.shell == "" {
		return nil, "", nil, errMissingShell
	}
	command, scopeUnit := buildJobCommand(ctx, current, options, declaredMemoryBytes, manifestArtifact)
	if declaredMemoryBytes == nil {
		return command, "", nil, nil
	}
	pipe, err := openScopeMemoryPipe()
	if err != nil {
		return nil, "", nil, err
	}
	command.ExtraFiles = []*os.File{pipe.writeEnd}
	return command, scopeUnit, pipe, nil
}

// parseReportedMemoryPeak reads at most maximumMemoryPeakBytes from r and
// parses them as a decimal byte count. Longer, empty or non-numeric content
// is an error; empty content wraps errEmptyMemoryReport.
func parseReportedMemoryPeak(r io.Reader, source string) (int64, error) {
	body, err := io.ReadAll(io.LimitReader(r, maximumMemoryPeakBytes+1))
	if err != nil {
		return 0, fmt.Errorf("read %s: %w", source, err)
	}
	if len(body) > maximumMemoryPeakBytes {
		return 0, fmt.Errorf("read %s: content exceeds %d bytes", source, maximumMemoryPeakBytes)
	}
	peakStr := strings.TrimSpace(string(body))
	if len(peakStr) == 0 {
		return 0, fmt.Errorf("read %s: %w", source, errEmptyMemoryReport)
	}
	parsed, err := strconv.ParseInt(peakStr, 10, 64)
	if err != nil {
		return 0, fmt.Errorf("parse %s: %w", source, err)
	}
	return parsed, nil
}

func measureDirectorySize(path string) (int64, error) {
	var totalBytes int64
	err := filepath.WalkDir(path, func(_ string, entry fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if entry.IsDir() {
			return nil
		}
		info, infoErr := entry.Info()
		if infoErr != nil {
			return infoErr
		}
		totalBytes += info.Size()
		return nil
	})
	if err != nil {
		if os.IsNotExist(err) {
			return 0, nil
		}
		return 0, err
	}
	return totalBytes, nil
}

func measureOutputDirectorySize(root string, current job, doc *manifestResourceDocument) (int64, error) {
	for i := 0; i < len(current.arguments)-1; i++ {
		if current.arguments[i] == "--output" {
			outputDir := current.arguments[i+1]
			if !filepath.IsAbs(outputDir) {
				outputDir = filepath.Join(root, outputDir)
			}
			return measureDirectorySize(outputDir)
		}
	}
	if doc != nil && doc.Outputs != nil && doc.Outputs.Directory != "" {
		pattern := doc.Outputs.Directory
		if !filepath.IsAbs(pattern) {
			pattern = filepath.Join(root, pattern)
		}
		if strings.Contains(pattern, "*") {
			matches, err := filepath.Glob(pattern)
			if err != nil {
				return 0, err
			}
			var total int64
			for _, match := range matches {
				size, err := measureDirectorySize(match)
				if err != nil {
					return 0, err
				}
				total += size
			}
			return total, nil
		}
		return measureDirectorySize(pattern)
	}
	return 0, nil
}

func loadJobHardware(
	root string,
	current job,
	options runOptions,
) (*manifestResourceDocument, string, *int64, *int64, error) {
	manifestArtifact := workstationManifestArtifact(current.artifact)
	if manifestArtifact == "core" {
		return nil, "", nil, nil, nil
	}
	manifestRelPath := filepath.Join("experiments", "workstation", "manifests", manifestArtifact+".json")
	manifestPath := filepath.Join(root, manifestRelPath)
	info, statErr := fileidentity.Lstat(manifestPath)
	if statErr != nil {
		if os.IsNotExist(statErr) {
			return nil, "", nil, nil, nil
		}
		return nil, "", nil, nil, fmt.Errorf("inspect manifest %s: %w", manifestRelPath, statErr)
	}
	if !info.Mode().IsRegular() {
		return nil, "", nil, nil, fmt.Errorf("manifest %s is not a regular file", manifestRelPath)
	}
	doc, loadErr := loadManifestResourceDocument(manifestPath)
	if loadErr != nil {
		return nil, "", nil, nil, fmt.Errorf("load manifest %s: %w", manifestRelPath, loadErr)
	}
	profile := resolveActiveProfile(current, options)
	var memoryBytes *int64
	var diskBytes *int64
	if doc.Hardware != nil {
		if hw, ok := doc.Hardware[profile]; ok {
			memoryBytes = hw.MemoryBytes
			diskBytes = hw.DiskBytes
		}
	}
	return doc, manifestRelPath, memoryBytes, diskBytes, nil
}

type resourceEnforcement struct {
	manifestRelPath     string
	scopeUnit           string
	declaredMemoryBytes *int64
	declaredDiskBytes   *int64
	observedMemoryPeak  int64
	memoryReportErr     error
	root                string
	job                 job
	doc                 *manifestResourceDocument
}

// enforceResourceLimits compares the job's reported memory peak and measured
// output size with the manifest's declared limits. It returns one violation
// per exceeded limit, missing report or failed measurement.
func enforceResourceLimits(enf resourceEnforcement) []string {
	var violations []string
	if enf.declaredMemoryBytes != nil && enf.scopeUnit != "" {
		if enf.memoryReportErr != nil {
			if errors.Is(enf.memoryReportErr, errEmptyMemoryReport) {
				violations = append(violations, fmt.Sprintf("scope %s did not report memory.peak", enf.scopeUnit))
			} else {
				violations = append(violations, fmt.Sprintf("read scope %s memory.peak: %v", enf.scopeUnit, enf.memoryReportErr))
			}
		} else if enf.observedMemoryPeak > *enf.declaredMemoryBytes {
			violations = append(violations, fmt.Sprintf(
				"manifest %s memory limit exceeded: declared %d bytes, observed peak %d bytes",
				filepath.ToSlash(enf.manifestRelPath), *enf.declaredMemoryBytes, enf.observedMemoryPeak,
			))
		}
	}
	if enf.declaredDiskBytes != nil {
		observedDisk, err := measureOutputDirectorySize(enf.root, enf.job, enf.doc)
		if err != nil {
			violations = append(violations, fmt.Sprintf("measure output directory: %v", err))
		} else if observedDisk > *enf.declaredDiskBytes {
			violations = append(violations, fmt.Sprintf(
				"manifest %s disk limit exceeded: declared %d bytes, observed %d bytes",
				filepath.ToSlash(enf.manifestRelPath), *enf.declaredDiskBytes, observedDisk,
			))
		}
	}
	return violations
}

func runProcessTree(command *exec.Cmd, tree processTree) (error, error) {
	if err := command.Start(); err != nil {
		return err, tree.cleanup()
	}
	if err := tree.attach(); err != nil {
		killErr := command.Process.Kill()
		waitErr := command.Wait()
		return errors.Join(fmt.Errorf("attach bounded process tree: %w", err), killErr, waitErr), tree.cleanup()
	}
	runErr := command.Wait()
	cleanupErr := tree.cleanup()
	return runErr, cleanupErr
}

type jobExecution struct {
	job        job
	runErr     error
	cleanupErr error
	captured   []byte
	exceeded   bool
	ctx        context.Context
	jobCtx     context.Context
	options    runOptions
	scopeUnit  string
}

func evaluateJobExit(exec jobExecution) jobResult {
	result := jobResult{
		job:       exec.job,
		output:    exec.captured,
		exceeded:  exec.exceeded,
		scopeUnit: exec.scopeUnit,
	}
	switch {
	case exec.cleanupErr != nil:
		result.status = statusFailed
		result.detail = errors.Join(exec.runErr, fmt.Errorf("clean bounded process tree: %w", exec.cleanupErr)).Error()
	case exec.exceeded:
		result.status = statusFailed
		result.detail = fmt.Sprintf("combined output exceeded %d bytes", exec.options.outputBytes)
	case exec.runErr == nil:
		result.status = statusPassed
	case exec.ctx.Err() != nil:
		return cancelledResultWithOutput(exec.job, exec.ctx.Err(), exec.captured)
	case errors.Is(exec.jobCtx.Err(), context.DeadlineExceeded):
		result.status = statusFailed
		result.detail = fmt.Sprintf("exceeded %s timeout", exec.options.jobDuration)
	default:
		result.status = statusFailed
		result.detail = exec.runErr.Error()
	}
	return result
}

func applyResourceViolations(result *jobResult, violations []string) {
	if len(violations) == 0 {
		return
	}
	result.status = statusFailed
	violationText := strings.Join(violations, "; ")
	if result.detail == "" {
		result.detail = violationText
	} else {
		result.detail = result.detail + "; " + violationText
	}
}

// executeJob runs one job under its timeout and output bound, then applies
// the manifest's memory and disk limits to a job that was not cancelled.
func executeJob(ctx context.Context, root string, current job, options runOptions) (result jobResult) {
	if err := ctx.Err(); err != nil {
		return cancelledResult(current, err)
	}
	manifestDoc, manifestRelPath, declaredMemory, declaredDisk, err := loadJobHardware(root, current, options)
	if err != nil {
		return failedJobResult(current, err)
	}
	manifestArtifact := workstationManifestArtifact(current.artifact)
	jobContext, cancel := context.WithTimeout(ctx, options.jobDuration)
	defer cancel()
	output := boundedexec.NewCancellingOutput(options.outputBytes, cancel)
	command, scopeUnit, pipe, err := prepareJobCommand(jobContext, current, options, declaredMemory, manifestArtifact)
	if err != nil {
		return failedJobResult(current, err)
	}
	defer func() { result = withPipeCloseError(result, pipe.closeAll()) }()
	attachJobIO(command, root, options, output)
	tree, err := configureProcessTree(command)
	if err != nil {
		return jobResult{
			job: current, status: statusFailed,
			detail:    fmt.Sprintf("configure bounded process tree: %v", err),
			scopeUnit: scopeUnit,
		}
	}
	runErr, cleanupErr := runProcessTree(command, tree)
	captured, exceeded := output.Result()
	result = evaluateJobExit(jobExecution{
		job:        current,
		runErr:     runErr,
		cleanupErr: cleanupErr,
		captured:   captured,
		exceeded:   exceeded,
		ctx:        ctx,
		jobCtx:     jobContext,
		options:    options,
		scopeUnit:  scopeUnit,
	})
	if result.status == statusCancelled {
		return result
	}
	observedPeak, peakErr := pipe.readPeak(options.waitDelay, "memory.peak")
	violations := enforceResourceLimits(resourceEnforcement{
		manifestRelPath:     manifestRelPath,
		scopeUnit:           scopeUnit,
		declaredMemoryBytes: declaredMemory,
		declaredDiskBytes:   declaredDisk,
		observedMemoryPeak:  observedPeak,
		memoryReportErr:     peakErr,
		root:                root,
		job:                 current,
		doc:                 manifestDoc,
	})
	applyResourceViolations(&result, violations)
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
