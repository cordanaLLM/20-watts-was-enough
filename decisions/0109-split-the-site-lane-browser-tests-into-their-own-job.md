# 0109 — Split the site lane browser tests into their own job

- **Status:** accepted
- **Date:** 2026-10-18
- **Extends:** [0106](0106-fan-out-full-ci-to-impact-lanes.md)
- **Related:** [issue #302](https://github.com/cordanaLLM/20-watts-was-enough/issues/302)

## Context

After [Decision 0106](0106-fan-out-full-ci-to-impact-lanes.md) and the
concurrent renderer chains of
[Decision 0108](0108-run-the-two-image-build-chains-concurrently.md), the Site
lane was the longest CI job. In main run 39089750437 (commit 4464dce) it took
9m04, against 6m12 for the PDF renderer proof. `check:lane-site` ran `test:site`
first, and the four Chromium browser files inside it (book fragments, print
tail, Mermaid and research-object headers) took about 3m40 of that time
serially before translations, the site build and the build tests started.

## Decision

1. `test:site` becomes an alias for `test:site-unit` followed by
   `test:site-browser`. `test:site-unit` holds the CSS authority check and the
   non-browser site tests; `test:site-browser` holds the four browser files with
   the same flags as before.
2. `check:lane-site` runs `test:site-unit` and keeps its remaining steps.
   The new script `check:lane-site-browser` runs `test:site-browser`.
3. A new CI job `lane-site-browser` (name "Site browser lane") uses the same
   condition, runtime setup and selector (`site`) as `lane-site`. `ci-success`
   requires it to succeed in full mode and to match the `site` selector in
   impact mode.
4. The aggregate scripts `test` and `check:full-without-workstation` name
   `test:site-unit` and `test:site-browser` directly. The repository policy
   requires both in the aggregate test scripts, maps `lane-site-browser` to
   `check:lane-site-browser` in the full fan-out coverage, and pins the job in
   the `ci-success` needs, state vector and selector checks.

## Consequences

- No test is removed or loosened; the same commands run in two jobs instead of
  one. Local `npm run test:site` runs the same files as before.
- The projected Site lane takes about 5m15 and the browser lane about 4m05, so
  the PDF renderer proof becomes the longest job. The next full main run
  measures the actual spans.
- Each site run uses one more runner and repeats the dependency installation,
  about 26 seconds of setup.
