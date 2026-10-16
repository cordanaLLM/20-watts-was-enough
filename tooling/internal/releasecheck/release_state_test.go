package releasecheck

import (
	"context"
	"encoding/json"
	"errors"
	"reflect"
	"strings"
	"testing"
)

func TestReleaseStateJSONAlwaysUsesTheClosedSixFieldSchema(t *testing.T) {
	t.Parallel()
	for _, test := range []struct {
		name  string
		state ReleaseState
		want  string
	}{
		{
			name: "absent",
			want: `{"present":false,"id":0,"tag":"","draft":false,"prerelease":false,"immutable":false}`,
		},
		{
			name: "present",
			state: ReleaseState{
				Present: true,
				ID:      7,
				Tag:     testReleaseTag,
				Draft:   true,
			},
			want: `{"present":true,"id":7,"tag":"v1.2.3","draft":true,"prerelease":false,"immutable":false}`,
		},
	} {
		test := test
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()
			body, err := json.Marshal(test.state)
			if err != nil || string(body) != test.want {
				t.Fatalf("json.Marshal(ReleaseState) = %q, %v; want %q", body, err, test.want)
			}
		})
	}
}

type fakeReleaseStateResolver struct {
	state ReleaseState
	err   error
	calls int
}

func (resolver *fakeReleaseStateResolver) ResolveReleaseState(
	_ context.Context,
	_, _ string,
) (ReleaseState, error) {
	resolver.calls++
	return resolver.state, resolver.err
}

func TestParseIncludedGitHubResponseAcceptsStrictCRLFAnd200JSON(t *testing.T) {
	t.Parallel()
	response := []byte("HTTP/2 200 OK\r\ncontent-type: application/json\r\n\r\n{\"id\":7}\r\n")
	status, body, err := parseIncludedGitHubResponse(response)
	if err != nil {
		t.Fatalf("parseIncludedGitHubResponse() error = %v", err)
	}
	if status != 200 {
		t.Fatalf("status = %d, want 200", status)
	}
	if string(body) != "{\"id\":7}\r\n" {
		t.Fatalf("body = %q, want exact JSON body", body)
	}
}

func TestParseIncludedGitHubResponseRejectsMalformedOrMultipleBlocks(t *testing.T) {
	t.Parallel()
	tests := []struct {
		name     string
		response string
		want     string
	}{
		{
			name:     "missing included headers",
			response: `{}`,
			want:     "missing its included HTTP header block",
		},
		{
			name:     "malformed status",
			response: "HTTP/2 nope\n\n{}",
			want:     "malformed HTTP status line",
		},
		{
			name:     "mixed line endings",
			response: "HTTP/2 200 OK\r\ncontent-type: application/json\r\nstray\rline\r\n\r\n{}",
			want:     "malformed header line endings",
		},
		{
			name:     "multiple status blocks in headers",
			response: "HTTP/2 200 OK\nHTTP/2 404 Not Found\n\n{}",
			want:     "multiple HTTP status blocks",
		},
		{
			name:     "empty body",
			response: "HTTP/2 200 OK\n\n \n",
			want:     "empty JSON body",
		},
	}
	for _, test := range tests {
		test := test
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()
			_, _, err := parseIncludedGitHubResponse([]byte(test.response))
			if err == nil || !strings.Contains(err.Error(), test.want) {
				t.Fatalf("parseIncludedGitHubResponse() error = %v, want %q", err, test.want)
			}
		})
	}
}

func TestReleaseStateJSONRejectsTrailingResponseBlocksAndNonExactObjects(t *testing.T) {
	t.Parallel()
	valid := `{"id":7,"tag_name":"v1.2.3","draft":true,"prerelease":false,"immutable":false}`
	tests := []struct {
		name string
		body string
		want string
	}{
		{
			name: "trailing JSON",
			body: valid + ` {}`,
			want: "trailing",
		},
		{
			name: "trailing HTTP block",
			body: valid + "\nHTTP/2 200 OK\n\n{}",
			want: "trailing",
		},
		{
			name: "unknown field",
			body: strings.TrimSuffix(valid, "}") + `,"extra":true}`,
			want: "unknown field",
		},
		{
			name: "missing field",
			body: `{"id":7,"tag_name":"v1.2.3","draft":true,"prerelease":false}`,
			want: "missing an exact required field",
		},
	}
	for _, test := range tests {
		test := test
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()
			_, err := decodePresentReleaseState([]byte(test.body))
			if err == nil || !strings.Contains(err.Error(), test.want) {
				t.Fatalf("decodePresentReleaseState() error = %v, want %q", err, test.want)
			}
		})
	}

}

func TestDecodeReleaseLocatorAcceptsOnlyExplicitNullOrExactIdentity(t *testing.T) {
	t.Parallel()
	absent := []byte(`{"data":{"repository":{"release":null}}}`)
	if id, present, err := decodeReleaseLocator(absent, testReleaseTag); err != nil || present || id != 0 {
		t.Fatalf("decodeReleaseLocator(absent) = %d, %t, %v", id, present, err)
	}
	present := []byte(`{"data":{"repository":{"release":{"databaseId":7,"tagName":"v1.2.3"}}}}`)
	if id, found, err := decodeReleaseLocator(present, testReleaseTag); err != nil || !found || id != 7 {
		t.Fatalf("decodeReleaseLocator(present) = %d, %t, %v", id, found, err)
	}
}

func TestDecodeReleaseLocatorRejectsEveryAmbiguousOrInexactShape(t *testing.T) {
	t.Parallel()
	tests := []struct {
		name string
		body string
		want string
	}{
		{name: "missing data", body: `{}`, want: "missing non-null data"},
		{name: "null data", body: `{"data":null}`, want: "missing non-null data"},
		{name: "null repository", body: `{"data":{"repository":null}}`, want: "non-null repository"},
		{name: "missing release", body: `{"data":{"repository":{}}}`, want: "missing the release field"},
		{name: "GraphQL errors", body: `{"data":{"repository":{"release":null}},"errors":[]}`, want: "GraphQL errors"},
		{name: "unknown wrapper field", body: `{"data":{"repository":{"release":null}},"extra":true}`, want: "unknown field"},
		{name: "trailing response", body: `{"data":{"repository":{"release":null}}} {}`, want: "trailing"},
		{name: "duplicate field", body: `{"data":{"repository":{"release":null,"release":null}}}`, want: "repeats name"},
		{name: "null ID", body: `{"data":{"repository":{"release":{"databaseId":null,"tagName":"v1.2.3"}}}}`, want: "missing an exact required field"},
		{name: "zero ID", body: `{"data":{"repository":{"release":{"databaseId":0,"tagName":"v1.2.3"}}}}`, want: "nonpositive database ID"},
		{name: "missing tag", body: `{"data":{"repository":{"release":{"databaseId":7}}}}`, want: "missing an exact required field"},
		{name: "wrong tag", body: `{"data":{"repository":{"release":{"databaseId":7,"tagName":"v1.2.4"}}}}`, want: "expected v1.2.3"},
	}
	for _, test := range tests {
		test := test
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()
			_, _, err := decodeReleaseLocator([]byte(test.body), testReleaseTag)
			if err == nil || !strings.Contains(err.Error(), test.want) {
				t.Fatalf("decodeReleaseLocator() error = %v, want %q", err, test.want)
			}
		})
	}
}

func TestGHReleaseStateResolverLocatesDraftThenReadsNumericRelease(t *testing.T) {
	t.Parallel()
	responses := []ghReleaseCommandResult{
		{stdout: []byte(`{"data":{"repository":{"release":{"databaseId":7,"tagName":"v1.2.3"}}}}`)},
		{stdout: []byte("HTTP/2 200 OK\n\n{\"id\":7,\"tag_name\":\"v1.2.3\",\"draft\":true,\"prerelease\":false,\"immutable\":false}\n")},
	}
	var calls [][]string
	resolver := GHReleaseStateResolver{run: func(_ context.Context, arguments ...string) (ghReleaseCommandResult, error) {
		calls = append(calls, append([]string(nil), arguments...))
		return responses[len(calls)-1], nil
	}}
	got, err := resolver.ResolveReleaseState(context.Background(), testReleaseRepository, testReleaseTag)
	if err != nil {
		t.Fatal(err)
	}
	want := ReleaseState{Present: true, ID: 7, Tag: testReleaseTag, Draft: true}
	if got != want {
		t.Fatalf("ResolveReleaseState() = %+v, want %+v", got, want)
	}
	wantLocator := []string{
		"api", "graphql", "-f", "query=" + releaseByTagQuery,
		"-F", "owner=owner", "-F", "name=project", "-F", "tagName=v1.2.3",
	}
	if len(calls) != 2 || !reflect.DeepEqual(calls[0], wantLocator) {
		t.Fatalf("locator calls = %#v, want exact GraphQL locator then numeric REST", calls)
	}
	if strings.Join(calls[1], " ") != "api repos/owner/project/releases/7 -H Accept: application/vnd.github+json -H X-GitHub-Api-Version: 2022-11-28 --include --jq {id, tag_name, draft, prerelease, immutable}" {
		t.Fatalf("numeric REST arguments = %#v", calls[1])
	}
}

func TestGHReleaseStateResolverStopsAfterExplicitAbsentLocator(t *testing.T) {
	t.Parallel()
	calls := 0
	resolver := GHReleaseStateResolver{run: func(_ context.Context, _ ...string) (ghReleaseCommandResult, error) {
		calls++
		return ghReleaseCommandResult{stdout: []byte(`{"data":{"repository":{"release":null}}}`)}, nil
	}}
	got, err := resolver.ResolveReleaseState(context.Background(), testReleaseRepository, testReleaseTag)
	if err != nil || got != (ReleaseState{}) || calls != 1 {
		t.Fatalf("ResolveReleaseState(absent) = %+v, %v; calls = %d", got, err, calls)
	}
}

func TestGHReleaseStateResolverAcceptsPublishedStateAfterDraftLocator(t *testing.T) {
	t.Parallel()
	calls := 0
	resolver := GHReleaseStateResolver{run: func(_ context.Context, _ ...string) (ghReleaseCommandResult, error) {
		calls++
		if calls == 1 {
			return ghReleaseCommandResult{stdout: []byte(`{"data":{"repository":{"release":{"databaseId":7,"tagName":"v1.2.3"}}}}`)}, nil
		}
		return ghReleaseCommandResult{stdout: []byte("HTTP/2 200 OK\n\n{\"id\":7,\"tag_name\":\"v1.2.3\",\"draft\":false,\"prerelease\":false,\"immutable\":true}")}, nil
	}}
	got, err := resolver.ResolveReleaseState(context.Background(), testReleaseRepository, testReleaseTag)
	want := ReleaseState{Present: true, ID: 7, Tag: testReleaseTag, Immutable: true}
	if err != nil || got != want {
		t.Fatalf("ResolveReleaseState(published transition) = %+v, %v; want %+v", got, err, want)
	}
}

func TestGHReleaseStateResolverRejectsNumericReleaseErrorsAndIdentityDrift(t *testing.T) {
	t.Parallel()
	tests := []struct {
		name         string
		response     string
		commandError error
		want         string
	}{
		{name: "not found is not absence", response: "HTTP/2 404 Not Found\n\n{\"message\":\"Not Found\"}\n", commandError: errors.New("exit status 1"), want: "returned HTTP 404"},
		{name: "server error", response: "HTTP/2 503 Service Unavailable\n\n{\"message\":\"Unavailable\"}\n", commandError: errors.New("exit status 1"), want: "returned HTTP 503"},
		{name: "failed command with HTTP 200", response: "HTTP/2 200 OK\n\n{\"id\":7,\"tag_name\":\"v1.2.3\",\"draft\":true,\"prerelease\":false,\"immutable\":false}", commandError: errors.New("jq failed"), want: "numeric release lookup failed"},
		{name: "ID drift", response: "HTTP/2 200 OK\n\n{\"id\":8,\"tag_name\":\"v1.2.3\",\"draft\":true,\"prerelease\":false,\"immutable\":false}", want: "ID = 8, locator ID = 7"},
		{name: "tag drift", response: "HTTP/2 200 OK\n\n{\"id\":7,\"tag_name\":\"v1.2.4\",\"draft\":true,\"prerelease\":false,\"immutable\":false}", want: "tag v1.2.4, expected v1.2.3"},
		{name: "missing immutable", response: "HTTP/2 200 OK\n\n{\"id\":7,\"tag_name\":\"v1.2.3\",\"draft\":true,\"prerelease\":false}", want: "missing an exact required field"},
		{name: "unknown field", response: "HTTP/2 200 OK\n\n{\"id\":7,\"tag_name\":\"v1.2.3\",\"draft\":true,\"prerelease\":false,\"immutable\":false,\"extra\":true}", want: "unknown field"},
		{name: "trailing response", response: "HTTP/2 200 OK\n\n{\"id\":7,\"tag_name\":\"v1.2.3\",\"draft\":true,\"prerelease\":false,\"immutable\":false} {}", want: "trailing"},
	}
	for _, test := range tests {
		test := test
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()
			calls := 0
			resolver := GHReleaseStateResolver{run: func(_ context.Context, _ ...string) (ghReleaseCommandResult, error) {
				calls++
				if calls == 1 {
					return ghReleaseCommandResult{stdout: []byte(`{"data":{"repository":{"release":{"databaseId":7,"tagName":"v1.2.3"}}}}`)}, nil
				}
				return ghReleaseCommandResult{
					stdout:       []byte(test.response),
					stderr:       "diagnostic",
					commandError: test.commandError,
				}, nil
			}}
			_, err := resolver.ResolveReleaseState(context.Background(), testReleaseRepository, testReleaseTag)
			if err == nil || !strings.Contains(err.Error(), test.want) {
				t.Fatalf("ResolveReleaseState() error = %v, want %q", err, test.want)
			}
		})
	}
}

func TestGHReleaseStateResolverPropagatesLocatorCommandAndExecutionFailures(t *testing.T) {
	t.Parallel()
	for name, runner := range map[string]ghReleaseCommandRunner{
		"command": func(context.Context, ...string) (ghReleaseCommandResult, error) {
			return ghReleaseCommandResult{commandError: errors.New("exit status 1"), stderr: "denied"}, nil
		},
		"execution": func(context.Context, ...string) (ghReleaseCommandResult, error) {
			return ghReleaseCommandResult{}, errors.New("response exceeds its bounded output size")
		},
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			_, err := (GHReleaseStateResolver{run: runner}).ResolveReleaseState(
				context.Background(), testReleaseRepository, testReleaseTag,
			)
			if err == nil {
				t.Fatal("ResolveReleaseState() succeeded")
			}
		})
	}
}

func TestLookupReleaseStateValidatesRequestBeforeResolving(t *testing.T) {
	t.Parallel()
	tests := []struct {
		name       string
		ctx        context.Context
		repository string
		tag        string
		resolver   ReleaseStateResolver
		want       string
	}{
		{
			name:       "nil context",
			ctx:        nil,
			repository: testReleaseRepository,
			tag:        testReleaseTag,
			resolver:   &fakeReleaseStateResolver{},
			want:       "context is required",
		},
		{
			name:       "unsafe repository",
			ctx:        context.Background(),
			repository: "../project",
			tag:        testReleaseTag,
			resolver:   &fakeReleaseStateResolver{},
			want:       "owner/name pair",
		},
		{
			name:       "invalid tag",
			ctx:        context.Background(),
			repository: testReleaseRepository,
			tag:        "latest",
			resolver:   &fakeReleaseStateResolver{},
			want:       "vMAJOR.MINOR.PATCH",
		},
		{
			name:       "nil resolver",
			ctx:        context.Background(),
			repository: testReleaseRepository,
			tag:        testReleaseTag,
			resolver:   nil,
			want:       "resolver is required",
		},
	}
	for _, test := range tests {
		test := test
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()
			_, err := LookupReleaseState(test.ctx, test.repository, test.tag, test.resolver)
			if err == nil || !strings.Contains(err.Error(), test.want) {
				t.Fatalf("LookupReleaseState() error = %v, want %q", err, test.want)
			}
			if resolver, ok := test.resolver.(*fakeReleaseStateResolver); ok && resolver.calls != 0 {
				t.Fatalf("resolver calls = %d, want none", resolver.calls)
			}
		})
	}
}

func TestLookupReleaseStateValidatesResolvedState(t *testing.T) {
	t.Parallel()
	tests := []struct {
		name  string
		state ReleaseState
		err   error
		want  string
	}{
		{
			name: "resolver error",
			err:  errors.New("offline"),
			want: "resolve GitHub Release state: offline",
		},
		{
			name:  "dirty absent state",
			state: ReleaseState{ID: 7},
			want:  "absent GitHub Release state contains present-release fields",
		},
		{
			name:  "nonpositive present ID",
			state: ReleaseState{Present: true, Tag: testReleaseTag},
			want:  "nonpositive ID",
		},
		{
			name:  "wrong tag",
			state: ReleaseState{Present: true, ID: 7, Tag: "v1.2.4"},
			want:  "resolves tag v1.2.4, expected v1.2.3",
		},
	}
	for _, test := range tests {
		test := test
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()
			resolver := &fakeReleaseStateResolver{state: test.state, err: test.err}
			_, err := LookupReleaseState(context.Background(), testReleaseRepository, testReleaseTag, resolver)
			if err == nil || !strings.Contains(err.Error(), test.want) {
				t.Fatalf("LookupReleaseState() error = %v, want %q", err, test.want)
			}
			if resolver.calls != 1 {
				t.Fatalf("resolver calls = %d, want 1", resolver.calls)
			}
		})
	}
}

func TestLookupReleaseStateAcceptsAbsentAndExactPresentStates(t *testing.T) {
	t.Parallel()
	states := []ReleaseState{
		{},
		{Present: true, ID: 7, Tag: testReleaseTag, Draft: true, Immutable: false},
	}
	for _, want := range states {
		resolver := &fakeReleaseStateResolver{state: want}
		got, err := LookupReleaseState(context.Background(), testReleaseRepository, testReleaseTag, resolver)
		if err != nil {
			t.Fatalf("LookupReleaseState(%+v) error = %v", want, err)
		}
		if got != want {
			t.Fatalf("LookupReleaseState() = %+v, want %+v", got, want)
		}
	}
}

func TestReleaseTagGrammar(t *testing.T) {
	t.Parallel()
	for _, test := range []struct {
		tag   string
		valid bool
	}{
		{"v0.0.0", true},
		{"v0.5.0", true},
		{"v12.34.56", true},
		{"v0.0.0-rc.0", true},
		{"v0.5.0-rc.1", true},
		{"v0.5.0-rc.10", true},
		{"v999999999999999999999.0.0-rc.999999999999999999999", true},
		{"", false},
		{"0.5.0", false},
		{"v0.5.0-rc", false},
		{"v0.5.0-rc.01", false},
		{"v0.5.0-rc.1.2", false},
		{"v0.5.0-beta.1", false},
		{"v0.5.0-RC.1", false},
		{"v05.0.0", false},
		{"v0.05.0", false},
		{"v0.5.00", false},
		{"v0.5.0+meta", false},
		{"v0.5.0-rc.1-x", false},
		{"v0.5.0-rc.-1", false},
		{"v0.5.0-rc.", false},
		{"v0.5.0\n", false},
		{" v0.5.0", false},
		{"v0.5.0 ", false},
	} {
		t.Run(test.tag, func(t *testing.T) {
			t.Parallel()
			resolver := &fakeReleaseStateResolver{state: ReleaseState{Present: true, ID: 7, Tag: test.tag, Prerelease: strings.Contains(test.tag, "-rc.")}}
			_, err := LookupReleaseState(context.Background(), "owner/project", test.tag, resolver)
			if (err == nil) != test.valid {
				t.Fatalf("tag %q: error = %v, want valid = %t", test.tag, err, test.valid)
			}
		})
	}
}

func TestReleaseStatePrereleaseMustMatchTag(t *testing.T) {
	t.Parallel()
	for _, tag := range []string{"v0.5.0", "v0.5.0-rc.0", "v0.5.0-rc.1"} {
		for _, prerelease := range []bool{false, true} {
			for _, draft := range []bool{false, true} {
				resolver := &fakeReleaseStateResolver{state: ReleaseState{Present: true, ID: 7, Tag: tag, Prerelease: prerelease, Draft: draft, Immutable: !draft}}
				state, err := LookupReleaseState(context.Background(), "owner/project", tag, resolver)
				want := prerelease == strings.Contains(tag, "-rc.")
				if (err == nil) != want || (want && state != resolver.state) {
					t.Fatalf("tag=%s prerelease=%t draft=%t: state=%+v error=%v", tag, prerelease, draft, state, err)
				}
				if !want && !strings.Contains(err.Error(), "prerelease state does not match") {
					t.Fatalf("wrong mismatch diagnostic: %v", err)
				}
			}
		}
	}
}
