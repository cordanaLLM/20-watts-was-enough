# 0102 — Accept release-candidate tags

- **Status:** accepted
- **Date:** 2026-10-16
- **Decided by:** maintainer; ledger `20-watts-201-rehearsal` selects an rc
  rehearsal before the first release through the SLSA Build L3 builder.
- **Authority:** `.github/workflows/release.yml`,
  `.github/workflows/release-build.yml`, `tooling/internal/releasetag/`,
  `tooling/internal/releasecheck/`, `scripts/prepare-release-assets.mjs`, and
  `app/lib/book-release-identity.mjs`.
- **Related:** [0101](0101-build-releases-in-a-reusable-workflow.md),
  [0037](0037-release-go-tooling-and-scope-experiment-images.md)

## Context

The reusable builder introduced in decision 0101 admits only final version
tags. A release-candidate rehearsal needs the same source, asset, signature
and immutable-publication checks while remaining a GitHub pre-release.

## Decision

Admit exactly this tag grammar at every release boundary:

```text
^v(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(-rc\.(0|[1-9][0-9]*))?$
```

The optional suffix is lowercase `-rc.N`, where `N` is zero or a positive
integer without leading zeros. Go consumers share the pattern in
`tooling/internal/releasetag/`. The workflow's first step and the asset
preparer enforce the same grammar; policy tests reject a broader suffix.
The existing `v*.*.*` push filter already selects rc tags and leaves exact
validation to the first builder step.

An rc tag requires `prerelease=true` at creation, draft publication and
existing-release verification. Its create and edit commands pass
`--latest=false`. A final tag requires `prerelease=false` and retains the
existing latest-selection behaviour. A mismatched existing release fails
before publication. Draft, immutable, peeled-tag, source-commit and
`origin/main` containment requirements remain binding.

All three image roles publish only the exact tag. Metadata uses
`latest=false` and a raw tag value, and the admitted-digest binding uses the
same full tag. An rc run cannot advance a final-version or floating image
tag. Binaries, image labels, source refs and attestations retain the rc suffix.
The book source-identity parser accepts the same rc grammar within its existing
32-character source-ref bound and compares its base with the edition version.

Release preparation compares the version before the first hyphen with
`package.json`, both root version fields in `package-lock.json`, and
`CITATION.cff`. The same base version selects the dated changelog section
and `research/disclosures/v<version>.md`. Thus `v0.5.0-rc.1` requires version
`0.5.0` in those manifests, matching citation and changelog release dates,
and a complete `v0.5.0` disclosure. This decision does not bump the current
`0.4.1` manifests. The tag-bound PDF must still pass the existing release
asset checks when a release is executed.

## Consequences

Candidate numbers can begin at zero. Arbitrary pre-release identifiers,
build metadata, uppercase suffixes and leading-zero numbers are refused.
The rehearsal exercises the existing publication path with a distinct tag;
local grammar and policy checks establish no hosted release result.

## Verification

Run all Go tests, workflow policy tests, release-asset tests, actionlint,
prose and documentation validation. Grammar fixtures cover final tags,
`rc.0`, larger candidate numbers and malformed suffixes. State fixtures
cover matching and mismatched pre-release flags for drafts and immutable
releases. Evidence lives under `.workingdir/evidence/rc-form/`. No tag,
release, workflow dispatch or render is created by this implementation.
