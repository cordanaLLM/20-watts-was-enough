# Sports expertise, adaptive performance, and team coordination: primary-source audit

- **Audit date:** 2026-08-05
- **Scope:** perceptual anticipation and occlusion, representative learning
  design, deliberate practice and its limits, motor variability and exploration,
  constraints-led adaptation, speed–accuracy tradeoffs, fatigue and pacing,
  recovery and readiness, injury and return to play, team coordination and
  shared information, opponent modelling and deception, coaching feedback,
  talent identification and selection bias, ecological validity, and complete
  workload, energy, and human-effort accounting
- **Evidence rule:** audit-local claims describe bounded observations from
  primary experiments, cohorts, or authoritative measurement standards.
  Reviews and frameworks organize disputes; they do not convert associations
  into mechanisms.
- **Promotion state:** audit-local `SPORT-` claims only. No stable claim,
  principle, candidate, or central reference is promoted by this file.

## Executive finding

Sport exposes adaptive control under deadlines, incomplete evidence, physical
cost, adversarial behavior, changing teammates, and irreversible failure. Its
most transferable findings are measurement disciplines rather than a novel
learning primitive:

- experts can extract useful information from earlier opponent kinematics, but
  the effect is cue-, task-, opponent-, and response-mode-specific;
- temporal or spatial occlusion identifies when or where predictive information
  is available; it does not identify a unique internal representation;
- video judgment, joystick choice, partial movement, and full interception are
  different tasks because perception and action possibilities differ;
- training transfer improves when the information and action coupling needed at
  test is preserved, yet literal surface duplication is neither necessary nor
  sufficient;
- practice volume is associated with expertise, but retrospective hours,
  selection, survivorship, access, maturation, and practice quality prevent a
  deterministic “hours in, expertise out” rule;
- variability can support exploration and transfer when it changes a relevant
  task dimension at an interpretable challenge level; indiscriminate noise can
  impair acquisition or offer no retention benefit;
- speed, accuracy, risk, and energetic cost form a frontier. Reporting only one
  endpoint can make a policy look better by silently moving along that frontier;
- fatigue changes the state from which an action is controlled. The same
  command, cue, or workload is not equivalent across resource histories;
- pacing responds to local resource state, expected remaining work, opponent
  behavior, and feedback, but experimental deception produces mixed and
  task-bounded effects;
- readiness is a latent, multidimensional state. A single wellness score, jump,
  heart-rate feature, workload ratio, or elapsed-time threshold cannot certify
  it;
- return to sport is a staged, reversible exposure decision, not a timestamp or
  a single pass/fail symmetry score;
- team coordination can become less communication-intensive with joint
  practice, while synchrony alone does not show shared knowledge, causality, or
  successful coordination;
- deceptive actions exploit an observer's cue policy. Expertise can reduce some
  susceptibility without creating immunity, and confidence can rise precisely
  when a judgment is wrong;
- augmented feedback can improve learning in particular tasks, but immediate
  practice performance, delayed retention, transfer, autonomy, and feedback
  dependence must remain separate;
- talent systems alter the population they later claim to measure. Relative age,
  biological maturity, opportunity, attrition, and missing counterfactual
  careers are part of the causal system; and
- training cost includes athlete and coach time, metabolic and facility energy,
  equipment, data collection, recovery, medical burden, failed trials, and
  opportunity cost. “Equal compute” is not an equal budget when those terms
  differ.

The narrow residual is a **representative, history- and resource-qualified
adaptive-performance contract**. Every comparison retains what could be seen,
what could be done, how the system was trained, whom it faced, its current
resource and damage state, and the cost of reaching and maintaining that state.
This contract refines existing principles and candidate evaluations. Mature
control, reinforcement learning, curriculum, system-identification, robust
optimization, multi-agent, and causal-inference baselines already cover the
candidate mechanisms. No exact causal residual survives them here.

## Outcome firewall

The following outcomes must not be substituted for one another.

| Outcome | Operational question | Minimum measurement | Invalid substitution |
| --- | --- | --- | --- |
| anticipation | can an action outcome be predicted before outcome information arrives? | time-resolved accuracy or proper score by occlusion point and opponent | expert label or fast reaction time |
| interception | can the predicted event be physically met under its real deadline? | success, movement onset, trajectory, endpoint error, and safety | verbal or joystick prediction |
| cue use | does removing or neutralizing a declared feature change prediction? | intervention contrast with residual information quantified | gaze location or feature saliency alone |
| decision quality | does the chosen action improve a declared task objective? | reward, regret, risk, latency, and calibration | choice agreement with a coach |
| practice performance | what happens while instructions, feedback, and repetitions are present? | acquisition curve with attempt count and exposure time | delayed learning |
| retention | does capability persist after a declared delay without the training scaffold? | delayed test with delay in hours or days | end-of-practice score |
| transfer | does learning survive a specified change in opponent, cue, body, rule, or environment? | source–target matrix and uncertainty | retention on the practiced task |
| exploration | does behavior cover relevant action or outcome regions and discover useful solutions? | coverage, diversity, information gain, and later utility | raw movement variance |
| adaptability | does performance recover after a perturbation or regime change? | loss, recovery time, overshoot, and recurrence | high stationary accuracy |
| pacing | how is effort distributed over a bounded task? | time series of output, speed, perceived effort, and endpoint | final time alone |
| fatigue | what reversible capacity or control change follows exertion? | task-specific pre/post change plus recovery curve | session duration or subjective tiredness alone |
| readiness | what actions are admissible now, with what uncertainty? | multidomain state estimate, prospective outcome, and abstention | one sensor or composite score |
| injury | what tissue or function event meets a declared case definition? | exposure, onset, diagnosis, severity, and time loss | soreness, low readiness, or workload spike |
| return to participation | can some modified activity resume? | allowed activities and monitored response | return to full competition |
| return to sport | can sport-specific training or competition resume? | staged exposure and task criteria | calendar time alone |
| return to performance | is prior or target performance recovered sustainably? | role-adjusted performance and recurrence follow-up | presence on a roster |
| coordination | do agents' adjustments jointly stabilize a task variable? | perturbation, lagged coupling, error covariance, and outcome | synchrony or spatial proximity alone |
| shared information | which state is mutually available, inferred, or communicated? | message, observation, belief, and discrepancy records | similar behavior |
| deception | does an actor intentionally alter information to change an observer's belief or action? | genuine/deceptive manipulation and observer response | any unexpected action |
| expertise | which durable task-bounded capability is superior? | representative performance, history, selection, and transfer | title, tenure, hours, or reputation |
| talent prediction | does a measurement prospectively predict later capability beyond opportunity and maturation? | out-of-cohort prospective calibration and attrition | current selection or retrospective elite status |
| efficiency | what quality is achieved for all resources and harms consumed? | Pareto vector for outcome, risk, energy, time, and lifecycle cost | success per trial or athlete calories alone |

## Observation and history contract

For athlete or agent $i$ in episode $e$, retain

$$
\mathcal S_{i,e}=(X_{e},O_{i,e},A_{i,e},H_{i,e},R_{i,e},D_{i,e},
M_{e},F_{e},C_{e},U_{e}),
$$

where:

- $X_e$ is the physical and rule state of the task;
- $O_{i,e}$ is the information actually observable by $i$, including latency,
  occlusion, noise, and viewing geometry;
- $A_{i,e}$ is the feasible action set, including morphology, equipment, and
  current functional constraints;
- $H_{i,e}$ is acquisition history: practice, opponents, coaching, feedback,
  injuries, selection, and prior exposures;
- $R_{i,e}$ is reward, sanction, stopping, and selection policy;
- $D_{i,e}$ is resource, fatigue, damage, sleep, and recovery state;
- $M_e$ is teammate and opponent composition plus their observable policy
  history;
- $F_e$ is the feedback and communication channel;
- $C_e$ is the intervention, control, and counterfactual set; and
- $U_e$ is the sampling unit: action, possession, bout, session, athlete, dyad,
  team, season, club, or cohort.

Performance under method $m$ is therefore

$$
Q_m=\mathbb E[Y\mid do(m),\mathcal S],
$$

where $Y$ is a preregistered outcome in its literal unit. A contrast
$Q_m-Q_{m_0}$ is not attributable to $m$ if observable information, feasible
actions, history, opponent distribution, feedback, or resource state differs
without measurement.

## Conventional null stack

Before a sport-derived mechanism can motivate architecture, compare it with:

- supervised sequence prediction, calibrated classification, survival models,
  and state-space filters over the exact available cue stream;
- nearest-neighbor, case-based, episodic, and opponent-conditioned retrieval;
- recurrent and Transformer world models with explicit partial observability;
- model-free and model-based reinforcement learning, POMDP planning, options,
  receding-horizon and model-predictive control;
- behavior cloning, inverse reinforcement learning, self-play, population-based
  training, fictitious play, and explicit opponent models;
- domain randomization, data augmentation, robust optimization, system
  identification, active learning, curriculum and automatic difficulty control;
- entropy bonuses, novelty search, quality-diversity search, random perturbation,
  and uncertainty-directed exploration with matched attempts;
- distributed control, consensus, blackboards, shared displays, typed messages,
  acknowledgements, role protocols, and centralized planning;
- change-point detection, fatigue-state estimation, queueing, load shedding,
  rate limiting, reserve margins, and constrained or risk-sensitive control;
- reliability engineering, health probes, staged rollout, canaries, rollback,
  redundancy, fault injection, and runtime assurance;
- causal inference with time-varying exposure, censoring, selection, competing
  risks, and missing-not-at-random outcomes; and
- explicit ledgers for compute, people, facilities, sensors, embodied equipment,
  recovery, maintenance, injury, and opportunity cost.

Sports vocabulary supplies no baseline credit. “Representative,” “ecological,”
“expert,” “self-organizing,” “synergy,” “readiness,” and “talent” must each be
replaced by a state, intervention, observable, and outcome.

## Quantitative contract

### Time-resolved anticipation and occlusion

Let $c\in\mathcal C$ denote an information channel, $\tau$ the occlusion time in
seconds relative to contact or release, $y$ the event outcome, and
$p_m(y\mid o_{\le\tau})$ a model's predictive distribution. Report the proper
score

$$
L_m(\tau,c)=-\frac{1}{N}\sum_{n=1}^{N}
\log_2 p_m\!\left(y_n\mid o^{(c)}_{n,\le\tau}\right),
$$

where $L_m$ is in bits per event and $N$ is the number of independent events.
The channel-ablation value is

$$
V_c(\tau)=L_{-c}(\tau)-L_{\mathrm{all}}(\tau),
$$

also in bits per event. Positive $V_c$ means the channel improved prediction;
it does not establish how the observer represented it. Accuracy, Brier score,
expected calibration error, response latency in milliseconds, and physical
interception error in metres must remain separate.

### Representativeness as a declared distance

For training distribution $P_{\mathrm{tr}}$ and target distribution
$P_{\mathrm{te}}$, define a feature- and action-conditional distance

$$
d_{\mathrm{rep}}=
D\!\left(P_{\mathrm{tr}}(O,A,Y)\,\|\,P_{\mathrm{te}}(O,A,Y)\right),
$$

where $D$ is a declared divergence or optimal-transport cost, $O$ is available
information, $A$ is the feasible response, and $Y$ is the outcome. The value is
dimensionless for a divergence and inherits the declared ground-cost unit for
optimal transport. There is no universal scalar “representativeness”; channel,
action, timing, opponent, and consequence distances must be inspectable.

The transfer gap is

$$
G_{\mathrm{tr}}=Q_{\mathrm{source}}-Q_{\mathrm{target}},
$$

in the unit of $Q$. Report it by held-out opponent, task constraint, equipment,
deadline, and resource state rather than only as one average.

### Variability and exploration

For action feature vector $a\in\mathbb R^d$, raw variability is summarized by
the covariance $\Sigma_a$. Task-relevant exploration must instead report

$$
\mathcal X=\left(H(A),\;H(Z),\;I(A;Z),\;Q_{\mathrm{transfer}},\;C\right),
$$

where $H(A)$ is action entropy in bits, $H(Z)$ is reached-outcome entropy in
bits, $I(A;Z)$ is action–outcome mutual information in bits,
$Q_{\mathrm{transfer}}$ is later task performance, and $C$ is the cost vector.
Large $\det(\Sigma_a)$ or $H(A)$ can be useless noise when $I(A;Z)$ and transfer
do not improve.

For schedule $k$ with perturbation distribution $q_k(\delta)$, retain its dose

$$
B_k=\sum_{e=1}^{N_k}
\mathbb E_{\delta\sim q_k}\!\left[\lVert\delta\rVert_W^2\right],
$$

where $N_k$ is attempt count, $W$ declares scaling across perturbed dimensions,
and $B_k$ has the squared unit induced by $W$. Matched “variability” conditions
must match attempts, elapsed training, feedback, and perturbation dose.

### Speed–accuracy–risk frontier

For aimed movement, a Fitts-type description is

$$
MT=a+b\log_2\!\left(1+\frac{D}{W}\right),
$$

where $MT$ is movement time in seconds, $D$ is movement distance in metres,
$W$ is target width in metres, $a$ is an intercept in seconds, and $b$ is a
slope in seconds per bit. This empirical relation is task-bounded; its fitted
parameters are not architectural constants.

The comparison target is the vector

$$
\mathcal P=(T,\epsilon,p_{\mathrm{unsafe}},E,C_{\mathrm{human}}),
$$

where $T$ is latency in seconds, $\epsilon$ is task error in its physical unit,
$p_{\mathrm{unsafe}}$ is dimensionless event probability, $E$ is energy in
joules, and $C_{\mathrm{human}}$ is role-stratified person-hours. A method is
more efficient only on a declared Pareto comparison or a preregistered utility;
one axis cannot silently stand for the vector.

### Fatigue, adaptation, and pacing state

External work over interval $[0,T]$ is

$$
W_{\mathrm{ext}}=\int_0^T P(t)\,dt,
$$

where power $P(t)$ is in watts, time $t$ in seconds, and work
$W_{\mathrm{ext}}$ in joules. Gross metabolic energy, perceived effort, and
mechanical work are not interchangeable.

A descriptive two-response training model is

$$
q(t)=q_0+k_f\sum_j u_j e^{-(t-t_j)/\tau_f}
-k_d\sum_j u_j e^{-(t-t_j)/\tau_d},\qquad t\ge t_j,
$$

where $q(t)$ is performance in the chosen task unit, $q_0$ is baseline in that
unit, $u_j$ is the declared training dose for session $j$, $k_f$ and $k_d$
convert dose to performance, and $\tau_f,\tau_d$ are adaptation and fatigue
time constants in days. This impulse-response model is a baseline to estimate,
not proof that physiology has only two states.

For a bounded event of remaining distance $s(t)$ in metres and resource state
$D(t)$, a pacing controller can be written

$$
a_t=\pi\!\left(o_{\le t},\widehat D_t,s(t),
\widehat\pi_{\mathrm{opp}},r_t\right),
$$

where $a_t$ is an action or target power, $o_{\le t}$ is observation history,
$\widehat D_t$ is estimated fatigue/resource state,
$\widehat\pi_{\mathrm{opp}}$ is the opponent-policy estimate, and $r_t$ is the
task reward. Each estimator and feedback channel requires ablation.

### Workload without ratio magic

Session rating load is conventionally

$$
L^{\mathrm{sRPE}}_j=d_j r_j,
$$

where duration $d_j$ is in minutes, rating $r_j$ is a dimensionless declared
RPE scale value, and the product is reported in arbitrary units. It is neither
energy nor injury probability.

For measured exposure $x_j$ in its literal unit, retain a time-weighted history

$$
H_t(\lambda)=\sum_{j<t}\lambda(1-\lambda)^{t-j-1}x_j,
\qquad 0<\lambda\le1,
$$

which has the same unit as $x$. A ratio such as
$x_{\mathrm{acute}}/H_t$ discards scale, couples numerator and denominator when
windows overlap, and becomes unstable near zero. Model the exposure history,
confounders, availability, and outcome process directly before considering a
derived ratio.

### Staged and reversible return gate

Let return stage $g\in\{0,1,2,3,4\}$ denote protected rehabilitation, modified
participation, controlled sport training, full team training, and competition.
Promotion is allowed only when

$$
g_{t+1}=g_t+1
\quad\text{if}\quad
\Pr\!\left(Z_{t:t+h}\in\mathcal A_{g_t+1}\mid\mathcal I_t\right)
\ge1-\alpha_{g_t+1},
$$

where $Z_{t:t+h}$ is the vector of clinical, functional, sport-specific,
psychological, and workload outcomes over horizon $h$ in days,
$\mathcal A_g$ is the admissible envelope for stage $g$, $\mathcal I_t$ is all
information available at time $t$, and $\alpha_g$ is a declared risk tolerance.
Regression to a lower stage is required when the monitored envelope is
violated. A symmetry score, image, date, or absence of pain cannot replace the
joint vector.

### Coordination and shared information

For task variable $z(t)$ and agent contributions $u_i(t)$, reciprocal
compensation requires an intervention, not correlation. Estimate

$$
\Gamma_{ij}(\ell)=
\operatorname{Cov}\!\left(\Delta u_i(t),\Delta u_j(t+\ell)
\mid do(\eta_i),X_t\right),
$$

where $\ell$ is lag in seconds, $\eta_i$ is a perturbation to agent $i$, and
$X_t$ is task state. A negative covariance can be consistent with compensation,
but is only useful when variance of the task variable decreases and outcomes do
not degrade.

For teammate $j$'s latent intent $b_j$ and agent $i$'s belief
$p_i(b_j\mid h_t)$, shared-state quality is evaluated by proper score and
cross-play:

$$
L_{i\rightarrow j}=-\frac{1}{N}\sum_{n=1}^{N}
\log_2 p_i(b_{j,n}\mid h_{t,n}).
$$

$L_{i\rightarrow j}$ is in bits per event. Similar trajectories, phase
locking, or questionnaire agreement cannot substitute for predictive accuracy
under teammate turnover and communication ablation.

### Opponent modelling and deception

For opponent policy $\pi_o(a\mid h)$ and estimate $\widehat\pi_o$, report

$$
L_{\mathrm{opp}}=-\frac{1}{N}\sum_{n=1}^{N}
\log_2 \widehat\pi_o(a_n\mid h_n)
$$

in bits per opponent action, stratified by opponent and time. Deception cost is
the causal change

$$
\Delta_{\mathrm{dec}}=
Q\!\left(do(\text{deceptive})\right)-Q\!\left(do(\text{genuine})\right),
$$

with kinematics, outcome frequencies, viewing time, and response opportunity
matched. A distribution shift or rare action is not intentional deception.

### Complete workload, energy, and human-effort ledger

Report the resource vector

$$
\mathcal C_{\mathrm{life}}=
(E_{\mathrm{compute}},E_{\mathrm{facility}},E_{\mathrm{met}},
E_{\mathrm{travel}},E_{\mathrm{emb}},H_{\mathrm{athlete}},
H_{\mathrm{coach}},H_{\mathrm{clinical}},H_{\mathrm{ops}},
R_{\mathrm{injury}},N_{\mathrm{exposure}},T_{\mathrm{calendar}}),
$$

where energy terms are joules, $H$ terms are person-hours by role,
$R_{\mathrm{injury}}$ is a declared harm vector rather than money or energy,
$N_{\mathrm{exposure}}$ is a count with denominator, and calendar time is days.
Do not collapse this vector unless conversion factors and ethical weights are
declared.

For a measured activity with metabolic equivalent $m_{\mathrm{MET}}$, body mass
$M$ in kilograms, and duration $t$ in hours, a conventional estimate is

$$
E_{\mathrm{met}}\,[\mathrm{kcal}]
\approx m_{\mathrm{MET}}M t,
\qquad
E_{\mathrm{met}}\,[\mathrm J]=4184\,E_{\mathrm{met}}\,[\mathrm{kcal}].
$$

This is an estimate of gross metabolic expenditure, not external work, and the
Compendium cautions against treating population MET values as precise
individual measurements. Facility electricity converts as
$1\,\mathrm{kWh}=3.6\times10^6\,\mathrm J$. Embodied equipment must state the
allocation rule over uses or years. Athlete food energy, coach travel, sensor
manufacture, data annotation, medical care, failed selection pathways, and
recovery time remain visible rather than disappearing behind device power.

## Audit-local evidence claims

### SPORT-001 — Early kinematic information can support expert anticipation

- **Status:** established.
- **Observation:** in temporally and spatially occluded badminton displays,
  world-class players used predictive pre-contact information from lower-body
  and racquet kinematics more consistently than recreational players.
- **Boundary:** 12 experts and 12 nonexperts in a specific stroke-prediction
  paradigm do not establish a universal expert cue or architecture.
- **Primary source:** Abernethy and Zawi, 2007,
  [DOI 10.3200/JMBR.39.5.353-368](https://doi.org/10.3200/JMBR.39.5.353-368).
- **AI translation:** evaluate predictive models at successive cue cutoffs and
  feature interventions, not only after the outcome becomes visible.
- **Strongest null:** calibrated sequence model or retrieval system trained on
  the identical frames and opponent identities.

### SPORT-002 — Expert cue pickup is task- and feature-specific

- **Status:** established.
- **Observation:** world-class cricket batters used earlier hand and arm cues
  unavailable to lower-skill groups in some delivery judgments, while other
  cues were shared across skill levels.
- **Boundary:** the experiments used video judgments; successful prediction is
  not equivalent to physically batting the delivery.
- **Primary source:** Müller, Abernethy, and Farrow, 2006,
  [DOI 10.1080/02643290600576595](https://doi.org/10.1080/02643290600576595).
- **AI translation:** represent cue value as opponent-, task-, and deadline-
  conditional rather than a fixed saliency ranking.
- **Strongest null:** opponent-conditioned Bayesian or neural prediction using
  the same time-indexed kinematics.

### SPORT-003 — Situational priors and kinematics are separable information

- **Status:** plausible.
- **Observation:** expert squash players retained predictive advantages under
  point-light and early-occlusion conditions, consistent with use of both
  kinematic and situational-probability information.
- **Boundary:** better-than-chance early prediction can also reflect opponent or
  sequence priors; it does not prove direct perception of an invariant.
- **Primary source:** Abernethy et al., 2001,
  [DOI 10.1068/p2872](https://doi.org/10.1068/p2872).
- **AI translation:** factorially cross motion evidence with context priors and
  report likelihood contributions and calibration.
- **Strongest null:** hierarchical Bayesian prediction with explicit prior and
  likelihood terms.

### SPORT-004 — Response mode changes the anticipation task

- **Status:** established.
- **Observation:** in-situ association-football goalkeeping showed that the
  availability of advance visual information constrained movement timing and
  vulnerability to deception; the authors explicitly distinguished coupled
  action from video-simulation judgments.
- **Boundary:** an in-situ penalty task is still a constrained sample of match
  play, opponents, and consequences.
- **Primary source:** Dicks, Button, and Davids, 2010,
  [DOI 10.1068/p6442](https://doi.org/10.1068/p6442).
- **AI translation:** preserve observation–action latency, feasible response,
  and consequence when claiming deployment transfer.
- **Strongest null:** a common predictor connected to response-specific optimal
  control, tested separately for label, joystick, partial, and full action.

### SPORT-005 — Occlusion training can improve anticipation without identifying a unique mechanism

- **Status:** plausible.
- **Observation:** explicit instruction, guided discovery, and discovery
  practice improved anticipation in intermediate tennis players in the tested
  training design; guided discovery was more expedient and pressure-resilient
  on some measures.
- **Boundary:** multiple instruction conditions improved, so the result does not
  support one exclusive learning process.
- **Primary source:** Smeeton et al., 2005,
  [DOI 10.1037/1076-898X.11.2.98](https://doi.org/10.1037/1076-898X.11.2.98).
- **AI translation:** compare curricula by retained and transferred calibration,
  not the pedagogical label.
- **Strongest null:** fixed supervised curriculum with matched examples,
  feedback, repetitions, and evaluation queries.

### SPORT-006 — Representative practice can improve declared transfer

- **Status:** plausible.
- **Observation:** in a six-week junior-tennis intervention, practice that
  included a returner and subsequent shot was compared with serve-only practice
  to test transfer from serving drills to more competition-like action chains.
- **Boundary:** 33 participants, one sport skill, and assigned practice groups
  do not establish that maximal realism is always optimal.
- **Primary source:** Krause et al., 2019,
  [DOI 10.1080/02640414.2019.1647739](https://doi.org/10.1080/02640414.2019.1647739).
- **AI translation:** preserve functionally relevant downstream reactions in
  training, then test each representational dimension by ablation.
- **Strongest null:** domain randomization or curriculum learning with matched
  target-distribution coverage and samples.

### SPORT-007 — Representativeness is multidimensional, not visual realism

- **Status:** established.
- **Observation:** penalty-kick and tennis results jointly show that viewing
  geometry, response mode, opponent interaction, timing, and consequence can
  alter the tested capability.
- **Boundary:** this is a methodological synthesis of SPORT-004 and SPORT-006,
  not evidence that every ecological manipulation improves learning.
- **Primary sources:** Dicks et al., 2010,
  [DOI 10.1068/p6442](https://doi.org/10.1068/p6442); Krause et al., 2019,
  [DOI 10.1080/02640414.2019.1647739](https://doi.org/10.1080/02640414.2019.1647739).
- **AI translation:** publish a train–deployment distance vector over
  observation, action, latency, agent response, and cost.
- **Strongest null:** standard distribution-shift evaluation and system
  identification over the same factors.

### SPORT-008 — Practice variability can improve learning in a scoped task

- **Status:** plausible.
- **Observation:** variable practice improved throwing-task learning relative to
  constant practice in the reported experiments and was associated with more
  external attentional focus.
- **Boundary:** mediation by attentional focus was not an architectural
  identification, and the result is task- and schedule-specific.
- **Primary source:** Abdollahipour et al., 2019,
  [DOI 10.1016/j.humov.2019.02.015](https://doi.org/10.1016/j.humov.2019.02.015).
- **AI translation:** vary task-relevant parameters and separately measure
  coverage, information, retention, and target transfer.
- **Strongest null:** matched augmentation and domain randomization.

### SPORT-009 — Variability benefits are not universal

- **Status:** established.
- **Observation:** a 2025 registered report with 80 participants found that
  adding four target locations did not supply a universal retention advantage
  for the single criterion goal and emphasized mixed prior evidence.
- **Boundary:** a null or task-specific result does not show that variability is
  generally useless; it rejects an unconditional rule.
- **Primary source:** Ranganathan et al., 2025,
  [DOI 10.1016/j.humov.2025.103431](https://doi.org/10.1016/j.humov.2025.103431).
- **AI translation:** treat variability schedule as a tunable intervention with
  target-specific transfer tests and negative controls.
- **Strongest null:** constant practice with identical criterion-task exposure,
  attempts, duration, and feedback.

### SPORT-010 — Constraint changes can alter exploration policy

- **Status:** plausible.
- **Observation:** allowing a second volleyball serve was tested as a task
  constraint intended to reduce the cost of first-serve failure and change
  exploration of action capabilities.
- **Boundary:** more aggressive or variable first serves are not automatically
  more informative, transferable, or valuable.
- **Primary source:** Moy, Renshaw, and Gorman, 2024,
  [DOI 10.1080/02640414.2024.2345415](https://doi.org/10.1080/02640414.2024.2345415).
- **AI translation:** manipulate failure cost and retry budget explicitly, then
  measure useful coverage rather than variance alone.
- **Strongest null:** entropy-regularized or risk-sensitive RL with matched retry
  count and failure penalty.

### SPORT-011 — Large perturbations do not guarantee better learning

- **Status:** plausible.
- **Observation:** experiments testing differential-learning claims found that
  the size and structure of practice fluctuations matter; “more fluctuation”
  was not a context-free optimum.
- **Boundary:** short laboratory learning and retention tests do not settle
  season-scale adaptation.
- **Primary source:** Hossner et al., 2016,
  [DOI 10.1016/j.humov.2015.06.007](https://doi.org/10.1016/j.humov.2015.06.007).
- **AI translation:** tune perturbation distribution against transfer and damage,
  not a maximal-noise heuristic.
- **Strongest null:** ordinary noise injection, randomized search, or Bayesian
  experimental design at equal perturbation dose.

### SPORT-012 — Accumulated practice and expertise are associated but confounded

- **Status:** plausible.
- **Observation:** retrospective soccer and field-hockey histories showed a
  monotonic association between accumulated individual-plus-team practice and
  skill level, while relevant sport activities could also be enjoyable.
- **Boundary:** recall, prior selection, access, survivorship, reverse causation,
  and unobserved aptitude prevent a causal dose rule.
- **Primary source:** Helsen, Starkes, and Hodges, 1998,
  [DOI 10.1123/jsep.20.1.12](https://doi.org/10.1123/jsep.20.1.12).
- **AI translation:** retain timestamped training exposures and selection events;
  do not infer learning efficiency from cumulative training alone.
- **Strongest null:** longitudinal mixed-effects or causal model with baseline,
  opportunity, attrition, and time-varying exposure.

### SPORT-013 — Practice type matters, but retrospective taxonomies are unstable

- **Status:** plausible.
- **Observation:** expert and experienced nonexpert team-ball athletes reported
  different quantities and types of sport-specific activity associated with
  decision-making expertise.
- **Boundary:** 28 retrospective participants and researcher-defined activity
  classes cannot isolate what caused the later skill difference.
- **Primary source:** Baker, Côté, and Abernethy, 2003,
  [DOI 10.1080/10413200305400](https://doi.org/10.1080/10413200305400).
- **AI translation:** log actual task distributions, feedback, challenge, and
  learning gain per unit cost instead of a binary “deliberate” label.
- **Strongest null:** data-quantity and curriculum-feature regression with
  prospective held-out prediction.

### SPORT-014 — Deliberate practice does not explain all sport-performance variance

- **Status:** established.
- **Observation:** a meta-analysis estimated that deliberate practice explained
  18% of variance overall and about 1% among elite performers in the included
  sports literature.
- **Boundary:** the estimate depends on definitions, study quality, range
  restriction, retrospective measures, and meta-analytic inclusion; unexplained
  variance is not evidence for innate talent.
- **Primary synthesis:** Macnamara, Moreau, and Hambrick, 2016,
  [DOI 10.1177/1745691616635591](https://doi.org/10.1177/1745691616635591).
- **AI translation:** practice is one causal input among data, initialization,
  morphology, curriculum, selection, feedback, and environment.
- **Strongest null:** variance decomposition with measurement-error and
  range-restriction sensitivity, followed by prospective intervention.

### SPORT-015 — Speed and accuracy form a task-conditioned tradeoff

- **Status:** established.
- **Observation:** whole-body postural movements showed Fitts-type relations,
  but target-distance conditions had different slopes and inherent sway changed
  effective target width.
- **Boundary:** the canonical linear form and parameters are not universal
  across bodies, constraints, or movement classes.
- **Primary source:** Duarte and Freitas, 2005,
  [DOI 10.1123/mcj.9.2.180](https://doi.org/10.1123/mcj.9.2.180).
- **AI translation:** report latency–error frontiers under multiple task
  difficulties rather than one accuracy at one deadline.
- **Strongest null:** optimal feedback control with signal-dependent noise.

### SPORT-016 — Throughput can remain stable while speed and error move

- **Status:** plausible.
- **Observation:** in 5,400 pointing trials, speed-emphasis and
  accuracy-emphasis changed movement time and error rate but not estimated
  throughput in the tested task.
- **Boundary:** failure to reject a throughput difference is not proof of exact
  invariance, and mouse pointing is not a universal motor model.
- **Primary source:** MacKenzie and Isokoski, 2008,
  [DOI 10.1145/1357054.1357308](https://doi.org/10.1145/1357054.1357308).
- **AI translation:** detect policies that improve one reported metric by
  shifting criterion rather than information-processing capacity.
- **Strongest null:** signal-detection or bounded-rational controller with an
  adjustable speed–accuracy cost.

### SPORT-017 — Local muscular fatigue changes selected output

- **Status:** established.
- **Observation:** after an eccentric fatigue protocol, ten men completed 4.8%
  less work in a 15-minute cycling time trial by reducing power, while the broad
  pacing pattern was not changed.
- **Boundary:** small male sample, isolated protocol, and short cycling task do
  not identify a general fatigue controller.
- **Primary source:** de Morree and Marcora, 2013,
  [DOI 10.1007/s00421-013-2673-0](https://doi.org/10.1007/s00421-013-2673-0).
- **AI translation:** condition resource allocation on measured capacity state;
  do not compare policies only at nominal initialization.
- **Strongest null:** state estimator plus constrained MPC with a time-varying
  actuator envelope.

### SPORT-018 — Opponent behavior can alter pacing decisions

- **Status:** plausible.
- **Observation:** cyclists changed pacing and performance responses when a
  virtual opponent used slow–fast or fast–slow profiles relative to a no-
  opponent condition.
- **Boundary:** twelve participants and virtual profiles support opponent-
  conditioned control, not mind reading or a unique social mechanism.
- **Primary source:** Konings et al., 2016,
  [DOI 10.1016/j.physbeh.2016.02.023](https://doi.org/10.1016/j.physbeh.2016.02.023).
- **AI translation:** include competitor policy and inferred remaining reserve
  in sequential decisions.
- **Strongest null:** game-theoretic receding-horizon controller with online
  opponent identification.

### SPORT-019 — Feedback deception has mixed, bounded pacing effects

- **Status:** established.
- **Observation:** one 16.1-km study found that riding against prior-performance
  feedback improved performance regardless of feedback accuracy, while
  deception changed perceptual responses and did not create a sustained
  residual benefit.
- **Boundary:** placebo, competition, target setting, and belief effects are
  entangled; the result does not justify deceptive control as a general policy.
- **Primary source:** Jones et al., 2016,
  [DOI 10.1016/j.jsams.2015.12.006](https://doi.org/10.1016/j.jsams.2015.12.006).
- **AI translation:** separate the value of a target or competitor from the
  accuracy of state feedback, and test downstream trust and calibration.
- **Strongest null:** accurate challenge calibration with the same avatar,
  incentives, and expected target.

### SPORT-020 — Small deceptive pacing increments can expose reserve

- **Status:** plausible.
- **Observation:** 4,000-m cycling experiments manipulated avatar power by 2%
  and 5% to test whether concealed challenge could change time-trial output;
  performance effects depended on deception magnitude.
- **Boundary:** an acute reserve under a familiar laboratory event is not free
  capacity; fatigue, safety, trust, and reproducibility remain costs.
- **Primary source:** Stone et al., 2017,
  [DOI 10.1371/journal.pone.0173120](https://doi.org/10.1371/journal.pone.0173120).
- **AI translation:** perturb assumed limits under bounded safeguards, but charge
  failures and later calibration damage.
- **Strongest null:** safe Bayesian optimization or dual control over a measured
  capacity envelope.

### SPORT-021 — Sleep extension effects are outcome-specific

- **Status:** established.
- **Observation:** a randomized crossover trial in youth elite ice-hockey
  players increased sleep and improved perceived fatigue and a demanding
  cognitive-control task, while vigilance, countermovement jump, and handgrip
  outcomes did not differ between conditions.
- **Boundary:** subjective improvement does not imply universal physical
  readiness; multiple outcomes and a short intervention constrain inference.
- **Primary source:** Varesco et al., 2026,
  [DOI 10.1111/jsr.70269](https://doi.org/10.1111/jsr.70269).
- **AI translation:** keep resource-state indicators task-specific and allow
  abstention when indicators disagree.
- **Strongest null:** multivariate state estimation with prospective task-
  specific validation.

### SPORT-022 — Sleep intervention can improve some motor and cognitive outcomes

- **Status:** plausible.
- **Observation:** randomized sleep extension in 50 tactical athletes increased
  sleep time and improved changes in vigilance, executive-task time, broad-jump
  distance, and motivation relative to control.
- **Boundary:** tactical athletes, short duration, and a test battery do not
  identify a single recovery variable or long-term performance effect.
- **Primary source:** Ritland et al., 2019,
  [DOI 10.1016/j.sleep.2019.03.013](https://doi.org/10.1016/j.sleep.2019.03.013).
- **AI translation:** interventions should update a vector of capacities and
  uncertainties, not a scalar “recovered” flag.
- **Strongest null:** ordinary multivariate readiness model with baseline and
  repeated measurements.

### SPORT-023 — Internal and external load are different constructs

- **Status:** established.
- **Observation:** session-RPE multiplies perceived session intensity by
  duration and was validated against heart-rate-derived training measures for
  non-steady and prolonged exercise.
- **Boundary:** agreement with heart-rate summaries does not make arbitrary
  units energy, tissue dose, readiness, or injury risk.
- **Primary source:** Foster et al., 2001,
  [PubMed 11708692](https://pubmed.ncbi.nlm.nih.gov/11708692/).
- **AI translation:** distinguish work issued, work realized, internal state
  change, and downstream failure.
- **Strongest null:** explicit multi-sensor state-space model retaining each
  measurement in its original unit.

### SPORT-024 — Acute:chronic workload ratios have structural validity problems

- **Status:** disputed.
- **Observation:** critiques show that ratio construction, overlapping windows,
  mathematical coupling, discretization, sparse injuries, time-varying
  confounding, and exposure cessation can create misleading associations.
- **Boundary:** rejecting a universal ratio threshold does not imply workload
  history is irrelevant to performance or injury.
- **Primary methodological source:** Impellizzeri et al., 2020,
  [DOI 10.1123/ijspp.2019-0864](https://doi.org/10.1123/ijspp.2019-0864).
- **AI translation:** estimate dynamic exposure and failure processes directly;
  do not install an unvalidated ratio “sweet spot.”
- **Strongest null:** survival or recurrent-event model with time-varying load,
  availability, prior injury, competition, and censoring.

### SPORT-025 — Workload association is not individual injury certification

- **Status:** established.
- **Observation:** elite-team studies have reported associations between derived
  workload histories and later injury, but observational design and
  methodological heterogeneity prevent deterministic individual prediction.
- **Boundary:** higher sensitivity of one ratio estimator does not establish
  causal effect, transportable threshold, or safe prescription.
- **Primary source:** Murray et al., 2017,
  [DOI 10.1136/bjsports-2016-097152](https://doi.org/10.1136/bjsports-2016-097152).
- **AI translation:** risk estimates require calibration by deployment cohort,
  causal caveats, and a safe abstention/action policy.
- **Strongest null:** calibrated time-to-event model with an external temporal
  test and decision-curve evaluation.

### SPORT-026 — Return to sport is a staged continuum

- **Status:** established.
- **Observation:** a prospective adductor-injury cohort used distinct milestones
  for clinically pain-free status, controlled sport training, and full team
  training; reaching pain-free criteria was associated with fewer reinjuries.
- **Boundary:** 81 male athletes, one injury class, and a cohort protocol do not
  establish universal gates or causality for each criterion.
- **Primary source:** Serner et al., 2020,
  [DOI 10.1177/2325967119897247](https://doi.org/10.1177/2325967119897247).
- **AI translation:** use reversible capability stages with monitored promotion
  and regression rather than a one-time deployment flag.
- **Strongest null:** ordinary staged rollout with explicit health checks,
  canary exposure, rollback, and risk budget.

### SPORT-027 — Time and functional criteria carry nonredundant return information

- **Status:** plausible.
- **Observation:** in the Delaware–Oslo ACL cohort, earlier return to level-I
  sport was associated with reinjury, and passing a functional return battery
  was associated with lower reinjury; time alone remained insufficient.
- **Boundary:** observational return decisions, small injury counts, and athlete
  self-selection limit causal and numerical portability; “84% lower” is not a
  universal constant.
- **Primary source:** Grindem et al., 2016,
  [DOI 10.1136/bjsports-2016-096031](https://doi.org/10.1136/bjsports-2016-096031).
- **AI translation:** combine elapsed stabilization time with independent
  functional evidence and prospective monitoring.
- **Strongest null:** risk-sensitive staged deployment using both age-of-state
  and current health probes.

### SPORT-028 — A high function score can be misleading under early return

- **Status:** plausible.
- **Observation:** in a prospective ACL-reconstruction cohort, greater six-month
  quadriceps symmetry was associated with higher reinjury probability among
  early returners, while delayed return reduced risk in a later-return stratum.
- **Boundary:** association, subgrouping, activity exposure, and return behavior
  prevent treating symmetry as harmful; the key result is construct failure of
  a lone readiness marker.
- **Primary source:** Bodkin et al., 2022,
  [DOI 10.4085/1062-6050-0407.20](https://doi.org/10.4085/1062-6050-0407.20).
- **AI translation:** test health indicators against exposure-conditioned
  failures and adversarial gaming, not only face validity.
- **Strongest null:** multivariate survival model including return timing,
  exposure, function, age, and prior injury.

### SPORT-029 — Joint practice can increase shared predictive knowledge

- **Status:** plausible.
- **Observation:** 23 youth-football dyads increased indices of common
  understanding across collective training while total and orienting verbal
  communication decreased.
- **Boundary:** repeated dyads, a designed passing-running task, and correlational
  change do not show a shared internal representation or match-level advantage.
- **Primary source:** Blaser and Seiler, 2019,
  [DOI 10.3389/fpsyg.2019.00077](https://doi.org/10.3389/fpsyg.2019.00077).
- **AI translation:** measure teammate prediction, messages, and cross-play
  separately; reduced communication is beneficial only if outcomes transfer.
- **Strongest null:** explicit teammate model or cached protocol learned through
  repeated interaction.

### SPORT-030 — Shared displays can help by changing later team state

- **Status:** plausible.
- **Observation:** in a distributed-team simulation, shared displays initially
  slowed teams, but later performance after removal exceeded other conditions,
  consistent with construction of useful task knowledge rather than a purely
  online display advantage.
- **Boundary:** the study is human-factors simulation rather than sport, and
  “shared mental model” is an inferred construct.
- **Primary source:** Bolstad and Endsley, 1999,
  [DOI 10.1177/154193129904300318](https://doi.org/10.1177/154193129904300318).
- **AI translation:** distinguish online coordination bandwidth from persistent
  coordination state acquired through a shared workspace.
- **Strongest null:** blackboard memory or explicit state synchronization with
  matched display and communication cost.

### SPORT-031 — Synchrony is an observable, not a sufficient mechanism

- **Status:** established.
- **Observation:** professional football tracking showed time-varying player–
  team and team–team phase relations associated with possession and field
  direction.
- **Boundary:** phase alignment can arise from ball tracking, geometry, common
  clock, role constraints, or direct coupling and does not by itself show
  synergy or causal coordination.
- **Primary source:** Duarte et al., 2013,
  [DOI 10.1016/j.humov.2013.01.011](https://doi.org/10.1016/j.humov.2013.01.011).
- **AI translation:** perturb one unit and measure compensation and task-variable
  stability; do not reward synchrony blindly.
- **Strongest null:** centralized trajectory planner or agents independently
  responding to the same observed state.

### SPORT-032 — Practice can reorganize measured team-level coordination

- **Status:** plausible.
- **Observation:** football practice changed measures of dimensional compression
  and reciprocal compensation in a rhythmic attacking–defending task.
- **Boundary:** metric changes in a designed task require perturbation and
  outcome validation before they count as functional team synergies.
- **Primary source:** Silva et al., 2016,
  [DOI 10.1016/j.humov.2015.11.017](https://doi.org/10.1016/j.humov.2015.11.017).
- **AI translation:** test whether local policy changes preserve global task
  variables under teammate dropout, delay, and role reassignment.
- **Strongest null:** decentralized feedback control with shared task state.

### SPORT-033 — Deceptive kinematics can invert confident anticipation

- **Status:** established.
- **Observation:** skilled and less-skilled soccer players were overconfident
  when anticipating deceptive penalty kicks, and movement exaggeration changed
  cue use across occlusion times.
- **Boundary:** confidence and accuracy in video prediction do not measure
  physical saves or intentional state inference.
- **Primary source:** Ryu et al., 2013,
  [DOI 10.1111/j.2044-8295.2011.02092.x](https://doi.org/10.1111/j.2044-8295.2011.02092.x).
- **AI translation:** adversarially vary early cues and score calibration as well
  as prediction.
- **Strongest null:** robust opponent-conditioned classifier with adversarial
  augmentation and abstention.

### SPORT-034 — Expertise reduces some deception susceptibility, not all

- **Status:** established.
- **Observation:** skilled rugby players were less susceptible than novices to
  side-step deception in a video task, while both groups expressed higher
  confidence on deceptive trials.
- **Boundary:** 14 participants per group and filmed direction changes support a
  bounded perceptual result, not general deception immunity.
- **Primary source:** Jackson, Warren, and Abernethy, 2006,
  [DOI 10.1016/j.actpsy.2006.02.002](https://doi.org/10.1016/j.actpsy.2006.02.002).
- **AI translation:** model cue reliability under strategic manipulation and
  audit confidence for anti-calibration.
- **Strongest null:** adversarial training plus opponent-frequency priors.

### SPORT-035 — Kinematic and appearance channels contribute differently under deception

- **Status:** plausible.
- **Observation:** skilled badminton players' deception judgments changed when
  spatial-frequency filtering emphasized kinematic or non-kinematic information;
  high-spatial-frequency emphasis reduced accuracy on deceptive trials.
- **Boundary:** spatial-frequency filtering is not a clean semantic separation,
  and the sample included 12 players per skill group.
- **Primary source:** Park et al., 2019,
  [DOI 10.1177/0301006619837874](https://doi.org/10.1177/0301006619837874).
- **AI translation:** test predictive channels under intentional cue conflict,
  not only random masking.
- **Strongest null:** multimodal robust model with channel dropout, calibration,
  and explicit conflict detection.

### SPORT-036 — External-focus feedback can improve scoped motor learning

- **Status:** established.
- **Observation:** in volleyball-serving experiments, feedback about movement
  effects produced better serve accuracy during practice and retention than
  body-movement feedback, across novice and advanced groups.
- **Boundary:** movement quality did not differ in the same way, and attentional
  wording effects are task- and instruction-dependent.
- **Primary source:** Wulf et al., 2002,
  [DOI 10.1080/00222890209601939](https://doi.org/10.1080/00222890209601939).
- **AI translation:** feedback should target task effects when that produces
  better independent control, but retention and transfer decide the result.
- **Strongest null:** outcome-based error feedback with identical information
  content and schedule.

### SPORT-037 — Learner-controlled feedback can work through timing and competence

- **Status:** plausible.
- **Observation:** self-controlled feedback experiments found learning benefits
  that depended on when feedback was requested and on protecting perceived
  competence, rather than proving a generic autonomy switch.
- **Boundary:** yoked controls can match feedback frequency while differing in
  agency, expectation, and trial history; the mediators remain contestable.
- **Primary source:** Chiviacowsky, Wulf, and Lewthwaite, 2012,
  [DOI 10.3389/fpsyg.2012.00458](https://doi.org/10.3389/fpsyg.2012.00458).
- **AI translation:** allow uncertainty-triggered feedback requests and compare
  them with value-of-information acquisition at matched query cost.
- **Strongest null:** calibrated active learning or selective prediction with a
  learned query policy.

### SPORT-038 — Relative age can be amplified by selection

- **Status:** established.
- **Observation:** in adolescent handball, relative-age effects were absent in
  all registered players but increased at county and regional selection levels,
  despite sport-specific selection tasks.
- **Boundary:** birth quarter is a proxy within a cohort; mechanisms include
  maturation, size, opportunity, coaching judgments, and prior investment.
- **Primary source:** Tróznai et al., 2021,
  [DOI 10.3390/ijerph182111418](https://doi.org/10.3390/ijerph182111418).
- **AI translation:** selection policies change future training data and must be
  audited for cohort-relative opportunity feedback loops.
- **Strongest null:** causal selection model with cutoff, maturation, prior
  opportunity, and inverse-probability sensitivity.

### SPORT-039 — Biological maturity and relative age are distinct selection biases

- **Status:** established.
- **Observation:** eight years of academy-football observations showed selection
  toward advanced maturity; no U15–U16 players in the sample were classified as
  late maturing.
- **Boundary:** one academy and estimated maturity status cannot establish
  general prevalence or later counterfactual performance of excluded players.
- **Primary source:** Hill et al., 2020,
  [DOI 10.1080/02640414.2019.1649524](https://doi.org/10.1080/02640414.2019.1649524).
- **AI translation:** do not collapse age, maturation, current performance, and
  learning potential into a single rank.
- **Strongest null:** longitudinal latent-growth model with opportunity and
  selection process explicitly represented.

### SPORT-040 — Talent labels have weak prospective construct validity

- **Status:** established.
- **Observation:** systematic evidence across longitudinal and retrospective
  talent-identification studies found no consistent variable set that reliably
  predicted future elite success.
- **Boundary:** heterogeneity of sports, ages, measures, and definitions limits
  pooled inference; absence of a universal predictor does not preclude scoped
  prospective prediction.
- **Primary synthesis:** Johnston et al., 2018,
  [DOI 10.1007/s40279-017-0803-2](https://doi.org/10.1007/s40279-017-0803-2).
- **AI translation:** evaluate selection as a calibrated, revisable forecast
  under delayed labels and censored opportunity.
- **Strongest null:** simple age-, opportunity-, and baseline-adjusted forecast
  externally validated on later cohorts.

### SPORT-041 — Metabolic estimates are not complete system energy

- **Status:** established.
- **Observation:** the Compendium attaches population MET values to physical
  activities for standardized energy-expenditure estimation and distinguishes
  measured from estimated entries.
- **Boundary:** MET tables do not measure individual metabolic cost precisely
  and exclude facilities, travel, equipment, staff, medical care, and embodied
  energy.
- **Authoritative source:** Ainsworth et al., 2011,
  [DOI 10.1249/MSS.0b013e31821ece12](https://doi.org/10.1249/MSS.0b013e31821ece12),
  and the [Compendium project](https://pacompendium.com/).
- **AI translation:** retain measured device/facility energy and estimated human
  metabolism separately with uncertainty and system boundary.
- **Strongest null:** lifecycle inventory with direct metering and declared
  allocation rules.

### SPORT-042 — Wearable energy estimates require task-specific validation

- **Status:** plausible.
- **Observation:** Australian-football research calibrated inertial-sensor
  estimates against oxygen uptake and assessed them against proprietary
  metabolic-power calculations during training and matches.
- **Boundary:** algorithm calibration in 18 players and one sport does not make
  accelerometer energy estimates universally valid.
- **Primary source:** Gastin et al., 2016,
  [DOI 10.1016/j.jsams.2015.01.013](https://doi.org/10.1016/j.jsams.2015.01.013).
- **AI translation:** proxy resource metrics require calibration against direct
  measurement in the deployment regime.
- **Strongest null:** direct calorimetry or power metering on a representative
  stratified sample with uncertainty propagation.

### SPORT-043 — Complete effort accounting changes efficiency comparisons

- **Status:** plausible.
- **Observation:** the audited studies require coaches, athletes, facilities,
  opponents, rehabilitation, sensors, and repeated exposures that disappear if
  cost is reported only as active device energy or trials.
- **Boundary:** the exact conversion among person-time, metabolic energy,
  injury, money, and opportunity is normative; the audit supports a vector, not
  a universal scalar exchange rate.
- **Primary anchors:** Foster et al., 2001,
  [PubMed 11708692](https://pubmed.ncbi.nlm.nih.gov/11708692/); Ainsworth et al.,
  2011, [DOI 10.1249/MSS.0b013e31821ece12](https://doi.org/10.1249/MSS.0b013e31821ece12);
  Serner et al., 2020,
  [DOI 10.1177/2325967119897247](https://doi.org/10.1177/2325967119897247).
- **AI translation:** compare systems on a lifecycle Pareto vector and publish
  all boundary exclusions.
- **Strongest null:** activity-based costing plus lifecycle assessment and
  outcome-stratified human-effort ledger.

### SPORT-044 — The transferable residual is an evaluation contract

- **Status:** plausible.
- **Observation:** across anticipation, learning, pacing, return, coordination,
  and selection, apparent capability changes when observation, action,
  acquisition history, opponent, resource state, or exposure policy changes.
- **Boundary:** composing these fields does not establish a new natural law or
  AI primitive.
- **Primary anchors:** SPORT-001–SPORT-043.
- **AI translation:** bind every performance record to the full observation,
  history, resource, opponent, and cost contract; invalidate comparisons when
  required fields are absent.
- **Strongest null:** existing versioned experiment tracking, causal metadata,
  state estimation, and stratified evaluation. Retain the contract only if it
  catches consequential false comparisons beyond that stack.

## Negative results and construct-validity traps

1. **Video accuracy is not interception.** A label or joystick removes movement
   time, reachability, balance, collision, and energetic consequences.
2. **Earlier prediction is not always better.** An earlier commitment can raise
   error under deception; latency and option value must be charged.
3. **Gaze is not information use.** Looking at a region does not show which
   feature was extracted or whether it caused the choice.
4. **Occlusion is not a representation decoder.** It localizes usable evidence
   in time or space but leaves retrieval, priors, heuristics, and learned
   dynamics as nulls.
5. **Representative is not photorealistic.** A realistic video with the wrong
   action, deadline, opponent response, or consequence can be less functional
   than a visually sparse interactive task.
6. **Practice score is not learning.** Instructions, feedback, fatigue, and
   warm-up can change acquisition without delayed retention.
7. **Transfer is not one number.** Near, far, opponent, rule, equipment,
   pressure, and fatigue transfer can disagree.
8. **Variability is not exploration.** Noise can enlarge action variance without
   improving outcome coverage, information, or later utility.
9. **More variability is not universally better.** The registered 2025 result
   in SPORT-009 is a direct negative check on an unconditional benefit.
10. **Deliberate-practice hours are not a causal dosage meter.** Recall,
    selection, access, motivation, coaching quality, injury, and dropout are
    coupled to accumulated hours.
11. **Elite-range variance is range-restricted.** A small practice–performance
    correlation among selected elites does not estimate practice effects in an
    unselected population.
12. **Fitts parameters are not constants.** Task geometry, body, noise, and
    instructions change the fitted frontier.
13. **Pacing endpoint is not policy.** Equal final times can hide different
    power histories, risks, and residual fatigue.
14. **Deception findings are mixed.** SPORT-019 found no special acute or
    residual performance advantage from inaccurate rather than accurate avatar
    feedback, even though perceptual responses changed.
15. **Subjective fatigue is not tissue capacity.** It can be informative without
    being interchangeable with strength, vigilance, pain, sleep, or injury.
16. **Workload arbitrary units are not joules.** sRPE, player load, TRIMP, MET,
    mechanical work, and energy expenditure have different definitions.
17. **ACWR thresholds are not safety certificates.** Ratio coupling, censoring,
    sparse outcomes, and confounding can manufacture apparent sweet spots.
18. **No injury does not imply readiness.** Exposure may have been withheld;
    absence under censoring cannot validate a return gate.
19. **Symmetry is not health.** The uninjured limb can decondition, and early
    high-function returners can accumulate more hazardous exposure.
20. **Return to roster is not return to performance.** Participation, sport,
    role, prior level, sustainability, and recurrence are distinct endpoints.
21. **Synchrony is not coordination.** Common input or geometry can synchronize
    agents without shared state or reciprocal compensation.
22. **Communication reduction is not efficiency by itself.** It is beneficial
    only if cross-play, repair, safety, and outcome quality survive.
23. **Confidence can anti-calibrate under deception.** SPORT-033 and SPORT-034
    show why confidence must be scored against outcomes.
24. **Current youth performance is not potential.** Selection changes coaching,
    minutes, opposition, and future data, amplifying relative-age and maturity
    differences.
25. **A selected cohort hides false negatives.** Athletes excluded early have
    missing elite outcomes because the system withheld the opportunity needed
    to generate them.
26. **Metabolic energy is not lifecycle energy.** Food, facilities, travel,
    sensors, equipment, computation, staff, recovery, and medical burden have
    different system boundaries.
27. **Human time is not free or reducible to calories.** Attention, expertise,
    risk exposure, and displaced alternatives require a separate ledger.

## Decisive equal-budget experiments

### E-SPORT-01 — Cue-time intervention ladder

**Question.** Does a proposed anticipation mechanism use transferable early
evidence beyond retrieval and sequence prediction?

**Design.** Cross three cue windows, four spatial/channel ablations, familiar
and held-out opponents, genuine and deceptive actions, and four response modes:
label, joystick, partial movement, and full interception. Preserve exact event
frequencies and viewing geometry.

**Matched budget.** Same training events, pixels or sensor streams, opponent
identities, parameters, optimization steps, feedback, and inference deadline.

**Nulls.** Calibrated temporal classifier, nearest-neighbor retrieval,
hierarchical Bayesian prior-plus-kinematics model, POMDP predictor, and robust
channel-dropout model.

**Primary outcomes.** Bits per event, calibration, milliseconds to commitment,
interception error in metres, unsafe-event rate, and energy per event.

**Decisive result.** Retain only a residual that transfers to held-out opponents
and coupled action, survives cue-conflict and deception, and improves the
latency–accuracy–risk frontier. Retire it if gains vanish after opponent
conditioning or response-specific control.

### E-SPORT-02 — Representative-task causal ladder

**Question.** Which dimensions of training–deployment match cause transfer?

**Design.** Factorially vary visual fidelity, action coupling, downstream
opponent response, time pressure, consequence, and physical resource state.
Train on equal-sized curricula and test every source–target pair.

**Matched budget.** Same episodes, unique outcomes, parameter count, wall time,
human demonstrations, coaching queries, and simulator or facility hours.

**Nulls.** Domain randomization, augmentation, robust optimization, system
identification, curriculum learning, and direct fine-tuning on an equal target
sample.

**Primary outcomes.** Full transfer matrix, calibration, target regret,
adaptation samples, safety, and lifecycle cost.

**Decisive result.** Preserve a sport-derived design rule only if an identified
dimension predicts held-out transfer beyond measured distribution distance and
ordinary curricula. “More realistic” without causal factor attribution loses.

### E-SPORT-03 — History-qualified variability schedule

**Question.** Can an adaptive variability schedule beat fixed practice,
augmentation, and uncertainty-directed curricula?

**Design.** Learners with stratified initial skill face constant, blocked,
random, progressive, error-amplifying, and adaptive schedules. Cross retry cost,
feedback availability, and target-distribution shift. Include a washout and
delayed retention test.

**Matched budget.** Same attempts, criterion-task exposures, total perturbation
dose, elapsed practice, feedback bits, evaluator queries, and energy.

**Nulls.** Fixed augmentation, domain randomization, entropy bonus, novelty
search, Bayesian experimental design, automatic curriculum, and random search.

**Primary outcomes.** Action and outcome entropy, mutual information, learning
curve, retention, near/far transfer, failure cost, and variance across learners.

**Decisive result.** Retain the adaptive schedule only if it improves held-out
transfer at equal criterion exposure and cost across initial-skill strata.
Retire it if raw variability rises without information or transfer.

### E-SPORT-04 — Fatigue-aware pacing and reserve control

**Question.** Does a learned resource state improve allocation beyond standard
state estimation and constrained control?

**Design.** Repeated bounded tasks cross fresh and independently induced
fatigue, known and uncertain remaining work, stationary and changing opponents,
accurate and perturbed feedback, and recovery intervals. Use blinded safe limits.

**Matched budget.** Same sensing, calibration trials, opponent observations,
controller updates, reserve, and failure allowance.

**Nulls.** Kalman/particle state estimation, fitness–fatigue model, MPC,
risk-sensitive RL, rate limiting, and fixed conservative reserve.

**Primary outcomes.** Task reward, power trajectory, estimation error, perceived
effort, recovery time, unsafe events, recurrence, and joules.

**Decisive result.** Retain only if the learned state predicts performance and
safe reserve under unseen fatigue pathways, not merely elapsed workload. Retire
if a conventional estimator plus MPC reaches the same frontier.

### E-SPORT-05 — Reversible return-to-operation gate

**Question.** Does a multidomain staged gate prevent consequential false return
without unnecessary exclusion?

**Design.** Faulted or degraded systems progress through protected, modified,
controlled, full-load, and adversarial stages. Randomize or use stepped-wedge
deployment where ethical, with hidden recurrent faults and support removal.

**Matched budget.** Same health probes, observation time, repair attempts,
canary load, rollback capacity, and adjudication effort.

**Nulls.** time-only gate, single health score, standard canary, reliability
threshold, runtime assurance, and full staged rollout with hand-authored rules.

**Primary outcomes.** false promotion, false withholding, recurrence, recovery,
collateral loss, availability, human review hours, and lifecycle energy.

**Decisive result.** Retain only if the learned gate improves the risk–
availability frontier under new fault classes and safely regresses stage after
deterioration. Retire if ordinary health probes and rollback match it.

### E-SPORT-06 — Local/global team coordination under turnover

**Question.** Is a proposed coordination state more useful than shared displays,
explicit protocol, centralized planning, or independent response to common input?

**Design.** Cooperative–competitive tasks cross message delay, bandwidth,
teammate turnover, role reassignment, observation asymmetry, and targeted local
perturbations. Include cross-play with never-co-trained teammates.

**Matched budget.** Same per-agent observations, total messages and bits,
parameters, rehearsal episodes, shared memory, and centralized compute.

**Nulls.** centralized MPC, decentralized feedback, consensus, blackboard,
typed role protocol, opponent-conditioned MARL, and independent common-state
controllers.

**Primary outcomes.** task reward, task-variable variance, lagged compensation,
messages, repair latency, cross-play, dropout recovery, and energy.

**Decisive result.** Retain only if local perturbations elicit useful reciprocal
compensation and cross-play beyond common-input synchrony. Retire if a shared
display or explicit protocol accounts for the gain.

### E-SPORT-07 — Adversarial cue and opponent-policy audit

**Question.** Does the system track opponent strategy without becoming
overconfident on intentional cue conflict?

**Design.** Opponents vary genuine action frequency, disguise, false early cues,
policy change points, and identity. Hold terminal outcomes and visible evidence
constant where possible. Evaluate known, novel, and colluding opponents.

**Matched budget.** Same interaction count, opponent observations, memory,
self-play population, search depth, and inference latency.

**Nulls.** Bayesian opponent model, fictitious play, recurrent policy,
population self-play, robust classifier, conformal abstention, and retrieval.

**Primary outcomes.** opponent log loss in bits/action, calibration, exploitability,
regret, abstention utility, adaptation time, and adversarial failure.

**Decisive result.** Retain a residual only if it improves calibrated adaptation
to new deceptive policies at equal interactions. Retire if adversarial training
or explicit opponent identification matches it.

### E-SPORT-08 — Selection, learning, and complete-cost trial

**Question.** Does a talent or readiness model improve long-horizon capability
without amplifying opportunity bias or hiding development cost?

**Design.** Prospective multi-cohort trial with randomized additional opportunity
near selection thresholds where ethical, repeated maturation and capability
measures, timestamped coaching and practice, injuries, dropout, and later
performance. Preserve outcomes for both selected and initially unselected
participants.

**Matched budget.** Same evaluation time, development places, coaching hours,
facility access, equipment, and follow-up effort across policy arms.

**Nulls.** current-performance rank, age/maturity-adjusted regression, calibrated
survival model, lottery near threshold, and broad-development policy.

**Primary outcomes.** future capability calibration, false-negative recovery,
group opportunity, attrition, injury, coach/athlete hours, metabolic and
facility energy, embodied equipment, and cost per sustainably developed
capability.

**Decisive result.** Retain a selection model only if it predicts new cohorts,
improves later capability per full lifecycle cost, and does not create its own
apparent validity through differential opportunity. Retire if a simple adjusted
forecast or threshold lottery matches it.

## Deduplication against the principle registry

| Principle | Sports evidence pressure | Disposition |
| --- | --- | --- |
| [P-001 — Selective allocation](../principle-registry.md#p-001--selective-allocation) | cue selection, effort allocation, roster and attention selection | refine evaluation: selection must be opportunity-, deadline-, and resource-qualified; no new bundle |
| [P-002 — Local resolution and escalation](../principle-registry.md#p-002--local-autonomy-with-exception-escalation) | local motor correction, teammate repair, staged clinical escalation | already covered by hierarchical/decentralized control and escalation |
| [P-003 — Temporary trace before commitment](../principle-registry.md#p-003--temporary-trace-before-commitment) | tentative anticipation, staged return, provisional opponent belief | existing reversible-state and delayed-commitment bundle |
| [P-004 — Diversity, selection, protection](../principle-registry.md#p-004--diversity-selection-and-protection) | variable practice, exploration, athlete selection | strengthen warning: selection changes opportunity and observed population |
| [P-005 — Reinforce and decay topology](../principle-registry.md#p-005--use-dependent-topology) | practiced action routes and fading readiness | evidence does not isolate topology from ordinary learning or deconditioning |
| [P-006 — Slow negative feedback](../principle-registry.md#p-006--homeostatic-negative-feedback) | pacing, fatigue, training–recovery balance | already covered by state estimation and constrained control; ratios are not the mechanism |
| [P-007 — Prediction-error allocation](../principle-registry.md#p-007--prediction-error-allocation) | occlusion, anticipation, feedback requests, opponent surprise | refine with strategic cue conflict and calibration; no new bundle |
| [P-008 — Compartmentalized interaction](../principle-registry.md#p-008--compartmentalized-interaction) | roles, local team coupling, injury-specific constraints | ordinary modular and distributed control nulls remain sufficient |
| [P-009 — Execution versus maintenance](../principle-registry.md#p-009--maintenance-plane) | training, recovery, rehabilitation, return stages | strong cross-domain recurrence; no distinct sports mechanism |
| [P-010 — Computation into structure](../principle-registry.md#p-010--structural-offloading-and-co-design) | automated skill, morphology, equipment, rehearsed convention | already covered by compilation, mechanics, and caching; reversibility remains key |
| [P-011 — Transient temporal coalitions](../principle-registry.md#p-011--transient-communication-coalitions) | dyadic and team coordination under changing roles | synchrony is insufficient; require perturbation and cross-play |
| [P-012 — Memory matched to lifetime](../principle-registry.md#p-012--memory-matched-to-information-lifetime) | opponent history, skill retention, fatigue and injury memory | refine with decay and cohort shift; existing state/memory hierarchy nulls |
| [P-013 — Shared environmental state](../principle-registry.md#p-013--externalized-shared-state) | shared displays, score, field geometry, ball, coaching artifacts | direct recurrence; shared state must be separated from shared internal belief |

Sports evidence therefore updates evaluation contracts for P-001, P-004,
P-006, P-007, P-009, P-011, P-012, and P-013. It does not justify a
fourteenth registry entry.

## Disposition against current candidates

| Candidate | Sports-derived test or pressure | Disposition |
| --- | --- | --- |
| [001 — Adaptive topology](../../experiments/candidates/001-adaptive-topology.md) | morphology, occupied action, and safe return show that feasible action sets and invalid intermediate states must be explicit | evaluation refinement only |
| [002 — Multiscale context broadcast](../../experiments/candidates/002-multiscale-context-broadcast.md) | task phase, score, remaining distance, fatigue, and opponent context condition local action | compare with ordinary state broadcast and hierarchical control |
| [003 — Recovery-dynamics fragility](../../experiments/candidates/003-recovery-dynamics-fragility.md) | fatigue and return curves require excitation-class and measurement-specific interpretation | supports abstention and recurrence axes, not a generic early-warning signal |
| [004 — Closed endogenous curriculum](../../experiments/candidates/004-closed-endogenous-curriculum.md) | variability schedules, representative tasks, feedback, and challenge must be history-qualified | apply E-SPORT-02 and E-SPORT-03; no new candidate |
| [005 — Severity-ordered containment](../../experiments/candidates/005-severity-ordered-containment.md) | injury and staged return add reversible promotion/regression and recurrence accounting | strengthen recovery benchmark; ordinary staged rollout remains null |
| [006 — Reversible physical skill](../../experiments/candidates/006-reversible-physical-skill.md) | morphology and fatigue constrain the feasible policy, while rehabilitation demonstrates staged physical requalification | apply E-SPORT-05 and charge health probes/rollback |
| [007 — Endogenous observation surveillance](../../experiments/candidates/007-endogenous-observation-surveillance.md) | pacing, opponent behavior, and selection change both state and what becomes observable | strengthen action-conditioned observation and censoring tests |
| [008 — Contestable modular allocation](../../experiments/candidates/008-contestable-modular-allocation.md) | roster selection, playing time, and coaching attention create strategic and path-dependent allocation | use prospective opportunity audit; standard allocation null remains |
| [009 — Graded assurance envelopes](../../experiments/candidates/009-graded-assurance-envelopes.md) | return stages are a concrete graded capability envelope with regression | direct evaluation analogy, not a new mechanism |
| [010 — Reset-coupled staged verification](../../experiments/candidates/010-reset-coupled-staged-verification.md) | repeated functional tests and controlled exposure can add information before return | retain only when stages add conditional information beyond ordinary canary/health checks |
| [011 — Dual-loop operational assurance](../../experiments/candidates/011-dual-loop-operational-assurance.md) | live coaching and later training/recovery analysis separate execution from learning | mature telemetry, review, and training-plan nulls apply |
| [012 — Latency-qualified authority](../../experiments/candidates/012-latency-qualified-authority.md) | cue age, fatigue, injury, and role constrain admissible actions under deadlines | strong benchmark domain; no new authority primitive |
| [013 — Deficit–capability routing](../../experiments/candidates/013-deficit-capability-routing.md) | team roles and substitutions route demand to current capability | compare with assignment, MPC, and backpressure using full state |
| [014 — Versioned observation contract](../../experiments/candidates/014-versioned-observation-contract.md) | observation mode, occlusion, history, opponent, and return state must travel with every claim | strongest owner of SPORT-044; extend evaluation, do not duplicate |
| [015 — Repairable conventions](../../experiments/candidates/015-versioned-repairable-conventions.md) | practiced team coordination reduces messages but turnover and deception demand repair | cross-play and communication-ablation pressure only |
| [016 — Conflict-bounded unit transition](../../experiments/candidates/016-conflict-bounded-unit-transition.md) | team outcomes, local contribution, selection, and opponent conflict are separable levels | synchrony and team success cannot establish a new unit |
| [017 — Semantic compaction](../../experiments/candidates/017-contract-preserving-semantic-compaction.md) | compressed playbooks or scouting summaries must preserve cue, opponent, and applicability conditions | existing provenance/query contract is sufficient |
| [018 — Value/reconstructability tiering](../../experiments/candidates/018-value-reconstructability-aware-tiering.md) | opponent histories, injury records, and rare-event clips differ in value and reconstructability | apply lifecycle and access-cost accounting; no new tiering rule |
| [019 — Audited cumulative inheritance](../../experiments/candidates/019-audited-cumulative-inheritance.md) | coaching, practice, turnover, and selection show that transmitted capability depends on opportunity and evaluator lineage | add representative cross-play and full human-effort accounting |
| [020 — Constitutional control plane](../../experiments/candidates/020-constitutional-control-plane.md) | coach, clinician, athlete, team, and organization hold different information and authority in return decisions | useful governance case, but ordinary staged authority and audit remain nulls |

## Research disposition

### Established enough to use as evaluation discipline

- time-resolved and channel-intervention testing for anticipation;
- explicit separation of video judgment from coupled physical action;
- retention and target-transfer tests after practice;
- latency–accuracy–risk frontiers rather than single metrics;
- distinct external workload, internal response, fatigue, injury, readiness, and
  return constructs;
- staged and reversible return with prospective recurrence monitoring;
- perturbation and cross-play tests for team coordination;
- calibration under deceptive cue conflict;
- prospective selection analysis with relative-age, maturity, opportunity, and
  censoring controls; and
- resource vectors that retain joules, person-hours, exposure, harm, and
  calendar time separately.

### Plausible but requires decisive testing

- adaptive variability schedules that outperform matched curricula;
- opponent-conditioned pacing policies that generalize without unsafe reserve
  use;
- low-bandwidth implicit coordination state beyond explicit protocol and common
  observations;
- multidomain readiness models that improve the risk–availability frontier; and
- representative-task metrics that predict transfer better than ordinary
  distribution-distance and system-identification measures.

### Disputed or to be retired as absolutes

- a universal expert gaze or cue;
- maximal realism as the definition of representative practice;
- deliberate-practice hours as a sufficient account of expertise;
- indiscriminate variability or maximal noise as an optimum;
- a universal Fitts slope or throughput constant;
- a single fatigue, readiness, or recovery score;
- universal acute:chronic workload “sweet spots”;
- return certification by time, symmetry, imaging, pain, or one test alone;
- synchrony as proof of shared cognition or causal coordination;
- confidence as an adequate uncertainty report under adversarial cues;
- current youth performance as latent potential; and
- calories, device watts, arbitrary load units, money, and human time collapsed
  into one unqualified efficiency number.

## Open questions

1. Which observation–action mismatches most strongly predict failure when a
   video-trained anticipation model is moved into closed-loop control?
2. Can cue value be estimated causally when spatial ablation creates unnatural
   displays or reveals the experimenter's hypothesis?
3. What is the smallest representative-task vector that predicts deployment
   transfer across sports-like partially observed control tasks?
4. When does variability add reachable useful solutions rather than merely
   action entropy, and how should perturbation damage be charged?
5. Can learning systems infer an individual challenge point prospectively
   without spending more evaluations than the learning gain saves?
6. Which fatigue states are identifiable from passive telemetry, and which
   require a diagnostic action that itself changes risk and readiness?
7. Can pacing reserve be explored ethically and safely without deceptive
   feedback, or is accurate calibrated challenge equally effective?
8. What prospective intervention separates workload effect from healthy-worker
   survival, exposure withdrawal, prior injury, and selection?
9. Which return-gate variables predict recurrence under matched post-return
   exposure rather than simply delaying exposure?
10. How much apparent team synergy remains after conditioning on ball, geometry,
    roles, common clock, and centralized instructions?
11. Does a learned low-bandwidth team state improve cross-play with unseen
    teammates, or only co-adaptation among familiar partners?
12. Can an opponent model remain calibrated when the opponent strategically
    changes the reliability of its own cues?
13. When does learner-requested feedback beat ordinary value-of-information
    acquisition after query and confidence effects are matched?
14. How many initially unselected athletes would have reached the same outcome
    under equal coaching, competition, and medical opportunity?
15. Which system boundary for human training is decision-relevant: active
    session, recovery day, season, development pathway, or full career?
16. Can facility, embodied equipment, travel, human attention, and injury burden
    be measured with uncertainty without hiding normative weights in a scalar?
17. Does SPORT-044 catch reproducible false comparisons beyond a mature
    versioned experiment tracker and causal metadata schema?

## Bibliography

### Anticipation, occlusion, representativeness, and deception

- Abernethy, B., Gill, D. P., Parks, S. L., & Packer, S. T. (2001).
  Expertise and the perception of kinematic and situational probability
  information. *Perception, 30*, 233–252.
  [DOI 10.1068/p2872](https://doi.org/10.1068/p2872).
- Abernethy, B., & Zawi, K. (2007). Pickup of essential kinematics underpins
  expert perception of movement patterns. *Journal of Motor Behavior, 39*,
  353–367.
  [DOI 10.3200/JMBR.39.5.353-368](https://doi.org/10.3200/JMBR.39.5.353-368).
- Abernethy, B., Zawi, K., & Jackson, R. C. (2008). Expertise and attunement to
  kinematic constraints. *Perception, 37*, 931–948.
  [DOI 10.1068/p5340](https://doi.org/10.1068/p5340).
- Dicks, M., Button, C., & Davids, K. (2010). Availability of advance visual
  information constrains association-football goalkeeping performance during
  penalty kicks. *Perception, 39*, 1111–1124.
  [DOI 10.1068/p6442](https://doi.org/10.1068/p6442).
- Jackson, R. C., Warren, S., & Abernethy, B. (2006). Anticipation skill and
  susceptibility to deceptive movement. *Acta Psychologica, 123*, 355–371.
  [DOI 10.1016/j.actpsy.2006.02.002](https://doi.org/10.1016/j.actpsy.2006.02.002).
- Krause, L., Farrow, D., Pinder, R., Buszard, T., Kovalchik, S., & Reid, M.
  (2019). Enhancing skill transfer in tennis using representative learning
  design. *Journal of Sports Sciences, 37*, 2560–2568.
  [DOI 10.1080/02640414.2019.1647739](https://doi.org/10.1080/02640414.2019.1647739).
- Müller, S., Abernethy, B., & Farrow, D. (2006). How do world-class cricket
  batsmen anticipate a bowler's intention? *Quarterly Journal of Experimental
  Psychology, 59*, 2162–2186.
  [DOI 10.1080/02643290600576595](https://doi.org/10.1080/02643290600576595).
- Park, S. H., Ryu, D., Uiga, L., Masters, R. S. W., Abernethy, B., & Mann,
  D. L. (2019). Falling for a fake: the role of kinematic and non-kinematic
  information in deception detection. *Perception, 48*.
  [DOI 10.1177/0301006619837874](https://doi.org/10.1177/0301006619837874).
- Ryu, D., Abernethy, B., Mann, D. L., Poolton, J. M., & Gorman, A. D. (2013).
  The role of movement exaggeration in the anticipation of deceptive soccer
  penalty kicks. *British Journal of Psychology, 104*, 359–373.
  [DOI 10.1111/j.2044-8295.2011.02092.x](https://doi.org/10.1111/j.2044-8295.2011.02092.x).
- Savelsbergh, G. J. P., Williams, A. M., van der Kamp, J., & Ward, P. (2002).
  Visual search, anticipation and expertise in soccer goalkeepers. *Journal of
  Sports Sciences, 20*, 279–287.
  [DOI 10.1080/026404102317284826](https://doi.org/10.1080/026404102317284826).
- Smeeton, N. J., Williams, A. M., Hodges, N. J., & Ward, P. (2005). The
  relative effectiveness of various instructional approaches in developing
  anticipation skill. *Journal of Experimental Psychology: Applied, 11*,
  98–110.
  [DOI 10.1037/1076-898X.11.2.98](https://doi.org/10.1037/1076-898X.11.2.98).
- Williams, A. M., Ward, P., Knowles, J. M., & Smeeton, N. J. (2002).
  Anticipation skill in a real-world task: measurement, training, and transfer
  in tennis. *Journal of Experimental Psychology: Applied, 8*, 259–270.
  [DOI 10.1037/1076-898X.8.4.259](https://doi.org/10.1037/1076-898X.8.4.259).

### Practice, variability, feedback, and speed–accuracy

- Abdollahipour, R., Wulf, G., Psotta, R., & Palomo Nieto, M. (2019). Practice
  variability promotes an external focus of attention and enhances motor skill
  learning. *Human Movement Science, 64*, 307–319.
  [DOI 10.1016/j.humov.2019.02.015](https://doi.org/10.1016/j.humov.2019.02.015).
- Baker, J., Côté, J., & Abernethy, B. (2003). Sport-specific practice and the
  development of expert decision-making in team ball sports. *Journal of
  Applied Sport Psychology, 15*, 12–25.
  [DOI 10.1080/10413200305400](https://doi.org/10.1080/10413200305400).
- Chiviacowsky, S., Wulf, G., & Lewthwaite, R. (2012). Self-controlled
  learning: the importance of protecting perceptions of competence. *Frontiers
  in Psychology, 3*, 458.
  [DOI 10.3389/fpsyg.2012.00458](https://doi.org/10.3389/fpsyg.2012.00458).
- Duarte, M., & Freitas, S. M. S. F. (2005). Speed-accuracy trade-off in
  voluntary postural movements. *Motor Control, 9*, 180–196.
  [DOI 10.1123/mcj.9.2.180](https://doi.org/10.1123/mcj.9.2.180).
- Helsen, W. F., Starkes, J. L., & Hodges, N. J. (1998). Team sports and the
  theory of deliberate practice. *Journal of Sport & Exercise Psychology, 20*,
  12–34. [DOI 10.1123/jsep.20.1.12](https://doi.org/10.1123/jsep.20.1.12).
- Hossner, E.-J., Käch, B., & Enz, J. (2016). On the optimal degree of
  fluctuations in practice for motor learning. *Human Movement Science, 47*,
  231–239.
  [DOI 10.1016/j.humov.2015.06.007](https://doi.org/10.1016/j.humov.2015.06.007).
- MacKenzie, I. S., & Isokoski, P. (2008). Fitts' throughput and the
  speed-accuracy tradeoff. *CHI '08*, 1633–1636.
  [DOI 10.1145/1357054.1357308](https://doi.org/10.1145/1357054.1357308).
- Macnamara, B. N., Moreau, D., & Hambrick, D. Z. (2016). The relationship
  between deliberate practice and performance in sports: a meta-analysis.
  *Perspectives on Psychological Science, 11*, 333–350.
  [DOI 10.1177/1745691616635591](https://doi.org/10.1177/1745691616635591).
- Moy, B., Renshaw, I., & Gorman, A. D. (2024). Applying the constraints-led
  approach to facilitate exploratory learning of the volleyball serve.
  *Journal of Sports Sciences, 42*, 511–518.
  [DOI 10.1080/02640414.2024.2345415](https://doi.org/10.1080/02640414.2024.2345415).
- Ranganathan, R., Cone, S., Shin, N., Lokesh, R., & Fox, B. (2025). A test of
  the variability vs. specificity
  hypotheses in the retention of a motor skill. *Human Movement Science, 103*,
  103431.
  [DOI 10.1016/j.humov.2025.103431](https://doi.org/10.1016/j.humov.2025.103431).
- Wulf, G., McConnel, N., Gärtner, M., & Schwarz, A. (2002). Enhancing the
  learning of sport skills through external-focus feedback. *Journal of Motor
  Behavior, 34*, 171–182.
  [DOI 10.1080/00222890209601939](https://doi.org/10.1080/00222890209601939).

### Fatigue, pacing, workload, recovery, and return

- Arnal, P. J., et al. (2016). Sleep extension before sleep loss: effects on
  performance and neuromuscular function. *Medicine & Science in Sports &
  Exercise, 48*, 1595–1603.
  [DOI 10.1249/MSS.0000000000000925](https://doi.org/10.1249/MSS.0000000000000925).
- Bodkin, S. G., et al. (2022). Predicting anterior cruciate ligament reinjury
  from return-to-activity assessments at 6 months postsurgery: a prospective
  cohort study. *Journal of Athletic Training, 57*, 325–333.
  [DOI 10.4085/1062-6050-0407.20](https://doi.org/10.4085/1062-6050-0407.20).
- de Morree, H. M., & Marcora, S. M. (2013). Effects of isolated locomotor
  muscle fatigue on pacing and time trial performance. *European Journal of
  Applied Physiology, 113*, 2371–2380.
  [DOI 10.1007/s00421-013-2673-0](https://doi.org/10.1007/s00421-013-2673-0).
- Foster, C., et al. (2001). A new approach to monitoring exercise training.
  *Journal of Strength and Conditioning Research, 15*, 109–115.
  [PubMed 11708692](https://pubmed.ncbi.nlm.nih.gov/11708692/).
- Grindem, H., Snyder-Mackler, L., Moksnes, H., Engebretsen, L., & Risberg,
  M. A. (2016). Simple decision rules can reduce reinjury risk by 84% after ACL
  reconstruction: the Delaware-Oslo ACL cohort study. *British Journal of
  Sports Medicine, 50*, 804–808.
  [DOI 10.1136/bjsports-2016-096031](https://doi.org/10.1136/bjsports-2016-096031).
- Impellizzeri, F. M., Tenan, M. S., Kempton, T., Novak, A., & Coutts, A. J.
  (2020). Acute:chronic workload ratio: conceptual issues and fundamental
  pitfalls. *International Journal of Sports Physiology and Performance, 15*,
  907–913.
  [DOI 10.1123/ijspp.2019-0864](https://doi.org/10.1123/ijspp.2019-0864).
- Konings, M. J., Schoenmakers, P. P. J. M., Walker, A. J., & Hettinga, F. J.
  (2016). The behavior of an opponent alters pacing decisions in 4-km cycling
  time trials. *Physiology & Behavior, 158*, 1–5.
  [DOI 10.1016/j.physbeh.2016.02.023](https://doi.org/10.1016/j.physbeh.2016.02.023).
- Murray, N. B., Gabbett, T. J., Townshend, A. D., & Blanch, P. (2017).
  Calculating acute:chronic workload ratios using exponentially weighted moving
  averages provides a more sensitive indicator of injury likelihood than
  rolling averages. *British Journal of Sports Medicine, 51*, 749–754.
  [DOI 10.1136/bjsports-2016-097152](https://doi.org/10.1136/bjsports-2016-097152).
- Ritland, B. M., et al. (2019). Effects of sleep extension on cognitive/motor
  performance and motivation in military tactical athletes. *Sleep Medicine,
  58*, 48–55.
  [DOI 10.1016/j.sleep.2019.03.013](https://doi.org/10.1016/j.sleep.2019.03.013).
- Serner, A., et al. (2020). Return to sport after criteria-based rehabilitation
  of acute adductor injuries in male athletes: a prospective cohort study.
  *Orthopaedic Journal of Sports Medicine, 8*, 2325967119897247.
  [DOI 10.1177/2325967119897247](https://doi.org/10.1177/2325967119897247).
- Stone, M. R., et al. (2017). Exploring the performance reserve: effect of
  different magnitudes of power output deception on 4,000 m cycling time-trial
  performance. *PLOS ONE, 12*, e0173120.
  [DOI 10.1371/journal.pone.0173120](https://doi.org/10.1371/journal.pone.0173120).
- Varesco, G., et al. (2026). Acute effects of sleep extension on fatigue,
  inhibitory control, short-term vigilance and neuromuscular function in youth
  elite ice hockey players: a randomised crossover trial. *Journal of Sleep
  Research, 35*, e70269.
  [DOI 10.1111/jsr.70269](https://doi.org/10.1111/jsr.70269).
- Jones, H. S., Williams, E. L., Marchant, D. C., Sparks, S. A., Bridge, C. A.,
  Midgley, A. W., & McNaughton, L. R. (2016). Deception has no acute or residual
  effect on cycling time trial performance but negatively effects perceptual responses.
  *Journal of Science and Medicine in Sport, 19*, 771–776.
  [DOI 10.1016/j.jsams.2015.12.006](https://doi.org/10.1016/j.jsams.2015.12.006).

### Team coordination, selection, and resource measurement

- Ainsworth, B. E., et al. (2011). 2011 Compendium of Physical Activities: a
  second update of codes and MET values. *Medicine & Science in Sports &
  Exercise, 43*, 1575–1581.
  [DOI 10.1249/MSS.0b013e31821ece12](https://doi.org/10.1249/MSS.0b013e31821ece12).
- Blaser, M. A., & Seiler, R. (2019). Shared knowledge and verbal communication
  in football: changes in team cognition through collective training.
  *Frontiers in Psychology, 10*, 77.
  [DOI 10.3389/fpsyg.2019.00077](https://doi.org/10.3389/fpsyg.2019.00077).
- Bolstad, C. A., & Endsley, M. R. (1999). Shared mental models and shared
  displays: an empirical evaluation of team performance. *Proceedings of the
  Human Factors and Ergonomics Society Annual Meeting, 43*, 213–217.
  [DOI 10.1177/154193129904300318](https://doi.org/10.1177/154193129904300318).
- Duarte, R., Araújo, D., Correia, V., & Davids, K. (2013). Competing together:
  assessing the dynamics of team–team and player–team synchrony in professional
  association football. *Human Movement Science, 32*, 555–566.
  [DOI 10.1016/j.humov.2013.01.011](https://doi.org/10.1016/j.humov.2013.01.011).
- Gastin, P. B., et al. (2016). Inertial sensors to estimate the energy
  expenditure of team-sport athletes. *Journal of Science and Medicine in
  Sport, 19*, 177–181.
  [DOI 10.1016/j.jsams.2015.01.013](https://doi.org/10.1016/j.jsams.2015.01.013).
- Hill, M., Scott, S., Malina, R. M., McGee, D., & Cumming, S. P. (2020).
  Relative age and maturation selection biases in academy football. *Journal
  of Sports Sciences, 38*, 1359–1367.
  [DOI 10.1080/02640414.2019.1649524](https://doi.org/10.1080/02640414.2019.1649524).
- Johnston, K., Wattie, N., Schorer, J., & Baker, J. (2018). Talent
  identification in sport: a systematic review. *Sports Medicine, 48*, 97–109.
  [DOI 10.1007/s40279-017-0803-2](https://doi.org/10.1007/s40279-017-0803-2).
- Silva, P., et al. (2016). Practice effects on intra-team synergies in football
  teams. *Human Movement Science, 46*, 39–51.
  [DOI 10.1016/j.humov.2015.11.017](https://doi.org/10.1016/j.humov.2015.11.017).
- Stout, R. J., Cannon-Bowers, J. A., Salas, E., & Milanovich, D. M. (1999).
  Planning, shared mental models, and coordinated performance: an empirical
  link is established. *Human Factors, 41*, 61–71.
  [DOI 10.1518/001872099779577273](https://doi.org/10.1518/001872099779577273).
- Tróznai, Z., et al. (2021). Talent selection based on sport-specific tasks is
  affected by the relative age effects among adolescent handball players.
  *International Journal of Environmental Research and Public Health, 18*,
  11418.
  [DOI 10.3390/ijerph182111418](https://doi.org/10.3390/ijerph182111418).

## Audit verdict

Sport does not contribute a new principle or candidate after mature baselines
are admitted. It contributes an unusually strict proving ground for the
project's existing ideas because observation, action, history, resource state,
opponents, teams, safety, and lifecycle cost are simultaneously consequential.

The durable output is SPORT-044: a performance claim is incomplete unless it is
bound to its available evidence, feasible actions, acquisition and selection
history, opponent and teammate distribution, feedback, fatigue/damage/return
state, intervention, sampling unit, and complete resource boundary. The claim
must then survive representative target changes and equal-budget conventional
baselines. If the same result is reproduced by calibrated prediction,
retrieval, control, curriculum, system identification, explicit protocol,
causal modelling, or staged assurance, the sport terminology adds no mechanism.
