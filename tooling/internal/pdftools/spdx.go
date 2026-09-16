package pdftools

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"slices"
	"sort"
	"strings"

	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/strictjson"
)

var spdxTopLevelKeys = []string{
	"SPDXID",
	"creationInfo",
	"dataLicense",
	"documentDescribes",
	"documentNamespace",
	"name",
	"packages",
	"relationships",
	"spdxVersion",
}

var admittedSPDXRelationshipTypes = map[string]struct{}{
	"CONTAINS":       {},
	"DESCRIBED_BY":   {},
	"GENERATED_FROM": {},
	"VARIANT_OF":     {},
}

type spdxIdentity struct {
	RawSHA256       string
	RawSize         int64
	CanonicalSHA256 string
	CanonicalSize   int64
	Packages        int
	Relationships   int
	raw             []byte
	canonical       []byte
}

func canonicalizeSPDX(body []byte, maximumBytes int64, maximumPackages, maximumRelationships int) (spdxIdentity, error) {
	if len(body) == 0 || int64(len(body)) > maximumBytes || maximumPackages <= 0 || maximumRelationships <= 0 {
		return spdxIdentity{}, errors.New("SPDX document exceeds its input boundary")
	}
	if err := strictjson.Validate(body, 32); err != nil {
		return spdxIdentity{}, fmt.Errorf("validate unambiguous SPDX JSON: %w", err)
	}
	document, err := decodeSPDXDocument(body)
	if err != nil {
		return spdxIdentity{}, err
	}
	packages, relationships, err := validateSPDXGraph(document, maximumPackages, maximumRelationships)
	if err != nil {
		return spdxIdentity{}, err
	}
	// Relationship-array order is the only semantic normalisation. Deterministic
	// JSON encoding also fixes object-member order and whitespace; every field
	// value and every other array retains the validated input value and order.
	sort.Slice(relationships, func(left, right int) bool {
		return bytes.Compare(relationships[left].canonical, relationships[right].canonical) < 0
	})
	ordered := make([]any, len(relationships))
	for index, relationship := range relationships {
		ordered[index] = relationship.value
	}
	document["relationships"] = ordered
	canonical, err := json.MarshalIndent(document, "", "  ")
	if err != nil {
		return spdxIdentity{}, fmt.Errorf("encode canonical SPDX graph: %w", err)
	}
	canonical = append(canonical, '\n')
	if int64(len(canonical)) > maximumBytes {
		return spdxIdentity{}, errors.New("canonical SPDX document exceeds its byte boundary")
	}
	return spdxIdentity{
		RawSHA256:       digestRaw(body),
		RawSize:         int64(len(body)),
		CanonicalSHA256: digestRaw(canonical),
		CanonicalSize:   int64(len(canonical)),
		Packages:        packages,
		Relationships:   len(relationships),
		raw:             slices.Clone(body),
		canonical:       canonical,
	}, nil
}

func decodeSPDXDocument(body []byte) (map[string]any, error) {
	decoder := json.NewDecoder(bytes.NewReader(body))
	decoder.UseNumber()
	var document map[string]any
	if err := decoder.Decode(&document); err != nil {
		return nil, fmt.Errorf("decode SPDX document: %w", err)
	}
	if err := decoder.Decode(&struct{}{}); !errors.Is(err, io.EOF) {
		return nil, errors.New("SPDX document contains trailing data")
	}
	keys := make([]string, 0, len(document))
	for key := range document {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	if !slices.Equal(keys, spdxTopLevelKeys) {
		return nil, errors.New("SPDX document top-level fields differ from the admitted apko profile")
	}
	if document["spdxVersion"] != "SPDX-2.3" || document["dataLicense"] != "CC0-1.0" ||
		document["SPDXID"] != "SPDXRef-DOCUMENT" {
		return nil, errors.New("SPDX version, data licence, or document identity is invalid")
	}
	for _, key := range []string{"name", "documentNamespace"} {
		value, ok := document[key].(string)
		if !ok || value == "" || len(value) > 2_048 || strings.ContainsAny(value, "\r\n\x00") {
			return nil, fmt.Errorf("SPDX %s is invalid", key)
		}
	}
	return document, nil
}

type canonicalRelationship struct {
	value     map[string]any
	canonical []byte
}

func validateSPDXGraph(document map[string]any, maximumPackages, maximumRelationships int) (int, []canonicalRelationship, error) {
	packages, ok := document["packages"].([]any)
	if !ok || len(packages) == 0 || len(packages) > maximumPackages {
		return 0, nil, errors.New("SPDX package inventory is outside its count boundary")
	}
	identities, err := spdxPackageIdentities(packages)
	if err != nil {
		return 0, nil, err
	}
	if err := validateDocumentDescribes(document["documentDescribes"], identities); err != nil {
		return 0, nil, err
	}
	values, ok := document["relationships"].([]any)
	if !ok || len(values) == 0 || len(values) > maximumRelationships {
		return 0, nil, errors.New("SPDX relationship graph is outside its count boundary")
	}
	relationships := make([]canonicalRelationship, 0, len(values))
	seen := make(map[string]struct{}, len(values))
	for _, value := range values {
		relationship, err := validateSPDXRelationship(value, identities)
		if err != nil {
			return 0, nil, err
		}
		key := string(relationship.canonical)
		if _, duplicate := seen[key]; duplicate {
			return 0, nil, errors.New("SPDX relationship graph repeats an edge")
		}
		seen[key] = struct{}{}
		relationships = append(relationships, relationship)
	}
	return len(packages), relationships, nil
}

func spdxPackageIdentities(packages []any) (map[string]struct{}, error) {
	identities := make(map[string]struct{}, len(packages))
	for _, value := range packages {
		pkg, ok := value.(map[string]any)
		if !ok {
			return nil, errors.New("SPDX package entry is not an object")
		}
		identity, ok := pkg["SPDXID"].(string)
		if !ok || !validSPDXElementID(identity) {
			return nil, errors.New("SPDX package identity is invalid")
		}
		if _, duplicate := identities[identity]; duplicate {
			return nil, fmt.Errorf("SPDX package identity %q is repeated", identity)
		}
		identities[identity] = struct{}{}
	}
	return identities, nil
}

func validateDocumentDescribes(value any, identities map[string]struct{}) error {
	described, ok := value.([]any)
	if !ok || len(described) != 1 {
		return errors.New("SPDX document must describe exactly one package identity")
	}
	identity, ok := described[0].(string)
	if !ok {
		return errors.New("SPDX described package identity is invalid")
	}
	if _, exists := identities[identity]; !exists {
		return errors.New("SPDX document describes an absent package identity")
	}
	return nil
}

func validateSPDXRelationship(value any, identities map[string]struct{}) (canonicalRelationship, error) {
	relationship, ok := value.(map[string]any)
	if !ok || len(relationship) != 3 {
		return canonicalRelationship{}, errors.New("SPDX relationship must contain exactly three fields")
	}
	for _, key := range []string{"spdxElementId", "relationshipType", "relatedSpdxElement"} {
		field, ok := relationship[key].(string)
		if !ok || field == "" || len(field) > 2_048 {
			return canonicalRelationship{}, fmt.Errorf("SPDX relationship field %s is invalid", key)
		}
	}
	typeName := relationship["relationshipType"].(string)
	if _, admitted := admittedSPDXRelationshipTypes[typeName]; !admitted {
		return canonicalRelationship{}, fmt.Errorf("SPDX relationship type %q is outside the admitted graph", typeName)
	}
	for _, key := range []string{"spdxElementId", "relatedSpdxElement"} {
		identity := relationship[key].(string)
		if _, exists := identities[identity]; !exists {
			return canonicalRelationship{}, fmt.Errorf("SPDX relationship references absent package %q", identity)
		}
	}
	canonical, err := json.Marshal(relationship)
	if err != nil {
		return canonicalRelationship{}, fmt.Errorf("encode canonical SPDX relationship: %w", err)
	}
	return canonicalRelationship{value: relationship, canonical: canonical}, nil
}

func validSPDXElementID(value string) bool {
	return strings.HasPrefix(value, "SPDXRef-") && len(value) <= 2_048 &&
		!strings.ContainsAny(value, " \t\r\n\x00")
}

func digestRaw(body []byte) string {
	digest := sha256.Sum256(body)
	return hex.EncodeToString(digest[:])
}
