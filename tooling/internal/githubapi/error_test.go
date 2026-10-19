package githubapi

import (
	"context"
	"errors"
	"io"
	"net/http"
	"strings"
	"testing"
	"time"
)

type faultyReadCloser struct {
	readErr  error
	closeErr error
}

func (f *faultyReadCloser) Read(_ []byte) (int, error) {
	if f.readErr != nil {
		return 0, f.readErr
	}
	return 0, io.EOF
}

func (f *faultyReadCloser) Close() error {
	return f.closeErr
}

func TestReadRetryClientRejectsNilClient(t *testing.T) {
	client := NewReadRetryClient(nil)
	request, err := http.NewRequestWithContext(context.Background(), http.MethodGet, "https://api.github.com", nil)
	if err != nil {
		t.Fatalf("NewRequestWithContext() error = %v", err)
	}
	_, err = client.Do(request)
	if err == nil || !strings.Contains(err.Error(), "nil HTTP client") {
		t.Fatalf("expected nil HTTP client error, got %v", err)
	}
}

func TestReadRetryClientRejectsNilWaiter(t *testing.T) {
	client := newReadRetryClient(doFunc(func(*http.Request) (*http.Response, error) {
		return nil, nil
	}), nil)
	request, err := http.NewRequestWithContext(context.Background(), http.MethodGet, "https://api.github.com", nil)
	if err != nil {
		t.Fatalf("NewRequestWithContext() error = %v", err)
	}
	_, err = client.Do(request)
	if err == nil || !strings.Contains(err.Error(), "nil retry waiter") {
		t.Fatalf("expected nil retry waiter error, got %v", err)
	}
}

func TestReadRetryClientRetriesPastIntermediateDrainError(t *testing.T) {
	injectedErr := errors.New("injected drain failure")
	calls := 0
	underlying := doFunc(func(*http.Request) (*http.Response, error) {
		calls++
		if calls == 1 {
			return response(http.StatusServiceUnavailable, &faultyReadCloser{readErr: injectedErr}), nil
		}
		return response(http.StatusOK, io.NopCloser(strings.NewReader("ok"))), nil
	})
	client := newReadRetryClient(underlying, func(_ context.Context, _ time.Duration) error {
		return nil
	})
	request, err := http.NewRequestWithContext(context.Background(), http.MethodGet, "https://api.github.com", nil)
	if err != nil {
		t.Fatalf("NewRequestWithContext() error = %v", err)
	}
	got, err := client.Do(request)
	if err != nil || got.StatusCode != http.StatusOK || calls != 2 {
		t.Fatalf("drain failure stopped the retry: status=%v err=%v calls=%d", got, err, calls)
	}
}

func TestReadRetryClientJoinsIntermediateErrorsIntoFinalFailure(t *testing.T) {
	drainErr := errors.New("injected drain failure")
	closeErr := errors.New("injected close failure")
	transportErr := errors.New("injected transport failure")
	calls := 0
	underlying := doFunc(func(*http.Request) (*http.Response, error) {
		calls++
		switch calls {
		case 1:
			return response(http.StatusInternalServerError, &faultyReadCloser{readErr: drainErr}), nil
		case 2:
			return response(http.StatusInternalServerError, &faultyReadCloser{closeErr: closeErr}), nil
		default:
			return nil, transportErr
		}
	})
	client := newReadRetryClient(underlying, func(_ context.Context, _ time.Duration) error {
		return nil
	})
	request, err := http.NewRequestWithContext(context.Background(), http.MethodGet, "https://api.github.com", nil)
	if err != nil {
		t.Fatalf("NewRequestWithContext() error = %v", err)
	}
	_, err = client.Do(request)
	for _, want := range []error{transportErr, drainErr, closeErr} {
		if !errors.Is(err, want) {
			t.Fatalf("final error %v does not carry %v", err, want)
		}
	}
	if !strings.Contains(err.Error(), "drain intermediate response") || !strings.Contains(err.Error(), "close intermediate response") {
		t.Fatalf("final error lacks intermediate context: %v", err)
	}
}
