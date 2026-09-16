package releasecheck

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os/exec"
	"strconv"
	"strings"

	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/strictjson"
)

const releaseByTagQuery = `query ReleaseByTag($owner:String!,$name:String!,$tagName:String!){repository(owner:$owner,name:$name){release(tagName:$tagName){databaseId tagName}}}`

// ReleaseState is the exact GitHub Release state associated with one tag.
type ReleaseState struct {
	Present    bool   `json:"present"`
	ID         int64  `json:"id"`
	Tag        string `json:"tag"`
	Draft      bool   `json:"draft"`
	Prerelease bool   `json:"prerelease"`
	Immutable  bool   `json:"immutable"`
}

// ReleaseStateResolver performs the bounded remote reads needed to resolve a
// tag, including draft releases that the REST tag endpoint does not expose.
type ReleaseStateResolver interface {
	ResolveReleaseState(context.Context, string, string) (ReleaseState, error)
}

// GHReleaseStateResolver resolves releases through the authenticated gh CLI.
type GHReleaseStateResolver struct {
	run ghReleaseCommandRunner
}

type ghReleaseCommandResult struct {
	stdout       []byte
	stderr       string
	commandError error
}

type ghReleaseCommandRunner func(context.Context, ...string) (ghReleaseCommandResult, error)

// LookupReleaseState validates both the requested identity and the returned
// release object. A missing tag is an explicit non-error state.
func LookupReleaseState(
	ctx context.Context,
	repository, tag string,
	resolver ReleaseStateResolver,
) (ReleaseState, error) {
	if ctx == nil {
		return ReleaseState{}, errors.New("release state context is required")
	}
	if !repositoryPattern.MatchString(repository) {
		return ReleaseState{}, errors.New("GitHub repository must be an owner/name pair")
	}
	if !releaseTagPattern.MatchString(tag) {
		return ReleaseState{}, errors.New("release tag must be vMAJOR.MINOR.PATCH")
	}
	if resolver == nil {
		return ReleaseState{}, errors.New("GitHub Release state resolver is required")
	}
	state, err := resolver.ResolveReleaseState(ctx, repository, tag)
	if err != nil {
		return ReleaseState{}, fmt.Errorf("resolve GitHub Release state: %w", err)
	}
	if !state.Present {
		if state.ID != 0 || state.Tag != "" || state.Draft || state.Prerelease || state.Immutable {
			return ReleaseState{}, errors.New("absent GitHub Release state contains present-release fields")
		}
		return state, nil
	}
	if state.ID <= 0 {
		return ReleaseState{}, errors.New("GitHub Release state has a nonpositive ID")
	}
	if state.Tag != tag {
		return ReleaseState{}, fmt.Errorf("GitHub Release resolves tag %s, expected %s", valueOrMissing(state.Tag), tag)
	}
	return state, nil
}

func (resolver GHReleaseStateResolver) ResolveReleaseState(
	ctx context.Context,
	repository, tag string,
) (ReleaseState, error) {
	requestContext, cancel := context.WithTimeout(ctx, githubAPIRequestTimeout)
	defer cancel()
	run := resolver.run
	if run == nil {
		run = runGHReleaseCommand
	}
	owner, name, found := strings.Cut(repository, "/")
	if !found {
		return ReleaseState{}, errors.New("split validated GitHub repository identity")
	}
	locatorResult, err := run(
		requestContext,
		"api", "graphql",
		"-f", "query="+releaseByTagQuery,
		"-F", "owner="+owner,
		"-F", "name="+name,
		"-F", "tagName="+tag,
	)
	if err != nil {
		return ReleaseState{}, fmt.Errorf("GitHub draft-release locator: %w", err)
	}
	if locatorResult.commandError != nil {
		return ReleaseState{}, fmt.Errorf(
			"GitHub draft-release locator failed: %w: %s",
			locatorResult.commandError,
			boundedDiagnostic(locatorResult.stderr),
		)
	}
	releaseID, present, err := decodeReleaseLocator(locatorResult.stdout, tag)
	if err != nil {
		return ReleaseState{}, err
	}
	if !present {
		return ReleaseState{}, nil
	}
	releaseResult, err := run(
		requestContext,
		"api", fmt.Sprintf("repos/%s/releases/%d", repository, releaseID),
		"-H", githubAPIAcceptHeader,
		"-H", githubAPIVersionHeader,
		"--include",
		"--jq", "{id, tag_name, draft, prerelease, immutable}",
	)
	if err != nil {
		return ReleaseState{}, fmt.Errorf("GitHub numeric release lookup: %w", err)
	}
	status, body, err := parseIncludedGitHubResponse(releaseResult.stdout)
	if err != nil {
		return ReleaseState{}, fmt.Errorf("parse GitHub numeric release response: %w", err)
	}
	if status != 200 {
		if releaseResult.commandError == nil {
			releaseResult.commandError = errors.New("unexpected successful gh exit status")
		}
		return ReleaseState{}, fmt.Errorf(
			"GitHub numeric release lookup returned HTTP %d: %w: %s",
			status,
			releaseResult.commandError,
			boundedDiagnostic(releaseResult.stderr),
		)
	}
	if releaseResult.commandError != nil {
		return ReleaseState{}, fmt.Errorf(
			"GitHub numeric release lookup failed: %w: %s",
			releaseResult.commandError,
			boundedDiagnostic(releaseResult.stderr),
		)
	}
	state, err := decodePresentReleaseState(body)
	if err != nil {
		return ReleaseState{}, err
	}
	if state.ID != releaseID {
		return ReleaseState{}, fmt.Errorf("GitHub numeric release ID = %d, locator ID = %d", state.ID, releaseID)
	}
	if state.Tag != tag {
		return ReleaseState{}, fmt.Errorf("GitHub numeric release tag %s, expected %s", valueOrMissing(state.Tag), tag)
	}
	return state, nil
}

func runGHReleaseCommand(ctx context.Context, arguments ...string) (ghReleaseCommandResult, error) {
	stdout := &boundedBuffer{limit: maximumGHOutputBytes}
	stderr := &boundedBuffer{limit: maximumGHOutputBytes}
	command := exec.CommandContext(ctx, "gh", arguments...)
	command.Stdout = stdout
	command.Stderr = stderr
	command.WaitDelay = githubAPICommandWaitDelay
	commandError := command.Run()
	if ctx.Err() != nil {
		return ghReleaseCommandResult{}, fmt.Errorf("GitHub API request: %w", ctx.Err())
	}
	if stdout.Exceeded() || stderr.Exceeded() {
		return ghReleaseCommandResult{}, errors.New("GitHub Release state response exceeds its bounded output size")
	}
	return ghReleaseCommandResult{
		stdout:       stdout.Bytes(),
		stderr:       stderr.String(),
		commandError: commandError,
	}, nil
}

func parseIncludedGitHubResponse(response []byte) (int, []byte, error) {
	separator := []byte("\n\n")
	separatorIndex := bytes.Index(response, separator)
	if crlfIndex := bytes.Index(response, []byte("\r\n\r\n")); crlfIndex >= 0 &&
		(separatorIndex < 0 || crlfIndex < separatorIndex) {
		separator = []byte("\r\n\r\n")
		separatorIndex = crlfIndex
	}
	if separatorIndex < 0 {
		return 0, nil, errors.New("GitHub Release response is missing its included HTTP header block")
	}
	header := string(response[:separatorIndex])
	header = strings.ReplaceAll(header, "\r\n", "\n")
	if strings.ContainsRune(header, '\r') {
		return 0, nil, errors.New("GitHub Release response contains malformed header line endings")
	}
	lines := strings.Split(header, "\n")
	if len(lines) == 0 {
		return 0, nil, errors.New("GitHub Release response has an empty HTTP header block")
	}
	for _, line := range lines[1:] {
		if strings.HasPrefix(line, "HTTP/") {
			return 0, nil, errors.New("GitHub Release response contains multiple HTTP status blocks")
		}
	}
	fields := strings.Fields(lines[0])
	if len(fields) < 2 || !strings.HasPrefix(fields[0], "HTTP/") || len(fields[1]) != 3 {
		return 0, nil, errors.New("GitHub Release response has a malformed HTTP status line")
	}
	status, err := strconv.Atoi(fields[1])
	if err != nil || status < 100 || status > 599 {
		return 0, nil, errors.New("GitHub Release response has a malformed HTTP status code")
	}
	body := bytes.Clone(response[separatorIndex+len(separator):])
	if len(bytes.TrimSpace(body)) == 0 {
		return 0, nil, errors.New("GitHub Release response has an empty JSON body")
	}
	return status, body, nil
}

func decodeReleaseLocator(body []byte, expectedTag string) (int64, bool, error) {
	var envelope struct {
		Data   json.RawMessage `json:"data"`
		Errors json.RawMessage `json:"errors"`
	}
	if err := decodeClosedJSON(body, &envelope, "GitHub release-locator response"); err != nil {
		return 0, false, err
	}
	if len(envelope.Errors) != 0 {
		return 0, false, errors.New("GitHub release-locator response contains GraphQL errors")
	}
	if len(envelope.Data) == 0 || isJSONNull(envelope.Data) {
		return 0, false, errors.New("GitHub release-locator response is missing non-null data")
	}
	var data struct {
		Repository json.RawMessage `json:"repository"`
	}
	if err := decodeClosedJSON(envelope.Data, &data, "GitHub release-locator data"); err != nil {
		return 0, false, err
	}
	if len(data.Repository) == 0 || isJSONNull(data.Repository) {
		return 0, false, errors.New("GitHub release-locator response is missing a non-null repository")
	}
	var repository struct {
		Release json.RawMessage `json:"release"`
	}
	if err := decodeClosedJSON(data.Repository, &repository, "GitHub release-locator repository"); err != nil {
		return 0, false, err
	}
	if len(repository.Release) == 0 {
		return 0, false, errors.New("GitHub release-locator response is missing the release field")
	}
	if isJSONNull(repository.Release) {
		return 0, false, nil
	}
	var release struct {
		DatabaseID *int64  `json:"databaseId"`
		TagName    *string `json:"tagName"`
	}
	if err := decodeClosedJSON(repository.Release, &release, "GitHub release locator"); err != nil {
		return 0, false, err
	}
	if release.DatabaseID == nil || release.TagName == nil {
		return 0, false, errors.New("GitHub release locator is missing an exact required field")
	}
	if *release.DatabaseID <= 0 {
		return 0, false, errors.New("GitHub release locator has a nonpositive database ID")
	}
	if *release.TagName != expectedTag {
		return 0, false, fmt.Errorf(
			"GitHub release locator resolves tag %s, expected %s",
			valueOrMissing(*release.TagName),
			expectedTag,
		)
	}
	return *release.DatabaseID, true, nil
}

func isJSONNull(body []byte) bool {
	return bytes.Equal(bytes.TrimSpace(body), []byte("null"))
}

func decodeClosedJSON(body []byte, target any, label string) error {
	if err := strictjson.Validate(body, 8); err != nil {
		return fmt.Errorf("validate %s: %w", label, err)
	}
	decoder := json.NewDecoder(bytes.NewReader(body))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(target); err != nil {
		return fmt.Errorf("decode %s: %w", label, err)
	}
	if err := decoder.Decode(&struct{}{}); !errors.Is(err, io.EOF) {
		return fmt.Errorf("%s contains trailing data or another response block", label)
	}
	return nil
}

func decodePresentReleaseState(body []byte) (ReleaseState, error) {
	var raw struct {
		ID         *int64  `json:"id"`
		Tag        *string `json:"tag_name"`
		Draft      *bool   `json:"draft"`
		Prerelease *bool   `json:"prerelease"`
		Immutable  *bool   `json:"immutable"`
	}
	if err := decodeClosedJSON(body, &raw, "GitHub Release state"); err != nil {
		return ReleaseState{}, err
	}
	if raw.ID == nil || raw.Tag == nil || raw.Draft == nil || raw.Prerelease == nil || raw.Immutable == nil {
		return ReleaseState{}, errors.New("GitHub Release state is missing an exact required field")
	}
	return ReleaseState{
		Present:    true,
		ID:         *raw.ID,
		Tag:        *raw.Tag,
		Draft:      *raw.Draft,
		Prerelease: *raw.Prerelease,
		Immutable:  *raw.Immutable,
	}, nil
}

func boundedDiagnostic(diagnostic string) string {
	diagnostic = strings.TrimSpace(diagnostic)
	const maximumDiagnosticBytes = 4096
	if len(diagnostic) > maximumDiagnosticBytes {
		return diagnostic[:maximumDiagnosticBytes] + "..."
	}
	return diagnostic
}
