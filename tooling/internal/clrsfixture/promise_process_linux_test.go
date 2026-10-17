//go:build linux

package clrsfixture

import (
	"context"
	"os"
	"os/exec"
	"testing"
	"time"
)

// The process-group behaviour itself is tested in boundedexec; this proves
// configurePromiseProcess hands its command to that helper.
func TestPromiseProcessUsesProcessGroupCleanup(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	command := exec.CommandContext(ctx, os.Args[0], "-test.run=^$")
	cleanup, err := configurePromiseProcess(command)
	if err != nil {
		t.Fatal(err)
	}
	if command.SysProcAttr == nil || !command.SysProcAttr.Setpgid || command.Cancel == nil {
		t.Fatalf("command not placed in a cancellable process group: %+v", command.SysProcAttr)
	}
	if err := cleanup(); err != nil {
		t.Fatalf("cleanup before start: %v", err)
	}
	if err := command.Run(); err != nil {
		t.Fatal(err)
	}
	if err := cleanup(); err != nil {
		t.Fatalf("cleanup after exit: %v", err)
	}
}
