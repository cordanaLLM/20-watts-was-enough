//go:build linux && amd64

package pdftools

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"syscall"
	"unsafe"
)

const (
	// Linux UAPI values used by openat(2) and linkat(2); Go 1.27 does not
	// export all three on linux/amd64.
	linuxOTmpfile        = 0x410000
	linuxATEmptyPath     = 0x1000
	linuxATSymlinkFollow = 0x400
)

func openPinnedPublicationDirectory(
	repository publicationRootIdentity,
	relative string,
	create bool,
	beforeComponent func(string) error,
) (_ *pinnedPublicationDirectory, returnError error) {
	cleaned, err := cleanPublicationDirectory(relative)
	if err != nil {
		return nil, err
	}
	if repository.path == "" || repository.information == nil {
		return nil, errors.New("publication repository root has no checked identity")
	}
	current, err := walkPinnedPublicationDirectory(repository, cleaned, create, beforeComponent)
	if err != nil {
		return nil, err
	}
	defer func() {
		if returnError != nil {
			returnError = errors.Join(returnError, current.Close())
		}
	}()
	directoryInformation, err := current.Stat()
	if err != nil || !directoryInformation.IsDir() {
		return nil, errors.New("publication output parent is not a pinned directory")
	}
	// Open the high-level root through the already pinned descriptor. Reopening
	// the named path here would reintroduce an ancestor-swap window.
	root, err := os.OpenRoot("/proc/self/fd/" + strconv.Itoa(int(current.Fd())))
	if err != nil {
		return nil, fmt.Errorf("open pinned publication directory root: %w", err)
	}
	rootInformation, err := root.Stat(".")
	if err != nil || !rootInformation.IsDir() ||
		!os.SameFile(directoryInformation, rootInformation) {
		_ = root.Close()
		return nil, errors.New("publication directory changed while its root was opened")
	}
	// Rewalk the name without following symlinks. Operations stay pinned even
	// under a concurrent rename, but a changed public name must still fail.
	named, err := walkPinnedPublicationDirectory(repository, cleaned, false, nil)
	if err != nil {
		_ = root.Close()
		return nil, errors.New("publication directory changed after descriptor pinning")
	}
	namedInformation, informationError := named.Stat()
	closeError := named.Close()
	if informationError != nil || closeError != nil ||
		!os.SameFile(directoryInformation, namedInformation) {
		_ = root.Close()
		return nil, errors.New("publication directory changed after descriptor pinning")
	}
	return &pinnedPublicationDirectory{
		repository:  repository,
		relative:    cleaned,
		descriptor:  current,
		root:        root,
		information: directoryInformation,
	}, nil
}

func walkPinnedPublicationDirectory(
	repository publicationRootIdentity,
	cleaned string,
	create bool,
	beforeComponent func(string) error,
) (_ *os.File, returnError error) {
	fd, err := syscall.Open(
		repository.path,
		syscall.O_RDONLY|syscall.O_DIRECTORY|syscall.O_NOFOLLOW|syscall.O_CLOEXEC,
		0,
	)
	if err != nil {
		return nil, fmt.Errorf("open checked publication repository root: %w", err)
	}
	current := os.NewFile(uintptr(fd), "checked publication repository root")
	if current == nil {
		_ = syscall.Close(fd)
		return nil, errors.New("adopt checked publication repository root descriptor")
	}
	defer func() {
		if returnError != nil {
			returnError = errors.Join(returnError, current.Close())
		}
	}()
	currentInformation, err := current.Stat()
	if err != nil || !currentInformation.IsDir() ||
		!os.SameFile(repository.information, currentInformation) {
		return nil, errors.New("publication repository root changed before descriptor pinning")
	}
	traversed := ""
	if cleaned != "." {
		for _, component := range strings.Split(cleaned, string(filepath.Separator)) {
			if beforeComponent != nil {
				if err := beforeComponent(filepath.Join(traversed, component)); err != nil {
					return nil, fmt.Errorf("publication directory test boundary: %w", err)
				}
			}
			next, created, err := openPublicationChildDirectory(current, component, create)
			if err != nil {
				return nil, err
			}
			if created {
				if err := current.Sync(); err != nil {
					_ = next.Close()
					return nil, fmt.Errorf("sync created publication directory entry: %w", err)
				}
			}
			if err := current.Close(); err != nil {
				_ = next.Close()
				return nil, fmt.Errorf("close traversed publication directory: %w", err)
			}
			current = next
			traversed = filepath.Join(traversed, component)
		}
	}
	return current, nil
}

func openPublicationChildDirectory(parent *os.File, name string, create bool) (*os.File, bool, error) {
	open := func() (int, error) {
		return syscall.Openat(
			int(parent.Fd()), name,
			syscall.O_RDONLY|syscall.O_DIRECTORY|syscall.O_NOFOLLOW|syscall.O_CLOEXEC,
			0,
		)
	}
	fd, err := open()
	created := false
	if errors.Is(err, syscall.ENOENT) && create {
		mkdirError := syscall.Mkdirat(int(parent.Fd()), name, 0o755)
		if mkdirError != nil &&
			!errors.Is(mkdirError, syscall.EEXIST) {
			return nil, false, fmt.Errorf("create pinned publication directory: %w", mkdirError)
		}
		created = mkdirError == nil
		fd, err = open()
	}
	if err != nil {
		return nil, false, fmt.Errorf("open pinned publication directory component %q: %w", name, err)
	}
	file := os.NewFile(uintptr(fd), "pinned publication directory "+name)
	if file == nil {
		_ = syscall.Close(fd)
		return nil, false, errors.New("adopt pinned publication directory descriptor")
	}
	information, err := file.Stat()
	if err != nil || !information.IsDir() || information.Mode()&os.ModeSymlink != 0 {
		_ = file.Close()
		return nil, false, errors.New("publication directory component is not a real directory")
	}
	return file, created, nil
}

func createUnnamedPublicationFile(directory *pinnedPublicationDirectory, label string) (*os.File, os.FileInfo, error) {
	if directory == nil || directory.descriptor == nil {
		return nil, nil, errors.New("unnamed publication output has no pinned directory")
	}
	fd, err := syscall.Openat(
		int(directory.descriptor.Fd()), ".",
		linuxOTmpfile|syscall.O_RDWR|syscall.O_CLOEXEC,
		0o600,
	)
	if err != nil {
		return nil, nil, fmt.Errorf("create unnamed %s with O_TMPFILE: %w", label, err)
	}
	file := os.NewFile(uintptr(fd), "unnamed "+label)
	if file == nil {
		_ = syscall.Close(fd)
		return nil, nil, fmt.Errorf("adopt unnamed %s descriptor", label)
	}
	information, err := file.Stat()
	if err != nil {
		_ = file.Close()
		return nil, nil, fmt.Errorf("inspect unnamed %s: %w", label, err)
	}
	stat, statOK := information.Sys().(*syscall.Stat_t)
	if !information.Mode().IsRegular() || !statOK || stat.Nlink != 0 {
		_ = file.Close()
		return nil, nil, fmt.Errorf("unnamed %s is not an unlinked regular file", label)
	}
	return file, information, nil
}

func linkUnnamedPublicationFile(file, parent *os.File, name string) error {
	if file == nil || parent == nil {
		return errors.New("atomic publication has no pinned file or parent")
	}
	if _, err := publicationFilename(name); err != nil {
		return err
	}
	if err := rawLinkat(int(file.Fd()), "", int(parent.Fd()), name, linuxATEmptyPath); err == nil {
		runtime.KeepAlive(file)
		runtime.KeepAlive(parent)
		return nil
	} else if !errors.Is(err, syscall.EPERM) && !errors.Is(err, syscall.EACCES) &&
		!errors.Is(err, syscall.ENOENT) {
		return err
	}
	// linkat(2) documents /proc/self/fd with AT_SYMLINK_FOLLOW as the
	// capability-free way to link an O_TMPFILE inode on Linux.
	return linkUnnamedPublicationFileThroughProc(file, parent, name)
}

func linkUnnamedPublicationFileThroughProc(file, parent *os.File, name string) error {
	if file == nil || parent == nil {
		return errors.New("proc-fd publication has no pinned file or parent")
	}
	if _, err := publicationFilename(name); err != nil {
		return err
	}
	procPath := "/proc/self/fd/" + strconv.Itoa(int(file.Fd()))
	workingDirectory := -100 // AT_FDCWD from linux/fcntl.h.
	err := rawLinkat(workingDirectory, procPath, int(parent.Fd()), name, linuxATSymlinkFollow)
	runtime.KeepAlive(file)
	runtime.KeepAlive(parent)
	return err
}

func rawLinkat(oldDirectory int, oldPath string, newDirectory int, newPath string, flags int) error {
	oldPointer, err := syscall.BytePtrFromString(oldPath)
	if err != nil {
		return err
	}
	newPointer, err := syscall.BytePtrFromString(newPath)
	if err != nil {
		return err
	}
	// Go 1.27 exposes SYS_LINKAT but not a Linkat wrapper on linux/amd64.
	// The two validated NUL-terminated pointers are the smallest available
	// bridge to the kernel's atomic no-replace primitive (P10-9).
	_, _, callError := syscall.Syscall6(
		syscall.SYS_LINKAT,
		uintptr(oldDirectory), uintptr(unsafe.Pointer(oldPointer)), //#nosec G103 -- syscall argument points to NUL-terminated byte slice from BytePtrFromString, kept alive across syscall
		uintptr(newDirectory), uintptr(unsafe.Pointer(newPointer)), //#nosec G103 -- syscall argument points to NUL-terminated byte slice from BytePtrFromString, kept alive across syscall
		uintptr(flags), 0,
	)
	runtime.KeepAlive(oldPointer)
	runtime.KeepAlive(newPointer)
	if callError != 0 {
		return callError
	}
	return nil
}
