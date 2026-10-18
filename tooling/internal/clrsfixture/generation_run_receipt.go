package clrsfixture

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"path/filepath"
	"reflect"
	"slices"
	"strings"
	"time"
)

// MarshalGeneratorFixtureRun emits bounded canonical JSON, never fixture text.
func MarshalGeneratorFixtureRun(report GeneratorFixtureRun) ([]byte, error) {
	if report.SchemaVersion != 1 || report.Authority != ResultAuthority || report.GenerationState != generationState ||
		report.ProcedureVersion != generationRunVersion ||
		!slices.Contains([]string{"failed", "prepared-not-started", "fixtures-generated-unadmitted", "bundle-consistent-unadmitted"}, report.State) ||
		len(report.Inputs) > 32 || len(report.Files) > 6 || len(report.Error) > 4096 ||
		!slices.Equal(report.Limitations, newGenerationRunReport().Limitations) {
		return nil, errors.New("generation report schema, state or inventory violates its boundary")
	}
	return marshalGenerationJSON(report, generationRunMaximumReceipt)
}

// CheckGeneratorFixtureRun makes no output or external command. It verifies a
// supplied successful bundle against explicit source/image inputs, not execution
// authenticity, layer content, licence permission or public image admission.
func CheckGeneratorFixtureRun(ctx context.Context, options GeneratorFixtureRunOptions) (GeneratorFixtureRun, error) {
	return checkGeneratorFixtureRun(ctx, options, nil)
}

func checkGeneratorFixtureRun(ctx context.Context, options GeneratorFixtureRunOptions, afterMarshal func()) (report GeneratorFixtureRun, err error) {
	report = newGenerationRunReport()
	defer func() {
		if err != nil {
			report = newGenerationRunReport()
			clearGenerationRunSuccess(&report, err)
		}
	}()
	if ctx == nil {
		return report, errors.New("generation bundle check requires a context")
	}
	ctx, cancel := context.WithTimeout(ctx, generationCheckTimeout)
	defer cancel()
	inputs, err := loadGenerationRunInputs(ctx, options)
	if err != nil {
		return report, err
	}
	bundle, err := loadGenerationBundle(ctx, inputs)
	if err != nil {
		return report, err
	}
	if err := decodeCanonicalGeneratorJSON(bundle.bodies["receipt.json"], 20, &report); err != nil {
		return report, err
	}
	if err := validateGenerationReceipt(report, bundle, inputs); err != nil {
		return report, err
	}
	if err := checkGenerationCommands(ctx, report, bundle, inputs); err != nil {
		return report, err
	}
	if err := checkGenerationReceiptDataset(ctx, report, bundle, inputs); err != nil {
		return report, err
	}
	if err := recheckGenerationRunInputs(ctx, options, inputs); err != nil {
		return report, err
	}
	// The final dataset recheck also revalidates file and directory identities.
	if err := checkGenerationReceiptDataset(ctx, report, bundle, inputs); err != nil {
		return report, err
	}
	if err := recheckGenerationBundle(ctx, bundle, inputs); err != nil {
		return report, err
	}
	report.State = "bundle-consistent-unadmitted"
	_, err = MarshalGeneratorFixtureRun(report)
	if afterMarshal != nil {
		afterMarshal()
	}
	return report, errors.Join(err, ctx.Err())
}

func validateGenerationReceipt(report GeneratorFixtureRun, bundle generationBundleSnapshot, inputs generationRunInputs) error {
	if _, err := MarshalGeneratorFixtureRun(report); err != nil {
		return err
	}
	if report.State != "fixtures-generated-unadmitted" || !report.CleanupVerified || report.Error != "" ||
		!validGenerationName(report.ContainerName) || !lowerHex(report.ContainerID, 64) ||
		!lowerHex(report.Producer.ExecutableSHA256, 64) || report.Producer.ExecutableSizeBytes < 1 || report.Producer.ExecutableSizeBytes > 128<<20 ||
		report.Producer.Build.OperatingSys != "linux" || report.Producer.Build.Architecture != "amd64" ||
		report.Producer.Build.Version == "" || report.Producer.Build.Revision == "" || report.Producer.Build.BuiltAt == "" || report.Producer.Build.GoVersion == "" {
		return errors.New("generation receipt lacks successful bounded execution claims and producer identity")
	}
	started, firstErr := time.Parse(time.RFC3339Nano, report.Started)
	finished, lastErr := time.Parse(time.RFC3339Nano, report.Finished)
	if firstErr != nil || lastErr != nil || finished.Before(started) {
		return errors.New("generation receipt timestamps are invalid or reversed")
	}
	prepared := generationPreparedReport(inputs, report.ContainerName, promiseProducer{
		Build: report.Producer.Build, ExecutableSHA256: report.Producer.ExecutableSHA256, ExecutableSizeBytes: report.Producer.ExecutableSizeBytes})
	prepared.Started = report.Started
	if report.SourceID != prepared.SourceID || report.ContractID != prepared.ContractID || report.ProgramSHA256 != prepared.ProgramSHA256 ||
		report.ProcedureSHA256 != prepared.ProcedureSHA256 || report.LoadedImageID != prepared.LoadedImageID ||
		report.ManifestDigest != prepared.ManifestDigest || report.ConfigDigest != prepared.ConfigDigest || !reflect.DeepEqual(report.Inputs, prepared.Inputs) {
		return errors.New("generation receipt differs from independently supplied source or image inputs")
	}
	start, err := MarshalGeneratorFixtureRun(prepared)
	if err != nil || !bytes.Equal(start, bundle.bodies["run-start.json"]) {
		return errors.New("generation durable run-start record differs from its final receipt")
	}
	if report.OutputTar != generationFileIdentity("output.tar", bundle.bodies["output.tar"]) ||
		report.CommandLog != generationFileIdentity("commands.json", bundle.bodies["commands.json"]) {
		return errors.New("generation tar or command log byte identity differs from its receipt")
	}
	return nil
}

func validGenerationName(name string) bool {
	suffix, found := strings.CutPrefix(name, "clrs20w-generation-")
	if !found || len(suffix) < 16 || len(suffix) > 64 {
		return false
	}
	for _, character := range suffix {
		if !(character >= 'A' && character <= 'Z' || character >= 'a' && character <= 'z' || character >= '0' && character <= '9') {
			return false
		}
	}
	return true
}

func checkGenerationReceiptDataset(ctx context.Context, report GeneratorFixtureRun, bundle generationBundleSnapshot, inputs generationRunInputs) error {
	files, tree, count, err := checkGenerationDataset(ctx, bundle.root, inputs)
	if err != nil {
		return err
	}
	if !reflect.DeepEqual(files, report.Files) || tree != report.TreeSHA256 || count != report.ImportedExamples {
		return errors.New("generation receipt differs from independently imported fixture files")
	}
	return visitGenerationTar(ctx, bundle.bodies["output.tar"], inputs, func(path string, body []byte) error {
		for _, file := range files {
			if file.Path == path && file.SHA256 == rawSHA256(body) && file.SizeBytes == int64(len(body)) {
				return nil
			}
		}
		return fmt.Errorf("generation tar does not contain the retained fixture bytes: %s", path)
	})
}

func snapshotGenerationRun(ctx context.Context, inputs generationRunInputs, report GeneratorFixtureRun) (generationBundleSnapshot, error) {
	bundle, err := loadGenerationEvidence(ctx, inputs, false)
	if err != nil {
		return bundle, err
	}
	prepared := generationPreparedReport(inputs, report.ContainerName, promiseProducer{
		Build: report.Producer.Build, ExecutableSHA256: report.Producer.ExecutableSHA256, ExecutableSizeBytes: report.Producer.ExecutableSizeBytes})
	prepared.Started = report.Started
	start, err := MarshalGeneratorFixtureRun(prepared)
	if err != nil || !bytes.Equal(start, bundle.bodies["run-start.json"]) ||
		report.OutputTar != generationFileIdentity("output.tar", bundle.bodies["output.tar"]) {
		return bundle, errors.New("retained generation start or output differs before cleanup")
	}
	if err := checkGenerationReceiptDataset(ctx, report, bundle, inputs); err != nil {
		return bundle, err
	}
	return bundle, recheckGenerationBundle(ctx, bundle, inputs)
}

type generationCommandReplayer struct {
	records []generationCommandEvidence
	bundle  generationBundleSnapshot
	index   int
	binary  string
}

func (r *generationCommandReplayer) replay(child context.Context, args []string, sink io.Writer, maximum int64) (generationCommandEvidence, error) {
	if r.index >= len(r.records) {
		return generationCommandEvidence{}, errors.New("generation command log ended early")
	}
	record := r.records[r.index]
	r.index++
	if len(record.Arguments) < 4 || !filepath.IsAbs(record.Arguments[0]) || filepath.Base(record.Arguments[0]) != "docker" ||
		len(record.Arguments[0]) > 4096 || strings.ContainsAny(record.Arguments[0], "\r\n\x00") {
		return record, errors.New("generation command lacks its explicit local Docker executable")
	}
	if r.binary == "" {
		r.binary = record.Arguments[0]
	}
	expected := append([]string{r.binary, "--host", generationDockerEndpoint}, args...)
	if !slices.Equal(record.Arguments, expected) || record.ExitCode != 0 || record.Error != "" ||
		len(record.Stderr) > 1<<20 || int64(len(record.Stdout)) > maximum || sink == nil && len(record.Stdout)+len(record.Stderr) > 1<<20 {
		return record, errors.New("generation command arguments, bounds or recorded status differ")
	}
	if sink != nil {
		body := r.bundle.bodies["output.tar"]
		if len(record.Stdout) != 0 || int64(len(body)) > maximum {
			return record, errors.New("streamed command has conflicting or excess output")
		}
		if _, err := sink.Write(body); err != nil {
			return record, err
		}
	}
	return record, child.Err()
}

func replayGenerationLifecycle(ctx context.Context, runner *generationRunner, inputs generationRunInputs) error {
	if err := runner.preflight(ctx); err != nil {
		return err
	}
	if err := runner.run(ctx); err != nil {
		return err
	}
	if _, err := runner.inspect(ctx, true, true, false); err != nil {
		return err
	}
	record, err := runner.command(ctx, 60, io.Discard, generationRunMaximumTar, false, runner.execArguments(generationReaderProgram(inputs))...)
	if err != nil {
		return err
	}
	if len(record.Stderr) != 0 {
		return errors.New("recorded output reader wrote stderr")
	}
	if _, err := runner.inspect(ctx, true, true, false); err != nil {
		return err
	}
	return runner.cleanup()
}

// Replay validates only supplied command records through the same state machine.
// The executor below never resolves Docker or starts a process.
func checkGenerationCommands(ctx context.Context, report GeneratorFixtureRun, bundle generationBundleSnapshot, inputs generationRunInputs) error {
	var records []generationCommandEvidence
	if err := decodeCanonicalGeneratorJSON(bundle.bodies["commands.json"], 20, &records); err != nil {
		return err
	}
	if len(records) == 0 || len(records) > 24 {
		return errors.New("generation command inventory violates its finite boundary")
	}
	replayer := &generationCommandReplayer{records: records, bundle: bundle}
	runner := &generationRunner{execute: replayer.replay, name: report.ContainerName, inputs: inputs}
	if err := replayGenerationLifecycle(ctx, runner, inputs); err != nil {
		return err
	}
	if replayer.index != len(records) || runner.id != report.ContainerID {
		return errors.New("generation command log has excess entries or another container identity")
	}
	return ctx.Err()
}
