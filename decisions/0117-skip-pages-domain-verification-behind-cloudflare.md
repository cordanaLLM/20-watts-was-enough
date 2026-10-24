# 0117 — Skip Pages domain verification behind Cloudflare

- **Status:** accepted
- **Date:** 2026-10-24
- **Partly supersedes:** [0083](0083-transfer-the-repository-to-cordanallm.md)
  post-transfer step 3, only where it asks to verify cordana.dev under the
  organisation
- **Related:**
  [0047](0047-keep-cloudflare-as-the-public-pages-tls-authority.md),
  [0085](0085-keep-the-live-main-ruleset-across-the-transfer.md)
- **Authority:** repository host-settings record; no change to research
  authority, claim status or acceptance criteria

## Context

[Issue 357](https://github.com/cordanaLLM/20-watts-was-enough/issues/357)
(opened 2026-10-24) asked to verify `cordana.dev` for the
`cordanaLLM` GitHub organisation and enforce Pages HTTPS, or record why the
front proxy makes both unnecessary.

Post-transfer step 3 of
[decision 0083](0083-transfer-the-repository-to-cordanallm.md) asked to verify
`cordana.dev` under the organisation and enable Pages with the Actions source.
When [decision 0085](0085-keep-the-live-main-ruleset-across-the-transfer.md)
audited the transfer, it confirmed Pages was enabled with `build_type`
`workflow` and `cname` `www.cordana.dev`, but observed that domain
verification was not visible via the API and kept "verify cordana.dev as an
organization domain in the GitHub settings UI" on its list of open
maintainer actions.

Live reads on 2026-10-24 confirmed the transport and Pages configuration:

- `curl -sI https://www.cordana.dev/` returned HTTP/2 200 with
  `server: cloudflare` and a `cf-ray` header present;
- `curl -sI http://www.cordana.dev/` returned HTTP 301 redirecting to
  `Location: https://www.cordana.dev/` with `Server: cloudflare`;
- `gh api repos/cordanaLLM/20-watts-was-enough/pages` reported
  `cname` `www.cordana.dev`, `https_enforced` `false`, and
  `https_certificate` `null`; and
- `gh api orgs/cordanaLLM/pages/domains` returned HTTP 404, confirming the
  domain is not verified for the organisation.

HTTPS enforcement requires no new decision.
[Decision 0047](0047-keep-cloudflare-as-the-public-pages-tls-authority.md)
already establishes Cloudflare edge TLS and Always Use HTTPS as the public
transport authority, notes that GitHub's `https_enforced` flag is not the
public HTTPS control, and binds the probe contract in
[`.github/public-transport.json`](../.github/public-transport.json) where a
post-deployment check enforces it.

## Decision

The maintainer decided on 2026-10-24 not to verify the domain for the
organisation, not to add a DNS TXT verification record, and not to enforce
Pages HTTPS, because TLS terminates at Cloudflare.

Cloudflare does not take over what verification would protect; the residual
risk below stays open by choice. This record closes the open maintainer action
recorded in
[decision 0085](0085-keep-the-live-main-ruleset-across-the-transfer.md).

## Consequences

No DNS TXT record or GitHub organisation domain entry is created, and Pages
settings remain unchanged. Public traffic continues to terminate TLS at
Cloudflare under the contract enforced by
[decision 0047](0047-keep-cloudflare-as-the-public-pages-tls-authority.md).

A residual risk remains: GitHub organisation domain verification is what stops
another GitHub Pages site from claiming `www.cordana.dev` if this repository's
Pages custom domain is removed or Pages is disabled while DNS still points at
GitHub; the Cloudflare proxy does not change GitHub's host routing to the
origin. Without verification this protection is absent. The mitigation is to
remove or repoint the DNS record before disabling Pages or dropping the custom
domain.

## Supersession

Revisit this record if the site leaves the Cloudflare proxy (triggering the
supersession conditions of
[decision 0047](0047-keep-cloudflare-as-the-public-pages-tls-authority.md)),
Pages is disabled or the custom domain changes, or GitHub requires
verification.

Gemini 3.8 Flash drafted this record from facts gathered by Claude Code, which
ran the reads and reviewed the draft under maintainer direction; engineering
record, no scientific claim, experiment or acceptance criterion changes.
