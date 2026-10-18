package specialistcontrol

import (
	"context"
	"errors"
	"fmt"
	"time"
)

// Invocation carries the recorded decision's exact bounds across the effect seam.
type Invocation struct {
	RunID          string
	RequestID      string
	Task           TaskKind
	Payload        []byte
	Binding        Binding
	Deadline       time.Time
	MaxResultBytes int
}

// DecisionRecorder durably records a decision before any specialist runs.
type DecisionRecorder interface {
	RecordDecision(context.Context, Decision) error
}

// Specialist performs one bounded development invocation.
type Specialist interface {
	Invoke(context.Context, Invocation) (SpecialistResult, error)
}

// ExactVerifier scores a candidate independently of the originating specialist.
type ExactVerifier interface {
	Verify(context.Context, Invocation, Candidate) (Verification, error)
}

// RunResult retains the latest durably recorded pre-effect decision and terminal
// construction state.
type RunResult struct {
	Decision  Decision
	Admission AdmissionDecision
	Outcome   Outcome
}

// Runner owns the deliberately thin decision-record-effect-verification seam.
type Runner struct {
	policy      Policy
	admission   *Admission
	recorder    DecisionRecorder
	specialists map[string]Specialist
	verifier    ExactVerifier
	now         func() time.Time
}

// NewRunner closes the configured route/executor set before any request runs.
func NewRunner(
	policy Policy,
	admission *Admission,
	recorder DecisionRecorder,
	specialists map[string]Specialist,
	verifier ExactVerifier,
	now func() time.Time,
) (Runner, error) {
	if admission == nil || recorder == nil || verifier == nil || now == nil {
		return Runner{}, errors.New("specialist-control runner dependencies must be present")
	}
	if !admission.matchesPolicy(policy) {
		return Runner{}, errors.New("specialist-control admission does not match policy routes")
	}
	identities := policy.specialistIDs()
	if len(specialists) != len(identities) {
		return Runner{}, errors.New("specialist-control executor set does not match policy routes")
	}
	validated := make(map[string]Specialist, len(specialists))
	for _, specialistID := range identities {
		specialist, present := specialists[specialistID]
		if !present || specialist == nil {
			return Runner{}, fmt.Errorf("specialist-control executor missing for %s", specialistID)
		}
		validated[specialistID] = specialist
	}
	return Runner{
		policy: policy, admission: admission, recorder: recorder,
		specialists: validated, verifier: verifier, now: now,
	}, nil
}

// Run records the pure policy decision before invoking any specialist effect.
func (runner Runner) Run(ctx context.Context, request Request) (RunResult, error) {
	request.Payload = append([]byte(nil), request.Payload...)
	preflight, terminal := runner.policy.preflight(runner.now(), request)
	if terminal {
		run := RunResult{Decision: preflight, Outcome: outcomeFromDecision(preflight)}
		if err := runner.recordDecision(ctx, preflight, true); err != nil {
			return run, fmt.Errorf("record specialist-control decision: %w", err)
		}
		return run, nil
	}
	admission, lease := runner.admission.Acquire(ctx, request, runner.now)
	if lease != nil {
		defer lease.Release()
	}
	decision := runner.policy.Decide(admission.DecidedAt, request, admission)
	run := RunResult{Decision: decision, Admission: admission, Outcome: outcomeFromDecision(decision)}
	if err := runner.recordDecision(ctx, decision, decision.State != DecisionInvoke); err != nil {
		return run, fmt.Errorf("record specialist-control decision: %w", err)
	}
	if decision.State != DecisionInvoke {
		if ctx != nil {
			if err := ctx.Err(); err != nil {
				return run, fmt.Errorf("specialist-control context ended before invocation: %w", err)
			}
		}
		return run, nil
	}
	invocationAt, admitted, err := runner.revalidate(ctx, request, lease, &run)
	if !admitted {
		return run, err
	}
	return runner.invoke(ctx, request, decision, invocationAt, run)
}

// revalidate re-reads admission at the invocation instant. When the request may no
// longer run it records the terminal decision and reports the request as not admitted.
func (runner Runner) revalidate(
	ctx context.Context,
	request Request,
	lease *AdmissionLease,
	run *RunResult,
) (time.Time, bool, error) {
	decision, admission := run.Decision, run.Admission
	revalidated := lease.Revalidate(ctx, request, runner.now)
	invocationAt := revalidated.DecidedAt
	invalidClock := invocationAt.IsZero() || invocationAt.Before(decision.DecidedAt)
	if invalidClock {
		revalidated = admissionTerminal(AdmissionRejected, AdmissionReasonMalformed, invocationAt, admission.Attempts)
	}
	if revalidated.State == AdmissionAdmitted && !sameAdmissionEvidence(admission, revalidated) {
		revalidated.State = AdmissionFallback
		revalidated.Reason = AdmissionReasonObservationChanged
	}
	invocationPreflight, requestTerminal := runner.policy.preflight(invocationAt, request)
	run.Admission = revalidated
	if revalidated.State == AdmissionAdmitted && !requestTerminal {
		return invocationAt, true, nil
	}
	terminalDecision := runner.policy.Decide(invocationAt, request, revalidated)
	if requestTerminal {
		terminalDecision = invocationPreflight
		terminalDecision.Admission = revalidated
	}
	if invalidClock {
		terminalDecision = decision
		terminalDecision.State = DecisionRefuse
		terminalDecision.Reason = ReasonMalformedRequest
		terminalDecision.Admission = revalidated
		terminalDecision.SpecialistID = ""
		terminalDecision.Binding = Binding{}
		terminalDecision.DecidedAt = invocationAt
	}
	return invocationAt, false, runner.recordTerminalDecision(ctx, terminalDecision, run)
}

// recordTerminalDecision records a decision that ends the run before invocation.
func (runner Runner) recordTerminalDecision(ctx context.Context, decision Decision, run *RunResult) error {
	run.Decision = decision
	run.Outcome = outcomeFromDecision(decision)
	contextEnded := ctx != nil && ctx.Err() != nil
	if err := runner.recordDecision(ctx, decision, true); err != nil {
		return fmt.Errorf("record terminal specialist-control decision: %w", err)
	}
	if contextEnded {
		err := ctx.Err()
		return fmt.Errorf("specialist-control context ended before invocation: %w", err)
	}
	return nil
}

// invoke runs the admitted specialist inside the recorded deadline.
func (runner Runner) invoke(
	ctx context.Context,
	request Request,
	decision Decision,
	invocationAt time.Time,
	run RunResult,
) (RunResult, error) {
	remaining := decision.Deadline.Sub(invocationAt)
	if remaining <= 0 {
		run.Outcome = terminalOutcome(OutcomeAbstained, ReasonDeadlineElapsed, decision.Binding, nil)
		return run, nil
	}
	if remaining > runner.policy.limits.MaxExecution {
		run.Outcome = terminalOutcome(OutcomeRefused, ReasonDeadlineOutOfRange, decision.Binding, nil)
		return run, nil
	}

	invocation := invocationFor(request, decision)
	invokeContext, cancel := context.WithDeadline(ctx, decision.Deadline)
	defer cancel()
	if err := invokeContext.Err(); err != nil {
		run.Outcome = terminalOutcome(OutcomeAbstained, specialistFailureReason(err), decision.Binding, nil)
		return run, fmt.Errorf("specialist-control context ended before invocation: %w", err)
	}
	result, err := runner.specialists[decision.SpecialistID].Invoke(invokeContext, invocation)
	if err != nil {
		run.Outcome = terminalOutcome(OutcomeAbstained, specialistFailureReason(err), decision.Binding, nil)
		return run, fmt.Errorf("invoke specialist %s: %w", decision.SpecialistID, err)
	}
	result = snapshotResult(result, decision.MaxResultBytes)
	if err := invokeContext.Err(); err != nil {
		run.Outcome = terminalOutcome(OutcomeAbstained, specialistFailureReason(err), decision.Binding, nil)
		return run, fmt.Errorf("specialist %s exceeded its execution context: %w", decision.SpecialistID, err)
	}
	return runner.verify(invokeContext, request, decision, result, run)
}

// verify scores the specialist's result independently and finalises the outcome.
func (runner Runner) verify(
	invokeContext context.Context,
	request Request,
	decision Decision,
	result SpecialistResult,
	run RunResult,
) (RunResult, error) {
	observedAt := runner.now()
	resultDecision := runner.policy.InspectResult(observedAt, request, decision, result)
	if resultDecision.State != ResultVerify {
		run.Outcome = runner.policy.Finalise(observedAt, request, decision, resultDecision, Verification{})
		return run, nil
	}
	if err := invokeContext.Err(); err != nil {
		run.Outcome = terminalOutcome(OutcomeAbstained, verificationFailureReason(err), decision.Binding, nil)
		return run, fmt.Errorf("specialist-control context ended before verification: %w", err)
	}
	normalizedCandidate := Candidate{
		Binding:          resultDecision.Binding,
		CandidateBinding: resultDecision.CandidateBinding,
		SpecialistID:     decision.SpecialistID,
		State:            ResultCompleted,
		Payload:          append([]byte(nil), resultDecision.Payload...),
	}
	verification, err := runner.verifier.Verify(invokeContext, invocationFor(request, decision), normalizedCandidate)
	if err != nil {
		run.Outcome = terminalOutcome(OutcomeAbstained, verificationFailureReason(err), decision.Binding, nil)
		return run, fmt.Errorf("verify specialist %s output: %w", decision.SpecialistID, err)
	}
	if err := invokeContext.Err(); err != nil {
		run.Outcome = terminalOutcome(OutcomeAbstained, verificationFailureReason(err), decision.Binding, nil)
		return run, fmt.Errorf("verification for specialist %s exceeded its execution context: %w", decision.SpecialistID, err)
	}
	finalisedAt := runner.now()
	if err := invokeContext.Err(); err != nil {
		run.Outcome = terminalOutcome(OutcomeAbstained, verificationFailureReason(err), decision.Binding, nil)
		return run, fmt.Errorf("specialist-control context ended before finalisation: %w", err)
	}
	run.Outcome = runner.policy.Finalise(finalisedAt, request, decision, resultDecision, verification)
	return run, nil
}

func sameAdmissionEvidence(recorded, current AdmissionDecision) bool {
	return recorded.State == current.State && recorded.Reason == current.Reason &&
		recorded.Authority == current.Authority && recorded.SpecialistID == current.SpecialistID &&
		recorded.Fit == current.Fit && recorded.FitMeasurementBasis == current.FitMeasurementBasis &&
		recorded.FitMeasuredAt.Equal(current.FitMeasuredAt) && recorded.FitValidUntil.Equal(current.FitValidUntil) &&
		recorded.Readiness == current.Readiness && recorded.ObservedAt.Equal(current.ObservedAt) &&
		recorded.ValidUntil.Equal(current.ValidUntil) && recorded.DeclaredCost == current.DeclaredCost
}

func (runner Runner) recordDecision(ctx context.Context, decision Decision, detached bool) error {
	parent := ctx
	budget := runner.decisionRecordBudget(decision)
	if parent == nil {
		parent = context.Background()
	}
	if detached {
		parent = context.WithoutCancel(parent)
		budget = runner.policy.limits.MaxDecisionRecord
	}
	recordContext, cancel := context.WithTimeout(parent, budget)
	defer cancel()
	return runner.recorder.RecordDecision(recordContext, decision)
}

func (runner Runner) decisionRecordBudget(decision Decision) time.Duration {
	budget := runner.policy.limits.MaxDecisionRecord
	if decision.Deadline.IsZero() || decision.DecidedAt.IsZero() {
		return budget
	}
	remaining := decision.Deadline.Sub(decision.DecidedAt)
	if remaining > 0 && remaining < budget {
		return remaining
	}
	return budget
}

func invocationFor(request Request, decision Decision) Invocation {
	return Invocation{
		RunID:          request.RunID,
		RequestID:      request.RequestID,
		Task:           request.Task,
		Payload:        append([]byte(nil), request.Payload...),
		Binding:        decision.Binding,
		Deadline:       decision.Deadline,
		MaxResultBytes: decision.MaxResultBytes,
	}
}

func snapshotResult(result SpecialistResult, maximumBytes int) SpecialistResult {
	if len(result.Payload) > maximumBytes {
		result.Payload = make([]byte, maximumBytes+1)
		return result
	}
	result.Payload = append([]byte(nil), result.Payload...)
	return result
}

func outcomeFromDecision(decision Decision) Outcome {
	switch decision.State {
	case DecisionAbstain:
		return terminalOutcome(OutcomeAbstained, decision.Reason, decision.Binding, nil)
	case DecisionInvoke:
		return terminalOutcome(OutcomeAbstained, ReasonSpecialistFailed, decision.Binding, nil)
	default:
		return terminalOutcome(OutcomeRefused, decision.Reason, decision.Binding, nil)
	}
}

func specialistFailureReason(err error) Reason {
	if errors.Is(err, context.Canceled) {
		return ReasonCancelled
	}
	if errors.Is(err, context.DeadlineExceeded) {
		return ReasonDeadlineElapsed
	}
	return ReasonSpecialistFailed
}

func verificationFailureReason(err error) Reason {
	if errors.Is(err, context.Canceled) {
		return ReasonCancelled
	}
	if errors.Is(err, context.DeadlineExceeded) {
		return ReasonDeadlineElapsed
	}
	return ReasonVerificationFailed
}
