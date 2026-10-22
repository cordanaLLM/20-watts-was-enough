package clrsfixture

import (
	"errors"
	"fmt"
	"io"
	"math"
	"strings"
)

const (
	maximumDatasetBytesCeiling   = 64 << 20
	maximumExamplesCeiling       = 100_000
	maximumExampleBytesCeiling   = 1 << 20
	maximumDeclaredLengthCeiling = 1 << 20
)

// LengthSemantics distinguishes an effective input length from the CLRS
// segment sampler's ignored length argument and fixed four endpoints.
type LengthSemantics string

const (
	LengthDeclaredInput      LengthSemantics = "declared_length"
	LengthFixedFourEndpoints LengthSemantics = "fixed_four_endpoints"
)

// ImportLimits are caller safety caps. The generation contract can only narrow
// them; it cannot enlarge them.
type ImportLimits struct {
	MaxDatasetBytes   int64
	MaxExamples       int
	MaxPromptBytes    int
	MaxReferenceBytes int
	MaxDeclaredLength int64
}

// CandidateExample is the complete candidate-visible record. It contains no
// reference answer or answer-derived digest.
type CandidateExample struct {
	ID                 CandidateID
	Authority          string
	Source             SourceID
	Contract           ContractID
	OutputRelativePath string
	Task               TaskKind
	Ordinal            uint64
	Prompt             string
	LengthSemantics    LengthSemantics
	RequestedLength    int64
	EffectiveInputSize int64
	Seed               int64
	UseHints           bool
}

// VerifierExample is held outside the candidate-visible record.
type VerifierExample struct {
	ID          VerifierID
	Authority   string
	Source      SourceID
	Contract    ContractID
	CandidateID CandidateID
	Reference   string
}

// CandidateSet contains only values safe to send across a candidate seam.
type CandidateSet struct {
	Authority          string
	Source             SourceID
	Contract           ContractID
	OutputRelativePath string
	DatasetName        string
	Task               TaskKind
	LengthSemantics    LengthSemantics
	Examples           []CandidateExample
}

// VerifierSet contains the exact answers for a separate verifier boundary.
type VerifierSet struct {
	Authority          string
	Source             SourceID
	Contract           ContractID
	OutputRelativePath string
	DatasetName        string
	Task               TaskKind
	LengthSemantics    LengthSemantics
	Examples           []VerifierExample
}

// PairedExample is returned only after both separated records have been
// validated against their source-bound generation contract.
type PairedExample struct {
	Candidate CandidateExample
	Verifier  VerifierExample
}

type upstreamDataset struct {
	Name     string            `json:"name"`
	Examples []upstreamExample `json:"examples"`
}

type upstreamExample struct {
	Prompt     string            `json:"prompt"`
	References []string          `json:"references"`
	Auxiliary  upstreamAuxiliary `json:"auxiliary"`
}

type upstreamAuxiliary struct {
	Length   *int64 `json:"length"`
	Seed     *int64 `json:"seed"`
	UseHints *bool  `json:"use_hints"`
}

type checkedExample struct {
	requestedLength int64
	effectiveSize   int64
	seed            int64
	prompt          string
	reference       string
	useHints        bool
}

type contractScope struct {
	sourceID   SourceID
	contractID ContractID
	plan       GenerationPlan
	task       TaskPlan
}

type importScope struct {
	contractScope
	maxDatasetBytes   int64
	maxPromptBytes    int
	maxReferenceBytes int
	maxDeclaredLength int64
}

type cellKey struct {
	length int64
	seed   int64
}

type cellCounter struct {
	allowed map[cellKey]int
	seen    map[cellKey]int
	task    TaskPlan
	plan    GenerationPlan
}

// ImportDataset splits the one exact task file selected by outputRelativePath
// into candidate and verifier views. Task, length, seed, hint, and sample-count
// authority comes only from the validated generation contract.
func ImportDataset(
	reader io.Reader,
	source SourceRecord,
	contract GenerationContract,
	outputRelativePath string,
	limits ImportLimits,
) (CandidateSet, VerifierSet, error) {
	scope, err := newImportScope(source, contract, outputRelativePath, limits)
	if err != nil {
		return CandidateSet{}, VerifierSet{}, err
	}
	body, err := readBounded(reader, scope.maxDatasetBytes)
	if err != nil {
		return CandidateSet{}, VerifierSet{}, fmt.Errorf("read CLRS dataset: %w", err)
	}
	var dataset upstreamDataset
	if err := decodeStrict(body, 5, &dataset); err != nil {
		return CandidateSet{}, VerifierSet{}, fmt.Errorf("parse CLRS dataset: %w", err)
	}
	expectedName := datasetName(scope.task.Task)
	if dataset.Name != expectedName {
		return CandidateSet{}, VerifierSet{}, fmt.Errorf("CLRS dataset name = %q, want %q for %s", dataset.Name, expectedName, outputRelativePath)
	}
	if len(dataset.Examples) != scope.task.ExpectedExamples {
		return CandidateSet{}, VerifierSet{}, fmt.Errorf(
			"CLRS example count = %d, want exactly %d for %s",
			len(dataset.Examples), scope.task.ExpectedExamples, outputRelativePath,
		)
	}

	candidates := newCandidateSet(scope.contractScope, dataset.Name, len(dataset.Examples))
	verifiers := newVerifierSet(scope.contractScope, dataset.Name, len(dataset.Examples))
	cells := newCellCounter(scope.contractScope)
	for index, raw := range dataset.Examples {
		checked, checkErr := checkUpstreamExample(raw, scope)
		if checkErr != nil {
			return CandidateSet{}, VerifierSet{}, fmt.Errorf("validate CLRS example %d: %w", index, checkErr)
		}
		if checkErr := cells.observe(checked.requestedLength, checked.seed); checkErr != nil {
			return CandidateSet{}, VerifierSet{}, fmt.Errorf("validate CLRS example %d: %w", index, checkErr)
		}
		candidate := makeCandidate(scope.contractScope, dataset.Name, uint64(index), checked)
		verifier := makeVerifier(scope.contractScope, candidate.ID, checked.reference)
		candidates.Examples = append(candidates.Examples, candidate)
		verifiers.Examples = append(verifiers.Examples, verifier)
	}
	if err := cells.complete(); err != nil {
		return CandidateSet{}, VerifierSet{}, err
	}
	if _, err := PairExamples(source, contract, outputRelativePath, candidates, verifiers); err != nil {
		return CandidateSet{}, VerifierSet{}, fmt.Errorf("validate imported CLRS records: %w", err)
	}
	return candidates, verifiers, nil
}

func indexVerifierExamples(scope contractScope, verifiers []VerifierExample) (map[CandidateID]VerifierExample, error) {
	byCandidate := make(map[CandidateID]VerifierExample, len(verifiers))
	for index, verifier := range verifiers {
		if err := validateVerifierRecord(scope, verifier); err != nil {
			return nil, fmt.Errorf("validate CLRS verifier %d: %w", index, err)
		}
		if _, exists := byCandidate[verifier.CandidateID]; exists {
			return nil, fmt.Errorf("CLRS verifier %d duplicates candidate identity %s", index, verifier.CandidateID.String())
		}
		byCandidate[verifier.CandidateID] = verifier
	}
	return byCandidate, nil
}

func pairCandidateExamples(
	scope contractScope,
	datasetName string,
	candidates []CandidateExample,
	byCandidate map[CandidateID]VerifierExample,
) ([]PairedExample, error) {
	cells := newCellCounter(scope)
	seenCandidates := make(map[CandidateID]struct{}, len(candidates))
	pairs := make([]PairedExample, 0, len(candidates))
	for index, candidate := range candidates {
		if err := validateCandidateRecord(scope, datasetName, uint64(index), candidate); err != nil {
			return nil, fmt.Errorf("validate CLRS candidate %d: %w", index, err)
		}
		if _, exists := seenCandidates[candidate.ID]; exists {
			return nil, fmt.Errorf("CLRS candidate %d duplicates identity %s", index, candidate.ID.String())
		}
		seenCandidates[candidate.ID] = struct{}{}
		if err := cells.observe(candidate.RequestedLength, candidate.Seed); err != nil {
			return nil, fmt.Errorf("validate CLRS candidate %d: %w", index, err)
		}
		verifier, exists := byCandidate[candidate.ID]
		if !exists {
			return nil, fmt.Errorf("CLRS candidate %d has no verifier", index)
		}
		pairs = append(pairs, PairedExample{Candidate: candidate, Verifier: verifier})
		delete(byCandidate, candidate.ID)
	}
	if err := cells.complete(); err != nil {
		return nil, err
	}
	return pairs, nil
}

// PairExamples validates both separated sets against the caller's exact
// contract-selected output path, recomputes every identity, and returns
// verifier records in candidate order. It rejects identity-inconsistent,
// missing, duplicate, foreign, or contract-incomplete records.
func PairExamples(
	source SourceRecord,
	contract GenerationContract,
	outputRelativePath string,
	candidates CandidateSet,
	verifiers VerifierSet,
) ([]PairedExample, error) {
	scope, err := newContractScope(source, contract, outputRelativePath)
	if err != nil {
		return nil, err
	}
	if err := validateCandidateSetMetadata(scope, candidates); err != nil {
		return nil, err
	}
	if err := validateVerifierSetMetadata(scope, verifiers); err != nil {
		return nil, err
	}
	if len(candidates.Examples) != scope.task.ExpectedExamples {
		return nil, fmt.Errorf("CLRS candidate count = %d, want exactly %d", len(candidates.Examples), scope.task.ExpectedExamples)
	}
	if len(verifiers.Examples) != scope.task.ExpectedExamples {
		return nil, fmt.Errorf("CLRS verifier count = %d, want exactly %d", len(verifiers.Examples), scope.task.ExpectedExamples)
	}
	byCandidate, err := indexVerifierExamples(scope, verifiers.Examples)
	if err != nil {
		return nil, err
	}
	pairs, err := pairCandidateExamples(scope, candidates.DatasetName, candidates.Examples, byCandidate)
	if err != nil {
		return nil, err
	}
	if len(byCandidate) != 0 {
		return nil, fmt.Errorf("CLRS verifier set contains %d foreign candidate bindings", len(byCandidate))
	}
	return pairs, nil
}

// Validate rejects limits that are non-positive or too large to remain useful
// parser bounds.
func (limits ImportLimits) Validate() error {
	if limits.MaxDatasetBytes <= 0 || limits.MaxDatasetBytes > maximumDatasetBytesCeiling {
		return fmt.Errorf("CLRS dataset byte limit must be between 1 and %d", maximumDatasetBytesCeiling)
	}
	if limits.MaxExamples <= 0 || limits.MaxExamples > maximumExamplesCeiling {
		return fmt.Errorf("CLRS example limit must be between 1 and %d", maximumExamplesCeiling)
	}
	if limits.MaxPromptBytes <= 0 || limits.MaxPromptBytes > maximumExampleBytesCeiling ||
		limits.MaxReferenceBytes <= 0 || limits.MaxReferenceBytes > maximumExampleBytesCeiling {
		return fmt.Errorf("CLRS prompt and reference limits must be between 1 and %d", maximumExampleBytesCeiling)
	}
	if limits.MaxDeclaredLength <= 0 || limits.MaxDeclaredLength > maximumDeclaredLengthCeiling {
		return fmt.Errorf("CLRS declared-length limit must be between 1 and %d", maximumDeclaredLengthCeiling)
	}
	return nil
}

func newImportScope(
	source SourceRecord,
	contract GenerationContract,
	outputRelativePath string,
	limits ImportLimits,
) (importScope, error) {
	if err := limits.Validate(); err != nil {
		return importScope{}, err
	}
	scope, err := newContractScope(source, contract, outputRelativePath)
	if err != nil {
		return importScope{}, err
	}
	if limits.MaxExamples < scope.task.ExpectedExamples {
		return importScope{}, fmt.Errorf(
			"CLRS caller example limit = %d, below required task count %d",
			limits.MaxExamples, scope.task.ExpectedExamples,
		)
	}
	for _, size := range scope.task.Sizes {
		if size.RequestedLength > limits.MaxDeclaredLength {
			return importScope{}, fmt.Errorf(
				"CLRS caller declared-length limit = %d, below selected length %d",
				limits.MaxDeclaredLength, size.RequestedLength,
			)
		}
	}
	return importScope{
		contractScope:     scope,
		maxDatasetBytes:   smallerInt64(limits.MaxDatasetBytes, scope.plan.Output.MaxDatasetBytes),
		maxPromptBytes:    smallerInt(limits.MaxPromptBytes, scope.plan.Output.MaxPromptBytes),
		maxReferenceBytes: smallerInt(limits.MaxReferenceBytes, scope.plan.Output.MaxReferenceBytes),
		maxDeclaredLength: smallerInt64(limits.MaxDeclaredLength, scope.plan.Output.MaxRequestedLength),
	}, nil
}

func newContractScope(
	source SourceRecord,
	contract GenerationContract,
	outputRelativePath string,
) (contractScope, error) {
	plan, err := contract.Plan(source)
	if err != nil {
		return contractScope{}, fmt.Errorf("validate CLRS import contract: %w", err)
	}
	for _, task := range plan.Tasks {
		if outputRelativePath == task.OutputRelativePath {
			return contractScope{
				sourceID:   plan.SourceID,
				contractID: plan.ContractID,
				plan:       plan,
				task:       task,
			}, nil
		}
	}
	return contractScope{}, fmt.Errorf("CLRS output path %q is not selected by the generation contract", outputRelativePath)
}

func checkUpstreamExample(raw upstreamExample, scope importScope) (checkedExample, error) {
	if err := validatePrompt(raw.Prompt, scope.task.Task, scope.maxPromptBytes); err != nil {
		return checkedExample{}, err
	}
	if len(raw.References) != 1 {
		return checkedExample{}, fmt.Errorf("reference count = %d, want exactly 1", len(raw.References))
	}
	if err := validateReference(raw.References[0], scope.maxReferenceBytes); err != nil {
		return checkedExample{}, err
	}
	if raw.Auxiliary.Length == nil || raw.Auxiliary.Seed == nil || raw.Auxiliary.UseHints == nil {
		return checkedExample{}, errors.New("auxiliary length, seed, and use_hints are all required")
	}
	if *raw.Auxiliary.Length <= 0 || *raw.Auxiliary.Length > scope.maxDeclaredLength {
		return checkedExample{}, fmt.Errorf("declared length = %d, want 1..%d", *raw.Auxiliary.Length, scope.maxDeclaredLength)
	}
	if *raw.Auxiliary.Seed < math.MinInt32 || *raw.Auxiliary.Seed > math.MaxInt32 {
		return checkedExample{}, errors.New("seed is outside the upstream signed 32-bit range")
	}
	if *raw.Auxiliary.UseHints != scope.plan.UseHints {
		return checkedExample{}, fmt.Errorf("use_hints = %t, want contract value %t", *raw.Auxiliary.UseHints, scope.plan.UseHints)
	}
	effectiveSize, err := effectiveInputSize(*raw.Auxiliary.Length, scope.task.LengthSemantics)
	if err != nil {
		return checkedExample{}, err
	}
	return checkedExample{
		requestedLength: *raw.Auxiliary.Length,
		effectiveSize:   effectiveSize,
		seed:            *raw.Auxiliary.Seed,
		prompt:          raw.Prompt,
		reference:       raw.References[0],
		useHints:        *raw.Auxiliary.UseHints,
	}, nil
}

func validatePrompt(prompt string, task TaskKind, maximumBytes int) error {
	if prompt == "" || len(prompt) > maximumBytes || strings.IndexByte(prompt, 0) >= 0 {
		return fmt.Errorf("prompt must contain 1..%d non-NUL bytes", maximumBytes)
	}
	if !strings.HasPrefix(prompt, string(task)+":\n") {
		return fmt.Errorf("prompt does not bind contract task %q", task)
	}
	return nil
}

func validateReference(reference string, maximumBytes int) error {
	if reference == "" || len(reference) > maximumBytes || strings.IndexByte(reference, 0) >= 0 {
		return fmt.Errorf("reference must contain 1..%d non-NUL bytes", maximumBytes)
	}
	return nil
}

func effectiveInputSize(requestedLength int64, semantics LengthSemantics) (int64, error) {
	switch semantics {
	case LengthDeclaredInput:
		return requestedLength, nil
	case LengthFixedFourEndpoints:
		return 4, nil
	default:
		return 0, fmt.Errorf("unsupported CLRS length semantics %q", semantics)
	}
}

func newCellCounter(scope contractScope) cellCounter {
	allowed := make(map[cellKey]int, len(scope.task.Sizes)*len(scope.plan.Seeds))
	for _, size := range scope.task.Sizes {
		for _, seed := range scope.plan.Seeds {
			allowed[cellKey{length: size.RequestedLength, seed: seed}] = scope.plan.SamplesPerCell
		}
	}
	return cellCounter{
		allowed: allowed,
		seen:    make(map[cellKey]int, len(allowed)),
		task:    scope.task,
		plan:    scope.plan,
	}
}

func (counter *cellCounter) observe(length, seed int64) error {
	key := cellKey{length: length, seed: seed}
	allowed, selected := counter.allowed[key]
	if !selected {
		return fmt.Errorf("length/seed cell (%d, %d) is not selected by the generation contract", length, seed)
	}
	counter.seen[key]++
	if counter.seen[key] > allowed {
		return fmt.Errorf(
			"length/seed cell (%d, %d) multiplicity = %d, want %d",
			length, seed, counter.seen[key], allowed,
		)
	}
	return nil
}

func (counter cellCounter) complete() error {
	for _, size := range counter.task.Sizes {
		for _, seed := range counter.plan.Seeds {
			key := cellKey{length: size.RequestedLength, seed: seed}
			if counter.seen[key] != counter.allowed[key] {
				return fmt.Errorf(
					"length/seed cell (%d, %d) multiplicity = %d, want %d",
					key.length, key.seed, counter.seen[key], counter.allowed[key],
				)
			}
		}
	}
	return nil
}

func newCandidateSet(scope contractScope, datasetName string, capacity int) CandidateSet {
	return CandidateSet{
		Authority:          ResultAuthority,
		Source:             scope.sourceID,
		Contract:           scope.contractID,
		OutputRelativePath: scope.task.OutputRelativePath,
		DatasetName:        datasetName,
		Task:               scope.task.Task,
		LengthSemantics:    scope.task.LengthSemantics,
		Examples:           make([]CandidateExample, 0, capacity),
	}
}

func newVerifierSet(scope contractScope, datasetName string, capacity int) VerifierSet {
	return VerifierSet{
		Authority:          ResultAuthority,
		Source:             scope.sourceID,
		Contract:           scope.contractID,
		OutputRelativePath: scope.task.OutputRelativePath,
		DatasetName:        datasetName,
		Task:               scope.task.Task,
		LengthSemantics:    scope.task.LengthSemantics,
		Examples:           make([]VerifierExample, 0, capacity),
	}
}

func makeCandidate(
	scope contractScope,
	datasetName string,
	ordinal uint64,
	example checkedExample,
) CandidateExample {
	builder := newIdentityBuilder("20w/clrs-candidate/v2")
	builder.addString(ResultAuthority)
	builder.addBytes(scope.sourceID[:])
	builder.addBytes(scope.contractID[:])
	builder.addString(scope.task.OutputRelativePath)
	builder.addString(datasetName)
	builder.addString(string(scope.task.Task))
	builder.addString(string(scope.task.LengthSemantics))
	builder.addUint64(ordinal)
	builder.addInt64(example.requestedLength)
	builder.addInt64(example.effectiveSize)
	builder.addInt64(example.seed)
	builder.addBool(example.useHints)
	builder.addString(example.prompt)
	return CandidateExample{
		ID:                 CandidateID(builder.sum()),
		Authority:          ResultAuthority,
		Source:             scope.sourceID,
		Contract:           scope.contractID,
		OutputRelativePath: scope.task.OutputRelativePath,
		Task:               scope.task.Task,
		Ordinal:            ordinal,
		Prompt:             example.prompt,
		LengthSemantics:    scope.task.LengthSemantics,
		RequestedLength:    example.requestedLength,
		EffectiveInputSize: example.effectiveSize,
		Seed:               example.seed,
		UseHints:           example.useHints,
	}
}

func makeVerifier(
	scope contractScope,
	candidateID CandidateID,
	reference string,
) VerifierExample {
	builder := newIdentityBuilder("20w/clrs-verifier/v2")
	builder.addString(ResultAuthority)
	builder.addBytes(scope.sourceID[:])
	builder.addBytes(scope.contractID[:])
	builder.addBytes(candidateID[:])
	builder.addString(reference)
	return VerifierExample{
		ID:          VerifierID(builder.sum()),
		Authority:   ResultAuthority,
		Source:      scope.sourceID,
		Contract:    scope.contractID,
		CandidateID: candidateID,
		Reference:   reference,
	}
}

func validateCandidateSetMetadata(scope contractScope, set CandidateSet) error {
	if set.Authority != ResultAuthority {
		return fmt.Errorf("CLRS candidate authority = %q, want %q", set.Authority, ResultAuthority)
	}
	if set.Source != scope.sourceID || set.Contract != scope.contractID {
		return errors.New("CLRS candidate set source or contract identity is foreign")
	}
	if set.OutputRelativePath != scope.task.OutputRelativePath ||
		set.DatasetName != datasetName(scope.task.Task) ||
		set.Task != scope.task.Task ||
		set.LengthSemantics != scope.task.LengthSemantics {
		return errors.New("CLRS candidate set metadata does not match the selected contract task")
	}
	return nil
}

func validateVerifierSetMetadata(scope contractScope, set VerifierSet) error {
	if set.Authority != ResultAuthority {
		return fmt.Errorf("CLRS verifier authority = %q, want %q", set.Authority, ResultAuthority)
	}
	if set.Source != scope.sourceID || set.Contract != scope.contractID {
		return errors.New("CLRS verifier set source or contract identity is foreign")
	}
	if set.OutputRelativePath != scope.task.OutputRelativePath ||
		set.DatasetName != datasetName(scope.task.Task) ||
		set.Task != scope.task.Task ||
		set.LengthSemantics != scope.task.LengthSemantics {
		return errors.New("CLRS verifier set metadata does not match the selected contract task")
	}
	return nil
}

func validateCandidateRecord(
	scope contractScope,
	datasetName string,
	ordinal uint64,
	candidate CandidateExample,
) error {
	if candidate.RequestedLength <= 0 || candidate.RequestedLength > scope.plan.Output.MaxRequestedLength {
		return fmt.Errorf(
			"declared length = %d, want 1..%d",
			candidate.RequestedLength, scope.plan.Output.MaxRequestedLength,
		)
	}
	if candidate.Seed < math.MinInt32 || candidate.Seed > math.MaxInt32 {
		return errors.New("seed is outside the upstream signed 32-bit range")
	}
	if candidate.UseHints != scope.plan.UseHints {
		return fmt.Errorf("use_hints = %t, want contract value %t", candidate.UseHints, scope.plan.UseHints)
	}
	if err := validatePrompt(candidate.Prompt, scope.task.Task, scope.plan.Output.MaxPromptBytes); err != nil {
		return err
	}
	effectiveSize, err := effectiveInputSize(candidate.RequestedLength, scope.task.LengthSemantics)
	if err != nil {
		return err
	}
	expected := makeCandidate(scope, datasetName, ordinal, checkedExample{
		requestedLength: candidate.RequestedLength,
		effectiveSize:   effectiveSize,
		seed:            candidate.Seed,
		prompt:          candidate.Prompt,
		useHints:        candidate.UseHints,
	})
	if candidate != expected {
		return errors.New("candidate record or identity does not match its contract-bound contents")
	}
	return nil
}

func validateVerifierRecord(scope contractScope, verifier VerifierExample) error {
	if err := validateReference(verifier.Reference, scope.plan.Output.MaxReferenceBytes); err != nil {
		return err
	}
	expected := makeVerifier(scope, verifier.CandidateID, verifier.Reference)
	if verifier != expected {
		return errors.New("verifier record or identity does not match its contract-bound contents")
	}
	return nil
}

func datasetName(task TaskKind) string {
	return "clrs_text_" + string(task)
}

func smallerInt(left, right int) int {
	if left < right {
		return left
	}
	return right
}

func smallerInt64(left, right int64) int64 {
	if left < right {
		return left
	}
	return right
}
