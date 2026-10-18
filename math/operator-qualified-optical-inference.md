# Operator-qualified optical inference contract

This note defines the quantitative boundary for
[Fixture F-007](../experiments/fixtures/007-operator-qualified-optical-inference.md).
It operationalizes the measurement-operator-aware residual from the
[optics, photonics, and inverse-sensing audit](../research/audits/2026-08-05-optics-photonics-inverse-sensing.md).
The contract binds every decoded output to a versioned physical operator,
separates measurement information from prior selection, and compares optical,
digital, and hybrid routes at equal task information and lifecycle budget.

## Episode and operator identity

For episode $e$ and acquisition $t$, seal

$$
I_{e,t}=(X_e,A_{e,t},\nu_{e,t},C_{e,t},R_{e,t},Q_e,B_e),
$$

where $X_e$ identifies the physical scene or latent-state generator,
$A_{e,t}$ identifies the acquisition action, $\nu_{e,t}$ is an immutable
operator-version identifier, $C_{e,t}$ is the calibration record, $R_{e,t}$
is the hidden regime record, $Q_e$ is the registered downstream-query set, and
$B_e$ is the resource-budget record. Identifiers and hashes are byte strings;
timestamps within the records are seconds [s] from a declared clock origin.

Let $\mathcal X$ be the admissible latent-state space and let
$x_e\in\mathcal X$ be the latent physical state. Each component of $x_e$
retains its native unit, such as radiance [W sr$^{-1}$ m$^{-2}$], range [m],
or concentration [mol m$^{-3}$]. The observation is

$$
y_{e,t}=g_{e,t}\!\left(\mathcal H_{\nu_{e,t}}
(a_{e,t},c_{e,t})x_e\right)+n_{e,t},
$$

where $a_{e,t}$ is the acquisition action, $c_{e,t}$ is the calibrated
parameter vector, $\mathcal H_{\nu_{e,t}}$ is the versioned physical forward
operator, $g_{e,t}$ is the detector response including conversion and clipping,
$n_{e,t}$ is additive or conditionally specified noise, and $y_{e,t}$ is the
raw observation in detector counts [count] or another declared sensor unit.
The operator carries the conversion units required to map components of $x_e$
to the input unit of $g_{e,t}$. Any non-additive, coherent, correlated, or
signal-dependent noise is part of the likelihood rather than being hidden in
$n_{e,t}$.

The submitted observation contract is

$$
O_{e,t}=(y_{e,t},a_{e,t},\nu_{e,t},c_{e,t},
\Sigma^{c}_{e,t},M^{\mathrm{sat}}_{e,t},
\tau_{e,t},\mathcal V_{e,t}),
$$

where $\Sigma^{c}_{e,t}$ is calibration-parameter covariance in the squared
native parameter units, $M^{\mathrm{sat}}_{e,t}$ is a binary saturation or
dead-time mask, $\tau_{e,t}$ is acquisition time [s], and
$\mathcal V_{e,t}$ is the declared validity envelope. The contract is invalid
outside $\mathcal V_{e,t}$ until recalibrated or explicitly downgraded.

## Aperture, diffraction, and recoverable modes

For wavelength $\lambda$ [m] and numerical aperture $\mathrm{NA}$
[dimensionless], the conventional Rayleigh lateral scale for two incoherent
point sources is

$$
d_{\mathrm R}=0.61\frac{\lambda}{\mathrm{NA}}
\quad [\mathrm m].
$$

$d_{\mathrm R}$ is a criterion under stated imaging assumptions, not a
universal task-resolution value. Aperture diameter $D_{\mathrm{ap}}$ [m],
focal length $f$ [m], field of view $\Omega$ [sr], coherence, sampling pitch
$p_{\mathrm{samp}}$ [m], exposure,
and noise must be reported separately. A reconstructed pixel pitch below
$d_{\mathrm R}$ does not by itself establish additional measured information.

For a linearized forward operator $H_{e,t}$ with singular-value decomposition

$$
H_{e,t}=U_{e,t}\Sigma_{e,t}V_{e,t}^{*},
$$

$U_{e,t}$ and $V_{e,t}$ are unitary bases, $V_{e,t}^{*}$ is the conjugate
transpose, and diagonal entry $\sigma_{e,t,j}$ of $\Sigma_{e,t}$ has the units
of $H_{e,t}$. A state perturbation $v_{e,t,j}$ in the corresponding right
singular direction is unidentifiable from that acquisition when
$\sigma_{e,t,j}=0$. For a preregistered tolerance $\epsilon_H$ with the same
units as a singular value, define the effective measured rank

$$
r_{\epsilon_H}(H_{e,t})=
\sum_j\mathbb 1[\sigma_{e,t,j}>\epsilon_H]
\quad [\mathrm{mode}],
$$

where $\mathbb 1[\cdot]$ is the indicator function and $j$ indexes singular
modes. Report the full singular spectrum or a validated task-relevant summary;
$r_{\epsilon_H}$ is threshold-qualified.

For two task-distinct states $x_1$ and $x_2$, likelihood separation is

$$
D_{12}=D_{\mathrm{KL}}\!\left(
p(y\mid x_1,a,c,\nu)\,\|\,p(y\mid x_2,a,c,\nu)
\right)\quad [\mathrm{nat}],
$$

where $D_{\mathrm{KL}}$ is Kullback--Leibler divergence in nats. The null-space
honesty track treats $x_1$ and $x_2$ as measurement-indistinguishable when
$D_{12}$ lies below a preregistered discrimination threshold supported by a
power calculation. A method must then return calibrated alternatives, a bound,
or abstention unless it acquires additional evidence.

The [Fixture F-007 analytical likelihood plot](visual-models.md#contextual-analytical-figures)
visualizes one such indistinguishable base operator and a separating added
measurement. It is not an empirical performance result.

## Photons, detector response, and dynamic range

For detector element $i$, use the photon-counting model when its assumptions
hold:

$$
k_i\sim\operatorname{Poisson}(\mu_i),
\qquad
\mu_i=\eta_i\Phi_i\tau_i+b_i,
$$

where $k_i$ is detected count [count], $\mu_i$ is expected count [count],
$\eta_i$ is quantum or detection efficiency [dimensionless], $\Phi_i$ is
incident photon rate [photon/s], $\tau_i$ is exposure [s], and $b_i$ is expected
background plus dark count [count]. For the ideal background-free Poisson case,

$$
\operatorname{SNR}_{\mathrm{shot}}=\sqrt{N_\gamma},
$$

where $N_\gamma$ is expected detected photon count [count] and the signal-to-
noise ratio is dimensionless. Read noise [electron rms], fixed-pattern error,
coherent receiver noise, afterpulsing, pile-up, and dead time receive explicit
terms whenever present.

For full-well or count-rate limit $K_i^{\max}$ [count], a simplified clipped
detector output is

$$
y_i=\min(k_i,K_i^{\max}),
\qquad
s_i=\mathbb 1[k_i\ge K_i^{\max}],
$$

where $y_i$ is recorded count [count] and $s_i$ is a dimensionless saturation
indicator. The saturation fraction is

$$
F_{\mathrm{sat}}=
\frac{1}{N_{\mathrm{det}}}
\sum_{i=1}^{N_{\mathrm{det}}}s_i,
$$

where $N_{\mathrm{det}}$ is detector-element count [element] and
$F_{\mathrm{sat}}$ is dimensionless. Report full well, count-rate ceiling,
read noise, dark signal, analog-to-digital converter range, and dead-time or
pile-up policy independently; nominal bit depth is not dynamic range.

## Phase ambiguity and prior-qualified reconstruction

For coherent intensity measurement,

$$
y=|Ax|^2+n,
$$

where $A$ is a declared complex-valued propagation and sampling operator, $x$
is a complex field amplitude in a declared native unit, $y$ is intensity or
detector count in its native unit, $|\cdot|^2$ is elementwise squared magnitude,
and $n$ is measurement noise in the same unit as $y$. The ambiguity class is

$$
\mathcal E(y;A)=
\{x'\in\mathcal X:|Ax'|^2=|Ax|^2\},
$$

where $\mathcal E$ is a set of physically admissible fields. Global phase,
translation, conjugate inversion, and geometry-specific ambiguities are scored
as separate equivalence relations when applicable.

For reconstruction method $m$ with prior $\pi_m(x)$ and likelihood
$p_m(y\mid x,O)$, the posterior is

$$
p_m(x\mid y,O)=
\frac{p_m(y\mid x,O)\pi_m(x)}
{\int_{\mathcal X}p_m(y\mid x',O)\pi_m(x')\,\mathrm dx'},
$$

where $O$ is the observation contract, $x'$ is an integration variable with
the same native units as $x$, and the posterior density carries the reciprocal
units implied by the measure $\mathrm dx'$. Method $m$ must label information
origin as measurement, prior, calibration, or active intervention.

For hidden truth $x_e$ and a nominal $(1-\alpha)$ credible set
$\mathcal C_{m,e,1-\alpha}$, empirical coverage over $N$ independent episodes is

$$
\widehat{\operatorname{Cov}}_{m,1-\alpha}=
\frac{1}{N}\sum_{e=1}^{N}
\mathbb 1[x_e\in\mathcal C_{m,e,1-\alpha}],
$$

where $\alpha$ and coverage are dimensionless and $N$ is episode count
[episode]. Report coverage after source-family, texture, sparsity, positivity,
motion, and noise-model shifts. Perceptual quality and truth fidelity remain
separate outcomes.

## Active sensing and illumination safety

Let $b_t$ be the belief state before action $a$, $\theta$ the uncertain task
state, $d$ a downstream decision, $U(d,\theta)$ task utility in a declared
native unit, and $y$ the prospective observation. Expected value of information
is

$$
\operatorname{EVI}(a\mid b_t)=
\mathbb E_{y\sim p(y\mid a,b_t)}
\left[\max_d\mathbb E[U(d,\theta)\mid b_t,a,y]\right]
-\max_d\mathbb E[U(d,\theta)\mid b_t].
$$

$\operatorname{EVI}$ has the same unit as $U$. Action admissibility is the
componentwise condition

$$
\mathbf c(a)=
(N_\gamma,E_a,L_a,D_a,W_a,R_a)
\preceq
(N_\gamma^{\max},E_a^{\max},L_a^{\max},D_a^{\max},W_a^{\max},R_a^{\max}),
$$

where $N_\gamma$ is incident or detected photon count [photon] as explicitly
labeled, $E_a$ is energy [J], $L_a$ is latency [s], $D_a$ is dose in the
task-native safety unit, $W_a$ is actuator wear [cycle], and $R_a$ is risk on a
declared scale. Superscript $\max$ denotes the preregistered ceiling in the same
unit, and $\preceq$ means every component is within its ceiling. A scalarized
cost may guide a policy only after the component ceilings are enforced and its
weights are published.

## Multiplex, fusion, and calibration crossover

For route $r$ in regime $\rho$, define the protected outcome vector

$$
\mathbf Y_{r,\rho}=
(L_{\mathrm{task}},U_{\mathrm{cal}},N_\gamma,E_{\mathrm{life}},
T_{\mathrm{wall}},F_{\mathrm{sat}},C_{\mathrm{cross}}),
$$

where $L_{\mathrm{task}}$ is task loss in its native unit,
$U_{\mathrm{cal}}$ is dimensionless uncertainty-calibration error,
$N_\gamma$ is photon count [photon], $E_{\mathrm{life}}$ is lifecycle energy
[J], $T_{\mathrm{wall}}$ is wall latency [s], $F_{\mathrm{sat}}$ is saturation
fraction [dimensionless], and $C_{\mathrm{cross}}$ is dimensionless crosstalk.
Direct and multiplexed routes are compared componentwise across photon flux,
background, detector noise, occupancy, crosstalk, and saturation regimes; no
single favorable point establishes an advantage.

For two sensor estimates $\hat x_1$ and $\hat x_2$ with errors
$e_1=\hat x_1-x$ and $e_2=\hat x_2-x$, retain

$$
P_{12}=\mathbb E[e_1e_2^{\top}],
$$

where $P_{12}$ is cross-covariance in squared native state units and
$e_2^{\top}$ is transpose. Setting $P_{12}=0$ is a tested assumption, not a
default. Fused estimates must report marginal covariance, cross-covariance or
a justified bound, alignment error in native spatial and temporal units, and
failure under common-mode perturbations.

For reference measurement $r_t^{\mathrm{ref}}$ and calibrated prediction
$\widehat r^{\mathrm{ref}}(c_t)$ in the same observation unit, define

$$
z_t^2=(r_t^{\mathrm{ref}}-\widehat r^{\mathrm{ref}}(c_t))^{\top}
S_t^{-1}(r_t^{\mathrm{ref}}-\widehat r^{\mathrm{ref}}(c_t)),
$$

where $S_t$ is residual covariance in squared observation units and $z_t^2$ is
dimensionless. The monitor declares a threshold $z_{\max}^2$, a window length
$w$ [sample], a false-alarm target [dimensionless probability], and a fallback.
Detection delay is seconds [s], recovery time is seconds [s], calibration cost
is samples [sample] and joules [J], and pre-detection task loss is reported in
the task's native unit. Scene shift, source drift, alignment drift, detector
gain, and thermal drift are separate hidden causes.

## Optical, digital, and hybrid route accounting

For route $r$, end-to-end latency is

$$
T_r=T_{\mathrm{integrate}}+T_{\mathrm{encode}}+T_{\mathrm{propagate}}+
T_{\mathrm{detect}}+T_{\mathrm{convert}}+T_{\mathrm{transfer}}+
T_{\mathrm{digital}}+T_{\mathrm{control}},
$$

where every term is seconds [s]. Optical propagation time cannot replace
$T_r$. The route identity fixes input origin, operator shape, batch, sparsity,
effective precision, output dimension, programming frequency, operator reuse,
utilization, and duty cycle.

Let the intended transform be $u=Wv$, where $v$ is an input vector in declared
native units, $W$ is a linear operator with corresponding conversion units,
and $u$ is the desired output vector. Device $d$ at temperature $\vartheta$
[K] and age $\ell$ [s] realizes

$$
\widehat u_{d,\vartheta,\ell}=
(W+\Delta W_{d,\vartheta,\ell})v+
\epsilon^{\mathrm{analog}}_{d,\vartheta,\ell}+
\epsilon^{\mathrm{read}}_{d,\vartheta,\ell},
$$

where $\Delta W_{d,\vartheta,\ell}$ has the units of $W$,
$\epsilon^{\mathrm{analog}}$ is analog transform error in output units, and
$\epsilon^{\mathrm{read}}$ is detector, conversion, and readout error in output
units. Report bias, covariance, tails, effective precision [bit], and task loss
separately across fan-in, depth, device, temperature, age, and workload.

For device population $\mathcal D$ with $N_D$ fabricated devices, fabrication
yield is

$$
Y_{\mathrm{fab}}=
\frac{1}{N_D}\sum_{d\in\mathcal D}
\mathbb 1[d\text{ meets the preregistered envelope}],
$$

where $Y_{\mathrm{fab}}$ is dimensionless and $N_D$ is device count [device].
The envelope includes transfer-function error, task quality, trimming time [s],
tuning energy [J], steady thermal power [W], thermal crosstalk [dimensionless or
a declared transfer unit], and stability over the declared interval. Failed
dies remain in the denominator.

## Query-registered physical compaction

Let encoder $h$ transform raw observation record $O$ into retained artifact
$z=h(O)$ with size $S_z$ [byte]. After the encoder is frozen, query $q$ from
registered set $Q$ produces answer $f_q(O)$ from raw data and reconstructed
answer $\widehat f_q(z)$ from the retained artifact. Query recovery is

$$
R_Q(z)=\frac{1}{|Q|}\sum_{q\in Q}
\mathbb 1\!\left[
d_q\!\left(\widehat f_q(z),f_q(O)\right)\le\epsilon_q
\right],
$$

where $|Q|$ is query count [query], $d_q$ is error in the native unit of query
$q$, $\epsilon_q$ is a tolerance in the same unit, and $R_Q$ is dimensionless.
The confirmatory evaluator adds sealed future queries and an incident-
investigation query after route and retention policies are frozen. Failure is
reported as lost query classes, not only as an average score.

## Lifecycle, labor, and matched budgets

For one accepted output, complete lifecycle energy is

$$
\begin{aligned}
E_{\mathrm{life}}={}&E_{\mathrm{source}}+E_{\mathrm{modulate}}+
E_{\mathrm{propagate}}+E_{\mathrm{detect}}+E_{\mathrm{ADC}}+E_{\mathrm{DAC}}\\
&+E_{\mathrm{control}}+E_{\mathrm{digital}}+E_{\mathrm{thermal}}+
E_{\mathrm{facility}}+E_{\mathrm{calibrate}}+E_{\mathrm{maintain}}+
E_{\mathrm{embodied}},
\end{aligned}
$$

where every term is joules [J] and analog-to-digital and digital-to-analog
conversion are denoted ADC and DAC. Powered propagation elements are charged
to $E_{\mathrm{propagate}}$; passive loss appears through increased source or
amplifier demand. Amortized embodied energy is

$$
E_{\mathrm{embodied}}=
\frac{E_{\mathrm{fabricate}}+E_{\mathrm{package}}+E_{\mathrm{replace}}-
E_{\mathrm{recover}}}{N_{\mathrm{accepted,life}}},
$$

where numerator terms are joules [J] and $N_{\mathrm{accepted,life}}$ is the
accepted-output count [output] over measured or conservatively modeled service
life. Negative recovery credit must be independently substantiated.

The equal-budget vector for method $m$ is

$$
\mathbf B_m=(N_{\mathrm{train}},N_{\mathrm{scene}},N_\gamma,D_{\mathrm{dose}},
N_{\mathrm{act}},N_{\mathrm{cal}},N_{\mathrm{fab}},N_{\mathrm{query}},
S_{\mathrm{state}},T_{\mathrm{wall}},T_{\mathrm{human}},E_{\mathrm{life}}),
$$

where $N_{\mathrm{train}}$ is training-example count [example],
$N_{\mathrm{scene}}$ is physical-scene count [scene], $N_\gamma$ is photon
count [photon], $D_{\mathrm{dose}}$ is dose in a declared task-native unit,
$N_{\mathrm{act}}$ is actuator-cycle count [cycle], $N_{\mathrm{cal}}$ is
calibration-sample count [sample], $N_{\mathrm{fab}}$ is fabricated-device
count [device], $N_{\mathrm{query}}$ is evaluator-query count [query],
$S_{\mathrm{state}}$ is retained and working storage [byte],
$T_{\mathrm{wall}}$ is wall time [s], $T_{\mathrm{human}}$ is labor
[person-hour], and $E_{\mathrm{life}}$ is lifecycle energy [J]. Human design,
alignment, labeling, tuning, calibration, inspection, safety review,
maintenance, and incident response remain role-stratified entries.

An arm is budget-matched only when every binding component is within its
preregistered tolerance or when the comparison is explicitly a Pareto frontier.
Freed budget from an ablation remains unused.

## Protected outcome vector and retirement estimand

Keep the following outcome families separate:

$$
\mathbf Z_m=(Z_{\mathrm{aperture}},Z_{\mathrm{photon}},Z_{\mathrm{phase}},
Z_{\mathrm{prior}},Z_{\mathrm{drift}},Z_{\mathrm{range}},Z_{\mathrm{fusion}},
Z_{\mathrm{transform}},Z_{\mathrm{conversion}},Z_{\mathrm{analog}},
Z_{\mathrm{fabrication}},Z_{\mathrm{thermal}},Z_{\mathrm{safety}},
Z_{\mathrm{lifecycle}}),
$$

where the components respectively contain aperture/diffraction results,
photon/shot-noise results, phase-ambiguity results, prior-mismatch results,
calibration/drift results, saturation/dynamic-range results, fusion-covariance
results, optical-transform results, conversion/readout results, analog-error
results, fabrication results, thermal-work results, active-illumination safety
results, and full lifecycle energy and labor results. Each $Z$ is a structured record with
the native units defined above; the vector is not scalarized for acceptance.

For protected component $j$, the paired effect of mechanism $k$ is

$$
\Delta_{k,j}=Z_j(m_{\mathrm{full}})-Z_j(m_{-k}),
$$

where $m_{-k}$ removes only mechanism $k$ and receives no replacement resource.
Report $\Delta_{k,j}$ in the native unit of outcome $j$ with a 95% uncertainty
interval over independent scene, operator, regime, device, site, and seed
strata.

Retire the residual when an equal-budget mature-null composition matches the
protected vector; when a gain depends on hidden prior, operator, calibration,
or query leakage; when it fails held-out devices or regimes; or when no
preregistered ablation isolates value beyond the registered inverse,
uncertainty, sensing, control, acceleration, optical, hybrid-design, and
calibration baselines. The fixture contract diagram is
[Operator-qualified physical inference diagram](../experiments/fixtures/007-operator-qualified-optical-inference.md#identity-evidence-and-leakage-boundary).
