package clrsfixture

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"strconv"
	"strings"
	"time"
)

const generationOwnerLabel = "dev.20watts.clrs-generation-owner"
const generationDockerEndpoint = "unix:///var/run/docker.sock"
const generationCompletion = "CLRS_FIXED_GENERATION_COMPLETE_NO_RESULT\n"

func generationIdleArguments(runtime GeneratorRuntime) []string {
	return []string{"-B", "-c", fmt.Sprintf("import time; time.sleep(%d)", runtime.WallClockSeconds)}
}

func generationTmpfs(size int64) string {
	return fmt.Sprintf("rw,noexec,nosuid,nodev,size=%d,mode=1777", size)
}

func (runner *generationRunner) createArguments() []string {
	r := runner.inputs.authority.image.Runtime
	args := []string{"container", "create", "--name", runner.name, "--label", generationOwnerLabel + "=" + runner.name,
		"--pull=never", "--platform", "linux/amd64", "--runtime", "runc", "--network", r.Network,
		"--read-only", "--user", fmt.Sprintf("%d:%d", r.UID, r.GID), "--cap-drop", "ALL", "--security-opt", "no-new-privileges",
		"--cpus", strconv.FormatFloat(float64(r.CPUMillis)/1000, 'f', -1, 64), "--memory", strconv.FormatInt(r.MemoryBytes, 10),
		"--memory-swap", strconv.FormatInt(r.MemoryBytes, 10), "--pids-limit", strconv.Itoa(r.PIDs),
		"--tmpfs", r.TemporaryRoot + ":" + generationTmpfs(r.TemporaryBytes),
		"--tmpfs", r.OutputRoot + ":" + generationTmpfs(r.OutputBytes), "--ipc", "none", "--cgroupns", "private",
		"--restart", "no", "--stop-timeout", strconv.Itoa(r.StopGraceSeconds), "--stop-signal", "SIGTERM", "--log-driver", "none",
		"--workdir", r.WorkingDirectory, "--entrypoint", runner.inputs.invocation.PythonExecutable, runner.inputs.image.ID}
	return append(args, generationIdleArguments(r)...)
}

func (runner *generationRunner) execArguments(program string) []string {
	r := runner.inputs.authority.image.Runtime
	return []string{"container", "exec", "--user", fmt.Sprintf("%d:%d", r.UID, r.GID), "--workdir", r.WorkingDirectory,
		runner.id, runner.inputs.invocation.PythonExecutable, "-B", "-c", program}
}

func (runner *generationRunner) command(ctx context.Context, seconds int, sink io.Writer, limit int64, cleanup bool, args ...string) (generationCommandEvidence, error) {
	if cleanup {
		if runner.cleanupCalls >= 7 {
			return generationCommandEvidence{}, errors.New("reserved cleanup command budget exhausted")
		}
		runner.cleanupCalls++
	} else {
		if runner.workCalls >= 17 {
			return generationCommandEvidence{}, errors.New("generation work command budget exhausted")
		}
		runner.workCalls++
	}
	child, cancel := context.WithTimeout(ctx, time.Duration(seconds)*time.Second)
	defer cancel()
	record, err := runner.execute(child, args, sink, limit)
	runner.commands = append(runner.commands, record)
	if err == nil && record.ExitCode != 0 {
		err = errors.New("generation command returned a nonzero recorded exit status")
	}
	return record, errors.Join(err, child.Err())
}

func (runner *generationRunner) control(ctx context.Context, cleanup bool, args ...string) (generationCommandEvidence, error) {
	record, err := runner.command(ctx, 10, nil, 64<<10, cleanup, args...)
	if err == nil && len(record.Stderr) != 0 {
		err = errors.New("Docker control command wrote stderr")
	}
	return record, err
}

func (runner *generationRunner) present(ctx context.Context, cleanup bool) (bool, error) {
	record, err := runner.control(ctx, cleanup, "container", "ls", "--all", "--filter", "name=^/"+runner.name+"$", "--format", "{{.ID}} {{.Names}}", "--no-trunc")
	if err != nil {
		return false, err
	}
	value := strings.TrimSpace(string(record.Stdout))
	if value == "" {
		return false, nil
	}
	parts := strings.Fields(value)
	if len(parts) != 2 || !lowerHex(parts[0], 64) || parts[1] != runner.name || runner.id != "" && parts[0] != runner.id {
		return false, errors.New("container name inventory is ambiguous or changed")
	}
	return true, nil
}

func (runner *generationRunner) preflight(ctx context.Context) error {
	record, err := runner.control(ctx, false, "version", "--format", "{{.Client.Version}} {{.Server.Version}}")
	if err != nil {
		return err
	}
	if strings.TrimSpace(string(record.Stdout)) != "29.7.2 29.7.2" {
		return errors.New("Docker differs from reviewed 29.7.2 client and server")
	}
	record, err = runner.control(ctx, false, "info", "--format", "{{json .}}")
	if err != nil {
		return err
	}
	if err := validateGenerationDockerInfo(record.Stdout); err != nil {
		return err
	}
	record, err = runner.control(ctx, false, "image", "inspect", "--format", "{{json .}}", runner.inputs.image.ID)
	if err != nil {
		return err
	}
	if err := validateGenerationImageInspection(record.Stdout, runner.inputs.image); err != nil {
		return err
	}
	present, err := runner.present(ctx, false)
	if err == nil && present {
		err = errors.New("fresh generation container name already exists")
	}
	return err
}

func (runner *generationRunner) inspect(ctx context.Context, full, running, cleanup bool) (generationContainerInspection, error) {
	record, err := runner.control(ctx, cleanup, "container", "inspect", "--format", "{{json .}}", runner.name)
	var value generationContainerInspection
	if err != nil {
		return value, err
	}
	value, err = parseGenerationContainerInspection(record.Stdout, full)
	if err != nil {
		return value, err
	}
	if err := validateGenerationOwner(value, runner.name, runner.id, runner.inputs.image.ID); err != nil {
		return value, err
	}
	runner.id = value.ID
	if full {
		err = validateGenerationContainer(value, runner.inputs, runner.name, running)
	}
	return value, err
}

func (runner *generationRunner) run(ctx context.Context) error {
	runner.attempted = true
	record, err := runner.control(ctx, false, runner.createArguments()...)
	if err != nil {
		return err
	}
	id := strings.TrimSpace(string(record.Stdout))
	if !lowerHex(id, 64) {
		return errors.New("container create did not return an exact ID")
	}
	runner.id = id
	if _, err := runner.inspect(ctx, true, false, false); err != nil {
		return err
	}
	if _, err := runner.control(ctx, false, "container", "start", runner.id); err != nil {
		return err
	}
	if _, err := runner.inspect(ctx, true, true, false); err != nil {
		return err
	}
	record, err = runner.command(ctx, runner.inputs.authority.image.Runtime.WallClockSeconds, nil, 64<<10, false,
		runner.execArguments(runner.inputs.invocation.Program)...)
	if err != nil {
		return err
	}
	if string(record.Stdout) != generationCompletion || int64(len(record.Stdout)+len(record.Stderr)) > runner.inputs.authority.image.Runtime.CapturedOutputBytes {
		return errors.New("generator did not return the exact bounded completion marker")
	}
	_, err = runner.inspect(ctx, true, true, false)
	return err
}

func (runner *generationRunner) cleanup() error {
	if !runner.attempted {
		return nil
	}
	ctx, cancel := context.WithTimeout(context.Background(), 45*time.Second)
	defer cancel()
	present, err := runner.present(ctx, true)
	if err != nil || !present {
		return err
	}
	value, err := runner.inspect(ctx, false, false, true)
	if err != nil {
		return err
	}
	var stopErr error
	if value.State.Running {
		_, stopErr = runner.control(ctx, true, "container", "stop", "--timeout", strconv.Itoa(runner.inputs.authority.image.Runtime.StopGraceSeconds), runner.id)
	}
	value, err = runner.inspect(ctx, false, false, true)
	if err != nil {
		return errors.Join(stopErr, err)
	}
	args := []string{"container", "rm"}
	if value.State.Running {
		args = append(args, "--force")
	}
	if _, err := runner.control(ctx, true, append(args, runner.id)...); err != nil {
		return errors.Join(stopErr, err)
	}
	present, err = runner.present(ctx, true)
	if present {
		err = errors.Join(err, errors.New("owned generation container remains after removal"))
	}
	return errors.Join(stopErr, err, ctx.Err())
}

func validateGenerationDockerInfo(body []byte) error {
	object, err := generationInspectionObject(body, "OSType CgroupVersion MemoryLimit SwapLimit CpuCfsPeriod CpuCfsQuota PidsLimit Runtimes", "")
	if err != nil {
		return err
	}
	if jsonString(object, "OSType") != "linux" || jsonString(object, "CgroupVersion") != "2" {
		return errors.New("Docker requires Linux cgroup v2")
	}
	for _, field := range strings.Fields("MemoryLimit SwapLimit CpuCfsPeriod CpuCfsQuota PidsLimit") {
		var enabled bool
		if json.Unmarshal(object[field], &enabled) != nil || !enabled {
			return errors.New("Docker lacks required resource capabilities")
		}
	}
	var runtimes map[string]json.RawMessage
	if json.Unmarshal(object["Runtimes"], &runtimes) != nil || len(runtimes["runc"]) == 0 || string(runtimes["runc"]) == "null" {
		return errors.New("Docker lacks explicit runc runtime")
	}
	return nil
}
