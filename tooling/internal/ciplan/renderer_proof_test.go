package ciplan

import (
	"bytes"
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

func TestRendererProofSelectionKeepsTheRenderGate(t *testing.T) {
	t.Parallel()
	root := filepath.Clean(filepath.Join("..", "..", ".."))
	for _, test := range []struct {
		name  string
		paths []string
		want  string
	}{
		{"styles", []string{"app/globals.css"}, "render-pair"},
		{"book component", []string{"app/components/book-edition.tsx"}, "render-pair"},
		{"publication pair", []string{"CHANGELOG.md", "app/globals.css", "public/downloads/book-manifest.json", "public/downloads/20-watts-was-enough-full-concept-book.pdf"}, "render-pair"},
		{"PR 111 actual changes", []string{"CHANGELOG.md", "app/globals.css", "public/downloads/20-watts-was-enough-full-concept-book.pdf", "public/downloads/book-manifest.json", "scripts/book-edition-surface.test.mjs", "scripts/book-pdf-semantic-baseline.json", "scripts/lib/pdf-metadata.test.mjs"}, "render-pair"},
		{"executable metadata companion", []string{"app/globals.css", "scripts/lib/pdf-metadata.mjs"}, "image-build"},
		{"executable audit companion", []string{"app/globals.css", "scripts/audit-book-pdf-semantics.mjs"}, "image-build"},
		{"near-name companion", []string{"app/globals.css", "scripts/book-edition-surface-other.test.mjs"}, "image-build"},
		{"image owner", []string{"app/globals.css", "tooling/internal/pdfrender/render.go"}, "image-build"},
		{"dependency", []string{"app/globals.css", "package-lock.json"}, "image-build"},
		{"selector", []string{"app/globals.css", ".github/ci-impact.json"}, "image-build"},
		{"release workflow", []string{".github/workflows/release.yml"}, "image-build"},
		{"release builder", []string{".github/workflows/release-build.yml"}, "image-build"},
		{"unknown companion", []string{"app/globals.css", "unmapped/new-file"}, "image-build"},
		{"no renderer", []string{"README.md"}, "none"},
	} {
		t.Run(test.name, func(t *testing.T) {
			plan := selectTestPaths(t, root, testOptions(root), test.paths)
			projection, err := Project(plan)
			if err != nil || projection.RendererProof != test.want || projection.Renderer != (test.want != "none") {
				t.Fatalf("projection=%+v error=%v, want %s", projection, err, test.want)
			}
		})
	}
}

// The hand command that re-records the book provenance without a render is
// sound only for sources whose change always runs the renderer job with two
// independent builds, alone and beside the record files it rewrites.
func TestRenderFreeBookSourcesSelectTheIndependentBuildProof(t *testing.T) {
	t.Parallel()
	root := filepath.Clean(filepath.Join("..", "..", ".."))
	body, err := os.ReadFile(filepath.Join(root, "scripts", "book-render-free-sources.json"))
	if err != nil {
		t.Fatal(err)
	}
	var list struct {
		Schema int      `json:"schema"`
		Paths  []string `json:"paths"`
	}
	decoder := json.NewDecoder(bytes.NewReader(body))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&list); err != nil || list.Schema != 1 || len(list.Paths) == 0 || len(list.Paths) > 16 {
		t.Fatalf("render-free source list=%+v error=%v", list, err)
	}
	record := []string{"CHANGELOG.md", "public/downloads/book-manifest.json", "scripts/book-pdf-semantic-baseline.json"}
	for _, source := range list.Paths {
		for _, paths := range [][]string{{source}, append([]string{source}, record...)} {
			projection, err := Project(selectTestPaths(t, root, testOptions(root), paths))
			if err != nil || !projection.Renderer || projection.RendererProof != "image-build" {
				t.Fatalf("paths %v: projection=%+v error=%v, want the independent-build proof", paths, projection, err)
			}
		}
	}
	chapter := append([]string{"concept/00-thesis-and-principles.md"}, record...)
	projection, err := Project(selectTestPaths(t, root, testOptions(root), chapter))
	if err != nil || projection.Renderer {
		t.Fatalf("chapter change projection=%+v error=%v, want no renderer job", projection, err)
	}
}

func TestFullPlansNeverSelectRenderPairOnly(t *testing.T) {
	t.Parallel()
	for _, paths := range [][]string{nil, {"app/globals.css"}} {
		projection, err := Project(newFullPlan(Options{}, "explicit-full", paths, true))
		if err != nil || projection.RendererProof != "image-build" {
			t.Fatalf("projection=%+v error=%v", projection, err)
		}
	}
}

func TestDeletedPresentationAuthorityKeepsIndependentBuilds(t *testing.T) {
	t.Parallel()
	root := initializeGitPlanRepository(t)
	file := filepath.Join(root, "app", "globals.css")
	if err := os.MkdirAll(filepath.Dir(file), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(file, []byte("body {}\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	base := commitGitPlanRepository(t, root, "base")
	if err := os.Remove(file); err != nil {
		t.Fatal(err)
	}
	head := commitGitPlanRepository(t, root, "delete renderer authority")
	plan, err := Build(context.Background(), Options{RepositoryRoot: root, BaseRevision: base, HeadRevision: head})
	if err != nil {
		t.Fatal(err)
	}
	projection, err := Project(plan)
	if err != nil || plan.Mode != "full" || projection.RendererProof != "image-build" {
		t.Fatalf("plan=%+v projection=%+v error=%v", plan, projection, err)
	}
}
