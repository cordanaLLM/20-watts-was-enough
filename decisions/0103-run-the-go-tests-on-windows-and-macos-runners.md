# 0103 — Run the Go tests on Windows and macOS runners

- **Status:** accepted
- **Date:** 2026-10-16
- **Decided by:** maintainer; issue #248 sets the acceptance criteria.
- **Authority:** `.github/workflows/ci.yml`,
  `scripts/validate-engineering-policy.mjs`, and
  `scripts/lib/portable-operations.mjs`.
- **Related:** [0042](0042-retire-the-host-specific-fixture-012-acquisition-lane.md),
  [0088](0088-impact-scope-ci-and-local-validation.md)

## Context

The Go tooling module carries platform-specific code: the Windows Job Object
and darwin process-tree containment in `tooling/internal/workstationrunner/`,
the Windows process check behind the book PDF lock recovery in
`tooling/internal/pdfrender/`, and Windows path handling in
`tooling/internal/repositorymanifest/`. Every CI job ran on `ubuntu-26.04`.
The Go lanes type-check the Windows and macOS builds with `go vet`, so a type
error fails CI, but no test executed that code on its own platform.

Two rules blocked a native lane. The public-repository runner policy admitted
only `ubuntu-26.04`, and the portable-workflow rule refused any Windows runner.
The second rule arrived with decision 0042, which retired a host-specific
shell and C# acquisition lane. Clause 3 of that decision requires each admitted
platform to test its own containment primitives behind one Go command, and a
Linux-only test run cannot satisfy that clause for Windows or macOS.

## Decision

1. CI runs `go -C tooling test ./...` in two further jobs: `lane-go-windows` on
   `windows-2025` and `lane-go-macos` on `macos-26`. Both labels are
   GitHub-hosted images listed in `actions/runner-images` (checked
   2026-10-16).
2. Both jobs run for every full plan and for every impact plan that selects
   Go. A full plan can be chosen for a pull request that also changes Go, so
   an impact-only condition would let platform code land untested.
   `ci-success` requires both jobs to succeed in a full plan and to match the
   Go selector in an impact plan.
3. The runner policy maps each of the two job names to its single runner
   label. Any other job still requires `ubuntu-26.04`, and a different label
   on either job fails validation.
4. The Windows-runner ban remains. Its only exception is a job named
   `lane-go-windows` on exactly `windows-2025` without a matrix. Its steps
   remain under the existing PowerShell and `cmd` bans and use `bash`.
5. The engineering policy requires each native lane to run the Go test
   command unconditionally, with failure not allowed. A lane reduced to `vet`,
   a conditional step, or an allowed failure is refused.

## Consequences

- Behaviour faults in the Windows and macOS code paths now fail CI instead
  of passing as type-correct code.
- Each Go change uses one Windows and one macOS runner for up to
  20 minutes each, on the public-repository allowance.
- Tests that need Linux-only inputs, such as the retained CLRS inputs or
  Docker, continue to run in the Linux lane only. The native lanes do not set
  those inputs.
- Fixture 012 still has no physical acquisition lane. This decision admits
  test platforms for the Go tooling; it does not admit a physical runner.

## Verification

`scripts/engineering-policy.test.mjs` covers the runner map, the single
Windows exemption, the unconditional test step, both job conditions and the
`ci-success` state vector in full and impact plans, with negative cases for
each. A planted test that fails only on Windows and one that fails only on
macOS each turned their job red on the pull request before removal.

## Supersession

Supersede this record if a platform is dropped from the tooling's supported
set, if the native lanes move to another runner family, or if the physical
Fixture 012 lane needs its own platform admission.
