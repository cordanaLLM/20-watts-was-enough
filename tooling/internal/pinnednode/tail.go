package pinnednode

import (
	"bytes"
	"sync"
)

// outputTail keeps the final limit bytes written, under a mutex, so a failure
// reason printed after long output is retained. It lives here rather than in
// boundedexec because boundedexec is a book-renderer source (decision 0129).
type outputTail struct {
	mutex  sync.Mutex
	buffer []byte
	limit  int
}

func newOutputTail(limit int) *outputTail {
	return &outputTail{limit: max(limit, 0)}
}

// Write retains the final bytes and reports the full input length without error.
func (tail *outputTail) Write(body []byte) (int, error) {
	tail.mutex.Lock()
	defer tail.mutex.Unlock()
	if len(body) >= tail.limit {
		tail.buffer = append(tail.buffer[:0], body[len(body)-tail.limit:]...)
		return len(body), nil
	}
	tail.buffer = append(tail.buffer, body...)
	if excess := len(tail.buffer) - tail.limit; excess > 0 {
		tail.buffer = append(tail.buffer[:0], tail.buffer[excess:]...)
	}
	return len(body), nil
}

// Bytes returns a copy of the retained final bytes.
func (tail *outputTail) Bytes() []byte {
	tail.mutex.Lock()
	defer tail.mutex.Unlock()
	return bytes.Clone(tail.buffer)
}
