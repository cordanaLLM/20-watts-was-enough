# Fixture F-016 — Versioned evidence retrieval and feedback

- **Status:** protocol-complete preregistration design; no implementation,
  registry receipt, benchmark result, or energy result exists
- **Execution state:** prose only; no workstation adapter or frozen corpus
  release exists
- **Claim scope:** exactly [C-797](../../research/claims.md#c-797) and
  [C-798](../../research/claims.md#c-798)
- **Authority boundary:** passing this fixture would establish only the frozen
  engineering contrasts below. It would not make a relevance score epistemic
  confidence, make feedback true, or establish a universal retrieval policy.

## Exact scope and questions

The fixture asks two conjunctive questions.

1. **C-797 — retrieval frontier.** Before any session feedback is available,
   does the proposed evidence router reduce supported-answer loss beyond tuned
   sparse, dense, hybrid, reranked, and pseudo-feedback retrieval at the same
   corpus, candidate, context, token, latency, compute, storage, assessor-service,
   and
   measured-energy ceilings, without worsening citation support, retrieval,
   calibration, evidence diversity, or long-tail performance beyond their
   registered margins?
2. **C-798 — feedback lifecycle.** Across benign, mistaken, delayed,
   exposure-biased, and poisoned feedback, does a versioned query/task state
   with logged exploration and causal rollback outperform tuned pseudo-feedback
   and adaptive unversioned retrieval, while leaving the evidence base
   immutable and never treating feedback as truth?

The claims are intentionally asymmetric. C-797 supplies an established
evaluation boundary, not an expectation that the proposed arm wins. C-798 is
a plausible systems translation and must survive both mature feedback nulls
and direct exploration and rollback ablations. A tie with a mature null rejects
the proposed residual.

No other claim is routed through this fixture. Entity resolution, evolving
information-need negotiation, preservation, truth discovery, source authority,
and general continual learning require separate contracts.

## Frozen evidence worlds and tasks

### Corpus construction

Each independent seed creates one self-contained evidence world with two
official snapshots. Snapshot `v0` contains exactly 12,000 UTF-8 documents.
Snapshot `v1`, released at the registered session boundary, contains exactly
13,100 immutable objects: all 12,000 `v0` objects, 800 new documents, 240
superseding document versions, and 60 retraction records. Supersession and
retraction create new signed records; no object in `v0` is overwritten or
deleted. The `v1` eligibility map excludes the superseded versions and the
documents named by retraction records.

The deterministic generator freezes, before any arm runs:

- document bytes, stable document and version identifiers, publication time,
  source lineage, duplicate family, topic and subtopic, and evidence-snapshot
  membership;
- a hidden atomic support graph linking each answer atom to supporting,
  contradicting, obsolete, duplicated, and irrelevant passages;
- head, torso, and long-tail query strata, answerability, required evidence
  lineages, contradictory evidence, and the valid snapshot for every task;
- all possible feedback outcomes for every eligible displayed document,
  interaction, position, and feedback regime; and
- release time, correction, supersession, retraction, poison interval, and
  causally available verifier outcome.

Documents are content-addressed by

$$
h(d,v)=\operatorname{SHA256}(\texttt{"F016-doc-v1"}\,\|\,d\,\|\,v\,\|\,b),
$$

where $d$ is the stable document identifier, $v$ the official snapshot
version, $b$ the exact document bytes, and $h$ a 256-bit digest. Corpus objects
are mounted read-only. The evaluator checks the complete Merkle root before
and after every arm and after every rollback.

Feedback may change only an arm-owned query/task/ranking state. It may not
edit corpus bytes, identifiers, source metadata, support labels, official
snapshot membership, or the evaluator oracle. An index is a derived artifact
bound to one corpus root; rebuilding or reweighting it creates a new index
version and never a new evidence object.

### Task and stream construction

Every seed contains 240 sessions: 16 sessions in each cell of three task
families by five feedback regimes. Every session has four retrieval-and-answer
rounds, so every arm receives exactly 960 interaction opportunities per seed.
State resets to the same signed pre-regime checkpoint between regimes; regime
order follows a seed-derived balanced Latin square.

The three task families are:

1. **F1 — direct support and abstention:** atomic answerable and unanswerable
   questions, paraphrase, lexical mismatch, and near-duplicate distractors;
2. **F2 — multi-source conflict and version:** answers requiring two or more
   independent lineages, explicit contradiction, and correct use of `v0` or
   `v1` after a scheduled correction, supersession, or retraction; and
3. **F3 — rare and long-tail evidence:** low-frequency entities and subtopics,
   weak lexical overlap, relevant evidence outside the initial head ranking,
   and duplicated popular documents that must not substitute for lineage
   diversity.

Exactly 20% of tasks are unanswerable in the current snapshot. Exactly 30% are
long-tail tasks. Exactly 25% require contradictory or supersession-aware
evidence. These strata overlap according to a generator table committed with
the task manifest; an arm never sees the hidden labels. Every
`task-family × feedback-regime` cell contains at least two unanswerable, two
long-tail, two multi-source, and two contradiction/version tasks, with overlap
permitted. A bundle that leaves any registered primary denominator empty is
rejected before commitment rather than repaired after arm results exist.

The independent inferential unit is a seed. Sessions, rounds, queries,
documents, answer atoms, citations, and feedback events within a seed are
repeated measurements, not independent confirmation replicates.

## Feedback interventions

Potential feedback is generated from a hidden table before ranking. The table
defines the response to any eligible `document × position × round` exposure,
so arms share the same counterfactual environment even when their displayed
lists differ. Only the response to an actually displayed item is revealed.
The five regimes are exact:

1. **Benign:** explicit relevance judgments and corrections agree with the
   hidden task-support annotation; clicks remain recorded separately and are
   never labels.
2. **Mistaken:** the potential-feedback table deterministically inverts exactly
   20% of eligible explicit-judgment entries within each task-family and
   relevance-class stratum; table strata are generated in multiples of five.
   An arm's realized exposed fraction may differ and is reported; mistake
   status is hidden.
3. **Delayed:** otherwise benign feedback is delivered exactly two subsequent
   interactions later with its originating query-state and display identifiers.
   Feedback falling after the last round remains undelivered.
4. **Exposure-biased:** only documents displayed in positions 1–5 can generate
   a response. Position-dependent clicks favor high rank and lexical overlap;
   unseen documents generate no negative label. Display propensities are
   logged, but a click is not a relevance or truth judgment.
5. **Poisoned:** for interactions 65--128 of the 192-interaction regime block,
   the potential-feedback table corrupts exactly 15% of eligible entries within
   each task-family and relevance-class stratum; table strata are generated in
   multiples of 20. Realized exposure is policy-dependent and reported.
   Corruption promotes a duplicated or contradicted distractor and demotes a
   supporting document. The attacker cannot edit the corpus, oracle, verifier,
   or resource ledger, and poison status is hidden from every arm.

Each feedback event carries its origin interaction, delivery interaction,
display set, position, propensity when defined, event type, task-state version,
and a scope/expiry field. Organic clicks, corrections, and downstream failures
are observations. Only separately budgeted explicit assessor judgments can be
used as relevance labels, and even those do not certify document truth.

The explicit-assessor allocation is arm-independent and exact. In each
192-interaction regime block, interactions `2, 4, ..., 192` create 96 assessor
opportunities. For opportunity number $k=t/2$, the requested displayed position
is

$$
p=1+((s+k+7r)\bmod 20),
$$

where $s$ is the decimal seed and $r\in\{0,1,2,3,4\}$ is the frozen regime
index. The response is read from the precommitted potential-feedback table for
that arm's actually displayed document. A missing position, empty ranking,
deadline miss, or end-of-block delayed delivery consumes the opportunity,
emits no label, and is never reassigned. Thus every arm receives exactly 480
opportunities and at most 480 delivered explicit labels; both counts and the
reason for every nondelivery are retained.

The primary synthetic fixture uses this deterministic assessor service and
charges exactly 15 service-seconds per opportunity, or 120 service-minutes per
seed and arm. `service-min` is a simulator resource, not observed human labor.
No result from this execution may be described as reducing person-minutes. A
later human-assessor replication must be analysed separately and must freeze
reviewer qualification, blinding, assignment, response deadline, adjudication,
withdrawal, and actual `person-min` before it can make a human-work conclusion.

## State and inference boundary

For seed $s$, session $e$, and round $t$, let $D_{sv}$ be the immutable corpus
snapshot, $q_{set}^{(a)}$ the query/task state of arm $a$, $I_{sv}^{(a)}$ its
derived index, and $F_{set}^{(a)}$ the causally available feedback history. An
arm produces a ranking

$$
R_{set}^{(a)}=
\operatorname{rank}_{a}(q_{set}^{(a)},I_{sv}^{(a)},F_{set}^{(a)}),
$$

then the common frozen answerer produces an answer, atomic claims, citations,
and a separately calibrated support probability. A retrieval score
$\rho(q,d)$ is dimensionless and orders candidates only. It is not accepted as
$P(\text{answer correct})$, $P(\text{claim supported})$, or source truth.

The versioned arm updates only task state:

$$
q_{se,t+1}^{(V)}=
U_{\theta,w}(q_{set}^{(V)},F_{set}^{(V)},R_{set}^{(V)}),
\qquad
D_{sv,t+1}=D_{sv,t},
$$

where $U$ is the frozen update rule, $\theta$ its dimensionless parameters, and
$w$ a monotonically increasing state version. The second equality is checked
by digest rather than assumed. Official transition from $D_{s0}$ to $D_{s1}$
occurs only at the generator's signed release event and is identical for every
arm.

A rollback selects a prior task-state version from the arm's own causally
available journal. It cannot restore a retracted evidence snapshot, reveal
future feedback, use poison labels, or consult hidden answer/support truth.

V's immutable lineage node is the closed tuple
`version:uint64, parent_sha256:hex256, origin_event_id:hex256,
origin_version:uint64, applied_event_id:hex256, update_rule_sha256:hex256,
state_payload_sha256:hex256, node_sha256:hex256`. Version 0 has the all-zero
parent. An ordinary update increments version by one, names the previously
active node as parent, and computes `node_sha256` over the canonical
length-prefixed tuple. A delayed event is applicable only when its origin node
is an ancestor of the active node or a signed origin-to-current mapping names
both digests. Rollback moves the active pointer to a causally available ancestor
and appends a separate pointer event; it never rewrites a node. A
**state-lineage mismatch** is any non-unit version increment, missing or
non-active parent on ordinary update, unrecomputable digest, absent origin,
undeclared forward map, non-ancestor rollback target, or active-pointer digest
mismatch. The count is recomputed from the journal rather than trusted from V.

V-U calls the same $U_{\theta}$ with the same inputs, but writes the result over
one mutable state key and keeps only the ordinary periodic checkpoint also
available to R5. It retains origin and delivery event identifiers for audit but
has neither a per-feedback state version nor an origin-to-current state map.
Its reserved version-journal allocation is filled by no data and cannot be
reused for model, index, cache, or search capacity.

## Arms and strongest nulls

All non-oracle arms use the same frozen answerer, citation formatter, support-
probability calibrator class, corpus snapshots, common component catalogue,
and output schema. Only retrieval and feedback-state handling differ.

| ID | Required implementation |
| --- | --- |
| `R0-sparse` | Tuned BM25/query-likelihood sparse retrieval with stemming/tokenization, field weights, phrase handling, and candidate-depth search. |
| `R1-dense` | Tuned frozen bi-encoder retrieval with an exact or recall-qualified ANN index, pooling, normalization, and search-depth checks. |
| `R2-hybrid` | Tuned sparse+dense candidate union and score/rank fusion, including a learned fusion option trained only on development labels. |
| `R3-reranked` | Tuned R2 retrieval followed by a frozen cross-encoder or learning-to-rank reranker over the same candidate and context ceilings. This is the strongest static null unless another static arm beats it. |
| `R4-pseudo-feedback` | Tuned strongest static retrieval plus Rocchio- or language-model-style pseudo-relevance feedback/query expansion from its own first-pass results, with no user labels. |
| `R5-adaptive-unversioned` | Tuned online learning-to-rank or contextual-bandit feedback with propensity handling, ordinary periodic checkpoints, exploration, and validation-based fallback, but one mutable current task model and no per-feedback immutable version lineage. This is the strongest adaptive null. |
| `V-versioned` | The proposed arm: capacity-matched R5 components plus immutable query/task-state versions, scoped feedback, logged propensitized exploration, checkpoint selection, causal rollback, and an independently hashed read-only evidence base. |
| `V-U-no-version-lineage` | Isomorphic versioning ablation: V's model, scoped feedback, exploration, triggers, checkpoints, fallback, and corpus boundary remain, but query/task state is overwritten in place under one constant state identifier. Origin/delivery metadata remains visible, while no immutable origin state or origin-to-current forward map can be consulted. Reserved journal bytes remain unused. |
| `V-X-no-exploration` | V with the registered exploration intervention disabled; the two exploration slots are filled by exploitation and unused exploration randomness conveys no information. |
| `V-R-no-rollback` | V with rollback execution disabled; triggers and checkpoints are still logged, but the arm continues from the current state. |
| `O-evaluator` | Hidden support graph, potential-feedback table, poison schedule, and corpus lineage. O scores arms and estimates headroom but never retrieves, tunes, answers, or competes. |

R5 must include the best conventional exploration and checkpoint/fallback
policy found under its tuning budget. Omitting them to make V look novel is a
kill condition. Conversely, if R5's ordinary controls reproduce V's frontier,
C-798's proposed residual fails.

### Tuning completeness

Each base arm R0--R5 and V receives exactly 96 deterministic hyperparameter
trials on development seeds, the same training items and labels, and the same
selection rule: first satisfy every protected/resource constraint, then
minimize worst-family supported-answer loss, then unsupported-citation rate,
then measured energy. Search points and their order are a scrambled Sobol
sequence keyed by the arm namespace and frozen before trial 1. V-U, V-X, and
V-R reuse V's selected hyperparameters and differ only by their named
intervention; retuning an ablation is forbidden. The entire Pareto set and
tie-break receipt are retained. No confirmation or transfer item, feedback
event, oracle edge, or aggregate may enter tuning.

Trials 1--72 form the search tranche and trials 73--96 the audit tranche. For
each base arm, let $Q_{1:72}$ and $Q_{73:96}$ be the smallest worst-family
supported-answer loss, where each family loss is the mean over all 24
development seeds, among trials in the named tranche that pass every protected
and resource gate. A 10,000-resample paired seed bootstrap with seed `16990`
recomputes both within-tranche minima on every resample. Comparator completeness
requires both tranches to contain a feasible trial and the one-sided 95% upper
bound of

$$
Q_{1:72}-Q_{73:96}<0.005.
$$

The selected configuration is still the lexicographic winner over all 96
trials. R4's first pass is the development-selected winner among R0--R3 under
that same rule. If the audit tranche improves by 0.005 or more, or either
tranche has no feasible trial, that arm is incomplete and the protocol must be
versioned with a larger search before confirmation is opened; incompleteness
never makes V pass.

## Equal information, work, and physical budgets

Budgets are componentwise ceilings, never exchange rates. Saved bytes, labels,
tokens, assessor-service minutes, compute, latency, or joules cannot be converted into
another resource or donated after outcomes are visible. Every arm is entitled
to the same common component catalogue; choosing not to use a component does
not grant compensating work elsewhere.

Per evaluation `seed × arm`, the frozen ceilings are below; the row explicitly
marked development pool is instead one aggregate per base arm across all 24
development seeds and 96 trials:

| Resource | Exact ceiling and unit |
| --- | --- |
| Corpus | the same 12,000-object `v0` and scheduled 13,100-object `v1`; byte-identical Merkle roots |
| Derived retrieval index | 8,589,934,592 B (`8 GiB`) including vectors, postings, graph, metadata, and lookup tables |
| Total persistent arm state | 10,737,418,240 B (`10 GiB`) including model deltas, checkpoints, query history, and rollback journal |
| Peak host / accelerator memory | 34,359,738,368 B (`32 GiB`) host and 17,179,869,184 B (`16 GiB`) accelerator |
| Retrieval interactions | 960, each returning at most 20 documents from at most 100 scored/reranked candidates |
| Explicit assessor service | 480 scheduled opportunities and at most 480 delivered document judgments; organic feedback is not added to either count |
| Verifier/answer labels | 120 task outcomes, available only at their scheduled causal time |
| Assessor-service work | 120 service-minutes; synthetic service time is never reported as human `person-min` |
| Answerer context | 8,192 canonical input tokens and 512 output tokens per interaction; 7,864,320 input and 491,520 output tokens total |
| Development training/tuning pool | 2,000,000 canonical tokens total and 96 trials per base arm R0--R5 and V; the pool does not reset by seed or trial, and causal ablations inherit V without retuning |
| Compute | 28,800 CPU-s on eight pinned threads and 7,200 accelerator-s on one declared device |
| Wall time | 14,400 s from index-open through final artifact seal |
| Latency | 2,000 ms per interaction hard deadline and p99 no greater than 1,500 ms |
| Electrical energy | 7,200,000 J net wall energy at the registered system boundary |

Each base arm's complete development pool additionally has aggregate ceilings
of 28,800 CPU-s, 7,200 accelerator-s, 14,400 wall-s, and 7,200,000 measured J;
these do not reset for any of its 96 trials. Each confirmation or transfer
`seed × arm` block receives the physical ceilings in the table without a tuning
reset. Lifecycle reports retain development cost separately and also report the
fixed amortization $E_{\mathrm{tune}}/128$ per one of the 64 confirmation and 64
transfer blocks. V-U, V-X, and V-R inherit V's amortized tuning cost. Neither
raw nor amortized cost may be omitted from a lifecycle statement.

The same machine, CPU/GPU identities, firmware, runtime/container, thread and
device affinity, power mode, clock source, thermal acceptance window, and run-
order counterbalancing apply to every arm. Index construction, model loading,
tuning within its separate development pool, inference, exploration,
validation, checkpointing, rollback, logging, and artifact sealing are inside
the applicable compute, wall-time, and energy boundaries.
Pretrained model creation is outside only when the exact same immutable model
is available to every arm and its identity and embodied exclusion are stated.

Energy is measured by a calibrated external cumulative meter enclosing the
declared workstation. Meter identity, calibration date, resolution, sampling,
interval ownership, idle baseline, and uncertainty are frozen. Net energy is

$$
E_{\mathrm{net}}=E_{\mathrm{wall}}-P_{\mathrm{idle}}t,
$$

where $E_{\mathrm{wall}}$ is measured joules, $P_{\mathrm{idle}}$ is the
pre-registered idle power in watts, and $t$ is elapsed seconds. The combined
expanded relative uncertainty must be at most 2%. Software estimates, TDP,
GPU telemetry alone, modeled FLOPs, or an unowned facility allocation cannot
satisfy the energy boundary. Without a valid meter record, smoke diagnostics
may run, but F-016 cannot pass and no energy comparison may be stated.

An overrun is retained as a resource failure. A crashed, timed-out, abstaining,
or empty-result task remains in the fixed denominator. No arm may rerun only a
failed seed.

## Frozen seeds, masking, and run order

The generator uses PCG64 with three non-overlapping decimal seed packs:

- development: `16001`–`16024` (24 seeds);
- confirmation: `16101`–`16164` (64 seeds); and
- transfer: `16201`–`16264` (64 seeds).

Every seed runs all task families, feedback regimes, and arms. Namespace seeds
for corpus, tasks, potential feedback, arm order, exploration, poison slots,
and analysis are the first unsigned 64 bits of

`SHA-256("F016/v1" || 0x00 || namespace || 0x00 || uint64le(seed))`.

Namespaces are distinct strings, and reveal validation rejects any repeated
derived value. The paired-bootstrap resampling seed is fixed at `16991` and is
not a generator seed.

Confirmation and transfer bundles are generated before development. An
offline custodian publishes only a salted SHA-256 commitment to each canonical
bundle. Salt, task text, support graph, potential feedback, poison positions,
and snapshot release schedule remain inaccessible until code, arm containers,
model/index builders, budgets, hypotheses, and analysis hashes are frozen.
Seed numbers alone reveal no bundle content. Confirmation is revealed once;
transfer is revealed only after the signed confirmation report.

Within a seed, arm order is counterbalanced by a Latin square and regime order
by a separate balanced Latin square. A failed thermal or meter acceptance
check invalidates the complete block before outcomes are inspected; it does
not authorize selective arm reruns.

## Measurements and exact units

All proportions and probabilities use unit `1`. Rates retain fixed eligible
denominators declared below.

### Answer and citation outcomes

For task $i$, supported-answer success $S_i=1$ only when:

- an answerable task contains every required answer atom, no false atom, and a
  current-snapshot supporting citation for every emitted atom; or
- an unanswerable task emits the registered abstention and no factual atom.

Omission, wrong answer, unsupported atom, obsolete-only evidence, invalid
citation, wrong-snapshot citation, answerable refusal, timeout, crash, and
budget overrun set $S_i=0$. Supported-answer loss is

$$
L_{\mathrm{SA}}=1-\frac{1}{N}\sum_{i=1}^{N}S_i,
$$

with unit `1` and the frozen eligible task count $N$ as denominator. This rule
prevents abstention or terse output from shrinking the denominator.

Report separately:

- unsupported or wrong atomic assertions per 1,000 required/emitted atom
  opportunities (`assertion/1,000 opportunities`), with missing required atoms
  counted as failures; this rate is denoted $r_{\mathrm{assert}}$;
- citation support precision and required-evidence recall (`1`);
- wrong-version, superseded-only, and retracted-only citation rates (`1`);
- correct abstention and false-refusal rates (`1`).

### Retrieval, calibration, diversity, and tail outcomes

For every round and family, report:

- Recall@20, nDCG@20, reciprocal rank, and required-contradiction Recall@20
  (`1`) against the hidden support graph;
- answer-support Brier score (`1`) from the separately emitted support
  probability, plus reliability plots and ECE (`1`) as diagnostics;
- required-subtopic and independent-lineage Recall@20 (`1`), unique lineages
  (`count/list`), duplicate-family concentration (`1`), and contradiction
  coverage (`1`);
- head, torso, long-tail, answerable, unanswerable, multi-source, and version-
  changed supported-answer loss (`1`);
- median, p95, p99, and maximum interaction latency (`ms`), CPU time (`s`),
  accelerator time (`s`), bytes (`B`), assessor-service time (`service-min`), tokens
  (`token`), and measured net energy (`J`); and
- failed/empty retrievals, timeouts, rollbacks, stale-feedback applications,
  poisoned updates accepted, and evidence-base mutations (`count`).

Ranking relevance and answer-support calibration are always reported
separately. A monotone remapping from retrieval score to support probability is
permitted only if fitted on development labels, frozen before confirmation,
and evaluated as a calibration model rather than asserted as truth.

The primary lower-is-better retrieval components are fixed as

$$
d_{\mathrm{cite}}=1-\mathrm{required\ evidence\ recall},\quad
d_{\mathrm{ret}}=1-\mathrm{Recall@20},\quad
d_{\mathrm{contra}}=1-\mathrm{required\ contradiction\ Recall@20},
$$

and the diversity vector is exactly

$$
\mathbf d_{\mathrm{div}}=
\left(1-\mathrm{subtopic\ Recall@20},
      1-\mathrm{lineage\ Recall@20},
      \mathrm{duplicate\ concentration}\right).
$$

Every component has unit `1`. `H797-6` and `H798-4` are conjunctions over all
three diversity components; no weighted diversity scalar is permitted. Unique
lineage count, nDCG, reciprocal rank, contradiction coverage, ECE, and plots
remain mandatory secondary diagnostics but cannot replace a primary component.

### Feedback and recovery outcomes

Feedback regret is the cumulative difference in $L_{\mathrm{SA}}$ from the
last clean checkpoint over the registered post-intervention window (`loss ×
interaction`). For recovery, poison onset at interaction 65 is the fixed
evaluator time origin and is never disclosed to an arm. A breach is the first
causally available completed interaction at which trailing-20
$L_{\mathrm{SA}}$ exceeds the frozen clean-checkpoint value by more than 0.01.
Recovery is the first later interaction at which trailing-20 loss is at or
below that boundary for 20 consecutive completed interactions.

If no breach occurs, recovery time is zero. If a breach occurs but recovery is
not observed by interaction 192, the observation is right-censored at 128
interactions after poison onset. The primary latency estimand is restricted
mean recovery time through 128 interactions,

$$
\operatorname{RMRT}_{128}(a)=\int_0^{128}\widehat S_a(u)\,du,
$$

where $\widehat S_a$ is the Kaplan--Meier estimate for arm $a$, including the
zero-time no-breach observations. The paired seed bootstrap recomputes both
survival curves and their RMRT difference on every resample. Recovery rate is
the proportion of seeds **resolved by interaction 192**, where `resolved` means
either no breach occurred or recovery was observed by interaction 192. Both
endpoints retain unit `1` for rate and `interaction` for RMRT; a censored value
is never substituted as an observed latency.

H798-7 is intentionally one mixed-family regime-block endpoint, not three
family-specific endpoints. The frozen task schedule contributes exactly 64
round-robin interactions from each family to the 192-interaction block; breach,
trailing window, poison origin, recovery clock, censoring, and resolution are
computed once on that canonical global order.

A stale-feedback application occurs when an event is applied to a state other
than its recorded origin or a declared forward mapping. Its unit is
`event/delivered delayed-feedback event`; every delivered delayed event is in
the denominator whether applied, rejected, expired, or ignored. This rate is
$r_{\mathrm{stale}}$. If an arm has no delivered delayed-feedback denominator
in a family because of empty rankings, deadline misses, or other arm failures,
its rate is set to 1 and the zero-denominator failure is retained. Rollback
fidelity is exact equality of the restored task-state digest, configuration,
and eligible evidence-snapshot binding.

## Exact confirmatory hypothesis vector

All thresholds below are engineering hypotheses, not published effect sizes.
For every lower-is-better metric $m$, task family $f$, feedback regime $g$,
and arms $A,B$, define the confirmation contrast

$$
\Delta_m^{f,g}(A,B)=\frac{1}{64}\sum_{s=16101}^{16164}
\left(m_s^{f,g}(A)-m_s^{f,g}(B)\right).
$$

When a row names several families, regimes, comparators, metrics, or vector
components, it is one intersection--union entry: every named component must
meet its bound. If the named scalar component tests have values $p_k$, its
outer value is explicitly $p_{\mathrm{IUT}}=\max_k p_k$. An
equal-weight regime mean is written explicitly; no unmentioned pooling or
outcome-dependent comparator selection is allowed. Rates retain their declared
denominators before contrasts are formed.

For a set of regimes $G$,

$$
\overline m_s^{f,G}(a)=\frac{1}{|G|}\sum_{g\in G}m_s^{f,g}(a),
\qquad
\Delta_{\overline m}^{f,G}(A,B)=\frac{1}{64}\sum_s
\left(\overline m_s^{f,G}(A)-\overline m_s^{f,G}(B)\right).
$$

### C-797 vector: first round before feedback

The comparator set is exactly R0--R4. Only round 1, before any explicit,
organic, delayed, or verifier feedback is delivered, contributes. Each row is
a conjunction over all three task families and every comparator $j$ in R0--R4.
Within a seed and family, its metric is the equal-weight mean of round-1 tasks
from all five scheduled regime blocks; the regime label is not an analysis
factor before feedback. V passes C-797 only if every outer entry passes:

| ID | Exact component in every family and comparator | Required upper bound |
| --- | --- | ---: |
| `H797-1` | $\Delta_{L_{\mathrm{SA}}}(V,R_j)$ (`1`) | `<= -0.020` |
| `H797-2` | $\Delta_{r_{\mathrm{assert}}}(V,R_j)$ (`assertion/1,000 opportunities`) | `<= +5` |
| `H797-3` | $\Delta_{d_{\mathrm{cite}}}(V,R_j)$ (`1`) | `<= +0.010` |
| `H797-4` | $\Delta_{d_{\mathrm{ret}}}(V,R_j)$ (`1`) | `<= +0.010` |
| `H797-5` | $\Delta_{\mathrm{Brier}}(V,R_j)$ (`1`) | `<= +0.005` |
| `H797-6` | $\Delta_{d_k}(V,R_j)$ for every $d_k\in\mathbf d_{\mathrm{div}}$ (`1`) | `<= +0.010` for each component |
| `H797-7` | $\Delta_{L_{\mathrm{SA,long-tail}}}(V,R_j)$ (`1`) | `<= +0.020` |

`H797-1` is the required end-to-end superiority result. The other components
are non-inferiority gates, not permission to collapse the outcome vector. V
must also satisfy all latency, compute, byte, assessor-service, token, and
energy gates.

### C-798 vector: feedback lifecycle and causal mechanisms

The mature feedback comparator set is exactly R4 and R5. Let
$G_A=\{\text{mistaken},\text{delayed},\text{exposure-biased},\text{poisoned}\}$
and let an overbar denote an equal-weight mean over those
four regime-specific seed metrics. V passes C-798 only if every outer entry
passes:

| ID | Exact component | Required upper bound or exact gate |
| --- | --- | ---: |
| `H798-1` | $\Delta_{\overline L_{\mathrm{SA}}}^{f,G_A}(V,R_j)$ for each family $f$ and $j\in\{R4,R5\}$ (`1`) | `<= -0.020` |
| `H798-2` | $\Delta_{L_{\mathrm{SA}}}^{f,g}(V,R_j)$ for each family, all five regimes, and both mature nulls (`1`) | `<= +0.010` |
| `H798-3` | $\Delta_{r_{\mathrm{assert}}}^{f,g}(V,R_j)$ and $\Delta_{\mathrm{Brier}}^{f,g}(V,R_j)$ in every family, regime, and mature null | `<= +5 assertion/1,000 opportunities` and `<= +0.005` |
| `H798-4` | $\Delta_{d_k}^{f,g}(V,R_j)$ for all $d_k\in\mathbf d_{\mathrm{div}}$, families, regimes, and mature nulls (`1`) | `<= +0.010` for each component |
| `H798-5` | exposure-biased $\Delta_{d_{\mathrm{contra}}}^f(V,V\text{-}X)$ and $\Delta_{L_{\mathrm{SA}}}^f(V,V\text{-}X)$ in every family (`1`) | `<= -0.050` and `<= +0.010`, respectively |
| `H798-6` | poisoned-regime $\Delta_{L_{65:192}}^f(V,V\text{-}R)$, where $L_{65:192}$ is the equal-weight interaction loss in the fixed window (`1`) | `<= -0.020` in every family |
| `H798-7` | poisoned-regime mixed-family block $\Delta_{\mathrm{RMRT}_{128}}(V,V\text{-}R)$ and V resolution deficit $1-\Pr(\mathrm{resolved\ by\ 192})$ | `<= -16 interaction` and `<= 0.050` |
| `H798-8` | delayed-regime V stale rate; $\Delta_{r_{\mathrm{stale}}}^f(V,R5)$; $\Delta_{r_{\mathrm{stale}}}^f(V,V\text{-}U)$; and $\Delta_{L_{\mathrm{SA}}}^f(V,V\text{-}U)$ | `<= 0.005`, `<= -0.020`, `<= -0.020`, and `<= -0.010`, respectively, in every family |
| `H798-9` | corpus mutation count, V rollback-digest mismatch, and V state-lineage mismatch (`count`) | exactly `0` in every seed |

The exploration, rollback, and version-lineage entries are causal claims about
registered interventions, not labels inferred from a favorable full-arm
comparison. V-X, V-R, and V-U receive equal raw observations, component code
outside the named intervention, and resource ceilings; removed capacity and
work remain reserved and unused. If any causal entry fails, an overall V gain
cannot rescue C-798.

## Statistical analysis and multiplicity

The analysis container recomputes every result from append-only raw records.
For a component with required upper margin $b$, the null is
$H_0:\delta\ge b$ and the alternative is $H_1:\delta<b$. The registered value
is a one-sided studentized paired bootstrap, or one-sample seed bootstrap for an
absolute V bound, from 100,000 seed resamples with null-centred residuals and
resampling seed `16991`. The observed statistic is
$(\hat\delta-b)/\widehat{SE}$. A value is

$$
p=\frac{1+\#\{T^*\le T_{\mathrm{obs}}\}}{100001}.
$$

The container also reports the percentile two-sided 95% interval, the raw
margin-adjusted seed values, and every numerator and denominator. For
$\operatorname{RMRT}_{128}$, every resample recomputes both Kaplan--Meier
curves; its studentizing standard error uses delete-one-seed jackknife
pseudovalues. The inferential seed contribution is the paired difference of
those arm-specific pseudovalues; their mean is the jackknife bias-corrected RMRT
contrast. Zero-variance components pass only when every seed is strictly
inside the required bound; equality or any violation fails.

Sessions, documents, interactions, and feedback events are never resampled as
independent units. Each table row is one intersection--union entry whose value
is the largest component $p$-value across exactly the named comparators, regimes,
task families, metrics, and conjuncts. Holm controls the 15 outer entries
(`H797-1`--`H797-7` and `H798-1`--`H798-8`) at familywise
$\alpha=0.05$. `H798-9` and resource, integrity, leakage, and authority
conditions are exact hard gates, not hypothesis tests.

Missing, corrupt, over-budget, crashed, timed-out, or zero-output paired units
remain in the analysis as registered failures. The analysis may not remove an
outlier seed, substitute a task family, change a regime weight, pool feedback
events as independent observations, or replace a failed endpoint with a
weighted score.

Before confirmation reveal, the frozen power program constructs one centred
joint seed-level residual vector from each of the 24 development seeds. Its RMRT
coordinate is the paired delete-one-seed pseudovalue difference just defined,
and its resolution coordinate is the paired `resolved by 192` indicator
difference; it never shifts censored times into impossible event records.
Non-inferiority components use a planning mean of zero. Negative superiority
margins use 1.25 times the named margin; the RMRT coordinate therefore uses
`-20 interaction`, V stale rate uses 0.0025, V resolution deficit uses 0.025,
and exact hard gates are not simulated.

Using 100,000 iterations and PCG64 seed `16992`, each iteration draws **two
independent** 64-seed residual bootstraps from separate `confirmation` and
`transfer` substreams. Each simulated stage runs the complete component
construction, $p_{\mathrm{IUT}}$ outer maxima, and 15-entry Holm procedure.
The design is accepted only if both stages pass all 15 entries in at least 0.90
of iterations and every individual outer entry passes in at least 0.95 of
iterations in each stage. The simulation code, pseudovalue/resolution residual
matrix, planning vector, substream derivation, and result are hashed before the
custodian reveals confirmation.

Failure of that deterministic power rule marks this protocol version
`design-underpowered`. It does not authorize reveal, a weaker margin, reuse of
transfer, or adding seeds to the committed pack. A later protocol may commit a
new disjoint pack before reveal. Transfer is a complete independent repeat on
seeds `16201`--`16264`: it reruns the same component bounds, 15-entry Holm
family at 0.05, exact gates, resource limits, and rejection rules without
retuning. Merely preserving effect direction is insufficient.

## Required ablations, checks, and hostile probes

Every confirmation seed runs these registered interventions:

1. execute all seven base inferential arms R0--R5 and V on the identical first
   round before any feedback is delivered;
2. run V, V-U, V-X, and V-R through all five feedback regimes with identical
   hidden potential-feedback tables and independent arm-visible histories;
3. inject relevant contradictory evidence outside the exploitative top 20 and
   verify that only causally available exploration can expose it;
4. start and stop the poisoned interval without an arm-visible poison flag;
5. deliver delayed feedback after an intervening task-state update; require V
   to bind it to an immutable origin or explicit forward mapping and verify that
   V-U has neither mechanism while retaining the same delivery metadata;
6. issue the signed `v1` corpus release and verify that every arm rebuilds or
   rebinds its index without rewriting `v0` objects;
7. attempt a feedback-driven corpus, source-metadata, support-label, and
   official-version mutation; the read-only boundary must reject each attempt;
8. corrupt a query-state journal entry, index manifest, exploration propensity,
   rollback record, corpus object, and raw-result record independently; digest
   validation must stop analysis;
9. replace answer-support probability with raw retrieval score; schema and
   calibration validation must reject it; and
10. verify that V-U overwrites one mutable state identifier and does not retain
    an undeclared per-feedback or origin-addressable copy beyond its declared
    ordinary periodic checkpoint in caches, logs, or derived indexes; and
11. withhold meter calibration, shift the energy interval, or introduce a
    concurrent workstation load; the run must become energy-ineligible rather
    than emit an efficiency conclusion.

## Promotion, rejection, and kill rules

Both claim-specific verdicts are conjunctive. C-797 requires all seven H797
entries, complete mature retrieval arms, and every resource gate. C-798
requires all nine H798 entries, all three causal ablations, immutable evidence,
and every resource gate. Passing one claim does not pass the other.

Immediately reject the affected arm and the complete fixture verdict if:

- a corpus byte, identifier, source field, support label, snapshot relation, or
  oracle record changes outside the signed official release;
- feedback, click, correction, verifier outcome, popularity, or retrieval
  relevance is treated as document truth or answer correctness without the
  separate frozen evaluator;
- a relevance score is emitted as epistemic confidence without a frozen,
  independently evaluated calibration mapping;
- any arm sees hidden support, poison, future-feedback, future-release, task,
  answer, or transfer information;
- sparse, dense, hybrid, reranked, pseudo-feedback, or adaptive-unversioned
  comparator implementation or tuning is absent or fails completeness;
- R5 is denied conventional exploration, propensity correction, checkpointing,
  or validation fallback available within its budget;
- V-U differs from V outside state-lineage removal, retains an immutable origin
  state or forward map, is retuned, or receives a different observation,
  opportunity, or resource ceiling;
- V exploration probabilities are missing, zero after being declared nonzero,
  conditioned on hidden relevance, or reconstructed after outcomes;
- rollback uses hidden truth, a poison flag, future evidence, or a corpus
  snapshot unavailable at the rollback time;
- corpus/index roots, candidate depth, context, interactions, assessor
  opportunities, service-minutes, tokens, latency, compute, persistent bytes,
  or measured-energy ceilings differ across arms;
- a timeout, refusal, crash, empty ranking, missing citation, or overrun is
  removed from its fixed denominator;
- confirmation or transfer overlaps development, is opened before freeze, or
  is used for tuning;
- the frozen 64-seed design fails its deterministic power acceptance rule;
- meter provenance or interval ownership fails while an energy or efficiency
  conclusion is emitted; or
- raw events, failed runs, state versions, exploration actions, rollback
  attempts, or resource use are omitted from the required artifacts.

Reject only the proposed residual, while retaining valid ordinary engineering
results, if the strongest mature null matches V within the registered margins,
if V-X matches V on the exploration target, if V-R matches V on the rollback
targets, if V-U matches V on the registered delayed-feedback versioning targets,
or if V wins only by extra information or resources. Label-only version
vocabulary, attractive diagrams, or a successful digest check is not an
outcome improvement.

A successful confirmation and transfer result makes only this frozen systems
composition eligible for independent replication. It does not change C-797's
source-domain status, prove that feedback is correct, or establish C-798 beyond
the registered corpus generator, task families, hardware, and feedback regimes.

## Required artifacts and execution boundary

Every run preserves, with SHA-256 digests and append-only sequence numbers:

- `fixture-manifest.json`, source commit, container/runtime lock, hardware and
  thermal identity, and role/access manifest;
- `seed-manifest.json`, commitment and reveal receipts, namespace derivations,
  Latin-square orders, and generator version;
- `corpus-v0.manifest.json`, `corpus-v1.manifest.json`, object hashes, Merkle
  roots, lineage/duplicate maps, official release event, and immutable-mount
  proof;
- sealed then revealed `tasks.jsonl`, `support-oracle.jsonl`,
  `potential-feedback.jsonl`, and perturbation schedule;
- per-arm index manifest, model/component hashes, selected tuning configuration,
  ordered Sobol search, all 96 trial records, tranche scores, Pareto set, and
  comparator-completeness receipt;
- ordered retrieval candidates and scores, displayed rankings, contexts,
  answers, atomic claims, citations, support probabilities, abstentions, and
  deadline/failure records;
- assessor-opportunity schedule, requested/displayed positions, delivery and
  nondelivery reasons, service time, feedback origin/delivery records,
  explicit-label use, exposure propensity, query/task-state versions,
  V-U overwrite/no-hidden-copy audit, checkpoint journal, rollback
  triggers/actions, immutable V lineage nodes, active-pointer events,
  origin-to-current maps, recomputed state digests, and mismatch reasons;
- CPU/accelerator/wall timing, memory, I/O, persistent bytes, tokens, labels,
  interactions, assessor-service minutes, latency, external-meter samples,
  calibration, idle interval, energy uncertainty, and boundary acceptance;
- breach, recovery, censoring, Kaplan--Meier, RMRT, stale-feedback numerator,
  resolution indicator, RMRT pseudovalues, and delivered-delayed-feedback
  denominator records;
- power pseudovalue/resolution residual matrix, planning vector, confirmation/
  transfer simulation indices and joint acceptance
  receipt, recomputed per-task and per-seed metrics, paired contrasts, bootstrap
  indices, 15-entry multiplicity correction, transfer acceptance, failure
  ledger, and signed `summary.md`; and
- `sha256sums.txt` covering every configuration, raw ledger, derived table,
  figure, and report.

The first implementation may be a deterministic smoke adapter that proves
generation, immutable corpus mounting, budget accounting, feedback delay,
propensity logging, state versioning, rollback, digest failure, and analysis
recomputation. Smoke data, modeled energy, public development seeds, or a
single machine run cannot satisfy either confirmatory claim. Until the frozen
corpora, code, calibrated meter path, sealed bundles, and independent rerun
exist, F-016 remains a protocol-complete pre-implementation contract.

## Harness status

Blocked by: data.

The contract records that no workstation adapter or frozen corpus release exists. Its retrieval rules cannot be exercised before a frozen, versioned corpus is released.
