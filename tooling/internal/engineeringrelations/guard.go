package engineeringrelations

import (
	"regexp"
	"strings"
)

const (
	manifestDirectory    = "experiments/workstation/manifests"
	maximumClaimsBytes   = 16 << 20
	maximumManifestBytes = 1 << 20
)

// citationPattern finds a citation of the registry, of a relation identity or
// of a Praetor evidence record.
var citationPattern = regexp.MustCompile(`engineering-relations|praetor-evidence:|\bER-[0-9]{4}\b`)

// guardEvidenceAuthorities keeps the claims ledger and the workstation
// manifests, whose promotion evidence gates a result, from citing the
// registry, a relation or an evidence record.
func guardEvidenceAuthorities(repo repository, report *collector) {
	guardFile(repo, claimsLedgerPath, maximumClaimsBytes, report)
	entries, err := repo.entries(manifestDirectory)
	if err != nil {
		report.add("%v", err)
		return
	}
	for _, entry := range entries {
		if strings.HasSuffix(entry.Name(), ".json") {
			guardFile(repo, manifestDirectory+"/"+entry.Name(), maximumManifestBytes, report)
		}
	}
}

func guardFile(repo repository, relative string, maximumBytes int64, report *collector) {
	body, err := repo.read(relative, maximumBytes)
	if err != nil {
		report.add("%v", err)
		return
	}
	if match := citationPattern.Find(body); match != nil {
		report.add("%s cites %q; a relation is never claim or promotion evidence (decision 0087)", relative, match)
	}
}
