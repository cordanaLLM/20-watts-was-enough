package releasecheck

import (
	"crypto/sha256"
	"fmt"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"
)

func TestValidateAssetInventoryAcceptsClosedSourceAssets(t *testing.T) {
	t.Parallel()
	root := t.TempDir()
	writeAsset(t, root, "artifact.tar.zst", "artifact")
	writeAsset(t, root, "book.pdf", "book")
	writeChecksums(t, root, []string{"artifact.tar.zst", "book.pdf"})

	got, err := ValidateAssetInventory(root, SourceAssets)
	if err != nil {
		t.Fatalf("ValidateAssetInventory() error = %v", err)
	}
	want := []string{"SHA256SUMS", "artifact.tar.zst", "book.pdf"}
	if !slices.Equal(got, want) {
		t.Fatalf("ValidateAssetInventory() = %v, want %v", got, want)
	}
}

func TestValidateAssetInventoryAcceptsClosedPublicationAssets(t *testing.T) {
	t.Parallel()
	root := t.TempDir()
	writeAsset(t, root, "book.pdf", "book")
	writeAsset(t, root, "oci-images.json", `{}`)
	writeAsset(t, root, checksumBundleName, `{}`)
	writeChecksums(t, root, []string{"book.pdf", "oci-images.json"})

	got, err := ValidateAssetInventory(root, PublicationAssets)
	if err != nil {
		t.Fatalf("ValidateAssetInventory() error = %v", err)
	}
	want := []string{"SHA256SUMS", checksumBundleName, "book.pdf", "oci-images.json"}
	if !slices.Equal(got, want) {
		t.Fatalf("ValidateAssetInventory() = %v, want %v", got, want)
	}
}

func TestPublicationInventoryRequiresABoundedDetachedChecksumBundle(t *testing.T) {
	for _, size := range []int{-1, 0, 1, maximumChecksumBundleBytes, maximumChecksumBundleBytes + 1} {
		t.Run(fmt.Sprint(size), func(t *testing.T) {
			root := t.TempDir()
			writeAsset(t, root, ociManifestName, `{}`)
			writeChecksums(t, root, []string{ociManifestName})
			if size >= 0 {
				writeAsset(t, root, checksumBundleName, strings.Repeat("x", size))
			}
			_, err := ValidateAssetInventory(root, PublicationAssets)
			valid := size > 0 && size <= maximumChecksumBundleBytes
			if (err == nil) != valid {
				t.Fatalf("size %d: err=%v, valid=%t", size, err, valid)
			}
		})
	}
}

func TestChecksumManifestRejectsItsDetachedSignature(t *testing.T) {
	root := t.TempDir()
	writeAsset(t, root, checksumBundleName, `{}`)
	writeChecksums(t, root, []string{checksumBundleName})
	_, err := ValidateAssetInventory(root, SourceAssets)
	if err == nil || !strings.Contains(err.Error(), "must not list its detached signature") {
		t.Fatalf("err=%v, want detached signature rejection", err)
	}
}

func TestValidateAssetInventoryRejectsTamperingAndOpenInventories(t *testing.T) {
	t.Parallel()
	tests := []struct {
		name       string
		mutate     func(*testing.T, string)
		want       string
		phase      InventoryPhase
		assetNames []string
	}{
		{
			name: "tampered asset",
			mutate: func(t *testing.T, root string) {
				writeAsset(t, root, "book.pdf", "changed")
			},
			want:       "does not match SHA256SUMS",
			phase:      SourceAssets,
			assetNames: []string{"book.pdf"},
		},
		{
			name: "unexpected asset",
			mutate: func(t *testing.T, root string) {
				writeAsset(t, root, "unlisted.txt", "extra")
			},
			want:       "do not match SHA256SUMS",
			phase:      SourceAssets,
			assetNames: []string{"book.pdf"},
		},
		{
			name: "asset symlink",
			mutate: func(t *testing.T, root string) {
				if err := os.Rename(filepath.Join(root, "book.pdf"), filepath.Join(root, "target.pdf")); err != nil {
					t.Fatal(err)
				}
				if err := os.Symlink("target.pdf", filepath.Join(root, "book.pdf")); err != nil {
					t.Fatal(err)
				}
			},
			want:       "contains an unsafe entry",
			phase:      SourceAssets,
			assetNames: []string{"book.pdf"},
		},
		{
			name:       "source predeclares OCI identity",
			mutate:     func(*testing.T, string) {},
			want:       "must not predeclare",
			phase:      SourceAssets,
			assetNames: []string{"book.pdf", "oci-images.json"},
		},
		{
			name:       "publication omits OCI identity",
			mutate:     func(*testing.T, string) {},
			want:       "must include oci-images.json",
			phase:      PublicationAssets,
			assetNames: []string{"book.pdf"},
		},
	}
	for _, test := range tests {
		test := test
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()
			root := t.TempDir()
			for _, name := range test.assetNames {
				writeAsset(t, root, name, name)
			}
			writeChecksums(t, root, test.assetNames)
			test.mutate(t, root)
			_, err := ValidateAssetInventory(root, test.phase)
			if err == nil || !strings.Contains(err.Error(), test.want) {
				t.Fatalf("ValidateAssetInventory() error = %v, want %q", err, test.want)
			}
		})
	}
}

func TestValidateAssetInventoryRejectsMalformedChecksumAuthority(t *testing.T) {
	t.Parallel()
	tests := []struct {
		name string
		body string
		want string
	}{
		{
			name: "duplicate",
			body: strings.Repeat("a", 64) + "  book.pdf\n" + strings.Repeat("b", 64) + "  book.pdf\n",
			want: "duplicate SHA256SUMS asset name",
		},
		{
			name: "unsorted",
			body: strings.Repeat("a", 64) + "  z.pdf\n" + strings.Repeat("b", 64) + "  a.pdf\n",
			want: "not sorted",
		},
		{
			name: "path traversal",
			body: strings.Repeat("a", 64) + "  ../book.pdf\n",
			want: "malformed or unsafe",
		},
		{
			name: "self reference",
			body: strings.Repeat("a", 64) + "  SHA256SUMS\n",
			want: "must not list itself",
		},
	}
	for _, test := range tests {
		test := test
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()
			root := t.TempDir()
			if err := os.WriteFile(filepath.Join(root, checksumManifestName), []byte(test.body), 0o600); err != nil {
				t.Fatal(err)
			}
			_, err := ValidateAssetInventory(root, SourceAssets)
			if err == nil || !strings.Contains(err.Error(), test.want) {
				t.Fatalf("ValidateAssetInventory() error = %v, want %q", err, test.want)
			}
		})
	}
}

func TestComparePublicationManifestAcceptsOneBoundOCIIdentity(t *testing.T) {
	t.Parallel()
	sourceRoot := t.TempDir()
	publicationRoot := t.TempDir()
	bookDigest := fmt.Sprintf("%x", sha256.Sum256([]byte("book")))
	ociBody := []byte(`{"schema":1}`)
	ociDigest := fmt.Sprintf("%x", sha256.Sum256(ociBody))
	writeTextFile(t, filepath.Join(sourceRoot, "SHA256SUMS"), bookDigest+"  book.pdf\n")
	writeTextFile(t, filepath.Join(publicationRoot, "SHA256SUMS"),
		bookDigest+"  book.pdf\n"+ociDigest+"  oci-images.json\n")
	if err := os.WriteFile(filepath.Join(publicationRoot, "oci-images.json"), ociBody, 0o600); err != nil {
		t.Fatal(err)
	}

	if err := ComparePublicationManifest(
		filepath.Join(sourceRoot, "SHA256SUMS"),
		filepath.Join(publicationRoot, "SHA256SUMS"),
		filepath.Join(publicationRoot, "oci-images.json"),
	); err != nil {
		t.Fatalf("ComparePublicationManifest() error = %v", err)
	}
}

func TestComparePublicationManifestRejectsAuthorityDrift(t *testing.T) {
	t.Parallel()
	bookDigest := fmt.Sprintf("%x", sha256.Sum256([]byte("book")))
	changedDigest := fmt.Sprintf("%x", sha256.Sum256([]byte("changed")))
	ociDigest := fmt.Sprintf("%x", sha256.Sum256([]byte(`{}`)))
	tests := []struct {
		name            string
		publicationBody string
		ociBody         string
		want            string
	}{
		{
			name:            "source digest changed",
			publicationBody: changedDigest + "  book.pdf\n" + ociDigest + "  oci-images.json\n",
			ociBody:         `{}`,
			want:            "changes verified source asset book.pdf",
		},
		{
			name: "extra identity",
			publicationBody: bookDigest + "  book.pdf\n" +
				strings.Repeat("a", 64) + "  extra.txt\n" + ociDigest + "  oci-images.json\n",
			ociBody: `{}`,
			want:    "add exactly one",
		},
		{
			name:            "OCI bytes changed",
			publicationBody: bookDigest + "  book.pdf\n" + ociDigest + "  oci-images.json\n",
			ociBody:         `{"changed":true}`,
			want:            "does not match",
		},
	}
	for _, test := range tests {
		test := test
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()
			sourceRoot := t.TempDir()
			publicationRoot := t.TempDir()
			writeTextFile(t, filepath.Join(sourceRoot, "SHA256SUMS"), bookDigest+"  book.pdf\n")
			writeTextFile(t, filepath.Join(publicationRoot, "SHA256SUMS"), test.publicationBody)
			writeTextFile(t, filepath.Join(publicationRoot, "oci-images.json"), test.ociBody)
			err := ComparePublicationManifest(
				filepath.Join(sourceRoot, "SHA256SUMS"),
				filepath.Join(publicationRoot, "SHA256SUMS"),
				filepath.Join(publicationRoot, "oci-images.json"),
			)
			if err == nil || !strings.Contains(err.Error(), test.want) {
				t.Fatalf("ComparePublicationManifest() error = %v, want %q", err, test.want)
			}
		})
	}
}

func TestChecksumBoundsIncludeSHA256SUMSAndReserveTheFinalOCIIdentity(t *testing.T) {
	t.Parallel()
	tooManySourceLines := make([]string, 0, maximumReleaseAttachments-1)
	for index := range maximumReleaseAttachments - 1 {
		tooManySourceLines = append(tooManySourceLines, fmt.Sprintf("%s  asset-%03d", strings.Repeat("a", 64), index))
	}
	_, _, err := parseChecksumManifest([]byte(strings.Join(tooManySourceLines, "\n")+"\n"), SourceAssets)
	if err == nil || !strings.Contains(err.Error(), "bounded release asset count") {
		t.Fatalf("source parse error = %v, want reserved OCI slot rejection", err)
	}

	maximumSourceLines := slices.Clone(tooManySourceLines[:maximumReleaseAttachments-3])
	if _, _, err := parseChecksumManifest(
		[]byte(strings.Join(maximumSourceLines, "\n")+"\n"),
		SourceAssets,
	); err != nil {
		t.Fatalf("maximum source parse error = %v", err)
	}
	// SHA256SUMS, its signature bundle and oci-images.json each hold one of
	// the attachment slots, so one more source line must not fit.
	oneOverSourceLines := slices.Clone(tooManySourceLines[:maximumReleaseAttachments-2])
	if _, _, err := parseChecksumManifest(
		[]byte(strings.Join(oneOverSourceLines, "\n")+"\n"),
		SourceAssets,
	); err == nil || !strings.Contains(err.Error(), "bounded release asset count") {
		t.Fatalf("source parse error = %v, want signature-bundle slot rejection", err)
	}
	oneOverPublicationLines := append(slices.Clone(oneOverSourceLines), strings.Repeat("b", 64)+"  oci-images.json")
	if _, _, err := parseChecksumManifest(
		[]byte(strings.Join(oneOverPublicationLines, "\n")+"\n"),
		PublicationAssets,
	); err == nil || !strings.Contains(err.Error(), "bounded release asset count") {
		t.Fatalf("publication parse error = %v, want signature-bundle slot rejection", err)
	}

	publicationLines := slices.Clone(maximumSourceLines)
	publicationLines = append(publicationLines, strings.Repeat("b", 64)+"  oci-images.json")
	if _, _, err := parseChecksumManifest(
		[]byte(strings.Join(publicationLines, "\n")+"\n"),
		PublicationAssets,
	); err != nil {
		t.Fatalf("publication parse error = %v", err)
	}

	tooManyPublicationLines := slices.Clone(tooManySourceLines)
	tooManyPublicationLines = append(tooManyPublicationLines, strings.Repeat("b", 64)+"  oci-images.json")
	if _, _, err := parseChecksumManifest(
		[]byte(strings.Join(tooManyPublicationLines, "\n")+"\n"),
		PublicationAssets,
	); err == nil || !strings.Contains(err.Error(), "bounded release asset count") {
		t.Fatalf("publication parse error = %v, want total attachment bound rejection", err)
	}
}

func TestAssetDirectoryEnforcesTheTotalAttachmentBound(t *testing.T) {
	t.Parallel()
	root := t.TempDir()
	for index := range maximumReleaseAttachments {
		writeAsset(t, root, fmt.Sprintf("asset-%03d", index), "asset")
	}
	if snapshot, err := snapshotAssetDirectory(root); err != nil || len(snapshot) != maximumReleaseAttachments {
		t.Fatalf("snapshotAssetDirectory() = %d entries, %v, want exact bound", len(snapshot), err)
	}
	writeAsset(t, root, fmt.Sprintf("asset-%03d", maximumReleaseAttachments), "asset")
	_, err := snapshotAssetDirectory(root)
	if err == nil || !strings.Contains(err.Error(), "bounded entry count") {
		t.Fatalf("snapshotAssetDirectory() error = %v, want total attachment bound rejection", err)
	}
}

func writeAsset(t *testing.T, root, name, body string) {
	t.Helper()
	if err := os.WriteFile(filepath.Join(root, name), []byte(body), 0o600); err != nil {
		t.Fatal(err)
	}
}

func writeTextFile(t *testing.T, path, body string) {
	t.Helper()
	if err := os.WriteFile(path, []byte(body), 0o600); err != nil {
		t.Fatal(err)
	}
}

func writeChecksums(t *testing.T, root string, names []string) {
	t.Helper()
	sortedNames := slices.Clone(names)
	slices.Sort(sortedNames)
	lines := make([]string, 0, len(sortedNames))
	for _, name := range sortedNames {
		body, err := os.ReadFile(filepath.Join(root, name))
		if err != nil {
			t.Fatal(err)
		}
		lines = append(lines, fmt.Sprintf("%x  %s", sha256.Sum256(body), name))
	}
	if err := os.WriteFile(filepath.Join(root, checksumManifestName), []byte(strings.Join(lines, "\n")+"\n"), 0o600); err != nil {
		t.Fatal(err)
	}
}
