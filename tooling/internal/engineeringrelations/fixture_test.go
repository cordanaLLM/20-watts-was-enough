package engineeringrelations

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

const (
	testCommit     = "0123456789abcdef0123456789abcdef01234567"
	testRepository = "example/code"
)

// supportFiles is the smallest repository the validator can resolve targets
// against. The fenced heading must never satisfy a target_section.
var supportFiles = map[string]string{
	DecisionPath:      "# 0087\n",
	claimsLedgerPath:  "### C-001\n",
	principleRegistry: "## P-003 — Temporary trace before commitment\n\nordinary two-phase confirmation\n",
	energyModelPath:   "### H-E1 — Conditional execution\n\nnode joules per qualified event\n",
	candidateDirectory + "/010-reset-coupled-staged-verification.md": "# Candidate 010\n\n## Arms\n\n5. retry plus rollback;\n\n" +
		"## Measurements\n\n- p50/p95/p99 containment and restoration time;\n\n```text\n## Fenced heading\n```\n",
	candidateDirectory + "/README.md":                                    "# Candidates\n",
	fixtureDirectory + "/012-layout-randomized-performance-inference.md": "## Arms and strongest nulls\n\n- apparent speedup fraction (`1`);\n",
	"research/audits/2026-08-30-example-audit.md":                        "# Audit\n",
}

func pointer(value string) *string { return &value }

func writeFile(t *testing.T, root, relative, content string) {
	t.Helper()
	full := filepath.Join(root, filepath.FromSlash(relative))
	if err := os.MkdirAll(filepath.Dir(full), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(full, []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}
}

func fixtureRepository(t *testing.T) string {
	t.Helper()
	root := t.TempDir()
	for relative, content := range supportFiles {
		writeFile(t, root, relative, content)
	}
	return root
}

func baseRelation(id, target, relation, role string) Relation {
	return Relation{
		ID: id, Target: target, Relation: relation, Role: role,
		Subject:    "Canary that runs tests in a disposable worktree",
		Repository: testRepository, Visibility: "public", Commit: testCommit,
		Paths: []string{"internal/canary.go"}, RelatedParty: true, Recorded: "2026-09-30",
		DoesNotEstablish: "Any advantage of candidate 010; any 20w claim",
	}
}

// validRegistry exercises every relation, every role and every evidence
// reference form once.
func validRegistry() Registry {
	arms := baseRelation("ER-0001", "candidate-010", "implements", "null-arm")
	arms.TargetSection = pointer("arms")
	measured := baseRelation("ER-0002", "candidate-010", "measures", "null-arm")
	measured.Metric = pointer("containment and restoration time")
	measured.EvidenceRef = pointer("https://github.com/example/code/issues/7")
	residual := baseRelation("ER-0003", "candidate-010", "feasibility", "candidate-arm")
	residual.Residual = pointer("Reset coupled to a conditional verifier")
	residual.EvidenceRef = pointer("https://github.com/example/code/blob/" + testCommit + "/docs/run.md")
	instrument := baseRelation("ER-0004", "fixture-012", "measures", "metric-instrument")
	instrument.TargetSection = pointer("arms-and-strongest-nulls")
	instrument.Metric = pointer("apparent speedup fraction")
	instrument.EvidenceRef = pointer("research/audits/2026-08-30-example-audit.md")
	principle := baseRelation("ER-0005", "P-003", "implements", "null-arm")
	principle.Subject = "Queue unlike the aegis:P-002 locality rule"
	principle.DoesNotEstablish = "That 20w:P-003 beats two-phase confirmation"
	energy := baseRelation("ER-0006", "energy:H-E1", "feasibility", "null-arm")
	stressor := baseRelation("ER-0007", "fixture-012", "implements", "fixture-stressor")
	harness := baseRelation("ER-0008", "candidate-010", "feasibility", "harness")
	motivation := baseRelation("ER-0009", "candidate-010", "motivated-by", "motivation")
	return Registry{
		Schema: SchemaIdentifier, ResultAuthority: ResultAuthority, Decision: DecisionPath,
		Relations: []Relation{arms, measured, residual, instrument, principle, energy, stressor, harness, motivation},
	}
}

func encode(t *testing.T, registry Registry) []byte {
	t.Helper()
	body, err := Canonical(registry)
	if err != nil {
		t.Fatal(err)
	}
	return body
}

func writeRegistry(t *testing.T, root string, body []byte) {
	t.Helper()
	writeFile(t, root, RegistryPath, string(body))
}

func validateBody(t *testing.T, body []byte) Result {
	t.Helper()
	root := fixtureRepository(t)
	writeRegistry(t, root, body)
	return Validate(root)
}

func requireValid(t *testing.T, result Result, relations int) {
	t.Helper()
	if len(result.Errors) != 0 || result.Relations != relations {
		t.Fatalf("Validate() = %d relations, errors %q; want %d relations and no error", result.Relations, result.Errors, relations)
	}
}

func requireError(t *testing.T, result Result, want string) {
	t.Helper()
	for _, message := range result.Errors {
		if strings.Contains(message, want) {
			return
		}
	}
	t.Fatalf("Validate() errors = %q, want one containing %q", result.Errors, want)
}
