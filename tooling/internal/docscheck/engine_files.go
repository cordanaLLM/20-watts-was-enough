package docscheck

import (
	"bytes"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"
)

// linkException admits one broken link in one file that the Praetor engine
// writes and locks byte for byte. From the day after Expires the link is
// reported again, and an entry that no broken link uses is an error, so the
// list cannot outlive its cause (decision 0095, point 10).
type linkException struct {
	Path    string
	Target  string
	Reason  string
	Expires string
}

const (
	engineFileExpiry     = "2027-01-09"
	vendorNoteReason     = "vendor note that the Praetor engine writes; the link points into the engine's own repository"
	canonicalSkillsRoot  = ".agents"
	skillsDirectoryName  = "skills"
	clientSkillPathParts = 3
)

var engineLinkExceptions = []linkException{
	{
		Path:    "tools/figures/third_party/interfig/VENDOR.md",
		Target:  "../../../../docs/guides/figures.md",
		Reason:  vendorNoteReason,
		Expires: engineFileExpiry,
	},
	{
		Path:    "tools/figures/third_party/interfig/VENDOR.md",
		Target:  "../../../../docs/adr/0015-interactive-figures-from-vendored-interfig.md",
		Reason:  vendorNoteReason,
		Expires: engineFileExpiry,
	},
}

var calendarDayPattern = regexp.MustCompile(`^\d{4}-\d{2}-\d{2}$`)

// options carries the comparison day and the dated link exceptions of one run.
type options struct {
	today          string
	linkExceptions []linkException
}

func defaultOptions() options {
	return options{today: time.Now().UTC().Format(time.DateOnly), linkExceptions: engineLinkExceptions}
}

func isCalendarDay(value string) bool {
	if !calendarDayPattern.MatchString(value) {
		return false
	}
	_, err := time.Parse(time.DateOnly, value)
	return err == nil
}

// validateOptions reports a malformed comparison day or exception entry. A run
// with such an entry stops before any link is judged.
func validateOptions(run options) []string {
	var findings []string
	if !isCalendarDay(run.today) {
		findings = append(findings, "Link exception comparison day must be a calendar day: "+run.today)
	}
	seen := make(map[string]struct{}, len(run.linkExceptions))
	for _, exception := range run.linkExceptions {
		name := exception.Path + " -> " + exception.Target
		if exception.Path == "" || exception.Target == "" || strings.TrimSpace(exception.Reason) == "" {
			findings = append(findings, "Link exception needs a path, a target and a reason: "+name)
		}
		if !isCalendarDay(exception.Expires) {
			findings = append(findings, "Link exception needs a calendar end day: "+name)
		}
		if _, duplicate := seen[name]; duplicate {
			findings = append(findings, "Link exception is declared twice: "+name)
		}
		seen[name] = struct{}{}
	}
	return findings
}

// admitsBrokenLink reports whether an unexpired exception names this exact file
// and target. An expired entry admits nothing and is reported beside the link.
func (c *collector) admitsBrokenLink(relative, target string) bool {
	for index, exception := range c.run.linkExceptions {
		if exception.Path != relative || exception.Target != target {
			continue
		}
		c.usedLinkExceptions[index] = struct{}{}
		if c.run.today > exception.Expires {
			c.addError("Link exception for %s in %s ended on %s; remove it or decide a new day", target, relative, exception.Expires)
			return false
		}
		c.addWarning("dated exception until %s: broken link in %s: %s", exception.Expires, relative, target)
		return true
	}
	return false
}

func (c *collector) reportUnusedLinkExceptions() {
	for index, exception := range c.run.linkExceptions {
		if _, used := c.usedLinkExceptions[index]; !used {
			c.addError("Link exception matches no broken link: %s in %s; remove the entry", exception.Target, exception.Path)
		}
	}
}

// isRenderedSkillCopy reports whether a file under a client's skills folder
// (.<client>/skills/...) equals the file at the same relative path under
// .agents/skills byte for byte. The engine renders each skill once per client;
// such a copy restates the canonical file and would count its diagrams a second
// time. A copy that differs in one byte is read like any other document.
func isRenderedSkillCopy(root, relative string, content []byte) bool {
	parts := strings.SplitN(relative, "/", clientSkillPathParts)
	if len(parts) != clientSkillPathParts || parts[1] != skillsDirectoryName {
		return false
	}
	if parts[0] == canonicalSkillsRoot || !strings.HasPrefix(parts[0], ".") {
		return false
	}
	canonical := filepath.Join(root, canonicalSkillsRoot, skillsDirectoryName, filepath.FromSlash(parts[2]))
	info, err := os.Lstat(canonical)
	if err != nil || !info.Mode().IsRegular() || info.Size() != int64(len(content)) {
		return false
	}
	original, err := os.ReadFile(canonical)
	return err == nil && bytes.Equal(original, content)
}
