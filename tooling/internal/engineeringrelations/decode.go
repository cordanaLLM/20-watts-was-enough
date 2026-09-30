package engineeringrelations

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"unicode/utf8"

	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/strictjson"
)

var (
	registryKeys = []string{"schema", "result_authority", "decision", "relations"}
	relationKeys = []string{
		"id", "target", "relation", "role", "subject", "repository", "visibility",
		"commit", "paths", "evidence_ref", "related_party", "recorded", "does_not_establish",
	}
	optionalRelationKeys = []string{"target_section", "residual", "metric"}
	allRelationKeys      = append(append([]string{}, relationKeys...), optionalRelationKeys...)
)

func loadRegistry(repo repository) (Registry, error) {
	body, err := repo.read(RegistryPath, maximumRegistryBytes)
	if err != nil {
		return Registry{}, err
	}
	return decodeRegistry(body)
}

// decodeRegistry accepts only unambiguous, number-free, closed and canonical
// registry bytes.
func decodeRegistry(body []byte) (Registry, error) {
	if !utf8.Valid(body) {
		return Registry{}, errors.New("registry is not valid UTF-8")
	}
	if err := strictjson.Validate(body, maximumJSONDepth); err != nil {
		return Registry{}, fmt.Errorf("validate unambiguous JSON: %w", err)
	}
	if err := rejectNumbers(body); err != nil {
		return Registry{}, err
	}
	if err := requireKeys(body); err != nil {
		return Registry{}, err
	}
	decoder := json.NewDecoder(bytes.NewReader(body))
	decoder.DisallowUnknownFields()
	var registry Registry
	if err := decoder.Decode(&registry); err != nil {
		return Registry{}, fmt.Errorf("decode registry: %w", err)
	}
	if decoder.Decode(&struct{}{}) != io.EOF {
		return Registry{}, errors.New("registry contains trailing data")
	}
	canonical, err := Canonical(registry)
	if err != nil {
		return Registry{}, err
	}
	if !bytes.Equal(body, canonical) {
		return Registry{}, errors.New("registry is not in canonical form: two-space indentation, schema key order, LF line endings and one final newline")
	}
	return registry, nil
}

// Canonical returns the byte-stable encoding a tracked registry must match.
func Canonical(registry Registry) ([]byte, error) {
	var buffer bytes.Buffer
	encoder := json.NewEncoder(&buffer)
	encoder.SetEscapeHTML(false)
	encoder.SetIndent("", "  ")
	if err := encoder.Encode(registry); err != nil {
		return nil, fmt.Errorf("encode canonical registry: %w", err)
	}
	return buffer.Bytes(), nil
}

// rejectNumbers fails on the first JSON number anywhere in the document.
// Numbers belong with the measurement records the rows point to, not here.
func rejectNumbers(body []byte) error {
	decoder := json.NewDecoder(bytes.NewReader(body))
	decoder.UseNumber()
	for tokens := 0; tokens <= len(body); tokens++ {
		token, err := decoder.Token()
		if errors.Is(err, io.EOF) {
			return nil
		}
		if err != nil {
			return fmt.Errorf("scan JSON tokens: %w", err)
		}
		if number, numeric := token.(json.Number); numeric {
			line := 1 + bytes.Count(body[:decoder.InputOffset()], []byte("\n"))
			return fmt.Errorf("line %d holds the number %s; the registry admits no numeric field (decision 0087)", line, number)
		}
	}
	return errors.New("JSON token scan exceeded its bound")
}

// requireKeys reports a missing or null key before the struct decoder can
// turn it into a zero value.
func requireKeys(body []byte) error {
	var top map[string]json.RawMessage
	if err := json.Unmarshal(body, &top); err != nil {
		return fmt.Errorf("decode registry object: %w", err)
	}
	if err := requirePresent("registry", top, registryKeys); err != nil {
		return err
	}
	if err := rejectNull("registry", top, registryKeys, ""); err != nil {
		return err
	}
	var shape struct {
		Relations []map[string]json.RawMessage `json:"relations"`
	}
	if err := json.Unmarshal(body, &shape); err != nil {
		return fmt.Errorf("decode relations array: %w", err)
	}
	if len(shape.Relations) > maximumRelations {
		return fmt.Errorf("registry holds more than %d relations", maximumRelations)
	}
	for index, row := range shape.Relations {
		label := fmt.Sprintf("relations[%d]", index)
		if err := requirePresent(label, row, relationKeys); err != nil {
			return err
		}
		if err := rejectNull(label, row, allRelationKeys, "evidence_ref"); err != nil {
			return err
		}
	}
	return nil
}

func requirePresent(label string, object map[string]json.RawMessage, keys []string) error {
	for _, key := range keys {
		if _, present := object[key]; !present {
			return fmt.Errorf("%s is missing required key %q", label, key)
		}
	}
	return nil
}

func rejectNull(label string, object map[string]json.RawMessage, keys []string, nullable string) error {
	for _, key := range keys {
		value, present := object[key]
		if present && key != nullable && bytes.Equal(bytes.TrimSpace(value), []byte("null")) {
			return fmt.Errorf("%s key %q must not be null", label, key)
		}
	}
	return nil
}
