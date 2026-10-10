# 0089 — Publish a derived mechanism index

- **Status:** accepted
- **Date:** 2026-10-10
- **Authority:** schema and freshness contract for the derived mechanism
  index. The maintainer accepted this record on 2026-10-10, after the
  generator and index had landed under the proposal; other repositories may
  rely on schema 1 from that acceptance. No claim, principle, candidate,
  fixture or status changes.
- **Related:** [0087](0087-record-engineering-relations-without-evidential-authority.md),
  [docs/start-here.md](../docs/start-here.md)

## Context

Agents and other repositories refer to this hub by identifier: `C-` claims,
`P-` principle bundles, numbered candidates and `F-` fixtures. To resolve an
identifier today they must parse four Markdown files whose formats were written
for human readers. Decision 0087 rejected letting Praetor own the relation
links partly because Praetor "cannot resolve 20w identifiers offline". A
consumer that guesses at the Markdown structure will drift silently when a
heading or table changes.

Claim parsing also existed only inside `scripts/audit-test-coverage.mjs`. A
second parser written for an index would be a second authority over the same
ledger format.

## Decision

1. Generate `research/mechanism-index.json` from `research/claims.md`,
   `research/principle-registry.md`, `experiments/candidates/README.md` and
   `experiments/fixtures/README.md` with
   `npm run generate:mechanism-index`. The file is derived navigation: it is
   `NO_RESULT`, carries no claim, status or result of its own, and each entry's
   source file stays authoritative.
2. Schema 1 records, per entry: claims `{id, status, statement, path, anchor}`;
   principles `{id, title, path, anchor, claims}`; candidates
   `{id, title, question, path}`; fixtures `{id, title, path}`; plus the
   repository URL, the source list, counts and an authority note. Paths are
   repository-relative, so a consumer pins them to a commit.
3. Claim parsing lives in one shared module, `scripts/lib/research-ledger.mjs`,
   which both the coverage audit and the index generator call. The coverage
   audit's output does not change.
4. `npm run validate:mechanism-index` regenerates the index in memory and fails
   when the committed file is missing or stale. It runs in the aggregate gate
   and the research lane. The generator fails closed on oversized inputs,
   excessive entry counts, duplicate identifiers, unknown status words and an
   empty ledger or registry.
5. A schema change that removes or renames a field increments `schema`.
   Adding a field does not.

## Consequences

- Editing a claim's status or statement, a principle bundle, or a candidate or
  fixture index row now also requires regenerating the index. The freshness
  check names the stale file.
- Consumers resolve identifiers from one JSON file at a pinned commit instead
  of parsing chapter Markdown.
- The index does not cover audits, decisions, chapters or engineering
  relations. Adding them needs a reason from a consumer, not completeness.
- The parser reads a claim's statement from its `Statement` or `Claim` field
  and its status from the first word of its `Status` field, as the coverage
  audit always has. A ledger entry with a differently labelled status field is
  reported as `unknown` by both. Claims C-1377 to C-1385 used an
  `Evidence status` label until a later ledger fix renamed it to `Status`;
  their status words did not change.

## Alternatives considered

- **Identifier, title, status and path only, without statements or
  principle-to-claim links.** Smaller and less churn, but a consumer would
  still have to parse the registry to follow a bundle to its claims.
- **An `llms.txt`-style Markdown index on the Pages site.** Readable by
  language-model agents, but not structured for offline identifier resolution,
  and it would change the site build.

## Verification and disclosure

The index generator's tests include a planted stale index, which the freshness
check must reject, and the coverage audit's generated files must stay
byte-identical after the parser moves. Claude Code (Opus 5.5) wrote this record
and specified the implementation; a Gemini 3.1 Pro agent implemented the
generator under that specification, and Claude Code reviewed the result before
submission. The maintainer accepted this record on 2026-10-10.
