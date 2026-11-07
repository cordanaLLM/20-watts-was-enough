# 0125 — Bound CI jobs by measured time

- **Status:** accepted
- **Date:** 2026-11-06
- **Decided by:** coordination order `20-watts-was-enough-job-timeouts-20261106`
  (paraphrased: every CI job carries a timeout bound of measured p95 job time
  times two, rounded up; engine audit fails from 2026-11-20), refined by
  `20-watts-was-enough-job-timeouts-floor-20261106` (paraphrased: the bound is
  the larger of 5 minutes and that value, inside the engine's measured window).
- **Authority:** CI job timeout-minutes and their validator pins.
- **Supersedes in part:** [0101](0101-build-releases-in-a-reusable-workflow.md)
  item 2, the 225-minute bound.

## Context

The engine job-timeout audit enforces a 120-minute static ceiling and a
measured window requiring timeout-minutes to be at least 1.25 × the slowest of
the last 3 runs and at most max(30, 4 × the slowest run). Four jobs exceed the
measured window:

- `pdf-renderer-reproducibility` carried 75 minutes.
- `container-smoke` carried 35 minutes.
- GitHub Pages `build` carried 45 minutes.
- `api-compatibility` in `praetor-api.yml` carried 60 minutes.

The `release` job in `.github/workflows/release-build.yml` carried 225 minutes,
which exceeds the 120-minute static ceiling.

## Decision

Bound every CI job by `max(5, ceil(2 × p95))`, where p95 is the
95th-percentile runtime in minutes from successful forge runs. The floor of 5
minutes absorbs hosted runner setup and checkout jitter.

The `release` job runtime is measured from single-job run 38901236748 (56.2
minutes) and older split-layout run sums (47.8, 51.2, 54.3, 56.5 minutes),
giving p95 ≈ 56.5 minutes and 2 × p95 = 113 minutes.

Job `restore-verified-site` keeps 10 minutes as unmeasured because no
successful execution has occurred on its failure-triggered recovery path.

Workflow `praetor-api.yml` is an engine-rendered asset (`praetor`
`tools/apicompat/assets.go`). Job `api-compatibility` remains at 60 minutes
under a category C dated exception in `.standards.yaml` until the engine
renders the measured bound.
Workflow `praetor-docs.yml` is engine-rendered as well; its job keeps
10 minutes, inside the measured window, because the engine sizes its
documentation lint budget against that hosted job (`praetor`
`internal/config/documentation.go`).

| Workflow | Job | Current | Target | Measured p95 | Sample n |
| --- | --- | --- | --- | --- | --- |
| `ci.yml` | `impact-plan` | 10 | 5 | 0.4 min | 20 |
| `ci.yml` | `quality-full` | 30 | 5 | 1.6 min | 11 |
| `ci.yml` | `impact-common` | 30 | 6 | 2.9 min | 20 |
| `ci.yml` | `lane-go` | 20 | 13 | 6.3 min | 36 |
| `ci.yml` | `lane-go-windows` | 20 | 10 | 4.6 min | 12 |
| `ci.yml` | `lane-go-macos` | 20 | 7 | 3.1 min | 12 |
| `ci.yml` | `lane-release` | 30 | 5 | 1.3 min | 12 |
| `ci.yml` | `pdf-renderer-reproducibility` | 75 | 13 | 6.2 min | 11 |
| `ci.yml` | `lane-research` | 30 | 14 | 6.8 min | 17 |
| `ci.yml` | `lane-site` | 30 | 12 | 5.8 min | 17 |
| `ci.yml` | `lane-site-browser` | 30 | 9 | 4.0 min | 17 |
| `ci.yml` | `workstation-core` | 20 | 5 | 0.5 min | 13 |
| `ci.yml` | `workstation-artifacts` | 30 | 10 | 4.9 min | 134 |
| `ci.yml` | `container-smoke` | 35 | 8 | 3.6 min | 14 |
| `ci.yml` | `dependency-review` | 10 | 5 | 0.1 min | 10 |
| `ci.yml` | `secret-scan` | 15 | 5 | 1.0 min | 20 |
| `ci.yml` | `ci-success` | 5 | 5 | 0.1 min | 20 |
| `codeql.yml` | `analyze` | 30 | 5 | 2.0 min | 20 |
| `codeql.yml` | `analyze-go` | 30 | 5 | 1.6 min | 20 |
| `github-pages.yml` | `build` | 45 | 7 | 3.5 min | 20 |
| `github-pages.yml` | `deploy` | 10 | 5 | 0.8 min | 20 |
| `github-pages.yml` | `verify-public-transport` | 5 | 5 | 0.5 min | 20 |
| `github-pages.yml` | `restore-verified-site` | 10 | 10 | unmeasured | 0 |
| `labeler.yml` | `label` | 10 | 5 | 0.6 min | 20 |
| `pr-title.yml` | `pr-title` | 5 | 5 | 0.1 min | 20 |
| `praetor-api.yml` | `api-compatibility` | 60 | 60 | 0.7 min | 20 |
| `praetor-docs.yml` | `documentation` | 10 | 10 | 0.7 min | 20 |
| `release-build.yml` | `release` | 225 | 113 | 56.5 min | 5 |
| `scorecard.yml` | `analysis` | 20 | 5 | 0.9 min | 20 |
| `sync-repository-metadata.yml` | `sync` | 5 | 5 | 1.6 min | 20 |

## Consequences

- A run past its bound is cancelled and rerun.
- Bounds are re-measured when a job layout changes.
- The first 20 runs after landing are checked for timeout cancellations.
