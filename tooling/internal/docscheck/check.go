// Package docscheck validates canonical research documentation and local links.
package docscheck

import (
	"bytes"
	"errors"
	"fmt"
	"io/fs"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"

	"github.com/yuin/goldmark/v2/ast"
	"github.com/yuin/goldmark/v2/extension"
	"github.com/yuin/goldmark/v2/parser"
)

const (
	maxDiagnostics       = 2_000
	maxMarkdownFileBytes = 8 << 20
	maxMarkdownFiles     = 10_000
	maxMarkdownTotal     = 256 << 20
)

var (
	claimDefinitionPattern = regexp.MustCompile(`(?m)^### (C-[0-9]{3,4})[[:space:]]*$`)
	claimUsePattern        = regexp.MustCompile(`\bC-[0-9]{3,4}\b`)
	claimAnchorPattern     = regexp.MustCompile(`(?i)claims\.md#(c-[0-9]{3,4})`)
	claimLinkPattern       = regexp.MustCompile(`(?i)\[(C-[0-9]{3,4})\]\([^)]*claims\.md#(c-[0-9]{3,4})\)`)
	principlePattern       = regexp.MustCompile(`(?m)^## (P-[0-9]{3})\b`)
	principleUsePattern    = regexp.MustCompile(`\bP-[0-9]{3}\b`)
	bibliographyKeyPattern = regexp.MustCompile(`(?m)^@[[:alnum:]_]+\{([^,]+),`)
	backtickPattern        = regexp.MustCompile("`([^`]+)`")
)

// compiledHarnessMarker identifies a vendor agent target generated from
// AGENTS.md. Such a file restates the canonical contract, so validating it
// re-validates AGENTS.md from a directory where its repository-relative links
// no longer resolve, and counts its diagrams a second time.
var compiledHarnessMarker = []byte("compile-context from AGENTS.md")

// compiledHarnessProbeBytes bounds how far the generated banner is sought.
const compiledHarnessProbeBytes = 4096

func isCompiledAgentHarness(content []byte) bool {
	if len(content) > compiledHarnessProbeBytes {
		content = content[:compiledHarnessProbeBytes]
	}
	return bytes.Contains(content, compiledHarnessMarker)
}

var excludedDirectories = map[string]struct{}{
	".cache": {}, ".git": {}, ".next": {}, ".openai": {}, ".vinext": {},
	".vite": {}, ".workingdir2": {}, ".wrangler": {}, "build": {}, "dist": {},
	"dist-github-pages": {}, "node_modules": {}, "tmp": {},
}

var requiredChapterSections = []string{
	"## Scope",
	"## Biological observation",
	"## Proposed AI translation",
	"## Efficiency mechanism",
	"## Evidence status",
	"## Speculative extensions",
	"## Failure modes",
	"## Measurable predictions",
}

var unsupportedPhrases = []string{
	"eradicates hallucinations",
	"eradicating pure-text hallucinations",
	"zero-energy physical reflex",
	"95% to 98%",
	"upwards of 70%",
}

// Result is a deterministic documentation-validation report.
type Result struct {
	Errors        []string
	Warnings      []string
	MarkdownFiles int
	Chapters      int
	MermaidFiles  int
}

type collector struct {
	errors    []string
	warnings  []string
	truncated bool
}

func (c *collector) addError(format string, arguments ...any) {
	if len(c.errors) >= maxDiagnostics {
		if !c.truncated {
			c.errors = append(c.errors, fmt.Sprintf("diagnostic limit reached (%d); remaining errors were omitted", maxDiagnostics))
			c.truncated = true
		}
		return
	}
	c.errors = append(c.errors, fmt.Sprintf(format, arguments...))
}

func (c *collector) addWarning(format string, arguments ...any) {
	if len(c.warnings) >= maxDiagnostics {
		return
	}
	c.warnings = append(c.warnings, fmt.Sprintf(format, arguments...))
}

type markdownDocument struct {
	absolute string
	relative string
	content  []byte
}

// Validate checks documentation below repositoryRoot without changing files.
func Validate(repositoryRoot string) Result {
	root, err := filepath.Abs(repositoryRoot)
	if err != nil {
		return Result{Errors: []string{fmt.Sprintf("resolve repository root: %v", err)}}
	}
	realRoot, err := filepath.EvalSymlinks(root)
	if err != nil {
		return Result{Errors: []string{fmt.Sprintf("resolve repository root symlinks: %v", err)}}
	}

	report := &collector{}
	documents, markdownComplete := loadMarkdown(realRoot, report)
	for _, document := range documents {
		validateLinks(realRoot, document, report)
		validateControlCharacters(document, report)
	}

	definedClaims := validateClaims(documents, report)
	definedPrinciples := validatePrinciples(documents, report)
	validateStableUses(documents, definedClaims, definedPrinciples, report)
	chapters := validateChapters(realRoot, report)
	validateBibliography(realRoot, report)
	validateUnsupportedPhrases(documents, report)
	mermaidFiles, standaloneMermaid, standaloneComplete := validateMermaid(realRoot, report)
	validateMermaidDuplicateDebt(realRoot, documents, markdownComplete, standaloneMermaid, standaloneComplete, report)

	return Result{
		Errors:        report.errors,
		Warnings:      report.warnings,
		MarkdownFiles: len(documents),
		Chapters:      chapters,
		MermaidFiles:  mermaidFiles,
	}
}

// readMarkdownDocument reads one bounded Markdown file and reports whether it
// belongs in the inventory. A generated agent harness is read but excluded.
func readMarkdownDocument(root, path string, entry fs.DirEntry, totalBytes *int64) (markdownDocument, bool, error) {
	info, infoErr := entry.Info()
	if infoErr != nil {
		return markdownDocument{}, false, fmt.Errorf("inspect %s: %w", relativePath(root, path), infoErr)
	}
	if info.Size() > maxMarkdownFileBytes {
		return markdownDocument{}, false, fmt.Errorf("Markdown file exceeds %d bytes: %s", maxMarkdownFileBytes, relativePath(root, path))
	}
	*totalBytes += info.Size()
	if *totalBytes > maxMarkdownTotal {
		return markdownDocument{}, false, fmt.Errorf("Markdown input exceeds %d bytes", maxMarkdownTotal)
	}
	content, readErr := os.ReadFile(path)
	if readErr != nil {
		return markdownDocument{}, false, fmt.Errorf("read %s: %w", relativePath(root, path), readErr)
	}
	if isCompiledAgentHarness(content) {
		return markdownDocument{}, false, nil
	}
	return markdownDocument{absolute: path, relative: relativePath(root, path), content: content}, true, nil
}

func loadMarkdown(root string, report *collector) ([]markdownDocument, bool) {
	documents := make([]markdownDocument, 0, 512)
	var totalBytes int64
	err := filepath.WalkDir(root, func(path string, entry fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if entry.Type()&fs.ModeSymlink != 0 {
			if _, excluded := excludedDirectories[entry.Name()]; excluded {
				return nil
			}
			return fmt.Errorf("Markdown inventory path must not be a symlink: %s", relativePath(root, path))
		}
		if entry.IsDir() {
			if path != root {
				if _, excluded := excludedDirectories[entry.Name()]; excluded {
					return filepath.SkipDir
				}
			}
			return nil
		}
		if !entry.Type().IsRegular() || !strings.EqualFold(filepath.Ext(entry.Name()), ".md") {
			return nil
		}
		if len(documents) >= maxMarkdownFiles {
			return fmt.Errorf("Markdown file limit exceeded (%d)", maxMarkdownFiles)
		}
		document, include, readErr := readMarkdownDocument(root, path, entry, &totalBytes)
		if readErr != nil {
			return readErr
		}
		if include {
			documents = append(documents, document)
		}
		return nil
	})
	if err != nil {
		report.addError("walk Markdown files: %v", err)
	}
	sort.Slice(documents, func(left, right int) bool {
		return documents[left].relative < documents[right].relative
	})
	if len(documents) == 0 {
		report.addError("No Markdown files found")
	}
	return documents, err == nil
}

func validateControlCharacters(document markdownDocument, report *collector) {
	line := 1
	for _, value := range document.content {
		if value == '\n' {
			line++
			continue
		}
		if value <= 0x08 || value == 0x0b || value == 0x0c || (value >= 0x0e && value <= 0x1f) {
			report.addError("Invalid control character U+%04X in %s:%d", value, document.relative, line)
		}
	}
}

func validateLinks(root string, document markdownDocument, report *collector) {
	markdownParser := parser.New(parser.WithExtensions(extension.GFMParser))
	parsed := markdownParser.Parse(document.content)
	if err := ast.Walk(parsed, func(node ast.Node, entering bool) (ast.WalkStatus, error) {
		if !entering {
			return ast.WalkContinue, nil
		}
		var destination string
		switch typed := node.(type) {
		case *ast.Link:
			destination = typed.Destination.Value(document.content)
		case *ast.Image:
			destination = typed.Destination.Value(document.content)
		default:
			return ast.WalkContinue, nil
		}
		validateLocalTarget(root, document, destination, report)
		return ast.WalkContinue, nil
	}); err != nil {
		report.addError("parse links in %s: %v", document.relative, err)
	}
}

func validateLocalTarget(root string, document markdownDocument, raw string, report *collector) {
	if raw == "" || strings.HasPrefix(raw, "#") {
		return
	}
	parsed, err := url.Parse(raw)
	if err != nil {
		report.addError("Invalid link in %s: %s (%v)", document.relative, raw, err)
		return
	}
	if parsed.IsAbs() || parsed.Host != "" || strings.HasPrefix(raw, "//") {
		return
	}
	decoded, err := url.PathUnescape(parsed.EscapedPath())
	if err != nil {
		report.addError("Invalid encoded link in %s: %s", document.relative, raw)
		return
	}
	if decoded == "" {
		return
	}
	var candidate string
	if strings.HasPrefix(decoded, "/") {
		candidate = filepath.Join(root, filepath.FromSlash(strings.TrimLeft(decoded, "/")))
	} else {
		candidate = filepath.Join(filepath.Dir(document.absolute), filepath.FromSlash(decoded))
	}
	candidate = filepath.Clean(candidate)
	if !inside(root, candidate) {
		report.addError("Local link escapes repository root in %s: %s", document.relative, raw)
		return
	}
	if _, err := os.Stat(candidate); err != nil {
		if errors.Is(err, os.ErrNotExist) {
			report.addError("Broken link in %s: %s", document.relative, raw)
		} else {
			report.addError("Inspect link in %s: %s (%v)", document.relative, raw, err)
		}
		return
	}
	realCandidate, err := filepath.EvalSymlinks(candidate)
	if err != nil {
		report.addError("Resolve link in %s: %s (%v)", document.relative, raw, err)
		return
	}
	if !inside(root, realCandidate) {
		report.addError("Local link resolves outside repository root in %s: %s", document.relative, raw)
	}
}

func inside(root, candidate string) bool {
	relative, err := filepath.Rel(root, candidate)
	if err != nil {
		return false
	}
	return relative != ".." && !strings.HasPrefix(relative, ".."+string(filepath.Separator))
}

func validateClaims(documents []markdownDocument, report *collector) map[string]struct{} {
	claims := documentByPath(documents, "research/claims.md")
	defined := make(map[string]struct{})
	if claims == nil {
		report.addError("Missing research/claims.md")
		return defined
	}
	previous := -1
	for _, match := range claimDefinitionPattern.FindAllSubmatch(claims.content, -1) {
		identifier := string(match[1])
		number, _ := strconv.Atoi(strings.TrimPrefix(identifier, "C-"))
		if _, duplicate := defined[identifier]; duplicate {
			report.addError("Duplicate claim definition in research/claims.md: %s", identifier)
		}
		if previous >= 0 && number <= previous {
			report.addError("Claim definitions are out of numeric order in research/claims.md: %s follows C-%03d", identifier, previous)
		}
		defined[identifier] = struct{}{}
		previous = number
	}
	if len(defined) == 0 {
		report.addError("No claim definitions found in research/claims.md")
	}
	return defined
}

func validatePrinciples(documents []markdownDocument, report *collector) map[string]struct{} {
	principles := documentByPath(documents, "research/principle-registry.md")
	defined := make(map[string]struct{})
	if principles == nil {
		report.addError("Missing research/principle-registry.md")
		return defined
	}
	for _, match := range principlePattern.FindAllSubmatch(principles.content, -1) {
		defined[string(match[1])] = struct{}{}
	}
	if len(defined) == 0 {
		report.addError("No principle definitions found in research/principle-registry.md")
	}
	return defined
}

func validateStableUses(documents []markdownDocument, claims, principles map[string]struct{}, report *collector) {
	for _, document := range documents {
		if isImportedSource(document.relative) {
			continue
		}
		for _, match := range claimUsePattern.FindAll(document.content, -1) {
			identifier := string(match)
			if _, found := claims[identifier]; !found {
				report.addError("Undefined claim %s in %s", identifier, document.relative)
			}
		}
		for _, match := range claimAnchorPattern.FindAllSubmatch(document.content, -1) {
			identifier := strings.ToUpper(string(match[1]))
			if _, found := claims[identifier]; !found {
				report.addError("Undefined claim anchor %s in %s", match[1], document.relative)
			}
		}
		for _, match := range claimLinkPattern.FindAllSubmatch(document.content, -1) {
			if !strings.EqualFold(string(match[1]), string(match[2])) {
				report.addError("Claim link label/anchor mismatch in %s: %s -> %s", document.relative, match[1], match[2])
			}
		}
		for _, match := range principleUsePattern.FindAll(document.content, -1) {
			identifier := string(match)
			if _, found := principles[identifier]; !found {
				report.addError("Undefined principle %s in %s", identifier, document.relative)
			}
		}
	}
}

func validateChapters(root string, report *collector) int {
	chapterRoot := filepath.Join(root, "concept")
	entries, err := os.ReadDir(chapterRoot)
	if err != nil {
		report.addError("Read concept chapters: %v", err)
		return 0
	}
	count := 0
	for _, entry := range entries {
		name := entry.Name()
		if entry.IsDir() || len(name) < 4 || name[2] != '-' || filepath.Ext(name) != ".md" {
			continue
		}
		if _, err := strconv.Atoi(name[:2]); err != nil {
			continue
		}
		count++
		content, err := os.ReadFile(filepath.Join(chapterRoot, name))
		if err != nil {
			report.addError("Read concept/%s: %v", name, err)
			continue
		}
		for _, section := range requiredChapterSections {
			if !strings.Contains(string(content), section) {
				report.addError("Missing '%s' in concept/%s", section, name)
			}
		}
	}
	return count
}

func validateBibliography(root string, report *collector) {
	bibliographyPath := filepath.Join(root, "research", "references.bib")
	bibliography, err := os.ReadFile(bibliographyPath)
	if err != nil {
		report.addError("Missing or unreadable research/references.bib: %v", err)
		return
	}
	keys := make(map[string]struct{})
	for _, match := range bibliographyKeyPattern.FindAllSubmatch(bibliography, -1) {
		key := string(match[1])
		if _, duplicate := keys[key]; duplicate {
			report.addError("Duplicate bibliography key in research/references.bib: %s", key)
		}
		keys[key] = struct{}{}
	}
	claims, err := os.ReadFile(filepath.Join(root, "research", "claims.md"))
	if err != nil {
		return
	}
	for _, field := range primarySourceFields(string(claims)) {
		for _, match := range backtickPattern.FindAllStringSubmatch(field, -1) {
			if _, found := keys[match[1]]; !found {
				report.addError("Claim ledger references missing bibliography key: %s", match[1])
			}
		}
	}
}

func primarySourceFields(claims string) []string {
	lines := strings.Split(claims, "\n")
	fields := make([]string, 0, 64)
	for index := 0; index < len(lines); index++ {
		line := lines[index]
		if !strings.HasPrefix(line, "- **Primary source:**") &&
			!strings.HasPrefix(line, "- **Primary sources:**") &&
			!strings.HasPrefix(line, "- **Primary/authoritative source:**") &&
			!strings.HasPrefix(line, "- **Primary/authoritative sources:**") {
			continue
		}
		var field strings.Builder
		field.WriteString(line)
		for index+1 < len(lines) && !strings.HasPrefix(lines[index+1], "- **") {
			index++
			field.WriteByte('\n')
			field.WriteString(lines[index])
		}
		fields = append(fields, field.String())
	}
	return fields
}

func validateUnsupportedPhrases(documents []markdownDocument, report *collector) {
	var canonical strings.Builder
	for _, document := range documents {
		if !isImportedSource(document.relative) {
			canonical.Write(document.content)
			canonical.WriteByte('\n')
		}
	}
	lower := strings.ToLower(canonical.String())
	for _, phrase := range unsupportedPhrases {
		if strings.Contains(lower, strings.ToLower(phrase)) {
			report.addError("Unsupported inherited phrase found in canonical material: '%s'", phrase)
		}
	}
}

func documentByPath(documents []markdownDocument, relative string) *markdownDocument {
	for index := range documents {
		if documents[index].relative == relative {
			return &documents[index]
		}
	}
	return nil
}

func isImportedSource(relative string) bool {
	return relative == "sources" || strings.HasPrefix(relative, "sources/")
}

func relativePath(root, path string) string {
	relative, err := filepath.Rel(root, path)
	if err != nil {
		return filepath.ToSlash(path)
	}
	return filepath.ToSlash(relative)
}
