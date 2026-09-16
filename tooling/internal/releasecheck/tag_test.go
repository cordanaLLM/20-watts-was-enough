package releasecheck

import (
	"context"
	"errors"
	"strings"
	"testing"
)

const expectedTagCommit = "0123456789abcdef0123456789abcdef01234567"

type fakeGitObjectResolver struct {
	ref  GitObject
	tags map[string]GitObject
	err  error
}

func (resolver *fakeGitObjectResolver) ResolveTagRef(context.Context, string, string) (GitObject, error) {
	if resolver.err != nil {
		return GitObject{}, resolver.err
	}
	return resolver.ref, nil
}

func (resolver *fakeGitObjectResolver) ResolveAnnotatedTag(_ context.Context, _ string, sha string) (GitObject, error) {
	object, exists := resolver.tags[sha]
	if !exists {
		return GitObject{}, errors.New("missing fake annotated tag")
	}
	return object, nil
}

func TestVerifyTagBindingAcceptsDirectAndBoundedAnnotatedTags(t *testing.T) {
	t.Parallel()
	tests := []struct {
		name     string
		resolver *fakeGitObjectResolver
	}{
		{
			name: "direct commit",
			resolver: &fakeGitObjectResolver{
				ref: GitObject{Type: "commit", SHA: expectedTagCommit},
			},
		},
		{
			name: "four annotated tags",
			resolver: &fakeGitObjectResolver{
				ref: GitObject{Type: "tag", SHA: strings.Repeat("1", 40)},
				tags: map[string]GitObject{
					strings.Repeat("1", 40): {Type: "tag", SHA: strings.Repeat("2", 40)},
					strings.Repeat("2", 40): {Type: "tag", SHA: strings.Repeat("3", 40)},
					strings.Repeat("3", 40): {Type: "tag", SHA: strings.Repeat("4", 40)},
					strings.Repeat("4", 40): {Type: "commit", SHA: expectedTagCommit},
				},
			},
		},
	}
	for _, test := range tests {
		test := test
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()
			if err := VerifyTagBinding(context.Background(), "cordanaLLM/20-watts-was-enough", "v0.3.0", expectedTagCommit, test.resolver); err != nil {
				t.Fatalf("VerifyTagBinding() error = %v", err)
			}
		})
	}
}

func TestVerifyTagBindingRejectsUntrustedRemoteObjects(t *testing.T) {
	t.Parallel()
	tests := []struct {
		name     string
		resolver *fakeGitObjectResolver
		want     string
	}{
		{
			name: "wrong commit",
			resolver: &fakeGitObjectResolver{
				ref: GitObject{Type: "commit", SHA: strings.Repeat("a", 40)},
			},
			want: "not " + expectedTagCommit,
		},
		{
			name: "five annotated tags",
			resolver: &fakeGitObjectResolver{
				ref: GitObject{Type: "tag", SHA: strings.Repeat("1", 40)},
				tags: map[string]GitObject{
					strings.Repeat("1", 40): {Type: "tag", SHA: strings.Repeat("2", 40)},
					strings.Repeat("2", 40): {Type: "tag", SHA: strings.Repeat("3", 40)},
					strings.Repeat("3", 40): {Type: "tag", SHA: strings.Repeat("4", 40)},
					strings.Repeat("4", 40): {Type: "tag", SHA: strings.Repeat("5", 40)},
					strings.Repeat("5", 40): {Type: "commit", SHA: expectedTagCommit},
				},
			},
			want: "exceeds four",
		},
		{
			name: "cycle",
			resolver: &fakeGitObjectResolver{
				ref: GitObject{Type: "tag", SHA: strings.Repeat("1", 40)},
				tags: map[string]GitObject{
					strings.Repeat("1", 40): {Type: "tag", SHA: strings.Repeat("2", 40)},
					strings.Repeat("2", 40): {Type: "tag", SHA: strings.Repeat("1", 40)},
				},
			},
			want: "cycle",
		},
		{
			name: "unsupported object",
			resolver: &fakeGitObjectResolver{
				ref: GitObject{Type: "blob", SHA: strings.Repeat("1", 40)},
			},
			want: "unsupported object type",
		},
		{
			name: "malformed identity",
			resolver: &fakeGitObjectResolver{
				ref: GitObject{Type: "commit", SHA: "bad"},
			},
			want: "malformed",
		},
		{
			name: "resolver failure",
			resolver: &fakeGitObjectResolver{
				err: errors.New("offline"),
			},
			want: "resolve remote release tag",
		},
	}
	for _, test := range tests {
		test := test
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()
			err := VerifyTagBinding(context.Background(), "cordanaLLM/20-watts-was-enough", "v0.3.0", expectedTagCommit, test.resolver)
			if err == nil || !strings.Contains(err.Error(), test.want) {
				t.Fatalf("VerifyTagBinding() error = %v, want %q", err, test.want)
			}
		})
	}
}

func TestVerifyTagBindingRejectsInvalidLocalAuthority(t *testing.T) {
	t.Parallel()
	resolver := &fakeGitObjectResolver{ref: GitObject{Type: "commit", SHA: expectedTagCommit}}
	tests := []struct {
		repository string
		tag        string
		commit     string
	}{
		{"../owner/repository", "v0.3.0", expectedTagCommit},
		{"./repository", "v0.3.0", expectedTagCommit},
		{"owner/..", "v0.3.0", expectedTagCommit},
		{"cordanaLLM/20-watts-was-enough", "latest", expectedTagCommit},
		{"cordanaLLM/20-watts-was-enough", "v0.3.0", strings.ToUpper(expectedTagCommit)},
	}
	for _, test := range tests {
		if err := VerifyTagBinding(context.Background(), test.repository, test.tag, test.commit, resolver); err == nil {
			t.Fatalf("VerifyTagBinding(%q, %q, %q) succeeded", test.repository, test.tag, test.commit)
		}
	}
}

func TestBoundedBufferRetainsOnlyItsLimit(t *testing.T) {
	t.Parallel()
	buffer := &boundedBuffer{limit: 4}
	if written, err := buffer.Write([]byte("abcdef")); err != nil || written != 6 {
		t.Fatalf("Write() = %d, %v", written, err)
	}
	if got := string(buffer.Bytes()); got != "abcd" || !buffer.Exceeded() {
		t.Fatalf("boundedBuffer = %q, exceeded %t", got, buffer.Exceeded())
	}
}
