// Package clrsrunner exposes the frozen CLRS exact-program specialists through
// one bounded process contract. It is a candidate effect seam, not a verifier
// or a scientific-result authority.
package clrsrunner

import (
	"bytes"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"strings"
	"unicode/utf8"

	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/buildinfo"
	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/specialistcontrol"
	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/strictjson"
)

const (
	SchemaVersion = 1

	FrozenSourceID             = "sha256:7ec3b6b7528d04f517c4e9b7c3e0cd0f7034a775d225d469d1aca5c00fec10d1"
	FrozenGenerationContractID = "sha256:cc14fce405e8fa7d4719f1fc906e28d5e4b73235085c8f0722795efded2891a8"

	MaximumPromptBytes      = 1 << 20
	MaximumResultBytes      = 1 << 20
	MaximumEnvelopeBytes    = 7 << 20
	MaximumTimeoutMillis    = 5_000
	maximumJSONNestingDepth = 2
	maximumIdentityBytes    = 128
)

var (
	ErrMalformedRequest = errors.New("malformed CLRS specialist request")
	ErrOversizedRequest = errors.New("oversized CLRS specialist request")
)

var requestFieldNames = [...]string{
	"schema_version", "authority", "source_id", "generation_contract_id", "run_id", "request_id",
	"task", "specialist_id", "binding", "timeout_milliseconds", "max_result_bytes", "payload",
}

// Request is the versioned stdin envelope sent after a controller records its
// route decision. Payload contains the exact candidate-visible CLRS prompt.
type Request struct {
	SchemaVersion        int                        `json:"schema_version"`
	Authority            string                     `json:"authority"`
	SourceID             string                     `json:"source_id"`
	GenerationContractID string                     `json:"generation_contract_id"`
	RunID                string                     `json:"run_id"`
	RequestID            string                     `json:"request_id"`
	Task                 specialistcontrol.TaskKind `json:"task"`
	SpecialistID         string                     `json:"specialist_id"`
	Binding              string                     `json:"binding"`
	TimeoutMillis        int                        `json:"timeout_milliseconds"`
	MaxResultBytes       int                        `json:"max_result_bytes"`
	Payload              string                     `json:"payload"`
}

// Response is the single JSON value written to stdout. A completed payload is
// still an unverified NO_RESULT candidate.
type Response struct {
	SchemaVersion        int                           `json:"schema_version"`
	Authority            string                        `json:"authority"`
	SourceID             string                        `json:"source_id"`
	GenerationContractID string                        `json:"generation_contract_id"`
	RunID                string                        `json:"run_id"`
	RequestID            string                        `json:"request_id"`
	Task                 specialistcontrol.TaskKind    `json:"task"`
	SpecialistID         string                        `json:"specialist_id"`
	Binding              string                        `json:"binding"`
	TimeoutMillis        int                           `json:"timeout_milliseconds"`
	MaxResultBytes       int                           `json:"max_result_bytes"`
	State                specialistcontrol.ResultState `json:"state"`
	Reason               specialistcontrol.Reason      `json:"reason"`
	Payload              string                        `json:"payload"`
	Build                buildinfo.Info                `json:"build"`
}

func readRequest(reader io.Reader) (Request, error) {
	if reader == nil {
		return Request{}, fmt.Errorf("%w: nil input", ErrMalformedRequest)
	}
	body, err := io.ReadAll(io.LimitReader(reader, MaximumEnvelopeBytes+1))
	if err != nil {
		return Request{}, fmt.Errorf("%w: read envelope: %v", ErrMalformedRequest, err)
	}
	if len(body) > MaximumEnvelopeBytes {
		return Request{}, fmt.Errorf("%w: envelope exceeds %d bytes", ErrOversizedRequest, MaximumEnvelopeBytes)
	}
	if len(body) == 0 || !utf8.Valid(body) {
		return Request{}, fmt.Errorf("%w: envelope is empty or not UTF-8", ErrMalformedRequest)
	}
	if err := strictjson.Validate(body, maximumJSONNestingDepth); err != nil {
		return Request{}, fmt.Errorf("%w: %v", ErrMalformedRequest, err)
	}
	if err := validateRequestFieldNames(body); err != nil {
		return Request{}, err
	}
	decoder := json.NewDecoder(bytes.NewReader(body))
	decoder.DisallowUnknownFields()
	var request Request
	if err := decoder.Decode(&request); err != nil {
		return Request{}, fmt.Errorf("%w: decode envelope: %v", ErrMalformedRequest, err)
	}
	if err := validateRequest(request); err != nil {
		return Request{}, err
	}
	return request, nil
}

func validateRequestFieldNames(body []byte) error {
	var fields map[string]json.RawMessage
	if err := json.Unmarshal(body, &fields); err != nil || len(fields) != len(requestFieldNames) {
		return fmt.Errorf("%w: request must contain the exact field set", ErrMalformedRequest)
	}
	for _, name := range requestFieldNames {
		if _, present := fields[name]; !present {
			return fmt.Errorf("%w: required field %q is absent or aliased", ErrMalformedRequest, name)
		}
	}
	return nil
}

func validateRequest(request Request) error {
	if request.SchemaVersion != SchemaVersion || request.Authority != specialistcontrol.ResultAuthority ||
		request.SourceID != FrozenSourceID || request.GenerationContractID != FrozenGenerationContractID {
		return fmt.Errorf("%w: schema, authority, source, or generation contract differs", ErrMalformedRequest)
	}
	if !validIdentity(request.RunID) || !validIdentity(request.RequestID) || !validIdentity(request.SpecialistID) {
		return fmt.Errorf("%w: run, request, or specialist identity is invalid", ErrMalformedRequest)
	}
	if !validIdentity(string(request.Task)) {
		return fmt.Errorf("%w: task identity is invalid", ErrMalformedRequest)
	}
	if len(request.Payload) == 0 {
		return fmt.Errorf("%w: payload is empty", ErrMalformedRequest)
	}
	if len(request.Payload) > MaximumPromptBytes {
		return fmt.Errorf("%w: payload exceeds %d bytes", ErrOversizedRequest, MaximumPromptBytes)
	}
	if !ascii(request.Payload) {
		return fmt.Errorf("%w: payload must use the pinned ASCII prompt grammar", ErrMalformedRequest)
	}
	if request.TimeoutMillis <= 0 || request.TimeoutMillis > MaximumTimeoutMillis ||
		request.MaxResultBytes <= 0 || request.MaxResultBytes > MaximumResultBytes {
		return fmt.Errorf("%w: timeout or result bound is outside the closed range", ErrMalformedRequest)
	}
	if _, err := parseBinding(request.Binding); err != nil {
		return err
	}
	return nil
}

func parseBinding(value string) (specialistcontrol.Binding, error) {
	var binding specialistcontrol.Binding
	if len(value) != len("sha256:")+hex.EncodedLen(len(binding)) || !strings.HasPrefix(value, "sha256:") {
		return binding, fmt.Errorf("%w: binding must be a sha256 identity", ErrMalformedRequest)
	}
	decoded, err := hex.DecodeString(strings.TrimPrefix(value, "sha256:"))
	if err != nil || len(decoded) != len(binding) {
		return binding, fmt.Errorf("%w: binding must use lowercase hexadecimal", ErrMalformedRequest)
	}
	copy(binding[:], decoded)
	if binding == (specialistcontrol.Binding{}) || value != "sha256:"+hex.EncodeToString(binding[:]) {
		return specialistcontrol.Binding{}, fmt.Errorf("%w: binding is zero or non-canonical", ErrMalformedRequest)
	}
	return binding, nil
}

func formatBinding(binding specialistcontrol.Binding) string {
	return "sha256:" + hex.EncodeToString(binding[:])
}

func validIdentity(value string) bool {
	if len(value) == 0 || len(value) > maximumIdentityBytes {
		return false
	}
	for _, character := range []byte(value) {
		if (character < 'a' || character > 'z') && (character < 'A' || character > 'Z') &&
			(character < '0' || character > '9') && character != '.' && character != '_' &&
			character != ':' && character != '-' {
			return false
		}
	}
	return true
}

func ascii(value string) bool {
	for _, character := range []byte(value) {
		if character > 0x7f {
			return false
		}
	}
	return true
}

func writeResponse(writer io.Writer, response Response) error {
	if writer == nil {
		return errors.New("nil output")
	}
	encoder := json.NewEncoder(writer)
	encoder.SetEscapeHTML(false)
	return encoder.Encode(response)
}
