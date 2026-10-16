package releaseimage

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

const testRevision = "0123456789abcdef0123456789abcdef01234567"

type registryFixture struct {
	indexBody      []byte
	indexDigest    string
	manifestBody   []byte
	manifestDigest string
	configBody     []byte
	configDigest   string
}

func contentDigest(body []byte) string {
	digest := sha256.Sum256(body)
	return "sha256:" + hex.EncodeToString(digest[:])
}

func newRegistryFixture(labels map[string]string) registryFixture {
	configBody := []byte(fmt.Sprintf(
		`{"architecture":"amd64","os":"linux","config":{"Labels":{"org.opencontainers.image.revision":%q,"org.opencontainers.image.version":%q}}}`,
		labels["org.opencontainers.image.revision"], labels["org.opencontainers.image.version"],
	))
	configDigest := contentDigest(configBody)
	manifestBody := []byte(fmt.Sprintf(`{"schemaVersion":2,"config":{"digest":%q,"size":%d},"layers":[]}`, configDigest, len(configBody)))
	manifestDigest := contentDigest(manifestBody)
	indexBody := []byte(fmt.Sprintf(
		`{"schemaVersion":2,"manifests":[{"digest":%q,"size":%d,"platform":{"os":"linux","architecture":"amd64"}},{"digest":"sha256:%s","size":1,"platform":{"os":"unknown","architecture":"unknown"}}]}`,
		manifestDigest, len(manifestBody), strings.Repeat("f", 64),
	))
	return registryFixture{
		indexBody:      indexBody,
		indexDigest:    contentDigest(indexBody),
		manifestBody:   manifestBody,
		manifestDigest: manifestDigest,
		configBody:     configBody,
		configDigest:   configDigest,
	}
}

func testOptions() Options {
	return Options{
		Image:     "ghcr.io/acme/research-image",
		Tag:       "v1.2.3",
		Revision:  testRevision,
		Platforms: []string{"linux/amd64"},
		ExpectedLabels: map[string]string{
			"org.opencontainers.image.revision": testRevision,
			"org.opencontainers.image.version":  "v1.2.3",
		},
		Username: "builder",
		Token:    "secret",
	}
}

func registryServer(t *testing.T, fixture registryFixture, tagStatus int) *httptest.Server {
	return registryServerWithStatus(t, fixture, func() int { return tagStatus })
}

func registryServerWithStatus(t *testing.T, fixture registryFixture, tagStatus func() int) *httptest.Server {
	t.Helper()
	var server *httptest.Server
	handler := http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		if request.Header.Get("Accept-Encoding") != "identity" {
			t.Errorf("request %s Accept-Encoding = %q, want identity", request.URL.Path, request.Header.Get("Accept-Encoding"))
			writer.WriteHeader(http.StatusBadRequest)
			return
		}
		if request.URL.Path == "/token" {
			username, password, ok := request.BasicAuth()
			if !ok || username != "builder" || password != "secret" {
				writer.WriteHeader(http.StatusUnauthorized)
				return
			}
			writer.Header().Set("Content-Type", "application/json")
			_, _ = writer.Write([]byte(`{"token":"registry-token"}`))
			return
		}
		if request.Header.Get("Authorization") != "Bearer registry-token" {
			writer.Header().Set(
				"WWW-Authenticate",
				fmt.Sprintf(`Bearer realm=%q,service="ghcr.io",scope="repository:acme/research-image:pull"`, server.URL+"/token"),
			)
			writer.WriteHeader(http.StatusUnauthorized)
			return
		}
		switch request.URL.Path {
		case "/v2/acme/research-image/manifests/v1.2.3":
			status := tagStatus()
			if status != http.StatusOK {
				writer.WriteHeader(status)
				return
			}
			writeRegistryBody(writer, fixture.indexDigest, fixture.indexBody)
		case "/v2/acme/research-image/manifests/" + fixture.indexDigest:
			status := tagStatus()
			if status != http.StatusOK {
				writer.WriteHeader(status)
				return
			}
			writeRegistryBody(writer, fixture.indexDigest, fixture.indexBody)
		case "/v2/acme/research-image/manifests/" + fixture.manifestDigest:
			writeRegistryBody(writer, fixture.manifestDigest, fixture.manifestBody)
		case "/v2/acme/research-image/blobs/" + fixture.configDigest:
			writeRegistryBody(writer, fixture.configDigest, fixture.configBody)
		default:
			writer.WriteHeader(http.StatusNotFound)
		}
	})
	server = httptest.NewServer(handler)
	return server
}

func authenticatedChallenge(serverURL string) string {
	return fmt.Sprintf(
		`Bearer realm=%q,service="ghcr.io",scope="repository:acme/research-image:pull"`,
		serverURL+"/token",
	)
}

func writeRegistryBody(writer http.ResponseWriter, digest string, body []byte) {
	writer.Header().Set("Docker-Content-Digest", digest)
	writer.Header().Set("Content-Type", "application/vnd.oci.image.index.v1+json")
	writer.WriteHeader(http.StatusOK)
	_, _ = writer.Write(body)
}

func TestInspectValidatesAuthenticatedRegistryIdentity(t *testing.T) {
	t.Parallel()
	options := testOptions()
	fixture := newRegistryFixture(options.ExpectedLabels)
	server := registryServer(t, fixture, http.StatusOK)
	defer server.Close()
	options.RegistryURL = server.URL
	options.HTTPClient = server.Client()
	result, err := Inspect(context.Background(), options)
	if err != nil {
		t.Fatalf("Inspect() error = %v", err)
	}
	if result.Status != "existing" || result.Digest != fixture.indexDigest || strings.Join(result.Platforms, ",") != "linux/amd64" {
		t.Fatalf("Inspect() result = %+v, want exact existing identity", result)
	}
}

func TestInspectValidatesExactDigestIdentity(t *testing.T) {
	t.Parallel()
	options := testOptions()
	fixture := newRegistryFixture(options.ExpectedLabels)
	server := registryServer(t, fixture, http.StatusOK)
	defer server.Close()
	options.Tag = ""
	options.Digest = fixture.indexDigest
	options.RegistryURL = server.URL
	options.HTTPClient = server.Client()
	result, err := Inspect(context.Background(), options)
	if err != nil {
		t.Fatalf("Inspect() error = %v", err)
	}
	if result.Reference != options.Image+"@"+fixture.indexDigest || result.Digest != fixture.indexDigest || result.Status != "existing" {
		t.Fatalf("Inspect() result = %+v, want exact digest identity", result)
	}
}

func TestInspectRejectsWrongExactDigestResponse(t *testing.T) {
	t.Parallel()
	options := testOptions()
	fixture := newRegistryFixture(options.ExpectedLabels)
	server := registryServer(t, fixture, http.StatusOK)
	defer server.Close()
	options.Tag = ""
	options.Digest = "sha256:" + strings.Repeat("0", 64)
	options.RegistryURL = server.URL
	options.HTTPClient = server.Client()
	_, err := inspectExisting(context.Background(), options, nil)
	if err == nil || !strings.Contains(err.Error(), "remained absent") {
		t.Fatalf("Inspect() error = %v, want wrong digest rejection", err)
	}
}

func TestInspectExistingRetriesOnlyAuthenticatedAbsence(t *testing.T) {
	t.Parallel()
	options := testOptions()
	fixture := newRegistryFixture(options.ExpectedLabels)
	var observations atomic.Int32
	server := registryServerWithStatus(t, fixture, func() int {
		if observations.Add(1) < 3 {
			return http.StatusNotFound
		}
		return http.StatusOK
	})
	defer server.Close()
	options.RegistryURL = server.URL
	options.HTTPClient = server.Client()
	result, err := inspectExisting(context.Background(), options, []time.Duration{0, 0, 0})
	if err != nil || result.Status != "existing" || observations.Load() != 3 {
		t.Fatalf("inspectExisting() result/error/observations = %+v/%v/%d, want existing/nil/3", result, err, observations.Load())
	}
}

func TestInspectExistingBoundsAbsenceAndFailsOtherErrorsImmediately(t *testing.T) {
	t.Parallel()
	options := testOptions()
	fixture := newRegistryFixture(options.ExpectedLabels)
	var absentObservations atomic.Int32
	absentServer := registryServerWithStatus(t, fixture, func() int {
		absentObservations.Add(1)
		return http.StatusNotFound
	})
	defer absentServer.Close()
	options.RegistryURL = absentServer.URL
	options.HTTPClient = absentServer.Client()
	_, err := inspectExisting(context.Background(), options, []time.Duration{0, 0})
	if err == nil || !strings.Contains(err.Error(), "3 authenticated observations") || absentObservations.Load() != 3 {
		t.Fatalf("inspectExisting() error/observations = %v/%d, want bounded authenticated absence", err, absentObservations.Load())
	}

	var failedObservations atomic.Int32
	failureServer := registryServerWithStatus(t, fixture, func() int {
		failedObservations.Add(1)
		return http.StatusBadGateway
	})
	defer failureServer.Close()
	options.RegistryURL = failureServer.URL
	options.HTTPClient = failureServer.Client()
	_, err = inspectExisting(context.Background(), options, []time.Duration{0, 0})
	if err == nil || !strings.Contains(err.Error(), "failed closed") || failedObservations.Load() != 1 {
		t.Fatalf("inspectExisting() error/observations = %v/%d, want immediate server failure", err, failedObservations.Load())
	}
}

func TestInspectAcceptsOnlyAuthenticatedNotFound(t *testing.T) {
	t.Parallel()
	options := testOptions()
	fixture := newRegistryFixture(options.ExpectedLabels)
	server := registryServer(t, fixture, http.StatusNotFound)
	defer server.Close()
	options.RegistryURL = server.URL
	options.HTTPClient = server.Client()
	result, err := Inspect(context.Background(), options)
	if err != nil || result.Status != "absent" || result.Digest != "" {
		t.Fatalf("Inspect() result/error = %+v/%v, want authenticated absence", result, err)
	}

	unauthenticated := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, _ *http.Request) {
		writer.WriteHeader(http.StatusNotFound)
	}))
	defer unauthenticated.Close()
	options.RegistryURL = unauthenticated.URL
	options.HTTPClient = unauthenticated.Client()
	_, err = Inspect(context.Background(), options)
	if err == nil || !strings.Contains(err.Error(), "unauthenticated") {
		t.Fatalf("Inspect() error = %v, want unauthenticated 404 rejection", err)
	}
}

func TestInspectFailsClosedOnRegistryOrDigestFailure(t *testing.T) {
	t.Parallel()
	options := testOptions()
	fixture := newRegistryFixture(options.ExpectedLabels)
	tests := []struct {
		name   string
		status int
		mutate func(*registryFixture)
		want   string
	}{
		{name: "rate limit", status: http.StatusTooManyRequests, want: "failed closed"},
		{name: "server failure", status: http.StatusBadGateway, want: "failed closed"},
		{name: "digest mismatch", status: http.StatusOK, mutate: func(value *registryFixture) {
			value.indexDigest = "sha256:" + strings.Repeat("0", 64)
		}, want: "does not match"},
	}
	for _, test := range tests {
		test := test
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()
			localFixture := fixture
			if test.mutate != nil {
				test.mutate(&localFixture)
			}
			server := registryServer(t, localFixture, test.status)
			defer server.Close()
			localOptions := options
			localOptions.RegistryURL = server.URL
			localOptions.HTTPClient = server.Client()
			_, err := Inspect(context.Background(), localOptions)
			if err == nil || !strings.Contains(err.Error(), test.want) {
				t.Fatalf("Inspect() error = %v, want %q", err, test.want)
			}
		})
	}
}

func TestInspectRejectsDescriptorSizeDrift(t *testing.T) {
	t.Parallel()
	options := testOptions()
	fixture := newRegistryFixture(options.ExpectedLabels)
	oldDescriptor := fmt.Sprintf(`"digest":%q,"size":%d`, fixture.manifestDigest, len(fixture.manifestBody))
	newDescriptor := fmt.Sprintf(`"digest":%q,"size":%d`, fixture.manifestDigest, len(fixture.manifestBody)+1)
	fixture.indexBody = []byte(strings.Replace(string(fixture.indexBody), oldDescriptor, newDescriptor, 1))
	fixture.indexDigest = contentDigest(fixture.indexBody)
	server := registryServer(t, fixture, http.StatusOK)
	defer server.Close()
	options.RegistryURL = server.URL
	options.HTTPClient = server.Client()
	_, err := Inspect(context.Background(), options)
	if err == nil || !strings.Contains(err.Error(), "descriptor size") {
		t.Fatalf("Inspect() error = %v, want descriptor-size rejection", err)
	}
}

func TestValidatePlatformReportsNonOKStatusWithoutNilWrapping(t *testing.T) {
	t.Parallel()
	options := testOptions()
	fixture := newRegistryFixture(options.ExpectedLabels)
	for _, stage := range []string{"manifest", "config"} {
		stage := stage
		t.Run(stage, func(t *testing.T) {
			server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
				if stage == "config" && strings.Contains(request.URL.Path, "/manifests/") {
					writeRegistryBody(writer, fixture.manifestDigest, fixture.manifestBody)
					return
				}
				writer.WriteHeader(http.StatusNotFound)
			}))
			defer server.Close()
			baseURL, err := url.Parse(server.URL)
			if err != nil {
				t.Fatal(err)
			}
			session := &registrySession{
				baseURL:    baseURL,
				client:     boundedHTTPClient(server.Client(), baseURL, "acme/research-image"),
				repository: "acme/research-image",
				bearer:     "registry-token",
			}
			descriptor := descriptor{Digest: fixture.manifestDigest, Size: int64(len(fixture.manifestBody))}
			descriptor.Platform.OS = "linux"
			descriptor.Platform.Architecture = "amd64"
			err = session.validatePlatform(context.Background(), options.Image+":"+options.Tag, "linux/amd64", descriptor, options.ExpectedLabels)
			if err == nil || !strings.Contains(err.Error(), "registry returned HTTP 404") || strings.Contains(err.Error(), "%!w") {
				t.Fatalf("validatePlatform() error = %v, want clean HTTP 404 diagnostic", err)
			}
		})
	}
}

func TestInspectDropsCredentialsAcrossBlobRedirect(t *testing.T) {
	t.Parallel()
	options := testOptions()
	fixture := newRegistryFixture(options.ExpectedLabels)
	var leakedAuthorization atomic.Bool
	var wrongEncoding atomic.Bool
	var leakedReferer atomic.Bool
	contentServer := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		if request.Header.Get("Authorization") != "" {
			leakedAuthorization.Store(true)
		}
		if request.Header.Get("Accept-Encoding") != "identity" {
			wrongEncoding.Store(true)
		}
		if strings.Contains(request.Header.Get("Referer"), "referer-sentinel") {
			leakedReferer.Store(true)
		}
		writer.WriteHeader(http.StatusOK)
		_, _ = writer.Write(fixture.configBody)
	}))
	defer contentServer.Close()
	redirectServer := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		if request.Header.Get("Authorization") != "" {
			leakedAuthorization.Store(true)
		}
		if request.Header.Get("Accept-Encoding") != "identity" {
			wrongEncoding.Store(true)
		}
		http.Redirect(writer, request, contentServer.URL+"/config", http.StatusTemporaryRedirect)
	}))
	defer redirectServer.Close()

	var registry *httptest.Server
	registry = httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		if request.URL.Path == "/token" {
			_, _ = writer.Write([]byte(`{"token":"registry-token"}`))
			return
		}
		if request.Header.Get("Authorization") != "Bearer registry-token" {
			writer.Header().Set("WWW-Authenticate", authenticatedChallenge(registry.URL))
			writer.WriteHeader(http.StatusUnauthorized)
			return
		}
		switch request.URL.Path {
		case "/v2/acme/research-image/manifests/v1.2.3":
			writeRegistryBody(writer, fixture.indexDigest, fixture.indexBody)
		case "/v2/acme/research-image/manifests/" + fixture.manifestDigest:
			writeRegistryBody(writer, fixture.manifestDigest, fixture.manifestBody)
		case "/v2/acme/research-image/blobs/" + fixture.configDigest:
			http.Redirect(writer, request, redirectServer.URL+"/config?signature=referer-sentinel", http.StatusTemporaryRedirect)
		default:
			writer.WriteHeader(http.StatusNotFound)
		}
	}))
	defer registry.Close()
	options.RegistryURL = registry.URL
	options.HTTPClient = registry.Client()
	result, err := Inspect(context.Background(), options)
	if err != nil || result.Status != "existing" {
		t.Fatalf("Inspect() result/error = %+v/%v, want redirected config validation", result, err)
	}
	if leakedAuthorization.Load() || wrongEncoding.Load() || leakedReferer.Load() {
		t.Fatalf(
			"blob redirect leaked auth/wrong encoding/referer = %t/%t/%t",
			leakedAuthorization.Load(),
			wrongEncoding.Load(),
			leakedReferer.Load(),
		)
	}
}

func TestInspectSanitizesSignedBlobURLFromNetworkErrors(t *testing.T) {
	t.Parallel()
	options := testOptions()
	fixture := newRegistryFixture(options.ExpectedLabels)
	const sentinel = "signed-query-sentinel"
	var registry *httptest.Server
	registry = httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		switch request.URL.Path {
		case "/v2/acme/research-image/manifests/" + fixture.manifestDigest:
			writeRegistryBody(writer, fixture.manifestDigest, fixture.manifestBody)
		case "/v2/acme/research-image/blobs/" + fixture.configDigest:
			http.Redirect(writer, request, "http://127.0.0.1:1/config?signature="+sentinel, http.StatusTemporaryRedirect)
		default:
			writer.WriteHeader(http.StatusNotFound)
		}
	}))
	defer registry.Close()
	baseURL, err := url.Parse(registry.URL)
	if err != nil {
		t.Fatal(err)
	}
	session := &registrySession{
		baseURL:    baseURL,
		client:     boundedHTTPClient(registry.Client(), baseURL, "acme/research-image"),
		repository: "acme/research-image",
		bearer:     "registry-token",
	}
	descriptor := descriptor{Digest: fixture.manifestDigest, Size: int64(len(fixture.manifestBody))}
	descriptor.Platform.OS = "linux"
	descriptor.Platform.Architecture = "amd64"
	err = session.validatePlatform(context.Background(), options.Image+":"+options.Tag, "linux/amd64", descriptor, options.ExpectedLabels)
	if err == nil || strings.Contains(err.Error(), sentinel) || strings.Contains(err.Error(), "?signature=") {
		t.Fatalf("validatePlatform() error = %v, want sanitized signed URL", err)
	}
}

func TestInspectSanitizesMalformedRedirectCause(t *testing.T) {
	t.Parallel()
	options := testOptions()
	fixture := newRegistryFixture(options.ExpectedLabels)
	const sentinel = "malformed-location-sentinel"
	registry := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		switch request.URL.Path {
		case "/v2/acme/research-image/manifests/" + fixture.manifestDigest:
			writeRegistryBody(writer, fixture.manifestDigest, fixture.manifestBody)
		case "/v2/acme/research-image/blobs/" + fixture.configDigest:
			writer.Header().Set("Location", "http://[::1?signature="+sentinel)
			writer.WriteHeader(http.StatusTemporaryRedirect)
		default:
			writer.WriteHeader(http.StatusNotFound)
		}
	}))
	defer registry.Close()
	baseURL, err := url.Parse(registry.URL)
	if err != nil {
		t.Fatal(err)
	}
	session := &registrySession{
		baseURL:    baseURL,
		client:     boundedHTTPClient(registry.Client(), baseURL, "acme/research-image"),
		repository: "acme/research-image",
		bearer:     "registry-token",
	}
	descriptor := descriptor{Digest: fixture.manifestDigest, Size: int64(len(fixture.manifestBody))}
	descriptor.Platform.OS = "linux"
	descriptor.Platform.Architecture = "amd64"
	err = session.validatePlatform(context.Background(), options.Image+":"+options.Tag, "linux/amd64", descriptor, options.ExpectedLabels)
	if err == nil || strings.Contains(err.Error(), sentinel) || strings.Contains(err.Error(), "?signature=") {
		t.Fatalf("validatePlatform() error = %v, want sanitized malformed Location", err)
	}
}

func TestSanitizeRequestErrorPreservesCauseWithoutRenderingSecrets(t *testing.T) {
	t.Parallel()
	cause := errors.New("sentinel-cause")
	requestError := &url.Error{
		Op:  http.MethodGet,
		URL: "https://user:password@example.invalid/blob?signature=url-secret#fragment-secret",
		Err: fmt.Errorf("malformed Location signed-cause-secret: %w", cause),
	}
	sanitized := sanitizeRequestError(requestError)
	if !errors.Is(sanitized, cause) {
		t.Fatalf("sanitizeRequestError() lost wrapped cause: %v", sanitized)
	}
	for _, secret := range []string{"user", "password", "url-secret", "fragment-secret", "signed-cause-secret"} {
		if strings.Contains(sanitized.Error(), secret) {
			t.Fatalf("sanitizeRequestError() rendered %q in %q", secret, sanitized.Error())
		}
	}
	wrappedSentinel := &url.Error{
		Op:  http.MethodGet,
		URL: "https://example.invalid/blob",
		Err: fmt.Errorf("wrapped-sentinel-secret: %w", errRedirectBoundary),
	}
	sanitized = sanitizeRequestError(wrappedSentinel)
	if !errors.Is(sanitized, errRedirectBoundary) || strings.Contains(sanitized.Error(), "wrapped-sentinel-secret") {
		t.Fatalf("sanitizeRequestError() wrapped sentinel = %v, want preserved but redacted cause", sanitized)
	}
}

func TestInspectRejectsCrossOriginManifestAndTokenRedirects(t *testing.T) {
	t.Parallel()
	options := testOptions()
	fixture := newRegistryFixture(options.ExpectedLabels)
	var redirectReached atomic.Bool
	redirectTarget := httptest.NewServer(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {
		redirectReached.Store(true)
	}))
	defer redirectTarget.Close()

	for _, endpoint := range []string{"token", "manifest"} {
		endpoint := endpoint
		t.Run(endpoint, func(t *testing.T) {
			redirectReached.Store(false)
			var registry *httptest.Server
			registry = httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
				if request.URL.Path == "/token" {
					if endpoint == "token" {
						http.Redirect(writer, request, redirectTarget.URL, http.StatusTemporaryRedirect)
						return
					}
					_, _ = writer.Write([]byte(`{"token":"registry-token"}`))
					return
				}
				if request.Header.Get("Authorization") == "" {
					writer.Header().Set("WWW-Authenticate", authenticatedChallenge(registry.URL))
					writer.WriteHeader(http.StatusUnauthorized)
					return
				}
				if endpoint == "manifest" {
					http.Redirect(writer, request, redirectTarget.URL, http.StatusTemporaryRedirect)
					return
				}
				writeRegistryBody(writer, fixture.indexDigest, fixture.indexBody)
			}))
			defer registry.Close()
			localOptions := options
			localOptions.RegistryURL = registry.URL
			localOptions.HTTPClient = registry.Client()
			_, err := Inspect(context.Background(), localOptions)
			if err == nil || !strings.Contains(err.Error(), "redirect") || redirectReached.Load() {
				t.Fatalf("Inspect() error/reached = %v/%t, want preflight redirect rejection", err, redirectReached.Load())
			}
		})
	}
}

func TestBoundedHTTPClientOverridesUnsafeAmbientPolicy(t *testing.T) {
	t.Parallel()
	baseURL, err := http.NewRequest(http.MethodGet, "https://ghcr.io", nil)
	if err != nil {
		t.Fatal(err)
	}
	source := &http.Client{
		Timeout: time.Hour,
		Jar:     testCookieJar{},
		CheckRedirect: func(*http.Request, []*http.Request) error {
			return nil
		},
	}
	client := boundedHTTPClient(source, baseURL.URL, "acme/research-image")
	if client.Timeout != maximumRequestDuration || client.Jar != nil || client.CheckRedirect == nil {
		t.Fatalf("boundedHTTPClient() timeout/jar/has-redirect = %s/%T/%t", client.Timeout, client.Jar, client.CheckRedirect != nil)
	}
}

func TestRegistryResponseBodyLimitsAreEnforced(t *testing.T) {
	t.Parallel()
	tests := []struct {
		name   string
		status int
		size   int
	}{
		{name: "successful object", status: http.StatusOK, size: maximumBodyBytes + 1},
		{name: "authentication response", status: http.StatusUnauthorized, size: maximumTokenBytes + 1},
	}
	for _, test := range tests {
		test := test
		t.Run(test.name, func(t *testing.T) {
			server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, _ *http.Request) {
				writer.WriteHeader(test.status)
				_, _ = writer.Write([]byte(strings.Repeat("x", test.size)))
			}))
			defer server.Close()
			baseURL, err := url.Parse(server.URL)
			if err != nil {
				t.Fatal(err)
			}
			session := &registrySession{
				baseURL:    baseURL,
				client:     boundedHTTPClient(server.Client(), baseURL, "acme/research-image"),
				repository: "acme/research-image",
				bearer:     "registry-token",
			}
			_, _, err = session.request(context.Background(), "manifests/v1.2.3", manifestAccept)
			if err == nil || !strings.Contains(err.Error(), "byte limit") {
				t.Fatalf("request() error = %v, want body-limit rejection", err)
			}
		})
	}
}

func TestRegistryRedirectCountIsBounded(t *testing.T) {
	t.Parallel()
	var observations atomic.Int32
	var server *httptest.Server
	server = httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		observations.Add(1)
		next := *request.URL
		query := next.Query()
		query.Set("hop", fmt.Sprint(observations.Load()))
		next.RawQuery = query.Encode()
		http.Redirect(writer, request, server.URL+next.RequestURI(), http.StatusTemporaryRedirect)
	}))
	defer server.Close()
	baseURL, err := url.Parse(server.URL)
	if err != nil {
		t.Fatal(err)
	}
	session := &registrySession{
		baseURL:    baseURL,
		client:     boundedHTTPClient(server.Client(), baseURL, "acme/research-image"),
		repository: "acme/research-image",
		bearer:     "registry-token",
	}
	_, _, err = session.request(context.Background(), "manifests/v1.2.3", manifestAccept)
	if err == nil || !strings.Contains(err.Error(), "request bound") || observations.Load() != maximumRedirects+1 {
		t.Fatalf("request() error/observations = %v/%d, want bounded redirect failure", err, observations.Load())
	}
}

type testCookieJar struct{}

func (testCookieJar) SetCookies(*url.URL, []*http.Cookie) {}
func (testCookieJar) Cookies(*url.URL) []*http.Cookie     { return nil }

type roundTripFunc func(*http.Request) (*http.Response, error)

func (function roundTripFunc) RoundTrip(request *http.Request) (*http.Response, error) {
	return function(request)
}

func TestBoundedRoundTripperRejectsEncodedAndOversizedHeaders(t *testing.T) {
	t.Parallel()
	request, err := http.NewRequest(http.MethodGet, "https://ghcr.io/v2/acme/research-image/manifests/v1.2.3", nil)
	if err != nil {
		t.Fatal(err)
	}
	for _, test := range []struct {
		name         string
		header       http.Header
		uncompressed bool
		want         string
	}{
		{name: "encoded", header: http.Header{"Content-Encoding": []string{"identity", "gzip"}}, want: "content-encoded"},
		{name: "transport decoded", header: http.Header{}, uncompressed: true, want: "content-encoded"},
		{name: "oversized headers", header: http.Header{"X-Large": []string{strings.Repeat("x", maximumHeaderBytes)}}, want: "headers exceeded"},
	} {
		test := test
		t.Run(test.name, func(t *testing.T) {
			transport := boundedRoundTripper{base: roundTripFunc(func(observed *http.Request) (*http.Response, error) {
				if observed.Header.Get("Accept-Encoding") != "identity" {
					t.Fatalf("Accept-Encoding = %q, want identity", observed.Header.Get("Accept-Encoding"))
				}
				return &http.Response{
					StatusCode:   http.StatusOK,
					Header:       test.header,
					Body:         io.NopCloser(strings.NewReader("body")),
					Uncompressed: test.uncompressed,
				}, nil
			})}
			response, err := transport.RoundTrip(request)
			if response != nil || err == nil || !strings.Contains(err.Error(), test.want) {
				t.Fatalf("RoundTrip() response/error = %v/%v, want %q", response, err, test.want)
			}
		})
	}
}

func TestBoundedRoundTripperRejectsIncompleteResponse(t *testing.T) {
	t.Parallel()
	request, err := http.NewRequest(http.MethodGet, "https://ghcr.io/v2/", nil)
	if err != nil {
		t.Fatal(err)
	}
	transport := boundedRoundTripper{base: roundTripFunc(func(*http.Request) (*http.Response, error) {
		return nil, nil
	})}
	response, err := transport.RoundTrip(request)
	if response != nil || err == nil || !strings.Contains(err.Error(), "incomplete response") {
		t.Fatalf("RoundTrip() response/error = %v/%v, want incomplete-response rejection", response, err)
	}
}

func TestSingleHeaderRejectsAmbiguousAndUnboundedValues(t *testing.T) {
	t.Parallel()
	header := http.Header{"Docker-Content-Digest": []string{"first", "second"}}
	if _, err := singleHeader(header, "Docker-Content-Digest", 128); err == nil || !strings.Contains(err.Error(), "repeated") {
		t.Fatalf("singleHeader() duplicate error = %v", err)
	}
	header = http.Header{"Docker-Content-Digest": []string{strings.Repeat("x", 129)}}
	if _, err := singleHeader(header, "Docker-Content-Digest", 128); err == nil || !strings.Contains(err.Error(), "byte limit") {
		t.Fatalf("singleHeader() size error = %v", err)
	}
}

func TestVerifyBodyDigestRequiresOneExactDigestAuthority(t *testing.T) {
	t.Parallel()
	body := []byte("exact registry bytes")
	digest := contentDigest(body)
	if err := verifyBodyDigest(body, "", digest); err != nil {
		t.Fatalf("verifyBodyDigest() descriptor-only error = %v", err)
	}
	if err := verifyBodyDigest(body, digest, ""); err != nil {
		t.Fatalf("verifyBodyDigest() header-only error = %v", err)
	}
	if err := verifyBodyDigest(body, "", ""); err == nil {
		t.Fatal("verifyBodyDigest() accepted bytes without a digest authority")
	}
	if err := verifyBodyDigest(body, "sha256:"+strings.Repeat("0", 64), digest); err == nil {
		t.Fatal("verifyBodyDigest() accepted a conflicting registry header")
	}
}

func TestInspectRejectsConfigLabelDrift(t *testing.T) {
	t.Parallel()
	options := testOptions()
	fixture := newRegistryFixture(map[string]string{
		"org.opencontainers.image.revision": strings.Repeat("f", 40),
		"org.opencontainers.image.version":  "v1.2.3",
	})
	server := registryServer(t, fixture, http.StatusOK)
	defer server.Close()
	options.RegistryURL = server.URL
	options.HTTPClient = server.Client()
	_, err := Inspect(context.Background(), options)
	if err == nil || !strings.Contains(err.Error(), "does not match") {
		t.Fatalf("Inspect() error = %v, want label drift rejection", err)
	}
}

func TestValidateOptionsBindsRevisionAndRejectsDuplicates(t *testing.T) {
	t.Parallel()
	options := testOptions()
	options.Platforms = []string{"linux/amd64", "linux/amd64"}
	if err := validateOptions(options); err == nil || !strings.Contains(err.Error(), "repeated") {
		t.Fatalf("validateOptions() error = %v, want duplicate rejection", err)
	}
	options = testOptions()
	options.ExpectedLabels["org.opencontainers.image.revision"] = strings.Repeat("f", 40)
	if err := validateOptions(options); err == nil || !strings.Contains(err.Error(), "must match") {
		t.Fatalf("validateOptions() error = %v, want revision binding", err)
	}
}

func TestParseChallengeRejectsAmbiguityAndUnboundedInput(t *testing.T) {
	t.Parallel()
	valid := `Bearer realm="https://ghcr.io/token",service="ghcr.io",scope="repository:acme/research-image:pull"`
	realm, service, scope, err := parseChallenge(valid)
	if err != nil || realm != "https://ghcr.io/token" || service != "ghcr.io" || scope != "repository:acme/research-image:pull" {
		t.Fatalf("parseChallenge(valid) = %q/%q/%q/%v", realm, service, scope, err)
	}
	tests := []string{
		valid + `,realm="https://ghcr.io/other"`,
		valid + ` trailing`,
		"Bearer " + strings.Repeat("x", maximumChallengeBytes),
	}
	for _, challenge := range tests {
		if _, _, _, err := parseChallenge(challenge); err == nil {
			t.Fatalf("parseChallenge(%q) accepted an ambiguous or unbounded challenge", challenge)
		}
	}
}

func TestWaitForRetryHonorsCancellation(t *testing.T) {
	t.Parallel()
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if err := waitForRetry(ctx, time.Hour); err != context.Canceled {
		t.Fatalf("waitForRetry() error = %v, want context.Canceled", err)
	}
}

func TestDecodeExactJSONRejectsTrailingValues(t *testing.T) {
	t.Parallel()
	var destination map[string]any
	if err := decodeExactJSON([]byte(`{"ok":true} {"extra":true}`), &destination); err == nil {
		t.Fatal("decodeExactJSON() accepted a trailing JSON value")
	}
	if err := decodeExactJSON([]byte(`{"outer":{"name":"left","name":"right"}}`), &destination); err == nil || !strings.Contains(err.Error(), "repeats name") {
		t.Fatalf("decodeExactJSON() duplicate-name error = %v", err)
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
			options := testOptions()
			options.Tag = test.tag
			options.ExpectedLabels["org.opencontainers.image.version"] = test.tag
			err := validateOptions(options)
			if (err == nil) != test.valid {
				t.Fatalf("tag %q: error = %v, want valid = %t", test.tag, err, test.valid)
			}
		})
	}
}

type failingResponseCloser struct {
	io.Reader
	err    error
	closed bool
}

func (body *failingResponseCloser) Close() error {
	body.closed = true
	return body.err
}

func TestRejectedRegistryResponseRetainsCloseFailure(t *testing.T) {
	t.Parallel()
	for _, test := range []struct {
		name   string
		header http.Header
		want   string
	}{
		{name: "headers", header: http.Header{"X-Large": []string{strings.Repeat("x", maximumHeaderBytes)}}, want: "headers exceeded"},
		{name: "encoding", header: http.Header{"Content-Encoding": []string{"gzip"}}, want: "content-encoded"},
	} {
		t.Run(test.name, func(t *testing.T) {
			closeError := errors.New("injected response close failure")
			body := &failingResponseCloser{Reader: strings.NewReader("body"), err: closeError}
			transport := boundedRoundTripper{base: roundTripFunc(func(*http.Request) (*http.Response, error) {
				return &http.Response{Header: test.header, Body: body}, nil
			})}
			request, err := http.NewRequestWithContext(t.Context(), http.MethodGet, "https://ghcr.io/v2/", nil)
			if err != nil {
				t.Fatal(err)
			}
			response, err := transport.RoundTrip(request)
			if response != nil || !body.closed || !errors.Is(err, closeError) {
				t.Fatalf("response=%v closed=%v error=%v", response, body.closed, err)
			}
			if !strings.Contains(err.Error(), test.want) || !strings.Contains(err.Error(), "close rejected registry response body") {
				t.Fatalf("lost rejection or cleanup context: %v", err)
			}
		})
	}
}

func TestInspectExistingExhaustsExactObservationBudget(t *testing.T) {
	t.Parallel()
	for _, test := range []struct {
		name   string
		delays []time.Duration
	}{
		{name: "no retries"},
		{name: "two retries", delays: []time.Duration{0, 0}},
	} {
		t.Run(test.name, func(t *testing.T) {
			options := testOptions()
			var observations atomic.Int32
			server := registryServerWithStatus(t, newRegistryFixture(options.ExpectedLabels), func() int {
				observations.Add(1)
				return http.StatusNotFound
			})
			defer server.Close()
			options.RegistryURL = server.URL
			options.HTTPClient = server.Client()
			result, err := inspectExisting(t.Context(), options, test.delays)
			budget := len(test.delays) + 1
			if observations.Load() != int32(budget) || result.Status != "" {
				t.Fatalf("observations=%d budget=%d result=%+v", observations.Load(), budget, result)
			}
			want := fmt.Sprintf("required release image %s:%s remained absent after %d authenticated observations", options.Image, options.Tag, budget)
			if err == nil || err.Error() != want {
				t.Fatalf("exhaustion error=%v, want %q", err, want)
			}
		})
	}
}

func TestInspectExistingAcceptsFinalAllowedObservation(t *testing.T) {
	t.Parallel()
	options := testOptions()
	var observations atomic.Int32
	server := registryServerWithStatus(t, newRegistryFixture(options.ExpectedLabels), func() int {
		if observations.Add(1) == 2 {
			return http.StatusOK
		}
		return http.StatusNotFound
	})
	defer server.Close()
	options.RegistryURL = server.URL
	options.HTTPClient = server.Client()
	result, err := inspectExisting(t.Context(), options, []time.Duration{0})
	if err != nil || result.Status != "existing" || observations.Load() != 2 {
		t.Fatalf("final observation result=%+v error=%v observations=%d", result, err, observations.Load())
	}
}
