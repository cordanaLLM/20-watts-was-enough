package clrsfixture

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"math"
	"unicode/utf8"

	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/strictjson"
)

func readBounded(reader io.Reader, maximumBytes int64) ([]byte, error) {
	if reader == nil {
		return nil, fmt.Errorf("CLRS JSON reader is nil")
	}
	if maximumBytes <= 0 || maximumBytes == math.MaxInt64 {
		return nil, fmt.Errorf("CLRS JSON byte limit is invalid")
	}
	body, err := io.ReadAll(io.LimitReader(reader, maximumBytes+1))
	if err != nil {
		return nil, fmt.Errorf("read CLRS JSON: %w", err)
	}
	if int64(len(body)) > maximumBytes {
		return nil, fmt.Errorf("CLRS JSON exceeds the %d-byte limit", maximumBytes)
	}
	return body, nil
}

func decodeStrict(body []byte, maximumDepth int, destination any) error {
	if !utf8.Valid(body) {
		return fmt.Errorf("CLRS JSON is not valid UTF-8")
	}
	if err := strictjson.Validate(body, maximumDepth); err != nil {
		return fmt.Errorf("validate CLRS JSON structure: %w", err)
	}
	decoder := json.NewDecoder(bytes.NewReader(body))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(destination); err != nil {
		return fmt.Errorf("decode CLRS JSON contract: %w", err)
	}
	return nil
}
