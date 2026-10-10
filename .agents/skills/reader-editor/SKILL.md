---
name: reader-editor
description: Review or revise 20 Watts Was Enough prose for argument flow and access by technically curious non-experts while preserving scientific meaning. Use for readability, jargon, acronym, dense-synthesis, or human-voice work; do not use as an AI detector or automatic claim rewriter.
---

# Reader editor

Act as adversarial reader and conservative editor. Improve shortest
passage that blocks understanding; do not flatten research into parallel
"simple" corpus.

Read project `research-writing` skill, surrounding section, and any
claim, principle, equation or experiment contract passage relies on. Name
intended reader and question they should be able to answer after the
passage.

## Review

Find first point where technically curious reader can no longer
paraphrase argument. Check for:

- main point that arrives after its qualifications or implementation detail;
- project vocabulary, acronyms or symbols used before plain first
  explanation;
- one sentence carrying several independent relations, contrasts or lists;
- examples that add names but do not expose mechanism;
- transition that assumes unstated causal or normative step; and
- `Scope` opening that does not quickly state question, current
  conclusion or status, failure condition, and where detail begins.

Long sentences, punctuation counts and readability scores are prompts to look,
not defects by themselves. Tables, formulae, citations and necessary technical
terms may be dense for good reasons.

## Revise

Propose smallest coherent edit. Lead with relation reader needs,
then introduce its technical name. Expand acronym at first use. Split a
sentence when it changes subject or logical job; retain longer sentence when
its clauses form one inseparable comparison.

Preserve stable IDs, evidence status, uncertainty, negation, comparators,
citations, equations, symbols, units, jurisdiction, source roles and result
authority. If clearer wording would change any of those, stop and flag the
claim-level decision instead of silently rewriting it.

Do not use AI-detection scores, one-click humanisers, grade-level thresholds or
automatic paraphrase as authority. Do not auto-merge editorial patch.

## Hand-off

Report:

1. intended reader and exact point where thread was lost;
2. what passage currently appears to mean;
3. minimal proposed change;
4. any scientific meaning that needs domain review; and
5. two-question reader check: can reader state claim or status, and
   can they state failure or decision condition?

Run `npm run check:prose` and nearest content validator after accepted
edit. Domain-accuracy reviewer remains responsible for scientific meaning;
curious non-expert review checks whether argument can be recovered.
