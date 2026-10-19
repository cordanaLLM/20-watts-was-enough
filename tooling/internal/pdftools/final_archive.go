package pdftools

import (
	"archive/tar"
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"regexp"
	"slices"
	"strings"
	"time"
)

var ociBlobPathPattern = regexp.MustCompile(`^blobs/sha256/([0-9a-f]{64})$`)

type inspectedFinalImage struct {
	Identity imageIdentity
	Layout   string
	Manifest ociManifest
	Config   ociImageConfig
}

func inspectFinalArchive(ctx context.Context, archivePath, layoutRoot string, contract Contract) (inspectedFinalImage, error) {
	if _, err := os.Lstat(layoutRoot); !errors.Is(err, os.ErrNotExist) {
		if err == nil {
			return inspectedFinalImage{}, errors.New("final OCI inspection root already exists")
		}
		return inspectedFinalImage{}, fmt.Errorf("inspect final OCI inspection root: %w", err)
	}
	if err := os.Mkdir(layoutRoot, 0o700); err != nil {
		return inspectedFinalImage{}, fmt.Errorf("create final OCI inspection root: %w", err)
	}
	archive, err := openBoundedRegular(archivePath, contract.Limits.FinalArchiveBytes, "final OCI archive")
	if err != nil {
		return inspectedFinalImage{}, err
	}
	defer archive.Close()
	hasher := sha256.New()
	counting := &countingReader{source: io.TeeReader(archive, hasher)}
	paths, err := extractFinalOCITar(ctx, tar.NewReader(counting), layoutRoot, contract.Limits.FinalArchiveBytes)
	if err != nil {
		return inspectedFinalImage{}, err
	}
	if err := drainZeroTarPadding(ctx, counting, contract.Limits.FinalArchiveBytes-counting.count); err != nil {
		return inspectedFinalImage{}, err
	}
	if counting.count <= 0 || counting.count > contract.Limits.FinalArchiveBytes {
		return inspectedFinalImage{}, errors.New("final OCI archive exceeds its byte boundary")
	}
	if err := verifyOpenedRegular(archivePath, archive, counting.count, "final OCI archive"); err != nil {
		return inspectedFinalImage{}, err
	}
	image, err := validateFinalOCILayout(layoutRoot, paths, contract)
	if err != nil {
		return inspectedFinalImage{}, err
	}
	image.Identity.ArchiveSHA256 = hex.EncodeToString(hasher.Sum(nil))
	image.Identity.ArchiveSize = counting.count
	return image, nil
}

func extractFinalOCITar(
	ctx context.Context,
	reader *tar.Reader,
	root string,
	maximumBytes int64,
) (map[string]struct{}, error) {
	paths := make(map[string]struct{})
	var regularBytes int64
	for {
		if err := ctx.Err(); err != nil {
			return nil, err
		}
		header, err := reader.Next()
		if errors.Is(err, io.EOF) {
			break
		}
		if err != nil {
			return nil, fmt.Errorf("read final OCI archive: %w", err)
		}
		name := strings.TrimSuffix(header.Name, "/")
		if !validFinalOCIPath(name) || len(paths) >= 16 {
			return nil, fmt.Errorf("final OCI archive path %q is not admitted", header.Name)
		}
		if _, duplicate := paths[name]; duplicate {
			return nil, fmt.Errorf("final OCI archive repeats path %q", name)
		}
		paths[name] = struct{}{}
		destination := filepath.Join(root, filepath.FromSlash(name))
		if !hasExactReproductionTarMetadata(header, 0) {
			return nil, fmt.Errorf(
				"final OCI archive path %q has non-canonical metadata (uid=%d gid=%d uname=%q gname=%q mtime=%s atime=%s ctime=%s pax=%d xattrs=%d dev=%d:%d)",
				name, header.Uid, header.Gid, header.Uname, header.Gname, header.ModTime.UTC().Format(time.RFC3339Nano),
				header.AccessTime.UTC().Format(time.RFC3339Nano), header.ChangeTime.UTC().Format(time.RFC3339Nano),
				len(header.PAXRecords), len(header.Xattrs), header.Devmajor, header.Devminor,
			)
		}
		switch header.Typeflag {
		case tar.TypeDir:
			if (header.Name != name && header.Name != name+"/") || name != "blobs" && name != "blobs/sha256" ||
				header.Size != 0 || header.Mode != 0o755 || header.Uid != 0 || header.Gid != 0 || header.Linkname != "" {
				return nil, fmt.Errorf("final OCI archive directory %q is not admitted", name)
			}
			if err := os.MkdirAll(destination, 0o755); err != nil { //#nosec G301 -- OCI directory layout must be world-readable per OCI image specification
				return nil, fmt.Errorf("create final OCI directory: %w", err)
			}
		case tar.TypeReg:
			if header.Name != name || header.Size <= 0 || header.Size > maximumBytes ||
				header.Mode != exactFinalOCIFileMode(name) ||
				header.Uid != 0 || header.Gid != 0 || header.Linkname != "" {
				return nil, fmt.Errorf(
					"final OCI archive file %q has invalid shape (size=%d mode=%#o uid=%d gid=%d link=%q)",
					name, header.Size, header.Mode, header.Uid, header.Gid, header.Linkname,
				)
			}
			regularBytes += header.Size
			if regularBytes > maximumBytes {
				return nil, errors.New("final OCI archive regular bytes exceed their aggregate boundary")
			}
			if err := os.MkdirAll(filepath.Dir(destination), 0o755); err != nil { //#nosec G301 -- OCI directory layout must be world-readable per OCI image specification
				return nil, fmt.Errorf("create final OCI blob directory: %w", err)
			}
			if err := extractExactTarFile(destination, reader, header.Size); err != nil {
				return nil, err
			}
		default:
			return nil, fmt.Errorf("final OCI archive entry %q is not a regular file or directory", name)
		}
	}
	return paths, nil
}

func exactFinalOCIFileMode(name string) int64 {
	if name == "index.json" {
		return 0o644
	}
	return 0o444
}

func hasExactReproductionTarMetadata(header *tar.Header, sourceDateEpoch int64) bool {
	return header.Uname == "" && header.Gname == "" && header.Devmajor == 0 && header.Devminor == 0 &&
		len(header.PAXRecords) == 0 && len(header.Xattrs) == 0 &&
		header.ModTime.Equal(time.Unix(sourceDateEpoch, 0)) &&
		header.AccessTime.IsZero() && header.ChangeTime.IsZero()
}

func drainZeroTarPadding(ctx context.Context, reader io.Reader, maximum int64) error {
	if maximum < 0 {
		return errors.New("final OCI archive exceeds its byte boundary")
	}
	buffer := make([]byte, 128*1024)
	var read int64
	for {
		if err := ctx.Err(); err != nil {
			return err
		}
		count, err := reader.Read(buffer)
		if count > 0 {
			read += int64(count)
			if read > maximum {
				return errors.New("final OCI archive padding exceeds its byte boundary")
			}
			if !allZero(buffer[:count]) {
				return errors.New("final OCI archive contains non-zero bytes after its tar terminator")
			}
		}
		if errors.Is(err, io.EOF) {
			return nil
		}
		if err != nil {
			return fmt.Errorf("read final OCI archive padding: %w", err)
		}
	}
}

func allZero(body []byte) bool {
	for _, value := range body {
		if value != 0 {
			return false
		}
	}
	return true
}

func validFinalOCIPath(name string) bool {
	return name == "oci-layout" || name == "index.json" || name == "blobs" || name == "blobs/sha256" ||
		ociBlobPathPattern.MatchString(name)
}

func extractExactTarFile(path string, reader io.Reader, size int64) (returnError error) {
	file, err := os.OpenFile(path, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o644) //#nosec G304,G302 -- OCI blob file must be world-readable per OCI image specification
	if err != nil {
		return fmt.Errorf("create extracted OCI file: %w", err)
	}
	complete := false
	defer func() {
		_ = file.Close()
		if !complete {
			_ = os.Remove(path)
		}
	}()
	written, err := io.CopyN(file, reader, size)
	if err != nil || written != size {
		return errors.New("final OCI archive file ended before its declared size")
	}
	if err := file.Sync(); err != nil {
		return fmt.Errorf("sync extracted OCI file: %w", err)
	}
	if err := file.Close(); err != nil {
		return fmt.Errorf("close extracted OCI file: %w", err)
	}
	complete = true
	return nil
}

func validateFinalOCILayout(root string, paths map[string]struct{}, contract Contract) (inspectedFinalImage, error) {
	layoutBody, err := readTemporaryFile(filepath.Join(root, "oci-layout"), 1024, "OCI layout version")
	if err != nil {
		return inspectedFinalImage{}, err
	}
	if !bytes.Equal(layoutBody, []byte("{\"imageLayoutVersion\":\"1.0.0\"}")) {
		return inspectedFinalImage{}, errors.New("final archive OCI layout version is invalid")
	}
	indexBody, err := readTemporaryFile(filepath.Join(root, "index.json"), 64*1024, "final OCI index")
	if err != nil {
		return inspectedFinalImage{}, err
	}
	index, err := decodeArtifactJSON[ociIndex](indexBody, 8, "final OCI index")
	if err != nil {
		return inspectedFinalImage{}, err
	}
	if index.SchemaVersion != 2 || index.MediaType != ociIndexMediaType || len(index.Manifests) != 1 {
		return inspectedFinalImage{}, errors.New("final OCI index is not one image manifest")
	}
	descriptor := index.Manifests[0]
	if descriptor.MediaType != ociManifestMediaType || !digestPattern.MatchString(descriptor.Digest) ||
		descriptor.Size <= 0 || descriptor.Size > 64*1024 || descriptor.Platform == nil ||
		*descriptor.Platform != (ociPlatform{Architecture: "amd64", OS: "linux"}) || descriptor.ArtifactType != "" ||
		!validFinalIndexAnnotations(descriptor.Annotations, contract) || len(index.Annotations) != 0 {
		return inspectedFinalImage{}, errors.New("final OCI index descriptor is invalid")
	}
	manifestBody, err := readDescriptorBlob(root, descriptor, "final OCI manifest")
	if err != nil {
		return inspectedFinalImage{}, err
	}
	manifest, err := decodeArtifactJSON[ociManifest](manifestBody, 8, "final OCI manifest")
	if err != nil {
		return inspectedFinalImage{}, err
	}
	if err := validateFinalManifest(manifest, contract); err != nil {
		return inspectedFinalImage{}, err
	}
	configBody, err := readDescriptorBlob(root, manifest.Config, "final OCI config")
	if err != nil {
		return inspectedFinalImage{}, err
	}
	config, err := decodeArtifactJSON[ociImageConfig](configBody, 8, "final OCI config")
	if err != nil {
		return inspectedFinalImage{}, err
	}
	if err := validateFinalConfig(config, manifest, contract); err != nil {
		return inspectedFinalImage{}, err
	}
	for _, layer := range manifest.Layers {
		if _, err := readDescriptorBlob(root, layer, "final OCI layer"); err != nil {
			return inspectedFinalImage{}, err
		}
	}
	if err := validateFinalOCIPaths(paths, descriptor, manifest); err != nil {
		return inspectedFinalImage{}, err
	}
	layers := make([]string, len(manifest.Layers))
	for index, layer := range manifest.Layers {
		layers[index] = layer.Digest
	}
	return inspectedFinalImage{
		Identity: imageIdentity{
			ManifestDigest: descriptor.Digest,
			ConfigDigest:   manifest.Config.Digest,
			LayerDigests:   layers,
			LayerDiffIDs:   slices.Clone(config.RootFS.DiffIDs),
		},
		Layout:   root,
		Manifest: manifest,
		Config:   config,
	}, nil
}

func validateFinalManifest(manifest ociManifest, contract Contract) error {
	if manifest.SchemaVersion != 2 || manifest.MediaType != ociManifestMediaType || len(manifest.Layers) != 2 ||
		manifest.Config.MediaType != ociConfigMediaType || !digestPattern.MatchString(manifest.Config.Digest) ||
		manifest.Config.Size <= 0 || manifest.Config.Size > 64*1024 || manifest.Config.Platform != nil ||
		manifest.Config.ArtifactType != "" || len(manifest.Config.Annotations) != 0 || len(manifest.Annotations) != 0 {
		return errors.New("final OCI manifest shape is invalid")
	}
	for index, layer := range manifest.Layers {
		if layer.MediaType != ociLayerMediaType || !digestPattern.MatchString(layer.Digest) ||
			layer.Size <= 0 || layer.Size > contract.Limits.FinalArchiveBytes || layer.Platform != nil ||
			layer.ArtifactType != "" {
			return fmt.Errorf("final OCI layer %d descriptor is invalid", index+1)
		}
	}
	if manifest.Layers[0].Digest != contract.BaseImage.LayerDigest ||
		manifest.Layers[0].Digest == manifest.Layers[1].Digest || len(manifest.Layers[0].Annotations) != 0 ||
		!equalStringMap(manifest.Layers[1].Annotations, map[string]string{
			"buildkit/rewritten-timestamp": decimalInt64(contract.SourceDateEpoch),
		}) {
		return errors.New("final OCI manifest does not preserve one exact base layer plus one notice layer")
	}
	return nil
}

func validateFinalConfig(config ociImageConfig, manifest ociManifest, contract Contract) error {
	created := expectedImageAnnotations(contract)["org.opencontainers.image.created"]
	if config.Architecture != "amd64" || config.OS != "linux" ||
		config.Author != "github.com/chainguard-dev/apko" || config.Created != created || config.RootFS.Type != "layers" ||
		len(config.RootFS.DiffIDs) != 2 || config.RootFS.DiffIDs[0] != contract.BaseImage.LayerDiffID ||
		!digestPattern.MatchString(config.RootFS.DiffIDs[1]) || config.Config.User != "65532" ||
		!equalStringMap(config.Config.Labels, expectedImageAnnotations(contract)) ||
		!slices.Equal(config.Config.Env, []string{"PATH=/usr/bin", "SSL_CERT_FILE=/etc/ssl/certs/ca-certificates.crt"}) {
		return errors.New("final OCI config does not preserve the base runtime identity")
	}
	if len(config.History) != 2 || config.History[0].Author != "apko" || config.History[0].Created != created ||
		config.History[0].CreatedBy != "apko" || config.History[0].Comment != "This is an apko single-layer image" ||
		config.History[0].EmptyLayer || config.History[1].Author != "" || config.History[1].Created != created ||
		config.History[1].CreatedBy != "COPY --chown=0:0 notices/ /usr/share/licenses/poppler/ # buildkit" ||
		config.History[1].Comment != "buildkit.dockerfile.v0" || config.History[1].EmptyLayer {
		return errors.New("final OCI config does not contain exactly one notice-copy history entry")
	}
	if manifest.Config.Digest == contract.BaseImage.ConfigDigest {
		return errors.New("final OCI config identity did not change after the notice layer")
	}
	return nil
}

func validFinalIndexAnnotations(values map[string]string, contract Contract) bool {
	created := time.Unix(contract.SourceDateEpoch, 0).UTC().Format(time.RFC3339)
	return equalStringMap(values, map[string]string{
		"org.opencontainers.image.created": created,
	})
}

func readDescriptorBlob(root string, descriptor ociDescriptor, label string) ([]byte, error) {
	if !digestPattern.MatchString(descriptor.Digest) || descriptor.Size <= 0 {
		return nil, fmt.Errorf("%s descriptor is invalid", label)
	}
	path := filepath.Join(root, "blobs", "sha256", strings.TrimPrefix(descriptor.Digest, "sha256:"))
	body, err := readTemporaryFile(path, descriptor.Size, label)
	if err != nil {
		return nil, err
	}
	if int64(len(body)) != descriptor.Size || digestRaw(body) != strings.TrimPrefix(descriptor.Digest, "sha256:") {
		return nil, fmt.Errorf("%s bytes differ from their descriptor", label)
	}
	return body, nil
}

func readTemporaryFile(path string, maximum int64, label string) ([]byte, error) {
	file, err := openBoundedRegular(path, maximum, label)
	if err != nil {
		return nil, err
	}
	defer file.Close()
	body, err := io.ReadAll(io.LimitReader(file, maximum+1))
	if err != nil || int64(len(body)) > maximum {
		return nil, fmt.Errorf("read bounded %s", label)
	}
	if err := verifyOpenedRegular(path, file, int64(len(body)), label); err != nil {
		return nil, err
	}
	return body, nil
}

func validateFinalOCIPaths(paths map[string]struct{}, manifestDescriptor ociDescriptor, manifest ociManifest) error {
	wanted := map[string]struct{}{
		"oci-layout":   {},
		"index.json":   {},
		"blobs":        {},
		"blobs/sha256": {},
	}
	for _, descriptor := range append([]ociDescriptor{manifestDescriptor, manifest.Config}, manifest.Layers...) {
		wanted["blobs/sha256/"+strings.TrimPrefix(descriptor.Digest, "sha256:")] = struct{}{}
	}
	if len(paths) != len(wanted) {
		return errors.New("final OCI archive contains an unreferenced or missing path")
	}
	for path := range wanted {
		if _, exists := paths[path]; !exists {
			return fmt.Errorf("final OCI archive omits %s", path)
		}
	}
	return nil
}

func equalRegularFiles(left, right string, maximum int64) (bool, error) {
	leftFile, err := openBoundedRegular(left, maximum, "first compared archive")
	if err != nil {
		return false, err
	}
	defer leftFile.Close()
	rightFile, err := openBoundedRegular(right, maximum, "second compared archive")
	if err != nil {
		return false, err
	}
	defer rightFile.Close()
	leftInfo, leftStatError := leftFile.Stat()
	rightInfo, rightStatError := rightFile.Stat()
	if leftStatError != nil || rightStatError != nil {
		return false, errors.New("inspect compared archive sizes")
	}
	if leftInfo.Size() != rightInfo.Size() {
		return false, nil
	}
	leftBuffer := make([]byte, 128*1024)
	rightBuffer := make([]byte, 128*1024)
	remaining := leftInfo.Size()
	for remaining > 0 {
		chunk := int64(len(leftBuffer))
		if chunk > remaining {
			chunk = remaining
		}
		leftCount, leftError := io.ReadFull(leftFile, leftBuffer[:chunk])
		rightCount, rightError := io.ReadFull(rightFile, rightBuffer[:chunk])
		if leftError != nil || rightError != nil {
			return false, errors.New("compared archive changed before its declared size")
		}
		if leftCount != rightCount || !bytes.Equal(leftBuffer[:leftCount], rightBuffer[:rightCount]) {
			return false, nil
		}
		remaining -= int64(leftCount)
	}
	var leftExtra, rightExtra [1]byte
	leftCount, leftError := leftFile.Read(leftExtra[:])
	rightCount, rightError := rightFile.Read(rightExtra[:])
	if leftCount != 0 || rightCount != 0 || !errors.Is(leftError, io.EOF) || !errors.Is(rightError, io.EOF) {
		return false, errors.New("compared archive grew beyond its declared size")
	}
	if err := verifyOpenedRegular(left, leftFile, leftInfo.Size(), "first compared archive"); err != nil {
		return false, err
	}
	if err := verifyOpenedRegular(right, rightFile, rightInfo.Size(), "second compared archive"); err != nil {
		return false, err
	}
	return true, nil
}
