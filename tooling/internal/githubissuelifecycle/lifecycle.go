// Package githubissuelifecycle reconciles the managed status labels of
// repository-mapped GitHub issues without changing any other label class.
package githubissuelifecycle

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

	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/githubissuemilestones"
	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/githublabels"
)

const (
	defaultAPIBase       = "https://api.github.com"
	apiVersion           = "2026-03-10"
	maximumResponseBytes = 1 << 20
	maximumLabels        = 128
	maximumIssues        = 256
	maximumNumber        = 1_000_000_000
)

var repositoryPattern = regexp.MustCompile(`^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$`)

const (
	needsTriageLabel = "status:needs-triage"
	blockedLabel     = "status:blocked"
	inProgressLabel  = "status:in-progress"
	waitingLabel     = "status:waiting-on-author"
	wontfixLabel     = "status:wontfix"
)

// Action is one admitted issue lifecycle transition.
type Action string

const (
	// Closed removes active status labels while preserving an existing wontfix.
	Closed Action = "closed"
	// Reopened replaces every managed status with needs-triage.
	Reopened Action = "reopened"
)

// Event optionally binds synchronization to one GitHub issue transition.
type Event struct {
	Issue  int
	Action Action
}

// NewEvent validates the paired command-line event fields. Zero and empty
// together select ordinary drift repair without a transition override.
func NewEvent(issue int, action string) (Event, error) {
	if issue == 0 && action == "" {
		return Event{}, nil
	}
	event := Event{Issue: issue, Action: Action(action)}
	if issue < 1 || issue > maximumNumber || (event.Action != Closed && event.Action != Reopened) {
		return Event{}, errors.New("issue lifecycle event requires a positive issue and action closed or reopened")
	}
	return event, nil
}

// Policy is the closed managed-status vocabulary derived from labels.json.
// Its fields remain private so a caller cannot bypass manifest validation.
type Policy struct {
	managed map[string]string
	active  map[string]struct{}
}

// ManagedStatus resolves one status-prefixed label against the exact reviewed
// lifecycle vocabulary. The boolean is false for both non-status labels and
// unknown status meanings.
func (policy Policy) ManagedStatus(name string) (string, bool) {
	canonical, ok := policy.managed[strings.ToLower(name)]
	return canonical, ok
}

// IsActiveStatus reports whether name is one of the four lifecycle statuses
// that must not survive closure or merge.
func (policy Policy) IsActiveStatus(name string) bool {
	_, ok := policy.active[strings.ToLower(name)]
	return ok
}

// WontfixStatus returns the canonical deliberately-closed status identity.
func (policy Policy) WontfixStatus() string {
	return policy.managed[wontfixLabel]
}

// ManagedStatuses returns a sorted copy of the complete status vocabulary.
// Callers use it to construct bounded remote queries without gaining mutation
// access to the policy maps.
func (policy Policy) ManagedStatuses() []string {
	statuses := make([]string, 0, len(policy.managed))
	for _, status := range policy.managed {
		statuses = append(statuses, status)
	}
	sort.Strings(statuses)
	return statuses
}

// NewPolicy extracts the exact lifecycle vocabulary from the managed label
// manifest. A new status meaning must first extend this explicit policy.
func NewPolicy(manifest githublabels.Manifest) (Policy, error) {
	if manifest.Schema != 1 {
		return Policy{}, errors.New("issue lifecycle requires label manifest schema 1")
	}
	managed := make(map[string]string)
	for _, label := range manifest.Labels {
		name := strings.ToLower(label.Name)
		if !strings.HasPrefix(name, "status:") {
			continue
		}
		if label.Name != name || strings.TrimSpace(label.Name) != label.Name {
			return Policy{}, fmt.Errorf("managed status label %q is not canonical", label.Name)
		}
		if _, duplicate := managed[name]; duplicate {
			return Policy{}, fmt.Errorf("managed status label %q is repeated", label.Name)
		}
		managed[name] = label.Name
	}
	required := []string{needsTriageLabel, blockedLabel, inProgressLabel, waitingLabel, wontfixLabel}
	if len(managed) != len(required) {
		return Policy{}, errors.New("issue lifecycle requires exactly the five reviewed managed status labels")
	}
	for _, name := range required {
		if _, exists := managed[name]; !exists {
			return Policy{}, fmt.Errorf("issue lifecycle is missing managed label %s", name)
		}
	}
	active := make(map[string]struct{}, len(required)-1)
	for _, name := range required[:len(required)-1] {
		active[name] = struct{}{}
	}
	return Policy{managed: managed, active: active}, nil
}

// Options binds a lifecycle synchronization to one repository and API.
type Options struct {
	APIBase    string
	Repository string
	Token      string
}

// HTTPClient is the smallest transport surface required by synchronization.
type HTTPClient interface {
	Do(*http.Request) (*http.Response, error)
}

// Result counts mapped issues whose managed status changed or was already
// correct. EventSkipped is true only for a valid event on an unmapped issue.
type Result struct {
	Updated      int
	Unchanged    int
	EventSkipped bool
}

// Plan is an immutable lifecycle repair admitted by a complete read-only
// inventory of every mapped issue.
type Plan struct {
	repository   string
	apiBase      string
	policy       Policy
	entries      []plannedIssue
	eventSkipped bool
}

type remoteLabel struct {
	Name string `json:"name"`
}

type remoteMilestone struct {
	Number int `json:"number"`
}

type remoteIssue struct {
	Number      int              `json:"number"`
	NodeID      string           `json:"node_id"`
	State       string           `json:"state"`
	Labels      []remoteLabel    `json:"labels"`
	Milestone   *remoteMilestone `json:"milestone"`
	PullRequest *json.RawMessage `json:"pull_request"`
}

type observation struct {
	nodeID    string
	state     string
	milestone int
	labels    string
}

type plannedIssue struct {
	number          int
	observed        observation
	labels          []remoteLabel
	desiredStatuses []string
	nonStatus       []string
}

type labelsPayload struct {
	Labels []string `json:"labels"`
}

// Preflight validates the authorities and reads every mapped issue before a
// caller performs any metadata write. Ordinary runs repair closed-issue drift;
// an admitted reopened event additionally resets its mapped issue to triage.
func Preflight(
	ctx context.Context,
	client HTTPClient,
	mapping githubissuemilestones.Manifest,
	policy Policy,
	options Options,
	event Event,
) (Plan, error) {
	if err := validateMapping(mapping); err != nil {
		return Plan{}, err
	}
	if err := validatePolicy(policy); err != nil {
		return Plan{}, err
	}
	base, err := validateOptions(client, options, mapping.Repository)
	if err != nil {
		return Plan{}, err
	}
	if _, err := NewEvent(event.Issue, string(event.Action)); err != nil {
		return Plan{}, err
	}
	mappedEvent := false
	plan := Plan{
		repository: options.Repository,
		apiBase:    base.String(),
		policy:     policy,
		entries:    make([]plannedIssue, 0, len(mapping.Assignments)),
	}
	for _, assignment := range mapping.Assignments {
		issue, err := inspectIssue(ctx, client, base, options, assignment.Issue)
		if err != nil {
			return Plan{}, err
		}
		transition := Action("")
		if event.Issue == assignment.Issue {
			transition = event.Action
			mappedEvent = true
		}
		desired, nonStatus, err := desiredStatuses(issue, policy, transition)
		if err != nil {
			return Plan{}, fmt.Errorf("GitHub issue %d: %w", assignment.Issue, err)
		}
		plan.entries = append(plan.entries, plannedIssue{
			number: assignment.Issue, observed: observe(issue), labels: issue.Labels,
			desiredStatuses: desired, nonStatus: nonStatus,
		})
	}
	plan.eventSkipped = event.Issue != 0 && !mappedEvent
	return plan, nil
}

// Apply confirms the complete preflight inventory, then changes only managed
// status labels. Each label mutation is validated and safe to resume from a
// fresh preflight after a partial transport failure.
func (plan Plan) Apply(ctx context.Context, client HTTPClient, options Options) (Result, error) {
	base, err := validatePlanOptions(client, options, plan.repository, plan.apiBase)
	if err != nil {
		return Result{}, err
	}
	for _, entry := range plan.entries {
		issue, err := inspectIssue(ctx, client, base, options, entry.number)
		if err != nil {
			return Result{}, err
		}
		if observe(issue) != entry.observed {
			return Result{}, fmt.Errorf("GitHub issue %d changed after the complete lifecycle preflight", entry.number)
		}
	}
	result := Result{EventSkipped: plan.eventSkipped}
	for _, entry := range plan.entries {
		changed, err := applyIssue(ctx, client, base, options, plan.policy, entry)
		if err != nil {
			return Result{}, err
		}
		if changed {
			result.Updated++
		} else {
			result.Unchanged++
		}
	}
	return result, nil
}

// Verify performs one bounded readback of every mapped issue and checks its
// exact managed status plus retention of every preflighted non-status label.
func (plan Plan) Verify(ctx context.Context, client HTTPClient, options Options) error {
	return plan.verify(ctx, client, options, true)
}

// VerifyLabels repeats identity and label readback while deliberately leaving
// the milestone to a later assignment owner. Full metadata synchronization
// uses it after its separately verified milestone patch.
func (plan Plan) VerifyLabels(ctx context.Context, client HTTPClient, options Options) error {
	return plan.verify(ctx, client, options, false)
}

func (plan Plan) verify(ctx context.Context, client HTTPClient, options Options, verifyMilestone bool) error {
	base, err := validatePlanOptions(client, options, plan.repository, plan.apiBase)
	if err != nil {
		return err
	}
	for _, entry := range plan.entries {
		issue, err := inspectIssue(ctx, client, base, options, entry.number)
		if err != nil {
			return err
		}
		current := observe(issue)
		if current.nodeID != entry.observed.nodeID || current.state != entry.observed.state ||
			(verifyMilestone && current.milestone != entry.observed.milestone) {
			return fmt.Errorf("GitHub issue %d identity changed during lifecycle synchronization", entry.number)
		}
		if err := verifyLabels(issue.Labels, plan.policy, entry.desiredStatuses, entry.nonStatus); err != nil {
			return fmt.Errorf("GitHub issue %d lifecycle readback: %w", entry.number, err)
		}
	}
	return nil
}

func applyIssue(
	ctx context.Context,
	client HTTPClient,
	base *url.URL,
	options Options,
	policy Policy,
	entry plannedIssue,
) (bool, error) {
	current := append([]remoteLabel(nil), entry.labels...)
	desired := stringSet(entry.desiredStatuses)
	statuses, _, err := classifyLabels(current, policy)
	if err != nil {
		return false, err
	}
	remove := make([]string, 0, len(statuses))
	for _, name := range statuses {
		if _, keep := desired[strings.ToLower(name)]; !keep {
			remove = append(remove, name)
		}
	}
	sort.Strings(remove)
	changed := false
	for _, name := range remove {
		current, err = mutateLabels(ctx, client, base, options, entry.number, http.MethodDelete, name, nil)
		if err != nil {
			return changed, err
		}
		changed = true
		if containsLabel(current, name) {
			return changed, fmt.Errorf("remove GitHub issue %d status %q: mutation response retained the label", entry.number, name)
		}
		if err := retainNonStatus(current, entry.nonStatus); err != nil {
			return changed, fmt.Errorf("remove GitHub issue %d status %q: %w", entry.number, name, err)
		}
	}
	if _, _, classifyErr := classifyLabels(current, policy); classifyErr != nil {
		return changed, classifyErr
	}
	if len(entry.desiredStatuses) == 1 && !containsLabel(current, entry.desiredStatuses[0]) {
		payload, encodeErr := json.Marshal(labelsPayload{Labels: entry.desiredStatuses})
		if encodeErr != nil {
			return changed, fmt.Errorf("encode GitHub issue %d status addition: %w", entry.number, encodeErr)
		}
		current, err = mutateLabels(ctx, client, base, options, entry.number, http.MethodPost, "", payload)
		if err != nil {
			return changed, err
		}
		changed = true
	}
	if err := verifyLabels(current, policy, entry.desiredStatuses, entry.nonStatus); err != nil {
		return changed, fmt.Errorf("GitHub issue %d lifecycle mutation: %w", entry.number, err)
	}
	return changed, nil
}

func desiredStatuses(issue remoteIssue, policy Policy, transition Action) ([]string, []string, error) {
	statuses, nonStatus, err := classifyLabels(issue.Labels, policy)
	if err != nil {
		return nil, nil, err
	}
	switch transition {
	case Closed:
		if issue.State != "closed" {
			return nil, nil, errors.New("closed event no longer matches remote issue state")
		}
	case Reopened:
		if issue.State != "open" {
			return nil, nil, errors.New("reopened event no longer matches remote issue state")
		}
		return []string{policy.managed[needsTriageLabel]}, nonStatus, nil
	case "":
	default:
		return nil, nil, fmt.Errorf("unsupported lifecycle action %q", transition)
	}
	if issue.State == "closed" {
		if containsFold(statuses, policy.managed[wontfixLabel]) {
			return []string{policy.managed[wontfixLabel]}, nonStatus, nil
		}
		return []string{}, nonStatus, nil
	}
	if issue.State != "open" {
		return nil, nil, fmt.Errorf("unsupported issue state %q", issue.State)
	}
	activeStatuses := make([]string, 0, len(statuses))
	for _, status := range statuses {
		if _, active := policy.active[strings.ToLower(status)]; active {
			activeStatuses = append(activeStatuses, status)
		}
	}
	switch len(activeStatuses) {
	case 0:
		// An open mapped issue with no active status has one deterministic
		// lifecycle repair. This also removes a lone stale wontfix left by a
		// close/reopen transition; it does not infer any substantive status.
		return []string{policy.managed[needsTriageLabel]}, nonStatus, nil
	case 1:
		// Preserve the one active status selected by maintainers and remove a
		// stale wontfix if it is also present.
		return append([]string(nil), activeStatuses...), nonStatus, nil
	default:
		return nil, nil, errors.New("open issue has multiple active managed status labels")
	}
}

func classifyLabels(labels []remoteLabel, policy Policy) ([]string, []string, error) {
	normalized, err := normalizedLabels(labels)
	if err != nil {
		return nil, nil, err
	}
	statuses := make([]string, 0, 2)
	nonStatus := make([]string, 0, len(normalized))
	for _, name := range normalized {
		if !strings.HasPrefix(name, "status:") {
			nonStatus = append(nonStatus, name)
			continue
		}
		canonical, managed := policy.managed[name]
		if !managed {
			return nil, nil, fmt.Errorf("unknown status-prefixed label %q", name)
		}
		statuses = append(statuses, canonical)
	}
	sort.Strings(statuses)
	return statuses, nonStatus, nil
}

func verifyLabels(labels []remoteLabel, policy Policy, desiredStatuses, retainedNonStatus []string) error {
	statuses, _, err := classifyLabels(labels, policy)
	if err != nil {
		return err
	}
	if strings.Join(lowerSorted(statuses), "\x00") != strings.Join(lowerSorted(desiredStatuses), "\x00") {
		return errors.New("managed status labels do not match the preflighted lifecycle state")
	}
	return retainNonStatus(labels, retainedNonStatus)
}

func retainNonStatus(labels []remoteLabel, required []string) error {
	current, err := normalizedLabels(labels)
	if err != nil {
		return err
	}
	available := stringSet(current)
	for _, name := range required {
		if _, retained := available[name]; !retained {
			return fmt.Errorf("non-status label %q was not preserved", name)
		}
	}
	return nil
}

func inspectIssue(ctx context.Context, client HTTPClient, base *url.URL, options Options, number int) (remoteIssue, error) {
	request, err := newRequest(ctx, base, options, http.MethodGet, number, "", nil)
	if err != nil {
		return remoteIssue{}, err
	}
	response, err := client.Do(request)
	if err != nil {
		return remoteIssue{}, fmt.Errorf("inspect GitHub issue %d lifecycle: %w", number, err)
	}
	if response == nil || response.Body == nil {
		return remoteIssue{}, fmt.Errorf("inspect GitHub issue %d lifecycle: empty HTTP response", number)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		if err := drainBounded(response.Body); err != nil {
			return remoteIssue{}, err
		}
		return remoteIssue{}, fmt.Errorf("inspect GitHub issue %d lifecycle: unexpected HTTP status %d", number, response.StatusCode)
	}
	body, err := io.ReadAll(io.LimitReader(response.Body, maximumResponseBytes+1))
	if err != nil || len(body) > maximumResponseBytes {
		return remoteIssue{}, fmt.Errorf("inspect GitHub issue %d lifecycle: response exceeds its bounded readable form", number)
	}
	var issue remoteIssue
	if err := json.Unmarshal(body, &issue); err != nil {
		return remoteIssue{}, fmt.Errorf("inspect GitHub issue %d lifecycle: decode response: %w", number, err)
	}
	if issue.Number != number || issue.NodeID == "" || (issue.State != "open" && issue.State != "closed") ||
		issue.PullRequest != nil || issue.Labels == nil || len(issue.Labels) > maximumLabels ||
		(issue.Milestone != nil && issue.Milestone.Number < 1) {
		return remoteIssue{}, fmt.Errorf("inspect GitHub issue %d lifecycle: malformed or pull-request identity", number)
	}
	if _, err := normalizedLabels(issue.Labels); err != nil {
		return remoteIssue{}, fmt.Errorf("inspect GitHub issue %d lifecycle: %w", number, err)
	}
	return issue, nil
}

func mutateLabels(
	ctx context.Context,
	client HTTPClient,
	base *url.URL,
	options Options,
	number int,
	method string,
	label string,
	body []byte,
) ([]remoteLabel, error) {
	request, err := newRequest(ctx, base, options, method, number, label, body)
	if err != nil {
		return nil, err
	}
	response, err := client.Do(request)
	if err != nil {
		return nil, fmt.Errorf("synchronize GitHub issue %d lifecycle labels: %w", number, err)
	}
	if response == nil || response.Body == nil {
		return nil, fmt.Errorf("synchronize GitHub issue %d lifecycle labels: empty HTTP response", number)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		if err := drainBounded(response.Body); err != nil {
			return nil, err
		}
		return nil, fmt.Errorf("synchronize GitHub issue %d lifecycle labels: unexpected HTTP status %d", number, response.StatusCode)
	}
	responseBody, err := io.ReadAll(io.LimitReader(response.Body, maximumResponseBytes+1))
	if err != nil || len(responseBody) > maximumResponseBytes {
		return nil, fmt.Errorf("synchronize GitHub issue %d lifecycle labels: response exceeds its bounded readable form", number)
	}
	var labels []remoteLabel
	if err := json.Unmarshal(responseBody, &labels); err != nil || labels == nil || len(labels) > maximumLabels {
		return nil, fmt.Errorf("synchronize GitHub issue %d lifecycle labels: malformed response", number)
	}
	if _, err := normalizedLabels(labels); err != nil {
		return nil, fmt.Errorf("synchronize GitHub issue %d lifecycle labels: %w", number, err)
	}
	return labels, nil
}

func newRequest(
	ctx context.Context,
	base *url.URL,
	options Options,
	method string,
	number int,
	label string,
	body []byte,
) (*http.Request, error) {
	target := *base
	prefix := strings.TrimSuffix(base.Path, "/") + "/repos/" + options.Repository + "/issues/" + strconv.Itoa(number)
	target.Path = prefix
	target.RawPath = ""
	if method != http.MethodGet {
		target.Path += "/labels"
		target.RawPath = escapedPath(prefix) + "/labels"
		if label != "" {
			target.Path += "/" + label
			target.RawPath += "/" + url.PathEscape(label)
		}
	}
	request, err := http.NewRequestWithContext(ctx, method, target.String(), bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("construct GitHub issue %d lifecycle request: %w", number, err)
	}
	request.Header.Set("Accept", "application/vnd.github+json")
	request.Header.Set("Authorization", "Bearer "+options.Token)
	request.Header.Set("User-Agent", "20w-issue-lifecycle-sync")
	request.Header.Set("X-GitHub-Api-Version", apiVersion)
	if body != nil {
		request.Header.Set("Content-Type", "application/json")
	}
	return request, nil
}

func validateMapping(mapping githubissuemilestones.Manifest) error {
	if mapping.Schema != 1 || !repositoryPattern.MatchString(mapping.Repository) {
		return errors.New("issue lifecycle requires a schema-1 repository-bound issue mapping")
	}
	if len(mapping.Assignments) == 0 || len(mapping.Assignments) > maximumIssues {
		return fmt.Errorf("issue lifecycle requires between 1 and %d mapped issues", maximumIssues)
	}
	previous := 0
	for _, assignment := range mapping.Assignments {
		if assignment.Issue <= previous || assignment.Issue > maximumNumber {
			return errors.New("issue lifecycle mapping requires unique, increasing issue numbers")
		}
		previous = assignment.Issue
	}
	return nil
}

func validatePolicy(policy Policy) error {
	if len(policy.managed) != 5 || len(policy.active) != 4 || policy.managed[needsTriageLabel] == "" ||
		policy.managed[wontfixLabel] == "" {
		return errors.New("issue lifecycle policy was not constructed from the managed label manifest")
	}
	return nil
}

func validateOptions(client HTTPClient, options Options, repository string) (*url.URL, error) {
	if client == nil || options.Token == "" || options.Repository != repository || !repositoryPattern.MatchString(repository) {
		return nil, errors.New("issue lifecycle requires a client, matching owner/repository, and token")
	}
	apiBase := strings.TrimSuffix(options.APIBase, "/")
	if apiBase == "" {
		apiBase = defaultAPIBase
	}
	base, err := url.Parse(apiBase)
	if err != nil || base.Scheme == "" || base.Host == "" || base.User != nil || base.RawQuery != "" || base.Fragment != "" {
		return nil, errors.New("issue lifecycle API base is invalid")
	}
	return base, nil
}

func validatePlanOptions(client HTTPClient, options Options, repository, apiBase string) (*url.URL, error) {
	base, err := validateOptions(client, options, repository)
	if err != nil {
		return nil, err
	}
	if options.Repository != repository || base.String() != apiBase {
		return nil, errors.New("issue lifecycle options changed after preflight")
	}
	return base, nil
}

func observe(issue remoteIssue) observation {
	milestone := 0
	if issue.Milestone != nil {
		milestone = issue.Milestone.Number
	}
	labels, _ := normalizedLabels(issue.Labels)
	return observation{
		nodeID: issue.NodeID, state: issue.State, milestone: milestone, labels: strings.Join(labels, "\x00"),
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

func lowerSorted(values []string) []string {
	result := make([]string, len(values))
	for index, value := range values {
		result[index] = strings.ToLower(value)
	}
	sort.Strings(result)
	return result
}

func stringSet(values []string) map[string]struct{} {
	result := make(map[string]struct{}, len(values))
	for _, value := range values {
		result[strings.ToLower(value)] = struct{}{}
	}
	return result
}

func containsLabel(labels []remoteLabel, wanted string) bool {
	for _, label := range labels {
		if strings.EqualFold(label.Name, wanted) {
			return true
		}
	}
	return false
}

func containsFold(values []string, wanted string) bool {
	for _, value := range values {
		if strings.EqualFold(value, wanted) {
			return true
		}
	}
	return false
}

func escapedPath(path string) string {
	segments := strings.Split(path, "/")
	for index, segment := range segments {
		segments[index] = url.PathEscape(segment)
	}
	return strings.Join(segments, "/")
}

func drainBounded(reader io.Reader) error {
	written, err := io.Copy(io.Discard, io.LimitReader(reader, maximumResponseBytes+1))
	if err != nil {
		return err
	}
	if written > maximumResponseBytes {
		return errors.New("GitHub lifecycle response exceeds its byte limit")
	}
	return nil
}
