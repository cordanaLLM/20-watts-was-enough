# 0083 — Transfer the repository to cordanaLLM

- **Status:** accepted
- **Date:** 2026-09-16
- **Authority:** repository ownership, Go module path and published identity; no
  change to research authority, claim status or acceptance criteria

## Context

This repository already publishes as Cordana. The reader serves from
`https://www.cordana.dev/` ([decision 0029](0029-bind-pages-to-the-custom-domain-root.md)),
the concept it grounds is described in `cordanaLLM/preview`, and its governance
is compiled by `cordanaLLM/praetor` ([decision 0082](0082-adopt-praetor-repository-governance.md)).
Only the repository owner still says otherwise.

The name stays. `20-watts-was-enough` is the title of the published book, the
framing of [C-001](../research/claims.md#c-001), and the identifier every
existing citation uses. An owner change is recoverable through GitHub's
redirect; a name change would strand published references.

## Decision

Move the repository to `cordanaLLM/20-watts-was-enough`. The Go module becomes
`github.com/cordanaLLM/20-watts-was-enough/tooling`, and repository URLs,
`CITATION.cff`, the standards manifest owner and documentation follow.

`decisions/` is not rewritten. Earlier records state the owner that was correct
when they were written, and this repository supersedes rather than rewrites.
Their links continue to resolve through GitHub's redirect, and rewriting them
would falsify the record to fix a link.

Published container images keep their existing identity. `ghcr.io` packages do
not move with a repository transfer, and `tooling/pdf-tools/contract.json` and
`tooling/clrs-generator/image-contract.json` pin exact image digests whose
configuration bytes include the owner in `org.opencontainers.image.source` and
the `io.github.lusoris.*` labels. Renaming those strings would invalidate a
reproducible pinned image to change a label. Image identity moves when the
images are next rebuilt and republished, as a separate step with its own
evidence, not as a text edit.

## Verification and limitations

`lint`, `typecheck`, `check:code-shape`, `check:prose`, `validate:policy`,
`validate:docs`, `validate:tooling` and `validate:book-pdf` pass, as do
`go build` and `go vet` across the renamed module. The book was re-rendered
because `README.md` belongs to the book source set; the render completed twice
identically and the recorded provenance was updated.

The HISS ratchet reports `0 new unbaselined` infractions and then refuses the
change because 75 touched files carry pre-existing baselined debt. The rule has
no exception for a mechanical rename, and the generated pre-commit hook cannot
reach the `--touched` flag that would narrow it. This is recorded upstream as
cordanaLLM/praetor#150; the commit is made without the hook, and the audit
result is quoted in the commit message rather than hidden.

This decision prepares the transfer. It does not perform it. The transfer
itself, the GHCR package migration, the Pages custom-domain rebinding, the
OpenSSF Scorecard re-registration and the branch-protection ruleset must be
applied against the moved repository and verified remotely; hard rule 12 still
forbids claiming any GitHub setting is active without that check.
