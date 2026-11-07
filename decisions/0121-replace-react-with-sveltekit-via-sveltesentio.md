# 0121 — Replace the React reader with prerendered SvelteKit through sveltesentio

- **Status:** accepted
- **Date:** 2026-10-26
- **Decided by:** operator order to replace the React and Vite portal and book
  with Svelte through `golusoris/sveltesentio`, prerendered as static files,
  while keeping every public route, anchor, language switch and the PDF build
  (paraphrased).
- **Authority:** the reader framework in `github-pages/`, `app/components/`,
  `vite.pages.config.ts`, `scripts/lib/pages-seo.mjs` and the frontend entries
  of `scripts/book-source.mjs`. Canonical Markdown, BibTeX, Mermaid sources,
  claims, principles, models, candidate contracts, translation review rules and
  result status do not change.
- **Extends:** [0030](0030-publish-each-research-document-at-a-canonical-route.md),
  [0058](0058-expose-only-route-available-reviewed-translations.md),
  [0063](0063-own-public-reader-css-separately.md),
  [0072](0072-run-browser-contracts-in-isolated-processes.md)

## Context

The public reader is a client-rendered React 19 application built by Vite:

- `github-pages/main.tsx:36` and `github-pages/book.tsx:23` mount
  `PublicResearchPortal` and `BookEdition` with `createRoot`;
  `vite.pages.config.ts:1` and `:343` load `@vitejs/plugin-react`.
- Static HTML exists only as a search-engine fallback.
  `scripts/lib/pages-seo.mjs:1-3` renders it with `react-dom/server` and
  `react-markdown`, and `vite.pages.config.ts:254-256` writes it into the
  emitted `index.html`, `book/index.html` and `help/index.html`.
- `react-markdown` drives one unified 11 pipeline:
  `app/components/markdown-document.tsx:499-506` sets `skipHtml`,
  `remarkPlugins = [remarkGfm, remarkMath]` and
  `rehypePlugins = [rehypeSlug, rehypeKatex, rehypeOverflowLabels]`, the last
  being project code. Mermaid fences become `MermaidDiagram` at `:478`, which
  renders in the browser.
- Heading identity is github-slugger. `app/lib/heading-outline.ts:25-46` keeps
  the outline in step with `rehype-slug`, and `app/lib/book-document-id.mjs:1-10`
  prefixes book headings as `book-<document>--<heading>`.
- The PDF is printed from the book entry. `scripts/generate-book-pdf.mjs:49`
  opens `/book/?pdf=1&ref=…&revision=…` on a Vite server started at `:98-104`
  with `vite.pages.config.ts`. `app/lib/book-release-identity.mjs:6,55` selects
  the PDF surface only for loopback hosts.
- 23 frontend files are PDF source members. `scripts/book-source.mjs:94-118`
  lists them, and `public/downloads/book-manifest.json` binds their bytes into
  `source_digest`.

The live site was captured before any change: 52 sitemap routes plus `/help/`,
with every element id and link per route, screenshots of `/`, `/book/` and
`/help/`, and the PDF link identity. The evidence is
`.workingdir/evidence/svelte-migration/before-20261026-0901/`. The source
inventory with line pointers is
`.workingdir/evidence/svelte-migration/inventory.md`.

## What sveltesentio provides

Read at `golusoris/sveltesentio` `origin/main` `cf60300`:

| Package | Version | Use here |
| --- | --- | --- |
| `@sveltesentio/core` | 0.7.0 (`packages/core/package.json`) | `sentioPlugin` from `./vite` (`packages/core/src/vite.ts:103`) with per-chunk `bundleBudget` (`:16`); `sentioEslint` from `./eslint` (`packages/core/src/eslint.ts:445`), whose `noUnsanitisedHtml` rule governs `{@html}` sinks. Peers `@sveltejs/kit ^3.0.0`, `svelte >=5.56.4`, `vite >=8.0.16`. |
| `@sveltesentio/testing` | 0.4.2 | `./a11y` and `./locale-parity` helpers; adopted where they fit the existing CDP browser contracts of Decision 0072. |
| `@sveltesentio/ui` | 0.8.3 | `./markdown` exports `renderMarkdown` (`packages/ui/src/markdown/index.ts:12`): runtime `marked` + DOMPurify for untrusted input. Not used for the corpus: its allowlist forbids `svg` and `math` (`packages/ui/src/markdown/allowlist.ts:89`), which KaTeX MathML and Mermaid require. Its components assume Tailwind 4 and bits-ui peers; the reader keeps the CSS ownership of Decision 0063. |
| `@sveltesentio/i18n` | 0.6.0 | Paraglide v2 message catalogues (`packages/i18n/src/index.ts:1`). Not used: the reader localises whole reviewed documents per route, not interface strings. |
| `apps/docs` | private | Reference for SvelteKit + `@sveltejs/adapter-static` with full prerender (`apps/docs/vite.config.ts:1-25`). |

Its ADR-0026 (`docs/adr/0026-markdown-runtime-build-split.md`) assigns authored
Markdown to `mdsvex@^0.12` at build time and runtime input to `marked` +
DOMPurify.

## Gaps

| Gap | Evidence | Owner issue |
| --- | --- | --- |
| The build-time Markdown lane cannot run the unified 11 plugins this corpus needs. | `mdsvex@0.12.8` bundles `remark-parse ^8`; with `remark-math@6.0.0` and `rehype-katex@7.0.1` it leaves `$…$` and `$$…$$` as literal text and reports no error. `rehype-slug@6.0.0` does work. Probe: `.workingdir/evidence/svelte-migration/mdsvex-probe/result.txt`. | [golusoris/sveltesentio#470](https://github.com/golusoris/sveltesentio/issues/470) |
| No Mermaid component or fenced-code handler. | No `mermaid` hit in `packages/` or `apps/docs` at `cf60300`. | [golusoris/sveltesentio#471](https://github.com/golusoris/sveltesentio/issues/471) |
| No shared adapter-static preset for a static Pages site. | adapter-static appears only in `apps/docs/vite.config.ts:1`; the i18n records require `paths: { relative: false }` (`docs/adr/0017-paraglide-v2-i18n-default.md:50`) but no package carries it. | [golusoris/sveltesentio#472](https://github.com/golusoris/sveltesentio/issues/472) |

Until those issues close, the reader keeps its existing unified 11 build
pipeline and its Mermaid wrapper as project code. Neither copies sveltesentio
code, and each moves to the sveltesentio implementation when one exists.

## Decision

1. **Framework.** Build the portal, book, help page and every document route
   with SvelteKit 3 (`@sveltejs/kit` 3.1.0), Svelte 5.57.2 and
   `@sveltejs/adapter-static` 4.0.0. Every route sets `prerender = true` and
   `trailingSlash = 'always'`; output stays `dist-github-pages/`.
2. **sveltesentio.** Adopt `@sveltesentio/core` (`sentioPlugin` with the
   400 000-byte initial JavaScript budget now in
   `scripts/validate-github-pages-build.mjs:47`, and `sentioEslint`) and
   `@sveltesentio/testing` where its helpers fit. Gaps go to the issues above,
   never into a local fork.
3. **Markdown stays the only source.** A server-only module renders each
   document at prerender time with the current pipeline in its current order
   and options: `remark-parse`, `remark-gfm`, `remark-math`, `remark-rehype`
   without raw HTML, `rehype-slug`, `rehype-katex`, the project's
   `rehypeOverflowLabels` and `rehype-stringify`. The HTML enters the page through one audited
   `{@html}` sink for repository-owned content. KaTeX output becomes static
   HTML; Mermaid fences become a Svelte component that renders the SVG in the
   browser, as today. BibTeX and claim anchors keep their present generators.
4. **Component moves.**

   | Current file | Svelte target |
   | --- | --- |
   | `github-pages/index.html`, `github-pages/main.tsx`, `app/components/public-research-portal.tsx` | `src/routes/+page.svelte` and `src/routes/+layout.svelte`; the legacy `#book-` and `?doc=` redirects (`github-pages/main.tsx:18-34`) stay as a small client script |
   | document routes emitted by `vite.pages.config.ts` | `src/routes/[...document]/+page.svelte` with `entries` from `scripts/lib/portal-documents.mjs` |
   | `github-pages/book/index.html`, `github-pages/book.tsx`, `app/components/book-edition.tsx` | `src/routes/book/+page.svelte` |
   | `github-pages/help/index.html`, `github-pages/help.css` | `src/routes/help/+page.svelte` |
   | `app/components/markdown-document.tsx` | `src/lib/server/render-markdown.ts` plus `src/lib/MarkdownDocument.svelte` |
   | `app/components/mermaid-diagram.tsx` | `src/lib/MermaidDiagram.svelte` |
   | `app/components/language-access.tsx` | `src/lib/LanguageAccess.svelte` |
   | `app/components/readiness-overview.tsx`, `research-object-header.tsx`, `overflow-region.tsx`, `portal-footer.tsx` | `src/lib/*.svelte` of the same names |
   | `scripts/lib/pages-seo.mjs` | removed; prerendering emits the full HTML |
   | `app/lib/*.mjs`, `app/lib/*.ts`, `app/globals.css`, `app/portal.css` | unchanged and imported by the Svelte files |

5. **Parity gate.** The train is complete only when all of these hold:
   - the route list and the per-route element ids of the before capture
     equal those of the same capture against the new build;
   - screenshots of `/`, `/book/` and `/help/` and the PDF link status match,
     with any visual difference listed and justified in the pull request;
   - `scripts/validate-github-pages-build.mjs`,
     `scripts/book-fragment-browser.test.mjs` (51 chapters, no duplicate or
     unresolved fragment, `:246-255`) and `scripts/mermaid-browser.test.mjs`
     pass without weakened assertions.
6. **PDF.** `scripts/generate-book-pdf.mjs` keeps the
   `/book/?pdf=1&ref=…&revision=…` contract and the loopback-only surface
   switch. It serves the SvelteKit book instead of `vite.pages.config.ts`.
   `scripts/book-source.mjs` lists the Svelte files in place of the `.tsx`
   members, and each pull request that changes a member re-renders the PDF
   and updates `scripts/book-pdf-semantic-baseline.json`.
7. **Pull-request train.** Each step lands on its own at a clean merge state:
   1. this record;
   2. SvelteKit beside the React build: config, layout, server-side Markdown
      module and its tests, emitting to a scratch directory;
   3. document routes and help page in Svelte;
   4. portal page in Svelte;
   5. book page, PDF generator switch, source-member update and PDF
      re-render;
   6. Pages build switched to SvelteKit, React-specific source tests rewritten,
      parity capture recorded;
   7. removal of `github-pages/*.tsx`, `app/components/*.tsx`,
      `vite.pages.config.ts`, `scripts/lib/pages-seo.mjs`, `react-markdown`,
      the React lint plugins and types, and last `react`, `react-dom` and
      `@vitejs/plugin-react`.

## Consequences

- Each page ships its full content as HTML; React hydration and the separate
  search-engine fallback disappear.
- Source-text tests that match JSX need rewriting against the Svelte files:
  `scripts/book-edition-surface.test.mjs`, `scripts/book-route.test.mjs`,
  `scripts/github-pages.test.mjs`, `scripts/language-access.test.mjs:239`,
  `scripts/publication-unification.test.mjs`,
  `scripts/research-object-header.test.mjs`, `scripts/css-authority.test.mjs`
  and `scripts/validate-css-authority.mjs`. Browser contracts and output
  validators stay unchanged; the inventory, section 7, lists each file.
- `tsconfig.json:15` (`jsx`), the React rules in `eslint.config.mjs:4-48`, the
  `site` lane paths in `.github/ci-impact.json` and the Renovate groups follow
  the file moves in the step that moves them.
- Steps 5 to 7 change PDF source members, so each re-renders the PDF; that
  takes about 450 s per render on the reference workstation.

## Rejected alternatives

- **Keep React.** The operator ordered its removal.
- **Copy the missing pieces into a local sveltesentio fork.** It would split
  the shared framework; the gaps go to its owner instead.
- **mdsvex for the corpus now.** The probe shows it drops all mathematics
  without an error.
- **Plain Vite with Svelte, or Astro.** Neither matches the SvelteKit base that
  sveltesentio requires (`@sveltejs/kit ^3.0.0` peer).
