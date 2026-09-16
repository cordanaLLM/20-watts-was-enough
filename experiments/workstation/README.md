# Workstation execution contract

The repository now contains eleven executable smoke harnesses alongside research
and protocol specifications, but no workstation-ready scientific package:
[Candidate 010](candidate-010/README.md) exercises staged verification and
[Fixture F-007](fixture-007/README.md) exercises optical null-space honesty;
[Fixture F-012](fixture-012/README.md) exercises layout-population performance
inference; [Fixture F-019](fixture-019/README.md) exercises the FM-T02
endogenous-feedback forecast boundary;
[Fixture F-022](fixture-022/README.md) exercises the DEV-T01 positional-memory
corruption and fallback boundary;
[Fixture F-023](fixture-023/README.md) exercises the PLM-T01 duration-memory and
PLM-T02 lifecycle-reset boundaries; and
[Fixture F-024](fixture-024/README.md) exercises the AMR-T01 projected-memory
development path; [Fixture F-025](fixture-025/README.md) exercises the ECM-T03
record, amplitude, repeat-consistency, and equivalence gate order;
[Fixture F-026](fixture-026/README.md) exercises the RSD-T01 exact family ×
history grid, separately evaluated trace-fact vector, trajectory-score, and
interface-validity diagnostics; and
[Fixture F-027](fixture-027/README.md) exercises the RIN-T01 interconnection,
edge-removal, interface-validity, and bounded-insulation diagnostics; and
[Fixture F-029](fixture-029/README.md) co-receipts separate CMB-X01 recruited-
maintenance and CMB-X04 phase-qualified preservation/release construction
diagnostics without cross-track comparison.
A test becomes workstation-ready only when its
checked manifest exists at `experiments/workstation/manifests/<artifact-id>.json`,
passes `npm run validate:workstation`, declares `workstation-ready`, names all
six fields below, and binds a hashed multi-domain hardware-confirmation evidence
bundle. A `smoke-ready` manifest proves only that the deterministic plumbing
runs; it does not upgrade any claim to workstation-executable.

## Run the development smoke suite

The suite orchestrator discovers only manifests that pass the repository
validator and declare `smoke-ready`. It executes each manifest's checked
`prepare` and `smoke` commands without a shell. Where the smoke command owns an
explicit run directory, it also executes the registered `analyze` and
`validate` commands against that same directory. It never executes a
development `run`, confirmation, held-out, release, or promotion action.

```bash
node experiments/workstation/smoke-suite.mjs --list
node experiments/workstation/smoke-suite.mjs --all --dry-run
node experiments/workstation/smoke-suite.mjs --artifact fixture-029 --output-root tmp/smoke-fixture-029
node experiments/workstation/smoke-suite.mjs --all --output-root tmp/smoke-all-001
```

Every real invocation writes `smoke-suite.receipt.json` under the chosen output
root, continues across artifacts by default, and returns nonzero if any action
fails. `--fail-fast` stops after the first failed artifact. The receipt is
explicitly `NO_RESULT`: passing all eleven smoke harnesses verifies bounded
development plumbing only; it supplies no confirmation, scientific result,
energy comparison, or claim-promotion evidence.

## CI scheduling

`npm run check` remains the complete local merge floor and runs the workstation
inventory through one bounded Go aggregate with four active commands by
default and a hard ceiling of eight. GitHub full CI separately runs the
non-workstation quality gate, workstation core, and a closed test matrix. Under
[decision 0065](../../decisions/0065-isolate-fixture-026-ledger-semantics.md),
Fixture 026 uses eight fixed file-level jobs and Fixture 029 uses two; the other
nine artifacts retain one job each. Impact plans expand only the selected
artifact, while a
full plan requires all 19 matrix entries. The GitHub matrix retains its
eight-job concurrency cap; that remote scheduling bound is not experiment
parallelism or scientific evidence.

With eight GitHub runners available, the workstation matrix is initially
expected to finish in roughly five to seven minutes because its two longest
Fixture 026 cases run beside one another. That range is a planning estimate,
not a measured result: runner queueing, cold installation and host variation
remain outside it until complete CI runs provide observations.

The small Go catalogue command checks the same manifests as release planning,
including their explicit source-only, withheld, or release-image boundary:

```bash
go -C tooling run ./cmd/20w experiment validate --root ..
```

## Run a released experiment image

Containers are the public execution default. Release automation now admits one
image per released experiment instead of one image containing unrelated
harnesses. Releases from v0.3.0 whose source contains and passes the release
workflow publish the two Linux `amd64` images below:

| Artifact | Image | Runtime boundary |
| --- | --- | --- |
| Fixture 007 | `ghcr.io/lusoris/20-watts-was-enough-fixture-007` | Node.js 26.8.1 and the closed Fixture 007 runtime files |
| Fixture 019 | `ghcr.io/lusoris/20-watts-was-enough-fixture-019` | Node.js 26.8.1, CPython 3.14.7, NumPy 2.5.2 and the closed Fixture 019 runtime files |

For an admitted release, download its checksum-bound and attested
`oci-images.json` asset and copy the complete `image@sha256:...` identity from
that file. Pull and run that identity directly; do not reconstruct it from a
tag or substitute `latest`. Release notes may repeat the identity but are not
its authority:

```bash
image='ghcr.io/lusoris/20-watts-was-enough-fixture-007@sha256:...'
docker pull "$image"
digest=${image##*@}
docker image inspect \
  --format 'source={{index .Config.Labels "org.opencontainers.image.revision"}} platform={{.Os}}/{{.Architecture}}' \
  "$image"
```

The release tag locates the snapshot; the digest identifies the exact image.
The commands below forbid an implicit pull, disable networking, make the image
filesystem read-only, drop Linux capabilities and prevent privilege
escalation. Only the named result volume remains writable.

### Fixture 007: optical null-space diagnostic

The Fixture 007 image runs as UID 1000 and writes only through `/results`. A
named Docker volume avoids assuming that the host user's numeric ID maps to the
container user. Run the smoke, analysis and validation actions against the same
volume:

```bash
volume=20w-fixture-007-vX-Y-Z-run-001
docker volume create "$volume"
docker run --rm --pull never --network none --read-only \
  --cap-drop ALL --security-opt no-new-privileges \
  --env "EXPERIMENT_IMAGE_DIGEST=$digest" \
  --mount "type=volume,src=$volume,dst=/results" \
  "$image" smoke --profile smoke --output /workspace/results/smoke
docker run --rm --pull never --network none --read-only \
  --cap-drop ALL --security-opt no-new-privileges \
  --env "EXPERIMENT_IMAGE_DIGEST=$digest" \
  --mount "type=volume,src=$volume,dst=/results" \
  "$image" analyze --output /workspace/results/smoke
docker run --rm --pull never --network none --read-only \
  --cap-drop ALL --security-opt no-new-privileges \
  --env "EXPERIMENT_IMAGE_DIGEST=$digest" \
  --mount "type=volume,src=$volume,dst=/results" \
  "$image" validate --output /workspace/results/smoke
```

Use a new volume name for each run; the append-only runner refuses to replace
an existing output directory. The volume persists until you deliberately
remove it. A bind mount is also valid when its host directory is writable by
container UID 1000; that mapping depends on the host and container runtime, so
it is not the portable default.

### Fixture 019: fixed-point forecast diagnostic

Copy Fixture 019's complete identity separately from the same
`oci-images.json` asset, because its digest and runtime are independent of
Fixture 007:

```bash
image='ghcr.io/lusoris/20-watts-was-enough-fixture-019@sha256:...'
docker pull "$image"
digest=${image##*@}
docker image inspect \
  --format 'source={{index .Config.Labels "org.opencontainers.image.revision"}} platform={{.Os}}/{{.Architecture}}' \
  "$image"
volume=20w-fixture-019-vX-Y-Z-run-001
docker volume create "$volume"
docker run --rm --pull never --network none --read-only \
  --cap-drop ALL --security-opt no-new-privileges \
  --env "EXPERIMENT_IMAGE_DIGEST=$digest" \
  --mount "type=volume,src=$volume,dst=/workspace/results" \
  "$image" smoke --profile smoke --output /workspace/results/smoke --resume false
docker run --rm --pull never --network none --read-only \
  --cap-drop ALL --security-opt no-new-privileges \
  --env "EXPERIMENT_IMAGE_DIGEST=$digest" \
  --mount "type=volume,src=$volume,dst=/workspace/results" \
  "$image" analyze --output /workspace/results/smoke
docker run --rm --pull never --network none --read-only \
  --cap-drop ALL --security-opt no-new-privileges \
  --env "EXPERIMENT_IMAGE_DIGEST=$digest" \
  --mount "type=volume,src=$volume,dst=/workspace/results" \
  "$image" validate --output /workspace/results/smoke
```

Both images write development outputs with `claim_eligible=false` and
`scientific_result=false`; report them as `NO_RESULT`. Passing their smoke,
analysis and validation actions shows that the bounded diagnostic ran in the
released software environment. It does not normalize host hardware or timing,
provide calibrated energy measurements, reveal private confirmation material,
repair a protocol limitation, or promote a scientific claim.

The smoke action copies the explicitly supplied digest into
`run.json.execution_receipt` beside the baked image name, release version and
source revision, plus the observed Node.js version, operating system,
architecture, command and profile. A release image refuses to create output
when `EXPERIMENT_IMAGE_DIGEST` is missing or is not an exact lowercase
`sha256:` digest. Image name, version, digest, source revision, Node.js runtime,
operating system and architecture must still match that stored receipt during
analysis and validation; a different image or a source-tree process refuses
the output. This receipt is execution provenance; it is deliberately outside
the scientific `run_id`.

When reporting a defect through the
[experiment issue form](https://github.com/cordanaLLM/20-watts-was-enough/issues/new?template=experiment-protocol-problem.yml),
include the exact identity copied from `oci-images.json`, release tag, source
revision and architecture, exact commands, output volume or bind path and the
`NO_RESULT` receipt. Do not
upload private inputs, secrets or machine credentials. The affected manifest
remains the authority for any stronger workstation or confirmation
requirement.

1. **Command:** one non-interactive entry point with `prepare`, `smoke`, `run`,
   and `analyze` actions that returns a nonzero exit code when preparation,
   execution, analysis, or registered acceptance checks fail.
2. **Environment:** locked operating-system, driver, runtime, library, and
   container or environment identities.
3. **Hardware:** supported CPU, GPU, memory, storage, power-meter, and thermal
   assumptions, including a smaller smoke-test profile where possible.
4. **Seeds:** immutable development, confirmation, and held-out seed manifests;
   the confirmation set must remain unavailable during tuning.
5. **Data:** generation or acquisition procedure, versions, hashes, licenses,
   partitions, and cache locations.
6. **Outputs:** append-only raw events, measurements with units and uncertainty,
   machine-readable decisions, plots, and a reproducibility manifest.

## Required runner behavior

The future runner must support four separate actions:

1. `prepare` validates dependencies, disk space, hardware support, and data;
2. `smoke` completes a small deterministic run without claiming a result;
3. `run` executes a frozen experiment or named track; and
4. `analyze` rebuilds every aggregate and plot from raw outputs and evaluates
   the registered rejection rules.

Resuming an interrupted run must not change seeds or silently discard failures.
Energy runs must retain raw meter samples, wall-clock boundaries, idle policy,
device and software identity, sampling cadence, and uncertainty. Modeled and
measured joules remain separate output fields.

## Promotion sequence

1. Complete the written protocol gate in [test coverage](../test-coverage.md).
2. Implement the smallest deterministic simulator and strongest ordinary null.
3. Add budget-enforcement and accounting unit tests before the candidate.
4. Add a smoke profile that runs on an ordinary machine.
5. Freeze configuration, seeds, analysis, and rejection rules.
6. Only then add the full workstation profile and measured-energy instrumentation.

The coverage audit reports zero executable claims until manifests and their
referenced files actually exist.

[Fixture F-019](fixture-019/README.md) now implements the CPU-only FM-T02
forecast slice for C-1481 with a NumPy-PCG64DXSM generator, independently coded
reference solver, one-pass and full-feedback paths, zero-impact/overlap/funding
interventions, corruption-evident resume, and recomputed development analysis.
FM-v1/FM-T02 is structurally non-promotable: its validator and the central gate
reject every evidence bundle and every confirmation/held-out reveal, not only
the publicly derivable label hashes. The development shakedown found that the
frozen aggregate endpoint is effectively seed-invariant
under the protocol's symmetric shocks and proportional sales, so confirmation
is explicitly blocked pending a reviewed protocol revision. No result or
energy conclusion follows.

[Fixture F-022](fixture-022/README.md) implements a bounded public-development
smoke path for C-1506 / DEV-T01. It exercises valid, independent, local-patch,
and common-mode positional-memory states against an open-write diagnostic, a
robust propagation null, and a gated proposal. Common-mode corruption must
trigger abstention and charge the complete null fallback; valid memory must not
trigger a false fallback. The registered Potts/total-variation null, private
partitions, paired inference, and reference-workstation contract remain
unimplemented, so every output is `NO_RESULT`.

[Fixture F-023](fixture-023/README.md) implements bounded public-development
smoke paths for C-1516--C-1517 / PLM-T01--PLM-T02. The first path exercises
duration accumulation, a conventional duration filter, and independent
latches under interruption and missingness. The second exercises carried
state, a change-point null, and evidence-gated fractional reset; duplicate,
delayed, or missing lifecycle boundaries force reset-capable arms to abstain.
The two paths share closed accounting and authority contracts but make no
comparative, scientific, energy, or promotion claim.

[Fixture F-024](fixture-024/README.md) implements a bounded public-development
smoke path for C-1526 / AMR-T01. It generates stable two-variable linear
systems, executes Markov-only, finite-memory, and exact augmented-state paths,
and verifies finite clipped records through a corruption-evident checkpoint
ledger. The exact augmented arm is an analytical ceiling with evaluator state,
not a matched-information confirmation comparator. No confirmation or transfer
seed or commitment has been created; no comparison, performance result, energy
conclusion, or claim eligibility follows.

[Fixture F-025](fixture-025/README.md) implements the first bounded
public-development execution slice for C-1532 / ECM-T03. It generates five
balanced spectrum classes, executes ungated, residual-screen, and ordered-gate
paths, and requires record/provenance failure to stop before physics probes,
nonlinearity to stop at the amplitude gate, and terminal-equivalent circuits
to remain non-identifying. Its repeat statistic is a smoke surrogate rather
than the registered finite-band Kramers--Kronig calibration. The other nine
tracks, private partitions, physical apparatus, and scientific adjudication
remain absent; every event is `NO_RESULT`.

[Fixture F-026](fixture-026/README.md) implements a bounded public-development
generator-only smoke slice for C-1540 / RSD-T01 and a separate deterministic
bounded T02-MECH construction/conformance runtime. A separate C-1561 module
implements the repeated-stimulus plant/event constructor, and a bounded
append-only panel runner freezes its 229-unit execution schedule without
executing it. Every RSD-T01 public seed
contains the
exact five-generator-family × four-history Cartesian grid plus four distinct
malformed-interface sentinels. The harness uses canonical decimal-string
uint64 seeds, seed-dependent band-limited stochastic histories, shared
initialization identities across histories, and separately evaluated
evaluator-only per-world trace facts; structural causal memory remains
unassessed. Generator family remains a secondary synthetic diagnostic because
its properties overlap. The two legacy probes have unequal
information and incomplete resource budgets, so they cannot support a
property-performance, arm-comparison, or efficiency conclusion. The full null
stack, scientific hostile grid, private partitions, powered statistics,
reference lifecycle and calibrated workstation measurements remain absent.
T02-MECH now supplies a closed generator/evaluator for three O0 descriptors
crossed with three conditioned time scales and an exact 26-episode O1 panel,
plus a policy firewall, typed event schema, append-only resume ledger and
recomputed construction analysis over a hashed one/two-seed ordered prefix. An
  additive pre-evaluator stage commits all nine fixed whole-system
  policy-conformance responses under exact information and cap parity; they use
  construction-tuned public thresholds, zero labels and zero tuning trials and
  are not mature nulls or trained estimators. The ordered bank has zero inactive
  roles. Comparison and claim authority remain absent. A separate closed
Stage-3 design assigns the 64 public seeds to 32 fit, 16 calibration and 16
evaluation roles while denying seed-level replication: these seeds alter only
an opaque state-handle permutation. It freezes the access cut and future
null/endpoint gates, not a powered comparison. A sibling fixed-finite-family-
panel contract, five-family public registry, and exact generator now construct
20 metadata-bound development instances with one parameter vector and one time
constant across 26 schedules. The base conformance runner materializes all
39,962 causal rows for one such instance, closes the policy view, and records
nine hash-chained response/resource slots. An additive overlay now binds a
content-addressed 26-projection abstention policy, executes it in a fresh
restricted child, semantically replays its complete response bank, and supports
ownership-bound on-disk resume with hostile concurrency, path, mutation,
oversize, and lock-replacement checks. A separate compact population runner
traverses all 20 unique instances and receipts the resulting 520 episodes,
799,240 transcript rows, and 180 arm invocations with exact family/instance
weights and deterministic prefix replay. An integrated runner now composes
that traversal with the restricted child and durable fixed-instance overlay:
20 identity-keyed instance directories, 180 terminal arm records and a bounded
outer ledger resume without duplicate independent units. The population
artifact does not retain causal payloads and has no external rollback-proof
head. Two deterministic trainable
level-two null prototypes can consume the
validated transcript through a post-run adapter, but are uncalibrated and not
runner-integrated. A four-hypothesis bootstrap-$t$/Holm analyzer and a
variance-only normal/binomial planning calculator now execute as unfrozen
method checks. The analyzer exposes its data-dependent bootstrap p-value floor;
the planner is now exercised by four exact-analyzer synthetic transcript
scenarios. The null Monte Carlo interval spans the 0.05 reference, the
alternative rejection interval falls far below the illustrative target, and
both small-sample hostiles fail bootstrap resolution throughout, so the current
planning assumptions are rejected rather than frozen. No reviewed real pilot,
final power plan, custody payload, endpoint-bearing policy run, or comparison
authority exists.
  The pulse module has executed bounded positive,
feed-forward, linear-feedback, dead-time and alias construction checks. Its
panel runner defaults to zero work, retains explicit incompleteness and binds
source/runtime identities and byte budgets; the six-duration refractory,
noise and mixed-window panels and actionable estimators remain unexecuted. O2,
T02-FLOOR execution, confirmation, workstation and
energy results remain absent; RSD-T03--RSD-T10 remain absent.
Every event and successful response is `NO_RESULT`.

[Fixture F-027](fixture-027/README.md) implements a bounded public-development
smoke slice for C-1550 / RIN-T01. It generates six synthetic source--load
world classes (six worlds per smoke seed and 30 per development seed), verifies
mass closure and two independent edge-removal controls,
rejects malformed interfaces, records finite insulation and saturation, and
binds exact resume to a corruption-evident event chain. It does not implement
the registered reduced source model, approximation envelope, or dimensional
confirmation comparison. RIN-T02--RIN-T10, private partitions, physical
systems, calibrated energy and
scientific adjudication remain absent. Every event is `NO_RESULT`.

[Fixture F-029](fixture-029/README.md) implements bounded public-development
aggregate-construction slices for C-1574 / CMB-X01 and C-1580 / CMB-X04. X01
exercises no-action, occupancy, direct, periodic-GC, tagged-queue, recruited-
maintenance and oracle paths with explicit target, mediator, engine, service,
harm and synthetic-resource records. X04 exercises its eight preservation and
release paths with copy/artifact conservation, accepted service, wrapper
lifecycle work and scoped synthetic counters. Both separate actionable input
from evaluator truth. A version-2 suite receipts both hash-chained subruns but
never compares or ranks them. CMB-X02/CMB-X03, protocol-native event streams,
private partitions, confirmatory inference, complete comparative accounting,
calibrated physical resources, performance conclusions and energy measurement
remain absent. Every output is `NO_RESULT`.

The machine-readable contract is
[`manifest.schema.json`](manifest.schema.json). Referenced lockfiles, seed
manifests, generators, output schemas, runner entrypoints, and tests must exist
inside the repository. The coverage audit no longer treats six arbitrary
non-empty JSON fields as proof of execution readiness.

## Current implementation

[Fixture F-012](fixture-012/README.md) provides a deterministic synthetic
negative control for fixed-layout performance claims. Its complete mature null
randomizes the declared layout population, counterbalances variant order, and
uses independent studies for uncertainty. An identically informed
operator-qualified arm must match the null exactly at equal observation,
modeled-work, and modeled-energy budgets. The append-only SHA-256 ledger and
recomputed analysis are hostile-tested, but timings and joules remain modeled
and no confirmation or held-out release exists.

F-012's former host-specific acquisition lane is retired under
[Decision 0042](../../decisions/0042-retire-the-host-specific-fixture-012-acquisition-lane.md).
Only the synthetic `NO_RESULT` harness described above is current.

[Candidate 010](candidate-010/README.md) now has the first validated
`smoke-ready` harness. It exercises deterministic paired opportunities, seven
eligible null/candidate arms, an oracle ceiling, real filesystem staging and
rollback, append-only raw events, declared-boundary checkpoint resume,
external-energy provenance validation, frozen design/analysis modules, and
reproducibility hashes. Its complete implementation test executes all 48
factorial scenarios through four isolated local effect boundaries with no
physical actuation. Retry/rollback now crosses two actual effect lifecycles, and
the independent-verifier comparator uses a separately implemented detector.
A separate persistent-service diagnostic exercises commit, reset, later
commit, stale-version refusal, and declared-interruption reconciliation on
transactional-KV and simulated-actuator instances. Resume is bound to the full
executable source identity and revalidates complete durable history against the
ledger. Atomic ownership-checked leases reject concurrent factorial and
persistent writers before mutation. Source discovery freezes the execution
manifest, every production module, every registered test, the golden fixture,
and relative imports from both production and test code. A shared
runtime event contract validates smoke and factorial records before append and
again before analysis. An eight-case deterministic
fault campaign makes reset leakage, incomplete rollback, precommit effects,
delayed cleanup, stale or corrupt verification, failed finalization, and an
irreversible-effect sentinel observable to the validator.

Those roots are isolated per opportunity–arm work unit, so the factorial path
still does not test concurrent shared-service contention. File `fsync` is now
requested for complete raw records, persistent identity and receipt metadata,
checkpoints, and final run replacements, while torn-tail repair, directory-entry
persistence, and arbitrary power-loss recovery remain outside the contract.
The harness now inventories the exact local Node executable and installed
production-dependency bytes, materializes clean-`HEAD` source plus capsule-local
dependencies outside the repository, and launches a fixed child that verifies
those identities before importing Candidate code. Confirmation refuses the
ordinary worktree runner and requires a callback-scoped capsule capability plus
a release binding the same source, descriptor, runtime, dependencies, config,
design, and seeds. This is an implemented confirmation boundary, not a result:
no real frozen release, calibrated interval-owned energy record, or promotion
evidence bundle exists.
Writer contention is refused, not benchmarked, and stale locks are not broken
automatically. The persistent and fault tracks are local diagnostics,
not confirmation data. The strict seed-release and promotion-evidence builders
exist, but no real frozen release, interval-owned calibrated energy observation,
or validated evidence bundle exists. Six of nine **structural** promotion gates
pass; no result claim or workstation-executable claim coverage follows from
them.

The future confirmation operator is the explicit `capsule-confirmation` action
documented in the [Candidate 010 harness](candidate-010/README.md). It accepts a
version-3 release root, release document, disjoint seed-pack artifacts, and an
output directory; it does not accept a profile or raw confirmation seeds.
Interrupted invocations reuse one durable launch precommit. The completed
parent receipt and setup-cost record are separate from the earlier run identity,
and the inclusive child envelope is never added to arm cost a second time.

The same harness documents `capsule-promotion-build`, which creates evidence
and its validation receipt together. A readiness check subsequently rebuilds
the exact release-bound commit and recomputes the evidence; stored self-hashes
alone cannot pass the final gate.
