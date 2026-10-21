# 0114 — Lock pip in the CLRS generator

- **Status:** accepted
- **Date:** 2026-10-22
- **Decided by:** controller answer: bump pip to the newest release whose
  vendored certifi >= 2026.10.19; one PR (paraphrased). Recorded under
  [decision 0092](0092-exclude-the-clrs-generator-folder-from-update-proposals.md),
  which requires a reviewed re-resolution with its own decision record.
- **Authority:** `tooling/clrs-generator/lock-input.json`, its derived
  `pyproject.toml`, `uv.lock`, `wheelhouse.json`, `image-contract.json`,
  and the reviewed cutoff policy in `tooling/internal/clrsfixture`. No image
  admission, claim, principle or result status changes.
- **Related:** [0092](0092-exclude-the-clrs-generator-folder-from-update-proposals.md),
  [0100](0100-lift-the-urllib3-cutoff-in-the-clrs-generator.md),
  [0113](0113-lift-the-certifi-cutoff-in-the-clrs-generator.md)

## Context

Decision 0113 updated certifi to 2026.10.19 for
[PYSEC-2026-4320](https://osv.dev/vulnerability/PYSEC-2026-4320).
The base image `python:3.13.15-slim-bookworm` provisions pip 26.2.1 via
ensurepip when creating the virtual environment. pip 26.2.1 vendors certifi
2026.6.17 under `pip/_vendor`, which still carries the emSign root
certificates of the advisory.

pip 26.2.2 was uploaded on 2026-10-20 at 16:36:27 UTC. Its vendored copy of
certifi is 2026.10.19, resolving the advisory in pip's bundled distribution.

## Decision

1. Keep the global cutoff, urllib3 cutoff and certifi cutoff. Add supplemental
   requirement `pip==26.2.2` with reason `replaces the base image's ensurepip pip whose vendored certifi carries PYSEC-2026-4320`.
2. Add a reviewed per-package cutoff, `pip = 2026-10-21T00:00:00Z`, to the
   resolver input and the derived project file.
3. Re-resolve with the pinned uv 0.12.9 binary from the digest-pinned image
   and the existing lock, `uv lock --upgrade-package pip`. Only the pip package
   block is added; every other package block stays byte for byte.
4. The reviewed cutoff policy in `image_lock.go` accepts exactly certifi, pip
   and urllib3.
5. Select the pip 26.2.2 wheel, verify its size and SHA-256 against PyPI, and
   update the manifest and contract digest chains together.
6. The wheelhouse manifest includes `pip==26.2.2`, so the rendered
   `requirements.txt` installs it during image construction, upgrading the
   virtual environment's pip.
7. SBOM expectation tests update to classify pip as a locked runtime package
   rather than an unpinned extra top-level package.
8. Rebuild the candidate image from the new lock and move the retained SBOM
   bundle that CI checks to a new prerelease.

## Consequences

- pip advances from ensurepip's 26.2.1 to locked 26.2.2. The lock contains 63
  packages and 137 artifacts; the wheelhouse manifest contains 62 selected
  wheels. The selected wheelhouse bytes increase by 1,819,850 to 825,756,027.
- The virtual environment's pip vendors certifi 2026.10.19
  (`pip/_vendor/vendor.txt` in the locked wheel reads `certifi==2026.10.19`).
- The retained SBOM bundle that CI checks against the lock moves to the
  `clrs-sbom-bundle-2026-10-22` prerelease. Its inventory holds 218 package
  records: 62 locked runtime packages, no extra top-level Python package and
  156 other records. The `clrs-sbom-bundle-2026-10-21` prerelease stays
  published.
- The base image's own interpreter keeps pip 26.2.1 under
  `/usr/local/lib/python3.13/site-packages`, and the scanner still lists its
  vendored certifi 2026.6.17 from pip's bundled CycloneDX file. The generator
  runs from `/opt/venv`; that copy leaves the image only with a newer base
  image digest.
- Later uploads for other packages remain outside the resolution boundary.
- Dependency validation stays offline.

## Alternatives considered

- **Leave ensurepip pip 26.2.1 in place.** The image scanner would continue to
  flag pip's vendored certifi 2026.6.17.
- **Uninstall pip after installing requirements.** It changes the image
  layout further than a version lock and leaves the base image's copy in
  place as well.

## Verification

The pinned resolver in `ghcr.io/astral-sh/uv:0.12.9` produces the lock with
SHA-256
`cbac28b4acab15f07d722203ead7731ecb9a1f7e9f51c1754de0ca28a5b4cdba`. A
comparison with the previous lock shows only the options header and the added
pip block changed. The wheel is 1,819,850 bytes with SHA-256
`fd7f4dfa8190e014013b9f08f3e973f4e4c26ffd179a204895533a7254813a70`, equal
to the PyPI record.

```bash
cd tooling
gofmt -l ./internal/clrsfixture
go vet ./...
go test ./internal/clrsfixture/... ./internal/clrscontext/... ./internal/experimentcli/...
```

Two image builds from the rebuilt context produce identical OCI archives
(870,898,176 bytes, SHA-256
`c17930c019866b3fa107cbd9ecea7aada28b07e6efad6ac9e49a074d1177aa63`; manifest
`sha256:17c07efca134f9e85c8b0965807b0cd4403c3cea85c692aa1a83b16b97a0ad90`).
The pinned scan lists pip 26.2.2 in `/opt/venv` with its vendored certifi
2026.10.19. `TestGeneratorSBOMBundleActualRetainedInput` passes with the new
bundle and fails with the 2026-10-21 bundle on the image binding.
