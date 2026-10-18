# Candidate 004: closed endogenous curriculum

**Stage:** 1 — synthetic falsification

**Status:** candidate composition; not an accepted project claim

**Primary question:** does a closed loop of structured proposal generation,
targeted intervention, independent evaluation, and versioned memory produce
useful transfer beyond copying or matched stochastic sampling when proposals,
environment interactions, evaluator calls, memory, time, and energy are held
constant?

## Why this experiment exists

Every candidate originates from learned structure, prior state, or stochastic
variation. This contract does not look for novelty without causal ancestry. It
asks which operations turn copied or recombined material into a useful new
behavior.

The evidence audit separates internally generated sequence structure
([C-061](../../research/claims.md#c-061)), uncertainty-directed exploration
([C-062](../../research/claims.md#c-062)), demonstration-induced narrowing
([C-063](../../research/claims.md#c-063)), causal imitation versus outcome
emulation ([C-064](../../research/claims.md#c-064)), regulated variability
([C-065](../../research/claims.md#c-065)), and memory-supported construction
([C-066](../../research/claims.md#c-066)). None establishes a complete artificial
curriculum. Together they justify one discriminating experiment in which those
operations can be removed separately.

The [learning-science and skill-acquisition audit](../../research/audits/2026-08-05-learning-science-skill-acquisition.md)
adds a narrower constraint: a curriculum cannot be credited from end-of-
practice success alone. Acquisition, delayed retention, novel transfer,
fluency, calibration, motivation, and complete instructional cost are separate
outcomes, and the next event must be conditioned on skill-local evidence rather
than one global learner score.
Evidence: [C-627](../../research/claims.md#c-627)–[C-658](../../research/claims.md#c-658).

The candidate composes existing principles rather than creating a creativity
module:

- temporary candidate state under
  [P-003](../../research/principle-registry.md#p-003--temporary-trace-before-commitment);
- diversity, selection, and protection under
  [P-004](../../research/principle-registry.md#p-004--diversity-selection-and-protection);
- value-directed acquisition under
  [P-007](../../research/principle-registry.md#p-007--prediction-error-allocation);
- a separate evaluation and maintenance path under
  [P-009](../../research/principle-registry.md#p-009--maintenance-plane); and
- versioned memory by information lifetime under
  [P-012](../../research/principle-registry.md#p-012--memory-matched-to-information-lifetime).

The [philosophy-of-science and theory-choice audit](../../research/audits/2026-08-21-philosophy-of-science-theory-choice.md)
adds a narrower boundary: proposal search is always relative to a represented
alternative set and finite budget. Failure to generate a rival cannot promote
the surviving proposal to a unique causal, mechanistic, or ontological account.
Evidence used in construction, tuning, selection, diagnosis, sealed
confirmation, and independent replication remains separately typed.

## Candidate loop

```mermaid
flowchart LR
    context["Task context + versioned memory"] --> propose["Generate structured proposals"]
    propose --> acquire["Choose intervention or test"]
    acquire --> evidence["Observed outcome"]
    evidence --> evaluate["Independent validity · value · risk · cost"]
    evaluate --> decision{"Revise, promote,<br/>or reject?"}
    decision -->|"revise"| propose
    decision -->|"promote"| memory["Validated lineage memory"]
    decision -->|"reject"| failure["Failure record + boundary"]
    memory --> context
    failure --> context
```

For task context $c_t$, accessible memory $m_t$, and stochastic input $\xi_t$,
the shared generator proposes

$$
z_{t,k}\sim q_\theta(z\mid c_t,m_t,\xi_{t,k}),
\qquad k=1,\ldots,K_t,
$$

where $K_t$ is the dimensionless number of proposals purchased at decision
step $t$. A proposal may be a causal hypothesis, intervention plan, or typed
program graph. The candidate loop then:

1. generates proposals from the same locked base generator used by sampling
   baselines;
2. predicts which unresolved distinction an intervention or executable test
   could settle;
3. buys the selected evidence within the interaction budget;
4. evaluates validity, task value, risk, duplication, and physical cost through
   an interface unavailable to the generator while proposing;
5. revises or rejects the proposal; and
6. promotes only validated records into versioned memory.

The generator cannot directly assign its own success label. The evaluator may
use ground-truth simulator outcomes, executable tests, or a locked scoring
model, depending on the track. Evaluator information becomes available to the
generator only through the same result record exposed to every method.

## Skill-local support and outcome state

For learner or model $i$, skill component $j$, and decision step $t$, the
curriculum maintains a versioned support state

$$
s_{ijt}=\left(
\hat a_{ijt},\hat r_{ijt}(\Delta),\hat u_{ijt}(d),
\hat f_{ijt},\hat c_{ijt},h_{ijt},v_{ijt}
\right),
$$

where $\hat a$ is estimated unaided acquisition, $\hat r(\Delta)$ is retained
performance at a declared delay $\Delta$, $\hat u(d)$ is transfer at a
preregistered distance stratum $d$, $\hat f$ is fluency, $\hat c$ is confidence
calibration, $h$ is the current help level, and $v$ records evidence version
and support. Dimensionless estimates retain their scoring rule; fluency is
reported in correct tasks per second. The state never treats a helped answer as
unaided mastery.

The event menu is typed:

```text
full worked trace | partial trace | hint | unaided retrieval | contrastive pair
changed-context application | novel composition | feedback | no review
```

Fading removes support for one component only after successful generation under
changed examples; failure or drift may restore support. Difficulty is useful
only while the target operation remains processable with bounded correction.
Visual friction or extra compute is not credited as a desirable difficulty.

For horizon $\Delta$ and transfer stratum $d$, report the outcome vector

$$
Y_{ij}(\Delta,d)=
\left[A_{ij},R_{ij}(\Delta),T_{ij}(\Delta,d),F_{ij}(\Delta),
\operatorname{BS}_{ij}(\Delta),M_{ij},C_{ij}\right],
$$

where $A$, $R$, and $T$ are score-unit changes, $F$ is correct tasks/s,
$\operatorname{BS}$ is dimensionless Brier score, $M$ contains separately
declared persistence/return and self-report measures, and $C$ is the vector of
learner time, examples, retrievals, hints, feedback, evaluator or teacher time,
bytes, updates, and joules. No scalar average may hide a transfer, calibration,
motivation, or cost loss.

Before a run, register the measurement horizon for every component: acquisition
at the immediate unaided post-test; retention, fluency, calibration, and
motivation at each declared delay; transfer at both a delay and distance
stratum; and cost accumulated through the last reported outcome. A method may
not stop its cost clock before its longest claimed benefit.

## Hypotheses and null

### H1 — targeted evidence

At equal proposal and interaction budgets, choosing interventions that
discriminate between live hypotheses improves held-out causal prediction or
task success relative to random interventions and uncertainty-free rollout.

### H2 — independent evaluation

At equal evaluator-call budgets, separating proposal from executable evaluation
reduces invalid and high-risk promotions relative to generator self-scoring.

### H3 — versioned lineage memory

At equal memory bytes, storing proposal ancestry, tests, failures, and boundary
conditions reduces duplicate failed search and improves recovery after a rule
change relative to a flat replay buffer.

### H4 — controlled variation

A learned proposal-variance controller improves the value–failure frontier over
fixed-temperature sampling only if its advantage survives identical proposal
counts and generator distributions.

### H5 — horizon-qualified sequencing

At equal instructional events, response opportunities, feedback information,
time, and energy, a skill-local scheduler improves the delayed retention–novel
transfer frontier over fixed curricula, tuned spaced-repetition schedules, and
standard knowledge tracing without worsening fluency, calibration, motivation,
or protected outcomes.

### H6 — alternative-set closure

At equal proposal, representation-expansion, evaluator, intervention, human,
time, memory, and energy budgets, explicit alternative generation and targeted
discrimination reduce premature unique causal promotion beyond a fixed-family
selector and the strongest ordinary multi-representation search and independent
red-team portfolio. “No rival found” is a search result, not positive evidence
of uniqueness.

### Joint null

The closed loop offers no material advantage once a strong sampler, active
learner, model-based planner, evolutionary search procedure, or retrieval
baseline receives the same base model, candidate count, interactions,
evaluator calls, memory, wall time, and energy. A tie merges the candidate into
the best conventional method; it does not preserve a separate biological name.

### Instructional scheduler nulls

The learning-science refinement must additionally beat:

1. matched rereading or replay with identical content and elapsed time;
2. retrieval practice with the same attempts, hints, correction, and scoring;
3. massed, fixed expanding, tuned population, and ordinary forgetting-curve
   schedules;
4. blocked, random, and confusability-stratified interleaving with spacing held
   fixed;
5. full worked examples, fixed example–problem alternation, and fixed fading;
6. a tuned knowledge-tracing tutor with the same exercise bank; and
7. fixed-order and fixed-criterion mastery with every extra opportunity charged.

## Track A — causal mechanism discovery

### Environment family

Generate finite structural causal models from a held-out grammar of typed
mechanisms. Each episode contains:

- observable state variables $X_1,\ldots,X_n$ with declared units or normalized
  categories;
- hidden exogenous variables $U$;
- a directed acyclic mechanism graph $G$;
- observational samples;
- a finite intervention menu $\mathcal I$; and
- an episode-specific intervention budget $B_I$ in interaction-equivalents.

Training exposes individual mechanism primitives and some compositions. Test
episodes use new graph compositions, parameter regimes, and confounding
patterns generated from the same declared grammar. Exact test graphs and seeds
remain hidden until scoring.

An intervention $i\in\mathcal I$ has an explicitly declared cost $c_I(i)$ in
interaction-equivalents. The agent may request
$\operatorname{do}(X_j=x)$, a paired control, or another permitted measurement.
Its cumulative interaction cost must satisfy

$$
\sum_{t}c_I(i_t)\le B_I.
$$

The agent outputs a versioned hypothesis graph, calibrated predictions for
held-out interventions, and a policy for a downstream goal. Graph recovery is
diagnostic; interventional prediction and decision quality are primary because
multiple graphs may be observationally equivalent.

### Track-A splits

1. **Observed composition:** familiar primitive combination and parameter
   range; verifies the interface.
2. **Novel composition:** familiar primitives in an unseen causal graph.
3. **Hidden confounding:** observational correlations admit competing causal
   accounts.
4. **Intervention shift:** an intervention changes a mechanism parameter or
   invalidates a previously useful edge.
5. **Rule change:** the environment grammar remains but one stable mechanism is
   replaced midstream; tests recovery and memory invalidation.
6. **Adversarial redundancy:** many proposals are syntactic variants of the
   same hypothesis; tests duplicate control.
7. **Sealed alternative release:** initial observations make a represented
   hypothesis and a hidden causal mechanism equivalent. The hidden mechanism is
   absent from the initial family but reachable through a declared, sealed
   representation-expansion operator; one affordable intervention makes the
   mechanisms disagree. This tests rival discovery, preserved uncertainty, and
   premature closure rather than impossible enumeration of all theories.

## Track B — compositional executable construction

### Task family

Use a typed dataflow language with a finite library of deterministic and
stochastic operators. Training demonstrations show operators, interface rules,
and selected short programs. Test tasks require graphs not present in the
demonstration corpus under canonical graph serialization.

Each task provides:

- an input/output type contract;
- visible training examples;
- a hidden test suite;
- a sandboxed interpreter;
- an operator and graph-size budget;
- a maximum evaluator-call count; and
- a risk label for forbidden effects such as out-of-bounds access, non-
  termination, or prohibited tool use.

A valid proposal must type-check, execute inside the sandbox, pass the hidden
tests, and remain inside resource and risk constraints. “Novel” means its
canonical program graph was absent from demonstrations and stored successful
solutions. Novelty receives no credit without validity and task value.

### Track-B regimes

1. **Direct retrieval:** a demonstrated graph already solves the task.
2. **Parameter adaptation:** topology is known; constants or operator settings
   change.
3. **Novel composition:** known operators require a new graph.
4. **Distractor demonstration:** copied steps contain causally irrelevant work.
5. **Sparse evaluator:** only a limited number of tests can be purchased.
6. **Rule revision:** an operator changes semantics and prior successes must be
   invalidated or repaired.
7. **Deceptive novelty:** many graph variants are distinct but equivalent,
   invalid, or more expensive than a known solution.

## Compared systems

All learned systems start from the same frozen or identically trained base
generator. Any method-specific trainable state is counted in parameter bytes,
training energy, and adaptation energy.

### B0 — imitation or behavioral cloning

Produce the highest-probability demonstrated action, hypothesis, or program
continuation. No stochastic proposal search and no self-selected intervention.

### B1 — retrieval and recombination

Retrieve the nearest demonstrations and compose their stored fragments using a
fixed beam. This tests whether explicit memory assembly explains the result
without an endogenous curriculum.

### B2 — matched stochastic sampling

Draw exactly the same number $K_t$ of proposals from the same generator with a
fixed preregistered temperature. Evaluate them with the same total evaluator
budget, but choose interventions or tests uniformly from the permitted set.

### B3 — adaptive sampling without targeted intervention

Allow a learned or bandit-controlled temperature and proposal allocation. Keep
evidence acquisition random or fixed. This isolates controlled variation from
experiment design.

### B4 — conventional active learning or experiment design

Use a tuned expected-information-gain, Bayesian experimental-design, or
query-by-committee policy appropriate to Track A. It receives the same
hypothesis representation and intervention menu.

### B5 — model-based planning

Use the shared learned dynamics model with tree search or model-predictive
control. It may simulate proposals but retains no versioned failure lineage
beyond the equal-size replay state.

### B6 — evolutionary or quality-diversity search

Use mutation, recombination, selection, and an archive at the same proposal,
evaluation, and memory budget. This is a strong conventional baseline for
Track B.

### B7 — generator self-evaluation

Use the candidate generator and revision loop but replace the independent
evaluator with its own predicted score. This isolates evaluator separation.

### B8 — conventional instructional schedulers

Use tuned fixed curricula, spaced repetition or forgetting-curve review,
knowledge tracing, fixed mastery criteria, and fixed worked-example fading.
Each receives the same item bank, learner observations, help and feedback
interfaces, and total instructional budget as the candidate.

### B9 — complete alternative-generation and red-team search

Use fixed-family Bayesian model selection, symbolic and system-identification
search, multiple preregistered representations, independent proposer/red-team
search, semantic equivalence testing, and conventional Bayesian experimental
design. Charge every proposal, representation expansion, reviewer interaction,
evaluator call, intervention, retained byte, second, and joule. B9 is the
decisive Track-A comparator for H6; the candidate earns no credit for beating a
single narrow hypothesis grammar.

### C — closed endogenous curriculum

Use structured proposals, targeted acquisition, independent evaluation,
versioned lineage memory, and a learned variation controller. Each operation
is separately ablated below.

### O — oracle acquisition ceiling

Select the intervention or evaluator call with the greatest ground-truth
reduction in final task error. The oracle verifies scoring and upper-bounds the
value of acquisition; it is not a competitor.

## Equal-budget contract

For each paired episode, methods receive identical:

- demonstration records and order;
- base-generator architecture, parameters, and numeric precision;
- maximum generated candidates $K=\sum_tK_t$;
- environment interaction budget $B_I$;
- evaluator-call budget $B_V$;
- alternative-generation and representation-expansion call budgets;
- accessible memory bytes $B_M$;
- maximum serialized candidate and lineage bytes;
- wall-clock deadline and accelerator allocation;
- tool permissions and sandbox limits;
- task-specific quality, risk, and latency envelope;
- maximum learning events, examples viewed, retrieval attempts, hints, retries,
  and feedback information;
- learner/model active time plus evaluator or teacher preparation and response
  time;
- independent proposer/red-team and equivalence-review time; and
- identical preregistered immediate, retention-horizon, and transfer tests.

Methods may leave a budget unused. They may not convert unused evaluator calls
into additional environment interactions unless the conversion rule is fixed
before all runs and applied to every method. Report both allocated and consumed
budgets.

If sequential control makes exact wall-time matching impossible, run two
comparisons: equal logical budgets and equal measured joules. A method must
identify which claim each comparison supports.

## Candidate and memory records

Every proposal receives an immutable record:

```text
candidate_id
parent_candidate_ids
generator_version
context_and_memory_versions
stochastic_seed_or_sampling_record
claim_target
alternative_set_version_and_equivalence_relation
alternative_generation_search_and_exclusion_record
unresolved_alternative_debt
auxiliary_bundle_and_observation_operator_versions
evidence_use_role_and_access_DAG_hash
freeze_and_preregistration_hash
named_rival_or_error_and_discrimination_test
method_data_calibration_code_theory_and_review_roots
predicted_distinctions
selected_intervention_or_test
measured_result
validity_and_risk_result
energy_latency_and_byte_cost
promotion_rejection_or_revision
invalidation_boundary
skill_component_and_prerequisite_versions
help_level_and_answer_exposure
unaided_success_latency_and_error_type
target_retention_horizon_and_transfer_stratum
pre_feedback_confidence_and_post_feedback_action
instructional_event_time_attempt_feedback_and_energy_cost
```

The memory baseline receives the same byte budget and may use a flat replay or
retrieval store. The candidate system must earn any benefit from lineage,
failure retention, and invalidation rather than from more storage.

## Ablations

1. remove targeted acquisition but keep structured proposals;
2. replace the independent evaluator with self-evaluation;
3. remove lineage and failure records while preserving successful memories;
4. replace learned variation control with fixed temperature;
5. remove revision and permit only accept/reject;
6. prevent memory promotion between episodes;
7. remove explicit duplicate detection;
8. provide targeted acquisition to the best stochastic baseline;
9. provide lineage memory to the best evolutionary baseline;
10. randomize proposal ancestry labels to test whether lineage content rather
    than extra metadata produces the effect;
11. replace skill-local support with one global competence score;
12. replace horizon-qualified scheduling with current-accuracy scheduling;
13. use fixed fading while preserving examples, hints, and feedback; and
14. optimize acquisition alone while hiding delayed retention, transfer,
    calibration, motivation, and cost from the scheduler;
15. remove alternative-set identity while preserving candidate count;
16. remove representation expansion and independent rival search;
17. replace semantic equivalence classes with syntactic proposal counts;
18. remove evidence-use and access ancestry while retaining timestamps; and
19. count agreeing proposal pipelines as independent after giving them a shared
    generator, data, or evaluator root.

## Measurements

### Task value

- held-out interventional negative log likelihood and calibration for Track A;
- downstream policy return or regret under the discovered mechanism;
- hidden-test pass fraction for Track B;
- valid task solutions per qualified episode;
- adaptation after a mechanism or operator change; and
- worst-stratum performance across confounding, distractor, sparse-evaluator,
  and rule-revision regimes.

### Proposal behavior

- proposal count and valid-proposal fraction;
- duplicate fraction under canonical equivalence;
- fraction copied exactly from demonstrations;
- distinct valid solution structures;
- revision depth and lineage branching factor;
- invalid, unsafe, timed-out, and evaluator-rejected proposals; and
- contribution of each acquired observation to posterior or test-result change.

### Theory-choice behavior

- represented and released alternative-set sizes and semantic equivalence
  classes;
- viable-rival yield, false unique promotion, and preserved equivalence-set
  recall;
- proposal/evaluator calls, seconds, and joules to first viable rival;
- intervention choice and downstream regret when leading rivals disagree;
- evidence-use/access-DAG classification and deterministic reclassification
  after planted leakage;
- shared generator, data, evaluator, and review roots among agreeing proposals;
  and
- separate fit, prospective-prediction, causal-effect, causal-structure,
  mechanism, and ontology promotion attempts.

### Acquisition and evaluation

- interactions consumed and interaction-equivalent cost;
- evaluator calls and evaluator wall time;
- expected versus realized information or decision gain;
- intervention redundancy;
- time and energy to first valid solution; and
- quality after each cumulative budget decile.

### Memory and recovery

- hot and cold bytes;
- retrieval and write bytes per episode;
- duplicate failed branches avoided;
- false invalidation and stale-memory use;
- recovery events and joules after a rule change; and
- provenance coverage of promoted proposals.

### Instructional state and durable learning

- unaided acquisition by skill component and help level;
- retention at every preregistered delay $\Delta$;
- trained-form, near, changed-context, and novel-composition transfer reported
  separately;
- correct tasks/s with the complete speed–accuracy frontier;
- pre-feedback Brier score, expected calibration error with frozen bins, and
  confidence discrimination;
- voluntary persistence, return, hint seeking, and subjective motivation as
  separate measures;
- examples, retrievals, failed attempts, hints, feedback bits, and learner,
  evaluator, and teacher seconds; and
- scheduler inference, storage, data movement, optimizer updates, and joules.

### Risk

- constraint-violation and catastrophic-proposal fractions;
- expected calibration error by risk stratum;
- unsafe promotion count;
- abstention and escalation rates; and
- risk-weighted failure reported separately from task value.

No scalar “creativity score” is primary. Validity, novelty, value, risk, cost,
and transfer remain separate axes.

## Energy and latency accounting

For method $m$, total paired-episode energy is

$$
E_m = E_{m,\mathrm{base}}+E_{m,\mathrm{generate}}
    +E_{m,\mathrm{intervene}}+E_{m,\mathrm{evaluate}}
    +E_{m,\mathrm{memory}}+E_{m,\mathrm{adapt}}
    +E_{m,\mathrm{host}},
$$

where every term is measured in joules at the same declared board, node, or
facility boundary. $E_{m,\mathrm{base}}$ is the paired idle-plus-framework
energy charged under the frozen measurement contract. Report accelerator,
host, storage, and external-service energy separately when they cannot share a
physical meter.

For $N_Q$ qualified episodes, lifecycle energy per qualified episode is

$$
\bar E_{m,Q}
=\frac{E_{m,\mathrm{train}}+E_{m,\mathrm{setup}}+E_{m,\mathrm{index}}
      +E_{m,\mathrm{episodes}}+E_{m,\mathrm{recovery}}}{N_Q},
$$

with the numerator in joules and $N_Q$ a dimensionless episode count. Failed,
abstained, and unsafe episodes remain in energy totals even when they do not
enter the qualified-performance numerator.

Report median and p95 time to valid solution, intervention response latency,
evaluator latency, and end-to-end episode latency in seconds. Do not infer
energy from TDP or operation counts.

## Statistical plan

- Generate task instances and seeds before the confirmatory run and keep test
  graph/operator compositions hidden from method tuning.
- Pair every method on identical task instances, demonstrations, disturbances,
  and base-generator checkpoints.
- Tune hyperparameters on separate development families under the same total
  tuning energy cap.
- Report paired bootstrap confidence intervals across task instances and seeds
  for each primary axis.
- Correct the confirmatory family across H1–H4; H5 has its own preregistered
  retention and transfer family; H6 has its own alternative-release and false-
  closure family; remaining comparisons are exploratory.
- Keep immediate acquisition, each delayed retention horizon, and every
  transfer-distance stratum separate; model learner/model initialization,
  item, skill, teacher/evaluator, and cohort where those sampling levels exist.
- Publish every seed, failed run, budget overrun, unsafe proposal, and excluded
  episode with its preregistered exclusion reason.
- Repeat the winning comparison on a held-out environment grammar or operator
  library before changing a claim status.

## Promotion and rejection gates

Reject the closed-loop candidate if any of the following holds:

1. matched stochastic sampling reaches the same task, transfer, risk, and cost
   frontier;
2. conventional active learning explains Track-A gains at equal interaction
   cost;
3. evolutionary or quality-diversity search explains Track-B gains at equal
   proposal, evaluator, and memory budgets;
4. independent evaluation does not reduce invalid or unsafe promotion after
   its calls and energy are charged;
5. lineage memory does not reduce repeated failure or recovery cost at equal
   bytes;
6. novelty gains vanish under canonical equivalence or hidden tests;
7. advantages rely on future leakage, simulator state unavailable at decision
   time, or a stronger evaluator interface;
8. lifecycle energy or tail latency leaves the declared envelope;
9. the result fails on the held-out grammar/library replication;
10. skill-local sequencing is matched by a tuned fixed schedule or standard
    knowledge-tracing tutor at equal total instructional cost;
11. apparent learning gains vanish on delayed or novel-composition tests, come
    from helped-answer leakage, extra attempts, feedback, or evaluator time, or
    trap weak learners behind a noisy mastery gate; or
12. calibration improves only by indiscriminate uncertainty, fluency gains
    trade against error, motivation losses increase attrition, or scheduler
    overhead consumes the saved learning work.
13. B9 matches viable-rival discovery, false-closure avoidance, discriminating
    intervention choice, and downstream regret at equal lifecycle budget; or
14. causal, mechanistic, or ontological confidence rises merely because the
    candidate's own proposal process failed to generate the sealed alternative,
    evidence used for selection is relabeled confirmation, or correlated
    proposal pipelines are counted as independent support.

Promote only the operations that survive their ablations. A possible result is
that targeted experiment design wins while learned variation and lineage memory
do not; the architecture should then retain experiment design and retire the
rest of the composed story.

## Expected interpretation

- **Candidate wins both tracks:** proceed to a grounded curriculum integration
  with the surviving components only.
- **Active learning wins Track A; evolutionary search wins Track B:** merge the
  proposal into those conventional primitives and reuse their implementations.
- **Evaluation helps; endogenous acquisition does not:** retain the independent
  gate as a safety/quality mechanism, not a creativity mechanism.
- **Memory helps only after rule changes:** scope lineage memory to non-
  stationary regimes and charge its idle cost elsewhere.
- **Sampling matches all results:** reject the closed endogenous curriculum as
  unnecessary composition at the tested budgets.
- **Only skill-local scheduling survives:** retain it as an ordinary adaptive
  instructional scheduler and retire the broader endogenous-curriculum label.
