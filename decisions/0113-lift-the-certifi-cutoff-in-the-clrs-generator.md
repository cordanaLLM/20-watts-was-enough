# 0113 — Lift the certifi cutoff in the CLRS generator

- **Status:** accepted
- **Date:** 2026-10-21
- **Decided by:** controller answer `fleet-certifi-pysec-2026-4320-20261021`:
  bump certifi to 2026.10.19 or later in every affected lock and regenerate
  each lock with the repository's own resolver, keeping its hashes
  (paraphrased). Recorded under
  [decision 0092](0092-exclude-the-clrs-generator-folder-from-update-proposals.md),
  which requires a reviewed re-resolution with its own decision record.
- **Authority:** `tooling/clrs-generator/lock-input.json`, its derived
  `pyproject.toml`, `uv.lock`, `wheelhouse.json`, `image-contract.json`,
  `sbom-bundle.json` and the reviewed cutoff policy in
  `tooling/internal/clrsfixture`. No image admission, claim, principle or
  result status changes.
- **Related:** [0092](0092-exclude-the-clrs-generator-folder-from-update-proposals.md),
  [0100](0100-lift-the-urllib3-cutoff-in-the-clrs-generator.md)

## Context

The reviewed generator lock contains certifi 2026.7.22. The advisory
[PYSEC-2026-4320](https://osv.dev/vulnerability/PYSEC-2026-4320) concerns
the emSign root certificates that certifi bundles and names 2026.10.19 as
the fixed release. Its wheel was uploaded on 2026-10-20 at 02:24:15 UTC,
after the global cutoff `2026-08-31T13:22:50Z` and the urllib3 cutoff of
decision 0100.

Dependabot reports no alert for this folder, so no update proposal arrives;
decision 0092 excludes the folder from those proposals in any case.

## Decision

1. Keep the global cutoff and the urllib3 cutoff. Add a second reviewed
   per-package cutoff, `certifi = 2026-10-21T00:00:00Z`, to the resolver
   input and the derived project file.
2. Re-resolve with the pinned uv 0.12.9 binary from the digest-pinned image
   and the existing lock, `uv lock --upgrade-package certifi`. Every other
   package block stays byte for byte; a change to another package stops this
   repair.
3. The reviewed cutoff policy in `image_lock.go` accepts exactly the certifi
   and urllib3 entries. The bounds of decision 0100, item 4, are unchanged.
4. Select the certifi 2026.10.19 wheel, verify its size and SHA-256 against
   PyPI, and update the manifest and contract digest chain together.
5. Rebuild the candidate image from the new lock and move the retained SBOM
   bundle that CI checks to a new prerelease.

## Consequences

- certifi advances from 2026.7.22 to 2026.10.19. The lock retains 62
  packages and 135 artifacts; the manifest retains 61 selected wheels. The
  selected wheel bytes fall by 519 to 823,936,177.
- Later uploads for every other package stay outside the resolution
  boundary.
- Dependency validation stays offline. Resolution and the single wheel
  download do not establish generator execution or image admission.
- The retained SBOM bundle that CI checks against the lock moves to the
  `clrs-sbom-bundle-2026-10-21` prerelease. The candidate image was rebuilt
  from the new lock, and its pinned scan reports the installed certifi
  2026.10.19. pip 26.2.1 still vendors certifi 2026.6.17 under
  `pip/_vendor`; the scanner lists that copy from pip's bundled CycloneDX
  file, not as an installed package. The `clrs-sbom-bundle-2026-10-16`
  prerelease stays published.

## Alternatives considered

- **A later global cutoff.** It would admit newer artifacts across the graph
  and widen the review beyond certifi.
- **Dismiss the advisory because runtime networking is disabled.** The image
  would keep the affected root store, and the repair would stay undone.

## Verification

Two runs of the pinned resolver with separate caches produce identical lock
bytes (SHA-256
`1f2a837d35260fb4bf095032a016c0ea9543b573b8ad83def7ae5378972ff7e4`). A
comparison with the previous lock shows only the options header and the
certifi block changed. The wheel is 136,464 bytes with SHA-256
`42d35340cc5b9ba78e818ddbff0c5b1c2b779de448a340fd1b989f5fa8670e1b`, equal
to the PyPI record.

```bash
cd tooling
gofmt -l ./internal/clrsfixture
go vet ./...
go test ./internal/clrsfixture/...
```

Two image builds from the rebuilt context produce identical OCI archives
(869,248,512 bytes, SHA-256
`a69bdcd96b1a8ec548eee046e541e130a55092cfd09db0a5f1bf70a48065142e`).
`TestGeneratorSBOMBundleActualRetainedInput` passes with the new bundle and
fails with the 2026-10-16 bundle on the certifi mismatch, which shows that
the test reads the installed version. A rescan of the 2026-10-16 image with
the same scanner reproduces its published SBOM except for the creation time
and the random document namespace.
