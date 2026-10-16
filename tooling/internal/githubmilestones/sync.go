package githubmilestones

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
	"strconv"
	"strings"

	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/githubapi"
)

const (
	defaultAPIBase            = "https://api.github.com"
	apiVersion                = "2026-03-10"
	maximumResponseBytes      = 1 << 20
	maximumRemoteMilestones   = 256
	remoteMilestonesPerPage   = 100
	maximumRemoteRequestPages = 3
)

var (
	repositoryPattern = regexp.MustCompile(`^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$`)
	managedMarker     = regexp.MustCompile(`(?m)^<!-- 20w-roadmap-id:(M(?:[0-9]|1[0-5])) -->$`)
)

// Result reports only bounded mutations made by a synchronization.
type Result struct {
	Created   int
	Updated   int
	Unchanged int
}

// Plan is the immutable result of a complete read-only milestone inventory.
// Private fields prevent callers from manufacturing a remote write plan.
type Plan struct {
	manifest   Manifest
	repository string
	apiBase    string
	changes    []milestoneChange
	unchanged  int
}

type milestoneChange struct {
	number  int
	desired Milestone
}

// Inventory is a verified stable-ID to numeric GitHub milestone projection.
type Inventory struct {
	numbers map[string]int
}

// Number returns the verified numeric GitHub identity for one managed stage.
func (inventory Inventory) Number(id string) (int, bool) {
	number, ok := inventory.numbers[id]
	return number, ok
}

// Includes reports whether this preflight plan contains a committed milestone
// identity, including one that still needs to be created.
func (plan Plan) Includes(id string) bool {
	for _, milestone := range plan.manifest.Milestones {
		if milestone.ID == id {
			return true
		}
	}
	return false
}

// Options binds synchronization to one repository and authenticated API.
type Options struct {
	APIBase    string
	Repository string
	Token      string
}

// HTTPClient is the smallest client surface required by Sync.
type HTTPClient interface {
	Do(*http.Request) (*http.Response, error)
}

type remoteMilestone struct {
	Number      int     `json:"number"`
	State       string  `json:"state"`
	Title       string  `json:"title"`
	Description *string `json:"description"`
	DueOn       *string `json:"due_on"`
}

type milestonePayload struct {
	Title       string `json:"title"`
	State       string `json:"state"`
	Description string `json:"description"`
}

// Preflight reads the complete bounded milestone inventory and prepares exact
// managed changes without mutating GitHub. Unmarked milestones remain
// untouched. Existing due dates fail closed before any write.
func Preflight(ctx context.Context, client HTTPClient, manifest Manifest, options Options) (Plan, error) {
	if err := validateManifest(manifest); err != nil {
		return Plan{}, err
	}
	base, err := validateOptions(client, options)
	if err != nil {
		return Plan{}, err
	}
	remote, err := listMilestones(ctx, client, base, options)
	if err != nil {
		return Plan{}, err
	}
	managed, err := indexManagedMilestones(remote, manifest)
	if err != nil {
		return Plan{}, err
	}
	for _, milestone := range manifest.Milestones {
		if state := managed[milestone.ID]; state != nil && state.DueOn != nil {
			return Plan{}, fmt.Errorf("managed GitHub milestone %s has due date %q; remove it explicitly before synchronization", milestone.ID, *state.DueOn)
		}
	}

	plan := Plan{
		manifest: manifest, repository: options.Repository, apiBase: base.String(),
		changes: make([]milestoneChange, 0, len(manifest.Milestones)),
	}
	for _, milestone := range manifest.Milestones {
		description := managedDescription(options.Repository, milestone)
		state := managed[milestone.ID]
		switch {
		case state == nil:
			plan.changes = append(plan.changes, milestoneChange{desired: milestone})
		case state.Title == milestone.Title && state.State == milestone.State &&
			state.Description != nil && *state.Description == description:
			plan.unchanged++
		default:
			plan.changes = append(plan.changes, milestoneChange{number: state.Number, desired: milestone})
		}
	}
	return plan, nil
}

// Apply performs only mutations admitted by a prior complete Preflight.
func (plan Plan) Apply(ctx context.Context, client HTTPClient, options Options) (Result, error) {
	base, err := validatePlanOptions(client, options, plan.repository, plan.apiBase)
	if err != nil {
		return Result{}, err
	}
	result := Result{Unchanged: plan.unchanged}
	for _, change := range plan.changes {
		method := http.MethodPatch
		expectedStatus := http.StatusOK
		if change.number == 0 {
			method = http.MethodPost
			expectedStatus = http.StatusCreated
		}
		description := managedDescription(options.Repository, change.desired)
		if _, err := mutateMilestone(
			ctx, client, base, options, method, change.number, change.desired, description, expectedStatus,
		); err != nil {
			return Result{}, err
		}
		if change.number == 0 {
			result.Created++
		} else {
			result.Updated++
		}
	}
	return result, nil
}

// Verify performs a fresh complete inventory read, checks every managed
// milestone, and returns the exact numeric identities required by issue
// assignment maintenance.
func (plan Plan) Verify(ctx context.Context, client HTTPClient, options Options) (Inventory, error) {
	base, err := validatePlanOptions(client, options, plan.repository, plan.apiBase)
	if err != nil {
		return Inventory{}, err
	}
	remote, err := listMilestones(ctx, client, base, options)
	if err != nil {
		return Inventory{}, err
	}
	managed, err := indexManagedMilestones(remote, plan.manifest)
	if err != nil {
		return Inventory{}, err
	}
	numbers := make(map[string]int, len(plan.manifest.Milestones))
	for _, desired := range plan.manifest.Milestones {
		state := managed[desired.ID]
		description := managedDescription(options.Repository, desired)
		if state == nil || state.Number < 1 || state.Title != desired.Title || state.State != desired.State ||
			state.DueOn != nil || state.Description == nil || *state.Description != description {
			return Inventory{}, fmt.Errorf("managed GitHub milestone %s does not match the preflighted manifest after synchronization", desired.ID)
		}
		numbers[desired.ID] = state.Number
	}
	return Inventory{numbers: numbers}, nil
}

// Sync is the compatibility entry point for milestone-only maintenance. The
// combined metadata command separates phases across all authorities.
func Sync(ctx context.Context, client HTTPClient, manifest Manifest, options Options) (Result, error) {
	plan, err := Preflight(ctx, client, manifest, options)
	if err != nil {
		return Result{}, err
	}
	result, err := plan.Apply(ctx, client, options)
	if err != nil {
		return Result{}, err
	}
	if _, err := plan.Verify(ctx, client, options); err != nil {
		return Result{}, err
	}
	return result, nil
}

func validateOptions(client HTTPClient, options Options) (*url.URL, error) {
	if client == nil || !repositoryPattern.MatchString(options.Repository) || options.Token == "" {
		return nil, errors.New("milestone synchronization requires a client, owner/repository, and token")
	}
	return parseAPIBase(options.APIBase)
}

func validatePlanOptions(client HTTPClient, options Options, repository, apiBase string) (*url.URL, error) {
	base, err := validateOptions(client, options)
	if err != nil {
		return nil, err
	}
	if repository == "" || options.Repository != repository || base.String() != apiBase {
		return nil, errors.New("milestone synchronization options changed after preflight")
	}
	return base, nil
}

func parseAPIBase(value string) (*url.URL, error) {
	if value == "" {
		value = defaultAPIBase
	}
	parsed, err := url.Parse(strings.TrimSuffix(value, "/"))
	if err != nil || parsed.Scheme == "" || parsed.Host == "" || parsed.User != nil ||
		parsed.RawQuery != "" || parsed.Fragment != "" {
		return nil, errors.New("milestone synchronization API base is invalid")
	}
	return parsed, nil
}

func listMilestones(ctx context.Context, client HTTPClient, base *url.URL, options Options) ([]remoteMilestone, error) {
	remote := make([]remoteMilestone, 0, remoteMilestonesPerPage)
	seenNumbers := make(map[int]struct{})
	for page := 1; page <= maximumRemoteRequestPages; page++ {
		request, err := newRequest(ctx, base, options, http.MethodGet, 0, page, nil)
		if err != nil {
			return nil, err
		}
		response, err := client.Do(request)
		if err != nil {
			return nil, fmt.Errorf("list GitHub milestones page %d: %w", page, err)
		}
		pageMilestones, readErr := decodeMilestonePage(response)
		if readErr != nil {
			return nil, fmt.Errorf("list GitHub milestones page %d: %w", page, readErr)
		}
		for _, milestone := range pageMilestones {
			if milestone.Number < 1 || milestone.Title == "" || (milestone.State != "open" && milestone.State != "closed") {
				return nil, fmt.Errorf("list GitHub milestones page %d: malformed milestone identity", page)
			}
			if _, duplicate := seenNumbers[milestone.Number]; duplicate {
				return nil, fmt.Errorf("list GitHub milestones: milestone number %d is repeated", milestone.Number)
			}
			seenNumbers[milestone.Number] = struct{}{}
			remote = append(remote, milestone)
			if len(remote) > maximumRemoteMilestones {
				return nil, fmt.Errorf("GitHub milestone inventory exceeds %d entries", maximumRemoteMilestones)
			}
		}
		if len(pageMilestones) < remoteMilestonesPerPage {
			return remote, nil
		}
	}
	return nil, fmt.Errorf("GitHub milestone inventory exceeds %d request pages", maximumRemoteRequestPages)
}

func decodeMilestonePage(response *http.Response) ([]remoteMilestone, error) {
	if response == nil || response.Body == nil {
		return nil, errors.New("empty HTTP response")
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		if err := githubapi.DrainBounded(response.Body, maximumResponseBytes, "GitHub response exceeds its byte limit"); err != nil {
			return nil, err
		}
		return nil, fmt.Errorf("unexpected HTTP status %d", response.StatusCode)
	}
	body, err := io.ReadAll(io.LimitReader(response.Body, maximumResponseBytes+1))
	if err != nil || len(body) > maximumResponseBytes {
		return nil, errors.New("response exceeds its bounded readable form")
	}
	var milestones []remoteMilestone
	if err := json.Unmarshal(body, &milestones); err != nil {
		return nil, fmt.Errorf("decode response: %w", err)
	}
	if milestones == nil {
		return nil, errors.New("response must be a JSON milestone array")
	}
	return milestones, nil
}

func indexManagedMilestones(remote []remoteMilestone, manifest Manifest) (map[string]*remoteMilestone, error) {
	known := make(map[string]struct{}, len(manifest.Milestones))
	managedTitles := make(map[string]string, len(manifest.Milestones))
	for _, milestone := range manifest.Milestones {
		known[milestone.ID] = struct{}{}
		managedTitles[milestone.Title] = milestone.ID
	}
	managed := make(map[string]*remoteMilestone, len(manifest.Milestones))
	for index := range remote {
		description := ""
		if remote[index].Description != nil {
			description = *remote[index].Description
		}
		match := managedMarker.FindStringSubmatch(description)
		if match == nil {
			if strings.Contains(description, "20w-roadmap-id:") {
				return nil, fmt.Errorf("GitHub milestone %d contains a malformed managed roadmap marker", remote[index].Number)
			}
			if id, collision := managedTitles[remote[index].Title]; collision {
				return nil, fmt.Errorf("unmarked GitHub milestone %d uses managed roadmap title for %s", remote[index].Number, id)
			}
			continue
		}
		if len(managedMarker.FindAllStringSubmatch(description, -1)) != 1 {
			return nil, fmt.Errorf("GitHub milestone %d repeats its managed roadmap marker", remote[index].Number)
		}
		id := match[1]
		if _, exists := known[id]; !exists {
			return nil, fmt.Errorf("GitHub milestone %d uses unmanaged roadmap identity %s", remote[index].Number, id)
		}
		if _, duplicate := managed[id]; duplicate {
			return nil, fmt.Errorf("GitHub roadmap identity %s is bound to multiple milestones", id)
		}
		managed[id] = &remote[index]
	}
	return managed, nil
}

func mutateMilestone(
	ctx context.Context,
	client HTTPClient,
	base *url.URL,
	options Options,
	method string,
	number int,
	milestone Milestone,
	description string,
	expectedStatus int,
) (remoteMilestone, error) {
	body, err := json.Marshal(milestonePayload{
		Title: milestone.Title, State: milestone.State, Description: description,
	})
	if err != nil {
		return remoteMilestone{}, fmt.Errorf("encode GitHub milestone %s: %w", milestone.ID, err)
	}
	request, err := newRequest(ctx, base, options, method, number, 0, body)
	if err != nil {
		return remoteMilestone{}, err
	}
	response, err := client.Do(request)
	if err != nil {
		return remoteMilestone{}, fmt.Errorf("synchronize GitHub milestone %s: %w", milestone.ID, err)
	}
	if response == nil || response.Body == nil {
		return remoteMilestone{}, fmt.Errorf("synchronize GitHub milestone %s: empty HTTP response", milestone.ID)
	}
	defer response.Body.Close()
	if response.StatusCode != expectedStatus {
		if err := githubapi.DrainBounded(response.Body, maximumResponseBytes, "GitHub response exceeds its byte limit"); err != nil {
			return remoteMilestone{}, err
		}
		return remoteMilestone{}, fmt.Errorf("synchronize GitHub milestone %s: unexpected HTTP status %d", milestone.ID, response.StatusCode)
	}
	responseBody, err := io.ReadAll(io.LimitReader(response.Body, maximumResponseBytes+1))
	if err != nil || len(responseBody) > maximumResponseBytes {
		return remoteMilestone{}, fmt.Errorf("synchronize GitHub milestone %s: response exceeds its bounded readable form", milestone.ID)
	}
	var state remoteMilestone
	if err := json.Unmarshal(responseBody, &state); err != nil {
		return remoteMilestone{}, fmt.Errorf("synchronize GitHub milestone %s: decode response: %w", milestone.ID, err)
	}
	if state.Number < 1 || (number > 0 && state.Number != number) || state.Title != milestone.Title || state.State != milestone.State || state.DueOn != nil ||
		state.Description == nil || *state.Description != description {
		return remoteMilestone{}, fmt.Errorf("synchronize GitHub milestone %s: response identity does not match the requested state", milestone.ID)
	}
	return state, nil
}

func newRequest(
	ctx context.Context,
	base *url.URL,
	options Options,
	method string,
	number int,
	page int,
	body []byte,
) (*http.Request, error) {
	endpoint := strings.TrimSuffix(base.String(), "/") + "/repos/" + options.Repository + "/milestones"
	if number > 0 {
		endpoint += "/" + strconv.Itoa(number)
	}
	if page > 0 {
		query := url.Values{}
		query.Set("state", "all")
		query.Set("per_page", strconv.Itoa(remoteMilestonesPerPage))
		query.Set("page", strconv.Itoa(page))
		endpoint += "?" + query.Encode()
	}
	var reader io.Reader
	if body != nil {
		reader = bytes.NewReader(body)
	}
	request, err := http.NewRequestWithContext(ctx, method, endpoint, reader)
	if err != nil {
		return nil, fmt.Errorf("construct GitHub milestone request: %w", err)
	}
	request.Header.Set("Accept", "application/vnd.github+json")
	request.Header.Set("Authorization", "Bearer "+options.Token)
	request.Header.Set("User-Agent", "20w-milestone-sync")
	request.Header.Set("X-GitHub-Api-Version", apiVersion)
	if body != nil {
		request.Header.Set("Content-Type", "application/json")
	}
	return request, nil
}
