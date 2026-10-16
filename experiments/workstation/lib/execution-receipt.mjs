const artifactPattern = /^(?:candidate|fixture)-[0-9]{3}$/u;
const imageNamePattern = /^[a-z0-9][a-z0-9._/-]{0,199}$/u;
const releaseVersionPattern = /^v?(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)(?:-rc\.(?:0|[1-9][0-9]*))?$/u;
const imageVersionPattern = new RegExp(`^(?:development|${releaseVersionPattern.source.slice(1, -1)})$`, "u");
const sourceRevisionPattern = /^[0-9a-f]{40}$/u;
const digestPattern = /^sha256:[0-9a-f]{64}$/u;
const tokenPattern = /^[a-z][a-z0-9-]{0,31}$/u;
const runtimeTokenPattern = /^[A-Za-z0-9._-]{1,64}$/u;

export const EXPERIMENT_EXECUTION_RECEIPT_VERSION = "experiment.execution-receipt.v1";
export const EXPERIMENT_RESULT_AUTHORITY = "NO_RESULT";
export const EXPERIMENT_AUTHORITY_REASON =
  "Execution identity for a development diagnostic only; no scientific, confirmation, comparison, performance, energy, or claim authority.";

const containerKeys = Object.freeze([
  "EXPERIMENT_ARTIFACT",
  "EXPERIMENT_IMAGE_NAME",
  "EXPERIMENT_IMAGE_VERSION",
  "EXPERIMENT_SOURCE_REVISION",
  "EXPERIMENT_RESULT_AUTHORITY",
]);

function exactKeys(value, keys) {
  return value
    && typeof value === "object"
    && !Array.isArray(value)
    && Object.keys(value).length === keys.length
    && keys.every((key) => Object.hasOwn(value, key));
}

function typedValue(state, value) {
  return Object.freeze({ state, value });
}

function parseContainerIdentity(environment, artifact) {
  const present = containerKeys.filter((key) => environment[key] !== undefined);
  const digest = environment.EXPERIMENT_IMAGE_DIGEST;
  if (present.length === 0 && digest === undefined) return null;
  if (present.length !== containerKeys.length) {
    throw new Error("Experiment image metadata is incomplete.");
  }
  if (environment.EXPERIMENT_ARTIFACT !== artifact) {
    throw new Error("Experiment image artifact does not match the runner.");
  }
  if (!imageNamePattern.test(environment.EXPERIMENT_IMAGE_NAME)) {
    throw new Error("Experiment image name is invalid.");
  }
  const version = environment.EXPERIMENT_IMAGE_VERSION;
  if (version !== "development" && !releaseVersionPattern.test(version)) {
    throw new Error("Experiment image version is invalid.");
  }
  const revision = environment.EXPERIMENT_SOURCE_REVISION;
  if (revision !== "unknown" && !sourceRevisionPattern.test(revision)) {
    throw new Error("Experiment source revision is invalid.");
  }
  if (environment.EXPERIMENT_RESULT_AUTHORITY !== EXPERIMENT_RESULT_AUTHORITY) {
    throw new Error("Experiment image result authority must remain NO_RESULT.");
  }
  if (digest !== undefined && !digestPattern.test(digest)) {
    throw new Error("Experiment image digest must be an exact sha256 digest.");
  }
  if (version !== "development" && digest === undefined) {
    throw new Error("A release experiment image requires EXPERIMENT_IMAGE_DIGEST=sha256:<64 lowercase hex digits>.");
  }
  if (version !== "development" && revision === "unknown") {
    throw new Error("A release experiment image requires its exact source revision.");
  }
  return Object.freeze({
    digest: digest ?? null,
    name: environment.EXPERIMENT_IMAGE_NAME,
    revision,
    version,
  });
}

export function assertExperimentExecutionEnvironment({
  artifact,
  environment = process.env,
}) {
  if (!artifactPattern.test(artifact ?? "")) throw new Error("Experiment artifact is invalid.");
  return parseContainerIdentity(environment, artifact);
}

function localReceiptFields() {
  return Object.freeze({
    executionMode: "source",
    image: Object.freeze({
      name: typedValue("unavailable-local", null),
      version: typedValue("unavailable-local", null),
      digest: typedValue("unavailable-local", null),
    }),
    revision: typedValue("local-worktree", null),
  });
}

function containerReceiptFields(container) {
  const release = container.version !== "development";
  return Object.freeze({
    executionMode: release ? "release-image" : "development-image",
    image: Object.freeze({
      name: typedValue("declared", container.name),
      version: typedValue("declared", container.version),
      digest: container.digest === null
        ? typedValue("unavailable-development", null)
        : typedValue("explicit", container.digest),
    }),
    revision: container.revision === "unknown"
      ? typedValue("unavailable-development", null)
      : typedValue("declared", container.revision),
  });
}

export function createExperimentExecutionReceipt({
  artifact,
  command,
  profile,
  environment = process.env,
  runtime = process,
}) {
  if (!artifactPattern.test(artifact ?? "")) throw new Error("Experiment artifact is invalid.");
  if (!tokenPattern.test(command ?? "")) throw new Error("Experiment command is invalid.");
  if (!tokenPattern.test(profile ?? "")) throw new Error("Experiment profile is invalid.");
  if (!/^v[0-9]+\.[0-9]+\.[0-9]+(?:[-+][0-9A-Za-z.-]+)?$/u.test(runtime.version ?? "")) {
    throw new Error("Node.js runtime version is invalid.");
  }
  if (!runtimeTokenPattern.test(runtime.platform ?? "") || !runtimeTokenPattern.test(runtime.arch ?? "")) {
    throw new Error("Experiment runtime platform is invalid.");
  }
  const container = assertExperimentExecutionEnvironment({ artifact, environment });
  const fields = container === null ? localReceiptFields() : containerReceiptFields(container);
  return Object.freeze({
    contract_version: EXPERIMENT_EXECUTION_RECEIPT_VERSION,
    artifact,
    execution_mode: fields.executionMode,
    image: fields.image,
    source_revision: fields.revision,
    runtime: Object.freeze({
      node: runtime.version,
      os: runtime.platform,
      architecture: runtime.arch,
    }),
    command,
    profile,
    result_authority: EXPERIMENT_RESULT_AUTHORITY,
    authority_reason: EXPERIMENT_AUTHORITY_REASON,
  });
}

function assertTypedValue(value, states, pattern = null) {
  if (!exactKeys(value, ["state", "value"]) || !states.has(value.state)) return false;
  if (value.value === null) return !new Set(["declared", "explicit"]).has(value.state);
  return typeof value.value === "string" && pattern?.test(value.value) === true;
}

function validReceiptHeader(receipt, artifact, profile) {
  return receipt.contract_version === EXPERIMENT_EXECUTION_RECEIPT_VERSION
    && artifactPattern.test(receipt.artifact ?? "")
    && (artifact === undefined || receipt.artifact === artifact)
    && new Set(["source", "development-image", "release-image"]).has(receipt.execution_mode)
    && tokenPattern.test(receipt.command ?? "")
    && tokenPattern.test(receipt.profile ?? "")
    && (profile === undefined || receipt.profile === profile)
    && receipt.result_authority === EXPERIMENT_RESULT_AUTHORITY
    && receipt.authority_reason === EXPERIMENT_AUTHORITY_REASON;
}

function validImageFields(image) {
  return exactKeys(image, ["name", "version", "digest"])
    && assertTypedValue(image.name, new Set(["declared", "unavailable-local"]), imageNamePattern)
    && assertTypedValue(image.version, new Set(["declared", "unavailable-local"]), imageVersionPattern)
    && assertTypedValue(image.digest, new Set(["explicit", "unavailable-development", "unavailable-local"]), digestPattern);
}

function validRuntime(runtime) {
  return exactKeys(runtime, ["node", "os", "architecture"])
    && /^v[0-9]+\.[0-9]+\.[0-9]+(?:[-+][0-9A-Za-z.-]+)?$/u.test(runtime.node ?? "")
    && runtimeTokenPattern.test(runtime.os ?? "")
    && runtimeTokenPattern.test(runtime.architecture ?? "");
}

function validModeBinding(receipt) {
  if (receipt.execution_mode === "source") {
    return receipt.image.name.state === "unavailable-local"
      && receipt.image.version.state === "unavailable-local"
      && receipt.image.digest.state === "unavailable-local"
      && receipt.source_revision.state === "local-worktree";
  }
  if (receipt.execution_mode === "development-image") {
    return receipt.image.name.state === "declared"
      && receipt.image.version.state === "declared"
      && receipt.image.version.value === "development"
      && new Set(["explicit", "unavailable-development"]).has(receipt.image.digest.state)
      && new Set(["declared", "unavailable-development"]).has(receipt.source_revision.state);
  }
  return receipt.image.name.state === "declared"
    && receipt.image.version.state === "declared"
    && releaseVersionPattern.test(receipt.image.version.value ?? "")
    && receipt.image.digest.state === "explicit"
    && receipt.source_revision.state === "declared";
}

export function assertExperimentExecutionReceipt(receipt, { artifact, profile } = {}) {
  const keys = [
    "contract_version", "artifact", "execution_mode", "image", "source_revision",
    "runtime", "command", "profile", "result_authority", "authority_reason",
  ];
  const valid = exactKeys(receipt, keys)
    && validReceiptHeader(receipt, artifact, profile)
    && validImageFields(receipt.image)
    && assertTypedValue(receipt.source_revision, new Set(["declared", "local-worktree", "unavailable-development"]), sourceRevisionPattern)
    && validRuntime(receipt.runtime)
    && validModeBinding(receipt);
  if (!valid) throw new Error("Experiment execution receipt violates its closed contract.");
  return receipt;
}

function executionIdentityKey(receipt) {
  return JSON.stringify([
    receipt.execution_mode,
    receipt.image.name.state,
    receipt.image.name.value,
    receipt.image.version.state,
    receipt.image.version.value,
    receipt.image.digest.state,
    receipt.image.digest.value,
    receipt.source_revision.state,
    receipt.source_revision.value,
    receipt.runtime.node,
    receipt.runtime.os,
    receipt.runtime.architecture,
  ]);
}

export function assertCurrentExperimentExecutionIdentity(
  receipt,
  { artifact, profile, environment = process.env, runtime = process } = {},
) {
  assertExperimentExecutionReceipt(receipt, { artifact, profile });
  const current = createExperimentExecutionReceipt({
    artifact: receipt.artifact,
    command: receipt.command,
    profile: receipt.profile,
    environment,
    runtime,
  });
  if (executionIdentityKey(current) !== executionIdentityKey(receipt)) {
    throw new Error("Current experiment execution identity does not match the stored execution receipt.");
  }
  return receipt;
}
