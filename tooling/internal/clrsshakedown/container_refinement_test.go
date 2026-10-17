package clrsshakedown

import (
	"context"
	"errors"
	"path/filepath"
	"reflect"
	"runtime"
	"strings"
	"testing"
)

func TestContainerCreateArgumentsMatchIndependentFixedProfiles(t *testing.T) {
	// The mount sources are host paths; runContainer refuses non-Linux hosts.
	if runtime.GOOS != "linux" {
		t.Skip("container execution supports only Linux operators")
	}
	options := ContainerOptions{Options: Options{RepositoryRoot: "/source", DatasetDirectory: "/fixtures", OutputDirectory: "/evidence", ExpectedTreeSHA256: strings.Repeat("b", 64), RunID: "run-1"}, ImageID: "sha256:" + strings.Repeat("a", 64)}
	r := &containerRunner{options: options, owner: "owned-run", report: &ContainerReport{UID: 1000, GID: 1001}}
	for _, test := range []struct {
		name, mode, mount string
		check             bool
	}{
		{"owned-execute", "--execute", "type=bind,src=/evidence/outputs,dst=/output", false},
		{"owned-check", "--check", "type=bind,src=/evidence/outputs,dst=/output,readonly", true},
	} {
		t.Run(test.name, func(t *testing.T) {
			// Policy literals are independent of production constants and projections.
			want := []string{"container", "create", "--name", test.name, "--label", "dev.20watts.clrs-shakedown-owner=owned-run",
				"--pull", "never", "--platform", "linux/amd64", "--runtime", "runc", "--network", "none", "--read-only", "--init=false",
				"--user", "1000:1001", "--cap-drop", "ALL", "--security-opt", "no-new-privileges",
				"--cpus", "1", "--memory", "134217728", "--memory-swap", "134217728", "--pids-limit", "64",
				"--ipc", "none", "--cgroupns", "private", "--restart", "no", "--stop-timeout", "5", "--stop-signal", "SIGTERM",
				"--log-driver", "local", "--log-opt", "max-size=4m", "--log-opt", "max-file=1", "--log-opt", "compress=false",
				"--workdir", "/", "--entrypoint", "/20w", "--env", "PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
				"--mount", "type=bind,src=/source,dst=/repository,readonly", "--mount", "type=bind,src=/fixtures,dst=/dataset,readonly",
				"--mount", test.mount, "sha256:" + strings.Repeat("a", 64), "experiment", "run-clrs-shakedown", "--root", "/repository", "--dataset", "/dataset",
				"--expected-tree", strings.Repeat("b", 64), "--output", "/output/run", "--run-id", "run-1", "--json", test.mode}
			got := r.createArguments(&containerPhaseState{ContainerPhase: ContainerPhase{Name: test.name}, check: test.check})
			if !reflect.DeepEqual(got, want) {
				t.Fatalf("create argv changed:\ngot  %q\nwant %q", got, want)
			}
		})
	}
	limits := containerLimitReport()
	if limits.WorkSeconds != 240 || limits.CleanupSeconds != 60 || limits.ProcessWaitDelayMillis != 2000 || limits.StopGraceSeconds != 5 || limits.MaximumWorkCommands != 16 || limits.MaximumCleanupCommands != 14 || limits.MaximumWitnessBytes != 16<<20 {
		t.Fatalf("limit projection changed: %+v", limits)
	}
}

func TestContainerCheckerFailurePreservesCompletedInnerBundle(t *testing.T) {
	f := newContainerFixture(t)
	wantErr := errors.New("injected read-only checker process failure")
	var before map[string]fileSnapshot
	execute := func(ctx context.Context, args []string, maximum int) (containerCommandResult, error) {
		if len(args) > 6 && args[4] == "container" && args[5] == "start" && f.starts == 1 {
			before = snapshot(t, filepath.Join(f.options.OutputDirectory, "outputs", "run"))
			f.starts++
			for _, c := range f.containers {
				if c.ID == args[len(args)-1] {
					c.State.Status = "exited"
					c.State.ExitCode = 7
				}
			}
			return containerCommandResult{ExitCode: 7}, wantErr
		}
		return f.execute(ctx, args, maximum)
	}
	report, err := runContainer(context.Background(), f.options, execute)
	if !errors.Is(err, wantErr) || report.State != "incomplete" || f.starts != 2 || f.removed != 2 || len(f.containers) != 0 || before == nil {
		t.Fatalf("lost checker failure or cleanup: %v %+v", err, report)
	}
	if !report.Phases[1].StartAttempted || report.Phases[1].ExternalExit != 7 || report.Phases[1].ContainerExit != 7 || !report.Phases[1].Removed {
		t.Fatalf("lost observed checker exit: %+v", report.Phases[1])
	}
	if !reflect.DeepEqual(before, snapshot(t, report.Bundle)) {
		t.Fatal("checker failure changed completed inner bundle")
	}
	options := f.options.Options
	options.OutputDirectory = report.Bundle
	inner, err := Check(context.Background(), options)
	if err != nil || len(inner.Cases) != 48 || len(inner.Events) != 192 || inner.State != "bundle-consistent-unadmitted" || inner.ImageAdmitted || inner.ScientificResult {
		t.Fatalf("completed partial evidence lost: %+v %v", inner, err)
	}
}
