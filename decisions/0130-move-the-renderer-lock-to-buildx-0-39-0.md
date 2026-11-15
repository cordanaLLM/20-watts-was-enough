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
  that install the client, and the approved value in
  `scripts/validate-engineering-policy.mjs`. The BuildKit daemon image, the
  exporter settings, the limits and the cache design do not change. No
  claim, principle or status changes.
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

## Consequences

- Local renders on a host with the 0.39.0 package run without a
  workaround.
- The renderer image identity, the lock digest and the source digest in
  `public/downloads/book-manifest.json` change with this update, and
  `scripts/book-pdf-semantic-baseline.json` records the new manifest
  SHA-256 and source digest. The PDF bytes do not change.
- The hosted cache key hashes the lock, so the stored seed no longer
  matches and a later run on `main` stores a new one.

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
| `npm run validate:book-pdf` | pass |
| `npm run record:book-provenance` | recorded source digest `812f12f4…` (record only, no render) |

Antigravity (Gemini 4 Carbon) drafted the derived values and this record in a
sparse worktree, and Claude Code reviewed the draft, reran every check above on
the workstation and rendered the book. Automated tests and retained command
receipts describe the exercised boundaries, not independent scientific review.
