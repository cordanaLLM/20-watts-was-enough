package githubprmetadata

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"sort"
	"strconv"
	"strings"

	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/githubapi"
)

const (
	repairPageSize                  = 100
	maximumRepairPagesPerQuery      = 4
	maximumRepairCandidates         = 64
	maximumRepairDiscoveryBodyBytes = 16 << 20
)

// RepairOptions binds bounded pull-request discovery and repair to one
// repository. The candidate number and lifecycle event are derived from
// GitHub readback rather than caller input.
type RepairOptions struct {
	APIBase    string
	Repository string
	Token      string
}

// RepairResult counts pull requests found through the managed status
// vocabulary or the bounded open-pull scan. Skipped candidates have no single
// explicit managed issue reference and therefore remain outside the projection
// authority.
type RepairResult struct {
	Candidates int
	Updated    int
	Unchanged  int
	Skipped    int
}

// RepairPlan is the immutable result of exhausting every bounded status and
// open-pull query before the repository metadata command performs its first
// write.
type RepairPlan struct {
	repository         string
	apiBase            string
	authoritySignature string
	candidates         []repairCandidate
}

type repairCandidate struct {
	number int
	state  string
}

type repairDiscoveryItem struct {
	Number      int              `json:"number"`
	State       string           `json:"state"`
	Labels      []remoteLabel    `json:"labels"`
	PullRequest *json.RawMessage `json:"pull_request"`
}

type repairOpenPull struct {
	Number int           `json:"number"`
	State  string        `json:"state"`
	Body   *string       `json:"body"`
	Labels []remoteLabel `json:"labels"`
}

// PreflightRepair discovers issues-API records carrying an exact managed status
// and open pull requests with one explicit managed issue reference. It exhausts
// each query or refuses the whole plan at a page, candidate, item, or response
// bound; no mutation occurs here.
func PreflightRepair(
	ctx context.Context,
	client HTTPClient,
	authorities Authorities,
	options RepairOptions,
) (RepairPlan, error) {
	index, err := indexAuthorities(authorities)
	if err != nil {
		return RepairPlan{}, err
	}
	base, err := validateRepairOptions(client, options, authorities.Issues.Repository)
	if err != nil {
		return RepairPlan{}, err
	}
	statuses := index.statuses.ManagedStatuses()
	if len(statuses) != 5 {
		return RepairPlan{}, errors.New("pull-request repair requires the complete managed status vocabulary")
	}
	authoritySignature, err := repairAuthoritySignature(authorities)
	if err != nil {
		return RepairPlan{}, err
	}

	states := make(map[int]string)
	kinds := make(map[int]bool)
	admit := func(number int, state string, isPull bool) error {
		if previousKind, seen := kinds[number]; seen && previousKind != isPull {
			return fmt.Errorf("GitHub item %d changed kind during pull-request repair discovery", number)
		}
		kinds[number] = isPull
		if !isPull {
			return nil
		}
		if previousState, seen := states[number]; seen && previousState != state {
			return fmt.Errorf("GitHub pull request %d changed state during repair discovery", number)
		}
		states[number] = state
		if len(states) > maximumRepairCandidates {
			return fmt.Errorf("pull-request repair discovery exceeds %d candidates", maximumRepairCandidates)
		}
		return nil
	}
	for _, status := range statuses {
		for page := 1; page <= maximumRepairPagesPerQuery; page++ {
			items, next, listErr := listRepairPage(ctx, client, base, options, status, page)
			if listErr != nil {
				return RepairPlan{}, listErr
			}
			for _, item := range items {
				if err := admit(item.Number, item.State, item.PullRequest != nil); err != nil {
					return RepairPlan{}, err
				}
			}
			if !next {
				break
			}
			if page == maximumRepairPagesPerQuery {
				return RepairPlan{}, fmt.Errorf(
					"pull-request repair discovery for %s exceeds %d pages",
					status,
					maximumRepairPagesPerQuery,
				)
			}
		}
	}
	for page := 1; page <= maximumRepairPagesPerQuery; page++ {
		pulls, next, listErr := listOpenRepairPage(ctx, client, base, options, page)
		if listErr != nil {
			return RepairPlan{}, listErr
		}
		for _, pull := range pulls {
			if issue, _ := referencedManagedIssue(pointerText(pull.Body), index.assignments); issue == 0 {
				continue
			}
			if err := admit(pull.Number, pull.State, true); err != nil {
				return RepairPlan{}, err
			}
		}
		if !next {
			break
		}
		if page == maximumRepairPagesPerQuery {
			return RepairPlan{}, fmt.Errorf(
				"open pull-request repair discovery exceeds %d pages",
				maximumRepairPagesPerQuery,
			)
		}
	}

	numbers := make([]int, 0, len(states))
	for number := range states {
		numbers = append(numbers, number)
	}
	sort.Ints(numbers)
	candidates := make([]repairCandidate, 0, len(numbers))
	for _, number := range numbers {
		candidates = append(candidates, repairCandidate{number: number, state: states[number]})
	}
	return RepairPlan{
		repository:         options.Repository,
		apiBase:            base.String(),
		authoritySignature: authoritySignature,
		candidates:         candidates,
	}, nil
}

// Apply reuses the single-pull-request reconciler for every discovered
// candidate. Open candidates take the reopen projection; closed candidates
// first resolve merge state through GitHub's dedicated endpoint. Each Sync
// invocation performs its own bounded confirmation, mutation checks, retries,
// and readback.
func (plan RepairPlan) Apply(
	ctx context.Context,
	client HTTPClient,
	authorities Authorities,
	milestones MilestoneInventory,
	options RepairOptions,
) (RepairResult, error) {
	base, err := validateRepairOptions(client, options, plan.repository)
	if err != nil {
		return RepairResult{}, err
	}
	if base.String() != plan.apiBase {
		return RepairResult{}, errors.New("pull-request repair options changed after preflight")
	}
	if _, err := indexAuthorities(authorities); err != nil {
		return RepairResult{}, err
	}
	authoritySignature, err := repairAuthoritySignature(authorities)
	if err != nil {
		return RepairResult{}, err
	}
	if authoritySignature != plan.authoritySignature {
		return RepairResult{}, errors.New("pull-request repair authorities changed after preflight")
	}
	for _, candidate := range plan.candidates {
		if candidate.state == "open" && milestones == nil {
			return RepairResult{}, errors.New("open pull-request repair requires a verified milestone inventory")
		}
	}

	result := RepairResult{Candidates: len(plan.candidates)}
	for _, candidate := range plan.candidates {
		event := Event{Action: Reopened}
		if candidate.state == "closed" {
			candidateOptions := Options{
				APIBase: options.APIBase, Repository: options.Repository, Token: options.Token,
				PullRequest: candidate.number,
			}
			merged, mergeErr := inspectMergeState(ctx, client, base, candidateOptions)
			if mergeErr != nil {
				return RepairResult{}, fmt.Errorf("resolve GitHub pull request %d repair state: %w", candidate.number, mergeErr)
			}
			event = Event{Action: Closed, Merged: merged}
		}
		candidateResult, syncErr := Sync(ctx, client, authorities, milestones, Options{
			APIBase: options.APIBase, Repository: options.Repository, Token: options.Token,
			PullRequest: candidate.number, Event: event,
		})
		if syncErr != nil {
			return RepairResult{}, fmt.Errorf("repair GitHub pull request %d: %w", candidate.number, syncErr)
		}
		switch {
		case candidateResult.Skipped:
			result.Skipped++
		case candidateResult.Updated:
			result.Updated++
		default:
			result.Unchanged++
		}
	}
	return result, nil
}

func listRepairPage(
	ctx context.Context,
	client HTTPClient,
	base *url.URL,
	options RepairOptions,
	status string,
	page int,
) ([]repairDiscoveryItem, bool, error) {
	request, err := newRepairListRequest(ctx, base, options, status, page)
	if err != nil {
		return nil, false, err
	}
	response, err := client.Do(request)
	if err != nil {
		return nil, false, fmt.Errorf("discover GitHub pull requests for %s page %d: %w", status, page, err)
	}
	if response == nil || response.Body == nil {
		return nil, false, fmt.Errorf("discover GitHub pull requests for %s page %d: empty HTTP response", status, page)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		if err := githubapi.DrainBounded(response.Body, maximumResponseBytes, "GitHub pull-request response exceeds its byte limit"); err != nil {
			return nil, false, fmt.Errorf("discover GitHub pull requests for %s page %d: %w", status, page, err)
		}
		return nil, false, fmt.Errorf(
			"discover GitHub pull requests for %s page %d: unexpected HTTP status %d",
			status,
			page,
			response.StatusCode,
		)
	}
	body, err := io.ReadAll(io.LimitReader(response.Body, maximumRepairDiscoveryBodyBytes+1))
	if err != nil || len(body) > maximumRepairDiscoveryBodyBytes {
		return nil, false, fmt.Errorf(
			"discover GitHub pull requests for %s page %d: response exceeds its bounded readable form",
			status,
			page,
		)
	}
	var items []repairDiscoveryItem
	if err := json.Unmarshal(body, &items); err != nil || items == nil || len(items) > repairPageSize {
		return nil, false, fmt.Errorf("discover GitHub pull requests for %s page %d: malformed response", status, page)
	}
	for _, item := range items {
		if item.Number < 1 || item.Number > maximumNumber || (item.State != "open" && item.State != "closed") ||
			item.Labels == nil || len(item.Labels) > maximumLabels {
			return nil, false, fmt.Errorf("discover GitHub pull requests for %s page %d: malformed item", status, page)
		}
		if _, err := githubapi.NormalizedLabels(item.Labels); err != nil {
			return nil, false, fmt.Errorf("discover GitHub pull requests for %s page %d: %w", status, page, err)
		}
		if !containsRemoteLabel(item.Labels, status) {
			return nil, false, fmt.Errorf(
				"discover GitHub pull requests for %s page %d: item %d lacks the queried status",
				status,
				page,
				item.Number,
			)
		}
	}
	next, err := hasNextRepairPage(response.Header)
	if err != nil {
		return nil, false, fmt.Errorf("discover GitHub pull requests for %s page %d: %w", status, page, err)
	}
	// A full page without a Link header is conservatively probed once more. The
	// extra canonical request is harmless when the page was exactly full and
	// prevents a missing pagination header from silently truncating discovery.
	if len(items) == repairPageSize {
		next = true
	}
	return items, next, nil
}

func listOpenRepairPage(
	ctx context.Context,
	client HTTPClient,
	base *url.URL,
	options RepairOptions,
	page int,
) ([]repairOpenPull, bool, error) {
	request, err := newOpenRepairListRequest(ctx, base, options, page)
	if err != nil {
		return nil, false, err
	}
	response, err := client.Do(request)
	if err != nil {
		return nil, false, fmt.Errorf("discover open GitHub pull requests page %d: %w", page, err)
	}
	if response == nil || response.Body == nil {
		return nil, false, fmt.Errorf("discover open GitHub pull requests page %d: empty HTTP response", page)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		if err := githubapi.DrainBounded(response.Body, maximumResponseBytes, "GitHub pull-request response exceeds its byte limit"); err != nil {
			return nil, false, fmt.Errorf("discover open GitHub pull requests page %d: %w", page, err)
		}
		return nil, false, fmt.Errorf(
			"discover open GitHub pull requests page %d: unexpected HTTP status %d",
			page,
			response.StatusCode,
		)
	}
	body, err := io.ReadAll(io.LimitReader(response.Body, maximumRepairDiscoveryBodyBytes+1))
	if err != nil || len(body) > maximumRepairDiscoveryBodyBytes {
		return nil, false, fmt.Errorf(
			"discover open GitHub pull requests page %d: response exceeds its bounded readable form",
			page,
		)
	}
	var pulls []repairOpenPull
	if err := json.Unmarshal(body, &pulls); err != nil || pulls == nil || len(pulls) > repairPageSize {
		return nil, false, fmt.Errorf("discover open GitHub pull requests page %d: malformed response", page)
	}
	for _, pull := range pulls {
		if pull.Number < 1 || pull.Number > maximumNumber || pull.State != "open" ||
			len(pointerText(pull.Body)) > maximumBodyBytes || pull.Labels == nil || len(pull.Labels) > maximumLabels {
			return nil, false, fmt.Errorf("discover open GitHub pull requests page %d: malformed item", page)
		}
		if _, err := githubapi.NormalizedLabels(pull.Labels); err != nil {
			return nil, false, fmt.Errorf("discover open GitHub pull requests page %d: %w", page, err)
		}
	}
	next, err := hasNextRepairPage(response.Header)
	if err != nil {
		return nil, false, fmt.Errorf("discover open GitHub pull requests page %d: %w", page, err)
	}
	if len(pulls) == repairPageSize {
		next = true
	}
	return pulls, next, nil
}

func newRepairListRequest(
	ctx context.Context,
	base *url.URL,
	options RepairOptions,
	status string,
	page int,
) (*http.Request, error) {
	if page < 1 || page > maximumRepairPagesPerQuery || status == "" {
		return nil, errors.New("pull-request repair list request is outside its bounds")
	}
	target := *base
	target.Path = strings.TrimSuffix(base.Path, "/") + "/repos/" + options.Repository + "/issues"
	target.RawPath = ""
	query := url.Values{
		"direction": {"asc"},
		"labels":    {status},
		"page":      {strconv.Itoa(page)},
		"per_page":  {strconv.Itoa(repairPageSize)},
		"sort":      {"created"},
		"state":     {"all"},
	}
	target.RawQuery = query.Encode()
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, target.String(), nil)
	if err != nil {
		return nil, fmt.Errorf("construct pull-request repair discovery request: %w", err)
	}
	request.Header.Set("Accept", "application/vnd.github+json")
	request.Header.Set("Authorization", "Bearer "+options.Token)
	request.Header.Set("X-GitHub-Api-Version", apiVersion)
	request.Header.Set("User-Agent", "20w-github-pr-repair")
	return request, nil
}

func newOpenRepairListRequest(
	ctx context.Context,
	base *url.URL,
	options RepairOptions,
	page int,
) (*http.Request, error) {
	if page < 1 || page > maximumRepairPagesPerQuery {
		return nil, errors.New("open pull-request repair list request is outside its bounds")
	}
	target := *base
	target.Path = strings.TrimSuffix(base.Path, "/") + "/repos/" + options.Repository + "/pulls"
	target.RawPath = ""
	query := url.Values{
		"direction": {"asc"},
		"page":      {strconv.Itoa(page)},
		"per_page":  {strconv.Itoa(repairPageSize)},
		"sort":      {"created"},
		"state":     {"open"},
	}
	target.RawQuery = query.Encode()
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, target.String(), nil)
	if err != nil {
		return nil, fmt.Errorf("construct open pull-request repair discovery request: %w", err)
	}
	request.Header.Set("Accept", "application/vnd.github+json")
	request.Header.Set("Authorization", "Bearer "+options.Token)
	request.Header.Set("X-GitHub-Api-Version", apiVersion)
	request.Header.Set("User-Agent", "20w-github-pr-repair")
	return request, nil
}

func hasNextRepairPage(header http.Header) (bool, error) {
	values := header.Values("Link")
	if len(values) == 0 {
		return false, nil
	}
	seenNext := false
	for _, part := range strings.Split(strings.Join(values, ","), ",") {
		part = strings.TrimSpace(part)
		left := strings.IndexByte(part, '<')
		right := strings.IndexByte(part, '>')
		relation := strings.Index(part, `rel="`)
		if left != 0 || right <= left+1 || relation <= right {
			return false, errors.New("malformed pagination Link header")
		}
		relationValue := part[relation+len(`rel="`):]
		end := strings.IndexByte(relationValue, '"')
		if end < 1 {
			return false, errors.New("malformed pagination Link header")
		}
		for _, name := range strings.Fields(relationValue[:end]) {
			if name == "next" {
				if seenNext {
					return false, errors.New("duplicate next relation in pagination Link header")
				}
				seenNext = true
			}
		}
	}
	return seenNext, nil
}

func validateRepairOptions(client HTTPClient, options RepairOptions, repository string) (*url.URL, error) {
	if client == nil || options.Token == "" || options.Repository != repository || !repositoryPattern.MatchString(repository) {
		return nil, errors.New("pull-request repair requires a client, matching owner/repository, and token")
	}
	apiBase := strings.TrimSuffix(options.APIBase, "/")
	if apiBase == "" {
		apiBase = defaultAPIBase
	}
	base, err := url.Parse(apiBase)
	if err != nil || base.Scheme == "" || base.Host == "" || base.User != nil || base.RawQuery != "" || base.Fragment != "" {
		return nil, errors.New("pull-request repair API base is invalid")
	}
	return base, nil
}

func repairAuthoritySignature(authorities Authorities) (string, error) {
	encoded, err := json.Marshal(authorities)
	if err != nil {
		return "", fmt.Errorf("encode pull-request repair authorities: %w", err)
	}
	return string(encoded), nil
}

func pointerText(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}
