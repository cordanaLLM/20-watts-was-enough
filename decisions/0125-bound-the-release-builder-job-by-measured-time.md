# 0125 — Bound the release builder job by measured time

- **Status:** accepted
- **Date:** 2026-11-06
- **Decided by:** coordination order `20-watts-was-enough-job-timeouts-20261106`
  (paraphrased: every CI job carries a timeout bound of measured p95 job time
  times two, rounded up; engine audit fails from 2026-11-20).
- **Authority:** `release-build.yml` job bound and its validator only.
- **Supersedes in part:** [0101](0101-build-releases-in-a-reusable-workflow.md)
  item 2, the 225-minute bound.

## Context

The engine static job-timeout audit (`praetor`
`internal/forge/job_timeout_audit.go`) flags
`.github/workflows/release-build.yml` job `release` because its
`timeout-minutes: 225`, set by Decision 0101, exceeds the 120-minute static
ceiling.

## Decision

Bound the `release` job in `.github/workflows/release-build.yml` to 115
minutes, derived as twice the measured 95th-percentile (p95) runtime rounded
up.

Measured successful release runs on the forge (job time in minutes):

- 56.2 (run 38901236748, single-job layout).
- Older split layout sums: 47.8, 51.2, 54.3, 56.5.

With p95 approximately 56.5 minutes, 2 × p95 = 113 minutes, rounding up to a
bound of 115 minutes. The policy validator in
`scripts/validate-engineering-policy.mjs` enforces this exact bound.

## Consequences

- A release run that exceeds 115 minutes is cancelled and rerun.
- The bound is re-measured when the job layout changes.
