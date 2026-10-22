# 0115 — Move the renderer lock to Buildx 0.38.1 and let the update bot carry it

- **Status:** accepted
- **Date:** 2026-10-22
- **Decided by:** the coordination order recorded as
  `20w-buildx-lock-bump-20261022` (paraphrased: move the renderer lock and
  the CLRS image contract to Buildx 0.38.1 in one pull request, and let the
  update bot propose the next lock change instead of a host failing first),
  applied under the coupling rule decision 0105 follows.
- **Authority:** `tooling/pdf-renderer/lock.json`, the BuildKit authority
  digest in `tooling/pdf-tools/contract.json`,
  `tooling/clrs-generator/image-contract.json` and
  `tooling/internal/clrsfixture/image_contract.go`, the four workflow lines
  that install the client, the approved value in
  `scripts/validate-engineering-policy.mjs`, and the Buildx entries in
  `renovate.json`. The revision, the BuildKit daemon image, the exporter
  settings, the limits and the cache design do not change. No claim,
  principle or status changes.
- **Extends:** [0105](0105-move-the-renderer-lock-to-buildx-0-38-0.md)
- **Related:** [0097](0097-keep-workflow-tool-versions-out-of-the-action-update-group.md)

## Context

Buildx 0.38.1 was released on 2026-10-20. It rebuilds 0.38.0 with Go 1.26.10
for CVE-2026-111943; the annotated tags `v0.38.0` and `v0.38.1` both point to
commit `0dbe87f36ed472fe36b6796c3f70b4210a731fc5`. The workstation's
distribution package moved to 0.38.1 the same week, and the renderer then
refused every local render with "Docker Buildx version or revision does not
match the renderer lock", because the lock compares the version string as
well as the revision. Local renders ran only with a job-local
`DOCKER_CONFIG` that held the upstream 0.38.0 plugin.

The update bot tracked the four workflow inputs (`version: v0.38.x`) but not
the lock, so it could not have raised the drift before a host hit it.

## Decision

1. The lock names Buildx 0.38.1 at the unchanged revision
   `0dbe87f36ed472fe36b6796c3f70b4210a731fc5`. The upstream release file
   `checksums.txt` lists `buildx-v0.38.1.linux-amd64` with SHA-256
   `e25d5cd675092bb5d1d03632fdc46cdf3fede7b514dc5f023a105e00d3ce5ad4`. The
   lock records no binary digest: a distribution build of the same version
   and commit has different bytes and would be refused, while the check
   that matters, version and revision as `docker buildx version` reports
   them, stays.
2. The BuildKit authority digest becomes
   `6aa28166ec01c5f7bc805175adf52e8e0d5185b932a3cc0fe2cca33e89b98c12` in both
   contracts and in `tooling/internal/clrsfixture/image_contract.go`,
   computed with the package's own subset encoding from the new lock.
3. The four workflow steps name `v0.38.1`, and `npm run validate:policy`
   accepts that value only.
4. A regex custom manager in `renovate.json` reads `buildx_version` and
   `buildx_revision` from the lock as the current value and digest of the
   dependency `buildx` (`github-tags`, `docker/buildx`, tag prefix `v`
   stripped). The name matches the workflow input, so Renovate merges both
   into one branch, `renovate/buildx-0.x`, without a `groupName`, which the
   policy of decision 0097 would refuse here. A package rule adds a note to
   that pull request that lists the values the bot cannot compute: the
   authority digest in both contracts and the Go constant, the approved
   policy value and the book record.
5. The book manifest records the new lock digest and renderer image, and
   the semantic baseline records the new manifest hash.

The image contract under `tooling/clrs-generator/` stays outside the bot's
reach because `ignorePaths` excludes that folder; its digest moves with the
lock by hand, as the note says.

## Consequences

- Local renders on a host with the 0.38.1 package run without a workaround.
- The renderer image identity changes from `sha256:9a2e9bec…` to
  `sha256:5ef5f660…`, and the lock digest from `ce94c89e…` to `d2957178…`.
  The PDF bytes do not change; the semantic baseline moves only by the
  manifest hash and source digest it records.
- The next Buildx release arrives as one bot pull request that changes the
  workflow inputs and the lock together. It still fails the tests until the
  derived digests are recomputed, which keeps decision 0105's coupling: the
  failure now points at the bot pull request instead of at a host.
- The repository's `minimumReleaseAge` of seven days and the Monday-morning
  schedule delay that pull request by up to two weeks after a release.
- The hosted cache key hashes the lock, so the stored seed no longer matches
  and a later run on `main` stores a new one.

## Alternatives considered

- **Drop the version string from the lock and compare the revision only.**
  A security rebuild such as this one would then pass unnoticed, and the
  lock would no longer say which client built the image.
- **Record the upstream binary digest in the lock.** It would refuse the
  distribution package that reports the same version and commit.
- **Keep the job-local plugin folder.** It hides the drift on one host and
  leaves every other host failing.

## Verification and disclosure

Runs on one workstation on 2026-10-22, inside a unit limited to 12 GiB.

| Run | Outcome |
| --- | --- |
| `go test` for `clrsfixture`, `pdfrender`, `pdftools`, `pdfrenderlock`, `cmd/20w` | pass |
| `npm run validate:policy` | pass; with one workflow line planted back to `v0.38.0`, refused |
| `renovate-config-validator --strict` (Renovate 44.176.2) | pass; a planted misspelt option is refused |
| Renovate 44.176.2 `--platform=local --dry-run=lookup` on `main` with the new configuration | the regex manager reads `tooling/pdf-renderer/lock.json` at 0.38.0 and proposes 0.38.1 at revision `0dbe87f36ed4` on `renovate/buildx-0.x`, the branch of the four workflow inputs |
| `npm run generate:book-pdf`, `npm run validate:book-pdf` without `DOCKER_CONFIG`, host client 0.38.1 from the distribution package | two identical renders, image `sha256:5ef5f660…`; validation passes on 428 sources |
| the same render with `buildx_revision` planted one hex digit off | refused: "Docker Buildx version or revision does not match the renderer lock" |
