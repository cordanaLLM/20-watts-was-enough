# Opportunity- and history-qualified adaptive action

This note defines the comparison boundary for
[Fixture F-003](../experiments/fixtures/003-opportunity-history-qualified-action.md).
The fixture uses comparative-cognition tasks as diagnostic interventions, not
as species rankings. Its central requirement is simple: performance can be
compared only after the information, action, learning, and reward opportunities
that produced it are explicit.

## Episode contract

For episode $e$, record

$$
\Omega_e=(X_e,S_e,A_e,H_e,R_e,C_e,\tau_e,U_e),
$$

where $X_e$ is task and apparatus state, $S_e$ is the physically available
sensory channel, $A_e$ is the feasible realized-action set, $H_e$ is training,
rearing, prior-task, and social-exposure history, $R_e$ is the reward,
punishment, deprivation, and stopping rule, $C_e$ is the intervention and
control set, $\tau_e$ is the relevant time in seconds, and $U_e$ is the
sampling unit such as episode, agent, dyad, or population. All fields except
$\tau_e$ are typed records or sets rather than unit-bearing scalars.

The learner receives the causally available prefix

$$
\mathcal I_e(t)=
\{s\in S_e:t_s^{\mathrm{recv}}\le t\}
\cup H_e^{\le t}
\cup R_e^{\le t},
$$

where $t$ and receipt time $t_s^{\mathrm{recv}}$ are seconds. Handler cues,
apparatus sounds, demonstrator traces, residual odor, simulator metadata, and
training-phase identifiers belong in $S_e$ when they are actually available.
Protocol intention is not a measurement of the input channel.

For requested action $a$ and plant version $v$, feasibility is

$$
F_v(a,\Omega_e)\in\{0,1\},
$$

and realized action follows

$$
\widetilde a_t\sim p_v(\widetilde a_t\mid a_t,A_e,X_e,H_e).
$$

$F_v$ is dimensionless. Requested and realized actions retain their native
units, such as metres, radians, newtons, newton-metres, or a discrete tool
identifier. A nominally identical task is not matched when one plant cannot
sense while holding the required tool or cannot execute the required motion.

## Opportunity-qualified performance

For method $m$, success event $Y_e\in\{0,1\}$, and declared opportunity
stratum $\omega$, define

$$
Q_m(\omega)=
\Pr(Y_e=1\mid do(m),\Omega_e\in\omega).
$$

$Q_m$ is dimensionless. The paired contrast against baseline $m_0$ is

$$
\Delta_{m,m_0}(\omega)=Q_m(\omega)-Q_{m_0}(\omega).
$$

Report $\Delta$ by morphology, actual channel, history, reward schedule,
demonstrator exposure, site, and intervention family. A pooled contrast is
admissible only after heterogeneity is shown rather than assumed away.

Use a transport contrast to test whether the learned relation survives a
controlled change $g$:

$$
T_g(m)=Q_m(g(\omega))-Q_m(\omega).
$$

$T_g$ is dimensionless. Useful changes include material substitution, geometry
change, causal inversion, perceptual-cue reversal, morphology or tool swap,
history swap, demonstrator removal, partner turnover, and delayed future use.
The sign is interpreted relative to a preregistered invariance: some changes
should preserve performance; inversions should reverse the selected action.

## Transfer lattice

Do not compress transfer into one difficulty axis. For task family $k$, retain

$$
\mathbf T_k=
(T_{\mathrm{surface}},T_{\mathrm{material}},T_{\mathrm{relation}},
T_{\mathrm{history}},T_{\mathrm{plant}},T_{\mathrm{social}},
T_{\mathrm{delay}}).
$$

Every component is a dimensionless paired effect. Surface and material changes
test perceptual or affordance generalization; relation changes test functional
sensitivity; history and plant changes test dependence on acquisition and
embodiment; social changes identify copied content; and delay changes test the
lifetime of retained state. The vector prevents terminal success on one familiar
apparatus from standing in for causal, prospective, or cross-plant transfer.

First-trial transfer after the held change is reported separately:

$$
T_g^{(1)}(m)=Y_{m,g,1}-Y_{m,g_0,1}.
$$

Later trial curves estimate adaptation, not prior transfer. Both are retained.

## Social acquisition decomposition

A demonstration $d$ is represented as

$$
d=(f,y,\gamma,\iota,\rho,p),
$$

where $f$ is action form, $y$ is end state, $\gamma$ is trajectory, $\iota$ is
demonstrator identity and reliability, $\rho$ is the demonstrated functional
relation, and $p$ is provenance. These are typed variables.

For component $j\in\{f,y,\gamma,\iota,\rho\}$, its causal uptake effect is

$$
I_j=
\mathbb E[L\mid do(d_j=d_j'),d_{-j}]
-\mathbb E[L\mid do(d_j=d_j^0),d_{-j}],
$$

where $L$ is a declared dimensionless learner outcome and $d_{-j}$ holds the
other components fixed. Ghost, result-only, novel-action, inefficient-action,
and causal-relevance controls approximate these interventions. Matching the
end state does not establish copying of action form.

## Prospective and event memory

For stored event or resource $i$,

$$
e_i=(w_i,\ell_i,t_i,q_i,c_i,p_i),
$$

where $w_i$ is content, $\ell_i$ location, $t_i$ time in seconds from a
declared origin, $q_i$ quality or perishability state, $c_i$ social or task
context, and $p_i$ provenance. At future time $t$, a conventional reservation
null uses

$$
V_i(t)=p_i^{\mathrm{avail}}(t\mid e_i)r_i(t)-k_i(t),
$$

where availability probability is dimensionless and reward $r_i$ and
retrieval/carrying cost $k_i$ use the same declared utility unit. A proposed
prospective trace earns credit only beyond value tables, successor
representations, POMDP planning, and retrieval with equal state and rollout
budgets.

Bound-event memory is tested against factorized semantic and spatial state.
For query $q$ over unique event $e_i$, report exact-answer rate, calibration,
update propagation, retrieval latency in seconds, and memory bytes. Subjective
recollection is not an observable in this contract.

## Costed uncertainty control

For optional observation or query $z$ with cost $c_z$, the ordinary
value-of-information null is

$$
\operatorname{VOI}(z\mid b)=
\mathbb E_z\!\left[\max_a\mathbb E[U(a,\theta)\mid b,z]\right]
-\max_a\mathbb E[U(a,\theta)\mid b]-c_z,
$$

where belief $b$ and latent state $\theta$ are dimensionless, while utility
$U$ and $c_z$ use the same declared unit. The policy acquires $z$ only when
VOI is positive. Risk–coverage–cost surfaces must also include calibrated
confidence, ensembles, conformal/selective prediction, learned difficulty
cues, and response-strength policies.

## Local, central, and mechanical contribution

For a compliant plant with $n$ local segments, let the central policy send
message $g_t$ and segment $i$ receive local observation $o_{i,t}$. The realized
control is

$$
u_{i,t}=\pi_i(o_{i,t},g_t,h_{i,t};v),
$$

where local state $h_{i,t}$ is dimensionless, plant version is $v$, and control
$u_{i,t}$ retains its native actuator unit. Compare this with a centralized
policy receiving the same causally available observations and with a passive-
mechanics arm receiving no learned local state.

Communication load over horizon $[0,T]$ is

$$
B_{\mathrm{comm}}(T)=\sum_{m:t_m\le T}\operatorname{bytes}(m)
\quad[\mathrm{bytes}],
$$

and total control energy is

$$
E_{\mathrm{control}}=
E_{\mathrm{sense}}+E_{\mathrm{central}}+E_{\mathrm{local}}
+E_{\mathrm{comm}}+E_{\mathrm{act}}+E_{\mathrm{adapt}}
+E_{\mathrm{recover}}
\quad[\mathrm{J}].
$$

Peripheral credit requires a quality, recovery, latency, or energy gain after
passive compliance, actuator work, sensor power, communication, and local
hardware are charged. Anatomical distribution alone supplies no credit.

## Outcome and lifecycle boundary

Keep the confirmatory result as a vector:

$$
\mathbf Y=
(Q,T^{(1)},\mathbf T,N_{\mathrm{unsafe}},N_{\mathrm{attempt}},
L_{50},L_{95},B_{\mathrm{memory}},B_{\mathrm{comm}},H_{\mathrm{human}},
E_{\mathrm{life}}).
$$

$Q$, $T^{(1)}$, and $\mathbf T$ are dimensionless; unsafe events and attempts
are counts; latencies $L_{50}$ and $L_{95}$ are seconds; memory and
communication are bytes; human effort $H_{\mathrm{human}}$ is person-hours;
and lifecycle energy $E_{\mathrm{life}}$ is joules.

For method $m$ over all development and confirmatory work,

$$
E_{\mathrm{life}}^{(m)}=
E_{\mathrm{train}}+E_{\mathrm{demonstrate}}+E_{\mathrm{search}}
+E_{\mathrm{infer}}+E_{\mathrm{interact}}+E_{\mathrm{communicate}}
+E_{\mathrm{store}}+E_{\mathrm{adapt}}+E_{\mathrm{recover}}
\quad[\mathrm{J}].
$$

The fixture accepts the composed residual only if it improves a preregistered
subset of literal outcomes without violating non-inferiority margins on the
others, survives at least two task families, plant geometries, histories,
model families, and hardware classes, and beats the complete conventional null
stack at the same episodes, interventions, search, storage, communication,
human effort, and energy. Otherwise retain the observation contract and retire
the architectural story.

Editable system diagram:
[Opportunity-history-qualified action diagram](../experiments/fixtures/003-opportunity-history-qualified-action.md#information-and-opportunity-boundary).
