package clrsshakedown

import (
	"context"
	"errors"
	"reflect"
	"time"

	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/specialistcontrol"
)

// Replay only the canonical admission state machine, never specialist effects.
// The registry supplies construction-only readiness; a receipt cannot substitute
// measured fit or alter revalidation evidence while retaining the same answer.
func checkAdmission(ctx context.Context, bound boundInputs, request specialistcontrol.Request,
	recorded, revalidated specialistcontrol.AdmissionDecision, recordedAt, invokedAt time.Time,
) error {
	if !orderedTimes(recorded.ObservedAt, recorded.DecidedAt, recordedAt, revalidated.DecidedAt, invokedAt) {
		return errors.New("shakedown admission observation or revalidation time differs")
	}
	_, observations, err := bound.registry.AdmissionSnapshot(recorded.ObservedAt, runTimeout)
	if err != nil {
		return err
	}
	admission, err := specialistcontrol.NewAdmission(bound.policy, admissionLimits(), observations, recorded.ObservedAt)
	if err != nil {
		return err
	}
	want, lease := admission.Acquire(ctx, request, func() time.Time { return recorded.DecidedAt })
	if lease != nil {
		defer lease.Release()
	}
	if lease == nil || !reflect.DeepEqual(recorded, want) {
		return errors.New("shakedown admission differs from canonical construction readiness")
	}
	wantCurrent := lease.Revalidate(ctx, request, func() time.Time { return revalidated.DecidedAt })
	if !reflect.DeepEqual(revalidated, wantCurrent) || wantCurrent.State != specialistcontrol.AdmissionAdmitted {
		return errors.New("shakedown pre-effect admission revalidation differs")
	}
	return ctx.Err()
}
