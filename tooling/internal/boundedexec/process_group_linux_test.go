package boundedexec_test

import (
	"bytes"
	"context"
	"fmt"
	"os"
	"os/exec"
	"strconv"
	"strings"
	"syscall"
	"testing"
	"time"

	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/boundedexec"
)

func TestKillProcessGroupOnCancel(t *testing.T) {
	role := os.Getenv("PROCESS_GROUP_TEST_ROLE")
	if role == "child" {
		time.Sleep(5 * time.Second)
		os.Exit(0)
	}
	if role == "leader" {
		child := exec.Command(os.Args[0], "-test.run=^TestKillProcessGroupOnCancel$")
		child.Env = append(os.Environ(), "PROCESS_GROUP_TEST_ROLE=child")
		if err := child.Start(); err != nil {
			os.Exit(2)
		}
		fmt.Println(child.Process.Pid)
		time.Sleep(5 * time.Second)
		os.Exit(0)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 300*time.Millisecond)
	defer cancel()
	command := exec.CommandContext(ctx, os.Args[0], "-test.run=^TestKillProcessGroupOnCancel$")
	command.Env = append(os.Environ(), "PROCESS_GROUP_TEST_ROLE=leader")
	var output bytes.Buffer
	command.Stdout = &output
	command.WaitDelay = time.Second
	cleanup := boundedexec.KillProcessGroupOnCancel(command)
	if err := command.Run(); err == nil {
		t.Fatal("process did not cancel")
	}
	if err := cleanup(); err != nil {
		t.Fatal(err)
	}
	childPID, err := strconv.Atoi(strings.TrimSpace(output.String()))
	if err != nil {
		t.Fatalf("missing descendant identity: %q %v", output.String(), err)
	}
	for attempt := 0; attempt < 20; attempt++ {
		if err := syscall.Kill(childPID, 0); err == syscall.ESRCH {
			return
		}
		body, readErr := os.ReadFile(fmt.Sprintf("/proc/%d/stat", childPID))
		if os.IsNotExist(readErr) {
			return
		}
		_, state, found := strings.Cut(string(body), ") ")
		if found && strings.HasPrefix(state, "Z ") {
			return
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatal("descendant still executing after process-group cancellation")
}
