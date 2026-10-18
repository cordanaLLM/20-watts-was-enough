package clrsshakedown

import (
	"context"
	"testing"
	"time"
)

func TestRecordContextFollowsCaseDeadline(t *testing.T) {
	t.Run("positive case deadline", testRecordContextPositive)
	t.Run("boundary case deadline", testRecordContextBoundary)
	t.Run("negative past deadline", testRecordContextNegative)
	t.Run("parent cancellation detached", testRecordContextParentCancel)
}

func testRecordContextPositive(t *testing.T) {
	parent := context.Background()
	caseDeadline := time.Now().Add(time.Minute)
	ctx, cancel := recordContext(parent, caseDeadline)
	defer cancel()
	deadline, ok := ctx.Deadline()
	if !ok || !deadline.Equal(caseDeadline) {
		t.Fatalf("positive deadline %v (ok=%v), want %v", deadline, ok, caseDeadline)
	}
}

func testRecordContextBoundary(t *testing.T) {
	const epsilon = 10 * time.Millisecond
	const slack = 500 * time.Millisecond
	now := time.Now()
	ctx, cancel := recordContext(context.Background(), now)
	defer cancel()
	deadline, ok := ctx.Deadline()
	if !ok {
		t.Fatal("boundary: expected bounded context")
	}
	earliest := now.Add(recordTimeout - epsilon)
	latest := now.Add(recordTimeout + slack)
	if deadline.Before(earliest) || deadline.After(latest) {
		t.Fatalf("boundary deadline %v, want between %v and %v", deadline, earliest, latest)
	}
}

func testRecordContextNegative(t *testing.T) {
	const epsilon = 10 * time.Millisecond
	const slack = 500 * time.Millisecond
	past := time.Now().Add(-time.Minute)
	now := time.Now()
	ctx, cancel := recordContext(context.Background(), past)
	defer cancel()
	deadline, ok := ctx.Deadline()
	if !ok {
		t.Fatal("negative: expected bounded context")
	}
	if deadline.Equal(past) || deadline.Before(now) {
		t.Fatalf("negative deadline %v is in past, want floor", deadline)
	}
	earliest := now.Add(recordTimeout - epsilon)
	latest := now.Add(recordTimeout + slack)
	if deadline.Before(earliest) || deadline.After(latest) {
		t.Fatalf("negative deadline %v, want floor between %v and %v", deadline, earliest, latest)
	}
}

func testRecordContextParentCancel(t *testing.T) {
	parent, parentCancel := context.WithCancel(context.Background())
	ctx, cancel := recordContext(parent, time.Now().Add(time.Minute))
	defer cancel()
	parentCancel()
	if err := ctx.Err(); err != nil {
		t.Fatalf("record context canceled by parent: %v", err)
	}
}
