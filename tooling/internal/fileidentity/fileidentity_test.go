package fileidentity_test

import (
	"errors"
	"io/fs"
	"os"
	"path/filepath"
	"runtime"
	"testing"

	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/fileidentity"
)

// replace renames the file away and creates a new one at the same path. The
// old file stays alive, so no platform can reuse its identity.
func replace(t *testing.T, path string) {
	t.Helper()
	if err := os.Rename(path, path+".old"); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte("replacement"), 0o600); err != nil {
		t.Fatal(err)
	}
}

func TestCaptureKeepsIdentityAcrossReplacement(t *testing.T) {
	t.Parallel()
	for _, testCase := range []struct {
		name    string
		capture func(string) (os.FileInfo, error)
	}{
		{name: "lstat", capture: fileidentity.Lstat},
		{name: "stat", capture: fileidentity.Stat},
		{name: "info", capture: func(path string) (os.FileInfo, error) {
			entries, err := os.ReadDir(filepath.Dir(path))
			if err != nil || len(entries) != 1 {
				return nil, errors.Join(err, errors.New("want one directory entry"))
			}
			return fileidentity.Info(entries[0])
		}},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			t.Parallel()
			path := filepath.Join(t.TempDir(), "file")
			if err := os.WriteFile(path, []byte("original"), 0o600); err != nil {
				t.Fatal(err)
			}
			captured, err := testCase.capture(path)
			if err != nil {
				t.Fatal(err)
			}
			again, err := fileidentity.Lstat(path)
			if err != nil || !os.SameFile(captured, again) {
				t.Fatalf("unchanged file reported as replaced: %v", err)
			}
			replace(t, path)
			current, err := fileidentity.Lstat(path)
			if err != nil {
				t.Fatal(err)
			}
			if os.SameFile(captured, current) {
				t.Fatal("captured information resolved to the replacement")
			}
		})
	}
}

// TestUnpinnedLstatFollowsReplacementOnWindows is the planted defect: plain
// os.Lstat on Windows names whatever sits at the path when os.SameFile runs.
// If it starts failing, Go pins at capture itself and this package can go.
func TestUnpinnedLstatFollowsReplacementOnWindows(t *testing.T) {
	t.Parallel()
	if runtime.GOOS != "windows" {
		t.Skip("only Windows reads the file identity lazily")
	}
	path := filepath.Join(t.TempDir(), "file")
	if err := os.WriteFile(path, []byte("original"), 0o600); err != nil {
		t.Fatal(err)
	}
	unpinned, err := os.Lstat(path)
	if err != nil {
		t.Fatal(err)
	}
	replace(t, path)
	current, err := fileidentity.Lstat(path)
	if err != nil {
		t.Fatal(err)
	}
	if !os.SameFile(unpinned, current) {
		t.Fatal("os.Lstat now keeps the identity at capture; retire fileidentity")
	}
}

func TestMissingPathKeepsNotExist(t *testing.T) {
	t.Parallel()
	path := filepath.Join(t.TempDir(), "missing")
	for name, capture := range map[string]func(string) (os.FileInfo, error){"lstat": fileidentity.Lstat, "stat": fileidentity.Stat} {
		if information, err := capture(path); information != nil || !errors.Is(err, fs.ErrNotExist) {
			t.Fatalf("%s of a missing path = %v, %v; want ErrNotExist", name, information, err)
		}
	}
}
