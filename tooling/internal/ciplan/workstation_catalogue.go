package ciplan

import (
	"bytes"
	_ "embed"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"strings"

	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/strictjson"
)

const maximumWorkstationCatalogueBytes = 16 << 10

//go:embed workstation-catalogue.json
var workstationCatalogueBody []byte

type workstationCatalogueDocument struct {
	Schema     int                       `json:"schema"`
	CoreScript string                    `json:"core_script"`
	Jobs       []workstationCatalogueJob `json:"jobs"`
}

type workstationCatalogueJob struct {
	Lane         string `json:"lane"`
	Artifact     string `json:"artifact"`
	Script       string `json:"script"`
	CreationRank int    `json:"creation_rank"`
}

var (
	embeddedWorkstationCatalogue, embeddedWorkstationCatalogueError = parseWorkstationCatalogue(workstationCatalogueBody)
	allowedLanes                                                    = workstationLaneDefinitions(embeddedWorkstationCatalogue)
)

func parseWorkstationCatalogue(body []byte) (workstationCatalogueDocument, error) {
	if len(body) == 0 || len(body) > maximumWorkstationCatalogueBytes {
		return workstationCatalogueDocument{}, fmt.Errorf(
			"workstation catalogue size is outside 1..%d bytes",
			maximumWorkstationCatalogueBytes,
		)
	}
	if err := strictjson.Validate(body, 6); err != nil {
		return workstationCatalogueDocument{}, fmt.Errorf("validate unambiguous workstation catalogue JSON: %w", err)
	}
	decoder := json.NewDecoder(bytes.NewReader(body))
	decoder.DisallowUnknownFields()
	var document workstationCatalogueDocument
	if err := decoder.Decode(&document); err != nil {
		return workstationCatalogueDocument{}, fmt.Errorf("decode workstation catalogue: %w", err)
	}
	if decoder.Decode(&struct{}{}) != io.EOF {
		return workstationCatalogueDocument{}, errors.New("workstation catalogue contains trailing data")
	}
	if err := validateWorkstationCatalogue(document); err != nil {
		return workstationCatalogueDocument{}, err
	}
	return document, nil
}

func validateWorkstationCatalogue(document workstationCatalogueDocument) error {
	if document.Schema != 1 {
		return fmt.Errorf("workstation catalogue schema is %d, want 1", document.Schema)
	}
	if !workstationScriptPattern.MatchString(document.CoreScript) {
		return fmt.Errorf("workstation core script is invalid: %q", document.CoreScript)
	}
	if len(document.Jobs) == 0 || len(document.Jobs) > maximumWorkstationJobs {
		return fmt.Errorf(
			"workstation catalogue contains %d jobs, limit is 1..%d",
			len(document.Jobs),
			maximumWorkstationJobs,
		)
	}
	seenArtifacts := make(map[string]struct{}, len(document.Jobs))
	seenScripts := map[string]struct{}{document.CoreScript: {}}
	for index, job := range document.Jobs {
		if !strings.HasPrefix(job.Lane, "workstation-") || !lanePattern.MatchString(job.Lane) {
			return fmt.Errorf("workstation catalogue lane is invalid: %q", job.Lane)
		}
		if !lanePattern.MatchString(job.Artifact) {
			return fmt.Errorf("workstation catalogue artifact is invalid: %q", job.Artifact)
		}
		if !workstationScriptPattern.MatchString(job.Script) {
			return fmt.Errorf("workstation catalogue script is invalid: %q", job.Script)
		}
		if job.CreationRank != index+1 {
			return fmt.Errorf(
				"workstation catalogue job %q has creation rank %d, want %d",
				job.Artifact,
				job.CreationRank,
				index+1,
			)
		}
		if _, duplicate := seenArtifacts[job.Artifact]; duplicate {
			return fmt.Errorf("workstation catalogue artifact is repeated: %q", job.Artifact)
		}
		if _, duplicate := seenScripts[job.Script]; duplicate {
			return fmt.Errorf("workstation catalogue script is repeated: %q", job.Script)
		}
		seenArtifacts[job.Artifact] = struct{}{}
		seenScripts[job.Script] = struct{}{}
	}
	return nil
}

func workstationLaneDefinitions(document workstationCatalogueDocument) map[string]laneDefinition {
	definitions := map[string]laneDefinition{
		"common": {}, "container": {}, "dependency": {}, "full": {}, "go": {},
		"release": {}, "renderer": {}, "research": {}, "site": {},
	}
	for _, entry := range document.Jobs {
		definition := definitions[entry.Lane]
		definition.WorkstationJobs = append(definition.WorkstationJobs, WorkstationJob{
			Artifact: entry.Artifact, Script: entry.Script, CreationRank: entry.CreationRank,
		})
		definitions[entry.Lane] = definition
	}
	return definitions
}

// WorkstationCatalogue returns the core script and an isolated copy of every
// creation-ordered artifact job in the embedded machine-readable authority.
func WorkstationCatalogue() (string, []WorkstationJob, error) {
	if embeddedWorkstationCatalogueError != nil {
		return "", nil, embeddedWorkstationCatalogueError
	}
	jobs := make([]WorkstationJob, len(embeddedWorkstationCatalogue.Jobs))
	for index, entry := range embeddedWorkstationCatalogue.Jobs {
		jobs[index] = WorkstationJob{
			Artifact: entry.Artifact, Script: entry.Script, CreationRank: entry.CreationRank,
		}
	}
	return embeddedWorkstationCatalogue.CoreScript, jobs, nil
}
