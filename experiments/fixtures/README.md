# Cross-candidate benchmark fixtures

Fixtures are hostile, reusable evaluation environments. They do not introduce
architecture candidates. Each fixture combines mechanisms owned elsewhere and
tests whether their composition survives strong ordinary baselines, equal
budgets, withheld regimes, perturbations, and explicit rejection rules.

The executable fixture slices are the
[F-007 null-space-honesty smoke harness](../workstation/fixture-007/README.md),
the [F-012 layout-randomized performance-inference
harness](../workstation/fixture-012/README.md), the
[F-019 endogenous-feedback smoke harness](../workstation/fixture-019/README.md),
the [F-022 positional-memory smoke harness](../workstation/fixture-022/README.md),
the [F-023 plant-memory smoke harness](../workstation/fixture-023/README.md),
the [F-024 projected-memory smoke harness](../workstation/fixture-024/README.md),
the [F-025 impedance-validity smoke harness](../workstation/fixture-025/README.md),
the [F-026 trajectory-symmetry smoke harness](../workstation/fixture-026/README.md),
the [F-027 connection-back-action smoke harness](../workstation/fixture-027/README.md),
and the [F-029 recruited-maintenance plus phase-qualified preservation/release smoke suite](../workstation/fixture-029/README.md).
Execution readiness is tracked separately from the completeness of each full
fixture contract. Every other fixture ends with a `## Harness status` section
whose first line, `Blocked by: <blocker>[, <blocker>].`, names what a harness
still lacks: `hardware`, `data`, `dependency (fixture-NNN)`, or `not-built`
when the contract already specifies a workstation generator and nobody has
written the harness. `npm run check:test-coverage` refuses a fixture that has
neither a manifest nor that section, and lists the result in the Harness
column of the [coverage report](../test-coverage.md).

| ID | Fixture | Candidate owners |
| --- | --- | --- |
| F-001 | [Shared-clock-free predictive co-adaptation](001-shared-clock-free-coadaptation.md) | 002, 015, 019, plus the held entrainable local phase state |
| F-002 | [Versioned reconstructive design](002-versioned-reconstructive-design.md) | 004, 019; constrained by 014 and 017 |
| F-003 | [Opportunity- and history-qualified adaptive action](003-opportunity-history-qualified-action.md) | 004, 006, 007, 014, 018, 019 |
| F-004 | [Versioned proof discovery and verification](004-versioned-proof-discovery.md) | 004, 009, 010, 011, 014, 017, 019 |
| F-005 | [Regime-qualified flow inference and control](005-regime-qualified-flow-inference-control.md) | 002, 003, 006, 007, 012, 014 |
| F-006 | [Representative adaptive performance](006-representative-adaptive-performance.md) | 002, 004, 006, 007, 009, 012, 014, 019 |
| F-007 | [Operator-qualified optical inference](007-operator-qualified-optical-inference.md) | 001, 006, 007, 010, 014, 017, 018 |
| F-008 | [Mission-profile-qualified device reliability](008-mission-profile-qualified-device-reliability.md) | 001, 005, 006, 009, 010, 012, 014, 017, 018 |
| F-009 | [Operator-qualified active acoustic inference](009-operator-qualified-active-acoustic-inference.md) | 002, 006, 007, 009, 012, 014 |
| F-010 | [Boundary-qualified physical computation](010-boundary-qualified-physical-computation.md) | 001, 005, 006, 009, 010, 012, 014, 017, 018 |
| F-011 | [Operator-qualified active chemical sensing](011-operator-qualified-active-chemical-sensing.md) | 002, 006, 007, 009, 010, 012, 014, 017, 018 |
| F-012 | [Layout-randomized performance inference](012-layout-randomized-performance-inference.md) | 009 and 014; cross-cutting measurement null for compiled candidates |
| F-013 | [Immune-state lifecycle evidence and systems frontier](013-immune-state-lifecycle-evaluation.md) | source-domain reproductions plus 005, 009, 011, 012, 014, and 018 for the AI frontier |
| F-014 | [Continual-memory lifecycle under interference](014-continual-memory-lifecycle.md) | fast/slow memory and selective replay; cross-cutting continual-learning test for C-008 and C-010 |
| F-015 | [Sensorimotor grounding and hidden transfer](015-sensorimotor-grounding-transfer.md) | aligned perception--action--outcome learning; cross-cutting hidden-transfer test for C-007 |
| F-016 | [Versioned evidence retrieval and feedback](016-versioned-evidence-retrieval-feedback.md) | retrieval and reversible feedback lifecycle; cross-cutting test for C-797 and C-798 |
| F-017 | [Low-bit model and native-hardware crossover](017-low-bit-model-hardware-crossover.md) | ternary training, native execution, and lifecycle accounting; cross-cutting test for C-013 |
| F-018 | [Environmental process, state, and infrastructure control](018-environmental-process-state-control.md) | mature RTD, biological-retention, integrated-control, anomaly-isolation, fouling, adsorption, anaerobic-state, transformation/effect-closure, lifecycle, and infrastructure-topology nulls; cross-cutting tests for C-1470--C-1476, C-1478--C-1479, and the C-1285 extension |
| F-019 | [Finance-risk, attention, and governance controls](019-finance-risk-attention-governance.md) | mature risk, fixed-point, portfolio, attention, option, control, resilience, queue, accounting, and incentive nulls; cross-cutting tests for C-1480--C-1487 and maturation tracks for C-659--C-661, C-139, C-1433, and C-144 |
| F-020 | [Integrative comparative physiology](020-integrative-comparative-physiology.md) | mature flow, transport, exchanger, material-balance, robust-control, regional/global, predictive, causal-synchrony, and two-timescale nulls; complete CPU-only contracts for C-1488--C-1496 with no execution results |
| F-021 | [Tribology and adaptive contact interfaces](021-tribology-contact-adaptive-interfaces.md) | mature contact, lubrication, wear, rate/state, third-body, texture, adaptive-interface, robust-control, and lifecycle nulls; complete CPU-only contracts for C-1497--C-1505 with no execution results |
| F-022 | [Regenerative positional memory](022-regenerative-positional-memory.md) | mature checkpoint, robust-field, scaling, observability, adaptive-routing, boundary, redundancy, reaction--diffusion, and symmetry-breaking nulls; complete CPU-only contracts for C-1506--C-1515 with no execution results |
| F-023 | [Plant plasticity, memory, and signalling](023-plant-plasticity-memory-signalling.md) | mature latch, reset, state-space, systemic-routing, active-sensing, structural-admission, resource, wave, and context-integration nulls; complete CPU-only contracts for C-1516--C-1525 with no execution results |
| F-024 | [Applied multiscale reduction](024-applied-multiscale-reduction.md) | mature autoregressive, delay, balanced-truncation, singular-perturbation, adaptive-integration, surrogate, multigrid/domain-decomposition, and ensemble closure nulls; complete CPU-only contracts for C-1526--C-1529 with no execution results |
| F-025 | [Electrochemistry: interfaces, memory, and degradation](025-electrochemistry-interface-memory-degradation.md) | mature state-space/MPC, finite-memory, circuit/validity, regularised inverse, hybrid-regime, barrier/rollback, queue/load, identifiability, recurrent-state, and safe-optimisation nulls; complete CPU-only contracts for C-1530--C-1539 with no execution results |
| F-026 | [Interface-qualified relative sensing and scale symmetry](026-interface-qualified-relative-sensing.md) | mature static/streaming normalization, explicit difference/log-ratio, state-space, recurrent, robust-control, consensus and observation-design null requirements; ten complete contracts for C-1540--C-1549; a public RSD-T01 `NO_RESULT` smoke slice; a bounded RSD-T02 mechanism construction/conformance runtime with nine fixed policies, a reproducible isolated bundle, and a prospective fixed-instance/outer-lineage population contract; plus a separate C-1561 pulse constructor and unexecuted 229-unit panel runner |
| F-027 | [Interface-qualified retroactivity and bounded insulation](027-interface-qualified-retroactivity-insulation.md) | immutable reads/messages, copy-on-write, bounded queues, backpressure, admission/expiry, resource isolation, explicit filtering/control, weak coupling and replication nulls; ten detailed written contracts for C-1550--C-1559, with only a public RIN-T01 `NO_RESULT` smoke slice implemented |
| F-028 | [Parasitology-derived adversarial lifecycle boundaries](028-parasitology-adversarial-lifecycles.md) | compositional surface-shift, hierarchical commitment, independently rooted control-plane assurance, population-interaction and robust-control nulls; four protocol-complete specification-only contracts for C-1569--C-1572 with no runner, manifest, result, or workstation-execution claim |
| F-029 | [Clinical-biotechnology endogenous-machinery transfers](029-clinical-biotechnology-endogenous-machinery.md) | recruited maintenance, sparse typed correction, reversible latent-path selection, and phase-qualified preservation/release; four protocol-complete contracts for C-1574/C-1576/C-1578/C-1580, with public CMB-X01 and CMB-X04 `NO_RESULT` aggregate-construction slices co-receipted without comparison; CMB-X02/CMB-X03 remain absent, C-1573/C-1575/C-1577/C-1579 remain source-domain evidence inputs, and no result or workstation-execution claim follows |
