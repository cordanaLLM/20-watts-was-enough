// Package publictransport verifies the bounded public HTTP and TLS boundary.
package publictransport

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"sort"
	"strings"

	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/repositorymanifest"
	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/strictjson"
)

const (
	manifestRelativePath = ".github/public-transport.json"
	maximumManifestBytes = 8 << 10
	maximumHeaderBytes   = 128
	canonicalHTTPURL     = "http://www.cordana.dev/"
	canonicalHTTPSURL    = "https://www.cordana.dev/"
	canonicalServer      = "cloudflare"
	canonicalHTTPStatus  = 301
	canonicalHTTPSStatus = 200
	minimumRemainingDays = 14
)

var exactManifestKeys = [...]string{
	"schema",
	"http_url",
	"https_url",
	"http_status",
	"https_status",
	"redirect_location",
	"server",
	"required_header",
	"timeout_seconds",
	"minimum_certificate_remaining_days",
}

// Manifest is the closed Git authority for the public HTTP and TLS checks.
type Manifest struct {
	Schema                          int    `json:"schema"`
	HTTPURL                         string `json:"http_url"`
	HTTPSURL                        string `json:"https_url"`
	HTTPStatus                      int    `json:"http_status"`
	HTTPSStatus                     int    `json:"https_status"`
	RedirectLocation                string `json:"redirect_location"`
	Server                          string `json:"server"`
	RequiredHeader                  string `json:"required_header"`
	TimeoutSeconds                  int    `json:"timeout_seconds"`
	MinimumCertificateRemainingDays int    `json:"minimum_certificate_remaining_days"`
}

// Load reads and validates the canonical public-transport manifest.
func Load(root string) (Manifest, error) {
	body, err := repositorymanifest.Read(root, manifestRelativePath, maximumManifestBytes)
	if err != nil {
		return Manifest{}, fmt.Errorf("read %s: %w", manifestRelativePath, err)
	}
	if err := strictjson.Validate(body, 4); err != nil {
		return Manifest{}, fmt.Errorf("validate unambiguous public-transport JSON: %w", err)
	}
	if err := validateExactKeys(body); err != nil {
		return Manifest{}, err
	}
	decoder := json.NewDecoder(bytes.NewReader(body))
	decoder.DisallowUnknownFields()
	var manifest Manifest
	if err := decoder.Decode(&manifest); err != nil {
		return Manifest{}, fmt.Errorf("decode public-transport manifest: %w", err)
	}
	if decoder.Decode(&struct{}{}) != io.EOF {
		return Manifest{}, errors.New("public-transport manifest contains trailing data")
	}
	if err := validateManifest(manifest); err != nil {
		return Manifest{}, err
	}
	return manifest, nil
}

func validateManifest(manifest Manifest) error {
	if manifest.Schema != 1 {
		return errors.New("public-transport manifest schema must be 1")
	}
	if manifest.HTTPURL != canonicalHTTPURL {
		return fmt.Errorf("schema 1 http_url must exactly equal %q", canonicalHTTPURL)
	}
	if manifest.HTTPSURL != canonicalHTTPSURL {
		return fmt.Errorf("schema 1 https_url must exactly equal %q", canonicalHTTPSURL)
	}
	if manifest.HTTPStatus != canonicalHTTPStatus {
		return fmt.Errorf("schema 1 http_status must be %d", canonicalHTTPStatus)
	}
	if manifest.HTTPSStatus != canonicalHTTPSStatus {
		return fmt.Errorf("schema 1 https_status must be %d", canonicalHTTPSStatus)
	}
	if manifest.RedirectLocation != canonicalHTTPSURL {
		return fmt.Errorf("schema 1 redirect_location must exactly equal %q", canonicalHTTPSURL)
	}
	if err := validateHeaderValue("server", manifest.Server); err != nil {
		return err
	}
	if !strings.EqualFold(manifest.Server, canonicalServer) {
		return fmt.Errorf("schema 1 server must be %q case-insensitively", canonicalServer)
	}
	if !strings.EqualFold(manifest.RequiredHeader, "CF-Ray") {
		return errors.New("required_header must be CF-Ray")
	}
	if err := validateHeaderValue("required_header", manifest.RequiredHeader); err != nil {
		return err
	}
	if manifest.TimeoutSeconds < 1 || manifest.TimeoutSeconds > 30 {
		return errors.New("timeout_seconds must be between 1 and 30")
	}
	if manifest.MinimumCertificateRemainingDays < minimumRemainingDays || manifest.MinimumCertificateRemainingDays > 90 {
		return fmt.Errorf(
			"minimum_certificate_remaining_days must be between %d and 90",
			minimumRemainingDays,
		)
	}
	return nil
}

func validateExactKeys(body []byte) error {
	var fields map[string]json.RawMessage
	if err := json.Unmarshal(body, &fields); err != nil {
		return fmt.Errorf("decode public-transport object keys: %w", err)
	}
	known := make(map[string]struct{}, len(exactManifestKeys))
	for _, key := range exactManifestKeys {
		known[key] = struct{}{}
	}
	unexpected := make([]string, 0)
	for key := range fields {
		if _, ok := known[key]; !ok {
			unexpected = append(unexpected, key)
		}
	}
	if len(unexpected) > 0 {
		sort.Strings(unexpected)
		return fmt.Errorf("public-transport manifest contains unexpected exact key %q", unexpected[0])
	}
	for _, key := range exactManifestKeys {
		if _, ok := fields[key]; !ok {
			return fmt.Errorf("public-transport manifest is missing exact key %q", key)
		}
	}
	return nil
}

func validateHeaderValue(field, value string) error {
	if value == "" || len(value) > maximumHeaderBytes || strings.TrimSpace(value) != value ||
		strings.ContainsAny(value, "\r\n") {
		return fmt.Errorf("%s must be a trimmed 1-%d byte single-line value", field, maximumHeaderBytes)
	}
	return nil
}
