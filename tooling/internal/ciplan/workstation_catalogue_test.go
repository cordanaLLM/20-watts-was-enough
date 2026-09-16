package ciplan

import (
	"strings"
	"testing"
)

func TestParseWorkstationCatalogueRejectsAmbiguousAndMalformedAuthority(t *testing.T) {
	t.Parallel()
	valid := `{"schema":1,"core_script":"test:workstation:core","jobs":[{"lane":"workstation-fixture-007","artifact":"fixture-007","script":"test:workstation:fixture-007","creation_rank":1}]}`
	for name, body := range map[string]string{
		"duplicate field":  strings.Replace(valid, `"schema":1`, `"schema":1,"schema":1`, 1),
		"unknown field":    strings.Replace(valid, `"schema":1`, `"schema":1,"unknown":true`, 1),
		"invalid core":     strings.Replace(valid, "test:workstation:core", "pretest", 1),
		"invalid lane":     strings.Replace(valid, "workstation-fixture-007", "fixture-007", 1),
		"invalid artifact": strings.Replace(valid, `"artifact":"fixture-007"`, `"artifact":"fixture/007"`, 1),
		"invalid script":   strings.Replace(valid, "test:workstation:fixture-007", "postinstall", 1),
		"invalid rank":     strings.Replace(valid, `"creation_rank":1`, `"creation_rank":2`, 1),
		"repeated core":    strings.Replace(valid, "test:workstation:fixture-007", "test:workstation:core", 1),
		"trailing data":    valid + `{}`,
		"oversized":        strings.Repeat(" ", maximumWorkstationCatalogueBytes+1),
	} {
		name, body := name, body
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			if _, err := parseWorkstationCatalogue([]byte(body)); err == nil {
				t.Fatalf("parseWorkstationCatalogue(%s) accepted malformed authority", name)
			}
		})
	}
}

func TestParseWorkstationCatalogueReturnsIsolatedData(t *testing.T) {
	t.Parallel()
	parsed, err := parseWorkstationCatalogue(workstationCatalogueBody)
	if err != nil {
		t.Fatal(err)
	}
	if parsed.CoreScript != "test:workstation:core" || len(parsed.Jobs) != 19 {
		t.Fatalf("embedded catalogue = %q/%d jobs", parsed.CoreScript, len(parsed.Jobs))
	}
	parsed.Jobs[0] = workstationCatalogueJob{}
	core, jobs, err := WorkstationCatalogue()
	if err != nil {
		t.Fatal(err)
	}
	if core != "test:workstation:core" || jobs[0].Artifact != "fixture-026-shard-6" {
		t.Fatalf("WorkstationCatalogue() exposed mutable authority: %q/%#v", core, jobs[0])
	}
}
