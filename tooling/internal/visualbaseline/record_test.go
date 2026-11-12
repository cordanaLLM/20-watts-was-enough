package visualbaseline

import (
	"os"
	"path/filepath"
	"runtime"
	"testing"
)

func baselineFixture(t *testing.T) (string, []byte) {
	t.Helper()
	root := t.TempDir()
	if err := os.MkdirAll(filepath.Join(root, BaselineDirectory), 0o755); err != nil {
		t.Fatal(err)
	}
	body, err := encodePNG(solid(2, 2))
	if err != nil {
		t.Fatal(err)
	}
	return root, body
}

func TestRecordReplacesOnlyChangedFilesAtomically(t *testing.T) {
	root, body := baselineFixture(t)
	name := "home-desktop.png"
	changed, err := Record(root, name, body)
	if err != nil || !changed {
		t.Fatalf("initial record changed=%v err=%v", changed, err)
	}
	file := filepath.Join(root, BaselineDirectory, name)
	before, err := os.Stat(file)
	if err != nil {
		t.Fatal(err)
	}
	changed, err = Record(root, name, body)
	if err != nil || changed {
		t.Fatalf("idempotent record changed=%v err=%v", changed, err)
	}
	after, err := os.Stat(file)
	if err != nil || !os.SameFile(before, after) {
		t.Fatalf("unchanged baseline replaced: %v", err)
	}
	different, err := encodePNG(solid(3, 2))
	if err != nil {
		t.Fatal(err)
	}
	changed, err = Record(root, name, different)
	if err != nil || !changed {
		t.Fatalf("changed record changed=%v err=%v", changed, err)
	}
	after, err = os.Stat(file)
	if err != nil || os.SameFile(before, after) {
		t.Fatalf("baseline was not replaced atomically: %v", err)
	}
	entries, err := os.ReadDir(filepath.Dir(file))
	if err != nil || len(entries) != 1 || entries[0].Name() != name {
		t.Fatalf("temporary file retained: %v %v", entries, err)
	}
}

func TestRecordRefusesTraversalAndInvalidImages(t *testing.T) {
	root, body := baselineFixture(t)
	for _, name := range []string{"../escape.png", "/escape.png", "home.png", "home-desktop.jpg", "Home-desktop.png", "sub/home-desktop.png", "home\\desktop.png"} {
		if _, err := Record(root, name, body); err == nil {
			t.Fatalf("accepted %q", name)
		}
	}
	if _, err := Record(root, "home-desktop.png", []byte("invalid PNG")); err == nil {
		t.Fatal("accepted invalid PNG")
	}
	entries, err := os.ReadDir(filepath.Join(root, BaselineDirectory))
	if err != nil || len(entries) != 0 {
		t.Fatalf("invalid record wrote files: %v %v", entries, err)
	}
}

func TestRecordRefusesSymlinkFileAndDirectory(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("symlink creation requires Windows privileges")
	}
	root, body := baselineFixture(t)
	outside := filepath.Join(t.TempDir(), "outside.png")
	writeTestFile(t, outside, body)
	file := filepath.Join(root, BaselineDirectory, "home-desktop.png")
	if err := os.Symlink(outside, file); err != nil {
		t.Fatal(err)
	}
	if _, err := Record(root, "home-desktop.png", body); err == nil {
		t.Fatal("accepted symlink baseline")
	}
	if err := os.Remove(file); err != nil {
		t.Fatal(err)
	}
	directory := filepath.Join(root, BaselineDirectory)
	if err := os.Remove(directory); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(filepath.Dir(outside), directory); err != nil {
		t.Fatal(err)
	}
	if _, err := Record(root, "home-desktop.png", body); err == nil {
		t.Fatal("accepted symlink directory")
	}
}
