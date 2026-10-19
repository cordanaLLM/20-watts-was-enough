//go:build darwin || linux

package workstationrunner

import (
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
	"testing"
	"time"
)

// Diagnostic for BUG-003; runs only with REPRO_BUG003=1 on the repro branch.
func TestReproBug003GroupKillAfterLeaderReaped(t *testing.T) {
	if os.Getenv("REPRO_BUG003") != "1" {
		t.Skip("diagnostic only")
	}
	const iterations = 200
	tally := map[string]int{}
	for iteration := 0; iteration < iterations; iteration++ {
		ready := filepath.Join(t.TempDir(), "ready")
		command := exec.Command("/bin/sh", "-c", `sleep 30 & echo ready > "$1"; wait`, "sh", ready)
		command.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
		if err := command.Start(); err != nil {
			t.Fatal(err)
		}
		pgid := command.Process.Pid
		for poll := 0; poll < 2000; poll++ {
			if _, err := os.Lstat(ready); err == nil {
				break
			}
			time.Sleep(time.Millisecond)
		}
		if err := syscall.Kill(-pgid, syscall.SIGKILL); err != nil {
			t.Fatalf("first group kill: %v", err)
		}
		_ = command.Wait()
		afterReap := syscall.Kill(-pgid, syscall.SIGKILL)
		members := groupMembers(t, pgid)
		time.Sleep(200 * time.Millisecond)
		later := syscall.Kill(-pgid, 0)
		key := "after-reap=" + errorName(afterReap) + " members=" + members + " after-200ms=" + errorName(later)
		tally[key]++
	}
	for key, count := range tally {
		t.Logf("%4d %s", count, key)
	}
}

func errorName(err error) string {
	switch {
	case err == nil:
		return "nil"
	case errors.Is(err, syscall.ESRCH):
		return "ESRCH"
	case errors.Is(err, syscall.EPERM):
		return "EPERM"
	default:
		return err.Error()
	}
}

// groupMembers lists the process states left in the group, e.g. "Z" or "none".
func groupMembers(t *testing.T, pgid int) string {
	output, err := exec.Command("ps", "-ax", "-o", "pgid=,stat=").Output()
	if err != nil {
		t.Fatalf("ps: %v", err)
	}
	states := []string{}
	for _, line := range strings.Split(string(output), "\n") {
		fields := strings.Fields(line)
		if len(fields) == 2 && fields[0] == strconv.Itoa(pgid) {
			states = append(states, fields[1][:1])
		}
	}
	if len(states) == 0 {
		return "none"
	}
	return strings.Join(states, ",")
}
