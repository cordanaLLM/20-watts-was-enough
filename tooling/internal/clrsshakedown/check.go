package clrsshakedown

import (
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"reflect"
	"time"

	"github.com/lusoris/20-watts-was-enough/tooling/internal/clrsfixture"
)

// Check rechecks retained bytes and policy/reference consistency without running
// a specialist, Docker or a subprocess. Unsigned receipts cannot prove execution.
func Check(ctx context.Context, options Options) (report Report, err error) {
	report = Report{SchemaVersion: 1, Authority: clrsfixture.ResultAuthority, State: "incomplete", RunID: options.RunID}
	defer func() {
		report.Authority = clrsfixture.ResultAuthority
		report.ImageAdmitted, report.ScientificResult = false, false
		if err != nil {
			report.State, report.Error = "incomplete", diagnostic(err)
		}
	}()
	if ctx == nil {
		return report, errors.New("shakedown checking requires a context")
	}
	if err := validateOptions(options); err != nil {
		return report, err
	}
	ctx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()
	tree, err := clrsfixture.LoadFixtureTree(ctx, clrsfixture.FixtureTreeOptions{RepositoryRoot: options.RepositoryRoot, DatasetDirectory: options.DatasetDirectory, ExpectedTreeSHA256: options.ExpectedTreeSHA256})
	if err != nil {
		return report, err
	}
	options.RepositoryRoot, options.DatasetDirectory = tree.RepositoryRoot, tree.DatasetDirectory
	bound, err := bindInputs(options, tree)
	if err != nil {
		return report, err
	}
	output, err := resolveOutput(options)
	if err != nil {
		return report, err
	}
	root, err := openDirectory(output)
	if err != nil {
		return report, err
	}
	defer func() { err = errors.Join(err, root.Close(), ctx.Err()) }()
	if err := checkInventory(root, ".", map[string]bool{"events": true, "receipt.json": false, "run-start.json": false}); err != nil {
		return report, err
	}
	receiptBytes, err := readFile(ctx, root, "receipt.json", maximumReportBytes)
	if err != nil {
		return report, err
	}
	if err := decode(receiptBytes, &report); err != nil {
		return report, err
	}
	if err := validateReport(report, options, tree); err != nil {
		return report, err
	}
	startBytes, err := readFile(ctx, root, "run-start.json", maximumReportBytes)
	if err != nil {
		return report, err
	}
	var start Report
	if err := decode(startBytes, &start); err != nil {
		return report, err
	}
	wantStart := report
	wantStart.State, wantStart.Finished, wantStart.InputsRechecked = "incomplete", time.Time{}, false
	wantStart.Cases, wantStart.Events, wantStart.EventBytes = []Case{}, []Artifact{}, 0
	if !reflect.DeepEqual(start, wantStart) {
		return report, errors.New("shakedown run-start identity differs from its receipt")
	}
	if err := checkEvents(ctx, root, bound, report); err != nil {
		return report, err
	}
	for name, original := range map[string][]byte{"run-start.json": startBytes, "receipt.json": receiptBytes} {
		current, err := readFile(ctx, root, name, maximumReportBytes)
		if err != nil || identify(current) != identify(original) {
			return report, errors.New("shakedown receipt changed during check")
		}
	}
	if err := tree.Recheck(ctx); err != nil {
		return report, err
	}
	if err := checkBundleRoot(root); err != nil {
		return report, err
	}
	if err := checkInventory(root, ".", map[string]bool{"events": true, "receipt.json": false, "run-start.json": false}); err != nil {
		return report, err
	}
	report.State = "bundle-consistent-unadmitted"
	return report, ctx.Err()
}

func validateReport(report Report, options Options, tree clrsfixture.FixtureTree) error {
	if report.SchemaVersion != 1 || report.Authority != clrsfixture.ResultAuthority || report.State != "completed-unadmitted" ||
		report.RunID != options.RunID || report.Error != "" || report.ImageAdmitted || report.ScientificResult ||
		!report.InputsRechecked || len(report.Cases) != maximumExamples || len(report.Events) != maximumExamples*4 ||
		report.EventBytes <= 0 || report.EventBytes > maximumJournalBytes || report.TimeoutSeconds != 60 || report.RequestTimeoutMillis != 1000 {
		return errors.New("shakedown receipt is incomplete or changes the closed execution boundary")
	}
	if report.SourceID != tree.Plan.SourceID.String() || report.ContractID != tree.Plan.ContractID.String() ||
		report.SourceSHA256 != tree.SourceSHA256 || report.ContractSHA256 != tree.ContractSHA256 || report.TreeSHA256 != tree.TreeSHA256 || !reflect.DeepEqual(report.Inputs, tree.Files) {
		return errors.New("shakedown receipt has different input identities")
	}
	if report.Started.IsZero() || report.Finished.Before(report.Started) || report.Finished.Sub(report.Started) > runTimeout ||
		report.Executable.SizeBytes <= 0 || report.Executable.SizeBytes > 128<<20 || !validDigest(report.Executable.SHA256) {
		return errors.New("shakedown receipt has invalid time or executable bounds")
	}
	want := newReport(options, tree, report.Executable, report.Started)
	if !reflect.DeepEqual(report.Energy, want.Energy) || !reflect.DeepEqual(report.Limitations, want.Limitations) {
		return errors.New("shakedown receipt changes its unavailable measurement or authority limitations")
	}
	return nil
}

func checkInventory(root *os.Root, path string, expected map[string]bool) error {
	initial, err := root.Lstat(path)
	if err != nil || !initial.IsDir() || initial.Mode()&os.ModeSymlink != 0 {
		return errors.New("shakedown inventory requires a real directory")
	}
	file, err := root.Open(path)
	if err != nil {
		return err
	}
	entries, readErr := file.ReadDir(len(expected) + 1)
	closeErr := file.Close()
	if readErr != nil && !errors.Is(readErr, io.EOF) {
		return errors.Join(readErr, closeErr)
	}
	if closeErr != nil {
		return closeErr
	}
	if len(entries) != len(expected) {
		return errors.New("shakedown bundle has missing, extra or excessive files")
	}
	for _, entry := range entries {
		directory, present := expected[entry.Name()]
		info, err := root.Lstat(filepath.Join(path, entry.Name()))
		if err != nil || !present || directory != info.IsDir() || info.Mode()&os.ModeSymlink != 0 || !directory && !info.Mode().IsRegular() {
			return fmt.Errorf("unexpected shakedown entry %s", entry.Name())
		}
	}
	final, err := root.Lstat(path)
	if err != nil || !os.SameFile(initial, final) || !initial.ModTime().Equal(final.ModTime()) || initial.Mode() != final.Mode() {
		return errors.New("shakedown directory changed during inspection")
	}
	return nil
}

func validDigest(value string) bool {
	return len(value) == 64 && validateOptions(Options{RepositoryRoot: ".", DatasetDirectory: ".", OutputDirectory: ".", RunID: "check", ExpectedTreeSHA256: value}) == nil
}
