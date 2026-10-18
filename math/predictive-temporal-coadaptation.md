# Predictive temporal co-adaptation without a privileged clock

This note defines the time, observation, coordination, and cost boundary for the
[shared-clock-free benchmark](../experiments/fixtures/001-shared-clock-free-coadaptation.md).
Music supplies the test regime; the measured problem is distributed predictive
control under expressive nonstationarity, delay, role change, and partner
turnover.

## Local clocks and evaluator time

Agent $i$ observes its local clock

$$
\tau_i(t)=a_i t+b_i+\epsilon_i(t)\quad[\mathrm{s}],
$$

where $t$ is hidden evaluator time in seconds, $a_i$ is dimensionless clock
rate, $b_i$ is offset in seconds, and $\epsilon_i$ is local clock error in
seconds. Agents may not read $t$, $a_i$, $b_i$, or another agent's clock. The
evaluator uses $t$ only to score pairwise events and injected disturbances.

For event $n$ sent by partner $j$ and observed by agent $i$,

$$
\tau^{\mathrm{obs}}_{ij,n}
=\tau_i(t_{j,n}+d_{ij,n})+\nu_{ij,n},
$$

where event time $t_{j,n}$ and channel delay $d_{ij,n}$ are seconds and
observation error $\nu_{ij,n}$ is seconds. Delay may be asymmetric,
time-varying, and censored by loss. A shared beat label, synchronized timestamp,
or evaluator clock in the policy input invalidates the shared-clock-free arm.

## Phase and tempo state

Agent $i$ maintains a local phase estimate $\hat\phi_i\in[-\pi,\pi)$ radians,
period estimate $\hat T_i$ in seconds, uncertainty $\sigma_{\phi,i}$ in
radians, and drift estimate $\dot T_i$ in seconds per second. For an observed
partner phase $\phi_{j,n}$,

$$
e_{ij,n}=
\operatorname{wrap}_{[-\pi,\pi)}
(\phi_{j,n}-\hat\phi_i(\tau^{\mathrm{obs}}_{ij,n}))\quad[\mathrm{rad}].
$$

A minimal correction null is

$$
\hat t_{i,n+1}=\hat t_{i,n}+\hat T_{i,n}+\alpha_i a_{ij,n},
$$

where predicted onset $\hat t$, period $\hat T$, and onset asynchrony
$a_{ij,n}=t_{j,n}-\hat t_{i,n}$ are seconds, and gain $\alpha_i$ is
dimensionless. Tempo adaptation requires a separately identifiable update;
folding timing and tempo error into one unconstrained latent state weakens the
diagnosis.

## Pairwise timing outcomes

For paired events $n$ from agents $i$ and $j$, evaluator asynchrony is

$$
A_{ij,n}=t_{i,n}-t_{j,n}\quad[\mathrm{s}].
$$

Report the signed distribution, median absolute asynchrony, $p_{95}$ absolute
asynchrony, circular phase error, and missed or duplicated event count. Similar
mean tempo does not establish synchronization.

After perturbation at $t_p$, recovery time is

$$
T^{\mathrm{sync}}_{ij}=
\inf\left\{t\ge t_p:
\operatorname{median}_{u\in[t,t+\Delta]}|A_{ij}(u)|\le A^{\max}
\land V_{ij}(t:t+\Delta)\le V^{\max}
\right\}-t_p,
$$

where $\Delta$ and $T^{\mathrm{sync}}$ are seconds, $A^{\max}$ is seconds, and
$V_{ij}$ is a declared variance or instability measure with a matching frozen
threshold. Censored failures remain failures rather than disappearing from the
mean.

## Phrase and role state

Timing alone can be excellent while the wrong phrase, motif, answer, or role is
executed. Let $q_n$ be a typed phrase act with boundary, motif relation, literal
constraint, role, and addressee. The partner model is

$$
p_i(q_{j,n+1},r_{j,n+1}\mid
h_{i,n},m_{ij},c_n),
$$

where history $h_{i,n}$, partner memory $m_{ij}$, context $c_n$, phrase act
$q$, and role $r$ are typed variables. Score held-out log loss in bits per act,
calibration, literal constraint satisfaction, phrase-response accuracy, and
role violations separately.

Familiar-partner gain is

$$
G_{\mathrm{partner}}
=Q_{\mathrm{familiar}}-Q_{\mathrm{unseen}},
$$

where $Q$ uses the same dimensionless task-quality measure and task set. A
positive value may reflect replay or overfitting; it earns co-adaptation credit
only when the policy also transfers to new motifs and recovers after partner or
role change.

## Multi-objective outcome

Keep the primary result as a vector:

$$
\mathbf Y=
(Q_{\mathrm{literal}},
|A|_{50},|A|_{95},
T_{\mathrm{sync}},
E_{\mathrm{phrase}},
N_{\mathrm{role\ violation}},
B_{\mathrm{message}},
L_{\mathrm{decision}},
E_{\mathrm{life}}).
$$

$Q_{\mathrm{literal}}$ is dimensionless; asynchronies and recovery are
seconds; phrase error $E_{\mathrm{phrase}}$ is a dimensionless error rate;
$N$ is a count; message traffic $B$ is bytes; decision latency $L$ is seconds;
and lifecycle energy $E_{\mathrm{life}}$ is joules. Blinded human judgments of
coherence or expressivity are additional outcomes, never substitutes for
literal success or timing.

## Lifecycle and equal-budget boundary

For horizon $[0,T]$,

$$
E_{\mathrm{life}}=
E_{\mathrm{sense}}+E_{\mathrm{estimate}}+E_{\mathrm{predict}}+
E_{\mathrm{retrieve}}+E_{\mathrm{message}}+E_{\mathrm{act}}+
E_{\mathrm{adapt}}+E_{\mathrm{rehearse}}+E_{\mathrm{recover}},
$$

with all terms in joules at one boundary. Also report parameter bytes, partner-
memory bytes, messages and bytes per event, evaluator or human queries,
rehearsal events, and wall time. A centralized conductor pays its synchronization
traffic and infrastructure; a local method pays identification and adaptation.

Equal-budget arms receive the same event stream, sensor uncertainty, action
interface, parameter and state ceiling, training examples, rehearsal,
hyperparameter trials, update rate, message budget, latency budget, and energy
boundary. The hidden evaluator trace is paired across arms.

## Rejection conditions

Reject the composed residual when any of the following holds:

1. a phase-locked loop, Kalman/state-space estimator, or MPC arm matches timing
   and recovery;
2. retrieval plus explicit role/protocol state matches phrase response and
   partner turnover;
3. the gain vanishes on new partners, motifs, tempi, or delay processes;
4. a policy observes the privileged clock or hidden perturbation state;
5. familiar-partner gain is replay without adaptation to a new phrase;
6. timing improves while literal constraints or role safety worsen; or
7. adaptation, rehearsal, communication, evaluator work, or recovery energy is
   omitted.

Editable system diagram:
[Shared clock-free coadaptation diagram](../experiments/fixtures/001-shared-clock-free-coadaptation.md#information-boundary).
