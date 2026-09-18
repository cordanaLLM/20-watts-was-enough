# 0084 - Host several research topics in one repository

- **Status:** proposed
- **Date:** 2026-09-18
- **Authority:** proposal for maintainer review; no file moves, no change to
  any identifier, route, claim status, validator or release rule until the
  maintainer accepts this record

## Context

The maintainer directed on 2026-09-18 that this repository becomes a general
research repository. "20 Watts Was Enough" stays one topic. Further topics and
smaller hypotheses follow later and share the reader (`app/`,
`github-pages/`), `scripts/`, `tooling/`, and the sources library (`sources/`,
`research/references.bib`). Nothing has been designed yet, so this record
proposes a layout and a migration order; it does not apply either.

Every earlier record is `accepted`. This one is `proposed` because it awaits
maintainer review. No validator reads a decision record's status line:
[`scripts/audit-test-coverage.mjs`](../scripts/audit-test-coverage.mjs) parses
`- **Status:**` at line 192 only inside claim blocks of `research/claims.md`;
[`tooling/internal/docscheck/check.go`](../tooling/internal/docscheck/check.go)
contains no status check (its two `Status` matches, `check.go:247` and
`mermaid.go:196`, are the goldmark `ast.WalkStatus` type); and the status
column of [`decisions/README.md`](README.md) is free text that already holds
values such as "partly superseded by". The status therefore needs no validator
change. If the maintainer accepts the record, the status line changes to
`accepted` in a follow-up commit rather than by rewriting the proposal.

The repository name stays. [Decision 0083](0083-transfer-the-repository-to-cordanallm.md)
keeps `20-watts-was-enough` because it is the book title, the framing of
[C-001](../research/claims.md#c-001) and the identifier every published
citation uses. That constraint carries into this record: the founding topic
keeps the identifiers it has already published.

### Where the single topic is assumed today

The locators below were read at commit `c6cf6e8` and will drift; they show
where a second topic currently has no place, not a complete inventory.

| Surface | Evidence at `c6cf6e8` | Effect on a second topic |
| --- | --- | --- |
| Repository identity | `package.json:2` name; `CITATION.cff:3` title and `:10` repository URL; `tooling/go.mod:1` module path; `tooling/cmd/20w/main.go` command name; `.standards.yaml:4` | Names the repository, not a topic. Decision 0083 fixes these; a second topic does not touch them. |
| Authority paths | `concept/`, `math/`, `research/claims.md`, `research/principle-registry.md`, `research/audits/`, `experiments/candidates/`, `experiments/fixtures/` are literal in [`scripts/book-source.mjs`](../scripts/book-source.mjs) lines 202 to 211, [`scripts/lib/portal-documents.mjs`](../scripts/lib/portal-documents.mjs) lines 84 and 101 to 103, [`app/book-content.ts`](../app/book-content.ts) lines 3 to 11 (a Vite glob, which requires literal patterns), `docscheck/check.go` lines 325, 351, 398 and 429, `scripts/audit-test-coverage.mjs` lines 125, 126 and 181, and [`scripts/audit-prose-style.mjs`](../scripts/audit-prose-style.mjs) lines 8 to 15 | A second topic's chapters, ledger and contracts are invisible to the book, portal, coverage audit and prose tripwire unless every consumer learns a second root. |
| Claim identifiers | `check.go:31` to `:34` define `C-` followed by three or four digits; `check.go:325` reads definitions only from `research/claims.md`; `check.go:339` enforces ascending numeric order within that file; `experiments/workstation/manifest.schema.json:236` repeats the pattern. The ledger holds 1,571 definitions, the highest numbered 1580. Anchors of the form `research/claims.md#c-NNN` appear in 128 Markdown files, including `README.md` and decision 0083 | The file path is part of the citation locator. Moving the ledger strands every anchor; GitHub does not redirect a moved file. |
| Principle identifiers | `check.go:35` defines `P-` followed by three digits, read only from `research/principle-registry.md` (`check.go:351`); 13 bundles, [P-001](../research/principle-registry.md) to P-013 | The registry is already cross-domain. It must also become cross-topic without splitting. |
| Candidate and fixture identifiers | `(candidate\|fixture)-NNN` in `manifest.schema.json:25` and [`tooling/internal/experiment/catalog.go`](../tooling/internal/experiment/catalog.go) line 26; image names `ghcr.io/cordanallm/20-watts-was-enough-(candidate\|fixture)-NNN` at `catalog.go:27` and `manifest.schema.json:48`; 20 candidate and 29 fixture contracts; 11 workstation manifests | A second topic's `fixture-007` would collide with the founding topic's, and its images cannot carry the repository name as topic. |
| Book source set | One book, named at `book-source.mjs:8`; `app/lib/publication.mjs:10` and `:11` bind `book/` and the PDF path; site name and description at `publication.mjs:4` and `:14`; `scripts/lib/pages-seo.mjs:63`, `:111` and `:424`; `github-pages/index.html:7` and `:9`; `github-pages/book/index.html:9` | The book generator and the portal shell have one title, one description and one PDF. |
| Reader routes | A document's route is its repository path without `.md` plus `/` (`portal-documents.mjs:52` to `:54`), so a chapter publishes at `https://www.cordana.dev/concept/00-thesis-and-principles/`; the sitemap is `canonicalSite` plus route (`pages-seo.mjs:555` to `:559`); translations mirror the canonical path under `/<lang>/` ([`translations/README.md`](../translations/README.md)); the only redirects are client-side rewrites of `?doc=` and `#book-` in [`github-pages/main.tsx`](../github-pages/main.tsx) lines 18 to 33; [`scripts/validate-github-pages-build.mjs`](../scripts/validate-github-pages-build.mjs) line 48 rejects any `/20-watts-was-enough/{assets,book,documents,downloads,plots,repository-files}` reference as a legacy subpath deployment | Repository paths are public URLs. Any move of the founding chapters changes URLs that the v0.3.0 PDF and external citations already carry, and a topic prefix equal to the repository name would fail the build validator. |
| CI impact map | Rule `research` in [`.github/ci-impact.json`](../.github/ci-impact.json) (line 312) maps `concept/**`, `math/**`, `research/**` and the experiment contracts to the `research` and `site` lanes; each executable artifact has its own `workstation-<artifact>` lane; the lane set is closed in `tooling/internal/ciplan/workstation_catalogue.go:111` and `:112`; `.github/workflows/ci.yml` runs one job per lane (`lane-research` at line 325, `lane-site` at line 357) | Paths under a new topic root match no rule, so `20w ci plan` selects the full lane by the rule in [decision 0080](0080-impact-scope-local-validation.md). Safe, but every topic change would run everything. |
| Chapter contract | `check.go:65` to `:74` require eight sections, including `## Biological observation`, in every numbered `concept/` chapter; [`concept/README.md`](../concept/README.md) states the same shape | The required sections describe the founding topic's argument. A topic without a biological observation cannot satisfy them. |
| Navigation prose | The repository map in [`AGENTS.md`](../AGENTS.md) and [`docs/repository-map.md`](../docs/repository-map.md) list the founding chapters at root paths | Both must present topics once a second one exists. |

A case-sensitive search for `20-watts`, `20w`, `20 Watts` or `20 watts` over
tracked source, configuration and Markdown (excluding `node_modules`, build
output, worktrees and evidence directories) matched 195 files under `tooling/`,
73 under `experiments/`, 33 under `decisions/`, 32 under `scripts/` and 12
under `.github/`, with fewer elsewhere. Most `tooling/` matches are the Go
module import path, which decision 0083 treats as repository identity. The
count shows how far the name reaches; it does not by itself say what must
change.

## Decision (proposed)

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
The published paths of the founding topic are identifiers, so they stay. No
second topic has content yet, so the registry-driven code can be proven on
the founding topic with byte-identical output before any new directory
exists. The asymmetry lives in one data file rather than in code. Moving the
founding topic later remains possible as its own decision if a redirect
mechanism for GitHub file URLs ever exists; none does today.

### Topic registry

`topics.json` at the repository root, parsed with the strict reader in
`scripts/lib/strict-json.mjs` and bounded to at most 32 entries. Each entry
names:

- `slug`: lowercase, digits and hyphens, 2 to 48 characters, not an EU
  language code exposed by the reader (the `/<lang>/` route namespace) and
  not the repository name (the legacy-subpath check). The founding entry's
  slug is a maintainer decision; `20w` matches the command and the wordmark.
- `root`: `.` for the founding topic, `topics/<slug>` otherwise.
- `authorities`: the relative paths of chapters, mathematics, claim ledger,
  audits, candidate and fixture contracts and workstation manifests. Absent
  authorities are declared absent, not assumed.
- `chapterSections`: the required H2 headings for that topic's chapters. The
  founding entry lists the eight current sections verbatim.
- `book`: `null`, or the PDF name and route. The founding entry keeps
  `20-watts-was-enough-full-concept-book.pdf` and `book/`.
- `routePrefix`: empty for the founding topic, `topics/<slug>/` otherwise.
- `status`: `active` or `archived`.

The registry belongs to the `global` impact rule because every generator
reads it. A new `validate:topics` command checks the schema, uniqueness,
path existence and the slug exclusions above.

### Identifiers

Claim identifiers keep one integer namespace across topics. Each topic has its
own ledger at `<root>/research/claims.md`, and a new claim in any ledger takes
the next unused integer across all ledgers (1581 at the drafting revision).
`docscheck` unions definitions from every registered ledger, rejects a number
defined twice anywhere, keeps the per-file ascending order of `check.go:339`,
and resolves a `claims.md#c-NNN` anchor against the ledger that defines it.
Existing identifiers, anchors, the three-or-four-digit pattern and the
workstation schema do not change, which satisfies hard rule 4 and
[principles 3.2](../docs/principles.md). The pattern admits numbers up to
9999; widening it is a separate change with its own schema consequences.
Topic-prefixed identifiers were rejected: they change every pattern and
schema, and they let two topics record one mechanism under two identifiers,
which is the duplication the principle registry exists to prevent.

`research/principle-registry.md` stays the only registry and gains topic as an
evidence branch, not as a split. Deduplication by causal invariant
([principles 3.4](../docs/principles.md)) is already indifferent to the
domain a mechanism came from; it is equally indifferent to the topic that
recorded it. A topic-local principle registry is not permitted.

Candidate and fixture numbers are per topic. The qualified identifier is
`<slug>/fixture-007`; the founding topic keeps its bare identifiers. The
workstation manifest schema gains a `topic` field, and images of a new topic
are named `ghcr.io/cordanallm/<slug>-(candidate|fixture)-NNN`. Founding images
keep their identity, as decision 0083 requires. A fixture that a second topic
wants to reuse is linked, not renumbered.

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

Routes of the founding topic do not change. A new topic's documents publish
at `/topics/<slug>/<path within the topic root>/`, its translations at
`/<lang>/topics/<slug>/...`, and the sitemap lists every topic. The `topics/`
prefix keeps new routes out of the two-letter language namespace and away
from the legacy-subpath check. The portal at `/` remains the founding topic's
portal until the maintainer decides whether it becomes a cross-topic landing;
a `/topics/` index lists active topics in the meantime. Research-object
records and evidence JSON keep their per-document form.

### CI impact map

Topics enter the map as rules, not as new lane kinds. A rule
`topic-<slug>` maps `topics/<slug>/**` to the existing `research` and `site`
lanes, and each executable artifact of a new topic gets a
`workstation-<slug>-<artifact>` lane with its own `ci.yml` job, exactly as
each founding fixture has today. The founding rules do not change. Until a
topic has a rule, its paths select the full lane by the existing fallback,
which is the safe direction.

### Topic-neutral surfaces

These stay shared and unprefixed: `decisions/`; `sources/` and its byte-exact
allowlist (one provenance library, entries cited by any topic);
`research/references.bib` (one bibliography, key uniqueness at
`check.go:439`); `research/research-integrity-baseline.md`;
`research/disclosures/`; `research/normative-baseline.md`; `LICENSING.md`
and `LICENSES/`; `CITATION.cff` at repository level; `docs/principles.md`;
the root `AGENTS.md`; `app/`, `github-pages/`, `scripts/`, `tooling/` and the
`translations/` machinery. Whether `research/audits/` is founding-topic
content or a shared audit library is a maintainer decision; the registry can
express either.

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
3. **Registry-driven consumers with one entry.** Rewrite `docscheck` (ledger
   union, per-topic chapter root and sections, bibliography), `book-source.mjs`,
   `portal-documents.mjs`, the `book-content.ts` glob (moved into the virtual
   module that `vite.pages.config.ts` already generates), `pages-seo.mjs`,
   `audit-test-coverage.mjs`, `audit-prose-style.mjs`,
   `generate-field-coverage.mjs`, `translation-pages.mjs` and
   `research-object-evidence.mjs`. Acceptance: `dist-github-pages/` is
   identical apart from revision stamps. `book-source.mjs` is itself a support
   source, so the book is re-rendered and `validate:book-pdf` runs.
4. **Second topic scaffold.** Create `topics/<slug>/` with a `README.md`, a
   nested `AGENTS.md`, `research/claims.md`, `concept/`, `math/` and
   `experiments/{candidates,fixtures}`; add the registry entry and the
   `topic-<slug>` impact rule; publish `/topics/<slug>/` routes and the
   `/topics/` index. `docscheck` currently rejects a ledger with no
   definition (`check.go:344` and `:345`); either the scaffold carries its
   first claim or that check becomes per-registry rather than per-file.
5. **Later, separately.** Moving the founding topic under `topics/`, a
   cross-topic landing at `/`, and per-topic citation metadata each need
   their own record.

### Not in this record

- No renaming or renumbering of claim, principle, audit, candidate or fixture
  identifiers.
- No move of `research/claims.md`, `research/principle-registry.md`,
  `concept/`, `math/`, `research/audits/` or `experiments/`.
- No repository rename, Go module path change, `20w` command rename or
  container image identity change (decision 0083).
- No route change and no redirect.
- No change to release semantics, containers or reviewed translations.
- No content, claim or chapter for a second topic.
- No decision on the cross-topic landing page.

## Verification and limitations

Nothing about the layout has been executed: no file moved, no validator or
generator changed, no registry written. Locators, counts and line numbers
come from reading the tree at commit `c6cf6e8` with `grep` and `find`; they
describe that revision and will drift.

For this record, `check:prose`, `validate:docs` and `validate:math` are the
selected checks under decision 0080, and the book source digest was compared
before and after the edit to confirm the record lies outside the book set.
The full `npm run check` gate was not run for a documentation-only proposal.

The maintainer must decide: whether option (d) or the symmetric option (a)
is wanted, accepting (a)'s move cost; the founding topic's slug; whether
candidate and fixture numbering is per topic or global; whether `/` stays the
founding portal; whether "smaller hypotheses" become topics or a lighter unit
inside a topic; and whether `research/audits/` is founding content or a
shared library.

Claude (Fable 5.1) drafted this proposal from a read of the repository and the
maintainer's direction. No claim status, experiment admission or scientific
statement changes with it.
