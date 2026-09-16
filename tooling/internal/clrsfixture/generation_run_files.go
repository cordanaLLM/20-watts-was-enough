package clrsfixture

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"reflect"
	"runtime"
	"sort"
	"strings"
)

func marshalGenerationJSON(value any, maximum int) ([]byte, error) {
	var buffer bytes.Buffer
	encoder := json.NewEncoder(&buffer)
	encoder.SetEscapeHTML(false)
	encoder.SetIndent("", "  ")
	if err := encoder.Encode(value); err != nil {
		return nil, err
	}
	if buffer.Len() > maximum {
		return nil, errors.New("generation JSON exceeds its byte boundary")
	}
	return buffer.Bytes(), nil
}

func newGenerationRunBundle(inputs generationRunInputs) (*os.Root, error) {
	path := inputs.options.OutputDirectory
	parent, err := cleanGeneratorRoot(filepath.Dir(path))
	if err != nil {
		return nil, err
	}
	for _, protected := range []string{inputs.options.RepositoryRoot, inputs.options.Image.ManifestFile, inputs.options.Image.ConfigFile} {
		if protected == path || strings.HasPrefix(protected, path+string(filepath.Separator)) {
			return nil, errors.New("generation output cannot contain its source or supplied image inputs")
		}
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
	if err := root.Mkdir(filepath.Base(path), 0o700); err != nil {
		return nil, err
	}
	bundle, err := root.OpenRoot(filepath.Base(path))
	if err != nil {
		return nil, err
	}
	after, err := os.Lstat(parent)
	if err != nil || !os.SameFile(before, after) || after.Mode() != before.Mode() {
		bundle.Close()
		return nil, errors.New("generation output parent changed while creating the fresh bundle")
	}
	if err := syncGenerationDirectory(root, "."); err != nil {
		bundle.Close()
		return nil, err
	}
	return bundle, nil
}

func syncGenerationDirectory(root *os.Root, path string) error {
	directory, err := root.Open(path)
	if err != nil {
		return err
	}
	// Windows has no directory fsync: FlushFileBuffers on a directory handle
	// returns ERROR_ACCESS_DENIED. The rename carries the ordering guarantee that
	// fsync(dir) provides on POSIX.
	if runtime.GOOS == "windows" {
		return directory.Close()
	}
	return errors.Join(directory.Sync(), directory.Close())
}

func checkGenerationRoot(root *os.Root) error {
	opened, err := root.Stat(".")
	if err != nil {
		return err
	}
	path, err := cleanGeneratorRoot(root.Name())
	if err != nil {
		return err
	}
	named, err := os.Lstat(path)
	if err != nil || !os.SameFile(opened, named) || opened.Mode() != named.Mode() {
		return errors.New("generation output root identity changed")
	}
	return nil
}

func writeGenerationFile(root *os.Root, path string, body []byte) error {
	file, err := root.OpenFile(path, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o600)
	if err != nil {
		return err
	}
	before, statErr := file.Stat()
	n, writeErr := file.Write(body)
	if writeErr == nil && n != len(body) {
		writeErr = errors.New("short generation evidence write")
	}
	if err := errors.Join(statErr, writeErr, file.Sync(), file.Close()); err != nil {
		return err
	}
	after, err := root.Lstat(path)
	if err != nil || !after.Mode().IsRegular() || !os.SameFile(before, after) || after.Size() != int64(len(body)) {
		return errors.New("generation evidence identity changed while writing")
	}
	return syncGenerationDirectory(root, filepath.Dir(path))
}

func writeGenerationInputs(root *os.Root, inputs generationRunInputs, report GeneratorFixtureRun) error {
	// The durable name exists before any external command, including preflight.
	body, err := MarshalGeneratorFixtureRun(report)
	if err != nil {
		return err
	}
	if err := writeGenerationFile(root, "run-start.json", body); err != nil {
		return err
	}
	if err := root.Mkdir("inputs", 0o700); err != nil {
		return err
	}
	for _, identity := range report.Inputs {
		if err := writeGenerationFile(root, identity.Path, inputs.files[strings.TrimPrefix(identity.Path, "inputs/")]); err != nil {
			return err
		}
	}
	return syncGenerationDirectory(root, ".")
}

type generationBundleSnapshot struct {
	root        string
	complete    bool
	directories [4]os.FileInfo
	files       map[string]comparisonFileSnapshot
	bodies      map[string][]byte
}

func generationBundleInventory(ctx context.Context, root string, inputs generationRunInputs, complete bool) ([4]os.FileInfo, error) {
	var result [4]os.FileInfo
	expected := map[string]bool{"inputs": true, "dataset": true, "run-start.json": false, "output.tar": false}
	if complete {
		expected["commands.json"], expected["receipt.json"] = false, false
	}
	entries, info, err := comparisonEntries(ctx, root, ".", len(expected))
	if err != nil {
		return result, err
	}
	result[0] = info
	if len(entries) != len(expected) {
		return result, errors.New("generation bundle root does not contain its exact phase inventory")
	}
	for _, entry := range entries {
		directory, exists := expected[entry.Name()]
		if !exists || directory != entry.IsDir() || !directory && entry.Type() != 0 {
			return result, errors.New("generation bundle has an unexpected or non-regular entry")
		}
	}
	entries, info, err = comparisonEntries(ctx, root, "inputs", len(inputs.files))
	if err != nil {
		return result, err
	}
	result[1] = info
	if len(entries) != len(inputs.files) {
		return result, errors.New("generation bundle input inventory differs")
	}
	for _, entry := range entries {
		if _, exists := inputs.files[entry.Name()]; !exists || entry.Type() != 0 {
			return result, errors.New("generation bundle has an unexpected or non-regular input")
		}
	}
	dataset, err := comparisonInventory(ctx, filepath.Join(root, "dataset"), inputs.authority.plan)
	if err != nil {
		return result, err
	}
	result[2], result[3] = dataset[0], dataset[1]
	return result, nil
}

func loadGenerationBundle(ctx context.Context, inputs generationRunInputs) (generationBundleSnapshot, error) {
	return loadGenerationEvidence(ctx, inputs, true)
}

func loadGenerationEvidence(ctx context.Context, inputs generationRunInputs, complete bool) (snapshot generationBundleSnapshot, err error) {
	snapshot.complete = complete
	snapshot.root, err = cleanGeneratorRoot(inputs.options.OutputDirectory)
	if err != nil {
		return snapshot, err
	}
	snapshot.directories, err = generationBundleInventory(ctx, snapshot.root, inputs, complete)
	if err != nil {
		return snapshot, err
	}
	snapshot.files, snapshot.bodies = map[string]comparisonFileSnapshot{}, map[string][]byte{}
	limits := map[string]int64{"run-start.json": generationRunMaximumReceipt, "output.tar": generationRunMaximumTar}
	if complete {
		limits["receipt.json"], limits["commands.json"] = generationRunMaximumReceipt, generationRunMaximumLog
	}
	for name, body := range inputs.files {
		limits["inputs/"+name] = int64(len(body))
	}
	for _, path := range inputs.invocation.ExpectedPaths {
		limits["dataset/"+path] = inputs.authority.plan.Output.MaxDatasetBytes
	}
	for _, path := range sortedGenerationKeys(limits) {
		body, file, err := readComparisonFile(ctx, snapshot.root, path, limits[path])
		if err != nil {
			return snapshot, err
		}
		snapshot.files[path], snapshot.bodies[path] = file, body
		if expected, exists := inputs.files[strings.TrimPrefix(path, "inputs/")]; strings.HasPrefix(path, "inputs/") && exists && !reflect.DeepEqual(body, expected) {
			return snapshot, fmt.Errorf("retained generation input differs from current supplied authority: %s", path)
		}
	}
	return snapshot, nil
}

func sortedGenerationKeys[V any](values map[string]V) []string {
	keys := make([]string, 0, len(values))
	for key := range values {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	return keys
}

func recheckGenerationBundle(ctx context.Context, before generationBundleSnapshot, inputs generationRunInputs) error {
	after, err := generationBundleInventory(ctx, before.root, inputs, before.complete)
	if err != nil {
		return err
	}
	for index := range before.directories {
		if !sameComparisonDirectory(before.directories[index], after[index]) {
			return errors.New("generation bundle directory identity changed while checking")
		}
	}
	for _, path := range sortedGenerationKeys(before.files) {
		prior := before.files[path]
		_, current, err := readComparisonFile(ctx, before.root, path, int64(len(before.bodies[path])))
		if err != nil {
			return err
		}
		if current.sha256 != prior.sha256 || !unchangedGeneratorFile(prior.info, current.info) {
			return fmt.Errorf("generation bundle file changed while checking: %s", path)
		}
	}
	return ctx.Err()
}
