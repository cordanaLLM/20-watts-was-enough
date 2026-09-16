// Package githubprmetadata projects one explicitly referenced managed issue
// onto pull-request labels and its roadmap milestone.
package githubprmetadata

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"sort"
	"strconv"
	"strings"

	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/githubissuelifecycle"
	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/githubissuemilestones"
	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/githublabels"
	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/githubmilestones"
)

const (
	defaultAPIBase       = "https://api.github.com"
	apiVersion           = "2026-03-10"
	maximumResponseBytes = 1 << 20
	maximumBodyBytes     = 128 << 10
	maximumLabels        = 128
	maximumNumber        = 1_000_000_000
	maximumSyncAttempts  = 3
)

var (
	repositoryPattern = regexp.MustCompile(`^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$`)
	referencePattern  = regexp.MustCompile(`(?im)^[\t ]*(?:refs|tracks|closes|fixes|resolves)[\t ]+#([1-9][0-9]{0,9})\.?[\t ]*\r?$`)
	titlePattern      = regexp.MustCompile(`^([a-z][a-z0-9-]{0,31})(?:\([^()\r\n]{1,64}\))?!?:\s+\S`)
)

// Authorities are the committed repository metadata manifests used by the
// projection. They remain independent of pull-request input.
type Authorities struct {
	Labels     githublabels.Manifest
	Milestones githubmilestones.Manifest
	Issues     githubissuemilestones.Manifest
}

// MilestoneInventory resolves a stable roadmap identity only after the remote
// milestone inventory has been checked against Git authority.
type MilestoneInventory interface {
	Number(string) (int, bool)
}

// HTTPClient is the smallest transport surface required by Sync.
type HTTPClient interface {
	Do(*http.Request) (*http.Response, error)
}

// Action is one admitted pull-request lifecycle event from the trusted
// pull_request_target workflow.
type Action string

const (
	Opened      Action = "opened"
	Edited      Action = "edited"
	Synchronize Action = "synchronize"
	Reopened    Action = "reopened"
	Closed      Action = "closed"
)

// Event binds synchronization to the exact webhook action and merge flag.
// Merged is authoritative only after it agrees with GitHub's merge endpoint.
type Event struct {
	Action Action
	Merged bool
}

// NewEvent parses the exact strings supplied by the trusted workflow. Keeping
// this conversion at the CLI boundary prevents absent or truthy values from
// silently selecting a lifecycle path.
func NewEvent(action, merged string) (Event, error) {
	if merged != "true" && merged != "false" {
		return Event{}, errors.New("pull-request metadata event requires merged to be exactly true or false")
	}
	event := Event{Action: Action(action), Merged: merged == "true"}
	if err := validateEvent(event); err != nil {
		return Event{}, err
	}
	return event, nil
}

// Options binds one synchronization to one repository pull request.
type Options struct {
	APIBase     string
	Repository  string
	Token       string
	PullRequest int
	Event       Event
}

// Result reports either one converged pull request or a typed no-write skip.
type Result struct {
	Updated   bool
	Skipped   bool
	Reason    string
	Issue     int
	Milestone int
	Labels    []string
}

type remoteMilestone struct {
	Number int `json:"number"`
}

type remoteLabel struct {
	Name string `json:"name"`
}

type remoteItem struct {
	Number      int              `json:"number"`
	NodeID      string           `json:"node_id"`
	State       string           `json:"state"`
	Title       string           `json:"title"`
	Body        *string          `json:"body"`
	Labels      []remoteLabel    `json:"labels"`
	Milestone   *remoteMilestone `json:"milestone"`
	PullRequest *json.RawMessage `json:"pull_request"`
}

type observation struct {
	nodeID    string
	state     string
	title     string
	body      string
	milestone int
	labels    string
}

type labelsPayload struct {
	Labels []string `json:"labels"`
}

type milestonePayload struct {
	Milestone int `json:"milestone"`
}

type authorityIndex struct {
	managed     map[string]string
	assignments map[int]string
	statuses    githubissuelifecycle.Policy
}

type retentionGuard struct {
	closed bool
	policy githubissuelifecycle.Policy
	set    bool
	labels []string
}

func (guard *retentionGuard) observe(labels []remoteLabel) error {
	retained := unownedClassificationLabels(labels)
	if guard.closed {
		var err error
		_, retained, err = classifyStatusLabels(labels, guard.policy)
		if err != nil {
			return err
		}
	}
	if guard.set {
		if err := retainLabels(labels, guard.labels); err != nil {
			return err
		}
	}
	combined := foldedSet(guard.labels)
	for _, label := range retained {
		if _, exists := combined[strings.ToLower(label)]; !exists {
			guard.labels = append(guard.labels, label)
			combined[strings.ToLower(label)] = struct{}{}
		}
	}
	sort.Strings(guard.labels)
	guard.set = true
	return nil
}

// ValidateAuthorities checks that every issue assignment resolves to a
// committed milestone and that all managed label classes needed by the
// projection exist.
func ValidateAuthorities(authorities Authorities) error {
	_, err := indexAuthorities(authorities)
	return err
}

// Sync reads one pull request and its one unambiguous managed issue reference,
// confirms the event-specific snapshots, then converges the owned metadata.
// Open and reopened events project the linked issue. Closed events only clean
// lifecycle status, retaining every non-status label and the exact milestone.
// It retries a bounded number of times so a partial remote write or concurrent
// change either converges from fresh state or fails visibly. Missing or
// ambiguous managed references are successful no-write skips.
func Sync(
	ctx context.Context,
	client HTTPClient,
	authorities Authorities,
	milestones MilestoneInventory,
	options Options,
) (Result, error) {
	index, err := indexAuthorities(authorities)
	if err != nil {
		return Result{}, err
	}
	base, err := validateOptions(client, options, authorities.Issues.Repository)
	if err != nil {
		return Result{}, err
	}
	if options.Event.Action != Closed && milestones == nil {
		return Result{}, errors.New("pull-request metadata requires a verified milestone inventory")
	}

	updated := false
	retained := retentionGuard{closed: options.Event.Action == Closed, policy: index.statuses}
	var lastErr error
	for attempt := 1; attempt <= maximumSyncAttempts; attempt++ {
		result, attempted, retry, err := syncAttempt(ctx, client, base, options, index, milestones, &retained)
		updated = updated || attempted
		if err == nil {
			if result.Skipped && updated {
				return Result{}, errors.New("pull-request metadata became unowned after a remote mutation attempt")
			}
			result.Updated = updated
			return result, nil
		}
		if !retry || ctx.Err() != nil {
			return Result{}, err
		}
		lastErr = err
	}
	return Result{}, fmt.Errorf("pull-request metadata did not converge after %d attempts: %w", maximumSyncAttempts, lastErr)
}

func syncAttempt(
	ctx context.Context,
	client HTTPClient,
	base *url.URL,
	options Options,
	index authorityIndex,
	milestones MilestoneInventory,
	retained *retentionGuard,
) (Result, bool, bool, error) {
	wantState := "open"
	if options.Event.Action == Closed {
		wantState = "closed"
	}
	pull, err := inspectItem(ctx, client, base, options, options.PullRequest, true, wantState)
	if err != nil {
		return Result{}, false, true, err
	}
	if _, _, err := classifyStatusLabels(pull.Labels, index.statuses); err != nil {
		return Result{}, false, false, fmt.Errorf("pull request %d: %w", options.PullRequest, err)
	}
	if err := retained.observe(pull.Labels); err != nil {
		return Result{}, false, true, fmt.Errorf("pull request %d retention preflight: %w", options.PullRequest, err)
	}
	issueNumber, reason := referencedManagedIssue(bodyText(pull), index.assignments)
	var merged *bool
	if options.Event.Action == Closed {
		remoteMerged, mergeErr := inspectMergeState(ctx, client, base, options)
		if mergeErr != nil {
			return Result{}, false, true, mergeErr
		}
		if remoteMerged != options.Event.Merged {
			return Result{}, false, true, errors.New("pull-request event merge flag disagrees with GitHub merge state")
		}
		merged = &remoteMerged
	}
	if issueNumber == 0 {
		return confirmSkipped(ctx, client, base, options, pull, merged, reason, retained)
	}
	if options.Event.Action == Closed {
		return syncClosedAttempt(ctx, client, base, options, index, pull, issueNumber, *merged, retained)
	}
	issue, err := inspectItem(ctx, client, base, options, issueNumber, false, "open")
	if err != nil {
		return Result{}, false, true, err
	}
	confirmedPull, err := inspectItem(ctx, client, base, options, options.PullRequest, true, "open")
	if err != nil {
		return Result{}, false, true, err
	}
	confirmedIssue, err := inspectItem(ctx, client, base, options, issueNumber, false, "open")
	if err != nil {
		return Result{}, false, true, err
	}
	if observe(confirmedPull) != observe(pull) || observe(confirmedIssue) != observe(issue) {
		return Result{}, false, true, errors.New("pull request or referenced issue changed after metadata preflight")
	}
	desired, milestone, err := desiredMetadata(confirmedPull, confirmedIssue, issueNumber, index, milestones)
	if err != nil {
		return Result{}, false, false, err
	}
	result := Result{Issue: issueNumber, Milestone: milestone, Labels: displayLabels(confirmedPull.Labels)}
	if err := retained.observe(confirmedPull.Labels); err != nil {
		return Result{}, false, true, fmt.Errorf("pull-request metadata confirmation: %w", err)
	}
	if equalOwnedMetadata(confirmedPull, desired, milestone) {
		return result, false, false, nil
	}
	attempted, err := convergePull(ctx, client, base, options, confirmedPull, desired, milestone, retained)
	if err != nil {
		return Result{}, attempted, true, err
	}
	readbackPull, err := inspectItem(ctx, client, base, options, options.PullRequest, true, "open")
	if err != nil {
		return Result{}, attempted, true, err
	}
	readbackIssue, err := inspectItem(ctx, client, base, options, issueNumber, false, "open")
	if err != nil {
		return Result{}, attempted, true, err
	}
	if observeIdentity(readbackPull) != observeIdentity(confirmedPull) || observe(readbackIssue) != observe(confirmedIssue) {
		return Result{}, attempted, true, errors.New("pull request or referenced issue changed during metadata synchronization")
	}
	if !equalOwnedMetadata(readbackPull, desired, milestone) {
		return Result{}, attempted, true, errors.New("owned pull-request metadata does not match the requested state after synchronization")
	}
	if err := retained.observe(readbackPull.Labels); err != nil {
		return Result{}, attempted, true, fmt.Errorf("pull-request metadata readback: %w", err)
	}
	result.Labels = displayLabels(readbackPull.Labels)
	return result, attempted, false, nil
}

func syncClosedAttempt(
	ctx context.Context,
	client HTTPClient,
	base *url.URL,
	options Options,
	index authorityIndex,
	pull remoteItem,
	issueNumber int,
	merged bool,
	retained *retentionGuard,
) (Result, bool, bool, error) {
	confirmedPull, err := inspectItem(ctx, client, base, options, options.PullRequest, true, "closed")
	if err != nil {
		return Result{}, false, true, err
	}
	confirmedMerged, err := inspectMergeState(ctx, client, base, options)
	if err != nil {
		return Result{}, false, true, err
	}
	if confirmedMerged != merged || confirmedMerged != options.Event.Merged || observe(confirmedPull) != observe(pull) {
		return Result{}, false, true, errors.New("pull request or merge state changed after lifecycle preflight")
	}
	if err := retained.observe(confirmedPull.Labels); err != nil {
		return Result{}, false, true, fmt.Errorf("pull-request lifecycle confirmation: %w", err)
	}
	statuses, _, err := classifyStatusLabels(confirmedPull.Labels, index.statuses)
	if err != nil {
		return Result{}, false, false, fmt.Errorf("pull request %d: %w", options.PullRequest, err)
	}
	desired := closedStatuses(statuses, index.statuses, merged)
	result := Result{
		Issue: issueNumber, Milestone: milestoneNumber(confirmedPull), Labels: displayLabels(confirmedPull.Labels),
	}
	if equalFolded(statuses, desired) {
		return result, false, false, nil
	}
	attempted, err := convergeClosedStatuses(ctx, client, base, options, index.statuses, confirmedPull, desired, retained)
	if err != nil {
		return Result{}, attempted, true, err
	}
	readback, err := inspectItem(ctx, client, base, options, options.PullRequest, true, "closed")
	if err != nil {
		return Result{}, attempted, true, err
	}
	readbackMerged, err := inspectMergeState(ctx, client, base, options)
	if err != nil {
		return Result{}, attempted, true, err
	}
	if observeIdentity(readback) != observeIdentity(confirmedPull) ||
		milestoneNumber(readback) != milestoneNumber(confirmedPull) || readbackMerged != merged {
		return Result{}, attempted, true, errors.New("pull request identity, milestone, or merge state changed during lifecycle synchronization")
	}
	readbackStatuses, _, err := classifyStatusLabels(readback.Labels, index.statuses)
	if err != nil {
		return Result{}, attempted, false, fmt.Errorf("pull request %d lifecycle readback: %w", options.PullRequest, err)
	}
	if !equalFolded(readbackStatuses, desired) {
		return Result{}, attempted, true, errors.New("pull-request lifecycle status does not match the requested closed state")
	}
	if err := retained.observe(readback.Labels); err != nil {
		return Result{}, attempted, true, fmt.Errorf("pull-request lifecycle readback: %w", err)
	}
	result.Labels = displayLabels(readback.Labels)
	return result, attempted, false, nil
}

func confirmSkipped(
	ctx context.Context,
	client HTTPClient,
	base *url.URL,
	options Options,
	pull remoteItem,
	merged *bool,
	reason string,
	retained *retentionGuard,
) (Result, bool, bool, error) {
	wantState := "open"
	if options.Event.Action == Closed {
		wantState = "closed"
	}
	confirmed, err := inspectItem(ctx, client, base, options, options.PullRequest, true, wantState)
	if err != nil {
		return Result{}, false, true, err
	}
	if observe(confirmed) != observe(pull) {
		return Result{}, false, true, errors.New("pull request changed while confirming the metadata no-write decision")
	}
	if err := retained.observe(confirmed.Labels); err != nil {
		return Result{}, false, true, fmt.Errorf("pull-request metadata skip confirmation: %w", err)
	}
	if merged != nil {
		confirmedMerged, mergeErr := inspectMergeState(ctx, client, base, options)
		if mergeErr != nil {
			return Result{}, false, true, mergeErr
		}
		if confirmedMerged != *merged || confirmedMerged != options.Event.Merged {
			return Result{}, false, true, errors.New("pull-request merge state changed while confirming the metadata no-write decision")
		}
	}
	return Result{Skipped: true, Reason: reason}, false, false, nil
}

func indexAuthorities(authorities Authorities) (authorityIndex, error) {
	if authorities.Labels.Schema != 1 || authorities.Milestones.Schema != 1 || authorities.Issues.Schema != 1 {
		return authorityIndex{}, errors.New("pull-request metadata authorities require schema 1")
	}
	statusPolicy, err := githubissuelifecycle.NewPolicy(authorities.Labels)
	if err != nil {
		return authorityIndex{}, fmt.Errorf("pull-request lifecycle status policy: %w", err)
	}
	managed := make(map[string]string, len(authorities.Labels.Labels))
	classes := map[string]int{"type:": 0, "severity:": 0, "status:": 0, "area:": 0}
	for _, label := range authorities.Labels.Labels {
		name := strings.ToLower(label.Name)
		if _, duplicate := managed[name]; duplicate || strings.TrimSpace(label.Name) != label.Name {
			return authorityIndex{}, fmt.Errorf("managed label identity %q is invalid or repeated", label.Name)
		}
		managed[name] = label.Name
		for prefix := range classes {
			if strings.HasPrefix(name, prefix) {
				classes[prefix]++
			}
		}
	}
	for _, prefix := range []string{"type:", "severity:", "status:", "area:"} {
		if classes[prefix] == 0 {
			return authorityIndex{}, fmt.Errorf("managed label manifest has no %s classification", prefix)
		}
	}
	milestoneIDs := make(map[string]struct{}, len(authorities.Milestones.Milestones))
	for _, milestone := range authorities.Milestones.Milestones {
		if milestone.ID == "" {
			return authorityIndex{}, errors.New("managed milestone identity is empty")
		}
		milestoneIDs[milestone.ID] = struct{}{}
	}
	if !repositoryPattern.MatchString(authorities.Issues.Repository) {
		return authorityIndex{}, errors.New("issue assignments require an explicit owner/repository identity")
	}
	assignments := make(map[int]string, len(authorities.Issues.Assignments))
	for _, assignment := range authorities.Issues.Assignments {
		if assignment.Issue < 1 || assignment.Issue > maximumNumber {
			return authorityIndex{}, fmt.Errorf("managed issue number %d is invalid", assignment.Issue)
		}
		if _, exists := assignments[assignment.Issue]; exists {
			return authorityIndex{}, fmt.Errorf("managed issue %d is repeated", assignment.Issue)
		}
		if _, exists := milestoneIDs[assignment.Milestone]; !exists {
			return authorityIndex{}, fmt.Errorf("managed issue %d maps to unknown milestone %s", assignment.Issue, assignment.Milestone)
		}
		assignments[assignment.Issue] = assignment.Milestone
	}
	if len(assignments) == 0 {
		return authorityIndex{}, errors.New("issue assignment authority is empty")
	}
	return authorityIndex{managed: managed, assignments: assignments, statuses: statusPolicy}, nil
}

func referencedManagedIssue(body string, assignments map[int]string) (int, string) {
	matches := referencePattern.FindAllStringSubmatch(body, -1)
	managed := make(map[int]struct{})
	for _, match := range matches {
		number, err := strconv.Atoi(match[1])
		if err == nil && number <= maximumNumber {
			if _, exists := assignments[number]; exists {
				managed[number] = struct{}{}
			}
		}
	}
	if len(managed) == 0 {
		return 0, "no explicit managed issue reference"
	}
	if len(managed) != 1 {
		return 0, "multiple explicit managed issue references"
	}
	for number := range managed {
		return number, ""
	}
	panic("unreachable")
}

func desiredMetadata(
	pull remoteItem,
	issue remoteItem,
	issueNumber int,
	index authorityIndex,
	milestones MilestoneInventory,
) ([]string, int, error) {
	if issue.State != "open" {
		return nil, 0, fmt.Errorf("referenced managed issue %d is not open", issueNumber)
	}
	title := titlePattern.FindStringSubmatch(pull.Title)
	if title == nil {
		return nil, 0, errors.New("pull-request title must begin with a supported Conventional Commit type")
	}
	typeLabel := "type:" + title[1]
	managedType, exists := index.managed[typeLabel]
	if !exists {
		return nil, 0, fmt.Errorf("pull-request title type %q has no managed label", title[1])
	}
	issueClasses, err := classify(issue.Labels, index.managed, index.statuses)
	if err != nil {
		return nil, 0, fmt.Errorf("referenced managed issue %d: %w", issueNumber, err)
	}
	milestoneID := index.assignments[issueNumber]
	milestone, ok := milestones.Number(milestoneID)
	if !ok || milestone < 1 {
		return nil, 0, fmt.Errorf("managed milestone %s lacks a verified numeric identity", milestoneID)
	}
	if issue.Milestone == nil || issue.Milestone.Number != milestone {
		return nil, 0, fmt.Errorf("referenced managed issue %d does not carry milestone %s", issueNumber, milestoneID)
	}

	desired := make(map[string]string)
	for _, label := range pull.Labels {
		name := strings.ToLower(label.Name)
		managedName, isManaged := index.managed[name]
		if isManaged && strings.HasPrefix(name, "area:") {
			desired[name] = managedName
		}
	}
	desired[typeLabel] = managedType
	desired[strings.ToLower(issueClasses.severity)] = issueClasses.severity
	desired[strings.ToLower(issueClasses.status)] = issueClasses.status
	for _, area := range issueClasses.areas {
		desired[strings.ToLower(area)] = area
	}
	labels := make([]string, 0, len(desired))
	for _, label := range desired {
		labels = append(labels, label)
	}
	sort.Strings(labels)
	if len(labels) > maximumLabels {
		return nil, 0, fmt.Errorf("projected pull-request labels exceed %d entries", maximumLabels)
	}
	return labels, milestone, nil
}

func isClassification(name string) bool {
	return strings.HasPrefix(name, "type:") || strings.HasPrefix(name, "severity:") ||
		strings.HasPrefix(name, "status:") || strings.HasPrefix(name, "area:")
}

type classifications struct {
	severity string
	status   string
	areas    []string
}

func classify(
	labels []remoteLabel,
	managed map[string]string,
	statusPolicy githubissuelifecycle.Policy,
) (classifications, error) {
	counts := map[string]int{"type:": 0, "severity:": 0, "status:": 0, "area:": 0}
	result := classifications{}
	seen := make(map[string]struct{}, len(labels))
	for _, label := range labels {
		name := strings.ToLower(label.Name)
		canonical, isManaged := managed[name]
		if _, duplicate := seen[name]; duplicate || strings.TrimSpace(label.Name) != label.Name {
			return classifications{}, fmt.Errorf("label %q is invalid or repeated", label.Name)
		}
		seen[name] = struct{}{}
		if strings.HasPrefix(name, "status:") && !isManaged {
			return classifications{}, fmt.Errorf("unknown status-prefixed label %q", label.Name)
		}
		if !isManaged {
			continue
		}
		for prefix := range counts {
			if strings.HasPrefix(name, prefix) {
				counts[prefix]++
				switch prefix {
				case "severity:":
					result.severity = canonical
				case "status:":
					result.status = canonical
				case "area:":
					result.areas = append(result.areas, canonical)
				}
			}
		}
	}
	if counts["type:"] != 1 || counts["severity:"] != 1 || counts["status:"] != 1 || counts["area:"] < 1 {
		return classifications{}, errors.New("requires exactly one managed type, severity, and status label plus at least one managed area")
	}
	if !statusPolicy.IsActiveStatus(result.status) {
		return classifications{}, errors.New("requires one active managed status; status:wontfix cannot drive an open pull request")
	}
	return result, nil
}

func validateOptions(client HTTPClient, options Options, repository string) (*url.URL, error) {
	if client == nil || options.Token == "" || !repositoryPattern.MatchString(options.Repository) ||
		options.Repository != repository || options.PullRequest < 1 || options.PullRequest > maximumNumber {
		return nil, errors.New("pull-request metadata requires a client, matching owner/repository, token, and pull-request number")
	}
	if err := validateEvent(options.Event); err != nil {
		return nil, err
	}
	apiBase := strings.TrimSuffix(options.APIBase, "/")
	if apiBase == "" {
		apiBase = defaultAPIBase
	}
	base, err := url.Parse(apiBase)
	if err != nil || base.Scheme == "" || base.Host == "" || base.User != nil || base.RawQuery != "" || base.Fragment != "" {
		return nil, errors.New("pull-request metadata API base is invalid")
	}
	return base, nil
}

func validateEvent(event Event) error {
	switch event.Action {
	case Opened, Edited, Synchronize, Reopened:
		if event.Merged {
			return errors.New("open pull-request metadata events cannot carry merged=true")
		}
	case Closed:
	default:
		return fmt.Errorf("unsupported pull-request metadata event action %q", event.Action)
	}
	return nil
}

func inspectItem(
	ctx context.Context,
	client HTTPClient,
	base *url.URL,
	options Options,
	number int,
	wantPull bool,
	wantState string,
) (remoteItem, error) {
	request, err := newRequest(ctx, base, options, http.MethodGet, number, nil)
	if err != nil {
		return remoteItem{}, err
	}
	response, err := client.Do(request)
	if err != nil {
		return remoteItem{}, fmt.Errorf("inspect GitHub item %d: %w", number, err)
	}
	return decodeItem(response, number, wantPull, wantState, "inspect")
}

func inspectMergeState(
	ctx context.Context,
	client HTTPClient,
	base *url.URL,
	options Options,
) (bool, error) {
	target := *base
	target.Path = strings.TrimSuffix(base.Path, "/") + "/repos/" + options.Repository +
		"/pulls/" + strconv.Itoa(options.PullRequest) + "/merge"
	target.RawPath = ""
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, target.String(), nil)
	if err != nil {
		return false, fmt.Errorf("construct GitHub pull-request merge-state request: %w", err)
	}
	request.Header.Set("Accept", "application/vnd.github+json")
	request.Header.Set("Authorization", "Bearer "+options.Token)
	request.Header.Set("X-GitHub-Api-Version", apiVersion)
	request.Header.Set("User-Agent", "20w-github-pr-metadata")
	response, err := client.Do(request)
	if err != nil {
		return false, fmt.Errorf("inspect GitHub pull-request merge state: %w", err)
	}
	if response == nil || response.Body == nil {
		return false, errors.New("inspect GitHub pull-request merge state: empty HTTP response")
	}
	defer response.Body.Close()
	if err := drainBounded(response.Body); err != nil {
		return false, fmt.Errorf("inspect GitHub pull-request merge state: %w", err)
	}
	switch response.StatusCode {
	case http.StatusNoContent:
		return true, nil
	case http.StatusNotFound:
		return false, nil
	default:
		return false, fmt.Errorf("inspect GitHub pull-request merge state: unexpected HTTP status %d", response.StatusCode)
	}
}

func convergePull(
	ctx context.Context,
	client HTTPClient,
	base *url.URL,
	options Options,
	current remoteItem,
	desired []string,
	milestone int,
	retained *retentionGuard,
) (bool, error) {
	add, remove := classificationDelta(current.Labels, desired)
	attempted := false
	if len(add) > 0 {
		attempted = true
		labels, err := addLabels(ctx, client, base, options, add)
		if err != nil {
			return attempted, err
		}
		if err := retained.observe(labels); err != nil {
			return attempted, fmt.Errorf("add GitHub pull-request labels: %w", err)
		}
		for _, label := range add {
			if !containsRemoteLabel(labels, label) {
				return attempted, fmt.Errorf("add GitHub pull-request labels: mutation response omitted %q", label)
			}
		}
	}
	for _, label := range remove {
		attempted = true
		labels, err := removeLabel(ctx, client, base, options, label)
		if err != nil {
			return attempted, err
		}
		if containsRemoteLabel(labels, label) {
			return attempted, fmt.Errorf("remove GitHub pull-request label %q: mutation response retained the label", label)
		}
		if err := retained.observe(labels); err != nil {
			return attempted, fmt.Errorf("remove GitHub pull-request label %q: %w", label, err)
		}
	}
	if milestoneNumber(current) != milestone {
		attempted = true
		if err := updateMilestone(ctx, client, base, options, milestone, observeIdentity(current), retained); err != nil {
			return attempted, err
		}
	}
	return attempted, nil
}

func classificationDelta(current []remoteLabel, desired []string) ([]string, []string) {
	desiredSet := make(map[string]string, len(desired))
	for _, label := range desired {
		desiredSet[strings.ToLower(label)] = label
	}
	currentSet := make(map[string]string, len(current))
	for _, label := range current {
		name := strings.ToLower(label.Name)
		if isClassification(name) {
			currentSet[name] = label.Name
		}
	}
	add := make([]string, 0, len(desiredSet))
	for name, label := range desiredSet {
		if _, exists := currentSet[name]; !exists {
			add = append(add, label)
		}
	}
	remove := make([]string, 0, len(currentSet))
	for name, label := range currentSet {
		if _, exists := desiredSet[name]; !exists {
			remove = append(remove, label)
		}
	}
	sort.Strings(add)
	sort.Strings(remove)
	return add, remove
}

func classifyStatusLabels(
	labels []remoteLabel,
	policy githubissuelifecycle.Policy,
) ([]string, []string, error) {
	normalized, err := normalizedLabels(labels)
	if err != nil {
		return nil, nil, err
	}
	statuses := make([]string, 0, len(normalized))
	nonStatus := make([]string, 0, len(normalized))
	for _, name := range normalized {
		if !strings.HasPrefix(name, "status:") {
			nonStatus = append(nonStatus, name)
			continue
		}
		canonical, managed := policy.ManagedStatus(name)
		if !managed {
			return nil, nil, fmt.Errorf("unknown status-prefixed label %q", name)
		}
		statuses = append(statuses, canonical)
	}
	sort.Slice(statuses, func(left, right int) bool {
		return strings.ToLower(statuses[left]) < strings.ToLower(statuses[right])
	})
	return statuses, nonStatus, nil
}

func closedStatuses(statuses []string, policy githubissuelifecycle.Policy, merged bool) []string {
	if merged {
		return nil
	}
	wontfix := policy.WontfixStatus()
	for _, status := range statuses {
		if strings.EqualFold(status, wontfix) {
			return []string{wontfix}
		}
	}
	return nil
}

func convergeClosedStatuses(
	ctx context.Context,
	client HTTPClient,
	base *url.URL,
	options Options,
	policy githubissuelifecycle.Policy,
	current remoteItem,
	desired []string,
	retained *retentionGuard,
) (bool, error) {
	statuses, _, err := classifyStatusLabels(current.Labels, policy)
	if err != nil {
		return false, err
	}
	desiredSet := foldedSet(desired)
	remove := make([]string, 0, len(statuses))
	for _, status := range statuses {
		if _, keep := desiredSet[strings.ToLower(status)]; !keep {
			remove = append(remove, status)
		}
	}
	sort.Slice(remove, func(left, right int) bool {
		return strings.ToLower(remove[left]) < strings.ToLower(remove[right])
	})
	attempted := false
	for _, status := range remove {
		attempted = true
		labels, removeErr := removeLabel(ctx, client, base, options, status)
		if removeErr != nil {
			return attempted, removeErr
		}
		if containsRemoteLabel(labels, status) {
			return attempted, fmt.Errorf("remove GitHub pull-request lifecycle status %q: mutation response retained the label", status)
		}
		if err := retained.observe(labels); err != nil {
			return attempted, fmt.Errorf("remove GitHub pull-request lifecycle status %q: %w", status, err)
		}
		responseStatuses, _, classifyErr := classifyStatusLabels(labels, policy)
		if classifyErr != nil {
			return attempted, fmt.Errorf("remove GitHub pull-request lifecycle status %q: %w", status, classifyErr)
		}
		for _, wanted := range desired {
			if !containsFolded(responseStatuses, wanted) {
				return attempted, fmt.Errorf("remove GitHub pull-request lifecycle status %q: mutation response lost retained status %q", status, wanted)
			}
		}
	}
	return attempted, nil
}

func unownedClassificationLabels(labels []remoteLabel) []string {
	normalized, _ := normalizedLabels(labels)
	retained := make([]string, 0, len(normalized))
	for _, name := range normalized {
		if !isClassification(name) {
			retained = append(retained, name)
		}
	}
	return retained
}

func retainLabels(labels []remoteLabel, retained []string) error {
	normalized, err := normalizedLabels(labels)
	if err != nil {
		return err
	}
	current := foldedSet(normalized)
	for _, label := range retained {
		if _, exists := current[strings.ToLower(label)]; !exists {
			return fmt.Errorf("retained label %q was lost", label)
		}
	}
	return nil
}

func foldedSet(values []string) map[string]struct{} {
	result := make(map[string]struct{}, len(values))
	for _, value := range values {
		result[strings.ToLower(value)] = struct{}{}
	}
	return result
}

func equalFolded(left, right []string) bool {
	leftSet := foldedSet(left)
	rightSet := foldedSet(right)
	if len(leftSet) != len(rightSet) {
		return false
	}
	for name := range leftSet {
		if _, exists := rightSet[name]; !exists {
			return false
		}
	}
	return true
}

func containsFolded(values []string, wanted string) bool {
	for _, value := range values {
		if strings.EqualFold(value, wanted) {
			return true
		}
	}
	return false
}

func containsRemoteLabel(labels []remoteLabel, wanted string) bool {
	for _, label := range labels {
		if strings.EqualFold(label.Name, wanted) {
			return true
		}
	}
	return false
}

func addLabels(
	ctx context.Context,
	client HTTPClient,
	base *url.URL,
	options Options,
	labels []string,
) ([]remoteLabel, error) {
	body, err := json.Marshal(labelsPayload{Labels: labels})
	if err != nil {
		return nil, fmt.Errorf("encode pull-request label additions: %w", err)
	}
	request, err := newRequest(ctx, base, options, http.MethodPost, options.PullRequest, body, "labels")
	if err != nil {
		return nil, err
	}
	response, err := client.Do(request)
	if err != nil {
		return nil, fmt.Errorf("add GitHub pull-request labels: %w", err)
	}
	return decodeLabelMutation(response, options.PullRequest, "add")
}

func removeLabel(
	ctx context.Context,
	client HTTPClient,
	base *url.URL,
	options Options,
	label string,
) ([]remoteLabel, error) {
	request, err := newRequest(ctx, base, options, http.MethodDelete, options.PullRequest, nil, "labels", label)
	if err != nil {
		return nil, err
	}
	response, err := client.Do(request)
	if err != nil {
		return nil, fmt.Errorf("remove GitHub pull-request label %q: %w", label, err)
	}
	return decodeLabelMutation(response, options.PullRequest, "remove")
}

func updateMilestone(
	ctx context.Context,
	client HTTPClient,
	base *url.URL,
	options Options,
	milestone int,
	expected itemIdentity,
	retained *retentionGuard,
) error {
	body, err := json.Marshal(milestonePayload{Milestone: milestone})
	if err != nil {
		return fmt.Errorf("encode pull-request milestone: %w", err)
	}
	request, err := newRequest(ctx, base, options, http.MethodPatch, options.PullRequest, body)
	if err != nil {
		return err
	}
	response, err := client.Do(request)
	if err != nil {
		return fmt.Errorf("update GitHub pull-request milestone: %w", err)
	}
	item, err := decodeItem(response, options.PullRequest, true, "open", "update milestone on")
	if err != nil {
		return err
	}
	if observeIdentity(item) != expected {
		return errors.New("update GitHub pull-request milestone: response identity changed")
	}
	if err := retained.observe(item.Labels); err != nil {
		return fmt.Errorf("update GitHub pull-request milestone: %w", err)
	}
	return nil
}

func newRequest(
	ctx context.Context,
	base *url.URL,
	options Options,
	method string,
	number int,
	body []byte,
	suffix ...string,
) (*http.Request, error) {
	target := *base
	prefix := strings.TrimSuffix(base.Path, "/") + "/repos/" + options.Repository + "/issues/" + strconv.Itoa(number)
	target.Path = prefix
	target.RawPath = ""
	if len(suffix) > 0 {
		target.RawPath = escapedPath(prefix)
		for _, segment := range suffix {
			target.Path += "/" + segment
			target.RawPath += "/" + url.PathEscape(segment)
		}
	}
	request, err := http.NewRequestWithContext(ctx, method, target.String(), bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("create GitHub metadata request: %w", err)
	}
	request.Header.Set("Accept", "application/vnd.github+json")
	request.Header.Set("Authorization", "Bearer "+options.Token)
	request.Header.Set("X-GitHub-Api-Version", apiVersion)
	request.Header.Set("User-Agent", "20w-github-pr-metadata")
	if body != nil {
		request.Header.Set("Content-Type", "application/json")
	}
	return request, nil
}

func escapedPath(path string) string {
	segments := strings.Split(path, "/")
	for index, segment := range segments {
		segments[index] = url.PathEscape(segment)
	}
	return strings.Join(segments, "/")
}

func decodeLabelMutation(response *http.Response, number int, operation string) ([]remoteLabel, error) {
	if response == nil || response.Body == nil {
		return nil, fmt.Errorf("%s GitHub pull-request labels %d: empty HTTP response", operation, number)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		_, err := io.Copy(io.Discard, io.LimitReader(response.Body, maximumResponseBytes+1))
		if err != nil {
			return nil, fmt.Errorf("%s GitHub pull-request labels %d: drain response: %w", operation, number, err)
		}
		return nil, fmt.Errorf("%s GitHub pull-request labels %d: unexpected HTTP status %d", operation, number, response.StatusCode)
	}
	body, err := io.ReadAll(io.LimitReader(response.Body, maximumResponseBytes+1))
	if err != nil || len(body) > maximumResponseBytes {
		return nil, fmt.Errorf("%s GitHub pull-request labels %d: response exceeds its bounded readable form", operation, number)
	}
	var labels []remoteLabel
	if err := json.Unmarshal(body, &labels); err != nil || labels == nil || len(labels) > maximumLabels {
		return nil, fmt.Errorf("%s GitHub pull-request labels %d: malformed response", operation, number)
	}
	if _, err := normalizedLabels(labels); err != nil {
		return nil, fmt.Errorf("%s GitHub pull-request labels %d: %w", operation, number, err)
	}
	return labels, nil
}

func decodeItem(response *http.Response, number int, wantPull bool, wantState, operation string) (remoteItem, error) {
	if response == nil || response.Body == nil {
		return remoteItem{}, fmt.Errorf("%s GitHub item %d: empty HTTP response", operation, number)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		_, err := io.Copy(io.Discard, io.LimitReader(response.Body, maximumResponseBytes+1))
		if err != nil {
			return remoteItem{}, fmt.Errorf("%s GitHub item %d: drain response: %w", operation, number, err)
		}
		return remoteItem{}, fmt.Errorf("%s GitHub item %d: unexpected HTTP status %d", operation, number, response.StatusCode)
	}
	body, err := io.ReadAll(io.LimitReader(response.Body, maximumResponseBytes+1))
	if err != nil || len(body) > maximumResponseBytes {
		return remoteItem{}, fmt.Errorf("%s GitHub item %d: response exceeds its bounded readable form", operation, number)
	}
	var item remoteItem
	if err := json.Unmarshal(body, &item); err != nil {
		return remoteItem{}, fmt.Errorf("%s GitHub item %d: decode response: %w", operation, number, err)
	}
	bodyLength := len(bodyText(item))
	if item.Number != number || item.NodeID == "" || item.State != wantState || item.Title == "" ||
		bodyLength > maximumBodyBytes || item.Labels == nil || len(item.Labels) > maximumLabels ||
		(item.Milestone != nil && item.Milestone.Number < 1) || (item.PullRequest != nil) != wantPull {
		return remoteItem{}, fmt.Errorf("%s GitHub item %d: malformed, unexpected state, or wrong item kind", operation, number)
	}
	if _, err := normalizedLabels(item.Labels); err != nil {
		return remoteItem{}, fmt.Errorf("%s GitHub item %d: %w", operation, number, err)
	}
	return item, nil
}

func bodyText(item remoteItem) string {
	if item.Body == nil {
		return ""
	}
	return *item.Body
}

func observe(item remoteItem) observation {
	milestone := 0
	if item.Milestone != nil {
		milestone = item.Milestone.Number
	}
	labels, _ := normalizedLabels(item.Labels)
	return observation{
		nodeID: item.NodeID, state: item.State, title: item.Title, body: bodyText(item),
		milestone: milestone, labels: strings.Join(labels, "\x00"),
	}
}

func normalizedLabels(labels []remoteLabel) ([]string, error) {
	names := make([]string, 0, len(labels))
	seen := make(map[string]struct{}, len(labels))
	for _, label := range labels {
		name := strings.ToLower(label.Name)
		if name == "" || len(label.Name) > 256 || strings.TrimSpace(label.Name) != label.Name ||
			strings.ContainsRune(label.Name, '\x00') {
			return nil, fmt.Errorf("label %q is invalid", label.Name)
		}
		if _, duplicate := seen[name]; duplicate {
			return nil, fmt.Errorf("label %q is repeated", label.Name)
		}
		seen[name] = struct{}{}
		names = append(names, name)
	}
	sort.Strings(names)
	return names, nil
}

func equalOwnedMetadata(item remoteItem, labels []string, milestone int) bool {
	current := make([]string, 0, len(item.Labels))
	for _, label := range item.Labels {
		name := strings.ToLower(label.Name)
		if isClassification(name) {
			current = append(current, name)
		}
	}
	desired := make([]string, len(labels))
	for index, label := range labels {
		desired[index] = strings.ToLower(label)
	}
	sort.Strings(current)
	sort.Strings(desired)
	return milestoneNumber(item) == milestone && strings.Join(current, "\x00") == strings.Join(desired, "\x00")
}

func milestoneNumber(item remoteItem) int {
	if item.Milestone == nil {
		return 0
	}
	return item.Milestone.Number
}

func displayLabels(labels []remoteLabel) []string {
	names := make([]string, len(labels))
	for index, label := range labels {
		names[index] = label.Name
	}
	sort.Slice(names, func(left, right int) bool {
		return strings.ToLower(names[left]) < strings.ToLower(names[right])
	})
	return names
}

type itemIdentity struct {
	nodeID string
	state  string
	title  string
	body   string
}

func observeIdentity(item remoteItem) itemIdentity {
	return itemIdentity{nodeID: item.NodeID, state: item.State, title: item.Title, body: bodyText(item)}
}

func drainBounded(reader io.Reader) error {
	written, err := io.Copy(io.Discard, io.LimitReader(reader, maximumResponseBytes+1))
	if err != nil {
		return err
	}
	if written > maximumResponseBytes {
		return errors.New("GitHub pull-request response exceeds its byte limit")
	}
	return nil
}
