package ciplan

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path"
	"path/filepath"
	"regexp"
	"sort"
	"strings"

	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/strictjson"
)

const (
	mappingRelativePath = ".github/ci-impact.json"
	maximumMappingBytes = 64 << 10
	maximumRules        = 128
	maximumRulePaths    = 64
	maximumRuleLanes    = 16
)

var (
	ruleIDPattern            = regexp.MustCompile(`^[a-z][a-z0-9-]{0,63}$`)
	lanePattern              = regexp.MustCompile(`^[a-z][a-z0-9-]{0,63}$`)
	workstationScriptPattern = regexp.MustCompile(`^test:workstation:[a-z][a-z0-9-]*(?::[a-z][a-z0-9-]*)?$`)
)

// WorkstationJob is one closed artifact-to-script mapping and its creation rank.
type WorkstationJob struct {
	Artifact     string
	Script       string
	CreationRank int
}

type laneDefinition struct {
	WorkstationJobs []WorkstationJob
}

// Mapping is the closed path-to-lane authority.
type Mapping struct {
	Schema int    `json:"schema"`
	Rules  []Rule `json:"rules"`
}

// Rule maps one or more repository path patterns to bounded lane identities.
type Rule struct {
	ID    string   `json:"id"`
	Paths []string `json:"paths"`
	Lanes []string `json:"lanes"`
}

func loadMapping(root string) (Mapping, error) {
	githubDirectory := filepath.Join(root, ".github")
	if err := requireRealDirectory(githubDirectory, ".github directory"); err != nil {
		return Mapping{}, err
	}
	body, err := readStableMapping(filepath.Join(githubDirectory, "ci-impact.json"))
	if err != nil {
		return Mapping{}, fmt.Errorf("read %s: %w", mappingRelativePath, err)
	}
	if err := strictjson.Validate(body, 8); err != nil {
		return Mapping{}, fmt.Errorf("validate unambiguous impact JSON: %w", err)
	}
	decoder := json.NewDecoder(bytes.NewReader(body))
	decoder.DisallowUnknownFields()
	var mapping Mapping
	if err := decoder.Decode(&mapping); err != nil {
		return Mapping{}, fmt.Errorf("decode impact mapping: %w", err)
	}
	if decoder.Decode(&struct{}{}) != io.EOF {
		return Mapping{}, errors.New("impact mapping contains trailing data")
	}
	if err := validateMapping(mapping); err != nil {
		return Mapping{}, err
	}
	return mapping, nil
}

func validateMapping(mapping Mapping) error {
	if embeddedWorkstationCatalogueError != nil {
		return fmt.Errorf("load embedded workstation catalogue: %w", embeddedWorkstationCatalogueError)
	}
	if mapping.Schema != 1 {
		return fmt.Errorf("impact mapping schema is %d, want 1", mapping.Schema)
	}
	if len(mapping.Rules) == 0 || len(mapping.Rules) > maximumRules {
		return fmt.Errorf("impact mapping must contain between 1 and %d rules", maximumRules)
	}
	identities := make(map[string]struct{}, len(mapping.Rules))
	patterns := make(map[string]struct{})
	previousID := ""
	for _, rule := range mapping.Rules {
		if !ruleIDPattern.MatchString(rule.ID) || rule.ID <= previousID {
			return fmt.Errorf("impact rule IDs must be unique, valid, and sorted: %q", rule.ID)
		}
		if _, duplicate := identities[rule.ID]; duplicate {
			return fmt.Errorf("impact rule ID is repeated: %s", rule.ID)
		}
		identities[rule.ID] = struct{}{}
		previousID = rule.ID
		if err := validateRule(rule, patterns); err != nil {
			return fmt.Errorf("impact rule %s: %w", rule.ID, err)
		}
	}
	return nil
}

func validateRule(rule Rule, globalPatterns map[string]struct{}) error {
	if len(rule.Paths) == 0 || len(rule.Paths) > maximumRulePaths {
		return fmt.Errorf("paths must contain between 1 and %d entries", maximumRulePaths)
	}
	if len(rule.Lanes) == 0 || len(rule.Lanes) > maximumRuleLanes {
		return fmt.Errorf("lanes must contain between 1 and %d entries", maximumRuleLanes)
	}
	if !sort.StringsAreSorted(rule.Paths) || !sort.StringsAreSorted(rule.Lanes) {
		return errors.New("paths and lanes must be sorted")
	}
	for index, pattern := range rule.Paths {
		if index > 0 && pattern == rule.Paths[index-1] {
			return fmt.Errorf("path pattern is repeated: %s", pattern)
		}
		if _, duplicate := globalPatterns[pattern]; duplicate {
			return fmt.Errorf("path pattern is owned by more than one rule: %s", pattern)
		}
		if err := validatePathPattern(pattern); err != nil {
			return err
		}
		globalPatterns[pattern] = struct{}{}
	}
	for index, lane := range rule.Lanes {
		_, allowed := allowedLanes[lane]
		if !allowed || !lanePattern.MatchString(lane) || (index > 0 && lane == rule.Lanes[index-1]) {
			return fmt.Errorf("lane is invalid or repeated: %q", lane)
		}
	}
	return nil
}

func validatePathPattern(pattern string) error {
	if pattern == "" || len(pattern) > maximumPathBytes || strings.Contains(pattern, "\\") ||
		strings.HasPrefix(pattern, "/") ||
		(strings.Contains(pattern, "**") && !strings.HasSuffix(pattern, "/**")) ||
		strings.Count(pattern, "**") > 1 {
		return fmt.Errorf("path pattern is unsafe: %q", pattern)
	}
	for _, character := range pattern {
		if character < 0x20 || character == 0x7f {
			return fmt.Errorf("path pattern contains a control character: %q", pattern)
		}
	}
	cleaned := strings.TrimSuffix(pattern, "/**")
	if strings.HasSuffix(pattern, "/**") && strings.ContainsAny(cleaned, "*?[") {
		return fmt.Errorf("recursive path prefix must be literal: %q", pattern)
	}
	for _, segment := range strings.Split(cleaned, "/") {
		if segment == "" || segment == "." || segment == ".." {
			return fmt.Errorf("path pattern is unsafe: %q", pattern)
		}
	}
	if _, err := path.Match(pattern, "probe"); err != nil && !strings.HasSuffix(pattern, "/**") {
		return fmt.Errorf("path pattern is malformed: %q", pattern)
	}
	return nil
}

func requireRealDirectory(directory, label string) error {
	information, err := os.Lstat(directory)
	if err != nil || !information.IsDir() || information.Mode()&os.ModeSymlink != 0 {
		return fmt.Errorf("%s must be a real directory", label)
	}
	resolved, err := filepath.EvalSymlinks(directory)
	if err != nil || filepath.Clean(resolved) != filepath.Clean(directory) {
		return fmt.Errorf("%s must not contain symlinks", label)
	}
	return nil
}

func readStableMapping(filename string) ([]byte, error) {
	before, err := os.Lstat(filename)
	if err != nil || !before.Mode().IsRegular() {
		return nil, errors.New("mapping must be a regular file")
	}
	if before.Size() > maximumMappingBytes {
		return nil, fmt.Errorf("mapping exceeds the %d-byte limit", maximumMappingBytes)
	}
	file, err := os.Open(filename)
	if err != nil {
		return nil, err
	}
	defer file.Close()
	opened, err := file.Stat()
	if err != nil || !opened.Mode().IsRegular() || !os.SameFile(before, opened) {
		return nil, errors.New("mapping changed before it was opened")
	}
	body, err := io.ReadAll(io.LimitReader(file, maximumMappingBytes+1))
	if err != nil {
		return nil, fmt.Errorf("read bounded mapping: %w", err)
	}
	if len(body) > maximumMappingBytes {
		return nil, fmt.Errorf("mapping exceeds the %d-byte limit", maximumMappingBytes)
	}
	if _, err := file.Seek(0, io.SeekStart); err != nil {
		return nil, fmt.Errorf("rewind mapping: %w", err)
	}
	confirmation, err := io.ReadAll(io.LimitReader(file, maximumMappingBytes+1))
	if err != nil {
		return nil, fmt.Errorf("confirm bounded mapping: %w", err)
	}
	if len(confirmation) > maximumMappingBytes {
		return nil, fmt.Errorf("mapping exceeds the %d-byte limit", maximumMappingBytes)
	}
	if !bytes.Equal(body, confirmation) {
		return nil, errors.New("mapping changed while it was read")
	}
	after, err := os.Lstat(filename)
	if err != nil || after.Mode()&os.ModeSymlink != 0 || !os.SameFile(opened, after) ||
		after.Size() != opened.Size() || !after.ModTime().Equal(opened.ModTime()) {
		return nil, errors.New("mapping changed while it was read")
	}
	return body, nil
}
