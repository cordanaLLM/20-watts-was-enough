# Versioned reconstructive design contract

This note defines the measurement boundary for
[Fixture F-002](../experiments/fixtures/002-versioned-reconstructive-design.md).
The fixture treats proposal generation as reconstruction from declared
exposure and retained history. Novelty is therefore relative to a frozen
reference history, while correctness and usefulness are determined by
constraints, tests, and qualified evaluators.

## Histories, sources, and versions

At step $t$, distinguish three source sets:

- $S^{\mathrm{exp}}_t$: items exposed before the task, whether or not the
  system can retrieve them;
- $S^{\mathrm{ret}}_t$: items returned by a metered retrieval operation during
  the task; and
- $S^{\mathrm{att}}_t$: items attributed as contributing to the current
  artifact.

Each set contains immutable source identifiers and versions. The declared
history against which novelty is scored is

$$
H_t=S^{\mathrm{exp}}_t\cup S^{\mathrm{ret}}_t\cup V_{<t},
$$

where $V_{<t}$ is the set of artifact versions created before step $t$.
Exposure, retrieval, and attribution are not interchangeable: an exposed item
may not be retrieved, a retrieved item may not be used, and a used item may be
omitted from attribution.

For artifact version $v_k$, retain

$$
v_k=(P_k,o_k,u_k,S^{\mathrm{att}}_k,q_k,\tau_k),
$$

where $P_k$ is the set of parent-version identifiers, $o_k$ is the typed
operation, $u_k$ is the actor or process identifier, $S^{\mathrm{att}}_k$ is
the attributed source set, $q_k$ is the test and evaluation record, and
$\tau_k$ is the timestamp in seconds from the run origin. This tuple records a
derivation claim; it does not establish correctness, usefulness, originality,
authenticity, or intent.

## Reconstructive proposal generation

Let $z_{i,t}$ be proposal $i$ at step $t$, $c_t$ the visible task constraints,
$r_t$ the current external representation, and $x_t$ the method's internal
state. A generator samples or searches

$$
z_{i,t}\sim p_m\!\left(z\mid x_t,r_t,c_t,
S^{\mathrm{exp}}_t,S^{\mathrm{ret}}_t,V_{<t}\right),
$$

where $m$ identifies the method. The conditional form makes no claim that the
mechanism is stochastic: deterministic retrieval, CAD transformation, search,
and constraint solving are valid methods. Source-removal, source-replacement,
and history-scrambling interventions estimate which prior material actually
changes the proposal distribution.

For a frozen feature map $\phi$, the relative novelty of proposal $z$ is

$$
N_H(z)=\min_{h\in H}\delta\!\left(\phi(z),\phi(h)\right),
$$

where $\delta$ is a preregistered dimensionless distance and $H$ is the
declared history. Report $N_H$ under task-native features and at least one
independent representation. Changing $H$, $\phi$, or $\delta$ changes the
claim; $N_H$ is not intrinsic novelty.

## Externalization and representation change

An action $a_t$ and observed material or environment response $e_t$ update the
external representation by

$$
r_{t+1}=F_{\rho_t}(r_t,a_t,e_t),
$$

where $\rho_t$ identifies the representation regime, such as raster, vector,
scene graph, CAD, text, simulation state, or physical prototype. A change of
representation is a typed operator

$$
r'_{t}=T_{\rho_t\rightarrow\rho'_t}(r_t),
$$

whose measured losses include constraint violations, geometric error in
millimetres or pixels, missing relations as a count, and lost provenance edges
as a count. Undo, branching, and conversion time are recorded in seconds.

A claimed reinterpretation event must identify a relation found during
inspection that was absent from the immediately preceding registered plan. If
$K_t$ is the coded relation set before inspection and $K_{t+1}$ after it, then

$$
I_t=\left|K_{t+1}\setminus K_t\right|\quad[\mathrm{relation}],
$$

with a published coding protocol and inter-rater reliability. Edit count is
not a substitute for reinterpretation.

## Epistemic action and material feedback

Let $\Theta$ be a hidden task, geometry, material, user, or failure variable
and $b_t$ the current belief state. For an epistemic action $a$, expected
information gain is

$$
\operatorname{EIG}(a\mid b_t)=
H(\Theta\mid b_t)-
\mathbb E_{y\sim p(y\mid a,b_t)}H(\Theta\mid b_t,a,y)
\quad[\mathrm{bit}],
$$

where $y$ is the resulting observation and $H$ is Shannon entropy in bits.
The evaluator estimates realized information gain only against the hidden
ground truth; the method cannot read that trace.

For a physical or simulated probe, record the cost vector

$$
\mathbf c_a=(t_a,E_a,M_a,W_a,R_a),
$$

where $t_a$ is elapsed time in seconds, $E_a$ energy in joules, $M_a$ consumed
material in kilograms, $W_a$ waste in kilograms, and $R_a$ expected harm in a
declared task-native unit. Compare information and decision value at matched
$\mathbf c_a$; motion, rendering, or fabrication alone does not imply an
epistemic gain.

Let hidden material state $\mu$ produce feedback

$$
y^{\mathrm{mat}}_t=g(z_t,a_t,\mu)+\epsilon_t,
$$

where $y^{\mathrm{mat}}_t$ has declared physical units, $g$ is the simulator or
physical response process, and $\epsilon_t$ is measurement error in the same
units. Confirmatory tests withhold materials, simulators, constitutive regimes,
and failure modes so that replayed feedback cannot pass as adaptation.

## Diversity, fixation, and negative transfer

For valid proposal set $Z=\{z_1,\ldots,z_n\}$, report pairwise distances and
feature-space coverage. One summary is

$$
D(Z)=\frac{2}{n(n-1)}
\sum_{1\le i<j\le n}\delta\!\left(\phi(z_i),\phi(z_j)\right),
$$

where $D$ is dimensionless and $n\ge2$ is a proposal count. Also report the
number of distinct valid constraint-satisfying regions reached. Proposal count
is not diversity.

For exposure condition $e$ and matched no-example condition $0$, define
fixation toward exemplar $s$ as

$$
F_e=\mathbb E\!\left[
\delta(\phi(z_0),\phi(s))-
\delta(\phi(z_e),\phi(s))
\right].
$$

A positive dimensionless $F_e$ indicates movement toward the exemplar. It is
not automatically harmful. Negative transfer on outcome component $j$ is

$$
T^-_{e,j}=Y_{0,j}-Y_{e,j},
$$

after orienting $Y_j$ so that larger is better. Report both $F_e$ and
$T^-_{e,j}$: copying can preserve a useful relation, transform a precedent, or
fixate on an invalid one.

## Constraint validity, evaluation, and selection

For proposal $z_i$, let $g_k(z_i)\le0$ be hidden or visible constraint $k$ in
its native unit. Constraint validity is the binary value

$$
V_i=\mathbb 1\!\left[g_k(z_i)\le0\ \text{for every required }k\right].
$$

Also report each margin $-g_k(z_i)$ separately; a valid/invalid bit must not
hide near misses or catastrophic failures.

The primary outcome remains a vector

$$
\mathbf Y_i=
(V_i,N_{H}(z_i),D_i,U_i,A_{i,o,c},R_i,
L_i,E_i,M_i,W_i,P_i),
$$

where $V_i$ is binary constraint validity, $N_H$ and diversity contribution
$D_i$ are dimensionless, $U_i$ is task utility in a declared native unit,
$A_{i,o,c}$ is observer-$o$ and context-$c$ qualified evaluation on a declared
scale, $R_i$ is risk in a task-native unit, latency $L_i$ is seconds, energy
$E_i$ is joules, material $M_i$ and waste $W_i$ are kilograms, and provenance
coverage $P_i$ is dimensionless. Do not collapse this vector into a universal
creativity score.

If a declared utility $U^{*}$ is necessary for selection, publish its weights,
normalization, and sensitivity analysis. Selection regret is

$$
R_{\mathrm{sel}}=
\max_{z\in Z}U^{*}(z)-U^{*}(z^{\mathrm{chosen}}),
$$

in the same unit as $U^{*}$. Evaluate regret with a blinded frozen evaluator
and then report realized post-selection outcome separately. A generator's own
score cannot serve as independent selection evidence.

## Attribution and retained lineage

Let $E^{\mathrm{true}}$ be source-to-version and parent-to-child edges known to
the benchmark generator, and $E^{\mathrm{rec}}$ the submitted lineage edges.
Lineage precision and recall are

$$
P_{\mathrm{lin}}=
\frac{|E^{\mathrm{rec}}\cap E^{\mathrm{true}}|}{|E^{\mathrm{rec}}|},
\qquad
R_{\mathrm{lin}}=
\frac{|E^{\mathrm{rec}}\cap E^{\mathrm{true}}|}{|E^{\mathrm{true}}|}.
$$

Both are dimensionless. Empty submissions receive zero precision and recall.
Source attribution is also scored against benchmark-known influence
interventions; mere string overlap is insufficient.

After delay, tool replacement, or actor turnover, reconstructability of target
version $v$ is

$$
Q_{\mathrm{recon}}(v)=
\frac{1}{|\mathcal Q|}
\sum_{q\in\mathcal Q}
\mathbb 1\!\left[d_q(\widehat v,v)\le\varepsilon_q\right],
$$

where $\mathcal Q$ is a preregistered query set, $d_q$ has the native unit of
query $q$, $\varepsilon_q$ is its tolerance in that unit, and $\widehat v$ is
the reconstructed version. Retaining pixels without source, constraint, test,
and operation lineage can therefore fail reconstruction.

## Lifecycle and equal-budget boundary

For method $m$, charge

$$
\mathbf B_m=(N_{\mathrm{src}},N_{\mathrm{ret}},N_{\mathrm{prop}},
N_{\mathrm{eval}},N_{\mathrm{probe}},t_{\mathrm{human}},t_{\mathrm{wall}},
B_{\mathrm{state}},E_{\mathrm{life}},M_{\mathrm{material}},W_{\mathrm{waste}}),
$$

where the first five terms are counts, both time terms are seconds,
$B_{\mathrm{state}}$ is bytes, $E_{\mathrm{life}}$ is joules, and material and
waste are kilograms. Lifecycle energy is

$$
E_{\mathrm{life}}=E_{\mathrm{train}}+E_{\mathrm{index}}+
E_{\mathrm{retrieve}}+E_{\mathrm{generate}}+E_{\mathrm{inspect}}+
E_{\mathrm{simulate}}+E_{\mathrm{fabricate}}+E_{\mathrm{evaluate}}+
E_{\mathrm{retain}}+E_{\mathrm{recover}},
$$

with every term in joules at one declared boundary. Human preparation,
critique, physical facilities, and failed prototypes are reported even when
they cannot be converted credibly to energy.

Equal-budget comparison either holds every preregistered binding component of
$\mathbf B_m$ within tolerance or compares methods on a Pareto frontier. It
must not divide an over-budget result by cost after the run and call the arm
matched.

## Estimands, ablations, and retirement

For outcome $Y_j$, paired treatment effect of component $c$ is

$$
\Delta_{c,j}=Y_j(m_{\mathrm{full}})-Y_j(m_{-c}),
$$

where $m_{-c}$ removes only component $c$ without reallocating its budget. Use
paired hidden instances and report 95% uncertainty intervals across problem,
source, material, evaluator, and seed strata.

The composed residual is retired when mature nulls match its preregistered
constraint validity, selection regret, transfer, lineage, and lifecycle-cost
targets; when its advantage exists only for seen histories, materials, or
evaluators; when any ablation is non-diagnostic; or when unlogged exposure,
retrieval, evaluator access, lineage, labor, material, or energy can explain
the result.

Editable system diagram:
[Versioned reconstructive design diagram](../experiments/fixtures/002-versioned-reconstructive-design.md#construct-and-information-boundary).
