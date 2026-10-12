package pdfrender

import (
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

func TestCheckAcceptsTheTrackedRendererAuthority(t *testing.T) {
	t.Parallel()
	configuration, err := Check(projectRoot(t))
	if err != nil {
		t.Fatalf("Check() error = %v", err)
	}
	if configuration.Lock.Schema != 3 || configuration.Lock.Platform != "linux/amd64" ||
		!configuration.Lock.Exporter.RewriteTimestamp || configuration.Lock.Exporter.CompatibilityVersion != 30 {
		t.Fatalf("Check() lock = %+v", configuration.Lock)
	}
	if !rawSHA256Pattern.MatchString(configuration.LockSHA256) {
		t.Fatalf("Check() lock SHA-256 = %q", configuration.LockSHA256)
	}
}

func TestCheckRejectsAmbiguousOrExtendedLockJSON(t *testing.T) {
	t.Parallel()
	for name, mutate := range map[string]func(string) string{
		"duplicate": func(body string) string { return strings.Replace(body, `"schema": 3`, `"schema": 3, "schema": 3`, 1) },
		"unknown":   func(body string) string { return strings.Replace(body, "{", `{"unknown": true,`, 1) },
		"trailing":  func(body string) string { return body + "{}\n" },
	} {
		name, mutate := name, mutate
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			root := rendererFixture(t)
			lockPath := filepath.Join(root, filepath.FromSlash(lockRelativePath))
			body, err := os.ReadFile(lockPath)
			if err != nil {
				t.Fatal(err)
			}
			if err := os.WriteFile(lockPath, []byte(mutate(string(body))), 0o644); err != nil {
				t.Fatal(err)
			}
			if _, err := Check(root); err == nil {
				t.Fatal("Check() accepted an ambiguous or extended lock")
			}
		})
	}
}

func TestCheckRejectsAnUnboundExporterPolicy(t *testing.T) {
	t.Parallel()
	for name, mutate := range map[string]func(string) string{
		"timestamp-rewrite-disabled": func(body string) string {
			return strings.Replace(body, `"rewrite_timestamp": true`, `"rewrite_timestamp": false`, 1)
		},
		"different-compatibility-default": func(body string) string {
			return strings.Replace(body, `"compatibility_version": 30`, `"compatibility_version": 20`, 1)
		},
	} {
		name, mutate := name, mutate
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			root := rendererFixture(t)
			lockPath := filepath.Join(root, filepath.FromSlash(lockRelativePath))
			body, err := os.ReadFile(lockPath)
			if err != nil {
				t.Fatal(err)
			}
			if err := os.WriteFile(lockPath, []byte(mutate(string(body))), 0o644); err != nil {
				t.Fatal(err)
			}
			if _, err := Check(root); err == nil {
				t.Fatal("Check() accepted an unbound exporter policy")
			}
		})
	}
}

func TestCheckRejectsSymlinkedAuthority(t *testing.T) {
	t.Parallel()
	if runtime.GOOS == "windows" {
		return
	}
	root := rendererFixture(t)
	target := filepath.Join(t.TempDir(), "lock.json")
	body, err := os.ReadFile(filepath.Join(root, filepath.FromSlash(lockRelativePath)))
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(target, body, 0o644); err != nil {
		t.Fatal(err)
	}
	lockPath := filepath.Join(root, filepath.FromSlash(lockRelativePath))
	if err := os.Remove(lockPath); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(target, lockPath); err != nil {
		t.Fatal(err)
	}
	if _, err := Check(root); err == nil || !strings.Contains(err.Error(), "symlink") {
		t.Fatalf("Check() symlink error = %v", err)
	}
}

func TestReadRegularBoundedRejectsPathReplacementAfterRead(t *testing.T) {
	t.Parallel()
	root := t.TempDir()
	path := filepath.Join(root, "authority.json")
	if err := os.WriteFile(path, []byte("stable"), 0o644); err != nil {
		t.Fatal(err)
	}
	parked := filepath.Join(root, "parked.json")
	_, err := readRegularBoundedWithInterlock(root, path, 64, "test authority", func() error {
		if renameErr := os.Rename(path, parked); renameErr != nil {
			return renameErr
		}
		return os.WriteFile(path, []byte("mutate"), 0o644)
	})
	if err == nil || (runtime.GOOS != "windows" && !strings.Contains(err.Error(), "changed while it was read")) {
		t.Fatalf("readRegularBoundedWithInterlock() error = %v, want pathname-replacement refusal", err)
	}
}

func TestReadRegularBoundedRejectsByteMutationAfterRead(t *testing.T) {
	t.Parallel()
	root := t.TempDir()
	path := filepath.Join(root, "authority.json")
	if err := os.WriteFile(path, []byte("stable"), 0o644); err != nil {
		t.Fatal(err)
	}
	initial, err := os.Stat(path)
	if err != nil {
		t.Fatal(err)
	}
	_, err = readRegularBoundedWithInterlock(root, path, 64, "test authority", func() error {
		writer, openErr := os.OpenFile(path, os.O_WRONLY, 0)
		if openErr != nil {
			return openErr
		}
		if _, writeErr := writer.WriteAt([]byte("mutate"), 0); writeErr != nil {
			_ = writer.Close()
			return writeErr
		}
		if syncErr := writer.Sync(); syncErr != nil {
			_ = writer.Close()
			return syncErr
		}
		if closeErr := writer.Close(); closeErr != nil {
			return closeErr
		}
		return os.Chtimes(path, initial.ModTime(), initial.ModTime())
	})
	if err == nil || !strings.Contains(err.Error(), "changed while it was read") {
		t.Fatalf("readRegularBoundedWithInterlock() error = %v, want byte-mutation refusal", err)
	}
}

func TestCheckRejectsAnUnboundBuilderIdentity(t *testing.T) {
	t.Parallel()
	for name, mutate := range map[string]func(string) string{
		"short-buildx-revision": func(body string) string {
			return strings.Replace(body, "2d379c0c3f22da0d2759d132a0ec81ca949098f0", "2d379c0c", 1)
		},
		"mutable-buildkit-image": func(body string) string {
			return strings.Replace(
				body,
				"moby/buildkit:v0.32.2@sha256:28a898719c18a33f4e8000685287fa36fd0dd9560c6440227d3a732d79bb41d8",
				"moby/buildkit:v0.32.2",
				1,
			)
		},
		"mismatched-buildkit-tag": func(body string) string {
			return strings.Replace(body, "moby/buildkit:v0.32.2@", "moby/buildkit:v0.32.1@", 1)
		},
	} {
		name, mutate := name, mutate
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			root := rendererFixture(t)
			lockPath := filepath.Join(root, filepath.FromSlash(lockRelativePath))
			body, err := os.ReadFile(lockPath)
			if err != nil {
				t.Fatal(err)
			}
			if err := os.WriteFile(lockPath, []byte(mutate(string(body))), 0o644); err != nil {
				t.Fatal(err)
			}
			if _, err := Check(root); err == nil {
				t.Fatal("Check() accepted an unbound builder identity")
			}
		})
	}
}

func rendererFixture(t *testing.T) string {
	t.Helper()
	root := t.TempDir()
	destination := filepath.Join(root, "tooling", "pdf-renderer")
	if err := os.MkdirAll(destination, 0o755); err != nil {
		t.Fatal(err)
	}
	for _, name := range []string{"lock.json"} {
		body, err := os.ReadFile(filepath.Join(projectRoot(t), "tooling", "pdf-renderer", name))
		if err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(filepath.Join(destination, name), body, 0o644); err != nil {
			t.Fatal(err)
		}
	}
	return root
}

func projectRoot(t *testing.T) string {
	t.Helper()
	_, source, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("resolve test source path")
	}
	return filepath.Clean(filepath.Join(filepath.Dir(source), "..", "..", ".."))
}
