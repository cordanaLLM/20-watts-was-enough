package pdftools

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"
	"time"
)

type recordingDockerExecutor struct {
	requests []dockerRequest
	result   dockerResult
	err      error
}

func (executor *recordingDockerExecutor) run(_ context.Context, request dockerRequest) (dockerResult, error) {
	executor.requests = append(executor.requests, request)
	return executor.result, executor.err
}

func TestReproductionRequestsStayPinnedBoundedAndNonPublishing(t *testing.T) {
	t.Parallel()
	root := filepath.Clean(filepath.Join("..", "..", ".."))
	authority, err := checkAuthority(root)
	if err != nil {
		t.Fatal(err)
	}
	outputRoot := t.TempDir()
	apko, err := apkoBuildRequest(authority, outputRoot, "20w-test-apko")
	if err != nil {
		t.Fatal(err)
	}
	assertArgumentsContain(t, apko.arguments,
		authority.contract.Builder.Image,
		"--memory-swap", decimalInt64(authority.contract.Limits.ApkoMemoryBytes),
		"--pids-limit", "512",
		"--lockfile", authority.contract.Apko.Lock,
	)
	if len(apko.files) != 1 || len(apko.directories) != 1 || apko.timeout <= 0 {
		t.Fatalf("apko boundaries = %#v / %#v / %s", apko.files, apko.directories, apko.timeout)
	}
	version := apkoVersionRequest(authority, "20w-test-apko-version")
	assertArgumentsContain(t, version.arguments,
		"--pull", "missing",
		"--network", "none",
		"--read-only",
		"--memory", decimalInt64(authority.contract.Limits.RuntimeMemoryBytes),
		"--pids-limit", "64",
		authority.contract.Builder.Image,
		"version", "--json",
	)
	if version.timeout <= 0 || version.output != authority.contract.Limits.CapturedOutputBytes {
		t.Fatalf("apko version boundaries = %s / %d", version.timeout, version.output)
	}
	final := finalBuildRequest(
		authority,
		baseBuild{Layout: filepath.Join(outputRoot, "base"), Image: imageIdentity{ManifestDigest: authority.contract.BaseImage.ManifestDigest}},
		filepath.Join(outputRoot, "context"), "20w-test-builder",
		filepath.Join(outputRoot, "final.tar"), filepath.Join(outputRoot, "metadata.json"), 1,
	)
	assertArgumentsContain(t, final.arguments,
		"--builder", "20w-test-builder",
		"--network", "none",
		"--no-cache",
		"--provenance=false",
		"--sbom=false",
		"--build-context", "pdf_tools_base=oci-layout://"+filepath.Join(outputRoot, "base")+"@"+authority.contract.BaseImage.ManifestDigest,
	)
	joined := strings.Join(append(slices.Clone(apko.arguments), final.arguments...), " ")
	for _, forbidden := range []string{"skopeo", "--push", "type=registry", "--tag"} {
		if strings.Contains(joined, forbidden) {
			t.Fatalf("reproduction request contains forbidden %q: %s", forbidden, joined)
		}
	}
	if len(final.files) != 1 || len(final.directories) != 1 || final.timeout <= 0 {
		t.Fatalf("final boundaries = %#v / %#v / %s", final.files, final.directories, final.timeout)
	}
	for _, argument := range final.arguments {
		if argument == "--allow" || strings.HasPrefix(argument, "--allow=") {
			t.Fatalf("final build requested an entitlement: %q", argument)
		}
	}
	builder := reproductionBuilder{
		Name: "pdf20w-test-builder", Node: "pdf20w-test-builder-node",
		Container: "buildx_buildkit_pdf20w-test-builder-node",
		Volume:    "buildx_buildkit_pdf20w-test-builder-node_state",
	}
	builderRequest := reproductionBuilderCreateRequest(authority, builder)
	assertArgumentsContain(t, builderRequest.arguments,
		"--driver", "docker-container",
		"--driver-opt", "image="+authority.renderer.Lock.Builder.BuildKitImage,
		"--driver-opt", "network=none",
		"--driver-opt", "memory="+decimalInt64(authority.contract.Limits.BuildKitMemoryBytes),
		"--driver-opt", "memory-swap="+decimalInt64(authority.contract.Limits.BuildKitMemoryBytes),
		"--buildkitd-flags", strings.Join(expectedBuildKitDaemonFlags(authority.contract), " "),
		"--bootstrap",
	)
	if !strings.Contains(strings.Join(builderRequest.arguments, " "), "--allow-insecure-entitlement=network.host") {
		t.Fatal("Buildx's sole daemon-side entitlement was not explicit")
	}
	joined += " " + strings.Join(builderRequest.arguments, " ")
	for _, forbidden := range []string{"security.insecure"} {
		if strings.Contains(joined, forbidden) {
			t.Fatalf("reproduction request contains forbidden %q: %s", forbidden, joined)
		}
	}
}

func TestParseApkoBuilderIdentityRequiresObservedContractIdentity(t *testing.T) {
	t.Parallel()
	expected := Builder{Version: "1.2.41", Revision: "c89724f244e9d41f5e14cc7a5f3d0bd08a82128e", GoVersion: "1.27.0"}
	valid := `{
  "gitVersion": "v1.2.41",
  "gitCommit": "c89724f244e9d41f5e14cc7a5f3d0bd08a82128e",
  "gitTreeState": "dirty",
  "buildDate": "2026-08-28T04:48:59Z",
  "goVersion": "go1.27.0",
  "compiler": "gc",
  "platform": "linux/amd64"
}`
	identity, err := parseApkoBuilderIdentity([]byte(valid), expected, "linux/amd64")
	if err != nil {
		t.Fatal(err)
	}
	if identity.Version != expected.Version || identity.Revision != expected.Revision ||
		identity.GoVersion != expected.GoVersion || identity.TreeState != "dirty" ||
		identity.BuildDate != "2026-08-28T04:48:59Z" {
		t.Fatalf("apko identity = %#v", identity)
	}
	mutations := map[string]string{
		"version":    strings.Replace(valid, "v1.2.41", "v1.2.42", 1),
		"revision":   strings.Replace(valid, expected.Revision, strings.Repeat("0", 40), 1),
		"go-version": strings.Replace(valid, "go1.27.0", "go1.28.0", 1),
		"tree-state": strings.Replace(valid, "dirty", "unknown", 1),
		"build-date": strings.Replace(valid, "2026-08-28T04:48:59Z", "2026-08-28T06:48:59+02:00", 1),
		"compiler":   strings.Replace(valid, `"gc"`, `"gccgo"`, 1),
		"platform":   strings.Replace(valid, "linux/amd64", "linux/arm64", 1),
		"unknown":    strings.Replace(valid, "\n}", ",\n  \"extra\": true\n}", 1),
	}
	for name, body := range mutations {
		name, body := name, body
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			if _, err := parseApkoBuilderIdentity([]byte(body), expected, "linux/amd64"); err == nil {
				t.Fatal("mutated apko identity was accepted")
			}
		})
	}
}

func TestBoundedDockerEnvironmentDropsAmbientRouting(t *testing.T) {
	t.Setenv("DOCKER_HOST", "tcp://attacker.invalid:2375")
	t.Setenv("DOCKER_CONTEXT", "remote")
	t.Setenv("DOCKER_TLS_VERIFY", "1")
	for _, entry := range boundedDockerEnvironment() {
		for _, forbidden := range []string{"DOCKER_HOST=", "DOCKER_CONTEXT=", "DOCKER_TLS_VERIFY="} {
			if strings.HasPrefix(entry, forbidden) {
				t.Fatalf("bounded Docker environment retained %q", entry)
			}
		}
	}
}

func TestVerifyLocalDockerEndpointRejectsRemoteContext(t *testing.T) {
	t.Parallel()
	authority := checkedAuthority{root: ".", contract: Contract{Limits: Limits{CapturedOutputBytes: 64 * 1024}}}
	for name, endpoint := range map[string]string{
		"unix":   "unix:///var/run/docker.sock",
		"npipe":  "npipe:////./pipe/docker_engine",
		"remote": "tcp://remote.invalid:2376",
	} {
		name, endpoint := name, endpoint
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			body, _ := json.Marshal(endpoint)
			executor := &recordingDockerExecutor{result: dockerResult{stdout: append(body, '\n')}}
			err := verifyLocalDockerEndpoint(context.Background(), executor, authority)
			if (name == "remote") != (err != nil) {
				t.Fatalf("verifyLocalDockerEndpoint(%s) error = %v", endpoint, err)
			}
		})
	}
}

func TestBoundedDockerDirectoryCapsEmptyEntriesAndDepth(t *testing.T) {
	t.Parallel()
	root := t.TempDir()
	boundary := boundedDockerDirectory{path: root, maximum: 1024, maximumEntries: 2, maximumDepth: 2, label: "test"}
	if err := os.Mkdir(filepath.Join(root, "one"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.Mkdir(filepath.Join(root, "two"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := validateBoundedDockerDirectory(boundary); err != nil {
		t.Fatal(err)
	}
	if err := os.Mkdir(filepath.Join(root, "three"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := validateBoundedDockerDirectory(boundary); err == nil {
		t.Fatal("directory entry overflow was accepted")
	}
	deepRoot := t.TempDir()
	if err := os.MkdirAll(filepath.Join(deepRoot, "one", "two", "three"), 0o755); err != nil {
		t.Fatal(err)
	}
	boundary.path = deepRoot
	boundary.maximumEntries = 8
	if err := validateBoundedDockerDirectory(boundary); err == nil {
		t.Fatal("directory depth overflow was accepted")
	}
}

func TestReproductionReceiptIsBoundedAtomicAndNoReplace(t *testing.T) {
	requireAtomicPublicationTestPlatform(t)
	t.Parallel()
	root := t.TempDir()
	path, err := prepareReproductionReceiptPath(root, "build/evidence/pdf-tools.json")
	if err != nil {
		t.Fatal(err)
	}
	receipt := ReproductionReceipt{
		Schema: 1, Status: "local-construction-pass", Scope: "local-pdf-tools-final-image-reproduction",
		Authority: "NO_RESULT", BaseBuilds: []ReproductionBuild{}, FinalBuilds: []ReproductionBuild{},
		Notices: []NoticeObservation{}, ManPages: []string{},
	}
	if err := writeReproductionReceiptChecked(root, path, receipt, 64*1024, func() error {
		entries, err := os.ReadDir(filepath.Dir(path))
		if err != nil {
			return err
		}
		if len(entries) != 0 {
			return fmt.Errorf("unnamed receipt staging created path entries: %v", entries)
		}
		return nil
	}); err != nil {
		t.Fatal(err)
	}
	body, err := os.ReadFile(path)
	if err != nil || !strings.Contains(string(body), `"authority": "NO_RESULT"`) {
		t.Fatalf("receipt = %q, error = %v", body, err)
	}
	if err := writeReproductionReceipt(root, path, receipt, 64*1024); err == nil {
		t.Fatal("receipt replacement was accepted")
	}
	after, err := os.ReadFile(path)
	if err != nil || string(after) != string(body) {
		t.Fatal("existing receipt changed after replacement attempt")
	}
	bounded := filepath.Join(filepath.Dir(path), "too-small.json")
	if err := writeReproductionReceipt(root, bounded, receipt, 1); err == nil {
		t.Fatal("oversized receipt was accepted")
	}
	if _, err := os.Lstat(bounded); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("oversized receipt left destination: %v", err)
	}
	temporary, err := filepath.Glob(filepath.Join(filepath.Dir(path), ".20w-pdf-tools-receipt-*.tmp"))
	if err != nil || len(temporary) != 0 {
		t.Fatalf("temporary receipt links = %v, error = %v", temporary, err)
	}
}

func TestReproductionReceiptAtomicLinkDoesNotOverwriteConcurrentDestination(t *testing.T) {
	requireAtomicPublicationTestPlatform(t)
	t.Parallel()
	root := t.TempDir()
	path, err := prepareReproductionReceiptPath(root, "build/evidence/pdf-tools.json")
	if err != nil {
		t.Fatal(err)
	}
	foreign := []byte("concurrent destination")
	err = writeReproductionReceiptChecked(
		root,
		path,
		reproductionReceiptTestValue(),
		64*1024,
		func() error { return os.WriteFile(path, foreign, 0o640) },
	)
	if err == nil {
		t.Fatal("atomic receipt publication overwrote a concurrent destination")
	}
	retained, readError := os.ReadFile(path)
	if readError != nil || !bytes.Equal(retained, foreign) {
		t.Fatalf("concurrent receipt destination changed: %q, %v", retained, readError)
	}
}

func TestReproductionReceiptRejectsPrewriteSymlinkSwapsWithoutOutsideWrite(t *testing.T) {
	requireAtomicPublicationTestPlatform(t)
	t.Parallel()
	for _, swap := range []string{"receipt parent", "intermediate parent"} {
		swap := swap
		t.Run(swap, func(t *testing.T) {
			t.Parallel()
			base := t.TempDir()
			root := filepath.Join(base, "repository")
			outside := filepath.Join(base, "outside")
			if err := os.Mkdir(root, 0o755); err != nil {
				t.Fatal(err)
			}
			if err := os.Mkdir(outside, 0o755); err != nil {
				t.Fatal(err)
			}
			path, err := prepareReproductionReceiptPath(root, "build/evidence/pdf-tools.json")
			if err != nil {
				t.Fatal(err)
			}
			parked := filepath.Join(base, "parked")
			link := filepath.Dir(path)
			outsideReceiptDirectory := outside
			parkedReceiptDirectory := parked
			if swap == "intermediate parent" {
				link = filepath.Join(root, "build")
				outsideReceiptDirectory = filepath.Join(outside, "evidence")
				parkedReceiptDirectory = filepath.Join(parked, "evidence")
				if err := os.Mkdir(outsideReceiptDirectory, 0o755); err != nil {
					t.Fatal(err)
				}
			}
			if err := os.Rename(link, parked); err != nil {
				t.Fatal(err)
			}
			if err := os.Symlink(outside, link); err != nil {
				t.Skipf("create hostile receipt-parent symlink: %v", err)
			}
			sentinel := filepath.Join(outside, "sentinel")
			if err := os.WriteFile(sentinel, []byte("outside-owned"), 0o600); err != nil {
				t.Fatal(err)
			}
			receipt := reproductionReceiptTestValue()
			if err := writeReproductionReceipt(root, path, receipt, 64*1024); err == nil {
				t.Fatal("writeReproductionReceipt() accepted a pre-write parent symlink swap")
			}
			assertNoReceiptFiles(t, path, outsideReceiptDirectory, parkedReceiptDirectory)
			body, err := os.ReadFile(sentinel)
			if err != nil || string(body) != "outside-owned" {
				t.Fatalf("outside sentinel changed: %q, %v", body, err)
			}
		})
	}
}

func TestReproductionReceiptRejectsLateParentSwapWithoutOutsideWrite(t *testing.T) {
	requireAtomicPublicationTestPlatform(t)
	t.Parallel()
	base := t.TempDir()
	root := filepath.Join(base, "repository")
	outside := filepath.Join(base, "outside")
	if err := os.Mkdir(root, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.Mkdir(outside, 0o755); err != nil {
		t.Fatal(err)
	}
	path, err := prepareReproductionReceiptPath(root, "build/evidence/pdf-tools.json")
	if err != nil {
		t.Fatal(err)
	}
	parent := filepath.Dir(path)
	parked := filepath.Join(base, "parked-evidence")
	sentinel := filepath.Join(outside, "sentinel")
	if err := os.WriteFile(sentinel, []byte("outside-owned"), 0o600); err != nil {
		t.Fatal(err)
	}
	err = writeReproductionReceiptChecked(root, path, reproductionReceiptTestValue(), 64*1024, func() error {
		if err := os.Rename(parent, parked); err != nil {
			return err
		}
		return os.Symlink(outside, parent)
	})
	if err == nil || !strings.Contains(err.Error(), "directory changed before publication") {
		t.Fatalf("write after receipt parent swap error = %v", err)
	}
	assertNoReceiptFiles(t, path, outside, parked)
	body, err := os.ReadFile(sentinel)
	if err != nil || string(body) != "outside-owned" {
		t.Fatalf("outside sentinel changed: %q, %v", body, err)
	}
}

func TestReproductionReceiptDoesNotUseOrReplaceLegacyStagingNames(t *testing.T) {
	requireAtomicPublicationTestPlatform(t)
	t.Parallel()
	root := t.TempDir()
	path, err := prepareReproductionReceiptPath(root, "build/evidence/pdf-tools.json")
	if err != nil {
		t.Fatal(err)
	}
	receipt := reproductionReceiptTestValue()
	temporaryPath := filepath.Join(filepath.Dir(path), ".20w-pdf-tools-receipt-foreign.tmp")
	foreign := []byte("foreign staging file")
	if err := os.WriteFile(temporaryPath, foreign, 0o600); err != nil {
		t.Fatal(err)
	}
	if err := writeReproductionReceipt(root, path, receipt, 64*1024); err != nil {
		t.Fatalf("legacy staging-shaped file blocked unnamed publication: %v", err)
	}
	current, err := os.ReadFile(temporaryPath)
	if err != nil || string(current) != string(foreign) {
		t.Fatalf("pre-existing staging file changed: %q, %v", current, err)
	}
	if information, err := os.Lstat(path); err != nil || !information.Mode().IsRegular() {
		t.Fatalf("unnamed receipt was not published: %v", err)
	}
}

func TestReproductionReceiptRetainsPublishedPathAfterPostLinkFailure(t *testing.T) {
	requireAtomicPublicationTestPlatform(t)
	t.Parallel()
	tests := map[string]struct {
		afterLink func(*pinnedPublicationDirectory, string) error
		want      []byte
	}{
		"exact published receipt": {
			afterLink: func(*pinnedPublicationDirectory, string) error {
				return errors.New("injected post-link failure")
			},
		},
		"hostile replacement": {
			afterLink: func(parent *pinnedPublicationDirectory, name string) error {
				if err := parent.root.Remove(name); err != nil {
					return err
				}
				return parent.root.WriteFile(name, []byte("foreign"), 0o640)
			},
			want: []byte("foreign"),
		},
	}
	for name, test := range tests {
		name, test := name, test
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			root := t.TempDir()
			path, err := prepareReproductionReceiptPath(root, "build/evidence/pdf-tools.json")
			if err != nil {
				t.Fatal(err)
			}
			receipt := reproductionReceiptTestValue()
			body, err := json.MarshalIndent(receipt, "", "  ")
			if err != nil {
				t.Fatal(err)
			}
			body = append(body, '\n')
			if test.want == nil {
				test.want = body
			}
			err = writeReproductionReceiptCheckedAtRoot(
				testPublicationRoot(t, root), path, receipt, 64*1024, nil, test.afterLink,
			)
			if err == nil {
				t.Fatal("receipt publication accepted the injected post-link failure")
			}
			retained, readError := os.ReadFile(path)
			if readError != nil || !bytes.Equal(retained, test.want) {
				t.Fatalf("published receipt path was removed or changed: %q, %v", retained, readError)
			}
			temporary, globError := filepath.Glob(filepath.Join(filepath.Dir(path), ".20w-pdf-tools-receipt-*.tmp"))
			if globError != nil || len(temporary) != 0 {
				t.Fatalf("receipt publication created a staging pathname: %v, %v", temporary, globError)
			}
		})
	}
}

func TestPinnedPublicationDirectoryCreationCannotFollowSwappedRepositoryRoot(t *testing.T) {
	requireAtomicPublicationTestPlatform(t)
	t.Parallel()
	base := t.TempDir()
	root := filepath.Join(base, "repository")
	parked := filepath.Join(base, "parked")
	outside := filepath.Join(base, "outside")
	for _, directory := range []string{root, outside} {
		if err := os.Mkdir(directory, 0o755); err != nil {
			t.Fatal(err)
		}
	}
	repository := testPublicationRoot(t, root)
	swapped := false
	_, err := prepareReproductionReceiptPathAtRoot(
		repository,
		"build/evidence/pdf-tools.json",
		func(string) error {
			if swapped {
				return nil
			}
			swapped = true
			if err := os.Rename(root, parked); err != nil {
				return err
			}
			return os.Symlink(outside, root)
		},
	)
	if err == nil || !swapped {
		t.Fatalf("pinned directory creation accepted a swapped repository root: %v", err)
	}
	if _, err := os.Lstat(filepath.Join(outside, "build")); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("directory creation escaped to the swapped root: %v", err)
	}
	if information, err := os.Lstat(filepath.Join(parked, "build", "evidence")); err != nil || !information.IsDir() {
		t.Fatalf("pinned creation did not remain under the original root: %v", err)
	}
}

func reproductionReceiptTestValue() ReproductionReceipt {
	return ReproductionReceipt{
		Schema: 1, Status: "local-construction-pass", Scope: "local-pdf-tools-final-image-reproduction",
		Authority: "NO_RESULT", BaseBuilds: []ReproductionBuild{}, FinalBuilds: []ReproductionBuild{},
		Notices: []NoticeObservation{}, ManPages: []string{},
	}
}

func assertNoReceiptFiles(t *testing.T, path string, directories ...string) {
	t.Helper()
	if _, err := os.Lstat(path); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("failed receipt publication left %s: %v", path, err)
	}
	for _, directory := range directories {
		if _, err := os.Lstat(filepath.Join(directory, filepath.Base(path))); !errors.Is(err, os.ErrNotExist) {
			t.Fatalf("failed receipt publication left a receipt in %s: %v", directory, err)
		}
		temporary, err := filepath.Glob(filepath.Join(directory, ".20w-pdf-tools-receipt-*.tmp"))
		if err != nil || len(temporary) != 0 {
			t.Fatalf("failed receipt publication left temporary files in %s: %v, %v", directory, temporary, err)
		}
	}
}

func TestPrepareReproductionReceiptPathRejectsEscapeAndExisting(t *testing.T) {
	requireAtomicPublicationTestPlatform(t)
	t.Parallel()
	root := t.TempDir()
	for _, path := range []string{
		"../escape.json",
		"receipt.json",
		".workingdir2/evidence/publication/retired.json",
		"build/evidence/not-json",
		"build/evidence/line\nbreak.json",
		"build/evidence/tab\tname.json",
		"build/evidence/bidi\u202e.json",
	} {
		if _, err := prepareReproductionReceiptPath(root, path); err == nil {
			t.Fatalf("prepareReproductionReceiptPath() accepted %q", path)
		}
	}
	path, err := prepareReproductionReceiptPath(root, ".workingdir/evidence/publication/existing.json")
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte("existing"), 0o644); err != nil {
		t.Fatal(err)
	}
	if _, err := prepareReproductionReceiptPath(root, ".workingdir/evidence/publication/existing.json"); err == nil {
		t.Fatal("prepareReproductionReceiptPath() accepted an existing receipt")
	}
}

func TestDockerRequestTimeoutIsPositive(t *testing.T) {
	t.Parallel()
	request := dockerRequest{operation: "test", timeout: time.Second, output: 1, arguments: []string{"version"}}
	if request.timeout <= 0 {
		t.Fatal("test fixture has no timeout")
	}
}

func assertArgumentsContain(t *testing.T, arguments []string, wanted ...string) {
	t.Helper()
	joined := "\x00" + strings.Join(arguments, "\x00") + "\x00"
	for _, value := range wanted {
		if !strings.Contains(joined, "\x00"+value+"\x00") {
			t.Fatalf("arguments omit %q: %q", value, arguments)
		}
	}
}
