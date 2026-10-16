package clrsshakedown

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"path/filepath"
	"strings"
	"testing"
	"testing/synctest"
)

type containerDockerFixture struct {
	t                                     *testing.T
	options                               ContainerOptions
	calls                                 [][]string
	containers                            map[string]*containerInspection
	mutate                                func(*containerInspection)
	startError, createError, cleanupError error
	changeOwner                           bool
	version                               string
	starts, removed                       int
}

func newContainerFixture(t *testing.T) *containerDockerFixture {
	t.Helper()
	options := ContainerOptions{Options: fixtureOptions(t), ImageID: "sha256:" + strings.Repeat("a", 64)}
	return &containerDockerFixture{t: t, options: options, containers: map[string]*containerInspection{}}
}

func testContainerInspection(options ContainerOptions, name, owner, id string, check bool, uid, gid int) containerInspection {
	pids, stop := int64(64), 5
	r := &containerRunner{options: options}
	value := containerInspection{ID: id, Name: "/" + name, Image: options.ImageID, Platform: "linux"}
	value.Config = containerImageConfig{Image: options.ImageID, User: fmt.Sprintf("%d:%d", uid, gid), WorkingDir: "/", StopSignal: "SIGTERM", StopTimeout: &stop,
		Entrypoint: []string{"/20w"}, Cmd: r.innerArguments(check), Env: []string{containerEnvironment}, Labels: map[string]string{containerOwnerLabel: owner}}
	h := &value.HostConfig
	init := false
	h.Init = &init
	h.ReadonlyRootfs, h.NetworkMode, h.Runtime, h.IpcMode, h.CgroupnsMode = true, "none", "runc", "none", "private"
	h.Memory, h.MemorySwap, h.NanoCpus, h.PidsLimit = 128<<20, 128<<20, 1_000_000_000, &pids
	h.CapDrop, h.SecurityOpt = []string{"ALL"}, []string{"no-new-privileges"}
	h.RestartPolicy.Name = "no"
	h.LogConfig.Type, h.LogConfig.Config = "local", map[string]string{"max-size": "4m", "max-file": "1", "compress": "false"}
	h.Mounts = []json.RawMessage{[]byte("{}"), []byte("{}"), []byte("{}")}
	value.Mounts = []containerMount{
		{Type: "bind", Source: options.RepositoryRoot, Destination: "/repository", Propagation: "rprivate"},
		{Type: "bind", Source: options.DatasetDirectory, Destination: "/dataset", Propagation: "rprivate"},
		{Type: "bind", Source: filepath.Join(options.OutputDirectory, "outputs"), Destination: "/output", Propagation: "rprivate", RW: !check},
	}
	value.NetworkSettings.Networks = map[string]json.RawMessage{"none": []byte("{}")}
	value.State.Status = "created"
	return value
}

func containerJSONResult(t *testing.T, value any) containerCommandResult {
	t.Helper()
	body, err := json.Marshal(value)
	if err != nil {
		t.Fatal(err)
	}
	return containerCommandResult{Stdout: append(body, '\n'), ExitCode: 0}
}

func argumentValue(args []string, key string) string {
	for i := 0; i+1 < len(args); i++ {
		if args[i] == key {
			return args[i+1]
		}
	}
	return ""
}

func (f *containerDockerFixture) execute(ctx context.Context, args []string, maximum int) (containerCommandResult, error) {
	f.t.Helper()
	if _, ok := ctx.Deadline(); !ok || maximum > containerAttachedBytes {
		f.t.Fatal("unbounded executor request")
	}
	f.calls = append(f.calls, append([]string{}, args...))
	if len(args) < 5 || args[0] != "--host" || args[1] != containerEndpoint || args[2] != "--config" ||
		args[3] != filepath.Join(f.options.OutputDirectory, "witness", "docker-config") {
		f.t.Fatalf("routing/config not isolated: %v", args)
	}
	a := args[4:]
	if a[0] == "version" {
		version := f.version
		if version == "" {
			version = containerDockerClient + " " + containerDockerServer
		}
		return containerCommandResult{Stdout: []byte(version + "\n")}, nil
	}
	if a[0] == "info" {
		return containerJSONResult(f.t, map[string]any{"OSType": "linux", "Architecture": "x86_64", "CgroupVersion": "2", "MemoryLimit": true, "SwapLimit": true, "CpuCfsPeriod": true, "CpuCfsQuota": true, "PidsLimit": true, "Runtimes": map[string]any{"runc": map[string]any{}}}), nil
	}
	if a[0] == "image" {
		return containerJSONResult(f.t, map[string]any{"Id": f.options.ImageID, "Os": "linux", "Architecture": "amd64", "Config": containerImageConfig{Entrypoint: []string{"/20w"}, Env: []string{containerEnvironment}}}), nil
	}
	if a[0] != "container" {
		f.t.Fatalf("unexpected Docker action: %v", a)
	}
	switch a[1] {
	case "ls":
		name := strings.TrimSuffix(strings.TrimPrefix(argumentValue(a, "--filter"), "name=^/"), "$")
		if c := f.containers[name]; c != nil {
			return containerCommandResult{Stdout: []byte(c.ID + " " + name + "\n")}, nil
		}
		return containerCommandResult{}, nil
	case "create":
		return f.create(a)
	case "inspect":
		c := f.containers[a[len(a)-1]]
		if c == nil {
			return containerCommandResult{ExitCode: 1}, errors.New("no container")
		}
		if f.changeOwner && f.starts > 0 {
			c.Config.Labels[containerOwnerLabel] = "different-owner"
		}
		return containerJSONResult(f.t, c), nil
	case "start":
		return f.start(a[len(a)-1])
	case "stop", "rm":
		if f.cleanupError != nil {
			return containerCommandResult{ExitCode: 1}, f.cleanupError
		}
		for name, c := range f.containers {
			if c.ID != a[len(a)-1] {
				continue
			}
			if a[1] == "stop" {
				c.State.Running, c.State.Status = false, "exited"
			} else {
				delete(f.containers, name)
				f.removed++
			}
			return containerCommandResult{Stdout: []byte(c.ID + "\n")}, nil
		}
	}
	f.t.Fatalf("unexpected Docker command: %v", a)
	return containerCommandResult{}, nil
}

func (f *containerDockerFixture) create(args []string) (containerCommandResult, error) {
	name := argumentValue(args, "--name")
	owner := strings.TrimPrefix(argumentValue(args, "--label"), containerOwnerLabel+"=")
	uid, gid := 0, 0
	if _, err := fmt.Sscanf(argumentValue(args, "--user"), "%d:%d", &uid, &gid); err != nil {
		f.t.Fatal(err)
	}
	id := strings.Repeat("1", 64)
	check := strings.HasSuffix(name, "-check")
	if check {
		id = strings.Repeat("2", 64)
	}
	c := testContainerInspection(f.options, name, owner, id, check, uid, gid)
	if f.mutate != nil {
		f.mutate(&c)
	}
	f.containers[name] = &c
	if f.createError != nil {
		return containerCommandResult{ExitCode: 1}, f.createError
	}
	return containerCommandResult{Stdout: []byte(id + "\n")}, nil
}

func (f *containerDockerFixture) start(id string) (containerCommandResult, error) {
	f.starts++
	var current *containerInspection
	for _, c := range f.containers {
		if c.ID == id {
			current = c
		}
	}
	if current == nil {
		f.t.Fatal("started unknown container")
	}
	current.State.Running, current.State.Status = true, "running"
	if f.startError != nil {
		return containerCommandResult{ExitCode: -1}, f.startError
	}
	options := f.options.Options
	options.OutputDirectory = filepath.Join(options.OutputDirectory, "outputs", "run")
	var report Report
	var err error
	if strings.HasSuffix(current.Name, "-check") {
		report, err = Check(context.Background(), options)
	} else {
		// The inner semantic construction uses a controlled clock; Docker lifecycle
		// tests themselves retain real cancellation/deadline contexts.
		synctest.Test(f.t, func(t *testing.T) { report, err = Run(context.Background(), options) })
	}
	current.State.Running, current.State.Status = false, "exited"
	body, encodeErr := MarshalReport(report)
	code := 0
	if err != nil {
		code = 1
		current.State.ExitCode = 1
	}
	return containerCommandResult{Stdout: body, ExitCode: code}, errors.Join(err, encodeErr)
}
