package pdftools

import (
	"context"
	"crypto/sha256"
	"encoding/binary"
	"encoding/hex"
	"errors"
	"fmt"
	"hash"
	"io/fs"
	"os"
	"path/filepath"
	"time"
)

const finalImageDockerfile = "FROM pdf_tools_base\nCOPY --chown=0:0 notices/ /usr/share/licenses/poppler/\n"

type noticeContextIdentity struct {
	SHA256     string
	Entries    int
	FileBytes  int64
	Dockerfile string
}

func prepareNoticeContext(ctx context.Context, root string, authority checkedAuthority) (noticeContextIdentity, error) {
	if err := os.MkdirAll(filepath.Join(root, "notices"), 0o755); err != nil {
		return noticeContextIdentity{}, fmt.Errorf("create PDF-tools notice context: %w", err)
	}
	epoch := time.Unix(authority.contract.SourceDateEpoch, 0)
	if err := writeNormalizedContextFile(filepath.Join(root, "Dockerfile"), []byte(finalImageDockerfile), epoch); err != nil {
		return noticeContextIdentity{}, err
	}
	for _, entry := range authority.contract.NoticeLayer.Entries {
		if err := ctx.Err(); err != nil {
			return noticeContextIdentity{}, err
		}
		body, err := readRelative(
			authority.root,
			"tooling/pdf-tools/"+entry.Source,
			"Poppler notice context source "+entry.Source,
			authority.contract.Limits.NoticeBytes,
		)
		if err != nil {
			return noticeContextIdentity{}, err
		}
		if int64(len(body)) != entry.Size || digestRaw(body) != entry.SHA256 {
			return noticeContextIdentity{}, fmt.Errorf("Poppler notice context source %s changed", entry.Source)
		}
		destination := filepath.Join(root, "notices", filepath.Base(entry.Source))
		if err := writeNormalizedContextFile(destination, body, epoch); err != nil {
			return noticeContextIdentity{}, err
		}
	}
	for _, directory := range []string{filepath.Join(root, "notices"), root} {
		if err := os.Chmod(directory, 0o755); err != nil {
			return noticeContextIdentity{}, fmt.Errorf("normalize notice context directory mode: %w", err)
		}
		if err := os.Chtimes(directory, epoch, epoch); err != nil {
			return noticeContextIdentity{}, fmt.Errorf("normalize notice context directory timestamp: %w", err)
		}
	}
	return inspectNoticeContext(ctx, root, authority.contract)
}

var (
	removeContextFile = os.Remove
	closeContextFile  = (*os.File).Close
	syncContextFile   = (*os.File).Sync
)

func writeNormalizedContextFile(path string, body []byte, epoch time.Time) (returnError error) {
	file, err := os.OpenFile(path, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o644)
	if err != nil {
		return fmt.Errorf("create normalized notice context file: %w", err)
	}
	complete := false
	defer func() {
		if !complete {
			if closeErr := closeContextFile(file); closeErr != nil && !errors.Is(closeErr, fs.ErrClosed) {
				returnError = errors.Join(returnError, closeErr)
			}
			if removeErr := removeContextFile(path); removeErr != nil && !errors.Is(removeErr, fs.ErrNotExist) {
				returnError = errors.Join(returnError, removeErr)
			}
		}
	}()
	if _, err := file.Write(body); err != nil {
		return fmt.Errorf("write normalized notice context file: %w", err)
	}
	if err := syncContextFile(file); err != nil {
		return fmt.Errorf("sync normalized notice context file: %w", err)
	}
	if err := closeContextFile(file); err != nil {
		return fmt.Errorf("close normalized notice context file: %w", err)
	}
	if err := os.Chmod(path, 0o644); err != nil {
		return fmt.Errorf("normalize notice context file mode: %w", err)
	}
	if err := os.Chtimes(path, epoch, epoch); err != nil {
		return fmt.Errorf("normalize notice context file timestamp: %w", err)
	}
	complete = true
	return nil
}

func validateNoticeContextInventories(root string, contract Contract) (map[string]NoticeEntry, error) {
	epoch := time.Unix(contract.SourceDateEpoch, 0)
	for _, directory := range []string{root, filepath.Join(root, "notices")} {
		information, err := os.Lstat(directory)
		if err != nil || !information.IsDir() || information.Mode()&os.ModeSymlink != 0 ||
			information.Mode().Perm() != 0o755 || !information.ModTime().Equal(epoch) {
			return nil, errors.New("notice context directory is not normalized")
		}
	}
	rootEntries, err := os.ReadDir(root)
	if err != nil || len(rootEntries) != 2 || rootEntries[0].Name() != "Dockerfile" ||
		rootEntries[1].Name() != "notices" || !rootEntries[1].IsDir() {
		return nil, errors.New("notice context root inventory is not exact")
	}
	noticeEntries, err := os.ReadDir(filepath.Join(root, "notices"))
	if err != nil || len(noticeEntries) != len(contract.NoticeLayer.Entries) {
		return nil, errors.New("notice context file inventory is not exact")
	}
	noticeBodies := make(map[string]NoticeEntry, len(contract.NoticeLayer.Entries))
	for index, entry := range contract.NoticeLayer.Entries {
		if noticeEntries[index].Name() != filepath.Base(entry.Source) || noticeEntries[index].IsDir() ||
			noticeEntries[index].Type()&os.ModeSymlink != 0 {
			return nil, errors.New("notice context file inventory is not exact")
		}
		noticeBodies["notices/"+filepath.Base(entry.Source)] = entry
	}
	return noticeBodies, nil
}

type noticeContextFile struct {
	path string
	body []byte
}

func expectedNoticeContextFiles(contract Contract) []noticeContextFile {
	wanted := make([]noticeContextFile, 0, len(contract.NoticeLayer.Entries)+1)
	wanted = append(wanted, noticeContextFile{path: "Dockerfile", body: []byte(finalImageDockerfile)})
	for _, entry := range contract.NoticeLayer.Entries {
		wanted = append(wanted, noticeContextFile{path: "notices/" + filepath.Base(entry.Source)})
	}
	return wanted
}

func inspectNoticeContext(ctx context.Context, root string, contract Contract) (noticeContextIdentity, error) {
	noticeBodies, err := validateNoticeContextInventories(root, contract)
	if err != nil {
		return noticeContextIdentity{}, err
	}
	wanted := expectedNoticeContextFiles(contract)
	digest := sha256.New()
	identity := noticeContextIdentity{Entries: len(wanted) + 2, Dockerfile: digestRaw([]byte(finalImageDockerfile))}
	for _, expected := range wanted {
		if err := ctx.Err(); err != nil {
			return noticeContextIdentity{}, err
		}
		path := filepath.Join(root, filepath.FromSlash(expected.path))
		information, err := os.Lstat(path)
		if err != nil || !information.Mode().IsRegular() || information.Mode().Perm() != 0o644 ||
			!information.ModTime().Equal(time.Unix(contract.SourceDateEpoch, 0)) {
			return noticeContextIdentity{}, fmt.Errorf("notice context file %s is not normalized", expected.path)
		}
		body, err := readTemporaryFile(path, contract.Limits.NoticeBytes, "normalized notice context file")
		if err != nil {
			return noticeContextIdentity{}, err
		}
		if expected.body != nil && string(body) != string(expected.body) {
			return noticeContextIdentity{}, fmt.Errorf("normalized context file %s changed", expected.path)
		}
		if entry, notice := noticeBodies[expected.path]; notice &&
			(int64(len(body)) != entry.Size || digestRaw(body) != entry.SHA256) {
			return noticeContextIdentity{}, fmt.Errorf("normalized context notice %s changed", expected.path)
		}
		identity.FileBytes += int64(len(body))
		if err := writeContextDigestField(digest, []byte(expected.path)); err != nil {
			return noticeContextIdentity{}, err
		}
		if err := writeContextDigestField(digest, []byte("-rw-r--r--")); err != nil {
			return noticeContextIdentity{}, err
		}
		if err := writeContextDigestField(digest, body); err != nil {
			return noticeContextIdentity{}, err
		}
	}
	if identity.FileBytes > contract.Limits.NoticeBytes+int64(len(finalImageDockerfile)) {
		return noticeContextIdentity{}, errors.New("notice context exceeds its byte boundary")
	}
	identity.SHA256 = "sha256:" + hex.EncodeToString(digest.Sum(nil))
	return identity, nil
}

func writeContextDigestField(digest hash.Hash, body []byte) error {
	if err := binary.Write(digest, binary.BigEndian, uint64(len(body))); err != nil {
		return fmt.Errorf("write context digest length: %w", err)
	}
	if _, err := digest.Write(body); err != nil {
		return fmt.Errorf("write context digest body: %w", err)
	}
	return nil
}
