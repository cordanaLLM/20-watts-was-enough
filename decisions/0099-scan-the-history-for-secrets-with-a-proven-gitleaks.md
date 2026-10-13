# 0099 — Scan the history for secrets with a proven gitleaks

- **Status:** accepted
- **Date:** 2026-10-13
- **Decided by:** the fleet order of 2026-10-13 to move every engine pin to
  `3bbde0734`, recorded as `fleet-engine-pin-sweep-20261013` (paraphrased):
  each declared scanner gets a pinned CI job that fails closed and is shown
  failing on a planted case, or keeps a dated exception.
- **Authority:** `.github/workflows/ci.yml`, `.gitleaksignore`,
  `tooling/internal/secretscan/`, `tooling/tools/go.mod`, the
  `declared-linters` entries in `.standards.yaml` and the required contexts in
  `.github/rulesets/main.json`. No claim, principle or status changes.
- **Extends:** [0095](0095-pin-the-praetor-engine-and-refresh-the-adoption.md),
  [0096](0096-tighten-the-live-main-ruleset-to-the-rendered-policy.md)

## Context

From engine commit `3bbde0734` the audit fails when a scanner that the
declared standards profile names runs in no workflow. The profile of this
repository names three: gitleaks, from the `security:high` facet and the
`planning-artifacts` profile; semgrep, from the `agent:sandboxed` facet; and
trivy, from `security:high`. No workflow ran any of them. `.gitleaks.toml`
has extended the gitleaks defaults since the public release baseline, but
nothing used it.

A scanner step that reports nothing proves nothing on its own: a wrong
path, an empty checkout or a broken rule set gives the same clean exit as a
clean history.

## Decision

1. CI runs a `Secret scan` job on every pull request to `main` and every
   push to `main`. Gitleaks v8.30.1 is pinned in `tooling/tools/go.mod` and
   runs as `go tool gitleaks`, so `go.sum` fixes its bytes.
2. The job first runs `20w security gitleaks-canary`. The command commits a
   GitHub personal access token shape, built at run time from a hash, to a
   temporary repository and scans it with the history-scan arguments. It
   accepts only exit status 3, requested for findings so that it differs
   from gitleaks' own error status, and a JSON report with exactly one
   `github-pat` finding in the planted file. The repository's ignore list and
   any configuration named in the environment are kept away from this scan.
3. The job then scans every commit reachable from `HEAD` from a full-depth
   checkout, with the rules of `.gitleaks.toml`. Any finding, scanner error or
   timeout fails it. Inline `gitleaks:allow` comments are ignored.
4. `.gitleaksignore` lists the four findings in existing history that are not
   credentials, each by its exact fingerprint (commit, file, rule, line) and
   a reason: a workflow file name after the word "api", the Ed25519 public
   root key of fixture 026 in two files, and one sentence of an audit. A new
   finding of the same text in another commit or line is not covered.
5. `CI success` needs the job and requires its success in every mode.
   `.github/rulesets/main.json` requires the `Secret scan` context, and the
   live ruleset gains it once `main` reports the job.
6. Semgrep and trivy stay dated exceptions until 2027-01-11. CodeQL already
   runs the security-extended and security-and-quality queries on the
   JavaScript, TypeScript and Go code; a semgrep job needs a pinned rule set
   and its own planted finding. Dependency review and govulncheck cover the
   dependency graph, but no job scans the container images; a trivy job needs
   a pinned vulnerability database source and its own planted finding. Each
   is a unit of its own.

## Consequences

- A secret committed on any branch fails the pull request that carries it,
  and the full scan of the history takes about four seconds on the
  workstation for 357 commits.
- Removing a secret from the tip does not clear the job; the commit stays in
  the history it scans. The way out is a rewrite of that branch before merge,
  or, for a false positive, one more fingerprint with its reason.
- A gitleaks update moves the `tool` pin and must keep the canary passing.
- `npm run validate:policy` refuses the job when it loses the canary, a
  full-depth checkout, the exit status, the timeout bound or the read-only
  token, or when `CI success` stops requiring it.

## Alternatives considered

- **The upstream gitleaks action.** It downloads a release outside the Go
  module graph, so `go.sum` would not fix the scanner's bytes, and a planted
  proof would need a second copy of the scanner.
- **Scan only the commits of the pull request.** Cheaper, but a secret that
  arrived before this job would never be seen, and the full scan is short.
- **Inline `gitleaks:allow` comments for the four findings.** They would
  change four tracked files, two of them fixture contracts, and any later
  line with the comment would pass unseen.

## Verification and disclosure

All runs used one workstation on 2026-10-13.

| Run | Outcome |
| --- | --- |
| `20w security gitleaks-canary` | pass; one `github-pat` finding in `settings.env` |
| the canary with the token cut to eight hex characters | refused: gitleaks exited 0, want 3 |
| history scan of the branch with `.gitleaksignore` | 357 commits, no leaks, exit 0 |
| the same scan on a clone with one more commit adding a token | one leak, exit 1 |
| the same clone without that commit | no leaks, exit 0 |
| `go test ./internal/secretscan` | pass; ten refused scanner results |
| new policy test against the previous validator | fails |

Not checked: the job on hosted runners, which the CI run of the pull request
shows.

AI assistance made the change and wrote this record. The runs above verified
it; the scanner rule comes from the order cited at the top.
