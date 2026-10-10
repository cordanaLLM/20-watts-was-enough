# Rendered PDF QA

This reference belongs to the
[publication-design skill](../SKILL.md). It is the step-by-step procedure for
inspecting the rendered book PDF.

For a read-only audit, validate the checked-in pair first. After a source or
layout change, regenerate it before review:

```bash
npm run generate:book-pdf
npm run validate:book-pdf
```

Retain bounded evidence under
`.workingdir2/evidence/design/<date>-<change>/book-pdf/`. The evidence note
records the source revision, PDF and manifest hashes, validation result,
renderer and inspection-tool identities, exact commands, page-to-class sample
map, findings, and unexercised lanes. Record PDF metadata, structure output and
the Poppler version:

```bash
pdfinfo public/downloads/20-watts-was-enough-full-concept-book.pdf
pdfinfo -struct \
  public/downloads/20-watts-was-enough-full-concept-book.pdf \
  > .workingdir2/evidence/design/<date>-<change>/book-pdf/structure.txt \
  2> .workingdir2/evidence/design/<date>-<change>/book-pdf/structure.stderr.txt
pdftoppm -v
```

Inspect `structure.stderr.txt` even when `pdfinfo -struct` exits successfully.
A non-empty file is a retained semantic finding, not a clean result.

Render a representative page or bounded range at 150 DPI:

```bash
pdftoppm -png -r 150 -f <first-page> -l <last-page> \
  public/downloads/20-watts-was-enough-full-concept-book.pdf \
  .workingdir2/evidence/design/<date>-<change>/book-pdf/page
```

The sample must cover every affected class and normally includes the cover,
TOC, prose-heavy page, chapter boundary, table, displayed equation, figure or
Mermaid diagram, appendix or reference-heavy page, and final page. Inspect
every generated PNG. Expand around a defect or pagination shift; do not
rasterize all pages by default. Compare chapters or elements by identity, not
only page number, because pagination can move.

Inspect reading order for each sampled non-linear class, using one command per
page so the evidence stays attributable:

```bash
pdftotext -raw -f <page> -l <page> \
  public/downloads/20-watts-was-enough-full-concept-book.pdf \
  .workingdir2/evidence/design/<date>-<change>/book-pdf/page-<page>.txt
```

For book-screen changes, also run the viewport, zoom, reflow, keyboard, and
colour-independence lanes in the visual-review protocol.
