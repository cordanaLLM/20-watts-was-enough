# Mathematical practice and proof discovery: error-correcting search audit

<!-- markdownlint-disable MD013 -->

- **Audit date:** 2026-08-05
- **Scope:** conjecture formation, analogy and abstraction, counterexample search,
  proof decomposition, lemma libraries, notation and external representation,
  diagrams, invariants and symmetry, local-to-global reasoning, interactive and
  automated theorem proving, proof certificates, SAT/SMT/constraint solving,
  experimental mathematics, repair, collaboration, and expertise
- **Evidence rule:** formal results establish only the named theorem under the
  stated logic; system papers establish behavior for measured implementations
  and corpora; cognitive experiments establish task- and population-scoped
  effects; memoir, interview, and historical reconstruction remain anecdotal
- **Promotion state:** audit-local `MATHP-` claims only; no principle, central
  claim, or experiment candidate is promoted automatically

## Executive finding

Mathematical practice does not expose a hidden source of unconstrained novelty.
It exposes a disciplined separation between **producing a candidate** and
**earning acceptance for it**.

- Conjectures can arise from examples, analogy, abstraction, representation
  changes, symmetry, computation, retrieval, or stochastic search. None of
  those origins makes a conjecture true.
- An analogy transfers selected relations from a learned source structure.
  Controlled experiments show that retrieval and transfer depend strongly on
  cues and prior analogs; analogy is neither literal copying nor evidence of
  correctness ([Gick and Holyoak 1980](https://doi.org/10.1016/0010-0285(80)90013-4);
  [Gick and Holyoak 1983](https://doi.org/10.1016/0010-0285(83)90002-6)).
- Abstraction changes which distinctions and operations are retained. It can
  expose a reusable invariant, but it can also erase a decisive exception.
- Counterexamples do more than reject: when a failed case is localized to a
  definition, lemma, abstraction, or side condition, it supplies information
  for revision. CEGAR is a mature engineered form of this loop
  ([Clarke et al. 2000](https://doi.org/10.1007/10722167_15)).
- Proof decomposition, named lemmas, libraries, notation, and diagrams reduce
  search and checking cost by externalizing structure. Their advantage is
  representation- and task-dependent, not free compression.
- Interactive theorem provers separate untrusted tactic search from a small
  trusted kernel. A checked proof establishes an encoded proposition relative
  to definitions, axioms, elaboration, kernel, and artifact version—not that the
  statement is important, faithful to an informal problem, or useful.
- SAT, SMT, constraint solving, saturation, and learned tactic guidance already
  implement selective search, conflict-directed learning, decomposition, and
  certificate checking. They are mandatory nulls, not metaphors to rediscover.
- Experimental mathematics can cheaply expose patterns and counterexamples.
  Finite computation is a proof only when the theorem reduces to the checked
  finite computation and the reduction, implementation, arithmetic, and
  certificate chain are covered.
- Peer review and collaboration distribute search and criticism but do not
  make errors independent. Formal checking can narrow the judgment surface; it
  does not choose definitions, formalize intent, or decide significance.

Operationally, mathematical proposals transform prior objects, relations,
examples, notations, lemmas, and search procedures. The system question begins
after proposal: provenance remains orthogonal to correctness. A candidate earns
mathematical acceptance through counterexample resistance, derivation,
certificate checking, and social or tool-mediated scrutiny under explicit
assumptions—not through novelty alone.

The conservative system residue is a benchmark fixture: a versioned
**propose–challenge–decompose–prove–check–publish–invalidate** loop whose
libraries and tests are leakage-controlled. Every component has mature
counterparts. This audit promotes nothing.

## Claim classes and acceptance boundary

| Artifact | What acceptance can establish | Required dependencies | What remains outside |
| --- | --- | --- | --- |
| tested conjecture | it survived the recorded finite tests | generator, domain, sample policy, precision, test code, seed | universal truth, importance, novelty |
| counterexample | one admissible instance falsifies the encoded universal statement | domain membership and exact evaluation | best repair, falsity of nearby statements |
| informal proof | qualified readers judge the argument reconstructible under community norms | definitions, conventions, omitted warrants, citations | kernel-level derivability; absence of shared blind spots |
| formal proof term | a checker accepts the term as inhabiting the encoded proposition | logic, axioms, definitions, elaboration, kernel, library versions | faithful formalization, physical truth, value |
| SAT/SMT `sat` model | the returned assignment/model satisfies the encoded constraints if model checking succeeds | parser, logic/theory, semantics, model, checker | adequacy of encoding; claims outside the theory |
| SAT/SMT `unsat` certificate | a checker validates refutation in the certificate calculus | formula identity, certificate format, checker, theory lemmas | correctness of an unsupported `unsat` answer |
| numerical identity candidate | values agree within the recorded range and precision | algorithm, precision, conditioning, input set | exact identity without a proof-producing reduction |
| peer-reviewed theorem | authorized reviewers/editors accepted the manuscript under a process | version, venue process, declarations, correspondence | infallibility; independent replication of every inference |

## Shared state, leakage, and cost contract

### Search and proof state

Represent a proof-discovery episode as

$$
S_t=(G_t,Q_t,L_t,X_t,C_t,D_t),
$$

where $G_t$ is the set of open goals, $Q_t$ the queued candidate operations,
$L_t$ the versioned lemma/definition library, $X_t$ the tested examples and
counterexamples, $C_t$ the accumulated proof or refutation certificate, and
$D_t$ the dependency graph. All six are logical artifacts or counts; none has
a physical unit by itself. An operation $a_t$ transforms state only if its
preconditions hold:

$$
S_{t+1}=T(S_t,a_t),\qquad a_t\in A(S_t).
$$

A proof search succeeds only when every goal is closed and the final artifact
checks against the exact proposition and dependency versions:

$$
\operatorname{Accept}(p,\pi,L,v)=
\operatorname{HashMatch}(p,v)\land
\operatorname{KernelCheck}(\pi:p\mid L_v).
$$

Here $p$ is a proposition, $\pi$ a proof artifact, $L_v$ library version
$v$, and `HashMatch` a dimensionless identity predicate. This is not a claim
that the formal proposition matches an informal intention.

### Leakage register

Every learned or retrieval-guided comparison must publish

$$
\Lambda=(L_{\mathrm{train}},L_{\mathrm{prompt}},L_{\mathrm{retrieval}},
L_{\mathrm{tactic}},L_{\mathrm{eval}},L_{\mathrm{ancestor}}),
$$

where each component names theorem IDs, proof IDs, library commits, generated
variants, source texts, and benchmark ancestors accessible through that
channel. A theorem split is not independent when its proof, a specialization,
an isomorphic restatement, a generated sibling, or a dependency-closing lemma
appears upstream. Report exact duplicate and dependency reachability, symbol-
renamed similarity, source competition/year, and human correction exposure.

### Units and lifecycle cost

For method $m$, report the vector

$$
B_m=(N_{\mathrm{node}},N_{\mathrm{infer}},N_{\mathrm{clause}},
N_{\mathrm{solver}},B_{\mathrm{proof}},t_{\mathrm{check}},t_{\mathrm{wall}},
h_{\mathrm{human}},E_{\mathrm{elec}},M_{\mathrm{peak}}),
$$

with search nodes, inference applications, generated clauses, solver calls,
proof bytes, checker CPU-seconds, wall-seconds, human-hours, joules, and peak
bytes respectively. Add library construction, formalization, failed searches,
counterexample generation, review, repair, and dependency migration. Counts and
physical quantities cannot be collapsed into one scalar without preregistered
exchange weights. Equal-budget comparisons match the relevant vector or report
a Pareto frontier.

### Outcome vector

At minimum report:

- theorem closure rate and exact checked theorem IDs;
- time-to-first checked proof and proof/certificate bytes;
- checker time, peak memory, and electrical energy;
- counterexample discovery rate and smallest counterexample under a declared
  order;
- proof robustness under library/version changes;
- source and ancestor leakage rates;
- human formalization, steering, repair, and review hours;
- novelty relative to an explicit corpus, separately from correctness; and
- transfer to definition shifts, new theories, and hidden proof families.

## Mature null stack

Any transferred mechanism must beat the complete relevant stack, not an
unguided language model or naive depth-first search:

1. versioned theorem libraries with type-directed search, indexes, rewrite
   databases, dependency graphs, and ordinary source control;
2. interactive theorem proving with subgoals, tactics, simplifiers, decision
   procedures, hammers, and a small trusted kernel;
3. saturation-based first-order provers with term ordering, indexing,
   subsumption, rewriting, splitting, and resource schedules;
4. CDCL SAT with watched literals, implication graphs, conflict analysis,
   learned clauses, restarts, preprocessing, and independently checkable
   refutations;
5. DPLL(T) SMT with specialized theory solvers, propagation, conflict lemmas,
   incremental solving, models, and proof production where supported;
6. constraint programming, mixed-integer optimization, model finding,
   symmetry breaking, and portfolio search;
7. premise selection, retrieval, best-first/beam/MCTS search, learned tactic
   policies, and reinforcement learning under dependency-safe splits;
8. exact arithmetic, interval bounds, symbolic algebra, exhaustive finite
   checking, PSLQ, and proof-producing reflection;
9. CEGAR/CEGIS-style counterexample-driven refinement and property-based test
   generation; and
10. ordinary mathematical collaboration: named lemmas, seminars, refereeing,
    replication, issue trackers, formal-library review, and versioned releases.

## Mechanism cards

### MATHP-01 — Conjecture formation from structured examples

**Audit-local claim.** A conjecture generator can compress regularities in a
chosen example set into a candidate predicate or relation. Survival on the
examples establishes only empirical consistency with that sampling process.

**Exact state and operation.** State is a typed example table
$X=\{(x_i,y_i)\}_{i=1}^n$, a hypothesis grammar $H$, and ranked queue $Q$.
The operation enumerates or samples $h\in H$, scores fit/complexity/interest,
and enqueues non-dominated candidates.

**Inputs, training, and leakage.** Record source theorems, known sequences,
generated examples, grammar productions, objective weights, retrieved papers,
and whether the target statement or equivalent appeared in training. Generated
variants sharing a construction belong to one ancestor group.

**Units and costs.** Examples, hypotheses evaluated, AST nodes, evaluator calls,
CPU/GPU seconds, joules, peak bytes, proof bytes after validation, and human-
hours choosing domains and interestingness criteria.

**Evidence boundary.** FunSearch demonstrates evaluator-guided program search
on selected mathematical and algorithmic problems, not a domain-general law of
discovery ([Romera-Paredes et al. 2024](https://doi.org/10.1038/s41586-023-06924-6)).
Finite agreement is not universal validity.

**Possible AI translation.** A typed conjecture queue whose candidates retain
source ancestry, example support, counterexample status, and proof obligations.

**Strongest mature null.** Enumerative/inductive synthesis, genetic programming,
Bayesian optimization, symbolic regression, OEIS-style retrieval, and matched
LLM sampling with the same evaluator and candidate count.

**Exact deduplication.** [P-004 diversity, selection, and protection](../principle-registry.md#p-004--diversity-selection-and-protection)
and [P-003 temporary trace](../principle-registry.md#p-003--temporary-trace-before-commitment).
The closed proposal/evaluation loop is already
[Candidate 004](../../experiments/candidates/004-closed-endogenous-curriculum.md);
ancestry across turnover is
[Candidate 019](../../experiments/candidates/019-audited-cumulative-inheritance.md).
No new conjecture principle.

**Equal-budget falsification.** Match grammar, examples, evaluator calls,
candidate count, wall time, energy, and human steering. Reject the transferred
mechanism if enumerative, evolutionary, Bayesian, or plain sampled search
matches checked discoveries and hidden-family transfer.

**Negative transfer.** Biased examples produce elegant false universals;
interestingness rewards rediscover named results or favor short but sterile
statements; evaluator speed selects what is cheap to score rather than useful.

### MATHP-02 — Analogy and relational transfer

**Audit-local claim.** Analogy can transfer a relational pattern from a learned
source to a target, but retrieval and mapping are cue-dependent and transferred
inferences require independent validation.

**Exact state and operation.** Source graph $G_s$, target graph $G_t$, partial
correspondence $M\subseteq V_s\times V_t$, and candidate inferences $I_M$.
The operation extends $M$ under type and relation constraints, then projects
only mapped relations into $I_M$.

**Inputs, training, and leakage.** Source corpus, semantic embeddings, relation
vocabulary, mapping examples, target statement, hints, and source–target
isomorphism. A supplied near-isomorphic proof is retrieval, not de novo transfer.

**Units and costs.** Retrieved sources, graph nodes/edges, mappings expanded,
candidate inferences, seconds, joules, human hint time, and proof obligations.

**Evidence boundary.** Human experiments found transfer from a distant story
was much more likely with a hint, while comparison of multiple analogs could
support schema induction ([Gick and Holyoak 1980](https://doi.org/10.1016/0010-0285(80)90013-4);
[Gick and Holyoak 1983](https://doi.org/10.1016/0010-0285(83)90002-6)). These
tasks are not evidence for one universal mathematical analogy algorithm.

**Possible AI translation.** Relation-aware retrieval proposes typed mappings,
each with explicit unmapped assumptions and generated proof obligations.

**Strongest mature null.** Nearest-neighbor theorem/proof retrieval, graph
matching, anti-unification, structure mapping, case-based reasoning, and a
retrieval-augmented prover using the same library.

**Exact deduplication.** [P-007 prediction-error allocation](../principle-registry.md#p-007--prediction-error-allocation),
[P-008 compartmentalized interaction](../principle-registry.md#p-008--compartmentalized-interaction),
and [P-013 externalized shared state](../principle-registry.md#p-013--externalized-shared-state).
Proposal testing belongs to [Candidate 004](../../experiments/candidates/004-closed-endogenous-curriculum.md),
dependency-bearing mappings to [Candidate 014](../../experiments/candidates/014-versioned-observation-contract.md),
and retained transferable mappings to [Candidate 019](../../experiments/candidates/019-audited-cumulative-inheritance.md).

**Equal-budget falsification.** Use unseen relation-preserving targets and
surface-matched distractors; match retrieval calls, source tokens, mappings,
checker calls, and compute. Reject if ordinary semantic/graph retrieval matches
valid transfer or if gains vanish after isomorphic ancestors are grouped.

**Negative transfer.** Surface similarity imports false assumptions; structural
mapping preserves the wrong relation; source prestige suppresses a simpler
target-native proof.

### MATHP-03 — Abstraction and representation change

**Audit-local claim.** Abstraction can factor examples through a smaller state
or shared relation, changing the search space. It earns transfer only when the
quotient preserves the properties required by the target.

**Exact state and operation.** A concrete domain $X$, abstract domain $A$,
map $\alpha:X\to A$, optional concretization $\gamma:A\to2^X$, and property
$P$. The operation rewrites a goal over $X$ into one over $A$, with explicit
soundness or adequacy obligations.

**Inputs, training, and leakage.** Definitions, chosen equivalence relation,
feature grammar, examples, prior abstractions, and theorem library. If the
target invariant defines $\alpha$, evaluation is circular.

**Units and costs.** Concrete/abstract states, equivalence classes, eliminated
dimensions, obligations, nodes expanded, checker seconds, proof bytes,
formalizer-hours, and joules.

**Evidence boundary.** Gentner's structure-mapping framework distinguishes
relations from object attributes, but it is a theory of analogy rather than a
proof that a proposed abstraction preserves a theorem
([Gentner 1983](https://doi.org/10.1207/s15516709cog0702_3)). Formal abstraction
claims require their own preservation theorem or counterexample search.

**Possible AI translation.** Learn or synthesize quotient maps while generating
proof obligations for preserved operations, excluded cases, and reconstruction.

**Strongest mature null.** Hand-designed representations, abstract
interpretation, sufficient statistics, canonical forms, compiler IRs,
anti-unification, and feature learning with the same information budget.

**Exact deduplication.** [P-008 compartmentalization](../principle-registry.md#p-008--compartmentalized-interaction),
[P-010 structural offloading](../principle-registry.md#p-010--structural-offloading-and-co-design),
and [P-012 lifetime-matched memory](../principle-registry.md#p-012--memory-matched-to-information-lifetime).
Loss accounting is exactly [Candidate 017](../../experiments/candidates/017-contract-preserving-semantic-compaction.md);
versioned assumptions are [Candidate 014](../../experiments/candidates/014-versioned-observation-contract.md).

**Equal-budget falsification.** Match retained bits, solver calls, abstraction-
construction cost, proof budget, and human design time. Reject if canonical
forms or hand abstractions match transfer, or if hidden excluded cases erase
the gain.

**Negative transfer.** Quotienting removes the only counterexample; a notation-
specific regularity is mistaken for structure; reconstruction costs exceed the
saved search.

### MATHP-04 — Counterexample-directed revision

**Audit-local claim.** A valid counterexample rejects a universal candidate;
when localized against an abstraction or candidate program, it can direct a
specific refinement. It does not identify a unique repair.

**Exact state and operation.** Candidate $h_t$, specification $\varphi$,
tested set $X_t$, and counterexample $x_t\models\neg\varphi(h_t)$. The
operation adds a constraint excluding the failed behavior and produces
$h_{t+1}$, while preserving prior accepted cases where required.

**Inputs, training, and leakage.** Model finder/test generator, domain bound,
solver theory, candidate grammar, seeds, previous failures, and oracle. Hidden
tests must not enter generation through error messages or repeated leaderboard
queries.

**Units and costs.** Solver calls, models examined, smallest-example rank,
constraints/clauses added, iterations, seconds, joules, proof bytes, and human
repair hours.

**Evidence boundary.** CEGAR refines abstractions from spurious counterexamples
under a model-checking setup ([Clarke et al. 2000](https://doi.org/10.1007/10722167_15));
combinatorial sketching searches finite program spaces against specifications
([Solar-Lezama et al. 2006](https://doi.org/10.1145/1168919.1168907)). Neither
establishes complete discovery for arbitrary mathematics.

**Possible AI translation.** Route kernel, model-finder, unit-test, and reviewer
failures into typed repair constraints rather than natural-language retry only.

**Strongest mature null.** CEGAR, CEGIS, property-based testing, delta
debugging, model finding, SAT/SMT countermodels, and ordinary test-driven repair.

**Exact deduplication.** [P-003 temporary trace](../principle-registry.md#p-003--temporary-trace-before-commitment),
[P-006 negative feedback](../principle-registry.md#p-006--homeostatic-negative-feedback),
and [P-007 residual allocation](../principle-registry.md#p-007--prediction-error-allocation).
Conditional checking is [Candidate 010](../../experiments/candidates/010-reset-coupled-staged-verification.md);
the failure-to-revision lifecycle is [Candidate 011](../../experiments/candidates/011-dual-loop-operational-assurance.md).

**Equal-budget falsification.** Match oracle calls, generated tests, candidates,
wall time, and energy against CEGIS/CEGAR and random/adversarial testing. Reject
if typed failure memory does not improve hidden-case validity or repair speed.

**Negative transfer.** Overfitting accumulates exception patches; spurious
counterexamples refine the wrong abstraction; one adversarial family monopolizes
search; a repair silently weakens the theorem.

### MATHP-05 — Goal decomposition and subgoal scheduling

**Audit-local claim.** Decomposing a theorem into subgoals can expose reusable
structure and local checks, but the interface lemmas and dependency order decide
whether total search shrinks or explodes.

**Exact state and operation.** Goal DAG $D=(V,E)$, open frontier $F\subseteq V$,
local contexts $\Gamma_v$, and tactic $a$. Applying $a$ replaces one goal
$g$ with subgoals $g_1,\ldots,g_k$ plus a reconstruction function that builds
a proof of $g$ from proofs of the children.

**Inputs, training, and leakage.** Tactic library, lemma names, prior proof
traces, goal features, target proof, human sketches, and curriculum. Training on
the same theorem's proof DAG leaks decomposition directly.

**Units and costs.** Open/closed goals, branching factor, DAG nodes/edges,
tactic calls, backtracks, proof-term bytes, checker seconds, human-hours, and
joules.

**Evidence boundary.** LCF introduced tactics that construct theorems through a
trusted abstract type and validation functions
([Gordon, Milner, and Wadsworth 1979](https://doi.org/10.1007/3-540-09724-4)).
This establishes an assurance architecture, not an optimal decomposition policy.

**Possible AI translation.** Learned decomposition may propose lemmas, but each
edge must carry a reconstructible proof obligation and versioned dependencies.

**Strongest mature null.** Human tactic scripts, backward chaining, AND/OR
search, best-first and Monte Carlo tree search, proof planning, hammers, and
domain-specific decomposition.

**Exact deduplication.** [P-001 selective activation](../principle-registry.md#p-001--selective-allocation),
[P-002 local autonomy and escalation](../principle-registry.md#p-002--local-autonomy-with-exception-escalation),
and [P-008 compartmentalization](../principle-registry.md#p-008--compartmentalized-interaction).
Assurance fields belong to [Candidate 009](../../experiments/candidates/009-graded-assurance-envelopes.md),
not a new hierarchy principle.

**Equal-budget falsification.** Match tactics, premises, nodes, wall time,
checker calls, proof-length ceiling, and human hints. Reject if ordinary
best-first/AND-OR search matches closure or learned decomposition creates more
unsolved obligations and larger proofs.

**Negative transfer.** Attractive but useless lemmas consume the budget;
interfaces hide needed global invariants; circular subgoals pass an incomplete
dependency check.

### MATHP-06 — Lemma libraries and premise retrieval

**Audit-local claim.** A versioned lemma library amortizes past proof work and
supports composition; large libraries also create retrieval, naming,
maintenance, and leakage costs.

**Exact state and operation.** Library $L_v=(T_v,D_v,I_v)$ contains typed
theorems $T_v$, dependency DAG $D_v$, and indexes $I_v$. Retrieval maps a
goal and context to a ranked premise subset $R_k\subset T_v$; checking records
the exact transitive dependency closure.

**Inputs, training, and leakage.** Library commit, namespaces, imports,
documentation, proof bodies, theorem statements, embeddings, user queries, and
training proofs. Chronological splits still leak when later statements are
formalized from earlier informal target solutions or generated siblings.

**Units and costs.** Theorems, definitions, dependency edges, index bytes,
retrieval latency, premises selected, prover nodes, proof bytes, rebuild/check
seconds, contributor/reviewer-hours, and joules.

**Evidence boundary.** mathlib documents a community-built, unified formal
library and its organizational choices
([mathlib Community 2020](https://doi.org/10.1145/3372885.3373824)); Mizar
documents decades of checked-library use
([Bancerek et al. 2018](https://doi.org/10.1007/s10817-017-9440-6)). These are
successful infrastructures, not evidence that more lemmas monotonically help.

**Possible AI translation.** Retrieve minimal premise slices with dependency,
license, origin, theorem-version, and invalidation metadata; preserve proof
certificates separately from retrieval scores.

**Strongest mature null.** Symbol/type indexes, BM25/dense retrieval,
discrimination trees, hammers, graph reachability, build systems, and existing
formal libraries. Learned premise selection such as DeepMath is already an AI
null ([Alemi et al. 2016](https://arxiv.org/abs/1606.04442)).

**Exact deduplication.** [P-001 selective routing](../principle-registry.md#p-001--selective-allocation),
[P-012 lifetime-matched memory](../principle-registry.md#p-012--memory-matched-to-information-lifetime),
and [P-013 externalized state](../principle-registry.md#p-013--externalized-shared-state).
Library inheritance is [Candidate 019](../../experiments/candidates/019-audited-cumulative-inheritance.md),
semantic preservation [Candidate 017](../../experiments/candidates/017-contract-preserving-semantic-compaction.md),
and tiering [Candidate 018](../../experiments/candidates/018-value-reconstructability-aware-tiering.md).

**Equal-budget falsification.** Match library bytes, accessible theorem IDs,
retrieval latency, prover nodes, indexing/build energy, and maintenance labor.
Reject if a conventional index/hammer matches closure or learned gains disappear
under ancestor-disjoint splits.

**Negative transfer.** Premise overload expands search; obsolete definitions
poison proofs; popularity reinforces one formalization; dependency leakage makes
memorization look like reasoning.

### MATHP-07 — Notation, diagrams, and external representations

**Audit-local claim.** An external representation can make relevant relations
locally visible or cheap to traverse, but an informationally equivalent
notation can have different search cost and different failure modes.

**Exact state and operation.** Semantic object $z$, representation map
$\rho:z\mapsto r$, available perceptual/symbolic operators $O_r$, and query
$q$. An operation reads or transforms $r$, then must map the result back to a
semantic claim with explicit invariance conditions.

**Inputs, training, and leakage.** Notation system, diagrams, labels, layout,
rendering conventions, learned symbol fluency, accessibility transforms, and
source examples. Familiarity and training time are part of the input budget.

**Units and costs.** Symbols, marks, graph elements, crossings, visual search
time, errors, transformations, representation bytes, training hours,
accessibility labor, and joules.

**Evidence boundary.** Larkin and Simon showed by information-processing
analysis and tasks that diagrams can group information and support perceptual
inferences, but explicitly qualified the advantage as representation- and
task-dependent ([Larkin and Simon 1987](https://doi.org/10.1111/j.1551-6708.1987.tb00863.x)).

**Possible AI translation.** Choose among algebraic, graph, geometric, table,
and executable views based on measured operator cost while retaining a common
semantic identity and round-trip tests.

**Strongest mature null.** Pretty-printers, proof states, term graphs,
commutative diagrams, algebra systems, visualization, graph neural encodings,
and multiple synchronized editor views.

**Exact deduplication.** [P-010 structural offloading](../principle-registry.md#p-010--structural-offloading-and-co-design)
and [P-013 externalized state](../principle-registry.md#p-013--externalized-shared-state).
Round-trip loss is [Candidate 017](../../experiments/candidates/017-contract-preserving-semantic-compaction.md),
and representation dependencies are [Candidate 014](../../experiments/candidates/014-versioned-observation-contract.md).

**Equal-budget falsification.** Compare informationally matched representations
after equalized training and operation access. Match bytes, interaction time,
model capacity, and energy; reject if the best conventional term graph or
symbolic view matches proof speed and error.

**Negative transfer.** A persuasive diagram hides degeneracy; overloaded
notation unifies distinct objects; layout artifacts become spurious features;
visual encodings exclude users or do not round-trip.

### MATHP-08 — Invariant discovery and symmetry reduction

**Audit-local claim.** An invariant restricts reachable states; a verified
symmetry action partitions equivalent cases. Either can reduce search only when
its preservation and orbit assumptions hold.

**Exact state and operation.** State space $X$, transition relation $R$,
candidate invariant $I:X\to\{0,1\}$, and group action $G\curvearrowright X$.
The operation proves $I(x_0)$ and
$I(x)\land R(x,x')\Rightarrow I(x')$, or chooses one representative per
verified orbit while preserving satisfiability/provability.

**Inputs, training, and leakage.** Transition/axiom definition, candidate
grammar, generators of $G$, canonicalizer, examples, known invariants, and
target proof. A target-derived invariant or canonical representative leaks the
solution structure.

**Units and costs.** States/orbits, group generators, clauses/predicates added,
proof obligations, nodes pruned, canonicalization seconds, proof bytes, human-
hours, and joules.

**Evidence boundary.** Symmetry-breaking predicates can remove symmetric search
in combinatorial problems, but incomplete breaking leaves duplicates and
encoding overhead may dominate ([Crawford et al. 1996](https://kr.org/proceedings/KR-1996-proceedings-scanned.pdf#page=160)).
No result says every useful mathematical representation has cheap detectable
symmetry.

**Possible AI translation.** Propose invariants and equivariances, then require
separate preservation/orbit certificates before using them to prune search.

**Strongest mature null.** Abstract interpretation, inductive invariant
synthesis, canonical labeling, symmetry-breaking predicates, equivariant
models, quotient types, and domain-specific conservation laws.

**Exact deduplication.** [P-001 selective activation](../principle-registry.md#p-001--selective-allocation),
[P-004 diversity/selection](../principle-registry.md#p-004--diversity-selection-and-protection),
and [P-010 structural offloading](../principle-registry.md#p-010--structural-offloading-and-co-design).
Invariant admission evidence belongs to [Candidate 009](../../experiments/candidates/009-graded-assurance-envelopes.md);
no new symmetry principle.

**Equal-budget falsification.** Match encoding size, preprocessing, proof
obligations, solver wall time, energy, and human design time against mature
invariant/symmetry tools. Reject if total solved instances or proof cost does
not improve after certificate overhead.

**Negative transfer.** False invariants delete real solutions; approximate
symmetries merge distinct cases; canonicalization costs more than duplicate
search; symmetry breaking creates pathological heuristics.

### MATHP-09 — Local-to-global and compositional proof

**Audit-local claim.** Local results imply a global result only through a named
composition theorem and compatibility conditions. “Local-to-global” is a family
of schemas, not one transferable algorithm.

**Exact state and operation.** Cover or decomposition
$X=\bigcup_i U_i$, local objects/proofs $p_i$, overlap maps
$r_{ij}$, compatibility predicates $K_{ij}$, and composition theorem
$C$. The operation checks every required local result and overlap condition,
then applies $C$ to construct the global proof.

**Inputs, training, and leakage.** Chosen cover, boundary conditions, interface
definitions, local libraries, gluing theorem, dependency versions, and omitted
overlaps. A decomposition copied from the target proof is privileged guidance.

**Units and costs.** Components, overlap edges, local obligations, interface
bytes, parallel CPU-seconds, communication bytes, checker time, proof bytes,
human coordination hours, and joules.

**Evidence boundary.** Large formalizations demonstrate that decomposition can
coordinate many checked components: Flyspeck combined HOL Light and Isabelle
artifacts for the Kepler conjecture
([Hales et al. 2017](https://doi.org/10.1017/fmp.2017.1)). One project does not
show that arbitrary theorem dependencies are locally separable or cheap.

**Possible AI translation.** Generate module boundaries with explicit overlap
and gluing obligations; parallelize only conditionally independent subgraphs.

**Strongest mature null.** Modular proof engineering, theorem-library imports,
separation logic, divide-and-conquer, distributed build systems, map-reduce
search, and human lemma allocation.

**Exact deduplication.** [P-002 local autonomy/escalation](../principle-registry.md#p-002--local-autonomy-with-exception-escalation),
[P-008 compartmentalization](../principle-registry.md#p-008--compartmentalized-interaction),
and [P-011 transient coalitions](../principle-registry.md#p-011--transient-communication-coalitions).
Cross-module evidence belongs to [Candidate 009](../../experiments/candidates/009-graded-assurance-envelopes.md),
and authority to [Candidate 012](../../experiments/candidates/012-latency-qualified-authority.md)
only when components can act, not for pure proof composition.

**Equal-budget falsification.** Match total nodes, proof bytes, CPU/joules,
communication, and human-hours against monolithic and ordinary modular proof.
Reject if interface/gluing overhead dominates or errors remain globally coupled.

**Negative transfer.** Missing overlaps create false global conclusions;
duplicated local work exceeds savings; incompatible definitions pass through
name-only interfaces; parallel agents share one hidden failure source.

### MATHP-10 — Interactive theorem proving and the trusted kernel

**Audit-local claim.** An interactive prover can allow rich, untrusted search
while restricting theorem construction to a small kernel. Kernel acceptance is
a scoped derivability claim, not semantic omniscience.

**Exact state and operation.** Context $\Gamma$, goal $g$, tactic program,
elaborated term $\pi$, kernel $K$, and environment $L_v$. The tactic may
fail or propose arbitrary syntax; only $K(\Gamma\vdash\pi:g,L_v)=\mathrm{accept}$
closes the goal.

**Inputs, training, and leakage.** Axioms, definitions, imported theorems,
elaboration rules, tactics, automation, source code, proof terms, and user
commands. Training/test theorem ancestry and imported target lemmas must be
grouped.

**Units and costs.** Interactive commands, tactic calls, elaboration/kernel
seconds, proof bytes, environment bytes, rebuild time, failed attempts,
formalizer-hours, peak memory, and joules.

**Evidence boundary.** LCF established a protected theorem type and tactic
architecture ([Gordon, Milner, and Wadsworth 1979](https://doi.org/10.1007/3-540-09724-4));
Lean uses a small kernel based on dependent type theory
([de Moura et al. 2015](https://doi.org/10.1007/978-3-319-21401-6_26)).
The trusted base still includes parser/elaboration correspondence, axioms,
kernel implementation, hardware, and artifact identity as applicable.

**Possible AI translation.** Let models suggest statements, tactics, and terms,
but grant acceptance only to independently reconstructed kernel-checked
artifacts whose dependencies are frozen.

**Strongest mature null.** Lean, Coq, Isabelle, HOL, Mizar, Metamath, tactic
scripts, simplifiers, hammers, and IDE feedback. This mechanism already exists.

**Exact deduplication.** [P-002 local resolution/escalation](../principle-registry.md#p-002--local-autonomy-with-exception-escalation),
[P-008 compartmentalization](../principle-registry.md#p-008--compartmentalized-interaction),
and [P-009 maintenance plane](../principle-registry.md#p-009--maintenance-plane).
The exact assurance destination is [Candidate 009](../../experiments/candidates/009-graded-assurance-envelopes.md).

**Equal-budget falsification.** There is no novelty test against a naive null:
the mature proof assistant is the baseline. Any added learned controller must
match accessible lemmas, kernel, theorem set, formalization labor, nodes, and
energy, and improve checked closure or total lifecycle cost.

**Negative transfer.** Formalization proves the wrong statement; hidden axioms
weaken the result; automation produces opaque brittle terms; kernel trust is
overstated as real-world truth.

### MATHP-11 — Proof certificates and independent checking

**Audit-local claim.** A producer can perform expensive untrusted search and
send a certificate to a smaller checker. The certificate is useful only if it
identifies the input and its calculus is sound for the claimed result.

**Exact state and operation.** Instance hash $H(F)$, claimed verdict $v$,
certificate $c$, checker $K_c$, and format/version $f$. Acceptance requires
$K_c(H(F),v,c,f)=\mathrm{accept}$; unsupported solver exit codes are not proof.

**Inputs, training, and leakage.** Exact formula/proposition, preprocessing
trace, proof format, checker source/binary, axioms, external theory lemmas, and
solver version. Preprocessing that is not reconstructed enlarges the trusted
base.

**Units and costs.** Certificate bytes, generation seconds, checking seconds,
peak bytes, I/O bytes, checker code/TCB size, human audit hours, and joules.

**Evidence boundary.** Proof-carrying code separated producer proof construction
from consumer validation under a declared safety policy
([Necula 1997](https://doi.org/10.1145/263699.263712)); DRAT-trim demonstrated
checking for expressive clausal proofs
([Wetzler, Heule, and Hunt 2014](https://doi.org/10.1007/978-3-319-09284-3_31)).
Certificate checking shifts and narrows trust; it does not erase it.

**Possible AI translation.** Require proof, countermodel, replay trace, or
bounded-check certificate for high-impact mathematical outputs; separate
generator and checker identities and budgets.

**Strongest mature null.** LCF kernels, proof terms, LF, DRAT/LRAT, proof-
producing SMT, proof-carrying code, reproducible builds, and independent replay.

**Exact deduplication.** [P-003 temporary trace](../principle-registry.md#p-003--temporary-trace-before-commitment),
[P-009 maintenance](../principle-registry.md#p-009--maintenance-plane), and
[P-013 externalized state](../principle-registry.md#p-013--externalized-shared-state).
Admission is [Candidate 009](../../experiments/candidates/009-graded-assurance-envelopes.md),
staging [Candidate 010](../../experiments/candidates/010-reset-coupled-staged-verification.md).

**Equal-budget falsification.** Match solver time plus certificate generation,
checker time, storage/I/O, energy, and engineer-hours against independent rerun
and existing certificate formats. Reject a new envelope if it catches no extra
wrong answers or costs more than the mature checker at equal coverage.

**Negative transfer.** Giant certificates exhaust storage or checking time;
checker and producer share a bug; input hashes omit preprocessing; “verified”
is reported without the exact proposition and assumptions.

### MATHP-12 — Saturation-based automated theorem proving

**Audit-local claim.** Resolution/superposition provers can be refutationally
complete under a calculus and fair search, while practical success depends on
aggressive heuristic control of a potentially explosive clause set.

**Exact state and operation.** Active clauses $A$, passive clauses $P$, term
index $I$, ordering $\succ$, and derivation DAG $D$. A given-clause step
selects $c\in P$, generates sound inferences with $A$, simplifies and
subsumes, and stops on the empty clause or resource limit.

**Inputs, training, and leakage.** Clausified problem, axioms/premises,
preprocessing, term ordering, selection function, strategy schedule, learned
guidance, and proof corpus. Benchmark variants and premise leakage require
ancestor grouping.

**Units and costs.** Generated/retained/deleted clauses, term-index bytes,
inferences, processed clauses per second, wall/CPU seconds, proof bytes, peak
memory, and joules.

**Evidence boundary.** Robinson established the resolution principle and a
completeness result for first-order logic, while also identifying search
efficiency as separate ([Robinson 1965](https://doi.org/10.1145/321250.321253)).
Vampire documents a mature first-order prover implementation
([Kovács and Voronkov 2013](https://doi.org/10.1007/978-3-642-39799-8_1)).
Completeness under unbounded fair search is not a runtime guarantee.

**Possible AI translation.** Use learned scores only to schedule a sound
calculus; retain a proof DAG that an independent checker can replay.

**Strongest mature null.** Vampire, E, SPASS-like saturation, portfolios,
hand/auto-tuned schedules, and TPTP/CASC evaluation.

**Exact deduplication.** [P-001 selective activation](../principle-registry.md#p-001--selective-allocation),
[P-004 selection](../principle-registry.md#p-004--diversity-selection-and-protection),
and [P-006 anti-saturation feedback](../principle-registry.md#p-006--homeostatic-negative-feedback).
No candidate gains distinct support; [Candidate 004](../../experiments/candidates/004-closed-endogenous-curriculum.md)
must beat this ordinary search null where applicable.

**Equal-budget falsification.** Use versioned TPTP-style problems; match premise
sets, cores, CPU/joules, memory, and proof checking. Reject learned scheduling
if a tuned portfolio matches solved instances or gains disappear on new
theories and symbol-renamed ancestors.

**Negative transfer.** Guidance starves necessary clauses and loses practical
completeness; generated clauses overwhelm memory; benchmark tuning replaces
generalization; proof extraction is disabled for speed.

### MATHP-13 — Learned tactic and premise search

**Audit-local claim.** Learned policies can prioritize tactics, premises, or
subgoals from prior proof corpora. A checker supplies exact local feedback, but
success can be dominated by library memorization and split leakage.

**Exact state and operation.** Proof state $s_t=(\Gamma_t,G_t)$, legal actions
$A(s_t)$, policy $\pi_\theta(a\mid s_t)$, value $V_\theta(s_t)$, search tree,
and kernel. Search expands ranked actions; only checked successors enter the
tree.

**Inputs, training, and leakage.** Proof traces, theorem statements, library
commits, tactic vocabulary, generated variants, informal solutions, reward,
search traces, and human corrections. Dependency, restatement, and synthetic-
sibling leakage must be reported.

**Units and costs.** Training tokens/examples, parameters, accelerator-hours,
training/inference joules, search nodes, tactic and kernel calls, wall time,
proof bytes, and human formalization/steering hours.

**Evidence boundary.** HOList provided a higher-order benchmark and learned
prover environment ([Bansal et al. 2019](https://arxiv.org/abs/1904.03241));
AlphaProof combined formal checking and reinforcement learning at Olympiad
level ([Hubert et al. 2025](https://doi.org/10.1038/s41586-025-09833-y)). Results
are tied to formalized problem distributions, curricula, libraries, and large
training/search budgets.

**Possible AI translation.** A proposer ranks proof actions while dependency-
safe evaluation, calibrated abstention, and a separate kernel define acceptance.

**Strongest mature null.** Hand-engineered tactics, hammers, best-first/beam/
MCTS search, k-nearest premise selection, saturation portfolios, and matched
language-model sampling without reinforcement learning.

**Exact deduplication.** [P-001 selective routing](../principle-registry.md#p-001--selective-allocation),
[P-004 variation/selection](../principle-registry.md#p-004--diversity-selection-and-protection),
[P-007 residual allocation](../principle-registry.md#p-007--prediction-error-allocation),
and [P-012 retained proof skill](../principle-registry.md#p-012--memory-matched-to-information-lifetime).
It is a direct mature null for [Candidate 004](../../experiments/candidates/004-closed-endogenous-curriculum.md),
not support for another candidate.

**Equal-budget falsification.** Freeze theorem/library ancestry before training;
match training energy, inference nodes, checker calls, wall time, and human
formalization. Reject if kNN/hammers/tuned search match closure or if performance
collapses on ancestor-disjoint and definition-shifted tests.

**Negative transfer.** Reward favors short familiar proofs; theorem-name and
library-order artifacts leak answers; policies cannot recover after definition
change; formalizer labor is hidden from the budget.

### MATHP-14 — CDCL SAT and conflict-directed learning

**Audit-local claim.** CDCL converts a conflicting partial assignment into a
learned clause that excludes a class of repeated conflicts, with restarts and
heuristics controlling exploration. The guarantee is about the encoded Boolean
formula.

**Exact state and operation.** CNF $F$, partial assignment trail $M$, decision
levels, implication graph $G_M$, learned-clause database $L$, and heuristic
state $H$. Conflict analysis derives clause $c$, backjumps, adds $c$, and
eventually returns a model or refutation under the solver's calculus.

**Inputs, training, and leakage.** CNF encoder, preprocessing, branching/restart
policy, random seed, learned clauses, incremental assumptions, benchmark family,
and proof logging. Shared generators across train/test are leakage.

**Units and costs.** Variables, original/learned clauses, literals, decisions,
propagations, conflicts, restarts, proof bytes, solver/checker seconds, peak
bytes, and joules.

**Evidence boundary.** Modern CDCL is formalized as an extension of DPLL with
backjumping and clause learning; its soundness/completeness boundaries can be
stated in an abstract transition system
([Nieuwenhuis, Oliveras, and Tinelli 2006](https://doi.org/10.1145/1217856.1217859)).
Performance is instance- and encoding-dependent.

**Possible AI translation.** Store compact, scope-qualified constraints learned
from failed candidate combinations, with expiry/deletion and replayable
derivation rather than unstructured “lessons.”

**Strongest mature null.** Production CDCL, clause deletion/restarts,
preprocessors, portfolio SAT, incremental assumptions, MaxSAT, and DRAT/LRAT
checking.

**Exact deduplication.** [P-003 temporary trace](../principle-registry.md#p-003--temporary-trace-before-commitment),
[P-006 anti-saturation feedback](../principle-registry.md#p-006--homeostatic-negative-feedback),
[P-007 conflict allocation](../principle-registry.md#p-007--prediction-error-allocation),
and [P-012 lifetime-matched learned clauses](../principle-registry.md#p-012--memory-matched-to-information-lifetime).
Failure retention refines [Candidate 011](../../experiments/candidates/011-dual-loop-operational-assurance.md)
only as a mature null.

**Equal-budget falsification.** Translate an AI conflict-memory proposal to
matched Boolean and non-Boolean tasks; equalize conflicts, retained bytes,
wall time, energy, and checking. Reject if CDCL or ordinary nogood learning
matches revisitation reduction and solution rate.

**Negative transfer.** Learned constraints are scoped too broadly; clause
databases consume memory; encoding destroys domain structure; restarts erase
useful local progress or preserve harmful global bias.

### MATHP-15 — SMT and theory combination

**Audit-local claim.** SMT combines Boolean search with decision procedures for
declared background theories. Modularity comes from a precise interface; it
does not make unsupported or undecidable theory combinations complete.

**Exact state and operation.** Boolean abstraction $F_B$, assignment trail
$M$, theory solvers $T_i$, shared equalities/lemmas $E$, and proof/model
state. DPLL(T) proposes a Boolean assignment; theory solvers propagate or return
conflicts that become clauses.

**Inputs, training, and leakage.** SMT-LIB logic, theory declarations, solver
options, preprocessing, incremental assertions, quantifier triggers, external
lemmas, seed, and model/proof format. Using a stronger hidden logic changes the
task.

**Units and costs.** Boolean/theory atoms, conflicts, theory propagations,
lemmas, solver calls, proof/model bytes, CPU/wall seconds, peak bytes, and
joules.

**Evidence boundary.** DPLL(T) has a mature abstract account and measured
implementations ([Nieuwenhuis, Oliveras, and Tinelli 2006](https://doi.org/10.1145/1217856.1217859));
SMT-LIB standardizes logics and interfaces
([Barrett, Stump, and Tinelli 2010](https://smt-lib.org/papers/smt-lib-reference-v2.0-r10.12.21.pdf)).
An SMT answer is limited to its declared logic, semantics, and certificate or
model support.

**Possible AI translation.** Route subclaims to specialized symbolic modules
through a typed theory interface; convert conflicts into checkable interface
lemmas and expose unknown/timeout distinctly from false.

**Strongest mature null.** cvc5/Z3-style SMT, Nelson–Oppen and DPLL(T),
quantifier instantiation, bit-vector and arithmetic solvers, proof-producing
SMT, and solver portfolios.

**Exact deduplication.** [P-002 local resolution/escalation](../principle-registry.md#p-002--local-autonomy-with-exception-escalation),
[P-008 compartmentalization](../principle-registry.md#p-008--compartmentalized-interaction),
and [P-011 transient coalitions](../principle-registry.md#p-011--transient-communication-coalitions).
Interface assurance belongs to [Candidate 009](../../experiments/candidates/009-graded-assurance-envelopes.md);
authority is irrelevant unless solvers can act.

**Equal-budget falsification.** Match theory support, preprocessing, solver
calls, time, memory, energy, and certificate checking. Reject a learned modular
router if a tuned SMT portfolio solves the same instances or if it mistakes
`unknown` for a theorem.

**Negative transfer.** Incomplete theory handling yields false confidence;
interface lemmas omit side conditions; floating-point and real arithmetic are
silently conflated; quantifier heuristics diverge.

### MATHP-16 — Constraint solving and model finding

**Audit-local claim.** Constraint propagation removes locally impossible values,
branching explores remaining choices, and a concrete model can falsify a
universal conjecture. Failure to find a model within a bound is not a proof of
unsatisfiability beyond that bound.

**Exact state and operation.** Variables $V$, domains $D_v$, constraints
$C$, propagator queue $Q$, partial assignment $M$, and nogoods $N$. Each
propagator narrows domains soundly; search branches until a model, refutation
certificate, or resource limit.

**Inputs, training, and leakage.** Model/constraint language, finite bounds,
symmetry breaking, objective, branching heuristic, propagators, seed, and known
solutions. Bounds chosen after seeing the target counterexample leak difficulty.

**Units and costs.** Variables, domain values, constraints, propagations,
backtracks, nogoods, model/certificate bytes, seconds, memory, human modeling
hours, and joules.

**Evidence boundary.** The guarantee comes from the constraint language and
solver, not a generic analogy to “reasoning.” SAT/SMT transition systems already
cover many instances; MiniZinc supplies a mature solver-independent constraint
modeling layer ([Nethercote et al. 2007](https://doi.org/10.1007/978-3-540-74970-7_38)).

**Possible AI translation.** Compile candidate assumptions into a versioned
constraint model, search for smallest countermodels first, and retain concrete
models as challenge artifacts.

**Strongest mature null.** CP-SAT, MiniZinc portfolios, SAT/SMT, integer
programming, Alloy/model finders, answer-set programming, and exhaustive search.

**Exact deduplication.** [P-001 selective routing](../principle-registry.md#p-001--selective-allocation),
[P-003 failed-assignment trace](../principle-registry.md#p-003--temporary-trace-before-commitment),
and [P-007 residual search](../principle-registry.md#p-007--prediction-error-allocation).
Countermodel support metadata belongs to [Candidate 014](../../experiments/candidates/014-versioned-observation-contract.md),
not a new candidate.

**Equal-budget falsification.** Match model language, bounds, propagation,
backtracks, wall time, memory, energy, and human encoding time. Reject if a
standard solver finds equal/smaller countermodels or if the proposed system
cannot certify absence within the same finite region.

**Negative transfer.** The encoding excludes valid cases; finite bounds become
an implicit universal claim; learned branching overfits generator order;
constraint propagation is treated as causal explanation.

### MATHP-17 — Experimental mathematics and exactification

**Audit-local claim.** High-precision computation, enumeration, and symbolic
experimentation can propose identities and expose patterns; exactification
requires a proof or a checked finite reduction whose numerical error is bounded.

**Exact state and operation.** Program $P$, input/sample set $X$, precision
$p$ bits, result table $Y$, candidate relation $r$, error bounds
$\epsilon$, and certificate/proof obligation $c$. The operation computes,
fits or detects $r$, then attempts symbolic or certified validation.

**Inputs, training, and leakage.** Algorithms, constants database, sequence
library, precision schedule, random seeds, symbolic grammar, known identities,
hardware arithmetic, and target sources. Searching a database containing the
identity is retrieval.

**Units and costs.** Samples, precision bits, operations, relation coefficient
norm, residual, interval width, CPU/GPU seconds, memory, proof bytes, human-
hours, and joules.

**Evidence boundary.** PSLQ finds candidate integer relations and supplies
bounds within its formal setting
([Ferguson, Bailey, and Arno 1999](https://doi.org/10.1090/S0025-5718-99-00995-3)).
Flyspeck shows that extensive computation can be incorporated into a formal
proof chain ([Hales et al. 2017](https://doi.org/10.1017/fmp.2017.1)). A tiny
floating residual alone is not a theorem.

**Possible AI translation.** Couple numerical pattern search to interval/exact
arithmetic, adversarial inputs, symbolic derivation, and a certificate boundary;
label candidates separately from theorems.

**Strongest mature null.** Computer algebra, OEIS/database lookup, PSLQ, exact
arithmetic, interval arithmetic, exhaustive enumeration, proof by reflection,
and independent recomputation.

**Exact deduplication.** [P-003 temporary evidence](../principle-registry.md#p-003--temporary-trace-before-commitment),
[P-007 targeted computation](../principle-registry.md#p-007--prediction-error-allocation),
[P-009 slower verification](../principle-registry.md#p-009--maintenance-plane),
and [P-010 compiled exact paths](../principle-registry.md#p-010--structural-offloading-and-co-design).
Staged exactification is [Candidate 010](../../experiments/candidates/010-reset-coupled-staged-verification.md)
and support-qualified results [Candidate 014](../../experiments/candidates/014-versioned-observation-contract.md).

**Equal-budget falsification.** Match precision, samples, CPU/joules, database
access, symbolic grammar, and human steering. Reject if standard PSLQ/CAS/
interval methods match discoveries or if proposed identities fail adversarial
precision growth and independent proof.

**Negative transfer.** Roundoff creates false relations; exhaustive checks are
overgeneralized; benchmark constants were in the retrieval corpus; compute cost
is hidden behind a short final formula.

### MATHP-18 — Collaboration, review, repair, and versioned dependencies

**Audit-local claim.** Collaboration can parallelize proposal, checking, and
exposition while a versioned dependency graph supports targeted invalidation.
Participants and tools may share correlated assumptions, so headcount is not
independent evidence.

**Exact state and operation.** Artifact DAG $D_v$, claims $T_v$, contributor/
review assignments $R$, issue set $I$, checks $K$, and release $v$. A
change invalidates the reverse dependency closure; repair produces a new checked
version without rewriting provenance.

**Inputs, training, and leakage.** Drafts, comments, seminar discussions,
library commits, issue history, proof artifacts, reviewer identities/conflicts,
automated checks, and external prior work. Public discussion enters every later
participant's information set.

**Units and costs.** Contributors/reviewers, comments/issues, dependency edges,
changed/invalidated lines or theorems, review and repair hours, CI/checker
seconds, proof bytes, storage, and joules.

**Evidence boundary.** Polymath produced a published collaborative proof
([D. H. J. Polymath 2012](https://doi.org/10.4007/annals.2012.175.3.6)); mathlib
documents distributed library development
([mathlib Community 2020](https://doi.org/10.1145/3372885.3373824)) and
maintenance tooling ([van Doorn, Ebner, and Lewis 2020](https://doi.org/10.1007/978-3-030-53518-6_16)).
These cases show feasibility, not a universal collaboration advantage.

**Possible AI translation.** Separate proposer, critic, formalizer, checker,
maintainer, and release roles; attach every accepted claim to immutable sources,
proof/check records, reviewer actions, and reverse dependencies.

**Strongest mature null.** Git, pull-request review, CI, issue tracking,
seminars/refereeing, formal-library review, reproducible builds, dependency
graphs, and ordinary independent replication.

**Exact deduplication.** [P-009 maintenance](../principle-registry.md#p-009--maintenance-plane),
[P-011 transient coalitions](../principle-registry.md#p-011--transient-communication-coalitions),
[P-012 versioned retention](../principle-registry.md#p-012--memory-matched-to-information-lifetime),
and [P-013 shared state](../principle-registry.md#p-013--externalized-shared-state).
The lifecycle is [Candidate 011](../../experiments/candidates/011-dual-loop-operational-assurance.md),
assurance [Candidate 009](../../experiments/candidates/009-graded-assurance-envelopes.md),
inheritance [Candidate 019](../../experiments/candidates/019-audited-cumulative-inheritance.md),
and governance [Candidate 020](../../experiments/candidates/020-constitutional-control-plane.md)
only where real standing, incentives, or authority exist.

**Equal-budget falsification.** Match total human-hours, model calls, compute,
review depth, accessible artifacts, and checker coverage against a strong
single-team workflow and nominal pooled reviewers. Reject if collaboration
adds coordination and correlated-error cost without more checked results or
faster fault localization.

**Negative transfer.** Consensus launders shared error; contributor count is
mistaken for independence; merge pressure suppresses dissent; dependency
metadata drifts; repair silently changes the theorem.

### MATHP-19 — Curriculum, worked examples, and proof expertise

**Audit-local claim.** Worked examples, strategic knowledge, and repeated proof
validation can change which operations a learner retrieves and applies. Effects
are level-, domain-, task-, and retention-dependent; expert status is not a
portable algorithm.

**Exact state and operation.** Learner/model state $\theta_t$, curriculum
items $U_t$, worked proofs $W_t$, independent exercises $E_t$, feedback
$f_t$, and retention/transfer tests. The operation schedules example, fading,
practice, retrieval, or validation tasks and updates $\theta_t$.

**Inputs, training, and leakage.** Prior courses, theorem/definition library,
worked solutions, hints, instructor/model feedback, item ancestry, practice
order, and target tests. Near-duplicate worked proofs and target-derived hints
are leakage.

**Units and costs.** Examples/exercises, proof steps, study/practice hours,
hints, errors, delayed retention days, transfer accuracy, instructor/model
hours, compute, and joules.

**Evidence boundary.** Worked examples improved algebra acquisition in a series
of controlled studies ([Sweller and Cooper 1985](https://doi.org/10.1207/s1532690xci0201_3)).
Small comparative studies suggest strategic proof knowledge distinguishes some
doctoral students from undergraduates
([Weber 2001](https://doi.org/10.1023/A:1015535614355)); eye-tracking and
validation studies show task-scoped expert/novice differences and even
disagreement among mathematicians
([Inglis and Alcock 2012](https://doi.org/10.5951/jresematheduc.43.4.0358);
[Inglis et al. 2013](https://doi.org/10.1111/tops.12019)). These results do not
identify a single expertise mechanism.

**Possible AI translation.** Schedule proof states by prerequisite and error
profile, fade demonstrations into independent construction, and test delayed
ancestor-disjoint transfer rather than training closure.

**Strongest mature null.** Static prerequisite curricula, spaced/interleaved
practice, worked-example fading, supervised fine-tuning, self-play/generated
curricula, active learning, and uniform/random theorem sampling.

**Exact deduplication.** [P-004 variation/selection](../principle-registry.md#p-004--diversity-selection-and-protection),
[P-007 uncertainty-directed practice](../principle-registry.md#p-007--prediction-error-allocation),
and [P-012 skill retention](../principle-registry.md#p-012--memory-matched-to-information-lifetime).
The direct candidate is [Candidate 004](../../experiments/candidates/004-closed-endogenous-curriculum.md);
turnover retention is [Candidate 019](../../experiments/candidates/019-audited-cumulative-inheritance.md).

**Equal-budget falsification.** Match examples, proof steps, tokens, training
FLOPs/joules, wall time, hints, and instructor/formalizer labor. Test delayed,
ancestor-disjoint, definition-shifted transfer. Reject if uniform, static, or
worked-example baselines match transfer and calibration.

**Negative transfer.** Worked solutions induce imitation without theorem
selection; curriculum hides hard branches; expertise-specific shortcuts fail in
new domains; immediate closure rises while independent retention falls.

## Creativity, discovery, and justification: the non-mystical boundary

The source record supports four distinctions.

1. **Antecedent structure.** Analogical experiments, proof libraries, learned
   tactic systems, and experimental search all operate over acquired examples,
   representations, relations, and operators. This is consistent with
   reconstructive generation.
2. **Transformation is not literal duplication.** Abstraction can quotient
   objects, analogy can map a relational subgraph, and a proof can introduce a
   lemma that changes the search vocabulary. Calling all of these “copying” is
   defensible only at a very broad causal level; it does not specify the
   operation needed for an implementable model.
3. **Variation is not acceptance.** Random or learned sampling can increase the
   proposal set. Correctness comes from a countermodel failing to appear only
   under a complete procedure, or from a derivation/certificate that checks.
   Usefulness and significance remain additional judgments.
4. **Anecdote is not mechanism evidence.** Hadamard's reports about mathematical
   invention and Poincaré's celebrated retrospective narrative are historically
   important self-reports. They cannot identify an unconscious algorithm,
   quantify stochasticity, or distinguish memory recombination from selection
   after the fact. This audit therefore does not use them as mechanism evidence.

An implementable thesis is:

```text
learned structures + current problem + representation + search operators
  -> attributable candidate transformations
  -> examples, counterexamples, and decomposition
  -> proof or refutation attempt
  -> independent checker / qualified review
  -> versioned acceptance, rejection, repair, or open status
```

The important engineering move is not to settle the word “creativity.” It is to
make proposal ancestry, transformation operators, falsification, acceptance,
and lifecycle state separately measurable.

## Exact registry and candidate deduplication

### Principle coverage

| Principle | Mathematical-practice manifestation | Disposition |
| --- | --- | --- |
| [P-001](../principle-registry.md#p-001--selective-allocation) | goal, clause, premise, tactic, variable, and constraint selection | mature search/routing null |
| [P-002](../principle-registry.md#p-002--local-autonomy-with-exception-escalation) | local tactic/theory solver closes a goal or escalates an obligation | mature modular-prover null |
| [P-003](../principle-registry.md#p-003--temporary-trace-before-commitment) | conjecture, failed assignment, counterexample, proof sketch, provisional lemma | mature search-state null |
| [P-004](../principle-registry.md#p-004--diversity-selection-and-protection) | conjecture/program/proof candidates, survivor selection, checked retention | mature synthesis/search null |
| [P-005](../principle-registry.md#p-005--use-dependent-topology) | proof/library dependency graphs change through use and refactoring | no direct distinct evidence; ordinary graph maintenance |
| [P-006](../principle-registry.md#p-006--homeostatic-negative-feedback) | clause deletion, restarts, resource limits, search anti-saturation | mature solver control null |
| [P-007](../principle-registry.md#p-007--prediction-error-allocation) | focus on open goals, conflicts, counterexamples, uncertain premises | mature active search/null |
| [P-008](../principle-registry.md#p-008--compartmentalized-interaction) | subgoals, theories, modules, kernels, typed interfaces | mature formal-methods null |
| [P-009](../principle-registry.md#p-009--maintenance-plane) | checking, library rebuild, invalidation, proof repair, review | mature proof-engineering null |
| [P-010](../principle-registry.md#p-010--structural-offloading-and-co-design) | notation, canonical forms, decision procedures, compiled proof paths | mature representation/compiler null |
| [P-011](../principle-registry.md#p-011--transient-communication-coalitions) | temporary theorem teams, solver portfolios, cooperating theory modules | collaboration/portfolio null; no timing principle |
| [P-012](../principle-registry.md#p-012--memory-matched-to-information-lifetime) | temporary nogoods, proof traces, stable lemmas, archived versions | mature library/lifecycle null |
| [P-013](../principle-registry.md#p-013--externalized-shared-state) | blackboards, proof states, libraries, certificates, issue and dependency graphs | mature workspace/library null |

All thirteen principles receive a mathematical analogue; none expands. P-005
is weakest because library topology is primarily curated dependency structure,
not demonstrated use-dependent reinforcement with a distinct benefit.

### Candidate coverage

| Candidate | Audit relation | Verdict |
| --- | --- | --- |
| [001](../../experiments/candidates/001-adaptive-topology.md) | proof/library graph rewrites are an ordinary null, not support for adaptive topology | no direct support |
| [002](../../experiments/candidates/002-multiscale-context-broadcast.md) | global assumptions and local tactic context do not establish multiscale broadcast | no direct support |
| [003](../../experiments/candidates/003-recovery-dynamics-fragility.md) | proof-search slowdown is not a validated fragility precursor | no direct support |
| [004](../../experiments/candidates/004-closed-endogenous-curriculum.md) | exact destination for conjecture, intervention/counterexample, proof evaluation, and curricula | strong mature nulls; benchmark refinement only |
| [005](../../experiments/candidates/005-severity-ordered-containment.md) | proof repair and rollback are digital maintenance analogues | no new support; ordinary version/rebuild null |
| [006](../../experiments/candidates/006-reversible-physical-skill.md) | no rewritable physical substrate is studied | no support |
| [007](../../experiments/candidates/007-endogenous-observation-surveillance.md) | experiment choice can change observed evidence, but this audit lacks a physical/process observation model | no direct support |
| [008](../../experiments/candidates/008-contestable-modular-allocation.md) | strategic modules are absent from ordinary proof search; credit disputes are not resource-allocation evidence | conditional threat model only |
| [009](../../experiments/candidates/009-graded-assurance-envelopes.md) | proofs, certificates, kernels, dependencies, and versions are mandatory existing assurance layers | direct mature null/refinement |
| [010](../../experiments/candidates/010-reset-coupled-staged-verification.md) | test–counterexample–proof–check stages are ordinary when later stages add information | direct mature null |
| [011](../../experiments/candidates/011-dual-loop-operational-assurance.md) | issue, failure, repair, recheck, and release form a versioned learning loop | direct lifecycle refinement |
| [012](../../experiments/candidates/012-latency-qualified-authority.md) | proof validity does not grant operational authority; stale library evidence can invalidate admission | assurance boundary only |
| [013](../../experiments/candidates/013-deficit-capability-routing.md) | open goals and solver capabilities can be routed by ordinary schedulers | mature routing null, no support |
| [014](../../experiments/candidates/014-versioned-observation-contract.md) | conjecture support, model bounds, precision, corpus, and dependency versions must travel with results | direct evidence-contract refinement |
| [015](../../experiments/candidates/015-versioned-repairable-conventions.md) | notation and proof language are versioned conventions, but this audit does not test adaptive cross-play | no direct support |
| [016](../../experiments/candidates/016-conflict-bounded-unit-transition.md) | proof teams/libraries are not reproductive units | no support |
| [017](../../experiments/candidates/017-contract-preserving-semantic-compaction.md) | abstraction, notation, proof minimization, and migration require semantic round-trip tests | direct mature null/refinement |
| [018](../../experiments/candidates/018-value-reconstructability-aware-tiering.md) | lemma/proof/certificate placement has value and reconstruction cost | mature cache/library null only |
| [019](../../experiments/candidates/019-audited-cumulative-inheritance.md) | formal libraries are a strong ordinary inheritance stack across contributor turnover | direct mature null/refinement |
| [020](../../experiments/candidates/020-constitutional-control-plane.md) | review roles matter only with real standing, authority, incentives, or conflicts | conditional governance boundary |

No Candidate 021 is justified. The narrow residue is to use mathematical
practice as an equal-budget fixture spanning Candidates 004, 009, 010, 011,
014, 017, and 019 while treating theorem provers, SAT/SMT, formal libraries,
and ordinary review as the null stack.

## Decisive equal-budget experiments

### Experiment A — reconstructive conjecture search

- **Task:** versioned combinatorics, algebra, and sequence families containing
  true statements, attractive false statements, near-isomorphic ancestors, and
  definition shifts.
- **Arms:** enumerative synthesis; evolutionary search; retrieval plus
  transformation; matched LLM sampling; structured analogy/abstraction plus
  counterexample and proof loop.
- **Match:** grammar, accessible sources, example/evaluator calls, candidate
  count, proof-search nodes, human steering, wall time, memory, and joules.
- **Measure:** distinct ancestor-grouped checked theorems, counterexamples,
  proof bytes/check time, source distance, invalid proposals, and hidden-family
  transfer.
- **Falsifier:** the structured loop loses to any mature null on the Pareto
  frontier or its gain vanishes after ancestry and evaluator leakage controls.

### Experiment B — decomposition and learned proof guidance

- **Task:** theorem sets frozen by library commit with symbol-renamed,
  definition-shifted, and ancestor-disjoint test families; report results on
  TPTP-style first-order problems, HOList, and miniF2F only within each formal
  setting ([Sutcliffe and Suttner 1995](https://doi.org/10.1093/jigpal/3.6.957);
  [Bansal et al. 2019](https://arxiv.org/abs/1904.03241);
  [Zheng, Han, and Polu 2021](https://arxiv.org/abs/2109.00110)).
- **Arms:** hammers/tuned portfolio; learned premise selection; learned tactics;
  learned lemma decomposition; oracle premise upper bound.
- **Match:** training corpus, model parameters where applicable, accessible
  premises, search nodes, kernel calls, proof-size cap, wall time, energy, and
  formalization hours.
- **Measure:** checked closure, time-to-proof, proof size, checker cost, theorem-
  ancestor leakage, calibration/abstention, and transfer.
- **Falsifier:** kNN, hammers, or a tuned prover portfolio matches the learned
  system, or the result depends on target proof ancestry.

### Experiment C — counterexample value

- **Task:** deliberately overgeneralized conjectures with finite and infinite
  domains, spurious abstractions, ambiguous definitions, and multiple valid
  repairs.
- **Arms:** random tests; property-based/adversarial testing; model finding;
  CEGAR/CEGIS; natural-language critique; typed counterexample-to-repair loop.
- **Match:** oracle/solver calls, tested instances, repair proposals, retained
  failure bytes, human time, compute, and energy.
- **Measure:** valid counterexamples, minimality, hidden-case repair validity,
  theorem weakening, iterations, and regression recurrence.
- **Falsifier:** typed repair adds no value over mature CEGAR/CEGIS or merely
  accumulates exception patches.

### Experiment D — representation and abstraction

- **Task:** isomorphic problems rendered algebraically, graphically,
  geometrically, as tables, and as executable constraints; include degenerate
  cases deliberately hidden by some views.
- **Arms:** single fixed representation; synchronized conventional views;
  learned view selection; learned abstraction with proof obligations.
- **Match:** retained semantic information, view operations, training time,
  bytes, solver nodes, wall time, human labor, accessibility support, and energy.
- **Measure:** valid proof/counterexample rate, operator count, round-trip loss,
  hidden-case errors, and transfer to novel notations.
- **Falsifier:** conventional synchronized views match performance or the
  learned abstraction's excluded cases explain its apparent efficiency.

### Experiment E — certificate boundary

- **Task:** mixed correct and deliberately faulty SAT, SMT, theorem-prover, and
  numerical outputs, including wrong inputs, unsound preprocessing, truncated
  certificates, stale dependencies, and shared producer/checker bugs.
- **Arms:** trust solver exit code; independent rerun; same-code replay;
  standard certificate plus independent checker; graded envelope around the
  same certificate.
- **Match:** covered instances, solver time, checking time, storage/I/O, human
  audit hours, energy, and recovery work.
- **Measure:** bad acceptance, good rejection, fault localization, TCB size,
  time-to-verdict, and lifecycle cost.
- **Falsifier:** the new envelope catches nothing beyond a standard certificate
  and immutable instance/dependency identity.

### Experiment F — cumulative library work across turnover

- **Task:** a multi-release formalization whose definitions and dependencies
  change, with contributor/model turnover and seeded proof/library defects.
- **Arms:** central expert/model with plain Git; formal library plus CI;
  learned retrieval; audited cumulative inheritance; periodically rebuilt
  clean baseline.
- **Match:** total human/model hours, accessible artifacts, storage, build and
  checker time, compute, energy, and release quality target.
- **Measure:** accepted theorems, stale or broken proofs, time-to-localize and
  repair, transfer to new contributors/models, duplicated work, and lineage
  completeness.
- **Falsifier:** ordinary formal-library engineering matches cumulative output
  and repair while the candidate adds governance or metadata cost.

## Failure and negative-transfer register

| Failure | Consequence | Required control |
| --- | --- | --- |
| theorem/proof ancestry leakage | retrieval or memorization appears as discovery | dependency, restatement, generated-sibling, and source-level grouping |
| formalization leakage | a human encoding exposes the intended lemma/decomposition | charge formalizer-hours; blind or independently formalize test statements |
| verifier laundering | any checker success is called truth | publish exact proposition, axioms, definitions, library/kernel versions, and TCB |
| finite-to-universal leap | tested range is reported as proof | keep conjecture status; require proof or checked exhaustive reduction |
| `unknown` collapse | timeout/incomplete theory result becomes false or true | preserve `sat`/`unsat`/`unknown` and certificate/model support separately |
| wrong-problem proof | formal theorem differs from informal intent | independent statement review, examples/counterexamples, bidirectional trace |
| proof-size omission | generation looks cheap because checking/storage is hidden | report proof bytes, I/O, checker time, and rebuild cost |
| human-cost omission | automated score hides statement, library, and repair labor | meter formalization, steering, proof repair, and review hours |
| novelty/correctness collapse | unusual invalid outputs score as discoveries | separate ancestry-qualified novelty, derivability, usefulness, and significance |
| best-of-many concealment | a rare success hides enormous rejected search | report all proposals, nodes, calls, wall time, and energy |
| representation cherry-pick | the view that exposes the answer is chosen after outcome | preregister views or charge view search; include round-trip and degenerate cases |
| abstraction unsoundness | decisive cases disappear | prove preservation or search concretizations for counterexamples |
| symmetry overmerge | non-equivalent states are pruned | certify group action/orbits; audit approximate symmetry separately |
| correlated checking | producer and “independent” verifier share parser, library, or bug | diverse checker where warranted; explicit shared-root analysis |
| certificate denial-of-service | proof is correct but impractical to retain/check | certificate-size, streaming, memory, and time caps with coverage accounting |
| brittle lemma ecology | small definition change invalidates broad library regions | reverse-dependency rebuild, migration tests, minimal premise slices |
| curriculum overfit | immediate training closure replaces transfer | delayed, ancestor-disjoint, definition-shifted tests |
| collaboration-count fallacy | many participants are treated as independent evidence | shared-information graph, planted-error tests, nominal pooled baseline |
| significance laundering | formally correct trivial results are called scientific gains | predeclared value criteria and blinded domain review after correctness |
| benchmark saturation | repeated public test feedback becomes training data | sealed evaluation, query limits, new-family replication, complete access log |

## Audit-local claim register

| ID | Status | Scoped claim | Primary/authoritative support | Ledger destination if later adopted |
| --- | --- | --- | --- | --- |
| MATHP-T01 | established | Analogical transfer is cue- and representation-dependent in the cited experimental tasks. | Gick and Holyoak 1980, 1983 | P-007/P-008; Candidate 004 |
| MATHP-T02 | established | A conjecture's agreement with finite examples does not establish a universal theorem. | logic boundary; Ferguson et al. 1999 | Candidate 010/014 fixture |
| MATHP-T03 | established | A valid counterexample refutes an encoded universal claim but does not select a unique repair. | Clarke et al. 2000 | P-003/P-007; Candidate 011 |
| MATHP-T04 | plausible | Explicit abstraction obligations can prevent some efficiency gains from being purchased by hidden excluded cases. | CEGAR plus proposed comparison | Candidate 014/017 experiment |
| MATHP-T05 | established | Tactic decomposition is safe only when child proofs reconstruct a proof of the parent goal through the kernel interface. | Gordon et al. 1979 | P-008; Candidate 009 |
| MATHP-T06 | established | Formal libraries amortize proof work while adding retrieval, dependency, review, and migration costs. | mathlib and Mizar papers | P-012/P-013; Candidate 019 |
| MATHP-T07 | established | Informationally equivalent representations can differ in the operations and search required for a task. | Larkin and Simon 1987 | P-010/P-013 |
| MATHP-T08 | established | Verified invariants and symmetries can prune search; unverified ones can remove valid solutions. | Crawford et al. 1996 | P-001/P-010 |
| MATHP-T09 | established | Local proofs yield a global result only through explicit compatibility and composition conditions. | Hales et al. 2017 as system case | P-008/P-011 |
| MATHP-T10 | established | Small-kernel proof assistants separate untrusted proof search from trusted checking. | LCF; Lean system paper | Candidate 009 |
| MATHP-T11 | established | Certificates can shift expensive untrusted search to cheaper independent checking under a fixed calculus and instance identity. | Necula 1997; Wetzler et al. 2014 | Candidate 009/010 |
| MATHP-T12 | established | Resolution completeness does not remove heuristic clause-search cost. | Robinson 1965; Vampire | P-001/P-006 |
| MATHP-T13 | established | Learned tactic/premise guidance can improve results in particular formal corpora and budgets; the result is not corpus-independent. | HOList; AlphaProof | P-001/P-004; Candidate 004 null |
| MATHP-T14 | established | CDCL learns conflict clauses and manages their lifetime under the encoded CNF problem. | Nieuwenhuis et al. 2006 | P-003/P-006/P-012 |
| MATHP-T15 | established | DPLL(T) composes Boolean search with scoped theory solvers through explicit propagation/conflict interfaces. | Nieuwenhuis et al. 2006; SMT-LIB | P-002/P-008 |
| MATHP-T16 | established | Constraint/model finding is bounded by its encoding, domain, solver, and certificate support. | Nethercote et al. 2007 | Candidate 014 fixture |
| MATHP-T17 | established | Numerical relation discovery requires exact or certified follow-up before universal acceptance. | Ferguson et al. 1999; Hales et al. 2017 | Candidate 010/014 |
| MATHP-T18 | established | Versioned formal collaboration is feasible, while participant count alone does not establish independent checking. | Polymath; mathlib maintenance | P-009/P-013; Candidate 019 |
| MATHP-T19 | established | Worked examples and strategic proof knowledge have task-scoped learning evidence; immediate performance is not general expertise. | Sweller and Cooper 1985; Weber 2001; Inglis/Alcock studies | P-012; Candidate 004 |
| MATHP-T20 | plausible | A unified propose–challenge–prove–check lifecycle may improve source attribution and error localization beyond a generator plus kernel alone. | integration hypothesis only | Candidates 004/009/011/014; must be tested |

## Conservative verdict

Mathematics contributes an unusually sharp **epistemic pipeline**, not a new
architectural invariant. Candidate generation may be learned, analogical,
symbolic, numerical, stochastic, collaborative, or mixed. Acceptance must stay
separate and typed: example support, counterexample, model, informal argument,
formal proof, checked certificate, review, and significance are different
states.

The transferable research fixture should therefore require:

1. immutable problem, definition, corpus, and library identities;
2. proposal ancestry and explicit transformation operators;
3. dependency-safe training/evaluation splits;
4. counterexample and smallest-model search before commitment;
5. decomposed proof obligations with reconstructible parent closure;
6. generator–checker separation and certificate cost;
7. typed `proved`, `refuted`, `tested`, `unknown`, `disputed`, and `retracted`
   lifecycle states;
8. reverse-dependency invalidation and versioned repair; and
9. a full budget including human-hours and joules.

This fixture should refine existing Candidates 004, 009, 010, 011, 014, 017,
and 019. It should be discarded wherever a mature theorem prover, SAT/SMT/
constraint solver, formal library, or ordinary review workflow matches it at
equal lifecycle budget.

## Audit-local bibliography (primary or authoritative)

```bibtex
@inproceedings{Alemi2016DeepMath,
  author = {Alemi, Alexander A. and Chollet, Fran{\c{c}}ois and Een, Niklas and Irving, Geoffrey and Szegedy, Christian and Urban, Josef},
  title = {{DeepMath}: Deep Sequence Models for Premise Selection},
  booktitle = {Advances in Neural Information Processing Systems 29},
  year = {2016},
  url = {https://arxiv.org/abs/1606.04442}
}

@article{Bancerek2018MizarLibrary,
  author = {Bancerek, Grzegorz and Byli{\'n}ski, Czes{\l}aw and Grabowski, Adam and Korni{\l}owicz, Artur and Matuszewski, Roman and Naumowicz, Adam and P{\k{a}}k, Karol and Urban, Josef},
  title = {The Role of the {Mizar Mathematical Library} for Interactive Proof Development in {Mizar}},
  journal = {Journal of Automated Reasoning},
  year = {2018},
  volume = {61},
  pages = {9--32},
  doi = {10.1007/s10817-017-9440-6},
  url = {https://doi.org/10.1007/s10817-017-9440-6}
}

@inproceedings{Bansal2019HOList,
  author = {Bansal, Kshitij and Loos, Sarah M. and Rabe, Markus N. and Szegedy, Christian and Wilcox, Stewart},
  title = {{HOList}: An Environment for Machine Learning of Higher-Order Logic Theorem Proving},
  booktitle = {Proceedings of the 36th International Conference on Machine Learning},
  year = {2019},
  pages = {454--463},
  url = {https://arxiv.org/abs/1904.03241}
}

@inproceedings{Barrett2010SMTLIB,
  author = {Barrett, Clark and Stump, Aaron and Tinelli, Cesare},
  title = {The {SMT-LIB} Standard---Version 2.0},
  booktitle = {Proceedings of the 8th International Workshop on Satisfiability Modulo Theories},
  year = {2010},
  url = {https://smt-lib.org/papers/smt-lib-reference-v2.0-r10.12.21.pdf}
}

@inproceedings{Clarke2000CEGAR,
  author = {Clarke, Edmund M. and Grumberg, Orna and Jha, Somesh and Lu, Yuan and Veith, Helmut},
  title = {Counterexample-Guided Abstraction Refinement},
  booktitle = {Computer Aided Verification},
  year = {2000},
  pages = {154--169},
  doi = {10.1007/10722167_15},
  url = {https://doi.org/10.1007/10722167_15}
}

@inproceedings{Crawford1996Symmetry,
  author = {Crawford, James M. and Ginsberg, Matthew L. and Luks, Eugene M. and Roy, Amitabha},
  title = {Symmetry-Breaking Predicates for Search Problems},
  booktitle = {Proceedings of the Fifth International Conference on Principles of Knowledge Representation and Reasoning},
  year = {1996},
  pages = {148--159},
  url = {https://kr.org/proceedings/KR-1996-proceedings-scanned.pdf#page=160}
}

@inproceedings{deMoura2015Lean,
  author = {de Moura, Leonardo and Kong, Soonho and Avigad, Jeremy and van Doorn, Floris and von Raumer, Jakob},
  title = {The {Lean} Theorem Prover (System Description)},
  booktitle = {Automated Deduction---CADE-25},
  year = {2015},
  pages = {378--388},
  doi = {10.1007/978-3-319-21401-6_26},
  url = {https://doi.org/10.1007/978-3-319-21401-6_26}
}

@article{Ferguson1999PSLQ,
  author = {Ferguson, Helaman R. P. and Bailey, David H. and Arno, Steve},
  title = {Analysis of {PSLQ}, an Integer Relation Finding Algorithm},
  journal = {Mathematics of Computation},
  year = {1999},
  volume = {68},
  number = {225},
  pages = {351--369},
  doi = {10.1090/S0025-5718-99-00995-3},
  url = {https://doi.org/10.1090/S0025-5718-99-00995-3}
}

@article{Gentner1983StructureMapping,
  author = {Gentner, Dedre},
  title = {Structure-Mapping: A Theoretical Framework for Analogy},
  journal = {Cognitive Science},
  year = {1983},
  volume = {7},
  number = {2},
  pages = {155--170},
  doi = {10.1207/s15516709cog0702_3},
  url = {https://doi.org/10.1207/s15516709cog0702_3}
}

@article{Gick1980Analogical,
  author = {Gick, Mary L. and Holyoak, Keith J.},
  title = {Analogical Problem Solving},
  journal = {Cognitive Psychology},
  year = {1980},
  volume = {12},
  number = {3},
  pages = {306--355},
  doi = {10.1016/0010-0285(80)90013-4},
  url = {https://doi.org/10.1016/0010-0285(80)90013-4}
}

@article{Gick1983Schema,
  author = {Gick, Mary L. and Holyoak, Keith J.},
  title = {Schema Induction and Analogical Transfer},
  journal = {Cognitive Psychology},
  year = {1983},
  volume = {15},
  number = {1},
  pages = {1--38},
  doi = {10.1016/0010-0285(83)90002-6},
  url = {https://doi.org/10.1016/0010-0285(83)90002-6}
}

@book{Gordon1979LCF,
  author = {Gordon, Michael J. and Milner, Arthur J. and Wadsworth, Christopher P.},
  title = {Edinburgh {LCF}: A Mechanised Logic of Computation},
  publisher = {Springer},
  series = {Lecture Notes in Computer Science},
  volume = {78},
  year = {1979},
  doi = {10.1007/3-540-09724-4},
  url = {https://doi.org/10.1007/3-540-09724-4}
}

@article{Hales2017Flyspeck,
  author = {Hales, Thomas C. and Adams, Mark and Bauer, Gertrud and Dang, Tat Dat and Harrison, John and Hoang, Le Truong and Kaliszyk, Cezary and Magron, Victor and McLaughlin, Sean and Nguyen, Tat Thang and Nguyen, Quang Truong and Nipkow, Tobias and Obua, Steven and Pleso, Joseph and Rute, Jason and Solovyev, Alexey and Ta, Thi Hoai An and Tran, Nam Trung and Trieu, Thi Diep and Urban, Josef and Vu, Ky Khac and Zumkeller, Roland},
  title = {A Formal Proof of the {Kepler} Conjecture},
  journal = {Forum of Mathematics, Pi},
  year = {2017},
  volume = {5},
  pages = {e2},
  doi = {10.1017/fmp.2017.1},
  url = {https://doi.org/10.1017/fmp.2017.1}
}

@article{Hubert2025AlphaProof,
  author = {Hubert, Thomas and others},
  title = {Olympiad-Level Formal Mathematical Reasoning with Reinforcement Learning},
  journal = {Nature},
  year = {2025},
  doi = {10.1038/s41586-025-09833-y},
  url = {https://doi.org/10.1038/s41586-025-09833-y}
}

@article{Inglis2012ProofReading,
  author = {Inglis, Matthew and Alcock, Lara},
  title = {Expert and Novice Approaches to Reading Mathematical Proofs},
  journal = {Journal for Research in Mathematics Education},
  year = {2012},
  volume = {43},
  number = {4},
  pages = {358--390},
  doi = {10.5951/jresematheduc.43.4.0358},
  url = {https://doi.org/10.5951/jresematheduc.43.4.0358}
}

@article{Inglis2013Standards,
  author = {Inglis, Matthew and Mejia-Ramos, Juan Pablo and Weber, Keith and Alcock, Lara},
  title = {On Mathematicians' Different Standards When Evaluating Elementary Proofs},
  journal = {Topics in Cognitive Science},
  year = {2013},
  volume = {5},
  number = {2},
  pages = {270--282},
  doi = {10.1111/tops.12019},
  url = {https://doi.org/10.1111/tops.12019}
}

@inproceedings{Kovacs2013Vampire,
  author = {Kov{\'a}cs, Laura and Voronkov, Andrei},
  title = {First-Order Theorem Proving and {Vampire}},
  booktitle = {Computer Aided Verification},
  year = {2013},
  pages = {1--35},
  doi = {10.1007/978-3-642-39799-8_1},
  url = {https://doi.org/10.1007/978-3-642-39799-8_1}
}

@article{Larkin1987Diagrams,
  author = {Larkin, Jill H. and Simon, Herbert A.},
  title = {Why a Diagram Is (Sometimes) Worth Ten Thousand Words},
  journal = {Cognitive Science},
  year = {1987},
  volume = {11},
  number = {1},
  pages = {65--100},
  doi = {10.1111/j.1551-6708.1987.tb00863.x},
  url = {https://doi.org/10.1111/j.1551-6708.1987.tb00863.x}
}

@inproceedings{Mathlib2020Library,
  author = {{The mathlib Community}},
  title = {The {Lean} Mathematical Library},
  booktitle = {Proceedings of the 9th ACM SIGPLAN International Conference on Certified Programs and Proofs},
  year = {2020},
  pages = {367--381},
  doi = {10.1145/3372885.3373824},
  url = {https://doi.org/10.1145/3372885.3373824}
}

@inproceedings{Necula1997PCC,
  author = {Necula, George C.},
  title = {Proof-Carrying Code},
  booktitle = {Proceedings of the 24th ACM SIGPLAN-SIGACT Symposium on Principles of Programming Languages},
  year = {1997},
  pages = {106--119},
  doi = {10.1145/263699.263712},
  url = {https://doi.org/10.1145/263699.263712}
}

@inproceedings{Nethercote2007MiniZinc,
  author = {Nethercote, Nicholas and Stuckey, Peter J. and Becket, Ralph and Brand, Sebastian and Duck, Gregory J. and Tack, Guido},
  title = {{MiniZinc}: Towards a Standard {CP} Modelling Language},
  booktitle = {Principles and Practice of Constraint Programming---CP 2007},
  year = {2007},
  pages = {529--543},
  doi = {10.1007/978-3-540-74970-7_38},
  url = {https://doi.org/10.1007/978-3-540-74970-7_38}
}

@article{Nieuwenhuis2006DPLLT,
  author = {Nieuwenhuis, Robert and Oliveras, Albert and Tinelli, Cesare},
  title = {Solving {SAT} and {SAT} Modulo Theories: From an Abstract {DPLL} Procedure to {DPLL(T)}},
  journal = {Journal of the ACM},
  year = {2006},
  volume = {53},
  number = {6},
  pages = {937--977},
  doi = {10.1145/1217856.1217859},
  url = {https://doi.org/10.1145/1217856.1217859}
}

@article{Polymath2012DHJ,
  author = {{D. H. J. Polymath}},
  title = {A New Proof of the Density {Hales--Jewett} Theorem},
  journal = {Annals of Mathematics},
  year = {2012},
  volume = {175},
  number = {3},
  pages = {1283--1327},
  doi = {10.4007/annals.2012.175.3.6},
  url = {https://doi.org/10.4007/annals.2012.175.3.6}
}

@article{Robinson1965Resolution,
  author = {Robinson, J. Alan},
  title = {A Machine-Oriented Logic Based on the Resolution Principle},
  journal = {Journal of the ACM},
  year = {1965},
  volume = {12},
  number = {1},
  pages = {23--41},
  doi = {10.1145/321250.321253},
  url = {https://doi.org/10.1145/321250.321253}
}

@article{RomeraParedes2024FunSearch,
  author = {Romera-Paredes, Bernardino and others},
  title = {Mathematical Discoveries from Program Search with Large Language Models},
  journal = {Nature},
  year = {2024},
  volume = {625},
  pages = {468--475},
  doi = {10.1038/s41586-023-06924-6},
  url = {https://doi.org/10.1038/s41586-023-06924-6}
}

@inproceedings{SolarLezama2006Sketching,
  author = {Solar-Lezama, Armando and Tancau, Liviu and Bod{\'i}k, Rastislav and Seshia, Sanjit A. and Saraswat, Vijay A.},
  title = {Combinatorial Sketching for Finite Programs},
  booktitle = {Proceedings of the 12th International Conference on Architectural Support for Programming Languages and Operating Systems},
  year = {2006},
  pages = {404--415},
  doi = {10.1145/1168919.1168907},
  url = {https://doi.org/10.1145/1168919.1168907}
}

@article{Sutcliffe1995TPTP,
  author = {Sutcliffe, Geoff and Suttner, Christian},
  title = {The {TPTP} Problem Library, Release v1.2.0},
  journal = {Logic Journal of the IGPL},
  year = {1995},
  volume = {3},
  number = {6},
  pages = {957--959},
  doi = {10.1093/jigpal/3.6.957},
  url = {https://doi.org/10.1093/jigpal/3.6.957}
}

@article{Sweller1985WorkedExamples,
  author = {Sweller, John and Cooper, Graham A.},
  title = {The Use of Worked Examples as a Substitute for Problem Solving in Learning Algebra},
  journal = {Cognition and Instruction},
  year = {1985},
  volume = {2},
  number = {1},
  pages = {59--89},
  doi = {10.1207/s1532690xci0201_3},
  url = {https://doi.org/10.1207/s1532690xci0201_3}
}

@inproceedings{vanDoorn2020Maintenance,
  author = {van Doorn, Floris and Ebner, Gabriel and Lewis, Robert Y.},
  title = {Maintaining a Library of Formal Mathematics},
  booktitle = {Intelligent Computer Mathematics},
  year = {2020},
  pages = {251--267},
  doi = {10.1007/978-3-030-53518-6_16},
  url = {https://doi.org/10.1007/978-3-030-53518-6_16}
}

@article{Weber2001Strategic,
  author = {Weber, Keith},
  title = {Student Difficulty in Constructing Proofs: The Need for Strategic Knowledge},
  journal = {Educational Studies in Mathematics},
  year = {2001},
  volume = {48},
  number = {1},
  pages = {101--119},
  doi = {10.1023/A:1015535614355},
  url = {https://doi.org/10.1023/A:1015535614355}
}

@inproceedings{Wetzler2014DRAT,
  author = {Wetzler, Nathan and Heule, Marijn J. H. and Hunt, Warren A. Jr.},
  title = {{DRAT-trim}: Efficient Checking and Trimming Using Expressive Clausal Proofs},
  booktitle = {Theory and Applications of Satisfiability Testing---SAT 2014},
  year = {2014},
  pages = {422--429},
  doi = {10.1007/978-3-319-09284-3_31},
  url = {https://doi.org/10.1007/978-3-319-09284-3_31}
}

@misc{Zheng2021MiniF2F,
  author = {Zheng, Kunhao and Han, Jesse Michael and Polu, Stanislas},
  title = {{MiniF2F}: A Cross-System Benchmark for Formal Olympiad-Level Mathematics},
  year = {2021},
  eprint = {2109.00110},
  archivePrefix = {arXiv},
  primaryClass = {cs.LO},
  url = {https://arxiv.org/abs/2109.00110}
}
```
