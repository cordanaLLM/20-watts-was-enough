package clrsrunner

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/buildinfo"
	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/clrsbellmanford"
	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/clrsbinary"
	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/clrsinsertion"
	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/clrskmp"
	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/clrsmatrixchain"
	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/clrssegments"
	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/specialistcontrol"
)

const (
	InsertionSortSpecialistID     = "clrs-exact-insertion-sort-v1"
	BinarySearchSpecialistID      = "clrs-exact-binary-search-v1"
	MatrixChainSpecialistID       = "clrs-exact-matrix-chain-v1"
	BellmanFordSpecialistID       = "clrs-exact-bellman-ford-v1"
	KMPMatcherSpecialistID        = "clrs-exact-kmp-matcher-v1"
	SegmentsIntersectSpecialistID = "clrs-exact-segments-intersect-v1"

	maximumValues     = 4_096
	maximumTokenBytes = 128
	maximumNodes      = 128
	maximumDimensions = 128
)

type route struct {
	specialistID string
	specialist   specialistcontrol.Specialist
}

// Registry owns the closed six-task process dispatch table.
type Registry struct {
	routes map[specialistcontrol.TaskKind]route
	now    func() time.Time
}

// NewRegistry constructs all frozen exact-program adapters with closed safety
// limits. These limits do not select dataset cells or grant result authority.
func NewRegistry() (Registry, error) {
	return newRegistry(time.Now)
}

func newRegistry(now func() time.Time) (Registry, error) {
	if now == nil {
		return Registry{}, errors.New("CLRS specialist clock is required")
	}
	routes := make(map[specialistcontrol.TaskKind]route, 6)
	if err := addInsertionRoute(routes); err != nil {
		return Registry{}, err
	}
	if err := addBinaryRoute(routes); err != nil {
		return Registry{}, err
	}
	if err := addMatrixRoute(routes); err != nil {
		return Registry{}, err
	}
	if err := addBellmanFordRoute(routes); err != nil {
		return Registry{}, err
	}
	if err := addKMPRoute(routes); err != nil {
		return Registry{}, err
	}
	if err := addSegmentsRoute(routes); err != nil {
		return Registry{}, err
	}
	if len(routes) != len(specialistcontrol.Tasks()) {
		return Registry{}, fmt.Errorf("CLRS specialist route count = %d, want %d", len(routes), len(specialistcontrol.Tasks()))
	}
	for _, task := range specialistcontrol.Tasks() {
		if _, present := routes[task]; !present {
			return Registry{}, fmt.Errorf("CLRS specialist route missing for %s", task)
		}
	}
	return Registry{routes: routes, now: now}, nil
}

// AdmissionSnapshot projects the closed registry into the existing controller's
// route and readiness types. A successful local adapter construction is only a
// timestamped development readiness observation; it is not result authority.
func (registry Registry) AdmissionSnapshot(
	observedAt time.Time,
	validFor time.Duration,
) ([]specialistcontrol.Route, []specialistcontrol.ReadinessObservation, error) {
	if observedAt.IsZero() || validFor <= 0 {
		return nil, nil, errors.New("CLRS admission observation time and validity are required")
	}
	routes := make([]specialistcontrol.Route, 0, len(registry.routes))
	observations := make([]specialistcontrol.ReadinessObservation, 0, len(registry.routes))
	for _, task := range specialistcontrol.Tasks() {
		selected, present := registry.routes[task]
		if !present || selected.specialist == nil || selected.specialistID == "" {
			return nil, nil, fmt.Errorf("CLRS admission route unavailable for %s", task)
		}
		routes = append(routes, specialistcontrol.Route{Task: task, SpecialistID: selected.specialistID})
		observations = append(observations, specialistcontrol.ReadinessObservation{
			SpecialistID: selected.specialistID,
			State:        specialistcontrol.ReadinessReady,
			ObservedAt:   observedAt,
			ValidFor:     validFor,
			Fits: []specialistcontrol.RequestFit{{
				Task: task, State: specialistcontrol.FitTaskCompatible,
			}},
		})
	}
	return routes, observations, nil
}

// Invoke runs one task through its existing specialist adapter and returns a
// candidate response. It never loads held references or verifies the answer.
func (registry Registry) Invoke(ctx context.Context, request Request) (Response, error) {
	response := responseFor(request)
	if err := validateRequest(request); err != nil {
		if errors.Is(err, ErrOversizedRequest) {
			response.Reason = specialistcontrol.ReasonOversizedRequest
		}
		return response, err
	}
	if ctx == nil {
		response.State = specialistcontrol.ResultAbstained
		response.Reason = specialistcontrol.ReasonSpecialistFailed
		return response, errors.New("invoke CLRS specialist: nil context")
	}
	selected, known := registry.routes[request.Task]
	if !known {
		response.Reason = specialistcontrol.ReasonUnknownTask
		return response, nil
	}
	if request.SpecialistID != selected.specialistID {
		response.Reason = specialistcontrol.ReasonMalformedRequest
		return response, nil
	}
	binding, err := parseBinding(request.Binding)
	if err != nil {
		return response, err
	}
	deadline := registry.now().Add(time.Duration(request.TimeoutMillis) * time.Millisecond)
	invokeContext, cancel := context.WithDeadline(ctx, deadline)
	defer cancel()
	result, err := selected.specialist.Invoke(invokeContext, specialistcontrol.Invocation{
		RunID: request.RunID, RequestID: request.RequestID, Task: request.Task,
		Payload: []byte(request.Payload), Binding: binding, Deadline: deadline,
		MaxResultBytes: request.MaxResultBytes,
	})
	if err != nil {
		response.State = specialistcontrol.ResultAbstained
		response.Reason = specialistErrorReason(err)
		return response, fmt.Errorf("invoke %s: %w", selected.specialistID, err)
	}
	if err := invokeContext.Err(); err != nil {
		response.State = specialistcontrol.ResultAbstained
		response.Reason = specialistErrorReason(err)
		return response, fmt.Errorf("%s exceeded its execution context: %w", selected.specialistID, err)
	}
	if result.Binding != binding || result.SpecialistID != selected.specialistID {
		response.Reason = specialistcontrol.ReasonStaleResult
		return response, errors.New("specialist returned a foreign binding or identity")
	}
	response.Binding = formatBinding(result.Binding)
	response.State = result.State
	switch result.State {
	case specialistcontrol.ResultCompleted:
		if len(result.Payload) == 0 || len(result.Payload) > request.MaxResultBytes {
			response.State = specialistcontrol.ResultRefused
			response.Reason = specialistcontrol.ReasonMalformedResult
			return response, errors.New("specialist returned an empty or oversized completed payload")
		}
		response.Reason = specialistcontrol.ReasonReady
		response.Payload = string(result.Payload)
	case specialistcontrol.ResultRefused:
		if len(result.Payload) != 0 {
			response.Reason = specialistcontrol.ReasonMalformedResult
			return response, errors.New("specialist returned a payload with a refused result")
		}
		response.Reason = specialistcontrol.ReasonSpecialistRefused
	case specialistcontrol.ResultAbstained:
		if len(result.Payload) != 0 {
			response.State = specialistcontrol.ResultRefused
			response.Reason = specialistcontrol.ReasonMalformedResult
			return response, errors.New("specialist returned a payload with an abstained result")
		}
		response.Reason = specialistcontrol.ReasonSpecialistAbstained
	default:
		response.State = specialistcontrol.ResultRefused
		response.Reason = specialistcontrol.ReasonMalformedResult
		return response, errors.New("specialist returned an unknown state")
	}
	return response, nil
}

func responseFor(request Request) Response {
	return Response{
		SchemaVersion: SchemaVersion, Authority: specialistcontrol.ResultAuthority,
		SourceID: FrozenSourceID, GenerationContractID: FrozenGenerationContractID,
		RunID: request.RunID, RequestID: request.RequestID, Task: request.Task,
		SpecialistID: request.SpecialistID, Binding: request.Binding,
		TimeoutMillis: request.TimeoutMillis, MaxResultBytes: request.MaxResultBytes,
		State: specialistcontrol.ResultRefused, Reason: specialistcontrol.ReasonMalformedRequest,
		Build: buildinfo.Current(),
	}
}

func specialistErrorReason(err error) specialistcontrol.Reason {
	if errors.Is(err, context.Canceled) {
		return specialistcontrol.ReasonCancelled
	}
	if errors.Is(err, context.DeadlineExceeded) {
		return specialistcontrol.ReasonDeadlineElapsed
	}
	return specialistcontrol.ReasonSpecialistFailed
}

func addInsertionRoute(routes map[specialistcontrol.TaskKind]route) error {
	specialist, err := clrsinsertion.NewSpecialist(InsertionSortSpecialistID, clrsinsertion.Limits{
		MaxPromptBytes: MaximumPromptBytes, MaxValues: maximumValues,
		MaxTokenBytes: maximumTokenBytes, MaxAnswerBytes: MaximumResultBytes,
	})
	if err != nil {
		return fmt.Errorf("construct insertion-sort specialist: %w", err)
	}
	routes[specialistcontrol.TaskInsertionSort] = route{InsertionSortSpecialistID, specialist}
	return nil
}

func addBinaryRoute(routes map[specialistcontrol.TaskKind]route) error {
	specialist, err := clrsbinary.NewSpecialist(BinarySearchSpecialistID, clrsbinary.Limits{
		MaxPromptBytes: MaximumPromptBytes, MaxValues: maximumValues,
		MaxTokenBytes: maximumTokenBytes, MaxAnswerBytes: MaximumResultBytes,
	})
	if err != nil {
		return fmt.Errorf("construct binary-search specialist: %w", err)
	}
	routes[specialistcontrol.TaskBinarySearch] = route{BinarySearchSpecialistID, specialist}
	return nil
}

func addMatrixRoute(routes map[specialistcontrol.TaskKind]route) error {
	specialist, err := clrsmatrixchain.NewSpecialist(MatrixChainSpecialistID, clrsmatrixchain.Limits{
		MaxPromptBytes: MaximumPromptBytes, MaxDimensions: maximumDimensions,
		MaxTokenBytes: maximumTokenBytes, MaxAnswerBytes: MaximumResultBytes,
	})
	if err != nil {
		return fmt.Errorf("construct matrix-chain specialist: %w", err)
	}
	routes[specialistcontrol.TaskMatrixChainOrder] = route{MatrixChainSpecialistID, specialist}
	return nil
}

func addBellmanFordRoute(routes map[specialistcontrol.TaskKind]route) error {
	specialist, err := clrsbellmanford.NewSpecialist(BellmanFordSpecialistID, clrsbellmanford.Limits{
		MaxPromptBytes: MaximumPromptBytes, MaxNodes: maximumNodes,
		MaxTokenBytes: maximumTokenBytes, MaxAnswerBytes: MaximumResultBytes,
	})
	if err != nil {
		return fmt.Errorf("construct Bellman-Ford specialist: %w", err)
	}
	routes[specialistcontrol.TaskBellmanFord] = route{BellmanFordSpecialistID, specialist}
	return nil
}

func addKMPRoute(routes map[specialistcontrol.TaskKind]route) error {
	specialist, err := clrskmp.NewSpecialist(KMPMatcherSpecialistID, clrskmp.Limits{
		MaxPromptBytes: MaximumPromptBytes, MaxValues: maximumValues, MaxAnswerBytes: MaximumResultBytes,
	})
	if err != nil {
		return fmt.Errorf("construct KMP specialist: %w", err)
	}
	routes[specialistcontrol.TaskKMPMatcher] = route{KMPMatcherSpecialistID, specialist}
	return nil
}

func addSegmentsRoute(routes map[specialistcontrol.TaskKind]route) error {
	specialist, err := clrssegments.NewSpecialist(SegmentsIntersectSpecialistID, clrssegments.Limits{
		MaxPromptBytes: MaximumPromptBytes, MaxTokenBytes: maximumTokenBytes, MaxAnswerBytes: MaximumResultBytes,
	})
	if err != nil {
		return fmt.Errorf("construct segment-intersection specialist: %w", err)
	}
	routes[specialistcontrol.TaskSegmentsIntersect] = route{SegmentsIntersectSpecialistID, specialist}
	return nil
}
