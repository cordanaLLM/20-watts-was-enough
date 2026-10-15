import { createHash } from "node:crypto";
import { lstat, readFile, realpath } from "node:fs/promises";
import path from "node:path";
import {
  assertDisjointSeedPacks,
  inspectSeedCommitment,
  revealSeedPack,
} from "./seeds/seed-pack.mjs";
import {
  computeSourceBundle,
  verifyCandidate010SourceBundleAtRoot,
} from "./source-bundle.mjs";

export const RELEASE_CONTRACT_VERSION = "candidate-010.frozen-seed-release.v3";

const BINDING_NAMES = Object.freeze([
  "source_bundle",
  "execution_descriptor",
  "runtime_identity",
  "config",
  "design",
  "backend_registry",
  "preregistration",
  "commitment",
  "reveal",
]);

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function canonical(value) {
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("Release canonicalization rejects non-finite numbers.");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => {
      if (value[key] === undefined) throw new TypeError(`Release canonicalization rejects undefined at ${key}.`);
      return `${JSON.stringify(key)}:${canonical(value[key])}`;
    }).join(",")}}`;
  }
  throw new TypeError(`Release canonicalization rejects ${typeof value}.`);
}

function exactKeys(value, keys) {
  return (
    value
    && typeof value === "object"
    && !Array.isArray(value)
    && canonical(Object.keys(value).sort()) === canonical([...keys].sort())
  );
}

function normalizeRelativePath(value) {
  if (typeof value !== "string" || value.length === 0) throw new Error("Release binding paths must be non-empty strings.");
  const normalized = value.replaceAll("\\", "/");
  if (
    path.isAbsolute(value)
    || normalized === ".."
    || normalized.startsWith("../")
    || normalized.includes("/../")
  ) {
    throw new Error(`Release binding path escapes its root: ${value}`);
  }
  return normalized;
}

function pathIsInside(root, target) {
  const relation = path.relative(root, target);
  return relation === "" || (!relation.startsWith("..") && !path.isAbsolute(relation));
}

function samePath(left, right) {
  return path.relative(left, right) === "" && path.relative(right, left) === "";
}

async function strictRoot(root, label) {
  if (typeof root !== "string" || root.length === 0) throw new Error(`${label} must be a non-empty path.`);
  const absolute = path.resolve(root);
  const information = await lstat(absolute);
  if (information.isSymbolicLink() || !information.isDirectory()) {
    throw new Error(`${label} must be a regular directory, not a symbolic link or reparse point.`);
  }
  const resolved = await realpath(absolute);
  if (!samePath(absolute, resolved)) {
    throw new Error(`${label} refuses symbolic-link or reparse-point traversal in its root path.`);
  }
  return resolved;
}

function rootRoles({ root, bindingRoot, sourceRoot }) {
  if (root !== undefined) {
    if (bindingRoot !== undefined || sourceRoot !== undefined) {
      throw new Error("Legacy root cannot be combined with explicit bindingRoot or sourceRoot roles.");
    }
    return {
      bindingRoot: root,
      sourceRoot: root,
      exactSourceRoot: false,
      sourceRootMode: "legacy-single-root-development-v1",
    };
  }
  if (bindingRoot === undefined || sourceRoot === undefined) {
    throw new Error("Frozen release requires both explicit bindingRoot and sourceRoot roles.");
  }
  return {
    bindingRoot,
    sourceRoot,
    exactSourceRoot: true,
    sourceRootMode: "separate-exact-capsule-root-v1",
  };
}

function boundPath(root, relative) {
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, ...normalizeRelativePath(relative).split("/"));
  const relation = path.relative(resolvedRoot, resolved);
  if (relation === "" || relation === ".." || relation.startsWith(`..${path.sep}`) || path.isAbsolute(relation)) {
    throw new Error(`Release binding path escapes its root: ${relative}`);
  }
  return resolved;
}

async function containedRegularFile(root, file, label, { relativeOnly = true } = {}) {
  const resolvedRoot = await strictRoot(root, `${label} root`);
  let absolute;
  if (relativeOnly) {
    absolute = boundPath(resolvedRoot, file);
  } else {
    if (typeof file !== "string" || file.length === 0) throw new Error(`${label} path must be non-empty.`);
    absolute = path.isAbsolute(file)
      ? path.resolve(file)
      : boundPath(resolvedRoot, file);
    if (!pathIsInside(resolvedRoot, absolute) || samePath(resolvedRoot, absolute)) {
      throw new Error(`${label} path escapes its root.`);
    }
  }
  const relative = path.relative(resolvedRoot, absolute);
  let current = resolvedRoot;
  for (const component of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, component);
    const componentInformation = await lstat(current);
    if (componentInformation.isSymbolicLink()) {
      throw new Error(`${label} refuses symbolic-link or reparse-point traversal.`);
    }
  }
  const [information, resolved] = await Promise.all([lstat(absolute), realpath(absolute)]);
  if (information.isSymbolicLink() || !information.isFile() || !pathIsInside(resolvedRoot, resolved)) {
    throw new Error(`${label} must be a contained regular file.`);
  }
  return resolved;
}

async function readBinding(root, binding, name) {
  if (
    !binding
    || typeof binding.path !== "string"
    || !/^[0-9a-f]{64}$/.test(binding.sha256 ?? "")
  ) {
    throw new Error(`Invalid ${name} release binding.`);
  }
  const file = await containedRegularFile(root, binding.path, `Bound ${name}`);
  const body = await readFile(file);
  if (sha256(body) !== binding.sha256) throw new Error(`Bound ${name} file hash mismatch.`);
  return { file, body };
}

async function createBinding(root, relative) {
  const normalized = normalizeRelativePath(relative);
  const body = await readFile(await containedRegularFile(root, normalized, "Release binding"));
  return Object.freeze({ path: normalized, sha256: sha256(body) });
}

function validatePartition(partition, phase) {
  if (!new Set(["confirmation", "held-out"]).has(partition)) {
    throw new Error(`Unsupported frozen release partition: ${partition}`);
  }
  if (phase !== partition) {
    throw new Error(`Frozen release partition ${partition} requires phase ${partition}.`);
  }
}

async function validateFullSourceBundle({ bindingRoot, sourceRoot, sourceBinding, exactSourceRoot }) {
  const { body } = await readBinding(bindingRoot, sourceBinding, "source_bundle");
  let document;
  try {
    document = JSON.parse(body);
  } catch (error) {
    throw new Error(`Bound source bundle is invalid JSON: ${error.message}`, { cause: error });
  }
  if (
    document?.schema !== 1
    || !/^[0-9a-f]{64}$/.test(document.source_sha256 ?? "")
    || !/^[0-9a-f]{40}$/.test(document.vcs?.source_commit ?? "")
    || !Array.isArray(document.files)
    || document.files.length === 0
  ) {
    throw new Error("Bound source bundle has an invalid identity.");
  }
  const recomputed = exactSourceRoot
    ? await verifyCandidate010SourceBundleAtRoot({ sourceRoot, expectedBundle: document })
    : await computeSourceBundle({
        root: sourceRoot,
        sourceFiles: document.files.map((entry) => entry.path),
        vcs: document.vcs,
      });
  if (
    recomputed.source_sha256 !== document.source_sha256
    || canonical(recomputed.files) !== canonical(document.files)
  ) {
    throw new Error("Full source bundle does not match the bound executable sources.");
  }
  return document;
}

function parseBoundJson(body, label) {
  try {
    return JSON.parse(body);
  } catch (error) {
    throw new Error(`Bound ${label} is invalid JSON: ${error.message}`, { cause: error });
  }
}

function runtimeIdentityDigest(document) {
  const { identity_sha256: ignored, ...body } = document;
  void ignored;
  return sha256(canonical(body));
}

function validateRuntimeIdentityDocument(document) {
  if (
    !exactKeys(document, [
      "schema",
      "artifact",
      "contract_version",
      "confirmation_claim_eligible",
      "limits",
      "runtime",
      "package_lock",
      "external_production_dependencies",
      "external_production_dependency_names",
      "identity_sha256",
    ])
    || document.schema !== 1
    || document.artifact !== "candidate-010"
    || document.contract_version !== "candidate-010.runtime-identity.v1"
    || document.confirmation_claim_eligible !== false
    || document.identity_sha256 !== runtimeIdentityDigest(document)
    || !/^[0-9a-f]{64}$/.test(document.runtime?.executable_sha256 ?? "")
    || !Number.isSafeInteger(document.runtime?.executable_bytes)
    || document.runtime.executable_bytes < 1
    || typeof document.runtime?.version !== "string"
    || typeof document.runtime?.exec_path !== "string"
    || typeof document.runtime?.exec_path_realpath !== "string"
    || !/^[0-9a-f]{64}$/.test(document.package_lock?.sha256 ?? "")
    || !Number.isSafeInteger(document.package_lock?.bytes)
    || document.package_lock.bytes < 1
    || !Array.isArray(document.external_production_dependencies)
    || !Array.isArray(document.external_production_dependency_names)
  ) throw new Error("Bound runtime identity has an invalid exact shape or self-digest.");
  const names = [];
  for (const dependency of document.external_production_dependencies) {
    if (
      typeof dependency?.name !== "string"
      || typeof dependency.version !== "string"
      || dependency.production_usage !== true
      || typeof dependency.package_root !== "string"
      || !dependency.package_root.startsWith("node_modules/")
      || !Array.isArray(dependency.files)
      || dependency.files.length === 0
      || dependency.files_count !== dependency.files.length
      || dependency.bytes !== dependency.files.reduce((sum, row) => sum + row.bytes, 0)
      || dependency.inventory_sha256 !== sha256(canonical(dependency.files))
    ) throw new Error("Bound runtime dependency inventory has an invalid shape or self-digest.");
    for (const file of dependency.files) {
      if (
        typeof file?.path !== "string"
        || !Number.isSafeInteger(file.bytes)
        || file.bytes < 0
        || !/^[0-9a-f]{64}$/.test(file.sha256 ?? "")
      ) throw new Error("Bound runtime dependency file identity is invalid.");
    }
    names.push(dependency.name);
  }
  if (canonical(names) !== canonical(document.external_production_dependency_names)) {
    throw new Error("Bound runtime dependency names disagree with their inventories.");
  }
  return document;
}

function sourceInventoryDigest(files) {
  const aggregate = createHash("sha256");
  for (const row of files) {
    aggregate.update(`${Buffer.byteLength(row.path)}:${row.path}:${row.bytes}:${row.sha256}\n`);
  }
  return aggregate.digest("hex");
}

function flattenedRuntimeDependencyFiles(runtimeIdentity) {
  return runtimeIdentity.external_production_dependencies.flatMap((dependency) => (
    dependency.files.map((file) => ({
      path: `${dependency.package_root}/${file.path}`,
      bytes: file.bytes,
      sha256: file.sha256,
    }))
  )).sort((left, right) => left.path.localeCompare(right.path));
}

function executionDescriptorDigest(document) {
  const { descriptor_sha256: ignored, ...body } = document;
  void ignored;
  return sha256(canonical(body));
}

function validateExecutionDescriptorDocument(document) {
  if (
    !exactKeys(document, [
      "schema",
      "artifact",
      "contract_version",
      "confirmation_claim_eligible",
      "layout",
      "source",
      "runtime_identity",
      "dependencies",
      "limits",
      "descriptor_sha256",
    ])
    || document.schema !== 1
    || document.artifact !== "candidate-010"
    || document.contract_version !== "candidate-010.execution-capsule.v1"
    || document.confirmation_claim_eligible !== false
    || document.limits?.execution_authority !== "none"
    || document.descriptor_sha256 !== executionDescriptorDigest(document)
    || !/^[0-9a-f]{40}$/.test(document.source?.head_commit ?? "")
    || !Array.isArray(document.source?.source_paths)
    || !Array.isArray(document.source?.inventory?.files)
    || document.source.source_paths.length === 0
    || document.source.inventory.file_count !== document.source.inventory.files.length
    || document.source.inventory.total_bytes !== document.source.inventory.files.reduce((sum, row) => sum + row.bytes, 0)
    || document.source.inventory.inventory_sha256 !== sourceInventoryDigest(document.source.inventory.files)
    || document.source.inventory_sha256 !== document.source.inventory.inventory_sha256
  ) throw new Error("Bound execution-capsule descriptor has an invalid exact shape or self-digest.");
  const sourceFiles = document.source.inventory.files;
  for (const file of sourceFiles) {
    if (
      typeof file?.path !== "string"
      || !Number.isSafeInteger(file.bytes)
      || file.bytes < 0
      || !/^[0-9a-f]{64}$/.test(file.sha256 ?? "")
    ) throw new Error("Bound execution source file identity is invalid.");
  }
  if (
    canonical(document.source.source_paths) !== canonical(sourceFiles.map((row) => row.path))
    || new Set(document.source.source_paths).size !== document.source.source_paths.length
  ) throw new Error("Bound execution source paths disagree with their inventory.");
  const runtimeIdentity = validateRuntimeIdentityDocument(document.runtime_identity);
  const dependencyInventory = document.dependencies?.inventory;
  if (
    !Array.isArray(dependencyInventory?.files)
    || dependencyInventory.files_count !== dependencyInventory.files.length
    || dependencyInventory.bytes !== dependencyInventory.files.reduce((sum, row) => sum + row.bytes, 0)
    || dependencyInventory.inventory_sha256 !== sha256(canonical(dependencyInventory.files))
    || canonical(dependencyInventory.files) !== canonical(flattenedRuntimeDependencyFiles(runtimeIdentity))
    || canonical(document.dependencies.names) !== canonical(runtimeIdentity.external_production_dependency_names)
  ) throw new Error("Bound execution dependency identity disagrees with its runtime identity.");
  return document;
}

async function validateExecutionRuntimeBindings({ bindingRoot, bindings, sourceBundle }) {
  const [descriptorBinding, runtimeBinding] = await Promise.all([
    readBinding(bindingRoot, bindings.execution_descriptor, "execution_descriptor"),
    readBinding(bindingRoot, bindings.runtime_identity, "runtime_identity"),
  ]);
  const executionDescriptor = validateExecutionDescriptorDocument(parseBoundJson(
    descriptorBinding.body,
    "execution descriptor",
  ));
  const runtimeIdentity = validateRuntimeIdentityDocument(parseBoundJson(
    runtimeBinding.body,
    "runtime identity",
  ));
  if (
    executionDescriptor.source.head_commit !== sourceBundle.vcs.source_commit
    || canonical(executionDescriptor.source.inventory.files) !== canonical(sourceBundle.files)
    || canonical(executionDescriptor.runtime_identity) !== canonical(runtimeIdentity)
  ) throw new Error("Execution descriptor, runtime identity, and source bundle do not describe one release identity.");
  return { executionDescriptor, runtimeIdentity };
}

function releaseDigest(document) {
  const { release_sha256: ignored, ...body } = document;
  void ignored;
  return sha256(canonical(body));
}

function validateReleaseDocument(document) {
  if (
    document?.schema !== 1
    || document.contract_version !== RELEASE_CONTRACT_VERSION
    || document.state !== "sealed-release"
    || !Number.isSafeInteger(document.release_version)
    || document.release_version < 1
    || !/^[0-9a-f]{64}$/.test(document.release_sha256 ?? "")
    || document.release_sha256 !== releaseDigest(document)
  ) {
    throw new Error("Invalid or corrupted frozen release contract.");
  }
  validatePartition(document.partition, document.phase);
  for (const name of BINDING_NAMES) {
    if (!document.bindings?.[name]) throw new Error(`Frozen release is missing binding ${name}.`);
  }
  if (
    !/^[0-9a-f]{64}$/.test(document.source_identity?.source_sha256 ?? "")
    || !/^[0-9a-f]{40}$/.test(document.source_identity?.source_commit ?? "")
    || !/^[0-9a-f]{64}$/.test(document.execution_identity?.descriptor_sha256 ?? "")
    || !/^[0-9a-f]{64}$/.test(document.execution_identity?.source_inventory_sha256 ?? "")
    || !/^[0-9a-f]{64}$/.test(document.execution_identity?.dependency_inventory_sha256 ?? "")
    || !/^[0-9a-f]{64}$/.test(document.runtime_identity?.identity_sha256 ?? "")
    || !/^[0-9a-f]{64}$/.test(document.runtime_identity?.executable_sha256 ?? "")
    || !/^[0-9a-f]{64}$/.test(document.runtime_identity?.package_lock_sha256 ?? "")
    || document.seed_pack?.algorithm !== "sha256-json-array-v1"
    || !Number.isSafeInteger(document.seed_pack?.seed_count)
    || document.seed_pack.seed_count < 1
    || !/^[0-9a-f]{64}$/.test(document.seed_pack?.commitment ?? "")
  ) {
    throw new Error("Frozen release identity metadata are invalid.");
  }
  return document;
}

/**
 * Build the sealed metadata document. Building validates the reveal, but does
 * not mark it frozen for execution; only openFrozenSeedRelease may do that.
 */
export async function createFrozenSeedReleaseContract({
  root,
  bindingRoot,
  sourceRoot,
  releaseVersion,
  partition,
  phase,
  sourceBundlePath,
  executionDescriptorPath,
  runtimeIdentityPath,
  configPath,
  designPath,
  backendRegistryPath,
  preregistrationPath,
  commitmentPath,
  revealPath,
}) {
  if (!Number.isSafeInteger(releaseVersion) || releaseVersion < 1) {
    throw new Error("Frozen release version must be a positive integer.");
  }
  validatePartition(partition, phase);
  const roots = rootRoles({ root, bindingRoot, sourceRoot });
  if (!roots.exactSourceRoot && partition === "confirmation") {
    throw new Error("Legacy single-root development mode cannot create a confirmation release.");
  }
  const resolvedBindingRoot = await strictRoot(roots.bindingRoot, "Release bindingRoot");
  const resolvedSourceRoot = await strictRoot(roots.sourceRoot, "Release sourceRoot");
  if (roots.exactSourceRoot && samePath(resolvedBindingRoot, resolvedSourceRoot)) {
    throw new Error("Explicit release bindingRoot and sourceRoot roles must be distinct.");
  }
  const paths = {
    source_bundle: sourceBundlePath,
    execution_descriptor: executionDescriptorPath,
    runtime_identity: runtimeIdentityPath,
    config: configPath,
    design: designPath,
    backend_registry: backendRegistryPath,
    preregistration: preregistrationPath,
    commitment: commitmentPath,
    reveal: revealPath,
  };
  const bindings = Object.fromEntries(await Promise.all(BINDING_NAMES.map(async (name) => (
    [name, await createBinding(resolvedBindingRoot, paths[name])]
  ))));
  const sourceBundle = await validateFullSourceBundle({
    bindingRoot: resolvedBindingRoot,
    sourceRoot: resolvedSourceRoot,
    sourceBinding: bindings.source_bundle,
    exactSourceRoot: roots.exactSourceRoot,
  });
  const { executionDescriptor, runtimeIdentity } = await validateExecutionRuntimeBindings({
    bindingRoot: resolvedBindingRoot,
    bindings,
    sourceBundle,
  });
  const commitment = await inspectSeedCommitment(await containedRegularFile(
    resolvedBindingRoot,
    bindings.commitment.path,
    "Bound commitment",
  ));
  const reveal = await revealSeedPack({
    commitmentPath: await containedRegularFile(resolvedBindingRoot, bindings.commitment.path, "Bound commitment"),
    revealPath: await containedRegularFile(resolvedBindingRoot, bindings.reveal.path, "Bound reveal"),
    phase,
  });
  if (commitment.partition !== partition || reveal.partition !== partition) {
    throw new Error("Release partition does not match its seed pack.");
  }
  const body = {
    schema: 1,
    contract_version: RELEASE_CONTRACT_VERSION,
    state: "sealed-release",
    release_version: releaseVersion,
    partition,
    phase,
    source_identity: {
      source_sha256: sourceBundle.source_sha256,
      source_commit: sourceBundle.vcs.source_commit,
    },
    execution_identity: {
      descriptor_sha256: executionDescriptor.descriptor_sha256,
      source_inventory_sha256: executionDescriptor.source.inventory_sha256,
      dependency_inventory_sha256: executionDescriptor.dependencies.inventory.inventory_sha256,
    },
    runtime_identity: {
      identity_sha256: runtimeIdentity.identity_sha256,
      executable_sha256: runtimeIdentity.runtime.executable_sha256,
      package_lock_sha256: runtimeIdentity.package_lock.sha256,
    },
    seed_pack: {
      algorithm: commitment.algorithm,
      seed_count: commitment.seed_count,
      commitment: commitment.commitment,
    },
    bindings,
  };
  return Object.freeze({ ...body, release_sha256: sha256(canonical(body)) });
}

/**
 * Open a release for execution. The `frozen_release` capability is created only
 * after every bound byte, source file, seed commitment, phase and disjointness
 * check succeeds.
 */
export async function openFrozenSeedRelease({
  root,
  bindingRoot,
  sourceRoot,
  releasePath,
  expectedPartition,
  phase,
  disjointWith,
  executionDescriptor,
  runtimeIdentity,
}) {
  if (!Array.isArray(disjointWith)) {
    throw new Error("Opening a frozen release requires an explicit disjointWith seed-pack array.");
  }
  const roots = rootRoles({ root, bindingRoot, sourceRoot });
  if (!roots.exactSourceRoot && expectedPartition === "confirmation") {
    throw new Error("Legacy single-root development mode cannot open a confirmation release.");
  }
  const resolvedBindingRoot = await strictRoot(roots.bindingRoot, "Release bindingRoot");
  const resolvedSourceRoot = await strictRoot(roots.sourceRoot, "Release sourceRoot");
  if (roots.exactSourceRoot && samePath(resolvedBindingRoot, resolvedSourceRoot)) {
    throw new Error("Explicit release bindingRoot and sourceRoot roles must be distinct.");
  }
  const resolvedReleasePath = await containedRegularFile(
    resolvedBindingRoot,
    releasePath,
    "Frozen release",
    { relativeOnly: false },
  );
  const release = validateReleaseDocument(JSON.parse(await readFile(resolvedReleasePath, "utf8")));
  if (release.partition !== expectedPartition || release.phase !== phase || expectedPartition !== phase) {
    throw new Error(`Frozen release may only open for exact partition and phase ${release.partition}.`);
  }
  const resolvedBindings = {};
  for (const name of BINDING_NAMES) {
    resolvedBindings[name] = await readBinding(resolvedBindingRoot, release.bindings[name], name);
  }
  const sourceBundle = await validateFullSourceBundle({
    bindingRoot: resolvedBindingRoot,
    sourceRoot: resolvedSourceRoot,
    sourceBinding: release.bindings.source_bundle,
    exactSourceRoot: roots.exactSourceRoot,
  });
  if (
    sourceBundle.source_sha256 !== release.source_identity.source_sha256
    || sourceBundle.vcs.source_commit !== release.source_identity.source_commit
  ) {
    throw new Error("Release source identity does not match its full source bundle.");
  }
  const boundExecutionRuntime = await validateExecutionRuntimeBindings({
    bindingRoot: resolvedBindingRoot,
    bindings: release.bindings,
    sourceBundle,
  });
  const currentExecutionDescriptor = validateExecutionDescriptorDocument(executionDescriptor);
  const currentRuntimeIdentity = validateRuntimeIdentityDocument(runtimeIdentity);
  if (
    canonical(currentExecutionDescriptor) !== canonical(boundExecutionRuntime.executionDescriptor)
    || canonical(currentRuntimeIdentity) !== canonical(boundExecutionRuntime.runtimeIdentity)
  ) throw new Error("Current verified execution descriptor or runtime identity differs from the frozen release bindings.");
  if (
    release.execution_identity.descriptor_sha256 !== boundExecutionRuntime.executionDescriptor.descriptor_sha256
    || release.execution_identity.source_inventory_sha256 !== boundExecutionRuntime.executionDescriptor.source.inventory_sha256
    || release.execution_identity.dependency_inventory_sha256 !== boundExecutionRuntime.executionDescriptor.dependencies.inventory.inventory_sha256
    || release.runtime_identity.identity_sha256 !== boundExecutionRuntime.runtimeIdentity.identity_sha256
    || release.runtime_identity.executable_sha256 !== boundExecutionRuntime.runtimeIdentity.runtime.executable_sha256
    || release.runtime_identity.package_lock_sha256 !== boundExecutionRuntime.runtimeIdentity.package_lock.sha256
  ) throw new Error("Release execution/runtime identity metadata disagree with their bound artifacts.");
  const commitment = await inspectSeedCommitment(resolvedBindings.commitment.file);
  const reveal = await revealSeedPack({
    commitmentPath: resolvedBindings.commitment.file,
    revealPath: resolvedBindings.reveal.file,
    phase,
  });
  if (
    commitment.partition !== release.partition
    || reveal.partition !== release.partition
    || commitment.algorithm !== release.seed_pack.algorithm
    || commitment.seed_count !== release.seed_pack.seed_count
    || commitment.commitment !== release.seed_pack.commitment
    || reveal.commitment !== release.seed_pack.commitment
  ) {
    throw new Error("Opened seed pack does not match the frozen release metadata.");
  }
  const partitions = new Set([release.partition]);
  for (const pack of disjointWith) {
    if (!pack || typeof pack.partition !== "string" || partitions.has(pack.partition)) {
      throw new Error("Disjointness inputs require distinct named seed partitions.");
    }
    partitions.add(pack.partition);
  }
  assertDisjointSeedPacks([reveal, ...disjointWith]);
  return Object.freeze({
    schema: 1,
    contract_version: release.contract_version,
    release_version: release.release_version,
    release_sha256: release.release_sha256,
    partition: release.partition,
    phase: release.phase,
    source_root_mode: roots.sourceRootMode,
    source_identity: Object.freeze({ ...release.source_identity }),
    execution_binding: Object.freeze({ ...release.execution_identity }),
    runtime_binding: Object.freeze({ ...release.runtime_identity }),
    seed_pack: Object.freeze({ ...release.seed_pack }),
    seeds: reveal.seeds,
    frozen_release: true,
  });
}
