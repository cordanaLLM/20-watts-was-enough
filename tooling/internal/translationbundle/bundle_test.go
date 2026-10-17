package translationbundle

import (
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/strictjson"
)

const fixtureSourcePath = "concept/00-test.md"

func repositoryFixture(t *testing.T) string {
	t.Helper()
	root := t.TempDir()
	path := filepath.Join(root, filepath.FromSlash(fixtureSourcePath))
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte("# Evidence status\n\nThe claim is plausible.\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	registryPath := filepath.Join(root, filepath.FromSlash(languageRegistryRelativePath))
	if err := os.MkdirAll(filepath.Dir(registryPath), 0o755); err != nil {
		t.Fatal(err)
	}
	records := make([]languageRecord, 0, len(expectedOfficialEuLanguageCodes))
	for _, code := range expectedOfficialEuLanguageCodes {
		records = append(records, languageRecord{
			Code: code, Label: strings.ToUpper(code), OpenGraphLocale: code + "_" + strings.ToUpper(code),
		})
	}
	registry, err := json.Marshal(languageRegistry{Schema: 1, Languages: records})
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(registryPath, registry, 0o644); err != nil {
		t.Fatal(err)
	}
	return root
}

func fixtureImportOptions(root, input, output string) ImportOptions {
	return ImportOptions{
		RepositoryRoot:         root,
		InputPath:              input,
		ExpectedSourcePath:     fixtureSourcePath,
		ExpectedTargetLanguage: "de",
		OutputDirectory:        output,
	}
}

func exportFixture(t *testing.T, root string) (Bundle, string) {
	t.Helper()
	output := filepath.Join(t.TempDir(), "candidate.json")
	bundle, err := ExportCandidate(ExportOptions{
		RepositoryRoot: root,
		SourcePath:     fixtureSourcePath,
		TargetLanguage: "de",
		OutputPath:     output,
	})
	if err != nil {
		t.Fatal(err)
	}
	return bundle, output
}

func returnedFixture(t *testing.T, root string, mutate func(*Bundle)) string {
	t.Helper()
	bundle, _ := exportFixture(t, root)
	bundle.Target.Markdown = "# Evidenzstatus\n\nDie Behauptung ist plausibel.\n"
	bundle.Drafting = Drafting{Mode: "human-only", Tools: []DraftingTool{}, Notes: ""}
	if mutate != nil {
		mutate(&bundle)
	}
	body, err := strictjson.Canonical(bundle)
	if err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(t.TempDir(), "returned.json")
	if err := os.WriteFile(path, body, 0o600); err != nil {
		t.Fatal(err)
	}
	return path
}

func TestExportCandidateIsDeterministicAndSourceBound(t *testing.T) {
	t.Parallel()
	root := repositoryFixture(t)
	first, firstPath := exportFixture(t, root)
	second, secondPath := exportFixture(t, root)
	firstBody, err := os.ReadFile(firstPath)
	if err != nil {
		t.Fatal(err)
	}
	secondBody, err := os.ReadFile(secondPath)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(firstBody, secondBody) {
		t.Fatal("fixed source produced different candidate bundle bytes")
	}
	if first.Source.SHA256 != digest([]byte(first.Source.Markdown)) || first.Source != second.Source {
		t.Fatalf("export source binding = %#v / %#v", first.Source, second.Source)
	}
	if first.Target.Language != "de" || first.Target.Markdown != "" || first.Drafting.Mode != "undisclosed" || first.Review.Status != "unreviewed" {
		t.Fatalf("exported candidate state = %#v", first)
	}
}

func TestValidateCandidateIsReadOnlyAndSourceBound(t *testing.T) {
	t.Parallel()
	const expectedSourceSHA256 = "b3f391a23f372aad83e72b09020b9dedc5eee6b9daffb2d176db6c752f9d7da0"
	const expectedTargetSHA256 = "7e6cd71ee235c247db46c1d1247760afa0677395d351694800d44c61ab5637c1"
	root := repositoryFixture(t)
	input := returnedFixture(t, root, func(bundle *Bundle) {
		bundle.Glossary = []GlossaryEntry{{
			Source: "evidence status", Target: "", Status: "unresolved", Note: "Awaiting German domain review.",
		}}
		bundle.Drafting = Drafting{
			Mode: "machine-assisted",
			Tools: []DraftingTool{{
				Name: "example-translator", Version: "sha256:fixture", Purpose: "first-pass wording",
			}},
			Notes: "No quality decision recorded.",
		}
	})
	inputBefore, err := os.ReadFile(input)
	if err != nil {
		t.Fatal(err)
	}
	result, err := ValidateCandidate(ValidateOptions{
		RepositoryRoot:         root,
		InputPath:              input,
		ExpectedSourcePath:     fixtureSourcePath,
		ExpectedTargetLanguage: "de",
	})
	if err != nil {
		t.Fatal(err)
	}
	if result.BundleSHA256 != digest(inputBefore) || result.SourcePath != fixtureSourcePath || result.SourceSHA256 != expectedSourceSHA256 || result.TargetLanguage != "de" ||
		result.TargetSHA256 != expectedTargetSHA256 || result.UnresolvedGlossary != 1 || result.DraftingMode != "machine-assisted" ||
		result.ReviewStatus != "unreviewed" {
		t.Fatalf("ValidateCandidate() = %#v", result)
	}
	inputAfter, err := os.ReadFile(input)
	if err != nil || !bytes.Equal(inputBefore, inputAfter) {
		t.Fatalf("read-only validation changed input: %v", err)
	}
	if _, err := os.Lstat(filepath.Join(root, ".workingdir2")); !os.IsNotExist(err) {
		t.Fatalf("read-only validation created candidate output: %v", err)
	}
	if _, err := os.Lstat(filepath.Join(root, "translations", "manifest.json")); !os.IsNotExist(err) {
		t.Fatalf("read-only validation touched translation authority: %v", err)
	}
}

func TestImportCandidatePreservesDisclosureAndNeverWritesPublicationAuthority(t *testing.T) {
	t.Parallel()
	root := repositoryFixture(t)
	input := returnedFixture(t, root, func(bundle *Bundle) {
		bundle.Glossary = []GlossaryEntry{{
			Source: "plausible", Target: "plausibel", Status: "preferred", Note: "Keep the evidence-ledger category.",
		}, {
			Source: "evidence status", Target: "", Status: "unresolved", Note: "Needs domain review.",
		}}
		bundle.Drafting = Drafting{
			Mode:  "machine-assisted",
			Tools: []DraftingTool{{Name: "example-translator", Version: "2026-08", Purpose: "first-pass wording"}},
			Notes: "A person checked negation and headings.",
		}
	})
	output := filepath.Join(t.TempDir(), "imported")
	result, err := ImportCandidate(fixtureImportOptions(root, input, output))
	if err != nil {
		t.Fatal(err)
	}
	markdown, err := os.ReadFile(result.MarkdownPath)
	if err != nil {
		t.Fatal(err)
	}
	if string(markdown) != "# Evidenzstatus\n\nDie Behauptung ist plausibel.\n" || result.UnresolvedGlossary != 1 {
		t.Fatalf("imported candidate/result = %q / %#v", markdown, result)
	}
	receiptBody, err := os.ReadFile(result.ReceiptPath)
	if err != nil {
		t.Fatal(err)
	}
	var receipt Receipt
	if err := json.Unmarshal(receiptBody, &receipt); err != nil {
		t.Fatal(err)
	}
	if receipt.Authority != candidateAuthorityLabel || receipt.Drafting.Mode != "machine-assisted" || receipt.Target.SHA256 != result.TargetSHA256 {
		t.Fatalf("candidate receipt = %#v", receipt)
	}
	if _, err := os.Lstat(filepath.Join(root, "translations", "manifest.json")); !os.IsNotExist(err) {
		t.Fatalf("candidate import touched translation authority: %v", err)
	}
}

func TestValidateCandidateRejectsStaleSource(t *testing.T) {
	t.Parallel()
	root := repositoryFixture(t)
	input := returnedFixture(t, root, nil)
	if err := os.WriteFile(
		filepath.Join(root, filepath.FromSlash(fixtureSourcePath)),
		[]byte("# Changed source\n"),
		0o644,
	); err != nil {
		t.Fatal(err)
	}
	_, err := ValidateCandidate(ValidateOptions{
		RepositoryRoot:         root,
		InputPath:              input,
		ExpectedSourcePath:     fixtureSourcePath,
		ExpectedTargetLanguage: "de",
	})
	if err == nil || !strings.Contains(err.Error(), "stale") {
		t.Fatalf("ValidateCandidate() error = %v, want stale-source refusal", err)
	}
}

func TestImportCandidateRejectsStaleSourceBeforeCreatingOutput(t *testing.T) {
	t.Parallel()
	root := repositoryFixture(t)
	input := returnedFixture(t, root, nil)
	if err := os.WriteFile(
		filepath.Join(root, filepath.FromSlash(fixtureSourcePath)),
		[]byte("# Changed source\n"),
		0o644,
	); err != nil {
		t.Fatal(err)
	}
	output := filepath.Join(t.TempDir(), "imported")
	if _, err := ImportCandidate(fixtureImportOptions(root, input, output)); err == nil || !strings.Contains(err.Error(), "stale") {
		t.Fatalf("ImportCandidate() error = %v, want stale-source refusal", err)
	}
	if _, err := os.Lstat(output); !os.IsNotExist(err) {
		t.Fatalf("failed import created output: %v", err)
	}
}

func TestImportCandidateRequiresClosedDisclosureAndReviewMetadata(t *testing.T) {
	t.Parallel()
	root := repositoryFixture(t)
	for name, mutate := range map[string]func(*Bundle){
		"undisclosed drafting": func(bundle *Bundle) {
			bundle.Drafting.Mode = "undisclosed"
		},
		"machine mode without tool": func(bundle *Bundle) {
			bundle.Drafting.Mode = "machine-assisted"
		},
		"review without reviewer": func(bundle *Bundle) {
			bundle.Review.Status = "reviewed"
		},
		"review with unresolved term": func(bundle *Bundle) {
			bundle.Glossary = []GlossaryEntry{{Source: "plausible", Status: "unresolved", Note: "Decide."}}
			bundle.Review = Review{Status: "reviewed", Reviewers: []Reviewer{{
				Identity: "@reviewer", LanguageCompetence: "German", DomainScope: []string{"claim terminology"},
			}}, Notes: ""}
		},
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			input := returnedFixture(t, root, mutate)
			if _, err := ImportCandidate(fixtureImportOptions(root, input, filepath.Join(t.TempDir(), "imported"))); err == nil {
				t.Fatal("ImportCandidate() accepted incomplete candidate metadata")
			}
		})
	}
}

func TestCandidateCommandsRejectAuthorityOutputPaths(t *testing.T) {
	t.Parallel()
	root := repositoryFixture(t)
	if _, err := ExportCandidate(ExportOptions{
		RepositoryRoot: root,
		SourcePath:     fixtureSourcePath,
		TargetLanguage: "de",
		OutputPath:     filepath.Join(root, "translations", "draft.json"),
	}); err == nil || !strings.Contains(err.Error(), ".workingdir2") {
		t.Fatalf("ExportCandidate() error = %v, want authority-path refusal", err)
	}
	input := returnedFixture(t, root, nil)
	if _, err := ImportCandidate(fixtureImportOptions(
		root,
		input,
		filepath.Join(root, "translations", "de", "candidate"),
	)); err == nil || !strings.Contains(err.Error(), ".workingdir2") {
		t.Fatalf("ImportCandidate() error = %v, want authority-path refusal", err)
	}
}

func TestImportCandidateRejectsAmbiguousAndUnknownJSON(t *testing.T) {
	t.Parallel()
	root := repositoryFixture(t)
	input := returnedFixture(t, root, nil)
	body, err := os.ReadFile(input)
	if err != nil {
		t.Fatal(err)
	}
	for name, invalid := range map[string][]byte{
		"duplicate": bytes.Replace(body, []byte(`"schema": 1`), []byte(`"schema": 1, "schema": 1`), 1),
		"unknown":   bytes.Replace(body, []byte(`"kind": "20w.translation-candidate"`), []byte(`"kind": "20w.translation-candidate", "provider": "none"`), 1),
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			path := filepath.Join(t.TempDir(), "invalid.json")
			if err := os.WriteFile(path, invalid, 0o600); err != nil {
				t.Fatal(err)
			}
			if _, err := ImportCandidate(fixtureImportOptions(root, path, filepath.Join(t.TempDir(), "imported"))); err == nil {
				t.Fatal("ImportCandidate() accepted ambiguous or open JSON")
			}
		})
	}
}

func TestExportCandidateAllowsOnlyIgnoredRepositoryCache(t *testing.T) {
	t.Parallel()
	root := repositoryFixture(t)
	output := filepath.Join(root, ".workingdir2", "cache", "translation-candidates", "de-test.json")
	if _, err := ExportCandidate(ExportOptions{
		RepositoryRoot: root,
		SourcePath:     fixtureSourcePath,
		TargetLanguage: "de",
		OutputPath:     output,
	}); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(output); err != nil {
		t.Fatal(err)
	}
}

func TestExportCandidateRejectsUnregisteredLanguage(t *testing.T) {
	t.Parallel()
	root := repositoryFixture(t)
	if _, err := ExportCandidate(ExportOptions{
		RepositoryRoot: root,
		SourcePath:     fixtureSourcePath,
		TargetLanguage: "zz",
		OutputPath:     filepath.Join(t.TempDir(), "candidate.json"),
	}); err == nil || !strings.Contains(err.Error(), "official EU language") {
		t.Fatalf("ExportCandidate() error = %v, want unregistered-language refusal", err)
	}
}

func TestImportCandidateRejectsDuplicateGlossarySource(t *testing.T) {
	t.Parallel()
	root := repositoryFixture(t)
	input := returnedFixture(t, root, func(bundle *Bundle) {
		bundle.Glossary = []GlossaryEntry{
			{Source: "plausible", Target: "plausibel", Status: "preferred", Note: "Preferred."},
			{Source: "plausible", Target: "", Status: "unresolved", Note: "Unresolved."},
		}
	})
	if _, err := ImportCandidate(fixtureImportOptions(root, input, filepath.Join(t.TempDir(), "imported"))); err == nil || !strings.Contains(err.Error(), "repeats source") {
		t.Fatalf("ImportCandidate() error = %v, want duplicate-source refusal", err)
	}
}

func TestExportCandidateRejectsLinkedParentBeforeCreatingDescendants(t *testing.T) {
	t.Parallel()
	root := repositoryFixture(t)
	outside := t.TempDir()
	link := filepath.Join(t.TempDir(), "linked-parent")
	if err := os.Symlink(outside, link); err != nil {
		t.Skipf("symlinks unavailable: %v", err)
	}
	if _, err := ExportCandidate(ExportOptions{
		RepositoryRoot: root,
		SourcePath:     fixtureSourcePath,
		TargetLanguage: "de",
		OutputPath:     filepath.Join(link, "must-not-exist", "candidate.json"),
	}); err == nil || !strings.Contains(err.Error(), "links") {
		t.Fatalf("ExportCandidate() error = %v, want linked-parent refusal", err)
	}
	if _, err := os.Lstat(filepath.Join(outside, "must-not-exist")); !os.IsNotExist(err) {
		t.Fatalf("linked parent caused out-of-bound directory creation: %v", err)
	}
}

func TestLanguageRegistryRejectsOfficialCodeSetAndOrderDrift(t *testing.T) {
	t.Parallel()
	valid := make([]languageRecord, 0, len(expectedOfficialEuLanguageCodes))
	for _, code := range expectedOfficialEuLanguageCodes {
		valid = append(valid, languageRecord{Code: code, Label: strings.ToUpper(code), OpenGraphLocale: code + "_" + strings.ToUpper(code)})
	}
	for name, mutate := range map[string]func([]languageRecord) []languageRecord{
		"unknown code": func(records []languageRecord) []languageRecord {
			records[9].Code = "zz"
			return records
		},
		"wrong order": func(records []languageRecord) []languageRecord {
			records[8], records[9] = records[9], records[8]
			return records
		},
		"missing code": func(records []languageRecord) []languageRecord {
			return records[:len(records)-1]
		},
		"oversized label": func(records []languageRecord) []languageRecord {
			records[0].Label = strings.Repeat("ä", 65)
			return records
		},
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			records := append([]languageRecord(nil), valid...)
			if _, err := validateLanguageRegistry(languageRegistry{Schema: 1, Languages: mutate(records)}); err == nil {
				t.Fatal("validateLanguageRegistry() accepted official-code identity drift")
			}
		})
	}
}

func TestImportCandidateRequiresExpectedSourceAndLanguage(t *testing.T) {
	t.Parallel()
	root := repositoryFixture(t)
	input := returnedFixture(t, root, nil)
	for name, change := range map[string]func(*ImportOptions){
		"source":   func(options *ImportOptions) { options.ExpectedSourcePath = "concept/other.md" },
		"language": func(options *ImportOptions) { options.ExpectedTargetLanguage = "fr" },
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			options := fixtureImportOptions(root, input, filepath.Join(t.TempDir(), "imported"))
			change(&options)
			if _, err := ImportCandidate(options); err == nil || !strings.Contains(err.Error(), "expected source path and target language") {
				t.Fatalf("ImportCandidate() error = %v, want expected-identity refusal", err)
			}
		})
	}
}
