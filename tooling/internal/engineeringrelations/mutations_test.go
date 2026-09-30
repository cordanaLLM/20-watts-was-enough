package engineeringrelations

import (
	"bytes"
	"strings"
)

// Row indexes in validRegistry.
const (
	rowArms       = 0
	rowMeasured   = 1
	rowResidual   = 2
	rowInstrument = 3
	rowPrinciple  = 4
	rowEnergy     = 5
)

type registryMutation struct {
	name   string
	mutate func(*Registry)
	want   string
}

var registryMutations = []registryMutation{
	{"claim target", func(r *Registry) { r.Relations[rowArms].Target = "C-0001" }, "a C- claim is never a target"},
	{"namespaced claim target", func(r *Registry) { r.Relations[rowArms].Target = "20w:C-001" }, "a C- claim is never a target"},
	{"claim in subject", func(r *Registry) { r.Relations[rowArms].Subject = "Relates to 20w:C-001" }, "cites claim C-001"},
	{"bare claim in boundary", func(r *Registry) { r.Relations[rowArms].DoesNotEstablish = "C-001 support" }, "cites claim C-001"},
	{"unknown relation", func(r *Registry) { r.Relations[rowArms].Relation = "supports" }, `relation "supports" is not one of`},
	{"unknown role", func(r *Registry) { r.Relations[rowArms].Role = "arm" }, `role "arm" is not one of`},
	{"role outside the matrix", func(r *Registry) { r.Relations[rowMeasured].Role = "harness" }, "does not admit role harness"},
	{"measures a candidate arm", func(r *Registry) {
		r.Relations[rowResidual].Relation = "measures"
		r.Relations[rowResidual].Metric = pointer("containment and restoration time")
	}, "does not admit role candidate-arm"},
	{"unqualified external identifier", func(r *Registry) {
		r.Relations[rowPrinciple].Subject = "Implements Locality Enforcement rule P-002"
	}, "names P-002 without a namespace"},
	{"unqualified 20w identifier", func(r *Registry) { r.Relations[rowEnergy].DoesNotEstablish = "Support for H-E1" }, "names H-E1 without a namespace"},
	{"short commit", func(r *Registry) { r.Relations[rowArms].Commit = "c0bda85" }, "full 40-character lowercase hexadecimal SHA"},
	{"upper-case commit", func(r *Registry) { r.Relations[rowArms].Commit = strings.ToUpper(testCommit) }, "full 40-character lowercase hexadecimal SHA"},
	{"duplicate id", func(r *Registry) { r.Relations[rowMeasured].ID = r.Relations[rowArms].ID }, "id is repeated"},
	{"descending id", func(r *Registry) {
		r.Relations[rowArms].ID, r.Relations[rowMeasured].ID = r.Relations[rowMeasured].ID, r.Relations[rowArms].ID
	}, "ids must be in ascending order"},
	{"malformed id", func(r *Registry) { r.Relations[rowArms].ID = "ER-1" }, "id must match ER-NNNN"},
	{"result authority other than NO_RESULT", func(r *Registry) { r.ResultAuthority = "RESULT" }, `result_authority must be "NO_RESULT"`},
	{"other schema", func(r *Registry) { r.Schema = "20w-engineering-relations/2" }, "schema must be"},
	{"other decision", func(r *Registry) { r.Decision = "decisions/0001-git-is-canonical.md" }, "decision must name"},
	{"private repository in the first slice", func(r *Registry) { r.Relations[rowArms].Visibility = "private" }, "private repositories are outside the first slice"},
	{"unknown visibility", func(r *Registry) { r.Relations[rowArms].Visibility = "internal" }, "visibility must be public"},
	{"this repository", func(r *Registry) { r.Relations[rowArms].Repository = "cordanaLLM/20-watts-was-enough" }, "own artifacts use workstation manifests"},
	{"repository without owner", func(r *Registry) { r.Relations[rowArms].Repository = "code" }, "repository must be owner/name"},
	{"candidate arm without residual", func(r *Registry) { r.Relations[rowResidual].Residual = nil }, "residual is required for role candidate-arm"},
	{"residual on a null arm", func(r *Registry) { r.Relations[rowArms].Residual = pointer("x") }, "residual is required for role candidate-arm"},
	{"candidate arm on a principle", func(r *Registry) {
		r.Relations[rowPrinciple].Role = "candidate-arm"
		r.Relations[rowPrinciple].Relation = "feasibility"
		r.Relations[rowPrinciple].Residual = pointer("x")
	}, "needs a candidate-NNN target"},
	{"fixture stressor on a candidate", func(r *Registry) { r.Relations[rowArms].Role = "fixture-stressor" }, "needs a fixture-NNN target"},
	{"measures without metric", func(r *Registry) { r.Relations[rowMeasured].Metric = nil }, "metric is required for relation measures"},
	{"metric without measures", func(r *Registry) { r.Relations[rowArms].Metric = pointer("containment and restoration time") }, "metric is required for relation measures"},
	{"measures without evidence", func(r *Registry) { r.Relations[rowMeasured].EvidenceRef = nil }, "requires a non-null evidence_ref"},
	{"metric the target does not name", func(r *Registry) { r.Relations[rowMeasured].Metric = pointer("joules per token") }, "does not quote a measurement"},
	{"section without heading", func(r *Registry) { r.Relations[rowArms].TargetSection = pointer("kill-criteria") }, "names no heading"},
	{"section inside a code fence", func(r *Registry) { r.Relations[rowArms].TargetSection = pointer("fenced-heading") }, "names no heading"},
	{"section that is not a slug", func(r *Registry) { r.Relations[rowArms].TargetSection = pointer("Arms") }, "is not a heading slug"},
	{"section on a principle", func(r *Registry) { r.Relations[rowPrinciple].TargetSection = pointer("arms") }, "applies only to candidate and fixture targets"},
	{"unknown candidate", func(r *Registry) { r.Relations[rowArms].Target = "candidate-099" }, "candidate-099 has no contract file"},
	{"undefined principle", func(r *Registry) { r.Relations[rowPrinciple].Target = "P-999" }, "P-999 is not defined"},
	{"undefined energy hypothesis", func(r *Registry) { r.Relations[rowEnergy].Target = "energy:H-E9" }, "H-E9 is not defined"},
	{"topic-qualified target", func(r *Registry) { r.Relations[rowArms].Target = "ants/candidate-010" }, "topic-qualified targets"},
	{"target outside the grammar", func(r *Registry) { r.Relations[rowArms].Target = "chapter:80" }, "is not candidate-NNN"},
	{"evidence in another repository", func(r *Registry) {
		r.Relations[rowMeasured].EvidenceRef = pointer("https://github.com/other/code/issues/7")
	}, "evidence_ref must point into example/code"},
	{"blob evidence at another commit", func(r *Registry) {
		r.Relations[rowResidual].EvidenceRef = pointer("https://github.com/example/code/blob/" + strings.Repeat("b", 40) + "/docs/run.md")
	}, "a blob evidence_ref must use the row commit"},
	{"evidence outside the grammar", func(r *Registry) { r.Relations[rowMeasured].EvidenceRef = pointer("https://example.com/run") }, "evidence_ref must be null"},
	{"missing audit evidence", func(r *Registry) {
		r.Relations[rowInstrument].EvidenceRef = pointer("research/audits/2026-01-01-missing.md")
	}, "evidence_ref: inspect research/audits/2026-01-01-missing.md"},
	{"no path", func(r *Registry) { r.Relations[rowArms].Paths = []string{} }, "paths must hold between 1 and 8 entries"},
	{"nine paths", func(r *Registry) {
		r.Relations[rowArms].Paths = []string{"a", "b", "c", "d", "e", "f", "g", "h", "i"}
	}, "paths must hold between 1 and 8 entries"},
	{"parent path", func(r *Registry) { r.Relations[rowArms].Paths = []string{"../secret"} }, "must be a clean relative path"},
	{"absolute path", func(r *Registry) { r.Relations[rowArms].Paths = []string{"/etc/passwd"} }, "must be a clean relative path"},
	{"drive path", func(r *Registry) { r.Relations[rowArms].Paths = []string{"C:/code.go"} }, "must be a clean relative path"},
	{"repeated path", func(r *Registry) { r.Relations[rowArms].Paths = []string{"a.go", "a.go"} }, `path "a.go" is repeated`},
	{"evidential verb", func(r *Registry) { r.Relations[rowArms].Subject = "Canary that proves the update is safe" }, "evidential verb"},
	{"subject over its bound", func(r *Registry) { r.Relations[rowArms].Subject = strings.Repeat("s", maximumShortText+1) }, "subject exceeds 200 characters"},
	{"boundary over its bound", func(r *Registry) {
		r.Relations[rowArms].DoesNotEstablish = strings.Repeat("d", maximumBoundaryText+1)
	}, "does_not_establish exceeds 300 characters"},
	{"empty subject", func(r *Registry) { r.Relations[rowArms].Subject = "" }, "subject must be non-empty"},
	{"control character", func(r *Registry) { r.Relations[rowArms].Subject = "tab\there" }, "subject contains a control character"},
	{"impossible date", func(r *Registry) { r.Relations[rowArms].Recorded = "2026-02-30" }, "recorded must be a calendar date"},
}

type byteMutation struct {
	name   string
	mutate func([]byte) []byte
	want   string
}

func replaceOnce(old, replacement string) func([]byte) []byte {
	return func(body []byte) []byte {
		return bytes.Replace(body, []byte(old), []byte(replacement), 1)
	}
}

var byteMutations = []byteMutation{
	{"numeric flag", replaceOnce(`"related_party": true`, `"related_party": 1`), "admits no numeric field"},
	{"numeric schema", replaceOnce(`"schema": "20w-engineering-relations/1"`, `"schema": 1`), "line 2 holds the number 1"},
	{"missing result authority", replaceOnce(`  "result_authority": "NO_RESULT",`+"\n", ""), `missing required key "result_authority"`},
	{"missing row boundary", replaceOnce(`,
      "does_not_establish": "Any advantage of candidate 010; any 20w claim"`, ""), `missing required key "does_not_establish"`},
	{"null subject", replaceOnce(`"subject": "Canary that runs tests in a disposable worktree"`, `"subject": null`), `key "subject" must not be null`},
	{"null optional section", replaceOnce(`"target_section": "arms"`, `"target_section": null`), `key "target_section" must not be null`},
	{"unknown key", replaceOnce(`"id": "ER-0001",`, `"id": "ER-0001", "weight": "heavy",`), "unknown field"},
	{"repeated key", replaceOnce(`"id": "ER-0001",`, `"id": "ER-0001", "id": "ER-0001",`), "repeats name"},
	{"trailing data", func(body []byte) []byte { return append(append([]byte{}, body...), "{}"...) }, "trailing data"},
	{"compact encoding", func(body []byte) []byte { return bytes.ReplaceAll(body, []byte("\n  "), []byte("\n ")) }, "canonical form"},
	{"CRLF line endings", func(body []byte) []byte { return bytes.ReplaceAll(body, []byte("\n"), []byte("\r\n")) }, "canonical form"},
	{"missing final newline", func(body []byte) []byte { return bytes.TrimSuffix(body, []byte("\n")) }, "canonical form"},
	{"escaped unicode", replaceOnce(`"Canary that runs`, `"Can\u0061ry that runs`), "canonical form"},
	{"invalid UTF-8", replaceOnce("Canary", "Can\xffary"), "not valid UTF-8"},
	{"not an object", func([]byte) []byte { return []byte("[]\n") }, "decode registry object"},
	{"oversized", func(body []byte) []byte {
		return append(bytes.Repeat([]byte(" "), maximumRegistryBytes), body...)
	}, "exceeds the 1048576-byte limit"},
}
