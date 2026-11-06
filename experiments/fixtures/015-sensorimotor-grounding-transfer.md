# Fixture F-015 — Sensorimotor grounding and hidden transfer

- **Status:** pre-implementation experiment contract; no empirical result
- **Direct claim:** [C-007](../../research/claims.md#c-007)
- **Evidence boundary:** representation-learning and action-conditioned-prediction
  results motivate candidate mechanisms but do not establish this fixture's
  transfer effect, thresholds, or safety properties
- **Authority:** this fixture operationalizes one bounded claim; it does not
  establish general understanding, truthfulness, or a universal grounding
  theory

## Question and bounded interpretation

Does temporally aligned perception--action--outcome training produce more
robust physical transfer than information-, interaction-, model-, optimizer-,
time-, and energy-budget-matched text-centric or passive-multimodal training?

Within this fixture, a **robust physical concept** is not inferred from a probe
or a fluent explanation. It is the ability to predict and use intervention
effects in sealed environments whose objects, dynamics, bodies, tools, and
sensor conditions differ from training. The claim is supported only if the
aligned arm:

1. beats every eligible mature text and passive comparator on the frozen
   hidden-transfer endpoints in both task families;
2. loses the corresponding benefit under targeted time, action, and outcome
   shuffles;
3. remains calibrated and does not worsen protected safety strata; and
4. stays inside every matched resource boundary without being dominated on the
   quality--risk--cost frontier.

The intervention is the joint temporal relation among permitted observations,
actions, and outcomes. No arm receives additional facts, simulator state,
labels, action opportunities, evaluator queries, or tuning because it is the
aligned arm.

## Independent units and task families

The independent unit is one frozen `seed × task-family` world. Episodes,
steps, branches, targets, and action opportunities within that world are
repeated measurements, never independent replicates. Every seed instantiates
both materially different families.

### Family F1 — Contact, manipulation, and tool use

A partially observed 3-D workcell contains rigid and compliant objects,
containers, ramps, supports, and simple tools. Permitted observations include
tokenized RGB, depth, proprioception, touch, force/torque, and audio. Actions
include inspect, approach, grasp, push, lift, rotate, release, insert, and use a
tool. Latent physical variables include mass (`kg`), static and dynamic
friction (`1`), compliance (`m/N`), restitution (`1`), containment, support,
and actuator slip.

Training covers individual factors and registered combinations. Sealed
transfer changes object geometry and texture, factor combinations, mass and
friction regimes, tool geometry, gripper kinematics, actuation delay, and one
sensor's reliability. Evaluation asks for action-conditioned outcome
distributions, paired counterfactual effects, and completion of manipulation
goals under an action cap.

### Family F2 — Navigation, latent dynamics, and causal mechanisms

A partially observed mobile agent operates in rooms containing occluders,
landmarks, doors, switches, one-way mechanisms, moving hazards, and transport
surfaces. Permitted observations include tokenized RGB, depth, egomotion,
contact, range, and sparse audio. Actions include inspect, move, turn, brake,
press, pull, wait, and interact with a mechanism. Latent variables include
traction (`1`), drift force (`N`), actuator gain (`1`), response delay (`s`),
switch--door topology, occluded hazard motion, and sensor dropout.

Sealed transfer changes map topology, mechanism composition, traction and
drift jointly, body wheelbase and actuator response, landmark appearance, and
sensor availability. Evaluation asks for action-conditioned predictions,
paired switch/action counterfactuals, and safe goal completion. F2 cannot be a
reskin of F1: its generator, transition graph, action semantics, and primary
physical-effect vector have separate hashes.

Per seed and family, the default world contains exactly:

- 2,400 logged training episodes of 96 transitions, or 230,400 transition
  opportunities;
- 400 development-only in-distribution evaluation episodes;
- 800 transfer episodes, visible only in development and sealed in confirmation
  and held-out packs, each with four evaluator-owned paired counterfactual
  queries, or 3,200 branch pairs; and
- 76,800 online transfer action opportunities, with terminal episodes padded
  by absorbing no-op records so opportunity counts remain equal.

These are frozen design counts, not a post hoc power argument. Development
estimates seed-level variance; the deterministic rule in the analysis section
chooses one confirmation prefix of 32, 40, 48, 56, or 64 already committed
seeds before any confirmation item is revealed. The revealed prefix is never
extended. If 64 seeds do not meet the frozen power rule, this protocol version
is infeasible rather than repaired after looking at outcomes.

## Frozen event packet and information boundary

The simulator first creates an arm-independent append-only event packet. Each
transition contains:

$$
r_t=(e,t_c,t_r,o_t,u_t^{\mathrm{cmd}},u_t^{\mathrm{real}},y_{t+1},q_t),
$$

where $e$ is the episode identifier, $t_c$ and $t_r$ are capture and receipt
times in seconds, $o_t$ is the permitted percept packet, $u_t^{\mathrm{cmd}}$
is the commanded action, $u_t^{\mathrm{real}}$ is the realized action after
actuator dynamics, $y_{t+1}$ is the permitted outcome packet, and $q_t$ is
provenance and measurement-quality metadata. Hidden simulator state, latent
factor names, future observations, evaluator branches, and transfer labels are
never part of $r_t$.

A frozen arm-independent tokenizer maps each training transition to exactly
112 unsigned 16-bit source atoms:

- 64 percept atoms;
- 8 commanded-action atoms;
- 8 realized-action atoms;
- 16 outcome atoms; and
- 16 canonical language/provenance atoms.

Thus each arm receives exactly 25,804,800 training atom slots and 51,609,600
input bytes per seed and family before batching. A masked field occupies the
same number of explicit mask atoms. Padding, duplicated records, and ignored
fields are reported separately and cannot count as information exposure.
Tokenizer training uses development worlds only, cannot inspect latent state,
and is charged equally to all arms.

The input-view compiler emits a **fact ledger** and a reversible source-to-view
map. The strongest text view serializes every permitted atom, timestamp, row
boundary, action, and outcome losslessly as text tokens. Therefore a positive
result cannot be attributed merely to withholding trajectory facts from text.
The passive and shuffle views intentionally remove or permute only the relation
named by their intervention. All remaining atom identities, multiplicities,
precision, episode membership, missingness, and marginal distributions remain
identical.

Training is performed from the common logged packet. No arm can collect extra
adaptive training experience. Online transfer gives every arm the same initial
states, action vocabulary, maximum 96 decisions per episode, sensor-acquisition
schedule, and evaluator-call cap. Common-random-number disturbance streams are
keyed by `seed × episode × step`, not by the arm's action, while action-caused
state divergence remains part of the task.

## Arms and mature nulls

All trainable arms use the same universal sequence backbone, modality-token
vocabulary, output-head byte budget, parameter-byte ceiling, context length,
optimizer family, and stopping opportunities. The lossless text arms T1 and T2
and aligned arm A use the **same four heads, target rows, target masks, loss
weights, and update schedule**: action-conditioned next-percept prediction,
physical-outcome prediction, uncertainty calibration, and the registered task
objective. T1 and T2 differ from A only in the reversible serialization and,
for T2, its charged retrieval path. This is the primary representation-view
contrast. Deliberately different passive or imitation objectives remain mature
frontier nulls but cannot by themselves identify a benefit of representation
format or alignment.

1. **T0 — natural-language trajectory diagnostic.** A strong autoregressive text
   learner receives deterministic, non-oracle descriptions of every permitted
   record. It is a conventional ecological diagnostic, but its different
   objective prevents it from serving as an inferential frontier comparator.
2. **T1 — lossless event-text model.** The same backbone receives the complete
   reversible textual serialization of all 112 atoms with temporal,
   action, and outcome row relations intact. This is the strongest
   information-matched text null.
3. **T2 — retrieval-augmented event-text model.** T1 plus a learned retrieval
   policy and bounded index. Index construction, lookup bytes, latency, and
   energy are charged inside the common envelope.
4. **P0 — passive multimodal model.** The model receives the same percept,
   outcome, language, time, and provenance atoms, while action fields are mask
   atoms. It learns static and temporal multimodal associations without action
   conditioning.
5. **P1 — synchronized predictive multimodal model.** P0 plus masked and
   next-percept prediction. It is the mature synchronized representation null,
   not an intentionally weak static classifier.
6. **B0 — behavior-cloning null.** Percepts predict logged commands, but the
   outcome field is independently permuted within the frozen matching blocks.
   This preserves imitation skill while removing action--outcome credit.
7. **A — aligned sensorimotor model.** The complete permitted record is trained
   with action-conditioned next-percept, physical-outcome, uncertainty, and
   task objectives. This is deliberately a standard action-conditioned world
   model rather than an architectural novelty claim.
8. **S-time — time-shuffled A.** Complete transition triples are bijectively
   reassigned to different observation times within the generator-certified
   exchangeability blocks defined below. Atom counts and within-triple
   action--outcome relations remain unchanged, but temporal correspondence to
   prior percepts is broken.
9. **S-action — action-shuffled A.** Commanded and realized action pairs are
   jointly deranged only inside a generator-certified exchangeability block
   conditional on the complete learner-permitted pre-action history.
10. **S-outcome — outcome-shuffled A.** Outcome packets are deranged only
    inside a generator-certified exchangeability block conditional on the
    complete learner-permitted history and realized action.
11. **O — hidden-state oracle.** An excluded ceiling receives latent simulator
    variables and exact dynamics. It diagnoses generator ambiguity only and
    can never support C-007.

The three shuffle compilers have separate frozen keys and field maps:

- **S-time:** the block key is family, environment, phase, protected stratum,
  missingness pattern, and the permitted history ending **before** the current
  row; it excludes the current episode ordinal, capture/receipt times, and every
  order-derived atom. Destination `episode`, ordinal, $t_c$, and $t_r$ remain in
  place. Source percept, commanded/realized action, outcome, and non-order
  quality fields travel together; the destination provenance is recomputed.
  Original row IDs, times, ordinals, and source-to-destination receipts are
  evaluator-only and absent from learner views, retrieval keys, and targets.
- **S-action:** the pre-action key includes family, environment, phase, current
  destination times, complete permitted history, current percept, missingness,
  and protected stratum, but excludes commanded/realized action and outcome.
  Only the commanded/realized action pair travels; every other learner-visible
  field stays at the destination.
- **S-outcome:** the pre-outcome key contains the S-action key plus destination
  commanded/realized action and excludes only outcome atoms and their quality
  fields. Only those excluded fields travel.

After each map, the compiler regenerates all checksums and permitted time atoms
from destination fields and proves that no **explicit** original-order atom
survives. Because chronology can still leak through state continuity, S-time
also has a frozen recovery audit. For every accepted block of size $q$, two
evaluator-only attacks receive exactly the learner-visible shuffled rows and the
public family manifest, but no source IDs, original times, ordinals, latent
state, or map receipt:

1. a maximum-likelihood assignment scores every `payload × destination` pair
   with the frozen generator transition density and solves the resulting
   bipartite assignment by the Jonker--Volgenant algorithm, with bytewise source
   digest as the final tie-break; and
2. a continuity assignment replaces that score by the registered normalized
   $L_1$ distance between the payload's terminal observable state and the next
   destination's initial observable state, using the same solver and tie-break.

The attack implementation, feature order, float64 arithmetic, missing-value
penalty of 10, and solver version are committed before generation. Accuracy is
the number of payloads assigned to their original source ordinal divided by
$q$. Each block is a dependent permutation unit, so no row-level binomial model
is used: **both** attacks must have block accuracy no greater than $1/q+0.05$
in **every** accepted block. In addition, every accepted row must belong to at
least two complete
assignments whose total generator log likelihood is within 0.1 `nat/target` of
the optimum. A failed cell or unique near-optimum mapping rejects that world
before reveal. This is a registered attack-based ambiguity criterion, not a
claim that every possible chronology attack has been excluded. These keys and
tests are the only allowed permutation procedure; a coarser fallback is
forbidden.

Arms T1--T2, P0--P1, and B0 are the exact five-member eligible null set. A must
beat every eligible null on each registered frontier test; selecting whichever
null looks weakest is forbidden. T0 is reported as an objective-mismatched
diagnostic. S-time, S-action, and S-outcome are causal controls, not frontier
comparators. O is excluded from every promotion calculation.

Each shuffle is a one-to-one permutation generated before training. The world
generator must first emit exchangeability blocks with at least four rows,
identical family/environment, complete permitted-history digest through the
intervention boundary, missingness pattern, version, and protected-stratum
membership. Within a block, every substituted transition must have nonzero
probability under the frozen generator and a conditional transition
log-likelihood no more than 0.1 `nat/target` below its unshuffled source.
Evaluator-only latent variables are never given to an arm, but their categorical
counts must match exactly and every continuous latent standardized mean
difference must be at most 0.05 between source and destination rows.

The generator also supplies a sham permutation among replicated rows with the
same permitted history, action, and outcome-equivalence class. The sham may not
worsen its targeted endpoint by more than 0.01 absolute. If a complete
derangement cannot satisfy conditional support, transition likelihood, latent
balance, and sham criteria, that world is rejected before reveal. A relaxed
shuffle may be reported only as corruption sensitivity and cannot satisfy
H-time, H-action, or H-outcome. A receipt records source and destination hashes,
block identity, RNG state, transition likelihoods, latent-balance audit,
derangement rate, sham result, and per-field conditional and marginal digests.

## Equal budgets and resource accounting

Per `seed × family × arm`, the following ceilings are identical:

- 230,400 logged training transitions and 25,804,800 source-atom slots;
- exactly 256 post-tokenizer input positions and 64 target positions per unique
  transition, or 58,982,400 unique-corpus input positions and 14,745,600
  unique-corpus target positions, with no truncation;
- 230,400 logged action events and zero adaptive training actions;
- 76,800 online transfer action opportunities and 3,200 counterfactual branch
  pairs;
- 67,108,864 bytes (`64 MiB`) of trainable parameters, including modality
  embeddings, routers, adapters, and retrieval policies;
- 268,435,456 bytes (`256 MiB`) of optimizer state and 134,217,728 bytes
  (`128 MiB`) of writable context, cache, retrieval index, and adaptation state;
- 262,144 optimizer updates, batch size 64 transitions, and identical gradient
  accumulation and precision choices;
- exactly 16,777,216 executed row presentations, 4,294,967,296 executed input
  positions, 1,073,741,824 executed target positions, and
  1,099,511,627,776 dense 256 × 256 attention-score pairs per model layer;
- 48 development hyperparameter trials per arm and no confirmation retuning;
- 7,200 CPU-seconds, 7,200 seconds of wall time, and 7,200 seconds of charged
  accelerator occupancy;
- 8,589,934,592 B (`8 GiB`) peak host RAM and 137,438,953,472 B (`128 GiB`)
  total durable-plus-transferred I/O; and
- 3,600,000 joules of net lifecycle energy.

All byte quantities use exact powers-of-two where marked `MiB`; transferred and
durable data use bytes (`B`). An arm that exceeds any ceiling is infeasible for
that paired unit. An arm may finish early, but unused time, energy, updates,
queries, or bytes are not donated to another component and are never filled by
meaningless work. Actual use is reported alongside the common ceilings.
The post-tokenizer compiler must prove that all permitted source facts remain
reversible inside the fixed positions. Padding is charged as attention work;
truncation, overflow into an extra sequence, loss of a permitted fact, or a
different input/target/attention-position count makes the paired world
ineligible. CPU time, host RAM, I/O, accelerator time, and wall time are measured
for the complete view--train--evaluate--checkpoint interval.
The training sampler uses PCG64 to make a new no-replacement permutation of all
230,400 rows for each epoch, keyed by `seed × family × epoch`; execution is the
first 16,777,216 indices of the concatenated permutations, exactly 72 complete
epochs plus 188,416 rows of epoch 73. Every arm receives the identical index
sequence. Unique-corpus exposure and executed work are reported separately and
neither may be substituted for the other.

The development search space, scheduler, trial count, validation calls, and
selection rule are hashed before tuning. Hyperparameters are selected by the
same development-only minimax rule over intervention NLL, physical-effect
error, transfer success deficit, calibration error, unsafe-event rate, p99
latency, state bytes, and measured joules, each divided by its frozen smallest
relevant effect. Ties are broken by lower measured joules, then lower CPU
seconds, then lower state bytes, then the fixed arm number above.

Per-run allocated lifecycle energy is

$$
E_{\mathrm{life}}=E_{\mathrm{view}}+E_{\mathrm{tune}}/N_c+
E_{\mathrm{train}}+E_{\mathrm{eval}}+E_{\mathrm{checkpoint}},
$$

where every term is net wall-plug energy in joules and $N_c=64$ is permanently
frozen as the original 32-seed × two-family primary confirmation service units.
Choosing 40--64 confirmation seeds, running transfer, retrying a failure, or
performing the independent replication never increases this denominator and
therefore cannot dilute tuning energy. In addition to the allocated per-run
value, the report gives unamortized tuning energy and total lifecycle energy
$E_{\mathrm{tune}}+\sum E_{\mathrm{run}}$ over all attempts. For each exclusive
measurement block,

$$
E_{\mathrm{net}}=E_{\mathrm{wall}}-P_{\mathrm{idle}}t,
$$

where $E_{\mathrm{wall}}$ is cumulative external-meter energy (`J`),
$P_{\mathrm{idle}}$ is the preregistered idle power (`W = J/s`), and $t$ is
elapsed time (`s`). The meter must be externally calibrated, sample at 1 Hz or
faster, identify its load and facility boundary, and provide calibration date,
expanded uncertainty, clock trace, and exclusive interval ownership. The upper
uncertainty bound must remain below the 3,600,000 J ceiling.

Software telemetry, thermal-design power, FLOP estimates, or modelled energy
are diagnostics only. If the meter is absent, expired, overlaps another load,
loses samples, or cannot own the facility boundary, energy is recorded as
`not measured`. Because matched measured energy is part of this complete
confirmation contract, such a run is development-only and cannot promote
C-007. Energy accounting is fail-closed; no estimate may be substituted.

## Sealed interventions and counterfactual transfer

Confirmation and transfer generators are sealed after the source revision,
tokenizer, view compiler, arm configurations, metric container, thresholds,
and development report are content-hashed. The evaluator, never the learner,
retains latent state and may clone it for assessment.

For each counterfactual query, the evaluator saves one hidden parent state and
executes registered alternatives $do(u)$ and $do(u')$ under the same exogenous
disturbance stream. Every arm predicts both outcome distributions before either
branch is revealed. Branch observations are evaluation-only: they cannot be
written to model, retrieval, optimizer, calibration, or adaptation state.
Parent identifiers and intervention labels are revealed only after predictions
are durably committed.

The held-out pack contains all of the following registered changes in each
family:

1. unseen combinations of known object or mechanism factors;
2. at least one dynamics range outside the development convex hull;
3. a changed body, actuator, or tool transfer function;
4. a changed environment layout or causal topology;
5. delayed, missing, or reliability-shifted sensor channels; and
6. joint four-factor shifts not observed during development.

An arm may adapt only in the separately labelled online-adaptation diagnostic,
under the common 128 MiB state and 76,800-action envelope. The primary hidden
transfer endpoint is zero-update evaluation. Adaptation performance can never
replace a failed zero-update result.

## Frozen seeds, allocation, and reveal

All pseudorandom generation uses PCG64 with three disjoint decimal packs:

- development: `15001`--`15024`;
- committed confirmation reserve: `15101`--`15164`, of which the power rule
  selects one prefix ending at `15132`, `15140`, `15148`, `15156`, or `15164`;
  and
- held-out intervention/counterfactual transfer: `15201`--`15232`.

Subseeds are the first unsigned 64 bits of
`SHA-256("F015|pack|seed|family|episode|purpose")`. Each seed runs both
families, all eligible arms, all shuffles, and the same realized source packet.
Arm execution order follows a seed-derived balanced Latin square. Confirmation
and transfer bundles remain encrypted or access-controlled until the complete
freeze receipt exists. Before development outcomes are analysed, a custodian
publishes salted SHA-256 commitments to the canonical PCG64 state, ordered seed
lists, generator/configuration hashes, and UTF-8/JSON serialization rules for
all three packs. Confirmation and transfer states remain secret until their
respective freeze receipts exist. Namespace overlap in any seed or derived
subseed aborts the release. Changing a seed, generator, split, exclusion, view,
threshold, or metric after reveal makes a new versioned experiment; it never
repairs the revealed run.

## Measurements and exact units

All outcomes are retained per seed, family, transfer axis, episode, branch,
protected stratum, horizon, and arm. Primary metrics are computed from raw
committed predictions.

### Predictive and causal outcomes

1. **Intervention outcome NLL** is mean negative log probability in
   `nat/target` over the frozen quantized outcome targets. Tokenization and
   target multiplicity are identical across arms. Prediction horizons are
   exactly 1, 2, 4, 8, and 16 transitions; the registered long-horizon NLL is
   the equal-weight mean of the 8- and 16-transition values.
2. **Normalized physical-effect error** is

   $$
   e_{\mathrm{phys}}=\frac{1}{K}\sum_{k=1}^{K}
   \frac{|\hat{\Delta y}_k-\Delta y_k|}{s_k},
   $$

   where $K$ is the fixed number of continuous effects, $\Delta y_k$ is the
   observed difference between paired interventions in the native unit, and
   $s_k$ is a preregistered positive scale in the same unit. F1 uses position
   (`m`, $s=1\,m$), angle (`rad`, $s=\pi\,rad$), terminal speed (`m/s`,
   $s=2\,m/s$), and impulse (`N\,s`, $s=10\,N\,s$). F2 uses cross-track
   displacement (`m`, $s=10\,m$), heading (`rad`, $s=\pi\,rad$), arrival time
   (`s`, $s=96\,s$), and actuator response speed (`m/s`, $s=2\,m/s$).
   $e_{\mathrm{phys}}$ has unit `1`; raw-unit errors are also reported.
3. **Counterfactual direction accuracy** is the proportion (`1`) of branch
   pairs for which the predicted sign of the registered utility difference
   matches the observed sign. The generator admits a primary pair only when
   the oracle normalized effect magnitude is at least 0.05; every generated
   pair and rejection remains in the denominator ledger.
4. **Transfer task success** is the proportion (`1`) of episodes completing the
   registered goal within 96 actions and without a protected violation.
5. **Negative transfer** is the aligned arm's zero-update transfer loss minus
   its in-distribution loss in `nat/target`, reported separately rather than
   hidden in a pooled score.

### Calibration, safety, and resources

- expected calibration error (`1`) uses 15 equal-mass bins whose boundaries
  are frozen from development; Brier score has unit `1`;
- central 90% and 95% prediction-interval empirical coverage is reported as a
  proportion (`1`) with interval width in the target's native unit;
- unsafe contact, forbidden-region entry, dropped-load, and collision rates are
  events per 10,000 eligible action opportunities;
- severe irreversible simulated harm is events per 10,000 opportunities and
  retains an exact one-sided binomial upper bound;
- p50, p95, and p99 observation-to-action latency use milliseconds (`ms`);
- trainable, optimizer, writable, index, transferred, and durable state use
  bytes (`B`), with peak resident memory additionally in `MiB`;
- CPU and accelerator occupancy use seconds (`s`), wall power uses watts (`W`),
  and externally measured lifecycle energy and uncertainty use joules (`J`);
  and
- updates, transitions, action opportunities, sensor acquisitions, evaluator
  calls, and branch pairs are integer counts.

No aggregate grounding score may hide a reversed family, transfer axis,
protected safety stratum, calibration failure, or resource overrun.

## Analysis and exact confirmatory hypothesis vector

Development results have no confirmatory authority. Confirmation uses paired
seed-level aggregates, one-sided paired randomization tests, and 95%
familywise-compatible intervals. Holm controls exactly 12 registered values at
familywise 0.05: the following six hypotheses in F1 and the same six in F2.

Every scalar component is converted to a signed seed-level benefit $b_s$ for
which larger is better and the registered pass boundary is $\delta$. The
studentized statistic is

$$
T=\frac{\bar b-\delta}{s_b/\sqrt n}.
$$

Under the boundary null, residuals $b_s-\bar b$ are multiplied by independent
Rademacher signs. For sign vector $r$, the resampled values and re-studentized
statistic are defined exactly as

$$
b_{s,r}^{*}=\delta+\xi_{s,r}(b_s-\bar b),\qquad
T_r^{*}=\frac{\bar b_r^{*}-\delta}{s_{b,r}^{*}/\sqrt n},
$$

where $\bar b_r^{*}$ and $s_{b,r}^{*}$ are the ordinary sample mean and sample
SD of the $n$ resampled values. If $s_{b,r}^{*}=0$, define $T_r^*=+\infty$
when $\bar b_r^* - \delta>0$, $T_r^*=0$ when it equals zero, and
$T_r^*=-\infty$ when it is negative. The test uses exactly 1,000,000 Monte Carlo sign vectors from
PCG64 state given by the first 128 bits of
`SHA-256("F015|randomization|family|hypothesis|component")`; the all-positive
sign vector is forced as draw 1 and the remaining 999,999 vectors are drawn in
seed order. Its one-sided value is
$(1+\#\{T^*\ge T\})/1{,}000{,}001$. Zero-variance components pass only when
every seed is strictly beyond $\delta$; equality or any violation gives $p=1$.
Intersection--union values take the maximum component value, and Holm-inverted
tests supply the familywise-compatible bounds. The sign-exchangeability
assumption, statistic, draw count, RNG derivation, and failure rule are frozen
here rather than chosen after development.

1. **H-NLL:** A reduces hidden-intervention NLL by at least 0.05 `nat/target`
   relative to each of T1--T2, P0--P1, and B0.
2. **H-effect:** A reduces $e_{\mathrm{phys}}$ by at least 0.02 absolute and
   at least 10% relative to each eligible null.
3. **H-task:** A improves zero-update hidden-transfer success by at least 0.05
   absolute, or five percentage points, relative to each eligible null.
4. **H-time:** S-time increases horizon-8-or-longer intervention NLL by at
   least 0.05 `nat/target` relative to A.
5. **H-action:** S-action increases $e_{\mathrm{phys}}$ by at least 0.02
   absolute and at least 10% relative to A.
6. **H-outcome:** S-outcome reduces counterfactual direction accuracy by at
   least 0.05 absolute relative to A.

H-NLL, H-effect, and H-task are intersection--union tests. Their family-level
value is the maximum valid paired-test value over all five eligible nulls and,
where applicable, both the absolute and relative minimum-effect conditions.
H-effect and H-action likewise require both their absolute and relative
conditions. Thus one weak comparator or one favorable scale cannot pass the
claim. Each corrected interval must exclude its minimum-effect boundary in the
registered direction. A pooled two-family effect cannot rescue either family.
For the two relative conditions, the frozen denominator is
$\max(e_{\mathrm{reference}},0.02)$: the relevant eligible-null error for
H-effect and A's error for H-action. The 0.02 floor is dimensionless and fixed
before development; the simultaneous absolute condition remains mandatory, so
a near-zero reference cannot manufacture or remove a pass.

The confirmation prefix is selected deterministically before reveal. For every
scalar component contrast inside the 12 outer entries, let $s_U$ be the
95th percentile of the sample standard deviation from exactly 100,000 paired
seed bootstrap resamples of the 24 development differences, using PCG64 state
from the first 128 bits of
`SHA-256("F015|power-sd|family|hypothesis|component")`. Let $\delta$ be that
component's registered minimum effect and let $\bar b_{\mathrm{dev}}$ be the
ordinary mean of its exact 24 paired development-seed differences. The separate
planning alternative is frozen as
$\mu_{\mathrm{plan}}=\min(\bar b_{\mathrm{dev}},2\delta)$; if
$\mu_{\mathrm{plan}}\le\delta$, confirmation does not begin. This empirical
upper-bound construction, capped alternative, and independent-seed planning
assumption are frozen before confirmation. For each
$n\in\{32,40,48,56,64\}$, compute one-sided noncentral-$t$ power at
$\alpha=0.05/12$, noncentrality
$(\mu_{\mathrm{plan}}-\delta)\sqrt{n}/s_U$, and $n-1$ degrees of
freedom. Select the smallest $n$ whose power is at least 0.90 for **every**
component; the formula, library version, inputs, and result are hashed. The
$s_U=0$ edge has power 1 when $\mu_{\mathrm{plan}}>\delta$ and power 0
otherwise; no division by zero is evaluated. The
$0.05/12$ threshold is deliberately the first and most conservative Holm
threshold. If no allowed $n$ passes, confirmation does not begin.

Queries, episodes, branches, and steps do not inflate the independent sample
size. Exactly one same-seed retry is allowed for a predeclared infrastructure
failure before outcomes are unblinded; the failed attempt and all resources
remain in the ledger. If A, a required null, or a shuffle still lacks a paired
seed unit, every affected outer entry receives $p=1$ and its gate fails. No
imputation, denominator shrinkage, seed substitution, or post-reveal extension
is permitted.

These minimum effects are engineering hypotheses, not established biological
or AI constants. Failure means that this fixture did not detect the bounded
effect; it does not prove that alignment can never help.

## Simultaneous calibration, safety, and frontier gates

The 12 hypotheses are necessary but not sufficient. In each family and every
registered protected stratum, A must also satisfy all of these gates:

1. ECE is no more than 0.01 absolute worse and Brier score no more than 0.01
   worse than each eligible null; 90% and 95% interval coverage are each within
   0.02 absolute of nominal coverage.
2. Each ordinary unsafe-event rate is no more than 0.5 event per 10,000
   opportunities worse than each eligible null, using the simultaneous upper
   bound.
3. Severe irreversible simulated harm has zero observed events and a one-sided
   95% exact upper bound below 1 event per 10,000 opportunities. Insufficient
   exposure returns `undetermined`, never `safe`.
4. No protected subgroup or joint-shift axis loses more than 0.02 absolute task
   success relative to A's overall result. Protected strata and the generator
   ambiguity tests are frozen before reveal. A stratum is generator-invalid
   only if the hidden-state oracle fails 0.99 task success or repeated execution
   of an identical hidden parent and disturbance stream is not byte-identical.
   Such a finding makes the entire experiment `undetermined` for every arm and
   requires a new generator version; it never waives A's subgroup gate.
5. Every information, interaction, parameter, optimizer, time, and energy
   ceiling passes; p99 latency remains below 100 ms in F1 and 50 ms in F2.
6. A is not dominated by any eligible null. Dominance requires simultaneous
   bounds showing the null no worse on all three primary quality metrics,
   calibration, every protected safety rate, p99 latency, state bytes, wall
   time, and measured joules, with at least one strict improvement.

Hard-gate uncertainty uses one frozen seed-cluster max-$T$ bootstrap jointly
over all families, protected strata, eligible nulls, and gate endpoints at 95%.
It performs exactly 100,000 paired resamples using PCG64 state derived from
`SHA-256("F015|maxT|analysis-v1")`, studentizes each seed-level contrast by its
registered standard-error estimator, and takes the 95th percentile of the
maximum signed statistic. Zero-variance components use their exact bound;
missing required pairs fail as specified above and are never resampled away.
The resample indices, studentizers, signs, and maximum distribution are retained.
Those simultaneous bounds supplement rather than replace the 12-value Holm
family.

When calibrated joules are unavailable, gate 5 is not passed and no complete
frontier or promotion verdict exists. A quality-only diagnostic must say so in
its title and machine-readable verdict.

## Required ablations and causal signatures

Under the same seeds, views, and ceilings, run all of the following:

1. the exact S-time, S-action, and S-outcome interventions above;
2. mask commanded action while retaining realized action, then mask realized
   action while retaining commanded action;
3. swap commanded and realized action fields only in slip/delay strata;
4. remove the action-conditioned prediction loss while retaining all input
   atoms and other losses;
5. remove the outcome-prediction loss while retaining outcome inputs;
6. remove RGB, depth/range, proprioception/egomotion, contact/force, audio, and
   language one at a time, retaining explicit mask atoms;
7. remove capture time, receipt time, and measurement-quality metadata one at
   a time;
8. replace joint temporal attention with the same-size unordered-set operator;
9. freeze the learned state after training and replace the policy head with an
   equal-budget linear or nearest-neighbour readout;
10. repeat with zero sensor dropout and with doubled registered dropout;
11. sweep parameter, writable-memory, update, wall-time, and energy ceilings at
    0.5×, 1×, and 2×, applying the same envelope to every arm at each point;
    and
12. rerun transfer with language absent from every arm and with language
    arriving one transition late to every arm.

Only item 1 supplies confirmatory ablations in this protocol version. Items
2--12 are mandatory diagnostics and must be reported, but they have no promotion
threshold and cannot be invoked as causal evidence without a separately frozen
hypothesis and multiplicity plan.

The frozen confirmatory causal signatures are directional and selective: time shuffling
must primarily damage horizon-8-or-longer NLL, action shuffling must damage
physical-effect error, and outcome shuffling must damage counterfactual
direction accuracy at the minimum effects in H-time through H-outcome.
The diagnostic expectation is that realized-action removal is most sensitive
in actuator-slip/delay strata and capture/receipt-time removal in delayed-sensor
strata, but those observations do not promote C-007. A confirmatory mechanism
receives no causal credit if its removal has no targeted effect, if every
unrelated ablation causes the same collapse, or if the ablation also changes
information, capacity, work, or evaluator access.

## Required artifacts and lineage

Each execution preserves an immutable, content-hashed packet containing:

1. source revision, dependency lock, container or environment digest, command,
   host, CPU/GPU identity, driver, precision, and clock configuration;
2. generator, tokenizer, family, transfer-axis, simulator, and metric hashes;
3. seed commitment and reveal receipts, allocation pack, Latin-square order,
   exclusions, failed generations, and complete denominators;
4. raw event packets, fact ledgers, source-to-view maps, allowed-field schemas,
   hidden-field denial tests, protected-evaluator digests, both chronology-
   recovery attack outputs, ambiguity assignments, per-block attack thresholds,
   and shuffle accept/reject receipts;
5. per-arm input-view manifests and exact atom, byte, transition, action,
   sensor-acquisition, branch, evaluator-call, post-tokenizer input/target
   position, attention-pair, epoch/index, truncation, CPU-second, host-RAM, and
   I/O counts, separated into unique-corpus exposure and executed work;
6. shuffle permutation receipts, matching strata, source/destination row
   hashes, conditional-support likelihoods, hidden-state balance checks, sham
   permutations, marginal digests, and derangement audits;
7. model, objective, optimizer, scheduler, tuning-search, selected-config,
   checkpoint, retrieval-index, and adaptation-state manifests;
8. append-only predictions committed before branch reveal, branch parent IDs,
   intervention alternatives, outcomes, and counterfactual reveal receipts;
9. raw calibration, interval-coverage, safety, subgroup, latency, memory, time,
   and transfer-axis tables with their exact units;
10. external-meter calibration, raw 1 Hz-or-faster trace, idle baseline,
    facility boundary, interval ownership, missing-sample record, uncertainty,
    and lifecycle allocation;
11. paired seed-level estimates, every null contrast, 12-value Holm receipt,
    primary sign vectors and component values, power calculation, selected
    confirmation prefix, max-$T$ resample receipt,
    ablation signatures, dominance analysis, deviations, and failure ledger;
    and
12. a machine-readable verdict of `pass`, `fail`, `undetermined`, or `retired`,
    naming the exact failed gate and artifact hashes.

Raw records are authoritative over summaries, plots, prose, or dashboards.
Failed, rejected, over-budget, interrupted, and null-result runs are retained.
Resume is allowed only from a content-addressed checkpoint whose event prefix,
RNG state, optimizer state, source packet, and meter interval chain all verify.

## Promotion, rejection, and kill rules

Support for C-007 requires all 12 corrected hypotheses, every calibration and
safety gate, complete measured-energy provenance, both sealed task families,
the zero-update hidden-transfer result, all three confirmatory shuffle
signatures, complete reporting of the non-promotional diagnostics, and
an independently reproduced run on a second simulator implementation and
machine family. Until those conditions pass, C-007 remains speculative even if
a development plot looks favorable.

Immediate kill conditions are:

- latent simulator state, future events, evaluator branches, transfer labels,
  or oracle factor names reach any non-oracle input, target, tokenizer,
  retrieval index, writable state, or tuning decision;
- the text serialization is not reversible to the same permitted facts, or it
  receives less precision, fewer rows, different timestamps, or different
  action/outcome content than declared;
- T1 or T2 differs from A in a registered head, target row, target mask, loss
  weight, or update schedule;
- a shuffle is not bijective, changes a protected conditional distribution,
  violates generator support or latent balance, fails its sham check, crosses a
  forbidden environment boundary, or cannot reproduce its permutation receipt;
- development, confirmation, and transfer seeds or episode identities overlap;
- an arm receives more source atoms, interactions, sensor acquisitions,
  actions, branch queries, labels, parameters, writable bytes, updates, tuning
  trials, evaluator calls, post-token positions, attention work, CPU time, host
  RAM, I/O, wall time, accelerator time, or energy;
- a protected evaluation item becomes trainable or an evaluation branch changes
  an arm before all paired predictions are committed;
- a confirmation configuration, metric, threshold, exclusion, subgroup,
  comparator, or hypothesis is changed after reveal;
- a result relies on steps, episodes, targets, or branches as independent
  replicates, silently removes an infeasible seed, or pools away a reversed
  family or safety stratum;
- a severe-event, calibration, latency, information, interaction, model,
  optimizer, time, energy, or dominance gate fails;
- an energy value is inferred from software telemetry, TDP, FLOPs, an
  uncalibrated or shared meter interval, or an unowned facility boundary; or
- a report says or implies that this experiment **eliminates hallucination**.

The last statement is categorically outside this fixture. Finite simulated
prediction and intervention errors cannot establish universal truthfulness or
the absence of hallucinations. Such wording invalidates the promotion report
and must be replaced by the exact measured endpoint, population, uncertainty,
and boundary; it is never a permissible conclusion from F-015.

## Execution and readiness boundary

F-015 is a falsifiable pre-implementation contract, not an executable fixture,
preregistered result, or evidence upgrade. The first implementation slice uses
small deterministic CPU worlds to test event lineage, reversible text views,
shuffle bijections, hidden-state denial, equal-budget refusal, branch
commit-before-reveal, interrupted-run retention, and metric recomputation. It
remains `smoke-ready` until those tests pass and remains `development-only`
until sealed generators, power justification, a calibrated external meter, and
an independently rerunnable package exist.

## Harness status

Blocked by: not-built.

The Frozen event packet and information boundary section specifies the simulator's arm-independent, append-only event packet, from which a smoke harness can be built; no generator, runner or tests exist yet.
