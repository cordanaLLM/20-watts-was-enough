# Repository map

The [research publication and feedback workflow](publication-workflow.md)
explains how these authorities generate Pages, PDF, release containers and
reviewed translations without creating parallel content stores.

This map is the durable navigation surface for the canonical Git repository.
It points to maintained authorities and their own indexes instead of copying
their contents into the root README.

New readers can begin with [start here](start-here.md), which explains the
status labels and summarises each chapter, and the [glossary](glossary.md),
which defines the project's own terms.

## Concept and architecture

| Chapter | Main question |
| --- | --- |
| [Thesis and principles](../concept/00-thesis-and-principles.md) | Which constraints define the programme? |
| [Working architecture](../concept/01-working-architecture.md) | How do runtime, adaptation, memory, maintenance, and resource control form one system? |
| [Biology as launchpad](../concept/05-biology-is-a-launchpad.md) | Which biological invariants transfer, and which substrate limits should be escaped? |
| [Cross-domain convergence](../concept/07-cross-domain-convergence.md) | How are recurring mechanisms deduplicated without erasing causal differences? |
| [Structural growth and routing](../concept/10-neurogenesis-and-routing.md) | When should capacity grow, specialize, merge, or retire? |
| [Sensorimotor grounding](../concept/20-sensorimotor-grounding.md) | What grounds a world model in observation, action, intervention, and history? |
| [Representative adaptive performance](../concept/22-representative-adaptive-performance.md) | How are learning and action compared under real opportunity and resource constraints? |
| [Active acoustic inference](../concept/23-active-acoustic-inference.md) | How does an active, calibrated acoustic loop work? |
| [Operator-qualified sensing](../concept/24-operator-qualified-sensing.md) | What can a physical observation actually resolve? |
| [Active chemical sensing](../concept/25-active-chemical-sensing.md) | How do transport, mixtures, active sampling, drift, and exposure enter inference? |
| [Mission-profile reliability](../concept/26-reliability-under-mission-profiles.md) | How are variable physical components operated across real stress histories? |
| [Physical computation boundaries](../concept/28-physical-computation-boundaries.md) | Which device, circuit, workload, facility, and lifecycle boundary supports a claim? |
| [Sparse predictive compute](../concept/30-sparse-predictive-compute.md) | How is the next computation or observation priced? |
| [Memory and consolidation](../concept/40-memory-and-consolidation.md) | How does an episode become retained structure, external fact, or deletion? |
| [Maturity and structural consolidation](../concept/50-grokking-and-pruning.md) | When should structure be protected, reopened, compacted, or retired? |
| [Hardening and factual memory](../concept/60-hardening-and-factual-memory.md) | Which path is compiled, retained, externalized, or escalated? |
| [System synthesis](../concept/70-system-synthesis.md) | How do the control planes fit together? |
| [Energy evaluation](../concept/80-energy-model.md) | How are lifecycle boundaries, equal budgets, and uncertainty enforced? |
| [Research roadmap](../concept/90-research-roadmap.md) | Which evidence and experiments come next? |

The [concept index](../concept/README.md) provides reading paths through these
chapters.

## Evidence and cross-domain discovery

| Authority | Purpose |
| --- | --- |
| [Claim ledger](../research/claims.md) | Stable `C-` identities, evidence status, scope, sources, and test links |
| [Principle registry](../research/principle-registry.md) | Deduplicated `P-` causal invariants across scientific domains |
| [Bibliography](../research/references.bib) | Primary-source and authoritative-source identities |
| [Audit index](../research/audits/README.md) | Dated field- and mechanism-level evidence audits |
| [Discovery policy](../research/discovery-policy.md) | Open-world search, extraction, deduplication, and promotion rules |
| [Field coverage](../research/field-coverage.md) | Generated scientific-field census and breadth queue |
| [Domain inventory](../research/domain-inventory.md) | Audited, partial, and queued domains |
| [Adoption matrix](../research/adoption-matrix.md) | Mechanisms to use, test, explore, or watch |
| [Normative baseline](../research/normative-baseline.md) | EU/German applicability and source-role rules |
| [Research integrity baseline](../research/research-integrity-baseline.md) | Deduplicated ALLEA, EU, DFG, and institutional rules for conduct, disclosure, stewardship, ethics, correction, and review |
| [Research-output disclosures](../research/disclosures/README.md) | Contributor roles, support, competing interests, material tools, accountable approval, and verification for tagged snapshots |
| [Open questions](../research/open-questions.md) | Unresolved research and architecture decisions |

## Mathematics, figures, and experiments

- [Mathematical notes](../math/README.md) define notation, dimensional
  boundaries, measurement contracts, and model-specific derivations.
- [Visual models](../math/visual-models.md) interpret current equations through
  generated plots without presenting illustrative values as results.
- [Asset index](../assets/README.md) identifies editable Mermaid and plotting
  sources plus generated outputs.
- [Experiment index](../experiments/README.md) links candidate contracts,
  cross-candidate fixtures, workstation machinery, and current coverage.
- [Candidate index](../experiments/candidates/README.md) contains architecture-
  specific equal-budget tests.
- [Fixture index](../experiments/fixtures/README.md) contains reusable hostile
  and falsification tests.
- [Workstation contract](../experiments/workstation/README.md) defines the
  boundary between smoke plumbing and claim-eligible execution.
- [Go tooling contract](../tooling/AGENTS.md) defines the small portable `20w`
  command, deterministic native release builder and static tooling image.
- [Test coverage](../experiments/test-coverage.md) is the generated claim-to-
  protocol and execution-readiness report.

## Provenance, decisions, and publication

- [Source records](../sources/README.md) preserve origin, access route, and
  redistribution boundaries without treating imported material as evidence.
- [Decision records](../decisions/README.md) preserve durable architectural,
  policy, licensing, and publication choices append-only.
- [Engineering and research contract](principles.md) defines repository-wide
  scientific, software, experiment, and release rules.
- [Research-writing skill](../.agents/skills/research-writing/SKILL.md) governs
  natural, evidence-aware project prose; its automated audit is intentionally a
  narrow canonical-Markdown tripwire.
- [Reader-editor skill](../.agents/skills/reader-editor/SKILL.md) supports
  conservative readability review for technically curious non-experts without
  changing claim authority.
- [Research design system](design-system.md) and its
  [project skill](../.agents/skills/research-design/SKILL.md) govern visual
  hierarchy, typography, brand expression, component ownership, and retained
  viewport evidence.
- [Publication-design skill](../.agents/skills/publication-design/SKILL.md)
  governs the continuous book and generated PDF hierarchy, print typography,
  pagination, page-class sampling, extracted reading order, and visual QA.
- [Maintenance-automation skill](../.agents/skills/maintenance-automation/SKILL.md)
  routes repeated dependencies, CI, releases, generated artifacts, GitHub
  metadata, security drift, and translation freshness through one existing
  authority with bounded checks and repairs.
- [Roadmap milestones](../.github/milestones.json) and the repository-bound
  [issue assignment map](../.github/issue-milestones.json) are the reconstructible
  Git authority for the live coordination projection; they do not change claim
  or result status.
- [Public-interface audit](public-research-interface-audit.md) records measured
  reading defaults, comparable GitHub-native structures, test hypotheses and
  the maintainer decision queue.
- [GitHub Pages portal](https://www.cordana.dev/) provides the web-native
  research surface; the [HTML book](https://www.cordana.dev/book/) and
  [downloadable PDF](https://www.cordana.dev/downloads/20-watts-was-enough-full-concept-book.pdf)
  are generated from the same canonical revision.

## Project operation

- [Contribution guide](../CONTRIBUTING.md)
- [Public contribution map](https://www.cordana.dev/help/) and its [canonical
  source](how-to-help.md)
- [Governance](../GOVERNANCE.md)
- [Maintainers](../MAINTAINERS.md)
- [Security policy](../SECURITY.md)
- [Support and issue routing](../SUPPORT.md)
- [Code of Conduct](../CODE_OF_CONDUCT.md)
- [Licensing and provenance boundary](../LICENSING.md)
- [Citation metadata](../CITATION.cff)
- [Changelog](../CHANGELOG.md)
