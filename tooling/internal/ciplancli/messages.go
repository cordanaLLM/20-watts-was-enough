package ciplancli

import (
	"context"
	"flag"
	"fmt"
	"io"

	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/ciplan"
)

const maximumPrintedFindings = 64

// RunMessages refuses tool or model attribution in new commit messages, or in
// one prepared message file such as a squash body.
func RunMessages(arguments []string, stdout, stderr io.Writer) int {
	flags := flag.NewFlagSet("ci messages", flag.ContinueOnError)
	flags.SetOutput(stderr)
	root := flags.String("root", ".", "repository root")
	baseRevision := flags.String("base", "", "exact 40-character commit whose history is already accepted")
	headRevision := flags.String("head", "", "exact 40-character commit to check")
	messageFile := flags.String("message-file", "", "one commit-message file to check instead of Git history")
	if err := flags.Parse(arguments); err != nil {
		return 2
	}
	if flags.NArg() != 0 {
		fmt.Fprintf(stderr, "ci messages accepts no positional arguments: %s\n", flags.Arg(0))
		return 2
	}
	if (*messageFile == "") == (*headRevision == "") || (*messageFile != "" && *baseRevision != "") {
		fmt.Fprintln(stderr, "ci messages requires --head, optionally with --base, or --message-file alone")
		return 2
	}
	report, scope, err := checkMessages(*root, *baseRevision, *headRevision, *messageFile)
	if err != nil {
		fmt.Fprintf(stderr, "Check commit messages: %v\n", err)
		return 1
	}
	if len(report.Findings) > 0 {
		writeMessageFindings(stderr, report)
		return 1
	}
	if _, err := fmt.Fprintf(
		completeWriter{stdout}, "Commit messages: %d checked (%s), no tool attribution\n", report.Commits, scope,
	); err != nil {
		fmt.Fprintf(stderr, "Write commit-message result: %v\n", err)
		return 1
	}
	return 0
}

func checkMessages(root, baseRevision, headRevision, messageFile string) (ciplan.MessageReport, string, error) {
	if messageFile != "" {
		report, err := ciplan.CheckCommitMessageFile(messageFile)
		return report, "message file", err
	}
	scope := "head commit only"
	if baseRevision != "" {
		scope = "commits the base does not reach"
	}
	report, err := ciplan.CheckCommitMessages(context.Background(), ciplan.MessageOptions{
		RepositoryRoot: root,
		BaseRevision:   baseRevision,
		HeadRevision:   headRevision,
	})
	return report, scope, err
}

func writeMessageFindings(stderr io.Writer, report ciplan.MessageReport) {
	for index, finding := range report.Findings {
		if index == maximumPrintedFindings {
			fmt.Fprintf(stderr, "... and %d more\n", len(report.Findings)-index)
			break
		}
		source := "message file"
		if finding.Commit != "" {
			source = "commit " + finding.Commit[:12]
		}
		fmt.Fprintf(stderr, "%s, line %d: %s: %s\n", source, finding.Line, finding.Rule, finding.Text)
	}
	fmt.Fprintf(
		stderr,
		"Commit messages: %d refused line(s). A tool or model is not an author; remove the line and disclose material tool use in the pull request or under research/disclosures/.\n",
		len(report.Findings),
	)
}
