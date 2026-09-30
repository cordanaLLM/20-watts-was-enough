# 0087 — Record engineering relations without evidential authority

- **Status:** accepted
- **Date:** 2026-09-30
- **Decided by:** the maintainer on 2026-09-30, choosing 20w as the relation
  authority and public repositories only for the first slice
- **Authority:** research-governance record. It adds a relation registry whose
  authority is `NO_RESULT`. It changes no claim, principle, candidate, fixture,
  result or promotion rule.

## Context

Code in the maintainer's other repositories already does things that 20w
contracts describe: a dependency canary that runs tests in a disposable
worktree, incident reports about builds that reported success without doing
the work, a benchmark that times a fork against its upstream. Nothing in this
repository records which contract such code touches, so the link lives in
memory, in chat, or in the other repository's prose.

Two problems show what goes wrong without a recorded, typed link. A harvest of
those repositories on 2026-09-28 proposed links labelled "implements candidate
009, 010 or 011".
Read against the contracts, most of them realise the candidate's
[required null stack](../experiments/candidates/009-graded-assurance-envelopes.md#required-null-stack)
or one of its conventional
[arms](../experiments/candidates/010-reset-coupled-staged-verification.md#arms),
not the candidate itself. A link without a role turns baseline engineering into
apparent support for the candidate it should be compared against. Separately,
`cordanaLLM/Aegis-OS` at commit `e96d4f6a879119603fb7084b8826af7379693562`
names a local "Locality Enforcement rule P-002" in
`crates/aegis-lictor/src/locality.rs`. Quoted in 20w prose, that identifier
reads as the 20w principle with the same number in the
[principle registry](../research/principle-registry.md), and the documentation
validator would count it as a use of that principle.

The two halves of such a link also have different owners. The measurements
behind a relation (run identifiers, timings, sizes) are engineering facts; they
belong in the maintainer's Praetor evidence store, whose records carry a grade
and state what each record does not establish. Whether a piece of code
realises a candidate arm or a null arm is a judgement about a 20w contract, so
only 20w review can make it.

## Decision

### Authority split

- 20w owns the relation.
  [`research/engineering-relations.json`](../research/engineering-relations.json)
  is the only authoritative record of which external code relates to which 20w
  contract. `20w validate relations` checks it offline against this
  repository's own identifiers, and
  [`research/engineering-relations.schema.json`](../research/engineering-relations.schema.json)
  documents its shape.
- Praetor evidence records own the measurements. A `links` field in such a
  record is a hint: it can propose a row for 20w review, but it never decides
  one.
- Other repositories should cite a 20w contract as `20w:<id>@<commit>` with
  the status word the contract itself uses, such as `protocol-complete` or
  `smoke-ready`.

### What a row may say

The file declares `"result_authority": "NO_RESULT"` and contains no JSON
number. Numbers stay at the pinned locator or in the evidence record, where
their method, unit and uncertainty are recorded. A row never targets a `C-`
claim, and the claims ledger may not cite the registry or a relation identity.

A row targets one of these 20w identities:

- `candidate-NNN` or `fixture-NNN`, optionally narrowed by `target_section`,
  the slug of a heading in that contract;
- `P-NNN`, a principle defined in the principle registry;
- `energy:H-EN`, an energy hypothesis heading in
  [`concept/80-energy-model.md`](../concept/80-energy-model.md).

Topic-qualified targets under
[decision 0084](0084-multi-topic-research-repository.md) wait until the
validator can resolve the topic registry.

| Relation | Meaning | Admitted roles |
| --- | --- | --- |
| `implements` | The code realises the arm, element or mechanism its role names. | `candidate-arm`, `null-arm`, `harness`, `fixture-stressor` |
| `measures` | The code or record produces a quantity the target already names; `metric` quotes that name. | `metric-instrument`, `null-arm` |
| `feasibility` | The code shows the arm or element can be built or run in a real code base, without realising the contract or measuring its quantities. | every role except `motivation` |
| `motivated-by` | The code states that the target motivated it. | `motivation` |

| Role | Meaning |
| --- | --- |
| `candidate-arm` | Realises part of the candidate's distinguishing residual. Only for `candidate-NNN` targets; `residual` names the part realised. |
| `null-arm` | Realises conventional engineering: a named baseline, control or null arm, an element of a required null stack, or, for a principle or energy hypothesis, an ordinary engineering instance of the mechanism that any candidate must beat. |
| `fixture-stressor` | Realises a fixture's stress, perturbation or hostile condition. Only for `fixture-NNN` targets. |
| `harness` | Execution or test scaffolding that could run a contract's arms without realising any of them. |
| `metric-instrument` | Produces a quantity the target names without being an arm. |
| `motivation` | The target motivated the code, and nothing more. |

`measures` never pairs with `candidate-arm`. Measuring the candidate is a 20w
protocol run with its own manifest and analysis, not a registry row.

Each row also records the repository as `owner/name`, its `visibility`, a full
40-character commit, one to eight repository-relative paths at that commit, an
`evidence_ref`, a `related_party` flag, the date recorded, and
`does_not_establish`, which names what the row must not be read as. The
evidence reference is null, an audit under `research/audits/`, or a GitHub
issue, pull request, workflow run, release tag or blob URL in the row's own
repository; a blob URL uses the row's commit.

### Rejection rules

`20w validate relations` rejects:

1. bytes that are not UTF-8, JSON that repeats a key, nests deeper than four
   levels, exceeds 1 MiB or carries trailing data, and a file that differs from
   its canonical encoding (two-space indentation, schema key order, LF line
   endings, one final newline);
2. any JSON number, an unknown key, a missing required key, and null anywhere
   except `evidence_ref`;
3. more than 1024 rows, and an `ER-NNNN` identity that is malformed, repeated or
   out of ascending order;
4. a `schema`, `result_authority` or `decision` value other than the fixed one;
5. a `C-` target, and a claim identifier in free text, bare or written with the
   `20w:` namespace;
6. a target that does not resolve, a topic-qualified target, a `target_section`
   that names no heading, and a `metric` the target file does not contain;
7. a relation or role outside the vocabularies, a pair outside the matrix,
   `candidate-arm` without a candidate target and a `residual`,
   `fixture-stressor` without a fixture target, `metric` without `measures` or
   the reverse, and `measures` without an evidence reference;
8. a repository that is not `owner/name` or is this repository, a commit that is
   not 40 lowercase hexadecimal characters, no path or more than eight, a path
   that is absolute, repeated or not clean, and an evidence reference outside
   the grammar above;
9. an identifier in free text without a namespace: an external rule is written
   `aegis:P-002`, a 20w principle `20w:P-003`;
10. an evidential verb (prove, establish, confirm, demonstrate) in `subject`,
    free text beyond its length bound, and a `recorded` value that is not a
    calendar date;
11. `"visibility": "private"`;
12. a claims ledger that mentions the registry or an `ER-NNNN` identity.

### First slice

The first slice admits public repositories only. A row for a private
repository, such as the Kubernetes monorepo behind the
[engineering-transfer audit](../research/audits/2026-08-30-lusoris-k8s-engineering-transfer.md),
needs a later decision that admits private rows only when a 20w audit backs
them.

The seed rows ER-0001 to ER-0009 come from the 2026-09-28 harvest. On
2026-09-30 each commit was read back through the GitHub API as existing and
reachable from its repository's default branch, and each path as present at
that commit. Where a proposed role or section did not match the contract text,
the row uses the one the contract supports.

### Disclosure

The maintainer owns or controls every repository in the first slice, so every
row sets `related_party` to true. An AI coding agent (Claude Opus 5.5,
2026-09-30) drafted the rows from the harvest and the target contracts.
Approval is the maintainer's pull-request review; no row has had independent
review.

## Consequences

- Adding or changing a relation is a 20w pull request. Renaming a 20w target
  and updating its rows land in the same change.
- Rows go stale as the other repositories move. The pinned commit keeps each
  row reproducible; a drift report that never gates CI is later work.
- No claim, protocol, workstation manifest or promotion rule reads the
  registry. A relation can at most motivate a 20w protocol run; it never
  substitutes for one.
- Later slices add a reader view labelled as engineering relations rather than
  evidence, `praetor-evidence:` references once the Praetor store exists,
  topic-qualified targets, and private rows behind audits.

## Alternatives considered

- **20w holds relations and measurements.** Rejected: numbers without a claim,
  derivation or hypothesis label would enter the research repository.
- **Praetor records own the links.** Rejected: Praetor cannot resolve 20w
  identifiers offline, the arm-versus-null judgement would be made outside 20w
  review, and links would break silently when 20w renames a target.
- **A separate bridge repository.** Rejected: it adds a third authority and
  makes validation depend on the network.
