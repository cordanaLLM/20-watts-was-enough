package clrsshakedown

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"reflect"
	"time"

	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/clrsfixture"
	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/specialistcontrol"
)

func checkEvents(ctx context.Context, root *os.Root, bound boundInputs, report Report) error {
	expected := make(map[string]bool, len(report.Events))
	for index, artifact := range report.Events {
		kind := []string{"decision", "invocation", "verification", "terminal"}[index%4]
		name := fmt.Sprintf("events/%03d-%s.json", index+1, kind)
		if artifact.Path != name || artifact.Identity.SizeBytes <= 0 || artifact.Identity.SizeBytes > maximumEventBytes {
			return errors.New("shakedown event order, path or byte bound differs")
		}
		expected[filepath.Base(name)] = false
	}
	if err := checkInventory(root, "events", expected); err != nil {
		return err
	}
	caseIndex := 0
	var total int64
	previous := report.Started
	for _, task := range bound.tasks {
		requests, err := task.requests.Requests(report.Started, report.Started.Add(requestTimeout))
		if err != nil {
			return err
		}
		for _, request := range requests {
			var records [4]event
			for offset := range records {
				index := caseIndex*4 + offset
				artifact := report.Events[index]
				body, err := readFile(ctx, root, artifact.Path, maximumEventBytes)
				if err != nil || identify(body) != artifact.Identity {
					return errors.New("shakedown event bytes differ from receipt")
				}
				total += int64(len(body))
				if total > maximumJournalBytes {
					return errors.New("shakedown journal exceeds its byte limit")
				}
				if err := decode(body, &records[offset]); err != nil {
					return err
				}
				r := records[offset]
				if r.Sequence != index+1 || r.Authority != clrsfixture.ResultAuthority || r.ObservedAt.Before(previous) || r.ObservedAt.After(report.Finished) {
					return errors.New("shakedown event sequence, authority or time differs")
				}
				previous = r.ObservedAt
			}
			if err := checkCase(ctx, bound, task, request, report.Cases[caseIndex], records); err != nil {
				return fmt.Errorf("check case %s: %w", request.RequestID, err)
			}
			caseIndex++
		}
	}
	if caseIndex != maximumExamples || total != report.EventBytes {
		return errors.New("shakedown aggregate counts differ")
	}
	// The final pass catches changed records and inventory during semantic checks.
	for _, artifact := range report.Events {
		body, err := readFile(ctx, root, artifact.Path, maximumEventBytes)
		if err != nil || identify(body) != artifact.Identity {
			return errors.New("shakedown event changed during check")
		}
	}
	return checkInventory(root, "events", expected)
}

func checkCase(ctx context.Context, bound boundInputs, task boundTask, expected specialistcontrol.Request, summary Case, records [4]event) error {
	if !onlyEvent(records[0], "decision") || !onlyEvent(records[1], "invocation") || !onlyEvent(records[2], "verification") || !onlyEvent(records[3], "terminal") {
		return errors.New("shakedown record kinds or typed payloads differ")
	}
	d, in, verification, terminal := *records[0].Decision, records[1].Invocation, records[2].Verification, records[3].Terminal
	policy := bound.policy
	expected.IssuedAt, expected.Deadline = terminal.Request.IssuedAt, terminal.Request.Deadline
	if !reflect.DeepEqual(expected, terminal.Request) || expected.IssuedAt.IsZero() || expected.Deadline.Sub(expected.IssuedAt) != requestTimeout ||
		!reflect.DeepEqual(summary, terminal.Case) || summary.RequestID != expected.RequestID || summary.Task != task.task || !summary.Exact ||
		summary.ElapsedNanoseconds < 0 || summary.ElapsedNanoseconds > int64(requestTimeout) || terminal.Error != "" || in.Error != "" || verification.Error != "" {
		return errors.New("shakedown terminal request, summary or completed state differs")
	}
	wantDecision := policy.Decide(d.DecidedAt, expected, d.Admission)
	if d.State != specialistcontrol.DecisionInvoke || !reflect.DeepEqual(d, wantDecision) || !reflect.DeepEqual(d, terminal.Result.Decision) || d.SpecialistID != task.id ||
		in.RequestID != expected.RequestID || verification.RequestID != expected.RequestID {
		return errors.New("shakedown pre-effect decision or request binding differs")
	}
	if !orderedTimes(expected.IssuedAt, d.DecidedAt, records[0].ObservedAt, in.Started, in.Finished, records[1].ObservedAt,
		verification.Started, verification.Finished, records[2].ObservedAt, terminal.Finished, records[3].ObservedAt) || !terminal.Finished.Before(expected.Deadline) {
		return errors.New("shakedown decision/effect/verification time order differs")
	}
	if err := checkAdmission(ctx, bound, terminal.Request, d.Admission, terminal.Result.Admission, records[0].ObservedAt, in.Started); err != nil {
		return err
	}
	resultDecision := policy.InspectResult(in.Finished, expected, d, in.Result)
	wantCandidate := specialistcontrol.Candidate{Binding: resultDecision.Binding, CandidateBinding: resultDecision.CandidateBinding,
		SpecialistID: task.id, State: specialistcontrol.ResultCompleted, Payload: resultDecision.Payload}
	if resultDecision.State != specialistcontrol.ResultVerify || !reflect.DeepEqual(verification.Candidate, wantCandidate) {
		return errors.New("shakedown candidate differs from the recorded effect")
	}
	invocation := specialistcontrol.Invocation{RunID: expected.RunID, RequestID: expected.RequestID, Task: expected.Task, Payload: expected.Payload,
		Binding: d.Binding, Deadline: d.Deadline, MaxResultBytes: d.MaxResultBytes}
	wantVerification, err := task.verifier.Verify(ctx, invocation, wantCandidate)
	if err != nil || wantVerification.Verdict != specialistcontrol.VerificationExact || !reflect.DeepEqual(verification.Verification, wantVerification) {
		return errors.New("shakedown held-reference verification differs")
	}
	wantOutcome := policy.Finalise(terminal.Finished, expected, d, resultDecision, wantVerification)
	if wantOutcome.State != specialistcontrol.OutcomeVerified || !reflect.DeepEqual(terminal.Result.Outcome, wantOutcome) ||
		!bytes.Equal(in.Result.Payload, wantOutcome.Payload) || summary.Answer != identify(wantOutcome.Payload) {
		return errors.New("shakedown terminal payload or answer identity differs")
	}
	return ctx.Err()
}

func onlyEvent(record event, kind string) bool {
	count := 0
	if record.Decision != nil {
		count++
	}
	if record.Invocation != nil {
		count++
	}
	if record.Verification != nil {
		count++
	}
	if record.Terminal != nil {
		count++
	}
	if record.Kind != kind || count != 1 {
		return false
	}
	switch kind {
	case "decision":
		return record.Decision != nil
	case "invocation":
		return record.Invocation != nil
	case "verification":
		return record.Verification != nil
	case "terminal":
		return record.Terminal != nil
	}
	return false
}

func orderedTimes(values ...time.Time) bool {
	for index, value := range values {
		if value.IsZero() || index > 0 && value.Before(values[index-1]) {
			return false
		}
	}
	return true
}
