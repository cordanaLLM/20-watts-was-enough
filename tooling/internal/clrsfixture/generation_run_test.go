package clrsfixture

import (
	"archive/tar"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"reflect"
	"slices"
	"strings"
	"testing"
	"time"
)

func generationRunFixture(t *testing.T) (GeneratorFixtureRunOptions, generationRunInputs, []byte) {
	t.Helper()
	repository, err := filepath.Abs("../../..")
	if err != nil {
		t.Fatal(err)
	}
	authority, err := loadInvocationInputs(context.Background(), repository)
	if err != nil {
		t.Fatal(err)
	}
	manifest, config, _ := generationImageFixture(t)
	c := config["config"].(map[string]any)
	c["Env"], c["Entrypoint"] = authority.image.Runtime.Environment, authority.image.Runtime.Entrypoint
	body := generationImageJSON(t, config)
	raw, image := generationImagePair(t, manifest, body)
	root := t.TempDir()
	image.ManifestFile, image.ConfigFile = filepath.Join(root, "manifest.json"), filepath.Join(root, "config.json")
	writeComparisonTestFile(t, root, "manifest.json", raw)
	writeComparisonTestFile(t, root, "config.json", body)
	options := GeneratorFixtureRunOptions{RepositoryRoot: repository, OutputDirectory: filepath.Join(root, "run"), Image: image}
	inputs, err := loadGenerationRunInputs(context.Background(), options)
	if err != nil {
		t.Fatal(err)
	}
	return options, inputs, generationTestTar(t, inputs, nil)
}

func generationTestTar(t *testing.T, inputs generationRunInputs, change func(*tar.Header, *[]byte)) []byte {
	t.Helper()
	var buffer bytes.Buffer
	writer := tar.NewWriter(&buffer)
	for _, path := range inputs.invocation.ExpectedPaths {
		var content []byte
		for _, task := range ShakedownTasks() {
			fixture := newImportFixture(t, task)
			if fixture.task.OutputRelativePath == path {
				content = marshalDataset(t, completeDataset(fixture))
			}
		}
		r := inputs.authority.image.Runtime
		header := &tar.Header{Name: path, Typeflag: tar.TypeReg, Format: tar.FormatUSTAR, Mode: 0o644,
			Uid: r.UID, Gid: r.GID, ModTime: time.Unix(inputs.authority.image.Builder.SourceDateEpoch, 0), Size: int64(len(content))}
		if change != nil {
			change(header, &content)
		}
		if err := writer.WriteHeader(header); err != nil {
			t.Fatal(err)
		}
		if _, err := writer.Write(content); err != nil {
			t.Fatal(err)
		}
	}
	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}
	return buffer.Bytes()
}

type generationFake struct {
	t               *testing.T
	inputs          generationRunInputs
	tar             []byte
	name, id        string
	exists, running bool
	calls           [][]string
	failAt          int
	interlock       func(int, []string, *generationCommandEvidence)
}

func (fake *generationFake) execute(ctx context.Context, args []string, sink io.Writer, limit int64) (generationCommandEvidence, error) {
	fake.calls = append(fake.calls, slices.Clone(args))
	record := generationCommandEvidence{Arguments: append([]string{testAbsolutePath("usr", "bin", "docker"), "--host", generationDockerEndpoint}, args...)}
	switch {
	case args[0] == "version":
		record.Stdout = []byte("29.7.2 29.7.2\n")
	case args[0] == "info":
		record.Stdout = generationImageJSON(fake.t, map[string]any{"OSType": "linux", "CgroupVersion": "2", "MemoryLimit": true,
			"SwapLimit": true, "CpuCfsPeriod": true, "CpuCfsQuota": true, "PidsLimit": true, "Runtimes": map[string]any{"runc": map[string]any{}}})
	case args[0] == "image":
		record.Stdout = generationDockerTestJSON(fake.t, fake.inputs.image)
	case args[1] == "ls":
		if fake.exists {
			record.Stdout = []byte(fake.id + " " + fake.name + "\n")
		}
	case args[1] == "create":
		fake.name, fake.id, fake.exists = args[3], strings.Repeat("a", 64), true
		record.Stdout = []byte(fake.id + "\n")
	case args[1] == "start":
		fake.running = true
		record.Stdout = []byte(fake.id + "\n")
	case args[1] == "inspect":
		record.Stdout = generationDockerTestJSON(fake.t, fake.inspection())
	case args[1] == "exec":
		if sink == nil {
			record.Stdout = []byte(generationCompletion)
		} else {
			if int64(len(fake.tar)) > limit {
				return record, errors.New("fake tar output exceeds limit")
			}
			if _, err := sink.Write(fake.tar); err != nil {
				return record, err
			}
		}
	case args[1] == "stop":
		fake.running = false
	case args[1] == "rm":
		fake.exists = false
	default:
		fake.t.Fatalf("unexpected fake Docker arguments: %v", args)
	}
	if fake.interlock != nil {
		fake.interlock(len(fake.calls), args, &record)
	}
	if len(fake.calls) == fake.failAt {
		record.ExitCode, record.Error = 1, "injected command failure"
		return record, errors.New(record.Error)
	}
	return record, ctx.Err()
}

func generationDockerTestJSON(t *testing.T, value any) []byte {
	t.Helper()
	var object map[string]any
	if err := json.Unmarshal(generationImageJSON(t, value), &object); err != nil {
		t.Fatal(err)
	}
	object["Id"] = object["ID"]
	delete(object, "ID")
	return generationImageJSON(t, object)
}

func (fake *generationFake) inspection() generationContainerInspection {
	var value generationContainerInspection
	r := fake.inputs.authority.image.Runtime
	value.ID, value.Name, value.Image = fake.id, "/"+fake.name, fake.inputs.image.ID
	value.Config = fake.inputs.image.Config
	c := &value.Config
	c.Image, c.Entrypoint, c.Cmd = value.Image, []string{fake.inputs.invocation.PythonExecutable}, generationIdleArguments(r)
	c.Labels, c.StopTimeout, c.StopSignal = map[string]string{generationOwnerLabel: fake.name}, &r.StopGraceSeconds, "SIGTERM"
	value.State.Running, value.State.Status = fake.running, "created"
	if fake.running {
		value.State.Status = "running"
	}
	value.NetworkSettings.Networks = map[string]json.RawMessage{r.Network: json.RawMessage("{}")}
	h := &value.HostConfig
	h.ReadonlyRootfs, h.Runtime, h.NetworkMode = true, "runc", r.Network
	h.Memory, h.MemorySwap, h.NanoCpus = r.MemoryBytes, r.MemoryBytes, int64(r.CPUMillis)*1000000
	pids := int64(r.PIDs)
	h.PidsLimit = &pids
	h.RestartPolicy.Name, h.LogConfig.Type = "no", "none"
	h.CapDrop, h.SecurityOpt = []string{"ALL"}, []string{"no-new-privileges"}
	h.IpcMode, h.CgroupnsMode = "none", "private"
	h.Tmpfs = map[string]string{r.TemporaryRoot: generationTmpfs(r.TemporaryBytes), r.OutputRoot: generationTmpfs(r.OutputBytes)}
	return value
}

func TestGenerationRunAndReadOnlyCheck(t *testing.T) {
	options, inputs, archive := generationRunFixture(t)
	fake := &generationFake{t: t, inputs: inputs, tar: archive}
	report, err := runGeneratorFixtures(context.Background(), options, fake.execute)
	if err != nil {
		t.Fatal(err)
	}
	if report.State != "fixtures-generated-unadmitted" || report.Authority != ResultAuthority || !report.CleanupVerified ||
		report.ImportedExamples != 48 || len(report.Files) != 6 || fake.exists || len(fake.calls) != 19 {
		t.Fatalf("invalid successful run: %#v, calls=%d", report, len(fake.calls))
	}
	generationLinuxTestReceipt(t, options, inputs, &report)
	before := comparisonTestInventory(t, options.OutputDirectory)
	first, err := CheckGeneratorFixtureRun(context.Background(), options)
	if err != nil {
		t.Fatal(err)
	}
	second, err := CheckGeneratorFixtureRun(context.Background(), options)
	if err != nil || !reflect.DeepEqual(first, second) || first.State != "bundle-consistent-unadmitted" || first.TreeSHA256 != report.TreeSHA256 {
		t.Fatalf("non-deterministic check: %#v %v", first, err)
	}
	if after := comparisonTestInventory(t, options.OutputDirectory); !reflect.DeepEqual(before, after) {
		t.Fatal("check wrote or changed input files")
	}
	if _, err := runGeneratorFixtures(context.Background(), options, fake.execute); err == nil || len(fake.calls) != 19 {
		t.Fatal("existing output overwritten or command executed")
	}
	if !slices.Contains(fake.calls[4], "--pull=never") || !slices.Contains(fake.calls[4], "runc") {
		t.Fatal("missing exact no-pull/runc arguments")
	}
	if got := fake.calls[8][len(fake.calls[8])-1]; got != inputs.invocation.Program {
		t.Fatal("arbitrary or changed program was executed")
	}
}

func TestGenerationRunEveryCommandFailureRetainsFailureReceipt(t *testing.T) {
	for failure := 1; failure <= 19; failure++ {
		t.Run(fmt.Sprint(failure), func(t *testing.T) {
			options, inputs, archive := generationRunFixture(t)
			fake := &generationFake{t: t, inputs: inputs, tar: archive, failAt: failure}
			report, err := runGeneratorFixtures(context.Background(), options, fake.execute)
			if err == nil || report.State != "failed" || report.Error == "" || report.ImportedExamples != 0 || report.TreeSHA256 != "" {
				t.Fatalf("failure looked successful: %#v %v", report, err)
			}
			body, err := os.ReadFile(filepath.Join(options.OutputDirectory, "receipt.json"))
			if err != nil {
				t.Fatal(err)
			}
			var retained GeneratorFixtureRun
			if err := decodeCanonicalGeneratorJSON(body, 20, &retained); err != nil || retained.State != "failed" {
				t.Fatalf("missing failed durable receipt: %v", err)
			}
			if len(fake.calls) > 24 {
				t.Fatal("finite command budget exceeded")
			}
			if _, err := CheckGeneratorFixtureRun(context.Background(), options); err == nil {
				t.Fatal("failed/partial bundle checked successfully")
			}
		})
	}
}
