# Fixture F-018 — Environmental process, state, and infrastructure control

- **Status:** pre-implementation experiment contract
- **Proposed direct claims:** [C-1470](../../research/claims.md#c-1470),
  [C-1471](../../research/claims.md#c-1471),
  [C-1472](../../research/claims.md#c-1472),
  [C-1473](../../research/claims.md#c-1473),
  [C-1474](../../research/claims.md#c-1474),
  [C-1475](../../research/claims.md#c-1475),
  [C-1476](../../research/claims.md#c-1476),
  [C-1478](../../research/claims.md#c-1478), and
  [C-1479](../../research/claims.md#c-1479)
- **Existing transformation-product claim:** [C-1285](../../research/claims.md#c-1285)
- **Primary evidence and qualification source:**
  [environmental-engineering audit](../../research/audits/2026-08-24-environmental-engineering-water-waste-remediation.md)
- **Execution boundary:** CPU-only specification; no runner, executable
  manifest, generated dataset, result, or measured workstation-energy record exists
- **Authority:** no scientific, engineering, operational, environmental,
  compliance, cost, or energy result is asserted
- **Registry disposition:** no new principle or candidate; claim number 1477
  remains unused because ENV-T08 extends existing C-1285

This fixture turns the audit's ten ENV-v2 protocols into one durable,
implementation-facing contract. It tests typed state, conservation, delayed
feedback, maintenance history, observation provenance, and whole-system
boundaries without treating an environmental analogy as evidence that an AI
translation works.

EU and German law, DIN/EN/ISO standards, and official technical guidance are
normative or methodological comparators only. That includes applicable EU water,
waste, chemicals, data, environmental-assessment, AI, and taxonomy instruments,
including Commission Delegated Regulation (EU) 2024/1765. Passing a synthetic
protocol cannot establish legal compliance, regulatory approval, treatment
safety, or environmental benefit.

## Question and hypotheses

Can an explicitly typed, conservation-bearing, delayed, maintenance-aware
model reduce a registered engineering loss relative to the strongest mature
process null—or reduce a named resource while keeping the primary loss
non-inferior—when observations, actuators, worlds, horizons, tuning, compute,
assays, material, and fallback authority are matched?

The ten hypotheses are separate and falsifiable:

| Protocol | Claim | Frozen question |
|---|---|---|
| ENV-T01 | [C-1470](../../research/claims.md#c-1470) | Does tracer-calibrated residence-time structure improve early-escape and conversion-mass prediction beyond nominal volume divided by flow? |
| ENV-T02 | [C-1471](../../research/claims.md#c-1471) | Does explicit solids residence time and guild state reduce ammonium/nitrite mass error beyond an HRT-only removal model? |
| ENV-T03 | [C-1472](../../research/claims.md#c-1472) | Does whole-system state and coordination reduce receiving-water nitrogen load beyond independent local control and then beyond robust integrated MPC? |
| ENV-T04 | [C-1473](../../research/claims.md#c-1473) | Can provenance-bearing multivariate monitoring isolate process disturbance, sensor fault, and maintenance state without buying the result through alarms or assays? |
| ENV-T05 | [C-1474](../../research/claims.md#c-1474) | Does reversible/irreversible fouling history reduce unmet and noncompliant membrane service beyond fixed critical-flux and nonlinear state-estimation nulls? |
| ENV-T06 | [C-1475](../../research/claims.md#c-1475) | Does competitive, transport-aware breakthrough state reduce above-limit solute load beyond fixed removal, batch isotherms, and a multicomponent column null? |
| ENV-T07 | [C-1476](../../research/claims.md#c-1476) | Does delayed buffered-state inference reduce kg-COD-equivalent upset loss beyond pH thresholding and a full ADM1-family estimator/controller? |
| ENV-T08 | [C-1285](../../research/claims.md#c-1285) | Does a fixed mass/species/effect closure contract reduce false-safe declarations or assay resources beyond parent-removal and a complete fixed-panel null? |
| ENV-T09 | [C-1478](../../research/claims.md#c-1478) | Does versioned lifecycle and rebound-aware selection reduce service-normalized GHG regret beyond plant-gate scoring and a complete ISO-qualified lifecycle null? |
| ENV-T10 | [C-1479](../../research/claims.md#c-1479) | Does context-qualified modular infrastructure reduce constrained cost/service regret beyond endpoint selection and complete facility-location, hydraulic, reliability, maintenance, and lifecycle optimization? |

No hypothesis forecasts success. A result belongs only to its frozen DGP,
functional unit, observation/action boundary, mature null, and transfer family.
ENV-T08 consumes no new claim number.

## Systems, scenarios, and tasks

The following common block and ten protocol blocks are copied from the
independently reviewed canonical audit. They are controlling specification, not
an abbreviated example. A later implementation may factor shared code, but it
may not relax a local equation, unit, terminal score, fallback, transfer, or
protected gate.

### Canonical common ENV-v2 contract

The following rules are part of every `ENV-T` protocol. Every numeric effect,
coverage, closure, non-inferiority, and resource threshold is a preregistered
synthetic falsification tolerance or minimum detectable engineering effect. It
is not a measured effect, legal limit, recommended operating value, or imported
physical constant.

1. **Runtime and generator:** deterministic TypeScript/JavaScript under the
   repository's pinned Node.js runtime, PCG64-DXSM, canonical little-endian
   serialisation, SHA-256 world manifests, binary64 reference solvers, and no
   network access at run time. Parallel reductions sort by canonical world ID.
   `U(a,b)` is continuous uniform, $U_{\mathbb Z}\{a,b\}$ is inclusive discrete
   uniform, `logU` is log-uniform, and an unweighted categorical list is uniform;
   every draw is independent unless a dependence is stated. Event intervals are
   half-open. Rejection sampling consumes draws in the written field order,
   stops after 10,000 attempts, and then emits a retained generator failure with
   the track's terminal loss. Stable hashes resolve every tie and unordered set.
2. **Disjoint seed packs:** each track receives 64 public development seeds,
   128 registrar-sealed confirmation seeds from the same DGP family, and 64
   registrar-sealed transfer seeds from the separately stated family. Seed
   hashes are committed before development; keys remain unavailable until code,
   configuration, thresholds, and analysis are frozen.
3. **Independence unit:** one seed is one inferential cluster. Timesteps,
   sensors, solutes, reactors, storms, assets, faults, treatment episodes, and
   decisions inside a seed are repeated measures and cannot inflate $n$.
4. **Arms:** A is the tempting collapsed baseline; B is the strongest
   preregistered mature engineering null; C is the relevant composition of
   existing project principles or candidates. All arms see the same latent
   world through the same declared observation and actuator boundary. Oracle
   fields are evaluator-only. If additional assays are the tested resource,
   their count, latency, material, and cost are charged.
5. **Tuning:** A/B/C receive the same development worlds and declared tuning
   budget. Confirmation and transfer perform no model selection,
   hyperparameter search, threshold repair, seed deletion, or stopping-rule
   change.
6. **Primary estimand:** every track freezes one finite seed-level loss
   $L_{g,s}$, its native unit, observation horizon, denominator where one is
   used, and terminal-failure score before confirmation. For a required
   fractional reduction $r$, B versus A uses the shifted paired contrast

   $$
   D^{B:A}_s=L_{B,s}-(1-r)L_{A,s}.
   $$

   C versus B uses the analogous $D^{C:B}_s$. This avoids unstable ratios and
   remains defined when a comparator loss is zero: $L_A=L_B=0$ gives no
   improvement credit and cannot pass an improvement gate, while $L_A=0<L_B$
   fails. A resource route uses
   $D^{R,C:B}_s=R_{C,s}-(1-r_R)R_{B,s}$ in the resource's declared native unit.
   Loss and resource routes are never mixed in one scalar.
7. **Confirmatory calculation:** the seed-cluster mean of the applicable
   shifted contrast is the estimand. Confirmation uses a one-sided, centred
   cluster bootstrap-$t$: for track $j$, centre
   $e_{j,s}=D_{j,s}-\bar D_j$, resample the same seed indices jointly across all
   ten tracks, and calculate
   $T^*_{j,b}=\bar e^*_{j,b}/(s^*_{j,b}/\sqrt n)$. The observed statistic is
   $T_{j,obs}=\bar D_j/(s_{D,j}/\sqrt n)$. If
   $s^*_{j,b}=0$, set $T^*_{j,b}=0$ rather than mixing native-unit values across
   tracks. Exactly 20,000 replicates use
   `SHA256("ENV-v2|contrast|bootstrap")` as a 256-bit little-endian seed. The
   one-sided raw $p_j$ is
   $(1+\#\{T^*_{j,b}\le T_{j,obs}\})/(20000+1)$. Let
   $c_{0.01}$ be the empirical 0.01 quantile of
   $\min_jT^*_{j,b}$, using the conservative lower order statistic
   $\lceil0.01(20000+1)\rceil$. The simultaneous upper bound is
   $U_j=\bar D_j-c_{0.01}s_{D,j}/\sqrt n$. A zero-variance nonzero contrast uses
   its signed constant directly: negative has $p=1/(20000+1)$ and
   $U_j=\bar D_j$; positive has $p=1$ and $U_j=\bar D_j$. An all-zero contrast
   has $p=1$ and $U_j=0$. Holm controls the ten B-versus-A raw bootstrap-$t$
   $p$-values at familywise $\alpha=0.01$ and, separately, the ten C-versus-B
   values.

   A preregistered **symmetry sensitivity**, not the confirmatory randomization
   test, sign-flips the uncentred seed contrasts about the zero boundary and
   uses the same studentized statistic. It exhaustively enumerates all
   $2^n$ vectors only when $n\le20$; otherwise it uses exactly 100,000 distinct
   vectors without replacement from
   `SHA256("ENV-v2|track|contrast|sign")`. Its plus-one Monte Carlo value is
   $(1+N_{\le T_{obs}})/(100000+1)$ and is never called exact. Development
   reports skewness and type-I calibration under the frozen null DGP, so this
   sensitivity cannot silently substitute a symmetry assumption for the
   bootstrap gate.
8. **Boundary and novelty gates:** B passes confirmation only when its Holm-
   adjusted one-sided bootstrap-$t$ $p\le0.01$, the simultaneous 99% upper bound
   for $E[D^{B:A}_s]$ is **strictly below zero**, and all protected gates pass.
   On transfer, use the same contrast with $r/2$; its upper bound must also be
   strictly below zero and its prespecified one-sided $p\le0.01$. Before
   confirmation C selects either a 10% loss reduction or a 15% named-resource
   reduction. The resource route also freezes the paired primary-loss
   non-inferiority contrast
   $D^{NI,C:B}_s=L_{C,s}-L_{B,s}-0.01L^{max}_s$, where $L^{max}_s$ is that protocol's
   registered finite terminal-failure loss in the primary unit; its simultaneous
   99% upper bound must be at most zero. If $k$ tracks select a resource route,
   their $k$ NI contrasts form a separate preregistered family: the same joint
   seed resamples calculate the 0.01 quantile of the minimum of their
   dimensionless bootstrap-$t$ statistics, giving simultaneous 99% upper bounds
   across those $k$ gates (and no NI family when $k=0$). They are not silently
   inserted into, or omitted from, the ten selected novelty contrasts. The
   corresponding resource contrast and
   all other protected gates remain mandatory. Transfer uses half the selected
   improvement and half the 1% loss margin. Equality at an improvement margin,
   a failed protected gate, or an unselected post-hoc route kills novelty.
9. **Development-only sensitivity:** the 64 development seeds alone determine
   nuisance choices and a simulation-based power/sensitivity report for the
   frozen shifted contrast, including zero-heavy losses, 1%, 5%, and 10%
   contamination, and the registered terminal-failure score. The report states
   detectable effects at 80% power; it cannot change a threshold, seed count,
   loss, or exclusion after confirmation keys are released.
10. **Uncertainty:** DGP parameter variation is sampled at seed level. Proper
   interval score and coverage are reported wherever an arm emits uncertainty.
   Unbounded or non-finite intervals fail. A point estimate cannot replace an
   interval at a safety or compliance boundary.
11. **Feasibility:** eight development seeds form a shakedown. Projected limit
    per track is 8 wall-clock hours, 16 logical CPU cores, 32 GiB peak RAM, and
    40 GiB writable artifacts. A resolution change is permitted only on
    development, followed by a new manifest and complete freeze. More than 5%
    solver or numerical failures on confirmation makes the track infeasible.
12. **Failure retention:** every seed, abort, timeout, invalid result, and
    refusal remains in analysis. Arm-specific failure receives the frozen
    worst-case loss. Missing time after a simulated shutdown or breakthrough is
    not deleted.
13. **Stopping:** there is no optional early efficacy stop. All frozen seeds run
    unless a feasibility or protected structural failure terminates the track.
    The reason and remaining scheduled observations are persisted.
14. **Abstention:** abstention is a decision with nonzero loss. It invokes the
    frozen safe fallback and incurs its compute, delay, material, and service
    cost. Non-safety answer or action coverage may not fall more than one
    percentage point below B. An interval crossing a frozen safety or
    compliance boundary forces abstention.
15. **Protected failures:** unit mismatch, oracle leakage, confirmation tuning,
    omitted failed run, unauthorized real-world action, hidden threshold or
    version, broken conservation accounting, or presentation of simulated
    process energy as measured compute energy fails the track regardless of
    mean loss.
16. **Resource boundary:** report CPU-seconds, wall-seconds, peak resident bytes,
    bytes read and written, artifact bytes, assay count, chemicals in kg, media
    in kg, water in m$^3$, and operator time in h where applicable. Simulated
    process electricity is reported in kWh and labelled `simulated`.
    Workstation joules and carbon are `not measured`; no "20 W" compute claim is
    permitted without a separately preregistered calibrated power-meter
    boundary.
17. **Execution state:** a passing implementation would remain
    `protocol_complete`. No protocol below has been implemented or executed, and
    no result is reported in this fixture or its canonical audit.

### ENV-T01 — RTD, bypass, and flow-history contract

- **Claim:** `C-1470`.
- **Primary unit and units:** one supported continuous-flow graph with three
  independent tracer episodes; time (s, h, d), volume (m$^3$), flow
  (m$^3$/s), concentration (kg/m$^3$), mass (kg), and first-order rate
  (d$^{-1}$).
- **Frozen DGP:** sample the supported residence regime before geometry. Draw
  nominal $\tau_n\sim\operatorname{logU}(6,72)$ h, inlet
  $Q\sim\operatorname{logU}(0.01,1)$ m$^3$/s, and set total liquid volume
  $V=Q\tau_n$ after converting hours to seconds. Draw
   $N\sim U_{\mathbb Z}\{6,20\}$, bypass fraction $b\sim U(0,0.20)$,
   stagnant fraction $f_s\sim U(0.02,0.30)$, and recirculation ratio
   $r_c\sim U(0,0.60)$. Draw the active-compartment count
   $m\sim U_{\mathbb Z}\{3,N-1\}$. A Dirichlet$(2,\ldots,2)$ draw allocates
   $(1-f_s)V$ among active compartments in a serial chain; a second such draw
   allocates $f_sV$ among the $N-m$ side compartments. Main inlet and outlet
   flow are $(1-b)Q$, chain throughflow is $(1-b+r_c)Q$, the last-to-first
   recycle is $r_cQ$, and the direct inlet-to-outlet bypass is $bQ$. Each side
   compartment attaches to active node
   `1 + (uint64(SHA256(seed|side-ID)) mod m)` and exchanges equal bidirectional flow
   $q_{ex}=V_{side}/\tau_{ex}$ with
   $\tau_{ex}\sim\operatorname{logU}(0.25\tau_n,4\tau_n)$. This algorithm, edge
   order, and all draws are serialized before simulation. Resample if any
   compartment receives less than 0.5% of $V$, any flow is negative, or inlet,
   outlet, bypass, recycle, exchange, or node closure exceeds
   $10^{-12}$ m$^3$/s.
- **Frozen integration and horizon:** with $q_{i,out}$ the total advective and
  exchange outflow of node $i$, define
  $\tau_{fast}=\min_i V_i/q_{i,out}$. Draw reaction rate zero with probability
  0.2 and otherwise $k\sim\operatorname{logU}(0.01,2)$ d$^{-1}$. Use
  $\Delta t=\min(30\text{ s},\tau_{fast}/40,(1/k)/40)$ after converting every
  lifetime to seconds, omitting the last term when $k=0$, and reject a graph
  with $\tau_{fast}<5$ min. A preliminary conservative impulse runs until 99.9%
  recovery or 60 d, whichever comes first, to obtain latent $t_{99.9}$;
  ordinary worlds are resampled unless a finite $t_{99.9}\le30$ d is obtained.
  Each episode runs for
  $H=\max(10\tau_n,t_{99.9}+2\tau_n)$, capped at 60 d. At the cap, unrecovered
  mass and every unavailable RTD quantile are right-censored with the remaining
  stored mass recorded; they are never imputed or dropped.
- **Observation and episode map:** inject one conservative 1 kg calibration
  pulse, one conservative 1 kg evaluation pulse, and one reactive 1 kg
  evaluation pulse into separate zero-tracer initial states. Five-minute outlet
  observations have a seed-frozen first-order sensor lag $U(1,20)$ min and
  Gaussian standard deviation equal to $U(0.005,0.03)$
  of the episode peak; raw signed readings and the censor flag are retained.
- **Arms:** A uses ideal CSTR or plug flow with $V/Q$; B uses a tracer-calibrated
  tanks-in-series plus axial-dispersion model; C uses P-012/P-013 versioned graph
  and flow-history state.
- **Mature null:** B receives the calibration pulse and all declared flow
  observations, then fits only on development/calibration periods.
- **Transfer family:** held-out looped graphs, correlated storm inflows, and
  temperature-dependent rates; no transfer parameter is tuned on confirmation.
- **Primary metric and threshold:** for episode $p$, let $M^{early}_p$ be outlet
  mass by $0.25\tau_n$ and $M^{conv}_p$ be reacted mass at $H$. The seed loss is

  $$
  L_s=\sum_{p\in\{2,3\}}\left(
  |\widehat M^{early}_p-M^{early}_p|+
  |\widehat M^{conv}_p-M^{conv}_p|\right)\ \text{kg}.
  $$

   Evaluator truth includes reacted, outlet, and still-stored mass, so right-
   censored RTD quantiles do not erase either primary mass term. Each arm must
   return two point estimates in $[0,1]$ kg per evaluation episode; if it also
   returns an interval, the point used above is its declared pre-confirmation
   centre and interval score is secondary. A missing or out-of-range estimate,
   non-finite state, broken closure, or interval not contained in $[0,1]$ kg
   receives $L_s=4$ kg. B uses $r=0.20$ in the common shifted contrast.
- **Secondary metrics:** errors in $t_{10}$, $t_{50}$, and $t_{90}$ (h); escaped
  tracer mass (kg); reaction-conversion error (kg); 99% interval coverage (%);
  CPU and artifact resources.
- **Protected gates:** coverage 97--100%; non-negative concentrations; relative
  constituent closure below $10^{-7}$; identical pulse and observation support
  across arms.
- **Stopping/abstention:** non-conservative tracer closure, negative
  concentration, or unstable solver receives worst-case loss. An arm abstains
  when an RTD quantile is unbounded.
- **Novelty/kill:** C must clear the common performance or resource gate against
  B; parity kills the composition.
- **Artifacts:** `world-manifest.json`, `flows.parquet`, `tracer.parquet`,
  `rtd-estimates.jsonl`, `mass-closure.csv`, `seed-outcomes.jsonl`.

### ENV-T02 — HRT, SRT, and population washout

- **Claim:** `C-1471`.
- **Primary unit and units:** one 365-day biological-treatment world; HRT (h),
  SRT (d), concentration (mg N/L), load (kg N/d), biomass (kg), oxygen
  (mg O$_2$/L), temperature (degrees Celsius), and simulated electricity (kWh).
- **Frozen hydraulic and population DGP:** truth resolution is 15 min. Draw
  $R\sim U_{\mathbb Z}\{2,5\}$ reactors, flow
  $Q\sim\operatorname{logU}(0.02,2)$ m$^3$/s, HRT $\theta\sim U(4,24)$ h, and
  total volume $V=Q\theta$ after conversion to seconds. Allocate $V$ with a
  Dirichlet$(3,\ldots,3)$ draw in a serial chain. Fresh inlet and final effluent
  are $Q$; a final-to-first recycle $R_QQ$ uses $R_Q\sim U(0.25,1.5)$, so every
  chain edge carries $(1+R_Q)Q$ and the final splitter returns $R_QQ$ while
  discharging $Q$. Dissolved species use those liquid concentrations. A perfect
  clarifier prevents biomass in the final $Q$ outlet and returns all
  $(1+R_Q)QX_{g,R}$ final-reactor biomass flux in the recycle at concentration
  $(1+R_Q)X_{g,R}/R_Q$; this closes each guild before wasting. A proportional wasting
  sink removes $M_{X,g}/\theta_c$ kg/d from every guild $g$, distributed among
  tanks in proportion to its current guild mass, where SRT
  $\theta_c\sim U(3,40)$ d is independent of HRT. Thus, with growth and decay
  disabled, total guild mass has exactly the declared solids lifetime; recycle
  changes location but not inventory.
- **Frozen reactions and initial state:** dissolved NH$_4$-N, NO$_2$-N, and
  NO$_3$-N and AOB/NOB biomass are advected by the declared flow matrix. In each
  reactor (all concentrations in mg/L and time in d),

  $$
  r_A=\mu_A(T)X_A\frac{S_{NH4}}{0.5+S_{NH4}}
      \frac{S_O}{0.4+S_O},\qquad
  r_N=\mu_N(T)X_N\frac{S_{NO2}}{0.2+S_{NO2}}
      \frac{S_O}{0.6+S_O},
  $$

  with $\mu_A(20)=0.8$ d$^{-1}$, $\mu_N(20)=0.7$ d$^{-1}$,
  $\mu_g(T)=\mu_g(20)1.072^{T-20}$, decay 0.15 and 0.10 d$^{-1}$, and yields
  $Y_A=0.15$, $Y_N=0.04$ mg biomass/mg N, and biomass N content
  $i_N=0.12$ mg N/mg biomass. AOB consume $r_A/Y_A$ NH$_4$-N, incorporate
  $i_Nr_A$, and produce the remainder as NO$_2$-N; NOB consume $r_N/Y_N$
  NO$_2$-N, incorporate $i_Nr_N$, and produce the remainder as NO$_3$-N.
  Decay returns $i_Nb_gX_g$ to NH$_4$-N; wasting exports and records $i_N$ times
  wasted biomass. Guild growth is $r_g$, followed by decay and the wasting sink.
  Each of the six kinetic/yield numbers receives
  one seed-level lognormal multiplier with CV 0.25. Negative states are rejected.
  Initialise every reactor with NH$_4$-N at baseline influent, NO$_2$-N and
  NO$_3$-N at zero, and each guild at 0.1 mg biomass/L, then integrate constant baseline influent for
  $10\max(\theta/24,\theta_c)$ d or until every state $x$ satisfies
  $|\dot x|/\max(|x|,x_{ref})<10^{-8}$ d$^{-1}$, using
  $x_{ref}=0.01$ mg N/L for dissolved species and 0.001 mg biomass/L for guilds.
  Failure to converge within that horizon resamples the world under the common
  10,000-attempt generator cap.
- **Frozen forcing and observations:** mean temperature is $U(12,22)$ degrees
  Celsius with annual sinusoidal amplitude $U(2,8)$ and phase $U(0,2\pi)$; DO
  is a seed-fixed $U(0.3,4)$ mg O$_2$/L.
  Baseline influent NH$_4$-N is log-uniform 15--800 mg/L, with NO$_2$-N zero
  and NO$_3$-N $U(0,10)$ mg/L. Hourly
  $z_h=0.98z_{h-1}+\eta_h$, $\eta_h\sim N(0,0.1^2)$, starts in its stationary
  normal distribution and multiplies all influent N by
  $\exp(z_h-\operatorname{Var}(z)/2)$. Draw
  $K=\min(12,\operatorname{Poisson}(6))$ non-overlapping shocks, with onset
  uniform over days 15--350, duration log-uniform 2--48 h, and multiplier
  log-uniform 2--10. All forcing is zero-order held at the truth step. Flow,
  temperature, DO, and wasting are observed every 15 min with 1% Gaussian CV;
  influent and effluent N species every 6 h with 5% CV and LOD 0.01 mg N/L,
  returning $[0,\mathrm{LOD}]$ below it. All arms receive identical samples.
- **Arms:** A uses HRT-only fixed first-order removal; B uses a calibrated
  guild-resolved activated-sludge state-space model with explicit SRT; C uses
  P-004/P-005/P-012 lifetime-qualified population specialisation and history.
- **Mature null:** the guild-resolved process model receives the same influent,
  wasting, recycle, DO, and temperature observations as C.
- **Transfer family:** attached-retention and comammox-like guild families plus
  unseen temperature/load correlation.
- **Primary metric and threshold:** let $M_{d,j}$ be the daily integrated
  effluent mass, in kg N rather than kg N/d, of ammonium or nitrite. Freeze

  $$
  L_s=\sum_{d=1}^{365}\sum_{j\in\{NH_4,NO_2\}}
  |\widehat M_{d,j}-M_{d,j}|\quad\text{kg N}.
  $$

  Let $B_s$ be initial dissolved plus $i_N$-weighted biomass N plus all 365-day
  influent N, in kg. Every daily constituent truth and prediction is constrained
  to $[0,B_s]$. A missing/out-of-range
  prediction, non-finite population state, negative guild mass, or broken
  nitrogen ledger receives $L_{fail}=730B_s$, the finite endpoint maximum for
  365 days times two constituents. B uses
  $r=0.25$.
- **Secondary metrics:** 95th-percentile NH$_4$-N and NO$_2$-N (mg N/L);
  washout classification and timing (d); recovery (d); violation duration (h);
  simulated aeration electricity (kWh); biomass and nitrogen closure.
- **Protected gates:** violation hours no more than 1% above comparator;
  relative nitrogen closure below $10^{-6}$; no negative guild mass.
- **Stopping/abstention:** a non-finite growth rate or negative mass fails the
  seed. Control abstains under an unbounded guild-state interval and uses the
  frozen conservative wasting/aeration policy.
- **Novelty/kill:** C must beat or resource-dominate B; ordinary explicit SRT
  modelling at parity kills novelty.
- **Artifacts:** `influent.parquet`, `guild-state.parquet`, `wasting.csv`,
  `effluent.csv`, `nitrogen-closure.csv`, `seed-outcomes.jsonl`.

### ENV-T03 — Integrated wet-weather control

- **Claim:** `C-1472`.
- **Primary unit and units:** one 120-day sewer--plant--receiving-water world;
  rainfall (mm), flow (m$^3$/s), volume (m$^3$), load (kg N, kg COD), flooding
  (m$^3$ h), duration (h), and simulated electricity (kWh).
- **Frozen catchment and routing DGP:** truth resolution is 2 min. Draw
  $N\sim U_{\mathbb Z}\{20,80\}$ subcatchments, total area
  $A\sim\operatorname{logU}(2,100)$ km$^2$, and allocate area by
  Dirichlet$(2,\ldots,2)$. Node $i>1$ drains to a uniformly drawn node in
  $\{1,\ldots,i-1\}$ and node 1 drains to the plant, giving a connected directed
  tree. Impervious coefficient is $U(0.2,0.9)$; dry flow is $U(50,250)$
  L/person/d for a Dirichlet allocation of a
  $\operatorname{logU}(10^4,10^6)$ population. With $A_i$ in km$^2$ and rainfall
  intensity $I_i$ in mm/h, each runoff reservoir obeys
  $\dot V_i=10^{3}C_iA_i I_i-V_i/\tau_i$ in m$^3$/h because
  1 mm km$^2=1000$ m$^3$; all later flow conversions are explicit and
  $\tau_i\sim\operatorname{logU}(0.1,3)$ h. Sewer node storage is
  $U(0.5,5)$ times one dry-weather hour; its outlet is
  $\min(V_i/\tau_{s,i},q_{cap,i})$, where $\tau_{s,i}\sim U(0.1,2)$ h and
  $q_{cap,i}=U(1,5)$ times peak dry flow. Excess above storage is overflow.
- **Frozen storms and nitrogen ledger:** draw
  $K\sim\operatorname{Poisson}(0.15\times120)$ storm onsets from the ordered
  statistics of independent $U(0,120\text{ d})$ draws. Depth is log-uniform
  2--80 mm, duration lognormal with median 2 h and log-SD 0.6, and twelve equal-
  time hyetograph fractions are Dirichlet$(2,\ldots,2)$; overlapping intensities
  add. Surface nitrogen stock follows
  in hours as
  $\dot B_i=(k_{b,i}/24)(B_{max,i}-B_i)-k_{w,i}q_{run,i}B_i$, with
  $B_{max,i}\sim\operatorname{logU}(0.1,100)$ kg,
  $k_b\sim\operatorname{logU}(0.01,0.2)$ d$^{-1}$ divided by 24 in the equation, and
  $k_w\sim\operatorname{logU}(10^{-5},10^{-2})$ m$^{-3}$; washed mass rate is
  $k_wq_{run}B$ kg/h after converting $q$ to m$^3$/h. Dry wastewater carries
  $U(20,80)$ mg N/L. A parallel COD stock uses the identical equation with
  $B_{max,COD}\sim\operatorname{logU}(10,1000)$ kg, independently drawn
  $k_b,k_w$ from the same ranges, and dry concentration $U(100,500)$ mg COD/L.
  Every surface, sewer, plant, overflow, and reach inventory has explicit kg-N
  and kg-COD states and conservative flux rows.
- **Frozen plant, reach, observation, and action map:** plant hydraulic capacity
  is $U(1.2,3)$ times peak dry flow, equalization is $U(0,12)$ dry-flow hours,
  and independent N/COD baseline removals are
  $\eta_{0,j}\sim U(0.6,0.95)$ with
  $\eta_j(q)=\operatorname{clip}[\eta_{0,j}-0.25(q/q_{cap}-1)_+,0,1]$; flow above
  capacity bypasses. One completely mixed reach has residence time
  $U(0.5,48)$ h and independent first-order N and COD losses
  $\operatorname{logU}(0.001,0.2)$ d$^{-1}$, but primary receiving load is
  counted where plant effluent, bypass, or overflow enters it. Set equalization
  release capacity $q_{e,max}=q_{cap}$. All quantities in the following routing
  operator use m$^3$, h, m$^3$/h, and kg. If the sampled equalization duration is
  $h_e$, its capacity is $V_{e,max}=h_eq_{dry}$; initialise $V_e=0$ and
  $M_{e,N}=M_{e,COD}=0$. At each 2-min truth step of length $\Delta t$ h, let
  $q_r$ and $\dot M_{r,j}$ be root-sewer flow and constituent-$j$ flux and set
  $c_{r,j}=\dot M_{r,j}/q_r$ when $q_r>0$, otherwise zero. From the pre-step
  equalization state set $c_{e,j}=M_{e,j}/V_e$ when $V_e>0$, otherwise zero,
  compute

  $$
  q_e=\min\!\left(\frac{V_e}{1\ \mathrm h},a_eq_{e,max}\right),\quad
  V_{rel}=V_e-q_e\Delta t,\quad
  q_{store}=\min\!\left(q_r,\frac{V_{e,max}-V_{rel}}{\Delta t}\right),
  $$

  and route $q_p=q_r-q_{store}+q_e$ with
  $\dot M_{p,j}=(q_r-q_{store})c_{r,j}+q_ec_{e,j}$ to the plant. Update
  $V_e\leftarrow V_{rel}+q_{store}\Delta t$ and
  $M_{e,j}\leftarrow M_{e,j}+\Delta t(q_{store}c_{r,j}-q_ec_{e,j})$.
  Thus incoming liquid that cannot be stored goes directly to the plant rather
  than disappearing, and the recovery tail empties the same volume and mass
  states. Every 5 min an
  arm selects each node-outlet pump multiplier $a_i\in\{0,0.5,1\}$, giving
  $q_{i,out}=\min(V_i/\tau_{s,i},a_iq_{cap,i})$; equalization release multiplier
  $a_e\in\{0,0.5,1\}$ enters the routing operator above; and plant setpoint
  $a_p\in\{0.75,1,1.25\}$ replaces $q_{cap}$ by $a_pq_{cap}$ in both bypass and
  $\eta_j(q)$. Pump heads are seed-fixed $U(5,30)$ m and efficiencies 0.70; with
  $\rho=1000$ kg/m$^3$ and $g=9.80665$ m/s$^2$, simulated electricity is
  $\rho gq h\Delta t/(0.70\times3.6\times10^6)$ kWh
  after SI conversion. Impossible actions clip and are logged. Rain/level/flow/N/COD sensors have 2%
  Gaussian CV and a seed-fixed $U(0,15)$ min delay; actuator delay is
  $U(2,20)$ min.
  Forecast depth and duration are multiplied by independent mean-one lognormal
  errors with log-SD 0.35, and onset error is $N(0,(20\text{ min})^2)$.
- **Arms:** A uses independent local level, pump, and plant-setpoint rules; B
  uses robust integrated model-predictive control over the complete graph; C
  uses P-002/P-006/P-008/P-013 hierarchy with local fallback and versioned
  shared state.
- **Mature null:** constrained robust MPC sees the same forecasts and actuator
  states as C and optimizes the same declared system boundary.
- **Transfer family:** clustered storms, one network loop, correlated
  sensor/actuator failure, and an unseen receiving-water response time.
- **Primary metric and threshold:** after day 120, run a 30-day no-new-storm
  recovery with dry flow, safe local control, and every stored liquid and N mass
  retained until discharged or transformed. Freeze
  $L_s=\int_0^{150d}\dot M_{N,receiving}(t)\,dt$ in kg N, including treatment
  effluent, overflow, and bypass. At a failure time $t_f$, set
  $L_{fail}$ to load accrued before $t_f$ plus every kg N then present in
  surface, sewer, plant, and reach states plus all already scheduled influent N
  through day 150. This deliberately conservative finite terminal score prevents
  stored mass or a stopped run from improving the result. B uses $r=0.15$.
- **Secondary metrics:** COD discharge (kg COD); CSO volume (m$^3$); flooding
  (m$^3$ h); effluent noncompliance (h and kg); receiving-threshold exceedance
  (h); simulated pumping electricity (kWh).
- **Protected gates:** no increase in flooding; COD and compliance no more than
  1% worse; simulated electricity no more than 5% worse; complete storage and
  pollutant closure.
- **Stopping/abstention:** an infeasible action is rejected and replaced with
  local safe control. Omitted overflow or storage mass fails the seed.
- **Novelty/kill:** C must clear the common gate against robust integrated MPC;
  lower algorithmic complexity alone is insufficient unless resource reduction
  is registered and protected outcomes remain non-inferior.
- **Artifacts:** `network.json`, `storms.parquet`, `forecasts.parquet`,
  `actions.parquet`, `system-loads.csv`, `protected-events.csv`.

### ENV-T04 — Sensor and process anomaly isolation

- **Claim:** `C-1473`.
- **Primary unit and units:** one 180-day instrumented plant world; channel time
  (h), detection delay (h), false alarms per 1,000 channel-h, concentrations in
  their declared process units, and maintenance/assay counts.
- **Frozen DGP:** use a 12-state synthetic process in standardized state units
  with a 5 min fourth-order Runge--Kutta truth step. Generate an orthogonal
  matrix $Q_x$ by QR decomposition of a seed-normal matrix, changing each
  column sign so the corresponding diagonal of $R$ is positive, and rates
  $\lambda_i\sim\operatorname{logU}(1/48,1/2)$ h$^{-1}$; then
  $A=Q_x\operatorname{diag}(-\lambda_i)Q_x^\top$. Draw fixed sparse matrices
  $B\in\mathbb R^{12\times6}$ and $E\in\mathbb R^{12\times8}$ in h$^{-1}$,
  and $H\in\mathbb R^{18\times12}$. Each entry is independently zero with
  probability 0.7 and otherwise $N(0,1)$; normalize every nonzero column of
  $B,E$ and every nonzero row of $H$ to unit Euclidean norm. Resample a zero
  column/row or a controllability/observability numerical rank below 12, using
  tolerance $10^{-10}$ times the largest singular value. Set
  $x(0)\sim N(0,0.25^2I)$, $u_0=0$, and $d=0$ outside declared events. Truth
  follows

  $$
  \dot x=Ax+Bu+0.02\,\Lambda\tanh(x)+Ed,
  \qquad y^0=Hx+\epsilon,\quad y=\mathcal F(y^0),
  $$

  where $\Lambda=\operatorname{diag}(\lambda_i)$ and $d$ is a piecewise-
  constant process disturbance. The typed fault operator $\mathcal F$ adds bias,
  drift, or cross-sensitivity; holds the last pre-fault value for freeze; emits a
  missing flag for dropout; and scales $y^0$ for multiplicative fouling. Thus no
  multiplicative fault is silently represented as an additive state. Finally,
  $\epsilon_j\sim N(0,\sigma_j^2)$ with
  $\sigma_j\sim\operatorname{logU}(0.01,0.10)$ standardized units. A committed
  scale table maps every $x_i$ and $y_j$ to its displayed native concentration,
  flow, oxygen, pressure, or temperature unit; arms receive both value and unit.
- **Fault, observation, and maintenance map:** schedule
  $U_{\mathbb Z}\{24,60\}$ non-overlapping sensor faults and
  $U_{\mathbb Z}\{12,30\}$ process disturbances, with onset uniform over days
  7--170. Fault and step duration is log-uniform 0.5--72 h; a ramp instead draws
  its complete event duration $U(2,24)$ h. The six fault types are
  equiprobable. Sensor faults are bias $U(1,5)\sigma_j$, drift
  $U(0.1,1)\sigma_j$/d, freeze, dropout, multiplicative fouling $U(0.6,0.95)$,
  or cross-sensitivity to one other channel with coefficient $U(0.1,0.5)$.
  Disturbances choose a column of $E$ uniformly and are equiprobable steps or
  linear ramps across their declared event duration, with signed amplitude $U(1,4)$ standardized
  state units; sign is equiprobable. On a Bernoulli(0.20) seed flag, replace one
  ordinary event by an executable equivalence episode. Draw a process step as
  above and integrate its open-loop, noise-free output residual $r(t)$ for 6 h
  with $u=u_0$. A fair latent coin then instantiates either that process step or
  a synthetic multichannel calibration-map sensor fault
  $\mathcal F(y^0)=y^0+r(t)$, while control remains $u_0$ for those 6 h. The two
  observable trajectories are therefore identical by construction; its truth
  label is the two-member set `{process step, calibration-map fault}` until hour
  6, after which ordinary observation/control resumes. Calibration every 14 d
  observes a certified zero/span with 0.25 $\sigma_j$ noise. A completed
  maintenance action after a $U(2,12)$ h delay draws
  $\rho\sim U(0.8,1)$. It multiplies additive bias, accumulated drift, and
  cross-sensitivity coefficient by $1-\rho$; maps a multiplicative fouling
  factor $m$ to $1-(1-\rho)(1-m)$; and clears a freeze or dropout exactly when a
  precommitted hash-keyed $U(0,1)$ draw is at most $\rho$. Otherwise that
  categorical fault remains. During a calibration-map equivalence episode,
  `maintain(channel j)` treats $r_j(t)$ as an additive fault state and multiplies
  that component by $1-\rho$ for the episode's remainder; the latent process-step
  branch is physically unaffected. The intervention may therefore break the
  pre-intervention observational equivalence and is logged as such. The completion record contains the actual typed
  transition and a versioned status bit; only a failed categorical repair can
  emit false `success`, with precommitted Bernoulli(0.02) probability.
  Event intervals are half-open; a rejected overlap is resampled in channel,
  onset, duration order. A `consequential` event is frozen as one whose
  no-fallback counterfactual leaves $|x_i|>3$ for at least 30 min.
- **Action and safe-state map:** actions update every 15 min and obey
  $u=\operatorname{clip}(u_0-K\hat x,-1,1)$, where $K$ is the discrete LQR gain
  computed by zero-order-hold discretization at 15 min from the manifest-declared
  $(A,B)$, with identity state cost and $0.1I$ action cost. These nominal matrices
  are available equally to all arms; event labels and fault states are not.
  At the same update an arm emits no alarm or one or more alarm records. Every
  alarm record must name exactly one of the 18 channels and carry a set of
  sensor/process labels; a multichannel alarm therefore emits one record per
  implicated channel. A record without a valid channel is a malformed terminal
  output and receives $L_{fail,s}$. The arm also emits one request from `none`,
  `calibrate(channel)`, or
  `maintain(channel)`; busy duplicate requests are rejected. A maintenance
  request starts the declared 2--12 h delay, while calibration returns at the
  next 15 min boundary. Protected state is $|x_i|\le3$ for all $i$. An
  unresolved consequential anomaly invokes $u_0$ and an immediate calibration
  request; unsafe-control exposure $U_s$ is the number of hours outside the
  protected set before verified fallback or repair. The evaluator logs every
  alarm, diagnosis set, action, request, completion, and state excursion.
  Repeated alarm records from one channel within one clock-hour form one alarm
  episode. Its timestamp and diagnosis set are those of the earliest record,
  with stable record hash breaking an equal-timestamp tie; later records remain
  logged but cannot enlarge that set. There are therefore exactly
  $18\times4320$ possible false-alarm bins.
- **Frozen alarm/event matching:** all scheduled event intervals are mutually
  non-overlapping. Process them by onset. The first unassigned alarm episode in
  $[t_{on},\min(t_{on}+24\text{ h},t_{off}+24\text{ h})]$ is that event's
  detection (earliest timestamp, then lowest channel index) and sets
  $d_e=t_{alarm}-t_{on}$; if none occurs, set $d_e=24$ h and
  the returned diagnosis to the empty set. The empty set does not increment
  $N_W$, but a consequential event with neither isolation nor verified fallback
  still increments $N_U$. Every other alarm episode is unmatched and enters
  $N_{FA}$, including duplicates during an event. A matched diagnosis is wrong
  only when its returned set is disjoint from the singleton truth label or, in
  the first 6 h of the constructed episode, from both equivalence labels.
  $N_W$ counts those disjoint sets. An event is isolated when the set intersects
  truth; $N_U$ counts consequential events lacking isolation or verified
  fallback within 6 h. Hour-bin assignment uses alarm timestamp floor-to-hour;
  each channel-hour bin with one or more unmatched alarms counts once.
- **Arms:** A uses static univariate 3-SD thresholds; B uses moving-window
  multiscale PCA plus an observer/residual bank and maintenance events; C uses
  P-007/P-009/P-013 with CAND-014 versioned observation contracts.
- **Mature null:** B receives the same multivariate channels, calibration, and
  maintenance records as C and may emit set-valued diagnoses.
- **Transfer family:** unseen compound faults, maintenance-log omission, and
  correlated sensor drift.
- **Primary metric and threshold:** with
  $N_{bin}=18\times180\times24$ channel-hour alarm bins and
  $H_s=N_{bin}$ channel-h,
  $N_{FA}$ false alarms, event delays $d_e$ capped at 24 h, $N_W$ uniquely wrong
  diagnoses, unsafe exposure $U_s$ in h, and $N_U$ consequential events neither
  isolated nor placed in fallback within 6 h, freeze

  $$
  L_s=\frac{1000\text{ channel-h}}{H_s}\left[
  0.25\text{ h}\,N_{FA}+\sum_e\min(d_e,24\text{ h})+
  8\text{ h}\,N_W+4U_s+12\text{ h}\,N_U\right].
  $$

  The unit is h-equivalent per 1,000 channel-h. With $N_E$ scheduled faults plus
  disturbances, terminal failure is

  $$
  L_{fail,s}=\frac{1000\text{ channel-h}}{H_s}\left[
  0.25\text{ h}\,N_{bin}+(24+8+12)\text{ h}\,N_E+
  4(4320\text{ h})\right],
  $$

  corresponding to a deliberately punitive all-bin alarm ceiling (which is no
  smaller than the realizable fault-free-bin count), every
  event delayed 24 h and wrongly uncontained, and full-horizon unsafe exposure.
  B uses $r=0.20$.
- **Secondary metrics:** false alarms per 1,000 channel-h; detection delay (h);
  set-valued isolation coverage (%); macro-F1 on identifiable cases; process-
  versus-sensor confusion (%); bad-control exposure (h); abstention and assay
  count.
- **Protected gates:** set-valued isolation coverage at least 97%; no increase
  in unsafe-control exposure; no event-level pseudo-replication; equivalence-set
  cases excluded from unique-label F1 but included in coverage.
- **Stopping/abstention:** a forced unique label for an evaluator-declared
  equivalence set is an error. Unresolved consequential anomalies force safe
  control fallback; its calibration, delay, and lost-control-service costs stay
  in $L_s$ and the resource ledger.
- **Novelty/kill:** C must beat or resource-dominate the complete adaptive
  multivariate null; merely storing a version field does not survive.
- **Artifacts:** `sensor-stream.parquet`, `fault-truth.enc`,
  `maintenance-events.jsonl`, `diagnoses.jsonl`, `control-exposure.csv`.

### ENV-T05 — Membrane fouling and cleaning history

- **Claim:** `C-1474`.
- **Primary unit and units:** one 180-day membrane world; flux
  (L m$^{-2}$ h$^{-1}$), pressure (kPa), resistance (m$^{-1}$), solids (g/L),
  permeate (m$^3$), chemicals (kg), downtime (h), and simulated electricity
  (kWh).
- **Frozen DGP:** truth resolution is 10 min. Draw membrane area
  $A_m\sim\operatorname{logU}(200,5000)$ m$^2$, clean resistance
  $R_m\sim\operatorname{logU}(2\times10^{11},2\times10^{12})$ m$^{-1}$,
  demanded flux $J_d\sim U(10,40)$ L m$^{-2}$ h$^{-1}$, feed solids baseline
  $C_{s,0}\sim\operatorname{logU}(0.05,10)$ g/L, temperature $T\sim U(8,30)$
  degrees Celsius, and TMP limit $P_{lim}\sim U(50,300)$ kPa. Dynamic viscosity
  is $\mu(T)=1.002\times10^{-3}\exp[-0.025(T-20)]$ Pa s. At each step Darcy's
  equation uses the commanded flux converted to m/s:
  $\Delta P=\mu J(R_m+R_c+R_i)$; $P_{lim}$ is converted from kPa to Pa before
  comparison.
- **Fouling and quality transitions:** for $\Delta h=1/6$ h,

  $$
  \begin{aligned}
  R_c'&=R_c e^{-k_r\Delta h}+
    a_c(C_s/1\text{ g L}^{-1})(J/20\text{ L m}^{-2}\text{h}^{-1})\Delta h,\\
  R_i'&=R_i+
    a_i(C_s/1\text{ g L}^{-1})(J/20\text{ L m}^{-2}\text{h}^{-1})\Delta h,
  \end{aligned}
  $$

  with initial $R_c=R_i=d=0$, $k_r\sim\operatorname{logU}(0.005,0.10)$ h$^{-1}$,
  $a_c\sim\operatorname{logU}(10^9,10^{11})$ m$^{-1}$ h$^{-1}$, and
  $a_i\sim\operatorname{logU}(10^7,10^9)$ m$^{-1}$ h$^{-1}$. Draw
  $K\sim U_{\mathbb Z}\{0,12\}$ non-overlapping feed shocks; onset is uniform
  over days 10--170, duration log-uniform 2--24 h, and multiplier log-uniform
  2--10. Candidate intervals are sorted by onset and overlaps resampled in that
  order. Baseline rejection
  $\eta_0\sim U(0.995,0.9999)$ and permeate solids are
  $C_p=C_s\operatorname{clip}(1-\eta_0+d,0,1)$, where damage $d$ starts at zero and each chemical
  clean adds $U(0,5\times10^{-4})$; the seed-frozen quality limit is
  $C_{lim}=0.01C_{s,0}$ g/L. Backwash removes $U(0.6,0.9)$ of $R_c$ in 20 min;
  chemical cleaning removes $U(0.85,0.99)$ of $R_c$ and $U(0,0.2)$ of $R_i$
  in 6 h. For
  each action, its day-zero removal fraction is multiplied at day $t$ by
  $1-\delta t/(180\text{ d})$, $\delta\sim U(0,0.30)$; this is a relative, not
  percentage-point, decline and is clipped to $[0,1]$.
  Backwash consumes $U(0.5,2)$ L/m$^2$ water and a chemical clean consumes
  $U(0.1,2)$ kg chemical; membrane mass is $U(0.2,2)$ kg/m$^2$. These
  seed-frozen draws are identical across arms.
- **Observation map:** flux and TMP arrive every 10 min with 1% Gaussian CV;
  feed solids and permeate solids arrive every 6 h with 5% CV, analytical LOD
  $10^{-4}C_{s,0}$, interval output $[0,\mathrm{LOD}]$ below it, and the committed
  g/L unit. Cleaning completion is observed without delay but recovery is known
  only through subsequent pressure/flux observations. All arms receive the same
  samples, censor flags, and maintenance-event versions.
- **Action and service map:** every 10 min an arm selects flux from
  $\{0,0.5J_d,J_d,1.25J_d\}$, starts an available cleaning action, or replaces
  the membrane. Only one backwash, clean, or replacement may be active; flux is
  forced to zero throughout its 20 min, 6 h, or 48 h interval, and a request
  while busy is rejected and logged. Replacement restores $R_c=R_i=d=0$ and charges the
  seed-frozen membrane mass and replacement record. Gross
  volume is $A_mJ\Delta h/1000$ m$^3$. Compliant service is at most demanded
  volume and requires $C_p\le C_{lim}$ and $\Delta P\le P_{lim}$; excess and
  noncompliant production are not service. Pumping electricity is simulated
  from hydraulic work $\Delta P\,V/(0.65\times3.6\times10^6)$ kWh. Every action,
  cleaning interval, chemical mass, pressure trip, and quality state is logged.
- **Arms:** A uses fixed critical flux and fixed cleaning interval; B uses a
  nonlinear fouling-state estimator and constrained MPC; C uses
  P-005/P-009/P-012 history and maintenance state.
- **Mature null:** B receives the same feed, pressure, flux, permeate-quality,
  and cleaning observations as C.
- **Transfer family:** held-out membrane/feed family, irreversible ageing step,
  and cleaning-chemistry change.
- **Primary metric and threshold:** let $V_{dem}$ be the 180-day integral of
  $A_mJ_d/1000$, $V_{comp}$ delivered compliant service capped by contemporaneous
  demand, and $V_{non}$ gross volume produced above either quality or TMP limit.
  Freeze

  $$
  L_s=(V_{dem}-V_{comp})+2V_{non}\quad\text{m}^3.
  $$

  Shutdown therefore remains unmet service rather than missing data. A
  non-finite state, broken volume ledger, or action outside the frozen set gets
  $L_{fail}=V_{dem}+2V_{gross,max}$, where
  $V_{gross,max}=A_m(1.25J_d)(180\times24\text{ h})/1000$ m$^3$. B uses
  $r=0.15$.
- **Secondary metrics:** net permeate (m$^3$); TMP and exceedance (kPa, h);
  irreversible resistance (m$^{-1}$); cleaning chemicals (kg); downtime (h);
  simulated pumping electricity (kWh); membrane replacements (count).
- **Protected gates:** zero additional quality violations; TMP exceedance no
  greater than B; relative volume closure below $10^{-7}$; shutdown time remains
  in the denominator.
- **Stopping/abstention:** a TMP-limit crossing invokes backwash or safe
  shutdown. Treating shutdown observations as missing is a protected failure.
- **Novelty/kill:** C must clear the common gate against the nonlinear
  maintenance-aware controller; a relabelled fouling state at parity is killed.
- **Artifacts:** `feed.parquet`, `membrane-state.parquet`, `cleaning.jsonl`,
  `permeate.csv`, `pressure-events.csv`, `resource-ledger.csv`.

### ENV-T06 — Competitive adsorption and breakthrough

- **Claim:** `C-1475`.
- **Primary unit and units:** one 365-day adsorptive-bed world; concentration
  (micrograms/L), time (h, d), bed volumes (dimensionless count), mass (mg),
  media (kg), empty-bed contact time (min), and assay count.
- **Frozen bed and solute table:** draw bed diameter $D_b\sim U(0.4,2)$ m,
  length $L_b\sim U(1,3)$ m, porosity $\epsilon\sim U(0.35,0.55)$, and media
  bulk density $\rho_b\sim U(350,650)$ kg/m$^3$. Set
  $A_b=\pi D_b^2/4$, $V_b=A_bL_b$, draw EBCT $\theta\sim U(5,30)$ min, convert
  $\theta$ to seconds, and set $Q=V_b/\theta$ in m$^3$/s. Media mass is
  $\rho_bV_b$ kg. For
  each of $U_{\mathbb Z}\{4,12\}$ solutes draw a compliance threshold
  $C_{lim,j}=10^{U(-2,1)}$ micrograms/L, baseline influent
  $C_{in,j}=C_{lim,j}10^{U(0.3,3)}$, $q_{max,j}\sim\operatorname{logU}(10^2,10^5)$
  mg/kg, $b_j\sim\operatorname{logU}(10^{-4},1)$ L/microgram, and
  $k_{LDF,j}\sim\operatorname{logU}(0.01,10)$ h$^{-1}$. Detection limit is
  $U(0.01,0.5)C_{lim,j}$. DOM is $U(0.5,20)$ mg C/L with
  $b_{DOM}\sim\operatorname{logU}(10^{-3},1)$ L/mg C.
- **Frozen transport solver:** initialise $C_j=q_j=0$ and use 80 finite-volume cells of
  $\Delta x=L_b/80$, axial dispersion
  $D_{ax}\sim\operatorname{logU}(10^{-7},10^{-4})$ m$^2$/s, interstitial
  velocity $v=Q/(A_b\epsilon)$, and the competitive equilibrium

  $$
  q_j^*=\frac{q_{max,j}b_jC_j}
  {1+\sum_\ell b_\ell C_\ell+b_{DOM}C_{DOM}},
  \qquad \dot q_j=k_{LDF,j}(q_j^*-q_j).
  $$

  Internally $C_j$ is mg/m$^3$, numerically equal to micrograms/L, and
  $\rho_bq_j$ is mg/m$^3$. For each solute the coupled balance is

  $$
  \epsilon\frac{\partial C_j}{\partial t}+
  \rho_b\frac{\partial q_j}{\partial t}=-\frac{\partial F_j}{\partial x},
  \qquad F_j=\epsilon\left(vC_j-D_{ax}\frac{\partial C_j}{\partial x}\right),
  $$

  with Danckwerts inlet $F_j(0)=\epsilon vC_{in,j}$ and zero-gradient outlet.
  A first-order upwind advective and centred diffusive finite-volume flux uses
  SSP-RK2. Strang-split LDF half-steps use
  $q\leftarrow q^*+(q-q^*)e^{-k_{LDF}\Delta t/2}$ with $q^*$ evaluated at the
  current mobile state, and change mobile mass by
  $\Delta C=-\rho_b\Delta q/\epsilon$ in the same cell. A step that would make
  $C$ or $q$ negative is bisected recursively down to 0.1 s; failure there
  rejects the realization. The adaptive upper substep is

  $$
  \Delta t=\min\left(15\text{ s},\theta/40,
  0.2\Delta x/v,0.1\Delta x^2/D_{ax},0.05/k_{LDF,max}\right),
  $$

  with every term converted to seconds and $k_{LDF,max}$ converted from h$^{-1}$
  to s$^{-1}$; hourly output is an aggregation, not the truth step. Any negative
  concentration or solute-wise closure error above
  $10^{-6}$ rejects the numerical realization.
- **Influent, assay, and action map:** daily
  $z_d=0.95z_{d-1}+\eta_d$, $\eta_d\sim N(0,0.15^2)$, starts in its stationary
  normal distribution and multiplies all solutes by
  $\exp(z_d-\operatorname{Var}(z)/2)$. One persistent DOM step starts at a
  uniform day 60--300 and multiplies DOM by $U(2,5)$. Regeneration is unavailable
  with probability 0.5 and otherwise may be commanded once: it removes a
  seed-frozen $U(0.4,0.9)$ fraction of every $q_j$ inventory and returns that
  removed mass to a perfectly mixed release tank feeding the column uniformly
  over a log-uniform 6--48 h. Replacement takes 24 h, sends all adsorbed mass to
  a separately closed disposal ledger, installs the original media mass with
  $q=0$, and supplies no treated service while offline.

  The fixed target panel is the lowest-hash half of solute IDs assayed every 7 d
  with 24 h latency; the broad panel assays all solutes every 30 d with 72 h
  latency. A requested extra broad panel has the same latency and is limited to
  one pending request and one request per 7 d. Assays return left-censored
  intervals below their frozen LOD with 5% multiplicative Gaussian error.
  Actions at each hourly boundary are continue, request an extra broad assay,
  replace media, regenerate if available, or isolate the bed and invoke a
  frozen zero-discharge service fallback. Busy or unavailable actions are
  rejected. All release, disposal, assay latency, media, and lost service are
  logged.
- **Frozen calibration phase:** before the scored year, generate eight
  single-solute batch points per solute at log-spaced 0.01--10 times baseline
  concentration using the same equilibrium equation without competitors and 5%
  Gaussian error. Independently run one fresh, geometrically identical column
  at constant baseline multisolute/DOM influent for 180 d or until any
  $C_{out,j}/C_{in,j}\ge0.90$, whichever comes first. Influent and every effluent
  solute are assayed every 24 h with the same LOD and 5% error; flow, bed, and
  media metadata are exact. These batch and column records are the declared
  calibration data, are identical for all arms, and are a fixed shared pretest
  resource rather than a C-only assay saving.
- **Arms:** A uses fixed removal or independent batch Langmuir isotherms; B uses
  a calibrated multicomponent transport/adsorption model fit to column data; C
  uses P-005/P-009/P-012 media-lineage state with active sampling.
- **Mature null:** B receives the same column-calibration data, influent assays,
  flow, and media records as C.
- **Transfer family:** unseen affinity ordering, abrupt DOM increase, and post-
  regeneration desorption.
- **Primary metric and threshold:** truth-level above-limit load is

  $$
  L_s=\sum_j\int_0^{365\,d}Q(t)
  \max[C_{out,j}(t)-C_{lim,j},0],\mathrm dt\quad\text{mg},
  $$

  with $Q\,dt$ converted to m$^3$, because micrograms/L times m$^3$ equals mg.
  An unobserved early breach
  therefore remains in the loss without an arbitrary extra penalty. A failed
  solver, missing post-breakthrough interval, or unclosed regeneration receives
  loss accrued before failure plus the remaining-horizon influent solute mass
  and all mobile, adsorbed, and release-tank solute inventory still inside the
  system. This finite conservative score is $L^{max}_s$ for the common resource-route
  gate. B uses $r=0.30$.
- **Secondary metrics:** $10\%$, $50\%$, and $90\%$ breakthrough-time error in
  bed volumes and d; early breaches (count); retained and released mass (mg);
  media used (kg); assay count; CPU and storage.
- **Protected gates:** solute-wise and total relative mass closure below
  $10^{-6}$; censored values are not set to zero; all regeneration releases
  remain inside the accounting horizon; delivered treated-service volume may
  not fall more than 1% below B, and all bypass/fallback volume is charged as
  lost service.
- **Stopping/abstention:** an interval overlapping a compliance boundary forces
  an assay or media replacement. Missing post-breakthrough time receives
  worst-case load.
- **Novelty/kill:** C may preregister at least 10% primary improvement or at
  least 20% fewer assays with breach non-inferiority. A batch-capacity model
  cannot be presented as the mature null.
- **Artifacts:** `column.json`, `influent.parquet`, `assays.parquet`,
  `breakthrough.csv`, `media-lineage.jsonl`, `mass-closure.csv`.

### ENV-T07 — Buffered anaerobic overload

- **Claim:** `C-1476`.
- **Primary unit and units:** one 300-day digester world; HRT (d), loading
  (kg COD m$^{-3}$ d$^{-1}$), VFA (mg COD/L), alkalinity (meq/L), gas
  (Nm$^3$/d), pH, time (h, d), and lost feed (kg COD).
- **Frozen reduced anaerobic DGP:** this test uses an explicit ADM1-informed
  synthetic truth, not an unspecified ADM1 implementation. Truth resolution is
  15 min. Draw volume $V\sim\operatorname{logU}(100,10000)$ m$^3$, HRT
  $\theta\sim U(10,40)$ d, dilution $D=1/\theta$ d$^{-1}$, and $Q=VD$ m$^3$/d.
  Organic loading $\ell\sim U(1,8)$ kg COD m$^{-3}$ d$^{-1}$ gives influent
  $S_{in}=\ell/D$ kg COD/m$^3$. Carbohydrate, protein, and lipid fractions
  $(f_1,f_2,f_3)$ are Dirichlet$(2,2,2)$. For each fraction,
  $k_{h,l}\in\{0.5,0.25,0.10\}$ d$^{-1}$ times an independent lognormal CV-0.20
  multiplier and acid yield $y_l\sim U(0.6,0.9)$. With substrate $S_l$, VFA
  $A$, methanogen biomass $X$, and inert soluble COD $I$ in kg COD/m$^3$,

  $$
  \begin{aligned}
  \dot S_l&=D(f_lS_{in}-S_l)-k_{h,l}S_l,\\
  r_a&=\sum_l y_lk_{h,l}S_l,\\
  r_m&=k_mX\frac{A}{K_A+A}I_{pH}I_NI_L,\\
  \dot A&=-DA+r_a-r_m,\\
  \dot X&=Y_mr_m-(b_m+D)X,\\
  \dot I&=-DI+\sum_l(1-y_l)k_{h,l}S_l+b_mX,\\
  \dot B&=D(B_{in}-B)-\alpha r_a+\beta r_m .
  \end{aligned}
  $$

  Here $B$ and $B_{in}\sim U(20,200)$ are meq/L;
  $k_m=8$ d$^{-1}$, $K_A=0.5$ kg COD/m$^3$, $Y_m=0.06$,
  $b_m=0.02$ d$^{-1}$, $\alpha\sim U(2,8)$ and $\beta\sim U(1,6)$
  meq/g COD, with the numerical kg/m$^3$ to g/L identity used in the last
  equation. These six kinetic/stoichiometric terms receive independent
  lognormal CV-0.20 multipliers. Algebraic pH is
  $\operatorname{clip}\{7+\log_{10}[(B/50)/(A/0.5+0.05)],4,9\}$ and
  $I_{pH}=\exp[-((pH-7)/0.8)^2]$. Baseline ammonia $N\sim U(0.1,5)$ g N/L and
  LCFA proxy $L=f_3S_{in}$ give
  $I_N=[1+(N/K_N)^2]^{-1}$, $K_N\sim U(1,4)$ g N/L, and
  $I_L=[1+(L/K_L)^2]^{-1}$, $K_L\sim U(0.5,5)$ kg COD/m$^3$. The COD not
  retained as new biomass becomes gas; methane is
  $(0.35\ \text{Nm}^3/\text{kg COD})(1-Y_m)r_mV$ Nm$^3$/d. Substrate-to-inert,
  biomass-decay, effluent, VFA, biomass, and methane-COD rows close the COD
  ledger. Temperature $U(30,40)$ degrees Celsius multiplies only kinetic
  $k_{h,l}$, $k_m$, and $b_m$ terms by $1.05^{T-35}$; hydraulic $D$ and $Q$ and
  stoichiometric yields remain unchanged. Draw one
  $r_{CO2}\sim U(0.3,1)$ Nm$^3$ CO$_2$/Nm$^3$ CH$_4$; total gas is methane
  times $(1+r_{CO2})$, and reported dry composition is the corresponding CH$_4$/CO$_2$
  volume fraction pair.
- **Initial state and disturbances:** start the burn-in at
  $S_l=f_lS_{in}/2$, $A=X=0.1$, $I=0$ kg COD/m$^3$, and $B=B_{in}$; integrate constant
  baseline feed for $20\theta$ d and require every state $x$ to satisfy
  $|\dot x|/\max(|x|,x_{ref})<10^{-8}$ d$^{-1}$, using
  $x_{ref}=10^{-6}$ kg COD/m$^3$ for $S_l,A,X,I$ and
  $10^{-6}$ meq/L for $B$. A world that does not converge within that horizon
  is resampled under the common 10,000-attempt generator cap;
  that converged state begins day 0. Days 0--30 are a disturbance-free baseline.
  Draw $U_{\mathbb Z}\{4,12\}$ non-overlapping feed shocks with onset uniform over days 30--260,
  duration log-uniform 6--72 h, and multiplier log-uniform 1.5--4. Draw
  $U_{\mathbb Z}\{0,4\}$
  ammonia or LCFA events equiprobably, with onset in the same interval, duration
  12--120 h, and multiplier log-uniform 1.5--5 on $N$ or $L$. Ordinary worlds
  resample overlaps; only the transfer family permits one compound overlap.
- **Observation and action map:** pH, gas flow/composition, temperature, and feed
  arrive every 15 min with 1% Gaussian CV and seed-frozen $U(0,12)$ h sensor delay;
  alkalinity is daily with 5% CV. A requested VFA assay returns after a frozen
  $U(4,48)$ h delay with 5% CV; reported VFA is $1000A$ mg COD/L. Hourly actions
  choose the multiplier applied to inlet substrate concentrations at fixed $Q$
  from $\{0,0.25,0.5,0.75,1\}$ and independently may request one VFA assay; an
  assay request leaves the selected feed multiplier unchanged. Increasing the
  multiplier while truth
  has pH below 6.7 or VFA/alkalinity above 0.8 mg COD/meq is an unsafe action;
  this evaluator state is withheld and charges the following one-hour control
  interval to $T_{unsafe}$. The conservative fallback uses multiplier
  0.25 until the 99% state interval re-enters both limits, then ramps one level
  per 6 h. Assays, feed denied, gas lost, and every action are logged.
- **Arms:** A uses a pH threshold and fixed feed reduction; B uses ADM1 plus an
  extended Kalman filter and multi-indicator constrained control; C uses
  P-006/P-007/P-009/P-012 delayed prediction with active assay allocation.
- **Mature null:** B receives the same pH, gas, feed, alkalinity, VFA, delay, and
  assay observations as C and includes their resource costs.
- **Transfer family:** unseen substrate composition, combined lipid/ammonia
  inhibition, and a temperature-ramp disturbance.
- **Primary metric and threshold:** for each event, the pre-event methane
  reference is the truth median over the half-open interval from 7 d to 1 d
  before onset. A methane excursion counts only after 48 continuous hours below
  50% of that reference, including the qualifying 48 h; any truth step with pH
  below 6.5 counts immediately. $T_{up}$ is the duration in d of the union of
  those intervals, so overlaps are not double-counted. $T_{unsafe}$ is likewise
  the union duration in d for which the commanded feed violates the evaluator
  rule above. $F_{ref}$ is the median scheduled kg COD/d during the declared
  disturbance-free days 0--30, and
  $M_{lost}=\sum_t(F_{scheduled,t}-F_{delivered,t})_+\Delta t$ in kg COD with
  $\Delta t=1/96$ d. Freeze

  $$
  L_s=F_{ref}T_{up}+M_{lost}+2F_{ref}T_{unsafe}
  \quad\text{kg COD-equivalent}.
  $$

  Permanent zero feed therefore pays the full lost-feed term. A failed state,
  truncated recovery, or broken COD, VFA, biomass, gas, or alkalinity ledger receives
  $L_{fail}=F_{ref}(300\text{ d})+M_{scheduled}+2F_{ref}(300\text{ d})$.
  B uses $r=0.25$.
- **Secondary metrics:** detection lead or lag (h); VFA (mg COD/L); alkalinity
  (meq/L); methane (Nm$^3$/d); lost feed (kg COD); false alarms/y; unsafe feed
  actions; assay and compute resources.
- **Protected gates:** no increase in unsafe feed actions; COD and alkalinity
  relative closure each below $10^{-6}$; full recovery horizon
  retained.
- **Stopping/abstention:** a state interval outside the preregistered safe set
  invokes the frozen conservative feed policy. An arm cannot gain by permanent
  zero feed because lost feed remains dimensioned inside $L_s$.
- **Novelty/kill:** C must beat or resource-dominate the full ADM1/EKF null;
  pH-plus-one-extra-threshold is not a novel composition.
- **Artifacts:** `adm1-world.json`, `feed.parquet`, `sensor-state.parquet`,
  `assays.jsonl`, `actions.parquet`, `closure.csv`, `upsets.csv`.

### ENV-T08 — Transformation-product and effect closure

- **Claim:** existing `C-1285`; claim number `1477` remains unused.
- **Primary unit and units:** one seed containing 24 treatment episodes;
  concentration (micrograms/L), TOC (mg C/L), mass (mg), ozone (kg), simulated
  electricity (kWh), and a preregistered dimensionless effect index.
- **Frozen reaction graph:** each of 24 episodes draws a target node count
  $N\sim U_{\mathbb Z}\{20,80\}$ and
  $P\sim U_{\mathbb Z}\{4,\min(15,N)\}$ roots. A root formula
  $(C,H,N,O,X)$ draws integers from respectively 1--30, 2--60, 0--5, 0--20,
  and 0--4, rejecting formula mass outside 50--600 g/mol using atomic weights
  12.011, 1.008, 14.007, 15.999, and 35.45. Root concentration is log-uniform
  0.01--10 micrograms/L. The lowest-hash splittable leaf is expanded until
  exactly $N$ nodes exist. It draws
  $d\sim U_{\mathbb Z}\{1,\min(3,N-N_{current})\}$ children, CO$_2$ count
  uniformly from 0 through $\lfloor0.3C\rfloor$, water count uniformly from 0
  through $\lfloor H/2\rfloor$, and oxidant-O count uniformly from 0 through 40.
  The remaining nonnegative $(C,H,N,O,X)$ vector after adding oxidant O and
  removing CO$_2$ and H$_2$O is partitioned among $d$ ordered children by
  sequential hash-keyed binomial draws. Reject until every child has positive
  formula mass and complete C/H/N/O/X closure is within integer equality.
  Products are therefore generated by, rather than independently assigned to,
  reactions; the result is an acyclic rooted forest with one incoming reaction
  per product. CO$_2$, H$_2$O, oxidant, and every product remain explicit ledger
  rows.

  Each internal-node reaction has $k_r\sim\operatorname{logU}(10^{-4},1)$ per
  exposure unit. Draw oxidation horizon $H_e\sim\operatorname{logU}(0.25,24)$ h
  and total exposure $E_e\sim\operatorname{logU}(0.1,100)$ exposure units; set
  $e(t)=E_e/H_e$ h$^{-1}$ for $0\le t<H_e$ and zero afterward. The truth solver
  integrates

  $$
  \dot n_i=-\sum_{r\in out(i)}k_r e(t)n_i+
  \sum_{r:j\to i}\nu_{r,i}k_r e(t)n_j
  $$

  with adaptive RK45 relative tolerance $10^{-9}$ and absolute tolerance
  $10^{-12}$ mol/L from the root concentrations converted with their formula
  masses; $n_i$ is mol/L, $e(t)$ is h$^{-1}$-scaled exposure, and
  $\nu_{r,i}=1$ for each generated child in its single balanced parent reaction.
  DOC is $U(1,20)$ mg C/L, bromide $U(0,2)$ mg/L, and pH $U(6,9.5)$.
  Matrix suppression multiplies analytical response by a
  seed-frozen $U(0.5,1)$ factor. Episode water volume is log-uniform 10--10,000
  m$^3$; synthetic ozone dose is
  $m_{O3}=E_eV_e\xi$, with
  $\xi\sim\operatorname{logU}(10^{-4},10^{-2})$ kg/(m$^3$ exposure unit), and
  simulated electricity is $U(5,20)m_{O3}$ kWh. Post-treatment type is uniformly
  absent, biological, or sorptive and age is $U(0,30)$ d. For each product,
  $k_{post}\sim\operatorname{logU}(10^{-4},1)$ d$^{-1}$; the fraction
  $1-e^{-k_{post}t}$ transfers to explicit CO$_2$/inorganic rows for biological
  treatment or to a closed media-inventory row for sorption. Absent treatment
  has $k_{post}=0$. Sorptive media capacity is
  $\operatorname{logU}(10^{-3},1)$ kg captured formula mass/kg media, so charged
  media mass is terminal captured kg divided by that capacity. Formula atoms,
  carbon, water, oxidant, CO$_2$, and media
  inventories are retained through the episode terminal record.
- **Frozen assay and effect map:** all parents form the target panel. The fixed
  non-target panel is the lowest-hash 16 products, or all products if fewer;
  TOC and four effect channels complete B's battery. Compound LODs are
  log-uniform 0.001--0.1 micrograms/L, measurement CV is 5%, and sub-LOD values
  are intervals $[0,\mathrm{LOD}]$. Target and TOC assays take 4 h, non-target
  assays 48 h, and effect assays 24 h; each consumes one assay unit, while a
  non-target or effect assay consumes four material units. Effect truth is

  $$
  E=\max\left[0,\sum_i a_i\frac{c_i}{C_i^*}+
  \sum_{(i,j)\in\mathcal I}\gamma_{ij}
  \sqrt{\frac{c_i c_j}{C_i^*C_j^*}}\right],
  $$

  where $c_i$ is formula-mass concentration derived from $n_i$, and
  $C_i^*\sim\operatorname{logU}(0.01,10)$ micrograms/L,
  $a_i\sim\operatorname{logU}(10^{-3},1)$ then normalized to sum to one, and
  $U_{\mathbb Z}\{0,20\}$ hash-selected interaction pairs have
  $\gamma_{ij}\sim U(-0.1,0.3)$.
  The four assay channels are fixed random nonnegative projections of the
  species terms using independent exponential-rate-one weights normalized to
  unit sum, with 5% Gaussian error. Arms know
  the development calibration but not evaluator-only unassayed species,
  interaction coefficients, or confirmation graph.

  The calibration generator creates a fixed 128-pseudo-species formula library
  with the root-formula law above. Lowest formula-hash ranks 1--32 are its fixed
  target panel, ranks 33--64 its fixed non-target panel, and ranks 65--128 are
  unassayed species. Each of 256 development mixture pairs includes every
  library species independently with probability 0.15, resampling until 5--30
  are present with at least one target and one non-target. Its paired influent
  concentrations $c_i^{in}$ are log-uniform 0.001--10 micrograms/L. One
  hash-keyed $R_i\sim U(0,1)$ per present species gives the treated sample
  $c_i^{out}=R_ic_i^{in}$; absent species have both concentrations zero. Thus
  every residual has a declared paired baseline rather than a free-standing
  post-treatment value.

  Assign one fixed species LOD from the episode's log-uniform 0.001--0.1
  micrograms/L law. For each influent or treated compound sample independently,
  draw matrix-response $s\sim U(0.7,1)$ and report
  $sc_i(1+\epsilon_i)$ with $\epsilon_i\sim N(0,0.05^2)$, clipped at zero and
  censored to $[0,\mathrm{LOD}_i]$ below LOD. Paired TOC is the formula-carbon
  sum over all 128 species with independent 5% Gaussian relative error clipped
  at zero. The post-treatment concentrations independently draw $a_i$ and
  $U_{\mathbb Z}\{0,20\}$ interactions and generate truth $E$ and the four
  effect readings by the episode equations. Its seven fixed regression features
  are (i) treated target-panel carbon divided by paired influent target-panel
  carbon, (ii) above-LOD treated non-target-panel carbon divided by paired
  influent non-target-panel carbon, (iii) treated TOC divided by paired influent
  TOC, and (iv--vii) the four treated effect-channel readings. Compound-carbon
  sums use each interval's upper endpoint and each denominator is
  $\max(U_{in},10^{-12}\ \text{micrograms C/L})$; TOC uses its clipped numeric
  reading. These complete mixture,
  assay, feature, and effect records—not an unspecified external dataset—form
  the calibration set. For each arm, effect
  intervals use a frozen split-conformal map: the lowest-hash 128 of 256
  development calibration mixtures fit nonnegative ridge regression with
  penalty $10^{-3}$ after unit-standardization; the other 128 supply the
  absolute-residual quantile at rank
  $\min\{128,\lceil0.99(128+1)\rceil\}=128$, the largest calibration residual.
  Add that radius to the fitted effect
  to obtain the upper bound. An unidentified-carbon upper bound assigns every
  sub-LOD interval its upper endpoint and every unassayed carbon atom the
  residual between influent carbon and measured products plus CO$_2$, clipped
  to 0--100%. Calibration split, feature order, ridge solver tolerance
  $10^{-12}$, and clipping are identical across arms. If a paired influent
  parent assay is below LOD, percentage removal is undefined and A must return
  `unresolved`; it cannot treat the upper endpoint as a detected baseline.
- **Decision and resource map:** A declares `safe` when every measured parent
  falls at least 80% and remains below its LOD. B applies the fixed battery and
  declares `safe` only when its 99% upper effect bound is below 1 and its upper
  unidentified-carbon fraction is at most 10%. C may adaptively request from
  the same target/non-target/TOC/effect assay menu but may not exceed B's assay
  count or receive a shorter latency. Other outcomes are `unresolved` and
  invoke the same frozen no-release/post-treatment fallback. Each assay,
  latency, ozone dose, media mass, fallback hour, and simulated kWh is logged.
  The decision clock starts at the post-treatment sample: A and B order their
  frozen panels immediately; C may order at hour 0 and once again at hour 48.
  Every arm must issue `safe` or `unresolved` by hour 96; an assay still pending
  at that deadline contributes its full cost but cannot support `safe`.
- **Arms:** A uses parent-removal percentage; B uses a kinetic/speciation model
  plus fixed target, non-target, mass, and effect battery; C uses
  P-007/P-009/P-013 active assay allocation and a versioned product graph.
- **Mature null:** B receives the full fixed assay panel and the same treatment,
  matrix, and post-treatment-age observations available to C.
- **Transfer family:** new product routes, matrix suppression, aged post-
  treatment, and product interactions absent from development.
- **Primary metric and threshold:** evaluator truth marks an episode unsafe when
  $E\ge1$ or more than 10% of attributable influent carbon remains in
  non-mineralized species outside B's frozen target/non-target reference panel.
  With truth label $z_e$ and decision $d_e$, freeze

  $$
  L_s=\frac{1000}{24}\sum_{e=1}^{24}
  \mathbf 1\{d_e=\text{safe}\land z_e=\text{unsafe}\}
  $$

  false-safe declarations per 1,000 episodes. Invalid element closure,
  non-finite intervals, a missing terminal decision, or suppressed failed
  episode receives $L_s=1000$. B uses $r=0.25$.
- **Secondary metrics:** parent and product concentration (micrograms/L); TOC
  (mg C/L); attributable-carbon closure (%); effect index; ozone (kg); assay and
  post-treatment media count/kg; simulated electricity (kWh).
- **Protected gates:** the simultaneous upper 99% bound for the paired seed
  contrast $L_{C,s}-L_{B,s}-0.5$ false-safe episodes per 1,000 must be at most
  zero; represented-species elemental closure below
  $10^{-6}$; unidentified mass reported separately.
- **Stopping/abstention:** more than 10% unidentified attributable carbon or an
  effect interval crossing 1.0 forces `unresolved`, never `safe`. `Unresolved`
  carries the safe-fallback service and assay cost and remains subject to the
  common answer-coverage gate, so always abstaining cannot win.
- **Novelty/kill:** C must reduce fixed-panel resource use or false-safe loss
  against B. Existing C-1285 remains the parent claim; this track cannot create
  a duplicate principle.
- **Artifacts:** `reaction-graph.enc`, `treatment.jsonl`, `target-assays.csv`,
  `nontarget.parquet`, `effects.csv`, `element-closure.csv`, `decisions.jsonl`.

### ENV-T09 — Lifecycle, substitution, and rebound

- **Claim:** `C-1478`.
- **Primary unit and units:** one 20-year monthly service/counterfactual world;
  compliant service and abstraction (m$^3$), electricity (kWh), GHG
  (kg CO$_2$e), nutrients (kg N, kg P), and cost (constant EUR$_{2026}$).
- **Frozen demand and asset DGP:** generate baseline ID 0 and
  $U_{\mathbb Z}\{2,7\}$ alternatives.
  Month $t\in\{0,\ldots,239\}$ has $\Delta=365.25/12$ d. Draw initial population
  $P_0\sim\operatorname{logU}(10^4,10^6)$ and annual growth
  $g_P\sim U(-0.01,0.02)$, then $P_t=P_0(1+g_P)^{t/12}$. Baseline per-capita
  demand is $d_{0,t}=d_0[1+a\sin(2\pi t/12+\phi)]$ with
  $d_0\sim U(80,200)$ L/person/d, $a\sim U(0,0.30)$, and
  $\phi\sim U(0,2\pi)$. Draw one time-invariant generalized cost
  $c_a\sim\operatorname{logU}(0.5,5)$ EUR$_{2026}$/m$^3$ per alternative and an
  elasticity, with equal probability, from $U(-0.4,-0.1)$, $\{0\}$, or
  $U(0.1,0.4)$. Demand is

  $$
  d_{a,t}=\operatorname{clip}\left[
  d_{0,t}(c_a/c_0)^{\epsilon_a},50,300\right]
  \quad\text{L person}^{-1}\text{d}^{-1}.
  $$

  Requested monthly volume is
  $V^{dem}_{a,t}=P_td_{a,t}\Delta/1000$ m$^3$. Capacity is $U(0.9,1.3)$ times the
  maximum baseline daily demand; baseline is fixed at 1.3, legally eligible,
  and always available/compliant so it is feasible by construction. Each other
  alternative has a Bernoulli(0.9) legal-eligibility flag fixed before selection.
  Asset age
  advances monthly. Resource efficiency is
  $\eta^{res}_{a,t}=\max[0.7,1-\delta_a age_t]$ with
  $\delta_a\sim U(0,0.01)$ y$^{-1}$. A single lifetime
  $T_a\sim U(8,30)$ y schedules replacement at month
  $m_{a,k}=\lceil12kT_a\rceil$ for every positive integer $k$ with
  $m_{a,k}<240$; one draw $f^{rep}_a\sim U(0.2,1)$ supplies both the capital and
  material replacement fraction, avoiding duplicate burdens. Replacement
  resets age and efficiency, adds downtime $U(1,90)$ d clipped to that month,
  and is an exact ledger event. Retirement at month 240 adds decommissioning and
  recycling rows.
- **Frozen service, substitution, and inventory map:** every non-baseline
  alternative starts available and compliant. Availability has monthly
  up-to-down probability $U(0.001,0.02)$ and down-to-up probability $U(0.2,0.9)$;
  conditional on being up, quality has compliant-to-noncompliant probability
  $U(0.001,0.02)$ and recovery probability $U(0.2,0.9)$. Hash-keyed uniforms
  advance both chains once per month. Let $d^{down}_{a,t}=0$ except in a
  replacement month, when it is that event's sampled downtime clipped to
  $\Delta$. Gross production is

  $$
  V^{gross}_{a,t}=A_{a,t}(1-d^{down}_{a,t}/\Delta)
  \min(V^{dem}_{a,t},q_{cap,a}\Delta).
  $$

  Compliant service is
  $S_{a,t}=Q_{a,t}V^{gross}_{a,t}$ and
  noncompliant volume is $(1-Q_{a,t})V^{gross}_{a,t}$. Noncompliant volume is
  never service. Reuse fraction $r_a\sim U(0,1)$ makes delivered compliant reuse
  $r_aS_{a,t}$ and displaces potable abstraction only up to that volume.
  Physical recovery factors $y_{N,a}\sim\operatorname{logU}(10^{-4},0.05)$ kg
  N/m$^3$ and $y_{P,a}\sim\operatorname{logU}(10^{-5},0.01)$ kg P/m$^3$ give
  $M_{rec,N}=y_NS$ and $M_{rec,P}=y_PS$. Recovered nutrient or
  material uptake is
  $u_{a,t}=\operatorname{logit}^{-1}(\alpha_a+z_t)$, where
  $\alpha_a=\operatorname{logit}(u_{a,0})$ and initial uptake
  $u_{a,0}\sim U(0.01,0.99)$, and
  $z_t=0.9z_{t-1}+\eta_t$, $\eta_t\sim N(0,0.15^2)$, with $z_0$ drawn from its
  stationary normal distribution. Actual avoided production
  is $u_{a,t}$ times physically recovered mass; unused recovery receives no
  credit.
- **Frozen lifecycle equations:** draw base treatment electricity
  $e_a\sim U(0.2,2)$ kWh/m$^3$ and chemical use
  $m_a\sim\operatorname{logU}(0.01,1)$ kg/m$^3$; realized $E_{a,t}$ and
  $M_{chem,a,t}$ equal these factors times gross production divided by
  $\eta^{res}_{a,t}$. Direct-emission factor
  $g_{direct,a}\sim\operatorname{logU}(0.001,1)$ kg
  CO$_2$e/m$^3$ gives $G_{direct,a,t}=g_{direct,a}V^{gross}_{a,t}$. Draw
  $g_{cap,a}\sim U(100,2000)$ kg CO$_2$e per (m$^3$/d) of design capacity and set
  $G_{cap,a}=g_{cap,a}q_{cap,a}$. Replacement uses the already drawn
  $f^{rep}_a$ fraction of
  initial construction. Retirement burden is $U(0.02,0.20)$ of initial
  construction and recycling credit is $U(0,0.20)$ of it. Grid intensity is
  $g_t=g_0\exp[-\kappa(t/12\text{ y})]$ with
  $g_0\sim U(0.02,0.8)$ kg CO$_2$e/kWh and
  $\kappa\sim U(0,0.10)$ y$^{-1}$. Chemical and displaced-product factors are
  independently log-uniform 0.1--10 kg CO$_2$e/kg. Initial capital is
  $U(500,5000)$ EUR$_{2026}$/(m$^3$/d) times $q_{cap}$. Fixed-O&M fraction
  $f^{OM}_a\sim U(0.01,0.08)$ applies to initial capital/y, electricity price
  $p_E\sim U(0.05,0.40)$ EUR$_{2026}$/kWh, chemical price
  $p_C\sim\operatorname{logU}(0.1,10)$ EUR$_{2026}$/kg, and each recovered-
  product credit $p_m\sim U(0,2)$ EUR$_{2026}$/kg applies only to mass actually
  taken up. Decommissioning $C_{decom}$ is $U(0.05,0.30)$ of initial capital and
  recycling credit $C_{recycle}$ is $U(0,0.20)$ of it. For alternative $a$,

  $$
  G_a=G_{cap,a}+G_{replace,a}+G_{retire,a}+
  \sum_t\left(E_{a,t}g_t+M_{chem,a,t}g_{chem,a}+G_{direct,a,t}
  -\sum_{m\in\{N,P\}}u_{a,t}M_{rec,m,a,t}g_{disp,m,a}\right),
  $$

  in kg CO$_2$e. With replacement-event set $\mathcal R_a$, constant-EUR cost is

  $$
  C_a=C_{cap,a}+\sum_{r\in\mathcal R_a}f^{rep}_aC_{cap,a}
  +20f^{OM}_aC_{cap,a}+\sum_t(p_EE_{a,t}+p_CM_{chem,a,t}
  -\sum_{m\in\{N,P\}}p_m u_{a,t}M_{rec,m,a,t})
  +C_{decom,a}-C_{recycle,a}.
  $$

  Every price and fraction is the seed-fixed draw above; no discounting or
  carbon price is used. Separate unweighted rows hold kWh, kg N,
  kg P, abstraction m$^3$, noncompliant volume, and compliant-service m$^3$; no
  row may migrate between boundaries after development.
- **Observation and selection map:** before the scored horizon, generate an
  independent 24-month pilot from the same alternative parameters and reset all
  Markov and uptake states afterward. Pilot demand, service, electricity, and
  potable abstraction arrive monthly with 2% Gaussian CV; direct emissions and
  chemical inventories quarterly with 10% CV; construction rows are exact; and
  uptake is assayed quarterly with SD 0.05 clipped only for the reported physical
  interval, while the raw value is retained. A scores plant-gate operating GHG
  at month-0 grid intensity, assumes $u=1$ and 1:1 compliant-reuse displacement,
  and omits capital. B runs exactly 4,096 lifecycle trajectories with constant
  uptake fixed to the pilot mean. C runs the same 4,096 trajectories with the
  stated uptake-state and demand-response transitions. Simulation seeds are
  `SHA256("ENV-T09|seed|arm|draw")`. A calls an eligible alternative feasible
  when nameplate capacity covers its deterministic demand and ignores future
  failures. B and C require at least 95% of their 4,096 draws to satisfy every
  scored feasibility constraint. Each chooses the lowest predicted GHG intensity
  among predicted-feasible alternatives, falls back to baseline if none, and
  breaks exact ties by stable alternative hash. The choice is terminal before
  the scored 20-year truth is exposed.
- **Arms:** A is the plant-gate score above; B is the DIN EN ISO
  14040/14044-compatible fixed-uptake lifecycle Monte Carlo; C uses P-013
  versioned service, measured uptake, and compensation-aware transitions.
- **Mature null:** B has the same lifecycle inventory, scenario ranges,
  constraints, and observation dates as C. C cannot win through a wider system
  boundary unavailable to B.
- **Transfer family:** correlated grid/demand changes, policy intervention,
  altered substitution markets, and a held-out negative-rebound family.
- **Primary metric and threshold:** an alternative is feasible only if its
  20-year compliant service is at least 99% of baseline, quality violations are
  at most 0.1% of demanded volume, constant-EUR lifecycle cost is at most 150%
  of baseline, and its seed-frozen legal-eligibility flag is true. Baseline is
  generated to be feasible. Define $I_a=G_a/S_a$ in kg CO$_2$e per m$^3$
  compliant service and

  $$
  L_s=I_{\widehat a}-\min_{a\in\mathcal F}I_a.
  $$

  A missing required inventory interval, infeasible selection, zero service,
  non-finite result, or absent terminal selection receives
  $L_{fail}=\max_{a\in\mathcal F}I_a-\min_{a\in\mathcal F}I_a+1$ kg
  CO$_2$e/m$^3$. B uses $r=0.25$.
- **Secondary metrics:** potable-displacement ratio (m$^3$/m$^3$ reuse); net
  electricity (kWh/m$^3$ service); abstraction (m$^3$); GHG (kg CO$_2$e);
  nutrient substitution (kg N, kg P); lifecycle cost (EUR$_{2026}$); compliant
  service (m$^3$); interval coverage; alternative-ranking accuracy.
- **Protected gates:** the feasibility constraints above are absolute; no single
  weighted sustainability score is allowed. Potable abstraction, kWh, kg N,
  kg P, EUR$_{2026}$, and compliant service remain separately reported.
- **Stopping/abstention:** missing direct-emission, construction, substitution,
  or demand-response intervals prevents a net-benefit declaration. No universal
  rebound coefficient is emitted.
- **Novelty/kill:** C must beat or resource-dominate the complete versioned
  lifecycle null; a dynamic dashboard at inferential parity is killed.
- **Artifacts:** `functional-unit.json`, `inventory.parquet`,
  `counterfactuals.jsonl`, `demand.parquet`, `lifecycle-results.csv`,
  `uncertainty.jsonl`.

### ENV-T10 — Context-qualified centralisation

- **Claim:** `C-1479`.
- **Primary unit and units:** one 30-year spatial service world; compliant
  service (m$^3$), noncompliant delivered volume (m$^3$), outage exposure
  (person h), repair time (h), pipe (km), material (kg), electricity (kWh),
  operator time (h), GHG (kg CO$_2$e), and cost (EUR$_{2026}$).
- **Frozen spatial and facility DGP:** draw population
  $P\sim\operatorname{logU}(10^4,10^6)$ and density
  $\rho_P\sim\operatorname{logU}(5,20000)$ km$^{-2}$, giving square service
  area $A=P/\rho_P$. Draw $N\sim U_{\mathbb Z}\{100,2000\}$ demand nodes and
  place them by seeded Poisson-disc
  sampling with minimum separation $0.1\sqrt{A/N}$ km; allocate population with
  a Dirichlet$(2,\ldots,2)$ vector. Join each
  node to its four nearest neighbours, retain the minimum spanning tree, and
  multiply each edge's Euclidean road length by an independent $U(1,1.5)$.
  Elevation is a zero-mean
  Gaussian field with SD $U(5,200)$ m and exponential correlation length
  $\operatorname{logU}(0.1,10)$
  km. Draw candidate-plant count $U_{\mathbb Z}\{5,30\}$ and depot count
  $U_{\mathbb Z}\{1,5\}$; the corresponding lowest-hash nodes receive those roles.
  Anchor index 0 opens one packaged plant at every demand node, assigns each node
  to itself, has no distribution pipe or pump, capacity 1.3 times that node's
  peak demand, 48 h initially full storage, fallback fraction 1, monitoring
  fraction 1, backup-power fraction 1, 90 design-flow days of consumable, three
  shifts, and two same-class spares per plant. Every depot serves its nearest
  nodes. Before any arm receives a world, resample it if this anchor under policy
  A fails any frozen static or numerical feasibility gate on either the 16
  design scenarios or the sealed 64 evaluator scenarios. The conditioning event
  and rejected hashes are recorded, but evaluator fields remain hidden from all
  arms; therefore both selection and evaluator feasible sets contain anchor 0.
- **Frozen finite architecture catalogue and hydraulics:** an architecture is a committed tuple
  of opened plants, node assignments, pipe paths and diameters from
  $\{0.05,0.10,0.20,0.40,0.80\}$ m, pump locations, 0--48 h local storage,
  local fallback capacity, monitoring points, backup power, consumable stock,
  operator shifts, and spare stock.
  The candidate set is finite and has exactly 33 tuples. Index 0 is the anchor.
  Index 1 opens the candidate site minimizing population-weighted total hydraulic
  distance, assigns every node to it, uses capacity 1.3 times aggregate peak,
  48 h plant storage, fallback fraction 0.25 at the lowest-hash nodes, monitoring
  and backup-power fractions 1, 90 stock days, three shifts, and two same-class
  spares. Its pipes use shortest road-tree paths and the same smallest-feasible-
  diameter and positive-head pump rules below. Indices 2--32 follow this
  generator. Draw plant count uniformly from 1 through
  $\min(16,N_{site})$, select that many sites by the lowest values of
  `SHA256(seed|k|site-ID)`, assign each demand node to the selected site with
  minimum $d_h=d_{road}+(0.01\text{ km/m})\max(\Delta z,0)$, choose the smallest pipe
  diameter keeping design velocity at most 2 m/s, and hash-draw storage from
  $\{0,6,12,24,48\}$ h, fallback fraction from $\{0,0.25,0.5,1\}$, monitoring
  fraction from $\{0.25,0.5,1\}$, backup-power fraction from
  $\{0,0.5,1\}$, consumable stock from $\{0,7,30,90\}$ design-flow days,
  shifts from $\{1,2,3\}$, and spare count from
  $\{0,1,2\}$ per installed equipment class at each opened plant. Pipe paths are
  shortest paths in the road tree;
  every selected storage duration $h_{s,k}$ is attached to opened plant $k$ and
  converted to physical capacity by
  $V_{max,k}=(h_{s,k}/24\ \mathrm{h/d})q^{peak}_{assigned,k}$ m$^3$, where
  $q^{peak}_{assigned,k}$ is the sum of architecture-independent peak daily
  demands, in m$^3$/d, of nodes assigned to $k$. Thus the anchor's self-assigned
  48 h uses each node's own peak, index 1's 48 h uses its aggregate assigned
  peak, and indices 2--32 use one `tuple|site`-hash draw per opened plant. Storage
  starts ordinary operation and each isolated evaluator scenario full at
  $V_{max,k}$ with
  $C^{store}_{k,0}=0.5\min_{i\mapsto k}C_{lim,i}$; only subsequent compliant
  surplus can refill it. Capital and material multipliers consume this same m$^3$
  capacity, never the hour count.
  Pump installation follows the signed hydraulic rule below. Monitoring
  points comprise one mandatory outlet monitor at every opened plant and local
  fallback plus the lowest tuple-hash
  $\lceil f_{mon}N\rceil$ demand nodes. Local fallback is installed at the
  lowest tuple-hash $\lceil f_fN\rceil$ demand nodes, each with design capacity
  equal to that node's architecture-independent peak daily demand; $f_{mon}$
  and $f_f$ are the tuple's selected monitoring and fallback fractions. Every
  point and fallback unit enters the capital, material, lifetime, maintenance,
  and hazard ledgers. Invalid
  tuples remain in the catalogue but are infeasible. Architecture hash order is
  the only tie-break. Catalogue indices 0 and 1 supply A's local and central
  endpoints. All arms receive this same catalogue, 16 hash-generated design
  hazard scenarios, and ordinary monthly forcing; the 64 evaluator scenarios
  remain sealed. Facility physics, unit costs, removal, material, lifetime, and
  quality draws are keyed by `seed|site-ID|asset-class` and reused whenever that
  asset appears in different tuples; tuple fields do not redraw a favourable
  plant.
  Each node draws monthly baseline demand $U(80,200)$ L/person/d, seasonal
  amplitude $a_i\sim U(0,0.30)$, and phase $\phi_i\sim U(0,2\pi)$. For month
  $m$, set $d_{i,m}=d_{i,0}[1+a_i\sin(2\pi m/12+\phi_i)]$ L/person/d,
  $q^{dem,d}_{i,m}=P_id_{i,m}/1000$ m$^3$/d, and operational demand
  $\bar q^{dem}_{i,m}=q^{dem,d}_{i,m}/24$ m$^3$/h; hold it constant within the
  month. For global hour $h$, use
  $m(h)=\lfloor h/[24(365.25/12)]\rfloor$ and the month containing that hour's
  opening; the sinusoid already repeats because of its $2\pi m/12$ argument.
  Architecture-independent peak daily demand is
  $q^{peak}_i=\max_{m=0}^{11}q^{dem,d}_{i,m}$. Pipe flow
  obeys continuity and Darcy--Weisbach head loss
  $h_f=0.02(L/D)(v^2/2g)$ with $g=9.80665$ m/s$^2$; for pumped volume $V_p$
  in m$^3$ and $\rho_w=1000$ kg/m$^3$, electricity is
  $\rho_wgV_p\max(h_f+\Delta z,0)/(0.70\times3.6\times10^6)$ kWh. Each installed
  road-tree segment is one physical bidirectional pipe with area
  $A_e=\pi D_e^2/4$, operational capacity
  $q_{e,max}=7200A_e$ m$^3$/h, one signed net flow
  $f_e\in[-q_{e,max},q_{e,max}]$ in m$^3$/h, and no simultaneous counterflow.
  For proposed direction $u\to v$, use $v_e=|f_e|/(3600A_e)$ m/s and
  $h^{req}_{uv}=0.02(L_e/D_e)(v_e^2/2g)+z_v-z_u$. During catalogue construction,
  compute each direction's design flow in m$^3$/h as the sum of assigned peak
  daily flows whose source-to-node path uses it, divided by 24; install one reversible 70%-efficient pump iff any
  used direction has $h^{req}_{uv}>0$ at that design flow. At operation, a
  direction with $h^{req}_{uv}\le0$ is gravity-feasible through a passive bypass;
  a positive-head direction is feasible only when that installed pump is
  available and pays the hydraulic-energy equation above. `assigned` exposes
  only the original source-to-node directions; `shared` may expose either
  physically feasible direction subject to the single signed capacity. For catalogue
  indices 2--32, plant design capacity is $U(0.8,1.5)$ times assigned peak
  demand; indices 0 and 1 retain their explicitly frozen 1.3 multiplier and are
  not redrawn here. This $q_{cap}$ is nominal treatment design flow in m$^3$/d,
  not a hard hydraulic stop. Set $\bar q_{cap}=q_{cap}/24$ and
  $\bar q_{hyd}=1.5q_{cap}/24$ in m$^3$/h. Freeze operational plant-flow support
  $0\le\bar q\le\bar q_{hyd}$; the source edge in every max-flow uses
  $\bar q_{hyd}$, reduced by availability or backup-power fraction where
  applicable. Flow above $\bar q_{cap}$ is treated but follows the overload branch of the removal
  equation; demand above $\bar q_{hyd}$ is unserved and no undeclared bypass source is
  created. Treatment removal is
  $\eta(\bar q)=\operatorname{clip}[\eta_0-0.15(\bar q/\bar q_{cap}-1)_+,0,1]$ with
  $\eta_0\sim U(0.95,0.9999)$.

  For tuple backup fraction $f_b>0$, install one typed backup unit for every
  plant, local fallback, and pump; $f_b=0$ installs none. Its base daily flow is
  $q^{base}_a=1.5q_{cap,a}$ for a plant, $q^{peak}_i$ for fallback $i$, and
  $q^{base}_e=24\max(q^{design}_{e,+},q^{design}_{e,-})$ m$^3$/d for a pump,
  where the directional pump design flows above are in m$^3$/h. Freeze protected
  capacity $q^{prot}_a=f_bq^{base}_a$ m$^3$/d. Plant backup is at its plant node,
  fallback backup at its demand node, and pump backup at the pipe midpoint; each
  is a separate cost/material/lifetime/hazard asset. During grid loss, an
  available plant or positive-head pump direction is capped at
  $q^{prot}_a/24$ m$^3$/h, while a gravity direction needs no power. Local
  fallback is always backup-powered and is usable only up to its later-declared
  $\bar q^{fb}_i$ while its backup unit is available. Node influent concentration is
  $C_{in,i,0}\sim\operatorname{logU}(1,100)$ mg/L and monthly
  $z_t=0.8z_{t-1}+\epsilon_t$, $\epsilon_t\sim N(0,0.15^2)$, starts stationary
  and multiplies it by $\exp(z_t-\operatorname{Var}(z)/2)$. Plant influent is
  the flow-weighted mixture. Each demand node has the architecture-independent
  threshold $C_{lim,i}=u_i(1-\eta_{0,i}^{anchor})C_{in,i,0}$ with
  $u_i\sim U(1.10,2)$; a delivery to node $i$ is compliant only at or below that
  threshold. The local anchor uses capacity 1.3 times peak demand, so its nominal
  outlet is below the threshold; overload, forcing, or outages can still violate
  it. Every influent, effluent,
  stored, bypassed, and fallback pollutant mass is integrated in mg and kg rows.
- **Frozen cost and lifecycle transitions:** for each diameter class, pipe
  capital and material are independently $\operatorname{logU}(100,2000)$
  EUR$_{2026}$/m and $\operatorname{logU}(5,500)$ kg/m, then isotonic-sorted by
  diameter. Plant capital is
  $C_{plant}=c_0[q_{cap}/(1000\text{ m}^3/\text{d})]^{0.7}$ with
  $c_0\sim\operatorname{logU}(10^5,10^8)$ EUR$_{2026}$, and operator work costs
  $U(30,100)$ EUR$_{2026}$/h. Plant material is
  $U(100,1000)$ kg per (m$^3$/d) design capacity; storage, fallback, and monitoring
  capital are respectively $\operatorname{logU}(10,1000)$ EUR$_{2026}$/m$^3$,
  $\operatorname{logU}(100,2000)$ EUR$_{2026}$/(m$^3$/d), and
  $\operatorname{logU}(1000,100000)$ EUR$_{2026}$ per point. Pump capital and
  material are $\operatorname{logU}(1000,10^6)$ EUR$_{2026}$ and
  $\operatorname{logU}(100,10000)$ kg per installed pump. Depot/crew capital and
  material are respectively $\operatorname{logU}(10^4,10^6)$ EUR$_{2026}$ and
  $\operatorname{logU}(100,10000)$ kg per active shift. Storage,
  fallback, and monitoring material are respectively
  $\operatorname{logU}(10,200)$ kg/m$^3$,
  $\operatorname{logU}(1,50)$ kg/(m$^3$/d), and
  $\operatorname{logU}(1,100)$ kg/point. Freeze an equipment compatibility class
  as `(asset kind, catalogue/model ID, nominal capacity, specification vector)`;
  continuously sized assets receive a frozen model ID that is also assigned to
  every spare generated for that exact specification. `Same class` below means
  equality of this complete tuple, not merely both being pumps, plants, storage,
  or backup units. Each initial spare duplicates its compatibility class's full
  nominal capacity, initial capital, and material row. Backup power costs
  $\operatorname{logU}(100,2000)$ EUR$_{2026}$/(m$^3$/d) protected capacity and
  $\operatorname{logU}(1,50)$ kg/(m$^3$/d); multiply both by that unit's frozen
  $q^{prot}_a$ and sum once across installed units (zero when $f_b=0$).
  Consumable-store capital is
  $\operatorname{logU}(1,10)$ EUR$_{2026}$/kg capacity, where capacity equals
  chemical dose times design flow times selected stock days. Backup electricity
  costs $U(0.2,0.8)$ EUR$_{2026}$/kWh and emits $U(0.2,1)$ kg CO$_2$e/kWh.
  Embodied factors are
  $\operatorname{logU}(0.5,5)$ kg CO$_2$e/kg. Electricity price is
  $U(0.05,0.40)$ EUR$_{2026}$/kWh and grid intensity is $U(0.02,0.8)$ kg
  CO$_2$e/kWh. Each plant and local fallback draws chemical dose
  $\operatorname{logU}(0.001,0.5)$ kg/m$^3$ and non-pump electricity intensity
  $e_a\sim U(0.1,2)$ kWh/m$^3$. Chemical price is log-uniform 0.1--10
  EUR$_{2026}$/kg, road travel
  costs $U(0.3,2)$ EUR$_{2026}$/km, and fixed O&M is $U(0.01,0.05)$ of installed
  capital/y. Each installed repairable asset—plant treatment train, pump,
  storage unit, fallback unit, monitoring point, backup-power unit, or depot—draws one replacement
  life $T_a\sim U(8,30)$ y and one $f^{rep}_a\sim U(0.2,1)$ that supplies both
  replacement capital and material burden. Its integer service-life threshold is
  $\ell_a=\lceil12T_a\rceil$ months with $\Delta=365.25/12$ d per month: the first
  planned-replacement request enters the ordinary FIFO depot queue at the opening
  of month $\ell_a$. Each such request draws on-site crew work
  $w^{plan}\sim U(2,80)$ h and passive commissioning
  $d^{comm}\sim U(1,90)$ d. The asset remains operational while waiting for a
  unit or crew. When its crew job starts, the unit is consumed, the asset becomes
  unavailable, and the job uses the same travel, shift, pre-emption, and operator-
  cost rules as an equipment repair. After crew work completes, commissioning
  runs for $d^{comm}$ without occupying a crew. If commissioning completes at
  continuous global day $t_c$, physical return and the age reset occur at global
  integer hour $h^{ret}_a=\lceil24t_c\rceil$; define the first calendar-month
  opening not before return as $r_a=\lceil h^{ret}_a/(24\Delta)\rceil$, and let the
  next request enter at the opening of month $r_a+\ell_a$. This recurrence reuses
  the same $\ell_a$ rather than redrawing a favourable life, and no age accrues
  between removal and the return boundary. Unavailable overlap with each month
  reduces that asset's available capacity by the corresponding fraction of
  monthly hours; monthly lifecycle rows aggregate the hourly queue/commissioning
  ledger.

  Lifecycle collisions use one replacement job per asset. A planned due date
  reached while that asset has an open equipment-damage condition, equipment-
  repair request, or equipment-repair commissioning state is suppressed and
  logged without reserving stock or placing an order. A planned job that was
  already requested may not start while an independent hazard impairment is
  active on its asset; its reservation and FIFO position are retained. Completion
  of an equipment repair that consumes a same-class unit is an unplanned
  replacement. At actual restoration hour
  $h^{rest}_a=\lceil\max(t_{on}+d_{event},t_{\mathrm{repair\ complete}})\rceil$ its
  service age resets to zero and its next request enters at month
  $\lceil h^{rest}_a/(24\Delta)\rceil+\ell_a$. By the equipment-target eligibility
  rule below, no planned request, reservation, order, or commissioning state can
  coexist with that equipment repair; encountering such a state invalidates and
  resamples the scenario. No life, work, or commissioning draw is redrawn. These
  rules preclude two concurrent replacement jobs or orders for one asset.

  Spare stock is an integer state per site and exact compatibility class,
  initially equal to the architecture tuple's 0--2 count for every installed
  class at each opened plant; each depot also
  receives that count for the depot-asset class and zero units of every other
  class. A depot's dispatchable same-class pool is exactly
  the sum of unreserved units at plants it serves; a dispatch records and
  decrements the origin plant selected by minimum shortest-road distance from
  that plant to the requesting asset, then by plant hash. A planned replacement
  or equipment repair first reserves one available on-site unit or then the
  selected depot-pool unit. If none exists, it places one dedicated unit order
  with a fixed 90 d lead and is ineligible for crew dispatch until that arrival;
  a planned asset continues operating during this wait, whereas a damaged asset
  remains unavailable. At crew-work start the reserved/dedicated unit is
  consumed. Consuming stock immediately places one separate replenishment order
  with the same 90 d lead; its arrival increments the recorded origin stock only
  up to its initial design count. A dedicated order is installed by its named job
  and never also increments stock. Orders are FIFO by request timestamp then asset
  hash, may be outstanding concurrently, and each charges exactly one
  target asset's $f^{rep}_a$ capital/material row at order time and carries that
  target class's nominal capacity and specification. This is the only restocking
  rule; no emergency unit appears for free. Decommissioning and salvage are independently $U(0.05,0.30)$
  and $U(0,0.20)$ of initial capital. For each plant or fallback, chemical mass
  is its dose times its own treated gross volume and non-pump electricity is
  $e_aV_a$ kWh; pump electricity remains the separate hydraulic row for every
  ordinary and event flow. When grid status is available, all process and pump
  kWh use the grid price/intensity. During grid loss, the backup-supported
  fraction uses the frozen backup price/intensity; unsupported flow capacity is
  zero. No kWh appears in both rows. Total constant-EUR cost is the row sum of initial and replacement
  capital, O&M, electricity, chemical, operator, and travel costs plus
  decommissioning minus salvage. Lifecycle GHG is embodied initial/replacement
  material plus electricity at the applicable grid/backup factor and chemical at
  log-uniform 0.1--10 kg CO$_2$e/kg. Rows evolve monthly for 30 y; replacements
  restore capacity only after the frozen spare/procurement, work, cost, material,
  and downtime transitions above. Open orders and unavailable assets remain in
  the month-360 terminal record.
- **Frozen outage and service map:** design and evaluator scenario generators are
  identical but use disjoint hashes. Each of 16 design and 64 evaluator
  scenarios draws one type uniformly from equipment, flood, grid power,
  communications, consumable, or road/operator access. With
  $H_{30}=30(365.25)(24)$ h, start hour is
  $U_{\mathbb Z}\{0,\lfloor H_{30}-2160\ \mathrm h\rfloor\}$, so the complete 90 d paired event/ordinary window
  remains inside the frozen lifecycle horizon. Equipment selects uniformly from the complete
  installed plant, pump, storage, fallback, monitoring, power, and depot asset
  ledger that is available immediately before onset and has no open planned-
  replacement request, reserved replacement unit, or commissioning state;
  resample the scenario under
  the common generator cap if none exists. Its duration is the ceiling in hours
  of a log-uniform 2--720 h draw. Plants, plant storage, outlet monitors, plant
  backup, and consumable stores use their plant-node coordinate; fallback,
  fallback backup, and demand monitors use their demand-node coordinate; depots
  use their selected node; and a pump plus its backup use the midpoint of its
  road-tree segment. A point asset is
  inside a hazard footprint when its Euclidean distance to the centre is at most
  the radius. A road or pipe edge is inside when its closed line segment
  intersects the closed disk, evaluated by point-to-segment distance; touching
  the boundary counts. Every hazard interval is half-open $[t_0,t_0+d_h)$ on
  this global integer-hour grid. Flood marks every plant, pump, monitor, storage,
  fallback, power unit, depot, and road edge inside its footprint unavailable
  and moves its stored water and pollutant mass to a typed `flood_release` ledger,
  leaving storage volume and mass zero. That released water is not delivered and
  therefore does not enter $N_q$, $A_q$, or $R_q$; its lost service enters
  $H_q$/$\Delta S_q$, while released m$^3$ and kg remain separate environmental
  rows. Every other spatial
  type uses the ceiling in hours of a log-uniform 6--1,440 h draw and
  affects all relevant assets whose coordinates fall inside a centre drawn
  uniformly over the square and radius log-uniform 0.1--50 km. Communications
  removes remote observations/actions but not local fallback. Grid events remove
  grid supply and leave only the tuple's backup-power fraction. Consumable
  events stop replenishment. Every plant and fallback $a$ has its own store and
  never borrows another asset's chemical. Let $q^{design,d}_a$ be plant
  $q_{cap}$ or the fallback node's full peak flow in m$^3$/d. Its capacity and
  ordinary refill rate are
  $M^{chem}_{max,a}=dose_aq^{design,d}_ad_{stock,a}$ kg and
  $r^{chem}_a=dose_aq^{design,d}_a/24$ kg/h. The ordered hourly transition is:
  pre-flow inventory $M^{avail}_a=M_{a,t}$; chemical volume cap
  $V^{chem}_a=M^{avail}_a/dose_a$ m$^3$; source-rate cap equal to the lesser of
  its hydraulic/power cap and $V^{chem}_a/(1\ \mathrm h)$; max-flow realization
  $V_{a,t}$; then $M^-_a=M^{avail}_a-dose_aV_{a,t}$. Finally set
  $M_{a,t+1}=\min(M^{chem}_{max,a},M^-_a+(1\ \mathrm h)r^{chem}_a)$ when
  replenishment is available and $M_{a,t+1}=M^-_a$ when it is not. Thus same-hour
  refill cannot authorize flow, plant $V_{a,t}$ excludes fallback volume, and a
  fallback consumes only its own store. Access events pause affected travel. Each
  event scenario and its paired no-hazard ordinary window clone the same ordinary
  lifecycle state at its start hour and reset available storage and consumable
  stores to their design maxima with the declared $C^{store}_{k,0}$. Both then
  run the same fixed 90 d window; only the event copy receives the hazard. Truth
  availability is sampled at the opening of each global integer hour and applies
  on that hour. Controller actions occur at global hours divisible by 6 and take
  effect immediately; an onset between those boundaries retains the last
  ordinary action until the next boundary. Continuous repair/work completion is
  made physically available at $\lceil t_{complete}\rceil$ h; packet arrival
  keeps its continuous delay and is usable at the first decision boundary whose
  time is at least its arrival. Hourly demand, service, noncompliant delivery,
  and flood-release rows are scored only through hour 2160;
  there is no fictitious post-window demand. If an exogenous equipment damage
  condition remains open at hour 2160, that system design is infeasible in the
  scenario. Also fail when an unavailable asset/job is open in the event copy but
  not in the paired no-hazard ordinary copy at that same terminal; an identical
  planned-replacement state open in both copies is not a hazard failure and has
  already reduced both service ledgers. Cost and material for
  every order already placed remain charged. An open stock-replenishment order
  not tied to an unavailable asset remains a terminal inventory deficit but does
  not by itself fail the scenario.
  For an equipment scenario, the sampled 2--720 h duration is the exogenous
  damage interval and restoration occurs at
  $\max(t_{on}+d_{event},t_{\mathrm{repair\ complete}})$. Thus a short repair cannot erase
  continuing damage and an elapsed damage interval cannot erase a spare/queue
  delay. Footprint effects restore exactly at event end and do not create an
  unstated repair unless the scenario type is equipment.
  An unavailable depot supplies no crew, stock dispatch, or new work. Its
  in-progress job is paused, retains any already reserved spare at that job site,
  and is requeued with its remaining repair-work balance at the available depot;
  old travel progress is discarded and the full round trip from the new depot is
  charged. Choose the available depot
  having minimum shortest-road distance to the affected asset, then lowest depot
  hash. The same rule assigns repair of the depot asset itself. If no depot is
  available, every crew-mediated job remains queued with zero progress: a
  footprint-disabled depot can resume after event end, whereas an equipment-
  disabled sole depot cannot self-repair and remains open at the 90 d terminal.
  On the first depot restoration, queued jobs are reassigned in their original
  FIFO order. Reservation/procurement may occur while a job is queued under the
  unified rule above, but a reservation alone moves no unit. At crew dispatch,
  the origin unit is instantaneously staged at the assigned available depot with
  zero elapsed time, distance, energy, emissions, and cost; this is an explicit
  logical-fungibility abstraction. The crew carries it on the already counted
  outbound depot-to-asset leg, and it reaches the job site when that outbound leg
  completes; the declared depot-to-asset round trip is the only transport row.
  If that depot or access route is unavailable, dispatch and staging cannot occur.
  Repair requests enter a FIFO depot queue, require $U(2,80)$ operator-h, consume
  a same-class spare under the frozen inventory/procurement rule above, and
  include shortest-road travel. With no available spare, work cannot start until
  the ordered unit arrives; the no-spare interval remains outage, unserved
  service, cost, and operator-queue time. Synthetic clock hour 0 is the daily
  schedule origin. With $s\in\{1,2,3\}$ shifts, a depot has exactly one crew
  available in the half-open daily window $[24d,24d+8s)$ h for every integer day
  $d$, and no crew outside it; adjacent shifts hand over with no lost work. A
  job consumes $2d_{road}/(50\ \mathrm{km/h})$ crew-h for outbound-plus-return
  travel and its sampled 2--80 operator-h of repair or planned-replacement work, with both balances paused
  outside the window. Controller-requested pre-emption is permitted only at 6 h
  action boundaries; a shift closing suspends work regardless of that grid and
  the same job resumes at the next coverage opening from its saved balance.
  Unavailable access pauses repair. At each one-hour event step, storage state
  obeys
  $V_{t+1}=\operatorname{clip}[V_t+(1\ \mathrm h)(\dot V_{in}-\dot V_{out}),0,V_{max}]$
  with rates in m$^3$/h; pollutant mass uses the same one-hour multiplier on
  mg/h inflow/outflow fluxes and perfectly mixed concentration. Storage outflow is capped at its
  assigned hourly demand and recharge uses only compliant surplus. Local
  fallback is a source capped at its node-specific operational $\bar q^{fb}_i$, with
  independent $\eta_f\sim U(0.99,0.99999)$, and consumes the same declared
  power and chemical resources. A capacitated max-flow carries both m$^3$/h and
  pollutant mg/h, mixes incoming mass at every node, applies plant/fallback
  removal, and uses the time-expanded objective and tie order frozen in the
  action map below. Delivered volume
  is compliant service only when outlet concentration is at most the destination
  $C_{lim}$. For the one-hour event step, node $i$ contributes

  $$
  H_{i,t}=P_i\,\operatorname{clip}\!\left(
  1-\frac{V^{comp}_{i,t}}{V^{dem}_{i,t}},0,1\right)(1\ \mathrm h)
  $$

  person-h, where $V^{comp}$ is compliant delivered volume capped at demand;
  if $V^{dem}_{i,t}=0$, define $H_{i,t}=0$. Unserved and noncompliant delivery
  both reduce $V^{comp}$ and therefore contribute proportionally rather than
  being treated as a zero/full binary outage. Scenario exposure is
  $H=\sum_{i,t}H_{i,t}$ and the feasibility gate uses its arithmetic mean across
  the 64 evaluator scenarios. The evaluator records unserved and noncompliant delivered
  volume, person-hours, repair, travel, and every
  lifecycle row. Missing monitoring, unreachable maintenance, or absent
  emergency storage makes an architecture infeasible before scoring.
- **Observation and operating-action map:** each `(asset, field)` draws one
  seed-frozen delay $\delta\sim U(0,6)$ h. Binary equipment, actuator, grid,
  communications, and access status is exact at its integer-hour sample time
  and receives no Gaussian perturbation. For a continuous flow sample, its scale
  is $\bar q_{hyd}$ for a plant, $\bar q^{fb}_i$ for fallback $i$, or
  $q_{e,max}$ for a pipe or pump, all in m$^3$/h. Concentration, storage, and
  available-backup-fraction scales are respectively
  $\min_{i\mapsto k}C_{lim,i}$, $V_{max}$, and 1. Each continuous field reports
  $y=\operatorname{clip}(x+\epsilon,l,u)$ with
  $\epsilon\sim N(0,(0.02\,scale)^2)$; bounds are $[0,\infty)$ for flow and
  concentration, $[0,V_{max}]$ for storage, and $[0,1]$ for backup fraction.
  A packet sampled at $t$ becomes usable at $t+\delta$ with its sample timestamp.
  At a 6 h decision boundary an arm receives exactly the packets whose arrival
  time has elapsed and uses the latest timestamp per field. Remote packets
  sampled during communications loss are dropped rather than delivered later;
  local source-outlet packets remain available to the local rule.

  For a concentration packet with scale $s_C$, freeze the one-sided observational
  upper bound $U_C=\max(0,y_C)+2.326(0.02s_C)$. Missing concentration makes
  $U_C=\infty$. A local quality alarm occurs when $U_C>C_{lim}$ for any assigned
  destination; a local power alarm occurs when latest exact grid, source, pump,
  or actuator status on the assigned path is unavailable. These are policy
  calculations, not claims of simultaneous physical 99% coverage.

  Every 6 h an action selects, for each opened plant, a storage-release cap
  $g_k\in\{0,0.25,0.5,0.75,1\}$ times
  $\min[V_k,(6\ \mathrm h/(24\ \mathrm{h/d}))q^{peak}_{assigned,k}]$ m$^3$, and, for each
  available depot, `none` or one currently queued job. A controller also selects
  `assigned` or `shared` routing. It does not set continuous pipe flows:
  `assigned` exposes only the tuple's assigned source paths, while `shared`
  exposes all currently available installed edges and sources; the declared
  lexicographic capacitated max-flow is a six-layer hourly time-expanded network
  and uniquely chooses continuous flows, storage up to the epoch cap, and
  available fallback up to $\bar q^{fb}_i$. Its objectives sum over the six layers;
  each layer converts m$^3$/h and mg/h rates to volume and mass with exactly
  $\Delta t=1$ h.
  it minimizes noncompliant m$^3$, unserved m$^3$, person-h, and operating EUR
  lexicographically, then maximizes terminal stored m$^3$, then minimizes the
  ordered path-hash vector and flow-variable hash.
  Only a job with a reserved stock unit or arrived dedicated unit is dispatch-
  eligible; otherwise it remains in the frozen procurement wait. Busy,
  unavailable, malformed, or over-cap actions are rejected, logged, and replaced
  by A's safe local action for that epoch.

  A uses `assigned`, sets $g_k=1$ only after reported inflow loss, otherwise zero,
  permits local fallback on a power/quality alarm or unmet demand, and dispatches
  the oldest feasible FIFO job at each depot. B uses a four-epoch 24 h receding
  horizon. Its forecast knows deterministic calendar demand, executed actions,
  queue/work/procurement balances, and latest arrived packets; it holds latest
  continuous flow/quality forcing constant, assumes no new hazard, and keeps a
  currently reported impairment active until a known repair/procurement
  completion. It receives no event end, future noise, delayed packet, or sealed
  state. B enumerates the finite storage-cap and eligible-dispatch choices,
  invokes the unique max-flow for continuous quantities, minimizes predicted
  noncompliant m$^3$, unserved m$^3$, person-h, then EUR lexicographically, uses
  action hash for a final tie, and executes only the first epoch. Failure to
  complete this exact mature-null optimization is a retained terminal failure,
  not permission to substitute an undeclared heuristic.

  For C, let $D^{6h}_i$ be known six-hour demand and let $S^{6h,max}_i$ be the
  unique max-flow's maximum compliant six-hour supply using latest reported
  availability, current storage, permitted fallback, and the $U_C$ bounds. Set
  reserve $R_i=S^{6h,max}_i/D^{6h}_i-1$, with $R_i=\infty$ only when
  $D^{6h}_i=0$. C uses A's local action only while every $R_i>0.20$, every
  contributing source has $U_C<0.8C_{lim,i}$, and no latest reported shared asset
  on the path is impaired; otherwise it invokes B. Communications loss forces
  the local rule, for which missing quality closes the source. All arms receive
  identical delayed packets and physical actuator availability.
- **Frozen architectural constraint map:** the five named feasibility constraints
  are the following exhaustive booleans; no implementation may infer an extra
  threshold from a tuple fraction.

  1. `monitoring`: installed counts equal the mandatory source-outlet points plus
     $\lceil f_{mon}N\rceil$ demand-node points. An operating plant or fallback
     requires its own outlet monitor to be available; otherwise its flow is
     forced to zero until monitoring returns. Node monitors provide the delayed
     quality observations but do not create oracle truth.
  2. `reachable_access`: in the ordinary road tree every repairable asset has a
     finite shortest path to at least one depot. Hazard-time loss of that path or
     depot follows the frozen queue/no-depot transition and is scored as service,
     person-hour, work, and cost—not a second hidden feasibility test.
  3. `emergency_48h`: for node $i$ assigned to plant $k$, allocate shared storage
     $V^{alloc}_i=V_{max,k}q^{peak}_i/q^{peak}_{assigned,k}$. Let $I^{fb}_i$ mark
     an installed local fallback, $f_b$ be backup-power fraction, and $d_{stock}$
     consumable-stock days. Freeze
     $q^{fb,d}_i=I^{fb}_i\min(1,f_b,d_{stock}/2)q^{peak}_i$ m$^3$/d and
     $\bar q^{fb}_i=q^{fb,d}_i/24$ m$^3$/h. Require

     $$
     V^{alloc}_i+(2\ \mathrm d)q^{fb,d}_i\ge(2\ \mathrm d)q^{peak}_i
     \quad\text{for every demand node }i.
     $$

     A zero assigned-peak denominator is invalid. During a grid event an available
     plant or positive-head pump is capped at its installed
     $q^{prot}_a/24$ m$^3$/h, an unavailable backup unit makes that protected
     capacity zero, gravity directions remain power-independent, and fallback is
     capped at its declared $\bar q^{fb}_i$ while its backup unit is available.
     Backup electricity and fallback chemicals remain charged. This static inventory
     gate does not waive the scenario service gates.
  4. `operator`: every depot has its tuple's $s\in\{1,2,3\}$ and obeys the exact
     shift/travel schedule above. Work outside that capacity is impossible and
     remains queued; there is no unregistered minimum-utilisation or completion
     threshold.
  5. `maintenance`: every repairable asset has a typed lifetime, cost/material
     row, depot route, spare state, and procurement transition. Spare count zero
     is permitted only through the charged 90 d no-spare branch. At an event
     terminal, an exogenous damage condition or event-copy-only unavailable
     asset/job fails the scenario; a state identically open in the paired ordinary
     copy and an inventory-only replenishment deficit are retained and charged
     but do not. At the ordinary month-360 terminal, unavailable time has already
     reduced $S^{ord}_{30y}$ and placed orders remain charged; neither state is
     extrapolated beyond the horizon or deleted by imputation.

- **Arms:** A selects the lower cost/service among design-feasible catalogue
  indices 0 and 1 and falls back to feasible anchor 0 if index 1 fails. B
  enumerates all 33 tuples using the 16 design
  scenarios, the complete hydraulic/lifecycle ledger, and its scheduler, then
  selects minimum predicted cost/service among design-feasible tuples. C uses
  the same catalogue, ledger, scenarios, and constrained choice with
  P-002/P-008/P-009/P-013 modular hierarchy with shared state and local
  fallback. `Design-feasible` applies the same numerical gates below to the 16
  design scenarios; evaluator feasibility is recomputed only after selection.
  For a common regret oracle, define a system design $z=(a,p)$ as one of the 33
  architecture tuples paired with one of the three frozen A/B/C operating
  policies above. The evaluator runs all 99 pairs on the same 64 scenarios;
  hence $\mathcal F$, cost, and service never change policy silently between an
  arm and its oracle. Arm A may select only its two A-policy endpoint pairs, B
  any B-policy pair, and C any C-policy pair.
- **Mature null:** B sees the same sites, costs, hazards, operators, quality
  targets, and uncertainty as C and returns a Pareto set before the primary
  constrained choice.
- **Transfer family:** held-out dense urban, sparse rural, steep topography,
  cold-climate, and common-cause power/flood families.
- **Primary metric and threshold:** for evaluator scenario $q$, let $D_q$ be
  exogenous ordinary demand over its same 90 d calendar window, $N_q$ the
  noncompliant delivered m$^3$, $H_q$ the person-hour sum above, $R_q$ the count
  of node-hours with positive delivered volume, and $A_q$ the subset whose mixed
  delivered concentration exceeds that node's $C_{lim}$. On the 64 evaluator
  scenarios, a feasible system design must satisfy

  $$
  \frac{\sum_qN_q}{\sum_qD_q}\le0.001,\qquad
  \frac1{64}\sum_qH_q\le24P\ \text{person-h},\qquad
  \frac{\sum_qA_q}{\sum_qR_q}\le0.001.
  $$

  A zero or non-finite $\sum_qD_q$ or $\sum_qR_q$ fails feasibility rather than
  making a favourable ratio. The 16 design scenarios apply identical pooled
  formulas with 16 in the exposure mean. The system must also satisfy the frozen monitoring, reachable-
  access, 48 h emergency-storage-or-equivalent-fallback, operator, and
  maintenance constraints. For system design $z$, let $C^{ord}_{z,30y}$ and
  $S^{ord}_{z,30y}$ be ordinary 30-year constant-EUR cost and compliant service.
  For scenario $q$, rerun its matching ordinary 90 d window without the hazard
  and freeze

  $$
  \Delta C_{z,q}=C^{event}_{z,q}-C^{ord-window}_{z,q},\qquad
  \Delta S_{z,q}=\operatorname{clip}(S^{ord-window}_{z,q}-S^{event}_{z,q},
  0,S^{ord-window}_{z,q}).
  $$

  Define

  $$
  C_z=C^{ord}_{z,30y}+\frac1{64}\sum_q\Delta C_{z,q},\qquad
  S_z=S^{ord}_{z,30y}-\frac1{64}\sum_q\Delta S_{z,q}>0.
  $$

  Thus reduced event-period operating cost, repair/procurement cost, unserved
  volume, and noncompliant volume enter once; 64 counterfactual lifetimes are
  never summed. Freeze

  $$
  L_s=\frac{C_{\widehat z}}{S_{\widehat z}}-
  \min_{z\in\mathcal F}\frac{C_z}{S_z}
  \quad\text{EUR}_{2026}/\text{m}^3.
  $$

  An infeasible, zero-service, non-finite, or absent terminal system design gets
  $L_{fail}=\max_{z\in\mathcal F}C_z/S_z-\min_{z\in\mathcal F}C_z/S_z+10$
  EUR$_{2026}$/m$^3$. B uses $r=0.15$.
- **Secondary metrics:** compliant service and noncompliant delivered volume
  (m$^3$); flood-release volume (m$^3$) and pollutant mass (kg); outage exposure (person h); mean and 95th-percentile repair time
  (h); pipe (km); materials (kg); simulated pump electricity (kWh); operator
  travel/work (h); lifecycle GHG (kg CO$_2$e); architecture-class accuracy (%).
- **Protected gates:** the feasibility constraints above are absolute;
  noncompliant volume, outage person-hours, water-quality probability,
  flood release, service, operator work, energy, material, GHG, and cost remain
  separate rows; water and pollutant ledgers close within $10^{-7}$ relative error.
- **Stopping/abstention:** an architecture lacking reachable maintenance,
  required monitoring, emergency storage, or treatment compliance is infeasible
  rather than assigned a favourable low cost.
- **Novelty/kill:** C must beat or resource-dominate the complete constrained
  facility-location/reliability null. A universal module or centralisation ratio
  is not an allowed result.
- **Artifacts:** `spatial-graph.json`, `facilities.jsonl`, `hazards.parquet`,
  `outages.parquet`, `service.csv`, `lifecycle.csv`, `pareto.jsonl`.

## Arms, baselines, and strongest nulls

Every local A/B/C definition above controls. This table is navigation, not a
replacement for the frozen equations, observations, actions, or terminal rules.

| Protocol | Collapsed A | Strongest mature B | Exact local C arm |
|---|---|---|---|
| ENV-T01 | Ideal CSTR/plug flow using nominal mean contact time | Tracer-calibrated tanks-in-series plus axial-dispersion model | P-012/P-013 versioned graph and flow-history state |
| ENV-T02 | HRT-only first-order removal | Calibrated guild-resolved activated-sludge model with explicit SRT | P-004/P-005/P-012 lifetime-qualified population specialization and history |
| ENV-T03 | Independent local level, pump, and plant rules | Robust integrated MPC over the complete graph | P-002/P-006/P-008/P-013 hierarchy with local fallback and versioned shared state |
| ENV-T04 | Static univariate three-standard-deviation alarms | Moving-window multiscale PCA plus observer/residual bank and maintenance events | P-007/P-009/P-013 with CAND-014 versioned observation contracts |
| ENV-T05 | Fixed critical flux and cleaning interval | Nonlinear fouling-state estimator and constrained MPC | P-005/P-009/P-012 history and maintenance state |
| ENV-T06 | Fixed removal or independent batch Langmuir fits | Calibrated multicomponent transport/adsorption model fit to column data | P-005/P-009/P-012 media-lineage state with active sampling |
| ENV-T07 | pH threshold plus fixed feed reduction | ADM1 plus EKF and multi-indicator constrained control | P-006/P-007/P-009/P-012 delayed prediction with active assay allocation |
| ENV-T08 | Parent-removal percentage | Kinetic/speciation model plus fixed target, non-target, mass, and effect battery | P-007/P-009/P-013 active assay allocation and versioned product graph |
| ENV-T09 | Plant-gate efficiency score | DIN EN ISO 14040/14044-compatible fixed-uptake lifecycle Monte Carlo | P-013 versioned service, measured uptake, and compensation-aware transitions |
| ENV-T10 | Lower-cost feasible centralized/decentralized endpoint | Complete constrained facility-location, hydraulic, reliability, maintenance, and lifecycle optimizer | Context-qualified modular hierarchy with shared state and local fallback under P-002/P-008/P-009/P-013 |

B is never replaced by a weaker heuristic after outcomes are visible. Oracle
information may diagnose headroom but cannot enter a deployable comparison. C
must beat or resource-dominate B, not merely A. Mature engineering already in B
is not relabelled as a novel project principle.

## Matched and equal-budget contract

The matched contract is conjunctive:

1. A, B, and C receive the same seed-level latent world, exogenous forcing,
   horizon, initial state, physical constants, boundary flows, event schedule,
   and evaluator truth.
2. Deployable arms receive only their locally declared observation packets,
   delays, noise, assay panel, status fields, and communication state. Oracle
   truth is evaluator-only.
3. Each arm has the same physical actuator set, action cadence, rate and state
   limits, fallback authority, maintenance access, and terminal horizon.
4. Development worlds, tuning opportunity, solver tolerances, CPU limit,
   memory limit, artifact limit, and retry/failure policy are matched. Unused
   budget is not transferred.
5. Additional samples, assays, tracer pulses, chemicals, media, replacement
   units, operators, maintenance visits, storage, backup power, and network
   capacity are explicit resources, never free side information.
6. The 64 development, 128 sealed confirmation, and 64 sealed transfer seeds
   remain disjoint. Timepoints, channels, solutes, reactors, storms, assets,
   episodes, and node-hours are repeated measures inside one seed.
7. Invalid, refused, timed-out, non-finite, or terminated worlds retain their
   finite local terminal loss and remain in every scheduled denominator.
8. A safe fallback is a charged action. It consumes its declared time, service,
   assay, material, chemical, media, operator, and compute resources.
9. Conservation, functional-unit, quality, safety, service, and feasibility
   gates are constraints. A favorable weighted mean cannot average them away.
10. Simulated plant electricity in kWh is distinct from workstation
    electricity. Workstation joules remain unmeasured unless a separate
    calibrated meter boundary is preregistered.

A complexity difference is not a resource result by itself. The C novelty
route is frozen before confirmation as either 10% lower primary loss or 15%
lower named resource with the common primary-loss non-inferiority gate. A local
stricter route, including ENV-T06's assay route and ENV-T08's explicit
false-safe constraint, overrides that generic route.

## Measurements and units

The local equations and finite terminal maxima above control. This table makes
the primary scalar and protected ledgers visible in one place.

| Protocol | Seed-level primary | Native unit | Required separate ledgers and protected quantities |
|---|---|---|---|
| ENV-T01 | Early-escape and reacted-mass absolute error | kg | RTD quantiles (h), tracer/reacted/stored mass (kg), interval coverage, constituent closure |
| ENV-T02 | Daily ammonium/nitrite effluent-mass absolute error | kg N | Concentration (mg N/L), washout/recovery (d), violation (h), biomass/N closure, simulated aeration (kWh) |
| ENV-T03 | Integrated receiving-water nitrogen load through recovery | kg N | COD (kg), CSO (m$^3$), flooding (m$^3$ h), noncompliance/exceedance (h and kg), simulated pumping (kWh) |
| ENV-T04 | Weighted alarm, delay, wrong-isolation, unsafe-exposure, and uncontained-event loss | h-equivalent per 1,000 channel-h | False alarms, delay (h), set coverage, confusion, unsafe-control exposure (h), assays and maintenance |
| ENV-T05 | Unmet compliant volume plus twice noncompliant gross volume | m$^3$ | Permeate (m$^3$), TMP (kPa and h), resistance (m$^{-1}$), chemicals (kg), downtime (h), replacements, simulated pumping (kWh) |
| ENV-T06 | Integrated truth-level load above solute-specific limits | mg | Breakthrough (bed volumes and d), retained/released mass (mg), media (kg), assays, service volume |
| ENV-T07 | Feed-weighted upset duration plus lost feed plus unsafe-feed exposure | kg COD-equivalent | VFA (mg COD/L), alkalinity (meq/L), methane (Nm$^3$/d), feed (kg COD), delay (h), unsafe actions |
| ENV-T08 | False-safe declarations | false-safe per 1,000 episodes | Parent/products (micrograms/L), TOC (mg C/L), element closure, effect index, ozone/media/assays, simulated electricity (kWh) |
| ENV-T09 | Excess lifecycle GHG intensity relative to the best feasible alternative | kg CO$_2$e/m$^3$ compliant service | Displacement (m$^3$/m$^3$), electricity (kWh/m$^3$), abstraction (m$^3$), N/P (kg), EUR$_{2026}$, service (m$^3$) |
| ENV-T10 | Excess 30-year cost per compliant service relative to the best feasible system-policy pair | EUR$_{2026}$/m$^3$ | Service/noncompliance/flood release (m$^3$), pollutant (kg), person-h, repair (h), pipe (km), material (kg), simulated electricity (kWh), GHG (kg CO$_2$e) |

Every track also records CPU-seconds, wall-seconds, peak resident bytes, bytes
read and written, artifact bytes, terminal status, abstention, fallback, and
every failed scheduled run. Assay count, chemical kg, media kg, water m$^3$,
operator h, process kWh, currency, workstation resources, and any future
calibrated joules remain separate columns.

Units must be machine-readable and dimensionally checked before confirmation.
Concentration cannot stand in for mass or load; nominal contact time cannot
stand in for an RTD; HRT cannot stand in for SRT; parent disappearance cannot
stand in for destruction or safety; and zero service cannot create a favorable
efficiency ratio.

## Required ablations and interventions

These are mechanism diagnostics run as paired counterfactual clones of all 64
public development seeds. Each numbered item below defines its complete cell
set; run one unmodified clone and one clone per stated cell and seed. In the
substream key `SHA256("ENV-v2|ENV-Txx|dev|seed|intervention-name|cell")`, replace
`ENV-Txx` by the zero-padded protocol ID and `seed` by its unsigned decimal seed.
The intervention name is `env-txx-interventions` with the same zero-padded ID;
the cell is its exact lowercase label below. Brace notation denotes the
left-to-right Cartesian expansion of the comma-ordered literals, so
`delay-{0,6}-buffer-{20,200}` expands to four exact hyphen-joined labels. Fields
are UTF-8 joined by literal `|`, and the final eight
digest bytes interpreted as one unsigned big-endian integer seed PCG64-DXSM.
Unmodified and intervened clones
share every exogenous draw not explicitly overwritten. A masked action is
removed before policy optimization, so no rejected-request retry grants extra
authority. All locally frozen safety fallbacks and terminal scores remain
active unless an item explicitly supplies an equally conservative replacement.
These diagnostics do not replace A/B/C comparisons, enter confirmation model
selection, consume confirmation/transfer worlds, or receive confirmatory
p-values.

### ENV-T01 interventions

1. Let $n_s=N-m$ and define the supported low stagnant fraction
   $f_s^{low}=0.005n_s+0.02$. Run four cells `b00-fslow`, `b00-fs30`,
   `b20-fslow`, and `b20-fs30`, overwriting $(b,f_s)$ with
   $\{0,0.20\}\times\{f_s^{low},0.30\}$. Preserve $Q,V,\tau_n,N,m,r_c$,
   attachments, and original within-group Dirichlet proportions $p_i$. Give
   every active compartment $[0.005+(1-f_s-0.005m)p_i]V$ and every side
   compartment $[0.005+(f_s-0.005n_s)p_i]V$; group-specific $p_i$ sum to one.
   This construction preserves both group totals and the 0.5% floor even when
   $n_s>4$. Recompute every flow from the canonical equations. A cell violating
   any other support/closure gate is one retained generator failure and never
   resamples the seed.
2. In cell `c-mean-only`, replace C's graph/flow-history input by the tuple
   $(V,Q,\tau_n)$ and one undifferentiated compartment ID; hide compartment,
   edge, bypass, exchange, recycle, and version fields. Keep observations,
   parameter count, tuning iterations, CPU cap, and abstention rule unchanged.
3. In cell `obs-cut-2tau`, deliver no calibration or evaluation outlet packet
   with sample time greater than $2\tau_n$ to any arm. Truth still integrates to
   canonical $H$; the packet stream carries the cutoff censor flag, and all
   reacted, escaped, and stored terminal mass remains in scoring.

### ENV-T02 interventions

1. Run cells `srt-3d`, `srt-12d`, and `srt-40d`, overwriting $\theta_c$ with
   3, 12, and 40 d while preserving $Q,V,\theta,R,R_Q$, kinetics, and forcing.
   Recompute the canonical burn-in separately for each cell; a nonconvergent
   cell retains generator-failure status rather than selecting another SRT.
2. In cell `c-one-guild`, replace C's two guild states by
   $X_T=X_A+X_N$. Freeze the AOB share to the development seed's burn-in value
   $\pi_A=X_A/(X_A+X_N)$ and evaluate both canonical rate laws at
   $(X_A,X_N)=(\pi_AX_T,(1-\pi_A)X_T)$ at every prediction step; only $X_T$ is
   updated from their summed growth, decay, and wasting flux. Truth and B retain
   separate guilds. A zero or non-finite burn-in denominator makes the cell a
   retained generator failure.
3. In cell `c-reset-at-shock`, reset only C's latent guild posterior mean and
   covariance to its day-0 post-burn-in prior at every registered load-shock
   onset. Do not reset physical truth, B, observations, or action history, and
   charge the reset computation within C's unchanged budget.

### ENV-T03 interventions

1. In cell `local-observation-only`, each sewer controller receives only its
   node state and direct-child inflows and may set only its own $a_i$; the plant
   receives root, equalization, and plant fields and may set only $(a_e,a_p)$.
   Cross-boundary packets are replaced by timestamped missing flags. At every
   five-minute step, each node enumerates $a_i\in\{0,0.5,1\}$ and minimizes its
   one-step predicted local overflow, then terminal local storage, then simulated
   pump kWh, with action hash last. The plant similarly enumerates
   $(a_e,a_p)$ and minimizes one-step plant bypass plus equalization overflow,
   then terminal equalization storage, then kWh, with action hash last. These are
   the exact diagnostic local fallback actions; actuator sets and cadence remain
   unchanged and every protected outcome is still scored.
2. For every original storm, run cells `rain-upstream` and `rain-downstream`.
   Let graph depth be edge count to the plant and rank nodes by `(depth,node
   hash)`. The upstream target is the highest-depth quartile and downstream the
   lowest-depth quartile, with quartile size $\lceil N/4\rceil$. Preserve each
   storm's time, duration, hyetograph, and total area-integrated rainfall volume.
   At each hyetograph step compute $J=\sum_iA_iI_i$, set non-target intensity to
   zero, and set every target intensity to
   $J/(\sum_{i\in target}A_i)$; target rainfall volume is therefore proportional
   to area and sums exactly to the original. Stocks, dry flow, capacities, and
   all later forcing remain unchanged.
3. In cell `communications-off`, drop every remote packet and remote action for
   the complete 150 d horizon. Each subsystem executes the exact local safe
   action from item 1; no action is retried centrally, and all storage, overflow,
   load, service, and electricity rows retain the canonical terminal treatment.

### ENV-T04 interventions

1. In cell `provenance-masked`, replace calibration record type/version,
   maintenance request/completion version, typed transition, and success bit by
   timestamped missing fields before delivery to A/B/C. Preserve all 18 value
   channels, physical calibration/repair transitions, action set, and costs.
2. In cell `forced-equivalence`, force the canonical Bernoulli equivalence flag
   to one and replace the lowest-onset ordinary event by exactly the six-hour
   construction already frozen in the DGP. Run cells
   `forced-equivalence-process` and `forced-equivalence-fault` with the same process step,
   noise, $r(t)$, packets, and pre-intervention controls; score the declared
   two-member label before any maintenance breaks equivalence.
3. In cell `completion-status-masked`, deliver calibration samples normally but
   replace every maintenance completion's typed transition and versioned status
   bit with a timestamped missing field. Physical repair, possible false success,
   request delay, actions, alarms, and primary/protected scoring are unchanged.

### ENV-T05 interventions

1. In cell `c-history-reset-day90`, at the opening of day 90 reset only C's
   estimator/controller memory and covariance to its day-0 prior while retaining
   the true $(R_c,R_i,d)$, current TMP, flux, feed, completed actions, and all B
   state. No observation is inserted or deleted.
2. Run cells `c-no-rc` and `c-no-ri`. In C's prediction model only, set the named
   resistance state and its transition coefficient to zero; truth, B, measured
   TMP, action set, parameter/tuning count, and compute cap remain unchanged.
3. Run cells `mask-backwash`, `mask-chemical-clean`, and `mask-replacement`.
   Remove exactly that action before C optimizes; all other actions, including
   zero flux as safe shutdown, remain available. A request for a masked action is
   malformed and receives the canonical terminal loss rather than a retry.

### ENV-T06 interventions

1. In cell `c-independent-isotherms`, replace only C's equilibrium denominator
   for solute $j$ by $1+b_jC_j$; retain each $q_{max,j},b_j,k_{LDF,j}$, batch and
   column calibration record, DOM/solute forcing, truth competition, and budget.
2. In cell `c-zero-dispersion`, set $D_{ax}=0$ only in C's prediction model and
   remove the diffusive flux/CFL term there; keep the canonical upwind advective
   flux, truth solver, grid, capacity, and all observations unchanged.
3. Run cells `mask-extra-assay`, `mask-regenerate`, and `mask-replace`, removing
   exactly the named action before C optimizes. Scheduled panels, assay latency,
   isolate/zero-discharge fallback, disposal, every regeneration release, media,
   and lost service retain canonical logging and terminal scoring.

### ENV-T07 interventions

1. Run cells `buffer20-shock4` and `buffer200-shock4`: overwrite
   $B_{in}$ and the burn-in initial $B$ with 20 or 200 meq/L and overwrite the
   first scheduled feed-shock multiplier with 4. Preserve its onset/duration,
   all other forcing, and recompute the canonical burn-in; nonconvergence is a
   retained generator failure.
2. In cell `c-no-vfa-alkalinity`, replace every alkalinity and returned VFA
   packet delivered to C by a timestamped missing interval. VFA requests remain
   allowed and charged, pH/gas/feed packets and delays are unchanged, and C uses
   the canonical conservative feed fallback whenever its state interval is not
   inside both limits.
3. Run the nine-cell Cartesian product `delay-{0,6,12}-buffer-{20,110,200}` by
   overwriting the seed-frozen sensor delay with 0, 6, or 12 h and $B_{in}$ plus
   burn-in initial $B$ with 20, 110, or 200 meq/L. Recompute burn-in; retain the
   canonical VFA-assay delay, fallback, unsafe-action rule, lost-feed term, and
   full 300 d terminal score.

### ENV-T08 interventions

1. Run cells `mask-target`, `mask-nontarget`, and `mask-effects`. Replace every
   reading in the named panel by its timestamped missing interval for C only;
   TOC is retained in all three cells, requested assays remain charged, and truth,
   B, decision deadlines, answer coverage, and unresolved rules are unchanged.
2. Select the lowest-hash root having an outgoing reaction and let its influent
   amount be $n_0$ mol/L with formula $(C,H,N,O,X)$. Before intervention, solve
   that root forest separately under the canonical linear kinetics and subtract
   its complete terminal contribution—root, every descendant, CO$_2$, H$_2$O,
   oxidant, post-treatment, media, and inorganic rows—from the episode aggregate;
   contributions from every other root remain unchanged. In each of cells
   `removed-mineralized`, `removed-daughters`, and `removed-unidentified`, add
   $0.1n_0$ mol/L back to the selected root and route $0.9n_0$ as follows:

   - `removed-mineralized` adds, per reacted root mole, $C$ CO$_2$,
     $H/2$ H$_2$O, $N$ nitrate, and $X$ halide moles. It consumes
     $\max(2C+H/2+3N-O,0)$ oxidant-O atoms and, when root oxygen is in excess,
     emits $(O-2C-H/2-3N)/2$ O$_2$; every term has an explicit ledger row.
   - `removed-daughters` executes the selected root's frozen outgoing reaction
     exactly once at unit stoichiometric extent per reacted mole, adding all
     one-to-three ordered children and its frozen CO$_2$/H$_2$O co-products and
     oxidant-O consumption. No child undergoes a further reaction.
   - `removed-unidentified` adds one unidentified row carrying $0.9n_0$ mol/L
     of the unchanged root formula and no species-specific safety credit.

   Recompute post-treatment, formula-mass concentrations, TOC, assays, effects,
   attributable-carbon status, and decisions from the replaced aggregate. Exact
   C/H/N/O/X equality is mandatory; a missing root-attribution ledger or any
   negative residual is a retained diagnostic failure, never a compensating draw.
3. Run the nine-cell Cartesian product
   `latency-{half,one,double}-post-{absent,biological,sorptive}`. Multiply every
   fixed assay latency by 0.5, 1, or 2 and override post-treatment type as named.
   Biological/sorptive cells use the product's already generated pre-branch
   $k_{post}$ draw (before the absent branch sets it to zero) and sorptive cells
   use the canonical capacity draw; retain age, assay/material units,
   media ledger, answer-coverage floor, false-safe constraint, element closure,
   and unresolved-decision rule.

### ENV-T09 interventions

1. Run selection-model cells `omit-substitution`, `omit-demand-response`, and
   `omit-direct-emissions`. C sets respectively all avoided-product credits to
   zero, every elasticity to zero, or $G_{direct}$ to zero in its selection model
   only. Evaluator truth retains the complete canonical ledger, functional unit,
   feasibility constraints, and selected alternative's realized service.
2. In cells `grid-quarter-elasticity-neg`, `grid-one-elasticity-zero`, and
   `grid-four-elasticity-pos`, choose the lowest-hash non-baseline alternative,
   set its treatment electricity intensity to exactly $0.8e_0$, multiply the
   complete grid-intensity path by 0.25, 1, or 4, and overwrite its elasticity
   with -0.4, 0, or 0.4 respectively. Clip demand by the canonical equation and
   recompute all service, cost, substitution, replacement, and GHG rows.
3. Run cells `uptake-zero`, `uptake-dynamic`, `uptake-one`, and
   `direct-interval-missing`. The first three overwrite actual uptake $u_{a,t}$
   for every alternative with 0, the canonical dynamic path, or 1 while keeping
   recovered physical mass fixed. The last withholds the required direct-
   emission-factor interval from all deployable arms but retains evaluator truth;
   every arm must return unresolved and cannot declare net benefit.

### ENV-T10 interventions

For items 2 and 4, select $z^*$ once as the lowest-index design-feasible catalogue
index in 2--32 under B's 16 design scenarios and pair it with the frozen C
operating policy. Every cell runs that `(modified z*, C policy)` pair on the
same 16 design and 64 evaluator scenarios, ordinary 30 y ledger, and 90 d paired
event windows, then applies the canonical feasibility, $C_z/S_z$, terminal-loss,
protected, and resource calculations. Its result key appends
`tuple-{two-digit-index}|policy-c`. If no such $z^*$ exists, every item-2/4 cell
emits one retained `no-eligible-base` row for that seed and no substitute tuple.
Item 3 uses the same unmodified $(z^*,C)$ pair when it exists but is the
explicitly single-scenario descriptive diagnostic defined there; it neither
changes nor augments the fixed 16/64 sets and does not compute aggregate
$C_z/S_z$ or a promotion statistic.

1. Cell `catalogue-all` evaluates all 33 frozen tuples under each of the three
   frozen A/B/C policies on the same 16 design and 64 evaluator scenarios,
   including infeasible tuples with their canonical terminal score. It adds no
   tuple, redraw, or favorable filter. Each row is keyed
   `catalogue-all|tuple-{00..32}|policy-{a|b|c}` and is scored only under that
   named policy.
2. For the section-wide $(z^*,C)$ pair, run cells `routing-assigned`, `routing-shared`,
   `fallback-next`, `monitor-next`, `storage-next`, `backup-next`, `spares-next`,
   and `shifts-next`. Routing cells force the named existing policy choice. Each
   `next` cell changes only that field to the next value in its canonical ordered
   support, wrapping the maximum to the minimum: fallback
   $\{0,0.25,0.5,1\}$, monitoring $\{0.25,0.5,1\}$, per-plant storage
   $\{0,6,12,24,48\}$ h, backup $\{0,0.5,1\}$, spares $\{0,1,2\}$, or shifts
   $\{1,2,3\}$. `storage-next` advances every opened plant's own duration once;
   all other `next` cells advance the tuple's single named field. Rebuild affected
   physical capacity/cost/material rows, rerun all
   static and numerical gates, and retain an infeasible result rather than
   selecting another tuple.
3. For the unmodified $(z^*,C)$ pair and each hazard type in the ordered list
   `equipment`, `flood`, `grid power`,
   `communications`, `consumable`, and `road/operator access`, the corresponding
   cell `hazard-equipment`, `hazard-flood`, `hazard-grid-power`,
   `hazard-communications`, `hazard-consumable`, or `hazard-road-access` uses the
   first canonical design-scenario hash of that type; if the 16 scenarios contain
   none, generate exactly one auxiliary row with the ordinary ENV-T10 type-
   conditional DGP and intervention substream. The selected or auxiliary row is
   cloned into event and no-hazard copies from identical ordinary lifecycle,
   storage, and chemical state for one 90 d window. Record its
   $(\Delta C,\Delta S,N,H,A,R)$, flood release, work, energy, closure, terminal
   status, and protected endpoints in their canonical units under key
   `hazard-{type}|tuple-{two-digit-index}|policy-c`. It is descriptive only, is
   never inserted into the 16 design or 64 evaluator rows, and cannot promote or
   reject ENV-T10. If $z^*$ is absent, each hazard cell instead receives one
   retained `no-eligible-base` row.
4. For the section-wide $(z^*,C)$ pair, run cells `remote-packets-missing` and
   `fallback-zero`. The first drops all
   remote packets and therefore invokes the already frozen communications-loss
   local rule. The second sets every local-fallback source capacity to zero,
   removes its source/action from max-flow, and lets storage, assigned/shared
   installed paths, safe source closure, unserved demand, and the finite terminal
   score operate unchanged. Neither cell deletes fallback capital/material already
   installed in the base tuple or grants a replacement action.

A diagnostic that changes observations, authority, or resources without
charging the change is invalid. An ablation can explain a failure or boundary;
it cannot rescue a failed primary comparison after reveal.

## Analysis and statistical plan

### Frozen analysis sequence

1. Validate source hashes, ENV-v2 generator version, PRNG streams, world
   manifests, partition disjointness, units, equations, event ordering, and
   observation/action schemas.
2. Run the eight-seed development shakedown and resource projection. A
   resolution change requires a new development-only manifest and full refreeze.
3. Freeze nuisance choices, safe fallbacks, local terminal losses, protected
   endpoints, the selected C novelty route, and the development-only power and
   contamination report.
4. Seal code, configuration, solver, analysis, thresholds, and artifact schemas
   before confirmation keys are released.
5. Run all 128 confirmation seeds for A/B/C. Retain every terminal state and
   apply the local finite failure score; do not replace a failed world.
6. Compute B:A and C:B shifted paired seed contrasts exactly as declared above.
   A resource track also computes its named resource contrast and primary-loss
   non-inferiority contrast.
7. Apply the joint centred seed-cluster bootstrap-t, simultaneous upper bounds,
   separate Holm families, zero-variance rules, and symmetry sensitivity exactly
   as frozen in the common contract.
8. Evaluate every protected endpoint, closure gate, coverage/service floor, and
   hard structural failure before interpreting a favorable scalar contrast.
9. Run the 64 sealed transfer seeds with half the registered improvement and,
   on a resource route, half the primary-loss non-inferiority margin. Do not tune.
10. Publish the complete seed and terminal tables, losses, resources, protected
    endpoints, intervals, raw/adjusted p-values, sensitivity, transfer outcomes,
    and failure log.

The inferential unit is the seed. For fractional B improvement $r$, the
estimand is the mean of

$$
D^{B:A}_s=L_{B,s}-(1-r)L_{A,s},
$$

and C:B is analogous. For selected resource $R$ and reduction $r_R$,

$$
D^{R,C:B}_s=R_{C,s}-(1-r_R)R_{B,s}.
$$

The resource route additionally requires

$$
D^{NI,C:B}_s=L_{C,s}-L_{B,s}-0.01L^{max}_s,
$$

with the transfer margin halved. Comparator-zero handling, strict boundaries,
the deterministic sign-vector seed, plus-one Monte Carlo sensitivity p-value,
exact enumeration only for at most 20 seeds, and development-only power and
contamination checks are controlling as written in the canonical common block.

Secondary and ablation endpoints are descriptive unless a local protocol
explicitly protects them. No favorable denominator, pooled ratio, post-hoc
subgroup, censoring rule, or resource route may be selected after confirmation.

## Promotion, rejection, and kill rules

### Promotion requirements

A protocol can support its linked claim only when all of the following hold:

1. B clears its B:A practical-effect boundary with adjusted one-sided
   $p\le0.01$ and simultaneous 99% upper bound strictly below zero.
2. C clears its preregistered loss or resource route against B. A resource route
   also clears the simultaneous primary-loss non-inferiority bound.
3. Every local protected gate, conservation ledger, dimensional check,
   coverage/service constraint, answer/action coverage rule, and terminal
   reconciliation passes.
4. Both sealed transfer requirements pass without retuning.
5. The mature null was executed as specified and C received no oracle field,
   extra observation, assay, actuator, capacity, maintenance, fallback, compute,
   or hidden retry.
6. All scheduled seeds and failures are published and claims remain bounded to
   the tested DGP and functional unit.
7. A compute-energy statement is absent unless workstation joules were measured
   under a separately frozen calibrated boundary.

ENV-T08 can update only existing C-1285. It cannot create a duplicate claim or
principle. No single protocol promotes a universal pruning, modularity,
centralization, treatment, safety, efficiency, rebound, or energy constant.

### Protocol rejection gates

Reject the protocol result for any of the following:

- unit mismatch, non-finite primary, undeclared denominator, unbounded required
  interval, or unresolved dimensional inconsistency;
- broken water, pollutant, element, nitrogen, COD, biomass, volume, storage,
  chemical, media, service, cost, or lifecycle closure outside local tolerance;
- oracle leakage, confirmation/transfer tuning, result-dependent baseline
  replacement, seed deletion, pseudo-replication, or omitted failure;
- hidden bypass, storage, daughter, regeneration release, overflow, shutdown,
  repair queue, procurement delay, flood release, zero-feed loss, or terminal
  inventory;
- free assays, chemicals, media, spare units, maintenance, operators, storage,
  backup power, network capacity, or safe abstention;
- substitution of a weak heuristic for the declared strongest mature null;
- a weighted score averaging away flooding, quality, toxicity, legal
  eligibility, service, or maintenance constraints;
- simulated process electricity presented as measured workstation energy; or
- normative EU/German text presented as empirical mechanism evidence.

More than 5% solver/numerical failure on confirmation makes the track
infeasible. A hard protected failure rejects it regardless of mean loss.

### Kill and abstention rules

Parity with B kills novelty. Equality at a strict improvement boundary kills
promotion. A post-hoc switch between loss and resource routes kills novelty.
Failure of either transfer kills generalization beyond confirmation. A
case-specific parameter cannot become an AI constant.

An interval crossing a declared safety or compliance boundary forces the local
safe fallback or unresolved decision. Abstention remains a decision with its
declared nonzero compute, delay, material, service, assay, and coverage cost.
Always abstaining, permanent zero feed, shutdown, zero service, and early
termination cannot win by shrinking a denominator.

### No-results authority

This fixture contains specifications and future artifact names only. No
ENV-T01 through ENV-T10 runner has been implemented or executed. No primary,
protected, transfer, resource, energy, environmental-benefit, or compliance
result exists.

## Implementation and artifact boundary

This Markdown fixture creates no runtime or result artifact. It creates no
runner, package, executable manifest, dataset, assay output, simulation output,
benchmark result, figure, or energy record; repository-ledger and index edits
needed to register the fixture are separate documentation integration.

A future implementation must produce the exact protocol-local artifacts named
above. At minimum, every track must additionally emit:

1. a canonical generator/world hash record and frozen configuration;
2. a seed/partition ledger proving disjoint development, confirmation, and
   transfer streams;
3. a unit/schema registry and dimensional-validation report;
4. a complete seed-by-arm terminal-status table with finite failure assignments;
5. observation, action, fallback, abstention, maintenance, and resource ledgers;
6. conservation/closure checks in every locally required constituent and unit;
7. primary/protected/resource contrasts, resample hashes, multiplicity output,
   sensitivity output, and transfer tables; and
8. CPU/wall/RSS/I/O/artifact accounting, with workstation energy explicitly
   marked not measured unless a separate calibrated boundary exists.

Implementation must preserve event ordering, state transitions, tie rules,
assay panels, facility/lifecycle transitions, supported HRT/RTD regimes,
adaptive substeps, finite action sets, scalar-loss formulas, terminal scores,
ordinary/event counterfactuals, and service/resource gates. A concise runner is
acceptable only if these contracts remain machine-verifiable; a different DGP
or looser boundary is a new fixture version, not an implementation detail.

## Harness status

Blocked by: not-built.

The Canonical common ENV-v2 contract section fixes a deterministic JavaScript runtime, the PCG64-DXSM generator and binary64 reference solvers, so a harness can be built on the workstation as specified; no generator, runner or tests exist yet.
