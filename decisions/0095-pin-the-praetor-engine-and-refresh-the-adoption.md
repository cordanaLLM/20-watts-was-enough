# 0095 — Pin the Praetor engine and refresh the adoption

- **Status:** accepted
- **Date:** 2026-10-11
- **Decided by:** rulings of 2026-10-11 for this repository, recorded as
  `20-watts-was-enough-engine-launcher`, `-refresh-pin-location`,
  `-refresh-baseline`, `-refresh-clients-same-run`, `-refresh-hooks-install`,
  `-refresh-reuse-hook`, `-refresh-docs-gate`, `-refresh-workflow-shape`,
  `-refresh-hiss11`, `-refresh-code-shape`, `-refresh-lint-typecheck`,
  `-refresh-vendor-links`, `-refresh-skill-copies` and
  `-refresh-engine-gate-class` (paraphrased in the points below).
- **Extends:** [0082](0082-adopt-praetor-repository-governance.md), which
  adopted the engine without naming a version of it.
- **Authority:** the engine pin in `.github/workflows/ci.yml`, the adoption
  files the engine writes, `.standards.yaml`, `.standards-baseline.json`,
  `lefthook-local.yml`, the workflow rules in
  `scripts/validate-engineering-policy.mjs`, and the dated exception lists
  named in point 10. No claim, principle or status changes.

## Context

Praetor (Latin *praetor*, the Roman magistrate who administered justice;
English pronunciation PREE-ter) is the governance engine that checks and
enforces a repository's standards. Decision 0082 adopted it with whichever
engine binary was first on the maintainer's `PATH`. Two runs of `make verify-all` on different days could
therefore apply different rules to the same commit, and nothing in the
repository said which engine had produced the tracked adoption files. The
engine has no release tag that could serve as a version: a tag is a name that
can move, and only a full commit id identifies its rules.

The refresh also exposed that no Git hook had ever run in this repository.
`.git/hooks` held only Git's sample files until the adoption run of
2026-10-11 installed the Lefthook wrappers. Until then CI was the only gate:
every local commit and push went out unchecked, including the ones that later
failed in CI.

Re-adopting at a newer engine is not a formatting change. The engine at commit
`9bf502ec6ce5` scans more constructs than the one that recorded the baseline
on 2026-09-16, adds a Markdown style gate, writes two CI workflows of its own
and reads a `LICENSES/` folder as a declaration that the repository uses the
REUSE tool. It also ships a figure bundle, vendored source and gate scripts
that this repository's own gates then read. Each of these collided with a
rule or a fact of this repository, and each collision needed a decision.

The pin moved once before this change merged. Its first push pinned commit
`7cf9cbb2d8cc`. The CodeQL scan of that push reported eight alerts, seven of
them of high severity, in three scripts the engine writes:
`tools/figures/checks.mjs`, `tools/markdownlint/verify.mjs` and
`tools/markdownlint/no-private-scratch-links.mjs`. The ruleset on `main`
refuses a merge with a new alert of that severity, and the audit locks the
three files byte for byte, so the fix had to come from the engine. It did, in
cordanaLLM/praetor#1252 and #1257. The pin moved to the commit that holds
both, and the adoption was run again with it.

## Decision

1. **Pin.** The engine commit is declared as `PRAETOR_REF` in the top-level
   `env` block of `.github/workflows/ci.yml`, the place every repository of
   the organisation uses. `.config/lefthook/engine.sh` reads it, fetches or
   builds that commit once and runs it. Local hooks and `make verify-all` go
   through this launcher; the engine on `PATH` is no longer a gate. Moving the
   pin is a reviewed change with an adoption refresh in the same pull request.
2. **Workflow environment.** The validator required that the CI workflow has
   no workflow-level `env`, so that private Go jobs inherit nothing. The rule
   now reads: the block is absent, or it holds exactly the one key
   `PRAETOR_REF` with a 40-character lowercase hexadecimal value. A second
   key, a tag and a short id are refused.
3. **Hooks.** `lefthook.yml` is the engine's rendering and stays byte-exact,
   so the engine's audit can verify it. The repository's own jobs (`gofmt`,
   `go vet` and `govulncheck` for the module in `tooling/`) live in the
   tracked `lefthook-local.yml`, which Lefthook merges over it.
4. **Agent clients and editors.** `.standards.yaml` declares
   `agent_clients: [claude, codex, gemini]` and
   `editors: [universal, vscode, antigravity]`. The engine neither writes nor
   removes files of an unselected client or editor, so the fifteen tracked
   files of Cursor, Windsurf, Copilot, Zed, Helix, Fleet, Neovim, Emacs and
   Sublime Text are deleted in the same change.
5. **Baseline.** The engine at the pin reports 642 findings where the baseline
   held 222. The 426 added ones (HISS-01 92, HISS-02 14, HISS-04 271,
   HISS-07 49) come from checks that did not exist at the earlier recording.
   The baseline does not exempt a file that a change touches: the ten
   findings in `scripts/validate-engineering-policy.mjs` (HISS-01 2,
   HISS-04 8), which this change edits, are fixed here. The remaining 632 are
   recorded as baseline debt, by class: HISS-01 92, HISS-02 37, HISS-04 336,
   HISS-07 160, HISS-09 7. One issue per class in the milestone
   "Ongoing — Code health and deduplication" carries the work-down, and the
   count is reported with every status of that work so that a rising number
   is seen.
6. **Markdown style gate.** The gate cannot be declined. On the day of the
   refresh it reported 592 findings in 35 of 388 files. Those 35 files are
   named one by one in `documentation.style_exclude`. Six stay there: three
   imports under `sources/` and three accepted decision records, whose bytes
   must not change. The other 29 leave the list as their fixes land in pull
   requests of their own, tracked by one issue in the same milestone; several
   findings concern list numbering and table shape in research prose and need
   a reader's judgement. `documentation.max_file_bytes` is raised to 2 MiB
   because `research/claims.md` is 1.6 MiB.
7. **Licence gate.** `LICENSES/` holds the texts of third-party notices that
   the build ships, as [`LICENSING.md`](../LICENSING.md) describes; the
   repository carries no REUSE annotations. The `reuse-gate` adoption step is
   declined, which removes the engine's `reuse.yml`. The engine still renders
   the `reuse-lint` pre-commit job
   ([cordanaLLM/praetor#1244](https://github.com/cordanaLLM/praetor/issues/1244)),
   and that job fails on every commit where the tool is installed. Exception:
   `lefthook-local.yml` skips this one job until 2026-11-30. From 2026-12-01
   the validator refuses the skip. Making the repository conform to REUSE is
   a separate unit, due before that date.
8. **Engine workflows.** `praetor-api.yml` and `praetor-docs.yml` are written
   by the engine and locked by its audit, and they do not meet this
   repository's workflow policy: no concurrency block, a checkout that keeps
   its credentials, `actions/cache` and a second `actions/setup-node` commit
   outside the approved list, and a Node version not read from
   `.node-version`. For exactly these two paths the validator checks only
   what protects the repository whatever a workflow does: every action at a
   full commit SHA, read-only permissions, the hosted runner label of
   [decision 0094](0094-name-the-hosted-runner-image-by-version.md) and a job
   timeout. A third file cannot claim the carve-out. The missing concurrency
   block and the persisted credentials are reported to the engine; the
   carve-out shrinks when a pinned engine renders them.
9. **Release supply chain.** `.standards.yaml` declares build provenance at
   SLSA Build Level 3, signing with cosign and an SBOM for every release.
   `.github/workflows/release.yml` falls short in three ways. It attests
   provenance in the job that builds, which is Level 2. It has no cosign
   step. Its three image builds produce an SBOM through BuildKit's generator,
   which the engine's audit does not count as an SBOM step. Exception: the
   `exceptions` list of `.standards.yaml` declares this gap for rule HISS-11
   and that one path until 2027-01-09. After that day the audit fails as if
   the entry were absent. Raising the release workflow is a release unit of
   its own, tracked by one issue in the same milestone and due before that
   date. Lowering the declared level was refused: it would loosen the policy
   to fit the workflow.
10. **Engine files under this repository's own gates.** The engine writes
    files that its audit locks byte for byte, so they cannot be fixed here:
    a minified figure player and loader under `tools/figures/dist/`, the
    source of interfig (the figure library the engine vendors) under
    `tools/figures/third_party/interfig/`, and two Markdown gate scripts
    under `tools/markdownlint/`. Four gates of this repository read them and
    failed: the code-shape audit with five new groups in three files, the
    lint with 974 errors in two files, the type check with two errors in
    one file, and the docs validator with two links in the interfig vendor
    note that point into the engine's own repository. Exception: each gate
    holds a list of named entries. An entry is one path with the exact rule,
    diagnostic or link target it covers, a reason and the last day
    2027-01-09. From the following day it covers nothing and the gate fails
    as it did without it. An entry that no finding uses fails the gate as
    well, so a list can only shrink. The lists are `CODE_SHAPE_EXCEPTIONS`
    in `scripts/audit-code-shape.mjs` (five path-and-rule groups),
    `LINT_EXCEPTIONS` and `TYPE_CHECK_EXCEPTIONS` in
    `scripts/lib/engine-file-exceptions.mjs` (two files with 15 rule
    entries; one file with one diagnostic), and `engineLinkExceptions` in
    `tooling/internal/docscheck/engine_files.go` (two targets in one file).
    `tsconfig.json` leaves the one file out of the type check, and the
    policy validator refuses that exclude without its entry or after its
    last day, refuses any other added exclude and pins the include globs.
    At the first pin the two Markdown gate scripts also held three lint
    entries. The engine fixed those findings, and the entries left the list
    with the pin move; one of the scripts keeps a code-shape entry. The
    engine side is reported in
    [cordanaLLM/praetor#1250](https://github.com/cordanaLLM/praetor/issues/1250):
    a shipped generated or vendored file should arrive declared as such, and
    a vendor note should not link into the engine's repository. One issue in
    the same milestone carries the work-down. A rule for whole folders was
    refused: it would exempt every file written there later.

    Two changes to the docs validator need no list. The engine renders each
    skill once per selected client, and the validator counted the same
    Mermaid diagram once per copy. It now reads a file under a client's
    skills folder once when that file is byte-identical to the file at the
    same path under `.agents/skills`; the comparison runs on every
    validation, and a copy that differs is read and judged like any other
    file. The validator also skips `.workingdir`, the engine's private state
    folder, which Git ignores and which holds backups of replaced files.

## Consequences

- A commit or push that fails a hook now fails on the workstation. Every
  linked worktree shares the hooks and is gated by its own `lefthook.yml`.
- Two engine jobs, `Go API Compatibility` and `Documentation Governance`, run
  on every pull request beside the repository's own CI.
- The engine's rules change only when the pin moves. A fix that exists in a
  newer engine does not reach this repository until someone moves the pin
  and refreshes the adoption.
- 632 baseline findings, 35 style exclusions, the release supply-chain gap
  and the engine-file entries of point 10 are recorded debt, not a clean
  bill. The baseline hides a finding only while its file is untouched.
- Every entry of points 9 and 10 ends on 2027-01-09. On 2027-01-10 the audit,
  the code-shape check, the lint, the policy validator and the docs validator
  each fail until the entry is removed or a new day is decided.
- `PRAETOR_REF` is visible to every job of the CI workflow. It names a public
  commit and no job reads it.
- A commit made on a host without the REUSE tool was never checked by the
  skipped job in the first place; the skip changes behaviour only where the
  tool is installed.

## Alternatives considered

- **Keep running the engine from `PATH`.** The gate would keep depending on
  what the maintainer last installed.
- **Declare the pin in a file of its own.** The launcher reads the workflow
  file, and a second place would have to be kept equal to it by a further
  check.
- **Fix every new finding before refreshing.** 426 code findings and 592
  style findings would have held back the hooks for weeks, during which
  nothing ran locally.
- **Exclude directories from the style gate.** A glob over `research/audits/`
  would also exempt files written later.
- **Make the repository REUSE-conformant in this change.** That annotates
  about 1,500 files and renames four licence texts, a licensing change with
  its own review.
- **Edit the engine's workflows to meet the policy.** The engine's audit
  compares them byte for byte and the next refresh would overwrite the edits.
- **Ignore `tools/` in the lint, the type check and the code-shape audit.**
  A folder rule also covers files this repository adds there later, and it
  never ends.
- **Record the engine files in the code-shape baseline.** The baseline is a
  ceiling for the repository's own debt and CI refuses a baseline that grows.

## Verification and disclosure

The adoption files were written by the engine binary built from the pinned
commit, run through the launcher, never by the engine on `PATH`. With them in
place the engine's offline audit passes: 632 findings within the 632
recorded, the 128 files this change touches free of findings, and every
generated file equal to its rendering.

All 129 tests of `scripts/engineering-policy.test.mjs` pass. Eleven are new
and each was seen failing with its rule weakened:

- The workflow environment test accepts the pin and refuses eleven other
  shapes, among them a second key, a tag, a branch name, a short id and an
  expression. Three weakened forms of the rule each fail it.
- Two tests cover the engine workflows. They accept both files as rendered
  and refuse a tag, a branch, a short id and a container reference in place
  of the commit; write access at workflow and job level; a missing permission
  block; four wrong runner labels and four wrong timeouts. Byte copies of an
  engine workflow under four other names get the full policy and are refused.
  Nine weakened forms of the rule each fail a test, including a third path on
  the list and a match by prefix.
- The hook test accepts the skip on 2026-11-30 and refuses it on 2026-12-01,
  both on the parsed file and through the repository-wide validator. It
  refuses an override of every other generated job, a skip that sets more
  than `skip: true`, a hook-level key and a declared exception that nothing
  uses. Eight weakened forms of the rule each fail it.
- Eight tests cover the lint and type-check exceptions of point 10. They run
  ESLint and the TypeScript compiler on the real files: the two lint entries
  hide exactly the rules their files trip on 2027-01-09 and nothing on
  2027-01-10, a neighbouring file keeps every rule, and the compiler reports
  only `TS5097` for the vendored file. The lint reads every script under
  `tools/`, so a folder ignore cannot stand in for an entry; a planted
  ignore of `tools/markdownlint/` is reported. Twenty malformed lists are
  refused, among them a folder, a glob, a missing reason and an unsorted
  rule list.
  A second exclude, a folder exclude, an unused entry and a changed include
  list are refused in the type-check configuration. All 51 weakened forms
  fail a test. Two survived a first run. One was a date check without its
  shape test; the planted day `+010000-01` now fails it. The other was a
  folder ignore for the Markdown gate scripts, which passed once their lint
  entries had left the list; the test above now fails it.

The code-shape audit has 19 tests, eleven of them new, and all pass. Its 21
weakened forms each fail one: 18 against the unit tests and three against a
run over the working tree. The docs validator's seven new Go tests cover the
link exceptions and the skill-copy rule. Eleven weakened forms each fail
one; two more change no behaviour and were left.

The ten findings in the validator were removed by splitting its over-long
functions and by replacing the recursion in `collectUses` with a loop bounded
at 100,000 nodes. An automated assistant made that change on a mechanical
brief. It was accepted after the 119 tests that existed before it passed
unchanged, no finding message had changed, and no function exceeded 60
lines.

Without the entry of point 9 the offline audit fails with the three gaps
named, each on a line of its own, and a fourth line that asks for the entry.
With the entry it passes and still prints the three gaps under the end
date. With the end date set to the day before the run it fails again and
names the entry as expired.

The Markdown gate's 592 findings and their 35 files were counted from one
run of the gate without exclusions. That `.git/hooks` held only sample files
was read from the directory before the adoption run installed the wrappers.

AI assistance wrote the change, the tests and this record. The runs named
above verified the result; the maintainer decided each point.
