package githubissuelifecycle

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/url"
	"sort"
	"strconv"
	"strings"
	"sync"
	"testing"

	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/githubissuemilestones"
	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/githublabels"
)

func testPolicy(t *testing.T) Policy {
	t.Helper()
	labels := []githublabels.Label{
		{Name: needsTriageLabel},
		{Name: blockedLabel},
		{Name: inProgressLabel},
		{Name: waitingLabel},
		{Name: wontfixLabel},
		{Name: "area:test"},
	}
	policy, err := NewPolicy(githublabels.Manifest{Schema: 1, Labels: labels})
	if err != nil {
		t.Fatal(err)
	}
	return policy
}

func testMapping(numbers ...int) githubissuemilestones.Manifest {
	assignments := make([]githubissuemilestones.Assignment, len(numbers))
	for index, number := range numbers {
		assignments[index] = githubissuemilestones.Assignment{Issue: number, Milestone: "M0"}
	}
	return githubissuemilestones.Manifest{
		Schema: 1, Repository: "owner/repository", Assignments: assignments,
	}
}

func labels(names ...string) []remoteLabel {
	result := make([]remoteLabel, len(names))
	for index, name := range names {
		result[index] = remoteLabel{Name: name}
	}
	return result
}

type lifecycleState struct {
	mutex       sync.Mutex
	issues      map[int]remoteIssue
	writes      int
	failAddOnce bool
}

type responseLossClient struct {
	inner  HTTPClient
	method string
	mutex  sync.Mutex
	lost   bool
}

func (client *responseLossClient) Do(request *http.Request) (*http.Response, error) {
	response, err := client.inner.Do(request)
	if err != nil {
		return response, err
	}
	client.mutex.Lock()
	defer client.mutex.Unlock()
	if !client.lost && request.Method == client.method {
		client.lost = true
		if response != nil && response.Body != nil {
			_ = response.Body.Close()
		}
		return nil, fmt.Errorf("injected %s response loss", request.Method)
	}
	return response, nil
}

func (state *lifecycleState) handler(t *testing.T) http.Handler {
	t.Helper()
	return http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		state.mutex.Lock()
		defer state.mutex.Unlock()
		if request.Header.Get("Authorization") != "Bearer token" || request.Header.Get("X-GitHub-Api-Version") != apiVersion {
			http.Error(writer, "missing identity", http.StatusUnauthorized)
			return
		}
		prefix := "/repos/owner/repository/issues/"
		if !strings.HasPrefix(request.URL.Path, prefix) {
			http.NotFound(writer, request)
			return
		}
		parts := strings.Split(strings.TrimPrefix(request.URL.Path, prefix), "/")
		number, err := strconv.Atoi(parts[0])
		if err != nil {
			http.Error(writer, "bad issue number", http.StatusBadRequest)
			return
		}
		issue, exists := state.issues[number]
		if !exists {
			http.NotFound(writer, request)
			return
		}
		switch {
		case request.Method == http.MethodGet && len(parts) == 1:
			writeJSON(t, writer, issue)
		case request.Method == http.MethodDelete && len(parts) == 3 && parts[1] == "labels":
			state.writes++
			name, decodeErr := url.PathUnescape(parts[2])
			if decodeErr != nil {
				http.Error(writer, "bad label", http.StatusBadRequest)
				return
			}
			remaining := make([]remoteLabel, 0, len(issue.Labels))
			for _, label := range issue.Labels {
				if !strings.EqualFold(label.Name, name) {
					remaining = append(remaining, label)
				}
			}
			issue.Labels = remaining
			state.issues[number] = issue
			writeJSON(t, writer, issue.Labels)
		case request.Method == http.MethodPost && len(parts) == 2 && parts[1] == "labels":
			state.writes++
			if state.failAddOnce {
				state.failAddOnce = false
				http.Error(writer, "transient", http.StatusServiceUnavailable)
				return
			}
			var payload labelsPayload
			if err := json.NewDecoder(request.Body).Decode(&payload); err != nil {
				http.Error(writer, "bad labels", http.StatusBadRequest)
				return
			}
			for _, name := range payload.Labels {
				if !containsLabel(issue.Labels, name) {
					issue.Labels = append(issue.Labels, remoteLabel{Name: name})
				}
			}
			state.issues[number] = issue
			writeJSON(t, writer, issue.Labels)
		default:
			http.Error(writer, "unexpected request", http.StatusBadRequest)
		}
	})
}

func writeJSON(t *testing.T, writer http.ResponseWriter, value any) {
	t.Helper()
	writer.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(writer).Encode(value); err != nil {
		t.Fatal(err)
	}
}

func testOptions(server *httptest.Server) Options {
	return Options{APIBase: server.URL, Repository: "owner/repository", Token: "token"}
}

func labelNames(issue remoteIssue) []string {
	result := make([]string, len(issue.Labels))
	for index, label := range issue.Labels {
		result[index] = label.Name
	}
	sort.Strings(result)
	return result
}

func TestLifecycleRepairsClosedActiveStatusesAndPreservesWontfix(t *testing.T) {
	t.Parallel()
	state := &lifecycleState{issues: map[int]remoteIssue{
		7: {
			Number: 7, NodeID: "ISSUE_7", State: "open",
			Labels: labels("type:fix", "severity:p2", "area:ci", inProgressLabel, "human"),
		},
		9: {
			Number: 9, NodeID: "ISSUE_9", State: "closed",
			Labels: labels("type:fix", "severity:p2", "area:ci", inProgressLabel, "human"),
		},
		11: {
			Number: 11, NodeID: "ISSUE_11", State: "closed",
			Labels: labels("type:fix", "severity:p2", "area:ci", blockedLabel, wontfixLabel, "human"),
		},
	}}
	server := httptest.NewServer(state.handler(t))
	defer server.Close()

	plan, err := Preflight(
		context.Background(), server.Client(), testMapping(7, 9, 11), testPolicy(t), testOptions(server), Event{},
	)
	if err != nil {
		t.Fatal(err)
	}
	result, err := plan.Apply(context.Background(), server.Client(), testOptions(server))
	if err != nil {
		t.Fatal(err)
	}
	if result != (Result{Updated: 2, Unchanged: 1}) {
		t.Fatalf("Apply() = %#v", result)
	}
	if err := plan.Verify(context.Background(), server.Client(), testOptions(server)); err != nil {
		t.Fatal(err)
	}
	if got := strings.Join(labelNames(state.issues[9]), ","); got != "area:ci,human,severity:p2,type:fix" {
		t.Fatalf("closed issue labels = %s", got)
	}
	if got := strings.Join(labelNames(state.issues[11]), ","); got != "area:ci,human,severity:p2,status:wontfix,type:fix" {
		t.Fatalf("deliberately closed issue labels = %s", got)
	}
	if state.writes != 2 {
		t.Fatalf("writes = %d, want two owned-label removals", state.writes)
	}

	second, err := Preflight(
		context.Background(), server.Client(), testMapping(7, 9, 11), testPolicy(t), testOptions(server), Event{},
	)
	if err != nil {
		t.Fatal(err)
	}
	result, err = second.Apply(context.Background(), server.Client(), testOptions(server))
	if err != nil || result != (Result{Unchanged: 3}) || state.writes != 2 {
		t.Fatalf("idempotent Apply() = %#v, %v; writes = %d", result, err, state.writes)
	}
}

func TestReopenedEventReplacesManagedStatusesWithTriage(t *testing.T) {
	t.Parallel()
	state := &lifecycleState{issues: map[int]remoteIssue{
		11: {
			Number: 11, NodeID: "ISSUE_11", State: "open",
			Labels: labels("type:fix", "severity:p2", "area:ci", blockedLabel, wontfixLabel, "human"),
		},
	}}
	server := httptest.NewServer(state.handler(t))
	defer server.Close()
	event, err := NewEvent(11, "reopened")
	if err != nil {
		t.Fatal(err)
	}
	plan, err := Preflight(
		context.Background(), server.Client(), testMapping(11), testPolicy(t), testOptions(server), event,
	)
	if err != nil {
		t.Fatal(err)
	}
	result, err := plan.Apply(context.Background(), server.Client(), testOptions(server))
	if err != nil {
		t.Fatal(err)
	}
	if result != (Result{Updated: 1}) {
		t.Fatalf("Apply() = %#v", result)
	}
	if err := plan.Verify(context.Background(), server.Client(), testOptions(server)); err != nil {
		t.Fatal(err)
	}
	want := "area:ci,human,severity:p2,status:needs-triage,type:fix"
	if got := strings.Join(labelNames(state.issues[11]), ","); got != want {
		t.Fatalf("reopened issue labels = %s, want %s", got, want)
	}
	if state.writes != 3 {
		t.Fatalf("writes = %d, want two removals and one addition", state.writes)
	}
}

func TestLifecycleRepairsUnambiguousOpenStatusDriftIdempotently(t *testing.T) {
	t.Parallel()
	state := &lifecycleState{issues: map[int]remoteIssue{
		7: {
			Number: 7, NodeID: "ISSUE_7", State: "open",
			Labels: labels("type:fix", "area:ci"),
		},
		8: {
			Number: 8, NodeID: "ISSUE_8", State: "open",
			Labels: labels("type:fix", "area:ci", wontfixLabel),
		},
		9: {
			Number: 9, NodeID: "ISSUE_9", State: "open",
			Labels: labels("type:fix", "area:ci", blockedLabel, wontfixLabel),
		},
		10: {
			Number: 10, NodeID: "ISSUE_10", State: "open",
			Labels: labels("type:fix", "area:ci", inProgressLabel),
		},
	}}
	server := httptest.NewServer(state.handler(t))
	defer server.Close()

	plan, err := Preflight(
		context.Background(), server.Client(), testMapping(7, 8, 9, 10), testPolicy(t), testOptions(server), Event{},
	)
	if err != nil {
		t.Fatal(err)
	}
	result, err := plan.Apply(context.Background(), server.Client(), testOptions(server))
	if err != nil {
		t.Fatal(err)
	}
	if result != (Result{Updated: 3, Unchanged: 1}) {
		t.Fatalf("Apply() = %#v", result)
	}
	if err := plan.Verify(context.Background(), server.Client(), testOptions(server)); err != nil {
		t.Fatal(err)
	}
	for _, number := range []int{7, 8} {
		if got := strings.Join(labelNames(state.issues[number]), ","); got != "area:ci,status:needs-triage,type:fix" {
			t.Fatalf("issue %d labels = %s", number, got)
		}
	}
	if got := strings.Join(labelNames(state.issues[9]), ","); got != "area:ci,status:blocked,type:fix" {
		t.Fatalf("issue 9 labels = %s", got)
	}
	if state.writes != 4 {
		t.Fatalf("writes = %d, want two additions, one replacement, and one stale-wontfix removal", state.writes)
	}

	second, err := Preflight(
		context.Background(), server.Client(), testMapping(7, 8, 9, 10), testPolicy(t), testOptions(server), Event{},
	)
	if err != nil {
		t.Fatal(err)
	}
	result, err = second.Apply(context.Background(), server.Client(), testOptions(server))
	if err != nil || result != (Result{Unchanged: 4}) || state.writes != 4 {
		t.Fatalf("idempotent Apply() = %#v, %v; writes = %d", result, err, state.writes)
	}
}

func TestLifecyclePreflightFailsClosedOnAmbiguousInventory(t *testing.T) {
	t.Parallel()
	pull := json.RawMessage(`{"url":"https://api.github.test/pulls/7"}`)
	for name, issue := range map[string]remoteIssue{
		"unknown status": {
			Number: 7, NodeID: "ISSUE_7", State: "open", Labels: labels("status:future"),
		},
		"duplicate label": {
			Number: 7, NodeID: "ISSUE_7", State: "open", Labels: labels(inProgressLabel, "STATUS:IN-PROGRESS"),
		},
		"multiple active statuses": {
			Number: 7, NodeID: "ISSUE_7", State: "open", Labels: labels(blockedLabel, inProgressLabel),
		},
		"ambiguous observation delimiter": {
			Number: 7, NodeID: "ISSUE_7", State: "open", Labels: labels(inProgressLabel, "area:a\x00area:b"),
		},
		"pull request": {
			Number: 7, NodeID: "PR_7", State: "open", Labels: labels(inProgressLabel), PullRequest: &pull,
		},
	} {
		name, issue := name, issue
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			state := &lifecycleState{issues: map[int]remoteIssue{7: issue}}
			server := httptest.NewServer(state.handler(t))
			defer server.Close()
			if _, err := Preflight(
				context.Background(), server.Client(), testMapping(7), testPolicy(t), testOptions(server), Event{},
			); err == nil || state.writes != 0 {
				t.Fatalf("Preflight() error/writes = %v/%d, want zero-write refusal", err, state.writes)
			}
		})
	}
}

func TestLifecycleRejectsStaleEventAndInventoryDriftBeforeWrite(t *testing.T) {
	t.Parallel()
	state := &lifecycleState{issues: map[int]remoteIssue{
		7: {Number: 7, NodeID: "ISSUE_7", State: "open", Labels: labels(inProgressLabel)},
	}}
	server := httptest.NewServer(state.handler(t))
	defer server.Close()
	closed, err := NewEvent(7, "closed")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := Preflight(
		context.Background(), server.Client(), testMapping(7), testPolicy(t), testOptions(server), closed,
	); err == nil || !strings.Contains(err.Error(), "no longer matches") {
		t.Fatalf("stale event error = %v", err)
	}

	plan, err := Preflight(
		context.Background(), server.Client(), testMapping(7), testPolicy(t), testOptions(server), Event{},
	)
	if err != nil {
		t.Fatal(err)
	}
	state.issues[7] = remoteIssue{Number: 7, NodeID: "ISSUE_7", State: "open", Labels: labels(blockedLabel)}
	if _, err := plan.Apply(context.Background(), server.Client(), testOptions(server)); err == nil ||
		!strings.Contains(err.Error(), "changed after") || state.writes != 0 {
		t.Fatalf("Apply() error/writes = %v/%d, want zero-write drift refusal", err, state.writes)
	}
}

func TestReopenedEventResumesAfterBoundedPartialFailure(t *testing.T) {
	t.Parallel()
	state := &lifecycleState{
		issues: map[int]remoteIssue{
			7: {Number: 7, NodeID: "ISSUE_7", State: "open", Labels: labels(inProgressLabel, "area:ci")},
		},
		failAddOnce: true,
	}
	server := httptest.NewServer(state.handler(t))
	defer server.Close()
	event, err := NewEvent(7, "reopened")
	if err != nil {
		t.Fatal(err)
	}
	first, err := Preflight(
		context.Background(), server.Client(), testMapping(7), testPolicy(t), testOptions(server), event,
	)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := first.Apply(context.Background(), server.Client(), testOptions(server)); err == nil {
		t.Fatal("Apply() accepted the injected status-addition failure")
	}
	if got := strings.Join(labelNames(state.issues[7]), ","); got != "area:ci" {
		t.Fatalf("partial state = %s, want preserved non-status labels only", got)
	}

	second, err := Preflight(
		context.Background(), server.Client(), testMapping(7), testPolicy(t), testOptions(server), event,
	)
	if err != nil {
		t.Fatal(err)
	}
	result, err := second.Apply(context.Background(), server.Client(), testOptions(server))
	if err != nil || result != (Result{Updated: 1}) {
		t.Fatalf("retry Apply() = %#v, %v", result, err)
	}
	if err := second.Verify(context.Background(), server.Client(), testOptions(server)); err != nil {
		t.Fatal(err)
	}
	if got := strings.Join(labelNames(state.issues[7]), ","); got != "area:ci,status:needs-triage" {
		t.Fatalf("retry state = %s", got)
	}
}

func TestCanonicalRepairRecoversAfterAppliedMutationResponseLoss(t *testing.T) {
	t.Parallel()
	for name, initial := range map[string][]remoteLabel{
		"delete": labels(inProgressLabel, "area:ci"),
		"add":    labels("area:ci"),
	} {
		name, initial := name, initial
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			state := &lifecycleState{issues: map[int]remoteIssue{
				7: {Number: 7, NodeID: "ISSUE_7", State: "open", Labels: initial},
			}}
			server := httptest.NewServer(state.handler(t))
			defer server.Close()
			method := http.MethodDelete
			event := Event{}
			if name == "add" {
				method = http.MethodPost
			} else {
				var err error
				event, err = NewEvent(7, "reopened")
				if err != nil {
					t.Fatal(err)
				}
			}
			lossy := &responseLossClient{inner: server.Client(), method: method}
			first, err := Preflight(
				context.Background(), lossy, testMapping(7), testPolicy(t), testOptions(server), event,
			)
			if err != nil {
				t.Fatal(err)
			}
			if _, err := first.Apply(context.Background(), lossy, testOptions(server)); err == nil || !lossy.lost {
				t.Fatalf("Apply() error/lost = %v/%t, want applied response loss", err, lossy.lost)
			}

			// A fresh canonical sync must converge whether the lost response was
			// for the stale-status deletion or the triage addition.
			second, err := Preflight(
				context.Background(), server.Client(), testMapping(7), testPolicy(t), testOptions(server), Event{},
			)
			if err != nil {
				t.Fatal(err)
			}
			if _, err := second.Apply(context.Background(), server.Client(), testOptions(server)); err != nil {
				t.Fatal(err)
			}
			if err := second.Verify(context.Background(), server.Client(), testOptions(server)); err != nil {
				t.Fatal(err)
			}
			if got := strings.Join(labelNames(state.issues[7]), ","); got != "area:ci,status:needs-triage" {
				t.Fatalf("recovered labels = %s", got)
			}
		})
	}
}

func TestLifecycleReadbackDetectsConcurrentReopenAfterClosedMutation(t *testing.T) {
	t.Parallel()
	state := &lifecycleState{issues: map[int]remoteIssue{
		7: {Number: 7, NodeID: "ISSUE_7", State: "closed", Labels: labels(inProgressLabel, "area:ci")},
	}}
	baseHandler := state.handler(t)
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		baseHandler.ServeHTTP(writer, request)
		if request.Method == http.MethodDelete {
			state.mutex.Lock()
			issue := state.issues[7]
			issue.State = "open"
			state.issues[7] = issue
			state.mutex.Unlock()
		}
	}))
	defer server.Close()
	plan, err := Preflight(
		context.Background(), server.Client(), testMapping(7), testPolicy(t), testOptions(server), Event{},
	)
	if err != nil {
		t.Fatal(err)
	}
	result, err := plan.Apply(context.Background(), server.Client(), testOptions(server))
	if err != nil || result != (Result{Updated: 1}) {
		t.Fatalf("Apply() = %#v, %v", result, err)
	}
	if err := plan.Verify(context.Background(), server.Client(), testOptions(server)); err == nil ||
		!strings.Contains(err.Error(), "identity changed") {
		t.Fatalf("Verify() error = %v, want concurrent-state refusal", err)
	}

	repair, err := Preflight(
		context.Background(), server.Client(), testMapping(7), testPolicy(t), testOptions(server), Event{},
	)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := repair.Apply(context.Background(), server.Client(), testOptions(server)); err != nil {
		t.Fatal(err)
	}
	if err := repair.Verify(context.Background(), server.Client(), testOptions(server)); err != nil {
		t.Fatal(err)
	}
	if got := strings.Join(labelNames(state.issues[7]), ","); got != "area:ci,status:needs-triage" {
		t.Fatalf("recovered labels = %s", got)
	}
}

func TestLifecycleReadbackDetectsMilestoneLossAfterStatusMutation(t *testing.T) {
	t.Parallel()
	state := &lifecycleState{issues: map[int]remoteIssue{
		7: {
			Number: 7, NodeID: "ISSUE_7", State: "closed", Labels: labels(inProgressLabel, "area:ci"),
			Milestone: &remoteMilestone{Number: 9},
		},
	}}
	baseHandler := state.handler(t)
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		baseHandler.ServeHTTP(writer, request)
		if request.Method == http.MethodDelete {
			state.mutex.Lock()
			issue := state.issues[7]
			issue.Milestone = nil
			state.issues[7] = issue
			state.mutex.Unlock()
		}
	}))
	defer server.Close()
	plan, err := Preflight(
		context.Background(), server.Client(), testMapping(7), testPolicy(t), testOptions(server), Event{},
	)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := plan.Apply(context.Background(), server.Client(), testOptions(server)); err != nil {
		t.Fatal(err)
	}
	if err := plan.Verify(context.Background(), server.Client(), testOptions(server)); err == nil ||
		!strings.Contains(err.Error(), "identity changed") {
		t.Fatalf("Verify() error = %v, want milestone-preservation refusal", err)
	}
}

func TestLifecycleRejectsMutationResponseThatLosesNonStatusLabels(t *testing.T) {
	t.Parallel()
	writes := 0
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		switch request.Method {
		case http.MethodGet:
			writeJSON(t, writer, remoteIssue{
				Number: 7, NodeID: "ISSUE_7", State: "closed",
				Labels: labels("type:fix", "area:ci", inProgressLabel, "human"),
			})
		case http.MethodDelete:
			writes++
			writeJSON(t, writer, []remoteLabel{})
		default:
			http.Error(writer, "unexpected request", http.StatusBadRequest)
		}
	}))
	defer server.Close()
	plan, err := Preflight(
		context.Background(), server.Client(), testMapping(7), testPolicy(t), testOptions(server), Event{},
	)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := plan.Apply(context.Background(), server.Client(), testOptions(server)); err == nil ||
		!strings.Contains(err.Error(), "non-status label") || writes != 1 {
		t.Fatalf("Apply() error/writes = %v/%d, want mutation-response tamper refusal", err, writes)
	}
}

func TestLifecycleRejectsIssueLabelInventoryBeyondBound(t *testing.T) {
	t.Parallel()
	tooMany := make([]remoteLabel, maximumLabels+1)
	for index := range tooMany {
		tooMany[index] = remoteLabel{Name: fmt.Sprintf("external-%03d", index)}
	}
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, _ *http.Request) {
		writeJSON(t, writer, remoteIssue{
			Number: 7, NodeID: "ISSUE_7", State: "closed", Labels: tooMany,
		})
	}))
	defer server.Close()
	if _, err := Preflight(
		context.Background(), server.Client(), testMapping(7), testPolicy(t), testOptions(server), Event{},
	); err == nil || !strings.Contains(err.Error(), "malformed") {
		t.Fatalf("Preflight() error = %v, want bounded inventory refusal", err)
	}
}

func TestLifecycleRejectsIssueMappingBeyondBoundWithoutNetwork(t *testing.T) {
	t.Parallel()
	numbers := make([]int, maximumIssues+1)
	for index := range numbers {
		numbers[index] = index + 1
	}
	requests := 0
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, _ *http.Request) {
		requests++
		http.Error(writer, "request should not occur", http.StatusInternalServerError)
	}))
	defer server.Close()
	if _, err := Preflight(
		context.Background(), server.Client(), testMapping(numbers...), testPolicy(t), testOptions(server), Event{},
	); err == nil || !strings.Contains(err.Error(), "between 1 and 256") || requests != 0 {
		t.Fatalf("Preflight() error/requests = %v/%d, want bounded zero-request refusal", err, requests)
	}
}

func TestPolicyAndEventAuthorityRejectTampering(t *testing.T) {
	t.Parallel()
	manifest := githublabels.Manifest{Schema: 1, Labels: []githublabels.Label{
		{Name: needsTriageLabel}, {Name: blockedLabel}, {Name: inProgressLabel},
		{Name: waitingLabel}, {Name: wontfixLabel},
	}}
	if _, err := NewPolicy(manifest); err != nil {
		t.Fatal(err)
	}
	manifest.Labels = append(manifest.Labels, githublabels.Label{Name: "status:future"})
	if _, err := NewPolicy(manifest); err == nil {
		t.Fatal("NewPolicy() accepted an unclassified managed status")
	}
	for _, event := range []struct {
		issue  int
		action string
	}{{7, ""}, {0, "closed"}, {7, "merged"}} {
		if _, err := NewEvent(event.issue, event.action); err == nil {
			t.Fatalf("NewEvent(%d, %q) accepted an incomplete or unknown transition", event.issue, event.action)
		}
	}
}

func TestUnmappedEventReportsItsSkipWhileRepairingMappedDrift(t *testing.T) {
	t.Parallel()
	state := &lifecycleState{issues: map[int]remoteIssue{
		7: {Number: 7, NodeID: "ISSUE_7", State: "closed", Labels: labels(inProgressLabel, "area:ci")},
	}}
	server := httptest.NewServer(state.handler(t))
	defer server.Close()
	event, err := NewEvent(999, "reopened")
	if err != nil {
		t.Fatal(err)
	}
	plan, err := Preflight(
		context.Background(), server.Client(), testMapping(7), testPolicy(t), testOptions(server), event,
	)
	if err != nil {
		t.Fatal(err)
	}
	result, err := plan.Apply(context.Background(), server.Client(), testOptions(server))
	if err != nil || result != (Result{Updated: 1, EventSkipped: true}) || state.writes != 1 {
		t.Fatalf("Apply() = %#v, %v; writes = %d", result, err, state.writes)
	}
	if got := strings.Join(labelNames(state.issues[7]), ","); got != "area:ci" {
		t.Fatalf("mapped drift repair labels = %s", got)
	}
}
