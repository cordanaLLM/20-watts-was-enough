package main

import (
	"flag"
	"fmt"
	"io"

	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/translationbundle"
)

func runTranslationExportCandidate(arguments []string, stdout, stderr io.Writer) int {
	flags := flag.NewFlagSet("translation export-candidate", flag.ContinueOnError)
	flags.SetOutput(stderr)
	root := flags.String("root", ".", "repository root")
	source := flags.String("source", "", "canonical concept/math Markdown path")
	language := flags.String("language", "", "non-English two-letter target language")
	output := flags.String("output", "", "new candidate JSON path")
	if err := flags.Parse(arguments); err != nil || flags.NArg() != 0 || *source == "" || *language == "" || *output == "" {
		fmt.Fprintln(stderr, "translation export-candidate requires --source, --language and --output")
		return 2
	}
	bundle, err := translationbundle.ExportCandidate(translationbundle.ExportOptions{
		RepositoryRoot: *root,
		SourcePath:     *source,
		TargetLanguage: *language,
		OutputPath:     *output,
	})
	if err != nil {
		fmt.Fprintf(stderr, "Export translation candidate: %v\n", err)
		return 1
	}
	fmt.Fprintf(
		stdout,
		"Exported candidate source %s (%s) for %s; drafting and review remain undisclosed/unreviewed.\n",
		bundle.Source.Path,
		bundle.Source.SHA256,
		bundle.Target.Language,
	)
	return 0
}

func runTranslationValidateCandidate(arguments []string, stdout, stderr io.Writer) int {
	flags := flag.NewFlagSet("translation validate-candidate", flag.ContinueOnError)
	flags.SetOutput(stderr)
	root := flags.String("root", ".", "repository root")
	input := flags.String("input", "", "returned candidate JSON path")
	source := flags.String("source", "", "expected canonical concept/math Markdown path")
	language := flags.String("language", "", "expected non-English two-letter target language")
	if err := flags.Parse(arguments); err != nil || flags.NArg() != 0 || *input == "" || *source == "" || *language == "" {
		fmt.Fprintln(stderr, "translation validate-candidate requires --input, --source and --language")
		return 2
	}
	result, err := translationbundle.ValidateCandidate(translationbundle.ValidateOptions{
		RepositoryRoot:         *root,
		InputPath:              *input,
		ExpectedSourcePath:     *source,
		ExpectedTargetLanguage: *language,
	})
	if err != nil {
		fmt.Fprintf(stderr, "Validate translation candidate: %v\n", err)
		return 1
	}
	fmt.Fprintf(
		stdout,
		"Validated source-bound candidate bundle sha256:%s: %s (source sha256:%s) for %s (target sha256:%s, drafting %s, review %s, %d unresolved glossary terms). No files were written; translation quality was not assessed and this is not publication authority.\n",
		result.BundleSHA256,
		result.SourcePath,
		result.SourceSHA256,
		result.TargetLanguage,
		result.TargetSHA256,
		result.DraftingMode,
		result.ReviewStatus,
		result.UnresolvedGlossary,
	)
	return 0
}

func runTranslationImportCandidate(arguments []string, stdout, stderr io.Writer) int {
	flags := flag.NewFlagSet("translation import-candidate", flag.ContinueOnError)
	flags.SetOutput(stderr)
	root := flags.String("root", ".", "repository root")
	input := flags.String("input", "", "returned candidate JSON path")
	source := flags.String("source", "", "expected canonical concept/math Markdown path")
	language := flags.String("language", "", "expected non-English two-letter target language")
	output := flags.String("output", "", "new candidate-only output directory")
	if err := flags.Parse(arguments); err != nil || flags.NArg() != 0 || *input == "" || *source == "" || *language == "" || *output == "" {
		fmt.Fprintln(stderr, "translation import-candidate requires --input, --source, --language and --output")
		return 2
	}
	result, err := translationbundle.ImportCandidate(translationbundle.ImportOptions{
		RepositoryRoot:         *root,
		InputPath:              *input,
		ExpectedSourcePath:     *source,
		ExpectedTargetLanguage: *language,
		OutputDirectory:        *output,
	})
	if err != nil {
		fmt.Fprintf(stderr, "Import translation candidate: %v\n", err)
		return 1
	}
	fmt.Fprintf(
		stdout,
		"Imported candidate %s with receipt %s (sha256:%s, %d unresolved glossary terms). It is not publication authority.\n",
		result.MarkdownPath,
		result.ReceiptPath,
		result.TargetSHA256,
		result.UnresolvedGlossary,
	)
	return 0
}
