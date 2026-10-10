# Start here

This page is for a reader who has the [README](../README.md)'s one-paragraph
summary and wants to know what each chapter argues before opening it. It adds
two things the other entry points do not: how to read the project's status
labels, and a plain-language summary of every concept chapter with its current
status and what would count against it. Project terms are explained in the
[glossary](glossary.md).

## Read the status before the sentence

Every claim in the [claim ledger](../research/claims.md) carries an evidence
status: **established**, **plausible**, **speculative** or **disputed**, and the
chapters cite those claims for their assertions. The status belongs to the
exact claim, not to the chapter or the idea around it. A chapter can rest on established
biology and still propose a speculative architecture; most do.

Chapters keep three layers apart: what a source measured, how the project
proposes to translate it into an artificial mechanism, and what remains
untested. Experiment outputs labelled `NO_RESULT` verify machinery only. The
README's current-status paragraph states the overall position: the evidence
framework, architecture and bounded experiment machinery exist; an integrated
AI system and a claim-eligible workstation result do not.

## The chapters in plain language

Each summary is derived from the chapter's *Scope*, *Evidence status* and
*Failure modes* sections. The chapter remains the authority; these summaries
carry no claim of their own.

**[00 · Thesis and principles](../concept/00-thesis-and-principles.md)** — The
brain runs adaptive behaviour, learning and memory on roughly 17–20 watts. This
chapter argues that an artificial system should borrow six constraints from
that fact, such as activating only a small relevant part of its capacity for
each event and pricing memory movement instead of counting only arithmetic. The
energy constraint and conditional computation in engineered systems are
established; the complete pipeline is speculative, and no cited paper validates
it as one system. A sparsity that saves theoretical operations but raises real
communication or latency counts against it.

**[01 · Working architecture](../concept/01-working-architecture.md)** — The
shortest complete description of the proposed system: three coupled loops for
running, adapting and maintaining, showing where information moves, where
learning happens and which decisions can be undone. Parts such as conditional
experts and early exit are implemented mechanisms; the complete three-loop
system is an unvalidated synthesis, and every experiment must be compared
against the strongest conventional method, such as feedback control or adaptive
routing. It
fails if routing and monitoring move nearly as much state as dense execution.

**[05 · Biology is a launchpad](../concept/05-biology-is-a-launchpad.md)** —
Sets the rule for borrowing from living systems: reproduce the useful
constraint or computation, not the accident of the biological substrate. Neural
energy limits are established within their stated scope. Dendritic,
homeostatic and inhibitory mechanisms are biological observations, and their
artificial versions are not validated by them. The rule is broken when a
metaphor is mistaken for a mechanism, or when "biological" stands in for
"efficient".

**[07 · Cross-domain convergence](../concept/07-cross-domain-convergence.md)**
— A finding from neuroscience, botany, immunology, ecology, control theory or
materials enters the design only after its causal operation is stated and
compared with what is already recorded. The unit is a versioned principle
bundle, not a paper or an organism. The thirteen current bundles are a
plausible working taxonomy; whether recurrence across distant fields predicts a
useful artificial mechanism is speculative. The warning sign is the same
feedback loop reappearing under a new organism's name.

**[10 · Structural growth and routing](../concept/10-neurogenesis-and-routing.md)**
— How a modular system adds capacity without running, training or keeping
every module for every event. New capacity is admitted only for a measured
gap, earns traffic on probation, and can later be merged, reopened or retired.
Conditional expert routing and competitive pruning are established in published
or tested systems; the complete grow–route–specialise lifecycle is speculative
and must be compared with ordinary baselines. Router collapse, where one module
takes most of the traffic, is a named failure.

**[20 · Sensorimotor grounding](../concept/20-sensorimotor-grounding.md)** — A
model counts as grounded when its internal state is constrained by time-ordered
observation, action and consequence, and when it can still predict and act with
missing sensors, timing error and partial views. Several component results are
established for their specific tasks, a general predictive-coding abstraction is
plausible, and robust physical concepts from the integrated curriculum are
speculative. If shuffling the actions leaves held-out intervention error
unchanged, the model learned passive correlation and the grounding claim is
withdrawn.

**[22 · Representative adaptive performance](../concept/22-representative-adaptive-performance.md)**
— A result means something only when it travels with the information that was
available, the actions that were feasible, the history behind the policy, the
opponent or team, and the system's resource and damage state. The chapter turns
sports-expertise and team-coordination research into that reporting contract.
The human studies are established for their tasks; the proposed composition is
a benchmark target until it beats a complete conventional stack in Fixture
F-006. Higher label accuracy without better interception, deadline or safety
outcomes does not count.

**[23 · Active acoustic inference](../concept/23-active-acoustic-inference.md)**
— Sound reaches a receiver as pressure shaped by the room, the medium, the
receiver and its motion, not as ready-made objects. The chapter defines how an
active listener, one that can move or emit probe sounds, should infer sources
and task state from that measurement. Most physical and biological mechanisms
it relies on are established, a few are plausible or disputed, and no evidence
shows that the complete system beats conventional and learned signal
processing; it remains an experiment, Fixture F-009. A result driven by an
unreferenced decibel value is invalid.

**[24 · Operator-qualified sensing](../concept/24-operator-qualified-sensing.md)**
— A sensor delivers a finite measurement shaped by its aperture, illumination,
detector, clock, calibration and noise, not a scene or a fact. The system must
keep enough of that record to know what the measurement could and could not
resolve, and when another measurement is worth paying for. The physical
constraints are established; the full composition is not yet shown to improve
quality, risk, latency or energy, so Fixture F-007 is a hostile test, not a
promotion. Sharper images without better held-out
decisions mean the prior changed the picture, not the information.

**[25 · Active chemical sensing](../concept/25-active-chemical-sensing.md)** —
A chemical sensor receives a response shaped by transport, the sampling action,
the instrument, humidity and past exposure; in a turbulent plume the chemical
arrives as intermittent whiffs. The chapter keeps presence, identity,
concentration, source position and hazard as separate outcomes. Of its 52
claims, 50 are established within their experiments, one is plausible and one
disputed; none shows that the architecture improves on the full conventional
stack tested in Fixture F-011. Treating an instantaneous concentration reading
as a source direction is a named failure.

**[26 · Mission-profile reliability](../concept/26-reliability-under-mission-profiles.md)**
— Hardware is a population of devices that start different and keep changing,
so reliability depends on the required function, the acceptance test, the
unit, its history, its environment and a time horizon. The chapter keeps
manufacturing variation, reversible drift, wear, permanent failure and
transient upsets apart. Of 52 claims, 47 are established and 5 plausible; they
support the constraints and mature correction methods, not a win over the
conventional reliability stack in Fixture F-008. Reporting accuracy from
selected good devices hides yield loss.

**[28 · Physical computation boundaries](../concept/28-physical-computation-boundaries.md)**
— "Energy per operation" means nothing until both the operation and the
measurement boundary are fixed. The chapter separates six boundaries, from the
physical minimum for erasing information through device, circuit, workload and
facility energy to the burden of manufacturing the hardware, and every claimed
saving must survive the next boundary. Of 52 claims, 46 are established, 5
plausible and 1 disputed. Assigning Landauer's minimum erasure energy to every
operation is a named failure.

**[30 · Sparse predictive compute](../concept/30-sparse-predictive-compute.md)**
— The online path that decides, event by event, whether to reuse a prediction,
stop early, call another module, read memory, take another observation or
escalate. Its target is minimum measured resource use under explicit quality,
calibration, deadline and safety limits, not minimum arithmetic. Sparse
conditional capacity is an established AI mechanism; the integrated runtime is
speculative until each gate is tested alone and then together. Spending more
compute on noisy inputs without better decisions is a rejection signal.

**[40 · Memory and consolidation](../concept/40-memory-and-consolidation.md)** —
Memory is a lifecycle: capture an event, keep its origin, decide whether it
deserves more work, test integrating it, then retain, transform, store it
externally, weaken it or delete it. The aim is fast adaptation without letting
every surprising event rewrite stable skills. The fast/slow learning split and
content-specific replay are established in scoped studies; the complete
lifecycle controller is speculative. Replay that amplifies biased episodes, or
a scheduler that starves rare safety-critical memories, are named failures.

**[50 · Maturity and structural consolidation](../concept/50-grokking-and-pruning.md)**
— How a useful but still changeable structure earns protection, becomes cheaper
to run and eventually qualifies for pruning. Maturity is a reversible state
granted inside a declared validation envelope. Delayed generalisation
("grokking") is disputed as a maturity certificate and cannot be the gate;
staged pruning is established in tested settings; the complete digital
lifecycle controller is speculative. Protecting a shortcut before rare-event or
intervention tests expose it is the named "false maturity" failure.

**[60 · Hardening and factual memory](../concept/60-hardening-and-factual-memory.md)**
— Separates five runtime outcomes: a compiled reflex path for a narrow,
qualified task; a reusable skill; versioned factual memory with provenance;
escalation to a more capable model, tool or human; and rollback. Hardening is a
reversible promotion, not freezing. Exact restore, error-correcting repair and
assurance methods are established engineering baselines; automatic reflex
discovery and versioned assurance envelopes are speculative. A guard that lets
shifted inputs through must disable that version and route to a fallback.

**[70 · System synthesis](../concept/70-system-synthesis.md)** — Follows
information through the runtime, adaptation and maintenance loops, states who
may write each kind of state, and gives the order in which the system should be
assembled. Conditional routing and early exit are available engineered
mechanisms; most other ingredients are scoped observations or experimental
translations; the complete system is an unvalidated project synthesis. A shared
predictive state that becomes a dense communication bottleneck, or controllers
that oscillate against each other, count against it.

**[80 · Energy evaluation](../concept/80-energy-model.md)** — Energy efficiency
is a measured relationship among a task, its inputs, quality and risk limits,
latency, the hardware and software, a lifecycle horizon and a physical
measurement boundary. Every efficiency result in the project carries that
record and uses equal-budget comparisons instead of operation counts. The
biological energy constraint is established, an inherited brain-to-accelerator
number is disputed, and lower lifecycle energy for this architecture is
speculative. Reporting device energy as facility energy, or saving energy by
dropping hard inputs, is a failure.

**[90 · Research roadmap](../concept/90-research-roadmap.md)** — Turns an
open-ended research ambition into bounded iterations: each must change a claim,
principle, chapter, equation, diagram, decision or experiment, or record that
it changed none. Stages are dependency gates, not dates, and GitHub milestones
show operational progress only. The candidate and fixture catalogues contain
written contracts and bounded development harnesses but no claim-eligible
result. New fields that accumulate without changing any principle or
experiment signal failure.

## Where to go next

- Follow a [reading path](../concept/README.md#reading-paths) through the
  chapters: architecture first, evidence first, or evaluation first.
- Find a specific area in the [repository map](repository-map.md).
- Check a single statement in the [claim ledger](../research/claims.md) or the
  [principle registry](../research/principle-registry.md).
- Pick up a bounded task from [how to help](how-to-help.md).
