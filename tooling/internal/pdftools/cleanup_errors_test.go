package pdftools

import (
	"archive/tar"
	"compress/gzip"
	"errors"
	"io"
	"os"
	"path/filepath"
	"testing"
	"time"
)

type failingHash struct {
	failCall int
	calls    int
	err      error
}

func (f *failingHash) Write(p []byte) (n int, err error) {
	f.calls++
	if f.calls == f.failCall {
		return 0, f.err
	}
	return len(p), nil
}

func (f *failingHash) Reset()         {}
func (f *failingHash) Size() int      { return 32 }
func (f *failingHash) BlockSize() int { return 64 }
func (f *failingHash) Sum(b []byte) []byte {
	return append(b, make([]byte, 32)...)
}

func TestWriteNormalizedContextFileCloseErrorJoined(t *testing.T) {
	tempFile := filepath.Join(t.TempDir(), "notice.txt")
	errSyncInjected := errors.New("injected sync error")
	errCloseInjected := errors.New("injected close error")

	origSync := syncContextFile
	origClose := closeContextFile
	defer func() {
		syncContextFile = origSync
		closeContextFile = origClose
	}()

	syncContextFile = func(*os.File) error {
		return errSyncInjected
	}
	closeContextFile = func(f *os.File) error {
		_ = f.Close()
		return errCloseInjected
	}

	err := writeNormalizedContextFile(tempFile, []byte("payload"), time.Now())
	if err == nil {
		t.Fatal("expected writeNormalizedContextFile to fail")
	}
	if !errors.Is(err, errSyncInjected) {
		t.Fatalf("expected error to wrap primary sync cause: %v", err)
	}
	if !errors.Is(err, errCloseInjected) {
		t.Fatalf("expected error to join close cleanup error: %v", err)
	}
}

func TestWriteNormalizedContextFileRemoveErrorJoined(t *testing.T) {
	tempFile := filepath.Join(t.TempDir(), "notice.txt")
	errSyncInjected := errors.New("injected sync error")
	errRemoveInjected := errors.New("injected remove error")

	origSync := syncContextFile
	origRemove := removeContextFile
	defer func() {
		syncContextFile = origSync
		removeContextFile = origRemove
	}()

	syncContextFile = func(*os.File) error {
		return errSyncInjected
	}
	removeContextFile = func(path string) error {
		_ = os.Remove(path)
		return errRemoveInjected
	}

	err := writeNormalizedContextFile(tempFile, []byte("payload"), time.Now())
	if err == nil {
		t.Fatal("expected writeNormalizedContextFile to fail")
	}
	if !errors.Is(err, errSyncInjected) {
		t.Fatalf("expected error to wrap primary sync cause: %v", err)
	}
	if !errors.Is(err, errRemoveInjected) {
		t.Fatalf("expected error to join remove cleanup error: %v", err)
	}
}

func TestWriteContextDigestFieldLengthError(t *testing.T) {
	errInjected := errors.New("injected digest length write error")
	h := &failingHash{failCall: 1, err: errInjected}
	err := writeContextDigestField(h, []byte("payload"))
	if err == nil {
		t.Fatal("expected writeContextDigestField to fail on length write")
	}
	if !errors.Is(err, errInjected) {
		t.Fatalf("expected writeContextDigestField to return length error: %v", err)
	}
}

func TestWriteContextDigestFieldBodyError(t *testing.T) {
	errInjected := errors.New("injected digest body write error")
	h := &failingHash{failCall: 2, err: errInjected}
	err := writeContextDigestField(h, []byte("payload"))
	if err == nil {
		t.Fatal("expected writeContextDigestField to fail on body write")
	}
	if !errors.Is(err, errInjected) {
		t.Fatalf("expected writeContextDigestField to return body error: %v", err)
	}
}

func TestWriteDeterministicSourceBundleEntryFailureTarCloseErrorJoined(t *testing.T) {
	errEntryInjected := errors.New("injected entry write error")
	errTarCloseInjected := errors.New("injected tar close error")

	origEntry := writeSourceBundleEntryHook
	origTarClose := closeTarWriter
	defer func() {
		writeSourceBundleEntryHook = origEntry
		closeTarWriter = origTarClose
	}()

	writeSourceBundleEntryHook = func(*tar.Writer, string, sourceBundleEntry, int64) error {
		return errEntryInjected
	}
	closeTarWriter = func(*tar.Writer) error {
		return errTarCloseInjected
	}

	layout := BundleLayout{Root: "candidate", ChecksumManifest: "SHA256SUMS"}
	entries := []sourceBundleEntry{{Path: "file.txt", Body: []byte("hello")}}
	_, err := writeDeterministicSourceBundle(io.Discard, entries, layout, 1, 1024)
	if err == nil {
		t.Fatal("expected writeDeterministicSourceBundle to fail")
	}
	if !errors.Is(err, errEntryInjected) {
		t.Fatalf("expected error to wrap primary entry error: %v", err)
	}
	if !errors.Is(err, errTarCloseInjected) {
		t.Fatalf("expected error to join tar close error: %v", err)
	}
}

func TestWriteDeterministicSourceBundleEntryFailureGzipCloseErrorJoined(t *testing.T) {
	errEntryInjected := errors.New("injected entry write error")
	errGzipCloseInjected := errors.New("injected gzip close error")

	origEntry := writeSourceBundleEntryHook
	origGzipClose := closeGzipWriter
	defer func() {
		writeSourceBundleEntryHook = origEntry
		closeGzipWriter = origGzipClose
	}()

	writeSourceBundleEntryHook = func(*tar.Writer, string, sourceBundleEntry, int64) error {
		return errEntryInjected
	}
	closeGzipWriter = func(*gzip.Writer) error {
		return errGzipCloseInjected
	}

	layout := BundleLayout{Root: "candidate", ChecksumManifest: "SHA256SUMS"}
	entries := []sourceBundleEntry{{Path: "file.txt", Body: []byte("hello")}}
	_, err := writeDeterministicSourceBundle(io.Discard, entries, layout, 1, 1024)
	if err == nil {
		t.Fatal("expected writeDeterministicSourceBundle to fail")
	}
	if !errors.Is(err, errEntryInjected) {
		t.Fatalf("expected error to wrap primary entry error: %v", err)
	}
	if !errors.Is(err, errGzipCloseInjected) {
		t.Fatalf("expected error to join gzip close error: %v", err)
	}
}

func TestWriteDeterministicSourceBundleTarCloseFailureGzipCloseErrorJoined(t *testing.T) {
	errTarCloseInjected := errors.New("injected tar close error")
	errGzipCloseInjected := errors.New("injected gzip close error")

	origTarClose := closeTarWriter
	origGzipClose := closeGzipWriter
	defer func() {
		closeTarWriter = origTarClose
		closeGzipWriter = origGzipClose
	}()

	closeTarWriter = func(*tar.Writer) error {
		return errTarCloseInjected
	}
	closeGzipWriter = func(*gzip.Writer) error {
		return errGzipCloseInjected
	}

	layout := BundleLayout{Root: "candidate", ChecksumManifest: "SHA256SUMS"}
	entries := []sourceBundleEntry{{Path: "file.txt", Body: []byte("hello")}}
	_, err := writeDeterministicSourceBundle(io.Discard, entries, layout, 1, 1024)
	if err == nil {
		t.Fatal("expected writeDeterministicSourceBundle to fail")
	}
	if !errors.Is(err, errTarCloseInjected) {
		t.Fatalf("expected error to wrap tar close error: %v", err)
	}
	if !errors.Is(err, errGzipCloseInjected) {
		t.Fatalf("expected error to join gzip close error: %v", err)
	}
}
