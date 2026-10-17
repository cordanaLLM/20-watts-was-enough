package clrsshakedown

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"reflect"
	"runtime"
	"strings"
	"time"

	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/clrsfixture"
)

// RunContainer runs and checks one development bundle in two isolated containers.
// It accepts only an operator-trusted, already-loaded image: this is not a hostile
// image sandbox, registry acquisition, image admission or an energy measurement.
func RunContainer(ctx context.Context, options ContainerOptions) (ContainerReport, error) {
	return runContainer(ctx, options, localContainerDocker)
}

func newContainerReport(options ContainerOptions) ContainerReport {
	return ContainerReport{SchemaVersion: 1, Authority: "NO_RESULT", State: "incomplete", RunID: options.RunID,
		ImageID: options.ImageID, Platform: containerPlatform, DockerEndpoint: containerEndpoint, UID: os.Geteuid(), GID: os.Getegid(),
		Started: time.Now().UTC(), Phases: []ContainerPhase{}, Commands: []string{},
		Limits: containerLimitReport(),
		Energy: UnavailableMeasurement{State: "unavailable", Reason: "No qualified whole-task energy measurement is collected."},
		Limitations: []string{
			"Unsigned local execution witness; external command success is required and neither compilation nor third-party execution is authenticated.",
			"Operator-trusted already-loaded tooling image only; this is not a hostile-image sandbox or specialist-image admission.",
			"The writable outputs mount has no hard disk quota. Inner artifact bounds and host readback do not prevent arbitrary writes by an untrusted image.",
			"Fixed Docker CPU, memory, PID and log limits are execution constraints, not complete resource or energy accounting.",
			"Operator-owned filesystem and daemon; blocked filesystem calls and hostile same-user mutations are outside this boundary.",
			"Partial witness and bundle files are retained without overwrite or automatic garbage collection; cleanup failure requires operator action.",
			"Witness files are host-written, not confidential: an output beneath the repository is also visible through the read-only repository mount, never through a writable mount.",
			"The terminal witness precedes its own write and final file closes; later I/O failures remain external command failures, not rewritten success evidence.",
			"Each in-flight Docker command has a bounded process/pipe-wait allowance after cancellation or process exit; work and cleanup seconds are context deadlines, not hard end-to-end wall limits.",
		}}
}

func containerLimitReport() ContainerLimits {
	return ContainerLimits{WorkSeconds: int(containerWorkTimeout / time.Second), CleanupSeconds: int(containerCleanupTimeout / time.Second),
		ExecuteSeconds: int(containerExecuteTimeout / time.Second), CheckSeconds: int(containerCheckTimeout / time.Second), ControlSeconds: int(containerControlTimeout / time.Second),
		StopGraceSeconds: int(containerStopGrace / time.Second), ProcessWaitDelayMillis: int(containerProcessWaitDelay / time.Millisecond), MaximumWorkCommands: containerWorkCommands, MaximumCleanupCommands: containerCleanupCommands,
		MaximumWitnessBytes: containerWitnessBytes, MaximumControlBytes: containerControlBytes, MaximumAttachedBytes: containerAttachedBytes,
		CPUMillis: containerCPUMillis, MemoryBytes: containerMemoryBytes, PIDs: containerPIDs}
}

func runContainer(ctx context.Context, options ContainerOptions, execute containerExecutor) (report ContainerReport, err error) {
	report = newContainerReport(options)
	defer func() {
		if report.Finished.IsZero() {
			report.Finished = time.Now().UTC()
		}
		if err != nil {
			report.State, report.Error = "incomplete", diagnostic(err)
		}
	}()
	if ctx == nil {
		return report, errors.New("container execution requires a context")
	}
	if runtime.GOOS != "linux" || report.UID <= 0 || report.GID <= 0 {
		return report, errors.New("container execution requires a non-root Linux operator")
	}
	if execute == nil {
		return report, errors.New("container executor is required")
	}
	ctx, cancel := context.WithTimeout(ctx, containerWorkTimeout)
	defer cancel()
	options, tree, err := resolveContainerOptions(ctx, options)
	if err != nil {
		return report, err
	}
	root, witness, err := createContainerOutput(options)
	if err != nil {
		return report, err
	}
	report.OutputDirectory, report.Bundle = options.OutputDirectory, filepath.Join(options.OutputDirectory, "outputs", "run")
	r := &containerRunner{options: options, report: &report, witness: witness, execute: execute}
	defer func() { err = r.finish(ctx, root, err) }()
	identity := make([]byte, 12)
	if _, err := rand.Read(identity); err != nil {
		return report, err
	}
	r.owner = "20w-clrs-" + hex.EncodeToString(identity)
	for i, name := range []string{"execute", "check"} {
		r.phases[i] = containerPhaseState{ContainerPhase: ContainerPhase{Name: r.owner + "-" + name, ExternalExit: -1, ContainerExit: -1}, check: i == 1}
	}
	if err := r.preflight(ctx); err != nil {
		return report, err
	}
	if err := r.runAndCheck(ctx); err != nil {
		return report, err
	}
	if err := tree.Recheck(ctx); err != nil {
		return report, err
	}
	report.InputsRechecked, report.State = true, "container-bundle-consistent-unadmitted"
	return report, ctx.Err()
}

// resolveContainerOptions validates the operator options, loads the frozen
// tree and returns the options with resolved repository, dataset and output
// paths, validated again after resolution.
func resolveContainerOptions(ctx context.Context, options ContainerOptions) (ContainerOptions, clrsfixture.FixtureTree, error) {
	if err := validateContainerOptions(options); err != nil {
		return options, clrsfixture.FixtureTree{}, err
	}
	tree, err := clrsfixture.LoadFixtureTree(ctx, clrsfixture.FixtureTreeOptions{RepositoryRoot: options.RepositoryRoot, DatasetDirectory: options.DatasetDirectory, ExpectedTreeSHA256: options.ExpectedTreeSHA256})
	if err != nil {
		return options, tree, err
	}
	options.RepositoryRoot, options.DatasetDirectory = tree.RepositoryRoot, tree.DatasetDirectory
	options.OutputDirectory, err = resolveOutput(options.Options)
	if err != nil {
		return options, tree, err
	}
	return options, tree, validateContainerOptions(options)
}

// finish cleans up the owned containers, records the phases and final state,
// writes the host witness receipt and closes both roots. It returns err
// joined with every failure met on the way.
func (r *containerRunner) finish(ctx context.Context, root *os.Root, err error) error {
	report := r.report
	cleanupErr := r.cleanup()
	report.CleanupError = diagnostic(cleanupErr)
	err = errors.Join(err, cleanupErr, checkBundleRoot(root), checkBundleRoot(r.witness), ctx.Err())
	for i := range r.phases {
		report.Phases = append(report.Phases, r.phases[i].ContainerPhase)
	}
	report.Finished = time.Now().UTC()
	if err != nil {
		report.State, report.Error = "incomplete", diagnostic(err)
	}
	body, encodeErr := MarshalContainerReport(*report)
	if encodeErr == nil {
		encodeErr = r.writeWitness("receipt.json", body)
	}
	return errors.Join(err, encodeErr, r.witness.Close(), root.Close())
}

func validateContainerOptions(options ContainerOptions) error {
	if err := validateOptions(options.Options); err != nil {
		return err
	}
	if !strings.HasPrefix(options.ImageID, "sha256:") || !validDigest(strings.TrimPrefix(options.ImageID, "sha256:")) {
		return errors.New("container execution requires an exact already-loaded sha256 image ID, not a tag")
	}
	for _, value := range []string{options.RepositoryRoot, options.DatasetDirectory, options.OutputDirectory} {
		if len(value) > 4096 || strings.ContainsAny(value, "\x00\r\n,") {
			return errors.New("container paths exceed bounds or contain mount-syntax delimiters")
		}
	}
	return nil
}

func createContainerOutput(options ContainerOptions) (*os.Root, *os.Root, error) {
	root, err := newBundle(options.Options)
	if err != nil {
		return nil, nil, err
	}
	for _, name := range []string{"witness", "outputs", "witness/docker-config"} {
		if err := root.Mkdir(name, 0o700); err != nil {
			return nil, nil, errors.Join(err, root.Close())
		}
	}
	witness, err := root.OpenRoot("witness")
	if err != nil {
		return nil, nil, errors.Join(err, root.Close())
	}
	if err := clrsfixture.SyncDirectory(root, "."); err != nil {
		return nil, nil, errors.Join(err, witness.Close(), root.Close())
	}
	return root, witness, nil
}

func (r *containerRunner) checkedBundle(ctx context.Context) (Report, FileIdentity, error) {
	options := r.options.Options
	options.OutputDirectory = r.report.Bundle
	// Check verifies retained executable identity internally; it deliberately does
	// not compare that identity with this host process's different executable.
	report, err := Check(ctx, options)
	if err != nil {
		return report, FileIdentity{}, err
	}
	root, err := openDirectory(options.OutputDirectory)
	if err != nil {
		return report, FileIdentity{}, err
	}
	body, readErr := readFile(ctx, root, "receipt.json", maximumReportBytes)
	return report, identify(body), errors.Join(readErr, root.Close())
}

func (r *containerRunner) runAndCheck(ctx context.Context) error {
	executed, err := r.runPhase(ctx, &r.phases[0])
	if err != nil {
		return fmt.Errorf("execute container: %w", err)
	}
	first, identity, err := r.checkedBundle(ctx)
	if err != nil {
		return err
	}
	want := first
	want.State = "completed-unadmitted"
	if err := compareContainerReport(executed, want); err != nil {
		return err
	}
	checked, err := r.runPhase(ctx, &r.phases[1])
	if err != nil {
		return fmt.Errorf("check container: %w", err)
	}
	if err := compareContainerReport(checked, first); err != nil {
		return err
	}
	final, finalIdentity, err := r.checkedBundle(ctx)
	if err != nil {
		return err
	}
	if !reflect.DeepEqual(first, final) || identity != finalIdentity {
		return errors.New("inner bundle changed during its read-only container check")
	}
	r.report.InnerReceipt, r.report.Cases, r.report.Events = identity, len(final.Cases), len(final.Events)
	return nil
}

func compareContainerReport(result containerCommandResult, expected Report) error {
	var actual Report
	if len(result.Stderr) != 0 {
		return errors.New("successful inner shakedown unexpectedly wrote stderr")
	}
	if err := decode(result.Stdout, &actual); err != nil {
		return fmt.Errorf("inner container report: %w", err)
	}
	if !reflect.DeepEqual(actual, expected) {
		return errors.New("inner container output differs from host-checked retained bundle")
	}
	return nil
}
