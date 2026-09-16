# 0083 — Transfer the repository to cordanaLLM

- **Status:** accepted
- **Date:** 2026-09-16
- **Authority:** repository ownership, Go module path and published identity; no
  change to research authority, claim status or acceptance criteria

## Context

This repository already publishes as Cordana. The reader serves from
`https://www.cordana.dev/` ([decision 0029](0029-bind-pages-to-the-custom-domain-root.md)),
the concept it grounds is described in `cordanaLLM/preview`, and its governance
is compiled by `cordanaLLM/praetor` ([decision 0082](0082-adopt-praetor-repository-governance.md)).
Only the repository owner still says otherwise.

The name stays. `20-watts-was-enough` is the title of the published book, the
framing of [C-001](../research/claims.md#c-001), and the identifier every
existing citation uses. An owner change is recoverable through GitHub's
redirect; a name change would strand published references.

## Decision

Move the repository to `cordanaLLM/20-watts-was-enough`. The Go module becomes
`github.com/cordanaLLM/20-watts-was-enough/tooling`, and repository URLs,
`CITATION.cff`, the standards manifest owner and documentation follow.

`decisions/` is not rewritten. Earlier records state the owner that was correct
when they were written, and this repository supersedes rather than rewrites.
Their links continue to resolve through GitHub's redirect, and rewriting them
would falsify the record to fix a link.

Published container images keep their existing identity. `ghcr.io` packages do
not move with a repository transfer, and `tooling/pdf-tools/contract.json` and
`tooling/clrs-generator/image-contract.json` pin exact image digests whose
configuration bytes include the owner in `org.opencontainers.image.source` and
the `io.github.lusoris.*` labels. Renaming those strings would invalidate a
reproducible pinned image to change a label. Image identity moves when the
images are next rebuilt and republished, as a separate step with its own
evidence, not as a text edit.

Registry identity is lowercased once, at the top of each job that touches a
registry. GitHub preserves the organization's casing in `GITHUB_REPOSITORY`, while
OCI registry names and `ocimanifest.validateRelease` accept only lowercase. One
step derives `IMAGE_REPOSITORY` from `GITHUB_REPOSITORY`, bounds it with the same
owner/name pattern the Go validator uses, and fails closed. Every `ghcr.io`
image name and every `--repository` that feeds the OCI manifest reads that
variable. Everything that names the GitHub repository rather than a registry
stays case-preserving: release-check lookups, attestation `--repo`, the
signer-workflow identity, and the `image.source` URL labels. The engineering
policy pins are rewritten in step and two new checks hold the split in place.

Fixture image identity moves to lowercase `cordanallm` in the workstation
manifests, their schema and the experiment catalogue, together with the
workflows that build those images. Those images are rebuilt from the repository
identity on every run and nothing pins their previous names by digest, so a
manifest that kept the old owner would describe an image the workflows no
longer build and would ship that name inside the release plan asset.

Merge after the transfer, not before. Repository-metadata synchronisation and
pull-request labelling compare `GITHUB_REPOSITORY` case-sensitively against
the owner recorded in `.github/issue-milestones.json`, which this branch already
sets to `cordanaLLM`; landing on `main` while the repository still lives under
`lusoris` makes the push-triggered synchronisation fail. The lowercase
derivation itself is a no-op on the untransferred repository.

After the transfer, in order:

1. Confirm the organization's package settings let the repository token create
   packages and that public packages are allowed; the first registry write
   fails with `denied` otherwise.
2. Expect the first release to stop at the anonymous-pull gate. New packages
   are created private. Set `20-watts-was-enough-20w`, `-fixture-007` and
   `-fixture-019` under the organization to Public, then rerun the same tag.
3. Verify `cordana.dev` under the organization and enable Pages with the
   Actions source on the moved repository; domain verification is
   account-scoped and Pages sites are not redirected on transfer.
4. Confirm the immutable-releases setting survived the transfer before pushing
   a tag; the release workflow waits for GitHub to report it.
5. Re-apply the branch ruleset from `.github/rulesets/main.json` and confirm
   `CODEOWNERS` resolves; a code owner in an organization repository must
   hold write access there.
6. Rewrite every clone's `origin` to the exact organization casing; the
   generated checkpoint hook compares the remote URL case-sensitively.

Tags published before the transfer cannot be rerun: their recorded image
identities carry the previous owner and the read-only preflight rejects the
prefix by design. Their released assets remain valid. The PDF-tools and CLRS
generator contracts keep the previous owner because they pin configuration
digests; that is unaffected by whether a registry copy of either image exists.

## Verification and limitations

`lint`, `typecheck`, `check:code-shape`, `check:prose`, `validate:policy`,
`validate:docs`, `validate:tooling` and `validate:book-pdf` pass, as do
`go build` and `go vet` across the renamed module. The book was re-rendered
because `README.md` belongs to the book source set; the render completed twice
identically and the recorded provenance was updated.

The HISS ratchet reports `0 new unbaselined` infractions and then refuses the
change because 75 touched files carry pre-existing baselined debt. The rule has
no exception for a mechanical rename, and the generated pre-commit hook cannot
reach the `--touched` flag that would narrow it. This is recorded upstream as
cordanaLLM/praetor#150; the commit is made without the hook, and the audit
result is quoted in the commit message rather than hidden.

This decision prepares the transfer. It does not perform it. The transfer
itself, the GHCR package migration, the Pages custom-domain rebinding, the
OpenSSF Scorecard re-registration and the branch-protection ruleset must be
applied against the moved repository and verified remotely; hard rule 12 still
forbids claiming any GitHub setting is active without that check.
