package specialistcontrol

import (
	"context"
	"crypto/sha256"
	"errors"
	"fmt"
	"sort"
	"sync"
	"time"
)

// FitState records measured or construction-only task fit without treating an
// unknown as a match. Per-request resource demand remains a separate policy and
// adapter boundary.
type FitState string

const (
	FitMeasured       FitState = "measured-fit"
	FitTaskCompatible FitState = "task-compatible"
	FitKnownNoFit     FitState = "known-no-fit"
	FitUnknown        FitState = "unknown"
)

// ReadinessState is the observed execution state of one registered specialist.
type ReadinessState string

const (
	ReadinessAbsent    ReadinessState = "absent"
	ReadinessLoading   ReadinessState = "loading"
	ReadinessReady     ReadinessState = "ready"
	ReadinessSaturated ReadinessState = "saturated"
	ReadinessStale     ReadinessState = "stale"
	ReadinessFailed    ReadinessState = "failed"
)

// RequestFit binds one registered task to its observed fit state. Measured fit
// requires a caller-owned basis, measurement time, and bounded validity; the
// other states carry no measurement metadata.
type RequestFit struct {
	Task                TaskKind
	State               FitState
	MeasurementBasis    string
	MeasuredAt          time.Time
	MeasurementValidFor time.Duration
}

// ReadinessObservation is one bounded, timestamped specialist snapshot.
type ReadinessObservation struct {
	SpecialistID string
	State        ReadinessState
	ObservedAt   time.Time
	ValidFor     time.Duration
	DeclaredCost uint64
	Fits         []RequestFit
}

// AdmissionLimits bound observation lifetime, waiting, retries, queue growth,
// and active work. They are construction controls, not scientific budgets.
type AdmissionLimits struct {
	MaxObservationValidity time.Duration
	// MaxQueueDepth applies independently to each specialist so one route
	// cannot consume every waiting position.
	MaxQueueDepth int
	MaxWait       time.Duration
	// MaxRetries bounds readiness-observation retries independently for each
	// candidate. Queue progression and slot release do not consume this budget.
	MaxRetries                  int
	MaxConcurrencyPerSpecialist int
	// MaxTotalPending and MaxTotalActive close aggregate growth across every
	// registered route in addition to the per-specialist limits above.
	MaxTotalPending int
	MaxTotalActive  int
}

// AdmissionState distinguishes execution admission from explicit fallback and rejection.
type AdmissionState string

const (
	AdmissionAdmitted AdmissionState = "admitted"
	AdmissionFallback AdmissionState = "fallback"
	AdmissionRejected AdmissionState = "rejected"
)

// AdmissionReason is the closed explanation for an admission decision.
type AdmissionReason string

const (
	AdmissionReasonReady              AdmissionReason = "ready"
	AdmissionReasonMalformed          AdmissionReason = "malformed"
	AdmissionReasonFitUnknown         AdmissionReason = "fit-unknown"
	AdmissionReasonKnownNoFit         AdmissionReason = "known-no-fit"
	AdmissionReasonAbsent             AdmissionReason = "absent"
	AdmissionReasonLoading            AdmissionReason = "loading"
	AdmissionReasonSaturated          AdmissionReason = "saturated"
	AdmissionReasonStale              AdmissionReason = "stale"
	AdmissionReasonFailed             AdmissionReason = "failed"
	AdmissionReasonQueueFull          AdmissionReason = "queue-full"
	AdmissionReasonWaitExpired        AdmissionReason = "wait-expired"
	AdmissionReasonRetryExhausted     AdmissionReason = "retry-exhausted"
	AdmissionReasonObservationChanged AdmissionReason = "observation-changed"
	AdmissionReasonDeadlineElapsed    AdmissionReason = "deadline-elapsed"
	AdmissionReasonCancelled          AdmissionReason = "cancelled"
)

// AdmissionDecision is recorded separately from route and result states.
type AdmissionDecision struct {
	State               AdmissionState
	Reason              AdmissionReason
	Authority           string
	SpecialistID        string
	Fit                 FitState
	FitMeasurementBasis string
	FitMeasuredAt       time.Time
	FitValidUntil       time.Time
	Readiness           ReadinessState
	ObservedAt          time.Time
	ValidUntil          time.Time
	QueuedAt            time.Time
	DecidedAt           time.Time
	DeclaredCost        uint64
	Attempts            int
}

type observedFit struct {
	state            FitState
	measurementBasis string
	measuredAt       time.Time
	validUntil       time.Time
}

type observedSpecialist struct {
	state        ReadinessState
	observedAt   time.Time
	validUntil   time.Time
	declaredCost uint64
	fits         map[TaskKind]observedFit
}

type admissionTicket struct {
	task             TaskKind
	queuedAt         time.Time
	deadline         time.Time
	retries          int
	candidates       map[string]bool
	candidateStates  map[string]ticketCandidateState
	candidateRetries map[string]int
	exhausted        map[string]bool
	last             AdmissionDecision
}

type ticketCandidateState struct {
	observationVersion uint64
	fit                FitState
	readiness          ReadinessState
	declaredCost       uint64
	capacityBlocked    bool
}

type admissionLeaseState struct {
	admission    *Admission
	specialistID string
	token        uint64
	request      admissionLeaseRequest
	revalidated  bool
	released     bool
}

type admissionLeaseRequest struct {
	runID       string
	requestID   string
	task        TaskKind
	issuedAt    time.Time
	deadline    time.Time
	payloadSize int
	payloadHash [sha256.Size]byte
}

// Admission owns one synchronized queue and the active reservations for the
// existing specialist controller. It starts no background loop.
type Admission struct {
	mu                  sync.Mutex
	limits              AdmissionLimits
	maxRequestBytes     int
	routes              map[TaskKind][]string
	registered          map[string]bool
	observations        map[string]observedSpecialist
	active              map[string]int
	activeTotal         int
	activeLeases        map[uint64]*admissionLeaseState
	nextLeaseToken      uint64
	observationVersions map[string]uint64
	pending             []*admissionTicket
	changed             chan struct{}
}

// AdmissionLease reserves exactly one per-specialist execution slot. Copies
// share opaque state; revalidation and release each succeed at most once.
type AdmissionLease struct {
	state *admissionLeaseState
}

// NewAdmission closes one observation for every specialist registered by policy.
func NewAdmission(
	policy Policy,
	limits AdmissionLimits,
	observations []ReadinessObservation,
	at time.Time,
) (*Admission, error) {
	if err := validateAdmissionLimits(limits); err != nil {
		return nil, err
	}
	if at.IsZero() {
		return nil, errors.New("specialist admission construction time is required")
	}
	registered := policy.specialistIDs()
	if len(registered) == 0 || len(observations) != len(registered) {
		return nil, fmt.Errorf("specialist readiness observation count = %d, want %d", len(observations), len(registered))
	}
	limits, err := closeAggregateLimits(limits, len(registered))
	if err != nil {
		return nil, err
	}
	admission := &Admission{
		limits: limits, maxRequestBytes: policy.limits.MaxRequestBytes,
		routes: policy.routeSnapshot(), registered: make(map[string]bool, len(registered)),
		observations: make(map[string]observedSpecialist, len(registered)), active: make(map[string]int, len(registered)),
		activeLeases: make(map[uint64]*admissionLeaseState), nextLeaseToken: 1,
		observationVersions: make(map[string]uint64, len(registered)), changed: make(chan struct{}),
	}
	for _, specialistID := range registered {
		admission.registered[specialistID] = true
	}
	for _, observation := range observations {
		if _, duplicate := admission.observations[observation.SpecialistID]; duplicate {
			return nil, fmt.Errorf("duplicate readiness observation for %q", observation.SpecialistID)
		}
		parsed, err := admission.parseObservation(at, observation)
		if err != nil {
			return nil, err
		}
		admission.observations[observation.SpecialistID] = parsed
	}
	return admission, nil
}

// Observe atomically replaces one registered specialist's newer snapshot.
func (admission *Admission) Observe(at time.Time, observation ReadinessObservation) error {
	if admission == nil {
		return errors.New("specialist admission is nil")
	}
	parsed, err := admission.parseObservation(at, observation)
	if err != nil {
		return err
	}
	admission.mu.Lock()
	defer admission.mu.Unlock()
	previous := admission.observations[observation.SpecialistID]
	if !observation.ObservedAt.After(previous.observedAt) {
		return fmt.Errorf("readiness observation for %q is not newer", observation.SpecialistID)
	}
	if admission.observationVersions[observation.SpecialistID] == ^uint64(0) {
		return fmt.Errorf("readiness observation version for %q is exhausted", observation.SpecialistID)
	}
	admission.observations[observation.SpecialistID] = parsed
	admission.observationVersions[observation.SpecialistID]++
	admission.signalLocked()
	return nil
}

// Acquire waits only while a positive-fit route has a transient readiness or
// capacity obstruction. Eligibility and slot reservation share one lock.
func (admission *Admission) Acquire(
	ctx context.Context,
	request Request,
	now func() time.Time,
) (AdmissionDecision, *AdmissionLease) {
	if admission == nil || ctx == nil || now == nil {
		return admissionTerminal(AdmissionRejected, AdmissionReasonMalformed, time.Time{}, 1), nil
	}
	admission.mu.Lock()
	at := now()
	if decision, terminal := admission.contextBoundary(ctx, request, at, 1); terminal {
		admission.mu.Unlock()
		return decision, nil
	}
	if !ValidIdentity(request.RunID) || !ValidIdentity(request.RequestID) ||
		len(request.Payload) == 0 || len(request.Payload) > admission.maxRequestBytes {
		admission.mu.Unlock()
		return admissionTerminal(AdmissionRejected, AdmissionReasonMalformed, at, 1), nil
	}
	decision, waitable, lease := admission.attemptLocked(request, nil, at)
	if lease != nil || !waitable {
		admission.mu.Unlock()
		return decision, lease
	}
	if admission.limits.MaxRetries == 0 {
		admission.mu.Unlock()
		decision.Reason = AdmissionReasonRetryExhausted
		return decision, nil
	}
	candidates := admission.queueCandidatesLocked(request.Task, at)
	if !admission.queueHasCapacityLocked(candidates) {
		admission.mu.Unlock()
		decision.Reason = AdmissionReasonQueueFull
		return decision, nil
	}
	ticket := admission.enqueueLocked(request, candidates, at, decision)
	admission.mu.Unlock()
	return admission.wait(ctx, request, now, ticket)
}

type admissionWaitEvent uint8

const (
	waitStarted admissionWaitEvent = iota
	waitContext
	waitChanged
	waitTimer
)

func (admission *Admission) wait(
	ctx context.Context,
	request Request,
	now func() time.Time,
	ticket *admissionTicket,
) (AdmissionDecision, *AdmissionLease) {
	event := waitStarted
	for {
		admission.mu.Lock()
		at := now()
		decision, lease, terminal := admission.advanceWaitingLocked(ctx, request, ticket, event, at)
		if terminal {
			admission.removeTicketLocked(ticket)
			admission.mu.Unlock()
			return decision, lease
		}
		wakeAt := admission.nextWakeLocked(request, ticket, at)
		notification := admission.changed
		admission.mu.Unlock()

		timer := time.NewTimer(durationUntil(wakeAt, at))
		select {
		case <-ctx.Done():
			event = waitContext
			stopTimer(timer)
		case <-timer.C:
			event = waitTimer
		case <-notification:
			event = waitChanged
			stopTimer(timer)
		}
	}
}

func (admission *Admission) advanceWaitingLocked(
	ctx context.Context,
	request Request,
	ticket *admissionTicket,
	event admissionWaitEvent,
	at time.Time,
) (AdmissionDecision, *AdmissionLease, bool) {
	if decision, terminal := admission.waitingBoundary(ctx, request, ticket, at); terminal {
		return decision, nil, true
	}
	if event == waitContext {
		return AdmissionDecision{}, nil, false
	}
	changed, hitLimits := admission.refreshTicketStateLocked(ticket, at)
	if event != waitTimer && !changed {
		return AdmissionDecision{}, nil, false
	}
	ticket.retries++
	decision, waitable, lease := admission.attemptLocked(request, ticket, at)
	if lease != nil || !waitable {
		return decision, lease, true
	}
	ticket.last = decision
	retired := admission.retireCandidatesLocked(ticket, hitLimits)
	if !admission.ticketWaitableLocked(ticket, at) {
		decision.Reason = AdmissionReasonRetryExhausted
		return decision, nil, true
	}
	if retired {
		admission.signalLocked()
	}
	return AdmissionDecision{}, nil, false
}

func (admission *Admission) attemptLocked(
	request Request,
	ticket *admissionTicket,
	at time.Time,
) (AdmissionDecision, bool, *AdmissionLease) {
	selected, representative, waitable := admission.selectLocked(request.Task, ticket, at)
	attempts, queuedAt := 1, time.Time{}
	if ticket != nil {
		attempts, queuedAt = ticket.retries+1, ticket.queuedAt
	}
	if selected == "" {
		representative.Authority = ResultAuthority
		representative.State = AdmissionFallback
		representative.QueuedAt = queuedAt
		representative.DecidedAt = at
		representative.Attempts = attempts
		return representative, waitable, nil
	}
	observation := admission.observations[selected]
	lease := admission.reserveLocked(selected, request)
	if lease == nil {
		decision := decisionFromUnavailable(
			selected, observation, observation.fits[request.Task], at, AdmissionReasonSaturated,
		).at(at)
		decision.Readiness = ReadinessSaturated
		decision.QueuedAt = queuedAt
		decision.Attempts = attempts
		return decision, true, nil
	}
	decision := decisionFromObservation(selected, observation, request.Task, queuedAt, at, attempts)
	return decision, false, lease
}

func (admission *Admission) selectLocked(
	task TaskKind,
	ticket *admissionTicket,
	at time.Time,
) (string, AdmissionDecision, bool) {
	type eligible struct {
		id   string
		cost uint64
	}
	var choices []eligible
	var representative AdmissionDecision
	waitable, compatible := false, false
	plannedSpecialist := admission.plannedSpecialistLocked(ticket, task, at)
	for _, specialistID := range admission.routes[task] {
		if ticket != nil && (!ticket.candidates[specialistID] || ticket.exhausted[specialistID]) {
			continue
		}
		observation := admission.observations[specialistID]
		observedFit := observation.fits[task]
		fit := effectiveFit(observedFit, at)
		state := effectiveReadiness(observation, at)
		if state == ReadinessStale {
			candidate := decisionFromUnavailable(specialistID, observation, observedFit, at, AdmissionReasonStale)
			candidate.Readiness = state
			if representative.Reason == "" || readinessPriority(candidate.Reason) < readinessPriority(representative.Reason) {
				representative = candidate
			}
			continue
		}
		if !admissibleFit(fit) {
			candidate := decisionFromUnavailable(specialistID, observation, observedFit, at, fitReason(fit))
			if representative.Reason == "" || readinessPriority(candidate.Reason) < readinessPriority(representative.Reason) {
				representative = candidate
			}
			continue
		}
		compatible = true
		blocked := state == ReadinessReady && plannedSpecialist != specialistID
		if state == ReadinessReady && !blocked {
			choices = append(choices, eligible{id: specialistID, cost: observation.declaredCost})
			continue
		}
		if blocked {
			state = ReadinessSaturated
		}
		candidate := decisionFromUnavailable(specialistID, observation, observedFit, at, readinessReason(state))
		candidate.Readiness = state
		if representative.Reason == "" || readinessPriority(candidate.Reason) < readinessPriority(representative.Reason) {
			representative = candidate
		}
		waitable = waitable || state == ReadinessLoading || state == ReadinessSaturated
	}
	if len(choices) > 0 {
		sort.Slice(choices, func(left, right int) bool {
			if choices[left].cost != choices[right].cost {
				return choices[left].cost < choices[right].cost
			}
			return choices[left].id < choices[right].id
		})
		return choices[0].id, AdmissionDecision{}, false
	}
	if representative.Reason == "" {
		reason := AdmissionReasonFitUnknown
		if compatible {
			reason = AdmissionReasonAbsent
		}
		representative.Reason = reason
	}
	return "", representative, waitable
}

func (admission *Admission) reserveLocked(specialistID string, request Request) *AdmissionLease {
	if admission.activeTotal >= admission.limits.MaxTotalActive ||
		admission.active[specialistID] >= admission.limits.MaxConcurrencyPerSpecialist {
		return nil
	}
	for range admission.limits.MaxTotalActive {
		token := admission.nextLeaseToken
		admission.nextLeaseToken++
		if admission.nextLeaseToken == 0 {
			admission.nextLeaseToken = 1
		}
		if token == 0 {
			continue
		}
		if _, active := admission.activeLeases[token]; active {
			continue
		}
		state := &admissionLeaseState{
			admission: admission, specialistID: specialistID, token: token,
			request: snapshotLeaseRequest(request),
		}
		admission.activeLeases[token] = state
		admission.active[specialistID]++
		admission.activeTotal++
		return &AdmissionLease{state: state}
	}
	return nil
}

// Revalidate checks cancellation, request time, observation freshness, fit,
// and readiness immediately before the reserved specialist effect.
func (lease *AdmissionLease) Revalidate(ctx context.Context, request Request, now func() time.Time) AdmissionDecision {
	if lease == nil || lease.state == nil || lease.state.admission == nil || ctx == nil || now == nil {
		return admissionTerminal(AdmissionRejected, AdmissionReasonMalformed, time.Time{}, 1)
	}
	leaseState := lease.state
	admission := leaseState.admission
	admission.mu.Lock()
	defer admission.mu.Unlock()
	at := now()
	activeState, active := admission.activeLeases[leaseState.token]
	if !active || activeState != leaseState || leaseState.released || leaseState.revalidated {
		return admissionTerminal(AdmissionRejected, AdmissionReasonMalformed, at, 1)
	}
	leaseState.revalidated = true
	if decision, terminal := admission.contextBoundary(ctx, request, at, 1); terminal {
		return decision
	}
	if !leaseState.request.matches(request) {
		return admissionTerminal(AdmissionRejected, AdmissionReasonMalformed, at, 1)
	}
	observation, present := admission.observations[leaseState.specialistID]
	if !present || admission.active[leaseState.specialistID] <= 0 || admission.activeTotal <= 0 {
		return admissionTerminal(AdmissionRejected, AdmissionReasonMalformed, at, 1)
	}
	observedFit := observation.fits[request.Task]
	fit := effectiveFit(observedFit, at)
	state := effectiveReadiness(observation, at)
	if state == ReadinessStale {
		decision := decisionFromUnavailable(
			activeState.specialistID, observation, observedFit, at, AdmissionReasonStale,
		).at(at)
		decision.Readiness = state
		return decision
	}
	if !admissibleFit(fit) {
		return decisionFromUnavailable(
			activeState.specialistID, observation, observedFit, at, fitReason(fit),
		).at(at)
	}
	if state != ReadinessReady {
		decision := decisionFromUnavailable(
			activeState.specialistID, observation, observedFit, at, readinessReason(state),
		).at(at)
		decision.Readiness = state
		return decision
	}
	return decisionFromObservation(activeState.specialistID, observation, request.Task, time.Time{}, at, 1)
}

func snapshotLeaseRequest(request Request) admissionLeaseRequest {
	return admissionLeaseRequest{
		runID: request.RunID, requestID: request.RequestID, task: request.Task,
		issuedAt: request.IssuedAt, deadline: request.Deadline,
		payloadSize: len(request.Payload), payloadHash: sha256.Sum256(request.Payload),
	}
}

func (expected admissionLeaseRequest) matches(request Request) bool {
	return expected.runID == request.RunID && expected.requestID == request.RequestID &&
		expected.task == request.Task && expected.issuedAt.Equal(request.IssuedAt) &&
		expected.deadline.Equal(request.Deadline) && expected.payloadSize == len(request.Payload) &&
		expected.payloadHash == sha256.Sum256(request.Payload)
}

// Release returns an acquired slot at most once and wakes bounded waiters.
func (lease *AdmissionLease) Release() {
	if lease == nil || lease.state == nil || lease.state.admission == nil {
		return
	}
	leaseState := lease.state
	admission := leaseState.admission
	admission.mu.Lock()
	activeState, active := admission.activeLeases[leaseState.token]
	if !active || activeState != leaseState || leaseState.released {
		admission.mu.Unlock()
		return
	}
	leaseState.released = true
	delete(admission.activeLeases, leaseState.token)
	if admission.active[leaseState.specialistID] > 0 && admission.activeTotal > 0 {
		admission.active[leaseState.specialistID]--
		admission.activeTotal--
	}
	admission.signalLocked()
	admission.mu.Unlock()
}

func (admission *Admission) parseObservation(at time.Time, input ReadinessObservation) (observedSpecialist, error) {
	if at.IsZero() || input.ObservedAt.IsZero() || input.ObservedAt.After(at) ||
		input.ValidFor <= 0 || input.ValidFor > admission.limits.MaxObservationValidity ||
		!admission.registered[input.SpecialistID] || !validReadiness(input.State) {
		return observedSpecialist{}, fmt.Errorf("invalid readiness observation for %q", input.SpecialistID)
	}
	required := admission.tasksFor(input.SpecialistID)
	if len(required) == 0 || len(input.Fits) != len(required) {
		return observedSpecialist{}, fmt.Errorf("readiness fit count for %q = %d, want %d", input.SpecialistID, len(input.Fits), len(required))
	}
	fits := make(map[TaskKind]observedFit, len(input.Fits))
	for _, fit := range input.Fits {
		if !required[fit.Task] || !validFit(fit.State) {
			return observedSpecialist{}, fmt.Errorf("invalid readiness fit for %q/%q", input.SpecialistID, fit.Task)
		}
		if _, duplicate := fits[fit.Task]; duplicate {
			return observedSpecialist{}, fmt.Errorf("duplicate readiness fit for %q/%q", input.SpecialistID, fit.Task)
		}
		parsedFit, err := admission.parseFit(at, input.ObservedAt, input.ValidFor, fit)
		if err != nil {
			return observedSpecialist{}, fmt.Errorf("invalid readiness fit for %q/%q: %w", input.SpecialistID, fit.Task, err)
		}
		fits[fit.Task] = parsedFit
	}
	validUntil := input.ObservedAt.Add(input.ValidFor)
	if !validUntil.After(input.ObservedAt) {
		return observedSpecialist{}, fmt.Errorf("readiness validity for %q overflows", input.SpecialistID)
	}
	return observedSpecialist{
		state: input.State, observedAt: input.ObservedAt, validUntil: validUntil,
		declaredCost: input.DeclaredCost, fits: fits,
	}, nil
}

func (admission *Admission) parseFit(
	at, observedAt time.Time,
	observationValidFor time.Duration,
	input RequestFit,
) (observedFit, error) {
	if input.State != FitMeasured {
		if input.MeasurementBasis != "" || !input.MeasuredAt.IsZero() || input.MeasurementValidFor != 0 {
			return observedFit{}, errors.New("measurement metadata requires measured-fit")
		}
		return observedFit{state: input.State}, nil
	}
	if !ValidIdentity(input.MeasurementBasis) || input.MeasuredAt.IsZero() || input.MeasuredAt.After(observedAt) ||
		input.MeasurementValidFor <= 0 || input.MeasurementValidFor > admission.limits.MaxObservationValidity ||
		input.MeasurementValidFor > observationValidFor {
		return observedFit{}, errors.New("measured-fit basis or time bound is invalid")
	}
	validUntil := input.MeasuredAt.Add(input.MeasurementValidFor)
	if !validUntil.After(input.MeasuredAt) || !at.Before(validUntil) {
		return observedFit{}, errors.New("measured-fit validity is expired or overflows")
	}
	return observedFit{
		state: FitMeasured, measurementBasis: input.MeasurementBasis,
		measuredAt: input.MeasuredAt, validUntil: validUntil,
	}, nil
}

func (admission *Admission) tasksFor(specialistID string) map[TaskKind]bool {
	tasks := make(map[TaskKind]bool)
	for task, identities := range admission.routes {
		for _, identity := range identities {
			if identity == specialistID {
				tasks[task] = true
			}
		}
	}
	return tasks
}

func (admission *Admission) matchesPolicy(policy Policy) bool {
	if admission == nil || len(admission.routes) != len(policy.routes) {
		return false
	}
	for task, expected := range policy.routes {
		actual := admission.routes[task]
		if len(actual) != len(expected) {
			return false
		}
		for index := range expected {
			if actual[index] != expected[index] {
				return false
			}
		}
	}
	return true
}

func (admission *Admission) ticketWithinWaitLocked(ticket *admissionTicket, at time.Time) bool {
	return !at.Before(ticket.queuedAt) && at.Before(ticket.deadline) &&
		at.Before(ticket.queuedAt.Add(admission.limits.MaxWait))
}

type admissionMatchingTicket struct {
	source *admissionTicket
	task   TaskKind
}

type admissionCapacitySlot struct {
	specialistID string
}

// plannedSpecialistLocked computes a deterministic FIFO capacity matching for
// live queued tickets and the target. Later tickets cannot displace an earlier
// matched ticket, but may move it to another compatible slot so constrained
// queued work is not stranded behind a needlessly chosen route.
func (admission *Admission) plannedSpecialistLocked(
	target *admissionTicket,
	task TaskKind,
	at time.Time,
) string {
	freeTotal := admission.limits.MaxTotalActive - admission.activeTotal
	if freeTotal <= 0 {
		return ""
	}
	tickets, targetIndex := admission.matchingTicketsLocked(target, task, at)
	if targetIndex < 0 {
		return ""
	}

	identities := make([]string, 0, len(admission.registered))
	for specialistID := range admission.registered {
		identities = append(identities, specialistID)
	}
	sort.Strings(identities)
	slots := make([]admissionCapacitySlot, 0, len(tickets))
	slotsBySpecialist := make(map[string][]int, len(identities))
	for _, specialistID := range identities {
		free := admission.limits.MaxConcurrencyPerSpecialist - admission.active[specialistID]
		if free <= 0 {
			continue
		}
		if free > freeTotal {
			free = freeTotal
		}
		if free > len(tickets) {
			free = len(tickets)
		}
		for range free {
			slot := len(slots)
			slots = append(slots, admissionCapacitySlot{specialistID: specialistID})
			slotsBySpecialist[specialistID] = append(slotsBySpecialist[specialistID], slot)
		}
	}

	choices := make([][]int, len(tickets))
	for index, ticket := range tickets {
		for _, specialistID := range admission.matchingCandidatesLocked(ticket, slotsBySpecialist, at) {
			choices[index] = append(choices[index], slotsBySpecialist[specialistID]...)
		}
	}
	owners := make([]int, len(slots))
	assignments := make([]int, len(tickets))
	for index := range owners {
		owners[index] = -1
	}
	for index := range assignments {
		assignments[index] = -1
	}
	matched := 0
	for ticketIndex := range tickets {
		if matched >= freeTotal {
			break
		}
		if augmentAdmissionMatching(ticketIndex, choices, owners, assignments) {
			matched++
		}
	}
	if assignments[targetIndex] < 0 {
		return ""
	}
	return slots[assignments[targetIndex]].specialistID
}

func (admission *Admission) matchingTicketsLocked(
	target *admissionTicket,
	task TaskKind,
	at time.Time,
) ([]admissionMatchingTicket, int) {
	tickets := make([]admissionMatchingTicket, 0, len(admission.pending)+1)
	targetIndex := -1
	for _, pending := range admission.pending {
		if !admission.ticketWithinWaitLocked(pending, at) {
			continue
		}
		if pending == target {
			targetIndex = len(tickets)
		}
		tickets = append(tickets, admissionMatchingTicket{source: pending, task: pending.task})
	}
	if target != nil {
		return tickets, targetIndex
	}
	tickets = append(tickets, admissionMatchingTicket{task: task})
	return tickets, len(tickets) - 1
}

func (admission *Admission) matchingCandidatesLocked(
	ticket admissionMatchingTicket,
	slotsBySpecialist map[string][]int,
	at time.Time,
) []string {
	type rankedCandidate struct {
		id   string
		cost uint64
	}
	candidates := make([]rankedCandidate, 0, len(admission.routes[ticket.task]))
	for _, specialistID := range admission.routes[ticket.task] {
		if len(slotsBySpecialist[specialistID]) == 0 {
			continue
		}
		if ticket.source != nil &&
			(!ticket.source.candidates[specialistID] || ticket.source.exhausted[specialistID]) {
			continue
		}
		observation := admission.observations[specialistID]
		if !admissibleFit(effectiveFit(observation.fits[ticket.task], at)) ||
			effectiveReadiness(observation, at) != ReadinessReady {
			continue
		}
		candidates = append(candidates, rankedCandidate{id: specialistID, cost: observation.declaredCost})
	}
	sort.Slice(candidates, func(left, right int) bool {
		if candidates[left].cost != candidates[right].cost {
			return candidates[left].cost < candidates[right].cost
		}
		return candidates[left].id < candidates[right].id
	})
	identities := make([]string, len(candidates))
	for index := range candidates {
		identities[index] = candidates[index].id
	}
	return identities
}

func augmentAdmissionMatching(root int, choices [][]int, owners, assignments []int) bool {
	seenTickets := make([]bool, len(choices))
	seenSlots := make([]bool, len(owners))
	parentTicket := make([]int, len(owners))
	queue := make([]int, 1, len(choices))
	queue[0] = root
	seenTickets[root] = true
	for next := 0; next < len(queue); next++ {
		ticket := queue[next]
		for _, slot := range choices[ticket] {
			if seenSlots[slot] {
				continue
			}
			seenSlots[slot] = true
			parentTicket[slot] = ticket
			if owners[slot] < 0 {
				for slot >= 0 {
					owner := parentTicket[slot]
					previous := assignments[owner]
					owners[slot] = owner
					assignments[owner] = slot
					slot = previous
				}
				return true
			}
			owner := owners[slot]
			if !seenTickets[owner] {
				seenTickets[owner] = true
				queue = append(queue, owner)
			}
		}
	}
	return false
}

func (admission *Admission) refreshTicketStateLocked(ticket *admissionTicket, at time.Time) (bool, []string) {
	changed := false
	var hitLimits []string
	plannedSpecialist := admission.plannedSpecialistLocked(ticket, ticket.task, at)
	for specialistID := range ticket.candidates {
		previous := ticket.candidateStates[specialistID]
		current := admission.ticketCandidateStateLocked(ticket, specialistID, plannedSpecialist, at)
		ticket.candidateStates[specialistID] = current
		if ticket.exhausted[specialistID] {
			continue
		}
		versionChanged := current.observationVersion != previous.observationVersion
		meaningful := current.fit != previous.fit || current.readiness != previous.readiness ||
			current.declaredCost != previous.declaredCost || current.capacityBlocked != previous.capacityBlocked
		if !meaningful && !(versionChanged && retryableReadiness(current)) {
			continue
		}
		changed = true
		if versionChanged && retryableReadiness(current) {
			ticket.candidateRetries[specialistID]++
			if ticket.candidateRetries[specialistID] >= admission.limits.MaxRetries {
				hitLimits = append(hitLimits, specialistID)
			}
		}
	}
	return changed, hitLimits
}

func (admission *Admission) ticketCandidateStateLocked(
	ticket *admissionTicket,
	specialistID string,
	plannedSpecialist string,
	at time.Time,
) ticketCandidateState {
	observation := admission.observations[specialistID]
	readiness := effectiveReadiness(observation, at)
	return ticketCandidateState{
		observationVersion: admission.observationVersions[specialistID],
		fit:                effectiveFit(observation.fits[ticket.task], at),
		readiness:          readiness,
		declaredCost:       observation.declaredCost,
		capacityBlocked:    readiness == ReadinessReady && plannedSpecialist != specialistID,
	}
}

func retryableReadiness(state ticketCandidateState) bool {
	return admissibleFit(state.fit) &&
		(state.readiness == ReadinessLoading || state.readiness == ReadinessSaturated)
}

func (admission *Admission) retireCandidatesLocked(ticket *admissionTicket, specialistIDs []string) bool {
	retired := false
	for _, specialistID := range specialistIDs {
		if ticket.exhausted[specialistID] {
			continue
		}
		ticket.exhausted[specialistID] = true
		retired = true
	}
	return retired
}

func (admission *Admission) ticketWaitableLocked(ticket *admissionTicket, at time.Time) bool {
	for specialistID := range ticket.candidates {
		if ticket.exhausted[specialistID] {
			continue
		}
		observation := admission.observations[specialistID]
		if !admissibleFit(effectiveFit(observation.fits[ticket.task], at)) {
			continue
		}
		state := effectiveReadiness(observation, at)
		if state == ReadinessLoading || state == ReadinessSaturated || state == ReadinessReady {
			return true
		}
	}
	return false
}

func (admission *Admission) queueCandidatesLocked(task TaskKind, at time.Time) []string {
	var candidates []string
	for _, specialistID := range admission.routes[task] {
		if admissibleFit(effectiveFit(admission.observations[specialistID].fits[task], at)) {
			candidates = append(candidates, specialistID)
		}
	}
	return candidates
}

func (admission *Admission) enqueueLocked(
	request Request,
	candidateIDs []string,
	at time.Time,
	last AdmissionDecision,
) *admissionTicket {
	ticket := &admissionTicket{
		task: request.Task, queuedAt: at, deadline: request.Deadline,
		candidates:       make(map[string]bool, len(candidateIDs)),
		candidateStates:  make(map[string]ticketCandidateState, len(candidateIDs)),
		candidateRetries: make(map[string]int, len(candidateIDs)),
		exhausted:        make(map[string]bool, len(candidateIDs)), last: last,
	}
	admission.pending = append(admission.pending, ticket)
	for _, specialistID := range candidateIDs {
		ticket.candidates[specialistID] = true
	}
	plannedSpecialist := admission.plannedSpecialistLocked(ticket, ticket.task, at)
	for _, specialistID := range candidateIDs {
		ticket.candidateStates[specialistID] = admission.ticketCandidateStateLocked(
			ticket, specialistID, plannedSpecialist, at,
		)
	}
	return ticket
}

func (admission *Admission) queueHasCapacityLocked(candidateIDs []string) bool {
	if len(candidateIDs) == 0 || len(admission.pending) >= admission.limits.MaxTotalPending {
		return false
	}
	for _, specialistID := range candidateIDs {
		contenders := 0
		for _, pending := range admission.pending {
			if pending.candidates[specialistID] && !pending.exhausted[specialistID] {
				contenders++
			}
		}
		if contenders >= admission.limits.MaxQueueDepth {
			return false
		}
	}
	return true
}

func (admission *Admission) removeTicketLocked(target *admissionTicket) {
	for index, ticket := range admission.pending {
		if ticket != target {
			continue
		}
		admission.pending = append(admission.pending[:index], admission.pending[index+1:]...)
		admission.signalLocked()
		return
	}
}

func (admission *Admission) signalLocked() {
	close(admission.changed)
	admission.changed = make(chan struct{})
}

func (admission *Admission) contextBoundary(
	ctx context.Context,
	request Request,
	at time.Time,
	attempts int,
) (AdmissionDecision, bool) {
	if at.IsZero() || request.Deadline.IsZero() {
		return admissionTerminal(AdmissionRejected, AdmissionReasonMalformed, at, attempts), true
	}
	if err := ctx.Err(); err != nil {
		return admissionTerminal(AdmissionRejected, contextAdmissionReason(err), at, attempts), true
	}
	if !at.Before(request.Deadline) {
		return admissionTerminal(AdmissionRejected, AdmissionReasonDeadlineElapsed, at, attempts), true
	}
	return AdmissionDecision{}, false
}

func (admission *Admission) waitingBoundary(
	ctx context.Context,
	request Request,
	ticket *admissionTicket,
	at time.Time,
) (AdmissionDecision, bool) {
	attempts := ticket.retries + 1
	if at.IsZero() || request.Deadline.IsZero() || at.Before(ticket.queuedAt) {
		return admissionTerminal(AdmissionRejected, AdmissionReasonMalformed, at, attempts), true
	}
	if err := ctx.Err(); err != nil {
		return admissionTerminal(AdmissionRejected, contextAdmissionReason(err), at, attempts), true
	}
	waitUntil, reason := admission.waitDeadline(request, ticket.queuedAt)
	if at.Before(waitUntil) {
		return AdmissionDecision{}, false
	}
	decision := ticket.last
	decision.State = AdmissionFallback
	if reason == AdmissionReasonDeadlineElapsed {
		decision.State = AdmissionRejected
	}
	decision.Reason = reason
	decision.DecidedAt = at
	decision.Attempts = attempts
	return decision, true
}

func (admission *Admission) waitBound(request Request, queuedAt, at time.Time) (time.Duration, AdmissionReason) {
	waitUntil, reason := admission.waitDeadline(request, queuedAt)
	return durationUntil(waitUntil, at), reason
}

func (admission *Admission) nextWakeLocked(request Request, ticket *admissionTicket, at time.Time) time.Time {
	wakeAt, _ := admission.waitDeadline(request, ticket.queuedAt)
	for specialistID := range ticket.candidates {
		if ticket.exhausted[specialistID] {
			continue
		}
		observation := admission.observations[specialistID]
		fit := observation.fits[ticket.task]
		if !admissibleFit(effectiveFit(fit, at)) {
			continue
		}
		readiness := effectiveReadiness(observation, at)
		if readiness != ReadinessLoading && readiness != ReadinessSaturated && readiness != ReadinessReady {
			continue
		}
		if observation.validUntil.After(at) && observation.validUntil.Before(wakeAt) {
			wakeAt = observation.validUntil
		}
		if fit.state == FitMeasured && fit.validUntil.After(at) && fit.validUntil.Before(wakeAt) {
			wakeAt = fit.validUntil
		}
	}
	return wakeAt
}

func (admission *Admission) waitDeadline(request Request, queuedAt time.Time) (time.Time, AdmissionReason) {
	waitUntil := queuedAt.Add(admission.limits.MaxWait)
	reason := AdmissionReasonWaitExpired
	if !request.Deadline.After(waitUntil) {
		waitUntil = request.Deadline
		reason = AdmissionReasonDeadlineElapsed
	}
	return waitUntil, reason
}

func durationUntil(until, at time.Time) time.Duration {
	duration := until.Sub(at)
	if duration <= 0 {
		return time.Nanosecond
	}
	return duration
}

func stopTimer(timer *time.Timer) {
	if timer.Stop() {
		return
	}
	select {
	case <-timer.C:
	default:
	}
}

func decisionFromObservation(
	specialistID string,
	observation observedSpecialist,
	task TaskKind,
	queuedAt, at time.Time,
	attempts int,
) AdmissionDecision {
	decision := AdmissionDecision{
		State: AdmissionAdmitted, Reason: AdmissionReasonReady, Authority: ResultAuthority,
		SpecialistID: specialistID, Readiness: ReadinessReady,
		ObservedAt: observation.observedAt, ValidUntil: observation.validUntil,
		QueuedAt: queuedAt, DecidedAt: at, DeclaredCost: observation.declaredCost, Attempts: attempts,
	}
	return decision.withFit(observation.fits[task], at)
}

func decisionFromUnavailable(
	specialistID string,
	observation observedSpecialist,
	fit observedFit,
	at time.Time,
	reason AdmissionReason,
) AdmissionDecision {
	decision := AdmissionDecision{
		State: AdmissionFallback, Reason: reason, Authority: ResultAuthority,
		SpecialistID: specialistID, Readiness: observation.state,
		ObservedAt: observation.observedAt, ValidUntil: observation.validUntil,
		DeclaredCost: observation.declaredCost, Attempts: 1,
	}
	return decision.withFit(fit, at)
}

func (decision AdmissionDecision) withFit(fit observedFit, at time.Time) AdmissionDecision {
	decision.Fit = effectiveFit(fit, at)
	if decision.Fit == FitMeasured {
		decision.FitMeasurementBasis = fit.measurementBasis
		decision.FitMeasuredAt = fit.measuredAt
		decision.FitValidUntil = fit.validUntil
	}
	return decision
}

func (decision AdmissionDecision) at(at time.Time) AdmissionDecision {
	decision.DecidedAt = at
	return decision
}

func admissionTerminal(state AdmissionState, reason AdmissionReason, at time.Time, attempts int) AdmissionDecision {
	return AdmissionDecision{State: state, Reason: reason, Authority: ResultAuthority, DecidedAt: at, Attempts: attempts}
}

func effectiveReadiness(observation observedSpecialist, at time.Time) ReadinessState {
	if at.Before(observation.observedAt) || !at.Before(observation.validUntil) {
		return ReadinessStale
	}
	return observation.state
}

func effectiveFit(fit observedFit, at time.Time) FitState {
	if fit.state == FitMeasured && (at.Before(fit.measuredAt) || !at.Before(fit.validUntil)) {
		return FitUnknown
	}
	return fit.state
}

func fitReason(state FitState) AdmissionReason {
	if state == FitKnownNoFit {
		return AdmissionReasonKnownNoFit
	}
	return AdmissionReasonFitUnknown
}

func readinessReason(state ReadinessState) AdmissionReason {
	return map[ReadinessState]AdmissionReason{
		ReadinessAbsent: AdmissionReasonAbsent, ReadinessLoading: AdmissionReasonLoading,
		ReadinessReady: AdmissionReasonReady, ReadinessSaturated: AdmissionReasonSaturated,
		ReadinessStale: AdmissionReasonStale, ReadinessFailed: AdmissionReasonFailed,
	}[state]
}

func readinessPriority(reason AdmissionReason) int {
	return map[AdmissionReason]int{
		AdmissionReasonSaturated: 0, AdmissionReasonLoading: 1, AdmissionReasonStale: 2,
		AdmissionReasonFailed: 3, AdmissionReasonAbsent: 4, AdmissionReasonFitUnknown: 5,
		AdmissionReasonKnownNoFit: 6,
	}[reason]
}

func contextAdmissionReason(err error) AdmissionReason {
	if errors.Is(err, context.DeadlineExceeded) {
		return AdmissionReasonDeadlineElapsed
	}
	return AdmissionReasonCancelled
}

func validateAdmissionLimits(limits AdmissionLimits) error {
	if limits.MaxObservationValidity <= 0 || limits.MaxQueueDepth <= 0 || limits.MaxWait <= 0 ||
		limits.MaxRetries < 0 || limits.MaxConcurrencyPerSpecialist <= 0 ||
		limits.MaxTotalPending <= 0 || limits.MaxTotalActive <= 0 {
		return errors.New("specialist admission limits are invalid")
	}
	return nil
}

func closeAggregateLimits(limits AdmissionLimits, specialists int) (AdmissionLimits, error) {
	maximumPending, ok := boundedProduct(limits.MaxQueueDepth, specialists)
	if !ok {
		return AdmissionLimits{}, errors.New("specialist aggregate pending limit overflows")
	}
	if limits.MaxTotalPending > maximumPending {
		limits.MaxTotalPending = maximumPending
	}
	maximumActive, ok := boundedProduct(limits.MaxConcurrencyPerSpecialist, specialists)
	if !ok {
		return AdmissionLimits{}, errors.New("specialist aggregate active limit overflows")
	}
	if limits.MaxTotalActive > maximumActive {
		limits.MaxTotalActive = maximumActive
	}
	return limits, nil
}

func boundedProduct(perSpecialist, specialists int) (int, bool) {
	if perSpecialist <= 0 || specialists <= 0 || perSpecialist > int(^uint(0)>>1)/specialists {
		return 0, false
	}
	return perSpecialist * specialists, true
}

func validFit(state FitState) bool {
	return admissibleFit(state) || state == FitKnownNoFit || state == FitUnknown
}

func admissibleFit(state FitState) bool {
	return state == FitMeasured || state == FitTaskCompatible
}

func validReadiness(state ReadinessState) bool {
	switch state {
	case ReadinessAbsent, ReadinessLoading, ReadinessReady, ReadinessSaturated, ReadinessStale, ReadinessFailed:
		return true
	default:
		return false
	}
}
