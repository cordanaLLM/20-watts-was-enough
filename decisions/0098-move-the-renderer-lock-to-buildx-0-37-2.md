# 0098 — Move the renderer lock to Buildx 0.37.2

- **Status:** accepted
- **Date:** 2026-10-12
- **Decided by:** derived from the coordination ruling on pull request #156,
  recorded as `20-watts-was-enough-pr156-buildx-coupling` (paraphrased): the
  Buildx version moves as one unit with the renderer lock, the CLRS image
  contract, a rerun of the renderer proof and a recheck of decision 0078.
- **Authority:** `tooling/pdf-renderer/lock.json`, the BuildKit authority
  digest in `tooling/pdf-tools/contract.json` and
  `tooling/clrs-generator/image-contract.json`, the four workflow lines that
  install the client, and the approved value in
  `scripts/validate-engineering-policy.mjs`. The BuildKit daemon image, the
  exporter settings, the limits and the cache design do not change. No claim,
  principle or status changes.
- **Extends:** [0078](0078-reuse-verified-renderer-build-cache.md)
- **Related:** [0053](0053-lock-the-poppler-pdf-tools-image-foundation.md),
  [0077](0077-separate-render-pair-and-image-build-proofs.md),
  [0097](0097-keep-workflow-tool-versions-out-of-the-action-update-group.md)

## Context

The renderer lock named Buildx 0.36.1 by version and revision. The update bot
proposed v0.37.2 for the workflows alone, and decision 0097 took that value
out of the action group because it cannot move without the lock.

Three records carry the same client identity. The lock is the first. The
PDF-tools contract and the CLRS image contract each hold a SHA-256 digest of
the lock's `builder` and `exporter` objects, and the CLRS contract repeats
version and revision in clear text. The lock is also a book source, so its
digest sits in `public/downloads/book-manifest.json`, and the renderer image
carries the lock digest as a label.

## Decision

1. The lock names Buildx 0.37.2 at revision
   `2d379c0c3f22da0d2759d132a0ec81ca949098f0`, the commit of the upstream tag
   `v0.37.2` of 2026-09-30. The BuildKit daemon stays at
   `moby/buildkit:v0.32.2` with its reviewed digest.
2. The BuildKit authority digest becomes
   `bb833df0aa38edd08341868bbae0a96cb069c06b939c055e80a0146bd2dff758` in both
   contracts and in `tooling/internal/clrsfixture/image_contract.go`.
3. The four workflow steps in `ci.yml` and `release.yml` that install the
   client name `v0.37.2`, and `npm run validate:policy` accepts that value
   only.
4. The book manifest and the semantic baseline record the new lock digest and
   the renderer image built from it.
5. Buildx 0.38.0 of 2026-10-07 is not taken here. It is a second unit of the
   same shape once the update bot proposes it.

Nothing else from the three releases applies to this repository. Since 0.37.0
the client waits for BuildKit readiness itself, and 0.37.1 corrects that
timeout and the cleanup on builder removal; the Go code creates builders with
`--bootstrap` and has no readiness poll of its own to retire. The cloud
driver, the Kubernetes fixes and the Bake consent fixes of 0.37.2 concern
features no workflow or command here uses.

## Consequences

- The renderer image identity changes from `sha256:421c7709…` to
  `sha256:cdad2b75…`. Both images have the same 19 layers; the label with the
  lock digest is the only content difference. The published PDF keeps its
  bytes (`sha256:71504cda…`).
- The hosted cache key hashes the lock, so the stored seed no longer matches.
  A later run on `main` stores a new one; the old entry is left to the
  forge's eviction.
- The reproducibility proof and the PDF-tools reproduction pass Docker a
  short allow-list of variables: `HOME`, `PATH` and a few for temporary
  folders, without `DOCKER_CONFIG`. They take the Buildx client from the
  plugin folder under `HOME` or from the system plugin folder.
  `npm run generate:book-pdf` inherits the whole environment. A developer
  whose system client differs from the lock therefore needs the locked client
  in `~/.docker/cli-plugins`, where the hosted setup action also puts it
  (`Plugin path` in the log of run 38193962681).
- No step of the local gate runs a proof against a real client. The Go tests
  stub the client's version line. A lock change stays unproven locally unless
  someone runs the commands below by hand.

## Alternatives considered

- **Move to 0.38.0 at once.** It was five days old on the day of this change,
  inside the bot's seven-day minimum release age, and the ruling names
  v0.37.2.
- **Raise the BuildKit daemon image in the same change.** The client and the
  daemon are separate authorities in the lock. Decision 0078 leaves cache
  semantics to the daemon's parser, so a daemon change needs its own proof.
- **Edit decision 0078's source line.** Decisions are append-only; this
  record carries the new check instead.

## Verification and disclosure

All runs used one workstation (AMD Ryzen 9 9950X3D, 32 logical CPUs, 60 GiB)
inside a unit limited to 4 CPUs and 12 GiB, on 2026-10-12, while other work
held the load average between 2 and 12. The durations describe these runs
and are no benchmark.

| Run | Client | Outcome |
| --- | --- | --- |
| `npm run generate:book-pdf`, `npm run validate:book-pdf` | 0.37.2 | two identical renders; PDF bytes unchanged |
| `verify-pdf-reproducibility --proof image-build` | 0.37.2 | two fresh builders, one image identity, 347 s |
| `verify-pdf-reproducibility --proof render-pair --cache-dir` without a cache | 0.37.2 | pass in 248 s; seed of 20 blobs, 1 023 343 634 bytes |
| the same command with that cache | 0.37.2 | pass in 195 s; cache manifest imported by digest, same image identity |
| `verify-pdf-reproducibility` | 0.36.1, 0.38.0 | refused: client does not match the lock; no receipt |
| `reproduce-pdf-tools-image` | 0.37.2 | pass; final manifest `sha256:d516533e…` |
| `reproduce-pdf-tools-image` on the previous lock | 0.36.1 | pass; the same final manifest |
| `reproduce-pdf-tools-image` | 0.38.0 | refused: client differs from the authority |

`node scripts/validate-published-book-render.mjs` accepted the image-build
receipt and the warm receipt.

Decision 0078's source basis was read again in the Docker documentation
source for the local cache backend, repository `docker/docs`, file
`content/manuals/build/cache/backends/local.md` at commit `39418aec4e21` of
2026-09-27. It still describes the OCI image layout, import of one manifest
by `digest`, `mode=min` as default, and `oci-mediatypes` and
`image-manifest` as `true` by default. It also documents `reset=true`, which
removes untagged blobs on export from Buildx 0.35.0. The cache does not need
it, because each export writes to a fresh staging directory.

Not checked: the hosted seed and a later exact restore under the new cache
key, which the first runs on `main` will show; the release workflow, which
runs on a tag only; and the first-run behaviour of
`reproduce-pdf-tools-image` on a host without the pinned apko image. There
its version probe failed once, at the moment Docker pulled the image, and
passed on the next run. The cause was not isolated and the command is
unchanged.

AI assistance made the change and wrote this record. The runs above verified
it; the rule that the client moves with its lock comes from the ruling cited
at the top.
