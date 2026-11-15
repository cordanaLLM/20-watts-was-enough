# 0130 — Move the renderer lock to Buildx 0.39.0

- **Status:** accepted
- **Date:** 2026-11-15
- **Decided by:** the coordination order recorded as
  `20-watts-buildx-lock-bump-20261114` (paraphrased: move the renderer
  lock to Buildx 0.39.0 through the update bot's pull request with the
  digest recompute decision 0115 requires), applied under the coupling
  rule decision 0105 follows.
- **Authority:** `tooling/pdf-renderer/lock.json`, the BuildKit authority
  digest in `tooling/pdf-tools/contract.json`,
  `tooling/clrs-generator/image-contract.json` and
  `tooling/internal/clrsfixture/image_contract.go`, the five workflow lines
  that install the client, the approved value in
  `scripts/validate-engineering-policy.mjs`, and the renderer cache inventory
  in `tooling/internal/pdfrender/build_cache_inventory.go`, which admits one
  more root entry (point 5). The BuildKit daemon image, the exporter
  settings and the limits do not change. No claim, principle or status
  changes.
- **Extends:** [0115](0115-move-the-renderer-lock-to-buildx-0-38-1-and-let-the-update-bot-carry-it.md)
- **Related:** [0127](0127-move-the-renderer-lock-to-buildx-0-38-2.md),
  [0105](0105-move-the-renderer-lock-to-buildx-0-38-0.md),
  [0097](0097-keep-workflow-tool-versions-out-of-the-action-update-group.md)

## Context

The update bot opened pull request #460 on `renovate/buildx-0.x` to move
`tooling/pdf-renderer/lock.json` and the five `docker/setup-buildx-action`
workflow inputs to Buildx 0.39.0. The annotated tag `v0.39.0` points to
commit `360040a78d6113dc84e5d4dcdf0f438e1be7a41f`. As intended under
decisions 0105 and 0115, the bot pull request failed CI until the values
derived from the lock moved with it. The workstation distribution package
also moved to Buildx 0.39.0 at the same revision
`360040a78d6113dc84e5d4dcdf0f438e1be7a41f`, so local renders require the
updated lock as well.

## Decision

1. The lock names Buildx 0.39.0 at revision
   `360040a78d6113dc84e5d4dcdf0f438e1be7a41f`.
2. The BuildKit authority digest becomes
   `37625b21e2272af151f64d8fe93cb4ab09dab1f431f709cef7cadc3bdc15fea5` in
   both contracts and in `tooling/internal/clrsfixture/image_contract.go`,
   computed with the package's own subset encoding from the new lock.
3. The five workflow steps name `v0.39.0`, and `npm run validate:policy`
   accepts that value only.
4. The book manifest and the artifact identity in the semantic baseline are
   rendered and recorded in this pull request because the lock SHA-256 is
   part of the manifest contract and provenance must stay consistent with
   the checked-in lock.
5. The renderer cache inventory admits one more optional root entry next to
   the OCI layout: a non-symlink directory named `ingest-locks`. Buildx
   0.39.0 vendors the BuildKit client v0.35.0 (0.38.x vendored v0.34.0),
   whose `client/solve.go` (`localCacheStore.lock`) takes a file lock per
   ingest reference under `ingest-locks/<sha256-hex>` and keeps the lock
   files after unlocking on purpose so one empty file per reference remains
   even after a cache reset. The first CI render pair on pull request #460
   with the unchanged inventory failed with "PDF renderer cache has missing,
   extra or excessive entries", and a workstation render pair at the same
   head refused its staged export the same way. Every entry in `ingest-locks` must be a
   non-symlink empty regular file whose name matches `^[0-9a-f]{64}$`, and
   the directory may hold at most `maximumRendererCacheLayers + 2` (130)
   entries, the manifest, config and layer closure bound; an empty directory
   is admitted, and any symlink, non-empty file, subdirectory, other file
   name, excess entry, non-directory `ingest-locks` or other extra root
   entry is still refused.

## Consequences

- Local renders on a host with the 0.39.0 package run without a
  workaround.
- The renderer image identity, the lock digest and the source digest in
  `public/downloads/book-manifest.json` change with this update, and
  `scripts/book-pdf-semantic-baseline.json` records the new manifest
  SHA-256 and source digest. The PDF bytes do not change.
- The hosted cache key hashes the lock, so the stored seed no longer
  matches and a later run on `main` stores a new one.
- A cache written by Buildx 0.39.0 carries `ingest-locks`, and the
  inventory now admits it; an inventory of a cache written by Buildx 0.38.x
  has no `ingest-locks` directory and still passes because the directory is
  optional.

## Verification and disclosure

Runs on one workstation on 2026-11-15, host Buildx client
`github.com/docker/buildx 0.39.0 360040a78d6113dc84e5d4dcdf0f438e1be7a41f`
with no private `DOCKER_CONFIG`.

| Run | Outcome |
| --- | --- |
| `go -C tooling test -count=1 ./internal/clrsfixture/ ./internal/pdfrender/ ./internal/pdftools/ ./internal/pdfrenderlock/` | pass |
| `node scripts/validate-engineering-policy.mjs` | pass |
| authority digest from the `pdfrenderlock` subset encoding, cross-checked with a Python reproduction | match: both produce `37625b21…` |
| `npm run generate:book-pdf` | pass: two identical renders; PDF SHA-256 `002896bc…`, the same bytes as before the update |
| `npm run generate:book-pdf` after the cache-inventory change, whose Go source is book source | pass: two identical renders; PDF SHA-256 `002896bc…` unchanged; recorded source digest `01b99540…` |
| `npm run validate:book-pdf` after both renders | pass |
| `go -C tooling run ./cmd/pdf-proof --proof render-pair` with the unchanged inventory, cold cache | fail after 439 s: the staged export holds `ingest-locks` and is refused with "PDF renderer cache has missing, extra or excessive entries" |
| `go -C tooling test -count=1 ./internal/pdfrender/` with `allowed["ingest-locks"] = true` removed | fail: `TestRendererCacheInventoryRecordsExactClosureAndAllowsEmptyIngest` refuses the empty `ingest-locks` case with the same diagnostic |
| `go -C tooling test -count=1 ./internal/pdfrender/` and `go -C tooling vet ./internal/pdfrender/` | pass |
| `go -C tooling run ./cmd/pdf-proof --proof render-pair`, cold cache | pass: identical image ids `cd15076a…`, PDF and manifest pair `99c96df2…`; the export holds 20 blobs and 20 empty ingest locks |
| the same render pair, warm cache from the run above | pass: cache imported, the same cache manifest `82523408…`, image ids and PDF and manifest pair; 20 blobs and 20 ingest locks |

Antigravity (Gemini 4 Carbon) drafted the derived values, the cache-inventory
update and this record in a sparse worktree, and Claude Code reviewed both
drafts, reran every check above on the workstation and rendered the book. Automated tests and retained command receipts describe the
exercised boundaries, not independent scientific review.
