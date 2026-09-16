package clrsfixture

import (
	"context"
	"crypto/rand"
	"errors"
	"fmt"
	"io"
	"os"
	"runtime"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/buildinfo"
)

const generationRunVersion = "clrs-fixture-generation-v1"
const generationRunMaximumReceipt = 4 << 20
const generationRunMaximumLog = 40 << 20
const generationRunMaximumTar = 24<<20 + 64<<10

// GeneratorFixtureImage names independently pinned local OCI metadata and an
// already-loaded execution identity. No image is acquired by this API.
type GeneratorFixtureImage struct {
	LoadedID, ManifestDigest, ConfigDigest string
	ManifestFile, ConfigFile               string
}

type GeneratorFixtureRunOptions struct {
	RepositoryRoot, OutputDirectory string
	Image                           GeneratorFixtureImage
}

type GeneratorFixtureFile struct {
	Path             string `json:"path"`
	SHA256           string `json:"sha256"`
	SizeBytes        int64  `json:"size_bytes"`
	ImportedExamples int    `json:"imported_examples"`
}

type GeneratorFixtureProducer struct {
	Build               buildinfo.Info `json:"build"`
	ExecutableSHA256    string         `json:"executable_sha256"`
	ExecutableSizeBytes int64          `json:"executable_size_bytes"`
}

// GeneratorFixtureRun records development execution or supplied-bundle
// consistency. Neither state admits an image or authenticates a third party.
type GeneratorFixtureRun struct {
	SchemaVersion    int                      `json:"schema_version"`
	Authority        string                   `json:"authority"`
	State            string                   `json:"state"`
	GenerationState  string                   `json:"generation_state"`
	ProcedureVersion string                   `json:"procedure_version"`
	SourceID         string                   `json:"source_id"`
	ContractID       string                   `json:"contract_id"`
	ProgramSHA256    string                   `json:"program_sha256"`
	ProcedureSHA256  string                   `json:"procedure_sha256"`
	LoadedImageID    string                   `json:"loaded_image_id"`
	ManifestDigest   string                   `json:"manifest_digest"`
	ConfigDigest     string                   `json:"config_digest"`
	Started          string                   `json:"started"`
	Finished         string                   `json:"finished"`
	ContainerName    string                   `json:"container_name"`
	ContainerID      string                   `json:"container_id"`
	Producer         GeneratorFixtureProducer `json:"producer"`
	Inputs           []GeneratorFixtureFile   `json:"inputs"`
	OutputTar        GeneratorFixtureFile     `json:"output_tar"`
	Files            []GeneratorFixtureFile   `json:"files"`
	TreeSHA256       string                   `json:"tree_sha256"`
	ImportedExamples int                      `json:"imported_examples"`
	CommandLog       GeneratorFixtureFile     `json:"command_log"`
	CleanupVerified  bool                     `json:"cleanup_verified"`
	Error            string                   `json:"error"`
	Limitations      []string                 `json:"limitations"`
}

type generationExecutor func(context.Context, []string, io.Writer, int64) (generationCommandEvidence, error)

type generationRunner struct {
	execute                 generationExecutor
	name, id                string
	inputs                  generationRunInputs
	commands                []generationCommandEvidence
	workCalls, cleanupCalls int
	attempted               bool
}

// RunGeneratorFixtures performs one Linux-only generation in an already-loaded
// image. Invalid inputs make no output; later failures retain bounded evidence.
func RunGeneratorFixtures(ctx context.Context, options GeneratorFixtureRunOptions) (GeneratorFixtureRun, error) {
	if runtime.GOOS != "linux" || runtime.GOARCH != "amd64" {
		return newGenerationRunReport(), errors.New("CLRS generation execution requires Linux amd64; receipt checking remains portable")
	}
	return runGeneratorFixtures(ctx, options, localGenerationDocker)
}

func runGeneratorFixtures(ctx context.Context, options GeneratorFixtureRunOptions, execute generationExecutor) (report GeneratorFixtureRun, err error) {
	report = newGenerationRunReport()
	defer func() {
		if err != nil {
			clearGenerationRunSuccess(&report, err)
		}
	}()
	if ctx == nil || execute == nil {
		return report, errors.New("CLRS generation requires a context and executor")
	}
	ctx, cancel := context.WithTimeout(ctx, 300*time.Second)
	defer cancel()
	inputs, err := loadGenerationRunInputs(ctx, options)
	if err != nil {
		return report, err
	}
	producer, err := currentPromiseProducer()
	if err != nil {
		return report, err
	}
	if err := ctx.Err(); err != nil {
		return report, err
	}
	name := "clrs20w-generation-" + rand.Text()
	runner := &generationRunner{execute: execute, name: name, inputs: inputs}
	report = generationPreparedReport(inputs, name, producer)
	bundle, err := newGenerationRunBundle(inputs)
	if err != nil {
		return report, err
	}
	defer bundle.Close()
	workErr := writeGenerationInputs(bundle, inputs, report)
	if workErr == nil {
		workErr = checkGenerationRoot(bundle)
	}
	if workErr == nil {
		workErr = runner.generate(ctx, bundle, &report)
	}
	var retained generationBundleSnapshot
	if workErr == nil {
		retained, workErr = snapshotGenerationRun(ctx, inputs, report)
	}
	cleanupErr := runner.cleanup()
	report.CleanupVerified = cleanupErr == nil
	report.ContainerID = runner.id
	err = errors.Join(workErr, cleanupErr)
	if err == nil {
		err = recheckGenerationRunInputs(ctx, options, inputs)
	}
	if err == nil {
		err = recheckGenerationBundle(ctx, retained, inputs)
	}
	err = errors.Join(err, checkGenerationRoot(bundle))
	report.Finished = time.Now().UTC().Format(time.RFC3339Nano)
	log, encodeErr := marshalGenerationJSON(runner.commands, generationRunMaximumLog)
	if encodeErr == nil {
		encodeErr = writeGenerationFile(bundle, "commands.json", log)
	}
	err = errors.Join(err, encodeErr, ctx.Err())
	if encodeErr == nil {
		report.CommandLog = generationFileIdentity("commands.json", log)
	}
	if err == nil {
		report.State = "fixtures-generated-unadmitted"
	} else {
		clearGenerationRunSuccess(&report, err)
	}
	report, encodeErr = publishGenerationReceipt(ctx, bundle, report, nil)
	return report, errors.Join(err, encodeErr)
}

func (runner *generationRunner) generate(ctx context.Context, bundle *os.Root, report *GeneratorFixtureRun) error {
	if err := runner.preflight(ctx); err != nil {
		return err
	}
	if err := runner.run(ctx); err != nil {
		return err
	}
	identity, err := runner.extract(ctx, bundle)
	if err != nil {
		return err
	}
	report.OutputTar = identity
	files, tree, count, err := checkGenerationDataset(ctx, bundle.Name(), runner.inputs)
	if err != nil {
		return err
	}
	report.Files, report.TreeSHA256, report.ImportedExamples = files, tree, count
	return nil
}

func newGenerationRunReport() GeneratorFixtureRun {
	return GeneratorFixtureRun{SchemaVersion: 1, Authority: ResultAuthority, State: "failed", GenerationState: generationState,
		ProcedureVersion: generationRunVersion, Inputs: []GeneratorFixtureFile{}, Files: []GeneratorFixtureFile{},
		Limitations: []string{
			"Development fixture generation or supplied-bundle consistency only; NO_RESULT, image admission remains blocked.",
			"Checking recorded execution claims does not authenticate a third party, image layers, licence rights or kernel enforcement.",
			"One generation, no retry; Linux amd64 execution uses the local Docker socket without pulling, loading or tagging images.",
			"Work 300 seconds, cleanup independently 45 seconds, stop grace 5 seconds, pipe settlement 2 seconds per command; SIGKILL or daemon failure may require owned-name recovery.",
			"At most 17 work and 7 cleanup commands, 40 MiB command log, 4 MiB receipt, 24 MiB dataset and 24 MiB plus 64 KiB tar; operator-owned filesystem, not hostile same-UID isolation.",
		}}
}

func clearGenerationRunSuccess(report *GeneratorFixtureRun, err error) {
	report.State, report.TreeSHA256, report.ImportedExamples = "failed", "", 0
	if err != nil {
		report.Error = boundedGenerationError(fmt.Errorf("CLRS generation: %w", err))
	}
}

func boundedGenerationError(err error) string {
	message := strings.ToValidUTF8(err.Error(), "?")
	const suffix = " [diagnostic limit]"
	if len(message) <= 4096 {
		return message
	}
	message = message[:4096-len(suffix)]
	for !utf8.ValidString(message) {
		message = message[:len(message)-1]
	}
	return message + suffix
}
