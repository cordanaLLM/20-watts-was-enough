---
name: research-writing
description: Edit project-authored research, concept, mathematics, experiment, governance, or public-site prose for 20 Watts Was Enough. Use when drafting or revising explanatory text; do not apply to imported sources, verbatim quotations, or code-only changes.
---

# Research writing

Write like technically literate person making argument, not like system
filling document template. Preserve project's direct, curious, sometimes
blunt voice while keeping evidence boundaries exact.

## Before writing

Read surrounding passage, its nearest `AGENTS.md`, and any applicable
linked claim, principle, equation, or experiment contract. Identify one
thing new text must make clearer. Do not restate background already
established nearby.

For claims, methods, evidence, results, contributor credit, tool disclosure,
or research governance, also read
[`research/research-integrity-baseline.md`](../../../research/research-integrity-baseline.md).
Skip that extra read for presentation-only or interface copy.

Use British English in canonical prose. Preserve source terminology, stable
identifiers, equations, citations, and quotations exactly unless task is to
correct them.

## Draft the argument

- Lead with finding, mechanism, disagreement, or decision. Give context
  only when reader needs it to understand that point.
- Prefer concrete nouns and active verbs. State what changes, under which
  condition, through which mechanism, and what would be observed if it fails.
- Let paragraphs have different shapes. Short consequence can follow a
  longer derivation; do not force every paragraph into claim-explanation-
  summary form.
- Use list for real set, sequence, or comparison. Use prose when ideas
  depend on one another. Do not hide argument inside wall of bullets.
- Put uncertainty where it belongs: next to affected claim, parameter, or
  inference. One precise qualification is stronger than repeated generic
  caution.
- Separate observation, proposed translation, and speculation without
  repeatedly announcing that separation after it is already clear.
- Use examples that expose mechanism or failure mode. Do not invent an
  analogy merely to make prose sound approachable.
- Keep required chapter headings, but do not repeat stock opening and
  closing sentences under each heading.

## Remove machine-shaped prose

Delete text that performs tone instead of carrying information, including:

- ceremonial openings and summaries;
- claims that something is important without saying why;
- marketing verbs such as *unlock*, *revolutionise*, or *pave way*;
- vague intensifiers such as *remarkable*, *profound*, or *crucial* when no
  comparison supports them;
- canned contrasts of form “not merely X, but Y” unless actual mistaken
  X is being corrected;
- strings of equally sized sentences or paragraphs with same opener;
- fake quotations, unsourced consensus, and anonymous “researchers believe”;
- defensive disclaimers against positions project and user never took;
  in particular, do not introduce claims about whether project aims to
  recreate organ unless that distinction is necessary to argument; and
- repeated reminders of settled repository boundaries. Link controlling
  statement instead.

Never weaken scientific qualification merely to sound confident. Never add a
qualification merely to sound responsible.

## Revision pass

1. Check that every paragraph contributes new fact, relation, consequence,
   limitation, or decision.
2. Replace abstract summary words with concrete mechanism they stand for.
3. Remove repetition and throat-clearing before shortening substantive detail.
4. Read passage aloud mentally. Split accidental run-ons and combine
   staccato fragments; sentence-length variation should follow thought.
5. Verify claim status, citations, symbols, units, cross-links, and boundary
   between measured results and hypotheses.
6. Run `npm run check:prose` and closest content validator.

`check:prose` is narrow tripwire for small set of high-confidence phrases
in canonical project Markdown. It does not judge argument quality or replace
review. Public-site prose embedded in code follows this skill through review,
not through brittle JSX or HTML extraction.

Tripwire ignores Markdown code and blockquotes. When flagged phrase is
necessary in ordinary prose, add concrete, reviewable reason on that same
line using `<!-- prose-audit: ignore-line: reason -->`. Do not use marker
to exempt passage or file.

Translations are reviewed derivatives, not canonical prose. Do not silently
write generated translations back into English source or present machine
output as reviewed translation.
