package publictransport

import (
	"context"
	"errors"
	"io"
	"net/http"
	"strings"
	"testing"
)

type customTestRoundTripper func(*http.Request) (*http.Response, error)

func (tripper customTestRoundTripper) RoundTrip(req *http.Request) (*http.Response, error) {
	return tripper(req)
}

type faultyBody struct {
	readErr  error
	closeErr error
}

func (body *faultyBody) Read(p []byte) (int, error) {
	if body.readErr != nil {
		return 0, body.readErr
	}
	return 0, io.EOF
}

func (body *faultyBody) Close() error {
	return body.closeErr
}

func TestRequestHeadRetainsBodyCloseFailure(t *testing.T) {
	t.Parallel()
	closeErr := errors.New("injected body close failure")
	client := &http.Client{
		Transport: customTestRoundTripper(func(req *http.Request) (*http.Response, error) {
			return &http.Response{
				StatusCode: http.StatusOK,
				Header:     make(http.Header),
				Body:       &faultyBody{closeErr: closeErr},
			}, nil
		}),
	}
	_, err := requestHead(context.Background(), client, "http://example.invalid")
	if err == nil {
		t.Fatal("requestHead succeeded; want close failure")
	}
	if !errors.Is(err, closeErr) || !strings.Contains(err.Error(), "close HEAD response") {
		t.Fatalf("requestHead error = %v; want wrapping of close error", err)
	}
}

func TestRequestHeadRetainsDrainFailureAndJoinsCloseFailure(t *testing.T) {
	t.Parallel()
	readErr := errors.New("injected body drain failure")
	closeErr := errors.New("injected body close failure")
	client := &http.Client{
		Transport: customTestRoundTripper(func(req *http.Request) (*http.Response, error) {
			return &http.Response{
				StatusCode: http.StatusOK,
				Header:     make(http.Header),
				Body:       &faultyBody{readErr: readErr, closeErr: closeErr},
			}, nil
		}),
	}
	_, err := requestHead(context.Background(), client, "http://example.invalid")
	if err == nil {
		t.Fatal("requestHead succeeded; want joined drain and close failures")
	}
	if !errors.Is(err, readErr) || !errors.Is(err, closeErr) {
		t.Fatalf("requestHead error = %v; want errors.Join with both read and close failures", err)
	}
}
