package pdfrender

import (
	"errors"
	"fmt"
	"io"
	"os"
	"strconv"
	"strings"

	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/fileidentity"
)

const maximumPublicationLockBytes = 4096

type publicationLockOwner struct {
	pid  int
	host string
}

func formatPublicationLockOwner(pid int, host, token string) string {
	return fmt.Sprintf("pid=%d\nhost=%s\ntoken=%s\n", pid, host, token)
}

// parsePublicationLockOwner accepts exactly the three lines that
// formatPublicationLockOwner writes. Any other content leaves the owner
// unknown, and an unknown owner is never treated as stale.
func parsePublicationLockOwner(body []byte) (publicationLockOwner, error) {
	text, terminated := strings.CutSuffix(string(body), "\n")
	lines := strings.Split(text, "\n")
	if !terminated || len(lines) != 3 || !strings.HasPrefix(lines[0], "pid=") ||
		!strings.HasPrefix(lines[1], "host=") || !strings.HasPrefix(lines[2], "token=") {
		return publicationLockOwner{}, errors.New("lock owner record is not pid, host and token lines")
	}
	digits := strings.TrimPrefix(lines[0], "pid=")
	pid, err := strconv.Atoi(digits)
	if err != nil || pid <= 0 || strconv.Itoa(pid) != digits {
		return publicationLockOwner{}, errors.New("lock owner process identifier is not a positive integer")
	}
	host := strings.TrimPrefix(lines[1], "host=")
	if host == "" || strings.TrimPrefix(lines[2], "token=") == "" {
		return publicationLockOwner{}, errors.New("lock owner host or token is empty")
	}
	return publicationLockOwner{pid: pid, host: host}, nil
}

// removeStalePublicationLock removes the lock at lockPath only when its owner
// record names a process on this host that no longer exists, and only when
// the file is still the one that was read. It returns why the lock was kept.
func removeStalePublicationLock(lockPath string) error {
	before, err := fileidentity.Lstat(lockPath)
	if errors.Is(err, os.ErrNotExist) {
		return nil
	}
	if err != nil || !before.Mode().IsRegular() {
		return errors.New("lock is not a regular file")
	}
	file, err := os.Open(lockPath)
	if err != nil {
		return fmt.Errorf("read lock owner: %w", err)
	}
	body, readErr := io.ReadAll(io.LimitReader(file, maximumPublicationLockBytes+1))
	if closeErr := file.Close(); closeErr != nil {
		return fmt.Errorf("close lock owner record: %w", closeErr)
	}
	if readErr != nil || len(body) > maximumPublicationLockBytes {
		return errors.New("lock owner record is unreadable or too large")
	}
	owner, err := parsePublicationLockOwner(body)
	if err != nil {
		return err
	}
	if err := requireExitedOwner(owner); err != nil {
		return err
	}
	current, err := fileidentity.Lstat(lockPath)
	if err != nil || !os.SameFile(before, current) {
		return errors.New("lock changed while its owner was checked")
	}
	if err := os.Remove(lockPath); err != nil {
		return fmt.Errorf("remove stale lock: %w", err)
	}
	return nil
}

func requireExitedOwner(owner publicationLockOwner) error {
	host, err := os.Hostname()
	if err != nil || host != owner.host {
		return fmt.Errorf("lock is held by host %q, not this host", owner.host)
	}
	if owner.pid == os.Getpid() {
		return fmt.Errorf("lock owner process %d is still running", owner.pid)
	}
	exited, err := processExited(owner.pid)
	if err != nil {
		return fmt.Errorf("check lock owner process %d: %w", owner.pid, err)
	}
	if !exited {
		return fmt.Errorf("lock owner process %d is still running", owner.pid)
	}
	return nil
}
