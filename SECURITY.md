# Security policy

## Report a vulnerability privately

Do not disclose exploitable details, secrets, personal data, private datasets,
or machine credentials in a public issue or discussion. Use GitHub's
[private vulnerability reporting form](https://github.com/cordanaLLM/20-watts-was-enough/security/advisories/new).

Private vulnerability reporting was verified as enabled through the GitHub API
on 2026-08-28. This document and the link do not enable the setting by
themselves. If the form is unavailable, do not publish the report; notify
[`@lusoris`](https://github.com/lusoris) publicly only that the private channel
is unavailable, without vulnerability details.

A useful private report identifies the affected commit, route, artifact, or
runner; explains impact and preconditions; gives a minimal safe reproduction;
and removes unrelated personal or confidential material. No public disclosure
date or response-time guarantee is implied.

## Security scope

Security-sensitive surfaces include:

- the canonical repository, package lock, build scripts, GitHub Actions, and
  publication chain;
- the public portal, full-book route, Markdown, Mermaid, mathematics, diagrams,
  and linked repository artifacts;
- dependencies and their transitive browser or build code;
- the downloadable PDF and its generated manifest;
- the closed source-publication boundary and third-party source records;
- workstation manifests, runners, subprocesses, raw outputs, checkpoints, and
  receipts; and
- secrets, personal data, private seed material, licensed datasets, and local
  machine information that could enter logs or artifacts.

## Build and publication chain

Canonical source lives in Git. Generated sites and books must be rebuilt from a
known commit and must not become an independent prose store. Locked dependency
installation, pinned workflow-action identities, validation, and artifact
manifests reduce risk; they are not certification and do not establish that a
host-side protection is active.

Changes to build scripts, workflows, publication allowlists, renderer inputs,
or generated-artifact paths require focused review. Untrusted Markdown, HTML,
URLs, Mermaid input, PDFs, and other imported material must remain sanitized,
inert, sandboxed, allowlisted, or resource-bounded as appropriate to the
consumer.

## Dependencies

Dependencies must be declared and locked. Additions and material upgrades
should document why the dependency is needed, relevant alternatives, licence
compatibility, runtime and bundle impact, and known security concerns. A clean
install or vulnerability scan is useful evidence at a point in time, not a
guarantee that a dependency is safe.

## Downloadable PDF and manifests

The full-book PDF is paired with its public
[`book-manifest.json`](https://www.cordana.dev/downloads/book-manifest.json),
which records the canonical source digest, file size, and PDF SHA-256 digest.
Publication validation must reject a stale source digest or changed PDF bytes.
The manifest verifies identity and freshness; it does not make embedded links
or a reader's PDF software trustworthy.

Repository and workstation manifests are authority-bearing inputs. Consumers
must reject unsupported schemas, unknown authority fields, unsafe paths,
identity mismatches, and missing referenced files rather than guessing.

## Source-publication boundary

[`sources/`](sources/README.md) contains third-party provenance material with
separate rights and is not a general public-website input. Publication uses a
closed, byte-checked allowlist for the limited source records intentionally
made available. Adding a source record to Git does not automatically publish
it, grant redistribution rights, or make it safe to render.

Never commit private correspondence, access tokens, paywalled bodies, personal
data, or material whose redistribution basis is not recorded. Links and the
shortest necessary lawful quotation are preferred when the project lacks reuse
rights.

## Workstation runners and receipts

Workstation runners execute local code, create files, and may launch bounded
subprocesses or physical adapters. Review commands, configuration, paths, data,
and device access before running them. Use an isolated working directory and
least-privilege credentials; do not run untrusted configurations merely because
they satisfy a JSON schema.

Raw records and receipts may expose local paths, hardware identity, environment
details, or input data. Inspect and redact them before public sharing without
altering the canonical evidence used for analysis. A smoke or development
receipt is explicitly `NO_RESULT`; it is neither a security attestation nor
scientific confirmation.

## Secrets and personal data

The public repository, issues, Actions logs, Pages site, PDF, and downloadable
artifacts must contain no secrets. Use local environment or host secret stores
for credentials, and ensure exception messages and subprocess output do not
echo them. Collect personal data only for a documented purpose and lawful
basis, minimize it, define retention and access, and keep it outside public
research artifacts unless publication is lawful and intentional.

If a secret or personal record is exposed, stop further publication, preserve
only the minimum evidence needed for response, rotate or revoke the affected
credential, and report the incident privately. Deleting the latest file does
not remove it from Git history or existing release snapshots.

## Supported state and claims

Security fixes target the current `main` branch. Tags and generated releases
are historical snapshots; no long-term support window is promised. The
existence of this policy, a passing validator, or a GitHub setting does not
claim certification, legal compliance, or freedom from vulnerabilities.
