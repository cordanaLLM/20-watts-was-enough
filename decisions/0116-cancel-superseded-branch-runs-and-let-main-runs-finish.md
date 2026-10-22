# 0116 — Cancel superseded branch runs and let main runs finish

- **Status:** accepted
- **Date:** 2026-10-22
- **Related:** [0095](0095-pin-the-praetor-engine-and-refresh-the-adoption.md),
  [0106](0106-fan-out-full-ci-to-impact-lanes.md)

## Context

The cordanaLLM organisation runs at most 20 hosted jobs at once. On
2026-10-22 at 12:05 the repository held 29 unfinished jobs over four open
branches and `main`; 5 of them belonged to heads that had already been
replaced.

`ci.yml`, `codeql.yml` and `scorecard.yml` grouped runs by
`${{ github.workflow }}-${{ github.ref }}` with `cancel-in-progress: true`.
That cancels a superseded branch run, but it also cancels a running `main`
run when the next commit lands, which leaves the earlier commit without a
complete rollup.

A cancelled CI run does not release its group at once. `ci-success` runs
with `if: always()`, so it still waits for a runner, and the newer run of
the same branch stays `pending` behind it. Runs 39756245404 (#343) and
39755488448 (#350) waited that way until the superseded runs 39735621577
and 39735898040 were force-cancelled; both then moved to `queued`.

`ci-success` keeps `if: always()`. A job skipped by a condition reports
success to a required check (GitHub, "Troubleshooting required status
checks"), so `if: ${{ !cancelled() }}` would let a cancelled head pass the
`CI success` requirement.

## Decision

1. `ci.yml`, `codeql.yml` and `scorecard.yml` group runs by
   `${{ github.workflow }}-${{ github.ref == 'refs/heads/main' && github.sha || github.ref }}`
   with `cancel-in-progress: true`. A branch push cancels the branch's
   earlier run; every `main` commit has its own group and its run finishes.
2. `npm run validate:policy` requires that group and `cancel-in-progress: true`
   for those three paths and for every other workflow with a `pull_request`
   trigger, matched by exact path. Workflows triggered only by
   `pull_request_target` (`labeler.yml`, `pr-title.yml`) keep their pinned
   shapes; the labeler's non-cancelling queue serialises lifecycle events on
   purpose. The two engine-managed workflows of decision 0095 keep their
   carve-out.
3. Superseded runs whose `ci-success` job still waits are force-cancelled by
   hand (`POST /actions/runs/{id}/force-cancel`), never on `main`.

## Consequences

- Overlapping `main` commits run side by side instead of cancelling each
  other, so `main` uses more jobs when commits land in quick succession.
- `praetor-api.yml` and `praetor-docs.yml` still have no concurrency block,
  so their superseded runs keep their place in the queue until the pinned
  engine renders one.
- The only workflow matrix, `workstation-artifacts`, stays at
  `max-parallel: 8` (decision 0065).
