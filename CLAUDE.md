<!-- markdownlint-disable MD013 -->
<!-- Compiled automatically by praetorctl compile-context from AGENTS.md. DO NOT EDIT DIRECTLY. -->

<!-- markdownlint-capture -->
<!-- markdownlint-disable MD013 -->
# cordanaLLM/20-watts-was-enough Agent Operating Harness

Before concluding any turn:

```bash
make verify-all
```

`make verify-all` = repository-owned gate; adoption kept it unread + unexecuted. Steps live in `Makefile`: read there, never restate. Footer commands = project markers only.
Pass = exit 0. Signed Ed25519 Exit-0 receipt only from `praetorctl gate run`; report no receipt it did not mint. Fail -> SARIF diagnostic distillation (<= 1500 tokens).

## Core Directives & Invariants

Adopted check = coverage state + catalog path; else audit scanner; else `unknown`. Gates = (none: no generated `make verify-all`, no praetor `lefthook.yml`); edits not reflected.

| Invariant | Rule | Adopted check | On fail |
| :--- | :--- | :--- | :--- |
| **HISS-01** control flow | recursion prohibited; call graph = DAG | unknown | advisory |
| **HISS-02** loops, I/O | scalar upper bound on every loop; explicit deadline on every I/O call | unknown | advisory |
| **HISS-03** memory | n/a: no such construct in repository languages; advisory | unknown | advisory |
| **HISS-04** complexity | McCabe cyclomatic <= 10, cognitive <= 15, statements <= 50; func LOC <= 60 (audit ceiling) | unknown | advisory |
| **HISS-05** scoping | declare every identifier in smallest lexical scope serving it | unknown | advisory |
| **HISS-06** concurrency | explicit scalar upper bound on every worker pool + concurrent fan-out | unknown | advisory |
| **HISS-07** errors | every error handled or wrapped with context | unknown | advisory |
| **HISS-08** determinism | zero dynamic code execution (`eval` / `exec`); a process signal's target is bounded above 1 (`killpg`, `kill(-pid)`, Go `syscall.Kill`) | unknown | advisory |
| **HISS-09** reference safety | n/a: no such construct in repository languages; advisory | unknown | advisory |
| **HISS-10** warnings | zero warnings: compiler, linter, format sweeps | unknown | advisory |
| **HISS-11** supply chain | pinned lockfiles; zero floating tags; signed provenance | unknown | advisory |
| **HISS-12** secrets | zero credentials in Git history | unknown | advisory |
| **HISS-13** debt ratchet | recorded infractions never grow vs committed baseline | `praetorctl audit` ratchet vs `.standards-baseline.json` | advisory |
| **HISS-14** append-only ABI | public API append-only; breaking change = `!` subject + `Migration:` footer | unknown | advisory |
| **HISS-15** 3D testing | positive + negative + boundary tests, every public interface | unknown | advisory |
| **HISS-16** context integrity | single canonical `AGENTS.md`; vendor files compiled via `praetorctl compile-context` | unknown | advisory |
| **HISS-17** state ledger | turn start `praetorctl state status`; turn end `praetorctl state sync .` | unknown | advisory |
| **HISS-18** CI efficiency | diff-aware gating via `praetorctl ci filter` | unknown | advisory |
| **HISS-19** reuse before writing | one behavior = one implementation; extend or call existing code | unknown | advisory |
| **HISS-20** replayable evidence | every enforcement claim backed by fixtures replayed both directions | unknown | advisory |
| **HISS-21** platform neutrality | gates, hooks, emitted templates run on Linux, macOS, Windows, or skip with stated reason | unknown | advisory |

## Operational Rules

1. **Act on verified state.** Read source files, run real commands before hypothesis or edit. Never guess flag names, library signatures, repo configuration from memory.

2. **Lead with output.** Direct answers, diffs, commands. No filler preamble, no "Based on", no restatement, no chatter.

3. **Context transpiler first.** Never edit `CLAUDE.md`, `.gemini/GEMINI.md`, `.codex/rules.md` manually. All agent instruction updates -> `AGENTS.md`, then:

   ```bash
   praetorctl compile-context
   ```

   - `AGENTS.md` = agent-only text -> caveman (internal register). `praetorctl compile-context --verify` + `praetorctl audit` run caveman lint; findings fail gate; no opt-out. Check first: `praetorctl caveman check --kind=context AGENTS.md`.

4. **SARIF diagnostic distillation.** Compiler/linter errors -> distill to $\le 1,500$ tokens ($< 60$ lines): top 3 root-cause failures with file/line pointers; full SARIF logs -> ephemeral storage.

5. **No evasion.** Never attempt `--no-verify`, `LEFTHOOK=0`, or modifying `.git/hooks`. Adoption installed no hooks here (`lefthook.yml` not praetor-written, or `git-hooks` declined). Adoption adds no server-side `praetorctl` gate run. Scaffolded CI: `.github/workflows/praetor-docs.yml` runs step `Stop on a draft pull request`, `node tools/markdownlint/verify.mjs ${BASE:+--changed-since "$BASE"}`, step `Verify figures`; `.github/workflows/praetor-api.yml` runs step `Stop on a draft pull request`, `go run tools/apicompat/gate/main.go -base="$BASE"`.

6. **Anti-loop interception.** Same AST diff + error category repeats $\ge 3$ times -> halt immediately. Re-evaluate design; no micro-textual retries.

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

## Primary Verification Commands

```bash
# Fast local test suite
# Declared commands only; run them before claiming application verification.
'npm' 'run' 'build'
'npm' 'run' 'test'

# Recompile and verify cross-agent context outputs
praetorctl compile-context --verify

# Audit repository against declared HISS standards
praetorctl audit

# Repository gate; steps live in Makefile
make verify-all
```

<!-- markdownlint-restore -->
<!-- markdownlint-disable MD025 -->
<!-- praetor:harness:end -->

---

# Repository agent contract

Read [`docs/principles.md`](docs/principles.md) before repository edits: project
engineering + research contract. Read nearest nested `AGENTS.md` for scoped
files.

Applicable skills:
- Explanatory prose:
  [`research-writing`](.agents/skills/research-writing/SKILL.md). Excludes
  imported sources, verbatim quotations.
- Public layout, typography, colour, interface hierarchy, brand expression:
  [`research-design`](.agents/skills/research-design/SKILL.md); plus
  [`reader-editor`](.agents/skills/reader-editor/SKILL.md) when design problem
  exposes prose comprehension failure.
- Continuous book or generated PDF hierarchy, print typography, pagination,
  navigation, figures, tables, equations, visual QA contract: also
  [`publication-design`](.agents/skills/publication-design/SKILL.md).
- Recurring dependency, CI, release, generation, GitHub-metadata,
  security-drift, translation-freshness automation:
  [`maintenance-automation`](.agents/skills/maintenance-automation/SKILL.md).
  Grants no authority to automate scientific judgement, claim promotion,
  consequential remote state.

## Hard rules

1. Git `main` canonical. Do not sync or regenerate concept from chat or parallel
   document store.
2. Change smallest coherent chapter, claim, equation, test, diagram, or
   decision. Preserve unrelated, untracked files.
3. Keep observation, engineering translation, hypothesis distinct.
4. Add or update stable `C-` claim before promoting major assertion. Map to
   existing `P-` bundle before inventing principle.
5. Primary or authoritative sources support claims; imported conversations,
   summaries identify leads only.
6. Never present smoke, readiness, construction, synthetic calibration, or
   protocol conformance as scientific result.
7. Define every quantitative boundary, unit, symbol, comparator, hardware
   context, uncertainty source.
8. Bound every experiment loop, retry, queue, subprocess, search grid, output,
   timeout. Record seeds, run identity at claim-eligible boundaries.
9. Keep generated sources editable, deterministic. Do not edit `dist/`,
   `dist-github-pages/`, generated reader copies.
10. Follow [`LICENSING.md`](LICENSING.md). Citation != permission to copy;
    `sources/` and third-party material keep own terms.
11. EU and German law, official adoptions, applicability = normative default.
    Do not infer compliance from standard title or checklist.
12. Use pinned dependencies, full commit SHAs for GitHub Actions. Do not assert
    GitHub setting active without remote verification.
13. Project prose carries information, no filler. Run `npm run check:prose`
    after Markdown edit. Site-code prose = review-gated; tripwire skips JSX/HTML
    extraction.
14. Apply
    [`research/research-integrity-baseline.md`](research/research-integrity-baseline.md)
    at research boundaries. Disclose contributors, support, competing interests,
    AI/tools; complete ethics/misuse review before work starts.

## Repository map

Authority map: [`docs/repository-map.md`](docs/repository-map.md).

## Working sequence

Read + follow [`docs/agent-working-sequence.md`](docs/agent-working-sequence.md)
before changing repository files: working sequence, check selection, book PDF
render step for book-source changes outside
`scripts/book-render-free-sources.json`, common commands.

## File-specific instructions

- [`research/AGENTS.md`](research/AGENTS.md): claims, evidence, audits,
  principle deduplication, normative material.
- [`experiments/AGENTS.md`](experiments/AGENTS.md): candidate, fixture
  contracts.
- [`experiments/workstation/AGENTS.md`](experiments/workstation/AGENTS.md):
  executable runs, authority boundaries.
- [`app/AGENTS.md`](app/AGENTS.md): interactive reader.
- [`scripts/AGENTS.md`](scripts/AGENTS.md): validators, generators.
