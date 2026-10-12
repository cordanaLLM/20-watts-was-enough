# 0097 — Keep workflow tool versions out of the action update group

- **Status:** accepted
- **Date:** 2026-10-12
- **Decided by:** derived from the two coordination rulings on pull request
  #156, recorded as `20-watts-was-enough-pr156-python-coupling` and
  `20-watts-was-enough-pr156-buildx-coupling` (paraphrased): the workflow
  Python version and the Buildx version stay at their locked values, and each
  moves later as one unit together with its lock. This record adds no rule
  about the values; it changes how the update bot proposes them.
- **Authority:** `renovate.json`, the update-group rule in
  `scripts/validate-engineering-policy.mjs` and its test. No workflow value,
  lock or approved pin changes. No claim, principle or status changes.
- **Related:** [0049](0049-adopt-bounded-maintenance-automation.md),
  [0078](0078-reuse-verified-renderer-build-cache.md),
  [0092](0092-exclude-the-clrs-generator-folder-from-update-proposals.md)

## Context

The update bot put every dependency of its `github-actions` manager into one
group named "github actions". That manager extracts seven dependency types.
One of them, `uses-with`, is a tool version passed as an input to an action.
Two such values sit in workflows the bot may change: `python-version` of
`actions/setup-python` (three lines in `ci.yml` and `release.yml`) and
`version` of `docker/setup-buildx-action` (four lines in the same files).

Neither value moves alone:

- **Python** is the runtime of the fixture-019 environment.
  `scripts/validate-engineering-policy.mjs` compares the workflow value with
  `experiments/workstation/fixture-019/python-environment.lock.json`, the base
  image of the fixture's Dockerfile, its manifest and the container checks.
- **Buildx** is recorded in `tooling/pdf-renderer/lock.json` by version and
  revision. `tooling/internal/pdfrender/render.go` compares the running client
  with that record before a render, and decision 0078 was checked against that
  version.

Pull request #156 showed the cost. The group carried four action updates
together with Python 3.14.8 and Buildx v0.37.2. The policy validator refused
the Python lines. The Buildx lines passed every local check, because the Go
tests stub the client's version output, and failed the hosted
`PDF renderer reproducibility` job. Both values were restored by hand and the
four actions merged alone. With the group unchanged, the next bot run would
have proposed the two values again, this time as the whole content of the
group.

## Decision

1. The group rule lists `"matchDepTypes": ["!uses-with"]`. Actions, runner
   labels and container images stay in the group; a workflow tool version is
   proposed in a pull request of its own.
2. A second rule matches `uses-with` and adds one note to the body of such a
   pull request. The note names the two locks and says that
   `npm run validate:policy` fails until a bound value moves with its lock.
3. `npm run validate:policy` refuses a package rule with a `groupName` unless
   the rule lists `!uses-with` in `matchDepTypes`, or selects by
   `matchManagers` and names only plain manager names other than
   `github-actions`. It also refuses a `groupName` outside `packageRules`.
4. The rule for the values is unchanged. Python moves with the fixture-019
   lock, the Dockerfile base image, the manifest and the container checks.
   Buildx moves with the renderer lock's version and revision, the CLRS image
   contract, a rerun of the renderer proof and a recheck of decision 0078.

## Consequences

- A proposal for Python or Buildx fails the gate until someone completes it
  with its lock. It announces that the lock unit is due; it is not an update
  that can merge as proposed.
- A future `uses-with` value that no lock binds is also proposed alone and
  carries the same note. The note stays true: it names the two bound values
  and makes no statement about others.
- The validator reads the rules in `renovate.json` only. Rules that a preset
  brings are not read. The check below found no preset rule that groups either
  value at one engine version; a later preset can change that without a
  finding here.
- The validator accepts fewer spellings than the bot. The bot matches
  dependency types without regard to case and accepts a negated regular
  expression; the validator requires the exact entry `!uses-with`.

## Alternatives considered

- **Disable updates of `uses-with` values.** Nothing would then announce a
  newer Python or Buildx release, and a lock unit would start only when
  someone remembers it.
- **Narrow the group to the dependency type `action`.** Runner labels and
  container images would leave the group as well, although no lock binds them.
- **One group per lock**, for example the workflow Python value together with
  the Dockerfile base image. The lock file and the manifest are not files the
  bot edits, so the group would still not be the whole unit. Which proposals
  a lock unit collects is left to that unit.

## Verification and disclosure

The update bot's own engine (container image `renovate/renovate:44.143.0`,
started without network) resolved the presets of the configuration before and
after this change and applied the resulting rules, 731 and 732, to five fixed
dependencies with its own matcher:

| Dependency | Type | Group before | Group after |
| --- | --- | --- | --- |
| `docker/build-push-action` | `action` | github actions | github actions |
| `ubuntu` | `github-runner` | github actions | github actions |
| `python` | `uses-with` | github actions | none, one body note |
| `buildx` | `uses-with` | github actions | none, one body note |
| `vite` (npm) | `devDependencies` | none | none |

The engine's `renovate-config-validator --strict` exits 0 on the new file and
1 on a copy with `matchDepTypes` planted outside `packageRules`.

Not checked: the version of the hosted bot, and a run of the bot against the
forge. No version lookup was made, because the lookups for these dependencies
need a forge token. The branches the bot opens after its next scheduled run
are the first observation of the rule in service.

`npm run validate:policy` fails with one finding on the configuration without
this change. The test refuses seven altered forms of the group rule and ten
`matchManagers` shapes of a planted second group, accepts three shapes that
keep the values out, and refuses a `groupName` outside `packageRules`.

AI assistance wrote the change, the test and this record. The checks named
above verified the result; the rule about the bound values comes from the
rulings cited at the top.
