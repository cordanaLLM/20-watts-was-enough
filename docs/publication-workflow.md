# Research publication and feedback workflow

## Current answer

Git `main` is the only maintained research authority. The portal, clean HTML
routes, full web book, PDF, release assets, scoped OCI images and reviewed
translations are generated derivatives. Issues and pull requests point back to
an exact source path, claim, experiment, commit, release tag or image digest;
they do not become another content store.

```text
canonical Git source
  ├─ Pages build ── portal + document routes + web book + static help + metadata
  ├─ PDF renderer ── downloadable book + manifest
  ├─ release build ── checksummed assets + attestations
  ├─ OCI build ── static 20w image + one scoped image per released experiment
  └─ translation manifest ── reviewed, source- and target-digest-bound derivatives

reader feedback
  └─ typed GitHub issue ── source identity ── pull request ── canonical Git source
```

## Why this structure fits research work

The useful pattern in established Git-centred research projects is not a
specific site generator. It is a reproducible source-to-publication boundary.
The [external infrastructure
audit](../research/audits/2026-08-30-git-centred-open-research-publication-infrastructure.md)
compares that boundary across repositories, papers, specifications and current
service documentation. This repository keeps its custom Vite reader because
it already implements the required route, search, mathematical rendering,
fallback and PDF contracts; migrating generators would duplicate work without
fixing an identified boundary.

The reading column applies the externally recorded bounded-line, reflow and
text-spacing guidance. Focused documents use an `18px` body, approximately
`1.66` line height and a `68ch` argument measure on wide screens. Small screens
start around `17px`, `1.68` and `20px` gutters. These are project defaults, not
universal accessibility thresholds. Tables, equations and diagrams may use
bounded overflow regions rather than widening prose. Navigation and metadata
remain visually subordinate but must not fall below the tested readable scale.

## One authority per concern

| Concern | Maintained authority | Generated or external consumer |
| --- | --- | --- |
| Reader corpus | `concept/`, `math/` | Focused Pages routes, web book, PDF, search and metadata |
| Research ledgers, audits and generated reports | `research/` | Direct Git source links; only an explicitly listed appendix, currently `research/field-coverage.md`, enters the book and PDF |
| Claims and principles | stable `C-` and `P-` registries | readiness and traceability views |
| Experiment contracts | `experiments/candidates/`, `experiments/fixtures/` | workstation plans and receipts |
| Runtime | locked manifests and workstation code | static tooling image and one tagged GHCR image per released experiment |
| Public identity | `app/lib/publication.mjs` | dynamic and static SEO, reader links and issue routes |
| Translation status | `translations/manifest.json` | reviewed language routes bound to exact source and target bytes |
| Feedback | typed issue forms | pull requests against the matching authority |
| Managed GitHub coordination | `.github/labels.json`, `.github/milestones.json`, `.github/issue-milestones.json` | labels, roadmap stages and explicit issue assignments on the named repository |
| Public transport | `.github/public-transport.json` and decision 0047 | post-deployment Cloudflare redirect, response and certificate probe |
| Durable policy | append-only `decisions/` | contributor and automation rules |

Duplication is allowed only when the derivative is necessary for distribution
and is regenerated or checked against its authority. A copied value with no
freshness check is a defect.

## Feedback from a reading surface

- A focused document exposes its canonical Markdown and a preselected site or
  documentation issue whose title names the source path.
- The portal and full book expose the GitHub issue chooser for evidence,
  experiment, translation, presentation, repository and private-security
  routing.
- Experiment reports name the container digest, source revision, artifact and
  `NO_RESULT` receipt.
- Translation routes prefill the target language, source path, source digest,
  reviewed target digest and recorded reviewer in the translation form. The
  reporter must still disclose any drafting tool.

The issue is a triage and coordination record. Accepted text, code, data and
policy changes still land through the authoritative file and its validation
gate.

The [external research audit](../research/audits/2026-08-30-git-centred-open-research-publication-infrastructure.md)
holds the comparison evidence and unresolved service choices. The
[interface implementation audit](public-research-interface-audit.md) records
only rendered observations, adopted rules and falsifiable reader tasks.

## Automation boundary

The aggregate `npm run check` command is the pull-request and release quality
authority. Pages deployment runs the narrower `npm run test:github-pages`
pipeline because it must produce the upload artifact. Tagged release
verification runs the aggregate gate once, then creates tag-bound assets, the
static `20w` image, and scoped experiment images from the already verified
source. Releases from v0.3.0 whose source contains and passes this path publish
the new images; earlier releases are not backfilled. Their complete
`image@sha256:...` identities are recorded in the checksum-bound
`oci-images.json` release asset. The release notes render the same identities
for readers, but are not digest authority. The only native convenience file
currently exercised and admitted is `20w-linux-amd64`. Each external GitHub
Action is pinned to a full commit SHA and every job has bounded time and least
privilege.

The PDF renderer's checked-in JSON lock is the authority for its container,
browser and resource inputs. The Go renderer validates that lock and generates
a temporary closed Dockerfile whose two `FROM` instructions contain the lock's
literal OCI digests. The template contains no image identity, and the generated
Dockerfile is not a second maintained source. The separate `package-lock.json`
binds JavaScript packages, and tagged release CI realizes that graph with the
exact locked Node and npm versions before rendering. Both locks and the Go
generator contribute to the book source digest.

The same lock binds the Docker exporter's layer-timestamp rewrite and records
compatibility version 30 as the reviewed default of the pinned BuildKit 0.32.2
image. Go uses `type=docker,rewrite-timestamp=true` explicitly and rejects the
known warnings for a missing epoch or failed layer rewrite. Compatibility 30 is
review metadata, not a passed Docker-exporter attribute; changing BuildKit
requires a fresh review and two-builder comparison.

Ordinary `render-pdf` generation also compares two complete PDF/manifest pairs
before publishing. If they differ, it retains the exact compared bytes under
`build/evidence/pdf-generation-mismatch-<identity>/`, with a maximum of 132 MiB
per complete bundle. The error reports that location and identifies incomplete
retention if a write fails. The previous public pair stays unchanged. These
local diagnostics have no proof receipt or automatic upload; their retention
and explicit cleanup follow
[decision 0081](../decisions/0081-retain-ordinary-pdf-generation-mismatches.md).

`20w publication verify-pdf-reproducibility` makes that comparison a real
release acceptance rather than a mock-only unit check. It hashes one exact
normalized schema-3 build context, builds it without cache in two separate
builders pinned to the lock, compares the image, config and manifest identities,
then byte-compares the complete PDF and `book-manifest.json` outputs. The
schema-4 receipt retains the actual config bytes in base64. When Docker's
execution ID names that config, its SHA-256 must match the exported bytes
directly. When execution uses a manifest ID, the original Buildx manifest bytes
must hash to that ID and bind the config's digest and size. A classic Docker
export may reconstruct another OCI manifest; that reconstruction is never
presented as the original build manifest. Its original manifest digest remains
a separate Buildx-metadata observation.

This acceptance command pins every Docker operation to the local Linux
`unix:///var/run/docker.sock` endpoint, clearing inherited Docker and Buildx
routing overrides. Ordinary `render-pdf` behaviour does not change. Each
read-only image export has a 120-second deadline, 4-GiB stream cap, 128 physical
tar-header cap, 64-KiB small-blob cap and 1-MiB aggregate small-blob buffer. It
extracts no layers. Receipt proof covers config bytes and, for manifest-ID
execution, their original descriptor link; it is not an independent layer-byte
audit. [Decision 0074](../decisions/0074-verify-renderer-config-bytes-for-both-docker-stores.md)
records the schema-3 correction and the two proof methods.

The command does not publish either render. It writes one new deterministic receipt
under the bounded evidence or release-input directories and removes only its
own builder names and image tags. The dedicated renderer-selected CI gate
retains the receipt for 30 days. If the renders disagree, the command first
retains both exact PDF and manifest pairs beside that receipt; CI uploads the
bounded mismatch bundle even if owned-image cleanup then fails. Pull requests
and `main` pushes preserve their exact diff, so this expensive proof does not
run for a known unrelated change;
the pull request and a comparable `main` push may remain impact-scoped.
Manual runs, unavailable, invalid or non-ancestral push comparisons, unmapped
paths and loadable selector-authority diffs select it fail-closed. A missing or
invalid mapping blocks planning. Git-classified renames and copies retain both
paths and expand to full. Type changes and other non-regular-mode records also
expand to full. A mapped regular-file deletion instead selects consumers from
its former path, except that deleting presentation authority expands to full
under [decision 0077](../decisions/0077-separate-render-pair-and-image-build-proofs.md).
Tagged releases always run the proof and add its receipt to the checksum-bound
release assets. A mismatch blocks the boundary; the receipt remains engineering
evidence and is not a scientific result.

Presentation-only impact changes keep this renderer gate but select
`--proof render-pair`. The exact Go allowlist includes book presentation sources
and their accompanying changelog, generated pair, semantic baseline and the
two regression-test files exercised by PR #111. Any unrecognised companion
path retains `image-build`. The lighter mode builds one locked image without
cache and compares two isolated renders from it. Its schema-5 receipt records
one actual build and both render observations under
`pdf-render-pair-reproducibility`; it does not establish independent image-build
reproducibility. Default and tagged-release invocations retain schema 4 and two
builds.

CI additionally enables the optional BuildKit layer cache under
`build/cache/pdf-renderer`, governed by
[decision 0078](../decisions/0078-reuse-verified-renderer-build-cache.md).
Only render-pair proofs import it; image-build proofs retain two fresh
cache-free builders and may export a seed. A warm build must reproduce the
seed's image, original manifest and config identities before either render.
Schema-6 receipts distinguish cache import from cache-free construction and
retain the actual proof counts, including on mismatch. A missing cache falls
back to cold construction. An invalid cache fails closed. Trusted main pushes
alone save the exact source-keyed CI cache; partial key matches are rejected.
Default local commands and tagged releases remain cache-free. This cache is
disposable acceleration, not a published renderer image or release artifact.

Script impact is classified by an exact executable consumer, not by the
`scripts/` directory name. The browser reader regression therefore selects the
site lane, while the checked PDF semantic baseline selects the release lane
that reads and binds it to the tracked PDF, manifest and book source. Shared
policy, runtime and renderer scripts remain explicit full-gate authority.
Every other script path is deliberately unmatched and therefore expands to the
full gate; a new file cannot inherit a narrow lane from its directory alone.

The exact `scripts/book-support-sources.json` inventory selects experimental
provenance files without changing executable renderer or selector code.
[Decision 0076](../decisions/0076-separate-book-support-provenance-inventory.md)
defines its bounded parser and unchanged source-binding contract. The inventory
and every selected file remain part of the book digest. Inventory-only changes
select release and site checks, unioned with other changed-path owners; current
PDF and semantic source bindings are still required. The parser and its strict
JSON helper remain protected executable authority, so the initial split and
later parser changes retain the full gate and renderer proof.

The two render containers use disjoint output, work and browser-cache
directories, but currently share that one read-only installed JavaScript
dependency tree. Their byte comparison therefore tests deterministic rendering
conditional on one clean `npm ci` realization; it does not independently
reinstall or byte-bind two realized `node_modules` trees.

Before either PDF command starts image work, Go checks the declared lock,
npm's hidden installation lock and each installed package's name and version.
It rejects stale identities, missing required packages, unexpected packages,
unsafe paths and malformed metadata. Platform-optional packages and their
optional dependency subtrees may be absent. Metadata is frozen for the command
and rechecked before and after rendering, then before publishing the pair or
acceptance receipt. These offline checks detect installation drift; they do
not authenticate package payload bytes. A failure requires an explicit
`npm ci --no-audit` with the locked toolchain, not a download during rendering.
The check bounds each lock to 2 MiB, each package manifest to 1 MiB, combined
metadata to 32 MiB, the inventory to 4,096 packages, paths to 16 components,
each directory to 4,096 entries and each inspection to 30 seconds. npm shims,
its separately checked hidden lock and known Vite/cache directories are
outside the package inventory. Remove this check only when a replacement
renderer binds its installed dependency inputs more strongly.

npm's `inBundle` records may omit their own URL and integrity. The guard
requires a containing locked package and its explicit `bundleDependencies`
entry, or an already bundled parent; the enclosing archive supplies the
binding. This includes the optional WASI subtree in the current lock.

`node scripts/audit-book-pdf-semantics.mjs --evidence-dir
.workingdir2/evidence/design/<new-directory-name>` captures plain `pdfinfo`,
`pdfinfo -struct`, `pdfinfo -struct-text`, default text extraction and raw text
extraction as separate bounded streams. Evidence is published atomically under
that declared root; a semantic mismatch retains the streams with an explicit
failure envelope. The checked baseline binds the current source digest, PDF,
manifest, A4 page format, tag state, Poppler 26.08.0 identity, exact diagnostics
and the full checked semantic-sentinel set. Its current expected outcome is
`known-debt`, so a
matching audit exits non-zero; it is a regression sentinel, not a PDF/UA or WCAG
conformance check. DOM and accessibility-tree order are outside this Poppler
snapshot and require the pinned-Chrome renderer-aware follow-up. The separate
PDF-tools authority now locks apko, Poppler 26.08.0, the 45-package graph,
runtime expectations, notices, the Wolfi recipe-licence snapshot and
source-retention metadata. Its offline Go validator prevents repository drift.
Its local reproducer now requires two byte-identical final images and the
bounded runtime observations. Given four explicit new output paths, the same
successful run can retain one final OCI archive, one byte-identical canonical
apko SPDX document and a checksum-closed source archive containing all 45 exact
APKs and the pinned source and notice material. It places those three
non-authoritative convenience files first, then publishes one deterministic
USTAR containing the same streams and their canonical `NO_RESULT` receipt with
one no-replace link. That outer bundle is the only candidate publication and
consumer authority. The requested standalone receipt path remains absent on
success and is used only if construction mismatches before candidate
preparation.

The receipt keeps the two raw SPDX identities separate; only their validated
canonical documents must match. Semantic CI enforcement still waits for
maintainer notice/source approval, remote publication, anonymous pull and
exact-digest admission; ambient host Poppler remains non-authoritative. Local
candidate and receipt output is Linux `amd64`-only: no-follow descriptor
traversal pins each repository parent, unnamed `O_TMPFILE` staging avoids
cleanup pathnames, and atomic `linkat` placement refuses replacement. The
producer protects cooperating invocations and name competition. Arbitrary
same-UID mutation or directory rename is outside that boundary, so consumers
must check an independently recorded outer digest and rehash every bundle
member immediately before use. Detected drift fails closed and retains already
linked evidence for inspection.

Container publication has a separate two-phase boundary. The build pushes a
candidate under its canonical digest without a release tag. The workflow then
validates and executes that exact digest. Only a digest produced by a build
step in the current run receives a new source-bound build attestation, using
that step's digest directly. On a rerun, an existing tag is re-admitted at the
same digest only if its workflow-, tag- and commit-bound provenance already
verifies; missing provenance stops the release. The workflow then attaches a
missing release tag and checks its final digest binding. Recovery has no
intentional deletion or replacement path. Tag
creation is serialized and immediately absence-checked. GHCR does not expose a
documented atomic create-if-absent operation through this path, so package
writers remain a trusted concurrent-writer boundary; final inspection rejects
a divergent binding. A candidate that fails before tag attachment is not a
release-tag identity.

GitHub Release publication starts only after all three final image digests can
be pulled without credentials from a fresh, empty Docker configuration. GitHub
[creates a personal-account package as private by
default](https://docs.github.com/en/packages/learn-github-packages/configuring-a-packages-access-control-and-visibility),
even when its linked repository is public. GitHub also warns that changing a
package from private to public is irreversible. For the v0.3.0 release, this
one-time settings action is limited to these three package identities:

- `ghcr.io/lusoris/20-watts-was-enough-20w`
- `ghcr.io/lusoris/20-watts-was-enough-fixture-007`
- `ghcr.io/lusoris/20-watts-was-enough-fixture-019`

The first run that creates them can therefore stop at this gate. Set only these
packages to **Public** in GitHub's package settings, then manually rerun the
same exact release tag. Do not create or move a replacement tag to pass the
visibility gate.

Repository [immutable releases must be
enabled](https://docs.github.com/en/code-security/concepts/supply-chain-security/immutable-releases)
before v0.3.0 is published. Reading that setting requires repository
administration permission, which the release job does not receive. The
maintainer enables it through the administrative boundary; after publication,
the least-privileged workflow instead requires GitHub to report the release as
immutable. It also resolves either a lightweight or bounded annotated tag
chain to the verified source commit before it considers release state.

After final tag binding and the first anonymous pull gate, the Go release tool
writes one closed `oci-images.json`. It contains schema and contract versions,
the source tag and commit, `linux/amd64`, `NO_RESULT`, and the sorted exact
identities of the tooling, Fixture 007 and Fixture 019 images. The workflow
adds that file to `SHA256SUMS`, verifies the complete checksum inventory, and
attests every asset before publication. Release notes remain presentation;
editing prose cannot change the persisted container authority.

A same-tag run begins with a read-only preflight. The Go release command reads
every source asset twice, binds initial and final directory snapshots, and
derives the only allowed names from `SHA256SUMS`. Existing remote assets are
downloaded by asset ID and compared by hash and bytes. Before any upload,
creation or publication edit, the final step repeats the local stable-read and
attestation checks. It then validates the complete downloaded remote directory
against its own checksum authority and verifies attestations over those remote
bytes. No path deletes or moves a tag or asset, replaces an existing asset, or
uses `--clobber`.

GitHub recommends creating a draft, attaching every asset, and publishing only
after the draft is complete. A fresh run follows that sequence, verifies all
draft bytes, publishes it, and then requires GitHub to report the release as
immutable. A manual rerun may fill only missing assets in an existing
non-prerelease draft after every present asset compares exactly. An existing
published release must already be non-prerelease, complete, byte-matching and
immutable; that branch performs no container-image build, upload, attestation
creation, release edit or other remote mutation. It still verifies
release-asset attestations, every persisted image and tag binding, image
provenance, and anonymous exact-digest pulls.

The Go catalogue derives `experiment-release-plan.json` from the checked
workstation manifests. Policy validation reads the same manifest projection
and requires its image, platform, Dockerfile and build-context set to match the
explicit CI and release steps. The generated plan is not interpreted as
workflow code: each runtime class keeps a reviewed build and exact-digest
execution path in YAML. Adding or changing a release image therefore requires
the manifest and its workflow implementation to change together, or the gate
fails closed.

The `20w github sync-metadata` command validates and applies the managed label,
milestone and [issue-assignment](../.github/issue-milestones.json) manifests.
It reads all three remote scopes before its first write, validates exact
mutation responses and reads the result back. A trusted-main workflow creates
missing objects, repairs managed values and changes only the milestone field of
mapped issues; unmanaged labels, milestones, issues and pull requests remain
untouched. Manual repair still checks out canonical `main`, so an arbitrary
workflow ref cannot become a second metadata authority. Milestones project the
stage identities and links from the canonical
[research roadmap](../concept/90-research-roadmap.md); their completion
percentages count associated issues and pull requests, not scientific evidence.
The mapping names its repository and stable issue numbers.

The trusted `pull_request_target` workflow runs the related
`20w github sync-pr-metadata` command after path labelling. A pull request opts
in with one explicit stand-alone reference such as `Tracks #12`. The referenced
number must identify one mapped, open issue whose remote milestone and managed
type, severity, status and area labels are complete. The issue map supplies the
milestone, the Conventional Commit title supplies the pull-request type, and
the issue supplies severity, status and additional areas. The command preserves
path-derived areas and labels outside those namespaces. Missing, unmanaged or
ambiguous references produce no issue-derived write. The job checks out only
`refs/heads/main`, never pull-request code, and confirms both metadata snapshots
before mutation and after readback.

Cloudflare remains the public TLS authority for `www.cordana.dev`; GitHub Pages
builds and serves the origin artifact. The authenticated dashboard observation
behind [decision 0047](../decisions/0047-keep-cloudflare-as-the-public-pages-tls-authority.md)
records **Always Use HTTPS** with automatic **Full** origin encryption. Full
encrypts but does not certificate-validate the origin leg, so the Pages
workflow's bounded live probe claims only what it can observe publicly: the
exact redirect, Cloudflare response headers, HTTPS status, trusted hostname
certificate and remaining validity. The workflow retains the probe output as
a bounded Actions artifact for 30 days. A DNS or origin-mode change requires a
fresh administrative check.

## Research basis

The primary sources, repository snapshots, observations, retained boundaries
and open decisions are maintained once in the
[Git-centred open research publication infrastructure
audit](../research/audits/2026-08-30-git-centred-open-research-publication-infrastructure.md).
