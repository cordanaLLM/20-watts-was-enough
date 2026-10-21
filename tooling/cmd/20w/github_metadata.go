package main

import (
	"context"
	"fmt"

	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/githubissuelifecycle"
	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/githubissuemilestones"
	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/githublabels"
	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/githubmilestones"
	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/githubprmetadata"
)

type githubMetadataManifests struct {
	labels     githublabels.Manifest
	milestones githubmilestones.Manifest
	issues     githubissuemilestones.Manifest
}

type githubMetadataOptions struct {
	APIBase    string
	Repository string
	Token      string
	IssueEvent githubissuelifecycle.Event
}

type githubMetadataResult struct {
	labels       githublabels.Result
	milestones   githubmilestones.Result
	issues       githubissuemilestones.Result
	lifecycle    githubissuelifecycle.Result
	pullRequests githubprmetadata.RepairResult
}

type githubMetadataClient interface {
	githublabels.HTTPClient
	githubmilestones.HTTPClient
	githubissuemilestones.HTTPClient
}

type githubMetadataPlans struct {
	labelPlan              githublabels.Plan
	milestonePlan          githubmilestones.Plan
	issuePlan              githubissuemilestones.Plan
	lifecyclePlan          githubissuelifecycle.Plan
	pullRequestPlan        githubprmetadata.RepairPlan
	pullRequestAuthorities githubprmetadata.Authorities
	labelOptions           githublabels.Options
	milestoneOptions       githubmilestones.Options
	issueOptions           githubissuemilestones.Options
	lifecycleOptions       githubissuelifecycle.Options
	pullRequestOptions     githubprmetadata.RepairOptions
}

func newGitHubMetadataSubsystemOptions(options githubMetadataOptions) (
	githublabels.Options,
	githubmilestones.Options,
	githubissuemilestones.Options,
	githubissuelifecycle.Options,
	githubprmetadata.RepairOptions,
) {
	return githublabels.Options{APIBase: options.APIBase, Repository: options.Repository, Token: options.Token},
		githubmilestones.Options{APIBase: options.APIBase, Repository: options.Repository, Token: options.Token},
		githubissuemilestones.Options{APIBase: options.APIBase, Repository: options.Repository, Token: options.Token},
		githubissuelifecycle.Options{APIBase: options.APIBase, Repository: options.Repository, Token: options.Token},
		githubprmetadata.RepairOptions{APIBase: options.APIBase, Repository: options.Repository, Token: options.Token}
}

func preflightGitHubMetadata(
	ctx context.Context,
	client githubMetadataClient,
	manifests githubMetadataManifests,
	options githubMetadataOptions,
) (githubMetadataPlans, error) {
	labelOptions, milestoneOptions, issueOptions, lifecycleOptions, pullRequestOptions := newGitHubMetadataSubsystemOptions(options)

	labelPlan, err := githublabels.Preflight(ctx, client, manifests.labels, labelOptions)
	if err != nil {
		return githubMetadataPlans{}, fmt.Errorf("preflight GitHub labels: %w", err)
	}
	milestonePlan, err := githubmilestones.Preflight(ctx, client, manifests.milestones, milestoneOptions)
	if err != nil {
		return githubMetadataPlans{}, fmt.Errorf("preflight GitHub milestones: %w", err)
	}
	issuePlan, err := githubissuemilestones.Preflight(
		ctx, client, manifests.issues, issueOptions, milestonePlan,
	)
	if err != nil {
		return githubMetadataPlans{}, fmt.Errorf("preflight GitHub issue assignments: %w", err)
	}
	lifecyclePolicy, err := githubissuelifecycle.NewPolicy(manifests.labels)
	if err != nil {
		return githubMetadataPlans{}, fmt.Errorf("preflight GitHub issue lifecycle policy: %w", err)
	}
	lifecyclePlan, err := githubissuelifecycle.Preflight(
		ctx, client, manifests.issues, lifecyclePolicy, lifecycleOptions, options.IssueEvent,
	)
	if err != nil {
		return githubMetadataPlans{}, fmt.Errorf("preflight GitHub issue lifecycle: %w", err)
	}
	pullRequestAuthorities := githubprmetadata.Authorities{
		Labels: manifests.labels, Milestones: manifests.milestones, Issues: manifests.issues,
	}
	pullRequestPlan, err := githubprmetadata.PreflightRepair(
		ctx, client, pullRequestAuthorities, pullRequestOptions,
	)
	if err != nil {
		return githubMetadataPlans{}, fmt.Errorf("preflight GitHub pull-request lifecycle repair: %w", err)
	}
	return githubMetadataPlans{
		labelPlan:              labelPlan,
		milestonePlan:          milestonePlan,
		issuePlan:              issuePlan,
		lifecyclePlan:          lifecyclePlan,
		pullRequestPlan:        pullRequestPlan,
		pullRequestAuthorities: pullRequestAuthorities,
		labelOptions:           labelOptions,
		milestoneOptions:       milestoneOptions,
		issueOptions:           issueOptions,
		lifecycleOptions:       lifecycleOptions,
		pullRequestOptions:     pullRequestOptions,
	}, nil
}

func applyGitHubMetadata(
	ctx context.Context,
	client githubMetadataClient,
	plans githubMetadataPlans,
) (githubMetadataResult, error) {
	result := githubMetadataResult{}
	var err error
	result.labels, err = plans.labelPlan.Apply(ctx, client, plans.labelOptions)
	if err != nil {
		return githubMetadataResult{}, fmt.Errorf("apply GitHub labels: %w", err)
	}
	result.milestones, err = plans.milestonePlan.Apply(ctx, client, plans.milestoneOptions)
	if err != nil {
		return githubMetadataResult{}, fmt.Errorf("apply GitHub milestones: %w", err)
	}
	result.lifecycle, err = plans.lifecyclePlan.Apply(ctx, client, plans.lifecycleOptions)
	if err != nil {
		return githubMetadataResult{}, fmt.Errorf("apply GitHub issue lifecycle: %w", err)
	}
	if err := plans.lifecyclePlan.Verify(ctx, client, plans.lifecycleOptions); err != nil {
		return githubMetadataResult{}, fmt.Errorf("read back GitHub issue lifecycle: %w", err)
	}
	milestoneInventory, err := plans.milestonePlan.Verify(ctx, client, plans.milestoneOptions)
	if err != nil {
		return githubMetadataResult{}, fmt.Errorf("read back GitHub milestones before issue assignment: %w", err)
	}
	result.issues, err = plans.issuePlan.Apply(ctx, client, plans.issueOptions, milestoneInventory)
	if err != nil {
		return githubMetadataResult{}, fmt.Errorf("apply GitHub issue assignments: %w", err)
	}
	result.pullRequests, err = plans.pullRequestPlan.Apply(
		ctx, client, plans.pullRequestAuthorities, milestoneInventory, plans.pullRequestOptions,
	)
	if err != nil {
		return githubMetadataResult{}, fmt.Errorf("apply GitHub pull-request lifecycle repair: %w", err)
	}
	return result, nil
}

func verifyGitHubMetadata(
	ctx context.Context,
	client githubMetadataClient,
	plans githubMetadataPlans,
) error {
	if err := plans.labelPlan.Verify(ctx, client, plans.labelOptions); err != nil {
		return fmt.Errorf("read back GitHub labels: %w", err)
	}
	finalMilestones, err := plans.milestonePlan.Verify(ctx, client, plans.milestoneOptions)
	if err != nil {
		return fmt.Errorf("read back GitHub milestones: %w", err)
	}
	if err := plans.issuePlan.Verify(ctx, client, plans.issueOptions, finalMilestones); err != nil {
		return fmt.Errorf("read back GitHub issue assignments: %w", err)
	}
	if err := plans.lifecyclePlan.VerifyLabels(ctx, client, plans.lifecycleOptions); err != nil {
		return fmt.Errorf("read back GitHub issue lifecycle after issue assignment: %w", err)
	}
	return nil
}

// syncGitHubMetadata completes every local and remote read-only preflight
// before the first mutation. Successful phases are safe to retain after a
// later transport failure; a fresh preflight makes the retry idempotent.
func syncGitHubMetadata(
	ctx context.Context,
	client githubMetadataClient,
	manifests githubMetadataManifests,
	options githubMetadataOptions,
) (githubMetadataResult, error) {
	plans, err := preflightGitHubMetadata(ctx, client, manifests, options)
	if err != nil {
		return githubMetadataResult{}, err
	}
	result, err := applyGitHubMetadata(ctx, client, plans)
	if err != nil {
		return githubMetadataResult{}, err
	}
	if err := verifyGitHubMetadata(ctx, client, plans); err != nil {
		return githubMetadataResult{}, err
	}
	return result, nil
}
