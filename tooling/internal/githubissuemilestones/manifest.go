// Package githubissuemilestones projects an explicit, repository-bound issue
// assignment manifest into existing managed GitHub milestones.
package githubissuemilestones

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"regexp"

	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/repositorymanifest"
	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/strictjson"
)

const (
	manifestRelativePath = ".github/issue-milestones.json"
	maximumManifestBytes = 64 << 10
	maximumAssignments   = 256
)

var (
	repositoryPattern  = regexp.MustCompile(`^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$`)
	milestoneIDPattern = regexp.MustCompile(`^M([0-9]|1[0-5])$`)
)

// Assignment binds one stable issue number to one committed roadmap stage.
type Assignment struct {
	Issue     int    `json:"issue"`
	Milestone string `json:"milestone"`
}

// Manifest is the closed Git authority for managed issue assignments. It does
// not store pull-request numbers; trusted automation may project metadata from
// one explicit reference to a mapped issue.
type Manifest struct {
	Schema      int          `json:"schema"`
	Repository  string       `json:"repository"`
	Assignments []Assignment `json:"assignments"`
}

// Load reads and validates the one canonical issue-assignment manifest.
func Load(root string) (Manifest, error) {
	body, err := repositorymanifest.Read(root, manifestRelativePath, maximumManifestBytes)
	if err != nil {
		return Manifest{}, fmt.Errorf("read %s: %w", manifestRelativePath, err)
	}
	if err := strictjson.Validate(body, 8); err != nil {
		return Manifest{}, fmt.Errorf("validate unambiguous issue-assignment JSON: %w", err)
	}
	decoder := json.NewDecoder(bytes.NewReader(body))
	decoder.DisallowUnknownFields()
	var manifest Manifest
	if err := decoder.Decode(&manifest); err != nil {
		return Manifest{}, fmt.Errorf("decode issue-assignment manifest: %w", err)
	}
	if decoder.Decode(&struct{}{}) != io.EOF {
		return Manifest{}, errors.New("issue-assignment manifest contains trailing data")
	}
	if err := validateManifest(manifest); err != nil {
		return Manifest{}, err
	}
	return manifest, nil
}

func validateManifest(manifest Manifest) error {
	if manifest.Schema != 1 {
		return errors.New("issue-assignment manifest schema must be 1")
	}
	if !repositoryPattern.MatchString(manifest.Repository) {
		return errors.New("issue-assignment manifest requires an explicit owner/repository identity")
	}
	if len(manifest.Assignments) == 0 || len(manifest.Assignments) > maximumAssignments {
		return fmt.Errorf("issue-assignment manifest must contain between 1 and %d assignments", maximumAssignments)
	}
	previous := 0
	for index, assignment := range manifest.Assignments {
		if assignment.Issue <= previous || assignment.Issue > 1_000_000_000 {
			return fmt.Errorf("issue assignment %d must use a unique, strictly increasing positive issue number", index)
		}
		if !milestoneIDPattern.MatchString(assignment.Milestone) {
			return fmt.Errorf("issue %d has invalid milestone identity %q", assignment.Issue, assignment.Milestone)
		}
		previous = assignment.Issue
	}
	return nil
}
