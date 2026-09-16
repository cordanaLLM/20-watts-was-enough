package clrsrunner

import (
	"context"
	"errors"
	"fmt"
	"io"
	"time"

	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/specialistcontrol"
)

const (
	maximumInputDuration   = 5 * time.Second
	maximumProcessDuration = maximumInputDuration + time.Duration(MaximumTimeoutMillis)*time.Millisecond + time.Second
)

type requestRead struct {
	request Request
	err     error
}

// Run executes the no-argument stdin/stdout process contract.
func Run(ctx context.Context, arguments []string, stdin io.Reader, stdout, stderr io.Writer) int {
	if len(arguments) != 0 {
		fmt.Fprintln(stderr, "Usage: clrs-specialist < request.json")
		return 2
	}
	if ctx == nil {
		response := responseFor(Request{})
		response.State = specialistcontrol.ResultAbstained
		response.Reason = specialistcontrol.ReasonSpecialistFailed
		return writeFailure(stdout, stderr, response, "Run CLRS specialist", errors.New("nil context"))
	}
	processContext, cancelProcess := context.WithTimeout(ctx, maximumProcessDuration)
	defer cancelProcess()
	inputContext, cancelInput := context.WithTimeout(processContext, maximumInputDuration)
	request, err := readRequestContext(inputContext, stdin)
	cancelInput()
	if err != nil {
		response := responseFor(Request{})
		switch {
		case errors.Is(err, context.Canceled):
			response.State = specialistcontrol.ResultAbstained
			response.Reason = specialistcontrol.ReasonCancelled
		case errors.Is(err, context.DeadlineExceeded):
			response.State = specialistcontrol.ResultAbstained
			response.Reason = specialistcontrol.ReasonDeadlineElapsed
		case errors.Is(err, ErrOversizedRequest):
			response.Reason = specialistcontrol.ReasonOversizedRequest
		}
		return writeFailure(stdout, stderr, response, "Read CLRS specialist request", err)
	}
	registry, err := NewRegistry()
	if err != nil {
		response := responseFor(request)
		response.State = specialistcontrol.ResultAbstained
		response.Reason = specialistcontrol.ReasonSpecialistFailed
		return writeFailure(stdout, stderr, response, "Construct CLRS specialist registry", err)
	}
	response, invokeErr := registry.Invoke(processContext, request)
	if writeErr := writeResponse(stdout, response); writeErr != nil {
		fmt.Fprintf(stderr, "Write CLRS specialist response: %v\n", writeErr)
		return 1
	}
	if invokeErr != nil {
		fmt.Fprintf(stderr, "Run CLRS specialist: %v\n", invokeErr)
		return 1
	}
	if response.Reason == specialistcontrol.ReasonUnknownTask ||
		response.Reason == specialistcontrol.ReasonMalformedRequest {
		return 1
	}
	return 0
}

func readRequestContext(ctx context.Context, reader io.Reader) (Request, error) {
	result := make(chan requestRead, 1)
	go func() {
		request, err := readRequest(reader)
		result <- requestRead{request: request, err: err}
	}()
	select {
	case completed := <-result:
		return completedRequestRead(ctx, completed)
	case <-ctx.Done():
		if closer, ok := reader.(io.Closer); ok {
			_ = closer.Close()
		}
		return Request{}, fmt.Errorf("wait for request envelope: %w", ctx.Err())
	}
}

func completedRequestRead(ctx context.Context, completed requestRead) (Request, error) {
	if err := ctx.Err(); err != nil {
		return Request{}, fmt.Errorf("wait for request envelope: %w", err)
	}
	return completed.request, completed.err
}

func writeFailure(stdout, stderr io.Writer, response Response, operation string, err error) int {
	if writeErr := writeResponse(stdout, response); writeErr != nil {
		fmt.Fprintf(stderr, "Write CLRS specialist refusal: %v\n", writeErr)
		return 1
	}
	fmt.Fprintf(stderr, "%s: %v\n", operation, err)
	return 1
}
