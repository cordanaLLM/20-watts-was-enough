// Package engineeringrelations validates the number-free registry that relates
// 20w experiment contracts, principles and energy hypotheses to code in other
// repositories. A relation has no evidential authority (decision 0087): the
// registry declares NO_RESULT, never targets a claim and holds no JSON number.
package engineeringrelations

import (
	"fmt"
	"sort"
)

const (
	// RegistryPath is the repository-relative location of the registry.
	RegistryPath = "research/engineering-relations.json"
	// SchemaIdentifier names the registry format. It is a string so that the
	// registry contains no JSON number at all.
	SchemaIdentifier = "20w-engineering-relations/1"
	// ResultAuthority is the only authority a registry may declare.
	ResultAuthority = "NO_RESULT"
	// DecisionPath is the decision record that governs the registry.
	DecisionPath = "decisions/0087-record-engineering-relations-without-evidential-authority.md"

	claimsLedgerPath     = "research/claims.md"
	principleRegistry    = "research/principle-registry.md"
	energyModelPath      = "concept/80-energy-model.md"
	candidateDirectory   = "experiments/candidates"
	fixtureDirectory     = "experiments/fixtures"
	selfRepository       = "cordanallm/20-watts-was-enough"
	maximumRegistryBytes = 1 << 20
	maximumRelations     = 1024
	maximumJSONDepth     = 4
	maximumDiagnostics   = 200
)

// Registry is the closed top-level registry document. Field order is the
// canonical key order of the tracked file.
type Registry struct {
	Schema          string     `json:"schema"`
	ResultAuthority string     `json:"result_authority"`
	Decision        string     `json:"decision"`
	Relations       []Relation `json:"relations"`
}

// Relation is one closed registry row. Pointer fields are optional, except
// EvidenceRef, which must be present and may be null.
type Relation struct {
	ID               string   `json:"id"`
	Target           string   `json:"target"`
	TargetSection    *string  `json:"target_section,omitempty"`
	Relation         string   `json:"relation"`
	Role             string   `json:"role"`
	Residual         *string  `json:"residual,omitempty"`
	Metric           *string  `json:"metric,omitempty"`
	Subject          string   `json:"subject"`
	Repository       string   `json:"repository"`
	Visibility       string   `json:"visibility"`
	Commit           string   `json:"commit"`
	Paths            []string `json:"paths"`
	EvidenceRef      *string  `json:"evidence_ref"`
	RelatedParty     bool     `json:"related_party"`
	Recorded         string   `json:"recorded"`
	DoesNotEstablish string   `json:"does_not_establish"`
}

// Result reports one validation run. An empty Errors slice means the registry
// passed.
type Result struct {
	Relations int
	Errors    []string
}

// relationRoles is the closed relation-by-role matrix of decision 0087.
var relationRoles = map[string]map[string]bool{
	"implements":   {"candidate-arm": true, "null-arm": true, "harness": true, "fixture-stressor": true},
	"measures":     {"metric-instrument": true, "null-arm": true},
	"feasibility":  {"candidate-arm": true, "null-arm": true, "harness": true, "fixture-stressor": true, "metric-instrument": true},
	"motivated-by": {"motivation": true},
}

var knownRoles = map[string]bool{
	"candidate-arm": true, "null-arm": true, "fixture-stressor": true,
	"harness": true, "metric-instrument": true, "motivation": true,
}

// RelationNames returns the closed relation vocabulary in sorted order.
func RelationNames() []string {
	names := make([]string, 0, len(relationRoles))
	for name := range relationRoles {
		names = append(names, name)
	}
	sort.Strings(names)
	return names
}

// RoleNames returns the closed role vocabulary in sorted order.
func RoleNames() []string {
	names := make([]string, 0, len(knownRoles))
	for name := range knownRoles {
		names = append(names, name)
	}
	sort.Strings(names)
	return names
}

// Validate checks the registry beneath root without network access. It reads
// only the registry, the decision record, the claims ledger, the workstation
// manifests and the files its targets name.
func Validate(root string) Result {
	report := &collector{}
	repo, err := openRepository(root)
	if err != nil {
		report.add("%v", err)
		return report.result(0)
	}
	registry, err := loadRegistry(repo)
	if err != nil {
		report.add("%s: %v", RegistryPath, err)
		return report.result(0)
	}
	validateHeader(repo, registry, report)
	targets := newTargetIndex(repo, report)
	validateRows(registry.Relations, targets, report)
	guardEvidenceAuthorities(repo, report)
	return report.result(len(registry.Relations))
}

func validateHeader(repo repository, registry Registry, report *collector) {
	if registry.Schema != SchemaIdentifier {
		report.add("%s: schema must be %q", RegistryPath, SchemaIdentifier)
	}
	if registry.ResultAuthority != ResultAuthority {
		report.add("%s: result_authority must be %q; a relation carries no result (decision 0087)", RegistryPath, ResultAuthority)
	}
	if registry.Decision != DecisionPath {
		report.add("%s: decision must name %s", RegistryPath, DecisionPath)
		return
	}
	if _, err := repo.regularFile(registry.Decision); err != nil {
		report.add("%s: decision: %v", RegistryPath, err)
	}
}

// collector keeps a bounded, ordered list of diagnostics.
type collector struct {
	errors    []string
	truncated bool
}

func (report *collector) add(format string, arguments ...any) {
	if len(report.errors) >= maximumDiagnostics {
		report.truncated = true
		return
	}
	report.errors = append(report.errors, fmt.Sprintf(format, arguments...))
}

func (report *collector) result(relations int) Result {
	errors := report.errors
	if report.truncated {
		errors = append(errors, fmt.Sprintf("diagnostics stopped after %d errors", maximumDiagnostics))
	}
	return Result{Relations: relations, Errors: errors}
}
