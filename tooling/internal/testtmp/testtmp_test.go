package testtmp

import (
	"os"
	"path/filepath"
	"runtime"
	"testing"
)

func TestMain(tests *testing.M) {
	os.Exit(Run(tests))
}

func TestRunPinsTheTemporaryDirectoryToItsCanonicalPath(t *testing.T) {
	directory := t.TempDir()
	resolved, err := filepath.EvalSymlinks(directory)
	if err != nil {
		t.Fatal(err)
	}
	if resolved != directory {
		t.Fatalf("t.TempDir() = %q, canonical form %q", directory, resolved)
	}
}

func TestVariablesNameThePlatformTemporaryDirectory(t *testing.T) {
	t.Parallel()
	if got := variables("windows"); len(got) != 2 || got[0] != "TMP" || got[1] != "TEMP" {
		t.Fatalf("variables(windows) = %v", got)
	}
	if got := variables("darwin"); len(got) != 1 || got[0] != "TMPDIR" {
		t.Fatalf("variables(darwin) = %v", got)
	}
}

func TestPinResolvesASymlinkedTemporaryDirectory(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("symlink creation needs a privilege on Windows")
	}
	real, err := filepath.EvalSymlinks(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	link := filepath.Join(t.TempDir(), "link")
	if err := os.Symlink(real, link); err != nil {
		t.Fatal(err)
	}
	t.Setenv("TMPDIR", link)
	if os.TempDir() != link {
		t.Fatalf("os.TempDir() = %q, want the symlink %q", os.TempDir(), link)
	}
	if err := Pin(); err != nil {
		t.Fatal(err)
	}
	if os.TempDir() != real {
		t.Fatalf("after pin os.TempDir() = %q, want %q", os.TempDir(), real)
	}
}
