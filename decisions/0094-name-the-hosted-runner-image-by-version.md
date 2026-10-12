# 0094 — Name the hosted runner image by version

- **Status:** accepted
- **Date:** 2026-10-11
- **Decided by:** the ruling of 2026-10-11 for every repository of the
  organisation, recorded as `fleet-runner-label-20261019` (paraphrased): before
  2026-10-19 each job that selects the floating Linux label names
  `ubuntu-26.04` instead. A job that fails there names `ubuntu-24.04` in the
  same change under a dated exception: one job, a reason and an end date
  within 90 days.
- **Partly supersedes:** [0056](0056-keep-public-workflows-off-self-hosted-runners.md),
  the runner label in point 1 only. The rest of 0056 stands: hosted runners
  only, no self-hosted label, no dynamic runner expression.
- **Authority:** the `runs-on` value of every job in `.github/workflows/`, the
  runner rules in `scripts/validate-engineering-policy.mjs`, and the runner
  line in `.github/AGENTS.md`. No claim, principle or status changes.

## Context

Every job of this repository selected its runner with `ubuntu-latest`: 24
lines in eight workflow files on `main` at `013c66d`. That label does not name
an image. GitHub moves it from one Ubuntu release to the next, and the
[runner images announcement 14748](https://github.com/actions/runner-images/issues/14748),
read on 2026-10-11, sets the next move: from 2026-10-19 the label starts to
resolve to Ubuntu 26.04 instead of 24.04, in a rollout over several weeks that
is planned to end by 2026-11-19.

During such a rollout two runs of one commit can land on different images.
A job that passes on one and fails on the other then fails without any change
in the repository, and the run's log is the only place that says which image
it got. The project binds its evidence to exact tool versions elsewhere: full
commit SHAs for actions, an exact Node version, hash-locked installs. The
runner image was the one input of a CI run that the repository did not name.

The [runner images table](https://github.com/actions/runner-images/blob/main/README.md),
read the same day, lists `ubuntu-26.04` as a label of its own for the x64
image.

## Decision

1. Every job in `.github/workflows/` runs on the GitHub-hosted image
   `ubuntu-26.04`. This replaces the label named in point 1 of decision 0056.
2. `npm run validate:policy` refuses any other `runs-on` value. That includes
   `ubuntu-latest`, an older version label, a self-hosted label and a dynamic
   expression.
3. No job is exempt today. A job that cannot run on the named image is moved
   to `ubuntu-24.04` only together with an exception in the validator that
   names that one job, gives the reason and carries an end date at most 90
   days ahead, after which the validator refuses it again.
4. A later image version is a reviewed edit of the label in the workflows and
   the validator in one change, with the CI run of that change as the proof.

## Consequences

- The image changes when the repository changes it, in a pull request whose
  own CI run shows the result.
- The repository no longer follows GitHub's default by itself. When GitHub
  retires the 26.04 image, the label has to be moved by hand before the
  retirement date. The retirement of an image is announced in the same
  runner images project.
- A version label still names a moving image: GitHub rebuilds it about weekly
  with updated tools. This decision fixes the release of the operating
  system, not the image build.
- A pull request's own run does not exercise every job on the new label. The
  title and labelling workflows run from the base branch on
  `pull_request_target`, and the Pages, release, scorecard and
  metadata-synchronisation workflows run only on a push, a tag, a schedule or
  a manual start. Their first run on the new label comes after the merge.

## Alternatives considered

- **Keep `ubuntu-latest` and let the rollout decide.** The change of image
  would then arrive on a day nobody chose, possibly between two runs of the
  same commit.
- **Name `ubuntu-24.04`.** That keeps today's image and postpones the move to
  the day the 24.04 image is retired, when it has to happen under a deadline.
- **Name the image through one shared variable.** A `runs-on` expression is a
  dynamic runner selection, which decision 0056 rules out for this public
  repository.

## Verification and disclosure

The 42 replaced occurrences are 24 `runs-on` lines in eight workflow files,
seven comparisons and messages in the validator, ten fixtures and expected
messages in its test, and one line in `.github/AGENTS.md`. Every changed line
differs from its predecessor by the label alone.

The policy test gained a planted case: a job on `ubuntu-latest` and a job on
`ubuntu-24.04` are each refused. With the validator's rule set back to the old
label, that test and the repository-wide policy test fail; with the rule
restored, all 118 tests of `scripts/engineering-policy.test.mjs` pass.

Which jobs ran on the new image before the merge is recorded in the pull
request that carries this decision.

The label replacement was made by an automated assistant on a mechanical
brief and reviewed line by line; the planted case, this record and the
verification were written with AI assistance and checked by the commands
named above.
