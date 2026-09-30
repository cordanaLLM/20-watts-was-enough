package engineeringrelations

import (
	"bytes"
	"fmt"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
)

func TestValidateAcceptsAClosedNumberFreeRegistry(t *testing.T) {
	t.Parallel()
	registry := validRegistry()
	requireValid(t, validateBody(t, encode(t, registry)), len(registry.Relations))
}

func TestValidateAcceptsTheBoundaryValues(t *testing.T) {
	t.Parallel()
	registry := validRegistry()
	registry.Relations[0].Paths = []string{"a", "b", "c", "d", "e", "f", "g", "h"}
	registry.Relations[0].Subject = strings.Repeat("s", maximumShortText)
	registry.Relations[0].DoesNotEstablish = strings.Repeat("d", maximumBoundaryText)
	requireValid(t, validateBody(t, encode(t, registry)), len(registry.Relations))
}

func TestValidateAcceptsTheMaximumRelationCountAndRejectsOneMore(t *testing.T) {
	t.Parallel()
	for _, count := range []int{maximumRelations, maximumRelations + 1} {
		registry := validRegistry()
		template := registry.Relations[0]
		registry.Relations = make([]Relation, count)
		for index := range registry.Relations {
			registry.Relations[index] = template
			registry.Relations[index].ID = fmt.Sprintf("ER-%04d", index+1)
		}
		result := validateBody(t, encode(t, registry))
		if count == maximumRelations {
			requireValid(t, result, count)
			continue
		}
		requireError(t, result, "more than 1024 relations")
	}
}

func TestValidateAcceptsAnEmptyRegistry(t *testing.T) {
	t.Parallel()
	registry := validRegistry()
	registry.Relations = []Relation{}
	requireValid(t, validateBody(t, encode(t, registry)), 0)
}

// Every mutation breaks exactly one rule of decision 0087.
func TestValidateRejectsEachRuleViolation(t *testing.T) {
	t.Parallel()
	for _, test := range registryMutations {
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()
			registry := validRegistry()
			test.mutate(&registry)
			requireError(t, validateBody(t, encode(t, registry)), test.want)
		})
	}
}

// Every raw edit breaks the byte-level contract before any row is read.
func TestValidateRejectsAmbiguousOrNumericRegistryBytes(t *testing.T) {
	t.Parallel()
	for _, test := range byteMutations {
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()
			body := encode(t, validRegistry())
			mutated := test.mutate(body)
			if bytes.Equal(mutated, body) {
				t.Fatalf("mutation %q left the registry unchanged", test.name)
			}
			requireError(t, validateBody(t, mutated), test.want)
		})
	}
}

func TestValidateRejectsAClaimsLedgerThatCitesARelation(t *testing.T) {
	t.Parallel()
	for _, citation := range []string{"see research/engineering-relations.json", "per ER-0003"} {
		root := fixtureRepository(t)
		writeRegistry(t, root, encode(t, validRegistry()))
		writeFile(t, root, claimsLedgerPath, "### C-001\n\n"+citation+"\n")
		requireError(t, Validate(root), "a relation is never claim evidence")
	}
}

func TestValidateRejectsMissingAuthorityFiles(t *testing.T) {
	t.Parallel()
	for _, relative := range []string{DecisionPath, claimsLedgerPath, principleRegistry, RegistryPath} {
		root := fixtureRepository(t)
		writeRegistry(t, root, encode(t, validRegistry()))
		if err := os.Remove(filepath.Join(root, filepath.FromSlash(relative))); err != nil {
			t.Fatal(err)
		}
		if result := Validate(root); len(result.Errors) == 0 {
			t.Fatalf("Validate() without %s passed", relative)
		}
	}
}

func TestValidateRejectsASymlinkedRegistry(t *testing.T) {
	t.Parallel()
	root := fixtureRepository(t)
	outside := filepath.Join(t.TempDir(), "relations.json")
	if err := os.WriteFile(outside, encode(t, validRegistry()), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(outside, filepath.Join(root, filepath.FromSlash(RegistryPath))); err != nil {
		t.Skipf("symlink creation is unavailable on this platform: %v", err)
	}
	requireError(t, Validate(root), "must be a regular file")
}

func TestValidateRejectsARootThatIsNotADirectory(t *testing.T) {
	t.Parallel()
	file := filepath.Join(t.TempDir(), "root")
	if err := os.WriteFile(file, []byte("x"), 0o644); err != nil {
		t.Fatal(err)
	}
	requireError(t, Validate(file), "repository root must be a directory")
}

func TestValidateBoundsItsDiagnostics(t *testing.T) {
	t.Parallel()
	registry := validRegistry()
	template := registry.Relations[0]
	template.Commit = "short"
	registry.Relations = make([]Relation, maximumDiagnostics+10)
	for index := range registry.Relations {
		registry.Relations[index] = template
		registry.Relations[index].ID = fmt.Sprintf("ER-%04d", index+1)
	}
	result := validateBody(t, encode(t, registry))
	if len(result.Errors) != maximumDiagnostics+1 {
		t.Fatalf("Validate() returned %d diagnostics, want %d", len(result.Errors), maximumDiagnostics+1)
	}
	requireError(t, result, "diagnostics stopped after 200 errors")
}

func TestCanonicalIsStableAcrossADecodeRoundTrip(t *testing.T) {
	t.Parallel()
	body := encode(t, validRegistry())
	decoded, err := decodeRegistry(body)
	if err != nil {
		t.Fatalf("decodeRegistry(canonical) error = %v", err)
	}
	again, err := Canonical(decoded)
	if err != nil || !bytes.Equal(again, body) || !bytes.HasSuffix(body, []byte("}\n")) {
		t.Fatalf("Canonical(round trip) changed the bytes or lost the final newline: %v", err)
	}
}

func TestVocabulariesAreSortedAndClosed(t *testing.T) {
	t.Parallel()
	wantRelations := []string{"feasibility", "implements", "measures", "motivated-by"}
	wantRoles := []string{"candidate-arm", "fixture-stressor", "harness", "metric-instrument", "motivation", "null-arm"}
	if got := RelationNames(); !reflect.DeepEqual(got, wantRelations) {
		t.Fatalf("RelationNames() = %q, want %q", got, wantRelations)
	}
	if got := RoleNames(); !reflect.DeepEqual(got, wantRoles) {
		t.Fatalf("RoleNames() = %q, want %q", got, wantRoles)
	}
	if relationRoles["measures"]["candidate-arm"] || !relationRoles["motivated-by"]["motivation"] {
		t.Fatal("measures must never admit candidate-arm, and motivated-by must admit motivation")
	}
}
