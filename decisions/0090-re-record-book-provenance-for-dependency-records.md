# 0090 — Re-record book provenance for dependency records without a render

- **Status:** accepted
- **Date:** 2026-10-11
- **Decided by:** the maintainer, in the 2026-10-11 planning round on the
  update-bot backlog (paraphrased): the re-record of the book digests becomes
  one command without a local render, usable by hand, with one hand commit per
  update-bot pull request.
- **Authority:** publication-boundary tooling and one CI comparison. The
  manifest schema, the book source set, the renderer lock, the release gate and
  the impact mapping do not change. No claim, principle or status changes.
- **Related:** [0076](0076-separate-book-support-provenance-inventory.md),
  [0077](0077-separate-render-pair-and-image-build-proofs.md),
  [0078](0078-reuse-verified-renderer-build-cache.md),
  [0088](0088-impact-scope-ci-and-local-validation.md)

## Context

`package.json`, `package-lock.json`, `tooling/go.mod` and `tooling/go.sum` are
book support sources, because the renderer installs and builds from them. A
change to any of them moves the book source digest, and
`npm run validate:book-pdf` then fails until
`public/downloads/book-manifest.json` and
`scripts/book-pdf-semantic-baseline.json` name the new digest.

Until now the only way to move those records was `npm run generate:book-pdf`,
a container render with the pinned builder, followed by a hand edit of two
baseline digests. The update bot cannot run it. On 2026-10-11 six open
update-bot pull requests (#159, #165, #166, #177, #178, #180) changed only
`package.json` and `package-lock.json` and failed on nothing but the lagging
record.

A render-free re-record is safe only if something else proves that the
published PDF still is what these sources render. Nothing did. The CI renderer
job compared two fresh renders with each other and never with the committed
PDF. Its receipt already held the needed facts: in the run for pull request
#190 both fresh pairs carried the SHA-256 and size of the committed PDF, and
the fresh manifest equalled the committed manifest byte for byte once
`renderer.image_id` was replaced by the identity the CI host reported for the
same image. That field depends on the host's image store, so it is the one
field a comparison must substitute.

## Decision

1. `npm run record:book-provenance` rewrites `source_digest` and
   `source_files` in the manifest and `manifest_sha256` and `source_digest` in
   the semantic baseline, and nothing else. It does not render. With `--check`
   it writes nothing and exits 1 when the record is stale.
2. The command refuses unless every book source that changed since the merge
   base with `origin/main` (or `--base <revision>`) is listed in
   `scripts/book-render-free-sources.json`. The list holds the four dependency
   records named above. The record at the merge base must be the record being
   replaced; otherwise the changed-path list would not explain the stale
   digest. Any other changed book source still needs
   `npm run generate:book-pdf`.
3. The CI renderer job ends with
   `node scripts/validate-published-book-render.mjs`. It reads the job's own
   passing receipt and fails unless every fresh render has the SHA-256 and size
   of the published PDF and produced the published manifest, with only
   `renderer.image_id` substituted. `scripts/validate-engineering-policy.mjs`
   pins the step as the last, unconditional, bounded step of the job.
4. `TestRenderFreeBookSourcesSelectTheIndependentBuildProof` in
   `tooling/internal/ciplan/` reads the same list and fails when a listed path,
   alone or beside the record files, does not select the renderer job with two
   independent builds. A path whose change can skip that job cannot enter the
   list.
5. A person runs the command and commits the result, one commit per update-bot
   pull request. No workflow pushes that commit: it would need a write
   credential that re-triggers CI, which this record does not create.

## Consequences

- A dependency update whose render is byte-identical lands after one command.
  An update that changes the rendered bytes fails the new CI step, and the
  failure names `npm run generate:book-pdf`.
- The renderer job now fails on any renderer-selected change whose published
  PDF is stale, not only on a non-reproducible render.
- Chapter, research, mathematics and asset changes do not select the renderer
  job. They keep the local render, and the new comparison does not cover them.
- The `renderer.image_id` in the committed manifest stays the identity seen by
  the host that rendered last. The comparison treats it as host-dependent; the
  renderer lock and the receipt remain the authority for the image.
- A hand commit on an update-bot branch stops the bot from rebasing that
  branch. Record and merge one pull request before taking the next.

## Alternatives considered

- **Drop the source digest from the committed manifest and compute it in CI.**
  It removes the lag but changes the manifest schema and the release identity
  that binds a PDF to its sources.
- **Remove the dependency records from the book sources.** The renderer builds
  from them, so a real change of rendered bytes would pass unseen.
- **Let the update bot run the render.** The hosted bot cannot run the pinned
  container build; a workflow that commits for it needs the credential named
  in point 5.

## Verification and disclosure

The command's tests cover a current record, a dependency re-record and its
replay, a changed chapter, an added and a removed source, an unexplained
digest, a lagging baseline and malformed records. The comparison's tests cover
both receipt scopes, a differing PDF, a differing manifest and failed, foreign,
single-render and malformed receipts; the comparison also passes on the real
receipt of pull request #190 and fails on an altered copy. The policy pin was
run once against a validator without it: nine planted workflow defects passed
unseen there and fail with it. The planner test was run once with `README.md`
added to the list and failed.

AI assistance wrote the tooling, tests and this record. The checks named above
and `npm run check` verified the result; the maintainer decided the mechanism.
