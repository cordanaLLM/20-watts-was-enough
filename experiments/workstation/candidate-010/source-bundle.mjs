import { createHash } from "node:crypto";
import { lstat, readFile, readdir, realpath } from "node:fs/promises";
import path from "node:path";
import { init, parse } from "es-module-lexer";
import { readStableOpenedFile } from "./opened-file.mjs";
import { canonicalJson } from "../lib/canonical-json.mjs";

export const CANDIDATE_010_SOURCE_FILES = Object.freeze([
  "package-lock.json",
  "package.json",
  "research/claims.md",
  "scripts/lib/workstation-manifests.mjs",
  "scripts/validate-workstation.mjs",
  "experiments/workstation/manifest.schema.json",
  "experiments/workstation/lib/canonical-json.mjs",
  "experiments/workstation/candidate-010/actuator-command-track.mjs",
  "experiments/workstation/candidate-010/backend-registry.mjs",
  "experiments/workstation/candidate-010/capsule-bootstrap.mjs",
  "experiments/workstation/candidate-010/capsule-child.mjs",
  "experiments/workstation/candidate-010/capsule-confirmation-entry.mjs",
  "experiments/workstation/candidate-010/capsule-execution-authority.mjs",
  "experiments/workstation/candidate-010/checkpoint.mjs",
  "experiments/workstation/candidate-010/confirmation-preflight.mjs",
  "experiments/workstation/candidate-010/configs/development.json",
  "experiments/workstation/candidate-010/configs/smoke.json",
  "experiments/workstation/candidate-010/confirmatory-analysis.mjs",
  "experiments/workstation/candidate-010/energy-acquisition.mjs",
  "experiments/workstation/candidate-010/energy-block-analysis.mjs",
  "experiments/workstation/candidate-010/energy-block-runner.mjs",
  "experiments/workstation/candidate-010/energy-provider.config.json",
  "experiments/workstation/candidate-010/energy-provider.mjs",
  "experiments/workstation/candidate-010/event-contract.mjs",
  "experiments/workstation/candidate-010/execution-manifest.json",
  "experiments/workstation/candidate-010/execution-capsule.mjs",
  "experiments/workstation/candidate-010/factorial-design.mjs",
  "experiments/workstation/candidate-010/factorial-runner.mjs",
  "experiments/workstation/candidate-010/fault-injection.mjs",
  "experiments/workstation/candidate-010/filesystem-track.mjs",
  "experiments/workstation/candidate-010/generator.mjs",
  "experiments/workstation/candidate-010/immutable-capsule.mjs",
  "experiments/workstation/candidate-010/independent-verifier.mjs",
  "experiments/workstation/candidate-010/output.schema.json",
  "experiments/workstation/candidate-010/opened-file.mjs",
  "experiments/workstation/candidate-010/persistent-service-runner.mjs",
  "experiments/workstation/candidate-010/policies.mjs",
  "experiments/workstation/candidate-010/promotion-evidence.mjs",
  "experiments/workstation/candidate-010/release-contract.mjs",
  "experiments/workstation/candidate-010/release-contract-v4.mjs",
  "experiments/workstation/candidate-010/retry-rollback-comparator.mjs",
  "experiments/workstation/candidate-010/run-lock.mjs",
  "experiments/workstation/candidate-010/runner.mjs",
  "experiments/workstation/candidate-010/runtime-identity.mjs",
  "experiments/workstation/candidate-010/seed-release-operator.mjs",
  "experiments/workstation/candidate-010/seeds/seed-pack.mjs",
  "experiments/workstation/candidate-010/seeds/seed-release-artifacts.schema.json",
  "experiments/workstation/candidate-010/signed-publication-track.mjs",
  "experiments/workstation/candidate-010/source-bundle.mjs",
  "experiments/workstation/candidate-010/trace-job.mjs",
  "experiments/workstation/candidate-010/transactional-kv-track.mjs",
]);

export const CANDIDATE_010_MANIFEST_FILE = "experiments/workstation/manifests/candidate-010.json";
export const CANDIDATE_010_EXECUTION_MANIFEST_FILE =
  "experiments/workstation/candidate-010/execution-manifest.json";
export const CANDIDATE_010_EXECUTION_MANIFEST_PROJECTION_VERSION =
  "candidate-010.execution-manifest-projection.v1";

export const CANDIDATE_010_TEST_SUPPORT_FILES = Object.freeze([
  // Shared strict Ajv construction used by registered schema-contract tests.
  "experiments/workstation/lib/ajv.mjs",
  // Loaded by runner.test.mjs as the deterministic expected-output fixture.
  "experiments/workstation/candidate-010/golden-smoke.json",
]);

export const CANDIDATE_010_DISCOVERY_EXCLUSIONS = Object.freeze([
  Object.freeze({ path: "README.md", reason: "human documentation; not executable or test support" }),
  Object.freeze({ path: "energy-reading.template.json", reason: "operator input template; never consumed automatically" }),
  Object.freeze({ path: "seeds/smoke.json", reason: "experimental seed input; bound as run input rather than source" }),
  Object.freeze({ path: "seeds/development.json", reason: "experimental seed input; bound as run input rather than source" }),
  Object.freeze({ path: "seeds/confirmation.commit.json", reason: "sealed seed commitment; bound by the release contract" }),
  Object.freeze({ path: "seeds/held-out.commit.json", reason: "sealed seed commitment; bound by the release contract" }),
  Object.freeze({ path: "seeds/confirmation.reveal.json", reason: "future reveal data; bound by the release contract and never source" }),
  Object.freeze({ path: "seeds/held-out.reveal.json", reason: "future reveal data; bound by the release contract and never source" }),
]);

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function candidate010ExecutionManifestProjection(manifest) {
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
    throw new Error("Candidate 010 execution manifest projection requires an object.");
  }
  const {
    readiness: ignoredReadiness,
    promotion_evidence: promotionEvidence,
    seeds,
    ...executionContract
  } = manifest;
  void ignoredReadiness;
  if (!promotionEvidence || typeof promotionEvidence !== "object" || Array.isArray(promotionEvidence)) {
    throw new Error("Candidate 010 manifest omits its promotion-evidence contract.");
  }
  if (
    !seeds
    || typeof seeds !== "object"
    || typeof seeds.development !== "string"
    || typeof seeds.confirmation !== "string"
    || typeof seeds.held_out !== "string"
  ) throw new Error("Candidate 010 manifest omits its development/confirmation/held-out seed roles.");
  const promotionFields = Object.keys(promotionEvidence).sort();
  if (!promotionFields.includes("status")) {
    throw new Error("Candidate 010 promotion-evidence contract omits status.");
  }
  const pathRoles = promotionFields.filter((field) => field !== "status");
  if (pathRoles.length === 0 || pathRoles.some((field) => !field.endsWith("_path") && !field.endsWith("_paths") && field !== "run_directory" && field !== "release_root")) {
    throw new Error("Candidate 010 promotion-evidence contract contains an unknown mutable result role.");
  }
  return Object.freeze({
    contract_version: CANDIDATE_010_EXECUTION_MANIFEST_PROJECTION_VERSION,
    execution_contract: Object.freeze({
      ...executionContract,
      seeds: Object.freeze({ development: seeds.development }),
    }),
    seed_release_contract: Object.freeze({
      mutable_result_path_roles: Object.freeze(["confirmation", "held_out"]),
      required_state_transition: "sealed-commit-to-frozen-reveal",
    }),
    promotion_contract: Object.freeze({
      status_field: "status",
      allowed_status_values: Object.freeze(["pending", "present"]),
      result_path_roles: Object.freeze(pathRoles),
    }),
  });
}

function manifestFromExecutionProjection(projection, readiness) {
  return {
    ...projection.execution_contract,
    seeds: {
      ...projection.execution_contract?.seeds,
      confirmation: "confirmation-result-path",
      held_out: "held-out-result-path",
    },
    readiness,
    promotion_evidence: Object.fromEntries([
      [projection.promotion_contract.status_field, "pending"],
      ...projection.promotion_contract.result_path_roles.map((field) => [field, field]),
    ]),
  };
}

function canonical(value) {
  return canonicalJson(value, { strict: false, label: "Source bundle" });
}

export function assertCandidate010ExecutionManifestProjection({ manifest, projection }) {
  const expected = candidate010ExecutionManifestProjection(manifest);
  if (
    !projection
    || typeof projection !== "object"
    || Array.isArray(projection)
    || canonical(projection) !== canonical(expected)
  ) {
    throw new Error(
      "Candidate 010 execution-manifest.json does not exactly match the immutable projection of the registry manifest.",
    );
  }
  return expected;
}

function normalizedRelativePath(value) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error("Source-bundle paths must be non-empty strings.");
  }
  const normalized = value.replaceAll("\\", "/");
  if (path.isAbsolute(value) || normalized.startsWith("../") || normalized.includes("/../")) {
    throw new Error(`Source-bundle path must stay relative to the repository: ${value}`);
  }
  return normalized;
}

function sortedUnique(values, label) {
  const normalized = values.map(normalizedRelativePath);
  const unique = [...new Set(normalized)].sort();
  if (unique.length !== normalized.length) throw new Error(`${label} paths must be unique.`);
  return unique;
}

function pathIsInside(root, target) {
  const relative = path.relative(root, target);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function samePath(left, right) {
  return path.relative(left, right) === "" && path.relative(right, left) === "";
}

async function strictSourceRoot(sourceRoot) {
  if (typeof sourceRoot !== "string" || sourceRoot.length === 0) {
    throw new Error("Frozen source root must be a non-empty path.");
  }
  const absolute = path.resolve(sourceRoot);
  const information = await lstat(absolute);
  if (information.isSymbolicLink() || !information.isDirectory()) {
    throw new Error("Frozen source root must be a regular directory, not a symbolic link or reparse point.");
  }
  const resolved = await realpath(absolute);
  if (!samePath(absolute, resolved)) {
    throw new Error("Frozen source root refuses symbolic-link or reparse-point traversal in its root path.");
  }
  return resolved;
}

async function exactRegularFileInventory(sourceRoot) {
  const root = await strictSourceRoot(sourceRoot);
  const files = [];
  const directories = [];
  const queue = [{ directory: root, relativeDirectory: "", depth: 0 }];
  const MAXIMUM_DIRECTORY_DEPTH = 32;
  const MAXIMUM_DIRECTORY_ENTRIES = 10_000;
  let entriesProcessed = 0;

  while (queue.length > 0) {
    const { directory, relativeDirectory, depth } = queue.shift();
    if (depth > MAXIMUM_DIRECTORY_DEPTH) {
      throw new Error(`Frozen source root exceeded maximum directory depth of ${MAXIMUM_DIRECTORY_DEPTH}.`);
    }
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      if (++entriesProcessed > MAXIMUM_DIRECTORY_ENTRIES) {
        throw new Error("Frozen source root exceeded traversal entry limit.");
      }
      const relative = relativeDirectory ? `${relativeDirectory}/${entry.name}` : entry.name;
      const absolute = path.join(directory, entry.name);
      const information = await lstat(absolute);
      if (entry.isSymbolicLink() || information.isSymbolicLink()) {
        throw new Error(`Frozen source root refuses symbolic links or reparse points: ${relative}`);
      }
      const resolved = await realpath(absolute);
      if (!pathIsInside(root, resolved)) {
        throw new Error(`Frozen source root entry resolves outside its root: ${relative}`);
      }
      if (information.isDirectory()) {
        directories.push(relative);
        queue.push({ directory: absolute, relativeDirectory: relative, depth: depth + 1 });
      } else if (information.isFile()) {
        files.push(relative);
      } else {
        throw new Error(`Frozen source root contains an unsupported filesystem entry: ${relative}`);
      }
    }
  }
  return Object.freeze({
    root,
    files: Object.freeze(files.sort()),
    directories: Object.freeze(directories.sort()),
  });
}

function requiredDirectoryInventory(files) {
  const directories = new Set();
  for (const file of files) {
    const components = file.split("/").slice(0, -1);
    for (let index = 1; index <= components.length; index += 1) {
      directories.add(components.slice(0, index).join("/"));
    }
  }
  return [...directories].sort();
}

async function assertNoSymbolicPathComponents(root, absolute, label) {
  const rootAbsolute = path.resolve(root);
  const relative = path.relative(rootAbsolute, absolute);
  if (!pathIsInside(rootAbsolute, absolute)) {
    throw new Error(`${label} escapes the repository.`);
  }
  let current = rootAbsolute;
  for (const component of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, component);
    const information = await lstat(current);
    if (information.isSymbolicLink()) {
      throw new Error(`${label} refuses symbolic-link or reparse-point traversal: ${relative}`);
    }
  }
}

async function repositoryEntry(root, relative, { directory = false, label = "Source-bundle path" } = {}) {
  const normalized = normalizedRelativePath(relative);
  const rootAbsolute = path.resolve(root);
  const rootReal = await realpath(rootAbsolute);
  const absolute = path.resolve(rootAbsolute, ...normalized.split("/"));
  await assertNoSymbolicPathComponents(rootAbsolute, absolute, label);
  const [information, resolved] = await Promise.all([lstat(absolute), realpath(absolute)]);
  if (information.isSymbolicLink()) {
    throw new Error(`${label} refuses a symbolic link or reparse point: ${normalized}`);
  }
  if (directory ? !information.isDirectory() : !information.isFile()) {
    throw new Error(`${label} must be a regular ${directory ? "directory" : "file"}: ${normalized}`);
  }
  if (!pathIsInside(rootReal, resolved)) {
    throw new Error(`${label} resolves outside the repository: ${normalized}`);
  }
  return { absolute, normalized, resolved };
}

async function walkCandidateFiles(root, candidateDirectory) {
  const { absolute: absoluteCandidateDirectory } = await repositoryEntry(root, candidateDirectory, {
    directory: true,
    label: "Candidate 010 source directory",
  });
  const files = [];
  const queue = [{ directory: absoluteCandidateDirectory, relativeDirectory: "", depth: 0 }];
  const MAXIMUM_CANDIDATE_WALK_DEPTH = 32;
  const MAXIMUM_CANDIDATE_WALK_ENTRIES = 10_000;
  let entriesProcessed = 0;

  while (queue.length > 0) {
    const { directory, relativeDirectory, depth } = queue.shift();
    if (depth > MAXIMUM_CANDIDATE_WALK_DEPTH) {
      throw new Error(`Candidate 010 source discovery exceeded maximum depth of ${MAXIMUM_CANDIDATE_WALK_DEPTH}.`);
    }
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      if (++entriesProcessed > MAXIMUM_CANDIDATE_WALK_ENTRIES) {
        throw new Error("Candidate 010 source discovery exceeded entry limit.");
      }
      const relative = relativeDirectory ? `${relativeDirectory}/${entry.name}` : entry.name;
      const absolute = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`Candidate 010 source discovery refuses symbolic links: ${relative}`);
      if (entry.isDirectory()) {
        queue.push({ directory: absolute, relativeDirectory: relative, depth: depth + 1 });
      } else if (entry.isFile()) {
        files.push(relative);
      } else {
        throw new Error(`Candidate 010 source discovery found an unsupported entry: ${relative}`);
      }
    }
  }
  return files.sort();
}

async function relativeModuleSpecifiers(body) {
  await init();
  const [imports] = parse(body);
  return [...new Set(imports
    .filter((entry) => !(entry.type === "dynamic" && entry.glob))
    .map((entry) => entry.specifier)
    .filter((specifier) => typeof specifier === "string" && specifier.startsWith(".")))]
    .sort();
}

async function validateFrozenImportClosure({ root, importers, sourceFiles }) {
  const included = new Set(sourceFiles);
  const edges = [];
  for (const importer of importers) {
    const { absolute } = await repositoryEntry(root, importer, {
      label: "Candidate 010 import-closure source",
    });
    const body = await readFile(absolute, "utf8");
    for (const specifier of await relativeModuleSpecifiers(body)) {
      const resolved = normalizedRelativePath(path.relative(
        root,
        path.resolve(root, path.dirname(importer), specifier),
      ));
      if (!included.has(resolved)) {
        throw new Error(`Candidate 010 import is outside the frozen source closure: ${importer} -> ${resolved}`);
      }
      edges.push(Object.freeze({ importer, imported: resolved }));
    }
  }
  return Object.freeze(edges.sort((left, right) => (
    left.importer.localeCompare(right.importer) || left.imported.localeCompare(right.imported)
  )));
}

function validateDiscoveredProductionModules(discoveredRelative, normalizedProduction, prefix) {
  const discoveredProductionModules = discoveredRelative
    .filter((file) => file.endsWith(".mjs") && !file.endsWith(".test.mjs"))
    .map((file) => `${prefix}${file}`)
    .sort();
  const listedProductionModules = normalizedProduction.filter((file) => (
    file.startsWith(prefix) && file.endsWith(".mjs") && !file.endsWith(".test.mjs")
  ));
  if (JSON.stringify(discoveredProductionModules) !== JSON.stringify(listedProductionModules)) {
    const listed = new Set(listedProductionModules);
    const discovered = new Set(discoveredProductionModules);
    const unlisted = discoveredProductionModules.filter((file) => !listed.has(file));
    const missing = listedProductionModules.filter((file) => !discovered.has(file));
    throw new Error(`Candidate 010 production module coverage mismatch; unlisted=[${unlisted.join(",")}], missing=[${missing.join(",")}]`);
  }
}

async function loadManifestAndValidateTests({
  root,
  normalizedManifest,
  normalizedExecutionManifest,
  prefix,
  discoveredRelative,
}) {
  const { absolute: manifestPath } = await repositoryEntry(root, normalizedManifest, {
    label: "Candidate 010 execution manifest",
  });
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const { absolute: executionManifestPath } = await repositoryEntry(root, normalizedExecutionManifest, {
    label: "Candidate 010 immutable execution manifest",
  });
  const executionManifestProjection = assertCandidate010ExecutionManifestProjection({
    manifest,
    projection: JSON.parse(await readFile(executionManifestPath, "utf8")),
  });
  const registeredTests = manifest?.implementation?.tests;
  if (!Array.isArray(registeredTests) || registeredTests.length === 0) {
    throw new Error("Candidate 010 manifest must register a non-empty implementation.tests list.");
  }
  const normalizedRegisteredTests = sortedUnique(registeredTests, "Candidate 010 manifest test");
  if (normalizedRegisteredTests.some((file) => !file.startsWith(prefix) || !file.endsWith(".test.mjs"))) {
    throw new Error("Candidate 010 manifest tests must be Candidate 010 .test.mjs files.");
  }
  const discoveredTests = discoveredRelative
    .filter((file) => file.endsWith(".test.mjs"))
    .map((file) => `${prefix}${file}`)
    .sort();
  if (JSON.stringify(discoveredTests) !== JSON.stringify(normalizedRegisteredTests)) {
    const registered = new Set(normalizedRegisteredTests);
    const discovered = new Set(discoveredTests);
    const unregistered = discoveredTests.filter((file) => !registered.has(file));
    const missing = normalizedRegisteredTests.filter((file) => !discovered.has(file));
    throw new Error(`Candidate 010 test coverage mismatch; unregistered=[${unregistered.join(",")}], missing=[${missing.join(",")}]`);
  }
  return { executionManifestProjection, normalizedRegisteredTests };
}

function validateExclusionsAndCoverage(exclusions, sourceFiles, discoveredRelative, prefix) {
  const exclusionMap = new Map();
  for (const exclusion of exclusions) {
    const relative = normalizedRelativePath(exclusion?.path);
    if (typeof exclusion?.reason !== "string" || exclusion.reason.trim().length === 0) {
      throw new Error(`Candidate 010 discovery exclusion requires a reason: ${relative}`);
    }
    if (exclusionMap.has(relative)) throw new Error(`Duplicate Candidate 010 discovery exclusion: ${relative}`);
    exclusionMap.set(relative, exclusion.reason);
  }
  const includedCandidateFiles = new Set(sourceFiles
    .filter((file) => file.startsWith(prefix))
    .map((file) => file.slice(prefix.length)));
  const unclassified = discoveredRelative.filter((file) => (
    !includedCandidateFiles.has(file) && !exclusionMap.has(file)
  ));
  if (unclassified.length > 0) {
    throw new Error(`Candidate 010 discovery found unclassified files: ${unclassified.join(",")}`);
  }
  return exclusionMap;
}

export async function discoverCandidate010SourceFiles({
  root = process.cwd(),
  candidateDirectory = "experiments/workstation/candidate-010",
  manifestFile = CANDIDATE_010_MANIFEST_FILE,
  executionManifestFile = CANDIDATE_010_EXECUTION_MANIFEST_FILE,
  productionFiles = CANDIDATE_010_SOURCE_FILES,
  testSupportFiles = CANDIDATE_010_TEST_SUPPORT_FILES,
  exclusions = CANDIDATE_010_DISCOVERY_EXCLUSIONS,
} = {}) {
  const normalizedProduction = sortedUnique([...productionFiles], "Candidate 010 production source");
  const normalizedSupport = sortedUnique([...testSupportFiles], "Candidate 010 test-support source");
  const normalizedManifest = normalizedRelativePath(manifestFile);
  const normalizedExecutionManifest = normalizedRelativePath(executionManifestFile);
  const normalizedCandidateDirectory = normalizedRelativePath(candidateDirectory).replace(/\/$/, "");
  const prefix = `${normalizedCandidateDirectory}/`;
  const discoveredRelative = await walkCandidateFiles(root, normalizedCandidateDirectory);
  validateDiscoveredProductionModules(discoveredRelative, normalizedProduction, prefix);

  const { executionManifestProjection, normalizedRegisteredTests } = await loadManifestAndValidateTests({
    root,
    normalizedManifest,
    normalizedExecutionManifest,
    prefix,
    discoveredRelative,
  });

  const sourceFiles = sortedUnique([
    ...normalizedProduction,
    ...normalizedRegisteredTests,
    ...normalizedSupport,
  ], "Candidate 010 complete source");
  const exclusionMap = validateExclusionsAndCoverage(exclusions, sourceFiles, discoveredRelative, prefix);
  const productionModules = normalizedProduction.filter((file) => file.endsWith(".mjs"));
  const importClosure = await validateFrozenImportClosure({
    root,
    importers: [...productionModules, ...normalizedRegisteredTests],
    sourceFiles,
  });
  return Object.freeze({
    source_files: Object.freeze(sourceFiles),
    production_modules: Object.freeze(productionModules),
    registered_tests: Object.freeze(normalizedRegisteredTests),
    test_support_files: Object.freeze(normalizedSupport),
    manifest_file: normalizedManifest,
    execution_manifest_file: normalizedExecutionManifest,
    execution_manifest_projection: executionManifestProjection,
    import_closure: importClosure,
    exclusions: Object.freeze([...exclusionMap].map(([excludedPath, reason]) => Object.freeze({ path: excludedPath, reason }))),
  });
}

export async function computeSourceBundle({
  root,
  sourceFiles,
  vcs = null,
  executionManifestProjection = null,
}) {
  if (!root || !Array.isArray(sourceFiles) || sourceFiles.length === 0) {
    throw new Error("Source-bundle root and a non-empty source-file list are required.");
  }
  const normalized = [...new Set(sourceFiles.map(normalizedRelativePath))].sort();
  if (normalized.length !== sourceFiles.length) throw new Error("Source-bundle paths must be unique.");
  const aggregate = createHash("sha256");
  const files = [];
  for (const relative of normalized) {
    const { absolute } = await repositoryEntry(root, relative, {
      label: "Candidate 010 frozen source",
    });
    const body = await readFile(absolute);
    const fileSha256 = sha256(body);
    files.push({ path: relative, bytes: body.length, sha256: fileSha256 });
    aggregate.update(`${Buffer.byteLength(relative)}:${relative}:${body.length}:`);
    aggregate.update(body);
  }
  const manifestProjection = executionManifestProjection === null
    ? null
    : candidate010ExecutionManifestProjection(manifestFromExecutionProjection(
        executionManifestProjection,
        "projection-normalization",
      ));
  if (manifestProjection !== null) {
    if (!normalized.includes(CANDIDATE_010_EXECUTION_MANIFEST_FILE)) {
      throw new Error("A non-null execution-manifest projection requires its committed source file.");
    }
    const { absolute: projectionPath } = await repositoryEntry(
      root,
      CANDIDATE_010_EXECUTION_MANIFEST_FILE,
      { label: "Candidate 010 committed execution-manifest projection" },
    );
    const committedProjection = JSON.parse(await readFile(projectionPath, "utf8"));
    if (canonical(committedProjection) !== canonical(manifestProjection)) {
      throw new Error("The source-bundle projection differs from committed execution-manifest.json bytes.");
    }
  }
  const projectionBody = canonical(manifestProjection);
  aggregate.update(`execution-manifest-projection:${Buffer.byteLength(projectionBody)}:`);
  aggregate.update(projectionBody);
  return Object.freeze({
    schema: 1,
    bundle_id: "candidate-010-executable-source-v1",
    source_sha256: aggregate.digest("hex"),
    files: Object.freeze(files.map(Object.freeze)),
    execution_manifest_projection: manifestProjection,
    vcs: vcs === null ? null : Object.freeze({ ...vcs }),
  });
}

function assertExactFrozenBundleShape(expectedBundle) {
  const exactKeys = (value, keys) => (
    value
    && typeof value === "object"
    && !Array.isArray(value)
    && JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort())
  );
  if (
    !exactKeys(expectedBundle, [
      "schema",
      "bundle_id",
      "source_sha256",
      "files",
      "execution_manifest_projection",
      "vcs",
    ])
    || expectedBundle.schema !== 1
    || expectedBundle.bundle_id !== "candidate-010-executable-source-v1"
    || !/^[0-9a-f]{64}$/.test(expectedBundle.source_sha256 ?? "")
    || !Array.isArray(expectedBundle.files)
    || expectedBundle.files.length === 0
    || !exactKeys(expectedBundle.vcs, ["source_commit", "worktree_state"])
    || !/^[0-9a-f]{40}$/.test(expectedBundle.vcs.source_commit ?? "")
    || typeof expectedBundle.vcs.worktree_state !== "string"
    || expectedBundle.vcs.worktree_state.length === 0
  ) {
    throw new Error("Expected frozen source bundle has an invalid exact identity shape.");
  }
  if (expectedBundle.execution_manifest_projection !== null) {
    const projection = expectedBundle.execution_manifest_projection;
    if (
      projection?.contract_version !== CANDIDATE_010_EXECUTION_MANIFEST_PROJECTION_VERSION
      || !projection.execution_contract
      || !projection.promotion_contract
      || canonical(candidate010ExecutionManifestProjection(manifestFromExecutionProjection(
        projection,
        "projection-validation",
      ))) !== canonical(projection)
    ) throw new Error("Expected frozen source bundle has an invalid execution-manifest projection.");
  }
  const paths = [];
  for (const entry of expectedBundle.files) {
    if (
      !exactKeys(entry, ["path", "bytes", "sha256"])
      || !Number.isSafeInteger(entry.bytes)
      || entry.bytes < 0
      || !/^[0-9a-f]{64}$/.test(entry.sha256 ?? "")
    ) {
      throw new Error("Expected frozen source bundle contains an invalid file identity.");
    }
    paths.push(normalizedRelativePath(entry.path));
  }
  const sorted = [...paths].sort();
  if (new Set(paths).size !== paths.length || JSON.stringify(paths) !== JSON.stringify(sorted)) {
    throw new Error("Expected frozen source bundle file inventory must be unique and sorted.");
  }
  return paths;
}

/**
 * Verify a materialized frozen source tree without consulting `.git` or the
 * caller's worktree. The source root must contain exactly the bound regular
 * files and no links, reparse points, or unbound extras.
 */
export async function verifyCandidate010SourceBundleAtRoot({ sourceRoot, expectedBundle }) {
  const expectedPaths = assertExactFrozenBundleShape(expectedBundle);
  const expectedDirectories = requiredDirectoryInventory(expectedPaths);
  const before = await exactRegularFileInventory(sourceRoot);
  if (
    JSON.stringify(before.files) !== JSON.stringify(expectedPaths)
    || JSON.stringify(before.directories) !== JSON.stringify(expectedDirectories)
  ) {
    throw new Error("Frozen source root inventory does not exactly match the expected source bundle.");
  }
  const recomputed = await computeSourceBundle({
    root: before.root,
    sourceFiles: expectedPaths,
    vcs: expectedBundle.vcs,
    executionManifestProjection: expectedBundle.execution_manifest_projection,
  });
  if (canonical(recomputed) !== canonical(expectedBundle)) {
    throw new Error("Frozen source root bytes or hashes do not match the expected source bundle.");
  }
  const after = await exactRegularFileInventory(sourceRoot);
  if (
    after.root !== before.root
    || JSON.stringify(after.files) !== JSON.stringify(before.files)
    || JSON.stringify(after.directories) !== JSON.stringify(before.directories)
  ) {
    throw new Error("Frozen source root inventory changed while it was being verified.");
  }
  return recomputed;
}

async function readOptional(file, gitDirectory) {
  try {
    return (await readStableOpenedFile(file, {
      label: `Candidate 010 Git metadata ${path.basename(file)}`,
      containedBy: gitDirectory,
    })).toString("utf8");
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

async function resolveGitDirectories(root) {
  const dotGit = path.join(root, ".git");
  const information = await lstat(dotGit);
  if (information.isSymbolicLink()) {
    throw new Error("Candidate 010 Git metadata refuses a symbolic link or reparse point.");
  }
  let gitDirectory;
  if (information.isDirectory()) {
    gitDirectory = await realpath(dotGit);
  } else {
    if (!information.isFile()) throw new Error("Candidate 010 .git metadata is not a regular file or directory.");
    const pointer = (await readStableOpenedFile(dotGit, {
      label: "Candidate 010 .git pointer",
      containedBy: root,
    })).toString("utf8").trim();
    const match = /^gitdir:\s*(.+)$/i.exec(pointer);
    if (!match) throw new Error("Cannot resolve the repository Git directory.");
    gitDirectory = path.resolve(root, match[1]);
  }
  const gitInformation = await lstat(gitDirectory);
  if (gitInformation.isSymbolicLink() || !gitInformation.isDirectory()) {
    throw new Error("Candidate 010 resolved Git metadata is linked or not a directory.");
  }
  gitDirectory = await realpath(gitDirectory);
  const commonPointer = await readOptional(path.join(gitDirectory, "commondir"), gitDirectory);
  if (commonPointer === null) return { gitDirectory, commonDirectory: gitDirectory };
  const commonValue = commonPointer.trim();
  if (commonValue.length === 0 || /[\0\r\n]/.test(commonValue)) {
    throw new Error("Candidate 010 Git commondir is empty or malformed.");
  }
  const commonDirectory = path.resolve(gitDirectory, commonValue);
  const commonInformation = await lstat(commonDirectory);
  if (commonInformation.isSymbolicLink() || !commonInformation.isDirectory()) {
    throw new Error("Candidate 010 common Git metadata is linked or not a directory.");
  }
  return { gitDirectory, commonDirectory: await realpath(commonDirectory) };
}

function isWorktreeReference(reference) {
  return ["refs/bisect", "refs/rewritten", "refs/worktree"].some(
    (namespace) => reference === namespace || reference.startsWith(`${namespace}/`),
  );
}

function packedReference(body, reference) {
  for (const line of body?.split(/\r?\n/) ?? []) {
    if (line.length === 0 || line.startsWith("#") || line.startsWith("^")) continue;
    const separator = line.indexOf(" ");
    if (separator < 0 || line.slice(separator + 1) !== reference) continue;
    const commit = line.slice(0, separator);
    if (!/^[0-9a-f]{40}$/.test(commit)) {
      throw new Error(`Git packed reference ${reference} has an invalid commit identity.`);
    }
    return commit;
  }
  return null;
}

const MAXIMUM_GIT_REFERENCE_HOPS = 8;

async function resolveGitReference(initialReference, directories) {
  let current = initialReference;
  const visited = new Set();
  while (visited.size < MAXIMUM_GIT_REFERENCE_HOPS) {
    if (!current.startsWith("refs/") || visited.has(current)) {
      throw new Error(`Cannot safely resolve Git reference ${current}.`);
    }
    visited.add(current);
    const looseDirectory = isWorktreeReference(current)
      ? directories.gitDirectory
      : directories.commonDirectory;
    const loose = await readOptional(path.join(looseDirectory, ...current.split("/")), looseDirectory);
    const value = loose?.trim();
    if (/^[0-9a-f]{40}$/.test(value ?? "")) return value;
    const symbolic = /^ref:\s*(.+)$/.exec(value ?? "");
    if (symbolic) {
      current = symbolic[1];
      continue;
    }
    if (loose !== null) throw new Error(`Git loose reference ${current} is malformed.`);
    const packed = await readOptional(
      path.join(directories.commonDirectory, "packed-refs"),
      directories.commonDirectory,
    );
    return packedReference(packed, current);
  }
  throw new Error(`Cannot safely resolve Git reference ${current}.`);
}

export async function readCandidate010SourceCommit(root = process.cwd()) {
  const directories = await resolveGitDirectories(root);
  const { gitDirectory } = directories;
  const head = (await readStableOpenedFile(path.join(gitDirectory, "HEAD"), {
    label: "Candidate 010 Git HEAD",
    containedBy: gitDirectory,
  })).toString("utf8").trim();
  if (/^[0-9a-f]{40}$/.test(head)) return head;
  const match = /^ref:\s*(.+)$/.exec(head);
  if (!match) throw new Error("Repository HEAD is neither a commit nor a symbolic reference.");
  const ref = match[1];
  const commit = await resolveGitReference(ref, directories);
  if (!/^[0-9a-f]{40}$/.test(commit ?? "")) throw new Error(`Cannot resolve Git reference ${ref}.`);
  return commit;
}

export async function captureCandidate010SourceBundle(root = process.cwd()) {
  const sourceCommit = await readCandidate010SourceCommit(root);
  if (!/^[0-9a-f]{40}$/.test(sourceCommit)) throw new Error("Candidate 010 source commit is not a full Git SHA-1.");
  const vcs = {
    source_commit: sourceCommit,
    worktree_state: "source-files-hashed-directly; Git index cleanliness not inferred",
  };
  const coverage = await discoverCandidate010SourceFiles({ root });
  return computeSourceBundle({
    root,
    sourceFiles: coverage.source_files,
    vcs,
    executionManifestProjection: coverage.execution_manifest_projection,
  });
}
