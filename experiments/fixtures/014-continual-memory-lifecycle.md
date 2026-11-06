# Fixture F-014 — Continual-memory lifecycle under interference

- **Status:** pre-implementation experiment contract
- **Direct claims:** [C-008](../../research/claims.md#c-008) and
  [C-010](../../research/claims.md#c-010)
- **Evidence boundary:** `mcclelland1995complementary` motivates complementary
  learning rates and `tadros2020sleep` motivates replay as a bounded candidate;
  neither source validates this fixture's architecture or thresholds
- **Authority:** a written protocol is not an execution result

## Question or hypothesis

Does a rapid episodic tier followed by slow, validated integration reduce
destructive interference, and does selective offline replay improve that
lifecycle after retention, privacy, storage, latency, and energy are charged?

The engineering hypothesis has two separable parts:

1. a fast/slow boundary reduces delayed forgetting while keeping immediate
   acquisition noninferior to strong single-store, regularization, adapter, and
   retrieval-memory baselines; and
2. replay during a causally closed offline window improves retention beyond an
   otherwise identical no-replay lifecycle and a work-matched online-replay
   lifecycle, while selective replay earns additional causal credit beyond
   uniform, recency, loss-prioritized, and interference-prioritized replay.

The complete system is rejected if either part is unnecessary, if a mature
ordinary baseline reaches the same quality--risk--resource frontier, or if the
gain depends on replaying private, duplicated, stale, or evaluator-visible
items.

## System, streams, and scenario families

The independent unit is a frozen `seed × stream-world`. Each base seed
instantiates both of the following CPU-reproducible families; the two family
results remain separate and are paired by base seed only for joint resource and
multiplicity accounting.

1. **F1 — recurring latent-context classification.** There are 12 classes,
   32 continuous features, eight categorical features with cardinality eight,
   and four latent contexts. Class prototypes are 32-vectors drawn once from
   $N(0,4I)$ by Box--Muller normal generation. Context transforms are signed
   feature permutations plus an additive 32-vector drawn from $N(0,I)$; no
   platform-dependent matrix factorization is permitted. At event $i$,
   $x_i=P_{c_i}\mu_{y_i}+b_{c_i}+\epsilon_i$ with
   $\epsilon_i\sim N(0,0.5^2I)$. The context schedule is
   `[0,1,2,0,3,1]`; valid labels use
   $v_{c}(y)=(y+3c)\bmod 12$. Classes 0--9 contribute exactly 760 rows each and
   classes 10--11 exactly 200 rows each per phase. Categorical feature $j$ is
   $(y+c+j+U_{ij})\bmod8$, where $U_{ij}$ is a generated Bernoulli(0.25)
   integer. Classes 10 and 11 jointly occupy exactly 5% of each phase and are
   the safety-critical stratum. Exactly 5% of events are
   corrupted duplicates, 8% carry a private flag, and 10% have one categorical
   value missing. Allocation is stratified without replacement from generated
   index lists, so those rates are exact rather than expected. The evaluator
   retains latent class/context identity, duplicate root, corruption, privacy,
   recurrence, and label-version state.
2. **F2 — versioned associative-rule execution.** The universe contains 4,096
   keys formed from 16 verbs, 16 entities, eight attributes, and two scopes;
   values are 16-bit unsigned integers. Each phase contains 6,400 direct
   queries, 800 two-rule compositions, 400 exceptions, 240 contradictions, and
   160 rare high-cost rules. At the starts of phases 3 and 5, exactly 10% of
   currently live direct rules are superseded by a new value; phase 6 revisits
   half of each earlier superseded set. Exactly 8% of source records are marked
   private and never become protected task-evaluation or replay content; the
   sealed privacy evaluator may use committed audit metadata after state seal.
   Transfer queries are
   deterministic unseen compositions of rules that were individually available
   in earlier phases. Key and row sets are sampled without replacement in
   ascending generated-priority order; values equal
   `uint16le(SHA-256(frame("F014-F2-value-v2", key_bytes,
   uint16le(version)))[0:2])`: the first two digest bytes interpreted as an
   unsigned little-endian integer. The evaluator retains rule version, dependency path,
   exception precedence, contradiction status, current/superseded state,
   private status, and required answer.

### Deterministic generator and event schema

Generation uses PCG64-DXSM with unsigned 128-bit state, unsigned 128-bit stream,
and little-endian integer serialization. Uniform integers use rejection
sampling; normal values use Box--Muller with the first variate consumed before
the second. Floating-point generation and stored features use IEEE-754 binary64
with round-to-nearest, ties-to-even. Sorting uses `(phase, ordinal, stable_id)`;
ties are never implementation ordered.

Binary hash framing is

$$
\operatorname{frame}(t,f_1,\ldots,f_k)=
\operatorname{utf8}(t)\,\|\,
\mathop{\|}_{i=1}^{k}\left(\operatorname{uint32le}(|f_i|)\,\|\,f_i\right).
$$

Every integer field has the exact width named in its schema before framing.
Family bytes are ASCII `F1` or `F2`. The stable identifier is the event
identifier,

$$
\operatorname{event\_id}=\operatorname{hex}\left(
\operatorname{SHA256}(\operatorname{frame}(
\texttt{"F014-event-v2"},\operatorname{uint64le}(s),
\operatorname{family},\operatorname{uint8}(p),
\operatorname{uint32le}(o)))[0{:}16]\right),
$$

where `[0:16]` selects the first 16 digest bytes before lower-case hexadecimal
encoding. Thus `(phase, ordinal, stable_id)` means
`(phase, ordinal, event_id)` exactly.

The evaluator-owned source row is canonical UTF-8 JSON with sorted keys and
this schema:

`seed:uint64`, `family:{F1,F2}`, `phase:uint8`, `ordinal:uint32`,
`event_id:hex128`, `capture_s:float64`, `label_available_s:float64|null`,
`available_label_version:uint16`, `input:float64[]|uint16[]`,
`target:uint16`, `label_salt:hex128`, `context_visible:bool`,
`rare_or_high_cost:bool`, `private:bool`, `duplicate_root:hex128|null`,
`corrupted:bool`, `role:{train,validation,protected}`, and
`provenance:hex256`. Array lengths and quantity kinds are fixed by family.
`provenance` is
`SHA-256(frame("F014-source-row-v2", canonical_json_without_provenance))`.
Canonicalization rejects NaN, infinity, duplicate keys, an incorrect field
width, or a provenance mismatch.

An arm never receives a source row. Its observation is a separately serialized,
separately hashed projection with the **complete** allow-list
`schema_version:{F014-observation-v2}`, `event_id:hex128`, `family:{F1,F2}`,
`capture_s:float64`, `input:float64[]|uint16[]`,
`available_label_version:uint16`, `private:bool`,
`boundary_token:uint16|null`, `target_commitment:hex256`, and
`projection_provenance:hex256`. `boundary_token` is null in the confirmatory
hidden-boundary condition and carries the current generated context/task code
only in the labelled diagnostic. Source `phase`, `ordinal`, target, salt,
evaluator role, rare/corruption/duplicate annotations, label-availability time,
and source provenance are not projection fields. Projection provenance hashes
the canonical projection without its provenance field.

The target commitment is

$$
\operatorname{target\_commitment}=\operatorname{SHA256}(
\operatorname{frame}(\texttt{"F014-label-v2"},
\operatorname{event\_id},\operatorname{uint16le}(target),label\_salt)).
$$

At `label_available_s`, a distinct `label_release` event exposes only
`schema_version:{F014-label-release-v2}`, `event_id`, `target`,
`available_label_version`, `label_salt`, `label_available_s`,
`role:{train,validation}`, and `release_provenance`. The runner verifies the
commitment and release provenance before making the label causally available.
No mutable `target_available` field exists. A byte-denial guard parses every
arm input against exactly one of the observation or release allow-lists,
rejects unknown keys and source-row serialization, and rejects the evaluator's
per-row target/salt sentinel outside a commitment-valid release. The evaluator
preserves source, projection, release, allow-list, sentinel, and denial receipts
separately; byte equality caused independently by numeric input is recorded but
is not confused with evaluator-tainted source bytes.

For source event $e$, the exact 32-byte sentinel is
`SHA-256(frame("F014-denial-sentinel-v2", event_id_bytes, uint16le(target),
label_salt_bytes))`. The evaluator allocation holding target/salt is tagged with
that sentinel and allocation provenance. The guard rejects any outgoing byte
range derived from that allocation, and any tagged occurrence of the sentinel,
unless it is the newly serialized release produced after commitment
verification; the release serialization itself omits the sentinel. An equal
byte sequence independently produced inside an untainted numeric input is not
relabelled as evaluator provenance. Allocation ancestry, scan result, schema
result, and release exception are all chained denial-receipt fields.

Random draws have one frozen order. F1 consumes prototype normals in
`class × continuous-feature` order, then for each context performs descending
Fisher--Yates permutation draws, 32 sign-bit draws, and 32 offset-normal draws.
It then consumes row noise and categorical Bernoulli draws in
`phase × target × row-within-target × feature` order. F2 enumerates keys
lexicographically and assigns row priorities in
`phase × query-kind × key × version` order. The `role-split`, `corruption`,
`privacy`, `missingness`, `label-delay`, and `canary` namespaces each emit one
unsigned 64-bit priority per event in ascending `event_id` order; the required
exact count in each declared stratum is the lowest priorities with `event_id`
as tie-break. `label-salt` emits two consecutive unsigned 64-bit words per
event in ascending `event_id` order and concatenates them little-endian. No
namespace shares or conditionally skips a draw.

Within a phase, ordinals are exactly `0`--`9,999` and
`capture_s = 10,000 × (phase-1) + ordinal`. Family generation first assigns the
8,000 non-protected rows ordinals `0`--`7,999` in its declared generation order;
within every named target/query-kind stratum, the lowest one-eighth of frozen
`role-split` priorities are validation and the remainder are train, giving
exactly 1,000 and 7,000 rows. The separately generated protected strata occupy
ordinals `8,000`--`9,999` in their declared stratum order. For non-protected
rows, label availability is `capture_s + 1 s` ordinarily and
`capture_s + 17 s` for the frozen delayed-label 10% selected without
replacement in every target stratum. Protected source rows carry
`label_available_s:null` and generate no arm-visible release; their evaluator
reveal event is created only after the complete paired block is sealed.

`capture_s` is a logical event clock; wall time spent computing never advances
it, and delivery pauses during an offline window. At every logical timestamp,
the runner applies this total order:

1. deliver scheduled non-protected `label_release` events in ascending
   `event_id` order;
2. immediately after each release, verify the commitment, update its frozen
   train/validation ledger, execute any fast job closed by that training label,
   and then execute any validation-gated promotion/rollback decision;
3. deliver the observation at that timestamp and commit its task-head
   prediction (a protected call remains read-only and one-way); and
4. after a non-protected observation in phase 2--6, execute the first registered
   online replay example and then, for an even ordinal, the second.

Resource/journal writes occur immediately after their owning operation and do
not create another semantic event. This order also applies when a delayed and
ordinary release collide with each other or with a protected call. No optimizer
or replay operation may move across these precedence points.

Every world supplies the same ordered observations, causally available labels,
task-boundary visibility condition, arm-visible validation opportunities, and
privacy flags to every eligible arm. Of each phase's 8,000 non-protected rows,
exactly the 7,000/1,000 rows assigned by the frozen stratum-wise `role-split`
priority rule above have roles `train`/`validation`; position in the stream does
not override that assignment. Validation predictions are committed before
their labels become arm-visible. Only this validation stream may drive
stopping, promotion, rollback, calibration, or replay scheduling.

The additional 2,000 rows per phase with role `protected` are evaluator-only.
The evaluator streams only the target-free observation projection through a
read-only inference call; the arm submits predictions to a one-way sink and
receives no protected label, label release, salt, score, loss, gradient, rank,
aggregate, stopping signal, or failure bit until all arms, ablations, states,
and resource ledgers for that seed are sealed. Protected observations, rows,
and derived values are never trainable, replayable, writable, or causally
retained. The runner compares model, optimizer, cache, retrieval, RNG, and file
state hashes before and after every protected call. Any target byte in the arm
projection, state mutation, or evaluator-to-arm return channel is a kill
condition.

The hidden-task-boundary condition is the sole confirmatory analysis; visible
boundaries are a labelled diagnostic sensitivity and cannot promote a claim.

An **offline replay window** starts only after the current phase's final input,
label release, update, and protected prediction submission have completed and
ends before any next-phase input or label is available. The protected evaluator
has not returned a result. During the window an arm may read only causally
retained state and stored non-protected training records; it cannot query the
evaluator, future stream, environment, or new labels.

The confirmatory replay-timing intervention is one longitudinal total-policy
assignment. Arms 10 and 12 clone one common signed model, optimizer, RNG, and
state checkpoint before phase 1, then run continuously for all six phases.
Their later phase-entry states are expected to differ as consequences of the
assigned timing and are never described as matched.

For each family, the confirmatory timing estimand is the paired longitudinal
total-policy contrast

$$
\Delta_{\mathrm{timing}}
=E_s\!\left[F^{1{:}6}_{12,s}-F^{1{:}6}_{10,s}\right],
$$

where $F^{1{:}6}_{a,s}$ is arm $a$'s registered average-forgetting aggregate
over the complete six-phase trajectory for base seed $s$. The timing component
passes only at $\Delta_{\mathrm{timing}}\le-0.01$; no phase-conditional,
post-treatment state-matched effect is substituted.

For each phase $p\ge2$, an arm-independent timing-manifest builder considers
only non-private training records whose labels were released by the end of
phase $p-1$. It orders eligible records by
`SHA-256(frame("F014-timing-rank-v2", uint64le(seed), family,
uint8(p), event_id))`, then cycles through that order as often as needed to
freeze exactly 12,000 replay example-equivalents. It does not read a model,
optimizer, loss, gradient, representation, arm state, validation result, or
protected datum. Phase 1 has an empty manifest. Each manifest fixes record and
label-version hashes, order, optimizer update boundaries, and a dedicated
replay-RNG draw for every example; stream and replay RNG namespaces are
separate.

For every phase $p\ge2$, arm 10 executes manifest positions 1--12,000 in order
during acquisition:
after each of the 8,000 non-protected observation ordinals it executes one
replay example, and after every even ordinal it immediately executes one
additional replay example. Arm 12 executes the byte-identical manifest and
update boundaries in the same order only in the offline window. No other work
may occur between the paired replay examples inside an update. Thus record set,
order, labels, replay RNG, optimizer algorithm/hyperparameters, update count,
and example-equivalent work match; only placement relative to acquisition
differs. The two arms' complete phase-entry and phase-exit state hashes are
recorded, not forced equal.

A separate full-prefix diagnostic may let offline and online policies select
from their naturally different causal prefixes, but it estimates the compound
`timing + eligible-information-set + selected-records` intervention and cannot
support the confirmatory timing claim. Replay presence, replay timing, and
replay selection therefore have non-overlapping estimands.

Per seed and family, the default development world contains 6 phases × 8,000
training events, 2,000 protected evaluation events per phase, recurrence
horizons of 1, 3, and 6 phases, and at least 400 rare or safety-critical events.
Protected F1 phases contain 190 rows for each class 0--9 and 50 for each class
10--11. Protected F2 phases contain 1,600 direct, 200 compositional, 100
exception, 60 contradiction, and 40 rare high-cost queries. These counts and
every generator constant above are frozen design parameters, not evidence that
the sample is powered.

### Frozen seed packs, power rule, and reveal

The three base-seed packs are disjoint decimal ranges:

- development: `14001`–`14024` (24 visible seeds);
- confirmation reserve: `14101`–`14228` (128 sealed seeds); and
- held-out replication reserve: `14301`–`14428` (128 separately sealed seeds).

For base seed $s$, let digest $d$ be
`SHA-512("F014/v2" || 0x00 || uint64le(s) || 0x00 || purpose)`. The initial
state is bytes 0--15 interpreted as unsigned little-endian; the PCG increment
is `(2 × uint128le(d[16:32]) + 1) mod 2^128`. Bytes 32--63 are retained in the
derivation receipt. `purpose` is exactly one of the frozen ASCII strings
`F1-generator`, `F2-generator`, `role-split`, `corruption`, `privacy`,
`missingness`, `label-delay`, `label-salt`, `canary`, `arm-order`, `replay`,
`attack`, or `analysis`. Reveal validation rejects a repeated state/increment
pair.

Cross-seed resampling reserves base seed `0` with purpose `analysis`; no world
generator may use that seed. Let `d_analysis` be the exact 64-byte digest from
the derivation above for that seed/purpose. Independent analysis substreams are
derived by applying SHA-512 to `frame("F014-analysis-substream-v2",
d_analysis, label_bytes)` and mapping digest bytes to state and increment
exactly as above. Labels are exactly `power`,
`confirmation-bootstrap`, `confirmation-sign`, `confirmation-pareto`,
`heldout-bootstrap`, `heldout-sign`, and `heldout-pareto`. Power draws are in
`candidate n ascending × simulation 0..99,999 × seed slot ascending` order,
followed for each candidate by one `Rademacher row 0..999,999 × seed slot`
matrix reused across that candidate's simulated datasets. Reveal bootstrap,
sign, and Pareto arrays draw in `resample/sign row × seed slot` order. Uniform
row indices use rejection sampling; Rademacher signs use the low bit of one
fresh unsigned 64-bit word. A substream never conditionally skips a draw.

Confirmation size is fixed once, before any confirmation bundle is opened, by
a joint residual-bootstrap calculation over the **complete component registry**
of the 18 outer hypotheses. Each registry row freezes family, outer entry,
component, comparator, protected stratum where applicable, unit, orientation,
null boundary, and whether it is paired, one-sample, or an exact hard gate.
For every stochastic component $c$, the development matrix contains one value
per complete base seed; rows, rather than components, are resampled so all
within-seed dependence is preserved. A missing/non-finite development value or
a zero-denominator relative component makes planning infeasible rather than
shrinking the registry.

All component values are oriented so smaller is favorable and the null is
$\theta_c\ge b_c$. The frozen planning alternative is $0$ for a
non-inferiority contrast with positive boundary $b_c$; for a superiority
contrast whose boundary is $-\delta_c$, it is $-1.25\delta_c$ in that
component's declared unit. The one-sample complete-arm membership alternative
is AUC `0.50`; the one-sample canary alternative is `1 exposure per 1,000
groups`. Exact-zero requirements, including zero protected replay, are hard
gates and receive no simulated power credit. No observed development mean is
substituted for these planning alternatives.

For each candidate $n\in\{64,72,80,88,96,104,112,120,128\}$, the analysis RNG
creates 100,000 joint simulations. Simulation $j$ draws $n$ complete residual
rows with replacement, adds the frozen planning vector, then runs the exact
registered paired and one-sample component tests, outer max-$p$ construction,
and Holm procedure over all 18 entries. $n$ is acceptable only when **all 18**
entries pass in at least 90,000 of the 100,000 simulations and every outer
entry passes in at least 95,000 simulations.
The smallest acceptable candidate is $N$. The development component matrix,
column means, centered residual matrix, planning vector, candidate order,
100,000 row-index arrays per candidate, component decisions, and joint/marginal
pass counts are signed artifacts.

If no candidate through 128 is acceptable, the experiment is `infeasible` and
no confirmation seed is opened; margins, generators, hypotheses, and rates are
not relaxed. Otherwise confirmation uses the first $N$ reserve seeds and
held-out replication uses the first $N$ held-out seeds. Events, queries, and
privacy probes do not enlarge $N$. Unused reserve seeds remain unopened and can
never extend a revealed run.

Before development analysis, an offline custodian publishes salted SHA-256
commitments to the canonical confirmation and held-out bundles. The salts,
rows, protected targets, attack assignments, and arm orders remain inaccessible
until generator, arm, metric, analysis, resource, and development-report hashes
are frozen. Confirmation is revealed once. Held-out replication is revealed
only after the signed confirmation verdict. It repeats the same $N$, component
registry, paired/one-sample tests, exact-zero gates, 18-entry Holm procedure,
Pareto construction, and resource gates without refitting, reselection, or a
changed threshold; both reveals must pass independently.

## Arms, baselines, and strongest nulls

All trainable arms use the same encoder/head class and optimizer search budget.
The selected development configuration freezes an exact byte manifest for the
base encoder/head, fast adapter/store, slow adapter/store, optimizer, index,
checkpoint, and journal. The registered fast rate is one causally available
update after every 64 newly released training labels in causal order, carrying
an incomplete block across phase boundaries, with an episodic write visible no
later than the next event. The slow rate executes the phase-start replay
manifest only in the offline window after each phase. Phase 1 has no replay;
phases 2--6 each use exactly 12,000 example-equivalents retained through the
prior phase.
Promotion requires development-frozen validation NLL improvement of at least
0.005 `nat/example`, no rare-stratum degradation beyond 2 per 10,000, a current
label/fact version, and privacy eligibility. Arms 5--15 share one signed
structural/capacity manifest; the base arms retain their separately frozen
development hyperparameters. Arm 12 inherits arm 10's exact configuration and
common initial checkpoint, while arms 13--15 inherit arm 11's. Arms 13--15
change only the two registered rates and corresponding promotion delay; they
cannot resize or repurpose a partition after outcomes.

Before phase $p$, each replay scheduler freezes its own manifest from the same
prior-phase eligibility set. Arms 5--8 change only the named ranking policy;
arm 11 uses its selective policy. The manifest fixes source examples,
label versions, optimizer microbatch boundaries, RNG draws, and work. Arms
13--15 clone arm 11's manifest rather than reranking it.

For every seed and family, `timescale-manifest.jsonl` enumerates two job types.
A fast job `F` contains the exact 64 new training rows that closed one causal
label block, its fast-partition optimizer algorithm/configuration ID, and the stream ordinal after
which it runs. A slow job `S` contains one frozen optimizer microbatch from the
12,000-example arm-11 replay manifest, its slow-partition optimizer
algorithm/configuration ID, and
its position in the offline window. The final incomplete fast block remains
queued and causes no partial update. Arms 11 and 13--15 clone one common signed
pre-phase-1 checkpoint and run longitudinally. They execute identical `F` and
`S` jobs, payloads, partitions, optimizer algorithms, microbatch boundaries,
RNG draws, and total work as follows:

- arm 11 runs `F` at its stream slot and `S` offline;
- arm 13 keeps every `F` writing the fast partition but queues it, in original
  order, immediately before `S` in that phase's offline window;
- arm 14 keeps every `S` writing the slow partition but places its examples at
  the exact one-plus-even online cadence defined for arm 10; and
- arm 15 applies both schedule mappings, exchanging fast and slow timing while
  preserving store identity and payload.

Promotion visibility moves with the assigned job schedule and is recorded per
job. Each arm's causal pre-job state digest is recorded separately and is
expected to diverge; it is not an identity field in the shared manifest. Later
phase-entry states are consequences of the longitudinal intervention and need
not match. The manifest rejects any payload, partition, optimizer
algorithm/configuration, job-count, update-boundary, RNG, or work difference
outside the named schedule mapping.

The preregistered comparator stack is:

1. **Single plastic store:** ordinary sequential training with no retained
   examples and no task-boundary oracle.
2. **Importance regularization:** an Elastic-Weight-Consolidation-style penalty
   with importance and coefficient tuned only on development data; this is a
   mature null for [C-008](../../research/claims.md#c-008), not evidence for the
   proposed lifecycle.
3. **Parameter-isolated adapters:** equal total parameter bytes partitioned by
   a learned context router; task labels are not supplied unless every arm
   receives them.
4. **Retrieval-only memory:** a frozen base learner plus bounded external
   episodic retrieval and a learned read policy; index construction and query
   work are charged.
5. **Isomorphic uniform replay:** the complete offline lifecycle with the
   selective scheduler replaced only by bounded reservoir-uniform selection.
6. **Isomorphic recency replay:** the same complete lifecycle, store, filters,
   and cap, with priority based only on causally known age.
7. **Isomorphic loss-prioritized replay:** the same complete lifecycle with
   priority based only on frozen pre-update loss and no evaluator information.
8. **Isomorphic interference-prioritized replay:** the same complete lifecycle
   with priority based only on causally available gradient-conflict or
   representation-drift estimates. Arms 5--8 are policy-only mature nulls; all
   non-scheduler bytes and code paths must be identical to arm 11.
9. **Complete lifecycle minus replay:** byte-identical fast/slow stores,
   validation, stale/version and privacy filters, promotion gate, rollback,
   deletion propagation, and offline-window orchestration, but zero replay
   reads or replay updates.
10. **Same-record online replay:** the complete implementation executes the
    phase-start manifest defined above, in its frozen order, interleaved during
    acquisition. It receives no record unavailable when the manifest was
    sealed.
11. **Complete offline lifecycle:** the same implementation plus the proposed
    selective scheduler operating only in the offline window over its frozen
    prior-prefix manifest. Its timing claim still comes only from arm 12.
12. **Same-record offline replay:** an isomorphic causal lane that executes the
    exact arm-10 manifest only in the offline window. Arms 10 and 12 share only
    the signed pre-phase-1 checkpoint; manifest bytes/order, replay labels,
    replay updates, RNG substream, and example-equivalent work remain paired
    while later states may diverge causally.
13. **No-fast-timescale isomorph:** the two stores, total bytes, state fields,
    read/write opportunities, router, validation, and update count are retained,
    but fast-partition jobs are delayed to the offline schedule without changing
    their payload, partition, or order.
14. **No-slow-timescale isomorph:** the same total state and update count are
    retained, but slow-partition jobs execute at the registered online cadence
    without changing payload, partition, or order.
15. **Rate-swapped isomorph:** store identity, capacity, routing, validation,
    reads, writes, and total work remain fixed while the two registered update
    rates and promotion delays are exchanged. This is a directional
    identifiability control.
16. **Oracle scheduler:** an excluded ceiling that sees future recurrence and
    latent interference. It diagnoses headroom but cannot support promotion.

The eligible frontier-comparator set is exactly arms 1--10. Complete arm 11,
causal arms 12--15, and oracle arm 16 are excluded. A comparator is selected
separately for each scenario family before confirmation. For every arm 1--10
after the mandatory feasibility preflight, the exact minimax vector is

`[forgetting/0.02, acquisition_deficit/0.01,
rare_misses_per_10000/2, superseded_errors_per_10000/2,
max(0,AUC-0.50)/0.02, canary_per_1000/2]`.

The arm with the smallest maximum component is selected. Exact ties are broken
by lower measured joules, then CPU seconds, then total state bytes, then fixed
arm number. The selector, constants, and complete arm table are hashed before
confirmation; no comparator may be removed because it performs well. The same
rule selects the strongest replay-policy null from the exact isomorphic subset
5--8.

Before registration, every arm 1--10 must complete development seeds
`14001`–`14012` within the common ceilings. If any mature null cannot fit, the common generator/profile
is reduced and all arms are rerun before commitments; this preflight is not a
scientific failure. After freeze, an infeasible mature null is retained as a
failed required comparator and blocks promotion rather than disappearing from
the selector.

Development tuning gives exactly 48 trials to base arms 1--11. Arms 12--15 are
never retuned: arm 12 inherits arm 10's selected hyperparameters, byte manifest,
and tuning-energy allocation; arms 13--15 inherit arm 11's. Oracle arm 16 has no
tuning budget. Any causal arm-specific search or checkpoint selection is a kill
condition.

## Equal budget and cost boundary

Eligible arms receive identical stream bytes, label timing, validation calls,
one-way protected-prediction submissions, parameter and state ceilings, tuning
trials, and maximum forward/backward work. Replay and causal arms receive the
same maximum replay events and example-equivalent bytes. A component removed by
an ablation leaves its resource unused unless the isomorphic intervention above
explicitly redirects the same update to the compared state. Unused budget is
reported and cannot be donated to another component.

Per `seed × family × arm` confirmation world, the hard ceilings are:

- 67,108,864 B (`64 MiB`) of trainable parameters, including adapters and
  routers;
- 268,435,456 B (`256 MiB`) of writable episodic, replay, optimizer,
  checkpoint, and index state combined;
- 12,000 replay example-equivalents in each of phases 2--6 and 60,000 per
  world; phase 1 is exactly zero;
- 3,144,000 forward and 3,144,000 backward example-equivalents, including
  stream, validation, replay, and privacy-audit work;
- 4 pinned CPU threads, 28,800 aggregate CPU-s, and 7,200 s wall time;
- 4,294,967,296 B (`4 GiB`) peak resident memory, 2,147,483,648 B (`2 GiB`)
  persisted output, and 17,179,869,184 B (`16 GiB`) total read-plus-write I/O;
- p99 acquisition latency no greater than 100 ms and p99 query latency no
  greater than 50 ms, using the registered monotonic clock;
- identical 12,000 protected prediction submissions, stopping opportunities,
  10,000 membership probes and 1,000,000 numeric canary-candidate queries
  arranged as 1,000 fixed groups of 1,000; and
- 3,600,000 J of net wall energy, including the allocated development-tuning
  share.

Development tuning receives exactly 48 trials per base arm 1--11 across the 24
development seeds, at most 345,600 aggregate CPU-s, 86,400 wall-s, and
43,200,000 measured J per base arm. Trial schedules, early-stopping
opportunities, and validation calls are identical. Arms 12--15 receive no
trials; arm 12 inherits arm 10's selected configuration/tuning charge and arms
13--15 inherit arm 11's. After
$N$ is frozen by the power rule, each of the $2N$
confirmation `seed × family` worlds is charged exactly
$E_{\mathrm{tune}}/(2N)$ joules; transfer and second-machine replication never
dilute that denominator. Both the unamortized tuning total and allocated value
are reported.

The workstation, CPU and microcode, RAM, firmware, OS/kernel, runtime and
dependency locks, power mode, thread affinity, filesystem, monotonic clock,
thermal acceptance range, and arm-order counterbalancing are frozen. An arm
exceeding any ceiling is infeasible for its paired world and remains in the
fixed analysis denominator.

Net energy for every exclusive block is

$$
E_{\mathrm{net}}=E_{\mathrm{wall}}-P_{\mathrm{idle}}t,
$$

where $E_{\mathrm{wall}}$ is external-meter energy in joules,
$P_{\mathrm{idle}}$ is the registered idle power in watts, and $t$ is elapsed
seconds. The meter encloses the declared workstation, samples cumulative energy
at least once per second, has a current calibration and expanded relative
uncertainty no greater than 2%, and records exclusive interval ownership,
clock alignment, missing samples, and idle/facility exclusions. The upper
uncertainty bound must remain inside the energy ceiling. Modeled energy,
software telemetry, TDP, or FLOP estimates are diagnostics only.

If calibrated external energy is absent, the run is `development-only`: no
complete F-014 verdict and no promotion of C-008 or C-010 is permitted. A
quality-only smoke report must state that boundary in its title and
machine-readable verdict.

## Measurements, outcomes, and units

Measurements are retained per seed, family, phase, subgroup, recurrence
horizon, and arm:

- immediate post-phase accuracy and macro-F1 (`1`);
- delayed retention accuracy at 1-, 3-, and 6-phase horizons (`1`);
- average forgetting, defined as the maximum prior accuracy minus current
  accuracy for each learned component and then macro-averaged (`1`);
- backward and forward transfer relative to the frozen single-store reference
  (`1`);
- rare/safety-critical false negatives per 10,000 eligible opportunities;
- current-versus-superseded label-version (F1) or fact-version (F2) error per
  10,000 queries;
- expected calibration error with frozen bins (`1`) and negative log loss
  (`nat/example`);
- promotion precision/recall and rollback recovery (`1` and events);
- duplicated, stale, corrupted, private, and evaluator-slice replay rates (`1`);
- membership-inference ROC AUC (`1`) and numeric canary loss-ranking exposure
  success per 1,000 groups;
- p50/p95/p99 acquisition and query latency (`ms`);
- trainable, episodic, index, checkpoint, and durable state (`B`);
- CPU time (`s`), measured energy (`J`), and meter uncertainty (`J`, 95%);
- replay events and total processed example-equivalents (count).

Promotion precision/recall uses the generator's valid-version promotion events
as the fixed denominator. Rollback recovery is the count of subsequent
non-protected stream events from the first causally visible validation breach
until rolling 1,000-validation-event accuracy returns within 0.01 of the signed
pre-promotion checkpoint and version error returns within 2 per 10,000. Failure
to recover by the phase end is right-censored at the remaining event count and
also recorded as a binary failure; neither representation is unit `1` by
accident (`event` and `1`, respectively).

For learned component $k$ first available after phase $p_k$, forgetting at
horizon $h$ is

$$
F_{kh}=\max_{p_k\le j<p_k+h}A_{kj}-A_{k,p_k+h},
$$

where every $A$ is protected accuracy with unit `1`. Average forgetting is the
macro-mean over the frozen eligible components; a missing evaluation is a loss
of one, not a removed component. Relative improvement against comparator $B$
is $(F_B-F_A)/F_B$. If $F_B=0$, relative superiority has no headroom and fails;
no epsilon is inserted. The same zero-denominator rule governs relative
rare-miss and superseded-fact improvements.

The protected strata are fixed as follows: F1 reports classes 10/11 jointly,
each latent context, recurrent versus first-seen context, corrupted versus
uncorrupted, and missing versus complete categorical input; F2 reports rare
high-cost versus ordinary rules, current versus superseded facts, exception,
contradiction, direct versus compositional query, and each recurrence horizon.
Private rows are never protected queries. For every stratum with at least one
eligible opportunity, the upper simultaneous bound for complete-minus-
comparator harm must be no greater than 2 false negatives or errors per 10,000
opportunities. A zero-opportunity stratum is `undetermined` and cannot be pooled
away or declared safe.

### Frozen privacy-attack manifest

Privacy attacks are evaluator-only and receive no protected label before model
and state sealing. The 10,000 membership probes contain exactly 5,000 members
sampled uniformly without replacement from non-private training rows and 5,000
non-members generated from the same phase, class/rule, context, corruption, and
missingness strata but never exposed to any arm. Within each class, 40% of
probes fit the attack, 10% select/calibrate it, and 50% estimate the reported
ROC AUC; base-seed-derived partitions are fixed before training.

The attack family is exactly: threshold on negative log loss, threshold on
maximum confidence, L2-logistic regression on loss/confidence/entropy/margin,
and a two-layer MLP with widths 16 and 8 and ReLU activations. Each receives 32
development-only configurations, 200 optimizer steps, and the same four model
outputs. Development selection-set maximum AUC chooses exactly one frozen
attack and configuration separately for F1 and F2 before confirmation. The
confirmation 10% partition calibrates only that frozen attack; it cannot select
an architecture or hyperparameter. Query count, model outputs, CPU work, and
attack bytes are equal across arms and included in the common privacy envelope.

The architecture-compatible canary attack contains 1,000 groups per seed and
family. Each group contains one numeric private training row inserted exactly
once and 999 never-exposed numeric decoy rows matched on phase, target,
class/rule kind, context, corruption, missingness, and available label version.
All rows use the existing family input array and existing task target; no text,
prefix, decoder, auxiliary head, or adaptive query is introduced. A unique
128-bit group identifier exists only in evaluator metadata and is never an arm
input or replay priority.

The member pool is the private `train` source rows; fewer than 1,000 invalidates
the generated world before any arm runs. The 1,000 lowest `canary` priorities
are selected without replacement and sorted by
`(priority,event_id)` to define group indices $g=0,\ldots,999$. For member event
$e_g$,
`group_id = hex(SHA-256(frame("F014-canary-group-v2", uint64le(seed), family,
event_id_bytes))[0:16])`. The member slot is generated without modulo bias: for
counter $c=0,1,\ldots$, interpret the first four bytes of
`SHA-256(frame("F014-canary-slot-v2", group_id_bytes, uint32le(c)))` as unsigned
little-endian $u_c$ and accept the first
$u_c<\lfloor2^{32}/1000\rfloor\,1000$; its slot is $u_c\bmod1000$.

For each other slot $j$ in ascending order, SHA-512 of
`frame("F014-canary-decoy-v2", group_id_bytes, uint16le(j),
uint32le(attempt))` supplies an isolated PCG state/increment by the registered
digest mapping. The existing family generator is invoked conditional on the
member's frozen phase, target, class/rule kind, context, corruption,
missingness, and available label version. `attempt` starts at zero and
increments until the numeric input differs byte-for-byte from every arm-exposed
row and every earlier candidate in the group. Floating arrays serialize as
little-endian binary64 and integer arrays as little-endian uint16. For every
slot, member included,
`candidate_id = hex(SHA-256(frame("F014-canary-candidate-v2", group_id_bytes,
uint16le(j), canonical_input_bytes))[0:16])`. Any group/candidate identifier
collision is a kill condition. All rejected attempts, generator receipts,
member slot, and identifiers are committed; isolated substreams prevent a
rejection in one slot from shifting another slot's draws.

After complete state sealing, the evaluator submits all 1,000 candidates in
each group through the same read-only task head and records negative log
likelihood of the fixed true target in `nat/example`. Candidates rank by lower
NLL with `SHA-256(frame("F014-canary-tie-v2", group_id_bytes,
candidate_id_bytes))` as the
membership-independent tie-break. A canary exposure succeeds only when the
inserted row ranks first among its 1,000 candidates. The 1,000,000 candidate
queries, target labels, ranks, ties, and state-before/state-after hashes are
fixed-denominator artifacts and are charged to every arm. Groups, member
assignments, and decoys are committed before development and never become
training controls, replay priorities, or stopping signals.

Membership passes only when the simultaneous upper bound for the complete arm
is at most 0.55 AUC **and** complete-minus-comparator AUC is at most +0.02 for
every eligible comparator. Canary loss-ranking exposure passes only when its
upper bound is at most 5 per 1,000 groups and complete-minus-comparator is at
most +2 per 1,000. These absolute and non-inferiority conjuncts belong to the two
existing privacy entries in the 18-test family; they do not add outer tests.

No scalar “memory score” can hide a safety-critical miss, privacy violation,
stale-fact response, or resource overrun. Results therefore remain a vector
plus an explicit Pareto-dominance record.

## Required ablations and interventions

The complete lifecycle is rerun under the same seeds and budgets with:

1. arm 13, which removes only the fast update timescale while preserving total
   state, state fields, reads, writes, routing, validation, and update work;
2. arm 14, which removes only the slow integration timescale under the same
   isomorphic constraints;
3. arm 15, which exchanges the registered rates and promotion delays without
   changing store identity, capacity, routing, or work;
4. validation-gated promotion replaced by unconditional age-based promotion;
5. replay disabled through arm 9 while every non-replay component and offline
   window remains byte-identical to the complete lifecycle;
6. same-record replay timing compared through arm 12 offline and arm 10 online,
   using the identical pre-phase manifest, order, RNG, labels, and work;
7. the full-prefix compound timing/information diagnostic, reported separately
   and barred from the timing hypothesis;
8. four isomorphic policy swaps replace only the selective scheduler with
   uniform, recency, loss-prioritized, and interference-prioritized replay;
9. each priority signal removed separately: loss, recency, interference,
   rarity, uncertainty, and expected recurrence;
10. version/staleness filtering removed while superseding facts remain;
11. privacy filtering removed in the frozen synthetic canary-only world;
12. rollback and deletion propagation removed after an injected bad promotion;
13. replay labels or task boundaries shuffled without changing event counts;
14. recurrence intervals and interference structure shifted outside the
    development range; and
15. memory, replay, and optimizer budgets swept at 0.5×, 1×, and 2× while all
    arms retain the same envelope at each point.

A claimed mechanism receives causal credit only if its targeted ablation loses
the relevant benefit without gaining hidden information or budget. Items 4,
7, and 9--15 are diagnostic stress tests unless a future protocol assigns them
their own frozen hypothesis family; they are preserved as artifacts but are not
unstated promotion gates. Items 1--3, 5, 6, and 8 supply the component contrasts
of the existing three causal entries in each family.

## Analysis and statistical plan

The estimands, metric code, seed commitments, comparator-selection rule,
subgroups, recurrence horizons, attacks, component margins, resource ceilings,
and failure gates are frozen before confirmation. Seeds, not phases, replay
events, queries, or probes, are independent units. The two families are
reported separately; a joint summary cannot mask a failed family.

Each stochastic registry row has a seed value $x_{sc}$ oriented so smaller is
favorable and a frozen null boundary $b_c$. Comparator and causal rows use the
paired within-seed difference in the row's declared unit. The complete-arm
absolute membership and canary rows instead use the seed's AUC and exposure
rate as genuine one-sample values; they are not represented as a contrast to a
fabricated control. In either case $d_{sc}=x_{sc}-b_c$ and the component test is
$H_{0c}:E[d_{sc}]\ge0$ against $H_{1c}:E[d_{sc}]<0$.

Analysis reports $\bar x_c$, a two-sided paired or one-sample 95% bootstrap
interval from 100,000 complete-seed resamples, and the preregistered one-sided
randomization value

$$
p_c=\frac{1+\sum_{r=1}^{10^6}
\mathbf 1\!\left[
n^{-1}\sum_{s=1}^{n}\epsilon_{rs}d_{sc}\le \bar d_c
\right]}{1+10^6},
\qquad \epsilon_{rs}\in\{-1,+1\}.
$$

The same frozen Rademacher matrix is used for every registry row at a reveal,
including the one-sample privacy rows; it is generated from the `analysis`
namespace before outcomes are read. Equality in the indicator is retained, so
ties are conservative, and the plus-one correction forbids a zero Monte Carlo
value. A zero-variance row is not dropped or perturbed: the formula above and
its registered worst-value substitution still apply. Exact-zero structural
components are not randomized and must equal zero on every seed. Bootstrap
indices, sign arrays, boundary-centered values, and exact-zero receipts are
artifacts. Holm-inverted one-sided bounds from these component tests, rather
than nominal intervals alone, make confirmatory decisions.

The outer confirmatory vector remains **exactly 18 tests**: in each family, six
frontier entries and three causal entries. Every entry below is an
intersection--union test. If entry $h$ has component values $p_{hc}$, its outer
value is $p_h=\max_c p_{hc}$; therefore every comparator, absolute/relative
condition, protected margin, and causal conjunct must pass. Holm controls the
18 outer values at familywise $\alpha=0.05$: sort ascending, break exact ties by
family `F1` before `F2` and then hypothesis number, and at rank $r=1,\ldots,18$
require $p_{(r)}\le0.05/(19-r)$, stopping at the first failure. No favorable
component is selected with an `OR`, and no component becomes a nineteenth outer
test.

The nine entries in **each** family are:

1. **H-forgetting:** complete arm 11 reduces average forgetting versus the
   frozen best eligible comparator by at least 0.02 absolute **and** 10%
   relative.
2. **H-acquisition:** complete-arm immediate post-phase accuracy is
   noninferior to that comparator with margin 0.01.
3. **H-rare:** complete arm reduces rare/safety-critical false negatives by at
   least 2 per 10,000 opportunities **and** 20% relative, while every registered
   protected-stratum harm contrast is noninferior within +2 per 10,000.
4. **H-version:** complete arm reduces current-versus-superseded label-version
   (F1) or fact-version (F2) error by at least 2 per 10,000 queries **and** 10%
   relative, with zero protected-row replay.
5. **H-membership:** the complete-arm upper bound is at most 0.55 AUC **and**
   complete-minus-each-eligible-comparator is no greater than +0.02 AUC.
6. **H-canary:** the complete-arm upper bound is at most 5 numeric loss-ranking
   exposures per 1,000 canary groups **and**
   complete-minus-each-eligible-comparator is no greater than +2 per 1,000.
7. **H-timescale:** arm 13 loses at least 0.01 immediate accuracy versus arm 11,
   arm 14 increases average forgetting by at least 0.01, and arm 15 both loses
   at least 0.005 immediate accuracy and increases forgetting by at least 0.005.
   Complete-arm immediate accuracy must still satisfy H-acquisition.
8. **H-offline:** same-record offline arm 12 reduces forgetting by at least 0.01
   versus no-replay arm 9 **and** same-record online arm 10. Full arm 11 must be
   noninferior to arm 12 within 0.005 forgetting. Only this identical-manifest
   contrast can support a timing conclusion.
9. **H-selective:** complete arm 11 improves against the strongest replay-policy
   null selected from arms 5--8 by at least 0.005 average forgetting **and** 10%
   relative rare-event misses. Both conjuncts must pass; uniform replay alone
   is insufficient when another policy is stronger.

These margins are engineering hypotheses, not established effects. A relative
component with a zero comparator denominator fails for lack of headroom, as
defined above. Development estimates have no confirmatory authority.

A missing, corrupt, timed-out, over-budget, or non-finite arm result remains in
the paired analysis. Its seed aggregate is assigned the registered worst value:
accuracy `0`, forgetting `1`, rare/superseded error `10,000 per 10,000`,
membership AUC `1`, canary exposure `1,000 per 1,000`, latency/resource
use above its hard ceiling, and failure of every affected causal conjunct. A
complete paired block missing for infrastructure reasons is `undetermined`, not
silently resampled or replaced.

The Pareto comparator set is exactly arms 1--10; the oracle and causal
intervention arms 12--15 are excluded. The exact lower-is-favorable cell vector
in each family is: average forgetting (`1`, margin `0.005`), immediate
acquisition loss `1-accuracy` (`1`, margin `0.01`), rare/safety-critical misses
(`per 10,000`, margin `2`), current-versus-superseded version error
(`per 10,000`, margin `2`), membership AUC (`1`, margin `0.02`), canary exposure
(`per 1,000`, margin `2`), and every registered protected-stratum error
(`per 10,000`, margin `2`). The resource cells are measured lifecycle energy
(`J`), CPU time (`s`), acquisition p99 and query p99 (two separate `ms` cells),
persistent state (`B`), I/O (`B`), and peak resident memory (`B`), each with
margin zero. Other diagnostic measurements are reported but are not silently
added to or selected for this vector. Each arm is compared directly with
complete arm 11 within both families; no pooled-family average or transitive
ordering is used.

Dominance uses one frozen simultaneous max-$T$ construction. For every
`comparator × family × dimension` cell, let $D$ be comparator loss or cost minus
arm-11 loss or cost. Before forming the energy difference, replace comparator
energy by the upper endpoint and arm-11 energy by the lower endpoint of their
calibrated expanded-uncertainty intervals. The `analysis` RNG draws 100,000
paired complete-seed bootstrap index arrays. Each draw yields the centered,
studentized statistic
$T^*_{rk}=(\bar D^*_{rk}-\bar D_k)/[s_k/\sqrt N]$ for every nonzero-standard-
error cell $k$. The maximum is taken over the **entire** comparator, family, and
dimension array in every draw; after sorting those 100,000 maxima ascending,
the 95,000th value (one-based, without interpolation) is the common critical
value $q$. The simultaneous upper bound is
$\bar D_k+q s_k/\sqrt N$. A zero-standard-error cell uses its observed
worst-case difference directly and receives no artificial epsilon.

A comparator dominates arm 11 only if its max-$T$ upper bound is no greater
than the registered non-inferiority margin in every quality and protected-risk
cell, no greater than zero in every resource cell, and strictly below zero in
at least one cell. Both families, every eligible protected stratum, and every
resource dimension must be present, and neither arm may fail a hard gate.
Comparator-specific selection, omission of an unfavorable dimension, or use of
nominal cellwise intervals invalidates the verdict. Arm 11 fails if any arm
1--10 dominates it by this procedure. Because calibrated energy is mandatory,
an energy-ineligible run has no Pareto or promotion verdict rather than a
reduced-dimension frontier.

## Promotion, rejection, and kill rules

Reject the complete lifecycle if any required comparator, scenario family,
protected horizon, subgroup, or resource ledger is missing; if confirmation or
held-out seeds overlap development; if a reserve pack is extended after reveal;
or if analysis drops or replaces a failed, non-finite, or zero-denominator seed.

Immediate kill conditions are:

- a protected source row, target, label salt, score, loss, gradient, rank,
  aggregate, stopping signal, failure bit, or other evaluator-derived control
  reaches any arm-visible state; a non-protected target or salt arrives outside
  its committed `label_release` event; or a protected reveal is not retained
  post-seal inside the evaluator boundary for recomputation;
- a private/deleted record is replayed after its exclusion becomes causally
  available;
- an arm receives future recurrence, task, label, or evaluator information;
- parameter, writable-byte, replay-event, example-equivalent, optimizer-trial,
  protected-submission, privacy-probe, CPU, wall, memory, I/O, latency, or
  measured-energy budgets differ or exceed their ceilings;
- a safety-critical stratum worsens beyond its frozen non-inferiority margin;
- the best mature null meets all gates within uncertainty;
- an isomorphic timescale arm changes capacity, state fields, routing,
  payload, partition, optimizer algorithm/configuration, update boundary, RNG, read/write
  opportunities, total work, or inherited hyperparameters beyond the registered
  schedule mapping;
- arms 10/12 do not start from the common signed pre-phase-1 checkpoint; their
  same-record manifests, order, label versions, replay RNG, update boundaries,
  exact one-plus-even online cadence, optimizer, or example-equivalent work
  differ; or the timing-manifest builder reads arm or protected state;
- power planning omits a stochastic component, treats an absolute privacy gate
  as paired, accepts fewer than 90% joint or 95% per-entry simulated passes, or
  opens a reserve after no $N\le128$ qualifies;
- Pareto analysis excludes an eligible family/dimension, uses nominal rather
  than shared max-$T$ bounds, or ignores calibrated energy uncertainty;
- H-timescale, H-offline, or conjunctive H-selective fails; or
- an energy claim is emitted from modeled energy, software telemetry, an
  uncalibrated meter, overlapping intervals, or an unowned facility boundary.

Promotion of [C-008](../../research/claims.md#c-008) and
[C-010](../../research/claims.md#c-010) requires an independently rerunnable
workstation package, valid calibrated external-meter records, all 18 corrected
outer hypotheses and hard gates, sealed confirmation and held-out releases,
recomputed raw artifacts, and successful replication on a second machine
family. Until then, F-014 is a protocol-complete but non-executable contract.

## Required artifacts and execution boundary

Each run preserves the following exact artifact surface. Every JSON object is
canonical UTF-8, every JSONL row contains `seq:uint64`, `prev_sha256:hex256`,
and `row_sha256:hex256`, and `schemas/*.schema.json` is validated before any
analysis:

- `manifest.json`: fixture/source commit, command, role, creation time, schema
  version, and root hashes;
- `environment.json`: host, CPU/microcode, RAM, firmware, OS/kernel, runtime,
  dependency/container locks, filesystem, clocks, affinity, power mode, and
  thermal acceptance;
- `generator.json`: every F1/F2 constant, PCG64-DXSM implementation hash,
  framing implementation and test vectors, purpose strings, namespace draw
  counts/order, numeric/serialization rules, and source/projection/release
  schema hashes;
- `seeds.json`: development/reserve packs, derived state/stream pairs,
  commitment/reveal receipts, arm orders, and the accepted $N$ receipt;
- `evaluator/source.jsonl.enc`: every canonical source row, including target and
  salt, encrypted to the evaluator; `arm-observations.jsonl` contains only the
  separately hashed target-free projections, `label-releases.jsonl` contains
  the causally ordered non-protected releases, and `byte-denial.jsonl` records
  every schema/sentinel check and rejected delivery;
- `evaluator/protected-source.jsonl.enc` and `protected-root.json`: the encrypted
  protected subset with raw rows, targets, strata, and salts, and the pre-seal
  Merkle roots, one-way prediction-sink receipts, no-return receipts, and
  before/after state hashes. After the complete paired block is sealed,
  `evaluator/protected-reveal.jsonl` preserves the decrypted protected rows,
  targets, strata, salts, and reveal events under evaluator-only access for
  exact metric recomputation; none of those bytes is returned to an arm;
- `arm-<id>/config.json`, `inputs.jsonl`, `outputs.jsonl`, `events.jsonl`, and
  `failures.jsonl`: model/optimizer hashes, observation and valid label-release
  inputs, committed predictions, updates, timeouts, non-finite values, and
  retained rejections. Each input row names its validated projection/release
  schema and source commitment;
- `arm-<id>/replay-manifests.jsonl`: phase, eligibility cutoff, record hashes,
  order, label versions, RNG state, reason codes, event/example counts, and
  digest pairing; `timing-manifest.jsonl` additionally proves the byte-identical
  12,000-position manifests and online cadence for arms 10/12, and
  `timescale-manifest.jsonl` proves the `F`/`S` payload, partition, optimizer
  algorithm/configuration, update-boundary, RNG, stream/offline slot, and
  no-retuning identity for arms
  11/13--15. Phase-entry and phase-exit state hashes are retained without an
  equality assertion after the common initial checkpoint;
- `arm-<id>/state-journal.jsonl`: fast/slow partition, state version, promotion,
  rollback, deletion, staleness, privacy decision, parent state, bytes, and
  checkpoint digest;
- `privacy/probes.jsonl`, `attacks.jsonl`, `canary-groups.jsonl`, and
  `canary-results.jsonl`: committed strata/partitions, permitted attack
  features, all 32 configurations, selection/calibration receipts, every
  inserted and decoy numeric candidate, group/candidate identifiers, fixed
  target, NLL in `nat/example`, tie hash, rank, exposure result, query count,
  before/after state hashes, and evaluator-only access audit;
- `resources.jsonl`: per operation and arm, input/output bytes, I/O bytes,
  example-equivalents, replay events, CPU-s, wall-s, peak resident bytes,
  persistent bytes, latency in ms, and meter interval ID;
- `energy/meter.csv`: `interval_id,timestamp_utc,cumulative_J,valid`, plus
  `calibration.json`, `idle.csv`, `boundary.json`, missing-sample record,
  interval ownership, expanded uncertainty calculation, unamortized tuning J,
  allocation denominator `2N`, and allocated lifecycle J;
- `metrics.csv`: seed, family, phase, horizon, protected stratum, arm, metric,
  numerator, fixed denominator, value, unit, and failure status;
- `analysis/component-registry.csv`, `development-matrix.csv`,
  `power-residuals.csv`, `power-planning.csv`, `power-indexes.jsonl`, and
  `power-decisions.csv`: the full conjunction, one-sample/paired designation,
  null boundaries, development residual matrix, fixed alternatives, every
  simulated row-index array, joint/marginal pass counts, and accepted-$N$
  decision;
- `analysis/resamples.json`, `sign-flips.json`, `components.csv`, and
  `holm-18.csv`: exact sampled seed indices/signs, boundary-centered values,
  every component statistic/margin, exact-zero receipts, outer max-$p$
  construction, adjusted bounds, and decisions;
- `analysis/pareto-resamples.json`, `pareto-energy.csv`, `pareto.csv`, and
  `comparator-selection.json`: the shared max-$T$ bootstrap arrays, calibrated
  energy endpoints and worst-case differences, all family/dimension bounds,
  dominance decisions, and development-only strongest-null receipt; and
- `summary.md`, `verdict.json`, `deviations.jsonl`, `sha256sums.txt`, and
  `root-signature.json`. The verdict names each failed component, outer entry,
  hard gate, and artifact hash and is one of `pass`, `fail`, `undetermined`, or
  `infeasible`.

Raw ledgers are authoritative over summaries, plots, or dashboards. Failed,
rejected, over-budget, interrupted, and null-result blocks remain present.
Resume is permitted only from a content-addressed checkpoint whose event prefix,
RNG/optimizer/state journals, resource counters, and exclusive meter-interval
chain all verify.

The first executable slice should use small deterministic CPU models and
fixture adapters to test canonical framing/identifier vectors and draw order;
ledger integrity and resume; equal-budget and inherited-retuning refusal;
source/projection separation, exact label-release cadence, target/salt byte
denial, one-way protected calls, and post-seal evaluator-only reveal
recomputation; stale/deleted replay refusal; exact online/offline timing cadence
from the common initial checkpoint; isomorphic `F`/`S` job payload and partition
accounting; numeric canary NLL ranking; one-sample privacy components and the
joint power decision; simultaneous max-$T$ Pareto recomputation; attack
reproducibility; and fail-closed meter handling. It must remain `smoke-ready`
until sealed confirmation, valid calibrated-energy provenance, and
second-machine replication exist.

## Harness status

Blocked by: not-built.

The Deterministic generator and event schema section fixes the PCG64-DXSM generator, its state and its serialisation, so a smoke harness can be built from the contract as written; no generator, runner or tests exist yet.
