package clrsshakedown

import (
	"context"
	"errors"
	"fmt"
	"os"
	"time"

	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/clrsfixture"
	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/specialistcontrol"
)

type journal struct {
	root      *os.Root
	files     []Artifact
	bytes     int64
	decisions map[string]specialistcontrol.Decision
}

func (j *journal) append(ctx context.Context, record event, maximum int) error {
	if ctx == nil {
		return errors.New("shakedown event context is required")
	}
	if _, bounded := ctx.Deadline(); !bounded {
		return errors.New("shakedown event requires a deadline")
	}
	if err := ctx.Err(); err != nil {
		return err
	}
	if len(j.files) >= maximumEvents {
		return errors.New("shakedown event count limit exceeded")
	}
	record.Sequence, record.Authority, record.ObservedAt = len(j.files)+1, clrsfixture.ResultAuthority, time.Now().UTC()
	body, err := marshal(record, maximum)
	if err != nil {
		return err
	}
	if j.bytes+int64(len(body)) > maximumJournalBytes {
		return errors.New("shakedown journal byte limit exceeded")
	}
	name := fmt.Sprintf("events/%03d-%s.json", record.Sequence, record.Kind)
	if err := writeNew(j.root, name, body); err != nil {
		return err
	}
	j.files = append(j.files, Artifact{name, identify(body)})
	j.bytes += int64(len(body))
	return ctx.Err()
}

func (j *journal) RecordDecision(ctx context.Context, decision specialistcontrol.Decision) error {
	if err := j.append(ctx, event{Kind: "decision", Decision: &decision}, 16<<10); err != nil {
		return err
	}
	j.decisions[decision.RequestID] = decision
	return nil
}

type observedSpecialist struct {
	inner   specialistcontrol.Specialist
	journal *journal
}

func (s observedSpecialist) Invoke(ctx context.Context, in specialistcontrol.Invocation) (specialistcontrol.SpecialistResult, error) {
	d, exists := s.journal.decisions[in.RequestID]
	if !exists || d.State != specialistcontrol.DecisionInvoke || d.RunID != in.RunID || d.Task != in.Task || d.Binding != in.Binding {
		return specialistcontrol.SpecialistResult{}, errors.New("specialist invocation has no matching durable decision")
	}
	started := time.Now().UTC()
	result, err := s.inner.Invoke(ctx, in)
	if len(result.Payload) > maximumExampleBytes {
		return specialistcontrol.SpecialistResult{}, errors.Join(err, errors.New("specialist output exceeds the shakedown limit"))
	}
	record := invocationEvent{in.RequestID, started, time.Now().UTC(), result, diagnostic(err)}
	recordCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), recordTimeout)
	defer cancel()
	return result, errors.Join(err, s.journal.append(recordCtx, event{Kind: "invocation", Invocation: &record}, maximumEventBytes))
}

type observedVerifier struct {
	routes  map[clrsfixture.TaskKind]specialistcontrol.ExactVerifier
	journal *journal
}

func (v observedVerifier) Verify(ctx context.Context, in specialistcontrol.Invocation, candidate specialistcontrol.Candidate) (specialistcontrol.Verification, error) {
	verifier, exists := v.routes[in.Task]
	if !exists {
		return specialistcontrol.Verification{}, errors.New("no frozen task verifier")
	}
	started := time.Now().UTC()
	verification, err := verifier.Verify(ctx, in, candidate)
	if len(candidate.Payload) > maximumExampleBytes {
		return verification, errors.Join(err, errors.New("verification output exceeds the shakedown limit"))
	}
	record := verificationEvent{in.RequestID, started, time.Now().UTC(), candidate, verification, diagnostic(err)}
	recordCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), recordTimeout)
	defer cancel()
	return verification, errors.Join(err, v.journal.append(recordCtx, event{Kind: "verification", Verification: &record}, maximumEventBytes))
}

func newRunner(bound boundInputs, j *journal) (specialistcontrol.Runner, error) {
	specialists := make(map[string]specialistcontrol.Specialist, len(bound.tasks))
	verifiers := make(map[clrsfixture.TaskKind]specialistcontrol.ExactVerifier, len(bound.tasks))
	for _, task := range bound.tasks {
		specialists[task.id] = observedSpecialist{registrySpecialist{bound.registry, task.id}, j}
		verifiers[task.task] = task.verifier
	}
	admission, err := specialistcontrol.NewAdmission(bound.policy, admissionLimits(), bound.observations, time.Now().UTC())
	if err != nil {
		return specialistcontrol.Runner{}, err
	}
	return specialistcontrol.NewRunner(bound.policy, admission, j, specialists, observedVerifier{verifiers, j}, func() time.Time { return time.Now().UTC() })
}
