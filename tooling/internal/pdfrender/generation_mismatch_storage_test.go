package pdfrender

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

const generationTestIdentity = "0123456789abcdef01234567"

func TestGenerationRetentionPreservesCompletedFilesOnLaterFailure(t *testing.T) {
	for failedWrite := 1; failedWrite <= 4; failedWrite++ {
		t.Run(fmt.Sprint(failedWrite), func(t *testing.T) {
			root := t.TempDir()
			failure := errors.New("injected evidence write failure")
			calls := 0
			pairs := generationFixturePairs()
			location, err := retainGenerationMismatchAt(root, generationTestIdentity, pairs, func(file string, body []byte) error {
				calls++
				if calls == failedWrite {
					return failure
				}
				return writeReproducibilityMismatchArtifact(file, body)
			})
			if !errors.Is(err, failure) || location == "" || !strings.Contains(err.Error(), "incomplete") || !strings.Contains(err.Error(), location) || calls != failedWrite {
				t.Fatalf("partial evidence outcome: %q %v, writes=%d", location, err, calls)
			}
			for index := 0; index < 4; index++ {
				pair := index / 2
				artifact := pairs[pair][index%2]
				file := filepath.Join(root, location, fmt.Sprintf("render-%d", pair+1), artifact.name)
				body, readError := os.ReadFile(file)
				if index < failedWrite-1 {
					if readError != nil || string(body) != string(artifact.body) {
						t.Fatalf("completed evidence file lost: %s: %q %v", file, body, readError)
					}
				} else if !errors.Is(readError, os.ErrNotExist) {
					t.Fatalf("uncompleted file claimed as retained: %s: %v", file, readError)
				}
			}
		})
	}
}

func TestGenerationRetentionNeverOverwritesExistingEvidence(t *testing.T) {
	root := t.TempDir()
	pairs := generationFixturePairs()
	location, err := retainGenerationMismatchAt(root, generationTestIdentity, pairs, writeReproducibilityMismatchArtifact)
	if err != nil {
		t.Fatal(err)
	}
	sentinel := filepath.Join(root, location, "render-1", bookPDFName)
	if err := os.WriteFile(sentinel, []byte("existing evidence sentinel"), 0o644); err != nil {
		t.Fatal(err)
	}
	second, err := retainGenerationMismatchAt(root, generationTestIdentity, pairs, writeReproducibilityMismatchArtifact)
	if second != "" || !errors.Is(err, os.ErrExist) {
		t.Fatalf("existing evidence must refuse a second write: %q %v", second, err)
	}
	body, err := os.ReadFile(sentinel)
	if err != nil || string(body) != "existing evidence sentinel" {
		t.Fatalf("existing evidence replaced: %q %v", body, err)
	}
}

func TestGenerationRetentionRejectsUnsafeIdentityBeforeWriting(t *testing.T) {
	for _, identity := range []string{"", "../escape", strings.Repeat("0", 23), strings.Repeat("A", 24), strings.Repeat("0", 23) + "\n"} {
		t.Run(fmt.Sprintf("%q", identity), func(t *testing.T) {
			root := t.TempDir()
			location, err := retainGenerationMismatchAt(root, identity, generationFixturePairs(), writeReproducibilityMismatchArtifact)
			entries, listError := os.ReadDir(root)
			if err == nil || location != "" || listError != nil || len(entries) != 0 {
				t.Fatalf("unsafe identity wrote evidence: %q %v %v %v", location, err, entries, listError)
			}
		})
	}
}

func TestGenerationRetentionRejectsSymlinkParentsAndDestination(t *testing.T) {
	for _, relative := range []string{"build", "build/evidence", "build/evidence/pdf-generation-mismatch-" + generationTestIdentity} {
		t.Run(relative, func(t *testing.T) {
			root, outside := t.TempDir(), t.TempDir()
			link := filepath.Join(root, relative)
			if err := os.MkdirAll(filepath.Dir(link), 0o755); err != nil {
				t.Fatal(err)
			}
			if err := os.Symlink(outside, link); err != nil {
				t.Fatal(err)
			}
			location, err := retainGenerationMismatchAt(root, generationTestIdentity, generationFixturePairs(), writeReproducibilityMismatchArtifact)
			entries, listError := os.ReadDir(outside)
			if err == nil || location != "" || listError != nil || len(entries) != 0 {
				t.Fatalf("symlink evidence boundary escaped: %q %v %v %v", location, err, entries, listError)
			}
			if info, statError := os.Lstat(link); statError != nil || info.Mode()&os.ModeSymlink == 0 {
				t.Fatalf("existing symlink changed: %v", statError)
			}
		})
	}
}

func TestGenerationRetentionRejectsMalformedInMemoryPairs(t *testing.T) {
	for _, defect := range []string{"missing", "order", "empty", "oversize-manifest"} {
		t.Run(defect, func(t *testing.T) {
			root := t.TempDir()
			pairs := generationFixturePairs()
			switch defect {
			case "missing":
				pairs[1] = nil
			case "order":
				pairs[0][0], pairs[0][1] = pairs[0][1], pairs[0][0]
			case "empty":
				pairs[1][0].body = nil
			case "oversize-manifest":
				pairs[1][1].body = make([]byte, maximumManifestBytes+1)
			}
			location, err := retainGenerationMismatchAt(root, generationTestIdentity, pairs, writeReproducibilityMismatchArtifact)
			entries, listError := os.ReadDir(root)
			if err == nil || location != "" || listError != nil || len(entries) != 0 {
				t.Fatalf("malformed pair wrote evidence: %q %v %v %v", location, err, entries, listError)
			}
		})
	}
}

func generationFixturePairs() [2][]renderedArtifact {
	return [2][]renderedArtifact{
		{{name: bookPDFName, body: []byte("first-pdf")}, {name: bookManifestName, body: []byte("first-manifest")}},
		{{name: bookPDFName, body: []byte("second-pdf")}, {name: bookManifestName, body: []byte("second-manifest")}},
	}
}
