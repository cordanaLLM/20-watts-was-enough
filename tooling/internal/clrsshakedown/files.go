package clrsshakedown

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"runtime"
	"strings"

	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/strictjson"
)

func validateOptions(options Options) error {
	if options.RepositoryRoot == "" || options.DatasetDirectory == "" || options.OutputDirectory == "" || len(options.RunID) == 0 || len(options.RunID) > 128 {
		return errors.New("shakedown requires explicit repository, dataset, output and bounded run identity")
	}
	for _, c := range []byte(options.RunID) {
		if !(c >= 'a' && c <= 'z' || c >= 'A' && c <= 'Z' || c >= '0' && c <= '9' || strings.ContainsRune("._:-", rune(c))) {
			return errors.New("shakedown run identity contains unsupported characters")
		}
	}
	decoded, err := hex.DecodeString(options.ExpectedTreeSHA256)
	if err != nil || len(decoded) != sha256.Size || hex.EncodeToString(decoded) != options.ExpectedTreeSHA256 {
		return errors.New("shakedown requires an independent 64-character lowercase fixture tree SHA-256")
	}
	return nil
}

func resolveOutput(options Options) (string, error) {
	value := options.OutputDirectory
	if len(value) > 4096 || strings.ContainsAny(value, "\x00\r\n") {
		return "", errors.New("invalid shakedown output path")
	}
	if !filepath.IsAbs(value) {
		value = filepath.Join(options.RepositoryRoot, value)
	}
	return filepath.Abs(value)
}

func openDirectory(path string) (*os.Root, error) {
	absolute, err := filepath.Abs(path)
	if err != nil {
		return nil, err
	}
	current := filepath.VolumeName(absolute) + string(filepath.Separator)
	for _, component := range strings.Split(strings.TrimPrefix(absolute, current), string(filepath.Separator)) {
		if component == "" {
			continue
		}
		current = filepath.Join(current, component)
		info, err := os.Lstat(current)
		if err != nil || !info.IsDir() || info.Mode()&os.ModeSymlink != 0 {
			return nil, fmt.Errorf("shakedown requires a real directory: %s", current)
		}
	}
	return os.OpenRoot(absolute)
}

func newBundle(options Options) (*os.Root, error) {
	output, err := resolveOutput(options)
	if err != nil {
		return nil, err
	}
	for _, protected := range []string{options.RepositoryRoot, options.DatasetDirectory} {
		if protected == output || strings.HasPrefix(protected, output+string(filepath.Separator)) ||
			output == options.DatasetDirectory || strings.HasPrefix(output, options.DatasetDirectory+string(filepath.Separator)) {
			return nil, errors.New("shakedown output overlaps its source or fixture root")
		}
	}
	parent, err := openDirectory(filepath.Dir(output))
	if err != nil {
		return nil, err
	}
	defer parent.Close()
	if err := parent.Mkdir(filepath.Base(output), 0o700); err != nil {
		return nil, err
	}
	root, err := parent.OpenRoot(filepath.Base(output))
	if err != nil {
		return nil, err
	}
	if err := syncDirectory(parent, "."); err != nil {
		root.Close()
		return nil, err
	}
	return root, nil
}

func syncDirectory(root *os.Root, path string) error {
	file, err := root.Open(path)
	if err != nil {
		return err
	}
	// Windows has no directory fsync: FlushFileBuffers on a directory handle
	// returns ERROR_ACCESS_DENIED. The rename carries the ordering guarantee that
	// fsync(dir) provides on POSIX.
	if runtime.GOOS == "windows" {
		return file.Close()
	}
	return errors.Join(file.Sync(), file.Close())
}

func writeNew(root *os.Root, path string, body []byte) error {
	file, err := root.OpenFile(path, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0o600)
	if err != nil {
		return err
	}
	initial, statErr := file.Stat()
	n, writeErr := file.Write(body)
	if n != len(body) {
		writeErr = errors.Join(writeErr, io.ErrShortWrite)
	}
	if err := errors.Join(statErr, writeErr, file.Sync(), file.Close()); err != nil {
		return err
	}
	final, err := root.Lstat(path)
	if err != nil || !final.Mode().IsRegular() || !os.SameFile(initial, final) || final.Size() != int64(len(body)) {
		return errors.New("shakedown evidence changed while writing")
	}
	return syncDirectory(root, filepath.Dir(path))
}

func readFile(ctx context.Context, root *os.Root, path string, maximum int64) (body []byte, err error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	initial, err := root.Lstat(path)
	if err != nil || !initial.Mode().IsRegular() || initial.Size() <= 0 || initial.Size() > maximum {
		return nil, fmt.Errorf("shakedown evidence %s is missing, oversized or not a regular file", path)
	}
	file, err := root.Open(path)
	if err != nil {
		return nil, err
	}
	defer func() { err = errors.Join(err, file.Close()) }()
	body, err = io.ReadAll(io.LimitReader(file, maximum+1))
	if err != nil {
		return nil, err
	}
	opened, statErr := file.Stat()
	final, namedErr := root.Lstat(path)
	if statErr != nil || namedErr != nil || !unchangedFile(initial, opened) || !unchangedFile(opened, final) || int64(len(body)) != final.Size() {
		return nil, errors.New("shakedown evidence changed during read")
	}
	return body, ctx.Err()
}

func unchangedFile(a, b os.FileInfo) bool {
	return a.Mode().IsRegular() && b.Mode().IsRegular() && os.SameFile(a, b) && a.Mode() == b.Mode() && a.Size() == b.Size() && a.ModTime().Equal(b.ModTime())
}

func marshal(value any, maximum int) ([]byte, error) {
	body, err := json.MarshalIndent(value, "", "  ")
	if err != nil {
		return nil, err
	}
	if len(body)+1 > maximum {
		return nil, errors.New("shakedown JSON exceeds its byte limit")
	}
	return append(body, '\n'), nil
}

func decode(body []byte, value any) error {
	if err := strictjson.Validate(body, 16); err != nil {
		return err
	}
	decoder := json.NewDecoder(bytes.NewReader(body))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(value); err != nil {
		return err
	}
	canonical, err := marshal(value, len(body))
	if err != nil || !bytes.Equal(body, canonical) {
		return errors.New("shakedown JSON differs from its canonical field names and encoding")
	}
	return nil
}

func checkBundleRoot(root *os.Root) error {
	opened, err := root.Stat(".")
	if err != nil {
		return err
	}
	named, err := os.Lstat(root.Name())
	if err != nil || !named.IsDir() || named.Mode()&os.ModeSymlink != 0 || !os.SameFile(opened, named) {
		return errors.New("shakedown output root changed during use")
	}
	current, err := openDirectory(root.Name())
	if err != nil {
		return err
	}
	defer current.Close()
	resolved, err := current.Stat(".")
	if err != nil || !os.SameFile(opened, resolved) {
		return errors.New("shakedown output path no longer identifies the opened root")
	}
	return nil
}

func MarshalReport(report Report) ([]byte, error) { return marshal(report, maximumReportBytes) }

func executableIdentity(ctx context.Context) (FileIdentity, error) {
	path, err := os.Executable()
	if err != nil {
		return FileIdentity{}, err
	}
	root, err := openDirectory(filepath.Dir(path))
	if err != nil {
		return FileIdentity{}, err
	}
	defer root.Close()
	body, err := readFile(ctx, root, filepath.Base(path), 128<<20)
	if err != nil {
		return FileIdentity{}, err
	}
	return identify(body), nil
}

func diagnostic(err error) string {
	if err == nil {
		return ""
	}
	message := err.Error()
	if len(message) > 4096 {
		return message[:4096]
	}
	return message
}
