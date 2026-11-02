# Fluid dynamics and turbulence: primary-source audit

- **Audit date:** 2026-08-05
- **Scope:** multiscale cascades, intermittency, coherent structures,
  closure and model-form error, reduced-order modelling, adaptive refinement,
  data assimilation and observability, sensor placement, flow control,
  transport and mixing, transition and hysteresis, rare extremes, measurement
  uncertainty, and complete energy accounting
- **Evidence rule:** exact relations retain their stated assumptions;
  simulations support only their equations, discretization, forcing, boundary
  conditions, resolution, and sampled regime; experiments support only their
  apparatus, measurement operator, uncertainty, and sampled regime.
- **Promotion state:** audit-local `FLUID-` claims only. This file changes no
  central claim, principle, experiment candidate, or bibliography.

## Executive finding

Fluid dynamics offers an unusually severe test of any proposed efficient
learning system because the governing equations can be known while useful
prediction remains limited by unresolved scales, uncertain boundaries,
partial observation, regime change, and chaotic amplification. The transferable
content is therefore not “copy turbulence.” It is a set of contracts for
deciding what may be compressed, where resolution must be spent, which state is
observable, when a closure is outside support, and whether a controller saves
net energy after the entire loop is charged.

The strongest findings are:

1. A cascade is a signed transfer across a declared scale and invariant, not a
   synonym for hierarchy. Three-dimensional homogeneous turbulence, rotating
   flow, and two-dimensional flow need not transfer kinetic energy in the same
   direction.
2. Low-order averages can coexist with spatially and temporally concentrated
   transfer and dissipation. Mean-square accuracy therefore does not establish
   tail, flux, or event fidelity.
3. Coherent structures are useful conditional descriptions, but their identity
   depends on the observable, filter, threshold, frame, and extraction method.
   A named vortex is not automatically a persistent computational module.
4. Every coarse model contains a closure decision. A residual learned from one
   solver or flow family can absorb discretization error, boundary error, and
   parameter compensation rather than portable physics.
5. Reduced-order coordinates are objective-dependent. Energy-optimal POD,
   input-output-balanced modes, DMD modes, resolvent modes, and coordinates
   optimized for a rare event or control target answer different questions.
6. Adaptive mesh, adaptive sensing, and adaptive compute share a residual-
   allocation pattern, but refinement is useful only when the indicator tracks
   the declared quantity of interest and the cost of refinement, transfer,
   synchronization, and rebalancing is included.
7. Data assimilation does not manufacture information. Its reconstruction is
   conditional on the forward model, observation operator, error covariances,
   priors, boundary conditions, sampling support, and actual observability.
8. Flow control must be scored on closed-loop task value and net lifecycle
   energy. Drag reduction without actuation, sensing, computation, conversion,
   and installation power is not an efficiency result.
9. Mixing is not one scalar. Stretching, scalar-variance decay, multiscale
   homogenization, molecular irreversibility, reaction completion, and
   residence-time distribution can rank the same controller differently.
10. Transition and extremes require path and tail tests. A model that predicts
    the mean turbulent state may miss finite-amplitude triggering, coexistence,
    puff decay or splitting, hysteresis, and extreme-load return periods.

After deduplication, these findings refine existing [P-001 selective
allocation](../principle-registry.md#p-001--selective-allocation), [P-002 local
resolution](../principle-registry.md#p-002--local-autonomy-with-exception-escalation),
[P-006 slower feedback](../principle-registry.md#p-006--homeostatic-negative-feedback),
[P-007 prediction-error allocation](../principle-registry.md#p-007--prediction-error-allocation),
[P-008 compartmentalization](../principle-registry.md#p-008--compartmentalized-interaction),
[P-009 maintenance](../principle-registry.md#p-009--maintenance-plane),
[P-010 structural offloading](../principle-registry.md#p-010--structural-offloading-and-co-design),
and [P-012 lifetime-matched memory](../principle-registry.md#p-012--memory-matched-to-information-lifetime).
The residuals are already testable through Candidates
[002](../../experiments/candidates/002-multiscale-context-broadcast.md),
[003](../../experiments/candidates/003-recovery-dynamics-fragility.md),
[006](../../experiments/candidates/006-reversible-physical-skill.md),
[007](../../experiments/candidates/007-endogenous-observation-surveillance.md),
[012](../../experiments/candidates/012-latency-qualified-authority.md), and
[014](../../experiments/candidates/014-versioned-observation-contract.md).
No new principle or candidate is warranted.

## Outcome firewall

| Outcome | Operational question | Required measurement | Invalid substitution |
| --- | --- | --- | --- |
| field prediction | is the declared state or quantity of interest predicted at the declared support and horizon? | variable, spatial support, time support, norm, horizon, uncertainty | one visually plausible snapshot |
| cascade fidelity | is the signed scale-to-scale flux of the declared invariant correct? | filter or spectral definition, flux versus scale, forcing and dissipation ranges | a `-5/3`-looking spectrum alone |
| intermittency fidelity | are high-order and tail statistics reproduced? | structure functions, dissipation/enstrophy tails, confidence intervals, effective sample size | matching mean and variance |
| coherent-event fidelity | are event occurrence, geometry, lifetime, transport, and conditional effects reproduced? | detector, threshold, reference frame, lifetime and null detector | attractive vortical images |
| closure improvement | does a closure reduce out-of-support quantity-of-interest error without violating constraints? | solver, grid, closure location, support distance, invariants, uncertainty | lower training residual |
| reduced-order fidelity | does the reduced state preserve the target forecast, control, or tail observable? | basis, rank, projection, closure, horizon, stability, target metric | retained snapshot energy |
| refinement efficiency | does adaptive resolution reach an error target with less total work? | estimator, reference solution, cell-time updates, transfers, regrids, wall time, joules | fewer cells at one time |
| state estimation | is latent state identified from the actual observation process? | observation operator, error covariance, prior, boundaries, observability, posterior calibration | interpolation of held-out pixels from the same trajectory |
| sensor efficiency | does placement retain estimation or decision value under regime and hardware constraints? | number, bandwidth, latency, calibration, failure, intrusion, regime shift | optimized locations on the training basis |
| control benefit | does closed-loop action improve task value while respecting stability and resource limits? | plant, sensor, controller, actuator, delay, authority, disturbances, net power | uncontrolled-versus-controlled drag only |
| mixing | is the declared material or scalar objective improved? | initial condition, diffusivity, scalar support, mix norm, scalar dissipation, residence time | particle stretching or visual blending alone |
| transition warning | does a signal predict a declared transition class at useful lead time? | ramp direction, perturbation history, event definition, censoring, false alarms | one critical Reynolds number |
| extreme prediction | are exceedance probabilities or return periods calibrated? | threshold, block/window, tail estimator, uncertainty, test duration | maximum seen in a short run |
| measurement validity | is the measured quantity traceable through the instrument response and uncertainty model? | calibration, transfer function, spatial/time averaging, synchronization, covariance | nominal sensor resolution |
| energy efficiency | is useful output improved per complete lifecycle resource boundary? | facility, sensing, actuation, compute, data movement, storage, embodied and maintenance rows | accelerator board power or actuator power omitted |

## Physical and numerical contract

### Governing state

For an incompressible Newtonian fluid,

$$
\frac{\partial \mathbf u}{\partial t}
+(\mathbf u\cdot\nabla)\mathbf u
=-\frac{1}{\rho}\nabla p+\nu\nabla^2\mathbf u+\mathbf f,
\qquad \nabla\cdot\mathbf u=0.
$$

Here $\mathbf u$ is velocity in $\mathrm{m\,s^{-1}}$, $t$ is time in
$\mathrm{s}$, $p$ is pressure in $\mathrm{Pa}$, $\rho$ is density in
$\mathrm{kg\,m^{-3}}$, $\nu$ is kinematic viscosity in
$\mathrm{m^2\,s^{-1}}$, and $\mathbf f$ is body acceleration in
$\mathrm{m\,s^{-2}}$. Geometry, initial state, boundary conditions, forcing,
and constitutive assumptions are part of the model and must be versioned with
the equation.

The Reynolds number

$$
Re=\frac{UL}{\nu}
$$

is dimensionless, with reference speed $U$ in $\mathrm{m\,s^{-1}}$ and length
$L$ in $\mathrm{m}$. A reported $Re$ is incomplete unless the chosen $U$ and
$L$ are defined; pipe diameter, boundary-layer momentum thickness, channel
half-height, and Taylor microscale yield different quantities.

For velocity fluctuation $u_i'=u_i-\langle u_i\rangle$, the turbulent kinetic
energy per unit mass and mean viscous dissipation rate are

$$
k=\frac12\langle u_i'u_i'\rangle,
\qquad
\varepsilon=2\nu\langle S_{ij}S_{ij}\rangle,
\qquad
S_{ij}=\frac12\left(\frac{\partial u_i'}{\partial x_j}
+\frac{\partial u_j'}{\partial x_i}\right).
$$

$k$ has units $\mathrm{m^2\,s^{-2}}$, $S_{ij}$ has units $\mathrm{s^{-1}}$,
and $\varepsilon$ has units $\mathrm{m^2\,s^{-3}}$. The averaging operator
$\langle\cdot\rangle$ must identify ensemble, time, homogeneous direction, or
conditional support.

### Scale transfer and intermittency

For a low-pass filter of width $\ell$,

$$
\tau_{ij}^{(\ell)}=\widetilde{u_i u_j}-\tilde u_i\tilde u_j,
\qquad
\Pi_\ell=-\tau_{ij}^{(\ell)}\widetilde S_{ij}.
$$

$\tau_{ij}^{(\ell)}$ has units $\mathrm{m^2\,s^{-2}}$ and local interscale
transfer $\Pi_\ell$ has units $\mathrm{m^2\,s^{-3}}$. Positive and negative
events can coexist even when the mean flux has one sign. Filter kernel,
boundary treatment, and whether transfer is pointwise, spectral, or integrated
must be declared.

The longitudinal increment and $p$th-order structure function are

$$
\delta u_L(\mathbf x,\mathbf r)
=\bigl[\mathbf u(\mathbf x+\mathbf r)-\mathbf u(\mathbf x)\bigr]
\cdot\frac{\mathbf r}{r},
\qquad
S_p(r)=\left\langle |\delta u_L|^p\right\rangle.
$$

$r=\|\mathbf r\|$ is metres and $S_p$ has units
$(\mathrm{m\,s^{-1}})^p$. Under stationary, homogeneous, isotropic,
incompressible, high-Reynolds-number inertial-range conditions, the signed
third-order relation is

$$
\left\langle(\delta u_L)^3\right\rangle
=-\frac45\varepsilon r.
$$

This exact conditional law is not a license to assume universal self-similarity
of every order, finite Reynolds number, geometry, or flow class. If
$S_p(r)\propto r^{\zeta_p}$, departures of $\zeta_p$ from $p/3$ encode
intermittency only after the scaling range and uncertainty are established.

### Closure and reduced state

Reynolds averaging introduces the stress

$$
R_{ij}=\langle u_i'u_j'\rangle,
$$

with units $\mathrm{m^2\,s^{-2}}$. Its transport depends on higher-order
statistics, creating a closure problem. Filtering creates the analogous
subfilter stress $\tau_{ij}^{(\ell)}$. A learned map for either stress is a
closure hypothesis, not a direct consequence of the governing equation.

A rank-$r$ reduced representation is

$$
\mathbf u(\mathbf x,t)\approx\bar{\mathbf u}(\mathbf x)
+\sum_{j=1}^{r}a_j(t)\boldsymbol\phi_j(\mathbf x)+\mathbf e_r(\mathbf x,t),
$$

where $a_j$ has the units implied by basis normalization,
$\boldsymbol\phi_j$ is a spatial mode, and $\mathbf e_r$ is truncation error in
$\mathrm{m\,s^{-1}}$. The basis objective, inner product, training support,
closure for discarded modes, and stability horizon are inseparable from $r$.

### Observation and assimilation

Use the versioned state-observation system

$$
\mathbf x_{k+1}=\mathcal M_k(\mathbf x_k,\boldsymbol\theta,
\mathbf b_k)+\boldsymbol\xi_k,
\qquad
\mathbf y_k=\mathcal H_k(\mathbf x_k)+\boldsymbol\eta_k.
$$

$\mathbf x_k$ is the discretized physical state, $\boldsymbol\theta$ contains
model parameters, $\mathbf b_k$ contains boundary and forcing inputs,
$\mathbf y_k$ is the measured vector in its literal units,
$\mathcal M_k$ is the numerical evolution operator, $\mathcal H_k$ includes
sensor support and response, and $\boldsymbol\xi_k,\boldsymbol\eta_k$ are model
and observation errors with declared covariance and correlation. Synthetic
tests must not give an estimator the same model, grid, forcing, and boundary
truth used to generate observations without labeling the inverse crime.

For a linear time-varying approximation
$\mathbf x_{k+1}=A_k\mathbf x_k$, $\mathbf y_k=C_k\mathbf x_k$, the finite-
horizon observability Gramian is

$$
W_o(N)=\sum_{k=0}^{N}
\Phi(k,0)^\mathsf T C_k^\mathsf T R_k^{-1}C_k\Phi(k,0),
$$

where $\Phi(k,0)=A_{k-1}\cdots A_0$, $R_k$ is observation-error covariance,
and $W_o$ is dimensionless only after states and measurements are consistently
scaled. Its rank and conditioning are local to the model, trajectory, sensors,
noise model, and horizon; a nonlinear turbulent state does not inherit global
observability from one linearization.

### Transport and mixing

A passive scalar $c$ obeys

$$
\frac{\partial c}{\partial t}+\mathbf u\cdot\nabla c
=\kappa\nabla^2c+s_c,
$$

where $c$ is concentration in $\mathrm{kg\,m^{-3}}$ (or a declared
dimensionless fraction), $\kappa$ is molecular diffusivity in
$\mathrm{m^2\,s^{-1}}$, and $s_c$ has units $\mathrm{kg\,m^{-3}\,s^{-1}}$.
With variance $V_c=\frac12\langle(c-\langle c\rangle)^2\rangle$, scalar
dissipation is

$$
\chi=2\kappa\langle|\nabla c|^2\rangle,
$$

with units $\mathrm{kg^2\,m^{-6}\,s^{-1}}$ for dimensional concentration.
Advection can create fine filaments without changing the scalar distribution
under a perfectly reversible, nondiffusive map; molecular diffusion or reaction
provides the irreversible step.

### Measurement uncertainty

For derived quantity $q=g(\mathbf z)$ with input covariance $\Sigma_z$, a
first-order combined standard uncertainty is

$$
u_c^2(q)=J_g\Sigma_zJ_g^\mathsf T,
\qquad
J_g=\left.\frac{\partial g}{\partial\mathbf z}\right|_{\hat{\mathbf z}}.
$$

$u_c(q)$ has the same unit as $q$. Correlated calibration, positioning,
timing, temperature, and processing errors belong in $\Sigma_z$; independent
root-sum-of-squares is invalid when correlations are material. For spectra and
tails, uncertainty also includes transfer-function attenuation, finite record
length, windowing, censoring, and effective rather than nominal sample count.

### Complete resource and energy boundary

For experiment or deployed controller $m$, record

$$
\mathbf K_m=(N_{\mathrm{cell\,step}},N_{\mathrm{sample}},B_{\mathrm{moved}},
T_{\mathrm{wall}},M_{\mathrm{peak}},E_{\mathrm{facility}},E_{\mathrm{sense}},
E_{\mathrm{act}},E_{\mathrm{compute}},E_{\mathrm{network}},E_{\mathrm{store}},
E_{\mathrm{embodied}},H_{\mathrm{human}}).
$$

Counts are dimensionless, bytes use $\mathrm{B}$, wall time uses $\mathrm{s}$,
memory uses $\mathrm{B}$, every $E$ uses joules, and human effort remains
person-hours unless an explicit conversion is justified. `Cell-step` counts
all mesh levels and rejected or repeated steps.

For a flow-control interval $[0,T]$, net operational energy benefit is

$$
E_{\mathrm{net}}=\int_0^T
\left(P_{\mathrm{base}}-P_{\mathrm{controlled}}-P_{\mathrm{act}}
-P_{\mathrm{sense}}-P_{\mathrm{compute}}-P_{\mathrm{aux}}\right)dt,
$$

where every $P$ is watts and $E_{\mathrm{net}}$ is joules. Pump or propulsion
efficiency, power conversion, cooling, communication, calibration, and standby
must be placed either in the named rows or $P_{\mathrm{aux}}$. Embodied energy
and maintenance are reported separately and amortized only over a declared
service life and duty cycle.

## Conventional null stack

Before attributing value to a fluid-inspired architecture, compare it at equal
information and resource budgets against:

- conservative finite-volume, finite-difference, or spectral DNS at a verified
  resolution where feasible;
- established RANS, LES, hybrid RANS–LES, dynamic subgrid, wall-model, and
  uncertainty-perturbed closure ensembles;
- uniform refinement, Richardson extrapolation, residual AMR, feature AMR, and
  adjoint or goal-oriented refinement;
- POD/Galerkin, balanced POD, DMD, resolvent, reduced-basis, operator inference,
  and sparse-regression reduced models with explicit stabilization or closure;
- Kalman and ensemble Kalman filters, 3D/4D-Var, smoothers, particle or hybrid
  filters, and moving-horizon estimation;
- QR-pivot, D-optimal, Fisher-information, observability-Gramian, and greedy
  sensor placement with physical feasibility constraints;
- linear-quadratic, $H_\infty$, model-predictive, adjoint-optimized,
  opposition, open-loop periodic, and extremum-seeking flow control;
- finite-volume neural operators, Fourier neural operators, DeepONet, graph
  surrogates, PINNs, and autoregressive emulators trained on the same fields;
- direct Monte Carlo, extreme-value models, adaptive multilevel splitting,
  genealogical/importance samplers, and precursor classifiers for rare events;
- fixed schedules, residual thresholds, uncertainty thresholds, and simple
  proportional resource allocation; and
- a no-control/no-refinement/no-assimilation baseline with identical sensors,
  data products, stopping rules, and physical facility.

Vocabulary such as vortex, cascade, intermittency, attractor, eddy, or
criticality supplies no baseline credit.

## Mechanism cards

### 1. Signed, invariant-specific multiscale transfer

| Field | Audit record |
| --- | --- |
| physical observation | energy injected at one scale can be transferred through nonlinear interactions to other scales; the mean direction and coexisting backscatter depend on dimension, rotation, stratification, forcing, boundaries, and invariant |
| evidence | the conditional four-fifths relation is exact under its assumptions; high-resolution DNS and experiments resolve forward, inverse, and dual cascades ([Antonia et al.](https://doi.org/10.1103/PhysRevFluids.4.084602); [Boffetta and Musacchio](https://doi.org/10.1103/PhysRevE.82.016307); [Campagne et al.](https://doi.org/10.1063/1.4904957); [Cardesa et al.](https://doi.org/10.1126/science.aan7933)) |
| proposed translation | make every cross-scale message carry the conserved or budgeted quantity, sign, source level, destination level, and residual rather than treating “multiscale” as generic broadcast |
| efficiency mechanism | coarse levels handle predictable transport; escalation follows measured inter-level flux or unresolved residual |
| strongest null | multigrid, wavelets, feature pyramids, hierarchical attention, skip connections, and ordinary conservation-aware routing |
| failure mode | hard-coding forward coarse-to-fine flow when the relevant information or corrective influence should move upscale |
| measurable prediction | a flux-qualified router should beat equal-capacity hierarchical attention only under distribution shifts that change scale interaction; otherwise it should tie and be rejected |
| deduplication | P-001, P-007, P-008, P-011; Candidate 002. No new primitive. |

### 2. Intermittent allocation and tail fidelity

| Field | Audit record |
| --- | --- |
| physical observation | transfer, vorticity, and dissipation occupy concentrated events whose high-order statistics depart from simple self-similar scaling |
| evidence | anomalous high-order scaling and intense dissipation structures appear in experiments and high-resolution simulations ([She and Lévêque](https://doi.org/10.1103/PhysRevLett.72.336); [Debue et al.](https://doi.org/10.1103/PhysRevE.97.053101); [Ishihara et al.](https://doi.org/10.1103/PhysRevFluids.1.082403)) |
| proposed translation | allocate fine compute from calibrated local risk and residual, but retain a protected exploration budget for quiet regions |
| efficiency mechanism | expensive processing follows sparse consequential events rather than average activity |
| strongest null | top-$k$ routing, focal loss, prioritized replay, uncertainty sampling, adaptive time stepping, and residual AMR |
| failure mode | a threshold trained on typical events suppresses the precursor or inflates false alarms under Reynolds-number or forcing shift |
| measurable prediction | gains must persist on flux, high-order, and exceedance metrics at equal false-alarm and compute budgets, not only MSE |
| deduplication | P-001 and P-007; Candidates 003 and 007. No new primitive. |

### 3. Coherent structures as conditional coordinates

| Field | Audit record |
| --- | --- |
| physical observation | wall turbulence and transitional flows contain recurring organized motions, while exact travelling waves and other invariant solutions can organize portions of state space |
| evidence | PIV identifies packets conditional on the measurement plane and detector; numerical continuation identifies unstable travelling waves; non-normal linear dynamics can produce large transient amplification ([Adrian et al.](https://doi.org/10.1017/S0022112000001580); [Wedin and Kerswell](https://doi.org/10.1017/S0022112004009346); [Butler and Farrell](https://doi.org/10.1063/1.858386)) |
| proposed translation | use event-conditioned coordinates with detector version, confidence, lifetime, and transport effect; do not reify a thresholded pattern as an autonomous module |
| efficiency mechanism | condition estimation or control on a small active subspace when that subspace predicts the target |
| strongest null | POD/SPOD, DMD, resolvent analysis, matched filters, clustering, finite-state regime models, and ordinary sparse latent variables |
| failure mode | detector-dependent “objects” change identity with filter, frame, threshold, or observation plane |
| measurable prediction | a structure-conditioned policy must transfer across detector perturbations and improve target prediction beyond a rank-matched latent model |
| deduplication | P-001, P-008, P-010, P-012. No new primitive. |

### 4. Closure as an auditable information loss

| Field | Audit record |
| --- | --- |
| physical observation | averaging or filtering moves unresolved correlations into new terms whose dynamics are not determined by the resolved state alone |
| evidence | dynamic LES estimates a coefficient from two filter levels; RANS uncertainty methods perturb admissible stress states; field inversion and invariant neural networks learn scoped corrections ([Germano et al.](https://doi.org/10.1063/1.857955); [Iaccarino et al.](https://doi.org/10.1103/PhysRevFluids.2.024605); [Parish and Duraisamy](https://doi.org/10.1016/j.jcp.2015.11.012); [Ling et al.](https://doi.org/10.1017/jfm.2016.615)) |
| proposed translation | attach every compressed interface to its filter/projection, discarded state, support distance, conservation constraints, discrepancy model, and invalidation tests |
| efficiency mechanism | compute a cheap resolved path while estimating only the unresolved influence needed by the target |
| strongest null | established closures, ensembles, Bayesian discrepancy, constrained regression, conservative neural operators, and solver refinement |
| failure mode | learned correction cancels one grid's truncation or boundary error and fails when either changes |
| measurable prediction | improvement must survive solver, mesh, geometry, forcing, and Reynolds-number holdouts with calibrated uncertainty and no hidden truth fields |
| deduplication | P-003, P-007, P-008, P-012; Candidates 014 and 017. No new primitive. |

### 5. Objective-qualified reduced-order state

| Field | Audit record |
| --- | --- |
| physical observation | a low-dimensional projection can capture snapshot energy while omitting weak-energy directions that dominate input-output gain, transition, control, or rare events |
| evidence | balanced POD targets controllability and observability, DMD fits an inter-snapshot evolution, and stochastic closure can represent truncation uncertainty ([Rowley](https://doi.org/10.1142/S0218127405012429); [Schmid](https://doi.org/10.1017/S0022112010001217); [Resseguier et al.](https://doi.org/10.1137/19M1354819)) |
| proposed translation | maintain several small target-qualified views rather than one supposedly universal latent state; promote a coordinate only after intervention and horizon tests |
| efficiency mechanism | retain state directions by decision value, not raw variance alone |
| strongest null | POD, balanced truncation, DMD, resolvent, autoencoders, SINDy, operator inference, and full-order receding-horizon correction |
| failure mode | stable reconstruction but unstable rollout; good typical forecast but missing transition seed or extreme precursor |
| measurable prediction | target-qualified bases should beat energy-ranked POD at matched rank only on their preregistered target and must disclose losses elsewhere |
| deduplication | P-001, P-007, P-010, P-012; Candidates 003 and 018. No new primitive. |

### 6. Error- and goal-driven adaptive refinement

| Field | Audit record |
| --- | --- |
| physical observation | local grids can be created and removed from error estimates, with smaller time steps on finer levels; conservation and grid-interface handling are part of the algorithm |
| evidence | Berger–Oliger refinement uses Richardson-type truncation estimates; Berger–Colella supplies conservative shock-hydrodynamics machinery; turbulent-flow studies show savings for scoped estimators ([Berger and Oliger](https://doi.org/10.1016/0021-9991(84)90073-1); [Berger and Colella](https://doi.org/10.1016/0021-9991(89)90035-1); [Hay and Visonneau](https://doi.org/10.1016/j.crme.2004.09.014)) |
| proposed translation | route tokens, experts, memory, or precision using an estimator tied to a declared downstream loss and include migration and synchronization |
| efficiency mechanism | spend resolution only where its marginal reduction of target error exceeds its full marginal cost |
| strongest null | fixed multiresolution, adaptive time stepping, residual thresholding, uncertainty gating, and adjoint-weighted refinement |
| failure mode | feature magnitude attracts refinement while the quantity-of-interest error originates elsewhere; moving refinement causes thrashing |
| measurable prediction | adaptive compute must reach the same target-error confidence interval with lower cell/token-step, bytes moved, wall time, and joules than uniform and goal-oriented nulls |
| deduplication | P-001, P-002, P-007, P-009; Candidates 002 and 014. No new primitive. |

### 7. Assimilation under explicit observability

| Field | Audit record |
| --- | --- |
| physical observation | sequential and variational assimilation combine a dynamical prior with incomplete noisy observations; reconstruction quality depends on error models, sampling, and unstable directions |
| evidence | EnKF propagates sample forecast statistics; 4D-Var uses forward and adjoint integrations; turbulence reconstruction can succeed under scoped spatial and temporal support but degrades beyond it ([Evensen](https://doi.org/10.1029/94JC00572); [Talagrand and Courtier](https://doi.org/10.1002/qj.49711347812); [Wang et al.](https://doi.org/10.1063/5.0091391); [Zhang and Duraisamy](https://doi.org/10.1016/j.ijheatfluidflow.2022.109073)) |
| proposed translation | carry model version, observation support, latency, covariance, innovation, posterior calibration, and unobservable directions with every inferred state |
| efficiency mechanism | sparse measurements correct predictable evolution instead of repeatedly sensing the full field |
| strongest null | Kalman/EnKF, 4D-Var, smoothers, PINNs, moving-horizon estimation, reservoir observers, and direct interpolation |
| failure mode | synthetic observations share the estimator's model and boundaries; posterior confidence narrows despite structural error |
| measurable prediction | claimed recovery must survive independent truth generation, unknown boundary perturbations, sensor latency, missing intervals, and covariance misspecification |
| deduplication | P-003, P-007, P-012; Candidates 007 and 014. No new primitive. |

### 8. Task-, regime-, and hardware-qualified sensor placement

| Field | Audit record |
| --- | --- |
| physical observation | a small set of sensors can reconstruct or classify fields when the target lies near a learned low-dimensional subspace, but optimality depends on basis, noise, target, and feasible locations |
| evidence | sparse placement via pivoted factorizations exploits known patterns; classification may require fewer measurements than reconstruction; recent RANS assimilation places sensors from model uncertainty ([Manohar et al.](https://doi.org/10.1109/MCS.2018.2810460); [Brunton et al.](https://doi.org/10.1137/15M1036713); [Bidar et al.](https://doi.org/10.1063/5.0182080)) |
| proposed translation | choose observations jointly with task, support, latency, calibration, failure, privacy or physical feasibility, and regime-shift tests |
| efficiency mechanism | observe high-information coordinates instead of uniform state |
| strongest null | random/uniform placement, QR pivoting, D-optimal design, leverage scores, mutual information, observability Gramians, and active sensing |
| failure mode | a training-basis sensor layout is blind to a new mode; collocated sensors share drift; probes perturb the flow |
| measurable prediction | placement must retain calibrated task value under geometry, forcing, sensor dropout, drift, and basis shift at matched bandwidth and maintenance |
| deduplication | P-001 and P-007; Candidates 007 and 014. No new primitive. |

### 9. Closed-loop flow control with net-energy accounting

| Field | Audit record |
| --- | --- |
| physical observation | sensing and actuation can alter near-wall momentum transport and drag, but gross drag reduction and net energy saving differ sharply |
| evidence | opposition control demonstrated drag reduction in DNS; the FIK identity decomposes drag contributions; spanwise wall oscillation studies explicitly found much smaller net savings than gross drag reduction ([Choi et al.](https://doi.org/10.1017/S0022112094000431); [Fukagata et al.](https://doi.org/10.1063/1.1516779); [Quadrio and Ricco](https://doi.org/10.1017/S0022112004001855)) |
| proposed translation | expose a latency-qualified authority envelope and a live energy ledger for sensing, inference, actuation, fallback, and useful output |
| efficiency mechanism | act only on target-relevant structures or predicted events when expected benefit exceeds full action cost |
| strongest null | open-loop periodic forcing, LQR/$H_\infty$, MPC, opposition control, adjoint optimization, extremum seeking, and passive geometry |
| failure mode | delay or sensor bias turns attenuation into amplification; controller saves pump power but consumes more actuator or compute power |
| measurable prediction | Pareto improvement must survive actuator efficiency, delay, saturation, failures, Reynolds shift, and service-life amortization |
| deduplication | P-002, P-006, P-007, P-009, P-010; Candidates 006 and 012. No new primitive. |

### 10. Stretch–fold–diffuse transport and mixing

| Field | Audit record |
| --- | --- |
| physical observation | advection stretches and folds scalar material, moving variance to fine scales where diffusion acts; unsteady laminar flows can produce chaotic advection without turbulence |
| evidence | Batchelor derived a diffusivity-dependent small-scale range; Aref demonstrated chaotic advection; multiscale mix norms and fixed-action optimal controls distinguish protocols ([Batchelor](https://doi.org/10.1017/S002211205900009X); [Aref](https://doi.org/10.1017/S0022112084001233); [Mathew et al.](https://doi.org/10.1016/j.physd.2005.07.017); [Mathew et al.](https://doi.org/10.1017/S0022112007005332)) |
| proposed translation | alternate structure-preserving transport with controlled homogenization or exchange, measuring both coverage and irreversible task completion |
| efficiency mechanism | deterministic rearrangement exposes interfaces; expensive diffusion, communication, or reconciliation acts at shortened distances |
| strongest null | shuffling, all-to-all attention, diffusion/message passing, expander mixing, random rewiring, and optimal transport schedules |
| failure mode | apparent mixing only creates unresolved filaments; the metric ignores segregation at the task's operational scale |
| measurable prediction | the proposed schedule must beat random and optimized conventional mixers at equal action energy on multiscale norm, irreversible completion, residence time, and tail contamination |
| deduplication | P-005, P-007, P-010, P-013. No new primitive. |

### 11. Transition, coexistence, and history

| Field | Audit record |
| --- | --- |
| physical observation | linearly stable shear flows can transition after finite-amplitude perturbations; localized turbulent structures can decay, split, spread, and coexist with laminar flow |
| evidence | long pipe experiments distinguish transient lifetimes and proliferation; pipe and Couette studies support spatially extended transition and directed-percolation behavior in scoped regimes ([Hof et al.](https://doi.org/10.1103/PhysRevLett.101.214501); [Avila et al.](https://doi.org/10.1126/science.1203223); [Lemoult et al.](https://doi.org/10.1038/nphys3675); [Lemoult et al.](https://doi.org/10.1038/s41567-024-02513-0)) |
| proposed translation | represent state, perturbation history, ramp direction, local nucleation, spreading, decay, and observation duration separately |
| efficiency mechanism | retain compact regime and hazard state instead of recomputing a false memoryless threshold |
| strongest null | hidden Markov/semi-Markov models, change-point detection, hysteretic finite-state machines, survival models, bifurcation tracking, and active system identification |
| failure mode | one critical threshold is fit across different disturbance amplitudes, observation lengths, geometries, or ramp directions |
| measurable prediction | a history-aware model must improve calibrated event-time and spatial-spread prediction beyond a state-only model while abstaining outside the tested transition class |
| deduplication | P-003, P-006, P-012; Candidate 003. No new primitive. |

### 12. Rare extremes as a separate sampling problem

| Field | Audit record |
| --- | --- |
| physical observation | rare dissipation bursts and loads can arise from specific transient interactions and require far more exposure than mean-flow estimation |
| evidence | variational searches and dynamically informed precursors identify scoped extreme mechanisms; rare-event algorithms can estimate return times more efficiently, but algorithm effectiveness depends on the observable and dynamics ([Farazmand and Sapsis](https://doi.org/10.1126/sciadv.1701533); [Farazmand and Sapsis](https://doi.org/10.1103/PhysRevE.94.032212); [Lestang et al.](https://doi.org/10.1088/1742-5468/aab856); [Lestang et al.](https://doi.org/10.1017/jfm.2020.293)) |
| proposed translation | maintain a tail-specific evaluator, exposure ledger, precursor horizon, reweighting record, and unbiased holdout stream |
| efficiency mechanism | focus simulation or intervention on high-consequence trajectories while preserving weights needed for probability estimation |
| strongest null | brute-force Monte Carlo, peaks-over-threshold/extreme-value fits, importance sampling, adaptive multilevel splitting, genealogical sampling, and cost-sensitive classifiers |
| failure mode | biased sampler reports its enriched frequency as a natural probability; short correlated records overstate effective tail sample size |
| measurable prediction | tail estimates must be calibrated on independent natural-distribution runs with confidence intervals and declared return-period support |
| deduplication | P-001, P-007, P-012; Candidates 003 and 007. No new primitive. |

### 13. Measurement operator before inferred field

| Field | Audit record |
| --- | --- |
| physical observation | PIV, hot wires, pressure taps, force balances, and derived spectra observe filtered, sampled, calibrated responses rather than pointwise mathematical fields |
| evidence | finite hot-wire length attenuates derivative statistics; modern uncertainty guidance requires covariance propagation; CFD validation standards bind comparison to specified variables and validation points ([Roberts](https://doi.org/10.1017/S0001924000049332); [JCGM 100](https://doi.org/10.59161/JCGM100-2008E); [ASME V&V 20](https://www.asme.org/codes-standards/find-codes-standards/standard-for-verification-and-validation-in-computational-fluid-dynamics-and-heat-transfer/2009)) |
| proposed translation | store the observation kernel, calibration, time support, spatial support, synchronization, missingness, uncertainty, and processing version beside every datum |
| efficiency mechanism | avoid spending inference compute to reconstruct information physically removed by the sensor while buying new observations where information remains obtainable |
| strongest null | explicit convolution/downsampling likelihoods, errors-in-variables models, calibrated sensor fusion, and Candidate 014's observation contract |
| failure mode | model is trained against a processed target and evaluated against latent truth, or vice versa; repeated samples are treated as independent |
| measurable prediction | support-aware estimation must improve out-of-instrument transfer and calibration beyond a point-sensor assumption at equal data volume |
| deduplication | P-003, P-007, P-012, P-013; Candidate 014. No new primitive. |

### 14. Complete energy and work boundary

| Field | Audit record |
| --- | --- |
| physical observation | efficient flow computation or control can move cost among facility power, sensor bandwidth, actuation, compute, data movement, storage, embodied hardware, and maintenance |
| evidence | net-saving analyses already show that gross drag reduction is insufficient; AMR literature separates cell savings from organizational overhead; metrology and V&V require traceable comparison boundaries ([Quadrio and Ricco](https://doi.org/10.1017/S0022112004001855); [Berger and Colella](https://doi.org/10.1016/0021-9991(89)90035-1); [ASME V&V 20](https://www.asme.org/codes-standards/find-codes-standards/standard-for-verification-and-validation-in-computational-fluid-dynamics-and-heat-transfer/2009)) |
| proposed translation | optimize a vector of useful output, risk, latency, and lifecycle resource rows; permit scalar energy intensity only after an explicit functional unit is fixed |
| efficiency mechanism | reveal substitutions that genuinely reduce total work and reject those that move it outside the meter |
| strongest null | full-system power measurement, hardware counters calibrated to wall power, lifecycle assessment, and Pareto analysis |
| failure mode | training energy is excluded for a frequently retrained controller; facility cooling or pumping is excluded; embodied cost is amortized over an unrealistically high duty cycle |
| measurable prediction | claimed advantage must survive boundary expansion and sensitivity analysis over service life, duty cycle, grid carbon intensity, and hardware utilization |
| deduplication | P-006, P-009, P-010; Candidates 006, 012, and 018. No new primitive. |

## Audit-local evidence ledger

### FLUID-001

- **Statement:** The incompressible Navier–Stokes equations do not determine a
  unique experimental or numerical problem until geometry, initial state,
  boundary conditions, forcing, material properties, and observation target
  are specified.
- **Status:** established.
- **Primary sources:** [ASME V&V 20](https://www.asme.org/codes-standards/find-codes-standards/standard-for-verification-and-validation-in-computational-fluid-dynamics-and-heat-transfer/2009).
- **Rationale:** validation is defined for specified variables at specified
  validation points, not for an equation name in isolation.
- **Open issue:** how much boundary and forcing uncertainty must be propagated
  for each target.
- **Deduplication:** Candidate 014; no new principle.

### FLUID-002

- **Statement:** The signed four-fifths relation is an exact inertial-range
  result only under stationary, homogeneous, isotropic, incompressible and
  sufficiently high-Reynolds-number conditions; finite-Reynolds corrections
  can remain material.
- **Status:** established.
- **Primary sources:** [Antonia et al. 2019](https://doi.org/10.1103/PhysRevFluids.4.084602),
  [Antonia et al. 2006](https://doi.org/10.1017/S0022112005008438).
- **Rationale:** the transport equation exposes forcing, viscosity, finite
  range, and nonstationarity terms omitted from the asymptotic statement.
- **Open issue:** robust inference of a usable inertial range in short,
  anisotropic records.
- **Deduplication:** P-007 and Candidate 014.

### FLUID-003

- **Statement:** Kinetic-energy cascade direction is regime-dependent:
  three-dimensional, two-dimensional, and rotating flows can exhibit forward,
  inverse, or simultaneous transfers.
- **Status:** established.
- **Primary sources:** [Boffetta and Musacchio 2010](https://doi.org/10.1103/PhysRevE.82.016307),
  [Campagne et al. 2014](https://doi.org/10.1063/1.4904957).
- **Rationale:** direct numerical and laboratory measurements resolve flux on
  both sides of the forcing scale.
- **Open issue:** transfer classification under strong inhomogeneity and finite
  observational support.
- **Deduplication:** P-007, P-011, Candidate 002.

### FLUID-004

- **Statement:** A mean forward cascade can contain intense spatially local
  backscatter and forward-transfer events; the mean sign does not specify the
  event distribution.
- **Status:** established.
- **Primary sources:** [Cardesa et al. 2017](https://doi.org/10.1126/science.aan7933),
  [Dong et al. 2020](https://doi.org/10.1017/jfm.2020.195).
- **Rationale:** scale-resolved transfer fields have organized, signed local
  structure.
- **Open issue:** detector-independent characterization of transfer events.
- **Deduplication:** P-001 and P-007.

### FLUID-005

- **Statement:** High-order velocity-increment and dissipation statistics show
  intermittent departures from simple Kolmogorov self-similarity.
- **Status:** established.
- **Primary sources:** [She and Lévêque 1994](https://doi.org/10.1103/PhysRevLett.72.336),
  [Debue et al. 2018](https://doi.org/10.1103/PhysRevE.97.053101),
  [Ishihara et al. 2007](https://doi.org/10.1017/S0022112007008531).
- **Rationale:** scaling exponents and gradient/dissipation tails are not
  determined by low-order spectra alone.
- **Open issue:** finite-record and finite-resolution bias at the highest
  orders.
- **Deduplication:** P-001 and P-007.

### FLUID-006

- **Statement:** Agreement on mean, variance, or energy spectrum does not imply
  agreement on scale flux, high-order moments, gradients, or rare extremes.
- **Status:** established.
- **Primary sources:** [Ishihara et al. 2016](https://doi.org/10.1103/PhysRevFluids.1.082403),
  [Yoshimatsu et al. 2009](https://doi.org/10.1103/PhysRevE.79.026303).
- **Rationale:** fields with similar low-order spectra can have different phase
  organization and intermittent statistics.
- **Open issue:** the smallest sufficient metric set for a given downstream
  decision.
- **Deduplication:** Candidate 014; no new principle.

### FLUID-007

- **Statement:** A coherent structure is conditional on an observable,
  reference frame, filter, detector and threshold; different valid definitions
  need not select identical material.
- **Status:** established.
- **Primary sources:** [Adrian et al. 2000](https://doi.org/10.1017/S0022112000001580),
  [Schmid 2010](https://doi.org/10.1017/S0022112010001217).
- **Rationale:** PIV vortex signatures and modal structures are outputs of
  distinct measurement and decomposition operators.
- **Open issue:** detector-robust event identity under multiscale merging and
  splitting.
- **Deduplication:** P-008, P-010, Candidate 014.

### FLUID-008

- **Statement:** Unstable travelling-wave solutions exist in pipe flow and can
  provide state-space coordinates for transition, but their existence alone
  does not establish that a small set controls fully developed turbulence.
- **Status:** plausible.
- **Primary sources:** [Wedin and Kerswell 2004](https://doi.org/10.1017/S0022112004009346),
  [Faisst and Eckhardt 2003](https://doi.org/10.1103/PhysRevLett.91.224502).
- **Rationale:** exact invariant solutions are mathematically precise; their
  quantitative coverage and predictive sufficiency remain flow- and regime-
  dependent.
- **Open issue:** scalable state-space distance and coverage at high Reynolds
  number.
- **Deduplication:** P-008 and P-010.

### FLUID-009

- **Statement:** Non-normal linearized shear-flow dynamics can yield large
  finite-time energy growth even when every eigenmode is asymptotically stable.
- **Status:** established.
- **Primary sources:** [Butler and Farrell 1992](https://doi.org/10.1063/1.858386).
- **Rationale:** optimal perturbations exploit nonorthogonal dynamics, so
  eigenvalue stability and short-horizon amplification are different outcomes.
- **Open issue:** which finite-time gains remain predictive after nonlinear
  saturation and uncertainty.
- **Deduplication:** P-003, P-006, Candidate 003.

### FLUID-010

- **Statement:** Averaging or filtering nonlinear fluid equations produces
  unresolved correlation terms, so every coarse simulation or surrogate makes
  an explicit or implicit closure choice.
- **Status:** established.
- **Primary sources:** [Germano et al. 1991](https://doi.org/10.1063/1.857955),
  [Fukagata et al. 2002](https://doi.org/10.1063/1.1516779).
- **Rationale:** nonlinear products do not commute with Reynolds averages or
  spatial filters.
- **Open issue:** memory and nonlocality required for accurate portable
  closures.
- **Deduplication:** P-003, P-008, P-012.

### FLUID-011

- **Statement:** A dynamic LES coefficient inferred from two filter levels can
  adapt to local flow and vanish in laminar or near-wall limits represented by
  the model, but it remains tied to its filter and modelling assumptions.
- **Status:** established.
- **Primary sources:** [Germano et al. 1991](https://doi.org/10.1063/1.857955).
- **Rationale:** the Germano identity supplies an internal cross-scale
  consistency relation rather than a universal coefficient.
- **Open issue:** robust operation on anisotropic grids, complex boundaries,
  and under-resolved transitional flow.
- **Deduplication:** P-007; Candidate 002.

### FLUID-012

- **Statement:** Single-point RANS closures carry epistemic model-form
  uncertainty that is not represented by numerical convergence or parameter
  uncertainty alone.
- **Status:** established.
- **Primary sources:** [Iaccarino et al. 2017](https://doi.org/10.1103/PhysRevFluids.2.024605),
  [Klemmer and Mueller 2021](https://doi.org/10.1103/PhysRevFluids.6.044606).
- **Rationale:** admissible stress perturbations and implied-model analyses
  expose uncertainty and error cancellation caused by closure assumptions.
- **Open issue:** calibrated, non-overconservative bounds outside validation
  support.
- **Deduplication:** P-007, Candidate 014.

### FLUID-013

- **Statement:** Embedding Galilean invariance in a learned Reynolds-stress
  model improves physical consistency and reported prediction relative to a
  generic network, but invariance does not by itself guarantee realizability,
  solver stability, or extrapolation.
- **Status:** established.
- **Primary sources:** [Ling et al. 2016](https://doi.org/10.1017/jfm.2016.615),
  [Parish and Duraisamy 2016](https://doi.org/10.1016/j.jcp.2015.11.012).
- **Rationale:** a correct symmetry removes invalid degrees of freedom while
  leaving data support and closure adequacy unresolved.
- **Open issue:** joint enforcement of symmetry, realizability, conservation,
  and calibrated out-of-support uncertainty.
- **Deduplication:** P-008, P-010, Candidate 009.

### FLUID-014

- **Statement:** A field-inversion correction may contain compensating effects
  from closure, discretization, boundary, and parameter errors unless these
  contributions are experimentally separated.
- **Status:** plausible.
- **Primary sources:** [Parish and Duraisamy 2016](https://doi.org/10.1016/j.jcp.2015.11.012),
  [Klemmer and Mueller 2021](https://doi.org/10.1103/PhysRevFluids.6.044606).
- **Rationale:** the inverse problem identifies a correction sufficient for the
  chosen observations, not a unique causal discrepancy.
- **Open issue:** identifiability of portable correction terms from sparse
  heterogeneous observations.
- **Deduplication:** Candidate 014.

### FLUID-015

- **Statement:** POD maximizes captured variance or kinetic energy for a
  declared inner product and snapshot distribution; this objective need not
  preserve input-output gain, stability, tail risk, or control authority.
- **Status:** established.
- **Primary sources:** [Rowley 2005](https://doi.org/10.1142/S0218127405012429).
- **Rationale:** balanced modes differ from energy-ranked modes because they
  include controllability and observability.
- **Open issue:** multi-objective basis construction without losing online
  efficiency.
- **Deduplication:** P-001, P-010, Candidate 018.

### FLUID-016

- **Statement:** DMD estimates spectral information for a finite-dimensional
  inter-snapshot map; mode interpretation depends on sampling, observable,
  noise, rank truncation, and nonstationarity.
- **Status:** established.
- **Primary sources:** [Schmid 2010](https://doi.org/10.1017/S0022112010001217),
  [Schmid et al. 2011](https://doi.org/10.1007/s00162-010-0203-9).
- **Rationale:** DMD is a data-dependent decomposition, not direct recovery of
  all nonlinear governing dynamics.
- **Open issue:** reliable mode identity under drift and intermittent regime
  switching.
- **Deduplication:** P-012 and Candidate 014.

### FLUID-017

- **Statement:** Discarded modes can destabilize or over-damp a reduced fluid
  model; truncation uncertainty and closure must be evaluated during rollout,
  not inferred from reconstruction error alone.
- **Status:** established.
- **Primary sources:** [Resseguier et al. 2021](https://doi.org/10.1137/19M1354819).
- **Rationale:** stochastic residual models can stabilize temporal coefficients
  and represent missing variability in scoped wake-flow tests.
- **Open issue:** closure portability across rank, geometry and operating
  regime.
- **Deduplication:** P-003, P-012, Candidate 018.

### FLUID-018

- **Statement:** Adaptive mesh refinement can reduce work for localized
  hyperbolic features by creating and removing nested spatial and temporal
  grids from error indicators.
- **Status:** established.
- **Primary sources:** [Berger and Oliger 1984](https://doi.org/10.1016/0021-9991(84)90073-1),
  [Berger and Colella 1989](https://doi.org/10.1016/0021-9991(89)90035-1).
- **Rationale:** the algorithms explicitly couple truncation estimates,
  recursive grids, time subcycling and interface operations.
- **Open issue:** dependable indicators for under-resolved turbulence and
  moving quantities of interest.
- **Deduplication:** P-001, P-002, P-007.

### FLUID-019

- **Statement:** Cell count alone is not an adequate AMR cost because fine-
  level substeps, regridding, interpolation, refluxing, communication, load
  imbalance, storage and rejected work can dominate.
- **Status:** established.
- **Primary sources:** [Berger and Colella 1989](https://doi.org/10.1016/0021-9991(89)90035-1).
- **Rationale:** conservative adaptive algorithms require explicit data
  structures and cross-level operations.
- **Open issue:** hardware-independent cost summaries that still predict energy
  and wall time.
- **Deduplication:** P-009; Candidates 006 and 018.

### FLUID-020

- **Statement:** A refinement indicator is useful only to the extent that it
  reduces error in the declared quantity of interest; gradients or residual
  magnitude alone can refine the wrong region.
- **Status:** established.
- **Primary sources:** [Hay and Visonneau 2005](https://doi.org/10.1016/j.crme.2004.09.014),
  [Vasile et al. 2015](https://doi.org/10.1016/j.ast.2014.10.021).
- **Rationale:** goal-oriented weighting changes the value of a local residual
  according to its downstream effect.
- **Open issue:** low-cost adjoint or influence estimates for chaotic long-
  horizon targets.
- **Deduplication:** P-007, Candidate 014.

### FLUID-021

- **Statement:** Data assimilation estimates state by combining a model prior
  and an observation likelihood; posterior accuracy and calibration depend on
  both model-error and observation-error assumptions.
- **Status:** established.
- **Primary sources:** [Evensen 1994](https://doi.org/10.1029/94JC00572),
  [Talagrand and Courtier 1987](https://doi.org/10.1002/qj.49711347812).
- **Rationale:** neither forecast nor observations are treated as exact in the
  general estimation problem.
- **Open issue:** non-Gaussian, state-dependent, correlated model error in
  turbulent systems.
- **Deduplication:** P-003, P-007, Candidate 014.

### FLUID-022

- **Statement:** EnKF forecast covariance is a finite-ensemble estimate and can
  suffer sampling error, rank deficiency and spurious long-range correlation;
  ensemble size and localization are resource-bearing model choices.
- **Status:** established.
- **Primary sources:** [Evensen 1994](https://doi.org/10.1029/94JC00572).
- **Rationale:** Monte Carlo error statistics replace explicit covariance
  evolution but do not eliminate covariance approximation.
- **Open issue:** adaptive localization under flow-dependent coherent
  structures without truth leakage.
- **Deduplication:** P-001, P-007, P-012.

### FLUID-023

- **Statement:** Four-dimensional variational assimilation couples all
  observations in a window through forward and adjoint models, but its answer
  remains conditional on model fidelity, optimization landscape, regularization
  and the selected window.
- **Status:** established.
- **Primary sources:** [Talagrand and Courtier 1987](https://doi.org/10.1002/qj.49711347812).
- **Rationale:** one gradient requires forward and backward integrations of the
  declared model; an exact optimizer of a wrong model remains wrong.
- **Open issue:** scalable uncertainty quantification around nonlinear local
  optima.
- **Deduplication:** P-007, Candidate 014.

### FLUID-024

- **Statement:** Small-scale turbulent fields can be reconstructed from
  sufficiently informative large-scale observations in scoped simulations,
  but recoverability has critical spatial and temporal support and noise
  conditions.
- **Status:** established.
- **Primary sources:** [Yoshida et al. 2005](https://doi.org/10.1103/PhysRevLett.94.014501),
  [Wang et al. 2022](https://doi.org/10.1063/5.0091391).
- **Rationale:** synchronization of unresolved scales relies on dynamically
  constraining enough resolved modes often enough.
- **Open issue:** critical support under model error, unknown boundaries and
  real heterogeneous instruments.
- **Deduplication:** P-007, Candidate 014.

### FLUID-025

- **Statement:** Observability is target-, trajectory-, sensor-, noise-, and
  horizon-dependent; reconstructing one statistic does not establish full-state
  observability.
- **Status:** established.
- **Primary sources:** [Rowley 2005](https://doi.org/10.1142/S0218127405012429),
  [Manohar et al. 2018](https://doi.org/10.1109/MCS.2018.2810460).
- **Rationale:** input-output balancing and sparse reconstruction optimize
  declared subspaces and targets.
- **Open issue:** nonlinear empirical observability with regime changes and
  actuator-dependent observations.
- **Deduplication:** P-007, Candidates 007 and 014.

### FLUID-026

- **Statement:** Sparse reconstruction sensors selected from a low-rank library
  can be effective in-distribution, but performance is conditional on the
  library spanning the test field and on the sensing matrix remaining well
  conditioned.
- **Status:** established.
- **Primary sources:** [Manohar et al. 2018](https://doi.org/10.1109/MCS.2018.2810460).
- **Rationale:** pivoted placement optimizes a finite basis, not unseen state
  components.
- **Open issue:** shift detectors and safe sensor reserves for new regimes.
- **Deduplication:** P-001, P-007, Candidate 014.

### FLUID-027

- **Statement:** A sensor layout optimized for classification can require less
  information than one optimized for field reconstruction; the tasks must not
  share an undifferentiated “sensor efficiency” score.
- **Status:** established.
- **Primary sources:** [Brunton et al. 2016](https://doi.org/10.1137/15M1036713).
- **Rationale:** discrimination between known classes is a weaker inverse
  problem than recovering all field coordinates.
- **Open issue:** calibrated rejection of unknown classes and compound regimes.
- **Deduplication:** P-001, P-007.

### FLUID-028

- **Statement:** Feedback using wall-normal velocity information can reduce
  turbulent skin friction in scoped channel-flow DNS, demonstrating that
  localized observation-action paths can alter global transport.
- **Status:** established.
- **Primary sources:** [Choi et al. 1994](https://doi.org/10.1017/S0022112094000431),
  [Fukagata et al. 2002](https://doi.org/10.1063/1.1516779).
- **Rationale:** opposition control changes near-wall Reynolds stress and the
  resulting friction contribution.
- **Open issue:** robust net benefit at realistic Reynolds number, sensing,
  actuator spacing and delay.
- **Deduplication:** P-002, P-006, P-007; Candidate 012.

### FLUID-029

- **Statement:** Gross drag reduction can substantially exceed net energy
  saving after actuation power is charged.
- **Status:** established.
- **Primary sources:** [Quadrio and Ricco 2004](https://doi.org/10.1017/S0022112004001855).
- **Rationale:** the cited wall-oscillation DNS reported a maximum gross drag
  reduction of $44.7\%$ but a maximum net saving of $7.3\%$ under its stated
  assumptions, including neglect of mechanical losses.
- **Open issue:** complete installation and lifecycle accounting outside
  canonical DNS.
- **Deduplication:** P-006, P-009; Candidates 006 and 012.

### FLUID-030

- **Statement:** Closed-loop flow-control authority must be qualified by sensor
  latency, inference latency, actuator bandwidth, saturation, spatial support,
  failure state and evidence age.
- **Status:** plausible.
- **Primary sources:** [Choi et al. 1994](https://doi.org/10.1017/S0022112094000431),
  [Quadrio and Ricco 2004](https://doi.org/10.1017/S0022112004001855).
- **Rationale:** the target structures convect and decorrelate; a delayed action
  need not oppose the event that triggered it.
- **Open issue:** certified envelopes for chaotic, partially observed plants.
- **Deduplication:** Candidate 012 exactly; no new candidate.

### FLUID-031

- **Statement:** Unsteady advection can stretch and fold material into fine
  structure even in laminar flow, while molecular diffusion or reaction
  determines irreversible homogenization or conversion.
- **Status:** established.
- **Primary sources:** [Aref 1984](https://doi.org/10.1017/S0022112084001233),
  [Batchelor 1959](https://doi.org/10.1017/S002211205900009X).
- **Rationale:** Lagrangian chaos and scalar diffusion are separable physical
  operations.
- **Open issue:** optimal action schedules with uncertain diffusivity, reaction
  and boundaries.
- **Deduplication:** P-005, P-010, P-013.

### FLUID-032

- **Statement:** The smallest dynamically relevant scalar scale can differ from
  the smallest velocity scale and depends on the ratio of viscosity to scalar
  diffusivity.
- **Status:** established.
- **Primary sources:** [Batchelor 1959](https://doi.org/10.1017/S002211205900009X),
  [Donzis et al. 2010](https://doi.org/10.1016/j.physd.2009.09.024).
- **Rationale:** high-Schmidt-number scalar gradients can require resolution
  below the Kolmogorov velocity scale.
- **Open issue:** cost-effective multiresolution coupling for active,
  multiphase, or reacting scalars.
- **Deduplication:** P-001, P-007, P-010.

### FLUID-033

- **Statement:** Scalar variance, negative-Sobolev mix norm, interface length,
  scalar dissipation, reaction yield and residence-time distribution are
  non-equivalent mixing objectives.
- **Status:** established.
- **Primary sources:** [Mathew et al. 2005](https://doi.org/10.1016/j.physd.2005.07.017),
  [Mathew et al. 2007](https://doi.org/10.1017/S0022112007005332).
- **Rationale:** a protocol can move variance to unresolved scales or maximize
  stretching without maximizing irreversible task completion.
- **Open issue:** task-specific sufficient metric suites for reactive and
  multiphase systems.
- **Deduplication:** Candidate 014; no new principle.

### FLUID-034

- **Statement:** Transition in pipe flow is finite-amplitude and history-
  sensitive although the laminar base flow is linearly stable over the relevant
  range; a universal instantaneous critical Reynolds number is therefore an
  invalid summary.
- **Status:** established.
- **Primary sources:** [Hof et al. 2008](https://doi.org/10.1103/PhysRevLett.101.214501),
  [Avila et al. 2011](https://doi.org/10.1126/science.1203223).
- **Rationale:** disturbance amplitude, turbulent lifetime, decay and splitting
  statistics jointly determine observed transition.
- **Open issue:** predictive state variables for naturally disturbed,
  noncanonical pipes.
- **Deduplication:** P-003, P-006, Candidate 003.

### FLUID-035

- **Statement:** Localized pipe-flow puffs have stochastic decay and splitting
  processes whose competing timescales determine sustained turbulence in the
  tested regime.
- **Status:** established.
- **Primary sources:** [Avila et al. 2011](https://doi.org/10.1126/science.1203223),
  [Lemoult et al. 2024](https://doi.org/10.1038/s41567-024-02513-0).
- **Rationale:** spatial proliferation, not only increasing temporal complexity
  at one point, controls sustained turbulent fraction.
- **Open issue:** universality across geometry, pulsation, roughness and
  external noise.
- **Deduplication:** P-004, P-006, Candidate 003.

### FLUID-036

- **Statement:** Directed-percolation scaling is supported for sustained
  transition in scoped Couette and pipe-flow regimes, but should not be treated
  as a universal model of every turbulent transition.
- **Status:** plausible.
- **Primary sources:** [Lemoult et al. 2016](https://doi.org/10.1038/nphys3675),
  [Lemoult et al. 2024](https://doi.org/10.1038/s41567-024-02513-0).
- **Rationale:** measured exponents and spatiotemporal behavior support the
  class where short-range contagion and an absorbing laminar state apply.
- **Open issue:** long-range coupling, additional conserved fields, finite
  domains and jamming corrections.
- **Deduplication:** P-004, P-006, Candidate 003.

### FLUID-037

- **Statement:** Hysteresis and coexistence require ramp direction, dwell time,
  perturbation protocol and state history to be included in a transition
  record.
- **Status:** established.
- **Primary sources:** [Barkley 2011](https://doi.org/10.1103/PhysRevE.84.016309),
  [Hof et al. 2008](https://doi.org/10.1103/PhysRevLett.101.214501).
- **Rationale:** excitable and bistable regimes can yield different state at
  the same control parameter.
- **Open issue:** separating true hysteresis from slow equilibration and finite
  observation time.
- **Deduplication:** P-003, P-006, P-012.

### FLUID-038

- **Statement:** Accurate central-distribution or mean-flow prediction does not
  establish calibrated extreme-load, dissipation-burst, or return-period
  prediction.
- **Status:** established.
- **Primary sources:** [Farazmand and Sapsis 2017](https://doi.org/10.1126/sciadv.1701533),
  [Lestang et al. 2018](https://doi.org/10.1088/1742-5468/aab856).
- **Rationale:** tail events require separate exposure, sampling and
  uncertainty; rare-event estimators target a different functional.
- **Open issue:** regime-shift-robust tails with limited natural exposure.
- **Deduplication:** P-007, P-012, Candidate 007.

### FLUID-039

- **Statement:** Dynamically informed precursor coordinates can predict scoped
  bursts more efficiently than generic full-state monitoring, but precursor
  validity is event-, model-, horizon-, and regime-specific.
- **Status:** plausible.
- **Primary sources:** [Farazmand and Sapsis 2016](https://doi.org/10.1103/PhysRevE.94.032212),
  [Farazmand and Sapsis 2017](https://doi.org/10.1126/sciadv.1701533).
- **Rationale:** optimized time-dependent modes and variational trigger states
  isolate event-relevant directions in canonical systems.
- **Open issue:** prospective calibration on independent physical experiments.
- **Deduplication:** P-001, P-007, Candidate 003.

### FLUID-040

- **Statement:** Rare-event algorithms can reduce variance or computational
  cost for one observable while providing no gain for another; unbiased
  reweighting and method-specific diagnostics are mandatory.
- **Status:** established.
- **Primary sources:** [Lestang et al. 2020](https://doi.org/10.1017/jfm.2020.293),
  [Lestang et al. 2018](https://doi.org/10.1088/1742-5468/aab856).
- **Rationale:** in the cited bluff-body study adaptive multilevel splitting
  yielded little runtime benefit while the genealogical method was effective
  for time-averaged drag extremes.
- **Open issue:** automatic reaction coordinates without bias or prohibitive
  training cost.
- **Deduplication:** P-001 and P-007.

### FLUID-041

- **Statement:** Every turbulence instrument has a spatial and temporal
  transfer function; finite probe length, interrogation volume, exposure time,
  filtering and sampling can attenuate precisely the gradients and tails of
  interest.
- **Status:** established.
- **Primary sources:** [Roberts 1973](https://doi.org/10.1017/S0001924000049332),
  [Zhu et al. 1995](https://doi.org/10.1016/0894-1777(95)00001-3).
- **Rationale:** hot-wire spatial averaging biases derivative statistics and
  requires a response-aware correction.
- **Open issue:** traceable uncertainty for learned inverse corrections to
  sensor filtering.
- **Deduplication:** Candidate 014.

### FLUID-042

- **Statement:** Measurement uncertainty must propagate input covariance,
  including correlations, through the measurement model and remain attached to
  derived quantities.
- **Status:** established.
- **Primary sources:** [JCGM 100:2008](https://doi.org/10.59161/JCGM100-2008E),
  [JCGM 101:2008](https://doi.org/10.59161/JCGM101-2008).
- **Rationale:** combined standard uncertainty is a property of the measurand,
  input information and declared model, not a generic sensor percentage.
- **Open issue:** nonstationary covariance and model-form uncertainty in
  automated sensor pipelines.
- **Deduplication:** Candidate 014.

### FLUID-043

- **Statement:** CFD validation at one variable and validation point does not
  by itself validate other fields, regimes, geometries, horizons or tail
  observables.
- **Status:** established.
- **Primary sources:** [ASME V&V 20](https://www.asme.org/codes-standards/find-codes-standards/standard-for-verification-and-validation-in-computational-fluid-dynamics-and-heat-transfer/2009).
- **Rationale:** the standard scopes accuracy to specified validation variables
  and points and distinguishes solution and experimental uncertainty.
- **Open issue:** defensible interpolation and extrapolation domains for learned
  fluid models.
- **Deduplication:** Candidate 014.

### FLUID-044

- **Statement:** A physical efficiency claim for flow prediction or control is
  incomplete unless facility, sensing, actuation, compute, data movement,
  storage, auxiliary, maintenance and embodied rows are either measured or
  explicitly excluded with sensitivity bounds.
- **Status:** plausible.
- **Primary sources:** [Quadrio and Ricco 2004](https://doi.org/10.1017/S0022112004001855),
  [ASME V&V 20](https://www.asme.org/codes-standards/find-codes-standards/standard-for-verification-and-validation-in-computational-fluid-dynamics-and-heat-transfer/2009).
- **Rationale:** gross physical benefit can be mostly consumed by the action
  producing it, and simulation credibility depends on a declared comparison.
- **Open issue:** common functional units for training, real-time control and
  long-life infrastructure.
- **Deduplication:** P-009, P-010; Candidates 006 and 018.

### FLUID-045

- **Statement:** A fluid-inspired learning system earns architectural credit
  only if it beats conventional simulation, estimation, control, sparse
  sensing, adaptive refinement and learned-operator nulls on a preregistered
  quality–risk–latency–resource frontier.
- **Status:** speculative.
- **Primary sources:** the audit's method comparisons and benchmark contracts;
  no primary paper establishes this proposed system-level criterion.
- **Rationale:** most proposed ingredients already exist as mature engineering
  methods; novelty must lie in a discriminating composition and measured
  residual advantage.
- **Open issue:** whether any residual survives the complete null stack.
- **Deduplication:** experiment policy across Candidates 002, 003, 006, 007,
  012, 014 and 018; no new candidate.

## Decisive benchmark proposals

### E-FLUID-01 — Cascade versus spectrum matching

Generate forced three-dimensional, two-dimensional, and rotating flows with
held-out forcing bands and rotation rates. Give every model identical resolved
fields and forecast horizon. Score:

1. energy spectrum error $E(k)$;
2. signed mean flux $\langle\Pi_\ell\rangle$ across scale;
3. local forward/backscatter event precision and calibration;
4. structure-function exponents with uncertainty;
5. conservation residual; and
6. joules, cell/token-steps, bytes moved, and latency.

Reject the fluid-inspired hierarchy if a Fourier neural operator, multigrid
surrogate, or ordinary hierarchical attention model matches flux and tails at
equal cost. A spectrum-only win is failure.

### E-FLUID-02 — Closure portability and error cancellation

Train corrections on selected combinations of solver, grid, Reynolds number,
geometry, pressure gradient and boundary treatment. Cross the remaining axes
at test time. Include RANS/LES baselines, dynamic closure, invariant tensor
network, field inversion, Bayesian discrepancy, and grid refinement. Require:

- quantity-of-interest and field error;
- realizability and conservation;
- uncertainty coverage conditional on support distance;
- solver stability and convergence;
- performance when numerical order or grid changes; and
- complete training and inference resource vectors.

The learned residual fails if its advantage disappears when discretization or
boundary error changes, even if it excels on random snapshot splits.

### E-FLUID-03 — Reduced state for forecast, control, and extremes

Build equal-rank POD, balanced POD, DMD, resolvent, autoencoder, operator-
inference, and target-qualified reduced models from the same trajectories.
Evaluate separately:

1. snapshot reconstruction;
2. rollout stability and horizon;
3. response to unseen forcing;
4. closed-loop control value and stability;
5. transition-event timing; and
6. extreme-event precision, recall, calibration and return-period bias.

No aggregate score may hide a catastrophic tail or control failure. The
target-qualified model earns a result only on its declared target and must
report sacrificed outcomes.

### E-FLUID-04 — Adaptive refinement at equal target error

Compare uniform grids, residual AMR, gradient/feature AMR, goal-oriented AMR,
and a learned allocator on moving shocks, vortices, scalar fronts, and a target
whose sensitivity lies away from the largest local residual. Count all
cell-time updates, subcycles, rejected steps, remaps, reflux operations, bytes,
communication, memory, wall time and joules. Perturb estimator thresholds and
target location after training. Reject the learned allocator if it only wins on
instantaneous cell count or thrashes under a moving target.

### E-FLUID-05 — Observation-contract stress test

Generate truth with a solver, grid, boundary perturbation and forcing process
not exposed to the estimators. Apply realistic spatial kernels, exposure time,
latency, correlated calibration drift, missing intervals and sensor dropout.
Compare interpolation, EnKF, 4D-Var, moving-horizon estimation, PINN, neural
operator and a contract-aware estimator. Score posterior coverage,
innovation whiteness, unobservable-direction error, target decision value and
recovery after outage. A shared-model synthetic inverse crime invalidates the
run.

### E-FLUID-06 — Sensor placement under regime shift

Select sensors using QR pivoting, D-optimality, observability Gramians, mutual
information, random/uniform placement and a learned active policy. Then alter
geometry, forcing, Reynolds number, relevant class, sensor failure and
calibration correlation. Separate field reconstruction, regime classification,
tail warning and control. Count probe intrusion, bandwidth, synchronization,
calibration, maintenance, inference and fallback. Reject any layout that labels
unknown regimes confidently or depends on physically infeasible locations.

### E-FLUID-07 — Net-energy closed-loop control

Use a physical or hardware-in-the-loop plant with independently metered base
facility power. Compare no control, passive modification, open-loop forcing,
opposition control, LQR/$H_\infty$, MPC, extremum seeking and the proposed
policy. Sweep delay, bandwidth, sensor noise, actuator saturation, failure,
Reynolds number and duty cycle. Report gross task benefit and each term in
$E_{\mathrm{net}}$ separately. Any method that reduces drag but has negative
net energy over the declared service interval loses.

### E-FLUID-08 — Mixing at equal action

Use several initial scalar patterns, Péclet and Schmidt numbers, including
laminar chaotic advection and turbulent flow. Equalize time-integrated kinetic
action or actuator energy. Score scalar variance, negative-Sobolev mix norm,
scalar dissipation, reaction completion, residence-time tails and remnant
concentration at the operational sampling scale. Include random, periodic,
adjoint-optimized and closed-loop mixers. A method fails if its advantage
vanishes when measured at finer resolution or when diffusion is reduced.

### E-FLUID-09 — Transition-class and hysteresis challenge

For pipe and Couette geometries, randomize disturbance amplitude and shape,
ramp direction and rate, dwell time, domain size, noise and observation length.
Compare state-only thresholds, survival models, hidden semi-Markov models,
change-point detectors, bifurcation trackers, active system identification and
the proposed history-aware state. Score event-time likelihood, puff decay and
splitting hazards, spatial turbulent fraction, false warning, abstention and
lead time. A correct warning on one transition class must not receive credit
for confident predictions on abrupt or unobservable classes.

### E-FLUID-10 — Rare-event sampling and precursor audit

Declare the extreme observable, averaging window, threshold and natural
distribution before sampling. Compare brute-force Monte Carlo, extreme-value
fits, adaptive multilevel splitting, genealogical sampling, importance
sampling, generic classifiers and dynamics-informed precursors. Evaluate on a
large untouched natural-distribution stream. Report effective sample size,
weight degeneracy, return-period confidence interval, precursor lead time,
false-alarm burden, sampler training cost and total joules. Enriched-event
frequency without unbiased reweighting is an automatic failure.

## Negative results and construct-validity traps

The following outcomes must be retained rather than averaged away:

- a model matches kinetic-energy spectra but has the wrong signed flux;
- low-order moments improve while derivative or dissipation tails worsen;
- a coherent-structure detector changes conclusions under a reasonable filter,
  threshold, frame, or measurement plane;
- a ROM reconstructs snapshots but diverges during autonomous rollout;
- high-variance modes omit a weak-energy direction required for control or
  transition;
- a learned closure improves only on the solver/grid used to create labels;
- a closure and discretization error cancel, then refinement makes the answer
  worse before it becomes better;
- an invariant network produces an unrealizable stress or destabilizes the
  coupled solver;
- AMR reduces active cells but increases wall energy through subcycling,
  regridding, communication or load imbalance;
- an AMR indicator tracks a visible feature rather than target sensitivity;
- synthetic data assimilation shares the truth model, boundary condition and
  grid with the estimator;
- posterior variance shrinks while structural error grows;
- random snapshot splits leak adjacent states from the same correlated
  trajectory or forcing realization;
- nominal sample count is used despite long autocorrelation and a small
  effective sample size;
- a sparse sensor layout fails on a new mode or correlated sensor dropout;
- a probe's wake or thermal response perturbs the quantity being inferred;
- gross drag or mixing benefit is reported without actuation and facility
  energy;
- visually fine scalar filaments are called mixed although molecular diffusion
  or reaction has not completed;
- a transition threshold omits perturbation amplitude, ramp direction, dwell
  time or censoring;
- absence of an extreme in a short record is treated as evidence of low risk;
- an importance sampler reports biased event frequency without weights;
- an extreme precursor is selected and evaluated on the same rare episodes;
- a derived field is compared at point support although the instrument and
  simulation have different averaging kernels; or
- compute-board energy is reported while host, cooling, interconnect, storage,
  sensing, actuation, training refresh and embodied rows disappear.

## Candidate disposition

| Existing target | Fluid-dynamics pressure | Disposition |
| --- | --- | --- |
| Candidate 002: multiscale context broadcast | distinguish a signed, invariant-specific scale flux from generic top-down or bottom-up broadcast; test direction reversal and local backscatter | retain; add E-FLUID-01 as an adversarial track, no new candidate |
| Candidate 003: transition-class-aware fragility | finite-amplitude transition, non-normal growth, decay/splitting hazards, coexistence, hysteresis and tail precursors expose exactly why one slowing or threshold signal is insufficient | retain; add E-FLUID-09 and E-FLUID-10, no promotion |
| Candidate 006: reversible physical skill | passive structure and active flow control must be separated and full actuation/facility lifecycle energy charged | retain; E-FLUID-07 is a boundary audit, no new primitive |
| Candidate 007: endogenous observation | actuation changes both state and sensor evidence; assimilation can become overconfident under model and observation drift | retain; E-FLUID-05 and E-FLUID-07 sharpen the contract |
| Candidate 012: latency-qualified authority | convecting structures, sensor delay and finite actuator bandwidth make evidence age physically consequential | retain; compare against robust MPC and runtime assurance |
| Candidate 014: versioned observation contract | filter, support, calibration, covariance, forcing, boundary, solver, grid and data vintage determine every reconstructed field | strong corroboration of the contract; still a composition of established methods |
| Candidate 018: value/reconstructability tiering | reduced modes, meshes and sensor fields must be retained by target value and recoverability, not variance or access alone | retain; E-FLUID-03 and E-FLUID-04 provide falsification tracks |

The audit creates no Candidate 021. “Intermittent cascade routing,” “vortex
modules,” “turbulent mixing memory,” and “fluid observability” all collapse
into existing principles plus mature numerical estimation and control methods.

## Audit-local bibliography

These records preserve provenance for this audit and are not central evidence
entries until separately reviewed and imported.

```bibtex
@article{AntoniaEtAl2019FourFifths,
  author = {Antonia, R. A. and Tang, S. L. and Djenidi, L. and Zhou, Y.},
  title = {Finite Reynolds Number Effect and the 4/5 Law},
  year = {2019}, doi = {10.1103/PhysRevFluids.4.084602}
}

@article{AntoniaBurattini2006FourFifths,
  author = {Antonia, R. A. and Burattini, P.},
  title = {Approach to the 4/5 Law in Homogeneous Isotropic Turbulence},
  year = {2006}, doi = {10.1017/S0022112005008438}
}

@article{BoffettaMusacchio2010DoubleCascade,
  author = {Boffetta, Guido and Musacchio, Stefano},
  title = {Evidence for the Double Cascade Scenario in Two-Dimensional Turbulence},
  year = {2010}, doi = {10.1103/PhysRevE.82.016307}
}

@article{CampagneEtAl2014RotatingCascade,
  author = {Campagne, Antoine and Gallet, Basile and Moisy, Frédéric and Cortet, Pierre-Philippe},
  title = {Direct and Inverse Energy Cascades in a Forced Rotating Turbulence Experiment},
  year = {2014}, doi = {10.1063/1.4904957}
}

@article{CardesaEtAl2017FiveDimensionalCascade,
  author = {Cardesa, José I. and Vela-Martín, Alberto and Jiménez, Javier},
  title = {The Turbulent Cascade in Five Dimensions},
  year = {2017}, doi = {10.1126/science.aan7933}
}

@article{DongEtAl2020TransferStructure,
  author = {Dong, Siwei and Huang, Yongxiang and Yuan, Xianxu and Lozano-Durán, Adrián},
  title = {The Coherent Structure of the Kinetic Energy Transfer in Shear Turbulence},
  year = {2020}, doi = {10.1017/jfm.2020.195}
}

@article{SheLeveque1994Scaling,
  author = {She, Zhen-Su and Lévêque, Emmanuel},
  title = {Universal Scaling Laws in Fully Developed Turbulence},
  year = {1994}, doi = {10.1103/PhysRevLett.72.336}
}

@article{DebueEtAl2018Dissipation,
  author = {Debue, P. and Shukla, V. and Kuzzay, D. and Faranda, D. and Saw, E.-W. and Daviaud, F. and Dubrulle, B.},
  title = {Dissipation, Intermittency, and Singularities in Incompressible Turbulent Flows},
  year = {2018}, doi = {10.1103/PhysRevE.97.053101}
}

@article{IshiharaEtAl2007SmallScale,
  author = {Ishihara, Takashi and Kaneda, Yukio and Yokokawa, Mitsuo and Itakura, Ken'ichi and Uno, Atsuya},
  title = {Small-Scale Statistics in High-Resolution Direct Numerical Simulation of Turbulence},
  year = {2007}, doi = {10.1017/S0022112007008531}
}

@article{IshiharaEtAl2016Spectrum,
  author = {Ishihara, Takashi and Morishita, Koji and Yokokawa, Mitsuo and Uno, Atsuya and Kaneda, Yukio},
  title = {Energy Spectrum in High-Resolution Direct Numerical Simulations of Turbulence},
  year = {2016}, doi = {10.1103/PhysRevFluids.1.082403}
}

@article{YoshimatsuEtAl2009Intermittency,
  author = {Yoshimatsu, Katsunori and Okamoto, Naoya and Schneider, Kai and Kaneda, Yukio and Farge, Marie},
  title = {Intermittency and Scale-Dependent Statistics in Fully Developed Turbulence},
  year = {2009}, doi = {10.1103/PhysRevE.79.026303}
}

@article{AdrianEtAl2000VortexOrganization,
  author = {Adrian, Ronald J. and Meinhart, Carl D. and Tomkins, Christopher D.},
  title = {Vortex Organization in the Outer Region of the Turbulent Boundary Layer},
  year = {2000}, doi = {10.1017/S0022112000001580}
}

@article{WedinKerswell2004ExactStructures,
  author = {Wedin, H. and Kerswell, R. R.},
  title = {Exact Coherent Structures in Pipe Flow: Travelling Wave Solutions},
  year = {2004}, doi = {10.1017/S0022112004009346}
}

@article{FaisstEckhardt2003TravellingWaves,
  author = {Faisst, Holger and Eckhardt, Bruno},
  title = {Traveling Waves in Pipe Flow},
  year = {2003}, doi = {10.1103/PhysRevLett.91.224502}
}

@article{ButlerFarrell1992OptimalPerturbations,
  author = {Butler, Kathryn M. and Farrell, Brian F.},
  title = {Three-Dimensional Optimal Perturbations in Viscous Shear Flow},
  year = {1992}, doi = {10.1063/1.858386}
}

@article{GermanoEtAl1991DynamicSGS,
  author = {Germano, Massimo and Piomelli, Ugo and Moin, Parviz and Cabot, William H.},
  title = {A Dynamic Subgrid-Scale Eddy Viscosity Model},
  year = {1991}, doi = {10.1063/1.857955}
}

@article{FukagataEtAl2002SkinFriction,
  author = {Fukagata, Koji and Iwamoto, Kaoru and Kasagi, Nobuhide},
  title = {Contribution of Reynolds Stress Distribution to the Skin Friction in Wall-Bounded Flows},
  year = {2002}, doi = {10.1063/1.1516779}
}

@article{IaccarinoEtAl2017Eigenspace,
  author = {Iaccarino, Gianluca and Mishra, Aashwin Ananda and Ghili, Saman},
  title = {Eigenspace Perturbations for Uncertainty Estimation of Single-Point Turbulence Closures},
  year = {2017}, doi = {10.1103/PhysRevFluids.2.024605}
}

@article{KlemmerMueller2021ImpliedModels,
  author = {Klemmer, Kerry S. and Mueller, Michael E.},
  title = {Implied Models Approach for Turbulence Model Form Physics-Based Uncertainty Quantification},
  year = {2021}, doi = {10.1103/PhysRevFluids.6.044606}
}

@article{LingEtAl2016InvariantRANS,
  author = {Ling, Julia and Kurzawski, Andrew and Templeton, Jeremy},
  title = {Reynolds Averaged Turbulence Modelling Using Deep Neural Networks with Embedded Invariance},
  year = {2016}, doi = {10.1017/jfm.2016.615}
}

@article{ParishDuraisamy2016FIML,
  author = {Parish, Eric J. and Duraisamy, Karthik},
  title = {A Paradigm for Data-Driven Predictive Modeling Using Field Inversion and Machine Learning},
  year = {2016}, doi = {10.1016/j.jcp.2015.11.012}
}

@article{Rowley2005BalancedPOD,
  author = {Rowley, Clarence W.},
  title = {Model Reduction for Fluids, Using Balanced Proper Orthogonal Decomposition},
  year = {2005}, doi = {10.1142/S0218127405012429}
}

@article{Schmid2010DMD,
  author = {Schmid, Peter J.},
  title = {Dynamic Mode Decomposition of Numerical and Experimental Data},
  year = {2010}, doi = {10.1017/S0022112010001217}
}

@article{SchmidEtAl2011DMDApplications,
  author = {Schmid, Peter J. and Li, L. and Juniper, Matthew P. and Pust, O.},
  title = {Applications of the Dynamic Mode Decomposition},
  year = {2011}, doi = {10.1007/s00162-010-0203-9}
}

@article{ResseguierEtAl2021ROMUncertainty,
  author = {Resseguier, Valentin and Picard, Agustin M. and Mémin, Etienne and Chapron, Bertrand},
  title = {Quantifying Truncation-Related Uncertainties in Unsteady Fluid Dynamics Reduced Order Models},
  year = {2021}, doi = {10.1137/19M1354819}
}

@article{BergerOliger1984AMR,
  author = {Berger, Marsha J. and Oliger, Joseph},
  title = {Adaptive Mesh Refinement for Hyperbolic Partial Differential Equations},
  year = {1984}, doi = {10.1016/0021-9991(84)90073-1}
}

@article{BergerColella1989AMR,
  author = {Berger, Marsha J. and Colella, Phillip},
  title = {Local Adaptive Mesh Refinement for Shock Hydrodynamics},
  year = {1989}, doi = {10.1016/0021-9991(89)90035-1}
}

@article{HayVisonneau2005TurbulentAMR,
  author = {Hay, Alexander and Visonneau, Michel},
  title = {Adaptive Mesh Strategy Applied to Turbulent Flows},
  year = {2005}, doi = {10.1016/j.crme.2004.09.014}
}

@article{PonsinEtAl2015GoalMesh,
  author = {Ponsin, J. and Fraysse, F. and Gómez, M. and Cordero-Gracia, M.},
  title = {An Adjoint-Truncation Error Based Approach for Goal-Oriented Mesh Adaptation},
  year = {2015}, doi = {10.1016/j.ast.2014.10.021}
}

@article{Evensen1994EnKF,
  author = {Evensen, Geir},
  title = {Sequential Data Assimilation with a Nonlinear Quasi-Geostrophic Model Using Monte Carlo Methods to Forecast Error Statistics},
  year = {1994}, doi = {10.1029/94JC00572}
}

@article{TalagrandCourtier1987Variational,
  author = {Talagrand, Olivier and Courtier, Philippe},
  title = {Variational Assimilation of Meteorological Observations with the Adjoint Vorticity Equation. I: Theory},
  year = {1987}, doi = {10.1002/qj.49711347812}
}

@article{YoshidaEtAl2005Regeneration,
  author = {Yoshida, Kyo and Yamaguchi, Junzo and Kaneda, Yukio},
  title = {Regeneration of Small Eddies by Data Assimilation in Turbulence},
  year = {2005}, doi = {10.1103/PhysRevLett.94.014501}
}

@article{WangEtAl2022SparseAssimilation,
  author = {Wang, Yunpeng and Yuan, Zelong and Xie, Chenyue and Wang, Jianchun},
  title = {Temporally Sparse Data Assimilation for the Small-Scale Reconstruction of Turbulence},
  year = {2022}, doi = {10.1063/5.0091391}
}

@article{DuEtAl2023PINN4DVar,
  author = {Du, Yifan and Wang, Mengze and Zaki, Tamer A.},
  title = {State Estimation in Minimal Turbulent Channel Flow: A Comparative Study of 4DVar and PINN},
  year = {2023}, doi = {10.1016/j.ijheatfluidflow.2022.109073}
}

@article{ManoharEtAl2018SparseSensors,
  author = {Manohar, Krithika and Brunton, Bingni W. and Kutz, J. Nathan and Brunton, Steven L.},
  title = {Data-Driven Sparse Sensor Placement for Reconstruction},
  year = {2018}, doi = {10.1109/MCS.2018.2810460}
}

@article{BruntonEtAl2016SensorClassification,
  author = {Brunton, Bingni W. and Brunton, Steven L. and Proctor, Joshua L. and Kutz, J. Nathan},
  title = {Sparse Sensor Placement Optimization for Classification},
  year = {2016}, doi = {10.1137/15M1036713}
}

@article{BidarEtAl2024TurbulentSensors,
  author = {Bidar, Omid and Anderson, Sean and Qin, Ning},
  title = {Sensor Placement for Data Assimilation of Turbulence Models Using Eigenspace Perturbations},
  year = {2024}, doi = {10.1063/5.0182080}
}

@article{ChoiEtAl1994ActiveControl,
  author = {Choi, Haecheon and Moin, Parviz and Kim, John},
  title = {Active Turbulence Control for Drag Reduction in Wall-Bounded Flows},
  year = {1994}, doi = {10.1017/S0022112094000431}
}

@article{QuadrioRicco2004NetDrag,
  author = {Quadrio, Maurizio and Ricco, Pierre},
  title = {Critical Assessment of Turbulent Drag Reduction through Spanwise Wall Oscillations},
  year = {2004}, doi = {10.1017/S0022112004001855}
}

@article{Batchelor1959Scalar,
  author = {Batchelor, George K.},
  title = {Small-Scale Variation of Convected Quantities like Temperature in Turbulent Fluid. Part 1},
  year = {1959}, doi = {10.1017/S002211205900009X}
}

@article{DonzisEtAl2010ScalarResolution,
  author = {Donzis, Diego A. and Yeung, P. K. and Sreenivasan, K. R.},
  title = {Resolution Effects and Scaling in Numerical Simulations of Passive Scalar Mixing in Turbulence},
  year = {2010}, doi = {10.1016/j.physd.2009.09.024}
}

@article{Aref1984ChaoticAdvection,
  author = {Aref, Hassan},
  title = {Stirring by Chaotic Advection},
  year = {1984}, doi = {10.1017/S0022112084001233}
}

@article{MathewEtAl2005MixNorm,
  author = {Mathew, George and Mezić, Igor and Petzold, Linda},
  title = {A Multiscale Measure for Mixing},
  year = {2005}, doi = {10.1016/j.physd.2005.07.017}
}

@article{MathewEtAl2007OptimalMixing,
  author = {Mathew, George and Mezić, Igor and Grivopoulos, Symeon and Vaidya, Umesh and Petzold, Linda},
  title = {Optimal Control of Mixing in Stokes Fluid Flows},
  year = {2007}, doi = {10.1017/S0022112007005332}
}

@article{HofEtAl2008Repeller,
  author = {Hof, Björn and de Lozar, Alberto and Kuik, Dirk Jan and Westerweel, Jerry},
  title = {Repeller or Attractor? Selecting the Dynamical Model for the Onset of Turbulence in Pipe Flow},
  year = {2008}, doi = {10.1103/PhysRevLett.101.214501}
}

@article{AvilaEtAl2011Onset,
  author = {Avila, Kerstin and Moxey, David and de Lozar, Alberto and Avila, Marc and Barkley, Dwight and Hof, Björn},
  title = {The Onset of Turbulence in Pipe Flow},
  year = {2011}, doi = {10.1126/science.1203223}
}

@article{LemoultEtAl2016DirectedPercolation,
  author = {Lemoult, Grégoire and Shi, Liang and Avila, Kerstin and Jalikop, Shreyas V. and Avila, Marc and Hof, Björn},
  title = {Directed Percolation Phase Transition to Sustained Turbulence in Couette Flow},
  year = {2016}, doi = {10.1038/nphys3675}
}

@article{LemoultEtAl2024PuffJamming,
  author = {Lemoult, Grégoire and Mukund, Vasudevan and Shih, Hong-Yan and Linga, Gaute and Mathiesen, Joachim and Goldenfeld, Nigel and Hof, Björn},
  title = {Directed Percolation and Puff Jamming near the Transition to Pipe Turbulence},
  year = {2024}, doi = {10.1038/s41567-024-02513-0}
}

@article{Barkley2011PipeModel,
  author = {Barkley, Dwight},
  title = {Simplifying the Complexity of Pipe Flow},
  year = {2011}, doi = {10.1103/PhysRevE.84.016309}
}

@article{FarazmandSapsis2016Indicators,
  author = {Farazmand, Mohammad and Sapsis, Themistoklis P.},
  title = {Dynamical Indicators for the Prediction of Bursting Phenomena in High-Dimensional Systems},
  year = {2016}, doi = {10.1103/PhysRevE.94.032212}
}

@article{FarazmandSapsis2017Variational,
  author = {Farazmand, Mohammad and Sapsis, Themistoklis P.},
  title = {A Variational Approach to Probing Extreme Events in Turbulent Dynamical Systems},
  year = {2017}, doi = {10.1126/sciadv.1701533}
}

@article{LestangEtAl2018ReturnTimes,
  author = {Lestang, Thibault and Ragone, Francesco and Bréhier, Charles-Edouard and Herbert, Corentin and Bouchet, Freddy},
  title = {Computing Return Times or Return Periods with Rare Event Algorithms},
  year = {2018}, doi = {10.1088/1742-5468/aab856}
}

@article{LestangEtAl2020ExtremeDrag,
  author = {Lestang, Thibault and Bouchet, Freddy and Lévêque, Emmanuel},
  title = {Numerical Study of Extreme Mechanical Force Exerted by a Turbulent Flow on a Bluff Body by Direct and Rare-Event Sampling Techniques},
  year = {2020}, doi = {10.1017/jfm.2020.293}
}

@article{Roberts1973HotWire,
  author = {Roberts, J. B.},
  title = {On the Correction of Hot Wire Turbulence Measurements for Spatial Resolution Errors},
  year = {1973}, doi = {10.1017/S0001924000049332}
}

@article{EwingEtAl1995HotWire,
  author = {Ewing, Daniel and Hussein, Hussein J. and George, William K.},
  title = {Spatial Resolution of Parallel Hot-Wire Probes for Derivative Measurements},
  year = {1995}, doi = {10.1016/0894-1777(95)00001-3}
}

@manual{JCGM1002008,
  author = {{Joint Committee for Guides in Metrology}},
  title = {Evaluation of Measurement Data—Guide to the Expression of Uncertainty in Measurement},
  year = {2008}, doi = {10.59161/JCGM100-2008E}
}

@manual{JCGM1012008,
  author = {{Joint Committee for Guides in Metrology}},
  title = {Propagation of Distributions Using a Monte Carlo Method},
  year = {2008}, doi = {10.59161/JCGM101-2008}
}

@manual{ASMEVV202009,
  author = {{American Society of Mechanical Engineers}},
  title = {Standard for Verification and Validation in Computational Fluid Dynamics and Heat Transfer},
  year = {2009}, url = {https://www.asme.org/codes-standards/find-codes-standards/standard-for-verification-and-validation-in-computational-fluid-dynamics-and-heat-transfer/2009}
}
```

## Verdict

Fluid dynamics contributes a stringent **scale–closure–observation–control
contract**, not a new named architectural primitive. Every efficiency claim
must declare the transported or conserved quantity, scale and support,
discarded state and closure, observation operator, regime and history, target
metric, tail exposure, uncertainty, and complete resource boundary.

The decisive next work is experimental: run E-FLUID-01 through E-FLUID-10 as
adversarial tracks for Candidates 002, 003, 006, 007, 012, 014 and 018. Retire
any residual that does not beat mature CFD, estimation, sparse sensing,
adaptive refinement, control and rare-event baselines at equal information and
lifecycle cost.
