package clrsfixture

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"reflect"
	"slices"
	"sync"
	"testing"
	"time"
)

var loadedImageExitFixture struct {
	sync.Once
	err error
}

func TestLoadedImageExitHelper(t *testing.T) {
	if os.Getenv("TWENTY_WATTS_LOADED_IMAGE_EXIT_HELPER") == "1" {
		os.Exit(1)
	}
}

func loadedImageTestExit(t *testing.T) error {
	t.Helper()
	loadedImageExitFixture.Do(func() {
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		command := exec.CommandContext(ctx, os.Args[0], "-test.run=^TestLoadedImageExitHelper$")
		command.Env = []string{"TWENTY_WATTS_LOADED_IMAGE_EXIT_HELPER=1"}
		loadedImageExitFixture.err = command.Run()
	})
	var exit *exec.ExitError
	if !errors.As(loadedImageExitFixture.err, &exit) || exit.ExitCode() != 1 {
		t.Fatalf("fake-child exit fixture: %v", loadedImageExitFixture.err)
	}
	return loadedImageExitFixture.err
}

type loadedImageFake struct {
	t         *testing.T
	proof     GeneratorOCIReport
	runtime   GeneratorRuntime
	images    map[string][]byte
	calls     [][]string
	interlock func(int, []string, *generationCommandEvidence) error
}

func loadedImageTestFixture(t *testing.T) (GeneratorLoadedImageOptions, *loadedImageFake) {
	t.Helper()
	archive, members, _, _, _ := ociTestFixture(t, true, 2)
	archive = ociTestWrite(t, archive, ociTestTar(t, members))
	proof, err := InspectGeneratorOCIArchive(context.Background(), archive)
	if err != nil {
		t.Fatal(err)
	}
	inputs, err := loadInvocationInputs(context.Background(), archive.RepositoryRoot)
	if err != nil {
		t.Fatal(err)
	}
	fake := &loadedImageFake{t: t, proof: proof, runtime: inputs.image.Runtime, images: map[string][]byte{}}
	fake.images[proof.Manifest.Digest] = fake.inspection(proof.Manifest.Digest)
	return GeneratorLoadedImageOptions{Archive: archive, OutputDirectory: filepath.Join(t.TempDir(), "handoff")}, fake
}

func (fake *loadedImageFake) inspection(id string) []byte {
	fake.t.Helper()
	expected, err := parseGenerationRunImage(fake.proof.ManifestBytes, fake.proof.ConfigBytes, GeneratorFixtureImage{
		LoadedID: id, ManifestDigest: fake.proof.Manifest.Digest, ConfigDigest: fake.proof.Config.Digest}, fake.runtime)
	if err != nil {
		fake.t.Fatal(err)
	}
	return generationDockerTestJSON(fake.t, expected)
}

func (fake *loadedImageFake) execute(ctx context.Context, args []string, sink io.Writer, limit int64) (generationCommandEvidence, error) {
	fake.t.Helper()
	deadline, present := ctx.Deadline()
	if !present || time.Until(deadline) > 15*time.Second || sink != nil || limit != 64<<10 || !loadedImageReadOnlyArguments(args) {
		fake.t.Fatal("executor received an unbounded or mutating operation")
	}
	fake.calls = append(fake.calls, slices.Clone(args))
	record := generationCommandEvidence{Arguments: append([]string{testAbsolutePath("test", "docker"), "--host", generationDockerEndpoint}, args...)}
	var err error
	switch args[0] {
	case "version":
		record.Stdout = []byte("29.7.2 29.7.2\n")
	case "info":
		record.Stdout = generationImageJSON(fake.t, map[string]any{"OSType": "linux", "CgroupVersion": "2", "MemoryLimit": true,
			"SwapLimit": true, "CpuCfsPeriod": true, "CpuCfsQuota": true, "PidsLimit": true, "Runtimes": map[string]any{"runc": map[string]any{}}})
	case "image":
		if body, present := fake.images[args[4]]; present {
			record.Stdout = bytes.Clone(body)
		} else {
			record.ExitCode, record.Stdout = 1, []byte("\n")
			record.Stderr = []byte("Error response from daemon: No such image: " + args[4] + "\n")
			err = loadedImageTestExit(fake.t)
		}
	}
	if fake.interlock != nil {
		err = errors.Join(err, fake.interlock(len(fake.calls), args, &record))
	}
	return record, err
}

func TestLoadedImagePreparationAndExactMetadataHandoff(t *testing.T) {
	for _, mode := range []string{"manifest-id", "config-id", "both-same-manifest-id", "both-same-config-id"} {
		t.Run(mode, func(t *testing.T) {
			options, fake := loadedImageTestFixture(t)
			id := fake.proof.Manifest.Digest
			if mode == "config-id" || mode == "both-same-config-id" {
				id = fake.proof.Config.Digest
				fake.images = map[string][]byte{id: fake.inspection(id)}
			}
			if mode == "both-same-manifest-id" || mode == "both-same-config-id" {
				fake.images[fake.proof.Manifest.Digest], fake.images[fake.proof.Config.Digest] = fake.inspection(id), fake.inspection(id)
			}
			before, _ := os.Stat(options.Archive.ArchivePath)
			report, err := prepareGeneratorLoadedImage(context.Background(), options, fake.execute, nil)
			if err != nil || report.State != "loaded-image-bound-unadmitted" || report.Authority != ResultAuthority || report.ImageAdmitted || report.DockerMutated || report.LoadedImageID != id || report.DockerCalls != 4 {
				t.Fatalf("report=%#v error=%v", report, err)
			}
			if len(report.Files) != 5 || report.ManifestDigest == report.ConfigDigest || report.Producer.ExecutableSHA256 == "" {
				t.Fatal("handoff lost original identities or retained file inventory")
			}
			for path, expected := range map[string][]byte{report.ManifestFile: fake.proof.ManifestBytes, report.ConfigFile: fake.proof.ConfigBytes} {
				body, err := os.ReadFile(path)
				if err != nil || !bytes.Equal(body, expected) {
					t.Fatalf("original metadata %s: %v", path, err)
				}
			}
			if _, err := parseGenerationRunImage(fake.proof.ManifestBytes, fake.proof.ConfigBytes, report.FixtureImage(), fake.runtime); err != nil {
				t.Fatalf("generation rejected emitted handoff: %v", err)
			}
			body, err := os.ReadFile(filepath.Join(options.OutputDirectory, "receipt.json"))
			var retained GeneratorLoadedImageReport
			if err != nil || json.Unmarshal(body, &retained) != nil || !reflect.DeepEqual(report, retained) {
				t.Fatalf("retained report differs: %v", err)
			}
			for _, file := range report.Files {
				body, err := os.ReadFile(filepath.Join(options.OutputDirectory, file.Path))
				if err != nil || rawSHA256(body) != file.SHA256 || int64(len(body)) != file.SizeBytes {
					t.Fatalf("file identity differs: %s %v", file.Path, err)
				}
			}
			entries, err := os.ReadDir(options.OutputDirectory)
			if err != nil || len(entries) != 6 {
				t.Fatalf("unexpected final inventory: %v %v", entries, err)
			}
			after, _ := os.Stat(options.Archive.ArchivePath)
			if !unchangedGeneratorFile(before, after) {
				t.Fatal("preparation changed the archive")
			}
		})
	}
}

func assertLoadedImageFailure(t *testing.T, report GeneratorLoadedImageReport, err error) {
	t.Helper()
	if err == nil || report.State != "incomplete" || report.Error == "" || report.Authority != ResultAuthority || report.ImageAdmitted || report.DockerMutated || report.FixtureImage() != (GeneratorFixtureImage{}) || report.LoadedImageID != "" || report.ManifestFile != "" || report.ConfigFile != "" {
		t.Fatalf("failure retained a usable handoff: report=%#v error=%v", report, err)
	}
}

func TestLoadedImageMissingOrAmbiguousAndEveryCommandFailure(t *testing.T) {
	for _, mode := range []string{"both-missing", "different-ids", "failure-1", "failure-2", "failure-3", "failure-4"} {
		t.Run(mode, func(t *testing.T) {
			options, fake := loadedImageTestFixture(t)
			if mode == "both-missing" {
				fake.images = map[string][]byte{}
			}
			if mode == "different-ids" {
				fake.images[fake.proof.Config.Digest] = fake.inspection(fake.proof.Config.Digest)
			}
			fake.interlock = func(index int, _ []string, _ *generationCommandEvidence) error {
				if mode == fmt.Sprintf("failure-%d", index) {
					return errors.New("injected command failure")
				}
				return nil
			}
			report, err := prepareGeneratorLoadedImage(context.Background(), options, fake.execute, nil)
			assertLoadedImageFailure(t, report, err)
			body, readErr := os.ReadFile(filepath.Join(options.OutputDirectory, "receipt.json"))
			var receipt GeneratorLoadedImageReport
			if readErr != nil || json.Unmarshal(body, &receipt) != nil || receipt.State != "incomplete" || receipt.Error == "" || len(fake.calls) > 4 {
				t.Fatalf("failure evidence: %s %v", body, readErr)
			}
		})
	}
}
