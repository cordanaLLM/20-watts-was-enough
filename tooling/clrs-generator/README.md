# CLRS generator image foundation

No generator image is admitted yet. This directory records the exact Linux
`amd64` dependency graph and the selected 61-file wheelhouse manifest. The
committed foundation contains no wheel payload, Dockerfile, complete build
context or admitted acceptance receipt. Ignored local candidate inputs and
receipts do not change that status. Registry absence has not been checked;
the state remains `blocked` and `NO_RESULT`.

The Python image is a narrow exception to the Go-first tooling rule. The pinned
official CLRS-Text generator imports TensorFlow and JAX; rewriting that path
before the controller shakedown would test a different generator. Go remains
the controller, validator and fixture-import boundary.

## What this foundation fixes

- [`upstream.json`](upstream.json) binds the official CLRS commit, tree,
  licence, generator and requirement bytes.
- [`contract.json`](contract.json) fixes the six task families, seeds, sizes,
  output counts and byte limits from [Decision 0055](../../decisions/0055-freeze-clrs-text-as-a-controller-shakedown.md).
- [`lock-input.json`](lock-input.json) binds the checksum-closed source archive,
  CPython 3.13.15 base, uv 0.12.9, resolution cutoff and reviewed Linux `amd64`
  TensorFlow, JAX, JAXlib, NumPy and tqdm wheel candidates.
- [`pyproject.toml`](pyproject.toml) is derived from those inputs. Its
  [`uv.lock`](uv.lock) resolves 62 packages and records 135 checksum-closed
  artifacts. Two isolated runs of the pinned resolver produced identical lock
  bytes. This closes dependency resolution only; it does not prove that the
  source imports or runs.
- [`wheelhouse.json`](wheelhouse.json) selects one exact Python 3.13 Linux
  `amd64` wheel for each of the 61 runtime packages and binds the pinned
  Bookworm image's glibc 2.36 boundary. Sixty wheels map directly to compatible
  artifacts in `uv.lock`; the Go validator rejects musl, WebAssembly,
  free-threaded CPython, other architectures and glibc versions newer than the
  base. `promise==2.3` has no upstream wheel, so the manifest fixes its
  19,534-byte sdist, the three locked build-tool wheels, candidate step
  arguments and the output identity seen in two local reconnaissance builds.
  The reviewed executable procedure and admitted reproduction receipt remain
  explicitly missing; the candidate command below does not change those
  authority fields. The Promise MIT text is retained at
  [`LICENSES/promise-MIT.txt`](../../LICENSES/promise-MIT.txt); the manifest
  binds its source and built-wheel paths, hash and size. The complete selected
  set is 823,932,066 bytes; those bytes remain ignored build inputs rather than
  Git content.
- [`image-contract.json`](image-contract.json) reuses the repository's pinned
  Buildx, BuildKit and timestamp-rewrite authority; fixes resource and runtime
  containment; binds the upstream licence's final image path; caps retained
  SBOM bytes and packages; binds the exact dependency files and selected
  wheelhouse manifest; and keeps the Dockerfile and every execution-derived
  acceptance identity missing.

Python 3.13 is the newest candidate interpreter because TensorFlow 2.21.0 has no
CPython 3.14 wheel, while current JAX and JAXlib require Python 3.12 or newer.
The official generator imports `tqdm` directly although the upstream
requirements file does not name it. The lock input therefore makes tqdm an
explicit candidate instead of relying on accidental transitive installation.

## Offline validation

Run the standard-library Go boundary without Python, network access, dependency
resolution or a container runtime:

```bash
go -C tooling test -race ./internal/clrsfixture
go -C tooling vet ./internal/clrsfixture
```

`CheckGeneratorImageFoundation` rejects ambiguous JSON, non-canonical authority
files, symlinks and unstable reads. It derives the project requirements from
the reviewed inputs, binds the complete lock and wheelhouse-manifest digests,
checks the resolver header and cutoff, and requires exactly one selected wheel
per runtime package. Every downloaded wheel must be an exact, platform-
compatible `uv.lock` artifact. The sole source-built wheel must match its
frozen source, build tools, candidate arguments, environment subset and output
identity. This does not turn those partial fields into a build procedure.
Directory enumeration and expected sizes bound verification before hashing; a
final name-and-file-identity pass rejects files added or replaced during the
read.

Once the ignored wheel bytes have been materialised, verify their exact names,
sizes, hashes and complete set without Python, a resolver or network access:

```bash
go -C tooling run ./cmd/20w experiment verify-clrs-wheelhouse \
  --root .. \
  --wheelhouse /path/to/wheelhouse
```

To reproduce the reviewed manifest into a new file for comparison, use
`experiment render-clrs-wheelhouse-manifest`; it refuses to overwrite an
existing output. Rendering a candidate does not change repository authority.

## Compare supplied fixture trees

Once two separately retained runs exist, compare their complete datasets with
the current source record and frozen generation contract:

```bash
go -C tooling run ./cmd/20w experiment compare-clrs-fixtures \
  --root .. --first /path/to/run-1/dataset --second /path/to/run-2/dataset --json
```

The command always checks without writing, generating fixtures or invoking
Docker. Relative dataset paths resolve against `--root`; absolute paths declare
separate dataset roots. Each must contain only the planned split directory and
its six regular task files. Symlinks, extra entries, missing files and identical
root directories fail. The existing importer validates each task's complete
seed/size/sample grid and separates candidate inputs from verifier answers.
Equal bytes alone do not pass an invalid import.

Schema-1 JSON contains sorted per-file byte counts, SHA-256 digests, equality
and imported-example counts, plus raw source/contract hashes and typed source
identities. A domain-separated, length-framed SHA-256 digest binds each complete
tree's sorted relative paths and contents; the report states its exact framing.
No prompts or reference answers are emitted. Each file is capped at 4 MiB,
each tree at 24 MiB and the report at 64 KiB. A 30-second context checks
cancellation between bounded local-file operations; it is not a kernel I/O
deadline. Final inventory, file-identity/hash and authority-byte checks reject
inputs that changed during comparison.

Exit codes are zero for a complete match with valid imports, one for validation
or operational failure and two for invalid arguments. `--json` emits a failed
report on validation failure; argument errors do not emit JSON. Without it,
success is a short summary and failures go to standard error. These checks do
not establish fresh execution or runtime containment: retain the separate
generation receipts. `NO_RESULT` and blocked image admission remain unchanged.

## Candidate Promise wheel reproduction

The Go command below tests the sole source-built dependency from
[Decision 0071](../../decisions/0071-lock-the-clrs-generator-wheel-selection.md).
It needs a Unix host with the default local Docker socket and the pinned Python
image already present. It never pulls an image or resolves dependencies.
Place the locked sdist in `source-build-inputs/` and the three locked build
wheels in `build-tools/` beneath the supplied input directory. The output
parent must already exist; the command creates a new evidence directory.

```bash
go -C tooling run ./cmd/20w experiment reproduce-clrs-promise-wheel \
  --root .. --inputs /path/to/retained-inputs --output /path/to/new-evidence

go -C tooling run ./cmd/20w experiment reproduce-clrs-promise-wheel \
  --root .. --check --output /path/to/new-evidence
```

Before writing or invoking Docker, Go verifies all four input hashes and
sizes, checks the source MIT text, and prepares a bounded canonical source
archive. Each of two sequential runs gets a fresh container and private
staging directory. Only the three read-only build wheels are host-mounted;
Go streams the source archive to a fixed Python materializer through direct
`docker exec -i`. The materializer checks its exact size and SHA-256 before
extraction into `/work`, then checks the fixed modes, timestamps and ownership.
A fixed Python reader runs inside the same container, inspects at most two
output directory entries, opens only the named regular wheel without following
symlinks, and returns one bounded USTAR member. This accesses the running
container's tmpfs; Docker's archive-copy API uses a
[separate filesystem view](https://github.com/moby/moby/blob/6a43e3d5af/daemon/containerfs_linux.go#L26).
The requested container
configuration fixes UID/GID 65532, no network, a read-only root, one CPU,
1 GiB memory without extra swap, 64 processes, and temporary filesystems of
16 MiB at `/work`, 128 MiB at `/opt/build`, 1 MiB at `/output` and 16 MiB at
`/tmp`. A cleared environment precedes each frozen build step.

One 120-second deadline covers the whole run, not each command. The container
also has a finite 120-second lease. Cleanup gets a separate 30-second
deadline, checks the unique ownership label, forcibly removes the container
and verifies its absence. Host command cancellation kills its process group.
The wheel returns through a tar stream capped at 128 KiB; regular-file and
archive checks reject unexpected names, links, duplicates and extra data.
Each run retains at most 768 KiB of command output plus 64 KiB for cleanup;
the encoded log is capped at 2 MiB. Private staged inputs are removed after
the run. Failure leaves bounded diagnostics and no success receipt.

A schema-1 `NO_RESULT` receipt for procedure version 3 requires two exact wheel
hashes, independent embedded MIT checks and complete cleanup evidence. The
read-only `--check` path verifies both retained wheel files and command logs,
reconstructs the fixed requested arguments, and rejects changed repository
authority or procedure source files. It does not need Docker. The receipt
records the executable hash and build identity separately from workspace
source hashes: those observations alone do not prove that the executable was
compiled from the recorded source. Retain the clean commit and build command
for a reviewed run. Requested flags are not an independent inspection of
Docker's runtime state. No receipt from this command admits the CLRS image or
establishes a scientific result; the existing image blockers remain unchanged.

Version 3 binds the experiment CLI package after its move out of the public
dispatcher. The read-only checker also accepts version-2 receipts against their
explicitly supplied frozen source root, retaining the old source-path set.
It never falls back to the old version when new sources are missing. New runs
emit version 3; a retained version-2 receipt is not rewritten or relabelled.

## Candidate offline build context

`materialize-clrs-context` packages the complete pinned upstream source, all
61 selected wheels, an offline-install Dockerfile and the original Promise
receipt and command logs into one deterministic tar. It derives requirements
and file identities from the existing authority; it does not create another
dependency lock or admit the generated Dockerfile.

```bash
go -C tooling run ./cmd/20w experiment materialize-clrs-context \
  --root .. --wheelhouse /path/to/verified-wheelhouse \
  --source-archive /path/to/pinned-clrs.tar.gz \
  --promise-source-root /path/to/frozen-promise-source \
  --promise-evidence /path/to/two-run-promise-evidence \
  --output /path/to/new-context.tar
```

Repeat the same command with `--check` to verify an existing context without
writes or Docker. The checker needs the same retained inputs: it regenerates
the expected tar stream and compares its exact hash and size with the output.
The Promise source root is the independently retained checkout used for that
execution, not a modified current checkout. The existing Promise verifier
checks its complete procedure-source binding, while the context command also
requires its foundation and wheelhouse identities to match current authority.
The original receipt, including its producer and procedure-source identities,
is retained verbatim and hash-bound in `context-manifest.json`.

The command verifies the upstream archive's pinned compressed hash before
decoding. It accepts one gzip stream, at most 64 MiB of decoded source and
2,048 archive entries, regular files and directories only, and the exact Git
commit comment in the initial global PAX header. Links, alternate extended
headers, duplicate or unsafe paths, unexpected metadata and changed inputs
fail closed. The complete source includes upstream's 50,178,045-byte accuracy
CSV; no data or notebook subtree is silently omitted. Tar member ownership,
modes and timestamps are normalised. Wheels stream through size, hash and
stable-file checks rather than being loaded together into memory.
The generated context uses USTAR headers where possible and deterministic PAX
path records for wheel filenames that exceed USTAR's 100-byte basename limit.

The final context is capped at 2 GiB and 4,096 regular files. Streaming work
uses a five-minute cooperative deadline. A private staging directory holds
partial bytes; publication uses a no-replace hard link only after verification.
An existing output is never overwritten, and cleanup removes only owned
staging entries. A readback checks the published bytes. These local checks do
not authenticate unsigned execution history or prevent later modification by
another process with the same filesystem authority.

The generated Dockerfile uses the pinned Python base and the pinned BuildKit's
bundled frontend. Its dependency install uses `RUN --network=none`, read-only
wheel mounts and pip's `--no-index`, `--no-deps`, `--require-hashes` and
`--only-binary=:all:` restrictions. It declares the existing runtime entrypoint,
environment and non-root identity, and copies the upstream licence to the
contracted path. Context verification does not prove that an image builds,
imports, contains installed licence material or obeys external runtime limits.
Those remain the separate admission gates below.

## Inspect a retained candidate image archive

The read-only Go command checks one supplied OCI archive without loading an
image or starting Docker. Supply the archive's expected SHA-256 and byte count
from a separate retained build record; the archive cannot select its own
expected identity.

```bash
go -C tooling run ./cmd/20w experiment inspect-clrs-image-archive \
  --root .. --archive /path/to/candidate.oci.tar \
  --sha256 '<64-lowercase-hex-characters>' --bytes '<exact-byte-count>' --json
```

Replace both placeholders before running. Relative archive paths resolve
against `--root`. The schema-1 report binds the whole archive, manifest, config
and ordered layer/diff-ID bytes. `manifest_base64` and `config_base64` preserve
the original metadata bytes; reformatting their JSON changes their digests.
The report does not supply or verify a Docker loaded-image ID. To connect an
already-loaded image to managed generation, use the
[preparation command](#prepare-an-already-loaded-candidate-for-generation)
below instead of decoding and assembling those inputs manually.

This closed single-image profile accepts OCI layout version 1.0.0, one Linux
amd64 image manifest and uncompressed or gzip layers. It rejects extra blobs,
ambiguous paths or metadata, unsupported encodings and observed input changes.
Limits are 2 GiB for the archive, 4 GiB for all decoded layer tar streams,
64 KiB per JSON member, 2,048 outer members, 64 layers and 256 KiB for the
report. Repeated layer references count each time. The 180-second deadline
checks cancellation between bounded operations; it cannot pre-empt a blocked
filesystem call. Exit codes are zero for consistent bytes, one for validation
or output failure and two for invalid arguments. `--json` includes validation
failures, but argument errors do not emit a report.

A passing report is `archive-consistent-unadmitted` and `NO_RESULT`. Decoded
tar length is not extracted filesystem size. Installed files, sparse maps,
whiteouts, licences, imports, builder provenance and independent-build history
are outside this check. The command does not write files, authenticate a
registry, admit an image or publish an experiment.

## Check a retained scanner bundle

The read-only Go checker verifies a retained scanner bundle without starting
Docker or scanning the image again. Supply the expected image manifest and raw
config digests from a separately inspected image; the bundle cannot choose its
own expected identity.

```bash
go -C tooling run ./cmd/20w experiment check-clrs-sbom-bundle \
  --root .. --bundle /path/to/scanner-run/derived \
  --image-manifest 'sha256:<64-lowercase-hex-characters>' \
  --image-config 'sha256:<64-lowercase-hex-characters>' --json
```

Replace the digest placeholders before running. Relative bundle paths resolve
against `--root`. The directory must contain exactly five regular files:
`scanner-statement.intoto.json`, `image.spdx.json`, `supplied-binding.json`,
`execution-record.json` and `derivation-receipt.json`. Links, extra files,
ambiguous JSON, changed inputs and broken receipt cross-references fail.

The original statement and predicate remain unchanged. The checker compares
their exact bytes, validates recorded success and cleanup claims, and matches
each locked wheel to its installed top-level Python metadata. Vendored or
embedded package records cannot substitute for a required installed package.
Extra top-level packages and the total inventory count remain visible.

The JSON report is schema 1 and at most 64 KiB. Each SPDX document or statement
is limited to 64 MiB, each execution or derivation receipt to 4 MiB, the supplied
binding to 16 KiB, the whole bundle to 137 MiB and the inventory to 10,000
packages. A 30-second context checks cancellation between bounded operations;
it cannot interrupt a blocked filesystem operation or JSON decode. Exit codes
are zero for consistent supplied evidence, one for validation or operational
failure, and two for invalid arguments. `--json` also emits validation failures;
argument errors do not emit a report.

A passing check is not authenticated scanner execution. The retained statement
has `subject: null`; the supplied bindings do not turn it into signed image
provenance. The checker does not read the image, archive, scanner executable
or command-log payloads, enforce container limits, approve licences or prove
inventory completeness. Image admission remains blocked and `NO_RESULT`.

## Render the fixed generation program

The Go command derives the Python invocation from the existing source, task
grid and image contracts. It emits source only; it does not start Docker,
generate fixtures or change image admission.

```bash
go -C tooling run ./cmd/20w experiment render-clrs-generation-program --root ..
```

Add `--json` to inspect the program hash, source and contract identities,
Python executable and argument array, expected output paths and example
count. The JSON state is `prepared-unexecuted` with `NO_RESULT`. The program
appears once in that array, so consumers do not need a second editable copy.
Output is capped at 64 KiB. Exit codes are zero for successful rendering,
one for validation or output failure, and two for invalid arguments.

The generated program belongs inside the pinned candidate image, not a host
Python environment. It preserves the tested `ConfigDict` default binding,
task order, seeds and generator options, checks the upstream source hash
before and after generation, and requires a fresh `/output/dataset` child.
That child matters because the upstream generator removes its output path.
The image's default module entrypoint remains unchanged. The
[managed generation command](#run-or-check-one-fixture-generation) below uses
this prepared program without introducing a second editable wrapper.

## Admission sequence

The image stays blocked until one later, bounded change provides all of the
following:

1. materialisation of the 60 locked upstream wheels plus one complete,
   retained container procedure and receipt for two clean, byte-identical
   builds of the locked `promise` wheel;
2. a checksum-closed Dockerfile and complete build context whose dependency
   install runs without network access;
3. the 11,358-byte Apache-2.0 `LICENSE`, with its pinned source digest, at
   `/usr/share/licenses/clrs/LICENSE`, plus verification that Promise's pinned
   1,079-byte MIT text survives installation in its wheel metadata; both must
   be represented in final-image evidence;
4. a successful import smoke for the pinned CLRS source;
5. identical manifest, config and layer identities from two isolated,
   no-cache builds;
6. a retained, image-bound SPDX JSON SBOM from the pinned scanner;
7. a non-root, no-network, read-only-root runtime smoke; and
8. two clean generations whose six files and 48 examples compare byte for byte
   and pass the existing Go import contract.

The exact dependency lock and wheelhouse manifest are each capped at 16 MiB;
the graph may contain at most 1,024 packages and 2,048 artifacts. The retained
SBOM is capped at 64 MiB and 10,000 packages, well above the expected inventory
for this one Python image while still making retention finite. Its SPDX JSON
and receipt have fixed `build/evidence/clrs-generator/` paths, and each
licence or SBOM receipt named here is capped at 4 MiB. Exceeding a cap fails
admission; no authority artifact is truncated.

The runtime contract allows one CPU, 4 GiB of memory, 256 processes, 512 MiB of
temporary storage, 24 MiB of fixture output, 1 MiB of captured logs and 300
seconds of wall time. The external runner must stop and remove the complete
container after a five-second grace period. These are construction limits, not
performance results.

There is deliberately no `Dockerfile`, committed wheel payload, generated
fixture, admitted image digest or publication step in this foundation.
[Issue 12](https://github.com/lusoris/20-watts-was-enough/issues/12) tracks the
remaining acceptance work.

## Prepare an already-loaded candidate for generation

`prepare-clrs-loaded-image` checks the supplied archive and its matching image
in the local Docker store, then writes the original metadata into a new local
directory. Docker operations are read-only. An absent image causes failure;
the command cannot download, import, tag or run it.

```bash
go -C tooling run ./cmd/20w experiment prepare-clrs-loaded-image \
  --root .. --archive /path/to/candidate.oci.tar \
  --sha256 '<64-lowercase-hex-characters>' --bytes '<exact-byte-count>' \
  --output /path/to/new-image-inputs --json
```

Replace the hash and size placeholders with values from a separate retained
build record. Relative paths resolve against `--root`. The output parent must
exist and the child must be new. Preparation writes that directory directly;
it has no `--execute` or `--check` switch. It requires Linux `amd64`, Docker
client and server 29.7.2, cgroup v2 and the generation profile's resource
capabilities and `runc` runtime. Calls use `unix:///var/run/docker.sock`, not an
ambient Docker context.

Use these schema-1 report fields with the managed generation command below:

| Preparation report field | Generation flag |
| --- | --- |
| `loaded_image_id` | `--image-id` |
| `manifest_digest` | `--image-manifest` |
| `config_digest` | `--image-config` |
| `manifest_file` | `--manifest-file` |
| `config_file` | `--config-file` |

The two file paths are absolute. The execution ID stays separate from the
config digest because Docker stores use different ID conventions. Preparation
compares the consumed runtime configuration and ordered rootfs diff IDs with
the archive; it never reconstructs original JSON from Docker inspection output.
Generation rechecks the supplied image before running it.

A successful directory contains exactly six files: `run-start.json`,
`archive-inspection.json`, `manifest.json`, `config.json`, `commands.json` and
`receipt.json`. The receipt's `files` list hashes the other five. Each original
metadata file, run-start record and preparation report is capped at 64 KiB;
the archive report at 256 KiB and the command log at 8 MiB. The archive
inspector's byte, layer and time limits still apply. Preparation has a
300-second cooperative work deadline and at most four 15-second Docker calls;
each may need two further seconds for pipes to settle. Each call permits at
most 64 KiB stdout and 1 MiB combined stdout/stderr. Producer and Docker
executable reads are capped at 128 MiB each; filesystem calls are not hard
real-time.

Exit codes are zero for completed preparation, one for validation, operation
or output failure, and two for invalid arguments. `--json` includes operational
failures; argument errors do not emit a report. Failures after output creation
retain partial files and a failure receipt when possible. Keep that directory
for diagnosis and use a new one for another attempt. Require the external
exit status as well as the receipt: later output or I/O failure can follow
completed observations.

The successful state is `loaded-image-bound-unadmitted`, with `NO_RESULT`,
`image_admitted: false` and `docker_mutated: false`. Preparation does not reserve
the image, prove a fresh import, inspect installed licences or admit an
experiment. A later Docker-store change can invalidate the handoff. The
producer record identifies this command's executable bytes; it does not
authenticate their compilation or someone else's execution.

## Run or check one fixture generation

`generate-clrs-fixtures` runs one development generation from an already-loaded
candidate image, extracts the six expected files and validates their 48 examples
with the Go importer. It derives the program, tasks, seeds and limits from the
same source and image contracts as the preparation command. It does not acquire
an image, retry a run or admit the result for publication.

```bash
go -C tooling run ./cmd/20w experiment generate-clrs-fixtures \
  --root .. --output /path/to/new-generation \
  --image-id 'sha256:<loaded-image-id>' \
  --image-manifest 'sha256:<expected-manifest-digest>' \
  --image-config 'sha256:<expected-config-digest>' \
  --manifest-file /path/to/original-manifest.json \
  --config-file /path/to/original-config.json --execute --json
```

Replace each digest placeholder with 64 lowercase hexadecimal characters.
Obtain the expected manifest and config digests independently of the supplied
JSON files. The command hashes their original bytes, checks the manifest's
config descriptor and compares the loaded image's configuration with the
runtime contract. The execution ID must equal the expected manifest or config
digest; it is recorded separately because Docker image stores use different
ID conventions. Do not reconstruct a config from `docker inspect` output or
substitute that projection for the original config file. Each original JSON
file is capped at 64 KiB; layer content is not authenticated by this check.

Execution currently requires Linux `amd64`, Docker client and server 29.7.2,
Linux cgroup v2 and the `runc` runtime. It uses the explicit local socket
`unix:///var/run/docker.sock`; ambient Docker context variables do not select
another daemon. The output parent must already exist, and the output child
must be new. Relative paths resolve against `--root`. Keep the supplied source
checkout and image metadata unchanged for later checking.

The runner requests and inspects UID/GID 65532, no network, a read-only root,
one CPU, 4 GiB memory without extra swap, 256 processes, 512 MiB temporary
storage and 24 MiB output storage. It mounts no host path or Docker socket into
the container. Work has a 300-second deadline; ownership-checked cleanup gets
a separate 45 seconds and a five-second stop grace. Host subprocess pipes may
need two more seconds to settle per command. There are at most 17 work and
seven cleanup commands. These are development containment checks, not an
independent proof of kernel enforcement or a performance measurement.

The bundle retains original inputs, the derived program and procedure, a
durable `run-start.json`, `commands.json`, `output.tar`, the imported `dataset/`
and a final `receipt.json` when it can be published. The tar is capped at
24 MiB plus 64 KiB framing; individual dataset files at 4 MiB, all six files
together at 24 MiB, the command log at 40 MiB and the receipt at 4 MiB.
Failures after bundle creation retain bounded diagnostics and any partial
files. Do not treat them as a completed run or overwrite them for a retry.
If interruption or daemon failure prevents cleanup, use the recorded name and
ownership identity for a separately checked recovery; never remove containers
by a broad name prefix.

To check a retained successful bundle, use the same command and explicit
inputs with `--check` in place of `--execute`. Exactly one mode is required.
Checking is portable, has a 30-second cooperative deadline and neither starts
Docker nor writes files. It verifies supplied command and cleanup records,
source and image bindings, exact retained bytes and imported examples. A
blocked filesystem operation is not pre-empted by that cooperative deadline.

Execution returns `fixtures-generated-unadmitted`; checking returns
`bundle-consistent-unadmitted`. Both remain `NO_RESULT`. Retain the external
command's exit status as well as the bundle: a receipt records observations,
not successful delivery of the command's final output. Exit codes are zero for
completed execution or checking, one for validation, operation or output
failure, and two for invalid arguments. `--json` emits a bounded schema-1
report, including operational failures. A consistent supplied bundle does not
authenticate a third party, prove image-layer or licence completeness, replace
the two-generation comparison, or satisfy the separate image-admission gates.
