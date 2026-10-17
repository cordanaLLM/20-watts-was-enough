package clrscontext

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"

	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/fileidentity"
)

func hashBytes(body []byte) string { sum := sha256.Sum256(body); return hex.EncodeToString(sum[:]) }

func realDirectory(value string) (string, error) {
	absolute, err := filepath.Abs(value)
	if err != nil {
		return "", err
	}
	for current := absolute; ; current = filepath.Dir(current) {
		info, err := fileidentity.Lstat(current)
		if err != nil || !info.IsDir() || info.Mode()&os.ModeSymlink != 0 {
			return "", fmt.Errorf("CLRS context directory %q must contain only real directories", value)
		}
		if filepath.Dir(current) == current {
			break
		}
	}
	return absolute, nil
}

func sameFile(a, b os.FileInfo) bool {
	return a != nil && b != nil && a.Mode().IsRegular() && b.Mode().IsRegular() && os.SameFile(a, b) && a.Size() == b.Size() && a.Mode() == b.Mode() && a.ModTime() == b.ModTime()
}

func openStable(name string, maximum int64) (*os.File, os.FileInfo, error) {
	if _, err := realDirectory(filepath.Dir(name)); err != nil {
		return nil, nil, err
	}
	before, err := fileidentity.Lstat(name)
	if err != nil || !before.Mode().IsRegular() || before.Size() < 0 || before.Size() > maximum {
		return nil, nil, fmt.Errorf("CLRS context input %q is not a bounded regular file", name)
	}
	file, err := os.Open(name)
	if err != nil {
		return nil, nil, err
	}
	opened, err := file.Stat()
	named, namedErr := fileidentity.Lstat(name)
	if err != nil || namedErr != nil || !sameFile(before, opened) || !sameFile(opened, named) {
		file.Close()
		return nil, nil, errors.New("CLRS context input changed before read")
	}
	return file, opened, nil
}

func confirmFile(file *os.File, name string, before os.FileInfo) error {
	after, err := file.Stat()
	named, namedErr := fileidentity.Lstat(name)
	if err != nil || namedErr != nil || !sameFile(before, after) || !sameFile(after, named) {
		return errors.New("CLRS context input changed during read")
	}
	return nil
}

type contextReader struct {
	ctx    context.Context
	reader io.Reader
}

func (r contextReader) Read(buffer []byte) (int, error) {
	if err := r.ctx.Err(); err != nil {
		return 0, err
	}
	return r.reader.Read(buffer)
}

func readStable(ctx context.Context, name string, maximum int64) ([]byte, error) {
	file, before, err := openStable(name, maximum)
	if err != nil {
		return nil, err
	}
	defer file.Close()
	body, err := io.ReadAll(io.LimitReader(contextReader{ctx, file}, maximum+1))
	if err != nil {
		return nil, err
	}
	if int64(len(body)) != before.Size() {
		return nil, errors.New("CLRS context input changed size")
	}
	if err := confirmFile(file, name, before); err != nil {
		return nil, err
	}
	return body, nil
}

func copyMember(ctx context.Context, out io.Writer, m member) error {
	if m.input == "" {
		if int64(len(m.body)) != m.SizeBytes || hashBytes(m.body) != m.SHA256 {
			return errors.New("CLRS context memory member identity differs")
		}
		_, err := out.Write(m.body)
		return err
	}
	file, before, err := openStable(m.input, m.SizeBytes)
	if err != nil {
		return err
	}
	defer file.Close()
	digest := sha256.New()
	n, err := io.Copy(io.MultiWriter(out, digest), io.LimitReader(contextReader{ctx, file}, m.SizeBytes+1))
	if err != nil {
		return err
	}
	if n != m.SizeBytes || hex.EncodeToString(digest.Sum(nil)) != m.SHA256 {
		return fmt.Errorf("CLRS context member %s identity differs", m.Path)
	}
	return confirmFile(file, m.input, before)
}
