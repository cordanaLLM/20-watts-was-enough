---
name: maintenance-automation
description: Design or review recurring maintenance automation for 20 Watts Was Enough, including dependencies, CI, releases, generated artifacts, GitHub metadata, security drift, and translation freshness. Use when upkeep repeats or repository state drifts; do not use to automate scientific judgement or claim promotion.
---

# Maintenance automation

Remove recurring repository work without creating opaque maintenance system.
Automation exposes drift early, proposes or applies only bounded repairs,
leaves research decisions with named authority.

Before changing maintenance machinery: read affected authority, nearest
`AGENTS.md`, [`docs/principles.md`](../../../docs/principles.md). Consult
[`references/automation-map.md`](references/automation-map.md) for existing
owner before adding command, manifest, workflow or scheduled job. Read
[`references/prior-art.md`](references/prior-art.md) when revising this skill
or adopting external pattern.

## Admit the task

Automate only when all hold:

1. Task happened at least twice, or deterministic freshness or drift
   invariant proves recurrence.
2. One committed source owns desired state.
3. Success and failure machine-checkable without interpreting scientific
   meaning.
4. Repair bounded, idempotent, stoppable without ambiguous partial state.
5. Saved time or avoided failure exceeds new owner, tests, permissions and
   upgrade burden.

Painful one-off is not maintenance system: record it in relevant issue while
recurrence, authority or safe repair contract stays unclear.

Admit one maintenance class per change; set finite proposal, finding,
inventory, retry and output caps. “Automate everything” = request to classify
backlog, not approval for cross-authority patch or remote write.

## Reuse the authority

Inventory current source, checker, repair path, workflow, issue route, failure
evidence. Extend existing Go package or validator that owns contract. Prefer,
in order:

1. delete duplicate state, derive it from authority;
2. add read-only freshness or drift check;
3. emit deterministic repair plan or diff;
4. add explicit write mode for reversible Git-owned state;
5. automate remote mutation only when repository contract grants that
   authority and operation has preflight, postcondition, bounded rollback or
   retry path.

Classify alert before assigning owner: Dependabot advisory, Renovate
proposal, GitHub Action update, CodeQL result and Scorecard signal can share
dependency yet need different evidence and repair paths.

Portable automation belongs in `20w` Go command where practical: standard
library first, explicit repository root, network access behind explicit
subcommand. Committed manifest owns desired state; workflow schedules or
authenticates command, never becomes second implementation.

Do not add PowerShell, batch files, host-specific wrappers or general task
runner around commands repository exposes. Do not fetch mutable skill text or
operational policy at runtime.

## Specify the maintenance contract

Before implementation, state every item in
[`references/maintenance-contract.md`](references/maintenance-contract.md); it
also holds trigger, schedule and remote-object rules.

## Keep repair authority narrow

Automatic repair may update deterministic, reversible, Git-owned derived
state. It may not:

- promote, demote or merge `C-` claim, evidence status, result or experiment
  readiness state;
- decide whether source supports scientific or normative assertion;
- publish machine translation as reviewed translation;
- suppress security, type, lint, freshness or integrity finding;
- merge dependency or major toolchain upgrade without existing review gate;
- delete unmanaged GitHub objects or rewrite issue history;
- change branch protection, repository security settings, credentials, cluster
  state, releases or other consequential remote state without explicit
  authority and verification that operation requires.

GitHub metadata automation runs from trusted `main`, uses committed manifest,
preserves unmanaged objects, treats issue or milestone progress as operational
state only. Privileged workflow never executes pull-request code. External
actions stay pinned to full commit SHAs; each job gets only needed
permissions.

Do not infer issue-to-milestone assignments without committed mapping and explicit
maintainer approval. Broad maintenance request is not permission for
consequential remote mutation: reconfirm boundary immediately before write.

## Verify before hand-off

Test check path, repair path, idempotent second run, malformed or stale input,
boundary exhaustion, most dangerous plausible partial failure. Use temporary
repositories or fixtures for mutation tests. Confirm check run writes nothing
and repair produces reviewable diff or exact remote postcondition.

Run focused package and policy checks while developing. Select every affected
lane from committed CI impact map; run aggregate gate once at required
integration or release boundary, not between micro-edits. Green unrelated
workflow is not verification.

Hand off: symptom removed, authority reused, trigger, repair boundary,
permissions, focused evidence, measured or expected maintenance cost saved,
removal condition. Report unexercised remote or failure lane as unverified. Do
not watch unchanged workflow while another bounded maintenance item can be
completed.
