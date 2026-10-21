package specialistcontrol

import (
	"context"
	"errors"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

func TestAdmissionRequiresOneBoundedObservationPerRegisteredSpecialist(t *testing.T) {
	t.Parallel()
	policy := testPolicy(t)
	observations := testReadiness(policy, testNow, time.Minute)
	tests := map[string]func([]ReadinessObservation) []ReadinessObservation{
		"missing": func(input []ReadinessObservation) []ReadinessObservation {
			return input[:len(input)-1]
		},
		"duplicate": func(input []ReadinessObservation) []ReadinessObservation {
			input[len(input)-1] = input[0]
			return input
		},
		"future": func(input []ReadinessObservation) []ReadinessObservation {
			input[0].ObservedAt = testNow.Add(time.Nanosecond)
			return input
		},
		"unbounded validity": func(input []ReadinessObservation) []ReadinessObservation {
			input[0].ValidFor = 2 * time.Minute
			return input
		},
		"missing fit": func(input []ReadinessObservation) []ReadinessObservation {
			input[0].Fits = nil
			return input
		},
	}
	for name, mutate := range tests {
		name, mutate := name, mutate
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			input := append([]ReadinessObservation(nil), observations...)
			if _, err := NewAdmission(policy, testAdmissionLimits(), mutate(input), testNow); err == nil {
				t.Fatal("NewAdmission() error = nil, want closed observation rejection")
			}
		})
	}
}

func TestAdmissionRequiresBoundedMeasuredFitEvidence(t *testing.T) {
	t.Parallel()
	tests := map[string]func(*RequestFit, *ReadinessObservation){
		"missing basis": func(fit *RequestFit, _ *ReadinessObservation) {
			fit.MeasurementBasis = ""
		},
		"invalid basis": func(fit *RequestFit, _ *ReadinessObservation) {
			fit.MeasurementBasis = "fit probe v1"
		},
		"missing measurement time": func(fit *RequestFit, _ *ReadinessObservation) {
			fit.MeasuredAt = time.Time{}
		},
		"measurement after observation": func(fit *RequestFit, observation *ReadinessObservation) {
			fit.MeasuredAt = observation.ObservedAt.Add(time.Nanosecond)
		},
		"missing measurement validity": func(fit *RequestFit, _ *ReadinessObservation) {
			fit.MeasurementValidFor = 0
		},
		"measurement validity above bound": func(fit *RequestFit, _ *ReadinessObservation) {
			fit.MeasurementValidFor = 2 * time.Minute
		},
		"measurement outlives observation window": func(fit *RequestFit, observation *ReadinessObservation) {
			observation.ValidFor = 30 * time.Second
			fit.MeasurementValidFor = 45 * time.Second
		},
		"expired measurement": func(fit *RequestFit, _ *ReadinessObservation) {
			fit.MeasuredAt = testNow.Add(-2 * time.Minute)
			fit.MeasurementValidFor = time.Minute
		},
		"measurement metadata on construction fit": func(fit *RequestFit, _ *ReadinessObservation) {
			fit.State = FitTaskCompatible
		},
	}
	for name, mutate := range tests {
		name, mutate := name, mutate
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			policy := testPolicy(t)
			observations := testReadiness(policy, testNow, time.Minute)
			index := readinessIndex(t, observations, "exact-"+string(TaskInsertionSort))
			observation := &observations[index]
			fit := &observation.Fits[0]
			fit.State = FitMeasured
			fit.MeasurementBasis = "fit-probe:v1"
			fit.MeasuredAt = observation.ObservedAt.Add(-time.Second)
			fit.MeasurementValidFor = time.Minute
			mutate(fit, observation)
			if _, err := NewAdmission(policy, testAdmissionLimits(), observations, testNow); err == nil {
				t.Fatal("NewAdmission() error = nil, want bounded measured-fit evidence rejection")
			}
		})
	}
}

func TestAdmissionRejectsMissingOrOverflowingAggregateBounds(t *testing.T) {
	t.Parallel()
	policy := testPolicy(t)
	observations := testReadiness(policy, testNow, time.Minute)
	maximumInt := int(^uint(0) >> 1)
	for name, mutate := range map[string]func(*AdmissionLimits){
		"missing pending":  func(limits *AdmissionLimits) { limits.MaxTotalPending = 0 },
		"missing active":   func(limits *AdmissionLimits) { limits.MaxTotalActive = 0 },
		"pending overflow": func(limits *AdmissionLimits) { limits.MaxQueueDepth = maximumInt },
		"active overflow":  func(limits *AdmissionLimits) { limits.MaxConcurrencyPerSpecialist = maximumInt },
	} {
		name, mutate := name, mutate
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			limits := testAdmissionLimits()
			mutate(&limits)
			if _, err := NewAdmission(policy, limits, observations, testNow); err == nil {
				t.Fatal("NewAdmission() error = nil, want aggregate-bound rejection")
			}
		})
	}
}

func TestAdmissionTypesFitAndEveryReadinessState(t *testing.T) {
	t.Parallel()
	tests := []struct {
		name       string
		fit        FitState
		readiness  ReadinessState
		observedAt time.Time
		validFor   time.Duration
		wantState  AdmissionState
		wantReason AdmissionReason
		wantReady  ReadinessState
	}{
		{name: "ready", fit: FitTaskCompatible, readiness: ReadinessReady, observedAt: testNow.Add(-time.Second), validFor: time.Minute, wantState: AdmissionAdmitted, wantReason: AdmissionReasonReady, wantReady: ReadinessReady},
		{name: "measured fit ready", fit: FitMeasured, readiness: ReadinessReady, observedAt: testNow.Add(-time.Second), validFor: time.Minute, wantState: AdmissionAdmitted, wantReason: AdmissionReasonReady, wantReady: ReadinessReady},
		{name: "absent", fit: FitTaskCompatible, readiness: ReadinessAbsent, observedAt: testNow.Add(-time.Second), validFor: time.Minute, wantState: AdmissionFallback, wantReason: AdmissionReasonAbsent, wantReady: ReadinessAbsent},
		{name: "loading", fit: FitTaskCompatible, readiness: ReadinessLoading, observedAt: testNow.Add(-time.Second), validFor: time.Minute, wantState: AdmissionFallback, wantReason: AdmissionReasonRetryExhausted, wantReady: ReadinessLoading},
		{name: "saturated", fit: FitTaskCompatible, readiness: ReadinessSaturated, observedAt: testNow.Add(-time.Second), validFor: time.Minute, wantState: AdmissionFallback, wantReason: AdmissionReasonRetryExhausted, wantReady: ReadinessSaturated},
		{name: "stale state", fit: FitTaskCompatible, readiness: ReadinessStale, observedAt: testNow.Add(-time.Second), validFor: time.Minute, wantState: AdmissionFallback, wantReason: AdmissionReasonStale, wantReady: ReadinessStale},
		{name: "expired", fit: FitTaskCompatible, readiness: ReadinessReady, observedAt: testNow.Add(-time.Minute), validFor: time.Minute, wantState: AdmissionFallback, wantReason: AdmissionReasonStale, wantReady: ReadinessStale},
		{name: "expired unknown", fit: FitUnknown, readiness: ReadinessReady, observedAt: testNow.Add(-time.Minute), validFor: time.Minute, wantState: AdmissionFallback, wantReason: AdmissionReasonStale, wantReady: ReadinessStale},
		{name: "failed", fit: FitTaskCompatible, readiness: ReadinessFailed, observedAt: testNow.Add(-time.Second), validFor: time.Minute, wantState: AdmissionFallback, wantReason: AdmissionReasonFailed, wantReady: ReadinessFailed},
		{name: "known no fit", fit: FitKnownNoFit, readiness: ReadinessReady, observedAt: testNow.Add(-time.Second), validFor: time.Minute, wantState: AdmissionFallback, wantReason: AdmissionReasonKnownNoFit, wantReady: ReadinessReady},
		{name: "unknown is not a match", fit: FitUnknown, readiness: ReadinessReady, observedAt: testNow.Add(-time.Second), validFor: time.Minute, wantState: AdmissionFallback, wantReason: AdmissionReasonFitUnknown, wantReady: ReadinessReady},
	}
	for _, test := range tests {
		test := test
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()
			policy := testPolicy(t)
			observations := testReadiness(policy, testNow, time.Minute)
			target := "exact-" + string(TaskInsertionSort)
			for index := range observations {
				if observations[index].SpecialistID != target {
					continue
				}
				observations[index].State = test.readiness
				observations[index].ObservedAt = test.observedAt
				observations[index].ValidFor = test.validFor
				observations[index].Fits[0].State = test.fit
				if test.fit == FitMeasured {
					observations[index].Fits[0].MeasurementBasis = "fit-probe:v1"
					observations[index].Fits[0].MeasuredAt = test.observedAt
					observations[index].Fits[0].MeasurementValidFor = time.Minute
				}
			}
			limits := testAdmissionLimits()
			limits.MaxRetries = 0
			admission := mustAdmission(t, policy, limits, observations, testNow)
			decision, lease := admission.Acquire(context.Background(), testRequest(TaskInsertionSort), fixedClock(testNow))
			if lease != nil {
				defer lease.Release()
			}
			if decision.State != test.wantState || decision.Reason != test.wantReason || decision.Fit != test.fit ||
				decision.Readiness != test.wantReady || decision.Authority != ResultAuthority {
				t.Fatalf("Acquire() = %#v, want %s/%s readiness %s", decision, test.wantState, test.wantReason, test.wantReady)
			}
			if !admissibleFit(test.fit) && lease != nil {
				t.Fatal("non-matching fit acquired a specialist slot")
			}
			if test.fit == FitMeasured && (decision.FitMeasurementBasis != "fit-probe:v1" ||
				!decision.FitMeasuredAt.Equal(test.observedAt) ||
				!decision.FitValidUntil.Equal(test.observedAt.Add(time.Minute))) {
				t.Fatalf("Acquire(measured fit) evidence = %#v, want bound basis and validity", decision)
			}
		})
	}
}

func TestAdmissionRanksEqualCandidatesByStableSpecialistIdentity(t *testing.T) {
	t.Parallel()
	routes := append(testRoutes(), Route{Task: TaskInsertionSort, SpecialistID: "aaa-equal-rank"})
	policy, err := NewPolicy(testLimits(), routes)
	if err != nil {
		t.Fatal(err)
	}
	observations := testReadiness(policy, testNow, time.Minute)
	for index := range observations {
		observations[index].DeclaredCost = 7
	}
	admission := mustAdmission(t, policy, testAdmissionLimits(), observations, testNow)
	decision, lease := admission.Acquire(context.Background(), testRequest(TaskInsertionSort), fixedClock(testNow))
	if lease == nil || decision.SpecialistID != "aaa-equal-rank" || decision.DeclaredCost != 7 {
		t.Fatalf("Acquire(equal rank) = %#v, want aaa-equal-rank", decision)
	}
	lease.Release()
}

func TestAdmissionLeaseCopiesCannotReplayOrReleaseAnotherReservation(t *testing.T) {
	t.Parallel()
	policy := testPolicy(t)
	limits := testAdmissionLimits()
	limits.MaxRetries = 0
	admission := mustAdmission(t, policy, limits, testReadiness(policy, testNow, time.Minute), testNow)
	request := testRequest(TaskInsertionSort)

	_, first := admission.Acquire(context.Background(), request, fixedClock(testNow))
	if first == nil || first.state == nil || first.state.token == 0 {
		t.Fatal("first Acquire() did not return a token-bound lease")
	}
	copied := *first
	if decision := copied.Revalidate(context.Background(), request, fixedClock(testNow)); decision.State != AdmissionAdmitted {
		t.Fatalf("copied first Revalidate() = %#v, want admitted", decision)
	}
	if replay := first.Revalidate(context.Background(), request, fixedClock(testNow)); replay.Reason != AdmissionReasonMalformed {
		t.Fatalf("replayed Revalidate() = %#v, want malformed rejection", replay)
	}
	copied.Release()
	first.Release()
	oldToken := copied.state.token
	admission.mu.Lock()
	admission.nextLeaseToken = oldToken
	admission.mu.Unlock()

	_, second := admission.Acquire(context.Background(), request, fixedClock(testNow))
	if second == nil || second.state == nil || second.state.token != oldToken || second.state == copied.state {
		t.Fatal("second Acquire() did not safely reuse the released token with new opaque state")
	}
	copied.Release()
	if replay := copied.Revalidate(context.Background(), request, fixedClock(testNow)); replay.Reason != AdmissionReasonMalformed {
		t.Fatalf("released lease replay = %#v, want malformed rejection", replay)
	}
	blocked, third := admission.Acquire(context.Background(), request, fixedClock(testNow))
	if third != nil || blocked.State != AdmissionFallback || blocked.Reason != AdmissionReasonRetryExhausted {
		t.Fatalf("Acquire(after old replay) = %#v/%#v, want capacity still reserved", blocked, third)
	}
	if decision := second.Revalidate(context.Background(), request, fixedClock(testNow)); decision.State != AdmissionAdmitted {
		t.Fatalf("second Revalidate() = %#v, want admitted", decision)
	}
	second.Release()

	_, bound := admission.Acquire(context.Background(), request, fixedClock(testNow))
	if bound == nil {
		t.Fatal("request-binding Acquire() lease = nil")
	}
	altered := request
	altered.Payload = append([]byte(nil), request.Payload...)
	altered.Payload[0] ^= 1
	if decision := bound.Revalidate(context.Background(), altered, fixedClock(testNow)); decision.Reason != AdmissionReasonMalformed {
		t.Fatalf("Revalidate(foreign request) = %#v, want malformed rejection", decision)
	}
	if replay := bound.Revalidate(context.Background(), request, fixedClock(testNow)); replay.Reason != AdmissionReasonMalformed {
		t.Fatalf("Revalidate(after foreign replay) = %#v, want one-shot rejection", replay)
	}
	bound.Release()

	admission.mu.Lock()
	defer admission.mu.Unlock()
	if admission.activeTotal != 0 || len(admission.activeLeases) != 0 {
		t.Fatalf("lease cleanup active/map = %d/%d, want 0/0", admission.activeTotal, len(admission.activeLeases))
	}
}

func TestAdmissionChecksCancellationAfterAcquiringItsMutex(t *testing.T) {
	policy := testPolicy(t)
	admission := mustAdmission(t, policy, testAdmissionLimits(), testReadiness(policy, testNow, time.Minute), testNow)
	ctx, cancel := context.WithCancel(context.Background())
	clockCalled := make(chan struct{})
	var clockOnce sync.Once
	clock := func() time.Time {
		clockOnce.Do(func() { close(clockCalled) })
		return testNow
	}
	result := make(chan admissionResult, 1)
	started := make(chan struct{})

	admission.mu.Lock()
	go func() {
		close(started)
		acquireInto(result, admission, ctx, testRequest(TaskInsertionSort), clock)
	}()
	<-started
	assertClockNotSampled(t, clockCalled)
	cancel()
	admission.mu.Unlock()

	got := <-result
	if got.lease != nil {
		got.lease.Release()
	}
	if got.lease != nil || got.decision.State != AdmissionRejected || got.decision.Reason != AdmissionReasonCancelled {
		t.Fatalf("Acquire(cancelled behind mutex) = %#v, want cancellation rejection", got.decision)
	}
}

func TestAdmissionChecksDeadlineAfterAcquiringItsMutex(t *testing.T) {
	policy := testPolicy(t)
	admission := mustAdmission(t, policy, testAdmissionLimits(), testReadiness(policy, testNow, time.Minute), testNow)
	request := testRequest(TaskInsertionSort)
	var clockNanos atomic.Int64
	clockNanos.Store(testNow.UnixNano())
	clockCalled := make(chan struct{})
	var clockOnce sync.Once
	clock := func() time.Time {
		clockOnce.Do(func() { close(clockCalled) })
		return time.Unix(0, clockNanos.Load())
	}
	result := make(chan admissionResult, 1)
	started := make(chan struct{})

	admission.mu.Lock()
	go func() {
		close(started)
		acquireInto(result, admission, context.Background(), request, clock)
	}()
	<-started
	assertClockNotSampled(t, clockCalled)
	clockNanos.Store(request.Deadline.UnixNano())
	admission.mu.Unlock()

	got := <-result
	if got.lease != nil {
		got.lease.Release()
	}
	if got.lease != nil || got.decision.State != AdmissionRejected || got.decision.Reason != AdmissionReasonDeadlineElapsed {
		t.Fatalf("Acquire(expired behind mutex) = %#v, want deadline rejection", got.decision)
	}
}

func TestAdmissionRevalidationChecksFreshnessAfterAcquiringItsMutex(t *testing.T) {
	policy := testPolicy(t)
	admission := mustAdmission(t, policy, testAdmissionLimits(), testReadiness(policy, testNow, time.Minute), testNow)
	request := testRequest(TaskInsertionSort)
	_, lease := admission.Acquire(context.Background(), request, fixedClock(testNow))
	if lease == nil {
		t.Fatal("Acquire() lease = nil")
	}
	defer lease.Release()
	validUntil := testNow.Add(time.Minute - time.Millisecond)
	var clockNanos atomic.Int64
	clockNanos.Store(testNow.UnixNano())
	clockCalled := make(chan struct{})
	var clockOnce sync.Once
	clock := func() time.Time {
		clockOnce.Do(func() { close(clockCalled) })
		return time.Unix(0, clockNanos.Load())
	}
	result := make(chan AdmissionDecision, 1)
	started := make(chan struct{})

	admission.mu.Lock()
	go func() {
		close(started)
		result <- lease.Revalidate(context.Background(), request, clock)
	}()
	<-started
	assertClockNotSampled(t, clockCalled)
	clockNanos.Store(validUntil.UnixNano())
	admission.mu.Unlock()

	decision := <-result
	if decision.State != AdmissionFallback || decision.Reason != AdmissionReasonStale || !decision.DecidedAt.Equal(validUntil) {
		t.Fatalf("Revalidate(expired behind mutex) = %#v, want stale fallback", decision)
	}
}

func TestAdmissionRevalidationFailsClosedAfterMeasuredFitExpires(t *testing.T) {
	t.Parallel()
	policy := testPolicy(t)
	observations := testReadiness(policy, testNow, time.Minute)
	target := &observations[readinessIndex(t, observations, "exact-"+string(TaskInsertionSort))]
	target.Fits[0] = RequestFit{
		Task: TaskInsertionSort, State: FitMeasured, MeasurementBasis: "fit-probe:v1",
		MeasuredAt: target.ObservedAt, MeasurementValidFor: 25 * time.Millisecond,
	}
	fitValidUntil := target.Fits[0].MeasuredAt.Add(target.Fits[0].MeasurementValidFor)
	admission := mustAdmission(t, policy, testAdmissionLimits(), observations, testNow)
	request := testRequest(TaskInsertionSort)
	_, lease := admission.Acquire(context.Background(), request, fixedClock(testNow))
	if lease == nil {
		t.Fatal("Acquire(measured fit) lease = nil")
	}
	defer lease.Release()

	decision := lease.Revalidate(context.Background(), request, fixedClock(fitValidUntil))
	if decision.State != AdmissionFallback || decision.Reason != AdmissionReasonFitUnknown ||
		decision.Fit != FitUnknown || decision.FitMeasurementBasis != "" ||
		!decision.FitMeasuredAt.IsZero() || !decision.FitValidUntil.IsZero() {
		t.Fatalf("Revalidate(expired measured fit) = %#v, want evidence-free fit-unknown fallback", decision)
	}
}

func TestAdmissionBoundsSaturationQueueDeadlineCancellationAndRetries(t *testing.T) {
	t.Parallel()
	t.Run("saturation and queue full", func(t *testing.T) {
		policy := testPolicy(t)
		limits := testAdmissionLimits()
		limits.MaxQueueDepth = 1
		admission := mustAdmission(t, policy, limits, testReadiness(policy, testNow, time.Minute), testNow)
		request := testRequest(TaskInsertionSort)
		_, held := admission.Acquire(context.Background(), request, fixedClock(testNow))
		if held == nil {
			t.Fatal("first Acquire() did not reserve capacity")
		}
		result := make(chan admissionResult, 1)
		go acquireInto(result, admission, context.Background(), request, fixedClock(testNow))
		waitForPending(t, admission, 1)
		full, fullLease := admission.Acquire(context.Background(), request, fixedClock(testNow))
		if fullLease != nil || full.State != AdmissionFallback || full.Reason != AdmissionReasonQueueFull || full.Readiness != ReadinessSaturated {
			t.Fatalf("Acquire(full) = %#v, want typed saturated queue-full fallback", full)
		}
		held.Release()
		queued := <-result
		if queued.lease == nil || queued.decision.State != AdmissionAdmitted || queued.decision.Attempts != 2 {
			t.Fatalf("queued Acquire() = %#v, want second-attempt admission", queued.decision)
		}
		queued.lease.Release()
	})

	t.Run("deadline while queued", func(t *testing.T) {
		policy := testPolicy(t)
		at := time.Now()
		observations := testReadiness(policy, at, time.Second)
		admission := mustAdmission(t, policy, testAdmissionLimits(), observations, at)
		request := testRequest(TaskInsertionSort)
		request.Deadline = at.Add(20 * time.Millisecond)
		_, held := admission.Acquire(context.Background(), request, time.Now)
		defer held.Release()
		decision, lease := admission.Acquire(context.Background(), request, time.Now)
		if lease != nil || decision.State != AdmissionRejected || decision.Reason != AdmissionReasonDeadlineElapsed {
			t.Fatalf("Acquire(deadline) = %#v, want typed deadline rejection", decision)
		}
	})

	t.Run("maximum wait while queued", func(t *testing.T) {
		policy := testPolicy(t)
		at := time.Now()
		limits := testAdmissionLimits()
		limits.MaxWait = 10 * time.Millisecond
		admission := mustAdmission(t, policy, limits, testReadiness(policy, at, time.Second), at)
		request := testRequest(TaskInsertionSort)
		request.Deadline = at.Add(time.Second)
		_, held := admission.Acquire(context.Background(), request, time.Now)
		defer held.Release()
		decision, lease := admission.Acquire(context.Background(), request, time.Now)
		if lease != nil || decision.State != AdmissionFallback || decision.Reason != AdmissionReasonWaitExpired ||
			decision.Readiness != ReadinessSaturated {
			t.Fatalf("Acquire(wait limit) = %#v, want typed wait-expired fallback", decision)
		}
	})

	t.Run("wait budget is absolute from enqueue", func(t *testing.T) {
		policy := testPolicy(t)
		at := testNow
		limits := testAdmissionLimits()
		limits.MaxWait = 10 * time.Millisecond
		admission := mustAdmission(t, policy, limits, testReadiness(policy, at, time.Minute), at)
		request := testRequest(TaskInsertionSort)
		request.Deadline = at.Add(time.Second)
		duration, reason := admission.waitBound(request, at, at.Add(9*time.Millisecond))
		if duration != time.Millisecond || reason != AdmissionReasonWaitExpired {
			t.Fatalf("waitBound() = %s/%s, want remaining 1ms/wait-expired", duration, reason)
		}
		request.Deadline = at.Add(limits.MaxWait)
		duration, reason = admission.waitBound(request, at, at.Add(9*time.Millisecond))
		if duration != time.Millisecond || reason != AdmissionReasonDeadlineElapsed {
			t.Fatalf("equal wait/deadline bound = %s/%s, want remaining 1ms/deadline-elapsed", duration, reason)
		}
		ticket := &admissionTicket{queuedAt: at, last: AdmissionDecision{Authority: ResultAuthority}}
		decision, terminal := admission.waitingBoundary(context.Background(), request, ticket, request.Deadline)
		if !terminal || decision.State != AdmissionRejected || decision.Reason != AdmissionReasonDeadlineElapsed {
			t.Fatalf("equal wait/deadline boundary = %#v/%t, want deadline rejection", decision, terminal)
		}
	})

	t.Run("cancellation while queued", func(t *testing.T) {
		policy := testPolicy(t)
		admission := mustAdmission(t, policy, testAdmissionLimits(), testReadiness(policy, testNow, time.Minute), testNow)
		request := testRequest(TaskInsertionSort)
		_, held := admission.Acquire(context.Background(), request, fixedClock(testNow))
		defer held.Release()
		ctx, cancel := context.WithCancel(context.Background())
		result := make(chan admissionResult, 1)
		go acquireInto(result, admission, ctx, request, fixedClock(testNow))
		waitForPending(t, admission, 1)
		cancel()
		queued := <-result
		if queued.lease != nil || queued.decision.State != AdmissionRejected || queued.decision.Reason != AdmissionReasonCancelled {
			t.Fatalf("Acquire(cancelled) = %#v, want typed cancellation rejection", queued.decision)
		}
	})

	t.Run("retry exhaustion", func(t *testing.T) {
		policy := testPolicy(t)
		at := time.Now()
		observations := testReadiness(policy, at, time.Second)
		targetIndex := readinessIndex(t, observations, "exact-"+string(TaskInsertionSort))
		observations[targetIndex].State = ReadinessLoading
		limits := testAdmissionLimits()
		limits.MaxRetries = 2
		admission := mustAdmission(t, policy, limits, observations, at)
		request := testRequest(TaskInsertionSort)
		request.Deadline = at.Add(time.Second)
		var clockNanos atomic.Int64
		clockNanos.Store(at.UnixNano())
		clock := func() time.Time { return time.Unix(0, clockNanos.Load()) }
		result := make(chan admissionResult, 1)
		go acquireInto(result, admission, context.Background(), request, clock)
		waitForPending(t, admission, 1)
		for retry := 1; retry <= limits.MaxRetries; retry++ {
			observation := observations[targetIndex]
			observation.ObservedAt = at.Add(time.Duration(retry) * time.Millisecond)
			clockNanos.Store(observation.ObservedAt.UnixNano())
			if err := admission.Observe(at.Add(time.Duration(retry)*time.Millisecond), observation); err != nil {
				t.Fatal(err)
			}
			if retry < limits.MaxRetries {
				waitForRetries(t, admission, retry)
			}
		}
		queued := <-result
		if queued.lease != nil || queued.decision.State != AdmissionFallback ||
			queued.decision.Reason != AdmissionReasonRetryExhausted || queued.decision.Attempts != 3 {
			t.Fatalf("Acquire(retries) = %#v, want bounded third-attempt fallback", queued.decision)
		}
	})
}

func TestAdmissionDoesNotLetOneSpecialistMonopoliseUnrelatedCapacity(t *testing.T) {
	t.Parallel()
	policy := testPolicy(t)
	admission := mustAdmission(t, policy, testAdmissionLimits(), testReadiness(policy, testNow, time.Minute), testNow)
	insertion := testRequest(TaskInsertionSort)
	_, held := admission.Acquire(context.Background(), insertion, fixedClock(testNow))
	if held == nil {
		t.Fatal("first insertion request did not reserve capacity")
	}
	defer held.Release()
	queuedContext, cancel := context.WithCancel(context.Background())
	defer cancel()
	queued := make(chan admissionResult, 1)
	go acquireInto(queued, admission, queuedContext, insertion, fixedClock(testNow))
	waitForPending(t, admission, 1)

	for range 8 {
		binary, binaryLease := admission.Acquire(context.Background(), testRequest(TaskBinarySearch), fixedClock(testNow))
		if binaryLease == nil || binary.State != AdmissionAdmitted || binary.SpecialistID != "exact-"+string(TaskBinarySearch) {
			t.Fatalf("unrelated Acquire() = %#v, want immediate independent admission", binary)
		}
		binaryLease.Release()
	}
	select {
	case early := <-queued:
		t.Fatalf("unrelated route churn exhausted or admitted blocked request: %#v", early.decision)
	default:
	}
	held.Release()
	held = nil
	released := <-queued
	if released.lease == nil || released.decision.State != AdmissionAdmitted || released.decision.Attempts != 2 {
		t.Fatalf("released queued request = %#v, want one relevant retry and admission", released.decision)
	}
	released.lease.Release()
}

func TestAdmissionExhaustsReadinessRetriesPerCandidate(t *testing.T) {
	t.Parallel()
	const unhealthyID = "aaa-loading-insertion"
	routes := append(testRoutes(), Route{Task: TaskInsertionSort, SpecialistID: unhealthyID})
	policy, err := NewPolicy(testLimits(), routes)
	if err != nil {
		t.Fatal(err)
	}
	observations := testReadiness(policy, testNow, time.Minute)
	unhealthyIndex := readinessIndex(t, observations, unhealthyID)
	observations[unhealthyIndex].State = ReadinessLoading
	limits := testAdmissionLimits()
	limits.MaxRetries = 2
	admission := mustAdmission(t, policy, limits, observations, testNow)
	request := testRequest(TaskInsertionSort)
	var clockNanos atomic.Int64
	clockNanos.Store(testNow.UnixNano())
	clock := func() time.Time { return time.Unix(0, clockNanos.Load()) }

	heldDecision, held := admission.Acquire(context.Background(), request, clock)
	if held == nil || heldDecision.SpecialistID != "exact-"+string(TaskInsertionSort) {
		t.Fatalf("initial Acquire() = %#v, want healthy route reservation", heldDecision)
	}
	t.Cleanup(held.Release)
	result := make(chan admissionResult, 1)
	go acquireInto(result, admission, context.Background(), request, clock)
	waitForPending(t, admission, 1)

	for retry := 1; retry <= limits.MaxRetries; retry++ {
		observedAt := testNow.Add(time.Duration(retry) * time.Millisecond)
		clockNanos.Store(observedAt.UnixNano())
		observation := observations[unhealthyIndex]
		observation.ObservedAt = observedAt
		if err := admission.Observe(observedAt, observation); err != nil {
			t.Fatal(err)
		}
		if retry < limits.MaxRetries {
			waitForRetries(t, admission, retry)
		}
	}
	waitForCandidateExhaustion(t, admission, unhealthyID)
	select {
	case early := <-result:
		t.Fatalf("unhealthy candidate exhausted the complete ticket: %#v", early.decision)
	default:
	}
	for retry := limits.MaxRetries + 1; retry <= limits.MaxRetries+8; retry++ {
		observedAt := testNow.Add(time.Duration(retry) * time.Millisecond)
		clockNanos.Store(observedAt.UnixNano())
		observation := observations[unhealthyIndex]
		observation.ObservedAt = observedAt
		if err := admission.Observe(observedAt, observation); err != nil {
			t.Fatal(err)
		}
	}

	held.Release()
	queued := <-result
	if queued.lease == nil || queued.decision.State != AdmissionAdmitted ||
		queued.decision.SpecialistID != "exact-"+string(TaskInsertionSort) || queued.decision.Attempts != 4 {
		t.Fatalf("Acquire(after unhealthy exhaustion) = %#v, want healthy route admission", queued.decision)
	}
	queued.lease.Release()
}

func TestAdmissionRequiresQueueRoomOnEveryCandidate(t *testing.T) {
	const alternateID = "alternate-loading-insertion"
	routes := append(testRoutes(), Route{Task: TaskInsertionSort, SpecialistID: alternateID})
	policy, err := NewPolicy(testLimits(), routes)
	if err != nil {
		t.Fatal(err)
	}
	observations := testReadiness(policy, testNow, time.Minute)
	primaryID := "exact-" + string(TaskInsertionSort)
	for _, specialistID := range []string{primaryID, alternateID} {
		observations[readinessIndex(t, observations, specialistID)].State = ReadinessLoading
	}
	limits := testAdmissionLimits()
	limits.MaxQueueDepth = 1
	limits.MaxRetries = 1
	admission := mustAdmission(t, policy, limits, observations, testNow)
	request := testRequest(TaskInsertionSort)
	var clockNanos atomic.Int64
	clockNanos.Store(testNow.UnixNano())
	clock := func() time.Time { return time.Unix(0, clockNanos.Load()) }
	ctx, cancel := context.WithCancel(context.Background())
	result := make(chan admissionResult, 1)
	go acquireInto(result, admission, ctx, request, clock)
	waitForPending(t, admission, 1)

	updatedAt := testNow.Add(time.Millisecond)
	clockNanos.Store(updatedAt.UnixNano())
	updated := observations[readinessIndex(t, observations, primaryID)]
	updated.ObservedAt = updatedAt
	if err := admission.Observe(updatedAt, updated); err != nil {
		t.Fatal(err)
	}
	waitForCandidateExhaustion(t, admission, primaryID)

	full, lease := admission.Acquire(context.Background(), request, clock)
	if lease != nil || full.State != AdmissionFallback || full.Reason != AdmissionReasonQueueFull {
		t.Fatalf("Acquire(asymmetric queue) = %#v/%#v, want queue-full fallback", full, lease)
	}
	cancel()
	if cancelled := <-result; cancelled.lease != nil || cancelled.decision.Reason != AdmissionReasonCancelled {
		t.Fatalf("first queued request after cancel = %#v", cancelled.decision)
	}
}

func TestAdmissionReadyHeartbeatsDoNotConsumeReadinessRetries(t *testing.T) {
	policy := testPolicy(t)
	limits := testAdmissionLimits()
	limits.MaxRetries = 1
	admission := mustAdmission(t, policy, limits, testReadiness(policy, testNow, time.Minute), testNow)
	request := testRequest(TaskInsertionSort)
	targetID := "exact-" + string(TaskInsertionSort)
	var clockNanos atomic.Int64
	clockNanos.Store(testNow.UnixNano())
	clock := func() time.Time { return time.Unix(0, clockNanos.Load()) }
	_, held := admission.Acquire(context.Background(), request, clock)
	if held == nil {
		t.Fatal("initial Acquire() lease = nil")
	}
	result := make(chan admissionResult, 1)
	go acquireInto(result, admission, context.Background(), request, clock)
	waitForPending(t, admission, 1)

	for heartbeat := 1; heartbeat <= 5; heartbeat++ {
		observedAt := testNow.Add(time.Duration(heartbeat) * time.Millisecond)
		clockNanos.Store(observedAt.UnixNano())
		fresh := testReadiness(policy, observedAt, time.Minute)
		observation := fresh[readinessIndex(t, fresh, targetID)]
		observation.ObservedAt = observedAt
		if err := admission.Observe(observedAt, observation); err != nil {
			t.Fatal(err)
		}
		waitForCandidateVersion(t, admission, targetID, uint64(heartbeat))
		select {
		case early := <-result:
			t.Fatalf("ready heartbeat terminated capacity waiter: %#v", early.decision)
		default:
		}
	}

	held.Release()
	queued := <-result
	if queued.lease == nil || queued.decision.State != AdmissionAdmitted || queued.decision.Attempts != 2 {
		t.Fatalf("Acquire(after ready heartbeats) = %#v, want second-attempt admission", queued.decision)
	}
	queued.lease.Release()
}

func TestAdmissionNotificationCannotAdmitAfterAbsoluteWaitBudget(t *testing.T) {
	t.Parallel()
	t.Run("capacity release", func(t *testing.T) {
		policy := testPolicy(t)
		limits := testAdmissionLimits()
		admission := mustAdmission(t, policy, limits, testReadiness(policy, testNow, time.Minute), testNow)
		request := testRequest(TaskInsertionSort)
		_, held := admission.Acquire(context.Background(), request, fixedClock(testNow))
		if held == nil {
			t.Fatal("initial admission did not reserve specialist capacity")
		}
		var clockNanos atomic.Int64
		clockNanos.Store(testNow.UnixNano())
		clock := func() time.Time { return time.Unix(0, clockNanos.Load()) }
		result := make(chan admissionResult, 1)
		go acquireInto(result, admission, context.Background(), request, clock)
		waitForPending(t, admission, 1)
		clockNanos.Store(testNow.Add(limits.MaxWait).UnixNano())
		held.Release()

		assertExpiredNotification(t, admission, <-result)
	})

	t.Run("readiness observation", func(t *testing.T) {
		policy := testPolicy(t)
		limits := testAdmissionLimits()
		observations := testReadiness(policy, testNow, time.Minute)
		targetID := "exact-" + string(TaskInsertionSort)
		targetIndex := readinessIndex(t, observations, targetID)
		observations[targetIndex].State = ReadinessLoading
		admission := mustAdmission(t, policy, limits, observations, testNow)
		request := testRequest(TaskInsertionSort)
		var clockNanos atomic.Int64
		clockNanos.Store(testNow.UnixNano())
		clock := func() time.Time { return time.Unix(0, clockNanos.Load()) }
		result := make(chan admissionResult, 1)
		go acquireInto(result, admission, context.Background(), request, clock)
		waitForPending(t, admission, 1)
		expiredAt := testNow.Add(limits.MaxWait)
		clockNanos.Store(expiredAt.UnixNano())
		observation := observations[targetIndex]
		observation.State = ReadinessReady
		observation.ObservedAt = expiredAt
		if err := admission.Observe(expiredAt, observation); err != nil {
			t.Fatal(err)
		}

		assertExpiredNotification(t, admission, <-result)
	})
}

func TestAdmissionWakesWhenAWaitableObservationExpires(t *testing.T) {
	policy := testPolicy(t)
	at := time.Now()
	observations := testReadiness(policy, at, 40*time.Millisecond)
	targetID := "exact-" + string(TaskInsertionSort)
	observations[readinessIndex(t, observations, targetID)].State = ReadinessLoading
	limits := testAdmissionLimits()
	limits.MaxWait = 750 * time.Millisecond
	admission := mustAdmission(t, policy, limits, observations, at)
	request := testRequest(TaskInsertionSort)
	request.IssuedAt = at.Add(-time.Millisecond)
	request.Deadline = at.Add(time.Second)

	startedAt := time.Now()
	decision, lease := admission.Acquire(context.Background(), request, time.Now)
	elapsed := time.Since(startedAt)
	if lease != nil || decision.State != AdmissionFallback || decision.Reason != AdmissionReasonStale ||
		decision.Readiness != ReadinessStale {
		t.Fatalf("Acquire(observation expiry) = %#v/%#v, want stale fallback", decision, lease)
	}
	if elapsed >= limits.MaxWait/2 {
		t.Fatalf("stale observation returned after %s, MaxWait = %s", elapsed, limits.MaxWait)
	}
	admission.mu.Lock()
	defer admission.mu.Unlock()
	if len(admission.pending) != 0 {
		t.Fatalf("observation expiry leaked %d queue ticket(s)", len(admission.pending))
	}
}

func TestAdmissionWakesAtMeasuredFitExpiryAndFailsClosed(t *testing.T) {
	policy := testPolicy(t)
	at := time.Now()
	observations := testReadiness(policy, at, 2*time.Second)
	targetID := "exact-" + string(TaskInsertionSort)
	target := &observations[readinessIndex(t, observations, targetID)]
	target.State = ReadinessLoading
	target.Fits[0] = RequestFit{
		Task: TaskInsertionSort, State: FitMeasured, MeasurementBasis: "fit-probe:v1",
		MeasuredAt: target.ObservedAt, MeasurementValidFor: 250 * time.Millisecond,
	}
	fitValidUntil := target.Fits[0].MeasuredAt.Add(target.Fits[0].MeasurementValidFor)
	limits := testAdmissionLimits()
	limits.MaxObservationValidity = 2 * time.Second
	limits.MaxWait = 2 * time.Second
	admission := mustAdmission(t, policy, limits, observations, at)
	request := testRequest(TaskInsertionSort)
	request.IssuedAt = at.Add(-time.Millisecond)
	request.Deadline = at.Add(3 * time.Second)
	result := make(chan admissionResult, 1)

	startedAt := time.Now()
	go acquireInto(result, admission, context.Background(), request, time.Now)
	waitForPending(t, admission, 1)
	got := <-result
	elapsed := time.Since(startedAt)

	if got.lease != nil || got.decision.State != AdmissionFallback ||
		got.decision.Reason != AdmissionReasonFitUnknown || got.decision.Fit != FitUnknown ||
		got.decision.FitMeasurementBasis != "" || !got.decision.FitMeasuredAt.IsZero() ||
		!got.decision.FitValidUntil.IsZero() || got.decision.DecidedAt.Before(fitValidUntil) {
		t.Fatalf("Acquire(expired measured fit) = %#v/%#v, want evidence-free fit-unknown fallback", got.decision, got.lease)
	}
	if elapsed >= limits.MaxWait/2 {
		t.Fatalf("measured-fit expiry returned after %s, MaxWait = %s", elapsed, limits.MaxWait)
	}
	admission.mu.Lock()
	defer admission.mu.Unlock()
	if len(admission.pending) != 0 {
		t.Fatalf("measured-fit expiry leaked %d queue ticket(s)", len(admission.pending))
	}
}

func TestAdmissionRechecksCancellationAfterTimerWake(t *testing.T) {
	policy := testPolicy(t)
	at := time.Now()
	observations := testReadiness(policy, at, time.Second)
	targetID := "exact-" + string(TaskInsertionSort)
	observations[readinessIndex(t, observations, targetID)].State = ReadinessLoading
	limits := testAdmissionLimits()
	limits.MaxWait = 20 * time.Millisecond
	admission := mustAdmission(t, policy, limits, observations, at)
	request := testRequest(TaskInsertionSort)
	request.IssuedAt = at.Add(-time.Millisecond)
	request.Deadline = at.Add(time.Second)
	ctx, cancel := context.WithCancel(context.Background())
	result := make(chan admissionResult, 1)
	go acquireInto(result, admission, ctx, request, time.Now)
	waitForPending(t, admission, 1)

	admission.mu.Lock()
	time.Sleep(2 * limits.MaxWait)
	cancel()
	admission.mu.Unlock()
	got := <-result
	if got.lease != nil || got.decision.State != AdmissionRejected || got.decision.Reason != AdmissionReasonCancelled {
		t.Fatalf("Acquire(cancelled after timer wake) = %#v, want cancellation rejection", got.decision)
	}
}

func TestAdmissionEnforcesAggregatePendingAndActiveLimits(t *testing.T) {
	t.Run("active", func(t *testing.T) {
		policy := testPolicy(t)
		limits := testAdmissionLimits()
		limits.MaxTotalActive = 1
		admission := mustAdmission(t, policy, limits, testReadiness(policy, testNow, time.Minute), testNow)
		_, held := admission.Acquire(context.Background(), testRequest(TaskInsertionSort), fixedClock(testNow))
		if held == nil {
			t.Fatal("initial active-bound lease = nil")
		}
		result := make(chan admissionResult, 1)
		go acquireInto(result, admission, context.Background(), testRequest(TaskBinarySearch), fixedClock(testNow))
		waitForPending(t, admission, 1)
		admission.mu.Lock()
		activeTotal := admission.activeTotal
		admission.mu.Unlock()
		if activeTotal != 1 {
			t.Fatalf("active total = %d, want hard bound 1", activeTotal)
		}
		held.Release()
		queued := <-result
		if queued.lease == nil || queued.decision.State != AdmissionAdmitted {
			t.Fatalf("aggregate active waiter = %#v, want admission after release", queued.decision)
		}
		queued.lease.Release()
	})

	t.Run("pending", func(t *testing.T) {
		policy := testPolicy(t)
		limits := testAdmissionLimits()
		limits.MaxTotalPending = 1
		admission := mustAdmission(t, policy, limits, testReadiness(policy, testNow, time.Minute), testNow)
		_, heldInsertion := admission.Acquire(context.Background(), testRequest(TaskInsertionSort), fixedClock(testNow))
		_, heldBinary := admission.Acquire(context.Background(), testRequest(TaskBinarySearch), fixedClock(testNow))
		if heldInsertion == nil || heldBinary == nil {
			t.Fatal("failed to reserve independent capacities")
		}
		ctx, cancel := context.WithCancel(context.Background())
		result := make(chan admissionResult, 1)
		go acquireInto(result, admission, ctx, testRequest(TaskInsertionSort), fixedClock(testNow))
		waitForPending(t, admission, 1)
		full, lease := admission.Acquire(context.Background(), testRequest(TaskBinarySearch), fixedClock(testNow))
		if lease != nil || full.State != AdmissionFallback || full.Reason != AdmissionReasonQueueFull {
			t.Fatalf("Acquire(aggregate pending full) = %#v/%#v", full, lease)
		}
		cancel()
		if cancelled := <-result; cancelled.decision.Reason != AdmissionReasonCancelled {
			t.Fatalf("pending cleanup = %#v", cancelled.decision)
		}
		heldInsertion.Release()
		heldBinary.Release()
	})
}

func TestAdmissionReservesSharedCapacityForOldestEligibleTickets(t *testing.T) {
	t.Run("binding aggregate capacity", func(t *testing.T) {
		policy := testPolicy(t)
		limits := testAdmissionLimits()
		limits.MaxTotalActive = 1
		admission := mustAdmission(t, policy, limits, testReadiness(policy, testNow, time.Minute), testNow)
		olderRequest := testRequest(TaskInsertionSort)
		laterRequest := testRequest(TaskBinarySearch)

		admission.mu.Lock()
		older := admission.enqueueLocked(
			olderRequest, admission.queueCandidatesLocked(olderRequest.Task, testNow), testNow, AdmissionDecision{},
		)
		later := admission.enqueueLocked(
			laterRequest, admission.queueCandidatesLocked(laterRequest.Task, testNow), testNow, AdmissionDecision{},
		)
		for name, ticket := range map[string]*admissionTicket{"later waiter": later, "new request": nil} {
			decision, waitable, lease := admission.attemptLocked(laterRequest, ticket, testNow)
			if lease != nil || !waitable || decision.State != AdmissionFallback ||
				decision.Reason != AdmissionReasonSaturated {
				admission.mu.Unlock()
				t.Fatalf("%s crossed oldest eligible ticket: %#v/%#v/%t", name, decision, lease, waitable)
			}
		}
		decision, waitable, lease := admission.attemptLocked(olderRequest, older, testNow)
		if lease == nil || waitable || decision.State != AdmissionAdmitted {
			admission.mu.Unlock()
			t.Fatalf("oldest eligible attempt = %#v/%#v/%t", decision, lease, waitable)
		}
		admission.removeTicketLocked(older)
		admission.removeTicketLocked(later)
		admission.mu.Unlock()
		lease.Release()
	})

	t.Run("spare aggregate capacity", func(t *testing.T) {
		policy := testPolicy(t)
		limits := testAdmissionLimits()
		limits.MaxTotalActive = 2
		admission := mustAdmission(t, policy, limits, testReadiness(policy, testNow, time.Minute), testNow)
		olderRequest := testRequest(TaskInsertionSort)
		admission.mu.Lock()
		older := admission.enqueueLocked(
			olderRequest, admission.queueCandidatesLocked(olderRequest.Task, testNow), testNow, AdmissionDecision{},
		)
		admission.mu.Unlock()

		decision, lease := admission.Acquire(
			context.Background(), testRequest(TaskBinarySearch), fixedClock(testNow),
		)
		if lease == nil || decision.State != AdmissionAdmitted {
			t.Fatalf("unrelated spare-capacity admission = %#v/%#v", decision, lease)
		}
		lease.Release()
		admission.mu.Lock()
		admission.removeTicketLocked(older)
		admission.mu.Unlock()
	})
}

func TestAdmissionSharedCapacityCountsUsableOlderSlotsOnly(t *testing.T) {
	t.Run("multiple same-specialist slots", func(t *testing.T) {
		policy := testPolicy(t)
		limits := testAdmissionLimits()
		limits.MaxConcurrencyPerSpecialist = 2
		limits.MaxTotalActive = 2
		admission := mustAdmission(t, policy, limits, testReadiness(policy, testNow, time.Minute), testNow)
		request := testRequest(TaskInsertionSort)
		admission.mu.Lock()
		first := admission.enqueueLocked(
			request, admission.queueCandidatesLocked(request.Task, testNow), testNow, AdmissionDecision{},
		)
		second := admission.enqueueLocked(
			request, admission.queueCandidatesLocked(request.Task, testNow), testNow, AdmissionDecision{},
		)
		decision, waitable, lease := admission.attemptLocked(testRequest(TaskBinarySearch), nil, testNow)
		admission.removeTicketLocked(first)
		admission.removeTicketLocked(second)
		admission.mu.Unlock()
		if lease != nil || !waitable || decision.Reason != AdmissionReasonSaturated {
			t.Fatalf("new route crossed two usable older slots: %#v/%#v/%t", decision, lease, waitable)
		}
	})

	t.Run("expired older ticket", func(t *testing.T) {
		policy := testPolicy(t)
		limits := testAdmissionLimits()
		limits.MaxTotalActive = 1
		admission := mustAdmission(t, policy, limits, testReadiness(policy, testNow, time.Minute), testNow)
		expired := testRequest(TaskInsertionSort)
		expired.Deadline = testNow
		admission.mu.Lock()
		ticket := admission.enqueueLocked(
			expired, admission.queueCandidatesLocked(expired.Task, testNow.Add(-time.Millisecond)), testNow.Add(-time.Millisecond), AdmissionDecision{},
		)
		decision, _, lease := admission.attemptLocked(testRequest(TaskBinarySearch), nil, testNow)
		admission.removeTicketLocked(ticket)
		admission.mu.Unlock()
		if lease == nil || decision.State != AdmissionAdmitted {
			t.Fatalf("expired older ticket reserved shared capacity: %#v/%#v", decision, lease)
		}
		lease.Release()
	})
}

func TestAdmissionMatchesOverlappingOlderCandidatesBeforeUsingSharedCapacity(t *testing.T) {
	routes := append(testRoutes(), Route{Task: TaskInsertionSort, SpecialistID: "aaa-flexible-insertion"})
	policy, err := NewPolicy(testLimits(), routes)
	if err != nil {
		t.Fatal(err)
	}
	limits := testAdmissionLimits()
	limits.MaxTotalActive = 2
	admission := mustAdmission(t, policy, limits, testReadiness(policy, testNow, time.Minute), testNow)
	insertion := testRequest(TaskInsertionSort)
	binary := testRequest(TaskBinarySearch)

	admission.mu.Lock()
	first := admission.enqueueLocked(
		insertion, admission.queueCandidatesLocked(insertion.Task, testNow), testNow, AdmissionDecision{},
	)
	second := admission.enqueueLocked(
		insertion, admission.queueCandidatesLocked(insertion.Task, testNow), testNow, AdmissionDecision{},
	)
	blocked, waitable, crossed := admission.attemptLocked(binary, nil, testNow)
	firstDecision, firstWaitable, firstLease := admission.attemptLocked(insertion, first, testNow)
	admission.removeTicketLocked(first)
	secondDecision, secondWaitable, secondLease := admission.attemptLocked(insertion, second, testNow)
	admission.removeTicketLocked(second)
	admission.mu.Unlock()
	if crossed != nil {
		crossed.Release()
	}
	if firstLease != nil {
		firstLease.Release()
	}
	if secondLease != nil {
		secondLease.Release()
	}
	if crossed != nil || !waitable || blocked.State != AdmissionFallback ||
		blocked.Reason != AdmissionReasonSaturated {
		t.Fatalf("unrelated route crossed two matchable older tickets: %#v/%#v/%t", blocked, crossed, waitable)
	}
	if firstLease == nil || firstWaitable || firstDecision.State != AdmissionAdmitted {
		t.Fatalf("first flexible ticket = %#v/%#v/%t", firstDecision, firstLease, firstWaitable)
	}
	if secondLease == nil || secondWaitable || secondDecision.State != AdmissionAdmitted ||
		secondDecision.SpecialistID == firstDecision.SpecialistID {
		t.Fatalf("second flexible ticket did not use remaining route: %#v/%#v/%t", secondDecision, secondLease, secondWaitable)
	}
}

func TestAdmissionReassignsAnOlderFlexibleTicketToProtectAConstrainedTicket(t *testing.T) {
	const alternateID = "aaa-flexible-insertion"
	const primaryID = "exact-" + string(TaskInsertionSort)
	routes := append(testRoutes(), Route{Task: TaskInsertionSort, SpecialistID: alternateID})
	policy, err := NewPolicy(testLimits(), routes)
	if err != nil {
		t.Fatal(err)
	}
	limits := testAdmissionLimits()
	limits.MaxTotalActive = 2
	admission := mustAdmission(t, policy, limits, testReadiness(policy, testNow, time.Minute), testNow)
	insertion := testRequest(TaskInsertionSort)

	admission.mu.Lock()
	first := admission.enqueueLocked(
		insertion, admission.queueCandidatesLocked(insertion.Task, testNow), testNow, AdmissionDecision{},
	)
	second := admission.enqueueLocked(
		insertion, admission.queueCandidatesLocked(insertion.Task, testNow), testNow, AdmissionDecision{},
	)
	second.exhausted[primaryID] = true
	blocked, waitable, lease := admission.attemptLocked(testRequest(TaskBinarySearch), nil, testNow)
	firstDecision, firstWaitable, firstLease := admission.attemptLocked(insertion, first, testNow)
	admission.removeTicketLocked(first)
	secondDecision, secondWaitable, secondLease := admission.attemptLocked(insertion, second, testNow)
	admission.removeTicketLocked(second)
	admission.mu.Unlock()
	if lease != nil {
		lease.Release()
	}
	if firstLease != nil {
		firstLease.Release()
	}
	if secondLease != nil {
		secondLease.Release()
	}
	if lease != nil || !waitable || blocked.Reason != AdmissionReasonSaturated {
		t.Fatalf("unrelated route crossed a maximum older-ticket matching: %#v/%#v/%t", blocked, lease, waitable)
	}
	if firstLease == nil || firstWaitable || firstDecision.State != AdmissionAdmitted ||
		firstDecision.SpecialistID != primaryID {
		t.Fatalf("first flexible ticket did not preserve the constrained route: %#v/%#v/%t", firstDecision, firstLease, firstWaitable)
	}
	if secondLease == nil || secondWaitable || secondDecision.State != AdmissionAdmitted ||
		secondDecision.SpecialistID != alternateID {
		t.Fatalf("second constrained ticket did not use its sole route: %#v/%#v/%t", secondDecision, secondLease, secondWaitable)
	}
}

func assertExpiredNotification(t *testing.T, admission *Admission, result admissionResult) {
	t.Helper()
	if result.lease != nil || result.decision.State != AdmissionFallback ||
		result.decision.Reason != AdmissionReasonWaitExpired || result.decision.Attempts != 1 {
		t.Fatalf("notification after MaxWait = %#v, want first-attempt wait-expired fallback", result.decision)
	}
	admission.mu.Lock()
	defer admission.mu.Unlock()
	if len(admission.pending) != 0 {
		t.Fatalf("notification after MaxWait leaked %d queue ticket(s)", len(admission.pending))
	}
}

func TestAdmissionBoundsQueueDepthPerSpecialist(t *testing.T) {
	t.Parallel()
	policy := testPolicy(t)
	limits := testAdmissionLimits()
	limits.MaxQueueDepth = 1
	admission := mustAdmission(t, policy, limits, testReadiness(policy, testNow, time.Minute), testNow)
	insertion := testRequest(TaskInsertionSort)
	binary := testRequest(TaskBinarySearch)
	_, heldInsertion := admission.Acquire(context.Background(), insertion, fixedClock(testNow))
	_, heldBinary := admission.Acquire(context.Background(), binary, fixedClock(testNow))
	if heldInsertion == nil || heldBinary == nil {
		t.Fatal("failed to reserve independent specialist capacities")
	}
	defer heldInsertion.Release()
	defer heldBinary.Release()

	insertionContext, cancelInsertion := context.WithCancel(context.Background())
	binaryContext, cancelBinary := context.WithCancel(context.Background())
	insertionResult := make(chan admissionResult, 1)
	binaryResult := make(chan admissionResult, 1)
	go acquireInto(insertionResult, admission, insertionContext, insertion, fixedClock(testNow))
	waitForPending(t, admission, 1)
	go acquireInto(binaryResult, admission, binaryContext, binary, fixedClock(testNow))
	waitForPending(t, admission, 2)

	full, fullLease := admission.Acquire(context.Background(), insertion, fixedClock(testNow))
	if fullLease != nil || full.State != AdmissionFallback || full.Reason != AdmissionReasonQueueFull {
		t.Fatalf("second insertion waiter = %#v, want per-specialist queue-full fallback", full)
	}
	cancelInsertion()
	cancelBinary()
	if (<-insertionResult).decision.Reason != AdmissionReasonCancelled ||
		(<-binaryResult).decision.Reason != AdmissionReasonCancelled {
		t.Fatal("cancelled per-specialist waiters did not terminate explicitly")
	}
}

func TestAdmissionReservationNeverOversubscribesUnderRace(t *testing.T) {
	policy := testPolicy(t)
	at := time.Now()
	limits := testAdmissionLimits()
	limits.MaxQueueDepth = 64
	limits.MaxWait = 2 * time.Second
	limits.MaxRetries = 128
	admission := mustAdmission(t, policy, limits, testReadiness(policy, at, 5*time.Second), at)
	request := testRequest(TaskInsertionSort)
	request.IssuedAt = at.Add(-time.Second)
	request.Deadline = at.Add(2 * time.Second)
	var active atomic.Int64
	var maximum atomic.Int64
	var admitted atomic.Int64
	var wait sync.WaitGroup
	for range 32 {
		wait.Add(1)
		go func() {
			defer wait.Done()
			decision, lease := admission.Acquire(context.Background(), request, time.Now)
			if lease == nil {
				return
			}
			if decision.State != AdmissionAdmitted {
				t.Errorf("lease paired with non-admission: %#v", decision)
			}
			admitted.Add(1)
			current := active.Add(1)
			const maximumCasAttempts = 1000
			var recorded bool
			for attempt := 0; attempt < maximumCasAttempts; attempt++ {
				observed := maximum.Load()
				if current <= observed || maximum.CompareAndSwap(observed, current) {
					recorded = true
					break
				}
			}
			if !recorded {
				t.Errorf("CAS active maximum exceeded %d attempts", maximumCasAttempts)
			}
			time.Sleep(time.Millisecond)
			active.Add(-1)
			lease.Release()
			lease.Release()
		}()
	}
	wait.Wait()
	if admitted.Load() != 32 || maximum.Load() != 1 || active.Load() != 0 {
		t.Fatalf("race admissions/max/active = %d/%d/%d, want 32/1/0", admitted.Load(), maximum.Load(), active.Load())
	}
	admission.mu.Lock()
	defer admission.mu.Unlock()
	if admission.active["exact-"+string(TaskInsertionSort)] != 0 || len(admission.pending) != 0 {
		t.Fatalf("admission leaked capacity or tickets: active=%v pending=%d", admission.active, len(admission.pending))
	}
}

func TestRunnerRevalidatesReadinessImmediatelyBeforeSpecialistEffect(t *testing.T) {
	t.Parallel()
	policy := testPolicy(t)
	admission := testAdmission(t, policy, testNow)
	targetID := "exact-" + string(TaskInsertionSort)
	invoked := false
	specialists := testSpecialists(policy)
	specialists[targetID] = specialistFunc(func(context.Context, Invocation) (SpecialistResult, error) {
		invoked = true
		return SpecialistResult{}, nil
	})
	var recorded []Decision
	runner, err := NewRunner(
		policy,
		admission,
		recorderFunc(func(_ context.Context, decision Decision) error {
			recorded = append(recorded, decision)
			if len(recorded) == 1 {
				if decision.Admission.State != AdmissionAdmitted {
					t.Fatalf("initial recorded admission = %#v", decision.Admission)
				}
				return admission.Observe(testNow, ReadinessObservation{
					SpecialistID: targetID, State: ReadinessFailed,
					ObservedAt: testNow, ValidFor: time.Minute,
					Fits: []RequestFit{{Task: TaskInsertionSort, State: FitTaskCompatible}},
				})
			}
			return nil
		}),
		specialists,
		verifierFunc(func(context.Context, Invocation, Candidate) (Verification, error) {
			t.Fatal("verifier ran after readiness failed")
			return Verification{}, nil
		}),
		fixedClock(testNow),
	)
	if err != nil {
		t.Fatal(err)
	}
	run, runErr := runner.Run(context.Background(), testRequest(TaskInsertionSort))
	if runErr != nil || invoked || run.Admission.State != AdmissionFallback ||
		run.Admission.Reason != AdmissionReasonFailed || run.Outcome.Reason != ReasonFallback ||
		len(recorded) != 2 || recorded[1] != run.Decision || recorded[1].State != DecisionAbstain ||
		recorded[1].Admission.Reason != AdmissionReasonFailed {
		t.Fatalf("Run(revalidated failure) = %#v, %v, recorded=%#v invoked=%t", run, runErr, recorded, invoked)
	}
}

func TestRunnerDoesNotInvokeAcrossMeasuredFitObservationChange(t *testing.T) {
	t.Parallel()
	policy := testPolicy(t)
	observations := testReadiness(policy, testNow, time.Minute)
	targetID := "exact-" + string(TaskInsertionSort)
	targetIndex := readinessIndex(t, observations, targetID)
	target := &observations[targetIndex]
	target.Fits[0] = RequestFit{
		Task: TaskInsertionSort, State: FitMeasured, MeasurementBasis: "fit-probe:v1",
		MeasuredAt: target.ObservedAt, MeasurementValidFor: time.Minute,
	}
	admission := mustAdmission(t, policy, testAdmissionLimits(), observations, testNow)
	invoked := false
	specialists := testSpecialists(policy)
	specialists[targetID] = specialistFunc(func(context.Context, Invocation) (SpecialistResult, error) {
		invoked = true
		return SpecialistResult{}, nil
	})
	var recorded []Decision
	runner, err := NewRunner(
		policy,
		admission,
		recorderFunc(func(_ context.Context, decision Decision) error {
			recorded = append(recorded, decision)
			if len(recorded) != 1 {
				return nil
			}
			updated := observations[targetIndex]
			updated.ObservedAt = testNow
			updated.Fits = []RequestFit{{
				Task: TaskInsertionSort, State: FitMeasured, MeasurementBasis: "fit-probe:v2",
				MeasuredAt: testNow, MeasurementValidFor: time.Minute,
			}}
			return admission.Observe(testNow, updated)
		}),
		specialists,
		verifierFunc(func(context.Context, Invocation, Candidate) (Verification, error) {
			t.Fatal("verifier ran after measured-fit evidence changed")
			return Verification{}, nil
		}),
		fixedClock(testNow),
	)
	if err != nil {
		t.Fatal(err)
	}
	run, runErr := runner.Run(context.Background(), testRequest(TaskInsertionSort))
	if runErr != nil || invoked || run.Admission.State != AdmissionFallback ||
		run.Admission.Reason != AdmissionReasonObservationChanged ||
		run.Admission.FitMeasurementBasis != "fit-probe:v2" || run.Outcome.Reason != ReasonFallback ||
		len(recorded) != 2 || recorded[0].Admission.FitMeasurementBasis != "fit-probe:v1" ||
		recorded[1] != run.Decision || recorded[1].State != DecisionAbstain {
		t.Fatalf("Run(changed measured fit) = %#v, %v, recorded=%#v invoked=%t", run, runErr, recorded, invoked)
	}
}

func TestRunnerDoesNotInvokeWhenTerminalAdmissionRecordFails(t *testing.T) {
	t.Parallel()
	policy := testPolicy(t)
	admission := testAdmission(t, policy, testNow)
	targetID := "exact-" + string(TaskInsertionSort)
	invoked := false
	specialists := testSpecialists(policy)
	specialists[targetID] = specialistFunc(func(context.Context, Invocation) (SpecialistResult, error) {
		invoked = true
		return SpecialistResult{}, nil
	})
	records := 0
	terminalRecordErr := errors.New("terminal recorder unavailable")
	runner, err := NewRunner(
		policy,
		admission,
		recorderFunc(func(_ context.Context, decision Decision) error {
			records++
			if records == 1 {
				return admission.Observe(testNow, ReadinessObservation{
					SpecialistID: targetID, State: ReadinessFailed,
					ObservedAt: testNow, ValidFor: time.Minute,
					Fits: []RequestFit{{Task: TaskInsertionSort, State: FitTaskCompatible}},
				})
			}
			if decision.State != DecisionAbstain || decision.Admission.Reason != AdmissionReasonFailed {
				t.Fatalf("terminal record = %#v, want failed-readiness fallback", decision)
			}
			return terminalRecordErr
		}),
		specialists,
		verifierFunc(func(context.Context, Invocation, Candidate) (Verification, error) {
			t.Fatal("verifier ran after terminal recorder failure")
			return Verification{}, nil
		}),
		fixedClock(testNow),
	)
	if err != nil {
		t.Fatal(err)
	}
	run, runErr := runner.Run(context.Background(), testRequest(TaskInsertionSort))
	if !errors.Is(runErr, terminalRecordErr) ||
		invoked || records != 2 || run.Decision.State != DecisionAbstain ||
		run.Admission.Reason != AdmissionReasonFailed {
		t.Fatalf("Run(terminal recorder failure) = %#v, %v, invoked=%t records=%d", run, runErr, invoked, records)
	}
}

func TestRunnerRecordsAdmissionFallbackWithoutRunningOrReturningSpecialistOutput(t *testing.T) {
	t.Parallel()
	policy := testPolicy(t)
	observations := testReadiness(policy, testNow, time.Minute)
	targetID := "exact-" + string(TaskInsertionSort)
	targetIndex := readinessIndex(t, observations, targetID)
	observations[targetIndex].Fits[0].State = FitUnknown
	admission := mustAdmission(t, policy, testAdmissionLimits(), observations, testNow)
	invoked := false
	specialists := testSpecialists(policy)
	specialists[targetID] = specialistFunc(func(context.Context, Invocation) (SpecialistResult, error) {
		invoked = true
		return SpecialistResult{State: ResultCompleted, Payload: []byte("must-not-escape")}, nil
	})
	recorded := Decision{}
	runner, err := NewRunner(
		policy,
		admission,
		recorderFunc(func(_ context.Context, decision Decision) error {
			recorded = decision
			return nil
		}),
		specialists,
		verifierFunc(func(context.Context, Invocation, Candidate) (Verification, error) {
			t.Fatal("verifier ran for admission fallback")
			return Verification{}, nil
		}),
		fixedClock(testNow),
	)
	if err != nil {
		t.Fatal(err)
	}
	run, runErr := runner.Run(context.Background(), testRequest(TaskInsertionSort))
	if runErr != nil || invoked || recorded.State != DecisionAbstain || recorded.Reason != ReasonFallback ||
		recorded.Admission.Reason != AdmissionReasonFitUnknown || run.Admission != recorded.Admission ||
		run.Outcome.State != OutcomeAbstained || len(run.Outcome.Payload) != 0 {
		t.Fatalf("Run(fallback) = %#v, %v, recorded=%#v invoked=%t", run, runErr, recorded, invoked)
	}
}

type admissionResult struct {
	decision AdmissionDecision
	lease    *AdmissionLease
}

func acquireInto(output chan<- admissionResult, admission *Admission, ctx context.Context, request Request, now func() time.Time) {
	decision, lease := admission.Acquire(ctx, request, now)
	output <- admissionResult{decision: decision, lease: lease}
}

func testAdmissionLimits() AdmissionLimits {
	return AdmissionLimits{
		MaxObservationValidity:      time.Minute,
		MaxQueueDepth:               8,
		MaxWait:                     250 * time.Millisecond,
		MaxRetries:                  4,
		MaxConcurrencyPerSpecialist: 1,
		MaxTotalPending:             48,
		MaxTotalActive:              6,
	}
}

func testReadiness(policy Policy, at time.Time, validFor time.Duration) []ReadinessObservation {
	observations := make([]ReadinessObservation, 0, len(policy.specialistIDs()))
	for task, specialistIDs := range policy.routes {
		for _, specialistID := range specialistIDs {
			observations = append(observations, ReadinessObservation{
				SpecialistID: specialistID, State: ReadinessReady,
				ObservedAt: at.Add(-time.Millisecond), ValidFor: validFor,
				Fits: []RequestFit{{Task: task, State: FitTaskCompatible}},
			})
		}
	}
	return observations
}

func mustAdmission(t *testing.T, policy Policy, limits AdmissionLimits, observations []ReadinessObservation, at time.Time) *Admission {
	t.Helper()
	admission, err := NewAdmission(policy, limits, observations, at)
	if err != nil {
		t.Fatalf("NewAdmission() error = %v", err)
	}
	return admission
}

func fixedClock(at time.Time) func() time.Time {
	return func() time.Time { return at }
}

func readinessIndex(t *testing.T, observations []ReadinessObservation, specialistID string) int {
	t.Helper()
	for index := range observations {
		if observations[index].SpecialistID == specialistID {
			return index
		}
	}
	t.Fatalf("readiness observation missing for %s", specialistID)
	return -1
}

func waitForPending(t *testing.T, admission *Admission, want int) {
	t.Helper()
	deadline := time.Now().Add(time.Second)
	for time.Now().Before(deadline) {
		admission.mu.Lock()
		count := len(admission.pending)
		admission.mu.Unlock()
		if count == want {
			return
		}
		time.Sleep(time.Millisecond)
	}
	t.Fatalf("pending admission count did not reach %d", want)
}

func waitForRetries(t *testing.T, admission *Admission, want int) {
	t.Helper()
	deadline := time.Now().Add(time.Second)
	for time.Now().Before(deadline) {
		admission.mu.Lock()
		retries := -1
		if len(admission.pending) == 1 {
			retries = admission.pending[0].retries
		}
		admission.mu.Unlock()
		if retries == want {
			return
		}
		time.Sleep(time.Millisecond)
	}
	t.Fatalf("queued admission retries did not reach %d", want)
}

func waitForCandidateExhaustion(t *testing.T, admission *Admission, specialistID string) {
	t.Helper()
	deadline := time.Now().Add(time.Second)
	for time.Now().Before(deadline) {
		admission.mu.Lock()
		exhausted := len(admission.pending) == 1 && admission.pending[0].exhausted[specialistID]
		admission.mu.Unlock()
		if exhausted {
			return
		}
		time.Sleep(time.Millisecond)
	}
	t.Fatalf("queued admission candidate %s did not exhaust independently", specialistID)
}

func waitForCandidateVersion(t *testing.T, admission *Admission, specialistID string, want uint64) {
	t.Helper()
	deadline := time.Now().Add(time.Second)
	for time.Now().Before(deadline) {
		admission.mu.Lock()
		version, retries := uint64(0), -1
		if len(admission.pending) == 1 {
			version = admission.pending[0].candidateStates[specialistID].observationVersion
			retries = admission.pending[0].candidateRetries[specialistID]
		}
		admission.mu.Unlock()
		if version >= want {
			if retries != 0 {
				t.Fatalf("ready candidate retries at version %d = %d, want 0", version, retries)
			}
			return
		}
		time.Sleep(time.Millisecond)
	}
	t.Fatalf("queued candidate %s version did not reach %d", specialistID, want)
}

func assertClockNotSampled(t *testing.T, called <-chan struct{}) {
	t.Helper()
	select {
	case <-called:
		t.Error("admission clock was sampled before the serialised state became available")
	case <-time.After(20 * time.Millisecond):
	}
}
