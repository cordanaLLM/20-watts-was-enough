# Glossary

This page explains the project's own vocabulary in plain terms. Each entry
links to the file that defines or enforces the term; when the two disagree, the
linked file is the authority. General scientific terms are left to the chapters
that use them.

**Book source digest** — A SHA-256 hash over every file the continuous book and
its PDF are built from. The [book manifest](../public/downloads/book-manifest.json)
records it, so a reader can check which exact sources produced a given PDF.
Changing any of those files changes the digest and requires a re-render
([decision 0040](../decisions/0040-bind-publications-to-reproducible-and-public-artifacts.md)).

**Candidate** — A proposed architectural mechanism with a written experiment
contract: the question, the strongest conventional method it must beat, an
equal resource budget and a rejection rule. A candidate is a proposal under
test, not a component of a validated system. See the
[candidate index](../experiments/candidates/README.md) and the
[experiment-contract rules](../experiments/AGENTS.md).

**Claim (`C-` claim)** — One scoped statement in the evidence ledger, with a
stable identifier such as `C-001` and an evidence status. The status describes
that exact statement, not a broader interpretation of it
([claim ledger](../research/claims.md)).

**Claim ledger** — [`research/claims.md`](../research/claims.md), the gate
between source material and canonical claims. Chapters cite claims from it
rather than citing papers for their assertions directly.

**Claim-eligible** — A run or result whose protocol, identity and frozen
analysis rules allow it to change a claim's status. The project has no
claim-eligible workstation result yet; the README's current-status paragraph
records that boundary ([README](../README.md)).

**Confirmation run** — An execution under one fresh, bound identity, after the
protocol and analysis law are frozen and before confirmation data are opened.
Development output never acquires confirmation authority by relabelling
([decision 0010](../decisions/0010-fresh-bound-confirmation-execution.md),
[workstation rules](../experiments/workstation/AGENTS.md)).

**Decision record** — A numbered file in [`decisions/`](../decisions/README.md)
that explains a durable choice about authority, architecture, policy,
licensing, publication or release. Records are append-only: a later decision
supersedes an earlier one instead of rewriting it, and the index notes which
records are superseded.

**Development run and smoke check** — Bounded executions that test whether the
experiment machinery works. Their receipts are `NO_RESULT`: they verify
plumbing only and supply no confirmation, scientific result, energy comparison
or claim-promotion evidence
([workstation execution contract](../experiments/workstation/README.md)).

**Equal-budget comparison** — A comparison in which the proposal and its
baseline receive the same declared resources, or are explicitly normalised for
resources, under the same quality, risk and latency requirements. Every
efficiency result follows this rule ([energy evaluation](../concept/80-energy-model.md)).

**Evidence status** — The label every claim carries
([contribution guide](../CONTRIBUTING.md#evidence-statuses)):

- **established**: directly supported within a clearly stated experimental or
  analytical scope;
- **plausible**: supported indirectly or in narrower systems, but not yet for
  the proposed architecture;
- **speculative**: a testable project hypothesis with no adequate direct
  evidence yet; and
- **disputed**: contradicted, ill-defined, or dependent on incompatible
  measurements.

Status is not a score. An established result in a small task does not establish
that it transfers to a large system.

**Fixture (`F-` fixture)** — A hostile, reusable evaluation environment. A
fixture introduces no architecture of its own; it combines mechanisms owned
elsewhere and tests whether their composition survives strong ordinary
baselines, equal budgets, withheld conditions and explicit rejection rules
([fixture index](../experiments/fixtures/README.md)). "Hostile fixture" is the
same thing, stressing that it is built to make the proposal fail.

**Lifecycle accounting** — Counting energy and cost over a system's whole
service life, including manufacturing, maintenance and replacement, not only
the electricity used while running. It is the sixth of the boundaries in
[physical computation boundaries](../concept/28-physical-computation-boundaries.md).

**Mature null (strongest conventional null)** — The best ordinary engineering
method for the same task, such as model predictive control, error-correcting
codes or standard signal processing. A proposal must beat the complete mature
stack at equal budget. If it beats only a weakened subset, it has no benefit
left to claim ([experiment-contract rules](../experiments/AGENTS.md),
[mission-profile reliability](../concept/26-reliability-under-mission-profiles.md)).

**`NO_RESULT`** — The label on any output that carries no scientific result.
Protocol documents, smoke checks and development runs keep it until a valid run
and analysis exist ([experiment-contract rules](../experiments/AGENTS.md)).

**Observation, engineering translation and hypothesis** — Three layers that
chapters keep apart: what a source actually measured, how the project proposes
to turn it into an artificial mechanism, and what remains untested. Chapters
mark them with their *Biological observation*, *Proposed AI translation* and
*Speculative extensions* sections ([agent contract](../AGENTS.md)).

**Operator (physical forward operator)** — The measurement process that turns a
physical scene into an observation: aperture, illumination, medium, detector,
clock, calibration and noise. "Operator-qualified" results state which operator
produced them and what it could not resolve
([operator-qualified sensing](../concept/24-operator-qualified-sensing.md)).

**Principle bundle (`P-` bundle)** — A deduplicated problem–solution pattern
that recurs across scientific domains, with a stable identifier such as
`P-010`, scoped evidence, an engineering null and an experiment that can reject
its artificial translation. The thirteen current bundles are kept in the
[principle registry](../research/principle-registry.md) and explained in
[cross-domain convergence](../concept/07-cross-domain-convergence.md).

**Readiness** — The generated record of how far each claim's test route has
progressed, in four tiers: `ledger-only`, `linked-description`,
`protocol-complete` and `workstation-executable`
([readiness summary](../experiments/test-readiness-summary.json)). Smoke-ready
plumbing is reported separately from a workstation-ready scientific experiment
([experiments index](../experiments/README.md)). Readiness is an operational
state, never a result.

**Reviewed translation** — A translation of a canonical page tied to that
page's exact source digest and accepted by at least one human reviewer
competent in the target language. English
remains canonical; where no reviewed translation exists, the site offers a
contribution route instead of machine output
([translation contract](../translations/README.md)).

**Workstation** — The executable machinery under
[`experiments/workstation/`](../experiments/workstation/README.md) that runs
bounded development harnesses and is intended to run claim-eligible
experiments on declared hardware.
