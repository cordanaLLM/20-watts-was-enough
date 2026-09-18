package nodeimage

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"sort"
	"strings"
	"testing"
	"time"
)

func TestSupportedArtifactsIsClosedAndSorted(t *testing.T) {
	t.Parallel()
	artifacts := SupportedArtifacts()
	if strings.Join(artifacts, "\n") != "fixture-007\nfixture-019" {
		t.Fatalf("SupportedArtifacts() = %v, want [fixture-007 fixture-019]", artifacts)
	}
}

func TestValidateDescriptorRejectsMalformedClosures(t *testing.T) {
	t.Parallel()
	manyFiles := make([]string, maximumClosureFiles+1)
	for index := range manyFiles {
		manyFiles[index] = fmt.Sprintf("artifact/file-%02d.mjs", index)
	}
	tests := []struct {
		name       string
		descriptor descriptor
		want       string
	}{
		{
			name:       "path escape",
			descriptor: descriptor{artifact: "fixture-999", runner: "../runner.mjs", files: []string{"../runner.mjs"}},
			want:       "not clean",
		},
		{
			name:       "duplicate",
			descriptor: descriptor{artifact: "fixture-999", runner: "artifact/runner.mjs", files: []string{"artifact/runner.mjs", "artifact/runner.mjs"}},
			want:       "repeats runtime path",
		},
		{
			name:       "unsorted",
			descriptor: descriptor{artifact: "fixture-999", runner: "artifact/z.mjs", files: []string{"artifact/z.mjs", "artifact/a.mjs"}},
			want:       "not sorted",
		},
		{
			name:       "runner missing",
			descriptor: descriptor{artifact: "fixture-999", runner: "artifact/runner.mjs", files: []string{"artifact/config.json"}},
			want:       "omits its runner",
		},
		{
			name:       "file bound",
			descriptor: descriptor{artifact: "fixture-999", runner: manyFiles[0], files: manyFiles},
			want:       "invalid runtime closure size",
		},
	}
	for _, test := range tests {
		test := test
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()
			err := validateDescriptor(test.descriptor)
			if err == nil || !strings.Contains(err.Error(), test.want) {
				t.Fatalf("validateDescriptor() error = %v, want %q", err, test.want)
			}
		})
	}
}

func TestCopyRegularFileRejectsFileAboveBound(t *testing.T) {
	t.Parallel()
	repositoryRoot := t.TempDir()
	stagingRoot := t.TempDir()
	relativePath := "artifact/runner.mjs"
	path := filepath.Join(repositoryRoot, filepath.FromSlash(relativePath))
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatalf("create oversized-file directory: %v", err)
	}
	file, err := os.OpenFile(path, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0o644)
	if err != nil {
		t.Fatalf("create oversized file: %v", err)
	}
	if err := file.Truncate(maximumFileBytes + 1); err != nil {
		_ = file.Close()
		t.Fatalf("truncate oversized file: %v", err)
	}
	if err := file.Close(); err != nil {
		t.Fatalf("close oversized file: %v", err)
	}
	_, _, err = copyRegularFile(repositoryRoot, stagingRoot, relativePath)
	if err == nil || !strings.Contains(err.Error(), "exceeds") {
		t.Fatalf("copyRegularFile() error = %v, want size-bound rejection", err)
	}
}

func TestPackageWritesOnlyDeclaredRuntimeClosure(t *testing.T) {
	t.Parallel()
	for _, artifact := range []string{"fixture-007", "fixture-019"} {
		artifact := artifact
		t.Run(artifact, func(t *testing.T) {
			t.Parallel()
			assertPackageWritesOnlyRuntimeClosure(t, artifact)
		})
	}
}

func assertPackageWritesOnlyRuntimeClosure(t *testing.T, artifact string) {
	t.Helper()
	repositoryRoot := t.TempDir()
	writeArtifactDescriptorFiles(t, repositoryRoot, artifact)
	outputRoot := filepath.Join(t.TempDir(), "context")

	if err := Package(Options{
		RepositoryRoot: repositoryRoot,
		OutputRoot:     outputRoot,
		Artifact:       artifact,
	}); err != nil {
		t.Fatalf("Package() error = %v", err)
	}

	var files []string
	err := filepath.WalkDir(outputRoot, func(path string, entry os.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if entry.IsDir() {
			return nil
		}
		relative, err := filepath.Rel(outputRoot, path)
		if err != nil {
			return err
		}
		files = append(files, filepath.ToSlash(relative))
		return nil
	})
	if err != nil {
		t.Fatalf("walk packaged context: %v", err)
	}
	want := append([]string{".experiment-artifact", ".experiment-runner", "closure.sha256"}, descriptors[artifact].files...)
	sort.Strings(want)
	sort.Strings(files)
	if strings.Join(files, "\n") != strings.Join(want, "\n") {
		t.Fatalf("packaged files =\n%s\nwant =\n%s", strings.Join(files, "\n"), strings.Join(want, "\n"))
	}
	assertFileBody(t, filepath.Join(outputRoot, ".experiment-artifact"), artifact+"\n")
	assertFileBody(t, filepath.Join(outputRoot, ".experiment-runner"), descriptors[artifact].runner+"\n")

	manifest, err := os.ReadFile(filepath.Join(outputRoot, "closure.sha256"))
	if err != nil {
		t.Fatalf("read checksum manifest: %v", err)
	}
	var expected strings.Builder
	for _, relativePath := range descriptors[artifact].files {
		body := []byte("body:" + relativePath + "\n")
		digest := sha256.Sum256(body)
		expected.WriteString(hex.EncodeToString(digest[:]))
		expected.WriteString("  ")
		expected.WriteString(relativePath)
		expected.WriteByte('\n')
	}
	if string(manifest) != expected.String() {
		t.Fatalf("closure.sha256 =\n%s\nwant =\n%s", manifest, expected.String())
	}
	fixed := time.Date(2000, time.January, 1, 0, 0, 0, 0, time.UTC)
	if information, err := os.Stat(outputRoot); err != nil || !information.ModTime().Equal(fixed) {
		t.Fatalf("output-root mtime = %v, %v, want %v", information, err, fixed)
	}
	assertContextModes(t, outputRoot)
	for _, relativePath := range files {
		path := filepath.Join(outputRoot, filepath.FromSlash(relativePath))
		information, err := os.Stat(path)
		wantTimestamp, timestampError := deterministicFileTimestamp(path)
		if err != nil || timestampError != nil || !information.ModTime().Equal(storedTimestamp(wantTimestamp)) {
			t.Fatalf("%s mtime = %v, %v; timestamp error = %v; want %v", relativePath, information, err, timestampError, wantTimestamp)
		}
	}
}

func TestDeterministicFileTimestampChangesWithEqualSizeContent(t *testing.T) {
	t.Parallel()
	path := filepath.Join(t.TempDir(), "identity")
	if err := os.WriteFile(path, []byte("left"), 0o644); err != nil {
		t.Fatalf("write first identity: %v", err)
	}
	left, err := deterministicFileTimestamp(path)
	if err != nil {
		t.Fatalf("timestamp first identity: %v", err)
	}
	leftAgain, err := deterministicFileTimestamp(path)
	if err != nil || !leftAgain.Equal(left) {
		t.Fatalf("repeated timestamp = %v, %v, want %v", leftAgain, err, left)
	}
	if err := os.WriteFile(path, []byte("rite"), 0o644); err != nil {
		t.Fatalf("write second identity: %v", err)
	}
	right, err := deterministicFileTimestamp(path)
	if err != nil {
		t.Fatalf("timestamp second identity: %v", err)
	}
	if left.Equal(right) {
		t.Fatalf("equal-size content reused deterministic timestamp %v", left)
	}
	epoch := time.Date(2000, time.January, 1, 0, 0, 0, 0, time.UTC)
	limit := epoch.Add(deterministicTimestampWindowSeconds * time.Second)
	for _, timestamp := range []time.Time{left, right} {
		if timestamp.Before(epoch) || !timestamp.Before(limit) {
			t.Fatalf("deterministic timestamp %v is outside [%v, %v)", timestamp, epoch, limit)
		}
	}
}

func TestPackageProducesIdenticalIndependentContexts(t *testing.T) {
	t.Parallel()
	repositoryRoot := t.TempDir()
	writeDescriptorFiles(t, repositoryRoot)
	left := filepath.Join(t.TempDir(), "context")
	right := filepath.Join(t.TempDir(), "context")
	options := Options{RepositoryRoot: repositoryRoot, Artifact: "fixture-007"}
	options.OutputRoot = left
	if err := Package(options); err != nil {
		t.Fatalf("package first context: %v", err)
	}
	for _, relativePath := range descriptors["fixture-007"].files {
		path := filepath.Join(repositoryRoot, filepath.FromSlash(relativePath))
		changed := time.Date(2026, time.August, 29, 12, 0, 0, 0, time.UTC)
		if err := os.Chtimes(path, changed, changed); err != nil {
			t.Fatalf("change source timestamp for %s: %v", relativePath, err)
		}
	}
	options.OutputRoot = right
	if err := Package(options); err != nil {
		t.Fatalf("package second context: %v", err)
	}
	leftSnapshot := snapshotContext(t, left)
	rightSnapshot := snapshotContext(t, right)
	if leftSnapshot != rightSnapshot {
		t.Fatalf("independent context snapshots differ:\nleft:\n%s\nright:\n%s", leftSnapshot, rightSnapshot)
	}
}

func TestPackageRejectsUnreleasedAndSeparateRuntimeArtifacts(t *testing.T) {
	t.Parallel()
	for _, artifact := range []string{"fixture-012", "fixture-029", "../fixture-007"} {
		artifact := artifact
		t.Run(artifact, func(t *testing.T) {
			t.Parallel()
			err := Package(Options{
				RepositoryRoot: t.TempDir(),
				OutputRoot:     filepath.Join(t.TempDir(), "context"),
				Artifact:       artifact,
			})
			if err == nil || !strings.Contains(err.Error(), "not supported") {
				t.Fatalf("Package() error = %v, want unsupported artifact error", err)
			}
		})
	}
}

func TestPackageRejectsSymlinkedRuntimeFile(t *testing.T) {
	t.Parallel()
	repositoryRoot := t.TempDir()
	writeDescriptorFiles(t, repositoryRoot)
	relativePath := descriptors["fixture-007"].files[0]
	path := filepath.Join(repositoryRoot, filepath.FromSlash(relativePath))
	if err := os.Remove(path); err != nil {
		t.Fatalf("remove runtime file: %v", err)
	}
	target := filepath.Join(repositoryRoot, "target.json")
	if err := os.WriteFile(target, []byte("{}\n"), 0o644); err != nil {
		t.Fatalf("write symlink target: %v", err)
	}
	if err := os.Symlink(target, path); err != nil {
		t.Fatalf("create runtime symlink: %v", err)
	}

	err := Package(Options{
		RepositoryRoot: repositoryRoot,
		OutputRoot:     filepath.Join(t.TempDir(), "context"),
		Artifact:       "fixture-007",
	})
	if err == nil || !strings.Contains(err.Error(), "not a symlink") {
		t.Fatalf("Package() error = %v, want symlink rejection", err)
	}
}

func TestPackageRejectsExistingOutput(t *testing.T) {
	t.Parallel()
	repositoryRoot := t.TempDir()
	writeDescriptorFiles(t, repositoryRoot)
	outputRoot := t.TempDir()
	sentinel := filepath.Join(outputRoot, "stale-file")
	if err := os.WriteFile(sentinel, []byte("retain on rejection\n"), 0o644); err != nil {
		t.Fatalf("write existing-output sentinel: %v", err)
	}
	err := Package(Options{
		RepositoryRoot: repositoryRoot,
		OutputRoot:     outputRoot,
		Artifact:       "fixture-007",
	})
	if err == nil || !strings.Contains(err.Error(), "already exists") {
		t.Fatalf("Package() error = %v, want existing output rejection", err)
	}
	assertFileBody(t, sentinel, "retain on rejection\n")
}

func TestPackageRejectsSymlinkedRepositoryRoot(t *testing.T) {
	t.Parallel()
	repositoryRoot := t.TempDir()
	writeDescriptorFiles(t, repositoryRoot)
	parent := t.TempDir()
	linkedRoot := filepath.Join(parent, "repository")
	if err := os.Symlink(repositoryRoot, linkedRoot); err != nil {
		t.Fatalf("create repository-root symlink: %v", err)
	}
	err := Package(Options{
		RepositoryRoot: linkedRoot,
		OutputRoot:     filepath.Join(t.TempDir(), "context"),
		Artifact:       "fixture-007",
	})
	if err == nil || !strings.Contains(err.Error(), "real directory") {
		t.Fatalf("Package() error = %v, want symlinked root rejection", err)
	}
}

func writeDescriptorFiles(t *testing.T, repositoryRoot string) {
	t.Helper()
	writeArtifactDescriptorFiles(t, repositoryRoot, "fixture-007")
}

func writeArtifactDescriptorFiles(t *testing.T, repositoryRoot, artifact string) {
	t.Helper()
	for _, relativePath := range descriptors[artifact].files {
		path := filepath.Join(repositoryRoot, filepath.FromSlash(relativePath))
		if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
			t.Fatalf("create descriptor directory: %v", err)
		}
		if err := os.WriteFile(path, []byte("body:"+relativePath+"\n"), 0o644); err != nil {
			t.Fatalf("write descriptor file: %v", err)
		}
	}
}

func assertFileBody(t *testing.T, path, expected string) {
	t.Helper()
	body, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read %s: %v", filepath.Base(path), err)
	}
	if string(body) != expected {
		t.Fatalf("%s = %q, want %q", filepath.Base(path), body, expected)
	}
}

func snapshotContext(t *testing.T, root string) string {
	t.Helper()
	var snapshot strings.Builder
	err := filepath.WalkDir(root, func(path string, entry os.DirEntry, walkError error) error {
		if walkError != nil {
			return walkError
		}
		information, err := entry.Info()
		if err != nil {
			return err
		}
		relative, err := filepath.Rel(root, path)
		if err != nil {
			return err
		}
		digest := "directory"
		if information.Mode().IsRegular() {
			body, err := os.ReadFile(path)
			if err != nil {
				return err
			}
			hash := sha256.Sum256(body)
			digest = hex.EncodeToString(hash[:])
		}
		if _, err := fmt.Fprintf(
			&snapshot,
			"%s|%s|%d|%d|%s\n",
			filepath.ToSlash(relative),
			information.Mode(),
			information.Size(),
			information.ModTime().UnixNano(),
			digest,
		); err != nil {
			return err
		}
		return nil
	})
	if err != nil {
		t.Fatalf("snapshot context: %v", err)
	}
	return snapshot.String()
}

func assertContextModes(t *testing.T, root string) {
	t.Helper()
	err := filepath.WalkDir(root, func(path string, entry os.DirEntry, walkError error) error {
		if walkError != nil {
			return walkError
		}
		information, err := entry.Info()
		if err != nil {
			return err
		}
		want := expectedContextMode(information)
		if information.Mode().Perm() != want {
			return fmt.Errorf("%s mode = %04o, want %04o", path, information.Mode().Perm(), want)
		}
		return nil
	})
	if err != nil {
		t.Fatalf("verify context modes: %v", err)
	}
}

// expectedContextMode returns the permission bits Package must leave on a
// context entry. Windows has no POSIX mode bits: os.Stat reports 0777 for a
// directory and 0666 for a regular file unless the read-only attribute is set,
// which Package's Chmod clears, so those values still assert the portable part
// of the contract: the entry type and that nothing was left read-only.
func expectedContextMode(information os.FileInfo) os.FileMode {
	directory, regular := os.FileMode(0o755), os.FileMode(0o644)
	if runtime.GOOS == "windows" {
		directory, regular = 0o777, 0o666
	}
	if information.Mode().IsRegular() {
		return regular
	}
	return directory
}

// storedTimestamp returns a deterministic timestamp as the platform filesystem
// keeps it. Windows FILETIME has 100 ns resolution and os.Chtimes truncates
// toward it, so the nanosecond derivation is only observable byte-for-byte on
// POSIX filesystems; the content-derived, deterministic part still holds.
func storedTimestamp(timestamp time.Time) time.Time {
	if runtime.GOOS == "windows" {
		return timestamp.Truncate(100 * time.Nanosecond)
	}
	return timestamp
}

func TestPackageMissingRuntimeFileLeavesNoOutput(t *testing.T) {
	t.Parallel()
	repositoryRoot := t.TempDir()
	writeDescriptorFiles(t, repositoryRoot)
	if err := os.Remove(filepath.Join(repositoryRoot, filepath.FromSlash(descriptors["fixture-007"].runner))); err != nil {
		t.Fatalf("remove runner: %v", err)
	}
	outputRoot := filepath.Join(t.TempDir(), "context")
	err := Package(Options{
		RepositoryRoot: repositoryRoot,
		OutputRoot:     outputRoot,
		Artifact:       "fixture-007",
	})
	if err == nil {
		t.Fatal("Package() succeeded without its runner")
	}
	if _, statError := os.Lstat(outputRoot); !errors.Is(statError, os.ErrNotExist) {
		t.Fatalf("output root exists after failure: %v", statError)
	}
}
