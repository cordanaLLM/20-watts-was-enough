# Candidate 015: versioned, repairable conventions

**Stage:** 1 — semantic-drift, cross-play, and lifecycle falsification

**Status:** held systems composition; not an accepted project claim

**Primary question:** can heterogeneous agents adapt local message forms under
task and population drift while preserving explicit meaning, acknowledgement,
repair, compatibility, and rollback better than a fixed typed protocol with a
schema registry and mature migration practice at equal complete budget?

## Candidate statement

The runtime keeps literal content, inferred intention, partner state,
acknowledgement, evidence, and authority as separate fields. An agent may use a
local shorthand only inside a declared scope. Durable publication requires
measured uptake, independent interpretation, cross-play, protected-meaning
tests, compatibility, and a prepared rollback.

The candidate is a lifecycle composition, not a claim that “language” is one
mechanism. Formal composition, pragmatic inference, repair, timing, channel
coding, cultural transmission, grounding, and convention formation retain
their own assumptions and null models
([C-268](../../research/claims.md#c-268)–[C-281](../../research/claims.md#c-281)).

## Message and convention contract

| Field | Meaning | Lifetime | Release condition |
| --- | --- | --- | --- |
| message identity and lineage | immutable message plus quoted, repaired, and superseded links | archive | identity never reused |
| sender, recipient, session | authenticated actor and intended coalition | turn/session | access policy passes |
| literal payload and schema | typed content under one protocol version | release | conformance tests pass |
| referent or goal | external entity, state, query, action, or constraint | task-defined | provenance or resolver exists |
| epistemic status | observation, hypothesis, request, inference, decision, or correction | claim-defined | syntax cannot upgrade it |
| confidence and domain | quantified uncertainty and calibration regime | model version | calibration evidence exists |
| pragmatic hypotheses | ranked intended meanings beyond literal content | turn/session | consequential ambiguity triggers clarification |
| acknowledgement state | received, parsed, understood-enough, accepted, rejected, unresolved | session/task | only the recipient supplies uptake evidence |
| repair lineage | trouble source, correction, resolver, and outcome | session/archive | original remains inspectable |
| convention candidate | local form mapped to explicit semantics and scope | sandbox/session | promotion gates pass |
| protocol status | experimental, published, deprecated, withdrawn | release/archive | maintenance decision recorded |
| expiry and rollback | expiration and last compatible mapping | field-specific | rollback tested before release |

The contract deliberately spends redundancy on audit and recovery. A lower-risk
path may compress fields only by referencing an immutable record from which
they can be reconstructed.

## Lifecycle

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

## Promotion gates

1. **Denotation:** independent interpreters recover the declared referent,
   action, query, or constraint on held-out examples.
2. **Systematic transfer:** novel combinations are separated from memorized
   messages and evaluated by task outcome.
3. **Cross-play:** older, newer, and independently trained agents communicate
   without co-training with the proposer.
4. **Repair:** corrupted, underspecified, and version-mismatched messages yield
   bounded clarification or safe rejection, not silent commitment.
5. **Incentives:** pragmatic expectations cannot grant authority to malicious
   or partially aligned senders.
6. **Protected meanings:** rare, safety-critical, and subgroup-specific
   distinctions survive transmission.
7. **Compatibility:** negotiation, migration, dual-read/write where needed,
   expiry, and rollback are exercised.
8. **Cost:** message, compute, storage, repair, migration, and review improve
   the declared frontier beyond the complete null stack.

## Cost vector

Report

$$
\mathbf c=
(B_{\mathrm{tx}},T_{50},T_{99},E_{\mathrm{enc}},E_{\mathrm{dec}},
N_{\mathrm{repair}},S_{\mathrm{state}},H_{\mathrm{review}}),
$$

where $B_{\mathrm{tx}}$ is transmitted bits per completed task; $T_{50}$ and
$T_{99}$ are milliseconds; encoder and decoder energies are joules per
completed task; $N_{\mathrm{repair}}$ is a count; $S_{\mathrm{state}}$ is
retained bytes; and $H_{\mathrm{review}}$ is human minutes. Semantic and safety
constraints remain visible rather than becoming cheap scalar penalties.

## Strongest null stack

- fixed typed protocol or domain-specific language;
- schema registry, semantic versioning, compatibility tests, and migration;
- authenticated identity, scoped authorization, and provenance;
- acknowledgements, NACKs, retry, timeouts, and bounded clarification;
- calibrated literal and probabilistic reference resolution;
- append-only logs, version vectors, replicated partner state, and expiry;
- standard compression and forward-error correction; and
- human-authored protocol governance with canary release and rollback.

## Equal-budget experiment family

For every family, replay the same task instances, sender observations, partner
histories, channel faults, schema changes, and adversarial events across arms.
Equalize training examples, answer exposure, optimizer updates, model capacity,
inference work, transmitted and retained bytes, permitted repair turns, wall
time, energy boundary, migration opportunities, and human review. If an arm
does not use an allowance, record the unused amount rather than reallocating it
after outcomes are visible. Preparation, compatibility, rollback, and failed
repair work remain inside the comparison boundary.

### A — composition and reference

Use typed primitives, nested relations, lexical ambiguity, hidden sender
observations, asymmetric histories, and cooperative through adversarial
incentives. Compare an end-to-end sequence model, typed DSL, semantic parser,
literal listener, calibrated pragmatic model, emergent code, direct
clarification, and the candidate. Match examples, optimizer work, storage,
messages, and inference compute. Measure exact denotation, novel-combination
success, calibration, regret, deception, clarification, and authority errors.

### B — false common ground and repair

Inject packet loss, delayed delivery, stale schemas, private observations,
misleading receipts, malformed or deceptive messages, and population churn.
Compare assumed shared context, replicated blackboard, append-only log with
acknowledgements/version vectors, schema NACK/retry, threshold clarification,
and the candidate. Measure false-common-ground commitments, contradictory
actions, repair precision/recall, loops, tail latency, state bytes, repair
traffic, and partition recovery.

### C — timing and noisy channels

Vary compute/network delay, simultaneous discoveries, urgent interrupts,
channel error, bandwidth, shared-prior drift, tail importance, and decoder
mismatch. Compare central priority queue, leases, actor mailboxes, learned
turn-taking, raw typed messages, standard compression plus error correction,
learned task codecs, emergent codes, and the candidate. Measure collisions,
deadline misses, starvation, transmitted bits, native-unit distortion,
catastrophic-tail errors, encoder/decoder energy, repair bytes, and wasted work.

### D — transmission, drift, and grounding

Run independent chains and interacting populations with turnover, task change,
minority meanings, adversaries, novel objects, non-shared sensors, and embodied
actions. Compare fixed-reference training, distillation, Bayesian iterated
learning, naming games, explicit schema migration, external IDs plus state
estimation, active grounding, and the candidate. Measure rare-meaning retention,
cross-play, newcomer sample complexity, drift, subgroup compatibility,
counterfactual action, rollback, and cumulative cost.

### E — strategic adoption

Vary topology, status, incentives, coordinated manipulators, and turnover; seed
useful, neutral, ambiguous, and harmful variants at equal frequency. Compare
popularity adoption, outcome selection, controlled standards governance, and
the candidate. Measure adoption curves, task utility, subgroup error,
manipulation, fragmentation, migration burden, and rollback time.

## Outcomes and measurements

Report every outcome by task family, partner lineage, protocol-version pair,
incentive regime, and held-out stratum before any aggregate. Required native
measurements are:

| Outcome | Unit and denominator |
| --- | --- |
| task completion and exact denotation | fraction of eligible tasks or messages |
| novel-combination and independent cross-play success | fraction of preregistered held-out trials |
| calibration | dimensionless Brier score or declared calibration error |
| false-common-ground, contradictory-action, and authority errors | event count and events per eligible message or task |
| protected-meaning retention and subgroup compatibility | fraction within each registered protected stratum |
| repair precision and recall | dimensionless fractions over registered repair opportunities |
| clarification and repair burden | repair turns per task and repair bytes per task |
| median and tail completion latency | milliseconds from first send to terminal outcome |
| communication and retained state | transmitted bits per completed task and stored bytes |
| encoder, decoder, synchronization, and migration energy | joules per completed task at the declared boundary |
| rollback and partition recovery | seconds to the registered restored state |
| migration and review work | person-minutes and machine-seconds per released version |

Timeouts, rejected messages, and unresolved repairs remain in their original
denominators. Task utility, semantic correctness, safety, and cost stay as a
vector unless conversion weights were authorized and frozen before allocation.

## Confirmatory analysis and statistical plan

Pair arms on task seed, sender observation, partner history, protocol versions,
fault schedule, and adversarial intervention. Freeze models, migration rules,
clarification policies, outcome code, and the primary fixed-protocol comparator
before opening held-out composition templates, independently trained partner
lineages, schema transitions, and task regimes. The independent unit is the
predeclared session or population lineage, not each message within it.

For each experiment family, preregister one primary candidate-versus-complete-
null contrast and its primary semantic or task outcome together with the full
cost vector. Estimate paired differences with uncertainty intervals using a
hierarchical model or cluster bootstrap that preserves task, partner, and
version dependence. Report distributional and tail outcomes rather than only
means. Calibration analyses retain the predictions issued before feedback.

Gate secondary outcomes behind the primary contrast or control their familywise
error across the five experiment families with a declared step-down procedure.
Protected-meaning, authority-error, and catastrophic-tail endpoints are reported
separately even when sparse; they are not pooled away by an aggregate utility.

Missing telemetry is reported by arm and cause. Delivery failure, agent
dropout, safe rejection, unresolved clarification, rollback failure, and
deadline exhaustion are outcomes, not removable rows. Right-censor completion
or recovery time at the registered horizon and include worst-case and bounded
sensitivity analyses for any remaining outcome missingness. Do not use
complete-case analysis as the primary result.

Apply the existing promotion and kill rules once, ex ante, to the held-out
estimates and uncertainty intervals. Any acceptance margin must come from a
registered task or safety requirement, measurement resolution, or comparator
variability; it is not selected from these results. An exploratory win may
narrow or motivate a new contract but cannot promote this candidate.

## Ablations

1. Collapse literal payload and inferred intention.
2. Treat delivery acknowledgement as understanding or acceptance.
3. Remove partner/session scope from common-ground state.
4. Promote a convention from frequency alone.
5. Remove explicit referent or action mapping.
6. Remove newcomer and independently trained cross-play.
7. Remove protected rare meanings.
8. Remove version negotiation and dual-read/write.
9. Overwrite repaired messages instead of retaining lineage.
10. Count transmitted tokens while omitting decoder, synchronization, repair,
    migration, and human-review cost.

## Promotion rule

### Interaction stability and recovery gate

For human-facing conventions, compare adaptive presentation with a polished
stable interface and a user-adaptable baseline. Preserve location or other
operational invariants where possible; expose version, changed mapping,
effective action, undo/compensation, resumption state, and rollback. Preference,
trust, acceptance, comprehension, correctness, and accessibility are separate
outcomes ([C-401](../../research/claims.md#c-401),
[C-406](../../research/claims.md#c-406),
[C-409](../../research/claims.md#c-409),
[C-411](../../research/claims.md#c-411)–[C-414](../../research/claims.md#c-414)).


Advance only if the candidate improves transfer or adaptation under genuine
requirement or population drift while reducing silent semantic failure, and
does so beyond the complete fixed-protocol null at equal end-to-end budget.
Wins must survive heterogeneous agents, asymmetric context, protected meanings,
adversarial senders, newcomer admission, version skew, and rollback.

## Kill criteria

Reject or narrow the candidate when:

- learned forms cannot compile to explicit testable denotation or action;
- reward rises while cross-play, newcomer learning, or protected meanings fall;
- pragmatic inference bypasses schema, provenance, or authority;
- repair loops create unbounded latency or denial of service;
- standard scheduling, coding, entity registries, replicated logs, or explicit
  schema migration match the outcome at lower lifecycle cost;
- consensus or centrality promotes harmful forms;
- old agents cannot negotiate, interpret, or safely reject the new version;
- rollback cannot reconstruct former mappings and affected messages; or
- surface brevity disappears after decoder, repair, synchronization, migration,
  storage, and review cost are charged.

## Evidence links

- [Linguistics and communication audit](../../research/audits/2026-08-05-linguistics-communication.md)
- [P-002](../../research/principle-registry.md#p-002--local-autonomy-with-exception-escalation)
- [P-003](../../research/principle-registry.md#p-003--temporary-trace-before-commitment)
- [P-007](../../research/principle-registry.md#p-007--prediction-error-allocation)
- [P-009](../../research/principle-registry.md#p-009--maintenance-plane)
- [P-011](../../research/principle-registry.md#p-011--transient-communication-coalitions)
- [P-012](../../research/principle-registry.md#p-012--memory-matched-to-information-lifetime)
- [P-013](../../research/principle-registry.md#p-013--externalized-shared-state)

## Burden-qualified contestable-decision track

The [legal evidence/procedure audit](../../research/audits/2026-08-05-legal-evidence-procedure.md#candidate-coverage-and-exact-refinements)
requires every rule-like precedent to carry jurisdiction, authority hierarchy,
holding/rule identity, material-fact and issue map, effective date, negative
treatment, overruling/deprecation, retroactivity/applicability, and successor
version. Semantic similarity may retrieve candidates but cannot make a lower,
foreign, superseded, or factually distinguishable record controlling.

Evidence: [C-679](../../research/claims.md#c-679)–[C-704](../../research/claims.md#c-704).

Test hierarchy conflict, changed facts, negative treatment, partial
supersession, prospective versus retroactive change, stale caches, and
downstream subscribers. Compare versioned rules engines, citation graphs,
temporal knowledge graphs, and manual applicability checks at equal review,
latency, bytes, compute, and energy. Reject if a conventional authority graph
matches applicable-rule selection and invalidation or if finality is mistaken
for immutable truth.

## Ritual and instrumental-practice track

The [theology and religious-practice audit](../../research/audits/2026-08-21-theology-religious-practice-ritual.md)
adds a synthetic test of a boundary this candidate could otherwise erase:
instrumental procedures, conventional or ritualized sequences, interpretations,
protected commitments, and authorization rules are different semantic types.
Form fidelity, affiliation, synchrony, sacrifice, or survival through a
transmission chain cannot inherit truth, competence, cooperation, or outcome
evidence ([C-1249](../../research/claims.md#c-1249)–[C-1255](../../research/claims.md#c-1255)).

Run the five `WS-REL` fixtures with synthetic practices only. Compare explicit
instrumental schemas, opaque fixed sequences, delete-and-insert transmission,
ordinary versioned workflow, typed practice records, and the candidate. Keep
sequence fidelity, task success, source-reliability inference, affiliation,
coordination, correlated failure, protected-value violations, abstention,
interpretive-policy drift, rollback, human work, and joules as separate
outcomes. Pre-register active-component nulls for order, repetition, synchrony,
cost, framing, authority label, and shared history.

Reject this track if the candidate:

- copies causally irrelevant steps more reliably but labels that as task value;
- treats an expensive display as evidence that its content is true;
- converts a protected commitment or refusal right into a large scalar reward;
- infers real religious belief, affiliation, or sacred knowledge; or
- cannot distinguish canon version, interpretive policy, local practice,
  authority, permitted variation, and downstream invalidation.
