# Candidate 020: constitutionalized multi-level control plane

**Stage:** 1 — authority, aggregation, and rule-repair falsification

**Status:** held institutional composition; not an accepted project principle

**Primary question:** when persistent modules have asymmetric information,
partially conflicting incentives, or externally authorized standing, does
scoped multi-level authority with typed veto, contestable agenda, revocable
delegation, and versioned rule repair outperform ordinary systems governance?

## Applicability gate

Do not run this candidate when modules share one objective, cannot benefit from
misreporting, expose directly verifiable state, and operate under one
authorized owner. In that regime, constrained optimization, IAM, workflows,
and ordinary review should win. Political vocabulary does not create a
mechanism ([C-368](../../research/claims.md#c-368)–[C-395](../../research/claims.md#c-395)).

The candidate is applicable only when at least one of the following is real
and measurable:

1. persistent private information that matters to a shared decision;
2. local incentives that can benefit from a misleading report or agenda;
3. cross-boundary spillovers that no single local controller observes;
4. externally authorized protected interests that aggregate reward may not
   trade away; or
5. higher-order rules that must resist ordinary updates yet remain repairable.

## Control lifecycle

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

## Comparison vector

Report outcomes as

$$
\mathbf z=(Q,E,T,B,H_{\max},G,C,R,U),
$$

where $Q$ is task quality in a declared task unit, $E$ energy in joules, $T$
latency in seconds, $B$ communication in bytes, $H_{\max}$ worst protected-
interest loss in the task unit, $G$ unresolved-decision time in seconds, $C$
capture/influence diagnostics as declared dimensionless indices, $R$ rule
changes per $10^3$ episodes, and $U$ human oversight in person-minutes. Do not
collapse these units without authorized conversion weights and sensitivity
analysis.

Delegation concentration uses the Herfindahl index

$$
H_d=\sum_{i=1}^{n}w_i^2,
$$

where $w_i\ge0$ is proxy $i$'s fraction of active decision weight and
$\sum_iw_i=1$. $H_d$ is dimensionless and says nothing by itself about
competence, legitimacy, or correctness.

## Strongest null stack

1. one declared objective plus non-tradable constraints;
2. calibrated prediction and uncertainty;
3. typed IAM/capabilities and deterministic interlocks;
4. constrained or model-predictive control with spillover terms;
5. independent test ownership and randomized withheld evaluation;
6. static separation of duties and conflict disclosure;
7. fixed typed protocols, schema registry, and compatibility tests;
8. append-only decision, evidence, and change lineage;
9. mature incident command, rollback, and postmortems;
10. switching-cost-aware exploration and protected canaries; and
11. human authorization of standing, protected interests, exceptions, and
    amendment rules.

## Matched-budget and resource parity

Pair governance arms on objectives and protected invariants, private
information, proposal set and order, evaluator assignments, shocks, fault and
capture seeds, action authority, and decision deadlines. Equalize observations,
models, sensors, actuators, reserve, proposal and evaluator calls, messages,
compute, storage, deployment windows, measured energy, enforcement capacity,
accessibility support, and human person-minutes. Charge appeals, recusals,
replacement reviewers, veto delay, emergency handoff, rollback, compatibility,
and rule maintenance to the arm that invokes them. An unresolved decision or
unused authority budget is reported rather than silently replaced after the
outcome is known.

## Experiment families

### A — aggregation, strategy, and agenda

Cross binary agreement, restricted preference domains, cycles, correlated
errors, private stakes, omitted alternatives, proposal order, and fallback.
Compare constrained optimization, scoring, pairwise/Condorcet rules,
randomized choice, independent proposal channels, and the candidate at equal
observations, proposal calls, messages, and compute.

### B — delegation and revocation

Cross topic competence, correlated misinformation, cycles, super-proxies,
compromise, and identity reset. Compare direct choice, calibrated competence
routing, local delegation, optimized delegation, and capped revocable
delegation. Measure error, calibration, $H_d$, cycle rate, revocation latency,
error amplification, bytes, and joules.

### C — central, local, and overlapping authority

Use heterogeneous local demand, shared scarcity, spillovers, correlated faults,
and local capture. Compare global control, hierarchy/sharding, local autonomy
with exception escalation, and overlapping centers at equal models, sensors,
actuators, reserve, compute, and communication.

### D — typed veto and protected-interest frontier

Cross rare catastrophic protected loss with benign noisy warnings. Compare
scalar reward, hard constraints, quorum, independent veto, and typed veto with
scope, evidence, appeal, deadline, override, and expiry. Include status-quo
harm and gridlock; retire this component if ordinary constraints dominate.

### E — capture and collective-action pressure

Give persistent modules costly maintenance contributions and private influence
over proposals, tests, telemetry, or evaluators. Cross real expertise with
connection so capture can be distinguished from competent influence. Compare
central provision, fixed contracts, separation of duties, evaluator rotation,
independent raw evidence, and Candidate 008.

### F — constitutional repair and emergency authority

Expose immutable rules, administrator overwrite, policy-as-code, and the
candidate to legitimate drift, incumbent self-dealing, urgent hazards, stale
emergency state, and irreversible transitions. Equalize tests, reviewers,
deployment windows, and storage; measure unauthorized change, rule churn,
severe-harm escape, rollback, emergency duration, and restoration latency.

### G — human participation and path dependence

Where humans authorize objectives, compare representative review, direct
participation, deliberative sampling, and stratified contestable review at
equal person-minutes and accessibility support. Separately randomize early
exposure, evaluator assignment, conventions, and authority, then match final
conditions and ablate reinforcement mechanisms.

## Confirmatory analysis and statistical plan

Pair arms on scenario seed, information allocation, proposal order, reviewer
and proxy identities, protected-interest exposure, faults, shocks, and action
opportunities. Freeze standing, authority, conflict and recusal rules,
aggregation and veto procedures, emergency expiry, outcome definitions, and
human-authorized conversion weights before revealing held-out task families,
strategic identities, correlated-model failures, rare protected harms, and
legitimate rule drift. Treat an independently generated scenario or governance
lineage as the sampling unit; decisions, appeals, and participants within it
remain clustered.

The confirmatory comparison is the candidate against constrained optimization
plus typed IAM, deterministic interlocks, independent evaluation, append-only
lineage, and ordinary incident governance under the matched resource vector.
Estimate paired effects and uncertainty with a scenario-level hierarchical
model or cluster bootstrap. Report task quality, worst protected-interest loss,
unresolved-decision time, capture diagnostics, authority violations, and the
complete lifecycle vector; a higher decision count or amendment rate is not a
benefit by itself. Tail and severe-harm outcomes receive direct interval or
bound estimates rather than normal approximations when sparse.

Preregister one primary contrast for each experiment family and a gate from
task/protected outcomes to mechanism claims. Control familywise error across
governance forms, perturbations, and outcome strata with a declared
multiplicity procedure. Distinct protected interests, procedural outcomes,
status-quo harm, and common-cause failure remain visible and are not averaged
away by aggregate reward.

Unresolved decisions, incomplete appeals or remedies, unavailable reviewers,
emergency authority still active at the horizon, failed rollback, and denied
practical participation are outcomes. Decision and restoration times are
right-censored at the preregistered horizon; missing telemetry, undisclosed
conflicts discovered later, and inaccessible participants are tabulated by arm
and cause. Use bounded sensitivity analyses for remaining missing outcomes and
do not make a completer-only analysis primary.

Apply the applicability gate before the experiment and the promotion or kill
rules once to the held-out estimates and uncertainty intervals. Protected-
interest definitions, conversion weights, and acceptance margins must be
human-authorized or derived from the task contract, measurement resolution, or
baseline variability before allocation. Post-hoc changes to standing, burden,
or decision rules cannot support confirmation.

## Ablations

1. Replace scoped authority with one global administrator.
2. Remove agenda/proposal lineage.
3. Remove veto scope, evidence, deadline, or appeal one at a time.
4. Make delegation irrevocable or unbounded.
5. Hide evaluator/proposer dependency edges.
6. Merge ordinary and constitutional rule updates.
7. Remove emergency expiry and checked handoff.
8. Replace protected outcomes with one mean reward.
9. Remove human attention and participation cost.
10. Remove shared-model/data correlation from the threat model.

## Promotion and kill rules

Advance only in systems that pass the applicability gate, improve task-native
or protected outcomes in at least two independent task families, beat the full
null stack at equal end-to-end cost, survive correlated-model and strategic-
identity attacks, and preserve normative commitments as explicit human-
authorized inputs.

Merge or retire when modules share one loss and directly verifiable state;
constrained optimization plus IAM and policy-as-code matches the frontier; a
veto merely freezes a harmful status quo; delegation loses after competence
and correlation controls; amendment activity substitutes for repair quality;
or participation increases activity without information, inclusion,
protection, or decision gains.

## Evidence links

- [Social-choice and institutional-governance audit](../../research/audits/2026-08-05-social-choice-institutions.md)
- [Candidate 008](008-contestable-modular-allocation.md)
- [Candidate 011](011-dual-loop-operational-assurance.md)
- [Candidate 012](012-latency-qualified-authority.md)
- [Candidate 015](015-versioned-repairable-conventions.md)
- [Candidate 016](016-conflict-bounded-unit-transition.md)

## Supply-chain operations-research track

**Applicability.** Invoke governance only when separate organizations or agents
possess strategic private information, distinct rights, or enforceable
contracts. See the
[supply-chain audit](../../research/audits/2026-08-05-supply-chain-operations-research.md#exact-candidate-refinements).
Evidence: [C-627](../../research/claims.md#c-627),
[C-659](../../research/claims.md#c-659)–[C-678](../../research/claims.md#c-678).

**Strongest OR nulls.** Centralized stochastic/robust optimization, admission
and feasibility control, contract-constrained allocation, min-cost flow,
inventory and sourcing optimization, and direct measurement of supplier
reliability and common-cause dependence.

**Matched-budget test.** Cross cooperative versus strategic suppliers, private
capacity/cost information, correlated outages, qualification delay, and
contractual rights; equalize data, inventory, qualified capacity, reserve,
routes, messages, compute, enforcement, and human governance across centralized
control and constitutionalized arms.

**Service and recovery measurements.** Report feasible commitments, unit
fill/OTIF, tail delay, service disparity across protected counterparties,
qualified deliverable capacity, degraded-service area, backlog-clearance and
reserve-restoration hours, second-event service, currency, joules, and human
governance hours.

**Rejection gate.** Reject the governance transfer when actors share one loss
and directly verifiable state, when supplier diversity is only nominal, or when
centralized optimization plus ordinary contracts/admission matches service,
rights, and recovery outcomes at lower lifecycle cost.

## Burden-qualified contestable-decision track

The [legal evidence/procedure audit](../../research/audits/2026-08-05-legal-evidence-procedure.md#candidate-coverage-and-exact-refinements)
adds a conflict registry, recusal trigger, independently assigned replacement,
practical notice/access/response state, affected-interest and burden records,
reason requirement, typed appeal/review, executable remedy, and protected
procedural outcomes that cannot be traded silently for aggregate reward.

Evidence: [C-679](../../research/claims.md#c-679)–[C-704](../../research/claims.md#c-704).

Inject self-reported and hidden conflicts, correlated reviewers, unusable
notice, unequal response capacity, emergency deadlines, selected appeals,
incomplete remedies, and finality/reopening limits. Compare ordinary separation
of duties, conflict-of-interest controls, independent review, access-control
workflows, and calibrated decision rules under equal authority, information,
human effort, delay, compute, and energy. Reject if governance is invoked
without distinct protected interests or if the conventional stack matches both
task and procedural outcomes.

## Community-authorized data and knowledge governance track

The
[Indigenous data and knowledge governance audit](../../research/audits/2026-08-21-indigenous-data-knowledge-governance.md)
adds an applicability class in which a specific Indigenous people, nation,
community, group, clan, or other community-recognized collective has standing
over data, knowledge, collections, territories, relations, or their governed
derivatives. This is normative authority supplied by the relevant collective
and applicable legal instruments. The model may not infer or self-certify it.

### Applicability and non-substitution gates

Invoke this track only for an identified or disclosed Indigenous relationship
or when a data holder has a credible unresolved reason to believe one exists.
Do not scan or expose restricted material merely to classify it as Indigenous.
An institutional or researcher Local Contexts Notice opens engagement state; it
does not open access. Public availability, copyright or license status, FAIR
metadata, GDPR lawful basis, research-ethics approval, and individual consent
do not substitute for applicable collective authority. Collective approval in
turn does not remove a natural person's applicable EU data-protection rights.

If authority, scope, or permission is unknown or disputed, preserve the material
under its current confidentiality and suspend new external disclosure,
irreversible derivation, and purpose expansion until the relevant authorized
process resolves the issue. A model confidence score, majority vote, government
list, least-restrictive rule, or authority shopping cannot resolve standing.

### Governance-envelope state

For each governed artifact and lineage, keep separate typed records for:

1. the specific people, nation, community, group, clan, family, knowledge
   holder, material, place, relation, and derivative scopes asserted;
2. community-recognized authorities, roles, procedures, evidence, term, limits,
   succession, and dispute state;
3. applicable community protocols, Indigenous law, UNDRIP, EU and Member-State
   law, national law, contract, ethics, and institutional rules;
4. provenance and relationship metadata, including the full current Local
   Contexts Label description and identifier where supplied;
5. a purpose matrix distinguishing collection, preservation, community access,
   research access, linkage, analysis, indexing, training, generation,
   publication, commercialization, onward transfer, retention, and destruction;
6. individual permissions and rights, collective consent/approval/refusal,
   review, expiry, change, withdrawal, and notification state;
7. copies and derivatives including features, embeddings, indexes, prompts,
   weights, outputs, evaluations, publications, and backups;
8. attribution, access, reciprocity, capacity, monetary and non-monetary benefit,
   reporting, and remedy obligations with community-defined acceptance; and
9. an append-only record of proposals, decisions, uses, disclosures, changes,
   disputes, failed propagation, and remedies.

Bind the current governance-envelope version to Candidate 009 authority and
assurance capabilities. Candidate 014 carries it through observation and
derivative lineage; Candidate 015 preserves protocol semantics and version
migration; Candidates 017 and 019 preserve obligations through compaction and
institutional turnover. None of those candidates supplies legitimate authority.

### Lifecycle experiment `H` — collective authority under purpose drift

Use synthetic governance records and synthetic content only. Cross:

- community-applied Label, institution-applied Notice, both, or neither;
- valid individual permission, valid collective authorization, both, or
  neither;
- one or several authorities with non-overlapping, overlapping, and disputed
  scope;
- preservation, community access, research, indexing, model training,
  generation, publication, commercialization, and onward-transfer purposes;
- stable, expired, changed, refused, withdrawn, restored, and stale authority;
- raw data, clean copy, feature, embedding, index, adapter, output,
  publication, third-party copy, and backup derivatives; and
- GDPR personal-data scope, non-personal collective knowledge, Nagoya-scoped
  genetic-resource use, and contract-only cases.

Compare the candidate with the full stack of applicable EU and national law,
research ethics, individual consent, data-use/material-transfer agreements,
intellectual-property and access-and-benefit-sharing review, typed IAM,
independent review, FAIR and provenance metadata, Local Contexts Notices and
Label synchronization, retention/deletion, append-only lineage, human liaison,
and legal review. Equalize authority information, community and legal
person-minutes, proposal and review opportunities, enforcement, compute,
storage, messages, and energy.

Measure unauthorized irreversible or external actions per governance lineage,
false-authority acceptance, false refusal, purpose-transition escapes,
relationship/Label survival, derivative-node remedy recall and precision,
update and invalidation latency in seconds, unauthorized bytes or records
exposed, worst protected-interest loss, legitimate community-access delay,
unresolved disputes, incomplete benefit obligations, community and legal
person-minutes, storage bytes, communication bytes, and joules. Keep every
quantity separate; metadata volume, veto count, consultation count, or reduced
data use is not a benefit by itself.

### Change, refusal, and remedy contract

A changed or withdrawn permission creates a versioned invalidation event. The
authorized remedy may suspend future use, revoke capability, remove active
indexes, quarantine copies, correct attribution, notify recipients, return or
repatriate material, retrain or unlearn a model, retire an artifact, compensate,
or preserve restricted evidence. Report unreachable copies and unverifiable
weight influence. Do not promise deletion or machine unlearning beyond what the
lineage and verification test demonstrate.

### Promotion and rejection gates

Advance this track only if first-class collective authority and purpose state
prevents consequential unauthorized use or improves remedy completeness beyond
the entire conventional stack in at least two independent synthetic task
families, without unacceptable false blocking, disclosure during screening,
community burden, legal burden, latency, or lifecycle cost.

Reject it if it produces one pan-Indigenous policy, permits researcher or model
self-certification, treats Notices as permission, converts community review to
unpaid benchmark labor, collapses benefit to scalar reward, fails to propagate
changed authority to derivatives, overrides GDPR or community law, or cannot
outperform the composed law–ethics–agreement–Local Contexts–IAM–provenance–human
review baseline.
