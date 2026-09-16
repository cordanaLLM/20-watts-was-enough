package clrsshakedown

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/clrsbellmanford"
	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/clrsbinary"
	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/clrsfixture"
	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/clrsinsertion"
	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/clrskmp"
	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/clrsmatrixchain"
	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/clrsrunner"
	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/clrssegments"
	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/specialistcontrol"
)

type requestSource interface {
	Requests(time.Time, time.Time) ([]specialistcontrol.Request, error)
}

type boundTask struct {
	task     clrsfixture.TaskKind
	id       string
	requests requestSource
	verifier specialistcontrol.ExactVerifier
}

type boundInputs struct {
	tree         clrsfixture.FixtureTree
	tasks        []boundTask
	registry     clrsrunner.Registry
	routes       []specialistcontrol.Route
	observations []specialistcontrol.ReadinessObservation
	policy       specialistcontrol.Policy
}

func bindInputs(options Options, tree clrsfixture.FixtureTree) (boundInputs, error) {
	bound := boundInputs{tree: tree}
	if tree.Plan.SourceID.String() != clrsrunner.FrozenSourceID || tree.Plan.ContractID.String() != clrsrunner.FrozenGenerationContractID {
		return bound, errors.New("fixture identities differ from the frozen specialist runtime")
	}
	var err error
	bound.registry, err = clrsrunner.NewRegistry()
	if err != nil {
		return bound, err
	}
	bound.routes, bound.observations, err = bound.registry.AdmissionSnapshot(time.Now().UTC(), runTimeout)
	if err != nil {
		return bound, err
	}
	bound.policy, err = specialistcontrol.NewPolicy(policyLimits(), bound.routes)
	if err != nil {
		return bound, err
	}
	byTask := make(map[clrsfixture.TaskKind]clrsfixture.FixtureDataset, len(tree.Datasets))
	ids := make(map[clrsfixture.TaskKind]string, len(bound.routes))
	for _, dataset := range tree.Datasets {
		byTask[dataset.Candidates.Task] = dataset
	}
	for _, route := range bound.routes {
		ids[route.Task] = route.SpecialistID
	}
	for _, task := range tree.Plan.Tasks {
		selected, err := bindTask(options.RunID, ids[task.Task], tree, byTask[task.Task], task)
		if err != nil {
			return bound, fmt.Errorf("bind %s: %w", task.Task, err)
		}
		bound.tasks = append(bound.tasks, selected)
	}
	return bound, nil
}

// Bind the existing task-specific request and verifier implementations; no
// algorithm, task grid, reference scorer or specialist identity is duplicated.
func bindTask(runID, id string, tree clrsfixture.FixtureTree, dataset clrsfixture.FixtureDataset, task clrsfixture.TaskPlan) (boundTask, error) {
	b := boundTask{task: task.Task, id: id}
	var err error
	maximumSize := 0
	for _, size := range task.Sizes {
		maximumSize = max(maximumSize, int(size.RequestedLength))
	}
	n, bytes := task.ExpectedExamples, tree.Plan.Output.MaxDatasetBytes
	s, c, candidates, verifiers := tree.Source, tree.Contract, dataset.Candidates, dataset.Verifiers
	switch task.Task {
	case clrsfixture.TaskInsertionSort:
		limits := clrsinsertion.Limits{MaxPromptBytes: maximumExampleBytes, MaxValues: maximumSize, MaxTokenBytes: 128, MaxAnswerBytes: maximumExampleBytes}
		b.requests, b.verifier, err = clrsinsertion.BindDataset(runID, id, s, c, candidates, verifiers, limits, clrsinsertion.VerifierLimits{MaxReferences: n, MaxReferenceBytes: bytes})
	case clrsfixture.TaskBinarySearch:
		limits := clrsbinary.Limits{MaxPromptBytes: maximumExampleBytes, MaxValues: maximumSize, MaxTokenBytes: 128, MaxAnswerBytes: maximumExampleBytes}
		b.requests, b.verifier, err = clrsbinary.BindDataset(runID, id, s, c, candidates, verifiers, limits, clrsbinary.VerifierLimits{MaxReferences: n, MaxReferenceBytes: bytes})
	case clrsfixture.TaskMatrixChainOrder:
		limits := clrsmatrixchain.Limits{MaxPromptBytes: maximumExampleBytes, MaxDimensions: maximumSize, MaxTokenBytes: 128, MaxAnswerBytes: maximumExampleBytes}
		b.requests, b.verifier, err = clrsmatrixchain.BindDataset(runID, id, s, c, candidates, verifiers, limits, clrsmatrixchain.VerifierLimits{MaxReferences: n, MaxReferenceBytes: bytes})
	case clrsfixture.TaskBellmanFord:
		limits := clrsbellmanford.Limits{MaxPromptBytes: maximumExampleBytes, MaxNodes: maximumSize, MaxTokenBytes: 128, MaxAnswerBytes: maximumExampleBytes}
		b.requests, b.verifier, err = clrsbellmanford.BindDataset(runID, id, s, c, candidates, verifiers, limits, clrsbellmanford.VerifierLimits{MaxReferences: n, MaxReferenceBytes: bytes})
	case clrsfixture.TaskKMPMatcher:
		limits := clrskmp.Limits{MaxPromptBytes: maximumExampleBytes, MaxValues: maximumSize, MaxAnswerBytes: maximumExampleBytes}
		b.requests, b.verifier, err = clrskmp.BindDataset(runID, id, s, c, candidates, verifiers, limits, clrskmp.VerifierLimits{MaxReferences: n, MaxReferenceBytes: bytes})
	case clrsfixture.TaskSegmentsIntersect:
		limits := clrssegments.Limits{MaxPromptBytes: maximumExampleBytes, MaxTokenBytes: 128, MaxAnswerBytes: maximumExampleBytes}
		b.requests, b.verifier, err = clrssegments.BindDataset(runID, id, s, c, candidates, verifiers, limits, clrssegments.VerifierLimits{MaxReferences: n, MaxReferenceBytes: bytes})
	default:
		err = errors.New("no frozen dataset binding for task")
	}
	return b, err
}

func policyLimits() specialistcontrol.Limits {
	return specialistcontrol.Limits{MaxRequestBytes: maximumExampleBytes, MaxResultBytes: maximumExampleBytes,
		MaxRequestAge: requestTimeout, MaxExecution: requestTimeout, MaxDecisionRecord: recordTimeout}
}

func admissionLimits() specialistcontrol.AdmissionLimits {
	return specialistcontrol.AdmissionLimits{MaxObservationValidity: runTimeout, MaxQueueDepth: 1,
		MaxWait: recordTimeout, MaxRetries: 0, MaxConcurrencyPerSpecialist: 1, MaxTotalPending: 1, MaxTotalActive: 1}
}

type registrySpecialist struct {
	registry clrsrunner.Registry
	id       string
}

func (s registrySpecialist) Invoke(ctx context.Context, in specialistcontrol.Invocation) (specialistcontrol.SpecialistResult, error) {
	remaining := time.Until(in.Deadline)
	if remaining <= 0 {
		return specialistcontrol.SpecialistResult{}, context.DeadlineExceeded
	}
	response, err := s.registry.Invoke(ctx, clrsrunner.Request{SchemaVersion: clrsrunner.SchemaVersion,
		Authority: clrsfixture.ResultAuthority, SourceID: clrsrunner.FrozenSourceID, GenerationContractID: clrsrunner.FrozenGenerationContractID,
		RunID: in.RunID, RequestID: in.RequestID, Task: in.Task, SpecialistID: s.id, Binding: fmt.Sprintf("sha256:%x", in.Binding),
		TimeoutMillis: int((remaining + time.Millisecond - 1) / time.Millisecond), MaxResultBytes: in.MaxResultBytes, Payload: string(in.Payload)})
	return specialistcontrol.SpecialistResult{Binding: in.Binding, SpecialistID: response.SpecialistID, State: response.State, Payload: []byte(response.Payload)}, err
}
