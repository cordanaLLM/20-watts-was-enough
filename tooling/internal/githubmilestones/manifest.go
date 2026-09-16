// Package githubmilestones validates and synchronizes the operational
// projection of the canonical research roadmap into GitHub milestones.
package githubmilestones

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"regexp"
	"strings"

	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/repositorymanifest"
	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/strictjson"
)

const (
	manifestRelativePath = ".github/milestones.json"
	maximumManifestBytes = 64 << 10
	maximumMilestones    = 16
)

var (
	milestoneIDPattern = regexp.MustCompile(`^M([0-9]|1[0-5])$`)
	roadmapPathPattern = regexp.MustCompile(`^concept/90-research-roadmap\.md#stage-([0-9]|1[0-5])--[a-z0-9-]+$`)
)

// Milestone is one stable operational gate projected into GitHub.
type Milestone struct {
	ID      string `json:"id"`
	Title   string `json:"title"`
	State   string `json:"state"`
	Roadmap string `json:"roadmap"`
	Summary string `json:"summary"`
}

// Manifest is the closed Git authority for managed GitHub milestones. The
// scientific stage text and exit gates remain authoritative in the roadmap.
type Manifest struct {
	Schema     int         `json:"schema"`
	Milestones []Milestone `json:"milestones"`
}

// Load reads and validates the one canonical milestone manifest beneath root.
func Load(root string) (Manifest, error) {
	body, err := repositorymanifest.Read(root, manifestRelativePath, maximumManifestBytes)
	if err != nil {
		return Manifest{}, fmt.Errorf("read %s: %w", manifestRelativePath, err)
	}
	if err := strictjson.Validate(body, 8); err != nil {
		return Manifest{}, fmt.Errorf("validate unambiguous milestone JSON: %w", err)
	}
	decoder := json.NewDecoder(bytes.NewReader(body))
	decoder.DisallowUnknownFields()
	var manifest Manifest
	if err := decoder.Decode(&manifest); err != nil {
		return Manifest{}, fmt.Errorf("decode milestone manifest: %w", err)
	}
	if decoder.Decode(&struct{}{}) != io.EOF {
		return Manifest{}, errors.New("milestone manifest contains trailing data")
	}
	if err := validateManifest(manifest); err != nil {
		return Manifest{}, err
	}
	return manifest, nil
}

func validateManifest(manifest Manifest) error {
	if manifest.Schema != 1 {
		return errors.New("milestone manifest schema must be 1")
	}
	if len(manifest.Milestones) == 0 || len(manifest.Milestones) > maximumMilestones {
		return fmt.Errorf("milestone manifest must contain between 1 and %d milestones", maximumMilestones)
	}
	seenTitles := make(map[string]struct{}, len(manifest.Milestones))
	seenRoadmaps := make(map[string]struct{}, len(manifest.Milestones))
	for index, milestone := range manifest.Milestones {
		expectedID := fmt.Sprintf("M%d", index)
		idMatch := milestoneIDPattern.FindStringSubmatch(milestone.ID)
		if idMatch == nil || milestone.ID != expectedID {
			return fmt.Errorf("milestone %d must use consecutive identity %s", index, expectedID)
		}
		if len(milestone.Title) < 8 || len(milestone.Title) > 100 ||
			!strings.HasPrefix(milestone.Title, milestone.ID+" — ") || strings.TrimSpace(milestone.Title) != milestone.Title {
			return fmt.Errorf("milestone %s title must be a trimmed 8-100 byte string beginning %q", milestone.ID, milestone.ID+" — ")
		}
		if _, duplicate := seenTitles[milestone.Title]; duplicate {
			return fmt.Errorf("milestone title %q is repeated", milestone.Title)
		}
		seenTitles[milestone.Title] = struct{}{}
		if milestone.State != "open" && milestone.State != "closed" {
			return fmt.Errorf("milestone %s state must be open or closed", milestone.ID)
		}
		roadmapMatch := roadmapPathPattern.FindStringSubmatch(milestone.Roadmap)
		if roadmapMatch == nil || roadmapMatch[1] != idMatch[1] {
			return fmt.Errorf("milestone %s must bind its matching stage anchor in concept/90-research-roadmap.md", milestone.ID)
		}
		if _, duplicate := seenRoadmaps[milestone.Roadmap]; duplicate {
			return fmt.Errorf("milestone roadmap anchor %q is repeated", milestone.Roadmap)
		}
		seenRoadmaps[milestone.Roadmap] = struct{}{}
		if len(milestone.Summary) < 40 || len(milestone.Summary) > 400 ||
			strings.TrimSpace(milestone.Summary) != milestone.Summary || strings.ContainsAny(milestone.Summary, "\r\n") ||
			!strings.HasSuffix(milestone.Summary, ".") {
			return fmt.Errorf("milestone %s summary must be one trimmed 40-400 byte sentence ending with a full stop", milestone.ID)
		}
	}
	return nil
}

func managedDescription(repository string, milestone Milestone) string {
	return fmt.Sprintf(
		"<!-- 20w-roadmap-id:%s -->\nCanonical gate: https://github.com/%s/blob/main/%s\n\n%s\n\nGitHub completion tracks associated issues and pull requests. It does not promote a claim or turn development output into a scientific result.",
		milestone.ID,
		repository,
		milestone.Roadmap,
		milestone.Summary,
	)
}
