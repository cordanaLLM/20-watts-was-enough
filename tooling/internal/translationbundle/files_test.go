package translationbundle

import (
	"errors"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
)

func TestRemoveAfterFailureKeepsCauseAndRemovalErrors(t *testing.T) {
	cause := errors.New("write failed")
	root := t.TempDir()
	removable := filepath.Join(root, "removable")
	if err := os.WriteFile(removable, []byte("x"), 0o644); err != nil {
		t.Fatal(err)
	}
	occupied := filepath.Join(root, "occupied")
	if err := os.MkdirAll(filepath.Join(occupied, "child"), 0o755); err != nil {
		t.Fatal(err)
	}
	missing := filepath.Join(root, "missing")

	err := removeAfterFailure(cause, removable, missing, occupied)
	if !errors.Is(err, cause) {
		t.Fatalf("cleanup error %v lost the cause", err)
	}
	if !strings.Contains(err.Error(), "remove "+occupied+" after failure") {
		t.Fatalf("cleanup error %q omits the failed removal of a non-empty directory", err)
	}
	if strings.Contains(err.Error(), missing) {
		t.Fatalf("cleanup error %q reports an already absent path", err)
	}
	if _, statErr := os.Lstat(removable); !os.IsNotExist(statErr) {
		t.Fatalf("removable path survived cleanup: %v", statErr)
	}
}

func TestRemoveAfterFailureWithoutPathsReturnsCause(t *testing.T) {
	cause := errors.New("write failed")
	if err := removeAfterFailure(cause); err == nil || err.Error() != cause.Error() || !errors.Is(err, cause) {
		t.Fatalf("cleanup without paths = %v, want the bare cause", err)
	}
}

func TestCloseAfterFailureKeepsCloseError(t *testing.T) {
	cause := errors.New("write failed")
	file, err := os.Create(filepath.Join(t.TempDir(), "closed"))
	if err != nil {
		t.Fatal(err)
	}
	if err := file.Close(); err != nil {
		t.Fatal(err)
	}
	joined := closeAfterFailure(cause, file)
	if !errors.Is(joined, cause) || !errors.Is(joined, os.ErrClosed) {
		t.Fatalf("closing an already closed file = %v, want the cause and os.ErrClosed", joined)
	}

	open, err := os.Create(filepath.Join(t.TempDir(), "open"))
	if err != nil {
		t.Fatal(err)
	}
	if got := closeAfterFailure(cause, open); got != cause {
		t.Fatalf("a clean close returned %v, want the bare cause", got)
	}
}

func TestNearestRealAncestorWalksEveryMissingElement(t *testing.T) {
	root := t.TempDir()
	path := filepath.Join(root, "a", "b", "c")
	ancestor, missing, err := nearestRealAncestor(path)
	if err != nil {
		t.Fatal(err)
	}
	if ancestor != root {
		t.Fatalf("ancestor = %q, want %q", ancestor, root)
	}
	if want := []string{"c", "b", "a"}; !reflect.DeepEqual(missing, want) {
		t.Fatalf("missing = %q, want %q", missing, want)
	}
}

func TestNearestRealAncestorStopsAtTheWorkingDirectory(t *testing.T) {
	t.Chdir(t.TempDir())
	ancestor, missing, err := nearestRealAncestor(filepath.Join("a", "b"))
	if err != nil {
		t.Fatal(err)
	}
	if ancestor != "." || !reflect.DeepEqual(missing, []string{"b", "a"}) {
		t.Fatalf("relative walk = %q %q, want . and [b a]", ancestor, missing)
	}
}

func TestNearestRealAncestorRejectsAFileAncestor(t *testing.T) {
	root := t.TempDir()
	file := filepath.Join(root, "file")
	if err := os.WriteFile(file, []byte("x"), 0o644); err != nil {
		t.Fatal(err)
	}
	if _, _, err := nearestRealAncestor(filepath.Join(file, "child")); err == nil {
		t.Fatal("a regular file was accepted as the output ancestor")
	}
}
