# Fixture 020 public-development smoke harness

This directory implements the base-family generator and fixed-tree arm A of
[ICP-T01](../../fixtures/020-integrative-comparative-physiology.md).
ICP means integrative comparative physiology. The harness checks synthetic
oxygen accounting, public seed identity, retained failures and verified resume
within C-1488 scope. Its
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

## Authority boundary

Every summary is `NO_RESULT`. The execution claim binding covers C-1488 only
and supplies no scientific, comparative, performance or energy conclusion.
Simulated pump work is a synthetic transport quantity in J, not workstation
joules or watts. No measured workstation energy is available.

Arms B (the MIQP null), C (local repair) and O (the evaluator oracle) are
deferred. Common bootstrap-t inference, the development sensitivity diagnostic,
the transfer family, Parquet artifacts and ICP-T02--ICP-T09 are deferred too.
No B:A contrast is computed. The confirmation and transfer documents state
that the 128 and 64 sealed seeds and their commitments have not been created;
they contain no seeds or data.

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
```

Confirmation and transfer are not executable actions. Existing run identities
require `--resume true`. Resume verifies the raw hash chain, closed checkpoint
and fresh source/configuration identity, then regenerates retained worlds and
artifacts. A checkpoint may lag the raw ledger. A missing checkpoint can be
rebuilt; a torn raw record is rejected. Only derivable, unfinished atomic
writes may be repaired. Complete conflicting evidence is preserved and
rejected. Output paths reject symlinks and repository escapes.

The command accepts cancellation and finite wall deadlines. An in-flight
interruption retains a `NO_RESULT` receipt and a terminal-loss world record.
A generation interruption receives the finite generation-failure envelope; an
arm interruption receives its already computed maximum loss. The recorded
check index replays the failure boundary. Resume preserves that failed world
and continues with the next seed. Analysis rejects an incomplete denominator.

## Artifacts and bounds

Each world directory contains `world-manifest.json`, `graph.json`,
`demand.jsonl`, `oxygen-ledger.jsonl`, `flows.json`, `observations.jsonl` and
`fallbacks.jsonl`. The demand file retains minute rates. Oxygen rows are
aggregated over each 5 min decision interval. The full oxygen ledger and flow
history receive SHA-256 digests over little-endian binary64 rows. Raw signed
observation values remain in the observation file. A's ordinary fixed action
requires no fallback, so its fallback file is empty.

The root retains the append-only hash-chained `raw-events.jsonl`, checkpoint,
source identity, canonical `seed-outcomes.jsonl`, run document and summary.
The output schema binds the closed event to its runtime validator. Analysis
and validation recompute from retained records and fresh replay.

The standalone smoke command also retains CPU time, wall time, artifact bytes
and process resource counters. Linux uses its own address-space high-water
mark and cumulative syscall byte counts from `/proc/self/`; these include
imports and replay. Other platforms mark those counters unavailable and
retain current RSS. The receipt describes software execution only.

Rejection sites allow 10,000 attempts. Smoke allows 300 s, 134,217,728 B of
memory and 52,428,800 B of artifacts. Development allows eight hours and
1,073,741,824 B of artifacts. Execution is serial and CPU-only. Each file has
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
  `1-2**-53` and increments `uniform_upper_round` in the world manifest.
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
  and run in minute-major, ascending demand-ID order. Every rejected hotspot
  candidate redraws the complete schedule, including K. Hotspots occupy
  half-open minute intervals; adjacent intervals may touch. Centres exclude
  the source, and descendants follow primary-tree edges only.
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
  its storage. Negative storage terminates immediately. Negative amounts
  within flow-feasibility tolerance still receive terminal loss.
- Exhaustion before a complete demand path has no exact path-specific
  maximum loss. Its retained generation-failure charge uses the conservative
  finite envelope `1440*8*exp(5)*3` mmol. A test-only rejection limit may be
  lowered to plant exhaustion; the CLI fixes 10,000 attempts.
- A timeout or cancellation during generation uses that generation-failure
  envelope. Once forcing exists, an interrupted arm retains its partial
  accounting and receives its path-specific terminal loss. The outcome
  records the failing check index so replay preserves the interruption
  instead of replacing the failed world with a clean attempt.
- Smoke's wall cap is 300 s; development's disk cap is 1 GiB. Individual
  file I/O has a 30 s deadline. Fixed-format numeric JSON rows use native
  array encoding in canonical key order, avoiding an intermediate token
  tree; file hashing and writing use bounded chunks.

## Verification

```text
node --test experiments/workstation/fixture-020/*.test.mjs \
  experiments/workstation/lib/pcg64-dxsm.test.mjs
```

These tests exercise frozen RNG vectors, graph feasibility, hotspot boundaries,
oxygen closure, terminal losses, oracle isolation, schema structure, tampering,
interrupted writes, deadlines, cancellation and resume. They do not adjudicate
the scientific contract or confer result authority.
