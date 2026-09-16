package main

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"

	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/githubissuelifecycle"
	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/githubissuemilestones"
	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/githublabels"
	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/githubmilestones"
)

func testMetadataManifests() githubMetadataManifests {
	return githubMetadataManifests{
		labels: githublabels.Manifest{Schema: 1, Labels: []githublabels.Label{
			{Name: "type:feat", Color: "0e8a16", Description: "Feature"},
			{Name: "severity:p2", Color: "fbca04", Description: "Normal priority"},
			{Name: "area:test", Color: "0e8a16", Description: "Test label"},
			{Name: "status:needs-triage", Color: "ededed", Description: "Needs triage"},
			{Name: "status:blocked", Color: "e99695", Description: "Blocked"},
			{Name: "status:in-progress", Color: "1d76db", Description: "In progress"},
			{Name: "status:waiting-on-author", Color: "fbca04", Description: "Waiting"},
			{Name: "status:wontfix", Color: "555555", Description: "Closed deliberately"},
		}},
		milestones: githubmilestones.Manifest{Schema: 1, Milestones: []githubmilestones.Milestone{{
			ID: "M0", Title: "M0 — Evidence contracts", State: "open",
			Roadmap: "concept/90-research-roadmap.md#stage-0--evidence-synthesis-and-contracts",
			Summary: "Make one evidence boundary inspectable before execution begins.",
		}}},
		issues: githubissuemilestones.Manifest{
			Schema: 1, Repository: "owner/repository",
			Assignments: []githubissuemilestones.Assignment{{Issue: 7, Milestone: "M0"}},
		},
	}
}

func TestMetadataPreflightsEveryRemoteAuthorityBeforeMutation(t *testing.T) {
	t.Parallel()
	writes := 0
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		if request.Method != http.MethodGet {
			writes++
			http.Error(writer, "write should not occur", http.StatusInternalServerError)
			return
		}
		switch {
		case strings.HasSuffix(request.URL.Path, "/labels"):
			_ = json.NewEncoder(writer).Encode([]githublabels.Label{})
		case strings.HasSuffix(request.URL.Path, "/milestones"):
			_ = json.NewEncoder(writer).Encode([]map[string]any{{
				"number": 4, "state": "open", "title": "M0 — Evidence contracts",
				"description": "unmarked title collision",
			}})
		default:
			t.Fatal("issue inventory was reached after invalid milestone preflight")
		}
	}))
	defer server.Close()
	_, err := syncGitHubMetadata(
		context.Background(), server.Client(), testMetadataManifests(),
		githubMetadataOptions{APIBase: server.URL, Repository: "owner/repository", Token: "token"},
	)
	if err == nil || !strings.Contains(err.Error(), "unmarked") || writes != 0 {
		t.Fatalf("syncGitHubMetadata() error/writes = %v/%d, want zero-write complete preflight refusal", err, writes)
	}
}

func TestMetadataRefusesTruncatedPullRequestDiscoveryBeforeMutation(t *testing.T) {
	t.Parallel()
	manifests := testMetadataManifests()
	milestone := manifests.milestones.Milestones[0]
	description := fmt.Sprintf(
		"<!-- 20w-roadmap-id:%s -->\nCanonical gate: https://github.com/owner/repository/blob/main/%s\n\n%s\n\nGitHub completion tracks associated issues and pull requests. It does not promote a claim or turn development output into a scientific result.",
		milestone.ID,
		milestone.Roadmap,
		milestone.Summary,
	)
	writes := 0
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		if request.Method != http.MethodGet {
			writes++
			http.Error(writer, "write should not occur", http.StatusInternalServerError)
			return
		}
		switch request.URL.Path {
		case "/repos/owner/repository/labels":
			_ = json.NewEncoder(writer).Encode(manifests.labels.Labels)
		case "/repos/owner/repository/milestones":
			_ = json.NewEncoder(writer).Encode([]map[string]any{{
				"number": 11, "state": milestone.State, "title": milestone.Title,
				"description": description, "due_on": nil,
			}})
		case "/repos/owner/repository/issues/7":
			_ = json.NewEncoder(writer).Encode(map[string]any{
				"number": 7, "node_id": "ISSUE_7", "state": "open", "milestone": nil,
				"labels": []map[string]string{{"name": "status:in-progress"}},
			})
		case "/repos/owner/repository/issues":
			status := request.URL.Query().Get("labels")
			writer.Header().Set("Link", `<https://api.github.com/repositories/1/issues?page=2>; rel="next"`)
			_ = json.NewEncoder(writer).Encode([]map[string]any{{
				"number": 40, "state": "closed", "labels": []map[string]string{{"name": status}},
				"pull_request": map[string]any{"url": "https://example.invalid/pull/40"},
			}})
		default:
			http.Error(writer, "unexpected request", http.StatusBadRequest)
		}
	}))
	defer server.Close()

	_, err := syncGitHubMetadata(
		context.Background(), server.Client(), manifests,
		githubMetadataOptions{APIBase: server.URL, Repository: "owner/repository", Token: "token"},
	)
	if err == nil || !strings.Contains(err.Error(), "exceeds 4 pages") || writes != 0 {
		t.Fatalf("syncGitHubMetadata() error/writes = %v/%d, want bounded zero-write discovery refusal", err, writes)
	}
}

type testRemoteMilestone struct {
	Number      int     `json:"number"`
	State       string  `json:"state"`
	Title       string  `json:"title"`
	Description *string `json:"description"`
	DueOn       *string `json:"due_on"`
}

func TestMetadataRetryConvergesAfterBoundedIssueFailure(t *testing.T) {
	t.Parallel()
	var mutex sync.Mutex
	labels := make(map[string]githublabels.Label)
	var milestone *testRemoteMilestone
	issueMilestone := 0
	failIssueOnce := true
	labelPosts := 0
	milestonePosts := 0
	issuePatches := 0

	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		mutex.Lock()
		defer mutex.Unlock()
		switch {
		case request.URL.Path == "/repos/owner/repository/labels" && request.Method == http.MethodGet:
			remote := make([]githublabels.Label, 0, len(labels))
			for _, desired := range testMetadataManifests().labels.Labels {
				if label, exists := labels[desired.Name]; exists {
					remote = append(remote, label)
				}
			}
			_ = json.NewEncoder(writer).Encode(remote)
		case request.URL.Path == "/repos/owner/repository/labels" && request.Method == http.MethodPost:
			labelPosts++
			var created githublabels.Label
			_ = json.NewDecoder(request.Body).Decode(&created)
			labels[created.Name] = created
			writer.WriteHeader(http.StatusCreated)
			_ = json.NewEncoder(writer).Encode(created)
		case request.URL.Path == "/repos/owner/repository/milestones" && request.Method == http.MethodGet:
			remote := []testRemoteMilestone{}
			if milestone != nil {
				remote = append(remote, *milestone)
			}
			_ = json.NewEncoder(writer).Encode(remote)
		case request.URL.Path == "/repos/owner/repository/milestones" && request.Method == http.MethodPost:
			milestonePosts++
			var payload struct {
				Title       string `json:"title"`
				State       string `json:"state"`
				Description string `json:"description"`
			}
			_ = json.NewDecoder(request.Body).Decode(&payload)
			created := testRemoteMilestone{
				Number: 11, State: payload.State, Title: payload.Title, Description: &payload.Description,
			}
			milestone = &created
			writer.WriteHeader(http.StatusCreated)
			_ = json.NewEncoder(writer).Encode(created)
		case request.URL.Path == "/repos/owner/repository/issues" && request.Method == http.MethodGet:
			_ = json.NewEncoder(writer).Encode([]map[string]any{})
		case request.URL.Path == "/repos/owner/repository/pulls" && request.Method == http.MethodGet:
			_ = json.NewEncoder(writer).Encode([]map[string]any{})
		case request.URL.Path == "/repos/owner/repository/issues/7" && request.Method == http.MethodGet:
			body := map[string]any{
				"number": 7, "node_id": "ISSUE_7", "state": "open", "milestone": nil,
				"labels": []map[string]string{{"name": "status:in-progress"}},
			}
			if issueMilestone != 0 {
				body["milestone"] = map[string]any{"number": issueMilestone}
			}
			_ = json.NewEncoder(writer).Encode(body)
		case request.URL.Path == "/repos/owner/repository/issues/7" && request.Method == http.MethodPatch:
			issuePatches++
			if failIssueOnce {
				failIssueOnce = false
				http.Error(writer, "transient", http.StatusServiceUnavailable)
				return
			}
			var payload struct {
				Milestone int `json:"milestone"`
			}
			_ = json.NewDecoder(request.Body).Decode(&payload)
			issueMilestone = payload.Milestone
			_ = json.NewEncoder(writer).Encode(map[string]any{
				"number": 7, "node_id": "ISSUE_7", "state": "open",
				"milestone": map[string]any{"number": issueMilestone},
				"labels":    []map[string]string{{"name": "status:in-progress"}},
			})
		default:
			http.Error(writer, "unexpected request", http.StatusBadRequest)
		}
	}))
	defer server.Close()
	options := githubMetadataOptions{
		APIBase: server.URL, Repository: "owner/repository", Token: "token",
	}

	if _, err := syncGitHubMetadata(context.Background(), server.Client(), testMetadataManifests(), options); err == nil ||
		!strings.Contains(err.Error(), "apply GitHub issue assignments") {
		t.Fatalf("first sync error = %v, want injected issue failure", err)
	}
	result, err := syncGitHubMetadata(context.Background(), server.Client(), testMetadataManifests(), options)
	if err != nil {
		t.Fatal(err)
	}
	if result.labels != (githublabels.Result{Unchanged: 8}) ||
		result.milestones != (githubmilestones.Result{Unchanged: 1}) ||
		result.issues != (githubissuemilestones.Result{Updated: 1}) ||
		result.lifecycle != (githubissuelifecycle.Result{Unchanged: 1}) {
		t.Fatalf("retry result = %#v", result)
	}
	if labelPosts != 8 || milestonePosts != 1 || issuePatches != 2 || issueMilestone != 11 {
		t.Fatalf(
			"mutation counts/final milestone = %d/%d/%d/%d, retry repeated a completed repair",
			labelPosts, milestonePosts, issuePatches, issueMilestone,
		)
	}
}

func TestMetadataFinalLifecycleReadbackRejectsLabelLossFromIssueAssignment(t *testing.T) {
	t.Parallel()
	manifests := testMetadataManifests()
	milestone := manifests.milestones.Milestones[0]
	description := fmt.Sprintf(
		"<!-- 20w-roadmap-id:%s -->\nCanonical gate: https://github.com/owner/repository/blob/main/%s\n\n%s\n\nGitHub completion tracks associated issues and pull requests. It does not promote a claim or turn development output into a scientific result.",
		milestone.ID,
		milestone.Roadmap,
		milestone.Summary,
	)
	issueMilestone := 0
	issueLabels := []map[string]string{{"name": "status:in-progress"}, {"name": "area:test"}}
	patches := 0
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		switch {
		case request.URL.Path == "/repos/owner/repository/labels" && request.Method == http.MethodGet:
			_ = json.NewEncoder(writer).Encode(manifests.labels.Labels)
		case request.URL.Path == "/repos/owner/repository/milestones" && request.Method == http.MethodGet:
			_ = json.NewEncoder(writer).Encode([]map[string]any{{
				"number": 11, "state": milestone.State, "title": milestone.Title,
				"description": description, "due_on": nil,
			}})
		case request.URL.Path == "/repos/owner/repository/issues" && request.Method == http.MethodGet:
			_ = json.NewEncoder(writer).Encode([]map[string]any{})
		case request.URL.Path == "/repos/owner/repository/pulls" && request.Method == http.MethodGet:
			_ = json.NewEncoder(writer).Encode([]map[string]any{})
		case request.URL.Path == "/repos/owner/repository/issues/7" && request.Method == http.MethodGet:
			body := map[string]any{
				"number": 7, "node_id": "ISSUE_7", "state": "open", "milestone": nil,
				"labels": issueLabels,
			}
			if issueMilestone != 0 {
				body["milestone"] = map[string]any{"number": issueMilestone}
			}
			_ = json.NewEncoder(writer).Encode(body)
		case request.URL.Path == "/repos/owner/repository/issues/7" && request.Method == http.MethodPatch:
			patches++
			issueMilestone = 11
			issueLabels = []map[string]string{}
			_ = json.NewEncoder(writer).Encode(map[string]any{
				"number": 7, "node_id": "ISSUE_7", "state": "open",
				"milestone": map[string]any{"number": issueMilestone}, "labels": issueLabels,
			})
		default:
			http.Error(writer, "unexpected request", http.StatusBadRequest)
		}
	}))
	defer server.Close()

	_, err := syncGitHubMetadata(
		context.Background(), server.Client(), manifests,
		githubMetadataOptions{APIBase: server.URL, Repository: "owner/repository", Token: "token"},
	)
	if err == nil || !strings.Contains(err.Error(), "issue lifecycle after issue assignment") || patches != 1 {
		t.Fatalf("syncGitHubMetadata() error/patches = %v/%d, want final lifecycle refusal", err, patches)
	}
}
