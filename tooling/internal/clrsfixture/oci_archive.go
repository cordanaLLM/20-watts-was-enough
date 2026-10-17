package clrsfixture

import (
	"archive/tar"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"

	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/fileidentity"
)

type generatorOCIArchive struct {
	file               *os.File
	root               *os.Root
	parent, name       string
	before, parentInfo os.FileInfo
}

type generatorOCIMember struct {
	offset, size int64
	digest       string
}

type generatorOCIReader struct {
	ctx    context.Context
	reader io.Reader
}

func (reader generatorOCIReader) Read(body []byte) (int, error) {
	if err := reader.ctx.Err(); err != nil {
		return 0, err
	}
	return reader.reader.Read(body)
}

func openGeneratorOCIArchive(filename string, expectedBytes int64) (archive generatorOCIArchive, err error) {
	archive.parent, err = cleanGeneratorRoot(filepath.Dir(filename))
	if err != nil {
		return archive, err
	}
	archive.name = filepath.Base(filename)
	archive.parentInfo, err = inspectGeneratorRootPath(archive.parent)
	if err != nil {
		return archive, err
	}
	archive.before, err = fileidentity.Lstat(filepath.Join(archive.parent, archive.name))
	if err != nil || !archive.before.Mode().IsRegular() || archive.before.Size() != expectedBytes {
		return archive, errors.New("OCI archive must be a nonsymlink regular file of the exact expected size")
	}
	archive.root, err = os.OpenRoot(archive.parent)
	if err != nil {
		return archive, err
	}
	defer func() {
		if err != nil {
			err = errors.Join(err, archive.root.Close())
		}
	}()
	archive.file, err = archive.root.Open(archive.name)
	if err != nil {
		return archive, err
	}
	if err = archive.checkIdentity(); err != nil {
		err = errors.Join(err, archive.file.Close())
	}
	return archive, err
}

func (archive generatorOCIArchive) checkIdentity() error {
	parent, err := inspectGeneratorRootPath(archive.parent)
	if err != nil || !os.SameFile(archive.parentInfo, parent) || archive.parentInfo.Mode() != parent.Mode() {
		return errors.New("OCI archive parent changed")
	}
	openedParent, err := archive.root.Stat(".")
	if err != nil || !os.SameFile(parent, openedParent) {
		return errors.New("OCI opened parent differs from its pathname")
	}
	opened, err := archive.file.Stat()
	if err != nil || !unchangedGeneratorFile(archive.before, opened) {
		return errors.New("OCI opened archive identity changed")
	}
	current, err := fileidentity.Lstat(filepath.Join(archive.parent, archive.name))
	if err != nil || !unchangedGeneratorFile(archive.before, current) {
		return errors.New("OCI archive pathname changed")
	}
	return nil
}

func (archive generatorOCIArchive) check(ctx context.Context, options GeneratorOCIOptions) error {
	if err := archive.checkIdentity(); err != nil {
		return err
	}
	stream := io.NewSectionReader(archive.file, 0, options.ExpectedArchiveBytes+1)
	hasher := sha256.New()
	n, err := io.Copy(hasher, generatorOCIReader{ctx, stream})
	if err != nil || n != options.ExpectedArchiveBytes || hex.EncodeToString(hasher.Sum(nil)) != options.ExpectedArchiveSHA256 {
		return errors.Join(err, errors.New("OCI whole-archive size or hash differs from the supplied identity"))
	}
	return errors.Join(archive.checkIdentity(), ctx.Err())
}

func scanGeneratorOCI(ctx context.Context, file *os.File, size int64, limits GeneratorOCILimits) (map[string]generatorOCIMember, error) {
	if size < 1024 || size > limits.ArchiveBytes || size%512 != 0 {
		return nil, errors.New("OCI outer tar size violates its framing boundary")
	}
	stream := &io.LimitedReader{R: generatorOCIReader{ctx, io.NewSectionReader(file, 0, size+1)}, N: size + 1}
	reader := tar.NewReader(stream)
	members := make(map[string]generatorOCIMember)
	var padding int64
	for {
		before := stream.N
		header, err := reader.Next()
		consumed := before - stream.N
		if errors.Is(err, io.EOF) {
			if consumed != padding+1024 {
				return nil, errors.New("OCI tar requires its complete two-block terminator")
			}
			break
		}
		if err != nil {
			return nil, err
		}
		// Next hides PAX/GNU extension headers. Refuse their extra physical bytes
		// before recording an offset into the original unmodified file content.
		if consumed != padding+512 || len(members) >= limits.Members {
			return nil, errors.New("OCI tar has extension headers or exceeds its member bound")
		}
		name, err := generatorOCIMemberName(header)
		if err != nil {
			return nil, err
		}
		if _, duplicate := members[name]; duplicate {
			return nil, errors.New("OCI tar repeats a member")
		}
		padding = (512 - header.Size%512) % 512
		if header.Typeflag == tar.TypeDir {
			members[name] = generatorOCIMember{}
			continue
		}
		if header.Size < 1 || header.Size > limits.ArchiveBytes {
			return nil, errors.New("OCI regular member size violates its byte boundary")
		}
		item := generatorOCIMember{offset: size + 1 - stream.N, size: header.Size}
		hasher := sha256.New()
		if n, err := io.Copy(hasher, reader); err != nil || n != item.size {
			return nil, errors.Join(err, errors.New("OCI member size differs from its header"))
		}
		item.digest = "sha256:" + hex.EncodeToString(hasher.Sum(nil))
		if strings.HasPrefix(name, "blobs/") && item.digest != "sha256:"+strings.TrimPrefix(name, "blobs/sha256/") {
			return nil, errors.New("OCI blob pathname differs from its content hash")
		}
		members[name] = item
	}
	var buffer [4096]byte
	for {
		n, err := stream.Read(buffer[:])
		for _, value := range buffer[:n] {
			if value != 0 {
				return nil, errors.New("OCI tar contains nonzero trailing framing")
			}
		}
		if errors.Is(err, io.EOF) {
			break
		}
		if err != nil {
			return nil, err
		}
	}
	if stream.N != 1 {
		return nil, errors.New("OCI tar size changed during scanning")
	}
	return members, ctx.Err()
}

func generatorOCIMemberName(header *tar.Header) (string, error) {
	if header.Linkname != "" || len(header.PAXRecords)+len(header.Xattrs) != 0 {
		return "", errors.New("OCI tar links and metadata reinterpretation are forbidden")
	}
	if header.Typeflag == tar.TypeDir && header.Size == 0 {
		name := strings.TrimSuffix(header.Name, "/")
		if name == "blobs" || name == "blobs/sha256" {
			return name, nil
		}
	}
	if header.Typeflag == tar.TypeReg {
		if header.Name == "oci-layout" || header.Name == "index.json" ||
			(strings.HasPrefix(header.Name, "blobs/sha256/") && lowerHex(strings.TrimPrefix(header.Name, "blobs/sha256/"), 64)) {
			return header.Name, nil
		}
	}
	return "", fmt.Errorf("OCI tar member type/path is outside the closed CLRS profile: %q", header.Name)
}
