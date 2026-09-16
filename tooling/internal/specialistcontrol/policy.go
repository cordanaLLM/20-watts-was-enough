// Package specialistcontrol defines the development-only typed-specialist
// control boundary. It does not confer scientific result authority.
package specialistcontrol

import (
	"crypto/sha256"
	"encoding/binary"
	"errors"
	"fmt"
	"sort"
	"time"

	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/clrsfixture"
)

const (
	// ResultAuthority labels every construction output from this package.
	ResultAuthority  = "NO_RESULT"
	maxIdentityBytes = 128
	// Two candidates retain an equal-rank comparison while closing the six-task
	// shakedown at no more than twelve registered specialist routes.
	maxRouteCandidatesPerTask = 2
)

// TaskKind is one accepted CLRS-Text development-shakedown task family.
type TaskKind = clrsfixture.TaskKind

const (
	TaskInsertionSort     = clrsfixture.TaskInsertionSort
	TaskBinarySearch      = clrsfixture.TaskBinarySearch
	TaskMatrixChainOrder  = clrsfixture.TaskMatrixChainOrder
	TaskBellmanFord       = clrsfixture.TaskBellmanFord
	TaskKMPMatcher        = clrsfixture.TaskKMPMatcher
	TaskSegmentsIntersect = clrsfixture.TaskSegmentsIntersect
)

var taskKinds = clrsfixture.ShakedownTasks()

// Limits are caller-owned development bounds. They are not model, dataset, or
// claim thresholds.
type Limits struct {
	MaxRequestBytes int
	MaxResultBytes  int
	MaxRequestAge   time.Duration
	MaxExecution    time.Duration
	// MaxDecisionRecord is the maximum time allowed for any decision-record
	// effect, including bounded terminal cleanup after caller cancellation.
	MaxDecisionRecord time.Duration
}

// Route binds one task kind to one development specialist implementation.
type Route struct {
	Task         TaskKind
	SpecialistID string
}

// Request is the bounded opaque packet seen equally by every future arm.
type Request struct {
	RunID     string
	RequestID string
	Task      TaskKind
	Payload   []byte
	IssuedAt  time.Time
	Deadline  time.Time
}

// Binding is a deterministic request/route identity, not evidence authority.
type Binding [sha256.Size]byte

// CandidateBinding binds one exact candidate to its request and specialist.
type CandidateBinding [sha256.Size]byte

// DecisionState is the terminal policy state before a specialist effect.
type DecisionState string

const (
	DecisionInvoke  DecisionState = "invoke"
	DecisionRefuse  DecisionState = "refuse"
	DecisionAbstain DecisionState = "abstain"
)

// Reason is a closed machine-readable explanation for a decision or outcome.
type Reason string

const (
	ReasonReady                 Reason = "ready"
	ReasonMalformedRequest      Reason = "malformed-request"
	ReasonUnknownTask           Reason = "unknown-task"
	ReasonOversizedRequest      Reason = "oversized-request"
	ReasonStaleRequest          Reason = "stale-request"
	ReasonDeadlineElapsed       Reason = "deadline-elapsed"
	ReasonDeadlineOutOfRange    Reason = "deadline-out-of-range"
	ReasonAdmissionRejected     Reason = "admission-rejected"
	ReasonFallback              Reason = "fallback"
	ReasonCancelled             Reason = "cancelled"
	ReasonMalformedResult       Reason = "malformed-result"
	ReasonUnknownResult         Reason = "unknown-result"
	ReasonStaleResult           Reason = "stale-result"
	ReasonOversizedResult       Reason = "oversized-result"
	ReasonSpecialistAbstained   Reason = "specialist-abstained"
	ReasonSpecialistRefused     Reason = "specialist-refused"
	ReasonSpecialistFailed      Reason = "specialist-failed"
	ReasonVerificationMismatch  Reason = "verification-mismatch"
	ReasonVerificationAbstained Reason = "verification-abstained"
	ReasonVerificationFailed    Reason = "verification-failed"
)

// Decision is the pure policy output that must be recorded before invocation.
type Decision struct {
	State          DecisionState
	Reason         Reason
	Authority      string
	RunID          string
	RequestID      string
	Task           TaskKind
	SpecialistID   string
	Admission      AdmissionDecision
	Binding        Binding
	DecidedAt      time.Time
	Deadline       time.Time
	MaxResultBytes int
}

// SpecialistResult is the bounded candidate returned across the effect seam.
type SpecialistResult struct {
	Binding      Binding
	SpecialistID string
	State        ResultState
	Payload      []byte
}

// ResultState is a specialist's explicit response state.
type ResultState string

const (
	ResultCompleted ResultState = "completed"
	ResultRefused   ResultState = "refused"
	ResultAbstained ResultState = "abstained"
)

// ResultDecision determines whether a candidate may reach the independent
// verifier or must terminate first.
type ResultDecision struct {
	State            ResultDecisionState
	Reason           Reason
	Authority        string
	Binding          Binding
	CandidateBinding CandidateBinding
	SpecialistID     string
	Payload          []byte
}

// ResultDecisionState is the policy state after specialist execution.
type ResultDecisionState string

const (
	ResultVerify  ResultDecisionState = "verify"
	ResultRefuse  ResultDecisionState = "refuse"
	ResultAbstain ResultDecisionState = "abstain"
)

// Verification is returned by a separate exact-scoring implementation.
type Verification struct {
	Binding          Binding
	CandidateBinding CandidateBinding
	Verdict          VerificationVerdict
}

// Candidate is the normalized, policy-bound value sent to the verifier.
type Candidate struct {
	Binding          Binding
	CandidateBinding CandidateBinding
	SpecialistID     string
	State            ResultState
	Payload          []byte
}

// VerificationVerdict is the verifier's closed response vocabulary.
type VerificationVerdict string

const (
	VerificationExact    VerificationVerdict = "exact"
	VerificationMismatch VerificationVerdict = "mismatch"
	VerificationAbstain  VerificationVerdict = "abstain"
)

// Outcome is the development-only terminal state. Even a verified output
// remains NO_RESULT until a separate experiment contract grants authority.
type Outcome struct {
	State     OutcomeState
	Reason    Reason
	Authority string
	Binding   Binding
	Payload   []byte
}

// OutcomeState is the terminal runner state.
type OutcomeState string

const (
	OutcomeVerified  OutcomeState = "verified"
	OutcomeRefused   OutcomeState = "refused"
	OutcomeAbstained OutcomeState = "abstained"
)

// Policy is immutable after construction and performs no effects.
type Policy struct {
	limits Limits
	routes map[TaskKind][]string
}

// NewPolicy validates one or two closed routes for each accepted shakedown task.
func NewPolicy(limits Limits, routes []Route) (Policy, error) {
	if limits.MaxRequestBytes <= 0 || limits.MaxResultBytes <= 0 ||
		limits.MaxRequestAge <= 0 || limits.MaxExecution <= 0 || limits.MaxDecisionRecord <= 0 {
		return Policy{}, errors.New("specialist-control limits must be positive")
	}
	if len(routes) < len(taskKinds) {
		return Policy{}, fmt.Errorf("specialist-control route count = %d, want at least %d", len(routes), len(taskKinds))
	}
	maximumRoutes := len(taskKinds) * maxRouteCandidatesPerTask
	if len(routes) > maximumRoutes {
		return Policy{}, fmt.Errorf("specialist-control route count = %d, maximum %d", len(routes), maximumRoutes)
	}
	knownTasks := make(map[TaskKind]bool, len(taskKinds))
	for _, task := range taskKinds {
		knownTasks[task] = true
	}
	validated := make(map[TaskKind][]string, len(taskKinds))
	seenSpecialists := make(map[string]bool, len(routes))
	for _, route := range routes {
		if !knownTasks[route.Task] || !validIdentity(route.SpecialistID) {
			return Policy{}, fmt.Errorf("invalid specialist-control route %q/%q", route.Task, route.SpecialistID)
		}
		if seenSpecialists[route.SpecialistID] {
			return Policy{}, fmt.Errorf("duplicate specialist-control route %q/%q", route.Task, route.SpecialistID)
		}
		if len(validated[route.Task]) >= maxRouteCandidatesPerTask {
			return Policy{}, fmt.Errorf("specialist-control task %q has more than %d route candidates", route.Task, maxRouteCandidatesPerTask)
		}
		validated[route.Task] = append(validated[route.Task], route.SpecialistID)
		seenSpecialists[route.SpecialistID] = true
	}
	for _, task := range taskKinds {
		if len(validated[task]) == 0 {
			return Policy{}, fmt.Errorf("specialist-control route missing for %q", task)
		}
		sort.Strings(validated[task])
	}
	return Policy{limits: limits, routes: validated}, nil
}

// Tasks returns the accepted task kinds in deterministic order.
func Tasks() []TaskKind {
	tasks := append([]TaskKind(nil), taskKinds...)
	sort.Slice(tasks, func(left, right int) bool { return tasks[left] < tasks[right] })
	return tasks
}

// Decide closes a validated request and typed admission into a route, refusal,
// or explicit fallback without performing effects.
func (policy Policy) Decide(now time.Time, request Request, admission AdmissionDecision) Decision {
	decision, terminal := policy.preflight(now, request)
	if terminal {
		return decision
	}
	decision.Admission = admission
	if !policy.validAdmission(now, request, admission) {
		decision.Reason = ReasonAdmissionRejected
		if policy.validTerminalAdmission(now, request, admission) && admission.State == AdmissionFallback {
			decision.State = DecisionAbstain
			decision.Reason = ReasonFallback
		}
		if policy.validTerminalAdmission(now, request, admission) && admission.Reason == AdmissionReasonCancelled {
			decision.State = DecisionAbstain
			decision.Reason = ReasonCancelled
		}
		if policy.validTerminalAdmission(now, request, admission) && admission.Reason == AdmissionReasonDeadlineElapsed {
			decision.State = DecisionAbstain
			decision.Reason = ReasonDeadlineElapsed
		}
		return decision
	}
	decision.State = DecisionInvoke
	decision.Reason = ReasonReady
	decision.SpecialistID = admission.SpecialistID
	decision.Binding = bindRequest(request, admission.SpecialistID, now, admission)
	return decision
}

func (policy Policy) preflight(now time.Time, request Request) (Decision, bool) {
	decision := Decision{
		State:          DecisionRefuse,
		Reason:         ReasonMalformedRequest,
		Authority:      ResultAuthority,
		RunID:          request.RunID,
		RequestID:      request.RequestID,
		Task:           request.Task,
		DecidedAt:      now,
		Deadline:       request.Deadline,
		MaxResultBytes: policy.limits.MaxResultBytes,
	}
	_, knownTask := policy.routes[request.Task]
	if !knownTask {
		decision.Reason = ReasonUnknownTask
		return decision, true
	}
	if !validRequestMetadata(now, request) {
		return decision, true
	}
	if len(request.Payload) > policy.limits.MaxRequestBytes {
		decision.Reason = ReasonOversizedRequest
		return decision, true
	}
	if !now.Before(request.Deadline) {
		decision.State = DecisionAbstain
		decision.Reason = ReasonDeadlineElapsed
		return decision, true
	}
	if request.Deadline.Sub(now) > policy.limits.MaxExecution {
		decision.Reason = ReasonDeadlineOutOfRange
		return decision, true
	}
	if now.Sub(request.IssuedAt) > policy.limits.MaxRequestAge {
		decision.State = DecisionAbstain
		decision.Reason = ReasonStaleRequest
		return decision, true
	}
	return decision, false
}

// InspectResult determines whether a candidate may be independently verified.
func (policy Policy) InspectResult(now time.Time, request Request, decision Decision, result SpecialistResult) ResultDecision {
	checked := ResultDecision{State: ResultRefuse, Reason: ReasonMalformedResult, Authority: ResultAuthority, Binding: decision.Binding}
	if now.IsZero() || !policy.validDecision(request, decision) || now.Before(decision.DecidedAt) {
		return checked
	}
	if !now.Before(decision.Deadline) {
		checked.State = ResultAbstain
		checked.Reason = ReasonDeadlineElapsed
		return checked
	}
	if result.Binding != decision.Binding {
		checked.Reason = ReasonStaleResult
		return checked
	}
	if result.SpecialistID != decision.SpecialistID {
		checked.Reason = ReasonUnknownResult
		return checked
	}
	if len(result.Payload) > decision.MaxResultBytes {
		checked.Reason = ReasonOversizedResult
		return checked
	}
	switch result.State {
	case ResultCompleted:
		if len(result.Payload) == 0 {
			return checked
		}
		checked.State = ResultVerify
		checked.Reason = ReasonReady
		checked.SpecialistID = result.SpecialistID
		checked.Payload = append([]byte(nil), result.Payload...)
		checked.CandidateBinding = bindCandidate(checked.Binding, result.SpecialistID, result.State, checked.Payload)
	case ResultRefused:
		if len(result.Payload) != 0 {
			return checked
		}
		checked.Reason = ReasonSpecialistRefused
	case ResultAbstained:
		if len(result.Payload) != 0 {
			return checked
		}
		checked.State = ResultAbstain
		checked.Reason = ReasonSpecialistAbstained
	}
	return checked
}

// Finalise converts an independent verification into a terminal NO_RESULT outcome.
func (policy Policy) Finalise(
	now time.Time,
	request Request,
	decision Decision,
	result ResultDecision,
	verification Verification,
) Outcome {
	if now.IsZero() || !policy.validDecision(request, decision) || now.Before(decision.DecidedAt) {
		return terminalOutcome(OutcomeRefused, ReasonMalformedResult, decision.Binding, nil)
	}
	if !now.Before(decision.Deadline) {
		return terminalOutcome(OutcomeAbstained, ReasonDeadlineElapsed, decision.Binding, nil)
	}
	if result.Authority != ResultAuthority || result.Binding != decision.Binding {
		return terminalOutcome(OutcomeRefused, ReasonStaleResult, decision.Binding, nil)
	}
	if result.State == ResultRefuse {
		return terminalOutcome(OutcomeRefused, result.Reason, result.Binding, nil)
	}
	if result.State == ResultAbstain {
		return terminalOutcome(OutcomeAbstained, result.Reason, result.Binding, nil)
	}
	expectedCandidate := bindCandidate(result.Binding, result.SpecialistID, ResultCompleted, result.Payload)
	if result.State != ResultVerify || result.Reason != ReasonReady || result.Binding == (Binding{}) ||
		len(result.Payload) == 0 || len(result.Payload) > policy.limits.MaxResultBytes ||
		result.SpecialistID != decision.SpecialistID || result.CandidateBinding != expectedCandidate ||
		verification.Binding != result.Binding ||
		verification.CandidateBinding != expectedCandidate {
		return terminalOutcome(OutcomeRefused, ReasonStaleResult, result.Binding, nil)
	}
	switch verification.Verdict {
	case VerificationExact:
		return terminalOutcome(OutcomeVerified, ReasonReady, result.Binding, result.Payload)
	case VerificationMismatch:
		return terminalOutcome(OutcomeAbstained, ReasonVerificationMismatch, result.Binding, nil)
	case VerificationAbstain:
		return terminalOutcome(OutcomeAbstained, ReasonVerificationAbstained, result.Binding, nil)
	default:
		return terminalOutcome(OutcomeRefused, ReasonMalformedResult, result.Binding, nil)
	}
}

func (policy Policy) specialistIDs() []string {
	var identities []string
	for _, specialistIDs := range policy.routes {
		identities = append(identities, specialistIDs...)
	}
	sort.Strings(identities)
	return identities
}

func (policy Policy) routeSnapshot() map[TaskKind][]string {
	routes := make(map[TaskKind][]string, len(policy.routes))
	for task, specialistIDs := range policy.routes {
		routes[task] = append([]string(nil), specialistIDs...)
	}
	return routes
}

func (policy Policy) allows(task TaskKind, specialistID string) bool {
	for _, candidateID := range policy.routes[task] {
		if candidateID == specialistID {
			return true
		}
	}
	return false
}

func (policy Policy) validAdmission(now time.Time, request Request, admission AdmissionDecision) bool {
	return admission.State == AdmissionAdmitted && admission.Reason == AdmissionReasonReady &&
		admission.Authority == ResultAuthority && policy.allows(request.Task, admission.SpecialistID) &&
		admissibleFit(admission.Fit) && validAdmissionFitEvidence(now, admission) &&
		admission.Readiness == ReadinessReady && admission.Attempts > 0 &&
		!admission.ObservedAt.IsZero() && !admission.ObservedAt.After(now) &&
		admission.ValidUntil.After(admission.ObservedAt) && now.Before(admission.ValidUntil) &&
		(admission.QueuedAt.IsZero() || !admission.QueuedAt.After(now)) && admission.DecidedAt.Equal(now)
}

func (policy Policy) validTerminalAdmission(now time.Time, request Request, admission AdmissionDecision) bool {
	if admission.Authority != ResultAuthority || admission.Attempts <= 0 || !admission.DecidedAt.Equal(now) {
		return false
	}
	switch admission.State {
	case AdmissionFallback:
		switch admission.Reason {
		case AdmissionReasonFitUnknown, AdmissionReasonKnownNoFit, AdmissionReasonAbsent,
			AdmissionReasonLoading, AdmissionReasonSaturated, AdmissionReasonStale,
			AdmissionReasonFailed, AdmissionReasonQueueFull, AdmissionReasonWaitExpired,
			AdmissionReasonRetryExhausted, AdmissionReasonObservationChanged:
		default:
			return false
		}
	case AdmissionRejected:
		if admission.Reason != AdmissionReasonMalformed && admission.Reason != AdmissionReasonDeadlineElapsed &&
			admission.Reason != AdmissionReasonCancelled {
			return false
		}
	default:
		return false
	}
	if admission.SpecialistID == "" {
		return admission.State == AdmissionRejected && admission.Fit == "" && admission.Readiness == "" &&
			admission.FitMeasurementBasis == "" && admission.FitMeasuredAt.IsZero() &&
			admission.FitValidUntil.IsZero() && admission.ObservedAt.IsZero() && admission.ValidUntil.IsZero()
	}
	return policy.allows(request.Task, admission.SpecialistID) && validFit(admission.Fit) &&
		validAdmissionFitEvidence(now, admission) &&
		validReadiness(admission.Readiness) && !admission.ObservedAt.IsZero() && !admission.ObservedAt.After(now) &&
		admission.ValidUntil.After(admission.ObservedAt) &&
		(admission.QueuedAt.IsZero() || !admission.QueuedAt.After(now))
}

func validAdmissionFitEvidence(now time.Time, admission AdmissionDecision) bool {
	if admission.Fit != FitMeasured {
		return admission.FitMeasurementBasis == "" && admission.FitMeasuredAt.IsZero() &&
			admission.FitValidUntil.IsZero()
	}
	// The Admission constructor owns the configured absolute cap. The pure
	// policy also closes the recorded fit window inside its enclosing readiness
	// observation so a forged fit cannot outlive that record.
	fitValidity := admission.FitValidUntil.Sub(admission.FitMeasuredAt)
	observationValidity := admission.ValidUntil.Sub(admission.ObservedAt)
	return validIdentity(admission.FitMeasurementBasis) && !admission.FitMeasuredAt.IsZero() &&
		!admission.FitMeasuredAt.After(admission.ObservedAt) &&
		fitValidity > 0 && observationValidity > 0 && fitValidity <= observationValidity &&
		!admission.FitValidUntil.After(admission.ValidUntil) && now.Before(admission.FitValidUntil)
}

func (policy Policy) validDecision(request Request, decision Decision) bool {
	_, knownTask := policy.routes[request.Task]
	return knownTask && decision.State == DecisionInvoke && decision.Reason == ReasonReady &&
		decision.Authority == ResultAuthority && decision.RunID == request.RunID &&
		decision.RequestID == request.RequestID && decision.Task == request.Task &&
		policy.allows(request.Task, decision.SpecialistID) && !decision.DecidedAt.IsZero() &&
		!decision.DecidedAt.Before(request.IssuedAt) && decision.DecidedAt.Before(request.Deadline) &&
		decision.DecidedAt.Sub(request.IssuedAt) <= policy.limits.MaxRequestAge &&
		request.Deadline.Sub(decision.DecidedAt) <= policy.limits.MaxExecution &&
		decision.Deadline.Equal(request.Deadline) &&
		decision.MaxResultBytes == policy.limits.MaxResultBytes &&
		policy.validAdmission(decision.DecidedAt, request, decision.Admission) &&
		decision.Binding == bindRequest(request, decision.SpecialistID, decision.DecidedAt, decision.Admission)
}

func validRequestMetadata(now time.Time, request Request) bool {
	return !now.IsZero() && validIdentity(request.RunID) && validIdentity(request.RequestID) &&
		len(request.Payload) > 0 && !request.IssuedAt.IsZero() && !request.Deadline.IsZero() &&
		!request.IssuedAt.After(now) && request.Deadline.After(request.IssuedAt)
}

func validIdentity(value string) bool {
	if len(value) == 0 || len(value) > maxIdentityBytes {
		return false
	}
	for index := range len(value) {
		character := value[index]
		if (character < 'a' || character > 'z') && (character < 'A' || character > 'Z') &&
			(character < '0' || character > '9') && character != '.' && character != '_' && character != ':' && character != '-' {
			return false
		}
	}
	return true
}

func bindRequest(request Request, specialistID string, decidedAt time.Time, admission AdmissionDecision) Binding {
	hash := sha256.New()
	for _, value := range []string{request.RunID, request.RequestID, string(request.Task), specialistID} {
		_ = binary.Write(hash, binary.BigEndian, uint64(len(value)))
		_, _ = hash.Write([]byte(value))
	}
	for _, value := range []int64{
		request.IssuedAt.UnixNano(), decidedAt.UnixNano(), request.Deadline.UnixNano(), int64(len(request.Payload)),
	} {
		_ = binary.Write(hash, binary.BigEndian, value)
	}
	_, _ = hash.Write(request.Payload)
	for _, value := range []string{
		string(admission.State), string(admission.Reason), admission.Authority, admission.SpecialistID,
		string(admission.Fit), admission.FitMeasurementBasis, string(admission.Readiness),
	} {
		_ = binary.Write(hash, binary.BigEndian, uint64(len(value)))
		_, _ = hash.Write([]byte(value))
	}
	for _, value := range []int64{
		admission.FitMeasuredAt.UnixNano(), admission.FitValidUntil.UnixNano(), admission.ObservedAt.UnixNano(),
		admission.ValidUntil.UnixNano(), admission.QueuedAt.UnixNano(), admission.DecidedAt.UnixNano(),
		int64(admission.Attempts),
	} {
		_ = binary.Write(hash, binary.BigEndian, value)
	}
	_ = binary.Write(hash, binary.BigEndian, admission.DeclaredCost)
	var binding Binding
	copy(binding[:], hash.Sum(nil))
	return binding
}

func bindCandidate(binding Binding, specialistID string, state ResultState, payload []byte) CandidateBinding {
	hash := sha256.New()
	_, _ = hash.Write(binding[:])
	for _, value := range []string{specialistID, string(state)} {
		_ = binary.Write(hash, binary.BigEndian, uint64(len(value)))
		_, _ = hash.Write([]byte(value))
	}
	_ = binary.Write(hash, binary.BigEndian, uint64(len(payload)))
	_, _ = hash.Write(payload)
	var candidateBinding CandidateBinding
	copy(candidateBinding[:], hash.Sum(nil))
	return candidateBinding
}

func terminalOutcome(state OutcomeState, reason Reason, binding Binding, payload []byte) Outcome {
	return Outcome{
		State:     state,
		Reason:    reason,
		Authority: ResultAuthority,
		Binding:   binding,
		Payload:   append([]byte(nil), payload...),
	}
}
