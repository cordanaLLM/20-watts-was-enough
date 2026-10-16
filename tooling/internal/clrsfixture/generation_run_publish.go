package clrsfixture

import (
	"bytes"
	"context"
	"errors"
	"os"
)

// Success is published by an exclusive hard link only after serialization,
// write, sync and a last cancellation check. Cancellation after that commit
// point does not retroactively undo publication. Post-commit I/O failure or
// process death still needs the external caller's exit/durability evidence.
func publishGenerationReceipt(ctx context.Context, root *os.Root, report GeneratorFixtureRun, afterPending func()) (GeneratorFixtureRun, error) {
	body, err := MarshalGeneratorFixtureRun(report)
	if err != nil {
		return report, err
	}
	if report.State != "fixtures-generated-unadmitted" {
		return report, writeGenerationFile(root, "receipt.json", body)
	}
	if err := writeGenerationFile(root, "receipt.pending.json", body); err != nil {
		return report, err
	}
	if afterPending != nil {
		afterPending()
	}
	retained, before, err := readComparisonFile(ctx, root.Name(), "receipt.pending.json", generationRunMaximumReceipt)
	if err == nil && !bytes.Equal(body, retained) {
		err = errors.New("pending generation receipt changed before publication")
	}
	err = errors.Join(err, ctx.Err(), checkGenerationRoot(root))
	if err != nil {
		clearGenerationRunSuccess(&report, err)
		body, encodeErr := MarshalGeneratorFixtureRun(report)
		if encodeErr == nil {
			encodeErr = writeGenerationFile(root, "receipt.json", body)
		}
		return report, errors.Join(err, encodeErr)
	}
	if err := root.Link("receipt.pending.json", "receipt.json"); err != nil {
		return report, err
	}
	published, publishErr := root.Lstat("receipt.json")
	pending, pendingErr := root.Lstat("receipt.pending.json")
	if publishErr != nil || pendingErr != nil || !unchangedGeneratorFile(before.info, published) || !unchangedGeneratorFile(before.info, pending) {
		return report, errors.New("generation receipt identity changed at publication; retained files require inspection")
	}
	if err := root.Remove("receipt.pending.json"); err != nil {
		return report, err
	}
	return report, SyncDirectory(root, ".")
}
