// Package boundedexec provides bounded subprocess environment and output capture.
package boundedexec

import (
	"bytes"
	"context"
	"os"
	"sync"
)

// GitEnvironment returns the bounded environment for Git subprocesses.
func GitEnvironment() []string {
	environment := []string{
		"GIT_CONFIG_GLOBAL=" + os.DevNull,
		"GIT_CONFIG_NOSYSTEM=1",
		"GIT_OPTIONAL_LOCKS=0",
		"LANG=C",
		"LC_ALL=C",
	}
	for _, name := range []string{"PATH", "PATHEXT", "SYSTEMROOT", "TEMP", "TMP", "TMPDIR", "WINDIR"} {
		if value, present := os.LookupEnv(name); present {
			environment = append(environment, name+"="+value)
		}
	}
	return environment
}

// Output captures the first limit bytes and records overflow under a mutex.
type Output struct {
	mutex      sync.Mutex
	buffer     bytes.Buffer
	limit      int
	exceeded   bool
	onOverflow func()
}

// NewOutput returns a bounded output capture.
func NewOutput(limit int) *Output {
	return &Output{limit: limit}
}

// NewCancellingOutput returns a capture that cancels once on first overflow.
func NewCancellingOutput(limit int, cancel context.CancelFunc) *Output {
	return &Output{limit: limit, onOverflow: cancel}
}

// Write retains bounded output and reports the full input length without error.
func (output *Output) Write(body []byte) (int, error) {
	output.mutex.Lock()
	available := output.limit - output.buffer.Len()
	if available > len(body) {
		available = len(body)
	}
	if available > 0 {
		// bytes.Buffer.Write always returns len(body[:available]), nil.
		output.buffer.Write(body[:available])
	}
	firstOverflow := available < len(body) && !output.exceeded
	if available < len(body) {
		output.exceeded = true
	}
	output.mutex.Unlock()
	if firstOverflow && output.onOverflow != nil {
		output.onOverflow()
	}
	return len(body), nil
}

// Result returns a copy of the captured bytes and whether output overflowed.
func (output *Output) Result() ([]byte, bool) {
	output.mutex.Lock()
	defer output.mutex.Unlock()
	return bytes.Clone(output.buffer.Bytes()), output.exceeded
}

// DockerBind formats a Docker bind mount with optional read-only access.
func DockerBind(source, destination string, readOnly bool) string {
	mount := "type=bind,src=" + source + ",dst=" + destination
	if readOnly {
		mount += ",readonly"
	}
	return mount
}
