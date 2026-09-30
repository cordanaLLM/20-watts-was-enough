package ciplan

import (
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
)

func TestRepositoryImpactMappingIsClosedAndRoutesRepresentativeChanges(t *testing.T) {
	t.Parallel()
	root := filepath.Clean(filepath.Join("..", "..", ".."))
	mapping, err := loadMapping(root)
	if err != nil {
		t.Fatalf("loadMapping(repository) error = %v", err)
	}
	if len(mapping.Rules) < 20 {
		t.Fatalf("mapping has %d rules, want the declared repository surfaces", len(mapping.Rules))
	}
	options := testOptions(root)
	tests := []struct {
		path   string
		mode   string
		lanes  []string
		reason string
	}{
		{path: "app/App.tsx", mode: "impact", lanes: []string{"site"}},
		{path: "app/globals.css", mode: "impact", lanes: []string{"renderer", "site"}},
		{path: ".github/ISSUE_TEMPLATE/site-documentation-problem.yml", mode: "impact", lanes: []string{"common"}},
		{path: ".github/issue-milestones.json", mode: "impact", lanes: []string{"go"}},
		{path: ".github/labels.json", mode: "impact", lanes: []string{"go"}},
		{path: ".github/public-transport.json", mode: "impact", lanes: []string{"go", "site"}},
		{path: "renovate.json", mode: "impact", lanes: []string{"dependency"}},
		{path: "research/engineering-relations.json", mode: "impact", lanes: []string{"go", "research", "site"}},
		{path: "research/engineering-relations.schema.json", mode: "impact", lanes: []string{"go", "research", "site"}},
		{path: "tooling/internal/engineeringrelations/registry.go", mode: "impact", lanes: []string{"go", "research"}},
		{path: "tooling/internal/experimentcli/cli.go", mode: "impact", lanes: []string{"container", "go", "release"}},
		{path: "tooling/internal/experimentcli/clrs_invocation.go", mode: "impact", lanes: []string{"container", "go", "release"}},
		{path: "tooling/internal/experimentcli/clrs_generation.go", mode: "impact", lanes: []string{"container", "go", "release"}},
		{path: "tooling/internal/experimentcli/clrs_generation_test.go", mode: "impact", lanes: []string{"container", "go", "release"}},
		{path: "tooling/internal/experimentcli/future_command_test.go", mode: "impact", lanes: []string{"container", "go", "release"}},
		{path: "tooling/internal/experimentcli-other/cli.go", mode: "full", lanes: []string{"full", "renderer"}, reason: "unmapped-path:tooling/internal/experimentcli-other/cli.go"},
		{path: "package-lock.json", mode: "full", lanes: []string{"full", "renderer"}, reason: "full-authority-changed"},
		{path: "scripts/book-pdf-semantic-baseline.json", mode: "impact", lanes: []string{"release"}},
		{path: "scripts/book-support-sources.json", mode: "impact", lanes: []string{"release", "site"}},
		{path: "scripts/book-support-source.json", mode: "full", lanes: []string{"full", "renderer"}, reason: "unmapped-path:scripts/book-support-source.json"},
		{path: "scripts/book-support-sources.json.old", mode: "full", lanes: []string{"full", "renderer"}, reason: "unmapped-path:scripts/book-support-sources.json.old"},
		{path: "scripts/lib/strict-json.mjs", mode: "full", lanes: []string{"full", "renderer"}, reason: "full-authority-changed"},
		{path: "scripts/lib/book-pdf-semantic-audit.mjs", mode: "impact", lanes: []string{"release"}},
		{path: "scripts/lib/chromium-cdp.test.mjs", mode: "impact", lanes: []string{"release"}},
		{path: "scripts/lib/pdf-metadata.test.mjs", mode: "impact", lanes: []string{"release"}},
		{path: "scripts/lib/pdf-metadata.mjs", mode: "full", lanes: []string{"full", "renderer"}, reason: "full-authority-changed"},
		{path: "scripts/audit-book-pdf-semantics.mjs", mode: "full", lanes: []string{"full", "renderer"}, reason: "unmapped-path:scripts/audit-book-pdf-semantics.mjs"},
		{path: "scripts/generate-book-pdf.mjs", mode: "full", lanes: []string{"full", "renderer"}, reason: "full-authority-changed"},
		{path: "scripts/audit-prose-style.mjs", mode: "full", lanes: []string{"full"}, reason: "full-authority-changed"},
		{path: "scripts/book-edition-surface.test.mjs", mode: "impact", lanes: []string{"site"}},
		{path: "scripts/mermaid-browser.test.mjs", mode: "impact", lanes: []string{"site"}},
		{path: "scripts/research-object-header-browser.test.mjs", mode: "impact", lanes: []string{"site"}},
		{path: "scripts/unclassified-future-check.mjs", mode: "full", lanes: []string{"full", "renderer"}, reason: "unmapped-path:scripts/unclassified-future-check.mjs"},
		{path: "experiments/workstation/fixture-026/runner.mjs", mode: "impact", lanes: []string{"workstation-fixture-026"}},
		{path: "experiments/workstation/fixture-007/runner.mjs", mode: "impact", lanes: []string{"container", "workstation-fixture-007"}},
		{path: "tooling/internal/buildinfo/buildinfo.go", mode: "impact", lanes: []string{"container", "go", "release"}},
		{path: "tooling/internal/pdfrender/render.go", mode: "impact", lanes: []string{"container", "go", "release", "renderer", "site"}},
		{path: "tooling/internal/pdfrenderlock/lock.go", mode: "impact", lanes: []string{"container", "go", "release", "renderer", "site"}},
		{path: "tooling/internal/workstationrunner/runner.go", mode: "full", lanes: []string{"full"}, reason: "full-authority-changed"},
		{path: "tooling/pdf-tools/apko.yaml", mode: "impact", lanes: []string{"go", "release"}},
		{path: "tooling/clrs-specialist/Dockerfile", mode: "impact", lanes: []string{"container", "go"}},
		{path: "tooling/cmd/clrs-specialist/main.go", mode: "impact", lanes: []string{"container", "go"}},
		{path: "tooling/internal/clrsrunner/run.go", mode: "impact", lanes: []string{"container", "go"}},
		{path: "tooling/internal/clrsfixture/import.go", mode: "impact", lanes: []string{"container", "go"}},
		{path: "tooling/internal/clrsfixture/compare.go", mode: "impact", lanes: []string{"container", "go"}},
		{path: "tooling/internal/clrsfixture/compare_test.go", mode: "impact", lanes: []string{"container", "go"}},
		{path: "tooling/cmd/20w/clrs_compare.go", mode: "full", lanes: []string{"full", "renderer"}, reason: "selector-authority-changed"},
		{path: "tooling/cmd/20w/clrs_compare_test.go", mode: "full", lanes: []string{"full", "renderer"}, reason: "selector-authority-changed"},
		{path: "tooling/internal/clrsfixture/sbom.go", mode: "impact", lanes: []string{"container", "go"}},
		{path: "tooling/internal/clrsfixture/sbom_test.go", mode: "impact", lanes: []string{"container", "go"}},
		{path: "tooling/cmd/20w/clrs_sbom.go", mode: "full", lanes: []string{"full", "renderer"}, reason: "selector-authority-changed"},
		{path: "tooling/cmd/20w/clrs_sbom_test.go", mode: "full", lanes: []string{"full", "renderer"}, reason: "selector-authority-changed"},
		{path: "tooling/internal/clrsfixture/invocation.go", mode: "impact", lanes: []string{"container", "go"}},
		{path: "tooling/internal/clrsfixture/invocation_test.go", mode: "impact", lanes: []string{"container", "go"}},
		{path: "tooling/internal/clrsfixture/generation_run.go", mode: "impact", lanes: []string{"container", "go"}},
		{path: "tooling/internal/clrsfixture/generation_run_publish.go", mode: "impact", lanes: []string{"container", "go"}},
		{path: "tooling/internal/clrsfixture/generation_run_safety_test.go", mode: "impact", lanes: []string{"container", "go"}},
		{path: "tooling/internal/clrsfixture-other/generation_run.go", mode: "full", lanes: []string{"full", "renderer"}, reason: "unmapped-path:tooling/internal/clrsfixture-other/generation_run.go"},
		{path: "tooling/cmd/20w/clrs_invocation.go", mode: "full", lanes: []string{"full", "renderer"}, reason: "selector-authority-changed"},
		{path: "tooling/cmd/20w/clrs_invocation_test.go", mode: "full", lanes: []string{"full", "renderer"}, reason: "selector-authority-changed"},
		{path: "tooling/internal/clrscontext/context.go", mode: "impact", lanes: []string{"container", "go"}},
		{path: "tooling/internal/clrscontext/source_test.go", mode: "impact", lanes: []string{"container", "go"}},
		{path: "tooling/internal/clrscontext-unrelated/example.go", mode: "full", lanes: []string{"full", "renderer"}, reason: "unmapped-path:tooling/internal/clrscontext-unrelated/example.go"},
		{path: "tooling/cmd/20w/clrs_context.go", mode: "full", lanes: []string{"full", "renderer"}, reason: "selector-authority-changed"},
		{path: "tooling/cmd/20w/clrs_context_test.go", mode: "full", lanes: []string{"full", "renderer"}, reason: "selector-authority-changed"},
		{path: "tooling/internal/ciplan/mapping_test.go", mode: "full", lanes: []string{"full", "renderer"}, reason: "selector-authority-changed"},
		{path: "tooling/cmd/ci-plan/main.go", mode: "full", lanes: []string{"full", "renderer"}, reason: "selector-authority-changed"},
		{path: "tooling/internal/ciplancli/cli.go", mode: "full", lanes: []string{"full", "renderer"}, reason: "selector-authority-changed"},
		{path: "tooling/internal/ciplancli/dependencies_test.go", mode: "full", lanes: []string{"full", "renderer"}, reason: "selector-authority-changed"},
		{path: "tooling/cmd/pdf-proof/main.go", mode: "impact", lanes: []string{"container", "go", "release", "renderer", "site"}},
		{path: "tooling/internal/pdfrendercli/cli.go", mode: "impact", lanes: []string{"container", "go", "release", "renderer", "site"}},
		{path: "tooling/internal/pdfrendercli/cli_test.go", mode: "impact", lanes: []string{"container", "go", "release", "renderer", "site"}},
		{path: "tooling/cmd/ci-plan-unrelated/main.go", mode: "full", lanes: []string{"full", "renderer"}, reason: "unmapped-path:tooling/cmd/ci-plan-unrelated/main.go"},
		{path: "tooling/cmd/pdf-proof-unrelated/main.go", mode: "full", lanes: []string{"full", "renderer"}, reason: "unmapped-path:tooling/cmd/pdf-proof-unrelated/main.go"},
		{path: "tooling/internal/ciplancli-unrelated/cli.go", mode: "full", lanes: []string{"full", "renderer"}, reason: "unmapped-path:tooling/internal/ciplancli-unrelated/cli.go"},
		{path: "tooling/internal/pdfrendercli-unrelated/cli.go", mode: "full", lanes: []string{"full", "renderer"}, reason: "unmapped-path:tooling/internal/pdfrendercli-unrelated/cli.go"},
		{path: "scripts/book-source.mjs", mode: "full", lanes: []string{"full", "renderer"}, reason: "full-authority-changed"},
		{path: ".github/ci-impact.json", mode: "full", lanes: []string{"full", "renderer"}, reason: "selector-authority-changed"},
		{path: "tooling/internal/clrsinsertion/adapter.go", mode: "impact", lanes: []string{"container", "go"}},
		{path: "tooling/internal/clrsbinary/adapter.go", mode: "impact", lanes: []string{"container", "go"}},
		{path: "tooling/internal/clrsmatrixchain/adapter.go", mode: "impact", lanes: []string{"container", "go"}},
		{path: "tooling/internal/clrsbellmanford/adapter.go", mode: "impact", lanes: []string{"container", "go"}},
		{path: "tooling/internal/clrsbfs/bfs.go", mode: "impact", lanes: []string{"go"}},
		{path: "tooling/internal/clrskmp/adapter.go", mode: "impact", lanes: []string{"container", "go"}},
		{path: "tooling/internal/clrssegments/adapter.go", mode: "impact", lanes: []string{"container", "go"}},
		{path: "experiments/workstation/lib/execution-receipt.mjs", mode: "full", lanes: []string{"full"}, reason: "full-authority-changed"},
		{path: ".github/workflows/ci.yml", mode: "full", lanes: []string{"full", "renderer"}, reason: "selector-authority-changed"},
		{path: ".github/unowned-metadata.yml", mode: "full", lanes: []string{"full", "renderer"}, reason: "unmapped-path:.github/unowned-metadata.yml"},
	}
	for _, test := range tests {
		plan := selectTestPaths(t, root, options, []string{test.path})
		if plan.Mode != test.mode || !reflect.DeepEqual(plan.Lanes, test.lanes) ||
			(test.reason != "" && plan.Reason != test.reason) {
			t.Fatalf("path %s produced %#v, want %s/%v", test.path, plan, test.mode, test.lanes)
		}
	}
}

func TestCLRSShakedownLeavesRetainConsumersAndAuthorityFallback(t *testing.T) {
	t.Parallel()
	root := filepath.Clean(filepath.Join("..", "..", ".."))
	const runner = "tooling/internal/clrsshakedown/run.go"
	for _, test := range []struct {
		name, mode, reason string
		paths, lanes       []string
	}{
		{"run", "impact", "mapped-change-set", []string{runner}, []string{"container", "go", "release"}},
		{"checker", "impact", "mapped-change-set", []string{"tooling/internal/clrsshakedown/check.go"}, []string{"container", "go", "release"}},
		{"tests", "impact", "mapped-change-set", []string{"tooling/internal/clrsshakedown/run_test.go"}, []string{"container", "go", "release"}},
		{"similar sibling", "full", "unmapped-path:tooling/internal/clrsshakedown-other/run.go", []string{"tooling/internal/clrsshakedown-other/run.go"}, []string{"full", "renderer"}},
		{"fixture and CLI", "impact", "mapped-change-set", []string{runner, "tooling/internal/clrsfixture/tree.go", "tooling/internal/experimentcli/clrs_shakedown.go"}, []string{"container", "go", "release"}},
		{"inventory parser", "full", "full-authority-changed", []string{runner, "scripts/book-source.mjs"}, []string{"full", "renderer"}},
		{"strict JSON parser", "full", "selector-authority-changed", []string{runner, "tooling/internal/strictjson/validate.go"}, []string{"full", "renderer"}},
		{"selector", "full", "selector-authority-changed", []string{runner, "tooling/internal/ciplan/plan.go"}, []string{"full", "renderer"}},
		{"mapping authority", "full", "selector-authority-changed", []string{runner, ".github/ci-impact.json"}, []string{"full", "renderer"}},
		{"public command", "full", "selector-authority-changed", []string{runner, "tooling/cmd/20w/main.go"}, []string{"full", "renderer"}},
		{"unknown companion", "full", "unmapped-path:tooling/internal/unknown/new.go", []string{runner, "tooling/internal/unknown/new.go"}, []string{"full", "renderer"}},
	} {
		t.Run(test.name, func(t *testing.T) {
			plan := selectTestPaths(t, root, testOptions(root), test.paths)
			if plan.Mode != test.mode || plan.Reason != test.reason || !reflect.DeepEqual(plan.Lanes, test.lanes) {
				t.Fatalf("runner scope %v produced %#v, want %s/%v/%s", test.paths, plan, test.mode, test.lanes, test.reason)
			}
		})
	}
}

func TestCLRSSpecialistReadmeRetainsResearchConsumersAndAuthorityFallback(t *testing.T) {
	t.Parallel()
	root := filepath.Clean(filepath.Join("..", "..", ".."))
	const readme = "tooling/clrs-specialist/README.md"
	for _, test := range []struct {
		name, mode, reason string
		paths, lanes       []string
	}{
		{"readme", "impact", "mapped-change-set", []string{readme}, []string{"container", "go", "research", "site"}},
		{"runtime stays narrow", "impact", "mapped-change-set", []string{"tooling/clrs-specialist/Dockerfile"}, []string{"container", "go"}},
		{"non-Markdown sibling stays narrow", "impact", "mapped-change-set", []string{"tooling/clrs-specialist/README.md.old"}, []string{"container", "go"}},
		{"similar sibling", "full", "unmapped-path:tooling/clrs-specialist-other/README.md", []string{"tooling/clrs-specialist-other/README.md"}, []string{"full", "renderer"}},
		{"runner", "impact", "mapped-change-set", []string{readme, "tooling/internal/clrsshakedown/run.go"}, []string{"container", "go", "release", "research", "site"}},
		{"publication inventory", "impact", "mapped-change-set", []string{readme, "scripts/book-support-sources.json"}, []string{"container", "go", "release", "research", "site"}},
		{"inventory parser", "full", "full-authority-changed", []string{readme, "scripts/book-source.mjs"}, []string{"full", "renderer"}},
		{"shared parser", "full", "selector-authority-changed", []string{readme, "tooling/internal/strictjson/validate.go"}, []string{"full", "renderer"}},
		{"mapping authority", "full", "selector-authority-changed", []string{readme, ".github/ci-impact.json"}, []string{"full", "renderer"}},
		{"unknown companion", "full", "unmapped-path:tooling/internal/unknown/new.go", []string{readme, "tooling/internal/unknown/new.go"}, []string{"full", "renderer"}},
	} {
		t.Run(test.name, func(t *testing.T) {
			plan := selectTestPaths(t, root, testOptions(root), test.paths)
			if plan.Mode != test.mode || plan.Reason != test.reason || !reflect.DeepEqual(plan.Lanes, test.lanes) {
				t.Fatalf("specialist README scope %v produced %#v, want %s/%v/%s", test.paths, plan, test.mode, test.lanes, test.reason)
			}
		})
	}
}

func TestBookSupportInventoryRetainsPublicationAndProtectedAuthorityLanes(t *testing.T) {
	t.Parallel()
	root := filepath.Clean(filepath.Join("..", "..", ".."))
	const inventory = "scripts/book-support-sources.json"
	for _, test := range []struct {
		name, other, mode, reason string
		lanes                     []string
	}{
		{"inventory only", "", "impact", "mapped-change-set", []string{"release", "site"}},
		{"context source", "tooling/internal/clrscontext/context.go", "impact", "mapped-change-set", []string{"container", "go", "release", "site"}},
		{"fixture source", "tooling/internal/clrsfixture/generation_run.go", "impact", "mapped-change-set", []string{"container", "go", "release", "site"}},
		{"shakedown runner", "tooling/internal/clrsshakedown/run.go", "impact", "mapped-change-set", []string{"container", "go", "release", "site"}},
		{"experiment CLI source", "tooling/internal/experimentcli/clrs_generation.go", "impact", "mapped-change-set", []string{"container", "go", "release", "site"}},
		{"inventory parser", "scripts/book-source.mjs", "full", "full-authority-changed", []string{"full", "renderer"}},
		{"strict JSON parser", "scripts/lib/strict-json.mjs", "full", "full-authority-changed", []string{"full", "renderer"}},
		{"stable file reader", "scripts/lib/opened-file.mjs", "full", "full-authority-changed", []string{"full", "renderer"}},
		{"renderer leaf", "tooling/internal/pdfrender/render.go", "impact", "mapped-change-set", []string{"container", "go", "release", "renderer", "site"}},
		{"renderer styles", "app/globals.css", "impact", "mapped-change-set", []string{"release", "renderer", "site"}},
		{"selector", "tooling/internal/ciplan/plan.go", "full", "selector-authority-changed", []string{"full", "renderer"}},
		{"mapping authority", ".github/ci-impact.json", "full", "selector-authority-changed", []string{"full", "renderer"}},
		{"public command", "tooling/cmd/20w/main.go", "full", "selector-authority-changed", []string{"full", "renderer"}},
		{"unknown source", "tooling/internal/unknown/new.go", "full", "unmapped-path:tooling/internal/unknown/new.go", []string{"full", "renderer"}},
	} {
		t.Run(test.name, func(t *testing.T) {
			paths := []string{inventory}
			if test.other != "" {
				paths = append(paths, test.other)
			}
			plan := selectTestPaths(t, root, testOptions(root), paths)
			if plan.Mode != test.mode || plan.Reason != test.reason || !reflect.DeepEqual(plan.Lanes, test.lanes) {
				t.Fatalf("inventory with %s produced %#v, want %s/%v/%s", test.other, plan, test.mode, test.lanes, test.reason)
			}
		})
	}
}

func TestBookSupportInventoryRetainsDeletionAndUnsafeShapeHandling(t *testing.T) {
	t.Parallel()
	root := filepath.Clean(filepath.Join("..", "..", ".."))
	const inventory = "scripts/book-support-sources.json"
	for _, test := range []struct {
		name, oldMode, newMode, status string
		paths                          []string
		unsafe                         bool
	}{
		{"regular deletion", "100644", "000000", "D", []string{inventory}, false},
		{"symlink replacement", "100644", "120000", "T", []string{inventory}, true},
		{"symlink deletion", "120000", "000000", "D", []string{inventory}, true},
		{"rename", "100644", "100644", "R100", []string{inventory, inventory + ".old"}, true},
		{"copy", "100644", "100644", "C100", []string{inventory, inventory + ".old"}, true},
	} {
		t.Run(test.name, func(t *testing.T) {
			paths, unsafe, err := parseRawDiff(rawRecord(test.oldMode, test.newMode, test.status, test.paths...))
			if err != nil || unsafe != test.unsafe || !reflect.DeepEqual(paths, test.paths) {
				t.Fatalf("inventory change shape: paths=%v unsafe=%t error=%v", paths, unsafe, err)
			}
			if !unsafe {
				plan := selectTestPaths(t, root, testOptions(root), paths)
				if plan.Mode != "impact" || !reflect.DeepEqual(plan.Lanes, []string{"release", "site"}) {
					t.Fatalf("regular inventory deletion lost its consuming lanes: %#v", plan)
				}
			}
		})
	}
}

func TestPrivateCommandChangesDoNotHideCombinedAuthorityChanges(t *testing.T) {
	t.Parallel()
	root := filepath.Clean(filepath.Join("..", "..", ".."))
	for _, authority := range []string{
		"tooling/cmd/ci-plan/main.go", "tooling/internal/ciplancli/cli.go",
		"tooling/internal/ciplan/plan.go", "tooling/cmd/20w/main.go",
		"scripts/book-source.mjs", "unknown-root/new-source.go",
	} {
		plan := selectTestPaths(t, root, testOptions(root), []string{
			"tooling/internal/clrsfixture/compare.go", "tooling/cmd/pdf-proof/main.go", authority,
		})
		if plan.Mode != "full" || !reflect.DeepEqual(plan.Lanes, []string{"full", "renderer"}) {
			t.Fatalf("combined authority %s produced %#v", authority, plan)
		}
	}
}

func TestPdfSemanticSentinelDiffSelectsOnlyItsPublicationConsumers(t *testing.T) {
	t.Parallel()
	root := filepath.Clean(filepath.Join("..", "..", ".."))
	plan := selectTestPaths(t, root, testOptions(root), []string{
		"CHANGELOG.md",
		"scripts/book-pdf-semantic-baseline.json",
		"scripts/lib/pdf-metadata.test.mjs",
	})
	want := []string{"release", "research", "site"}
	if plan.Mode != "impact" || plan.Reason != "mapped-change-set" ||
		!reflect.DeepEqual(plan.Lanes, want) {
		t.Fatalf("PDF semantic sentinel plan = %#v, want impact/%v", plan, want)
	}
}

func TestReaderLikeDiffSelectsOnlyItsPublicationConsumers(t *testing.T) {
	t.Parallel()
	root := filepath.Clean(filepath.Join("..", "..", ".."))
	plan := selectTestPaths(t, root, testOptions(root), []string{
		"CHANGELOG.md",
		"app/globals.css",
		"scripts/book-edition-surface.test.mjs",
		"scripts/mermaid-browser.test.mjs",
	})
	want := []string{"release", "renderer", "research", "site"}
	if plan.Mode != "impact" || plan.Reason != "mapped-change-set" ||
		!reflect.DeepEqual(plan.Lanes, want) {
		t.Fatalf("reader-like plan = %#v, want impact/%v", plan, want)
	}
}

func TestEverySiteLaneEntrypointIsMappedToTheSiteLane(t *testing.T) {
	t.Parallel()
	root := filepath.Clean(filepath.Join("..", "..", ".."))
	mapping, err := loadMapping(root)
	if err != nil {
		t.Fatalf("loadMapping(repository) error = %v", err)
	}
	paths := []string{
		"scripts/book-edition-surface.test.mjs",
		"scripts/book-fragment-browser.test.mjs",
		"scripts/book-route.test.mjs",
		"scripts/css-authority.test.mjs",
		"scripts/github-pages.test.mjs",
		"scripts/language-access.test.mjs",
		"scripts/mermaid-browser.test.mjs",
		"scripts/pages-base.test.mjs",
		"scripts/pages-seo.test.mjs",
		"scripts/prepare-reader-artifacts.mjs",
		"scripts/prepare-reader-artifacts.test.mjs",
		"scripts/publication-unification.test.mjs",
		"scripts/research-object-header-browser.test.mjs",
		"scripts/research-object-header.test.mjs",
		"scripts/translation-manifest.test.mjs",
		"scripts/translation-pages.test.mjs",
		"scripts/translation-vite-build.test.mjs",
		"scripts/validate-css-authority.mjs",
		"scripts/validate-github-pages-build.mjs",
		"scripts/validate-translations.mjs",
	}
	for _, path := range paths {
		plan := selectChangedPaths(mapping, testOptions(root), []string{path})
		if plan.Mode != "impact" || plan.Reason != "mapped-change-set" ||
			!reflect.DeepEqual(plan.Lanes, []string{"site"}) {
			t.Fatalf("site entrypoint %s produced %#v, want mapped site impact plan", path, plan)
		}
	}
}

func TestExperimentCLIChangesRetainCombinedAuthorityGates(t *testing.T) {
	t.Parallel()
	root := filepath.Clean(filepath.Join("..", "..", ".."))
	for _, test := range []struct {
		other string
		mode  string
		lanes []string
	}{
		{"tooling/internal/experimentcli/clrs_sbom_test.go", "impact", []string{"container", "go", "release"}},
		{"tooling/cmd/20w/main.go", "full", []string{"full", "renderer"}},
		{"tooling/internal/ciplancli/cli.go", "full", []string{"full", "renderer"}},
		{"scripts/book-source.mjs", "full", []string{"full", "renderer"}},
		{"tooling/internal/pdfrendercli/cli.go", "impact", []string{"container", "go", "release", "renderer", "site"}},
	} {
		plan := selectTestPaths(t, root, testOptions(root), []string{"tooling/internal/experimentcli/cli.go", test.other})
		if plan.Mode != test.mode || !reflect.DeepEqual(plan.Lanes, test.lanes) {
			t.Fatalf("experiment CLI with %s produced %#v, want %s/%v", test.other, plan, test.mode, test.lanes)
		}
	}
}

func TestBrowserValidationLeavesSelectOnlyTheirExecutableConsumers(t *testing.T) {
	t.Parallel()
	root := filepath.Clean(filepath.Join("..", "..", ".."))
	plan := selectTestPaths(t, root, testOptions(root), []string{
		"scripts/css-authority.test.mjs",
		"scripts/lib/chromium-cdp.test.mjs",
		"scripts/research-object-header-browser.test.mjs",
		"scripts/research-object-header.test.mjs",
		"scripts/validate-css-authority.mjs",
	})
	want := []string{"release", "site"}
	if plan.Mode != "impact" || plan.Reason != "mapped-change-set" ||
		!reflect.DeepEqual(plan.Lanes, want) {
		t.Fatalf("browser validation leaf plan = %#v, want impact/%v", plan, want)
	}
}

func TestEveryWorkstationManifestSelectsItsArtifactAndReadinessConsumers(t *testing.T) {
	t.Parallel()
	root := filepath.Clean(filepath.Join("..", "..", ".."))
	mapping, err := loadMapping(root)
	if err != nil {
		t.Fatalf("loadMapping(repository) error = %v", err)
	}
	options := testOptions(root)
	entries, err := os.ReadDir(filepath.Join(root, "experiments", "workstation", "manifests"))
	if err != nil {
		t.Fatalf("read workstation manifests: %v", err)
	}
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".json") {
			t.Fatalf("unexpected workstation manifest entry %q", entry.Name())
		}
		artifact := strings.TrimSuffix(entry.Name(), ".json")
		t.Run(artifact, func(t *testing.T) {
			lanes := []string{"research", "site", "workstation-" + artifact}
			if artifact == "fixture-007" || artifact == "fixture-019" {
				lanes = append([]string{"container"}, lanes...)
			}
			plan := selectChangedPaths(
				mapping,
				options,
				[]string{"experiments/workstation/manifests/" + artifact + ".json"},
			)
			if plan.Mode != "impact" || !reflect.DeepEqual(plan.Lanes, lanes) {
				t.Fatalf("manifest plan = %#v, want impact/%v", plan, lanes)
			}
		})
	}
}

func TestValidatePathPatternRejectsRecursiveCatchAllTampering(t *testing.T) {
	t.Parallel()
	for _, pattern := range []string{"**", "**/runner.mjs", "experiments/**/runner.mjs", "../**"} {
		if err := validatePathPattern(pattern); err == nil {
			t.Fatalf("validatePathPattern(%q) accepted an unsafe recursive pattern", pattern)
		}
	}
}

func TestValidateMappingRejectsAnUnimplementedLane(t *testing.T) {
	t.Parallel()
	mapping := Mapping{
		Schema: 1,
		Rules: []Rule{{
			ID:    "site",
			Paths: []string{"app/**"},
			Lanes: []string{"sitee"},
		}},
	}
	if err := validateMapping(mapping); err == nil {
		t.Fatal("validateMapping() accepted an unimplemented lane")
	}
}

func TestReadStableMappingRejectsAnOversizedBodyWithAStableDiagnostic(t *testing.T) {
	t.Parallel()
	filename := filepath.Join(t.TempDir(), "ci-impact.json")
	if err := os.WriteFile(filename, []byte(strings.Repeat("x", maximumMappingBytes+1)), 0o600); err != nil {
		t.Fatal(err)
	}
	_, err := readStableMapping(filename)
	if err == nil || !strings.Contains(err.Error(), "exceeds the 65536-byte limit") ||
		strings.Contains(err.Error(), "%!w") {
		t.Fatalf("readStableMapping() error = %q, want stable oversized-body diagnostic", err)
	}
}
