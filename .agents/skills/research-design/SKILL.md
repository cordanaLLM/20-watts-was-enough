---
name: research-design
description: Design or review the 20 Watts Was Enough visual system, research reader, GitHub Pages portal, typography, colour, layout, diagrams, or brand expression. Use for presentation and interface work; do not use for prose-only editing or to change scientific meaning.
---

# Research design

Make research easier to navigate, read, question, and reproduce. Visual
system expresses project's character without competing with its
evidence.

Before changing presentation, read [`docs/design-system.md`](../../../docs/design-system.md),
affected component and style owner, and nearest `AGENTS.md`. Use
project's `reader-editor` skill as well when layout exposes prose problem;
presentation must not silently rewrite claim.

Review rendered surface and relevant issue or user report before
critiquing it. Code alone exposes ownership and semantic defects, not visible
hierarchy, clipping, density, or interaction state reader encounters.

## Frame the change

Name intended reader, their task, route or artifact involved, and the
first point where current design fails. Separate:

- comprehension or navigation failure;
- accessibility defect;
- maintainability defect in tokens, components, or cascade ownership; and
- proposed change to brand expression.

Do not justify change with *modern*, *clean*, or *research grade* alone.
State observable improvement and what evidence could disprove it.

For broad visual direction, choose one characteristic device grounded in the
project's subject—such as real flow, material boundary, or evidence
relationship—and spend expressive budget there. Keep surrounding
system quiet. Repeated decorative network, number, gradient, or card grid is
not signature unless it encodes something true.

Start with established system. Preserve current characteristic device
unless rendered evidence shows it fails reader's task or accepted decision
supersedes it. Do not manufacture novelty by replacing working
identity on every review.

## Build from the system

- Preserve semantic HTML, source order, research identifiers, evidence status,
  and local scrolling for genuinely two-dimensional material.
- Change shared tokens or owning component before adding route-local
  exceptions. New token needs repeated semantic role, not merely colour
  value that appeared twice.
- Before changing selector, find every definition under same media or
  container condition. Consolidate touched rule into its declared owner;
  do not add another same-condition override to win cascade.
- Keep colour supportive. Status, hierarchy, and actions require text, shape,
  position, or another non-colour cue.
- Use typography to establish reading order and distinguish prose, interface,
  and machine identities. Do not add font dependency for novelty.
- Prefer CSS and existing editable vector or Mermaid sources. Use image
  generation only when requested output is genuinely raster artwork.
- Treat motion as feedback or explanation. Respect reduced-motion preferences
  and avoid ambient animation that taxes attention or power without carrying
  information.

Tests protect semantic roles, reading order, reflow, contrast,
interaction, and other observable behaviour. Lock exact colour, grid value,
or source position only when named design decision makes that constant part
of contract.

Control labels may be corrected inside design change. Identity, evidence
status, summaries, or other claim-bearing copy also requires `reader-editor`
and `research-writing` review; visual consistency is not authority to change
scientific meaning.

Brand is calm, exact, ecological without imitation, and technical without
usual neon-AI or fake-laboratory cues. Preserve deliberate character;
avoid generic dashboard styling and decorative journal mimicry.

## Verify the result

For user-visible change, read and apply
[`references/visual-review.md`](references/visual-review.md). Automated checks
are necessary but cannot approve visual hierarchy, line length, clipping, or
felt transition between overview and deep reading.

Record changed tokens or components, routes and states checked, viewport and
zoom conditions, keyboard findings, and any intentional visual difference. Inspect each retained screenshot before using
it as evidence. Keep screenshots as bounded review evidence, not second
design source.

Required route, state, viewport, keyboard, reflow, or zoom lane that could
not be exercised remains explicitly unverified. Do not give change a
verified visual hand-off until that lane runs or scoped review contract no
longer requires it.

## Hand-off

Report reader task, failure corrected, design-system owner changed,
evidence retained, and any decision that still needs maintainer. If clearer
layout would alter evidence status, wording, equations, or source order, stop
at that boundary and request content decision.

When revising this skill itself, read
[`references/prior-art.md`](references/prior-art.md). It records external
skill patterns already evaluated, so project neither rediscovers nor blindly
fetches them.
