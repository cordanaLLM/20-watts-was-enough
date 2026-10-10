# Test coverage

This report is generated from the central claim ledger, experiment documents,
and reviewed ledger-only dispositions. It distinguishes a written protocol from
runnable software. Re-run `npm run audit:tests` after changing claim links,
experiment contracts, or disposition fragments.

## Current answer

The four rows below are mutually exclusive highest-reached tiers.

| Highest coverage tier | Claims | Share of 1571 | Meaning |
| --- | ---: | ---: | --- |
| ledger-only | 96 | 6.1% | no exact direct relation to a numbered experiment artifact |
| linked test description | 0 | 0.0% | related experiment prose exists, but at least one required protocol facet is absent |
| protocol-complete test contract | 1475 | 93.9% | at least one linked artifact contains all eight required facets |
| workstation-executable | 0 | 0.0% | checked execution manifest and runnable scientific harness exist |

The short answer is therefore **1475 claims have a complete
test description, but 0 are executable on the workstation**.
Across both description tiers, 1475 claims have an exact direct
relation to at least one experiment artifact. These are aggregate candidate
tests: they evaluate engineering translations supported by several claims; they
do not independently reproduce every source paper.

## Coverage by evidence status

| Highest tier | Established | Plausible | Speculative | Disputed | Unknown |
| --- | ---: | ---: | ---: | ---: | ---: |
| ledger-only | 83 | 9 | 0 | 4 | 0 |
| linked-description | 0 | 0 | 0 | 0 | 0 |
| protocol-complete | 1154 | 210 | 64 | 47 | 0 |
| workstation-executable | 0 | 0 | 0 | 0 | 0 |

## Why ledger-only claims remain unlinked

A reviewed disposition explains every ledger-only claim without counting the
classification itself as a test.

| Disposition | Claims | Meaning |
| --- | ---: | --- |
| evidence-input | 85 | scientific or engineering evidence that constrains a translation but is not itself a standalone AI-system hypothesis |
| source-reproduction | 11 | a source-domain result whose direct test would reproduce the cited study rather than evaluate this project's AI system |
| existing-artifact-gap | 0 | an engineering consequence belongs in an existing artifact, but its exact traceability or track is still missing |
| new-artifact-needed | 0 | a project engineering hypothesis needs a new experiment contract |

No unresolved `new-artifact-needed` disposition remains. Promoted family
records are retained as design provenance in the
[experiment-family provenance](proposed/README.md). The source fragments and
schema are in [claim dispositions](claim-dispositions/README.md).

## What “complete test description” means

A protocol passes only when the document contains all of the following:

- question or hypothesis;
- system, scenario, or task family;
- arms, baselines, or strongest nulls;
- matched budget and cost boundary;
- measurements and units;
- ablations;
- analysis or statistical plan;
- rejection, kill, or retirement rule;

The gate scans explicit H2/H3 sections. Cost reporting alone does not satisfy
resource parity, and a statistical null is not a confirmatory analysis plan.
This is a structural completeness gate, not proof that the design is correct.
A workstation-ready test additionally needs a machine-readable manifest naming
the command, environment, hardware assumptions, seeds, data, and outputs.

## Traceability method

A relation exists when either side states it exactly:

1. a claim block links a numbered candidate or fixture; or
2. an artifact links an exact claim label to the matching claim anchor.

Inclusive ranges are expanded only when both endpoints have exact matching
links. Prose numbers and indirect adoption-matrix associations do not count.
The union yields 1475 linked claims: 1258
appear on the claim side, 1165 on the document side, and
811 have at least one reciprocal same-artifact relation.

## Artifact coverage

There are 49 experiment artifacts: 49
pass the written-protocol gate, a validated smoke harness exists for
11, and 0 pass the full execution gate.
Smoke readiness verifies deterministic plumbing but cannot promote a claim.

| Artifact | Directly related claims | Protocol status | Execution status |
| --- | ---: | --- | --- |
| [candidate-001](candidates/001-adaptive-topology.md) | 71 | complete description | not executable |
| [candidate-002](candidates/002-multiscale-context-broadcast.md) | 93 | complete description | not executable |
| [candidate-003](candidates/003-recovery-dynamics-fragility.md) | 49 | complete description | not executable |
| [candidate-004](candidates/004-closed-endogenous-curriculum.md) | 116 | complete description | not executable |
| [candidate-005](candidates/005-severity-ordered-containment.md) | 111 | complete description | not executable |
| [candidate-006](candidates/006-reversible-physical-skill.md) | 157 | complete description | not executable |
| [candidate-007](candidates/007-endogenous-observation-surveillance.md) | 158 | complete description | not executable |
| [candidate-008](candidates/008-contestable-modular-allocation.md) | 24 | complete description | not executable |
| [candidate-009](candidates/009-graded-assurance-envelopes.md) | 299 | complete description | not executable |
| [candidate-010](candidates/010-reset-coupled-staged-verification.md) | 81 | complete description | smoke-ready; not executable |
| [candidate-011](candidates/011-dual-loop-operational-assurance.md) | 138 | complete description | not executable |
| [candidate-012](candidates/012-latency-qualified-authority.md) | 228 | complete description | not executable |
| [candidate-013](candidates/013-deficit-capability-routing.md) | 102 | complete description | not executable |
| [candidate-014](candidates/014-versioned-observation-contract.md) | 632 | complete description | not executable |
| [candidate-015](candidates/015-versioned-repairable-conventions.md) | 75 | complete description | not executable |
| [candidate-016](candidates/016-conflict-bounded-unit-transition.md) | 29 | complete description | not executable |
| [candidate-017](candidates/017-contract-preserving-semantic-compaction.md) | 98 | complete description | not executable |
| [candidate-018](candidates/018-value-reconstructability-aware-tiering.md) | 108 | complete description | not executable |
| [candidate-019](candidates/019-audited-cumulative-inheritance.md) | 143 | complete description | not executable |
| [candidate-020](candidates/020-constitutional-control-plane.md) | 128 | complete description | not executable |
| [fixture-001](fixtures/001-shared-clock-free-coadaptation.md) | 36 | complete description | not executable |
| [fixture-002](fixtures/002-versioned-reconstructive-design.md) | 19 | complete description | not executable |
| [fixture-003](fixtures/003-opportunity-history-qualified-action.md) | 38 | complete description | not executable |
| [fixture-004](fixtures/004-versioned-proof-discovery.md) | 22 | complete description | not executable |
| [fixture-005](fixtures/005-regime-qualified-flow-inference-control.md) | 53 | complete description | not executable |
| [fixture-006](fixtures/006-representative-adaptive-performance.md) | 44 | complete description | not executable |
| [fixture-007](fixtures/007-operator-qualified-optical-inference.md) | 33 | complete description | smoke-ready; not executable |
| [fixture-008](fixtures/008-mission-profile-qualified-device-reliability.md) | 52 | complete description | not executable |
| [fixture-009](fixtures/009-operator-qualified-active-acoustic-inference.md) | 46 | complete description | not executable |
| [fixture-010](fixtures/010-boundary-qualified-physical-computation.md) | 56 | complete description | not executable |
| [fixture-011](fixtures/011-operator-qualified-active-chemical-sensing.md) | 55 | complete description | not executable |
| [fixture-012](fixtures/012-layout-randomized-performance-inference.md) | 3 | complete description | smoke-ready; not executable |
| [fixture-013](fixtures/013-immune-state-lifecycle-evaluation.md) | 15 | complete description | not executable |
| [fixture-014](fixtures/014-continual-memory-lifecycle.md) | 2 | complete description | not executable |
| [fixture-015](fixtures/015-sensorimotor-grounding-transfer.md) | 1 | complete description | not executable |
| [fixture-016](fixtures/016-versioned-evidence-retrieval-feedback.md) | 2 | complete description | not executable |
| [fixture-017](fixtures/017-low-bit-model-hardware-crossover.md) | 1 | complete description | not executable |
| [fixture-018](fixtures/018-environmental-process-state-control.md) | 14 | complete description | not executable |
| [fixture-019](fixtures/019-finance-risk-attention-governance.md) | 14 | complete description | smoke-ready; not executable |
| [fixture-020](fixtures/020-integrative-comparative-physiology.md) | 9 | complete description | not executable |
| [fixture-021](fixtures/021-tribology-contact-adaptive-interfaces.md) | 9 | complete description | not executable |
| [fixture-022](fixtures/022-regenerative-positional-memory.md) | 10 | complete description | smoke-ready; not executable |
| [fixture-023](fixtures/023-plant-plasticity-memory-signalling.md) | 10 | complete description | smoke-ready; not executable |
| [fixture-024](fixtures/024-applied-multiscale-reduction.md) | 4 | complete description | smoke-ready; not executable |
| [fixture-025](fixtures/025-electrochemistry-interface-memory-degradation.md) | 10 | complete description | smoke-ready; not executable |
| [fixture-026](fixtures/026-interface-qualified-relative-sensing.md) | 19 | complete description | smoke-ready; not executable |
| [fixture-027](fixtures/027-interface-qualified-retroactivity-insulation.md) | 10 | complete description | smoke-ready; not executable |
| [fixture-028](fixtures/028-parasitology-adversarial-lifecycles.md) | 4 | complete description | not executable |
| [fixture-029](fixtures/029-clinical-biotechnology-endogenous-machinery.md) | 4 | complete description | smoke-ready; not executable |

## Immediate gaps

- 96 claims remain ledger-only: 85
  evidence inputs, 11 source-domain
  reproductions, and 0 claims needing
  a new project experiment artifact.
- 0 ledger-only claims still belong
  in an existing artifact but lack an exact traceability or test track.
- 0 claims reach only a partial description.
  The missing facets are concentrated in no artifact.
- 11 artifact(s) have a validated smoke manifest and
  deterministic harness. They remain non-executable for claim coverage until
  confirmation seeds, held-out generators, complete analysis, resume and
  corruption checks, and measured-energy instrumentation satisfy the
  [workstation contract](workstation/README.md).

## Machine-readable report

[`test-coverage.json`](test-coverage.json) contains every claim-to-artifact
mapping, reviewed ledger-only disposition, per-artifact facet result, and
execution readiness.
