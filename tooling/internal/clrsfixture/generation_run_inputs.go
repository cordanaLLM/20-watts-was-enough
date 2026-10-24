package clrsfixture

import (
	"context"
	"errors"
	"io"
	"os"
	"path/filepath"
	"reflect"
	"sort"
	"strings"
	"time"
)

type generationRunInputs struct {
	options    GeneratorFixtureRunOptions
	authority  invocationInputs
	invocation GeneratorInvocation
	image      generationImageInspection
	files      map[string][]byte
}

type generationProcedure struct {
	Version            string                `json:"version"`
	SourceID           string                `json:"source_id"`
	ContractID         string                `json:"contract_id"`
	ProgramSHA256      string                `json:"program_sha256"`
	LoadedID           string                `json:"loaded_id"`
	ManifestDigest     string                `json:"manifest_digest"`
	ConfigDigest       string                `json:"config_digest"`
	Runtime            GeneratorRuntime      `json:"runtime"`
	Output             GenerationOutput      `json:"output"`
	Sources            []promiseFileIdentity `json:"sources"`
	WorkCommands       int                   `json:"work_commands"`
	CleanupCommands    int                   `json:"cleanup_commands"`
	CleanupSeconds     int                   `json:"cleanup_seconds"`
	ControlOutputBytes int                   `json:"control_output_bytes"`
	CommandLogBytes    int                   `json:"command_log_bytes"`
	ReceiptBytes       int                   `json:"receipt_bytes"`
	OutputTarBytes     int                   `json:"output_tar_bytes"`
	DockerVersion      string                `json:"docker_version"`
	DockerEndpoint     string                `json:"docker_endpoint"`
}

func loadGenerationRunInputs(ctx context.Context, options GeneratorFixtureRunOptions) (inputs generationRunInputs, err error) {
	options.RepositoryRoot, err = cleanGeneratorRoot(options.RepositoryRoot)
	if err != nil {
		return inputs, err
	}
	for _, value := range []*string{&options.OutputDirectory, &options.Image.ManifestFile, &options.Image.ConfigFile} {
		if *value == "" || len(*value) > 4096 || strings.ContainsAny(*value, "\r\n\x00") {
			return inputs, errors.New("CLRS run needs explicit bounded output and image metadata paths")
		}
		if !filepath.IsAbs(*value) {
			*value = filepath.Join(options.RepositoryRoot, *value)
		}
		*value = filepath.Clean(*value)
	}
	inputs.options = options
	inputs.authority, err = loadInvocationInputs(ctx, options.RepositoryRoot)
	if err != nil {
		return inputs, err
	}
	inputs.invocation, err = PrepareGeneratorInvocation(ctx, options.RepositoryRoot)
	if err != nil {
		return inputs, err
	}
	program, err := renderGeneratorProgram(inputs.authority)
	if err != nil || program != inputs.invocation.Program {
		return inputs, errors.New("generation authority changed while preparing the program")
	}
	manifest, err := readGenerationExternal(ctx, options.Image.ManifestFile, 64<<10)
	if err != nil {
		return inputs, err
	}
	config, err := readGenerationExternal(ctx, options.Image.ConfigFile, 64<<10)
	if err != nil {
		return inputs, err
	}
	inputs.image, err = parseGenerationRunImage(manifest, config, options.Image, inputs.authority.image.Runtime)
	if err != nil {
		return inputs, err
	}
	inputs.files = map[string][]byte{"manifest.json": manifest, "config.json": config, "generation.py": []byte(program)}
	for name, path := range map[string]string{
		"upstream.json": trackedSourcePath, "contract.json": trackedGenerationPath,
		"lock-input.json": trackedLockInputPath, "image-contract.json": trackedImageContractPath,
		"pyproject.toml": trackedGeneratorProjectPath, "uv.lock": trackedGeneratorDependencyLockPath,
		"wheelhouse.json": trackedGeneratorWheelhousePath, "promise-MIT.txt": "LICENSES/promise-MIT.txt",
		"pdf-renderer-lock.json": inputs.authority.image.Builder.AuthorityPath,
	} {
		body, err := readGeneratorFileWithInterlock(options.RepositoryRoot, path, 16<<20, ctx.Err)
		if err != nil {
			return inputs, err
		}
		inputs.files[name] = body
	}
	inputs.files["procedure.json"], err = currentGenerationProcedure(ctx, inputs)
	if err != nil {
		return inputs, err
	}
	return inputs, ctx.Err()
}

func currentGenerationProcedure(ctx context.Context, inputs generationRunInputs) ([]byte, error) {
	paths, err := promiseSourcePathsForVersion(inputs.options.RepositoryRoot, promiseProcedureVersion)
	if err != nil {
		return nil, err
	}
	commandDirectory := filepath.Join(inputs.options.RepositoryRoot, "tooling/cmd/20w")
	if err := rejectGeneratorSymlink(inputs.options.RepositoryRoot, commandDirectory); err != nil {
		return nil, err
	}
	file, err := os.Open(commandDirectory) //#nosec G304 -- fixed repository directory path verified non-symlink
	if err != nil {
		return nil, err
	}
	entries, readErr := file.ReadDir(257)
	if errors.Is(readErr, io.EOF) {
		readErr = nil
	}
	if err := errors.Join(readErr, file.Close()); err != nil {
		return nil, err
	}
	if len(entries) > 256 {
		return nil, errors.New("generation command source inventory exceeds its bound")
	}
	for _, entry := range entries {
		if strings.HasSuffix(entry.Name(), ".go") && !strings.HasSuffix(entry.Name(), "_test.go") {
			paths = append(paths, "tooling/cmd/20w/"+entry.Name())
		}
	}
	sort.Strings(paths)
	procedure := generationProcedure{Version: generationRunVersion, SourceID: inputs.invocation.SourceID.String(),
		ContractID: inputs.invocation.ContractID.String(), ProgramSHA256: inputs.invocation.ProgramSHA256,
		LoadedID: inputs.options.Image.LoadedID, ManifestDigest: inputs.options.Image.ManifestDigest, ConfigDigest: inputs.options.Image.ConfigDigest,
		Runtime: inputs.authority.image.Runtime, Output: inputs.authority.plan.Output, WorkCommands: 17, CleanupCommands: 7,
		CleanupSeconds: 45, ControlOutputBytes: 64 << 10, CommandLogBytes: generationRunMaximumLog,
		ReceiptBytes: generationRunMaximumReceipt, OutputTarBytes: generationRunMaximumTar,
		DockerVersion: "29.7.2", DockerEndpoint: "unix:///var/run/docker.sock"}
	previous := ""
	for _, path := range paths {
		if path == previous {
			continue
		}
		previous = path
		body, err := readGeneratorFileWithInterlock(inputs.options.RepositoryRoot, path, 128<<10, ctx.Err)
		if err != nil {
			return nil, err
		}
		procedure.Sources = append(procedure.Sources, promiseIdentity(path, body))
	}
	return marshalGenerationJSON(procedure, 128<<10)
}

func readGenerationExternal(ctx context.Context, path string, maximum int64) ([]byte, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	parent, err := cleanGeneratorRoot(filepath.Dir(path))
	if err != nil {
		return nil, err
	}
	return readGeneratorFileWithInterlock(parent, filepath.Base(path), maximum, ctx.Err)
}

func recheckGenerationRunInputs(ctx context.Context, options GeneratorFixtureRunOptions, before generationRunInputs) error {
	after, err := loadGenerationRunInputs(ctx, options)
	if err != nil {
		return err
	}
	if !reflect.DeepEqual(before, after) {
		return errors.New("CLRS generation inputs changed during execution or checking")
	}
	return ctx.Err()
}

func generationPreparedReport(inputs generationRunInputs, name string, producer promiseProducer) GeneratorFixtureRun {
	report := newGenerationRunReport()
	report.State, report.ContainerName = "prepared-not-started", name
	report.Started = time.Now().UTC().Format(time.RFC3339Nano)
	report.SourceID, report.ContractID = inputs.invocation.SourceID.String(), inputs.invocation.ContractID.String()
	report.ProgramSHA256 = inputs.invocation.ProgramSHA256
	report.ProcedureSHA256 = rawSHA256(inputs.files["procedure.json"])
	report.LoadedImageID, report.ManifestDigest, report.ConfigDigest = inputs.image.ID, inputs.options.Image.ManifestDigest, inputs.options.Image.ConfigDigest
	report.Producer = GeneratorFixtureProducer{producer.Build, producer.ExecutableSHA256, producer.ExecutableSizeBytes}
	for name, body := range inputs.files {
		report.Inputs = append(report.Inputs, generationFileIdentity("inputs/"+name, body))
	}
	sort.Slice(report.Inputs, func(i, j int) bool { return report.Inputs[i].Path < report.Inputs[j].Path })
	return report
}

func generationFileIdentity(path string, body []byte) GeneratorFixtureFile {
	return GeneratorFixtureFile{Path: path, SHA256: rawSHA256(body), SizeBytes: int64(len(body))}
}
