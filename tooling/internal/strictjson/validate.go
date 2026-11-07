// Package strictjson rejects ambiguous JSON before a contract decoder projects it.
package strictjson

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
)

const maximumContainerEntries = 65_536

// Canonical encodes value with two-space indentation, unescaped HTML, and a final newline.
func Canonical(value any) ([]byte, error) {
	var buffer bytes.Buffer
	encoder := json.NewEncoder(&buffer)
	encoder.SetEscapeHTML(false)
	encoder.SetIndent("", "  ")
	if err := encoder.Encode(value); err != nil {
		return nil, err
	}
	return buffer.Bytes(), nil
}

// Validate requires one JSON value with unique object names and bounded depth.
func Validate(body []byte, maximumDepth int) error {
	if maximumDepth <= 0 || maximumDepth > 256 {
		return errors.New("JSON maximum depth must be between 1 and 256")
	}
	decoder := json.NewDecoder(bytes.NewReader(body))
	decoder.UseNumber()
	if err := scanValue(decoder, maximumDepth, len(body)); err != nil {
		return err
	}
	if _, err := decoder.Token(); err != io.EOF {
		if err != nil {
			return fmt.Errorf("read trailing JSON: %w", err)
		}
		return errors.New("JSON contains trailing data")
	}
	return nil
}

// container is one open object or array on the explicit scan stack.
type container struct {
	closing json.Delim
	names   map[string]struct{} // member names of an object; nil for an array
	entries int
}

// scanValue walks one JSON value with an explicit stack instead of recursion.
// Every step reads at least one token, so the body length bounds the walk.
func scanValue(decoder *json.Decoder, maximumDepth, maximumSteps int) error {
	stack := make([]container, 0, maximumDepth)
	for step := 0; step <= maximumSteps; step++ {
		done, err := scanStep(decoder, &stack, maximumDepth)
		if err != nil || done {
			return err
		}
	}
	return errors.New("JSON scan exceeds its token bound")
}

// scanStep closes the innermost container or reads its next entry, and
// reports whether the outermost value is complete.
func scanStep(decoder *json.Decoder, stack *[]container, maximumDepth int) (bool, error) {
	if depth := len(*stack); depth > 0 {
		top := &(*stack)[depth-1]
		if !decoder.More() {
			if err := closeComposite(decoder, top.closing); err != nil {
				return false, err
			}
			*stack = (*stack)[:depth-1]
			return depth == 1, nil
		}
		if err := top.admitEntry(decoder); err != nil {
			return false, err
		}
	}
	opened, composite, err := openValue(decoder, len(*stack), maximumDepth)
	if err != nil {
		return false, err
	}
	if composite {
		*stack = append(*stack, opened)
		return false, nil
	}
	return len(*stack) == 0, nil
}

// openValue reads the first token of a value and returns the container it
// opens, if any; depth counts the containers already open around it.
func openValue(decoder *json.Decoder, depth, maximumDepth int) (container, bool, error) {
	token, err := decoder.Token()
	if err != nil {
		return container{}, false, fmt.Errorf("decode JSON token: %w", err)
	}
	delimiter, composite := token.(json.Delim)
	if !composite {
		return container{}, false, nil
	}
	if depth >= maximumDepth {
		return container{}, false, fmt.Errorf("JSON nesting exceeds the %d-level limit", maximumDepth)
	}
	switch delimiter {
	case '{':
		return container{closing: '}', names: make(map[string]struct{})}, true, nil
	case '[':
		return container{closing: ']'}, true, nil
	default:
		return container{}, false, fmt.Errorf("JSON value starts with unexpected delimiter %q", delimiter)
	}
}

// admitEntry counts one more entry and, in an object, reads its unique name.
func (open *container) admitEntry(decoder *json.Decoder) error {
	if open.entries >= maximumContainerEntries {
		if open.names != nil {
			return errors.New("JSON object exceeds its member limit")
		}
		return errors.New("JSON array exceeds its item limit")
	}
	open.entries++
	if open.names == nil {
		return nil
	}
	token, err := decoder.Token()
	if err != nil {
		return fmt.Errorf("decode JSON object name: %w", err)
	}
	name, ok := token.(string)
	if !ok {
		return errors.New("JSON object name is not a string")
	}
	if _, duplicate := open.names[name]; duplicate {
		return fmt.Errorf("JSON object repeats name %q", name)
	}
	open.names[name] = struct{}{}
	return nil
}

func closeComposite(decoder *json.Decoder, expected json.Delim) error {
	token, err := decoder.Token()
	if err != nil {
		return fmt.Errorf("close JSON container: %w", err)
	}
	if token != expected {
		return fmt.Errorf("JSON container ends with %q instead of %q", token, expected)
	}
	return nil
}
