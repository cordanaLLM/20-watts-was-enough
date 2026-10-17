package clrsshakedown

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
)

func TestContainerRejectsChangedCapabilitiesNamespacesMountsAndPhaseState(t *testing.T) {
	mutations := map[string]func(*containerInspection){
		"privileged":       func(c *containerInspection) { c.HostConfig.Privileged = true },
		"network":          func(c *containerInspection) { c.HostConfig.NetworkMode = "host" },
		"unlimited-memory": func(c *containerInspection) { c.HostConfig.Memory = 0 },
		"swap":             func(c *containerInspection) { c.HostConfig.MemorySwap = -1 },
		"cpu":              func(c *containerInspection) { c.HostConfig.NanoCpus = 0 },
		"pids":             func(c *containerInspection) { c.HostConfig.PidsLimit = nil },
		"cap-add":          func(c *containerInspection) { c.HostConfig.CapAdd = []string{"SYS_ADMIN"} },
		"log":              func(c *containerInspection) { c.HostConfig.LogConfig.Config["compress"] = "true" },
		"command":          func(c *containerInspection) { c.Config.Cmd = append(c.Config.Cmd, "--bad") },
		"uid":              func(c *containerInspection) { c.Config.User = "0:0" },
		"environment":      func(c *containerInspection) { c.Config.Env = append(c.Config.Env, "SECRET=x") },
		"extra-mount": func(c *containerInspection) {
			c.Mounts = append(c.Mounts, containerMount{Source: "/var/run/docker.sock"})
		},
		"duplicate-mount":      func(c *containerInspection) { c.Mounts[1] = c.Mounts[0] },
		"propagation":          func(c *containerInspection) { c.Mounts[0].Propagation = "rshared" },
		"running-before-start": func(c *containerInspection) { c.State.Running = true; c.State.Status = "running" },
		"oom":                  func(c *containerInspection) { c.State.OOMKilled = true },
	}
	for name, mutate := range mutations {
		t.Run(name, func(t *testing.T) {
			f := newContainerFixture(t)
			f.mutate = mutate
			_, err := runContainer(context.Background(), f.options, f.execute)
			if err == nil || f.starts != 0 || f.removed != 1 || len(f.containers) != 0 {
				t.Fatalf("unsafe acceptance or lost owned cleanup: err=%v starts=%d removed=%d", err, f.starts, f.removed)
			}
		})
	}
}

func TestContainerInspectionRejectsAmbiguousAndMissingFields(t *testing.T) {
	options := ContainerOptions{Options: Options{RepositoryRoot: "/repository", DatasetDirectory: "/dataset", OutputDirectory: "/evidence"}, ImageID: "sha256:" + strings.Repeat("a", 64)}
	value := testContainerInspection(options, "name", "owner", strings.Repeat("1", 64), false, 1000, 1000)
	body := containerJSONResult(t, value).Stdout
	for _, bad := range [][]byte{[]byte("null"), append(append([]byte{}, body...), []byte("{}")...), []byte(`{"Id":"a","Id":"b"}`), []byte(`{"id":"a"}`), []byte(strings.Repeat("[", 21) + "0" + strings.Repeat("]", 21))} {
		if _, err := parseContainerInspection(bad); err == nil {
			t.Fatalf("accepted ambiguous/oversized-depth inspection %q", bad)
		}
	}
	for _, key := range []string{"Id", "Image", "Config", "State", "HostConfig", "Mounts", "NetworkSettings", "Platform"} {
		var object map[string]json.RawMessage
		if err := json.Unmarshal(body, &object); err != nil {
			t.Fatal(err)
		}
		delete(object, key)
		if _, err := parseContainerInspection(containerJSONResult(t, object).Stdout); err == nil {
			t.Fatalf("accepted missing %s", key)
		}
	}
	var object map[string]json.RawMessage
	if err := json.Unmarshal(body, &object); err != nil {
		t.Fatal(err)
	}
	object["id"] = object["Id"]
	if _, err := parseContainerInspection(containerJSONResult(t, object).Stdout); err == nil {
		t.Fatal("accepted case-aliased consumed field")
	}
	for _, key := range []string{"CapAdd", "Devices", "OomKillDisable", "Init", "Mounts"} {
		if err := json.Unmarshal(body, &object); err != nil {
			t.Fatal(err)
		}
		delete(object, "id")
		var host map[string]json.RawMessage
		if err := json.Unmarshal(object["HostConfig"], &host); err != nil {
			t.Fatal(err)
		}
		delete(host, key)
		object["HostConfig"] = containerJSONResult(t, host).Stdout
		if _, err := parseContainerInspection(containerJSONResult(t, object).Stdout); err == nil {
			t.Fatalf("missing emitted nullable safety field %s accepted", key)
		}
	}
}

func TestContainerOutputRejectsSymlinkOverlapAndMountDelimiters(t *testing.T) {
	f := newContainerFixture(t)
	outside := t.TempDir()
	link := filepath.Join(f.options.RepositoryRoot, "link")
	if err := os.Symlink(outside, link); err != nil {
		t.Fatal(err)
	}
	for _, output := range []string{filepath.Join(link, "new"), f.options.RepositoryRoot, f.options.DatasetDirectory, filepath.Join(f.options.DatasetDirectory, "new"), filepath.Join(f.options.RepositoryRoot, "comma,new")} {
		options := f.options
		options.OutputDirectory = output
		if _, err := runContainer(context.Background(), options, f.execute); err == nil {
			t.Fatalf("accepted unsafe output %q", output)
		}
	}
	if len(f.calls) != 0 {
		t.Fatal("unsafe output invoked Docker")
	}
	entries, err := os.ReadDir(outside)
	if err != nil || len(entries) != 0 {
		t.Fatal("symlink output escaped", err)
	}
}

func TestContainerBudgetsAndWitnessWriteFailureDoNotStartWork(t *testing.T) {
	for _, mode := range []string{"work-count", "cleanup-count", "witness-bytes", "witness-collision"} {
		t.Run(mode, func(t *testing.T) {
			directory := t.TempDir()
			root, err := os.OpenRoot(directory)
			if err != nil {
				t.Fatal(err)
			}
			defer root.Close()
			calls := 0
			r := &containerRunner{witness: root, report: &ContainerReport{}, execute: func(context.Context, []string, int) (containerCommandResult, error) {
				calls++
				return containerCommandResult{}, nil
			}}
			cleanup := false
			switch mode {
			case "work-count":
				r.workCalls = 16
			case "cleanup-count":
				r.cleanupCalls = 14
				cleanup = true
			case "witness-bytes":
				r.witnessBytes = containerWitnessBytes
			case "witness-collision":
				if err := writeNew(root, "command-01-before.json", []byte("sentinel")); err != nil {
					t.Fatal(err)
				}
			}
			if _, err := r.control(context.Background(), cleanup, "version"); err == nil || calls != 0 {
				t.Fatalf("exhausted work launched: %v calls=%d", err, calls)
			}
		})
	}
}

func TestContainerImageAndDaemonRejectUnsupportedBoundary(t *testing.T) {
	image := map[string]any{"Id": "sha256:" + strings.Repeat("a", 64), "Os": "linux", "Architecture": "amd64", "Config": map[string]any{"Entrypoint": []string{"/20w"}, "Env": []string{containerEnvironment}}}
	if err := validateContainerImage(containerJSONResult(t, image).Stdout, image["Id"].(string)); err != nil {
		t.Fatal("actual omitted optional image fields must be accepted", err)
	}
	for _, key := range []string{"Id", "Os", "Architecture"} {
		old := image[key]
		image[key] = "wrong"
		if err := validateContainerImage(containerJSONResult(t, image).Stdout, "sha256:"+strings.Repeat("a", 64)); err == nil {
			t.Fatalf("accepted changed image %s", key)
		}
		image[key] = old
	}
	if err := validateContainerDockerInfo([]byte(`{"OSType":"linux","Architecture":"x86_64","CgroupVersion":"2","MemoryLimit":true,"SwapLimit":false,"CpuCfsPeriod":true,"CpuCfsQuota":true,"PidsLimit":true,"Runtimes":{"runc":{}}}`)); err == nil {
		t.Fatal("unsupported swap constraint accepted")
	}
}

func TestContainerCancellationAndPartialWitnessRemainObservable(t *testing.T) {
	f := newContainerFixture(t)
	f.startError = context.DeadlineExceeded
	before := snapshot(t, f.options.DatasetDirectory)
	report, err := runContainer(context.Background(), f.options, f.execute)
	if !errors.Is(err, context.DeadlineExceeded) || f.starts != 1 || f.removed != 1 || report.Phases[0].ExternalExit != -1 || report.Phases[0].ContainerExit != -1 {
		t.Fatalf("timeout not retained: %+v %v", report, err)
	}
	if !reflect.DeepEqual(before, snapshot(t, f.options.DatasetDirectory)) {
		t.Fatal("timeout changed fixture input")
	}
	if report.Error == "" || report.State != "incomplete" || len(report.Commands) == 0 {
		t.Fatal("lost partial witness")
	}
}
