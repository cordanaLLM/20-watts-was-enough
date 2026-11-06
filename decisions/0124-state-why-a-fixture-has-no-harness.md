# 0124 — State why a fixture has no harness

- **Status:** accepted
- **Date:** 2026-11-06
- **Decided by:** the coordination order recorded as
  `rank-dispatch-20261106-0856-20-watts-was-enough` (gap row C10-03,
  issue #235; paraphrased: every fixture either has a harness whose tests
  exercise an acceptance and a rejection rule, or its contract states why no
  harness exists yet).
- **Authority:** fixture contract structure and `scripts/audit-test-coverage.mjs`
  only. No claim, principle, status, result or `NO_RESULT` boundary changes.

## Context

Ten of the 29 fixture contracts have a workstation manifest and smoke harness
under `experiments/workstation/`. The other 19 (001 to 006, 008 to 011, 013
to 018, 020, 021 and 028) existed only as prose, and nothing recorded whether
a harness was waiting on apparatus, data, another fixture, or only on someone
writing it. Two contracts (013 and 016) carried an `Execution state` line;
the rest were silent.

## Decision

A fixture without a workstation manifest ends with a `## Harness status`
section. Its first line is `Blocked by: <blocker>[, <blocker>].` with blockers
drawn from a closed set:

- `hardware`: the rules need physical apparatus the repository does not have;
- `data`: the rules need a corpus, seed pack or records not in the repository;
- `dependency (fixture-NNN)`: another fixture or candidate harness comes first;
- `not-built`: the contract already specifies a workstation generator, and the
  harness has not been written. It cannot be combined with another blocker.

A reason grounded in the contract text follows the line. The section is
removed when a manifest lands; a fixture with both is refused as stale.

`npm run check:test-coverage` enforces this and adds a Harness column to
`experiments/test-coverage.md`. Planted cases in
`scripts/research-gates.test.mjs` cover a missing section, an unknown
blocker, a dependency without a target, `not-built` combined with another
blocker, and a section on a fixture that has a manifest.

The first classification, extracted from each contract and checked against
its text, gives 13 `not-built`, 3 `hardware` (008, 010, 011), 2
`hardware, data` (002, 013) and 1 `data` (016). Fixture 017 is `not-built`
because its contract defines a smoke-only first slice on tiny models; the
frozen Ryzen 9 7950X and RTX 4090 pair binds only claim-eligible runs.

## Consequences

The 13 `not-built` fixtures form the queue for future harness work, each
named with the contract section a generator would implement. A blocker is a
statement about what a harness needs, not a scientific finding; no fixture
gains execution readiness from this record.

## Alternatives considered

- Building all 19 harnesses in one change: each needs its own generator,
  contract, runner and tests, and six need apparatus or data the repository
  lacks.
- Keeping the reason in the coverage generator: it would separate the reason
  from the contract it describes and drift when the contract changes.
