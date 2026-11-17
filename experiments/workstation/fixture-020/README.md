# Fixture 020 public-development smoke harness

This directory implements the base-family generators and fixed-tree arm A of
[ICP-T01](../../fixtures/020-integrative-comparative-physiology.md) and
[ICP-T02](../../fixtures/020-integrative-comparative-physiology.md).
ICP means integrative comparative physiology. ICP-T01 checks synthetic
oxygen accounting; ICP-T02 checks vascular tree radius optimisation.
Both tracks share public seed identity, retained failures and verified resume
within C-1488 and C-1489 scope. The
[manifest](../manifests/fixture-020.json) declares `smoke-ready` only.

## Implemented slice

Each world contains 48--128 demand nodes, the registered directed tree and
chords, a 24 h demand path, and non-overlapping hotspots. An iterative Dinic
check verifies baseline delivery before forcing is drawn. Separate labelled
PCG64-DXSM streams generate the graph, forcing and observations.

Arm A replays the primary-tree flows and leaves chords at zero. The evaluator
uses 15 s truth steps in the frozen leak, consume, store, export and deficit
order. It records local debt in mmol and synthetic Poiseuille work in J.
The policy input has closed key sets at every object boundary; latent demand,
hotspot schedules and evaluator-only sink arcs cannot enter an arm.

The smoke profile selects the first two of 64 public development seeds.
Development selects all 64, with the same spatial and temporal settings.
Generation exhaustion remains a typed world failure in the denominator.

## ICP-T02 implemented slice

Each T02 world contains a complete binary tree of depth 4--7 with BFS node
indexing (root `0`, children `2n+1` and `2n+2`, edge ID equal to child node ID,
no stem edge above root). Edge lengths follow `logU(0.005, 0.05)` m, terminal
base flows follow `logU(1e-10, 1e-8)` m^3/s normalised to a total flow from
`logU(1e-7, 1e-5)` m^3/s, and internal edge flows equal exact bottom-up child
sums. A regime (`classic`, `rheology`, `pulsatile` or `wall-floor`) is drawn
once per world before attempt zero; rejected attempts continue the same
`IcpRandom` tree and regime streams.

Arm A enforces `r_e = alpha * Q_e^(1/3)`, selecting `alpha` by deterministic
golden-section search on `x = ln(alpha)` over the radius-feasible interval to
minimise total power `P(r)` in W. Episode loss over the 1 h horizon is
`L_s = 3600 * P(r)` J; any infeasible or failed arm receives the registered cap
`L_max = 3600e9` J without soft penalties. Five canonical candidates check
pressure propagation and radius bounds through a closed-key policy view that
excludes stream labels, attempt counts and manifest internals. A three-edge
classic calibration cell checks Arm A against analytic `alpha*`, `P*` and
Murray's junction identity during `prepare`, execution and `analyze`.

## Authority boundary

Every summary is `NO_RESULT`. The execution claim binding covers C-1488 and
C-1489 and supplies no scientific, comparative, performance or energy
conclusion. Simulated pump work (T01) and optimised transport power over 1 h
(T02) are synthetic quantities in J, not workstation joules or watts. No
measured workstation energy is available.

Arms B (MIQP in T01; primal-dual interior-point in T02), C (local repair) and
O (the evaluator oracle) are deferred. Arm B KKT residuals, Arm B calibration
agreement (`b_agreement: "not-built"`), the Arm B/C fallback chain, tight
transfer radius bounds, common bootstrap-t inference, the development
sensitivity diagnostic, the transfer family, Parquet artifacts and
ICP-T03--ICP-T09 are not built. No B:A contrast is computed, and no biological
exponent is inferred. The confirmation and transfer documents state that the
128 and 64 sealed seeds and their commitments have not been created; they
contain no seeds or data.

## CLI

From the repository root, using Node 26.x:

```text
node experiments/workstation/fixture-020/runner.mjs prepare --profile smoke
node experiments/workstation/fixture-020/runner.mjs smoke --profile smoke \
  --output tmp/fixture-020-smoke --resume false
node experiments/workstation/fixture-020/runner.mjs run --profile development \
  --output tmp/fixture-020-development --resume false
node experiments/workstation/fixture-020/runner.mjs analyze \
  --output tmp/fixture-020-smoke
node experiments/workstation/fixture-020/runner.mjs validate \
  --output tmp/fixture-020-smoke

# ICP-T02 commands use --track ICP-T02 on prepare/smoke/run;
# analyze and validate refuse --track and read it from identity.json
node experiments/workstation/fixture-020/runner.mjs prepare --profile smoke \
  --track ICP-T02
node experiments/workstation/fixture-020/runner.mjs smoke --profile smoke \
  --output tmp/fixture-020-t02-smoke --resume false --track ICP-T02
node experiments/workstation/fixture-020/runner.mjs run --profile development \
  --output tmp/fixture-020-t02-development --resume false --track ICP-T02
```

Confirmation and transfer are not executable actions. Existing run identities
require `--resume true`. Resume verifies the raw hash chain, closed checkpoint
and fresh source/configuration identity, then regenerates retained worlds and
artifacts. A checkpoint may lag the raw ledger. A missing checkpoint can be
rebuilt; a torn raw record is rejected. Only derivable, unfinished atomic
writes may be repaired. Complete conflicting evidence is preserved and
rejected. Output paths reject symlinks and repository escapes.
No other process may modify the output directory during a command.
A killed process leaves a sibling `.fixture-020.lock` file; resume refuses
until it is removed after confirming that no process uses the output.

The wall deadline is checked synchronously and can stop inside a world.
A wall-deadline interruption retains a `NO_RESULT` receipt and a terminal-loss world record.
A generation interruption receives the finite generation-failure envelope; an
arm interruption receives its already computed maximum loss. The recorded
check index replays the failure boundary. Resume preserves that failed world
and continues with the next seed. Analysis rejects an incomplete denominator.
A CLI signal is observed at the next yield: the in-flight world completes
and is retained as an ordinary record. The next boundary check stops with
reason `cancelled` and writes `interruption-<n>.json`. Signal handlers use
`process.once`, so a second signal ends the process at once.
Smoke shares one wall deadline across execution, analysis and validation.
The deadline is checked before each world and after its artifact-and-ledger
commit. That commit can require several I/O operations; each has a 30 s
deadline and at most 30 s further settlement grace.
An I/O deadline writes no interruption document. A settled operation releases
the lock, and resume re-verifies the ledger and artifacts. An unsettled
operation keeps the lock. The next execute, resume or analysis refuses until
the lock is deleted after confirming no process uses the output.

## Artifacts and bounds

Each ICP-T01 world directory contains `world-manifest.json`, `graph.json`,
`demand.jsonl`, `oxygen-ledger.jsonl`, `flows.json`, `observations.jsonl` and
`fallbacks.jsonl`. The demand file retains minute rates. Oxygen rows are
aggregated over each 5 min decision interval. The full oxygen ledger and flow
history receive SHA-256 digests over little-endian binary64 rows. Raw signed
observation values remain in the observation file. A's ordinary fixed action
requires no fallback, so its fallback file is empty.

Each ICP-T02 world directory contains `world-manifest.json`, `tree.json`,
`regime.json`, `designs.jsonl` (JSONL stand-in for `designs.parquet` with one
row per canonical Arm A candidate), `pressure-ledger.csv` (terminal
`node_id,pressure_pa,required_pa,margin_pa` for the chosen design, or header
only when no feasible design is chosen), `objective-components.csv` (per-edge
`edge_id,radius_m,mu_e_pa_s,pressure_drop_pa,pumping_w,volume_w,pulsatile_w,wall_floor_w`,
or header only when no design is chosen) and `solver-log.jsonl` (one row per
golden-section iteration). Each T02 arm is capped at 200,000 objective
evaluations.
Before writing artifacts, the runner atomically retains `pending-outcome.json`.
Resume replays that outcome, completes its artifacts and appends it to the
ledger before removing the pending file. Conflicting pending outcomes are
preserved and rejected; complete outputs have no pending outcome.

The root retains the append-only hash-chained `raw-events.jsonl`, checkpoint,
source identity, canonical `seed-outcomes.jsonl`, run document and summary.
The output schema binds the closed event to its runtime validator. Analysis
and validation recompute from retained records and fresh replay.

The standalone smoke command also retains CPU time, wall time, artifact bytes
and process resource counters. Linux uses its own address-space high-water
mark and cumulative syscall byte counts from `/proc/self/`; these include
imports and replay. Other platforms mark those counters unavailable and
retain current RSS. The receipt describes software execution only.

Rejection sites allow 10,000 attempts. Smoke allows 300 s and 52,428,800 B
of artifacts. Development allows eight hours and 1,073,741,824 B of artifacts.
Smoke declares a 134,217,728 B memory cap and development declares a
268,435,456 B memory cap. At every world boundary,
Linux checks its monotonic VmHWM; a peak inside a world is caught at the
next boundary. Other platforms check current RSS as a lower bound: exceeding
the cap fails, while remaining below it proves nothing about peak memory.
The smoke resource receipt also records the post-command check and its mode.
Execution is serial and CPU-only. Each file has
a 52,428,800 B read/write cap and I/O has a 30 s deadline. Exact Node version
and the shared numeric sentinel are recorded; this source smoke accepts the
26.x family rather than imposing the later fixture's exact-version check.

## Harness registrations

Registration version: `fixture-020-icp-t01-registrations-v1`. These choices fill
gaps in the executable slice; they do not amend the frozen protocol.

- Public seed IDs are a harness registration, not contract text:
  `0x54010000` through `0x5401003f`, following ICP-T09's hexadecimal shakedown
  convention. World IDs use eight lowercase hex digits, for example
  `ICP-T01-0x5401000a`.
- SHA-256 label bytes 0--15 initialise the state directly; bytes 16--31 form
  the increment with its low bit set. DXSM emits the pre-step state, followed
  by the canonical cheap-multiplier step. The older shared constructor and
  its output sequences remain unchanged.
- Uniforms use `Number(2n*x+1n) / 2**65`. An upper rounding event returns
  `1-2**-53`. The hashed generation manifest counts generation events in
  `uniform_upper_round`; the record metric counts generation plus observation
  events, counting the replayed seed-delay draw once.
  Gaussian draws use two consecutive uniforms and discard the sine mate;
  innovation clipping is clamping. Inclusive integers use
  `min(b,a+floor(u*(b-a+1)))`. Dirichlet components use two negative log
  uniforms each, then normalise.
- Stream labels are `ICP-v2|T01|graph|<worldID>`,
  `ICP-v2|T01|forcing|<worldID>` and
  `ICP-v2|T01|observation|<worldID>`. Rejections continue their stream.
  Graph draws include geometry, Dirichlet shares, concentration, baseline
  demand, capacities and radii. Forcing draws the AR path before schedules;
  observations draw the seed delay before noise.
- Demand IDs follow point-draw order. Source-distance sorting determines
  construction order without renumbering. Shares use ascending demand ID;
  capacities use lexicographic edge order, then all radii use that order.
- Minute zero uses the initial AR state zero. Updates start at minute one
  and run in minute-major, ascending demand-ID order. After the AR path,
  each of at most 10,000 schedule attempts draws K uniformly from integers
  8--20 once. Place hotspots in ID order 0 through K-1. Each hotspot allows
  at most 10,000 tries, drawing start (integer 60--1320), duration (integer
  10--90), centre (integer 0--N) and multiplier (uniform 1.5--3), in that
  order; N is the number of demand nodes. Accept the first try whose
  half-open interval does not overlap any accepted hotspot. Touching is
  allowed. An overlap redraws only that hotspot; K stays fixed. Exhausted
  placement raises `GenerationFailure` at `hotspot-placement` and retains
  the failed world. Descendants follow primary-tree edges only. Source node
  0 has no demand row; its children and grandchildren receive the same
  half and quarter excess as descendants of any other centre.
- After placing all K hotspots, apply the schedule. Count minutes with
  aggregate demand greater than `1.15*C_a*Q_src`. More than 120 overload
  minutes rejects the complete schedule; the next attempt draws a fresh K.
  Exhausting 10,000 schedules raises `GenerationFailure` at
  `hotspot-schedule`. Both exhaustion paths retain the world in the
  denominator with the generation-failure envelope.
- Source readings occur at minutes 0--1439. Local panels measure storage at
  minutes 5, 10, ..., 1440 and consumption over the preceding 5 min. Arrival
  is measurement time plus the seed delay. Minute 1440 emits only the final
  local panel. At other shared timestamps, source flow and concentration
  draws precede local storage/consumption draws in ascending node order.
  Each node draws storage noise before consumption noise. All readings,
  including source readings, receive signed 3% Gaussian noise.
- An episode is a maximal run of truth steps with positive local deficit.
  Type 7 p95 interpolates shared percentile order-statistic queries, using
  rank-interior fractions to avoid round-off at integer ranks. Minimum
  storage includes initial storage. Initial flow is the fixed feasible A
  action; a fallback return is limited to 25% of capacity per edge.
- Oxygen hash rows contain truth-step index, node ID, then storage before,
  delivery, demand amount, leak, consumption, storage after, export and
  deficit. Flow hash rows contain truth-step index followed by all edge
  flows in lexicographic edge order. Both use binary64 little-endian bytes.
- Any broken closure receives terminal loss immediately; three consecutive
  failing truth steps terminate execution. A failed node row does not update
  its storage. A broken closure continues through later nodes in the same
  step; each later valid row updates normally. Record the first failing node
  in ascending ID order once per step. Every other failure stops the step
  immediately, including a later terminating failure after a broken closure;
  retain the first failure reason. Negative storage terminates immediately.
  Negative amounts within flow-feasibility tolerance still receive terminal
  loss.
- Dinic layered-search, augmentation and phase bounds remain finite and
  iterative. Exhaustion raises `GenerationFailure` at `max-flow-bound` and
  retains the world in the denominator with the generation-failure envelope.
  Generation stages are `pair-separation`, `graph-max-flow`,
  `hotspot-placement`, `hotspot-schedule` and `max-flow-bound`. The two new
  stages keep their specific reason in the world manifest and arm outcome.
  Existing stages retain `generator-failure` as their outcome reason and
  the specific stage in the manifest.
- Exhaustion before a complete demand path has no exact path-specific
  maximum loss. Its retained generation-failure charge uses the conservative
  finite envelope `1440*8*exp(5)*3` mmol. A test-only rejection limit may be
  lowered to plant exhaustion; the CLI fixes 10,000 attempts. Tests may lower
  the hotspot placement cap separately or lower any Dinic bound to zero;
  these controls do not change CLI defaults or draw order.
- A timeout or cancellation during generation uses that generation-failure
  envelope. Once forcing exists, an interrupted arm retains its partial
  accounting and receives its path-specific terminal loss. The outcome
  records the failing check index so replay preserves the interruption
  instead of replacing the failed world with a clean attempt.
- Smoke's wall cap is 300 s; development's disk cap is 1 GiB. Individual
  file I/O has a 30 s deadline. Fixed-format numeric JSON rows use native
  array encoding in canonical key order, avoiding an intermediate token
  tree; file hashing and writing use bounded chunks.

## ICP-T02 harness registrations

Registration version: `fixture-020-icp-t02-registrations-v1`. These choices
fill execution gaps in the ICP-T02 smoke slice; they are harness registrations,
not contract seed or protocol amendments.

- Public seed IDs are a harness registration, not contract text:
  `0x54020000` through `0x5402003f` (`1409417216`--`1409417279`), following the
  ICP-T01 hexadecimal convention. World IDs use eight lowercase hex digits, for
  example `ICP-T02-0x54020000`. Smoke runs the first two seeds; development
  runs all 64.
- Stream labels are `ICP-v2|T02|regime|<worldID>` and
  `ICP-v2|T02|tree|<worldID>`. The regime label
  (`["classic","rheology","pulsatile","wall-floor"][integer(0,3)]`) is drawn
  once per world on the regime stream before any attempt so rejection sampling
  preserves uniform regime shares.
- Each attempt draws on the tree stream in fixed order: depth
  `d = integer(4, 7)`, edge lengths `logRange(0.005, 0.05)` m in ascending edge
  ID `1..2^(d+1)-2`, terminal base flows `logRange(1e-10, 1e-8)` m^3/s in
  ascending terminal ID, total flow `logRange(1e-7, 1e-5)` m^3/s, exact
  bottom-up internal edge flows in descending node ID, `mu0 = logRange(0.001, 0.006)` Pa s,
  `lambda_V = logRange(1e2, 1e5)` W/m^3 and root pressure
  `P_root = range(5000, 25000)` Pa (drawn for all four regimes so pressure
  propagation is defined everywhere). The regime stream then draws only the
  active intervention parameters (`rheology`: `a = range(0.5, 4)`,
  `r_c = logRange(1e-4, 1e-3)` m; `pulsatile`: `lambda_I = range(0.1, 2)`,
  `f = range(0.5, 4)` s^-1, `rho = 1000` kg/m^3; `wall-floor`:
  `lambda_A = logRange(1, 1e3)` W/m^2, `P_min = range(0.2, 0.8) * P_root`).
  Outside `wall-floor`, required terminal pressure is `0` Pa and every terminal
  must strictly exceed its required pressure (`pressure_pa > required_pa`).
  An attempt is accepted iff the uniform upper-bound design (`r_e = 5e-3` m) is
  pressure-feasible and `3600 * P(r_max) < 3600e9` J; exhausting 10,000
  attempts retains a typed `generator-failure` world with `regime: null` on the
  event record and terminal loss `3600e9` J.
- Arm A computes the exact radius-feasible scale interval
  `[max_e(r_min / cbrt(Q_e)), min_e(r_max / cbrt(Q_e))]` with
  `r_min = 5e-5` m and `r_max = 5e-3` m; an empty interval returns
  `infeasible-design`. Golden-section search on `x = ln(alpha)` minimises true
  power `P(r)` until `exp(hi - lo) - 1 <= 1e-10` with a hard cap of 200
  iterations (hitting the 200-iteration cap raises `policy-exception`).
- Candidates are evaluated in canonical order: `lower`, `midpoint` (the
  `ln(alpha)` midpoint of the initial interval), `upper`, `golden-a` and
  `golden-b`. Each candidate computes `alpha * Math.cbrt(Q_e)` and clamps into
  `[r_min, r_max]`; if clamping moves any edge radius by more than `1e-12`
  relative, evaluation fails with `policy-exception`. The feasible candidate
  with lowest `P(r)` is chosen, keeping the earlier candidate whenever
  `|P_1 - P_2| <= 1e-12 * max(1, |P_1|, |P_2|)`. If no candidate is feasible,
  Arm A stays in the cubic family and records `infeasible-design` with terminal
  loss (no upper-bound rescue; the Arm B/C fallback chain is not built).
- `fitted_exponent` is registered as the ordinary least-squares slope of
  `ln(r_e)` on `ln(Q_e)` across all edges (equal to `1/3` for Arm A by
  construction, and `0` when no feasible design is chosen). It records a
  descriptive summary of the design vector and infers no biological exponent.
  Arm B's KKT residual is absent because Arm B is not built.
- Development calibration uses a fixed classic cell with one stem edge
  (`Q = 2e-6` m^3/s) bifurcating symmetrically into two terminal edges
  (`Q = 1e-6` m^3/s each, `parents = [null, 0, 1, 1]`, `L = 0.02` m on all
  three edges, `mu0 = 0.0035` Pa s, `lambda_V = 1e3` W/m^3, `P_root = 25000` Pa,
  inactive bounds `[5e-5, 5e-3]` m), checked against
  `alpha* = (16 * mu0 / (pi^2 * lambda_V))^(1/6)` and
  `P* = (sum_e Q_e^(2/3) L_e) * (8 * mu0 / (pi * alpha*^4) + lambda_V * pi * alpha*^2)`
  within `1e-6` relative error and Murray junction balance
  `|r_0^3 / (r_1^3 + r_2^3) - 1| <= 1e-12`, recording `b_agreement: "not-built"`.
  Calibration failure throws `ICP-T02 development calibration invalidates the track.`
  in `prepare`, execution and `analyze`.

## Verification

```text
node --test experiments/workstation/fixture-020/*.test.mjs \
  experiments/workstation/lib/pcg64-dxsm.test.mjs
```

These tests exercise frozen RNG vectors, graph feasibility, hotspot boundaries,
oxygen closure, terminal losses, oracle isolation, schema structure, tampering,
interrupted writes, deadlines, cancellation and resume. They do not adjudicate
the scientific contract or confer result authority.
