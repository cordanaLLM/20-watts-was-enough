// Package ciplan selects bounded CI lanes from one exact Git change set.
package ciplan

import (
	"context"
	"errors"
	"fmt"
	"maps"
	"os"
	"path"
	"path/filepath"
	"slices"
	"sort"
	"strings"
	"time"
	"unicode/utf8"
)

const (
	planSchema       = 2
	fullLane         = "full"
	maximumPathBytes = 1024
	maximumChanges   = 4096
)

// Options binds a plan to one repository and exact Git revisions.
type Options struct {
	RepositoryRoot string
	BaseRevision   string
	HeadRevision   string
	ForceFull      bool
}

// Plan is the stable machine-readable CI selection contract.
type Plan struct {
	Schema       int      `json:"schema"`
	Mode         string   `json:"mode"`
	Reason       string   `json:"reason"`
	BaseRevision string   `json:"base_revision,omitempty"`
	HeadRevision string   `json:"head_revision,omitempty"`
	ChangedPaths []string `json:"changed_paths"`
	Lanes        []string `json:"lanes"`
}

// MaximumBuildDuration bounds one Build: its Git diff and Git log commands run
// in sequence under their own limits, and the margin covers the bounded
// mapping and repository reads around them.
const MaximumBuildDuration = gitDiffTimeout + gitLogTimeout + 30*time.Second

// Build reads one bounded Git diff and returns either an impact or full plan.
func Build(ctx context.Context, options Options) (Plan, error) {
	root, err := resolveRepositoryRoot(options.RepositoryRoot)
	if err != nil {
		return Plan{}, err
	}
	mapping, err := loadMapping(root)
	if err != nil {
		return Plan{}, fmt.Errorf("validate CI impact authority: %w", err)
	}
	if options.ForceFull && options.BaseRevision == "" && options.HeadRevision == "" {
		return newFullPlan(options, "explicit-full", nil, true), nil
	}
	if !revisionPattern.MatchString(options.BaseRevision) ||
		!revisionPattern.MatchString(options.HeadRevision) {
		return newFullPlan(options, "missing-or-invalid-revision", nil, true), nil
	}
	changedPaths, requiresFull, err := readGitChangedPaths(
		ctx,
		root,
		options.BaseRevision,
		options.HeadRevision,
	)
	if err != nil {
		return newFullPlan(options, "git-diff-unavailable", nil, true), nil
	}
	if requiresFull {
		return newFullPlan(
			options,
			"unsafe-change-shape",
			changedPaths,
			rendererRequiredForUnsafeChange(mapping, changedPaths),
		), nil
	}
	selected := selectChangedPaths(mapping, options, changedPaths)
	if !options.ForceFull {
		return selected, nil
	}
	return newFullPlan(
		options,
		"explicit-full",
		selected.ChangedPaths,
		planSelectsLane(selected, "renderer"),
	), nil
}

func selectChangedPaths(mapping Mapping, options Options, changedPaths []string) Plan {
	paths, valid := normalizeChangedPaths(changedPaths)
	if !valid {
		return newFullPlan(options, "invalid-or-excessive-change-set", nil, true)
	}
	if len(paths) == 0 {
		return newFullPlan(options, "empty-change-set", paths, true)
	}
	for _, changedPath := range paths {
		if isSelectorAuthority(changedPath) {
			return newFullPlan(
				options,
				"selector-authority-changed",
				paths,
				true,
			)
		}
	}
	lanes := make(map[string]struct{})
	for _, changedPath := range paths {
		matched := false
		for _, rule := range mapping.Rules {
			if !ruleMatches(rule, changedPath) {
				continue
			}
			matched = true
			for _, lane := range rule.Lanes {
				lanes[lane] = struct{}{}
			}
		}
		if !matched {
			return newFullPlan(options, "unmapped-path:"+changedPath, paths, true)
		}
	}
	if rendererRequiredForPaths(paths) {
		lanes["renderer"] = struct{}{}
	}
	if _, requiresFull := lanes[fullLane]; requiresFull {
		_, rendererSelected := lanes["renderer"]
		return newFullPlan(
			options,
			"full-authority-changed",
			paths,
			rendererSelected,
		)
	}
	selected := slices.Sorted(maps.Keys(lanes))
	if len(selected) == 0 {
		return newFullPlan(options, "empty-lane-selection", paths, true)
	}
	return Plan{
		Schema:       planSchema,
		Mode:         "impact",
		Reason:       "mapped-change-set",
		BaseRevision: options.BaseRevision,
		HeadRevision: options.HeadRevision,
		ChangedPaths: paths,
		Lanes:        selected,
	}
}

func newFullPlan(options Options, reason string, changedPaths []string, renderer bool) Plan {
	lanes := []string{fullLane}
	if renderer {
		lanes = append(lanes, "renderer")
	}
	return Plan{
		Schema:       planSchema,
		Mode:         "full",
		Reason:       reason,
		BaseRevision: options.BaseRevision,
		HeadRevision: options.HeadRevision,
		ChangedPaths: append([]string{}, changedPaths...),
		Lanes:        lanes,
	}
}

func planSelectsLane(plan Plan, lane string) bool {
	index := sort.SearchStrings(plan.Lanes, lane)
	return index < len(plan.Lanes) && plan.Lanes[index] == lane
}

func rendererRequiredForPaths(changedPaths []string) bool {
	for _, changedPath := range changedPaths {
		if isRendererAuthority(changedPath) {
			return true
		}
	}
	return false
}

func rendererRequiredForUnsafeChange(mapping Mapping, changedPaths []string) bool {
	if rendererRequiredForPaths(changedPaths) {
		return true
	}
	for _, changedPath := range changedPaths {
		if isSelectorAuthority(changedPath) {
			return true
		}
		matched := false
		for _, rule := range mapping.Rules {
			if ruleMatches(rule, changedPath) {
				matched = true
				break
			}
		}
		if !matched {
			return true
		}
	}
	return false
}

func isRendererAuthority(changedPath string) bool {
	if isRendererPresentation(changedPath) {
		return true
	}
	for _, exact := range []string{
		".github/ci-impact.json",
		".github/workflows/ci.yml",
		".github/workflows/release.yml",
		".github/workflows/release-build.yml",
		"package-lock.json",
		"package.json",
		"scripts/book-source.mjs",
		"scripts/generate-book-pdf.mjs",
		"scripts/install-locked-npm.mjs",
		"scripts/lib/atomic-file-pair.mjs",
		"scripts/lib/book-pdf-generation-options.mjs",
		"scripts/lib/book-pdf-integrity.mjs",
		"scripts/lib/book-print-equation-tags.mjs",
		"scripts/lib/book-renderer-identity.mjs",
		"scripts/lib/chromium-cdp.mjs",
		"scripts/lib/opened-file.mjs",
		"scripts/lib/pdf-metadata.mjs",
		"scripts/lib/strict-json.mjs",
		"scripts/npm-runtime-lock.json",
		"tooling/cmd/20w/main.go",
		"tooling/cmd/20w/pdf_reproducibility.go",
		"tooling/go.mod",
		"tooling/go.sum",
		"translations/eu-languages.json",
		"translations/manifest.json",
		"vite.pages.config.ts",
	} {
		if changedPath == exact {
			return true
		}
	}
	for _, prefix := range []string{
		"tooling/cmd/ci-plan/",
		"tooling/cmd/pdf-proof/",
		"tooling/internal/boundedexec/",
		"tooling/internal/ciplan/",
		"tooling/internal/ciplancli/",
		"tooling/internal/fileidentity/",
		"tooling/internal/pdfrender/",
		"tooling/internal/pdfrendercli/",
		"tooling/internal/pdfrenderlock/",
		"tooling/internal/strictjson/",
		"tooling/pdf-renderer/",
	} {
		if strings.HasPrefix(changedPath, prefix) {
			return true
		}
	}
	return false
}

func normalizeChangedPaths(values []string) ([]string, bool) {
	if len(values) > maximumChanges {
		return nil, false
	}
	unique := make(map[string]struct{}, len(values))
	for _, value := range values {
		if !validChangedPath(value) {
			return nil, false
		}
		unique[value] = struct{}{}
	}
	return slices.Sorted(maps.Keys(unique)), true
}

func validChangedPath(value string) bool {
	if value == "" || !utf8.ValidString(value) || len(value) > maximumPathBytes || strings.Contains(value, "\\") ||
		strings.HasPrefix(value, "/") || path.Clean(value) != value || value == "." ||
		strings.HasPrefix(value, "../") {
		return false
	}
	for _, character := range value {
		if character < 0x20 || character == 0x7f {
			return false
		}
	}
	return true
}

func isSelectorAuthority(changedPath string) bool {
	return changedPath == mappingRelativePath ||
		changedPath == ".github/workflows/ci.yml" ||
		changedPath == "tooling/go.mod" ||
		changedPath == "tooling/go.sum" ||
		strings.HasPrefix(changedPath, "tooling/cmd/20w/") ||
		strings.HasPrefix(changedPath, "tooling/cmd/ci-plan/") ||
		strings.HasPrefix(changedPath, "tooling/internal/ciplan/") ||
		strings.HasPrefix(changedPath, "tooling/internal/ciplancli/") ||
		strings.HasPrefix(changedPath, "tooling/internal/strictjson/")
}

func ruleMatches(rule Rule, changedPath string) bool {
	for _, pattern := range rule.Paths {
		if strings.HasSuffix(pattern, "/**") {
			prefix := strings.TrimSuffix(pattern, "**")
			if strings.HasPrefix(changedPath, prefix) {
				return true
			}
			continue
		}
		matched, err := path.Match(pattern, changedPath)
		if err == nil && matched {
			return true
		}
	}
	return false
}

func resolveRepositoryRoot(root string) (string, error) {
	if root == "" {
		return "", errors.New("repository root is empty")
	}
	absolute, err := filepath.Abs(root)
	if err != nil {
		return "", fmt.Errorf("resolve repository root: %w", err)
	}
	absolute = filepath.Clean(absolute)
	rootInformation, err := os.Lstat(absolute)
	if err != nil || !rootInformation.IsDir() || rootInformation.Mode()&os.ModeSymlink != 0 {
		return "", errors.New("repository root must be a real directory")
	}
	resolved, err := filepath.EvalSymlinks(absolute)
	if err != nil {
		return "", fmt.Errorf("resolve repository root links: %w", err)
	}
	if filepath.Clean(resolved) != absolute {
		return "", errors.New("repository root must not contain symlinks")
	}
	gitAuthority, err := os.Lstat(filepath.Join(absolute, ".git"))
	if err != nil || gitAuthority.Mode()&os.ModeSymlink != 0 ||
		(!gitAuthority.Mode().IsRegular() && !gitAuthority.IsDir()) {
		return "", errors.New("repository root has no Git authority")
	}
	return absolute, nil
}
