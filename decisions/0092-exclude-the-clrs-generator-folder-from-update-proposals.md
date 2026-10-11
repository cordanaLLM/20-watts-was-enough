# 0092 — Exclude the CLRS generator folder from update proposals

- **Status:** accepted
- **Date:** 2026-10-11
- **Decided by:** the maintainer's planning round of 2026-10-11 on the
  update-bot backlog (paraphrased): the generator folder with the fixed
  dependency cutoff is excluded in the update bot's configuration; the bot
  closes its own pull requests for that folder; updates there happen only as a
  reviewed re-resolution with a decision record.
- **Authority:** `renovate.json`, the update-bot rule in
  `scripts/validate-engineering-policy.mjs` and its test. No generator input,
  lock or wheel selection changes. No claim, principle or status changes.
- **Related:** [0055](0055-freeze-clrs-text-as-a-controller-shakedown.md),
  [0071](0071-lock-the-clrs-generator-wheel-selection.md)

## Context

[`tooling/clrs-generator/`](../tooling/clrs-generator/README.md) holds one
reviewed dependency resolution. `lock-input.json` fixes the resolver, the
Python base, five exact wheel candidates and the cutoff
`2026-08-31T13:22:50Z`. `pyproject.toml` is derived from those inputs,
`uv.lock` is the resolution, and `wheelhouse.json` selects one wheel per
runtime package from that lock. `CheckGeneratorImageFoundation` in
`tooling/internal/clrsfixture` compares the files with each other and with the
cutoff.

The update bot treats `pyproject.toml` and `uv.lock` as ordinary package files.
On 2026-10-11 five of its open pull requests changed this folder and nothing
else: #160 (jax), #161 (jaxlib), #164 (tqdm), #169 (Python 3.14) and #176
(lock-file maintenance of `uv.lock`). Each changes one derived file and
leaves `lock-input.json`, the wheel selection and the cutoff as they are. Each
fails twice: the bot's own lock update reports that the resolver finds no
solution under the cutoff, and the Go lane reports `generator dependency
project or lock digest is invalid`.

## Decision

1. `renovate.json` lists `tooling/clrs-generator/**` in `ignorePaths`. The
   update bot extracts no package file from the folder and proposes neither a
   version update nor lock-file maintenance there.
2. A repository `ignorePaths` list replaces the list that `config:recommended`
   brings; the option is not merged. The eight preset entries are therefore
   listed again beside the folder, and the validator requires all nine.
3. A dependency change in the folder is a reviewed re-resolution: new
   `lock-input.json`, derived `pyproject.toml`, new `uv.lock` and
   `wheelhouse.json` in one change, with a decision record that names the new
   cutoff.
4. No session closes the five open pull requests. The update bot closes its
   own when the package files leave its scope.

## Consequences

- Security advisories for packages in the folder still arrive as GitHub
  dependency alerts on `tooling/clrs-generator/uv.lock`; three were open for
  urllib3 on 2026-10-11. The repair is a re-resolution, not an update pull
  request.
- Nothing announces a newer jax, TensorFlow or NumPy release for the
  generator. A re-resolution starts from a need of the generator contract or
  from an advisory.
- If the upstream preset changes its ignore list, the list here does not
  follow. The validator pins the reviewed entries; changing them is a reviewed
  edit of `renovate.json` and the validator together.

## Alternatives considered

- **Keep the folder in scope and leave the failing pull requests open.** Each
  upstream release adds another proposal that cannot pass.
- **Disable the folder with a package rule on file names.** The package files
  would still be extracted, and whether lock-file maintenance honours such a
  rule was not tested. `ignorePaths` removes the files before extraction,
  which is the documented purpose of the option.
- **Let the bot move the cutoff.** The cutoff, the wheel candidates and the
  wheel selection are reviewed together; the bot changes one derived file.

## Verification and disclosure

The update bot's own engine (container image `renovate/renovate:44.143.0`,
`--platform=local`, lookup dry run) ran twice on a copy of `main` with one
planted requirement, `requests==2.20.0`, in
`tooling/clrs-generator/requirements.txt` and the same line in
`tooling/planted-outside/requirements.txt`. With the configuration on `main`
it extracted 22 package files, two of them in the generator folder, and
proposed updates for jax, jaxlib, numpy, tqdm and the planted requirement
there. With this change it extracted 20, none in the folder, and still
proposed the planted requirement outside it; the dependencies and proposed
updates of the 20 shared files were identical in both runs. Both runs had no
GitHub token, so lookups against GitHub were rate-limited in both. The version
of the hosted bot was not checked.

`npm run validate:policy` fails with nine findings on the configuration
without this change and with one finding when one preset entry is removed. The
test covers a missing folder entry, a missing preset entry, a missing, empty or
non-array list, and the folder named without its glob.

AI assistance wrote the change, the test and this record. The dry runs and
checks named above verified the result; the maintainer decided the rule.
