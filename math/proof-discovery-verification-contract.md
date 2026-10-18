# Proof-discovery and verification contract

This note defines the measurement boundary for
[Fixture F-004](../experiments/fixtures/004-versioned-proof-discovery.md). It
operationalizes the versioned
**propose–challenge–decompose–prove–check–publish–invalidate** lifecycle derived
from the
[mathematical-practice audit](../research/audits/2026-08-05-mathematical-practice-proof-discovery.md).
It is a shared benchmark contract for
[Candidates 004](../experiments/candidates/004-closed-endogenous-curriculum.md),
[009](../experiments/candidates/009-graded-assurance-envelopes.md),
[010](../experiments/candidates/010-reset-coupled-staged-verification.md),
[011](../experiments/candidates/011-dual-loop-operational-assurance.md),
[014](../experiments/candidates/014-versioned-observation-contract.md),
[017](../experiments/candidates/017-contract-preserving-semantic-compaction.md),
and [019](../experiments/candidates/019-audited-cumulative-inheritance.md).

## Immutable identity envelope

Every episode starts with a sealed identity envelope

$$
I_e=(h_p,h_d,h_\ell,h_a,h_L,h_C,h_K,h_s),
$$

where $e$ identifies the episode; $h_p$ is the cryptographic hash of the exact
problem statement; $h_d$ hashes its definitions and encodings; $h_\ell$ hashes
the declared logic and semantics; $h_a$ hashes the admitted axioms; $h_L$
hashes the complete accessible library version; $h_C$ hashes the accessible
corpus, retrieval index, and cutoff; $h_K$ hashes the checker, certificate
calculus, and preprocessing reconstruction; and $h_s$ hashes the task-family
generator and paired random seed. Every $h$ value is an immutable byte string.
Hash equality establishes identity of registered bytes, not adequacy of the
formalization or soundness of the implementation.

The accessible information record is

$$
\Lambda_e=(A_e^{\mathrm{train}},A_e^{\mathrm{prompt}},
A_e^{\mathrm{retrieve}},A_e^{\mathrm{proof}},A_e^{\mathrm{eval}},
A_e^{\mathrm{human}}),
$$

where each $A_e^x$ is a set of immutable artifact identifiers available through
channel $x$. The channels respectively cover training, prompt/context,
retrieval, proof or tactic traces, evaluation feedback, and human hints or
formalization. Availability is recorded independently of whether an artifact
is retrieved or used.

## Versioned lifecycle state

At event time $t$ in seconds from episode start, define

$$
S_t=(G_t,Q_t,L_t,X_t,D_t,C_t,R_t,\sigma_t),
$$

where $G_t$ is the set of open typed goals, $Q_t$ is the queue of proposed
operations, $L_t$ is the accessible immutable library view, $X_t$ is the set of
examples and counterexamples, $D_t$ is the proof-and-dependency directed
acyclic graph (DAG), $C_t$ is the set of proof, refutation, model, or test
certificates, $R_t$ is the append-only event record, and $\sigma_t$ is the
typed publication state. The finite state space is

$$
\Sigma=\{\mathrm{proposed},\mathrm{tested},\mathrm{proved},
\mathrm{refuted},\mathrm{unknown},\mathrm{disputed},
\mathrm{retracted}\}.
$$

An event $a_t$ may transform the state only when its typed preconditions hold:

$$
S_{t+1}=T(S_t,a_t),\qquad a_t\in\mathcal A(S_t),
$$

where $T$ is the versioned transition function and $\mathcal A(S_t)$ is the set
of admissible events in state $S_t$. `Tested` records finite support only;
`proved` records acceptance of a derivation relative to $I_e$; `refuted`
requires an admissible counterexample or checked refutation; `unknown` preserves
timeouts, unsupported theories, and incomplete searches; `disputed` records an
unresolved challenge to formalization, assumptions, checking, or significance;
and `retracted` records invalidation or supersession without deleting history.

A published version is

$$
v_i=(h_i,P_i,o_i,u_i,t_i,\sigma_i,E_i,B_i),
$$

where $h_i$ is the version hash, $P_i$ is the set of parent-version hashes,
$o_i$ is the typed transformation, $u_i$ is the actor or process identifier,
$t_i$ is the event time in seconds, $\sigma_i\in\Sigma$ is the state, $E_i$ is
the evidence-and-certificate set, and $B_i$ is the measured cost record. A new
version never overwrites its parents.

## Proposals, tests, and counterexamples

Let $p_i$ be candidate proposition $i$, $\theta_i$ its explicit definitions
and parameters, $O_i$ its set of proof obligations, $H_i$ its declared source
and transformation ancestry, and $q_i$ its proposal method. The proposal record
is

$$
z_i=(p_i,\theta_i,O_i,H_i,q_i,I_e).
$$

For a universally quantified candidate
$p_i\equiv\forall x\in\mathcal X_i:P_i(x)$, an exact counterexample is an element
$x^*\in\mathcal X_i$ such that

$$
P_i(x^*)=\mathrm{false}.
$$

$\mathcal X_i$ is the declared admissible domain and $P_i$ is the encoded
Boolean predicate. The counterexample record must prove or independently check
both domain membership and predicate failure. Its size
$s(x^*)\in\mathbb R_{\ge0}$ is measured under a preregistered task-native order;
smallest-counterexample claims compare $s(x^*)$, not discovery time alone.

For a finite test multiset $U_i=\{x_1,\ldots,x_n\}$, empirical support is

$$
\widehat q_i=
\frac{1}{n}\sum_{j=1}^{n}\mathbf 1[P_i(x_j)=\mathrm{true}],
$$

where $n$ is the test count, $\mathbf 1[\cdot]$ is an indicator, and
$\widehat q_i$ is dimensionless. The record also names the generator,
distribution or enumeration boundary, random seed, arithmetic precision in
bits, and error interval in the predicate's native unit. Even
$\widehat q_i=1$ leaves the state `tested` unless a checked exhaustive reduction
or proof closes the universal obligation.

## Abstraction obligations

Let $\mathcal X$ be a concrete domain, $\mathcal A$ an abstract domain,
$\alpha:\mathcal X\rightarrow\mathcal A$ an abstraction map, and
$\gamma:\mathcal A\rightarrow2^{\mathcal X}$ a concretization map. For a
concrete property $P:\mathcal X\rightarrow\{\mathrm{true},\mathrm{false}\}$
and abstract property
$P^{\sharp}:\mathcal A\rightarrow\{\mathrm{true},\mathrm{false}\}$, using the
abstraction to prove $P$ requires the soundness obligation

$$
\forall a\in\mathcal A:\quad
P^{\sharp}(a)\Rightarrow
\forall x\in\gamma(a):P(x).
$$

When a claimed transfer also requires preservation of operation
$f:\mathcal X\rightarrow\mathcal X$, declare an abstract operation
$f^{\sharp}:\mathcal A\rightarrow\mathcal A$ and check

$$
\alpha(f(x))=f^{\sharp}(\alpha(x))
$$

for the stated subset of $x\in\mathcal X$. The equality is an exact semantic
claim unless a typed approximation relation and tolerance are registered.
Excluded cases, failed concretizations, reconstruction loss, and the human time
used to choose $\alpha$ are part of the result.

## Decomposition and proof-DAG reconstruction

For target goal $g_0$, let the proof DAG be

$$
D_{\pi}=(V_{\pi},E_{\pi},r,\kappa),
$$

where $V_{\pi}$ is a set of goal, lemma, definition, axiom, or certificate
nodes; $E_{\pi}\subseteq V_{\pi}\times V_{\pi}$ contains directed dependency
edges from a conclusion to each required premise; $r\in V_{\pi}$ is the root
node encoding $g_0$; and $\kappa_v$ is the typed local reconstruction function
stored for node $v$. For each non-leaf node $v$ with dependency set
$\operatorname{dep}(v)$, reconstruction requires

$$
\kappa_v\left(\{\pi_u:u\in\operatorname{dep}(v)\}\right)=\pi_v,
$$

where $\pi_u$ is a checked artifact proving node $u$ and $\pi_v$ is the
constructed artifact for node $v$. Leaves must resolve to hashed axioms,
definitions, admitted theorems, exact decision procedures, or independently
checked certificates in $I_e$.

Let $\operatorname{topo}(D_{\pi})$ be a topological ordering from leaves to
root. Full-DAG reconstruction succeeds when every $\kappa_v$ executes in that
order and the independent checker accepts the resulting root artifact against
$h_p$ and $h_L$. A list of plausible lemmas, a cyclic graph, or individually
checked children without a parent reconstruction function does not close
$g_0$.

Proof-dependency economy is reported, not assumed. If $N_{\mathrm{all}}$ is the
number of accessible library nodes and $N_{\mathrm{cl}}$ is the number in the
root's transitive dependency closure, then

$$
\rho_{\mathrm{dep}}=
\frac{N_{\mathrm{cl}}}{N_{\mathrm{all}}}
$$

is a dimensionless dependency ratio. Smaller is useful only if reconstruction,
robustness, and transfer remain non-inferior.

## Generator, certificate, and checker separation

For instance bytes $F$, generator $G$, claimed verdict $y$, certificate $c$,
preprocessing trace $r_F$, and independent checker $K$, acceptance is

$$
\operatorname{Accept}(F,y,c)=
\mathbf 1[h(F)=h_p]\,
\mathbf 1[K(h(F),y,c,r_F,h_L,h_K)=\mathrm{accept}],
$$

where $h(\cdot)$ is the registered hash function and both indicator factors are
dimensionless. Generator $G$ cannot set the checker's verdict. The identities,
code lineage, parsers, libraries, axioms, hardware, and people shared by $G$ and
$K$ are published as a shared-trust-root set $W_{GK}$; process separation is
not described as independent when $W_{GK}$ contains the relevant possible
fault.

For accepted artifact $i$, record certificate size $b_i^{\mathrm{cert}}$ in
bytes, generation time $t_i^{\mathrm{gen}}$ in seconds, checking time
$t_i^{\mathrm{check}}$ in seconds, checker peak memory $m_i^{\mathrm{check}}$
in bytes, and certificate lifecycle energy $E_i^{\mathrm{cert}}$ in joules.
An unsupported solver exit code or a certificate that does not bind the exact
instance and preprocessing trace cannot produce `proved` or `refuted`.

## Leakage-safe task partitions

Let $\mathcal U$ be the universe of theorem, proof, definition, example,
counterexample, generated sibling, and source artifacts. Define a symmetric
ancestor-related relation $\sim_A$ over $\mathcal U$ that groups exact
duplicates, renamings, restatements, specializations, isomorphic generated
siblings, proof ancestors, and source-equivalent formalizations under the
frozen detection protocol. Let $[u]_A$ denote the group containing artifact
$u$.

For training artifacts $\mathcal T\subset\mathcal U$ and confirmatory artifacts
$\mathcal H\subset\mathcal U$, the dependency-safe split condition is

$$
\{[u]_A:u\in\mathcal T\}
\cap
\{[u]_A:u\in\mathcal H\}=\varnothing.
$$

Additionally, if $\operatorname{cl}_D(u)$ is the transitive proof and library
dependency closure of $u$, require

$$
\left(\bigcup_{u\in\mathcal H}\operatorname{cl}_D(u)\right)
\cap \mathcal T=\varnothing
$$

unless the overlapping artifacts are explicitly declared as common premises
available to every arm. Public benchmark queries, human corrections, and model
updates after the split freeze are added to $\Lambda_e$ and disqualify the
affected hidden family from confirmatory use.

## Publication and reverse-dependency invalidation

Let the release dependency graph be $D_v=(N_v,E_v)$, with edge $(a,b)\in E_v$
meaning artifact $a$ depends on artifact $b$. If changed or invalid artifact
set $J\subseteq N_v$ is detected, its reverse-dependency invalidation set is

$$
\operatorname{Inv}(J)=
J\cup\{a\in N_v:\exists b\in J\text{ with a path }a\leadsto b\}.
$$

Every artifact in $\operatorname{Inv}(J)$ is quarantined from `proved` release
status until its exact version is rechecked or rebuilt against a replacement.
The prior record remains addressable and becomes `retracted` when its published
acceptance claim no longer holds; a challenge to formalization or significance
may instead enter `disputed` while the checked derivation remains recorded.

For planted invalidation set $J^*$ and submitted set $\widehat J$, invalidation
precision and recall are

$$
P_{\mathrm{inv}}=
\frac{|\widehat J\cap J^*|}{|\widehat J|},
\qquad
R_{\mathrm{inv}}=
\frac{|\widehat J\cap J^*|}{|J^*|}.
$$

Both are dimensionless; an empty submitted set receives zero precision and
recall. Also report time to quarantine in seconds, stale artifact-hours before
quarantine, rebuild time in seconds, repair human-hours, and recurrent bad
acceptances after release.

## Equal lifecycle budget

For method $m$, the binding resource vector is

$$
\mathbf B_m=(N_{\mathrm{train}},N_{\mathrm{ret}},N_{\mathrm{prop}},
N_{\mathrm{test}},N_{\mathrm{solve}},N_{\mathrm{check}},
N_{\mathrm{node}},B_{\mathrm{state}},B_{\mathrm{cert}},
t_{\mathrm{wall}},t_{\mathrm{cpu}},h_{\mathrm{human}},
E_{\mathrm{life}},M_{\mathrm{peak}}).
$$

The first seven terms count training items, retrieval calls, proposals, tested
instances, solver calls, checker calls, and search nodes. $B_{\mathrm{state}}$
and $B_{\mathrm{cert}}$ are retained-state and certificate bytes;
$t_{\mathrm{wall}}$ and $t_{\mathrm{cpu}}$ are seconds; $h_{\mathrm{human}}$ is
person-hours; $E_{\mathrm{life}}$ is joules at the declared measurement
boundary; and $M_{\mathrm{peak}}$ is peak working memory in bytes.

Lifecycle energy is

$$
E_{\mathrm{life}}=
E_{\mathrm{train}}+E_{\mathrm{index}}+E_{\mathrm{retrieve}}+
E_{\mathrm{propose}}+E_{\mathrm{challenge}}+E_{\mathrm{prove}}+
E_{\mathrm{check}}+E_{\mathrm{publish}}+E_{\mathrm{retain}}+
E_{\mathrm{invalidate}}+E_{\mathrm{repair}},
$$

with every term measured in joules across one declared hardware and facility
boundary. Human formalization, steering, review, and repair remain person-hours
and are not silently converted to joules. A method that exceeds any binding
ceiling is infeasible for that paired instance; otherwise report a
preregistered Pareto frontier rather than post-hoc cost normalization.

## Outcome vector and component effects

For method $m$, report

$$
\mathbf Y_m=(N_{\mathrm{proved}},N_{\mathrm{refuted}},
N_{\mathrm{tested}},N_{\mathrm{unknown}},N_{\mathrm{bad\,accept}},
R_{\mathrm{recon}},P_{\mathrm{inv}},R_{\mathrm{inv}},
t_{\mathrm{first}},b_{\mathrm{median}},h_{\mathrm{human}},
E_{\mathrm{life}}),
$$

where the first five terms are artifact counts; $R_{\mathrm{recon}}$ is the
dimensionless proportion of published proof DAGs reconstructed and rechecked
from their retained dependencies; $P_{\mathrm{inv}}$ and $R_{\mathrm{inv}}$
are defined above; $t_{\mathrm{first}}$ is seconds to the first checked result;
$b_{\mathrm{median}}$ is median certificate size in bytes;
$h_{\mathrm{human}}$ is person-hours; and $E_{\mathrm{life}}$ is joules.
Results are stratified by task family, state, and hidden regime rather than
collapsed into a universal reasoning score.

Checked-result energy efficiency may be reported as

$$
\eta_E=
\frac{N_{\mathrm{proved}}+N_{\mathrm{refuted}}}{E_{\mathrm{life}}}
\quad[\mathrm{checked\ result}/\mathrm{J}],
$$

but only beside the full outcome vector, because a system can inflate
$\eta_E$ with trivial tasks or low coverage. For component $c$ and outcome
$Y_j$, the paired ablation effect is

$$
\Delta_{c,j}=Y_j(m_{\mathrm{full}})-Y_j(m_{-c}),
$$

where $m_{-c}$ removes component $c$ without reallocating its unused budget.
Report paired 95% uncertainty intervals over frozen problem-family and random-
seed strata.

## Contract retirement

The composed residual is retired when the strongest complete ordinary stack
matches its checked closure, bad-acceptance rate, hidden-family transfer,
proof-DAG reconstruction, invalidation quality, and lifecycle resource vector;
when any gain disappears under ancestor- and dependency-safe splits; when
counterexamples, abstraction obligations, certificates, or reverse-dependency
events cannot be reconstructed independently; or when omitted formalization,
review, checking, storage, repair, human-hour, or joule costs explain the gain.

Editable lifecycle diagram:
[Versioned proof-discovery lifecycle diagram](../experiments/fixtures/004-versioned-proof-discovery.md#identity-and-acceptance-boundary).
