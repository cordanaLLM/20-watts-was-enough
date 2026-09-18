package clrsfixture

import (
	"bytes"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestTrackedGeneratorWheelhouseManifestLocksEveryRuntimePackage(t *testing.T) {
	t.Parallel()
	manifest, _, _, _ := trackedGeneratorWheelhouseManifest(t)
	if manifest.PackageCount != generatorRuntimePackageCount || manifest.ArtifactCount != generatorRuntimePackageCount ||
		manifest.DownloadedWheelCount != 60 || manifest.SourceBuiltWheelCount != 1 ||
		manifest.TotalSizeBytes != 823_932_066 {
		t.Fatalf("tracked wheelhouse counts/bytes = %#v", manifest)
	}
	if len(manifest.Artifacts) != generatorRuntimePackageCount || manifest.Artifacts[0].Package != "absl-py" ||
		manifest.Artifacts[len(manifest.Artifacts)-1].Package != "zipp" {
		t.Fatalf("tracked wheelhouse package ordering is invalid")
	}
	var promise GeneratorWheelhouseEntry
	for _, artifact := range manifest.Artifacts {
		if artifact.Package == "promise" {
			promise = artifact
		}
	}
	if promise.Kind != "source-built-wheel" || promise.Filename != promiseWheelFilename ||
		promise.SHA256 != promiseWheelSHA256 || promise.SizeBytes != promiseWheelSize {
		t.Fatalf("tracked promise wheel = %#v", promise)
	}
	sourceBuild := manifest.SourceBuild
	if sourceBuild.ProcedureState != "missing" || sourceBuild.ReproductionReceiptState != "missing" ||
		sourceBuild.Provenance.SPDX != "MIT" || sourceBuild.Provenance.RepositoryLicensePath != promiseLicensePath ||
		sourceBuild.Provenance.LicenseSHA256 != promiseLicenseSHA256 ||
		sourceBuild.Provenance.LicenseSizeBytes != promiseLicenseSize {
		t.Fatalf("tracked promise build boundary/provenance = %#v", sourceBuild)
	}
}

func TestLockedPromiseSourceBuildBindsRecipeToSelectedWheels(t *testing.T) {
	t.Parallel()
	manifest, input, _, lockBody := trackedGeneratorWheelhouseManifest(t)
	packages, err := parseLockedGeneratorPackages(lockBody)
	if err != nil {
		t.Fatal(err)
	}
	alternative := lockedGeneratorArtifact{
		Package: "packaging", Version: "26.3", Filename: "packaging-26.3-1-py3-none-any.whl",
		URL:    "https://files.pythonhosted.org/packages/test/packaging-26.3-1-py3-none-any.whl",
		SHA256: strings.Repeat("d", 64), SizeBytes: 130_001, Wheel: true,
	}
	for index := range packages {
		if packages[index].Name == alternative.Package {
			packages[index].Artifacts = append(packages[index].Artifacts, alternative)
		}
	}
	selected := append([]GeneratorWheelhouseEntry(nil), manifest.Artifacts...)
	for index := range selected {
		if selected[index].Package == alternative.Package {
			selected[index] = GeneratorWheelhouseEntry{
				Package: alternative.Package, Version: alternative.Version, Kind: "downloaded-wheel",
				Filename: alternative.Filename, URL: alternative.URL, SHA256: alternative.SHA256,
				SizeBytes: alternative.SizeBytes,
			}
		}
	}
	recipe, err := lockedPromiseSourceBuild(input, packages, selected)
	if err != nil {
		t.Fatal(err)
	}
	if recipe.BuildRequirements[0].Filename != alternative.Filename {
		t.Fatalf("selected packaging build requirement = %#v", recipe.BuildRequirements[0])
	}
	wantPath := "/inputs/wheelhouse/" + alternative.Filename
	if recipe.CandidateInstallCommand[len(recipe.CandidateInstallCommand)-3] != wantPath {
		t.Fatalf("selected packaging install argument = %q, want %q", recipe.CandidateInstallCommand[len(recipe.CandidateInstallCommand)-3], wantPath)
	}

	withoutPackaging := make([]GeneratorWheelhouseEntry, 0, len(selected)-1)
	for _, artifact := range selected {
		if artifact.Package != "packaging" {
			withoutPackaging = append(withoutPackaging, artifact)
		}
	}
	if _, err := lockedPromiseSourceBuild(input, packages, withoutPackaging); err == nil ||
		!strings.Contains(err.Error(), `requirement "packaging" is not selected`) {
		t.Fatalf("lockedPromiseSourceBuild missing-selection error = %v", err)
	}
}

func TestGeneratorWheelhouseManifestRejectsArtifactAndRecipeDrift(t *testing.T) {
	t.Parallel()
	_, input, contract, lockBody := trackedGeneratorWheelhouseManifest(t)
	valid := string(trackedGeneratorFile(t, "wheelhouse.json"))
	tests := map[string]string{
		"duplicate": strings.Replace(
			valid,
			`"authority": "NO_RESULT"`,
			`"authority": "NO_RESULT", "authority": "NO_RESULT"`,
			1,
		),
		"wrong authority": strings.Replace(valid, `"authority": "NO_RESULT"`, `"authority": "RESULT"`, 1),
		"package count":   strings.Replace(valid, `"package_count": 61`, `"package_count": 60`, 1),
		"byte total":      strings.Replace(valid, `"total_size_bytes": 823932066`, `"total_size_bytes": 823932067`, 1),
		"mutable base": strings.Replace(
			valid,
			input.Python.BaseImage,
			"docker.io/library/python:3.13.15-slim-bookworm",
			1,
		),
		"glibc drift":        strings.Replace(valid, `"glibc_version": "2.36"`, `"glibc_version": "2.37"`, 1),
		"procedure pretence": strings.Replace(valid, `"procedure_state": "missing"`, `"procedure_state": "complete"`, 1),
		"receipt pretence": strings.Replace(
			valid,
			`"reproduction_receipt_state": "missing"`,
			`"reproduction_receipt_state": "complete"`,
			1,
		),
		"acquisition date": strings.Replace(valid, `"acquired_on": "2026-09-05"`, `"acquired_on": "2026-09-04"`, 1),
		"licence SPDX":     strings.Replace(valid, `"spdx": "MIT"`, `"spdx": "Apache-2.0"`, 1),
		"licence digest":   strings.Replace(valid, promiseLicenseSHA256, strings.Repeat("c", 64), 1),
		"foreign URL": strings.Replace(
			valid,
			"https://files.pythonhosted.org/packages/58/0a/",
			"https://example.invalid/packages/58/0a/",
			1,
		),
		"wheel digest":  strings.Replace(valid, "0f17b89f2a4eaaedc4f28c622998aa690564b3012a396a4ffad0821007fe03ba", strings.Repeat("a", 64), 1),
		"built wheel":   strings.Replace(valid, promiseWheelSHA256, strings.Repeat("b", 64), 1),
		"builder image": strings.Replace(valid, `"builder_image": "`+input.Python.BaseImage+`"`, `"builder_image": "docker.io/library/python:3.13.15-slim-bookworm"`, 1),
		"build command": strings.Replace(valid, `"bdist_wheel"`, `"sdist"`, 1),
		"build environment": strings.Replace(
			valid,
			`"PYTHONHASHSEED=0"`,
			`"PYTHONHASHSEED=random"`,
			1,
		),
		"one reproduction": strings.Replace(valid, `"required_reproductions": 2`, `"required_reproductions": 1`, 1),
	}
	for name, body := range tests {
		name, body := name, body
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			if _, err := ParseGeneratorWheelhouseManifest([]byte(body), lockBody, input, contract); err == nil {
				t.Fatalf("ParseGeneratorWheelhouseManifest accepted %s", name)
			}
		})
	}
	if _, err := ParseGeneratorWheelhouseManifest(
		trackedGeneratorFile(t, "wheelhouse.json"),
		append(lockBody, '\n'),
		input,
		contract,
	); err == nil || !strings.Contains(err.Error(), "dependency-lock digest") {
		t.Fatalf("ParseGeneratorWheelhouseManifest mutated-lock error = %v", err)
	}
}

func TestGeneratorWheelhouseManifestRejectsReorderedPackages(t *testing.T) {
	t.Parallel()
	manifest, input, contract, lockBody := trackedGeneratorWheelhouseManifest(t)
	manifest.Artifacts[0], manifest.Artifacts[1] = manifest.Artifacts[1], manifest.Artifacts[0]
	var body bytes.Buffer
	encoder := json.NewEncoder(&body)
	encoder.SetEscapeHTML(false)
	encoder.SetIndent("", "  ")
	if err := encoder.Encode(manifest); err != nil {
		t.Fatal(err)
	}
	if _, err := ParseGeneratorWheelhouseManifest(body.Bytes(), lockBody, input, contract); err == nil {
		t.Fatal("ParseGeneratorWheelhouseManifest accepted reordered packages")
	}
}

func TestGeneratorWheelhouseManifestRejectsLockedButIncompatibleWheels(t *testing.T) {
	t.Parallel()
	manifest, input, contract, lockBody := trackedGeneratorWheelhouseManifest(t)
	packages, err := parseLockedGeneratorPackages(lockBody)
	if err != nil {
		t.Fatal(err)
	}
	for name, marker := range map[string]string{
		"pyemscripten":  "pyemscripten_",
		"musllinux":     "musllinux_",
		"free-threaded": "cp313t-",
	} {
		name, marker := name, marker
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			var alternative lockedGeneratorArtifact
			for _, pkg := range packages {
				for _, artifact := range pkg.Artifacts {
					if artifact.Wheel && strings.Contains(artifact.Filename, marker) {
						alternative = artifact
						break
					}
				}
				if alternative.Filename != "" {
					break
				}
			}
			if alternative.Filename == "" {
				t.Fatalf("uv lock has no %s wheel", name)
			}
			candidate := manifest
			candidate.Artifacts = append([]GeneratorWheelhouseEntry(nil), manifest.Artifacts...)
			replaced := false
			for index := range candidate.Artifacts {
				if candidate.Artifacts[index].Package != alternative.Package {
					continue
				}
				candidate.TotalSizeBytes += alternative.SizeBytes - candidate.Artifacts[index].SizeBytes
				candidate.Artifacts[index] = GeneratorWheelhouseEntry{
					Package: alternative.Package, Version: alternative.Version, Kind: "downloaded-wheel",
					Filename: alternative.Filename, URL: alternative.URL, SHA256: alternative.SHA256,
					SizeBytes: alternative.SizeBytes,
				}
				replaced = true
				break
			}
			if !replaced {
				t.Fatalf("tracked manifest has no package %q", alternative.Package)
			}
			var body bytes.Buffer
			encoder := json.NewEncoder(&body)
			encoder.SetEscapeHTML(false)
			encoder.SetIndent("", "  ")
			if err := encoder.Encode(candidate); err != nil {
				t.Fatal(err)
			}
			if _, err := ParseGeneratorWheelhouseManifest(body.Bytes(), lockBody, input, contract); err == nil {
				t.Fatalf("ParseGeneratorWheelhouseManifest accepted %s wheel %q", name, alternative.Filename)
			}
		})
	}
}

func TestGeneratorWheelCompatibilityIsBoundToCPython313AndBookwormAMD64(t *testing.T) {
	t.Parallel()
	for _, filename := range []string{
		"pure-1.0-py3-none-any.whl",
		"legacy_pure-1.0-py2.py3-none-any.whl",
		"native-1.0-cp313-cp313-manylinux_2_36_x86_64.whl",
		"abi3-1.0-cp310-abi3-manylinux2014_x86_64.whl",
		"old_abi3-1.0-cp36-abi3-manylinux1_x86_64.manylinux_2_28_x86_64.whl",
		"libclang-1.0-py2.py3-none-manylinux2010_x86_64.whl",
	} {
		if !compatibleGeneratorWheelFilename(filename) {
			t.Errorf("compatibleGeneratorWheelFilename(%q) = false", filename)
		}
	}
	for _, filename := range []string{
		"wasm-1.0-cp313-cp313-pyemscripten_2025_0_wasm32.whl",
		"musl-1.0-cp313-cp313-musllinux_1_2_x86_64.whl",
		"free_threaded-1.0-cp313-cp313t-manylinux_2_28_x86_64.whl",
		"future_glibc-1.0-cp313-cp313-manylinux_2_37_x86_64.whl",
		"new_python-1.0-cp314-cp314-manylinux_2_28_x86_64.whl",
		"windows-1.0-cp313-cp313-win_amd64.whl",
		"arm-1.0-cp313-cp313-manylinux_2_28_aarch64.whl",
	} {
		if compatibleGeneratorWheelFilename(filename) {
			t.Errorf("compatibleGeneratorWheelFilename(%q) = true", filename)
		}
	}
}

func TestGeneratorWheelhouseSnapshotBoundsEntryCountAndDetectsMutation(t *testing.T) {
	t.Parallel()
	for _, count := range []int{0, generatorRuntimePackageCount + 1} {
		if _, err := readGeneratorWheelhouseSnapshot(t.TempDir(), count); err == nil ||
			!strings.Contains(err.Error(), "outside the bounded runtime set") {
			t.Fatalf("readGeneratorWheelhouseSnapshot(count=%d) error = %v", count, err)
		}
	}
	t.Run("bounded count", func(t *testing.T) {
		root := t.TempDir()
		for index := 0; index < generatorRuntimePackageCount+1; index++ {
			name := fmt.Sprintf("artifact_%02d-1-py3-none-any.whl", index)
			if err := os.WriteFile(filepath.Join(root, name), []byte{byte(index)}, 0o644); err != nil {
				t.Fatal(err)
			}
		}
		if _, err := readGeneratorWheelhouseSnapshot(root, generatorRuntimePackageCount); err == nil ||
			!strings.Contains(err.Error(), "62 files") {
			t.Fatalf("readGeneratorWheelhouseSnapshot() error = %v, want bounded extra-entry rejection", err)
		}
	})

	t.Run("added name", func(t *testing.T) {
		root := t.TempDir()
		if err := os.WriteFile(filepath.Join(root, "first-1-py3-none-any.whl"), []byte("first"), 0o644); err != nil {
			t.Fatal(err)
		}
		initial, err := readGeneratorWheelhouseSnapshot(root, 1)
		if err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(filepath.Join(root, "second-1-py3-none-any.whl"), []byte("second"), 0o644); err != nil {
			t.Fatal(err)
		}
		if err := confirmGeneratorWheelhouseSnapshot(root, initial); err == nil {
			t.Fatal("confirmGeneratorWheelhouseSnapshot accepted an added wheel")
		}
	})

	t.Run("replaced name", func(t *testing.T) {
		root := t.TempDir()
		filename := filepath.Join(root, "only-1-py3-none-any.whl")
		if err := os.WriteFile(filename, []byte("same bytes"), 0o644); err != nil {
			t.Fatal(err)
		}
		initial, err := readGeneratorWheelhouseSnapshot(root, 1)
		if err != nil {
			t.Fatal(err)
		}
		if err := os.Remove(filename); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(filename, []byte("same bytes"), 0o644); err != nil {
			t.Fatal(err)
		}
		if err := confirmGeneratorWheelhouseSnapshot(root, initial); err == nil {
			t.Fatal("confirmGeneratorWheelhouseSnapshot accepted a replaced wheel")
		}
	})
}

func TestDigestGeneratorWheelIsBoundedAndRejectsNamedSymlinkReplacement(t *testing.T) {
	t.Parallel()
	root := t.TempDir()
	filename := filepath.Join(root, "artifact-1-py3-none-any.whl")
	body := []byte("bounded wheel fixture")
	if err := os.WriteFile(filename, body, 0o644); err != nil {
		t.Fatal(err)
	}
	information, err := os.Lstat(filename)
	if err != nil {
		t.Fatal(err)
	}
	digest, err := digestGeneratorWheel(filename, information, int64(len(body)))
	if err != nil || digest != rawSHA256(body) {
		t.Fatalf("digestGeneratorWheel() = %q, %v", digest, err)
	}
	if _, err := digestGeneratorWheel(filename, information, int64(len(body))-1); err == nil {
		t.Fatal("digestGeneratorWheel accepted an undersized read limit")
	}

	target := filepath.Join(t.TempDir(), "replacement.whl")
	if err := os.WriteFile(target, body, 0o644); err != nil {
		t.Fatal(err)
	}
	_, err = digestGeneratorWheelWithInterlock(filename, information, int64(len(body)), func() error {
		if err := os.Remove(filename); err != nil {
			return err
		}
		return os.Symlink(target, filename)
	})
	skipWindowsPinnedName(t, err, "stable-read interlock")
	if err != nil && strings.Contains(err.Error(), "operation not permitted") {
		t.Skipf("symlink unavailable: %v", err)
	}
	if err == nil || !strings.Contains(err.Error(), "changed while it was hashed") {
		t.Fatalf("digestGeneratorWheelWithInterlock() error = %v, want named-path replacement rejection", err)
	}
}

func TestMaterializedGeneratorWheelhouseRejectsWrongSizeBeforeHashing(t *testing.T) {
	t.Parallel()
	manifest, _, contract, lockBody := trackedGeneratorWheelhouseManifest(t)
	packages, err := parseLockedGeneratorPackages(lockBody)
	if err != nil {
		t.Fatal(err)
	}
	root := t.TempDir()
	for _, artifact := range manifest.Artifacts {
		if err := os.WriteFile(filepath.Join(root, artifact.Filename), []byte{0}, 0o644); err != nil {
			t.Fatal(err)
		}
	}
	if _, _, err := inspectMaterializedGeneratorWheelhouse(
		root,
		packages,
		contract.Limits.DependencyArtifactBytes,
	); err == nil || !strings.Contains(err.Error(), "invalid or unbounded size") {
		t.Fatalf("inspectMaterializedGeneratorWheelhouse() error = %v, want pre-hash size rejection", err)
	}
}

func TestWriteNewGeneratorWheelhouseManifestIsNewOutsideAndIdentityChecked(t *testing.T) {
	t.Parallel()
	wheelhouse := t.TempDir()
	output := filepath.Join(t.TempDir(), "candidate.json")
	body := []byte("{\n  \"authority\": \"NO_RESULT\"\n}\n")
	digest, size, err := writeNewGeneratorWheelhouseManifest(wheelhouse, output, body)
	if err != nil || digest != rawSHA256(body) || size != int64(len(body)) {
		t.Fatalf("writeNewGeneratorWheelhouseManifest() = %q, %d, %v", digest, size, err)
	}
	information, err := os.Lstat(output)
	if err != nil || !information.Mode().IsRegular() {
		t.Fatalf("written manifest state = %v, %v", information, err)
	}
	t.Run("mode", func(t *testing.T) {
		requirePOSIXModeBits(t, "the published manifest mode")
		if information.Mode().Perm() != 0o644 {
			t.Fatalf("written manifest mode = %v", information.Mode())
		}
	})
	if _, _, err := writeNewGeneratorWheelhouseManifest(wheelhouse, output, body); err == nil {
		t.Fatal("writeNewGeneratorWheelhouseManifest overwrote an existing path")
	}
	inside := filepath.Join(wheelhouse, "candidate.json")
	if _, _, err := writeNewGeneratorWheelhouseManifest(wheelhouse, inside, body); err == nil {
		t.Fatal("writeNewGeneratorWheelhouseManifest wrote inside the wheel directory")
	}
}

func TestWriteNewGeneratorWheelhouseManifestAnchorsParentAndPreservesReplacement(t *testing.T) {
	t.Parallel()
	body := []byte("{\n  \"authority\": \"NO_RESULT\"\n}\n")
	t.Run("parent replacement", func(t *testing.T) {
		base := t.TempDir()
		parent := filepath.Join(base, "parent")
		parked := filepath.Join(base, "parked")
		if err := os.Mkdir(parent, 0o755); err != nil {
			t.Fatal(err)
		}
		output := filepath.Join(parent, "candidate.json")
		_, _, err := writeNewGeneratorWheelhouseManifestWithInterlock(t.TempDir(), output, body, func() error {
			if err := os.Rename(parent, parked); err != nil {
				return err
			}
			return os.Mkdir(parent, 0o755)
		})
		skipWindowsPinnedName(t, err, "manifest write interlock")
		if err == nil || !strings.Contains(err.Error(), "output parent changed") {
			t.Fatalf("write after parent replacement error = %v", err)
		}
		if _, statErr := os.Lstat(output); !os.IsNotExist(statErr) {
			t.Fatalf("failed write populated replacement parent %s: %v", output, statErr)
		}
		retained, readErr := os.ReadFile(filepath.Join(parked, "candidate.json"))
		if readErr != nil || !bytes.Equal(retained, body) {
			t.Fatalf("failed write did not retain its anchored candidate: %q, %v", retained, readErr)
		}
	})

	t.Run("name replacement", func(t *testing.T) {
		parent := t.TempDir()
		output := filepath.Join(parent, "candidate.json")
		replacement := []byte("replacement owned elsewhere")
		_, _, err := writeNewGeneratorWheelhouseManifestWithInterlock(t.TempDir(), output, body, func() error {
			if err := os.Remove(output); err != nil {
				return err
			}
			return os.WriteFile(output, replacement, 0o644)
		})
		if err == nil || !strings.Contains(err.Error(), "not the expected regular file") {
			t.Fatalf("write after name replacement error = %v", err)
		}
		retained, readErr := os.ReadFile(output)
		if readErr != nil || !bytes.Equal(retained, replacement) {
			t.Fatalf("replacement was not preserved: %q, %v", retained, readErr)
		}
	})

	t.Run("same-inode byte replacement", func(t *testing.T) {
		parent := t.TempDir()
		output := filepath.Join(parent, "candidate.json")
		replacement := bytes.Repeat([]byte("x"), len(body))
		_, _, err := writeNewGeneratorWheelhouseManifestWithInterlock(t.TempDir(), output, body, func() error {
			return os.WriteFile(output, replacement, 0o644)
		})
		if err == nil || !strings.Contains(err.Error(), "bytes do not match") {
			t.Fatalf("write after same-inode byte replacement error = %v", err)
		}
		retained, readErr := os.ReadFile(output)
		if readErr != nil || !bytes.Equal(retained, replacement) {
			t.Fatalf("same-inode replacement was not preserved: %q, %v", retained, readErr)
		}
	})
}

func trackedGeneratorWheelhouseManifest(
	t *testing.T,
) (GeneratorWheelhouseManifest, GeneratorLockInput, GeneratorImageContract, []byte) {
	t.Helper()
	source := trackedSourceRecord(t)
	generation := trackedGenerationContract(t, source)
	lockInputBody := trackedGeneratorFile(t, "lock-input.json")
	input, err := ParseGeneratorLockInput(lockInputBody, source)
	if err != nil {
		t.Fatal(err)
	}
	contract, err := ParseGeneratorImageContract(
		trackedGeneratorFile(t, "image-contract.json"),
		lockInputBody,
		source,
		generation,
	)
	if err != nil {
		t.Fatal(err)
	}
	dependencyLockBody := trackedGeneratorFile(t, "uv.lock")
	manifest, err := ParseGeneratorWheelhouseManifest(
		trackedGeneratorFile(t, "wheelhouse.json"),
		dependencyLockBody,
		input,
		contract,
	)
	if err != nil {
		t.Fatal(err)
	}
	return manifest, input, contract, dependencyLockBody
}
