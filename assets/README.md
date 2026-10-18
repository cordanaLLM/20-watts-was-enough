# Graphics and figure assets

Editable sources are canonical. Rendered files are optional derived artifacts.

## Site-brand provenance

- `../public/favicon.svg` is a project-authored four-cell vector mark introduced
  by repository owner `lusoris` in commit `380a225`. SHA-256:
  `e6d2e59b7b5bbb0342e0fb496dfc262decbfe4426bbb7b047aec8d467d1dc6f7`.
- `../public/og-v2.jpg` is the project-generated abstract botanical/network
  social-preview artwork contributed by repository owner `lusoris` and
  losslessly recompressed in commit `4545389`; the original generation tool was
  not recorded. SHA-256:
  `f164b18eb8bc7f2c3a09997ac767437cae9d1fbbc55abaa68fc48cc6e59667bc`.

Both are original project-presentation assets licensed under CC BY-SA 4.0 by
the contributor. They contain no imported scientific figure or third-party
brand mark. This provenance statement concerns copyright and traceability, not
scientific evidence.

## Layout

- `diagrams/` contains Mermaid sources used by the concept.
- `plots/core-models.json` contains the editable equations, parameter ranges,
  evidence status, source links, and layout contracts for the generated
  mathematical figures.
- `../scripts/generate-plots.mjs` deterministically renders those specifications
  to `../public/plots/` for GitHub and the private reader.
- `diagrams/evidence-to-principles.mmd` shows how domain findings are audited,
  bundled, translated, and tested without duplicating concepts.
- `diagrams/conservation-qualified-reconfiguration.mmd` carries inventory,
  energy, contamination, authority, protection, maintenance, and reserve state
  through a gated topology transition and rollback.
- `diagrams/metrological-observation-contract.mmd` connects a defined measurand
  to calibration, indication, corrected result, covariance-aware inference,
  decision, provenance, drift checks, and dependency invalidation.
- `diagrams/competence-gated-transition.mmd` follows a receiver from an
  ineligible state through a finite window, provisional transition, validated
  commitment, protection, explicit reopening, rollback, and retirement.
- `diagrams/transported-field-contract.mmd` follows local production through
  geometry-dependent transport, typed inventory, receiver response, validation,
  topology update, contamination handling, cleanup, and retirement.
- `diagrams/controlled-observability-plant-binding.mmd` binds an active sensing
  policy and controller to the body, mechanics, calibration, and environment
  that determine what can be observed and what action can accomplish.
- `rendered/` is reserved for other committed SVG or PNG outputs generated from
  editable sources.
- Future data-driven figures must store plotting source, parameter status, and
  input-data provenance beside the output.

The RSD-T02 planning diagnostics now include two explicitly different views:

- `rsd-t02-power-effect-curve` exposes the variance-only prospective count
  assumption before exact-analyzer calibration; and
- `rsd-t02-bootstrap-calibration` runs the checked-in public synthetic
  transcript scenarios through that analyzer and juxtaposes rejection
  frequencies with bootstrap-resolution failures. Its editable input is the
  calibration JSON referenced by `plots/core-models.json`; it remains
  `NO_RESULT` and is not a scientific power plot.

The analytical plot source currently supports several deliberately different
forms: uncertainty quadrants with a gate ledger, action frontiers, semilog
threshold curves, policy envelopes, stacked mission histories, heatmaps, bars,
and likelihood curves. New specifications declare `layout.kind`, dimensions,
and a named color theme; they should choose the form that explains the equation
rather than forcing every visual into the original dark 1100×660 frame.

The five concept-facing analytical additions are:

- `pareto-dominance-uncertainty` — simultaneous regions plus hard gates;
- `active-acquisition-frontier` — value, physical cost, and admissibility;
- `recovery-time-fragility` — restoring-time divergence and threshold;
- `memory-action-price-envelope` — resource price and action switching; and
- `mission-profile-damage` — equal-mean histories with unequal modeled damage.

`interface-qualified-retroactivity` adds a paired isolated/connected full-ODE
response above exact reduced back-action curves. Its load-ratio sweep makes the
operating-point dependence visible without presenting the illustrative
parameters as measurements.

`history-conditioned-position-contrast` plots constructed centered position
contrasts for shared versus position-blind reserved capacity and their
interaction. It is a hypothetical factorial-design reading aid with no trained
model, measurements, estimate, prediction, or target effect size.

`rsd-t01-family-property-overlap` visualizes the F-026 target correction: one
secondary generator-family label does not determine the separately evaluated,
cross-cutting trajectory, endpoint, peak, memory, and support targets. Logical
dependencies between those targets remain. Its two overlap examples are
possibilities, not measured frequencies or a family-to-property lookup.

`rsd-t02-power-effect-curve` plots the prospective independent-system count
against the minimum relevant loss improvement under three illustrative
variance profiles. It makes the inverse-square effect-size cost, conservative
first Holm threshold, and pre-response attrition visible while keeping support
coverage separate from sample-size inflation. It is a planning sensitivity
map, not a pilot estimate, calibrated bootstrap-power curve, or frozen sample
size. Its dashed cyan series is the baseline-variance calculation without
pre-response attrition.

`fixture-007-identifiability` is also used directly in the concept book because
it already provides the needed analytical distinction between prior-supported
reconstruction and new evidence.

Do not add a screenshot when a Mermaid, SVG, plotting script, or other editable
source can express the same information.
