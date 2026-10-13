import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import {
  lstat, readFile, readdir, realpath,
} from "node:fs/promises";
import { builtinModules } from "node:module";
import path from "node:path";
import process from "node:process";
import { init, parse } from "es-module-lexer";
import { canonicalize, sha256Hex } from "./checkpoint.mjs";

export const RUNTIME_IDENTITY_VERSION = "candidate-010.runtime-identity.v1";

export const RUNTIME_IDENTITY_LIMITS = Object.freeze({
  confirmation_claim_eligible: false,
  scope: "Exact local Node executable, JavaScript runtime fields, root package lock, and installed bytes of direct external Candidate 010 production dependencies.",
  excludes: Object.freeze([
    "operating-system kernel, drivers, firmware, hardware, microcode, environment variables, and scheduler state",
    "native libraries loaded outside the inventoried dependency package roots",
    "semantic equivalence, reproducibility on another host, and any confirmation or superiority claim",
    "filesystem mutation after validation; lstat/realpath checks do not eliminate TOCTOU races",
  ]),
  toctou_guarantee: false,
});

export class RuntimeIdentityError extends Error {
  constructor(code, message, options = {}) {
    super(message, options);
    this.name = "RuntimeIdentityError";
    this.code = `CANDIDATE_010_RUNTIME_IDENTITY_${code}`;
  }
}

function refuse(code, message, cause = undefined) {
  throw new RuntimeIdentityError(code, message, cause ? { cause } : {});
}

function normalizedAbsolute(value) {
  const absolute = path.resolve(value);
  return process.platform === "win32" ? absolute.toLowerCase() : absolute;
}

function isContained(root, target) {
  const relative = path.relative(root, target);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

async function assertUnlinkedContainedPath(rootValue, targetValue, label, expectedKind = null) {
  const root = path.resolve(rootValue);
  const target = path.resolve(targetValue);
  if (!isContained(root, target)) refuse("CONTAINMENT", `${label} escapes its declared root.`);
  let rootInformation;
  try {
    rootInformation = await lstat(root);
  } catch (error) {
    refuse("IO", `Cannot inspect ${label} root: ${error.message}`, error);
  }
  if (rootInformation.isSymbolicLink() || !rootInformation.isDirectory()) {
    refuse("LINKED_PATH", `${label} root is a symlink, reparse point, or non-directory.`);
  }
  const rootReal = await realpath(root);
  const relative = path.relative(root, target);
  let cursor = root;
  let information = rootInformation;
  for (const segment of relative.split(path.sep).filter(Boolean)) {
    cursor = path.join(cursor, segment);
    try {
      information = await lstat(cursor);
    } catch (error) {
      refuse("IO", `Cannot inspect ${label}: ${error.message}`, error);
    }
    if (information.isSymbolicLink()) {
      refuse("LINKED_PATH", `${label} contains a symlink or reparse point.`);
    }
  }
  const targetReal = await realpath(target);
  if (!isContained(rootReal, targetReal)) {
    refuse("CONTAINMENT", `${label} resolves outside its declared root.`);
  }
  const expectedReal = path.resolve(rootReal, relative);
  if (normalizedAbsolute(targetReal) !== normalizedAbsolute(expectedReal)) {
    refuse("LINKED_PATH", `${label} resolves through a symlink or reparse point.`);
  }
  if (expectedKind === "file" && !information.isFile()) {
    refuse("FILE_TYPE", `${label} is not a regular file.`);
  }
  if (expectedKind === "directory" && !information.isDirectory()) {
    refuse("FILE_TYPE", `${label} is not a directory.`);
  }
  return { information, realpath: targetReal };
}

async function hashFile(file) {
  const digest = createHash("sha256");
  let bytes = 0;
  try {
    for await (const chunk of createReadStream(file)) {
      digest.update(chunk);
      bytes += chunk.length;
    }
  } catch (error) {
    refuse("IO", `Cannot hash ${file}: ${error.message}`, error);
  }
  return { sha256: digest.digest("hex"), bytes };
}

async function readBoundJson(root, file, label) {
  await assertUnlinkedContainedPath(root, file, label, "file");
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch (error) {
    refuse("JSON", `${label} is not valid JSON: ${error.message}`, error);
  }
}

async function recursiveInventory(root, label) {
  await assertUnlinkedContainedPath(root, root, label, "directory");
  let names;
  try {
    names = (await readdir(root, { recursive: true }))
      .map((name) => name.split(path.sep).join("/"))
      .sort();
  } catch (error) {
    refuse("IO", `Cannot enumerate ${label}: ${error.message}`, error);
  }
  const files = [];
  for (const relative of names) {
    const absolute = path.join(root, ...relative.split("/"));
    const { information } = await assertUnlinkedContainedPath(root, absolute, `${label} entry ${relative}`);
    if (information.isDirectory()) continue;
    if (!information.isFile()) {
      refuse("FILE_TYPE", `${label} entry ${relative} has an unsupported file type.`);
    }
    const identity = await hashFile(absolute);
    files.push({ path: relative, bytes: identity.bytes, sha256: identity.sha256 });
  }
  if (files.length === 0) refuse("EMPTY_INVENTORY", `${label} contains no regular files.`);
  return {
    files,
    files_count: files.length,
    bytes: files.reduce((sum, row) => sum + row.bytes, 0),
    inventory_sha256: sha256Hex(canonicalize(files)),
  };
}

function packageNameForSpecifier(specifier) {
  if (specifier.startsWith("@")) return specifier.split("/").slice(0, 2).join("/");
  return specifier.split("/")[0];
}

const builtinNames = new Set([
  ...builtinModules,
  ...builtinModules.map((name) => name.replace(/^node:/, "")),
]);

async function candidateProductionFiles(candidateRoot) {
  const inventory = await recursiveInventory(candidateRoot, "Candidate 010 source tree");
  return inventory.files
    .map((row) => row.path)
    .filter((relative) => relative.endsWith(".mjs") && !relative.endsWith(".test.mjs"));
}

async function deriveExternalProductionDependencies(candidateRoot) {
  await init();
  const dependencies = new Set();
  const files = await candidateProductionFiles(candidateRoot);
  for (const relative of files) {
    const file = path.join(candidateRoot, ...relative.split("/"));
    const source = await readFile(file, "utf8");
    let imports;
    try {
      [imports] = parse(source, relative);
    } catch (error) {
      refuse("SOURCE_PARSE", `Cannot parse production module ${relative}: ${error.message}`, error);
    }
    for (const entry of imports) {
      if (entry.type === "import-meta") continue;
      if (entry.specifier === undefined || (entry.type === "dynamic" && entry.glob)) {
        refuse("NON_LITERAL_IMPORT", `Production module ${relative} contains a non-literal import.`);
      }
      const { specifier } = entry;
      if (
        specifier.startsWith(".")
        || specifier.startsWith("/")
        || specifier.startsWith("node:")
        || builtinNames.has(specifier)
      ) continue;
      if (specifier.startsWith("#")) {
        refuse("PACKAGE_IMPORT", `Production module ${relative} uses unsupported package import ${specifier}.`);
      }
      dependencies.add(packageNameForSpecifier(specifier));
    }
  }
  return [...dependencies].sort();
}

function dependencyRoot(repositoryRoot, name) {
  return path.join(repositoryRoot, "node_modules", ...name.split("/"));
}

async function captureDependency({ repositoryRoot, lock, packageDocument, name }) {
  const lockKey = `node_modules/${name}`;
  const locked = lock.packages?.[lockKey];
  const productionDeclared = packageDocument.dependencies?.[name];
  const developmentDeclared = packageDocument.devDependencies?.[name];
  if (productionDeclared !== undefined && developmentDeclared !== undefined) {
    refuse("LOCK_MISMATCH", `External production dependency ${name} is declared in multiple root dependency sections.`);
  }
  const declaredSection = productionDeclared !== undefined ? "dependencies" : "devDependencies";
  const declared = productionDeclared ?? developmentDeclared;
  const lockDeclared = lock.packages?.[""]?.[declaredSection]?.[name];
  if (typeof declared !== "string" || declared.length === 0) {
    refuse("UNDECLARED_DEPENDENCY", `External production dependency ${name} is not declared by the root package.`);
  }
  if (lockDeclared !== declared || typeof locked?.version !== "string") {
    refuse("LOCK_MISMATCH", `External production dependency ${name} is not exactly represented by the root lock metadata.`);
  }
  const root = dependencyRoot(repositoryRoot, name);
  await assertUnlinkedContainedPath(repositoryRoot, root, `installed dependency ${name}`, "directory");
  const metadataPath = path.join(root, "package.json");
  const metadata = await readBoundJson(root, metadataPath, `${name} package metadata`);
  if (metadata.name !== name || metadata.version !== locked.version) {
    refuse("VERSION_MISMATCH", `${name} installed package metadata does not match package-lock version ${locked.version}.`);
  }
  const inventory = await recursiveInventory(root, `installed dependency ${name}`);
  const metadataIdentity = inventory.files.find((row) => row.path === "package.json");
  if (!metadataIdentity) refuse("PACKAGE_METADATA", `${name} inventory omits package.json.`);
  return {
    name,
    version: metadata.version,
    production_usage: true,
    declared_section: declaredSection,
    declared_requirement: declared,
    package_root: path.relative(repositoryRoot, root).split(path.sep).join("/"),
    package_json_sha256: metadataIdentity.sha256,
    ...inventory,
  };
}

function identityDigest(document) {
  const { identity_sha256: ignored, ...body } = document;
  void ignored;
  return sha256Hex(canonicalize(body));
}

export function runtimeIdentityDigest(document) {
  if (!document || typeof document !== "object" || Array.isArray(document)) {
    refuse("DOCUMENT", "Runtime identity must be an object.");
  }
  return identityDigest(document);
}

function assertIdentityDocument(document) {
  if (
    document?.schema !== 1
    || document.artifact !== "candidate-010"
    || document.contract_version !== RUNTIME_IDENTITY_VERSION
    || document.confirmation_claim_eligible !== false
    || document.identity_sha256 !== identityDigest(document)
  ) {
    refuse("DOCUMENT", "Runtime identity document or canonical digest is invalid.");
  }
}

export async function captureRuntimeIdentity({
  repositoryRoot = path.resolve(
    path.dirname(new URL(import.meta.url).pathname.replace(/^\/(.:)/, "$1")),
    "..",
    "..",
    "..",
  ),
  candidateRoot = path.join(repositoryRoot, "experiments", "workstation", "candidate-010"),
  execPath = process.execPath,
} = {}) {
  const repository = path.resolve(repositoryRoot);
  const candidate = path.resolve(candidateRoot);
  await assertUnlinkedContainedPath(repository, repository, "repository", "directory");
  await assertUnlinkedContainedPath(repository, candidate, "Candidate 010 source tree", "directory");
  const packagePath = path.join(repository, "package.json");
  const lockPath = path.join(repository, "package-lock.json");
  await assertUnlinkedContainedPath(repository, packagePath, "root package metadata", "file");
  await assertUnlinkedContainedPath(repository, lockPath, "root package lock", "file");
  const [packageDocument, lock, packageLockIdentity] = await Promise.all([
    readBoundJson(repository, packagePath, "root package metadata"),
    readBoundJson(repository, lockPath, "root package lock"),
    hashFile(lockPath),
  ]);
  if (!Number.isSafeInteger(lock.lockfileVersion) || lock.lockfileVersion < 1) {
    refuse("LOCK_MISMATCH", "Root package lock has no supported lockfile version.");
  }
  const dependencyNames = await deriveExternalProductionDependencies(candidate);
  const dependencies = await Promise.all(dependencyNames.map((name) => captureDependency({
    repositoryRoot: repository,
    lock,
    packageDocument,
    name,
  })));

  const executable = path.resolve(execPath);
  let executableInformation;
  try {
    executableInformation = await lstat(executable);
  } catch (error) {
    refuse("EXECUTABLE", `Cannot inspect Node executable: ${error.message}`, error);
  }
  if (executableInformation.isSymbolicLink() || !executableInformation.isFile()) {
    refuse("EXECUTABLE", "Node executable is a symlink, reparse point, or non-file.");
  }
  const executableRealpath = await realpath(executable);
  const executableIdentity = await hashFile(executableRealpath);
  const versions = Object.fromEntries(Object.entries(process.versions).sort(([left], [right]) => (
    left.localeCompare(right)
  )));
  const body = {
    schema: 1,
    artifact: "candidate-010",
    contract_version: RUNTIME_IDENTITY_VERSION,
    confirmation_claim_eligible: false,
    limits: RUNTIME_IDENTITY_LIMITS,
    runtime: {
      version: process.version,
      versions,
      platform: process.platform,
      arch: process.arch,
      exec_path: executable,
      exec_path_realpath: executableRealpath,
      executable_sha256: executableIdentity.sha256,
      executable_bytes: executableIdentity.bytes,
    },
    package_lock: {
      path: "package-lock.json",
      lockfile_version: lock.lockfileVersion,
      sha256: packageLockIdentity.sha256,
      bytes: packageLockIdentity.bytes,
    },
    external_production_dependencies: dependencies,
    external_production_dependency_names: dependencyNames,
  };
  return { ...body, identity_sha256: sha256Hex(canonicalize(body)) };
}

export async function validateRuntimeIdentity(document, options = {}) {
  assertIdentityDocument(document);
  const current = await captureRuntimeIdentity(options);
  if (canonicalize(document) !== canonicalize(current)) {
    refuse("MISMATCH", "Runtime identity differs from the current executable or installed dependency bytes.");
  }
  return {
    valid: true,
    contract_version: RUNTIME_IDENTITY_VERSION,
    identity_sha256: document.identity_sha256,
    confirmation_claim_eligible: false,
  };
}

export function assertRuntimeIdentityEqual(before, after) {
  assertIdentityDocument(before);
  assertIdentityDocument(after);
  if (canonicalize(before) !== canonicalize(after)) {
    refuse("PRE_POST_MISMATCH", "Pre-execution and post-execution runtime identities differ.");
  }
  return true;
}
