package ciplan

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"regexp"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/boundedexec"
)

const (
	gitLogTimeout             = 15 * time.Second
	maximumCheckedCommits     = 512
	maximumCommitMessageBytes = 64 << 10
	maximumGitLogBytes        = 4 << 20

	// ToolCoAuthorRule names a co-author trailer that credits a tool or model.
	ToolCoAuthorRule = "tool co-author trailer"
	// GeneratedFooterRule names a footer that advertises the generating tool.
	GeneratedFooterRule = "generated-with footer"
)

// The address and the first name pattern are the trailers measured in this
// repository's history; the tool names add the selected agent clients.
var (
	coAuthorPattern        = regexp.MustCompile(`(?i)^[ \t]*co-authored-by[ \t]*:(.*)$`)
	toolAddressPattern     = regexp.MustCompile(`(?i)@anthropic\.com$`)
	modelNamePattern       = regexp.MustCompile(`(?i)\bclaude[ \t]+(opus|sonnet|haiku|fable|code)\b`)
	toolNamePattern        = regexp.MustCompile(`(?i)\b(copilot|codex|chatgpt|gemini)\b`)
	generatedFooterPattern = regexp.MustCompile(`(?i)^\W*generated[ \t]+(with|by)[ \t]+\[?(claude|copilot|codex|chatgpt|gemini)\b`)
)

// AttributionFinding locates one refused line. Commit is empty for a message file.
type AttributionFinding struct {
	Commit string
	Line   int
	Rule   string
	Text   string
}

// MessageOptions selects the head commit alone, or every commit that the
// head reaches and the base does not.
type MessageOptions struct {
	RepositoryRoot string
	BaseRevision   string
	HeadRevision   string
}

// MessageReport counts the checked messages and lists every refused line.
type MessageReport struct {
	Commits  int
	Findings []AttributionFinding
}

type commitMessage struct {
	commit  string
	message string
}

// CheckCommitMessage refuses tool or model attribution in one commit message.
func CheckCommitMessage(message string) []AttributionFinding {
	findings := []AttributionFinding{}
	lines := strings.Split(strings.ReplaceAll(message, "\r\n", "\n"), "\n")
	for index, line := range lines {
		rule := attributionRule(line)
		if rule == "" {
			continue
		}
		findings = append(findings, AttributionFinding{
			Line: index + 1,
			Rule: rule,
			Text: strings.TrimSpace(line),
		})
	}
	return findings
}

func attributionRule(line string) string {
	if match := coAuthorPattern.FindStringSubmatch(line); match != nil {
		if coAuthorIsTool(match[1]) {
			return ToolCoAuthorRule
		}
		return ""
	}
	if generatedFooterPattern.MatchString(line) {
		return GeneratedFooterRule
	}
	return ""
}

func coAuthorIsTool(value string) bool {
	name, address := value, ""
	if start := strings.LastIndex(value, "<"); start >= 0 {
		name = value[:start]
		address = strings.TrimSuffix(strings.TrimSpace(value[start+1:]), ">")
	}
	return toolAddressPattern.MatchString(strings.TrimSpace(address)) ||
		modelNamePattern.MatchString(name) ||
		toolNamePattern.MatchString(name)
}

// CheckCommitMessages checks only the selected commits, so that attribution
// already present in accepted history does not fail every later change.
func CheckCommitMessages(ctx context.Context, options MessageOptions) (MessageReport, error) {
	root, err := resolveRepositoryRoot(options.RepositoryRoot)
	if err != nil {
		return MessageReport{}, err
	}
	if !revisionPattern.MatchString(options.HeadRevision) ||
		(options.BaseRevision != "" && !revisionPattern.MatchString(options.BaseRevision)) {
		return MessageReport{}, errors.New("commit-message revisions must be exact 40-character commits")
	}
	messages, err := readCommitMessages(
		ctx, root, options.BaseRevision, options.HeadRevision, maximumCheckedCommits,
	)
	if err != nil {
		return MessageReport{}, err
	}
	report := MessageReport{Commits: len(messages), Findings: []AttributionFinding{}}
	for _, entry := range messages {
		for _, finding := range CheckCommitMessage(entry.message) {
			finding.Commit = entry.commit
			report.Findings = append(report.Findings, finding)
		}
	}
	return report, nil
}

// CheckCommitMessageFile checks one prepared message, such as a squash body.
func CheckCommitMessageFile(messagePath string) (MessageReport, error) {
	information, err := os.Lstat(messagePath)
	if err != nil || !information.Mode().IsRegular() {
		return MessageReport{}, errors.New("commit-message file must be a regular file")
	}
	if information.Size() > maximumCommitMessageBytes {
		return MessageReport{}, errors.New("commit-message file exceeds the size limit")
	}
	file, err := os.Open(messagePath) //#nosec G304 -- path validated as regular bounded file within maximum size
	if err != nil {
		return MessageReport{}, fmt.Errorf("open commit-message file: %w", err)
	}
	defer file.Close()
	body, err := io.ReadAll(io.LimitReader(file, maximumCommitMessageBytes+1))
	if err != nil {
		return MessageReport{}, fmt.Errorf("read commit-message file: %w", err)
	}
	if len(body) > maximumCommitMessageBytes || !utf8.Valid(body) {
		return MessageReport{}, errors.New("commit-message file exceeds the size limit or is not UTF-8")
	}
	return MessageReport{Commits: 1, Findings: CheckCommitMessage(string(body))}, nil
}

func readCommitMessages(
	ctx context.Context,
	root, baseRevision, headRevision string,
	limit int,
) ([]commitMessage, error) {
	gitExecutable, err := exec.LookPath("git")
	if err != nil {
		return nil, errors.New("locate Git executable")
	}
	logContext, cancel := context.WithTimeout(ctx, gitLogTimeout)
	defer cancel()
	// One commit more than the limit distinguishes a full range from an exceeded one.
	count := limit + 1
	revisions := []string{headRevision, "^" + baseRevision}
	if baseRevision == "" {
		count = 1
		revisions = revisions[:1]
	}
	arguments := append([]string{
		"-C", root, "log", "--no-show-signature", "-z", "--format=%H%n%B",
		"--max-count=" + strconv.Itoa(count), "--end-of-options",
	}, revisions...)
	standardOutput := newBoundedBuffer(maximumGitLogBytes)
	standardError := newBoundedBuffer(maximumGitErrorBytes)
	command := exec.CommandContext(logContext, gitExecutable, append(arguments, "--")...) //#nosec G204 -- fixed git binary with validated revisions and end-of-options guard
	command.Env = boundedexec.GitEnvironment()
	command.Stdout = standardOutput
	command.Stderr = standardError
	command.WaitDelay = time.Second
	if err := command.Run(); err != nil {
		return nil, fmt.Errorf("run bounded Git log: %w", err)
	}
	messages, err := parseCommitMessages(standardOutput.Bytes())
	if err != nil {
		return nil, err
	}
	if baseRevision != "" && len(messages) > limit {
		return nil, errors.New("commit range exceeds the checked-commit limit")
	}
	return messages, nil
}

func parseCommitMessages(body []byte) ([]commitMessage, error) {
	if len(body) == 0 {
		return []commitMessage{}, nil
	}
	if body[len(body)-1] != 0 {
		return nil, errors.New("Git log output is truncated")
	}
	records := bytes.Split(body[:len(body)-1], []byte{0})
	messages := make([]commitMessage, 0, len(records))
	for _, record := range records {
		commit, message, found := strings.Cut(string(record), "\n")
		if !found || !revisionPattern.MatchString(commit) || !utf8.ValidString(message) {
			return nil, errors.New("Git log output is malformed")
		}
		if len(message) > maximumCommitMessageBytes {
			return nil, errors.New("commit message exceeds the size limit")
		}
		messages = append(messages, commitMessage{commit: commit, message: message})
	}
	return messages, nil
}
