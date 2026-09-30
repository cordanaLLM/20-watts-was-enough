package engineeringrelations

import (
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"testing"
)

type schemaEnum struct {
	Const string   `json:"const"`
	Enum  []string `json:"enum"`
}

type trackedSchema struct {
	Required   []string `json:"required"`
	Properties struct {
		Schema          schemaEnum `json:"schema"`
		ResultAuthority schemaEnum `json:"result_authority"`
		Decision        schemaEnum `json:"decision"`
	} `json:"properties"`
	Definitions struct {
		Relation struct {
			Required   []string                   `json:"required"`
			Properties map[string]json.RawMessage `json:"properties"`
		} `json:"relation"`
	} `json:"$defs"`
}

func readTrackedSchema(t *testing.T) trackedSchema {
	t.Helper()
	path := filepath.Join("..", "..", "..", filepath.FromSlash("research/engineering-relations.schema.json"))
	body, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read tracked schema: %v", err)
	}
	var schema trackedSchema
	if err := json.Unmarshal(body, &schema); err != nil {
		t.Fatalf("decode tracked schema: %v", err)
	}
	return schema
}

func schemaVocabulary(t *testing.T, schema trackedSchema, key string) []string {
	t.Helper()
	var enum schemaEnum
	if err := json.Unmarshal(schema.Definitions.Relation.Properties[key], &enum); err != nil {
		t.Fatalf("decode schema property %s: %v", key, err)
	}
	return enum.Enum
}

// The documentary schema must not drift from the Go validator's fixed values,
// vocabularies and key sets.
func TestTrackedSchemaMatchesTheValidatorContract(t *testing.T) {
	t.Parallel()
	schema := readTrackedSchema(t)
	fixed := schema.Properties
	if fixed.Schema.Const != SchemaIdentifier || fixed.ResultAuthority.Const != ResultAuthority || fixed.Decision.Const != DecisionPath {
		t.Fatalf("schema fixed values = %q/%q/%q", fixed.Schema.Const, fixed.ResultAuthority.Const, fixed.Decision.Const)
	}
	if !reflect.DeepEqual(schema.Required, registryKeys) || !reflect.DeepEqual(schema.Definitions.Relation.Required, relationKeys) {
		t.Fatalf("schema required keys = %q and %q", schema.Required, schema.Definitions.Relation.Required)
	}
	if got := schemaVocabulary(t, schema, "relation"); !reflect.DeepEqual(got, RelationNames()) {
		t.Fatalf("schema relations = %q, want %q", got, RelationNames())
	}
	if got := schemaVocabulary(t, schema, "role"); !reflect.DeepEqual(got, RoleNames()) {
		t.Fatalf("schema roles = %q, want %q", got, RoleNames())
	}
	if len(schema.Definitions.Relation.Properties) != len(allRelationKeys) {
		t.Fatalf("schema declares %d relation properties, want %d", len(schema.Definitions.Relation.Properties), len(allRelationKeys))
	}
}
