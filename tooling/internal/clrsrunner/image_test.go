package clrsrunner

import (
	"bytes"
	"context"
	"encoding/json"
	"os"
	"slices"
	"strings"
	"testing"

	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/specialistcontrol"
)

func TestImageDefinitionKeepsPinnedStaticRuntimeAndHardenedSmoke(t *testing.T) {
	t.Parallel()
	dockerfile := readContractFile(t, "../../clrs-specialist/Dockerfile")
	toolingDockerfile := readContractFile(t, "../../Dockerfile")
	toolingBuilder, _, present := strings.Cut(toolingDockerfile, "\n")
	if !present || !strings.HasPrefix(toolingBuilder, "FROM golang:") ||
		!strings.HasPrefix(dockerfile, toolingBuilder+"\n") {
		t.Fatal("CLRS specialist Dockerfile builder differs from the repository Go builder")
	}
	if strings.Count(dockerfile, "FROM ") != 2 || !strings.HasPrefix(dockerfile,
		"FROM golang:1.27.1-trixie@sha256:9baa6b4187bbb98d240372a8a235ac0bb6b5ddd52bba1431dc2f7c0705862728 AS builder\n") {
		t.Fatal("CLRS specialist Dockerfile lost its exact two-stage pinned builder")
	}
	for _, required := range []string{
		"GOPROXY=off", "GOTOOLCHAIN=local", "CGO_ENABLED=0", "-trimpath", "-buildvcs=false",
		"test \"${TARGETOS}/${TARGETARCH}\" = \"linux/amd64\"", "FROM scratch", "USER 65532:65532",
		"COPY tooling/internal/buildinfo ./internal/buildinfo", "tooling/internal/buildinfo.version=${IMAGE_VERSION}",
		"COPY tooling/internal/pdfrenderlock ./internal/pdfrenderlock",
		`ENTRYPOINT ["/clrs-specialist"]`, `org.opencontainers.image.licenses="EUPL-1.2"`,
		`result-authority="NO_RESULT"`, FrozenSourceID,
		FrozenGenerationContractID,
	} {
		if !strings.Contains(dockerfile, required) {
			t.Fatalf("CLRS specialist Dockerfile is missing %q", required)
		}
	}
	if strings.Contains(dockerfile, "COPY tooling/internal/pdfrender ./internal/pdfrender") {
		t.Fatal("CLRS specialist Dockerfile includes PDF renderer execution machinery")
	}
	workflow := readContractFile(t, "../../../.github/workflows/ci.yml")
	for _, required := range []string{
		"file: tooling/clrs-specialist/Dockerfile", "platforms: linux/amd64", "network: none",
		"timeout --signal=TERM --kill-after=2s 15s",
		"--network none --read-only --user 65532:65532", "--cap-drop ALL --security-opt no-new-privileges",
		"--cpus 1 --memory 64m --memory-swap 64m --pids-limit 32 --stop-timeout 5", "< tooling/clrs-specialist/smoke-request.json",
	} {
		if !strings.Contains(workflow, required) {
			t.Fatalf("CLRS specialist CI smoke is missing %q", required)
		}
	}
}

func TestImageImpactRuleCoversTheCompleteBuildContext(t *testing.T) {
	t.Parallel()
	body := readContractFile(t, "../../../.github/ci-impact.json")
	var mapping struct {
		Rules []struct {
			ID    string   `json:"id"`
			Paths []string `json:"paths"`
			Lanes []string `json:"lanes"`
		} `json:"rules"`
	}
	if err := json.Unmarshal([]byte(body), &mapping); err != nil {
		t.Fatal(err)
	}
	wantPaths := []string{"tooling/clrs-specialist/**", "tooling/cmd/clrs-specialist/**", "tooling/internal/clrsrunner/**"}
	owners := make(map[string][]string)
	for _, rule := range mapping.Rules {
		for _, path := range rule.Paths {
			owners[path] = rule.Lanes
		}
		if rule.ID == "go-clrs-specialist-runtime" &&
			(!slices.Equal(rule.Paths, wantPaths) || !slices.Equal(rule.Lanes, []string{"container", "go"})) {
			t.Fatalf("CLRS image impact rule = paths %v lanes %v", rule.Paths, rule.Lanes)
		}
	}
	for _, path := range []string{
		"tooling/go.mod", "tooling/go.sum", "tooling/clrs-specialist/**", "tooling/cmd/clrs-specialist/**",
		"tooling/internal/buildinfo/**", "tooling/internal/clrsbellmanford/**", "tooling/internal/clrsbinary/**",
		"tooling/internal/clrsfixture/**", "tooling/internal/clrsinsertion/**", "tooling/internal/clrskmp/**",
		"tooling/internal/clrsmatrixchain/**", "tooling/internal/clrsrunner/**", "tooling/internal/clrssegments/**",
		"tooling/internal/pdfrenderlock/**", "tooling/internal/specialistcontrol/**", "tooling/internal/strictjson/**",
	} {
		lanes, present := owners[path]
		if !present || (!slices.Contains(lanes, "container") && !slices.Contains(lanes, "full")) {
			t.Fatalf("CLRS image dependency %q is not mapped to the container lane: %v", path, lanes)
		}
	}
}

func TestTrackedSmokeRequestExercisesTheFrozenInsertionRoute(t *testing.T) {
	t.Parallel()
	body := readContractFile(t, "../../clrs-specialist/smoke-request.json")
	request, err := readRequest(bytes.NewBufferString(body))
	if err != nil {
		t.Fatal(err)
	}
	if request.Task != specialistcontrol.TaskInsertionSort || request.SpecialistID != InsertionSortSpecialistID ||
		request.Authority != specialistcontrol.ResultAuthority {
		t.Fatalf("tracked smoke request does not select the frozen insertion route: %#v", request)
	}
	registry, err := NewRegistry()
	if err != nil {
		t.Fatal(err)
	}
	response, err := registry.Invoke(context.Background(), request)
	if err != nil || response.State != specialistcontrol.ResultCompleted ||
		response.Payload != "[0.424 0.545 0.549 0.603 0.715]\n\n" {
		t.Fatalf("tracked smoke response = %#v, %v", response, err)
	}
}

func readContractFile(t *testing.T, path string) string {
	t.Helper()
	body, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	return string(body)
}
