package clrscontext

import (
	"archive/tar"
	"bytes"
	"compress/gzip"
	"crypto/sha256"
	"fmt"
	"os"
	"path/filepath"
	"reflect"
	"slices"
	"strings"
	"testing"
	"time"

	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/clrsfixture"
)

type sourceTestMember struct {
	header tar.Header
	data   []byte
}

func TestSourceEntriesCanonicalOrderAndModes(t *testing.T) {
	t.Parallel()
	members, record := sourceTestFixture(t)
	members[len(members)-1].header.Mode = 0o701
	archive := sourceTestGzip(t, sourceTestTar(t, members))
	first, err := sourceEntries(archive, sourceTestContext(t, archive, record), record)
	if err != nil {
		t.Fatal(err)
	}
	slices.Reverse(members)
	for index := range members {
		members[index].header.ModTime = time.Unix(1, 0)
	}
	archive = sourceTestGzip(t, sourceTestTar(t, members))
	second, err := sourceEntries(archive, sourceTestContext(t, archive, record), record)
	if err != nil || !reflect.DeepEqual(first, second) {
		t.Fatalf("ordering or mtime changed canonical entries: %v", err)
	}
	if len(first) != 4 || first[0].Name != "source/LICENSE" || first[3].Name != "source/run.sh" || first[3].Mode != 0o755 {
		t.Fatalf("canonical output shape: %#v", first)
	}
	for index, entry := range first {
		if index < 3 && entry.Mode != 0o644 {
			t.Fatalf("ordinary mode = %o", entry.Mode)
		}
		if index != 0 && first[index-1].Name >= entry.Name {
			t.Fatal("canonical output is not strictly sorted")
		}
	}
	if !bytes.Equal(first[0].Data, bytes.Repeat([]byte("L"), sourceLicenseSize)) || string(first[3].Data) != "#!/bin/sh\n" {
		t.Fatal("normalisation changed source file bytes")
	}
}

func TestSourceEntriesOnlyAllowExactInitialGitPAX(t *testing.T) {
	t.Parallel()
	members, record := sourceTestFixture(t)
	tarBody := sourceTestTar(t, members)
	pax := sourceTestGlobalPAX(t, record.Commit)
	body := sourceTestGzip(t, append(bytes.Clone(pax), tarBody...))
	entries, err := sourceEntries(body, sourceTestContext(t, body, record), record)
	if err != nil || len(entries) != 4 {
		t.Fatalf("exact initial Git PAX rejected: %v", err)
	}
	for name, change := range map[string]func([]byte){
		"wrong commit":     func(body []byte) { body[sourceBlockBytes+11] ^= 1 },
		"padding":          func(body []byte) { body[sourceBlockBytes+52] = 1 },
		"owner":            func(body []byte) { body[114] = '1'; sourceTestChecksum(body[:sourceBlockBytes]) },
		"mode":             func(body []byte) { body[105] = '7'; sourceTestChecksum(body[:sourceBlockBytes]) },
		"name":             func(body []byte) { body[0] = 'x'; sourceTestChecksum(body[:sourceBlockBytes]) },
		"hidden name data": func(body []byte) { body[99] = 'x'; sourceTestChecksum(body[:sourceBlockBytes]) },
		"checksum":         func(body []byte) { body[0] ^= 1 },
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			changed := append(bytes.Clone(pax), tarBody...)
			change(changed)
			sourceTestReject(t, sourceTestGzip(t, changed), record, "PAX")
		})
	}
	sourceTestReject(t, sourceTestGzip(t, append(append(bytes.Clone(pax), pax...), tarBody...)), record, "metadata")
	sourceTestReject(t, sourceTestGzip(t, append(append(bytes.Clone(tarBody[:sourceBlockBytes]), pax...), tarBody[sourceBlockBytes:]...)), record, "metadata")
}

func TestSourceEntriesRejectUnsafePathsAndParents(t *testing.T) {
	t.Parallel()
	valid, record := sourceTestFixture(t)
	root := "clrs-" + record.Commit
	for name, pathname := range map[string]string{
		"escape": root + "/../escape", "absolute": "/" + root + "/escape", "foreign": "other/file",
		"backslash": root + "/a\\b", "colon": root + "/a:b", "non-ASCII": root + "/ä",
		"space": root + "/a b", "newline": root + "/a\nb", "dot": root + "/./file",
		"empty":          root + "//file",
		"long":           root + "/" + strings.Repeat("a", sourcePathBytes),
		"deep":           root + "/" + strings.Repeat("a/", sourcePathDepth) + "file",
		"missing parent": root + "/missing/file", "file parent": root + "/LICENSE/file",
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			member := sourceTestFile(pathname, nil)
			// GNU/PAX encodings of unrepresentable test paths must also fail.
			member.header.Format = tar.FormatUnknown
			sourceTestReject(t, sourceTestGzip(t, sourceTestTar(t, append(slices.Clone(valid), member))), record, "")
		})
	}
	sourceTestReject(t, sourceTestGzip(t, sourceTestTar(t, append(slices.Clone(valid), valid[1]))), record, "duplicate")
	sourceTestReject(t, sourceTestGzip(t, sourceTestTar(t, valid[1:])), record, "root directory")
	directory := sourceTestFile(root+"/LICENSE/", nil)
	directory.header.Typeflag = tar.TypeDir
	sourceTestReject(t, sourceTestGzip(t, sourceTestTar(t, append(slices.Clone(valid), directory))), record, "duplicate")
	trailingSlash := sourceTestTar(t, valid)
	trailingSlash[156] = tar.TypeReg
	sourceTestChecksum(trailingSlash[:sourceBlockBytes])
	sourceTestReject(t, sourceTestGzip(t, trailingSlash), record, "unsafe")
}

func TestSourceEntriesRejectSpecialEntriesAndMetadata(t *testing.T) {
	t.Parallel()
	valid, record := sourceTestFixture(t)
	for name, change := range map[string]func(*tar.Header){
		"symlink":          func(h *tar.Header) { h.Typeflag = tar.TypeSymlink; h.Linkname = "LICENSE" },
		"hardlink":         func(h *tar.Header) { h.Typeflag = tar.TypeLink; h.Linkname = "LICENSE" },
		"FIFO":             func(h *tar.Header) { h.Typeflag = tar.TypeFifo },
		"block device":     func(h *tar.Header) { h.Typeflag = tar.TypeBlock },
		"character device": func(h *tar.Header) { h.Typeflag = tar.TypeChar },
		"setuid":           func(h *tar.Header) { h.Mode = 0o4644 },
		"setgid":           func(h *tar.Header) { h.Mode = 0o2644 },
		"sticky":           func(h *tar.Header) { h.Mode = 0o1644 },
		"uid":              func(h *tar.Header) { h.Uid = 7 },
		"gid":              func(h *tar.Header) { h.Gid = 7 },
		"uname":            func(h *tar.Header) { h.Uname = "other" },
		"gname":            func(h *tar.Header) { h.Gname = "other" },
		"GNU":              func(h *tar.Header) { h.Format = tar.FormatGNU },
		"PAX":              func(h *tar.Header) { h.Format = tar.FormatPAX; h.PAXRecords = map[string]string{"vendor.key": "value"} },
		"extended path": func(h *tar.Header) {
			h.Format = tar.FormatPAX
			h.Name += strings.Repeat("a", 101)
			h.PAXRecords = map[string]string{"path": "../escape"}
		},
		"xattr": func(h *tar.Header) {
			h.Format = tar.FormatPAX
			h.Xattrs = map[string]string{"security.capability": "bad"}
		},
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			member := sourceTestFile("clrs-"+record.Commit+"/special", nil)
			change(&member.header)
			sourceTestReject(t, sourceTestGzip(t, sourceTestTar(t, append(slices.Clone(valid), member))), record, "")
		})
	}
	for name, kind := range map[string]byte{"sparse": tar.TypeGNUSparse, "long name": tar.TypeGNULongName, "long link": tar.TypeGNULongLink} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			body := sourceTestTar(t, valid)
			body[156] = kind
			sourceTestChecksum(body[:sourceBlockBytes])
			sourceTestReject(t, sourceTestGzip(t, body), record, "special entry")
		})
	}
}

func TestSourceEntriesRejectBadFraming(t *testing.T) {
	t.Parallel()
	members, record := sourceTestFixture(t)
	valid := sourceTestTar(t, members)
	checksum := bytes.Clone(valid)
	checksum[0] ^= 1
	padding := bytes.Clone(valid)
	padding[2*sourceBlockBytes+sourceLicenseSize] = 1
	hidden := bytes.Clone(valid)
	hidden[500] = 1
	sourceTestChecksum(hidden[:sourceBlockBytes])
	for name, body := range map[string][]byte{
		"checksum": checksum, "padding": padding, "hidden metadata": hidden,
		"one terminator": valid[:len(valid)-sourceBlockBytes], "no terminator": valid[:len(valid)-2*sourceBlockBytes],
		"partial block": valid[:len(valid)-1], "second tar": append(bytes.Clone(valid), valid...),
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			sourceTestReject(t, sourceTestGzip(t, body), record, "tar")
		})
	}
	compressed := sourceTestGzip(t, valid)
	crc := bytes.Clone(compressed)
	crc[len(crc)-8] ^= 1
	for name, body := range map[string][]byte{
		"CRC": crc, "truncated": compressed[:len(compressed)-5], "empty": sourceTestGzip(t, nil),
		"second gzip":   append(bytes.Clone(compressed), sourceTestGzip(t, nil)...),
		"trailing zero": append(bytes.Clone(compressed), 0), "trailing data": append(bytes.Clone(compressed), 'x'),
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			sourceTestReject(t, body, record, "")
		})
	}
}

func TestSourceEntriesRejectAuthorityMismatch(t *testing.T) {
	t.Parallel()
	valid, record := sourceTestFixture(t)
	body := sourceTestGzip(t, sourceTestTar(t, valid))
	for name, mutate := range map[string]func(*clrsfixture.GeneratorSourceContext){
		"size":       func(c *clrsfixture.GeneratorSourceContext) { c.ArchiveSizeBytes++ },
		"digest":     func(c *clrsfixture.GeneratorSourceContext) { c.ArchiveSHA256 = strings.Repeat("1", 64) },
		"root":       func(c *clrsfixture.GeneratorSourceContext) { c.ArchiveRoot = "clrs" },
		"commit":     func(c *clrsfixture.GeneratorSourceContext) { c.Commit = strings.Repeat("1", 40) },
		"tree":       func(c *clrsfixture.GeneratorSourceContext) { c.Tree = strings.Repeat("1", 40) },
		"repository": func(c *clrsfixture.GeneratorSourceContext) { c.Repository = "https://example.invalid" },
		"URL":        func(c *clrsfixture.GeneratorSourceContext) { c.ArchiveURL += "/" },
		"source ID":  func(c *clrsfixture.GeneratorSourceContext) { c.SourceID = "sha256:" + strings.Repeat("1", 64) },
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			context := sourceTestContext(t, body, record)
			mutate(&context)
			if entries, err := sourceEntries(body, context, record); err == nil || entries != nil {
				t.Fatalf("source identity mismatch accepted: %v", err)
			}
		})
	}
	for _, index := range []int{1, 5, 7} {
		changed := slices.Clone(valid)
		changed[index].data = []byte("tampered")
		sourceTestReject(t, sourceTestGzip(t, sourceTestTar(t, changed)), record, "authority-bound")
		sourceTestReject(t, sourceTestGzip(t, sourceTestTar(t, append(slices.Clone(valid[:index]), valid[index+1:]...))), record, "missing")
	}
	invalid := record
	invalid.Authority = "RESULT"
	if _, err := sourceEntries(body, sourceTestContext(t, body, record), invalid); err == nil {
		t.Fatal("invalid source authority accepted")
	}
	// The compressed identity is rejected before any attempted gzip decoding.
	if _, err := sourceEntries([]byte("not gzip"), sourceTestContext(t, body, record), record); err == nil || !strings.Contains(err.Error(), "compressed identity") {
		t.Fatalf("compressed identity was not the first decoder gate: %v", err)
	}
}

func TestSourceEntriesBoundedCountsAndSizes(t *testing.T) {
	valid, record := sourceTestFixture(t)
	tooMany := slices.Clone(valid)
	for index := len(tooMany); index <= sourceEntryLimit; index++ {
		tooMany = append(tooMany, sourceTestFile(fmt.Sprintf("clrs-%s/file-%d", record.Commit, index), nil))
	}
	sourceTestReject(t, sourceTestGzip(t, sourceTestTar(t, tooMany)), record, "entry count")
	// An oversized advertised regular-file length is rejected at the header,
	// without constructing or allocating a 64 MiB member in this fixture.
	large := sourceTestTar(t, valid)
	large[156] = tar.TypeReg
	copy(large[124:136], fmt.Sprintf("%011o\x00", sourceFileBytes+1))
	sourceTestChecksum(large[:sourceBlockBytes])
	sourceTestReject(t, sourceTestGzip(t, large), record, "invalid size")
	sourceTestReject(t, sourceTestGzip(t, make([]byte, sourceArchiveBytes+1)), record, "decoded byte limit")
	body := sourceTestGzip(t, sourceTestTar(t, valid))
	context := sourceTestContext(t, body, record)
	context.ArchiveSizeBytes = sourceArchiveBytes + 1
	if _, err := sourceEntries(body, context, record); err == nil || !strings.Contains(err.Error(), "compressed identity") {
		t.Fatalf("unbounded compressed identity accepted: %v", err)
	}
}

func TestSourceEntriesPinnedArchive(t *testing.T) {
	archivePath := os.Getenv("CLRS_SOURCE_ARCHIVE_TEST_PATH")
	if archivePath == "" {
		t.Skip("set CLRS_SOURCE_ARCHIVE_TEST_PATH to the retained pinned gzip; no download is performed")
	}
	root := filepath.Join("..", "..", "clrs-generator")
	sourceBytes, err := os.ReadFile(filepath.Join(root, "upstream.json"))
	if err != nil {
		t.Fatal(err)
	}
	record, err := clrsfixture.ParseSourceRecord(sourceBytes)
	if err != nil {
		t.Fatal(err)
	}
	inputBytes, err := os.ReadFile(filepath.Join(root, "lock-input.json"))
	if err != nil {
		t.Fatal(err)
	}
	input, err := clrsfixture.ParseGeneratorLockInput(inputBytes, record)
	if err != nil {
		t.Fatal(err)
	}
	body, err := os.ReadFile(archivePath)
	if err != nil {
		t.Fatal(err)
	}
	entries, err := sourceEntries(body, input.SourceContext, record)
	if err != nil {
		t.Fatal(err)
	}
	var size int
	for _, entry := range entries {
		size += len(entry.Data)
	}
	if len(entries) != 61 || size != 54341472 {
		t.Fatalf("pinned archive output = %d files/%d bytes, want 61/54341472", len(entries), size)
	}
	t.Logf("pinned compressed SHA-256=%x; %d regular files; %d source bytes", sha256.Sum256(body), len(entries), size)
}

func sourceTestFixture(t *testing.T) ([]sourceTestMember, clrsfixture.SourceRecord) {
	t.Helper()
	license := bytes.Repeat([]byte("L"), sourceLicenseSize)
	generator, requirements := []byte("print('fixture')\n"), []byte("example==1\n")
	record := clrsfixture.SourceRecord{
		SchemaVersion: 1, Authority: clrsfixture.ResultAuthority, Repository: "https://github.com/google-deepmind/clrs",
		Commit: strings.Repeat("a", 40), Tree: strings.Repeat("b", 40), InspectedOn: "2026-09-05",
		License:      clrsfixture.LicenseIdentity{SPDX: "Apache-2.0", Path: "LICENSE", SHA256: fmt.Sprintf("%x", sha256.Sum256(license))},
		Generator:    clrsfixture.FileIdentity{Path: "clrs/_src/clrs_text/generate_clrs_text.py", SHA256: fmt.Sprintf("%x", sha256.Sum256(generator))},
		Requirements: clrsfixture.FileIdentity{Path: "requirements/requirements.txt", SHA256: fmt.Sprintf("%x", sha256.Sum256(requirements))},
	}
	root := "clrs-" + record.Commit
	directory := func(name string) sourceTestMember {
		member := sourceTestFile(name+"/", nil)
		member.header.Typeflag, member.header.Mode = tar.TypeDir, 0o775
		return member
	}
	return []sourceTestMember{
		directory(root), sourceTestFile(root+"/LICENSE", license), directory(root + "/clrs"), directory(root + "/clrs/_src"),
		directory(root + "/clrs/_src/clrs_text"), sourceTestFile(root+"/"+record.Generator.Path, generator),
		directory(root + "/requirements"), sourceTestFile(root+"/"+record.Requirements.Path, requirements),
		sourceTestFile(root+"/run.sh", []byte("#!/bin/sh\n")),
	}, record
}

func sourceTestFile(name string, data []byte) sourceTestMember {
	return sourceTestMember{header: tar.Header{Name: name, Mode: 0o664, Typeflag: tar.TypeReg, Uname: "root", Gname: "root", ModTime: time.Unix(1787658740, 0), Format: tar.FormatUSTAR}, data: data}
}

func sourceTestTar(t *testing.T, members []sourceTestMember) []byte {
	t.Helper()
	var buffer bytes.Buffer
	writer := tar.NewWriter(&buffer)
	for _, member := range members {
		member.header.Size = int64(len(member.data))
		if err := writer.WriteHeader(&member.header); err != nil {
			t.Fatal(err)
		}
		if _, err := writer.Write(member.data); err != nil {
			t.Fatal(err)
		}
	}
	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}
	return buffer.Bytes()
}

func sourceTestGzip(t *testing.T, body []byte) []byte {
	t.Helper()
	var buffer bytes.Buffer
	writer := gzip.NewWriter(&buffer)
	if _, err := writer.Write(body); err != nil {
		t.Fatal(err)
	}
	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}
	return buffer.Bytes()
}

func sourceTestContext(t *testing.T, body []byte, record clrsfixture.SourceRecord) clrsfixture.GeneratorSourceContext {
	t.Helper()
	identity, err := record.Identity()
	if err != nil {
		t.Fatal(err)
	}
	return clrsfixture.GeneratorSourceContext{
		Repository: record.Repository, Commit: record.Commit, Tree: record.Tree, SourceID: identity.String(),
		ArchiveRoot: "clrs-" + record.Commit, ArchiveURL: "https://codeload.github.com/google-deepmind/clrs/tar.gz/" + record.Commit,
		ArchiveSizeBytes: int64(len(body)), ArchiveSHA256: fmt.Sprintf("%x", sha256.Sum256(body)),
	}
}

func sourceTestReject(t *testing.T, body []byte, record clrsfixture.SourceRecord, contains string) {
	t.Helper()
	entries, err := sourceEntries(body, sourceTestContext(t, body, record), record)
	if err == nil || entries != nil || !strings.Contains(err.Error(), contains) {
		t.Fatalf("source error = %v, entries = %d, want %q", err, len(entries), contains)
	}
}

func sourceTestGlobalPAX(t *testing.T, commit string) []byte {
	t.Helper()
	member := sourceTestFile("pax_global_header", []byte("52 comment="+commit+"\n"))
	member.header.Mode = 0o666
	body := sourceTestTar(t, []sourceTestMember{member})[:2*sourceBlockBytes]
	body[156] = tar.TypeXGlobalHeader
	sourceTestChecksum(body[:sourceBlockBytes])
	return body
}

func sourceTestChecksum(block []byte) {
	copy(block[148:156], "        ")
	var sum int
	for _, value := range block {
		sum += int(value)
	}
	copy(block[148:156], fmt.Sprintf("%06o\x00 ", sum))
}
