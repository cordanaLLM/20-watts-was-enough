package pdftools

import (
	"archive/tar"
	"bytes"
	"compress/gzip"
	"io"
	"slices"
	"strings"
	"testing"
	"time"
)

func TestWriteDeterministicSourceBundleIsChecksumClosed(t *testing.T) {
	t.Parallel()
	entries := []sourceBundleEntry{{Path: "packages/b.apk", Body: []byte("bravo")}, {Path: "authority.json", Body: []byte("alpha")}}
	layout := BundleLayout{Root: "candidate-sources", ChecksumManifest: "SHA256SUMS"}
	const epoch = int64(1_785_757_696)
	var first bytes.Buffer
	firstIdentity, err := writeDeterministicSourceBundle(&first, entries, layout, epoch, 1024*1024)
	if err != nil {
		t.Fatal(err)
	}
	slices.Reverse(entries)
	var second bytes.Buffer
	secondIdentity, err := writeDeterministicSourceBundle(&second, entries, layout, epoch, 1024*1024)
	if err != nil {
		t.Fatal(err)
	}
	if firstIdentity != secondIdentity || !bytes.Equal(first.Bytes(), second.Bytes()) ||
		firstIdentity.PayloadFiles != 2 || firstIdentity.ArchiveFiles != 3 {
		t.Fatalf("bundle identities = %#v / %#v", firstIdentity, secondIdentity)
	}
	files, headers := readSourceBundle(t, first.Bytes())
	wantNames := []string{"candidate-sources/SHA256SUMS", "candidate-sources/authority.json", "candidate-sources/packages/b.apk"}
	if !slices.Equal(headers, wantNames) {
		t.Fatalf("bundle names = %v, want %v", headers, wantNames)
	}
	wantChecksums := digestRaw([]byte("alpha")) + "  authority.json\n" + digestRaw([]byte("bravo")) + "  packages/b.apk\n"
	if string(files["candidate-sources/SHA256SUMS"]) != wantChecksums ||
		firstIdentity.ChecksumSHA256 != digestRaw([]byte(wantChecksums)) {
		t.Fatalf("SHA256SUMS = %q", files["candidate-sources/SHA256SUMS"])
	}
}

func TestWriteDeterministicSourceBundleRejectsHostileInventory(t *testing.T) {
	t.Parallel()
	layout := BundleLayout{Root: "candidate", ChecksumManifest: "SHA256SUMS"}
	tests := map[string][]sourceBundleEntry{
		"escape":    {{Path: "../escape", Body: []byte("x")}},
		"absolute":  {{Path: "/escape", Body: []byte("x")}},
		"backslash": {{Path: `a\b`, Body: []byte("x")}},
		"non-ASCII": {{Path: "ümlaut", Body: []byte("x")}},
		"empty":     {{Path: "empty", Body: nil}},
		"duplicate": {{Path: "same", Body: []byte("x")}, {Path: "same", Body: []byte("y")}},
	}
	for name, entries := range tests {
		name, entries := name, entries
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			if _, err := writeDeterministicSourceBundle(io.Discard, entries, layout, 1, 1024); err == nil {
				t.Fatalf("writeDeterministicSourceBundle() accepted %s", name)
			}
		})
	}
	if _, err := writeDeterministicSourceBundle(
		io.Discard, []sourceBundleEntry{{Path: "large", Body: bytes.Repeat([]byte("x"), 1025)}}, layout, 1, 1024,
	); err == nil {
		t.Fatal("writeDeterministicSourceBundle() accepted oversized payload")
	}
	badLayout := BundleLayout{Root: "../candidate", ChecksumManifest: "SHA256SUMS"}
	if _, err := writeDeterministicSourceBundle(io.Discard, []sourceBundleEntry{{Path: "a", Body: []byte("x")}}, badLayout, 1, 1024); err == nil {
		t.Fatal("writeDeterministicSourceBundle() accepted escaping root")
	}
	if _, err := writeDeterministicSourceBundle(
		io.Discard, []sourceBundleEntry{{Path: "SHA256SUMS", Body: []byte("forged")}}, layout, 1, 1024,
	); err == nil {
		t.Fatal("writeDeterministicSourceBundle() accepted a checksum-path collision")
	}
}

func readSourceBundle(t *testing.T, body []byte) (map[string][]byte, []string) {
	t.Helper()
	gzipReader, err := gzip.NewReader(bytes.NewReader(body))
	if err != nil {
		t.Fatal(err)
	}
	if !gzipReader.ModTime.Equal(time.Unix(1_785_757_696, 0)) {
		t.Fatalf("gzip timestamp = %s", gzipReader.ModTime)
	}
	reader := tar.NewReader(gzipReader)
	files := make(map[string][]byte)
	var names []string
	const maximumSourceBundleEntries = 1024
	for iteration := 0; iteration <= maximumSourceBundleEntries; iteration++ {
		if iteration == maximumSourceBundleEntries {
			t.Fatalf("readSourceBundle exceeded maximum entries boundary %d", maximumSourceBundleEntries)
		}
		header, err := reader.Next()
		if err == io.EOF {
			break
		}
		if err != nil {
			t.Fatal(err)
		}
		if header.Typeflag != tar.TypeReg || header.Mode != 0o644 || header.Uid != 0 || header.Gid != 0 ||
			!header.ModTime.Equal(time.Unix(1_785_757_696, 0)) || strings.Contains(header.Name, "\\") {
			t.Fatalf("non-normalised tar header = %#v", header)
		}
		contents, err := io.ReadAll(reader)
		if err != nil {
			t.Fatal(err)
		}
		names = append(names, header.Name)
		files[header.Name] = contents
	}
	if err := gzipReader.Close(); err != nil {
		t.Fatal(err)
	}
	return files, names
}
