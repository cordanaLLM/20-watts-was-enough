package clrsfixture

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"reflect"
	"slices"
	"strings"
	"testing"
	"time"
)

type promiseFakeDocker struct {
	inputs          promiseInputs
	calls           []promiseDockerRequest
	name            string
	id              string
	created         int
	present         bool
	fail            string
	malformedCreate bool
	createStderr    bool
	wrongOwner      bool
	remains         bool
	output          []byte
	cancel          context.CancelFunc
	cleanupCanceled bool
	deadlines       []time.Time
}

func (fake *promiseFakeDocker) run(ctx context.Context, request promiseDockerRequest) (promiseDockerResult, error) {
	fake.calls = append(fake.calls, request)
	if deadline, ok := ctx.Deadline(); ok && request.operation != "find-owned" && request.operation != "inspect-owner" &&
		request.operation != "remove" && request.operation != "verify-absence" {
		fake.deadlines = append(fake.deadlines, deadline)
	}
	if slices.Contains([]string{"find-owned", "inspect-owner", "remove", "verify-absence"}, request.operation) && ctx.Err() != nil {
		fake.cleanupCanceled = true
	}
	if request.operation == "create" {
		fake.name = request.arguments[slices.Index(request.arguments, "--name")+1]
		fake.created++
		fake.id = fmt.Sprintf("%064x", fake.created)
		fake.present = true
	}
	if request.operation == fake.fail {
		if fake.cancel != nil {
			fake.cancel()
		}
		return promiseDockerResult{stderr: []byte("retained injected failure")}, errors.New("injected " + fake.fail)
	}
	textResult := func(value string) (promiseDockerResult, error) {
		return promiseDockerResult{stdout: []byte(value)}, nil
	}
	switch request.operation {
	case "verify-endpoint":
		return textResult("\"unix:///var/run/docker.sock\"\n")
	case "verify-image":
		image := fake.inputs.manifest.SourceBuild.BuilderImage
		_, digest, _ := strings.Cut(image, "@")
		return textResult(fmt.Sprintf(`{"id":"sha256:%s","os":"linux","architecture":"amd64","digests":["python@%s"],"volumes":null}`, strings.Repeat("a", 64), digest))
	case "create":
		if fake.malformedCreate {
			return textResult(fake.id + "\nunexpected\n")
		}
		if fake.createStderr {
			return promiseDockerResult{stdout: []byte(fake.id + "\n"), stderr: []byte("unexpected")}, nil
		}
		return textResult(fake.id + "\n")
	case "start":
		return textResult(fake.name + "\n")
	case "read-wheel":
		return promiseDockerResult{stdout: fake.output}, nil
	case "find-owned", "verify-absence":
		if fake.present {
			return textResult(fake.id + "\n")
		}
		return textResult("")
	case "inspect-owner":
		owner := fake.name
		if fake.wrongOwner {
			owner = "another-workload"
		}
		return textResult(fmt.Sprintf(`{"id":%q,"owner":%q}`, fake.id, owner))
	case "remove":
		fake.present = fake.remains
		return textResult(fake.id + "\n")
	default:
		return promiseDockerResult{}, nil
	}
}

func promiseLifecycleInputs(t *testing.T) promiseInputs {
	t.Helper()
	inputs, err := loadPromiseAuthority(trackedRepositoryRoot(t))
	if err != nil {
		t.Fatal(err)
	}
	inputs.sourceTar = []byte("bounded source fixture")
	for range inputs.manifest.SourceBuild.BuildRequirements {
		inputs.wheels = append(inputs.wheels, []byte("bounded wheel fixture"))
	}
	return inputs
}

func promiseTestBundle(t *testing.T) *os.Root {
	t.Helper()
	root, err := os.OpenRoot(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = root.Close() })
	return root
}

func TestPromiseFailedRunsRemoveOwnedResources(t *testing.T) {
	for _, operation := range []string{"create", "start", "copy-source", "bootstrap", "install", "build", "read-wheel"} {
		t.Run(operation, func(t *testing.T) {
			inputs := promiseLifecycleInputs(t)
			fake := &promiseFakeDocker{inputs: inputs, fail: operation}
			bundle := promiseTestBundle(t)
			run, err := runPromiseContainer(context.Background(), inputs, bundle, fake, 1)
			if err == nil || fake.present || !run.CleanupVerified || !run.StagingRemoved {
				t.Fatalf("failure cleanup: err=%v present=%v run=%+v", err, fake.present, run)
			}
			if _, err := bundle.Stat("receipt.json"); !errors.Is(err, os.ErrNotExist) {
				t.Fatal("failed run wrote success receipt")
			}
			body, err := readGeneratorFile(bundle.Name(), "run-1/commands.json", 2<<20)
			if err != nil || !bytes.Contains(body, []byte("injected "+operation)) {
				t.Fatalf("failure evidence not retained: %v", err)
			}
			assertPromiseStagingAbsent(t, bundle, run.Name)
			for _, deadline := range fake.deadlines {
				if !deadline.Equal(fake.deadlines[0]) {
					t.Fatal("run deadline was reset per step")
				}
			}
		})
	}
}

func TestPromiseAmbiguousCreateStillCleansOwnedContainer(t *testing.T) {
	for _, stderr := range []bool{false, true} {
		t.Run(fmt.Sprint(stderr), func(t *testing.T) {
			inputs := promiseLifecycleInputs(t)
			fake := &promiseFakeDocker{inputs: inputs, malformedCreate: !stderr, createStderr: stderr}
			bundle := promiseTestBundle(t)
			run, err := runPromiseContainer(context.Background(), inputs, bundle, fake, 1)
			if err == nil || fake.present || !run.CleanupVerified || run.ContainerID != "" {
				t.Fatalf("ambiguous create: %v %+v present=%v", err, run, fake.present)
			}
		})
	}
}

func TestPromiseCleanupHasIndependentDeadline(t *testing.T) {
	inputs := promiseLifecycleInputs(t)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	fake := &promiseFakeDocker{inputs: inputs, fail: "build", cancel: cancel}
	run, err := runPromiseContainer(ctx, inputs, promiseTestBundle(t), fake, 1)
	if err == nil || fake.cleanupCanceled || fake.present || !run.CleanupVerified {
		t.Fatalf("cancellation cleanup: %v %+v", err, run)
	}
}

func TestPromiseCleanupDoesNotRemoveOtherOwnership(t *testing.T) {
	inputs := promiseLifecycleInputs(t)
	fake := &promiseFakeDocker{inputs: inputs, fail: "build", wrongOwner: true}
	run, err := runPromiseContainer(context.Background(), inputs, promiseTestBundle(t), fake, 1)
	if err == nil || !fake.present || run.CleanupVerified {
		t.Fatalf("ownership guard: %v %+v", err, run)
	}
	for _, request := range fake.calls {
		if request.operation == "remove" {
			t.Fatal("removed a container with another owner label")
		}
	}
}

func TestPromiseCleanupFailureNeverReportsSuccess(t *testing.T) {
	for _, operation := range []string{"find-owned", "inspect-owner", "remove", "verify-absence"} {
		t.Run(operation, func(t *testing.T) {
			inputs := promiseLifecycleInputs(t)
			fake := &promiseFakeDocker{inputs: inputs, fail: operation}
			run, err := runPromiseContainer(context.Background(), inputs, promiseTestBundle(t), fake, 1)
			if err == nil || run.CleanupVerified || !run.StagingRemoved {
				t.Fatalf("cleanup failure: %v %+v", err, run)
			}
		})
	}
}

func TestPromiseStagingUsesPrivateParentAndReadonlyWheels(t *testing.T) {
	inputs := promiseLifecycleInputs(t)
	bundle := promiseTestBundle(t)
	name := "20w-promise-" + strings.Repeat("1", 32)
	staging, err := stagePromiseWheels(bundle, name, inputs)
	if err != nil {
		t.Fatal(err)
	}
	// The read-only wheel is portable: Windows reports its attribute as 0o444.
	wheel := "wheelhouse/" + inputs.manifest.SourceBuild.BuildRequirements[0].Filename
	if info, err := staging.Stat(wheel); err != nil || info.Mode().Perm() != 0o444 {
		t.Fatalf("mode %s: %v %v", wheel, info, err)
	}
	t.Run("private directories", func(t *testing.T) {
		requirePOSIXModeBits(t, "the staging parent and wheelhouse directory modes")
		for path, want := range map[string]os.FileMode{".": 0o700, "wheelhouse": 0o755} {
			info, err := staging.Stat(path)
			if err != nil || info.Mode().Perm() != want {
				t.Fatalf("mode %s: %v %v", path, info, err)
			}
		}
	})
	if err := removePromiseStaging(bundle, name, staging); err != nil {
		t.Fatal(err)
	}
	assertPromiseStagingAbsent(t, bundle, name)
}

func assertPromiseStagingAbsent(t *testing.T, bundle *os.Root, name string) {
	t.Helper()
	if _, err := bundle.Stat(name); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("staging remains: %v", err)
	}
}

func TestPromisePreflightRejectsInputBeforeEffects(t *testing.T) {
	inputs := t.TempDir()
	if err := os.Mkdir(filepath.Join(inputs, "source-build-inputs"), 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(inputs, "source-build-inputs/promise-2.3.tar.gz"), []byte("tampered"), 0o600); err != nil {
		t.Fatal(err)
	}
	fake := &promiseFakeDocker{}
	output := filepath.Join(t.TempDir(), "evidence")
	err := reproducePromiseWheel(context.Background(), trackedRepositoryRoot(t), inputs, output, fake)
	if err == nil || len(fake.calls) != 0 {
		t.Fatalf("preflight: %v calls=%d", err, len(fake.calls))
	}
	if _, err := os.Lstat(output); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("preflight created output: %v", err)
	}
}

func TestPromiseBundleRejectsExistingAndInputChild(t *testing.T) {
	inputs := t.TempDir()
	for _, output := range []string{inputs, filepath.Join(inputs, "new"), t.TempDir()} {
		if root, err := newPromiseBundle(output, inputs); err == nil {
			root.Close()
			t.Fatalf("accepted %s", output)
		}
	}
}

func TestPromiseReceiptSourceClosureCoversExistingHelpers(t *testing.T) {
	inputs := promiseLifecycleInputs(t)
	procedure, err := currentPromiseProcedure(trackedRepositoryRoot(t), inputs)
	if err != nil {
		t.Fatal(err)
	}
	paths := make([]string, 0, len(procedure.Sources))
	for _, source := range procedure.Sources {
		paths = append(paths, source.Path)
	}
	for _, path := range []string{"tooling/cmd/20w/main.go", "tooling/internal/clrsfixture/image_files.go", "tooling/internal/clrsfixture/image_wheelhouse.go", "tooling/internal/strictjson/validate.go", "tooling/internal/pdfrenderlock/lock.go", "tooling/internal/buildinfo/buildinfo.go",
		"tooling/internal/experimentcli/catalog.go", "tooling/internal/experimentcli/cli.go", "tooling/internal/experimentcli/clrs_compare.go", "tooling/internal/experimentcli/clrs_context.go", "tooling/internal/experimentcli/clrs_invocation.go", "tooling/internal/experimentcli/clrs_promise.go", "tooling/internal/experimentcli/clrs_sbom.go", "tooling/internal/experimentcli/clrs_wheelhouse.go", "tooling/internal/experimentcli/node_image.go"} {
		if !slices.Contains(paths, path) {
			t.Fatalf("missing procedure dependency %s", path)
		}
	}
	if slices.Contains(paths, "tooling/cmd/20w/clrs_promise.go") || !slices.IsSorted(paths) {
		t.Fatal("current procedure includes the retired CLI path or unsorted sources")
	}
	second, err := currentPromiseProcedure(trackedRepositoryRoot(t), inputs)
	if err != nil || !reflect.DeepEqual(procedure, second) {
		t.Fatalf("procedure identity not stable: %v", err)
	}
}

func TestPromiseCaptureSharesAndEnforcesOutputLimit(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	capture := &promiseCapture{remaining: 8, cancel: cancel}
	stdout := promiseCaptureWriter{capture: capture}
	stderr := promiseCaptureWriter{capture: capture, stderr: true}
	_, _ = stdout.Write([]byte("12345"))
	_, _ = stderr.Write([]byte("abcdef"))
	if !capture.exceeded || ctx.Err() == nil || capture.stdout.Len()+capture.stderr.Len() != 8 {
		t.Fatalf("combined output cap not enforced: %+v", capture)
	}
}
