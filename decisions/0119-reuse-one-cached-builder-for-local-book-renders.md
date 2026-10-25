# 0119 — Reuse one cached builder for local book renders

- **Status:** accepted
- **Date:** 2026-10-25
- **Decided by:** controller order: local `render-pdf` runs reuse one cached
  builder, pull base images only when a pinned digest changes, and remove the
  builders a run creates; CI may keep pulling (paraphrased).
- **Authority:** `tooling/internal/pdfrender/cached_builder.go`, the builder
  selection in `tooling/internal/pdfrender/render.go`, and the render report in
  `tooling/cmd/20w/main.go`. No renderer lock, release, proof receipt, claim or
  result status changes.
- **Extends:** [0078](0078-reuse-verified-renderer-build-cache.md)
- **Related:** [0077](0077-separate-render-pair-and-image-build-proofs.md),
  [0090](0090-re-record-book-provenance-for-dependency-records.md)

## Context

`20w publication render-pdf` created a new `docker-container` builder for
every run, built with `--pull`, and removed the builder afterwards. A new
builder starts with an empty content store, so each run downloaded the
BuildKit image and both digest-pinned base images (Node and the Puppeteer
browser environment) again. The Chrome archive already comes from a verified
host cache (`archive.go`).

On 2026-10-25 the host link measured about 555 KB/s. Five consecutive renders
of one dependency pull request hit the lock's `build_seconds` ceiling of
900 s while building the image. Each attempt held the link for 15 minutes and
delayed other sessions' pushes. One builder, `pdf20w-1631271-…`, had also
outlived its process since 2026-10-18 and still ran its BuildKit container.

[Decision 0078](0078-reuse-verified-renderer-build-cache.md) added a verified
layer cache only to the reproducibility proof and kept default invocations
uncached.

## Decision

1. A render of `--ref main` uses one persistent builder named
   `pdf20w-cache-<16 hex>`. The suffix is the first 8 bytes of the SHA-256 of
   the locked BuildKit image and platform, so a BuildKit lock change selects a
   new builder with an empty store.
2. Before use, `buildx inspect --bootstrap` must report the `docker-container`
   driver and exactly the locked BuildKit image. A builder that fails this
   check stops the render; it is never used or replaced silently. If two
   renders create the builder at the same time, the loser re-inspects and
   uses it.
3. The cached build drops `--pull`. Both `FROM` lines name immutable digests
   from the renderer lock, so BuildKit downloads a base image only when the
   lock changes its digest.
4. Each cached render removes other `pdf20w-cache-*` builders, which belong to
   an earlier BuildKit lock. It never touches builders outside that exact
   name pattern.
5. Tag renders (`--ref vMAJOR.MINOR.PATCH`), which only the release workflow
   runs, keep the fresh owned builder with `--pull` and remove it on every
   return path. The reproducibility and image-build proofs keep their fresh
   builders and `--no-cache` from Decisions 0077 and 0078.
6. The success line names the builder path that ran, `cached builder <name>`
   or `fresh builder <name> with --pull`.

## Consequences

- A second local render downloads no base image and, when the image layers
  are unchanged, completes its build from the store. The PDF pair is still
  rendered twice in isolated containers and compared byte for byte, and the
  recorded image ID still comes from the build's `--iidfile`.
- The cached builder keeps its BuildKit container and store between runs.
  BuildKit's default garbage collection bounds the store. Removing the builder
  by hand (`docker buildx rm pdf20w-cache-…`) is always safe; the next render
  recreates it.
- A process with Docker access can alter the persistent store. Docker access
  is root-equivalent on the host, so this adds no new trust boundary. Release
  renders and CI proofs build fresh and do not depend on the store.
- `cached_builder_test.go` keeps a simulated builder set and fails when any
  render path leaves a builder it created other than the cached one, when an
  outdated cached builder survives, when the cached build passes `--pull`, or
  when a builder with a different BuildKit image is used.
