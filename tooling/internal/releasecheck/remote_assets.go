package releasecheck

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"hash"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"slices"
	"strings"
	"time"

	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/ocimanifest"
)

const (
	maximumReleaseAssetPageSize = 100
	maximumReleaseAssetPages    = 2
	githubAPIRequestTimeout     = 30 * time.Second
	githubAPICommandWaitDelay   = 5 * time.Second
)

const (
	githubAPIAcceptHeader  = "Accept: application/vnd.github+json"
	githubAPIVersionHeader = "X-GitHub-Api-Version: 2022-11-28"
)

var errReleaseAssetExceedsExpectedSize = errors.New("release asset body exceeds its expected size")

// FetchAssetsOptions closes one remote GitHub Release asset inventory against
// a locally validated source or publication inventory.
type FetchAssetsOptions struct {
	Repository      string
	ReleaseID       int64
	ExpectedAssets  string
	Phase           InventoryPhase
	OutputDirectory string
	ReleaseTag      string
	ReleaseCommit   string
}

// RemoteReleaseAsset is the bounded metadata needed before an asset body may
// be requested.
type RemoteReleaseAsset struct {
	ID    int64
	Name  string
	Size  int64
	State string
}

// ReleaseAssetClient separates the closed inventory protocol from the gh CLI
// transport so every fail-closed branch can be tested without network access.
type ReleaseAssetClient interface {
	ListReleaseAssets(context.Context, string, int64, int) ([]RemoteReleaseAsset, error)
	DownloadReleaseAsset(context.Context, string, int64, io.Writer) error
}

// GHReleaseAssetClient performs bounded authenticated reads through gh api.
type GHReleaseAssetClient struct{}

type expectedRemoteAsset struct {
	name         string
	size         int64
	digest       string
	localPath    string
	localDigest  string
	localInitial os.FileInfo
}

// FetchReleaseAssets validates every remote record before making any body
// request, then downloads each body into a newly created closed directory.
// The returned names are safe, unique, and sorted.
func FetchReleaseAssets(
	ctx context.Context,
	options FetchAssetsOptions,
	client ReleaseAssetClient,
) ([]string, error) {
	if ctx == nil {
		return nil, errors.New("release asset context is required")
	}
	if !repositoryPattern.MatchString(options.Repository) {
		return nil, errors.New("GitHub repository must be an owner/name pair")
	}
	if options.ReleaseID <= 0 {
		return nil, errors.New("GitHub Release ID must be a positive integer")
	}
	if client == nil {
		return nil, errors.New("GitHub Release asset client is required")
	}
	expectedRoot, expectations, err := buildRemoteAssetExpectations(options)
	if err != nil {
		return nil, err
	}

	assets, err := listBoundedReleaseAssets(ctx, options.Repository, options.ReleaseID, expectations, client)
	if err != nil {
		return nil, err
	}
	if err := revalidateExpectedAssets(expectedRoot, expectations); err != nil {
		return nil, err
	}

	outputRoot, outputInitial, err := createExclusiveOutputDirectory(options.OutputDirectory, expectedRoot)
	if err != nil {
		return nil, err
	}
	complete := false
	defer func() {
		if !complete {
			current, currentErr := os.Lstat(outputRoot)
			if currentErr == nil && current.IsDir() && current.Mode()&os.ModeSymlink == 0 &&
				os.SameFile(outputInitial, current) {
				_ = os.RemoveAll(outputRoot)
			}
		}
	}()

	slices.SortFunc(assets, func(left, right RemoteReleaseAsset) int {
		return strings.Compare(left.Name, right.Name)
	})
	names := make([]string, 0, len(assets))
	for _, asset := range assets {
		expected := expectations[asset.Name]
		if err := downloadReleaseAsset(ctx, outputRoot, options.Repository, asset, expected, client); err != nil {
			return nil, err
		}
		names = append(names, asset.Name)
	}
	if err := revalidateExpectedAssets(expectedRoot, expectations); err != nil {
		return nil, err
	}

	snapshot, err := snapshotAssetDirectory(outputRoot)
	if err != nil {
		return nil, fmt.Errorf("validate downloaded release asset directory: %w", err)
	}
	if !slices.Equal(snapshotNames(snapshot), names) {
		return nil, errors.New("downloaded release asset directory does not match the remote inventory")
	}
	outputCurrent, err := os.Lstat(outputRoot)
	if err != nil || !outputCurrent.IsDir() || outputCurrent.Mode()&os.ModeSymlink != 0 ||
		!os.SameFile(outputInitial, outputCurrent) {
		return nil, errors.New("release asset output directory changed during download")
	}
	complete = true
	return names, nil
}

func buildRemoteAssetExpectations(options FetchAssetsOptions) (string, map[string]expectedRemoteAsset, error) {
	if options.Phase != SourceAssets && options.Phase != PublicationAssets {
		return "", nil, errors.New("release asset phase must be source or publication")
	}
	names, err := ValidateAssetInventory(options.ExpectedAssets, options.Phase)
	if err != nil {
		return "", nil, fmt.Errorf("validate expected release assets: %w", err)
	}
	root, err := cleanDirectory(options.ExpectedAssets)
	if err != nil {
		return "", nil, err
	}
	expectations := make(map[string]expectedRemoteAsset, len(names)+1)
	for _, name := range names {
		path := filepath.Join(root, name)
		maximumBytes := int64(maximumReleaseFileSize)
		if name == checksumManifestName {
			maximumBytes = maximumChecksumBytes
		}
		information, err := validateRegularPath(root, path, maximumBytes)
		if err != nil {
			return "", nil, fmt.Errorf("inspect expected release asset %s: %w", name, err)
		}
		digest, err := digestRegularFile(root, path, maximumBytes)
		if err != nil {
			return "", nil, fmt.Errorf("hash expected release asset %s: %w", name, err)
		}
		expectations[name] = expectedRemoteAsset{
			name:         name,
			size:         information.Size(),
			digest:       digest,
			localPath:    path,
			localDigest:  digest,
			localInitial: information,
		}
	}
	if options.Phase == PublicationAssets {
		if options.ReleaseTag != "" || options.ReleaseCommit != "" {
			return "", nil, errors.New("publication asset fetch must not accept source-shaping identities")
		}
		return root, expectations, nil
	}
	if !releaseTagPattern.MatchString(options.ReleaseTag) {
		return "", nil, errors.New("source asset fetch requires a vMAJOR.MINOR.PATCH release tag")
	}
	if !commitPattern.MatchString(options.ReleaseCommit) {
		return "", nil, errors.New("source asset fetch requires a lowercase 40-character release commit")
	}

	checksum := expectations[checksumManifestName]
	checksumBody, err := readRegularFile(root, checksum.localPath, maximumChecksumBytes)
	if err != nil {
		return "", nil, fmt.Errorf("read source checksum shape: %w", err)
	}
	checksumAddition := len(strings.Repeat("0", 64) + "  " + ociManifestName + "\n")
	if !bytes.HasSuffix(checksumBody, []byte("\n")) {
		checksumAddition++
	}
	checksum.size += int64(checksumAddition)
	checksum.digest = ""
	if checksum.size > maximumChecksumBytes {
		return "", nil, errors.New("final publication SHA256SUMS would exceed its byte limit")
	}
	expectations[checksumManifestName] = checksum

	placeholderRepository := placeholderRepository(options.Repository)
	manifest, err := ocimanifest.New(ocimanifest.Options{
		Repository:       placeholderRepository,
		Tag:              options.ReleaseTag,
		Commit:           options.ReleaseCommit,
		ToolingDigest:    "sha256:" + strings.Repeat("1", 64),
		Fixture007Digest: "sha256:" + strings.Repeat("2", 64),
		Fixture019Digest: "sha256:" + strings.Repeat("3", 64),
	})
	if err != nil {
		return "", nil, fmt.Errorf("derive expected OCI manifest shape: %w", err)
	}
	body, err := ocimanifest.Marshal(manifest)
	if err != nil {
		return "", nil, fmt.Errorf("encode expected OCI manifest shape: %w", err)
	}
	expectations[ociManifestName] = expectedRemoteAsset{
		name: ociManifestName,
		size: int64(len(body)),
	}
	return root, expectations, nil
}

func placeholderRepository(repository string) string {
	owner, name, _ := strings.Cut(repository, "/")
	return strings.Repeat("a", len(owner)) + "/" + strings.Repeat("b", len(name))
}

func listBoundedReleaseAssets(
	ctx context.Context,
	repository string,
	releaseID int64,
	expectations map[string]expectedRemoteAsset,
	client ReleaseAssetClient,
) ([]RemoteReleaseAsset, error) {
	assets := make([]RemoteReleaseAsset, 0, min(len(expectations), maximumReleaseAttachments))
	seenNames := make(map[string]struct{})
	seenIDs := make(map[int64]struct{})
	for page := 1; page <= maximumReleaseAssetPages; page++ {
		pageAssets, err := client.ListReleaseAssets(ctx, repository, releaseID, page)
		if err != nil {
			return nil, fmt.Errorf("list GitHub Release assets page %d: %w", page, err)
		}
		if len(pageAssets) > maximumReleaseAssetPageSize {
			return nil, errors.New("GitHub Release asset page exceeds 100 records")
		}
		for _, asset := range pageAssets {
			if len(assets) >= maximumReleaseAttachments {
				return nil, errors.New("remote release exceeds the 128-attachment bound")
			}
			if asset.ID <= 0 {
				return nil, errors.New("remote release asset has a nonpositive ID")
			}
			if _, exists := seenIDs[asset.ID]; exists {
				return nil, fmt.Errorf("remote release contains duplicate asset ID %d", asset.ID)
			}
			if !assetNamePattern.MatchString(asset.Name) {
				return nil, fmt.Errorf("remote release contains unsafe asset name %s", valueOrMissing(asset.Name))
			}
			if _, exists := seenNames[asset.Name]; exists {
				return nil, fmt.Errorf("remote release contains duplicate asset name %s", asset.Name)
			}
			expected, exists := expectations[asset.Name]
			if !exists {
				return nil, fmt.Errorf("remote release contains unexpected asset %s", asset.Name)
			}
			if asset.State != "uploaded" {
				return nil, fmt.Errorf("remote release asset %s is not uploaded", asset.Name)
			}
			if asset.Size < 0 || asset.Size != expected.size {
				return nil, fmt.Errorf(
					"remote release asset %s reports size %d, expected %d",
					asset.Name,
					asset.Size,
					expected.size,
				)
			}
			seenIDs[asset.ID] = struct{}{}
			seenNames[asset.Name] = struct{}{}
			assets = append(assets, asset)
		}
		if len(pageAssets) < maximumReleaseAssetPageSize {
			break
		}
	}
	return assets, nil
}

func revalidateExpectedAssets(root string, expectations map[string]expectedRemoteAsset) error {
	for name, expected := range expectations {
		if expected.localPath == "" {
			continue
		}
		maximumBytes := int64(maximumReleaseFileSize)
		if name == checksumManifestName {
			maximumBytes = maximumChecksumBytes
		}
		current, err := validateRegularPath(root, expected.localPath, maximumBytes)
		if err != nil || !sameStableFile(expected.localInitial, current) {
			return fmt.Errorf("expected release asset %s changed during remote asset verification", name)
		}
		digest, err := digestRegularFile(root, expected.localPath, maximumBytes)
		if err != nil || digest != expected.localDigest {
			return fmt.Errorf("expected release asset %s changed during remote asset verification", name)
		}
	}
	return nil
}

func createExclusiveOutputDirectory(output, expectedRoot string) (string, os.FileInfo, error) {
	if output == "" {
		return "", nil, errors.New("release asset output directory is required")
	}
	absolute, err := filepath.Abs(output)
	if err != nil {
		return "", nil, fmt.Errorf("resolve release asset output directory: %w", err)
	}
	absolute = filepath.Clean(absolute)
	parent, err := cleanDirectory(filepath.Dir(absolute))
	if err != nil {
		return "", nil, fmt.Errorf("inspect release asset output parent: %w", err)
	}
	if parent != filepath.Dir(absolute) {
		return "", nil, errors.New("release asset output parent path is not canonical")
	}
	resolvedParent, err := filepath.EvalSymlinks(parent)
	if err != nil {
		return "", nil, fmt.Errorf("resolve release asset output parent links: %w", err)
	}
	if filepath.Clean(resolvedParent) != parent {
		return "", nil, errors.New("release asset output parent path must not contain symlinks")
	}
	if relative, relativeErr := filepath.Rel(expectedRoot, absolute); relativeErr == nil &&
		(relative == "." || (relative != ".." && !strings.HasPrefix(relative, ".."+string(filepath.Separator)))) {
		return "", nil, errors.New("release asset output directory must be outside the expected asset root")
	}
	if _, err := os.Lstat(absolute); !errors.Is(err, os.ErrNotExist) {
		if err == nil {
			return "", nil, errors.New("release asset output directory already exists")
		}
		return "", nil, fmt.Errorf("inspect release asset output directory: %w", err)
	}
	if err := os.Mkdir(absolute, 0o700); err != nil {
		return "", nil, fmt.Errorf("create release asset output directory: %w", err)
	}
	information, err := os.Lstat(absolute)
	if err != nil || !information.IsDir() || information.Mode()&os.ModeSymlink != 0 {
		_ = os.Remove(absolute)
		return "", nil, errors.New("release asset output must be a real directory")
	}
	return absolute, information, nil
}

func downloadReleaseAsset(
	ctx context.Context,
	outputRoot, repository string,
	asset RemoteReleaseAsset,
	expected expectedRemoteAsset,
	client ReleaseAssetClient,
) error {
	temporary, err := os.CreateTemp(outputRoot, ".20w-release-asset-")
	if err != nil {
		return fmt.Errorf("create temporary release asset %s: %w", asset.Name, err)
	}
	temporaryPath := temporary.Name()
	keepTemporary := true
	defer func() {
		_ = temporary.Close()
		if keepTemporary {
			_ = os.Remove(temporaryPath)
		}
	}()
	writer := &boundedAssetWriter{
		file:  temporary,
		hash:  sha256.New(),
		limit: expected.size + 1,
	}
	if err := client.DownloadReleaseAsset(ctx, repository, asset.ID, writer); err != nil {
		if writer.exceeded || errors.Is(err, errReleaseAssetExceedsExpectedSize) {
			return fmt.Errorf("download release asset %s: %w", asset.Name, errReleaseAssetExceedsExpectedSize)
		}
		return fmt.Errorf("download release asset %s: %w", asset.Name, err)
	}
	if writer.written != expected.size {
		return fmt.Errorf(
			"downloaded release asset %s has size %d, expected %d",
			asset.Name,
			writer.written,
			expected.size,
		)
	}
	if expected.digest != "" && hex.EncodeToString(writer.hash.Sum(nil)) != expected.digest {
		return fmt.Errorf("downloaded release asset %s does not match the expected local digest", asset.Name)
	}
	if err := temporary.Sync(); err != nil {
		return fmt.Errorf("synchronize release asset %s: %w", asset.Name, err)
	}
	information, err := temporary.Stat()
	if err != nil || !information.Mode().IsRegular() || information.Size() != expected.size {
		return fmt.Errorf("temporary release asset %s is not the expected regular file", asset.Name)
	}
	if err := temporary.Close(); err != nil {
		return fmt.Errorf("close release asset %s: %w", asset.Name, err)
	}
	destination := filepath.Join(outputRoot, asset.Name)
	if err := os.Link(temporaryPath, destination); err != nil {
		return fmt.Errorf("publish downloaded release asset %s without replacement: %w", asset.Name, err)
	}
	destinationInformation, err := os.Lstat(destination)
	if err != nil || !destinationInformation.Mode().IsRegular() || destinationInformation.Mode()&os.ModeSymlink != 0 ||
		!os.SameFile(information, destinationInformation) || destinationInformation.Size() != expected.size {
		return fmt.Errorf("published release asset %s is not the verified temporary file", asset.Name)
	}
	if err := os.Remove(temporaryPath); err != nil {
		return fmt.Errorf("remove temporary release asset %s: %w", asset.Name, err)
	}
	keepTemporary = false
	return nil
}

type boundedAssetWriter struct {
	file     *os.File
	hash     hash.Hash
	limit    int64
	written  int64
	exceeded bool
}

func (writer *boundedAssetWriter) Write(body []byte) (int, error) {
	if writer.exceeded {
		return 0, errReleaseAssetExceedsExpectedSize
	}
	remaining := writer.limit - writer.written
	if remaining <= 0 {
		writer.exceeded = true
		return 0, errReleaseAssetExceedsExpectedSize
	}
	originalLength := len(body)
	if int64(len(body)) > remaining {
		body = body[:remaining]
		writer.exceeded = true
	}
	written, err := writer.file.Write(body)
	if written > 0 {
		_, _ = writer.hash.Write(body[:written])
		writer.written += int64(written)
	}
	if err != nil {
		return written, err
	}
	if writer.exceeded || written != originalLength {
		return written, errReleaseAssetExceedsExpectedSize
	}
	return written, nil
}

func (GHReleaseAssetClient) ListReleaseAssets(
	ctx context.Context,
	repository string,
	releaseID int64,
	page int,
) ([]RemoteReleaseAsset, error) {
	if page < 1 || page > maximumReleaseAssetPages {
		return nil, errors.New("GitHub Release asset page must be one or two")
	}
	endpoint := fmt.Sprintf(
		"repos/%s/releases/%d/assets?per_page=%d&page=%d",
		repository,
		releaseID,
		maximumReleaseAssetPageSize,
		page,
	)
	stdout := &boundedBuffer{limit: maximumGHOutputBytes}
	stderr := &boundedBuffer{limit: maximumGHOutputBytes}
	err := runBoundedGHCommand(
		ctx,
		stdout,
		stderr,
		"api",
		endpoint,
		"-H", githubAPIAcceptHeader,
		"-H", githubAPIVersionHeader,
		"--jq", "[.[] | {id, name, size, state}]",
	)
	if err != nil {
		return nil, err
	}
	if stdout.Exceeded() || stderr.Exceeded() {
		return nil, errors.New("GitHub Release asset metadata exceeds its bounded output size")
	}
	return decodeReleaseAssetPage(stdout.Bytes())
}

func (GHReleaseAssetClient) DownloadReleaseAsset(
	ctx context.Context,
	repository string,
	assetID int64,
	writer io.Writer,
) error {
	if assetID <= 0 || writer == nil {
		return errors.New("GitHub Release asset download requires a positive ID and writer")
	}
	stderr := &boundedBuffer{limit: maximumGHOutputBytes}
	err := runBoundedGHCommand(
		ctx,
		writer,
		stderr,
		"api",
		"-H", "Accept: application/octet-stream",
		"-H", githubAPIVersionHeader,
		fmt.Sprintf("repos/%s/releases/assets/%d", repository, assetID),
	)
	if stderr.Exceeded() {
		return errors.New("GitHub Release asset download diagnostic exceeds its bounded output size")
	}
	return err
}

func runBoundedGHCommand(ctx context.Context, stdout, stderr io.Writer, arguments ...string) error {
	requestContext, cancel := context.WithTimeout(ctx, githubAPIRequestTimeout)
	defer cancel()
	command := exec.CommandContext(requestContext, "gh", arguments...)
	command.Stdout = stdout
	command.Stderr = stderr
	command.WaitDelay = githubAPICommandWaitDelay
	err := command.Run()
	if buffer, ok := stdout.(*boundedBuffer); ok && buffer.Exceeded() {
		return errors.New("GitHub API response exceeds its bounded output size")
	}
	if buffer, ok := stderr.(*boundedBuffer); ok && buffer.Exceeded() {
		return errors.New("GitHub API diagnostic exceeds its bounded output size")
	}
	if err != nil {
		if requestContext.Err() != nil {
			return fmt.Errorf("GitHub API request: %w", requestContext.Err())
		}
		diagnostic := ""
		if buffer, ok := stderr.(*boundedBuffer); ok {
			diagnostic = boundedDiagnostic(buffer.String())
		}
		return fmt.Errorf("GitHub API request failed: %w: %s", err, diagnostic)
	}
	return nil
}

func decodeReleaseAssetPage(body []byte) ([]RemoteReleaseAsset, error) {
	decoder := json.NewDecoder(bytes.NewReader(body))
	decoder.DisallowUnknownFields()
	var raw []struct {
		ID    *int64  `json:"id"`
		Name  *string `json:"name"`
		Size  *int64  `json:"size"`
		State *string `json:"state"`
	}
	if err := decoder.Decode(&raw); err != nil {
		return nil, fmt.Errorf("decode GitHub Release asset metadata: %w", err)
	}
	if err := decoder.Decode(&struct{}{}); !errors.Is(err, io.EOF) {
		return nil, errors.New("GitHub Release asset metadata contains trailing data")
	}
	if len(raw) > maximumReleaseAssetPageSize {
		return nil, errors.New("GitHub Release asset page exceeds 100 records")
	}
	assets := make([]RemoteReleaseAsset, 0, len(raw))
	for _, record := range raw {
		if record.ID == nil || record.Name == nil || record.Size == nil || record.State == nil {
			return nil, errors.New("GitHub Release asset metadata is missing a required field")
		}
		assets = append(assets, RemoteReleaseAsset{
			ID:    *record.ID,
			Name:  *record.Name,
			Size:  *record.Size,
			State: *record.State,
		})
	}
	return assets, nil
}
