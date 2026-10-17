package clrsshakedown

import (
	"bytes"
	"context"
	"errors"
	"os"
	"path/filepath"
	"reflect"
	"runtime"
	"strings"
	"testing"
)

func TestContainerRejectsWrongImageOrWritableMountBeforeStart(t *testing.T) {
	for _, mutation := range []string{"wrong-image", "writable-root", "writable-dataset"} {
		t.Run(mutation, func(t *testing.T) {
			f := newContainerFixture(t)
			f.mutate = func(c *containerInspection) {
				switch mutation {
				case "wrong-image":
					c.Image = "sha256:" + strings.Repeat("b", 64)
				case "writable-root":
					c.HostConfig.ReadonlyRootfs = false
				case "writable-dataset":
					c.Mounts[1].RW = true
				}
			}
			report, err := runContainer(context.Background(), f.options, f.execute)
			if err == nil || f.starts != 0 || f.removed != 1 || len(f.containers) != 0 || report.State != "incomplete" || report.ImageAdmitted || report.ScientificResult {
				t.Fatalf("unsafe configuration: report=%+v error=%v starts=%d removed=%d", report, err, f.starts, f.removed)
			}
			if _, err := os.Lstat(report.Bundle); !os.IsNotExist(err) {
				t.Fatalf("unsafe configuration created inner bundle: %v", err)
			}
			if _, err := os.Lstat(filepath.Join(report.OutputDirectory, "witness", "receipt.json")); err != nil {
				t.Fatal("lost failure witness", err)
			}
		})
	}
}

func TestContainerRunsThenChecksExactFrozenBundleWithHostWrittenWitness(t *testing.T) {
	f := newContainerFixture(t)
	before := snapshot(t, f.options.RepositoryRoot)
	report, err := runContainer(context.Background(), f.options, f.execute)
	if err != nil {
		t.Fatal(err)
	}
	if f.starts != 2 || f.removed != 2 || len(f.containers) != 0 || report.Cases != 48 || report.Events != 192 || report.State != "container-bundle-consistent-unadmitted" ||
		!report.InputsRechecked || report.Authority != "NO_RESULT" || report.ImageAdmitted || report.ScientificResult || report.Energy.State != "unavailable" || report.Energy.Joules != nil {
		t.Fatalf("incomplete or promoted result: %+v", report)
	}
	for _, phase := range report.Phases {
		if !phase.StartAttempted || !phase.Removed || phase.ExternalExit != 0 || phase.ContainerExit != 0 || phase.OOMKilled {
			t.Fatalf("unverified phase: %+v", phase)
		}
	}
	after := snapshot(t, f.options.RepositoryRoot)
	for name, identity := range before {
		if after[name] != identity {
			t.Fatalf("input changed: %s", name)
		}
	}
	for _, args := range f.calls {
		if len(args) < 6 || args[5] != "create" {
			continue
		}
		for i, arg := range args {
			if arg != "--mount" {
				continue
			}
			mount := args[i+1]
			if strings.Contains(mount, "docker.sock") || !strings.HasSuffix(mount, ",readonly") && mount != "type=bind,src="+filepath.Join(f.options.OutputDirectory, "outputs")+",dst=/output" {
				t.Fatalf("socket or unexpected writable mount: %s", mount)
			}
			if strings.Contains(argumentValue(args, "--name"), "-check") && !strings.HasSuffix(mount, ",readonly") {
				t.Fatalf("checker got writable mount: %s", mount)
			}
		}
	}
	body, err := os.ReadFile(filepath.Join(report.OutputDirectory, "witness", "receipt.json"))
	if err != nil {
		t.Fatal(err)
	}
	var saved ContainerReport
	if err := decode(body, &saved); err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(saved, report) {
		t.Fatal("durable witness differs from returned report")
	}
	returned, err := MarshalContainerReport(report)
	if err != nil || !bytes.Equal(body, returned) {
		t.Fatal("successful returned report bytes differ from durable witness", err)
	}
	if _, err := runContainer(context.Background(), f.options, f.execute); err == nil {
		t.Fatal("existing output was overwritten")
	}
	if final := snapshot(t, f.options.OutputDirectory); !reflect.DeepEqual(final, snapshotSubset(after, f.options.OutputDirectory)) {
		t.Fatal("second call changed retained output")
	}
}

func snapshotSubset(all map[string]fileSnapshot, root string) map[string]fileSnapshot {
	result := map[string]fileSnapshot{}
	for name, value := range all {
		if strings.HasPrefix(name, root+string(filepath.Separator)) {
			result[name] = value
		}
	}
	return result
}

func TestContainerPartialCreateAndTimeoutRetainFailureAndOwnedCleanup(t *testing.T) {
	for _, stage := range []string{"create", "start", "cleanup", "owner"} {
		t.Run(stage, func(t *testing.T) {
			f := newContainerFixture(t)
			primary := errors.New("injected primary failure")
			cleanup := errors.New("injected cleanup failure")
			if stage == "create" {
				f.createError = primary
			} else {
				f.startError = primary
			}
			if stage == "cleanup" {
				f.cleanupError = cleanup
			}
			if stage == "owner" {
				f.changeOwner = true
			}
			report, err := runContainer(context.Background(), f.options, f.execute)
			if !errors.Is(err, primary) || report.State != "incomplete" || report.Error == "" {
				t.Fatalf("lost primary failure: %v %+v", err, report)
			}
			if stage == "cleanup" && !errors.Is(err, cleanup) {
				t.Fatalf("lost cleanup cause: %v", err)
			}
			if stage == "owner" && f.removed != 0 {
				t.Fatal("removed a container after ownership changed")
			}
			if stage != "cleanup" && stage != "owner" && (len(f.containers) != 0 || f.removed != 1) {
				t.Fatalf("owned resource left after %s: %v", stage, f.containers)
			}
			if report.CleanupError == "" && (stage == "cleanup" || stage == "owner") {
				t.Fatal("lost actionable cleanup diagnostic")
			}
		})
	}
}

func TestContainerInvalidInputsDoNotCallDocker(t *testing.T) {
	f := newContainerFixture(t)
	for _, image := range []string{"image:latest", "sha256:" + strings.Repeat("A", 64), "sha256:" + strings.Repeat("a", 63), ""} {
		options := f.options
		options.ImageID = image
		if _, err := runContainer(context.Background(), options, f.execute); err == nil {
			t.Fatalf("accepted image %q", image)
		}
	}
	if _, err := runContainer(nil, f.options, f.execute); err == nil {
		t.Fatal("nil context accepted")
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err := runContainer(ctx, f.options, f.execute); !errors.Is(err, context.Canceled) {
		t.Fatalf("cancellation lost: %v", err)
	}
	if len(f.calls) != 0 {
		t.Fatal("invalid input called Docker")
	}
	if _, err := os.Lstat(f.options.OutputDirectory); !os.IsNotExist(err) {
		t.Fatalf("invalid input wrote output: %v", err)
	}
}

func TestContainerRefusesUnreviewedDockerVersionBeforeCreate(t *testing.T) {
	for _, version := range []string{"29.7.2 29.7.2", "29.9.1 29.9.1", "29.9.0 29.9.1", "29.9.1"} {
		t.Run(version, func(t *testing.T) {
			f := newContainerFixture(t)
			f.version = version
			report, err := runContainer(context.Background(), f.options, f.execute)
			if err == nil || !strings.Contains(err.Error(), "reviewed 29.9.1 client") || f.starts != 0 || len(f.containers) != 0 || report.ImageAdmitted {
				t.Fatalf("unreviewed Docker %q: report=%+v error=%v starts=%d", version, report, err, f.starts)
			}
		})
	}
}

func TestContainerRefusesNonLinuxOperator(t *testing.T) {
	if runtime.GOOS == "linux" {
		t.Skip("the refusal applies only off Linux")
	}
	calls := 0
	execute := func(context.Context, []string, int) (containerCommandResult, error) {
		calls++
		return containerCommandResult{}, nil
	}
	options := ContainerOptions{Options: fixtureOptions(t), ImageID: "sha256:" + strings.Repeat("a", 64)}
	report, err := runContainer(context.Background(), options, execute)
	if err == nil || !strings.Contains(err.Error(), "non-root Linux operator") || calls != 0 || report.State != "incomplete" {
		t.Fatalf("non-Linux host accepted: err=%v calls=%d state=%q", err, calls, report.State)
	}
	if _, err := os.Lstat(options.OutputDirectory); !os.IsNotExist(err) {
		t.Fatalf("refused host wrote output: %v", err)
	}
}
