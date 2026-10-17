package releasecheck

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os/exec"
	"regexp"
	"strings"
	"sync"
	"time"

	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/releasetag"
)

const (
	maximumAnnotatedTags = 4
	maximumGHOutputBytes = 1024 * 1024
)

var (
	repositoryPattern = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}/[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$`)
	releaseTagPattern = regexp.MustCompile(releasetag.Pattern)
	commitPattern     = regexp.MustCompile(`^[0-9a-f]{40}$`)
)

// GitObject is the only GitHub Git-object state needed to peel a release tag.
type GitObject struct {
	Type string
	SHA  string
}

// GitObjectResolver resolves a ref or annotated-tag object without granting
// mutation authority to the verifier.
type GitObjectResolver interface {
	ResolveTagRef(context.Context, string, string) (GitObject, error)
	ResolveAnnotatedTag(context.Context, string, string) (GitObject, error)
}

// VerifyTagBinding peels at most four annotated tags and requires the final
// commit to equal the release commit.
func VerifyTagBinding(
	ctx context.Context,
	repository, tag, expectedCommit string,
	resolver GitObjectResolver,
) error {
	if !repositoryPattern.MatchString(repository) {
		return errors.New("GitHub repository must be an owner/name pair")
	}
	if !releaseTagPattern.MatchString(tag) {
		return errors.New("release tag must be vMAJOR.MINOR.PATCH or vMAJOR.MINOR.PATCH-rc.N")
	}
	if !commitPattern.MatchString(expectedCommit) {
		return errors.New("release commit must be a lowercase 40-character Git identity")
	}
	if resolver == nil {
		return errors.New("GitHub Git-object resolver is required")
	}
	object, err := resolver.ResolveTagRef(ctx, repository, tag)
	if err != nil {
		return fmt.Errorf("resolve remote release tag: %w", err)
	}
	seen := make(map[string]struct{})
	for depth := 0; depth <= maximumAnnotatedTags; depth++ {
		if !commitPattern.MatchString(object.SHA) {
			return errors.New("remote release tag contains a malformed Git object identity")
		}
		switch object.Type {
		case "commit":
			if object.SHA != expectedCommit {
				return fmt.Errorf("remote release tag peels to %s, not %s", object.SHA, expectedCommit)
			}
			return nil
		case "tag":
			if depth == maximumAnnotatedTags {
				return errors.New("remote release tag exceeds four annotated-tag objects")
			}
			if _, exists := seen[object.SHA]; exists {
				return errors.New("remote release tag contains an annotated-tag cycle")
			}
			seen[object.SHA] = struct{}{}
			object, err = resolver.ResolveAnnotatedTag(ctx, repository, object.SHA)
			if err != nil {
				return fmt.Errorf("resolve annotated release tag: %w", err)
			}
		default:
			return fmt.Errorf("remote release tag resolves to unsupported object type %s", valueOrMissing(object.Type))
		}
	}
	return errors.New("remote release tag exceeds its peel bound")
}

// GHResolver resolves Git objects through the authenticated GitHub CLI.
type GHResolver struct{}

func (GHResolver) ResolveTagRef(ctx context.Context, repository, tag string) (GitObject, error) {
	return runGHObjectRequest(ctx, fmt.Sprintf("repos/%s/git/ref/tags/%s", repository, tag))
}

func (GHResolver) ResolveAnnotatedTag(ctx context.Context, repository, sha string) (GitObject, error) {
	return runGHObjectRequest(ctx, fmt.Sprintf("repos/%s/git/tags/%s", repository, sha))
}

func runGHObjectRequest(ctx context.Context, endpoint string) (GitObject, error) {
	requestContext, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()
	stdout := &boundedBuffer{limit: maximumGHOutputBytes}
	stderr := &boundedBuffer{limit: maximumGHOutputBytes}
	command := exec.CommandContext(
		requestContext,
		"gh",
		"api",
		endpoint,
		"-H", githubAPIAcceptHeader,
		"-H", githubAPIVersionHeader,
		"--jq", ".object",
	)
	command.Stdout = stdout
	command.Stderr = stderr
	command.WaitDelay = 5 * time.Second
	if err := command.Run(); err != nil {
		if requestContext.Err() != nil {
			return GitObject{}, fmt.Errorf("GitHub API request: %w", requestContext.Err())
		}
		return GitObject{}, fmt.Errorf("GitHub API request failed: %w: %s", err, strings.TrimSpace(stderr.String()))
	}
	if stdout.Exceeded() || stderr.Exceeded() {
		return GitObject{}, errors.New("GitHub API response exceeds its bounded output size")
	}
	decoder := json.NewDecoder(bytes.NewReader(stdout.Bytes()))
	var response struct {
		Type string `json:"type"`
		SHA  string `json:"sha"`
	}
	if err := decoder.Decode(&response); err != nil {
		return GitObject{}, fmt.Errorf("decode GitHub Git object: %w", err)
	}
	if err := decoder.Decode(&struct{}{}); !errors.Is(err, io.EOF) {
		return GitObject{}, errors.New("GitHub Git object response contains trailing data")
	}
	return GitObject{Type: response.Type, SHA: response.SHA}, nil
}

type boundedBuffer struct {
	mutex    sync.Mutex
	buffer   bytes.Buffer
	limit    int
	exceeded bool
}

func (writer *boundedBuffer) Write(body []byte) (int, error) {
	writer.mutex.Lock()
	defer writer.mutex.Unlock()
	original := len(body)
	remaining := writer.limit - writer.buffer.Len()
	if remaining < 0 {
		remaining = 0
	}
	if len(body) > remaining {
		body = body[:remaining]
		writer.exceeded = true
	}
	if _, err := writer.buffer.Write(body); err != nil {
		return 0, fmt.Errorf("capture bounded GitHub command output: %w", err)
	}
	return original, nil
}

func (writer *boundedBuffer) Bytes() []byte {
	writer.mutex.Lock()
	defer writer.mutex.Unlock()
	return bytes.Clone(writer.buffer.Bytes())
}

func (writer *boundedBuffer) String() string {
	return string(writer.Bytes())
}

func (writer *boundedBuffer) Exceeded() bool {
	writer.mutex.Lock()
	defer writer.mutex.Unlock()
	return writer.exceeded
}

func valueOrMissing(value string) string {
	if value == "" {
		return "<missing>"
	}
	return value
}
