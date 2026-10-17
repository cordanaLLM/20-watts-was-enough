package clrsfixture

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"maps"
	"os"
	"path/filepath"
	"slices"
	"time"

	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/fileidentity"
)

func newLoadedImageBundle(options GeneratorLoadedImageOptions) (*os.Root, error) {
	parent, err := cleanGeneratorRoot(filepath.Dir(options.OutputDirectory))
	if err != nil {
		return nil, err
	}
	root, err := os.OpenRoot(parent)
	if err != nil {
		return nil, err
	}
	defer root.Close()
	before, err := root.Stat(".")
	if err != nil {
		return nil, err
	}
	name := filepath.Base(options.OutputDirectory)
	if err := root.Mkdir(name, 0o700); err != nil {
		return nil, err
	}
	bundle, err := root.OpenRoot(name)
	if err != nil {
		return nil, err
	}
	after, err := fileidentity.Lstat(parent)
	if err == nil && (!os.SameFile(before, after) || before.Mode() != after.Mode()) {
		err = errors.New("loaded-image output parent changed during exclusive creation")
	}
	if err == nil {
		err = errors.Join(checkGenerationRoot(bundle), SyncDirectory(root, "."))
	}
	if err != nil {
		bundle.Close()
		return nil, err
	}
	return bundle, nil
}

func writeLoadedImageInputs(bundle *os.Root, report GeneratorLoadedImageReport, proof GeneratorOCIReport) (map[string][]byte, error) {
	files := map[string][]byte{}
	start, err := MarshalGeneratorLoadedImageReport(report)
	if err != nil {
		return files, err
	}
	archive, err := MarshalGeneratorOCIReport(proof)
	if err != nil {
		return files, err
	}
	for _, file := range []struct {
		path string
		body []byte
	}{{"run-start.json", start}, {"manifest.json", proof.ManifestBytes}, {"config.json", proof.ConfigBytes}, {"archive-inspection.json", archive}} {
		if err := writeGenerationFile(bundle, file.path, file.body); err != nil {
			return files, err
		}
		files[file.path] = file.body
	}
	return files, checkGenerationRoot(bundle)
}

func finishLoadedImageBundle(ctx context.Context, bundle *os.Root, report GeneratorLoadedImageReport, files map[string][]byte,
	commands []generationCommandEvidence, loadedID string, workErr error, afterPending func()) (GeneratorLoadedImageReport, error) {
	log, logErr := marshalGenerationJSON(commands, loadedImageLogBytes)
	if logErr == nil {
		logErr = writeGenerationFile(bundle, "commands.json", log)
		if logErr == nil {
			files["commands.json"] = log
		}
	}
	err := errors.Join(workErr, logErr, ctx.Err(), checkGenerationRoot(bundle))
	if err == nil {
		err = recheckLoadedImageFiles(ctx, bundle, files, false)
	}
	report.Finished = time.Now().UTC().Format(time.RFC3339Nano)
	for _, path := range slices.Sorted(maps.Keys(files)) {
		report.Files = append(report.Files, GeneratorLoadedImageFile{path, rawSHA256(files[path]), int64(len(files[path]))})
	}
	if err == nil {
		report.State, report.LoadedImageID = "loaded-image-bound-unadmitted", loadedID
		report.ManifestFile, report.ConfigFile = filepath.Join(bundle.Name(), "manifest.json"), filepath.Join(bundle.Name(), "config.json")
	} else {
		clearLoadedImageSuccess(&report, err)
	}
	report, publishErr := publishLoadedImageReceipt(ctx, bundle, report, files, afterPending)
	return report, errors.Join(err, publishErr, ctx.Err())
}

func recheckLoadedImageFiles(ctx context.Context, bundle *os.Root, files map[string][]byte, pending bool) error {
	if err := checkGenerationRoot(bundle); err != nil {
		return err
	}
	expected := len(files)
	if pending {
		expected++
	}
	entries, _, err := comparisonEntries(ctx, bundle.Name(), ".", expected)
	if err != nil {
		return err
	}
	if len(entries) != expected {
		return errors.New("loaded-image bundle has an incomplete inventory")
	}
	for _, entry := range entries {
		_, exists := files[entry.Name()]
		if entry.Type() != 0 || !exists && !(pending && entry.Name() == "receipt.pending.json") {
			return errors.New("loaded-image bundle contains an unexpected or non-regular entry")
		}
	}
	for _, name := range slices.Sorted(maps.Keys(files)) {
		body, _, err := readComparisonFile(ctx, bundle.Name(), name, int64(len(files[name])))
		if err != nil || !bytes.Equal(body, files[name]) {
			return errors.Join(err, fmt.Errorf("retained loaded-image file changed: %s", name))
		}
	}
	return errors.Join(checkGenerationRoot(bundle), ctx.Err())
}

// The exclusive hard link is the publication point. A later I/O error or
// cancellation requires a failed external exit, not rewriting an immutable
// receipt that records the earlier completed observations.
func publishLoadedImageReceipt(ctx context.Context, bundle *os.Root, report GeneratorLoadedImageReport, files map[string][]byte,
	afterPending func()) (GeneratorLoadedImageReport, error) {
	body, err := MarshalGeneratorLoadedImageReport(report)
	if err != nil {
		return report, err
	}
	if report.State != "loaded-image-bound-unadmitted" {
		return report, writeGenerationFile(bundle, "receipt.json", body)
	}
	if err := writeGenerationFile(bundle, "receipt.pending.json", body); err != nil {
		return report, err
	}
	if afterPending != nil {
		afterPending()
	}
	retained, before, err := readComparisonFile(ctx, bundle.Name(), "receipt.pending.json", loadedImageReceiptBytes)
	if err == nil && !bytes.Equal(retained, body) {
		err = errors.New("pending loaded-image receipt changed before publication")
	}
	if err == nil {
		err = recheckLoadedImageFiles(ctx, bundle, files, true)
	}
	err = errors.Join(err, ctx.Err(), checkGenerationRoot(bundle))
	if err != nil {
		clearLoadedImageSuccess(&report, err)
		body, encodeErr := MarshalGeneratorLoadedImageReport(report)
		if encodeErr == nil {
			encodeErr = writeGenerationFile(bundle, "receipt.json", body)
		}
		return report, errors.Join(err, encodeErr)
	}
	if err := bundle.Link("receipt.pending.json", "receipt.json"); err != nil {
		return report, err
	}
	published, publishErr := bundle.Lstat("receipt.json")
	pending, pendingErr := bundle.Lstat("receipt.pending.json")
	if publishErr != nil || pendingErr != nil || !unchangedGeneratorFile(before.info, published) || !unchangedGeneratorFile(before.info, pending) {
		return report, errors.New("loaded-image receipt identity changed at publication; retained files require inspection")
	}
	if err := bundle.Remove("receipt.pending.json"); err != nil {
		return report, err
	}
	return report, SyncDirectory(bundle, ".")
}
