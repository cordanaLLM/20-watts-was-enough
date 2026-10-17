package ciplan

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
)

const (
	testBaseRevision = "1111111111111111111111111111111111111111"
	testHeadRevision = "2222222222222222222222222222222222222222"
	testMapping      = `{
  "schema": 1,
  "rules": [
    {"id":"global","paths":["experiments/workstation/lib/**"],"lanes":["full"]},
    {"id":"renderer","paths":["tooling/internal/pdfrender/**"],"lanes":["renderer"]},
    {"id":"research","paths":["research/**"],"lanes":["research","site"]},
    {"id":"site","paths":["app/**"],"lanes":["site"]},
    {"id":"workstation","paths":["experiments/workstation/fixture-026/**"],"lanes":["workstation-fixture-026"]}
  ]
}`
)

func TestPlanChangedPathsSelectsOnlyMappedImpactLanes(t *testing.T) {
	t.Parallel()
	root := writePlanRepository(t, testMapping)
	options := testOptions(root)
	tests := []struct {
		name  string
		paths []string
		lanes []string
	}{
		{name: "site", paths: []string{"app/main.tsx"}, lanes: []string{"site"}},
		{name: "research", paths: []string{"research/claims.md"}, lanes: []string{"research", "site"}},
		{name: "artifact", paths: []string{"experiments/workstation/fixture-026/runner.mjs"}, lanes: []string{"workstation-fixture-026"}},
		{name: "renderer", paths: []string{"tooling/internal/pdfrender/render.go"}, lanes: []string{"renderer"}},
		{name: "book renderer", paths: []string{"app/globals.css"}, lanes: []string{"renderer", "site"}},
		{name: "union", paths: []string{"research/claims.md", "app/main.tsx"}, lanes: []string{"research", "site"}},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			plan := selectTestPaths(t, root, options, test.paths)
			if plan.Mode != "impact" || plan.Reason != "mapped-change-set" ||
				!reflect.DeepEqual(plan.Lanes, test.lanes) {
				t.Fatalf("planChangedPaths() = %#v, want impact lanes %v", plan, test.lanes)
			}
		})
	}
}

func TestRendererAuthorityPredicateCoversTheClosedExecutionBoundary(t *testing.T) {
	t.Parallel()
	for _, changedPath := range []string{
		".github/ci-impact.json",
		".github/workflows/ci.yml",
		".github/workflows/release.yml",
		".github/workflows/release-build.yml",
		"app/components/markdown-document.tsx",
		"app/components/overflow-region.tsx",
		"app/globals.css",
		"github-pages/book.tsx",
		"package-lock.json",
		"scripts/generate-book-pdf.mjs",
		"scripts/lib/chromium-cdp.mjs",
		"scripts/npm-runtime-lock.json",
		"tooling/cmd/20w/main.go",
		"tooling/cmd/20w/pdf_reproducibility.go",
		"tooling/cmd/ci-plan/main.go",
		"tooling/cmd/pdf-proof/main.go",
		"tooling/go.mod",
		"tooling/internal/ciplan/plan.go",
		"tooling/internal/ciplancli/cli.go",
		"tooling/internal/pdfrender/reproducibility.go",
		"tooling/internal/pdfrender/installed_dependencies.go",
		"tooling/internal/pdfrender/installed_inventory.go",
		"tooling/internal/pdfrendercli/cli.go",
		"tooling/internal/pdfrenderlock/lock.go",
		"tooling/internal/strictjson/validate.go",
		"tooling/pdf-renderer/lock.json",
		"vite.pages.config.ts",
	} {
		if !isRendererAuthority(changedPath) {
			t.Errorf("isRendererAuthority(%q) = false", changedPath)
		}
	}
	for _, changedPath := range []string{
		"app/main.tsx",
		"concept/00-overview.md",
		"scripts/audit-prose-style.mjs",
		"tooling/internal/githublabels/labels.go",
		"tooling/cmd/ci-plan-unrelated/main.go",
		"tooling/cmd/pdf-proof-unrelated/main.go",
		"tooling/internal/ciplancli-unrelated/cli.go",
		"tooling/internal/pdfrendercli-unrelated/cli.go",
	} {
		if isRendererAuthority(changedPath) {
			t.Errorf("isRendererAuthority(%q) = true", changedPath)
		}
	}
}

func TestDeletedPrivateCommandAuthoritiesRetainFormerPathOwners(t *testing.T) {
	t.Parallel()
	root := filepath.Clean(filepath.Join("..", "..", ".."))
	for _, test := range []struct {
		path  string
		mode  string
		lanes []string
	}{
		{"tooling/cmd/ci-plan/main.go", "full", []string{"full", "renderer"}},
		{"tooling/internal/ciplancli/cli.go", "full", []string{"full", "renderer"}},
		{"tooling/cmd/pdf-proof/main.go", "impact", []string{"container", "go", "release", "renderer", "site"}},
		{"tooling/internal/experimentcli/cli.go", "impact", []string{"container", "go", "release"}},
		{"tooling/internal/pdfrendercli/cli.go", "impact", []string{"container", "go", "release", "renderer", "site"}},
		{"unknown-root/deleted.go", "full", []string{"full", "renderer"}},
	} {
		paths, unsafe, err := parseRawDiff(rawRecord("100644", "000000", "D", test.path))
		if err != nil || unsafe || !reflect.DeepEqual(paths, []string{test.path}) {
			t.Fatalf("parse deletion %s: paths=%v unsafe=%t err=%v", test.path, paths, unsafe, err)
		}
		plan := selectTestPaths(t, root, testOptions(root), paths)
		if plan.Mode != test.mode || !reflect.DeepEqual(plan.Lanes, test.lanes) {
			t.Fatalf("deleted authority %s produced %#v, want %s/%v", test.path, plan, test.mode, test.lanes)
		}
	}
}

func TestUnsafeChangeRendererSignalUsesBothPathsAndFailsClosedOnUnknowns(t *testing.T) {
	t.Parallel()
	root := writePlanRepository(t, testMapping)
	mapping, err := loadMapping(root)
	if err != nil {
		t.Fatal(err)
	}
	for name, test := range map[string]struct {
		paths []string
		want  bool
	}{
		"known unrelated rename": {
			paths: []string{"app/new.tsx", "app/old.tsx"},
		},
		"renderer authority involved": {
			paths: []string{"app/globals.css"},
			want:  true,
		},
		"private selector authority involved": {
			paths: []string{"app/old.tsx", "tooling/cmd/ci-plan/main.go"},
			want:  true,
		},
		"private proof authority involved": {
			paths: []string{"app/old.tsx", "tooling/cmd/pdf-proof/main.go"},
			want:  true,
		},
		"rename enters unmapped path": {
			paths: []string{"app/old.tsx", "new-root/unmapped.tsx"},
			want:  true,
		},
	} {
		t.Run(name, func(t *testing.T) {
			if observed := rendererRequiredForUnsafeChange(mapping, test.paths); observed != test.want {
				t.Fatalf("rendererRequiredForUnsafeChange(%v) = %t, want %t", test.paths, observed, test.want)
			}
		})
	}
}

func TestBuildFullPlansStillValidateAuthorityAndEncodeClosedEmptyArrays(t *testing.T) {
	t.Parallel()
	root := writePlanRepository(t, testMapping)
	for name, test := range map[string]struct {
		options Options
		reason  string
	}{
		"explicit": {
			options: Options{RepositoryRoot: root, ForceFull: true},
			reason:  "explicit-full",
		},
		"missing revision": {
			options: Options{RepositoryRoot: root, HeadRevision: testHeadRevision},
			reason:  "missing-or-invalid-revision",
		},
		"unavailable diff": {
			options: Options{
				RepositoryRoot: root,
				BaseRevision:   testBaseRevision,
				HeadRevision:   testHeadRevision,
			},
			reason: "git-diff-unavailable",
		},
	} {
		t.Run(name, func(t *testing.T) {
			plan, err := Build(context.Background(), test.options)
			if err != nil {
				t.Fatal(err)
			}
			if plan.Mode != "full" || plan.Reason != test.reason ||
				len(plan.ChangedPaths) != 0 || plan.ChangedPaths == nil ||
				!reflect.DeepEqual(plan.Lanes, []string{"full", "renderer"}) {
				t.Fatalf("Build() = %#v, want closed full plan", plan)
			}
			body, err := json.Marshal(plan)
			if err != nil {
				t.Fatal(err)
			}
			if !strings.Contains(string(body), `"changed_paths":[]`) {
				t.Fatalf("JSON = %s, want non-null changed_paths", body)
			}
		})
	}
}

func TestPlanChangedPathsFallsBackToFullAtEveryAmbiguousBoundary(t *testing.T) {
	t.Parallel()
	root := writePlanRepository(t, testMapping)
	options := testOptions(root)
	tests := []struct {
		name     string
		paths    []string
		reason   string
		renderer bool
	}{
		{name: "shared library", paths: []string{"experiments/workstation/lib/checkpoint-ledger.mjs"}, reason: "full-authority-changed"},
		{name: "unknown", paths: []string{"new-root/tool.mjs"}, reason: "unmapped-path:new-root/tool.mjs", renderer: true},
		{name: "mapping", paths: []string{mappingRelativePath}, reason: "selector-authority-changed", renderer: true},
		{name: "selector", paths: []string{"tooling/internal/ciplan/plan.go"}, reason: "selector-authority-changed", renderer: true},
		{name: "workflow", paths: []string{".github/workflows/ci.yml"}, reason: "selector-authority-changed", renderer: true},
		{name: "empty", paths: nil, reason: "empty-change-set", renderer: true},
		{name: "unsafe", paths: []string{"../escape"}, reason: "invalid-or-excessive-change-set", renderer: true},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			plan := selectTestPaths(t, root, options, test.paths)
			wantLanes := []string{"full"}
			if test.renderer {
				wantLanes = append(wantLanes, "renderer")
			}
			if plan.Mode != "full" || plan.Reason != test.reason ||
				!reflect.DeepEqual(plan.Lanes, wantLanes) {
				t.Fatalf("planChangedPaths() = %#v, want full/%s", plan, test.reason)
			}
		})
	}
}

func TestPlanChangedPathsBoundsAndSortsTheChangeSet(t *testing.T) {
	t.Parallel()
	root := writePlanRepository(t, testMapping)
	options := testOptions(root)
	plan := selectTestPaths(t, root, options, []string{"app/z.tsx", "app/a.tsx", "app/a.tsx"})
	if !reflect.DeepEqual(plan.ChangedPaths, []string{"app/a.tsx", "app/z.tsx"}) {
		t.Fatalf("ChangedPaths = %v, want sorted unique paths", plan.ChangedPaths)
	}
	excessive := make([]string, maximumChanges+1)
	for index := range excessive {
		excessive[index] = "app/" + strings.Repeat("a", 10) + string(rune(0x1000+index))
	}
	plan = selectTestPaths(t, root, options, excessive)
	if plan.Mode != "full" || plan.Reason != "invalid-or-excessive-change-set" {
		t.Fatalf("excessive plan = %#v, want full fallback", plan)
	}
}

func TestPlanChangedPathsFallsBackWhenTheMappingIsInvalid(t *testing.T) {
	t.Parallel()
	for name, body := range map[string]string{
		"malformed":      `{"schema":1`,
		"duplicate name": `{"schema":1,"schema":1,"rules":[]}`,
		"unknown field":  `{"schema":1,"rules":[],"extra":true}`,
	} {
		t.Run(name, func(t *testing.T) {
			root := writePlanRepository(t, body)
			if _, err := loadMapping(root); err == nil {
				t.Fatal("loadMapping() accepted an invalid mapping")
			}
			if _, err := Build(context.Background(), Options{RepositoryRoot: root, ForceFull: true}); err == nil {
				t.Fatal("Build(--full) skipped invalid selector authority")
			}
		})
	}
}

func TestPlanChangedPathsRejectsASymlinkedMapping(t *testing.T) {
	t.Parallel()
	root := writePlanRepository(t, testMapping)
	mappingPath := filepath.Join(root, filepath.FromSlash(mappingRelativePath))
	if err := os.Remove(mappingPath); err != nil {
		t.Fatal(err)
	}
	outside := filepath.Join(t.TempDir(), "mapping.json")
	if err := os.WriteFile(outside, []byte(testMapping), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(outside, mappingPath); err != nil {
		t.Skipf("symbolic links unavailable: %v", err)
	}
	if _, err := Build(context.Background(), Options{RepositoryRoot: root, ForceFull: true}); err == nil {
		t.Fatal("Build(--full) accepted a symlinked mapping")
	}
}

func selectTestPaths(t *testing.T, root string, options Options, paths []string) Plan {
	t.Helper()
	mapping, err := loadMapping(root)
	if err != nil {
		t.Fatal(err)
	}
	return selectChangedPaths(mapping, options, paths)
}

func testOptions(root string) Options {
	return Options{
		RepositoryRoot: root,
		BaseRevision:   testBaseRevision,
		HeadRevision:   testHeadRevision,
	}
}

func writePlanRepository(t *testing.T, mapping string) string {
	t.Helper()
	root := t.TempDir()
	for _, directory := range []string{".git", ".github"} {
		if err := os.MkdirAll(filepath.Join(root, directory), 0o755); err != nil {
			t.Fatal(err)
		}
	}
	if err := os.WriteFile(
		filepath.Join(root, filepath.FromSlash(mappingRelativePath)),
		[]byte(mapping),
		0o600,
	); err != nil {
		t.Fatal(err)
	}
	return root
}
