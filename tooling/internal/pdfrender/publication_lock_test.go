package pdfrender

import (
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

func publicationLockFixture(t *testing.T, body string) (string, string) {
	t.Helper()
	root := t.TempDir()
	if err := os.MkdirAll(filepath.Join(root, "tmp"), 0o755); err != nil {
		t.Fatal(err)
	}
	lockPath := filepath.Join(root, "tmp", "pdf-renderer-book.lock")
	if err := os.WriteFile(lockPath, []byte(body), 0o600); err != nil {
		t.Fatal(err)
	}
	return root, lockPath
}

func exitedProcessID(t *testing.T) int {
	t.Helper()
	command := exec.Command(os.Args[0], "-test.run=^$")
	if err := command.Run(); err != nil {
		t.Fatalf("run short-lived process: %v", err)
	}
	return command.ProcessState.Pid()
}

func thisHost(t *testing.T) string {
	t.Helper()
	host, err := os.Hostname()
	if err != nil {
		t.Fatal(err)
	}
	return host
}

func TestPublicationLockRecoversALockWhoseOwnerExited(t *testing.T) {
	t.Parallel()
	root, lockPath := publicationLockFixture(t,
		formatPublicationLockOwner(exitedProcessID(t), thisHost(t), "stale"))
	lock, err := acquirePublicationLock(root)
	if err != nil {
		t.Fatalf("stale lock was not recovered: %v", err)
	}
	body, err := os.ReadFile(lockPath)
	if err != nil {
		t.Fatal(err)
	}
	owner, err := parsePublicationLockOwner(body)
	if err != nil || owner.pid != os.Getpid() {
		t.Fatalf("recovered lock owner = %+v, %v; want this process", owner, err)
	}
	if err := lock.release(); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Lstat(lockPath); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("released lock survived: %v", err)
	}
}

func TestPublicationLockKeepsEveryLockItCannotProveStale(t *testing.T) {
	t.Parallel()
	host := thisHost(t)
	for name, body := range map[string]string{
		"running parent process": formatPublicationLockOwner(os.Getppid(), host, "live"),
		"this process":           formatPublicationLockOwner(os.Getpid(), host, "live"),
		"exited owner elsewhere": formatPublicationLockOwner(exitedProcessID(t), host+"-other", "remote"),
		"token-only record":      "0123456789abcdef0123456789abcdef\n",
		"empty record":           "",
		"oversized record":       strings.Repeat("x", maximumPublicationLockBytes+1),
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			root, lockPath := publicationLockFixture(t, body)
			lock, err := acquirePublicationLock(root)
			if err == nil {
				_ = lock.release()
				t.Fatal("acquired a lock that is not provably stale")
			}
			if !strings.Contains(err.Error(), "already locked") {
				t.Fatalf("acquirePublicationLock() error = %v", err)
			}
			kept, readErr := os.ReadFile(lockPath)
			if readErr != nil || string(kept) != body {
				t.Fatalf("kept lock changed: %q, %v", kept, readErr)
			}
		})
	}
}

func TestPublicationLockOwnerRecordBoundaries(t *testing.T) {
	t.Parallel()
	valid := formatPublicationLockOwner(1, "host", "token")
	if owner, err := parsePublicationLockOwner([]byte(valid)); err != nil || owner != (publicationLockOwner{pid: 1, host: "host"}) {
		t.Fatalf("parse(valid) = %+v, %v", owner, err)
	}
	for _, body := range []string{
		formatPublicationLockOwner(0, "host", "token"),
		"pid=-1\nhost=host\ntoken=token\n",
		"pid=1x\nhost=host\ntoken=token\n",
		formatPublicationLockOwner(1, "", "token"),
		formatPublicationLockOwner(1, "host", ""),
		valid + "extra=1\n",
		"host=host\npid=1\ntoken=token\n",
		"pid=+1\nhost=host\ntoken=token\n",
		"pid=01\nhost=host\ntoken=token\n",
		strings.TrimSuffix(valid, "\n"),
	} {
		if _, err := parsePublicationLockOwner([]byte(body)); err == nil {
			t.Errorf("parse(%q) accepted an invalid owner record", body)
		}
	}
}
