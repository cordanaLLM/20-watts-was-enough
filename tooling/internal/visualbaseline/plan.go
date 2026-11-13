// Package visualbaseline validates and compares a bounded screenshot inventory.
package visualbaseline

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"net/url"
	"regexp"
	"strings"

	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/strictjson"
)

const (
	BaselineDirectory    = "scripts/visual-baselines"
	maximumJSONBytes     = 128 * 1024
	maximumViews         = 8
	maximumViewports     = 4
	maximumDimension     = 4096
	maximumMaskSelectors = 8
)

var namePattern = regexp.MustCompile(`^[a-z0-9-]{1,40}$`)
var pngNamePattern = regexp.MustCompile(`^[a-z0-9-]{3,81}\.png$`)
var routePattern = regexp.MustCompile(`^[A-Za-z0-9_~./#-]*$`)

// Plan is the checked-in capture inventory and pixel acceptance law.
type Plan struct {
	Schema                 int        `json:"schema"`
	ChannelTolerance       int        `json:"channel_tolerance"`
	MaximumDifferingPixels int        `json:"maximum_differing_pixels"`
	Viewports              []Viewport `json:"viewports"`
	Views                  []View     `json:"views"`
}

type Viewport struct {
	Name   string `json:"name"`
	Width  int    `json:"width"`
	Height int    `json:"height"`
	Mobile bool   `json:"mobile"`
}

type View struct {
	Name                   string   `json:"name"`
	Path                   string   `json:"path"`
	ReadySelector          string   `json:"ready_selector"`
	RequireVisibleSelector string   `json:"require_visible_selector,omitempty"`
	MaskSelectors          []string `json:"mask_selectors,omitempty"`
}

// LoadPlan rejects ambiguous, oversized and unsafe authority input.
func LoadPlan(path string) (Plan, error) {
	body, err := readPath(path, maximumJSONBytes)
	if err != nil {
		return Plan{}, fmt.Errorf("read visual plan: %w", err)
	}
	var plan Plan
	if err := decodeStrict(body, &plan); err != nil {
		return Plan{}, fmt.Errorf("visual plan: %w", err)
	}
	if err := plan.validate(); err != nil {
		return Plan{}, err
	}
	if err := requirePlanFields(body); err != nil {
		return Plan{}, err
	}
	return plan, nil
}

func decodeStrict(body []byte, value any) error {
	if len(body) == 0 || len(body) > maximumJSONBytes {
		return errors.New("JSON size must be 1..131072 bytes")
	}
	if err := strictjson.Validate(body, 8); err != nil {
		return err
	}
	decoder := json.NewDecoder(bytes.NewReader(body))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(value); err != nil {
		return fmt.Errorf("decode JSON: %w", err)
	}
	return nil
}

func (plan Plan) validate() error {
	if err := plan.validateTolerance(); err != nil {
		return err
	}
	if len(plan.Views) == 0 || len(plan.Views) > maximumViews {
		return errors.New("views must contain 1..8 entries")
	}
	if len(plan.Viewports) == 0 || len(plan.Viewports) > maximumViewports {
		return errors.New("viewports must contain 1..4 entries")
	}
	if err := validateViewports(plan.Viewports); err != nil {
		return err
	}
	if err := validateViews(plan.Views); err != nil {
		return err
	}
	return validateCaptureNames(plan.Captures())
}

func (plan Plan) validateTolerance() error {
	if plan.Schema != 1 {
		return errors.New("schema must be 1")
	}
	if plan.ChannelTolerance < 0 || plan.ChannelTolerance > 255 {
		return errors.New("channel_tolerance must be 0..255")
	}
	if plan.MaximumDifferingPixels < 0 || plan.MaximumDifferingPixels > maximumDimension*maximumDimension {
		return errors.New("maximum_differing_pixels must be 0..16777216")
	}
	return nil
}

func admitName(name, field string, seen map[string]bool) error {
	if !namePattern.MatchString(name) {
		return fmt.Errorf("%s.name %q must match [a-z0-9-]{1,40}", field, name)
	}
	if seen[name] {
		return fmt.Errorf("%s.name %q is duplicated", field, name)
	}
	seen[name] = true
	return nil
}

func validateViewports(viewports []Viewport) error {
	seen := make(map[string]bool, len(viewports))
	for _, viewport := range viewports {
		if err := admitName(viewport.Name, "viewports", seen); err != nil {
			return err
		}
		if viewport.Width < 1 || viewport.Width > maximumDimension {
			return fmt.Errorf("viewports.%s.width must be 1..4096", viewport.Name)
		}
		if viewport.Height < 1 || viewport.Height > maximumDimension {
			return fmt.Errorf("viewports.%s.height must be 1..4096", viewport.Name)
		}
	}
	return nil
}

func validateViews(views []View) error {
	seen := make(map[string]bool, len(views))
	for _, view := range views {
		if err := admitName(view.Name, "views", seen); err != nil {
			return err
		}
		if err := validateRoute(view.Path); err != nil {
			return fmt.Errorf("views.%s.path: %w", view.Name, err)
		}
		if strings.TrimSpace(view.ReadySelector) == "" || len(view.ReadySelector) > 512 {
			return fmt.Errorf("views.%s.ready_selector must contain 1..512 characters", view.Name)
		}
		if len(view.RequireVisibleSelector) > 512 {
			return fmt.Errorf("views.%s.require_visible_selector exceeds 512 characters", view.Name)
		}
		if err := validateMaskSelectors(view); err != nil {
			return err
		}
	}
	return nil
}

func validateMaskSelectors(view View) error {
	if len(view.MaskSelectors) > maximumMaskSelectors {
		return fmt.Errorf("views.%s.mask_selectors must contain at most 8 entries", view.Name)
	}
	seen := make(map[string]bool, len(view.MaskSelectors))
	for _, selector := range view.MaskSelectors {
		if strings.TrimSpace(selector) == "" || len(selector) > 512 {
			return fmt.Errorf("views.%s.mask_selectors entries must be non-blank and at most 512 bytes", view.Name)
		}
		if seen[selector] {
			return fmt.Errorf("views.%s.mask_selectors contains duplicate %q", view.Name, selector)
		}
		seen[selector] = true
	}
	return nil
}

func validateRoute(route string) error {
	parsed, err := url.Parse(route)
	if err != nil {
		return fmt.Errorf("parse route: %w", err)
	}
	if !routePattern.MatchString(route) || strings.HasPrefix(route, "/") || strings.Contains(route, "..") {
		return errors.New("use a relative URL path without traversal, scheme, escapes or query")
	}
	if parsed.IsAbs() || parsed.Host != "" {
		return errors.New("scheme and host are forbidden")
	}
	if err := validateRouteSegments(parsed.Path); err != nil {
		return err
	}
	return nil
}

func validateRouteSegments(route string) error {
	if route == "" {
		return nil
	}
	segments := strings.Split(strings.TrimSuffix(route, "/"), "/")
	if len(segments) > 512 {
		return errors.New("route exceeds 512 path segments")
	}
	for _, segment := range segments {
		if segment == "." || segment == "" {
			return errors.New("route forbids dot and empty path segments except one trailing slash")
		}
	}
	return nil
}

// CapturePlan is the validated projection consumed by the container executor.
type CapturePlan struct {
	Schema   int       `json:"schema"`
	Captures []Capture `json:"captures"`
}

type Capture struct {
	File                   string   `json:"file"`
	View                   string   `json:"view"`
	Viewport               string   `json:"viewport"`
	Width                  int      `json:"width"`
	Height                 int      `json:"height"`
	Mobile                 bool     `json:"mobile"`
	URL                    string   `json:"url"`
	ReadySelector          string   `json:"ready_selector"`
	RequireVisibleSelector string   `json:"require_visible_selector,omitempty"`
	MaskSelectors          []string `json:"mask_selectors,omitempty"`
}

// Captures projects navigation URLs relative to the fixed local Pages root.
func (plan Plan) Captures() CapturePlan {
	result := CapturePlan{Schema: 1, Captures: make([]Capture, 0, len(plan.Views)*len(plan.Viewports))}
	for _, view := range plan.Views {
		for _, viewport := range plan.Viewports {
			result.Captures = append(result.Captures, Capture{
				File: view.Name + "-" + viewport.Name + ".png", View: view.Name, Viewport: viewport.Name,
				Width: viewport.Width, Height: viewport.Height, Mobile: viewport.Mobile, URL: "/" + view.Path,
				ReadySelector: view.ReadySelector, RequireVisibleSelector: view.RequireVisibleSelector,
				MaskSelectors: view.MaskSelectors,
			})
		}
	}
	return result
}

func requirePlanFields(body []byte) error {
	var fields map[string]json.RawMessage
	if err := json.Unmarshal(body, &fields); err != nil {
		return err
	}
	if err := requireFields(fields, "plan", []string{"schema", "channel_tolerance", "maximum_differing_pixels", "viewports", "views"}); err != nil {
		return err
	}
	for _, group := range []struct {
		name     string
		required []string
	}{
		{name: "viewports", required: []string{"name", "width", "height", "mobile"}},
		{name: "views", required: []string{"name", "path", "ready_selector"}},
	} {
		var items []map[string]json.RawMessage
		if err := json.Unmarshal(fields[group.name], &items); err != nil {
			return err
		}
		for _, item := range items {
			if err := requireFields(item, group.name, group.required); err != nil {
				return err
			}
		}
	}
	return nil
}

func requireFields(fields map[string]json.RawMessage, label string, required []string) error {
	for _, field := range required {
		value, ok := fields[field]
		if !ok || bytes.Equal(bytes.TrimSpace(value), []byte("null")) {
			return fmt.Errorf("%s.%s is required and cannot be null", label, field)
		}
	}
	return nil
}

func validateCaptureNames(plan CapturePlan) error {
	seen := make(map[string]bool, len(plan.Captures))
	for _, capture := range plan.Captures {
		if seen[capture.File] {
			return fmt.Errorf("views and viewports produce duplicate file %q", capture.File)
		}
		seen[capture.File] = true
	}
	return nil
}
