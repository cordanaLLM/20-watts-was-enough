package engineeringrelations

import (
	"fmt"
	"regexp"
	"strings"
	"time"
)

const maximumPaths = 8

var (
	relationIDPattern = regexp.MustCompile(`^ER-[0-9]{4}$`)
	repositoryPattern = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9-]{0,38}/[A-Za-z0-9._-]{1,100}$`)
	commitPattern     = regexp.MustCompile(`^[0-9a-f]{40}$`)
	githubReference   = regexp.MustCompile(`^https://github\.com/([A-Za-z0-9-]+/[A-Za-z0-9._-]+)/(?:issues/[1-9][0-9]{0,9}|pull/[1-9][0-9]{0,9}|actions/runs/[1-9][0-9]{0,19}|releases/tag/[A-Za-z0-9._+-]{1,128}|blob/([0-9a-f]{40})/(.+))$`)
	auditReference    = regexp.MustCompile(`^research/audits/[a-z0-9][a-z0-9.-]{0,160}\.md$`)
)

func validateRows(relations []Relation, targets *targetIndex, report *collector) {
	seen := make(map[string]bool, len(relations))
	previous := ""
	for index, relation := range relations {
		label := fmt.Sprintf("%s relations[%d] (%s)", RegistryPath, index, relation.ID)
		previous = checkIdentity(label, relation.ID, previous, seen, report)
		checkVocabulary(label, relation, report)
		checkTarget(label, relation, targets, report)
		checkLocator(label, relation, report)
		checkEvidence(label, relation, targets.repository, report)
		checkText(label, relation, report)
	}
}

// checkIdentity requires unique ascending ER-NNNN identities and returns the
// highest identity seen so far.
func checkIdentity(label, id, previous string, seen map[string]bool, report *collector) string {
	if !relationIDPattern.MatchString(id) {
		report.add("%s: id must match ER-NNNN", label)
		return previous
	}
	if seen[id] {
		report.add("%s: id is repeated", label)
		return previous
	}
	seen[id] = true
	if id <= previous {
		report.add("%s: ids must be in ascending order", label)
		return previous
	}
	return id
}

func checkVocabulary(label string, relation Relation, report *collector) {
	roles, knownRelation := relationRoles[relation.Relation]
	if !knownRelation {
		report.add("%s: relation %q is not one of %s", label, relation.Relation, strings.Join(RelationNames(), ", "))
	}
	if !knownRoles[relation.Role] {
		report.add("%s: role %q is not one of %s", label, relation.Role, strings.Join(RoleNames(), ", "))
	}
	if knownRelation && knownRoles[relation.Role] && !roles[relation.Role] {
		report.add("%s: relation %s does not admit role %s", label, relation.Relation, relation.Role)
	}
	checkConditionalFields(label, relation, report)
}

// checkConditionalFields enforces the fields that one relation or role
// requires and every other combination forbids.
func checkConditionalFields(label string, relation Relation, report *collector) {
	if (relation.Role == "candidate-arm") != (relation.Residual != nil) {
		report.add("%s: residual is required for role candidate-arm and forbidden otherwise", label)
	}
	if (relation.Relation == "measures") != (relation.Metric != nil) {
		report.add("%s: metric is required for relation measures and forbidden otherwise", label)
	}
	if relation.Relation == "measures" && relation.EvidenceRef == nil {
		report.add("%s: relation measures requires a non-null evidence_ref", label)
	}
}

func checkLocator(label string, relation Relation, report *collector) {
	if !repositoryPattern.MatchString(relation.Repository) || strings.Contains(relation.Repository, "..") {
		report.add("%s: repository must be owner/name", label)
	}
	if strings.EqualFold(relation.Repository, selfRepository) {
		report.add("%s: this repository's own artifacts use workstation manifests, not relation rows", label)
	}
	switch relation.Visibility {
	case "public":
	case "private":
		report.add("%s: private repositories are outside the first slice; a later slice may admit one only behind a 20w audit (decision 0087)", label)
	default:
		report.add("%s: visibility must be public", label)
	}
	if !commitPattern.MatchString(relation.Commit) {
		report.add("%s: commit must be a full 40-character lowercase hexadecimal SHA", label)
	}
	checkPaths(label, relation.Paths, report)
}

func checkPaths(label string, paths []string, report *collector) {
	if len(paths) == 0 || len(paths) > maximumPaths {
		report.add("%s: paths must hold between 1 and %d entries", label, maximumPaths)
		return
	}
	seen := make(map[string]bool, len(paths))
	for _, candidate := range paths {
		if !cleanRelativePath(candidate) {
			report.add("%s: path %q must be a clean relative path inside the repository", label, candidate)
		}
		if seen[candidate] {
			report.add("%s: path %q is repeated", label, candidate)
		}
		seen[candidate] = true
	}
}

// checkEvidence admits null, an audit in this repository, or a GitHub locator
// inside the row's repository; a blob locator must use the row's commit.
func checkEvidence(label string, relation Relation, repo repository, report *collector) {
	if relation.EvidenceRef == nil {
		return
	}
	reference := *relation.EvidenceRef
	if auditReference.MatchString(reference) {
		if _, err := repo.regularFile(reference); err != nil {
			report.add("%s: evidence_ref: %v", label, err)
		}
		return
	}
	match := githubReference.FindStringSubmatch(reference)
	if match == nil {
		report.add("%s: evidence_ref must be null, a research/audits record, or a GitHub issue, pull request, workflow run, release tag or commit-pinned blob URL", label)
		return
	}
	if match[1] != relation.Repository {
		report.add("%s: evidence_ref must point into %s", label, relation.Repository)
	}
	if match[2] != "" && (match[2] != relation.Commit || !cleanRelativePath(match[3])) {
		report.add("%s: a blob evidence_ref must use the row commit and a clean path", label)
	}
}

func checkRecorded(label, recorded string, report *collector) {
	parsed, err := time.Parse(time.DateOnly, recorded)
	if err != nil || parsed.Format(time.DateOnly) != recorded {
		report.add("%s: recorded must be a calendar date in YYYY-MM-DD form", label)
	}
}
