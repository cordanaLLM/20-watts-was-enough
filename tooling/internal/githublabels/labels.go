// Package githublabels validates and synchronizes the repository label manifest.
package githublabels

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
	"strings"

	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/repositorymanifest"
	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/strictjson"
)

const (
	manifestRelativePath = ".github/labels.json"
	maximumManifestBytes = 64 << 10
	maximumLabels        = 128
	maximumResponseBytes = 1 << 20
	maximumRemoteLabels  = 512
	remoteLabelsPerPage  = 100
	maximumRequestPages  = 6
	defaultAPIBase       = "https://api.github.com"
	apiVersion           = "2026-03-10"
)

var (
	colorPattern      = regexp.MustCompile(`^[0-9a-f]{6}$`)
	labelNamePattern  = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9 .:_-]{0,49}$`)
	repositoryPattern = regexp.MustCompile(`^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$`)
)

// Label is one exact managed GitHub label identity.
type Label struct {
	Name        string `json:"name"`
	Color       string `json:"color"`
	Description string `json:"description"`
}

// Manifest is the closed Git authority for managed repository labels.
type Manifest struct {
	Schema int     `json:"schema"`
	Labels []Label `json:"labels"`
}

// Result reports only the bounded mutations made by a synchronization.
type Result struct {
	Created   int
	Updated   int
	Unchanged int
}

// Plan is the immutable result of a complete read-only label inventory.
// Its fields stay private so callers cannot manufacture a write plan without
// passing Preflight.
type Plan struct {
	manifest   Manifest
	repository string
	apiBase    string
	changes    []labelChange
	unchanged  int
}

type labelChange struct {
	method  string
	current string
	desired Label
}

// Options binds one synchronization to a repository and authenticated API.
type Options struct {
	APIBase    string
	Repository string
	Token      string
}

// HTTPClient is the smallest client surface required by Sync.
type HTTPClient interface {
	Do(*http.Request) (*http.Response, error)
}

// Load reads and validates the one canonical label manifest beneath root.
func Load(root string) (Manifest, error) {
	body, err := repositorymanifest.Read(root, manifestRelativePath, maximumManifestBytes)
	if err != nil {
		return Manifest{}, fmt.Errorf("read %s: %w", manifestRelativePath, err)
	}
	if err := strictjson.Validate(body, 8); err != nil {
		return Manifest{}, fmt.Errorf("validate unambiguous label JSON: %w", err)
	}
	decoder := json.NewDecoder(bytes.NewReader(body))
	decoder.DisallowUnknownFields()
	var manifest Manifest
	if err := decoder.Decode(&manifest); err != nil {
		return Manifest{}, fmt.Errorf("decode label manifest: %w", err)
	}
	if decoder.Decode(&struct{}{}) != io.EOF {
		return Manifest{}, errors.New("label manifest contains trailing data")
	}
	if err := validateManifest(manifest); err != nil {
		return Manifest{}, err
	}
	return manifest, nil
}

func validateManifest(manifest Manifest) error {
	if manifest.Schema != 1 {
		return errors.New("label manifest schema must be 1")
	}
	if len(manifest.Labels) == 0 || len(manifest.Labels) > maximumLabels {
		return fmt.Errorf("label manifest must contain between 1 and %d labels", maximumLabels)
	}
	seen := make(map[string]struct{}, len(manifest.Labels))
	for index, label := range manifest.Labels {
		if !labelNamePattern.MatchString(label.Name) {
			return fmt.Errorf("label %d has an invalid name", index)
		}
		if !colorPattern.MatchString(label.Color) {
			return fmt.Errorf("label %q needs a lowercase six-digit color", label.Name)
		}
		if len(label.Description) == 0 || len(label.Description) > 100 {
			return fmt.Errorf("label %q description must contain 1-100 bytes", label.Name)
		}
		identity := strings.ToLower(label.Name)
		if _, duplicate := seen[identity]; duplicate {
			return fmt.Errorf("label %q is repeated", label.Name)
		}
		seen[identity] = struct{}{}
	}
	return nil
}

// Preflight reads the complete bounded label inventory and prepares the exact
// managed changes without mutating GitHub. Unmanaged labels are retained.
func Preflight(ctx context.Context, client HTTPClient, manifest Manifest, options Options) (Plan, error) {
	if err := validateManifest(manifest); err != nil {
		return Plan{}, err
	}
	base, err := validateOptions(client, options)
	if err != nil {
		return Plan{}, err
	}
	remote, err := listLabels(ctx, client, base, options)
	if err != nil {
		return Plan{}, err
	}
	indexed, err := indexLabels(remote)
	if err != nil {
		return Plan{}, err
	}
	plan := Plan{
		manifest: manifest, repository: options.Repository, apiBase: base.String(),
		changes: make([]labelChange, 0, len(manifest.Labels)),
	}
	for _, label := range manifest.Labels {
		state := indexed[strings.ToLower(label.Name)]
		switch {
		case state == nil:
			plan.changes = append(plan.changes, labelChange{method: http.MethodPost, desired: label})
		case strings.EqualFold(state.Color, label.Color) && state.Description == label.Description:
			plan.unchanged++
		default:
			plan.changes = append(plan.changes, labelChange{
				method: http.MethodPatch, current: state.Name, desired: label,
			})
		}
	}
	return plan, nil
}

// Apply performs only the mutations admitted by a prior complete Preflight.
func (plan Plan) Apply(ctx context.Context, client HTTPClient, options Options) (Result, error) {
	base, err := validatePlanOptions(client, options, plan.repository, plan.apiBase)
	if err != nil {
		return Result{}, err
	}
	result := Result{Unchanged: plan.unchanged}
	for _, change := range plan.changes {
		expectedStatus := http.StatusOK
		if change.method == http.MethodPost {
			expectedStatus = http.StatusCreated
		}
		if _, err := mutateLabel(
			ctx, client, base, options, change.method, change.current, change.desired, expectedStatus,
		); err != nil {
			return Result{}, err
		}
		if change.method == http.MethodPost {
			result.Created++
		} else {
			result.Updated++
		}
	}
	return result, nil
}

// Verify performs a fresh complete inventory read and checks every managed
// label against the manifest used to produce the plan.
func (plan Plan) Verify(ctx context.Context, client HTTPClient, options Options) error {
	base, err := validatePlanOptions(client, options, plan.repository, plan.apiBase)
	if err != nil {
		return err
	}
	remote, err := listLabels(ctx, client, base, options)
	if err != nil {
		return err
	}
	indexed, err := indexLabels(remote)
	if err != nil {
		return err
	}
	for _, desired := range plan.manifest.Labels {
		state := indexed[strings.ToLower(desired.Name)]
		if state == nil || state.Name != desired.Name || !strings.EqualFold(state.Color, desired.Color) ||
			state.Description != desired.Description {
			return fmt.Errorf("GitHub label %q does not match the preflighted manifest after synchronization", desired.Name)
		}
	}
	return nil
}

// Sync is the compatibility entry point for label-only maintenance. The
// combined metadata command calls each phase separately so every authority is
// preflighted before the first remote mutation.
func Sync(ctx context.Context, client HTTPClient, manifest Manifest, options Options) (Result, error) {
	plan, err := Preflight(ctx, client, manifest, options)
	if err != nil {
		return Result{}, err
	}
	result, err := plan.Apply(ctx, client, options)
	if err != nil {
		return Result{}, err
	}
	if err := plan.Verify(ctx, client, options); err != nil {
		return Result{}, err
	}
	return result, nil
}

func validateOptions(client HTTPClient, options Options) (*url.URL, error) {
	if client == nil || !repositoryPattern.MatchString(options.Repository) || options.Token == "" {
		return nil, errors.New("label synchronization requires a client, owner/repository, and token")
	}
	apiBase := strings.TrimSuffix(options.APIBase, "/")
	if apiBase == "" {
		apiBase = defaultAPIBase
	}
	parsedBase, err := url.Parse(apiBase)
	if err != nil || parsedBase.Scheme == "" || parsedBase.Host == "" || parsedBase.User != nil ||
		parsedBase.RawQuery != "" || parsedBase.Fragment != "" {
		return nil, errors.New("label synchronization API base is invalid")
	}
	return parsedBase, nil
}

func validatePlanOptions(client HTTPClient, options Options, repository, apiBase string) (*url.URL, error) {
	base, err := validateOptions(client, options)
	if err != nil {
		return nil, err
	}
	if repository == "" || options.Repository != repository || base.String() != apiBase {
		return nil, errors.New("label synchronization options changed after preflight")
	}
	return base, nil
}

func listLabels(ctx context.Context, client HTTPClient, base *url.URL, options Options) ([]Label, error) {
	remote := make([]Label, 0, remoteLabelsPerPage)
	for page := 1; page <= maximumRequestPages; page++ {
		request, err := newListRequest(ctx, base, options, page)
		if err != nil {
			return nil, err
		}
		response, err := client.Do(request)
		if err != nil {
			return nil, fmt.Errorf("list GitHub labels page %d: %w", page, err)
		}
		pageLabels, err := decodeLabelPage(response)
		if err != nil {
			return nil, fmt.Errorf("list GitHub labels page %d: %w", page, err)
		}
		remote = append(remote, pageLabels...)
		if len(remote) > maximumRemoteLabels {
			return nil, fmt.Errorf("GitHub label inventory exceeds %d entries", maximumRemoteLabels)
		}
		if len(pageLabels) < remoteLabelsPerPage {
			return remote, nil
		}
	}
	return nil, fmt.Errorf("GitHub label inventory exceeds %d request pages", maximumRequestPages)
}

func decodeLabelPage(response *http.Response) ([]Label, error) {
	if response == nil || response.Body == nil {
		return nil, errors.New("empty HTTP response")
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		if err := drainBounded(response.Body); err != nil {
			return nil, err
		}
		return nil, fmt.Errorf("unexpected HTTP status %d", response.StatusCode)
	}
	body, err := io.ReadAll(io.LimitReader(response.Body, maximumResponseBytes+1))
	if err != nil || len(body) > maximumResponseBytes {
		return nil, errors.New("response exceeds its bounded readable form")
	}
	var labels []Label
	if err := json.Unmarshal(body, &labels); err != nil {
		return nil, fmt.Errorf("decode response: %w", err)
	}
	if labels == nil {
		return nil, errors.New("response must be a JSON label array")
	}
	return labels, nil
}

func indexLabels(remote []Label) (map[string]*Label, error) {
	indexed := make(map[string]*Label, len(remote))
	for index := range remote {
		if remote[index].Name == "" || !colorPattern.MatchString(strings.ToLower(remote[index].Color)) {
			return nil, errors.New("GitHub label inventory contains a malformed label identity")
		}
		key := strings.ToLower(remote[index].Name)
		if _, duplicate := indexed[key]; duplicate {
			return nil, fmt.Errorf("GitHub label inventory repeats label %q", remote[index].Name)
		}
		indexed[key] = &remote[index]
	}
	return indexed, nil
}

func mutateLabel(ctx context.Context, client HTTPClient, base *url.URL, options Options, method, name string, label Label, expectedStatus int) (Label, error) {
	payload := map[string]string{
		"color":       label.Color,
		"description": label.Description,
		"name":        label.Name,
	}
	if method == http.MethodPatch {
		delete(payload, "name")
		payload["new_name"] = label.Name
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return Label{}, fmt.Errorf("encode GitHub label %q: %w", label.Name, err)
	}
	request, err := newRequest(ctx, base, options, method, name, body)
	if err != nil {
		return Label{}, err
	}
	response, err := client.Do(request)
	if err != nil {
		return Label{}, fmt.Errorf("synchronize GitHub label %q: %w", label.Name, err)
	}
	if response == nil || response.Body == nil {
		return Label{}, fmt.Errorf("synchronize GitHub label %q: empty HTTP response", label.Name)
	}
	defer response.Body.Close()
	if response.StatusCode != expectedStatus {
		if err := drainBounded(response.Body); err != nil {
			return Label{}, err
		}
		return Label{}, fmt.Errorf("synchronize GitHub label %q: unexpected HTTP status %d", label.Name, response.StatusCode)
	}
	responseBody, err := io.ReadAll(io.LimitReader(response.Body, maximumResponseBytes+1))
	if err != nil || len(responseBody) > maximumResponseBytes {
		return Label{}, fmt.Errorf("synchronize GitHub label %q: response exceeds its bounded readable form", label.Name)
	}
	var state Label
	if err := json.Unmarshal(responseBody, &state); err != nil {
		return Label{}, fmt.Errorf("synchronize GitHub label %q: decode response: %w", label.Name, err)
	}
	if state.Name != label.Name || !strings.EqualFold(state.Color, label.Color) || state.Description != label.Description {
		return Label{}, fmt.Errorf("synchronize GitHub label %q: response identity does not match the requested state", label.Name)
	}
	return state, nil
}

func newListRequest(ctx context.Context, base *url.URL, options Options, page int) (*http.Request, error) {
	endpoint := strings.TrimSuffix(base.String(), "/") + "/repos/" + options.Repository + "/labels"
	query := url.Values{}
	query.Set("per_page", fmt.Sprint(remoteLabelsPerPage))
	query.Set("page", fmt.Sprint(page))
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint+"?"+query.Encode(), nil)
	if err != nil {
		return nil, fmt.Errorf("construct GitHub label inventory request: %w", err)
	}
	setRequestHeaders(request, options, false)
	return request, nil
}

func newRequest(ctx context.Context, base *url.URL, options Options, method, name string, body []byte) (*http.Request, error) {
	endpoint := strings.TrimSuffix(base.String(), "/") + "/repos/" + options.Repository + "/labels"
	if name != "" {
		endpoint += "/" + url.PathEscape(name)
	}
	var reader io.Reader
	if body != nil {
		reader = bytes.NewReader(body)
	}
	request, err := http.NewRequestWithContext(ctx, method, endpoint, reader)
	if err != nil {
		return nil, fmt.Errorf("construct GitHub label request: %w", err)
	}
	setRequestHeaders(request, options, body != nil)
	return request, nil
}

func setRequestHeaders(request *http.Request, options Options, hasBody bool) {
	request.Header.Set("Accept", "application/vnd.github+json")
	request.Header.Set("Authorization", "Bearer "+options.Token)
	request.Header.Set("User-Agent", "20w-label-sync")
	request.Header.Set("X-GitHub-Api-Version", apiVersion)
	if hasBody {
		request.Header.Set("Content-Type", "application/json")
	}
}

func drainBounded(reader io.Reader) error {
	written, err := io.Copy(io.Discard, io.LimitReader(reader, maximumResponseBytes+1))
	if err != nil {
		return err
	}
	if written > maximumResponseBytes {
		return errors.New("GitHub response exceeds its byte limit")
	}
	return nil
}
