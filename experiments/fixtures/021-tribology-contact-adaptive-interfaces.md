# Fixture F-021 — Tribology and adaptive contact interfaces

- **Status:** complete pre-implementation CPU-only experiment contract
- **Direct claims:** [C-1497](../../research/claims.md#c-1497)–[C-1505](../../research/claims.md#c-1505)
- **Source audit:** [tribology and adaptive contact interfaces](../../research/audits/2026-08-25-tribology-contact-adaptive-interfaces.md)
- **Audit snapshot:** SHA-256 `F66A24DA78474FA06EA4257F36650E90D64192F3B1A515575FFDA1A145CB0798`
- **Protocol IDs:** `TAI-T01`–`TAI-T09`
- **Execution state:** no runner, reference-workstation manifest, generated data, or result exists
- **Registry disposition:** no new P-series principle, architecture candidate, or claimed effect

This fixture preserves the reviewed audit's complete common contract and nine
protocol specifications as one reciprocal claim-to-test artifact. Tribology,
materials, machine, and lifecycle vocabulary remains source-qualified; every
synthetic coefficient is a generator setting rather than a safe machine limit,
material specification, measured improvement, legal threshold, or conformity
claim.

| Protocol | Direct claim | Registered question |
| --- | --- | --- |
| TAI-T01 | [C-1497](../../research/claims.md#c-1497) | State-qualified interface cost |
| TAI-T02 | [C-1498](../../research/claims.md#c-1498) | Nominal versus real contact support |
| TAI-T03 | [C-1499](../../research/claims.md#c-1499) | Lubrication-regime mission control |
| TAI-T04 | [C-1500](../../research/claims.md#c-1500) | Endpoint-matched wear paths |
| TAI-T05 | [C-1501](../../research/claims.md#c-1501) | Rate/state stick--slip boundary |
| TAI-T06 | [C-1502](../../research/claims.md#c-1502) | Third-body inventory and sign change |
| TAI-T07 | [C-1503](../../research/claims.md#c-1503) | Surface-texture operating envelope |
| TAI-T08 | [C-1504](../../research/claims.md#c-1504) | Adaptive/self-lubricating interface mission |
| TAI-T09 | [C-1505](../../research/claims.md#c-1505) | Coupon-to-mission lifecycle transfer |

## Question and hypotheses

The nine registered protocol questions and their measurable predictions are
falsification targets, not expected findings.

## Systems, scenarios, and tasks

Each track defines its synthetic generator, observations, actions, state,
development/confirmation/transfer support, solver, and retained artifacts.

## Arms, baselines, and strongest nulls

A is the tempting collapsed rule, B the strongest named mature mechanics,
estimation, optimisation, control, or lifecycle null, C the existing-principle
composition, and O an evaluator-only oracle where declared.

## Matched budgets and equal information

A/B/C share observable fields, authority, timing, seed packs, tuning budget,
CPU-thread cap, failure handling, and stopping rules. Track-specific resource,
service, wear, damage, inventory, and lifecycle accounting remains explicit.

## Measurements and units

Every protocol declares its inference unit, native units, finite seed loss,
protected raw outputs, resource endpoints, uncertainty rule, and artifact
schema. Workstation energy remains unmeasured.

## Required ablations and interventions

The control families, confirmation boundaries, transfer changes, fallback
paths, oracle-leakage checks, and kill rules below are the frozen
interventions. Any change requires a new version and fresh sealed packs.

## Analysis and statistical plan

The common paired seed-cluster bootstrap-t procedure, Holm families, confidence
bounds, non-inferiority margins, resource ratios, invalidity conditions, and
absolute gates below are the complete prospective analysis plan.

## Promotion, rejection, and kill rules

No track can promote a mechanism unless every registered boundary, novelty,
resource, safety, closure, support, and transfer gate passes. A failed,
over-budget, leaking, non-converged, or incomplete seed remains in the
denominator under its declared terminal loss.

### No-results authority

This document contains no execution output. It cannot establish a tribological,
material, mechanical, AI-performance, workstation-energy, environmental,
legal-compliance, conformity, or deployment result.

## Common CPU-only falsification contract

Every numerical value below is a synthetic generator setting, numerical
tolerance, minimum detectable project effect, or compute cap. None is a safe
machine limit, material specification, physiological range, legal threshold,
or observed improvement.

1. **Runtime and determinism:** implement in TypeScript/JavaScript under the
   repository-pinned Node.js runtime. Use PCG64-DXSM, binary64 reference
   arithmetic, canonical little-endian serialization, SHA-256 world manifests,
   no network at run time, and stable-hash tie breaking. For every literal seed
   string $x$, hash its UTF-8 bytes once. Interpret digest bytes 0--15 as an
   unsigned little-endian 128-bit initial state $s$ and bytes 16--31 as an
   unsigned little-endian 128-bit stream selector $r$. Initialize PCG with
   state zero and odd increment $(2r+1)\bmod2^{128}$, advance once, add $s$
   modulo $2^{128}$, and advance once again. A uniform binary64 uses the top 53
   output bits divided by $2^{53}$; an integer uses rejection sampling on an
   unsigned 64-bit output, never modulo reduction. Parallel reductions sort by
   canonical world ID. `U(a,b)` is continuous uniform,
   $U_{\mathbb Z}\{a,b\}$ is inclusive discrete uniform, `logU(a,b)` is
   log-uniform, and $N(\mu,\sigma^2)$ is Gaussian. Unless dependence is stated,
   draws are independent. A sample quantile $Q_p(x_1,\ldots,x_n)$ is order
   statistic $x_{(\max[1,\lceil pn\rceil])}$ after ascending stable sort; no
   interpolation is permitted. Systematic resampling draws
   $u_0\sim U(0,1/N)$ and uses thresholds $u_0+j/N$, $j=0,\ldots,N-1$.
2. **Seed packs:** track $k\in\{1,\ldots,9\}$ uses public development seeds
   `1497000 + 10000*k + j`, $j=1,\ldots,64$. A registrar creates 128 private
   64-bit confirmation seeds and 64 disjoint private transfer seeds per track,
   publishes SHA-256 commitments before implementation freeze, and reveals a
   pack only after code/config/artifact-schema hashes are frozen. There is no
   public derivation of private seeds.
3. **Inference unit:** one seed is one inferential cluster. Interfaces,
   asperities, contacts, timesteps, paths, regimes, textures, coupons, and
   queries inside a seed are repeated observations and cannot increase $n$.
4. **Generation and solver failures:** draw fields in written order. Any
   rejection sampler or solver has the stated iteration cap. Exhaustion,
   divergence, NaN/Inf, hash mismatch, missing artifact, or deadline overrun is
   retained as a failed seed with $L_{s,a}=L_{max}=100$ for the affected arm;
   it cannot be deleted, replaced, or converted to abstention unless a track
   explicitly defines pre-output numerical abstention for all arms.
5. **Arms:** A is the tempting collapsed rule. B is the strongest named mature
   mechanics, estimation, optimisation, control, or lifecycle null. C is the
   relevant composition of existing project principles/candidates. O is an
   evaluator-only oracle. A/B/C receive identical observable fields, action
   authority, timing, seeds, tuning budget, CPU-thread cap, and stopping rules.
   Hidden generator state and future observations remain evaluator-only. Every
   arm below is a frozen algorithm, not a model-family placeholder: its feature
   vector, initialization, update order, optimizer/estimator, uncertainty rule,
   action rule, abstention/fallback rule, tie rule, and retained state are part
   of the manifest. Any unlisted branch is an implementation error.
6. **Tuning:** development alone selects nuisance parameters, model families,
   thresholds, and resource settings. Confirmation/transfer perform no model
   search, threshold repair, code change, seed deletion, altered denominator,
   or changed stopping rule. A correction requires a new version and fresh
   sealed packs.
7. **Raw records before scalarisation:** every arm writes service, error,
   force/work, damage/wear, material or mediator inventory, latency,
   instability/violation events, CPU-seconds, peak RSS, bytes read/written, and
   artifact bytes in their native units. A track's scalar seed loss uses only
   its frozen formula and development normalization constants; raw protected
   outcomes cannot be averaged away.
8. **Boundary inference:** track $k$ registers a positive effect margin
   $\delta_k$ in seed-loss units and

   $$
   \Delta_{k,s}=L_{k,s,B}-L_{k,s,A}.
   $$

   Test $H_{0,k}:E[\Delta_k]\ge-\delta_k$ against
   $H_{1,k}:E[\Delta_k]<-\delta_k$. Put
   $Z_{k,s}=\Delta_{k,s}+\delta_k$ and compute
   $T_{k,obs}=\bar Z_k/(s_{Z,k}/\sqrt n)$. Centre residuals
   $e_{k,s}=Z_{k,s}-\bar Z_k$. Use exactly 100,000 joint cluster-bootstrap
   index vectors, shared across all nine tracks, from PCG64-DXSM seed
   `SHA256("TAI-v1|confirmation|joint-bootstrap-t")`. For each vector, compute
   $T^*_{k,b}=\bar e^*_{k,b}/(s^*_{k,b}/\sqrt n)$. If a standard error is zero,
   assign $T=-\infty,0,+\infty$ according to the numerator sign. The lower-tail
   raw value is

   $$
   p_k=\frac{1+\#\{b:T^*_{k,b}\le T_{k,obs}\}}{100001}.
   $$

   Holm controls familywise $\alpha=0.01$ across the nine A--B tests. Let
   $q_{.01,k}$ be the empirical first percentile of $T^*_{k,b}$ and
   $SE_{\Delta,k}=s_{\Delta,k}/\sqrt n$. The one-sided 99% upper confidence
   bound is

   $$
   U^{99}_{\Delta,k}=\bar\Delta_k-q_{.01,k}SE_{\Delta,k}.
   $$

   Boundary confirmation requires the Holm-adjusted rejection and
   $U^{99}_{\Delta,k}\le-\delta_k$, plus every absolute track gate. Report the
   paired seed distribution and a two-sided 99% percentile interval as
   descriptive sensitivity, not as a replacement gate.
9. **Novelty inference:** C first must be non-inferior to B. For each seed,
   reduce repeated observations to the protocol-declared seed statistic before
   inference; when a protocol says "median CPU/bytes/calls", it means the median
   within that seed. Put $D^L_s=L_{s,C}-L_{s,B}$ and use the same 100,000-vector
   paired cluster-bootstrap-t construction as item 8 to form its one-sided 99%
   upper bound. Track $k$ freezes $\epsilon_k\ge0$ and requires
   $U^{99}_{D^L,k}\le\epsilon_k$. Every lower-is-better positive resource axis
   with required fractional reduction $r$ uses

   $$
   R_s=\ln\frac{M_{s,C}+c_M}{M_{s,B}+c_M},\qquad
   U^{99}_R\le\ln(1-r),
   $$

   where $c_M=1$ for integer counts and bytes and $c_M=10^{-12}$ expressed in
   the metric's declared native unit otherwise. A rate or probability axis uses
   paired difference $D_s=M_{s,C}-M_{s,B}$. Unless a protocol states another
   value, wording "no worsening" means a positive non-inferiority margin of
   0.001 in raw probability/rate units, or 0.01 after division of a continuous
   metric by its positive development-frozen scale; its upper bound must not
   exceed that margin. If a protocol does not name that continuous scale, use
   the RMS of B's development seed statistics, floored at $10^{-12}$ in the
   metric's native unit. A zero-margin axis must be called **strict improvement**,
   not no worsening, and requires an upper bound at most zero. Holm at familywise
   $\alpha=0.01$ covers, within a track, the loss non-inferiority test and every
   declared superiority or no-worsening axis; all must reject their respective
   nulls and satisfy their effect-size bounds. The empirical bootstrap
   quantiles use item 1's order-statistic rule. Choosing an axis after
   confirmation or using a resource saved only because C failed is prohibited.
10. **Protected gates:** oracle leakage, confirmation tuning, changed units,
    uncommitted seeds, hidden failures, negative mass/inventory beyond stated
    tolerance, balance violation, unsafe/forbidden synthetic action, or an
    undeclared denominator fails the track regardless of mean loss. Synthetic
    estimator error rates have their stated statistical gates; no numerical
    allowance authorises real action.
11. **Prospective reference-workstation and timing contract:** before the first
    development timing run, freeze and hash `reference-workstation.json` with
    physical CPU vendor/model/stepping/microcode, four assigned physical-core
    IDs, SMT status, RAM, storage device/firmware/filesystem, OS build, Node
    binary hash/version, BIOS/power plan, and repository commit. Confirmation
    may run only on that exact manifest. Use AC power, fixed performance power
    plan, exactly those four physical cores with their SMT siblings excluded,
    `UV_THREADPOOL_SIZE=4`, normal process priority, no network, no child
    processes, and no more than four worker threads. A 60 s pre-run observation
    must show at most 5% mean non-runner CPU load on the assigned cores or the
    attempt is invalid before the target timer starts.

    Run every $(track,seed,arm)$ in a fresh Node process with `--expose-gc`.
    First execute one excluded full-arm warm-up using that track's first public
    development seed, discard its outputs, await all I/O, call `global.gc()`
    once, and then execute the target seed. Measure monotonic wall time with
    `process.hrtime.bigint()` and CPU with `process.cpuUsage()`. Start both
    immediately before target-seed world generation; stop only after all arm
    artifacts are compressed, closed, and `fsync` has completed in a new local-
    storage output directory. Thus generation, arm computation, compression,
    and output I/O are included; process launch, code/config loading, the
    excluded warm-up, and post-run hashing are excluded. Do not flush filesystem
    caches. Record bytes read/written and take peak RSS as the larger of the OS
    job-object peak and 10 ms `process.memoryUsage().rss` samples. Arm launch
    order is the stable-hash permutation of A/B/C for that seed.

    All tracks are CPU-only, use at most 8 GiB peak RSS, 2 GiB retained artifacts
    per track, and 60 s timed wall per arm/seed unless a protocol states a lower
    cap. Exceeding a cap is a retained failed seed. These are prospective gates:
    this audit contains no workstation manifest or timing result. No GPU result
    may substitute for this contract.
12. **Transfer:** the 64-seed transfer pack changes the named support in each
    protocol. Transfer repeats frozen inference descriptively and must pass all
    absolute gates and the same effect direction. It cannot rescue failed
    confirmation.

## CPU-executable protocols

### TAI-T01 -- State-qualified interface cost

- **Claim:** `C-1497`.
- **Question:** when does a typed, recent interface state predict friction work
  and route cost better than one scalar coefficient, and can a compact state
  match a full-history model?
- **Primary unit and units:** one interface trace; normal force [N],
  speed [m/s], temperature [K], relative humidity [1], tangential force [N],
  displacement [m], friction work [J]. Set mission horizon $H=96$ for
  development/confirmation and $H=192$ for transfer.
- **Generator:** each seed creates 256 worlds, each containing eight interfaces
  and $H$ one-second steps. Draw one world-level $T,RH$ trace shared by the eight
  interfaces. For interface $i$, draw
  $\mu_{0,i}\sim U(0.08,0.35)$, $v_{0,i}=0.05$ m/s,
  $a_v\sim U(-0.025,0.025)$, $a_T\sim U(-8,8)10^{-4}$ K$^{-1}$,
  $a_h\sim U(-0.08,0.08)$, $a_W\sim U(-0.02,0.02)$, and
  $a_q\sim U(0.02,0.18)$. At ordinary steps draw interface-specific commanded
  $W_N\sim\operatorname{logU}(20,2000)$ N and
  $|v|\sim\operatorname{logU}(10^{-3},1)$ m/s. Temperature $T$ and relative
  humidity $RH$ follow
  $T_{t+1}=300+0.96(T_t-300)+\epsilon^T_t$ and
  $RH_{t+1}=0.5+0.94(RH_t-0.5)+\epsilon^{RH}_t$, with
  $T_0=300$ K, $RH_0=0.5$, independent
  $\epsilon^T\sim N(0,2^2)$ K and
  $\epsilon^{RH}\sim N(0,0.03^2)$. Values are repeatedly mirror-reflected at
  supports 280--360 K and 0.02--0.98. State evolves as

  $$
  q_{t+1}=0.92q_t+0.08\tanh\!\left(2\ln\frac{|v_t|+10^{-6}}{v_0}\right)
  +0.04\mathbf1[|v_t|<0.005]-0.03\mathbf1[T_t>330]+\xi_t,
  $$

  where $q_0=0$, $\xi_t\sim N(0,0.01^2)$, clipped to $[-1,1]$. The oracle
  coefficient is

  $$
  \mu^*_{t}=\operatorname{clip}_{[0.02,1.2]}
  \left(\mu_0+a_v\ln\frac{|v_t|+10^{-6}}{v_0}
  +a_T(T_t-300)+a_h(RH_t-0.5)
  +a_W\ln\frac{W_{N,t}}{200}+a_qq_t+c_t\right).
  $$

  Measurement noise is $N(0,(0.01W_N\mu^*)^2)$ on tangential force,
  $N(0,(0.005W_N)^2)$ on normal force, 0.5 K on temperature, and 0.01 on
  humidity. Four equal world families are frozen: scalar-sufficient (all
  slopes/state/change terms zero), exogenous covariates ($a_q=c_t=0$),
  path-state (full equation, $c_t=0$), and contamination/recovery, where one
  change at $t_c\sim U_{\mathbb Z}\{32,64\}$ adds
  $c_t=c_0\exp[-(t-t_c)/\tau]$, $c_0\sim U(0.04,0.20)$,
  $\tau\sim U(8,40)$ s. A 16-step warm-up is exposed; steps 17--$H$ are scored.
  At route times $t\in\{24,32,\ldots,H\}$, draw one new $W_N,v$ pair from the
  same marginals and apply that pair and the current common $T,RH$ to all eight
  interfaces; no interface-specific command is drawn at that time. Each arm
  predicts before the force measurement and before the stated $q_{t+1}$ update.
  The eight interfaces form the route set with one unit of accepted work;
  choosing route $i$ incurs its oracle friction work
  $E_{f,i}=\mu_i^*W_N|v|$ J.
- **Observations:** current commanded variables, noisy measurements through
  $t-1$, interface/material IDs, and operator version. The current/future
  tangential force, $q$, coefficients, family, and $c_t$ are evaluator-only.
- **Frozen arms and intervals:** define
  $y_t=F^{obs}_{t}/\max(W^{obs}_{N,t},10^{-9}\,\mathrm N)$. A stores
  $\hat\mu_A=\operatorname{median}_{t\le16}|y_t|$, predicts
  $\hat E_f=\operatorname{clip}_{[0.02,1.2]}(\hat\mu_A)W_N|v|$, and selects the
  smallest-hash route attaining the minimum prediction. B retains every causal
  record and, before each prediction, fits an unpenalized-intercept ridge model
  with penalty $10^{-3}$ to $y_{1:t-1}$ using the feature vector

  $$
  x_t=[1,\ln((|v_t|+10^{-6})/v_0),T_t-300,RH_t-0.5,
  \ln(W_{N,t}/200),\hat q_t,r_t],
  $$

  where non-intercept columns are divided by development-frozen positive SDs,
  $\hat q$ follows the written state equation with $\xi=0$, and
  $r_t=0.9r_{t-1}+0.1(y_{t-1}-\hat y_{t-1})$, $r_{16}=0$. The normal equations
  are solved by pivoted QR; rank failure is a failed arm. B clips $\hat y$ to
  $[0.02,1.2]$ and selects the minimum predicted route. C uses one global ridge
  coefficient vector fitted once on development records with feature vector
  $[x_t,a_t/H]$, then frozen. Its only adaptive scalars are
  $(\hat q,r,r_{scale},a)$, initialized to $(0,0,s_{dev},0)$, where
  $s_{dev}>0$ is the RMS causal residual of the frozen development global map, with
  $r_{scale,t}^2=0.9r_{scale,t-1}^2+0.1(y_{t-1}-\hat y_{t-1})^2$ and age $a$
  incremented to $H$. C is in support only when every current standardized
  covariate is within its development $Q_{.005}$--$Q_{.995}$ limits and the
  preceding absolute residual divided by $\max(r_{scale},10^{-6})$ is at most
  its development $Q_{.995}$. On support failure it resets age to zero and uses
  A's frozen scalar for that prediction/route; it never invokes B. It retains
  the four 8-byte adaptive scalars plus A's 8-byte baseline per interface; B
  retains each 56-byte binary64 causal feature/target record plus coefficients.
  For each arm, development freezes the empirical .005 and .995 quantiles of
  causal log residual $\ln(E_f^*+10^{-9})-\ln(\hat E_f+10^{-9})$; adding those
  quantiles to the current log prediction gives the 99% interval. No
  confirmation calibration is permitted.
- **Mature null:** B receives the same covariates and full history, explicitly
  estimates the generator's finite-dimensional covariates and state proxy, and
  receives no generator label. C's benefit can only come from the frozen global
  map and bounded causal state.
- **Primary loss:** for $N_p=256\times8\times(H-16)$ scored coefficient
  predictions and $N_r=256\times(H-16)/8$ route decisions,

  $$
  L_{s,a}=0.6\frac1{N_p}\sum
  \min\!\left(25,\frac{[\ln(\hat E_{f,a}+10^{-9})-
  \ln(E_f^*+10^{-9})]^2}{\sigma^2_{\ln E,dev}}\right)
  +0.4\frac1{N_r}\sum\frac{E^*_{f,i_a}-E^*_{f,min}}
  {E^*_{f,min}+10^{-9}},
  $$

  where $\hat E_{f,a}$ is the arm's prediction and $i_a$ is its selected
  route; route regret uses the oracle work actually incurred by that route and
  is clipped to 25. $\sigma^2_{\ln E,dev}$ is frozen from development oracle
  traces. Missing predictions/routes receive the per-item cap. The track
  margin is $\delta_1=0.08$ loss unit.
- **Absolute gates:** B's 99% interval coverage must be at least 0.98 overall
  and 0.97 in every family; route regret may not exceed A in the
  scalar-sufficient family by more than 1% of the development scale; current or
  future force leakage is zero tolerance.
- **Novelty/kill:** $\epsilon_1=0.02$. The frozen C--B axes are per-seed median
  retained per-interface bytes (required reduction 75%), median prediction-plus-
  update CPU (40%), scaled log-work error (no worsening), interval noncoverage
  rate (no worsening), and route regret (no worsening), all under common item 9.
  A byte record is counted once while retained; shared immutable operator
  artifacts are reported but not charged per interface. If B is within 2% of C
  on loss and within 10% on both resource point estimates, the composition is
  killed.
- **Transfer:** use $H=192$, reverse the signs of $a_v$ and $a_T$, and replace
  $\tau$ by $2\tau$ without changing observable fields or route cadence.
- **Resource target and artifacts:** at most 35 s/arm/seed and 1 GiB/track;
  `interface-worlds.jsonl`, `operator.json`, `trace-observations.zst`,
  `friction-predictions.parquet`, `route-decisions.csv`, `support-gates.csv`.

### TAI-T02 -- Nominal versus real contact support

- **Claim:** `C-1498`.
- **Question:** can explicit or compressed rough-contact support recover local
  pressure tails and overload decisions hidden by nominal averages?
- **Primary unit and units:** one surface/load query; height/radius/separation
  [m], modulus/pressure [Pa], force [N], area [m$^2$].
- **Generator:** each seed creates 256 surfaces and four loads per surface.
  Rough surfaces contain $N=2048$ asperities over nominal area
  $A_{nom}=10^{-4}$ m$^2$. Draw asperity coordinates independently and
  uniformly on the square of side $\sqrt{A_{nom}}$; a 4-by-4 equal-cell
  partition supplies the 16 cluster labels. Draw
  $E^*\sim\operatorname{logU}(2,22)10^{10}$ Pa,
  $R_j\sim\operatorname{logU}(5,100)\,\mu$m, and height scale
  $\sigma_z\sim\operatorname{logU}(0.05,5)\,\mu$m. Equal families use (i)
  IID Gaussian heights; (ii) standardized centred-lognormal heights

  $$
  z=\sigma_z\frac{\exp(\tau g)-\exp(\tau^2/2)}
  {\sqrt{(\exp(\tau^2)-1)\exp(\tau^2)}},
  $$

  with $g\sim N(0,1)$ and $\tau\sim U(0.16,0.55)$ (skew approximately
  0.5--2); (iii)
  16 spatial clusters sharing a $N(0,(0.8\sigma_z)^2)$ offset plus
  $N(0,(0.6\sigma_z)^2)$ local variation, and (iv) analytic uniform support.
  For rough families use the shared skeleton. Put $d_U=\max_jz_j$ and initially
  $d_L=\min_jz_j-20\sigma_z$. If $\sum_jf_j(d_L)<W_N$, replace
  $d_L\leftarrow\min_jz_j-20(2^r)\sigma_z$ for $r=1,\ldots,20$ until the load is
  bracketed; exhaustion is solver failure. Bisect the bracket in increasing
  separation order until relative force error is below $10^{-10}$ or 200
  iterations. Loads are
  $W_N\in\{0.25,0.5,1,2\}W_0$, $W_0\sim\operatorname{logU}(10,5000)$ N.
  Uniform-support cases carry the observable support tag `analytic-uniform` and
  set $A_j=A_{nom}/N$, $f_j=W_N/N$, and $p_j=W_N/A_{nom}$ analytically for
  every arm. True material overload
  limit $p_{lim}\sim\operatorname{logU}(0.2,5)$ GPa remains evaluator-only;
  every arm observes the same lognormal measurement with log-scale SD 0.05.
  Observed heights add independent $N(0,(0.02\sigma_z)^2)$ error and observed
  radii multiply by $\exp[N(0,0.02^2)]$; the topography
  operator/cutoff/version are observed.
- **Targets:** over loaded asperities $J_+=\{j:z_j-d>0\}$, real area
  $A_r=\sum_{j\in J_+} A_j$ (set to $A_{nom}$ in the analytic uniform family),
  area-weighted 0.99 pressure quantile defined as the smallest loaded $p_j$ for
  which cumulative $A_j/A_r$ in ascending $(p_j,j)$ order reaches 0.99,
  maximum $p_j=f_j/A_j$ over $J_+$, and overload
  $Y=\mathbf1[\max p_j>p_{lim}]$. Quantiles/maxima are evaluator-only.
- **Frozen arms and intervals:** A sets
  $(\hat A_r,\hat p_{.99},\hat p_{max})=(A_{nom},W_N/A_{nom},W_N/A_{nom})$.
  Given measured $m=\ln p_{lim}^{obs}$ and its flat-log-prior posterior
  $N(m,0.05^2)$, it declares safe when
  $P_A=\Phi[(\ln\hat p_{max}-m)/0.05]\le0.005$, overload when
  $P_A\ge0.995$, and otherwise abstains. Its pressure and area intervals are
  degenerate at its point estimates. B makes exactly 128 posterior draws per
  rough query: draw each latent height from its measurement-centred Gaussian
  with SD $0.02\sigma_z$, each latent log-radius from the observed value with SD
  0.02, and log $p_{lim}$ from $N(m,0.05^2)$, using literal seed
  `TAI-T02|world|surface|load|draw`. It solves every draw by the written
  bracket/bisection, reports medians and $Q_{.005}$--$Q_{.995}$ intervals for
  $A_r,p_{.99},p_{max}$, and uses the fraction of draws with
  $p_{max}>p_{lim}$ with the same 0.005/0.995 decision thresholds. A failed draw
  fails the query rather than being removed. In `analytic-uniform`, every arm
  uses the analytic area/pressure path and only the stated $p_{lim}$ posterior.
  C has an ingestion stage while the raw topography is observable: it runs B
  exactly once for the four declared load IDs, writes B's three point estimates,
  six interval endpoints, overload probability and decision for each load, plus
  the SHA-256 hash of the ordered coordinates, measured heights/radii, operator,
  and four load values, then discards the raw topography. It answers only an
  exact hash/load match and otherwise abstains. The certificate is 40 binary64
  values, four one-byte decisions, one 32-byte hash, and canonical field tags;
  B's retained-topography bytes include two coordinates, height, and radius as
  four binary64 values per summit plus operator fields.
- **Mature null:** B is the full topography/contact solver, not a weak nominal
  regression. The analytic uniform family tests unnecessary complexity.
- **Primary loss:** across 1,024 queries, with positive development scales
  $\sigma^2_{\ln p,dev}$ and $\sigma^2_{\ln A,dev}$,

  $$
  L_{s,a}=0.4\,\overline{\min(25,[\ln \hat p_{.99}-\ln p^*_{.99}]^2/
  \sigma^2_{\ln p,dev})}
  +0.2\,\overline{\min(25,[\ln \hat A_r-\ln A_r^*]^2/
  \sigma^2_{\ln A,dev})}+0.4\,\overline{\ell_{class}},
  $$

  where $\ell_{class}=20$ for false-safe overload, 1 for false overload, 0.25
  for abstention, and 0 otherwise. Zero/invalid predictions receive 25 and
  false-safe loss. $\delta_2=0.10$.
- **Absolute gates:** B/C 99% intervals for $A_r,p_{.99},p_{max}$ require
  coverage at least 0.98
  overall and 0.97 per roughness family; false-safe overload decisions are at
  most 2 per 1,000; non-converged surfaces remain in the denominator. In the
  analytic uniform family B/C loss must be within 1% of A and every physical
  interval must have the same zero width as A.
- **Novelty/kill:** $\epsilon_2=0.02$. The frozen C--B axes are retained surface
  bytes (required reduction 85%), exact registered-query answer rate (lower
  99% paired bound at least 0.95), scaled $p_{.99}$ error, scaled $A_r$ error,
  interval noncoverage, and false-safe rate (each no worsening). A refused or
  hash-mismatched query is not in support and is reported separately; all four
  registered confirmation loads must match. Failure to reconstruct a registered
  pressure, area, interval, or overload output kills compact support.
- **Transfer:** in the clustered family only, retain the base 4-by-4 cell
  centres but replace equal-cell membership by oriented Gaussian-cluster
  membership. Draw one orientation $\omega\sim U(0,\pi)$ per surface, let
  $R(\omega)$ be the two-dimensional rotation matrix, cell width
  $h=\sqrt{A_{nom}}/4$, and
  $\Sigma=R(\omega)\operatorname{diag}(h^2,(h/4)^2)R(\omega)^T$. Assign summit
  coordinate $x_j$ to the centre $c$ minimizing
  $(x_j-c)^T\Sigma^{-1}(x_j-c)$, breaking ties by cell ID; then use that
  cluster's shared $N(0,(0.8\sigma_z)^2)$ height offset plus the base
  $N(0,(0.6\sigma_z)^2)$ local variation. Other families are unchanged. Use
  4,096 summits and load factors 0.125/0.75/1.5/3.
- **Resource target and artifacts:** at most 45 s/arm/seed, 8 GiB RAM, 2 GiB/track;
  `surface-manifests.jsonl`, `topography.zst`, `load-queries.csv`,
  `contact-solutions.parquet`, `tail-intervals.csv`, `overload-decisions.csv`.

### TAI-T03 -- Lubrication-regime mission control

- **Claim:** `C-1499`.
- **Question:** can a regime gate approach complete finite-horizon mediator
  optimisation after starvation, drag, boundary damage, heat, and supply work
  are charged?
- **Primary unit and units:** one contact mission with horizon $H=48$ for
  development/confirmation and $H=96$ for transfer; radius/film/roughness
  [m], modulus/pressure [Pa], viscosity [Pa s], speed [m/s], load [N], flow
  [m$^3$/s], energy [J], normalized damage [1].
- **Generator:** each seed creates 128 contacts with $R_x\sim U(0.005,0.1)$ m,
  $R_y/R_x\sim U(1,8)$, $E'\sim U(50,220)$ GPa,
  $\alpha\sim U(1,3)10^{-8}$ Pa$^{-1}$,
  $R_{q,1},R_{q,2}\sim\operatorname{logU}(0.02,2)\,\mu$m, contact width
  $B\sim U(0.005,0.03)$ m, length $L_c\sim U(0.005,0.05)$ m, and exposed
  synthetic damage limit $d_{lim}\sim U(0.4,0.8)$, all before any arm is
  initialized or any policy is evaluated. Each
  one-second step uses reflected log-AR(1) load and speed. For
  $X\in\{W_N,U\}$ with log-support $[l_X,u_X]$ equal to
  $[\ln50,\ln5000]$ or $[\ln0.01,\ln5]$, set
  $m_X=(l_X+u_X)/2$, $s_X=(u_X-l_X)/6$, draw
  $\ln X_0\sim N(m_X,s_X^2)$ truncated to its support, and update
  $\ln X_{t+1}=m_X+0.8(\ln X_t-m_X)+\epsilon^X_t$, mirror-reflecting at the
  support. Innovations are bivariate normal with SD
  $s_X\sqrt{1-0.8^2}$ and load/speed correlation 0.4. The action chooses one
  of five 313 K viscosities
  $\eta_{40}\in\{0.01,0.025,0.063,0.158,0.4\}$ Pa s and supply multiplier
  $r_q\in\{0.25,0.5,1,2\}$. Viscosity is
  $\eta(T)=\eta_{40}\exp[-\beta(T-313)]$,
  $\beta\sim U(0.015,0.035)$ K$^{-1}$. Initialize
  $(s_0,d_0,T_0)=(1,0,293\,\mathrm K)$.
- **Film oracle:** define
  $U_d=\eta U/(E'R_x)$, $G_d=\alpha E'$,
  $W_d=W_N/(E'R_x^2)$,
  $\kappa=1.03(R_y/R_x)^{0.64}$, and

  $$
  h_{full}=R_x\,3.63U_d^{0.68}G_d^{0.49}W_d^{-0.073}
  (1-e^{-0.68\kappa}).
  $$

  Required flow is $q_{req}=BUh_{full}$; delivered flow is
  $q=r_qq_{req}s_t$, where starvation state follows
  $s_{t+1}=\operatorname{clip}_{[0.1,1]}(0.85s_t+0.15-0.08r_q+\zeta_t)$,
  $\zeta_t\sim N(0,0.03^2)$. The film is
  $h_{min}=h_{full}\min[1,(q/q_{req})^{0.35}]$. Let
  $\lambda=h_{min}/\sqrt{R_{q,1}^2+R_{q,2}^2}$ and separated-load fraction
  $\chi=[1+\exp(-3(\lambda-1.5))]^{-1}$. Draw boundary coefficient
  $\mu_b\sim U(0.08,0.25)$ and set
  $\mu_v=\operatorname{clip}_{[0,0.3]}(\eta UBL_c/(h_{min}W_N))$,
  $F_f=W_N[(1-\chi)\mu_b+\chi\mu_v]$. Pressure-drop proxy is
  $\Delta p=6\eta U L_c/h_{min}^2$, pump efficiency is 0.7, and energies are
  $E_f=F_fU$ J and $E_p=\Delta p\,q/0.7$ J per step. Damage evolves as
  $d_{t+1}=d_t+(1-\chi)\mu_bW_NU/A_d$ with synthetic damage capacity
  $A_d=10^7$ J, then clipped only for reporting.
  Temperature follows
  $T_{t+1}=293+0.95(T_t-293)+(0.02\,\mathrm{K/J})(E_f+E_p)$, clipped at
  450 K. The
  constant fully flooded family fixes $s=1$, $T=313$ K,
  $W_N=500$ N, and $U=0.2$ m/s. At construction the evaluator exhaustively
  evaluates the 20 constant actions for $H$ steps and exposes the smallest-tuple
  action attaining minimum $E_f+E_p$ subject to $d_H\le d_{lim}$; if none is
  feasible it exposes the minimum-energy action. The family carries the
  observable tag `analytic-constant`, and every arm takes that action without
  search.
- **Observations:** current noisy $W_N,U,T$ (1%, 1%, 1 K), previous-step $q$
  (3%), declared geometry, surface record, $\beta$, and $\mu_b$, past force with
  2% lognormal error, and past damage proxy
  with additive $N(0,0.02^2)$ error clipped to $[0,\infty)$. True
  $s,\chi,d$ and future load are hidden. At $t=1$, previous-step fields are
  absent. All arms receive the same 16-member 12-step rolling forecast ensemble
  generated before action selection. At mission step $t$, put
  $h_t=\min(12,H-t+1)$; for member $j$ and horizon
  $h\in\{1,\ldots,h_t\}$, oracle log-load/log-speed receive zero-mean bivariate
  Gaussian error with SDs $0.03\sqrt h$ and $0.04\sqrt h$, correlation 0.3,
  and are clipped to the generator supports. Members use literal seeds
  `TAI-T03|world|time|member`; horizons beyond mission end are absent rather
  than padded.
- **Frozen estimator and arms:** A uses the one fixed action with lowest
  development mean seed loss, breaking ties by action tuple; call it
  $a_{ref}$. B uses 64 particles over $(s,d,T)$. At $t=1$, draw
  $s\sim U(0.7,1)$, $d$ from the current clipped damage-probe likelihood (or set
  $d=0$ if absent), and $T\sim N(T^{obs},1)$ clipped to 293--450 K. After each
  action, propagate with the written state equations and independent stated
  process noise; weight by the product of the stated Gaussian/lognormal
  likelihoods for observed $T,q,F_f,d$, normalize, and systematic-resample when
  effective sample size is below 32. Zero total weight fails the arm. For each
  of the 20 candidate first actions, B pairs the 16 systematic-resampled
  posterior states with the 16 forecast members and rolls $h_t$ steps. At later
  rollout steps its frozen base policy evaluates all 20 actions and takes the
  smallest tuple minimizing one-step
  $(E_f+E_p)/E_{dev}+10\Delta d/d_{dev}$ subject to $d\le d_{lim}$ and
  $T\le430$ K; if none is feasible it takes $a_{ref}$.
  A first action is feasible when at least 15 of 16 trajectories satisfy both
  limits at every rollout step. Per-trajectory rollout cost is the summed
  one-step cost plus

  $$
  C_{term}=10\left[\frac{d_{h_t}-0.8d_{lim}}{0.2d_{lim}}\right]_+
  +10\left[\frac{T_{h_t}-410\,\mathrm K}{20\,\mathrm K}\right]_+ .
  $$

  B chooses the feasible first action with minimum 0.9-CVaR, defined here as
  the arithmetic mean of the two largest of 16 costs, with tuple-order ties; if
  none is feasible it uses the fixed-action fallback. Before C's lookup, each
  particle computes $\lambda^{ref}_t$ from the current posterior
  $(s_t,T_t)$ and current $W_N,U$ under $a_{ref}$ without advancing state; this
  action-independent reference coordinate, not a candidate's post-action
  $\lambda$, uses table edges $[0,0.5,1,2,3,\infty)$.
  $s=[0.1,0.3,0.6,0.85,1]$, $T=[293,330,380,430,450]$ K, and
  $d/d_{lim}=[0,0.25,0.5,0.75,1,\infty)$. A cell is populated only after at
  least 32 development visits; it stores the most frequent B first action,
  breaking frequency ties by lower development mean B rollout cost then tuple
  order. C uses the table only when the componentwise posterior
  $Q_{.005}$--$Q_{.995}$ box of $(\lambda^{ref},s,T,d/d_{lim})$ lies wholly in
  one populated cell and at least 63
  of 64 one-step particle transitions under its stored action satisfy both
  limits; otherwise it invokes B. The table, visit counts, action IDs, and hash
  freeze before confirmation.
- **Mature null:** B already receives the same forecasts, observations, action
  catalogue, estimator family, damage/temperature constraints, pump cost, and
  terminal reserve as C. C cannot claim value from withholding supply or
  thermal terms from the optimiser.
- **Primary loss:** development freezes positive scales $E_{dev}$ and
  $d_{dev}$. In the formula, $E_f=\sum_{t=1}^{H}E_{f,t}$ and
  $E_p=\sum_{t=1}^{H}E_{p,t}$. Across 128 missions,

  $$
  L_{s,a}=\overline{(E_f+E_p)/E_{dev}+10d_H/d_{dev}
  +20\mathbf1[d_H>d_{lim}]+20\mathbf1[\max_{1\le t\le H}T_t>430]},
  $$

  with the pre-policy exposed $d_{lim}$. Invalid missions receive 100.
  $\delta_3=0.10$.
- **Absolute gates:** the evaluator O uses the same 12-step cost, terminal cost,
  20 first actions, later greedy base policy, and tuple ties as B, but starts
  from true current state and uses the realized next $h_t$ load/speed values. B/C
  add at most 5 avoidable damage-limit and 2
  avoidable temperature-limit violations per 1,000 missions; oracle-unavoidable
  violations remain in every loss and are reported separately. Film/flow are
  never negative. Friction, pump, damage, and temperature remain separately
  reported. In the constant fully flooded family B/C must be within 1% loss
  and 5% CPU of A.
- **Novelty/kill:** $\epsilon_3=0.02$. The frozen C--B axes are B-call rate
  (upper 99% bound at most 0.30), per-seed median decision CPU (required
  reduction 50%), final damage, maximum temperature, pump energy, damage-limit
  rate, and temperature-limit rate (each no worsening). Otherwise the regime
  table is rejected.
- **Transfer:** use $H=96$, negate the innovations' log-speed/log-load
  correlation, and multiply every $r_q$ action by 0.5; rolling horizons,
  terminal indices, sums, and gates use that $H$.
- **Resource target and artifacts:** at most 60 s/arm/seed and 2 GiB/track;
  `contact-parameters.jsonl`, `mission-forecasts.zst`, `state-estimates.parquet`,
  `actions.csv`, `film-ledger.csv`, `energy-damage-ledger.csv`.

### TAI-T04 -- Endpoint-matched wear paths

- **Claim:** `C-1500`.
- **Question:** can a path-qualified state predict wear and functional failure
  beyond a constant Archard sum, and can it answer registered queries without
  retaining full history?
- **Primary unit and units:** one paired history with horizon $H=256$ for
  development/confirmation and $H=512$ for transfer; load [N], distance
  [m], hardness [Pa], temperature [K], wear volume [m$^3$], depth [m], cycles
  [count].
- **Generator:** each seed creates 512 pairs. Draw a multiset of $H$ blocks with
  $W_N\sim\operatorname{logU}(20,2000)$ N,
  $\Delta L\sim\operatorname{logU}(10^{-3},1)$ m, speed
  $v\sim\operatorname{logU}(10^{-3},1)$ m/s, base hardness
  $H_0\sim U(1,12)$ GPa, and $k_0\sim\operatorname{logU}(10^{-9},10^{-4})$.
  Path P uses a stable-hash random ordering; path Q reverses blocks within
  16-block strata, so the multiset and $\sum W_N\Delta L/H_0$ are identical.
  Four equal families are:

  1. constant Archard, $H_t=H_0,k_t=k_0$;
  2. thermal, with
     $T_{t+1}=293+0.9(T_t-293)+\gamma W_Nv$,
     $\gamma\sim\operatorname{logU}(10^{-7},10^{-5})$ K/W and
     $k_t=k_0\exp[\beta_T(T_t-293)]$,
     $\beta_T\sim U(0.005,0.03)$ K$^{-1}$ and $T_0=293$ K;
  3. transition, where cumulative dissipated work above an order-independent
     threshold $E_c$ changes $k_t$ by factor
     $r_k\sim\operatorname{logU}(3,100)$ until a 32-block low-load recovery
     condition is met; and
  4. repair/remap, with one intervention time
     $t_R\sim U_{\mathbb Z}\{96,160\}$, restoration fraction
     $r_R\sim U(0.2,0.8)$, and hardness multiplier $h_R\sim U(0.7,1.3)$ drawn
     once per P/Q pair. Immediately after both paths complete block $t_R$, the
     observable intervention applies $V\leftarrow(1-r_R)V$ and
     $H\leftarrow H_0h_R$ and creates a new state epoch.

  For the transition family draw $\mu_w\sim U(0.05,0.4)$, define block
  dissipated work $E_{d,t}=\mu_wW_{N,t}\Delta L_t$, and draw
  $E_c\sim U(0.2,0.6)\sum_{t=1}^{H}E_{d,t}$. After the threshold is
  crossed, set $k_t=k_0r_k$; the factor persists for at least 32 blocks and
  ends at the
  first subsequent complete 32-block window whose mean load and mean speed are
  both below their respective medians in that pair's original multiset. If no
  such window occurs, the changed regime persists to the endpoint; otherwise
  $k_t$ returns to $k_0$ after that window. Oracle wear is
  $\Delta V_t=k_tW_{N,t}\Delta L_t/H_t$. Effective area
  $A_{eff}\sim U(10^{-6},10^{-3})$ m$^2$ gives depth $h_w=V/A_{eff}$.
  Define current service violation $Y_t=\mathbf1[h_w>h_{lim}]$ and the first-
  crossing time $\tau_f=\inf\{t:Y_t=1\}$, with $\tau_f=\infty$ if absent. A
  repair may restore $Y_t$ to zero, but it cannot erase the recorded first
  crossing. Here $h_{lim}\sim\operatorname{logU}(1,500)\,\mu$m. Observed wear
  probes occur every 32 blocks with 5% lognormal error; temperature has 1 K
  error. Full sequences are exposed causally, not future probes or hidden
  family/state. At $q\in\{32,64,\ldots,H\}$, predictions are written after
  block $q$ but before its wear probe is revealed; the probe then updates the
  estimator. Each query requests current $V_q$, $P(Y_q=1)$, the distribution of
  $\tau_f$, and $V$ plus $P(Y=1)$ after a prospective 32-block reference
  schedule. That schedule is public and fixed: for $j=1,\ldots,32$,
  $W_j=20\,100^{(j-0.5)/32}$ N,
  $\Delta L_j=10^{-3}1000^{((7j\bmod32)+0.5)/32}$ m, and
  $v_j=10^{-3}1000^{((13j\bmod32)+0.5)/32}$ m/s.
- **Frozen estimators and arms:** A begins with the development median $k_0$.
  For a completed probe interval, propagate the known constant-$k$ recurrence
  symbolically as $V_q=c_qV_{q-32}+kX_q$, including every exposed repair and
  hardness update in written order, and form
  $\hat k_q=\max[0,(V_q^{obs}-c_qV_{q-32}^{obs})/X_q]$; $X_q=0$ fails the
  estimate. A replaces $\hat k_A$ by the median of all completed finite
  interval estimates. It propagates one constant-$k$
  path, applies exposed interventions exactly, and uses development empirical
  residual quantiles for its query intervals/probabilities. B uses 512 particles
  whose family is initially uniform over the four generator families and whose
  family parameters are drawn from the written generator priors. Given the
  observed block sequence and interventions, each particle propagates the
  written $T,k,V$, threshold, recovery-window, and epoch states. It is weighted
  each block by the 1 K temperature likelihood and at probes by the 5% lognormal
  wear likelihood, with systematic resampling below effective sample size 256.
  Before every query B reruns this filter from block 1 through $q$ excluding the
  unrevealed $q$ probe, retaining full history; weighted median and
  $Q_{.005}$--$Q_{.995}$ give point/interval outputs, and weighted event
  frequencies give probabilities. C runs the same algorithm with 64 particles
  online. Its retained state is, for every particle, family/parameter fields,
  current $T,V,k$, threshold/recovery state, first-crossing flag/time, epoch,
  and weight, plus one residual scale; it deletes each raw block immediately
  after propagation and deletes a probe immediately after weighting. Both arms
  simulate the public prospective schedule from cloned current particles.
- **Mature null:** B receives full causal history, interventions, and the
  correct four-family mixture. It is not limited to the constant Archard law.
- **Primary loss:** there are $N_{path}=1{,}024$ paths and
  $N_q=H/32$ queries per path. Let $e^{cur}_{V}$ and $e^{pros}_{V}$ be the
  current and prospective clipped squared-log errors divided by
  $\sigma^2_{\ln V,dev}$; let $\ell^{cur}_{fail}$ and
  $\ell^{pros}_{fail}$ use the stated false-safe/false-violation/abstention rule;
  let $p_{f,q}$ be predicted probability that $\tau_f\le q$; and map
  $\infty$ to $H+1$ in the first-crossing point error. Every overbar below is
  exactly the mean over the same $N_{path}N_q$ path-query items; $\hat\tau_f$
  is the arm's posterior median with the same infinity mapping:

  $$
  \begin{aligned}
  L_{s,a}={}&0.30\overline{e^{cur}_{V}}+0.20\overline{e^{pros}_{V}}
  +0.20\overline{\ell^{cur}_{fail}}+0.15\overline{\ell^{pros}_{fail}}\\
  &+0.10\overline{(p_{f,q}-\mathbf1[\tau_f\le q])^2}
  +0.05\overline{\min\!\left(25,
  \frac{[\min(\hat\tau_f,H+1)-\min(\tau_f,H+1)]^2}{32^2}\right)} .
  \end{aligned}
  $$

  Each $e_V$ is

  $$
  \min(25,[\ln(\hat V+10^{-18})-\ln(V^*+10^{-18})]^2/
  \sigma^2_{\ln V,dev}).
  $$

  Each $\ell_{fail}$ is 20 for declaring safe when the
  corresponding current/prospective violation is one, 1 for declaring
  violation when that target is zero, 0.25 for probability in
  $(0.005,0.995)$ (abstention),
  and 0 otherwise at each 32-block query; probability at least 0.995 declares
  violation and at most 0.005 declares safe. A missing query assigns 25 to each
  wear/first-crossing point error, 20 to each class error, and 1 to Brier error;
  a missing path receives 100. $\delta_4=0.08$.
- **Absolute gates:** false-safe current violations are at most 2 per 1,000
  queries; 99% intervals for current and prospective wear cover at least 0.98
  overall and 0.97 per family; first-crossing probability Brier score and
  first-crossing-time interval coverage are reported; pre/post-repair
  epochs cannot be pooled without the epoch field. In constant-Archard worlds
  B/C must remain within 1% loss of A.
- **Novelty/kill:** $\epsilon_4=0.02$. The frozen C--B axes are peak retained
  estimator bytes (required reduction 80%), current/prospective log-wear error,
  interval noncoverage, false-safe rate, and first-crossing Brier score (each no
  worsening). Every frozen query must be answered; use of an unregistered future
  threshold or raw-history retention by C kills the compact state.
- **Transfer:** use $H=512$ and draw the complete 512-block multiset from the
  same marginals. Sort it by load with stable-hash ties; path P alternates the
  lowest and highest remaining block until all 512 are used, and path Q reverses
  P within each consecutive 16-block stratum. Use transition thresholds
  $0.6E_c$ and $1.4E_c$ on alternating pairs with independent $r_k$ draws and
  the same recovery rule. In the repair/remap family, replace the single random
  intervention by observable interventions after blocks 128 and 320, each with
  independent $r_R\sim U(0.2,0.8)$ and $h_R\sim U(0.7,1.3)$ shared by its P/Q
  pair. Query cadence, loss denominators, endpoint mapping, and all sums use
  $H=512$.
- **Resource target and artifacts:** at most 45 s/arm/seed and 1.5 GiB/track;
  `wear-paths.zst`, `interventions.jsonl`, `wear-probes.csv`,
  `state-epochs.jsonl`, `wear-predictions.csv`, `reconstruction-checks.csv`.

### TAI-T05 -- Rate/state stick--slip boundary

- **Claim:** `C-1501`.
- **Question:** does rate/state identification predict instability beyond mean
  friction, and can event-triggered high-rate computation preserve onset and
  trace accuracy?
- **Primary unit and units:** one 20 s spring-slider case; mass [kg], stiffness
  [N/m], damping [N s/m], force [N], velocity [m/s], state [s], time [s].
- **Generator:** each seed creates 128 cases. Draw
  $m\sim\operatorname{logU}(0.05,2)$ kg, $W_N\sim U(50,1000)$ N,
  $\mu_0\sim U(0.2,0.7)$, $a\sim U(0.002,0.03)$,
  $D_c\sim\operatorname{logU}(10^{-5},10^{-3})$ m,
  $V_d\sim\operatorname{logU}(10^{-4},10^{-2})$ m/s, and
  $c\sim\operatorname{logU}(0.1,20)$ N s/m. In 32 velocity-strengthening
  stable cases draw $b\sim U(0.002,a)$ and
  $k_s\sim\operatorname{logU}(10^2,2\times10^4)$ N/m. In 32 velocity-weakening but
  stiffness-stable cases draw $b\sim U(a+0.002,0.06)$ and set
  $k_s\sim U(1.5,4)W_N(b-a)/D_c$. In 64 weakening/unstable cases draw
  $b\sim U(a+0.002,0.06)$ and
  $k_s\sim U(0.2,0.8)W_N(b-a)/D_c$. Drive speed has steps at 6 and 12 s by
  factors independently drawn from $\{0.5,2\}$; drive position is
  $x_d(t)=\int_0^tV_d(u)\,du$ and replaces $V_dt$ in the shared spring term.
- **Oracle integration:** use the shared rate/state equations with
  $v_\epsilon=10^{-9}$ m/s and initial steady state
  $\theta_0=D_c/V_d$, $\dot x_0=V_d$, and
  $x_0=-[cV_d+W_N\mu(V_d,\theta_0)]/k_s$. Integrate with Dormand--Prince 5(4), relative tolerance
  $10^{-9}$, absolute tolerances $10^{-11}$ m, $10^{-10}$ m/s, and
  $10^{-9}$ s, step range $[10^{-8},10^{-3}]$ s, at most 2,000,000 accepted
  steps. With sample interval $\Delta t_s=10^{-3}$ s, observe
  $x^{obs}_n=x(n\Delta t_s)+\epsilon^x_n$ with independent
  $\epsilon^x_n\sim N(0,(10^{-7}\,\mathrm m)^2)$ and force noise
  $N(0,(0.002W_N)^2)$, where force means the signed friction term
  $W_N\mu(v,\theta)\tanh(v/v_\epsilon)$. The setup exposes $m,W_N,k_s,c$, the
  complete drive command through the forecast horizon, sampled position,
  sampled friction force, and one causal derived velocity to every arm. Define
  $v^{raw}_n=(x^{obs}_n-x^{obs}_{n-1})/\Delta t_s$ for $n\ge1$,
  $v^{obs}_0=V_d(0)$, and
  $v^{obs}_n=0.8v^{obs}_{n-1}+0.2v^{raw}_n$ in increasing sample order; no
  centred/future sample is allowed. The true velocity and
  $\mu_0,a,b,D_c,\theta$ and noiseless ODE
  state remain hidden. Numerical convergence is checked against a 10x tighter
  tolerance on 16 development cases per family before freeze.
- **Outcome definition:** after a 4 s identification window, stick--slip onset
  is the start of the first 0.5 s window for which, using instantaneous command
  speed, $\max[v/V_d(t)]\ge1.5$, $\min[v/V_d(t)]\le0.1$, and the condition recurs in three
  consecutive overlapping windows advanced by 0.1 s. The evaluator also asks
  1 s trajectory forecasts every 0.25 s. This operational definition is
  synthetic and not a universal tribology definition.
- **Frozen arms and intervals:** A estimates one Coulomb coefficient as the
  median of $|F_f^{obs}|/W_N$ in the first 4 s, clips it to $[0.02,1.2]$, and
  integrates the known spring/mass/damping plant with that coefficient and the
  same solver tolerances. B fits $(\mu_0,a,b,D_c)$ in bounds
  $[0.2,0.7]\times[0.002,0.03]\times[0.002,0.06]\times[10^{-5},10^{-3}]$ from
  the first 4 s. Parameters are mapped to $[0,1]^4$ (log scale for $D_c$).
  Starting from the all-0.5 point and the eight points that replace one
  coordinate by 0 or 1, deterministic coordinate search evaluates, in
  coordinate/sign order, every feasible $\pm h e_j$, initially $h=1/4$;
  it accepts the lowest objective (lexicographic ties)

  $$
  J=\frac1{N_{id}}\sum_{n\Delta t_s\le4\,\mathrm s}
  \left[\left(\frac{\hat x_n-x^{obs}_n}{10^{-7}\,\mathrm m}\right)^2+
  \left(\frac{\hat F_n-F^{obs}_n}{0.002W_N}\right)^2\right],
  $$

  halves $h$ after a sweep with no improvement, and stops at $h<2^{-16}$ or 200
  sweeps. Each objective integrates from observed $(x^{obs}_0,v^{obs}_0)$ with
  $\theta_0=D_c/V_d(0)$; failed integrations have infinite objective. B creates
  128 particles by adding independent $N(0,0.05^2)$ perturbations in normalized
  parameter space to the best fit, clipping to bounds, reruns the 4 s window,
  and normalizes the stated Gaussian position/force likelihoods. Thereafter it
  propagates every particle and weights every tenth 1 kHz sample; systematic
  resampling occurs below effective sample size 64. Forecast point/intervals are
  particle median and $Q_{.005}$--$Q_{.995}$. A uses development-frozen .005/.995
  trajectory-residual quantiles for its intervals. At each forecast query, B
  applies the operational onset rule to every particle path: posterior onset
  probability at least 0.995 declares onset, at most 0.005 declares no onset,
  and an intermediate value abstains; reported onset time is the weighted
  median among onset paths. A applies the rule to its point path without
  abstention, and C reports whichever arm is active. C always retains a 4 s
  position/force ring buffer and runs A. Every 10 ms it computes
  $g_t=\max(|F^{obs}-\hat F_A|/s_{F,dev},|v^{obs}-\hat v_A|/s_{v,dev})$.
  Development selects
  $h\in\{2,3,4\}$ by the smallest $h$ with zero additional missed onsets versus
  B, then lowest CPU. Two consecutive $g_t>h$ values activate a cold B fit on
  the ring buffer; B remains on at least 1 s and deactivates only after 0.5 s of
  consecutive $g_t<0.5h$. Cold-start fitting, buffer bytes, and all work while B
  is active are charged to C. Here $s_{F,dev},s_{v,dev}$ are positive RMS A
  residuals frozen from development.
- **Mature null:** B is the frozen rate/state system-identification and
  uncertainty filter above; C is not compared only with open-loop Coulomb
  friction.
- **Primary loss:** across all forecast samples,

  $$
  L_{s,a}=0.5\,\overline{\min(25,(v_a-v^*)^2/
  \sigma^2_{v,dev})}+0.5\,\overline{\ell_{onset}},
  $$

  where $\ell_{onset}=20$ for missed onset or onset error above 0.25 s, 1 for a
  false onset, 0.25 for abstention before onset, and 0 otherwise. Divergence or
  truncation is loss 100. $\delta_5=0.10$.
- **Absolute gates:** missed onset at most 1%, false onset at most 2%, onset-time
  median absolute error at most 0.10 s, and 99% velocity interval coverage at
  least 0.98. Stable cases cannot be removed. Oracle ODE state is inaccessible
  to A/B/C.
- **Novelty/kill:** $\epsilon_5=0.02$. The frozen C--B axes are accepted ODE-step
  count (required reduction 50%), particle-update count (50%), per-seed median
  CPU (40%), missed-onset rate (no worsening), false-onset rate (absolute margin
  0.0025), onset-time error, trajectory error, and interval noncoverage (each no
  worsening unless a margin is stated). A gate that merely runs B continuously
  fails the resource claim.
- **Transfer:** replace the drive steps by the exact logarithmic sweep
  $V_d(t)=V_d2^{-1+t/(10\,\mathrm s)}$ for $0\le t\le20$ s, set
  $\Delta t_s=0.004$ s, and use the identical backward-difference/
  EWMA definition, and multiply the hidden true $D_c$ by 1.5
  immediately after 10 s while keeping the true $\theta$ continuous.
- **Resource target and artifacts:** at most 60 s/arm/seed and 2 GiB/track;
  `spring-slider-cases.jsonl`, `sampled-traces.zst`, `solver-diagnostics.csv`,
  `onset-labels.csv`, `forecasts.parquet`, `event-gates.csv`.

### TAI-T06 -- Third-body inventory and sign change

- **Claim:** `C-1502`.
- **Question:** does a measured mass/state ledger improve retain-versus-remove
  decisions when mediator material can switch between protection and abrasion?
- **Primary unit and units:** one 512 s contact; mass/rate [kg, kg/s], force
  [N], speed [m/s], hardness [Pa], energy [J], wear volume [m$^3$], accepted
  service [task].
- **Generator:** each seed creates 512 contacts. Draw first/second-body density
  $\rho\sim U(1800,9000)$ kg/m$^3$, hardness
  $H\sim U(0.5,12)$ GPa, base coefficient $\mu_0\sim U(0.08,0.5)$, wear
  coefficient $k_0\sim\operatorname{logU}(10^{-9},10^{-5})$ and characteristic
  inventory $M_{50}\sim\operatorname{logU}(10^{-8},10^{-4})$ kg. Before any
  arm/filter/policy is initialized, independently draw and expose synthetic
  mission limits $V_{lim}\sim\operatorname{logU}(10^{-12},10^{-6})$ m$^3$ and
  $M_{lim}\sim\operatorname{logU}(5\times10^{-8},5\times10^{-4})$ kg. Protective
  worlds draw $r_H\sim\operatorname{logU}(0.1,0.5)$, abrasive worlds draw
  $r_H\sim\operatorname{logU}(2,10)$, sign-changing worlds start in
  $\operatorname{logU}(0.1,0.5)$, and irrelevant worlds draw
  $r_H\sim\operatorname{logU}(0.1,10)$. Set $M_{3,0}=A_{3,0}=0$ and initialize
  source abrasive fraction
  $a^{src}_0=[1+e^{-2\ln r_H}]^{-1}$. Load and speed use coefficient-0.85
  reflected log-AR(1) processes over 20--2000 N and $10^{-3}$--1 m/s. For each
  log-support $[l,u]$, initial state is truncated
  $N(m,[(u-l)/6]^2)$ with $m=(l+u)/2$; innovation SD is
  $[(u-l)/6]\sqrt{1-0.85^2}$, the update is
  $\ln X_{t+1}=m+0.85(\ln X_t-m)+\epsilon_t$ with mirror reflection, and
  load/speed innovation correlation is -0.2.
  Each one-second step supplies base generated mass
  $G_b=\rho k_0W_N|v|/H$ [kg/s]. The abrasive fraction evolves as

  $$
  a^{src}_{t+1}=\operatorname{clip}_{[0,1]}
  (0.9a^{src}_t+0.1[1+e^{-2\ln r_H}]^{-1}+\epsilon_t),
  \quad \epsilon_t\sim N(0,0.02^2).
  $$

  At an opening inventory, define abrasive inventory fraction
  $a^{inv}=A_3/M_3$ when $M_3>0$ and zero otherwise, and coverage
  $\phi=M_3/(M_3+M_{50})$. Oracle friction and source-body wear multipliers are

  $$
  \mu=\operatorname{clip}_{[0.02,1.2]}
  [\mu_0-b_p\phi(1-a^{inv})+b_a\phi a^{inv}+b_o(\phi-0.8)_+^2],
  $$

  $$
  r_w=\operatorname{clip}_{[0.05,20]}
  [1-c_p\phi(1-a^{inv})+c_a\phi a^{inv}+c_o(\phi-0.85)_+^2],
  $$

  with $b_p,c_p\sim U(0.05,0.30)$,
  $b_a,c_a\sim U(0.05,0.50)$, and $b_o,c_o\sim U(0.2,1)$. Equal families are
  protective ($r_H<0.5$, low $a^{src}$), abrasive ($r_H>2$, high $a^{src}$),
  sign-changing (at step $t_c\sim U_{\mathbb Z}\{160,352\}$ replace
  $r_H\leftarrow1/r_H$ and
  $(b_p,b_a,c_p,c_a)\leftarrow(b_a,b_p,c_a,c_p)$), and
  irrelevant ($b_*=c_*=0$). Generation is $G_{1\to3}+G_{2\to3}=G_br_w$;
  generated abrasive mass is fraction $a^{src}_t$ of that source flow.
- **Actions and balance:** choose purge fraction
  $u\in\{0,0.1,0.3,0.6\}$ and external soft-mediator supply
  $g\in\{0,10^{-8},10^{-7},10^{-6}\}$ kg/s only at steps
  $1,17,\ldots,497$; the chosen pair is held for that 16-step block. At every
  step, (1) compute friction, wear, and service from the opening $(M_3,A_3)$;
  (2) round generated mass and $a^{src}$ times generated mass to femtograms and
  add them, then add rounded external soft supply with zero abrasive mass;
  (3) remove rounded fraction $u$ of this post-addition inventory as purge;
  (4) remove rounded 0.005 of the remainder as natural escape; (5) remove
  rounded 0.01 of the new remainder as reincorporation. Each rounding is
  nearest, ties-to-even, and capped at available integer mass. For any removal
  $m$ from positive inventory $(M,A)$, abrasive removal is
  $\min[A,\operatorname{round}_{even}(mA/M)]$ before signed subtraction. This
  order, including composition updates, is mandatory. The closing inventory is
  signed integer addition of opening inventory, every inflow, and every outflow,
  never a residual correction; its total and abrasive balance residuals must
  both be exactly zero. Convert to kg only for output. With one-second steps, wear
  increment is
  $k_0r_wW_N|v|/H$ m$^3$ and friction energy is $\mu W_N|v|$ J. Purge and
  supply energies are $e_p|G_{purge}|\Delta t$ and $e_g g\Delta t$ with
  $e_p=10^6$ J/kg, $e_g=2\times10^6$ J/kg, and $\Delta t=1$ s; $G_{purge}$ is
  actual rounded purge divided by $\Delta t$. These are
  declared only as synthetic actuator costs.
- **Observations:** positive $M_3$ has 5% lognormal error (zero remains zero),
  optical coverage has additive $N(0,0.03^2)$ error clipped to $[0,1]$,
  and past force/wear probes have 2%/10% lognormal error. At each sixteenth
  step an arm may buy one $r_H$ probe with 10% lognormal error for 0.01 J; B
  buys every available probe, C follows its frozen evidence-age gate, and A
  buys none. At each 16-step decision, all arms also receive the same eight
  32-step load/speed forecast paths drawn from the conditional AR transition
  with literal seeds `TAI-T06|world|decision|member`. True $a^{src}$,
  $a^{inv}$ except through noisy observations, future sign change, and oracle
  coefficients are hidden. Observation/update order is exact. Routine mass,
  coverage, force, and wear observations generated by step $t$ become available
  before step $t+1$. At a 16-step decision, each filter first consumes all
  routine observations through the preceding step; B then buys and assimilates
  its $r_H$ probe. C computes the same finite-difference sign zone defined below
  on its own pre-probe
  posterior, buys and assimilates a probe only when its rule says so, and only
  then recomputes the zone and selects the block action. At $t=1$, opening inventory zero is known and
  there are no past routine observations.
- **Frozen arms:** A0 purges 60% and never supplies; A1 never purges and never supplies.
  The lower development mean seed loss is frozen as A, with A0 winning a tie,
  while both remain reported. B is
  a 128-particle filter initialized by drawing family uniformly, parameters from
  the written family priors, opening integer inventory $(0,0)$, and source
  fraction from its family prior. It tracks source fraction, family/parameters, and integer
  inventory, weighted by its stated coverage, force, wear, mass, and purchased
  hardness-probe likelihoods and systematic-resampled below effective sample
  size 64. At each block it evaluates all 16 first actions on the eight common
  forecast paths for two 16-step blocks. The second block uses the smallest
  action minimizing one-block expected normalized energy-plus-wear cost subject
  to $V_w\le V_{lim}$ and $M_3\le M_{lim}$; the first action minimizes mean
  two-block cost among actions feasible on at least seven paths, with tuple ties,
  and otherwise uses frozen A. C owns a separate 128-particle copy initialized
  from the same literal particle draws. It applies the same transition and
  routine-observation updates but only its own purchased $r_H$ probes; B's probe
  values and weights are inaccessible. Before each block, for each C particle it
  evaluates the finite difference in next-block normalized friction-plus-wear
  cost between opening coverage $\phi$ and
  $\min(1,\phi+0.01)$ with composition held fixed. If at least 99% of weight has
  nonpositive difference, C retains and sets $(u,g)=(0,10^{-7})$ when
  $M_3<M_{50}$ and $(0,0)$ otherwise. If at least 99% is nonnegative, C uses
  $(0.6,0)$. Otherwise, after the ordered probe update above, it invokes B's
  rollout algorithm using C's posterior and the common forecast paths; it
  also buys a probe when evidence age reaches 64 steps. Evidence age initializes
  at zero, advances by 16 after each unprobed block up to 64, and resets to zero
  on a probe. Sign-change recovery is the number of steps from a true change until
  the posterior assigns at least 0.99 weight to the new sign, right-censored at
  mission end.
- **Mature null:** B includes ordinary mass-balance MPC, not a debris-blind
  policy; oracle sign is never an input.
- **Primary loss:** development freezes $E_{dev}$ and $V_{dev}$. Across 512
  contacts, $E_{total}$ is the sum of friction, purge, supply, and probe energy
  and $V_w$ is the summed source-body wear volume,

  $$
  L_{s,a}=\overline{E_{total}/E_{dev}+10V_w/V_{dev}
  +20\mathbf1[V_w>V_{lim}]+5\mathbf1[\max_tM_{3,t}>M_{lim}]
  +20\mathbf1[S_{acc}<500]},
  $$

  where the pre-policy $V_{lim},M_{lim}$ are exposed to every arm. A step
  contributes one accepted task only while both limits are satisfied. Failed
  balance/inventory is loss 100.
  $\delta_6=0.10$.
- **Absolute gates:** zero negative inventory; exact integer total and abrasive
  mass closure. Evaluator O uses the same two-block rollout/base rule with true
  state and realized next 32 load/speed values; avoidable wear-limit violations
  are at most 5 per 1,000 relative to O. Accepted-service
  non-inferiority to frozen A within 0.5 percentage point; no arm may use the
  hidden sign family. Oracle-unavoidable violations remain in every loss and
  are reported separately. In the irrelevant family B/C must be within 1%
  loss of the frozen A comparator.
- **Novelty/kill:** $\epsilon_6=0.02$. The frozen C--B axes are MPC-call count
  (required reduction 40%), hardness-probe count (40%), median decision CPU
  (35%), mass-balance failures, accepted-service rate, wear, wear-limit rate,
  and sign-change recovery time (each no worsening). Otherwise the local gate
  is killed.
- **Transfer:** force sign changes at steps 170 and 340, inject exogenous hard
  mediator with abrasive fraction one at $10^{-6}$ kg/s for steps 120--127 and
  376--383 (logged separately, with no actuator energy charged), and drop all non-command
  observations for steps 205--306 (20% of the mission).
- **Resource target and artifacts:** at most 50 s/arm/seed and 2 GiB/track;
  `third-body-worlds.jsonl`, `inventory-ledger.parquet`, `mass-residuals.csv`,
  `state-probes.csv`, `purge-supply-actions.csv`, `wear-service.csv`.

### TAI-T07 -- Surface-texture operating envelope

- **Claim:** `C-1503`.
- **Question:** does mission-qualified texture selection choose structure only
  where its friction/wear benefit survives edge stress, drag, clogging,
  manufacture, and regime shift?
- **Primary unit and units:** one 24-point mission for one interface design;
  pressure [Pa], viscosity [Pa s], speed [m/s], roughness/depth/diameter [m],
  friction energy [J], wear [m$^3$], build energy [J].
- **Generator:** each seed creates 256 mission worlds. Candidate designs are
  smooth plus the Cartesian grid of texture area fraction
  $\phi\in\{0.05,0.10,0.20,0.30\}$, depth/diameter
  $r_d\in\{0.05,0.10,0.20\}$, and orientation
  $o\in\{0,\pi/4,\pi/2\}$; the smooth design uses $\phi=r_d=o=0$. Every
  mission has 24 one-second points. Draw
  contact area $A_c\sim U(10^{-5},10^{-3})$ m$^2$, base hardness
  $H\sim U(0.5,12)$ GPa, and base wear coefficient
  $k_0\sim\operatorname{logU}(10^{-9},10^{-5})$. At each point draw
  $p=W_N/A_c\sim\operatorname{logU}(0.1,100)$ MPa,
  $U\sim\operatorname{logU}(0.005,5)$ m/s,
  $\eta\sim\operatorname{logU}(0.005,0.5)$ Pa s,
  $R_q\sim\operatorname{logU}(0.02,5)\,\mu$m, and starvation
  $s\sim U(0.1,1)$. Define $S=\eta U/(pR_q)$ and $y=\log_{10}S$. For each
  world draw $A_h\sim U(0,0.8)$, $A_s\sim U(0,0.4)$,
  $A_e\sim U(0.1,1)$, $A_d\sim U(0.02,0.3)$,
  $c\sim U(-5,-1)$, and $\sigma\sim U(0.3,1.2)$. The explicitly synthetic
  response is

  $$
  B_h=A_h\phi(1-\phi/0.4)e^{-(y-c)^2/(2\sigma^2)}
  [0.5+0.5|\cos o|],
  $$

  $$
  B_s=A_s\phi(1-s),\quad
  H_e=A_e\phi r_d^2\left(\frac{p}{10\,\mathrm{MPa}}\right)^{1.2},\quad
  H_d=A_d\phi\left(\frac{U}{1\,\mathrm{m\,s^{-1}}}\right)^{0.5}.
  $$

  With smooth coefficient $\mu_s\sim U(0.05,0.4)$,
  $\mu=\operatorname{clip}_{[0.01,1.2]}(\mu_s-B_h-B_s+H_e+H_d+C_t)$,
  where clogging $C_{t+1}=0.9C_t+0.05\phi(1-s)-0.1C_t\mathbf1[U>1]$.
  Set $C_0=0$ for every design.
  Wear multiplier is
  $r_w=\operatorname{clip}_{[0.05,20]}\exp(-2B_s-B_h+3H_e+2C_t)$.
  Per-point friction energy and wear are
  $E_f=\mu W_NU\Delta t$ and
  $\Delta V=k_0r_wW_NU\Delta t/H$, with $\Delta t=1$ s. Draw exposed synthetic
  wear limit $V_{lim}\sim\operatorname{logU}(10^{-12},10^{-6})$ m$^3$.
  Build energy is $E_{build}=E_0[1+4\phi+8\phi r_d]$ with
  $E_0\sim\operatorname{logU}(10^2,10^5)$ J, amortized over independently drawn
  integer service horizon
  $N_{horizon}=\operatorname{round}_{even}\{\exp[U(\ln10^4,\ln10^7)]\}$
  missions. One quarter of
  worlds set $A_h=A_s=0$ (smooth-dominant control). One quarter are
  texture-benefit controls: set $A_e=A_d=0$, draw
  $A_h\sim U(0.4,0.8)$ and $A_s\sim U(0.2,0.4)$, fix service horizon at
  $10^7$ missions, and rejection-sample the 24 operating points until the
  at least one non-smooth design (i) lowers total friction plus allocated build energy
  by at least 10% versus smooth, (ii) has no greater total wear, and (iii)
  remains within $V_{lim}$. Sampling stops after 1,000 attempts; exhaustion is
  retained and reported as a generator failure, not silently redrawn. If more
  than one design qualifies, the smallest design ID is stored only as an
  evaluator annotation and is never exposed to an arm. The
  remainder contain trade-offs. These equations are benchmark hypotheses, not
  fits to cited experiments.
- **Observations and qualification order:** draw one ordered 12-point IID
  qualification covariate sequence from the same $p,U,\eta,R_q,s$ marginals and
  run that exact sequence on every design, resetting $C_0=0$ before each design.
  Every design receives multiplicative
  $\exp[N(0,0.02^2)]$ friction-force error and
  $\exp[N(0,0.10^2)]$ wear error, plus the empirical distribution over the 24
  confirmation operating points as an unordered multiset of the exact 24
  covariate tuples; their realized order remains hidden. True coefficients,
  clog state, future order, and actual transfer manufacturing error are hidden.
  Nominal surface geometry, $H,k_0,E_0,N_{horizon},V_{lim}$, and operator are
  exact design/mission inputs.
- **Frozen arms:** standardize the five log/linear qualification covariates by
  positive development SDs. A finds the qualification tuple nearest the
  componentwise qualification median in squared standardized distance, breaks
  point ties by earlier sequence index, and selects the design with smallest
  measured friction coefficient there, breaking design ties by ID. B jointly
  fits $(\mu_s,A_h,A_s,A_e,A_d,c,\sigma)$ in the seven written generator bounds;
  $c$ and $\sigma$ are neither known nor silently integrated out. Its objective
  over all 444 qualification observations is

  $$
  J=\frac1{444}\sum
  \left[\left(\frac{\ln\mu^{obs}-\ln\hat\mu}{0.02}\right)^2+
  \left(\frac{\ln(\Delta V^{obs}+10^{-30}\,\mathrm{m^3})-
  \ln(\widehat{\Delta V}+10^{-30}\,\mathrm{m^3})}{0.10}\right)^2\right].
  $$

  It minimizes this fixed normalized SSE by projected gradient: start at bound
  midpoints, use the analytic
  gradient through the clipped response (zero derivative at a clipping face),
  step $0.05/\sqrt j$, project after every update, run exactly 256 updates, and
  fail on nonfinite loss. It makes 256 parametric response-noise bootstrap
  datasets with literal seeds `TAI-T07|world|bootstrap|j` and performs 32
  updates from the main fit for each. It pairs bootstrap draws
  $j\in\{4,8,\ldots,256\}$ with 64 stable-hash permutations of the visible
  confirmation multiset, yielding 64 lifecycle scenarios per design. B selects
  the design minimizing $Q_{.99}$ of predicted
  $(E_f+E_{build,alloc})/E_{dev}+10V_w/V_{dev}$ among designs with zero of 64
  predicted wear-limit violations; ties use ID. If none qualifies, it selects
  smooth. C runs the identical fit and evaluation but restricts designs to
  smooth plus at most eight non-smooth designs: development partitions worlds
  into the Cartesian quartiles of median $y$ and median $s$, counts B winners in
  each of 16 bins, and freezes the eight most frequent distinct winners
  (frequency then design ID). Its support certificate requires every visible
  log covariate to lie within development $Q_{.005}$--$Q_{.995}$ and the world
  medians to occupy one of those populated bins. Outside support C records
  abstention and selects smooth; inside support it uses B's rule on its library.
- **Mature null:** B includes smooth, full robust design search, manufacture,
  and mission shift. Texture is not compared only with an arbitrary rough
  surface.
- **Primary loss:** friction energy plus build allocation is normalized by
  $E_{dev}$, wear by $V_{dev}$, and each failed mission by 20:

  $$
  E_f=\sum_{t=1}^{24}E_{f,t},\qquad
  V_w=\sum_{t=1}^{24}\Delta V_t,\qquad
  E_{build,alloc}=E_{build}/N_{horizon}.
  $$

  $$
  L_{s,a}=\overline{(E_f+E_{build,alloc})/E_{dev}
  +10V_w/V_{dev}+20\mathbf1[V_w>V_{lim}]}.
  $$

  All 24 points and failed designs remain. $\delta_7=0.08$.
- **Absolute gates:** evaluator O exhaustively scores all 37 designs with true
  coefficients and realized confirmation order, using the same lifecycle loss
  and ID ties. B/C select smooth in at least 98% of smooth-dominant
  worlds, texture in at least 90% of texture-benefit worlds, keep wear-limit
  violations that an evaluator-only full-design oracle can avoid below 5 per
  1,000, and report oracle-unavoidable violations and build/friction/wear
  separately. No post-confirmation geometry search is permitted.
- **Novelty/kill:** $\epsilon_7=0.02$. The frozen C--B axes are evaluated design-
  scenario lifecycle-score count (required reduction 75%), median selection CPU
  (50%), scalar loss, wear, and avoidable wear-limit rate (each no worsening),
  plus outside-support abstention recall (lower 99% bound at least 0.99). All
  arms retain the same qualification observations. If the library omits smooth or causes
  more than one additional wear violation per 1,000, it is killed.
- **Transfer:** replace effective orientation $o$ by $o+\pi/2$, multiply every
  true and visibly reported $\eta$ by $10^{1.5}$, replace clog coefficients
  0.9/0.1 by 0.95/0.05, and multiply
  each manufactured $\phi,r_d$ by independent $\exp[N(0,0.10^2)]$ error,
  clipping actual $\phi$ to $[0,0.4]$ and $r_d$ to $[0.01,0.4]$ while exposing
  only nominal manufactured geometry.
- **Resource target and artifacts:** at most 50 s/arm/seed and 1.5 GiB/track;
  `texture-designs.json`, `mission-supports.jsonl`, `response-oracle.zst`,
  `design-decisions.csv`, `support-certificates.jsonl`, `lifecycle-ledger.csv`.

### TAI-T08 -- Adaptive/self-lubricating interface mission

- **Claim:** `C-1504`.
- **Question:** can a bounded locally adaptive interface reduce total mission
  burden versus robust static and actively switched interfaces after
  transition, inventory, sensing, wear, and failure are charged?
- **Primary unit and units:** one 600-step mission; environment/state [class],
  constituent inventory [normalized mass], transition time [s], load [N],
  speed [m/s], energy [J], wear/delamination [1].
- **Generator:** each seed creates 512 missions. Environment
  $r_t\in\{\text{humid},\text{dry},\text{vacuum},\text{hot}\}$ has four equal
  families. Stationary missions draw one regime uniformly and hold it for 600
  steps. Slow missions use a Markov chain with self-transition
  $U(0.98,0.995)$; ordinary missions use $U(0.90,0.98)$. For either Markov
  family, draw the initial regime uniformly and draw every row's self-transition
  independently; each row's remaining probability is distributed over the other
  three regimes by a seeded Dirichlet(1,1,1). Hostile missions draw dwell
  lengths from $U_{\mathbb Z}\{5,20\}$ and then force a change, selecting the
  next regime from that row's renormalized off-diagonal probabilities. Load
  and speed use coefficient-0.9 reflected log-AR(1) processes over 20--2000 N
  and $10^{-3}$--1 m/s. On each log-support $[l,u]$, initialize with truncated
  $N(m,[(u-l)/6]^2)$, $m=(l+u)/2$, then update
  $\ln X_{t+1}=m+0.9(\ln X_t-m)+\epsilon_t$ with innovation SD
  $[(u-l)/6]\sqrt{1-0.9^2}$, load/speed innovation correlation 0.3, and
  mirror reflection. Draw
  $H\sim U(0.5,12)$ GPa, $k_0\sim\operatorname{logU}(10^{-9},10^{-5})$,
  damage-volume scale $V_D\sim\operatorname{logU}(10^{-10},10^{-5})$ m$^3$,
  and exposed service coefficient limit $\mu_{lim}\sim U(0.25,0.65)$. Three
  surface phases use $p^*(\mathrm{humid})=0$,
  $p^*(\mathrm{dry})=1$, and $p^*(\mathrm{hot})=2$; vacuum uses phase 2 in
  half the worlds and phase 1 in half. Their environment-specific coefficient is

  $$
  \mu_{r,p}=\operatorname{clip}_{[0.02,0.8]}
  [0.06+0.16\mathbf1[p\ne p^*(r)]+\epsilon_{r,p}],
  $$

  $\epsilon_{r,p}\sim N(0,0.015^2)$. The phase wear multiplier is

  $$
  r_{w,r,p}=\operatorname{clip}_{[0.05,3]}
  \{[0.2+1.0\mathbf1(p\ne p^*(r))]\exp(\epsilon^w_{r,p})\},
  $$

  where $\epsilon^w_{r,p}\sim N(0,0.2^2)$.
- **Inventory and transition:** initial constituent inventories
  $z_p\sim U(0.5,1)$. Active and adaptive interfaces start at $w_p=1/3$;
  static/active candidates use the 15 simplex vectors whose components are
  multiples of 0.25. At a
  one-second step,
  requested phase-inventory consumption is
  $\Delta z^{req}_{p,t}=(10^{-7}\,\mathrm{J^{-1}})w_{p,t}\mu_{r_t,p}W_N|v|\Delta t$.
  Actual consumption is
  $\Delta z_{p,t}=\min(z_{p,t},\Delta z^{req}_{p,t})$ and
  $z_{p,t+1}=z_{p,t}-\Delta z_{p,t}$, so shortfall is explicit and negative
  inventory is prohibited. Put $\alpha_{p,t}=1$ when
  $\Delta z^{req}_{p,t}=0$ and otherwise
  $\alpha_{p,t}=\Delta z_{p,t}/\Delta z^{req}_{p,t}$. Depletion therefore
  changes response rather than only the ledger:

  $$
  \mu_t=\sum_pw_{p,t}[\alpha_{p,t}\mu_{r_t,p}+(1-\alpha_{p,t})0.8],\qquad
  r^w_t=\sum_pw_{p,t}[\alpha_{p,t}r_{w,r_t,p}+(1-\alpha_{p,t})3].
  $$

  Friction energy is $E_{f,t}=\mu_tW_N|v|\Delta t$.
  A static interface fixes $w$. An active interface commands
  $w^{cmd}$ on the three-phase simplex and
  follows $w_{t+1}=(1-\kappa_a)w_t+\kappa_aw^{cmd}$,
  $\kappa_a=0.8$, paying $0.2\|w^{cmd}-w_t\|_1$ J and 0.01 J sensing per step.
  The adaptive interface follows

  $$
  w_{t+1}=\operatorname{softmax}[(1-\kappa_p)\ln(w_t+10^{-9})+
  \kappa_ps(r_t)],
  $$

  where $\kappa_p\sim U(0.02,0.25)$. This passive transition is charged
  $0.02\|w_{t+1}-w_t\|_1$ J. Correct phase-score vectors have
  $s_{p^*(r)}(r)=2$ and all other entries zero; in 25% hostile worlds the top
  entry is swapped with one seeded uniformly selected nonoptimal phase at
  manufacture. C pays 0.002 J health-probe energy
  every eighth step. Normalized substrate damage follows

  $$
  D_{t+1}=D_t+\frac{k_0W_N|v|\Delta t}{HV_D}
  \sum_pw_{p,t}[\alpha_{p,t}r_{w,r_t,p}+(1-\alpha_{p,t})3]
  [1+19\mathbf1[z_{p,t+1}<0.05\land w_{p,t}>0.05]]
  +0.02\|w_{t+1}-w_t\|_1^2,\qquad D_0=0.
  $$

  Delamination occurs at $D>1$. A service step is missed if
  $\mu_t>\mu_{lim}$ or delamination has occurred; otherwise it contributes one
  accepted task. These are synthetic operational definitions, not coating
  safety thresholds.
- **Observations:** before the mission, every arm receives eight independent
  coupon measurements for each $(r,p)$ phase property, with 2% lognormal error
  on $\mu_{r,p}$ and 10% on $r_{w,r,p}$, plus one time-zero measurement of each
  initial inventory: positive $z_{p,0}$ is multiplied by
  $\exp[N(0,0.02^2)]$ and a true zero is observed exactly as zero. This
  commissioning observation has no synthetic energy charge and is separately
  logged; true property tables and positive inventories remain hidden.
  All arms observe previous-step friction force with 2% lognormal error. Active
  arms receive environment sensors with 2% class error
  (an error is uniform over the other three classes) and one-step delay. The
  adaptive material is causally exposed to the actual
  environment but receives no digital environment label; all arms observe the
  same surface-fraction probe (independent Gaussian SD 0.02 per component,
  projected back to the simplex) and inventory probe (2% lognormal error) when
  they buy the 0.002 J probe available every eighth step. B and C buy every
  available probe; A does not. Future regimes, true score correctness,
  and damage are hidden.
- **Frozen arms:** A is the pure phase with lowest mean development seed loss,
  breaking ties by phase ID, and holds it for the mission. B and C each
  install before the mission the same robust bypass: among the 15 grid mixtures,
  choose the one minimizing the $Q_{.99}$ loss over 128 posterior property-table
  draws and generator-prior 600-step regime paths, with mixture-index ties. B
  initializes 128 particles by drawing the four mission families uniformly,
  their transition/dwell parameters and phase properties from the written
  priors, current regime uniformly, and damage zero, then weights the eight
  coupon observations by their stated likelihoods. For a
  positive time-zero inventory observation, draw $z_{p,0}\sim U(0.5,1)$ and
  weight by its stated lognormal likelihood; for an exact observed zero, set
  every particle's corresponding $z_{p,0}=0$. It then maintains those particles over current
  regime, transition row, inventories, and
  damage, weights the stated sensor/force/inventory observations, and systematic-
  resamples below effective sample size 64. Every four steps it holds one active
  command for four steps and evaluates all 15 first commands on eight 12-step
  posterior forecast trajectories; later blocks use the smallest command
  minimizing immediate predicted friction+sensing+actuation energy plus
  $10\Delta D/D_{dev}+20$ times predicted missed-service fraction. A first
  command is feasible when seven of eight paths avoid delamination and negative
  inventory. B chooses minimum mean cost with index ties or requests bypass if
  none is feasible. C uses the passive adaptive material and the same installed
  bypass. Its 64-particle digital shadow uses the same initialization but no
  environment-label likelihood; it weights only force and bought fraction/
  inventory probes and systematic-resamples below effective sample size 32.
  For both B and C, mismatch/depletion triggers bypass when either the
  previous force residual exceeds $3s_{F,dev}$ twice consecutively or any
  phase with current $w_p>0.05$ has posterior inventory $Q_{.01}<0.05$. B buys every available
  eighth-step health probe; C buys the already specified probe. A bypass change
  costs 0.5 J, rejects exactly the next two attempted service steps with no
  friction, sliding wear, or constituent consumption while environment and
  load/speed processes still advance, and then remains selected for at least 16 steps.
  At transition completion set $w$ to the installed bypass mixture and suspend
  passive/active updates; on return, resume updates from that current $w$.
  It may clear only after two successive bought probes have force residual at
  most $2s_{F,dev}$ and all inventory lower bounds at least 0.10; switching back
  has the same cost/downtime/minimum-on rule. Here $s_{F,dev}>0$ is the frozen
  RMS one-step force residual. All costs and fallback steps are charged.
- **Mature null:** B has the same phase library, observed environment,
  inventory, robust optimisation, and replaceable static fallback. C cannot
  claim novelty merely from local selection.
- **Primary loss:** with development scales $E_{dev}$ and $D_{dev}$, let
  $N_{miss}$ be the number of the 600 attempted steps that fail the frozen
  service rule,

  $$
  L_{s,a}=\overline{E_{friction+sense+act+transition}/E_{dev}
  +10D/D_{dev}+20\mathbf1[\text{delamination}]
  +20N_{miss}/600},
  $$

  while phase inventory, transition work, friction, sensing, actuation,
  substrate damage, and service are separate outputs. $\delta_8=0.10$.
- **Absolute gates:** zero negative inventory. For each arm, evaluator $O_a$
  uses that arm's physical action authority and the same 12-step rollout/base
  rule but true current state and realized next 12 regimes/load/speed; avoidable
  delamination is at most 2 per 1,000 missions relative to $O_a$. Service-miss non-inferiority to frozen B
  within 0.5 percentage point; every failure and fallback transition remains
  in the denominator. Oracle-unavoidable delamination remains in all losses
  and is reported separately. In stationary single-regime worlds B/C must be
  within 1% loss of the best static phase.
- **Novelty/kill:** $\epsilon_8=0.02$. The frozen C--B axes are sensing-plus-
  actuation energy (required reduction 30%), total energy (10%), minimum
  inventory, final damage, delamination rate, service-miss rate, and fallback-
  time fraction (each no worsening). If
  benefit exists only when passive exposure gets an oracle label or score
  correctness is known, the composition is killed.
- **Transfer:** draw new off-diagonal Dirichlet weights. For slow/ordinary rows,
  set $P'_{rr}=\max(0,2P_{rr}-1)$ and
  $P'_{rj}=P_{rj}(1-P'_{rr})/(1-P_{rr})$ for $j\ne r$; for hostile missions
  replace each drawn dwell $L$ by $\max(2,\lfloor L/2\rfloor)$. Set one seeded constituent's initial
  inventory to zero, and raise environment-sensor error to 10%.
- **Resource target and artifacts:** at most 45 s/arm/seed and 1 GiB/track;
  `adaptive-missions.jsonl`, `phase-properties.json`, `inventory-traces.zst`,
  `surface-state.csv`, `fallback-events.csv`, `mission-ledger.csv`.

### TAI-T09 -- Coupon-to-mission lifecycle transfer

- **Claim:** `C-1505`.
- **Question:** does support-qualified hierarchical transfer prevent
  coupon-only selection errors, and does a project evidence contract add value
  beyond conventional Bayesian experimental design and lifecycle accounting?
- **Primary unit and units:** one 24-design portfolio deployed for $10^6$
  attempted task operations; coupon/field friction and conditional wear
  coefficient [1], wear volume [m$^3$], energy [J],
  maintenance/replacement [count], accepted service [task].
- **Generator:** each seed creates 16 observed component/mission groups, four
  per transfer family, and 16 portfolios per group (256 portfolios). Draw the
  group transform once and share it within the group. Each portfolio has 24 candidate
  interfaces and one incumbent. Candidate $d$ has latent coupon
  $f_d=\ln\mu_d\sim N(-2,0.5^2)$ and
  $w_d=\ln k_{w,d}\sim N(-18,1^2)$ with correlation 0.4, hardness
  $H_d\sim U(0.5,12)$ GPa,
  manufacture energy $E_{mfg,d}\sim\operatorname{logU}(10^5,10^8)$ J,
  maintenance energy $E_{maint,d}\sim\operatorname{logU}(10^3,10^6)$ J,
  end-of-life processing energy
  $E_{eol,d}\sim\operatorname{logU}(10^3,10^6)$ J, and
  replacement threshold $V_{fail,d}\sim\operatorname{logU}(10^{-10},10^{-5})$
  m$^3$. Every arm observes one lognormal measurement of $H$ (log SD 0.02),
  each lifecycle energy (0.05), and $V_{fail}$ (0.10); true values remain
  evaluator-only and those likelihoods are mandatory. Eight coupon replicates
  expose friction/wear with 5%/15% lognormal
  error. Put $m=(-2,-18)^T$, $S=\operatorname{diag}(0.5,1)$, and
  $z_d=S^{-1}([f_d,w_d]^T-m)$. Field log-friction and log-wear are

  $$
  \begin{bmatrix}f^{field}_d\\w^{field}_d\end{bmatrix}
  =m+S(\mathbf b_g+A_gz_d)+\epsilon_d,
  $$

  where group $g$ is observed component/mission class, $\epsilon$ is bivariate
  normal with marginal SDs 0.2/0.5 and correlation 0.3. Four equal families
  use: identity transfer ($\mathbf b=0,A=I$); affine shift (diagonal
  $A_{jj}\sim U(0.6,1.4)$, off-diagonals zero,
  $b_j\sim U(-0.5,0.5)$); mechanism change (diagonal
  $U(0.8,1.2)$, one off-diagonal selected by a stable-hash bit with magnitude
  $U(0.3,0.8)$ and sign selected by the next bit, the other zero, and the same
  shift range); and unsupported class (one coordinate selected by stable hash,
  its diagonal selected equiprobably from $U(0.2,0.4)$ or $U(1.8,3)$ and its
  shift equal to a stable-hash sign times $U(1,2)$; the other diagonal is
  $U(0.8,1.2)$, its shift is $U(-0.5,0.5)$, and off-diagonals are zero).
  Each group also has eight nonselectable calibration interfaces drawn from the
  same coupon prior. Each supplies four coupon and four short-field measurements
  of both endpoints with the same coupon errors and 10%/20% field errors; their
  IDs, group, measurements, and nonselectable status are visible to all arms.
  In half the portfolios, selected by the lowest bit of the portfolio hash,
  candidate $d$'s coupon record is published with
  probability
  $\operatorname{logit}^{-1}(1-1.5z_{f,d}-z_{w,d})$, where $z_f,z_w$ are
  within-portfolio standardized latent log outcomes, using divisor 24, and
  lower is better. Draw one Bernoulli per candidate in candidate-ID order. The
  selection rule and missingness indicator are observed; unreported values are
  not. Only published records are visible in those worlds; all records are
  visible in the other half, whose selection likelihood is exactly one. A
  twenty-fifth incumbent is drawn from the same
  latent friction/wear, hardness, manufacture, maintenance, end-of-life,
  failure-threshold, and group-transfer distributions, but is never
  publication-filtered. Eight
  independent short-field measurements expose its field friction and wear with
  10% lognormal error; its lifecycle parameters and uncertainty are visible to
  every arm.
- **Mission oracle:** exactly 100 operating-opportunity blocks each contain
  10,000 attempted operations, including an opportunity consumed by downtime;
  thus the denominator is always $10^6$. Block load $W_N$ and per-operation distance
  $\ell$ use coefficient-0.8 reflected log-AR(1) processes on log-supports
  $[\ln10,\ln2000]$ and $[\ln10^{-4},\ln0.1]$. Each observed class adds a
  seeded $N(0,0.25^2)$ shift to the support midpoint, clipped one stationary
  SD inside the support; stationary SD is support width/6, innovation SD is
  that value times $\sqrt{1-0.8^2}$, and load/distance innovation correlation
  is 0.25. Initial states use the resulting truncated stationary normals,
  $\ln X_{t+1}=m_g+0.8(\ln X_t-m_g)+\epsilon_t$, and every update is
  mirror-reflected. Pre-generate one 100-opportunity $(W_N,\ell)$ path per true
  portfolio and use it for every candidate and the incumbent. The AR state
  advances once per opportunity even when that design is in downtime; a
  downtime design ignores that opportunity's values. Set $\mu=\exp(f^{field})$,
  $k_w=\exp(w^{field})$, friction input energy
  $E_f=10{,}000\mu W_N\ell$, and wear increment
  $\Delta V=10{,}000k_wW_N\ell/H_d$. Draw exposed synthetic service limit
  $\mu_{service}\sim U(0.3,0.8)$; operations in a block with
  $\mu>\mu_{service}$ are rejected. Initialize $V_w=0$, maintenance flag false,
  replacement count zero, and an empty event queue. Event ordering is fixed:
  (1) at an ordinary opportunity, execute its 10,000 operations and then test
  the threshold; (2) a crossing schedules an event beginning at the next
  opportunity, maintenance if the current unit has not yet been maintained and
  replacement otherwise; (3) maintenance consumes one opportunity, rejects its
  operations, charges $E_{maint}$ at its end, draws the unit's already-seeded
  $r_M\sim U(0.2,0.8)$, and applies
  $V_w\leftarrow\max(0,V_w-r_MV_{fail})$; if $V_w\ge V_{fail}$ remains, a
  replacement is scheduled immediately for the next opportunity; (4)
  replacement consumes two consecutive opportunities, rejects their operations,
  and at the end charges new $E_{mfg}$ and removed-unit $E_{eol}$, resets
  $V_w=0$ and the maintenance flag, and increments replacement count. After four
  replacements every remaining opportunity is unavailable. A downtime
  opportunity accrues no friction work or sliding wear. An event scheduled beyond opportunity 100 is neither
  performed nor charged. Lifecycle energy includes initial and replacement
  manufacture, operation, completed maintenance, every removed unit's end-of-
  life processing, and exactly one final $E_{eol}$ for the installed unit at
  the mission boundary even when an event is pending; it is divided by accepted
  service only. The incumbent is
  always available as fallback and its initial
  manufacture allocation is charged by the same rule as every candidate.
- **Available acquisition:** before selection, an arm may buy at most four
  additional design-specific tests from coupon repeat (same error, $10^3$ J),
  mixed-regime rig
  (10%/20% friction/wear error, $10^5$ J), accelerated wear (15% error plus
  frozen $N(0,0.3^2)$ log bias, $2\times10^5$ J), or one short field pilot
  (15% error on both endpoints, $10^6$ J). Test duration is respectively
  1/8/4/24 h and is reported as opportunity time. Coupon repeat returns both
  coupon endpoints; mixed rig returns both field endpoints; accelerated wear
  returns field wear only and uses one design-specific bias drawn on its first
  accelerated test and reused; pilot returns both field endpoints. Tests are
  observed before the next acquisition. At most two tests may target one design
  and at most one pilot may be bought per portfolio. No test reveals $A_g$ or
  future mission truth.
- **Frozen arms and posterior:** A selects minimum observed mean coupon friction
  among candidates with a published record, with design-ID ties, and uses the
  incumbent if none is published. B and C each own a separate finite posterior;
  they clone the same literal initial particle draws, but no purchased
  observation or particle weight crosses arms. Process the 16 portfolios of
  a group in canonical portfolio-ID order. Initially draw 512 group particles.
  Each contains a transfer-family label, $(A_g,b_g)$ drawn from that family's
  prior, and eight calibration latent coupon pairs drawn from the bivariate
  coupon prior. Weight a group particle by the product of all calibration
  coupon and field likelihoods conditional on its own calibration latents, then
  normalize and systematic-resample to 512 if effective sample size is below
  256.

  For a portfolio, draw 128 latent arrays; every array jointly contains all 24
  candidate and the incumbent coupon pairs and lifecycle fields from their
  written priors. For each candidate, multiply the array weight by its lifecycle-
  measurement likelihood and, in a selection-filtered portfolio, by publication
  probability times coupon likelihood when published or one minus publication
  probability when missing; in an all-visible portfolio use the coupon
  likelihood. The incumbent contributes its lifecycle likelihood and has no
  publication factor; its eight field measurements enter only through the
  transform-coupled likelihood below. Form the exact
  Cartesian joint posterior

  $$
  W_{h,j}\propto w^{group}_h w^{portfolio}_j
  L_{incumbent\ field}(h,j),\qquad h=1{:}512,\ j=1{:}128,
  $$

  normalize all 65,536 weights together, and never multiply separately
  normalized marginals. Each acquisition multiplies every $W_{h,j}$ by that
  test's likelihood. When joint effective sample size falls below 32,768,
  systematic-resample exactly 65,536 joint index pairs and reset their weights
  uniformly; duplicated pairs remain distinct. After a portfolio's acquisition
  and final disposition, sum its current joint weights by transform instance and
  systematic-resample exactly 512 transform particles for the next portfolio,
  discarding that portfolio's latents. Thus prior portfolios' purchased field
  evidence updates the shared group transform causally, while later portfolios
  cannot update earlier decisions.

  For final scoring, systematic-resample 64 joint transform/portfolio pairs.
  Scenario $r$ generates one common 100-opportunity load/distance path with
  literal seed `TAI-T09|group|portfolio|scenario|r`; every design and the
  incumbent use that path, with only their sampled properties/events differing.
  Posterior 99% intervals are its
  $Q_{.005}$--$Q_{.995}$. A design is service-feasible only if at least 63 of 64
  scenarios have $S_{acc}\ge0.99\times10^6$; B/C choose the feasible minimum
  $Q_{.99}$ lifecycle energy per accepted task, with design-ID ties, or the
  incumbent if none is feasible. Let $p_U$ be posterior weight on the unsupported
  transform family. Values $p_U\ge0.99$ are `unsupported`, values
  $0.01<p_U<0.99$ are `ambiguous`, and both dispositions abstain to the
  incumbent; only $p_U\le0.01$ permits candidate deployment.
- **Frozen acquisition policies:** B considers the current three lowest robust-
  score designs (including the incumbent when in the top three). For each
  eligible design/test pair it draws eight posterior-predictive fantasy outcomes,
  with literal seed `TAI-T09|group|portfolio|slot|design|test|fantasy`, updates a
  temporary posterior, and estimates expected reduction in normalized final
  lifecycle loss from 32 joint scenarios seeded by the same literal plus
  `|scenario` minus
  $0.1E_{test}/E_{tests,dev}$. It buys the largest strictly positive value,
  breaking ties by lower test energy, design ID, then test order coupon/mixed/
  accelerated/pilot; otherwise it stops, up to four tests. C uses the same
  calculator only on the current winner and runner-up. It targets the one with
  larger posterior contribution to variance of their score difference (runner-
  up on ties), then chooses coupon if either endpoint is missing, mixed rig if
  posterior unsupported-transform probability lies in $[0.01,0.99]$,
  accelerated wear if wear contributes more than half that score-difference
  variance, and pilot otherwise. It buys only if the eight-fantasy value is
  positive. C stops when the same winner has posterior selection probability at
  least 0.99 and unsupported-transform probability is outside
  $[0.01,0.99]$, or after four tests. The evaluator labels the true dominant
  dependency by separately replacing, with truth, coupon latents, group
  transform, field wear, or all field/lifecycle fields and choosing the
  replacement that most reduces absolute winner--runner-up score-difference
  error (listed order breaks ties); a bought test of a different type is one
  evidence-dependency error.
- **Mature null:** B already has hierarchical transfer, selection correction,
  Bayesian experimental design, lifecycle accounting, abstention/fallback, and
  uncertainty. C cannot withhold provenance fields or tests from B.
- **Primary loss:** for chosen policy $a$, use oracle lifecycle energy per
  accepted task $e^*_{life,a}$, portfolio oracle optimum $e^*_{min}$, acquired
  test energy $E_{tests,a}$, and positive development-frozen scale
  $E_{tests,dev}$:

  $$
  L_{s,a}=\overline{\min[50,(e^*_{life,a}-e^*_{min})/
  (e^*_{min}+10^{-9})]+20\mathbf1[S_{acc}<0.99\times10^6]
  +0.1E_{tests,a}/E_{tests,dev}}.
  $$

  Choosing the incumbent is scored normally, not as zero-loss abstention.
  Invalid/zero accepted service is loss 100. $\delta_9=0.10$.
- **Absolute gates:** B/C 99% posterior intervals for selected field friction,
  wear, and lifecycle energy require at least 0.98 coverage in supported
  classes; unsupported-class detection/abstention recall at least 0.90 and
  false unsupported rate at most 0.05; accepted service at least 0.99 million
  in 99% of portfolios where an evaluator-only design oracle can meet that
  threshold. Oracle-infeasible portfolios remain in loss and are reported
  separately. Coupon, operation, maintenance, manufacture, replacement, and
  end-of-life energy remain separate. Publication/missingness indicators may
  not be silently imputed as observations.
- **Novelty/kill:** $\epsilon_9=0.02$. The frozen C--B axes are acquired-test
  energy (required reduction 15%); posterior-compute time (upper 99% log-ratio
  bound at most $\ln1.05$); interval noncoverage, unsupported abstention miss
  rate, false-unsupported rate, accepted-service shortfall, and lifecycle energy
  (each no worsening); and evidence-dependency error rate (absolute margin
  0.0005). Failure of any axis kills the project composition.
- **Transfer:** hold out one new component-group draw until transfer, replace
  coupon/field residual correlation 0.3 by -0.3 in its mechanism-changing
  family, make maintenance consume two operating opportunities and replacement
  four, and replace each unit's maintenance restoration by
  $r_M^{transfer}=0.5r_M$. There are still exactly 100 operating opportunities,
  no inert idle-calendar blocks, and $10^6$ attempted operations; common mission
  paths, event order, and all completed manufacture/maintenance allocations use
  the frozen transfer rules.
- **Resource target and artifacts:** at most 60 s/arm/seed and 2 GiB/track;
  `portfolios.jsonl`, `coupon-records.parquet`, `selection-records.jsonl`,
  `test-catalog.json`, `acquisition-decisions.csv`, `field-missions.zst`,
  `lifecycle-ledger.csv`, `support-dispositions.csv`.

## Implementation and artifact boundary

The fixture is protocol-complete but not workstation-executable. No runner,
reference-workstation manifest, seed pack, raw output, result table, effect
estimate, measured workstation energy, or conformity record is created by this
integration. Future implementation must preserve the frozen IDs and version
any scientific change rather than silently editing the contract.

## Harness status

Blocked by: not-built.

The Common CPU-only falsification contract section fixes a deterministic JavaScript runtime, the PCG64-DXSM generator and binary64 reference arithmetic, so a harness can be built on the workstation as specified; no generator, runner or tests exist yet.
