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
   test, or decision. Do not rewrite neighbouring material for style alone.
3. **Select local checks from scope.**
   Map modified files against
   [`.github/ci-impact.json`](../.github/ci-impact.json) to identify owned
   test suites, changed contracts, and downstream consumers. Union mixed
   scopes; include affected CLI, integration, fixture, and generator checks.
   Unknown ownership, unavailable comparisons, unsafe transitions, shared
   authority, or a consumer set that cannot be established safely require the
   full local `npm run check` gate.
4. **Execute verification checks before push.**
   Local checks read the whole working tree, not only the Git index. Record
   which changes will be committed and which bytes each check read; a pass
   over a mixed working tree is no evidence for the staged subset alone. Keep
   unrelated work out of scope by using an isolated worktree. Execute
   `npm run check` before marking pull requests ready, merging, or releasing.
   For book source byte or membership changes, run `npm run generate:book-pdf`
   and `npm run validate:book-pdf`. If changes are confined to paths listed in
   [`scripts/book-render-free-sources.json`](../scripts/book-render-free-sources.json),
   run `npm run record:book-provenance` instead of rendering
   ([Decision 0090](../decisions/0090-re-record-book-provenance-for-dependency-records.md)).
5. **Update changelog and decisions.**
   Add an entry under `Unreleased` in [`CHANGELOG.md`](../CHANGELOG.md) for
   notable changes. Record a new decision under
   [`decisions/`](../decisions/README.md) when an authority, architecture,
   policy, licensing, publication, or release rule changes durably.
6. **Use Conventional Commits.**
   Write commit messages following the Conventional Commits specification.
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

# Book PDF generation and semantic validation
npm run generate:book-pdf
npm run validate:book-pdf
```

## Expert reference and scoped validation

For targeted development and incremental verification:

- **Impact scoping:**
  [Decision 0088](../decisions/0088-impact-scope-ci-and-local-validation.md)
  governs impact-scoped CI and local check selection, permitting reuse of
  validated evidence while leaving full integration gates authoritative.
- **Automated diff planning:**
  `go -C tooling run ./cmd/20w ci plan --root ..` compares committed base and
  head revisions (`-base`, `-head`). It does not see staged, unstaged or
  untracked files, and its lane selection does not select individual Go
  packages, so determine pending-change scope by hand.
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
