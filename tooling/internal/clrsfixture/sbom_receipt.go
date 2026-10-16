package clrsfixture

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"reflect"
	"strings"
)

type sbomIdentity struct {
	SHA256 string `json:"sha256"`
	Bytes  int64  `json:"bytes"`
}

func (identity *sbomIdentity) UnmarshalJSON(body []byte) error {
	type plain sbomIdentity
	if _, err := sbomObject(body, "sha256 bytes", ""); err != nil {
		return err
	}
	return json.Unmarshal(body, (*plain)(identity))
}

type sbomBinding struct {
	Schema          int          `json:"schema"`
	Authority       string       `json:"authority"`
	Archive         sbomIdentity `json:"archive"`
	ManifestDigest  string       `json:"image_manifest_digest"`
	ConfigDigest    string       `json:"image_config_digest"`
	ScannerIndex    string       `json:"scanner_index_digest"`
	ScannerManifest string       `json:"scanner_manifest_digest"`
	ScannerConfig   string       `json:"scanner_config_digest"`
	ScannerBinary   string       `json:"scanner_binary_sha256"`
	Supervisor      string       `json:"supervisor_sha256"`
	ExecutionRecord sbomIdentity `json:"execution_record"`
}

func (binding *sbomBinding) UnmarshalJSON(body []byte) error {
	type plain sbomBinding
	if _, err := sbomObject(body, "schema authority archive image_manifest_digest image_config_digest scanner_index_digest scanner_manifest_digest scanner_config_digest scanner_binary_sha256 supervisor_sha256 execution_record", ""); err != nil {
		return err
	}
	return json.Unmarshal(body, (*plain)(binding))
}

type sbomDerivation struct {
	Schema       int          `json:"schema"`
	Authority    string       `json:"authority"`
	State        string       `json:"state"`
	Binding      sbomBinding  `json:"supplied_binding"`
	BindingFile  sbomIdentity `json:"binding_file"`
	Statement    sbomIdentity `json:"original_statement"`
	Predicate    sbomIdentity `json:"spdx_predicate"`
	PackageCount int          `json:"package_count"`
	Limitations  []string     `json:"limitations"`
}

func checkSBOMDocuments(ctx context.Context, bundle sbomBundle, options GeneratorSBOMOptions, wheels GeneratorWheelhouseManifest, contract GeneratorImageContract) (int, []GeneratorSBOMPackage, []GeneratorSBOMPackage, error) {
	body := func(name string) []byte { return bundle.files[name].body }
	var binding sbomBinding
	if err := decodeStrict(body("supplied-binding.json"), sbomMaximumDepth, &binding); err != nil {
		return 0, nil, nil, fmt.Errorf("SBOM supplied binding: %w", err)
	}
	if err := checkSBOMBinding(binding, options, contract); err != nil {
		return 0, nil, nil, err
	}
	var derivative sbomDerivation
	if _, err := sbomObject(body("derivation-receipt.json"), "schema authority state supplied_binding binding_file original_statement spdx_predicate package_count limitations", ""); err != nil {
		return 0, nil, nil, err
	}
	if err := decodeStrict(body("derivation-receipt.json"), sbomMaximumDepth, &derivative); err != nil {
		return 0, nil, nil, err
	}
	if derivative.Schema != 1 || derivative.Authority != ResultAuthority || derivative.State != "derived-from-supplied-bindings" ||
		!reflect.DeepEqual(derivative.Binding, binding) || !validSBOMLimitations(derivative.Limitations) {
		return 0, nil, nil, errors.New("SBOM derivation schema, authority, state, or supplied binding differs")
	}
	for _, pair := range []struct {
		identity sbomIdentity
		name     string
	}{
		{binding.ExecutionRecord, "execution-record.json"}, {derivative.BindingFile, "supplied-binding.json"},
		{derivative.Statement, "scanner-statement.intoto.json"}, {derivative.Predicate, "image.spdx.json"},
	} {
		if pair.identity != sbomBytesIdentity(body(pair.name)) {
			return 0, nil, nil, fmt.Errorf("SBOM receipt byte identity differs for %s", pair.name)
		}
	}
	if err := ctx.Err(); err != nil {
		return 0, nil, nil, err
	}
	if err := checkSBOMStatement(body("scanner-statement.intoto.json"), body("image.spdx.json")); err != nil {
		return 0, nil, nil, err
	}
	count, locked, extra, err := checkSBOMInventoryPackages(ctx, body("image.spdx.json"), wheels)
	if err != nil {
		return 0, nil, nil, err
	}
	if count != derivative.PackageCount {
		return 0, nil, nil, errors.New("SBOM derivation package count differs from the unchanged predicate")
	}
	if err := checkSBOMExecution(body("execution-record.json"), binding, derivative.Statement, count); err != nil {
		return 0, nil, nil, err
	}
	return count, locked, extra, nil
}

func checkSBOMBinding(binding sbomBinding, options GeneratorSBOMOptions, contract GeneratorImageContract) error {
	if binding.Schema != 1 || binding.Authority != ResultAuthority ||
		binding.ManifestDigest != options.ExpectedManifestDigest || binding.ConfigDigest != options.ExpectedConfigDigest ||
		!validSBOMIdentity(binding.Archive, contract.Limits.CompressedImageBytes) ||
		!validSBOMIdentity(binding.ExecutionRecord, sbomMaximumReceiptBytes) ||
		!sbomDigest(binding.ScannerIndex) || !sbomDigest(binding.ScannerManifest) || !sbomDigest(binding.ScannerConfig) ||
		!lowerHex(binding.ScannerBinary, 64) || !lowerHex(binding.Supervisor, 64) ||
		contract.SBOM.GeneratorImage != "docker.io/docker/buildkit-syft-scanner@"+binding.ScannerIndex {
		return errors.New("SBOM binding differs from independent image expectations or current scanner authority")
	}
	return nil
}

func checkSBOMStatement(statement, predicate []byte) error {
	object, err := sbomObject(statement, "_type subject predicateType predicate", "")
	if err != nil {
		return fmt.Errorf("SBOM original statement: %w", err)
	}
	if !bytes.Equal(bytes.TrimSpace(object["subject"]), []byte("null")) ||
		jsonString(object, "_type") != "https://in-toto.io/Statement/v1" ||
		jsonString(object, "predicateType") != "https://spdx.dev/Document" ||
		!bytes.Equal(object["predicate"], predicate) {
		return errors.New("SBOM statement requires subject:null, exact type URIs, and unchanged predicate bytes")
	}
	return nil
}

// sbomObject closes receipt keys exactly, including case. SPDX objects call it
// with an explicit profile key set; the original JSON bytes remain the artifact.
func sbomObject(body []byte, required, optional string) (map[string]json.RawMessage, error) {
	var object map[string]json.RawMessage
	if err := decodeStrict(body, sbomMaximumDepth, &object); err != nil {
		return nil, err
	}
	if object == nil {
		return nil, errors.New("SBOM JSON object must not be null")
	}
	allowed := make(map[string]bool)
	for _, key := range strings.Fields(required) {
		if _, exists := object[key]; !exists {
			return nil, fmt.Errorf("SBOM JSON object lacks exact field %s", key)
		}
		allowed[key] = true
	}
	for _, key := range strings.Fields(optional) {
		allowed[key] = true
	}
	if len(object) > len(allowed) {
		return nil, errors.New("SBOM JSON object contains unknown fields")
	}
	for key := range object {
		if !allowed[key] {
			return nil, errors.New("SBOM JSON object contains an unknown or case-aliased field")
		}
	}
	return object, nil
}

func sbomBytesIdentity(body []byte) sbomIdentity {
	return sbomIdentity{rawSHA256(body), int64(len(body))}
}

func validSBOMIdentity(identity sbomIdentity, limit int64) bool {
	return lowerHex(identity.SHA256, 64) && identity.Bytes > 0 && identity.Bytes <= limit
}

func validSBOMLimitations(values []string) bool {
	if len(values) == 0 || len(values) > 16 {
		return false
	}
	for _, value := range values {
		if len(strings.TrimSpace(value)) == 0 || len(value) > 4096 {
			return false
		}
	}
	return true
}
