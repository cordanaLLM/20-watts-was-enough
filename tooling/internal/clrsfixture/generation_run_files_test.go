package clrsfixture

import (
	"errors"
	"os"
	"testing"
)

func TestSyncDirectory(t *testing.T) {
	t.Parallel()
	root, err := os.OpenRoot(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if err := root.Close(); err != nil {
			t.Error(err)
		}
	})
	if err := SyncDirectory(root, "."); err != nil {
		t.Fatalf("SyncDirectory existing root: %v", err)
	}
	if err := root.Mkdir("nested", 0o700); err != nil {
		t.Fatal(err)
	}
	if err := SyncDirectory(root, "nested"); err != nil {
		t.Fatalf("SyncDirectory nested directory: %v", err)
	}
	if err := SyncDirectory(root, "missing"); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("SyncDirectory missing path = %v, want os.ErrNotExist", err)
	}
}
