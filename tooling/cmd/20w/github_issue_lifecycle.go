package main

import (
	"context"
	"fmt"

	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/githubissuelifecycle"
	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/githubissuemilestones"
	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/githublabels"
)

// syncGitHubIssueLifecycle verifies the complete managed-label inventory before
// changing issue statuses. It never repairs label definitions, milestones or
// assignments as a side effect of an issue transition.
func syncGitHubIssueLifecycle(
	ctx context.Context,
	client interface {
		githublabels.HTTPClient
		githubissuelifecycle.HTTPClient
	},
	labels githublabels.Manifest,
	issues githubissuemilestones.Manifest,
	options githubMetadataOptions,
) (githubissuelifecycle.Result, error) {
	labelOptions := githublabels.Options{
		APIBase: options.APIBase, Repository: options.Repository, Token: options.Token,
	}
	lifecycleOptions := githubissuelifecycle.Options{
		APIBase: options.APIBase, Repository: options.Repository, Token: options.Token,
	}
	labelPlan, err := githublabels.Preflight(ctx, client, labels, labelOptions)
	if err != nil {
		return githubissuelifecycle.Result{}, fmt.Errorf("preflight managed labels: %w", err)
	}
	if err := labelPlan.Verify(ctx, client, labelOptions); err != nil {
		return githubissuelifecycle.Result{}, fmt.Errorf("verify managed labels before issue lifecycle repair: %w", err)
	}
	policy, err := githubissuelifecycle.NewPolicy(labels)
	if err != nil {
		return githubissuelifecycle.Result{}, fmt.Errorf("validate issue lifecycle policy: %w", err)
	}
	plan, err := githubissuelifecycle.Preflight(
		ctx, client, issues, policy, lifecycleOptions, options.IssueEvent,
	)
	if err != nil {
		return githubissuelifecycle.Result{}, fmt.Errorf("preflight issue lifecycle: %w", err)
	}
	result, err := plan.Apply(ctx, client, lifecycleOptions)
	if err != nil {
		return githubissuelifecycle.Result{}, fmt.Errorf("apply issue lifecycle: %w", err)
	}
	if err := plan.Verify(ctx, client, lifecycleOptions); err != nil {
		return githubissuelifecycle.Result{}, fmt.Errorf("read back issue lifecycle: %w", err)
	}
	if err := labelPlan.Verify(ctx, client, labelOptions); err != nil {
		return githubissuelifecycle.Result{}, fmt.Errorf("read back managed labels: %w", err)
	}
	return result, nil
}
