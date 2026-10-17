package clrsfixture

import (
	"archive/tar"
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"slices"
)

func (runner *generationRunner) extract(ctx context.Context, bundle *os.Root) (GeneratorFixtureFile, error) {
	if _, err := runner.inspect(ctx, true, true, false); err != nil {
		return GeneratorFixtureFile{}, err
	}
	file, err := bundle.OpenFile("output.tar", os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o600)
	if err != nil {
		return GeneratorFixtureFile{}, err
	}
	hasher := sha256.New()
	record, runErr := runner.command(ctx, 60, io.MultiWriter(file, hasher), generationRunMaximumTar, false,
		runner.execArguments(generationReaderProgram(runner.inputs))...)
	if err := errors.Join(runErr, file.Sync(), file.Close()); err != nil {
		return GeneratorFixtureFile{}, err
	}
	if len(record.Stderr) != 0 || len(record.Stdout) != 0 {
		return GeneratorFixtureFile{}, errors.New("streamed output reader returned unexpected captured output")
	}
	body, before, err := readComparisonFile(ctx, bundle.Name(), "output.tar", generationRunMaximumTar)
	if err != nil {
		return GeneratorFixtureFile{}, err
	}
	identity := generationFileIdentity("output.tar", body)
	if identity.SHA256 != hex.EncodeToString(hasher.Sum(nil)) {
		return identity, errors.New("generation tar differs from its captured stream")
	}
	if err := bundle.Mkdir("dataset", 0o700); err != nil {
		return identity, err
	}
	if err := bundle.Mkdir("dataset/"+runner.inputs.authority.plan.SplitName, 0o700); err != nil {
		return identity, err
	}
	err = visitGenerationTar(ctx, body, runner.inputs, func(path string, content []byte) error {
		return writeGenerationFile(bundle, "dataset/"+path, content)
	})
	if err != nil {
		return identity, err
	}
	if _, err := runner.inspect(ctx, true, true, false); err != nil {
		return identity, err
	}
	_, after, err := readComparisonFile(ctx, bundle.Name(), "output.tar", generationRunMaximumTar)
	if err != nil || !unchangedGeneratorFile(before.info, after.info) || before.sha256 != after.sha256 {
		return identity, errors.New("generation tar changed after extraction or inspection")
	}
	return identity, SyncDirectory(bundle, ".")
}

// Fixed USTAR framing is deliberately narrower than a general archive parser.
// In particular, tar.Reader's bare EOF is not accepted as a complete terminator.
func visitGenerationTar(ctx context.Context, body []byte, inputs generationRunInputs, visit func(string, []byte) error) error {
	if len(body) == 0 || len(body) > generationRunMaximumTar || len(body)%512 != 0 {
		return errors.New("generation tar type or size violates its byte boundary")
	}
	stream := bytes.NewReader(body)
	reader := tar.NewReader(stream)
	paths := inputs.invocation.ExpectedPaths
	runtime, output := inputs.authority.image.Runtime, inputs.authority.plan.Output
	var total int64
	for _, expectedPath := range paths {
		if err := ctx.Err(); err != nil {
			return err
		}
		header, err := reader.Next()
		if errors.Is(err, io.EOF) {
			return errors.New("generation tar lacks its exact file set and two-block terminator")
		}
		if err != nil {
			return err
		}
		if header.Name != expectedPath || header.Typeflag != tar.TypeReg || header.Format != tar.FormatUSTAR ||
			header.Size < 1 || header.Size > output.MaxDatasetBytes || header.Mode != 0o644 || header.Uid != runtime.UID || header.Gid != runtime.GID ||
			header.ModTime.Unix() != inputs.authority.image.Builder.SourceDateEpoch || header.Linkname != "" || len(header.PAXRecords)+len(header.Xattrs) != 0 {
			return errors.New("generation tar member differs from the fixed USTAR contract")
		}
		total += header.Size
		if total > output.MaxTotalBytes {
			return errors.New("generation dataset exceeds its aggregate byte boundary")
		}
		content := make([]byte, header.Size)
		if _, err := io.ReadFull(reader, content); err != nil {
			return err
		}
		if err := visit(header.Name, content); err != nil {
			return err
		}
	}
	if err := ctx.Err(); err != nil {
		return err
	}
	before := stream.Len()
	_, err := reader.Next()
	if err == nil {
		return errors.New("generation tar member differs from the fixed USTAR contract")
	}
	if !errors.Is(err, io.EOF) {
		return err
	}
	if before-stream.Len() < 1024 {
		return errors.New("generation tar lacks its exact file set and two-block terminator")
	}
	trailing := body[len(body)-stream.Len():]
	if len(trailing) > 10240 || len(trailing)%512 != 0 || slices.ContainsFunc(trailing, func(value byte) bool { return value != 0 }) {
		return errors.New("generation tar has excess or nonzero trailing framing")
	}
	return ctx.Err()
}

func checkGenerationDataset(ctx context.Context, bundle string, inputs generationRunInputs) ([]GeneratorFixtureFile, string, int, error) {
	root, err := cleanGeneratorRoot(filepath.Join(bundle, "dataset"))
	if err != nil {
		return nil, "", 0, err
	}
	before, err := comparisonInventory(ctx, root, inputs.authority.plan)
	if err != nil {
		return nil, "", 0, err
	}
	comparison := comparisonInputs{root: inputs.options.RepositoryRoot, source: inputs.authority.source,
		contract: inputs.authority.contract, plan: inputs.authority.plan}
	files := make([]GeneratorFixtureFile, 0, len(inputs.invocation.ExpectedPaths))
	snapshots := make([]comparisonFileSnapshot, 0, len(inputs.invocation.ExpectedPaths))
	tree, count, total := newComparisonTree(), 0, int64(0)
	for _, path := range inputs.invocation.ExpectedPaths {
		body, snapshot, err := readComparisonFile(ctx, root, path, comparison.plan.Output.MaxDatasetBytes)
		if err != nil {
			return nil, "", 0, err
		}
		total += int64(len(body))
		if total > comparison.plan.Output.MaxTotalBytes {
			return nil, "", 0, errors.New("generated dataset exceeds its aggregate byte boundary")
		}
		imported, err := importComparisonDataset(ctx, comparison, path, body)
		if err != nil {
			return nil, "", 0, err
		}
		identity := generationFileIdentity(path, body)
		identity.ImportedExamples = imported
		files, snapshots = append(files, identity), append(snapshots, snapshot)
		addComparisonTreeFile(tree, path, body)
		count += imported
	}
	if count != inputs.invocation.ExpectedExamples {
		return nil, "", 0, errors.New("generated imported example count differs from the plan")
	}
	for _, prior := range snapshots {
		_, current, err := readComparisonFile(ctx, root, prior.path, comparison.plan.Output.MaxDatasetBytes)
		if err != nil || current.sha256 != prior.sha256 || !unchangedGeneratorFile(prior.info, current.info) {
			return nil, "", 0, fmt.Errorf("generated dataset changed during validation: %s", prior.path)
		}
	}
	after, err := comparisonInventory(ctx, root, comparison.plan)
	if err != nil {
		return nil, "", 0, err
	}
	for index := range before {
		if !sameComparisonDirectory(before[index], after[index]) {
			return nil, "", 0, errors.New("generated dataset directory changed during validation")
		}
	}
	return files, hex.EncodeToString(tree.Sum(nil)), count, ctx.Err()
}
