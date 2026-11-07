# 0123 — Adopt fleet-own releases at once and wait three days for outside updates

- **Status:** accepted
- **Date:** 2026-10-26
- **Decided by:** the coordination order recorded as
  `20w-renovate-own-release-age-20261026` (paraphrased: fleet-own releases are
  adopted at once; outside updates wait three days, matching the shared preset
  `github>plurano/horistes` `default.json`; `renovate.json` drops its top-level
  `minimumReleaseAge` of seven days; add one package rule with
  `minimumReleaseAge: null` for fleet-own packages while keeping outside forks
  at three days; supersede waiting time statements in earlier decisions).
- **Authority:** `renovate.json` waiting time only. No claim, principle,
  runtime, lock, contract or status changes.
- **Supersedes in part:** [0098](0098-move-the-renderer-lock-to-buildx-0-37-2.md)
  (alternatives line on the seven-day age) and
  [0115](0115-move-the-renderer-lock-to-buildx-0-38-1-and-let-the-update-bot-carry-it.md)
  (consequence line on seven days).
- **Related:** [0097](0097-keep-workflow-tool-versions-out-of-the-action-update-group.md)

## Context

The top-level `minimumReleaseAge` setting of seven days in `renovate.json` was
introduced in baseline commit `184fc2e5` (2026-08-28); no earlier decision
record set it. Two subsequent decision records cite this delay:

- `decisions/0098-move-the-renderer-lock-to-buildx-0-37-2.md:81-83`
  (alternatives considered: Buildx 0.38.0 was rejected because it was inside
  the bot's seven-day minimum release age).
- `decisions/0115-move-the-renderer-lock-to-buildx-0-38-1-and-let-the-update-bot-carry-it.md:79-80`
  (consequences: the seven-day release age combined with the Monday-morning
  schedule delay bot pull requests by up to two weeks after release).

The shared preset `github>plurano/horistes` (`default.json`) configures
`"minimumReleaseAge": "3 days"` and
`"vulnerabilityAlerts": { "minimumReleaseAge": null }`.
Because `renovate.json` declared top-level `"minimumReleaseAge": "7 days"` at line
43, it overrode the shared preset for all dependencies.

The fleet publishes from eight organisations (`golusoris`, `cordanaLLM`,
`plurano`, `goph-arr`, `VMAFx`, `jellysin`, `vidiko`, `tekmora`), the operator
account `lusoris`, and the npm scope `@sveltesentio` (`golusoris/sveltesentio`).
The project maintainers cut those releases themselves, so a waiting period
only delays adoption of their own fixes. The reader port of
[Decision 0121](0121-replace-react-with-sveltekit-via-sveltesentio.md) depends
on `@sveltesentio/core` 0.7.0, released 2026-10-25.

However, nine repositories hosted under fleet namespaces are forks of outside
upstream projects:

- `VMAFx/netflix-vmaf-contributions`
- `lusoris/llama-swap`
- `lusoris/controller-tools`
- `lusoris/hindsight`
- `lusoris/Vulkan-ValidationLayers`
- `lusoris/helm-charts`
- `lusoris/paperclip`
- `lusoris/model_server`
- `lusoris/paperclip-aperture`

These forks track upstream developments and must retain the outside three-day
minimum release age rather than receiving immediate adoption.

Renovate package names take four distinct shapes across ecosystems:

1. npm: scoped package names such as `@sveltesentio/core`.
2. Go modules: import paths such as `github.com/<org>/<repo>[/...]`.
3. GitHub Actions: action references such as `<org>/<repo>`.
4. Docker: container image names such as `ghcr.io/<org>/<image>`.

Renovate's `matchPackageNames` supports glob patterns, regular expressions
enclosed in slashes (`/.../`), and negation prefixed with `!` (Renovate
documentation: `https://docs.renovatebot.com/configuration-options/#matchpackagenames`
and `https://docs.renovatebot.com/string-pattern-matching/`).

## Decision

1. Delete top-level `"minimumReleaseAge": "7 days"` from `renovate.json`
   (formerly line 43). Outside updates now inherit the three-day minimum release
   age from the extended `github>plurano/horistes` preset.
2. Add one package rule to `renovate.json` immediately following the npm pin
   rule with `"minimumReleaseAge": null` for fleet-own packages.
3. The package rule covers the four package name shapes for all eight fleet
   organisations (`golusoris`, `cordanaLLM`, `plurano`, `goph-arr`, `VMAFx`,
   `jellysin`, `vidiko`, `tekmora`), the operator account (`lusoris`), and
   `@sveltesentio/**`:
   - npm: `@sveltesentio/**` only; no other fleet npm scope is published
   - GitHub Actions: `<org>/**`
   - Go modules: `github.com/<org>/**`
   - Docker container images: `ghcr.io/<org>/**`
4. The package rule negates the nine outside forks using regular expression
   patterns (`!/^(github\.com\/|ghcr\.io\/)?<org>\/<repo>(\/|$)/i`, case-insensitive
   because GitHub owner names are), ensuring
   they retain the three-day minimum release age from the preset:
   - `VMAFx/netflix-vmaf-contributions`
   - `lusoris/llama-swap`
   - `lusoris/controller-tools`
   - `lusoris/hindsight`
   - `lusoris/Vulkan-ValidationLayers`
   - `lusoris/helm-charts`
   - `lusoris/paperclip`
   - `lusoris/model_server`
   - `lusoris/paperclip-aperture`
5. Known limit: any new fork of an outside project created under a fleet
   namespace must be explicitly added to the package rule negation list.
6. Long-term home: the shared preset `plurano/horistes` is the planned location
   for this fleet-own package rule. Once `horistes` incorporates the rule, the
   local package rule in `renovate.json` will be removed.

## Consequences

- Fleet-own package updates (such as `@sveltesentio/*`, `cordanaLLM/*`, and Go
  module imports under fleet organisations) are proposed by Renovate without an
  artificial delay as soon as releases appear.
- Outside updates wait three days instead of seven days before Renovate
  proposes a pull request.
- The next Buildx bot pull request delay is now three days plus the Monday
  schedule (`before 6am on monday`), resulting in up to 10 days of delay instead
  of two weeks. This supersedes the waiting time statement in
  `decisions/0115-move-the-renderer-lock-to-buildx-0-38-1-and-let-the-update-bot-carry-it.md:79-80`.
- The alternatives considered statement in
  `decisions/0098-move-the-renderer-lock-to-buildx-0-37-2.md:81-83` regarding
  the seven-day release age is superseded in part.
- The nine outside forks retain the three-day release age.
- Any future fork added under a fleet organisation or the operator user
  account requires an entry in the negation list of the package rule in
  `renovate.json` until the rule transitions to `plurano/horistes`.

## Alternatives considered

- **Retain seven-day release age globally.** Delays the project's own
  releases by a week with no outside reviewer to wait for.
- **Set `minimumReleaseAge: null` globally without fleet scoping.** Would expose
  the repository immediately to newly published third-party zero-day
  vulnerabilities or broken point releases before upstream community discovery.
- **Wait for the rule to land in `plurano/horistes`.** Holds the
  `@sveltesentio/core` 0.7.0 adoption until that preset change is released.
- **Exclude forks via glob patterns alone.** Glob matching in minimatch treats
  slashes strictly (`*` does not cross `/`), requiring separate entries for
  bare, Go module, Docker image, and npm scoped package shapes, whereas regular
  expressions cleanly match all prefix and subpath permutations per fork.

## Verification and disclosure

Runs on 2026-10-26 with Renovate 44.179.1 on Node 24.21.0. Evidence files are
kept outside the repository.

| Check | Outcome |
| --- | --- |
| `renovate-config-validator --strict` in the repository root | exit 0; a planted unknown option and a numeric `minimumReleaseAge` each exit 1 |
| Rule patterns through Renovate's own `matchRegexOrGlobList` (21 package names: fleet packages, the nine forks in each shape, outside packages) | 0 mismatches; deleting the `llama-swap` negation gives 3 mismatches |
| `renovate --platform=local --dry-run=lookup` on a probe with `@sveltesentio/core` 0.6.0 and `renovate` 44.179.1, old configuration | both updates held (`pendingChecks` true) |
| Same probe, this configuration | `@sveltesentio/core` 0.7.0 proposed (`pendingChecks` false); `renovate` 44.182.1, released the same day, still held |
| `node --test scripts/engineering-policy.test.mjs`, `npm run check:prose` | pass |

The draft of this record and of the `renovate.json` rule came from the
Antigravity lane (Gemini 3.8 Flash); the maintainer session reviewed and
corrected both and ran the checks above.
