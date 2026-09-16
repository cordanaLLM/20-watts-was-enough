// Package translationbundle exchanges source-bound translation candidates without
// granting them publication authority.
package translationbundle

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"regexp"
	"strings"
	"unicode/utf8"

	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/strictjson"
)

const (
	bundleKind              = "20w.translation-candidate"
	sourceLanguage          = "en-GB"
	maximumBundleBytes      = 12 << 20
	maximumDocumentBytes    = 4 << 20
	maximumGlossaryEntries  = 512
	maximumTools            = 16
	maximumReviewers        = 16
	maximumReviewerDomains  = 16
	maximumShortTextBytes   = 512
	maximumNotesBytes       = 8 << 10
	candidateAuthorityLabel = "candidate-only-not-publication-authority"
)

var (
	sourcePathPattern = regexp.MustCompile(`^(?:concept|math)/(?:[a-z0-9][a-z0-9-]*/)*[a-z0-9][a-z0-9-]*\.md$`)
	languagePattern   = regexp.MustCompile(`^[a-z]{2}$`)
	sha256Pattern     = regexp.MustCompile(`^[a-f0-9]{64}$`)
)

// Bundle is the provider-neutral exchange object. Review metadata is evidence
// for a later human decision; it never changes the bundle's candidate authority.
type Bundle struct {
	Schema   int             `json:"schema"`
	Kind     string          `json:"kind"`
	Source   Source          `json:"source"`
	Target   Target          `json:"target"`
	Glossary []GlossaryEntry `json:"glossary"`
	Drafting Drafting        `json:"drafting"`
	Review   Review          `json:"review"`
}

// Source binds the embedded English Markdown to its canonical repository path.
type Source struct {
	Language string `json:"language"`
	Path     string `json:"path"`
	SHA256   string `json:"sha256"`
	Markdown string `json:"markdown"`
}

// Target contains candidate Markdown for one non-English language.
type Target struct {
	Language string `json:"language"`
	Markdown string `json:"markdown"`
}

// GlossaryEntry records either an unresolved term or a preferred translation.
type GlossaryEntry struct {
	Source string `json:"source"`
	Target string `json:"target"`
	Status string `json:"status"`
	Note   string `json:"note"`
}

// Drafting discloses whether a person worked alone or used automated tools.
type Drafting struct {
	Mode  string         `json:"mode"`
	Tools []DraftingTool `json:"tools"`
	Notes string         `json:"notes"`
}

// DraftingTool identifies one material automated drafting aid.
type DraftingTool struct {
	Name    string `json:"name"`
	Version string `json:"version"`
	Purpose string `json:"purpose"`
}

// Review records review state without turning the bundle into public authority.
type Review struct {
	Status    string     `json:"status"`
	Reviewers []Reviewer `json:"reviewers"`
	Notes     string     `json:"notes"`
}

// Reviewer records a public identity and the language/domain scope actually checked.
type Reviewer struct {
	Identity           string   `json:"identity"`
	LanguageCompetence string   `json:"languageCompetence"`
	DomainScope        []string `json:"domainScope"`
}

// Receipt is written beside imported candidate Markdown.
type Receipt struct {
	Schema       int             `json:"schema"`
	Authority    string          `json:"authority"`
	BundleSHA256 string          `json:"bundleSha256"`
	Source       SourceBinding   `json:"source"`
	Target       TargetBinding   `json:"target"`
	Glossary     []GlossaryEntry `json:"glossary"`
	Drafting     Drafting        `json:"drafting"`
	Review       Review          `json:"review"`
}

// SourceBinding is the canonical source identity retained by an import receipt.
type SourceBinding struct {
	Language string `json:"language"`
	Path     string `json:"path"`
	SHA256   string `json:"sha256"`
}

// TargetBinding identifies the exact imported candidate bytes.
type TargetBinding struct {
	Language string `json:"language"`
	SHA256   string `json:"sha256"`
}

func newBundle(sourcePath, targetLanguage string, source []byte) Bundle {
	return Bundle{
		Schema: 1,
		Kind:   bundleKind,
		Source: Source{
			Language: sourceLanguage,
			Path:     sourcePath,
			SHA256:   digest(source),
			Markdown: string(source),
		},
		Target:   Target{Language: targetLanguage, Markdown: ""},
		Glossary: []GlossaryEntry{},
		Drafting: Drafting{Mode: "undisclosed", Tools: []DraftingTool{}, Notes: ""},
		Review:   Review{Status: "unreviewed", Reviewers: []Reviewer{}, Notes: ""},
	}
}

func decodeBundle(body []byte) (Bundle, error) {
	if len(body) == 0 || len(body) > maximumBundleBytes {
		return Bundle{}, fmt.Errorf("candidate bundle must contain 1-%d bytes", maximumBundleBytes)
	}
	if !utf8.Valid(body) {
		return Bundle{}, errors.New("candidate bundle is not valid UTF-8")
	}
	if err := strictjson.Validate(body, 8); err != nil {
		return Bundle{}, fmt.Errorf("validate unambiguous candidate JSON: %w", err)
	}
	if err := validateJSONShape(body); err != nil {
		return Bundle{}, err
	}
	decoder := json.NewDecoder(bytes.NewReader(body))
	decoder.DisallowUnknownFields()
	var bundle Bundle
	if err := decoder.Decode(&bundle); err != nil {
		return Bundle{}, fmt.Errorf("decode candidate bundle: %w", err)
	}
	if decoder.Decode(&struct{}{}) != io.EOF {
		return Bundle{}, errors.New("candidate bundle contains trailing data")
	}
	return bundle, nil
}

func validateBundle(bundle Bundle, requireTarget bool) error {
	if bundle.Schema != 1 || bundle.Kind != bundleKind {
		return errors.New("candidate bundle has an unsupported schema or kind")
	}
	if err := validateSource(bundle.Source); err != nil {
		return err
	}
	if err := validateTarget(bundle.Target, bundle.Source.Markdown, requireTarget); err != nil {
		return err
	}
	unresolved, err := validateGlossary(bundle.Glossary)
	if err != nil {
		return err
	}
	if err := validateDrafting(bundle.Drafting, requireTarget); err != nil {
		return err
	}
	return validateReview(bundle.Review, unresolved)
}

func validateSource(source Source) error {
	if source.Language != sourceLanguage || !sourcePathPattern.MatchString(source.Path) {
		return errors.New("candidate source must name canonical en-GB concept/math Markdown")
	}
	if !sha256Pattern.MatchString(source.SHA256) {
		return errors.New("candidate source digest is not lowercase SHA-256")
	}
	if err := validateMarkdown("candidate source Markdown", source.Markdown, true); err != nil {
		return err
	}
	if digest([]byte(source.Markdown)) != source.SHA256 {
		return errors.New("candidate source digest does not match its embedded Markdown")
	}
	return nil
}

func validateTarget(target Target, sourceMarkdown string, required bool) error {
	if !languagePattern.MatchString(target.Language) || target.Language == "en" {
		return errors.New("candidate target language must be a non-English two-letter code")
	}
	if target.Markdown == "" && !required {
		return nil
	}
	if err := validateMarkdown("candidate target Markdown", target.Markdown, true); err != nil {
		return err
	}
	if target.Markdown == sourceMarkdown {
		return errors.New("candidate target Markdown is byte-identical to the English source")
	}
	return nil
}

func validateMarkdown(label, markdown string, required bool) error {
	if required && markdown == "" {
		return fmt.Errorf("%s is empty", label)
	}
	if len(markdown) > maximumDocumentBytes {
		return fmt.Errorf("%s exceeds the %d-byte limit", label, maximumDocumentBytes)
	}
	if !utf8.ValidString(markdown) || strings.ContainsAny(markdown, "\x00\r") {
		return fmt.Errorf("%s must be UTF-8 with LF line endings and no NUL bytes", label)
	}
	if markdown != "" && !strings.HasSuffix(markdown, "\n") {
		return fmt.Errorf("%s must end with a newline", label)
	}
	return nil
}

func validateGlossary(entries []GlossaryEntry) (int, error) {
	if entries == nil || len(entries) > maximumGlossaryEntries {
		return 0, fmt.Errorf("candidate glossary must contain 0-%d entries", maximumGlossaryEntries)
	}
	identities := make(map[string]struct{}, len(entries))
	unresolved := 0
	for _, entry := range entries {
		if err := validateGlossaryEntry(entry); err != nil {
			return 0, err
		}
		identity := entry.Source
		if _, duplicate := identities[identity]; duplicate {
			return 0, fmt.Errorf("candidate glossary repeats source term %q", entry.Source)
		}
		identities[identity] = struct{}{}
		if entry.Status == "unresolved" {
			unresolved++
		}
	}
	return unresolved, nil
}

func validateGlossaryEntry(entry GlossaryEntry) error {
	if err := shortText("glossary source", entry.Source, true); err != nil {
		return err
	}
	if err := shortText("glossary target", entry.Target, entry.Status == "preferred"); err != nil {
		return err
	}
	if err := notesText("glossary note", entry.Note); err != nil {
		return err
	}
	switch entry.Status {
	case "unresolved":
		if entry.Target != "" {
			return errors.New("an unresolved glossary entry must have an empty target")
		}
	case "preferred":
	default:
		return fmt.Errorf("glossary entry %q has unsupported status %q", entry.Source, entry.Status)
	}
	return nil
}

func validateDrafting(drafting Drafting, requireDisclosure bool) error {
	if drafting.Tools == nil || len(drafting.Tools) > maximumTools {
		return fmt.Errorf("drafting disclosure must contain 0-%d tools", maximumTools)
	}
	if err := notesText("drafting notes", drafting.Notes); err != nil {
		return err
	}
	switch drafting.Mode {
	case "undisclosed":
		if requireDisclosure || len(drafting.Tools) != 0 {
			return errors.New("an imported candidate must disclose human-only or machine-assisted drafting")
		}
	case "human-only":
		if len(drafting.Tools) != 0 {
			return errors.New("human-only drafting cannot list automated tools")
		}
	case "machine-assisted":
		if len(drafting.Tools) == 0 {
			return errors.New("machine-assisted drafting must identify at least one tool")
		}
	default:
		return fmt.Errorf("unsupported drafting mode %q", drafting.Mode)
	}
	return validateTools(drafting.Tools)
}

func validateTools(tools []DraftingTool) error {
	identities := make(map[string]struct{}, len(tools))
	for _, tool := range tools {
		for label, value := range map[string]string{
			"drafting tool name": tool.Name, "drafting tool version": tool.Version, "drafting tool purpose": tool.Purpose,
		} {
			if err := shortText(label, value, true); err != nil {
				return err
			}
		}
		identity := tool.Name + "\x00" + tool.Version
		if _, duplicate := identities[identity]; duplicate {
			return fmt.Errorf("drafting disclosure repeats tool %q version %q", tool.Name, tool.Version)
		}
		identities[identity] = struct{}{}
	}
	return nil
}

func validateReview(review Review, unresolvedGlossary int) error {
	if review.Reviewers == nil || len(review.Reviewers) > maximumReviewers {
		return fmt.Errorf("candidate review must contain 0-%d reviewers", maximumReviewers)
	}
	if err := notesText("review notes", review.Notes); err != nil {
		return err
	}
	if review.Status != "unreviewed" && review.Status != "reviewed" {
		return fmt.Errorf("unsupported candidate review status %q", review.Status)
	}
	if review.Status == "reviewed" && (len(review.Reviewers) == 0 || unresolvedGlossary != 0) {
		return errors.New("reviewed candidate metadata requires a reviewer and no unresolved glossary entries")
	}
	return validateReviewers(review.Reviewers)
}

func validateReviewers(reviewers []Reviewer) error {
	identities := make(map[string]struct{}, len(reviewers))
	for _, reviewer := range reviewers {
		if err := shortText("reviewer identity", reviewer.Identity, true); err != nil {
			return err
		}
		if err := shortText("reviewer language competence", reviewer.LanguageCompetence, true); err != nil {
			return err
		}
		if reviewer.DomainScope == nil || len(reviewer.DomainScope) == 0 || len(reviewer.DomainScope) > maximumReviewerDomains {
			return fmt.Errorf("reviewer %q must name 1-%d reviewed domains", reviewer.Identity, maximumReviewerDomains)
		}
		if _, duplicate := identities[reviewer.Identity]; duplicate {
			return fmt.Errorf("candidate review repeats reviewer %q", reviewer.Identity)
		}
		identities[reviewer.Identity] = struct{}{}
		for _, domain := range reviewer.DomainScope {
			if err := shortText("reviewer domain scope", domain, true); err != nil {
				return err
			}
		}
	}
	return nil
}

func shortText(label, value string, required bool) error {
	if value != strings.TrimSpace(value) || (required && value == "") || len(value) > maximumShortTextBytes || strings.ContainsAny(value, "\x00\r\n") {
		return fmt.Errorf("%s must be trimmed single-line text of at most %d bytes", label, maximumShortTextBytes)
	}
	return nil
}

func notesText(label, value string) error {
	if len(value) > maximumNotesBytes || !utf8.ValidString(value) || strings.ContainsAny(value, "\x00\r") {
		return fmt.Errorf("%s must be UTF-8 with LF line endings and at most %d bytes", label, maximumNotesBytes)
	}
	return nil
}

func digest(body []byte) string {
	sum := sha256.Sum256(body)
	return hex.EncodeToString(sum[:])
}
