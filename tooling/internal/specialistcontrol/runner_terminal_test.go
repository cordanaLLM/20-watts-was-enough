package specialistcontrol

import (
	"context"
	"errors"
	"reflect"
	"strings"
	"testing"
)

func TestRecordTerminalDecisionRecordsBeforeReportingAnEndedContext(t *testing.T) {
	t.Parallel()
	recorded := 0
	runner := Runner{
		policy: testPolicy(t),
		recorder: recorderFunc(func(ctx context.Context, _ Decision) error {
			recorded++
			return ctx.Err()
		}),
	}
	decision := Decision{State: DecisionRefuse, Reason: ReasonMalformedRequest}

	cancelled, cancel := context.WithCancel(context.Background())
	cancel()
	var run RunResult
	err := runner.recordTerminalDecision(cancelled, decision, &run)
	if !errors.Is(err, context.Canceled) || !strings.Contains(err.Error(), "context ended before invocation") {
		t.Fatalf("ended context error = %v, want context.Canceled before invocation", err)
	}
	if recorded != 1 || run.Decision != decision || !reflect.DeepEqual(run.Outcome, outcomeFromDecision(decision)) {
		t.Fatalf("ended context recorded=%d decision=%#v outcome=%#v", recorded, run.Decision, run.Outcome)
	}

	if err := runner.recordTerminalDecision(context.Background(), decision, &run); err != nil || recorded != 2 {
		t.Fatalf("live context error = %v recorded=%d, want nil and a second record", err, recorded)
	}
}

func TestRecordTerminalDecisionWrapsARecorderFailure(t *testing.T) {
	t.Parallel()
	cause := errors.New("ledger unavailable")
	runner := Runner{
		policy:   testPolicy(t),
		recorder: recorderFunc(func(context.Context, Decision) error { return cause }),
	}
	var run RunResult
	err := runner.recordTerminalDecision(context.Background(), Decision{State: DecisionRefuse}, &run)
	if !errors.Is(err, cause) || !strings.Contains(err.Error(), "record terminal specialist-control decision") {
		t.Fatalf("recorder failure = %v, want the wrapped cause", err)
	}
}
