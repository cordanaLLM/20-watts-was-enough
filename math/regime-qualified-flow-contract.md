# Regime-qualified flow inference and control contract

This note defines the dimensional and inferential boundary for
[Fixture F-005](../experiments/fixtures/005-regime-qualified-flow-inference-control.md).
It operationalizes the residual identified by the
[fluid-dynamics and turbulence audit](../research/audits/2026-08-05-fluid-dynamics-turbulence.md)
for [Candidates 002](../experiments/candidates/002-multiscale-context-broadcast.md),
[003](../experiments/candidates/003-recovery-dynamics-fragility.md),
[006](../experiments/candidates/006-reversible-physical-skill.md),
[007](../experiments/candidates/007-endogenous-observation-surveillance.md),
[012](../experiments/candidates/012-latency-qualified-authority.md), and
[014](../experiments/candidates/014-versioned-observation-contract.md).

The equations may be known while the state, boundary, forcing, constitutive
response, unresolved scales, and future regime are not. The benchmark therefore
binds every result to a physical/numerical identity, observation identity,
regime/history identity, target, and complete resource boundary.

## Immutable episode identity

For paired episode $e$, register

$$
I_e=(h_{\mathcal G},h_{\mathcal E},h_{\mathcal B},h_{\mathcal F},
h_{\mathcal N},h_{\mathcal O},h_{\mathcal D},h_{\mathcal A},h_{\mathcal Q}),
$$

where the hashes identify geometry $\mathcal G$, governing equations and
constitutive assumptions $\mathcal E$, initial and boundary conditions
$\mathcal B$, forcing process $\mathcal F$, numerical solver/grid/time-step
configuration $\mathcal N$, observation and calibration operator $\mathcal O$,
data and split lineage $\mathcal D$, actuator/plant interface $\mathcal A$, and
declared quantities of interest $\mathcal Q$. Hashes are byte strings. Identity
of bytes does not establish physical adequacy, convergence, or calibration.

The hidden regime/history record is

$$
R_e=(Re,Pe,Sc,Ro,\mathbf g,\mathbf b,\mathbf f,\mathbf d,r_{0:t},\tau_e),
$$

where $Re$, $Pe$, $Sc$, and Rossby number $Ro$ are dimensionless; $\mathbf g$
is geometry; $\mathbf b$ and $\mathbf f$ are boundary and forcing histories;
$\mathbf d$ is disturbance shape and amplitude in native units; $r_{0:t}$ is
ramp direction, rate, dwell, and prior regime occupancy; and $\tau_e$ is the
episode horizon in seconds. Every dimensioned element of $\mathbf g$,
$\mathbf b$, $\mathbf f$, $\mathbf d$, and $r_{0:t}$ carries a unit in the
episode schema.

## State, closure, and numerical discrepancy

For incompressible Newtonian flow,

$$
\frac{\partial\mathbf u}{\partial t}
+(\mathbf u\cdot\nabla)\mathbf u
=-\frac{1}{\rho}\nabla p+\nu\nabla^2\mathbf u+\mathbf f,
\qquad \nabla\cdot\mathbf u=0,
$$

where velocity $\mathbf u$ is in $\mathrm{m\,s^{-1}}$, time $t$ in seconds,
pressure $p$ in pascals, density $\rho$ in $\mathrm{kg\,m^{-3}}$, kinematic
viscosity $\nu$ in $\mathrm{m^2\,s^{-1}}$, and body acceleration $\mathbf f$
in $\mathrm{m\,s^{-2}}$.

At resolution $\Delta$, represent the resolved evolution as

$$
\dot{\mathbf x}_{\Delta}
=\mathcal N_{\Delta}(\mathbf x_{\Delta},\mathbf b,\mathbf f)
+\mathcal C_{\theta,\Delta}(\mathbf x_{\Delta})
+\boldsymbol\delta_{\Delta}
+\boldsymbol\epsilon_{\Delta},
$$

where $\mathcal N_{\Delta}$ is the declared discretized resolved operator,
$\mathcal C_{\theta,\Delta}$ is a physical or learned closure,
$\boldsymbol\delta_{\Delta}$ is model-form discrepancy, and
$\boldsymbol\epsilon_{\Delta}$ is numerical error. All four right-hand terms
have state-units per second. A fitted residual can contain any mixture of the
last three terms; portability is tested rather than inferred from training
loss.

Let $s(z;\mathcal S_{\mathrm{train}})$ be a preregistered dimensionless support
distance from test condition $z$ to the training support. Closure risk is
reported as a function rather than a pooled mean:

$$
\mathcal R_C(q,s)=
\mathbb E\!\left[
\ell_q\!\left(q(\mathbf x^{\mathrm{ref}}),q(\widehat{\mathbf x})\right)
\mid s(z;\mathcal S_{\mathrm{train}})=s
\right].
$$

$q$ is a declared quantity of interest and loss $\ell_q$ retains the square or
absolute unit induced by $q$. Out-of-support evaluation crosses solver, grid,
order, geometry, boundary treatment, forcing band, $Re$, and regime rather
than using randomly held-out neighboring snapshots.

## Detector, filter, operator, and support identities

Every reported field or event is bound to

$$
J=(\mathcal V,\mathcal K_{\ell},\mathcal H,\mathcal D_{\gamma},
\mathcal S_x,\mathcal S_t,\mathcal F_r),
$$

where $\mathcal V$ is the physical variable, $\mathcal K_{\ell}$ is a filter
and width $\ell$ in metres, $\mathcal H$ is the measurement operator,
$\mathcal D_{\gamma}$ is an event detector with threshold/parameter vector
$\gamma$, $\mathcal S_x$ and $\mathcal S_t$ are spatial and temporal support,
and $\mathcal F_r$ is the reference frame. Two results with different $J$ are
different estimands until a registered transfer map is validated.

For observation time $t_k$,

$$
\mathbf y_k=\mathcal H_{J,k}(\mathbf x_k)+\boldsymbol\eta_k,
\qquad
\boldsymbol\eta_k\sim(\mathbf 0,R_k),
$$

where $\mathbf y_k$ retains sensor units, $R_k$ has squared sensor units, and
$\mathcal H_{J,k}$ includes averaging kernel, exposure time, transfer function,
latency, synchronization, missingness, probe intrusion, and calibration state.
Aggregate supply and recipient-level delivery are different estimands unless a
registered support map identifies them
([C-1488](../research/claims.md#c-1488)). Nominal contact area and aggregate
load likewise do not identify real-contact support or the local-pressure tail
([C-1498](../research/claims.md#c-1498)).
The estimator never receives hidden truth through filenames, simulator
metadata, shared random state, or a truth-identical forward model.

## Signed scale transfer and event fidelity

For filter width $\ell$,

$$
\tau_{ij}^{(\ell)}=\widetilde{u_i u_j}-\widetilde u_i\widetilde u_j,
\qquad
\Pi_{\ell}=-\tau_{ij}^{(\ell)}\widetilde S_{ij},
$$

where stress $\tau_{ij}^{(\ell)}$ is in $\mathrm{m^2\,s^{-2}}$, filtered
strain $\widetilde S_{ij}$ in $\mathrm{s^{-1}}$, and signed transfer
$\Pi_{\ell}$ in $\mathrm{m^2\,s^{-3}}$. The flux score preserves direction:

$$
L_{\Pi}=\int_{\ell_{\min}}^{\ell_{\max}}
w(\ell)\left|
\langle\widehat\Pi_{\ell}\rangle-
\langle\Pi_{\ell}^{\mathrm{ref}}\rangle
\right|d\log\ell,
$$

where $w(\ell)$ is dimensionless and normalized over $d\log\ell$; $L_\Pi$ is
in $\mathrm{m^2\,s^{-3}}$. Report forward-transfer and backscatter event
precision, recall, calibration, amplitude, spatial support, and duration
separately. Matching a spectrum cannot substitute for $L_\Pi$.

For coherent event $a$ extracted by $\mathcal D_{\gamma}$, retain

$$
Z_a=(t_a^{\mathrm{on}},t_a^{\mathrm{off}},\Omega_a,
\Gamma_a,\mathbf c_a,\Delta q_a,J),
$$

where onset and offset are seconds, $\Omega_a$ is spatial support in
$\mathrm{m^3}$ (or the declared lower-dimensional measure), $\Gamma_a$ is a
circulation-like attribute in $\mathrm{m^2\,s^{-1}}$ when applicable,
$\mathbf c_a$ is position in metres, and $\Delta q_a$ is the event-conditioned
change in target $q$. Detector sweeps over reasonable filters, thresholds,
frames, and planes are mandatory; event identity is never silently fixed.

## Reduced state and adaptive allocation

For basis $\Phi_r$ and reduced state $\mathbf a_t$,

$$
\widehat{\mathbf x}_t=\bar{\mathbf x}+\Phi_r\mathbf a_t,
\qquad
\dot{\mathbf a}_t=F_r(\mathbf a_t,\mathbf u_t)+\mathbf c_r(\mathbf a_t),
$$

where rank $r$ is a count, $F_r$ is the projected or inferred dynamics, and
$\mathbf c_r$ closes discarded modes. Basis normalization determines the units
of $\mathbf a_t$. Reconstruction, autonomous rollout, forcing response,
control, transition, and extreme fidelity are distinct losses.

Let available allocation units $i\in\mathcal I_t$ represent mesh cells,
sensors, samples, model capacity, or compute quanta. An adaptive policy chooses
$a_{i,t}\in\{0,1,\ldots\}$ under

$$
\sum_{i\in\mathcal I_t}c_{i,t}a_{i,t}\le B_t,
$$

where cost $c_{i,t}$ and budget $B_t$ use the same declared unit: cell-steps,
bytes, seconds, or joules. Its goal-oriented efficiency is

$$
\eta_{q}(\varepsilon_q)=
\frac{\operatorname{Work}_{\mathrm{uniform}}(\varepsilon_q)}
{\operatorname{Work}_{\mathrm{adaptive}}(\varepsilon_q)},
$$

where both methods attain the same target-error tolerance $\varepsilon_q$ in
the native unit of $q$ and work uses the same ledger. $\eta_q$ is
dimensionless. Regrids, subcycles, rejected steps, data transfers,
synchronization, load imbalance, sensor movement/calibration, and allocator
inference are included.

## Observability, assimilation, and sensor value

For a scaled linearization $\mathbf x_{k+1}=A_k\mathbf x_k$ and
$\mathbf y_k=C_k\mathbf x_k+\boldsymbol\eta_k$, define

$$
W_o(N)=\sum_{k=0}^{N}
\Phi(k,0)^\mathsf T C_k^\mathsf T R_k^{-1}C_k\Phi(k,0),
\qquad
\Phi(k,0)=A_{k-1}\cdots A_0.
$$

$W_o$ is dimensionless only after state and sensor scaling is fixed. Report its
rank and conditioning locally by trajectory, regime, sensor set, noise model,
and horizon; do not promote one linearization to global observability.

For posterior mean $\widehat{\mathbf x}_k$ and covariance $P_k$, the normalized
estimation error squared is

$$
\operatorname{NEES}_k=
(\mathbf x_k-\widehat{\mathbf x}_k)^\mathsf T
P_k^{-1}(\mathbf x_k-\widehat{\mathbf x}_k),
$$

which is dimensionless. Calibration requires coverage and rank-aware tests in
observable and unobservable subspaces, innovation whiteness, and recovery after
dropout. A narrow posterior with structural bias is failure.

For sensor set $S$ and target $q$, use the costed decision value

$$
V_q(S)=
\mathbb E[L_q(\varnothing)-L_q(S)]
-\lambda_E E_S-\lambda_B B_S-\lambda_H H_S,
$$

where $L_q$ is expressed in a declared utility unit, energy $E_S$ in joules,
traffic $B_S$ in bytes, and human maintenance $H_S$ in person-hours. Conversion
weights carry reciprocal units and are preregistered. Also report every raw
term. Placement must remain physically feasible under regime shift, correlated
failure, latency, bandwidth, calibration drift, and probe intrusion.

## Mixing, transition, and extreme-event contracts

For passive scalar $c$ with molecular diffusivity $\kappa$,

$$
\frac{\partial c}{\partial t}+\mathbf u\cdot\nabla c
=\kappa\nabla^2c+s_c,
\qquad
\chi=2\kappa\langle|\nabla c|^2\rangle.
$$

If $c$ is concentration in $\mathrm{kg\,m^{-3}}$, source $s_c$ is in
$\mathrm{kg\,m^{-3}\,s^{-1}}$ and scalar dissipation $\chi$ is in
$\mathrm{kg^2\,m^{-6}\,s^{-1}}$. Mixing outcomes retain scalar variance,
negative-Sobolev mix norm, $\chi$, reaction completion, residence-time
distribution, and remnant concentration at operational support. Visual
filamentation is not a substitute. A countercurrent label likewise cannot
replace finite conductance, capacity-rate, residence, leakage, boundary, and
pump terms ([C-1490](../research/claims.md#c-1490)).

For transition class $c$ with history $r_{0:t}$, define hazard

$$
\lambda_c(t\mid\mathbf y_{0:t},r_{0:t})
=\lim_{\Delta t\downarrow0}
\frac{\Pr(t\le T_c<t+\Delta t\mid T_c\ge t,
\mathbf y_{0:t},r_{0:t})}{\Delta t},
$$

with units $\mathrm{s^{-1}}$. Report event-time likelihood, class-conditional
calibration, lead time in seconds, false-alarm burden, abstention, and competing
hazards. Ramp direction/rate, disturbance amplitude/shape, dwell, censoring,
domain, and observation history are part of the conditioning state.

For extreme observable $Q$ and preregistered threshold $q_*$,

$$
p_*=\Pr(Q>q_*),
\qquad
T_R=\frac{\Delta t_{\mathrm{eff}}}{p_*},
$$

where $p_*$ is dimensionless and return period $T_R$ is seconds when
$\Delta t_{\mathrm{eff}}$ is the effective independent sampling interval in
seconds. Weighted rare-event estimators publish weights, effective sample size,
degeneracy, variance, and validation on an untouched natural-distribution
stream. Enriched event frequency without reweighting is invalid.

## Control stability and complete energy

For plant state $\mathbf x$, command $\mathbf u_c$, disturbance $\mathbf w$,
and delayed observation $\mathbf y_{t-d}$,

$$
\dot{\mathbf x}=F(\mathbf x,\mathbf u_c,\mathbf w),
\qquad
\mathbf u_c=\pi(\mathbf y_{t-d},\widehat R_t),
$$

where delay $d$ is seconds and command components retain actuator units. Sweep
delay, bandwidth, saturation, noise, forcing, regime, plant drift, failure, and
fallback. Report constraint violations, gain/phase margins where defined,
closed-loop poles for linearized controllers, bounded-input response, recovery,
and runtime-monitor interventions. A task gain with unstable or unsafe strata
does not enter an aggregate score. Equal mean flow also cannot establish phase
margin or absence of coupled-delay oscillation
([C-1492](../research/claims.md#c-1492)). Rate/state stick--slip supplies the
same mean-versus-dynamics warning for interface state, compliance, inertia,
damping, bandwidth, and control delay
([C-1501](../research/claims.md#c-1501)).

Over service interval $[0,T]$, operational net energy is

$$
E_{\mathrm{net}}=\int_0^T
\left(P_{\mathrm{base}}-P_{\mathrm{controlled}}-P_{\mathrm{act}}
-P_{\mathrm{sense}}-P_{\mathrm{compute}}-P_{\mathrm{network}}
-P_{\mathrm{store}}-P_{\mathrm{aux}}\right)dt,
$$

where every power is watts, $T$ is seconds, and $E_{\mathrm{net}}$ is joules.
Report all terms separately. Installation, embodied energy, calibration,
maintenance, retraining, replacement, and end-of-life costs are additional
joule rows amortized only over a declared service life and duty cycle.

The complete run record is

$$
\mathbf K_m=(N_{\mathrm{cell\text{-}step}},N_{\mathrm{sample}},N_{\mathrm{solve}},
B_{\mathrm{moved}},B_{\mathrm{stored}},T_{\mathrm{wall}},M_{\mathrm{peak}},
H_{\mathrm{human}},E_{\mathrm{facility}},E_{\mathrm{sense}},E_{\mathrm{act}},
E_{\mathrm{compute}},E_{\mathrm{network}},E_{\mathrm{store}},
E_{\mathrm{embodied}},E_{\mathrm{maintenance}}).
$$

Counts are dimensionless, bytes are bytes, times are seconds, peak memory is
bytes, human work is person-hours, and every energy row is joules. Failed runs,
search, data generation, tuning, verification, standby, and unused reservations
remain in the ledger.

## Outcome vector and decision

Keep the confirmatory outcome as a typed vector

$$
\mathbf Y=(Y_{\mathrm{field}},Y_{\mathrm{flux}},Y_{\mathrm{tail}},
Y_{\mathrm{event}},Y_{\mathrm{closure}},Y_{\mathrm{ROM}},
Y_{\mathrm{refine}},Y_{\mathrm{assim}},Y_{\mathrm{sensor}},
Y_{\mathrm{control}},Y_{\mathrm{mix}},Y_{\mathrm{transition}},
Y_{\mathrm{extreme}},Y_{\mathrm{measure}},\mathbf K_m).
$$

Each component retains its literal units and uncertainty. No weighted fluid,
physics, fidelity, or efficiency score may replace it. The proposed composition
survives only if it beats the strongest complete mature null at equal
information and lifecycle budget on preregistered components, remains
non-inferior on protected stability, calibration, conservation, and tail
components, transfers across hidden regimes and model/hardware families, and
has an isolating ablation. Otherwise retain this contract and retire the
architectural explanation.

Editable system diagram:
[Regime-qualified flow inference control diagram](../experiments/fixtures/005-regime-qualified-flow-inference-control.md#identity-and-leakage-boundary).
