package clrsfixture

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"reflect"
	"sort"
	"strings"

	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/buildinfo"
)

type promiseFileIdentity struct {
	Path      string `json:"path"`
	SHA256    string `json:"sha256"`
	SizeBytes int64  `json:"size_bytes"`
}

type promiseProducer struct {
	Build               buildinfo.Info `json:"build"`
	ExecutableSHA256    string         `json:"executable_sha256"`
	ExecutableSizeBytes int64          `json:"executable_size_bytes"`
}

type promiseProcedure struct {
	Version               string                    `json:"version"`
	Sources               []promiseFileIdentity     `json:"sources"`
	Platform              string                    `json:"platform"`
	Image                 string                    `json:"image"`
	User                  string                    `json:"user"`
	RunTimeoutSeconds     int                       `json:"run_timeout_seconds"`
	CleanupTimeoutSeconds int                       `json:"cleanup_timeout_seconds"`
	CPUs                  int                       `json:"cpus"`
	MemoryBytes           int64                     `json:"memory_bytes"`
	PIDs                  int                       `json:"pids"`
	CapturedOutputBytes   int64                     `json:"captured_output_bytes"`
	OutputTarBytes        int64                     `json:"output_tar_bytes"`
	Tmpfs                 []string                  `json:"tmpfs"`
	Environment           []string                  `json:"environment"`
	SourceBuild           GeneratorWheelSourceBuild `json:"source_build"`
}

type promiseRunReceipt struct {
	Index              int                 `json:"index"`
	Name               string              `json:"container_name"`
	ContainerID        string              `json:"container_id"`
	ImageID            string              `json:"image_id"`
	SourceTarSHA256    string              `json:"source_tar_sha256"`
	SourceTarSizeBytes int64               `json:"source_tar_size_bytes"`
	CleanupVerified    bool                `json:"container_absence_verified"`
	StagingRemoved     bool                `json:"staging_removed"`
	Wheel              promiseFileIdentity `json:"wheel"`
	LicenseSHA256      string              `json:"license_sha256"`
	Log                promiseFileIdentity `json:"log"`
}

type promiseReceipt struct {
	SchemaVersion       int                 `json:"schema_version"`
	Authority           string              `json:"authority"`
	State               string              `json:"state"`
	GeneratorImageState string              `json:"generator_image_state"`
	WheelhouseSHA256    string              `json:"wheelhouse_sha256"`
	ImageContractSHA256 string              `json:"image_contract_sha256"`
	Procedure           promiseProcedure    `json:"procedure"`
	Producer            promiseProducer     `json:"producer"`
	Runs                []promiseRunReceipt `json:"runs"`
}

var promiseProcedurePaths = []string{
	"tooling/cmd/20w/clrs_promise.go",
	"tooling/cmd/20w/main.go",
	"tooling/go.mod",
	"tooling/go.sum",
	"tooling/internal/buildinfo/buildinfo.go",
	"tooling/internal/pdfrenderlock/lock.go",
	"tooling/internal/strictjson/validate.go",
}

func currentPromiseProcedure(root string, inputs promiseInputs) (promiseProcedure, error) {
	return promiseProcedureForVersion(root, inputs, promiseProcedureVersion)
}

func promiseProcedureForVersion(root string, inputs promiseInputs, version string) (promiseProcedure, error) {
	procedure := promiseProcedure{
		Version: version, Platform: inputs.manifest.Platform,
		Image: inputs.manifest.SourceBuild.BuilderImage, User: "65532:65532",
		RunTimeoutSeconds: 120, CleanupTimeoutSeconds: 30, CPUs: 1, MemoryBytes: 1 << 30, PIDs: 64,
		CapturedOutputBytes: promiseMaximumRunOutputBytes, OutputTarBytes: promiseMaximumOutputTarBytes,
		Tmpfs: promiseTmpfs(), Environment: promiseEnvironment(inputs.manifest.SourceBuild),
		SourceBuild: inputs.manifest.SourceBuild,
	}
	root, err := cleanGeneratorRoot(root)
	if err != nil {
		return promiseProcedure{}, err
	}
	paths, err := promiseSourcePathsForVersion(root, version)
	if err != nil {
		return promiseProcedure{}, err
	}
	for _, path := range paths {
		body, err := readGeneratorFile(root, path, 128<<10)
		if err != nil {
			return promiseProcedure{}, err
		}
		procedure.Sources = append(procedure.Sources, promiseIdentity(path, body))
	}
	return procedure, nil
}

func promiseSourcePaths(root string) ([]string, error) {
	directory := filepath.Join(root, "tooling/internal/clrsfixture")
	if err := rejectGeneratorSymlink(root, directory); err != nil {
		return nil, err
	}
	file, err := os.Open(directory)
	if err != nil {
		return nil, err
	}
	defer file.Close()
	entries, err := file.ReadDir(129)
	if err != nil && !errors.Is(err, io.EOF) {
		return nil, err
	}
	if len(entries) > 128 {
		return nil, errors.New("Promise procedure source directory exceeds its entry limit")
	}
	paths := append([]string(nil), promiseProcedurePaths...)
	for _, entry := range entries {
		if !strings.HasSuffix(entry.Name(), ".go") || strings.HasSuffix(entry.Name(), "_test.go") {
			continue
		}
		paths = append(paths, "tooling/internal/clrsfixture/"+entry.Name())
	}
	sort.Strings(paths)
	return paths, nil
}

func promiseSourcePathsForVersion(root, version string) ([]string, error) {
	switch version {
	case promiseLegacyProcedureVersion:
		return promiseSourcePaths(root)
	case promiseProcedureVersion:
	default:
		return nil, fmt.Errorf("unsupported Promise procedure version %q", version)
	}
	paths, err := promiseSourcePaths(root)
	if err != nil {
		return nil, err
	}
	current := make([]string, 0, len(paths))
	for _, path := range paths {
		if path != "tooling/cmd/20w/clrs_promise.go" {
			current = append(current, path)
		}
	}
	cli, err := promiseExperimentCLISources(root)
	if err != nil {
		return nil, err
	}
	current = append(current, cli...)
	sort.Strings(current)
	return current, nil
}

func promiseExperimentCLISources(root string) ([]string, error) {
	const relative = "tooling/internal/experimentcli"
	directory := filepath.Join(root, relative)
	if err := rejectGeneratorSymlink(root, directory); err != nil {
		return nil, err
	}
	file, err := os.Open(directory)
	if err != nil {
		return nil, err
	}
	entries, readErr := file.ReadDir(129)
	closeErr := file.Close()
	if readErr != nil && !errors.Is(readErr, io.EOF) {
		return nil, errors.Join(readErr, closeErr)
	}
	if closeErr != nil {
		return nil, closeErr
	}
	if len(entries) > 128 {
		return nil, errors.New("Promise experiment CLI source directory exceeds its entry limit")
	}
	paths := make([]string, 0, len(entries))
	hasDispatch, hasPromise := false, false
	for _, entry := range entries {
		if strings.HasSuffix(entry.Name(), ".go") && !strings.HasSuffix(entry.Name(), "_test.go") {
			paths = append(paths, relative+"/"+entry.Name())
			hasDispatch = hasDispatch || entry.Name() == "cli.go"
			hasPromise = hasPromise || entry.Name() == "clrs_promise.go"
		}
	}
	if !hasDispatch || !hasPromise {
		return nil, errors.New("Promise experiment CLI source directory requires cli.go and clrs_promise.go")
	}
	sort.Strings(paths)
	return paths, nil
}

func currentPromiseProducer() (promiseProducer, error) {
	path, err := os.Executable()
	if err != nil {
		return promiseProducer{}, err
	}
	path, err = filepath.EvalSymlinks(path)
	if err != nil {
		return promiseProducer{}, err
	}
	body, err := readGeneratorFile(filepath.Dir(path), filepath.Base(path), 128<<20)
	if err != nil {
		return promiseProducer{}, fmt.Errorf("read Promise producer executable: %w", err)
	}
	return promiseProducer{buildinfo.Current(), rawSHA256(body), int64(len(body))}, nil
}

func promiseIdentity(path string, body []byte) promiseFileIdentity {
	return promiseFileIdentity{path, rawSHA256(body), int64(len(body))}
}

func marshalPromiseJSON(value any) ([]byte, error) {
	var output bytes.Buffer
	encoder := json.NewEncoder(&output)
	encoder.SetEscapeHTML(false)
	encoder.SetIndent("", "  ")
	if err := encoder.Encode(value); err != nil {
		return nil, err
	}
	return output.Bytes(), nil
}

// CheckPromiseWheelReproduction consumes the actual two-wheel evidence bundle
// without subprocesses or writes. This is not an image-admission check.
func CheckPromiseWheelReproduction(repositoryRoot, directory string) error {
	directory, err := cleanGeneratorRoot(directory)
	if err != nil {
		return err
	}
	body, err := readGeneratorFile(directory, "receipt.json", promiseMaximumReceiptBytes)
	if err != nil {
		return err
	}
	var receipt promiseReceipt
	if err := decodeCanonicalGeneratorJSON(body, 12, &receipt); err != nil {
		return fmt.Errorf("parse Promise reproduction receipt: %w", err)
	}
	switch receipt.Procedure.Version {
	case promiseLegacyProcedureVersion, promiseProcedureVersion:
	default:
		return fmt.Errorf("unsupported Promise procedure version %q", receipt.Procedure.Version)
	}
	inputs, err := loadPromiseAuthority(repositoryRoot)
	if err != nil {
		return err
	}
	procedure, err := promiseProcedureForVersion(repositoryRoot, inputs, receipt.Procedure.Version)
	if err != nil {
		return err
	}
	if err := validatePromiseReceipt(receipt, inputs, procedure); err != nil {
		return err
	}
	if err := checkPromiseBundleEntries(directory); err != nil {
		return err
	}
	for _, run := range receipt.Runs {
		if err := checkPromiseRunFiles(directory, run, procedure); err != nil {
			return err
		}
	}
	return nil
}

func checkPromiseBundleEntries(directory string) error {
	for _, scope := range []struct {
		path  string
		names []string
	}{
		{".", []string{"receipt.json", "run-1", "run-2"}},
		{"run-1", []string{"commands.json", promiseWheelFilename}},
		{"run-2", []string{"commands.json", promiseWheelFilename}},
	} {
		path := filepath.Join(directory, scope.path)
		if err := rejectGeneratorSymlink(directory, path); err != nil {
			return err
		}
		file, err := os.Open(path)
		if err != nil {
			return err
		}
		entries, readErr := file.ReadDir(len(scope.names) + 1)
		closeErr := file.Close()
		if (readErr != nil && !errors.Is(readErr, io.EOF)) || closeErr != nil || len(entries) != len(scope.names) {
			return errors.New("Promise evidence bundle contains missing or unexpected entries")
		}
		names := make([]string, 0, len(entries))
		for _, entry := range entries {
			names = append(names, entry.Name())
		}
		sort.Strings(names)
		sort.Strings(scope.names)
		if !reflect.DeepEqual(names, scope.names) {
			return errors.New("Promise evidence bundle entry set differs from its contract")
		}
	}
	return nil
}

func validatePromiseReceipt(receipt promiseReceipt, inputs promiseInputs, procedure promiseProcedure) error {
	if receipt.SchemaVersion != 1 || receipt.Authority != ResultAuthority ||
		receipt.State != "two-build-byte-match" || receipt.GeneratorImageState != "blocked" ||
		receipt.WheelhouseSHA256 != inputs.manifestSHA256 ||
		receipt.ImageContractSHA256 != inputs.imageContractSHA256 ||
		!reflect.DeepEqual(receipt.Procedure, procedure) || len(receipt.Runs) != 2 {
		return errors.New("Promise receipt authority, procedure sources, or two-run coverage is stale or invalid")
	}
	producer := receipt.Producer
	if !lowerHex(producer.ExecutableSHA256, 64) || producer.ExecutableSizeBytes < 1 ||
		producer.ExecutableSizeBytes > 128<<20 || producer.Build.GoVersion == "" ||
		producer.Build.OperatingSys == "" || producer.Build.Architecture == "" ||
		producer.Build.Version == "" || producer.Build.Revision == "" || producer.Build.BuiltAt == "" {
		return errors.New("Promise receipt producer build identity is invalid")
	}
	for index, run := range receipt.Runs {
		if err := validatePromiseRunReceipt(index+1, run); err != nil {
			return err
		}
	}
	first, second := receipt.Runs[0], receipt.Runs[1]
	if first.Name == second.Name || first.ContainerID == second.ContainerID || first.ImageID != second.ImageID ||
		first.SourceTarSHA256 != second.SourceTarSHA256 || first.SourceTarSizeBytes != second.SourceTarSizeBytes {
		return errors.New("Promise receipt does not identify two separate clean runs of the same inputs")
	}
	return nil
}

func validatePromiseRunReceipt(index int, run promiseRunReceipt) error {
	prefix := fmt.Sprintf("run-%d/", index)
	if run.Index != index || !validPromiseContainerName(run.Name) || !lowerHex(run.ContainerID, 64) ||
		!strings.HasPrefix(run.ImageID, "sha256:") || !lowerHex(strings.TrimPrefix(run.ImageID, "sha256:"), 64) ||
		run.SourceTarSHA256 != promiseCanonicalTarSHA256 || run.SourceTarSizeBytes != promiseCanonicalTarSize ||
		!run.CleanupVerified || !run.StagingRemoved ||
		run.Wheel != (promiseFileIdentity{prefix + promiseWheelFilename, promiseWheelSHA256, promiseWheelSize}) ||
		run.LicenseSHA256 != promiseLicenseSHA256 || run.Log.Path != prefix+"commands.json" ||
		!lowerHex(run.Log.SHA256, 64) || run.Log.SizeBytes < 1 || run.Log.SizeBytes > 2<<20 {
		return fmt.Errorf("Promise run %d receipt is invalid or incomplete", index)
	}
	return nil
}

func checkPromiseRunFiles(directory string, run promiseRunReceipt, procedure promiseProcedure) error {
	wheel, err := readPromisePinnedFile(directory, run.Wheel.Path, run.Wheel.SHA256, run.Wheel.SizeBytes)
	if err != nil {
		return err
	}
	if err := verifyPromiseWheel(wheel); err != nil {
		return err
	}
	body, err := readPromisePinnedFile(directory, run.Log.Path, run.Log.SHA256, run.Log.SizeBytes)
	if err != nil {
		return err
	}
	return validatePromiseCommandLog(body, run, procedure)
}
