# 0107 — Pack short workstation fixtures

- **Status:** accepted
- **Date:** 2026-10-17
- **Partly supersedes:** [0044](0044-shard-workstation-ci-without-splitting-test-authority.md), for the single-job-per-artifact clause for short fixture jobs only
- **Related:** [0088](0088-impact-scope-ci-and-local-validation.md), [0106](0106-fan-out-full-ci-to-impact-lanes.md), [issue #7](https://github.com/cordanaLLM/20-watts-was-enough/issues/7), [issue #304](https://github.com/cordanaLLM/20-watts-was-enough/issues/304)

## Context

Following the CI fan-out in [Decision 0106](0106-fan-out-full-ci-to-impact-lanes.md), full-mode CI wall clock time was no longer dominated by `quality-full` but bounded by runner concurrency. GitHub Actions Free organization tier caps total runner concurrency at 20 jobs. In pull-request run 39061573770, the workstation matrix spawned 19 separate runner jobs alongside the non-workstation lanes (`lane-go`, `lane-release`, `lane-research`, `lane-site`, `pdf-renderer-reproducibility`). With the matrix capped at eight concurrent jobs by [Decision 0044](0044-shard-workstation-ci-without-splitting-test-authority.md) and the shared organization limit, its entries started in waves until 17m48. The first main run after Decision 0106, run 39064720164, took 10m38 of job wall time, so the span varies with runner availability between runs.

Eight workstation matrix entries spend only 0–6 s in their actual test step, yet incur 22–43 s of runner time each due to VM initialization, checkout, and locked dependency installation:

- `fixture-007`
- `fixture-012`
- `fixture-019`
- `fixture-022`
- `fixture-023`
- `fixture-024`
- `fixture-025`
- `fixture-027`

In contrast, the long-running entries (the eight `fixture-026` shards, the two `fixture-029` shards, and `candidate-010`) remain compute-heavy and justify individual sharded runner allocation.

## Decision

1. Annotate the eight short workstation fixture jobs (`fixture-007`, `fixture-012`, `fixture-019`, `fixture-022`, `fixture-023`, `fixture-024`, `fixture-025`, `fixture-027`) with `"pack": "short"` in `tooling/internal/ciplan/workstation-catalogue.json`. The Go planner parses and strictly validates the field (accepting only `""` or `"short"`).
2. Generalize the workstation matrix entry shape to `{"artifact": ..., "scripts": "<space-separated script names>"}` for every matrix job. Single-script jobs carry one script name in `scripts`.
3. In the Go projection, when two or more packed jobs are selected, pack them into a single matrix entry with `artifact: "short-fixtures"`, ordering their scripts in catalogue creation rank and placing the entry at the position of the first packed job. When exactly one packed job is selected (such as in an impact plan targeting only one fixture), preserve its individual artifact identifier and single script.
4. Replace the inline `npm run "$SCRIPT"` workflow step with `node scripts/run-workstation-scripts.mjs`, reading `SCRIPTS: ${{ matrix.scripts }}` from the environment. The runner script verifies allowlisted script names (`^test:workstation:[a-z0-9:-]+$`), verifies membership in `package.json`, bounds execution to at most 19 scripts, and executes each script sequentially via `child_process.spawn` (no shell) with a 30-minute bounded timeout and process group termination on timeout.
5. Execution continues after failure so all selected scripts run; passed and failed scripts are reported individually; failed scripts are appended to `$GITHUB_STEP_SUMMARY` when set; and the runner exits 1 if any script failed, naming all failed scripts on the last line.
6. Condition Python scientific runtime provisioning in `workstation-artifacts` on `contains(format(' {0} ', matrix.scripts), ' test:workstation:fixture-019 ')`, ensuring the runtime is provisioned whenever `fixture-019` is part of the executed scripts, whether packed or standalone.

## Consequences

- A full plan's workstation matrix drops from 19 entries to 12: the eight `fixture-026` shards, the two `fixture-029` shards, `candidate-010` and `short-fixtures`. With the eight-job cap, it now fills one wave plus four entries instead of one wave plus eleven.
- The packed job pays runner start, checkout and dependency installation once instead of eight times. The measured test steps of the eight fixtures sum to 20 s; `fixture-019` still provisions the locked Python runtime inside the packed job.
- A failure in any packed fixture is named in the step log, in the step summary and in the runner's last line, and the remaining packed fixtures still run.
- Impact plans that select a single packed fixture keep its own artifact name and job.
- Whether the full gate stays under the 12-minute target of issue #7 is measured on the main run after this change, not claimed here.
