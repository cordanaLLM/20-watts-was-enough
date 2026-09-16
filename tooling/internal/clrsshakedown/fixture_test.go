package clrsshakedown

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/clrsfixture"
	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/clrsrunner"
	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/specialistcontrol"
)

// Synthetic references exercise wiring, not independent solver correctness or
// upstream generation. The separately authorised retained-fixture run is external.
func fixtureOptions(t *testing.T) Options {
	t.Helper()
	repository, err := filepath.Abs("../../..")
	if err != nil {
		t.Fatal(err)
	}
	root := t.TempDir()
	for _, name := range []string{"upstream.json", "contract.json"} {
		body, err := os.ReadFile(filepath.Join(repository, "tooling/clrs-generator", name))
		if err != nil {
			t.Fatal(err)
		}
		writeTestFile(t, filepath.Join(root, "tooling/clrs-generator", name), body)
	}
	sourceBytes, err := os.ReadFile(filepath.Join(root, "tooling/clrs-generator/upstream.json"))
	if err != nil {
		t.Fatal(err)
	}
	source, err := clrsfixture.ParseSourceRecord(sourceBytes)
	if err != nil {
		t.Fatal(err)
	}
	contractBytes, err := os.ReadFile(filepath.Join(root, "tooling/clrs-generator/contract.json"))
	if err != nil {
		t.Fatal(err)
	}
	contract, err := clrsfixture.ParseGenerationContract(contractBytes, source)
	if err != nil {
		t.Fatal(err)
	}
	plan, err := contract.Plan(source)
	if err != nil {
		t.Fatal(err)
	}
	registry, err := clrsrunner.NewRegistry()
	if err != nil {
		t.Fatal(err)
	}
	routes, _, err := registry.AdmissionSnapshot(time.Now(), time.Minute)
	if err != nil {
		t.Fatal(err)
	}
	ids := map[clrsfixture.TaskKind]string{}
	for _, route := range routes {
		ids[route.Task] = route.SpecialistID
	}
	for _, task := range plan.Tasks {
		examples := []any{}
		for _, size := range task.Sizes {
			for _, seed := range plan.Seeds {
				prompt := syntheticPrompt(task.Task, int(size.RequestedLength))
				response, err := registry.Invoke(context.Background(), clrsrunner.Request{SchemaVersion: 1, Authority: "NO_RESULT",
					SourceID: clrsrunner.FrozenSourceID, GenerationContractID: clrsrunner.FrozenGenerationContractID,
					RunID: "synthetic", RequestID: "synthetic", Task: task.Task, SpecialistID: ids[task.Task], Binding: "sha256:" + strings.Repeat("1", 64),
					TimeoutMillis: 1000, MaxResultBytes: maximumExampleBytes, Payload: prompt})
				if err != nil || response.State != specialistcontrol.ResultCompleted {
					t.Fatalf("synthetic reference: %+v %v", response, err)
				}
				examples = append(examples, map[string]any{"prompt": prompt, "references": []string{response.Payload}, "auxiliary": map[string]any{"length": size.RequestedLength, "seed": seed, "use_hints": false}})
			}
		}
		body, err := json.Marshal(map[string]any{"name": "clrs_text_" + string(task.Task), "examples": examples})
		if err != nil {
			t.Fatal(err)
		}
		for _, dataset := range []string{"dataset", "second"} {
			writeTestFile(t, filepath.Join(root, dataset, task.OutputRelativePath), body)
		}
	}
	comparison, err := clrsfixture.CompareFixtures(context.Background(), clrsfixture.FixtureComparisonOptions{RepositoryRoot: root, FirstDirectory: "dataset", SecondDirectory: "second"})
	if err != nil {
		t.Fatal(err)
	}
	return Options{root, filepath.Join(root, "dataset"), comparison.FirstTreeSHA256, filepath.Join(root, "run"), "test-shakedown"}
}

func syntheticPrompt(task clrsfixture.TaskKind, n int) string {
	scalars := strings.TrimSpace(strings.Repeat("0.2 ", n))
	switch task {
	case clrsfixture.TaskInsertionSort:
		return "insertion_sort:\nkey: [" + scalars + "]\npred:\n"
	case clrsfixture.TaskBinarySearch:
		return "binary_search:\nkey: [" + scalars + "], target: 0.3\nreturn:\n"
	case clrsfixture.TaskMatrixChainOrder:
		return "matrix_chain_order:\np: [" + scalars + "]\ns:\n"
	case clrsfixture.TaskBellmanFord:
		rows := make([]string, n)
		for i := range rows {
			rows[i] = "[" + strings.TrimSpace(strings.Repeat("0.0 ", n)) + "]"
		}
		return "bellman_ford:\ns: 0, A: [" + strings.Join(rows, ", ") + "]\npi:\n"
	case clrsfixture.TaskKMPMatcher:
		return "kmp_matcher:\nstring: [" + strings.TrimSpace(strings.Repeat("0 ", n-n/5)+strings.Repeat("1 ", n/5)) + "], key: [" + strings.TrimSpace(strings.Repeat("0 ", n)) + "]\nmatch:\n"
	case clrsfixture.TaskSegmentsIntersect:
		return "segments_intersect:\nx: [0.1 0.9 0.1 0.9], y: [0.1 0.9 0.9 0.1]\nintersect:\n"
	}
	panic("missing synthetic task")
}

func writeTestFile(t *testing.T, path string, body []byte) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, body, 0o600); err != nil {
		t.Fatal(err)
	}
}

type fileSnapshot struct {
	Identity FileIdentity
	Mode     os.FileMode
	Modified time.Time
}

func snapshot(t *testing.T, root string) map[string]fileSnapshot {
	t.Helper()
	result := map[string]fileSnapshot{}
	err := filepath.WalkDir(root, func(path string, entry os.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if entry.IsDir() {
			return nil
		}
		body, err := os.ReadFile(path)
		if err != nil {
			return err
		}
		info, err := entry.Info()
		if err != nil {
			return err
		}
		result[path] = fileSnapshot{identify(body), info.Mode(), info.ModTime()}
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	return result
}
