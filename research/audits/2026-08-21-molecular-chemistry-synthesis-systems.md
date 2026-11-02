# Molecular chemistry, synthesis, and adaptive molecular systems

<!-- markdownlint-disable MD013 -->

- **Audit date:** 2026-08-21
- **Taxonomy target:** current DFG Fachkollegium **3.11 — Molekülchemie**, specifically 3.11-01 *Anorganische Molekülchemie — Synthese, Charakterisierung* and 3.11-02 *Organische Molekülchemie — Synthese, Charakterisierung*
- **Field scope:** molecular synthesis and reaction design; physical-organic and mechanistic reasoning; catalysis; supramolecular host–guest chemistry; dynamic covalent and combinatorial chemistry; self-sorting and self-assembly; photochemical and electrochemical control; molecular ratchets; chemical information and selection; structure elucidation and measurement boundaries
- **Evidence rule:** a molecule, reaction, equilibrium, spectrum, or apparatus is retained in its chemical context before any systems abstraction; a suggestive analogy is not evidence of an AI advantage
- **Promotion state:** no new principle and no new candidate; eight exact CPU-only workstation contracts sharpen existing candidates and fixtures
- **Safety boundary:** every proposed experiment is synthetic software. This audit does not instruct wet synthesis, chemical handling, irradiation, electrolysis, pressure operation, or human/animal experimentation

## Executive finding

Molecular chemistry closes a genuine field-census gap, but it does not justify a
new architecture object merely by offering molecular words for selection,
memory, routing, or repair. Its durable contribution is a set of unusually sharp
conditions under which local interactions actually produce a useful global
outcome:

1. **Reversible exchange can correct assembly errors only while exchange remains
   kinetically accessible and the desired product is favored in the declared
   environment.** Reversibility can also cause scrambling, product loss, or
   failure to commit.
2. **Dynamic libraries select under an assay and reaction network.** Template
   concentration, exchange rates, solvent, agitation, phase separation, and
   analytical recovery can change what is amplified; abundance is not an
   intrinsic fitness or truth score.
3. **Self-sorting requires a hierarchy of compatible and incompatible
   interactions.** Near-degenerate motifs, promiscuity, concentration changes,
   and kinetic traps produce cross-talk or statistical mixtures rather than
   guaranteed modularity.
4. **Catalytic selectivity is pathway- and condition-specific.** A catalyst,
   photoswitch, electrode waveform, or reactor geometry can alter rates and
   product distributions, but its control state, switching losses, transport,
   deactivation, and measurement remain part of the system.
5. **Directional molecular motion requires nonequilibrium driving plus kinetic
   asymmetry.** Brownian motion or chemical fuel alone does not create a ratchet;
   the fuel, waste, readout, and reset ledger cannot be omitted.
6. **Structure elucidation is an inverse problem over a candidate set.** Spectra
   are produced by an instrument, sample, protocol, and processing chain;
   confidence is conditional on candidate completeness, model error, and
   orthogonal measurements.
7. **Generate–test–select is already a mature AI and engineering null.** Bayesian
   reaction optimization, tree-search retrosynthesis, computer-assisted
   structure elucidation, and robotic closed-loop experimentation must be beaten
   before a chemical-selection metaphor earns architectural status.

The residual is therefore not “chemical intelligence.” It is a falsifiable
**exchange–selection–context–measurement contract**. A proposed system must
expose what can exchange, what is conserved, which environment performs the
selection, which paths are irreversible, how the product is identified, and the
full cost of keeping the loop out of equilibrium. The eight workstation tracks
below test that contract without requiring a wet laboratory.

## Current DFG scope and conservative coverage decision

The current DFG page lists only two subjects under Fachkollegium 3.11:
inorganic molecular chemistry—synthesis and characterization, and organic
molecular chemistry—synthesis and characterization
([DFG 3.11](https://www.dfg.de/de/ueber-uns/gremien/fachkollegien/fachsystematik/naturwissenschaften-3-11)).
The page was last updated on 16 June 2026 at the audit snapshot. This is narrower
than “all chemistry.” Physical chemistry, analytical chemistry, biological and
food chemistry, polymer research, theoretical chemistry, and solid-state and
surface chemistry are separate DFG boards.

This audit uses kinetics, spectroscopy, electrochemistry, photochemistry, and
supramolecular chemistry only where they determine molecular synthesis,
selection, or characterization. It does not silently claim those neighboring
boards.

**Classification recommendation after this audit:**

- **DFG 3.11 — dedicated, bounded coverage.** A field-centered synthesis audit
  now exists. Coverage includes representative organic synthesis logic and a
  bounded metal/ligand catalysis slice relevant to inorganic molecular
  chemistry, but not exhaustive reaction classes or element families.
- **OECD FORD 1.4 Chemical sciences — remains dedicated; synthesis depth
  improves.** The prior reaction-network/proofreading audit already made the
  broad OECD field dedicated. This work closes the named molecular-synthesis
  gap without completing analytical, surface, polymer, or theoretical chemistry.

**Remaining DFG 3.11 depth after the audit:** total synthesis; main-group and
organometallic reaction breadth; coordination and bioinorganic molecular
chemistry; asymmetric catalysis beyond the examples below; radical, pericyclic,
and C–H activation mechanisms; flow and scale-dependent synthesis; molecular
machines beyond ratchet exemplars; high-throughput experimentation; substance
identity and stereochemical edge cases; reaction-data quality; reproducibility;
and industrial route selection under safety, waste, and supply constraints.

## Normative-source header

The field evidence and the legal/standards boundary are separate.

- **Scientific claims** below are supported by primary papers or by an
  authoritative field source.
- **Laboratory competence and measurement records** may invoke
  [DIN EN ISO/IEC 17025:2018-03](https://doi.org/10.31030/2731745),
  [JCGM 100:2008](https://doi.org/10.59161/JCGM100-2008E), and, for chemical
  detection and quantification under its scope,
  [DIN 32645:2008-11](https://doi.org/10.31030/1465413). These sources do not
  certify any result in this repository.
- **EU chemical obligations** remain substance-, quantity-, use-, actor-, and
  date-specific. [REACH](https://eur-lex.europa.eu/eli/reg/2006/1907/oj/eng),
  [CLP](https://eur-lex.europa.eu/eli/reg/2008/1272/oj/eng), exposure scenarios,
  and German implementation must
  be checked for an actual activity; this software audit is not a compliance
  determination.
- The revised voluntary EU Safe and Sustainable by Design framework explicitly
  states that design principles can inspire innovation but do not themselves
  demonstrate safety or sustainability
  ([Commission Recommendation (EU) 2026/510](https://eur-lex.europa.eu/eli/reco/2026/510/oj/eng)).
  Yield, selectivity, atom economy, or catalytic elegance therefore cannot stand
  in for lifecycle safety and sustainability.

## Evidence and transfer discipline

### Status vocabulary

| Status | Meaning in this audit |
| --- | --- |
| **established** | the cited source demonstrates or formally derives the scoped chemical statement under declared conditions |
| **plausible translation** | the abstraction is consistent with the evidence but no cited source establishes a systems or AI advantage |
| **speculative** | the proposed composition still lacks a decisive equal-budget comparison |
| **disputed or rejected** | the generalization is unsupported, confuses levels, or fails a known boundary |

### Minimum extraction record

Every retained mechanism must specify:

1. molecular species, complexes, conformers, phases, and conserved moieties;
2. allowed reversible and irreversible reactions;
3. solvent, temperature, pressure, pH, ionic strength, concentration, light,
   potential, mixing, and time window where relevant;
4. equilibrium constants, rate constants, transport assumptions, and uncertainty;
5. template, catalyst, fuel, electrode, photon, or mechanical input;
6. product, waste, side reaction, deactivation, and reset path;
7. sampling, quench, separation, detector, calibration, processing, and structure
   assignment;
8. counterfactual intervention that distinguishes the proposed causal mechanism;
9. mature chemical, statistical, control, optimization, and AI nulls; and
10. complete compute, elapsed time, human work, measurement, energy, material,
    and lifecycle boundary.

If any item is absent, the observation may remain scientifically interesting,
but it cannot support an efficiency or architecture claim.

## Terminology firewall

1. **Thermodynamic stability** ranks states under a declared composition and
   environment. It does not say how quickly a state is reached.
2. **Kinetic accessibility** concerns paths and barriers on a stated timescale.
   A thermodynamically favored product can remain absent behind a barrier.
3. **Reversibility** means a reverse process is available on the relevant
   conditions and time window. A reversible bond is not automatically fast,
   selective, or self-correcting.
4. **Error correction in dynamic covalent synthesis** is re-equilibration of
   misassembled chemical products. It is not semantic error detection or proof
   verification.
5. A **template** changes a library's free-energy or kinetic landscape through
   specific interactions. It is not an external objective function unless that
   objective is exactly the measured molecular interaction.
6. **Amplification** is a change in abundance relative to a reference library.
   It is not universal optimization, truth, causal importance, or downstream
   usefulness.
7. **Molecular recognition** is scoped association/discrimination under an
   environment. Affinity, specificity, residence time, and catalytic competence
   are different quantities.
8. **Self-sorting** describes observed partitioning into preferred complexes or
   assemblies. “Narcissistic,” “social,” orthogonal, promiscuous, and scrambled
   outcomes are chemical classifications, not module-governance properties.
9. **Self-assembly** means components form organized structures through their
   interactions under stated conditions. It does not imply optimality,
   robustness, or absence of external preparation and control.
10. A **catalyst** alters a reaction pathway and rate while being regenerated in
    the ideal catalytic cycle. Real catalysts can deactivate, poison, leach,
    aggregate, or enter off-cycle states.
11. **Selectivity** must name the competing outcomes and denominator:
    chemo-, regio-, stereo-, site-, or temporal selectivity are not one scalar.
12. A **photoswitch** or redox switch occupies a distribution of states with
    finite conversion, fatigue, thermal relaxation, and readout uncertainty; it
    is not a perfect software bit.
13. **Photostationary state** is the light-dependent steady composition under a
    stated spectrum and intensity. It need not be a pure isomer.
14. **Alternating-current control** exploits electrode and reaction time scales.
    Frequency is not a context-free chemical instruction.
15. A **molecular ratchet** requires kinetic asymmetry and nonequilibrium driving
    to sustain directional current. Thermal noise alone cannot do net work in
    equilibrium.
16. **Chemical information** must identify an encoding, copying relation,
    decoder/measurement, error model, and physical carrier. A diverse mixture is
    not information merely because it contains many species.
17. **Structure elucidation** selects among structures consistent with available
    evidence. It differs from structure confirmation against a known reference.
18. **A spectrum** is an instrument- and protocol-qualified indication, not the
    molecular structure itself.
19. **Yield**, **conversion**, **selectivity**, **purity**, **atom economy**,
    **process mass intensity**, **hazard**, and **lifecycle impact** are separate
    ledgers.
20. **Autonomous laboratory operation** denotes bounded automated execution and
    decision-making. It does not establish independent scientific judgment or
    removal of human setup, maintenance, and exception work.

## Common mathematical boundary

### Reaction network and conservation

For concentration vector $x(t)$ in mol L$^{-1}$, stoichiometric matrix $N$, and
reaction-rate vector $v(x,u,\theta)$ in mol L$^{-1}$ s$^{-1}$,

$$
\frac{dx}{dt}=Nv(x,u,\theta)+q_{\mathrm{in}}-q_{\mathrm{out}}.
$$

$u$ contains declared control inputs and $\theta$ contains kinetic parameters.
The inlet and outlet terms $q_{\mathrm{in}}$ and $q_{\mathrm{out}}$ also have
units mol L$^{-1}$ s$^{-1}$ in this concentration-form equation; a volume-changing
reactor requires the corresponding dilution and volume balance.
For a closed conserved moiety with row vector $\ell^\top N=0$,
$\ell^\top x$ is constant. Open reservoirs, precipitation, sampling, gas loss,
adsorption, and unmeasured species must appear before claiming closure.

### Kinetics and equilibrium are different records

For an elementary step with rate constant $k$ and reactant concentrations
$x_i$,

$$
v=k\prod_i x_i^{\nu_i}.
$$

The units of $k$ depend on total reaction order. For a unimolecular reaction,
$k$ has s$^{-1}$; for a bimolecular reaction, L mol$^{-1}$ s$^{-1}$. For two
parallel, effectively irreversible first-order paths $A\rightarrow P_1$ and
$A\rightarrow P_2$ under a shared starting state,

$$
\frac{[P_1]}{[P_2]}\approx\frac{k_1}{k_2}
$$

before secondary chemistry matters. At equilibrium, a dimensionless equilibrium
constant $K$ is related to the standard Gibbs free-energy change by

$$
\Delta_r G^\circ=-RT\ln K,
$$

where $R$ is J mol$^{-1}$ K$^{-1}$ and $T$ is K. Replacing rates by equilibrium
weights, or vice versa, is a category error.

### Host–guest binding

For $H+G\rightleftharpoons HG$, an association constant commonly reported in
L mol$^{-1}$ is

$$
K_a=\frac{[HG]}{[H][G]}.
$$

Comparisons require the same standard-state convention, temperature, solvent,
salt, protonation, and activity treatment. In a simple 1:1 idealized system with
free guest concentration $[G]$, fractional host occupancy is

$$
f_{HG}=\frac{K_a[G]}{1+K_a[G]}.
$$

The formula does not cover competing guests, host aggregation, coupled
protonation, multiple stoichiometries, or transport barriers.

### Dynamic-library amplification

For library member $i$ with template and control concentrations held as declared,
define the dimensionless amplification factor

$$
A_i=\frac{x_i^{(+T)}}{x_i^{(-T)}}.
$$

$A_i>1$ records enrichment relative to the template-free condition. It does not
identify why enrichment occurred and does not by itself estimate a binding
constant. Mass balance, exchange network, phase partitioning, analytical response,
and uncertainty remain necessary. If $x_i^{(-T)}$ is below a registered
quantification limit, report a bound or censored value; do not create a finite
amplification factor with an unreported pseudocount.

### Temporal control and switching energy

For two photoswitch states $E$ and $Z$ under an effective irradiation protocol,

$$
\frac{d[Z]}{dt}=k_{E\rightarrow Z}(\lambda,I)[E]
-k_{Z\rightarrow E}(\lambda,I)[Z]-k_{\mathrm{th}}[Z],
$$

where the photochemical rates and thermal relaxation $k_{\mathrm{th}}$ have
s$^{-1}$. Wavelength $\lambda$ is m and irradiance $I$ is W m$^{-2}$. The
electrical work delivered to an electrochemical controller is

$$
E_{\mathrm{el}}=\int_0^T V(t)\,i(t)\,dt,
$$

with $V$ in volts, current $i$ in amperes, time in seconds, and energy in joules.
Power electronics, heating/cooling, mixing, monitoring, and downstream separation
are additional terms.

### Structure inference

Let $s$ be a candidate molecular structure, $y$ the processed observations,
$O_v$ the versioned observation operator, and $m$ the measurement model. A
candidate posterior is

$$
p(s\mid y,O_v,m)\propto p(y\mid s,O_v,m)p(s\mid m).
$$

A high posterior within an incomplete candidate set does not establish absolute
identity. Required outputs therefore include top-$k$ coverage, calibrated set
coverage, unresolved equivalence classes, and the expected value of an additional
orthogonal measurement.

## Mechanism audit

### 1. Reversible synthesis and chemical error correction

**Established observation.** Dynamic covalent synthesis uses exchangeable bonds
so that initial products can interconvert. In an oxime system, strongly acidic
conditions activated exchange and enabled high-yield catenane and macrocycle
assembly; neutral conditions largely switched exchange off and kinetically
trapped the products
([Shen et al. 2018](https://doi.org/10.1002/anie.201811025)). In a disulfide
system, changing self-assembly conditions produced either exceptional diversity
or specific autocatalytic emergence of one macrocycle
([Komáromy et al. 2017](https://doi.org/10.1021/jacs.7b01814)).

**Efficiency mechanism.** Exchange can replace exhaustive external placement:
mispaired components are released and reused while lower-free-energy assemblies
accumulate. If the number of wrong intermediates is large and local exchange is
cheap, this can reduce purification and synthesis steps in that chemistry.

**Transfer.** A software analogue may keep intermediate commitments reversible,
allow local constraint violations to be undone, and freeze a configuration only
after an acceptance gate. This is a plausible implementation pattern, not a new
principle.

**Proofreading boundary.** This reversible re-equilibration is not kinetic
proofreading. Energy-driven staged discrimination and its speed–error–dissipation
trade-off are already recorded in [C-159](../claims.md#c-159) and
[C-160](../claims.md#c-160); no new proofreading claim is created here.

**Mature nulls.** Backtracking, local repair, simulated annealing, MCMC,
constraint programming, transactional rollback, checkpoint/restart, and
reversible data structures already perform the abstract operation.

**Deduplication.** The mechanism composes
[P-003](../principle-registry.md#p-003--temporary-trace-before-commitment),
[P-004](../principle-registry.md#p-004--diversity-selection-and-protection),
[P-006](../principle-registry.md#p-006--homeostatic-negative-feedback), and
[P-009](../principle-registry.md#p-009--maintenance-plane). It is adjacent to
[Candidate 005](../../experiments/candidates/005-severity-ordered-containment.md),
[Candidate 006](../../experiments/candidates/006-reversible-physical-skill.md),
and [Candidate 010](../../experiments/candidates/010-reset-coupled-staged-verification.md),
but it does not add a distinct candidate.

**Failure boundary.** Kill the analogy when exchange is too slow, wrong states
are lower in free energy, phase separation hides inventory, freezing traps the
wrong product, reversibility destroys retention, or ordinary repair matches the
frontier after rollback and monitoring costs.

### 2. Dynamic combinatorial chemistry and template-conditioned selection

**Established observation.** A water-compatible disulfide library demonstrated
reversible macrocycle exchange
([Otto, Furlan & Sanders 2000](https://doi.org/10.1021/ja005507o)). Dynamic
libraries can respond to a template because binding changes the coupled
equilibrium or kinetics. A chemically fuelled oligomer library later showed
template-dependent oligomerization and protection from hydrolysis, but all
oligomers decayed after fuel depletion and the result depended on the declared
template, salt, concentration, and reaction cycle
([Kriebisch et al. 2024](https://doi.org/10.1038/s41557-024-01570-5)).

Mechanical conditions can also become selection conditions. Agitation and
mechanically induced fibre breakage changed which self-replicating macrocycles
emerged in a dynamic library
([Carnall et al. 2010](https://doi.org/10.1126/science.1182767)). The apparatus
was not a neutral observer of “fitness.”

**Efficiency mechanism.** A template-coupled library can perform generation,
competition, and enrichment in the same physical mixture, potentially avoiding
separate enumeration and scoring of every member.

**Transfer.** A candidate system could maintain a reversible population whose
composition responds to a task-specific constraint. This is P-004-style
generate–select under a physical evaluator.

**Mature nulls.** Enumerative search, Bayesian optimization, evolutionary and
quality-diversity search, multi-armed bandits, energy-based models, differentiable
relaxation, particle filters, and equilibrium solvers.

**Deduplication.** The residual belongs to P-004 and to
[Candidate 004](../../experiments/candidates/004-closed-endogenous-curriculum.md).
Fuel and transient lifetime are already bounded by [C-162](../claims.md#c-162)
and [C-166](../claims.md#c-166); amplification and competition are already
bounded by [C-163](../claims.md#c-163).

**Failure boundary.** Reject “self-optimization” when abundance follows
solubility, phase protection, analytical response, agitation, or replication
speed rather than the registered task; when the best member is absent from the
library; or when digital search wins at equal evaluations and total energy.

### 3. Self-sorting and orthogonal interaction channels

**Established observation.** A six-motif hydrogen-bonding system produced
sequential self-sorting cascades containing high-fidelity and promiscuous
recognition, narcissistic and social sorting, parallel cascades, and cross-talk
([Coubrough et al. 2019](https://doi.org/10.1002/chem.201804791)). The result
depended on experimentally and computationally characterized pair interactions;
“orthogonal” was an empirical property of that component set, not a universal
guarantee.

**Efficiency mechanism.** Compatible interfaces can restrict the combinatorial
interaction graph without a central dispatcher. Strongly separated interaction
energies can make many incompatible pairings short-lived or absent.

**Transfer.** Typed local interfaces, capability matching, or receiver-specific
codes may produce modular coalitions with limited global coordination.

**Mature nulls.** Type systems, capability security, bipartite and hypergraph
matching, constraint satisfaction, modular routers, mixture-of-experts gates,
schema registries, and explicit compatibility matrices.

**Deduplication.** This is primarily
[P-008](../principle-registry.md#p-008--compartmentalized-interaction) with
[P-001](../principle-registry.md#p-001--selective-allocation) and
[P-011](../principle-registry.md#p-011--transient-communication-coalitions).
Protocol evolution and repair are already held under
[Candidate 015](../../experiments/candidates/015-versioned-repairable-conventions.md).

**Failure boundary.** Kill the transfer if the local affinities merely encode
the complete answer, if near-degenerate or new components cause uncontrolled
scrambling, if a central matcher is cheaper, or if cross-talk is hidden by
reporting only the intended products.

### 4. Host–guest recognition is environment- and path-qualified

**Established observation.** In cucurbit[6]uril host–guest systems, increasing
salt concentration and cation competition reduced both binding constants and
ingression rates; guest size and protonation affected the barrier and whether
complexation occurred on the observed timescale
([Márquez, Hudgins & Nau 2004](https://doi.org/10.1021/ja0319846)). This is a
direct counterexample to treating a recognition score as an immutable property
of a pair.

**Efficiency mechanism.** A host can concentrate, protect, orient, or exclude a
guest using local physical interactions, sometimes moving selectivity into
geometry and solvent response rather than active computation.

**Transfer.** Context-qualified affinity resembles a router whose decision
depends jointly on candidate, receiver state, medium, and access barrier. The
useful lesson is to carry that context, not to copy a cavity metaphor.

**Mature nulls.** Calibrated classifiers, conditional likelihoods, hierarchical
Bayesian models, explicit context features, state-space models, constraint gates,
and abstaining out-of-distribution detectors.

**Deduplication.** Broad molecular-recognition limits already appear in
[C-158](../claims.md#c-158). The durable systems destination is
[Candidate 014](../../experiments/candidates/014-versioned-observation-contract.md)
and [Fixture F-011](../../experiments/fixtures/011-operator-qualified-active-chemical-sensing.md),
not a new binding principle.

**Failure boundary.** Reject a generalization trained in one medium if the rank
order changes under plausible salt, pH, temperature, counterion, concentration,
or aggregation conditions; reject any inference that confuses equilibrium
occupancy with ingress rate or residence time.

### 5. Catalysis and mechanistic inference are pathway-qualified

**Established observation.** A catalyst can change activation barriers and the
relative rates of competing paths without changing the equilibrium constant of
the overall reaction. Reaction-progress kinetic analysis uses concentration and
rate profiles, perturbations, and explicit rate models to diagnose features such
as catalyst order, product inhibition, and catalyst deactivation
([Blackmond 2005](https://doi.org/10.1002/anie.200462544)). The inference is
conditional on the proposed network, measurement model, mixing and transport
regime, and parameter identifiability. A fitted curve is not by itself a unique
mechanism.

**Efficiency mechanism.** Catalysis can substitute a lower-barrier sequence for
an otherwise slow transformation. Selectivity can avoid separation and rework
when the catalyst suppresses competing pathways under the actual process
conditions.

**Plausible translation.** Reusable specialist operators could expose
condition-dependent capability, deactivation, off-cycle states, and route
selectivity rather than being treated as immutable functions. The chemical
evidence does not establish that such an abstraction beats an ordinary typed
operator, planner, or controller.

**Mature nulls.** Explicit finite-state machines, typed functions, sparse
mixture-of-experts, causal graphs, system identification, nonlinear least
squares, Bayesian model comparison, profile likelihood, reaction-network
inference, and model-predictive control.

**Deduplication.** Catalytic bottlenecks and transport qualification are already
bounded by [C-1283](../claims.md#c-1283). Local specialization belongs under
[P-001](../principle-registry.md#p-001--selective-allocation), while context and
degradation belong under [P-006](../principle-registry.md#p-006--homeostatic-negative-feedback)
and [P-009](../principle-registry.md#p-009--maintenance-plane). No new principle
is warranted.

**Failure boundary.** Reject any architecture claim that follows only from a
lower activation barrier metaphor; any mechanistic claim whose alternatives are
observationally equivalent under the sampled interventions; or any efficiency
claim that omits catalyst preparation, recovery, poisoning, transport,
separation, and analytical confirmation.

### 6. Photochemical and electrochemical inputs provide temporal control, not free logic

**Established observation.** Zhao, Neubauer and Feringa switched the chirality
of a phosphine ligand with light and thereby changed the sense of asymmetric
catalysis in a scoped reaction system
([2015](https://doi.org/10.1038/ncomms7652)). Gunasekera and colleagues varied
alternating-current frequency to favor one- or two-electron oxidation pathways
in a scoped amine functionalization, demonstrating that the relation between
electrode timing and reaction kinetics can change product distribution
([2022](https://doi.org/10.1021/jacs.2c02605)). These are controlled chemical
results, not evidence that photons or waveforms are universal program tokens.

**Efficiency mechanism.** An external signal can change a molecular state or
the temporal availability of an electron-transfer step without replacing the
whole reaction mixture. When switching is selective and reversible, one
prepared system can implement more than one bounded reaction policy.

**Plausible translation.** A sparse system may use a small global context signal
to retune already-local components, provided the achieved component state,
latency, decay, control authority, and energy are measured. This sharpens the
control contract already considered in the project; it is not a new routing
principle.

**Mature nulls.** Bang-bang control, gain scheduling, hybrid automata,
finite-state controllers, PID, model-predictive control, Bayesian optimization
of schedules, event-triggered control, and explicit context broadcasting.

**Deduplication.** The transfer composes
[P-006](../principle-registry.md#p-006--homeostatic-negative-feedback),
[P-010](../principle-registry.md#p-010--structural-offloading-and-co-design), and
[P-011](../principle-registry.md#p-011--transient-communication-coalitions).
Candidate homes are
[Candidate 002](../../experiments/candidates/002-multiscale-context-broadcast.md),
[Candidate 006](../../experiments/candidates/006-reversible-physical-skill.md),
and [Candidate 012](../../experiments/candidates/012-latency-qualified-authority.md).

**Failure boundary.** The control state is the measured state distribution, not
the requested illumination or voltage. Count incomplete photoconversion,
spectral cross-talk, thermal relaxation, fatigue, electrochemical double-layer
charging, electrode fouling, mass transport, actuator saturation, sensor lag,
and switching energy. Kill the transfer if an ordinary controller reaches the
same quality-cost frontier.

### 7. Fuelled molecular ratchets require kinetic asymmetry and a closed work ledger

**Established observation.** Wilson and colleagues demonstrated an autonomous
chemically fuelled small-molecule motor in which directionality arose from a
reaction cycle with kinetic asymmetry and an irreversible fuel-to-waste process
([2016](https://doi.org/10.1038/nature18013)). Neither Brownian motion nor fuel
consumption alone supplies useful direction. At equilibrium, microscopic
reversibility forbids a persistent cycle current.

**Efficiency mechanism.** A deliberately asymmetric cycle can rectify
fluctuations while a chemical potential difference is maintained. The useful
quantity is directional progress per total supplied free energy, not motion or
turnover alone.

**Plausible translation.** A system may turn transient resource gradients into
ordered work by assigning different forward and reverse transition barriers.
Any computational analogue must expose its driving reservoir, dissipation,
readout, reset, and error current.

**Mature nulls.** Markov decision processes, finite-state controllers, queueing
policies, asynchronous state machines, biased random walks, stochastic pumps,
and feedback control evaluated at the same external work budget.

**Deduplication.** Nonequilibrium driving and transient lifetime are already
bounded by [C-162](../claims.md#c-162), [C-166](../claims.md#c-166), and
[C-172](../claims.md#c-172). Structural work belongs under
[P-010](../principle-registry.md#p-010--structural-offloading-and-co-design); the closest test
homes are [Candidate 006](../../experiments/candidates/006-reversible-physical-skill.md)
and [Fixture F-010](../../experiments/fixtures/010-boundary-qualified-physical-computation.md).

**Failure boundary.** A model that produces nonzero steady current with zero
affinity, silently resets state, counts the controller's work only for one arm,
or reports gross transitions instead of net cycles fails before comparison.

### 8. Structure elucidation is a versioned candidate-set inverse problem

**Established observation.** The DP4 method uses computed and experimental NMR
chemical shifts to assign a probability over proposed diastereomers
([Smith & Goodman 2010](https://doi.org/10.1021/ja105035r)). Blind trials of
computer-assisted structure-elucidation systems showed that software could
generate or rank useful candidate structures but also exposed dependence on the
supplied molecular formula, spectral interpretation, databases, and operator
workflow ([Moser et al. 2012](https://doi.org/10.1186/1758-2946-4-5)). Neither
source licenses “a spectrum uniquely contains the structure.”

**Efficiency mechanism.** Orthogonal observations eliminate incompatible
candidates. A calibrated measurement chosen for expected discrimination can
shrink the set without exhaustively performing every available assay.

**Plausible translation.** Carry a versioned candidate set and observation
operator rather than collapsing uncertain evidence into a permanent fact. Ask
for an additional measurement when its expected reduction in ambiguity exceeds
its declared cost.

**Mature nulls.** Constraint propagation, exact graph enumeration, database
search, nearest-neighbour retrieval, Bayesian model selection, conformal sets,
active feature acquisition, information-gain experimental design, and ordinary
data/model versioning.

**Deduplication.** The architectural destination is
[P-007](../principle-registry.md#p-007--prediction-error-allocation) with
[P-013](../principle-registry.md#p-013--externalized-shared-state),
[Candidate 014](../../experiments/candidates/014-versioned-observation-contract.md),
[Fixture F-007](../../experiments/fixtures/007-operator-qualified-optical-inference.md),
and [Fixture F-011](../../experiments/fixtures/011-operator-qualified-active-chemical-sensing.md).

**Failure boundary.** Reject false uniqueness, posterior probabilities over an
undisclosed or incomplete candidate set, random molecule-level splits that leak
scaffolds, spectra generated from the answer labels without a measurement
operator, or reuse of an assignment after the instrument, processing, or sample
version changes.

### 9. Closed-loop reaction design and synthesis planning are mature nulls

**Established observation.** Bayesian optimization has been used for bounded
reaction-condition optimization with experimental campaigns
([Shields et al. 2021](https://doi.org/10.1038/s41586-021-03213-y)). Learned
reaction models combined with symbolic search have been demonstrated for
retrosynthetic planning
([Segler, Preuss & Waller 2018](https://doi.org/10.1038/nature25978)). Automated
platforms have executed machine-learning-guided reaction discovery
([Granda et al. 2018](https://doi.org/10.1038/s41586-018-0307-8)) and mobile
robotic search over a physical experimental space
([Burger et al. 2020](https://doi.org/10.1038/s41586-020-2442-2)). These scoped
capabilities are evidence that generate–test–update is already an engineering
baseline, not evidence that laboratory automation has solved chemistry.

**Efficiency mechanism.** A surrogate or planner can concentrate expensive
measurements in promising or informative regions, reuse reaction knowledge, and
schedule instruments. Gains depend on representation, prior data, objective,
noise, constraints, and the cost of confirmation.

**Plausible translation.** The project can retain chemical selection only if a
new mechanism beats these established optimization, planning, and automation
baselines on held-out families at an equal measurement and total-resource
budget.

**Mature nulls.** Random and Latin-hypercube design, factorial design, response
surfaces, Gaussian-process and tree-structured Bayesian optimization,
evolutionary and quality-diversity search, multi-armed bandits, Monte Carlo tree
search, constraint solvers, active learning, and laboratory schedulers.

**Deduplication.** Closed-loop selection is already represented by
[Candidate 004](../../experiments/candidates/004-closed-endogenous-curriculum.md),
observation contracts by
[Candidate 014](../../experiments/candidates/014-versioned-observation-contract.md),
while full experimental resource accounting is already part of Candidate 004.
No “chemical optimizer” candidate is added.

**Failure boundary.** Kill a claimed gain if the candidate receives more
experiments, warmer initialization, privileged descriptors, safer feasible
regions, different confirmation rules, or uncounted human intervention; or if
the gain disappears when entire substrate, catalyst, or response-surface
families are held out.

## Mature-null stack and residual novelty

The following table prevents chemistry-shaped relabelling of existing methods.

| Chemical observation | Required mature null | Residual worth testing |
| --- | --- | --- |
| reversible error correction | backtracking, local repair, MCMC, simulated annealing, exact constraint solver | whether local exchange reaches equal quality with less retained state or control work |
| dynamic-library amplification | exhaustive scoring, evolutionary/QD search, bandit, equilibrium solver | whether coupled selection and exchange saves evaluations after assay and apparatus bias are exposed |
| self-sorting | type system, compatibility matrix, matching/CSP, learned router | whether local interfaces reduce global communication without encoding the answer |
| context-sensitive binding | conditional/hierarchical model, calibrated abstention | whether a portable observation contract prevents invalid reuse under new contexts |
| catalytic pathway choice | typed operator, explicit reaction graph, system identification | whether condition-aware specialization beats conventional modular planning |
| optical/electrical switching | hybrid controller, PID/MPC, schedule optimization | whether a sparse control signal improves the quality-cost frontier after switching losses |
| fuelled ratchet | finite-state controller, biased walk, equal-work feedback policy | whether kinetic asymmetry delivers more net progress per complete work ledger |
| structure elucidation | candidate enumeration, Bayesian ranking, conformal set, active sensing | whether versioned operator-qualified sets reduce false uniqueness or measurements |
| reaction discovery/planning | design of experiments, BO, evolutionary search, MCTS | whether the proposed loop generalizes at equal experiments and confirmation cost |

**Residual novelty criterion.** A transferable result exists only when it (a)
survives the chemistry-specific hostile cases, (b) beats the strongest mature
null at a paired total budget, (c) uses no answer-encoding affinity or reaction
matrix, and (d) produces a reusable systems mechanism more precise than the
chemical metaphor. Otherwise the result remains a field observation or an
implementation motif under an existing principle.

## Common CPU-only workstation contract

All eight tracks below are **synthetic software tests**, not molecular
simulations asserted to predict a laboratory result. Their purpose is to test
the proposed systems abstraction under chemical boundary conditions.

### Frozen runtime and accounting

- **Runtime:** Python 3.12 or newer, NumPy and SciPy; NetworkX and scikit-learn
  may be pinned in the fixture lock file. Any additional solver must have a
  CPU-only open-source implementation and a recorded version.
- **Hardware:** one logical CPU per arm; no GPU, network, web service, hidden
  pretrained model, or interactive tuning during confirmatory runs.
- **Memory and timeout:** at most 2 GiB peak resident memory and 60 s wall time
  per episode. A timeout is a failure with the worst registered utility, not a
  discarded sample.
- **Pilot budget:** at most 4 CPU-h and 2 h human tuning per fixture. Pilot seeds
  and generator families are development data and can never enter confirmation.
- **Confirmation budget:** 30 paired seeds per registered regime, at most 12
  CPU-h per fixture and 30 min launch/triage work. Arms receive identical
  instances, observations, stopping rules, and measurement budgets.
- **Resource record:** wall time, process CPU time, peak resident memory, bytes
  read/written, number and size of retained states, simulated measurements,
  algorithmic operations, manual interventions, and failure reason. Human time
  is recorded by role and activity. Energy is reported only from a declared
  meter or supported CPU package counter; otherwise CPU time and hardware are
  reported and joules are **not inferred** from a nominal TDP.
- **Randomness:** the generator seed, arm seed, library versions, CPU model,
  thread count, and deterministic/nondeterministic flag are stored with every
  result. Paired comparisons share an instance seed but not mutable arm state.

### Splits and statistical gate

The unit of generalization is a complete generator family, not an individual
sample. A fixture manifest freezes disjoint development, validation, and
confirmation family IDs before confirmatory execution. No hyperparameter,
threshold, feature transform, failure handler, or timeout changes after seeing
confirmation outcomes.

For quality metric $Q$ (higher is better) and cost metric $C$ (lower is better),
the candidate must satisfy both

$$
Q_{\mathrm{cand}}-Q_{\mathrm{best\ null}}\geq-\delta_Q
\quad\text{and}\quad
\frac{C_{\mathrm{cand}}}{C_{\mathrm{best\ null}}}\leq 0.80,
$$

or a fixture-specific stricter rule. Here $\delta_Q$ is registered before the
run in the native metric; it is never chosen from observed variance. Report the
paired median difference, a two-sided 95% percentile bootstrap interval over
family-level paired effects, and every family result. This interval is a
decision aid, not a claim of universal frequentist coverage with 30 seeds.
Passing requires the lower confidence bound to clear the quality
non-inferiority margin and the upper confidence bound of the cost ratio to be
at most 0.80 in at least four of six confirmatory families, with no declared
safety or conservation violation. Correct for the eight fixture-level primary
tests with Holm's method if confirmatory $p$-values are used to present a
combined research claim; preregister one primary inferential contrast per
fixture. The fixture-level success/kill decisions themselves remain effect-size
and interval based.

The **best null** is selected on validation data from all registered null arms;
the candidate is not compared only with the weakest baseline. All primary and
secondary metrics, exclusions, and ties remain visible.

## F-MCS-01 — Reversible assembly versus repair and exact search

**Question.** Does locally reversible exchange produce feasible assemblies with
less search or retained state than mature repair and constraint-solving methods,
without encoding the solution in bond energies?

### Generator

1. Draw $n\in\{24,32,48,64,96\}$ labelled parts, $q\in\{3,5,8,12\}$ interface
   types, and a target degree distribution with maximum degree four.
2. Development and validation use pilot-only path-with-side-constraints and
   bipartite-block generators. The six sealed confirmation families are planted
   modular, frustrated rings, sparse random, repeated symmetric motifs,
   hierarchical, and nonstationary compatibility.
3. Separately draw dimensionless pair free energies $\Delta G_{ij}/(k_BT)$,
   forward barriers $E^\ddagger_{ij}/(k_BT)$, and dimensionless defect penalties
   from family-level distributions.
   Enforce only a rank correlation $\rho\in\{0,0.3,0.6,0.9\}$ between energetic
   preference and target compatibility; $\rho=0$ is the anti-answer control.
4. A Gillespie-style exchange process proposes bond formation, cleavage, and
   swap events with rates proportional to the registered barriers. A freeze
   time $t_f$ irreversibly reads the current assembly.
5. A solution is feasible only if degree, type, exclusivity, and registered
   global constraints hold. The objective combines declared task reward and
   defect cost; the generator retains the exact optimum for $n\leq32$ and a
   certified bound or fixed reference search for larger $n$.

### Arms

1. irreversible greedy assembly;
2. greedy assembly plus bounded local repair;
3. depth-bounded backtracking/CSP;
4. simulated annealing;
5. Metropolis exchange using the same energy information as the candidate;
6. **candidate:** local reversible exchange plus a registered freeze rule; and
7. oracle energy control, which may use target-derived energies but is reported
   only to expose answer encoding and cannot win the test.

### Split, metrics, and costs

- **Split:** development and validation use separately seeded and parameterized
  pilot-only path and bipartite families; confirmation contains only the six
  sealed families above with unseen $n$, $\rho$, barrier, and freeze-time
  combinations.
- **Primary quality:** feasible-solution rate, then normalized optimality gap
  conditional on feasibility. Register $\delta_Q=0.02$ feasible-rate points and
  a two-percentage-point optimality-gap margin.
- **Primary cost:** total proposed transformations plus constraint checks; the
  20% reduction gate applies to their unweighted sum after each component is
  normalized by the irreversible-greedy median on validation.
- **Secondary:** defect count, productive transformations, reverse events,
  rollback depth, retained bytes, wall/CPU time, peak memory, convergence time,
  and post-freeze drift if the readout is delayed.
- **Work bound:** $10^5$ event/constraint proposals per episode. Every arm stops
  at the same bound or earlier on a registered certificate.

### Hostile cases and decision

Hostile cases are kinetic traps, nearly degenerate products, a misleading free-
energy landscape ($\rho=0$), an early or late freeze, changed compatibility after
assembly, and an unmodelled defect class revealed only at readout.

**Success:** the common paired gate is met in at least four of six families and
also at $\rho\leq0.3$, with no conservation violation and without the oracle
energy control. **Kill:** an exact or conventional stochastic null reaches the
same frontier; performance requires energies derived from the target; exchange
continues to erase useful products; the result depends on one tuned freeze time;
or any apparent saving comes from fewer validity checks.

## F-MCS-02 — Template-selected dynamic library under assay bias

**Question.** Does coupled exchange and template selection find useful library
members with fewer true evaluations than standard search once reaction,
solubility, and analytical biases are explicit?

### Generator

1. Draw $m\in\{4,6,8\}$ building-block types and enumerate or sample
   $N\in\{16,32,64\}$ cyclic or linear library members with conserved block
   counts.
2. Draw reversible exchange rates in s$^{-1}$ from a log-normal family and
   hidden dimensionless true task utilities $u_i$. Draw template binding free
   energies $b_i/(k_BT)$ with registered
   Spearman correlation $r\in\{-0.4,0,0.4,0.8\}$ to $u_i$.
3. Generate equilibrium or finite-time composition with a mass-action ODE or a
   Gillespie process. The observed peak area is
   $y_i=s_i d_i x_i+\epsilon_i$, where $s_i$ is solubility/recovery, $d_i$ is
   detector response, $x_i$ is abundance, and $\epsilon_i$ is heteroscedastic
   noise. Only an explicit costly confirmation reveals $u_i$.
4. Pilot-only libraries use unbiased equilibrium exchange and a monotone
   template–utility relation. The six sealed confirmation families are:
   finite-rate kinetic trapping; solubility/detector bias; template protection
   plus fuel depletion; phase sequestration; shear-dependent replication; and
   a missing or template-misaligned best member. The generator records mass
   balance and the causal intervention for each factor.

### Arms

1. exhaustive true-utility evaluation when the budget permits;
2. random sampling;
3. evolutionary/quality-diversity search over member descriptors;
4. Gaussian-process Bayesian optimization;
5. multi-armed bandit with the same noisy assay;
6. equilibrium solver followed by abundance ranking; and
7. **candidate:** exchange/template loop with abundance, bias correction, and
   registered confirmatory measurements.

### Split, metrics, and costs

- **Split:** development and validation use only disjoint pilot-library
  topologies and parameter grids. Confirmation holds out all six families above,
  their complete topology and response-bias generators, and unseen combinations
  of the four registered $r$ regimes.
- **Budget:** 16 noisy assays and four true-utility confirmations per episode;
  exhaustive search is capped and marked budget-infeasible rather than granted
  extra observations.
- **Primary quality:** probability that the confirmed top choice lies in the
  true top 10% and simple regret $\max_i u_i-u_{\hat{i}}$; register a 0.02 recall
  non-inferiority margin.
- **Primary cost:** true-utility confirmations, then noisy assays; a claimed
  efficiency gain must reduce confirmations by at least 20% at fixed assay
  budget or reduce total assays by 20% at fixed confirmations.
- **Secondary:** template amplification factor, rank correlation between
  abundance and $u_i$, mass-balance residual, solver steps, wall/CPU time,
  detector calibrations, and false-selection rate attributable to each bias.

### Hostile cases and decision

Hostile cases include the best member absent from the library, strongest binder
having poor utility, detector saturation, phase loss, template depletion,
finite-time non-equilibrium sampling, degradation protection, fuel exhaustion,
and agitation changing replication.

**Success:** the candidate clears the common gate in four of six held-out
families including $r\leq0$, and a causal ablation shows that its gain comes from
exchange/selection rather than hidden true-utility access. **Kill:** amplification
is used as the objective without confirmation; mass does not close; the winner
follows detector/phase bias; ordinary BO/evolutionary search matches it; or the
method fails when the best binder and best task member differ.

## F-MCS-03 — Self-sorting, promiscuity, and communication cost

**Question.** Can local typed affinities form task-appropriate coalitions with
less coordination than explicit matching while retaining robustness to
promiscuity and new component types?

### Generator

1. Draw $n\in\{32,64,128,256\}$ agents with one to four interfaces and a hidden
   task hypergraph of pairs, rings, or teams of size three to six.
2. Generate an interaction matrix $A$ independently from the task graph with
   alignment $\rho\in\{0,0.25,0.5,0.75\}$. Each encounter has association and
   dissociation rates; agent concentration changes encounter frequency.
3. Pilot-only generators contain simple disjoint pairs and fixed triplets. Six
   sealed confirmation families define narcissistic pairing, social
   complementary pairing, parallel orthogonal channels, nested hierarchy,
   promiscuous motifs, and temporal turnover. New interface types appear only in
   confirmation.
4. No arm may read the hidden task graph except through its declared task
   observations. A separate oracle $A$ derived from the task graph diagnoses
   answer encoding and cannot count as a successful candidate.

### Arms

1. centralized min-cost matching/hypergraph heuristic;
2. explicit typed capability registry;
3. constraint solver with the same task observations;
4. learned router trained only on development families;
5. random local encounters; and
6. **candidate:** local self-sorting with association/dissociation and bounded
   repair of cross-talk.

### Split, metrics, and costs

- **Split:** development and validation contain only disjoint pilot-family IDs.
  Confirmation holds out all six complete families above plus unseen types,
  concentration schedules, and turnover rates.
- **Primary quality:** fraction of required task hyperedges satisfied minus the
  fraction of forbidden cross-talk edges; register a 0.02 non-inferiority
  margin.
- **Primary cost:** total globally addressed messages plus globally visible
  registry bytes. Local encounter messages and affinity-table bytes are reported
  separately and included in total CPU/energy accounting.
- **Secondary:** unbound fraction, promiscuous complexes, time to stable task
  completion, reconfiguration recovery, local messages, pair checks, memory,
  wall/CPU time, and unfair load concentration.
- **Budget:** at most $50n$ encounter or routing proposals and $10n$ messages per
  episode for every arm.

### Hostile cases and decision

Hostile cases are near-degenerate affinities, concentration imbalance,
promiscuous components, an adversarial new type, disappearance of a hub, rapid
turnover, and task/affinity anticorrelation.

**Success:** quality is non-inferior while globally addressed communication and
registry storage fall by at least 20% in four of six families, including unseen
types and promiscuity. **Kill:** the affinity matrix encodes the final grouping;
total rather than merely global communication increases; cross-talk is hidden;
the method cannot release obsolete coalitions; or explicit matching wins the
paired frontier.

## F-MCS-04 — Context-qualified binding and invalidation

**Question.** Does a versioned observation contract prevent invalid reuse of
recognition scores more efficiently than ordinary context features, calibration,
and abstention?

### Generator

1. Draw 12–48 hosts, 24–192 guests, and contexts with salt, pH, temperature,
   competitor concentration, and instrument/protocol version.
2. Let $K^\circ=1$ L mol$^{-1}$ and generate the dimensionless latent response
   $\kappa_{hgc}=\log_{10}(K_{a,hgc}/K^\circ)=\alpha_h+\beta_g+z_c^\top\gamma+\eta_{hg}+\xi_{hgc}$,
   with family-specific interactions and optional rank reversals. Separately
   generate ingress and egress barriers so affinity, on-rate, and residence time
   cannot be interchanged.
3. Produce equilibrium occupancy or finite-time signal through a nonlinear,
   versioned measurement operator with heteroscedastic error, censoring, and
   occasional aggregation.
4. Pilot-only data use additive effects, no rank reversal, and a stable linear
   operator. Six sealed confirmation families are: context interpolation,
   complete-host holdout, complete-guest holdout, crossed-pair interaction
   holdout, environmental rank reversal, and operator-version shift.

### Arms

1. context-free pair lookup;
2. linear model with explicit context;
3. hierarchical Bayesian partial-pooling model;
4. random forest or Gaussian process with calibrated intervals;
5. conformal/uncertainty abstention wrapper; and
6. **candidate:** Candidate 014-style versioned observation contract with
   explicit validity scope and invalidation on context/operator change.

### Split, metrics, and costs

- **Split:** development and validation use disjoint pilot hosts, guests, and
  operators. Confirmation uses only the six sealed families above; no pair,
  scaffold, context regime, operator version, or replicate from a held-out group
  may enter training or calibration.
- **Primary quality:** held-out $\kappa$ RMSE and top-10% guest recall at 90%
  empirical interval coverage. Register margins of 0.05 log units RMSE and 0.02
  recall points.
- **Primary cost:** invalid downstream decisions per 1,000 predictions plus
  required remeasurements. A 20% reduction is required at non-inferior predictive
  quality and equal abstention opportunity.
- **Secondary:** rank correlation, on/off-rate RMSE, interval width, calibration
  error, abstention rate, stale-result reuse, model bytes, update time, CPU/wall
  time, and human review events.
- **Budget:** at most 500 training measurements and 32 active remeasurements per
  episode; all arms receive the same original records and can request from the
  same pool.

### Hostile cases and decision

Hostile cases include pH-induced protonation change, salt competition, rank
reversal, access barrier without affinity change, slow ingress mistaken for no
binding, aggregation, detector drift, and an operator-version change with
unchanged column names.

**Success:** the contract reduces stale invalid decisions or remeasurements by at
least 20% beyond the strongest explicit-context plus calibration null across
four of six family splits, including the operator-version holdout. **Kill:** the
same behavior is obtained by ordinary metadata/versioning; context is leaked
through IDs; abstention rather than better scoping explains all gains; affinity
and kinetics are conflated; or operator change is detected only because its
answer label is exposed.

## F-MCS-05 — Temporally switched reaction control

**Question.** Can sparse regime switching improve a reaction-control frontier
beyond conventional schedule optimization and model-predictive control after
switching lag, fatigue, and sensing costs are counted?

### Generator

For each episode, integrate the nonnegative normalized state
$x=(A,I,P,Q,D)$ for precursor, intermediate, desired product, side product, and
deactivated-controller fraction. $A$, $I$, $P$, $Q$, and $D$ are dimensionless,
time is in seconds, and every $k$ below has units s$^{-1}$:

$$
\begin{aligned}
\dot A &=-k_1(s,t)A-k_q(s,t)A,\\
\dot I &= k_1(s,t)A-k_2(s,t)I-k_d(s,t)I,\\
\dot P &= k_2(s,t)I,\\
\dot Q &= k_q(s,t)A+k_d(s,t)I,\\
\dot D &= k_f(s,t)(1-D).
\end{aligned}
$$

The requested switch $u(t)\in[0,1]$ produces an achieved state
$\tau_s\dot s=u-s$; $D$ attenuates the rate modulation. Draw base rates,
switch-response vectors, $\tau_s$, fatigue, observation lag, noise, and hazard
thresholds. Pilot-only families have a single smooth switching response or a
static two-stage optimum. The six sealed confirmation families are clean
separation, narrow timing window, overreaction, delayed sensor, parameter drift,
and actuator saturation. Preserve $A+I+P+Q=1$ within numerical tolerance; $D$
is a controller-state fraction and is not part of that material balance.

### Arms

1. best constant $u$ selected on validation;
2. fixed two-stage schedule from a validation grid;
3. bang-bang controller with the same observations;
4. PID or gain-scheduled feedback;
5. constrained model-predictive control using the registered nominal model;
6. Bayesian schedule optimization under the same episode budget; and
7. **candidate:** Candidate 012-style event-triggered regime gate with a sparse
   context broadcast, explicit achieved-state estimator, and fallback.

### Split, metrics, and costs

- **Split:** development and validation use only disjoint pilot-family IDs and
  parameter grids. Confirmation holds out all six complete families above,
  including unseen lag/drift/fatigue combinations.
- **Primary quality:** terminal desired yield $P(T)$ subject to
  $Q(T)\leq0.10$ and zero time above the registered hazard envelope. Register a
  0.02 yield non-inferiority margin.
- **Primary cost:** controller evaluations plus sensor reads plus switch
  commands, normalized by their validation medians. The candidate must reduce
  this control work by at least 20% relative to the strongest safe null.
- **Secondary:** selectivity $P/(P+Q)$, unreacted $A+I$, integrated hazard,
  requested/achieved-state mismatch, switches, fallback use, ODE evaluations,
  CPU/wall time, retained state, and the simulated switching-work proxy. The
  proxy is not labelled physical energy.
- **Budget:** 200 integration intervals, at most 40 sensor reads, and at most 20
  switch commands. Arms violating a budget enter fallback and retain the cost.

### Hostile cases and decision

Hostile cases are sensor delay longer than the useful window, incomplete state
conversion, fatigue, rate drift after the validation regime, noisy false
threshold crossings, actuator saturation, exotherm-proxy excursions, and a
control action that accelerates both desired and side paths.

**Success:** safe yield is non-inferior to the best of MPC, PID, and optimized
schedule while control work falls by at least 20% in four of six families,
including drift and delayed sensing. **Kill:** MPC or schedule optimization
matches the frontier; benefit vanishes when achieved rather than commanded state
is used; safety depends on hidden true concentrations; fallback performs the
actual work but is omitted; or switching cost reverses the claimed gain.

## F-MCS-06 — Nonequilibrium ratchet with work, reset, and readout

**Question.** Does a kinetically asymmetric stochastic cycle deliver more
correct net progress per complete supplied-work ledger than equal-work
open-loop and feedback controllers?

### Generator

1. Pilot-only generators use three- and five-state rings with fixed monotone
   barriers. Sealed confirmation generators draw a ring with
   $n\in\{4,6,8,12\}$ states and clockwise/counter-clockwise transition rates.
   For every edge enforce local detailed balance,

   $$
   \log\frac{k^+_i}{k^-_i}
   =-\frac{\Delta E_i}{k_B T}+\nu_i\frac{\Delta\mu}{k_B T},
   $$

   where $\sum_i\Delta E_i=0$, $\nu_i$ is the signed fuel stoichiometry, and
   $\Delta\mu$ is supplied affinity per fuel event. $\Delta E_i$ and
   $\Delta\mu$ are in joules per event, $k_B$ is J K$^{-1}$, $T$ is K, and
   $\nu_i$ is dimensionless.
2. The six sealed confirmation families are uniform ring, single high barrier,
   distributed kinetic asymmetry, state-observation noise, fuel pulses, and load
   opposing the desired direction.
3. Simulate a continuous-time Markov chain for a fixed horizon and record every
   transition, fuel event, read, controller action, reset, and boundary crossing.
4. Run mandatory equilibrium controls with $\Delta\mu=0$ and long horizons. A
   statistically persistent current there indicates a generator or accounting
   error, not a discovery.

### Arms

1. equilibrium chain with no drive;
2. constant-affinity open-loop drive;
3. periodic stochastic pump with matched external work;
4. feedback controller with noisy state readout and matched read/reset work;
5. biased initial-state control, which receives no free reset; and
6. **candidate:** fixed kinetically asymmetric ratchet with the same total
   affinity and explicit readout/reset policy.

### Split, metrics, and costs

- **Split:** development and validation use only disjoint pilot-family IDs.
  Confirmation holds out the six complete topology/control families and unseen
  $n$, load, observation-noise, and fuel-pulse regimes.
- **Primary quality:** correct net completed cycles minus wrong-direction cycles
  per horizon, subject to the equilibrium-zero-current and ledger checks.
- **Primary cost:** total dimensionless supplied work
  $\widetilde W_{\rm tot}=N_f\Delta\mu/(k_BT)+w_{\rm control}+w_{\rm read}+w_{\rm reset}$
  per correct net cycle. Each lower-case
  nonchemical term is a preregistered dimensionless abstract work charge swept
  over a common range; it is not presented as a molecular value.
- **Secondary:** current, wrong-direction fraction, stalled fraction, entropy
  production estimate, fuel events, reads, resets, transition count, CPU/wall
  time, and ledger residual.
- **Checks:** probability sums to one within $10^{-10}$; every transition is
  paired with a declared rate; energy/fuel bookkeeping closes within $10^{-8}$
  in dimensionless $k_BT$ units; and, under every equilibrium family, the 95%
  interval for current contains zero and absolute mean current is below 0.01
  cycles per horizon.

### Hostile cases and decision

Hostile cases include reversed load, low affinity, an inverted barrier, noisy or
late readout, free hidden initialization, high reset charge, fuel pulses outside
the useful phase, and a controller that spends more work than the ratchet.

**Success:** the candidate improves median correct cycles per
$\widetilde W_{\rm tot}$ by
at least 20% over the best equal-work null in four of six families while all
checks pass and the advantage persists across a registered range of read/reset
charges. **Kill:** any nonzero equilibrium current survives increased sampling;
the ledger fails to close; a reset or controller action is free only for the
candidate; wrong-direction cycles are omitted; or feedback/open-loop control
matches the frontier.

## F-MCS-07 — Spectra-to-structure candidate sets and active measurement

**Question.** Does an operator-qualified, versioned candidate-set workflow reduce
false unique assignments or measurement cost beyond ordinary probabilistic
ranking and active feature acquisition?

### Generator

1. Generate connected molecular graphs with 6–18 heavy-atom vertices, typed
   from a small registered alphabet with valence constraints; include trees,
   rings, symmetry, and stereochemical labels. This is a graph benchmark, not a
   quantum-chemistry predictor.
2. A hidden forward operator produces: molecular formula and mass-like totals;
   NMR-like local-environment features with symmetry collisions; an IR-like
   functional-group indicator; and optional pair-correlation features. Each
   modality has a versioned bias, resolution, missingness, and noise model.
3. Enumerate a candidate set consistent with the formula up to a fixed graph
   bound. Deliberately include isomers that collide under one or more modalities.
   The true graph is absent in 10% of hostile episodes to test open-set handling.
4. Each additional simulated measurement has a fixed cost and reveals only its
   operator output. No feature may contain a canonical graph ID or target rank.
5. Pilot-only data contain asymmetric acyclic scaffolds under a stable operator.
   Six sealed confirmation families contain: monocyclic scaffolds; fused/bridged
   scaffolds; symmetry collisions; stereochemical families; correlated
   noise/missing modalities; and operator shift with open-set candidate omission.

### Arms

1. deterministic rule/constraint filtering;
2. nearest-neighbour ranking;
3. Bayesian candidate ranking with a fixed error model;
4. DP4-like likelihood ranking for the shift-like modality;
5. Bayesian ranking plus greedy expected-information-gain measurement; and
6. **candidate:** Candidate 014-style versioned operator contract, calibrated
   candidate set, active measurement, and explicit invalidation after operator
   change.

### Split, metrics, and costs

- **Split:** development and validation use disjoint pilot scaffolds and
  operators. Confirmation uses only the six sealed families above, grouped by
  complete graph scaffold, stereochemical family, operator version, and
  missing-modality regime. Isomorphic variants may not cross splits.
- **Primary quality:** report fixed-rank coverage at
  $k\in\{1,3,5,10\}$, calibrated returned-set coverage, and false-unique rate.
  The gate uses the returned set: the candidate must attain at least 95%
  empirical coverage with false uniqueness no worse than 2%; register a 0.02
  coverage non-inferiority margin against the strongest calibrated null.
- **Primary cost:** number-weighted simulated measurement cost required to reach
  the coverage condition, plus remeasurement cost after an operator version
  change.
- **Secondary:** top-1 accuracy, mean set size, Brier/log score when the true
  candidate is present, calibration error, open-set detection, invalidated stale
  assignments, enumeration time, CPU/wall time, memory, and human-review flags.
- **Budget:** base formula plus two modalities for every arm; at most three
  additional measurements chosen from a shared pool.

### Hostile cases and decision

Hostile cases are spectral collisions, symmetric sites, candidate-set omission,
wrong formula, a stereoisomer family unseen in training, correlated noise,
missing modality, systematic operator drift, and changed processing with the
same nominal instrument name.

**Success:** the candidate preserves the coverage/false-uniqueness contract and
reduces measurement plus remeasurement cost by at least 20% beyond the best
calibrated active-sensing null in four of six family splits, including operator
shift and candidate omission. **Kill:** the hidden graph leaks through features;
the candidate silently assumes completeness; versioning alone reproduces all
benefit; active sensing selects a measurement using target information; or a
smaller uncalibrated set is reported as improved accuracy.

## F-MCS-08 — Closed-loop reaction search under cliffs, hazards, and drift

**Question.** Does the project's closed endogenous curriculum improve bounded
reaction-like search beyond mature design-of-experiments and Bayesian
optimization at equal measurements, confirmation, and safety constraints?

### Generator

1. Draw a mixed search space with two categorical choices of 3–12 levels and
   three continuous variables scaled to $[0,1]$. A hidden response surface
   returns dimensionless desired yield $y$, selectivity $s$, hazard proxy $h$
   scaled to $[0,1]$, and noisy assay values through a versioned measurement
   operator.
2. Pilot-only landscapes are convex quadratic-continuous and separable
   categorical surfaces. The six sealed confirmation families are smooth
   additive, strong interaction, categorical island, narrow cliff, disconnected
   feasible region, and drifting assay/process. Each confirmation family
   contains matched low- and high-noise regimes.
3. The registered utility is
   $U=y+0.5s-\lambda_h\max(0,h-h_{\max})$ with dimensionless registered
   $\lambda_h$ and $h\leq h_{\max}$ a hard
   feasibility rule; $\lambda_h$ cannot convert an unsafe point into a valid
   optimum.
4. A costly independent confirmation uses a second noisy operator and, in drift
   families, a later process state. The generator stores the true surface only
   for evaluation, never as an arm feature.

### Arms

1. random search;
2. Latin-hypercube or balanced categorical design;
3. Gaussian-process constrained Bayesian optimization;
4. tree-structured Parzen estimator or random-forest optimizer;
5. evolutionary search with the same population-evaluation budget;
6. batch Bayesian optimization; and
7. **candidate:** Candidate 004-style generate–test–select loop with declared
   competence, novelty, difficulty, hazard, confirmation, and stop signals.

### Split, metrics, and costs

- **Split:** development and validation use only disjoint pilot-landscape IDs.
  Confirmation holds out all six complete landscape families, categorical label
  permutations, response-operator versions, and drift schedules.
- **Budget:** 32 noisy evaluations, four independent confirmations, and no more
  than four parallel proposals. Initial observations are identical across arms.
- **Primary quality:** independently confirmed feasible best utility and simple
  regret to the best feasible point from a fixed dense reference evaluation.
  Register a 0.02 normalized-utility non-inferiority margin.
- **Primary cost:** noisy evaluations required to reach the best null's terminal
  confirmed utility; a 20% reduction is required without more invalid or unsafe
  evaluations.
- **Secondary:** feasible hit rate, unsafe proposals, confirmation failures,
  cumulative regret, diversity, surrogate calibration, stop time, CPU/wall time,
  memory, model updates, human tuning, and any measured workstation energy.

### Hostile cases and decision

Hostile cases are a tempting unsafe optimum, proxy/confirmation disagreement,
heteroscedastic noise, label permutation, activity cliff, disconnected feasible
region, assay drift, delayed confirmation, and a search history whose early
winner later degrades.

**Success:** the candidate reaches non-inferior independently confirmed feasible
utility with at least 20% fewer noisy evaluations than the validation-selected
best null in four of six held-out families, without more unsafe proposals and
without losing the drift family. **Kill:** ordinary constrained BO/evolutionary
search matches it; the curriculum sees privileged task difficulty or true
utility; confirmation is optional only for the candidate; unsafe failures are
discarded; or gains vanish under complete-family and operator-version splits.

## Audit-local evidence ledger and proposed central claims

The IDs below are stable inside this audit but have **not** been inserted into
the central claim ledger. The integrator should assign collision-free C-* IDs
only if promotion is useful. Exact wording is deliberately scoped to the cited
system; the transfer column remains a separate proposition.

| Local ID | Status | Exact source claim proposed for the ledger | Primary source | Transfer status, open question, and use |
| --- | --- | --- | --- | --- |
| **MCS-T01** | established, scoped | In the oxime-condensation system studied by Shen and colleagues, acid-enabled reversible oxime exchange supported error checking during catenane and macrocycle assembly, while switching exchange off under neutral conditions trapped the products; reversible exchange therefore did not itself provide both correction and persistence at once. | [Shen et al. 2018](https://doi.org/10.1002/anie.201811025) | **Plausible translation:** separate repair and commit phases. Test whether this beats backtracking/repair in F-MCS-01; maps to P-003/P-009 and Candidate 010. |
| **MCS-T02** | established, scoped | In the building-block system studied by Komáromy and colleagues, self-assembly directed dynamic covalent bond formation toward either product diversity or product specificity depending on the assembly pathway; reversibility alone did not determine one universal outcome. | [Komáromy et al. 2017](https://doi.org/10.1021/jacs.7b01814) | **Plausible translation:** path and selection environment must be part of a reversible-construction contract. F-MCS-01/F-MCS-02. |
| **MCS-T03** | established, scoped | In the chemically fuelled dynamic combinatorial libraries studied by Kriebisch and colleagues, template hybridization accelerated oligomerization and protected oligomers from hydrolysis; oligomers decayed after fuel depletion, so selection was template-, kinetics-, and fuel-qualified. | [Kriebisch et al. 2024](https://doi.org/10.1038/s41557-024-01570-5) | **Plausible translation:** positive production and negative decay feedback must be distinguished and paid for. F-MCS-02; deduplicates to C-162/C-166 and P-004. |
| **MCS-T04** | established, scoped | In the peptide replicator system studied by Carnall and colleagues, mechanical agitation affected fibre breakage and replication and thereby altered which replicators emerged; apparatus and agitation were part of the selection environment. | [Carnall et al. 2010](https://doi.org/10.1126/science.1182767) | **Plausible translation:** selection claims require apparatus/operator variables. F-MCS-02 and Candidate 014. |
| **MCS-T05** | established, scoped | The six-motif hydrogen-bonding network studied by Coubrough and colleagues exhibited high-fidelity and promiscuous recognition, narcissistic and social self-sorting, parallel cascades, and cross-talk; self-sorting depended on the measured interaction hierarchy and did not imply universal orthogonality. | [Coubrough et al. 2019](https://doi.org/10.1002/chem.201804791) | **Plausible translation:** typed local interfaces may reduce coordination, but only against matching/router nulls and unseen-type tests. F-MCS-03; P-008/P-011. |
| **MCS-T06** | established, scoped | For the cucurbit[6]uril systems studied by Márquez, Hudgins and Nau, salt concentration, competing cations, guest size, and protonation affected binding constants and/or ingression kinetics; affinity, access rate, and residence behavior were not interchangeable context-free pair properties. | [Márquez, Hudgins & Nau 2004](https://doi.org/10.1021/ja0319846) | **Plausible translation:** recognition records need context and kinetic scope. F-MCS-04; refine C-158/Candidate 014 rather than create a new principle. |
| **MCS-T07** | established, scoped | In the palladium-catalysed desymmetrization studied by Zhao, Neubauer and Feringa, light-induced state changes in a chiral bisphosphine ligand changed product stereoselectivity, including access to opposite product enantiomers under the reported conditions. | [Zhao, Neubauer & Feringa 2015](https://doi.org/10.1038/ncomms7652) | **Plausible translation:** one bounded component can expose multiple control regimes. Switching conversion, lag, fatigue, and energy remain open. F-MCS-05. |
| **MCS-T08** | established, scoped | In the amine functionalization studied by Gunasekera and colleagues, alternating-current frequency altered competition between one- and two-electron oxidation pathways, and useful frequency depended on matching the redox environment to substrate reaction kinetics. | [Gunasekera et al. 2022](https://doi.org/10.1021/jacs.2c02605) | **Plausible translation:** temporal control must be time-scale- and actuator-qualified. F-MCS-05; P-006/P-010/P-011. |
| **MCS-T09** | established, scoped | The autonomous chemically fuelled small-molecule motor demonstrated by Wilson and colleagues obtained directional cycling from kinetic asymmetry coupled to an irreversible fuel-to-waste reaction; directionality was a nonequilibrium cycle property, not a consequence of thermal motion or fuel consumption alone. | [Wilson et al. 2016](https://doi.org/10.1038/nature18013) | **Plausible translation:** a ratchet claim needs an equal-work controller and complete fuel/read/reset ledger. F-MCS-06; refine C-162/C-166/C-172 and F-010. |
| **MCS-T10** | established, scoped | DP4 and blind computer-assisted structure-elucidation studies demonstrate probabilistic ranking or generation of candidate structures from declared analytical inputs; their conclusions remain conditional on the candidate set, forward/error model, supplied formula and spectra, and operator workflow. | [Smith & Goodman 2010](https://doi.org/10.1021/ja105035r); [Moser et al. 2012](https://doi.org/10.1186/1758-2946-4-5) | **Plausible translation:** preserve calibrated, versioned candidate sets and request orthogonal evidence. F-MCS-07; Candidate 014/F-007/F-011. |
| **MCS-T11** | established capabilities; no universal superiority claim | Published systems have demonstrated Bayesian reaction-condition optimization, learned-plus-symbolic retrosynthetic planning, machine-learning-guided automated reaction exploration, and mobile robotic experimental search; these are mature capability classes that any new generate–test–select proposal must include among its nulls. | [Shields et al. 2021](https://doi.org/10.1038/s41586-021-03213-y); [Segler, Preuss & Waller 2018](https://doi.org/10.1038/nature25978); [Granda et al. 2018](https://doi.org/10.1038/s41586-018-0307-8); [Burger et al. 2020](https://doi.org/10.1038/s41586-020-2442-2) | **Established baseline existence; speculative transfer advantage.** F-MCS-08 must beat these algorithm classes at equal measurements and confirmation cost. |

### Claims deliberately not proposed

- “Dynamic chemistry optimizes itself,” “molecules compute the correct answer,”
  “self-assembly removes centralized control,” and “chemistry provides
  error-free memory” are **rejected**: none names a task/assay, comparator,
  measurement operator, or resource boundary.
- “Catalysts are experts,” “photoswitches are bits,” and “molecular motors are
  agents” are **analogies**, not source claims.
- A fixed percentage efficiency improvement, universal pruning fraction, or
  order-of-magnitude energy advantage is **unsupported**.
- EU Safe and Sustainable by Design, laboratory competence, and measurement
  uncertainty are normative/quality boundaries, not evidence that a proposed
  architecture is safe, sustainable, or scientifically valid.

## Principle, candidate, claim, and fixture deduplication

| Audit residual | Existing destination | Decision |
| --- | --- | --- |
| reversible construction, correction, and commit | P-003, P-004, P-009; Candidates 005, 006, 010 | no new principle/candidate; F-MCS-01 determines whether any residual survives |
| template selection under exchange and fuel | P-004; C-162, C-163, C-166; Candidate 004 | retain scoped chemistry evidence; do not equate amplification with fitness |
| local molecular compatibility/self-sorting | P-001, P-008, P-011; Candidate 015 | no new “molecular routing” object; F-MCS-03 must beat matching/type-system nulls |
| environment-qualified recognition | C-158; Candidate 014; F-011 | refine the observation contract; do not add a host–guest candidate |
| catalytic specialization and deactivation | C-1283; P-001, P-006, P-009 | prior claim already bounds rate-control/transport; add only source depth |
| light/electrical temporal control | P-006, P-010, P-011; Candidates 002, 006, 012 | test sparse control composition in F-MCS-05 |
| fuelled directional cycling | C-162, C-166, C-172; P-010; F-010 | no new ratchet principle; F-MCS-06 is an accounting stress test |
| candidate-set structure inference | P-007, P-013; Candidate 014; F-007/F-011 | refine versioning, candidate completeness, and active sensing |
| closed-loop discovery/design | Candidates 004 and 014 | mature null stack; F-MCS-08 is a hostile-family confirmation test |
| safety, waste, and lifecycle | C-1288 and EU/German source layer | do not collapse yield/atom economy into safety or sustainability |

## DFG 3.11 coverage closure matrix

| DFG subject | What this audit establishes | What remains absent | Result after audit |
| --- | --- | --- | --- |
| **3.11-01 Inorganic molecular chemistry — synthesis, characterization** | a bounded metal/ligand catalytic-control example plus recognition, speciation, kinetics, and structure-measurement boundaries that transfer to molecular inorganic work | systematic main-group and transition-metal synthesis; organometallic mechanisms; coordination and bioinorganic breadth; inorganic stereochemistry/speciation; element- and oxidation-state-specific characterization | **dedicated but shallow** |
| **3.11-02 Organic molecular chemistry — synthesis, characterization** | dynamic covalent assembly, dynamic combinatorial selection, physical-organic kinetics, photochemical/electrochemical pathway control, reaction optimization, retrosynthesis, structure elucidation | total synthesis strategy; protecting-group and chemoselectivity breadth; radical/pericyclic/C–H activation; asymmetric synthesis breadth; flow/scale-up; impurity fate; reaction-data reproducibility; industrial route choice | **dedicated, moderate, not exhaustive** |

The board is therefore no longer “unreviewed,” but it is not complete. A later
depth wave should be divided by unresolved chemistry rather than by another
round of broad analogy collection:

1. organometallic/main-group speciation and off-cycle networks;
2. total-synthesis route logic, protecting-group economies, and late-stage
   failure propagation;
3. stereochemical and constitutional identity under incomplete orthogonal data;
4. radical, photoredox, pericyclic, and C–H activation mechanism boundaries;
5. flow, mixing, heat transfer, scale, separation, impurity, and catalyst-recycle
   effects on molecular claims;
6. high-throughput data provenance, negative results, batch effects, and
   reproducibility; and
7. industrial route selection under EU hazard, waste, supply, and lifecycle
   constraints without treating compliance as a scalar objective.

## Source inventory and reproduction assets

| Source class | Identifier | Exact role in this audit |
| --- | --- | --- |
| authoritative taxonomy | [DFG 3.11](https://www.dfg.de/de/ueber-uns/gremien/fachkollegien/fachsystematik/naturwissenschaften-3-11) | current subject boundary and names, snapshot 2026-08-21 |
| primary experiment | [10.1021/ja005507o](https://doi.org/10.1021/ja005507o) | early aqueous macrocyclic-disulfide DCL exemplar |
| primary experiment | [10.1021/jacs.7b01814](https://doi.org/10.1021/jacs.7b01814) | diversity versus specificity under self-assembly-directed dynamic covalent chemistry |
| primary experiment | [10.1002/anie.201811025](https://doi.org/10.1002/anie.201811025) | switchable oxime exchange, error checking, and trapping |
| primary experiment | [10.1002/chem.201804791](https://doi.org/10.1002/chem.201804791) | six-motif self-sorting network, promiscuity, and cross-talk |
| primary experiment | [10.1126/science.1182767](https://doi.org/10.1126/science.1182767) | agitation as selection pressure in a replicator system |
| primary experiment | [10.1038/s41557-024-01570-5](https://doi.org/10.1038/s41557-024-01570-5) | fuelled, template-qualified oligomer selection and decay |
| primary experiment | [10.1021/ja0319846](https://doi.org/10.1021/ja0319846) | salt/cation/size/protonation effects on cucurbituril binding and ingress |
| primary experiment | [10.1038/ncomms7652](https://doi.org/10.1038/ncomms7652) | light-controlled ligand state and stereoselectivity |
| primary experiment | [10.1021/jacs.2c02605](https://doi.org/10.1021/jacs.2c02605) | AC-frequency control of competing oxidation degrees |
| primary experiment | [10.1038/nature18013](https://doi.org/10.1038/nature18013) | autonomous fuelled motor with kinetic asymmetry |
| primary method | [10.1002/anie.200462544](https://doi.org/10.1002/anie.200462544) | reaction-progress kinetic analysis as mechanistic null |
| primary method | [10.1021/ja105035r](https://doi.org/10.1021/ja105035r) | DP4 probabilistic stereochemical assignment |
| primary evaluation | [10.1186/1758-2946-4-5](https://doi.org/10.1186/1758-2946-4-5) | blind CASE trials and operator/data boundaries |
| primary capability | [10.1038/s41586-021-03213-y](https://doi.org/10.1038/s41586-021-03213-y) | Bayesian reaction optimization |
| primary capability | [10.1038/nature25978](https://doi.org/10.1038/nature25978) | learned plus symbolic retrosynthetic planning |
| primary capability | [10.1038/s41586-018-0307-8](https://doi.org/10.1038/s41586-018-0307-8) | ML-guided automated reactivity search |
| primary capability | [10.1038/s41586-020-2442-2](https://doi.org/10.1038/s41586-020-2442-2) | mobile robotic chemical search |
| data/code | [10.6084/m9.figshare.25550047](https://doi.org/10.6084/m9.figshare.25550047), [gerland-group/ChemicallyFueledOligomers](https://github.com/gerland-group/ChemicallyFueledOligomers) | source data and code associated with Kriebisch et al.; not executed in this audit |
| German/European standard | [10.31030/2731745](https://doi.org/10.31030/2731745) | DIN EN ISO/IEC 17025 laboratory competence boundary |
| German standard | [10.31030/1465413](https://doi.org/10.31030/1465413) | DIN 32645 detection/quantification boundary under its scope |
| metrology guide | [10.59161/JCGM100-2008E](https://doi.org/10.59161/JCGM100-2008E) | measurement-uncertainty vocabulary |
| EU authoritative act | [Recommendation (EU) 2026/510](https://eur-lex.europa.eu/eli/reco/2026/510/oj/eng) | voluntary revised SSbD framework and lifecycle assessment boundary |
| EU authoritative act | [REACH](https://eur-lex.europa.eu/eli/reg/2006/1907/oj/eng), [CLP](https://eur-lex.europa.eu/eli/reg/2008/1272/oj/eng) | stable Official Journal acts; consult the applicable consolidated text for a real activity |

The papers establish only their reported chemical systems and methods. The
fixture generators, 20% gates, split design, and systems transfers are proposals
from this audit, not findings attributed to those papers.

## Audit-local BibTeX proposed for bibliography integration

These entries are provided verbatim for the integrator. Keys should be reconciled
against the central bibliography before insertion; duplicate DOI entries should
be merged rather than renamed into parallel records.

~~~bibtex
@online{DFG2026Molekuelchemie,
  author  = {{Deutsche Forschungsgemeinschaft}},
  title   = {Fachkollegium 3.11: Molekülchemie},
  year    = {2026},
  url     = {https://www.dfg.de/de/ueber-uns/gremien/fachkollegien/fachsystematik/naturwissenschaften-3-11},
  urldate = {2026-08-21}
}

@article{OttoFurlanSanders2000DCL,
  author  = {Otto, Sijbren and Furlan, Ricardo L. E. and Sanders, Jeremy K. M.},
  title   = {Dynamic Combinatorial Libraries of Macrocyclic Disulfides in Water},
  journal = {Journal of the American Chemical Society},
  year    = {2000},
  volume  = {122},
  number  = {48},
  pages   = {12063--12064},
  doi     = {10.1021/ja005507o}
}

@article{KomaromyEtAl2017DiversitySpecificity,
  author  = {Komáromy, Dávid and Stuart, Marc C. A. and Monreal Santiago, Guillermo and Tezcan, Meniz and Krasnikov, Victor V. and Otto, Sijbren},
  title   = {Self-Assembly Can Direct Dynamic Covalent Bond Formation toward Diversity or Specificity},
  journal = {Journal of the American Chemical Society},
  year    = {2017},
  volume  = {139},
  number  = {17},
  pages   = {6234--6241},
  doi     = {10.1021/jacs.7b01814}
}

@article{ShenEtAl2018Oxime,
  author  = {Shen, Libo and Cao, Ning and Tong, Lu and Zhang, Xinjiang and Wu, Guangcheng and Jiao, Tianyu and Yin, Qi and Zhu, Jiaqi and Pan, Yuanjiang and Li, Hao},
  title   = {Dynamic Covalent Self-Assembly Based on Oxime Condensation},
  journal = {Angewandte Chemie International Edition},
  year    = {2018},
  volume  = {57},
  number  = {50},
  pages   = {16486--16490},
  doi     = {10.1002/anie.201811025}
}

@article{CoubroughEtAl2019SelfSorting,
  author  = {Coubrough, Heather M. and van der Lubbe, Stephanie C. C. and Hetherington, Kristina and Minard, Aisling and Pask, Christopher and Howard, Mark J. and Fonseca Guerra, Célia and Wilson, Andrew J.},
  title   = {Supramolecular Self-Sorting Networks using Hydrogen-Bonding Motifs},
  journal = {Chemistry -- A European Journal},
  year    = {2019},
  volume  = {25},
  number  = {3},
  pages   = {785--795},
  doi     = {10.1002/chem.201804791}
}

@article{CarnallEtAl2010Mechanosensitive,
  author  = {Carnall, Jacqui M. A. and Waudby, Christopher A. and Belenguer, Ana M. and Stuart, Marc C. A. and Peyralans, Jérôme J.-P. and Otto, Sijbren},
  title   = {Mechanosensitive Self-Replication Driven by Self-Organization},
  journal = {Science},
  year    = {2010},
  volume  = {327},
  number  = {5972},
  pages   = {1502--1506},
  doi     = {10.1126/science.1182767}
}

@article{KriebischEtAl2024TemplateCopying,
  author  = {Kriebisch, Christine M. E. and Burger, Ludwig and Zozulia, Oleksii and Stasi, Michele and Floroni, Alexander and Braun, Dieter and Gerland, Ulrich and Boekhoven, Job},
  title   = {Template-Based Copying in Chemically Fuelled Dynamic Combinatorial Libraries},
  journal = {Nature Chemistry},
  year    = {2024},
  volume  = {16},
  pages   = {1240--1249},
  doi     = {10.1038/s41557-024-01570-5}
}

@dataset{KriebischEtAl2024TemplateCopyingData,
  author    = {Kriebisch, Christine M. E. and Burger, Ludwig and Zozulia, Oleksii and Stasi, Michele and Floroni, Alexander and Braun, Dieter and Gerland, Ulrich and Boekhoven, Job},
  title     = {Data for: Template-Based Copying in Chemically Fuelled Dynamic Combinatorial Libraries},
  year      = {2024},
  publisher = {figshare},
  doi       = {10.6084/m9.figshare.25550047}
}

@article{MarquezHudginsNau2004Cucurbituril,
  author  = {Márquez, Carmen and Hudgins, Robert R. and Nau, Werner M.},
  title   = {Mechanism of Host--Guest Complexation by Cucurbituril},
  journal = {Journal of the American Chemical Society},
  year    = {2004},
  volume  = {126},
  number  = {18},
  pages   = {5806--5816},
  doi     = {10.1021/ja0319846}
}

@article{Blackmond2005RPKA,
  author  = {Blackmond, Donna G.},
  title   = {Reaction Progress Kinetic Analysis: A Powerful Methodology for Mechanistic Studies of Complex Catalytic Reactions},
  journal = {Angewandte Chemie International Edition},
  year    = {2005},
  volume  = {44},
  number  = {28},
  pages   = {4302--4320},
  doi     = {10.1002/anie.200462544}
}

@article{ZhaoNeubauerFeringa2015DynamicChirality,
  author  = {Zhao, Depeng and Neubauer, Thomas M. and Feringa, Ben L.},
  title   = {Dynamic Control of Chirality in Phosphine Ligands for Enantioselective Catalysis},
  journal = {Nature Communications},
  year    = {2015},
  volume  = {6},
  pages   = {6652},
  doi     = {10.1038/ncomms7652}
}

@article{GunasekeraEtAl2022ACOxidation,
  author  = {Gunasekera, Disni and Mahajan, Jyoti P. and Wanzi, Yanick and Rodrigo, Sachini and Liu, Wei and Tan, Ting and Luo, Long},
  title   = {Controlling One- or Two-Electron Oxidation for Selective Amine Functionalization by Alternating Current Frequency},
  journal = {Journal of the American Chemical Society},
  year    = {2022},
  volume  = {144},
  number  = {22},
  pages   = {9874--9882},
  doi     = {10.1021/jacs.2c02605}
}

@article{WilsonEtAl2016FuelledMotor,
  author  = {Wilson, Miriam R. and Solà, Jordi and Carlone, Armando and Goldup, Stephen M. and Lebrasseur, Nathalie and Leigh, David A.},
  title   = {An Autonomous Chemically Fuelled Small-Molecule Motor},
  journal = {Nature},
  year    = {2016},
  volume  = {534},
  number  = {7606},
  pages   = {235--240},
  doi     = {10.1038/nature18013}
}

@article{SmithGoodman2010DP4,
  author  = {Smith, Steven G. and Goodman, Jonathan M.},
  title   = {Assigning Stereochemistry to Single Diastereoisomers by {GIAO} {NMR} Calculation: The {DP4} Probability},
  journal = {Journal of the American Chemical Society},
  year    = {2010},
  volume  = {132},
  number  = {37},
  pages   = {12946--12959},
  doi     = {10.1021/ja105035r}
}

@article{MoserEtAl2012CASEBlindTrials,
  author  = {Moser, Arvin and Elyashberg, Mikhail E. and Williams, Antony J. and Blinov, Kirill A. and DiMartino, Joseph C.},
  title   = {Blind Trials of Computer-Assisted Structure Elucidation Software},
  journal = {Journal of Cheminformatics},
  year    = {2012},
  volume  = {4},
  number  = {1},
  pages   = {5},
  doi     = {10.1186/1758-2946-4-5}
}

@article{ShieldsEtAl2021BayesianReactionOptimization,
  author  = {Shields, Benjamin J. and Stevens, Jason and Li, Jun and Parasram, Marvin and Damani, Farhan and Martinez Alvarado, Jesus I. and Janey, Jacob M. and Adams, Ryan P. and Doyle, Abigail G.},
  title   = {Bayesian Reaction Optimization as a Tool for Chemical Synthesis},
  journal = {Nature},
  year    = {2021},
  volume  = {590},
  number  = {7844},
  pages   = {89--96},
  doi     = {10.1038/s41586-021-03213-y}
}

@article{SeglerPreussWaller2018SynthesisPlanning,
  author  = {Segler, Marwin H. S. and Preuss, Mike and Waller, Mark P.},
  title   = {Planning Chemical Syntheses with Deep Neural Networks and Symbolic {AI}},
  journal = {Nature},
  year    = {2018},
  volume  = {555},
  number  = {7698},
  pages   = {604--610},
  doi     = {10.1038/nature25978}
}

@article{GrandaEtAl2018SynthesisRobot,
  author  = {Granda, Jarosław M. and Donina, Liva and Dragone, Vincenza and Long, De-Liang and Cronin, Leroy},
  title   = {Controlling an Organic Synthesis Robot with Machine Learning to Search for New Reactivity},
  journal = {Nature},
  year    = {2018},
  volume  = {559},
  number  = {7714},
  pages   = {377--381},
  doi     = {10.1038/s41586-018-0307-8}
}

@article{BurgerEtAl2020MobileRoboticChemist,
  author  = {Burger, Benjamin and Maffettone, Phillip M. and Gusev, Vladimir V. and Aitchison, Catherine M. and Bai, Yang and Wang, Xiaoyan and Li, Xiaobo and Alston, Ben M. and Li, Buyi and Clowes, Rob and Rankin, Nicola and Harris, Brandon and Sprick, Reiner Sebastian and Cooper, Andrew I.},
  title   = {A Mobile Robotic Chemist},
  journal = {Nature},
  year    = {2020},
  volume  = {583},
  number  = {7815},
  pages   = {237--241},
  doi     = {10.1038/s41586-020-2442-2}
}

@standard{DINENISOIEC17025_2018,
  author    = {{DIN Deutsches Institut für Normung}},
  title     = {{DIN EN ISO/IEC 17025:2018-03}: General Requirements for the Competence of Testing and Calibration Laboratories},
  year      = {2018},
  publisher = {DIN Media},
  doi       = {10.31030/2731745}
}

@standard{DIN32645_2008,
  author    = {{DIN Deutsches Institut für Normung}},
  title     = {{DIN 32645:2008-11}: Chemical Analysis---Decision Limit, Detection Limit and Determination Limit under Repeatability Conditions---Terms, Methods, Evaluation},
  year      = {2008},
  publisher = {DIN Media},
  doi       = {10.31030/1465413}
}

@techreport{JCGM1002008,
  author      = {{Joint Committee for Guides in Metrology}},
  title       = {Evaluation of Measurement Data---Guide to the Expression of Uncertainty in Measurement},
  institution = {JCGM},
  year        = {2008},
  number      = {JCGM 100:2008},
  doi         = {10.59161/JCGM100-2008E}
}

@misc{EuropeanCommission2026SSbD,
  author       = {{European Commission}},
  title        = {Commission Recommendation ({EU}) 2026/510 of 6 March 2026 on Revising the European Assessment Framework for Safe and Sustainable by Design Chemicals and Materials},
  year         = {2026},
  howpublished = {Official Journal of the European Union, OJ L 2026/510},
  url          = {https://eur-lex.europa.eu/eli/reco/2026/510/oj/eng},
  urldate      = {2026-08-21}
}

@misc{EU_REACH_1907_2006,
  author       = {{European Parliament and Council of the European Union}},
  title        = {Regulation ({EC}) No 1907/2006 concerning the Registration, Evaluation, Authorisation and Restriction of Chemicals ({REACH})},
  year         = {2006},
  howpublished = {Official Journal of the European Union},
  url          = {https://eur-lex.europa.eu/eli/reg/2006/1907/oj/eng},
  urldate      = {2026-08-21}
}

@misc{EU_CLP_1272_2008,
  author       = {{European Parliament and Council of the European Union}},
  title        = {Regulation ({EC}) No 1272/2008 on Classification, Labelling and Packaging of Substances and Mixtures ({CLP})},
  year         = {2008},
  howpublished = {Official Journal of the European Union},
  url          = {https://eur-lex.europa.eu/eli/reg/2008/1272/oj/eng},
  urldate      = {2026-08-21}
}
~~~

## Final audit decision

This wave supports **no new project principle and no new architecture
candidate**. It proposes eleven scoped ledger claims, of which several may be
best integrated as refinements or source additions to existing claims rather
than as new rows. It adds eight executable test contracts, but no result: every
claimed systems advantage remains speculative until a fixture implementation
passes the registered mature-null, hostile-family, measurement, and cost gates.

The most defensible transferable object is the contract itself:

> expose exchange and conservation; qualify selection by environment and
> apparatus; distinguish equilibrium, kinetics, control, and readout; carry
> candidate and operator versions; and close the work, waste, reset, measurement,
> compute, human, and lifecycle ledgers.

That object is a synthesis of existing project principles. Chemistry makes its
failure conditions concrete; it does not independently prove an AI gain.
