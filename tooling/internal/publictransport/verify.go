package publictransport

import (
	"context"
	"crypto/tls"
	"crypto/x509"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"strings"
	"time"
)

const maximumResponseHeaderBytes = 64 << 10

// Dependencies permits deterministic client and clock substitution in tests.
// Production callers leave both fields unset.
type Dependencies struct {
	Client *http.Client
	Clock  func() time.Time
}

// Result reports the exact live observations accepted by Verify.
type Result struct {
	HTTPStatus           int
	HTTPSStatus          int
	RedirectLocation     string
	Server               string
	CertificateNotAfter  time.Time
	CertificateRemaining time.Duration
}

// Verify loads the Git authority and checks the public endpoints without
// following redirects.
func Verify(ctx context.Context, root string, dependencies Dependencies) (Result, error) {
	manifest, err := Load(root)
	if err != nil {
		return Result{}, err
	}
	timeout := time.Duration(manifest.TimeoutSeconds) * time.Second
	boundedContext, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()
	client := boundedClient(dependencies.Client, timeout)
	httpsURL, err := url.Parse(manifest.HTTPSURL)
	if err != nil {
		return Result{}, fmt.Errorf("parse validated HTTPS URL: %w", err)
	}

	httpResponse, err := requestHead(boundedContext, client, manifest.HTTPURL)
	if err != nil {
		return Result{}, fmt.Errorf("verify HTTP transport: %w", err)
	}
	if err := validateResponse(httpResponse, manifest.HTTPStatus, manifest); err != nil {
		return Result{}, fmt.Errorf("verify HTTP response: %w", err)
	}
	locations := httpResponse.Header.Values("Location")
	if len(locations) != 1 || locations[0] != manifest.RedirectLocation {
		return Result{}, fmt.Errorf("verify HTTP response: Location values = %q, want exactly %q", locations, manifest.RedirectLocation)
	}
	location := locations[0]

	httpsResponse, err := requestHead(boundedContext, client, manifest.HTTPSURL)
	if err != nil {
		return Result{}, fmt.Errorf("verify HTTPS transport: %w", err)
	}
	if err := validateResponse(httpsResponse, manifest.HTTPSStatus, manifest); err != nil {
		return Result{}, fmt.Errorf("verify HTTPS response: %w", err)
	}
	now := time.Now()
	if dependencies.Clock != nil {
		now = dependencies.Clock()
	}
	certificate, remaining, err := validateTLS(
		httpsResponse,
		now,
		manifest.MinimumCertificateRemainingDays,
		httpsURL.Hostname(),
	)
	if err != nil {
		return Result{}, fmt.Errorf("verify HTTPS TLS: %w", err)
	}
	return Result{
		HTTPStatus:           httpResponse.StatusCode,
		HTTPSStatus:          httpsResponse.StatusCode,
		RedirectLocation:     location,
		Server:               httpsResponse.Header.Get("Server"),
		CertificateNotAfter:  certificate.NotAfter,
		CertificateRemaining: remaining,
	}, nil
}

func requestHead(ctx context.Context, client *http.Client, endpoint string) (*http.Response, error) {
	request, err := http.NewRequestWithContext(ctx, http.MethodHead, endpoint, nil)
	if err != nil {
		return nil, fmt.Errorf("create HEAD request: %w", err)
	}
	request.Header.Set("User-Agent", "20w-public-transport/1")
	response, err := client.Do(request)
	if err != nil {
		return nil, err
	}
	if response.Body != nil {
		if err := drainAndCloseBody(response.Body); err != nil {
			return nil, err
		}
	}
	return response, nil
}

func drainAndCloseBody(body io.ReadCloser) error {
	var drainErr error
	if _, err := io.CopyN(io.Discard, body, 1); err != nil && !errors.Is(err, io.EOF) {
		drainErr = fmt.Errorf("drain HEAD response: %w", err)
	}
	if closeErr := body.Close(); closeErr != nil {
		closeWrapped := fmt.Errorf("close HEAD response: %w", closeErr)
		if drainErr != nil {
			return errors.Join(drainErr, closeWrapped)
		}
		return closeWrapped
	}
	return drainErr
}

func validateResponse(response *http.Response, expectedStatus int, manifest Manifest) error {
	if response.StatusCode != expectedStatus {
		return fmt.Errorf("status = %d, want %d", response.StatusCode, expectedStatus)
	}
	server := response.Header.Get("Server")
	if !strings.EqualFold(server, manifest.Server) {
		return fmt.Errorf("Server = %q, want %q case-insensitively", server, manifest.Server)
	}
	if strings.TrimSpace(response.Header.Get(manifest.RequiredHeader)) == "" {
		return fmt.Errorf("required %s header is empty", manifest.RequiredHeader)
	}
	return nil
}

func validateTLS(
	response *http.Response,
	now time.Time,
	minimumDays int,
	expectedHostname string,
) (*x509.Certificate, time.Duration, error) {
	if now.IsZero() {
		return nil, 0, errors.New("clock returned a zero time")
	}
	state := response.TLS
	if state == nil || !state.HandshakeComplete {
		return nil, 0, errors.New("HTTPS response has no completed TLS handshake")
	}
	if state.Version < tls.VersionTLS12 {
		return nil, 0, fmt.Errorf("TLS version = 0x%x, want TLS 1.2 or newer", state.Version)
	}
	if len(state.VerifiedChains) == 0 || len(state.VerifiedChains[0]) == 0 {
		return nil, 0, errors.New("HTTPS response has no system-verified certificate chain")
	}
	leaf := state.VerifiedChains[0][0]
	if err := leaf.VerifyHostname(expectedHostname); err != nil {
		return nil, 0, fmt.Errorf("verified leaf certificate does not match %q: %w", expectedHostname, err)
	}
	if now.Before(leaf.NotBefore) || !now.Before(leaf.NotAfter) {
		return nil, 0, errors.New("verified leaf certificate is outside its validity interval")
	}
	remaining := leaf.NotAfter.Sub(now)
	minimum := time.Duration(minimumDays) * 24 * time.Hour
	if remaining < minimum {
		return nil, remaining, fmt.Errorf("leaf certificate has %s remaining, want at least %s", remaining.Round(time.Second), minimum)
	}
	return leaf, remaining, nil
}

func boundedClient(source *http.Client, timeout time.Duration) *http.Client {
	client := &http.Client{}
	if source != nil {
		*client = *source
	}
	client.Timeout = timeout
	client.Jar = nil
	client.CheckRedirect = func(_ *http.Request, _ []*http.Request) error {
		return http.ErrUseLastResponse
	}
	client.Transport = boundedTransport(client.Transport, timeout)
	return client
}

func boundedTransport(source http.RoundTripper, timeout time.Duration) http.RoundTripper {
	useDefaultDialer := source == nil
	if source == nil {
		source = http.DefaultTransport
	}
	transport, ok := source.(*http.Transport)
	if !ok {
		return source
	}
	clone := transport.Clone()
	clone.DialContext = boundedDialContext(clone.DialContext, timeout, useDefaultDialer)
	clone.TLSHandshakeTimeout = timeout
	clone.ResponseHeaderTimeout = timeout
	clone.ExpectContinueTimeout = timeout
	clone.IdleConnTimeout = timeout
	clone.MaxResponseHeaderBytes = maximumResponseHeaderBytes
	clone.DisableKeepAlives = true
	if clone.TLSClientConfig == nil {
		clone.TLSClientConfig = &tls.Config{MinVersion: tls.VersionTLS12}
	} else {
		clone.TLSClientConfig = clone.TLSClientConfig.Clone()
		if clone.TLSClientConfig.MinVersion < tls.VersionTLS12 {
			clone.TLSClientConfig.MinVersion = tls.VersionTLS12
		}
	}
	return clone
}

func boundedDialContext(
	source func(context.Context, string, string) (net.Conn, error),
	timeout time.Duration,
	useDefault bool,
) func(context.Context, string, string) (net.Conn, error) {
	if source == nil || useDefault {
		source = (&net.Dialer{Timeout: timeout, KeepAlive: -1}).DialContext
	}
	return func(ctx context.Context, network, address string) (net.Conn, error) {
		boundedContext, cancel := context.WithTimeout(ctx, timeout)
		defer cancel()
		return source(boundedContext, network, address)
	}
}
