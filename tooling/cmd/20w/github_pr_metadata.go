package main

import (
	"context"
	"fmt"

	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/githubissuemilestones"
	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/githublabels"
	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/githubmilestones"
	"github.com/cordanaLLM/20-watts-was-enough/tooling/internal/githubprmetadata"
)

func loadGitHubPullRequestAuthorities(root string) (githubprmetadata.Authorities, error) {
	labels, err := githublabels.Load(root)
	if err != nil {
		return githubprmetadata.Authorities{}, fmt.Errorf("load labels: %w", err)
	}
	milestones, err := githubmilestones.Load(root)
	if err != nil {
		return githubprmetadata.Authorities{}, fmt.Errorf("load milestones: %w", err)
	}
	issues, err := githubissuemilestones.Load(root)
	if err != nil {
		return githubprmetadata.Authorities{}, fmt.Errorf("load issue assignments: %w", err)
	}
	authorities := githubprmetadata.Authorities{
		Labels: labels, Milestones: milestones, Issues: issues,
	}
	if err := githubprmetadata.ValidateAuthorities(authorities); err != nil {
		return githubprmetadata.Authorities{}, err
	}
	return authorities, nil
}

func syncGitHubPullRequestMetadata(
	ctx context.Context,
	client interface {
		githublabels.HTTPClient
		githubmilestones.HTTPClient
		githubprmetadata.HTTPClient
	},
	authorities githubprmetadata.Authorities,
	options githubprmetadata.Options,
) (githubprmetadata.Result, error) {
	labelOptions := githublabels.Options{
		APIBase: options.APIBase, Repository: options.Repository, Token: options.Token,
	}
	milestoneOptions := githubmilestones.Options{
		APIBase: options.APIBase, Repository: options.Repository, Token: options.Token,
	}
	labelPlan, err := githublabels.Preflight(ctx, client, authorities.Labels, labelOptions)
	if err != nil {
		return githubprmetadata.Result{}, fmt.Errorf("preflight managed labels: %w", err)
	}
	if err := labelPlan.Verify(ctx, client, labelOptions); err != nil {
		return githubprmetadata.Result{}, fmt.Errorf("verify managed labels: %w", err)
	}
	if options.Event.Action == githubprmetadata.Closed {
		result, syncErr := githubprmetadata.Sync(ctx, client, authorities, nil, options)
		if syncErr != nil {
			return githubprmetadata.Result{}, syncErr
		}
		if err := labelPlan.Verify(ctx, client, labelOptions); err != nil {
			return githubprmetadata.Result{}, fmt.Errorf("read back managed labels: %w", err)
		}
		return result, nil
	}
	milestonePlan, err := githubmilestones.Preflight(ctx, client, authorities.Milestones, milestoneOptions)
	if err != nil {
		return githubprmetadata.Result{}, fmt.Errorf("preflight managed milestones: %w", err)
	}
	milestoneInventory, err := milestonePlan.Verify(ctx, client, milestoneOptions)
	if err != nil {
		return githubprmetadata.Result{}, fmt.Errorf("verify managed milestones: %w", err)
	}
	result, err := githubprmetadata.Sync(ctx, client, authorities, milestoneInventory, options)
	if err != nil {
		return githubprmetadata.Result{}, err
	}
	if err := labelPlan.Verify(ctx, client, labelOptions); err != nil {
		return githubprmetadata.Result{}, fmt.Errorf("read back managed labels: %w", err)
	}
	if _, err := milestonePlan.Verify(ctx, client, milestoneOptions); err != nil {
		return githubprmetadata.Result{}, fmt.Errorf("read back managed milestones: %w", err)
	}
	return result, nil
}
