package docscheck

import (
	"fmt"
	"net/url"
	"path/filepath"
	"regexp"
	"strings"
	"unicode"

	"github.com/yuin/goldmark/v2/ast"
	"github.com/yuin/goldmark/v2/extension"
	"github.com/yuin/goldmark/v2/parser"
)

var (
	htmlIDPattern     = regexp.MustCompile(`(?i)<[a-zA-Z][a-zA-Z0-9:_-]*\s+[^>]*?\bid\s*=\s*["']([^"']+)["']`)
	anchorNamePattern = regexp.MustCompile(`(?i)<a\s+[^>]*?\bname\s*=\s*["']([^"']+)["']`)
)

func githubSlug(text string) string {
	var builder strings.Builder
	for _, r := range text {
		if unicode.IsLetter(r) || unicode.IsDigit(r) || r == '-' || r == '_' {
			builder.WriteRune(unicode.ToLower(r))
		} else if r == ' ' {
			builder.WriteByte('-')
		}
	}
	return builder.String()
}

func headingPlainText(heading *ast.Heading, source []byte) (string, error) {
	var builder strings.Builder
	err := ast.Walk(heading, func(node ast.Node, entering bool) (ast.WalkStatus, error) {
		if !entering {
			return ast.WalkContinue, nil
		}
		switch typed := node.(type) {
		case *ast.Text:
			builder.WriteString(typed.Value.Value(source))
			if typed.SoftLineBreak() || typed.HardLineBreak() {
				builder.WriteByte(' ')
			}
		case *ast.CodeSpan:
			builder.WriteString(typed.Value.Value(source))
		case *ast.AutoLink:
			builder.WriteString(typed.Label.Value(source))
		}
		return ast.WalkContinue, nil
	})
	if err != nil {
		return "", fmt.Errorf("read heading text: %w", err)
	}
	return builder.String(), nil
}

func extractAnchors(content []byte) (map[string]struct{}, error) {
	anchors := make(map[string]struct{})
	extractExplicitIDs(content, anchors)

	markdownParser := parser.New(parser.WithExtensions(extension.GFMParser))
	parsed := markdownParser.Parse(content)

	slugCounts := make(map[string]int)
	err := ast.Walk(parsed, func(node ast.Node, entering bool) (ast.WalkStatus, error) {
		if !entering {
			return ast.WalkContinue, nil
		}
		heading, ok := node.(*ast.Heading)
		if !ok {
			return ast.WalkContinue, nil
		}
		text, err := headingPlainText(heading, content)
		if err != nil {
			return ast.WalkStop, err
		}
		baseSlug := githubSlug(text)
		if baseSlug == "" {
			return ast.WalkContinue, nil
		}
		count := slugCounts[baseSlug]
		slugCounts[baseSlug]++
		slug := baseSlug
		if count > 0 {
			slug = fmt.Sprintf("%s-%d", baseSlug, count)
		}
		anchors[slug] = struct{}{}
		return ast.WalkContinue, nil
	})
	if err != nil {
		return nil, fmt.Errorf("collect heading anchors: %w", err)
	}
	return anchors, nil
}

func extractExplicitIDs(content []byte, anchors map[string]struct{}) {
	for _, match := range htmlIDPattern.FindAllSubmatch(content, -1) {
		id := string(match[1])
		anchors[id] = struct{}{}
		anchors[strings.ToLower(id)] = struct{}{}
	}
	for _, match := range anchorNamePattern.FindAllSubmatch(content, -1) {
		id := string(match[1])
		anchors[id] = struct{}{}
		anchors[strings.ToLower(id)] = struct{}{}
	}
}

func validateFragment(document, targetDoc markdownDocument, raw, rawFrag string, report *collector) {
	if rawFrag == "" {
		return
	}
	frag, err := url.PathUnescape(rawFrag)
	if err != nil {
		frag = rawFrag
	}
	if frag == "" {
		return
	}
	anchors := report.anchors(targetDoc)
	if _, ok := anchors[frag]; ok {
		return
	}
	if _, ok := anchors[strings.ToLower(frag)]; ok {
		return
	}
	if !report.admitsBrokenLink(document.relative, raw) {
		report.addError("Broken link fragment in %s: %s", document.relative, raw)
	}
}

func (c *collector) initInventory(documents []markdownDocument) {
	c.inventory = make(map[string]markdownDocument, len(documents))
	c.anchorsCache = make(map[string]map[string]struct{}, len(documents))
	for _, doc := range documents {
		c.inventory[doc.absolute] = doc
	}
}

func (c *collector) anchors(doc markdownDocument) map[string]struct{} {
	if c.anchorsCache == nil {
		c.anchorsCache = make(map[string]map[string]struct{})
	}
	if cached, found := c.anchorsCache[doc.absolute]; found {
		return cached
	}
	set, err := extractAnchors(doc.content)
	if err != nil {
		c.addError("Read anchors in %s: %v", doc.relative, err)
		set = map[string]struct{}{}
	}
	c.anchorsCache[doc.absolute] = set
	return set
}

func (c *collector) documentByPath(candidate, realCandidate string) (markdownDocument, bool) {
	if c.inventory == nil {
		return markdownDocument{}, false
	}
	if doc, found := c.inventory[candidate]; found {
		return doc, true
	}
	if realCandidate != "" && realCandidate != candidate {
		if doc, found := c.inventory[realCandidate]; found {
			return doc, true
		}
	}
	// Also check clean relative path against inventoried relative paths.
	rel := filepath.ToSlash(candidate)
	for _, doc := range c.inventory {
		if doc.absolute == candidate || doc.relative == rel {
			return doc, true
		}
	}
	return markdownDocument{}, false
}
