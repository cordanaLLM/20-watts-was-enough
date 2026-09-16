# CLRS shakedown specialist image

This Linux `amd64` image exposes the six frozen exact-program specialists from
issue 12 through one JSON request and one JSON response. It is an unreleased
development runtime. Every response remains `NO_RESULT`.

The process is only the candidate effect seam. It does not prove that a prompt
belongs to the frozen 48-example dataset, record the controller's route
decision, or run the separately held exact verifier. Those checks remain owned
by `clrsfixture.ImportDataset`, each task's `BindDataset`, and
`specialistcontrol.Runner` when an outer runner binds supplied inputs to the
candidate. The local Go development command below now supplies that outer path;
it does not change the one-shot container or admit its image.
The registry's `AdmissionSnapshot` projects the same six closed routes into
that runner's typed admission boundary. The controller distinguishes
`measured-fit`, `known-no-fit`, and `unknown`; `unknown` is never a match. A
`measured-fit` observation requires a caller-owned basis identifier,
measurement time, and bounded expiry. This registry labels a successfully
constructed local adapter with the additional construction-only
`task-compatible` state and ready only for the caller-supplied observation
window, at a neutral declared-cost rank. It does not claim measured per-request
resource fit; policy and adapter limits still validate each packet.
The development policy accepts at most two candidates for each frozen task;
this registry supplies one. The caller still owns per-specialist and aggregate
queue and active-work limits, wait and readiness-retry limits, and must
re-observe changing runtime state. The controller capacity-matches eligible
waiters in FIFO order across overlapping routes. It does not invoke under an
older recorded binding when revalidation sees newer fit or readiness evidence.
The one-shot container does not run a queue or a second controller, and this
local construction observation is not evidence that a remote process or model
is live, efficient or scientifically preferable.
The container-only entry point remains a narrow, unprivileged scratch candidate
process. The outer development runner also links the same six Go solvers into
`20w` and its general tooling image; neither binary is solver-free. Reusable
behaviour stays in the existing internal packages. This dependency expansion
is recorded in [decision 0079](../../decisions/0079-run-the-frozen-clrs-development-tree-through-20w.md);
the dedicated specialist entry point and its image boundary do not change.

## Run a frozen local development tree

`20w experiment run-clrs-shakedown` connects the existing fixture importer,
task bindings, six Go specialists, controller and held-reference verifiers. It
runs the frozen six-task, 48-example tree once, sequentially. It does not
generate inputs, use a model, invoke Docker or acquire an image.

Before running, set `CLRS_DATASET_DIRECTORY` to an already-verified development
tree and `CLRS_TREE_SHA256` to its independently retained raw tree SHA-256,
such as the identity recorded by `compare-clrs-fixtures`. Use an absolute,
real dataset path. The command rejects a changed tree, symlinked input or
output paths, output within the fixture tree, and any existing output name.

### Local tooling container

This path builds the general `20w` tooling image from
[`tooling/Dockerfile`](../Dockerfile), then runs the complete development tree
inside it. It is separate from the one-request specialist image described
under [Build and smoke](#build-and-smoke). The local development build is not
a published or admitted CLRS image.

From the repository root, build once and record its local image ID:

```bash
timeout --signal=TERM --kill-after=2s 600s \
  docker buildx build --load --platform linux/amd64 \
  --file tooling/Dockerfile --tag 20w-clrs-tooling:development \
  --build-arg IMAGE_NAME=20w-clrs-tooling:development \
  --build-arg IMAGE_VERSION=development \
  --build-arg SOURCE_REVISION=unknown \
  --build-arg SOURCE_TIMESTAMP=unknown \
  --resource memory=2g --resource cpu-quota=200000 . && \
  CLRS_IMAGE_ID="$(docker image inspect --format '{{.Id}}' 20w-clrs-tooling:development)"
```

Continue only after a successful build. It may download the pinned Go builder
and locked modules; it is not an offline-build proof. The runtime uses that
already-built image with `--pull never` and acquires neither images nor inputs.
The `development`/`unknown` identity is deliberate for an uncommitted checkout.

The following Bash example shares the limits between execution and checking.
It creates a dedicated writable parent under the ignored `.workingdir2/`;
`run-1` must not exist before execution. Set the dataset path and independently
retained hash described above before running it.

```bash
mkdir -p .workingdir2
CLRS_OUTPUT_PARENT="$(mktemp -d "$PWD/.workingdir2/clrs-container.XXXXXX")"
CLRS_RUN_ID="${CLRS_OUTPUT_PARENT##*/}"
CLRS_CONTAINER_NAME="20w-$CLRS_RUN_ID"
clrs_container=(
  --rm --name "$CLRS_CONTAINER_NAME" --pull never --platform linux/amd64
  --network none --read-only --user "$(id -u):$(id -g)"
  --cap-drop ALL --security-opt no-new-privileges
  --cpus 1 --memory 128m --memory-swap 128m --pids-limit 64 --stop-timeout 5
  --log-driver local --log-opt max-size=4m --log-opt max-file=1 --log-opt compress=false
  --mount "type=bind,src=$PWD,dst=/repository,readonly"
  --mount "type=bind,src=$CLRS_DATASET_DIRECTORY,dst=/dataset,readonly"
)
clrs_run=(
  experiment run-clrs-shakedown --root /repository --dataset /dataset
  --expected-tree "$CLRS_TREE_SHA256" --output /output/run-1
  --run-id "$CLRS_RUN_ID" --json
)
timeout --signal=TERM --kill-after=2s 90s \
  docker run "${clrs_container[@]}" \
  --mount "type=bind,src=$CLRS_OUTPUT_PARENT,dst=/output" \
  "$CLRS_IMAGE_ID" "${clrs_run[@]}" --execute
```

After execution exits zero, check the same bundle in a separate container with
the output mount read-only too:

```bash
timeout --signal=TERM --kill-after=2s 45s \
  docker run "${clrs_container[@]}" \
  --mount "type=bind,src=$CLRS_OUTPUT_PARENT,dst=/output,readonly" \
  "$CLRS_IMAGE_ID" "${clrs_run[@]}" --check
```

Both containers use 1 CPU, 128 MiB without swap and at most 64 PIDs; only the
execution's dedicated output parent is writable. Keep the output bundle and
each external exit status. `--rm` removes exited containers. If a timed-out
Docker client leaves its named container running, remove only that container,
retaining the bundle:

```bash
docker container rm --force "$CLRS_CONTAINER_NAME"
```

These containment limits do not measure energy or admit an experiment image.

### Native Go alternative

Set `CLRS_RUN_DIRECTORY` to a new output directory whose real parent already
exists, then run from the repository root:

```bash
go -C tooling run ./cmd/20w experiment run-clrs-shakedown \
  --root "$PWD" \
  --dataset "$CLRS_DATASET_DIRECTORY" \
  --expected-tree "$CLRS_TREE_SHA256" \
  --output "$CLRS_RUN_DIRECTORY" \
  --run-id local-go-development-001 --execute --json
```

Run the same command with `--check` instead of `--execute` to check the retained
bundle without invoking a specialist or writing files. The checker requires
the original input tree and run identity. It checks file identities and
replays the existing admission, policy and held-reference verification rules;
recomputed hashes alone cannot make an altered answer pass. Its
`bundle-consistent-unadmitted` state describes consistency, not authenticated
execution. Keep the external process exit status as well as the bundle.

A successful execution writes `run-start.json`, 192 ordered decision,
invocation, verification and terminal events under `events/`, and
`receipt.json`. Failures after output creation retain partial evidence and
return non-zero. The schema-1 receipt binds source records, fixture files,
software build identity and executable bytes; an unsigned local receipt does
not prove how those bytes were compiled or who ran them.

The run has a 60-second cooperative deadline, a one-second limit per request,
one active specialist and no retries. Journal limits are 256 events, 2 MiB per
event and 16 MiB in total; each receipt is limited to 1 MiB. File-system calls
cannot be forcibly interrupted by these Go deadlines. The Go process itself
does not impose CPU or memory quotas; Docker supplies the limits above.
Per-case elapsed times include controller and
verification work but exclude the terminal journal write; they are diagnostic
observations, not performance estimates. Whole-task energy is recorded as
unavailable, with joules left null.

All outputs remain `NO_RESULT`. This development path does not replace the
licence, image, containment, power-measurement or research-review gates required
for a released experiment or scientific comparison.

## Build and smoke

From the repository root, build the checksum-pinned Go 1.27.1 builder and
scratch runtime:

```bash
docker buildx build --load --platform linux/amd64 --network none \
  --file tooling/clrs-specialist/Dockerfile \
  --tag 20w-clrs-shakedown:development \
  --build-arg IMAGE_VERSION=development \
  --build-arg SOURCE_REVISION=unknown \
  --build-arg SOURCE_TIMESTAMP=unknown \
  .
```

`--network none` closes network access for Dockerfile `RUN` instructions.
BuildKit may still need a local cache or registry access to resolve the pinned
builder layers, so this command is not air-gapped or two-build image-identity
evidence. Those remain release-admission work below.

Run one request without a network, writable root, mount, shell, compiler, or
package manager:

```bash
timeout --signal=TERM --kill-after=2s 15s \
  docker run --rm --interactive --pull never \
  --network none \
  --read-only \
  --user 65532:65532 \
  --cap-drop ALL \
  --security-opt no-new-privileges \
  --cpus 1 \
  --memory 64m \
  --memory-swap 64m \
  --pids-limit 32 \
  --stop-timeout 5 \
  20w-clrs-shakedown:development \
  < tooling/clrs-specialist/smoke-request.json
```

The 1 CPU, hard 64 MiB memory ceiling with no swap, 32-PID ceiling, and
five-second stop grace period are containment controls for this development
smoke, not scientific resource or comparison bounds. The 15-second caller
guard bounds the complete container call, including output backpressure. The
request adds a 1–5,000 ms execution timeout, a 1 MiB prompt ceiling, and a
caller-selected result ceiling no larger than 1 MiB. The process
reads one strict JSON value, rejects duplicate, aliased, or unknown fields and
trailing data, and writes one JSON line. Input parsing has a five-second budget;
input plus invocation share an eleven-second context budget; SIGINT or SIGTERM
cancels both. The application takes no request authority or configuration from
environment variables, network services, or mounted host data.

`SOURCE_REVISION=unknown` is deliberate for a potentially dirty local checkout.
CI supplies its exact checked-out commit; any future release must build from an
exact admitted tag rather than relabel a local image.

## Closed routes

| Task | Required specialist identity |
| --- | --- |
| `insertion_sort` | `clrs-exact-insertion-sort-v1` |
| `binary_search` | `clrs-exact-binary-search-v1` |
| `matrix_chain_order` | `clrs-exact-matrix-chain-v1` |
| `bellman_ford` | `clrs-exact-bellman-ford-v1` |
| `kmp_matcher` | `clrs-exact-kmp-matcher-v1` |
| `segments_intersect` | `clrs-exact-segments-intersect-v1` |

The request must carry the frozen source and generation-contract identities.
The controller-created binding is echoed unchanged so the outer policy can
reject substitution and independently verify a completed payload. A typed
specialist refusal is a valid process response; malformed envelopes,
cancellation, timeouts, and internal failures return a non-zero exit status.

Do not promote this request schema or image by only adding it to the release
manifest. Release admission first needs a CLRS experiment identity; an exact
resolved-image-digest request field and refusal when it is absent; a receipt
binding mode, image digest, source revision, runtime, and platform; exact-digest
execution; licence review; an SBOM; source-bound provenance; and the repository's
image-admission checks. Until that separate change revises the fixed release
image manifest, report this local image tag plus its `docker image inspect` ID,
source revision, request, response, engine version, and host platform on
[issue 12](https://github.com/cordanaLLM/20-watts-was-enough/issues/12).
