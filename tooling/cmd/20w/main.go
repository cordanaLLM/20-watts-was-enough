// Command 20w runs repository validation and experiment tools.
package main

import (
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/signal"
	"regexp"
	"strings"
	"syscall"
	"time"

	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/buildinfo"
	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/ciplancli"
	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/docscheck"
	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/experimentcli"
	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/githubapi"
	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/githubissuelifecycle"
	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/githubissuemilestones"
	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/githublabels"
	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/githubmilestones"
	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/githubprmetadata"
	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/ocimanifest"
	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/pdfrender"
	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/releasecheck"
	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/releaseimage"
	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/workstationrunner"
)

var githubOutputPrefixPattern = regexp.MustCompile(`^[a-z][a-z0-9_]{0,31}$`)

type repeatedString []string

func (values *repeatedString) String() string { return strings.Join(*values, ",") }

func (values *repeatedString) Set(value string) error {
	*values = append(*values, value)
	return nil
}

func usage(writer io.Writer) {
	fmt.Fprintln(writer, "Usage:")
	fmt.Fprintln(writer, "  20w ci plan [--root <repository>] [--base <commit> --head <commit> | --full] [--json]")
	fmt.Fprintln(writer, "  20w ci project")
	fmt.Fprintln(writer, "  20w ci run-workstation [--root <repository>]")
	fmt.Fprintln(writer, "  20w validate docs [--root <repository>]")
	experimentcli.Usage(writer)
	fmt.Fprintln(writer, "  20w publication render-pdf [--root <repository>] [--ref main|vMAJOR.MINOR.PATCH] [--revision <commit>] [--check]")
	fmt.Fprintln(writer, "  20w publication verify-pdf-tools [--root <repository>]")
	fmt.Fprintln(writer, "  20w publication reproduce-pdf-tools-image --receipt <new.json> [--candidate-bundle <new.tar> --final-archive <new.tar> --spdx <new.spdx.json> --source-bundle <new.tar.gz>] [--root <repository>]")
	fmt.Fprintln(writer, "  20w publication verify-pdf-tools-candidate-bundle --bundle <candidate.tar> --sha256 <digest> [--root <repository>]")
	fmt.Fprintln(writer, "  20w publication verify-pdf-reproducibility --receipt <new.json> [--root <repository>] [--ref main|vMAJOR.MINOR.PATCH] [--revision <commit>]")
	fmt.Fprintln(writer, "  20w publication verify-public-transport [--root <repository>] [--check]")
	fmt.Fprintln(writer, "  20w translation export-candidate --source <concept-or-math.md> --language <code> --output <new.json> [--root <repository>]")
	fmt.Fprintln(writer, "  20w translation validate-candidate --input <candidate.json> --source <concept-or-math.md> --language <code> [--root <repository>]")
	fmt.Fprintln(writer, "  20w translation import-candidate --input <candidate.json> --source <concept-or-math.md> --language <code> --output <new-directory> [--root <repository>]")
	fmt.Fprintln(writer, "  20w github sync-metadata [--root <repository>] [--check | --repository <owner/name>]")
	fmt.Fprintln(writer, "  20w github sync-pr-metadata [--root <repository>] [--check | --repository <owner/name> --pull-request <number> --event-action <action> --merged <true|false>]")
	fmt.Fprintln(writer, "  20w github sync-issue-lifecycle --root <repository> --repository <owner/name> --issue <number> --issue-action closed|reopened")
	fmt.Fprintln(writer, "  20w github sync-labels [--root <repository>] [--check | --repository <owner/name>]")
	fmt.Fprintln(writer, "  20w release inspect-image --image <registry path> --tag <vX.Y.Z> --revision <commit> --platform <os/arch> --expected-label <key=value>")
	fmt.Fprintln(writer, "  20w release asset-inventory --assets <directory> --phase source|publication")
	fmt.Fprintln(writer, "  20w release fetch-assets --repository <owner/name> --release-id <id> --expected-assets <directory> --phase source|publication --output <new-directory> [--tag <vX.Y.Z> --revision <commit>]")
	fmt.Fprintln(writer, "  20w release state --repository <owner/name> --tag <vX.Y.Z> [--json]")
	fmt.Fprintln(writer, "  20w release compare-publication-manifest --source <SHA256SUMS> --publication <SHA256SUMS> [--oci <oci-images.json>]")
	fmt.Fprintln(writer, "  20w release verify-tag --repository <owner/name> --tag <vX.Y.Z> --commit <commit>")
	fmt.Fprintln(writer, "  20w release write-oci-images --output <path> --repository <owner/name> --tag <vX.Y.Z> --revision <commit> --tooling-digest <sha256> --fixture-007-digest <sha256> --fixture-019-digest <sha256>")
	fmt.Fprintln(writer, "  20w release validate-oci-images --input <path> --repository <owner/name> --tag <vX.Y.Z> --revision <commit> [--github-output]")
	fmt.Fprintln(writer, "  20w version [--json]")
}

func run(arguments []string, stdout, stderr io.Writer) int {
	if len(arguments) == 0 || arguments[0] == "help" || arguments[0] == "--help" || arguments[0] == "-h" {
		usage(stdout)
		return 0
	}
	switch arguments[0] {
	case "ci":
		if len(arguments) >= 2 && arguments[1] == "plan" {
			return runCIPlan(arguments[2:], stdout, stderr)
		}
		if len(arguments) >= 2 && arguments[1] == "project" {
			return runCIProject(arguments[2:], os.Stdin, stdout, stderr)
		}
		if len(arguments) >= 2 && arguments[1] == "run-workstation" {
			return runCIWorkstation(arguments[2:], stdout, stderr)
		}
	case "validate":
		if len(arguments) >= 2 && arguments[1] == "docs" {
			return runValidateDocs(arguments[2:], stdout, stderr)
		}
	case "experiment":
		if code, handled := experimentcli.Run(arguments[1:], stdout, stderr); handled {
			return code
		}
	case "release":
		if len(arguments) >= 2 && arguments[1] == "inspect-image" {
			return runReleaseInspectImage(arguments[2:], stdout, stderr)
		}
		if len(arguments) >= 2 && arguments[1] == "asset-inventory" {
			return runReleaseAssetInventory(arguments[2:], stdout, stderr)
		}
		if len(arguments) >= 2 && arguments[1] == "fetch-assets" {
			return runReleaseFetchAssets(arguments[2:], stdout, stderr)
		}
		if len(arguments) >= 2 && arguments[1] == "state" {
			return runReleaseState(arguments[2:], stdout, stderr)
		}
		if len(arguments) >= 2 && arguments[1] == "compare-publication-manifest" {
			return runReleaseComparePublicationManifest(arguments[2:], stdout, stderr)
		}
		if len(arguments) >= 2 && arguments[1] == "verify-tag" {
			return runReleaseVerifyTag(arguments[2:], stdout, stderr)
		}
		if len(arguments) >= 2 && arguments[1] == "write-oci-images" {
			return runReleaseWriteOCIImages(arguments[2:], stdout, stderr)
		}
		if len(arguments) >= 2 && arguments[1] == "validate-oci-images" {
			return runReleaseValidateOCIImages(arguments[2:], stdout, stderr)
		}
	case "publication":
		if len(arguments) >= 2 && arguments[1] == "render-pdf" {
			return runPublicationRenderPDF(arguments[2:], stdout, stderr)
		}
		if len(arguments) >= 2 && arguments[1] == "verify-pdf-tools" {
			return runPublicationVerifyPDFTools(arguments[2:], stdout, stderr)
		}
		if len(arguments) >= 2 && arguments[1] == "reproduce-pdf-tools-image" {
			return runPublicationReproducePDFToolsImage(arguments[2:], stdout, stderr)
		}
		if len(arguments) >= 2 && arguments[1] == "verify-pdf-tools-candidate-bundle" {
			return runPublicationVerifyPDFToolsCandidateBundle(arguments[2:], stdout, stderr)
		}
		if len(arguments) >= 2 && arguments[1] == "verify-pdf-reproducibility" {
			return runPublicationVerifyPDFReproducibility(arguments[2:], stdout, stderr)
		}
		if len(arguments) >= 2 && arguments[1] == "verify-public-transport" {
			return runPublicationVerifyPublicTransport(arguments[2:], stdout, stderr)
		}
	case "translation":
		if len(arguments) >= 2 && arguments[1] == "export-candidate" {
			return runTranslationExportCandidate(arguments[2:], stdout, stderr)
		}
		if len(arguments) >= 2 && arguments[1] == "validate-candidate" {
			return runTranslationValidateCandidate(arguments[2:], stdout, stderr)
		}
		if len(arguments) >= 2 && arguments[1] == "import-candidate" {
			return runTranslationImportCandidate(arguments[2:], stdout, stderr)
		}
	case "github":
		if len(arguments) >= 2 && arguments[1] == "sync-metadata" {
			return runGitHubSyncMetadata(arguments[2:], stdout, stderr)
		}
		if len(arguments) >= 2 && arguments[1] == "sync-pr-metadata" {
			return runGitHubSyncPullRequestMetadata(arguments[2:], stdout, stderr)
		}
		if len(arguments) >= 2 && arguments[1] == "sync-issue-lifecycle" {
			return runGitHubSyncIssueLifecycle(arguments[2:], stdout, stderr)
		}
		if len(arguments) >= 2 && arguments[1] == "sync-labels" {
			return runGitHubSyncLabels(arguments[2:], stdout, stderr)
		}
	case "version":
		return runVersion(arguments[1:], stdout, stderr)
	}
	fmt.Fprintf(stderr, "Unknown 20w command: %s\n", arguments[0])
	usage(stderr)
	return 2
}

func runCIProject(arguments []string, stdin io.Reader, stdout, stderr io.Writer) int {
	return ciplancli.RunProject(arguments, stdin, stdout, stderr)
}

func runCIPlan(arguments []string, stdout, stderr io.Writer) int {
	return ciplancli.RunPlan(arguments, stdout, stderr)
}

func runCIWorkstation(arguments []string, stdout, stderr io.Writer) int {
	flags := flag.NewFlagSet("ci run-workstation", flag.ContinueOnError)
	flags.SetOutput(stderr)
	root := flags.String("root", ".", "repository root")
	if err := flags.Parse(arguments); err != nil || flags.NArg() != 0 {
		return 2
	}
	ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer cancel()
	if err := workstationrunner.Run(ctx, *root, stdout); err != nil {
		fmt.Fprintf(stderr, "Run bounded workstation suite: %v\n", err)
		return 1
	}
	return 0
}

func runReleaseAssetInventory(arguments []string, stdout, stderr io.Writer) int {
	flags := flag.NewFlagSet("release asset-inventory", flag.ContinueOnError)
	flags.SetOutput(stderr)
	assets := flags.String("assets", "", "flat release asset directory")
	phaseValue := flags.String("phase", "", "source or publication inventory phase")
	if err := flags.Parse(arguments); err != nil || flags.NArg() != 0 || *assets == "" {
		return 2
	}
	phase := releasecheck.InventoryPhase(*phaseValue)
	if phase != releasecheck.SourceAssets && phase != releasecheck.PublicationAssets {
		fmt.Fprintln(stderr, "release asset-inventory requires --phase source or --phase publication")
		return 2
	}
	names, err := releasecheck.ValidateAssetInventory(*assets, phase)
	if err != nil {
		fmt.Fprintf(stderr, "Validate release asset inventory: %v\n", err)
		return 1
	}
	for _, name := range names {
		fmt.Fprintln(stdout, name)
	}
	return 0
}

func runReleaseFetchAssets(arguments []string, stdout, stderr io.Writer) int {
	flags := flag.NewFlagSet("release fetch-assets", flag.ContinueOnError)
	flags.SetOutput(stderr)
	repository := flags.String("repository", "", "GitHub owner/repository")
	releaseID := flags.Int64("release-id", 0, "positive GitHub Release ID")
	expectedAssets := flags.String("expected-assets", "", "validated local release asset directory")
	phaseValue := flags.String("phase", "", "source or publication inventory phase")
	output := flags.String("output", "", "new downloaded asset directory")
	tag := flags.String("tag", "", "source-phase vMAJOR.MINOR.PATCH tag")
	revision := flags.String("revision", "", "source-phase lowercase 40-character commit")
	if err := flags.Parse(arguments); err != nil || flags.NArg() != 0 || *repository == "" ||
		*releaseID <= 0 || *expectedAssets == "" || *output == "" {
		return 2
	}
	phase := releasecheck.InventoryPhase(*phaseValue)
	if phase != releasecheck.SourceAssets && phase != releasecheck.PublicationAssets {
		fmt.Fprintln(stderr, "release fetch-assets requires --phase source or --phase publication")
		return 2
	}
	if (phase == releasecheck.SourceAssets && (*tag == "" || *revision == "")) ||
		(phase == releasecheck.PublicationAssets && (*tag != "" || *revision != "")) {
		fmt.Fprintln(stderr, "release fetch-assets requires --tag and --revision only for the source phase")
		return 2
	}
	ctx, cancel := context.WithTimeout(context.Background(), 70*time.Minute)
	defer cancel()
	names, err := releasecheck.FetchReleaseAssets(ctx, releasecheck.FetchAssetsOptions{
		Repository:      *repository,
		ReleaseID:       *releaseID,
		ExpectedAssets:  *expectedAssets,
		Phase:           phase,
		OutputDirectory: *output,
		ReleaseTag:      *tag,
		ReleaseCommit:   *revision,
	}, releasecheck.GHReleaseAssetClient{})
	if err != nil {
		fmt.Fprintf(stderr, "Fetch bounded GitHub Release assets: %v\n", err)
		return 1
	}
	for _, name := range names {
		fmt.Fprintln(stdout, name)
	}
	return 0
}

func runReleaseState(arguments []string, stdout, stderr io.Writer) int {
	flags := flag.NewFlagSet("release state", flag.ContinueOnError)
	flags.SetOutput(stderr)
	repository := flags.String("repository", "", "GitHub owner/repository")
	tag := flags.String("tag", "", "exact vMAJOR.MINOR.PATCH tag")
	jsonOutput := flags.Bool("json", false, "write one stable JSON object")
	if err := flags.Parse(arguments); err != nil || flags.NArg() != 0 || *repository == "" || *tag == "" {
		return 2
	}
	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	defer cancel()
	state, err := releasecheck.LookupReleaseState(
		ctx,
		*repository,
		*tag,
		releasecheck.GHReleaseStateResolver{},
	)
	if err != nil {
		fmt.Fprintf(stderr, "Resolve exact GitHub Release state: %v\n", err)
		return 1
	}
	if *jsonOutput {
		if err := json.NewEncoder(stdout).Encode(state); err != nil {
			fmt.Fprintf(stderr, "Write GitHub Release state: %v\n", err)
			return 1
		}
		return 0
	}
	if !state.Present {
		fmt.Fprintln(stdout, "absent")
		return 0
	}
	fmt.Fprintf(
		stdout,
		"present\t%d\t%t\t%t\t%t\t%s\n",
		state.ID,
		state.Draft,
		state.Prerelease,
		state.Immutable,
		state.Tag,
	)
	return 0
}

func runReleaseComparePublicationManifest(arguments []string, stdout, stderr io.Writer) int {
	flags := flag.NewFlagSet("release compare-publication-manifest", flag.ContinueOnError)
	flags.SetOutput(stderr)
	source := flags.String("source", "", "verified source SHA256SUMS path")
	publication := flags.String("publication", "", "candidate publication SHA256SUMS path")
	oci := flags.String("oci", "", "optional downloaded oci-images.json path")
	if err := flags.Parse(arguments); err != nil || flags.NArg() != 0 || *source == "" || *publication == "" {
		return 2
	}
	if err := releasecheck.ComparePublicationManifest(*source, *publication, *oci); err != nil {
		fmt.Fprintf(stderr, "Compare release checksum authorities: %v\n", err)
		return 1
	}
	fmt.Fprintln(stdout, "Publication SHA256SUMS preserves every source identity and adds one OCI image identity.")
	return 0
}

func runReleaseVerifyTag(arguments []string, stdout, stderr io.Writer) int {
	flags := flag.NewFlagSet("release verify-tag", flag.ContinueOnError)
	flags.SetOutput(stderr)
	repository := flags.String("repository", "", "GitHub owner/repository")
	tag := flags.String("tag", "", "exact vMAJOR.MINOR.PATCH tag")
	commit := flags.String("commit", "", "lowercase 40-character release commit")
	if err := flags.Parse(arguments); err != nil || flags.NArg() != 0 || *repository == "" || *tag == "" || *commit == "" {
		return 2
	}
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Minute)
	defer cancel()
	if err := releasecheck.VerifyTagBinding(ctx, *repository, *tag, *commit, releasecheck.GHResolver{}); err != nil {
		fmt.Fprintf(stderr, "Verify immutable release tag binding: %v\n", err)
		return 1
	}
	fmt.Fprintf(stdout, "Remote release tag %s is bound to %s.\n", *tag, *commit)
	return 0
}

func runPublicationRenderPDF(arguments []string, stdout, stderr io.Writer) int {
	flags := flag.NewFlagSet("publication render-pdf", flag.ContinueOnError)
	flags.SetOutput(stderr)
	root := flags.String("root", ".", "repository root")
	sourceRef := flags.String("ref", "main", "book source ref")
	sourceRevision := flags.String("revision", "", "exact lowercase 40-character source commit")
	check := flags.Bool("check", false, "validate the renderer lock without Docker or network access")
	if err := flags.Parse(arguments); err != nil || flags.NArg() != 0 {
		return 2
	}
	if err := pdfrender.ValidateSourceRevision(*sourceRef, *sourceRevision); err != nil {
		fmt.Fprintf(stderr, "publication render-pdf: %v\n", err)
		return 2
	}
	if *check {
		configuration, err := pdfrender.Check(*root)
		if err != nil {
			fmt.Fprintf(stderr, "Validate PDF renderer: %v\n", err)
			return 1
		}
		fmt.Fprintf(
			stdout,
			"PDF renderer validation passed: Buildx %s, BuildKit %s, Node %s, Chrome for Testing %s, %s.\n",
			configuration.Lock.Builder.BuildxVersion,
			configuration.Lock.Builder.BuildKitVersion,
			configuration.Lock.Node.Version,
			configuration.Lock.ChromeForTesting.Version,
			configuration.Lock.Platform,
		)
		return 0
	}
	result, err := pdfrender.Render(context.Background(), pdfrender.Options{
		RepositoryRoot: *root,
		SourceRef:      *sourceRef,
		SourceRevision: *sourceRevision,
		Diagnostics:    stderr,
	})
	if err != nil {
		fmt.Fprintf(stderr, "Render PDF publication: %v\n", err)
		return 1
	}
	fmt.Fprintf(
		stdout,
		"PDF publication rendered twice identically with %s (%s, lock sha256:%s).\n",
		result.ImageID,
		result.Platform,
		result.LockSHA256,
	)
	return 0
}

func githubMetadataHTTPClient() githubapi.HTTPClient {
	return githubapi.NewReadRetryClient(&http.Client{
		Timeout: 20 * time.Second,
		CheckRedirect: func(_ *http.Request, _ []*http.Request) error {
			return errors.New("GitHub metadata API redirect refused")
		},
	})
}

func runGitHubSyncMetadata(arguments []string, stdout, stderr io.Writer) int {
	flags := flag.NewFlagSet("github sync-metadata", flag.ContinueOnError)
	flags.SetOutput(stderr)
	root := flags.String("root", ".", "repository root")
	repository := flags.String("repository", "", "GitHub owner/repository to synchronize")
	check := flags.Bool("check", false, "validate local manifests without network access")
	if err := flags.Parse(arguments); err != nil || flags.NArg() != 0 {
		return 2
	}
	labels, err := githublabels.Load(*root)
	if err != nil {
		fmt.Fprintf(stderr, "Load GitHub label manifest: %v\n", err)
		return 1
	}
	milestones, err := githubmilestones.Load(*root)
	if err != nil {
		fmt.Fprintf(stderr, "Load GitHub milestone manifest: %v\n", err)
		return 1
	}
	issues, err := githubissuemilestones.Load(*root)
	if err != nil {
		fmt.Fprintf(stderr, "Load GitHub issue-assignment manifest: %v\n", err)
		return 1
	}
	if err := githubprmetadata.ValidateAuthorities(githubprmetadata.Authorities{
		Labels: labels, Milestones: milestones, Issues: issues,
	}); err != nil {
		fmt.Fprintf(stderr, "Validate pull-request metadata authorities: %v\n", err)
		return 1
	}
	if _, err := githubissuelifecycle.NewPolicy(labels); err != nil {
		fmt.Fprintf(stderr, "Validate GitHub issue lifecycle policy: %v\n", err)
		return 1
	}
	if *check {
		if *repository != "" {
			fmt.Fprintln(stderr, "github sync-metadata --check does not accept --repository")
			return 2
		}
		fmt.Fprintf(
			stdout,
			"GitHub repository metadata validation passed: %d managed labels, %d managed milestones, and %d managed issue assignments.\n",
			len(labels.Labels),
			len(milestones.Milestones),
			len(issues.Assignments),
		)
		return 0
	}
	client := githubMetadataHTTPClient()
	ctx, cancel := context.WithTimeout(context.Background(), 4*time.Minute)
	defer cancel()
	result, err := syncGitHubMetadata(ctx, client, githubMetadataManifests{
		labels: labels, milestones: milestones, issues: issues,
	}, githubMetadataOptions{
		Repository: *repository, Token: os.Getenv("GH_TOKEN"),
	})
	if err != nil {
		fmt.Fprintf(stderr, "Synchronize GitHub repository metadata: %v\n", err)
		return 1
	}
	fmt.Fprintf(
		stdout,
		"GitHub repository metadata synchronization passed: labels %d created/%d updated/%d unchanged; milestones %d created/%d updated/%d unchanged; issues %d assignments updated/%d unchanged; issue lifecycle %d updated/%d unchanged; pull-request lifecycle %d candidates/%d updated/%d unchanged/%d skipped.\n",
		result.labels.Created,
		result.labels.Updated,
		result.labels.Unchanged,
		result.milestones.Created,
		result.milestones.Updated,
		result.milestones.Unchanged,
		result.issues.Updated,
		result.issues.Unchanged,
		result.lifecycle.Updated,
		result.lifecycle.Unchanged,
		result.pullRequests.Candidates,
		result.pullRequests.Updated,
		result.pullRequests.Unchanged,
		result.pullRequests.Skipped,
	)
	return 0
}

func runGitHubSyncIssueLifecycle(arguments []string, stdout, stderr io.Writer) int {
	flags := flag.NewFlagSet("github sync-issue-lifecycle", flag.ContinueOnError)
	flags.SetOutput(stderr)
	root := flags.String("root", ".", "repository root")
	repository := flags.String("repository", "", "GitHub owner/repository to synchronize")
	issue := flags.Int("issue", 0, "issue number from a closed or reopened event")
	issueAction := flags.String("issue-action", "", "closed or reopened issue event action")
	if err := flags.Parse(arguments); err != nil || flags.NArg() != 0 {
		return 2
	}
	event, err := githubissuelifecycle.NewEvent(*issue, *issueAction)
	if err != nil || event.Issue == 0 || *repository == "" {
		fmt.Fprintln(stderr, "github sync-issue-lifecycle requires --repository, --issue, and --issue-action closed or reopened")
		return 2
	}
	labels, err := githublabels.Load(*root)
	if err != nil {
		fmt.Fprintf(stderr, "Load GitHub label manifest: %v\n", err)
		return 1
	}
	issues, err := githubissuemilestones.Load(*root)
	if err != nil {
		fmt.Fprintf(stderr, "Load GitHub issue-assignment manifest: %v\n", err)
		return 1
	}
	client := githubMetadataHTTPClient()
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()
	result, err := syncGitHubIssueLifecycle(ctx, client, labels, issues, githubMetadataOptions{
		Repository: *repository, Token: os.Getenv("GH_TOKEN"), IssueEvent: event,
	})
	if err != nil {
		fmt.Fprintf(stderr, "Synchronize GitHub issue lifecycle: %v\n", err)
		return 1
	}
	if result.EventSkipped {
		fmt.Fprintf(
			stdout,
			"GitHub issue lifecycle event target skipped because it is not managed; canonical mapped-issue repair completed: %d updated and %d unchanged.\n",
			result.Updated,
			result.Unchanged,
		)
		return 0
	}
	fmt.Fprintf(
		stdout,
		"GitHub issue lifecycle synchronization passed: %d updated and %d unchanged mapped issues.\n",
		result.Updated,
		result.Unchanged,
	)
	return 0
}

func runGitHubSyncPullRequestMetadata(arguments []string, stdout, stderr io.Writer) int {
	flags := flag.NewFlagSet("github sync-pr-metadata", flag.ContinueOnError)
	flags.SetOutput(stderr)
	root := flags.String("root", ".", "repository root")
	repository := flags.String("repository", "", "GitHub owner/repository to synchronize")
	pullRequest := flags.Int("pull-request", 0, "GitHub pull-request number to synchronize")
	eventAction := flags.String("event-action", "", "GitHub pull-request event action")
	merged := flags.String("merged", "", "GitHub pull-request merged flag (true or false)")
	check := flags.Bool("check", false, "validate local authorities without network access")
	if err := flags.Parse(arguments); err != nil || flags.NArg() != 0 {
		return 2
	}
	authorities, err := loadGitHubPullRequestAuthorities(*root)
	if err != nil {
		fmt.Fprintf(stderr, "Load pull-request metadata authorities: %v\n", err)
		return 1
	}
	if *check {
		if *repository != "" || *pullRequest != 0 || *eventAction != "" || *merged != "" {
			fmt.Fprintln(stderr, "github sync-pr-metadata --check does not accept remote or event fields")
			return 2
		}
		fmt.Fprintln(stdout, "GitHub pull-request metadata authority validation passed.")
		return 0
	}
	event, err := githubprmetadata.NewEvent(*eventAction, *merged)
	if *repository == "" || *pullRequest < 1 || err != nil {
		fmt.Fprintln(stderr, "github sync-pr-metadata requires --repository, --pull-request, --event-action, and --merged=true|false")
		if err != nil {
			fmt.Fprintf(stderr, "Invalid pull-request event: %v\n", err)
		}
		return 2
	}
	client := githubMetadataHTTPClient()
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()
	result, err := syncGitHubPullRequestMetadata(ctx, client, authorities, githubprmetadata.Options{
		Repository: *repository, Token: os.Getenv("GH_TOKEN"), PullRequest: *pullRequest, Event: event,
	})
	if err != nil {
		fmt.Fprintf(stderr, "Synchronize GitHub pull-request metadata: %v\n", err)
		return 1
	}
	if result.Skipped {
		fmt.Fprintf(stdout, "GitHub pull-request metadata synchronization skipped: %s.\n", result.Reason)
		return 0
	}
	if event.Action == githubprmetadata.Closed {
		state := "unchanged"
		if result.Updated {
			state = "updated"
		}
		fmt.Fprintf(
			stdout,
			"GitHub pull-request lifecycle synchronization passed: %s for managed issue #%d with milestone %d preserved and %d labels.\n",
			state, result.Issue, result.Milestone, len(result.Labels),
		)
		return 0
	}
	state := "unchanged"
	if result.Updated {
		state = "updated"
	}
	fmt.Fprintf(
		stdout,
		"GitHub pull-request metadata synchronization passed: %s from managed issue #%d with milestone %d and %d labels.\n",
		state, result.Issue, result.Milestone, len(result.Labels),
	)
	return 0
}

func runGitHubSyncLabels(arguments []string, stdout, stderr io.Writer) int {
	flags := flag.NewFlagSet("github sync-labels", flag.ContinueOnError)
	flags.SetOutput(stderr)
	root := flags.String("root", ".", "repository root")
	repository := flags.String("repository", "", "GitHub owner/repository to synchronize")
	check := flags.Bool("check", false, "validate the local manifest without network access")
	if err := flags.Parse(arguments); err != nil || flags.NArg() != 0 {
		return 2
	}
	manifest, err := githublabels.Load(*root)
	if err != nil {
		fmt.Fprintf(stderr, "Load GitHub label manifest: %v\n", err)
		return 1
	}
	if *check {
		if *repository != "" {
			fmt.Fprintln(stderr, "github sync-labels --check does not accept --repository")
			return 2
		}
		fmt.Fprintf(stdout, "GitHub label manifest validation passed: %d managed labels.\n", len(manifest.Labels))
		return 0
	}
	client := githubMetadataHTTPClient()
	ctx, cancel := context.WithTimeout(context.Background(), 4*time.Minute)
	defer cancel()
	result, err := githublabels.Sync(ctx, client, manifest, githublabels.Options{
		Repository: *repository,
		Token:      os.Getenv("GH_TOKEN"),
	})
	if err != nil {
		fmt.Fprintf(stderr, "Synchronize GitHub labels: %v\n", err)
		return 1
	}
	fmt.Fprintf(
		stdout,
		"GitHub label synchronization passed: %d created, %d updated, %d unchanged.\n",
		result.Created,
		result.Updated,
		result.Unchanged,
	)
	return 0
}

func runReleaseInspectImage(arguments []string, stdout, stderr io.Writer) int {
	flags := flag.NewFlagSet("release inspect-image", flag.ContinueOnError)
	flags.SetOutput(stderr)
	image := flags.String("image", "", "lowercase registry image path without a tag")
	tag := flags.String("tag", "", "exact vMAJOR.MINOR.PATCH tag")
	digest := flags.String("digest", "", "immutable sha256 image digest")
	revision := flags.String("revision", "", "lowercase 40-character source commit")
	jsonOutput := flags.Bool("json", false, "write the inspection result as JSON")
	requireExisting := flags.Bool("require-existing", false, "reject a repeatedly confirmed absent exact reference")
	githubPrefix := flags.String("github-output-prefix", "", "write prefixed GitHub step-output records")
	var platforms repeatedString
	var labelValues repeatedString
	flags.Var(&platforms, "platform", "expected operating-system/architecture; repeat for each platform")
	flags.Var(&labelValues, "expected-label", "required image config label as key=value; repeat for each label")
	if err := flags.Parse(arguments); err != nil || flags.NArg() != 0 {
		return 2
	}
	labels, err := expectedLabels(labelValues)
	if err != nil || (*tag == "") == (*digest == "") || (*githubPrefix != "" && !githubOutputPrefixPattern.MatchString(*githubPrefix)) || (*jsonOutput && *githubPrefix != "") {
		fmt.Fprintln(stderr, "release inspect-image received an invalid reference, label, output prefix, or output-mode combination")
		return 2
	}
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()
	inspect := releaseimage.Inspect
	if *requireExisting {
		inspect = releaseimage.InspectExisting
	}
	result, err := inspect(ctx, releaseimage.Options{
		Image:          *image,
		Tag:            *tag,
		Digest:         *digest,
		Revision:       *revision,
		Platforms:      platforms,
		ExpectedLabels: labels,
		Username:       os.Getenv("GHCR_USERNAME"),
		Token:          os.Getenv("GHCR_TOKEN"),
	})
	if err != nil {
		fmt.Fprintf(stderr, "Inspect exact release image: %v\n", err)
		return 1
	}
	if *githubPrefix != "" {
		writeGitHubImageOutputs(stdout, *githubPrefix, result)
		return 0
	}
	if *jsonOutput {
		if err := json.NewEncoder(stdout).Encode(result); err != nil {
			fmt.Fprintf(stderr, "Write release image inspection: %v\n", err)
			return 1
		}
		return 0
	}
	fmt.Fprintf(stdout, "Release image %s is %s", result.Reference, result.Status)
	if result.Digest != "" {
		fmt.Fprintf(stdout, " at %s for %s", result.Digest, strings.Join(result.Platforms, ", "))
	}
	fmt.Fprintln(stdout, ".")
	return 0
}

func runReleaseWriteOCIImages(arguments []string, stdout, stderr io.Writer) int {
	flags := flag.NewFlagSet("release write-oci-images", flag.ContinueOnError)
	flags.SetOutput(stderr)
	output := flags.String("output", "", "new canonical oci-images.json path")
	repository := flags.String("repository", "", "lowercase GitHub owner/repository")
	tag := flags.String("tag", "", "exact vMAJOR.MINOR.PATCH tag")
	revision := flags.String("revision", "", "lowercase 40-character source commit")
	toolingDigest := flags.String("tooling-digest", "", "immutable 20w image digest")
	fixture007Digest := flags.String("fixture-007-digest", "", "immutable Fixture 007 image digest")
	fixture019Digest := flags.String("fixture-019-digest", "", "immutable Fixture 019 image digest")
	if err := flags.Parse(arguments); err != nil || flags.NArg() != 0 || *output == "" {
		return 2
	}
	if err := ocimanifest.Write(*output, ocimanifest.Options{
		Repository:       *repository,
		Tag:              *tag,
		Commit:           *revision,
		ToolingDigest:    *toolingDigest,
		Fixture007Digest: *fixture007Digest,
		Fixture019Digest: *fixture019Digest,
	}); err != nil {
		fmt.Fprintf(stderr, "Write immutable OCI image manifest: %v\n", err)
		return 1
	}
	fmt.Fprintf(stdout, "Wrote immutable OCI image manifest at %s.\n", *output)
	return 0
}

func runReleaseValidateOCIImages(arguments []string, stdout, stderr io.Writer) int {
	flags := flag.NewFlagSet("release validate-oci-images", flag.ContinueOnError)
	flags.SetOutput(stderr)
	input := flags.String("input", "", "canonical oci-images.json path")
	repository := flags.String("repository", "", "lowercase GitHub owner/repository")
	tag := flags.String("tag", "", "exact vMAJOR.MINOR.PATCH tag")
	revision := flags.String("revision", "", "lowercase 40-character source commit")
	githubOutput := flags.Bool("github-output", false, "write stable GitHub step-output records")
	if err := flags.Parse(arguments); err != nil || flags.NArg() != 0 || *input == "" {
		return 2
	}
	manifest, err := ocimanifest.Load(*input, ocimanifest.Release{
		Repository: *repository,
		Tag:        *tag,
		Commit:     *revision,
	})
	if err != nil {
		fmt.Fprintf(stderr, "Validate immutable OCI image manifest: %v\n", err)
		return 1
	}
	tooling, fixture007, fixture019, err := ocimanifest.Digests(manifest, *repository)
	if err != nil {
		fmt.Fprintf(stderr, "Resolve immutable OCI image manifest: %v\n", err)
		return 1
	}
	if *githubOutput {
		fmt.Fprintf(
			stdout,
			"tooling_digest=%s\nfixture007_digest=%s\nfixture019_digest=%s\n",
			tooling,
			fixture007,
			fixture019,
		)
		return 0
	}
	fmt.Fprintln(stdout, "Immutable OCI image manifest validation passed: 3 linux/amd64 identities, NO_RESULT authority.")
	return 0
}

func writeGitHubImageOutputs(writer io.Writer, prefix string, result releaseimage.Result) {
	publish := result.Status == "absent"
	fmt.Fprintf(writer, "%s_status=%s\n%s_publish=%t\n%s_digest=%s\n", prefix, result.Status, prefix, publish, prefix, result.Digest)
}

func expectedLabels(values []string) (map[string]string, error) {
	labels := make(map[string]string, len(values))
	for _, value := range values {
		parts := strings.SplitN(value, "=", 2)
		if len(parts) != 2 || parts[0] == "" || parts[1] == "" {
			return nil, fmt.Errorf("expected label %q must have the form key=value", value)
		}
		if _, exists := labels[parts[0]]; exists {
			return nil, fmt.Errorf("expected label %q is repeated", parts[0])
		}
		labels[parts[0]] = parts[1]
	}
	return labels, nil
}

func runValidateDocs(arguments []string, stdout, stderr io.Writer) int {
	flags := flag.NewFlagSet("validate docs", flag.ContinueOnError)
	flags.SetOutput(stderr)
	root := flags.String("root", ".", "repository root")
	if err := flags.Parse(arguments); err != nil {
		return 2
	}
	if flags.NArg() != 0 {
		fmt.Fprintln(stderr, "validate docs accepts only --root <repository>")
		return 2
	}

	result := docscheck.Validate(*root)
	for _, warning := range result.Warnings {
		fmt.Fprintf(stderr, "Documentation warning: %s\n", warning)
	}
	if len(result.Errors) != 0 {
		fmt.Fprintf(stderr, "Documentation validation failed with %d error(s):\n", len(result.Errors))
		for _, validationError := range result.Errors {
			fmt.Fprintf(stderr, "- %s\n", validationError)
		}
		return 1
	}

	fmt.Fprintf(
		stdout,
		"Documentation validation passed: %d Markdown files, %d chapters, %d Mermaid sources.\n",
		result.MarkdownFiles,
		result.Chapters,
		result.MermaidFiles,
	)
	return 0
}

func runVersion(arguments []string, stdout, stderr io.Writer) int {
	flags := flag.NewFlagSet("version", flag.ContinueOnError)
	flags.SetOutput(stderr)
	jsonOutput := flags.Bool("json", false, "write build identity as JSON")
	if err := flags.Parse(arguments); err != nil || flags.NArg() != 0 {
		return 2
	}
	info := buildinfo.Current()
	if *jsonOutput {
		if err := json.NewEncoder(stdout).Encode(info); err != nil {
			fmt.Fprintf(stderr, "Write build identity: %v\n", err)
			return 1
		}
		return 0
	}
	fmt.Fprintf(stdout, "20w %s (%s, %s/%s, %s)\n", info.Version, info.Revision, info.OperatingSys, info.Architecture, info.GoVersion)
	return 0
}

func main() {
	os.Exit(run(os.Args[1:], os.Stdout, os.Stderr))
}
