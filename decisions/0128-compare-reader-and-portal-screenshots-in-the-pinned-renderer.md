# 0128 — Compare reader and portal screenshots in the pinned renderer

- **Status:** accepted
- **Date:** 2026-11-12
- **Authority:** `scripts/visual-baselines/views.json`,
  `tooling/internal/visualbaseline`, `tooling/internal/pdfrender/script.go`,
  `scripts/capture-visual-views.mjs` and the `visual-baselines` CI job.
- **Related:** issue #239,
  [0119](0119-reuse-one-cached-builder-for-local-book-renders.md),
  [0120](0120-fetch-renderer-base-images-in-a-bounded-phase.md).

## Context

The reader and portal can lose list markers while their document structure
still passes semantic checks. A screenshot comparison makes that visual
change observable. Host Chrome discovery in `scripts/lib/chromium-cdp.mjs`
and the system font stacks in `app/globals.css` leave host captures dependent
on the installed browser and fonts.

The PDF renderer already binds its browser and runtime image through
`tooling/pdf-renderer/lock.json`. Reusing its builder, dependency binding,
publication lock and isolated container avoids a second browser installation
and a second implementation of that boundary.

## Decision

1. Capture the portal home, continuous book reader and one portal document at
   desktop 1440 × 900 and mobile 375 × 844 CSS pixels, with device scale factor
   1. The checked-in plan names every route and readiness selector. The document
   view centres the “One event end to end” fragment of
   `concept/01-working-architecture.md`, an architectural overview whose preceding
   maintenance list and following event list exercise unordered and ordered
   markers in the same viewport.
   Per-view `mask_selectors` replace volatile values with the fixed text
   `masked` and hide them with `visibility: hidden !important`, so their
   original length cannot change the layout. The book reader masks
   `.book-cover dd`; the portal home masks `.portal-overview-metrics dd` and
   `.portal-status-outcome span`. A selector that matches nothing fails the
   capture. Each view admits at most eight selectors, each non-blank, unique
   and at most 512 bytes; a capture masks at most 256 elements.
2. Run captures only inside the pinned renderer image, using the locked Chrome
   executable, light colour scheme, reduced motion and fixed font-rendering
   flags. The manifest must identify the expected browser version, every
   capture and its PNG dimensions. Each capture has a 60 s deadline; the
   container also has the lock's render deadline and resource limits.
3. A pixel differs when any straight RGBA channel differs by more than
   `channel_tolerance`, on the 0–255 channel scale. Comparison fails when the
   differing pixel count exceeds `maximum_differing_pixels`, or dimensions
   differ. Equality at either tolerance boundary passes. The initial plan uses
   channel tolerance 2 and a budget of 16 pixels per image. These values require
   calibration against repeated pinned captures and the real CSS marker-removal
   control before the baselines are accepted; synthetic tests establish the
   comparison law, not browser reproducibility.
4. `npm run check:visual` compares captures with the six committed PNGs.
   Baselines change only through `npm run record:visual`, for an intended
   visual change. Reviewers inspect the PNG diff before accepting the update.
   Check mode never repairs a baseline. Missing baselines and malformed
   manifests fail closed.
   An edit to section 4 of `concept/01-working-architecture.md`, or any other
   change to unmasked content shown by a view, requires an explicit
   `--record` run and review of the resulting PNG diff.
5. Full plans and site or renderer impact select the read-only CI job. On failure it retains
   `build/visual-check` for seven days, including actual and red-highlighted
   difference PNGs and `report.json`. The job has a 15-minute ceiling and
   inherits workflow concurrency. It requires no new credentials or write
   permission. Capture output is bounded to 32 images, each at most 4096 × 4096
   pixels and 80 MiB; the committed inventory contains six images.
   In check mode, `report.json` lists every comparison in capture order with
   its view, viewport, dimension match, differing pixel count, maximum channel
   delta and pass status, including passing captures for tolerance calibration.
   Failures also retain their artifact paths in the failure list; capture
   errors produce an empty comparison list and an error message.
6. If repeatable CPU variance makes CI exceed the tolerance, use the CI capture
   artifact as review evidence and run the explicit record command on that
   runner to adopt its captures as the baseline. Commit the resulting PNG diff
   through review. Do not widen tolerances to conceal an unexplained change.

## Consequences

The default check and test suites remain usable without Docker; screenshot
checks are explicit commands and a separate CI job. Recording atomically
replaces each changed PNG through a temporary file in the baseline directory;
unchanged PNGs retain their bytes and file identity. Capture and manifest
validation complete before recording begins. A later filesystem failure can
leave a partial set of newly recorded files, visible in Git; rerunning record
mode completes the intended set.

The synthetic `TestPlantedMarkerRemovalFails` control removes five disc-marker
blobs. Browser-level acceptance additionally requires removing the list-style
and marker rules from `app/globals.css` and observing comparison failure at
both viewports. That capture is integration evidence, not a scientific result.

## Verification and disclosure

Implementation and fixture tests use Go's PNG decoder and fake renderer
executors. Real container captures, repeatability measurements, the committed
PNG set and the CSS-removal control belong to integration review. No browser
capture or calibrated pixel-noise result is asserted by this record alone.

## Revisit trigger

Revisit the capture inventory when routes or reader structure change, and
re-record through review when the renderer lock or intended visual design
changes. Replace this mechanism if another maintained capture tool can retain
its pinned environment, explicit baseline authority and planted regression
sensitivity with less duplicated machinery.
