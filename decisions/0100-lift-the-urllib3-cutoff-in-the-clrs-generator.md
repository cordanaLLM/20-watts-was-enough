# 0100 — Lift the urllib3 cutoff in the CLRS generator

- **Status:** accepted
- **Date:** 2026-10-16
- **Decided by:** controller answer `20-watts-urllib3-clrs-generator`, under
  [decision 0092](0092-exclude-the-clrs-generator-folder-from-update-proposals.md):
  re-resolve urllib3 alone with a later package cutoff and preserve the global
  cutoff and every other package's version and artifacts (paraphrased).
- **Authority:** `tooling/clrs-generator/lock-input.json`, its derived
  `pyproject.toml`, `uv.lock`, `wheelhouse.json`, `image-contract.json` and the
  resolver and artifact checks in `tooling/internal/clrsfixture`. No image
  admission, claim, principle or result status changes.
- **Related:** [0071](0071-lock-the-clrs-generator-wheel-selection.md),
  [0092](0092-exclude-the-clrs-generator-folder-from-update-proposals.md)

## Context

The reviewed generator lock contains urllib3 2.7.0. Three GitHub advisories
identify 2.8.0 as the patched version:
[GHSA-8988-9cw3-xx77](https://github.com/advisories/GHSA-8988-9cw3-xx77),
[GHSA-vxq7-64xx-v4gw](https://github.com/advisories/GHSA-vxq7-64xx-v4gw) and
[GHSA-gh4c-6fx4-qh6g](https://github.com/advisories/GHSA-gh4c-6fx4-qh6g).
The 2.8.0 wheel was uploaded on 2026-09-15 at 19:29:34.577 UTC, after the
reviewed global cutoff of `2026-08-31T13:22:50Z`.

The [runtime contract](../tooling/clrs-generator/README.md) requires no
network, and the image foundation remains blocked with `NO_RESULT` authority.
Those boundaries constrain execution; they do not repair the dependency lock
or justify dismissing its alerts. Decision 0092 requires a reviewed
re-resolution with a decision record for a dependency change in this folder.

## Decision

1. Retain the global cutoff `2026-08-31T13:22:50Z`. Add the sole reviewed
   per-package cutoff, `urllib3 = 2026-09-16T00:00:00Z`, to the resolver input.
2. Use the pinned uv 0.12.9 image and existing lock with
   `--upgrade-package urllib3`. Resolve against PyPI only, with a 20-minute
   deadline. Preserve every other package block byte for byte; a change to
   another package stops this repair.
3. Derive `pyproject.toml` through the existing Go renderer. Record the
   override as `[tool.uv.exclude-newer-package]` in the project and
   `[options.exclude-newer-package]` in the resolver's lock output.
4. Bound the cutoff map to eight canonical package names with RFC3339 dates
   strictly after the global cutoff. The reviewed input accepts exactly the
   urllib3 entry above. Validate each artifact against its package's cutoff
   when present, otherwise against the global cutoff; reject overrides for
   packages absent from the lock.
5. Select urllib3 2.8.0's wheel from the new lock, verify its downloaded size
   and SHA-256, and update the manifest and contract digest chain together.
   Preserve the other wheel selections and all image-admission blockers.

## Consequences

- urllib3 advances from 2.7.0 to 2.8.0. The lock retains 62 packages and 135
  artifacts, and the manifest retains 61 selected wheels. The selected wheel
  bytes increase by 4,630 to 823,936,696.
- Later uploads for other packages remain outside the resolution boundary.
  Another cutoff exception requires its own reviewed input and decision.
- The lockfile repair can resolve the three dependency alerts when integrated
  and processed by GitHub. No alert is dismissed, and this local change makes
  no claim that their remote state has changed.
- Dependency validation remains offline. Resolution and the single wheel
  download do not establish generator execution or image admission.

## Alternatives considered

- **Full re-resolution with a later global cutoff.** This would admit newer
  artifacts throughout the graph and expand the review beyond urllib3.
- **Dismiss the alerts because runtime networking is disabled.** This would
  retain the vulnerable version and leave the dependency repair undone.

## Verification

Two isolated runs of the pinned resolver produce identical lock bytes. A
comparison with the original lock shows only the options header and urllib3
package block changed. The wheel download is 135,717 bytes and has SHA-256
`0cf3cae568d36aa9576b28dfb35f11328f1cb974ca7647d9475ebb86c75ac6e3`.

`image_lock_test.go` checks the reviewed override, canonical names, dates,
unknown and extra entries, and the eight-entry limit. `image_dependency_test.go`
checks wheels and sdists immediately before, at and after both cutoffs and
rejects lock-header drift. The foundation tests bind the updated digest chain
and preserve blocked image admission. Local checks use `GOFLAGS=-p=4`:

```bash
cd tooling
gofmt -l ./internal/clrsfixture
go vet ./...
go test -p 4 ./internal/clrsfixture/...
```

Private command output, resolver identities, package-block comparisons and
wheel verification are retained in `.workingdir/evidence/urllib3/resolve.md`.
