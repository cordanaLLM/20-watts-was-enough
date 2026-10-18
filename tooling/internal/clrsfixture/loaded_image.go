package clrsfixture

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"reflect"
	"runtime"
	"strings"
	"time"
)

const loadedImageTimeout = 300 * time.Second
const loadedImageReceiptBytes = 64 << 10
const loadedImageLogBytes = 8 << 20

type GeneratorLoadedImageOptions struct {
	Archive         GeneratorOCIOptions
	OutputDirectory string
}

type GeneratorLoadedImageFile struct {
	Path      string `json:"path"`
	SHA256    string `json:"sha256"`
	SizeBytes int64  `json:"size_bytes"`
}

// GeneratorLoadedImageReport binds observed local metadata, not an import,
// reservation of Docker state, authenticated execution or image admission.
type GeneratorLoadedImageReport struct {
	SchemaVersion       int                        `json:"schema_version"`
	Authority           string                     `json:"authority"`
	State               string                     `json:"state"`
	SourceID            string                     `json:"source_id"`
	ContractID          string                     `json:"contract_id"`
	ImageContractSHA256 string                     `json:"image_contract_sha256"`
	ArchiveSHA256       string                     `json:"archive_sha256"`
	ArchiveBytes        int64                      `json:"archive_bytes"`
	LoadedImageID       string                     `json:"loaded_image_id"`
	ManifestDigest      string                     `json:"manifest_digest"`
	ConfigDigest        string                     `json:"config_digest"`
	ManifestFile        string                     `json:"manifest_file"`
	ConfigFile          string                     `json:"config_file"`
	OutputDirectory     string                     `json:"output_directory"`
	Started             string                     `json:"started"`
	Finished            string                     `json:"finished"`
	Producer            GeneratorFixtureProducer   `json:"producer"`
	Files               []GeneratorLoadedImageFile `json:"files"`
	DockerCalls         int                        `json:"docker_calls"`
	TimeoutSeconds      int                        `json:"timeout_seconds"`
	ImageAdmitted       bool                       `json:"image_admitted"`
	DockerMutated       bool                       `json:"docker_mutated"`
	Limitations         []string                   `json:"limitations"`
	Error               string                     `json:"error"`
}

// FixtureImage supplies generation's existing input type only after successful
// preparation. Generation must still recheck the current loaded image itself.
func (report GeneratorLoadedImageReport) FixtureImage() GeneratorFixtureImage {
	if report.State != "loaded-image-bound-unadmitted" || report.Error != "" {
		return GeneratorFixtureImage{}
	}
	return GeneratorFixtureImage{LoadedID: report.LoadedImageID, ManifestDigest: report.ManifestDigest,
		ConfigDigest: report.ConfigDigest, ManifestFile: report.ManifestFile, ConfigFile: report.ConfigFile}
}

func newLoadedImageReport() GeneratorLoadedImageReport {
	return GeneratorLoadedImageReport{SchemaVersion: 1, Authority: ResultAuthority, State: "incomplete", TimeoutSeconds: 300,
		Files: []GeneratorLoadedImageFile{}, Limitations: []string{
			"Original archive bytes and observed loaded-image configuration only; NO_RESULT, image not admitted.",
			"Docker is inspected through the default local Unix socket: no load, pull, container, tag, removal or retry.",
			"The observed ID is not a reservation or proof of a fresh import. Generation must independently recheck current state.",
			"An unsigned receipt and executable hash do not authenticate compilation, third-party execution, licence rights or a scientific result.",
			"Work is cooperatively bounded to 300 seconds, at most four 15-second Docker calls plus two-second pipe settlement per call; filesystem calls are not hard real-time.",
			"Control stdout is at most 64 KiB and combined stdout/stderr 1 MiB per call; command log 8 MiB, receipt 64 KiB, original metadata 64 KiB each and OCI report 256 KiB.",
			"Operator-owned filesystem, not hostile same-UID isolation. Receipt publication records completed observations; successful external exit is also required.",
		}}
}

func clearLoadedImageSuccess(report *GeneratorLoadedImageReport, err error) {
	report.State, report.LoadedImageID, report.ManifestFile, report.ConfigFile = "incomplete", "", "", ""
	if err != nil {
		report.Error = boundedGenerationError(err)
	}
}

// PrepareGeneratorLoadedImage reads the supplied OCI archive and at most four
// Docker responses, then writes a new exclusive handoff bundle. It cannot load
// missing images. Early validation failures create no output directory.
func PrepareGeneratorLoadedImage(ctx context.Context, options GeneratorLoadedImageOptions) (GeneratorLoadedImageReport, error) {
	if runtime.GOOS != "linux" || runtime.GOARCH != "amd64" {
		report := newLoadedImageReport()
		err := errors.New("loaded CLRS image preparation requires Linux amd64 and the default local Docker socket")
		clearLoadedImageSuccess(&report, err)
		return report, err
	}
	return prepareGeneratorLoadedImage(ctx, options, newLoadedImageDocker(), nil)
}

func loadAndValidateLoadedImageInputs(ctx context.Context, options *GeneratorLoadedImageOptions) (invocationInputs, GeneratorOCIReport, error) {
	inputs, err := loadInvocationInputs(ctx, options.Archive.RepositoryRoot)
	if err != nil {
		return invocationInputs{}, GeneratorOCIReport{}, err
	}
	options.Archive.RepositoryRoot = inputs.root
	resolved, err := resolveLoadedImageOptions(*options)
	if err != nil {
		return invocationInputs{}, GeneratorOCIReport{}, err
	}
	*options = resolved
	proof, err := InspectGeneratorOCIArchive(ctx, options.Archive)
	if err != nil {
		return invocationInputs{}, GeneratorOCIReport{}, err
	}
	if proof.SourceID != inputs.plan.SourceID.String() || proof.ContractID != inputs.plan.ContractID.String() || proof.ImageContractSHA256 != inputs.foundation.ImageContractSHA256 {
		return invocationInputs{}, GeneratorOCIReport{}, errors.New("OCI proof differs from the current loaded-image authority")
	}
	return inputs, proof, nil
}

func inspectLoadedImageCandidate(ctx context.Context, observer *loadedImageObserver, archive generatorOCIArchive, options GeneratorLoadedImageOptions, proof GeneratorOCIReport, inputs invocationInputs, initialErr error) (string, error) {
	workErr := initialErr
	var loadedID string
	if workErr == nil {
		loadedID, workErr = observer.inspect(ctx, proof, inputs.image.Runtime)
	}
	if workErr == nil {
		workErr = archive.check(ctx, options.Archive)
	}
	if workErr == nil {
		current, err := loadInvocationInputs(ctx, inputs.root)
		if err != nil {
			workErr = err
		} else if !reflect.DeepEqual(inputs, current) {
			workErr = errors.New("loaded-image repository authority changed during preparation")
		}
	}
	return loadedID, workErr
}

func prepareGeneratorLoadedImage(ctx context.Context, options GeneratorLoadedImageOptions, execute generationExecutor, afterPending func()) (report GeneratorLoadedImageReport, err error) {
	report = newLoadedImageReport()
	defer func() {
		if err != nil {
			clearLoadedImageSuccess(&report, err)
		}
	}()
	if ctx == nil || execute == nil {
		return report, errors.New("loaded image preparation requires a context and executor")
	}
	ctx, cancel := context.WithTimeout(ctx, loadedImageTimeout)
	defer cancel()
	report.Started = time.Now().UTC().Format(time.RFC3339Nano)
	inputs, proof, err := loadAndValidateLoadedImageInputs(ctx, &options)
	if err != nil {
		return report, err
	}
	archive, err := openGeneratorOCIArchive(options.Archive.ArchivePath, options.Archive.ExpectedArchiveBytes)
	if err != nil {
		return report, err
	}
	defer func() { err = errors.Join(err, archive.file.Close(), archive.root.Close(), ctx.Err()) }()
	producer, err := currentPromiseProducer()
	if err != nil {
		return report, err
	}
	report.SourceID, report.ContractID, report.ImageContractSHA256 = proof.SourceID, proof.ContractID, proof.ImageContractSHA256
	report.ArchiveSHA256, report.ArchiveBytes = proof.ArchiveSHA256, proof.ArchiveBytes
	report.ManifestDigest, report.ConfigDigest = proof.Manifest.Digest, proof.Config.Digest
	report.OutputDirectory = options.OutputDirectory
	report.Producer = GeneratorFixtureProducer(producer)
	if err := ctx.Err(); err != nil {
		return report, err
	}
	bundle, err := newLoadedImageBundle(options)
	if err != nil {
		return report, err
	}
	defer func() { err = errors.Join(err, bundle.Close()) }()
	files, workErr := writeLoadedImageInputs(bundle, report, proof)
	observer := loadedImageObserver{execute: execute}
	loadedID, workErr := inspectLoadedImageCandidate(ctx, &observer, archive, options, proof, inputs, workErr)
	report.DockerCalls = len(observer.commands)
	return finishLoadedImageBundle(ctx, bundle, report, files, observer.commands, loadedID, workErr, afterPending)
}

func resolveLoadedImageOptions(options GeneratorLoadedImageOptions) (GeneratorLoadedImageOptions, error) {
	for _, path := range []*string{&options.OutputDirectory, &options.Archive.ArchivePath} {
		if *path == "" || len(*path) > 4096 || strings.ContainsAny(*path, "\x00\r\n") {
			return options, errors.New("loaded-image preparation needs bounded explicit archive and output paths")
		}
		if !filepath.IsAbs(*path) {
			*path = filepath.Join(options.Archive.RepositoryRoot, *path)
		}
		*path = filepath.Clean(*path)
	}
	if _, err := cleanGeneratorRoot(filepath.Dir(options.OutputDirectory)); err != nil {
		return options, err
	}
	if _, err := os.Lstat(options.OutputDirectory); !errors.Is(err, os.ErrNotExist) {
		return options, errors.Join(err, errors.New("loaded-image output directory must not already exist"))
	}
	for _, protected := range []string{options.Archive.RepositoryRoot, options.Archive.ArchivePath} {
		if protected == options.OutputDirectory || strings.HasPrefix(protected, options.OutputDirectory+string(filepath.Separator)) {
			return options, errors.New("loaded-image output must not contain its repository or archive input")
		}
	}
	return options, nil
}

func MarshalGeneratorLoadedImageReport(report GeneratorLoadedImageReport) ([]byte, error) {
	if len(report.Files) > 5 || len(report.Limitations) > 8 || len(report.Error) > 4096 {
		return nil, errors.New("loaded-image report exceeds its field boundaries")
	}
	return marshalGenerationJSON(report, loadedImageReceiptBytes)
}
