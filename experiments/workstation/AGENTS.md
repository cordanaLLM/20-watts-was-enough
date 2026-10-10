# Workstation-execution rules

These instructions extend [`experiments/AGENTS.md`](../AGENTS.md).

- Development and confirmation identities are disjoint. Development output
  never acquires confirmation authority by relabelling.
- Use explicit seeds, frozen instance/configuration identities, schemas,
  content hashes, append-only receipts, and exact termination reasons.
- Every subprocess has timeout, output cap, descendant-cleanup rule, and
  checked exit state. Reject path substitution, stale caches, partial receipts,
  and identity mismatches fail-closed.
- Resume from verified durable state; recompute summaries from authoritative
  records rather than trusting mutable aggregates.
- Test success, failure, cancellation, timeout, tampering, interrupted writes,
  and resume behavior where boundary exists.
- Do not delete or overwrite retained run evidence as part of ordinary test.
  Test runs use ignored, uniquely identified output directories.
- Do not describe harness as workstation-executable until readiness audit
  confirms every required gate.
