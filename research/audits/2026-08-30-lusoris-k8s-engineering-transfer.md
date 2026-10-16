# Cluster mechanisms worth transferring, without transferring the cluster

<!-- markdownlint-disable MD013 -->

- **Audit date:** 2026-08-30
- **Status:** bounded engineering-transfer audit; no scientific result,
  architecture decision, claim, principle, candidate, fixture, or performance
  comparison
- **Historical tested source snapshot:** `lusoris/k8s` commit
  `91ef1abda09df5361859bd1010703113b3d439da`,
  which the local checkout and GitHub `main` both resolved to at the original
  audit close. Earlier checkout movement during that pass changed none of the
  scoped files. The source citations and test counts in the original audit bind to
  this commit.
- **Later observed source snapshot:** `lusoris/k8s` commit
  `6ff7852a84600ae83ff97e15c0b3524260832a34`,
  which the local checkout and GitHub `main` both resolved to at
  `2026-08-30T19:47:55+02:00`. The later source comparison and live observation
  below bind only to that commit and time; the focused tests were not rerun.
- **Source access:** `lusoris/k8s` is a private repository (checked
  2026-10-16). The commits cited below are recorded by full hash but cannot be
  inspected publicly; the audit's observations rest on those recorded hashes and
  on the read-only inspection described here, not on public links.
- **Scope:** the Queue-Drain Optimizer (QDO), the llama-swap model-process
  manager, the LiteLLM gateway's QDO admission path, and the Paperclip work
  dispatcher; the wider cluster was not reviewed
- **Historical method:** read-only source and history inspection plus focused
  local unit and chart tests at the historical tested snapshot; no live-cluster
  inspection, mutation, or fresh production experiment
- **Refresh method:** exact Git comparison plus read-only GitHub, Argo CD,
  Kubernetes API, service-readiness, and metrics queries at the later snapshot;
  no source test rerun, live mutation, or production experiment
- **Licensing boundary:** no repository-wide licence was present at the
  inspected root, so no source code is copied into this project. Only
  independently described mechanisms and test situations are retained here.

## Finding

The cluster is already useful as an engineering donor. It has exercised a
controller outside the model, one executor per accelerator device,
measurement-derived
resource admission, expiring lane signals, queue-aware backpressure, bounded
fairness, and a distinction between proxy health and requested-model
readiness. Those are close to the proposed typed-specialist control arm.

It is not a scientific baseline for that arm. The deployment joins many
changing models, incidents, operators, workloads, patches, and hardware
conditions. Its records can identify mechanisms and construct stress cases;
they cannot establish that a small-specialist system beats a general model,
uses less energy, or transfers beyond this cluster.

## What the tested source exercised

This table remains pinned to the historical tested snapshot. The later live
observation establishes deployment state at one instant; it does not replace
the focused source tests or test the proposed research arm.

| Cluster mechanism | Direct record at the snapshot | Transfer retained here | Boundary |
| --- | --- | --- | --- |
| Separate controller, gateway, and executor authority | QDO's contract (`apps/ai/qdo/AGENTS.md` at `91ef1ab`) gives QDO one lane's residency decisions, llama-swap local process lifecycle, and LiteLLM request admission. | Keep routing, execution, admission, verification, and final action as typed authorities instead of allowing one model to acquire them implicitly. | The deployed components and protocols are implementation choices, not a universal topology. |
| Measurement-derived fit with explicit unknowns | QDO policy and pool tests (`apps/ai/qdo/tests` at `91ef1ab`) cover measured free memory, lane-scoped footprints, unreadable devices, unmeasured models, preference by measurement, and sole-resident learning. ADR-0062 (`docs/adr/0062-one-dynamic-accelerator-pool-and-loaded-model-admission.md` at `91ef1ab`) records the incident that motivated it. | Represent `measured fit`, `measured no-fit`, and `unknown` separately. Emit the measurements and decision inputs with every admission receipt. | Some unknowns deliberately fail open in lane steering while bounded-lane catalogue admission fails closed. That choice must be frozen per experiment boundary, not copied as one global rule. |
| Expiring, executor-scoped steering | QDO values (`apps/ai/qdo/values.yaml` at `91ef1ab`) publish a short-lived admission envelope for each device-backed execution lane; the paired LiteLLM tests (`apps/ai/litellm/tests/test_qdo_fence_admission_hook.py` at `91ef1ab`) cover malformed, missing, expired, refusing, and unavailable lane state. | Treat a specialist's present eligibility as expiring observed state, not a permanent capability or model-to-device map. | The Redis key and LiteLLM hook are cluster plumbing and are not transferred. |
| Loaded capability is different from reachable gateway | ADR-0062 (`docs/adr/0062-one-dynamic-accelerator-pool-and-loaded-model-admission.md` at `91ef1ab`) records requests admitted through a healthy proxy while no suitable physical model was ready. The llama-swap exporter contract (`apps/ai/llama-swap/README.md` at `91ef1ab`, section observability) keeps model state, in-flight work, completions, errors, and latency distinct. | Add a stress case in which the controller is healthy but the requested specialist is absent, loading, saturated, or unable to satisfy the typed request. | The incident is an engineering observation with changing operational confounders. It supplies a scenario, not an effect size. |
| Queue state changes the safe action | ADR-0088 (`docs/adr/0088-batch-calls-that-expire-into-a-deep-queue-are-rejected.md` at `91ef1ab`) separates an expired bounded wait with a shallow queue from one whose depth exceeds measured engine slots. Current tests cover the rejection, retry header, ledger release, disconnect, burst, and aged-call paths. | Make queue depth, service slots, deadline, caller class, cancellation, and retry semantics explicit inputs. Charge abandoned work rather than counting only completed calls. | A retrying batch consumer and an interactive request need not share the same failure policy. |
| Bounded fairness and recovery authority | Paperclip dispatcher tests (`apps/ai/paperclip-dispatcher/files` at `91ef1ab`) cover rotated cross-organization scheduling, per-class caps, circuit opening and half-open probes, and bounded state repair. Its contract (`apps/ai/paperclip-dispatcher/AGENTS.md` at `91ef1ab`) separates recurring selection from finite migration authority. | Give the controller explicit queue, retry, cancellation, recovery, and migration budgets. Test that an unhealthy specialist cannot consume every attempt. | Organization, database, and Kubernetes lifecycle rules are application-specific and stay out of the research controller. |

The most useful negative lesson is also transferable: a logical-model fence
was deployed and then disabled after it could block healthy physical workers
outside one lane. A control signal was scoped to the name the caller saw, not
to the resource that could safely act on it. The research arm should therefore
test whether a gate names the exact physical executor whose effects it can
control, not merely whether some lock or gate exists.

## Historical validation at the tested snapshot

The original audit reran four focused surfaces at
`91ef1abda09df5361859bd1010703113b3d439da`. They passed `503` tests in total:

- QDO: `195` Python unit tests, including pure policy, footprint learning,
  pool measurement, lane admission, bounded Redis transport, actuation gates,
  and engine-queue observation;
- LiteLLM's two QDO hooks: `115` Python tests for lane filtering, bounded
  admission, queue backpressure, cancellation and failure behavior;
- the Paperclip dispatcher: `119` Python tests for selection, caps, circuit
  state, fallbacks and bounded repair; and
- llama-swap: `10` Helm suites containing `74` configuration tests for
  artifact hydration, lifecycle, lane fit, batching, projection, monitoring
  and storage bounds.

At that same commit, the QDO Helm configuration suite was not clean: `17`
assertions passed and one deliberately invalid `source: guesswork` case errored
because the values schema
rejected the value before the test could reach its expected template-failure
assertion. The rejection itself is fail-fast, but the harness and assertion
layer disagree. This audit does not round that result up to a passing chart
suite. Later source changes align the assertion with schema-first rejection,
but no current chart result is inferred from that edit.

During the original pass, repository records additionally described live
burn-in and incident-derived changes, including enforcing drain-gated
arbitration and observed queue, thrash, timeout, and readiness failures. Those
records were inspected but not reproduced against the live cluster. They
remain documented operational evidence, not independently reproduced results.

## Later source and live observation

At `2026-08-30T19:47:55+02:00`, the local `lusoris/k8s` checkout and the GitHub
`main` API both resolved to
`6ff7852a84600ae83ff97e15c0b3524260832a34`. Read-only queries then observed:

- the `litellm`, `llama-swap`, `llama-swap-b580`, `paperclip-dispatcher`, `qdo`,
  and `qdo-b580` Argo CD Applications all reported `Synced` and `Healthy` at
  that exact revision;
- the LiteLLM Deployment reported `2/2` ready replicas, while each llama-swap
  and QDO Deployment reported `1/1`;
- llama-swap's two `/running` endpoints reported `qwen3-5-4b`, `qwen3-8-27b`,
  and `qwythos-9b-v2` in `ready` state;
- the live QDO Deployment carried
  `QDO_ENGINE_QUEUE_ALLOWANCE_RATIO=0.5`; the two QDO metrics endpoints exposed
  `qdo_lane_admit_writes_total` values of `2,981` and `2,950`,
  `qdo_vram_signal_available=1`, and `qdo_fence_redis_errors_total=0` in their
  current process lifetimes; and
- the Paperclip dispatcher CronJob was not suspended and recorded its latest
  successful tick at `2026-08-30T17:47:14Z`.

The refresh used bounded `gh api`, `kubectl get`, and Kubernetes API-proxy
`GET` requests only. These observations establish one-time GitOps convergence,
process readiness, loaded-model state, and metric availability. They do not
show that every route succeeded, that the queue policy is correct under load,
that the cumulative counters cover an experiment boundary, or that the
small-specialist hypothesis saves energy.

## Bounded drift after the historical test campaign

The exact comparison from the tested snapshot to the later observed snapshot
(`91ef1abda09df5361859bd1010703113b3d439da` to
`6ff7852a84600ae83ff97e15c0b3524260832a34`) contains two scoped changes:

1. `3f8b141db9cb9a0590700eb4c13feb40cfe702f0`
   changes QDO's engine-queue tolerance from one flat allowance to a
   slot-scaled allowance with a configured ceiling and floor. It changes the
   controller, values, schema, Deployment projection, and focused tests. It
   also updates the Helm assertion that previously disagreed with schema-first
   rejection. The live environment showed the new ratio, but this audit did
   not rerun the changed tests or exercise the policy under a controlled load.
2. `25002e6632b95e5191a16c425ff2867c3e01d4af`
   adds the Cauda Cluster Ops boss-lead bootstrap record and its LiteLLM access
   projection. It changes the seeded organization and access population, not
   the dispatcher's work-selection algorithm.

The pure QDO policy module, LiteLLM's QDO admission hook, llama-swap values, and
Paperclip dispatcher implementation are byte-unchanged across the two
snapshots. The controller/executor separation and test-scenario transfers
therefore remain applicable engineering leads. The `503` count and QDO chart
disagreement remain historical evidence for the old commit; the complete test
status and count at `6ff7852a84600ae83ff97e15c0b3524260832a34` are unknown.

## Gaps retained as test material

The tested snapshot is neither complete nor internally uniform:

- QDO publishes a measured pool view but does not lock or schedule work across
  devices. Static gateway-to-lane topology remains load-bearing.
- ADR-0062 asks for fail-closed loaded-model readiness, while the current lane
  hook deliberately fails open on missing or malformed envelopes and after a
  bounded interactive wait. That hook is best-effort steering, not the
  proposed readiness gate.
- Batch admission reads a sorted-set count and performs a later `ZADD`; the
  reservation is not one atomic operation across gateway replicas. Burst tests
  do not prove that two replicas cannot over-admit the same final slot.
- The dispatcher's source defaults remain `14` global and `-q27:4`, while the
  deployed values inject `12` and `-q27:2`. Cluster deployment masks that
  mismatch; direct execution does not.
- Proposed ADRs and retained rollout prose describe several older settings.
  Current values, source and tests therefore outrank their status narratives.

These are useful falsification cases for a later Go adapter: global-view
without global authority, best-effort versus fail-closed admission, atomic
reservation under competing controllers, and configured versus fallback
policy. They are not defects this research repository can silently correct in
the separate cluster.

## Adaptation boundary

The reusable unit is a small policy package plus fixtures, not a containerized
copy of the cluster. A later implementation should translate the behavior into
Go with no Kubernetes, Helm, LiteLLM, Redis, or model-name dependency:

1. a pure typed admission function over capability readiness, measured
   resource fit, queue state, caller class, deadline, and evidence freshness;
2. a closed decision receipt recording every input, unknown, selected action,
   rejected alternative, expiry, and resource accounting boundary;
3. scenario fixtures for healthy-controller/unavailable-specialist,
   measurement unavailable, stale state, deep queue at deadline, caller
   cancellation, retry, and one unhealthy specialist monopolizing attempts;
4. comparators that run the same scenarios without the controller policy and
   with a capacity-matched general model; and
5. energy, latency, task quality, failure, abandoned-work, cold-start, and
   controller-overhead accounting over the same accepted-task boundary.

Do not import the cluster's hardware numbers, model priorities, queue caps,
timeouts, hostnames, incident frequencies, or observed throughput as research
constants. Derive or freeze each from the target experiment. Do not describe
the existing cluster as the proposed AI brain: it is one operational source of
controller problems and tested policy shapes, not a result for the research
hypothesis.

## Immediate disposition

This audit sharpens the held typed-specialist comparison without creating a
new architecture candidate. The first implementation slice, when its task
family is chosen, should reuse these scenario shapes in a dependency-light Go
policy package and expose them through the existing containerized experiment
runner. Until the task, comparator, measurements, and stopping law are frozen,
the work remains an engineering adapter lead under
[OQ-068](../open-questions.md#architecture).
