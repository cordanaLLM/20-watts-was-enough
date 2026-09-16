package clrscontext

import (
	"archive/tar"
	"bytes"
	"compress/gzip"
	"crypto/sha256"
	"errors"
	"fmt"
	"io"
	"path"
	"sort"
	"strings"

	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/clrsfixture"
)

const (
	sourceArchiveBytes = 64 << 20
	// The pinned archive includes a 50,178,045-byte accuracy_data.csv. Retain
	// the complete upstream source within the same 64 MiB total decoded cap.
	sourceFileBytes   = sourceArchiveBytes
	sourceEntryLimit  = 2048
	sourcePathBytes   = 200
	sourcePathDepth   = 16
	sourceBlockBytes  = 512
	sourceLicenseSize = 11358
)

type sourceEntry struct {
	Name string
	Data []byte
	Mode int64
}

type sourceTarEntry struct {
	header *tar.Header
	data   []byte
}

func sourceEntries(body []byte, expected clrsfixture.GeneratorSourceContext, source clrsfixture.SourceRecord) ([]sourceEntry, error) {
	if err := checkSourceIdentity(body, expected, source); err != nil {
		return nil, err
	}
	decoded, err := decodeSourceArchive(body)
	if err != nil {
		return nil, err
	}
	entries, err := readSourceTar(decoded, source.Commit)
	if err != nil {
		return nil, err
	}
	if err := checkSourceEntries(entries, expected.ArchiveRoot, source); err != nil {
		return nil, err
	}
	result := make([]sourceEntry, 0, len(entries))
	for _, entry := range entries {
		if entry.header.Typeflag == tar.TypeDir {
			continue
		}
		mode := int64(0o644)
		if entry.header.Mode&0o111 != 0 {
			mode = 0o755
		}
		result = append(result, sourceEntry{
			Name: "source/" + strings.TrimPrefix(entry.header.Name, expected.ArchiveRoot+"/"),
			Data: entry.data, Mode: mode,
		})
	}
	sort.Slice(result, func(i, j int) bool { return result[i].Name < result[j].Name })
	return result, nil
}

func checkSourceIdentity(body []byte, expected clrsfixture.GeneratorSourceContext, source clrsfixture.SourceRecord) error {
	identity, err := source.Identity()
	if err != nil {
		return fmt.Errorf("CLRS source authority: %w", err)
	}
	if expected.Repository != source.Repository || expected.Commit != source.Commit || expected.Tree != source.Tree ||
		expected.SourceID != identity.String() || expected.ArchiveRoot != "clrs-"+source.Commit ||
		expected.ArchiveURL != "https://codeload.github.com/google-deepmind/clrs/tar.gz/"+source.Commit {
		return errors.New("CLRS source archive context differs from source authority")
	}
	if expected.ArchiveSizeBytes <= 0 || expected.ArchiveSizeBytes > sourceArchiveBytes ||
		int64(len(body)) != expected.ArchiveSizeBytes || fmt.Sprintf("%x", sha256.Sum256(body)) != expected.ArchiveSHA256 {
		return errors.New("CLRS source archive size or SHA-256 differs from pinned compressed identity")
	}
	return nil
}

func decodeSourceArchive(body []byte) ([]byte, error) {
	compressed := bytes.NewReader(body)
	reader, err := gzip.NewReader(compressed)
	if err != nil {
		return nil, fmt.Errorf("open CLRS source gzip: %w", err)
	}
	// bytes.Reader provides ReadByte; gzip therefore leaves it exactly after
	// the first checked trailer when multistream decoding is disabled.
	reader.Multistream(false)
	decoded, readErr := io.ReadAll(io.LimitReader(reader, sourceArchiveBytes+1))
	closeErr := reader.Close()
	if err := errors.Join(readErr, closeErr); err != nil {
		return nil, fmt.Errorf("read CLRS source gzip: %w", err)
	}
	if len(decoded) > sourceArchiveBytes {
		return nil, errors.New("CLRS source gzip exceeds decoded byte limit")
	}
	if compressed.Len() != 0 {
		return nil, errors.New("CLRS source gzip has a second stream or trailing bytes")
	}
	return decoded, nil
}

func readSourceTar(body []byte, commit string) ([]sourceTarEntry, error) {
	if len(body) < 2*sourceBlockBytes || len(body) > sourceArchiveBytes || len(body)%sourceBlockBytes != 0 {
		return nil, errors.New("CLRS source tar is empty, oversized, or not block aligned")
	}
	entries := make([]sourceTarEntry, 0, 128)
	for offset, records := 0, 0; offset < len(body); records++ {
		block := body[offset : offset+sourceBlockBytes]
		if sourceZeroBytes(block) {
			if len(body)-offset < 2*sourceBlockBytes || !sourceZeroBytes(body[offset:]) {
				return nil, errors.New("CLRS source tar terminator is incomplete or has trailing nonzero data")
			}
			return entries, nil
		}
		if records >= sourceEntryLimit {
			return nil, errors.New("CLRS source tar exceeds entry count limit")
		}
		// Next hides per-file PAX and GNU extensions. Inspect the raw type first
		// so no hidden record can rewrite a path, size, or sparse representation.
		if block[156] == tar.TypeXGlobalHeader && offset == 0 {
			if err := checkSourceGlobalPAX(body, commit); err != nil {
				return nil, err
			}
			offset += 2 * sourceBlockBytes
			continue
		}
		if block[156] != tar.TypeReg && block[156] != tar.TypeDir {
			return nil, errors.New("CLRS source tar contains a link, special entry, or unsupported metadata record")
		}
		header, err := tar.NewReader(bytes.NewReader(body[offset:])).Next()
		if err != nil {
			return nil, fmt.Errorf("parse CLRS source tar header at byte %d: %w", offset, err)
		}
		if err := checkSourceTarHeader(header, block); err != nil {
			return nil, err
		}
		start := offset + sourceBlockBytes
		end := start + int(header.Size)
		next := start + ((int(header.Size)+sourceBlockBytes-1)/sourceBlockBytes)*sourceBlockBytes
		if next > len(body) || !sourceZeroBytes(body[end:next]) {
			return nil, fmt.Errorf("CLRS source tar member %q is truncated or has nonzero padding", header.Name)
		}
		entries = append(entries, sourceTarEntry{header: header, data: body[start:end]})
		offset = next
	}
	return nil, errors.New("CLRS source tar is missing its two-block terminator")
}

func checkSourceTarHeader(header *tar.Header, block []byte) error {
	if header.Format != tar.FormatUSTAR || !sourceCanonicalUSTAR(block) ||
		header.Linkname != "" || len(header.PAXRecords) != 0 || len(header.Xattrs) != 0 ||
		header.Uid != 0 || header.Gid != 0 || header.Uname != "root" || header.Gname != "root" ||
		header.Devmajor != 0 || header.Devminor != 0 || !header.AccessTime.IsZero() || !header.ChangeTime.IsZero() ||
		header.Mode < 0 || header.Mode&^0o777 != 0 {
		return fmt.Errorf("CLRS source tar member %q has unsupported metadata, format, or mode", header.Name)
	}
	if header.Size < 0 || header.Size > sourceFileBytes || (header.Typeflag == tar.TypeDir && header.Size != 0) {
		return fmt.Errorf("CLRS source tar member %q has an invalid size", header.Name)
	}
	return nil
}

func sourceCanonicalUSTAR(block []byte) bool {
	if string(block[257:265]) != "ustar\x0000" || !sourceZeroBytes(block[500:]) {
		return false
	}
	for _, field := range [][]byte{block[:100], block[157:257], block[265:297], block[297:329], block[345:500]} {
		if nul := bytes.IndexByte(field, 0); nul >= 0 && !sourceZeroBytes(field[nul:]) {
			return false
		}
	}
	for _, field := range [][]byte{block[100:108], block[108:116], block[116:124], block[124:136], block[136:148], block[329:337], block[337:345]} {
		if field[len(field)-1] != 0 {
			return false
		}
		for _, digit := range field[:len(field)-1] {
			if digit < '0' || digit > '7' {
				return false
			}
		}
	}
	return true
}

func checkSourceGlobalPAX(body []byte, commit string) error {
	const commentBytes = 52
	block := body[:sourceBlockBytes]
	want := []byte("52 comment=" + commit + "\n")
	header, err := tar.NewReader(bytes.NewReader(body)).Next()
	if err != nil {
		return fmt.Errorf("parse CLRS source global PAX: %w", err)
	}
	// archive/tar intentionally discards global header ownership and mode.
	// Validate those raw fields as well as the one exact permitted payload.
	if !sourceCanonicalUSTAR(block) || header.Name != "pax_global_header" || header.Format != tar.FormatPAX ||
		len(header.PAXRecords) != 1 || header.PAXRecords["comment"] != commit || len(header.Xattrs) != 0 ||
		string(block[100:108]) != "0000666\x00" || string(block[108:124]) != "0000000\x000000000\x00" ||
		string(block[124:136]) != "00000000064\x00" || !sourceZeroBytes(block[157:257]) ||
		strings.TrimRight(string(block[265:297]), "\x00") != "root" || strings.TrimRight(string(block[297:329]), "\x00") != "root" ||
		string(block[329:345]) != "0000000\x000000000\x00" || !sourceZeroBytes(block[345:500]) ||
		!bytes.Equal(body[sourceBlockBytes:sourceBlockBytes+commentBytes], want) ||
		!sourceZeroBytes(body[sourceBlockBytes+commentBytes:2*sourceBlockBytes]) {
		return errors.New("CLRS source global PAX differs from the exact pinned Git commit comment")
	}
	return nil
}

func sourceZeroBytes(body []byte) bool {
	for _, value := range body {
		if value != 0 {
			return false
		}
	}
	return true
}

func sourceSafePath(name string) bool {
	if len(name) == 0 || len(name) > sourcePathBytes || strings.Count(name, "/")+1 > sourcePathDepth {
		return false
	}
	for _, component := range strings.Split(name, "/") {
		if component == "" || component == "." || component == ".." {
			return false
		}
		for _, character := range []byte(component) {
			if (character < 'a' || character > 'z') && (character < 'A' || character > 'Z') &&
				(character < '0' || character > '9') && !strings.ContainsRune("._-+", rune(character)) {
				return false
			}
		}
	}
	return true
}

func checkSourceEntries(entries []sourceTarEntry, root string, source clrsfixture.SourceRecord) error {
	seen := make(map[string]bool, len(entries))
	bound := map[string]string{
		root + "/" + source.License.Path:      source.License.SHA256,
		root + "/" + source.Generator.Path:    source.Generator.SHA256,
		root + "/" + source.Requirements.Path: source.Requirements.SHA256,
	}
	for _, entry := range entries {
		name := entry.header.Name
		directory := entry.header.Typeflag == tar.TypeDir
		if directory {
			name = strings.TrimSuffix(name, "/")
		}
		if !sourceSafePath(name) || (name != root && !strings.HasPrefix(name, root+"/")) {
			return fmt.Errorf("CLRS source tar has unsafe or foreign path %q", entry.header.Name)
		}
		if _, duplicate := seen[name]; duplicate {
			return fmt.Errorf("CLRS source tar has duplicate path %q", name)
		}
		seen[name] = directory
		if expected, exists := bound[name]; exists {
			if directory || fmt.Sprintf("%x", sha256.Sum256(entry.data)) != expected ||
				(name == root+"/"+source.License.Path && len(entry.data) != sourceLicenseSize) {
				return fmt.Errorf("CLRS source authority-bound file %q differs in SHA-256, type, or licence size", name)
			}
			delete(bound, name)
		}
	}
	if !seen[root] || len(bound) != 0 {
		return errors.New("CLRS source root directory or authority-bound licence, generator, or requirements is missing")
	}
	for _, entry := range entries {
		name := strings.TrimSuffix(entry.header.Name, "/")
		for parent := path.Dir(name); parent != "."; parent = path.Dir(parent) {
			if !seen[parent] {
				return fmt.Errorf("CLRS source path %q has missing or non-directory parent %q", name, parent)
			}
		}
	}
	return nil
}
