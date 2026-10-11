# 0096 — Tighten the live main ruleset to the rendered policy

- **Status:** accepted
- **Date:** 2026-10-11
- **Decided by:** ruling of 2026-10-11 for this repository, recorded as
  `20-watts-was-enough-refresh-ruleset-scaffold` (paraphrased in the Decision
  section).
- **Partly supersedes:** [0085](0085-keep-the-live-main-ruleset-across-the-transfer.md),
  only where it leaves `.github/rulesets/main.json` unapplied and keeps the
  live ruleset as it was. Its container-label and clone-remote findings stand.
- **Authority:** repository host-settings record; no change to research
  authority, claim status or acceptance criteria.

## Context

Decision 0085 compared `.github/rulesets/main.json` with the ruleset that
protects `main` and kept the live one. It had two reasons. The file demanded
one approval, which the only maintainer cannot give to their own pull request,
and applying it would have dropped the CodeQL rule.

Both reasons are gone at the engine commit that
[decision 0095](0095-pin-the-praetor-engine-and-refresh-the-adoption.md) pins.
The manifest can declare that one person maintains the repository, and the
file is then rendered with zero approvals. The engine also no longer replaces
a ruleset it finds: it compares, and its audit fails a push while the live
ruleset enforces less than the manifest declares.

That comparison, read on 2026-10-11 against ruleset `21746706`, found three
gaps. Commits on `main` did not have to be signed. A new push did not dismiss
an earlier review. Of the jobs that run on every pull request, only
`CI success` was required; `CI impact plan` and the two CodeQL jobs were not.
The live ruleset is stricter than the file in three places: it has no bypass
actor, it allows squash as the only merge method, and it carries the CodeQL
rule and the `PR title` check.

## Decision

1. `.standards.yaml` declares `review_mode: single_maintainer`, dated
   2026-10-11. It returns to `independent` when a second person or a review
   bot with approval rights exists.
2. `.github/rulesets/main.json`, as the pinned engine renders it, is the
   target for `main`. It is no longer an unapplied scaffold.
3. The live ruleset is changed only where that makes it stricter or leaves it
   equal. Added: the signed-commit rule, dismissal of stale reviews on push,
   and the required checks `CI impact plan`,
   `JavaScript and TypeScript analysis` and `Go analysis`. `Go API
   Compatibility` and `Documentation Governance` become required once the
   workflows that report them are on `main`; requiring them earlier would
   block every open pull request, because no run reports them yet.
4. Nothing live is removed or loosened. The ruleset keeps its name, its
   single `main` ref, the CodeQL rule, the `PR title` check, squash as the
   only merge method and an empty bypass list. The file's bypass actor for the
   repository administrator is not written: the live ruleset has none, and
   adding one would loosen it.
5. Each change is one update of ruleset `21746706` through the rulesets API,
   followed by a read-back that must equal the earlier state in every other
   field. The engine's `sync --remote` is not used for this: it would also
   create three labels from `.config/labels.yaml` that this repository's
   label policy does not hold.

## Consequences

- A commit reaches `main` only as a squash merge that GitHub signs. A direct
  push was already refused; an unsigned one is now refused for a second
  reason.
- A pull request waits for five checks before the refresh merges and for
  seven after it. All of them run on every pull request, so none can stay
  pending for lack of a run.
- The engine's audit compares the live ruleset on every push. A setting
  loosened on GitHub by hand fails the next push from any clone.
- The file and the live ruleset still differ in name, in the `lts-*` ref and
  in the bypass actor. The engine reports a stricter live value as such and
  passes.
- [`docs/repository-rule-crosswalk.md`](../docs/repository-rule-crosswalk.md)
  describes the ruleset as read back; it is updated with each read-back.

## Alternatives considered

- **Decline the ruleset step.** Signed commits would stay unenforced, against
  the policy for repositories with one maintainer.
- **Keep the file as documentation only.** The audit would fail every push
  until the ruleset step was declined, which is the first alternative.
- **Run `sync --remote` from the refresh branch.** It would require the two
  engine checks before `main` reports them and write labels.
- **Write the bypass actor.** A maintainer could then merge past a failing
  check through a pull request. No case so far needed it.

## Verification and disclosure

The engine's `plan --remote` and its live audit, run from the refresh branch
on 2026-10-11 as a rehearsal of the pre-push hook, named the same three gaps:
stale reviews not dismissed, commits not signed, and three of the four checks
that `main` reports not required. The audit refused the push for them.

The first update ran at 14:47 UTC on 2026-10-11. The read-back holds the
rules `deletion`, `non_fast_forward`, `required_linear_history`,
`required_status_checks`, `code_scanning`, `pull_request` and
`required_signatures`; the strict contexts `CI success`, `PR title`,
`CI impact plan`, `JavaScript and TypeScript analysis` and `Go analysis`;
`dismiss_stale_reviews_on_push` true; squash as the only merge method; the
single ref `refs/heads/main`; and an empty bypass list. Every field outside
the three additions equals the copy saved before the update. The live audit,
run again, reports that GitHub enforces every declared property. All three
added contexts were reported on an open pull request before they became
required, and neither workflow that reports them has a path filter.

The update script refuses a check name that is not a job name in a workflow
at `origin/main`, a ruleset with another name, and a ruleset that is not
active. Before it touched the forge it ran against a stand-in that answered
in six ways. It accepted the faithful answer and a second run with nothing
left to do. It refused each planted fault: a rule dropped by the update, the
signed-commit rule missing from the read-back, a check lost, a bypass actor
added, and a rejected update.

The second update, which adds the two engine checks, runs after this change
is on `main`. Its read-back goes into
[`docs/repository-rule-crosswalk.md`](../docs/repository-rule-crosswalk.md).

AI assistance wrote the script, ran the update and wrote this record. The
read-backs and audit runs named above verified the result; the maintainer
decided the policy.
