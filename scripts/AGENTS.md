# Validator and generator rules

These instructions extend root [`AGENTS.md`](../AGENTS.md).

- Validators fail closed with non-zero exit code and actionable file-level
  diagnostics. Missing or malformed authority data is never silently skipped.
- Generation is deterministic for fixed inputs and has non-mutating `--check`
  or equivalent freshness mode.
- Parse structured data with real parser or schema validator; do not validate
  JSON, YAML, BibTeX, Markdown structure, or manifests with ambiguous regex
  when repository dependency already provides grammar.
- Bound traversal, concurrency, retries, browser work, subprocesses, output,
  and temporary artifacts. Check every subprocess exit state.
- Use atomic replacement for authoritative generated files and preserve the
  previous artifact when generation fails.
- Never weaken source-publication, licence, claim-authority, or receipt check
  merely to make existing artifact pass. Repair artifact or record a
  narrow reviewed exception.
- P10-4 code-shape baseline is debt ceiling, not allowlist. Update it
  only after measured findings decrease; never use `--write` to absorb a
  new or worse finding.
- Tests include at least one valid case and important tamper, omission, and
  stale-output cases for each authority boundary.
