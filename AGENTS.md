<!-- markdownlint-disable MD013 -->
# cordanaLLM/20-watts-was-enough Agent Operating Harness

<!-- praetor:head -->

Before concluding any turn:

```bash
make verify-all
```

`make verify-all` = repository gate. Steps live in `Makefile`: read there, never restate; adoption executed none.
Pass = exit 0. Signed Ed25519 Exit-0 receipt only from `praetorctl gate run`; report no receipt it did not mint. Fail -> SARIF diagnostic distillation (<= 1500 tokens).

## Core Directives & Invariants

Adopted check = check adoption generated here (generated `make verify-all` + praetor `lefthook.yml`), as written at adoption; later edits to those files not reflected. `not enforced` = rule binds, no generated check decides it for repository languages.

| Invariant | Rule | Adopted check | On fail |
| :--- | :--- | :--- | :--- |
| **HISS-01** control flow | recursion prohibited; call graph = DAG | not enforced | advisory |
| **HISS-02** loops, I/O | scalar upper bound on every loop; explicit deadline on every I/O call | not enforced | advisory |
| **HISS-03** memory | n/a: no such construct in repository languages; advisory | not enforced | advisory |
| **HISS-04** complexity | McCabe cyclomatic <= 10, cognitive <= 15, statements <= 50; func LOC <= 60 (audit ceiling) | not enforced | advisory |
| **HISS-05** scoping | declare every identifier in smallest lexical scope serving it | not enforced | advisory |
| **HISS-06** concurrency | explicit scalar upper bound on every worker pool + concurrent fan-out | not enforced | advisory |
| **HISS-07** errors | every error handled or wrapped with context | not enforced | advisory |
| **HISS-08** determinism | zero dynamic code execution (`eval` / `exec`) | not enforced | advisory |
| **HISS-09** reference safety | n/a: no such construct in repository languages; advisory | not enforced | advisory |
| **HISS-10** warnings | zero warnings: compiler, linter, format sweeps | not enforced | advisory |
| **HISS-11** supply chain | pinned lockfiles; zero floating tags; signed provenance | not enforced | advisory |
| **HISS-12** secrets | zero credentials in Git history | not enforced | advisory |
| **HISS-13** debt ratchet | recorded infractions never grow vs committed baseline | `praetorctl audit` ratchet vs `.standards-baseline.json` in verify-all + lefthook pre-commit/pre-push | growth fails verify-all, blocks commit, blocks push |
| **HISS-14** append-only ABI | public API append-only; breaking change = `!` subject + `Migration:` footer | not enforced | advisory |
| **HISS-15** 3D testing | positive + negative + boundary tests, every public interface | not enforced | advisory |
| **HISS-16** context integrity | single canonical `AGENTS.md`; vendor files compiled via `praetorctl compile-context` | `praetorctl compile-context --verify` in verify-all + lefthook pre-commit | drift fails verify-all, blocks commit |
| **HISS-17** state ledger | turn start `praetorctl state status`; turn end `praetorctl state sync .` | `praetorctl state sync .` in lefthook post-commit | none; records only |
| **HISS-18** CI efficiency | diff-aware gating via `praetorctl ci filter` | not enforced | advisory |
| **HISS-19** reuse before writing | one behavior = one implementation; extend or call existing code | not enforced | advisory |
| **HISS-20** replayable evidence | every enforcement claim backed by fixtures replayed both directions | not enforced | advisory |
| **HISS-21** platform neutrality | gates, hooks, emitted templates run on Linux, macOS, Windows, or skip with stated reason | not enforced | advisory |

## Operational Rules

1. **Act on verified state.** Read source files, run real commands before hypothesis or edit. Never guess flag names, library signatures, repo configuration from memory.

2. **Lead with output.** Direct answers, diffs, commands. No filler preamble, no "Based on", no restatement, no chatter.

3. **Context transpiler first.** Never edit `CLAUDE.md`, `.gemini/GEMINI.md`, `.codex/rules.md` manually. All agent instruction updates -> `AGENTS.md`, then:

   ```bash
   praetorctl compile-context
   ```

   - `AGENTS.md` = agent-only text -> caveman (internal register). `praetorctl compile-context --verify` + `praetorctl audit` run caveman lint; findings fail gate; no opt-out. Check first: `praetorctl caveman check --kind=context AGENTS.md`.

4. **SARIF diagnostic distillation.** Compiler/linter errors -> distill to $\le 1,500$ tokens ($< 60$ lines): top 3 root-cause failures with file/line pointers; full SARIF logs -> ephemeral storage.

5. **No evasion.** Never attempt `--no-verify`, `LEFTHOOK=0`, or modifying `.git/hooks`. Hooks = local gate adoption installs. Adoption adds no server-side `praetorctl` gate run. Scaffolded CI: `.github/workflows/praetor-docs.yml` runs step `Stop on a draft pull request`, `node tools/markdownlint/verify.mjs`, step `Verify figures`; `.github/workflows/praetor-api.yml` runs step `Stop on a draft pull request`, `go run tools/apicompat/gate/main.go -base="$BASE"`.

6. **Anti-loop interception.** Same AST diff + error category repeats $\ge 3$ times -> halt immediately. Re-evaluate design; no micro-textual retries.

<!-- praetor:config -->

## Text Register

<!-- praetor:register:start -->
Register follows the audience, then the task label of your brief (`register:` in `.standards.yaml`; labels are the router's `target_tasks`).

| Register | Where | Form |
| :--- | :--- | :--- |
| social | forge: issues, PR bodies, review comments, commit bodies | `social-text` skill: BLUF, full sentences, scannable, enough and no more; conventional commit subject unchanged |
| docs | docs/, README, ADR bodies | complete without bloat: newcomer path first, expert reference after; every claim points at a file, command or test; no restated code |
| internal | briefs, agent-to-agent traffic, research fan-outs, workflow returns | `caveman` skill: fragments, no filler, verbatim code/paths/errors; facts, paths, commands, verdict |

- Task rows: social = commit_message_synthesis, waiver_signoff; docs = architecture_synthesis, function_docstrings; every other label and any unlabeled text = internal. Subagent launch brief: `caveman` brief shape with `task:` = routing label.
- Evidence above 58 lines or 1500 tokens leaves the message as a file under `.workingdir/evidence/`; return `evidence: <path> sha256:<12 hex> lines:<n>` and fetch it only when a decision needs it.
- An internal return carries verdict, changed paths, commands run, evidence pointers and open questions, nothing else.
<!-- praetor:register:end -->

<!-- praetor:tail -->

## Primary Verification Commands

```bash
# Fast local test suite
# Declared commands only; run them before claiming application verification.
'npm' 'run' 'build'
'npm' 'run' 'check'
'npm' 'run' 'test'

# Recompile and verify cross-agent context outputs
praetorctl compile-context --verify

# Audit repository against declared HISS standards
praetorctl audit

# Repository gate; steps live in Makefile
make verify-all
```

<!-- markdownlint-enable MD013 -->
<!-- markdownlint-disable MD025 -->
<!-- praetor:harness:end -->

---

# Repository agent contract

Read [`docs/principles.md`](docs/principles.md) before changing this repository.
It is project-wide engineering and research contract. Then read nearest
nested `AGENTS.md` for files in scope.

Before drafting or revising project-authored explanatory prose, read and apply
project-local [`research-writing` skill](.agents/skills/research-writing/SKILL.md).
It does not apply to imported sources or verbatim quotations.

Before changing public layout, typography, colour, interface hierarchy, or
brand expression, read and apply project-local
[`research-design` skill](.agents/skills/research-design/SKILL.md). Use the
[`reader-editor` skill](.agents/skills/reader-editor/SKILL.md) as well when the
design problem exposes comprehension failure in project prose.

Before changing continuous book or generated PDF hierarchy, print
typography, pagination, navigation, figures, tables, equations, or visual QA
contract, also read and apply project-local
[`publication-design` skill](.agents/skills/publication-design/SKILL.md).

Before adding or changing recurring dependency, CI, release, generation,
GitHub-metadata, security-drift, or translation-freshness automation, read and
apply project-local
[`maintenance-automation` skill](.agents/skills/maintenance-automation/SKILL.md).
It does not grant authority to automate scientific judgement, claim promotion,
or consequential remote state.

## Hard rules

1. Git `main` is canonical. Do not synchronize or regenerate concept from a
   chat or parallel document store.
2. Change smallest coherent chapter, claim, equation, test, diagram, or
   decision. Preserve unrelated and untracked files.
3. Keep observation, engineering translation, and hypothesis distinct.
4. Add or update stable `C-` claim before promoting major assertion. Map it
   to existing `P-` bundle before inventing new principle.
5. Primary or authoritative sources may support claims; imported conversations
   and summaries may only identify leads.
6. Never present smoke, readiness, construction, synthetic calibration, or
   protocol conformance as scientific result.
7. Define every quantitative boundary, unit, symbol, comparator, hardware
   context, and uncertainty source.
8. Bound every experiment loop, retry, queue, subprocess, search grid, output,
   and timeout. Record seeds and run identity at claim-eligible boundaries.
9. Keep generated sources editable and deterministic. Do not edit `dist/`,
   `dist-github-pages/`, or generated reader copies.
10. Follow [`LICENSING.md`](LICENSING.md). Citation is not permission to copy;
    `sources/` and all third-party material keep their own terms.
11. EU and German law, official adoptions, and applicability are normative
    default. Do not infer compliance from standard title or checklist.
12. Use pinned dependencies and full commit SHAs for GitHub Actions. Do not
    claim GitHub setting is active without verifying it remotely.
13. Project-authored prose must carry information rather than generated-sounding
    filler. Run `npm run check:prose` after changing canonical Markdown. Prose
    embedded in site code remains review-gated; automated tripwire does not
    attempt brittle JSX or HTML extraction.
14. Apply [`research/research-integrity-baseline.md`](research/research-integrity-baseline.md)
    at every triggered research boundary. Disclose contributors, support,
    competing interests, and material AI or external-tool use; complete any
    required ethics or misuse review before affected work begins.

## Repository map

| Path | Authority |
| --- | --- |
| `concept/` | Maintained synthesis and architecture chapters |
| `research/claims.md` | Stable evidence ledger and claim status |
| `research/principle-registry.md` | Deduplicated cross-domain causal invariants |
| `research/references.bib` | Bibliographic identities and primary-source locators |
| `research/audits/` | Field- and mechanism-level evidence audits |
| `research/research-integrity-baseline.md` | Deduplicated European research-conduct, disclosure, ethics, correction, and review rules |
| `research/disclosures/` | Per-output contributors, support, competing interests, material tools, approval, and verification records |
| `research/engineering-relations.json` | Number-free links from external code to 20w contracts; `NO_RESULT`, never claim evidence |
| `math/` | Notation, derivations, units, and testable models |
| `experiments/candidates/` | Architecture-candidate comparison contracts |
| `experiments/fixtures/` | Candidate-independent stress and falsification fixtures |
| `experiments/workstation/` | Executable development and claim-eligible run machinery |
| `assets/` | Editable diagrams, plotting data, and rendered figures |
| `decisions/` | Append-only durable decisions; supersede rather than rewrite |
| `sources/` | Provenance records and explicitly licensed imports, not evidence by default |
| `app/`, `github-pages/` | Interactive reader and public Pages portal |
| `.agents/skills/publication-design/` | Continuous-book and PDF review contract |
| `translations/` | Reviewed, source-version-bound derivatives; English Git source remains canonical |
| `scripts/` | Validation, generation, and publication-boundary tooling |

## Working sequence

1. Inspect affected authority file and its reciprocal links. Before commit,
   inspect staged, unstaged and relevant untracked changes; tests execute the
   working tree, not only index.
2. Make smallest patch; do not rewrite nearby material for style alone.
3. Select local checks from current `.github/ci-impact.json` ownership,
   changed contracts and downstream consumers. Union mixed scopes; include
   affected CLI, integration, fixture and generator checks, not only leaf tests.
   Unknown, unsafe or shared-authority changes require full local gate.
4. Run selected checks before commit. Run `npm run check` for full
   fallback and before marking pull request ready, integrating into `main`,
   merging or releasing. Changes to book source bytes or membership also
   require `npm run generate:book-pdf` and `npm run validate:book-pdf`.
   Changes confined to `scripts/book-render-free-sources.json` paths take
   `npm run record:book-provenance` instead of render
   ([Decision 0090](decisions/0090-re-record-book-provenance-for-dependency-records.md)).
   [Decision 0088](decisions/0088-impact-scope-ci-and-local-validation.md) defines
   scope selection and evidence reuse; complete integration and release gates
   remain unchanged.
5. Update `CHANGELOG.md` for notable change. Add decision record when an
   authority, architecture, policy, licensing, publication, or release rule
   changes durably.
6. Use Conventional Commit message and push only clean, validated tree.
7. Keep auxiliary Git worktrees under ignored
   `.workingdir2/worktrees/` directory instead of creating repository siblings.

## Common commands

```bash
npm ci
npm run check
npm run test:github-pages
npm run generate:book-pdf
npm run validate:book-pdf
```

Use targeted `test:workstation:*` scripts and affected Go package/consumer tests
during development. Determine pending-change scope manually: `20w ci plan`
compares committed base/head revisions, not staged, unstaged or untracked files.
Its lane selection does not select individual Go packages. Aggregate gate
remains authoritative at integration and release boundaries above.

## File-specific instructions

- [`research/AGENTS.md`](research/AGENTS.md) governs claims, evidence, source
  audits, principle deduplication, and normative material.
- [`experiments/AGENTS.md`](experiments/AGENTS.md) governs candidate and fixture
  contracts.
- [`experiments/workstation/AGENTS.md`](experiments/workstation/AGENTS.md)
  governs executable runs and authority boundaries.
- [`app/AGENTS.md`](app/AGENTS.md) governs interactive reader.
- [`scripts/AGENTS.md`](scripts/AGENTS.md) governs validators and generators.
