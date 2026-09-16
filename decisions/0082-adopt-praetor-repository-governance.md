# 0082 — Adopt Praetor repository governance

- **Status:** accepted
- **Date:** 2026-09-16
- **Authority:** agent-harness compilation and repository governance scaffolding;
  no change to research authority, claim status or acceptance criteria

## Context

`AGENTS.md` is this repository's agent contract, and `CLAUDE.md` was a pointer
that deliberately refused to restate it. That arrangement kept a single
authority but left every other vendor harness unwritten, so Cursor, Copilot,
Windsurf, Codex and Gemini received no contract at all.

[Praetor](https://github.com/cordanaLLM/praetor) compiles one canonical
`AGENTS.md` into vendor-specific harnesses. Its model matches the arrangement
this repository already maintained by hand, which is why adoption is a
mechanisation of existing practice rather than a new authority.

## Decision

Adopt the `planning-artifacts` archetype with the `security:high`,
`api:public-contract`, `docs:seo-portal` and `agent:sandboxed` facets. The
archetype describes "research and concept repositories with bounded preparation
governance; runtime, build, boot and release evidence remain explicitly
unverified until supplied by the repository", which restates hard rule 6 rather
than competing with it.

Praetor's auto-detection selects `app-service` from the presence of
`package.json`. That archetype declares a Go runtime and Go linters, so the
profile is pinned explicitly in `.standards.yaml` and must not be left to
detection. The mismatch is recorded upstream as cordanaLLM/praetor#124.

`AGENTS.md` keeps its existing text. Praetor merges its harness above the
repository's own contract; the fourteen hard rules, the repository map and the
nested `AGENTS.md` delegation remain the governing text and start below the
merged section. `CLAUDE.md` becomes a compiled artifact and must not be edited
directly; change `AGENTS.md` and recompile.

Record the 221 existing HISS infractions in `.standards-baseline.json` so
existing code remains legal while new code is gated. A baseline is not a
quality claim: it states what was already present on adoption.

`.standards.lock` pins profile and facet digests. Its `pinned_version` reads
`v1.0.0` for every entry because non-release builds do not carry a version, so
the lock cannot currently identify which Praetor governed this repository
(cordanaLLM/praetor#119). Regenerate the lock once the governing build is a
tagged release.

Documentation validation skips files carrying the compiled-harness banner.
A vendor target restates `AGENTS.md`, so validating it re-validates the same
text from a directory where the contract's repository-relative links no longer
resolve, and counts the harness diagram once per target. The canonical
`AGENTS.md` is still validated in full; only its generated copies are skipped.
Praetor does not rewrite those links when compiling into a subdirectory
(cordanaLLM/praetor#129), and does not mark every target with the banner, so
this exclusion is narrower than it should eventually be.

## Verification and limitations

Adoption was applied with a Praetor build from the pull request that carries
both the adoption discovery bounds and the cross-platform baseline path
comparison. Two defects block adoption on Windows and are recorded upstream:
directory `fsync` in the atomic write path (cordanaLLM/praetor#125) and
verification discovery walking gitignored directories (cordanaLLM/praetor#63).
Adoption therefore ran from Linux against the same working tree.

`lint`, `typecheck`, `check:code-shape`, `check:prose` and `validate:policy`
pass after adoption. The aggregate `npm run check` gate was not completed on
this workstation: `test:go` requires Docker, POSIX file modes, an English
locale and `/bin/bash`, none of which this Windows environment provides. That
limitation predates adoption and is unrelated to it. The gate remains
authoritative in CI, which is where this change must be confirmed.

Generated harnesses are compiled output. Reviewing `CLAUDE.md` is not review of
the contract; `AGENTS.md` remains the text to read. Adoption scaffolds a branch
ruleset and label taxonomy as files, which is not evidence that either is
active remotely — hard rule 12 still applies.
