# 0091 — Derive plain version copies and keep reviewed literals

- **Status:** accepted
- **Date:** 2026-10-11
- **Decided by:** the maintainer's planning round of 2026-10-11 on the
  update-bot backlog (paraphrased): reviewed artifact hashes and runtime
  versions in the validator and tests stay as a second key; runtime and
  toolchain upgrades stay hand units; only plain copies are derived from one
  source.
- **Authority:** engineering policy for runtime and toolchain pins in
  workflows, `scripts/validate-engineering-policy.mjs` and its tests. No
  runtime version changes. No claim, principle or status changes.
- **Related:** [0059](0059-run-one-enforcing-dependency-audit-per-full-gate.md),
  [0088](0088-impact-scope-ci-and-local-validation.md)

## Context

A runtime or toolchain pin appears in more than one place. Some places hold a
value a reviewer approved together with an artifact: the npm archive size and
SHA-256 in `scripts/validate-engineering-policy.mjs`, the NumPy wheel digest,
image digests in tests, `go.sum` checksums. `REQUIRED_NODE_VERSION` in
`experiments/workstation/lib/node-runtime-policy.mjs` is the Node version the
gates and run manifests require. Other places only repeat a value: ten workflow
steps named `node-version: 26.8.1` beside `.node-version`, which held the same
version and was checked by nothing.

On 2026-10-11 six open update-bot pull requests (#156, #157, #163, #167, #170,
#179) failed because they changed a record and not the reviewed literal that
checks it. The update bot's Node pull request (#167) changed `.node-version`;
its GitHub Actions pull request (#156) also moved the ten workflow copies, so
one runtime upgrade arrived split over two pull requests.

## Decision

1. A reviewed literal stays. An artifact hash, checksum, image digest or
   required runtime version in the validator or a test is a second key: a
   change must move the record and the literal, and a reviewer sees both.
   These literals are not derived from the file they check.
2. A plain copy reads its source. A place that repeats a pin without adding a
   review does not hold the value.
3. First case: every `actions/setup-node` step reads
   `node-version-file: .node-version`. The validator fails on a step with a
   `node-version` input or another version file, in any workflow, and fails
   unless `.node-version` holds exactly `REQUIRED_NODE_VERSION` and a final
   newline.
4. Runtime and toolchain upgrades (Node.js, npm, Python, NumPy, Go, base
   images) stay hand units. An update-bot pull request for one is a notice
   that an upgrade exists; it is not merged as proposed.

## Consequences

- A Node.js upgrade edits `.node-version`, `package.json`, the reviewed
  constant and the image and manifest records, and no workflow line.
- The workflow Node version can no longer differ between jobs or from the
  version the gates require.
- The npm version in workflow step names and in the `npm --version` check, and
  the Python version in workflows, remain copies. The validator compares them
  with reviewed literals. They are candidates for the same treatment.
- This change turns no open update-bot pull request green.

## Alternatives considered

- **Derive the reviewed literals from the records they check.** One edit would
  then pass the gate, and the approval of an artifact hash would no longer be
  visible as a second change.
- **Keep the workflow copies and let the update bot move them.** The copies
  moved in a different pull request than `.node-version` and the reviewed
  constant.

## Verification and disclosure

The tests cover a workflow that reads the file, jobs without a Node setup, a
literal version, both inputs together, another version file, missing inputs,
and version files with another version, no final newline, a `v` prefix, a
blank line or a carriage return. Two validator mutants were run once: one that
accepts both inputs together and one that trims the file before comparing;
each fails its test. A literal version planted in `.github/workflows/ci.yml`
and another version planted in `.node-version` each fail
`npm run validate:policy`.

AI assistance wrote the change, the tests and this record. The checks named
above and `npm run check` verified the result; the maintainer decided the rule.
