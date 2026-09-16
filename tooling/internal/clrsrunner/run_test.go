package clrsrunner

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"strings"
	"testing"
	"time"

	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/specialistcontrol"
)

func TestRunWritesOneDeterministicCompletedResponse(t *testing.T) {
	t.Parallel()
	body := requestJSON(t, validRequest(specialistCases[0]))
	var firstOut, firstErr bytes.Buffer
	if code := Run(context.Background(), nil, bytes.NewReader(body), &firstOut, &firstErr); code != 0 || firstErr.Len() != 0 {
		t.Fatalf("Run() code = %d, stderr = %q", code, firstErr.String())
	}
	var secondOut, secondErr bytes.Buffer
	if code := Run(context.Background(), nil, bytes.NewReader(body), &secondOut, &secondErr); code != 0 || secondErr.Len() != 0 {
		t.Fatalf("Run(second) code = %d, stderr = %q", code, secondErr.String())
	}
	if !bytes.Equal(firstOut.Bytes(), secondOut.Bytes()) || bytes.Count(firstOut.Bytes(), []byte{'\n'}) != 1 {
		t.Fatalf("Run() output is not one deterministic JSON line: %q / %q", firstOut.Bytes(), secondOut.Bytes())
	}
	response := decodeResponse(t, firstOut.Bytes())
	if response.State != specialistcontrol.ResultCompleted || response.Payload != specialistCases[0].want ||
		response.Build.GoVersion == "" || response.Build.OperatingSys == "" || response.Build.Architecture == "" {
		t.Fatalf("Run() response = %#v, want completed answer and build identity", response)
	}
}

func TestRunFailsClosedOnAmbiguousUnknownTrailingAndOversizedInput(t *testing.T) {
	t.Parallel()
	valid := string(requestJSON(t, validRequest(specialistCases[0])))
	tests := map[string]struct {
		body       string
		wantReason specialistcontrol.Reason
	}{
		"duplicate":         {body: strings.Replace(valid, `"schema_version":1`, `"schema_version":1,"schema_version":1`, 1), wantReason: specialistcontrol.ReasonMalformedRequest},
		"unknown field":     {body: strings.Replace(valid, `"authority":`, `"foreign":true,"authority":`, 1), wantReason: specialistcontrol.ReasonMalformedRequest},
		"case alias":        {body: strings.Replace(valid, `"authority":`, `"AUTHORITY":`, 1), wantReason: specialistcontrol.ReasonMalformedRequest},
		"conflicting alias": {body: strings.Replace(valid, `"authority":`, `"AUTHORITY":"WRONG","authority":`, 1), wantReason: specialistcontrol.ReasonMalformedRequest},
		"null task":         {body: strings.Replace(valid, `"task":"insertion_sort"`, `"task":null`, 1), wantReason: specialistcontrol.ReasonMalformedRequest},
		"trailing":          {body: valid + `{}`, wantReason: specialistcontrol.ReasonMalformedRequest},
		"oversized":         {body: strings.Repeat(" ", MaximumEnvelopeBytes+1), wantReason: specialistcontrol.ReasonOversizedRequest},
	}
	for name, test := range tests {
		name, test := name, test
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			var stdout, stderr bytes.Buffer
			code := Run(context.Background(), nil, strings.NewReader(test.body), &stdout, &stderr)
			response := decodeResponse(t, stdout.Bytes())
			if code != 1 || stderr.Len() == 0 || response.State != specialistcontrol.ResultRefused ||
				response.Reason != test.wantReason || response.Authority != specialistcontrol.ResultAuthority {
				t.Fatalf("Run(%s) = code %d, response %#v, stderr %q", name, code, response, stderr.String())
			}
		})
	}
}

func TestRunKeepsTypedSpecialistRefusalOnTheProtocol(t *testing.T) {
	t.Parallel()
	request := validRequest(specialistCases[0])
	request.Payload = "insertion_sort:\nkey: [0.2, 0.1]\npred:\n"
	var stdout, stderr bytes.Buffer
	code := Run(context.Background(), nil, bytes.NewReader(requestJSON(t, request)), &stdout, &stderr)
	response := decodeResponse(t, stdout.Bytes())
	if code != 0 || stderr.Len() != 0 || response.State != specialistcontrol.ResultRefused ||
		response.Reason != specialistcontrol.ReasonSpecialistRefused || response.Payload != "" {
		t.Fatalf("Run(refusal) = code %d, response %#v, stderr %q", code, response, stderr.String())
	}
}

func TestRunBoundsAnOpenInputPipeAndReturnsTypedCancellation(t *testing.T) {
	t.Parallel()
	reader, writer := io.Pipe()
	defer writer.Close()
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Millisecond)
	defer cancel()
	var stdout, stderr bytes.Buffer
	started := time.Now()
	code := Run(ctx, nil, reader, &stdout, &stderr)
	if elapsed := time.Since(started); code != 1 || elapsed > time.Second {
		t.Fatalf("Run(open pipe) = code %d after %s, want bounded failure", code, elapsed)
	}
	response := decodeResponse(t, stdout.Bytes())
	if response.State != specialistcontrol.ResultAbstained ||
		response.Reason != specialistcontrol.ReasonDeadlineElapsed || stderr.Len() == 0 {
		t.Fatalf("Run(open pipe) = %#v, stderr %q, want deadline abstention", response, stderr.String())
	}
}

func TestCompletedRequestReadRejectsCompletionAtOrAfterInputDeadline(t *testing.T) {
	t.Parallel()
	request := validRequest(specialistCases[0])
	completed := requestRead{request: request}

	deadlineContext, cancelDeadline := context.WithDeadline(context.Background(), time.Now().Add(-time.Second))
	defer cancelDeadline()
	if accepted, err := completedRequestRead(deadlineContext, completed); !errors.Is(err, context.DeadlineExceeded) || accepted != (Request{}) {
		t.Fatalf("completedRequestRead(expired) = %#v, %v, want empty request and deadline error", accepted, err)
	}

	cancelledContext, cancel := context.WithCancel(context.Background())
	cancel()
	if accepted, err := completedRequestRead(cancelledContext, completed); !errors.Is(err, context.Canceled) || accepted != (Request{}) {
		t.Fatalf("completedRequestRead(cancelled) = %#v, %v, want empty request and cancellation", accepted, err)
	}

	accepted, err := completedRequestRead(context.Background(), completed)
	if err != nil || accepted != request {
		t.Fatalf("completedRequestRead(active) = %#v, %v, want completed request", accepted, err)
	}
}

func TestRunRejectsArgumentsAndReportsWriteFailure(t *testing.T) {
	t.Parallel()
	var stdout, stderr bytes.Buffer
	if code := Run(context.Background(), []string{"--help"}, strings.NewReader(""), &stdout, &stderr); code != 2 || stdout.Len() != 0 || !strings.Contains(stderr.String(), "Usage:") {
		t.Fatalf("Run(arguments) = code %d, stdout %q, stderr %q", code, stdout.String(), stderr.String())
	}
	stderr.Reset()
	if code := Run(context.Background(), nil, bytes.NewReader(requestJSON(t, validRequest(specialistCases[0]))), failingWriter{}, &stderr); code != 1 || !strings.Contains(stderr.String(), "Write CLRS specialist response") {
		t.Fatalf("Run(failing writer) = code %d, stderr %q", code, stderr.String())
	}
	stdout.Reset()
	stderr.Reset()
	if code := Run(nil, nil, strings.NewReader(""), &stdout, &stderr); code != 1 {
		t.Fatalf("Run(nil context) = code %d, stderr %q", code, stderr.String())
	}
	response := decodeResponse(t, stdout.Bytes())
	if response.State != specialistcontrol.ResultAbstained || response.Reason != specialistcontrol.ReasonSpecialistFailed {
		t.Fatalf("Run(nil context) = %#v, want typed failure", response)
	}
}

func TestReadRequestRejectsNonCanonicalBindingAndNonASCIIPayload(t *testing.T) {
	t.Parallel()
	for name, mutate := range map[string]func(*Request){
		"zero binding":      func(request *Request) { request.Binding = "sha256:" + strings.Repeat("0", 64) },
		"uppercase binding": func(request *Request) { request.Binding = "sha256:" + strings.Repeat("A", 64) },
		"short binding":     func(request *Request) { request.Binding = "sha256:01" },
		"non-ASCII payload": func(request *Request) { request.Payload += "é" },
		"empty payload":     func(request *Request) { request.Payload = "" },
		"foreign source":    func(request *Request) { request.SourceID = "sha256:" + strings.Repeat("2", 64) },
		"oversized task": func(request *Request) {
			request.Task = specialistcontrol.TaskKind(strings.Repeat("x", maximumIdentityBytes+1))
		},
		"invalid identity":   func(request *Request) { request.RequestID = "not allowed" },
		"long identity":      func(request *Request) { request.RunID = strings.Repeat("x", maximumIdentityBytes+1) },
		"open timeout":       func(request *Request) { request.TimeoutMillis = 0 },
		"oversized timeout":  func(request *Request) { request.TimeoutMillis = MaximumTimeoutMillis + 1 },
		"open result bound":  func(request *Request) { request.MaxResultBytes = 0 },
		"large result bound": func(request *Request) { request.MaxResultBytes = MaximumResultBytes + 1 },
	} {
		name, mutate := name, mutate
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			request := validRequest(specialistCases[0])
			mutate(&request)
			if _, err := readRequest(bytes.NewReader(requestJSON(t, request))); !errors.Is(err, ErrMalformedRequest) && !errors.Is(err, ErrOversizedRequest) {
				t.Fatalf("readRequest(%s) error = %v, want closed request error", name, err)
			}
		})
	}
	if _, err := readRequest(nil); !errors.Is(err, ErrMalformedRequest) {
		t.Fatalf("readRequest(nil) error = %v", err)
	}
	if _, err := readRequest(errorReader{}); !errors.Is(err, ErrMalformedRequest) {
		t.Fatalf("readRequest(error) error = %v", err)
	}
	if _, err := readRequest(bytes.NewReader([]byte{0xff})); !errors.Is(err, ErrMalformedRequest) {
		t.Fatalf("readRequest(invalid UTF-8) error = %v", err)
	}
	if err := writeResponse(nil, Response{}); err == nil {
		t.Fatal("writeResponse(nil) succeeded")
	}
}

type failingWriter struct{}

func (failingWriter) Write([]byte) (int, error) { return 0, errors.New("injected write failure") }

type errorReader struct{}

func (errorReader) Read([]byte) (int, error) { return 0, errors.New("injected read failure") }

func requestJSON(t *testing.T, request Request) []byte {
	t.Helper()
	body, err := json.Marshal(request)
	if err != nil {
		t.Fatal(err)
	}
	return body
}

func decodeResponse(t *testing.T, body []byte) Response {
	t.Helper()
	var response Response
	if err := json.Unmarshal(body, &response); err != nil {
		t.Fatalf("decode response %q: %v", body, err)
	}
	return response
}
