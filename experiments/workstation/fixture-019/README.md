# Fixture F-019 workstation harness — FM-T02 forecast slice

This is the first executable slice of
[Fixture F-019](../../fixtures/019-finance-risk-attention-governance.md): the
FM-T02 fixed-point forecast boundary linked only to C-1481. It is
**smoke-ready**, not a confirmatory result.

The CPU-only generator uses the frozen NumPy `PCG64DXSM` environment and creates
the declared 24-entity, 12-asset balance sheet. Five forecast/fallback paths are
evaluated against a separately implemented reference solver:

1. zero price impact;
2. one price-impact pass, the registered mature forecast null;
3. full fixed-point feedback;
4. full fixed point with the declared funding-call state; and
5. staged liquidation restarted from the frozen round-0 state.

Every development seed executes the base, zero-impact, high-overlap/high-impact,
and funding-call cells. Records retain native units, terminal failures,
accounting residuals, CPU/wall/memory resources, independent-solver checks, and
an append-only SHA-256 chain. Resume authority is rebuilt from raw records and
refuses torn tails, altered records, duplicate work units, or a checkpoint ahead
of the ledger. Non-convergence receives the registered finite worst loss;
floor/cap boundaries restart the staged path and add the registered 0.01 charge
when that fallback itself is valid. Small-sample sign tests enumerate every
assignment exactly.

## Run the released image

A v0.3.0 or later release whose source contains and passes the release workflow
publishes the scoped Linux `amd64` image at
`ghcr.io/cordanallm/20-watts-was-enough-fixture-019`. It binds Node.js 26.8.1,
CPython 3.14.7 and NumPy 2.5.2 for this fixture only. The Go packager gives the
build only the declared Fixture 019 files and a checked closure manifest; it
does not send the repository root as container context. Follow the
[digest-first container instructions](../README.md#fixture-019-fixed-point-forecast-diagnostic)
to retain the smoke output and run analysis and validation against the same
mounted directory. The container cannot remove the protocol limitation below,
and every output remains `NO_RESULT`.

## Run from source

Run from the repository root:

```bash
npm run workstation:fixture-019 -- prepare --profile smoke
npm run workstation:fixture-019 -- smoke --profile smoke --output experiments/workstation/runs/fixture-019-smoke --resume false
npm run workstation:fixture-019 -- analyze --output experiments/workstation/runs/fixture-019-smoke
npm run workstation:fixture-019 -- validate --output experiments/workstation/runs/fixture-019-smoke
```

The 256-work-unit development profile is:

```bash
npm run workstation:fixture-019 -- run --profile development --output experiments/workstation/runs/fixture-019-development --resume false
```

## Current scientific boundary

The implementation shakedown exposed a frozen-DGP limitation: although the
Dirichlet allocations produce distinct worlds, all entities have the same
common-asset share, every non-common asset receives the same initial shock, and
sales are proportional. Those symmetries make the aggregate primary forecast
contrast effectively invariant to the generated residual allocation. The
analysis records this explicitly and blocks confirmation. Changing that world
would require a reviewed FM protocol revision; the runner does not repair it
silently.

Confirmation and held-out packs are unavailable pending fresh private CSPRNG
generation and encrypted escrow after a reviewed protocol revision. The prior
public-label hashes were not private seed packs and have been removed. The
runner exposes no action that accepts confirmation or transfer seeds. The
FM-v1/FM-T02 promotion validator and the central readiness gate reject every
sealed/reveal claim and every evidence bundle, including internally consistent
hashes. A reviewed successor protocol must replace that structural binding
before fresh private escrow can even be considered. Development output has
`claim_eligible=false`, `scientific_result=false`, and
`energy_conclusion_allowed=false`. C-1481 has no energy endpoint, so worker CPU
time, wall time, and process peak RSS are recorded while joules and watts remain
`not measured`. The manifest's memory and disk figures are planning envelopes;
this development runner does not enforce process-tree memory or output-byte
budgets and must not be described as doing so.
