# Repository-rule crosswalk

This ledger records which recurring conventions from the maintainer's other
repositories were adopted, adapted, staged, or rejected here. It prevents a
future maintainer or agent from copying a language- or product-specific setup
without checking whether its invariant belongs in this research repository.

## Reference set

The comparison used the public repository structures and contracts in:

- [`golusoris/golusoris`](https://github.com/golusoris/golusoris);
- [`golusoris/sveltesentio`](https://github.com/golusoris/sveltesentio);
- [`golusoris/goenvoy`](https://github.com/golusoris/goenvoy); and
- [`golusoris/.github`](https://github.com/golusoris/.github).

Those repositories are examples, not authorities for this project. The
deduplicated local authority is [`docs/principles.md`](principles.md).

## Repeated pattern extracted

Across the reference repositories, the stable pattern is:

1. one root engineering contract;
2. small nested contracts at real module or authority boundaries;
3. a narrow set of hard automated gates;
4. explicit contribution, ownership, governance, security, support, and
   conduct surfaces;
5. immutable action references and least-privilege workflows;
6. conventional change history and append-only decisions; and
7. automation that reflects the repository's language and artifacts rather
   than a generic tool checklist.

The current repository already had stronger rules for scientific evidence,
claim status, conventional nulls, experiment authority, units, source
provenance, split licensing, and EU/German applicability. Those were retained
and integrated rather than replaced.

## Adoption matrix

| Reference convention | Local decision | Concrete surface |
| --- | --- | --- |
| Root operational contract | **adopted** | [`AGENTS.md`](../AGENTS.md) |
| Nested per-module contracts | **adapted** to real trust boundaries only | `research/`, `experiments/`, `experiments/workstation/`, `app/`, `scripts/`, `.github/` |
| NASA/JPL Power of Ten | **adapted** by preserved invariant | [`docs/principles.md`](principles.md), P10-1–P10-10 |
| Zero-warning merge floor | **adopted** | `npm run check`, PR CI, Pages validation |
| Go test, vet and race gates | **adapted** to the portable `20w` module | `tooling/go.mod`, `go test -race ./...`, `go vet ./...`, CodeQL |
| Global numerical coverage quota | **not adopted** | risk- and authority-based coverage; thresholds require a measured decision |
| Conventional Commits | **adopted** | contribution contract and PR-title CI |
| Semantic Versioning | **adopted for tagged snapshots** | release contract; no npm publication |
| Append-only ADRs | **already present and retained** | [`decisions/`](../decisions/README.md) |
| C4/PlantUML hierarchy | **not copied** | current Mermaid and mathematical-figure sources remain canonical |
| CODEOWNERS and PR template | **adopted and research-adapted** | `.github/CODEOWNERS`, `.github/PULL_REQUEST_TEMPLATE.md` |
| Generic bug/feature issues | **replaced** | evidence, mechanism, experiment, and presentation issue forms |
| EditorConfig | **adopted** | `.editorconfig` |
| Pinned GitHub Actions | **adopted** | all workflows use full commit SHAs |
| Renovate automerge | **staged** | config present; automerge remains off until required checks and repository rules are verified |
| Dependency licence deny-list | **rejected** | dependencies are reviewed against the actual EUPL/CC BY-SA boundary, not a copied GPL/AGPL ban |
| GoReleaser/OCI releases | **adapted without GoReleaser** | a small in-repository Go builder, an exercised static Linux `amd64` tooling image, the `20w-linux-amd64` native convenience file, and one scoped image per released experiment; further targets remain withheld until their release paths execute |
| Tag-bound release packaging and provenance | **adopted** | exact-version release workflow, untagged digest admission before container-tag attachment, deterministic SPDX SBOM, checksums, notices, PDF manifest, and GitHub build provenance |
| MkDocs workflow | **not applicable** | the existing Vite Pages portal and book are the maintained renderers |
| Auto-assignment and stale bots | **not adopted** | no value with one maintainer and long-running evidence work |
| US frameworks as normative defaults | **rejected** | EU/Germany applicability remains controlling; foreign material is comparative unless applicable |
| Generated-sounding prose conventions | **replaced with a project-local skill and narrow tripwire** | `.agents/skills/research-writing/`, `npm run check:prose` |
| University-specific research codes | **deduplicated by source authority and recurring control** | [`research/research-integrity-baseline.md`](../research/research-integrity-baseline.md); ALLEA/EU/DFG govern their actual scopes, institutional policies remain implementation examples |

## Enforcement now

The repository now treats the following as executable gates:

- strict TypeScript checking;
- ESLint, accessibility, React, and framework linting;
- parsed YAML and policy-surface validation;
- pinned Action digests, explicit workflow permissions, and job timeouts;
- hash-enforced Python build dependencies, exact npm declarations, and the npm
  lockfile;
- documentation links, source-publication boundaries, evidence coverage,
  taxonomies, mathematics, workstation contracts, readiness, site builds, and
  PDF freshness;
- required research-integrity and writing-policy surfaces plus the
  canonical-Markdown prose tripwire;
- high-severity dependency advisories in CI;
- CodeQL analysis plus a non-blocking supply-chain posture audit; and
- exact-version tagged release packaging with deterministic assets, checksums,
  licence material, and provenance attestation.

The governance documents do not claim that a GitHub repository setting is
active. Settings are recorded as active only after an API check.

Host controls verified through the GitHub API on
`cordanaLLM/20-watts-was-enough` on 2026-09-28 are:

- public repository visibility;
- squash and rebase merges enabled, merge commits disabled, auto-merge and
  post-merge branch deletion enabled;
- the unused wiki and Projects surfaces disabled;
- private vulnerability reporting enabled;
- secret scanning enabled;
- push protection enabled;
- workflow-token permissions read-only by default, without pull-request review
  approval;
- immutable full-SHA pinning required for every GitHub Action; and
- active immutable release-tag ruleset `21727474` for `refs/tags/v*`, with tag
  update and deletion blocked and no bypass actor.

The repository homepage field reads `http://www.cordana.dev/`. Cloudflare
answers that address with a 301 redirect to `https://www.cordana.dev/`, so the
link works, but the field has not yet been set to the HTTPS address.

The `main` ruleset was read back through the API on 2026-09-28. Active ruleset
`21746706` was last changed on 2026-09-04 and carried over unchanged in the
transfer. It has no bypass actor, requires a pull request, the strict
`CI success` and `PR title` checks, resolved review threads, linear history,
and CodeQL with no high-or-higher security alert or analysis error. Squash and
rebase are the admitted merge methods. The approval count remains zero because
the repository has one human maintainer; GitHub's [ruleset
guidance](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets)
confirms that zero is a supported setting. A second-human approval gate should
be added only when a second reviewer can actually serve it.

The advanced CodeQL workflow publishes separate JavaScript/TypeScript and Go
results for every protected pull-request and `main` commit. Test lanes remain
impact-scoped, but required code-scanning evidence is not skipped by file type;
otherwise the ruleset correctly treats the missing language result as a merge
blocker.

The `cordana.dev` Cloudflare zone has **Always Use HTTPS** enabled. A live check
on 2026-08-30 verified the exact root redirect and successful HTTPS response;
the Pages workflow now repeats that bounded public check after deployment.
[Decision 0047](../decisions/0047-keep-cloudflare-as-the-public-pages-tls-authority.md)
keeps Cloudflare as the truthful public enforcement boundary and records the
current automatic **Full** origin-mode limitation separately. GitHub's Pages
API still lacks its own origin certificate for the proxied hostname.

## Main protection

The active `main` ruleset blocks branch deletion and non-fast-forward updates,
requires the exact strict `CI success` and `PR title` contexts and a pull
request, and requires CodeQL to report no high-or-higher security alert or
analysis error. No actor, including the maintainer, can bypass it. The GitHub
rulesets API is authoritative for its current activation state. The Praetor
scaffold in [`.github/rulesets/main.json`](../.github/rulesets/main.json) is
not this ruleset and is not applied;
[decision 0085](../decisions/0085-keep-the-live-main-ruleset-across-the-transfer.md)
records why.

## Staged controls and exit conditions

| Control | Why staged | Promotion condition |
| --- | --- | --- |
| Zero-debt P10-4 thresholds | The measured baseline contains 195 findings across 294 audited source files. A CI no-regression gate is active now. | Reduce the tracked file/rule groups to zero; the baseline may shrink but cannot grow or worsen. |
| Broader property, fuzz, mutation, and hostile-input testing | The strict JSON parser now has a bounded Go fuzz target in required CI; wider adoption remains staged. | Extend it to the next parser or promotion boundary only when the target has a concrete invariant and the campaign remains resource-bounded. |
| Automated dependency merge | Deliberately disabled; branch protection alone does not prove an update safe. | Consider only after repeated dependency PRs demonstrate that the full gate and review policy catch relevant drift. |
| REUSE lint | Split licences, `sources/`, restricted taxonomy data, and generated mixed works cannot be represented by a copied catch-all annotation. | Complete a file-level licence inventory with truthful third-party and `LicenseRef` mappings before declaring REUSE conformance. |
| Dedicated Gitleaks CI | Native GitHub secret scanning and push protection are active (API check 2026-09-28); an unverified download pipeline would reduce supply-chain quality. | Use a full-SHA action that works for this repository or a checksum-pinned binary and retain only exact-value baseline exceptions. |

## Deliberate non-goals

The contract does not import Kubernetes, HTTP, database, broad Go framework,
Claude hook, or package-release conventions before the repository has the
corresponding architecture. Its OCI and Go rules cover only the current
tooling and experiment distribution boundaries. It also does not create a
second roadmap, ADR tree, prose store, or generated source of truth.
