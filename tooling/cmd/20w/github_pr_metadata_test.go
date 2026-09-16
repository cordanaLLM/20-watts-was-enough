package main

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/githubissuemilestones"
	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/githublabels"
	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/githubmilestones"
	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/githubprmetadata"
)

func testPullRequestAuthorities() githubprmetadata.Authorities {
	names := []string{
		"type:fix", "severity:p2", "status:needs-triage", "status:blocked", "status:in-progress",
		"status:waiting-on-author", "status:wontfix", "area:governance",
	}
	labels := make([]githublabels.Label, 0, len(names))
	for _, name := range names {
		labels = append(labels, githublabels.Label{
			Name: name, Color: "0e8a16", Description: "Managed test label",
		})
	}
	return githubprmetadata.Authorities{
		Labels: githublabels.Manifest{Schema: 1, Labels: labels},
		Milestones: githubmilestones.Manifest{Schema: 1, Milestones: []githubmilestones.Milestone{{
			ID: "M0", Title: "M0 — Evidence contracts", State: "open",
			Roadmap: "concept/90-research-roadmap.md#stage-0--evidence-synthesis-and-contracts",
			Summary: "Make one evidence boundary inspectable before execution begins.",
		}}},
		Issues: githubissuemilestones.Manifest{
			Schema: 1, Repository: "owner/repository",
			Assignments: []githubissuemilestones.Assignment{{Issue: 54, Milestone: "M0"}},
		},
	}
}

func TestClosedPullRequestWrapperSkipsMilestoneInventoryAndRetainsMetadata(t *testing.T) {
	t.Parallel()
	authorities := testPullRequestAuthorities()
	pullLabels := []string{
		"type:fix", "severity:p2", "status:in-progress", "area:governance", "external",
	}
	milestoneReads := 0
	issueReads := 0
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		switch {
		case request.URL.Path == "/repos/owner/repository/labels" && request.Method == http.MethodGet:
			_ = json.NewEncoder(writer).Encode(authorities.Labels.Labels)
		case request.URL.Path == "/repos/owner/repository/milestones":
			milestoneReads++
			http.Error(writer, "closed cleanup must not inventory milestones", http.StatusInternalServerError)
		case request.URL.Path == "/repos/owner/repository/issues/40" && request.Method == http.MethodGet:
			_ = json.NewEncoder(writer).Encode(map[string]any{
				"number": 40, "node_id": "PR_40", "state": "closed", "title": "invalid title is irrelevant",
				"body": "Tracks #54", "labels": pullRequestLabelObjects(pullLabels),
				"milestone": map[string]any{"number": 11}, "pull_request": map[string]any{"url": "unused"},
			})
		case request.URL.Path == "/repos/owner/repository/pulls/40/merge" && request.Method == http.MethodGet:
			writer.WriteHeader(http.StatusNoContent)
		case strings.HasPrefix(request.URL.Path, "/repos/owner/repository/issues/40/labels/") && request.Method == http.MethodDelete:
			pullLabels = removePullRequestTestLabel(pullLabels, "status:in-progress")
			_ = json.NewEncoder(writer).Encode(pullRequestLabelObjects(pullLabels))
		case request.URL.Path == "/repos/owner/repository/issues/54":
			issueReads++
			http.Error(writer, "closed cleanup must not inspect the source issue", http.StatusInternalServerError)
		default:
			http.Error(writer, "unexpected request", http.StatusBadRequest)
		}
	}))
	defer server.Close()

	result, err := syncGitHubPullRequestMetadata(
		context.Background(), server.Client(), authorities,
		githubprmetadata.Options{
			APIBase: server.URL, Repository: "owner/repository", Token: "token", PullRequest: 40,
			Event: githubprmetadata.Event{Action: githubprmetadata.Closed, Merged: true},
		},
	)
	if err != nil {
		t.Fatal(err)
	}
	if !result.Updated || result.Milestone != 11 || milestoneReads != 0 || issueReads != 0 ||
		!strings.Contains(strings.Join(result.Labels, " "), "external") ||
		strings.Contains(strings.Join(result.Labels, " "), "status:") {
		t.Fatalf("result/milestone reads/issue reads = %#v/%d/%d", result, milestoneReads, issueReads)
	}
}

func pullRequestLabelObjects(names []string) []map[string]string {
	result := make([]map[string]string, 0, len(names))
	for _, name := range names {
		result = append(result, map[string]string{"name": name})
	}
	return result
}

func removePullRequestTestLabel(names []string, removed string) []string {
	result := make([]string, 0, len(names))
	for _, name := range names {
		if !strings.EqualFold(name, removed) {
			result = append(result, name)
		}
	}
	return result
}
