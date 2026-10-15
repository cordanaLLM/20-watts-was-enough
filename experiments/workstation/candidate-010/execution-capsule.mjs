import { randomBytes } from "node:crypto";
import {
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { canonicalize, sha256Hex } from "./checkpoint.mjs";
import {
  buildImmutableExecutionCapsule,
  destroyImmutableExecutionCapsule,
  verifyImmutableExecutionCapsule,
} from "./immutable-capsule.mjs";
import {
  assertRuntimeIdentityEqual,
  captureRuntimeIdentity,
  validateRuntimeIdentity,
} from "./runtime-identity.mjs";

export const EXECUTION_CAPSULE_VERSION = "candidate-010.execution-capsule.v1";
export const EXECUTION_CAPSULE_LIMITS = Object.freeze({
  confirmation_claim_eligible: false,
  execution_authority: "none",
  shared_node_modules_allowed: false,
  malicious_host_toctou_closed: false,
  statement: "This artifact composes committed source bytes and an exact local runtime/dependency inventory. It neither executes Candidate code nor establishes a malicious-host or arbitrary-mutation boundary.",
});

const OUTER_PREFIX = "candidate-010-execution-capsule-";
const OWNER_FILE = ".candidate-010-execution-capsule-owner.json";

export class ExecutionCapsuleError extends Error {
  constructor(code, message, options = {}) {
    super(message, options);
    this.name = "ExecutionCapsuleError";
    this.code = `CANDIDATE_010_EXECUTION_CAPSULE_${code}`;
  }
}

function refuse(code, message, cause = undefined) {
  throw new ExecutionCapsuleError(code, message, cause ? { cause } : {});
}

function isContained(root, target) {
  const relative = path.relative(root, target);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function normalizedAbsolute(value) {
  const absolute = path.resolve(value);
  return process.platform === "win32" ? absolute.toLowerCase() : absolute;
}

function samePath(left, right) {
  return normalizedAbsolute(left) === normalizedAbsolute(right);
}

async function realDirectory(value, label) {
  const absolute = path.resolve(value);
  let information;
  try {
    information = await lstat(absolute);
  } catch (error) {
    refuse("IO", `${label} is unavailable: ${error.message}`, error);
  }
  if (information.isSymbolicLink() || !information.isDirectory()) {
    refuse("LINKED_PATH", `${label} must be a real directory, not a symlink or reparse point.`);
  }
  return realpath(absolute);
}

async function assertContainedEntry(rootValue, targetValue, label, expectedKind = null) {
  const root = path.resolve(rootValue);
  const target = path.resolve(targetValue);
  if (!isContained(root, target)) refuse("CONTAINMENT", `${label} escapes its declared root.`);
  const rootReal = await realDirectory(root, `${label} root`);
  let cursor = root;
  let information = await lstat(root);
  for (const component of path.relative(root, target).split(path.sep).filter(Boolean)) {
    cursor = path.join(cursor, component);
    try {
      information = await lstat(cursor);
    } catch (error) {
      refuse("IO", `${label} is unavailable: ${error.message}`, error);
    }
    if (information.isSymbolicLink()) {
      refuse("LINKED_PATH", `${label} traverses a symlink or reparse point.`);
    }
  }
  const resolved = await realpath(target);
  if (!isContained(rootReal, resolved)) refuse("CONTAINMENT", `${label} resolves outside its root.`);
  const expectedReal = path.resolve(rootReal, path.relative(root, target));
  if (!samePath(resolved, expectedReal)) {
    refuse("LINKED_PATH", `${label} resolves through a symlink or reparse point.`);
  }
  if (expectedKind === "file" && !information.isFile()) refuse("FILE_TYPE", `${label} is not a regular file.`);
  if (expectedKind === "directory" && !information.isDirectory()) refuse("FILE_TYPE", `${label} is not a directory.`);
  return { information, resolved };
}

function safeRelative(value, label) {
  if (
    typeof value !== "string"
    || value.length === 0
    || value.includes("\0")
    || value.includes(":")
    || path.isAbsolute(value)
  ) refuse("PATH", `${label} is not a safe relative path.`);
  const normalized = value.replaceAll("\\", "/");
  if (
    normalized === "."
    || normalized.startsWith("/")
    || normalized.startsWith("../")
    || normalized.includes("/../")
    || normalized.endsWith("/")
  ) refuse("PATH", `${label} escapes or does not name a file.`);
  return normalized;
}

async function fileIdentity(file) {
  const body = await readFile(file);
  return { bytes: body.length, sha256: sha256Hex(body) };
}

async function inventory(rootValue, prefix = "") {
  const root = await realDirectory(rootValue, "inventory root");
  const rows = [];
  async function visit(directory, relativeDirectory = "") {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const relative = relativeDirectory ? `${relativeDirectory}/${entry.name}` : entry.name;
      const absolute = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) refuse("LINKED_PATH", `Inventory entry ${relative} is a symlink or reparse point.`);
      if (entry.isDirectory()) {
        await assertContainedEntry(root, absolute, `inventory directory ${relative}`, "directory");
        await visit(absolute, relative);
      } else if (entry.isFile()) {
        await assertContainedEntry(root, absolute, `inventory file ${relative}`, "file");
        const identity = await fileIdentity(absolute);
        rows.push({ path: prefix ? `${prefix}/${relative}` : relative, ...identity });
      } else {
        refuse("FILE_TYPE", `Inventory entry ${relative} has an unsupported type.`);
      }
    }
  }
  await visit(root);
  rows.sort((left, right) => left.path.localeCompare(right.path));
  return Object.freeze({
    files: Object.freeze(rows.map((row) => Object.freeze(row))),
    files_count: rows.length,
    bytes: rows.reduce((sum, row) => sum + row.bytes, 0),
    inventory_sha256: sha256Hex(canonicalize(rows)),
  });
}

function expectedDependencyFiles(runtimeIdentity) {
  if (!Array.isArray(runtimeIdentity?.external_production_dependencies)) {
    refuse("RUNTIME_IDENTITY", "Runtime identity omits its dependency inventory.");
  }
  const rows = [];
  for (const dependency of runtimeIdentity.external_production_dependencies) {
    const packageRoot = safeRelative(dependency.package_root, `${dependency.name} package root`);
    if (!packageRoot.startsWith("node_modules/") || !Array.isArray(dependency.files)) {
      refuse("RUNTIME_IDENTITY", `Dependency ${dependency.name} has an invalid materialization inventory.`);
    }
    for (const row of dependency.files) {
      const relative = safeRelative(row.path, `${dependency.name} inventory path`);
      if (!Number.isSafeInteger(row.bytes) || row.bytes < 0 || !/^[0-9a-f]{64}$/.test(row.sha256)) {
        refuse("RUNTIME_IDENTITY", `Dependency ${dependency.name} has an invalid file identity.`);
      }
      rows.push({ path: `${packageRoot}/${relative}`, bytes: row.bytes, sha256: row.sha256 });
    }
  }
  rows.sort((left, right) => left.path.localeCompare(right.path));
  if (new Set(rows.map((row) => row.path)).size !== rows.length) {
    refuse("RUNTIME_IDENTITY", "Runtime dependency inventory contains duplicate paths.");
  }
  return rows;
}

function descriptorDigest(document) {
  const { descriptor_sha256: ignored, ...body } = document;
  void ignored;
  return sha256Hex(canonicalize(body));
}

function validateStableDescriptor(descriptor) {
  if (
    descriptor?.schema !== 1
    || descriptor.artifact !== "candidate-010"
    || descriptor.contract_version !== EXECUTION_CAPSULE_VERSION
    || descriptor.confirmation_claim_eligible !== false
    || descriptor.limits?.execution_authority !== "none"
    || descriptor.limits?.shared_node_modules_allowed !== false
    || descriptor.descriptor_sha256 !== descriptorDigest(descriptor)
  ) refuse("DESCRIPTOR", "Execution capsule stable descriptor or digest is invalid.");
}

async function writeOwnerMarker(outerRoot, token, descriptorSha256 = null, flag = undefined) {
  const marker = {
    schema: 1,
    artifact: "candidate-010-execution-capsule-owner",
    owner_token_sha256: sha256Hex(token),
    descriptor_sha256: descriptorSha256,
  };
  await writeFile(path.join(outerRoot, OWNER_FILE), `${canonicalize(marker)}\n`, {
    encoding: "utf8",
    ...(flag ? { flag } : {}),
    mode: 0o600,
  });
}

async function validateLocalHandle(capsule, { requireDescriptor = true } = {}) {
  if (!capsule || typeof capsule !== "object" || !capsule.local || !capsule.descriptor) {
    refuse("HANDLE", "Execution capsule requires its stable descriptor and local ownership handle.");
  }
  if (requireDescriptor) validateStableDescriptor(capsule.descriptor);
  const local = capsule.local;
  if (typeof local.ownership_token !== "string" || !/^[0-9a-f]{64}$/.test(local.ownership_token)) {
    refuse("OWNERSHIP", "Local ownership token is invalid.");
  }
  const parent = await realDirectory(local.outer_parent, "outer execution parent");
  const root = path.resolve(local.outer_root);
  if (
    path.dirname(root) !== parent
    || !path.basename(root).startsWith(OUTER_PREFIX)
    || !isContained(parent, root)
  ) refuse("OWNERSHIP", "Outer execution root is not a direct generated child of its parent.");
  await assertContainedEntry(parent, root, "outer execution root", "directory");
  const markerPath = path.join(root, OWNER_FILE);
  await assertContainedEntry(root, markerPath, "ownership marker", "file");
  let marker;
  try {
    marker = JSON.parse(await readFile(markerPath, "utf8"));
  } catch (error) {
    refuse("OWNERSHIP", `Ownership marker is invalid: ${error.message}`, error);
  }
  if (
    marker?.schema !== 1
    || marker.artifact !== "candidate-010-execution-capsule-owner"
    || marker.owner_token_sha256 !== sha256Hex(local.ownership_token)
    || (requireDescriptor && marker.descriptor_sha256 !== capsule.descriptor.descriptor_sha256)
  ) refuse("OWNERSHIP", "Ownership marker does not bind this local handle and descriptor.");
  return { parent, root, local };
}

async function validateOwnedLayout(root, local, { dependencyRequired = true } = {}) {
  const expectedSourceParent = path.join(root, "source");
  const expectedDependencyRoot = path.join(root, "node_modules");
  if (
    !samePath(local.source_parent, expectedSourceParent)
    || !samePath(local.dependency_root, expectedDependencyRoot)
    || !samePath(local.source_root, local.source_capsule?.capsule_root)
    || !samePath(local.source_capsule?.capsule_parent, expectedSourceParent)
  ) refuse("HANDLE", "Local layout handle does not match the owned outer execution root.");
  await assertContainedEntry(root, local.source_parent, "source capsule parent", "directory");
  await assertContainedEntry(root, local.source_root, "source capsule root", "directory");
  if (dependencyRequired) {
    await assertContainedEntry(root, local.dependency_root, "capsule node_modules", "directory");
  }
}

async function materializeDependencies(repository, dependencyRoot, expected) {
  for (const row of expected) {
    const source = path.resolve(repository, ...row.path.split("/"));
    await assertContainedEntry(repository, source, `dependency source ${row.path}`, "file");
    const body = await readFile(source);
    if (body.length !== row.bytes || sha256Hex(body) !== row.sha256) {
      refuse("DEPENDENCY_MUTATION", `Dependency source bytes changed for ${row.path}.`);
    }
    const destination = path.resolve(path.dirname(dependencyRoot), ...row.path.split("/"));
    if (!isContained(dependencyRoot, destination)) {
      refuse("CONTAINMENT", `Dependency destination escapes capsule node_modules: ${row.path}.`);
    }
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, body, { flag: "wx", mode: 0o600 });
  }
}

async function sealTree(root) {
  const directories = [];
  async function visit(directory) {
    directories.push(directory);
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const absolute = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) refuse("LINKED_PATH", "Cannot seal a tree containing links or reparse points.");
      if (entry.isDirectory()) await visit(absolute);
      else if (entry.isFile()) await chmod(absolute, 0o444);
      else refuse("FILE_TYPE", "Cannot seal a tree containing unsupported filesystem entries.");
    }
  }
  await visit(root);
  directories.sort((left, right) => right.length - left.length);
  for (const directory of directories) await chmod(directory, 0o555);
}

async function preflightRemoval(root) {
  async function visit(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const absolute = path.join(directory, entry.name);
      const information = await lstat(absolute);
      if (entry.isSymbolicLink() || information.isSymbolicLink()) {
        refuse("CLEANUP_LINK", "Cleanup refuses a tree containing symlinks or reparse points.");
      }
      if (entry.isDirectory() && information.isDirectory()) await visit(absolute);
      else if (!entry.isFile() || !information.isFile()) {
        refuse("CLEANUP_TYPE", "Cleanup refuses a tree containing unsupported filesystem entries.");
      }
    }
  }
  await visit(root);
}

async function makeWritable(root) {
  const directories = [];
  async function visit(directory) {
    directories.push(directory);
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(absolute);
      else await chmod(absolute, 0o600);
    }
  }
  await chmod(root, 0o700);
  await visit(root);
  for (const directory of directories) await chmod(directory, 0o700);
}

function stableSourceDescriptor(sourceCapsule) {
  return Object.freeze({
    contract_version: sourceCapsule.capsule_version,
    head_commit: sourceCapsule.head_commit,
    source_paths: sourceCapsule.source_paths,
    git_objects: sourceCapsule.git_objects,
    inventory: sourceCapsule.post_seal_inventory,
    inventory_sha256: sourceCapsule.inventory_sha256,
  });
}

/**
 * Builds a non-executing capsule. `descriptor` is stable and contains no
 * generated temp path; `local` is an explicitly non-scientific ownership and
 * path handle required for verification and cleanup on this host.
 */
export async function buildExecutionCapsule({
  repositoryRoot = process.cwd(),
  executionParent = os.tmpdir(),
  runtimeIdentity,
  sourcePaths = null,
  sourceCommit = null,
  candidateDirectory = "experiments/workstation/candidate-010",
} = {}) {
  const repository = await realDirectory(repositoryRoot, "repositoryRoot");
  const parent = await realDirectory(executionParent, "executionParent");
  if (isContained(repository, parent)) {
    refuse("ISOLATION", "executionParent must be outside the repository tree.");
  }
  if (!runtimeIdentity || typeof runtimeIdentity !== "object") {
    refuse("RUNTIME_IDENTITY", "A complete prevalidated runtime identity is required.");
  }
  const candidateRoot = path.resolve(repository, ...safeRelative(candidateDirectory, "candidateDirectory").split("/"));
  await validateRuntimeIdentity(runtimeIdentity, { repositoryRoot: repository, candidateRoot });
  const expected = expectedDependencyFiles(runtimeIdentity);
  const token = randomBytes(32).toString("hex");
  const outerRoot = await mkdtemp(path.join(parent, OUTER_PREFIX));
  const sourceParent = path.join(outerRoot, "source");
  const dependencyRoot = path.join(outerRoot, "node_modules");
  let sourceCapsule = null;
  let capsule;
  try {
    await writeOwnerMarker(outerRoot, token, null, "wx");
    await mkdir(sourceParent, { mode: 0o700 });
    await mkdir(dependencyRoot, { mode: 0o700 });
    sourceCapsule = await buildImmutableExecutionCapsule({
      repositoryRoot: repository,
      capsuleParent: sourceParent,
      sourcePaths,
      sourceCommit,
      candidateDirectory,
    });
    await materializeDependencies(repository, dependencyRoot, expected);
    const preSealDependencies = await inventory(dependencyRoot, "node_modules");
    if (canonicalize(preSealDependencies.files) !== canonicalize(expected)) {
      refuse("DEPENDENCY_INVENTORY", "Materialized dependency inventory differs from runtime identity.");
    }
    await sealTree(dependencyRoot);
    const postSealDependencies = await inventory(dependencyRoot, "node_modules");
    if (canonicalize(preSealDependencies) !== canonicalize(postSealDependencies)) {
      refuse("DEPENDENCY_MUTATION", "Dependency bytes changed while applying their practical read-only seal.");
    }
    await verifyImmutableExecutionCapsule(sourceCapsule);
    const runtimeAfterMaterialization = await captureRuntimeIdentity({ repositoryRoot: repository, candidateRoot });
    assertRuntimeIdentityEqual(runtimeIdentity, runtimeAfterMaterialization);
    const body = {
      schema: 1,
      artifact: "candidate-010",
      contract_version: EXECUTION_CAPSULE_VERSION,
      confirmation_claim_eligible: false,
      layout: Object.freeze({
        immutable_source_role: "source/generated-immutable-capsule",
        dependency_root: "node_modules",
        shared_node_modules: false,
      }),
      source: stableSourceDescriptor(sourceCapsule),
      runtime_identity: runtimeIdentity,
      dependencies: Object.freeze({
        names: runtimeIdentity.external_production_dependency_names,
        inventory: postSealDependencies,
      }),
      limits: EXECUTION_CAPSULE_LIMITS,
    };
    const descriptor = Object.freeze({ ...body, descriptor_sha256: sha256Hex(canonicalize(body)) });
    const local = Object.freeze({
      outer_parent: parent,
      outer_root: outerRoot,
      source_parent: sourceParent,
      source_root: sourceCapsule.capsule_root,
      dependency_root: dependencyRoot,
      repository_root: repository,
      candidate_root: candidateRoot,
      ownership_token: token,
      source_capsule: sourceCapsule,
    });
    capsule = Object.freeze({ descriptor, local });
    await writeOwnerMarker(outerRoot, token, descriptor.descriptor_sha256);
    await verifyExecutionCapsule(capsule);
    return capsule;
  } catch (error) {
    if (sourceCapsule) await destroyImmutableExecutionCapsule(sourceCapsule).catch(() => {});
    await makeWritable(outerRoot).catch(() => {});
    await rm(outerRoot, { recursive: true, force: true }).catch(() => {});
    throw error;
  }
}

export async function verifyExecutionCapsule(capsule) {
  const { root, local } = await validateLocalHandle(capsule);
  const topLevel = (await readdir(root)).sort();
  if (canonicalize(topLevel) !== canonicalize([OWNER_FILE, "node_modules", "source"].sort())) {
    refuse("INVENTORY", "Outer execution root contains an unexpected or missing entry.");
  }
  await validateOwnedLayout(root, local);
  const sourceEntries = await readdir(local.source_parent);
  if (sourceEntries.length !== 1 || !samePath(path.join(local.source_parent, sourceEntries[0]), local.source_root)) {
    refuse("INVENTORY", "Source parent contains material outside the immutable capsule.");
  }
  const currentSource = await verifyImmutableExecutionCapsule(local.source_capsule);
  const stableSource = stableSourceDescriptor(local.source_capsule);
  if (
    canonicalize(stableSource) !== canonicalize(capsule.descriptor.source)
    || currentSource.inventory_sha256 !== capsule.descriptor.source.inventory_sha256
  ) refuse("SOURCE_MUTATION", "Immutable source capsule differs from the stable descriptor.");
  const currentDependencies = await inventory(local.dependency_root, "node_modules");
  if (canonicalize(currentDependencies) !== canonicalize(capsule.descriptor.dependencies.inventory)) {
    refuse("DEPENDENCY_MUTATION", "Capsule-local dependency bytes or inventory differ from the stable descriptor.");
  }
  await validateRuntimeIdentity(capsule.descriptor.runtime_identity, {
    repositoryRoot: local.repository_root,
    candidateRoot: local.candidate_root,
  });
  const runtimeAfterVerification = await captureRuntimeIdentity({
    repositoryRoot: local.repository_root,
    candidateRoot: local.candidate_root,
  });
  assertRuntimeIdentityEqual(capsule.descriptor.runtime_identity, runtimeAfterVerification);
  return Object.freeze({
    valid: true,
    contract_version: EXECUTION_CAPSULE_VERSION,
    descriptor_sha256: capsule.descriptor.descriptor_sha256,
    source_inventory_sha256: currentSource.inventory_sha256,
    dependency_inventory_sha256: currentDependencies.inventory_sha256,
    confirmation_claim_eligible: false,
    execution_authority: "none",
  });
}

export async function destroyExecutionCapsule(capsule) {
  const { root, local } = await validateLocalHandle(capsule);
  await validateOwnedLayout(root, local, { dependencyRequired: false });
  await preflightRemoval(root);
  await destroyImmutableExecutionCapsule(local.source_capsule);
  await makeWritable(root);
  await rm(root, { recursive: true, force: false });
  return true;
}
