package visualbaseline

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/pdfrenderlock"
)

func manifestFixture(t *testing.T) (string, CapturePlan, pdfrenderlock.Lock, Manifest) {
	t.Helper()
	root := t.TempDir()
	if err := os.Mkdir(filepath.Join(root, "visual-capture"), 0o750); err != nil {
		t.Fatal(err)
	}
	plan, err := loadTestPlan(t, validPlan)
	if err != nil {
		t.Fatal(err)
	}
	captures := plan.Captures()
	c := captures.Captures[0]
	lock := pdfrenderlock.Lock{ChromeForTesting: pdfrenderlock.ChromeForTesting{Version: "152.0.7977.64"}}
	manifest := Manifest{Schema: 1, Captures: []Captured{{File: c.File, View: c.View, Viewport: c.Viewport, Width: c.Width, Height: c.Height, URL: "http://127.0.0.1:3137" + c.URL, BrowserProduct: "Chrome/" + lock.ChromeForTesting.Version}}}
	image, err := encodePNG(solid(2, 2))
	if err != nil {
		t.Fatal(err)
	}
	writeTestFile(t, filepath.Join(root, "visual-capture", c.File), image)
	saveManifest(t, root, manifest)
	return root, captures, lock, manifest
}

func saveManifest(t *testing.T, root string, manifest Manifest) {
	t.Helper()
	body, err := json.Marshal(manifest)
	if err != nil {
		t.Fatal(err)
	}
	writeTestFile(t, filepath.Join(root, "visual-capture", "capture-manifest.json"), body)
}

func TestManifestAcceptsOnlyTheExactCapture(t *testing.T) {
	root, plan, lock, manifest := manifestFixture(t)
	if _, err := ValidateManifest(root, plan, lock); err != nil {
		t.Fatal(err)
	}
	manifest.Captures[0].BrowserProduct = "HeadlessChrome/" + lock.ChromeForTesting.Version
	saveManifest(t, root, manifest)
	if _, err := ValidateManifest(root, plan, lock); err != nil {
		t.Fatal(err)
	}
}

func TestManifestRejectsCaseAliasedKeys(t *testing.T) {
	for _, test := range []struct{ name, old, replacement, field string }{
		{"top-level alias", `"schema":1`, `"schema":1,"Schema":1`, "Schema"},
		{"capture alias", `"width":2`, `"Width":2`, "Width"},
	} {
		t.Run(test.name, func(t *testing.T) {
			root, plan, lock, _ := manifestFixture(t)
			file := filepath.Join(root, "visual-capture", "capture-manifest.json")
			body := strings.Replace(string(readTestFile(t, file)), test.old, test.replacement, 1)
			writeTestFile(t, file, []byte(body))
			_, err := ValidateManifest(root, plan, lock)
			if err == nil || !strings.Contains(err.Error(), "unknown or case-aliased field") || !strings.Contains(err.Error(), test.field) {
				t.Fatalf("error=%v, want exact-key rejection of %s", err, test.field)
			}
		})
	}
}

func TestManifestRejectsTampering(t *testing.T) {
	for _, kind := range []string{"browser", "missing", "extra", "duplicate", "traversal", "url", "dimensions", "PNG dimensions", "unknown", "duplicate key"} {
		t.Run(kind, func(t *testing.T) {
			root, plan, lock, manifest := manifestFixture(t)
			switch kind {
			case "browser":
				manifest.Captures[0].BrowserProduct = "Chrome/1.0.0.0"
			case "missing":
				manifest.Captures = nil
			case "extra":
				manifest.Captures = append(manifest.Captures, manifest.Captures[0])
			case "duplicate":
				plan.Captures = append(plan.Captures, plan.Captures[0])
				manifest.Captures = append(manifest.Captures, manifest.Captures[0])
			case "traversal":
				manifest.Captures[0].File = "../escape.png"
			case "url":
				manifest.Captures[0].URL = "https://example.invalid/"
			case "dimensions":
				manifest.Captures[0].Width++
			case "PNG dimensions":
				body, _ := encodePNG(solid(3, 2))
				writeTestFile(t, filepath.Join(root, "visual-capture", "home-desktop.png"), body)
			}
			saveManifest(t, root, manifest)
			file := filepath.Join(root, "visual-capture", "capture-manifest.json")
			if kind == "unknown" {
				body := readTestFile(t, file)
				writeTestFile(t, file, []byte(strings.Replace(string(body), `"schema":1`, `"schema":1,"unknown":1`, 1)))
			}
			if kind == "duplicate key" {
				body := readTestFile(t, file)
				writeTestFile(t, file, []byte(strings.Replace(string(body), `"schema":1`, `"schema":1,"schema":1`, 1)))
			}
			if _, err := ValidateManifest(root, plan, lock); err == nil {
				t.Fatal("tampered manifest accepted")
			}
		})
	}
}
