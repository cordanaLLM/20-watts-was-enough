# System synthesis

> Intelligence is the coordinated movement of state through perception,
> prediction, action, memory, adaptation, and maintenance under a finite
> physical budget.

## Scope

The [working architecture](01-working-architecture.md) defines the runtime,
adaptation, and maintenance loops. This chapter follows information through
those loops, identifies who may write each kind of state, and gives the order in
which the integrated system should be assembled.

## Biological observation

Living intelligence coordinates sensing, action, memory, plasticity, resource
supply, and repair across different timescales. Local circuits handle repeated
work, broader signals alter priorities, fast traces change behavior before slow
structure moves, and maintenance continues during operation.

The transferable principle is **coordinated state ownership**. Reading a
result does not grant authority to overwrite its source. Fast behavior, rapid
learning, slow consolidation, and physical resource control can therefore
interact without becoming one global update rule.

## Proposed AI translation

### Runtime path

```mermaid
flowchart LR
    obs["Multimodal event"] --> enc["Sparse encoders"]
    enc --> state["Predictive shared state"]
    state --> gate{"Surprise · value · risk"}
    gate -->|"familiar"| reflex["Hardened path / early exit"]
    gate -->|"uncertain"| route["Hierarchical router"]
    route --> experts["Selected experts"]
    route --> episodic["Episodic memory"]
    route --> facts["Sourced factual memory"]
    experts --> output["Prediction / action"]
    episodic --> output
    facts --> output
    reflex --> output
    output --> result["Outcome + uncertainty + telemetry"]
    result --> episodic
```

Editable source:
[`../assets/diagrams/system-runtime.mmd`](../assets/diagrams/system-runtime.mmd).

The path has six stages:

1. **Ground the event.** Encoders align perception with current action, timing,
   location, and tool state.
2. **Predict before expanding computation.** The shared state estimates what is
   likely, what is uncertain, and which goal currently matters.
3. **Choose the execution path.** A gate may dispatch a hardened skill, stop at
   an early exit, retrieve memory, activate selected experts, intervene through
   a tool, or escalate.
4. **Execute only admitted work.** Inactive capacity remains addressable without
   being loaded and operated on for the event.
5. **Measure the result.** Output is paired with observed consequence,
   calibration, latency, bytes moved, and energy.
6. **Capture an episode.** The adaptation loop receives an attributable record
   rather than an unexplained parameter change.

### The runtime preserves both relative and absolute authority

The predictive state may expose absolute level, additive change, derivative,
ratio, reference age and support as different fields. A router does not choose
one of them from a modality or pathway name. It chooses from the registered
task and observation interface: relative sensing can transfer across a
multiplicative nuisance scale, while absolute load, dose, damage and capacity
remain on calibrated channels.

Every relative route therefore carries the reference identity and age that
made it valid, plus a fallback when the input approaches zero, changes sign,
clips, saturates or leaves the learned scale support. Removing the absolute
channel is a reversible ablation, not a default compression. The
robustness--recoverability trade is tested explicitly in
[RSD-T10](../experiments/fixtures/026-interface-qualified-relative-sensing.md#rsd-t10--robustness-recoverability-and-compute-frontier)
and derived in
[Interface-qualified scale symmetry](../math/interface-qualified-scale-symmetry.md).

### A subscriber can change its producer

State ownership prevents unauthorized writes, but it does not guarantee that a
read or subscription is dynamically neutral. A consumer can pin a producer's
slot, hold a reference, block publication, create a gradient path, compete for
shared resources, or intentionally feed back. Those cases are distinct from an
immutable read and from unrelated system contention
([C-1550](../research/claims.md#c-1550),
[C-1558](../research/claims.md#c-1558)).

Every reusable module therefore carries a connection-sensitivity record:

1. isolated input, state and output trajectory;
2. attached client identity, topology, coupling and holding time;
3. producer deviation at the producer-owned interface;
4. delivered, timely and fresh consumer service;
5. shared CPU, memory, queue, network and accelerator load;
6. insulation copies, buffers, admission, monitoring and recovery work; and
7. the support in which the connection remains qualified.

The system inserts no insulator when the immutable/no-back-action control
passes. Where material back-action exists, it selects among ordinary buffering,
snapshots, weak coupling, resource isolation, replication, explicit feedback
and a bounded adaptive insulator. Suppression is not the only admissible goal:
registered useful feedback or temporal shaping must remain intact
([C-1559](../research/claims.md#c-1559)). The complete decision is tested in
[Fixture F-027](../experiments/fixtures/027-interface-qualified-retroactivity-insulation.md),
not inferred from the biological name.

### Authority is split across control planes

The system uses four control planes with different authority:

| Plane | Controls | Reads | Cannot do alone |
| --- | --- | --- | --- |
| Task | goals, quality, permitted actions | predictive state, user/tool feedback | hide physical or risk cost |
| Resource | energy, latency, communication, placement | estimates and measured telemetry | redefine task success |
| Adaptation | episodes, hypotheses, provisional modules | outcomes, conflict, uncertainty | promote a global slow-model change |
| Maintenance | replay, merge, weakening, deletion, topology | history, regressions, fragility, lifecycle cost | bypass provenance or release gates |

The planes exchange compact declared state. A resource controller can deny an
expensive route but cannot declare the cheaper result equally correct. A task
controller can request deeper computation but cannot conceal the resulting
traffic from the energy ledger. Adaptation can propose; only maintenance can
promote a change into protected state. A local corrective action also cannot
hide the shared-system cost it exports when the same trigger becomes
widespread ([C-1493](../research/claims.md#c-1493)).

### A typed-specialist controller remains a held research arm

One speculative implementation makes the coordinating loop explicit without
putting a general language model in charge. The controller would own run state,
route selection, specialist and memory access, tool authority, budgets,
deadlines, candidate arbitration, final output or action, and abstention. Each
specialist would receive a bounded typed request and return a typed candidate,
calibrated uncertainty or abstention, provenance, and a resource receipt. A
specialist could be a small neural model, estimator, solver, conventional
program, or tool. A language model would be one optional linguistic specialist,
not the controller or an assumed system-wide brain.

Capability boundaries would come from task contracts and demonstrated causal
contribution. Howard Gardner's eight multiple-intelligences categories are a
possible omission prompt for evaluation design, not eight model slots. Their
independence remains empirically contested, and a human ability label does not
establish a neural or artificial module boundary. The
[bounded source audit](../research/audits/2026-08-29-capability-coverage-typed-specialist-control.md)
preserves the proposal, contrary evidence, measurement dispute, and exact
limits of that analogy.

The development controller now makes this boundary executable for the frozen
CLRS shakedown. Every registered specialist needs a timestamped observation
with a finite validity window. Fit distinguishes `measured-fit`,
`known-no-fit`, and `unknown`; `unknown` is not a match. A `measured-fit`
observation must bind a caller-owned basis identifier, measurement time, and
bounded expiry, after which the controller treats it as `unknown`. The local
CLRS adapters use an additional construction-only `task-compatible` state
rather than claim a per-request resource measurement. Policy and adapter limits
still validate each packet.
Each frozen task accepts at most two route candidates. Route selection and a
one-shot, request-bound capacity reservation occur together. Per-specialist and
aggregate queue and active-work limits bound the controller alongside its wait
and readiness-retry limits. Eligible waiters are capacity-matched in FIFO order
across overlapping routes, so later work can use spare capacity without taking
a slot an older waiter can use. It records typed fallback or rejection, rechecks
readiness, cancellation and the request deadline inside the serialised state
immediately before invocation, and uses specialist identity as the stable
tie-break when declared cost and readiness are equal. An otherwise positive
recheck must match the recorded readiness and fit evidence; a newer observation
produces an explicit fallback instead of authorising an effect under the older
binding. This is a construction check of controller mechanics. It neither
measures an efficiency gain nor grants the resulting candidate scientific
authority; every path remains `NO_RESULT` pending the matched comparisons
described below.

The arm must face a capacity-matched general model and a tuned sparse mixture
of experts with the same tools, state, training opportunity, routing
information, hardware, and outcome access. Count controller work,
serialization, repeated context, communication, memory traffic, cold starts,
calibration, verification, retries, failed routes, maintenance, replacement,
latency tails, and measured energy. If an ordinary controller or router reaches
the same quality--risk--latency--energy frontier, the extra specialist boundary
leaves the architecture.

Evaluation need not demand that one complete architecture win every reported
axis. Before outcomes are opened, define task-quality and protected-risk floors,
comparators, uncertainty analysis, and the axes on which a component may earn
retention. Keep a component only when an independent ablation shows a
reproducible Pareto contribution without crossing those floors; an energy
reduction is particularly useful, but cannot buy lower declared quality or
hidden risk. Report every regression and interaction because separately useful
components need not compose additively.

A non-winning component moves to a versioned retest backlog with its negative
result, failed boundary, and strongest comparator. It is not rerun on a timer.
Reopening requires a predeclared concrete trigger: a stronger mechanism, a
changed workload or physical boundary, or new evidence that changes the tested
prediction. The retest then uses the current stronger baseline rather than the
one the component previously lost to. This portfolio rule is itself a research
hypothesis under [OQ-068](../research/open-questions.md#architecture), not an
accepted architecture decision.

### Governance is activated by a real authority problem

Aggregation rules, delegation, vetoes, constitutions, and participation are
not useful decorations for ordinary routing. They enter the architecture only
when persistent actors have decision-relevant private information, can benefit
from misleading reports, create spillovers across authority boundaries, hold
externally authorized protected standing, or must repair higher-order rules
without exposing them to ordinary updates.

When that applicability gate passes, the control plane records more than a
winning action:

1. the authorized objective and non-tradable invariants;
2. the actor's identity, scope, evidence, dependencies, and conflicts;
3. the proposal set, order, fallback, and omitted-alternative coverage;
4. every delegation edge, concentration measure, revocation, and cycle;
5. a veto's protected scope, severity, evidence, deadline, appeal, override,
   and expiry;
6. the decision and affected local and external interests; and
7. the rule version, amendment path, emergency authority, checked handoff,
   compatibility result, and rollback target.

### A decision record is more than evidence plus a score

Where an action is contestable and authority-bearing, the system keeps
normative authority, empirical evidence, formal inference, and procedural
validity as separate predicates. Authenticity, admissibility for a stated
purpose, weight, sufficiency under a burden, authorization, review, remedy, and
finality are not ranks on one confidence scale.

```mermaid
flowchart LR
    C["Claim · requested action · protected interests"] --> B["Authority · burden · decision rule"]
    E["Offered item + provenance + purpose"] --> A{"Authentic and admissible for purpose?"}
    A -->|"no"| X["Excluded item + preserved ruling"]
    A -->|"yes"| R["Contestable admitted record"]
    D["Disclosure · objection · response · contrary evidence"] --> R
    B --> F["Weight + sufficiency under burden"]
    R --> F
    F --> J["Reasons + disposition + remedy"]
    J --> V{"Authorized review / reopening?"}
    V -->|"affirm / final"| Z["Final versioned decision"]
    V -->|"vacate / remand / reopen"| C
    X --> V
    K["Conflict · recusal · independent assignment"] -.-> A
    K -.-> F
```

The record binds claim/action, authority, affected interests, proponent,
burden, evidence purpose and provenance, disclosure/access, objections,
contrary evidence, findings, reasons, decision, protected outcomes, review
scope, remedy, successor version, and reopening conditions. It records excluded
material so later review can test contamination without silently letting that
material influence the decision.

The [contestable-decision mathematics](../math/contestable-decision-record.md)
keeps error, delay, review, access, human work, energy, and protected procedure
as raw axes. Its evidence boundaries are
[C-679](../research/claims.md#c-679)–[C-704](../research/claims.md#c-704).
The composition must beat typed workflow, provenance, selective
prediction, access control, rule graphs, independent review, red-team
challenge, and full recomputation. It refines existing assurance, verification,
operational learning, observation, convention, and governance candidates; it
does not add a new control primitive.

```mermaid
flowchart LR
    O["Authorized objectives · protected invariants"] --> L["Scoped local authority"]
    L --> D["Decision + evidence + affected scope"]
    D --> G{"Within authority and risk envelope?"}
    G -->|"yes"| X["Execute · observe · record"]
    G -->|"spillover / conflict"| E["Escalate to overlapping review center"]
    E --> V["Typed veto · appeal · deadline · override"]
    V --> X
    X --> A["Versioned outcome and decision lineage"]
    A --> R{"Rule repair required?"}
    R -->|"no"| L
    R -->|"ordinary"| C["Propose · test · ratify · stage"]
    R -->|"emergency"| M["Scoped temporary authority + expiry"]
    C --> H["Compatibility · rollback · scheduled review"]
    M --> H
    H --> O
```

Editable source:
[constitutional-control-plane.mmd](../assets/diagrams/constitutional-control-plane.mmd).

The formal and empirical boundaries in
[C-368](../research/claims.md#c-368)–[C-395](../research/claims.md#c-395)
forbid several shortcuts: an impossibility theorem does not select a moral
objective; stability is not quality; participation is not legitimacy;
popular or expert influence is not automatically capture; and an amendment
count is not repair. Normative standing and non-tradable harms remain explicit
authorized inputs.

[Candidate 020](../experiments/candidates/020-constitutional-control-plane.md)
therefore has a deliberately hostile null: constrained optimization, typed
IAM and interlocks, policy-as-code, independent evaluation, separation of
duties, append-only lineage, runtime assurance, and mature incident/change
management. If those match the result—or if every module shares one loss and
directly verifiable state—the institutional composition is removed.

### A person in the loop must have an executable control path

A visible approval step does not establish oversight. Effective mixed control
requires a person to receive relevant state before the response deadline,
understand the current and pending mode well enough for the task, hold actual
authority over the consequential effect, execute an intervention, and observe
whether the intended state changed. Explanation, confidence, trust, reliance,
agreement, preference, and correctness stay separate.

Each machine-initiated or shared-control transition can therefore carry a
recoverable initiative record:

1. initiator, reason, urgency, and calibrated uncertainty;
2. actual mode, pending mode, enabled effects, and response deadline;
3. effective human and machine authority, including silent arbitration;
4. intended action, observed state delta, and provenance;
5. acknowledgement or rejection and whether it changed execution;
6. checkpoint, undo, compensation, or safe-stop boundary;
7. resumption cue, pending goals, and assumptions that may have gone stale;
8. verified recovery result, expiry, and longitudinal-learning link; and
9. accessibility and assistive-technology conditions under which the path was
   tested.

```mermaid
flowchart LR
    G["Human goal + constraints"] --> I["Initiator · reason · uncertainty"]
    I --> A["Actual/pending mode + effective authority"]
    A --> X["Bounded action on system/world state"]
    X --> O["Observed state delta + provenance"]
    O --> B["Human belief · acknowledgement"]
    B --> D{"Continue, intervene, defer, or abstain?"}
    D --> A
    X --> R["Checkpoint · undo/compensate · resumption cue"]
    R --> B
    R --> M["Outcome · recovery verification · expiry"]
    M --> I
```

Human time is part of lifecycle cost. For interruptions $j=1,\ldots,n$,

$$
T_{\mathrm{complete}}=T_{\mathrm{active}}+
\sum_{j=1}^{n}\left(T_{\mathrm{interrupt},j}+
T_{\mathrm{resume},j}+T_{\mathrm{rework},j}\right),
$$

with every term measured in seconds under a declared coding rule. Error
severity, stress, frustration, workload, training, and person-minutes remain
separate outcomes; throughput alone cannot erase them.

The bounded evidence in
[C-396](../research/claims.md#c-396)–[C-416](../research/claims.md#c-416)
supports specific interruption, mode, automation-bias, recovery, accessibility,
and adaptive-interface constraints. The combined record is still speculative,
so it refines Candidates 009, 011, 012, and 015 rather than becoming another
registry principle.

### State ownership

| State | Owner | Normal write path | Normal readers |
| --- | --- | --- | --- |
| Current predictive context | runtime | every event | selected runtime modules |
| Recent attributable experience | episodic memory | observed outcome | routing, adaptation, maintenance |
| Provisional hypotheses and modules | adaptation | bounded generation and trials | shadow runtime and evaluators |
| Reusable representation and skill | slow model | validated consolidation | encoders, predictors, experts |
| Mutable proposition | factual memory | sourced versioned update | retrieval router and task modules |
| Stable repeated transformation | hardened store | promotion pipeline | guarded low-cost dispatch |
| Resource and risk policy | budget controller | calibrated policy update | every gate and route |
| Low-dimensional operating context | context bus | rate-limited controller update | subscribed modules through receiver-local filters |
| Lifecycle and fragility state | maintenance | replay, probes, regressions | admission, reopening, pruning, rollback |

The plane table says who controls an operation; the state table says who may
write durable state. Each boundary becomes an ablation point: remove it, widen
it, delay it, or replace it with a conventional baseline and measure the
consequence.

### Intervention is a stateful chain

A commanded change is not its realized effect. Training intensity, routing
quota, memory injection, tool access, fallback support, pruning pressure, and
human escalation can each be delivered incompletely, arrive late, alter later
observations, produce different useful and harmful effects, and change the
system's future response. The contract therefore keeps this chain explicit:
([C-607](../research/claims.md#c-607)–[C-610](../research/claims.md#c-610),
[C-616](../research/claims.md#c-616),
[C-626](../research/claims.md#c-626)).

```mermaid
flowchart LR
    D["Commanded intervention · schedule · route"] --> X["Realized internal exposure"]
    X --> G["Engagement / activated mechanism"]
    G --> R["Proximal response"]
    R --> B["Task benefit vector"]
    X --> H["Protected harm vector"]
    G --> A["Adaptation · tolerance · sensitization"]
    A --> R
    A --> W["Dependence / withdrawal state"]
    C["Context · population · co-interventions · capacity"] --> X
    C --> R
    C --> H
    M["Versioned observation + selection process"] -.-> X
    M -.-> G
    M -.-> B
    M -.-> H
    B --> Q{"Continue · adjust · taper · stop?"}
    H --> Q
    W --> Q
    Q --> D
    Q --> V["Removal + rebound surveillance"]
    V -.-> W
```

The held system record includes commanded schedule; realized state; mechanism
engagement; benefit and protected-harm vectors; adaptation, dependence, and
withdrawal state; population/task/context support; observation provenance;
uncertainty; reserve; and permitted continuation, adjustment, taper, or stop.
Its scientific bounds are recorded in
[C-611](../research/claims.md#c-611)–[C-625](../research/claims.md#c-625).
It rejects three shortcuts:

1. activation or occupancy is not downstream benefit or safety;
2. equal cumulative input does not imply equal peaks, spacing, state, or
   recovery; and
3. removing support is a new dynamical intervention, so rollback continues
   through rebound, recurrence, native-capability, and reserve checks.

The [state-qualified intervention mathematics](../math/state-qualified-intervention.md)
defines the unit-bearing state, authority, interaction, and withdrawal tests.
The composition remains a domain track under Candidates 005/007/012/014 and
must beat Bayesian state-space estimation, constrained MPC/POMDP, calibrated
harm monitoring, and staged decommissioning at equal lifecycle cost.

### A plan, a commitment, and service are different states

Resource-bearing execution has an informational path and a physical path. A
forecast can change policy; policy can authorize an order, reservation, route,
or allocation; none of those creates qualified capacity, moves material,
finishes work, or proves service
([C-627](../research/claims.md#c-627),
[C-659](../research/claims.md#c-659)–[C-678](../research/claims.md#c-678)).
Filtration, internal recovery, reintroduction, final egress, storage change,
and transport work instantiate the same typed-state boundary
([C-1491](../research/claims.md#c-1491)).
The complete path is:

```mermaid
flowchart LR
    F["Forecast distribution + vintage"] --> P["Policy / optimizer"]
    D["Observed requests"] --> A["Admission + accepted demand"]
    A --> P
    R["Inventory / capacity records"] -.-> P
    P --> O["Orders · reservations · routes"]
    O --> C["Qualified physical capacity"]
    O --> K["Frozen commitments"]
    H["On-hand stock · age · condition"] --> W["Work / production / transport"]
    I["Pipeline stock + uncertain arrival"] --> W
    C --> W
    K --> W
    W --> L["Delivered quantity · time · condition"]
    L --> S["Realized service vector"]
    X["Disruption + common-cause state"] --> C
    X --> I
    T["Returns"] --> Q["Inspect · recover · scrap"]
    Q --> H
    H -.-> R
    I -.-> R
    M["Reconciliation + metric version"] -.-> R
    M -.-> S
```

This distinction applies when modules allocate physical devices, accelerators,
network paths, robot/tool capacity, spares, storage media, human attention, or
external services with lead time. Every decision-bearing record preserves:

1. forecast vintage, observed request, admission, and accepted commitment;
2. on-hand, reserved, quarantined, pipeline, and available-to-promise state;
3. qualified capacity, queue, route, setup, common-cause, and lead-time state;
4. dispatched versus delivered work, condition, completeness, and timing;
5. the service metric's denominator, clock, substitutions, and version; and
6. backlog, lost demand, returns, recovery yield, reserve replenishment, and
   second-event readiness.

The [material/service mathematics](../math/material-service-state.md) makes
conservation, service, and recovery units explicit. The held composition must
beat event sourcing plus inventory reconciliation, queueing, base-stock and
multi-echelon control, stochastic/robust optimization, and receding-horizon
planning with frozen commitments. It is an evaluation contract, not a new
allocation algorithm.

### Physical topology must remain valid while it changes

Logical routing can often switch within milliseconds and retry. Physical
topology cannot assume that abstraction when a transition moves barriers,
routes, utilities, controls, structure, people, or material. The system must
represent the intermediate configurations—not only the before and after
graphs.

The built-environment evidence in
[C-705](../research/claims.md#c-705)–[C-726](../research/claims.md#c-726)
adds a demanding test case. A plan, BIM model, sensor dashboard, command, and
verified physical state are separate records. Accessible use, egress,
tenability, structure, utilities, environmental service, evidence validity,
authority, and material commitment remain explicit through every work step.

```mermaid
flowchart LR
    N["Need · target service · affected users"] --> P["Versioned transition plan"]
    A["Verified as-built topology"] --> G{"Intermediate-state gate"}
    O["Occupancy · ability · assistance"] --> G
    R["Ordinary · accessible · emergency routes"] --> G
    F["Fire · smoke · ASET/RSET · impairments"] --> G
    S["Structure · utilities · controls · environment"] --> G
    U["Authority · permits · stop-work power"] --> G
    M["Material commitments · irreversible work"] --> G
    P --> G
    G -->|"evidence current + constraints pass"| W["Execute one bounded work step"]
    G -->|"support expired or constraint fails"| X["Abstain · restrict · decant · safe-stop"]
    W --> V["Inspect · test · reconcile physical state"]
    V --> Q{"Postconditions accepted?"}
    Q -->|"no"| X
    Q -->|"yes"| T["Advance topology version"]
    T --> G
    T --> C["Commission · verify service · restore reserve"]
    C --> E["Post-occupancy outcomes + lifecycle ledger"]
    E --> N
```

Editable source:
[occupancy-qualified-spatial-transition.mmd](../assets/diagrams/occupancy-qualified-spatial-transition.mmd).

This pattern is useful beyond buildings whenever reconfiguration has occupants,
physical inventory, slow work, external authority, or irreversible steps. Its
core rule is simple: a target state cannot authorize a path whose intermediate
states are invalid. Hard constraints remain a conjunction rather than a scalar
score; lost service stays visible by affected group; and “rollback” is claimed
only when the predecessor is still physically reachable.

The full [transition mathematics](../math/occupied-spatial-transition.md) and
[Candidate 001 stress track](../experiments/candidates/001-adaptive-topology.md#occupied-spatial-topology-track)
compare the composition against ordinary design review, permits, impairment
control, configuration management, commissioning, post-occupancy evaluation,
and lifecycle asset management at equal budget. If that mature stack ties it,
the extra composition is removed.

### After an outcome: adaptation proposes, maintenance decides

An outcome can influence the next event through working state or episodic
retrieval. Durable changes follow two paths with different authority:

| Path | Immediate work | Possible result |
| --- | --- | --- |
| Adaptation | capture an attributable episode; construct bounded proposals from existing fragments, relations, and abstractions | working-state change, hypothesis, or provisional module |
| Maintenance | score, replay, branch, compare, and account for lifecycle cost | retain, merge, externalize, weaken, delete, protect, reopen, relocate, prune, quantize, or compile |

Variation creates candidates; observed outcomes and controlled interventions
decide which survive. Bounded fragility probes remain on shadows or replicas and
are charged to the maintenance budget. Rapid reversible regulation and slow
structural adaptation remain different update processes whose cumulative
cost and reversal recovery must be scored separately
([C-1496](../research/claims.md#c-1496)).

The system may also create learning events: propose a structured hypothesis or
latent rollout, choose a bounded intervention, and evaluate the outcome. This
closed endogenous curriculum composes the evidence in
[C-061](../research/claims.md#c-061)–[C-066](../research/claims.md#c-066);
random variation supplies candidates, not validation. Its operations are
separated under equal budgets in
[Candidate 004](../experiments/candidates/004-closed-endogenous-curriculum.md).

The [memory lifecycle](40-memory-and-consolidation.md) governs evidence and
retention. The
[maturity lifecycle](50-grokking-and-pruning.md) governs protection, reopening,
and structural consolidation. A proposal remains scoped and attributable until
maintenance promotes it.

Every promoted structural action records:

1. a declared trigger;
2. a versioned candidate state;
3. protected historical and rare-case evaluations;
4. measured migration, validation, and recovery cost;
5. a promotion or rejection decision; and
6. a rollback target.

### Communication is a versioned state transition

A fluent message is not one state variable. The runtime keeps at least six
separate records:

1. typed literal payload and protocol version;
2. external referent, query, action, or constraint;
3. defeasible hypotheses about sender intention;
4. recipient-generated uptake state—received, parsed, understood-enough,
   accepted, rejected, or unresolved;
5. repair and supersession lineage; and
6. any resulting authority decision, which communication alone cannot grant.

This separation follows the evidence boundaries in
[C-268](../research/claims.md#c-268)–[C-281](../research/claims.md#c-281).
Composition is relative to a grammar and interpretation; pragmatic inference
depends on context and incentives; acknowledgement is not identical belief;
channel capacity is not semantic value; and population convergence is not
grounding, truth, or safety.

```mermaid
flowchart LR
    W["World · task · private observation"] --> M["Typed literal message"]
    M --> P["Defeasible pragmatic hypotheses"]
    P --> U["Recipient uptake state"]
    U --> Q{"Clear enough for this task?"}
    Q -->|"no"| R["Clarify · repair · reject"]
    R --> M
    Q -->|"yes"| A["Bounded task action"]
    A --> O["Observed outcome"]
    O --> C["Sandboxed convention candidate"]
    C --> G["Cross-play · newcomer · protected-meaning gates"]
    G -->|"fail"| X["Expire · withdraw · roll back"]
    G -->|"pass"| V["Publish version + migration"]
    V --> M
```

Editable source:
[versioned-repairable-conventions.mmd](../assets/diagrams/versioned-repairable-conventions.mmd).

A local shorthand remains session-scoped until independent interpreters recover
its declared denotation, older and newcomer agents pass cross-play, corrupted
or version-mismatched messages trigger bounded repair, protected rare meanings
survive, and migration plus rollback have been exercised. The full lifecycle is
tested in
[Candidate 015](../experiments/candidates/015-versioned-repairable-conventions.md)
against typed protocols, schema registries, acknowledgements, replicated logs,
calibrated inference, standard coding, and explicit migration.

### Capability can cross learner turnover without staying inside one learner

A repository, demonstration, or popular practice is not yet cumulative
inheritance. The system must expose six different operations:

1. **Generate:** produce a variant by invention, reconstruction, imitation, or
   recombination.
2. **Transmit:** identify exactly which actions, outcomes, explanations,
   artifacts, tests, and environmental state reach the next learner.
3. **Evaluate:** test the reconstructed capability independently rather than
   crediting popularity, prestige, or successful transmission as usefulness.
4. **Retain:** place accepted capability, evidence, failures, and lineage in a
   form that a newcomer can retrieve and interpret.
5. **Govern:** control compatibility, authority, appeal, migration, and
   retirement without treating a convention as truth.
6. **Survive turnover:** repeat the cycle with a genuinely new learner and a
   protected test suite.

```mermaid
flowchart LR
    G["Generate · imitate · reconstruct · recombine"] --> T["Versioned transmission channel"]
    T --> L["Independent learner / newcomer"]
    L --> E["Outcome + protected evaluation"]
    E --> D{"Retain, revise, branch, or reject?"}
    D -->|"retain"| A["External artifact + lineage"]
    D -->|"revise"| G
    D -->|"reject"| X["Negative result + retirement"]
    A --> V["Governance · compatibility · appeal"]
    V --> N["Turnover / next generation"]
    N --> T
    V --> R["Audit · invalidate · migrate"]
    R --> A
```

Editable source:
[audited-cumulative-inheritance.mmd](../assets/diagrams/audited-cumulative-inheritance.mmd).

For generation $g$, a deliberately simple capability ledger is

$$
K_{g+1}=q_gK_g+I_g+R_g-D_g,
$$

where $K_g$ is validated capability in a declared task-score unit, $q_g$ is
the dimensionless retained fraction, $I_g$ is independently generated
improvement, $R_g$ is validated recombination gain, and $D_g$ is degradation
or compatibility loss in the same task unit. These terms are accounting fields,
not a claim that capabilities are generally additive; protected outcomes stay
visible beside the aggregate.

Raw population size also overstates diversity when every learner sees the same
few lineages. If exposure weights are $\pi_i$ and $\sum_i\pi_i=1$, then

$$
N_{\mathrm{eff}}=\frac{1}{\sum_i\pi_i^2}
$$

is the dimensionless effective number of equally exposed models. It measures
attention concentration—not competence, independence, or complexity.

The evidence in [C-343](../research/claims.md#c-343)–[C-367](../research/claims.md#c-367)
supports bounded cultural accumulation, conditional social-information use,
material scaffolding, and severe archaeological inference limits. It does not
establish a population advantage for artificial learners. That residual is
isolated in
[Candidate 019](../experiments/candidates/019-audited-cumulative-inheritance.md),
which must beat centralized continual learning, replay, version control,
retrieval, workflow engines, quality-diversity search, and fixed governance at
equal cumulative effort.

### Live response and longitudinal learning are separate loops

The runtime may need to contain a failure before its cause is known. Later
analysis may identify a cause without improving the next live response. A
usable operational-assurance plane therefore connects two loops without
collapsing them:

| Loop | Deadline | Required state transition | Failure if measured alone |
| --- | --- | --- | --- |
| Live response | seconds to minutes | detect, acknowledge, assign scoped authority, contain, degrade, revoke, roll back, restore | fast containment can recur because no verified change enters future operation |
| Longitudinal learning | releases to months | retain competing traces, analyze, bind a finding to dependencies and an owner, test, deploy, verify, retrieve, retire | a complete report can arrive after preventable damage and may never change operation |

Report volume is observation-biased. Over a declared exposure interval,

$$
N_{\mathrm{report}}=N_{\mathrm{precursor}}
p_{\mathrm{detect}}p_{\mathrm{report}}p_{\mathrm{retain}},
$$

where both $N$ values are event counts and every $p$ is a dimensionless
conditional probability. A low count can mean low exposure, weak detection,
reporting friction, fear, or deletion; a high count can mean hazard, improved
coverage, duplication, or gaming ([C-178](../research/claims.md#c-178)).

Likewise, an incident archive becomes memory only when an applicable lesson is
retrieved, used, evaluated, invalidated, and retired
([C-184](../research/claims.md#c-184)). The held composition binds live traces
and precursor detections to scoped response, dependency-linked changes,
protected tests, verified outcomes, retrieval triggers, and retirement.
[Candidate 011](../experiments/candidates/011-dual-loop-operational-assurance.md)
compares it with a complete SRE stack and rejects it if role, interruption,
reviewer, storage, stale-memory, or coordination cost erases the gain.

### Build the system in dependency order

The full system should be assembled through progressively stronger contracts:

1. Establish dense and conventional modular baselines with one physical
   measurement boundary.
2. Measure isolated-versus-connected behavior and retain immutable-copy,
   queueing, resource-isolation and explicit-feedback nulls before composing
   modules.
3. Align observation, action, outcome, location, and time before adding learned
   routing.
4. Introduce conditional execution and measure activation, data movement, and
   dispatch overhead.
5. Add attributable episodic memory without granting it slow-model write
   authority.
6. Add replay and consolidation under fixed maintenance budgets, then admit
   provisional modules only for measured capability gaps.
7. Test reversible protection, reopening, and structured pruning before
   promoting repeated behavior into cheaper paths.
8. Learn logical routing and physical placement together only after their
   separate baselines are stable.
9. Run continual operation with drift, conflict, newcomer admission, recovery,
   and complete lifecycle accounting.

Each stage keeps the strongest baseline from the previous one. A later
mechanism cannot hide an earlier regression behind a higher aggregate score.

## Efficiency mechanism

The architecture seeks three compounding reductions:

- **activation:** execute a small relevant subset of stored capacity;
- **movement:** keep repeated computation near the state it uses; and
- **reinterpretation:** convert stable repeated work into cheaper memory,
  precision, routing, or compiled paths.

Before execution, the resource plane prices the proposed route. Afterward,
measured telemetry corrects that estimate. Hard risk floors remain constraints
rather than terms that average efficiency can trade away.

Those reductions are useful only after control overhead is included. Lifecycle
energy is therefore

$$
E_{\mathrm{life}}
= E_{\mathrm{runtime}}
+ E_{\mathrm{memory}}
+ E_{\mathrm{network}}
+ E_{\mathrm{adaptation}}
+ E_{\mathrm{maintenance}}
+ E_{\mathrm{recovery}},
$$

with every term measured in joules over the same workload and system boundary.
The [energy model](80-energy-model.md) defines the full comparison contract.

## Evidence status

| Ingredient | Claim range | Status in this synthesis |
| --- | --- | --- |
| Conditional routing and early exit | C-003–C-004 | available engineered mechanisms |
| Predictive representation and residual allocation | C-005–C-007 | plausible runtime composition |
| Fast/slow memory and protection | C-008–C-010 | scoped evidence; lifecycle policy experimental |
| Structural pruning and hardening | C-012–C-015 | individual mechanisms available; promotion logic unvalidated |
| Sensorimotor control and local autonomy | C-017–C-024 | biological and engineered constituents |
| Replay, reconsolidation, and forgetting | C-036–C-042 | scoped observations; combined controller speculative |
| Maturation, reopening, and contextual control | C-043–C-051 | scoped interventions; digital translations experimental |
| Collective coordination and resilience | C-052–C-060 | scoped observations; quorum and fragility translations experimental |
| Endogenous generation and exploration | C-061–C-066 | constituent observations; integrated curriculum speculative |
| Communication and convention lifecycle | C-268–C-281 | constituent mechanisms established or scoped; versioned repairable composition speculative |
| Cumulative inheritance across turnover | C-343–C-367 | bounded constituents established or scoped; population advantage unvalidated |
| Institutional authority and rule repair | C-368–C-395 | formal constraints and bounded evidence; multi-level composition speculative |
| Human initiative, authority, and recovery | C-396–C-416 | bounded HCI effects; combined record speculative |
| Connection-induced back-action and bounded insulation | C-1550–C-1559 | scoped biochemical evidence; digital residual and energy advantage unvalidated |
| Complete integrated system | none | unvalidated project synthesis |

## Speculative extensions

- Modules bid for compute using expected task-value improvement per joule while
  hard risk and communication limits remain external constraints.
- Local clocks and queues replace a global synchronous step where causality and
  hardware permit it.
- Routing, memory placement, interconnect, and precision are learned jointly.
- Replicas run alternative maintenance decisions and compare later outcomes
  before one state becomes canonical.
- External tools and sensors become active experiments chosen for information
  gain, not passive input channels.

## Failure modes

- A shared predictive state becomes a dense communication bottleneck.
- Task, resource, adaptation, and maintenance controllers oscillate or reward
  incompatible behavior.
- Routing overhead and scattered memory access erase activation savings.
- Episodic and factual stores disagree without an explicit conflict policy.
- Maintenance, regression, and recovery consume more energy than runtime saves.
- Premature hardening turns shortcuts or mutable facts into rigid behavior.
- Aggregate quality hides rare-case regression, fragility, or failed recovery.
- A scalar resilience score hides opposing resistance, recovery, adaptability,
  and newcomer-admission effects.
- Proposal generation collapses into high-temperature sampling without
  targeted intervention and outcome-based selection.
- Fluent exchange creates false common ground, silent semantic drift, or local
  conventions that newcomers and older versions cannot interpret or reject.
- A population receives credit for cumulative learning when it only performs
  more parallel search, preserves a headline score while losing rare skills,
  or copies one correlated lineage through every nominally independent agent.
- Governance vocabulary hides an ordinary optimizer, or veto, delegation,
  amendment, and participation add gridlock, capture, concentration, churn, or
  oversight cost without improving task-native or protected outcomes.
- A nominal human approval, explanation, or confidence display is credited as
  assurance even though state is stale, the mode is misunderstood, authority
  is ineffective, intervention arrives late, or recovery cannot change the
  world state.
- A module passes alone, then a new consumer changes its state or update path;
  or an always-on insulator deletes useful service while hiding copy, buffer,
  admission, replica, monitoring, and maintenance work.
- The architecture accumulates mechanisms faster than experiments can reject
  them.

## Measurable predictions

1. Conditional routing reduces measured runtime data movement and energy at
   matched quality, calibration, and tail risk.
2. Attributable episodic memory improves adaptation latency without increasing
   protected slow-model regression.
3. Maintenance and structural consolidation reduce lifecycle cost after replay,
   validation, migration, and recovery are counted.
4. Separating factual propositions from reusable skills lowers correction cost
   and unsupported factual carryover.
5. Reversible maturation gates improve retention and relearning relative to
   fixed regularization, fixed pruning schedules, and naive fine-tuning.
6. Versioned uptake, repair, and cross-play gates reduce silent semantic failure
   under agent and protocol drift beyond a complete fixed-protocol stack.
7. Connection-qualified modules preserve producer trajectories and accepted
   consumer service across held-out client topologies; selective insulation
   activates only where it improves the complete non-dominated frontier.
8. Audited turnover retains and recombines more protected capability than a
   centralized continual learner at equal cumulative learning, coordination,
   storage, migration, and energy cost—or the population mechanism is retired.
9. Multi-level authority improves an applicable task-native or protected-harm
   frontier beyond the complete ordinary governance stack after gridlock,
   capture, concentration, human attention, and lifecycle cost—or it is merged.
10. A recoverable initiative record predicts failures beyond polished mode
   labels, previews, confirmations, undo/history, logs, runtime assurance, and
   user testing on consequential and accessibility-stratified tasks—or only
   its individually supported fields remain.
11. The integrated system occupies a better quality–risk–latency–energy frontier
   than every component ablation and the strongest ordinary controller,
   scheduler, cache, and router baselines.
