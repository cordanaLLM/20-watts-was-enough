# 0118 — Lock setuptools 84.1.0 in the CLRS generator

- **Status:** accepted
- **Date:** 2026-10-24
- **Decided by:** controller order: move setuptools from 84.0.0 to 84.1.0 in
  the CLRS generator lock for Dependabot alert 51; one pull request
  (paraphrased). Recorded under
  [decision 0092](0092-exclude-the-clrs-generator-folder-from-update-proposals.md),
  which requires a reviewed re-resolution with its own decision record.
- **Authority:** `tooling/clrs-generator/lock-input.json`, its derived
  `pyproject.toml`, `uv.lock`, `wheelhouse.json`, `image-contract.json`,
  `sbom-bundle.json`, and the reviewed cutoff policy and Promise wheel
  identity in `tooling/internal/clrsfixture`. No image admission, claim,
  principle or result status changes.
- **Related:** [0092](0092-exclude-the-clrs-generator-folder-from-update-proposals.md),
  [0113](0113-lift-the-certifi-cutoff-in-the-clrs-generator.md),
  [0114](0114-lock-pip-in-the-clrs-generator.md)

## Context

[GHSA-xmj3-9gf7-h52w](https://github.com/advisories/GHSA-xmj3-9gf7-h52w)
(severity low, published 2026-10-23) affects setuptools from 38.2.2 up to,
but excluding, 84.1.0: legacy wheel installation can escape the target
directory on Windows through `namespace_packages.txt`. The CLRS generator
lock held setuptools 84.0.0, which Dependabot reported as alert 51 against
`tooling/clrs-generator/uv.lock`. setuptools is a locked runtime package of
the generator and one of the three build tools that produce the Promise
2.3 wheel from its sdist.

setuptools 84.1.0 was uploaded on 2026-10-19 at 20:11:43 UTC and 84.2.0 at
20:38:01 UTC the same day. The global cutoff (2026-08-31) admits neither.

## Decision

1. Keep the global cutoff and the certifi, pip and urllib3 cutoffs. Add a
   reviewed per-package cutoff, `setuptools = 2026-10-19T20:20:00Z`, to the
   resolver input and the derived project file. It falls between the two
   uploads and admits exactly 84.1.0.
2. Re-resolve with the pinned uv 0.12.9 binary from the digest-pinned image
   and the existing lock, `uv lock --upgrade-package setuptools`. Only the
   options header and the setuptools package block change. The header keeps
   the package cutoffs in sorted order, which the lock validator requires;
   `uv lock --check` accepts it and a further `uv lock` leaves it byte for
   byte.
3. The reviewed cutoff policy in `image_lock.go` accepts exactly certifi,
   pip, setuptools and urllib3.
4. Select the setuptools 84.1.0 wheel as runtime package and Promise build
   tool, verify its size and SHA-256 against PyPI, and update the manifest
   and contract digest chains together.
5. Repin the source-built Promise wheel. Its `WHEEL` file names the
   setuptools version that built it, so two fresh reproductions with the
   new build tool define the new identity.
6. Rebuild the candidate image from the new lock and move the retained SBOM
   bundle that CI checks to a new prerelease.

## Consequences

- setuptools advances from 84.0.0 to 84.1.0. The lock still contains 63
  packages and 137 artifacts; the wheelhouse manifest contains 62 selected
  wheels.
- The Promise 2.3 wheel is now 21,581 bytes with SHA-256
  `e9fa8772ebc9d24e4357d671f8194cd1d95875732533a43f5b5f5e472160cac2`; its
  `WHEEL` file reads `Generator: setuptools (84.1.0)`.
- The selected wheelhouse bytes increase by 1,163 to 825,757,190 (setuptools
  +1,164, Promise −1).
- The retained SBOM bundle that CI checks against the lock moves to the
  `clrs-sbom-bundle-2026-10-24` prerelease. The pinned scan records 218 packages,
  62 of them locked runtime packages, as before. It lists the installed
  setuptools as 84.1.0; a second setuptools record, 70.3.0, comes only from
  the CycloneDX file that pip vendors (`pip/_vendor/bom.cdx.json`) and names
  no installed copy. The
  `clrs-sbom-bundle-2026-10-22` prerelease stays published.
- Later uploads for other packages remain outside the resolution boundary.
- Dependency validation stays offline.

## Alternatives considered

- **Dismiss the alert because the generator runs on Linux.** The advisory
  names a Windows path; the generator image is Linux only. A dismissal would
  still leave an affected version in a lock that the repository reviews as
  a whole, and the fixed release fits under a narrow cutoff.
- **Move to setuptools 84.2.0.** It has no security reason of its own and
  would widen the cutoff beyond the fix.

## Verification

The pinned resolver in `ghcr.io/astral-sh/uv:0.12.9` produced the same lock
in two independent runs. The committed lock has SHA-256
`43e7c607591c8cc298ac82d538b895daf15a635027d4591827a79664eaf154af`. The
setuptools wheel is 819,380 bytes with SHA-256
`5231689c6ac8156cd155cfb98c3fd6fb252c3e7e9bd3d78b64d3c55f132624c9`, equal
to the PyPI record.

```bash
cd tooling
gofmt -l ./internal/clrsfixture
go vet ./...
go test ./internal/clrsfixture/... ./internal/clrscontext/... ./internal/experimentcli/...
```

`20w experiment reproduce-clrs-promise-wheel` built two identical Promise
wheels. Two image builds from the new
context produced byte-identical OCI archives of 870,902,272 bytes with
SHA-256 `c7297cbbd8728de46b771406117129f55aa45c04051cb5e5cd6d45fe94b37099`,
manifest `sha256:e40107a5b5ff17ba8fc882560730f24d226cf61fc0efc1d08074bf6f6e4b0c96`
and config `sha256:d116835f8f28a796c039f4c0221caad4ad3ef965066595e6dc01ce1412c031f3`.
`20w experiment check-clrs-sbom-bundle` accepted the pinned scan of that
image. With `CLRS_SBOM_BUNDLE` set to the new bundle,
`TestGeneratorSBOMBundleActualRetainedInput` passes; set to the 2026-10-22
bundle, it fails because the image binding differs.
