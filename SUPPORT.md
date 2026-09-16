# Support and issue routing

This is a public research and development repository, not a supported product
or professional advisory service. The routes below keep evidence corrections,
scientific proposals, experiment defects, presentation bugs, and confidential
security reports from being mixed together.

## Choose the matching route

### Evidence or claim correction

Use the
[evidence or claim correction form](https://github.com/cordanaLLM/20-watts-was-enough/issues/new?template=evidence-correction.yml)
when a source does not support a statement, scope or certainty is overstated,
an evidence status is wrong, provenance is incomplete, or units, derivation,
uncertainty, or system boundary are incorrect. Give stable `C-` IDs and primary
sources where possible. Do not paste third-party papers.

### Research-integrity concern

Use the evidence-correction route for an impersonal error in a claim, method,
source, contributor record, disclosure, or research artifact. Do not place an
allegation about a person, confidential record, personal data, or information
that could enable retaliation in a public issue. If no suitable confidential
channel is available, notify [`@lusoris`](https://github.com/lusoris) only that
one is required and include no details publicly.

Handling follows the
[`research integrity baseline`](research/research-integrity-baseline.md). The
project currently has one maintainer and no standing independent investigator;
it therefore does not claim independent adjudication. A matter involving the
maintainer requires a qualified, conflict-free external person before the
project can reach such an outcome. Use the private vulnerability route only
when the report also contains a security vulnerability or exploitable detail.

### Scientific disagreement or mechanism proposal

If the disagreement identifies an error in an existing claim, use the evidence
correction form above. To propose a new transferable mechanism, principle
bundle, or AI translation, use the
[mechanism or principle proposal form](https://github.com/cordanaLLM/20-watts-was-enough/issues/new?template=mechanism-principle-proposal.yml).
It asks for the source observation, normalized mechanism, nearest existing
`P-` bundles, strongest ordinary null, and a rejecting test. Broad questions
and ideas should first be narrowed to a falsifiable mechanism, correction, or
concrete repository change; this repository does not currently operate a
general discussion forum.

### Experiment or protocol problem

If a released experiment command or container did not start or complete, use
the [short failed-run form](https://github.com/cordanaLLM/20-watts-was-enough/issues/new?template=experiment-run-failure.yml).
It asks for the experiment and source ref, image digest or tag when available,
platform, exact command and shortest relevant error excerpt. Redact private
values before consenting to publish the remaining command and log text.

Use the
[experiment or protocol problem form](https://github.com/cordanaLLM/20-watts-was-enough/issues/new?template=experiment-protocol-problem.yml)
for ambiguous comparisons, runner defects, invalid status or authority,
resource-accounting errors, statistical problems, reproducibility failures, or
unsafe isolation and cleanup. Include the artifact, fixture, track, claim, run,
and exact command or protocol clause. For a released image, include its exact
digest, source revision, architecture, command, mounted output path, and
`NO_RESULT` receipt. State which authority tier is affected; do not promote
smoke or development output to a result.

### Site or documentation bug

Use the
[site or documentation problem form](https://github.com/cordanaLLM/20-watts-was-enough/issues/new?template=site-documentation-problem.yml)
for missing or unreadable content, broken navigation, inaccessible controls,
stale generated artifacts, or incorrectly rendered equations, tables, plots,
diagrams, HTML, or PDF. Use the evidence form instead when the presentation is
readable but the scientific statement is wrong.

### Translation contribution or problem

Use the
[translation contribution or problem form](https://github.com/cordanaLLM/20-watts-was-enough/issues/new?template=translation-problem.yml)
to start or coordinate a translation, volunteer domain-language review, report
an inaccurate passage, or update a translation after its canonical source
changed. Include the target language, canonical path, exact commit or release,
and any machine drafting tool used. Use the evidence form as well if the English
canonical claim is itself wrong.

### Repository or tooling problem

Use the
[repository or tooling problem form](https://github.com/cordanaLLM/20-watts-was-enough/issues/new?template=repository-tooling-problem.yml)
for defects in continuous integration, validation, release automation,
repository policy, dependency tooling, contribution workflows, or local
development commands. Include the exact workflow, check, file, or command and
the smallest safe reproduction. Use the site form for rendered-content
problems and the private security route below for vulnerabilities.

### Security vulnerability

Do not open a public issue. Follow [`SECURITY.md`](SECURITY.md) and use GitHub's
[private vulnerability reporting form](https://github.com/cordanaLLM/20-watts-was-enough/security/advisories/new).
Never attach secrets, private data, credentials, or exploitable details to a
public report.

## What makes a report actionable

Include, as applicable:

- the exact commit, tag, public URL, repository path, claim, principle,
  experiment, fixture, track, or run identifier;
- a minimal reproduction with commands, configuration, platform, browser,
  runtime, and relevant versions;
- expected and observed behavior, including complete relevant error output;
- the affected evidence, result, safety, performance, or energy authority;
- primary sources and the precise scope they support for scientific reports;
  and
- what you already checked or attempted.

Remove access tokens, personal data, private datasets, copyrighted source
bodies, and machine-specific secrets. A maintainer may close or redirect a
report that lacks enough information, duplicates an existing record, asks the
project to redistribute material without a lawful basis, or belongs in another
route.

Contribution requirements and local validation commands are in
[`CONTRIBUTING.md`](CONTRIBUTING.md). No response time, implementation date, or
support window is promised.
