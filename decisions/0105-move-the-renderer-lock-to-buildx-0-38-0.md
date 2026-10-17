# 0105 — Move the renderer lock to Buildx 0.38.0

- **Status:** accepted
- **Date:** 2026-10-16
- **Decided by:** the coordination ruling recorded as
  `20-watts-was-enough-pr156-buildx-coupling` (paraphrased: the Buildx
  version moves as one unit with the renderer lock, the CLRS image contract,
  a rerun of the renderer proof and a recheck of decision 0078), applied to
  the second unit that decision 0098 point 5 anticipated.
- **Authority:** `tooling/pdf-renderer/lock.json`, the BuildKit authority
  digest in `tooling/pdf-tools/contract.json` and
  `tooling/clrs-generator/image-contract.json`, the four workflow lines that
  install the client, the approved value in
  `scripts/validate-engineering-policy.mjs`, and the root entries the
  renderer cache inventory admits
  (`tooling/internal/pdfrender/build_cache_inventory.go`). The BuildKit daemon
  image, the exporter settings, the limits and the cache design do not
  change. No claim, principle or status changes.
- **Extends:** [0098](0098-move-the-renderer-lock-to-buildx-0-37-2.md)
- **Related:** [0078](0078-reuse-verified-renderer-build-cache.md),
  [0097](0097-keep-workflow-tool-versions-out-of-the-action-update-group.md)

## Context

Decision 0098 moved the lock to Buildx 0.37.2 and left 0.38.0 of 2026-10-07
for a second unit of the same shape. The update bot proposed v0.38.0 for the
two workflow files alone; the lock, both contracts, the policy and the book
records stayed at 0.37.2, so the pull request failed the policy check.

## Decision

1. The lock names Buildx 0.38.0 at revision
   `0dbe87f36ed472fe36b6796c3f70b4210a731fc5`, the commit the annotated
   upstream tag `v0.38.0` points to (release published 2026-10-07). The
   BuildKit daemon stays at `moby/buildkit:v0.32.2` with its reviewed digest.
2. The BuildKit authority digest becomes
   `6dfae8d0f6cbd4f7afe7e31f36b70cbc4894d1d4e9cdb29e66ad476ba5e86def` in both
   contracts and in `tooling/internal/clrsfixture/image_contract.go`. The
   previous value `bb833df0…` was recomputed from the old lock with the same
   encoding before the new one was taken.
3. The four workflow steps in `ci.yml` and `release-build.yml` that install
   the client name `v0.38.0`, and `npm run validate:policy` accepts that
   value only.
4. The renderer cache inventory admits one more root entry next to the OCI
   layout: an empty regular file named `cache.lock`. Buildx 0.38.0 vendors
   the BuildKit client v0.34.0 (0.37.2 vendored v0.33.1), whose `client/solve.go`
   takes a file lock on every local cache store it exports to and keeps the
   lock file on purpose (`resetCacheStore`: removing it could let another
   process lock a different inode). The first cold render pair with the
   unchanged inventory failed with "PDF renderer cache has missing, extra or
   excessive entries". A non-empty file or a directory under that name is
   still refused, as is any other extra entry.
5. The book manifest and the semantic baseline record the new lock digest and
   the renderer image built from it.

Besides the cache lock above, two 0.38.0 changes touch paths this
repository uses: builder feature detection no longer reads stale cached
data, and `inspect --bootstrap` no longer prints a stale node status. The Go code creates builders with
`--bootstrap` and reads no node status, so neither changes a command here.
Bake job modes, `buildx replay build`, policy host normalisation, zstd
contexts and the Kubernetes driver fixes concern features no workflow or
command here uses.

## Consequences

- The renderer image identity changes from `sha256:fe272acf…` to
  `sha256:ea178113…`. The published PDF keeps its bytes
  (`sha256:80418fe4…`).
- The hosted cache key hashes the lock, so the stored seed no longer matches.
  A later run on `main` stores a new one; the old entry is left to the
  forge's eviction.
- A cache written by Buildx 0.38.0 carries `cache.lock`, and the inventory
  now admits it. A cache written by 0.37.2 has no such file and still passes
  the same inventory; it cannot be imported under the new lock anyway,
  because the cache key changes with the lock.
- As in decision 0098, the proofs take the Buildx client from the plugin
  folder under `HOME` or from the system plugin folder, not from
  `DOCKER_CONFIG`. No step of the local gate runs a proof against a real
  client, so the runs below were made by hand.

## Alternatives considered

- **Keep 0.37.2 and hold the bot pull request.** The update-bot backlog
  ruling keeps bot pull requests open and asks for the cause to be fixed;
  the lock is the cause, so it moves.
- **Raise the BuildKit daemon image in the same change.** The client and the
  daemon are separate authorities in the lock; decision 0078 leaves cache
  semantics to the daemon's parser, so a daemon change needs its own proof.

## Verification and disclosure

All runs used one workstation (AMD Ryzen 9 9950X3D, 32 logical CPUs, 60 GiB)
inside a unit limited to 12 GiB, on 2026-10-16, while other work held the
load average above 30. The durations describe these runs and are no
benchmark.

| Run | Client | Outcome |
| --- | --- | --- |
| `npm run generate:book-pdf`, `npm run validate:book-pdf` | 0.38.0 | render passes; PDF bytes unchanged |
| `verify-pdf-reproducibility --proof image-build` | 0.38.0 | two fresh builders, one image identity `sha256:ea178113…`, 528 s |
| `verify-pdf-reproducibility --proof render-pair --cache-dir` without a cache, inventory unchanged | 0.38.0 | refused after 401 s: "PDF renderer cache has missing, extra or excessive entries"; the staged export held `cache.lock` |
| the same command with the inventory of point 4 | 0.38.0 | pass in 506 s; seed of 20 blobs, 1 023 694 204 bytes |
| the same command with that cache | 0.38.0 | pass in 399 s; cache manifest imported by digest, same image identity |
| `verify-pdf-reproducibility` | 0.37.2 | refused: client does not match the lock; no receipt |
| `reproduce-pdf-tools-image` | 0.38.0 | pass in 154 s; final manifest `sha256:d516533e…`, the same as under decision 0098 |
| `reproduce-pdf-tools-image` | 0.37.2 | refused: client differs from the authority |

`node scripts/validate-published-book-render.mjs` accepted the image-build
receipt and the warm receipt. The inventory tests cover an empty lock file
(admitted), a non-empty one, a directory and a symbolic link under that name
(refused); two mutants of the check, one without the size test and one
without the admission, each fail them.

Decision 0078's source basis was read again: the Docker documentation source
for the local cache backend, repository `docker/docs`, file
`content/manuals/build/cache/backends/local.md`, still has its latest commit
at `39418aec4e21` of 2026-09-27, the text decision 0098 checked. It does not
mention the lock file.

Not checked: the hosted seed and a later exact restore under the new cache
key, which the first runs on `main` will show; the release workflow, which
runs on a tag only.

AI assistance made the change and wrote this record. The runs above verified
it; the rule that the client moves with its lock comes from the ruling cited
at the top.
