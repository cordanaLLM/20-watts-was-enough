import { createHash } from "node:crypto";
import { lstat, readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BACKEND_METADATA } from "./backend-registry.mjs";
import { CONFIRMATORY_PREREGISTRATION, analyzeConfirmatory } from "./confirmatory-analysis.mjs";
import {
  bindExternalEnergyObservation,
  evaluateExternalEnergyReading,
  validateBoundExternalEnergyObservation,
} from "./energy-provider.mjs";
import { readFactorialRecords, validateFactorialRun } from "./factorial-runner.mjs";
import { openFrozenSeedRelease } from "./release-contract.mjs";

export const PROMOTION_EVIDENCE_VERSION = "candidate-010.promotion-evidence.v3";
const PROMOTION_INPUT_KEYS = Object.freeze([
  "disjointSeedPackPaths",
  "energyAssignmentsPath",
  "executionAuthority",
  "executionCapsule",
  "expectedSourceBundle",
  "releaseBindingRoot",
  "releasePath",
  "runDirectory",
].sort());
const DURABLE_PROMOTION_PATH_KEYS = Object.freeze([
  "disjointSeedPackPaths",
  "energyAssignmentsPath",
  "releaseBindingRoot",
  "releasePath",
  "runDirectory",
].sort());
const PROMOTION_ACTION = "candidate-010-promotion-evidence";
const PROMOTION_ENTRY = "experiments/workstation/candidate-010/promotion-evidence.mjs";
const RUN_INPUTS = Object.freeze([
  "raw/events.ndjson",
  "provenance/checkpoint.json",
  "provenance/config.json",
  "provenance/factorial-design.json",
  "provenance/environment.json",
  "provenance/run.json",
  "provenance/seeds.json",
  "provenance/source-bundle.json",
  "provenance/capsule-execution-authority.json",
  "provenance/launch-precommit.json",
  "provenance/capsule-launch-receipt.json",
  "provenance/confirmation-setup-accounting.json",
]);

function canonical(value) {
  if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("Promotion evidence rejects non-finite numbers.");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => {
      if (value[key] === undefined) throw new TypeError(`Promotion evidence rejects undefined at ${key}.`);
      return `${JSON.stringify(key)}:${canonical(value[key])}`;
    }).join(",")}}`;
  }
  throw new TypeError(`Promotion evidence rejects ${typeof value}.`);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function json(file, label) {
  let body;
  try {
    body = await readFile(file);
  } catch (error) {
    throw new Error(`Cannot read ${label}: ${error.message}`, { cause: error });
  }
  try {
    return { body, value: JSON.parse(body) };
  } catch (error) {
    throw new Error(`${label} is not valid JSON: ${error.message}`, { cause: error });
  }
}

function normalizedAbsolute(value) {
  const absolute = path.resolve(value);
  return process.platform === "win32" ? absolute.toLowerCase() : absolute;
}

function samePath(left, right) {
  return normalizedAbsolute(left) === normalizedAbsolute(right);
}

function inside(root, target) {
  const relation = path.relative(root, target);
  return relation === "" || (
    relation !== ".."
    && !relation.startsWith(`..${path.sep}`)
    && !path.isAbsolute(relation)
  );
}

async function strictDirectory(value, label) {
  const absolute = path.resolve(value);
  let information;
  try {
    information = await lstat(absolute);
  } catch (error) {
    throw new Error(`${label} is unavailable: ${error.message}`, { cause: error });
  }
  if (information.isSymbolicLink() || !information.isDirectory()) {
    throw new Error(`${label} must be a real directory, not a symbolic link or reparse point.`);
  }
  const resolved = await realpath(absolute);
  if (!samePath(absolute, resolved)) {
    throw new Error(`${label} resolves through a symbolic link or reparse point.`);
  }
  return resolved;
}

async function containedRegularFile(rootValue, fileValue, label, seenRealPaths = null) {
  const root = await strictDirectory(rootValue, `${label} root`);
  const file = path.resolve(fileValue);
  if (!inside(root, file) || samePath(root, file)) {
    throw new Error(`${label} escapes its declared root.`);
  }
  let cursor = root;
  const components = path.relative(root, file).split(path.sep).filter(Boolean);
  for (const [index, component] of components.entries()) {
    cursor = path.join(cursor, component);
    let information;
    try {
      information = await lstat(cursor);
    } catch (error) {
      throw new Error(`${label} is unavailable: ${error.message}`, { cause: error });
    }
    if (information.isSymbolicLink()) {
      throw new Error(`${label} traverses a symbolic link or reparse point.`);
    }
    if (index < components.length - 1 && !information.isDirectory()) {
      throw new Error(`${label} traverses a non-directory component.`);
    }
    if (index === components.length - 1 && !information.isFile()) {
      throw new Error(`${label} must be a regular file.`);
    }
  }
  const resolved = await realpath(file);
  if (!inside(root, resolved) || !samePath(file, resolved)) {
    throw new Error(`${label} resolves outside its root or through a symbolic link or reparse point.`);
  }
  const normalized = normalizedAbsolute(resolved);
  if (seenRealPaths?.has(normalized)) {
    throw new Error(`${label} duplicates another promotion input real path.`);
  }
  seenRealPaths?.add(normalized);
  return resolved;
}

async function fileIdentity(file, scope, root) {
  const body = await readFile(file);
  const relative = path.relative(root, file).replaceAll("\\", "/");
  if (!relative || relative.startsWith("../") || path.isAbsolute(relative)) {
    throw new Error(`Promotion input identity escapes its ${scope} root.`);
  }
  return {
    scope,
    path: relative,
    bytes: body.length,
    sha256: sha256(body),
  };
}

function resolveInside(root, relative, label) {
  if (typeof relative !== "string" || relative.length === 0 || path.isAbsolute(relative)) {
    throw new Error(`Invalid ${label} path.`);
  }
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, ...relative.replaceAll("\\", "/").split("/"));
  const relation = path.relative(resolvedRoot, resolved);
  if (!relation || relation === ".." || relation.startsWith(`..${path.sep}`) || path.isAbsolute(relation)) {
    throw new Error(`${label} path escapes its root.`);
  }
  return resolved;
}

function exactSet(values) {
  return [...new Set(values)].sort();
}

function expectedEnergyOwnership(record) {
  return {
    run_id: record.run_id,
    pair_id: record.pair_id,
    work_unit_id: record.work_unit_id,
    scenario_id: record.scenario_id,
    task_family: record.task_family,
    backend_id: record.backend_id,
    cluster_id: record.cluster_id,
    opportunity_id: record.opportunity_id,
    arm: record.arm,
    interval_started_at: record.measurement_interval?.started_at,
    interval_ended_at: record.measurement_interval?.ended_at,
  };
}

function backendRows(document) {
  const rows = Array.isArray(document) ? document : document?.backends;
  if (!Array.isArray(rows) || rows.length === 0) throw new Error("Bound backend registry must contain a non-empty backends array.");
  return rows;
}

function assertEligibleAnalysis(analysis) {
  if (
    analysis?.eligible_for_superiority_claim !== true
    || analysis.decision !== "eligible"
    || !Array.isArray(analysis.validation_errors)
    || analysis.validation_errors.length !== 0
    || analysis.gates?.safety_noninferiority !== "passed"
    || analysis.gates?.loss_superiority !== "passed"
    || analysis.gates?.resource_superiority !== "passed"
  ) {
    const diagnostic = {
      decision: analysis?.decision ?? null,
      eligible_for_superiority_claim: analysis?.eligible_for_superiority_claim ?? false,
      gates: analysis?.gates ?? null,
      validation_errors: Array.isArray(analysis?.validation_errors) ? analysis.validation_errors : null,
      kill_reasons: Array.isArray(analysis?.kill_reasons) ? analysis.kill_reasons : null,
      resource_effects: Array.isArray(analysis?.effects)
        ? analysis.effects.filter((row) => ["joules_per_correct_commit", "p99_stopping_time_ms"].includes(row.endpoint))
        : null,
    };
    throw new Error(`Recomputed confirmatory analysis is not promotion-eligible: ${canonical(diagnostic)}`);
  }
}

function assertFrozenPreregistration(preregistration) {
  const registered = CONFIRMATORY_PREREGISTRATION;
  if (
    preregistration?.schema !== registered.schema
    || typeof preregistration.id !== "string"
    || !preregistration.id.endsWith("-frozen")
    || preregistration.candidate_arm !== registered.candidate_arm
    || canonical(preregistration.comparators) !== canonical(registered.comparators)
    || canonical(preregistration.gatekeeping) !== canonical(registered.gatekeeping)
    || preregistration.alpha_familywise !== registered.alpha_familywise
    || preregistration.minimum_implemented_task_families !== registered.minimum_implemented_task_families
    || preregistration.minimum_independent_clusters_per_family !== registered.minimum_independent_clusters_per_family
    || preregistration.energy_observation_kind !== registered.energy_observation_kind
    || canonical(Object.keys(preregistration.endpoints ?? {}).sort()) !== canonical(Object.keys(registered.endpoints).sort())
  ) throw new Error("Release preregistration does not match the registered frozen confirmatory plan.");
  for (const endpoint of Object.keys(registered.endpoints)) {
    const expected = registered.endpoints[endpoint];
    const observed = preregistration.endpoints?.[endpoint];
    if (!observed || observed.role !== expected.role || observed.estimand !== expected.estimand) {
      throw new Error(`Release preregistration changed endpoint ${endpoint}.`);
    }
    if (["irreversible_violations", "false_commits"].includes(endpoint)) {
      if (!Number.isFinite(observed.margin) || observed.margin < 0) {
        throw new Error(`Release preregistration did not freeze safety margin ${endpoint}.`);
      }
    } else if (observed.margin !== expected.margin) {
      throw new Error(`Release preregistration changed margin ${endpoint}.`);
    }
  }
}

function evidenceDigest(document) {
  const { evidence_sha256: ignored, ...body } = document;
  void ignored;
  return sha256(canonical(body));
}

function assertPromotionInput(input) {
  if (
    !input
    || typeof input !== "object"
    || Array.isArray(input)
    || canonical(Object.keys(input).sort()) !== canonical(PROMOTION_INPUT_KEYS)
  ) {
    throw new Error("Promotion recomputation requires the exact live capsule/release input contract; legacy worktree roots are refused.");
  }
  for (const name of ["runDirectory", "releaseBindingRoot", "releasePath", "energyAssignmentsPath"]) {
    if (typeof input[name] !== "string" || input[name].length === 0) {
      throw new Error(`Promotion recomputation requires a non-empty ${name}.`);
    }
  }
  return input;
}

function assertDurablePromotionPaths(input) {
  if (
    !input
    || typeof input !== "object"
    || Array.isArray(input)
    || canonical(Object.keys(input).sort()) !== canonical(DURABLE_PROMOTION_PATH_KEYS)
  ) throw new Error("Durable promotion validation requires the exact persisted path contract.");
  for (const name of ["runDirectory", "releaseBindingRoot", "releasePath", "energyAssignmentsPath"]) {
    if (typeof input[name] !== "string" || input[name].length === 0) {
      throw new Error(`Durable promotion validation requires a non-empty ${name}.`);
    }
  }
  if (!Array.isArray(input.disjointSeedPackPaths) || input.disjointSeedPackPaths.length === 0) {
    throw new Error("Durable promotion validation requires explicit disjoint seed-pack paths.");
  }
  return input;
}

function assertEvidenceEnvelope(evidence) {
  if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) {
    throw new Error("Promotion evidence must be a complete bundle, not a summary boolean.");
  }
  if (
    evidence.contract_version !== PROMOTION_EVIDENCE_VERSION
    || evidence.evidence_sha256 !== evidenceDigest(evidence)
  ) throw new Error("Promotion evidence canonical digest is invalid.");
  assertEligibleAnalysis(evidence.analysis);
  return evidence;
}

async function validatePersistedPromotionInputs(evidence, input) {
  const paths = assertDurablePromotionPaths(input);
  const roots = {
    run: await strictDirectory(paths.runDirectory, "factorial run root"),
    release: await strictDirectory(paths.releaseBindingRoot, "release binding root"),
  };
  if (inside(roots.run, roots.release) || inside(roots.release, roots.run)) {
    throw new Error("Persisted promotion run and release roots must be physically disjoint.");
  }
  const energyRoot = await strictDirectory(path.dirname(paths.energyAssignmentsPath), "energy assignment root");
  if (!inside(roots.run, energyRoot) && !inside(roots.release, energyRoot)) {
    throw new Error("Persisted energy inputs must be contained by the run or release binding root.");
  }
  if (!Array.isArray(evidence.input_files) || evidence.input_files.length === 0) {
    throw new Error("Promotion evidence omits its complete input-file inventory.");
  }
  const scopes = new Map([
    ["release", roots.release],
    ["release-binding", roots.release],
    ["disjoint-seed-pack", roots.release],
    ["factorial-run", roots.run],
    ["bound-energy", energyRoot],
    ["raw-energy-reading", energyRoot],
    ["energy-provenance-review", energyRoot],
  ]);
  const seenRows = new Set();
  const seenRealPaths = new Set();
  const observed = [];
  for (const row of evidence.input_files) {
    if (
      !row
      || typeof row !== "object"
      || Array.isArray(row)
      || canonical(Object.keys(row).sort()) !== canonical(["bytes", "path", "scope", "sha256"].sort())
      || typeof row.scope !== "string"
      || typeof row.path !== "string"
      || !Number.isSafeInteger(row.bytes)
      || row.bytes < 0
      || !/^[0-9a-f]{64}$/.test(row.sha256 ?? "")
    ) throw new Error("Promotion evidence contains an invalid input-file identity.");
    const rowKey = `${row.scope}\0${row.path}`;
    if (seenRows.has(rowKey)) throw new Error("Promotion evidence duplicates an input-file identity.");
    seenRows.add(rowKey);
    if (row.scope === "repository-source" || row.scope === "promotion-validator-source") continue;
    const root = scopes.get(row.scope);
    if (!root) throw new Error(`Promotion evidence contains unknown input-file scope ${row.scope}.`);
    const checked = await containedRegularFile(
      root,
      resolveInside(root, row.path, `${row.scope} input`),
      `${row.scope} input`,
      seenRealPaths,
    );
    const identity = await fileIdentity(checked, row.scope, root);
    if (canonical(identity) !== canonical(row)) {
      throw new Error(`Persisted promotion input differs from evidence: ${row.scope}/${row.path}.`);
    }
    observed.push(identity);
  }
  const sourceRows = evidence.input_files.filter((row) => row.scope === "repository-source");
  const validatorRows = evidence.input_files.filter((row) => row.scope === "promotion-validator-source");
  if (
    sourceRows.length === 0
    || validatorRows.length !== 1
    || validatorRows[0].path !== PROMOTION_ENTRY
  ) throw new Error("Promotion evidence omits its frozen source or fixed validator identity.");

  const exactPersisted = async (file, scope, root, label) => {
    const checked = await containedRegularFile(root, file, label);
    return fileIdentity(checked, scope, root);
  };
  const explicit = [
    await exactPersisted(paths.releasePath, "release", roots.release, "frozen release"),
    await exactPersisted(paths.energyAssignmentsPath, "bound-energy", energyRoot, "bound energy assignments"),
    ...await Promise.all(paths.disjointSeedPackPaths.map((file, index) => (
      exactPersisted(file, "disjoint-seed-pack", roots.release, `disjoint seed pack ${index + 1}`)
    ))),
    ...await Promise.all(RUN_INPUTS.map((relative) => exactPersisted(
      path.join(roots.run, ...relative.split("/")),
      "factorial-run",
      roots.run,
      `factorial run ${relative}`,
    ))),
  ];
  for (const identity of explicit) {
    if (!observed.some((row) => canonical(row) === canonical(identity))) {
      throw new Error(`Promotion evidence does not bind explicit persisted input ${identity.scope}/${identity.path}.`);
    }
  }
}

async function recompute(input) {
  const {
    executionAuthority,
    executionCapsule,
    expectedSourceBundle,
    runDirectory,
    releaseBindingRoot,
    releasePath,
    energyAssignmentsPath,
    disjointSeedPackPaths,
  } = assertPromotionInput(input);
  if (!Array.isArray(disjointSeedPackPaths) || disjointSeedPackPaths.length === 0) {
    throw new Error("Promotion evidence requires explicit disjoint seed-pack artifact paths.");
  }
  const { assertCapsuleExecutionAuthority } = await import("./capsule-execution-authority.mjs");
  const authority = await assertCapsuleExecutionAuthority(executionAuthority, {
    executionCapsule,
    expectedSourceBundle,
  });
  const seenRealPaths = new Set();
  const roots = {
    source: await strictDirectory(authority.source_root, "capsule source root"),
    run: await strictDirectory(runDirectory, "factorial run root"),
    release: await strictDirectory(releaseBindingRoot, "release binding root"),
  };
  for (const [leftName, rightName] of [["source", "run"], ["source", "release"], ["run", "release"]]) {
    if (inside(roots[leftName], roots[rightName]) || inside(roots[rightName], roots[leftName])) {
      throw new Error(`Promotion ${leftName} and ${rightName} roots must be physically disjoint.`);
    }
  }
  const checkedReleasePath = await containedRegularFile(
    roots.release,
    releasePath,
    "frozen release",
    seenRealPaths,
  );
  const checkedDisjointPaths = await Promise.all(disjointSeedPackPaths.map((file, index) => (
    containedRegularFile(roots.release, file, `disjoint seed pack ${index + 1}`, seenRealPaths)
  )));
  const releaseDocument = (await json(checkedReleasePath, "frozen release")).value;
  const bindingFiles = Object.fromEntries(await Promise.all(Object.entries(releaseDocument.bindings ?? {}).map(
    async ([name, binding]) => {
      const lexical = resolveInside(roots.release, binding?.path, `release ${name}`);
      const checked = await containedRegularFile(
        roots.release,
        lexical,
        `release ${name}`,
        seenRealPaths,
      );
      return [name, checked];
    },
  )));
  const checkedRunInputs = Object.fromEntries(await Promise.all(RUN_INPUTS.map(async (relative) => ([
    relative,
    await containedRegularFile(
      roots.run,
      path.join(roots.run, ...relative.split("/")),
      `factorial run ${relative}`,
      seenRealPaths,
    ),
  ]))));
  const energyRoot = await strictDirectory(path.dirname(energyAssignmentsPath), "energy assignment root");
  if (
    inside(roots.source, energyRoot)
    || inside(energyRoot, roots.source)
    || (!inside(roots.run, energyRoot) && !inside(roots.release, energyRoot))
  ) {
    throw new Error("Energy inputs must be contained by the run or release root and disjoint from executable source.");
  }
  const checkedEnergyAssignmentsPath = await containedRegularFile(
    energyRoot,
    energyAssignmentsPath,
    "bound energy assignments",
    seenRealPaths,
  );
  const disjointDocuments = await Promise.all(checkedDisjointPaths.map(async (file) => (
    (await json(file, "disjoint seed pack")).value
  )));
  const openedRelease = await openFrozenSeedRelease({
    bindingRoot: roots.release,
    sourceRoot: roots.source,
    releasePath: checkedReleasePath,
    expectedPartition: "confirmation",
    phase: "confirmation",
    disjointWith: disjointDocuments,
    executionDescriptor: executionCapsule.descriptor,
    runtimeIdentity: executionCapsule.descriptor.runtime_identity,
  });
  const currentSourceBundle = expectedSourceBundle;
  if (
    openedRelease.source_identity.source_sha256 !== currentSourceBundle.source_sha256
    || openedRelease.source_identity.source_commit !== currentSourceBundle.vcs.source_commit
  ) throw new Error("Opened release does not bind the current executable source bundle.");
  if (
    openedRelease.execution_binding.descriptor_sha256 !== authority.execution_descriptor_sha256
    || openedRelease.execution_binding.source_inventory_sha256 !== authority.source_inventory_sha256
    || openedRelease.execution_binding.dependency_inventory_sha256 !== authority.dependency_inventory_sha256
    || openedRelease.runtime_binding.identity_sha256 !== authority.runtime_identity_sha256
  ) throw new Error("Opened release execution/runtime bindings differ from the active capsule authority.");

  const factorialValidation = await validateFactorialRun(roots.run, {
    executionAuthority,
    executionCapsule,
    expectedSourceBundle,
  });
  if (factorialValidation.valid !== true || factorialValidation.errors.length !== 0) {
    throw new Error("Factorial run did not pass exact ledger validation.");
  }
  const records = await readFactorialRecords(roots.run);
  if (records.some((record) => record.phase !== openedRelease.phase)) {
    throw new Error("Factorial ledger contains records outside the opened confirmation release phase.");
  }
  const run = (await json(checkedRunInputs["provenance/run.json"], "run provenance")).value;
  const runConfig = (await json(checkedRunInputs["provenance/config.json"], "run config")).value;
  const runDesign = (await json(checkedRunInputs["provenance/factorial-design.json"], "run design")).value;
  const runSeeds = (await json(checkedRunInputs["provenance/seeds.json"], "run seeds")).value;
  const runSourceBundle = (await json(checkedRunInputs["provenance/source-bundle.json"], "run source bundle")).value;
  const runCapsuleAuthority = (await json(
    checkedRunInputs["provenance/capsule-execution-authority.json"],
    "run capsule execution authority",
  )).value;
  const runLaunchReceipt = (await json(
    checkedRunInputs["provenance/capsule-launch-receipt.json"],
    "run capsule launch receipt",
  )).value;
  const stableAuthority = {
    authority_version: authority.authority_version,
    execution_descriptor_sha256: authority.execution_descriptor_sha256,
    source_bundle_sha256: authority.source_bundle_sha256,
    source_inventory_sha256: authority.source_inventory_sha256,
    runtime_identity_sha256: authority.runtime_identity_sha256,
    dependency_inventory_sha256: authority.dependency_inventory_sha256,
    head_commit: authority.head_commit,
  };
  if (
    run.scientific_payload_sha256 !== factorialValidation.scientific_payload_sha256
    || run.hash_chain_sha256 !== factorialValidation.hash_chain_sha256
    || run.records !== records.length
  ) throw new Error("Run provenance does not exactly match the validated ledger digests.");
  if (canonical(runSeeds.seeds) !== canonical(openedRelease.seeds)) throw new Error("Factorial run seeds differ from the opened release.");
  if (canonical(runSourceBundle) !== canonical(currentSourceBundle)) throw new Error("Factorial run source bundle is not current.");
  if (canonical(runCapsuleAuthority) !== canonical(stableAuthority)) {
    throw new Error("Factorial run capsule-execution-authority provenance differs from the active capability.");
  }
  if (
    canonical(runSeeds.execution_binding) !== canonical(openedRelease.execution_binding)
    || canonical(runSeeds.runtime_binding) !== canonical(openedRelease.runtime_binding)
    || runCapsuleAuthority.execution_descriptor_sha256 !== openedRelease.execution_binding.descriptor_sha256
    || runCapsuleAuthority.source_inventory_sha256 !== openedRelease.execution_binding.source_inventory_sha256
    || runCapsuleAuthority.dependency_inventory_sha256 !== openedRelease.execution_binding.dependency_inventory_sha256
    || runCapsuleAuthority.runtime_identity_sha256 !== openedRelease.runtime_binding.identity_sha256
  ) throw new Error("Factorial run and frozen release execution/runtime bindings do not exactly agree.");

  const [releaseConfig, releaseDesign, releaseRegistry, preregistration] = await Promise.all([
    json(bindingFiles.config, "release config"),
    json(bindingFiles.design, "release design"),
    json(bindingFiles.backend_registry, "release backend registry"),
    json(bindingFiles.preregistration, "release preregistration"),
  ]).then((rows) => rows.map((row) => row.value));
  if (canonical(releaseConfig) !== canonical(runConfig)) throw new Error("Run config differs from the release-bound config.");
  if (canonical(releaseDesign) !== canonical(runDesign)) throw new Error("Run design differs from the release-bound design.");
  assertFrozenPreregistration(preregistration);

  const observedTaskBackends = exactSet(records.map((record) => `${record.task_family}\u0000${record.backend_id}`));
  if (observedTaskBackends.length < 2) throw new Error("Promotion evidence requires at least two implemented task-family/backend pairs.");
  const registry = backendRows(releaseRegistry);
  const authoritativeMetadata = new Map(BACKEND_METADATA.map((row) => [`${row.task_family}\u0000${row.backend_id}`, row]));
  const taskBackends = observedTaskBackends.map((key) => {
    const [taskFamily, backendId] = key.split("\u0000");
    const bound = registry.find((row) => row.task_family === taskFamily && row.backend_id === backendId);
    const current = authoritativeMetadata.get(key);
    if (
      !bound
      || !current
      || canonical(bound) !== canonical(current)
      || bound.implemented !== true
      || bound.physical_actuation !== false
    ) {
      throw new Error(`Release does not bind the current implemented backend: ${taskFamily}/${backendId}`);
    }
    return { task_family: taskFamily, backend_id: backendId };
  });

  const energyArtifact = (await json(checkedEnergyAssignmentsPath, "bound energy assignments")).value;
  if (energyArtifact?.schema !== 1 || !Array.isArray(energyArtifact.assignments)) {
    throw new Error("Bound energy artifact must contain raw-backed assignments; summary booleans are not evidence.");
  }
  if (energyArtifact.assignments.length !== records.length) {
    throw new Error("Bound energy ownership is not one-to-one with raw factorial records.");
  }
  const energyByWorkUnit = new Map();
  const energyInputFiles = [];
  const usedRawPaths = new Set();
  const usedReviewPaths = new Set();
  for (const assignment of energyArtifact.assignments) {
    if (!assignment || typeof assignment !== "object" || !assignment.observation) {
      throw new Error("Energy assignment lacks a normalized observation.");
    }
    const rawPath = await containedRegularFile(
      energyRoot,
      resolveInside(energyRoot, assignment.raw_reading_path, "raw energy reading"),
      "raw energy reading",
      seenRealPaths,
    );
    const reviewPath = await containedRegularFile(
      energyRoot,
      resolveInside(energyRoot, assignment.provenance_review_path, "energy provenance review"),
      "energy provenance review",
      seenRealPaths,
    );
    if (usedRawPaths.has(rawPath) || usedReviewPaths.has(reviewPath)) {
      throw new Error("Energy assignments reuse a raw reading or provenance-review file.");
    }
    usedRawPaths.add(rawPath);
    usedReviewPaths.add(reviewPath);
    const [rawReading, review] = await Promise.all([
      json(rawPath, "raw energy reading"),
      json(reviewPath, "energy provenance review"),
    ]);
    const normalized = evaluateExternalEnergyReading(rawReading.value).measured;
    const ownership = assignment.observation.binding?.ownership;
    const reconstructed = bindExternalEnergyObservation(normalized, {
      ownership,
      provenanceReview: review.value,
    });
    if (canonical(reconstructed) !== canonical(assignment.observation)) {
      throw new Error("Bound energy observation does not exactly reconstruct from its raw reading and review.");
    }
    const observation = assignment.observation;
    const workUnitId = observation?.binding?.ownership?.work_unit_id;
    if (!workUnitId || energyByWorkUnit.has(workUnitId)) throw new Error("Bound energy contains missing or duplicate work-unit ownership.");
    energyByWorkUnit.set(workUnitId, observation);
    energyInputFiles.push(
      await fileIdentity(rawPath, "raw-energy-reading", energyRoot),
      await fileIdentity(reviewPath, "energy-provenance-review", energyRoot),
    );
  }
  const confirmatoryRecords = records.map((record) => {
    const observation = energyByWorkUnit.get(record.work_unit_id);
    if (!observation) throw new Error(`Missing bound external energy for work unit ${record.work_unit_id}.`);
    validateBoundExternalEnergyObservation(observation, expectedEnergyOwnership(record));
    const { modeled_energy_j: ignored, external_energy: ignoredExternal, ...resources } = record.resources;
    void ignored;
    void ignoredExternal;
    return {
      ...record,
      energy_interval: {
        started_at: record.measurement_interval.started_at,
        ended_at: record.measurement_interval.ended_at,
      },
      resources: { ...resources, external_energy: observation },
    };
  });
  if (energyByWorkUnit.size !== records.length) throw new Error("Energy artifact contains ownership outside the raw ledger.");

  const scenarioBudgets = runDesign.scenarios?.map((scenario) => scenario.budget);
  if (!Array.isArray(scenarioBudgets) || scenarioBudgets.length === 0) throw new Error("Release design has no authoritative budget contract.");
  const budgetCanonical = canonical(scenarioBudgets[0]);
  if (scenarioBudgets.some((budget) => canonical(budget) !== budgetCanonical)) {
    throw new Error("Release design contains unequal authoritative budget contracts.");
  }
  const taskFamilies = Object.fromEntries(taskBackends.map((row) => [row.task_family, {
    implemented: true,
    backend_ids: [row.backend_id],
  }]));
  const context = {
    schema: 1,
    phase: openedRelease.phase,
    frozen_release: openedRelease.frozen_release,
    preregistration_id: preregistration.id,
    task_families: taskFamilies,
    budget: {
      contract_id: `sha256:${sha256(budgetCanonical)}`,
      validated: true,
      within_budget: true,
    },
  };
  const analysis = analyzeConfirmatory({ records: confirmatoryRecords, context, preregistration });
  assertEligibleAnalysis(analysis);

  const inputFiles = [
    ...(await Promise.all(currentSourceBundle.files.map(async (entry) => ({
      scope: "repository-source",
      path: entry.path,
      bytes: entry.bytes,
      sha256: entry.sha256,
    })))),
    await fileIdentity(checkedReleasePath, "release", roots.release),
    ...(await Promise.all(Object.values(bindingFiles).map((file) => fileIdentity(file, "release-binding", roots.release)))),
    ...(await Promise.all(checkedDisjointPaths.map((file) => fileIdentity(file, "disjoint-seed-pack", roots.release)))),
    ...(await Promise.all(RUN_INPUTS.map((relative) => fileIdentity(checkedRunInputs[relative], "factorial-run", roots.run)))),
    await fileIdentity(checkedEnergyAssignmentsPath, "bound-energy", energyRoot),
    ...energyInputFiles,
    await fileIdentity(fileURLToPath(import.meta.url), "promotion-validator-source", roots.source),
  ];
  inputFiles.sort((left, right) => left.scope.localeCompare(right.scope) || left.path.localeCompare(right.path));

  const body = {
    schema: 1,
    contract_version: PROMOTION_EVIDENCE_VERSION,
    source: {
      commit: currentSourceBundle.vcs.source_commit,
      bundle_sha256: currentSourceBundle.source_sha256,
    },
    capsule: {
      authority_version: authority.authority_version,
      execution_descriptor_sha256: authority.execution_descriptor_sha256,
      source_inventory_sha256: authority.source_inventory_sha256,
      runtime_identity_sha256: authority.runtime_identity_sha256,
      runtime_executable_sha256: executionCapsule.descriptor.runtime_identity.runtime.executable_sha256,
      dependency_inventory_sha256: authority.dependency_inventory_sha256,
    },
    confirmation_launch: {
      launch_receipt_sha256: runLaunchReceipt.receipt_sha256,
      launch_receipt_file_sha256: inputFiles.find((row) => (
        row.scope === "factorial-run" && row.path === "provenance/capsule-launch-receipt.json"
      )).sha256,
      launch_precommit_file_sha256: inputFiles.find((row) => (
        row.scope === "factorial-run" && row.path === "provenance/launch-precommit.json"
      )).sha256,
      setup_accounting_file_sha256: inputFiles.find((row) => (
        row.scope === "factorial-run" && row.path === "provenance/confirmation-setup-accounting.json"
      )).sha256,
    },
    release: {
      release_sha256: openedRelease.release_sha256,
      version: openedRelease.release_version,
      partition: openedRelease.partition,
      seed_commitment: openedRelease.seed_pack.commitment,
      execution_descriptor_sha256: openedRelease.execution_binding.descriptor_sha256,
      runtime_identity_sha256: openedRelease.runtime_binding.identity_sha256,
      execution_descriptor_file_sha256: releaseDocument.bindings.execution_descriptor.sha256,
      runtime_identity_file_sha256: releaseDocument.bindings.runtime_identity.sha256,
    },
    task_backends: taskBackends,
    ledger: {
      records: records.length,
      scientific_payload_sha256: factorialValidation.scientific_payload_sha256,
      hash_chain_sha256: factorialValidation.hash_chain_sha256,
      raw_events_sha256: inputFiles.find((row) => row.scope === "factorial-run" && row.path === "raw/events.ndjson").sha256,
    },
    energy: {
      observations: energyArtifact.assignments.length,
      raw_reading_sha256: exactSet(energyInputFiles
        .filter((row) => row.scope === "raw-energy-reading")
        .map((row) => row.sha256)),
      provenance_review_sha256: exactSet(energyInputFiles
        .filter((row) => row.scope === "energy-provenance-review")
        .map((row) => row.sha256)),
    },
    analysis,
    analysis_sha256: sha256(canonical(analysis)),
    input_files: inputFiles,
  };
  return { ...body, evidence_sha256: sha256(canonical(body)) };
}

export async function buildPromotionEvidence(paths) {
  return recompute(paths);
}

export async function validatePromotionEvidence(evidence, paths) {
  assertEvidenceEnvelope(evidence);
  const recomputed = await recompute(paths);
  if (canonical(evidence) !== canonical(recomputed)) throw new Error("Promotion evidence differs from recomputed repository artifacts.");
  assertEligibleAnalysis(recomputed.analysis);
  return { valid: true, evidence_sha256: recomputed.evidence_sha256 };
}

/**
 * Offline gate for evidence already built and recomputed by the fixed fresh
 * promotion child. This never creates execution authority and cannot replace
 * buildPromotionEvidence/validatePromotionEvidence inside the live callback.
 */
export async function validateDurablePromotionEvidence(evidence, launchReceipt, paths) {
  assertEvidenceEnvelope(evidence);
  await validatePersistedPromotionInputs(evidence, paths);
  const { validateCapsuleLaunchReceipt } = await import("./capsule-bootstrap.mjs");
  const receiptValidation = validateCapsuleLaunchReceipt(launchReceipt, {
    action: PROMOTION_ACTION,
    executionDescriptorSha256: evidence.capsule?.execution_descriptor_sha256,
    sourceInventorySha256: evidence.capsule?.source_inventory_sha256,
    dependencyInventorySha256: evidence.capsule?.dependency_inventory_sha256,
    runtimeIdentitySha256: evidence.capsule?.runtime_identity_sha256,
  });
  if (
    launchReceipt.action_entry_relative_path !== PROMOTION_ENTRY
    || launchReceipt.runtime_executable_sha256 !== evidence.capsule?.runtime_executable_sha256
    || launchReceipt.result_sha256 !== sha256(canonical(evidence))
    || launchReceipt.validation_sha256 !== sha256(canonical({
      valid: true,
      evidence_sha256: evidence.evidence_sha256,
    }))
  ) throw new Error("Promotion launch receipt does not bind the exact evidence result and validation.");
  return {
    valid: true,
    evidence_sha256: evidence.evidence_sha256,
    launch_receipt_sha256: receiptValidation.receipt_sha256,
  };
}
