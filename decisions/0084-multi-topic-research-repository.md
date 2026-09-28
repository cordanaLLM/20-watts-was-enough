# 0084 - Host several research topics in one repository

- **Status:** accepted
- **Date:** 2026-09-28
- **Authority:** repository layout, topic registry and identifier policy for
  research topics added after the founding topic; accepted on the
  maintainer's answers of 2026-09-28, recorded under
  [Maintainer answers](#maintainer-answers). This record moves no file and
  changes no identifier, route, claim status, validator or release rule;
  migration steps 2 to 4 each land as their own change

## Context

The maintainer directed on 2026-09-18 that this repository becomes a general
research repository. "20 Watts Was Enough" stays one topic. Further topics and
smaller hypotheses follow later and share the reader (`app/`,
`github-pages/`), `scripts/`, `tooling/`, and the sources library (`sources/`,
`research/references.bib`). This record sets the layout and the migration
order; it does not apply either.

The record was drafted as a proposal on 2026-09-18. Before it reached `main`
it was amended with the maintainer's answers of 2026-09-28, which settle the
six questions the draft left open and reverse its proposal to number
candidates and fixtures per topic. Because the proposal had not been merged,
the amendment edits it in place; records on `main` stay append-only.

The repository name stays. [Decision 0083](0083-transfer-the-repository-to-cordanallm.md)
keeps `20-watts-was-enough` because it is the book title, the framing of
[C-001](../research/claims.md#c-001) and the identifier every published
citation uses. That constraint carries into this record: the founding topic
keeps the identifiers it has already published.

### Where the single topic is assumed today

The draft's locators were read at commit `c6cf6e8` and re-read at `0c66cb0`
for the amendment; rows and locators the amendment added were read at
`0c66cb0`. They will drift. They show where a second topic currently has no
place, not a complete inventory.

| Surface | Evidence at `0c66cb0` | Effect on a second topic |
| --- | --- | --- |
| Repository identity | `package.json:2` name; `CITATION.cff:3` title and `:10` repository URL; `tooling/go.mod:1` module path; `tooling/cmd/20w/main.go` command name; `.standards.yaml:4` | Names the repository, not a topic. Decision 0083 fixes these; a second topic does not touch them. |
| Authority paths | `concept/`, `math/`, `research/claims.md`, `research/principle-registry.md`, `research/audits/`, `experiments/candidates/`, `experiments/fixtures/` are literal in [`scripts/book-source.mjs`](../scripts/book-source.mjs) lines 202 to 211, [`scripts/lib/portal-documents.mjs`](../scripts/lib/portal-documents.mjs) lines 84 and 101 to 103, [`app/book-content.ts`](../app/book-content.ts) lines 3 to 11 (a Vite glob, which requires literal patterns), `docscheck/check.go` lines 325, 351, 398 and 429, `scripts/audit-test-coverage.mjs` lines 125, 126 and 181, [`scripts/audit-prose-style.mjs`](../scripts/audit-prose-style.mjs) lines 8 to 15, and the further consumers listed in migration step 3 | A second topic's chapters, ledger and contracts are invisible to the book, portal, coverage audit and prose tripwire unless every consumer learns a second root. |
| Claim identifiers | `check.go:30` to `:33` define `C-` followed by three or four digits; `check.go:325` reads definitions only from `research/claims.md`; `check.go:339` enforces ascending numeric order within that file; `experiments/workstation/manifest.schema.json:236` repeats the pattern; `scripts/lib/workstation-manifests.mjs:423` reads the ledger path; `scripts/lib/research-object-evidence.mjs:179` accepts an anchor of any digit count. The ledger holds 1,571 definitions, the highest numbered 1580. Anchors of the form `research/claims.md#c-NNN` occur 2,607 times in 127 Markdown files besides this record, including `README.md` and decision 0083 | The file path is part of the citation locator. Moving the ledger strands every anchor; GitHub does not redirect a moved file. |
| Principle identifiers | `check.go:34` defines `P-` followed by three digits, read only from `research/principle-registry.md` (`check.go:351`); `scripts/lib/portal-metrics.mjs:7` and `:11` repeat the pattern and the path; 13 bundles, [P-001](../research/principle-registry.md) to P-013 | The registry is already cross-domain. It must also become cross-topic without splitting. |
| Candidate and fixture identifiers | `(candidate\|fixture)-NNN` in `manifest.schema.json:25`, [`tooling/internal/experiment/catalog.go`](../tooling/internal/experiment/catalog.go) line 26 and the release-step pattern at `scripts/validate-engineering-policy.mjs:2569`; image names `ghcr.io/cordanallm/20-watts-was-enough-(candidate\|fixture)-NNN` at `catalog.go:27` and `manifest.schema.json:48`; 20 candidate and 29 fixture contracts; 11 workstation manifests | A second topic that restarted at `fixture-001` would collide with the founding topic's contracts, manifests, CI lanes and images. |
| Book source set | One book, named at `book-source.mjs:8`; `app/lib/publication.mjs:10` and `:11` bind `book/` and the PDF path; description at `publication.mjs:14`; `scripts/lib/pages-seo.mjs:63`, `:111` and `:424`; `github-pages/index.html:7` and `:9`; `github-pages/book/index.html:9`. The root `README.md` is the book's first document (`portal-documents.mjs:101`, `book-content.ts:5`, `scripts/generate-book-pdf.mjs:81`) and a digest input (`book-source.mjs:92`) | The book generator and the portal shell have one title, one description and one PDF. Repository-level text in `README.md` changes the founding book. |
| Site identity | `publication.mjs:4` sets one `siteName`; `pages-seo.mjs:67` appends it to every document title; [`scripts/validate-github-pages-build.mjs`](../scripts/validate-github-pages-build.mjs) line 182 requires every route's title to equal `<document title> — 20 Watts Was Enough`; the same literal heads the static root at `pages-seo.mjs:387`, the portal at `app/components/public-research-portal.tsx:843` and `:1103`, and the book at `app/components/book-edition.tsx:257` | A second topic's pages would carry the founding topic's title, and the build validator would reject any other. |
| Reader routes | A document's route is its repository path without `.md` plus `/` (`portal-documents.mjs:52` to `:54`), so a chapter publishes at `https://www.cordana.dev/concept/00-thesis-and-principles/`; the sitemap is `canonicalSite` plus route (`pages-seo.mjs:555` to `:559`); translations mirror the canonical path under `/<lang>/` ([`translations/README.md`](../translations/README.md)); the only redirects are client-side rewrites of `?doc=` and `#book-` in [`github-pages/main.tsx`](../github-pages/main.tsx) lines 18 to 33; `validate-github-pages-build.mjs` line 48 rejects any `/20-watts-was-enough/{assets,book,documents,downloads,plots,repository-files}` reference as a legacy subpath deployment, and lines 326 to 352 require the built portal documents and research-object records to equal the `concept/` and `math/` corpus exactly | Repository paths are public URLs. Any move of the founding chapters changes URLs that the v0.3.0 PDF and external citations already carry, a topic prefix equal to the repository name would fail the build validator, and a new topic's documents would fail the corpus equality. |
| Translations | The reader route pattern at `scripts/lib/translation-pages.mjs:17` and the Go source pattern at `tooling/internal/translationbundle/bundle.go:35` admit only `concept/` and `math/`; `translationbundle/files.go:81` and `:172` enforce the Go pattern, and the flag help at `tooling/cmd/20w/translation.go:15`, `:47` and `:83` describes it; `translations/manifest.json` lists no published document | Both patterns reject `topics/<slug>/...`. With no published translation, widening them moves no reader route. |
| CI impact map | Rule `research` in [`.github/ci-impact.json`](../.github/ci-impact.json) (line 312) maps `concept/**`, `math/**`, `research/**` and the experiment contracts to the `research` and `site` lanes; each executable artifact has its own `workstation-<artifact>` lane, listed in `tooling/internal/ciplan/workstation-catalogue.json` and run by the `workstation-artifacts` matrix job at `.github/workflows/ci.yml:412`; the other lanes are closed in `tooling/internal/ciplan/workstation_catalogue.go:111` and `:112`; `ci.yml` runs one job per such lane (`lane-research` at line 325, `lane-site` at line 357) | Paths under a new topic root match no rule, so `20w ci plan` selects the full lane by the rule in [decision 0080](0080-impact-scope-local-validation.md). Safe, but every topic change would run everything. |
| Chapter contract | `check.go:65` to `:74` require eight sections, including `## Biological observation`, in every numbered `concept/` chapter; [`concept/README.md`](../concept/README.md) states the same shape; `check.go:76` to `:82` list five phrases inherited from the founding topic's imported material, which `validateUnsupportedPhrases` (`check.go:478`) rejects in all Markdown outside imported sources | The required sections describe the founding topic's argument. A topic without a biological observation cannot satisfy them, and a generic validator carries one topic's phrase list. |
| GitHub metadata | `.github/labels.json` holds 35 labels with an `area:` dimension and no topic dimension; `.github/labeler.yml` maps founding root paths to `area:` labels; `.github/milestones.json` binds six milestones, `M0` to `M5`, to `concept/90-research-roadmap.md#stage-N`, which `tooling/internal/githubmilestones/manifest.go:26` requires and `:97` reports; `manifest.go:25` limits identifiers to `M0` to `M15` | Issues and pull requests cannot be filtered by topic, and a second topic has no roadmap a milestone can bind. |
| Sources allowlist | `PINNED_SOURCE_FILES` at `scripts/lib/source-boundary.mjs:13` pins the 17 files of `sources/` by byte count and SHA-256 in code; no rule in `.github/ci-impact.json` names that script | A provenance record added for any topic edits a script, and that change falls to the full lane. |
| Release and citation | `package.json:3` and `CITATION.cff:12` carry one version, 0.3.0; `CITATION.cff:3` titles the repository; `.github/workflows/release.yml:1384` and `:1399` title every release `20 Watts Was Enough <tag>`; release v0.3.0 carries one book PDF | One tag names one version and one title for the whole repository. Nothing yet says what a tag covers once a second topic exists. |
| Navigation prose | The repository map in [`AGENTS.md`](../AGENTS.md) and [`docs/repository-map.md`](../docs/repository-map.md) list the founding chapters at root paths | Both must present topics once a second one exists. |

A case-sensitive search at `c6cf6e8` for `20-watts`, `20w`, `20 Watts` or
`20 watts` over tracked source, configuration and Markdown (excluding
`node_modules`, build output, worktrees and evidence directories) matched 195
files under `tooling/`, 73 under `experiments/`, 33 under `decisions/`, 32
under `scripts/` and 12 under `.github/`, with fewer elsewhere. Most
`tooling/` matches are the Go module import path, which decision 0083 treats
as repository identity. The count shows how far the name reaches; it does not
by itself say what must change.

## Decision

Add a topic registry and place every topic added after this record under
`topics/<slug>/`. The founding topic stays at its current paths and is the
registry's first entry with root `.`. Generators and validators read the
registry; no consumer keeps a literal `concept/` or `research/claims.md`.

### Options considered

**(a) `topics/<slug>/{concept,research,math,experiments}` for every topic**,
with shared `sources/`, `app/`, `scripts/` and `tooling/`. Symmetric and
simplest to explain. Moving the founding topic into it rewrites 4,397
relative links in `research/claims.md` alone (295 into `concept/`, 2,679 into
`experiments/`, 126 into `math/`, 1,297 into `audits/`), every public route
under `cordana.dev/concept/` and `cordana.dev/math/`, and every
`research/claims.md#c-NNN` locator. GitHub does not redirect moved files, so
external citations and the released v0.3.0 PDF would point at nothing. A
single commit of that size cannot be reviewed under hard rule 2.

**(b) A topic dimension inside each top-level directory**, such as
`concept/20w/` and `research/20w/claims.md`. Same move cost as (a) for the
founding topic, and a new topic is spread across four directories, so its
scope, nested `AGENTS.md`, impact rule and book membership must each be
stated four times.

**(c) One topic per repository plus a shared library repository.** No moves,
but the reader, scripts and Go tooling become a versioned dependency that
every topic repository must consume and update; the byte-exact `sources/`
allowlist and `references.bib` either split or duplicate; and one
`cordana.dev` would need path routing across several Pages sites, which is
remote state under hard rule 12 and beyond what
[decision 0047](0047-keep-cloudflare-as-the-public-pages-tls-authority.md)
established. It also contradicts the direction that topics share one backend
and one sources library.

**(d) Chosen: (a) for new topics, with the founding topic pinned in place.**
The maintainer chose this option. The published paths of the founding topic
are identifiers, so they stay. No second topic has content yet, so the
registry-driven code can be proven on the founding topic with byte-identical
output before any new directory exists. The asymmetry lives in one data file
rather than in code. Moving the founding topic later remains possible as its
own decision if a redirect mechanism for GitHub file URLs ever exists; none
does today.

### Topic registry

`topics.json` at the repository root, parsed with the strict reader in
`scripts/lib/strict-json.mjs` and bounded to at most 32 entries. Each entry
names:

- `slug`: lowercase letters, digits and hyphens, 2 to 44 characters, not an
  EU language code exposed by the reader (the `/<lang>/` route namespace) and
  not the repository name (the legacy-subpath check). The 44-character bound
  keeps the label `topic:<slug>` within the 50-character label name limit at
  `tooling/internal/githublabels/labels.go:34`. The founding entry's slug is
  `20w`, matching the command and the wordmark.
- `title`: the topic's display name and the title suffix of its pages. The
  founding title is `20 Watts Was Enough`.
- `root`: `.` for the founding topic, `topics/<slug>` otherwise.
- `authorities`: the relative paths of chapters, mathematics, claim ledger,
  candidate and fixture contracts and workstation manifests. Absent
  authorities are declared absent, not assumed. Audits are not a per-topic
  authority (see [Topic-neutral surfaces](#topic-neutral-surfaces)).
- `chapterSections`: the required H2 headings for that topic's chapters. The
  founding entry lists the eight current sections verbatim.
- `unsupportedPhrases`: phrases `docscheck` rejects in the topic's canonical
  Markdown. The founding entry takes over the five at `check.go:76` to `:82`
  and, with root `.`, keeps their repository-wide scope.
- `book`: `null`, or the PDF name, route and front-matter file. The founding
  entry keeps `20-watts-was-enough-full-concept-book.pdf`, `book/` and the
  root `README.md`.
- `routePrefix`: empty for the founding topic, `topics/<slug>/` otherwise.
- `status`: `active` or `archived`.

A smaller hypothesis is a topic entry with `book: null` whose only authority
is a claim ledger; there is no separate unit type. It gains chapters,
contracts or a book by editing its entry.

The registry belongs to the `global` impact rule because every generator
reads it. A new `validate:topics` command checks the schema, uniqueness,
path existence and the slug exclusions above.

### Identifiers

Claim identifiers keep one integer namespace across topics. Each topic has its
own ledger at `<root>/research/claims.md`, and a new claim in any ledger takes
the next unused integer across all ledgers (1581 at `0c66cb0`).
`docscheck` unions definitions from every registered ledger, rejects a number
defined twice anywhere, keeps the per-file ascending order of `check.go:339`,
and resolves a `claims.md#c-NNN` anchor against the ledger that defines it.
Existing identifiers, anchors, the three-or-four-digit pattern and the
workstation schema do not change, which satisfies hard rule 4 and
[principles 3.2](../docs/principles.md). Topic-prefixed identifiers were
rejected: they change every pattern and schema, and they let two topics
record one mechanism under two identifiers, which is the duplication the
principle registry exists to prevent.

The pattern admits numbers up to 9999, which leaves 8,419 for all topics
together. Widening it is a separate change: `check.go:30` to `:33` and
`manifest.schema.json:236` fix the width, while
`research-object-evidence.mjs:179` already accepts any digit count.

`research/principle-registry.md` stays the only registry and gains topic as an
evidence branch, not as a split. Deduplication by causal invariant
([principles 3.4](../docs/principles.md)) is already indifferent to the
domain a mechanism came from; it is equally indifferent to the topic that
recorded it. A topic-local principle registry is not permitted.

Candidate and fixture numbers are global across topics, like claims. A new
contract in any topic takes the next unused number of its kind, 021 for a
candidate and 030 for a fixture at `0c66cb0`, and no qualified
`<slug>/fixture-NNN` form exists. The artifact patterns at `catalog.go:26`,
`manifest.schema.json:25` and `validate-engineering-policy.mjs:2569`, the
contract file names and the `workstation-<artifact>` CI lanes therefore stay
as they are. The workstation manifest schema gains a `topic` field holding a
registered slug. It is the only place an artifact records its topic, and the
eleven founding manifests gain `"topic": "20w"` in the change that adds the
field, so no manifest relies on a default. Three digits admit 999 artifacts
of each kind across all topics. A fixture that a second topic wants to reuse
is linked, not renumbered.

Image names keep their form. `catalog.go:27` and `manifest.schema.json:48`
require `ghcr.io/cordanallm/20-watts-was-enough-<artifact>`, and the
workflows derive that prefix from the repository through `IMAGE_REPOSITORY`
(`.github/workflows/ci.yml:476` and `release.yml:211`), as decision 0083 set.
The repository name in an image is repository identity, not a topic label: a
second topic's `fixture-030` would build as
`ghcr.io/cordanallm/20-watts-was-enough-fixture-030`. Founding images keep
their identity, as decision 0083 requires.
[Decision 0040](0040-bind-publications-to-reproducible-and-public-artifacts.md)
item 8 authorises public visibility for three documented release packages
only, so making a new topic's image a public release package needs its own
authorisation.

`decisions/` stays one append-only tree with continuous numbering. `docs/adr/`
holds only the template that Praetor scaffolded under
[decision 0082](0082-adopt-praetor-repository-governance.md) and must not
become a second decision tree ([principles 6.1](../docs/principles.md)).

### Book and reader

Book membership is read per topic from the registry. `book-source.mjs` keeps
its shared support inventory (`bookSupportSourcePaths` and
`scripts/book-support-sources.json`) and takes the content set from the
topic entry, so the founding book keeps its name, route and digest inputs. A
new topic publishes at `topics/<slug>/book/` and
`downloads/<slug>-book.pdf` once its `book` entry is not `null`, and
`validate:book-pdf` runs per published book.

The root `README.md` stays the founding book's front matter. Text there that
introduces the repository as a whole changes the book's digest and
re-renders its PDF, as the `README.md` edit under decision 0083 did. A
repository landing text outside the book belongs to the cross-topic landing
record below.

Routes of the founding topic do not change. A new topic's documents publish
at `/topics/<slug>/<path within the topic root>/`, its translations at
`/<lang>/topics/<slug>/...`, and the sitemap lists every topic. The `topics/`
prefix keeps new routes out of the two-letter language namespace and away
from the legacy-subpath check. `/` stays the founding topic's portal, a
`/topics/` index lists active topics, and a cross-topic landing at `/` needs
its own record. Until that record, `publication.siteName` keeps naming `/`
and the founding topic; a second topic's pages take their title suffix from
their registry `title`, and the title rule at
`validate-github-pages-build.mjs:182` reads it from the same place.
Research-object records and evidence JSON keep their per-document form.

### CI impact map

Topics enter the map as rules, not as new lane kinds. A rule
`topic-<slug>` maps `topics/<slug>/**` to the existing `research` and `site`
lanes. Each executable artifact of a new topic gets a `workstation-<artifact>`
lane in `workstation-catalogue.json`, run by the `workstation-artifacts`
matrix job as each founding artifact is today; global numbering keeps those
lane names unique without a topic prefix. The founding rules do not change.
Until a topic has a rule, its paths select the full lane by the existing
fallback, which is the safe direction.

### Topic-neutral surfaces

These stay shared and unprefixed: `decisions/`; `sources/` and its byte-exact
allowlist (one provenance library, entries cited by any topic);
`research/references.bib` (one bibliography, key uniqueness at
`check.go:439`); `research/audits/`; `research/research-integrity-baseline.md`;
`research/disclosures/`; `research/normative-baseline.md`; `LICENSING.md`
and `LICENSES/`; `CITATION.cff` at repository level; `docs/principles.md`;
the root `AGENTS.md`; `app/`, `github-pages/`, `scripts/`, `tooling/` and the
`translations/` machinery; and the label, labeler and milestone manifests
under `.github/`.

`research/audits/` is one audit library. An audit written for any topic lands
there and any topic may cite it. The founding book digests the whole
directory (`book-source.mjs:209`), so until audit membership is read from the
registry, an audit added for another topic re-renders the founding book.

The sources allowlist becomes data before a second topic adds a source.
Moving the byte counts and digests of `PINNED_SOURCE_FILES` into a manifest
under `sources/` keeps the byte-exact check and lets a provenance record for
any topic be added without editing a script.

A registry linking principles to engineering implementations would also be a
topic-neutral surface; where it lives is decided in its own record.

## Migration plan

Each phase leaves `main` publishable: the Pages build for `cordana.dev`
passes `validate:site-build`, the book regenerates when its digest changes,
and no route is removed. Because no route moves in steps 1 to 4, no redirect
is needed; a later move of the founding topic would need static redirect
documents and a relaxation of the route-set equality in
[decision 0030](0030-publish-each-research-document-at-a-canonical-route.md),
and that belongs to its own record.

1. **This record.** No validator or generator changes. `decisions/`,
   `CHANGELOG.md` and `decisions/README.md` are outside the book source set,
   so the book digest is unchanged.
2. **Registry and validator.** Add `topics.json` with the founding entry,
   `scripts/validate-topics.mjs`, the `validate:topics` command, a `global`
   impact-rule entry and policy-test coverage. No consumer reads the registry
   yet, so Pages and book output are unchanged.
3. **Registry-driven consumers with one entry.** Every consumer that names a
   founding path, title or pattern reads the registry instead. The step may
   land as one change per group below, each with the same acceptance.
   - Documentation: `docscheck` (ledger union, per-topic chapter root,
     sections and phrases, bibliography).
   - Book and reader: `book-source.mjs`; `generate-book-pdf.mjs` (members at
     lines 80 to 85, manifest title at line 333); `portal-documents.mjs`; the
     `book-content.ts` glob, moved into the virtual module that
     `vite.pages.config.ts` already generates; the development-server source
     roots at `vite.pages.config.ts` lines 133 to 139; `publication.mjs`
     (lines 4, 10, 11 and 14); `public-research-portal.tsx` (lines 39, 653,
     656, 800 to 814, 843 and 1103); `book-edition.tsx` (lines 143, 199 to
     209 and 257); `app/lib/research-object.mjs` (lines 106 to 108 and 231);
     `pages-seo.mjs`; `research-object-evidence.mjs`; and `portal-metrics.mjs`
     (lines 7 and 11).
   - Build validation: `validate-github-pages-build.mjs`, whose title rule at
     line 182 and corpus equality at lines 326 to 352 must read the registry
     before step 4 publishes a route. Its legacy-subpath check at line 48
     stays.
   - Audits and inventories: `audit-test-coverage.mjs`,
     `audit-prose-style.mjs`, `generate-field-coverage.mjs`,
     `generate-taxonomy-depth.mjs` (lines 5 to 8),
     `validate-science-taxonomies.mjs` (lines 7 to 10) and
     `workstation-manifests.mjs` (line 423).
   - Translations: `translation-pages.mjs:17` and `translationbundle/bundle.go:35`,
     with the messages at `files.go:81` and `:172` and the flag help in
     `tooling/cmd/20w/translation.go`.
   - Identifiers and metadata: the manifest schema's `topic` field with the
     eleven founding manifests, and `githubmilestones/manifest.go` (roadmap
     pattern at line 26, message at line 97).
   - Sources: the allowlist moves from `source-boundary.mjs:13` into a data
     manifest.

   Tests that pin these paths change with the code they test. Global
   numbering leaves `catalog.go`, the artifact and image patterns and the 62
   lines of `validate-engineering-policy.mjs` that name `fixture-007` or
   `fixture-019` unchanged. Acceptance: `dist-github-pages/` is identical
   apart from revision stamps. `book-source.mjs`, `generate-book-pdf.mjs`,
   `vite.pages.config.ts`, `docscheck/check.go`, the translation bundle and
   most `app/` consumers above are themselves book support sources
   (`book-source.mjs` lines 85 to 197), so the book is re-rendered and
   `validate:book-pdf` runs.
4. **Second topic scaffold.** Create `topics/<slug>/` with a `README.md`, a
   nested `AGENTS.md` and the authorities its entry declares, such as
   `research/claims.md`, `concept/`, `math/` and
   `experiments/{candidates,fixtures}`; add the registry entry, the
   `topic-<slug>` impact rule, and a `topic:<slug>` label with a labeler glob
   over `topics/<slug>/**`; publish `/topics/<slug>/` routes and the
   `/topics/` index. A smaller hypothesis scaffolds only its ledger.
   `docscheck` currently rejects a ledger with no definition (`check.go:344`
   and `:345`); either the scaffold carries its first claim or that check
   becomes per-registry rather than per-file.
5. **Later, separately.** Moving the founding topic under `topics/`, a
   cross-topic landing at `/`, the release and citation scope once a second
   topic exists, topic-scoped milestones, widening the `C-` pattern, and a
   principle-to-engineering registry each need their own record or change.

### Not in this record

- No renaming or renumbering of claim, principle, audit, candidate or fixture
  identifiers.
- No widening of the `C-` pattern beyond four digits.
- No move of `research/claims.md`, `research/principle-registry.md`,
  `concept/`, `math/`, `research/audits/` or `experiments/`.
- No repository rename, Go module path change, `20w` command rename or
  container image identity change (decision 0083).
- No route change and no redirect.
- No change to release semantics, containers or reviewed translations. Before
  the first release after a second topic exists, a record must say whether a
  tag covers the repository with every published book or whether topics get
  their own tags.
- No milestone scheme for a second topic. The identifiers `M0` to `M15` and
  their roadmap binding stay with the founding topic.
- No content, claim or chapter for a second topic.
- No cross-topic landing page and no repository-level site name.
- No principle-to-engineering registry.

The name stays on the maintainer's answer, but the redirect facts differ from
the reason decision 0083 gives ("a name change would strand published
references"). After a rename GitHub redirects the repository's web pages,
issues, and `git clone`, `fetch` and `push`. It does not redirect GitHub
Pages project-site URLs or workflow references to actions hosted in the
renamed repository, and a new repository created under the old name breaks
the redirects
([GitHub documentation](https://docs.github.com/en/repositories/creating-and-managing-repositories/renaming-a-repository),
read 2026-09-28). The public site is served from the custom-domain root
([decision 0029](0029-bind-pages-to-the-custom-domain-root.md)), not a
project-site URL. A rename's cost lies elsewhere: the Go module path at
`tooling/go.mod:1`, imported by 136 Go files; image names, which
`catalog.go:27` and `manifest.schema.json:48` pin and the workflows derive
from the repository; the legacy-subpath check at
`validate-github-pages-build.mjs:48`; and `CITATION.cff:10`. No DOI has been
minted; [`docs/public-research-interface-audit.md`](../docs/public-research-interface-audit.md)
line 195 ties a Zenodo deposit to an approved release and identity check.

## Verification and limitations

Nothing about the layout has been executed: no file moved, no validator or
generator changed, no registry written. Locators, counts and line numbers
come from reading the tree with `grep`, `find` and `git grep`, at `c6cf6e8`
for the draft and at `0c66cb0` for the amendment. The amendment re-read every
draft locator and corrected two statements: the claim patterns sit at
`check.go:30` to `:33`, and workstation artifacts run in one matrix job
rather than one job each. The v0.3.0 release title and asset list come from
`gh release view`, read on 2026-09-28.

For this record, `check:prose`, `validate:docs` and
`node scripts/validate-math.mjs` are the selected checks under decision 0080,
and the book source digest was compared before and after the edit to confirm
the record lies outside the book set. The full `npm run check` gate was not
run for a documentation-only record.

Claude (Fable 5.1) drafted this record as a proposal on 2026-09-18 from a read
of the repository and the maintainer's direction. Claude (Opus 5.5) amended
it on 2026-09-28 from the maintainer's answers and an agent survey of the
tree at `c6cf6e8`, re-reading every added locator at `0c66cb0`. The
maintainer's answers, not either draft, decide the points below. No claim
status, experiment admission or scientific statement changes with this
record.

## Maintainer answers

The maintainer, lusoris, answered the draft's open questions on 2026-09-28,
relayed through the agent session that amended this record. These answers are
the basis for acceptance.

1. **Layout:** option (d). The founding topic stays pinned at root `.`; new
   topics go under `topics/<slug>/`.
2. **Founding slug:** `20w`.
3. **Candidate and fixture numbering:** global across topics, one sequence
   per kind as for `C-` claims. A new fixture takes the next unused number in
   any topic, and there are no `<slug>/fixture-NNN` identifiers. This
   reverses the draft's per-topic proposal.
4. **Portal:** `/` stays the founding topic's portal. A `/topics/` index lists
   topics, and a cross-topic landing needs its own record.
5. **Smaller hypotheses:** topic entries with `book: null` and claims-only
   authorities, not a new unit type.
6. **Audits:** `research/audits/` is a shared audit library, a topic-neutral
   surface like `sources/` and `research/references.bib`.

The maintainer also deferred widening the `C-` pattern beyond four digits to
its own change and kept the repository name; this record renames nothing.
