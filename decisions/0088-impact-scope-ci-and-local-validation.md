# 0088 — Impact-scope CI and local validation

- **Status:** accepted
- **Date:** 2026-10-10
- **Decided by:** the maintainer, in the 2026-10-10 planning round, directing
  one current record for the impact-scope rules
- **Supersedes:** [0043](0043-impact-scope-pull-request-ci.md),
  [0052](0052-impact-scope-every-pull-request.md),
  [0062](0062-impact-scope-comparable-main-pushes.md),
  [0069](0069-map-ci-deletions-through-their-owning-lanes.md) and
  [0080](0080-impact-scope-local-validation.md)
- **Carries forward:** the partial supersession of the CI aggregate-gate
  sentence in [0036](0036-use-one-source-to-publication-and-feedback-graph.md),
  and of [0048](0048-gate-ready-pull-requests-with-the-full-ci-matrix.md)
  clause 1, the `main`-push rule in clause 2, and the readiness and
  pull-request-only rejections in clause 6
- **Unchanged:** [0044](0044-shard-workstation-ci-without-splitting-test-authority.md),
  [0048](0048-gate-ready-pull-requests-with-the-full-ci-matrix.md) clauses 3–5,
  [0051](0051-add-a-seventh-fixture-026-shard-after-live-timing.md),
  [0054](0054-classify-script-impact-by-executable-consumer.md),
  [0065](0065-isolate-fixture-026-ledger-semantics.md),
  [0066](0066-create-longer-workstation-matrix-jobs-first.md),
  [0068](0068-run-workstation-tests-through-the-bounded-go-catalogue.md),
  [0070](0070-default-the-local-workstation-aggregate-to-four-commands.md),
  [0075](0075-isolate-ci-driver-dependency-closures.md) and
  [0077](0077-separate-render-pair-and-image-build-proofs.md)
- **Authority:** consolidation only. No workflow, selector, mapping, ruleset,
  test assertion or publication baseline changes.
- **Related:** [issue #7](https://github.com/cordanaLLM/20-watts-was-enough/issues/7)

## Context

Between 2026-08-30 and 2026-09-05 five records built up the impact-scope
policy one step at a time. Records 0052, 0062 and 0069 each partly superseded
clauses of the earlier ones, so the rule in force could only be reconstructed
by reading all five in order alongside the decision index. This record states
that rule once.

Every rule below was checked against
[`.github/workflows/ci.yml`](../.github/workflows/ci.yml),
[`tooling/internal/ciplan/`](../tooling/internal/ciplan/) and
[`.github/ci-impact.json`](../.github/ci-impact.json) at commit `61bc2f4`. Where
an earlier record and a later partial supersession disagreed, the later one
already governed. This record changes no outcome.

## Decision

### Derive one plan from one exact comparison

1. An opened, synchronised or reopened pull request derives its plan from its
   exact base and head commits, whether or not it is a draft. Readiness-only
   transitions do not start a run.
2. A push to `main` derives its plan from the event's `before` commit and the
   current commit only when both are 40-character hexadecimal hashes present
   in the checkout, `before` is not the zero hash, and `before` is an ancestor
   of the current commit. Any other push runs the full plan.
3. Manual dispatches run the full plan. The exact-tag release workflow keeps
   its separate complete validation and fresh-evidence boundary.
4. One bounded Go planner reads the closed path-to-lane map in
   `.github/ci-impact.json`. Hosted CI runs it through `cmd/ci-plan`, which
   shares `internal/ciplancli` with the public `20w ci plan` command
   ([0075](0075-isolate-ci-driver-dependency-closures.md)). Plans carry schema
   2; projection rejects any other schema and writes only fixed, allowlisted
   lane identities to the workflow outputs.

### Expand to the full plan whenever selection is uncertain

The planner returns a full plan, and names the reason, when:

| Condition | Plan reason |
| --- | --- |
| A revision is missing or is not a full 40-character hash | `missing-or-invalid-revision` |
| The bounded Git diff fails, exceeds 15 seconds or 1 MiB of output, reports an unsafe path, or reports more than 4,096 changed paths | `git-diff-unavailable` |
| Git reports a rename, copy, type change or non-regular mode, or deletes a renderer presentation authority ([0077](0077-separate-render-pair-and-image-build-proofs.md)) | `unsafe-change-shape` |
| The normalised path set fails the same path and count bounds (empty, non-UTF-8 or over 1,024 bytes per path; over 4,096 paths), a second check after the diff parser | `invalid-or-excessive-change-set` |
| The change set is empty | `empty-change-set` |
| The impact map, CI workflow, Go module files, the public `20w` command, `cmd/ci-plan`, `ciplan`, `ciplancli` or `strictjson` changed | `selector-authority-changed` |
| A path matches no rule | `unmapped-path:<path>` |
| A matching rule selects `full` | `full-authority-changed` |

A missing or invalid map blocks planning; it never yields a plan. Because the
selector authorities always select the full plan, a change to the selection
policy cannot validate itself through a narrower plan.

Git status `D` is one exact changed path. It passes through the same closed
map as additions and modifications, so a mapped deletion selects every
declared consumer of its former path. The planner detects copies against
unmodified sources and keeps both reported paths for renames and copies. A
regular deletion plus an independently classified regular addition maps both
paths; the planner does not invent an identity relation that Git did not
report.

### Run the common gate plus the selected lanes

Every impact plan runs `npm run check:impact-common` and then the selected
`go`, `release`, `research`, `site`, `container`, `dependency`, `renderer` and
workstation lanes. Workstation matrix composition, shard inventory and the
eight-job concurrency cap belong to
[0044](0044-shard-workstation-ci-without-splitting-test-authority.md),
[0051](0051-add-a-seventh-fixture-026-shard-after-live-timing.md),
[0065](0065-isolate-fixture-026-ledger-semantics.md),
[0066](0066-create-longer-workstation-matrix-jobs-first.md) and
[0068](0068-run-workstation-tests-through-the-bounded-go-catalogue.md); script
mapping belongs to [0054](0054-classify-script-impact-by-executable-consumer.md);
renderer proof mode belongs to
[0077](0077-separate-render-pair-and-image-build-proofs.md).

The required `CI success` job accepts impact mode only for `pull_request` and
`push` events. It rejects a selected lane that did not succeed, an unselected
lane that ran, and a malformed mode or selector. Dependency review runs on a
pull request when the plan is full or selects the dependency lane, and must be
skipped on a push.

### Validate locally by changed contract

Scope local pre-commit validation to the changed contracts and their affected
consumers. This changes when local checks run, not their assertions or the
complete integration and release obligations. The root
[`AGENTS.md`](../AGENTS.md) owns this sequence; nested contracts may require
additional checks.

#### Select the working-tree scope

Before committing, inspect the staged diff, unstaged diff and relevant
untracked files, including additions, deletions, renames and type changes.
Record which changes will be committed and which bytes the checks actually
read. Preserve unrelated work. If it affects validation, include it in the
scope or use an isolated worktree; do not silently discard it or report a
mixed working-tree pass as evidence for the staged subset.

Use the current impact map, command definitions and actual consumers to select
checks. Follow imports, callers, fixtures, shared helpers, CLI adapters,
generators and artifact readers. For Go, include affected reverse dependencies
and integration tests: testing a package does not run its consumers' tests.
Combine the checks for every changed owner in a mixed change rather than
choosing one dominant lane.

Changed Markdown requires `npm run check:prose`, `npm run validate:docs` and
`npm run validate:math`, including edits to command examples outside research
chapters, plus the other checks its owners and consumers select. A prose or
link-validation pass alone does not cover notation validation.

Unknown ownership, unavailable comparisons, unsafe transitions and shared
authority require the full local `npm run check` fallback. This includes
selector, global policy, module or lockfile and shared runtime boundaries that
the map marks full. A narrow file extension is not evidence of narrow impact.
If the consumer set cannot be established safely, use the full gate, and keep
any renderer or publication checks those changes select.

#### Keep the committed classifier distinct

`20w ci plan` accepts full lowercase 40-character commit hashes through
`--base` and `--head`, compares `base...head` with Git's merge-base semantics,
and loads the impact map from the current checkout. It does not inspect staged,
unstaged or untracked changes, and it selects lanes, not individual Go
packages. There is no working-tree planner mode.

After commit, run the classifier against the intended branch base and head to
check the committed lane selection. Resolve both revisions to exact hashes
first; a symbolic revision or a missing comparison is not evidence for a narrow
scope. Pending edits still need the manual selection above, even when the
committed plan is narrow.

#### Retain evidence without relabelling it

For each check, retain its command and arguments, result, tested scope, source
and dependency identities, toolchain and runtime identity, relevant output
artifacts and omissions under a declared ignored evidence root. An exit code
without those inputs cannot establish that a later change is covered.

Earlier evidence may cover an unchanged scope across a pure rebase only after
checking the new base, changed files and consumer dependencies; run fresh
checks for the affected scope. Changed commands, lockfiles, fixtures, shared
configuration, dependency inputs or conflict resolution invalidate the
corresponding evidence. Source-revision-bound binaries, manifests and images
may need rebuilding or rebinding even when their algorithm source is unchanged.

Keep original logs and receipts with their original identity. Report reused and
fresh checks separately, including what remains pending. Never describe a prior
full pass as a full pass of a different exact tree. Reuse does not replace a
complete gate required at the next integration boundary.

#### Preserve the complete gates

Run `npm run check` before marking a pull request ready, integrating into
`main`, merging or releasing. The complete Go gate keeps `go test -race ./...`
and `go vet ./...` from `tooling/`. These requirements also apply when the
local scope falls back to full. Focused pre-commit checks permit a validated
incremental commit; they do not replace those gates.

Changes to book source bytes or membership still require
`npm run generate:book-pdf` and `npm run validate:book-pdf`. A docs-only change
outside that closure may omit regeneration only after proving the book source
digest unchanged.

### What a green impact run does not show

An impact run proves that the common gate and the mapped lanes passed. It does
not show that the aggregate gate ran, and it is neither release nor scientific
evidence. Because comparable `main` pushes are impact-scoped too, an ordinary
mapped change receives complete hosted validation only through a full-plan
fallback, a manual dispatch or the release workflow. The local `npm run check`
before readiness and merge carries the complete gate in the meantime. Required
CI checks and rulesets are not relaxed.

## Consequences

- An incomplete path map costs time, not coverage: an unknown path expands to
  the full plan. Logical dependencies that path mapping cannot see remain a
  review risk, which is why shared sources and selector authorities stay full
  and representative mappings stay executable tests in
  `tooling/internal/ciplan/`.
- Readers find the impact-scope rules in one record. Records 0043, 0052, 0062,
  0069 and 0080 remain unchanged as history.
- Issue #7 remains open for the measured 3–5 minute full-gate target. This
  record shortens the policy text, not any CI run.

## Supersession

Supersede this record if a merge queue restores a complete pre-merge
integration stage; if pull requests or ordinary `main` pushes return to an
unconditional aggregate gate; if a different comparison authority replaces the
exact base-to-head or before-to-current plan; if Git change identity is no
longer derived from the exact bounded raw diff; if deleted paths lose a closed
owner; if the path-to-lane authority or its fail-closed rules change
materially; or if a working-tree planner mode is introduced.

## Verification and disclosure

Each restated rule was compared with the workflow, planner and map at
`61bc2f4`; the plan reasons in the table are the literal strings in
`tooling/internal/ciplan/plan.go`. The change runs the documentation, prose,
notation and policy validators and, because it edits the root agent contract,
the full local gate.

Claude Code (Opus 5.5) drafted this consolidation from the five superseded
records and the current sources, under maintainer direction. The maintainer
reviews the pull request. This is an engineering-policy record; it changes no
scientific claim, experiment admission or measured result.
