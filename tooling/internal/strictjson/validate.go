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
	if err := scanValue(decoder, 0, maximumDepth); err != nil {
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

func scanValue(decoder *json.Decoder, depth, maximumDepth int) error {
	token, err := decoder.Token()
	if err != nil {
		return fmt.Errorf("decode JSON token: %w", err)
	}
	delimiter, composite := token.(json.Delim)
	if !composite {
		return nil
	}
	if depth >= maximumDepth {
		return fmt.Errorf("JSON nesting exceeds the %d-level limit", maximumDepth)
	}
	switch delimiter {
	case '{':
		return scanObject(decoder, depth+1, maximumDepth)
	case '[':
		return scanArray(decoder, depth+1, maximumDepth)
	default:
		return fmt.Errorf("JSON value starts with unexpected delimiter %q", delimiter)
	}
}

func scanObject(decoder *json.Decoder, depth, maximumDepth int) error {
	names := make(map[string]struct{})
	for count := 0; decoder.More(); count++ {
		if count >= maximumContainerEntries {
			return errors.New("JSON object exceeds its member limit")
		}
		token, err := decoder.Token()
		if err != nil {
			return fmt.Errorf("decode JSON object name: %w", err)
		}
		name, ok := token.(string)
		if !ok {
			return errors.New("JSON object name is not a string")
		}
		if _, duplicate := names[name]; duplicate {
			return fmt.Errorf("JSON object repeats name %q", name)
		}
		names[name] = struct{}{}
		if err := scanValue(decoder, depth, maximumDepth); err != nil {
			return err
		}
	}
	return closeComposite(decoder, '}')
}

func scanArray(decoder *json.Decoder, depth, maximumDepth int) error {
	for count := 0; decoder.More(); count++ {
		if count >= maximumContainerEntries {
			return errors.New("JSON array exceeds its item limit")
		}
		if err := scanValue(decoder, depth, maximumDepth); err != nil {
			return err
		}
	}
	return closeComposite(decoder, ']')
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
