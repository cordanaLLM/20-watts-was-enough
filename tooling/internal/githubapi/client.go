// Package githubapi provides the bounded HTTP behavior shared by GitHub API
// commands.
package githubapi

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"time"
)

const (
	maximumAttempts       = 3
	maximumRetryDrainSize = 32 << 10
	firstRetryDelay       = 100 * time.Millisecond
	secondRetryDelay      = 300 * time.Millisecond
)

// HTTPClient is the smallest transport surface required by GitHub API calls.
type HTTPClient interface {
	Do(*http.Request) (*http.Response, error)
}

type waitFunc func(context.Context, time.Duration) error

type readRetryClient struct {
	client HTTPClient
	wait   waitFunc
}

// NewReadRetryClient adds bounded transient retries to bodyless GET requests.
// Requests with a body and mutation methods always pass through exactly once.
func NewReadRetryClient(client HTTPClient) HTTPClient {
	return newReadRetryClient(client, waitForRetry)
}

func newReadRetryClient(client HTTPClient, wait waitFunc) HTTPClient {
	return &readRetryClient{client: client, wait: wait}
}

func (client *readRetryClient) Do(request *http.Request) (*http.Response, error) {
	if client == nil || client.client == nil {
		return nil, errors.New("githubapi: nil HTTP client")
	}
	if client.wait == nil {
		return nil, errors.New("githubapi: nil retry waiter")
	}
	if !isRetryableRead(request) {
		return client.client.Do(request)
	}

	// A failed drain does not stop the retry; it joins the error if no
	// later attempt answers.
	var drainErr error
	for attempt := 0; attempt < maximumAttempts; attempt++ {
		if err := request.Context().Err(); err != nil {
			return nil, errors.Join(err, drainErr)
		}

		response, err := client.client.Do(request)
		if !isRetryable(response, err) || attempt == maximumAttempts-1 {
			if err != nil {
				err = errors.Join(err, drainErr)
			}
			return response, err
		}

		drainErr = errors.Join(drainErr, discardIntermediateResponse(response))
		if err := client.wait(request.Context(), retryDelay(attempt)); err != nil {
			return nil, errors.Join(err, drainErr)
		}
	}

	return nil, errors.Join(errors.New("githubapi: retry attempts exhausted"), drainErr)
}

func isRetryableRead(request *http.Request) bool {
	if request == nil || (request.Method != "" && request.Method != http.MethodGet) {
		return false
	}
	return request.Body == nil || request.Body == http.NoBody
}

func isRetryable(response *http.Response, err error) bool {
	if err != nil {
		// A non-nil response paired with an error is a client-policy failure
		// (for example, CheckRedirect), not a transient transport failure.
		return response == nil
	}
	if response == nil {
		return false
	}
	switch response.StatusCode {
	case http.StatusInternalServerError,
		http.StatusBadGateway,
		http.StatusServiceUnavailable,
		http.StatusGatewayTimeout:
		return true
	default:
		return false
	}
}

func retryDelay(attempt int) time.Duration {
	if attempt == 0 {
		return firstRetryDelay
	}
	return secondRetryDelay
}

func discardIntermediateResponse(response *http.Response) error {
	if response == nil || response.Body == nil {
		return nil
	}
	var drainErr error
	if _, err := io.Copy(io.Discard, io.LimitReader(response.Body, maximumRetryDrainSize)); err != nil {
		drainErr = fmt.Errorf("drain intermediate response: %w", err)
	}
	if err := response.Body.Close(); err != nil {
		drainErr = errors.Join(drainErr, fmt.Errorf("close intermediate response: %w", err))
	}
	return drainErr
}

func waitForRetry(ctx context.Context, delay time.Duration) error {
	timer := time.NewTimer(delay)
	defer timer.Stop()
	select {
	case <-timer.C:
		return nil
	case <-ctx.Done():
		return ctx.Err()
	}
}
