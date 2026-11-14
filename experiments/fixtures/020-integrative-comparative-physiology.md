# Fixture F-020 — Integrative comparative physiology

- **Status:** complete pre-implementation CPU-only experiment contract
- **Direct claims:** [C-1488](../../research/claims.md#c-1488)–[C-1496](../../research/claims.md#c-1496)
- **Source audit:** [integrative comparative physiology](../../research/audits/2026-08-25-integrative-comparative-physiology.md)
- **Protocol IDs:** `ICP-T01`–`ICP-T09`
- **Execution state:** ICP-T01 public-development smoke harness and smoke-ready
  manifest exist for C-1488 scope only; every summary remains `NO_RESULT`
- **Registry disposition:** no new P-series principle, architecture candidate, or claimed effect

This fixture preserves the audit's complete common contract, nine protocol
specifications, and frozen deployable-policy registry as one reciprocal
claim-to-test artifact. Biological and medical vocabulary remains
source-qualified; every synthetic coefficient is a generator setting rather
than a physiological normal, clinical threshold, legal limit, or measured
improvement.

| Protocol | Direct claim | Registered question |
| --- | --- | --- |
| ICP-T01 | [C-1488](../../research/claims.md#c-1488) | Aggregate supply versus local delivery and utilisation |
| ICP-T02 | [C-1489](../../research/claims.md#c-1489) | Conditional Murray-law branching |
| ICP-T03 | [C-1490](../../research/claims.md#c-1490) | Countercurrent exchange effectiveness and cost |
| ICP-T04 | [C-1491](../../research/claims.md#c-1491) | Filtration, tubular transport, excretion, and balance |
| ICP-T05 | [C-1492](../../research/claims.md#c-1492) | Coupled delayed autoregulation |
| ICP-T06 | [C-1493](../../research/claims.md#c-1493) | Regional benefit versus global pulmonary cost |
| ICP-T07 | [C-1494](../../research/claims.md#c-1494) | Predictive regulation, forecast value, and cumulative cost |
| ICP-T08 | [C-1495](../../research/claims.md#c-1495) | Synchrony, common drive, coupling, and function |
| ICP-T09 | [C-1496](../../research/claims.md#c-1496) | Fast regulation versus slow structural adaptation |

## Question and hypotheses

The registered questions and directional hypotheses are the nine
`Scientific question`, primary-contrast, and measurable-prediction records
below. They are falsification targets, not expected findings.

## Systems, scenarios, and tasks

Each track defines its own synthetic DGP, development/confirmation/transfer
split, intervention family, state transition, observation process, and artifact
schema. The common contract controls any ambiguity.

## Arms, baselines, and strongest nulls

A is the tempting collapsed rule, B the strongest named mature null, C the
existing-principle composition, and O an evaluator-only oracle where specified.
The frozen policy registry below makes every deployable A/B/C arm executable.

## Matched budgets and equal information

A/B/C share worlds, observations, actuator authority, action timing, tuning
budget, terminal-loss rules, and declared resource accounting. Track-specific
information, byte, work, reserve, and closure gates are preserved below.

## Measurements and units

Every protocol declares its primary inferential unit, native units, finite
terminal loss, resource endpoint, secondary measurements, and artifact schema.
Workstation energy remains unmeasured unless separately preregistered.

## Required ablations and interventions

The confirmation and transfer families below are the frozen interventions.
Removing a mechanism, comparator, regime reversal, observation corruption, or
equal-information control requires a new protocol version.

## Analysis and statistical plan

The common signed contrasts, cluster bootstrap-$t$, familywise adjustment,
simultaneous bounds, route selection, non-inferiority null, sensitivity
diagnostic, and invalidity rules below are the complete analysis plan.

## Promotion, rejection, and kill rules

A track can report only `PASS`, `FAIL`, `INCONCLUSIVE`, or `INVALID`
under the written gates. Parity supplies no improvement credit. A runtime,
closure, leakage, constraint, or power failure remains in the analysis under
the specified fallback or finite terminal loss.

### No-results authority

This document contains no execution output. It cannot establish physiological,
clinical, animal, AI-performance, workstation-energy, legal-compliance, or
deployment results. Promotion requires a separately implemented, reviewed,
frozen, and executed workstation artifact.

## Common CPU-only falsification contract

Every number below is a synthetic generator setting, numerical tolerance,
minimum detectable project effect, or compute cap. It is not a physiological
normal range, clinical threshold, legal limit, or observed improvement.

1. **Runtime and determinism:** implement in TypeScript/JavaScript under the
   repository-pinned Node.js runtime. Use PCG64-DXSM, binary64 reference
   arithmetic, canonical little-endian serialisation, SHA-256 world manifests,
   no network at run time, and stable-hash tie breaking. Parallel reductions
   sort by canonical world ID. `U(a,b)` is continuous uniform,
   $U_{\mathbb Z}\{a,b\}$ is inclusive discrete uniform, `logU` is log-uniform,
   and $N(\mu,\sigma^2)$ is Gaussian. A raw 64-bit PCG output $x$ becomes the
   open-unit-interval value $(x+0.5)/2^{64}$. Gaussian draws consume two
   consecutive uniforms and return only the cosine Box--Muller variate
   $\sqrt{-2\log u_1}\cos(2\pi u_2)$, discarding the sine mate. Unless
   dependence is written, draws are independent.
2. **Seeds and inference unit:** each track uses 64 public development seeds,
   128 registrar-sealed confirmation seeds, and 64 sealed transfer seeds. One
   seed is one inferential cluster; regions, vessels, nephrons, compartments,
   timesteps, shocks, and repeated observations inside it do not increase $n$.
3. **Generation failures:** draw fields in written order. Rejection sampling
   stops after 10,000 attempts. Exhaustion creates a retained terminal-failure
   seed; it cannot be deleted or replaced after freeze.
4. **Arms:** A is the tempting collapsed rule. B is the strongest named mature
   optimisation, estimation, or control null. C is the relevant composition of
   existing project principles. O is an evaluator-only oracle where specified.
   A/B/C share observations, actuator authority, action timing, development
   worlds, and tuning budget. Oracle fields never enter a deployable arm. The
   [frozen policy registry](#frozen-deployable-policy-registry) below resolves
   every shorthand arm description into executable state updates, objective,
   grid, solver, seed, fallback, and tie rule; the registry controls if a short
   protocol summary is less specific.
5. **Tuning:** development alone chooses nuisance parameters. Confirmation and
   transfer perform no threshold repair, architecture selection, model search,
   seed deletion, or changed stopping rule.
6. **Primary contrast:** each track defines a finite seed loss $L_{g,s}$ in a
   native unit and a required fractional reduction $r_j$. For B versus A,

   $$
   D^{B:A}_{j,s}=L_{B,s}-(1-r_j)L_{A,s}.
   $$

   A C:B primary-loss route uses the same form with its separately written
   threshold below. Equality gives no improvement credit. A zero comparator
   loss cannot yield improvement credit, and any positive candidate loss fails
   that seed's directional contrast.
7. **Confirmatory inference:** each contrast family uses the following complete
   one-sided cluster bootstrap-$t$ procedure for
   $H_{0,j}:E[D_j]\ge0$ against $E[D_j]<0$. Confirmation has $n=128$ aligned
   seed clusters and transfer has $n=64$. For track $j$, calculate sample mean
   $\bar D_j$, sample SD $s_j$ with denominator $n-1$, standard error
   $SE_j=s_j/\sqrt n$, and

   $$
   T_{j,obs}=\bar D_j/SE_j.
   $$

   If $SE_j=0$, define $T_{j,obs}=-\infty,0,+\infty$ according as
   $\bar D_j<0$, $=0$, or $>0$. Centre seed residuals
   $e_{j,s}=D_{j,s}-\bar D_j$. One joint bootstrap outcome is one ordered index
   vector $(i_1,\ldots,i_n)\in\{1,\ldots,n\}^n$, applied to every track in the
   family so aligned cross-track dependence is retained. From
   $e^*_{j,k}=e_{j,i_k}$ calculate
   $T^*_{j}=\bar e^*_j/(s^*_j/\sqrt n)$. When $s^*_j=0$, set
   $T^*_j=-\infty,0,+\infty$ according to the sign of $\bar e^*_j$.

   If the complete joint resample space $n^n\le10^6$, enumerate it in
   lexicographic index order and use the exact conditional-bootstrap fractions.
   Otherwise use exactly $B=100{,}000$ Monte Carlo vectors with PCG64-DXSM seed
   `SHA256("ICP-v1|phase|family|joint-bootstrap-t")`, replacing `phase` by
   `confirmation` or `transfer` and `family` by `B-A`, `C-B-selected`, or
   `C-B-NI`. Monte Carlo raw lower-tail values use the plus-one rule

   $$
   p^{raw}_j=\frac{1+\#\{b:T^*_{j,b}\le T_{j,obs}\}}{B+1};
   $$

   exact enumeration uses the count divided by $n^n$ without a plus one.
   For familywise control define $M_b=\min_kT^*_{k,b}$ and use
   $p^{adj}_j=(1+\#\{b:M_b\le T_{j,obs}\})/(B+1)$ in Monte Carlo, or the
   corresponding exact fraction. Let $c_{0.01}$ be the conservative lower
   0.01 quantile of $M$: order the values increasingly and take index
   $\max[1,\lfloor0.01(B+1)\rfloor]$ for Monte Carlo or
   $\max[1,\lfloor0.01n^n\rfloor]$ for exact enumeration. The simultaneous 99%
   upper bound in the contrast's native unit is

   $$
   U_j=\bar D_j-c_{0.01}SE_j;
   $$

   when $SE_j=0$, $U_j=\bar D_j$. A track passes its family gate only when
   $p^{adj}_j\le0.01$ and $U_j<0$; equality fails. An all-zero contrast has
   $T_{obs}=0$, $U=0$, and cannot pass. A constant negative contrast can receive
   only the exact-zero or Monte Carlo plus-one tail value and still must have a
   negative bound. Report the raw and adjusted values, critical quantile,
   unshifted paired losses, mean, median, 5th/95th percentiles, and every seed
   contrast. Transfer repeats the complete family procedure with $r_j/2$; it
   never substitutes an unadjusted test.
8. **C:B novelty and non-inferiority contrasts:** every track freezes a finite,
   non-negative resource endpoint $R_{g,s}$ and cap $R_s^{max}$ before C-route
   selection. The permitted endpoints are: T01 simulated pump work (J), T02
   full objective/gradient evaluation count, T03 finite-volume cell-update
   count, T04 residual-plus-Jacobian evaluation count, T05 integrated actuator
   exposure (kPa min), T06 simulated pump work (J), T07 gross reserve debit
   (CU h), and T09 converted structural-plus-reserve cost (cost units). T08 has
   no resource route. Missing, non-finite, or above-cap resource output is set
   to $R_s^{max}$. Confirmation primary-loss and resource contrasts are

   $$
   D^{C:B,L}_{j,s}=L_{C,s}-0.90L_{B,s},\qquad
   D^{C:B,R}_{j,s}=R_{C,s}-0.85R_{B,s}.
   $$

   Transfer uses 0.95 and 0.925 in place of 0.90 and 0.85. If the relevant B
   comparator is zero, the seed contrast is the non-negative C endpoint;
   zero--zero equality supplies no improvement credit. A resource route
   additionally tests

   $$
   D^{C:B,NI}_{j,s}=L_{C,s}-L_{B,s}-\delta_{j,s},\qquad
   \delta_{j,s}=0.01L_s^{max}
   $$

   on confirmation and $\delta_{j,s}=0.005L_s^{max}$ on transfer. Its null is
   $H_0:E[D^{C:B,NI}_j]\ge0$ (inferior by at least the margin) against
   $H_1:E[D^{C:B,NI}_j]<0$; equality fails. Thus “non-inferior” is not inferred
   from a nonsignificant superiority test.

   Route selection uses only the 64 development seeds. Define
   $g_L=(\bar L_B-\bar L_C)/\max(\bar L_B,10^{-12}\bar L^{max})$ and
   $g_R=(\bar R_B-\bar R_C)/\max(\bar R_B,10^{-12}\bar R^{max})$. A route is
   eligible only when its gain exceeds 0.10 or 0.15 respectively and all of its
   development protected gates hold; the resource route must also have
   $\overline{D^{C:B,NI}}<0$. If both are eligible, select the larger excess
   $g_L-0.10$ versus $g_R-0.15$, with exact ties assigned to loss. If neither is
   eligible, freeze the loss route and a `development-ineligible` flag that
   prevents `PASS`. The route never changes after unsealing. The nine selected
   contrasts use the `C-B-selected` simultaneous family; resource-route
   non-inferiority contrasts use `C-B-NI`. Each uses the statistic, null,
   plus-one value, adjusted value, and simultaneous upper bound from item 7.
   Parity or a failed gate kills the composition, not the claim boundary.
9. **Feasible development sensitivity diagnostic:** this diagnostic never
   nests a 100,000-resample confirmation bootstrap. Align the nine B:A
   development contrasts by public seed, centre each track, and let
   $a_j$ be its median finite A loss. A joint sample draws 128 of the 64 aligned
   development-seed rows independently with replacement and applies the same
   ordered row-index vector to all tracks. First draw exactly 20,000 such joint
   samples using PCG64-DXSM seed
   `SHA256("ICP-v2|development-sensitivity|reference")`; calculate all nine
   studentized means with the item-7 zero-SE rule and freeze the lower 0.01
   quantile of their samplewise minimum as $c_{ref}$. Then, for each planted
   shift $\Delta\in\{0,0.02,0.05,0.10\}$, draw exactly 5,000 new joint samples
   of 128 clusters using seed
   `SHA256("ICP-v2|development-sensitivity|outer|Delta")`, subtract
   $\Delta a_j$ from track $j$, and call a pseudo-pack rejection only when
   $T_j\le c_{ref}$ and $\bar D_j-c_{ref}SE_j<0$. Report rejection proportions
   and Wilson 95% binomial intervals. This fixed-reference max-$t$ diagnostic
   approximates familywise sensitivity; it is not substituted for confirmation
   inference. Its cost is 40,000 outer/reference packs total, not 10,000 nested
   confirmation runs. Fewer than 80% rejections at the 5% shift makes a later
   valid non-rejection `INCONCLUSIVE`; it cannot alter seeds, margins, routes,
   or methods after unsealing.
10. **Uncertainty:** DGP uncertainty is sampled at seed level. Any arm emitting
   an interval reports coverage and proper interval score. Non-finite or
   unbounded intervals at an action boundary force fallback. A point estimate
   is not silently substituted.
11. **Numerics:** development includes conservation cells, analytic-limit
    cells, timestep halving, and independent solver cross-checks. Ordinary
    relative closure tolerance is $10^{-8}$ and analytic-cell relative error is
    $10^{-6}$ unless a stricter track rule is stated. More than 5% numerical or
    generator failure on confirmation makes the track `INVALID`, not negative.
12. **Compute envelope:** an eight-seed shakedown must project below 8 wall
    hours, 16 logical CPU cores, 32 GiB peak RAM, and 40 GiB artifacts per
    track. No GPU is allowed. Resolution may change only during development,
    followed by a new manifest and full freeze.
13. **Failure retention:** every timeout, abort, non-finite result, infeasible
    action, refusal, fallback, and failed run remains in the analysis. An
    arm-specific failure receives the frozen terminal loss. There is no early
    efficacy stop.
14. **Resource boundary:** report CPU-s, wall-s, peak resident bytes, bytes read
    and written, artifact bytes, solver iterations, observation count, action
    count, and simulated domain work in its native unit. Workstation joules and
    carbon remain `not measured` unless a separate calibrated power protocol is
    preregistered.
15. **Terminal states:** `PASS` means the frozen boundary or novelty gates and
    all protected gates passed; `FAIL` means a valid run missed them;
    `INCONCLUSIVE` means valid computation lacked the frozen sensitivity;
    `INVALID` means generator, numerical, leakage, unit, or protocol integrity
    failed. `INCONCLUSIVE` is not rounded into `PASS` or `FAIL`.
16. **No-result boundary:** protocol text, a successful shakedown, or a valid
    runner is not a result. Even a synthetic pass would establish only the
    named DGP transfer. It would not establish a biological fact, clinical
    effect, deployed AI benefit, measured energy saving, or legal compliance.

## Nine CPU-only protocol specifications

### ICP-T01 — Aggregate supply versus local delivery and utilisation

- **Claim tested:** proposed C-1488.
- **Scientific question:** when whole-network oxygen supply exceeds whole-
  network demand, do support-aware allocation and accounting expose and reduce
  local debt that an aggregate rule misses?
- **Primary unit and units:** one 24 h synthetic tissue-network episode; time
  (min), flow (L/min), concentration (mmol/L), delivered, consumed, exported,
  stored, and deficient oxygen (mmol), pressure (kPa), and simulated hydraulic
  work (J).
- **Frozen spatial DGP:** place source node 0 at $(0.5,0.5)$ m and draw
  $N\sim U_{\mathbb Z}\{48,128\}$ demand nodes uniformly in the unit square,
  rejecting pair separations below 0.01 m. Sort demand nodes by Euclidean
  distance from the source, breaking equal distances by canonical node ID.
  Each node's nearest earlier node is its **primary parent**; those directed
  primary edges form a rooted arborescence. Add directed chords from the next
  two nearest earlier nodes when they exist, deduplicating edges. A
  Dirichlet$(2,\ldots,2)$ vector gives baseline demand shares $b_i$. Draw source
  concentration $C_a\sim U(7,10)$ mmol/L and total baseline demand
  $M_0\sim U(1,8)$ mmol/min. Set $m_{i,0}=b_iM_0$, required baseline recipient
  flow $q_{i,0}=m_{i,0}/C_a$, and source flow
  $Q_{src}=1.20\sum_iq_{i,0}=1.20M_0/C_a$ L/min. On the primary edge entering
  node $i$, serialize the exactly feasible baseline flow

  $$
  q^{tree}_{e(i),0}=1.20\sum_{k\in\operatorname{subtree}(i)}q_{k,0}.
  $$

  Node $i$ retains $1.20q_{i,0}$ L/min and passes the remaining tree flow to
  its children, so source and every node close exactly. Primary-edge capacity
  is $U(1.10,1.50)q^{tree}_{e,0}$ L/min; chord capacity is
  $U(0.05,0.25)Q_{src}$ L/min. Edge length is geometric length and radius is
  `logU(0.001,0.004)` m. Before forcing is drawn, append evaluator-only arcs
  from every recipient to a super-sink, each with capacity
  $1.20q_{i,0}$ L/min, and run lexicographically ordered Dinic max flow from
  source to super-sink. Reject the complete graph unless max flow equals
  $Q_{src}$ within $10^{-12}$ L/min. The super-sink arcs are never exposed as
  actions. Thus the registered baseline is feasible rather than inferred from
  aggregate headroom, while later local-delivery conclusions remain open.
- **Frozen forcing:** truth step is 15 s. For each node, initialise $z_{i,0}=0$
  and update once per minute by
  $z_{i,t}=0.94z_{i,t-1}+0.12\eta_{i,t}$, with
  $\eta=\operatorname{clip}(N(0,1),-2.5,2.5)$. Demand before hotspots is
  $m_{i,t}=m_{i,0}\exp(z_{i,t})$. Draw
  $K\sim U_{\mathbb Z}\{8,20\}$ non-overlapping hotspots. Each starts at a
  minute uniformly selected from 60--1320, lasts
  $U_{\mathbb Z}\{10,90\}$ min, selects a uniformly drawn graph node as centre,
  and multiplies demand by $U(1.5,3)$ at that node, half that excess at one-hop
  descendants, and one quarter at two-hop descendants. Reject and redraw the
  complete hotspot schedule if aggregate demand exceeds $1.15C_aQ_{src}$ for
  more than 120 min; short aggregate overload remains in scope and is recorded.
  Demand rate is held constant across the four 15 s truth steps in its minute.
  At a truth step of length $\Delta t=0.25$ min, recipient flow is
  $q^{rec}_{i,t}=\sum_{e\to i}q_{e,t}-\sum_{i\to e}q_{e,t}\ge0$ L/min and
  delivery is $A_{i,t}=C_aq^{rec}_{i,t}\Delta t$ mmol. Storage capacity is
  $S_i^{max}=(10\ \mathrm{min})m_{i,0}$ mmol and $S_{i,0}=0.5S_i^{max}$. The
  evaluator applies this exact order:

  $$
  \Lambda_{i,t}=\min[S_{i,t},(0.002\ \mathrm{min}^{-1})S_{i,t}\Delta t],
  \quad S^-_{i,t}=S_{i,t}-\Lambda_{i,t},
  $$

  $$
  M_{i,t}=m_{i,t}\Delta t,\quad
  C_{i,t}=\min[M_{i,t},S^-_{i,t}+A_{i,t}],\quad
  U_{i,t}=S^-_{i,t}+A_{i,t}-C_{i,t},
  $$

  $$
  S_{i,t+1}=\min(S_i^{max},U_{i,t}),\quad
  E_{i,t}=\max(0,U_{i,t}-S_i^{max}),\quad
  Z_{i,t}=M_{i,t}-C_{i,t}.
  $$

  Here $\Lambda$ is leaked amount, $C$ consumed amount, $E$ exported amount,
  and $Z$ local deficit, all in mmol. Leakage occurs before delivery,
  consumption draws the post-leak store and current delivery without priority,
  remaining material charges storage up to its cap, and only the clipped excess
  is exported. Edge flows are held between 5 min decisions. Every source, edge,
  recipient, storage, leakage, consumption, and export row closes to
  $10^{-8}$ relative error.
- **Observations and actions:** all arms receive source flow/concentration each
  minute and delayed local storage and consumption proxies every 5 min. Delay is
  a seed-level $U_{\mathbb Z}\{0,4\}$ min; signed Gaussian noise has 3% SD of
  each reading and is clipped only at the physical action boundary, with raw
  values retained. Every 5 min an arm sets non-negative edge flows satisfying
  conservation, capacity, and the common $Q_{src}$. Change per edge is capped
  at 25% of capacity per decision. Simulated work uses the Poiseuille pressure
  equation after converting L/min to m$^3$/s, with $\mu=0.0035$ Pa s, and is
  integrated over the episode; these are synthetic transport parameters, not a
  species model.
- **Arms and mature null:** A replays the serialized primary-tree branch shares
  at every decision, scaled to $Q_{src}$, leaves chords unused, and confirms
  feasibility only from the aggregate balance. B is robust receding-horizon
  mixed-integer min-cost flow over a 30 min horizon,
  with explicit node storage, the last six observations, a 99% empirical
  innovation box frozen on development, and a lexicographic objective of local
  deficit then pump work. C uses P-001/P-002/P-009/P-013: local debt queues ask
  parents for capacity, siblings lend only above a frozen storage guard, and a
  supervisor solves a global repair flow when any debt interval crosses its
  threshold. O sees latent one-minute demand and solves the full 24 h flow; it
  is diagnostic only. B is the mature null even if C resembles biological
  locality. This is an explicit downstream depth test of
  [Candidate 013](../../experiments/candidates/013-deficit-capability-routing.md):
  aggregate feasibility is not recipient capability.
- **Transfer family:** before constructing parents, place the source at $(0,0)$
  rather than $(0.5,0.5)$ and otherwise repeat the spatial DGP in written order.
  After chord creation, remove exactly
  $K_E=\max[1,\lfloor0.10|E_{chord}|\rfloor]$ chords with the smallest
  `SHA256("ICP-v2|T01|remove|worldID|edgeID")` values. Capacities are never
  repaired; reject unless the same super-sink max-flow test still equals
  $Q_{src}$ within $10^{-12}$ L/min. Each hotspot draws a destination uniformly
  from nodes other than its centre and follows the lexicographically first
  unweighted shortest path; its centre advances one path edge every 5 min and
  the one-/two-hop excess is recomputed after each advance. Every storage and
  consumption panel draws independent integer delay
  $U_{\mathbb Z}\{5,12\}$ min. Draw loading $\rho_z\sim U(0.2,0.7)$ once per
  world, set $g_0=z_{i,0}=0$, and replace each minute's ordinary innovation by
  $0.12[\rho_zg_t+\sqrt{1-\rho_z^2}\eta_{i,t}]$, where $g_t$ and every
  $\eta_{i,t}$ are independently clipped $N(0,1)$ values in $[-2.5,2.5]$.
  All draws use world, hotspot, minute, then node order.
- **Primary metric and terminal loss:** local oxygen debt is

  $$
  L_s=\sum_{i,t}Z_{i,t}\quad[\mathrm{mmol}].
  $$

  With the written clipping and hotspot limits, evaluator code computes a
  finite seed-specific upper bound $L_s^{max}=\sum_{i,t}m_{i,t}\Delta t$ before
  exposing observations. Missing output, infeasible flow, negative amount,
  oracle leakage, or broken closure receives $L_s^{max}$. B versus A uses
  $r_1=0.20$.
- **Secondary metrics:** number and duration of deprived-node episodes
  (count, min); 95th-percentile node debt (mmol); delivered/consumed/exported
  oxygen (mmol); minimum storage (mmol); simulated work (J); integrated
  edge-flow exposure $\sum_{e,t}|q_{e,t}|\Delta t$ (L); edge-flow total
  variation $\sum_{e,t}|q_{e,t}-q_{e,t-1}|$ (L/min); CPU and artifact
  resources. This track has no reserve debit.
- **Inference and protected gates:** apply the common paired cluster inference.
  Total source inflow must be identical across arms to $10^{-10}$ L/min; oxygen
  closure must be below $10^{-8}$; B's simulated work may not exceed A by more
  than 5%; and its 95th-percentile node deficit may not increase. These are
  simultaneous protected gates, not post-hoc trade-offs.
- **Fallback and stopping:** an unbounded interval, infeasible optimisation, or
  stale observation older than 15 min invokes the last feasible flow projected
  onto current capacities, then routes the remaining source flow by baseline
  shares. Projection and fallback cost are charged. Three consecutive closure
  failures or any negative storage terminates the arm and assigns terminal
  loss; other fallbacks continue.
- **Transfer interpretation:** a synthetic pass supports spatially typed
  allocation for the stated graph family. It does not establish tissue oxygen
  physiology or a workstation-energy reduction. If B matches C, retire the
  locality composition; if A and B tie because all worlds remain locally
  unconstrained, mark the track `INCONCLUSIVE`, not evidence against C-1488.
  Whether the result changes Candidate 013 requires a separate central review;
  this audit does not duplicate or silently replace that candidate.
- **Artifacts:** `world-manifest.json`, `graph.json`, `demand.parquet`,
  `oxygen-ledger.parquet`, `flows.parquet`, `fallbacks.jsonl`,
  `seed-outcomes.jsonl`.

### ICP-T02 — Conditional Murray-law branching

- **Claim tested:** proposed C-1489.
- **Scientific question:** does a cubic closed-form radius rule retain its
  cost and feasibility advantage when the assumptions that generate it are
  independently changed?
- **Primary unit and units:** one binary transport-tree design serving a 1 h
  demand episode; length and radius (m), flow (m$^3$/s), viscosity (Pa s),
  pressure (Pa), power (W), and episode cost (J).
- **Frozen tree DGP:** draw depth $d\sim U_{\mathbb Z}\{4,7\}$. Starting at a
  root, every internal node bifurcates, giving $2^d$ terminals. Edge length is
  `logU(0.005,0.05)` m. Terminal base flow is `logU(1e-10,1e-8)` m$^3$/s;
  normalise terminal flows so their sum is `logU(1e-7,1e-5)` m$^3$/s. Internal
  flow is the exact descendant sum. Draw viscosity
  $\mu_0\sim\operatorname{logU}(0.001,0.006)$ Pa s, allowed radius
  $r\in[5\times10^{-5},5\times10^{-3}]$ m, and volume-maintenance coefficient
  $\lambda_V\sim\operatorname{logU}(10^2,10^5)$ W/m$^3$.
- **Regime interventions:** choose one of four regimes uniformly and serialize
  it before design. `classic` uses $\mu_e=\mu_0$ and steady flow. `rheology`
  uses $\mu_e=\mu_0[1+a\exp(-r_e/r_c)]$, with $a\sim U(0.5,4)$ and
  $r_c\sim\operatorname{logU}(10^{-4},10^{-3})$ m. `pulsatile` adds
  $\lambda_If\rho L_eQ_e^2/(\pi r_e^2)$ W, where
  $\lambda_I\sim U(0.1,2)$, $f\sim U(0.5,4)$ s$^{-1}$, and
  $\rho=1000$ kg/m$^3$. `wall-floor` adds
  $\lambda_A2\pi r_eL_e$ W with
  $\lambda_A\sim\operatorname{logU}(1,10^3)$ W/m$^2$ and requires every
  terminal pressure to exceed $P_{min}\sim U(0.2,0.8)P_{root}$, where
  $P_{root}\sim U(5,25)$ kPa. All regimes include the pumping and volume terms;
  only their named intervention differs.
- **Objective and feasibility:** for design $r$,

  $$
  P(r)=\sum_e\left[\frac{8\mu_eL_eQ_e^2}{\pi r_e^4}
  +\lambda_V\pi r_e^2L_e+P^{extra}_e\right].
  $$

  Pressures are propagated from $P_{root}$ by the edge drops. Before arm
  execution, reject a world unless the all-upper-bound radius design is
  pressure-feasible and its objective is below the registered terminal cap. Any terminal
  below its regime's required pressure, radius bound, or exact flow
  conservation incurs terminal failure; no soft penalty can make it feasible.
  Episode loss is $L_s=3600P(r)$ J. A failed arm receives
  $L_s^{max}=3600\times10^9$ J, a registered project cap above every accepted
  development design; worlds whose evaluator reference exceeds the cap are
  generator failures rather than clipped successes.
- **Arms and mature null:** all arms receive the serialized objective
  coefficients, rheology, flow, geometry, radius limits, and pressure
  constraints; only O receives solver truth. A ignores regime qualifications,
  enforces $r_e=\alpha Q_e^{1/3}$, and selects the
  single scale $\alpha$ by deterministic golden-section search over the radius-
  feasible interval to $10^{-10}$ relative width. B optimises every log-radius
  with a deterministic primal-dual interior-point solver, exact analytic
  gradients, five fixed starts (A, lower bound, upper bound, and two registered
  hash-derived log-radius starts), KKT tolerance $10^{-8}$, and the true declared regime;
  best feasible objective wins. C gates on the declared regime signature,
  selects exponent $p\in\{2,2.5,3,3.5,4,4.5\}$ and scale, then performs at most
  three local pressure repairs per path. O is B with 20
  starts and $10^{-10}$ KKT tolerance and is evaluator-only. B is the mature
  full-network optimisation null.
- **Development calibration:** the classic analytic cell has one symmetric
  bifurcation and no active radius or pressure constraint. A and B must recover
  the cubic relation and agree in power within $10^{-6}$ relative error. A
  solver that cannot reproduce this cell invalidates the track.
- **Transfer family:** draw depth $d\sim U_{\mathbb Z}\{8,9\}$ and build the same
  complete binary topology. Draw the active unordered intervention pair
  uniformly from `(rheology,pulsatile)`, `(rheology,wall-floor)`, and
  `(pulsatile,wall-floor)` and apply both written objective/constraint terms.
  Generate a Gaussian tree field with root $x_0\sim N(0,1)$ and, for each child
  in breadth-first left/right order,
  $x_{child}=0.7x_{parent}+\sqrt{0.51}\epsilon_{child}$ with
  $\epsilon\sim N(0,1)$. Set unnormalised terminal flow to
  $\exp(0.5x_i)$ and normalize all terminals to one independently drawn total
  `logU(1e-7,1e-5)` m$^3$/s. Draw edge lengths as usual, then multiply every
  right-child length by an independent $U(1.25,2)$ to make geometry asymmetric.
  Finally choose exactly $\max[1,\lfloor0.10|E|\rfloor]$ edges with smallest
  `SHA256("ICP-v2|T02|tight|worldID|edgeID")` and set their radius upper bound to
  $2.5\times10^{-3}$ m. Regenerate the complete world if the all-upper-bound
  design is infeasible; no arm-specific repair follows.
- **Primary metric and threshold:** episode objective $L_s$ in J; B versus A
  uses $r_2=0.15$. Report results both pooled and by the four preregistered
  regimes. The boundary passes only if the pooled gate passes, classic-regime B
  satisfies $L_{B,s}\le1.01L_{A,s}+\max(10^{-9}\ \mathrm{J},10^{-9}L_{A,s})$
  on **every** finite classic confirmation seed, at least 24 of the 128
  confirmation seeds are finite classic seeds, and at least two altered regimes have
  negative unshifted B:A mean contrasts. This comparator-scaled deterministic
  classic gate replaces the vacuous percentage of the very large terminal cap;
  fewer than 24 finite classic seeds makes the track `INVALID`, not a vacuous pass.
- **Secondary metrics:** pumping, volume, wall-floor, and pulsatile components
  (W and J); maximum/mean pressure error (Pa); material volume (m$^3$); fitted
  exponent; KKT residual; iterations; CPU resources.
- **Inference and protected gates:** apply the common paired cluster inference.
  Require exact node-flow closure; all radii and pressures feasible; and no
  objective term omitted from any arm. B episode material volume may not exceed
  A by more than 20% unless its total objective is lower and the volume term is
  reported separately.
- **Fallback and stopping:** if B or C misses the iteration cap of 20,000, use
  A's feasible design if one exists and charge all attempted iterations. If A
  is infeasible, use the all-upper-bound design only when pressure-feasible;
  otherwise assign terminal loss. Failure of both B and O on more than 5% of
  confirmation worlds makes the track `INVALID`.
- **Transfer interpretation:** a pass rejects a universal cube-rule policy on
  the synthetic regimes; it does not reject Murray's conditional derivation or
  infer a biological exponent. If B gains only because A was denied an
  assumption detector, report that fact; C must repay its detector against B or
  be retired.
- **Artifacts:** `tree.json`, `regime.json`, `designs.parquet`,
  `pressure-ledger.csv`, `objective-components.csv`, `solver-log.jsonl`,
  `seed-outcomes.jsonl`.

### ICP-T03 — Countercurrent exchange effectiveness and cost

- **Claim tested:** proposed C-1490.
- **Scientific question:** under which declared conductance, flow-ratio,
  leakage, and target conditions does opposing flow preserve useful exchange,
  and when does the label fail to predict the best design?
- **Primary unit and units:** one 5 min two-channel exchanger episode; length (m),
  flow (m$^3$/s), concentration (mol/m$^3$), line conductance and leakage
  (m$^2$/s), transferred or leaked amount (mol), pressure (Pa), and simulated
  pump work (J).
- **Frozen exchanger DGP:** draw length $L\sim\operatorname{logU}(0.1,2)$ m,
  channel-1 flow $Q_1\sim\operatorname{logU}(10^{-7},10^{-4})$ m$^3$/s,
  line exchange conductance $k\sim\operatorname{logU}(10^{-9},10^{-5})$
  m$^2$/s, external line leaks
  $\ell_1,\ell_2\sim\operatorname{logU}(10^{-11},10^{-6})$ m$^2$/s, inlet concentrations
  $c_{1,in}\sim U(0.8,1.2)$ and $c_{2,in}\sim U(0,0.2)$ mol/m$^3$, and external
  $c_{ext}\sim U(0,0.2)$ mol/m$^3$. Channel radii are
  `logU(0.0005,0.005)` m and viscosity is 0.001 Pa s. Draw target fraction
  $\tau\sim U(0.35,0.85)$ of the evaluator's loss-free, infinite-conductance
  available transfer integrated over the episode's complete inlet schedule at
  $Q_2=Q_1$; this action-invariant target is recorded in mol before any arm
  executes.
- **Solver and signed ledgers:** divide each used channel length into 32 equal
  finite volumes. Conservative upwind advection, inter-channel exchange, and
  external exchange are solved implicitly. Let $M=32$,
  $\Delta x=aL/M$, cross-section $A_j=\pi r_j^2$, and index each channel from
  its own inlet to outlet. Interface position $p$ pairs channel-1 cell $p$ with
  channel-2 cell $\rho(p)=p$ in co-current flow and
  $\rho(p)=M+1-p$ in countercurrent flow. With inlet ghost cell 0 fixed to the
  declared inlet, backward Euler for channel-1 cell $p$ is

  $$
  A_1\Delta x\frac{c^{n+1}_{1,p}-c^n_{1,p}}{\Delta t}
  +Q_1(c^{n+1}_{1,p}-c^{n+1}_{1,p-1})
  =-k^{n+1}_p(c^{n+1}_{1,p}-c^{n+1}_{2,\rho(p)})\Delta x
  -\ell_1(c^{n+1}_{1,p}-c_{ext,p})\Delta x.
  $$

  Channel 2 uses the same inlet-indexed upwind form at its own index
  $r=\rho(p)$, with exchange sign positive and counterpart $c_{1,p}$:

  $$
  A_2\Delta x\frac{c^{n+1}_{2,r}-c^n_{2,r}}{\Delta t}
  +Q_2(c^{n+1}_{2,r}-c^{n+1}_{2,r-1})
  =+k^{n+1}_p(c^{n+1}_{1,p}-c^{n+1}_{2,r})\Delta x
  -\ell_2(c^{n+1}_{2,r}-c_{ext,p})\Delta x.
  $$

  The steady solve sets both accumulation terms to zero. At an ordinary
  attempt, initialise every cell to its channel's inlet concentration, assemble
  the resulting 64-equation residual in paired physical-position order, and
  apply Newton steps using analytic Jacobians and a deterministic 2-by-2 block
  Thomas solve; within-block equal-magnitude pivots choose the lowest channel.
  Backtracking
  starts at one, halves until residual infinity norm decreases, and stops below
  relative residual $10^{-10}$ or after 8 Newton steps. A singular pivot below
  $10^{-14}$ times the largest column entry, exhausted backtracking below
  $2^{-40}$, or the iteration cap is nonconvergence. The equations also
  define outlet fluxes and the cellwise signed mass ledger; there is no separate
  nonconservative concentration update. Co-current uses both physical inlets at
  $x=0$; countercurrent places channel 2's physical inlet at $x=aL$. In an ordinary
  confirmation episode, multiply every converged steady mol/s flux by
  $H=300$ s. At
  every cell and time, define interface transfer positive from channel 1 to 2,

  $$
  T_{12}^{signed}=\int_0^H\!\int_0^{aL}
  k_{eff}(c_1-c_2)\,dx\,dt,
  $$

  and define external exchange as

  $$
  E_{ext}^{signed}=\sum_{j=1}^2\int_0^H\!\int_0^{aL}
  \ell_j(c_j-c_{ext})\,dx\,dt,
  \qquad
  E_{ext}^{abs}=\sum_{j=1}^2\int_0^H\!\int_0^{aL}
  |\ell_j(c_j-c_{ext})|\,dx\,dt.
  $$

  Positive signed external exchange is channel-to-environment loss and negative
  is environmental ingress. The conservation ledger uses signed fluxes; the
  loss uses absolute external exchange, so ingress cannot masquerade as useful
  transfer. Set $k_{eff}=k$ in ordinary steady episodes. The
  $k=\ell_1=\ell_2=0$ and equal-inlet cells must close
  analytically.
- **Actions:** choose orientation, ratio
  $q=Q_2/Q_1\in\{0.5,1,2\}$, and exchanger-use fraction
  $a\in\{0.5,0.75,1\}$, which multiplies $L$, $kL$, and both leak lengths.
  Pump work is integrated from Poiseuille pressure drops for both channels.
  Solute transfer across the interface, channel contents, both inlet and outlet
  streams, signed external exchange, and numerical residual form one mol
  ledger. Absolute external exchange is a cost endpoint, not a conservation
  term.
- **Arms and mature null:** A always selects full-length countercurrent flow
  with $q=1$. B enumerates all 18 orientation--ratio--length choices and first
  minimises the exact registered primary loss below, then breaks exact ties by
  lower pump work and finally canonical action order. C uses a
  development-frozen map from the environmental groups $kL/Q_1$,
  $\ell_1L/Q_1$, $\ell_2L/Q_1$, $Q_1$, and target fraction $\tau$ to nominate
  at most three actions; it evaluates those
  actions with the same solver and selects by the same registered loss and tie
  breaks as B. The map is fitted only to that loss, not to an unregistered
  lexicographic surrogate.
  O evaluates both orientations, the same three lengths, and ratio grid
  $\{0.25,0.5,\ldots,3\}$ on the eight development-shakedown seeds only; it is
  diagnostic and never enters inference. B is the mature mechanistic design null.
- **Transfer family and transient integration:** divide $H=300$ s into exactly
  six left-closed, right-open 50 s intervals. Channel 1's inlet multiplier
  alternates $1.5,0.5,1.5,0.5,\ldots$ or the opposite polarity, selected by
  stable hash of the world ID; channel 2's inlet remains fixed. Initialise each
  channel uniformly at its first-interval inlet concentration. Conductance is
  $k_{eff}=k/(1+|c_1-c_2|/(0.5\ \mathrm{mol/m^3}))$. Draw segment starts
  $s_1\sim U(0,0.4)$ and $s_2\sim U(0.5,0.9)$ as fractions of used physical
  length. On the two shared interface intervals
  $[s_1,s_1+0.1)$ and $[s_2,s_2+0.1)$, let $f_p$ be the fraction of interface
  cell $[(p-1)/M,p/M)$ overlapped by their union and set
  $k_p=(1-0.9f_p)k_{eff}$ in **both** channel equations. Thus partial boundary
  cells are length-weighted and $f_p=0$ gives $k_p=k_{eff}$. The reduction never changes advection,
  leakage, radius, or only one side of an exchange pair. In addition,
  $c_{ext}$ varies linearly between two independently drawn endpoint values in
  $[0,0.2]$ mol/m$^3$. Use backward Euler, 32 cells per channel, and exactly 2 s steps.
  At each step solve the nonlinear end state by deterministic damped Newton in
  canonical cell order to relative residual $10^{-10}$. Initialise with the
  preceding end state (the written uniform initial state at step 1), use the
  analytic Jacobian and the same partial-pivot LU rule as the steady solve, and
  halve damping from one until the residual infinity norm satisfies Armijo
  decrease with constant $10^{-4}$. A singular pivot, damping below $2^{-40}$,
  or 8 Newton iterations is nonconvergence. Integrate interface and external fluxes by the end-step
  rectangle rule, summing time then cell in canonical order. All arms receive
  the complete declared inlet schedule; B enumerates actions with this
  transient solver rather than a steady proxy. On eight development cells, a
  64-cell-per-channel, 1 s solve must change primary loss by less than
  $10^{-5}\max(1\ \mathrm{mol},L_s)$.
- **Primary metric and terminal loss:** define useful transferred amount as
  $T=\max(0,T_{12}^{signed})$ mol and retain the signed value separately.
  Freeze

  $$
  L_s=(T_{target}-T)_+ + E_{ext}^{abs}\quad[\mathrm{mol}].
  $$

  The evaluator computes $L_s^{max}$ as total donor inlet plus a finite bound on
  absolute external exchange over $H$ under the written bounded concentrations.
  Non-finite state, negative concentration below $-10^{-10}$ mol/m$^3$,
  non-closure, no steady state in an ordinary episode, or an unsolved transient
  step receives $L_s^{max}$. B versus A uses $r_3=0.10$.
- **Secondary metrics:** effectiveness $\varepsilon$ (dimensionless); useful
  transfer, signed interface transfer, signed external exchange, and absolute
  external exchange (mol); outlet gradients (mol/m$^3$); pump work (J);
  selected direction, ratio, and used length; iteration count; CPU and artifact
  resources.
- **Inference and protected gates:** apply the common inference. B pump work
  may not exceed A by more than 10% when both meet the target; mass closure is
  below $10^{-8}$; and the same target and physical coefficients apply to all
  arms. Report direction-specific response surfaces even if the pooled gate
  passes.
- **Fallback and stopping:** every enumerated action is first solved at the
  registered resolution. Nonconvergence triggers exactly one 64-cell-per-channel retry
  and, for a transient episode, 1 s steps, with initial Newton damping 0.5.
  A second failure records that action at $(L_s^{max},R_s^{max})$; B and C may
  not silently remove it from their action set. If the selected action has that
  terminal value, evaluate co-current, $q=1$, $a=0.25$ by the same two-attempt
  rule and charge every cell update. Failure of that fallback assigns terminal
  loss. More than 5% seeds with any all-action or selected-fallback failure
  makes the track `INVALID`.
- **Transfer interpretation:** no result here establishes a renal concentrating
  mechanism, sloth thermoregulation, or artificial energy saving. If A is
  optimal throughout the registered support, the synthetic counterexample
  family failed and the claim test is `INCONCLUSIVE`; it is not evidence that
  orientation alone is universally sufficient.
- **Artifacts:** `exchanger.json`, `dimensionless-groups.csv`,
  `profiles.parquet`, `mass-ledger.csv`, `action-grid.csv`,
  `seed-outcomes.jsonl`.

### ICP-T04 — Filtration, tubular transport, excretion, and balance

- **Claim tested:** proposed C-1491.
- **Scientific question:** how often does a filtration-only or concentration-
  only report misstate final excretion and whole-system storage when internal
  recovery and secretion vary?
- **Primary unit and units:** one 24 h synthetic renal-type ledger; time (min),
  volume flow (L/min), concentration (mmol/L), material rate (mmol/min), amount
  (mmol), and simulated oxygen consumption (mmol O$_2$).
- **Frozen population DGP:** draw $N\sim U_{\mathbb Z}\{128,512\}$ parallel
  units and three labelled solutes $x\in\{A,B,C\}$. At one-minute truth
  resolution, source flow is
  $G_t=G_0[1+0.15\sin(2\pi t/1440+\phi_G)+0.05z_t]$, where
  $G_0\sim U(0.05,0.2)$ L/min, $\phi_G\sim U(0,2\pi)$, and
  $z_0=0$ and $z_t=0.9z_{t-1}+\eta_t$ for $t\ge1$,
  $\eta_t\sim U(-0.2,0.2)$, clipped so
  $G_t\in[0.5G_0,1.5G_0]$. A Dirichlet$(5,\ldots,5)$ vector $w$ allocates
  carrier flow as $G_{i,t}=w_iG_t$. Draw carrier-recovery parameters
  $\omega_i\sim U(0.05,0.60)$ and
  $K^V_i\sim\operatorname{logU}(10^{-4},10^{-2})$ L/min and define positive
  post-recovery carrier flow

  $$
  U_{i,t}=G_{i,t}\left[1-\omega_i
  \frac{K^V_i}{K^V_i+G_{i,t}}\right]\quad[\mathrm{L/min}].
  $$

  Draw baseline residence times
  $\tau^{int}_i,\tau^{out}_i\sim U(5,30)$ min and fixed well-mixed compartment
  volumes $V^{int}_i=\tau^{int}_iU_{i,0}$ and
  $V^{out}_i=\tau^{out}_iU_{i,0}$ L. Source concentration for each solute is
  $C_{x,t}=C_{x,0}\exp(0.1w_{x,t})$, with
  $C_{x,0}\sim\operatorname{logU}(0.5,20)$ mmol/L and
  $w_{x,0}=0$ for all $x\in\{A,B,C\}$ and
  $w_{x,t}=0.97w_{x,t-1}+U(-0.15,0.15)$ for $t\ge1$, clipped to $[-1,1]$.
- **Frozen transport equations:** filtered load is
  $F_{i,x,t}=G_{i,t}C_{x,t}$. Draw unit capacity
  $K_{i,x}\sim\operatorname{logU}(0.2,5)$ mmol/min and recovery fraction
  $\rho_{i,x}\sim U(0.2,0.95)$. Reabsorption is

  $$
  R_{i,x,t}=\rho_{i,x}F_{i,x,t}
  \frac{K_{i,x}}{K_{i,x}+F_{i,x,t}}.
  $$

  Secretion state starts at $h_{i,x,0}=F_{i,x,0}$ and obeys
  $h_{i,x,t+1}=0.95h_{i,x,t}+0.05F_{i,x,t}+\xi_{i,x,t}$ with
  $\xi\sim U(-0.01,0.01)$ mmol/min, clipped to $[0,2K_{i,x}]$; secretion is
  $S^{sec}_{i,x,t}=\sigma_{i,x}h_{i,x,t}$ with
  $\sigma_{i,x}\sim U(0,0.25)$. Carrier concentrations and excretion are
  generated, not assumed. With $\Delta t=1$ min, intermediate input rate
  $J^1_{i,x,t}=F_{i,x,t}-R_{i,x,t}$, decay rates
  $\kappa^1_{i,t}=U_{i,t}/V^{int}_i$ and
  $\kappa^2_{i,t}=U_{i,t}/V^{out}_i$, and compartment solute amounts
  $A^1,A^2$ (mmol), apply the exact constant-rate well-mixed update

  $$
  A^1_{t+1}=e^{-\kappa^1\Delta t}A^1_t+
  \frac{J^1}{\kappa^1}(1-e^{-\kappa^1\Delta t}),\qquad
  Y^1=J^1\Delta t-(A^1_{t+1}-A^1_t),
  $$

  $$
  J^2=Y^1/\Delta t+S^{sec},\qquad
  A^2_{t+1}=e^{-\kappa^2\Delta t}A^2_t+
  \frac{J^2}{\kappa^2}(1-e^{-\kappa^2\Delta t}),\qquad
  Y^2=J^2\Delta t-(A^2_{t+1}-A^2_t).
  $$

  Indices $i,x,t$ are suppressed only inside these two equations. Initialise
  both amounts at their $t=0$ constant-rate steady states. End-step
  intermediate and final concentrations are
  $C^{int}_{i,x,t+1}=A^1_{i,x,t+1}/V^{int}_i$ and
  $C^{out}_{i,x,t+1}=A^2_{i,x,t+1}/V^{out}_i$ mmol/L; interval excretion rate is
  $X_{i,x,t}=Y^2_{i,x,t}/\Delta t$ mmol/min. Pooled final carrier flow and
  concentration are
  $U_t=\sum_iU_{i,t}$ and
  $C^{out}_{x,t}=\sum_iX_{i,x,t}/U_t$. All exponentials are evaluated in
  binary64 with `Math.exp`; $U,V,\kappa$ are strictly positive by construction.
  Draw whole-system
  input $I_{x,t}\sim U(0.8,1.2)\sum_iX_{i,x,t}$ for the first 60 min. Let
  $\bar I_x$ be its first-hour mean. Thereafter update

  $$
  I_{x,t}=\operatorname{clip}[0.98I_{x,t-1}+0.02\bar I_x+
  U(-0.02,0.02)\bar I_x,0.5\bar I_x,1.5\bar I_x],
  $$

  independently of current excretion. Body
  store follows $B_{x,t+1}=B_{x,t}+(I_{x,t}-\sum_iX_{i,x,t})\Delta t$, starts at
  $10^4$ mmol, and must remain non-negative or the world is redrawn. $B_x$ is
  the whole-system amount and therefore already contains $A^1+A^2$; carrier
  compartment amounts are typed subaccounts and are not added to $B_x$ again.
- **Work ledger:** simulated transport oxygen is
  $O_t=\sum_{i,x}(\alpha_xR_{i,x,t}+\beta_xS^{sec}_{i,x,t})\Delta t$ with
  $\alpha_x\sim U(0.01,0.05)$ and $\beta_x\sim U(0.02,0.08)$ mmol O$_2$/mmol.
  These coefficients are synthetic accounting weights, not renal constants.
  Source, carrier flow, both compartment amounts and concentrations, recovered,
  secreted, excreted, input, and store-change rows close independently for every
  solute.
- **Observations:** all arms receive the same serialized observation table:
  before $t=0$, an exact design table gives unit IDs,
  $(w_i,\omega_i,K^V_i,V^{int}_i,V^{out}_i)$, and the carrier-flow equation;
  noisy source flow every 5 min, source concentration every 15 min, pooled
  final flow/concentration every 30 min, whole-system store every 120 min
  including $t=0$ and $t=1440$, and a rotating 10% sample of unit-level
  intermediate concentrations every 60 min. In addition, exactly 24 exogenous
  panels occur at minutes $30+60k$, $k=0,\ldots,23$; each panel measures all
  three intermediate solutes in $\lceil0.1N\rceil$ units chosen by stable hash
  without replacement within the panel. Noise is mean-zero Gaussian with SD
  2%, 4%, 4%, 1%, and 5% of the respective reading; below-zero raw values remain
  flagged and the constrained estimator decides how to handle them. Assay delay
  is $U_{\mathbb Z}\{0,20\}$ min. Times, selected units, delay, noise draws,
  returned values, observation bytes, and counts are identical for A/B/C;
  there is no adaptive or optional panel channel.
- **Arms, outputs, and mature null:** every arm must emit, for every solute, a
  point estimate and finite registered 99% interval for both
  $X_x^{24h}$ and $\Delta B_x$. A sets
  $\widehat X_x^{24h}=\sum_t\widehat F_{x,t}\Delta t$, using piecewise-linear
  source-flow and concentration interpolation, and
  $\widehat{\Delta B}_x=\widehat B_{x,1440}-\widehat B_{x,0}$; it propagates the
  frozen Gaussian observation model to its intervals and declares recovery and
  secretion zero. B is the registered non-negative,
  conservation-constrained spline smoother with separate filtration, recovery,
  secretion, excretion, and storage states; its knot count and roughness weight
  are selected on development by blocked cross-validation. C adds
  P-007/P-009/P-012/P-013 typed event ledgers and abstains when an unobserved
  term is not identifiable. B and C use the same fixed panels as A and emit the
  bounded midpoint plus complete identified interval when abstaining. O receives
  all latent flows and is diagnostic. B is the mature process-estimation null.
  This is a direct depth test of
  [Candidate 014](../../experiments/candidates/014-versioned-observation-contract.md):
  all estimates must be reconstructable from the identical versioned table.
- **Transfer family:** draw $d_{i,x}\sim U(-0.40,0.40)$ and replace recovery
  capacity by $K_{i,x}(t)=K_{i,x}[1+d_{i,x}t/1439]$. Select one solute uniformly,
  draw delay $D_S\sim U_{\mathbb Z}\{15,60\}$ min,
  $\alpha_S\sim U(0.05,0.25)$ and
  $K_S\sim\operatorname{logU}(0.2,5)$ mmol/min, and add
  $\alpha_SF_{i,x,t-D_S}K_S/(K_S+F_{i,x,t-D_S})$ to secretion, using
  $F_{i,x,u}=F_{i,x,0}$ for $u<0$. Select exactly
  $\max[1,\lfloor0.05N\rfloor]$ units by smallest
  `SHA256("ICP-v2|T04|shock|worldID|unitID")`; from minute 480 through 719,
  multiply all their solute recovery capacities by a shared
  $U(0.4,0.8)$ factor. For each assay, let
  $r_F=F_{i,x,t}/\max_{j,y}F_{j,y,t}$ and draw delay
  $\operatorname{clip}[\operatorname{round}(5+15r_F+\epsilon),0,30]$ min with
  $\epsilon\sim U(-3,3)$ and halves rounded away from zero. Select one pooled
  final concentration channel uniformly and multiply all its returned values by
  $1+\beta$, $\beta\sim U(-0.08,0.08)$. Latent truth and every other sensor are
  unchanged; draw order is drift, solute/path, shocked units/factor, assay
  delays, then offset channel/value.
- **Primary metric and terminal loss:** for each solute let
  $X_x^{24h}=\sum_{i,t}X_{i,x,t}\Delta t$ and
  $\Delta B_x=B_{x,1440}-B_{x,0}$. Freeze

  $$
  L_s=\sum_x\left(
  |\widehat X_x^{24h}-X_x^{24h}|+
  |\widehat{\Delta B}_x-\Delta B_x|
  \right)\quad[\mathrm{mmol}].
  $$

  The evaluator computes a seed-specific $L_s^{max}$ from total bounded input,
  filtered load, secretion capacity, and initial store before observations.
  Missing or non-finite output, an estimate outside that serialized material
  bound, arithmetic failure to close an arm's **declared** equations, or
  time-stamp leakage receives $L_s^{max}$. A's declared collapsed ledger sets
  final egress equal to filtered ingress and its omitted terms to zero; its
  discrepancy from latent recovery, secretion, excretion, or storage is scored
  by the primary and secondary errors and is never an automatic terminal loss.
  B versus A uses $r_4=0.25$.
- **Secondary metrics:** error in filtration, recovery, secretion, and daily
  excretion (mmol); concentration error (mmol/L); body-store interval coverage
  (%); oxygen-ledger error (mmol O$_2$); assay count and delay; CPU resources.
- **Inference and protected gates:** use the common cluster inference. B must
  achieve 97--100% coverage for registered 99% store intervals, relative mass
  closure below $10^{-8}$ in its declared typed ledger, and no worse daily
  excretion 95th-percentile error for any solute. All arms must have identical
  observation IDs and bytes. C must charge every fallback.
- **Fallback and stopping:** intersect every excretion interval with its
  serialized $[0,U_X]$ bound and every signed storage-change interval with its
  serialized $[-B_{x,0},U_I]$ bound. If the unbounded interval exceeded those
  limits or the bounded interval spans the complete feasible range, emit its
  midpoint for point scoring, label the output `unidentified`, and retain the
  complete bounded interval for coverage scoring. B/C then use the last closed
  ledger plus measured final egress; A continues its declared filtration proxy.
  A finite but wrong proxy is scored, not terminated. Only a non-finite
  estimator state, an output outside the serialized material bound, or temporal
  leakage terminates an arm with terminal loss. A truth-store violation is a
  generator rejection shared by all arms, not an arm loss.
- **Transfer interpretation:** a pass supports typed intermediate-versus-final
  accounting in the synthetic model. It is not a renal-function estimate, an
  oxygen-efficiency claim, or evidence that an assay schedule is medically
  adequate. If the pooled outlet directly identifies excretion in every world,
  the test is underchallenging and must be `INCONCLUSIVE`.
  Candidate 014 remains a separate central object; this audit neither replaces
  it nor turns a versioned observation contract into evidence of accuracy.
- **Artifacts:** `unit-parameters.parquet`, `observations.parquet`,
  `typed-ledger.parquet`, `assays.jsonl`, `closure.csv`,
  `seed-outcomes.jsonl`.

### ICP-T05 — Coupled delayed autoregulation

- **Claim tested:** proposed C-1492.
- **Scientific question:** can controllers with similar mean flow be separated
  by oscillation, transient deficit, stability, and integrated action exposure when fast and
  delayed feedback coexist?
- **Primary unit and units:** one 90 min delayed-control episode; time (s, min),
  pressure (kPa), flow (mL/min), integrated absolute flow error (mL), action
  exposure (kPa min), action total variation (kPa), and oscillation frequency
  (Hz).
- **Frozen plant DGP:** the truth step is 0.1 s. Draw target
  $q_0\sim U(0.5,2)$ mL/min, fast time constant
  $\tau_q\sim U(1,8)$ s, transport-state constant
  $\tau_x\sim U(3,20)$ s, myogenic gain $g_m\sim U(0.2,1.5)$ mL/min,
  delayed-feedback gain $g_t\sim U(0.2,2)$ mL/min, delay
  $d\sim U(2,20)$ s, and scales
  $s_q\sim U(0.05,0.2)q_0$, $s_x\sim U(0.05,0.2)q_0$. With history
  $q(t)=x(t)=q_0$ for $t\le0$,

  $$
  \tau_q\dot q=p(t)-q-g_m\tanh\frac{q-q_0}{s_q}
  -g_t\tanh\frac{x(t-d)-q_0}{s_x}+u(t),
  \qquad
  \tau_x\dot x=q-x.
  $$

  $p(t)$ has units mL/min in this dimensionally reduced plant; the separate
  pressure label belongs only to the actuator calibration below. Integrate by
  method-of-steps RK4 with linear history interpolation. A 0.05 s solution
  must change primary loss by below $10^{-5}$ relative on eight development cells.
- **Disturbances:** $p(t)=q_0+v(t)+s(t)+c(t)$. Every second,
  set $v_0=0$ and update
  $v_t=0.98v_{t-1}+U(-0.02,0.02)q_0$ clipped to $\pm0.2q_0$. Draw four
  non-overlapping steps, with start uniform in 5--80 min, duration
  $U(1,5)$ min, magnitude $U(0.1,0.5)q_0$, and sign from an independent fair
  Bernoulli draw; reject schedules entering the first or last 5 min. A 10 min
  chirp begins at an integer minute uniformly in 20--60, has amplitude
  $0.1q_0$, and sweeps linearly from 0.01 to 0.15 Hz.
- **Observations and actions:** observe $q$ and exogenous input $p$ every 1 s
  and $x$ every 2 s with 2% Gaussian SD and seed-level delay $U(0,2)$ s.
  Timestamps expose age. For controller input, extrapolate each variable from
  its two latest arrived readings with the unique straight line through their
  timestamps, clipped to $q,x\in[0,4q_0]$ and
  $p\in[0.2q_0,1.8q_0]$; before two readings have
  arrived use $q_0,q_0,q_0$ for $q,x,p$. No smoothing with later arrivals is
  allowed. At each 1 s decision append the three extrapolated values to an
  immutable causal state tape. To construct $x(t-d)$ or an MPC delay history,
  linearly interpolate the two tape entries bracketing the requested past time;
  use $q_0$ before time zero and never backfill the tape after a late arrival.
  The current controller state is exactly
  $(\widehat q_t,\widehat x_t,\widehat p_t)$ plus the preceding 30 s of that
  tape. Every 1 s choose actuator
  pressure $a\in[-2,2]$ kPa, rate-limited to 0.2 kPa/s; calibrated plant input is
  $u=k_aa$ with $k_a\sim U(0.1,0.4)$ (mL/min)/kPa. All arms receive the same
  calibration. The safety envelope is $q\in[0,4q_0]$; crossing it is retained as
  terminal failure.
- **Arms and mature null:** let $e_k=q_0-\widehat q_k$ and
  $\Delta t_c=1$ s. A is the frozen PI family

  $$
  I_k=\operatorname{clip}[I_{k-1}+e_k\Delta t_c,
  -20q_0\ \mathrm{s},20q_0\ \mathrm{s}],\qquad
  a_k=\operatorname{rateclip}
  \left[\frac{K_pe_k+(K_p/T_i)I_k}{k_a},-2,2,0.2\ \mathrm{kPa/s}\right],
  $$

  where $K_p\in\{0.5,1\}$ is dimensionless,
  $T_i\in\{10,40,\infty\}$ s, $K_p/T_i=0$ for $T_i=\infty$, $I_0=0$,
  and `rateclip` first clips amplitude and then change from the previous issued
  action; it has no unregistered anti-windup state. B is delay-aware robust MPC
  with the fully frozen objective and ambiguity set below. C composes
  P-002/P-006/P-007/P-009/P-012: a fast local damping loop, a delayed
  prediction-error estimator, and supervisor authority only when an estimated
  phase-margin guard is crossed. O knows latent parameters and future
  disturbance for 60 s; diagnostic only. B is the mature null. This track is a
  direct depth test of
  [Candidate 012](../../experiments/candidates/012-latency-qualified-authority.md):
  supervisory authority is conditioned on measured delay and margin.
- **Frozen tuning and robust-MPC program:** at $t=0,30,60,\ldots$ s B uses a
  30 s horizon with fifteen 2 s piecewise-constant action blocks; each planned
  block is amplitude/rate projected at the intervening 1 s plant actions. The
  parameter support is the eight-point fractional-factorial set indexed by
  $(r_1,r_2,r_3)\in\{-1,+1\}^3$:

  $$
  \tau_q=(1,8)_{r_1},\quad \tau_x=(3,20)_{r_2},\quad
  d=(2,30)_{r_3}\ \mathrm{s},\quad
  g_m=(0.14,1.95)_{r_1r_2},\quad
  g_t=(0.14,2.60)_{r_1r_3}\ \mathrm{mL/min},
  $$

  where $(l,h)_{-1}=l$ and $(l,h)_{+1}=h$.

  The exact calibrated $q_0,s_q,s_x,k_a$ are common inputs to every arm. For
  each point, use three causal disturbance continuations for $p-q_0$: the last
  extrapolated value held constant and constants $+0.4q_0$ and $-0.4q_0$.
  Linearise the augmented delay-tape dynamics at the reconstructed current
  state, discretize each scenario by fixed Padé-13 scaling-and-squaring matrix
  exponential, and form a convex epigraph QP. The 24 scenario paths have uniform
  nominal weight $\pi^0$. The
  ambiguity set is exactly

  $$
  \mathcal P=\{\pi:\pi_m\ge0,\sum_m\pi_m=1,
  \|\pi-\pi^0\|_1\le0.5\}.
  $$

  For issued path $a_{1:15}$, scenario $m$ has

  $$
  J_m=\sum_{\ell=1}^{15}\left[
  \frac{|q_{m,\ell}-q_0|\Delta t_c}{q_0H_p}
  +\lambda_E\frac{|a_\ell|\Delta t_c}{(2\ \mathrm{kPa})H_p}
  +\lambda_{TV}\frac{|a_\ell-a_{\ell-1}|}{4\ \mathrm{kPa}}
  \right]
  +\lambda_F\frac{|q_{m,15}-q_0|}{q_0},
  $$

  where $H_p=30$ s, $\Delta t_c=2$ s inside prediction, and $a_0$ is the last
  issued action. B minimises
  $\max_{\pi\in\mathcal P}\sum_m\pi_mJ_m$, subject to the written action, rate,
  and $q\in[0,4q_0]$ constraints in every scenario. Absolute values and the
  ambiguity maximum use epigraph variables. The convex QP uses deterministic
  primal-dual interior point iterations and analytic derivatives. Use exactly
  one start: the shifted previous feasible B rollout, or A's rollout on the
  first replan and after an infeasible prior plan. KKT tolerance is $10^{-8}$
  with 50 iterations, and canonical variable ordering resolves solver ties.
  Development executes exactly weight tuples
  $(0.001,0.01,0)$, $(0.01,0.01,0.1)$, $(0.01,0.1,0.1)$, and
  $(0.1,0.1,1)$ plus all six A gain pairs on the same 64 seeds. For each arm,
  retain candidates with zero
  envelope failures, then select lowest mean registered primary loss; B must
  additionally have mean integrated action exposure no more than 1.05 times
  selected A. Ties use the written ascending tuple, with $\infty$ last. If no
  candidate satisfies these rules, the track is invalid before confirmation.
  Selected gains, weights, ambiguity vertices, solver version, and all
  development losses are frozen in the manifest; transfer does not retune.
- **Transfer family:** draw $d_1\sim U(2,8)$ s, $d_2\sim U(15,30)$ s and integer
  switch second $T_D\sim U_{\mathbb Z}\{1200,4200\}$; use $d_1$ before $T_D$
  and $d_2$ thereafter. Draw terminal multipliers
  $m_m,m_t\sim U(0.7,1.3)$ and make $g_m,g_t$ drift linearly from their original
  values at time zero to those multiples at 5,400 s. Replace the chirp by
  $0.07q_0[\sin(2\pi f_1t+\phi_1)+\sin(2\pi f_2t+\phi_2)]$, with
  $f_1\sim U(0.005,0.02)$ Hz, $f_2\sim U(0.08,0.20)$ Hz, and independent phases
  $U(0,2\pi)$. From the complete observation manifest select exactly
  $\lfloor0.10N_{obs}\rfloor$ records by smallest
  `SHA256("ICP-v2|T05|late|worldID|observationID")`; add independent
  $U(1,5)$ s arrival delay while retaining their original measurement
  timestamps. Draw order is delays/switch, gain drifts, frequencies/phases,
  then late-record delays.
- **Primary metric and terminal loss:** integrate absolute deviation,

  $$
  L_s=\int_0^{90\ \mathrm{min}}|q(t)-q_0|\,dt\quad[\mathrm{mL}].
  $$

  Terminal loss is $L_s^{max}=4q_0\times90$ mL. Missing actions, non-finite
  state, envelope crossing, or use of future data receives that loss. B versus
  A uses $r_5=0.20$.
- **Secondary metrics:** episode mean flow (mL/min); maximum deviation
  (mL/min); power spectral peak and bandwidth (Hz); time outside $\pm10\%$ of
  target (min); integrated actuator exposure
  $\sum_k|a_k|(\Delta t_c/60\ \mathrm{s/min})$ (kPa min); actuator total variation
  $\sum_k|a_k-a_{k-1}|$ (kPa); stability-guard activations; CPU resources.
- **Inference and protected gates:** common inference applies. B must have no
  larger fraction of envelope failures, no more than 5% higher integrated
  actuator exposure,
  and lower 95th-percentile spectral power in 0.005--0.2 Hz. Equal episode mean
  cannot override those gates. Development reports by delay/gain quartile.
- **Fallback and stopping:** an infeasible or unbounded MPC solution invokes a
  frozen saturated proportional controller

  $$
  a_k=\operatorname{rateclip}
  \left[\frac{0.5(q_0-\widehat q_k)}{k_a},-2,2,
  0.2\ \mathrm{kPa/s}\right]\ \mathrm{kPa}
  $$

  for 30 s, after which replanning resumes. The factor 0.5 is dimensionless;
  division by $k_a$ converts mL/min error to kPa, so no dimensionless flow ratio
  is mistaken for pressure.
  Three fallbacks within 5 min hold $a=0$ for the rest of the episode and are
  charged. Envelope crossing terminates only that arm with terminal loss.
- **Transfer interpretation:** a pass supports delay- and dynamics-aware
  evaluation in this synthetic plant. It neither estimates rat renal dynamics
  nor proves that oscillations are harmful in every system. If all arms have
  equal dynamics because sampled gain is negligible, sensitivity is
  `INCONCLUSIVE`.
  Candidate 012 remains separately governed; a synthetic pass or failure here
  does not automatically promote or retire it.
- **Artifacts:** `plant.json`, `disturbances.parquet`, `observations.parquet`,
  `actions.parquet`, `spectra.csv`, `fallbacks.jsonl`,
  `seed-outcomes.jsonl`.

### ICP-T06 — Regional benefit versus global pulmonary cost

- **Claim tested:** proposed C-1493.
- **Scientific question:** can a rule that improves flow redistribution during
  sparse regional ventilation loss become ineffective or costly when the same
  trigger is widespread?
- **Primary unit and units:** one 4 h multicompartment gas-transfer episode;
  ventilation and perfusion (L/min), oxygen transfer and deficit (mmol),
  resistance (mmHg min/L), pressure (mmHg), and simulated pump work (J).
- **Frozen compartment DGP:** draw $N\sim U_{\mathbb Z}\{64,256\}$. Independent
  Dirichlet$(4,\ldots,4)$ vectors allocate total baseline ventilation
  $V_T\sim U(3,8)$ L/min and perfusion $Q_T\sim U(3,8)$ L/min. Draw oxygen
  coefficient $C_O\sim U(6,10)$ mmol/L and transfer-shape coefficient
  $\gamma\sim U(0.7,1.3)$. Regional transfer is the deliberately reduced
  surrogate

  $$
  g_i=C_O\min(V_i,\gamma Q_i)\quad[\mathrm{mmol/min}],
  $$

  not a clinical blood-gas model. Set baseline pump pressure
  $P_0=10$ mmHg and baseline resistance
  $R_{i,0}=P_0/Q_{i,0}$ mmHg min/L. An action chooses regional resistance
  multipliers $a_{i,t}\in[0.5,4]$ and shared pump pressure
  $p_t\in[0.5P_0,1.5P_0]$, giving

  $$
  Q_{i,t}=\frac{p_t}{a_{i,t}R_{i,0}},\qquad
  \sum_iQ_{i,t}\le1.5Q_T.
  $$

  The total-flow cap is a hard feasibility constraint, not a proportional
  renormalisation. At $a_i=1,p=P_0$ the exact baseline $Q_{i,0}$ is recovered;
  a common multiplier can still change total flow and pump cost, so it does not
  algebraically cancel out of the plant.
- **Exposure regimes:** select `regional` or `global` with equal probability.
  At minute 30 draw $f_E\sim U(0.10,0.30)$ for regional exposure or
  $f_E\sim U(0.70,1)$ for global exposure, set
  $K_E=\operatorname{clip}[\operatorname{round}(Nf_E),1,N]$ with halves away
  from zero, draw a start ID uniformly from $0,\ldots,N-1$, and select exactly
  the $K_E$ consecutive ring IDs beginning there modulo $N$. Ventilation in
  selected compartments is multiplied by $h\sim U(0.05,0.5)$ for
  $U_{\mathbb Z}\{30,150\}$ min and ramps back over 15 min. Baseline
  ventilation is fully frozen as follows. Draw one common phase
  $\phi_V\sim U(0,2\pi)$; set $r_{i,0}=0$ and each minute update

  $$
  r_{i,t}=\operatorname{clip}[0.92r_{i,t-1}+\eta_{i,t},-1,1],\qquad
  \eta_{i,t}\sim U(-0.08,0.08),
  $$

  then set
  $V^{base}_{i,t}=V_{i,0}[1+0.05\sin(2\pi t/60+\phi_V)+0.05r_{i,t}]$ L/min.
  Apply the exposure multiplier after this update; during recovery it changes
  linearly from $h$ to 1 over exactly minutes 1--15 following exposure.
  Draws are independent across $i,t$ and serialized. Compartments lie on a
  deterministic ring for cluster selection only; there is no anatomical
  inference.
- **Observations and actions:** noisy $V_i$ and $Q_i$ arrive every minute with
  3% SD and delay $U_{\mathbb Z}\{0,5\}$ min. Every minute choose $a_i$ and
  $p$. All arms receive the baseline $V_{i,0},Q_{i,0}$ and predictable common
  sinusoid phase $\phi_V$ before the episode; exposure state and AR innovations
  remain hidden. Resistance multipliers may change by at most 20% of their preceding
  value per minute and pressure by at most $0.1P_0$ per minute. Simulated pump
  work integrates $p_t\sum_iQ_{i,t}$ after the exact conversions
  1 mmHg = 133.322 Pa and 1 L/min = $10^{-3}/60$ m$^3$/s; it is secondary and
  cannot be called biological energy.
- **Arms and mature null:** before exposure, sort ring IDs and freeze four
  contiguous, as-equal-as-possible zones. A receives the same individual
  observations as every arm but its policy may retain only four zone sums and
  means. It solves the same 15 min scenario set, objective ordering, action
  bounds, and total-flow cap as B, but ties one $a_z$ across every member of a
  zone and evaluates transfer through the collapsed zone surrogate
  $C_O\min(\sum_{i\in z}V_i,\gamma\sum_{i\in z}Q_i)$. It chooses four $a_z$
  plus $p$, so it can change total flow and coarse redistribution but cannot
  see within-zone mismatch or target an individual compartment. B is a
  scenario-robust regional optimiser over the
  next 15 min, choosing all $a_i$ and $p$ to minimise transfer deficit then
  pump work, resistance-multiplier total variation, and pressure total
  variation under the common bounds and total-flow cap. C
  uses P-002/P-006/P-008/P-013: local low-$V_i/Q_i$ reflexes raise resistance,
  while a prevalence estimator disables uniform escalation and hands authority
  to a global pressure guard. O observes latent ventilation without delay and
  is diagnostic only. B is the mature null.
- **Transfer family:** draw two sizes independently by the regional rule above,
  each restricted to 10--20% of $N$. Draw the first ring start uniformly; draw
  the second uniformly from starts whose selected IDs are disjoint, rejecting
  after 10,000 attempts. At minutes 40,50,$\ldots$, advance both starts one ring
  ID clockwise; if sets would overlap, advance the second repeatedly until the
  first disjoint start, at most $N$ trials. Each cluster independently draws
  multiplier $h\sim U(0.05,0.5)$ and duration
  $U_{\mathbb Z}\{60,120\}$ min. Draw one observation multiplier
  $b_Q\sim U(0.95,1.05)$ and multiply every returned perfusion value, not truth,
  by $b_Q$. From minute 30 onward set the plant's baseline total perfusion to
  $0.8Q_T$ and recompute $R_{i,0}=P_0/(0.8Q_{i,0})$ without changing its
  Dirichlet shares. Draw fixed integer action latency
  $D_A\sim U_{\mathbb Z}\{3,8\}$ min; commands enter a FIFO and the command
  issued at $t$ becomes the rate-limited plant target at $t+D_A$. Initial FIFO
  entries are the baseline action. All other sinusoid/AR draws are unchanged.
- **Primary metric and terminal loss:** let
  $g_t^*=C_O\min(\sum_iV_{i,t},1.5\gamma Q_T)$ mmol/min be the declared
  action-independent whole-system availability ceiling under the total-flow
  cap. Freeze

  $$
  L_s=\sum_t(g_t^*-\sum_i g_{i,t})_+\Delta t\quad[\mathrm{mmol}].
  $$

  The finite terminal loss is $L_s^{max}=\sum_tg_t^*\Delta t$. Non-finite
  allocation, negative flow, total flow above $1.5Q_T+10^{-10}$ L/min,
  pressure or multiplier outside its bound, or oracle leakage receives terminal
  loss. B versus A uses $r_6=0.15$.
- **Secondary metrics:** regional and global stratum deficit (mmol); pressure
  (mmHg); effective resistance $p/\sum_iQ_i$ (mmHg min/L); total perfusion and
  perfusion reallocation (L); resistance-multiplier total variation
  (dimensionless); pressure total variation (mmHg); time above $1.4P_0$ (min);
  simulated pump work (J); CPU resources.
- **Inference and protected gates:** the common pooled inference is necessary
  but not sufficient. In the regional stratum B must reduce unshifted mean
  deficit; in the global stratum B must not increase mean deficit or pressure
  above A by more than 1% of their seed-specific maxima. Every regional flow
  must satisfy $Q_i=p/(a_iR_{i,0})$ and the total cap to $10^{-10}$ L/min. The
  same stratified gates apply to C versus B.
- **Fallback and stopping:** an infeasible interval or optimiser moves
  $a_i$ toward 1 and $p$ toward $P_0$ at the allowed rates. If that intermediate
  command exceeds the total-flow cap, multiply every proposed $a_i$ by the
  smallest common factor that restores equality, clipped at 4; failure to find
  a feasible command assigns terminal loss. Pressure outside its written bound
  or any negative flow
  terminates that arm with terminal loss. Fallback duration and lost transfer
  remain charged.
- **Transfer interpretation:** this is a regional-versus-global control
  counterexample, not a lung model, clinical claim, or proposed therapy. A
  pooled win driven entirely by one exposure stratum fails. If the reduced gas
  surrogate cannot distinguish spatial allocation, the track is `INVALID`,
  because the intended mechanism was removed from the DGP.
- **Artifacts:** `compartments.json`, `exposure.parquet`,
  `ventilation-perfusion.parquet`, `pressure.csv`, `actions.parquet`,
  `fallbacks.jsonl`, `seed-outcomes.jsonl`.

### ICP-T07 — Predictive regulation, forecast value, and cumulative cost

- **Claim tested:** proposed C-1494.
- **Scientific question:** does anticipatory capacity improve service only when
  a cue has prospective value, and can the controller stop spending when that
  value disappears and prospectively recalibrate when its polarity reverses?
- **Primary unit and units:** one 90 d resource-regulation world at 1 h
  resolution; demand and capacity (capacity units, CU), deficit and reserve debit
  (CU h), action level and total variation (CU), integrated action exposure
  (CU h), and recovery time (h).
- **Frozen demand DGP:** draw baseline $b\sim U(50,100)$ CU and phases
  $\phi_d,\phi_w\sim U(0,2\pi)$. Bounded ordinary demand is

  $$
  d_t^{base}=b\left[1+0.15\sin(2\pi t/24+\phi_d)
  +0.10\sin(2\pi t/168+\phi_w)+0.05z_t\right],
  $$

  where $z_0=0$ and
  $z_t=\operatorname{clip}[0.9z_{t-1}+U(-0.25,0.25),-1,1]$ for $t\ge1$.
  Initialise $e_0\sim\operatorname{Bernoulli}(3/28)$, the stationary event
  probability, and for $u=0,\ldots,2164$ generate $e_{u+1}$ in temporal order
  with $P(e_{u+1}=1\mid e_u=0)=0.03$ and
  $P(e_{u+1}=0\mid e_u=1)=0.25$. Thus states through $e_{2165}$ exist before
  the final six-hour cue is emitted. If $e_0=1$, or whenever
  $e_t=1,e_{t-1}=0$, draw one event amplitude $A_t\sim U(0.25,0.60)$; hold it
  unchanged through that complete contiguous event. During an event demand
  gains $bA_t$. Total demand for $t=0,\ldots,2159$ is clipped to
  $[0.5b,2b]$ CU. Block order is fixed prospectively: hours $[0,720)$ are
  `informative`, $[720,1440)$ are `uninformative`, and $[1440,2160)$ are
  `inverted`. Arms receive neither labels nor transition notifications. Policy
  review forbids absolute episode hour or day as a feature or a block-keyed
  constant; only the cyclic calendar signals declared below may enter, so the
  fixed evaluation order cannot become a hidden schedule.
- **Cue process:** at issue hour $t=0,\ldots,2159$, let $s_t$ be 0.85 in the
  informative block, 0.50 in the uninformative block, and 0.15 in the inverted
  block. Generate a provisional cue about $e_{t+6}$ by
  $P(c_t=1\mid e_{t+6}=1)=s_t$ and
  $P(c_t=0\mid e_{t+6}=0)=s_t$; draw this Bernoulli value first and then an
  independent dropout flag with probability 0.05. A dropout replaces the value
  by an explicit missing token rather than zero. Arms see only verified past
  events and issued cues; block labels and cue
  skill are evaluator-only. A separate always-observed calendar signal exposes
  hour of day and day of week, preventing a forecast arm from receiving a
  hidden scheduling advantage.
- **Plant and actions:** set $\Delta t=1$ h. Installed baseline capacity is
  $1.05b$ CU. A fast order $f_t\in[0,0.35b]$ CU is issued at hour end $t$ and
  supplies exactly $f_t$ CU during hour $t+1$. An anticipatory order
  $a_t\in[0,0.35b]$ CU is issued at $t$ and supplies exactly $a_t$ CU during
  hour $t+6$. Delivered service is
  $y_t=\min(d_t,1.05b+f_{t-1}+a_{t-6})$. Let
  $u^a_t=\min[a_{t-6},(d_t-1.05b-f_{t-1})_+]$ be anticipatory capacity used.
  At hour end, 70% of $a_{t-6}-u^a_t$ returns and the rest expires. Reserve
  starts and caps at $H_{max}=2b\ \mathrm{CU\,h}$ and updates by

  $$
  h_{t+1}=\min\left[H_{max},h_t-(f_t+a_t)\Delta t
  +0.03b\Delta t+0.7(a_{t-6}-u^a_t)\Delta t\right].
  $$

  Actions are feasible only when $(f_t+a_t)\Delta t\le h_t$. Every deduction,
  use, expiry, replenishment, and return is a CU h ledger row; order and active
  levels remain CU. Define $f_t=a_t=0$ for every negative index.
- **Observations:** the end-of-hour order is fixed: service occurs; cue $c_t$
  arrives; each arm forecasts and commits $f_t,a_t$ using demand/event records
  only through $t-1$ plus cues through $t$; then noisy demand $d_t$ (2% Gaussian
  SD) and exact verification $e_t$ are released. Delivery and reserve are exact.
  The new demand/event pair can update only decisions from $t+1$ onward and can
  calibrate cue $c_{t-6}$ only after its target is known. At $t=0$ the event
  filter starts from the stationary prior $3/28$. Forecast intervals are scored
  before the matching demand is revealed.
- **Arms and mature null:** A is a reactive PI reserve controller with
  calendar-only feedforward and sets $a_t=0$. B is distributionally robust MPC
  with a 48 h horizon, calibrated probabilistic event model, online cue-skill
  interval, reserve dynamics, and actions for direct cue $c_t$, inverted cue
  $1-c_t$, or cue abstention. Only outcomes already revealed may update those
  alternatives. C composes P-006/P-007/P-012: it separately estimates the
  prospective value of direct and inverted cue mappings, spends anticipatory
  capacity only when the larger mapping's lower confidence bound is positive,
  and otherwise falls back to the same reactive controller as A. Thus an
  inverted cue is a learnable signal after prospective recalibration, not an
  instruction to disengage forever. O knows the next
  48 h demand and is diagnostic only. B is the mature null.
- **Transfer family:** draw daily period $P_d$ uniformly from $\{20,28\}$ h and
  replace 24 by $P_d$ in the ordinary-demand sinusoid. Draw one fixed cue lead
  $L_c\sim U_{\mathbb Z}\{2,12\}$ h and generate terminal event states through
  $e_{2159+L_c}$. Conditional dropout probability is 0.15 when the target event
  equals one and 0.02 otherwise. Replace event offset probability 0.25 by 0.50
  and multiply each onset amplitude by two before the common $2b$ demand clip.
  At issue hours 1440--1679 set cue sensitivity and specificity to
  $0.50-(0.35)(t-1440)/239$, then hold both at 0.15. Every other draw and update
  order is the confirmation rule above. The
  charged recalibration window for this transfer intervention is those 240 h;
  its post-recalibration gate uses the remaining 480 h.
- **Primary metric and terminal loss:** service debt is

  $$
  L_s=\sum_t(d_t-y_t)_+\Delta t\quad[\mathrm{CU\,h}].
  $$

  Since $d_t\le2b$, finite terminal loss is
  $L_s^{max}=90\times24\times2b$ CU h. Negative reserve, future-demand leakage,
  infeasible action, or missing output receives terminal loss. B versus A uses
  $r_7=0.15$.
- **Secondary metrics:** deficit by cue block (CU h); integrated fast and
  anticipatory exposure $\sum_tf_t\Delta t$ and $\sum_ta_t\Delta t$ (CU h);
  fast and anticipatory command total variation (CU); gross reserve debit
  $\sum_t(f_t+a_t)\Delta t$ (CU h); minimum reserve (CU h); unused
  anticipatory capacity and returned reserve (CU h); forecast Brier score and
  interval score; recovery to 90% reserve (h); CPU resources. These remain
  separate; none is labelled biological allostatic load.
- **Inference and protected gates:** common pooled inference applies. B must
  reduce unshifted mean deficit in informative blocks; in uninformative blocks
  it must not increase mean deficit or gross reserve debit by more than 1% of
  their seed maxima. The first 72 h of the inverted block is a charged
  prospective recalibration window, not discarded burn-in. Over the remaining
  648 h, B must reduce unshifted mean deficit versus A, select the inverted
  mapping on more than 80% of non-missing cues, and improve prospective Brier
  score over the event-base-rate forecast. C must be non-inferior to B within
  1% of the relevant seed maximum on each block gate in addition to its common
  selected novelty route. Direct, inverted, and abstention forecast calibration
  is assessed from predictions timestamped before outcomes.
- **Fallback and stopping:** when a forecast interval is unbounded, both
  direct- and inverted-mapping value lower bounds are non-positive, or reserve
  projection crosses zero, set $a_t=0$ and use A's reactive action for at least
  6 h. A second failure during
  that window extends fallback another 6 h. Negative reserve or an action above
  its bound terminates the arm at terminal loss.
- **Transfer interpretation:** a pass establishes prospective cue value only in
  the written synthetic process. It does not validate a universal allostasis
  model or a scalar burden biomarker. A controller that helps only after
  hindsight block labels fails; B/C parity retires C's extra gate.
- **Artifacts:** `demand.parquet`, `cues.parquet`, `forecast.jsonl`,
  `actions.parquet`, `reserve-ledger.csv`, `block-outcomes.csv`,
  `seed-outcomes.jsonl`.

### ICP-T08 — Synchrony, common drive, coupling, and function

- **Claim tested:** proposed C-1495.
- **Scientific question:** can a high phase-coherence score be dissociated from
  direct coupling and useful demand tracking under common input and edge
  interventions?
- **Primary unit and units:** one seed containing four cloned 10 min
  coupled-oscillator cells; time (s),
  phase (rad), frequency and control (rad/s), flow-like output (mL/min),
  integrated tracking error (mL), and message count/bytes.
- **Frozen graph and oscillator DGP:** draw
  $N\sim U_{\mathbb Z}\{24,96\}$. Begin with a bidirectional ring and add, for
  each node, two stable-hash-selected non-neighbour edges; deduplicate edges.
  Natural frequencies are
  $\omega_i\sim U(0.03,0.12)$ rad/s. Initial phases are uniform on
  $[0,2\pi)$. Edge coupling $K_{ij}\sim U(0.001,0.03)$ s$^{-1}$. At 0.05 s truth
  resolution,

  $$
  \dot\theta_i=\omega_i+A_c\sin(\omega_ct+\phi_c)
  +\sum_jK_{ij}\sin(\theta_j-\theta_i)+u_i,
  $$

  where common-drive amplitude is zero with probability 0.5 and otherwise
  $A_c\sim U(0.005,0.04)$ rad/s, with
  $\omega_c\sim U(0.03,0.12)$ rad/s and $\phi_c\sim U(0,2\pi)$.
- **Functional target:** output is
  $q_i=q_{0,i}+a_i\sin\theta_i$, where
  $q_{0,i}\sim U(0.5,2)$ and $a_i\sim U(0.05,0.3)q_{0,i}$ mL/min. Target is
  $d_i=q_{0,i}+a_i\sin(\bar\omega t+\psi_i)$. Select target regime uniformly:
  `aligned` draws $\psi_i$ from a wrapped normal with circular SD 0.1 rad;
  `two-cluster` centres equal stable-hash groups at 0 and $\pi$ with SD 0.1;
  `dispersed` uses evenly spaced phases plus $U(-0.1,0.1)$ rad. Thus synchrony
  can help, harm, or be neutral depending on the declared task rather than by
  definition.
- **Equal observations and byte contract:** every arm knows the declared target
  frequency $\bar\omega=N^{-1}\sum_i\omega_i$ and its own target phase $\psi_i$,
  and observes own phase/output every 0.1 s. Before each clone begins, A/B/C
  receive the identical directed adjacency list, nominal $K_{ij}$ table, active
  physical table $K^{P}_{ij}=PK_{ij}$, and the $P,M$ intervention flags. No arm
  receives future common drive or target state. Exactly 3,000 communication ticks
  occur at $t=0,0.2,\ldots,599.8$ s in each cell. At every tick every node
  receives a 24-byte global packet: timestamp (8 bytes), noisy circular mean
  phase (8 bytes), and noisy $R$ (8 bytes). Every directed graph edge also
  carries one 32-byte neighbour packet: timestamp (8), sender ID (4), flags
  (4), noisy phase (8), and noisy output (8). Phase and output noise have SD
  0.03 rad and 2% of output; packet delay is $U(0,0.3)$ s and serialized once
  for all arms. A/B/C receive byte-identical global, neighbour, own-sensor, and
  target streams within each cell. Arms choose
  $u_i\in[-0.04,0.04]$ rad/s every 0.2 s, rate-limited to 0.01 rad/s per action.
  The noisy own-sensor sample timestamped $t=0$ is delivered before the first
  action; own sensors have zero transport delay, while packet delays remain as
  written.
- **Factorial causal intervention:** each seed runs four reset clones in
  canonical order $(P,M)=(0,0),(0,1),(1,0),(1,1)$. All clones reuse the exact
  initial phases, natural frequencies, common drive, target path, observation
  noise, packet delays, and controller initial state. $P=1$ retains the
  physical $K_{ij}\sin(\theta_j-\theta_i)$ terms and $P=0$ sets only those
  physical coefficients to zero. $M=1$ reveals neighbour payloads and $M=0$
  replaces them with the registered masked flag and zero payload; the 32-byte
  packets are still sent and charged. Global packets remain informative in all
  four cells. Thus physical coupling and communication edges are separately
  intervened, while every arm has the same global-phase information and byte
  budget. The four cells remain one seed cluster, never four inferential units.
- **Causal phase reconstruction:** each own, neighbour, and global-phase stream
  keeps its own unwrapped state. For the first non-missing sample use its
  representative in $[0,2\pi)$. For every later wrapped sample $w$ at timestamp
  $\tau$, choose integer branch $k$ minimizing
  $|w+2\pi k-\theta^{pred}(\tau)|$, breaking equal distances toward smaller
  $k$. Before two samples, $\theta^{pred}$ advances the prior sample at the
  known natural frequency (global phase uses $\bar\omega$); thereafter it uses
  the slope through the two latest samples, clipped to $[-0.20,0.20]$ rad/s.
  At an action time extrapolate that same clipped slope to now, never backward
  through a later arrival. Masked packets do not update state. A neighbour
  stream older than 0.6 s is unavailable. All A/B/C policies use these
  reconstructed phases, never latent phase or arrival-order wrapping.
- **Arms and mature null:** A phase-locks every node to a global mean phase and
  explicitly maximises $R$. B is distributed receding-horizon tracking control
  over the known graph with no synchrony term and robust packet delay; it may
  ignore but never add packets. C uses P-006/P-011/P-013: transient
  neighbour-conditioned control terms are admitted only when a
  development-frozen counterfactual predicts lower functional loss than
  own-target control; a term expires after 10 s without renewed evidence. These
  controller terms do not create or remove the physical $K_{ij}$ coefficients
  or the fixed packet edges. O sees future common drive for 5 s; diagnostic
  only. B is the mature functional-control null.
- **Transfer family:** replace the graph by a Barabási--Albert construction:
  start nodes 0--2 as a bidirectional triangle and add each later node in ID
  order with two distinct existing neighbours sampled without replacement with
  probability proportional to current undirected degree; add both directed
  arcs. Draw each natural frequency from `low` $U(0.03,0.06)$ or `high`
  $U(0.09,0.12)$ rad/s after an independent fair component draw. Select exactly
  $\max[1,\lfloor0.20|E_{dir}|\rfloor]$ directed edges by smallest
  `SHA256("ICP-v2|T08|mask|worldID|edgeID")`. Per clone draw six non-overlapping
  burst starts uniformly from integer seconds 30--570 with durations
  $U_{\mathbb Z}\{5,20\}$ s; mask payloads on those selected edges during each
  half-open burst while still sending and charging every packet. Draw the first
  target regime uniformly and the post-300 s regime uniformly from the other
  two; regenerate its $\psi_i$ by the registered regime rule and change it
  exactly at $t=300$ s. When common drive is present, replace constant frequency
  by $\omega_c(t)=0.03+0.09t/600$ rad/s and evaluate its phase as
  $\phi_c+0.03t+(0.09/1200)t^2$. Draw order is graph, mixture/frequencies,
  masked edges, bursts, target regimes/phases, then the ordinary clone streams.
- **Primary metric and terminal loss:** functional error averages the four
  factorial cells,

  $$
  L_s=\frac14\sum_{P=0}^1\sum_{M=0}^1
  \sum_i\int_0^{10\ \mathrm{min}}|q_i^{P,M}(t)-d_i(t)|dt
  \quad[\mathrm{mL}].
  $$

  With $|q_i-d_i|\le2a_i$ for finite phases, terminal loss is
  $L_s^{max}=\sum_i2a_i\times10$ mL. Non-finite phase, action violation,
  message-budget violation, or future-target leakage receives terminal loss. B
  versus A uses $r_8=0.15$.
- **Secondary metrics:** $R$ and local edge coherence (dimensionless);
  functional error by phase regime and $(P,M)$ cell (mL); integrated action
  exposure (rad); action total variation (rad/s); messages and bytes; correlated
  envelope failures; and the preregistered physical main effect
  $\tfrac12[(L_{1,0}-L_{0,0})+(L_{1,1}-L_{0,1})]$, communication main effect
  $\tfrac12[(L_{0,1}-L_{0,0})+(L_{1,1}-L_{1,0})]$, and interaction
  $(L_{1,1}-L_{1,0})-(L_{0,1}-L_{0,0})$, all in mL and stratified by
  common-drive present/absent; CPU resources.
- **Inference and protected gates:** common pooled inference applies. B must
  reduce unshifted mean functional error in `two-cluster` and `dispersed`
  regimes and be non-inferior within 1% of $L_s^{max}$ in `aligned` worlds. The
  physical main effect must not be reported as communication, the communication
  main effect must not be reported as physical coupling, and neither may be
  pooled across the registered common-drive strata without both stratum
  estimates. Packet counts and bytes must be exactly equal for A/B/C in every
  cell. Because communication bytes are experimentally fixed, C may select only
  the common primary-loss novelty route, not a message- or byte-saving route.
- **Fallback and stopping:** a stale or missing neighbour set disables the
  neighbour-conditioned controller term and uses bounded own-target
  proportional control

  $$
  u_i=\operatorname{clip}[0.5\operatorname{wrap}(\bar\omega t+\psi_i-\widehat\theta_i),-0.04,0.04]
  \quad[\mathrm{rad/s}].
  $$

  The received global packet remains recorded but is not imputed into this
  fallback. A phase integration error above
  $10^{-6}$ relative on the half-step cell or an action violation terminates the
  arm with terminal loss.
- **Transfer interpretation:** a pass supports the functional/common-input
  rejection boundary, not a claim that nephron synchrony is good or bad. High
  $R$ without task gain counts against A; low $R$ with good tracking is not a
  failure. If edge and common-drive interventions are underpowered, the causal
  component is `INCONCLUSIVE` even if performance differs.
- **Artifacts:** `oscillator-graph.json`, `targets.parquet`,
  `phases.parquet`, `messages.parquet`, `interventions.jsonl`,
  `functional-outcomes.csv`, `seed-outcomes.jsonl`.

### ICP-T09 — Fast regulation versus slow structural adaptation

- **Claim tested:** proposed C-1496.
- **Scientific question:** can an explicit two-timescale controller avoid both
  fast-action debt and stranded slow capacity across persistent demand and
  regime reversal?
- **Primary unit and units:** one 120 d spatial-capacity episode at 1 h
  resolution; capacity and demand (CU), deficit (CU h), fast action (CU),
  fast reserve and integrated active exposure (CU h), structural capacity (CU),
  build/carry/reversal cost (cost units), and recovery time (h).
- **Frozen spatial demand DGP:** draw $N\sim U_{\mathbb Z}\{16,32\}$ nodes on the
  same connected radial-DAG construction as ICP-T01, but use only adjacency for
  movement of hotspots. Baseline capacity $c_{i,0}\sim U(40,100)$ CU and
  baseline demand is $0.7c_{i,0}$. For each node draw
  $A^d_i,A^w_i\sim U(0.05,0.15)$ and
  $\phi^d_i,\phi^w_i\sim U(0,2\pi)$. Set $r_{i,0}=0$ and update hourly

  $$
  r_{i,t}=\operatorname{clip}[0.95r_{i,t-1}+\eta_{i,t},-0.1,0.1],\qquad
  \eta_{i,t}\sim U(-0.02,0.02),
  $$

  with independent serialized innovations. Ordinary demand is

  $$
  d^{ord}_{i,t}=0.7c_{i,0}\left[1+A^d_i\sin(2\pi t/24+\phi^d_i)
  +A^w_i\sin(2\pi t/168+\phi^w_i)+r_{i,t}\right].
  $$

  Persistent-hotspot static draws use PCG64-DXSM stream
  `SHA256("ICP-v2|T09|persistent|worldID")`. Consume, in order, start day
  $T_H\sim U_{\mathbb Z}\{5,15\}$, fraction $f_H\sim U(0.10,0.25)$, initial
  centre index $I_0\sim U_{\mathbb Z}\{0,N-1\}$, amplitude
  $a_H\sim U(0.3,0.7)$, reversal day
  $T_R\sim U_{\mathbb Z}\{45,65\}$, reversal-centre uniform $u_R\in[0,1)$, and
  post-reversal amplitude $a_R\sim U(0.3,0.7)$. Set
  $K_H=\operatorname{clip}[\operatorname{round}(Nf_H),2,N]$, rounding halves
  away from zero. The initial centre is the zero-based $I_0$th entry of the
  ascending node-ID list; set
  `residenceID=0`. Include that centre, then grow an exactly $K_H$-node
  connected set by repeatedly selecting from the current graph frontier the
  node with smallest
  `SHA256("ICP-v2|T09|grow|worldID|residenceID|nodeID")`; recompute the
  frontier after each insertion. Amplitude $a_Hc_{i,0}$ applies to every current
  member for every hour and every residence before reversal.

  Residence $r$ uses independent stream
  `SHA256("ICP-v2|T09|residence|worldID|r")`: first draw
  $D_{H,r}\sim U_{\mathbb Z}\{3,10\}$ complete days, then movement uniform
  $u_r\sim U[0,1)$. At its boundary form the ascending adjacent-node list
  $\mathcal A_r$, remove the immediately previous centre when at least one other
  neighbour remains, select zero-based index
  $\lfloor u_r|\mathcal A_r|\rfloor$, move by that single graph hop, increment
  `residenceID`, and regrow the same-sized connected set. Truncate the final
  pre-reversal residence at $T_R$. Immediately before reversal, rank all nodes
  by descending shortest-path distance to the old set, then ascending node ID,
  and take the first $\lceil N/4\rceil$ as the exact farthest quartile. Select
  index $\lfloor u_R\lceil N/4\rceil\rfloor$, then grow exactly $K_H$ connected
  nodes by choosing each frontier node with greatest distance from the old set,
  ties by the same grow hash. Amplitude $a_Rc_{i,0}$ applies uniformly to every
  member and later residence. Post-reversal residence IDs continue from the
  prior value and use the same labelled duration/movement rule.

  Draw 12 transient bursts from
  `SHA256("ICP-v2|T09|bursts|worldID")` in burst-ID order: duration
  $U_{\mathbb Z}\{2,24\}$ h, start hour uniform on
  $\{0,\ldots,H-\mathrm{duration}\}$, centre index into ascending node IDs, and
  amplitude $U(0.10,0.40)c_{i,0}$ at the centre and one half that amount at its
  direct graph neighbours. Bursts may overlap. Add persistent-hotspot and burst amounts
  to $d^{ord}$, then clip final demand to $[0.2c_{i,0},2c_{i,0}]$ CU. The
  unclipped components and clipped total are all serialized.
- **Fast order, activation, expiry, and reserve:** let $\Delta t=1$ h and
  $H_{max}=H_0=0.25\sum_ic_{i,0}$ CU h. At the end of hour $t$, an arm may issue
  non-negative order $o_{i,t}$ CU. It first becomes active at the start of
  hour $t+1$, remains active for exactly the six service hours
  $t+1,\ldots,t+6$, and expires before service at $t+7$. With $o_{i,t}=0$ for
  $t<0$, active fast state is therefore

  $$
  f_{i,t}=\sum_{\tau=\max(0,t-6)}^{t-1}o_{i,\tau},\qquad
  f_{i,t+1}=f_{i,t}-o_{i,t-6}+o_{i,t}.
  $$

  Every prospective active state must satisfy
  $f_{i,t+1}\le0.15c_{i,0}$ and
  $\sum_if_{i,t+1}\le0.15\sum_ic_{i,0}$. Issuing an order debits its complete
  six-hour exposure up front: it is feasible only when
  $6\ \mathrm{h}\sum_io_{i,t}\le h_t$, and the hourly reserve transition is

  $$
  h_{t+1}=\min\left[H_{max},h_t-
  6\ \mathrm{h}\sum_io_{i,t}+0.02H_{max}\right].
  $$

  Expiry returns no reserve. “Renewal” means issuing an ordinary new order,
  paying its new six-hour debit, and receiving a new activation and expiry ID;
  no state silently persists. An accepted fast order cannot be cancelled or
  shortened. Each hour executes in this exact order: complete due slow removals
  and then builds by ascending order ID; expire fast packets whose six service
  hours ended; activate eligible fast orders; expose the written delayed
  observations; deliver service; choose fast and, when due, structural orders;
  validate all caps and exclusions; charge accepted structural orders and debit
  accepted fast orders; add $0.02H_{max}$; then enqueue accepted orders. Every
  order, activation, service hour, expiry, debit, and replenishment is a
  versioned event.
- **Slow state, queues, removal, and cost:** structural decisions occur only at
  the end of hours $t$ with $(t+1)\bmod24=0$. At a decision an arm may issue
  build order $b^+_{i,t}\in[0,0.5c_{i,0}]$ CU or removal order
  $b^-_{i,t}\in[0,z_{i,t}]$ CU, never both at one node. Draw one fixed build
  delay $\delta_i\sim U_{\mathbb Z}\{3,14\}$ d per node; accepted build
  completes at the start of hour $t+1+24\delta_i$. Removal completes at the
  start of hour $t+1+168$ h in development and confirmation and
  $t+1+720$ h in transfer.
  A node with any queued removal accepts no build, and a node with any queued
  build accepts no removal. Installed plus queued build may not exceed
  $c_{i,0}$; queued removal may not exceed installed $z_{i,t}$. At a completion
  timestamp, process removals first, then builds, each by ascending order ID.
  Removed capacity returns no fast reserve or build credit. Installed state
  starts at $z_{i,0}=0$, changes only on completion events, and otherwise
  persists.

  Structural cost has explicit coefficients
  $\kappa_+=1$ cost unit/CU,
  $\kappa_-=0.5$ cost unit/CU, and
  $\kappa_c=0.01$ cost unit/(CU day):

  $$
  C_{struct}=\kappa_+\sum_{i,t}b^+_{i,t}
  +\kappa_-\sum_{i,t}b^-_{i,t}
  +\kappa_c\sum_{i,t}z_{i,t}(\Delta t/24\ \mathrm{h/day}).
  $$

  Only accepted orders enter the first two sums and are charged at acceptance;
  the carry row uses installed state after start-of-hour completions and before
  that hour's service.

  Delivered service is
  $y_{i,t}=\min(d_{i,t},c_{i,0}+z_{i,t}+f_{i,t})$. Every order, queue,
  completion, installed-state change, carry charge, service amount, and removal
  is versioned; rejected orders are logged with their violated bound.
- **Observations and forecast object:** node demand and service arrive hourly
  with 3% Gaussian SD and integer delay $U_{\mathbb Z}\{0,3\}$ h. Build state
  and reserve are exact. At each daily structural boundary, before decisions,
  an external forecaster serializes a 336 h object. Its ordinary-demand path uses
  the written daily/weekly terms at $t+h$ and holds the current $r_{i,t}$ fixed.
  Represent every persistent-hotspot residence and every transient burst as an
  event $e$ with its frozen node-amplitude vector, start, and duration. For each
  event intersecting the horizon, draw

  $$
  A_{e,t}=\exp(0.3Z_{e,t}-0.5(0.3)^2),\qquad
  \Delta_{e,t}=\operatorname{round}(24Z'_{e,t})\ \mathrm{h},
  $$

  where $Z,Z'$ are independent standard normals from PCG64-DXSM label
  `SHA256("ICP-v2|T09|forecast|worldID|issueHour|eventID")` and consecutive
  canonical draws. Multiply the event amplitude by $A_{e,t}$, shift its start
  by $\Delta_{e,t}$, add all active shifted events to the held-AR ordinary path,
  and clip to $[0.2c_{i,0},2c_{i,0}]$. The object contains that point path, the
  event decomposition, and the declared conditional error law: independent
  mean-one lognormal amplitude error with log-SD 0.3 and integer-rounded onset
  error $N(0,(24\ \mathrm{h})^2)$. At every hour, including non-boundaries, it
  additionally serializes only a next-hour type-7 0.90 quantile from exactly 32
  conditional scenarios generated in scenario, event, amplitude, then onset
  order with PCG64-DXSM label
  `SHA256("ICP-v2|T09|forecast-quantile|worldID|issueHour")`. All arms receive
  the byte-identical object; it is issued before future observations and no arm
  receives the uncorrupted event schedule.
- **Arms and mature null:** A uses the frozen fast receding-horizon **order**
  rule and never changes $z$; its state includes all six outstanding order
  cohorts. B uses the identical hourly rule plus the frozen daily
  scenario-screened structural planner in the registry. C uses
  P-005/P-009/P-012: local evidence estimates excess-demand lifetime and admits
  slow structure only when its lower lifetime bound exceeds build plus payback
  time; otherwise it uses the same fast-order rule, and every structural state
  carries a retirement test. O is only the evaluator's perfect-service
  reference $y^O=d$; it has no policy actions or charged costs. B is the mature
  null.
- **Transfer family:** replace the single reversal by
  $T_{R,1}\sim U_{\mathbb Z}\{25,35\}$ d and
  $T_{R,2}=T_{R,1}+U_{\mathbb Z}\{25,35\}$ d. At reversal $j$, freeze the
  departing set at hour $24T_{R,j}-168$. Rank every node by descending
  shortest-path distance to that set, then ascending node ID; the first
  $\lceil N/4\rceil$ nodes are the exact farthest quartile. Draw the destination
  centre uniformly from that ordered list with
  `SHA256("ICP-v2|T09|transfer-centre|worldID|j")`. Grow an exactly $K_H$-node
  connected destination from that centre by repeatedly taking the frontier node
  with greatest distance from the departing set, ties by the smallest
  `SHA256("ICP-v2|T09|transfer-grow|worldID|j|nodeID")`. Draw its amplitude
  $a_{H,j}\sim U(0.3,0.7)$ from the same labelled stream after the centre draw.
  During the 168 h ending at reversal, both sets remain fixed and their
  amplitude weights are respectively $1-w_t$ and $w_t$, where
  $w_t=\operatorname{clip}[(t-(24T_{R,j}-168))/168,0,1]$. At the reversal the
  departing set is deleted, the destination obtains full $a_{H,j}$ amplitude,
  and fresh residence durations and centre moves resume by the base rule. Thus
  hotspot size, membership, movement, residence scope, and amplitude are all
  serialized rather than inferred by a policy.
  Draw common build delay $\delta_c\sim U_{\mathbb Z}\{3,14\}$ d and set
  $\delta_i=\operatorname{clip}[\delta_c+U_{\mathbb Z}\{-2,2\},3,14]$ d in node
  order. Removal takes 720 h. Multiply the forecaster's event-amplitude point
  marks by 1.2 before $T_{R,1}$, 0.8 between reversals, and 1.2 thereafter; its
  declared error law is unchanged. From $T_{R,1}+14$ d through the next 14 d,
  only $0.9z_{i,t}$ is service-available at every node, while accounting and
  carry cost retain the complete installed state. Both reversals use the frozen
  stranding/recovery rules below.
- **Primary metric and terminal loss:** service debt is

  $$
  L_s=\sum_{i,t}(d_{i,t}-y_{i,t})_+\Delta t\quad[\mathrm{CU\,h}].
  $$

  The written demand bounds give
  $L_s^{max}=\sum_{i,t}d_{i,t}\Delta t$, computed before observation release.
  Negative reserve, activation outside its serialized six service hours,
  capacity before build completion, order or active state above bounds, missing
  service, or future leakage receives terminal loss. B versus A uses
  $r_9=0.15$.
- **Stranding and recovery definitions:** for each reversal at hour $T_R$, let
  $H_{old}$ be the nodes carrying the departing persistent hotspot immediately
  before reversal and let $T_{30}=\min(T_R+720,H)$, where $H$ is episode end.
  Write $q^+_{i,t}$ and $q^-_{i,t}$ for the total accepted, not-yet-completed
  build and removal amounts at the start of hour $t$. Define committed slow
  capacity as $z^{committed}_{i,t}=[z_{i,t}+q^+_{i,t}-q^-_{i,t}]_+$. Let
  $q_{i,.95}$ be the type-7 linearly interpolated empirical 95th percentile of realized
  demand at node $i$ over hours $[T_R,T_{30})$. Stranded capacity is

  $$
  S_{strand}(T_R)=\sum_{i\in H_{old}}
  [z^{committed}_{i,T_{30}}-(q_{i,.95}-c_{i,0})_+]_+\quad[\mathrm{CU}].
  $$

  For recovery, at each hour $u\ge T_R+23$ calculate the trailing-24 h service
  ratio
  $\rho_u=\sum_{i,t=u-23}^{u}y_{i,t}/\sum_{i,t=u-23}^{u}y^O_{i,t}$, where the
  evaluator-only perfect-service reference is $y^O_{i,t}=d_{i,t}$ and never
  supplies a policy input. Let $u_0$ be the first hour for which
  $\rho_{u_0},\ldots,\rho_{u_0+167}\ge0.95$. Report recovery-onset time
  $u_0-T_R$ and confirmation time $u_0+167-T_R$; the latter is the protected
  95%-recovery endpoint. If no complete run occurs before episode end, record
  confirmation time $H-T_R+168$ h and a right-censored flag. Transfer reports
  each reversal and uses the maximum confirmation time as its protected
  endpoint.
- **Secondary metrics:** integrated active fast exposure
  $\sum_{i,t}f_{i,t}\Delta t$ (CU h); active-state total variation
  $\sum_{i,t}|f_{i,t}-f_{i,t-1}|$ (CU); issued-order total variation (CU);
  gross reserve debit $6\ \mathrm{h}\sum_{i,t}o_{i,t}$ and reserve minimum
  (CU h); structural build/carry/removal cost (cost units); stranded capacity
  30 d after each reversal (CU); deficit before/after reversal (CU h); frozen
  95%-recovery time above (h); order activations, expiries, cancellations,
  and structural retirements; CPU resources.
- **Inference and protected gates:** common pooled inference applies. B must
  reduce both pre- and post-reversal unshifted mean deficit. With frozen
  $\chi=1$ cost unit/(CU h), B's structural cost plus
  $\chi$ times its gross reserve debit may not exceed $1.10\chi$ times A's
  gross reserve debit. At every reversal, stranded capacity must be below 10%
  of slow capacity committed immediately before that reversal, where the
  denominator is $\sum_i[z_{i,T_R^-}+q^+_{i,T_R^-}-q^-_{i,T_R^-}]_+$ over
  installed state and accepted queued build/removal amounts; when the
  denominator is zero the gate passes only when stranding is zero. The
  conversion is a synthetic decision weight and native
  units remain reported. C must beat B through its preselected loss or resource
  route.
- **Fallback and stopping:** infeasible hourly optimisation computes next-hour
  target active capacity from the causal next-hour forecast
  $f^{target}_{i,t+1}=\min[0.15c_{i,0},(\widehat d_{i,t+1}-c_{i,0}-z_{i,t})_+]$.
  It first computes carry
  $f^{carry}_{i,t+1}=f_{i,t}-o_{i,t-6}$ and raw new order
  $r_i=(f^{target}_{i,t+1}-f^{carry}_{i,t+1})_+$. Issue
  $o_{i,t}=\lambda r_i$, where

  $$
  \lambda=\min\left[1,
  \frac{0.15\sum_ic_{i,0}-\sum_if^{carry}_{i,t+1}}{\sum_ir_i},
  \frac{h_t}{6\ \mathrm{h}\sum_ir_i}\right]
  $$

  clipped to $[0,1]$; a ratio with zero denominator is $+\infty$. If carry
  already violates a cap, assign terminal loss rather than hiding the earlier
  error. Thus fallback cannot renew an expiring cohort implicitly. Infeasible
  structural optimisation issues no order that day. An unbounded lifetime
  interval also issues no slow order. Negative reserve or installation before
  the serialized completion event terminates the arm with terminal loss.
- **Transfer interpretation:** a pass supports a two-timescale state and
  evaluation contract for this synthetic resource network. It does not prove
  vascular remodelling, architectural growth, or energy efficiency. If the
  horizon never makes structural capacity economical, B/A equality is an
  underpowered DGP and `INCONCLUSIVE`; it cannot promote fast-only control as a
  universal result.
- **Artifacts:** `network.json`, `demand.parquet`, `forecast.parquet`,
  `fast-actions.parquet`, `structural-orders.jsonl`, `capacity-ledger.csv`,
  `recovery.csv`, `seed-outcomes.jsonl`.

## Frozen deployable policy registry

This registry is part of the protocol, not implementation advice. A/B/C are
causal state machines. Unless a track states otherwise, every grid tuple is run
on all 64 public development seeds; retain tuples satisfying every development
safety and closure gate, choose smallest mean primary loss, then smallest mean
named resource, then the lexicographically smallest written tuple. A difference
within $10^{-12}\max(1,|x|,|y|)$ is a tie. Node, edge, action, regime, start, and
solver ties use ascending canonical ID. Confirmation and transfer load the
serialized tuple and may not fit it again. Policy-side pseudo-randomness is
forbidden except where a PCG64-DXSM seed is written below. A solver
returning non-finite state, violating a constraint by more than $10^{-10}$, or
missing its written tolerance/cap invokes that protocol's charged fallback.
For every SHA-256 PCG label, interpret digest bytes 0--15 as the little-endian
128-bit initial state and bytes 16--31 as the odd little-endian stream after
setting its low bit. Uniform and Gaussian transforms are the common-contract
transforms above; library-default seeding or distribution transforms are
forbidden.

### T01 policies

1. **A — fixed tree shares.** At each 5 min decision set every primary-tree edge
   to its serialized $q^{tree}_{e,0}$, set every chord to zero, and retain
   $1.20q_{i,0}$ at node $i$. Because source flow is already $Q_{src}$, no
   rescaling or demand observation enters. Rate projection is unnecessary from
   the identical initial action; any later fallback return applies the common
   25%-capacity rate limit edge by edge.
2. **B — robust six-step flow MIQP.** From arrived consumption-rate observations,
   construct an EWMA per node with
   $\alpha_B\in\{0.1,0.3,0.5\}$ and initial value $m_{i,0}$. At each decision,
   process newly arrived consumption observations by arrival timestamp,
   measurement timestamp, then observation ID; update
   $\widehat m_i\leftarrow(1-\alpha_B)\widehat m_i+\alpha_Bx_i$, where $x_i$ is
   observed consumed amount divided by its 5 min panel duration. For each
   $\alpha_B$, pool development innovations
   $(x_i-\widehat m_i^{prior})/m_{i,0}$ and freeze
   $q_{.99}=\max[0,Q^{type7}_{.99}]$. Maintain a causal storage anchor per node,
   initially $0.5S_i^{max}$. When storage panels arrive, choose the newest
   measurement timestamp (ties by observation ID), clip that reading to
   $[0,S_i^{max}]$, and replay from its timestamp to the decision in 0.25 min
   substeps using archived issued flows and the one-step EWMA values that were
   frozen at those historical decisions; later-arriving consumption never
   rewrites that replay. This reconstructed store is the MIQP initial state. At decision $k$,
   forecast all six 5 min intervals by holding the EWMA and use upper demand
   $\widehat m^+_{i,k+h}=\max[0,\widehat m_{i,k}+q_{.99}m_{i,0}]$; monotonicity makes this the worst vertex
   of the rectangular innovation set. Optimise edge flows, retained recipient
   flows, the exact T01 storage transition, consumption, export, and deficit.
   First minimise total upper-vertex deficit; constrain it within
   $10^{-10}\max(1,L)$ of its optimum, then minimise Poiseuille work, then flow
   total variation. The serve-before-store/export order is not relaxed into a
   convex flow balance. For each node and 0.25 min prediction substep define
   $V=S^-+A$, $U=V-C$, and binary selectors $b^C,b^S$. Let

   $$
   B_i^C=S_i^{max}+C_aQ_{src}(0.25\ \mathrm{min})
   +(0.25\ \mathrm{min})\max_h\widehat m^+_{i,k+h},
   \qquad B_i^S=B_i^C,
   $$

   where delivery uses $Q_{src}$ in L/min and $C_a$ in mmol/L, so the first two
   terms are converted to mmol. Enforce the exact two minima with

   $$
   0\le C\le M,\quad C\le V,\quad
   C\ge M-B_i^C(1-b^C),\quad C\ge V-B_i^Cb^C,
   $$

   $$
   0\le S^{next}\le S_i^{max},\quad S^{next}\le U,\quad
   S^{next}\ge S_i^{max}-B_i^S(1-b^S),\quad
   S^{next}\ge U-B_i^Sb^S,
   $$

   followed identically by $E=U-S^{next}$ and $Z=M-C$. Thus every feasible
   plan serves first, stores only the residue, and exports only clipped residue;
   the objective cannot exchange those operations. Bounds are recomputed from
   the serialized seed before observations and verified by exhaustive endpoint
   substitution. Solve each lexicographic stage as a convex MIQP using
   deterministic best-bound branch and bound, lower binary first and canonical
   variable order for ties. Each node relaxation uses the analytic primal-dual
   QP solver, the feasible A plan and shifted prior plan where applicable, KKT
   tolerance $10^{-9}$, 2,000 iterations, relative integer gap $10^{-8}$, and
   20,000 nodes. Failure of any stage invokes the charged T01 fallback. Issue
   only the first interval.
3. **C — bounded local repair.** Use the same EWMA/quantile construction with
   $\alpha_C\in\{0.1,0.3,0.5\}$ and the same causal storage reconstruction as
   B. Update debt queue
   $d_{i,k+1}=\max[0,0.8d_{i,k}+(5\ \mathrm{min})(\widehat m^+_{i,k}-\widehat C_{i,k})]$
   mmol, with $d_{i,0}=0$. Here $\widehat m^+_{i,k}$ is the same frozen
   one-step upper EWMA demand used by B and $\widehat C_{i,k}$ is the most recent
   arrived consumption amount divided by its 5 min observation interval; before
   the first arrival it is $m_{i,0}$. Timestamp correction uses only values that
   have arrived by decision $k$.
   A node is active when
   $d_{i,k}>\theta_dm_{i,0}(5\ \mathrm{min})$, with
   $\theta_d\in\{0.5,1,2\}$. Form an induced repair graph from active nodes,
   their primary ancestors, their siblings, and incident chords. A sibling may
   export only predicted storage above
   $g_SS_i^{max}$, $g_S\in\{0.2,0.35,0.5\}$. Solve the one-step restriction of
   B's lexicographic MIQP on that graph and leave all other A flows fixed. If
   $\sum_id_{i,k}>\theta_G\sum_im_{i,0}(5\ \mathrm{min})$ with
   $\theta_G\in\{0.5,1,2\}$, solve B's full six-step MIQP instead. Project the
   issued plan once onto capacity, conservation, and rate limits in ascending
   edge order. Tune $(\alpha_C,\theta_d,g_S,\theta_G)$ by the common registry
   rule.

T01 resource is simulated pump work. Its cap is the episode integral of
$\sum_e8\mu L_e(U^{cap}_e10^{-3}/60)^2/(\pi r_e^4)$, where $U^{cap}_e$ is the
serialized edge capacity in L/min; this is a conservative finite bound in
joules computed before execution.

### T02 policies

1. **A — cubic family.** Compute the exact feasible interval of scale $\alpha$
   for $r_e=\alpha Q_e^{1/3}$. Search log $\alpha$ by golden section until
   relative bracket width $10^{-10}$; evaluate lower endpoint, midpoint, upper
   endpoint, and the final two golden points; choose the feasible lowest true
   objective in that canonical order.
2. **B — full constrained design.** Optimise log-radii with the five starts and
   true regime already declared in T02. The primal-dual barrier sequence is
   $10^{-1},10^{-2},\ldots,10^{-9}$; each stage uses damped Newton with
   Armijo constant $10^{-4}$, backtracking factor 0.5, KKT tolerance $10^{-8}$,
   and 20,000 total iterations. For interior start $j\in\{1,2\}$ and edge $e$,
   interpret the first 64 little-endian digest bits of
   `SHA256("ICP-v2|T02|start|worldID|j|edgeID")` as integer $v$ and set the
   log-radius fraction to $(v+0.5)/2^{64}$; placeholders are replaced by their
   canonical decimal IDs. Select the lowest feasible true objective.
3. **C — gated power family plus repairs.** For each
   $p\in\{2,2.5,3,3.5,4,4.5\}$ evaluate 257 equally spaced log-scale values from
   $\min_e(r_{min}/Q_e^{1/p})$ through
   $\max_e(r_{max}/Q_e^{1/p})$ inclusive; set
   $r_e=\operatorname{clip}(\alpha Q_e^{1/p},r_{min},r_{max})$. For each
   pressure-violating terminal in ascending ID, select the path edge with the
   largest pressure drop, multiply its radius by 1.25 capped at $r_{max}$, and
   recompute the complete path; perform at most three such repairs per terminal.
   Re-evaluate the full declared objective after every repair. Choose the
   feasible minimum, then smaller $p$, scale index, and repair log.

A full objective/analytic-gradient evaluation is one T02 resource unit;
$R_s^{max}=200{,}000$ evaluations for every arm, including failed starts and
repairs.

### T03 policies

1. **A** evaluates exactly `(countercurrent, q=1, a=1)` by the registered
   solver and two-attempt failure rule.
2. **B** evaluates all 18 actions in order orientation `co` then `counter`,
   ascending $q$, ascending $a$; it minimises registered $L_s$, pump work, then
   that action order. A terminal-valued evaluation remains in the table.
3. **C — regret tree.** On each development world B labels the best action and
   supplies every action's primary regret. Fit one deterministic cost-sensitive
   CART tree to features
   $(\log(kL/Q_1),\log(\ell_1L/Q_1),\log(\ell_2L/Q_1),\log Q_1,\tau)$, maximum
   depth 3 and minimum leaf size 8. Candidate splits
   are midpoints of sorted distinct values. Choose the split with lowest summed
   regret, then feature index and threshold. Each leaf stores the three actions
   with smallest mean regret, padding by canonical action order if needed. C
   evaluates exactly those three and applies B's selection rule. Tree bytes and
   every leaf action are serialized.

T03 resource is the number of finite-volume cell residual/Jacobian updates,
including every Newton iteration, retry, and fallback. A selected terminal
action can add one 19th fallback action. The conservative transient cap is

$$
R_s^{max}=19[150(64)(8)+300(128)(8)]=7{,}296{,}000
$$

cell updates: first attempts have 32 cells per channel, 150 two-second steps,
and eight Newton updates; retries have 64 per channel and 300 one-second steps.
The paired-block solve is linear in cell count. The eight-seed preflight must
also measure fewer than 60 wall-s per seed at the worst transfer resolution;
otherwise reduce no resolution after freeze and mark T03 `INVALID`.

### T04 policies

1. **A — collapsed Gaussian propagation.** Use the written piecewise-linear
   interpolation and collapsed ledger. Propagate independent declared sensor
   variances through products and sums by first-order delta method; the 99%
   interval is estimate $\pm2.575829$ standard errors, intersected with the
   material bounds. No residual from final sensors changes A's point estimate.
2. **B — constrained spline smoother.** On a 30 min grid represent recovery and
   secretion rates for **each unit and solute** by non-negative
   cubic B-splines with $K\in\{6,12,24\}$ equally spaced interior knots across
   the 24 h episode. Interpolate arrived source flow and concentration
   piecewise-linearly without using values before arrival, compute each
   $G_{i,t},U_{i,t},F_{i,x,t}$ from the supplied design table, and impose
   $0\le R_{i,x,t}\le F_{i,x,t}$ and $S^{sec}_{i,x,t}\ge0$. Carrier-flow,
   two-compartment, excretion, and whole-store equations are equality
   constraints at every unit, solute, and minute. Predicted observations are
   obtained by applying the exact registered sampling, pooling, and timestamp
   operators to those unit states. Minimise the sum of squared residuals for
   every source, pooled-final, store, rotating intermediate, and exogenous-panel
   observation divided by its declared variance plus
   $\lambda\sum_{i,x,t}[(\Delta^2R_{i,x,t})^2+(\Delta^2S^{sec}_{i,x,t})^2]$, with
   $\lambda\in\{10^{-4},10^{-2},1,100\}$. Choose $(K,\lambda)$ by six blocked
   4 h folds, then refit all data with deterministic primal-dual QP, zero and
   filtration-proxy starts, KKT $10^{-9}$, 10,000 iterations. Form 99%
   intervals as estimate $\pm2.575829$ standard errors from the inverse
   active-set observed Hessian; use a symmetric Moore--Penrose inverse with
   singular values below $10^{-10}$ of the largest set to zero. An unbounded
   target direction invokes the protocol's identified-set fallback rather than
   a bootstrap refit.
3. **C — event ledger identified set.** The residual is observed pooled-final
   material rate minus the last feasible typed-ledger prediction. On each
   arrived residual,
   update two-sided CUSUM
   $g^\pm_t=\max[0,g^\pm_{t-1}\pm r_t/\sigma_t-0.5]$ and open a change point
   when either exceeds $h\in\{4,6,8\}$; reset both to zero. Between registered
   points, each unit/solute recovery and secretion rate is constant and
   non-negative. Here $\sigma_t$ is the declared SD of that pooled-final sensor,
   propagated through flow-times-concentration, with floor
   $10^{-12}$ mmol/min. Initialise $g^+_0=g^-_0=0$ and the prediction to the
   filtration-only typed ledger. After every feasible LP, serialize its
   midpoint prediction for each future registered observation timestamp; only a
   prediction serialized before the matching observation arrived can become the
   next residual. An infeasible LP leaves the prior prediction unchanged and
   invokes fallback. First
   minimise variance-normalised absolute observation residual by linear
   programming subject to every typed carrier, compartment, excretion, store,
   and 99% observation band; constrain that objective within $10^{-10}$ of its
   optimum. Point output is the midpoint of LP minima
   and maxima for each target; those extrema are its interval. Empty sets invoke
   the protocol fallback. Tune $h$ by the registry rule.

T04 resource is the number of objective-residual plus analytic-Jacobian
evaluations across fit, cross-validation, interval construction, and fallback;
$R_s^{max}=10^8$ evaluations.

### T05 policies

A and B are exactly the six-pair PI grid and 24-scenario robust-MPC program in
T05; no additional state or weight is permitted. C waits for 60 s of arrived
data, using B before then. At seconds 60,120,$\ldots$, it fits the written
nonlinear plant over the latest 60 causal tape entries. Delay is enumerated on
$\{2,8,15,22,30\}$ s; for each delay,
$(\tau_q,\tau_x,g_m,g_t)$ are fitted inside the T05 ambiguity bounds by
deterministic L-BFGS with ridge
$\lambda_f\in\{10^{-4},10^{-2}\}$, midpoint and previous-fit starts (midpoint
only on the first fit), gradient tolerance $10^{-8}$, and 30 iterations. The fitted objective is the
mean of one-step squared $q$ and $x$ residuals, each divided by $q_0^2$, plus
$\lambda_f\|\vartheta-\vartheta_{mid}\|_2^2$ after every fitted parameter is
affinely scaled to $[0,1]$. Choose lowest unpenalized normalized one-step error,
then the common registry's tuple, delay, and start order. Linearise the fitted plant and
evaluate

$$
G(s)=\frac{k_a}{\tau_qs+1+g_m/s_q+
(g_t/s_x)e^{-sd}/(\tau_xs+1)},\qquad L(s)=K_fG(s)
$$

on 512 log-spaced frequencies from 0.001 to 1 Hz. At the first unity-gain
crossing, log-linearly interpolate phase and set margin to
$180^\circ+\arg L$;
if no crossing, margin is $180^\circ$ when all gains are below one and
$-180^\circ$ otherwise. Development evaluates exactly tuples
$(\lambda_f,K_f,\Gamma)$ equal to $(10^{-4},0.5,30^\circ)$,
$(10^{-4},1,45^\circ)$, $(10^{-2},0.5,45^\circ)$, and
$(10^{-2},1,60^\circ)$. C issues
$\operatorname{rateclip}[K_f(q_0-\widehat q)/k_a]$ only when margin is at least
$\Gamma$ and normalized fit RMSE is at most 0.10; otherwise it issues the action
from B's most recently frozen 30 s plan, replanning B only at the common 30 s
boundaries. Tune the four tuples by the registry rule. T05 resource cap is
$R_s^{max}=180$ kPa min, the amplitude bound integrated for 90 min.

The worst development-seed arithmetic is frozen before implementation:

1. truth integration: $(6+4+4)(5400/0.1)=756{,}000$ RK4 state steps;
2. scenario construction for four B and four C trajectories:
   $8(180)(24)(15)=518{,}400$ augmented prediction steps;
3. at 50 QP iterations, at most $25{,}920{,}000$ scenario-row evaluations;
4. C fitting: $4(90)(5)(2)(2)(30)(60)(2)=25{,}920{,}000$ scalar residual
   components; and
5. phase scans: $4(90)(512)=184{,}320$ frequency points.

The declared upper preflight is therefore 53,298,720 counted scalar/state
operations per development seed, excluding fixed-size linear-algebra constants
which are logged separately. Eight public shakedown seeds must each finish in
under 60 wall-s on one core and below 2 GiB; otherwise T05 is `INVALID` and no
confirmation is unsealed. This is a prospective feasibility gate, not a runtime
result.

### T06 policies

At each minute construct five 15-step ventilation scenarios from the latest
timestamp-corrected observation. Let $s_t=\sin(2\pi t/60+\phi_V)$ and set
$V^1_i(h)=\widehat V_{i,t}+0.05V_{i,0}(s_{t+h}-s_t)$, which holds the
unobserved AR/exposure component at its causal latest value. Define the
no-exposure, zero-AR sinusoidal path
$B_i(h)=V_{i,0}[1+0.05\sin(2\pi(t+h)/60+\phi_V)]$. Scenario (2) is exactly
$V^2_i(h)=(1-h/15)V^1_i(h)+(h/15)B_i(h)$ for $h=1,\ldots,15$; it shares
scenario 1 at the issue instant and reaches $B_i(15)$ at the horizon. Scenario
(3) uses scenario 1 multiplied
by 0.92 everywhere; (4) scenario 1 multiplied by 0.85 only where current
$\widehat V_i/(\gamma\widehat Q_i)<1$; and (5) scenario 1 multiplied by 1.08 everywhere. Clip
all to $[0.045V_{i,0},1.10V_{i,0}]$, the DGP's attainable ventilation bounds.
No scenario is fitted later.

1. **A — four-zone robust NLP.** Use the frozen four zones and collapsed zone
   surrogate. Optimise one pressure and four zone multipliers for every one of
   the 15 future minutes, subject to the written amplitude, per-minute rate, and
   total-flow constraints in every scenario. Minimise worst-scenario 15 min deficit; constrain it within
   $10^{-10}\max(1,L)$ of optimum, then minimise worst pump work, multiplier
   variation, and pressure variation in that order.
2. **B — regional robust NLP.** Use the same scenario paths and lexicographic
   objectives with one individual $a_i$ per compartment and minute. A and B use deterministic primal-dual
   interior point, analytic derivatives, baseline and shifted-previous starts,
   KKT $10^{-8}$, 5,000 iterations, and issue the first action.
3. **C — prevalence-gated reflex.** Compute
   $a_i^{raw}=\operatorname{clip}[1+K_R(\gamma\widehat Q_i-\widehat V_i)/\max(\gamma\widehat Q_i,10^{-12}),0.5,4]$.
   Update prevalence
   $\pi^{prev}_t=(1-\alpha_p)\pi^{prev}_{t-1}+\alpha_pN^{-1}\sum_i1[\widehat V_i/(\gamma\widehat Q_i)<\theta_R]$.
   If
   $\pi^{prev}_t\le p_G$, amplitude-clip and then rate-clip $a^{raw}$ from the previous
   issued vector. Retain only pressure values
   $\{0.5,0.6,\ldots,1.5\}P_0$ that satisfy the pressure rate limit and total-flow
   cap with that vector. Its attainable ceiling is the largest worst-scenario
   one-minute transfer over this retained grid. Choose the smallest retained
   pressure attaining at least 95% of that ceiling; an empty grid invokes the
   registered T06 fallback. If $\pi^{prev}_t>p_G$, issue B's
   first action. Initialise $\pi^{prev}_0=0$. Tune
   $K_R\in\{0.5,1,2\}$, $\alpha_p\in\{0.1,0.3\}$,
   $\theta_R\in\{0.7,0.85,1\}$, and $p_G\in\{0.3,0.5,0.7\}$.

T06 resource is pump work, capped by integrating
$(1.5P_0)(1.5Q_T)$ for four hours with the written SI conversions.

### T07 policies

1. **A — calendar PI.** Maintain 168 hour-of-week means, initialised to $b$ and
   updated after each arrived demand by EWMA
   $\mu_h\leftarrow(1-\alpha_A)\mu_h+\alpha_A\widehat d_t$,
   $\alpha_A\in\{0.02,0.05,0.1\}$. For next-hour error
   $e_t=\mu_{h(t+1)}-1.05b$, update
   $I_t=\operatorname{clip}[I_{t-1}+e_t\Delta t,-24b\ \mathrm{CU\,h},24b\ \mathrm{CU\,h}]$
   and issue
   raw $\widetilde f_t=\operatorname{clip}[K_Pe_t+(K_P/T_I)I_t,0,0.35b]$,
   then $f_t=\min(\widetilde f_t,h_t/\Delta t)$ and $a_t=0$. Initialise
   $I_{-1}=0$. Tune $K_P\in\{0.25,0.5,1\}$ and
   $T_I\in\{6,24,72,\infty\}$ h; use zero integral gain for infinity.
2. **B — 48 h distributionally robust LP.** From verified consecutive event
   pairs maintain
   $p_{01}\sim\operatorname{Beta}(1+n_{01},1+n_{00})$ and
   $p_{10}\sim\operatorname{Beta}(1+n_{10},1+n_{11})$, where the first index is
   the earlier state. For mapping `direct`, set $v=c$; for `inverted`, set
   $v=1-c$. When a non-missing cue's target is later verified, each mapping
   updates sensitivity
   $s_1=P(v=1\mid e_{target}=1)$ and specificity
   $s_0=P(v=0\mid e_{target}=0)$ from independent Beta$(1,1)$ priors and the
   corresponding four counts. `abstain` supplies unit cue likelihood. At every
   hour evaluate mappings in canonical order `abstain`, `direct`, `inverted`.
   For each mapping reset the same PCG64-DXSM stream
   `SHA256("ICP-v2|T07|B|worldID|hourIndex")`, replacing both placeholders, and
   generate 64 posterior-predictive paths in path order.

   A beta draw with uniform $u$ is the unique $x\in[0,1]$ whose regularized
   incomplete beta CDF equals $u$: evaluate that CDF by Lentz continued fraction
   to relative tolerance $10^{-12}$ and 200 terms, then bisect $[0,1]$ for 60
   iterations. For every path consume draws for $p_{01},p_{10},s_1,s_0$ in that
   order, even when abstaining. Starting from the latest verified event (or
   prior $P(e_0=1)=3/28$ at $t=0$), run a two-state 48 h forward filter. At
   future hour $u$, multiply its state probability by the likelihood of every
   already arrived, non-missing cue whose declared target is $u$; direct and
   inverted use their mapped $v,s_1,s_0$, while abstain multiplies by one.
   Normalize after each hour; a zero/non-finite normalizer invalidates that
   mapping. Backward-sample one state path using the next uniforms, consuming
   them in descending target-hour order. Future cues not yet issued are never
   simulated or supplied to the open-loop action.
   Each path's ordinary demand is the selected A calendar mean. Its event excess
   state is initialised to $E_0=0.25b$ and, whenever a verification flag arrives,
   updates
   $E\leftarrow(1-\alpha_E)E+\alpha_E(\widehat d_t-\mu_{h(t)})_+$ with
   $\alpha_E\in\{0.05,0.1,0.2\}$; otherwise it is held. The selected state is
   the causal event amplitude on every path.
   For each mapping solve an open-loop 48 h linear program
   for common $f,a$, scenario service deficits, used anticipation, return,
   expiry, and reserve. Minimise worst expected
   `deficit + lambda_D * gross_debit + lambda_W * unused_expiry` over weights
   $\pi\ge0$, $\sum\pi=1$, $\|\pi-1/64\|_1\le0.25$, with
   $\lambda_D\in\{0.01,0.05,0.1\}$ and
   $\lambda_W\in\{0.1,0.5,1\}$. Use deterministic primal-dual LP, previous and
   zero starts, KKT $10^{-9}$, 5,000 iterations; tune
   $(\alpha_E,\lambda_D,\lambda_W)$ by the common rule. Select the mapping with
   smallest frozen robust objective, breaking exact ties in the canonical order
   above, and issue its first action. Log hour, mapping, posterior counts,
   invalid-map flags, three robust objectives, forecast probabilities, action,
   and tie reason; a mapping may not be relabelled after its target arrives.
3. **C — prospective polarity value.** Use the same causal transition,
   sensitivity, and specificity counts. Propagate the posterior-mean two-state
   transition matrix six steps from the latest verified state to obtain prior
   event probability $\pi_6$. For direct $c$ and inverse $1-c$, form 99%
   equal-tail beta intervals for $s_1,s_0$ and enumerate their four endpoint
   pairs in Bayes' rule
   $P(e=1\mid v=1)=\pi_6s_1/[\pi_6s_1+(1-\pi_6)(1-s_0)]$; its minimum is
   $p^L_m$, with zero denominator giving zero. A missing or mapped-zero cue has
   $p^L_m=0$. Let $A_t$ be the EWMA event excess with coefficient 0.1 and
   candidate anticipatory order $a^*=\operatorname{clip}(A_t,0,0.35b)$. For
   mapping $m$, define lower value
   $V_m=[p^L_m\min(a^*,A_t)-\lambda_C(1-p^L_m)0.3a^*]\Delta t$ CU h, with
   $\lambda_C\in\{0.5,1,2\}$. Initialise $A_0=0.25b$. Choose larger $V_m$,
   then direct on an exact tie, and log both bounds, values, and chosen mapping;
   issue
   $a_t=\min(a^*,h_t/\Delta t)$ only when that value is strictly positive,
   otherwise zero. Compute A's selected raw PI command next and issue
   $f_t=\min(\widetilde f_t,\max[0,h_t/\Delta t-a_t])$, so anticipation has the
   written first claim on the same reserve without violating feasibility. Tune
   $\lambda_C$ by the registry rule.

T07 resource is gross reserve debit; its cap is
$R_s^{max}=0.70b(2160\ \mathrm{h})$ CU h.

### T08 policies

All policies use the identical supplied active topology and $K^P$ table.

1. **A — global phase lock.** At each tick issue
   $u_i=\operatorname{rateclip}[K_A\operatorname{wrap}(\widehat\phi_G-\widehat\theta_i)]$,
   where $\widehat\phi_G$ and $\widehat\theta_i$ are branch-selected and
   extrapolated to the current tick by the common causal reconstruction rule.
   Before the first global arrival, issue the registered own-target fallback.
   Use amplitude clipping before rate clipping.
   Tune $K_A\in\{0.02,0.05,0.1\}$ s$^{-1}$.
2. **B — robust tracking QCQP.** Linearise the supplied active oscillator model
   at the current reconstructed and extrapolated phases for a 5 s, 25-step
   horizon. Use four scenario corners:
   packet delay 0 or 0.3 s crossed with unknown common-drive residual
   $-0.04$ or $+0.04$ rad/s. Minimise worst integrated squared target-phase
   error, then integrated action, then action variation under common bounds.
   Introduce epigraph $z$ and one convex quadratic-loss constraint per corner;
   hence the minimax problem is a convex QCQP, not relabelled as a QP. Use
   deterministic primal-dual interior point with analytic derivatives, zero and
   shifted-plan starts, KKT $10^{-9}$, 2,000 iterations; issue the first action.
3. **C — expiring neighbour terms.** Begin with own-target proportional action
   $0.05\operatorname{wrap}(\bar\omega t+\psi_i-\widehat\theta_i)$. Every 2 s, for each
   arrived neighbour in ascending ID, freeze the own-target proportional term,
   all other currently admitted neighbour terms, current state, and the four B
   scenario disturbances. Simulate those identical 5 s rollouts with and
   without adding
   $K_C\sin(\widehat\theta_j-\widehat\theta_i)$,
   $K_C\in\{0.005,0.01,0.02\}$ s$^{-1}$. Admit
   the term for 10 s only when every corner is feasible and the fractional
   worst-corner reduction
   $(L_{without}-L_{with})/\max[L_{without},10^{-12}L_s^{max}]$ exceeds
   $\theta_C\in\{0.5\%,1\%,2\%\}$. When $L_{without}=0$, admit no term. Future
   rollout actions apply the same amplitude-then-rate clipping in both arms of
   the counterfactual. At most four terms per node are retained,
   ordered by predicted reduction then neighbour ID. Sum, bound, and rate-limit
   the action. Tune $(K_C,\theta_C)$ by the registry rule.

T08 has no C resource route because packet bytes are factorial controls.

### T09 policies

Define common `FAST-RH`: read the forecast object's already serialized
32-scenario type-7 0.90 next-hour quantile, compute target, carry, raw orders,
and $\lambda$ exactly as in the T09 fallback, and issue those orders. No arm
regenerates or recalibrates this quantile. A runs `FAST-RH` every hour and
never builds or removes.

B also runs `FAST-RH` every hour. At each daily boundary it constructs
exactly four 336 h conditional paths from the supplied point-event
decomposition. Starting from every serialized point-event amplitude and onset,
multiply amplitude by an independent mean-one lognormal draw with log-SD 0.3
and add an independently rounded $N(0,(24\ \mathrm{h})^2)$ onset displacement;
retain the common held-AR ordinary path and clip after summation. PCG64-DXSM
stream `SHA256("ICP-v2|T09|B|worldID|dayIndex")` is consumed in scenario,
event, amplitude, then onset order, using the common Box--Muller transform and
rounding halves away from zero.

For each node independently, B evaluates the canonical candidate list
`[none, build-0.25, build-0.50, remove-0.25, remove-0.50]`. A build amount
is respectively the smaller of $0.25c_{i,0}$ or $0.50c_{i,0}$ and remaining
installed-plus-queued build room. A removal amount is respectively the smaller
of $0.25z_{i,t}$ or $0.50z_{i,t}$ and $z_{i,t}-q^-_{i,t}$. A zero amount or a
candidate violating the written opposite-queue exclusion is deleted. Each
remaining candidate is simulated for 336 h on all four paths with the current
installed state, exact existing completion queues, the candidate accepted at
the current boundary, no later structural orders, and `FAST-RH`. In these
screening rollouts node $i$ receives fixed local reserve
$H_{i,max}=H_{i,0}=0.25c_{i,0}$ CU h, hourly replenishment
$0.02H_{i,max}$, and the written $0.15c_{i,0}$ local fast cap; these local
shares sum to the global reserve and make the separable screen reproducible.

For candidate $a$ and path $s$, calculate

$$
J_{i,a,s}=\chi L_{i,a,s}+\chi D_{i,a,s}
+C^{incremental}_{i,a,s}
+(1\ \mathrm{cost\ unit/CU})z^{committed}_{i,a,s,336},
$$

where $L$ is forecast deficit (CU h), $D$ is gross six-hour reserve debit
(CU h), incremental cost includes the new order plus future carry/removal costs
but never recharges sunk accepted orders, and the final term includes installed
and queued slow capacity. Choose the candidate minimizing
$\max_{s=1,\ldots,4}J_{i,a,s}$; differences within the common $10^{-12}$
tolerance tie and the earlier canonical candidate wins. Submit all selected
non-`none` candidates in node-ID order to the actual queue validator. A
rejection is logged and replaced by no order; it does not trigger a second
choice. This finite enumeration, not a hidden MILP or refitted optimizer, is
B's complete structural algorithm.

C runs `FAST-RH`. At each daily boundary form lower and upper paths from the
forecast object's point-event decomposition: multiply every event amplitude by
$\exp(\mp0.3z_C-0.5(0.3)^2)$ and shift its onset by respectively
$+24z_C$ and $-24z_C$ hours, integer-rounded with halves away from zero; retain
the common held-AR ordinary path and clip after summation. For
$z_C\in\{1.281552,1.644854,1.959964\}$, define lower lifetime as the length of
the leading consecutive run starting at forecast hour $h=1$ whose lower bound exceeds
$c_{i,0}+z_{i,t}$. Let
$q^L_{i,.90}$ and $q^U_{i,.90}$ be type-7 empirical 90th percentiles of the 14 d
lower and upper forecast paths. Define payback hours as
$P_i=(\kappa_++\kappa_c\delta_i)/\chi$; issue build
$b^+_i=\min[0.5c_{i,0},(q^L_{i,.90}-c_{i,0}-z_{i,t})_+]$ only when the lower
lifetime exceeds $24\delta_i+P_i$. If the upper demand bound stays below
$c_{i,0}+z_{i,t}$ at all first 24 forecast hours, increment node counter
$n^R_i$ by one; otherwise reset it to zero. Initialise $n^R_i=0$. When
$n^R_i\ge D_R$ for $D_R\in\{3,7,14\}$ complete daily decisions, issue removal of
$\min[z_{i,t},(c_{i,0}+z_{i,t}-q^U_{i,.90})_+]$; reset the retirement counter
after an accepted removal as well. Queue bounds and opposite-order exclusion are those in T09. Tune
$(z_C,D_R)$ by the registry rule.

T09 resource is $R=C_{struct}+\chi D_h$, where
$D_h=6\ \mathrm{h}\sum_{i,t}o_{i,t}$ is gross reserve debit. Let
$N_d=H/(24\ \mathrm{h})$ be the number of episode days. A conservative finite
cap, evaluated from serialized episode length, is

$$
R_s^{max}=\chi[H_{max}+(0.02\ \mathrm{h}^{-1})H_{max}H]
+(\kappa_++\kappa_-)0.5N_d\sum_ic_{i,0}
+\kappa_c(N_d\ \mathrm{day})\sum_ic_{i,0}\quad[\mathrm{cost\ units}].
$$

The T09 computational envelope is frozen before the inferential run. At the
worst $N=32$ and 120 d, one seed performs at most

1. $120(32)(5)(4)(336)=25{,}804{,}800$ B candidate-path node-hour updates;
2. $11(120)(24)(32)=1{,}013{,}760$ actual node-hour updates for A, B, and the
   nine C registry tuples;
3. $120(24)(32)(32)=2{,}949{,}120$ shared hourly quantile
   scenario-node evaluations;
4. $120(4)(336)(32)=5{,}160{,}960$ B conditional-path node-hour generations;
   and
5. $120(3)(336)(32)=3{,}870{,}720$ joint lower/upper C bound-node
   evaluations, shared across the three retirement counters for each $z_C$.

The declared upper preflight is therefore 38,799,360 state/prediction
transitions per seed, with no MILP, numerical gradient, or nested bootstrap in
that count. Before launching development, run the release-mode,
single-threaded reference executable on the eight fixed shakedown seeds
`0x54090000` through `0x54090007` at $N=32$. Each seed must finish in less than
60 s wall time on one physical CPU core with peak resident memory below 2 GiB;
the complete executable, compiler flags, CPU model, clock policy, transition
counts, wall time, and peak memory are serialized. A miss makes ICP-T09
`INVALID` and forbids the 64-seed sweep; the threshold may not be repaired by
dropping candidates, paths, arms, or hours after seeing runtime.

## Implementation and artifact boundary

The [ICP-T01 public-development smoke harness](../workstation/fixture-020/README.md)
and its [smoke-ready manifest](../workstation/manifests/fixture-020.json) implement
only the base-family generator and arm A within C-1488 scope. The harness checks
synthetic oxygen accounting and retained execution records; every summary
remains `NO_RESULT`. Simulated pump work in J supplies no measured workstation
energy record or energy conclusion.

Arms B, C and O, common inference and the sensitivity diagnostic, transfer,
Parquet artifacts and ICP-T02--ICP-T09 are not built. No confirmation or
transfer data, seed pack or commitment exists. These implementation records
supply no result, effect estimate or claim promotion. Future implementation
must preserve the frozen IDs and version scientific changes.

## Harness status

The [public-development harness](../workstation/fixture-020/README.md) has a
[smoke-ready manifest](../workstation/manifests/fixture-020.json) for ICP-T01 /
C-1488 only. Readiness records execution plumbing; every summary remains
`NO_RESULT`. B/C/O, inference, transfer and ICP-T02--ICP-T09 remain deferred;
no confirmation or transfer data, measured energy or scientific result exists.
