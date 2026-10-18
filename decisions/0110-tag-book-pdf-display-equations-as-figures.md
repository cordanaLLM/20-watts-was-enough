# 0110 — Tag book PDF display equations as figures with TeX alternative text

- **Status:** accepted
- **Date:** 2026-10-18
- **Related:** [issue #17](https://github.com/cordanaLLM/20-watts-was-enough/issues/17)

## Context

The book PDF is printed by Chromium with `--export-tagged-pdf`. KaTeX renders
each equation twice: a MathML copy that is visually clipped, and a glyph layer
under `.katex-html` that carries `aria-hidden="true"`. Chromium's tagged PDF
output has no mapping for MathML, so neither copy reached the structure tree.
The four equation sentinels in `scripts/book-pdf-semantic-baseline.json`
recorded every display equation as absent from tagged structure text.

A probe page printed with the pinned renderer (chrome-headless-shell 1248)
measured four variants of one display equation:

| Variant | Tagged structure result |
| --- | --- |
| KaTeX default | equation absent |
| `aria-hidden` removed from `.katex-html` | one `NonStruct` per glyph, no readable order |
| `role="math"` with `aria-label` | empty `NonStruct` |
| `role="img"` with `aria-label` | `Figure` with `/Alt`, at the equation's reading position |

The web reader uses the same DOM, where KaTeX's MathML serves screen readers
better than an image label would.

The `.katex-display` span is also the overflow region of
`app/components/overflow-region.tsx`. On `beforeprint` and on the print media
change, both of which `Page.printToPDF` dispatches, its handler removes `role`
and `aria-label`. On a probe page with the same handler, that removal dropped
the `Figure`; guarding the two attributes against removal kept it. Whether
the full book hits the same removal was not isolated, so the guard stays as
a defence. A label on the inner `.katex` box, or on a new
wrapper element, produced no structure element in the probe.

## Decision

1. After the readiness check and before `Page.printToPDF`,
   `scripts/generate-book-pdf.mjs` runs
   `tagDisplayEquationsForPrint` from
   `scripts/lib/book-print-equation-tags.mjs` in the print session. It sets
   `role="img"` and `aria-label` to the TeX annotation on every
   `.katex-display`.
2. On those spans the step guards `role` and `aria-label` against removal for
   the rest of the print session. Other attributes are still removed.
3. The step refuses the render when the page has no display equation or any
   display lacks a TeX annotation; it then changes no element.
4. Only the print session runs the step. The web reader's DOM and its MathML
   stay unchanged.
5. Inline equations stay untagged.

## Consequences

- Display equations appear in the PDF structure tree as `Figure` elements whose
  alternative text is the TeX source, in reading order. The four equation
  sentinels assert that text and leave the known-debt state.
- A PDF reader announces TeX source, not spoken mathematics, and the tag is
  `Figure`, not `Formula`. This is a recorded limitation, not PDF/UA
  conformance.
- The helper is a renderer input, so changes to it change the book source
  digest.

**Revisit trigger:** a pinned Chromium release that emits `Formula` tags or
structure for MathML in tagged PDF output. Then the step is retired in favour
of KaTeX's MathML.
