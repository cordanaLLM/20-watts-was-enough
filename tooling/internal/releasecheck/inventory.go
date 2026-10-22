// Package releasecheck provides closed, reusable validation at the GitHub
// release boundary.
package releasecheck

import (
	"bufio"
	"bytes"
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

	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/fileidentity"
)

const (
	checksumManifestName       = "SHA256SUMS"
	checksumBundleName         = "SHA256SUMS.sigstore.json"
	maximumChecksumBundleBytes = 64 * 1024
	ociManifestName            = "oci-images.json"
	maximumReleaseAttachments  = 128
	maximumChecksumBytes       = 64 * 1024
	maximumReleaseFileSize     = 512 * 1024 * 1024
)

var (
	assetNamePattern    = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9._+-]{0,254}$`)
	checksumLinePattern = regexp.MustCompile(`^([0-9a-f]{64})  ([A-Za-z0-9][A-Za-z0-9._+-]{0,254})$`)
)

// InventoryPhase identifies the source-only and final-publication asset sets.
type InventoryPhase string

const (
	SourceAssets      InventoryPhase = "source"
	PublicationAssets InventoryPhase = "publication"
)

// ValidateAssetInventory verifies SHA256SUMS, every named byte sequence, and
// the exact flat directory inventory. It returns the sorted upload names,
// including SHA256SUMS itself.
func ValidateAssetInventory(assetsRoot string, phase InventoryPhase) ([]string, error) {
	if phase != SourceAssets && phase != PublicationAssets {
		return nil, errors.New("release asset phase must be source or publication")
	}
	root, err := cleanDirectory(assetsRoot)
	if err != nil {
		return nil, err
	}
	rootBefore, err := fileidentity.Lstat(root)
	if err != nil {
		return nil, fmt.Errorf("inspect release asset root: %w", err)
	}
	before, err := snapshotAssetDirectory(root)
	if err != nil {
		return nil, err
	}
	manifestPath := filepath.Join(root, checksumManifestName)
	body, err := readRegularFile(root, manifestPath, maximumChecksumBytes)
	if err != nil {
		return nil, fmt.Errorf("read SHA256SUMS: %w", err)
	}
	checksums, names, err := parseChecksumManifest(body, phase)
	if err != nil {
		return nil, err
	}
	if phase == PublicationAssets {
		names, err = includeChecksumBundle(root, checksums, names)
		if err != nil {
			return nil, err
		}
	}
	if err := validateChecksummedFiles(root, names, checksums); err != nil {
		return nil, err
	}

	expected := append(slices.Clone(names), checksumManifestName)
	slices.Sort(expected)
	observed := snapshotNames(before)
	if !slices.Equal(expected, observed) {
		return nil, fmt.Errorf("local release assets do not match SHA256SUMS: expected %v, observed %v", expected, observed)
	}
	if err := verifyInventorySnapshot(root, manifestPath, body, before, rootBefore); err != nil {
		return nil, err
	}

	return expected, nil
}

func verifyInventorySnapshot(root, manifestPath string, body []byte, before []assetSnapshot, rootBefore os.FileInfo) error {
	bodyAfter, err := readRegularFile(root, manifestPath, maximumChecksumBytes)
	if err != nil {
		return fmt.Errorf("reread SHA256SUMS: %w", err)
	}
	if !bytes.Equal(body, bodyAfter) {
		return errors.New("SHA256SUMS changed during inventory validation")
	}
	after, err := snapshotAssetDirectory(root)
	if err != nil {
		return err
	}
	rootAfter, err := fileidentity.Lstat(root)
	if err != nil {
		return fmt.Errorf("reinspect release asset root: %w", err)
	}
	if !sameStableFile(rootBefore, rootAfter) || !sameDirectorySnapshot(before, after) {
		return errors.New("release asset directory changed during inventory validation")
	}
	return nil
}

func validateChecksummedFiles(root string, names []string, checksums map[string]string) error {
	firstDigests := make(map[string]string, len(names))
	for _, name := range names {
		file := filepath.Join(root, name)
		digest, err := digestRegularFile(root, file, maximumReleaseFileSize)
		if err != nil {
			return fmt.Errorf("validate release asset %s: %w", name, err)
		}
		if digest != checksums[name] {
			return fmt.Errorf("release asset %s does not match SHA256SUMS", name)
		}
		firstDigests[name] = digest
	}
	for _, name := range names {
		file := filepath.Join(root, name)
		digest, err := digestRegularFile(root, file, maximumReleaseFileSize)
		if err != nil {
			return fmt.Errorf("reread release asset %s: %w", name, err)
		}
		if digest != firstDigests[name] || digest != checksums[name] {
			return fmt.Errorf("release asset %s changed during inventory validation", name)
		}
	}
	return nil
}

// The detached signature cannot checksum itself. Its bytes are bounded here;
// the workflow verifies its signature over the final SHA256SUMS before upload.
func includeChecksumBundle(root string, checksums map[string]string, names []string) ([]string, error) {
	file := filepath.Join(root, checksumBundleName)
	info, err := validateRegularPath(root, file, maximumChecksumBundleBytes)
	if err != nil || info.Size() == 0 {
		return nil, fmt.Errorf("checksum bundle must be a nonempty bounded regular file: %s", file)
	}
	digest, err := digestRegularFile(root, file, maximumChecksumBundleBytes)
	if err != nil {
		return nil, fmt.Errorf("hash checksum bundle: %w", err)
	}
	checksums[checksumBundleName] = digest
	return append(names, checksumBundleName), nil
}

type assetSnapshot struct {
	name string
	info os.FileInfo
}

func snapshotAssetDirectory(root string) ([]assetSnapshot, error) {
	directory, err := os.Open(root) //#nosec G304 -- directory path validated by caller within release assets
	if err != nil {
		return nil, fmt.Errorf("list release assets: %w", err)
	}
	defer directory.Close()
	entries, err := directory.ReadDir(maximumReleaseAttachments + 1)
	if err != nil && !errors.Is(err, io.EOF) {
		return nil, fmt.Errorf("list release assets: %w", err)
	}
	if len(entries) > maximumReleaseAttachments {
		return nil, errors.New("release asset directory exceeds the bounded entry count")
	}
	result := make([]assetSnapshot, 0, len(entries))
	for _, entry := range entries {
		if !assetNamePattern.MatchString(entry.Name()) {
			return nil, fmt.Errorf("release asset directory contains an unsafe entry: %s", entry.Name())
		}
		information, err := fileidentity.Lstat(filepath.Join(root, entry.Name()))
		if err != nil {
			return nil, fmt.Errorf("inspect release asset %s: %w", entry.Name(), err)
		}
		if !information.Mode().IsRegular() || information.Mode()&os.ModeSymlink != 0 {
			return nil, fmt.Errorf("release asset directory contains an unsafe entry: %s", entry.Name())
		}
		result = append(result, assetSnapshot{name: entry.Name(), info: information})
	}
	slices.SortFunc(result, func(left, right assetSnapshot) int {
		return strings.Compare(left.name, right.name)
	})
	return result, nil
}

func snapshotNames(snapshot []assetSnapshot) []string {
	names := make([]string, 0, len(snapshot))
	for _, entry := range snapshot {
		names = append(names, entry.name)
	}
	return names
}

func sameDirectorySnapshot(left, right []assetSnapshot) bool {
	if len(left) != len(right) {
		return false
	}
	for index := range left {
		if left[index].name != right[index].name || !sameStableFile(left[index].info, right[index].info) {
			return false
		}
	}
	return true
}

// ComparePublicationManifest requires a final checksum authority to preserve
// every verified source asset and add exactly oci-images.json. When an OCI
// manifest path is supplied, its bytes must match that added checksum.
func ComparePublicationManifest(sourceManifest, publicationManifest, ociManifest string) error {
	sourceBody, err := readManifest(sourceManifest)
	if err != nil {
		return fmt.Errorf("read source SHA256SUMS: %w", err)
	}
	publicationBody, err := readManifest(publicationManifest)
	if err != nil {
		return fmt.Errorf("read publication SHA256SUMS: %w", err)
	}
	sourceChecksums, sourceNames, err := parseChecksumManifest(sourceBody, SourceAssets)
	if err != nil {
		return fmt.Errorf("validate source SHA256SUMS: %w", err)
	}
	publicationChecksums, publicationNames, err := parseChecksumManifest(publicationBody, PublicationAssets)
	if err != nil {
		return fmt.Errorf("validate publication SHA256SUMS: %w", err)
	}
	if len(publicationNames) != len(sourceNames)+1 {
		return errors.New("publication SHA256SUMS must add exactly one OCI image identity")
	}
	for name, digest := range sourceChecksums {
		if publicationChecksums[name] != digest {
			return fmt.Errorf("publication SHA256SUMS changes verified source asset %s", name)
		}
	}
	if ociManifest == "" {
		return nil
	}
	ociDigest, err := digestFile(ociManifest, maximumReleaseFileSize)
	if err != nil {
		return fmt.Errorf("hash oci-images.json: %w", err)
	}
	if ociDigest != publicationChecksums[ociManifestName] {
		return errors.New("oci-images.json does not match the publication SHA256SUMS identity")
	}
	return nil
}

func parseChecksumManifest(body []byte, phase InventoryPhase) (map[string]string, []string, error) {
	checksums := make(map[string]string)
	var names []string
	// SHA256SUMS is itself one release attachment but must not list itself.
	maximumNames := maximumReleaseAttachments - 2
	if phase == SourceAssets {
		// Reserve one final checksum identity for oci-images.json.
		maximumNames--
	}
	scanner := bufio.NewScanner(strings.NewReader(string(body)))
	scanner.Buffer(make([]byte, 1024), maximumChecksumBytes)
	previous := ""
	for scanner.Scan() {
		if len(names) >= maximumNames {
			return nil, nil, errors.New("SHA256SUMS exceeds the bounded release asset count")
		}
		match := checksumLinePattern.FindStringSubmatch(scanner.Text())
		if match == nil {
			return nil, nil, fmt.Errorf("malformed or unsafe SHA256SUMS entry: %s", scanner.Text())
		}
		digest, name := match[1], match[2]
		if name == checksumManifestName {
			return nil, nil, errors.New("SHA256SUMS must not list itself")
		}
		if name == checksumBundleName {
			return nil, nil, errors.New("SHA256SUMS must not list its detached signature")
		}
		if _, exists := checksums[name]; exists {
			return nil, nil, fmt.Errorf("duplicate SHA256SUMS asset name: %s", name)
		}
		if previous != "" && previous > name {
			return nil, nil, fmt.Errorf("SHA256SUMS asset names are not sorted: %s, %s", previous, name)
		}
		checksums[name] = digest
		names = append(names, name)
		previous = name
	}
	if err := scanner.Err(); err != nil {
		return nil, nil, fmt.Errorf("scan SHA256SUMS: %w", err)
	}
	if len(names) == 0 {
		return nil, nil, errors.New("SHA256SUMS contains no release assets")
	}
	_, hasOCI := checksums[ociManifestName]
	if phase == SourceAssets && hasOCI {
		return nil, nil, errors.New("verified source assets must not predeclare final OCI image identities")
	}
	if phase == PublicationAssets && !hasOCI {
		return nil, nil, errors.New("publication assets must include oci-images.json")
	}
	return checksums, names, nil
}

func cleanDirectory(directory string) (string, error) {
	if directory == "" {
		return "", errors.New("release asset root is required")
	}
	root, err := filepath.Abs(directory)
	if err != nil {
		return "", fmt.Errorf("resolve release asset root: %w", err)
	}
	root = filepath.Clean(root)
	information, err := fileidentity.Lstat(root)
	if err != nil {
		return "", fmt.Errorf("inspect release asset root: %w", err)
	}
	if !information.IsDir() || information.Mode()&os.ModeSymlink != 0 {
		return "", errors.New("release asset root must be a non-symlink directory")
	}
	return root, nil
}

func readManifest(file string) ([]byte, error) {
	if file == "" {
		return nil, errors.New("checksum manifest path is required")
	}
	absolute, err := filepath.Abs(file)
	if err != nil {
		return nil, fmt.Errorf("resolve checksum manifest path: %w", err)
	}
	root, err := cleanDirectory(filepath.Dir(absolute))
	if err != nil {
		return nil, err
	}
	return readRegularFile(root, absolute, maximumChecksumBytes)
}

func digestFile(file string, maximumBytes int64) (string, error) {
	if file == "" {
		return "", errors.New("release file path is required")
	}
	absolute, err := filepath.Abs(file)
	if err != nil {
		return "", fmt.Errorf("resolve release file path: %w", err)
	}
	root, err := cleanDirectory(filepath.Dir(absolute))
	if err != nil {
		return "", err
	}
	return digestRegularFile(root, absolute, maximumBytes)
}

func readRegularFile(root, file string, maximumBytes int64) ([]byte, error) {
	information, err := validateRegularPath(root, file, maximumBytes)
	if err != nil {
		return nil, err
	}
	opened, err := os.Open(file) //#nosec G304 -- path within root validated by validateRegularPath
	if err != nil {
		return nil, err
	}
	defer opened.Close()
	body, err := io.ReadAll(io.LimitReader(opened, maximumBytes+1))
	if err != nil {
		return nil, err
	}
	openedInformation, openedError := opened.Stat()
	currentInformation, currentError := fileidentity.Lstat(file)
	if openedError != nil || currentError != nil || !sameStableFile(information, openedInformation) ||
		!sameStableFile(information, currentInformation) || int64(len(body)) != information.Size() {
		return nil, errors.New("release file changed while it was read")
	}
	return body, nil
}

func digestRegularFile(root, file string, maximumBytes int64) (string, error) {
	information, err := validateRegularPath(root, file, maximumBytes)
	if err != nil {
		return "", err
	}
	opened, err := os.Open(file) //#nosec G304 -- path within root validated by validateRegularPath
	if err != nil {
		return "", err
	}
	defer opened.Close()
	hash := sha256.New()
	written, err := io.Copy(hash, io.LimitReader(opened, maximumBytes+1))
	if err != nil {
		return "", err
	}
	openedInformation, openedError := opened.Stat()
	currentInformation, currentError := fileidentity.Lstat(file)
	if openedError != nil || currentError != nil || !sameStableFile(information, openedInformation) ||
		!sameStableFile(information, currentInformation) || written != information.Size() {
		return "", errors.New("release file changed while it was hashed")
	}
	return hex.EncodeToString(hash.Sum(nil)), nil
}

func sameStableFile(left, right os.FileInfo) bool {
	return os.SameFile(left, right) &&
		left.Mode() == right.Mode() &&
		left.Size() == right.Size() &&
		left.ModTime().Equal(right.ModTime())
}

func validateRegularPath(root, file string, maximumBytes int64) (os.FileInfo, error) {
	relative, err := filepath.Rel(root, file)
	if err != nil || relative == "." || relative == ".." || strings.HasPrefix(relative, ".."+string(filepath.Separator)) {
		return nil, errors.New("release file escapes its asset root")
	}
	current := root
	for _, component := range strings.Split(relative, string(filepath.Separator)) {
		current = filepath.Join(current, component)
		information, err := fileidentity.Lstat(current)
		if err != nil {
			return nil, err
		}
		if information.Mode()&os.ModeSymlink != 0 {
			return nil, errors.New("release file path contains a symlink")
		}
	}
	information, err := fileidentity.Lstat(file)
	if err != nil {
		return nil, err
	}
	if !information.Mode().IsRegular() || information.Mode()&os.ModeSymlink != 0 ||
		information.Size() < 0 || information.Size() > maximumBytes {
		return nil, fmt.Errorf("release file must be a bounded regular non-symlink file: %s", file)
	}
	return information, nil
}
