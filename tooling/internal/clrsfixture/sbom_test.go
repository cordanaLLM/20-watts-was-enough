package clrsfixture

import (
	"bytes"
	"cmp"
	"context"
	"errors"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
)

func TestGeneratorSBOMBundleDeterministicReadOnly(t *testing.T) {
	fixture := newSBOMTestFixture(t)
	fixture.write(t)
	before := readSBOMTestFiles(t, fixture.options.BundleRoot)
	first, err := CheckGeneratorSBOMBundle(context.Background(), fixture.options)
	if err != nil {
		t.Fatal(err)
	}
	second, err := CheckGeneratorSBOMBundle(context.Background(), fixture.options)
	if err != nil || !reflect.DeepEqual(first, second) {
		t.Fatalf("non-deterministic report: %v", err)
	}
	if first.State != "bundle-consistent-unadmitted" || first.Authority != ResultAuthority ||
		first.StatementSubject != "null" || first.ExecutionAuthenticated || first.ImageAdmitted || first.LicensesApproved ||
		len(first.LockedPackages) != 62 || len(first.ExtraTopLevelPython) != 0 ||
		first.PackageCount != 64 || first.OtherPackageCount != 2 || len(first.Files) != 5 {
		t.Fatalf("incorrect scope/result: %+v", first)
	}
	a, err := MarshalGeneratorSBOMReport(first)
	if err != nil {
		t.Fatal(err)
	}
	b, err := MarshalGeneratorSBOMReport(second)
	if err != nil || !bytes.Equal(a, b) || len(a) > sbomMaximumReportBytes {
		t.Fatalf("non-deterministic or unbounded JSON: %v", err)
	}
	if !reflect.DeepEqual(before, readSBOMTestFiles(t, fixture.options.BundleRoot)) {
		t.Fatal("read-only checker changed a supplied artifact")
	}
}

func TestGeneratorSBOMBundleReclosedSemanticFailures(t *testing.T) {
	cases := map[string]func(*sbomTestFixture){
		"vendor cannot replace top level": func(f *sbomTestFixture) {
			f.packages[0]["sourceInfo"] = strings.Replace(f.packages[0]["sourceInfo"].(string), "/site-packages/", "/site-packages/setuptools/_vendor/", 1)
		},
		"embedded cannot replace top level": func(f *sbomTestFixture) {
			f.packages[0]["sourceInfo"] = "acquired package info from embedded SPDX document"
		},
		"wrong version":           func(f *sbomTestFixture) { f.packages[0]["versionInfo"] = "0.0.0" },
		"duplicate SPDX identity": func(f *sbomTestFixture) { f.packages[1]["SPDXID"] = f.packages[0]["SPDXID"] },
		"unbound subject changed": func(f *sbomTestFixture) {
			f.subject = `[{"name":"forged","digest":{"sha256":"` + strings.Repeat("a", 64) + `"}}]`
		},
		"subject missing":            func(f *sbomTestFixture) { f.subject = "" },
		"wrong independent manifest": func(f *sbomTestFixture) { f.binding.ManifestDigest = "sha256:" + strings.Repeat("9", 64) },
		"wrong independent config":   func(f *sbomTestFixture) { f.binding.ConfigDigest = "sha256:" + strings.Repeat("9", 64) },
		"wrong scanner authority":    func(f *sbomTestFixture) { f.binding.ScannerIndex = "sha256:" + strings.Repeat("9", 64) },
		"execution failed":           func(f *sbomTestFixture) { f.execution["State"] = "failed" },
		"execution no cleanup":       func(f *sbomTestFixture) { f.execution["CleanupVerified"] = false },
		"execution no input check":   func(f *sbomTestFixture) { f.execution["InputsRechecked"] = false },
		"execution count":            func(f *sbomTestFixture) { f.execution["PackageCount"] = 1 },
		"execution error":            func(f *sbomTestFixture) { f.execution["error"] = "failure" },
		"execution timestamp":        func(f *sbomTestFixture) { f.execution["Finished"] = "2026-09-01T00:00:00Z" },
		"execution null cleanup":     func(f *sbomTestFixture) { f.execution["CleanupVerified"] = nil },
		"execution alias":            func(f *sbomTestFixture) { f.execution["state"] = f.execution["State"]; delete(f.execution, "State") },
		"execution unknown":          func(f *sbomTestFixture) { f.execution["extra"] = true },
		"wrong loaded scanner":       func(f *sbomTestFixture) { f.execution["LoadedScannerID"] = "sha256:" + strings.Repeat("9", 64) },
	}
	for name, mutate := range cases {
		t.Run(name, func(t *testing.T) {
			fixture := newSBOMTestFixture(t)
			mutate(fixture)
			fixture.write(t) // Recompute every hash link after the malicious edit.
			assertSBOMTestFailure(t, fixture.options)
		})
	}
}

func TestGeneratorSBOMBundleInspectionNullAndIdentityFailures(t *testing.T) {
	for _, field := range []string{"Running", "Paused", "Restarting", "OOMKilled", "Dead", "Error", "ExitCode", "Pid"} {
		t.Run("null "+field, func(t *testing.T) {
			fixture := newSBOMTestFixture(t)
			fixture.execution["After"].(map[string]any)["State"].(map[string]any)[field] = nil
			fixture.write(t)
			assertSBOMTestFailure(t, fixture.options)
		})
	}
	for _, side := range []string{"Before", "After"} {
		for _, field := range []string{"ID", "Name", "Image", "owner", "config-image", "missing-pid", "exit-code"} {
			t.Run(side+" "+field, func(t *testing.T) {
				fixture := newSBOMTestFixture(t)
				inspection := fixture.execution[side].(map[string]any)
				switch field {
				case "owner":
					inspection["Config"].(map[string]any)["Labels"] = map[string]string{"dev.cordana.clrs-sbom-owner": "wrong"}
				case "config-image":
					inspection["Config"].(map[string]any)["Image"] = "wrong"
				case "missing-pid":
					delete(inspection["State"].(map[string]any), "Pid")
				case "exit-code":
					inspection["State"].(map[string]any)["ExitCode"] = 1
				default:
					inspection[field] = "wrong"
				}
				fixture.write(t)
				assertSBOMTestFailure(t, fixture.options)
			})
		}
	}
}

func TestGeneratorSBOMBundlePathAndInventoryFailures(t *testing.T) {
	for _, mutation := range []string{"extra", "missing", "directory", "symlink", "root-symlink", "binding-size", "statement-size"} {
		t.Run(mutation, func(t *testing.T) {
			fixture := newSBOMTestFixture(t)
			fixture.write(t)
			root := fixture.options.BundleRoot
			binding := filepath.Join(root, "supplied-binding.json")
			switch mutation {
			case "extra":
				writeSBOMTestFile(t, root, "extra", []byte("x"))
			case "missing", "directory", "symlink":
				if err := os.Remove(binding); err != nil {
					t.Fatal(err)
				}
				if mutation == "directory" {
					if err := os.Mkdir(binding, 0o700); err != nil {
						t.Fatal(err)
					}
				}
				if mutation == "symlink" {
					if err := os.Symlink("image.spdx.json", binding); err != nil {
						t.Fatal(err)
					}
				}
			case "root-symlink":
				link := filepath.Join(t.TempDir(), "bundle")
				if err := os.Symlink(root, link); err != nil {
					t.Fatal(err)
				}
				fixture.options.BundleRoot = link
			case "binding-size", "statement-size":
				name, size := "supplied-binding.json", int64(sbomMaximumBindingBytes+1)
				if mutation == "statement-size" {
					name, size = "scanner-statement.intoto.json", sbomMaximumBytes+1
				}
				file, err := os.OpenFile(filepath.Join(root, name), os.O_WRONLY, 0)
				if err != nil {
					t.Fatal(err)
				}
				err = file.Truncate(size)
				closeErr := file.Close()
				if err != nil || closeErr != nil {
					t.Fatalf("sparse boundary: %v/%v", err, closeErr)
				}
			}
			assertSBOMTestFailure(t, fixture.options)
		})
	}
}

func TestGeneratorSBOMBundleFinalRecheckAndCancellation(t *testing.T) {
	for _, mutation := range []string{"replace", "same-size-drift", "extra", "authority", "root-replace", "cancel"} {
		t.Run(mutation, func(t *testing.T) {
			fixture := newSBOMTestFixture(t)
			fixture.write(t)
			ctx, cancel := context.WithCancel(context.Background())
			defer cancel()
			report, err := checkGeneratorSBOMBundle(ctx, fixture.options, func() error {
				root := fixture.options.BundleRoot
				file := filepath.Join(root, "image.spdx.json")
				switch mutation {
				case "replace":
					body, err := os.ReadFile(file)
					if err != nil {
						return err
					}
					if err := os.Rename(file, filepath.Join(t.TempDir(), "old")); err != nil {
						return err
					}
					return os.WriteFile(file, body, 0o600)
				case "same-size-drift":
					body, err := os.ReadFile(file)
					if err != nil {
						return err
					}
					body = bytes.Replace(body, []byte("pip"), []byte("zap"), 1)
					return os.WriteFile(file, body, 0o600)
				case "extra":
					return os.WriteFile(filepath.Join(root, "extra"), []byte("x"), 0o600)
				case "authority":
					return os.WriteFile(filepath.Join(fixture.options.RepositoryRoot, trackedGeneratorWheelhousePath), []byte("{}"), 0o600)
				case "root-replace":
					if err := os.Rename(root, root+"-old"); err != nil {
						return err
					}
					return os.Mkdir(root, 0o700)
				case "cancel":
					cancel()
				}
				return nil
			})
			if err == nil || report.State != "incomplete" || len(report.Files)+len(report.LockedPackages) != 0 {
				t.Fatalf("mutation accepted or success leaked: %+v, %v", report, err)
			}
			if mutation == "cancel" && !errors.Is(err, context.Canceled) {
				t.Fatalf("lost cancellation: %v", err)
			}
		})
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	_, err := CheckGeneratorSBOMBundle(ctx, GeneratorSBOMOptions{ExpectedManifestDigest: "sha256:" + strings.Repeat("a", 64), ExpectedConfigDigest: "sha256:" + strings.Repeat("b", 64)})
	if !errors.Is(err, context.Canceled) {
		t.Fatalf("initial cancellation: %v", err)
	}
}

func TestGeneratorSBOMBundleActualRetainedInput(t *testing.T) {
	root := os.Getenv("CLRS_SBOM_BUNDLE")
	if root == "" {
		if RetainedInputsRequired() {
			t.Fatal(RetainedInputsRequiredVariable + "=1 but CLRS_SBOM_BUNDLE is unset")
		}
		t.Skip("set CLRS_SBOM_BUNDLE to a fetched scanner bundle")
	}
	// The expected image digests come from the tracked lock unless set
	// explicitly; either way they are independent of the bundle bytes.
	lock, err := LoadSBOMBundleLock(trackedRepositoryRoot(t))
	if err != nil {
		t.Fatal(err)
	}
	options := GeneratorSBOMOptions{RepositoryRoot: trackedRepositoryRoot(t), BundleRoot: root,
		ExpectedManifestDigest: cmp.Or(os.Getenv("CLRS_SBOM_EXPECTED_MANIFEST"), lock.ImageManifestDigest),
		ExpectedConfigDigest:   cmp.Or(os.Getenv("CLRS_SBOM_EXPECTED_CONFIG"), lock.ImageConfigDigest)}
	report, err := CheckGeneratorSBOMBundle(context.Background(), options)
	if err != nil {
		t.Fatal(err)
	}
	if report.PackageCount != 218 || len(report.LockedPackages) != 62 || len(report.ExtraTopLevelPython) != 0 || report.OtherPackageCount != 156 {
		t.Fatalf("retained observation differs: %+v", report)
	}
	body, err := MarshalGeneratorSBOMReport(report)
	if err != nil {
		t.Fatal(err)
	}
	t.Logf("retained report SHA256=%s bytes=%d\n%s", rawSHA256(body), len(body), body)
}

func assertSBOMTestFailure(t *testing.T, options GeneratorSBOMOptions) {
	t.Helper()
	report, err := CheckGeneratorSBOMBundle(context.Background(), options)
	if err == nil || report.State != "incomplete" || report.Error == "" || len(report.Error) > 4096 ||
		len(report.Files)+len(report.LockedPackages)+len(report.ExtraTopLevelPython) != 0 || report.PackageCount != 0 || report.ManifestDigest != "" {
		t.Fatalf("failure accepted or success-shaped state retained: %+v / %v", report, err)
	}
}
