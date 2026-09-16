# Git-centred open research publication infrastructure

<!-- markdownlint-disable MD013 -->

- **Audit date:** 2026-08-30
- **Status:** external infrastructure audit; no scientific result, central
  claim, principle, experiment or architecture promotion
- **Question:** how do maintained research projects use Git, a public research
  site, releases, archives, containers, review and translation without creating
  several competing sources of truth?
- **Intended reader:** a technically curious contributor or maintainer deciding
  where to read, change, rerun, review or preserve one research object
- **Evidence rule:** direct repository and rendered-site inspection establishes
  observed practice only; papers and official specifications support their
  stated scope; project adoption remains an explicit engineering decision
- **Review and tool disclosure:** OpenAI Codex, including parallel agents and
  web search, performed source discovery, repository inspection and drafting
  under maintainer direction. Factual statements in the evidence matrix were
  checked against the linked sources; the usable patterns and retained
  boundaries are project inferences. No independent reviewer or second human
  line-by-line review is claimed.
- **Repository snapshots:** IBEX
  `0b1d03e4973bb6f064d4c34d23aa5d26cac5777d`, The Turing Way
  `304ba8d34aef19ab83219183a3510a434704d194`, JOSS
  `49669629847201a313e94b58e7dd7a16dc7af509`, ReScience C site
  `f6d136b41d6bc5e53d17692bb90b69758baac428`, and RO-Crate
  `bcb246066bddbe0b3c271db18aaf290168b8ee63`; Real World Data
  Science `3e0a17dfc10cc38de31da6440fe46e3d60938445`
- **Promotion state:** this audit sharpens publication and contribution
  boundaries. It adds no `C-` record, `P-` bundle, candidate, fixture or result.

## Normative and service context

- **Normative context:** the project keeps its EU/Germany legal default. This
  audit uses global web and packaging specifications only as technical practice.
- **Authorities:** W3C for WCAG 2.2 web guidance; the Open Container Initiative
  for OCI image and distribution specifications; GitHub, Weblate and po4a for
  their own current service or tool behaviour.
- **Source role:** technical practice and comparative infrastructure evidence,
  not a legal requirement or accessibility-conformance finding.
- **Snapshot:** WCAG 2.2, RO-Crate 1.3, OCI image and distribution
  specifications 1.1.1, Weblate 2026.8.1, po4a 0.74 and the live GitHub
  service documentation inspected on 2026-08-30.
- **Applicability:** generated GitHub Pages reading surfaces, release assets,
  experiment images and reviewed translations in this public repository.

## Search and selection method

This is a purposive infrastructure comparison, not a systematic review. On
2026-08-30, the search split the question into five observable boundaries:

1. Git-authored research knowledge bases and generated publications;
2. public review, correction and computational reproduction;
3. versioned software, container identity, provenance and preservation;
4. Git-backed translation of maintained Markdown; and
5. readable long-form research interfaces.

Searches combined the repository's Cordana SearXNG gateway, general web search
and GitHub code or repository search. Representative queries included
`GitHub open research knowledge base static site Zenodo`, `research compendium
GitHub reproducible`, `open peer review reproduction GitHub`, `research
software FAIR version provenance`, `Markdown translation Weblate po4a` and
`scientific publication responsive reading layout`. Results were followed to
the project repository, full paper or issuing body's documentation. References
inside those sources supplied additional candidates. The maintainer also
supplied Real World Data Science as a lead; it entered through the same
selection rule rather than by preference.

A source entered the matrix when it exposed at least one relevant boundary in
enough detail to inspect the maintained files, workflow, review record,
publication record or specification. The pass favoured current primary and
official sources, then selected close working examples rather than popularity
lists. It excluded vendor comparisons, search summaries, generic portfolios,
uninspectable workflows and claims that a tool alone guarantees reproducible
research. Selected repository-file observations use the commit hashes above;
versioned specifications were used where available. Live service documents,
publication records and rendered pages remain dated observations.

## Executive finding

Among the projects inspected, the closest operational analogue is the
[IBEX Imaging Knowledge-Base](https://github.com/IBEXImagingCommunity/ibex_imaging_knowledge_base).
It maintains human- and machine-readable source data, bibliography and Markdown
in Git; validates contributions; generates a static site; asks subject-matter
experts to review contributions; uses Discussions for community questions; and
publishes versioned archival snapshots through Zenodo. Its
[eLife research article](https://doi.org/10.7554/eLife.105737.3) describes the
same three surfaces: a GitHub development platform, a generated website and an
archive.

The wider comparison supports one recurring structure:

```text
reviewed Git source
  ├─ generated reading surfaces: Pages, book, PDF, translated HTML
  ├─ versioned execution surfaces: binaries and OCI images by digest
  ├─ preservation surfaces: source archive, metadata and selected receipts
  └─ feedback surfaces: issues, reviews, rerun reports and discussion
                │
                └──── accepted change returns to reviewed Git source
```

These surfaces are linked but do not have equal authority. A website is a
reader. A container is an execution snapshot. An archive is a preservation
record. An issue is a proposed correction or coordination record. None becomes
maintained research merely by existing. This distinction supplies the desired
“write once, derive the rest” workflow without pretending every artefact can be
collapsed into one file.

## Evidence matrix

| Source | Direct observation or supported statement | Usable pattern | Boundary retained |
| --- | --- | --- | --- |
| [IBEX repository](https://github.com/IBEXImagingCommunity/ibex_imaging_knowledge_base), [workflow](https://github.com/IBEXImagingCommunity/ibex_imaging_knowledge_base/blob/0b1d03e4973bb6f064d4c34d23aa5d26cac5777d/.github/workflows/main.yml) and [eLife article](https://doi.org/10.7554/eLife.105737.3) | CSV, BibTeX, images and Markdown feed a validated static knowledge base. Contributions receive automated checks and domain review. Discussions hold questions; Zenodo holds versioned authoritative archives. | Typed editable sources, source validation, expert review, generated public pages, discussion and an archive can form one research workflow. | IBEX commits some generated pages and depends on generator code held elsewhere. Those choices are not needed here and would weaken the one-authority boundary. |
| [The Turing Way repository](https://github.com/the-turing-way/the-turing-way/tree/304ba8d34aef19ab83219183a3510a434704d194), [book configuration](https://github.com/the-turing-way/the-turing-way/blob/304ba8d34aef19ab83219183a3510a434704d194/book/website/myst.yml) and [CI](https://github.com/the-turing-way/the-turing-way/blob/304ba8d34aef19ab83219183a3510a434704d194/.github/workflows/ci.yml) | Canonical MyST Markdown, an explicit contents tree and bibliography build into a handbook. CI checks references and links. Contribution forms separate bugs, chapters, edits and translation work. | Keep a generated hierarchy, small reviewed changes, direct source links and typed contribution routes. | Its Crowdin deployment remains work in progress and its translation guidance includes separate repositories. That is governance experience, not a turnkey design. |
| [JOSS submission guidance](https://joss.readthedocs.io/en/latest/submitting.html) and [paper 10321](https://joss.theoj.org/papers/10.21105/joss.10321) | A short paper lives with software, public review occurs in an issue, and accepted work requires a tagged release and archive. The paper record exposes source, review, PDF, archive, citation, dates, editor and reviewers. | A released research object should expose a compact source, review, release, archive and citation tuple. | This repository must not imply JOSS review or create a second review repository merely to resemble a journal. |
| [ReScience C review process](https://rescience.github.io/edit/) and [publication index](https://rescience.github.io/read/) | Reviewers clone and rerun an author repository. Published records expose paper, code, review, citation and preservation identities. ReScience C accepts carefully reviewed reports of replication failures. | Rerun reports need an exact environment, command and observed divergence. “Maintainer tested” and “independently reproduced” are different states. | ReScience uses separate publication, review and author-code repositories. Its transparency transfers; its authority topology need not. |
| [Research-compendium paper](https://doi.org/10.1080/00031305.2017.1375986) | The paper defines a research compendium by a recognisable community structure, explicit separation and relationships among input data, methods and outputs, and a specified computational environment. It treats outputs as disposable and regenerable. | Classify inputs, maintained methods and derived outputs separately. Make derived output disposable and regenerable. | A familiar directory tree or container is not evidence that a scientific result reproduces. |
| [FAIR4RS 1.0](https://doi.org/10.15497/RDA00068) | FAIR4RS calls for distinct identifiers for software versions and rich metadata that explicitly includes the software identifier. It also calls for a clear licence, detailed provenance and qualified references. | Give the source release, experiment record, image digest and archive record distinct, cross-linked identities. | A Git tag or mutable image tag alone is neither rich metadata nor durable preservation. |
| [RO-Crate 1.3](https://www.researchobject.org/ro-crate/specification/1.3/introduction.html), [Workflow Run RO-Crate](https://www.researchobject.org/workflow-run-crate/), its [peer-reviewed description](https://doi.org/10.1371/journal.pone.0309210) and the inspected [release procedure](https://github.com/ResearchObject/ro-crate/blob/bcb246066bddbe0b3c271db18aaf290168b8ee63/RELEASE_PROCEDURE.md) | JSON-LD metadata relates files, people, tools, licences and provenance. Workflow Run profiles capture execution inputs, outputs, code and run provenance at different detail levels. | Keep present manifests compatible with a later RO-Crate export instead of inventing another provenance store. | Full adoption now would add machinery before a concrete exchange consumer exists. The documented upstream release procedure contains manual copying that this repository should not repeat. |
| [GitHub Pages custom-workflow guidance](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages) | GitHub's documented build-and-deploy example checks out source, builds it, uploads a Pages artifact and deploys that artifact. | Build Pages from canonical source and publish the ephemeral artifact. | Do not make a generated `gh-pages` branch or built directory a content authority. |
| [OCI 1.1.1 annotations](https://github.com/opencontainers/image-spec/blob/v1.1.1/annotations.md), [distribution specification 1.1.1](https://github.com/opencontainers/distribution-spec/blob/v1.1.1/spec.md), [GHCR guidance](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry), [GHCR visibility guidance](https://docs.github.com/en/packages/learn-github-packages/configuring-a-packages-access-control-and-visibility), [GitHub immutable releases](https://docs.github.com/en/code-security/concepts/supply-chain-security/immutable-releases) and [GitHub attestations](https://docs.github.com/en/actions/how-tos/secure-your-work/use-artifact-attestations/use-artifact-attestations) | OCI supplies source, revision, version, licence and documentation annotations. A descriptor digest is a content identifier; a tag is a custom human-readable pointer to a manifest. GitHub Actions can generate build-provenance attestations for binaries and container images. A newly published personal-account package is private by default, and making it public is irreversible. An immutable GitHub Release locks its published tag and assets; GitHub recommends attaching and checking assets while the release remains a draft. | Test and report content-addressed `image@sha256:…` identities; keep semantic tags as convenience pointers; attach SBOM and source-bound provenance. Prove the documented public-user path with an anonymous digest pull rather than inferring access from an authenticated publisher or a linked public repository. Assemble and verify release assets before publishing the immutable release. | GHCR distributes images but is not by itself a preservation archive. A verified attestation supports a cryptographically signed claim that binds a subject digest to recorded build context; it does not establish scientific validity. Package visibility and the pre-publication draft remain mutable service state until directly checked. Immutable-release enforcement applies only to future releases after it is enabled. |
| [Chrome for Testing](https://developer.chrome.com/docs/automation-and-testing/chrome-for-testing) and the [Puppeteer 25.9.0 Docker guidance](https://pptr.dev/guides/docker) | Chrome for Testing supplies non-auto-updating, versioned browser binaries for repeatable automation. Puppeteer's versioned image includes Chrome dependencies and a font environment, documents the need for an init process, and offers its Dockerfile as a base for a different image. | Bind the browser archive and executable hashes, complete environment image digest, Node image digest and platform in one renderer lock. Build and execute the exact resulting image ID, then record the renderer identity with the PDF. | A browser version alone does not pin host libraries or fallback fonts. A container tag alone is mutable. Puppeteer's documented sandbox-mode invocation adds `SYS_ADMIN`; this project instead keeps the already isolated renderer unsandboxed inside a capability-dropped, offline container and does not generalise that choice to untrusted browsing. |
| [Weblate 2026.8.1 continuous localisation](https://docs.weblate.org/en/weblate-2026.8.1/admin/continuous.html#protected-branches), [review workflow](https://docs.weblate.org/en/weblate-2026.8.1/workflows.html#dedicated-reviewers), [native Markdown format](https://docs.weblate.org/en/weblate-2026.8.1/formats/markdown.html), [gettext support](https://docs.weblate.org/en/weblate-2026.8.1/formats/gettext.html) and [po4a 0.74](https://github.com/mquinson/po4a/tree/v0.74) | Weblate can route changes through pull requests to a protected branch and assign translation and review to different roles. po4a 0.74's Text parser can extract Markdown into PO, invoke gettext merging after source changes, and regenerate translated documents. A partially changed unit may be fuzzily matched and marked for human revision; a new or heavily changed unit remains untranslated. | Git-backed PO plus a reviewer workflow can provide a usable translator interface without publishing raw machine output. | Weblate's native Markdown format is under development, cannot reliably import translated-file edits, and declares Weblate the translation source of truth, so it conflicts with this repository's Git-only authority. A pilot should instead use Git-tracked PO with po4a 0.74's stable Text/markdown parser. The CommonMark parser is not present in stable 0.74 and must not be presented as the pilot basis. Because po4a can emit source-language text for untranslated paragraphs, publication must reject every fuzzy or untranslated unit. |
| [Real World Data Science](https://realworlddatascience.net/), its [source at the inspected commit](https://github.com/realworlddatascience/realworlddatascience.github.io/tree/3e0a17dfc10cc38de31da6440fe46e3d60938445), [example article](https://realworlddatascience.net/foundation-frontiers/posts/2026/08/18/hidden-statistics-credit-risk.html), [contributor guidance](https://realworlddatascience.net/contributor-docs/contributor-guidelines.html) and [style guide](https://realworlddatascience.net/contributor-docs/style-guide.html) | Quarto source publishes title, subtitle, authors, affiliations, date, contents, citations, labelled figures, code/data, licence, citation, AI disclosure and direct edit/report routes. The example leads with a practitioner decision, defines terms in plain English, and moves a notation-heavy derivation into an optional technical note. Guidance asks authors to name their audience, accessibility needs and essential takeaways; editorial and author sign-off precede publication. | Lead with the concrete question and current answer, explain specialist terms before formal detail, and keep provenance and correction controls next to the article rather than in a site dashboard. | Editorial review is not independent peer review. Its current workflow uses floating Actions, write permission in the build job and a generated `gh-pages` branch; those deployment choices conflict with this repository's fail-closed source boundary. Email and office-document review also remain external authorities unless their accepted changes return to Git. |
| [W3C visual presentation](https://www.w3.org/WAI/WCAG22/Understanding/visual-presentation.html), [reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html), [text spacing](https://www.w3.org/WAI/WCAG22/Understanding/text-spacing.html), [Quarto layout](https://quarto.org/docs/output-formats/page-layout.html) and [Distill layout source](https://github.com/distillpub/template/blob/master/src/styles/styles-layout.css) | The sources support bounded readable lines, reflow, user spacing, a dominant article column, separate margin regions and wider figures. Distill also records the maintenance cost of bespoke interactive editorial work in its [hiatus account](https://distill.pub/2021/distill-hiatus/). | Keep prose below an 80-character practical ceiling, collapse rails before they squeeze text, and let research media use a wider local region with static fallbacks. | WCAG 1.4.8 is AAA guidance, not a claim that one `ch` value guarantees conformance. Visual analogy is not reader-comprehension evidence. |

A [version-two arXiv preprint](https://arxiv.org/abs/2408.09344v2) proposes
issues and projects for planning, version control for documents and analyses,
and containerised environments. It is a worked method and template, not a
controlled demonstration that GitHub improves every laboratory or resolves
preservation, confidentiality or access constraints.

## Deduplication against the repository

Most of the external pattern already has one owner here. The audit therefore
does not justify a new generator or parallel research store.

| External pattern | Existing owner | Residual work |
| --- | --- | --- |
| Canonical editable source and disposable pages | [Decision 0036](../../decisions/0036-use-one-source-to-publication-and-feedback-graph.md) and the [publication workflow](../../docs/publication-workflow.md) | Keep generated Pages, PDF and translated readers out of authority; test every source-to-output edge. |
| Public research object with visible source and correction path | [Decision 0039](../../decisions/0039-make-pages-a-research-publication-surface.md) and typed issue forms | Add research-object metadata at document and experiment boundaries without turning the landing page back into a dashboard. |
| Digest-bound experiment distribution | workstation manifests, Go release plan and release workflow | Keep the anonymous exact-digest pull as the public-access gate. Make release records expose exact invocation, resource limits, receipt schema and final digests. Compare per-experiment images with compatible-runtime-family images empirically before changing the current rule. |
| Human-reviewed translation | [Decision 0035](../../decisions/0035-publish-only-reviewed-source-bound-translations.md) and `translations/manifest.json` | Choose a German language lead, glossary and authoring interface. A Weblate or po4a pilot must still produce reviewed Git changes. |
| Discussion and actionable correction | issue forms and [how to help](../../docs/how-to-help.md) | The short [“experiment did not run” route](https://github.com/cordanaLLM/20-watts-was-enough/issues/new?template=experiment-run-failure.yml) now covers immediate execution failures. Decide whether public Discussions has an owner and moderation policy. |
| Durable archival identity | GitHub Releases, CFF and release attestations | Decide whether to connect a specific approved release to Zenodo or Software Heritage. Do not claim an archive before remote identity and licensing are checked. |
| Run provenance interchange | execution receipts and manifests | Map one mature receipt to Workflow Run RO-Crate only when a consumer or archive requires it. |

## Container release boundary

The external evidence supports containers as distribution and environment
records, not as scientific results. The minimum public experiment record should
derive, rather than repeat by hand:

- source tag and commit;
- image name, requested platform and content-addressed top-level manifest or
  index digest; for a multi-platform index, also the resolved platform-manifest
  digest;
- experiment, fixture, configuration, data and model identities or hashes;
- runtime and hardware assumptions;
- bounded command, timeout, queue, retry, output and resource limits;
- seed policy, expected outputs and receipt schema;
- result authority and known limitations;
- licence, SBOM, provenance and archive identities; and
- maintainer-test, external-rerun and independent-reproduction states.

Hypothesis A is that per-experiment images make identity, review and dependency
or permission scope clearer. Hypothesis B is that runtime-family images reduce
duplicated layers and release work. Retain the current scoped-image rule through
`v0.3.0`; measure pulled bytes, unique compressed bytes, build time, cold-start
time, rebuild fan-out, vulnerability fan-out and reviewer clarity before
consolidating. Accelerator or runtime, native-library, redistribution and
privilege differences are candidate split criteria; incompatible licensing or
privilege boundaries must not be collapsed.

A statically linked Linux Go runner with no undeclared runtime files can use a
[`scratch` image](https://docs.docker.com/build/building/base-images/). Publish
and test each [declared OCI operating-system and architecture
variant](https://docs.docker.com/build/building/multi-platform/); containers
still share host-kernel and device interfaces.

## Reviewed multilingual boundary

The present rejection of runtime Google translation is supported. Research
prose depends on negation, evidence status, scope, equations and domain terms;
a fluent output is not necessarily a faithful one.

A bounded German pilot should use this path:

1. freeze one canonical source revision and choose one short, high-value
   document;
2. appoint a German language lead with enough domain context to review its
   qualifications;
3. maintain a glossary and a do-not-translate list for IDs, equations, code,
   units, citations and anchors;
4. let a human or disclosed machine system draft suggestions;
5. review the complete document in context rather than approve isolated fluent
   strings;
6. commit the accepted translation and exact source/target digests through a
   pull request; and
7. bind the accepted text to its exact source and target digests through the
   existing fail-closed manifest gate.

Before displaying richer review metadata publicly, extend the durable record
to cover the reviewed document, source commit as a locator, review date and
machine assistance. The current schema records routes, paths, exact digests and
reviewer names, but not all of those proposed fields.

Compare manually reviewed mirrored Markdown with a pinned po4a 0.74 PO lane
for exactly `concept/00-thesis-and-principles.md`. PO persists translation
units, references or context and fuzzy state; Weblate or PO editors may add
glossary and translation-memory interfaces. In the PO lane, PO is the one
maintained translation derivative and German Markdown is deterministic output.
Adopting this authority change requires updating Decision 0035 and the manifest
schema together. Weblate may sit only over Git-tracked PO, after access,
privacy, backup and service-ownership decisions.

The pilot must reject every fuzzy or untranslated unit, regenerate byte-
identical output, and probe qualifier or negation changes, moved and new
paragraphs, anchors, links, mathematics and Mermaid. It should record missed
semantic changes, false-stale work, structural damage, review time and
translator usability. This would test an engineering workflow, not establish
that the German prose improved. Weblate pull-request review does not establish
German-language competence, and its internal approval history is not a
substitute for durable Git review evidence. A glossary can improve consistency
but cannot resolve sentence-level context, register, qualifiers or negation;
full-document German review remains mandatory. The
[Rat für deutsche Rechtschreibung's 2024 rules](https://www.rechtschreibrat.com/regeln-und-woerterverzeichnis/)
provide the orthographic reference. [IATE](https://iate.europa.eu/) supplies
official EU terminology leads, not automatic project terminology decisions.

## Research-publication layout boundary

Research grade is conveyed by recoverable meaning, provenance and review—not by
looking like a journal. A safe house structure is:

1. title, output type, the concrete question, plain-language answer and
   epistemic status;
2. version or commit, date, contributors, citation, disclosure and licence;
3. terms explained before their symbols, followed by the maintained argument
   in a `68ch` reading column;
4. optional derivations beside, not in front of, the relation a reader needs;
5. figures, tables, mathematics and code in wider local regions with captions,
   units, sources and static fallbacks;
6. limitations, contrary evidence and reproduction boundary; and
7. source, history, report, rerun, archive and contribution routes.

Body defaults around `17–18px` and `1.6–1.7` line height are starting values,
not universal thresholds. The interface must also survive narrow reflow, zoom,
user text-spacing overrides, keyboard traversal, fallback fonts and print. A
rendered browser check can detect regressions; only representative reader and
accessibility evaluation can support comprehension or conformance claims.

## Feedback routes

The comparison supports different intake contracts for different work:

| Reader intent | Route and required identity |
| --- | --- |
| Ask how to interpret an idea | moderated Discussion, if enabled; otherwise a support issue that names the page and anchor |
| Report unclear prose, citation, layout or translation | typed issue with canonical path, anchor, viewed commit or release, interpretation and expected correction |
| Report “I tried this and it did not run” | [short failed-run form](https://github.com/cordanaLLM/20-watts-was-enough/issues/new?template=experiment-run-failure.yml) with experiment/ref, optional digest or tag, platform, exact command and the shortest relevant failure excerpt |
| Submit a complete rerun | structured report with image digest, source, platform, command, config, seed, receipt or log hash, expected and observed outcome, and disclosure |
| Challenge evidence or a claim | claim ID, primary-source locator, applicability, contrary evidence and licence |
| Report security, misuse or research-integrity concern | private route rather than a public issue |

An issue or discussion is an input. Acceptance requires a reviewed change to
the relevant authority file. An external rerun earns a recorded reproduction
state only after its identity and evidence are checked; a comment count is not
replication.

## Decisions and tests

The publication-artifact choices are recorded in
[Decision 0040](../../decisions/0040-bind-publications-to-reproducible-and-public-artifacts.md).
The evidence is sufficient to continue without choosing every service:

- keep Git `main` as the only maintained source and keep generated readers out
  of Git authority;
- ship experiment images by immutable digest with source identity, SBOM,
  provenance and `NO_RESULT` where applicable;
- require an anonymous pull of every final image digest before publishing its
  GitHub Release;
- bind the PDF to one digest-locked renderer identity and refuse different
  bytes under an existing release tag;
- expose separate maintainer-tested, external-rerun and independently-
  reproduced states;
- publish only human-reviewed German; treat machine output as disclosed draft
  material; and
- keep the research-object hierarchy and correction path visible on Pages.

Current translation policy is fail-closed: any English content change
invalidates `sourceSha256` and prevents publication until the translation is
reviewed again or its manifest entry is removed. A stale-banner mode would
require an explicit decision superseding Decision 0035.

Two service or policy decisions remain open:

1. **Archive depth:** archive source, manifests and receipts for every release,
   then reserve complete OCI-layout archives for landmark claim-eligible
   releases; or fund full-image preservation more broadly.
2. **Discussion ownership:** enable public Discussions only after a named
   moderation owner, response expectation, category set and conduct/escalation
   path exist.

The infrastructure direction fails if a contributor must change the same fact
in several maintained files, a generated artefact can drift without a failing
gate, a tag or friendly image name is treated as immutable identity, a machine
translation publishes without accountable review, or a reader cannot find the
source and correct feedback route for the object in front of them.
