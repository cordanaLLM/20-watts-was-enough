// Package fileidentity reads file information whose identity is fixed when
// it is read. On Windows, os.Lstat, os.Stat and some directory entries keep
// only the path, and os.SameFile opens that path on first use: information
// taken before a delete and recreate then names the replacement. Handle-based
// information (File.Stat, Root.Stat, Root.Lstat) is fixed already.
package fileidentity

import (
	"errors"
	"io/fs"
	"os"
)

// ErrUnpinned reports that the file identity could not be read at capture,
// most often because the path was removed or replaced in between.
var ErrUnpinned = errors.New("file identity could not be read")

// Lstat is os.Lstat with the file identity read at once.
func Lstat(name string) (os.FileInfo, error) {
	information, err := os.Lstat(name)
	if err != nil {
		return nil, err
	}
	return information, pin("lstat", name, information)
}

// Stat is os.Stat with the file identity read at once.
func Stat(name string) (os.FileInfo, error) {
	information, err := os.Stat(name)
	if err != nil {
		return nil, err
	}
	return information, pin("stat", name, information)
}

// Info is entry.Info with the file identity read at once.
func Info(entry fs.DirEntry) (os.FileInfo, error) {
	information, err := entry.Info()
	if err != nil {
		return nil, err
	}
	return information, pin("info", entry.Name(), information)
}

// pin compares the information with itself, which makes os.SameFile load and
// keep the identity now. Elsewhere than Windows this is a field comparison.
func pin(operation, name string, information os.FileInfo) error {
	if !os.SameFile(information, information) {
		return &fs.PathError{Op: operation, Path: name, Err: ErrUnpinned}
	}
	return nil
}
