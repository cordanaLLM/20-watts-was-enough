# 0085 — Keep the live main ruleset across the transfer

- **Status:** accepted
- **Date:** 2026-09-28
- **Partly supersedes:** [0083](0083-transfer-the-repository-to-cordanallm.md)
  post-transfer step 5, only where it re-applies `.github/rulesets/main.json`
- **Extends:** [0083](0083-transfer-the-repository-to-cordanallm.md) with the
  post-transfer verification it left open
- **Authority:** repository host-settings record; no change to research
  authority, claim status or acceptance criteria

## Context

The repository moved to `cordanaLLM/20-watts-was-enough` on 2026-09-16.
[Decision 0083](0083-transfer-the-repository-to-cordanallm.md) prepared the
move, listed six steps for afterwards and required each to be verified against
the moved repository. Until now nothing recorded which of them had happened.

Step 5 asked for the branch ruleset to be re-applied from
`.github/rulesets/main.json`. That file is the scaffold written by the Praetor
adoption, which [decision 0082](0082-adopt-praetor-repository-governance.md)
already says is not evidence of remote state. It also does not describe the
ruleset that protects `main`:

| Field | `.github/rulesets/main.json` | Live ruleset `21746706` |
| --- | --- | --- |
| Branches | `main`, `lts-*` | `main` |
| Approvals, code-owner review, stale-review dismissal | 1, on, on | 0, off, off |
| Required checks | `CI impact plan`, `JavaScript and TypeScript analysis`, `Go analysis` | `CI success`, `PR title` |
| CodeQL code-scanning rule | absent | high-or-higher alerts and analysis errors block |
| Merge methods | not set | squash, rebase |

Applying the scaffold would demand an approval that the only maintainer cannot
give to their own pull request, and it would drop the CodeQL rule.
[`docs/repository-rule-crosswalk.md`](../docs/repository-rule-crosswalk.md#main-protection)
explains why the approval count is zero. Rulesets belong to the repository and
survived the transfer, so there was nothing to re-apply.

## Decision

Step 5 of decision 0083 is replaced by: read ruleset `21746706` back through
the rulesets API, confirm that it still matches the crosswalk, and confirm that
`CODEOWNERS` resolves. The live ruleset, as the crosswalk records it, protects
`main`. `.github/rulesets/main.json` remains a Praetor scaffold that is neither
applied nor cited as the description of `main`. Before anyone applies it, the
file has to be brought in line with the live ruleset, either here or in the
Praetor template.

Container definitions that no digest contract pins follow the repository. The
`org.opencontainers.image.source` label in `tooling/Dockerfile`,
`tooling/clrs-specialist/Dockerfile`,
`experiments/workstation/Dockerfile.node-artifact` and
`experiments/workstation/fixture-019/Dockerfile` now names
`cordanaLLM/20-watts-was-enough`. Before this change, CI smoke builds and local
builds carried the previous owner; release builds were already correct, because
`release.yml` overrides the label from `github.repository`. No lock, contract
or book-support inventory records the bytes of these four files. The PDF-tools
and CLRS generator contracts and the `io.github.lusoris.*` label keys stay as
decision 0083 left them.

## Post-transfer verification

The reads below ran on 2026-09-28 against `cordanaLLM/20-watts-was-enough`
through the GitHub REST API unless the row says otherwise.

| 0083 step | Read | Result | State |
| --- | --- | --- | --- |
| 1. Package permissions | `GET orgs/cordanaLLM/packages?package_type=container` | `[]`; the organization's package-creation setting is not exposed through REST | open until the first release |
| 2. Public packages | the same read, plus `GET users/lusoris/packages?package_type=container` | no organization packages yet; `20-watts-was-enough-20w`, `-fixture-007` and `-fixture-019` under `lusoris` are public and no longer linked to a repository | open until the first release |
| 3. Pages and domain | `GET repos/…/pages` | `build_type` `workflow`, `cname` `www.cordana.dev`, `https_enforced` `false` as [decision 0047](0047-keep-cloudflare-as-the-public-pages-tls-authority.md) intends, `protected_domain_state` `null` | Pages done; domain verification is not visible through the API |
| 4. Immutable releases | `GET repos/…/immutable-releases` | `{"enabled":true,"enforced_by_owner":false}` | done |
| 5. Ruleset and `CODEOWNERS` | `GET repos/…/rulesets/21746706`, `GET repos/…/codeowners/errors` | ruleset active, last changed 2026-09-04; `errors` `[]`; `lusoris` holds admin on the repository and in the organization | done as amended above |
| 6. Clone origins | `git remote get-url origin` in the maintainer's two local clones | `https://github.com/cordanaLLM/20-watts-was-enough`, one clone with a `.git` suffix | done |

Secret scanning and push protection were `disabled` in the first read on
2026-09-28, while the crosswalk still reported both as enabled from a
2026-08-28 read on the previous owner. The organization does not enable either
for new repositories. Both were enabled later that day, and a second read of
`security_and_analysis` returned `enabled` for each. Non-provider patterns and
validity checks remain `disabled`. These reads do not show when the two
settings were switched off.

Other results from the same day:

- `https://github.com/lusoris/20-watts-was-enough` answers with a 301 redirect
  to the new owner, while `https://lusoris.github.io/20-watts-was-enough/`
  returns 404, as decision 0083 expected;
- OpenSSF Scorecard lists `github.com/cordanaLLM/20-watts-was-enough`, last
  scored on 2026-09-28 at commit `842816c` with an aggregate score of 7; and
- the homepage field reads `http://www.cordana.dev/`, which Cloudflare
  redirects to `https://www.cordana.dev/`.

`v0.3.0` (2026-08-30, immutable) is still the latest release. Steps 1 and 2 can
only be verified by the first tag pushed after the transfer. The `v0.3.0`
release body names the three `ghcr.io/lusoris/...` images, so those packages
must stay public and must not be deleted.

## Open maintainer actions

These need owner or organization rights and are not performed by this record:

- set the repository homepage to `https://www.cordana.dev/`;
- verify `cordana.dev` as an organization domain in the GitHub settings UI;
- install the Renovate app, since `GET orgs/cordanaLLM/installations` reports
  no installation and `renovate.json` is inert until then;
- after the first release, set the new organization packages to Public and
  rerun that tag, as 0083 step 2 describes;
- replace links that still name the previous owner in other repositories; and
- align `.github/rulesets/main.json` with the live ruleset, here or in the
  Praetor template.

Claude Code ran the API reads, drafted this record and edited the four labels
and the governance documents under maintainer direction. Those are engineering
checks, not independent human review, and no scientific claim, experiment or
acceptance criterion changes.
