# 0106 — Fan out full CI to impact lanes

- **Status:** accepted
- **Date:** 2026-10-17
- **Partly supersedes:** [0044](0044-shard-workstation-ci-without-splitting-test-authority.md), for the full-plan quality-full clause only
- **Related:** [issue #7](https://github.com/cordanaLLM/20-watts-was-enough/issues/7)

## Context

In full-mode CI (`needs.impact-plan.outputs.mode == 'full'`), `quality-full` executed
all non-workstation validation serially via `npm run check:full-without-workstation`.
Main run 39055660294 (commit 9c423c4) spent 15m45 in `quality-full`, with 13m09
consumed by that single serial step, while parallel impact lanes (`lane-go`, `lane-release`, `lane-research`,
`lane-site`) were skipped.

Because each individual lane job already defines an isolated, self-contained check
suite (`check:impact-common`, `check:lane-release`, `check:lane-research`,
`check:lane-site`, and `lane-go`'s Go test and race checks), running them in parallel
during full-mode runs achieves complete non-workstation test coverage without serial
bottlenecks.

## Decision

1. Enable `impact-common`, `lane-go`, `lane-release`, `lane-research`, and `lane-site`
   in full CI mode (`needs.impact-plan.outputs.mode == 'full'`) as well as in their
   respective impact-selected modes.
2. Retain `quality-full` under its job id and name, executing
   clean dependency installation, high-severity dependency advisory rejection, and
   code-shape baseline reset rejection. Remove redundant Go, Python, and CLRS setup
   along with the serial test suite already executed in parallel by `lane-go` and the
   other lanes. Reduce its timeout from 120 minutes to 30 minutes.
3. Update `ci-success` to require `success` for `impact-common`, `lane-go`,
   `lane-release`, `lane-research`, and `lane-site` in full mode, alongside
   `quality-full`.
4. Enforce in repository policy (`validateFullCiFanOutCoverageObject` in
   `scripts/validate-engineering-policy.mjs`) that every entry in
   `check:full-without-workstation` is covered by the union of lane checks, with
   `npm run test:go` covered by the `lane-go` race test step, and that each lane job
   executes its exact declared lane script.

## Consequences

- Full-mode CI wall clock time is no longer dominated by `quality-full`.
- The full gate wall time is now bounded by the PDF renderer proof (9m10) and
  workstation Fixture 026 shard 1 (5m28) on the same run; their speedups are tracked
  in [issue #302](https://github.com/cordanaLLM/20-watts-was-enough/issues/302).
- The main ruleset requires `CI success`, not `Full quality`; `ci-success` still
  requires `quality-full` to succeed in full mode, so the dependency audit and the
  code-shape reset rejection stay blocking.
- The repository policy now checks the locked scientific runtime on
  `workstation-artifacts`, the remaining CI job that installs `requirements-ci.txt`,
  and the Go runtime on `lane-go`.
- Local validation via `npm run check` and `npm run check:full-without-workstation`
  remains unchanged as the complete local merge floor.
