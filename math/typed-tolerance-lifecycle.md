# Typed tolerance, response, and recovery lifecycle

This note turns the durable result of the
[immune tolerance audit](../research/audits/2026-08-05-immune-tolerance-trained-immunity.md)
into an evaluation contract. The useful transfer is not an “immune score.” It
is the refusal to collapse representation, recognition, permission, response,
suppression, deletion, impairment, memory, and recovery into one bit.

## State vocabulary

For module or rule $i$ at time $t$, define

$$
z_i(t)\in\mathcal Z=
\{\mathrm{absent},\mathrm{ignorant},\mathrm{eligible},\mathrm{active},
\mathrm{quarantined},\mathrm{suppressed},\mathrm{impaired},
\mathrm{contracted},\mathrm{memory},\mathrm{deleted}\}.
$$

$z_i$ is categorical and dimensionless. The names describe engineered states;
they do not assert biological identity. Every transition stores:

1. the previous and proposed state;
2. the evidence and representation support used;
3. the actor and authority that may make the transition;
4. expected useful effect and distinct collateral-loss terms;
5. compute, data, time, energy, and reserve budget;
6. expiry, revalidation, rollback or recovery target; and
7. the observed outcome and decision lineage.

“Inactive” is not an admissible terminal diagnosis. It can mean that the rule
was never generated, relevant evidence was not represented, eligibility is
unknown, policy suppressed it, resources starved it, prior response contracted,
the rule is retained as memory, or the implementation is impaired.

## Representation, recognition, and permission

Let $\mathcal S$ be the declared scenario set and $\mathcal R_t\subseteq\mathcal S$
the scenarios represented by current evidence. Representation
coverage is

$$
\kappa_t=\frac{\sum_{s\in\mathcal R_t}w_s}
{\sum_{s\in\mathcal S}w_s},
$$

where scenario weights $w_s\ge0$ and $\kappa_t$ are dimensionless. $\kappa_t$
describes the registered scenario set; it does not prove that an unrepresented
state is safe or that represented evidence is current.

For principal $p$, action $a$, object $o$, and epoch or time $t$, permission is

$$
\operatorname{allow}(p,a,o,t)=
\operatorname{authn}(p,t)
\land\operatorname{authz}(p,a,o,t)
\land\operatorname{safe}(x_t,a)
\land\operatorname{fresh}(e_t).
$$

All predicates are Boolean. Authentication identifies the principal;
authorization scopes the action and object; $x_t$ is observed system state;
and $e_t$ is evidence with provenance, coverage, uncertainty, and expiry. A
recognition or anomaly score can inform $x_t$ but cannot replace any predicate.

## Cost-sensitive response

Let latent state $s$ range over benign/needed, harmful, compromised, and
unresolved conditions. Let the action set include permit, monitor, rate-limit,
quarantine, suppress, delete, and escalate. A calibrated policy chooses

$$
a^*(x,c)=
\arg\min_{a}
\sum_s L(a,s,c)\Pr(s\mid x,c),
$$

where $x$ is observed evidence, $c$ is context and provenance, and every term
$L(a,s,c)$ is converted into one declared decision unit. Before any optional
scalarization, the loss vector remains visible:

$$
\mathbf L=
(L_{\mathrm{false\ permit}},L_{\mathrm{false\ suppress}},
L_{\mathrm{false\ delete}},L_{\mathrm{missed\ harm}},
L_{\mathrm{delay}},L_{\mathrm{recovery}}).
$$

The components may use different native units—lost useful requests, incidents,
seconds, joules, or currency—until a documented authority supplies conversion
weights. Rare useful capability deleted by a gate is a measured outcome, not a
free reduction in false accepts.

## Population and contraction accounting

When modules can replicate, scale, pause, retire, or return from memory, track
lineage $i$ as

$$
\frac{dN_i}{dt}=
\left(r_i(t)-d_i(t)-q_i(t)\right)N_i(t)+b_i(t),
$$

where $N_i$ is instances, $r_i$ is replication or scale-up rate, $d_i$ is
retirement/failure rate, and $q_i$ is reversible transition into quiescence,
all in s$^{-1}$ or h$^{-1}$; $b_i$ is newly admitted instances per second or
hour. A fall in active count must be attributed to retirement, contraction,
movement, suppression, resource loss, or quiescence.

Lineage share and effective diversity are

$$
p_i=\frac{N_i}{\sum_jN_j},
\qquad
D_2=\frac{1}{\sum_i p_i^2}.
$$

$p_i$ and $D_2$ are dimensionless. $D_2$ is an effective count of equally
represented lineages, not proof of functional independence, failure-domain
separation, or future coverage.

## Maintained memory and local placement

For retained memory instances $M(t)$,

$$
\frac{dM}{dt}=
(\rho_{\mathrm{refresh}}(t)-\delta_M(t))M(t)+\eta C(t),
$$

where refresh and loss rates $\rho_{\mathrm{refresh}}$ and $\delta_M$ are in
s$^{-1}$, $C$ is candidate instances per second entering the memory pathway,
and $\eta$ is a dimensionless conversion fraction. Storage without retrieval,
refresh, invalidation, compatibility, and retirement is not credited as useful
memory.

For copies $m_l$ at location $l$, compare placement policies with

$$
\min_{m_l\ge0}
\sum_l
\left[
c_l^{\mathrm{maint}}m_l+
\mathbb E(c_l^{\mathrm{miss}}U_l(m_l))+
c_l^{\mathrm{move}}v_l
\right].
$$

$m_l$ and moved amount $v_l$ use instances or bytes; unmet events $U_l$ use
events; coefficients convert all terms to joules or currency over one horizon.
Local latency gains must pay for replication, refresh, inconsistency,
invalidations, and recovery.

## Reactivation and recovery gate

A quarantined, suppressed, or impaired module cannot be reactivated merely
because load increased or the original detector score fell. Reactivation at
time $t$ requires

$$
\mathcal R_i(t)=
\mathbf 1[e_i(t)\text{ is current}]
\mathbf 1[u_i(t)\text{ authorizes re-entry}]
\mathbf 1[h_i(t)\ge h_i^{\min}]
\mathbf 1[b_i(t)\ge b_i^{\min}],
$$

where indicators are dimensionless, health $h_i$ and its threshold share a
declared unit or normalized scale, and resource headroom $b_i$ and its minimum
share a unit such as joules, bytes, or operations per second. A pass creates a
bounded probation state; independent outcome verification is still required.

Recovery time is measured to sustained useful service plus restored reserve:

$$
T_{\mathrm{recover}}=
\inf\left\{t\ge t_f:
Q(t:t+\Delta)\ge Q^{\min}
\land R(t:t+\Delta)\ge R^{\min}\right\}-t_f,
$$

where $t_f$ and $T_{\mathrm{recover}}$ are seconds, $\Delta$ is a frozen
sustainment interval, and $Q$ and $R$ are task service and reserve in their
declared units. A lower alert rate or an empty queue is not recovery.

## Lifecycle boundary and null

Charge sensing, routing, candidate generation, training, evaluation,
replication, serving, monitoring, replay, reserve, movement, retirement, and
recovery in joules over the same horizon. Report task quality, false permit,
false suppression, false deletion, missed harm, containment latency, verified
recovery, rare-capability retention, second-event readiness, and energy as a
vector.

The complete null is a typed state machine plus calibrated risk and abstention,
least-privilege identity and access control, anomaly detection, constrained
control, evolutionary or ensemble search where applicable, replay, placement,
and resource-aware scheduling. Reject the immune framing if this ordinary
stack reproduces its decisions and frontier at equal information,
intervention, compute, storage, reserve, and maintenance budget.

Editable lifecycle diagram:
[Typed-tolerance lifecycle diagram](../concept/07-cross-domain-convergence.md#inactive-is-not-one-state).
