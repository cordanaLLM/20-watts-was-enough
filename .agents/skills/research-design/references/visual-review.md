# Visual review protocol

Use this protocol after a change affects layout, typography, colour, navigation,
focus, interaction, diagrams, or responsive behaviour. It is a review method,
not a claim of WCAG conformance.

## Representative surfaces

Check the smallest route set that exercises every changed owner. For a broad
publication-system change, include:

- the portal overview;
- one dense canonical research document;
- the continuous book;
- the public help/contribution route; and
- any changed error, empty, expanded, focused, or loading state.

Use narrow, medium, and wide viewports. The project baseline is 375 x 844,
768 x 1024, and 1440 x 1200 CSS pixels unless a defect requires another exact
reproduction. Also inspect the affected routes at 200% browser zoom. Check a
320 CSS-pixel reflow condition when navigation, sticky regions, long identities,
tables, equations, code, or diagrams could create page-level horizontal scroll.

## What to inspect

1. Read the page in visual order. The title, status, next action, and source or
   evidence path should be recoverable without scanning every card.
2. Compare line measure, leading, paragraph rhythm, heading separation, and
   link density. Long-form prose should remain within the bounds in the design
   system; tables and code may scroll locally when their two-dimensional form
   carries meaning.
3. Navigate by keyboard from the first interactive control through the changed
   surface. Focus must remain visible, ordered, and unobscured.
4. Check that status and interaction remain understandable without colour.
5. Inspect long URLs, hashes, claim IDs, mathematics, code, figures, captions,
   and nested lists for clipping or misleading reflow.
6. Check reduced motion, forced colours, and dark/light preferences when the
   changed component responds to them.
7. Compare before and after at the same viewport, zoom, route, content revision,
   and state. Explain intentional differences rather than relying on the image
   to justify itself.
8. Open every saved capture and reject blank, loading, cropped, stale, or
   mismatched evidence before writing a finding.

Prioritise findings by reader impact:

- **P0:** blocks reading, navigation, contribution, or access to evidence;
- **P1:** materially changes meaning, reading order, or a primary task;
- **P2:** creates substantial responsive, accessibility, or system drift; and
- **P3:** refinement that can wait without misleading or blocking a reader.

Do not declare broad accessibility conformance from screenshots. Keyboard,
semantic, assistive-technology, and automated checks cover different evidence.
If a required lane cannot run, record it as unverified and withhold a verified
visual hand-off rather than inferring a pass from adjacent checks.

## Evidence record

Retain bounded screenshots and observations under an ignored working-evidence
directory such as `.workingdir/evidence/design/YYYY-MM-DD-<change>/`. Record:

- source commit and local URL;
- browser identity;
- viewport, device scale, and zoom;
- route and UI state;
- page-level `scrollWidth` and `clientWidth` where reflow matters;
- keyboard and focus result;
- screenshot filename and digest; and
- defects found, fixed, deferred, or judged outside scope.

Do not commit a large screenshot matrix by default. Link the concise evidence
record from the pull request or issue, and promote only durable design rules or
small illustrative assets into Git.

## Source basis

- [WCAG 2.2](https://www.w3.org/TR/WCAG22/) defines the normative success
  criteria used as the accessibility floor.
- [W3C guidance on reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html)
  explains the 320 CSS-pixel condition and why fixed or sticky regions need
  special review under zoom.
- [W3C visual-presentation guidance](https://www.w3.org/WAI/WCAG22/Understanding/visual-presentation.html)
  supplies the reading-measure and spacing bounds adopted by the project.
- [W3C non-text contrast guidance](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html)
  covers controls, focus indicators, and graphics required for understanding.
