package clrsfixture

import (
	"errors"
	"fmt"
	"io"
	"math"
	"path"
)

const (
	generationContractSchemaVersion = 1
	maximumGenerationContractBytes  = 32 << 10
	generationPurpose               = "controller_shakedown"
	generationIssue                 = "https://github.com/lusoris/20-watts-was-enough/issues/12"
	generationSplit                 = "shakedown"
	generationState                 = "blocked_on_generator_image"
)

// TaskKind is one algorithm admitted to the six-family controller shakedown.
type TaskKind string

const (
	TaskInsertionSort     TaskKind = "insertion_sort"
	TaskBinarySearch      TaskKind = "binary_search"
	TaskMatrixChainOrder  TaskKind = "matrix_chain_order"
	TaskBellmanFord       TaskKind = "bellman_ford"
	TaskKMPMatcher        TaskKind = "kmp_matcher"
	TaskSegmentsIntersect TaskKind = "segments_intersect"
)

// TaskFamily records the interface family represented by one selected task.
type TaskFamily string

const (
	FamilySequence           TaskFamily = "sequence"
	FamilySearch             TaskFamily = "search"
	FamilyDynamicProgramming TaskFamily = "dynamic_programming"
	FamilyGraph              TaskFamily = "graph"
	FamilyString             TaskFamily = "string"
	FamilyGeometry           TaskFamily = "geometry"
)

// SizeRole labels sizes relative to the published CLRS-Text Gemma 2B grid.
// It does not describe the distribution of a future project model.
type SizeRole string

const (
	SizePublishedTrain         SizeRole = "published_training_size"
	SizePublishedInterpolation SizeRole = "published_interpolation_probe"
	SizePublishedExtrapolation SizeRole = "published_extrapolation_probe"
	SizeFixedGeometryControl   SizeRole = "fixed_geometry_control"
)

// SizeSelection is one requested generator length and its limited role.
type SizeSelection struct {
	Role            SizeRole `json:"role"`
	RequestedLength int64    `json:"requested_length"`
}

// GenerationTask freezes one task, family, size semantics and size selection.
type GenerationTask struct {
	Task            TaskKind        `json:"task"`
	Family          TaskFamily      `json:"family"`
	LengthSemantics LengthSemantics `json:"length_semantics"`
	Sizes           []SizeSelection `json:"sizes"`
}

// GenerationOutput bounds the complete generated construction fixture set.
type GenerationOutput struct {
	ExpectedFiles      int   `json:"expected_files"`
	ExpectedExamples   int   `json:"expected_examples"`
	MaxDatasetBytes    int64 `json:"max_dataset_bytes"`
	MaxTotalBytes      int64 `json:"max_total_bytes"`
	MaxPromptBytes     int   `json:"max_prompt_bytes"`
	MaxReferenceBytes  int   `json:"max_reference_bytes"`
	MaxRequestedLength int64 `json:"max_requested_length"`
}

// GenerationContract is the closed, non-executable CLRS-Text fixture plan.
// A separately pinned generator image is required before any bytes are made.
type GenerationContract struct {
	SchemaVersion      int              `json:"schema_version"`
	Authority          string           `json:"authority"`
	Purpose            string           `json:"purpose"`
	Issue              string           `json:"issue"`
	SourceID           string           `json:"source_id"`
	GenerationState    string           `json:"generation_state"`
	SplitName          string           `json:"split_name"`
	SamplesPerCell     int              `json:"samples_per_cell"`
	UseHints           bool             `json:"use_hints"`
	NumDecimalsInFloat int              `json:"num_decimals_in_float"`
	Seeds              []int64          `json:"seeds"`
	Tasks              []GenerationTask `json:"tasks"`
	Output             GenerationOutput `json:"output"`
}

// TaskPlan is the deterministic, candidate-independent projection for one file.
type TaskPlan struct {
	Task               TaskKind
	Family             TaskFamily
	LengthSemantics    LengthSemantics
	Sizes              []SizeSelection
	OutputRelativePath string
	ExpectedExamples   int
}

// GenerationPlan is a pure projection; it does not invoke the Python generator.
type GenerationPlan struct {
	Authority          string
	SourceID           SourceID
	ContractID         ContractID
	GenerationState    string
	SplitName          string
	SamplesPerCell     int
	UseHints           bool
	NumDecimalsInFloat int
	Seeds              []int64
	Tasks              []TaskPlan
	Output             GenerationOutput
}

type taskDefinition struct {
	task      TaskKind
	family    TaskFamily
	semantics LengthSemantics
	sizes     []SizeSelection
}

var shakedownTaskDefinitions = []taskDefinition{
	{TaskInsertionSort, FamilySequence, LengthDeclaredInput, scalableSizes(32)},
	{TaskBinarySearch, FamilySearch, LengthDeclaredInput, scalableSizes(32)},
	{TaskMatrixChainOrder, FamilyDynamicProgramming, LengthDeclaredInput, scalableSizes(11)},
	{TaskBellmanFord, FamilyGraph, LengthDeclaredInput, scalableSizes(32)},
	{TaskKMPMatcher, FamilyString, LengthDeclaredInput, scalableSizes(32)},
	{TaskSegmentsIntersect, FamilyGeometry, LengthFixedFourEndpoints, []SizeSelection{{Role: SizeFixedGeometryControl, RequestedLength: 4}}},
}

// ShakedownTasks returns the single task registry shared by fixtures and policy.
func ShakedownTasks() []TaskKind {
	tasks := make([]TaskKind, len(shakedownTaskDefinitions))
	for index, definition := range shakedownTaskDefinitions {
		tasks[index] = definition.task
	}
	return tasks
}

// ReadGenerationContract reads and validates one bounded contract.
func ReadGenerationContract(reader io.Reader, source SourceRecord) (GenerationContract, error) {
	body, err := readBounded(reader, maximumGenerationContractBytes)
	if err != nil {
		return GenerationContract{}, fmt.Errorf("read CLRS generation contract: %w", err)
	}
	return ParseGenerationContract(body, source)
}

// ParseGenerationContract validates one complete contract without network use.
func ParseGenerationContract(body []byte, source SourceRecord) (GenerationContract, error) {
	if len(body) == 0 || len(body) > maximumGenerationContractBytes {
		return GenerationContract{}, fmt.Errorf("CLRS generation contract size = %d, want 1..%d", len(body), maximumGenerationContractBytes)
	}
	var contract GenerationContract
	if err := decodeStrict(body, 7, &contract); err != nil {
		return GenerationContract{}, fmt.Errorf("parse CLRS generation contract: %w", err)
	}
	if err := contract.Validate(source); err != nil {
		return GenerationContract{}, err
	}
	return contract, nil
}

// Validate rejects a contract that drifts from the accepted shakedown scope.
func (contract GenerationContract) Validate(source SourceRecord) error {
	sourceID, err := source.Identity()
	if err != nil {
		return fmt.Errorf("validate CLRS generation source: %w", err)
	}
	if err := contract.validateHeader(sourceID); err != nil {
		return err
	}
	if err := validateSeeds(contract.Seeds); err != nil {
		return err
	}
	if err := validateTasks(contract.Tasks); err != nil {
		return err
	}
	return contract.validateOutput()
}

// Identity binds the validated contract to the exact upstream source record.
func (contract GenerationContract) Identity(source SourceRecord) (ContractID, error) {
	if err := contract.Validate(source); err != nil {
		return ContractID{}, err
	}
	sourceID, err := source.Identity()
	if err != nil {
		return ContractID{}, fmt.Errorf("identify CLRS generation source: %w", err)
	}
	builder := newIdentityBuilder("20w/clrs-generation-contract/v1")
	builder.addBytes(sourceID[:])
	addContractHeader(&builder, contract)
	for _, seed := range contract.Seeds {
		builder.addInt64(seed)
	}
	for _, task := range contract.Tasks {
		builder.addString(string(task.Task))
		builder.addString(string(task.Family))
		builder.addString(string(task.LengthSemantics))
		for _, size := range task.Sizes {
			builder.addString(string(size.Role))
			builder.addInt64(size.RequestedLength)
		}
	}
	addOutputIdentity(&builder, contract.Output)
	return ContractID(builder.sum()), nil
}

// Plan returns a deep-copied deterministic projection of the frozen contract.
func (contract GenerationContract) Plan(source SourceRecord) (GenerationPlan, error) {
	contractID, err := contract.Identity(source)
	if err != nil {
		return GenerationPlan{}, err
	}
	sourceID, err := source.Identity()
	if err != nil {
		return GenerationPlan{}, fmt.Errorf("identify CLRS generation source: %w", err)
	}
	plan := GenerationPlan{
		Authority:          ResultAuthority,
		SourceID:           sourceID,
		ContractID:         contractID,
		GenerationState:    contract.GenerationState,
		SplitName:          contract.SplitName,
		SamplesPerCell:     contract.SamplesPerCell,
		UseHints:           contract.UseHints,
		NumDecimalsInFloat: contract.NumDecimalsInFloat,
		Seeds:              append([]int64(nil), contract.Seeds...),
		Tasks:              make([]TaskPlan, 0, len(contract.Tasks)),
		Output:             contract.Output,
	}
	for _, task := range contract.Tasks {
		sizes := append([]SizeSelection(nil), task.Sizes...)
		plan.Tasks = append(plan.Tasks, TaskPlan{
			Task:               task.Task,
			Family:             task.Family,
			LengthSemantics:    task.LengthSemantics,
			Sizes:              sizes,
			OutputRelativePath: path.Join(contract.SplitName, string(task.Task)+".json"),
			ExpectedExamples:   len(sizes) * len(contract.Seeds) * contract.SamplesPerCell,
		})
	}
	return plan, nil
}

func (contract GenerationContract) validateHeader(sourceID SourceID) error {
	if contract.SchemaVersion != generationContractSchemaVersion {
		return fmt.Errorf("CLRS generation schema = %d, want %d", contract.SchemaVersion, generationContractSchemaVersion)
	}
	if contract.Authority != ResultAuthority || contract.Purpose != generationPurpose || contract.Issue != generationIssue {
		return errors.New("CLRS generation authority, purpose, or issue binding is invalid")
	}
	if contract.SourceID != sourceID.String() {
		return fmt.Errorf("CLRS generation source = %q, want %q", contract.SourceID, sourceID.String())
	}
	if contract.GenerationState != generationState || contract.SplitName != generationSplit ||
		contract.SamplesPerCell != 1 || contract.UseHints || contract.NumDecimalsInFloat != 6 {
		return errors.New("CLRS generation parameters differ from the accepted bounded shakedown")
	}
	return nil
}

func validateSeeds(seeds []int64) error {
	if len(seeds) != 3 {
		return fmt.Errorf("CLRS generation seed count = %d, want 3", len(seeds))
	}
	expected := [...]int64{3, 14, 35}
	for index, seed := range seeds {
		if seed != expected[index] || seed < math.MinInt32 || seed > math.MaxInt32 {
			return fmt.Errorf("CLRS generation seeds = %v, want %v", seeds, expected)
		}
	}
	return nil
}

func validateTasks(tasks []GenerationTask) error {
	if len(tasks) != len(shakedownTaskDefinitions) {
		return fmt.Errorf("CLRS generation task count = %d, want %d", len(tasks), len(shakedownTaskDefinitions))
	}
	for index, expected := range shakedownTaskDefinitions {
		actual := tasks[index]
		if actual.Task != expected.task || actual.Family != expected.family || actual.LengthSemantics != expected.semantics {
			return fmt.Errorf("CLRS generation task %d = %q/%q/%q, want accepted family binding", index, actual.Task, actual.Family, actual.LengthSemantics)
		}
		if !equalSizes(actual.Sizes, expected.sizes) {
			return fmt.Errorf("CLRS generation sizes for %s = %v, want %v", actual.Task, actual.Sizes, expected.sizes)
		}
	}
	return nil
}

func (contract GenerationContract) validateOutput() error {
	expectedExamples := 0
	maxLength := int64(0)
	for _, task := range contract.Tasks {
		expectedExamples += len(task.Sizes) * len(contract.Seeds) * contract.SamplesPerCell
		for _, size := range task.Sizes {
			if size.RequestedLength > maxLength {
				maxLength = size.RequestedLength
			}
		}
	}
	output := contract.Output
	if output.ExpectedFiles != len(contract.Tasks) || output.ExpectedExamples != expectedExamples || output.MaxRequestedLength != maxLength {
		return errors.New("CLRS generation output counts do not match the selected cells")
	}
	if output.MaxDatasetBytes != 4<<20 || output.MaxTotalBytes != int64(output.ExpectedFiles)*output.MaxDatasetBytes {
		return errors.New("CLRS generation dataset and total byte bounds differ from the accepted contract")
	}
	if output.MaxPromptBytes != 1<<20 || output.MaxReferenceBytes != 1<<20 {
		return errors.New("CLRS generation example byte bounds differ from the accepted contract")
	}
	return nil
}

func scalableSizes(extrapolation int64) []SizeSelection {
	return []SizeSelection{
		{Role: SizePublishedTrain, RequestedLength: 10},
		{Role: SizePublishedInterpolation, RequestedLength: 8},
		{Role: SizePublishedExtrapolation, RequestedLength: extrapolation},
	}
}

func equalSizes(left, right []SizeSelection) bool {
	if len(left) != len(right) {
		return false
	}
	for index := range left {
		if left[index] != right[index] {
			return false
		}
	}
	return true
}

func addContractHeader(builder *identityBuilder, contract GenerationContract) {
	for _, value := range []string{
		contract.Authority, contract.Purpose, contract.Issue, contract.SourceID,
		contract.GenerationState, contract.SplitName,
	} {
		builder.addString(value)
	}
	builder.addInt64(int64(contract.SamplesPerCell))
	builder.addBool(contract.UseHints)
	builder.addInt64(int64(contract.NumDecimalsInFloat))
}

func addOutputIdentity(builder *identityBuilder, output GenerationOutput) {
	for _, value := range []int64{
		int64(output.ExpectedFiles), int64(output.ExpectedExamples), output.MaxDatasetBytes,
		output.MaxTotalBytes, int64(output.MaxPromptBytes), int64(output.MaxReferenceBytes), output.MaxRequestedLength,
	} {
		builder.addInt64(value)
	}
}
