// Package releaseimage verifies an exact GHCR release-image tag or digest.
package releaseimage

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"sort"
	"strings"
	"time"

	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/strictjson"
)

const (
	ContractVersion        = "release.image-inspection.v1"
	maximumBodyBytes       = 4 * 1024 * 1024
	maximumChallengeBytes  = 4 * 1024
	maximumHeaderBytes     = 64 * 1024
	maximumRedirects       = 3
	maximumRequestDuration = 20 * time.Second
	maximumTokenBytes      = 64 * 1024
	productionBaseURL      = "https://ghcr.io"
)

var (
	digestPattern       = regexp.MustCompile(`^sha256:[0-9a-f]{64}$`)
	imagePattern        = regexp.MustCompile(`^ghcr\.io/[a-z0-9]+(?:[._/-][a-z0-9]+)*$`)
	labelKeyPattern     = regexp.MustCompile(`^[a-z0-9][a-z0-9._-]{0,127}$`)
	platformPattern     = regexp.MustCompile(`^[a-z0-9][a-z0-9._-]{0,31}/[a-z0-9][a-z0-9._-]{0,31}$`)
	revisionPattern     = regexp.MustCompile(`^[0-9a-f]{40}$`)
	tagPattern          = regexp.MustCompile(`^v(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$`)
	challengeKeyPattern = regexp.MustCompile(`^[A-Za-z][A-Za-z0-9_-]{0,63}$`)
	errRedirectBoundary = errors.New("registry redirect left the trusted URL boundary")
	errRedirectCount    = errors.New("registry redirect exceeded its request bound")
	errRedirectOrigin   = errors.New("only a registry blob request may redirect across origins")
)

var manifestAccept = strings.Join([]string{
	"application/vnd.oci.image.index.v1+json",
	"application/vnd.docker.distribution.manifest.list.v2+json",
	"application/vnd.oci.image.manifest.v1+json",
	"application/vnd.docker.distribution.manifest.v2+json",
}, ", ")

// Options binds one authenticated registry observation to a release identity.
type Options struct {
	Image          string
	Tag            string
	Digest         string
	Revision       string
	Platforms      []string
	ExpectedLabels map[string]string
	Username       string
	Token          string
	RegistryURL    string
	HTTPClient     *http.Client
}

// Result is the closed machine-readable observation returned to release CI.
type Result struct {
	ContractVersion string   `json:"contract_version"`
	Reference       string   `json:"reference"`
	Status          string   `json:"status"`
	Digest          string   `json:"digest,omitempty"`
	Platforms       []string `json:"platforms,omitempty"`
}

type descriptor struct {
	Digest   string `json:"digest"`
	Size     int64  `json:"size"`
	Platform struct {
		Architecture string `json:"architecture"`
		OS           string `json:"os"`
	} `json:"platform"`
}

type indexDocument struct {
	Manifests []descriptor `json:"manifests"`
}

type manifestDocument struct {
	Config struct {
		Digest string `json:"digest"`
		Size   int64  `json:"size"`
	} `json:"config"`
}

type imageDocument struct {
	Architecture string `json:"architecture"`
	OS           string `json:"os"`
	Config       struct {
		Labels map[string]string `json:"Labels"`
	} `json:"config"`
}

type registrySession struct {
	baseURL    *url.URL
	client     *http.Client
	repository string
	username   string
	password   string
	bearer     string
}

type responseData struct {
	body          []byte
	status        int
	digest        string
	authenticated bool
}

type boundedRoundTripper struct {
	base http.RoundTripper
}

type sanitizedRequestCause struct {
	cause error
}

func (cause sanitizedRequestCause) Error() string { return "request failed" }
func (cause sanitizedRequestCause) Unwrap() error { return cause.cause }
func (cause sanitizedRequestCause) Timeout() bool {
	var timeout interface{ Timeout() bool }
	return errors.As(cause.cause, &timeout) && timeout.Timeout()
}
func (cause sanitizedRequestCause) Temporary() bool {
	var temporary interface{ Temporary() bool }
	return errors.As(cause.cause, &temporary) && temporary.Temporary()
}

func (transport boundedRoundTripper) RoundTrip(request *http.Request) (*http.Response, error) {
	closedRequest := request.Clone(request.Context())
	closedRequest.Header = request.Header.Clone()
	closedRequest.Header.Set("Accept-Encoding", "identity")
	response, err := transport.base.RoundTrip(closedRequest)
	if err != nil {
		return nil, err
	}
	if response == nil || response.Body == nil {
		return nil, errors.New("registry transport returned an incomplete response")
	}
	if headerSize(response.Header) > maximumHeaderBytes {
		_ = response.Body.Close()
		return nil, errors.New("registry response headers exceeded their byte limit")
	}
	if response.Uncompressed || !hasIdentityEncoding(response.Header.Values("Content-Encoding")) {
		_ = response.Body.Close()
		return nil, errors.New("registry returned a content-encoded response despite requesting identity bytes")
	}
	return response, nil
}

// Inspect reports an authenticated absence or validates the digest, platform
// set, and config labels of an existing exact tag or digest.
func Inspect(ctx context.Context, options Options) (Result, error) {
	if err := validateOptions(options); err != nil {
		return Result{}, err
	}
	session, err := newRegistrySession(options)
	if err != nil {
		return Result{}, err
	}
	locator := options.Tag
	reference := options.Image + ":" + options.Tag
	expectedDigest := ""
	if options.Digest != "" {
		locator = options.Digest
		reference = options.Image + "@" + options.Digest
		expectedDigest = options.Digest
	}
	tagResult, err := session.get(ctx, "manifests/"+locator, manifestAccept, expectedDigest, 0)
	if err != nil {
		return Result{}, fmt.Errorf("resolve exact image reference %s: %w", reference, err)
	}
	if tagResult.status == http.StatusNotFound {
		if !tagResult.authenticated {
			return Result{}, errors.New("registry returned an unauthenticated not-found response")
		}
		return Result{ContractVersion: ContractVersion, Reference: reference, Status: "absent"}, nil
	}
	if tagResult.status != http.StatusOK {
		return Result{}, fmt.Errorf("registry returned HTTP %d for %s", tagResult.status, reference)
	}
	descriptors, platforms, err := validateIndex(tagResult.body, options.Platforms)
	if err != nil {
		return Result{}, fmt.Errorf("validate release image index %s: %w", reference, err)
	}
	for _, platform := range platforms {
		if err := session.validatePlatform(ctx, reference, platform, descriptors[platform], options.ExpectedLabels); err != nil {
			return Result{}, err
		}
	}
	return Result{
		ContractVersion: ContractVersion,
		Reference:       reference,
		Status:          "existing",
		Digest:          tagResult.digest,
		Platforms:       platforms,
	}, nil
}

// InspectExisting retries only an authenticated absence so registry
// propagation after a completed push cannot be mistaken for a failed release.
// Authentication, integrity, rate-limit, server, and cancellation failures
// remain immediate failures.
func InspectExisting(ctx context.Context, options Options) (Result, error) {
	return inspectExisting(ctx, options, []time.Duration{2 * time.Second, 4 * time.Second, 8 * time.Second})
}

func inspectExisting(ctx context.Context, options Options, retryDelays []time.Duration) (Result, error) {
	for observation := 1; ; observation++ {
		result, err := Inspect(ctx, options)
		if err != nil {
			return Result{}, err
		}
		if result.Status == "existing" {
			return result, nil
		}
		if observation > len(retryDelays) {
			return Result{}, fmt.Errorf(
				"required release image %s remained absent after %d authenticated observations",
				result.Reference,
				observation,
			)
		}
		if err := waitForRetry(ctx, retryDelays[observation-1]); err != nil {
			return Result{}, fmt.Errorf("wait to reinspect required release image: %w", err)
		}
	}
}

func waitForRetry(ctx context.Context, delay time.Duration) error {
	timer := time.NewTimer(delay)
	defer timer.Stop()
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-timer.C:
		return nil
	}
}

func validateOptions(options Options) error {
	if !imagePattern.MatchString(options.Image) || len(options.Image) > 240 {
		return errors.New("image must be a bounded lowercase ghcr.io path")
	}
	if (options.Tag == "") == (options.Digest == "") {
		return errors.New("exactly one tag or digest is required")
	}
	if options.Tag != "" && !tagPattern.MatchString(options.Tag) {
		return errors.New("tag must have the exact form vMAJOR.MINOR.PATCH")
	}
	if options.Digest != "" && !digestPattern.MatchString(options.Digest) {
		return errors.New("digest must be sha256 followed by 64 lowercase hexadecimal digits")
	}
	if !revisionPattern.MatchString(options.Revision) {
		return errors.New("revision must be a lowercase 40-character Git commit")
	}
	if options.Username == "" || options.Token == "" || len(options.Username) > 128 || len(options.Token) > 4096 {
		return errors.New("bounded GHCR credentials are required")
	}
	if len(options.Platforms) == 0 || len(options.Platforms) > 8 {
		return errors.New("one to eight expected platforms are required")
	}
	if len(options.ExpectedLabels) == 0 || len(options.ExpectedLabels) > 16 {
		return errors.New("one to sixteen expected labels are required")
	}
	if options.ExpectedLabels["org.opencontainers.image.revision"] != options.Revision {
		return errors.New("expected revision label must match the requested source revision")
	}
	return validateCollections(options.Platforms, options.ExpectedLabels)
}

func validateCollections(platforms []string, labels map[string]string) error {
	seen := make(map[string]bool, len(platforms))
	for _, platform := range platforms {
		if !platformPattern.MatchString(platform) || seen[platform] {
			return fmt.Errorf("invalid or repeated expected platform %q", platform)
		}
		seen[platform] = true
	}
	for key, value := range labels {
		if !labelKeyPattern.MatchString(key) || value == "" || len(value) > 512 || strings.ContainsAny(value, "\r\n") {
			return fmt.Errorf("invalid expected label %q", key)
		}
	}
	return nil
}

func newRegistrySession(options Options) (*registrySession, error) {
	base := options.RegistryURL
	if base == "" {
		base = productionBaseURL
	}
	parsed, err := url.Parse(base)
	if err != nil || parsed.User != nil || parsed.Opaque != "" || parsed.RawPath != "" || parsed.RawQuery != "" || parsed.ForceQuery || parsed.Fragment != "" || parsed.Path != "" || parsed.Host == "" || (parsed.Scheme != "http" && parsed.Scheme != "https") {
		return nil, errors.New("registry URL is invalid")
	}
	if options.RegistryURL == "" && (parsed.Scheme != "https" || parsed.Host != "ghcr.io") {
		return nil, errors.New("production registry must be https://ghcr.io")
	}
	repository := strings.TrimPrefix(options.Image, "ghcr.io/")
	client := boundedHTTPClient(options.HTTPClient, parsed, repository)
	return &registrySession{
		baseURL:    parsed,
		client:     client,
		repository: repository,
		username:   options.Username,
		password:   options.Token,
	}, nil
}

func boundedHTTPClient(source *http.Client, baseURL *url.URL, repository string) *http.Client {
	if source == nil {
		source = &http.Client{}
	}
	client := *source
	client.Jar = nil
	if client.Timeout <= 0 || client.Timeout > maximumRequestDuration {
		client.Timeout = maximumRequestDuration
	}
	transport := client.Transport
	if transport == nil {
		transport = http.DefaultTransport
	}
	if concrete, ok := transport.(*http.Transport); ok {
		cloned := concrete.Clone()
		cloned.DisableCompression = true
		cloned.MaxResponseHeaderBytes = maximumHeaderBytes
		transport = cloned
	}
	client.Transport = boundedRoundTripper{base: transport}
	client.CheckRedirect = redirectPolicy(baseURL, repository)
	return &client
}

func redirectPolicy(baseURL *url.URL, repository string) func(*http.Request, []*http.Request) error {
	blobPrefix := "/v2/" + repository + "/blobs/sha256:"
	return func(request *http.Request, via []*http.Request) error {
		if len(via) == 0 || len(via) > maximumRedirects {
			return errRedirectCount
		}
		if request.URL.User != nil || request.URL.Host == "" || request.URL.Fragment != "" || request.URL.Scheme != baseURL.Scheme {
			return errRedirectBoundary
		}
		crossOrigin := !sameOrigin(request.URL, baseURL)
		if crossOrigin && !strings.HasPrefix(via[0].URL.Path, blobPrefix) {
			return errRedirectOrigin
		}
		request.Header.Set("Accept-Encoding", "identity")
		if crossOrigin {
			request.Header.Del("Authorization")
			request.Header.Del("Cookie")
			request.Header.Del("Proxy-Authorization")
			request.Header.Del("Referer")
		}
		return nil
	}
}

func sameOrigin(left, right *url.URL) bool {
	return strings.EqualFold(left.Scheme, right.Scheme) && strings.EqualFold(left.Host, right.Host)
}

func (session *registrySession) get(ctx context.Context, suffix, accept, expectedDigest string, expectedSize int64) (responseData, error) {
	result, challenge, err := session.request(ctx, suffix, accept)
	if err != nil {
		return responseData{}, err
	}
	if result.status == http.StatusUnauthorized && session.bearer == "" {
		if err := session.authorize(ctx, challenge); err != nil {
			return responseData{}, err
		}
		result, _, err = session.request(ctx, suffix, accept)
		if err != nil {
			return responseData{}, err
		}
	}
	if result.status == http.StatusUnauthorized || result.status == http.StatusForbidden || result.status == http.StatusTooManyRequests || result.status >= 500 {
		return responseData{}, fmt.Errorf("registry request failed closed with HTTP %d", result.status)
	}
	if result.status == http.StatusOK {
		if err := verifyBodyDigest(result.body, result.digest, expectedDigest); err != nil {
			return responseData{}, err
		}
		if expectedSize > 0 && int64(len(result.body)) != expectedSize {
			return responseData{}, errors.New("registry object size does not match the requested descriptor size")
		}
	}
	return result, nil
}

func (session *registrySession) request(ctx context.Context, suffix, accept string) (responseData, string, error) {
	target := session.baseURL.ResolveReference(&url.URL{Path: "/v2/" + session.repository + "/" + suffix})
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, target.String(), nil)
	if err != nil {
		return responseData{}, "", err
	}
	if accept != "" {
		request.Header.Set("Accept", accept)
	}
	request.Header.Set("Accept-Encoding", "identity")
	authenticated := session.bearer != ""
	if authenticated {
		request.Header.Set("Authorization", "Bearer "+session.bearer)
	}
	response, err := session.client.Do(request)
	if err != nil {
		return responseData{}, "", sanitizeRequestError(err)
	}
	defer response.Body.Close()
	digestHeader := ""
	challengeHeader := ""
	if response.StatusCode == http.StatusOK {
		digestHeader, err = singleHeader(response.Header, "Docker-Content-Digest", 128)
		if err != nil {
			return responseData{}, "", err
		}
	}
	if response.StatusCode == http.StatusUnauthorized {
		challengeHeader, err = singleHeader(response.Header, "WWW-Authenticate", maximumChallengeBytes)
		if err != nil {
			return responseData{}, "", err
		}
	}
	bodyLimit := int64(maximumBodyBytes)
	if response.StatusCode != http.StatusOK {
		bodyLimit = maximumTokenBytes
	}
	body, err := readBounded(response.Body, bodyLimit)
	if err != nil {
		return responseData{}, "", err
	}
	return responseData{
		body:          body,
		status:        response.StatusCode,
		digest:        digestHeader,
		authenticated: authenticated,
	}, challengeHeader, nil
}

func (session *registrySession) authorize(ctx context.Context, challenge string) error {
	realm, service, scope, err := parseChallenge(challenge)
	if err != nil {
		return err
	}
	if scope != "repository:"+session.repository+":pull" {
		return errors.New("registry challenge requested an unexpected token scope")
	}
	realmURL, err := url.Parse(realm)
	if err != nil || realmURL.User != nil || realmURL.Opaque != "" || realmURL.RawPath != "" || realmURL.ForceQuery || realmURL.Fragment != "" || !sameOrigin(realmURL, session.baseURL) {
		return errors.New("registry challenge left the trusted token origin")
	}
	query := realmURL.Query()
	query.Set("service", service)
	query.Set("scope", scope)
	realmURL.RawQuery = query.Encode()
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, realmURL.String(), nil)
	if err != nil {
		return err
	}
	request.Header.Set("Accept", "application/json")
	request.Header.Set("Accept-Encoding", "identity")
	request.SetBasicAuth(session.username, session.password)
	response, err := session.client.Do(request)
	if err != nil {
		return sanitizeRequestError(err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return fmt.Errorf("GHCR token exchange failed with HTTP %d", response.StatusCode)
	}
	body, err := readBounded(response.Body, maximumTokenBytes)
	if err != nil {
		return err
	}
	var tokenResponse struct {
		Token       string `json:"token"`
		AccessToken string `json:"access_token"`
	}
	if err := decodeExactJSON(body, &tokenResponse); err != nil {
		return fmt.Errorf("decode GHCR token: %w", err)
	}
	session.bearer = tokenResponse.Token
	if tokenResponse.Token != "" && tokenResponse.AccessToken != "" && tokenResponse.Token != tokenResponse.AccessToken {
		return errors.New("GHCR token response contained conflicting token identities")
	}
	if session.bearer == "" {
		session.bearer = tokenResponse.AccessToken
	}
	if session.bearer == "" || len(session.bearer) > 8192 || strings.ContainsAny(session.bearer, "\r\n") {
		return errors.New("GHCR token response is empty or invalid")
	}
	return nil
}

func parseChallenge(challenge string) (string, string, string, error) {
	if len(challenge) == 0 || len(challenge) > maximumChallengeBytes {
		return "", "", "", errors.New("registry Bearer challenge exceeded its byte limit")
	}
	scheme, parameters, found := strings.Cut(strings.TrimSpace(challenge), " ")
	if !found || !strings.EqualFold(scheme, "Bearer") {
		return "", "", "", errors.New("registry did not return a Bearer challenge")
	}
	fields, err := parseChallengeFields(strings.TrimSpace(parameters))
	if err != nil {
		return "", "", "", err
	}
	if fields["realm"] == "" || fields["service"] == "" || fields["scope"] == "" {
		return "", "", "", errors.New("registry Bearer challenge is incomplete")
	}
	if len(fields["realm"]) > 2048 || len(fields["service"]) > 256 || len(fields["scope"]) > 512 {
		return "", "", "", errors.New("registry Bearer challenge field exceeded its byte limit")
	}
	return fields["realm"], fields["service"], fields["scope"], nil
}

func parseChallengeFields(parameters string) (map[string]string, error) {
	fields := make(map[string]string)
	for parameters != "" {
		equals := strings.IndexByte(parameters, '=')
		if equals <= 0 {
			return nil, errors.New("registry Bearer challenge has malformed parameters")
		}
		key := strings.TrimSpace(parameters[:equals])
		parameters = strings.TrimSpace(parameters[equals+1:])
		if !challengeKeyPattern.MatchString(key) || len(parameters) < 2 || parameters[0] != '"' {
			return nil, errors.New("registry Bearer challenge has malformed parameters")
		}
		parameters = parameters[1:]
		closing := strings.IndexByte(parameters, '"')
		if closing <= 0 || strings.ContainsAny(parameters[:closing], "\\\r\n") {
			return nil, errors.New("registry Bearer challenge has malformed quoted values")
		}
		key = strings.ToLower(key)
		if _, duplicate := fields[key]; duplicate {
			return nil, fmt.Errorf("registry Bearer challenge repeated %s", key)
		}
		fields[key] = parameters[:closing]
		parameters = strings.TrimSpace(parameters[closing+1:])
		if parameters == "" {
			break
		}
		if parameters[0] != ',' {
			return nil, errors.New("registry Bearer challenge has malformed separators")
		}
		parameters = strings.TrimSpace(parameters[1:])
		if parameters == "" {
			return nil, errors.New("registry Bearer challenge has a trailing separator")
		}
	}
	return fields, nil
}

func verifyBodyDigest(body []byte, headerDigest, expectedDigest string) error {
	digest := sha256.Sum256(body)
	actual := "sha256:" + hex.EncodeToString(digest[:])
	if headerDigest == "" && expectedDigest == "" {
		return errors.New("registry content digest is absent")
	}
	if headerDigest != "" && (!digestPattern.MatchString(headerDigest) || headerDigest != actual) {
		return errors.New("registry content digest is absent or does not match the response bytes")
	}
	if expectedDigest != "" && expectedDigest != actual {
		return errors.New("registry object bytes do not match the requested descriptor digest")
	}
	return nil
}

func validateIndex(body []byte, expected []string) (map[string]descriptor, []string, error) {
	var document indexDocument
	if err := decodeExactJSON(body, &document); err != nil {
		return nil, nil, fmt.Errorf("decode image index: %w", err)
	}
	if len(document.Manifests) == 0 || len(document.Manifests) > 32 {
		return nil, nil, errors.New("image index has an invalid descriptor count")
	}
	observed := make(map[string]descriptor, len(expected))
	for _, descriptor := range document.Manifests {
		if !digestPattern.MatchString(descriptor.Digest) || descriptor.Size <= 0 || descriptor.Size > maximumBodyBytes {
			return nil, nil, errors.New("image index has an invalid or oversized descriptor")
		}
		platform := descriptor.Platform.OS + "/" + descriptor.Platform.Architecture
		if platform == "unknown/unknown" {
			continue
		}
		if !platformPattern.MatchString(platform) || observed[platform].Digest != "" {
			return nil, nil, fmt.Errorf("image index has an invalid descriptor for platform %q", platform)
		}
		observed[platform] = descriptor
	}
	platforms := make([]string, 0, len(observed))
	for platform := range observed {
		platforms = append(platforms, platform)
	}
	sort.Strings(platforms)
	want := append([]string(nil), expected...)
	sort.Strings(want)
	if strings.Join(platforms, "\n") != strings.Join(want, "\n") {
		return nil, nil, fmt.Errorf("platforms %v do not match expected %v", platforms, want)
	}
	return observed, platforms, nil
}

func (session *registrySession) validatePlatform(ctx context.Context, reference, platform string, descriptor descriptor, labels map[string]string) error {
	manifest, err := session.get(ctx, "manifests/"+descriptor.Digest, manifestAccept, descriptor.Digest, descriptor.Size)
	if err != nil {
		return fmt.Errorf("resolve %s manifest for %s: %w", reference, platform, err)
	}
	if manifest.status != http.StatusOK {
		return fmt.Errorf("resolve %s manifest for %s: registry returned HTTP %d", reference, platform, manifest.status)
	}
	var manifestDocument manifestDocument
	if err := decodeExactJSON(manifest.body, &manifestDocument); err != nil {
		return fmt.Errorf("decode %s manifest for %s: %w", reference, platform, err)
	}
	if !digestPattern.MatchString(manifestDocument.Config.Digest) || manifestDocument.Config.Size <= 0 || manifestDocument.Config.Size > maximumBodyBytes {
		return fmt.Errorf("%s manifest has an invalid config descriptor for %s", reference, platform)
	}
	config, err := session.get(ctx, "blobs/"+manifestDocument.Config.Digest, "application/vnd.oci.image.config.v1+json", manifestDocument.Config.Digest, manifestDocument.Config.Size)
	if err != nil {
		return fmt.Errorf("resolve %s config for %s: %w", reference, platform, err)
	}
	if config.status != http.StatusOK {
		return fmt.Errorf("resolve %s config for %s: registry returned HTTP %d", reference, platform, config.status)
	}
	return validateImageConfig(config.body, reference, platform, labels)
}

func validateImageConfig(body []byte, reference, platform string, labels map[string]string) error {
	var document imageDocument
	if err := decodeExactJSON(body, &document); err != nil {
		return fmt.Errorf("decode %s config for %s: %w", reference, platform, err)
	}
	if document.OS+"/"+document.Architecture != platform {
		return fmt.Errorf("%s config reports platform %s/%s, expected %s", reference, document.OS, document.Architecture, platform)
	}
	for key, expected := range labels {
		if document.Config.Labels[key] != expected {
			return fmt.Errorf("%s config label %s does not match the requested release", reference, key)
		}
	}
	return nil
}

func readBounded(reader io.Reader, maximum int64) ([]byte, error) {
	body, err := io.ReadAll(io.LimitReader(reader, maximum+1))
	if err != nil {
		return nil, err
	}
	if int64(len(body)) > maximum {
		return nil, errors.New("registry response exceeded its byte limit")
	}
	return body, nil
}

func headerSize(header http.Header) int {
	total := 0
	for key, values := range header {
		total += len(key)
		for _, value := range values {
			total += len(value)
		}
	}
	return total
}

func singleHeader(header http.Header, key string, maximum int) (string, error) {
	values := header.Values(key)
	if len(values) > 1 {
		return "", fmt.Errorf("registry response repeated %s", key)
	}
	if len(values) == 0 {
		return "", nil
	}
	if len(values[0]) > maximum {
		return "", fmt.Errorf("registry response %s exceeded its byte limit", key)
	}
	return values[0], nil
}

func sanitizeRequestError(err error) error {
	var requestError *url.Error
	if !errors.As(err, &requestError) {
		return err
	}
	sanitized := *requestError
	if isSafeRequestCause(requestError.Err) {
		sanitized.Err = requestError.Err
	} else {
		sanitized.Err = sanitizedRequestCause{cause: requestError.Err}
	}
	target, parseErr := url.Parse(requestError.URL)
	if parseErr != nil {
		sanitized.URL = "<invalid-url>"
		return &sanitized
	}
	target.User = nil
	target.RawQuery = ""
	target.ForceQuery = false
	target.Fragment = ""
	sanitized.URL = target.String()
	return &sanitized
}

func isSafeRequestCause(err error) bool {
	return err == errRedirectBoundary || err == errRedirectCount || err == errRedirectOrigin
}

func hasIdentityEncoding(values []string) bool {
	for _, value := range values {
		for _, encoding := range strings.Split(value, ",") {
			if !strings.EqualFold(strings.TrimSpace(encoding), "identity") {
				return false
			}
		}
	}
	return true
}

func decodeExactJSON(body []byte, destination any) error {
	if err := strictjson.Validate(body, 64); err != nil {
		return fmt.Errorf("validate unambiguous JSON: %w", err)
	}
	decoder := json.NewDecoder(bytes.NewReader(body))
	if err := decoder.Decode(destination); err != nil {
		return err
	}
	var trailing any
	if err := decoder.Decode(&trailing); err != io.EOF {
		if err != nil {
			return err
		}
		return errors.New("trailing JSON value")
	}
	return nil
}
