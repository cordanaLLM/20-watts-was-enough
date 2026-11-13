package visualbaseline

import (
	"bytes"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"image"
	"image/png"
	"io"
	"os"
	"path/filepath"
	"strings"
)

const maximumPNGBytes = 80 * 1024 * 1024

func readPath(path string, limit int64) ([]byte, error) {
	directory, err := os.OpenRoot(filepath.Dir(path))
	if err != nil {
		return nil, fmt.Errorf("open directory for %s: %w", path, err)
	}
	defer directory.Close()
	return readFile(directory, filepath.Base(path), limit)
}

func readFile(directory *os.Root, name string, limit int64) ([]byte, error) {
	info, err := inspectFile(directory, name, limit)
	if err != nil {
		return nil, err
	}
	file, err := directory.Open(name)
	if err != nil {
		return nil, fmt.Errorf("open %s: %w", name, err)
	}
	defer file.Close()
	opened, err := file.Stat()
	if err != nil || !os.SameFile(info, opened) {
		return nil, fmt.Errorf("%s changed before read", name)
	}
	body, err := io.ReadAll(io.LimitReader(file, limit+1))
	if err != nil {
		return nil, fmt.Errorf("read %s: %w", name, err)
	}
	if int64(len(body)) > limit {
		return nil, fmt.Errorf("%s exceeds byte limit", name)
	}
	return body, nil
}

func openDirectory(root, relative string, create bool) (*os.Root, error) {
	directory, err := os.OpenRoot(root)
	if err != nil {
		return nil, fmt.Errorf("open visual root: %w", err)
	}
	for _, component := range strings.Split(relative, "/") {
		next, err := openChild(directory, component, create)
		if closeErr := directory.Close(); closeErr != nil {
			err = errors.Join(err, fmt.Errorf("close visual directory: %w", closeErr))
			if next != nil {
				err = errors.Join(err, next.Close())
			}
			return nil, err
		}
		if err != nil {
			return nil, err
		}
		directory = next
	}
	return directory, nil
}

func openChild(directory *os.Root, name string, create bool) (*os.Root, error) {
	if !namePattern.MatchString(name) {
		return nil, fmt.Errorf("invalid directory component %q", name)
	}
	if create {
		if err := directory.Mkdir(name, 0o755); err != nil && !errors.Is(err, os.ErrExist) {
			return nil, fmt.Errorf("create %s: %w", name, err)
		}
	}
	info, err := directory.Lstat(name)
	if err != nil {
		return nil, fmt.Errorf("inspect directory %s: %w", name, err)
	}
	if !info.IsDir() || info.Mode()&os.ModeSymlink != 0 {
		return nil, fmt.Errorf("directory %s must not be a symlink", name)
	}
	child, err := directory.OpenRoot(name)
	if err != nil {
		return nil, fmt.Errorf("open directory %s: %w", name, err)
	}
	return child, nil
}

func decodePNG(body []byte) (image.Image, error) {
	configuration, err := png.DecodeConfig(bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("decode PNG dimensions: %w", err)
	}
	if configuration.Width < 1 || configuration.Height < 1 || configuration.Width > maximumDimension || configuration.Height > maximumDimension {
		return nil, errors.New("PNG dimensions must be 1..4096")
	}
	decoded, err := png.Decode(bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("decode PNG: %w", err)
	}
	return decoded, nil
}

func encodePNG(value image.Image) ([]byte, error) {
	var buffer bytes.Buffer
	if err := png.Encode(&buffer, value); err != nil {
		return nil, fmt.Errorf("encode diff PNG: %w", err)
	}
	return buffer.Bytes(), nil
}

// Record atomically replaces one PNG beneath the baseline authority directory.
func Record(repositoryRoot, name string, body []byte) (bool, error) {
	if !validPNGName(name) {
		return false, fmt.Errorf("baseline file %q must be a view-viewport PNG name", name)
	}
	if len(body) > maximumPNGBytes {
		return false, errors.New("baseline PNG exceeds byte limit")
	}
	if _, err := decodePNG(body); err != nil {
		return false, err
	}
	directory, err := openDirectory(repositoryRoot, BaselineDirectory, false)
	if err != nil {
		return false, err
	}
	defer directory.Close()
	previous, err := readFile(directory, name, maximumPNGBytes)
	if err != nil && !errors.Is(err, os.ErrNotExist) {
		return false, err
	}
	if bytes.Equal(previous, body) {
		return false, nil
	}
	if err := replaceFile(directory, name, body); err != nil {
		return false, err
	}
	return true, nil
}

func validPNGName(name string) bool {
	stem, ok := strings.CutSuffix(name, ".png")
	return ok && len(stem) <= 81 && strings.Contains(stem, "-") && pngNamePattern.MatchString(name)
}

func replaceFile(directory *os.Root, name string, body []byte) (returnError error) {
	var identity [16]byte
	if _, err := rand.Read(identity[:]); err != nil {
		return fmt.Errorf("name temporary visual file: %w", err)
	}
	temporary := ".visual-" + hex.EncodeToString(identity[:]) + ".tmp"
	file, err := directory.OpenFile(temporary, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o644)
	if err != nil {
		return fmt.Errorf("create temporary visual file: %w", err)
	}
	defer func() {
		if err := directory.Remove(temporary); err != nil && !errors.Is(err, os.ErrNotExist) {
			returnError = errors.Join(returnError, err)
		}
	}()
	_, writeError := file.Write(body)
	syncError := file.Sync()
	closeError := file.Close()
	if err := errors.Join(writeError, syncError, closeError); err != nil {
		return fmt.Errorf("write visual file %s: %w", name, err)
	}
	if err := directory.Rename(temporary, name); err != nil {
		return fmt.Errorf("replace visual file %s: %w", name, err)
	}
	return nil
}

func inspectFile(directory *os.Root, name string, limit int64) (os.FileInfo, error) {
	info, err := directory.Lstat(name)
	if err != nil {
		return nil, fmt.Errorf("inspect %s: %w", name, err)
	}
	if !info.Mode().IsRegular() || info.Size() <= 0 || info.Size() > limit {
		return nil, fmt.Errorf("%s must be a regular non-symlink file of 1..%d bytes", name, limit)
	}
	return info, nil
}
