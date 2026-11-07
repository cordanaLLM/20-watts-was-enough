# Fixture F-017 — Low-bit model and native-hardware crossover

- **Status:** pre-implementation experiment contract
- **Direct claim:** [C-013](../../research/claims.md#c-013)
- **Evidence boundary:** `ma2024bitnet`, `wang2024bitnetcpp`, and
  `ma2025bitnet2b4t`, together with the mutable `microsoft2026bitnet`
  implementation record, motivate ternary-weight models and native kernels;
  they do not establish this fixture's matched quality, strongest-null,
  hardware, or lifecycle result
- **Physical-accounting owner:**
  [Fixture F-010](010-boundary-qualified-physical-computation.md)
- **Authority:** no trained checkpoint, native ternary kernel, measured run, or
  energy result exists in this fixture

## Question or hypothesis

At matched architecture size, tokenizer, training corpus, token order, and
training-token budget, can a from-scratch ternary-weight language model remain
within frozen quality and calibration margins of a full-precision model while
occupying a better native inference latency--memory--energy frontier than the
strongest supported low-bit baseline?

The hypothesis is deliberately conjunctive:

1. ternary training, rather than post-training rounding, preserves aggregate
   and worst-slice task quality within predeclared noninferiority margins;
2. a packed native execution path, rather than emulation through wider matrix
   operations, produces the claimed inference-cost difference on both a CPU and
   a discrete accelerator; and
3. the benefit remains after activation and accumulator precision, data
   movement, compilation, kernel engineering, training, failed runs,
   retraining, conversion, and amortization are charged.

Failure of any part rejects the complete crossover. The fixture does not claim
that ternary weights are universally preferable, that low precision is a
biological analogue, or that smaller stored weights imply lower wall energy.

## Systems, tasks, workloads, and hardware families

The independent training and confirmatory-inference unit is a scheduled
`training seed × model scale` checkpoint pair, including a failed scheduled
run. Paired meter blocks are technical repeats nested inside that checkpoint
pair; neither blocks, prompts, nor tokens are resampled as independent model
replicates, and conditioning on successful completion is forbidden.

Two dissimilar language-task families are mandatory:

1. **Predictive distribution family:** frozen held-out natural-language and
   code sequences with common, rare-token, long-context, multilingual, and
   formatting strata. It measures next-token negative log likelihood,
   calibration, and distribution drift without relying on one downstream
   scorer.
2. **Constrained generation family:** versioned question answering, structured
   extraction, code/test completion, and instruction-following tasks with exact
   or independently recomputable scorers, refusal opportunities, protected
   rare slices, and adversarial format changes. Evaluator prompts and answers
   are never training or tuning data.

The development profile uses a 6-layer, width-384, 6-head, FFN-width-1,536
transformer to validate the pipeline. Confirmation uses exactly two tied-
embedding decoder scales with vocabulary 32,768 and context limit 2,048:

1. **S:** 12 layers, width 768, 12 heads, FFN width 3,072; and
2. **L:** 24 layers, width 1,536, 24 heads, FFN width 6,144.

The generated architecture manifest records the exact parameter count for every
arm and must verify equality within 0.1%; L must contain at least four times S's
parameters. These shapes, vocabulary, and scales are fixed before kernel work.
A scale is not silently dropped because a baseline or candidate performs poorly.

The reference execution pair is frozen as (1) one AMD Ryzen 9 7950X CPU host
with 64 GiB DDR5 memory and (2) one NVIDIA GeForce RTX 4090 24 GiB discrete GPU
on that host. Exact board revision, firmware, memory timings, operating system,
driver, compiler, clocks, power limits, cooling, and background-service image
are sealed in `hardware.json`; substituting a model creates a separate
replication, not a repair. Each checkpoint is therefore run on two hardware
classes:

1. the exact Ryzen 9 7950X x86-64 CPU named above; and
2. the exact RTX 4090 accelerator named above with a separately implemented
   packed ternary kernel.

Arm CPUs, other GPUs, and other accelerators are replication-only in this
protocol version and cannot replace a failed primary backend.

A **native ternary path** keeps weights in their packed representation from
durable storage through device memory and kernel consumption, never materializes
a full wider weight matrix, records the executed kernel identity, and exposes a
structural instruction/memory trace that passes the frozen backend-specific
acceptance rules below. Packed storage alone is not native execution.

Three inference profiles remain separate: batch 1/concurrency 1, interactive
concurrency 4, and throughput batch 16. Each runs contexts 512 and 2,048 with
exactly 256 teacher-forced output-token positions per request, an empty initial
cache, and identical token IDs and cache policy within a paired block. Each
`scale × hardware × profile × context × systems-cost comparator` commits a reserve
of 40 paired blocks. The frozen power rule selects an even prefix of 24, 32, or
40 that is at least the selected number of confirmation checkpoint pairs. The
first block assignment is one per checkpoint pair in seed order. Remaining
assignments concatenate successive Fisher--Yates permutations of all selected
checkpoint-pair IDs from the committed PCG64 stream and truncate that stream
after block $m$; thus every allowed $(n,m)$ has an exact allocation even when a
checkpoint receives three blocks. A separate Fisher--Yates permutation assigns
candidate-first to its first $n/2$ checkpoint IDs and baseline-first to the
rest. Order then alternates on every later occurrence of that checkpoint. The
block identity is the canonical tuple `scale × hardware × profile × context ×
comparator × training-seed × within-checkpoint-occurrence ×
global-block-index`; all 40 identities, allocation cycles, and orders are
committed before reveal. One
predeclared infrastructure retry is permitted before unblinding;
the failed block and its resources remain in the record. An unresolved failed
pair receives `p=1` for every affected component.

Primary kernel cost uses a teacher-forced or otherwise fixed token-ID schedule
with identical processed-token counts, so early stopping, refusal, and shorter
answers cannot manufacture savings.

The separate end-to-end hard gate uses one sealed pack of exactly 4,096 requests
per confirmation checkpoint pair: 1,024 each for question answering, structured
extraction, code-with-tests, and instruction following. Within every stratum,
half use context 512 and half context 2,048. Requests use greedy decoding
(temperature 0, no sampling), an empty initial cache, maximum 256 generated
tokens, EOS stopping, and the same tokenizer and prompt bytes for all arms. The
pack is divided into 16 ordered blocks of 256 requests; candidate/comparator
order is reversed in eight blocks using the committed evaluation-order stream.
Every checkpoint pair runs the complete pack on both primary backends.

Answer coverage, scorer-defined accepted quality, output length, latency, and
externally measured joules/request retain all 4,096 requests in their fixed
denominator. A crash, timeout, invalid format, or zero output counts as an
unsupported failed request and its energy remains charged; it is never replaced.
Checkpoint-pair seed aggregates, not requests or blocks, are independent units.
The same component-max, boundary-null randomization, and missing-pair rules
govern a **separate exact three-value Holm family** at familywise 0.05:
coverage noninferiority, accepted-quality noninferiority, and joules/request
noninferiority. The end-to-end profile cannot replace the fixed-work result or
enter the exact 12-value primary family below.

## Arms, baselines, and strongest nulls

Every trainable arm uses the same transformer topology, embedding tying, total
trainable parameter count within 0.1%, tokenizer, corpus, token order, context
schedule, and checkpoint opportunities:

1. **BF16/FP16 references:** every predeclared natively supported BF16 and FP16
   training/inference path on each hardware class that passes its sealed
   correctness and native-execution signature. No result-dependent selector is
   permitted.
2. **Optimized INT8 reference:** quantization-aware or native INT8 training and
   inference with the strongest supported vendor/open kernel.
3. **Strongest native sub-8-bit reference:** INT4 or the lowest wider-than-
   ternary mode that has a genuine native kernel and passes the same quality
   gates. If no such mode is supported, its absence is recorded; INT8 remains
   the mature low-bit null.
4. **Post-training ternary diagnostic:** a reference checkpoint rounded or
   calibrated to ternary weights. It tests whether the training recipe is
   necessary and cannot promote C-013.
5. **Ternary emulation diagnostic:** the candidate checkpoint executed only by
   unpacking or widening through an ordinary kernel. It can validate numerical
   parity but no systems-cost claim.
6. **Native ternary candidate:** from-scratch ternary training plus a packed
   native kernel on both hardware classes.
7. **Quality oracle ceiling:** an excluded larger or more extensively trained
   full-precision model. It diagnoses task headroom but cannot support a matched
   comparison.

There is no favorable selector or result-defined frontier. Before development,
the backend capability manifest enumerates every candidate path as the tuple
`dtype × kernel source digest × compiler/flags digest × backend version ×
hardware firmware digest`; duplicate tuples are forbidden. The **systems-cost
comparator set** on each backend contains every enumerated arm-1 path and every
enumerated arm-2/arm-3 path that passes its sealed correctness,
native-execution, and development-only quality-eligibility gates. Those gates,
their tie-free thresholds, and the complete enumerated path list are committed
before any development measurement. Confirmation results can fail a comparator
but can never remove it from the set. INT8 is mandatory; absence of arm 3 is
permitted only when the sealed capability probe proves no native
wider-than-ternary sub-8-bit mode. Every resource and lifecycle hypothesis is
an intersection--union contrast against every member of the set. If no mature
low-bit path remains eligible, items 5--12 receive $p=1$ even though one or more
arm-1 paths are present.

## Equal budgets and lifecycle boundary

Trainable arms receive identical:

- architecture dimensions and parameter-count rule;
- corpus objects, tokenizer, token order, training tokens, sequence lengths,
  label masks, and data-cleaning versions;
- optimizer family, global batch of 262,144 tokens, checkpoint/evaluation
  opportunities, and 48 development hyperparameter trials per `arm × scale`;
- access to compiler, profiler, kernel documentation, and the frozen design
  ceiling of 80 recorded kernel-engineering hours per arm and hardware backend.

The exact full-training budgets per scheduled seed are:

| Scale | Training tokens | Updates | GPU/wall cap | CPU cap | Net measured-energy cap |
| --- | ---: | ---: | ---: | ---: | ---: |
| S | 1,073,741,824 | 4,096 | 604,800 s | 86,400 s | 200,000,000 J |
| L | 4,294,967,296 | 16,384 | 2,419,200 s | 345,600 s | 800,000,000 J |

Each development trial receives exactly 134,217,728 tokens and 512 updates;
unused trial or training budget is not transferred. Peak envelopes are
24,696,061,952 B (`23 GiB`) device memory, 64,424,509,440 B (`60 GiB`) host
RAM, and 1,099,511,627,776 B (`1 TiB`) durable-plus-transferred I/O. The four
checkpoint opportunities are exactly 25%, 50%, 75%, and 100% of registered
updates. Each arm's development-only minimax quality rule selects one fraction
across both task families, with the earlier fraction breaking an exact tie;
confirmation never changes it.

Optimizer parameters may differ only through the frozen search space; actual
tokens, updates, wall time, compute, bytes, failures, and energy are retained.
Unused budget is not transferred. The candidate cannot receive a newer
compiler, more tuning, privileged kernel metadata, additional calibration data,
or a more favorable checkpoint rule than a baseline.

Development training seeds are `17001`--`17008`; every resource or lifecycle
planning cell has exactly 40 development blocks, five assigned to each seed by
the committed development schedule. A custodian commits the confirmation
reserve `17101`--`17132`, evaluation-order seeds `17201`--`17240`, the complete
development schedule, and a Merkle root over the canonical schedule leaf for
**every** allowed $(n,m)$ before development results are analysed. A leaf uses
the first $n$ confirmation seed IDs and the allocation/order algorithm above;
its key is `scale × hardware × profile × context × comparator × n × m`, and its
value contains all ordered block tuples. Selection merely reveals the matching
precommitted leaf; generating or editing a schedule after development is
forbidden. PCG64 state and every substream are derived as the first unsigned 64
bits of `SHA-256("F017|namespace|scale|seed|purpose")`; cross-namespace overlap
aborts the release. The analysis rule selects a 16-, 24-, or 32-seed
confirmation prefix before reveal. One same-seed infrastructure retry is
allowed before outcomes are visible, but all failed work and energy remain in
the lifecycle account. Any unresolved missing arm, scale, or seed makes the
affected component fail rather than shrinking the denominator.

Activation, embedding, normalization, cache, scale-factor, and accumulator
precision are declared separately. A label such as “1.58-bit” applies only to
the encoded weight alphabet unless every other precision and byte boundary is
also stated.

Lifecycle energy through $N$ **fixed-work processed output-token positions** is

$$
\begin{aligned}
E_{a,s,h,k}(N)={}&
\frac{E_{\mathrm{data},a,s}+E_{\mathrm{tune},a,s}}{16}
+E_{\mathrm{train},a,s,k}+E_{\mathrm{failed},a,s,k}\\
&+E_{\mathrm{compile},a,s,h,k}+E_{\mathrm{convert},a,s,h,k}
+E_{\mathrm{retrain},a,s,h,k}+N e_{\mathrm{infer},a,s,h,k}.
\end{aligned}
$$

Here $a$ is the arm, $s\in\{S,L\}$ the scale, $h$ the primary backend, and
$k$ one paired confirmation training seed/checkpoint. Every term is in joules
and $e_{\mathrm{infer},a,s,h,k}$ is net measured joules per fixed-work processed
output-token position under the registered service mix. Dataset preparation and
all development trials are allocated with the frozen denominator 16, even when
24 or 32 confirmation seeds are selected; extra checkpoints, transfer, and
replication never dilute fixed energy. Training and failed-attempt terms belong
to checkpoint $k$; compile, conversion, and inference terms are backend-
specific. Each indexed contrast represents deployment of **one** checkpoint
serving the full horizon $N$; traffic is not divided across confirmation
replicas. Total unallocated campaign energy is also reported but cannot replace
this paired service-unit estimand.

Engineering time is reported in person-hours and never converted to joules by
an invented coefficient. Accepted output tokens and joules/request belong only
to the separate end-to-end gate and never enter this equation.

The primary deployment service mix is frozen as 50% batch-1, 30% concurrency-4,
and 20% batch-16 requests, split equally between contexts 512 and 2,048, each
with 256 processed output positions. Its measured weighted
$e_{\mathrm{infer}}$ is evaluated at the registered horizon
$N_H=10{,}000{,}000{,}000$ processed output-token positions. For a candidate
$T$ and any systems-cost comparator $B$, the paired diagnostic break-even horizon
is

$$
N^*_{s,h,k}=
\frac{E_{\mathrm{fixed},T,s,h,k}-E_{\mathrm{fixed},B,s,h,k}}
     {e_{\mathrm{infer},B,s,h,k}-e_{\mathrm{infer},T,s,h,k}},
$$

only when the denominator is positive and both energies share a calibrated
boundary. Otherwise $N^*$ is undefined, not infinite savings. Promotion
requires the simultaneous one-sided 95% upper bound of the paired checkpoint
contrast $E_{T,s,h,k}(N_H)-E_{B,s,h,k}(N_H)$ to be below zero for every
systems-cost comparator $B$, scale, and hardware backend. Reporting a favorable
$N^*$ without passing this finite-horizon lifecycle test is forbidden.

Training and inference energy require a calibrated external wall or rail meter,
owned non-overlapping intervals, idle observations, stated facility boundary,
sampling resolution, uncertainty propagation, and randomized/reversed block
order. Software power estimates and modeled operation counts are diagnostics
only. Without valid meter data the energy endpoint is `not measured` and the
fixture cannot claim an energy crossover.

## Measurements and units

Measurements remain per seed, scale, family, slice, hardware, and profile:

- negative log likelihood (`nat/token`) and perplexity (`1`);
- exact match, macro-F1, pass rate, refusal precision/recall, and protected-slice
  accuracy (`1`);
- expected calibration error and maximum calibration error (`1`);
- output-distribution divergence from the matched reference (`nat/token`);
- training loss, gradient/activation overflow, failed updates, and checkpoint
  stability (declared raw units and counts);
- time to first token, inter-token latency, and p50/p95/p99 latency (`ms`);
- accepted output throughput (`token/s`) under the frozen concurrency profile;
- durable checkpoint, packed weights, cache, peak device, and peak host memory
  (`B`);
- device/host transfer and memory-controller traffic where a validated counter
  exists (`B`), otherwise `not measured`;
- compile, conversion, load, warm-up, and training time (`s`);
- net block energy (`J`), energy per fixed processed token and per accepted
  output token (`J/token`), end-to-end energy (`J/request`), mean power (`W`),
  and propagated 95% uncertainty (`J`, `J/token`, `J/request`, `W`); and
- optimizer trials, engineering time (`person-h`), failures, retraining events,
  and amortization horizon (`token`).

Correctness is an exact prerequisite. Before kernel development,
**native-signatures.json** freezes a separate `arm × backend` acceptance rule:

- the ternary CPU path may load only packed 2-bit weight words and declared scale
  metadata and may use integer/vector loads, masks, XOR/AND/OR, shifts,
  population count, and signed INT32 accumulation; any FP16/BF16/INT8 weight
  matrix, wider unpack buffer, or call to a wider GEMM is forbidden;
- the ternary GPU path may load packed uint32 words and use CUDA bitwise, POPC, and
  signed integer-accumulation instructions followed by the declared scale
  operation; cuBLAS wider-weight GEMM, wider tensor-core weight MMA, and any
  unpacked weight allocation are forbidden;
- INT8 CPU/GPU arms must retain signed 8-bit weights through their sealed native
  vendor or open kernel, and INT4 arms must retain packed 4-bit weights through
  their sealed native kernel. Each baseline rule names allowed kernel symbols,
  storage dtype, accumulator dtype, instructions, scale metadata, and trace
  tooling; FP/BF16 fallback, silent dequantization to a persistent wider matrix,
  and a reference-only slow kernel are forbidden. The BF16/FP16 arm has an
  analogous native full-precision signature; and
- static binary/IR/disassembly inspection, CPU allocation tracing, and
  CUPTI/Nsight kernel and allocation traces must all name the sealed kernel and
  show that **no** wider full-matrix or layer-sized weight buffer is ever
  allocated for any arm. Per-layer sentinel scans and peak-allocation ledgers
  cover every weight object. Missing or unsupported trace tooling fails the
  corresponding arm's native gate.

The independent golden pack contains 4,096 matrices spanning both scales,
tails, zeros, extreme activations, alignment boundaries, and accumulator
overflow edges. The signed integer accumulator must match bit-for-bit before
scaling. Scaled FP32 output must satisfy absolute error at most $2^{-16}$ and
relative error at most $2^{-12}$; BF16/FP16 output must satisfy absolute error
at most $2^{-10}$ and relative error at most $2^{-8}$. Native and emulated paths
must also produce identical accepted-token decisions. A shared wrong output
does not pass; the mathematical reference, vector generator, and expected
outputs have independent implementation and provenance.
INT8, INT4 when present, and BF16/FP16 receive parallel 4,096-case golden packs
from independent dtype-specific reference operators; comparator eligibility
requires their exact integer accumulators or declared floating tolerances to
pass under the same failure rule.
Relative error is evaluated only when the absolute reference magnitude is at
least $2^{-12}$ for FP32 or $2^{-8}$ for BF16/FP16. Below that dtype-specific
floor the relative condition is marked `not applicable` and the absolute
tolerance remains mandatory; zero never enters a relative denominator.

## Required ablations and interventions

The native ternary arm is rerun with:

1. native execution replaced by widening/emulation while retaining the same
   checkpoint and workload;
2. from-scratch ternary training replaced by post-training rounding;
3. each permitted activation precision and accumulator precision swept
   independently;
4. packed weights expanded in memory before the kernel, isolating data movement;
5. scale factors made per-tensor, per-channel, and the frozen candidate choice;
6. cache reuse disabled and context/batch profiles swept without pooling them;
7. equal kernel-engineering budgets at 0.5×, 1×, and 2×;
8. training tokens and parameter scale swept at the preregistered adjacent
   points while retaining equality within a point;
9. compiler version and optimization flags changed only in a registered
   robustness matrix shared by every supported arm;
10. one hardware backend withheld to test whether the conclusion is backend-
    specific; and
11. lifecycle horizons swept across the confidence interval for $N^*$.

The training recipe receives causal credit only if post-training ternary fails
the quality gate while the from-scratch arm passes under the same data and
evaluation budget. Native execution receives cost credit only if it beats the
emulated diagnostic with structural proof that wider materialization is absent.

## Analysis and statistical plan

Development seeds tune models and kernels; they cannot support a verdict.
Before confirmation, an offline custodian commits salted SHA-256 digests of
independent 64-bit training seeds, evaluation-order seeds, and meter-block
assignments. The bundle is revealed only after code, checkpoints, workload
objects, scorers, hardware configuration, meter plan, hypotheses, and analysis
are immutable. Reveal validation rejects every overlap across development,
confirmation, scale, task family, and block namespace.

The exact primary family has 12 outer hypotheses:

1. aggregate quality noninferiority in predictive-distribution tasks;
2. worst-slice quality noninferiority in predictive-distribution tasks;
3. aggregate quality noninferiority in constrained-generation tasks;
4. worst-slice quality noninferiority in constrained-generation tasks;
5. CPU p99 fixed-work batch-1 latency superiority;
6. CPU measured fixed-work energy-per-processed-token superiority;
7. CPU peak model/device-byte superiority;
8. accelerator p99 fixed-work batch-1 latency superiority;
9. accelerator measured fixed-work energy-per-processed-token superiority;
10. accelerator peak model/device-byte superiority;
11. CPU total lifecycle-energy superiority at $N_H$; and
12. accelerator total lifecycle-energy superiority at $N_H$.

Items 1--4 compare native ternary with every matched BF16/FP16 reference path
in arm 1.
Items 1 and 3 own only aggregate full-population components: macro NLL and
calibration for predictive distribution, and macro exact match/F1/pass rate and
calibration for constrained generation. Their margins are +0.02 `nat/token`
NLL, -1 percentage point exact/F1/pass rate, and +0.01 calibration error. Items
2 and 4 own no aggregate component; they are the maximum across every frozen
common, rare-token, long-context, multilingual, formatting, refusal, and
protected slice, with -2 percentage points for accuracy/pass metrics, +0.02
`nat/token` NLL, and +0.01 calibration error. Each outer value is the maximum
valid component $p$-value across both scales, both primary backends, and exactly
the components assigned to that row. Aggregate and worst-slice rows are
therefore distinct and cannot substitute for one another.

Items 5--12 are intersection--union tests against **every** arm in that
hardware's systems-cost comparator set. Latency entries own the batch-1 profile
and both contexts; fixed-work energy entries own all three profiles and both
contexts; byte entries own all profiles and contexts; lifecycle entries use the
registered service mix. Each value is again the maximum valid component
$p$-value across comparator, scale, profile where applicable, context, and
registered workload stratum. Confirmation checkpoint pairs are the independent
observations; scheduled meter blocks are nested technical repeats. No pooling
can hide a failed scale, context, profile, full-precision comparator, or low-bit
comparator. Holm controls exactly these 12 values at familywise 0.05.

Every scalar component is converted to signed checkpoint-pair benefit $b_k$ for
which larger is better at registered boundary $\delta$. The studentized
statistic $(\bar b-\delta)/(s_b/\sqrt n)$ uses exactly 1,000,000 boundary-null
replicates $b_k^*=\delta+\xi_k(b_k-\bar b)$ and
$T^*=(\bar b^*-\delta)/(s_b^*/\sqrt n)$. Draw 1 is the all-positive sign
vector; the remaining 999,999 independent Rademacher vectors come from PCG64
state derived as the first 128 bits of
`SHA-256("F017|randomization|outer|component")`. The one-sided value is
$(1+\#\{T^*\ge T\})/1{,}000{,}001$. Zero-variance components pass only if every
checkpoint pair is strictly beyond the boundary; otherwise $p=1$.
For any resampled draw with $s_{b}^{*}=0$, define $T^*=+\infty$ when
$\bar b^*-\delta>0$, $T^*=0$ when it equals zero, and $T^*=-\infty$ when it is
negative; no draw is discarded or redrawn.

A 100,000-resample hierarchical paired bootstrap, with PCG64 state derived from
`SHA-256("F017|analysis-bootstrap-v1")`, resamples checkpoint-pair seed clusters
and then their nested meter blocks, while drawing meter-calibration error from
its frozen distribution. It produces simultaneous one-sided 95% bounds for quality margins, resources,
$E_{T,s,h,k}(N_H)-E_{B,s,h,k}(N_H)$, and $N^*_{s,h,k}$. Resource superiority requires the corrected
bound to exclude zero and at least 10% relative reduction. Peak-byte superiority
is also recomputed exactly from retained artifacts.

The confirmation training prefix and meter-block prefix are selected before
reveal. The registered boundary $\delta$ is distinct from the planning
alternative $\mu_{\mathrm{plan}}$, the ordinary mean of the eight equally
weighted development checkpoint aggregates. A resource or lifecycle aggregate
first averages all five development blocks within its checkpoint; quality and
end-to-end components use their one frozen checkpoint aggregate. If
$\mu_{\mathrm{plan}}\le\delta$ for any required component, every candidate has
zero planning power for that component.

For each candidate
$(n,m)\in\{16,24,32\}\times\{24,32,40\}$ with $m\ge n$, planning simulates its
**exact precommitted confirmation allocation**, rather than treating 24--40
blocks over eight development seeds as if they were 16--32 independent seeds.
For each scalar component and candidate pair, exactly 100,000 hierarchical
replicates use PCG64 state from
`SHA-256("F017|power-sd|outer|component|n|m")`. A replicate draws $n$ donor
checkpoint indices with replacement from the eight development checkpoints.
Its between-checkpoint residual is that donor's checkpoint aggregate minus
$\mu_{\mathrm{plan}}$. For a resource or lifecycle component, each block in
the candidate's committed $(n,m)$ schedule additionally draws with replacement
one of the selected donor's five centered within-checkpoint block residuals;
the synthetic checkpoint benefit is the mean of its assigned synthetic blocks.
For quality and end-to-end components the synthetic benefit is simply
$\mu_{\mathrm{plan}}$ plus the drawn between-checkpoint residual. The ordinary
sample SD across the $n$ synthetic checkpoint benefits is retained.
$s_U(n,m)$ is the 95,000th ordered value of those 100,000 SDs. This frozen
hierarchical empirical planning model preserves the independent checkpoint as
the unit and technical blocks as nested repeats; it does not assert a population
variance estimate from eight clusters.

When $\mu_{\mathrm{plan}}>\delta$, noncentral-$t$ power has $n-1$ degrees of
freedom and noncentrality
$(\mu_{\mathrm{plan}}-\delta)\sqrt n/s_U(n,m)$. It uses the first Holm cutoff
of the owning family: $\alpha=0.05/12$ for the primary family and
$\alpha=0.05/3$ for the separate end-to-end family. If $s_U(n,m)=0$, planning
power is defined as 1 when $\mu_{\mathrm{plan}}>\delta$ and 0 otherwise; no
division by zero is evaluated. The planning code chooses the
lexicographically smallest $(n,m)$ giving at least 0.90 power for every
applicable primary-family and end-to-end component. The code, library
version, resample indices, inputs, and result are committed. If $(32,40)$ fails,
confirmation does not begin; a revealed pack is never extended.

The candidate must pass all four quality hypotheses, both lifecycle
hypotheses, and at least two of the three resource hypotheses on **each**
hardware class; measured fixed-work energy is mandatory among the passing two.

The candidate must additionally be Pareto-nondominated against arms 1--3 in
quality, protected risk, latency, throughput, memory, measured energy, training
cost, and engineering time. Dominance uses simultaneous one-sided 95% bounds;
one strict improvement and no margin violation are required. Results are
reported separately by scale, task family, hardware, batch, and context.

In the separate end-to-end family, answer coverage may be no more than 1 percentage
point below **every** systems-cost comparator, accepted-output quality
must meet the same frozen margins, and joules/request cannot worsen by more
than 5% with a simultaneous one-sided 95% bound. Refusals and early stops
remain in the request denominator.
These are exactly the three outer Holm values described above. Each is the
maximum component value across both scales, primary backends, four request
strata, two contexts, and every comparator, using checkpoint-pair seed
aggregates and the same signed-benefit randomization algorithm with RNG label
`F017|e2e-randomization|outer|component`. Holm controls exactly those three
values at familywise 0.05 independently of the primary 12-value family; all
three are mandatory hard gates.

## Promotion, rejection, and kill rules

Reject C-013 for this fixture if any quality hypothesis fails, either hardware
class lacks a genuine native path, an eligible low-bit comparator is missing
or artificially weakened, either finite-horizon lifecycle hypothesis fails, or
fewer than two resource dimensions including measured fixed-work energy improve
against the complete systems-cost comparator set on either hardware class.

Immediate kill conditions are:

- different corpora, token order, tokenizer, parameter count, training tokens,
  evaluator access, checkpoint opportunities, tuning trials, or engineering
  budget across eligible arms;
- a required scale, training seed, context, inference profile, scheduled meter
  block, low-bit comparator, failed attempt, or registered lifecycle term
  is omitted or pooled away;
- hidden unpacking or FP/BF16/INT8 weight materialization in the claimed native
  ternary path, or an undeclared conversion/fallback in any baseline path;
- activation, accumulator, cache, scale-factor, sparsity, compiler, or kernel
  precision omitted from the record;
- a baseline denied a supported optimized kernel or run under a different
  thermal, power, batch, context, or correctness boundary;
- checkpoint or prompt selection after confirmation outcomes are visible;
- a shared-but-wrong output accepted as correctness;
- emulation-only, modeled-operation, software-telemetry, uncalibrated-meter,
  overlapping-interval, or facility-unowned values used as measured energy;
- training, failed-run, conversion, compilation, retraining, or engineering
  burden omitted from the lifecycle account;
- a favorable inference-only result is described as a lifecycle crossover when
  either indexed $E_{T,s,h,k}(N_H)-E_{B,s,h,k}(N_H)$ bound fails;
- a favorable hardware, task, scale, slice, or batch pooled with a failed one;
- output shortening, refusal, cache prepopulation, or excluded requests used to
  reduce the fixed-work or end-to-end denominator; or
- an oracle or future evaluator signal enters training, kernel selection, or
  stopping.

Promotion requires a rerunnable release, raw meter and correctness artifacts,
independent reproduction on a second machine of each hardware class, and a
reviewed evidence bundle. Until native kernels, checkpoints, sealed releases,
and calibrated measurements exist, F-017 is protocol-complete but
non-executable and makes no performance or energy claim.

## Required artifacts and execution boundary

Every run preserves the source commit, corpus/tokenizer/checkpoint hashes,
architecture and precision manifest, seed commitment/reveal receipt, training
event log, optimizer trials, confirmation-prefix power receipt, failures,
scorer and evaluator versions, golden operator vectors and tolerance results,
packed checkpoint, per-arm/backend native-signature manifest, enumerated-path
and systems-cost-comparator eligibility receipt, trace-tool versions, kernel
source/binary/IR/disassembly hashes, compiler and driver identities, structural
layout/traffic proof, sealed hardware/firmware inventory, workload order,
complete paired-block schedule including failed attempts, prompts and fixed-
work/accepted-token denominators, checkpoint-to-block allocation, the sealed
4,096-request end-to-end pack and every failure denominator, raw timing blocks, meter calibration and
samples, idle/facility boundary, resource counters, engineering-time ledger,
per-seed metrics, hierarchical resample indices, corrected 12-value analysis,
separate corrected three-value end-to-end analysis,
ablations, every lifecycle term, $N_H$ contrast, break-even calculation, and
every rejection.

The first executable slice may train tiny deterministic models and validate
packing, reference-operator parity, workload lineage, counterbalanced timing,
meter refusal, and analysis recomputation. It remains smoke-only. It cannot
promote C-013 until the full native two-hardware, two-scale, sealed-confirmation
contract is executed and independently reproduced.

## Harness status

Blocked by: not-built.

The Required artifacts and execution boundary section defines a smoke-only first slice that trains tiny deterministic models and checks packing, operator parity, timing and analysis recomputation; no generator, runner or tests exist yet. Claim-eligible runs need the frozen Ryzen 9 7950X and RTX 4090 reference pair.
