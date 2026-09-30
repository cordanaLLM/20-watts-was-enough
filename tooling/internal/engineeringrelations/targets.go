package engineeringrelations

import (
	"bytes"
	"errors"
	"fmt"
	"regexp"
	"strings"
	"unicode"
)

const (
	maximumMarkdownBytes = 8 << 20
	maximumTargetBytes   = 64 << 20
)

type targetKind int

const (
	targetCandidate targetKind = iota + 1
	targetFixture
	targetPrinciple
	targetEnergy
)

var (
	claimTargetPattern     = regexp.MustCompile(`(?:^|[:/])C-[0-9]+$`)
	candidateTargetPattern = regexp.MustCompile(`^candidate-([0-9]{3})$`)
	fixtureTargetPattern   = regexp.MustCompile(`^fixture-([0-9]{3})$`)
	principleTargetPattern = regexp.MustCompile(`^P-[0-9]{3}$`)
	energyTargetPattern    = regexp.MustCompile(`^energy:(H-E[0-9])$`)
	principleHeading       = regexp.MustCompile(`(?m)^## (P-[0-9]{3})\b`)
	energyHeading          = regexp.MustCompile(`(?m)^### (H-E[0-9]) `)
	sectionPattern         = regexp.MustCompile(`^[a-z0-9][a-z0-9_-]{0,127}$`)
)

// resolvedTarget is a target identity and the file that defines it.
type resolvedTarget struct {
	kind targetKind
	file string
}

// targetIndex resolves 20w target identities offline and caches the bounded
// target files it reads.
type targetIndex struct {
	repository  repository
	candidates  map[string]string
	fixtures    map[string]string
	principles  map[string]bool
	energy      map[string]bool
	contents    map[string][]byte
	cachedBytes int64
}

func newTargetIndex(repo repository, report *collector) *targetIndex {
	index := &targetIndex{repository: repo, contents: make(map[string][]byte)}
	var err error
	if index.candidates, err = repo.numberedMarkdown(candidateDirectory); err != nil {
		report.add("%v", err)
	}
	if index.fixtures, err = repo.numberedMarkdown(fixtureDirectory); err != nil {
		report.add("%v", err)
	}
	index.principles = index.headings(principleRegistry, principleHeading, report)
	index.energy = index.headings(energyModelPath, energyHeading, report)
	return index
}

func (index *targetIndex) headings(relative string, pattern *regexp.Regexp, report *collector) map[string]bool {
	identities := make(map[string]bool)
	content, err := index.content(relative)
	if err != nil {
		report.add("%v", err)
		return identities
	}
	for _, match := range pattern.FindAllSubmatch(content, -1) {
		identities[string(match[1])] = true
	}
	return identities
}

// content reads one target file once, within a total read budget.
func (index *targetIndex) content(relative string) ([]byte, error) {
	if body, cached := index.contents[relative]; cached {
		return body, nil
	}
	body, err := index.repository.read(relative, maximumMarkdownBytes)
	if err != nil {
		return nil, err
	}
	index.cachedBytes += int64(len(body))
	if index.cachedBytes > maximumTargetBytes {
		return nil, fmt.Errorf("target files exceed the %d-byte read budget", maximumTargetBytes)
	}
	index.contents[relative] = body
	return body, nil
}

func (index *targetIndex) resolve(target string) (resolvedTarget, error) {
	if claimTargetPattern.MatchString(target) {
		return resolvedTarget{}, errors.New("a C- claim is never a target: code does not support a claim (decision 0087)")
	}
	if strings.Contains(target, "/") {
		return resolvedTarget{}, errors.New("topic-qualified targets wait until the topic registry can resolve them")
	}
	if match := candidateTargetPattern.FindStringSubmatch(target); match != nil {
		return numbered(targetCandidate, index.candidates, match[1], target)
	}
	if match := fixtureTargetPattern.FindStringSubmatch(target); match != nil {
		return numbered(targetFixture, index.fixtures, match[1], target)
	}
	if principleTargetPattern.MatchString(target) {
		return defined(targetPrinciple, index.principles, target, principleRegistry)
	}
	if match := energyTargetPattern.FindStringSubmatch(target); match != nil {
		return defined(targetEnergy, index.energy, match[1], energyModelPath)
	}
	return resolvedTarget{}, fmt.Errorf("%q is not candidate-NNN, fixture-NNN, P-NNN or energy:H-EN", target)
}

func numbered(kind targetKind, files map[string]string, number, target string) (resolvedTarget, error) {
	file, found := files[number]
	if !found {
		return resolvedTarget{}, fmt.Errorf("%s has no contract file", target)
	}
	return resolvedTarget{kind: kind, file: file}, nil
}

func defined(kind targetKind, identities map[string]bool, identity, file string) (resolvedTarget, error) {
	if !identities[identity] {
		return resolvedTarget{}, fmt.Errorf("%s is not defined in %s", identity, file)
	}
	return resolvedTarget{kind: kind, file: file}, nil
}

func checkTarget(label string, relation Relation, index *targetIndex, report *collector) {
	target, err := index.resolve(relation.Target)
	if err != nil {
		report.add("%s: target: %v", label, err)
		return
	}
	if relation.Role == "candidate-arm" && target.kind != targetCandidate {
		report.add("%s: role candidate-arm needs a candidate-NNN target, whose residual it names", label)
	}
	if relation.Role == "fixture-stressor" && target.kind != targetFixture {
		report.add("%s: role fixture-stressor needs a fixture-NNN target", label)
	}
	if relation.TargetSection != nil {
		index.checkSection(label, *relation.TargetSection, target, report)
	}
	if relation.Metric != nil {
		index.checkMetric(label, *relation.Metric, target, report)
	}
}

func (index *targetIndex) checkSection(label, section string, target resolvedTarget, report *collector) {
	if target.kind != targetCandidate && target.kind != targetFixture {
		report.add("%s: target_section applies only to candidate and fixture targets", label)
		return
	}
	if !sectionPattern.MatchString(section) {
		report.add("%s: target_section %q is not a heading slug", label, section)
		return
	}
	content, err := index.content(target.file)
	if err != nil {
		report.add("%s: %v", label, err)
		return
	}
	if !containsHeadingSlug(content, section) {
		report.add("%s: target_section %q names no heading in %s", label, section, target.file)
	}
}

// checkMetric requires the metric to quote a measurement the target file
// already names, so a row cannot invent the quantity it claims to measure.
func (index *targetIndex) checkMetric(label, metric string, target resolvedTarget, report *collector) {
	content, err := index.content(target.file)
	if err != nil {
		report.add("%s: %v", label, err)
		return
	}
	if metric == "" || !bytes.Contains(content, []byte(metric)) {
		report.add("%s: metric %q does not quote a measurement named in %s", label, metric, target.file)
	}
}

// containsHeadingSlug reports whether a level-two to level-six heading outside
// fenced code has the GitHub-style slug.
func containsHeadingSlug(content []byte, slug string) bool {
	fenced := false
	for _, line := range strings.Split(string(content), "\n") {
		line = strings.TrimRight(line, "\r")
		if strings.HasPrefix(line, "```") || strings.HasPrefix(line, "~~~") {
			fenced = !fenced
			continue
		}
		if text, heading := headingText(line); heading && !fenced && slugify(text) == slug {
			return true
		}
	}
	return false
}

func headingText(line string) (string, bool) {
	level := len(line) - len(strings.TrimLeft(line, "#"))
	if level < 2 || level > 6 || !strings.HasPrefix(line[level:], " ") {
		return "", false
	}
	return strings.TrimSpace(line[level:]), true
}

func slugify(text string) string {
	var slug strings.Builder
	for _, character := range strings.ToLower(text) {
		switch {
		case unicode.IsLetter(character), unicode.IsDigit(character), character == '-', character == '_':
			slug.WriteRune(character)
		case character == ' ':
			slug.WriteRune('-')
		}
	}
	return slug.String()
}
