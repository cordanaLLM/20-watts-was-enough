# Relative sensing and scale symmetry across biological interfaces

<!-- markdownlint-disable MD013 -->

- **Audit date:** 2026-08-25
- **Selected gap:** fold-change detection (FCD), relative sensing, and the
  boundary between useful scale invariance and lost absolute information
- **Fields sampled:** systems biology, bacteriology, receptor and membrane
  biology, signal transduction, plant physiology, mathematical control, and
  structural identifiability
- **Evidence base:** primary theoretical and experimental papers only; reviews
  and source discussions were used for discovery, not as claim authority
- **Promotion state:** ten bounded claims are registered as
  [C-1540](../claims.md#c-1540)--[C-1549](../claims.md#c-1549); no new P-series
  principle or architecture candidate is proposed
- **Experiment state:** ten CPU-only falsification protocols are specified in
  [Fixture F-026](../../experiments/fixtures/026-interface-qualified-relative-sensing.md);
  one bounded public-development, generator-only RSD-T01 smoke runner now
  exists; no scientific comparator, claim-eligible run, measured energy, or
  result exists

> **Amendment, 2026-08-26.** The later
> [mechanism-equivalence audit](2026-08-26-rsd-t02-mechanism-equivalence.md)
> narrows C-1541 to the I1-FFL sufficiency and attribution boundary. The
> Skataric--Nikolaev--Sontag fast-initial-layer limitation is now registered
> separately as [C-1564](../claims.md#c-1564), with the supremum norm and
> epsilon-scaled sampling made explicit. This note supersedes the older
> combined assignment below without deleting its provenance.

## Executive finding

Several biological systems respond to a ratio or fold change rather than to an
absolute input. The interesting residue is not the slogan “normalize the
signal.” It is a stronger, testable input--output symmetry:

1. the complete response trajectory can remain invariant when an admissible
   input history and its background are multiplied by the same factor;
2. the invariance belongs to a declared interface, not automatically to the
   whole organism or pathway;
3. different mechanisms can realize the same symmetry, including feedback,
   incoherent feed-forward structure, and receptor-abundance memory;
4. every realization has finite support, reference-state maintenance, delay,
   saturation, reset, and observability costs; and
5. an invariant observation interface can make scale unrecoverable from that
   interface alone, which is harmful when a downstream task depends on an
   absolute load, dose, damage, or safety threshold.

The same functional boundary recurs in *E. coli* chemotaxis, mammalian Wnt,
NF-κB and PI3K--Akt signalling, social-amoeba relay, and Arabidopsis
photosynthetic response. That convergence strengthens the case for one
deduplicated test family. It does not justify one universal biological circuit
or an energy-saving claim.

The engineering hypothesis is therefore conditional: a causal relative-sensing
channel may reduce recalibration or improve transfer across multiplicative
scale changes, but only if a validity gate preserves an absolute channel where
the task needs it and if reference maintenance costs less than the avoided
work. Fixture F-026 proposes comparisons with static normalization, log-ratio,
streaming statistics, state-space and recurrent nulls under matched information
and budgets; those comparisons are not implemented.

## Current implementation boundary

The implemented RSD-T01 runner is a deterministic construction and conformance
harness over two unequal-information diagnostics. It exposes both complete
trajectories, so its registered discrepancy and weaker trace predicates are
directly computable. It cannot establish learned prediction or arm superiority.

Before comparators are implemented, the protocol freezes exactly eight
actionable roles: `A-RAW`, `B-STATIC-DIV`, `B-STREAM`, `B-LOG-RATIO`,
`B-DIFFERENCE`, `B-STATE-SPACE`, `B-RECURRENT`, and `C-DUAL`.
`O-STATISTIC` remains evaluator-only and is excluded from parity, promotion and
resource rankings. A predictive comparison additionally requires a prospective
information cut, multiple scale cells per shared initialization, system-level
worst-cell aggregation, and valid hostile worlds that are not malformed-packet
sentinels. The scientific-grid foundation records `2×` and `4×` as public
observed-development roles and `8×` as a public withheld-prospective role. It
records those prerequisites only; it does not create a result or a private
confirmation partition.

## Scientific boundary and terminology

Let a causal system have state $x(t)$, positive input $u(t)$, and output $y(t)$:

$$
\dot{x}=f(x,u),
\qquad
y=h(x,u).
$$

Let $x_{\mathrm{ss}}(b)$ denote the initialized steady state associated with a
positive background $b$, and let $G$ be the declared set of admissible positive
scale factors. Exact full-trajectory FCD on that support requires

$$
y\!\left(t; p u, x_{\mathrm{ss}}(pb)\right)
=
y\!\left(t; u, x_{\mathrm{ss}}(b)\right)
\quad
\text{for every }p\in G
$$

for the registered input histories and times. Approximate FCD replaces exact
equality with a frozen trajectory discrepancy, uncertainty model, and
acceptance margin.

This definition is deliberately stronger than nearby constructs:

| Construct | What is constrained | What it does not establish |
| --- | --- | --- |
| exact adaptation | the final output returns to the same steady value | equal transient amplitude, latency, duration, or shape |
| Weber-like response | a selected amplitude depends on relative change | equality of the complete trajectory |
| static divisive normalization | one contemporaneous normalized value | causal memory, adaptation, or trajectory invariance |
| log difference | $\log u(t)-\log b$ for positive inputs | a biological mechanism, safe behavior near zero, or reference validity |
| derivative/difference detection | response to additive change or rate | multiplicative-scale symmetry |
| parameter robustness | output is insensitive to a parameter family | invariance to scaled input histories unless that transformation is explicit |

The audit uses **relative sensing** for empirical ratio-dependent behavior and
**scale invariance** for a declared formal input--output symmetry. It uses
**exact FCD** only where the mathematical criterion is actually met.

## Interface firewall

Every claim and experiment must name the arrow at which the statistic is
defined:

$$
u_{\mathrm{external}}
\longrightarrow
s_{\mathrm{internal}}
\longrightarrow
y_{\mathrm{transcription}}
\longrightarrow
a_{\mathrm{behaviour}}.
$$

Evidence that transcription follows the fold change of nuclear RelA does not
prove that extracellular TNF is fold-change encoded. Evidence that a receptor
or kinase response rescales does not prove that behavior is invariant. A
behavioral result does not identify the internal circuit. F-026 therefore
records the input, background, internal observation, downstream target,
behavior, intervention, and time support separately.

## Cross-field convergence without duplication

The recurring solution family decomposes into four already-owned functions:

1. **Reference state.** A slower variable retains a background against which a
   faster input is compared. This refines [P-003](../principle-registry.md#p-003--temporary-trace-before-commitment)
   and [P-012](../principle-registry.md#p-012--memory-matched-to-information-lifetime).
2. **Stabilizing adaptation.** Feedback or feed-forward cancellation restores
   an output after a change. This routes to
   [P-006](../principle-registry.md#p-006--homeostatic-negative-feedback).
3. **Observation qualification.** The useful statistic changes across
   interfaces, protocols and regimes. This refines Candidate 014 rather than
   creating a new principle.
4. **Stored structure.** Receptor abundance can embody a stimulus-specific
   background state. This is an instance of
   [P-010](../principle-registry.md#p-010--structural-offloading-and-co-design), not a new
   receptor-themed architecture.

The density-qualified social-amoeba result additionally touches transient
communication [P-011](../principle-registry.md#p-011--transient-communication-coalitions)
and externalized shared state
[P-013](../principle-registry.md#p-013--externalized-shared-state). Static
normalization, streaming standardization, log differences, generic recurrent
state, state-space filtering, group-invariant models, and ordinary robust
control remain mandatory mature nulls.

A new principle is not created by this audit. A future candidate would need to beat those nulls while
rejecting additive shifts, stale references, near-zero inputs, unseen scales,
saturation, and absolute-critical tasks.

## Evidence map

| Claim | System or theorem | Interface | Evidence status | F-026 test |
| --- | --- | --- | --- | --- |
| C-1540 | nonlinear input--output systems | scaled input history to full output trajectory | established formal result | RSD-T01 |
| C-1541 | I1-FFL and fast/slow systems | circuit state to output | established theory with explicit limitations | RSD-T02 |
| C-1542 | *E. coli* chemotaxis | ligand to FRET response and population migration | established scoped experiment | RSD-T03 |
| C-1543 | Wnt/β-catenin | internal β-catenin fold to downstream output | established scoped experiment/model | RSD-T04 |
| C-1544 | TNF/NF-κB | nuclear RelA fold to three transcripts | established scoped association | RSD-T05 |
| C-1545 | dynamic TNF/IL-1β/NF-κB | extracellular cytokine history to nuclear response | established scoped counterexample | RSD-T06 |
| C-1546 | *Dictyostelium* cAMP relay | extracellular cAMP fold to cell and collective relay | established scoped experiment/model | RSD-T07 |
| C-1547 | Arabidopsis photosynthesis | light step to chlorophyll fluorescence | established approximate response in finite regime | RSD-T08 |
| C-1548 | EGF/HGF PI3K--Akt | ligand background to receptor memory and downstream response | established scoped experiment/model | RSD-T09 |
| C-1549 | invariant dynamical models | robust output to parameter observability | established formal relationship under stated definitions | RSD-T10 |

## Claim records

### C-1540

**Biological or formal observation.** Shoval et al. define FCD as invariance of
the entire output shape to common multiplicative rescaling of an input history
and its initialized background. They show its relation to scalar symmetry in
sensory search and show that exact adaptation plus Weber-like peak behavior is
not sufficient.

**Evidence status.** Established formal result for the source's initialized
system class and symmetry assumptions. It is not a universal empirical law.

**Proposed AI translation.** Treat multiplicative transfer as a group action on
the observation history and test full causal trajectories, not one score. A
model may expose absolute and relative channels plus a support flag.

**Efficiency mechanism.** Reusing a ratio-qualified policy across source
strengths could avoid per-scale calibration, retraining, or redundant state.

**Failure modes.** Step-only evaluation, wrong initialization, future-aware
normalization, equality of peaks with different latency, additive rather than
multiplicative shift, and hidden absolute targets.

**Measurable prediction.** On same-shape input histories multiplied by held-out
positive factors, a qualified relative arm has lower complete-trajectory
discrepancy than absolute and static-normalization nulls without increasing
absolute-critical task loss.

### C-1541

**Biological or formal observation.** A type-1 incoherent feed-forward loop can
produce FCD when activation, repression and timescale conditions hold. The
Skataric--Nikolaev--Sontag analysis shows that a fast-output approximation can
retain a nonzero scale-invariance error even as the nominal separation becomes
large.

**Evidence status.** Established theoretical sufficiency and limitation for
the specified models. Motif occurrence alone is not evidence of function.

**Proposed AI translation.** Compare explicit feed-forward, feedback,
reference-memory and ordinary recurrent mechanisms that are constructed to
match on step responses, then distinguish them with ramps, pulses, resets and
interventions.

**Efficiency mechanism.** A minimal causal reference loop may implement the
needed transformation with less state than a generic sequence model, if it
retains accuracy after its update and reset costs are charged.

**Failure modes.** Topology-as-function inference, singular-limit overclaim,
unmeasured hidden state, saturated activation, and a simpler log-ratio
transform matching the result.

**Measurable prediction.** A diagnostic that uses non-step interventions
identifies the generator family more reliably than motif labels or step fit;
claims of exactness are rejected when trajectory error has a nonzero floor.

### C-1542

**Biological observation.** Lazova et al. reported approximate rescaling of
*E. coli* chemotaxis signalling within finite concentration regimes, extension
to ensemble migration in correspondingly scaled gradients, and approximate
background invariance of adaptation time over a wider range.

**Evidence status.** Established scoped FRET, microfluidic and model evidence.
The distinct regimes and finite concentration range must be retained.

**Proposed AI translation.** Use relative gradient histories for active search
only where multiplicative field scaling is supported, while retaining
saturation and additive-background detection.

**Efficiency mechanism.** One search policy may transfer across source
strengths without a dense amplitude-indexed policy table.

**Failure modes.** Receptor saturation, ligand-specific regimes, additive
backgrounds, transport changes, near-zero concentration, and path-length or
sensor cost hidden behind terminal success.

**Measurable prediction.** In multiplicatively rescaled synthetic chemical
fields, the relative arm preserves success and path geometry across held-out
amplitudes; its advantage vanishes or is gated under additive offsets and
saturation.

### C-1543

**Biological observation.** Goentoro and Kirschner found β-catenin fold change
more robust than final absolute β-catenin across a limited internal
perturbation range, with mammalian-cell and *Xenopus* evidence that downstream
outputs tracked the robust quantity.

**Evidence status.** Established scoped experiment and model. The support was
finite, and the relevant interface is internal β-catenin to downstream output,
not extracellular Wnt concentration to every phenotype.

**Proposed AI translation.** Test a downstream decoder on heterogeneous
internal gains and initial states while independently varying absolute and
relative task targets.

**Efficiency mechanism.** A relative internal code may reduce sensitivity to
component-to-component gain calibration.

**Failure modes.** Perturbations outside support, absolute target dependence,
upstream/downstream interface confusion, and ordinary gain augmentation or
normalization matching the decoder.

**Measurable prediction.** Relative decoding improves transfer across held-out
internal gains for ratio-defined targets but loses on a protected
absolute-target counter-task unless an absolute channel is retained.

### C-1544

**Biological observation.** In same-cell HeLa measurements, maximum nuclear
RelA fold change was the strongest tested single predictor for NFKBIA, IL8 and
TNFAIP3 transcript counts, with reported $R^2$ values of $0.52$, $0.61$ and
$0.67$, respectively.

**Evidence status.** Established scoped association and model result. It does
not establish universal extracellular-TNF FCD or all NF-κB targets.

**Proposed AI translation.** Compare absolute level, additive change,
fold-change, temporal integral and recurrent predictors on heterogeneous
baselines with calibrated held-out prediction.

**Efficiency mechanism.** A compact derived statistic may replace redundant
baseline-specific parameters when it preserves downstream prediction.

**Failure modes.** Same-cell selection bias, gene-specific response,
correlation mistaken for mechanism, maximum chosen using future information,
and flexible recurrent predictors matching the statistic.

**Measurable prediction.** Under causal feature windows, fold change is
selected only for ratio-generated targets and loses or abstains when the DGP
is absolute, additive or integral-based.

### C-1545

**Biological observation.** Son et al. exposed cells to increasing, decreasing
and fluctuating TNF or IL-1β histories. Nuclear NF-κB AUC approximately followed
$\log(\Delta C+1)$ for positive additive dose increments, while decreases
strongly suppressed the response; negative feedback supplied short-term memory.
This examines a different interface and protocol than C-1544.

**Evidence status.** Established scoped experiment and model; it is a direct
counterexample to calling an entire pathway a universal ratio detector.

**Proposed AI translation.** Treat statistic selection as an interface- and
protocol-qualified inference problem with an abstention outcome.

**Efficiency mechanism.** Selecting the smallest sufficient statistic can
avoid maintaining unnecessary transforms, but only after selector cost and
mistakes are counted.

**Failure modes.** Confusing level, difference, derivative and ratio; linear
ramps that make statistics collinear; response-delay mismatch; and post-hoc
selection on the confirmation set.

**Measurable prediction.** A factorial generator separating absolute,
additive-difference, derivative and ratio DGPs forces a selector to identify
the correct statistic or abstain; ratio-only policies fail the protected
absolute-difference family.

### C-1546

**Biological observation.** Kamino et al. found fold-change dependence of
single-cell cAMP relay in *Dictyostelium*. The range supporting population
oscillation agreed with the single-cell response range, and modelling linked
scale invariance of the secrete-and-sense system to cell-density
transformation.

**Evidence status.** Established scoped live-cell evidence and conditional
mathematical model. It is not generic density independence.

**Proposed AI translation.** Test relative sensing in a communicating agent
population while independently varying population size, transport,
degradation, delay, topology and message loss.

**Efficiency mechanism.** Local ratio-coded relay could reduce global
renormalization when group size changes.

**Failure modes.** Density-dependent transport, relay saturation, delayed
reference state, topology fragmentation, communication burden, and a standard
consensus or oscillator controller matching the result.

**Measurable prediction.** A relative relay retains oscillation or coordination
inside a registered density envelope, while explicit transport and degradation
changes reveal the boundary rather than being averaged into success.

### C-1547

**Biological observation.** Tendler et al. reported approximate FCD,
Weber-like response and adaptation in Arabidopsis chlorophyll fluorescence for
low-to-medium light steps. Pulse amplitudes approximately matched for equal
fold changes, but full pulse shapes were not identical; at higher light the
response saturated and lost exact adaptation. The paper describes high light
as stressful but does not establish a separate absolute-hazard sensing channel.

**Evidence status.** Established approximate, finite-regime experiment with a
model-qualified feed-forward interpretation. Exact trajectory FCD and
universal plant light control are not established.

**Proposed AI translation.** Combine a relative early-response channel with an
independently justified synthetic absolute-hazard counter-task and explicit
regime gate. The absolute channel is an engineering requirement, not a
source-attributed plant mechanism.

**Efficiency mechanism.** The relative channel may retain sensitivity across
benign backgrounds, while the absolute path prevents adaptation from hiding
danger.

**Failure modes.** Treating similar peaks as identical trajectories,
photodamage hidden by normalization, regime drift, sensor saturation, and a
standard dual-threshold controller matching the result.

**Measurable prediction.** A dual-channel controller transfers across benign
multiplicative backgrounds and preserves the absolute high-intensity stop;
ratio-only and adaptation-only arms violate the hazard gate.

### C-1548

**Biological observation.** Lyashenko et al. modelled and experimentally
supported a receptor-based mechanism operating on fast pAkt timescales in which
ligand-dependent surface-receptor removal encodes background EGF or HGF;
transcriptional supplementation was not directly excluded. The response
propagated through PI3K--Akt within finite ligand ranges. In the model,
sustained receptor production and delivery maintained the reference. The
evidence supports this mechanism as sufficient and consistent with the
experiments, not uniquely necessary.

**Evidence status.** Established scoped experiment and analytical/computational
model. Receptor turnover, ligand identity, saturation and recovery bound the
mechanism.

**Proposed AI translation.** Store channel-specific reference state in a
resource-bearing interface and expose its age, support and reset lifecycle.

**Efficiency mechanism.** An interface-local reference can reduce downstream
calibration traffic if its construction, turnover and replacement are cheaper.

**Failure modes.** Stale memory, missing observations, ligand switch,
cross-channel contamination, slow recovery, maintenance burden, and EMA or
state-space references matching performance.

**Measurable prediction.** A channel-specific reference beats generic
streaming normalization only under the registered shift and turnover family;
the result is killed if maintenance cost removes its task--resource advantage.

### C-1549

**Formal observation.** Sontag relates invariance of an initialized family at a
selected output to input/output equivalence and structural non-identifiability
under explicit assumptions. Villaverde and Banga show why robustness
definitions and modelling choices must be separated from structural
identifiability and how additional outputs can change recoverability.

**Evidence status.** Established formal relationship for the stated system,
analyticity, initialization and output definitions. It is not a claim that all
robust biological models are unidentifiable.

**Proposed AI translation.** Measure both task robustness and recovery of any
absolute variable that later decisions require. Add a calibrated absolute
channel rather than assuming an invariant representation is sufficient.

**Efficiency mechanism.** Delete nuisance scale only when it is provably
irrelevant to all registered targets; otherwise retain the cheapest calibrated
side channel that restores observability.

**Failure modes.** Confusing parameter and input invariance, declaring model
unidentifiability a desirable system property, hiding target changes, and
measuring recoverability from privileged evaluator state.

**Measurable prediction.** A relative-only representation improves robustness
to multiplicative nuisance scale but cannot recover the hidden scale; adding a
priced absolute channel moves the system along a measurable
robustness--recoverability--compute frontier.

## Translation boundary

### Proposed artificial system

The bounded translation is a dual-channel causal observation contract:

1. maintain a reference state $r_t$ with provenance, timestamp, support and
   reset rule;
2. compute candidate statistics such as absolute $u_t$, difference
   $u_t-r_t$, derivative, and log ratio $\log u_t-\log r_t$ only where their
   domains are valid;
3. expose an uncertainty/support vector rather than silently substituting a
   statistic;
4. route ratio-qualified tasks through the relative channel;
5. route absolute-critical tasks through a calibrated absolute channel; and
6. charge reference updates, sensing, state, selector, fallback, communication,
   compute, artifacts and later measured energy.

This is a test object, not a promoted architecture.

### Strongest null stack

F-026 must include at least:

1. raw absolute causal model;
2. static divisive normalization;
3. future-free streaming mean and variance;
4. explicit log-ratio and additive-difference transforms;
5. linear state-space or Kalman reference estimator;
6. recurrent GRU-style state under the same causal history and state budget;
7. mechanism-specific IFFL and receptor-memory frontends;
8. conditional dual-channel model; and
9. evaluator-only oracle statistic as a diagnostic ceiling, never a deployable
   arm.

### Efficiency hypothesis

No cited biological paper establishes an AI energy saving. The hypothesis is
eligible for later promotion only if

$$
\Delta J
=
\Delta L_{\mathrm{task}}
+\lambda_R\Delta R
+\lambda_C\Delta C
+\lambda_M\Delta M
<0,
$$

where $L_{\mathrm{task}}$ is task-native loss, $R$ is registered risk,
$C$ is complete compute and communication cost, $M$ is reference-state
maintenance, and each $\lambda$ and unit is frozen before confirmation.
Workstation energy in joules remains a separate measured endpoint.

## Hostile transfer inventory

Every F-026 track includes the applicable cases below:

1. additive offsets masquerading as multiplicative gain;
2. values near zero, sign changes, quantization, clipping and saturation;
3. unseen scale factors, not interpolation alone;
4. equal peaks with different latency, width or adaptation tail;
5. pulses, ramps and stochastic histories after step-only tuning;
6. stale, contaminated or cross-channel reference memory;
7. slow-ramp hazards hidden by adaptation;
8. absolute dose, load, damage and safety thresholds;
9. future-aware batch-normalization leakage;
10. density-dependent transport, delay and degradation;
11. reference maintenance exceeding avoided recalibration; and
12. scale information removed before a later control target needs it.

## Protocol map

| Protocol | Claim | Primary falsification target |
| --- | --- | --- |
| RSD-T01 | C-1540 | distinguish full-trajectory scale symmetry from adaptation and peak equality |
| RSD-T02 | C-1541 | distinguish mechanisms with matched step responses and expose approximation error floors |
| RSD-T03 | C-1542 | test active search across multiplicative, additive and saturating fields |
| RSD-T04 | C-1543 | separate internal-gain robustness from absolute-target sufficiency |
| RSD-T05 | C-1544 | compare candidate statistics for heterogeneous single-cell-like baselines |
| RSD-T06 | C-1545 | identify absolute, difference, derivative and ratio DGPs or abstain |
| RSD-T07 | C-1546 | test density-qualified relay with explicit transport and communication cost |
| RSD-T08 | C-1547 | join benign relative response to an absolute hazard regime |
| RSD-T09 | C-1548 | test channel-specific reference-memory lifecycle and maintenance cost |
| RSD-T10 | C-1549 | quantify robustness, recoverability and compute as separate axes |

## Fine-grained taxonomy routing

Only the evidence-bearing ANZSRC children are assigned; their parents and
siblings do not inherit coverage.

| Code | Field | State | Claims | Boundary |
| --- | --- | --- | --- | --- |
| 310110 | Receptors and membrane biology | dedicated | C-1543, C-1548 | receptor abundance and internal signalling interfaces only |
| 310111 | Signal transduction | dedicated | C-1542--C-1548 | named bacterial, mammalian, amoebal and plant pathways only |
| 310114 | Systems biology | dedicated | C-1540--C-1549 | formal symmetry, circuit and interface-qualified evidence |
| 310202 | Biological network analysis | adjacent | C-1540, C-1541, C-1549 | motif, equivariance and identifiability analysis only |
| 310701 | Bacteriology | adjacent | C-1542 | *E. coli* chemotaxis experiment only |
| 310806 | Plant physiology | adjacent | C-1547 | low-to-medium-light Arabidopsis response only |

The audit does not claim field-wide coverage of microbiology, cell biology,
botany, immunology, developmental biology, control theory or mathematical
biology.

## European and German applicability sentinel

The registered F-026 comparator experiment remains documentation-defined and
CPU-only; only its bounded generator-only RSD-T01 smoke harness is executable.
It uses no personal data, biological samples, clinical intervention,
environmental release, laboratory apparatus, automated high-impact decision,
or product placement. No conformity or legal claim follows from a synthetic
pass.

If later work uses human-derived signalling data, links records to persons,
deploys automated decisions, controls physical exposure, or becomes a product,
the then-current EU and German role, purpose and risk classification must be
reviewed before collection or execution. Applicable obligations may include
the GDPR, the EU AI Act, research ethics, worker and product safety, and the
then-current DIN/EN/ISO standards actually adopted for the system. Foreign
rules are not substituted for applicable EU/German obligations.

## Evidence limitations and open questions

1. The biological experiments use different organisms, reporters, interfaces,
   timescales and perturbation families; convergence is functional, not proof
   of one conserved molecular mechanism.
2. Several results are approximate and finite-range. Exact mathematical FCD
   must not be back-projected onto them.
3. Source experiments establish biological behavior, not superiority of an
   artificial translation over mature signal-processing or control methods.
4. The complete maintenance and energy cost of biological reference states is
   not reported in a form comparable with an AI workload.
5. It remains open whether a selector can identify the relevant statistic
   causally before its acquisition and error cost erases the benefit.
6. It remains open whether dual-channel representations retain enough absolute
   information for later tasks without recreating a dense representation.

## Primary bibliography

1. Shoval et al. (2010), [Fold-change detection and scalar symmetry of sensory
   input fields](https://doi.org/10.1073/pnas.1002352107).
2. Goentoro et al. (2009), [The incoherent feedforward loop can provide
   fold-change detection in gene regulation](https://doi.org/10.1016/j.molcel.2009.11.018).
3. Skataric, Nikolaev, and Sontag (2015), [Fundamental limitation of the
   instantaneous approximation in fold-change detection models](https://doi.org/10.1049/iet-syb.2014.0006).
4. Lazova et al. (2011), [Response rescaling in bacterial
   chemotaxis](https://doi.org/10.1073/pnas.1108608108).
5. Goentoro and Kirschner (2009), [Evidence that fold-change, and not absolute
   level, of β-catenin dictates Wnt signaling](https://doi.org/10.1016/j.molcel.2009.11.017).
6. Lee et al. (2014), [Fold change of nuclear NF-κB determines TNF-induced
   transcription in single cells](https://doi.org/10.1016/j.molcel.2014.01.026).
7. Son et al. (2021), [NF-κB responds to absolute differences in cytokine
   concentrations](https://doi.org/10.1126/scisignal.aaz4382).
8. Kamino et al. (2017), [Fold-change detection and scale invariance of
   cell--cell signaling in social amoeba](https://doi.org/10.1073/pnas.1702181114).
9. Tendler et al. (2018), [Fold-change response of photosynthesis to step
   increases of light level](https://doi.org/10.1016/j.isci.2018.09.019).
10. Lyashenko et al. (2020), [Receptor-based mechanism of relative sensing and
    cell memory in mammalian signaling networks](https://doi.org/10.7554/eLife.50342).
11. Sontag (2017), [Dynamic compensation, parameter identifiability, and
    equivariances](https://doi.org/10.1371/journal.pcbi.1005447).
12. Villaverde and Banga (2017), [Dynamical compensation and structural
    identifiability of biological models: Analysis, implications, and
    reconciliation](https://doi.org/10.1371/journal.pcbi.1005878).

## Disposition

Integrate C-1540--C-1549 into the central ledger, route the six exact ANZSRC
children, add the scale-symmetry math note and plot, and keep F-026 as a
protocol-complete comparator experiment that is not yet executable beyond its
generator-only smoke harness. Promotion requires a separately committed private
confirmation partition against the complete null stack and later calibrated
workstation energy. Attractive trajectory collapse is not a result by itself.
