package visualbaseline

import (
	"encoding/json"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"
)

func TestPlanMaskSelectorsAndProjection(t *testing.T) {
	for _, selectors := range [][]string{
		nil, {}, {".counts dd", ".status span"}, {strings.Repeat("x", 512)},
		{"a", "b", "c", "d", "e", "f", "g", "h"},
	} {
		body, err := json.Marshal(selectors)
		if err != nil {
			t.Fatal(err)
		}
		plan, err := loadTestPlan(t, strings.Replace(validPlan, `"ready_selector":"main"`, `"ready_selector":"main","mask_selectors":`+string(body), 1))
		if err != nil {
			t.Fatal(err)
		}
		plan.Viewports = append(plan.Viewports, Viewport{Name: "mobile", Width: 1, Height: 2, Mobile: true})
		captures := plan.Captures().Captures
		if len(captures) != 2 || !slices.Equal(plan.Views[0].MaskSelectors, selectors) {
			t.Fatalf("plan=%+v captures=%+v", plan, captures)
		}
		for _, capture := range captures {
			if !slices.Equal(capture.MaskSelectors, selectors) {
				t.Fatalf("%s masks=%v, want %v", capture.Viewport, capture.MaskSelectors, selectors)
			}
		}
	}
}

func TestPlanRejectsInvalidMaskSelectors(t *testing.T) {
	cases := []struct {
		name      string
		selectors []string
	}{
		{name: "nine entries", selectors: []string{"a", "b", "c", "d", "e", "f", "g", "h", "i"}},
		{name: "blank", selectors: []string{""}},
		{name: "whitespace", selectors: []string{" \t\n"}},
		{name: "513 bytes", selectors: []string{strings.Repeat("x", 513)}},
		{name: "multibyte exceeds bytes", selectors: []string{strings.Repeat("é", 257)}},
		{name: "duplicate", selectors: []string{".counts dd", ".counts dd"}},
	}
	for _, test := range cases {
		t.Run(test.name, func(t *testing.T) {
			body, err := json.Marshal(test.selectors)
			if err != nil {
				t.Fatal(err)
			}
			_, err = loadTestPlan(t, strings.Replace(validPlan, `"ready_selector":"main"`, `"ready_selector":"main","mask_selectors":`+string(body), 1))
			if err == nil || !strings.Contains(err.Error(), "views.home.mask_selectors") {
				t.Fatalf("error=%v, want contextual mask_selectors rejection", err)
			}
		})
	}
}

const validPlan = `{"schema":1,"channel_tolerance":2,"maximum_differing_pixels":16,"viewports":[{"name":"desktop","width":2,"height":2,"mobile":false}],"views":[{"name":"home","path":"","ready_selector":"main"}]}`

func writeTestFile(t *testing.T, path string, body []byte) {
	t.Helper()
	if err := os.WriteFile(path, body, 0o600); err != nil {
		t.Fatal(err)
	}
}

func loadTestPlan(t *testing.T, body string) (Plan, error) {
	t.Helper()
	file := filepath.Join(t.TempDir(), "views.json")
	writeTestFile(t, file, []byte(body))
	return LoadPlan(file)
}

func TestPlanAndProjection(t *testing.T) {
	plan, err := loadTestPlan(t, validPlan)
	if err != nil {
		t.Fatal(err)
	}
	captures := plan.Captures()
	if len(captures.Captures) != 1 || captures.PagesBasePath != "/" {
		t.Fatal(captures)
	}
	first := captures.Captures[0]
	if first.URL != "/" || first.File != "home-desktop.png" || first.Width != 2 {
		t.Fatal(first)
	}
	for _, width := range []string{"1", "4096"} {
		if _, err := loadTestPlan(t, strings.Replace(validPlan, `"width":2`, `"width":`+width, 1)); err != nil {
			t.Fatal(err)
		}
	}
}

func TestPlanRejectsTampering(t *testing.T) {
	cases := []struct{ name, old, new, field string }{
		{"unknown", `"schema":1`, `"unknown":1,"schema":1`, "unknown"},
		{"duplicate key", `"schema":1`, `"schema":1,"schema":1`, "schema"},
		{"traversal name", `"name":"home"`, `"name":"../home"`, "name"},
		{"traversal path", `"path":""`, `"path":"a/../b"`, "path"},
		{"scheme", `"path":""`, `"path":"https://example.invalid"`, "path"},
		{"encoded traversal", `"path":""`, `"path":"%2e%2e/"`, "path"},
		{"absolute", `"path":""`, `"path":"//example.invalid/"`, "path"},
		{"zero width", `"width":2`, `"width":0`, "width"},
		{"oversized", `"height":2`, `"height":4097`, "height"},
		{"missing ready", `"ready_selector":"main"`, `"ready_selector":""`, "ready_selector"},
		{"channel upper", `"channel_tolerance":2`, `"channel_tolerance":256`, "channel_tolerance"},
		{"channel lower", `"channel_tolerance":2`, `"channel_tolerance":-1`, "channel_tolerance"},
		{"pixels lower", `"maximum_differing_pixels":16`, `"maximum_differing_pixels":-1`, "maximum_differing_pixels"},
		{"schema", `"schema":1`, `"schema":2`, "schema"},
	}
	for _, test := range cases {
		t.Run(test.name, func(t *testing.T) {
			_, err := loadTestPlan(t, strings.Replace(validPlan, test.old, test.new, 1))
			if err == nil || !strings.Contains(err.Error(), test.field) {
				t.Fatalf("error=%v, want %s", err, test.field)
			}
		})
	}
}

func TestPlanRejectsDuplicateInventoriesAndBounds(t *testing.T) {
	plan, err := loadTestPlan(t, validPlan)
	if err != nil {
		t.Fatal(err)
	}
	plan.Views = append(plan.Views, plan.Views[0])
	if err := plan.validate(); err == nil || !strings.Contains(err.Error(), "views.name") {
		t.Fatal(err)
	}
	plan.Views = plan.Views[:1]
	plan.Viewports = append(plan.Viewports, plan.Viewports[0])
	if err := plan.validate(); err == nil || !strings.Contains(err.Error(), "viewports.name") {
		t.Fatal(err)
	}
	plan.Viewports = nil
	if err := plan.validate(); err == nil {
		t.Fatal("empty viewports accepted")
	}
	if _, err := loadTestPlan(t, strings.Repeat(" ", maximumJSONBytes+1)); err == nil {
		t.Fatal("unbounded plan accepted")
	}
}

func TestRequiredFieldsAndCaptureNameCollisions(t *testing.T) {
	for _, field := range []string{`"mobile":false`, `"channel_tolerance":2`, `"maximum_differing_pixels":16`} {
		missing := strings.Replace(validPlan, field+",", "", 1)
		missing = strings.Replace(missing, ","+field, "", 1)
		if _, err := loadTestPlan(t, missing); err == nil {
			t.Fatalf("accepted missing %s", field)
		}
		parts := strings.SplitN(field, ":", 2)
		if _, err := loadTestPlan(t, strings.Replace(validPlan, field, parts[0]+":null", 1)); err == nil {
			t.Fatalf("accepted null %s", field)
		}
	}
	plan, err := loadTestPlan(t, validPlan)
	if err != nil {
		t.Fatal(err)
	}
	plan.Views = []View{{Name: "a-b", ReadySelector: "main"}, {Name: "a", ReadySelector: "main"}}
	plan.Viewports = []Viewport{{Name: "c", Width: 1, Height: 1}, {Name: "b-c", Width: 1, Height: 1}}
	if err := plan.validate(); err == nil || !strings.Contains(err.Error(), "duplicate file") {
		t.Fatal(err)
	}
	plan.Views = make([]View, maximumViews+1)
	if err := plan.validate(); err == nil || !strings.Contains(err.Error(), "views") {
		t.Fatal(err)
	}
}
