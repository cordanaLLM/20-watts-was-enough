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

// syncGitHubMetadata completes every local and remote read-only preflight
// before the first mutation. Successful phases are safe to retain after a
// later transport failure; a fresh preflight makes the retry idempotent.
func syncGitHubMetadata(
	ctx context.Context,
	client interface {
		githublabels.HTTPClient
		githubmilestones.HTTPClient
		githubissuemilestones.HTTPClient
	},
	manifests githubMetadataManifests,
	options githubMetadataOptions,
) (githubMetadataResult, error) {
	labelOptions := githublabels.Options{
		APIBase: options.APIBase, Repository: options.Repository, Token: options.Token,
	}
	milestoneOptions := githubmilestones.Options{
		APIBase: options.APIBase, Repository: options.Repository, Token: options.Token,
	}
	issueOptions := githubissuemilestones.Options{
		APIBase: options.APIBase, Repository: options.Repository, Token: options.Token,
	}
	lifecycleOptions := githubissuelifecycle.Options{
		APIBase: options.APIBase, Repository: options.Repository, Token: options.Token,
	}

	labelPlan, err := githublabels.Preflight(ctx, client, manifests.labels, labelOptions)
	if err != nil {
		return githubMetadataResult{}, fmt.Errorf("preflight GitHub labels: %w", err)
	}
	milestonePlan, err := githubmilestones.Preflight(ctx, client, manifests.milestones, milestoneOptions)
	if err != nil {
		return githubMetadataResult{}, fmt.Errorf("preflight GitHub milestones: %w", err)
	}
	issuePlan, err := githubissuemilestones.Preflight(
		ctx, client, manifests.issues, issueOptions, milestonePlan,
	)
	if err != nil {
		return githubMetadataResult{}, fmt.Errorf("preflight GitHub issue assignments: %w", err)
	}
	lifecyclePolicy, err := githubissuelifecycle.NewPolicy(manifests.labels)
	if err != nil {
		return githubMetadataResult{}, fmt.Errorf("preflight GitHub issue lifecycle policy: %w", err)
	}
	lifecyclePlan, err := githubissuelifecycle.Preflight(
		ctx, client, manifests.issues, lifecyclePolicy, lifecycleOptions, options.IssueEvent,
	)
	if err != nil {
		return githubMetadataResult{}, fmt.Errorf("preflight GitHub issue lifecycle: %w", err)
	}
	pullRequestAuthorities := githubprmetadata.Authorities{
		Labels: manifests.labels, Milestones: manifests.milestones, Issues: manifests.issues,
	}
	pullRequestOptions := githubprmetadata.RepairOptions{
		APIBase: options.APIBase, Repository: options.Repository, Token: options.Token,
	}
	pullRequestPlan, err := githubprmetadata.PreflightRepair(
		ctx, client, pullRequestAuthorities, pullRequestOptions,
	)
	if err != nil {
		return githubMetadataResult{}, fmt.Errorf("preflight GitHub pull-request lifecycle repair: %w", err)
	}

	result := githubMetadataResult{}
	result.labels, err = labelPlan.Apply(ctx, client, labelOptions)
	if err != nil {
		return githubMetadataResult{}, fmt.Errorf("apply GitHub labels: %w", err)
	}
	result.milestones, err = milestonePlan.Apply(ctx, client, milestoneOptions)
	if err != nil {
		return githubMetadataResult{}, fmt.Errorf("apply GitHub milestones: %w", err)
	}
	result.lifecycle, err = lifecyclePlan.Apply(ctx, client, lifecycleOptions)
	if err != nil {
		return githubMetadataResult{}, fmt.Errorf("apply GitHub issue lifecycle: %w", err)
	}
	if err := lifecyclePlan.Verify(ctx, client, lifecycleOptions); err != nil {
		return githubMetadataResult{}, fmt.Errorf("read back GitHub issue lifecycle: %w", err)
	}
	milestoneInventory, err := milestonePlan.Verify(ctx, client, milestoneOptions)
	if err != nil {
		return githubMetadataResult{}, fmt.Errorf("read back GitHub milestones before issue assignment: %w", err)
	}
	result.issues, err = issuePlan.Apply(ctx, client, issueOptions, milestoneInventory)
	if err != nil {
		return githubMetadataResult{}, fmt.Errorf("apply GitHub issue assignments: %w", err)
	}
	result.pullRequests, err = pullRequestPlan.Apply(
		ctx, client, pullRequestAuthorities, milestoneInventory, pullRequestOptions,
	)
	if err != nil {
		return githubMetadataResult{}, fmt.Errorf("apply GitHub pull-request lifecycle repair: %w", err)
	}
	if err := labelPlan.Verify(ctx, client, labelOptions); err != nil {
		return githubMetadataResult{}, fmt.Errorf("read back GitHub labels: %w", err)
	}
	finalMilestones, err := milestonePlan.Verify(ctx, client, milestoneOptions)
	if err != nil {
		return githubMetadataResult{}, fmt.Errorf("read back GitHub milestones: %w", err)
	}
	if err := issuePlan.Verify(ctx, client, issueOptions, finalMilestones); err != nil {
		return githubMetadataResult{}, fmt.Errorf("read back GitHub issue assignments: %w", err)
	}
	if err := lifecyclePlan.VerifyLabels(ctx, client, lifecycleOptions); err != nil {
		return githubMetadataResult{}, fmt.Errorf("read back GitHub issue lifecycle after issue assignment: %w", err)
	}
	return result, nil
}
