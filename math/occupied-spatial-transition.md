# Occupancy-qualified spatial transition

This note defines the narrow built-environment stress track for
[Candidate 001](../experiments/candidates/001-adaptive-topology.md). Its purpose
is to expose state and cost that disappear when a topology edit is represented
as an instantaneous graph operation.

The contract applies only when physical or service topology changes while
people, critical services, or hazardous inventory remain inside the affected
dependency boundary. If the asset can be isolated and a fixed approved sequence
dominates, ordinary change control is the relevant baseline.

## Typed transition state

For transition version $v$ and step $k$, keep the state tuple

$$
X_{v,k}=
\left(
G, Y, O, R, F, S, U, H, C, E
\right)_{v,k}.
$$

The fields are deliberately not collapsed:

- $G$: surveyed physical and service topology, including uncertainty;
- $Y$: required service by user group, location, and time;
- $O$: observed or forecast occupancy, ability, familiarity, and assistance;
- $R$: ordinary, accessible, construction, emergency, responder, and goods
  routes, including capacity and closures;
- $F$: detection, alarm, suppression, compartment, smoke and heat state, and
  scenario-specific evacuation timing;
- $S$: structural, utility, control, and indoor-environment state;
- $U$: ownership, permits, operating restrictions, acceptance authority,
  stop-work power, and their expiry;
- $H$: material and work state—installed, removed, stored, in transit,
  reusable, damaged, waste, temporary, and irreversible;
- $C$: cost, energy, carbon, water, waste, and disruption accounts; and
- $E$: evidence support, timestamp, version, calibration, coverage,
  uncertainty, and invalidation dependencies.

A plan or model is an input to $E$; it is not a substitute for $G$, $O$, $F$,
or $S$. Likewise, an actuator command belongs to the control record while
verified equipment response belongs to $S$.

## Intermediate-state admissibility

Let $\mathcal H$ be the preregistered set of hard constraints. The step gate is

$$
\mathcal A_{v,k}
=
\mathbf 1
\left[
\bigwedge_{h\in\mathcal H}
g_h(X_{v,k})\ge 0
\right]
\mathbf 1[E_{v,k}\text{ is sufficient and current}]
\mathbf 1[U_{v,k}\text{ permits the step}],
$$

where every indicator is dimensionless. Each $g_h$ retains its own physical
unit and threshold; the conjunction does not add seconds, newtons, contaminant
concentration, and route availability into a fictitious scalar score.

For fire scenario $s$, one necessary margin is

$$
m^{\mathrm{egress}}_{s,v,k}
=ASET_{s,v,k}-RSET_{s,v,k}-M_s\quad[\mathrm{s}],
$$

with $m^{\mathrm{egress}}_{s,v,k}\ge0$. Here $ASET$ is available safe egress
time, $RSET$ is required safe egress time, and $M_s$ is the frozen scenario
margin, all in seconds. Passing this one margin does not establish structural,
accessibility, utility, or environmental admissibility.

For user group $g$, define accessible route availability as

$$
a_{g,v,k}
=
\mathbf 1[\exists\text{ usable route for }g]
\mathbf 1[q_{g,v,k}\ge q_g^{\min}],
$$

where $a$ is dimensionless, route capacity $q$ and its minimum $q^{\min}$ use
the same declared unit such as persons per second, and “usable” includes the
group's mobility and assistance requirements. A graph path that is blocked,
untenable, too narrow, or unsupported does not satisfy the predicate.

The controller may execute step $k$ only when $\mathcal A_{v,k}=1$. Otherwise
it must abstain or enter a pre-approved restricted, decanted, isolated, or
safe-stop state. It cannot average one hard violation against an energy saving.

## Evidence-age gate

For evidence item $j$, let measurement time be $t_j$, current decision time be
$t$, and maximum permitted age under the current hazard and work state be
$\tau_j(X_{v,k})$, all in seconds. Its freshness indicator is

$$
f_j(t,X_{v,k})=
\mathbf 1[t-t_j\le\tau_j(X_{v,k})]
\mathbf 1[d_j(X_{v,k})=0],
$$

where $d_j$ is a dimensionless invalidation flag. Moving a wall, isolating a
circuit, changing occupancy, impairing suppression, or changing the sensor
support can set $d_j=1$ even before the clock expires. Required evidence is
current only when $\prod_{j\in\mathcal J_{v,k}} f_j=1$.

## Service and transition burden

For user group $g$ over transition interval $[t_0,t_1]$, service loss is

$$
L_g=
\int_{t_0}^{t_1}
\left[Q_{g,\mathrm{ref}}(t)-Q_g(t)\right]_+dt.
$$

If $Q_g$ is usable service places, $L_g$ is place-hours; if $Q_g$ is flow in
persons per hour, $L_g$ is persons. The service unit must be declared, and the
vector $\mathbf L=(L_1,\ldots,L_G)$ remains visible so an aggregate cannot hide
loss concentrated on one group.

Transition burden is reported as a vector rather than an automatic weighted
sum:

$$
\mathbf B=
\left(
\mathbf L,
T_{\mathrm{transition}},
E_{\mathrm{transition}},
GWP_{\mathrm{transition}},
C_{\mathrm{transition}},
W_{\mathrm{material}},
N_{\mathrm{defect}},
N_{\mathrm{hard\ violation}}
\right).
$$

The components use, respectively, declared service-unit-hours, seconds,
joules, kilograms CO$_2$e, currency, kilograms, a defect count, and a hard-
violation count. Any scalarization must publish its weights, units, and
decision authority. The primary feasibility condition is
$N_{\mathrm{hard\ violation}}=0$ for every protected scenario—not a favorable
mean.

Fast reversible allocation and slow structural adaptation therefore retain
different action, deficit, build, carry, and stranded-capacity coordinates
([C-1496](../research/claims.md#c-1496)).

## Commitment and recovery

Let $K_{v,k}$ be the set of material or legal commitments already made. A
software rollback is physically available only if a tested predecessor state
$X_{v,k^-}$ remains reachable under the current $K_{v,k}$, resources, authority,
and time. Define

$$
r_{v,k}=\mathbf 1[X_{v,k^-}\in\mathcal R(X_{v,k},K_{v,k})],
$$

where $r$ is dimensionless and $\mathcal R$ is the set of reachable, verified
states. When $r_{v,k}=0$, the record must name a reachable safe-stop or forward-
recovery state; calling the transition reversible is false.

Recovery after a demand-regime reversal is part of the structural decision,
not an optional endpoint after the selected regime has already been scored
([C-1496](../research/claims.md#c-1496)).

Recovery is complete only after target service, evidence validity, open-defect
limits, and reserve are restored. For each service component $m$,

$$
T^{\mathrm{recover}}_m
=
\inf\{t\ge t_f:
Q_m(t:t+\Delta)\ge Q_m^{\mathrm{target}}
\land R_m(t:t+\Delta)\ge R_m^{\min}\}-t_f,
$$

where $t_f$ is fault or interruption time, $\Delta$ is the frozen sustainment
window, $Q$ and reserve $R$ use declared service units, and $T^{\mathrm{recover}}$
is seconds. Reopening without reserve restoration is reported separately.

## Equal-budget comparison and rejection

The residual contract is compared with the complete ordinary stack: surveyed
as-built records, code and professional review, permits, impairment control,
configuration management, construction sequencing, commissioning, post-
occupancy evaluation, and lifecycle asset management. All arms receive the same
asset, staff time, information, sensors, professional review, material,
construction window, compute, maintenance, and whole-life budget.

Reject or merge the residual when any of the following holds:

1. the asset can be isolated and a fixed approved sequence matches outcomes;
2. a protected-user accessibility or life-safety constraint is violated;
3. the advantage disappears when stale evidence, failed actuators, occupancy
   changes, transition duration, irreversible work, and common causes are
   represented;
4. mature change control plus commissioning matches the protected-service and
   lifecycle frontier; or
5. apparent recovery omits displaced exposure, defects, reserve restoration,
   or the next disruption.

The candidate contract diagram is
[Occupancy-qualified spatial transition diagram](../experiments/candidates/001-adaptive-topology.md#occupied-spatial-topology-track).
The evidence boundary is developed in the
[built-environment audit](../research/audits/2026-08-05-built-environment-urban-systems.md).
