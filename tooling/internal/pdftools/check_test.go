package pdftools

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestCheckAcceptsCommittedAuthority(t *testing.T) {
	t.Parallel()
	result, err := Check(filepath.Clean(filepath.Join("..", "..", "..")))
	if err != nil {
		t.Fatalf("Check() error = %v", err)
	}
	if result.Packages != 45 || result.Notices != 5 || result.RetainedBytes != 33_667_496 {
		t.Fatalf("Check() result = %+v", result)
	}
	if result.LockSHA256 != "c33b1eeeaf73a4c7ce69fa507be7620ef623c4b067e5f2122a8acf8530678404" ||
		!rawDigestPattern.MatchString(result.ContractSHA256) {
		t.Fatalf("Check() digests = %+v", result)
	}
}

func TestCheckRejectsTamperedOrMissingAuthorityFiles(t *testing.T) {
	t.Parallel()
	tests := []struct {
		name string
		path string
		edit func(t *testing.T, path string)
		want string
	}{
		{name: "config", path: "tooling/pdf-tools/apko.yaml", edit: appendText, want: "config digest"},
		{name: "lock", path: "tooling/pdf-tools/apko.lock.json", edit: appendText, want: "lock digest"},
		{name: "notice", path: "tooling/pdf-tools/notices/COPYING", edit: appendText, want: "notice"},
		{name: "recipe", path: "tooling/pdf-tools/upstream/wolfi-poppler.yaml", edit: appendText, want: "recipe"},
		{name: "recipe licence", path: "tooling/pdf-tools/upstream/wolfi-LICENSE", edit: appendText, want: "recipe licence"},
		{name: "missing notice", path: "tooling/pdf-tools/notices/AUTHORS", edit: removeFile, want: "Poppler notice"},
		{name: "APK retention", path: "tooling/pdf-tools/apk-retention.json", edit: removeDeclaredLicence, want: "retention manifest digest"},
		{name: "BuildKit authority", path: "tooling/pdf-renderer/lock.json", edit: changeRendererBuildxRevision, want: "BuildKit authority digest"},
	}
	for _, test := range tests {
		test := test
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()
			root := copyAuthority(t)
			test.edit(t, filepath.Join(root, filepath.FromSlash(test.path)))
			_, err := Check(root)
			if err == nil || !strings.Contains(err.Error(), test.want) {
				t.Fatalf("Check() error = %v, want %q", err, test.want)
			}
		})
	}
}

func TestValidateContractClosesPackageAndDeliveryCounts(t *testing.T) {
	t.Parallel()
	root := filepath.Clean(filepath.Join("..", "..", ".."))
	contract := readCanonical[Contract](t, filepath.Join(root, contractRelativePath), 8, "PDF-tools contract")

	contract.Apko.LockedPackageCount = 44
	if err := validateContract(contract); err == nil || !strings.Contains(err.Error(), "locked package count") {
		t.Fatalf("validateContract() error = %v, want exact locked-package count rejection", err)
	}

	contract.Apko.LockedPackageCount = 45
	contract.SourceDelivery.APKCount = 44
	if err := validateContract(contract); err == nil || !strings.Contains(err.Error(), "does not match the locked package count") {
		t.Fatalf("validateContract() error = %v, want delivery/lock count rejection", err)
	}

	contract.SourceDelivery.APKCount = 45
	contract.SourceDelivery.Contents[0] = "44 exact APK files"
	if err := validateContract(contract); err == nil || !strings.Contains(err.Error(), "declared APK count") {
		t.Fatalf("validateContract() error = %v, want inventory wording rejection", err)
	}

	contract.SourceDelivery.Contents[0] = "45 exact APK files"
	contract.SourceDelivery.BundleLayout.SPDX = "../sbom.spdx.json"
	if err := validateContract(contract); err == nil || !strings.Contains(err.Error(), "bundle layout") {
		t.Fatalf("validateContract() error = %v, want bundle-layout rejection", err)
	}

	contract.SourceDelivery.BundleLayout.SPDX = "sbom/sbom-x86_64.spdx.json"
	contract.Limits.Packages = 44
	if err := validateContract(contract); err == nil || !strings.Contains(err.Error(), "resource limits") {
		t.Fatalf("validateContract() error = %v, want package-bound rejection", err)
	}
}

func TestValidateContractBindsWolfiRecipeLicenseIdentity(t *testing.T) {
	t.Parallel()
	root := filepath.Clean(filepath.Join("..", "..", ".."))
	tests := []struct {
		name   string
		mutate func(*UpstreamLicense)
	}{
		{name: "locator", mutate: func(value *UpstreamLicense) { value.URL += "?mutable=true" }},
		{name: "revision", mutate: func(value *UpstreamLicense) { value.Revision = strings.Repeat("0", 40) }},
		{name: "digest", mutate: func(value *UpstreamLicense) { value.SHA256 = strings.Repeat("f", 63) }},
		{name: "size bound", mutate: func(value *UpstreamLicense) { value.Size = 64*1024 + 1 }},
		{name: "snapshot", mutate: func(value *UpstreamLicense) { value.Snapshot = "../wolfi-LICENSE" }},
	}
	for _, test := range tests {
		test := test
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()
			contract := readCanonical[Contract](t, filepath.Join(root, contractRelativePath), 8, "PDF-tools contract")
			test.mutate(&contract.Upstream.WolfiRecipe.License)
			if err := validateContract(contract); err == nil || !strings.Contains(err.Error(), "recipe licence") {
				t.Fatalf("validateContract() error = %v, want recipe-licence identity rejection", err)
			}
		})
	}
}

func TestCheckRejectsSemanticMutationsAfterOuterDigestUpdate(t *testing.T) {
	t.Parallel()
	tests := []struct {
		name   string
		mutate func(t *testing.T, root string, contract *Contract)
		want   string
	}{
		{
			name: "lock package count",
			mutate: func(t *testing.T, root string, contract *Contract) {
				path := filepath.Join(root, "tooling/pdf-tools/apko.lock.json")
				lock := readCanonical[apkoLock](t, path, 8, "PDF-tools apko lock")
				lock.Contents.Packages = lock.Contents.Packages[:len(lock.Contents.Packages)-1]
				contract.Apko.LockSHA256 = rawDigest(writeCanonical(t, path, lock))
			},
			want: "lock package count",
		},
		{
			name: "retention count closure",
			mutate: func(t *testing.T, root string, contract *Contract) {
				path := filepath.Join(root, "tooling/pdf-tools/apk-retention.json")
				manifest := readCanonical[retentionManifest](t, path, 6, "PDF-tools APK retention manifest")
				removed := manifest.Packages[len(manifest.Packages)-1]
				manifest.Packages = manifest.Packages[:len(manifest.Packages)-1]
				manifest.PackageCount--
				manifest.TotalBytes -= removed.Size
				contract.SourceDelivery.APKManifestSHA256 = rawDigest(writeCanonical(t, path, manifest))
			},
			want: "package count does not match the lock",
		},
		{
			name: "retention order",
			mutate: func(t *testing.T, root string, contract *Contract) {
				path := filepath.Join(root, "tooling/pdf-tools/apk-retention.json")
				manifest := readCanonical[retentionManifest](t, path, 6, "PDF-tools APK retention manifest")
				manifest.Packages[0], manifest.Packages[1] = manifest.Packages[1], manifest.Packages[0]
				contract.SourceDelivery.APKManifestSHA256 = rawDigest(writeCanonical(t, path, manifest))
			},
			want: "sorted by name",
		},
	}
	for _, test := range tests {
		test := test
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()
			root := copyAuthority(t)
			contractPath := filepath.Join(root, contractRelativePath)
			contract := readCanonical[Contract](t, contractPath, 8, "PDF-tools contract")
			test.mutate(t, root, &contract)
			writeCanonical(t, contractPath, contract)
			_, err := Check(root)
			if err == nil || !strings.Contains(err.Error(), test.want) {
				t.Fatalf("Check() error = %v, want %q", err, test.want)
			}
		})
	}
}

func TestReadRelativeRejectsEscapesAndOversizedFiles(t *testing.T) {
	t.Parallel()
	root := t.TempDir()
	if _, err := readRelative(root, "../escape", "test authority", 4); err == nil || !strings.Contains(err.Error(), "repository-relative") {
		t.Fatalf("readRelative() escape error = %v", err)
	}
	path := filepath.Join(root, "bounded")
	if err := os.WriteFile(path, []byte("12345"), 0o644); err != nil {
		t.Fatal(err)
	}
	if _, err := readRelative(root, "bounded", "test authority", 4); err == nil || !strings.Contains(err.Error(), "between 1 and 4 bytes") {
		t.Fatalf("readRelative() bound error = %v", err)
	}
}

func TestCheckRejectsSymlinkedAuthority(t *testing.T) {
	t.Parallel()
	root := copyAuthority(t)
	path := filepath.Join(root, "tooling/pdf-tools/notices/AUTHORS")
	body, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.Remove(path); err != nil {
		t.Fatal(err)
	}
	target := filepath.Join(root, "authors-target")
	if err := os.WriteFile(target, body, 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(target, path); err != nil {
		t.Fatal(err)
	}
	if _, err := Check(root); err == nil || !strings.Contains(err.Error(), "symlink") {
		t.Fatalf("Check() error = %v, want symlink rejection", err)
	}
}

func TestDecodeCanonicalRejectsAmbiguousAndUnknownContractJSON(t *testing.T) {
	t.Parallel()
	for name, body := range map[string]string{
		"duplicate": `{"schema":1,"schema":1}`,
		"unknown":   `{"unknown":true}`,
		"trailing":  `{}` + "\n{}",
	} {
		name, body := name, body
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			if _, err := decodeCanonical[Contract]([]byte(body), 8, "test contract"); err == nil {
				t.Fatalf("decodeCanonical() accepted %s", name)
			}
		})
	}
}

func TestRetainedPackageMustCloseLockRanges(t *testing.T) {
	t.Parallel()
	locked := lockPackage{
		Name: "poppler", URL: "https://packages.wolfi.dev/os/x86_64/poppler-26.08.0-r0.apk",
		Version: "26.08.0-r0", Architecture: "x86_64",
		Data: rangeChecksum{Range: "bytes=10-19", Checksum: "sha256-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="},
	}
	retained := retainedPackage{
		Name: "poppler", Version: locked.Version, Architecture: locked.Architecture, URL: locked.URL,
		Filename: "poppler-26.08.0-r0.apk", Size: 21, SHA256: strings.Repeat("a", 64), LicenseDeclared: "GPL-2.0-or-later",
	}
	if err := validateRetainedPackage(retained, locked); err == nil || !strings.Contains(err.Error(), "close") {
		t.Fatalf("validateRetainedPackage() error = %v, want range closure rejection", err)
	}
	retained.Size = 20
	retained.LicenseDeclared = "NOASSERTION"
	if err := validateRetainedPackage(retained, locked); err == nil || !strings.Contains(err.Error(), "declared licence") {
		t.Fatalf("validateRetainedPackage() error = %v, want declared-licence rejection", err)
	}
}

func copyAuthority(t *testing.T) string {
	t.Helper()
	source := filepath.Clean(filepath.Join("..", "..", ".."))
	root := t.TempDir()
	files := []string{
		"tooling/pdf-renderer/lock.json",
		"tooling/pdf-tools/apko.lock.json",
		"tooling/pdf-tools/apko.yaml",
		"tooling/pdf-tools/apk-retention.json",
		"tooling/pdf-tools/contract.json",
		"tooling/pdf-tools/notices/AUTHORS",
		"tooling/pdf-tools/notices/COPYING",
		"tooling/pdf-tools/notices/COPYING3",
		"tooling/pdf-tools/notices/README-XPDF",
		"tooling/pdf-tools/notices/README.contributors",
		"tooling/pdf-tools/upstream/wolfi-LICENSE",
		"tooling/pdf-tools/upstream/wolfi-poppler.yaml",
	}
	for _, relative := range files {
		body, err := os.ReadFile(filepath.Join(source, filepath.FromSlash(relative)))
		if err != nil {
			t.Fatal(err)
		}
		destination := filepath.Join(root, filepath.FromSlash(relative))
		if err := os.MkdirAll(filepath.Dir(destination), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(destination, body, 0o644); err != nil {
			t.Fatal(err)
		}
	}
	return root
}

func readCanonical[T any](t *testing.T, path string, depth int, label string) T {
	t.Helper()
	body, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	value, err := decodeCanonical[T](body, depth, label)
	if err != nil {
		t.Fatal(err)
	}
	return value
}

func writeCanonical[T any](t *testing.T, path string, value T) []byte {
	t.Helper()
	body, err := json.MarshalIndent(value, "", "  ")
	if err != nil {
		t.Fatal(err)
	}
	body = append(body, '\n')
	if err := os.WriteFile(path, body, 0o644); err != nil {
		t.Fatal(err)
	}
	return body
}

func appendText(t *testing.T, path string) {
	t.Helper()
	file, err := os.OpenFile(path, os.O_APPEND|os.O_WRONLY, 0)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := file.WriteString("tampered\n"); err != nil {
		_ = file.Close()
		t.Fatal(err)
	}
	if err := file.Close(); err != nil {
		t.Fatal(err)
	}
}

func removeFile(t *testing.T, path string) {
	t.Helper()
	if err := os.Remove(path); err != nil {
		t.Fatal(err)
	}
}

func removeDeclaredLicence(t *testing.T, path string) {
	t.Helper()
	body, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	body = []byte(strings.Replace(string(body), `"license_declared": "MPL-2.0 AND MIT"`, `"license_declared": "NOASSERTION"`, 1))
	if err := os.WriteFile(path, body, 0o644); err != nil {
		t.Fatal(err)
	}
}

func changeRendererBuildxRevision(t *testing.T, path string) {
	t.Helper()
	body, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	body = []byte(strings.Replace(
		string(body),
		`"buildx_revision": "2d379c0c3f22da0d2759d132a0ec81ca949098f0"`,
		`"buildx_revision": "3d379c0c3f22da0d2759d132a0ec81ca949098f0"`,
		1,
	))
	if err := os.WriteFile(path, body, 0o644); err != nil {
		t.Fatal(err)
	}
}
