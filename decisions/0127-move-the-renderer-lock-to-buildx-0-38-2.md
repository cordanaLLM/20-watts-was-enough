# 0127 — Move the renderer lock to Buildx 0.38.2

- **Status:** accepted
- **Date:** 2026-11-07
- **Decided by:** the coordination order recorded as
  `20w-374-buildx-render` (paraphrased: move the renderer lock to
  Buildx 0.38.2 in a separate pull request so local renders match
  the host distribution package), applied under the coupling rule
  decision 0105 follows.
- **Authority:** `tooling/pdf-renderer/lock.json`, the BuildKit authority
  digest in `tooling/pdf-tools/contract.json`,
  `tooling/clrs-generator/image-contract.json` and
  `tooling/internal/clrsfixture/image_contract.go`, the four workflow lines
  that install the client, and the approved value in
  `scripts/validate-engineering-policy.mjs`. The revision, the BuildKit
  daemon image, the exporter settings, the limits and the cache design do
  not change. No claim, principle or status changes.
- **Extends:** [0115](0115-move-the-renderer-lock-to-buildx-0-38-1-and-let-the-update-bot-carry-it.md)
- **Related:** [0105](0105-move-the-renderer-lock-to-buildx-0-38-0.md),
  [0097](0097-keep-workflow-tool-versions-out-of-the-action-update-group.md)

## Context

Buildx 0.38.2 was released on 2026-10-27. The annotated tag `v0.38.2`
points to commit `3c4cbd35852fc1a476923627a780a7836c28b654`. The
workstation distribution package moved to 0.38.2, and the renderer then
refused every local render with "Docker Buildx version or revision does
not match the renderer lock", because the lock compares the version
string as well as the revision. The update bot had not yet proposed a
pull request for this version.

## Decision

1. The lock names Buildx 0.38.2 at revision
   `3c4cbd35852fc1a476923627a780a7836c28b654`.
2. The BuildKit authority digest becomes
   `edf60a8e3b592e3dca4d1cbeb0bc3c22166efe1ed9cf34a88cd9356b196dd11d` in
   both contracts and in `tooling/internal/clrsfixture/image_contract.go`,
   computed with the package's own subset encoding from the new lock.
3. The four workflow steps name `v0.38.2`, and `npm run validate:policy`
   accepts that value only.
4. The book manifest and semantic baseline are not updated in this pull
   request; they move when the next pull request that touches book
   sources renders and records provenance.

## Consequences

- Local renders on a host with the 0.38.2 package run without a
  workaround.
- The renderer image identity will change on the next render; the lock
  digest changes with this commit. The PDF bytes do not change; the
  semantic baseline moves only when the next render records it.
- The hosted cache key hashes the lock, so the stored seed no longer
  matches and a later run on `main` stores a new one.

## Verification and disclosure

Runs on one workstation on 2026-11-07.

| Run | Outcome |
| --- | --- |
| `go test` for `clrsfixture`, `pdfrender`, `pdftools`, `pdfrenderlock` | pass |
| `npm run validate:policy` | pass |
| authority digest verified against Python reproduction of the Go subset encoding | match: both produce `edf60a8e…` |
