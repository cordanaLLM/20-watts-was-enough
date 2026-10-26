# 0122 — Run pull-request metadata and title checks on `pull_request`

- **Status:** accepted
- **Date:** 2026-10-26
- **Decided by:** fleet order to remove every `pull_request_target` trigger
  before 2026-11-25, and the operator's choice for the labeler: run it on
  `pull_request`, skip its writes for fork pull requests and name the metadata
  to set by hand (paraphrased).
- **Amends:** [0057](0057-project-pull-request-metadata-from-managed-issues.md)
  (trigger and fork handling),
  [0116](0116-cancel-superseded-branch-runs-and-let-main-runs-finish.md)
  (decision item 2, the `pull_request_target` workflows)

## Context

`labeler.yml` and `pr-title.yml` were the last workflows triggered by
`pull_request_target`. That trigger runs with the base repository's token on
untrusted pull requests; the fleet now removes it everywhere.

`pr-title.yml` needs no token and changes nothing. `labeler.yml` writes path
labels, issue-derived labels and the milestone through
`20w github sync-pr-metadata`, which needs `issues: write` and
`pull-requests: write`. On `pull_request`, GitHub gives a fork pull request a
read-only token, so those writes would fail there.

## Decision

1. `pr-title.yml` triggers on `pull_request` (branch `main`, types `opened`,
   `edited`, `synchronize`, `reopened`) and uses the superseded-run group of
   decision 0116 with `cancel-in-progress: true`. The `pull_request` ref is
   `refs/pull/<n>/merge`, so cancellation stays per pull request.
2. `labeler.yml` triggers on `pull_request` with the same five lifecycle types
   and the same job permissions as before. Every write step and its setup run
   only when `github.event.pull_request.head.repo.full_name ==
   github.repository`. For a fork pull request, one step instead emits a
   `::notice::` that names the path labels of `.github/labeler.yml` and the
   milestone of `.github/issue-milestones.json` as metadata a maintainer sets
   by hand.
3. The labeler keeps its non-cancelling, queued concurrency. Lifecycle events
   must apply in order, and a cancelled run drops a label or milestone write.
   `serialisedPullRequestWorkflowPaths` in
   `scripts/validate-engineering-policy.mjs` names it as the one exception to
   the superseded-run rule; `validatePullRequestMetadataWorkflowObject` still
   pins its queue shape.
4. `npm run validate:policy` reads the `pull_request` trigger for both
   workflows and refuses a `pull_request_target` trigger, a missing same-repository
   guard and a missing fork notice
   (`scripts/engineering-policy.test.mjs`).
5. The pinned Praetor engine requires the context of every job that reports
   on each `pull_request` run. `.github/rulesets/main.json` therefore adds
   `Apply pull-request metadata` and `PR title`; the live `main` ruleset
   already required `PR title` and gains `Apply pull-request metadata` through
   the rulesets API after this change lands, with a read-back of nine
   contexts. A labeler failure that blocks merging is fixed in the labeler;
   the context is not dropped.

## Consequences

- Pull requests from branches of this repository keep automatic labels and
  milestones. Fork pull requests get the notice and need a maintainer to set
  that metadata.
- The workflow still checks out only `refs/heads/main` and never executes
  pull-request code.
