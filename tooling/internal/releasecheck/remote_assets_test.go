package releasecheck

import (
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"
)

const (
	testReleaseRepository = "owner/project"
	testReleaseTag        = "v1.2.3"
	testReleaseCommit     = "0123456789abcdef0123456789abcdef01234567"
)

type fakeReleaseAssetClient struct {
	pages          map[int][]RemoteReleaseAsset
	bodies         map[int64][]byte
	listError      error
	downloadError  error
	beforeDownload func()
	listCalls      []int
	downloadCalls  []int64
}

func (client *fakeReleaseAssetClient) ListReleaseAssets(
	_ context.Context,
	_ string,
	_ int64,
	page int,
) ([]RemoteReleaseAsset, error) {
	client.listCalls = append(client.listCalls, page)
	if client.listError != nil {
		return nil, client.listError
	}
	return slices.Clone(client.pages[page]), nil
}

func (client *fakeReleaseAssetClient) DownloadReleaseAsset(
	_ context.Context,
	_ string,
	assetID int64,
	writer io.Writer,
) error {
	client.downloadCalls = append(client.downloadCalls, assetID)
	if client.beforeDownload != nil {
		client.beforeDownload()
		client.beforeDownload = nil
	}
	if _, err := writer.Write(client.bodies[assetID]); err != nil {
		return err
	}
	return client.downloadError
}

func TestFetchReleaseAssetsAcceptsTheExact128AssetBoundAndSortsNames(t *testing.T) {
	t.Parallel()
	options, expectations := sourceFetchFixture(t, maximumReleaseAttachments-3)
	assets, bodies := remoteAssetsForExpectations(t, expectations)
	if len(assets) != maximumReleaseAttachments {
		t.Fatalf("fixture contains %d assets, want %d", len(assets), maximumReleaseAttachments)
	}
	slices.Reverse(assets)
	client := &fakeReleaseAssetClient{
		pages: map[int][]RemoteReleaseAsset{
			1: slices.Clone(assets[:maximumReleaseAssetPageSize]),
			2: slices.Clone(assets[maximumReleaseAssetPageSize:]),
		},
		bodies: bodies,
	}

	names, err := FetchReleaseAssets(context.Background(), options, client)
	if err != nil {
		t.Fatalf("FetchReleaseAssets() error = %v", err)
	}
	want := make([]string, 0, len(assets))
	for _, asset := range assets {
		want = append(want, asset.Name)
	}
	slices.Sort(want)
	if !slices.Equal(names, want) {
		t.Fatalf("FetchReleaseAssets() names = %v, want sorted %v", names, want)
	}
	if !slices.Equal(client.listCalls, []int{1, 2}) {
		t.Fatalf("list calls = %v, want [1 2]", client.listCalls)
	}
	if len(client.downloadCalls) != maximumReleaseAttachments {
		t.Fatalf("download calls = %d, want %d", len(client.downloadCalls), maximumReleaseAttachments)
	}
}

func TestSourceFetchBoundsNondeterministicChecksumBundleBeforeDownload(t *testing.T) {
	for _, size := range []int64{0, 1, maximumChecksumBundleBytes, maximumChecksumBundleBytes + 1} {
		t.Run(fmt.Sprint(size), func(t *testing.T) {
			options, expectations := sourceFetchFixture(t, 1)
			assets, bodies := remoteAssetsForExpectations(t, expectations)
			for index := range assets {
				if assets[index].Name == checksumBundleName {
					assets[index].Size = size
					bodies[assets[index].ID] = []byte(strings.Repeat("x", int(size)))
				}
			}
			client := &fakeReleaseAssetClient{pages: map[int][]RemoteReleaseAsset{1: assets}, bodies: bodies}
			_, err := FetchReleaseAssets(context.Background(), options, client)
			if size == 0 || size > maximumChecksumBundleBytes {
				assertFetchFailureBeforeBody(t, options.OutputDirectory, client, err, "reports size")
			} else if err != nil {
				t.Fatalf("valid bundle size %d: %v", size, err)
			}
		})
	}
}

func TestFetchReleaseAssetsRejectsThe129thRecordBeforeAnyBodyRequest(t *testing.T) {
	t.Parallel()
	options, expectations := sourceFetchFixture(t, maximumReleaseAttachments-3)
	assets, bodies := remoteAssetsForExpectations(t, expectations)
	assets = append(assets, RemoteReleaseAsset{
		ID:    10_000,
		Name:  "unexpected-129th.txt",
		Size:  1,
		State: "uploaded",
	})
	client := &fakeReleaseAssetClient{
		pages: map[int][]RemoteReleaseAsset{
			1: slices.Clone(assets[:maximumReleaseAssetPageSize]),
			2: slices.Clone(assets[maximumReleaseAssetPageSize:]),
		},
		bodies: bodies,
	}

	_, err := FetchReleaseAssets(context.Background(), options, client)
	assertFetchFailureBeforeBody(t, options.OutputDirectory, client, err, "128-attachment bound")
}

func TestFetchReleaseAssetsRejectsInvalidMetadataBeforeAnyBodyRequest(t *testing.T) {
	t.Parallel()
	tests := []struct {
		name   string
		mutate func([]RemoteReleaseAsset) []RemoteReleaseAsset
		want   string
	}{
		{
			name: "unsafe name",
			mutate: func(assets []RemoteReleaseAsset) []RemoteReleaseAsset {
				assets[0].Name = "../escape"
				return assets
			},
			want: "unsafe asset name",
		},
		{
			name: "unknown name",
			mutate: func(assets []RemoteReleaseAsset) []RemoteReleaseAsset {
				assets[0].Name = "unknown.txt"
				return assets
			},
			want: "unexpected asset",
		},
		{
			name: "duplicate name",
			mutate: func(assets []RemoteReleaseAsset) []RemoteReleaseAsset {
				assets[1].Name = assets[0].Name
				return assets
			},
			want: "duplicate asset name",
		},
		{
			name: "duplicate ID",
			mutate: func(assets []RemoteReleaseAsset) []RemoteReleaseAsset {
				assets[1].ID = assets[0].ID
				return assets
			},
			want: "duplicate asset ID",
		},
		{
			name: "nonpositive ID",
			mutate: func(assets []RemoteReleaseAsset) []RemoteReleaseAsset {
				assets[0].ID = 0
				return assets
			},
			want: "nonpositive ID",
		},
		{
			name: "negative size",
			mutate: func(assets []RemoteReleaseAsset) []RemoteReleaseAsset {
				assets[0].Size = -1
				return assets
			},
			want: "reports size -1",
		},
		{
			name: "mismatched size",
			mutate: func(assets []RemoteReleaseAsset) []RemoteReleaseAsset {
				assets[0].Size++
				return assets
			},
			want: "reports size",
		},
		{
			name: "unfinished upload",
			mutate: func(assets []RemoteReleaseAsset) []RemoteReleaseAsset {
				assets[0].State = "new"
				return assets
			},
			want: "is not uploaded",
		},
	}
	for _, test := range tests {
		test := test
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()
			options, expectations := publicationFetchFixture(t)
			assets, bodies := remoteAssetsForExpectations(t, expectations)
			assets = test.mutate(assets)
			client := &fakeReleaseAssetClient{
				pages:  map[int][]RemoteReleaseAsset{1: assets},
				bodies: bodies,
			}

			_, err := FetchReleaseAssets(context.Background(), options, client)
			assertFetchFailureBeforeBody(t, options.OutputDirectory, client, err, test.want)
		})
	}
}

func TestSourceFetchDerivesFinalChecksumAndOCIManifestShapes(t *testing.T) {
	t.Parallel()
	options, expectations := sourceFetchFixture(t, 1)
	checksum := expectations[checksumManifestName]
	localChecksum, err := os.Stat(filepath.Join(options.ExpectedAssets, checksumManifestName))
	if err != nil {
		t.Fatal(err)
	}
	wantChecksumSize := localChecksum.Size() + int64(len(strings.Repeat("0", 64)+"  "+ociManifestName+"\n"))
	if checksum.size != wantChecksumSize || checksum.digest != "" {
		t.Fatalf("source checksum expectation = size %d, digest %q; want size %d and deferred digest", checksum.size, checksum.digest, wantChecksumSize)
	}
	oci, exists := expectations[ociManifestName]
	if !exists || oci.size <= 0 || oci.localPath != "" || oci.digest != "" {
		t.Fatalf("source OCI expectation = %+v, want positive shaped size without local authority", oci)
	}

	for _, name := range []string{checksumManifestName, ociManifestName} {
		name := name
		t.Run(name+" size mismatch", func(t *testing.T) {
			assets, bodies := remoteAssetsForExpectations(t, expectations)
			for index := range assets {
				if assets[index].Name == name {
					assets[index].Size++
				}
			}
			output := filepath.Join(t.TempDir(), "download")
			localOptions := options
			localOptions.OutputDirectory = output
			client := &fakeReleaseAssetClient{
				pages:  map[int][]RemoteReleaseAsset{1: assets},
				bodies: bodies,
			}
			_, err := FetchReleaseAssets(context.Background(), localOptions, client)
			assertFetchFailureBeforeBody(t, output, client, err, "reports size")
		})
	}
}

func TestSourceFetchAccountsForANonTerminatedSourceChecksumLine(t *testing.T) {
	t.Parallel()
	root := t.TempDir()
	writeAsset(t, root, "book.pdf", "book")
	writeChecksums(t, root, []string{"book.pdf"})
	manifestPath := filepath.Join(root, checksumManifestName)
	body, err := os.ReadFile(manifestPath)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(manifestPath, body[:len(body)-1], 0o600); err != nil {
		t.Fatal(err)
	}
	options := FetchAssetsOptions{
		Repository:     testReleaseRepository,
		ReleaseID:      42,
		ExpectedAssets: root,
		Phase:          SourceAssets,
		ReleaseTag:     testReleaseTag,
		ReleaseCommit:  testReleaseCommit,
	}
	_, expectations, err := buildRemoteAssetExpectations(options)
	if err != nil {
		t.Fatalf("buildRemoteAssetExpectations() error = %v", err)
	}
	want := int64(len(body) - 1 + 1 + len(strings.Repeat("0", 64)+"  "+ociManifestName+"\n"))
	if got := expectations[checksumManifestName].size; got != want {
		t.Fatalf("final checksum size = %d, want %d", got, want)
	}
}

func TestFetchReleaseAssetsCleansOutputAfterInvalidBodies(t *testing.T) {
	t.Parallel()
	tests := []struct {
		name   string
		mutate func([]byte) []byte
		want   string
	}{
		{
			name: "short body",
			mutate: func(body []byte) []byte {
				return slices.Clone(body[:len(body)-1])
			},
			want: "has size",
		},
		{
			name: "wrong body",
			mutate: func(body []byte) []byte {
				changed := slices.Clone(body)
				changed[0] ^= 0xff
				return changed
			},
			want: "does not match the expected local digest",
		},
		{
			name: "expected plus one body",
			mutate: func(body []byte) []byte {
				return append(slices.Clone(body), 'x')
			},
			want: "has size",
		},
	}
	for _, test := range tests {
		test := test
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()
			options, expectations := publicationFetchFixture(t)
			assets, bodies := remoteAssetsForExpectations(t, expectations)
			var target RemoteReleaseAsset
			for _, asset := range assets {
				if asset.Name == ociManifestName {
					target = asset
					break
				}
			}
			bodies[target.ID] = test.mutate(bodies[target.ID])
			client := &fakeReleaseAssetClient{
				pages:  map[int][]RemoteReleaseAsset{1: assets},
				bodies: bodies,
			}

			_, err := FetchReleaseAssets(context.Background(), options, client)
			if err == nil || !strings.Contains(err.Error(), test.want) {
				t.Fatalf("FetchReleaseAssets() error = %v, want %q", err, test.want)
			}
			assertPathAbsent(t, options.OutputDirectory)
		})
	}
}

func TestFetchReleaseAssetsRejectsExistingAndSymlinkOutputsWithoutDownloading(t *testing.T) {
	t.Parallel()
	for _, kind := range []string{"directory", "symlink"} {
		kind := kind
		t.Run(kind, func(t *testing.T) {
			t.Parallel()
			options, expectations := publicationFetchFixture(t)
			if kind == "directory" {
				if err := os.Mkdir(options.OutputDirectory, 0o700); err != nil {
					t.Fatal(err)
				}
			} else {
				target := t.TempDir()
				if err := os.Symlink(target, options.OutputDirectory); err != nil {
					t.Fatal(err)
				}
			}
			assets, bodies := remoteAssetsForExpectations(t, expectations)
			client := &fakeReleaseAssetClient{
				pages:  map[int][]RemoteReleaseAsset{1: assets},
				bodies: bodies,
			}

			_, err := FetchReleaseAssets(context.Background(), options, client)
			if err == nil || !strings.Contains(err.Error(), "already exists") {
				t.Fatalf("FetchReleaseAssets() error = %v, want existing output rejection", err)
			}
			if len(client.downloadCalls) != 0 {
				t.Fatalf("download calls = %v, want none", client.downloadCalls)
			}
		})
	}
}

func TestFetchReleaseAssetsRejectsExpectedAssetMutationDuringDownload(t *testing.T) {
	t.Parallel()
	options, expectations := publicationFetchFixture(t)
	assets, bodies := remoteAssetsForExpectations(t, expectations)
	client := &fakeReleaseAssetClient{
		pages:  map[int][]RemoteReleaseAsset{1: assets},
		bodies: bodies,
		beforeDownload: func() {
			writeAsset(t, options.ExpectedAssets, ociManifestName, `[]`)
		},
	}

	_, err := FetchReleaseAssets(context.Background(), options, client)
	if err == nil || !strings.Contains(err.Error(), "changed") {
		t.Fatalf("FetchReleaseAssets() error = %v, want expected-local mutation rejection", err)
	}
	assertPathAbsent(t, options.OutputDirectory)
}

func TestDecodeReleaseAssetPageRequiresExactNumericMetadata(t *testing.T) {
	t.Parallel()
	valid := `[{"id":7,"name":"book.pdf","size":4,"state":"uploaded"}]`
	assets, err := decodeReleaseAssetPage([]byte(valid))
	if err != nil || len(assets) != 1 || assets[0].Size != 4 {
		t.Fatalf("decodeReleaseAssetPage(valid) = %+v, %v", assets, err)
	}
	for _, test := range []struct {
		name string
		body string
		want string
	}{
		{name: "string size", body: `[{"id":7,"name":"book.pdf","size":"4","state":"uploaded"}]`, want: "cannot unmarshal"},
		{name: "fractional size", body: `[{"id":7,"name":"book.pdf","size":4.5,"state":"uploaded"}]`, want: "cannot unmarshal"},
		{name: "missing size", body: `[{"id":7,"name":"book.pdf","state":"uploaded"}]`, want: "missing a required field"},
		{name: "unknown field", body: `[{"id":7,"name":"book.pdf","size":4,"state":"uploaded","extra":true}]`, want: "unknown field"},
		{name: "trailing JSON", body: valid + ` {}`, want: "trailing data"},
	} {
		test := test
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()
			_, err := decodeReleaseAssetPage([]byte(test.body))
			if err == nil || !strings.Contains(err.Error(), test.want) {
				t.Fatalf("decodeReleaseAssetPage() error = %v, want %q", err, test.want)
			}
		})
	}
}

func sourceFetchFixture(t *testing.T, assetCount int) (FetchAssetsOptions, map[string]expectedRemoteAsset) {
	t.Helper()
	root := t.TempDir()
	names := make([]string, 0, assetCount)
	for index := range assetCount {
		name := fmt.Sprintf("asset-%03d.bin", index)
		writeAsset(t, root, name, fmt.Sprintf("body-%03d", index))
		names = append(names, name)
	}
	writeChecksums(t, root, names)
	options := FetchAssetsOptions{
		Repository:      testReleaseRepository,
		ReleaseID:       42,
		ExpectedAssets:  root,
		Phase:           SourceAssets,
		OutputDirectory: filepath.Join(t.TempDir(), "download"),
		ReleaseTag:      testReleaseTag,
		ReleaseCommit:   testReleaseCommit,
	}
	_, expectations, err := buildRemoteAssetExpectations(options)
	if err != nil {
		t.Fatalf("buildRemoteAssetExpectations() error = %v", err)
	}
	return options, expectations
}

func publicationFetchFixture(t *testing.T) (FetchAssetsOptions, map[string]expectedRemoteAsset) {
	t.Helper()
	root := t.TempDir()
	writeAsset(t, root, ociManifestName, `{}`)
	writeAsset(t, root, checksumBundleName, `{}`)
	writeChecksums(t, root, []string{ociManifestName})
	options := FetchAssetsOptions{
		Repository:      testReleaseRepository,
		ReleaseID:       42,
		ExpectedAssets:  root,
		Phase:           PublicationAssets,
		OutputDirectory: filepath.Join(t.TempDir(), "download"),
	}
	_, expectations, err := buildRemoteAssetExpectations(options)
	if err != nil {
		t.Fatalf("buildRemoteAssetExpectations() error = %v", err)
	}
	return options, expectations
}

func remoteAssetsForExpectations(
	t *testing.T,
	expectations map[string]expectedRemoteAsset,
) ([]RemoteReleaseAsset, map[int64][]byte) {
	t.Helper()
	names := make([]string, 0, len(expectations))
	for name := range expectations {
		names = append(names, name)
	}
	slices.Sort(names)
	assets := make([]RemoteReleaseAsset, 0, len(names))
	bodies := make(map[int64][]byte, len(names))
	for index, name := range names {
		expected := expectations[name]
		id := int64(index + 1)
		asset := RemoteReleaseAsset{ID: id, Name: name, Size: expected.size, State: "uploaded"}
		assets = append(assets, asset)
		if expected.digest != "" {
			body, err := os.ReadFile(expected.localPath)
			if err != nil {
				t.Fatal(err)
			}
			bodies[id] = body
		} else {
			bodies[id] = []byte(strings.Repeat("x", int(expected.size)))
		}
	}
	return assets, bodies
}

func assertFetchFailureBeforeBody(
	t *testing.T,
	output string,
	client *fakeReleaseAssetClient,
	err error,
	want string,
) {
	t.Helper()
	if err == nil || !strings.Contains(err.Error(), want) {
		t.Fatalf("FetchReleaseAssets() error = %v, want %q", err, want)
	}
	if len(client.downloadCalls) != 0 {
		t.Fatalf("download calls = %v, want none", client.downloadCalls)
	}
	assertPathAbsent(t, output)
}

func assertPathAbsent(t *testing.T, path string) {
	t.Helper()
	if _, err := os.Lstat(path); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("Lstat(%q) error = %v, want path absent", path, err)
	}
}
