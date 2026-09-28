package clrsfixture

import (
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
)

func TestInspectGeneratorRootPathReturnsRootIdentity(t *testing.T) {
	t.Parallel()
	root, err := filepath.EvalSymlinks(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	want, err := os.Lstat(root)
	if err != nil {
		t.Fatal(err)
	}
	got, err := inspectGeneratorRootPath(root)
	if err != nil {
		t.Fatalf("inspectGeneratorRootPath(%q): %v", root, err)
	}
	if !os.SameFile(want, got) {
		t.Fatalf("inspectGeneratorRootPath(%q) returned another directory's identity", root)
	}
}

func TestInspectGeneratorRootPathRejectsMissingAndNonDirectoryLevels(t *testing.T) {
	t.Parallel()
	parent, err := filepath.EvalSymlinks(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	file := filepath.Join(parent, "file")
	if err := os.WriteFile(file, []byte("x"), 0o600); err != nil {
		t.Fatal(err)
	}
	for _, root := range []string{
		filepath.Join(parent, "missing"),
		file,
		filepath.Join(file, "child"),
	} {
		if _, err := inspectGeneratorRootPath(root); err == nil || !strings.Contains(err.Error(), "real directories") {
			t.Errorf("inspectGeneratorRootPath(%q) error = %v, want real-directory refusal", root, err)
		}
	}
}

func TestWalkGeneratorRootPathInspectsEveryAncestor(t *testing.T) {
	t.Parallel()
	temporary := t.TempDir()
	directory, err := os.Lstat(temporary)
	if err != nil {
		t.Fatal(err)
	}
	volumeRoot := syntheticGeneratorVolumeRoot(t, temporary)
	calls := 0
	_, err = walkGeneratorRootPath(syntheticGeneratorRootPath(volumeRoot, 3), func(path string) (os.FileInfo, error) {
		calls++
		if path == volumeRoot {
			return nil, os.ErrNotExist
		}
		return directory, nil
	})
	if err == nil || !strings.Contains(err.Error(), "real directories") || calls != 3 {
		t.Fatalf("walk error = %v after %d inspections, want refusal at the third (volume root) level", err, calls)
	}
}

func TestWalkGeneratorRootPathBoundsAncestorLevels(t *testing.T) {
	t.Parallel()
	temporary := t.TempDir()
	directory, err := os.Lstat(temporary)
	if err != nil {
		t.Fatal(err)
	}
	volumeRoot := syntheticGeneratorVolumeRoot(t, temporary)
	for _, test := range []struct {
		name   string
		levels int
	}{
		{name: "volume root only", levels: 1},
		{name: "exactly at bound", levels: maximumGeneratorRootPathLevels},
		{name: "one past bound", levels: maximumGeneratorRootPathLevels + 1},
	} {
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()
			calls := 0
			got, err := walkGeneratorRootPath(syntheticGeneratorRootPath(volumeRoot, test.levels), func(string) (os.FileInfo, error) {
				calls++
				return directory, nil
			})
			checkGeneratorRootWalk(t, test.levels, calls, got, err)
		})
	}
}

func checkGeneratorRootWalk(t *testing.T, levels, calls int, got os.FileInfo, err error) {
	t.Helper()
	if levels > maximumGeneratorRootPathLevels {
		bound := strconv.Itoa(maximumGeneratorRootPathLevels) + " directory levels"
		if got != nil || err == nil || !strings.Contains(err.Error(), bound) || calls != maximumGeneratorRootPathLevels {
			t.Fatalf("walk of %d levels = %v, %v after %d inspections, want bound refusal", levels, got, err, calls)
		}
		return
	}
	if err != nil || got == nil || calls != levels {
		t.Fatalf("walk of %d levels = %v, %v after %d inspections, want success", levels, got, err, calls)
	}
}

func syntheticGeneratorVolumeRoot(t *testing.T, temporary string) string {
	t.Helper()
	volumeRoot := filepath.VolumeName(temporary) + string(filepath.Separator)
	if filepath.Dir(volumeRoot) != volumeRoot {
		t.Fatalf("synthetic volume root %q is not a filepath.Dir fixed point", volumeRoot)
	}
	return volumeRoot
}

// syntheticGeneratorRootPath returns a path whose ancestor walk visits exactly
// levels directories, counting the volume root.
func syntheticGeneratorRootPath(volumeRoot string, levels int) string {
	return filepath.Join(volumeRoot, strings.Repeat("d"+string(filepath.Separator), levels-1))
}
