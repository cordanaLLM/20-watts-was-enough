# 0126 — Bound Pages deploy jobs by the action timeout

- **Status:** accepted
- **Date:** 2026-11-06
- **Decided by:** coordination order `20-watts-was-enough-job-timeouts-20261106`
  (paraphrased: a job that cannot take the measured bound carries a stated
  exception).
- **Authority:** `timeout-minutes` of jobs that run `actions/deploy-pages` and
  their validator check.
- **Supersedes in part:** [0125](0125-bound-ci-jobs-by-measured-time.md), the
  `deploy` and `restore-verified-site` rows.

## Context

[Decision 0125](0125-bound-ci-jobs-by-measured-time.md) set the `deploy` job in
`.github/workflows/github-pages.yml` to 5 minutes from
`max(5, ceil(2 × p95))` with p95 = 0.83 minutes.

Run 42237691867 on `main` then failed. Step "Deploy GitHub Pages" polled
`deployment_queued` from 14:54:35 to 14:59:33. The runner ended the job at
5m0s ("The job has exceeded the maximum execution time of 5m0s") and the
action cancelled the deployment.

The pinned `actions/deploy-pages`
(`368f82528645a54fb793d4d04e342629a3f51346`) has an input `timeout`, default
`600000` ms: "Time in milliseconds after which to timeout and cancel the
deployment (default: 10 minutes)" (its `action.yml`). A job bound below that
value kills the job while the action still waits on the Pages queue.

The `deploy` duration is set by the external Pages queue and has a heavy tail.
Of the last 40 runs most took 0.15 to 0.8 minutes; the tail holds 1.23, 1.62
and 4.35 minutes (run 42226522341) and one cancelled run at 5.07 minutes. A
p95 formula does not fit that distribution.

Job `restore-verified-site` also runs `actions/deploy-pages` and carried
10 minutes, equal to the action timeout with no margin.

## Decision

A job that runs `actions/deploy-pages` gets
`timeout-minutes >= ceil(timeout input / 60000) + 1`. With the default input
of 600000 ms that is 11 minutes. The extra minute covers runner setup and the
`actions/configure-pages` step.

Both `deploy` and `restore-verified-site` in `.github/workflows/github-pages.yml`
carry 11 minutes. The bound is an exception to the measured formula of
Decision 0125, stated here as the order's exception clause requires.

## Consequences

- `validateWorkflowJob` in `scripts/validate-engineering-policy.mjs` reports a
  finding when a job's `timeout-minutes` is below the `deploy-pages` timeout
  input plus 1 minute; `scripts/engineering-policy.test.mjs` covers the
  positive, negative and boundary cases.
- The engine measured window requires 1.25 × the slowest of the last 3 runs
  (4.35 minutes gives 5.4) ≤ timeout-minutes ≤ max(30, 4 × slowest run); 11
  minutes satisfies 5.4 ≤ 11 ≤ 30.
- A deployment the Pages queue delays past the action timeout is still
  cancelled, now by the action itself, and the run fails; nothing reruns it
  automatically.
- The check also fails a non-numeric `timeout` input rather than skipping it.
