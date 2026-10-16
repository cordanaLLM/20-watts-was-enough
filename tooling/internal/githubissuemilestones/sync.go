package githubissuemilestones

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"

	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/githubapi"
)

const (
	defaultAPIBase       = "https://api.github.com"
	apiVersion           = "2026-03-10"
	maximumResponseBytes = 1 << 20
)

// Options binds synchronization to one repository and authenticated API.
type Options struct {
	APIBase    string
	Repository string
	Token      string
}

// HTTPClient is the smallest client surface required by synchronization.
type HTTPClient interface {
	Do(*http.Request) (*http.Response, error)
}

// MilestoneAuthority exposes the stable identities admitted by the milestone
// manifest preflight.
type MilestoneAuthority interface {
	Includes(string) bool
}

// MilestoneInventory exposes numeric identities only after exact milestone
// mutation responses and a complete readback have passed.
type MilestoneInventory interface {
	Number(string) (int, bool)
}

// Result reports only bounded issue-assignment mutations.
type Result struct {
	Updated   int
	Unchanged int
}

// Plan is the immutable result of reading every explicitly mapped issue before
// any repository metadata mutation begins.
type Plan struct {
	manifest     Manifest
	repository   string
	apiBase      string
	observations map[int]issueObservation
}

type remoteMilestone struct {
	Number int `json:"number"`
}

type remoteIssue struct {
	Number      int              `json:"number"`
	NodeID      string           `json:"node_id"`
	State       string           `json:"state"`
	Milestone   *remoteMilestone `json:"milestone"`
	PullRequest *json.RawMessage `json:"pull_request"`
}

type issueObservation struct {
	nodeID    string
	state     string
	milestone int
}

type issuePayload struct {
	Milestone int `json:"milestone"`
}

// Preflight validates the committed mapping against the milestone authority
// and reads every exact issue without mutating GitHub.
func Preflight(
	ctx context.Context,
	client HTTPClient,
	manifest Manifest,
	options Options,
	milestones MilestoneAuthority,
) (Plan, error) {
	if err := validateManifest(manifest); err != nil {
		return Plan{}, err
	}
	base, err := validateOptions(client, options)
	if err != nil {
		return Plan{}, err
	}
	if manifest.Repository != options.Repository {
		return Plan{}, fmt.Errorf(
			"issue-assignment manifest repository %q does not match requested repository %q",
			manifest.Repository,
			options.Repository,
		)
	}
	if milestones == nil {
		return Plan{}, errors.New("issue assignment requires a preflighted milestone authority")
	}
	for _, assignment := range manifest.Assignments {
		if !milestones.Includes(assignment.Milestone) {
			return Plan{}, fmt.Errorf("issue %d maps to unknown milestone %s", assignment.Issue, assignment.Milestone)
		}
	}
	plan := Plan{
		manifest: manifest, repository: options.Repository, apiBase: base.String(),
		observations: make(map[int]issueObservation, len(manifest.Assignments)),
	}
	for _, assignment := range manifest.Assignments {
		issue, err := inspectIssue(ctx, client, base, options, assignment.Issue)
		if err != nil {
			return Plan{}, err
		}
		plan.observations[assignment.Issue] = observe(issue)
	}
	return plan, nil
}

// Apply confirms the entire issue inventory has not changed since preflight,
// then sets only mapped issue milestone fields. A partial transport failure is
// safe to retry because a new preflight treats already-correct assignments as
// unchanged.
func (plan Plan) Apply(
	ctx context.Context,
	client HTTPClient,
	options Options,
	milestones MilestoneInventory,
) (Result, error) {
	base, err := validatePlanOptions(client, options, plan.repository, plan.apiBase)
	if err != nil {
		return Result{}, err
	}
	targets, err := plan.resolveTargets(milestones)
	if err != nil {
		return Result{}, err
	}
	if err := plan.confirmObservations(ctx, client, base, options); err != nil {
		return Result{}, err
	}
	result := Result{}
	for _, assignment := range plan.manifest.Assignments {
		observed := plan.observations[assignment.Issue]
		target := targets[assignment.Issue]
		if observed.milestone == target {
			result.Unchanged++
			continue
		}
		if _, err := mutateIssue(ctx, client, base, options, assignment.Issue, target, observed); err != nil {
			return Result{}, err
		}
		result.Updated++
	}
	return result, nil
}

// Verify reads every mapped issue again and checks its exact repository-bound
// milestone assignment and stable issue identity.
func (plan Plan) Verify(
	ctx context.Context,
	client HTTPClient,
	options Options,
	milestones MilestoneInventory,
) error {
	base, err := validatePlanOptions(client, options, plan.repository, plan.apiBase)
	if err != nil {
		return err
	}
	targets, err := plan.resolveTargets(milestones)
	if err != nil {
		return err
	}
	for _, assignment := range plan.manifest.Assignments {
		issue, err := inspectIssue(ctx, client, base, options, assignment.Issue)
		if err != nil {
			return err
		}
		observed := plan.observations[assignment.Issue]
		current := observe(issue)
		if current.nodeID != observed.nodeID || current.state != observed.state ||
			current.milestone != targets[assignment.Issue] {
			return fmt.Errorf("GitHub issue %d does not match its preflighted assignment after synchronization", assignment.Issue)
		}
	}
	return nil
}

func (plan Plan) resolveTargets(milestones MilestoneInventory) (map[int]int, error) {
	if milestones == nil {
		return nil, errors.New("issue assignment requires a verified milestone inventory")
	}
	targets := make(map[int]int, len(plan.manifest.Assignments))
	for _, assignment := range plan.manifest.Assignments {
		number, ok := milestones.Number(assignment.Milestone)
		if !ok || number < 1 {
			return nil, fmt.Errorf("issue %d target milestone %s lacks a verified numeric identity", assignment.Issue, assignment.Milestone)
		}
		targets[assignment.Issue] = number
	}
	return targets, nil
}

func (plan Plan) confirmObservations(ctx context.Context, client HTTPClient, base *url.URL, options Options) error {
	for _, assignment := range plan.manifest.Assignments {
		issue, err := inspectIssue(ctx, client, base, options, assignment.Issue)
		if err != nil {
			return err
		}
		if observe(issue) != plan.observations[assignment.Issue] {
			return fmt.Errorf("GitHub issue %d changed after the complete metadata preflight", assignment.Issue)
		}
	}
	return nil
}

func observe(issue remoteIssue) issueObservation {
	milestone := 0
	if issue.Milestone != nil {
		milestone = issue.Milestone.Number
	}
	return issueObservation{nodeID: issue.NodeID, state: issue.State, milestone: milestone}
}

func inspectIssue(
	ctx context.Context,
	client HTTPClient,
	base *url.URL,
	options Options,
	number int,
) (remoteIssue, error) {
	request, err := newRequest(ctx, base, options, http.MethodGet, number, nil)
	if err != nil {
		return remoteIssue{}, err
	}
	response, err := client.Do(request)
	if err != nil {
		return remoteIssue{}, fmt.Errorf("inspect GitHub issue %d: %w", number, err)
	}
	return decodeIssueResponse(response, number, http.StatusOK, "inspect")
}

func mutateIssue(
	ctx context.Context,
	client HTTPClient,
	base *url.URL,
	options Options,
	number int,
	milestone int,
	expected issueObservation,
) (remoteIssue, error) {
	body, err := json.Marshal(issuePayload{Milestone: milestone})
	if err != nil {
		return remoteIssue{}, fmt.Errorf("encode GitHub issue %d assignment: %w", number, err)
	}
	request, err := newRequest(ctx, base, options, http.MethodPatch, number, body)
	if err != nil {
		return remoteIssue{}, err
	}
	response, err := client.Do(request)
	if err != nil {
		return remoteIssue{}, fmt.Errorf("assign GitHub issue %d: %w", number, err)
	}
	issue, err := decodeIssueResponse(response, number, http.StatusOK, "assign")
	if err != nil {
		return remoteIssue{}, err
	}
	current := observe(issue)
	if current.nodeID != expected.nodeID || current.state != expected.state || current.milestone != milestone {
		return remoteIssue{}, fmt.Errorf("assign GitHub issue %d: response identity does not match the requested state", number)
	}
	return issue, nil
}

func decodeIssueResponse(response *http.Response, number, expectedStatus int, operation string) (remoteIssue, error) {
	if response == nil || response.Body == nil {
		return remoteIssue{}, fmt.Errorf("%s GitHub issue %d: empty HTTP response", operation, number)
	}
	defer response.Body.Close()
	if response.StatusCode != expectedStatus {
		if err := githubapi.DrainBounded(response.Body, maximumResponseBytes, "GitHub response exceeds its byte limit"); err != nil {
			return remoteIssue{}, err
		}
		return remoteIssue{}, fmt.Errorf("%s GitHub issue %d: unexpected HTTP status %d", operation, number, response.StatusCode)
	}
	body, err := io.ReadAll(io.LimitReader(response.Body, maximumResponseBytes+1))
	if err != nil || len(body) > maximumResponseBytes {
		return remoteIssue{}, fmt.Errorf("%s GitHub issue %d: response exceeds its bounded readable form", operation, number)
	}
	var issue remoteIssue
	if err := json.Unmarshal(body, &issue); err != nil {
		return remoteIssue{}, fmt.Errorf("%s GitHub issue %d: decode response: %w", operation, number, err)
	}
	if issue.Number != number || issue.NodeID == "" || (issue.State != "open" && issue.State != "closed") ||
		issue.PullRequest != nil || (issue.Milestone != nil && issue.Milestone.Number < 1) {
		return remoteIssue{}, fmt.Errorf("%s GitHub issue %d: malformed or pull-request identity", operation, number)
	}
	return issue, nil
}

func validateOptions(client HTTPClient, options Options) (*url.URL, error) {
	if client == nil || !repositoryPattern.MatchString(options.Repository) || options.Token == "" {
		return nil, errors.New("issue assignment requires a client, owner/repository, and token")
	}
	apiBase := strings.TrimSuffix(options.APIBase, "/")
	if apiBase == "" {
		apiBase = defaultAPIBase
	}
	base, err := url.Parse(apiBase)
	if err != nil || base.Scheme == "" || base.Host == "" || base.User != nil ||
		base.RawQuery != "" || base.Fragment != "" {
		return nil, errors.New("issue-assignment API base is invalid")
	}
	return base, nil
}

func validatePlanOptions(client HTTPClient, options Options, repository, apiBase string) (*url.URL, error) {
	base, err := validateOptions(client, options)
	if err != nil {
		return nil, err
	}
	if repository == "" || options.Repository != repository || base.String() != apiBase {
		return nil, errors.New("issue-assignment options changed after preflight")
	}
	return base, nil
}

func newRequest(
	ctx context.Context,
	base *url.URL,
	options Options,
	method string,
	number int,
	body []byte,
) (*http.Request, error) {
	endpoint := strings.TrimSuffix(base.String(), "/") + "/repos/" + options.Repository + "/issues/" + strconv.Itoa(number)
	var reader io.Reader
	if body != nil {
		reader = bytes.NewReader(body)
	}
	request, err := http.NewRequestWithContext(ctx, method, endpoint, reader)
	if err != nil {
		return nil, fmt.Errorf("construct GitHub issue %d request: %w", number, err)
	}
	request.Header.Set("Accept", "application/vnd.github+json")
	request.Header.Set("Authorization", "Bearer "+options.Token)
	request.Header.Set("User-Agent", "20w-issue-milestone-sync")
	request.Header.Set("X-GitHub-Api-Version", apiVersion)
	if body != nil {
		request.Header.Set("Content-Type", "application/json")
	}
	return request, nil
}
