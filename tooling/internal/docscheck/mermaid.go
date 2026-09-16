package docscheck

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path"
	"path/filepath"
	"regexp"
	"sort"
	"strings"

	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/strictjson"
	"github.com/yuin/goldmark/v2/ast"
	"github.com/yuin/goldmark/v2/extension"
	"github.com/yuin/goldmark/v2/parser"
)

const (
	mermaidBaselineRelativePath    = "tooling/internal/docscheck/mermaid-duplicate-baseline.json"
	maximumMermaidBaselineBytes    = 64 << 10
	maximumMermaidGroups           = 2_000
	maximumMermaidSources          = 10_000
	maximumMermaidDirectoryEntries = 20_000
	maximumMermaidTotalBytes       = 256 << 20
	maximumRepositoryPathBytes     = 4_096
)

var (
	mermaidDigestPattern = regexp.MustCompile(`^[0-9a-f]{64}$`)
	mermaidStartPattern  = regexp.MustCompile(`(?m)^[[:space:]]*(flowchart|graph|sequenceDiagram|stateDiagram)\b`)
	mermaidEdgePattern   = regexp.MustCompile(`-->|---|==>`)
)

type mermaidSource struct {
	path   string
	digest string
}

type mermaidDuplicateBaseline struct {
	SchemaVersion int                    `json:"schemaVersion"`
	Groups        []mermaidBaselineGroup `json:"groups"`
}

type mermaidBaselineGroup struct {
	SHA256      string                      `json:"sha256"`
	Occurrences []mermaidBaselineOccurrence `json:"occurrences"`
}

type mermaidBaselineOccurrence struct {
	Path  string `json:"path"`
	Count int    `json:"count"`
}

type mermaidOccurrenceSet map[string]int

func validateMermaid(root string, report *collector) (int, []mermaidSource, bool) {
	diagramRoot, _, err := inspectMermaidRepositoryPath(root, "assets/diagrams", true)
	if err != nil {
		report.addError("Inspect Mermaid source directory: %v", err)
		return 0, nil, false
	}
	directory, err := os.Open(diagramRoot)
	if err != nil {
		report.addError("Open Mermaid source directory: %v", err)
		return 0, nil, false
	}
	entries := make([]os.DirEntry, 0, 128)
	count := 0
	complete := true
	directoryEntries := 0
scan:
	for {
		chunk, readErr := directory.ReadDir(256)
		for _, entry := range chunk {
			directoryEntries++
			if directoryEntries > maximumMermaidDirectoryEntries {
				report.addError("Mermaid source directory exceeds %d entries", maximumMermaidDirectoryEntries)
				complete = false
				break scan
			}
			if entry.IsDir() || filepath.Ext(entry.Name()) != ".mmd" {
				continue
			}
			count++
			if count > maximumMermaidSources {
				report.addError("Mermaid source count exceeds %d", maximumMermaidSources)
				complete = false
				break scan
			}
			entries = append(entries, entry)
		}
		if readErr != nil {
			if !errors.Is(readErr, io.EOF) {
				report.addError("Read Mermaid source directory: %v", readErr)
				complete = false
			}
			break
		}
	}
	if closeErr := directory.Close(); closeErr != nil {
		report.addError("Close Mermaid source directory: %v", closeErr)
		complete = false
	}
	sort.Slice(entries, func(left, right int) bool {
		return entries[left].Name() < entries[right].Name()
	})
	sources := make([]mermaidSource, 0, len(entries))
	var totalBytes int64
	for _, entry := range entries {
		relative := path.Join("assets/diagrams", entry.Name())
		absolute := filepath.Join(diagramRoot, entry.Name())
		info, infoErr := os.Lstat(absolute)
		if infoErr != nil {
			report.addError("Inspect %s: %v", relative, infoErr)
			complete = false
			continue
		}
		if info.Mode()&os.ModeSymlink != 0 || !info.Mode().IsRegular() {
			report.addError("Mermaid source must be a regular file: %s", relative)
			complete = false
			continue
		}
		if info.Size() > maxMarkdownFileBytes {
			report.addError("Mermaid source exceeds %d bytes: %s", maxMarkdownFileBytes, relative)
			complete = false
			continue
		}
		totalBytes += info.Size()
		if totalBytes > maximumMermaidTotalBytes {
			report.addError("Mermaid source input exceeds %d bytes", maximumMermaidTotalBytes)
			complete = false
			break
		}
		content, readErr := readBoundedMermaidFile(absolute, maxMarkdownFileBytes)
		if readErr != nil {
			report.addError("Read %s: %v", relative, readErr)
			complete = false
			continue
		}
		if !mermaidStartPattern.Match(content) {
			report.addError("Unrecognized Mermaid declaration in %s", relative)
		}
		if !mermaidEdgePattern.Match(content) {
			report.addWarning("No edge found in %s", relative)
		}
		sources = append(sources, newMermaidSource(relative, content))
	}
	return count, sources, complete
}

func validateMermaidDuplicateDebt(
	root string,
	documents []markdownDocument,
	markdownComplete bool,
	standalone []mermaidSource,
	standaloneComplete bool,
	report *collector,
) {
	baseline, err := loadMermaidDuplicateBaseline(root)
	if err != nil {
		report.addError("Validate Mermaid duplicate baseline: %v", err)
		return
	}
	if !markdownComplete || !standaloneComplete {
		return
	}
	remaining := maximumMermaidSources - len(standalone)
	if remaining < 0 {
		report.addError("Mermaid source count exceeds %d", maximumMermaidSources)
		return
	}
	markdown, complete := collectMarkdownMermaid(documents, remaining, report)
	if !complete {
		return
	}
	observed := duplicateMermaidGroups(append(standalone, markdown...))
	compareMermaidDuplicateDebt(baseline, observed, report)
}

func collectMarkdownMermaid(documents []markdownDocument, maximum int, report *collector) ([]mermaidSource, bool) {
	sources := make([]mermaidSource, 0, 128)
	markdownParser := parser.New(parser.WithExtensions(extension.GFMParser))
	complete := true
	for _, document := range documents {
		if isMermaidOwnershipExcluded(document.relative) {
			continue
		}
		parsed := markdownParser.Parse(document.content)
		limitReached := false
		err := ast.Walk(parsed, func(node ast.Node, entering bool) (ast.WalkStatus, error) {
			if !entering {
				return ast.WalkContinue, nil
			}
			block, ok := node.(*ast.CodeBlock)
			if !ok || block.CodeBlockKind != ast.CodeBlockKindFenced {
				return ast.WalkContinue, nil
			}
			language, ok := block.Language(document.content)
			if !ok || !strings.EqualFold(language, "mermaid") {
				return ast.WalkContinue, nil
			}
			if len(sources) >= maximum {
				limitReached = true
				return ast.WalkStop, nil
			}
			sources = append(sources, newMermaidSource(document.relative, block.Value.Bytes(document.content)))
			return ast.WalkContinue, nil
		})
		if err != nil {
			report.addError("Parse Mermaid blocks in %s: %v", document.relative, err)
			complete = false
		}
		if limitReached {
			report.addError("Mermaid source count exceeds %d", maximumMermaidSources)
			complete = false
			break
		}
	}
	return sources, complete
}

func newMermaidSource(relative string, body []byte) mermaidSource {
	digest := sha256.Sum256(body)
	return mermaidSource{path: relative, digest: hex.EncodeToString(digest[:])}
}

func duplicateMermaidGroups(sources []mermaidSource) map[string]mermaidOccurrenceSet {
	all := make(map[string]mermaidOccurrenceSet)
	for _, source := range sources {
		occurrences := all[source.digest]
		if occurrences == nil {
			occurrences = make(mermaidOccurrenceSet)
			all[source.digest] = occurrences
		}
		occurrences[source.path]++
	}
	duplicates := make(map[string]mermaidOccurrenceSet)
	for digest, occurrences := range all {
		if occurrenceCount(occurrences) > 1 {
			duplicates[digest] = occurrences
		}
	}
	return duplicates
}

func inspectMermaidRepositoryPath(root, relative string, wantDirectory bool) (string, os.FileInfo, error) {
	if relative == "" || path.IsAbs(relative) || path.Clean(relative) != relative || strings.Contains(relative, "\\") {
		return "", nil, fmt.Errorf("invalid repository-relative path %q", relative)
	}
	current := root
	components := strings.Split(relative, "/")
	for index, component := range components {
		if component == "" || component == "." || component == ".." {
			return "", nil, fmt.Errorf("invalid repository-relative path %q", relative)
		}
		current = filepath.Join(current, filepath.FromSlash(component))
		info, err := os.Lstat(current)
		if err != nil {
			return "", nil, fmt.Errorf("inspect repository path %q: %w", relative, err)
		}
		if info.Mode()&os.ModeSymlink != 0 {
			return "", nil, fmt.Errorf("repository path %q must not contain symlinks", relative)
		}
		last := index == len(components)-1
		if !last && !info.IsDir() {
			return "", nil, fmt.Errorf("repository path %q has a non-directory parent", relative)
		}
		if !last {
			continue
		}
		if wantDirectory && !info.IsDir() {
			return "", nil, fmt.Errorf("repository path %q must be a directory", relative)
		}
		if !wantDirectory && !info.Mode().IsRegular() {
			return "", nil, fmt.Errorf("repository path %q must be a regular file", relative)
		}
		resolved, err := filepath.EvalSymlinks(current)
		if err != nil {
			return "", nil, fmt.Errorf("resolve repository path %q: %w", relative, err)
		}
		if filepath.Clean(resolved) != filepath.Clean(current) || !inside(root, resolved) {
			return "", nil, fmt.Errorf("repository path %q must remain a real path inside the repository", relative)
		}
		return current, info, nil
	}
	return "", nil, fmt.Errorf("repository path %q is empty", relative)
}

func readBoundedMermaidFile(filename string, maximum int64) (body []byte, returnedErr error) {
	file, err := os.Open(filename)
	if err != nil {
		return nil, err
	}
	defer func() {
		if closeErr := file.Close(); returnedErr == nil && closeErr != nil {
			returnedErr = closeErr
		}
	}()
	body, err = io.ReadAll(io.LimitReader(file, maximum+1))
	if err != nil {
		return nil, err
	}
	if int64(len(body)) > maximum {
		return nil, fmt.Errorf("file exceeds %d bytes", maximum)
	}
	return body, nil
}

func loadMermaidDuplicateBaseline(root string) (map[string]mermaidOccurrenceSet, error) {
	baselinePath, info, err := inspectMermaidRepositoryPath(root, mermaidBaselineRelativePath, false)
	if err != nil {
		return nil, err
	}
	if info.Size() > maximumMermaidBaselineBytes {
		return nil, fmt.Errorf("%s exceeds %d bytes", mermaidBaselineRelativePath, maximumMermaidBaselineBytes)
	}
	body, err := readBoundedMermaidFile(baselinePath, maximumMermaidBaselineBytes)
	if err != nil {
		return nil, fmt.Errorf("read %s: %w", mermaidBaselineRelativePath, err)
	}
	if err := strictjson.Validate(body, 8); err != nil {
		return nil, fmt.Errorf("validate unambiguous JSON: %w", err)
	}
	var document mermaidDuplicateBaseline
	decoder := json.NewDecoder(bytes.NewReader(body))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&document); err != nil {
		return nil, fmt.Errorf("decode closed schema: %w", err)
	}
	return validateMermaidBaseline(document)
}

func validateMermaidBaseline(document mermaidDuplicateBaseline) (map[string]mermaidOccurrenceSet, error) {
	if document.SchemaVersion != 1 {
		return nil, fmt.Errorf("unsupported schemaVersion %d", document.SchemaVersion)
	}
	if document.Groups == nil {
		return nil, fmt.Errorf("groups must be present")
	}
	if len(document.Groups) > maximumMermaidGroups {
		return nil, fmt.Errorf("groups exceed %d entries", maximumMermaidGroups)
	}
	validated := make(map[string]mermaidOccurrenceSet, len(document.Groups))
	previousDigest := ""
	for index, group := range document.Groups {
		if !mermaidDigestPattern.MatchString(group.SHA256) {
			return nil, fmt.Errorf("group %d has invalid SHA-256 %q", index, group.SHA256)
		}
		if group.SHA256 <= previousDigest {
			return nil, fmt.Errorf("groups are not in unique SHA-256 order at %q", group.SHA256)
		}
		occurrences, err := validateBaselineOccurrences(group)
		if err != nil {
			return nil, fmt.Errorf("group %s: %w", group.SHA256, err)
		}
		validated[group.SHA256] = occurrences
		previousDigest = group.SHA256
	}
	return validated, nil
}

func validateBaselineOccurrences(group mermaidBaselineGroup) (mermaidOccurrenceSet, error) {
	if group.Occurrences == nil {
		return nil, fmt.Errorf("occurrences must be present")
	}
	if len(group.Occurrences) > maximumMermaidSources {
		return nil, fmt.Errorf("occurrences exceed %d entries", maximumMermaidSources)
	}
	validated := make(mermaidOccurrenceSet, len(group.Occurrences))
	previousPath := ""
	for index, occurrence := range group.Occurrences {
		if err := validateMermaidBaselinePath(occurrence.Path); err != nil {
			return nil, fmt.Errorf("occurrence %d: %w", index, err)
		}
		if occurrence.Path <= previousPath {
			return nil, fmt.Errorf("occurrences are not in unique path order at %q", occurrence.Path)
		}
		if occurrence.Count < 1 || occurrence.Count > maximumMermaidSources {
			return nil, fmt.Errorf("occurrence %s has invalid count %d", occurrence.Path, occurrence.Count)
		}
		validated[occurrence.Path] = occurrence.Count
		previousPath = occurrence.Path
	}
	if occurrenceCount(validated) < 2 {
		return nil, fmt.Errorf("duplicate group must admit at least two occurrences")
	}
	return validated, nil
}

func validateMermaidBaselinePath(value string) error {
	if value == "" || len(value) > maximumRepositoryPathBytes || strings.ContainsRune(value, '\x00') || strings.Contains(value, "\\") || path.IsAbs(value) {
		return fmt.Errorf("invalid repository-relative path %q", value)
	}
	clean := path.Clean(value)
	if clean != value || clean == "." || clean == ".." || strings.HasPrefix(clean, "../") {
		return fmt.Errorf("non-canonical repository path %q", value)
	}
	if filepath.Ext(value) != ".md" && filepath.Ext(value) != ".mmd" {
		return fmt.Errorf("Mermaid occurrence must be Markdown or .mmd: %q", value)
	}
	if isMermaidOwnershipExcluded(value) || hasExcludedPathComponent(value) {
		return fmt.Errorf("excluded path cannot carry Mermaid duplicate debt: %q", value)
	}
	return nil
}

func compareMermaidDuplicateDebt(baseline, observed map[string]mermaidOccurrenceSet, report *collector) {
	for _, digest := range sortedMermaidDigests(observed) {
		current := observed[digest]
		admitted, found := baseline[digest]
		if !found {
			report.addError("Unbaselined duplicate Mermaid body %s: %s", digest, formatMermaidOccurrences(current))
			continue
		}
		if !equalMermaidOccurrences(admitted, current) {
			report.addError(
				"Mermaid duplicate debt changed for %s: baseline [%s], observed [%s]",
				digest,
				formatMermaidOccurrences(admitted),
				formatMermaidOccurrences(current),
			)
		}
	}
	for _, digest := range sortedMermaidDigests(baseline) {
		if _, found := observed[digest]; !found {
			report.addError("Stale Mermaid duplicate baseline entry %s: remove it because the body is no longer duplicated", digest)
		}
	}
}

func isMermaidOwnershipExcluded(relative string) bool {
	return isImportedSource(relative) || relative == "translations" || strings.HasPrefix(relative, "translations/")
}

func hasExcludedPathComponent(relative string) bool {
	for _, component := range strings.Split(relative, "/") {
		if _, excluded := excludedDirectories[component]; excluded {
			return true
		}
	}
	return false
}

func occurrenceCount(occurrences mermaidOccurrenceSet) int {
	total := 0
	for _, count := range occurrences {
		total += count
	}
	return total
}

func equalMermaidOccurrences(left, right mermaidOccurrenceSet) bool {
	if len(left) != len(right) {
		return false
	}
	for relative, count := range left {
		if right[relative] != count {
			return false
		}
	}
	return true
}

func sortedMermaidDigests(groups map[string]mermaidOccurrenceSet) []string {
	digests := make([]string, 0, len(groups))
	for digest := range groups {
		digests = append(digests, digest)
	}
	sort.Strings(digests)
	return digests
}

func formatMermaidOccurrences(occurrences mermaidOccurrenceSet) string {
	paths := make([]string, 0, len(occurrences))
	for relative := range occurrences {
		paths = append(paths, relative)
	}
	sort.Strings(paths)
	formatted := make([]string, 0, len(paths))
	for _, relative := range paths {
		formatted = append(formatted, fmt.Sprintf("%s (count %d)", relative, occurrences[relative]))
	}
	return strings.Join(formatted, ", ")
}
