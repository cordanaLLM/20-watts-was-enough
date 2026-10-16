# 0101 — Build releases in a reusable workflow

- **Status:** accepted
- **Date:** 2026-10-16
- **Decided by:** maintainer's implementation brief for issue #201.
- **Authority:** `.github/workflows/release.yml`,
  `.github/workflows/release-build.yml`, the release inventory checks in
  `tooling/internal/releasecheck/`, and `.standards.yaml`.
- **Related:** [0095](0095-pin-the-praetor-engine-and-refresh-the-adoption.md),
  [0037](0037-release-go-tooling-and-scope-experiment-images.md)

## Context

The release workflow built assets in one job and downloaded them into another
job for attestation and publication. The pinned Praetor engine
`2d23b2924173` recognises that arrangement as SLSA Build L2. Its Build L3
reader requires a local reusable workflow to build and attest assets in the
same job, without importing another job's artefacts. Decision 0095 recorded
an HISS-11 exception while that boundary, Cosign signing and an explicit SBOM
step were missing.

## Decision

1. Keep tag-push and manual-dispatch triggers, empty workflow permissions and
   non-cancelling publication concurrency in `release.yml`. Pass the resolved
   tag and publication permissions to `release-build.yml`.
2. Make `release-build.yml` the trusted builder, with `workflow_call` as its
   sole trigger. Run source verification, builds, attestation and publication
   in one GitHub-hosted `ubuntu-26.04` job bounded to 225 minutes. Retain the
   existing checks and retries, with no inter-job artefact transfer. The
   retained second checkout disables cleaning to preserve locally built assets.
3. Grant the builder job only `contents: write`, `id-token: write`,
   `attestations: write` and `packages: write`. Pin every external action and
   Cosign v3.1.3. Checkouts do not persist credentials.
4. Sign each freshly built image by its attested digest. Sign the final
   `SHA256SUMS` with keyless Cosign and publish its detached bundle as
   `SHA256SUMS.sigstore.json`. Bound that bundle to 64 KiB and reserve its slot
   within the existing 128-attachment limit. The checksum manifest excludes
   its own signature to avoid a circular digest dependency. Build provenance
   covers both files.
5. Preserve an existing draft or immutable release's bundle after verifying
   its certificate identity, issuer and signature over the final checksum
   bytes. Reuse those bytes instead of generating a different signature on a
   rerun. An invalid bundle stops the workflow; an immutable published release
   missing the bundle cannot be repaired by this workflow.
6. Generate an SPDX JSON SBOM from an exact export of the checked-out tag,
   excluding installed dependencies and build output. Bind it to the final
   release asset subjects with `actions/attest-sbom`. Disable the SBOM action's
   independent uploads so the existing release preflight owns publication.
   Retain the locked-graph release SBOM and BuildKit image SBOMs.
7. Remove the HISS-11 exception once the pinned offline engine audit accepts
   the workflow structure, signing and SBOM steps. Keep policy tests that
   reject imported assets, signing bypasses and independent SBOM uploads.

## Consumer verification

Verify an asset against the reusable builder and its exact source tag:

```bash
gh attestation verify <asset> \
  --repo cordanaLLM/20-watts-was-enough \
  --signer-workflow cordanaLLM/20-watts-was-enough/.github/workflows/release-build.yml \
  --source-ref refs/tags/<tag>
```

Download `SHA256SUMS` and `SHA256SUMS.sigstore.json` from the same release.
With Cosign v3.1.3, verify the bundle's GitHub Actions issuer and trusted
builder identity, then check the downloaded assets against the manifest:

```bash
cosign verify-blob --bundle SHA256SUMS.sigstore.json \
  --certificate-identity-regexp '^https://github[.]com/cordanaLLM/20-watts-was-enough/[.]github/workflows/release-build[.]yml@refs/tags/v[0-9]+[.][0-9]+[.][0-9]+$' \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com \
  SHA256SUMS
sha256sum --check SHA256SUMS
```

Verify a container's immutable digest with the same identity and issuer:

```bash
cosign verify \
  --certificate-identity-regexp '^https://github[.]com/cordanaLLM/20-watts-was-enough/[.]github/workflows/release-build[.]yml@refs/tags/v[0-9]+[.][0-9]+[.][0-9]+$' \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com \
  ghcr.io/cordanallm/20-watts-was-enough-20w@<digest>
```

The regular expression admits release tags. To require one particular tag,
use `--certificate-identity` with its full builder URL and tag instead.
Cosign verifies the signature; the source-bound `gh attestation verify`
command also checks the build's source ref. Use both checks for a release.

## Consequences

The job structure satisfies the repository's declared SLSA Build L3 reader.
A passing static audit establishes that configured boundary; a hosted release
run and consumer verification establish evidence for actual released bytes.
This change creates no rehearsal tag and performs no publication.

The builder holds publication permissions while validating and building.
That is the trade-off of the single-job design. Exact tagged source, hosted
runners, pinned tools, unpersisted checkout credentials, preflight checks and
source-bound signature verification remain the release trust boundary.

## Alternatives considered

- **Retain the artifact transfer.** It preserves the separate read-only build
  job but does not meet the pinned engine's local reusable-builder rule.
- **Re-sign on each rerun.** Keyless signatures contain new signing material;
  different bundle bytes would conflict with immutable asset comparison.

## Verification

Run the pinned engine audit without the HISS-11 exception, workflow policy
checks, inventory and CLI tests, prose checks, YAML parsing and actionlint.
The repository gate remains `make verify-all`. Local results and command
logs are retained under `.workingdir/evidence/release-slsa3/`; no hosted
execution is claimed by this decision.
