package clrsshakedown

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"maps"
	"path/filepath"
	"slices"
	"strings"
	"time"

	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/strictjson"
)

type containerInspection struct {
	ID                    string `json:"Id"`
	Name, Image, Platform string
	Config                containerImageConfig
	HostConfig            containerHostConfig
	Mounts                []containerMount
	State                 struct {
		Status, Error                                string
		Running, Paused, Restarting, OOMKilled, Dead bool
		ExitCode                                     int
	}
	NetworkSettings struct{ Networks, Ports map[string]json.RawMessage }
}
type containerImageConfig struct {
	Image, User, WorkingDir, StopSignal string
	Entrypoint, Cmd, Env, OnBuild       []string
	Labels                              map[string]string
	Volumes, ExposedPorts               map[string]json.RawMessage
	Healthcheck                         *json.RawMessage
	StopTimeout                         *int
	Tty, OpenStdin                      bool
}
type containerMount struct {
	Type, Source, Destination, Mode, Propagation string
	RW                                           bool
}
type containerHostConfig struct {
	Privileged, ReadonlyRootfs, PublishAllPorts, AutoRemove                              bool
	NetworkMode, Runtime, PidMode, IpcMode, UTSMode, CgroupnsMode, UsernsMode            string
	Memory, MemorySwap, NanoCpus, CpuPeriod, CpuQuota                                    int64
	PidsLimit                                                                            *int64
	Init, OomKillDisable                                                                 *bool
	CapAdd, CapDrop, SecurityOpt, Binds, VolumesFrom, GroupAdd, DeviceCgroupRules, Links []string
	Devices, DeviceRequests, Mounts                                                      []json.RawMessage
	PortBindings                                                                         map[string]json.RawMessage
	Tmpfs, Sysctls, StorageOpt                                                           map[string]string
	RestartPolicy                                                                        struct {
		Name              string
		MaximumRetryCount int
	}
	LogConfig struct {
		Type   string
		Config map[string]string
	}
}

// Docker's unrelated version-specific fields are not schema attestation.
// Always-emitted consumed fields are presence checked. The separately named
// nullable/optional fields follow the reviewed Moby API v1.55.0 JSON omissions.
func containerObject(body []byte, required, nullable string) (map[string]json.RawMessage, error) {
	if err := strictjson.Validate(body, 20); err != nil {
		return nil, err
	}
	var object map[string]json.RawMessage
	if err := json.Unmarshal(body, &object); err != nil {
		return nil, err
	}
	if object == nil {
		return nil, errors.New("null Docker inspection object")
	}
	for _, key := range strings.Fields(required) {
		value, exists := object[key]
		if !exists || bytes.Equal(bytes.TrimSpace(value), []byte("null")) && !strings.Contains(" "+nullable+" ", " "+key+" ") {
			return nil, fmt.Errorf("Docker inspection lacks exact non-null field %s", key)
		}
	}
	for key := range object {
		for _, exact := range strings.Fields(required + " " + nullable) {
			if key != exact && strings.EqualFold(key, exact) {
				return nil, errors.New("case-aliased Docker inspection field")
			}
		}
	}
	return object, nil
}

func parseContainerInspection(body []byte) (value containerInspection, err error) {
	object, err := containerObject(body, "Id Name Image Config State HostConfig Mounts NetworkSettings Platform", "")
	if err != nil {
		return value, err
	}
	checks := []struct {
		body               []byte
		required, nullable string
	}{
		{object["State"], "Status Running Paused Restarting OOMKilled Dead ExitCode Error", ""},
		{object["Config"], "Image User WorkingDir Entrypoint Cmd Env Labels Tty OpenStdin StopTimeout StopSignal Volumes", "Volumes ExposedPorts OnBuild Healthcheck"},
		{object["HostConfig"], "Privileged ReadonlyRootfs PublishAllPorts AutoRemove NetworkMode Runtime PidMode IpcMode UTSMode CgroupnsMode UsernsMode Memory MemorySwap NanoCpus CpuPeriod CpuQuota PidsLimit CapDrop SecurityOpt RestartPolicy LogConfig Init OomKillDisable CapAdd Binds VolumesFrom GroupAdd Devices DeviceRequests DeviceCgroupRules Mounts Links PortBindings", "OomKillDisable CapAdd Binds VolumesFrom GroupAdd Devices DeviceRequests DeviceCgroupRules Links PortBindings Tmpfs Sysctls StorageOpt"},
		{object["NetworkSettings"], "Networks Ports", "Ports"},
	}
	for _, check := range checks {
		if _, err := containerObject(check.body, check.required, check.nullable); err != nil {
			return value, err
		}
	}
	var host map[string]json.RawMessage
	if err := json.Unmarshal(object["HostConfig"], &host); err != nil {
		return value, err
	}
	if _, err := containerObject(host["RestartPolicy"], "Name MaximumRetryCount", ""); err != nil {
		return value, err
	}
	if _, err := containerObject(host["LogConfig"], "Type Config", ""); err != nil {
		return value, err
	}
	var mounts []json.RawMessage
	if err := json.Unmarshal(object["Mounts"], &mounts); err != nil || len(mounts) != 3 {
		return value, errors.New("container requires exactly three mounts")
	}
	for _, mount := range mounts {
		if _, err := containerObject(mount, "Type Source Destination RW Mode Propagation", ""); err != nil {
			return value, err
		}
	}
	err = json.Unmarshal(body, &value)
	return value, err
}

func (r *containerRunner) validateCreated(value containerInspection, p *containerPhaseState) error {
	if err := r.validateConfiguration(value, p); err != nil {
		return err
	}
	s := value.State
	if s.Status != "created" || s.Running || s.Paused || s.Restarting || s.OOMKilled || s.Dead || s.ExitCode != 0 || s.Error != "" {
		return errors.New("container is not a clean unstarted creation")
	}
	return nil
}

func (r *containerRunner) validateConfiguration(value containerInspection, p *containerPhaseState) error {
	if err := r.validateOwner(value, p); err != nil {
		return err
	}
	c, h := value.Config, value.HostConfig
	if value.Image != r.options.ImageID || c.Image != r.options.ImageID || value.Platform != "linux" ||
		c.User != fmt.Sprintf("%d:%d", r.report.UID, r.report.GID) || c.WorkingDir != "/" || c.Tty || c.OpenStdin ||
		!slices.Equal(c.Entrypoint, []string{"/20w"}) || !slices.Equal(c.Cmd, r.innerArguments(p.check)) ||
		!slices.Equal(c.Env, []string{containerEnvironment}) || len(c.Volumes)+len(c.ExposedPorts)+len(c.OnBuild) != 0 ||
		c.Healthcheck != nil || c.StopTimeout == nil || *c.StopTimeout != int(containerStopGrace/time.Second) || c.StopSignal != "SIGTERM" {
		return errors.New("container image or inherited invocation differs from the fixed shakedown")
	}
	if h.Privileged || !h.ReadonlyRootfs || h.PublishAllPorts || h.AutoRemove || h.Runtime != "runc" ||
		h.NetworkMode != "none" || h.Memory != containerMemoryBytes || h.MemorySwap != containerMemoryBytes || h.NanoCpus != int64(containerCPUMillis)*1_000_000 ||
		h.CpuPeriod != 0 || h.CpuQuota != 0 || h.PidsLimit == nil || *h.PidsLimit != containerPIDs ||
		h.OomKillDisable != nil && *h.OomKillDisable || h.Init == nil || *h.Init || h.RestartPolicy.Name != "no" ||
		h.RestartPolicy.MaximumRetryCount != 0 || !slices.Equal(h.CapDrop, []string{"ALL"}) ||
		!slices.Equal(h.SecurityOpt, []string{"no-new-privileges"}) || h.LogConfig.Type != "local" ||
		!maps.Equal(h.LogConfig.Config, map[string]string{"max-size": containerLogBytes, "max-file": containerLogFiles, "compress": "false"}) {
		return errors.New("container safety or resource configuration differs from the fixed limits")
	}
	if h.PidMode != "" || h.IpcMode != "none" || h.UTSMode != "" || h.CgroupnsMode != "private" || h.UsernsMode != "" ||
		len(h.CapAdd)+len(h.Binds)+len(h.VolumesFrom)+len(h.GroupAdd)+len(h.Devices)+len(h.DeviceRequests)+len(h.DeviceCgroupRules)+
			len(h.Links)+len(h.PortBindings)+len(h.Sysctls)+len(h.StorageOpt)+len(h.Tmpfs)+len(value.NetworkSettings.Ports) != 0 || len(h.Mounts) != 3 {
		return errors.New("container has unexpected namespaces, privileges, devices or mounts")
	}
	if _, exists := value.NetworkSettings.Networks["none"]; !exists || len(value.NetworkSettings.Networks) != 1 {
		return errors.New("container network is not exclusively none")
	}
	if err := r.validateMounts(value.Mounts, p.check); err != nil {
		return err
	}
	return nil
}

// Cleanup needs ownership and state, not acceptance of a configuration already
// refused before start. Extra/unsafe mounts must not prevent removing our own
// unstarted container. Ownership failure still prohibits every mutation.
func parseContainerOwner(body []byte) (value containerInspection, err error) {
	object, err := containerObject(body, "Id Name Config State", "")
	if err != nil {
		return value, err
	}
	if _, err := containerObject(object["Config"], "Labels", ""); err != nil {
		return value, err
	}
	if _, err := containerObject(object["State"], "Running", ""); err != nil {
		return value, err
	}
	err = json.Unmarshal(body, &value)
	return value, err
}

func (r *containerRunner) validateOwner(value containerInspection, p *containerPhaseState) error {
	if !p.absentBefore || !validDigest(value.ID) || p.ID != "" && p.ID != value.ID || value.Name != "/"+p.Name ||
		value.Config.Labels[containerOwnerLabel] != r.owner {
		return errors.New("container ownership changed; no start or cleanup mutation permitted")
	}
	return nil
}

func (r *containerRunner) validateMounts(mounts []containerMount, check bool) error {
	expected := map[string]containerMount{
		"/repository": {Type: "bind", Source: r.options.RepositoryRoot, Destination: "/repository", Propagation: "rprivate"},
		"/dataset":    {Type: "bind", Source: r.options.DatasetDirectory, Destination: "/dataset", Propagation: "rprivate"},
		"/output":     {Type: "bind", Source: filepath.Join(r.options.OutputDirectory, "outputs"), Destination: "/output", Propagation: "rprivate", RW: !check},
	}
	if len(mounts) != len(expected) {
		return errors.New("container requires exactly three declared mounts")
	}
	for _, mount := range mounts {
		want, exists := expected[mount.Destination]
		if !exists || mount != want {
			return errors.New("container mount differs in source, access or propagation")
		}
		delete(expected, mount.Destination)
	}
	return nil
}

func validateContainerDockerInfo(body []byte) error {
	object, err := containerObject(body, "OSType Architecture CgroupVersion MemoryLimit SwapLimit CpuCfsPeriod CpuCfsQuota PidsLimit Runtimes", "")
	if err != nil {
		return err
	}
	var value struct {
		OSType, Architecture, CgroupVersion                          string
		MemoryLimit, SwapLimit, CpuCfsPeriod, CpuCfsQuota, PidsLimit bool
		Runtimes                                                     map[string]json.RawMessage
	}
	if err := json.Unmarshal(body, &value); err != nil {
		return err
	}
	if value.OSType != "linux" || !slices.Contains([]string{"x86_64", "amd64"}, value.Architecture) || value.CgroupVersion != "2" ||
		!value.MemoryLimit || !value.SwapLimit || !value.CpuCfsPeriod || !value.CpuCfsQuota || !value.PidsLimit {
		return errors.New("container execution requires Linux amd64 and enforceable cgroup-v2 CPU/memory/swap/PID limits")
	}
	var runtimes map[string]json.RawMessage
	if json.Unmarshal(object["Runtimes"], &runtimes) != nil || len(runtimes["runc"]) == 0 || string(runtimes["runc"]) == "null" {
		return errors.New("container execution requires explicit runc runtime")
	}
	return nil
}

func validateContainerImage(body []byte, imageID string) error {
	object, err := containerObject(body, "Id Os Architecture Config", "")
	if err != nil {
		return err
	}
	if _, err := containerObject(object["Config"], "Entrypoint Env", "Volumes ExposedPorts OnBuild Healthcheck"); err != nil {
		return err
	}
	var value struct {
		ID               string `json:"Id"`
		Os, Architecture string
		Config           containerImageConfig
	}
	if err := json.Unmarshal(body, &value); err != nil {
		return err
	}
	c := value.Config
	if value.ID != imageID || value.Os != "linux" || value.Architecture != "amd64" || !slices.Equal(c.Entrypoint, []string{"/20w"}) ||
		!slices.Equal(c.Env, []string{containerEnvironment}) || len(c.Volumes)+len(c.ExposedPorts)+len(c.OnBuild) != 0 || c.Healthcheck != nil {
		return errors.New("loaded image differs from the selected Linux amd64 tooling invocation")
	}
	return nil
}
