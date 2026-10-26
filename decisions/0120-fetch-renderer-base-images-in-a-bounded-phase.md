# 0120 — Fetch renderer base images in a bounded phase

- **Status:** accepted
- **Date:** 2026-10-26
- **Decided by:** controller order: give the renderer base pull its own phase
  with an explicit deadline and bounded retries, so a slow first fill after a
  digest change fails by name instead of hanging the render (paraphrased).
- **Authority:** `tooling/internal/pdfrender/base_fetch.go`, the phase order in
  `tooling/internal/pdfrender/render.go`, and `publicationRenderDeadline` in
  `tooling/cmd/20w/main.go`. No renderer lock, release, proof receipt, claim or
  result status changes.
- **Extends:** [0119](0119-reuse-one-cached-builder-for-local-book-renders.md)

## Context

After [Decision 0119](0119-reuse-one-cached-builder-for-local-book-renders.md)
a render downloads a base image only when the renderer lock changes its digest.
That first download still happened inside the image build, under the lock's
`build_seconds` ceiling of 900 s. On a slow link the first fill after the
Node 26.12.0 digest change ran past that ceiling, and the build failed with a
generic timeout that did not say a base download was the cause.

## Decision

1. Before the image build, the render fetches both locked base images, the
   Node image and the browser environment image, into the selected builder's
   store. Each fetch is a `buildx build --output type=cacheonly` of
   `FROM <image>` followed by `RUN ["true"]`. A `FROM`-only cacheonly build
   resolves the manifest and downloads nothing; the `RUN` step makes BuildKit
   download and unpack every layer.
2. Each fetch attempt is bounded to 10 minutes, each image gets at most 3
   attempts with a 5 s pause between them, and the whole phase is bounded to
   30 minutes (`MaximumBaseFetchDuration`). A cancelled render stops at once
   without a retry.
3. A fetch that does not finish fails with
   `fetch PDF renderer base image <image>: failed after <n> of 3 attempts`,
   naming the image and the bounds.
4. Builder preparation and the image build each keep the full `build_seconds`
   window. `publicationRenderDeadline` grows by one build window and the fetch
   phase.

## Consequences

- On an empty store, the fetch phase carries all base-layer downloads and the
  image build finds both `FROM` steps cached. A render on a filled store runs
  the two fetch builds from the cache with no download.
- Fresh owned builders (tag renders) run the same phase before their `--pull`
  build. Digest-pinned layers already in the store are not downloaded again.
- The reproducibility and image-build proofs of Decisions 0077 and 0078 are
  unchanged.
- `base_fetch_test.go` fails when a stalled fetch is not stopped within its
  bounds, when a cancelled render retries, when the fetch passes `--pull` or
  another output than `type=cacheonly`, and when a failed fetch leaves an
  owned builder behind.
