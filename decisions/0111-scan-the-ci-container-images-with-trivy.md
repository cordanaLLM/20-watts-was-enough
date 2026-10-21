# 0111 — Scan the CI container images with Trivy

- **Status:** accepted
- **Date:** 2026-10-18
- **Related:** `.standards.yaml` `declared-linters` exception for `trivy`
  (entered 2026-10-13, removed by this decision)

## Context

The `security:high` facet in `.standards.yaml` declares Trivy. No workflow
ran it, so a dated `declared-linters` exception recorded the gap: dependency
review and govulncheck cover the dependency graph, but nothing scanned the
container images.

The `container-smoke` job in `.github/workflows/ci.yml` builds four images:
`20w-tooling`, `20w-clrs-shakedown`, `20w-fixture-007` and `20w-fixture-019`.
Trivy 0.76.0, run locally on 2026-10-18 with
`--scanners vuln --severity HIGH,CRITICAL --ignore-unfixed`, measured:

| Image | Findings | Source |
| --- | --- | --- |
| `20w-tooling`, `20w-clrs-shakedown` | 0 | static Go binaries on `scratch` |
| `20w-fixture-007` | 3 | `brace-expansion` and `undici` inside the base image's npm |
| `20w-fixture-019` | 4 | `msgpack`, `setuptools` and `urllib3` vendored by pip |

The Debian packages and the repository's own image closure had no finding.
Neither image uses its package manager at run time: Fixture 007 starts
`node`, and Fixture 019 needs pip only to install the hashed numpy wheel
during the build.

## Decision

1. The Fixture 007 image removes npm and npx after its runtime check. The
   Fixture 019 image uninstalls pip after the numpy install.
2. `container-smoke` installs Trivy 0.76.0 from the upstream release archive
   and checks it against a SHA-256 written in the workflow.
3. Before the scan, the job builds a root file system that contains only
   lodash 4.17.15 and requires Trivy to exit with code 7 on it. Findings use
   exit code 7 and scanner errors exit 1, so a missing database cannot pass
   as a clean result. The database source is named explicitly:
   `mirror.gcr.io/aquasec/trivy-db:2`, then `ghcr.io/aquasecurity/trivy-db:2`.
4. The job then scans each of the four images and fails on any HIGH or
   CRITICAL advisory that has a fixed version.
5. The `declared-linters` exception for Trivy is removed.

## Consequences

- With both package managers gone, all four images scan clean. A new
  advisory with a fix in a base image or a packaged dependency turns the
  job red until the pin moves; Renovate's base-image updates are the
  expected path.
- Advisories without a fixed version do not fail the job. They stay visible
  in the scan output.
- The vulnerability database is not pinned to one snapshot, so the same
  commit can turn red on a later run when a new advisory is published. This
  is intended: the scan answers whether the image is affected today.
- The Fixture 019 and Fixture 007 images can no longer install packages at
  run time. No runner, smoke path or release step did.
