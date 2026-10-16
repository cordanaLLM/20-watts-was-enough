package clrsshakedown

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"time"
)

// ContainerDeadline bounds one container invocation: the work budget plus
// the separate cleanup budget that runs after it.
const ContainerDeadline = containerWorkTimeout + containerCleanupTimeout

const (
	containerEndpoint         = "unix:///var/run/docker.sock"
	containerOwnerLabel       = "dev.20watts.clrs-shakedown-owner"
	containerWorkTimeout      = 240 * time.Second
	containerCleanupTimeout   = 60 * time.Second
	containerControlTimeout   = 10 * time.Second
	containerExecuteTimeout   = 90 * time.Second
	containerCheckTimeout     = 45 * time.Second
	containerStopGrace        = 5 * time.Second
	containerProcessWaitDelay = 2 * time.Second
	containerWorkCommands     = 16
	containerCleanupCommands  = 14
	containerCPUMillis        = 1000
	containerMemoryBytes      = 128 << 20
	containerPIDs             = 64
	containerDockerClient     = "29.9.1"
	containerDockerServer     = "29.9.0"
	containerPlatform         = "linux/amd64"
	containerLogBytes         = "4m"
	containerLogFiles         = "1"
	containerControlBytes     = 64 << 10
	containerAttachedBytes    = 4 << 20
	containerWitnessBytes     = 16 << 20
	containerEnvironment      = "PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
)

// ContainerOptions explicitly selects an operator-trusted, already loaded image.
// OutputDirectory names a NEW parent, not an existing inner execution bundle.
type ContainerOptions struct {
	Options
	ImageID string
}

type ContainerLimits struct {
	WorkSeconds            int `json:"work_seconds"`
	CleanupSeconds         int `json:"cleanup_seconds"`
	ExecuteSeconds         int `json:"execute_seconds"`
	CheckSeconds           int `json:"check_seconds"`
	ControlSeconds         int `json:"control_seconds"`
	StopGraceSeconds       int `json:"stop_grace_seconds"`
	ProcessWaitDelayMillis int `json:"process_wait_delay_milliseconds"`
	MaximumWorkCommands    int `json:"maximum_work_commands"`
	MaximumCleanupCommands int `json:"maximum_cleanup_commands"`
	MaximumWitnessBytes    int `json:"maximum_witness_bytes"`
	MaximumControlBytes    int `json:"maximum_control_bytes"`
	MaximumAttachedBytes   int `json:"maximum_attached_bytes"`
	CPUMillis              int `json:"cpu_millis"`
	MemoryBytes            int `json:"memory_bytes"`
	PIDs                   int `json:"pids"`
}

type ContainerPhase struct {
	Name           string `json:"name"`
	ID             string `json:"id"`
	StartAttempted bool   `json:"start_attempted"`
	ExternalExit   int    `json:"external_exit"`
	ContainerExit  int    `json:"container_exit"`
	OOMKilled      bool   `json:"oom_killed"`
	Removed        bool   `json:"removed"`
}

// ContainerReport is unsigned execution evidence, NOT an image-admission receipt.
// The unchanged inner schema-1 receipt remains in outputs/run/receipt.json.
type ContainerReport struct {
	SchemaVersion    int                    `json:"schema_version"`
	Authority        string                 `json:"authority"`
	State            string                 `json:"state"`
	RunID            string                 `json:"run_id"`
	ImageID          string                 `json:"loaded_image_id"`
	Platform         string                 `json:"platform"`
	DockerEndpoint   string                 `json:"docker_endpoint"`
	UID              int                    `json:"uid"`
	GID              int                    `json:"gid"`
	OutputDirectory  string                 `json:"output_directory"`
	Bundle           string                 `json:"bundle"`
	Started          time.Time              `json:"started"`
	Finished         time.Time              `json:"finished"`
	Limits           ContainerLimits        `json:"limits"`
	Phases           []ContainerPhase       `json:"phases"`
	Commands         []string               `json:"commands"`
	InnerReceipt     FileIdentity           `json:"inner_receipt"`
	Cases            int                    `json:"cases"`
	Events           int                    `json:"events"`
	InputsRechecked  bool                   `json:"inputs_rechecked"`
	Energy           UnavailableMeasurement `json:"energy"`
	ImageAdmitted    bool                   `json:"image_admitted"`
	ScientificResult bool                   `json:"scientific_result"`
	CleanupError     string                 `json:"cleanup_error"`
	Error            string                 `json:"error"`
	Limitations      []string               `json:"limitations"`
}

func MarshalContainerReport(report ContainerReport) ([]byte, error) {
	return marshal(report, maximumReportBytes)
}

type containerCommandResult struct {
	Stdout, Stderr []byte
	ExitCode       int
}
type containerExecutor func(context.Context, []string, int) (containerCommandResult, error)

type containerRunner struct {
	options                               ContainerOptions
	report                                *ContainerReport
	witness                               *os.Root
	execute                               containerExecutor
	workCalls, cleanupCalls, witnessBytes int
	owner                                 string
	phases                                [2]containerPhaseState
}

type containerPhaseState struct {
	ContainerPhase
	check                   bool
	attempted, absentBefore bool
}

func (r *containerRunner) innerArguments(check bool) []string {
	mode := "--execute"
	if check {
		mode = "--check"
	}
	return []string{"experiment", "run-clrs-shakedown", "--root", "/repository", "--dataset", "/dataset",
		"--expected-tree", r.options.ExpectedTreeSHA256, "--output", "/output/run", "--run-id", r.options.RunID, "--json", mode}
}

func (r *containerRunner) createArguments(p *containerPhaseState) []string {
	args := []string{"container", "create", "--name", p.Name, "--label", containerOwnerLabel + "=" + r.owner,
		"--pull", "never", "--platform", containerPlatform, "--runtime", "runc", "--network", "none", "--read-only", "--init=false",
		"--user", fmt.Sprintf("%d:%d", r.report.UID, r.report.GID), "--cap-drop", "ALL", "--security-opt", "no-new-privileges",
		"--cpus", strconv.FormatFloat(float64(containerCPUMillis)/1000, 'f', -1, 64), "--memory", strconv.Itoa(containerMemoryBytes), "--memory-swap", strconv.Itoa(containerMemoryBytes), "--pids-limit", strconv.Itoa(containerPIDs),
		"--ipc", "none", "--cgroupns", "private", "--restart", "no", "--stop-timeout", strconv.Itoa(int(containerStopGrace / time.Second)), "--stop-signal", "SIGTERM",
		"--log-driver", "local", "--log-opt", "max-size=" + containerLogBytes, "--log-opt", "max-file=" + containerLogFiles, "--log-opt", "compress=false",
		"--workdir", "/", "--entrypoint", "/20w", "--env", containerEnvironment,
		"--mount", "type=bind,src=" + r.options.RepositoryRoot + ",dst=/repository,readonly",
		"--mount", "type=bind,src=" + r.options.DatasetDirectory + ",dst=/dataset,readonly"}
	output := "type=bind,src=" + filepath.Join(r.options.OutputDirectory, "outputs") + ",dst=/output"
	if p.check {
		output += ",readonly"
	}
	args = append(args, "--mount", output, r.options.ImageID)
	return append(args, r.innerArguments(p.check)...)
}
