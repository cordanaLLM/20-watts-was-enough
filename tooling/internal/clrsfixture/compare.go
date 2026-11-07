package clrsfixture

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/binary"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"hash"
	"os"
	"sort"
	"time"
)

const comparisonTimeout = 30 * time.Second

// CompareDeadline bounds one CompareFixtures call, which runs all of its work
// under comparisonTimeout.
const CompareDeadline = comparisonTimeout

const maximumComparisonReportBytes = 64 << 10
const comparisonTreeDomain = "20w/clrs-fixture-tree/v1\x00"

// FixtureComparisonOptions declares three independent, operator-owned roots.
// Relative dataset directories resolve against RepositoryRoot, not the cwd.
type FixtureComparisonOptions struct {
	RepositoryRoot  string
	FirstDirectory  string
	SecondDirectory string
}

// FixtureFileComparison contains identities and counts, never prompt/answer data.
type FixtureFileComparison struct {
	Path           string `json:"path"`
	FirstSHA256    string `json:"first_sha256"`
	SecondSHA256   string `json:"second_sha256"`
	FirstBytes     int64  `json:"first_bytes"`
	SecondBytes    int64  `json:"second_bytes"`
	ByteEqual      bool   `json:"byte_equal"`
	FirstExamples  int    `json:"first_imported_examples"`
	SecondExamples int    `json:"second_imported_examples"`
}

// FixtureComparison is schema 1 of a read-only development check, not a run receipt.
type FixtureComparison struct {
	SchemaVersion      int                     `json:"schema_version"`
	Authority          string                  `json:"authority"`
	State              string                  `json:"state"`
	GenerationState    string                  `json:"generation_state,omitempty"`
	SourceID           string                  `json:"source_id,omitempty"`
	ContractID         string                  `json:"contract_id,omitempty"`
	SourceRecordSHA256 string                  `json:"source_record_sha256,omitempty"`
	ContractSHA256     string                  `json:"generation_contract_sha256,omitempty"`
	FirstDirectory     string                  `json:"first_directory,omitempty"`
	SecondDirectory    string                  `json:"second_directory,omitempty"`
	FirstTreeSHA256    string                  `json:"first_tree_sha256,omitempty"`
	SecondTreeSHA256   string                  `json:"second_tree_sha256,omitempty"`
	TreeHashDefinition string                  `json:"tree_hash_definition"`
	Limits             GenerationOutput        `json:"limits"`
	TimeoutSeconds     int                     `json:"timeout_seconds"`
	FirstExamples      int                     `json:"first_imported_examples"`
	SecondExamples     int                     `json:"second_imported_examples"`
	Files              []FixtureFileComparison `json:"files"`
	Error              string                  `json:"error,omitempty"`
	Limitations        []string                `json:"limitations"`
}

type comparisonInputs struct {
	root, first, second string
	source              SourceRecord
	contract            GenerationContract
	plan                GenerationPlan
	sourceBody          []byte
	contractBody        []byte
}

type comparisonSnapshot struct {
	root        string
	directories [2]os.FileInfo
	files       []comparisonFileSnapshot
	totalBytes  int64
	tree        hash.Hash
}

// CompareFixtures verifies complete supplied trees against the existing importer.
// It performs no writes, subprocesses or network requests. The timeout is checked
// between bounded local-file operations; it is not a kernel filesystem I/O limit.
func CompareFixtures(ctx context.Context, options FixtureComparisonOptions) (report FixtureComparison, err error) {
	report = newFixtureComparison()
	defer func() {
		if err != nil {
			report.Error = comparisonDiagnostic(err)
		}
	}()
	if ctx == nil {
		return report, errors.New("CLRS fixture comparison requires a context")
	}
	ctx, cancel := context.WithTimeout(ctx, comparisonTimeout)
	defer cancel()
	inputs, err := loadComparisonInputs(ctx, options)
	if err != nil {
		return report, err
	}
	report.SourceID, report.ContractID = inputs.plan.SourceID.String(), inputs.plan.ContractID.String()
	report.GenerationState, report.Limits = inputs.plan.GenerationState, inputs.plan.Output
	report.SourceRecordSHA256, report.ContractSHA256 = rawSHA256(inputs.sourceBody), rawSHA256(inputs.contractBody)
	report.FirstDirectory, report.SecondDirectory = inputs.first, inputs.second
	snapshots, err := newComparisonSnapshots(ctx, inputs)
	if err != nil {
		return report, err
	}
	paths := make([]string, 0, len(inputs.plan.Tasks))
	for _, task := range inputs.plan.Tasks {
		paths = append(paths, task.OutputRelativePath)
	}
	sort.Strings(paths)
	var problems []error
	for _, path := range paths {
		file, err := compareFixtureFile(ctx, inputs, path, snapshots)
		if err != nil {
			problems = append(problems, err)
		}
		report.Files = append(report.Files, file)
		report.FirstExamples += file.FirstExamples
		report.SecondExamples += file.SecondExamples
		if err := ctx.Err(); err != nil {
			return report, errors.Join(append(problems, err)...)
		}
	}
	if err := recheckComparisonInputs(ctx, inputs, snapshots); err != nil {
		return report, errors.Join(append(problems, err)...)
	}
	// A partial read must not be labelled with the digest of a complete tree.
	if len(snapshots[0].files) == inputs.plan.Output.ExpectedFiles && len(snapshots[1].files) == inputs.plan.Output.ExpectedFiles {
		report.FirstTreeSHA256 = hex.EncodeToString(snapshots[0].tree.Sum(nil))
		report.SecondTreeSHA256 = hex.EncodeToString(snapshots[1].tree.Sum(nil))
	}
	if len(problems) != 0 {
		return report, errors.Join(problems...)
	}
	if report.FirstExamples != inputs.plan.Output.ExpectedExamples || report.SecondExamples != inputs.plan.Output.ExpectedExamples {
		return report, errors.New("CLRS imported example totals differ from the generation contract")
	}
	report.State = "fixtures-byte-equal-and-import-valid"
	return report, nil
}

func newFixtureComparison() FixtureComparison {
	return FixtureComparison{
		SchemaVersion: 1, Authority: ResultAuthority, State: "failed", TimeoutSeconds: int(comparisonTimeout / time.Second),
		Files:              []FixtureFileComparison{},
		TreeHashDefinition: "SHA256(domain 20w/clrs-fixture-tree/v1 NUL, then each sorted slash path: uint64be path byte length, path bytes, uint64be content byte length, content bytes)",
		Limitations: []string{
			"Supplied-tree byte comparison and existing Go import validation only; fresh execution, container limits and generator provenance require separate receipts.",
			"No scientific result, generator image admission, release or independent human review is implied.",
			"Roots are operator-owned; this is not isolation against a malicious same-UID host process. Cancellation is checked between bounded local-file operations.",
		},
	}
}

func compareFixtureFile(ctx context.Context, inputs comparisonInputs, path string, snapshots [2]*comparisonSnapshot) (FixtureFileComparison, error) {
	report := FixtureFileComparison{Path: path}
	var bodies [2][]byte
	for side, snapshot := range snapshots {
		body, entry, err := readComparisonFile(ctx, snapshot.root, path, inputs.plan.Output.MaxDatasetBytes)
		if err != nil {
			return report, fmt.Errorf("fixture tree %d: %w", side+1, err)
		}
		snapshot.totalBytes += int64(len(body))
		if snapshot.totalBytes > inputs.plan.Output.MaxTotalBytes {
			return report, fmt.Errorf("fixture tree %d exceeds total byte bound", side+1)
		}
		snapshot.files = append(snapshot.files, entry)
		addComparisonTreeFile(snapshot.tree, path, body)
		bodies[side] = body
	}
	report.FirstSHA256, report.SecondSHA256 = rawSHA256(bodies[0]), rawSHA256(bodies[1])
	report.FirstBytes, report.SecondBytes = int64(len(bodies[0])), int64(len(bodies[1]))
	report.ByteEqual = bytes.Equal(bodies[0], bodies[1])
	var problems []error
	if !report.ByteEqual {
		problems = append(problems, fmt.Errorf("fixture bytes differ: %s", path))
	}
	counts := [2]int{}
	for side, body := range bodies {
		count, err := importComparisonDataset(ctx, inputs, path, body)
		counts[side] = count
		if err != nil {
			problems = append(problems, fmt.Errorf("fixture tree %d %s: %w", side+1, path, err))
		}
	}
	report.FirstExamples, report.SecondExamples = counts[0], counts[1]
	return report, errors.Join(problems...)
}

func importComparisonDataset(ctx context.Context, inputs comparisonInputs, path string, body []byte) (int, error) {
	if err := ctx.Err(); err != nil {
		return 0, err
	}
	out := inputs.plan.Output
	limits := ImportLimits{out.MaxDatasetBytes, out.ExpectedExamples, out.MaxPromptBytes, out.MaxReferenceBytes, out.MaxRequestedLength}
	candidates, verifiers, err := ImportDataset(bytes.NewReader(body), inputs.source, inputs.contract, path, limits)
	if err != nil {
		return 0, err
	}
	pairs, err := PairExamples(inputs.source, inputs.contract, path, candidates, verifiers)
	if err != nil {
		return 0, err
	}
	if err := ctx.Err(); err != nil {
		return 0, err
	}
	return len(pairs), nil
}

func addComparisonTreeFile(tree hash.Hash, path string, body []byte) {
	var length [8]byte
	binary.BigEndian.PutUint64(length[:], uint64(len(path)))
	tree.Write(length[:])
	tree.Write([]byte(path))
	binary.BigEndian.PutUint64(length[:], uint64(len(body)))
	tree.Write(length[:])
	tree.Write(body)
}

func newComparisonTree() hash.Hash {
	tree := sha256.New()
	tree.Write([]byte(comparisonTreeDomain))
	return tree
}

// MarshalFixtureComparison emits one bounded, deterministic schema-1 JSON report.
func MarshalFixtureComparison(report FixtureComparison) ([]byte, error) {
	body, err := json.MarshalIndent(report, "", "  ")
	if err != nil {
		return nil, fmt.Errorf("encode CLRS fixture comparison: %w", err)
	}
	if len(body)+1 > maximumComparisonReportBytes {
		return nil, errors.New("CLRS fixture comparison report exceeds 64 KiB")
	}
	return append(body, '\n'), nil
}

func comparisonDiagnostic(err error) string {
	message := err.Error()
	if len(message) > 4096 {
		return message[:4096] + " [diagnostic truncated]"
	}
	return message
}
