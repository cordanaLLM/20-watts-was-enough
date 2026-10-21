package pdftools

import (
	"archive/tar"
	"compress/gzip"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"path"
	"slices"
	"strings"
	"time"
)

const maximumSourceBundleEntries = 128

type sourceBundleEntry struct {
	Path string
	Body []byte
}

type sourceBundleIdentity struct {
	SHA256                string
	Bytes                 int64
	ChecksumSHA256        string
	ChecksumBytes         int64
	PayloadFiles          int
	ArchiveFiles          int
	UncompressedFileBytes int64
}

type maximumWriter struct {
	destination io.Writer
	maximum     int64
	written     int64
}

func (writer *maximumWriter) Write(body []byte) (int, error) {
	if int64(len(body)) > writer.maximum-writer.written {
		return 0, errors.New("source bundle exceeds its compressed-byte boundary")
	}
	written, err := writer.destination.Write(body)
	writer.written += int64(written)
	return written, err
}

func candidateSourceEntries(
	ctx context.Context,
	authority checkedAuthority,
	spdx spdxIdentity,
	fetch sourceFetcher,
) ([]sourceBundleEntry, error) {
	if fetch == nil || len(authority.retention.Packages) != authority.contract.SourceDelivery.APKCount {
		return nil, errors.New("candidate source inputs do not match the PDF-tools authority")
	}
	entries := make([]sourceBundleEntry, 0, authority.contract.SourceDelivery.APKCount+16)
	for _, retained := range authority.retention.Packages {
		if err := ctx.Err(); err != nil {
			return nil, err
		}
		source := exactSource{Name: "APK " + retained.Name, URL: retained.URL, Size: retained.Size, SHA256: retained.SHA256}
		body, err := fetch(ctx, source)
		if err != nil {
			return nil, err
		}
		if int64(len(body)) != retained.Size || digestRaw(body) != retained.SHA256 {
			return nil, fmt.Errorf("fetched APK %s differs from its retention authority", retained.Name)
		}
		entries = append(entries, sourceBundleEntry{
			Path: path.Join(authority.contract.SourceDelivery.BundleLayout.APKDirectory, retained.Filename),
			Body: body,
		})
	}
	var err error
	entries, err = appendMaintainedSourceEntries(entries, authority)
	if err != nil {
		return nil, err
	}
	archive := authority.contract.Upstream.PopplerArchive
	body, err := fetch(ctx, exactSource{Name: "Poppler source archive", URL: archive.URL, Size: archive.Size, SHA256: archive.SHA256})
	if err != nil {
		return nil, err
	}
	if int64(len(body)) != archive.Size || digestRaw(body) != archive.SHA256 {
		return nil, errors.New("fetched Poppler archive differs from its authority")
	}
	entries = append(entries, sourceBundleEntry{Path: authority.contract.SourceDelivery.BundleLayout.PopplerArchive, Body: body})
	if int64(len(spdx.raw)) != spdx.RawSize || digestRaw(spdx.raw) != spdx.RawSHA256 ||
		int64(len(spdx.canonical)) != spdx.CanonicalSize ||
		digestRaw(spdx.canonical) != spdx.CanonicalSHA256 ||
		spdx.CanonicalSize != authority.contract.BaseImage.SPDXCanonicalSize ||
		spdx.CanonicalSHA256 != authority.contract.BaseImage.SPDXCanonicalSHA256 {
		return nil, errors.New("candidate SPDX differs from the admitted canonical apko graph")
	}
	entries = append(entries, sourceBundleEntry{
		Path: authority.contract.SourceDelivery.BundleLayout.SPDX, Body: slices.Clone(spdx.canonical),
	})
	if err := validateSourceBundleEntries(entries, authority.contract.Limits.SourceBundleBytes); err != nil {
		return nil, err
	}
	return entries, nil
}

func appendMaintainedSourceEntries(entries []sourceBundleEntry, authority checkedAuthority) ([]sourceBundleEntry, error) {
	type admittedSource struct {
		relative string
		sha256   string
		size     int64
	}
	sources := []admittedSource{
		{relative: authority.contract.Apko.Config, sha256: authority.contract.Apko.ConfigSHA256},
		{relative: authority.contract.Apko.Lock, sha256: authority.contract.Apko.LockSHA256},
		{relative: authority.contract.SourceDelivery.APKManifest, sha256: authority.contract.SourceDelivery.APKManifestSHA256},
		{relative: "contract.json", sha256: authority.contractSHA256},
	}
	for _, notice := range authority.contract.NoticeLayer.Entries {
		sources = append(sources, admittedSource{relative: notice.Source, sha256: notice.SHA256, size: notice.Size})
	}
	recipe := authority.contract.Upstream.WolfiRecipe
	sources = append(sources,
		admittedSource{relative: recipe.Snapshot, sha256: recipe.SHA256, size: recipe.Size},
		admittedSource{relative: recipe.License.Snapshot, sha256: recipe.License.SHA256, size: recipe.License.Size},
	)
	for _, source := range sources {
		body, err := readRelative(
			authority.root,
			"tooling/pdf-tools/"+source.relative,
			"candidate source "+source.relative,
			authority.contract.Limits.LockBytes,
		)
		if err != nil {
			return nil, err
		}
		if digestRaw(body) != source.sha256 || source.size > 0 && int64(len(body)) != source.size {
			return nil, fmt.Errorf("candidate source %s differs from its initially admitted authority", source.relative)
		}
		entries = append(entries, sourceBundleEntry{Path: source.relative, Body: body})
	}
	return entries, nil
}

func validateSourceBundleEntries(entries []sourceBundleEntry, maximumBytes int64) error {
	if len(entries) == 0 || len(entries)+1 > maximumSourceBundleEntries || maximumBytes <= 0 {
		return errors.New("source bundle entry inventory is outside its boundary")
	}
	seen := make(map[string]struct{}, len(entries))
	var total int64
	for _, entry := range entries {
		if !validBundlePath(entry.Path) || len(entry.Body) == 0 {
			return fmt.Errorf("source bundle entry path or body is invalid: %q", entry.Path)
		}
		if _, duplicate := seen[entry.Path]; duplicate {
			return fmt.Errorf("source bundle repeats path %s", entry.Path)
		}
		seen[entry.Path] = struct{}{}
		total += int64(len(entry.Body))
		if total > maximumBytes {
			return errors.New("source bundle payload exceeds its byte boundary")
		}
	}
	return nil
}

var (
	closeTarWriter             = (*tar.Writer).Close
	closeGzipWriter            = (*gzip.Writer).Close
	writeSourceBundleEntryHook = writeSourceBundleEntry
)

func writeDeterministicSourceBundle(
	destination io.Writer,
	entries []sourceBundleEntry,
	layout BundleLayout,
	epoch int64,
	maximumBytes int64,
) (sourceBundleIdentity, error) {
	if !validBundlePath(layout.Root) || strings.Contains(layout.Root, "/") ||
		!validBundlePath(layout.ChecksumManifest) || strings.Contains(layout.ChecksumManifest, "/") {
		return sourceBundleIdentity{}, errors.New("source bundle root or checksum path is invalid")
	}
	if err := validateSourceBundleEntries(entries, maximumBytes); err != nil {
		return sourceBundleIdentity{}, err
	}
	for _, entry := range entries {
		if entry.Path == layout.ChecksumManifest || len(layout.Root)+1+len(entry.Path) > 255 {
			return sourceBundleIdentity{}, errors.New("source bundle path collides with its checksum inventory or exceeds USTAR")
		}
	}
	ordered := slices.Clone(entries)
	slices.SortFunc(ordered, func(left, right sourceBundleEntry) int { return strings.Compare(left.Path, right.Path) })
	checksums := renderSourceChecksums(ordered)
	if sourceBundlePayloadBytes(ordered)+int64(len(checksums)) > maximumBytes {
		return sourceBundleIdentity{}, errors.New("source bundle including checksums exceeds its uncompressed-byte boundary")
	}
	ordered = append(ordered, sourceBundleEntry{Path: layout.ChecksumManifest, Body: checksums})
	slices.SortFunc(ordered, func(left, right sourceBundleEntry) int { return strings.Compare(left.Path, right.Path) })
	hasher := sha256.New()
	bounded := &maximumWriter{destination: io.MultiWriter(destination, hasher), maximum: maximumBytes}
	gzipWriter, err := gzip.NewWriterLevel(bounded, gzip.BestCompression)
	if err != nil {
		return sourceBundleIdentity{}, fmt.Errorf("create deterministic source-bundle compressor: %w", err)
	}
	gzipWriter.Header.ModTime = time.Unix(epoch, 0).UTC()
	gzipWriter.Header.OS = 255
	tarWriter := tar.NewWriter(gzipWriter)
	var uncompressed int64
	for _, entry := range ordered {
		if err := writeSourceBundleEntryHook(tarWriter, layout.Root, entry, epoch); err != nil {
			return sourceBundleIdentity{}, errors.Join(err, closeTarWriter(tarWriter), closeGzipWriter(gzipWriter))
		}
		uncompressed += int64(len(entry.Body))
	}
	if err := closeTarWriter(tarWriter); err != nil {
		return sourceBundleIdentity{}, errors.Join(
			fmt.Errorf("close deterministic source-bundle tar stream: %w", err),
			closeGzipWriter(gzipWriter),
		)
	}
	if err := closeGzipWriter(gzipWriter); err != nil {
		return sourceBundleIdentity{}, fmt.Errorf("close deterministic source-bundle gzip stream: %w", err)
	}
	return sourceBundleIdentity{
		SHA256: hex.EncodeToString(hasher.Sum(nil)), Bytes: bounded.written,
		ChecksumSHA256: digestRaw(checksums), ChecksumBytes: int64(len(checksums)),
		PayloadFiles: len(entries), ArchiveFiles: len(ordered), UncompressedFileBytes: uncompressed,
	}, nil
}

func renderSourceChecksums(entries []sourceBundleEntry) []byte {
	var checksums strings.Builder
	for _, entry := range entries {
		fmt.Fprintf(&checksums, "%s  %s\n", digestRaw(entry.Body), entry.Path)
	}
	return []byte(checksums.String())
}

func sourceBundlePayloadBytes(entries []sourceBundleEntry) int64 {
	var total int64
	for _, entry := range entries {
		total += int64(len(entry.Body))
	}
	return total
}

func writeSourceBundleEntry(writer *tar.Writer, root string, entry sourceBundleEntry, epoch int64) error {
	header := &tar.Header{
		Name: path.Join(root, entry.Path), Mode: 0o644, Size: int64(len(entry.Body)),
		ModTime: time.Unix(epoch, 0).UTC(), Typeflag: tar.TypeReg, Format: tar.FormatUSTAR,
	}
	if err := writer.WriteHeader(header); err != nil {
		return fmt.Errorf("write source-bundle header %s: %w", entry.Path, err)
	}
	if _, err := writer.Write(entry.Body); err != nil {
		return fmt.Errorf("write source-bundle entry %s: %w", entry.Path, err)
	}
	return nil
}

func validBundlePath(value string) bool {
	return value != "" && value != "." && len(value) <= 240 && !strings.ContainsAny(value, "\\\r\n\x00") &&
		!strings.HasPrefix(value, "/") && !strings.HasPrefix(value, "../") && path.Clean(value) == value && asciiPath(value)
}

func asciiPath(value string) bool {
	for _, character := range []byte(value) {
		if character > 0x7f {
			return false
		}
	}
	return true
}
