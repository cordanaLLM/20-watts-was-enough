# Experiment-contract rules

These instructions extend root [`AGENTS.md`](../AGENTS.md).

- Keep candidates and fixtures separate: fixture may expose problem but
  must not smuggle in proposed architecture.
- Define task, population or instances, candidate, strongest conventional null,
  negative controls, positive controls, metrics, uncertainty, stopping law,
  exclusions, and kill criteria before claiming protocol completeness.
- Bind every test route reciprocally to exact claim IDs it can falsify.
- Define equal-resource or explicitly resource-normalized comparison boundaries.
- Protocol document is not executable evidence. Preserve `NO_RESULT` until a
  valid run and analysis exist.
- Bound grids, repetitions, episodes, retries, time, memory, output, and
  concurrency in contract.
- Keep analysis laws and multiple-comparison corrections executable and frozen
  before confirmation data are opened.
- Fixture without workstation manifest ends with `## Harness status`:
  `Blocked by: hardware|data|dependency (fixture-NNN)|not-built.` plus
  reason grounded in contract text. Remove section when harness lands
  ([Decision 0124](../decisions/0124-state-why-a-fixture-has-no-harness.md)).
- Update generated coverage and readiness surfaces after changing a
  protocol or status.
