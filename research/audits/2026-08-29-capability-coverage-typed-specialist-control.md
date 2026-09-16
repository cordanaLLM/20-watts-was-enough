# Capability coverage is not expert topology

<!-- markdownlint-disable MD013 -->

- **Audit date:** 2026-08-29
- **Cross-project update:** 2026-08-30; exact public source snapshots from
  `VMAFx/vmafx` and `VMAFx/pelorus`
- **Status:** bounded research note; no architecture decision, result, or
  performance claim
- **Trigger:** a maintainer-supplied image suggested using Howard Gardner's
  eight multiple-intelligences categories as a possible set of specialist
  capabilities
- **Scope:** whether an explicit controller coordinating small typed
  specialists deserves a comparison arm, and whether the eight categories add
  anything beyond a coverage prompt
- **Evidence rule:** the supplied image is a source lead, not evidence; the
  proposal, psychometric observations, engineering translation, and project
  hypothesis remain separate
- **Promotion state:** no new `C-` claim, `P-` principle, candidate, fixture, or
  decision is created or reserved here

## Executive finding

The repository already contains the underlying mechanism: conditional expert
routing, local autonomy with escalation, typed state ownership, and separate
task, resource, adaptation, and maintenance control planes. The unresolved
question is narrower. An explicit controller could own the main loop while
small capability-specific models propose bounded outputs. The controller—not
an always-on language model—would decide which specialists run, which state and
budgets they may use, whether their candidates pass independent checks, and
whether the system acts, answers, retries, or abstains.

That composition remains a hypothesis. Gardner's categories do not specify its
topology. The categories can prompt researchers to notice task families that a
text-heavy benchmark missed, but neither the proposal nor the evidence below
justifies eight fixed experts, eight independent faculties, or eight model
processes. Specialist boundaries must be derived from task interfaces and
earned through causal contribution, calibration, transfer, and complete
lifecycle cost.

## Source observation and disagreement

| Source | Directly supported record | Boundary retained here |
| --- | --- | --- |
| [Harvard Project Zero's official overview](https://pz.harvard.edu/projects/multiple-intelligences) [`HarvardProjectZeroMultipleIntelligences`] | Project Zero presents linguistic, logical-mathematical, spatial, bodily-kinesthetic, musical, interpersonal, intrapersonal, and naturalist capacities as relatively discrete parts of Gardner's proposal. | This records the proposal and its current official category list. It does not validate the categories as independent psychometric factors, neural modules, or artificial model boundaries. |
| [Visser, Ashton, and Vernon 2006](https://doi.org/10.1016/j.intell.2006.02.004) [`VisserEtAl2006BeyondG`] | Two tests for each of the eight proposed domains were administered to 200 adults. Factor analysis found substantial general-factor loadings for the tested cognitive abilities and only weak domain-specific associations within most domains. | The sample contained 171 undergraduates; several tasks mixed ability with sensory, motor, or personality influences, and both musical measures had unexpectedly low reliability. One instrument set cannot close the construct dispute. |
| [Gardner 2006](https://doi.org/10.1016/j.intell.2006.04.002) [`Gardner2006MIResponse`] | Gardner described the proposal as semi-autonomous information-processing capacities and disputed whether the Visser tasks were fair tests of the intended domains, arguing that many imported logical or verbal demands. | This is the proposer's published reply, not an independent validation. It makes measurement choice part of the dispute and explicitly leaves the correlations among subcomponents empirical. |
| [Castejón, Pérez, and Gilar 2010](https://doi.org/10.1016/j.intell.2010.07.002) [`CastejonEtAl2010ProjectSpectrum`] | Confirmatory factor analysis of six Project Spectrum activity groups in 393 kindergarten and first-grade children found that the activities were neither as independent as a strict multiple-intelligences account predicts nor as unitary as a single-factor account predicts. | The sample came from five Spanish schools, excluded 18 children recorded as having special educational needs, and tested six activity groups. The result rejects a simple binary choice; it does not identify an artificial architecture. |

The usable conclusion is deliberately limited: the category list is broad
enough to serve as an omission prompt, while its independence and measurement
remain contested. Calling an artificial component *musical* or
*intrapersonal* therefore supplies no evidence that it should be a separate
model or that a router can isolate it.

## Deduplication against the existing architecture

| Existing owner | What it already covers | Residual retained here |
| --- | --- | --- |
| [C-003](../claims.md#c-003) and [P-001](../principle-registry.md#p-001--selective-allocation) | A router can address more expert capacity than it activates for one event. | Compare a task-level typed controller with ordinary learned mixture-of-experts routing; do not rename conditional execution. |
| [P-002](../principle-registry.md#p-002--local-autonomy-with-exception-escalation) | Local modules can handle bounded work and escalate exceptions. | Make final arbitration, tool authority, and abstention explicitly controller-owned in one comparison arm. |
| [P-008](../principle-registry.md#p-008--compartmentalized-interaction) | Module boundaries can protect specialization while creating interface and coordination costs. | Measure whether capability-specific model boundaries help after duplicated context, serialization, and cross-specialist error are charged. |
| [P-009](../principle-registry.md#p-009--maintenance-plane) | Independent maintenance can evaluate, protect, reopen, and retire modules. | Prevent a specialist from promoting itself or turning a successful candidate output into durable global state. |
| [System synthesis](../../concept/70-system-synthesis.md#authority-is-split-across-control-planes) | Task, resource, adaptation, and maintenance authority are already separate. | Test one concrete implementation in which the coordinating loop is not itself a language model. |

No new causal invariant survives this map. This note only sharpens an
implementation hypothesis and its null models.

## Held comparison arm

The proposed arm has four explicit roles:

1. **Controller.** Own the run identity, task state, admissible specialist set,
   state and memory grants, tool authority, budgets, deadlines, retries,
   cancellation, candidate arbitration, final output or action, and
   abstention. It may be a deterministic state machine, planner, scheduler, or
   bounded learned policy, but it need not generate language. Deterministic
   authority and safety gates remain outside any learned policy.
2. **Specialist.** Receive a typed request and bounded context, then return a
   typed candidate, calibrated uncertainty or abstention, provenance, and a
   resource receipt. A specialist may be a small neural model, estimator,
   solver, conventional program, or tool. A language model is only one
   possible linguistic specialist.
3. **Verifier.** Check task-specific postconditions, protected constraints,
   calibration, provenance, and incompatibilities without accepting the
   originating specialist's confidence as proof.
4. **Shared state.** Retain versioned observations and accepted outcomes under
   controller-owned write rules. No specialist acquires global write authority
   merely because it produced the selected candidate.

Capability boundaries are task-derived. Gardner's eight labels may be used
once to ask whether the evaluation omitted word use, formal reasoning, spatial
manipulation, sensorimotor action, music or temporal structure, social
interaction, self-monitoring, or classification of natural patterns. They do
not determine the specialist count, model family, routing graph, or ownership
boundary.

## Falsification and ordinary nulls

| Arm | Required role |
| --- | --- |
| Capacity-matched general model | Tests whether explicit specialists are needed at all. It receives the same admissible tools, external state, examples, tuning allowance, and outcome information. |
| Tuned sparse mixture of experts | Tests whether learned conditional routing inside one model explains the result without a separate task-level controller. Total stored capacity, active work, routing information, and hardware opportunity are matched. |
| Typed specialists with an explicit controller | The held hypothesis. Expert boundaries come from task contracts and demonstrated causal contribution, not the eight category names. |
| Coverage-prompt ablation | Uses the same controller and resource ceiling, with and without Gardner's list during task-suite and gap-review design. This tests only whether the list reveals missed tasks; it receives no architectural credit. |

The comparison charges controller and router work, serialization, repeated
context, communication, memory traffic, cold starts, idle resident capacity,
calibration, verification, retries, failed routes, maintenance, replacement,
latency tails, and measured energy over the same accepted-task boundary. Model
parameter count or nominal activated parameters are not substitutes for those
measurements.

Reject the specialist composition when any of the following occurs:

- the general model or ordinary mixture of experts reaches the same
  quality--risk--latency--energy frontier;
- apparent specialization disappears when each component is causally ablated
  on held-out tasks or when shared training dependence is exposed;
- routing, duplicated context, calibration, or cold-start work erases the
  saved execution;
- one component wins nearly every route without a protected rare-role benefit,
  making the remaining pool cosmetic;
- the controller needs a general language model to reinterpret every packet,
  moving the supposed brain back into an unmeasured central model; or
- the coverage-prompt arm finds no reproducible omission beyond ordinary
  task analysis, in which case the Gardner list leaves the protocol.

## Iterative portfolio and retest rule

The experiment need not crown one permanent whole-system winner. Before
outcomes are opened, it freezes task-quality non-inferiority, protected-risk
floors, the comparator, uncertainty treatment, and the resource axes on which a
component may earn retention. Energy reduction is an especially valuable axis
for this project, but it receives credit only at the declared task quality and
accepted-risk boundary.

For each specialist, router, verifier, memory path, and controller feature:

1. compare the complete arm with a causal ablation under the same task,
   hardware opportunity, seeds, tuning allowance, and stopping law;
2. report the full outcome vector, uncertainty, Pareto position, every
   regression, and interaction with other retained components;
3. retain a component in the active portfolio only when it makes an
   independently demonstrated contribution without crossing a protected floor;
4. preserve ties, losses, boundary failures, and negative results rather than
   averaging them into a favourable scalar; and
5. re-evaluate the assembled portfolio because independently useful parts can
   interfere and need not compose additively.

A component that does not survive moves to a versioned retest backlog. Its
record keeps the failed support region, evidence, comparator, uncertainty,
resource receipt, and removal reason. A retest is eligible only when one of
three concrete triggers changes the prediction: a stronger proposed mechanism,
a changed workload or physical accounting boundary, or new evidence that
resolves a recorded uncertainty. The trigger, expected directional change, and
kill criterion are frozen before rerunning. Every reopened component competes
against the strongest current baseline and portfolio, not the historical
baseline it previously failed to beat.

This rule prevents both all-or-nothing architecture selection and selective
resurrection of attractive ideas. It remains an evaluation hypothesis until a
protocol implements the ledger, trigger gate, and interaction retest.

## Existing engineering donors

### Cluster control donor

The read-only [cluster transfer
audit](2026-08-30-lusoris-k8s-engineering-transfer.md) identifies a current
operational source for controller/executor separation, measurement-qualified
admission, expiring capability state, loaded-model readiness, queue-aware
backpressure, bounded fairness and recovery authority. Those mechanisms can
shape a dependency-light Go policy package and stress fixtures for this arm.
The cluster code, component choices, hardware constants and incident outcomes
do not transfer, and its operational records are not evidence that the held
specialist comparison wins.

### Tiny estimators and a non-language content router

Two maintainer-related repositories make the proposed composition more
concrete without validating it. They were inspected at exact public commits:
[`VMAFx/vmafx@d6cb877`](https://github.com/VMAFx/vmafx/tree/d6cb87711b5883b55af07b9473db150ac8d4c6c0)
and
[`VMAFx/pelorus@9724133`](https://github.com/VMAFx/pelorus/tree/9724133530561a71960b091ebbb29283472ab8d5).
Both repositories state BSD-2-Clause-Patent for their own core code. Individual
VMAFx model-registry entries retain model-specific licences, and no code,
weights, data, or benchmark output is imported here.

| Source observation | Engineering translation for this arm | Boundary retained here |
| --- | --- | --- |
| The VMAFx [Tiny-AI surface](https://github.com/VMAFx/vmafx/blob/d6cb87711b5883b55af07b9473db150ac8d4c6c0/README.md#tiny-ai) and [model registry](https://github.com/VMAFx/vmafx/blob/d6cb87711b5883b55af07b9473db150ac8d4c6c0/model/tiny/registry.json) expose typed full-reference regressors, no-reference metrics, learned filters, saliency models, scene detectors, and explicit smoke-only artifacts through one ONNX-backed runtime. Registry records distinguish kind, licence, digest, quantisation, and smoke status. | A specialist pool need not be a set of language models. Small estimators, filters, solvers, and conventional programs can share one typed invocation and provenance boundary while retaining task-specific semantics. | This is a domain implementation, not a controller comparison. A common runtime and registry do not show that routing among the registered components improves any complete system frontier. |
| VMAFx's implemented Go [scheduler](https://github.com/VMAFx/vmafx/blob/d6cb87711b5883b55af07b9473db150ac8d4c6c0/cmd/vmafx-controller/scheduler/scheduler.go#L4-L69) selects queued work by worker capability and backend. Its separate Go [`pkg/ai` inference path](https://github.com/VMAFx/vmafx/blob/d6cb87711b5883b55af07b9473db150ac8d4c6c0/pkg/ai/infer.go#L92-L178) requires a `vmafx-ort-runner` that the repository does not build, while the direct CGO path remains a stub. | Resource and backend admission can be reused as one controller layer without being mistaken for semantic expert arbitration. Executable Go specialists need an independently built, tested, and identity-bound inference adapter before entering a comparison arm. | The repository does not currently provide a complete Go tiny-model execution and semantic-routing system. The C/C++ Tiny-AI surface, Go queue scheduler, and proposed Pelorus content router are distinct implementation states. |
| The VMAFx [v3](https://github.com/VMAFx/vmafx/blob/d6cb87711b5883b55af07b9473db150ac8d4c6c0/docs/ai/models/vmaf_tiny_v3.md) and [v4](https://github.com/VMAFx/vmafx/blob/d6cb87711b5883b55af07b9473db150ac8d4c6c0/docs/ai/models/vmaf_tiny_v4.md) cards report a capacity ladder from 257 to 769 to 3,073 parameters. The repository keeps the smallest v2 model as its default and records v4 as an opt-in saturation point rather than promoting the largest model automatically. | Freeze a strong smallest-model null, measure marginal gain per added capacity and runtime cost, and stop expanding a specialist when the held-out gain saturates. | The values are repository-reported video-quality evaluations that were not reproduced for this audit. They approximate a teacher metric from pre-extracted features and do not establish general reasoning, energy, or controller performance. |
| VMAFx [ADR-0660](https://github.com/VMAFx/vmafx/blob/d6cb87711b5883b55af07b9473db150ac8d4c6c0/docs/adr/0660-tiny-ai-disabled-runtime-gate.md) gives every Tiny-AI extractor one shared `-ENOSYS` result when the optional DNN runtime is unavailable, before probing a model path. | Availability, unsupported capability, invalid input, uncertainty, and task abstention should remain distinct typed outcomes. A controller can route or stop on those states without asking a language model to reinterpret an error string. | One C API failure-order contract is an implementation lead, not evidence that the proposed end-to-end abstention policy is calibrated or safe. |
| Pelorus [ADR-0142](https://github.com/VMAFx/pelorus/blob/9724133530561a71960b091ebbb29283472ab8d5/docs/adr/0142-tune-auto-content-router.md) proposes a per-shot, hysteretic controller over measured video features. It would select a content-specific reductive filter configuration or a clean-content `NO-OP` route. Each route must be admitted on a held-out clip before entering the table. | This is a direct non-language-controller analogue: typed sensors feed an explicit route table; bounded executors perform specialized work; doing nothing is a first-class action; and route-specific evidence controls admission. | The ADR is still **Proposed**. At the inspected commit it says the first grain-sigma metadata enabler shipped while the remaining detectors, route legs, and router are follow-up work. It cannot be cited as a completed controller or measured whole-system win. |
| Pelorus [ADR-0111](https://github.com/VMAFx/pelorus/blob/9724133530561a71960b091ebbb29283472ab8d5/docs/adr/0111-benchmark-methodology.md) requires the same encoder in both arms, clean-reference scoring for restoration, pinned inputs, bounded scoring, and a metric matched to the impairment. Its benchmark record also preserves negative and stand-in results. | Route admission must bind task intent, comparator, reference, metric, and implementation identity. A specialist is not retained because a convenient proxy improves or because a related algorithm class worked. | These rules are a useful experiment pattern, but the reported video results do not measure the proposed AI controller, total lifecycle energy, or generalize outside their codec, content, hardware, and reference assumptions. |

The most useful applied follow-up is therefore not to relabel the VMAFx models
as a complete artificial brain. It is a separate video-domain shakedown in
which a small controller receives declared per-shot features and chooses among
`NO-OP` and a bounded pool of deterministic or learned filter executors. VMAFx
metrics and tiny estimators can supply typed observations or independent
candidate checks, but the final quality endpoint must not be the same teacher
or proxy that trained and routed the system. Compare a frozen threshold table,
a compact learned router, an always-on tuned chain, the best single fixed
executor, and a per-shot oracle under identical encoder, data, latency, memory,
and measured wall-energy opportunities.

That track has two safeguards. First, it remains distinct from the
[CLRS-Text shakedown](https://github.com/cordanaLLM/20-watts-was-enough/issues/12),
which tests typed algorithmic specialists without the shared authorship,
metrics, and video pipeline of these donor repositories. Second, no Pelorus or
VMAFx result enters as a project result: source code, models, corpus licences,
metric independence, exact hardware, and current router implementation must be
re-audited before an executable protocol imports anything.

### Process disclosure for the cross-project update

`@lusoris` supplied the source lead, research direction, and owns or maintains
the source repositories as well as this project. They are therefore
related-party engineering sources, not independent confirmation. OpenAI Codex
inspected the public repositories and drafted this update on 2026-08-30. No
model, dataset, benchmark artifact, private repository state, or donated
compute was used; the reported experiments were not rerun. No independent
scientific, statistical, video-quality, energy, or code review is recorded.
The update is limited to source-bound architecture and experiment leads and
does not promote a claim.

## Decisions required before an experiment exists

This note intentionally does not choose the following:

1. the first heterogeneous task family and externally scored outcomes;
2. the operational meaning of *small* in model bytes, resident memory,
   latency, active operations, and joules per accepted task;
3. deterministic versus learned route selection, and which predicates remain
   non-learned terminal gates;
4. whether specialists are separately trained models, adapters, programs, or a
   mixed pool;
5. the arbitration rule for contradictory candidates and the exact abstention
   contract; and
6. the independence boundary for training data, source roots, evaluators, and
   calibration sets; and
7. whether the video-domain donor track is worth a separate applied fixture
   after its router exists, without allowing shared authorship or metric
   circularity to substitute for the heterogeneous first test.

Until those decisions are frozen, [OQ-068](../open-questions.md#architecture)
is a research question rather than a candidate architecture or experiment.
