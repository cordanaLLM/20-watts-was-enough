package clrsrunner

import (
	"context"
	"errors"
	"io"
	"testing"
	"time"
)

type errorCloserReader struct {
	io.Reader
	closeErr error
}

func (e errorCloserReader) Close() error {
	return e.closeErr
}

func TestReadRequestContextJoinsCloserErrorOnContextDone(t *testing.T) {
	t.Parallel()
	customCloseErr := errors.New("simulated closer failure")
	pr, pw := io.Pipe()
	defer pw.Close()

	reader := errorCloserReader{
		Reader:   pr,
		closeErr: customCloseErr,
	}

	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Millisecond)
	defer cancel()

	_, err := readRequestContext(ctx, reader)
	if err == nil {
		t.Fatal("expected error from readRequestContext, got nil")
	}
	if !errors.Is(err, customCloseErr) {
		t.Fatalf("expected error to join customCloseErr, got %v", err)
	}
}
