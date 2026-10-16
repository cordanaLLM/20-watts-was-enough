package specialistcontrol

import (
	"slices"
	"strings"
	"testing"
	"time"
)

var testNow = time.Date(2099, time.August, 30, 18, 0, 0, 0, time.UTC)

func TestValidIdentity(t *testing.T) {
	t.Parallel()
	tests := []struct {
		name, value string
		want        bool
	}{
		{"all character classes", "aZ09._:-", true},
		{"one byte", "a", true},
		{"maximum bytes", strings.Repeat("a", 128), true},
		{"over maximum bytes", strings.Repeat("a", 129), false},
		{"empty", "", false},
		{"slash", "a/b", false},
		{"whitespace", "a b", false},
		{"non ASCII", "é", false},
		{"NUL", "a\x00b", false},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if got := ValidIdentity(test.value); got != test.want {
				t.Fatalf("ValidIdentity(%q) = %v, want %v", test.value, got, test.want)
			}
		})
	}
}

func TestPolicyRoutesTheAcceptedSixTaskSubsetDeterministically(t *testing.T) {
	t.Parallel()
	policy := testPolicy(t)
	tasks := Tasks()
	wantTasks := []TaskKind{
		TaskBellmanFord,
		TaskBinarySearch,
		TaskInsertionSort,
		TaskKMPMatcher,
		TaskMatrixChainOrder,
		TaskSegmentsIntersect,
	}
	if !slices.Equal(tasks, wantTasks) {
		t.Fatalf("Tasks() = %v, want exact upstream IDs %v", tasks, wantTasks)
	}
	for _, task := range tasks {
		request := testRequest(task)
		first := policy.Decide(testNow, request, testAdmissionDecision(policy, task, testNow))
		second := policy.Decide(testNow, request, testAdmissionDecision(policy, task, testNow))
		if first != second || first.State != DecisionInvoke || first.Reason != ReasonReady {
			t.Fatalf("Decide(%s) = %#v then %#v, want identical invoke decisions", task, first, second)
		}
		if first.Authority != ResultAuthority || first.SpecialistID != "exact-"+string(task) || first.Binding == (Binding{}) {
			t.Fatalf("Decide(%s) identity = %#v, want bound NO_RESULT route", task, first)
		}
		measuredAdmission := testAdmissionDecision(policy, task, testNow)
		measuredAdmission.Fit = FitMeasured
		measuredAdmission.FitMeasurementBasis = "fit-probe:v1"
		measuredAdmission.FitMeasuredAt = measuredAdmission.ObservedAt.Add(-time.Second)
		measuredAdmission.FitValidUntil = measuredAdmission.FitMeasuredAt.Add(time.Minute)
		measured := policy.Decide(testNow, request, measuredAdmission)
		if measured.State != DecisionInvoke || measured.Reason != ReasonReady || measured.Admission.Fit != FitMeasured {
			t.Fatalf("Decide(%s measured fit) = %#v, want invoke", task, measured)
		}
		changedBasis := measuredAdmission
		changedBasis.FitMeasurementBasis = "fit-probe:v2"
		if changed := policy.Decide(testNow, request, changedBasis); changed.State != DecisionInvoke ||
			changed.Binding == measured.Binding {
			t.Fatalf("Decide(%s changed measured basis) = %#v, want a distinct invoke binding", task, changed)
		}
		laterAt := testNow.Add(time.Nanosecond)
		later := policy.Decide(laterAt, request, testAdmissionDecision(policy, task, laterAt))
		if first.DecidedAt != testNow || later.DecidedAt == first.DecidedAt || later.Binding == first.Binding {
			t.Fatalf("Decide(%s) decision-time binding = %s/%x then %s/%x", task, first.DecidedAt, first.Binding, later.DecidedAt, later.Binding)
		}
	}
}

func TestPolicyRejectsUnboundedOrMismatchedMeasuredFitEvidence(t *testing.T) {
	t.Parallel()
	policy := testPolicy(t)
	request := testRequest(TaskInsertionSort)
	valid := testAdmissionDecision(policy, request.Task, testNow)
	valid.Fit = FitMeasured
	valid.FitMeasurementBasis = "fit-probe:v1"
	valid.FitMeasuredAt = valid.ObservedAt.Add(-time.Second)
	valid.FitValidUntil = valid.FitMeasuredAt.Add(time.Minute)
	tests := map[string]func(*AdmissionDecision){
		"missing basis": func(admission *AdmissionDecision) { admission.FitMeasurementBasis = "" },
		"measurement after view": func(admission *AdmissionDecision) {
			admission.FitMeasuredAt = admission.ObservedAt.Add(time.Nanosecond)
		},
		"expired measurement": func(admission *AdmissionDecision) { admission.FitValidUntil = testNow },
		"measurement outlives observation": func(admission *AdmissionDecision) {
			admission.FitValidUntil = admission.ValidUntil.Add(time.Nanosecond)
		},
		"stray construction metadata": func(admission *AdmissionDecision) {
			admission.Fit = FitTaskCompatible
		},
	}
	for name, mutate := range tests {
		name, mutate := name, mutate
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			admission := valid
			mutate(&admission)
			decision := policy.Decide(testNow, request, admission)
			if decision.State != DecisionRefuse || decision.Reason != ReasonAdmissionRejected ||
				decision.Binding != (Binding{}) {
				t.Fatalf("Decide(%s) = %#v, want admission rejection", name, decision)
			}
		})
	}
}

func TestNewPolicyRejectsOpenOrAmbiguousRouteSets(t *testing.T) {
	t.Parallel()
	limits := testLimits()
	for name, mutate := range map[string]func([]Route) []Route{
		"missing task": func(routes []Route) []Route { return routes[:len(routes)-1] },
		"unknown task": func(routes []Route) []Route {
			routes[0].Task = "unknown"
			return routes
		},
		"duplicate task": func(routes []Route) []Route {
			routes[1].Task = routes[0].Task
			return routes
		},
		"duplicate specialist": func(routes []Route) []Route {
			routes[1].SpecialistID = routes[0].SpecialistID
			return routes
		},
	} {
		name, mutate := name, mutate
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			if _, err := NewPolicy(limits, mutate(testRoutes())); err == nil {
				t.Fatal("NewPolicy() error = nil, want closed-route rejection")
			}
		})
	}
	invalidLimits := testLimits()
	invalidLimits.MaxExecution = 0
	if _, err := NewPolicy(invalidLimits, testRoutes()); err == nil {
		t.Fatal("NewPolicy() error = nil, want positive execution-horizon rejection")
	}
	invalidLimits = testLimits()
	invalidLimits.MaxDecisionRecord = 0
	if _, err := NewPolicy(invalidLimits, testRoutes()); err == nil {
		t.Fatal("NewPolicy() error = nil, want positive decision-record bound rejection")
	}
}

func TestNewPolicyClosesTheRouteCandidateCount(t *testing.T) {
	t.Parallel()
	routes := testRoutes()
	for _, task := range Tasks() {
		routes = append(routes, Route{Task: task, SpecialistID: "alternate-" + string(task)})
	}
	if _, err := NewPolicy(testLimits(), routes); err != nil {
		t.Fatalf("NewPolicy(maximum candidates) error = %v", err)
	}
	routes = append(routes, Route{Task: TaskInsertionSort, SpecialistID: "third-insertion-sort"})
	if _, err := NewPolicy(testLimits(), routes); err == nil {
		t.Fatal("NewPolicy(over route bound) error = nil")
	}
}

func TestPolicyTypesInvalidRequestTermination(t *testing.T) {
	t.Parallel()
	policy := testPolicy(t)
	valid := testRequest(TaskInsertionSort)
	tests := []struct {
		name   string
		at     time.Time
		mutate func(*Request)
		state  DecisionState
		reason Reason
	}{
		{name: "unknown task", mutate: func(request *Request) { request.Task = "unknown" }, state: DecisionRefuse, reason: ReasonUnknownTask},
		{name: "malformed identity", mutate: func(request *Request) { request.RequestID = "request id" }, state: DecisionRefuse, reason: ReasonMalformedRequest},
		{name: "empty payload", mutate: func(request *Request) { request.Payload = nil }, state: DecisionRefuse, reason: ReasonMalformedRequest},
		{name: "oversized", mutate: func(request *Request) { request.Payload = []byte(strings.Repeat("x", 33)) }, state: DecisionRefuse, reason: ReasonOversizedRequest},
		{name: "future issue", mutate: func(request *Request) { request.IssuedAt = testNow.Add(time.Second) }, state: DecisionRefuse, reason: ReasonMalformedRequest},
		{name: "stale", at: testNow.Add(11 * time.Second), state: DecisionAbstain, reason: ReasonStaleRequest},
		{name: "deadline", at: valid.Deadline, state: DecisionAbstain, reason: ReasonDeadlineElapsed},
		{name: "deadline out of range", mutate: func(request *Request) { request.Deadline = testNow.Add(3 * time.Minute) }, state: DecisionRefuse, reason: ReasonDeadlineOutOfRange},
	}
	for _, test := range tests {
		test := test
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()
			request := valid
			request.Payload = append([]byte(nil), valid.Payload...)
			if test.mutate != nil {
				test.mutate(&request)
			}
			at := test.at
			if at.IsZero() {
				at = testNow
			}
			decision := policy.Decide(at, request, testAdmissionDecision(policy, request.Task, at))
			if decision.State != test.state || decision.Reason != test.reason || decision.Authority != ResultAuthority {
				t.Fatalf("Decide() = %s/%s/%s, want %s/%s/%s", decision.State, decision.Reason, decision.Authority, test.state, test.reason, ResultAuthority)
			}
		})
	}
}

func TestPolicyPreservesTypedFallbackWithoutCreatingAnInvokeBinding(t *testing.T) {
	t.Parallel()
	policy := testPolicy(t)
	request := testRequest(TaskInsertionSort)
	fallback := testAdmissionDecision(policy, request.Task, testNow)
	fallback.State = AdmissionFallback
	fallback.Reason = AdmissionReasonFitUnknown
	fallback.Fit = FitUnknown
	decision := policy.Decide(testNow, request, fallback)
	if decision.State != DecisionAbstain || decision.Reason != ReasonFallback ||
		decision.Admission != fallback || decision.SpecialistID != "" || decision.Binding != (Binding{}) {
		t.Fatalf("Decide(fallback) = %#v, want explicit unbound fallback", decision)
	}
	forged := fallback
	forged.Authority = "RESULT"
	decision = policy.Decide(testNow, request, forged)
	if decision.State != DecisionRefuse || decision.Reason != ReasonAdmissionRejected || decision.Binding != (Binding{}) {
		t.Fatalf("Decide(forged fallback) = %#v, want admission rejection", decision)
	}
}

func TestPolicyRefusesUnsafeSpecialistResultsBeforeVerification(t *testing.T) {
	t.Parallel()
	policy := testPolicy(t)
	request := testRequest(TaskBinarySearch)
	decision := policy.Decide(testNow, request, testAdmissionDecision(policy, request.Task, testNow))
	valid := SpecialistResult{
		Binding:      decision.Binding,
		SpecialistID: decision.SpecialistID,
		State:        ResultCompleted,
		Payload:      []byte(`{"index":2}`),
	}
	tests := []struct {
		name   string
		at     time.Time
		mutate func(*SpecialistResult)
		state  ResultDecisionState
		reason Reason
	}{
		{name: "stale binding", mutate: func(result *SpecialistResult) { result.Binding[0]++ }, state: ResultRefuse, reason: ReasonStaleResult},
		{name: "unknown specialist", mutate: func(result *SpecialistResult) { result.SpecialistID = "other" }, state: ResultRefuse, reason: ReasonUnknownResult},
		{name: "oversized", mutate: func(result *SpecialistResult) { result.Payload = []byte(strings.Repeat("x", 17)) }, state: ResultRefuse, reason: ReasonOversizedResult},
		{name: "malformed completed", mutate: func(result *SpecialistResult) { result.Payload = nil }, state: ResultRefuse, reason: ReasonMalformedResult},
		{name: "malformed state", mutate: func(result *SpecialistResult) { result.State = "unknown" }, state: ResultRefuse, reason: ReasonMalformedResult},
		{name: "specialist refusal", mutate: func(result *SpecialistResult) { result.State, result.Payload = ResultRefused, nil }, state: ResultRefuse, reason: ReasonSpecialistRefused},
		{name: "specialist abstention", mutate: func(result *SpecialistResult) { result.State, result.Payload = ResultAbstained, nil }, state: ResultAbstain, reason: ReasonSpecialistAbstained},
		{name: "timed out", at: request.Deadline, state: ResultAbstain, reason: ReasonDeadlineElapsed},
	}
	for _, test := range tests {
		test := test
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()
			result := valid
			result.Payload = append([]byte(nil), valid.Payload...)
			if test.mutate != nil {
				test.mutate(&result)
			}
			at := test.at
			if at.IsZero() {
				at = testNow
			}
			checked := policy.InspectResult(at, request, decision, result)
			if checked.State != test.state || checked.Reason != test.reason || checked.Authority != ResultAuthority {
				t.Fatalf("InspectResult() = %s/%s/%s, want %s/%s/%s", checked.State, checked.Reason, checked.Authority, test.state, test.reason, ResultAuthority)
			}
		})
	}
	checked := policy.InspectResult(testNow, request, decision, valid)
	if checked.State != ResultVerify || !slices.Equal(checked.Payload, valid.Payload) {
		t.Fatalf("InspectResult(valid) = %#v, want independent verification", checked)
	}
}

func TestPolicyInspectResultRefusesInvalidObservationTimes(t *testing.T) {
	t.Parallel()
	policy := testPolicy(t)
	request := testRequest(TaskBinarySearch)
	decision := policy.Decide(testNow, request, testAdmissionDecision(policy, request.Task, testNow))
	result := SpecialistResult{
		Binding:      decision.Binding,
		SpecialistID: decision.SpecialistID,
		State:        ResultCompleted,
		Payload:      []byte("answer"),
	}
	for name, observedAt := range map[string]time.Time{
		"zero":                 {},
		"before issuance":      request.IssuedAt.Add(-time.Nanosecond),
		"before decision time": decision.DecidedAt.Add(-time.Nanosecond),
	} {
		name, observedAt := name, observedAt
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			checked := policy.InspectResult(observedAt, request, decision, result)
			if checked.State != ResultRefuse || checked.Reason != ReasonMalformedResult ||
				checked.Authority != ResultAuthority {
				t.Fatalf("InspectResult(%s) = %#v, want typed NO_RESULT refusal", name, checked)
			}
		})
	}
}

func TestPolicyRejectsForgedOrMutatedRecordedDecisions(t *testing.T) {
	t.Parallel()
	policy := testPolicy(t)
	request := testRequest(TaskInsertionSort)
	validDecision := policy.Decide(testNow, request, testAdmissionDecision(policy, request.Task, testNow))
	validResult := SpecialistResult{
		Binding:      validDecision.Binding,
		SpecialistID: validDecision.SpecialistID,
		State:        ResultCompleted,
		Payload:      []byte("answer"),
	}
	mutations := map[string]func(*Decision){
		"state":            func(decision *Decision) { decision.State = DecisionAbstain },
		"reason":           func(decision *Decision) { decision.Reason = ReasonStaleRequest },
		"authority":        func(decision *Decision) { decision.Authority = "RESULT" },
		"run":              func(decision *Decision) { decision.RunID = "run-002" },
		"request":          func(decision *Decision) { decision.RequestID = "request-002" },
		"task":             func(decision *Decision) { decision.Task = TaskBinarySearch },
		"specialist":       func(decision *Decision) { decision.SpecialistID = "exact-other" },
		"admission":        func(decision *Decision) { decision.Admission.DeclaredCost++ },
		"decision time":    func(decision *Decision) { decision.DecidedAt = decision.DecidedAt.Add(time.Nanosecond) },
		"deadline":         func(decision *Decision) { decision.Deadline = decision.Deadline.Add(time.Second) },
		"max result bytes": func(decision *Decision) { decision.MaxResultBytes++ },
		"binding":          func(decision *Decision) { decision.Binding[0]++ },
	}
	for name, mutate := range mutations {
		name, mutate := name, mutate
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			decision := validDecision
			mutate(&decision)
			checked := policy.InspectResult(testNow, request, decision, validResult)
			if checked.State != ResultRefuse || checked.Reason != ReasonMalformedResult {
				t.Fatalf("InspectResult(mutated %s) = %#v, want malformed-result refusal", name, checked)
			}
		})
	}
}

func TestPolicyFinaliseNeverPromotesConstructionOutput(t *testing.T) {
	t.Parallel()
	policy := testPolicy(t)
	request := testRequest(TaskBellmanFord)
	decision := policy.Decide(testNow, request, testAdmissionDecision(policy, request.Task, testNow))
	result := SpecialistResult{Binding: decision.Binding, SpecialistID: decision.SpecialistID, State: ResultCompleted, Payload: []byte("answer")}
	checked := policy.InspectResult(testNow, request, decision, result)

	for verdict, expected := range map[VerificationVerdict]OutcomeState{
		VerificationExact:    OutcomeVerified,
		VerificationMismatch: OutcomeAbstained,
		VerificationAbstain:  OutcomeAbstained,
		"unknown":            OutcomeRefused,
	} {
		outcome := policy.Finalise(testNow, request, decision, checked, Verification{
			Binding: decision.Binding, CandidateBinding: checked.CandidateBinding, Verdict: verdict,
		})
		if outcome.State != expected || outcome.Authority != ResultAuthority {
			t.Fatalf("Finalise(%s) = %s/%s, want %s/%s", verdict, outcome.State, outcome.Authority, expected, ResultAuthority)
		}
	}
	stale := decision.Binding
	stale[0]++
	outcome := policy.Finalise(testNow, request, decision, checked, Verification{
		Binding: stale, CandidateBinding: checked.CandidateBinding, Verdict: VerificationExact,
	})
	if outcome.State != OutcomeRefused || outcome.Reason != ReasonStaleResult || len(outcome.Payload) != 0 {
		t.Fatalf("Finalise(stale) = %#v, want closed stale-verification refusal", outcome)
	}
	forged := checked
	forged.Authority = "RESULT"
	outcome = policy.Finalise(testNow, request, decision, forged, Verification{
		Binding: decision.Binding, CandidateBinding: checked.CandidateBinding, Verdict: VerificationExact,
	})
	if outcome.State != OutcomeRefused || outcome.Authority != ResultAuthority {
		t.Fatalf("Finalise(forged authority) = %#v, want NO_RESULT refusal", outcome)
	}
	substituted := checked
	substituted.Payload = append([]byte(nil), checked.Payload...)
	substituted.Payload[0] ^= 0xff
	outcome = policy.Finalise(testNow, request, decision, substituted, Verification{
		Binding: decision.Binding, CandidateBinding: checked.CandidateBinding, Verdict: VerificationExact,
	})
	if outcome.State != OutcomeRefused || outcome.Reason != ReasonStaleResult || len(outcome.Payload) != 0 {
		t.Fatalf("Finalise(substituted candidate) = %#v, want candidate-binding refusal", outcome)
	}
	wrongSpecialist := checked
	wrongSpecialist.SpecialistID = "exact-other"
	wrongSpecialist.CandidateBinding = bindCandidate(
		wrongSpecialist.Binding, wrongSpecialist.SpecialistID, ResultCompleted, wrongSpecialist.Payload,
	)
	outcome = policy.Finalise(testNow, request, decision, wrongSpecialist, Verification{
		Binding: decision.Binding, CandidateBinding: wrongSpecialist.CandidateBinding, Verdict: VerificationExact,
	})
	if outcome.State != OutcomeRefused || len(outcome.Payload) != 0 {
		t.Fatalf("Finalise(substituted specialist) = %#v, want route-bound refusal", outcome)
	}
}

func testPolicy(t *testing.T) Policy {
	t.Helper()
	return testPolicyWithLimits(t, testLimits())
}

func testPolicyWithLimits(t *testing.T, limits Limits) Policy {
	t.Helper()
	policy, err := NewPolicy(limits, testRoutes())
	if err != nil {
		t.Fatalf("NewPolicy() error = %v", err)
	}
	return policy
}

func testLimits() Limits {
	return Limits{
		MaxRequestBytes:   32,
		MaxResultBytes:    16,
		MaxRequestAge:     10 * time.Second,
		MaxExecution:      2 * time.Minute,
		MaxDecisionRecord: 100 * time.Millisecond,
	}
}

func testRoutes() []Route {
	tasks := Tasks()
	routes := make([]Route, 0, len(tasks))
	for index := len(tasks) - 1; index >= 0; index-- {
		task := tasks[index]
		routes = append(routes, Route{Task: task, SpecialistID: "exact-" + string(task)})
	}
	return routes
}

func testAdmissionDecision(policy Policy, task TaskKind, at time.Time) AdmissionDecision {
	routes := policy.routes[task]
	if len(routes) == 0 {
		return AdmissionDecision{}
	}
	return AdmissionDecision{
		State: AdmissionAdmitted, Reason: AdmissionReasonReady, Authority: ResultAuthority,
		SpecialistID: routes[0], Fit: FitTaskCompatible, Readiness: ReadinessReady,
		ObservedAt: at.Add(-time.Second), ValidUntil: at.Add(time.Minute - time.Second), DecidedAt: at, Attempts: 1,
	}
}

func testRequest(task TaskKind) Request {
	return Request{
		RunID:     "run-001",
		RequestID: "request-001",
		Task:      task,
		Payload:   []byte(`{"input":[3,1,2]}`),
		IssuedAt:  testNow.Add(-time.Second),
		Deadline:  testNow.Add(time.Minute),
	}
}
