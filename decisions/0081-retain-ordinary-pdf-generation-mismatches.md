# 0081 — Retain ordinary PDF generation mismatches

- **Status:** accepted
- **Date:** 2026-09-06
- **Authority:** publication failure-evidence retention; no change to acceptance
  criteria or scientific authority

## Context

Ordinary PDF generation compares two bounded PDF/manifest pairs before
publishing. Previously, a mismatch failed the command but staging cleanup
removed the compared bytes. Builder cleanup could also fail before comparison.
The independent reproducibility command already retains its own failure
evidence; ordinary generation must not impersonate that proof.

## Decision

Retain the four exact compared artifacts under one exclusively created
`build/evidence/pdf-generation-mismatch-<identity>/` directory, with separate
`render-1/` and `render-2/` children. Use the already-read bytes, the existing
64-MiB PDF and 2-MiB manifest limits, and the existing exclusive synced writer.
The maximum complete bundle is 132 MiB. Reject symlink parents and existing
destinations; do not replace earlier evidence or retry identity collisions.

Compare and retain before builder cleanup can prevent diagnosis. Equal pairs
still require successful builder cleanup and the final authority check before
publication. A mismatch leaves the previous public pair untouched and remains
an error. Retention, staging, builder, lock and diagnostic errors must not hide
one another. If copying fails partway, keep completed artifacts and report the
location as incomplete; do not claim a complete bundle.

No new public command option, success-output field or proof receipt is needed.
The exact manifests travel with their PDFs; the error reports where they were
retained. These artifacts are failure diagnostics, not a scientific result,
an accepted publication or evidence of two independent image builds.

Retention adds no automatic upload or deletion. Inspect and retire identified
bundles explicitly after triage. Do not weaken comparisons or rerun unchanged
inputs merely to obtain a passing pair. Each invocation is bounded, but the
operator remains responsible for accumulated diagnostic storage.

## Verification and limitations

Regression tests cover exact retention, partial writes, contained exclusive
paths, unchanged publication and joined cleanup errors. Normal publication and
integration gates remain required; mocked mismatches do not establish that a
real renderer defect is fixed. Path checks assume an operator-owned workspace,
not protection against a hostile process changing its ancestry concurrently.

Codex prepared the code, tests and prose; separate agent review is engineering
review, not independent human research review. The
[publication workflow](../docs/publication-workflow.md) remains the entry point
for generation and proof commands.
