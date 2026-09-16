package main

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"

	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/githubissuelifecycle"
	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/githubissuemilestones"
	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/githublabels"
)

func TestIssueLifecycleCommandUsesVerifiedLabelsAndPreservesOtherClasses(t *testing.T) {
	t.Parallel()
	manifests := testMetadataManifests()
	manifests.issues = githubissuemilestones.Manifest{
		Schema: 1, Repository: "owner/repository",
		Assignments: []githubissuemilestones.Assignment{{Issue: 54, Milestone: "M0"}},
	}
	current := []string{"type:fix", "severity:p2", "area:ci", "status:wontfix", "human"}
	var mutex sync.Mutex
	writes := 0
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		mutex.Lock()
		defer mutex.Unlock()
		switch {
		case request.Method == http.MethodGet && request.URL.Path == "/repos/owner/repository/labels":
			_ = json.NewEncoder(writer).Encode(manifests.labels.Labels)
		case request.Method == http.MethodGet && request.URL.Path == "/repos/owner/repository/issues/54":
			remote := make([]map[string]string, len(current))
			for index, name := range current {
				remote[index] = map[string]string{"name": name}
			}
			_ = json.NewEncoder(writer).Encode(map[string]any{
				"number": 54, "node_id": "ISSUE_54", "state": "open", "labels": remote,
			})
		case request.Method == http.MethodDelete && strings.HasPrefix(request.URL.Path, "/repos/owner/repository/issues/54/labels/"):
			writes++
			removed := strings.TrimPrefix(request.URL.Path, "/repos/owner/repository/issues/54/labels/")
			next := current[:0]
			for _, name := range current {
				if !strings.EqualFold(name, removed) {
					next = append(next, name)
				}
			}
			current = next
			writeLabelNames(t, writer, current)
		case request.Method == http.MethodPost && request.URL.Path == "/repos/owner/repository/issues/54/labels":
			writes++
			var payload struct {
				Labels []string `json:"labels"`
			}
			_ = json.NewDecoder(request.Body).Decode(&payload)
			current = append(current, payload.Labels...)
			writeLabelNames(t, writer, current)
		default:
			http.Error(writer, "unexpected request", http.StatusBadRequest)
		}
	}))
	defer server.Close()
	event, err := githubissuelifecycle.NewEvent(54, "reopened")
	if err != nil {
		t.Fatal(err)
	}
	result, err := syncGitHubIssueLifecycle(
		context.Background(), server.Client(), manifests.labels, manifests.issues,
		githubMetadataOptions{
			APIBase: server.URL, Repository: "owner/repository", Token: "token", IssueEvent: event,
		},
	)
	if err != nil {
		t.Fatal(err)
	}
	if result != (githubissuelifecycle.Result{Updated: 1}) || writes != 2 {
		t.Fatalf("result/writes = %#v/%d", result, writes)
	}
	joined := strings.Join(current, ",")
	for _, retained := range []string{"type:fix", "severity:p2", "area:ci", "human", "status:needs-triage"} {
		if !strings.Contains(joined, retained) {
			t.Fatalf("final labels %q lost %q", joined, retained)
		}
	}
	if strings.Contains(joined, "status:wontfix") {
		t.Fatalf("final labels retain stale wontfix: %q", joined)
	}
}

func TestIssueLifecycleCommandRefusesManagedLabelDriftBeforeIssueWrite(t *testing.T) {
	t.Parallel()
	manifests := testMetadataManifests()
	writes := 0
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		if request.Method != http.MethodGet {
			writes++
			http.Error(writer, "write should not occur", http.StatusInternalServerError)
			return
		}
		if request.URL.Path == "/repos/owner/repository/labels" {
			_ = json.NewEncoder(writer).Encode([]githublabels.Label{})
			return
		}
		http.Error(writer, "issue inventory should not be reached", http.StatusInternalServerError)
	}))
	defer server.Close()
	event, err := githubissuelifecycle.NewEvent(7, "closed")
	if err != nil {
		t.Fatal(err)
	}
	_, err = syncGitHubIssueLifecycle(
		context.Background(), server.Client(), manifests.labels, manifests.issues,
		githubMetadataOptions{
			APIBase: server.URL, Repository: "owner/repository", Token: "token", IssueEvent: event,
		},
	)
	if err == nil || !strings.Contains(err.Error(), "verify managed labels") || writes != 0 {
		t.Fatalf("sync error/writes = %v/%d, want zero-write label-drift refusal", err, writes)
	}
}

func writeLabelNames(t *testing.T, writer http.ResponseWriter, names []string) {
	t.Helper()
	labels := make([]map[string]string, len(names))
	for index, name := range names {
		labels[index] = map[string]string{"name": name}
	}
	if err := json.NewEncoder(writer).Encode(labels); err != nil {
		t.Fatal(err)
	}
}
