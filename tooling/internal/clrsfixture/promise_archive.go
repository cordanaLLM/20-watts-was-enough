package clrsfixture

import (
	"archive/tar"
	"archive/zip"
	"bytes"
	"compress/gzip"
	"encoding/binary"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"path"
	"sort"
	"strings"
	"time"
)

const (
	promiseArchiveRoot      = "promise-2.3"
	promiseWheelLicense     = "promise-2.3.dist-info/licenses/LICENSE"
	promiseArchiveBytes     = 256 << 10
	promiseArchiveFileBytes = 64 << 10
	promiseArchiveEntries   = 64
	promiseArchiveDepth     = 8
	promiseTarBlockBytes    = 512
)

type promiseTarEntry struct {
	header *tar.Header
	body   []byte
}

func preparePromiseSource(body []byte, source GeneratorWheelSourceBuild) ([]byte, error) {
	decoded, err := decodePromiseSource(body)
	if err != nil {
		return nil, err
	}
	entries, err := readPromiseTar(decoded, promiseArchiveBytes)
	if err != nil {
		return nil, fmt.Errorf("inspect promise source tar: %w", err)
	}
	if err := checkPromiseSourceEntries(entries, source.Provenance); err != nil {
		return nil, err
	}
	return canonicalPromiseTar(entries)
}

func decodePromiseSource(body []byte) ([]byte, error) {
	if len(body) == 0 || len(body) > promiseArchiveBytes {
		return nil, errors.New("promise source gzip exceeds compressed byte limit or is empty")
	}
	compressed := bytes.NewReader(body)
	reader, err := gzip.NewReader(compressed)
	if err != nil {
		return nil, fmt.Errorf("open promise source gzip: %w", err)
	}
	// bytes.Reader implements io.ByteReader, so disabling multistream leaves it
	// exactly after the first stream, including the checked gzip trailer.
	reader.Multistream(false)
	decoded, readErr := io.ReadAll(io.LimitReader(reader, promiseArchiveBytes+1))
	closeErr := reader.Close()
	if readErr != nil || closeErr != nil {
		return nil, fmt.Errorf("read promise source gzip: %w", errors.Join(readErr, closeErr))
	}
	if len(decoded) > promiseArchiveBytes {
		return nil, errors.New("promise source gzip exceeds expanded byte limit")
	}
	if compressed.Len() != 0 {
		return nil, errors.New("promise source gzip has a second member or trailing data")
	}
	return decoded, nil
}

func readPromiseTar(body []byte, limit int) ([]promiseTarEntry, error) {
	if len(body) < 2*promiseTarBlockBytes || len(body) > limit || len(body)%promiseTarBlockBytes != 0 {
		return nil, errors.New("tar byte count is empty, oversized, or not block aligned")
	}
	entries := make([]promiseTarEntry, 0, promiseArchiveEntries)
	for offset := 0; offset < len(body); {
		block := body[offset : offset+promiseTarBlockBytes]
		if promiseZeroBytes(block) {
			if len(body)-offset < 2*promiseTarBlockBytes || !promiseZeroBytes(body[offset:]) {
				return nil, errors.New("tar terminator is incomplete or followed by nonzero data")
			}
			return entries, nil
		}
		if len(entries) >= promiseArchiveEntries {
			return nil, errors.New("tar exceeds entry count limit")
		}
		// tar.Reader.Next hides PAX and GNU long-name records. Check the raw
		// type byte first, then let archive/tar own checksums and header parsing.
		if block[156] != tar.TypeReg && block[156] != tar.TypeDir {
			return nil, errors.New("tar contains a link, special entry, or metadata record")
		}
		header, err := tar.NewReader(bytes.NewReader(body[offset:])).Next()
		if err != nil {
			return nil, fmt.Errorf("parse tar header at byte %d: %w", offset, err)
		}
		if err := checkPromiseTarHeader(header); err != nil {
			return nil, err
		}
		start := offset + promiseTarBlockBytes
		end := start + int(header.Size)
		next := start + ((int(header.Size)+promiseTarBlockBytes-1)/promiseTarBlockBytes)*promiseTarBlockBytes
		if next > len(body) || !promiseZeroBytes(body[end:next]) {
			return nil, fmt.Errorf("tar member %q is truncated or has nonzero padding", header.Name)
		}
		entries = append(entries, promiseTarEntry{header: header, body: body[start:end]})
		offset = next
	}
	return nil, errors.New("tar is missing its two-block terminator")
}

func checkPromiseTarHeader(header *tar.Header) error {
	if header.Format != tar.FormatUSTAR && header.Format != tar.FormatGNU {
		return fmt.Errorf("tar member %q uses an unsupported format", header.Name)
	}
	if header.Linkname != "" || len(header.PAXRecords) != 0 || len(header.Xattrs) != 0 ||
		header.Devmajor != 0 || header.Devminor != 0 || header.Mode < 0 || header.Mode&^0o777 != 0 {
		return fmt.Errorf("tar member %q has unsupported metadata or mode", header.Name)
	}
	if header.Size < 0 || header.Size > promiseArchiveFileBytes || (header.Typeflag == tar.TypeDir && header.Size != 0) {
		return fmt.Errorf("tar member %q has an invalid size", header.Name)
	}
	return nil
}

func promiseZeroBytes(body []byte) bool {
	for _, value := range body {
		if value != 0 {
			return false
		}
	}
	return true
}

func promiseSafePath(name string) bool {
	if !fs.ValidPath(name) || name == "." || len(name) > 255 || strings.ContainsAny(name, "\\:") ||
		strings.Count(name, "/")+1 > promiseArchiveDepth {
		return false
	}
	for _, value := range name {
		if value < 0x20 || value == 0x7f {
			return false
		}
	}
	return true
}

func checkPromiseSourceEntries(entries []promiseTarEntry, provenance GeneratorWheelSourceProvenance) error {
	seen := make(map[string]bool, len(entries))
	licenseFound := false
	for _, entry := range entries {
		name := entry.header.Name
		isDirectory := entry.header.Typeflag == tar.TypeDir
		if isDirectory {
			name = strings.TrimSuffix(name, "/")
		}
		if !promiseSafePath(name) || (name != promiseArchiveRoot && !strings.HasPrefix(name, promiseArchiveRoot+"/")) {
			return fmt.Errorf("promise source contains unsafe or foreign path %q", entry.header.Name)
		}
		if _, duplicate := seen[name]; duplicate {
			return fmt.Errorf("promise source contains duplicate path %q", name)
		}
		seen[name] = isDirectory
		if name == promiseArchiveRoot+"/"+provenance.SourceLicensePath {
			if isDirectory || int64(len(entry.body)) != provenance.LicenseSizeBytes ||
				rawSHA256(entry.body) != provenance.LicenseSHA256 {
				return errors.New("promise source LICENSE does not match provenance")
			}
			licenseFound = true
		}
	}
	if !seen[promiseArchiveRoot] || !licenseFound {
		return errors.New("promise source root directory or provenance LICENSE is missing")
	}
	for _, entry := range entries {
		name := strings.TrimSuffix(entry.header.Name, "/")
		for parent := path.Dir(name); parent != "."; parent = path.Dir(parent) {
			if !seen[parent] {
				return fmt.Errorf("promise source path %q has missing or non-directory parent %q", name, parent)
			}
		}
	}
	return nil
}

func canonicalPromiseTar(entries []promiseTarEntry) ([]byte, error) {
	for _, entry := range entries {
		if entry.header.Typeflag == tar.TypeDir {
			entry.header.Name = strings.TrimSuffix(entry.header.Name, "/") + "/"
		}
	}
	sort.Slice(entries, func(left, right int) bool { return entries[left].header.Name < entries[right].header.Name })
	var body bytes.Buffer
	writer := tar.NewWriter(&body)
	for _, entry := range entries {
		header := &tar.Header{
			Name: entry.header.Name, Typeflag: entry.header.Typeflag, Size: int64(len(entry.body)),
			Mode: 0o644, Uid: 65532, Gid: 65532, ModTime: time.Unix(generatorSourceDateEpoch, 0),
			Format: tar.FormatUSTAR,
		}
		if header.Typeflag == tar.TypeDir {
			header.Mode = 0o755
		}
		if err := writer.WriteHeader(header); err != nil {
			return nil, fmt.Errorf("write canonical promise tar header %q: %w", header.Name, err)
		}
		if _, err := writer.Write(entry.body); err != nil {
			return nil, fmt.Errorf("write canonical promise tar member %q: %w", header.Name, err)
		}
	}
	if err := writer.Close(); err != nil {
		return nil, fmt.Errorf("close canonical promise tar: %w", err)
	}
	return body.Bytes(), nil
}

func verifyPromiseWheel(body []byte) error {
	if int64(len(body)) != promiseWheelSize || rawSHA256(body) != promiseWheelSHA256 {
		return errors.New("promise wheel size or SHA-256 differs from the selected wheel")
	}
	return checkPromiseWheelContents(body)
}

func checkPromiseWheelContents(body []byte) error {
	if err := checkPromiseZipEnvelope(body); err != nil {
		return err
	}
	reader, err := zip.NewReader(bytes.NewReader(body), int64(len(body)))
	if err != nil {
		return fmt.Errorf("open promise wheel ZIP: %w", err)
	}
	if len(reader.File) == 0 || len(reader.File) > promiseArchiveEntries {
		return errors.New("promise wheel ZIP has an invalid member count")
	}
	seen := make(map[string]bool, len(reader.File))
	var expanded uint64
	licenseFound := false
	for _, file := range reader.File {
		if !promiseSafePath(file.Name) || !file.Mode().IsRegular() || file.Mode()&(fs.ModeSetuid|fs.ModeSetgid|fs.ModeSticky) != 0 ||
			file.Flags&^uint16(0x808) != 0 || (file.Method != zip.Store && file.Method != zip.Deflate) {
			return fmt.Errorf("promise wheel ZIP member %q has an unsafe path, type, or encoding", file.Name)
		}
		if seen[file.Name] {
			return fmt.Errorf("promise wheel ZIP has duplicate member %q", file.Name)
		}
		seen[file.Name] = true
		if file.UncompressedSize64 > promiseArchiveFileBytes || file.CompressedSize64 > uint64(len(body)) {
			return fmt.Errorf("promise wheel ZIP member %q exceeds its byte limit", file.Name)
		}
		expanded += file.UncompressedSize64
		if expanded > promiseArchiveBytes {
			return errors.New("promise wheel ZIP exceeds expanded byte limit")
		}
		content, err := readPromiseZipMember(file)
		if err != nil {
			return err
		}
		if file.Name == promiseWheelLicense {
			if int64(len(content)) != promiseLicenseSize || rawSHA256(content) != promiseLicenseSHA256 {
				return errors.New("promise wheel embedded MIT LICENSE differs from the pinned license")
			}
			licenseFound = true
		}
	}
	for _, file := range reader.File {
		for parent := path.Dir(file.Name); parent != "."; parent = path.Dir(parent) {
			if seen[parent] {
				return fmt.Errorf("promise wheel ZIP member %q has non-directory parent %q", file.Name, parent)
			}
		}
	}
	if !licenseFound {
		return errors.New("promise wheel embedded MIT LICENSE is missing")
	}
	return nil
}

func checkPromiseZipEnvelope(body []byte) error {
	if len(body) < 22 || len(body) > promiseArchiveBytes || !bytes.HasPrefix(body, []byte("PK\x03\x04")) {
		return errors.New("promise wheel ZIP is empty, oversized, or has a prefix")
	}
	end := body[len(body)-22:]
	if !bytes.Equal(end[:4], []byte("PK\x05\x06")) || binary.LittleEndian.Uint16(end[20:22]) != 0 {
		return errors.New("promise wheel ZIP has a comment, trailing data, or missing terminator")
	}
	count := binary.LittleEndian.Uint16(end[10:12])
	directoryBytes := uint64(binary.LittleEndian.Uint32(end[12:16]))
	directoryOffset := uint64(binary.LittleEndian.Uint32(end[16:20]))
	if binary.LittleEndian.Uint16(end[4:6]) != 0 || binary.LittleEndian.Uint16(end[6:8]) != 0 ||
		binary.LittleEndian.Uint16(end[8:10]) != count || count == 0 || count > promiseArchiveEntries ||
		directoryOffset+directoryBytes != uint64(len(body)-22) { //#nosec G115 -- bounded >= 0 by len(body) >= 22 check at start of function
		return errors.New("promise wheel ZIP central directory is not one bounded complete disk")
	}
	return nil
}

func readPromiseZipMember(file *zip.File) ([]byte, error) {
	reader, err := file.Open()
	if err != nil {
		return nil, fmt.Errorf("open promise wheel ZIP member %q: %w", file.Name, err)
	}
	body, readErr := io.ReadAll(io.LimitReader(reader, promiseArchiveFileBytes+1))
	closeErr := reader.Close()
	if readErr != nil || closeErr != nil {
		return nil, fmt.Errorf("read promise wheel ZIP member %q: %w", file.Name, errors.Join(readErr, closeErr))
	}
	if uint64(len(body)) != file.UncompressedSize64 || len(body) > promiseArchiveFileBytes {
		return nil, fmt.Errorf("promise wheel ZIP member %q has an invalid expanded size", file.Name)
	}
	return body, nil
}

func parsePromiseOutput(body []byte) ([]byte, error) {
	entries, err := readPromiseTar(body, int(promiseMaximumOutputTarBytes))
	if err != nil {
		return nil, fmt.Errorf("inspect promise Docker output tar: %w", err)
	}
	seen := make(map[string]bool, len(entries))
	var wheel []byte
	for _, entry := range entries {
		name := entry.header.Name
		if entry.header.Typeflag == tar.TypeDir && (name == "." || name == "./") {
			name = "."
		} else {
			name = strings.TrimPrefix(name, "./")
			if name != promiseWheelFilename || entry.header.Typeflag != tar.TypeReg {
				return nil, fmt.Errorf("promise Docker output tar has unexpected member %q", entry.header.Name)
			}
			wheel = entry.body
		}
		if seen[name] {
			return nil, fmt.Errorf("promise Docker output tar has duplicate member %q", name)
		}
		seen[name] = true
	}
	if err := verifyPromiseWheel(wheel); err != nil {
		return nil, err
	}
	return bytes.Clone(wheel), nil
}
