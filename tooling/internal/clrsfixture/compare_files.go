package clrsfixture

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"

	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/fileidentity"
)

type comparisonFileSnapshot struct {
	path   string
	sha256 string
	info   os.FileInfo
}

func loadComparisonInputs(ctx context.Context, options FixtureComparisonOptions) (inputs comparisonInputs, err error) {
	if err := ctx.Err(); err != nil {
		return inputs, err
	}
	inputs.root, err = cleanGeneratorRoot(options.RepositoryRoot)
	if err != nil {
		return inputs, err
	}
	inputs.first, err = resolveComparisonDirectory(inputs.root, options.FirstDirectory)
	if err != nil {
		return inputs, fmt.Errorf("first fixture root: %w", err)
	}
	inputs.second, err = resolveComparisonDirectory(inputs.root, options.SecondDirectory)
	if err != nil {
		return inputs, fmt.Errorf("second fixture root: %w", err)
	}
	inputs.sourceBody, err = readGeneratorFile(inputs.root, trackedSourcePath, maximumSourceRecordBytes)
	if err != nil {
		return inputs, err
	}
	inputs.source, err = ParseSourceRecord(inputs.sourceBody)
	if err != nil {
		return inputs, err
	}
	inputs.contractBody, err = readGeneratorFile(inputs.root, trackedGenerationPath, maximumGenerationContractBytes)
	if err != nil {
		return inputs, err
	}
	inputs.contract, err = ParseGenerationContract(inputs.contractBody, inputs.source)
	if err != nil {
		return inputs, err
	}
	inputs.plan, err = inputs.contract.Plan(inputs.source)
	return inputs, err
}

func resolveComparisonDirectory(root, value string) (string, error) {
	if value == "" {
		return "", errors.New("an explicit dataset directory is required")
	}
	if !filepath.IsAbs(value) {
		value = filepath.Join(root, value)
	}
	return cleanGeneratorRoot(value)
}

func newComparisonSnapshots(ctx context.Context, inputs comparisonInputs) ([2]*comparisonSnapshot, error) {
	snapshots := [2]*comparisonSnapshot{}
	for side, root := range []string{inputs.first, inputs.second} {
		directories, err := comparisonInventory(ctx, root, inputs.plan)
		if err != nil {
			return snapshots, fmt.Errorf("fixture tree %d: %w", side+1, err)
		}
		snapshots[side] = &comparisonSnapshot{root: root, directories: directories, tree: newComparisonTree()}
	}
	if os.SameFile(snapshots[0].directories[0], snapshots[1].directories[0]) {
		return snapshots, errors.New("two distinct fixture root directories are required")
	}
	return snapshots, nil
}

func comparisonInventory(ctx context.Context, root string, plan GenerationPlan) ([2]os.FileInfo, error) {
	var information [2]os.FileInfo
	entries, info, err := comparisonEntries(ctx, root, ".", 1)
	if err != nil {
		return information, err
	}
	information[0] = info
	if len(entries) != 1 || entries[0].Name() != plan.SplitName || !entries[0].IsDir() {
		return information, errors.New("fixture root must contain only the planned split directory")
	}
	entries, info, err = comparisonEntries(ctx, root, plan.SplitName, plan.Output.ExpectedFiles)
	if err != nil {
		return information, err
	}
	information[1] = info
	expected := make(map[string]bool, len(plan.Tasks))
	for _, task := range plan.Tasks {
		expected[filepath.Base(task.OutputRelativePath)] = true
	}
	if len(entries) != len(expected) {
		return information, errors.New("fixture file count differs from the generation contract")
	}
	for _, entry := range entries {
		if !expected[entry.Name()] || entry.Type() != 0 {
			return information, fmt.Errorf("unexpected or non-regular fixture entry %q", entry.Name())
		}
	}
	return information, nil
}

func comparisonEntries(ctx context.Context, root, relative string, maximum int) ([]os.DirEntry, os.FileInfo, error) {
	if err := ctx.Err(); err != nil {
		return nil, nil, err
	}
	path := filepath.Join(root, relative)
	if err := rejectGeneratorSymlink(root, path); err != nil {
		return nil, nil, err
	}
	before, err := fileidentity.Lstat(path)
	if err != nil || !before.IsDir() {
		return nil, nil, fmt.Errorf("fixture directory %s is not a real directory", path)
	}
	file, err := os.Open(path)
	if err != nil {
		return nil, nil, err
	}
	defer file.Close()
	opened, err := file.Stat()
	if err != nil || !os.SameFile(before, opened) {
		return nil, nil, fmt.Errorf("fixture directory %s changed before enumeration", path)
	}
	entries, err := file.ReadDir(maximum + 1)
	if err != nil && !errors.Is(err, io.EOF) {
		return nil, nil, err
	}
	if len(entries) > maximum {
		return nil, nil, fmt.Errorf("fixture directory %s exceeds its %d-entry limit", path, maximum)
	}
	after, err := fileidentity.Lstat(path)
	if err != nil || !sameComparisonDirectory(before, after) {
		return nil, nil, fmt.Errorf("fixture directory %s changed during enumeration", path)
	}
	if err := ctx.Err(); err != nil {
		return nil, nil, err
	}
	return entries, after, nil
}

func readComparisonFile(ctx context.Context, root, path string, maximum int64) ([]byte, comparisonFileSnapshot, error) {
	var snapshot comparisonFileSnapshot
	if err := ctx.Err(); err != nil {
		return nil, snapshot, err
	}
	absolute := filepath.Join(root, filepath.FromSlash(path))
	before, err := fileidentity.Lstat(absolute)
	if err != nil {
		return nil, snapshot, fmt.Errorf("inspect fixture %s: %w", path, err)
	}
	body, err := readGeneratorFileWithInterlock(root, path, maximum, ctx.Err)
	if err != nil {
		return nil, snapshot, err
	}
	after, err := fileidentity.Lstat(absolute)
	if err != nil || !unchangedGeneratorFile(before, after) {
		return nil, snapshot, fmt.Errorf("fixture file %s changed during read", path)
	}
	return body, comparisonFileSnapshot{path, rawSHA256(body), after}, nil
}

func recheckComparisonInputs(ctx context.Context, inputs comparisonInputs, snapshots [2]*comparisonSnapshot) error {
	for side, snapshot := range snapshots {
		if err := recheckFixtureSnapshot(ctx, inputs.plan, snapshot); err != nil {
			return fmt.Errorf("fixture tree %d: %w", side+1, err)
		}
	}
	return recheckFixtureAuthorities(ctx, inputs)
}

func recheckFixtureSnapshot(ctx context.Context, plan GenerationPlan, snapshot *comparisonSnapshot) error {
	for _, initial := range snapshot.files {
		_, current, err := readComparisonFile(ctx, snapshot.root, initial.path, plan.Output.MaxDatasetBytes)
		if err != nil {
			return err
		}
		if initial.sha256 != current.sha256 || !unchangedGeneratorFile(initial.info, current.info) {
			return fmt.Errorf("fixture file %s changed after comparison", initial.path)
		}
	}
	directories, err := comparisonInventory(ctx, snapshot.root, plan)
	if err != nil {
		return err
	}
	for index, initial := range snapshot.directories {
		if !sameComparisonDirectory(initial, directories[index]) {
			return errors.New("fixture directory changed after comparison")
		}
	}
	return ctx.Err()
}

func recheckFixtureAuthorities(ctx context.Context, inputs comparisonInputs) error {
	for _, authority := range []struct {
		path string
		body []byte
	}{
		{trackedSourcePath, inputs.sourceBody}, {trackedGenerationPath, inputs.contractBody},
	} {
		body, err := readGeneratorFileWithInterlock(inputs.root, authority.path, int64(len(authority.body)), ctx.Err)
		if err != nil {
			return err
		}
		if !bytes.Equal(body, authority.body) {
			return fmt.Errorf("CLRS authority %s changed after comparison", authority.path)
		}
	}
	return ctx.Err()
}

func sameComparisonDirectory(first, second os.FileInfo) bool {
	return first.IsDir() && second.IsDir() && os.SameFile(first, second) && first.ModTime().Equal(second.ModTime())
}
