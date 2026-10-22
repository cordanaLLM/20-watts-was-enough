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

type publishedRoot struct {
	root       *os.Root
	parent     string
	name       string
	absolute   string
	parentInfo os.FileInfo
}

func openPublishRoot(output string) (publishedRoot, error) {
	absolute, err := filepath.Abs(output)
	if err != nil {
		return publishedRoot{}, err
	}
	parent, err := realDirectory(filepath.Dir(absolute))
	if err != nil {
		return publishedRoot{}, err
	}
	root, err := os.OpenRoot(parent)
	if err != nil {
		return publishedRoot{}, err
	}
	parentInfo, err := root.Stat(".")
	if err != nil {
		return publishedRoot{}, errors.Join(err, root.Close())
	}
	name := filepath.Base(absolute)
	if _, err := root.Lstat(name); !errors.Is(err, os.ErrNotExist) {
		return publishedRoot{}, errors.Join(errors.New("CLRS context output must not already exist"), root.Close())
	}
	return publishedRoot{root: root, parent: parent, name: name, absolute: absolute, parentInfo: parentInfo}, nil
}

type stagedContextFile struct {
	stage      string
	stagedName string
	file       *os.File
	owned      os.FileInfo
}

func createStagedContextFile(root *os.Root) (stagedContextFile, error) {
	stage := ".clrs-context-" + rand.Text()
	if err := root.Mkdir(stage, 0o700); err != nil {
		return stagedContextFile{}, err
	}
	stagedName := filepath.Join(stage, "candidate.tar")
	file, err := root.OpenFile(stagedName, os.O_RDWR|os.O_CREATE|os.O_EXCL, 0o600)
	if err != nil {
		return stagedContextFile{}, errors.Join(err, root.Remove(stage))
	}
	owned, err := file.Stat()
	if err != nil {
		return stagedContextFile{}, errors.Join(fmt.Errorf("inspect owned CLRS staging file; retained %s: %w", stage, err), file.Close())
	}
	return stagedContextFile{stage: stage, stagedName: stagedName, file: file, owned: owned}, nil
}

func writeAndVerifyStagedContext(ctx context.Context, s stagedContextFile, parent string, p plan, recheck func() error) (Result, error) {
	result, err := writeContext(ctx, s.file, p)
	if err != nil {
		return Result{}, err
	}
	if err := s.file.Sync(); err != nil {
		return Result{}, err
	}
	if err := s.file.Chmod(0o644); err != nil {
		return Result{}, err
	}
	if err := s.file.Close(); err != nil {
		return Result{}, err
	}
	if _, err := verifyContextFile(ctx, filepath.Join(parent, s.stagedName), result); err != nil {
		return Result{}, err
	}
	if err := recheck(); err != nil {
		return Result{}, err
	}
	return result, ctx.Err()
}

func commitPublishedContext(ctx context.Context, pub publishedRoot, s stagedContextFile, result Result) error {
	if err := pub.root.Link(s.stagedName, pub.name); err != nil {
		return fmt.Errorf("publish CLRS context without replacement: %w", err)
	}
	if err := confirmPublication(pub.root, pub.parent, pub.parentInfo, pub.name, s.owned, result.SizeBytes); err != nil {
		return err
	}
	_, err := verifyContextFile(ctx, pub.absolute, result)
	return err
}

// A private, owned staging directory keeps partial bytes away from the requested
// output name. Link publishes a complete file without replacing another writer.
func publishContext(ctx context.Context, output string, p plan, recheck func() error) (result Result, returnErr error) {
	pub, err := openPublishRoot(output)
	if err != nil {
		return result, err
	}
	defer pub.root.Close()
	s, err := createStagedContextFile(pub.root)
	if err != nil {
		return result, err
	}
	defer func() {
		if closeErr := s.file.Close(); closeErr != nil && !errors.Is(closeErr, os.ErrClosed) {
			returnErr = errors.Join(returnErr, closeErr)
		}
		current, err := pub.root.Lstat(s.stagedName)
		if err == nil && current.Mode().IsRegular() && os.SameFile(s.owned, current) {
			err = pub.root.Remove(s.stagedName)
		}
		if errors.Is(err, os.ErrNotExist) {
			err = nil
		}
		returnErr = errors.Join(returnErr, err, pub.root.Remove(s.stage))
	}()
	result, err = writeAndVerifyStagedContext(ctx, s, pub.parent, p, recheck)
	if err != nil {
		return Result{}, err
	}
	if err := commitPublishedContext(ctx, pub, s, result); err != nil {
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
