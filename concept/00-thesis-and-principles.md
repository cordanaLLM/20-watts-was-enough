# Thesis and design principles

## Scope

This chapter states the project's argument, its engineering requirements, and
the limits that keep a biological analogy from becoming mythology.

## Thesis

The brain demonstrates that adaptive behavior, continual learning, perception,
memory, and action can coexist under a tight energy and communication budget
([C-001](../research/claims.md#c-001)). Contemporary AI demonstrates a different
strength: highly parallel optimization over vast data and parameter spaces.

The project hypothesis is that a capable artificial system should combine the
search capacity of modern learning with constraints that biology cannot evade:

1. only a small, relevant fraction of capacity should be active for an event;
2. communication and memory movement must be priced, not hidden behind FLOPs;
3. learning must begin from aligned perception, action, and consequence rather
   than language alone;
4. rapid acquisition must not directly rewrite stable long-term structure;
5. consolidation must precede destructive compression; and
6. stable skills, mutable facts, and active reasoning should use different
   storage and execution paths.

The intended result is a system whose cost scales primarily with the
information and uncertainty relevant to a task, rather than with its full
stored capacity.

## Biological observation

Neural signaling is metabolically costly, cortical activity is constrained,
and biological learning spans multiple timescales. Sensory and motor experience
precedes mature language. These observations motivate design constraints.

They do **not** establish a single brain algorithm, an equivalent number of
digital operations, or a guarantee that every biological mechanism is
efficient on silicon.

## Proposed AI translation

The blueprint combines four separations:

- **capacity versus activity:** sparse routers select modules, depth, memory,
  and precision;
- **prediction versus correction:** predictable state follows a cheap path;
  residual uncertainty receives more computation;
- **experience versus structure:** fast memory captures episodes while slow
  learning integrates regularities under regression tests; and
- **reasoning versus knowledge:** stable skills may be compiled or quantized,
  while mutable facts remain retrievable and attributable.

Development is a controlled lifecycle:

```mermaid
flowchart LR
    seed["Capacity-rich modular seed"] --> ground["Sensorimotor grounding"]
    ground --> plastic["Sparse active learning"]
    plastic --> consolidate["Replay and consolidation"]
    consolidate --> validate["Generalization and stability gates"]
    validate --> prune["Structured pruning"]
    prune --> harden["Quantize, compile, or externalize"]
    harden --> operate["Continual operation"]
    operate --> plastic
```

## Efficiency mechanism

The optimization target is constrained quality per unit of total system energy,
with latency and uncertainty limits. A model is not efficient merely because it
has sparse weights; the runtime must avoid loading and operating on inactive
state, and routing overhead must remain smaller than the work skipped.

The top-level objective is developed in the
[energy model](80-energy-model.md):

$$
\max \; \frac{Q}{E_{\text{facility}}}
\quad \text{subject to} \quad
L_{p95} \le L_{\max},\;
R \le R_{\max},\;
Q \ge Q_{\min}.
$$

Here $Q$ is task quality, $E_{\text{facility}}$ is measured facility energy,
$L_{p95}$ is tail latency, and $R$ is a defined risk or calibration metric.

## Evidence status

- Metabolic constraints on neural activity are established within the scope of
  [C-001](../research/claims.md#c-001).
- Conditional computation is established in narrower engineered systems under
  [C-003](../research/claims.md#c-003) and
  [C-004](../research/claims.md#c-004).
- The complete developmental pipeline is a speculative integration. No cited
  paper validates it as one system.

## Speculative extensions

- Learn a global energy price that modules must “bid” against when requesting
  compute.
- Let stable routing motifs become physically colocated or compiled for lower
  data-movement cost.
- Allow controlled structural growth when no existing module can absorb a new
  regime without interference.

## Failure modes

- Anthropomorphic labels conceal incompatible mechanisms.
- Sparsity saves theoretical FLOPs but increases real communication or latency.
- Energy optimization suppresses rare but important computation.
- Early specialization prevents transfer and produces brittle modality silos.
- “Hardening” turns uncertain or mutable behavior into an uncorrectable path.

## Measurable predictions

The integrated hypothesis survives only if, at matched quality:

- active parameters and memory traffic grow more slowly than total capacity;
- average energy falls without unacceptable tail-risk or calibration loss;
- sequential learning retains prior capability better than a matched
  single-timescale baseline; and
- grounded intervention tasks improve beyond gains explained by additional data
  or parameters alone.
