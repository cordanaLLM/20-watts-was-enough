# How to help

The project needs bounded corrections, reviews and test reports more than broad
offers to “help with anything”. Choose one workstream below, name the exact
source or artifact you will touch, and define what would make the contribution
finished. An issue coordinates the work; the accepted authority remains the
reviewed file on Git `main`.

Difficulty here means how much project context the task requires. It is not a
status barrier. A new reader who can identify the sentence where an argument
became opaque may provide more useful evidence than a large rewrite.

The [research roadmap](../concept/90-research-roadmap.md) defines six
dependency stages. The [GitHub milestone view](https://github.com/cordanaLLM/20-watts-was-enough/milestones)
shows the issues and pull requests currently attached to each stage. Use it to
see what is next and what has closed, but read a closed issue only as completed
work: evidence status changes through the claim ledger and qualifying result
path, not through the milestone percentage.

## Choose live work before opening another issue

The workstream forms below are for a new, reproducible gap. To continue work
that is already bounded, start with the live queues:

- [good first issues](https://github.com/cordanaLLM/20-watts-was-enough/issues?q=is%3Aissue%20state%3Aopen%20label%3Agood-first-issue) need relatively little project context;
- [help-wanted issues](https://github.com/cordanaLLM/20-watts-was-enough/issues?q=is%3Aissue%20state%3Aopen%20label%3Ahelp-wanted) already name a contribution boundary and acceptance conditions; and
- [all open issues](https://github.com/cordanaLLM/20-watts-was-enough/issues?q=is%3Aissue%20state%3Aopen) show blocked decisions and work already in progress.

Claim the smallest suitable issue with a comment before doing substantial
work. If its evidence, authority boundary, or completion condition is unclear,
ask there instead of opening a parallel task.

## Current workstreams

| Workstream | Useful first contribution | Entry context | Authority boundary | Start here |
| --- | --- | --- | --- | --- |
| Readability and Pages | Name one broken route, inaccessible control, dense passage or missing definition and explain where your interpretation diverged | Low; no local setup required for a report | Presentation may change; evidence status and scientific meaning may not | [Site or documentation form](https://github.com/cordanaLLM/20-watts-was-enough/issues/new?template=site-documentation-problem.yml) |
| Reviewed translation | Review one source-bound document, settle domain terminology, or correct a stale translation | Medium; fluent target-language review and enough domain context to check qualifications | English Git source remains canonical; machine output alone is not publishable | [Translation form](https://github.com/cordanaLLM/20-watts-was-enough/issues/new?template=translation-problem.yml) |
| Release-image testing | After a passing v0.3.0 or later release publishes Fixture 007 and Fixture 019, run one on a Linux `amd64` host and report a minimal reproducible runtime, mount or receipt defect | Low to medium; Docker and the [image instructions](../experiments/workstation/README.md#run-a-released-experiment-image) | A passing container run remains `NO_RESULT`; it is not confirmation or an energy result | [Short failed-run form](https://github.com/cordanaLLM/20-watts-was-enough/issues/new?template=experiment-run-failure.yml) |
| Experiment contracts and runners | Close one named protocol ambiguity, failure path, bound, comparator or test gap | High; read the fixture, linked claims, manifest and nearest `AGENTS.md` | Development and confirmation identities stay disjoint; the manifest and claim ledger control readiness | [Experiment form](https://github.com/cordanaLLM/20-watts-was-enough/issues/new?template=experiment-protocol-problem.yml) |
| Evidence correction | Check one claim against a primary or authoritative source and state the exact supported scope | Medium to high; source and methods literacy in the affected field | Sources support only what they tested; citation does not grant redistribution rights | [Evidence correction form](https://github.com/cordanaLLM/20-watts-was-enough/issues/new?template=evidence-correction.yml) |
| Mechanism proposal | Describe one causal mechanism, map its nearest `P-` bundles, and define the strongest ordinary null and rejecting test | High; cross-domain comparison and experimental design | An analogy or issue does not create a principle or promote a claim | [Mechanism proposal form](https://github.com/cordanaLLM/20-watts-was-enough/issues/new?template=mechanism-principle-proposal.yml) |
| Go, validation and release tooling | Fix one reproducible defect, remove one duplicate path, or add one bounded failure test | Medium to high; Go 1.27 and the affected policy or workflow contract | Generated output is not edited by hand; releases and settings are not claimed from local tests | [Repository or tooling form](https://github.com/cordanaLLM/20-watts-was-enough/issues/new?template=repository-tooling-problem.yml) |
| Security | Report a vulnerability with the smallest safe private reproduction | Any; do not investigate beyond systems and data you are authorised to test | Exploitable details, credentials and personal data never enter a public issue | [Private vulnerability report](https://github.com/cordanaLLM/20-watts-was-enough/security/advisories/new) |

The detailed routing rules, including research-integrity concerns that must not
be posted publicly, are in [`SUPPORT.md`](../SUPPORT.md). Check existing issues
before opening another coordination record.

## Keep the task bounded

Before starting a pull request:

1. name one source path, stable claim or principle ID, fixture, route, command,
   image digest or release tag;
2. state the observed problem and the condition that would close it;
3. identify the authority you must preserve, including any `NO_RESULT`, source
   digest, licensing, privacy or confirmation boundary;
4. list the smallest focused checks that can falsify your change; and
5. leave unrelated prose, generated files and workstation evidence untouched.

Coordinate first when work would create a new `P-` principle, alter a
confirmation or held-out boundary, add normative or legal conclusions, import
third-party bodies, publish a new experiment image, or involve people, private
data, funding, donated compute or institutional obligations. Those changes can
activate the collaboration, disclosure, rights, ethics or decision requirements
in the [research-integrity baseline](../research/research-integrity-baseline.md)
and [engineering and research contract](principles.md).

## Evidence to attach

| Contribution | Minimum review evidence | Focused checks before a pull request |
| --- | --- | --- |
| Readability or documentation | Exact path or URL, intended reader, shortest affected passage and the interpretation that failed | `npm run check:prose`; `npm run validate:docs` |
| Translation | Language, exact canonical and translated paths, exact source commit and digest, exact reviewed target digest, canonical UTC review instant, named language/domain reviewer, and disclosed drafting tools | `npm run validate:translations`; `npm run check:prose` for any changed English source |
| Container report | Per-experiment image digest, tag, source revision, `linux/amd64`, exact command, output mount and `NO_RESULT` receipt | Run the image's smoke, analysis and validation actions with networking disabled |
| Experiment change | Fixture/track and claim IDs, frozen inputs, bounds, controls, failure state, output identity and authority impact | `npm run validate:workstation`; the affected fixture tests |
| Evidence or mechanism change | Primary locators, proposition actually supported, scope, uncertainty, nearest claim and principle IDs, strongest null | Documentation, coverage and taxonomy validators relevant to the changed authority |
| Go or repository tooling | Reproduction, trust boundary, resource limits, expected failure behaviour and dependency identity | `go -C tooling test ./...`; the affected policy or release test |
| Pages change | Route, viewport/browser context, keyboard or rendering reproduction, and before/after evidence | `npm run test:github-pages` |

These are focused development checks, not the merge floor. Follow
[`CONTRIBUTING.md`](../CONTRIBUTING.md), run `npm run check` before submission,
and add the book generation and validation commands when a book source changes.

## What a useful container report looks like

A released image that did not start or finish belongs in the
[short failed-run form](https://github.com/cordanaLLM/20-watts-was-enough/issues/new?template=experiment-run-failure.yml).
It asks only for the experiment, image identity, platform, command and smallest
useful error excerpt. Use the full experiment form when the problem concerns a
protocol, analysis, evidence status or authority boundary.

A container report can be valuable even when the diagnostic passes. Once a
qualifying release publishes the images, download its checksum-bound and
attested `oci-images.json` asset and copy the complete `image@sha256:...`
identity from there rather than resolving a mutable tag. Release notes are a
convenience display, not the identity authority. Different hosts can expose
permissions, mount, architecture, runtime and error-reporting problems.
Include only the bounded evidence needed to reproduce the behaviour:

```text
artifact: fixture-007
image: ghcr.io/cordanallm/20-watts-was-enough-fixture-007@sha256:...
release tag: vX.Y.Z
platform: linux/amd64
command: docker run ...
output volume: 20w-fixture-007-vX-Y-Z-run-001:/results/smoke
receipt: smoke/run.json (claim_eligible=false, scientific_result=false; NO_RESULT)
execution receipt: release-image; explicit sha256 digest; source revision; linux/amd64; smoke/smoke
observed: ...
expected: ...
```

Do not upload private seed material, credentials, personal data or copyrighted
source bodies. A report about a smoke harness can improve the harness; it
cannot turn its output into scientific evidence.
