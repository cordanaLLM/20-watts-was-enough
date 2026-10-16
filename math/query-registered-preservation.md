# Query-registered semantic preservation

This note refines
[Candidate 017](../experiments/candidates/017-contract-preserving-semantic-compaction.md)
with the interpreter, representation-dependency, vocabulary, authenticity, and
access boundaries established by library and archival science. The contract
does not promise to preserve all future meaning. It makes a finite claim that
can fail.

## Preservation package

For version $v$, define

$$
P_v=(B_v,M_v,F_v,S_v,V_v,D_v,A_v,X_v),
$$

where:

- $B_v$ is payload bytes;
- $M_v$ is metadata, evidence, provenance, and fixity records in bytes;
- $F_v$ is format and rendering dependencies;
- $S_v$ is schema and type constraints;
- $V_v$ is vocabulary, authority, identity, and mapping versions;
- $D_v$ is the designated interpreter community and its assumed capabilities;
- $A_v$ is authenticity/custody evidence and authorized access state; and
- $X_v$ is executable dependencies, tests, emulators, or migration tooling.

The tuple is typed. Fixity of $B_v$ does not establish truth, authenticity,
interpretability, or authorized accessibility. Provenance in $M_v$ records
lineage; it does not validate assertions.

## Registered query contract

For query family $q\in\mathcal Q$, declare native output space $\mathcal Y_q$,
distance $d_q$, tolerance $\epsilon_q$, evidence obligations $L_q$, supported
community $D_q$, and decision horizon $T_q$. For source package $P_0$ and a
candidate transformed package $P_v$, require

$$
\Pr_{q\sim\mathcal D_Q}
\left[d_q(q(P_0),q(P_v))>\epsilon_q\right]\le\delta_q,
$$

where $d_q$ and $\epsilon_q$ share the query's native unit and $\delta_q$ is a
dimensionless failure probability. The evaluation distribution
$\mathcal D_Q$ has frozen development, held-out in-family, and adversarial
migration splits.

Evidence reachability is

$$
R_L(P_v)=
\frac{\sum_{q\in\mathcal Q}|L_q\cap\widehat L_q(P_v)|}
{\sum_{q\in\mathcal Q}|L_q|},
$$

where $L_q$ is the registered evidence set and $\widehat L_q(P_v)$ is the set
recoverable with valid lineage from $P_v$. $R_L$ is dimensionless. It does not
score whether the evidence supports a claim; that requires a separate
inference and decision contract.

## Interpreter and dependency validity

Let $c(D,t)$ be a versioned capability vector for the interpreter community at
time $t$: supported languages, schemas, units, software, cryptographic
algorithms, domain conventions, and required practiced procedures. Let
$r(P_v)$ be the corresponding requirements. Interpretability is

$$
I(P_v,D,t)=\mathbf 1[c(D,t)\succeq r(P_v)],
$$

a dimensionless predicate under a declared partial order. “Human readable” or
“standard format” is insufficient unless the supported community and
dependencies are named.

For dependency graph $G_v=(N_v,E_v)$ and root package nodes $R_v$, required
closure is

$$
\operatorname{cl}(R_v)=
\{n\in N_v:\exists r\in R_v\text{ with a required path }r\leadsto n\}.
$$

Missing-dependency rate is

$$
m_v=
\frac{|\{n\in\operatorname{cl}(R_v):n\text{ unavailable or invalid}\}|}
{|\operatorname{cl}(R_v)|},
$$

which is dimensionless. Criticality weights may be reported separately, but a
weighted mean cannot hide the loss of a dependency required by every query.

## Migration and vocabulary drift

For migration $T_v:P_{v-1}\rightarrow P_v$, maintain a manifest containing
source/target versions, transformed and retained fields, known loss,
dependencies, tests, reviewer/authority, and rollback or source-recovery path.
Query regression is

$$
\Delta_q^{(v)}=
d_q(q(P_{v-1}),q(P_v)),
$$

in the native query unit. Vocabulary or authority mappings are separate
versioned relations

$$
R_v\subseteq E_{v-1}\times E_v\times
\{\mathrm{same},\mathrm{broader},\mathrm{narrower},
\mathrm{split},\mathrm{merge},\mathrm{contested}\}.
$$

A merge cannot silently transfer all evidence from both prior entities. Query
tests must include namesakes, renames, splits, merges, multilingual labels,
contested mappings, and temporal concept change.

## Availability decomposition

For query $q$, time $t$, and community $D$, a useful decomposition is

$$
U(q,t,D)=
p_{\mathrm{bits}}p_{\mathrm{render}}p_{\mathrm{semantic}}
p_{\mathrm{authentic}}p_{\mathrm{authorized}}V(q,D)-C(q,t,D).
$$

The five $p$ terms are dimensionless conditional probabilities; $V$ and $C$
share one declared decision unit. The product is a checklist unless dependence
among failures is explicitly modelled. Report each component and joint failure
cases; do not claim independence by notation.

## Registered and unregistered use

The registered contract permits direct success/failure decisions. New
unregistered query $q'$ receives one of three typed outcomes:

1. answer with a proof that its required fields and evidence are covered by an
   existing contract;
2. recover retained source/dependencies and evaluate a new contract; or
3. abstain as unsupported.

Unregistered-query regret over set $\mathcal Q'$ is

$$
R_{\mathrm{new}}=
\frac{1}{|\mathcal Q'|}
\sum_{q'\in\mathcal Q'}
\left[
L(q',P_v)-L(q',P_{\mathrm{full}})
\right],
$$

where $L$ uses the query's declared decision loss. Report results by query
family because averaging can hide systematic loss for a user, language,
period, or evidence class.

## Lifecycle accounting

For policy $\pi$ spanning capture through disposition, keep the native outcome
vector

$$
\mathbf C(\pi)=
(B_{\mathrm{year}},E_{\mathrm{life}},H_{\mathrm{curator}},
T_{\mathrm{query}},T_{\mathrm{recover}},
L_{\mathrm{wrong}},L_{\mathrm{unreadable}},L_{\mathrm{privacy}}),
$$

where byte-years, joules, person-hours, seconds, and task-native loss units are
not added without published conversion weights. Charge payload, metadata,
indexes, replicas, dependencies, emulators, tests, migrations, reviewer work,
restore drills, legal holds, and verified deletion.

Byte reduction is

$$
\rho_B=1-
\frac{|B_v|+|M_v|+|X_v|+|R_v|}
{|B_0|+|M_0|+|X_0|+|R_0|},
$$

where every magnitude is bytes and $\rho_B$ is dimensionless. Backups or
retained raw sources cannot be excluded from the numerator while supplying
recovery.

## Strongest null and rejection

Compare learned compaction with full version history, indexed snapshots plus
suffix log, materialized views, key compaction and tombstones, lossless
compression/deduplication, tiered cold archive, and an OAIS/PREMIS-style package
with versioned schema/vocabulary and query-regression tests.

Reject the refinement when:

1. ordinary packaging plus query regression matches registered-query error,
   evidence reachability, recovery, and lifecycle cost;
2. supported queries or interpreter capabilities are chosen after migration;
3. fixity, provenance, citation, ontology consistency, or findability is
   substituted for correctness;
4. unregistered queries receive invented answers instead of recovery or
   abstention;
5. required deletion, holds, privacy, or authorization are omitted;
6. metadata, dependencies, migration, reviewer work, and cold fallback are not
   charged; or
7. records survive turnover but operators cannot safely interpret or use them.

Editable diagram:
[Query-registered preservation diagram](../concept/07-cross-domain-convergence.md#preserved-bits-are-not-preserved-meaning).
