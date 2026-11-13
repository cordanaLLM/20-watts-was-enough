# Agent working sequence

This guide is the change workflow and verification sequence for contributors
and coding agents. The root [`AGENTS.md`](../AGENTS.md) links here.

## Newcomer workflow

Follow this sequence when preparing any change:

1. **Inspect affected authorities.**
   Read the controlling authority file for the files in scope (see
   [`repository-map.md`](repository-map.md) and
   [`principles.md`](principles.md)). Before committing, inspect staged,
   unstaged and untracked changes with `git status`, `git diff --cached` and
   `git diff`, including additions, deletions, renames and type changes.
2. **Make minimal, focused patches.**
   Keep changes confined to the smallest coherent chapter, claim, equation,
   test, or decision ([principles 6.2](principles.md#62-changes-and-history)).
   Do not rewrite neighbouring material for style alone.
3. **Select local checks from scope.**
   Map modified files against
   [`.github/ci-impact.json`](../.github/ci-impact.json) to identify owned
   test suites and changed contracts; trace actual consumers through command
   definitions, imports, callers, fixtures, shared helpers, CLI adapters,
   generators and artifact readers; for Go, include reverse dependencies and
   integration tests; union mixed scopes and include every affected check.
   Unknown ownership, unavailable comparisons, unsafe transitions, shared
   authority, or a consumer set that cannot be established safely require the
   full local `npm run check` gate.
4. **Execute verification checks before commit.**
   Local checks read the whole working tree, not only the Git index. Record
   which changes will be committed and which bytes each check read; a pass
   over a mixed working tree is no evidence for the staged subset alone. Keep
   unrelated work out of scope by using an isolated worktree. Execute
   `npm run check` before marking pull requests ready, merging, or releasing.
   For book source byte or membership changes, run `npm run generate:book-pdf`
   and `npm run validate:book-pdf`. If changes are confined to paths listed in
   [`scripts/book-render-free-sources.json`](../scripts/book-render-free-sources.json),
   run `npm run record:book-provenance -- --base <revision>` instead of
   rendering, naming the merge base of the change (the script defaults to
   `origin/main`)
   ([Decision 0090](../decisions/0090-re-record-book-provenance-for-dependency-records.md)).
   A docs-only change outside that book-source closure may skip regeneration
   only after proving the book source digest unchanged
   ([Decision 0088](../decisions/0088-impact-scope-ci-and-local-validation.md)).
5. **Update changelog and decisions.**
   Add an entry under `Unreleased` in [`CHANGELOG.md`](../CHANGELOG.md) for
   notable changes. Record a new decision under
   [`decisions/`](../decisions/README.md) when an authority, architecture,
   policy, licensing, publication, or release rule changes durably.
6. **Use Conventional Commits.**
   Write commit and pull-request titles following the Conventional Commits
   specification ([principles 6.2](principles.md#62-changes-and-history)).
   Push only a clean, fully validated tree.
7. **Segregate worktrees and evidence.**
   Keep auxiliary Git worktrees in a dedicated folder outside the checkout,
   never as siblings of the repository. Private session state and evidence go
   under the ignored `.workingdir/` folder only.

## Common commands

The following commands are the standard validation and build tasks:

```bash
# Clean dependency installation
npm ci

# Full repository validation suite
npm run check

# GitHub Pages reader and portal validation
npm run test:github-pages

# Pinned reader and portal screenshot comparison
npm run check:visual
npm run record:visual

# Book PDF generation and semantic validation
npm run generate:book-pdf
npm run validate:book-pdf
```

Run `npm run check:visual` after reader or portal visual changes; use
`npm run record:visual` only for an intended change whose PNG diff will be
reviewed ([Decision 0128](../decisions/0128-compare-reader-and-portal-screenshots-in-the-pinned-renderer.md)).
Both commands require the locked PDF renderer container environment.
Full CI plans and site or renderer impact run the visual comparison job.

## Expert reference and scoped validation

For targeted development and incremental verification:

- **Impact scoping:**
  [Decision 0088](../decisions/0088-impact-scope-ci-and-local-validation.md)
  governs impact-scoped CI and local check selection, permitting reuse of
  validated evidence while leaving full integration gates authoritative.
- **Automated diff planning:**
  `go -C tooling run ./cmd/20w ci plan --root .. --base <base-sha> --head <head-sha>`
  compares committed base and head revisions. Both take exact 40-character
  commits, and without them the planner returns a full plan (reason
  missing-or-invalid-revision). It does not see staged, unstaged or untracked
  files, and its lane selection does not select individual Go packages, so
  determine pending-change scope by hand.
- **Targeted workstation tests:**
  Execute dedicated scripts such as `npm run test:workstation:core` or
  specific fixture suites (`experiments/workstation/fixture-*/`) during
  component development.
- **Go tooling tests:**
  Validate Go packages and tooling CLI commands via `npm run test:go`
  (`go -C tooling test -race ./... && go -C tooling vet ./...`).
- **Changed Markdown:**
  Run `npm run check:prose` (`scripts/audit-prose-style.mjs`),
  `npm run validate:docs` and `npm run validate:math`, plus Markdown
  formatting with `node tools/markdownlint/verify.mjs`. A prose or link pass
  alone does not cover notation validation.
