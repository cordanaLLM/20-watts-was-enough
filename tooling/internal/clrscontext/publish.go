package clrscontext

import (
	"context"
	"crypto/rand"
	"errors"
	"fmt"
	"os"
	"path/filepath"

	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/fileidentity"
)

// A private, owned staging directory keeps partial bytes away from the requested
// output name. Link publishes a complete file without replacing another writer.
func publishContext(ctx context.Context, output string, p plan, recheck func() error) (result Result, returnErr error) {
	absolute, err := filepath.Abs(output)
	if err != nil {
		return result, err
	}
	parent, err := realDirectory(filepath.Dir(absolute))
	if err != nil {
		return result, err
	}
	root, err := os.OpenRoot(parent)
	if err != nil {
		return result, err
	}
	defer root.Close()
	parentInfo, err := root.Stat(".")
	if err != nil {
		return result, err
	}
	name := filepath.Base(absolute)
	if _, err := root.Lstat(name); !errors.Is(err, os.ErrNotExist) {
		return result, errors.New("CLRS context output must not already exist")
	}
	stage := ".clrs-context-" + rand.Text()
	if err := root.Mkdir(stage, 0o700); err != nil {
		return result, err
	}
	stagedName := filepath.Join(stage, "candidate.tar")
	file, err := root.OpenFile(stagedName, os.O_RDWR|os.O_CREATE|os.O_EXCL, 0o600)
	if err != nil {
		return result, errors.Join(err, root.Remove(stage))
	}
	owned, err := file.Stat()
	if err != nil {
		file.Close()
		return result, fmt.Errorf("inspect owned CLRS staging file; retained %s: %w", stage, err)
	}
	defer func() {
		file.Close()
		current, err := root.Lstat(stagedName)
		if err == nil && current.Mode().IsRegular() && os.SameFile(owned, current) {
			err = root.Remove(stagedName)
		}
		if errors.Is(err, os.ErrNotExist) {
			err = nil
		}
		returnErr = errors.Join(returnErr, err, root.Remove(stage))
	}()
	result, err = writeContext(ctx, file, p)
	if err != nil {
		return Result{}, err
	}
	if err := file.Sync(); err != nil {
		return Result{}, err
	}
	if err := file.Chmod(0o644); err != nil {
		return Result{}, err
	}
	if err := file.Close(); err != nil {
		return Result{}, err
	}
	if _, err := verifyContextFile(ctx, filepath.Join(parent, stagedName), result); err != nil {
		return Result{}, err
	}
	if err := recheck(); err != nil {
		return Result{}, err
	}
	if err := ctx.Err(); err != nil {
		return Result{}, err
	}
	if err := root.Link(stagedName, name); err != nil {
		return Result{}, fmt.Errorf("publish CLRS context without replacement: %w", err)
	}
	if err := confirmPublication(root, parent, parentInfo, name, owned, result.SizeBytes); err != nil {
		return Result{}, err
	}
	if _, err := verifyContextFile(ctx, absolute, result); err != nil {
		return Result{}, err
	}
	return result, nil
}

func confirmPublication(root *os.Root, parent string, parentInfo os.FileInfo, name string, owned os.FileInfo, size int64) error {
	linked, err := root.Lstat(name)
	if err != nil || !linked.Mode().IsRegular() || !os.SameFile(owned, linked) || linked.Size() != size {
		return errors.New("published CLRS context identity differs")
	}
	namedParent, err := fileidentity.Lstat(parent)
	if err != nil || !namedParent.IsDir() || !os.SameFile(parentInfo, namedParent) {
		return errors.New("CLRS context output parent changed during publication")
	}
	named, err := fileidentity.Lstat(filepath.Join(parent, name))
	if err != nil || !sameFile(linked, named) {
		return errors.New("CLRS context output name changed during publication")
	}
	return nil
}
