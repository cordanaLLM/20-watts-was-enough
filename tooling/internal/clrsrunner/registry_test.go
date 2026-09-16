package clrsrunner

import (
	"context"
	"errors"
	"os"
	"slices"
	"strings"
	"testing"
	"time"

	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/clrsbellmanford"
	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/clrsbinary"
	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/clrsfixture"
	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/clrsinsertion"
	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/clrskmp"
	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/clrsmatrixchain"
	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/clrssegments"
	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/specialistcontrol"
)

const testBinding = "sha256:1111111111111111111111111111111111111111111111111111111111111111"

type specialistCase struct {
	task         specialistcontrol.TaskKind
	specialistID string
	prompt       string
	want         string
}

var specialistCases = []specialistCase{
	{
		task: specialistcontrol.TaskInsertionSort, specialistID: InsertionSortSpecialistID,
		prompt: "insertion_sort:\nkey: [0.549 0.715 0.603 0.545 0.424]\npred:\n",
		want:   "[0.424 0.545 0.549 0.603 0.715]\n\n",
	},
	{
		task: specialistcontrol.TaskBinarySearch, specialistID: BinarySearchSpecialistID,
		prompt: "binary_search:\nkey: [0.424 0.545 0.549 0.603 0.715], target: 0.646\nreturn:\n",
		want:   "4\n\n",
	},
	{
		task: specialistcontrol.TaskMatrixChainOrder, specialistID: MatrixChainSpecialistID,
		prompt: "matrix_chain_order:\np: [0.30 0.35 0.15 0.05 0.10 0.20 0.25]\ns:\n",
		want:   "[[0 0 0 0 0 0 0], [0 0 1 1 3 3 3], [0 0 0 2 3 3 3], [0 0 0 0 3 3 3], [0 0 0 0 0 4 5], [0 0 0 0 0 0 5], [0 0 0 0 0 0 0]]\n\n",
	},
	{
		task: specialistcontrol.TaskBellmanFord, specialistID: BellmanFordSpecialistID,
		prompt: "bellman_ford:\ns: 0, A: [[0.0 0.2 0.9 0.0 0.95], [0.2 0.0 0.2 0.8 0.0], [0.9 0.2 0.0 0.2 0.0], [0.0 0.8 0.2 0.0 0.2], [0.95 0.0 0.0 0.2 0.0]]\npi:\n",
		want:   "[0 0 1 2 3]\n\n",
	},
	{
		task: specialistcontrol.TaskKMPMatcher, specialistID: KMPMatcherSpecialistID,
		prompt: "kmp_matcher:\nstring: [0 0 0 0 0 0 0 0 1 1], key: [3 2 1 2 3 0 0 0 1 2]\nmatch:\n",
		want:   "2\n\n",
	},
	{
		task: specialistcontrol.TaskSegmentsIntersect, specialistID: SegmentsIntersectSpecialistID,
		prompt: "segments_intersect:\nx: [0.558854 0.259252 0.415101 0.283525], y: [0.693137 0.440453 0.156867 0.544649]\nintersect:\n",
		want:   "1\n\n",
	},
}

func TestRegistryProjectsOneTypedAdmissionObservationPerClosedRoute(t *testing.T) {
	t.Parallel()
	registry, err := NewRegistry()
	if err != nil {
		t.Fatal(err)
	}
	observedAt := time.Date(2026, time.September, 4, 12, 0, 0, 0, time.UTC)
	validFor := 5 * time.Second
	routes, observations, err := registry.AdmissionSnapshot(observedAt, validFor)
	if err != nil {
		t.Fatal(err)
	}
	if len(routes) != len(specialistCases) || len(observations) != len(routes) {
		t.Fatalf("AdmissionSnapshot() counts = %d/%d, want %d/%d", len(routes), len(observations), len(specialistCases), len(specialistCases))
	}
	for index, task := range specialistcontrol.Tasks() {
		route, observation := routes[index], observations[index]
		if route.Task != task || observation.SpecialistID != route.SpecialistID ||
			observation.State != specialistcontrol.ReadinessReady || !observation.ObservedAt.Equal(observedAt) ||
			observation.ValidFor != validFor || observation.DeclaredCost != 0 || len(observation.Fits) != 1 ||
			observation.Fits[0].Task != task || observation.Fits[0].State != specialistcontrol.FitTaskCompatible {
			t.Fatalf("AdmissionSnapshot()[%d] = %#v/%#v", index, route, observation)
		}
	}
	policy, err := specialistcontrol.NewPolicy(specialistcontrol.Limits{
		MaxRequestBytes: MaximumEnvelopeBytes, MaxResultBytes: MaximumResultBytes,
		MaxRequestAge: time.Second, MaxExecution: time.Second, MaxDecisionRecord: 100 * time.Millisecond,
	}, routes)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := specialistcontrol.NewAdmission(policy, specialistcontrol.AdmissionLimits{
		MaxObservationValidity: validFor, MaxQueueDepth: 6, MaxWait: time.Second,
		MaxRetries: 1, MaxConcurrencyPerSpecialist: 1, MaxTotalPending: 36, MaxTotalActive: 6,
	}, observations, observedAt); err != nil {
		t.Fatalf("CLRS snapshot does not close specialist admission: %v", err)
	}
	for name, boundary := range map[string]struct {
		at       time.Time
		validity time.Duration
	}{
		"zero time":     {},
		"zero validity": {at: observedAt},
	} {
		name, boundary := name, boundary
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			if _, _, err := registry.AdmissionSnapshot(boundary.at, boundary.validity); err == nil {
				t.Fatal("AdmissionSnapshot() error = nil, want invalid boundary rejection")
			}
		})
	}
}

func TestRegistryCompletesAllFrozenSpecialistsDeterministically(t *testing.T) {
	t.Parallel()
	registry, err := newRegistry(func() time.Time { return time.Date(2099, 1, 1, 0, 0, 0, 0, time.UTC) })
	if err != nil {
		t.Fatal(err)
	}
	for _, test := range specialistCases {
		test := test
		t.Run(string(test.task), func(t *testing.T) {
			t.Parallel()
			request := validRequest(test)
			first, err := registry.Invoke(context.Background(), request)
			if err != nil {
				t.Fatal(err)
			}
			second, err := registry.Invoke(context.Background(), request)
			if err != nil {
				t.Fatal(err)
			}
			if first != second || first.State != specialistcontrol.ResultCompleted ||
				first.Reason != specialistcontrol.ReasonReady || first.Payload != test.want {
				t.Fatalf("Invoke(%s) = %#v/%#v, want deterministic completed payload %q", test.task, first, second, test.want)
			}
			if first.Authority != specialistcontrol.ResultAuthority || first.Binding != testBinding ||
				first.SourceID != FrozenSourceID || first.GenerationContractID != FrozenGenerationContractID {
				t.Fatalf("Invoke(%s) lost frozen NO_RESULT identity: %#v", test.task, first)
			}
		})
	}
}

func TestRegistryTypesRefusalCancellationAndForeignRoutes(t *testing.T) {
	t.Parallel()
	registry, err := NewRegistry()
	if err != nil {
		t.Fatal(err)
	}
	malformed := validRequest(specialistCases[0])
	malformed.Payload = "insertion_sort:\nkey: [0.2, 0.1]\npred:\n"
	response, err := registry.Invoke(context.Background(), malformed)
	if err != nil || response.State != specialistcontrol.ResultRefused ||
		response.Reason != specialistcontrol.ReasonSpecialistRefused || response.Payload != "" {
		t.Fatalf("Invoke(malformed prompt) = %#v, %v, want typed empty refusal", response, err)
	}

	foreign := validRequest(specialistCases[0])
	foreign.SpecialistID = BinarySearchSpecialistID
	response, err = registry.Invoke(context.Background(), foreign)
	if err != nil || response.Reason != specialistcontrol.ReasonMalformedRequest || response.Payload != "" {
		t.Fatalf("Invoke(foreign route) = %#v, %v, want malformed-request refusal", response, err)
	}

	unknown := validRequest(specialistCases[0])
	unknown.Task = "not_a_frozen_task"
	response, err = registry.Invoke(context.Background(), unknown)
	if err != nil || response.Reason != specialistcontrol.ReasonUnknownTask || response.Payload != "" {
		t.Fatalf("Invoke(unknown task) = %#v, %v, want unknown-task refusal", response, err)
	}

	cancelled, cancel := context.WithCancel(context.Background())
	cancel()
	response, err = registry.Invoke(cancelled, validRequest(specialistCases[0]))
	if err == nil || response.State != specialistcontrol.ResultAbstained ||
		response.Reason != specialistcontrol.ReasonCancelled || response.Payload != "" {
		t.Fatalf("Invoke(cancelled) = %#v, %v, want cancelled abstention and error", response, err)
	}

	foreignSource := validRequest(specialistCases[0])
	foreignSource.SourceID = "sha256:" + strings.Repeat("2", 64)
	response, err = registry.Invoke(context.Background(), foreignSource)
	if !errors.Is(err, ErrMalformedRequest) || response.State != specialistcontrol.ResultRefused ||
		response.Reason != specialistcontrol.ReasonMalformedRequest || response.Payload != "" {
		t.Fatalf("Invoke(foreign source) = %#v, %v, want closed refusal", response, err)
	}
}

func TestRegistryRejectsAResultCompletedAfterItsDeadline(t *testing.T) {
	t.Parallel()
	request := validRequest(specialistCases[0])
	request.TimeoutMillis = 1
	binding, err := parseBinding(request.Binding)
	if err != nil {
		t.Fatal(err)
	}
	registry := Registry{
		routes: map[specialistcontrol.TaskKind]route{
			request.Task: {
				specialistID: request.SpecialistID,
				specialist: specialistFunc(func(ctx context.Context, _ specialistcontrol.Invocation) (specialistcontrol.SpecialistResult, error) {
					<-ctx.Done()
					return specialistcontrol.SpecialistResult{
						Binding: binding, SpecialistID: request.SpecialistID,
						State: specialistcontrol.ResultCompleted, Payload: []byte("late"),
					}, nil
				}),
			},
		},
		now: time.Now,
	}
	response, err := registry.Invoke(context.Background(), request)
	if !errors.Is(err, context.DeadlineExceeded) || response.State != specialistcontrol.ResultAbstained ||
		response.Reason != specialistcontrol.ReasonDeadlineElapsed || response.Payload != "" {
		t.Fatalf("Invoke(late completion) = %#v, %v, want deadline abstention", response, err)
	}
}

type specialistFunc func(context.Context, specialistcontrol.Invocation) (specialistcontrol.SpecialistResult, error)

func (function specialistFunc) Invoke(ctx context.Context, invocation specialistcontrol.Invocation) (specialistcontrol.SpecialistResult, error) {
	return function(ctx, invocation)
}

func TestRegistryRejectsMalformedSpecialistResults(t *testing.T) {
	t.Parallel()
	request := validRequest(specialistCases[0])
	binding, err := parseBinding(request.Binding)
	if err != nil {
		t.Fatal(err)
	}
	tests := map[string]struct {
		result specialistcontrol.SpecialistResult
		err    error
		state  specialistcontrol.ResultState
		reason specialistcontrol.Reason
	}{
		"foreign binding": {
			result: specialistcontrol.SpecialistResult{Binding: specialistcontrol.Binding{2}, SpecialistID: request.SpecialistID, State: specialistcontrol.ResultCompleted, Payload: []byte("ok")},
			state:  specialistcontrol.ResultRefused, reason: specialistcontrol.ReasonStaleResult,
		},
		"foreign specialist": {
			result: specialistcontrol.SpecialistResult{Binding: binding, SpecialistID: "foreign", State: specialistcontrol.ResultCompleted, Payload: []byte("ok")},
			state:  specialistcontrol.ResultRefused, reason: specialistcontrol.ReasonStaleResult,
		},
		"empty completed": {
			result: specialistcontrol.SpecialistResult{Binding: binding, SpecialistID: request.SpecialistID, State: specialistcontrol.ResultCompleted},
			state:  specialistcontrol.ResultRefused, reason: specialistcontrol.ReasonMalformedResult,
		},
		"unknown state": {
			result: specialistcontrol.SpecialistResult{Binding: binding, SpecialistID: request.SpecialistID, State: "foreign"},
			state:  specialistcontrol.ResultRefused, reason: specialistcontrol.ReasonMalformedResult,
		},
		"abstained": {
			result: specialistcontrol.SpecialistResult{Binding: binding, SpecialistID: request.SpecialistID, State: specialistcontrol.ResultAbstained},
			state:  specialistcontrol.ResultAbstained, reason: specialistcontrol.ReasonSpecialistAbstained,
		},
		"refused with payload": {
			result: specialistcontrol.SpecialistResult{Binding: binding, SpecialistID: request.SpecialistID, State: specialistcontrol.ResultRefused, Payload: []byte("foreign")},
			state:  specialistcontrol.ResultRefused, reason: specialistcontrol.ReasonMalformedResult,
		},
		"abstained with payload": {
			result: specialistcontrol.SpecialistResult{Binding: binding, SpecialistID: request.SpecialistID, State: specialistcontrol.ResultAbstained, Payload: []byte("foreign")},
			state:  specialistcontrol.ResultRefused, reason: specialistcontrol.ReasonMalformedResult,
		},
		"cancelled": {
			err: context.Canceled, state: specialistcontrol.ResultAbstained, reason: specialistcontrol.ReasonCancelled,
		},
		"deadline": {
			err: context.DeadlineExceeded, state: specialistcontrol.ResultAbstained, reason: specialistcontrol.ReasonDeadlineElapsed,
		},
		"failure": {
			err: errors.New("injected failure"), state: specialistcontrol.ResultAbstained, reason: specialistcontrol.ReasonSpecialistFailed,
		},
	}
	for name, test := range tests {
		name, test := name, test
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			registry := Registry{
				routes: map[specialistcontrol.TaskKind]route{
					request.Task: {
						specialistID: request.SpecialistID,
						specialist: specialistFunc(func(context.Context, specialistcontrol.Invocation) (specialistcontrol.SpecialistResult, error) {
							return test.result, test.err
						}),
					},
				},
				now: time.Now,
			}
			response, invokeErr := registry.Invoke(context.Background(), request)
			if response.State != test.state || response.Reason != test.reason || response.Payload != "" {
				t.Fatalf("Invoke(%s) = %#v, %v", name, response, invokeErr)
			}
			wantError := test.err != nil || name == "foreign binding" || name == "foreign specialist" ||
				name == "empty completed" || name == "unknown state" || name == "refused with payload" ||
				name == "abstained with payload"
			if (invokeErr != nil) != wantError {
				t.Fatalf("Invoke(%s) error = %v, want error %t", name, invokeErr, wantError)
			}
		})
	}
	request.MaxResultBytes = 1
	registry := Registry{
		routes: map[specialistcontrol.TaskKind]route{
			request.Task: {
				specialistID: request.SpecialistID,
				specialist: specialistFunc(func(context.Context, specialistcontrol.Invocation) (specialistcontrol.SpecialistResult, error) {
					return specialistcontrol.SpecialistResult{Binding: binding, SpecialistID: request.SpecialistID, State: specialistcontrol.ResultCompleted, Payload: []byte("xx")}, nil
				}),
			},
		},
		now: time.Now,
	}
	response, err := registry.Invoke(context.Background(), request)
	if err == nil || response.Reason != specialistcontrol.ReasonMalformedResult || response.Payload != "" {
		t.Fatalf("Invoke(oversized result) = %#v, %v", response, err)
	}
}

func TestRegistryRejectsNilDependencies(t *testing.T) {
	t.Parallel()
	if _, err := newRegistry(nil); err == nil {
		t.Fatal("newRegistry(nil) succeeded")
	}
	registry, err := NewRegistry()
	if err != nil {
		t.Fatal(err)
	}
	response, err := registry.Invoke(nil, validRequest(specialistCases[0]))
	if err == nil || response.State != specialistcontrol.ResultAbstained || response.Reason != specialistcontrol.ReasonSpecialistFailed {
		t.Fatalf("Invoke(nil) = %#v, %v", response, err)
	}
}

func TestFrozenProcessIdentitiesMatchCanonicalAuthorities(t *testing.T) {
	t.Parallel()
	sourceBody, err := os.ReadFile("../../clrs-generator/upstream.json")
	if err != nil {
		t.Fatal(err)
	}
	source, err := clrsfixture.ParseSourceRecord(sourceBody)
	if err != nil {
		t.Fatal(err)
	}
	sourceID, err := source.Identity()
	if err != nil || sourceID.String() != FrozenSourceID {
		t.Fatalf("source identity = %s, %v, want %s", sourceID, err, FrozenSourceID)
	}
	contractBody, err := os.ReadFile("../../clrs-generator/contract.json")
	if err != nil {
		t.Fatal(err)
	}
	contract, err := clrsfixture.ParseGenerationContract(contractBody, source)
	if err != nil {
		t.Fatal(err)
	}
	contractID, err := contract.Identity(source)
	if err != nil || contractID.String() != FrozenGenerationContractID {
		t.Fatalf("generation contract identity = %s, %v, want %s", contractID, err, FrozenGenerationContractID)
	}
	wantTasks := []clrsfixture.TaskKind{
		clrsfixture.TaskInsertionSort, clrsfixture.TaskBinarySearch, clrsfixture.TaskMatrixChainOrder,
		clrsfixture.TaskBellmanFord, clrsfixture.TaskKMPMatcher, clrsfixture.TaskSegmentsIntersect,
	}
	if !slices.Equal(clrsfixture.ShakedownTasks(), wantTasks) || contract.Output.ExpectedExamples != 48 {
		t.Fatalf("frozen task/example contract drifted: tasks=%v examples=%d", clrsfixture.ShakedownTasks(), contract.Output.ExpectedExamples)
	}
	for name, actual := range map[string]string{
		"insertion":    clrsinsertion.PinnedSourceEvidence().SourceID,
		"binary":       clrsbinary.PinnedSourceEvidence().SourceID,
		"matrix":       clrsmatrixchain.PinnedSourceEvidence().SourceID,
		"bellman-ford": clrsbellmanford.PinnedSourceEvidence().SourceID,
		"KMP":          clrskmp.PinnedSourceEvidence().SourceID,
		"segments":     clrssegments.PinnedSourceEvidence().SourceID,
	} {
		if actual != FrozenSourceID {
			t.Fatalf("%s source identity = %s, want %s", name, actual, FrozenSourceID)
		}
	}
}

func validRequest(test specialistCase) Request {
	return Request{
		SchemaVersion: SchemaVersion, Authority: specialistcontrol.ResultAuthority,
		SourceID: FrozenSourceID, GenerationContractID: FrozenGenerationContractID,
		RunID: "smoke-run", RequestID: "request-1", Task: test.task,
		SpecialistID: test.specialistID, Binding: testBinding,
		TimeoutMillis: 1_000, MaxResultBytes: MaximumResultBytes, Payload: test.prompt,
	}
}
