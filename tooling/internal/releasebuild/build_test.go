package releasebuild

import (
	"bytes"
	"context"
	"debug/buildinfo"
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
	"runtime/debug"
	"slices"
	"strings"
	"testing"
	"time"
)

func TestArtifactsAreClosedSortedAndUnique(t *testing.T) {
	t.Parallel()
	artifacts := Artifacts()
	if len(artifacts) != 1 {
		t.Fatalf("Artifacts() returned %d targets, want 1", len(artifacts))
	}
	seen := make(map[string]bool, len(artifacts))
	for index, artifact := range artifacts {
		if artifact.Name == "" || artifact.OS == "" || artifact.Arch == "" {
			t.Fatalf("artifact %d is incomplete: %+v", index, artifact)
		}
		if seen[artifact.Name] {
			t.Fatalf("duplicate artifact name %q", artifact.Name)
		}
		seen[artifact.Name] = true
		if index > 0 && artifacts[index-1].Name >= artifact.Name {
			t.Fatalf("artifact plan is not sorted: %q before %q", artifacts[index-1].Name, artifact.Name)
		}
	}
	if artifacts[0] != (Artifact{Name: "20w-linux-amd64", OS: "linux", Arch: "amd64"}) {
		t.Fatalf("Artifacts()[0] = %+v, want the exercised Linux amd64 target", artifacts[0])
	}
}

func TestValidateRejectsUnboundIdentity(t *testing.T) {
	t.Parallel()
	valid := Options{
		ModuleRoot: ".",
		OutputRoot: "release-inputs",
		Version:    "v1.2.3",
		Revision:   "0123456789abcdef0123456789abcdef01234567",
		BuiltAt:    "2026-08-29T12:30:00+02:00",
	}
	if err := Validate(valid); err != nil {
		t.Fatalf("Validate(valid) returned %v", err)
	}

	cases := []Options{
		{ModuleRoot: ".", OutputRoot: "release-inputs", Version: "1.2.3", Revision: valid.Revision, BuiltAt: valid.BuiltAt},
		{ModuleRoot: ".", OutputRoot: "release-inputs", Version: valid.Version, Revision: "main", BuiltAt: valid.BuiltAt},
		{ModuleRoot: ".", OutputRoot: "release-inputs", Version: valid.Version, Revision: valid.Revision, BuiltAt: "now"},
		{OutputRoot: "release-inputs", Version: valid.Version, Revision: valid.Revision, BuiltAt: valid.BuiltAt},
		{ModuleRoot: ".", Version: valid.Version, Revision: valid.Revision, BuiltAt: valid.BuiltAt},
	}
	for index, options := range cases {
		if err := Validate(options); err == nil {
			t.Fatalf("Validate(cases[%d]) unexpectedly passed", index)
		}
	}
}

func TestClosedBuildEnvironmentScrubsHostileGoOverrides(t *testing.T) {
	t.Parallel()
	got := closedBuildEnvironment([]string{
		"PATH=/bin",
		"HOME=/home/test",
		"GOOS=plan9",
		"GOARCH=386",
		"GOAMD64=v4",
		"GOARM64=v9.5,lse",
		"GOENV=/tmp/hostile",
		"GOEXPERIMENT=fieldtrack",
		"GOFIPS140=latest",
		"GOFLAGS=-toolexec=hostile",
		"GOPROXY=https://hostile.invalid",
		"GOTOOLCHAIN=auto",
		"GOWORK=/tmp/hostile.work",
		"CGO_ENABLED=1",
	}, Artifact{OS: "linux", Arch: "amd64"})
	wantGo := map[string]string{
		"CGO_ENABLED":  "0",
		"GOAMD64":      "v1",
		"GOARCH":       "amd64",
		"GOARM64":      "v8.0",
		"GOENV":        "off",
		"GOEXPERIMENT": "",
		"GOFIPS140":    "off",
		"GOFLAGS":      "",
		"GONOPROXY":    "",
		"GONOSUMDB":    "",
		"GOPRIVATE":    "",
		"GOPROXY":      "off",
		"GOSUMDB":      "off",
		"GOOS":         "linux",
		"GOTOOLCHAIN":  "local",
		"GOWORK":       "off",
	}
	seen := make(map[string]string, len(got))
	for _, entry := range got {
		name, value, found := strings.Cut(entry, "=")
		if !found {
			t.Fatalf("closedBuildEnvironment() returned malformed entry %q", entry)
		}
		if _, duplicate := seen[name]; duplicate {
			t.Fatalf("closedBuildEnvironment() returned duplicate %q", name)
		}
		seen[name] = value
	}
	for name, value := range wantGo {
		if seen[name] != value {
			t.Fatalf("closedBuildEnvironment()[%s] = %q, want %q", name, seen[name], value)
		}
	}
	if seen["PATH"] != "/bin" || seen["HOME"] != "/home/test" {
		t.Fatalf("closedBuildEnvironment() removed required host basics: %q", got)
	}
}

func TestBuildArgumentsPinDeterministicSettings(t *testing.T) {
	t.Parallel()
	arguments := buildArguments("/output/20w", "-s -w -buildid=")
	for _, required := range []string{"-buildmode=exe", "-compiler=gc", "-trimpath", "-buildvcs=false", "-mod=readonly", "-pgo=off"} {
		if !slices.Contains(arguments, required) {
			t.Fatalf("buildArguments() = %q, missing %q", arguments, required)
		}
	}
	if !slices.Contains(arguments, "-s -w -buildid=") {
		t.Fatalf("buildArguments() = %q, missing empty build ID", arguments)
	}
}

func TestHostileGoEnvironmentsProduceByteIdenticalBinary(t *testing.T) {
	t.Parallel()
	moduleRoot, err := filepath.Abs(filepath.Join("..", ".."))
	if err != nil {
		t.Fatal(err)
	}
	goBinary, err := exec.LookPath("go")
	if err != nil {
		t.Fatal(err)
	}
	artifact := Artifact{Name: "20w-linux-amd64", OS: "linux", Arch: "amd64"}
	hostileEnvironments := [][]string{
		append(slices.Clone(os.Environ()),
			"GOAMD64=v1", "GOARM64=v8.0", "GOFIPS140=off", "GOWORK=off"),
		append(slices.Clone(os.Environ()),
			"GOAMD64=v4", "GOARM64=v9.5,lse", "GOFIPS140=latest", "GOWORK=/tmp/hostile.work"),
	}
	digests := make([][32]byte, 0, len(hostileEnvironments))
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Minute)
	defer cancel()
	for index, environment := range hostileEnvironments {
		outputPath := filepath.Join(t.TempDir(), "20w")
		result, buildErr := runBoundedCommand(
			ctx,
			moduleRoot,
			closedBuildEnvironment(environment, artifact),
			goBinary,
			buildArguments(outputPath, "-s -w -buildid=")...,
		)
		if buildErr != nil {
			t.Fatal(commandError("hostile-environment build", buildErr, result))
		}
		digest, digestErr := digestBoundedFile(outputPath)
		if digestErr != nil {
			t.Fatalf("digest hostile-environment build %d: %v", index, digestErr)
		}
		digests = append(digests, digest)
	}
	if digests[0] != digests[1] {
		t.Fatalf("hostile Go overrides changed release bytes: %x != %x", digests[0], digests[1])
	}
}

func TestVerifyBuildSettingsRequiresExactOfficialToolchain(t *testing.T) {
	t.Parallel()
	artifact := Artifact{Name: "20w-linux-amd64", OS: "linux", Arch: "amd64"}
	valid := &buildinfo.BuildInfo{
		GoVersion: releaseGoVersion,
		Settings: []debug.BuildSetting{
			{Key: "-buildmode", Value: "exe"},
			{Key: "-compiler", Value: "gc"},
			{Key: "-trimpath", Value: "true"},
			{Key: "CGO_ENABLED", Value: "0"},
			{Key: "GOARCH", Value: "amd64"},
			{Key: "GOOS", Value: "linux"},
			{Key: "GOAMD64", Value: "v1"},
		},
	}
	if err := verifyBuildSettings(valid, artifact); err != nil {
		t.Fatalf("verifyBuildSettings(valid) returned %v", err)
	}

	withExperiment := *valid
	withExperiment.Settings = append(slices.Clone(valid.Settings), debug.BuildSetting{Key: "GOEXPERIMENT", Value: "hostile"})
	if err := verifyBuildSettings(&withExperiment, artifact); err == nil {
		t.Fatal("verifyBuildSettings() accepted an extra experiment")
	}
	wrongVersion := *valid
	wrongVersion.GoVersion = "go1.27.0"
	if err := verifyBuildSettings(&wrongVersion, artifact); err == nil {
		t.Fatal("verifyBuildSettings() accepted a different Go toolchain")
	}
}

func TestGoReleaseMetadataIsDeterministicAndVersionBound(t *testing.T) {
	t.Parallel()
	options := Options{
		Version:  "v1.2.3",
		Revision: "0123456789abcdef0123456789abcdef01234567",
		BuiltAt:  "2026-08-29T12:30:00+02:00",
	}
	dependencies := []dependency{{
		Path:    goldmarkModule,
		Version: goldmarkVersion,
		Sum:     "h1:fixture",
	}}
	first, err := renderGoSBOM(options, dependencies)
	if err != nil {
		t.Fatalf("renderGoSBOM() error = %v", err)
	}
	second, err := renderGoSBOM(options, dependencies)
	if err != nil {
		t.Fatalf("second renderGoSBOM() error = %v", err)
	}
	if !bytes.Equal(first, second) {
		t.Fatal("renderGoSBOM() is not deterministic")
	}
	var document struct {
		DocumentNamespace string `json:"documentNamespace"`
		CreationInfo      struct {
			Created string `json:"created"`
		} `json:"creationInfo"`
		Packages []struct {
			Name string `json:"name"`
		} `json:"packages"`
	}
	if err := json.Unmarshal(first, &document); err != nil {
		t.Fatalf("decode rendered SPDX: %v", err)
	}
	if document.DocumentNamespace != "https://github.com/cordanaLLM/20-watts-was-enough/releases/download/v1.2.3/20w-go-modules.spdx.json" {
		t.Fatalf("unexpected namespace %q", document.DocumentNamespace)
	}
	if document.CreationInfo.Created != "2026-08-29T10:30:00Z" {
		t.Fatalf("unexpected creation time %q", document.CreationInfo.Created)
	}
	if len(document.Packages) != 2 || document.Packages[1].Name != goldmarkModule {
		t.Fatalf("unexpected package inventory: %+v", document.Packages)
	}

	notice := renderGoNotices(dependencies[0], []byte("MIT fixture\n"), "abc123")
	if !bytes.Contains(notice, []byte(goldmarkModule+"@"+goldmarkVersion)) || !bytes.HasSuffix(notice, []byte("MIT fixture\n")) {
		t.Fatalf("renderGoNotices() omitted identity or licence: %q", notice)
	}
}
