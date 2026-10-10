---
name: publication-design
description: Design or review the 20 Watts Was Enough continuous research book and generated PDF. Use for book hierarchy, print typography, pagination, navigation, figures, tables, equations, PDF accessibility checks, or rendered-page visual QA; use research-design for portal-only work and reader-editor for prose-only readability work.
---

# Publication design

Treat web book and PDF as two renderings of one canonical source. Improve
legibility and navigation without creating parallel edition or changing
scientific meaning through layout.

Before changing either surface, read:

- [`docs/design-system.md`](../../../docs/design-system.md);
- project-local [`research-design` skill](../research-design/SKILL.md) and
  its [`visual-review` protocol](../research-design/references/visual-review.md);
- [`app/AGENTS.md`](../../../app/AGENTS.md) and
  [`scripts/AGENTS.md`](../../../scripts/AGENTS.md); and
- [`docs/publication-workflow.md`](../../../docs/publication-workflow.md).

Use `reader-editor` and, where required, `research-writing` when defect is
in words rather than their presentation. State reader task, observed
failure, affected surface (`book`, `PDF`, or both), and affected chapters or
page types before editing.

## Authority map

| Concern | Authority |
| --- | --- |
| Included documents and order | `app/book-content.ts` and canonical Markdown |
| Book composition, hierarchy, TOC and heading IDs | `app/components/book-edition.tsx` |
| Static book/PDF entry | `github-pages/book.tsx` |
| Screen and print presentation | `app/globals.css` |
| Source closure and digest | `scripts/book-source.mjs` |
| PDF generation | `scripts/generate-book-pdf.mjs` |
| PDF and manifest integrity | `scripts/validate-book-pdf.mjs` and `scripts/lib/book-pdf-integrity.mjs` |
| Pinned renderer | `tooling/internal/pdfrender/` and `tooling/pdf-renderer/lock.json` |
| Generated pair | `public/downloads/20-watts-was-enough-full-concept-book.pdf` and `book-manifest.json` |

Never edit generated PDF, manifest, `dist/`, `dist-github-pages/`, or
reader copies directly.

## Review contract

### Structure and navigation

- Preserve canonical inventory and order unless task explicitly
  changes book structure.
- Check cover, TOC, readiness front matter, chapter starts, mathematics,
  appendix, source links, legal links, revision identity, and final page.
- Verify heading levels and IDs remain unique and TOC links reach intended
  headings.
- Treat chapter reordering or parallel summaries as content-authority changes,
  not visual cleanup.
- Check PDF page numbers and chapter breaks in rendered artifact.

### Typography and pagination

- Apply screen measure, leading, zoom, and reflow requirements from the
  design system. Judge print text from rendered A4 pages, not CSS values alone.
- Inspect body text, captions, tables, code, equations, footnotes, and metadata
  at realistic reading or print size.
- Detect clipping, overlap, isolated headings or captions, widows and orphans,
  accidental blank pages, excessive forced breaks, and unreadably reduced
  material.
- Fix owning component or layout rule. Do not solve one overflow by
  shrinking entire book.

### Figures, tables and equations

- Preserve semantic structure, captions, source or construction paths, and a
  textual route to information. Do not depend on colour alone.
- On screen, keep overflow local to genuinely two-dimensional material. In
  print, ensure each item fits, reflows, or splits intentionally without losing
  labels, units, comparators, or uncertainty.
- Do not rasterize text, equations, or tables merely to simplify pagination.
- Do not add landscape pages, numbering system, or changed mathematical
  notation as incidental style fix.

### Accessibility boundary

- Check HTML heading order, link purpose, source order, alternative text,
  captions, keyboard focus, 200% zoom, and 320 CSS-pixel reflow.
- Current-publication review begins only after `npm run validate:book-pdf`
  passes for checked-in PDF and manifest. If validation fails, do not issue
  current-publication pass. Continue only as explicitly labelled
  historical-artifact audit that records stale or mismatched authority.
- Record `pdfinfo` page format and tag state. Run `pdfinfo -struct`, retain its
  standard error separately, and treat every diagnostic as semantic finding
  even when command exits zero. Do not report clean semantic pass while
  structure diagnostics remain unexplained.
- Compare `pdftotext -raw` order with visible page for every sampled
  non-linear class: dashboard or status panel, table or displayed
  equation, and diagram or figure. Record moved captions or values, merged
  labels, and fragmented equations rather than relying on arbitrary prose
  spot-check.
- Tagged PDF, successful extraction, or clean screenshots do not establish
  PDF/UA or WCAG conformance. Keep those lanes unverified unless dedicated
  semantic or assistive-technology audit ran.

## Rendered PDF QA

Follow [`references/pdf-qa.md`](references/pdf-qa.md). Read-only audit:
validate checked-in pair first. After source or layout change, regenerate
before review:

```bash
npm run generate:book-pdf
npm run validate:book-pdf
```

Same file holds evidence folder, `pdfinfo`, `pdftoppm` and `pdftotext`
commands and sampling rule. For book-screen changes, also run viewport, zoom,
reflow, keyboard and colour-independence lanes in visual-review protocol.

## Verification and hand-off

Run smallest applicable checks while developing:

```bash
node --test scripts/book-route.test.mjs scripts/book-edition-surface.test.mjs
npm run typecheck
npm run lint
npm run test:github-pages
npm run generate:book-pdf
npm run validate:book-pdf
```

Run `npm run check:prose` and `npm run validate:docs` when canonical prose or
document structure changes. Run real two-builder PDF reproducibility
acceptance only when renderer, toolchain, source-closure, or publication-
generation authority changes; ordinary bounded visual adjustment does not
require it.

Report: reader task and failure, authority files changed, screen states and
viewports inspected; PDF page types and numbers inspected, retained PNG/text
evidence, generation and integrity results; structure diagnostics, class-by-
class reading-order findings, and remaining semantic-accessibility or content
decisions.
