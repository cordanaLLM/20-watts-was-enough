//go:build linux

package clrsshakedown

import (
	"context"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"strconv"
	"strings"
	"testing"
	"time"
)

func TestContainerProcessHelper(t *testing.T) {
	mode := os.Getenv("CLRS_CONTAINER_PROCESS_TEST")
	if mode == "" {
		return
	}
	switch mode {
	case "success":
		fmt.Fprint(os.Stdout, "bounded stdout")
		fmt.Fprint(os.Stderr, "bounded stderr")
	case "flood":
		for i := 0; i < 64; i++ {
			if _, err := os.Stdout.Write([]byte(strings.Repeat("o", 4096))); err != nil {
				os.Exit(3)
			}
			if _, err := os.Stderr.Write([]byte(strings.Repeat("e", 4096))); err != nil {
				os.Exit(3)
			}
		}
	case "wait":
		fmt.Fprint(os.Stdout, "ready\n")
		time.Sleep(5 * time.Second)
	case "child":
		child := exec.Command(os.Args[0], "-test.run=^TestContainerProcessHelper$")
		child.Env = []string{"CLRS_CONTAINER_PROCESS_TEST=wait"}
		if err := child.Start(); err != nil {
			os.Exit(4)
		}
		fmt.Fprint(os.Stdout, child.Process.Pid)
	default:
		os.Exit(5)
	}
	os.Exit(0)
}

func TestContainerCommandBoundsStreamsAndRequiresDeadline(t *testing.T) {
	binary, err := os.Executable()
	if err != nil {
		t.Fatal(err)
	}
	args := []string{"-test.run=^TestContainerProcessHelper$"}
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	result, err := executeContainerCommand(ctx, binary, args, []string{"CLRS_CONTAINER_PROCESS_TEST=success"}, 1024)
	if err != nil || result.ExitCode != 0 || string(result.Stdout) != "bounded stdout" || string(result.Stderr) != "bounded stderr" {
		t.Fatalf("changed streams/exit: %+v %v", result, err)
	}
	result, err = executeContainerCommand(ctx, binary, args, []string{"CLRS_CONTAINER_PROCESS_TEST=flood"}, 1024)
	if err == nil || len(result.Stdout)+len(result.Stderr) > 1024 || !strings.Contains(err.Error(), "output bound") {
		t.Fatalf("lost output limit: stdout%d stderr%d error%v", len(result.Stdout), len(result.Stderr), err)
	}
	if _, err := executeContainerCommand(context.Background(), binary, args, nil, 1024); err == nil {
		t.Fatal("unbounded command accepted")
	}
	if _, err := executeContainerCommand(ctx, "relative-docker", args, nil, 1024); err == nil {
		t.Fatal("relative executable accepted")
	}
	if _, err := executeContainerCommand(ctx, binary, args, nil, containerAttachedBytes+1); err == nil {
		t.Fatal("excessive stream bound accepted")
	}
}

func TestContainerCommandCancellationAndDescendantCleanup(t *testing.T) {
	binary, err := os.Executable()
	if err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 100*time.Millisecond)
	_, err = executeContainerCommand(ctx, binary, []string{"-test.run=^TestContainerProcessHelper$"}, []string{"CLRS_CONTAINER_PROCESS_TEST=wait"}, 1024)
	cancel()
	if !errors.Is(err, context.DeadlineExceeded) {
		t.Fatalf("deadline cause lost: %v", err)
	}
	ctx, cancel = context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	result, err := executeContainerCommand(ctx, binary, []string{"-test.run=^TestContainerProcessHelper$"}, []string{"CLRS_CONTAINER_PROCESS_TEST=child"}, 1024)
	if err != nil || result.ExitCode != 0 {
		t.Fatal(err)
	}
	pid, err := strconv.Atoi(string(result.Stdout))
	if err != nil || pid <= 0 {
		t.Fatalf("missing child identity: %q", result.Stdout)
	}
	for attempt := 0; attempt < 20; attempt++ {
		body, err := os.ReadFile(fmt.Sprintf("/proc/%d/stat", pid))
		if os.IsNotExist(err) {
			return
		}
		if err != nil {
			t.Fatal(err)
		}
		after := strings.LastIndexByte(string(body), ')')
		if after < 0 || after+2 >= len(body) {
			t.Fatal("invalid child stat")
		}
		if body[after+2] == 'Z' {
			return
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatal("descendant survived owned process-group cleanup")
}
