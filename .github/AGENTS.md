# GitHub automation rules

These instructions extend repository-level [`AGENTS.md`](../AGENTS.md) for
files under `.github/`.

- Pin every external GitHub Action to full immutable commit SHA and retain a
  human-readable version comment. Floating tags and branches are not accepted.
- Keep workflow-level permissions read-only. Grant write or OIDC permissions
  only to individual job that requires them.
- Set explicit job timeouts and bounded concurrency. Pull-request validation
  may cancel stale runs; in-progress Pages deployment must not be cancelled.
- Run every workflow job in this public repository on GitHub-hosted
  `ubuntu-latest`. Do not request self-hosted label or select runner through
  dynamic expression. Local compute requires separately reviewed,
  infrastructure-enforced trust and isolation boundary under decision 0056.
- Use `actions/checkout` with `persist-credentials: false` unless reviewed
  step must push to repository.
- Run JavaScript workflows on exact Node 26 pin. Install npm 12 only from
  repository's URL-, size- and SHA-256-bound archive before checking its
  version, then use `npm ci --no-audit` with `package-lock.json` as authority.
  Run one explicit, enforcing lockfile audit in each full CI or release gate;
  matrix and publication jobs must not multiply registry audit traffic. Run Go
  tooling with exact version declared by `tooling/go.mod`.
- Required CI and security gates fail closed. Do not add `continue-on-error` to
  required check or weaken existing validator to make workflow green.
- Never execute or check out pull-request code from `pull_request_target`
  workflow. Automation using that event may operate only on trusted metadata
  and tools checked out from `refs/heads/main`.
- Preserve Pages build/deploy separation: build job stays read-only;
  only deploy job receives `pages: write` and `id-token: write`.
- Release workflows validate and package existing exact tag in read-only
  job. Only final publication job receives `contents: write`,
  `id-token: write`, and `attestations: write`; checkout never persists those
  credentials.
- Research release renders its tag-bound book from exact committed
  source, then publishes that PDF with committed licence material, locked-
  graph SPDX SBOM, sorted checksums, exact changelog notes, and provenance
  attestations. It never publishes to npm or claims SLSA level.
- Automatic tag runs never overwrite existing release. Manual rebuild may
  update only exact existing tag after repeating all validation gates.
- Treat repository settings as external state. Verify branch rules, Actions
  permissions, environments, and security features before documenting them as
  active.
- `.github/labels.json`, `.github/milestones.json`, and
  `.github/issue-milestones.json` are canonical operational metadata
  manifests. Trusted main-branch workflow may create or repair their
  marked objects and mapped issue assignments, but it does not delete unmanaged
  labels or milestones. Pull-request metadata may project only from one
  explicit managed issue reference under decision 0057; missing or ambiguous
  references remain unchanged. Milestone progress reflects associated issues
  and pull requests; it never promotes scientific evidence.
- Mapped open issue carries exactly one active managed status. Closing it
  removes `status:needs-triage`, `status:blocked`, `status:in-progress`, and
  `status:waiting-on-author`; existing `status:wontfix` remains as an
  explicit maintainer decision. Reopening replaces every managed status with
  `status:needs-triage`. Ordinary drift repair also restores
  `status:needs-triage` when open mapped issue has no active status, and
  removes stale `status:wontfix` while retaining one existing active status.
  Multiple active statuses remain ambiguity and fail closed. Preserve all
  non-status labels and never infer `status:wontfix` from close event
  itself.
- Pull-request merge removes every managed status. Unmerged close removes
  active statuses but preserves existing `status:wontfix`; neither path
  invents it or changes another label or milestone. Reopen reruns one
  linked issue's full projection. Closed-event cleanup verifies GitHub's merge
  state directly, skips path labeling and refuses ambiguous issue references or
  unknown and duplicate `status:*` identities.
- Full metadata repair uses separately bounded queries for five managed
  status labels and for open pull requests. Open scan admits only one
  explicit mapped-issue reference, so it can recover missed reopen with no
  managed status while reusing same projection. Closed pull request with
  only unknown status or open pull request without one mapped reference
  still needs its trusted event or explicit command.
