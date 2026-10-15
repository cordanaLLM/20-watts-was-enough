import { createHash, randomUUID } from "node:crypto";
import {
  access,
  link,
  lstat,
  mkdir,
  open,
  readFile,
  realpath,
  rename,
  rm,
  statfs,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import {
  deterministicWorkUnits,
  openCheckpointLedger,
  remainingWorkUnits,
} from "./checkpoint.mjs";
import { evaluateExternalEnergyReading } from "./energy-provider.mjs";
import { assertCandidate010RawEvent } from "./event-contract.mjs";
import { buildFactorialDesign } from "./factorial-design.mjs";
import {
  analyzeFactorialRun,
  runFactorialExperiment,
  validateFactorialRun,
} from "./factorial-runner.mjs";
import { generateOpportunities } from "./generator.mjs";
import { executeFilesystemTrial } from "./filesystem-track.mjs";
import { armNames, decide, scoreDecision, shouldRevealTrace } from "./policies.mjs";
import { traceBodyForJob } from "./trace-job.mjs";
import { captureRuntimeIdentity } from "./runtime-identity.mjs";
import { captureCandidate010SourceBundle } from "./source-bundle.mjs";
import {
  buildExecutionCapsule,
  destroyExecutionCapsule,
  verifyExecutionCapsule,
} from "./execution-capsule.mjs";
import {
  launchVerifiedCapsuleAction,
  validateCapsuleLaunchReceipt,
} from "./capsule-bootstrap.mjs";
import { RELEASE_CONTRACT_VERSION } from "./release-contract.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const benchmarkRoot = path.join(root, "experiments", "workstation", "candidate-010");
const PROMOTION_CHILD_OUTPUT_LIMIT_BYTES = 1024 * 1024;

function parseArgs(argv) {
  const action = argv[2];
  const options = {};
  for (let index = 3; index < argv.length; index += 2) {
    const key = argv[index]?.replace(/^--/, "");
    options[key] = argv[index + 1];
  }
  return { action, options };
}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function loadJson(file) {
  return JSON.parse(await readFile(file, "utf8"));
}

function isContained(rootValue, targetValue) {
  const relative = path.relative(rootValue, targetValue);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

async function strictRoot(value, label) {
  const absolute = path.resolve(value);
  const information = await lstat(absolute);
  if (information.isSymbolicLink() || !information.isDirectory()) {
    throw new Error(`${label} must be a real directory, not a symlink or reparse point.`);
  }
  return realpath(absolute);
}

async function containedRegularFile(rootValue, fileValue, label) {
  const rootPath = path.resolve(rootValue);
  const target = path.isAbsolute(fileValue)
    ? path.resolve(fileValue)
    : path.resolve(rootPath, fileValue);
  if (!isContained(rootPath, target)) throw new Error(`${label} escapes release-root.`);
  const rootReal = await strictRoot(rootPath, "release-root");
  let cursor = rootPath;
  for (const component of path.relative(rootPath, target).split(path.sep).filter(Boolean)) {
    cursor = path.join(cursor, component);
    const information = await lstat(cursor);
    if (information.isSymbolicLink()) {
      throw new Error(`${label} traverses a symlink or reparse point.`);
    }
  }
  const [targetReal, information] = await Promise.all([realpath(target), lstat(target)]);
  if (!information.isFile() || !isContained(rootReal, targetReal)) {
    throw new Error(`${label} is not a contained regular file.`);
  }
  return targetReal;
}

export function parseCapsuleConfirmationOptions(argv) {
  const allowed = new Set([
    "release-root",
    "release",
    "disjoint-with",
    "output",
    "resume",
    "capsule-parent",
    "stop-after-records",
  ]);
  if ((argv.length - 3) % 2 !== 0) {
    throw new Error("capsule-confirmation options require explicit --name value pairs.");
  }
  const options = {};
  for (let index = 3; index < argv.length; index += 2) {
    const token = argv[index];
    if (!/^--[a-z][a-z-]*$/.test(token ?? "")) {
      throw new Error(`Invalid capsule-confirmation option ${token ?? "<missing>"}.`);
    }
    const key = token.slice(2);
    if (!allowed.has(key)) throw new Error(`Unknown capsule-confirmation option --${key}.`);
    if (Object.hasOwn(options, key)) throw new Error(`Duplicate capsule-confirmation option --${key}.`);
    const value = argv[index + 1];
    if (typeof value !== "string" || value.length === 0 || value.startsWith("--")) {
      throw new Error(`capsule-confirmation option --${key} requires a value.`);
    }
    options[key] = value;
  }
  for (const required of ["release-root", "release", "disjoint-with", "output"]) {
    if (!options[required]) throw new Error(`capsule-confirmation requires --${required}.`);
  }
  if (options.resume !== undefined && options.resume !== "true") {
    throw new Error("capsule-confirmation only accepts --resume true.");
  }
  if (
    options["stop-after-records"] !== undefined
    && (!/^\d+$/.test(options["stop-after-records"]) || Number(options["stop-after-records"]) < 1)
  ) throw new Error("capsule-confirmation --stop-after-records must be a positive integer.");
  return options;
}

export function parseCapsulePromotionBuildOptions(argv) {
  const required = new Set([
    "run-directory",
    "release-root",
    "release",
    "energy-assignments",
    "disjoint-seed-packs",
    "capsule-parent",
    "evidence-output",
    "receipt-output",
  ]);
  if ((argv.length - 3) % 2 !== 0) {
    throw new Error("capsule-promotion-build options require explicit --name value pairs.");
  }
  const options = {};
  for (let index = 3; index < argv.length; index += 2) {
    const token = argv[index];
    const key = token?.replace(/^--/, "");
    const value = argv[index + 1];
    if (!/^--[a-z][a-z-]*$/.test(token ?? "") || !required.has(key)) {
      throw new Error(`Unknown capsule-promotion-build option ${token ?? "<missing>"}.`);
    }
    if (Object.hasOwn(options, key)) throw new Error(`Duplicate capsule-promotion-build option --${key}.`);
    if (typeof value !== "string" || value.length === 0 || value.startsWith("--")) {
      throw new Error(`capsule-promotion-build option --${key} requires a value.`);
    }
    options[key] = value;
  }
  if (canonical(Object.keys(options).sort()) !== canonical([...required].sort())) {
    throw new Error(`capsule-promotion-build requires exactly: ${[...required].map((key) => `--${key}`).join(", ")}`);
  }
  return options;
}

async function atomicCreateJson(filePath, document) {
  const serialized = `${JSON.stringify(document, null, 2)}\n`;
  try {
    const existing = await readFile(filePath, "utf8");
    if (canonical(JSON.parse(existing)) !== canonical(document)) {
      throw new Error(`Refusing to replace existing durable provenance: ${path.basename(filePath)}`);
    }
    return false;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  let handle;
  try {
    handle = await open(temporary, "wx", 0o600);
    await handle.writeFile(serialized);
    await handle.sync();
    await handle.close();
    handle = null;
    await link(temporary, filePath);
    return true;
  } catch (error) {
    if (error.code === "EEXIST") {
      const existing = JSON.parse(await readFile(filePath, "utf8"));
      if (canonical(existing) === canonical(document)) return false;
      throw new Error(`Concurrent durable provenance differs: ${path.basename(filePath)}`, { cause: error });
    }
    throw error;
  } finally {
    if (handle) await handle.close().catch(() => {});
    await rm(temporary, { force: true }).catch(() => {});
  }
}

function exactHashObject(value, keys, label) {
  if (
    !value
    || typeof value !== "object"
    || Array.isArray(value)
    || canonical(Object.keys(value).sort()) !== canonical([...keys].sort())
    || keys.some((key) => !/^[0-9a-f]{64}$/.test(value[key] ?? ""))
  ) throw new Error(`${label} has an invalid exact hash binding.`);
  return value;
}

async function persistConfirmationLaunchProvenance({
  outputDirectory,
  launchResult,
  executionCapsule,
  runtimeIdentity,
  setupTimings,
}) {
  const provenanceDirectory = path.join(outputDirectory, "provenance");
  const descriptor = executionCapsule.descriptor;
  const receipt = launchResult.launch_receipt;
  validateCapsuleLaunchReceipt(receipt, {
    action: "candidate-010-confirmation",
    executionDescriptorSha256: descriptor.descriptor_sha256,
    sourceInventorySha256: descriptor.source.inventory_sha256,
    dependencyInventorySha256: descriptor.dependencies.inventory.inventory_sha256,
    runtimeIdentitySha256: runtimeIdentity.identity_sha256,
  });
  if (sha256(canonical(launchResult.action_result)) !== receipt.result_sha256) {
    throw new Error("Parent launch action result differs from its verified receipt.");
  }
  const childActionElapsedMs = receipt.child_action_elapsed_ms;
  const launchSetupElapsedMs = receipt.elapsed_ms - childActionElapsedMs;
  if (
    !Number.isFinite(childActionElapsedMs)
    || childActionElapsedMs < 0
    || !Number.isFinite(launchSetupElapsedMs)
    || launchSetupElapsedMs < 0
  ) throw new Error("Launch timing cannot separate child action work from setup overhead.");
  const [operatorPrecommit, precommit, run, validation, summary, childSetup] = await Promise.all([
    loadJson(path.join(provenanceDirectory, "capsule-launch-precommit.json")),
    loadJson(path.join(provenanceDirectory, "launch-precommit.json")),
    loadJson(path.join(provenanceDirectory, "run.json")),
    loadJson(path.join(outputDirectory, "analysis", "factorial-validation.json")),
    loadJson(path.join(outputDirectory, "analysis", "factorial-summary.json")),
    loadJson(path.join(provenanceDirectory, "confirmation-child-setup.json")),
  ]);
  if (canonical(operatorPrecommit) !== canonical(launchResult.launch_precommit)) {
    throw new Error("Parent-frozen launch precommit differs from the bootstrap result.");
  }
  const precommitFields = [
    "launch_request_sha256",
    "request_nonce_sha256",
    "sanitized_environment_sha256",
    "exec_argv_sha256",
    "parent_pre_verification_sha256",
  ];
  exactHashObject(
    Object.fromEntries(precommitFields.map((key) => [key, precommit[key]])),
    precommitFields,
    "Frozen launch precommit",
  );
  for (const key of precommitFields) {
    if (precommit[key] !== receipt[key]) {
      throw new Error(`Durable launch receipt differs from frozen precommit at ${key}.`);
    }
  }
  if (
    canonical(run.run_identity.official_launch_precommit) !== canonical(precommit)
    || launchResult.action_result.run_sha256 !== sha256(canonical(run))
    || launchResult.action_result.validation_sha256 !== sha256(canonical(validation))
    || launchResult.action_result.analysis_sha256 !== sha256(canonical(summary))
  ) throw new Error("Durable launch receipt is not causally joined to the completed run artifacts.");
  if (
    childSetup?.allocation !== "run-level-unallocated"
    || childSetup.arm_level_allocation !== false
    || childSetup.calibrated_energy !== false
    || !Number.isFinite(childSetup.elapsed_ms)
    || !Number.isSafeInteger(childSetup.bytes_verified)
  ) throw new Error("Child setup accounting is invalid or allocates overhead to arms.");

  const sourceBytes = descriptor.source.inventory.total_bytes;
  const dependencyBytes = descriptor.dependencies.inventory.bytes;
  const phases = {
    runtime_identity_capture: {
      elapsed_ms: setupTimings.runtime_capture_ms,
      bytes_processed: Buffer.byteLength(canonical(runtimeIdentity)),
    },
    capsule_build: {
      elapsed_ms: setupTimings.capsule_build_ms,
      bytes_processed: sourceBytes + dependencyBytes,
    },
    capsule_parent_verification: {
      elapsed_ms: setupTimings.capsule_verify_ms,
      bytes_processed: sourceBytes + dependencyBytes,
    },
    child_spawn_and_verification_overhead: {
      elapsed_ms: launchSetupElapsedMs,
      bytes_processed: receipt.request_bytes + receipt.stdout_bytes + receipt.stderr_bytes,
    },
    capsule_source_runtime_authority_verification:
      childSetup.phases.capsule_source_runtime_authority_verification,
    release_and_source_verification: childSetup.phases.release_and_source_verification,
  };
  const normalizedPhases = Object.fromEntries(Object.entries(phases).map(([name, phase]) => {
    const { bytes_verified: bytesVerified, ...rest } = phase;
    return [name, {
      ...rest,
      bytes_processed: phase.bytes_processed ?? bytesVerified,
      modeled_energy_j: phase.modeled_energy_j ?? null,
      measured_energy_j: phase.measured_energy_j ?? null,
      calibrated: false,
    }];
  }));
  const setupAccounting = {
    schema: 1,
    artifact: "candidate-010",
    contract_version: "candidate-010.confirmation-setup-accounting.v1",
    allocation: "run-level-unallocated",
    arm_level_allocation: false,
    calibrated_energy: false,
    launch_receipt_sha256: receipt.receipt_sha256,
    launch_envelope_diagnostic: {
      additive: false,
      elapsed_ms: receipt.elapsed_ms,
      child_action_elapsed_ms: childActionElapsedMs,
      setup_overhead_elapsed_ms: launchSetupElapsedMs,
    },
    phases: normalizedPhases,
    elapsed_ms: Object.values(normalizedPhases).reduce((sum, phase) => sum + phase.elapsed_ms, 0),
    bytes_processed: Object.values(normalizedPhases).reduce((sum, phase) => sum + phase.bytes_processed, 0),
    modeled_energy_j: null,
    measured_energy_j: null,
  };
  await atomicCreateJson(path.join(provenanceDirectory, "capsule-launch-receipt.json"), receipt);
  await atomicCreateJson(path.join(provenanceDirectory, "confirmation-setup-accounting.json"), setupAccounting);
  return Object.freeze({ receipt, setup_accounting: setupAccounting });
}

export async function runCapsuleConfirmationOperator(options, dependencies = {}) {
  const {
    captureRuntime = captureRuntimeIdentity,
    buildCapsule = buildExecutionCapsule,
    verifyCapsule = verifyExecutionCapsule,
    launchCapsule = launchVerifiedCapsuleAction,
    destroyCapsule = destroyExecutionCapsule,
    persistLaunchProvenance = persistConfirmationLaunchProvenance,
  } = dependencies;
  const allowedKeys = new Set([
    "release-root", "release", "disjoint-with", "output", "resume", "capsule-parent", "stop-after-records",
  ]);
  if (!options || typeof options !== "object" || Object.keys(options).some((key) => !allowedKeys.has(key))) {
    throw new Error("capsule-confirmation received missing or extra options.");
  }
  for (const required of ["release-root", "release", "disjoint-with", "output"]) {
    if (typeof options[required] !== "string" || options[required].length === 0) {
      throw new Error(`capsule-confirmation requires --${required}.`);
    }
  }
  if (options.resume !== undefined && options.resume !== "true") {
    throw new Error("capsule-confirmation only accepts --resume true.");
  }
  const stopAfterRecords = options["stop-after-records"] === undefined
    ? null
    : Number(options["stop-after-records"]);
  if (stopAfterRecords !== null && (!Number.isSafeInteger(stopAfterRecords) || stopAfterRecords < 1)) {
    throw new Error("capsule-confirmation --stop-after-records must be a positive integer.");
  }

  const bindingRoot = await strictRoot(options["release-root"], "release-root");
  const releasePath = await containedRegularFile(bindingRoot, options.release, "release");
  const releaseDocument = await loadJson(releasePath);
  if (
    releaseDocument.contract_version !== RELEASE_CONTRACT_VERSION
    || releaseDocument.state !== "sealed-release"
    || releaseDocument.partition !== "confirmation"
    || releaseDocument.phase !== "confirmation"
  ) throw new Error("capsule-confirmation requires an exact v3 confirmation sealed release.");

  const boundJson = async (name) => {
    const binding = releaseDocument.bindings?.[name];
    if (!binding || typeof binding.path !== "string") {
      throw new Error(`Release is missing its ${name} binding.`);
    }
    return loadJson(await containedRegularFile(bindingRoot, binding.path, `bound ${name}`));
  };
  const [expectedSourceBundle, config, design] = await Promise.all([
    boundJson("source_bundle"),
    boundJson("config"),
    boundJson("design"),
  ]);
  if (!Array.isArray(design.scenarios) || design.scenarios.length === 0) {
    throw new Error("Bound design must contain a non-empty scenarios array.");
  }
  const disjointPaths = options["disjoint-with"].split(",").map((value) => value.trim());
  if (disjointPaths.length === 0 || disjointPaths.some((value) => value.length === 0)) {
    throw new Error("--disjoint-with requires comma-separated artifact paths.");
  }
  const disjointWith = await Promise.all(disjointPaths.map(async (file, index) => (
    loadJson(await containedRegularFile(bindingRoot, file, `disjoint pack ${index + 1}`))
  )));
  const outputDirectory = path.resolve(options.output);
  const operatorPrecommitPath = path.join(
    outputDirectory,
    "provenance",
    "capsule-launch-precommit.json",
  );
  const existingLaunchPrecommit = options.resume === "true"
    ? await loadJson(operatorPrecommitPath)
    : null;
  const capsuleParent = options["capsule-parent"]
    ? path.resolve(options["capsule-parent"])
    : os.tmpdir();
  await strictRoot(capsuleParent, "capsule-parent");

  const runtimeCaptureStarted = performance.now();
  const runtimeIdentity = await captureRuntime({
    repositoryRoot: root,
    candidateRoot: benchmarkRoot,
  });
  const runtimeCaptureMs = performance.now() - runtimeCaptureStarted;
  let executionCapsule;
  let launchResult;
  let capsuleDestroyed = false;
  try {
    const capsuleBuildStarted = performance.now();
    executionCapsule = await buildCapsule({
      repositoryRoot: root,
      executionParent: capsuleParent,
      runtimeIdentity,
      candidateDirectory: "experiments/workstation/candidate-010",
    });
    const capsuleBuildMs = performance.now() - capsuleBuildStarted;
    const capsuleVerifyStarted = performance.now();
    await verifyCapsule(executionCapsule);
    const capsuleVerifyMs = performance.now() - capsuleVerifyStarted;
    launchResult = await launchCapsule({
      executionCapsule,
      action: "candidate-010-confirmation",
      launchPrecommit: existingLaunchPrecommit,
      onLaunchPrecommit: async (precommit) => {
        await atomicCreateJson(operatorPrecommitPath, precommit);
      },
      confirmationRequest: {
        config,
        scenarios: design.scenarios,
        outputDirectory,
        release: {
          bindingRoot,
          releasePath,
          disjointWith,
        },
        resume: options.resume === "true",
        ...(stopAfterRecords === null ? {} : { stopAfterRecords }),
      },
      expectedSourceBundle,
    });
    await persistLaunchProvenance({
      outputDirectory,
      launchResult,
      executionCapsule,
      runtimeIdentity,
      setupTimings: {
        runtime_capture_ms: runtimeCaptureMs,
        capsule_build_ms: capsuleBuildMs,
        capsule_verify_ms: capsuleVerifyMs,
      },
    });
  } finally {
    if (executionCapsule) capsuleDestroyed = await destroyCapsule(executionCapsule);
  }
  return Object.freeze({
    ...launchResult,
    cleanup_owner: "operator",
    capsule_destroyed: capsuleDestroyed,
  });
}

async function loadPromotionCapsuleBindings(paths) {
  const expectedKeys = [
    "disjointSeedPackPaths",
    "energyAssignmentsPath",
    "releaseBindingRoot",
    "releasePath",
    "runDirectory",
  ];
  if (
    !paths
    || typeof paths !== "object"
    || Array.isArray(paths)
    || canonical(Object.keys(paths).sort()) !== canonical(expectedKeys.sort())
    || !Array.isArray(paths.disjointSeedPackPaths)
    || paths.disjointSeedPackPaths.length === 0
  ) throw new Error("Promotion paths have an invalid exact durable-input shape.");
  const runDirectory = await strictRoot(paths.runDirectory, "promotion runDirectory");
  const releaseBindingRoot = await strictRoot(paths.releaseBindingRoot, "promotion releaseBindingRoot");
  const releasePath = await containedRegularFile(
    releaseBindingRoot,
    paths.releasePath,
    "promotion release",
  );
  const release = await loadJson(releasePath);
  const binding = async (name) => {
    const relative = release.bindings?.[name]?.path;
    if (typeof relative !== "string") throw new Error(`Promotion release lacks ${name} binding.`);
    return loadJson(await containedRegularFile(releaseBindingRoot, relative, `promotion ${name}`));
  };
  const [runSourceBundle, expectedSourceBundle, executionDescriptor, runtimeIdentity] = await Promise.all([
    loadJson(await containedRegularFile(
      runDirectory,
      path.join(runDirectory, "provenance", "source-bundle.json"),
      "promotion run source bundle",
    )),
    binding("source_bundle"),
    binding("execution_descriptor"),
    binding("runtime_identity"),
  ]);
  const currentSourceBundle = await captureCandidate010SourceBundle(root);
  if (
    canonical(runSourceBundle) !== canonical(expectedSourceBundle)
    || currentSourceBundle.source_sha256 !== expectedSourceBundle.source_sha256
    || canonical(currentSourceBundle.files) !== canonical(expectedSourceBundle.files)
    || canonical(currentSourceBundle.execution_manifest_projection)
      !== canonical(expectedSourceBundle.execution_manifest_projection)
    || expectedSourceBundle.vcs?.source_commit !== executionDescriptor.source?.head_commit
    || canonical(executionDescriptor.runtime_identity) !== canonical(runtimeIdentity)
    || !/^[0-9a-f]{40,64}$/.test(expectedSourceBundle.vcs?.source_commit ?? "")
    || !/^[0-9a-f]{64}$/.test(executionDescriptor.descriptor_sha256 ?? "")
    || !/^[0-9a-f]{64}$/.test(runtimeIdentity.identity_sha256 ?? "")
  ) throw new Error("Promotion run/release source, execution, and runtime bindings disagree.");
  return { expectedSourceBundle, executionDescriptor, runtimeIdentity };
}

async function atomicCreatePromotionPair({ evidenceOutput, receiptOutput, evidence, receipt }) {
  const evidencePath = path.resolve(evidenceOutput);
  const receiptPath = path.resolve(receiptOutput);
  const targetDirectory = path.dirname(evidencePath);
  if (
    targetDirectory !== path.dirname(receiptPath)
    || evidencePath === receiptPath
    || path.basename(evidencePath) !== path.relative(targetDirectory, evidencePath)
    || path.basename(receiptPath) !== path.relative(targetDirectory, receiptPath)
  ) throw new Error("Promotion evidence and receipt outputs must be distinct direct files in one new directory.");
  await mkdir(path.dirname(targetDirectory), { recursive: true });
  const parent = await strictRoot(path.dirname(targetDirectory), "promotion output parent");
  try {
    await access(targetDirectory);
    throw new Error("Promotion output directory already exists; evidence is never overwritten.");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const staging = path.join(parent, `.candidate-010-promotion-${randomUUID()}.tmp`);
  await mkdir(staging);
  try {
    for (const [name, document] of [
      [path.basename(evidencePath), evidence],
      [path.basename(receiptPath), receipt],
    ]) {
      const handle = await open(path.join(staging, name), "wx", 0o600);
      try {
        await handle.writeFile(`${JSON.stringify(document, null, 2)}\n`);
        await handle.sync();
      } finally {
        await handle.close();
      }
    }
    await rename(staging, targetDirectory);
  } catch (error) {
    await rm(staging, { recursive: true, force: true }).catch(() => {});
    throw error;
  }
  return Object.freeze({ evidence_path: evidencePath, receipt_path: receiptPath });
}

async function runCapsulePromotionAction(options, operation, dependencies = {}) {
  const {
    loadBindings = loadPromotionCapsuleBindings,
    buildCapsule = buildExecutionCapsule,
    verifyCapsule = verifyExecutionCapsule,
    launchCapsule = launchVerifiedCapsuleAction,
    destroyCapsule = destroyExecutionCapsule,
    validateLaunchReceipt = validateCapsuleLaunchReceipt,
  } = dependencies;
  const capsuleParent = await strictRoot(options.capsuleParent, "capsuleParent");
  const { runtimeIdentity, expectedSourceBundle, executionDescriptor } = await loadBindings(options.paths);
  let executionCapsule;
  let launchResult;
  let capsuleDestroyed = false;
  try {
    executionCapsule = await buildCapsule({
      repositoryRoot: root,
      executionParent: capsuleParent,
      runtimeIdentity,
      candidateDirectory: "experiments/workstation/candidate-010",
      sourceCommit: expectedSourceBundle.vcs.source_commit,
    });
    await verifyCapsule(executionCapsule);
    if (executionCapsule.descriptor.descriptor_sha256 !== executionDescriptor.descriptor_sha256) {
      throw new Error("Fresh promotion capsule differs from the release-bound execution descriptor.");
    }
    launchResult = await launchCapsule({
      executionCapsule,
      action: "candidate-010-promotion-evidence",
      maxOutputBytes: PROMOTION_CHILD_OUTPUT_LIMIT_BYTES,
      promotionRequest: {
        operation,
        ...(operation === "validate" ? { evidence: options.evidence } : {}),
        paths: options.paths,
      },
      expectedSourceBundle,
    });
    validateLaunchReceipt(launchResult.launch_receipt, {
      action: "candidate-010-promotion-evidence",
      executionDescriptorSha256: executionCapsule.descriptor.descriptor_sha256,
      sourceInventorySha256: executionCapsule.descriptor.source.inventory_sha256,
      dependencyInventorySha256: executionCapsule.descriptor.dependencies.inventory.inventory_sha256,
      runtimeIdentitySha256: runtimeIdentity.identity_sha256,
    });
    if (operation === "validate" && canonical(launchResult.action_result) !== canonical(options.evidence)) {
      throw new Error("Fresh-child promotion validation returned substituted evidence.");
    }
  } finally {
    if (executionCapsule) capsuleDestroyed = await destroyCapsule(executionCapsule);
  }
  return Object.freeze({
    ...launchResult,
    cleanup_owner: "operator",
    capsule_destroyed: capsuleDestroyed,
  });
}

export async function runCapsulePromotionValidationOperator(options, dependencies = {}) {
  if (
    !options
    || typeof options !== "object"
    || Array.isArray(options)
    || canonical(Object.keys(options).sort()) !== canonical(["capsuleParent", "evidence", "paths"].sort())
    || !options.evidence
    || !options.paths
    || typeof options.capsuleParent !== "string"
  ) throw new Error("Promotion validation requires exactly evidence, paths, and capsuleParent.");
  return runCapsulePromotionAction(options, "validate", dependencies);
}

export async function runCapsulePromotionBuildOperator(options, dependencies = {}) {
  if (
    !options
    || typeof options !== "object"
    || Array.isArray(options)
    || canonical(Object.keys(options).sort())
      !== canonical(["capsuleParent", "evidenceOutput", "paths", "receiptOutput"].sort())
    || !options.paths
    || ![options.capsuleParent, options.evidenceOutput, options.receiptOutput]
      .every((value) => typeof value === "string" && value.length > 0)
  ) throw new Error("Promotion build requires exactly paths, capsuleParent, evidenceOutput, and receiptOutput.");
  const result = await runCapsulePromotionAction(options, "build", dependencies);
  const persisted = await atomicCreatePromotionPair({
    evidenceOutput: options.evidenceOutput,
    receiptOutput: options.receiptOutput,
    evidence: result.action_result,
    receipt: result.launch_receipt,
  });
  return Object.freeze({ ...result, persisted });
}

async function assertNewDirectory(directory) {
  try {
    await access(directory);
    throw new Error(`Output directory already exists; append-only runs cannot overwrite it: ${directory}`);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  await mkdir(directory, { recursive: true });
}

export function scientificPayload(event) {
  return {
    opportunity_id: event.opportunity_id,
    seed: event.seed,
    arm: event.arm,
    truth_unsafe: event.truth_unsafe,
    evidence: event.evidence,
    trace: event.trace,
    decision: event.decision,
    outcome: event.outcome,
    resources: {
      observations: event.resources.observations,
      verifier_calls: event.resources.verifier_calls,
      modeled_energy_j: event.resources.modeled_energy_j,
      durable_bytes_written: event.resources.durable_bytes_written,
      staged_bytes_written: event.resources.staged_bytes_written,
    },
    filesystem: {
      boundary: event.filesystem.boundary,
      trace_revealed: event.filesystem.trace_revealed,
      trace_output_sha256: event.filesystem.trace_output_sha256,
      staged_bytes_written: event.filesystem.staged_bytes_written,
      durable_bytes_written: event.filesystem.durable_bytes_written,
      stageExists: event.filesystem.stageExists,
      durableExists: event.filesystem.durableExists,
      rollbackComplete: event.filesystem.rollbackComplete,
      commitComplete: event.filesystem.commitComplete,
    },
  };
}

function workKey(event) {
  return `${event.opportunity_id}\u0000${event.arm}`;
}

async function loadOptionalJson(file) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

export async function runExperiment({
  config,
  seeds,
  outputDirectory,
  resume = false,
  stopAfterRecords = null,
}) {
  if (stopAfterRecords !== null && (!Number.isInteger(stopAfterRecords) || stopAfterRecords < 1)) {
    throw new Error("stopAfterRecords must be a positive integer when supplied.");
  }
  if (resume) await access(outputDirectory);
  else await assertNewDirectory(outputDirectory);
  const rawDirectory = path.join(outputDirectory, "raw");
  const provenanceDirectory = path.join(outputDirectory, "provenance");
  const filesystemDirectory = path.join(outputDirectory, "filesystem");
  await mkdir(rawDirectory, { recursive: true });
  await mkdir(provenanceDirectory, { recursive: true });
  const rawPath = path.join(rawDirectory, "events.ndjson");
  const checkpointPath = path.join(provenanceDirectory, "checkpoint.json");
  const runPath = path.join(provenanceDirectory, "run.json");
  const configPath = path.join(provenanceDirectory, "config.json");
  const seedsPath = path.join(provenanceDirectory, "seeds.json");
  const environmentPath = path.join(provenanceDirectory, "environment.json");
  const requestedIdentity = {
    profile: config.profile,
    config_sha256: sha256(canonical(config)),
    ordered_seed_pack_sha256: sha256(canonical(seeds)),
    schedule: "seed-opportunity-arm-v1",
  };
  let environment;

  if (resume) {
    const existingConfig = await loadJson(configPath);
    const existingSeeds = await loadJson(seedsPath);
    environment = await loadJson(environmentPath);
    if (canonical(existingConfig) !== canonical(config)) {
      throw new Error("Resume config differs from the frozen run config.");
    }
    if (canonical(existingSeeds) !== canonical({ seeds })) {
      throw new Error("Resume seed order differs from the frozen run seed pack.");
    }
  } else {
    environment = {
      node: process.version,
      versions: process.versions,
      platform: process.platform,
      arch: process.arch,
      os_release: os.release(),
      cpus: os.cpus().length,
      run_started_utc: new Date().toISOString(),
      energy_measurement: null,
      energy_unavailable_reason: "Smoke/development runner has no calibrated joule meter; modeled and measured energy remain separate.",
    };
    await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, { flag: "wx" });
    await writeFile(seedsPath, `${JSON.stringify({ seeds }, null, 2)}\n`, { flag: "wx" });
    await writeFile(environmentPath, `${JSON.stringify(environment, null, 2)}\n`, { flag: "wx" });
  }

  const ledger = await openCheckpointLedger({
    rawPath,
    checkpointPath,
    scientificPayload,
    workKey,
    runIdentity: requestedIdentity,
  });
  const completedRun = await loadOptionalJson(runPath);
  if (completedRun) {
    if (!resume) throw new Error("Completed run provenance already exists.");
    const state = ledger.summary();
    if (
      completedRun.records !== state.records
      || completedRun.scientific_payload_sha256 !== state.scientific_payload_sha256
      || completedRun.hash_chain_sha256 !== state.hash_chain_sha256
    ) {
      throw new Error("Completed run provenance disagrees with the append-only ledger.");
    }
    return { run: completedRun, rawPath, complete: true, resumed: true };
  }

  const schedule = deterministicWorkUnits({ seeds, config, arms: armNames, generateOpportunities });
  const remaining = remainingWorkUnits(schedule, ledger.completedWorkKeys());
  const checkpointInterval = config.checkpoint_interval_records ?? 64;
  let processedThisInvocation = 0;

  for (const { seed, opportunity, arm, key } of remaining) {
        const start = performance.now();
        const policyOpportunity = {
          id: opportunity.id,
          evidence: opportunity.evidence,
          ...(arm === "oracle-ceiling" ? { unsafe: opportunity.unsafe } : {}),
        };
        const revealTrace = shouldRevealTrace(arm, policyOpportunity, config);
        const trial = await executeFilesystemTrial({
          root: filesystemDirectory,
          opportunity,
          arm,
          config,
          revealTrace,
          decideWithTrace: (revealedVerifier) => decide(arm, policyOpportunity, config, revealedVerifier),
        });
        const { decision, filesystem, revealedVerifier } = trial;
        const scored = scoreDecision(opportunity, decision, config);
        const event = {
          schema: 1,
          artifact: "candidate-010",
          profile: config.profile,
          opportunity_id: opportunity.id,
          seed,
          arm,
          truth_unsafe: opportunity.unsafe,
          evidence: opportunity.evidence,
          trace: {
            revealed: revealTrace,
            verifier: revealedVerifier,
            output_sha256: filesystem.trace_output_sha256,
          },
          decision: {
            commit: decision.commit,
            abstain: decision.abstain,
            stage: decision.stage,
            reset: decision.reset,
            reason: decision.reason,
            score: decision.score,
          },
          outcome: {
            false_commit: scored.falseCommit,
            false_reject: scored.falseReject,
            consequence_weighted_loss: scored.loss,
            rollback_violation: decision.reset && !filesystem.rollbackComplete,
          },
          resources: {
            observations: decision.observations,
            verifier_calls: decision.verifier_calls,
            modeled_energy_j: scored.modeledEnergy,
            measured_energy_j: null,
            cpu_elapsed_ms: performance.now() - start,
            durable_bytes_written: filesystem.durable_bytes_written,
            staged_bytes_written: filesystem.staged_bytes_written,
            filesystem_stage_ms: filesystem.stage_elapsed_ms,
            temporary_execution_ms: filesystem.temporary_execution_elapsed_ms,
            filesystem_finalize_ms: filesystem.finalize_elapsed_ms,
            filesystem_boundary_ms: filesystem.boundary_elapsed_ms,
          },
          filesystem,
        };
        assertCandidate010RawEvent(event, { expectedKind: "smoke", requireIntegrity: false });
        await ledger.append(event);
        processedThisInvocation += 1;
        const state = ledger.summary();
        if (state.records % checkpointInterval === 0) {
          await ledger.saveCheckpoint({ last_completed_work_key: key, complete: false });
        }
        if (stopAfterRecords !== null && state.records >= stopAfterRecords) {
          await ledger.saveCheckpoint({ last_completed_work_key: key, complete: false });
          return {
            run: {
              schema: 1,
              artifact: "candidate-010",
              profile: config.profile,
              status: "interrupted-at-declared-test-boundary",
              records: state.records,
              expected_records: seeds.length * config.opportunities_per_seed * armNames.length,
              scientific_payload_sha256: state.scientific_payload_sha256,
              hash_chain_sha256: state.hash_chain_sha256,
            },
            rawPath,
            complete: false,
            resumed: resume,
            processed_this_invocation: processedThisInvocation,
          };
        }
  }

  const ledgerState = ledger.summary();
  const expectedRecords = seeds.length * config.opportunities_per_seed * armNames.length;
  if (ledgerState.records !== expectedRecords) {
    throw new Error(`Completed schedule produced ${ledgerState.records} records; expected ${expectedRecords}.`);
  }
  await ledger.saveCheckpoint({ complete: true });
  const run = {
    schema: 1,
    artifact: "candidate-010",
    readiness: "smoke-ready",
    profile: config.profile,
    started_utc: environment.run_started_utc,
    completed_utc: new Date().toISOString(),
    seed_count: seeds.length,
    opportunities: seeds.length * config.opportunities_per_seed,
    arms: armNames.length,
    records: ledgerState.records,
    config_sha256: sha256(canonical(config)),
    ordered_seed_pack_sha256: requestedIdentity.ordered_seed_pack_sha256,
    scientific_payload_sha256: ledgerState.scientific_payload_sha256,
    hash_chain_sha256: ledgerState.hash_chain_sha256,
    measured_energy_j: null,
    resume_supported: true,
  };
  await writeFile(runPath, `${JSON.stringify(run, null, 2)}\n`, { flag: "wx" });
  return { run, rawPath, complete: true, resumed: resume, processed_this_invocation: processedThisInvocation };
}

function evaluateEnergyForRun(reading, run) {
  const energy = evaluateExternalEnergyReading(reading);
  const measurementStart = Date.parse(energy.measured.interval_started_at);
  const measurementEnd = Date.parse(energy.measured.interval_ended_at);
  const runStart = Date.parse(run.started_utc);
  const runEnd = Date.parse(run.completed_utc);
  if (![measurementStart, measurementEnd, runStart, runEnd].every(Number.isFinite)) {
    throw new Error("Run and energy intervals must have valid explicit timestamps.");
  }
  if (measurementStart > runStart || measurementEnd < runEnd) {
    throw new Error("External energy interval does not contain the complete run interval.");
  }
  return {
    ...energy,
    raw_reading_sha256: sha256(canonical(reading)),
    run_interval_contained: true,
    allocation: "whole-run-only",
    arm_level_energy_claim_eligible: false,
  };
}

export async function attachEnergyReading(outputDirectory, readingPath) {
  const provenanceDirectory = path.join(outputDirectory, "provenance");
  const run = await loadJson(path.join(provenanceDirectory, "run.json"));
  const reading = await loadJson(readingPath);
  const normalized = evaluateEnergyForRun(reading, run);
  const rawDestination = path.join(provenanceDirectory, "external-energy-reading.json");
  const normalizedDestination = path.join(provenanceDirectory, "energy.json");
  const existingRaw = await loadOptionalJson(rawDestination);
  const existingNormalized = await loadOptionalJson(normalizedDestination);
  if (existingRaw || existingNormalized) {
    if (canonical(existingRaw) !== canonical(reading) || canonical(existingNormalized) !== canonical(normalized)) {
      throw new Error("A different external energy reading is already bound to this run.");
    }
    return normalized;
  }
  await writeFile(rawDestination, `${JSON.stringify(reading, null, 2)}\n`, { flag: "wx" });
  await writeFile(normalizedDestination, `${JSON.stringify(normalized, null, 2)}\n`, { flag: "wx" });
  return normalized;
}

export async function analyzeRun(outputDirectory) {
  await validateRun(outputDirectory, { writeArtifact: false });
  const rawPath = path.join(outputDirectory, "raw", "events.ndjson");
  const lines = (await readFile(rawPath, "utf8")).trim().split(/\r?\n/).filter(Boolean);
  const byArm = new Map();
  for (const line of lines) {
    const event = JSON.parse(line);
    assertCandidate010RawEvent(event, { expectedKind: "smoke" });
    const row = byArm.get(event.arm) ?? { opportunities: 0, false_commits: 0, false_rejects: 0, abstentions: 0, rollback_violations: 0, loss: 0, verifier_calls: 0, modeled_energy_j: 0, staged_bytes_written: 0, durable_bytes_written: 0, filesystem_boundary_ms: 0 };
    row.opportunities += 1;
    row.false_commits += Number(event.outcome.false_commit);
    row.false_rejects += Number(event.outcome.false_reject);
    row.abstentions += Number(event.decision.abstain);
    row.rollback_violations += Number(event.outcome.rollback_violation);
    row.loss += event.outcome.consequence_weighted_loss;
    row.verifier_calls += event.resources.verifier_calls;
    row.modeled_energy_j += event.resources.modeled_energy_j;
    row.staged_bytes_written += event.resources.staged_bytes_written;
    row.durable_bytes_written += event.resources.durable_bytes_written;
    row.filesystem_boundary_ms += event.resources.filesystem_boundary_ms;
    byArm.set(event.arm, row);
  }
  const energy = await loadOptionalJson(path.join(outputDirectory, "provenance", "energy.json"));
  const summary = {
    schema: 1,
    artifact: "candidate-010",
    interpretation: energy
      ? "Smoke/development diagnostic only; the external reading covers the whole run and cannot support arm-level superiority or energy claims."
      : "Smoke/development diagnostic only; no superiority or energy claim.",
    measured_energy_j: energy?.measured?.value_j ?? null,
    external_energy: energy,
    arms: Object.fromEntries([...byArm.entries()].map(([arm, row]) => [arm, {
      ...row,
      mean_loss: row.loss / row.opportunities,
      mean_staged_bytes_written: row.staged_bytes_written / row.opportunities,
      mean_filesystem_boundary_ms: row.filesystem_boundary_ms / row.opportunities,
      false_commit_rate: row.false_commits / row.opportunities,
      false_reject_rate: row.false_rejects / row.opportunities,
    }])),
  };
  const analysisDirectory = path.join(outputDirectory, "analysis");
  await mkdir(analysisDirectory, { recursive: true });
  await writeFile(path.join(analysisDirectory, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
  return summary;
}

export async function validateRun(outputDirectory, { writeArtifact = true } = {}) {
  const rawPath = path.join(outputDirectory, "raw", "events.ndjson");
  const provenanceDirectory = path.join(outputDirectory, "provenance");
  const runPath = path.join(provenanceDirectory, "run.json");
  const lines = (await readFile(rawPath, "utf8")).trim().split(/\r?\n/).filter(Boolean);
  const [run, config, seedDocument] = await Promise.all([
    loadJson(runPath),
    loadJson(path.join(provenanceDirectory, "config.json")),
    loadJson(path.join(provenanceDirectory, "seeds.json")),
  ]);
  const seeds = seedDocument.seeds;
  const runIdentity = {
    profile: config.profile,
    config_sha256: sha256(canonical(config)),
    ordered_seed_pack_sha256: sha256(canonical(seeds)),
    schedule: "seed-opportunity-arm-v1",
  };
  const expectedSchedule = new Map();
  for (const unit of deterministicWorkUnits({ seeds, config, arms: armNames, generateOpportunities })) {
    expectedSchedule.set(unit.key, unit);
  }
  const digest = createHash("sha256");
  const keys = new Set();
  const errors = [];
  const stagedBytesByOpportunity = new Map();
  const traceHashesByOpportunity = new Map();
  let previousRecordHash = "0".repeat(64);
  const externalEnergyReading = await loadOptionalJson(path.join(outputDirectory, "provenance", "external-energy-reading.json"));
  const normalizedEnergy = await loadOptionalJson(path.join(outputDirectory, "provenance", "energy.json"));

  if (Boolean(externalEnergyReading) !== Boolean(normalizedEnergy)) {
    errors.push("external energy provenance is incomplete");
  } else if (externalEnergyReading && normalizedEnergy) {
    try {
      const expectedEnergy = evaluateEnergyForRun(externalEnergyReading, run);
      if (canonical(expectedEnergy) !== canonical(normalizedEnergy)) {
        errors.push("normalized external energy provenance does not match its raw reading");
      }
    } catch (error) {
      errors.push(`external energy provenance is invalid: ${error.message}`);
    }
  }

  for (const [index, line] of lines.entries()) {
    let event;
    try {
      event = JSON.parse(line);
    } catch (error) {
      errors.push(`raw line ${index + 1} is invalid JSON: ${error.message}`);
      continue;
    }
    try {
      assertCandidate010RawEvent(event, { expectedKind: "smoke" });
    } catch (error) {
      errors.push(`raw line ${index + 1} violates the runtime output contract: ${error.message}`);
      continue;
    }
    const key = `${event.opportunity_id}\u0000${event.arm}`;
    if (keys.has(key)) errors.push(`duplicate work unit: ${event.opportunity_id}/${event.arm}`);
    keys.add(key);
    const expectedUnit = expectedSchedule.get(key);
    if (!expectedUnit) {
      errors.push(`work unit is not in the frozen schedule: ${event.opportunity_id}/${event.arm}`);
    } else {
      const expectedProjection = {
        opportunity_id: expectedUnit.opportunity.id,
        seed: expectedUnit.seed,
        truth_unsafe: expectedUnit.opportunity.unsafe,
        evidence: expectedUnit.opportunity.evidence,
      };
      const observedProjection = Object.fromEntries(
        Object.keys(expectedProjection).map((field) => [field, event[field]]),
      );
      if (canonical(expectedProjection) !== canonical(observedProjection)) {
        errors.push(`work unit input differs from the frozen schedule: ${event.opportunity_id}/${event.arm}`);
      }
      const policyOpportunity = {
        id: expectedUnit.opportunity.id,
        evidence: expectedUnit.opportunity.evidence,
        ...(event.arm === "oracle-ceiling" ? { unsafe: expectedUnit.opportunity.unsafe } : {}),
      };
      const expectedTrace = traceBodyForJob(expectedUnit.opportunity, config);
      const expectedReveal = shouldRevealTrace(event.arm, policyOpportunity, config);
      const expectedDecision = decide(
        event.arm,
        policyOpportunity,
        config,
        expectedReveal ? expectedTrace.verifier : null,
      );
      const observedDecision = {
        commit: event.decision?.commit,
        abstain: event.decision?.abstain,
        stage: event.decision?.stage,
        reset: event.decision?.reset,
        reason: event.decision?.reason,
        score: event.decision?.score,
      };
      const expectedDecisionProjection = {
        commit: expectedDecision.commit,
        abstain: expectedDecision.abstain,
        stage: expectedDecision.stage,
        reset: expectedDecision.reset,
        reason: expectedDecision.reason,
        score: expectedDecision.score,
      };
      if (
        canonical(observedDecision) !== canonical(expectedDecisionProjection)
        || event.resources?.observations !== expectedDecision.observations
        || event.resources?.verifier_calls !== expectedDecision.verifier_calls
      ) errors.push(`decision differs from the frozen policy: ${event.opportunity_id}/${event.arm}`);
      const expectedTraceSha256 = sha256(expectedTrace.body);
      if (
        event.trace?.revealed !== expectedReveal
        || event.trace?.verifier !== (expectedReveal ? expectedTrace.verifier : null)
        || event.trace?.output_sha256 !== expectedTraceSha256
      ) errors.push(`temporary execution differs from the frozen trace job: ${event.opportunity_id}/${event.arm}`);
      const scored = scoreDecision(expectedUnit.opportunity, expectedDecision, config);
      if (
        event.outcome?.false_commit !== scored.falseCommit
        || event.outcome?.false_reject !== scored.falseReject
        || event.outcome?.consequence_weighted_loss !== scored.loss
        || event.outcome?.rollback_violation !== Boolean(expectedDecision.reset && !event.filesystem?.rollbackComplete)
        || event.resources?.modeled_energy_j !== scored.modeledEnergy
      ) errors.push(`scientific result differs from independent recomputation: ${event.opportunity_id}/${event.arm}`);
    }
    if (event.schema !== 1 || event.artifact !== "candidate-010") {
      errors.push(`raw line ${index + 1} has the wrong schema or artifact`);
    }
    if (!armNames.includes(event.arm)) errors.push(`raw line ${index + 1} has unknown arm ${event.arm}`);
    if (!event.filesystem || event.filesystem.boundary !== "filesystem-stage-execute-finalize-v1") {
      errors.push(`work unit did not cross the declared filesystem boundary: ${event.opportunity_id}/${event.arm}`);
    }
    if (event.decision?.stage !== true || event.decision?.reset === event.decision?.commit) {
      errors.push(`work unit did not stage then choose exactly one finalization: ${event.opportunity_id}/${event.arm}`);
    }
    if (event.decision?.reset && event.filesystem?.rollbackComplete !== true) {
      errors.push(`reset did not restore pre-state: ${event.opportunity_id}/${event.arm}`);
    }
    if (event.decision?.commit && event.filesystem?.commitComplete !== true) {
      errors.push(`commit did not cross the filesystem boundary: ${event.opportunity_id}/${event.arm}`);
    }
    if (event.trace?.revealed !== event.filesystem?.trace_revealed) {
      errors.push(`trace revelation record disagrees with filesystem record: ${event.opportunity_id}/${event.arm}`);
    }
    if (event.trace?.output_sha256 !== event.filesystem?.trace_output_sha256) {
      errors.push(`trace digest disagrees with filesystem record: ${event.opportunity_id}/${event.arm}`);
    }
    if (
      !Number.isFinite(event.resources?.filesystem_boundary_ms)
      || event.resources.filesystem_boundary_ms < 0
      || event.resources?.staged_bytes_written !== event.filesystem?.staged_bytes_written
      || event.resources?.durable_bytes_written !== event.filesystem?.durable_bytes_written
    ) {
      errors.push(`filesystem cost report is invalid: ${event.opportunity_id}/${event.arm}`);
    }
    if (event.trace?.revealed ? !Number.isFinite(event.trace.verifier) : event.trace?.verifier !== null) {
      errors.push(`trace verifier visibility is invalid: ${event.opportunity_id}/${event.arm}`);
    }
    const byteSet = stagedBytesByOpportunity.get(event.opportunity_id) ?? new Set();
    byteSet.add(event.resources?.staged_bytes_written);
    stagedBytesByOpportunity.set(event.opportunity_id, byteSet);
    const traceHashes = traceHashesByOpportunity.get(event.opportunity_id) ?? new Set();
    traceHashes.add(event.filesystem?.trace_output_sha256);
    traceHashesByOpportunity.set(event.opportunity_id, traceHashes);
    let payload;
    try {
      payload = canonical(scientificPayload(event));
    } catch (error) {
      errors.push(`raw line ${index + 1} is structurally incomplete: ${error.message}`);
      continue;
    }
    const expectedRecordHash = sha256(`${previousRecordHash}\n${payload}`);
    if (
      event.integrity?.sequence !== index
      || event.integrity?.previous_sha256 !== previousRecordHash
      || event.integrity?.record_sha256 !== expectedRecordHash
    ) {
      errors.push(`hash-chain mismatch at raw line ${index + 1}`);
    }
    previousRecordHash = expectedRecordHash;
    digest.update(payload);
  }

  for (const [opportunityId, byteSet] of stagedBytesByOpportunity) {
    if (byteSet.size !== 1) errors.push(`filesystem staging cost is not byte-comparable across arms: ${opportunityId}`);
  }
  for (const [opportunityId, traceHashes] of traceHashesByOpportunity) {
    if (traceHashes.size !== 1) errors.push(`temporary execution differs across arms: ${opportunityId}`);
  }

  const expectedRecords = run.opportunities * run.arms;
  if (lines.length !== run.records || lines.length !== expectedRecords) {
    errors.push(`record count ${lines.length} does not match provenance ${run.records} and matrix ${expectedRecords}`);
  }
  const scientificDigest = digest.digest("hex");
  if (scientificDigest !== run.scientific_payload_sha256) {
    errors.push("scientific payload digest does not match provenance");
  }
  if (previousRecordHash !== run.hash_chain_sha256) {
    errors.push("final hash-chain digest does not match provenance");
  }
  if (
    run.profile !== config.profile
    || run.config_sha256 !== runIdentity.config_sha256
    || run.ordered_seed_pack_sha256 !== runIdentity.ordered_seed_pack_sha256
    || run.seed_count !== seeds.length
    || expectedSchedule.size !== expectedRecords
  ) errors.push("run provenance differs from the frozen config, seed pack, or schedule");
  let checkpointState;
  try {
    const ledger = await openCheckpointLedger({
      rawPath,
      checkpointPath: path.join(provenanceDirectory, "checkpoint.json"),
      scientificPayload,
      workKey,
      runIdentity,
    });
    checkpointState = ledger.summary();
    const checkpoint = await loadJson(path.join(provenanceDirectory, "checkpoint.json"));
    if (
      checkpointState.checkpoint_status !== "current"
      || checkpoint.complete !== true
      || checkpoint.records !== lines.length
      || checkpoint.scientific_payload_sha256 !== scientificDigest
      || checkpoint.hash_chain_sha256 !== previousRecordHash
    ) errors.push("completed run lacks a current complete checkpoint authority");
  } catch (error) {
    errors.push(`completed run checkpoint authority is invalid: ${error.message}`);
  }

  const validation = {
    schema: 1,
    artifact: "candidate-010",
    valid: errors.length === 0,
    errors,
    records: lines.length,
    unique_work_units: keys.size,
    scientific_payload_sha256: scientificDigest,
    hash_chain_sha256: previousRecordHash,
    external_energy_bound: Boolean(externalEnergyReading && normalizedEnergy),
    arm_level_energy_claim_eligible: false,
  };
  if (errors.length) throw new Error(`Run validation failed:\n- ${errors.join("\n- ")}`);
  if (writeArtifact) {
    const analysisDirectory = path.join(outputDirectory, "analysis");
    await mkdir(analysisDirectory, { recursive: true });
    await writeFile(path.join(analysisDirectory, "validation.json"), `${JSON.stringify(validation, null, 2)}\n`);
  }
  return validation;
}

async function prepare(profile) {
  const major = Number(process.versions.node.split(".")[0]);
  if (major < 22) throw new Error(`Node >=22 is required; found ${process.version}`);
  const disk = await statfs(root);
  const freeBytes = Number(disk.bavail) * Number(disk.bsize);
  if (freeBytes < 100 * 1024 * 1024) throw new Error("At least 100 MiB free disk is required for the smoke profile.");
  const config = await loadJson(path.join(benchmarkRoot, "configs", `${profile}.json`));
  if (config.artifact !== "candidate-010" || config.profile !== profile) throw new Error("Config identity mismatch.");
  return { node: process.version, free_bytes: freeBytes, profile, energy_measurement: "unavailable" };
}

async function main() {
  const { action, options } = parseArgs(process.argv);
  if (action === "capsule-confirmation") {
    const capsuleOptions = parseCapsuleConfirmationOptions(process.argv);
    const result = await runCapsuleConfirmationOperator(capsuleOptions);
    console.log(canonical(result));
    return;
  }
  if (action === "capsule-promotion-build") {
    const promotionOptions = parseCapsulePromotionBuildOptions(process.argv);
    const releaseBindingRoot = path.resolve(promotionOptions["release-root"]);
    const result = await runCapsulePromotionBuildOperator({
      paths: {
        runDirectory: path.resolve(promotionOptions["run-directory"]),
        releaseBindingRoot,
        releasePath: path.resolve(releaseBindingRoot, promotionOptions.release),
        energyAssignmentsPath: path.resolve(promotionOptions["energy-assignments"]),
        disjointSeedPackPaths: promotionOptions["disjoint-seed-packs"].split(",")
          .map((value) => path.resolve(releaseBindingRoot, value.trim())),
      },
      capsuleParent: path.resolve(promotionOptions["capsule-parent"]),
      evidenceOutput: path.resolve(promotionOptions["evidence-output"]),
      receiptOutput: path.resolve(promotionOptions["receipt-output"]),
    });
    console.log(canonical(result));
    return;
  }
  const profile = options.profile ?? (action === "smoke" ? "smoke" : "development");
  if (action === "prepare") {
    console.log(JSON.stringify(await prepare(profile), null, 2));
    return;
  }
  if (action === "analyze") {
    if (!options.output) throw new Error("analyze requires --output <run-directory>");
    const output = path.resolve(options.output);
    const runDocument = await loadJson(path.join(output, "provenance", "run.json"));
    if (runDocument.run_kind === "factorial-diagnostic-v1") {
      if (options["energy-reading"]) {
        throw new Error("Factorial energy must be bound per assigned interval; whole-run allocation is not supported.");
      }
      console.log(JSON.stringify(await analyzeFactorialRun(output), null, 2));
      return;
    }
    if (options["energy-reading"]) {
      await attachEnergyReading(output, path.resolve(options["energy-reading"]));
    }
    console.log(JSON.stringify(await analyzeRun(output), null, 2));
    return;
  }
  if (action === "validate") {
    if (!options.output) throw new Error("validate requires --output <run-directory>");
    const output = path.resolve(options.output);
    const runDocument = await loadJson(path.join(output, "provenance", "run.json"));
    if (runDocument.run_kind === "factorial-diagnostic-v1") {
      if (options["energy-reading"]) {
        throw new Error("Factorial energy must be bound per assigned interval; whole-run allocation is not supported.");
      }
      console.log(JSON.stringify(await validateFactorialRun(output), null, 2));
      return;
    }
    if (options["energy-reading"]) {
      await attachEnergyReading(output, path.resolve(options["energy-reading"]));
    }
    console.log(JSON.stringify(await validateRun(output), null, 2));
    return;
  }
  if (action !== "smoke" && action !== "run" && action !== "factorial") {
    throw new Error("Action must be prepare, smoke, run, factorial, capsule-confirmation, capsule-promotion-build, analyze, or validate.");
  }
  await prepare(profile);
  const config = await loadJson(path.join(benchmarkRoot, "configs", `${profile}.json`));
  const seedFile = profile === "smoke" ? "smoke.json" : "development.json";
  const seeds = (await loadJson(path.join(benchmarkRoot, "seeds", seedFile))).seeds;
  const resume = options.resume === "true";
  const stopAfterRecords = options["stop-after-records"] === undefined
    ? null
    : Number(options["stop-after-records"]);
  if (resume && !options.output) throw new Error("--resume true requires --output <existing-run-directory>.");
  const output = options.output
    ? path.resolve(options.output)
    : path.join(root, "experiments", "workstation", "runs", `candidate-010-${profile}-${Date.now()}`);
  if (action === "factorial") {
    const splits = (options.splits ?? "development").split(",").map((value) => value.trim()).filter(Boolean);
    const scenarios = buildFactorialDesign({ splits });
    const executionMode = options["execution-mode"] ?? "development";
    const result = await runFactorialExperiment({
      config,
      seeds,
      scenarios,
      outputDirectory: output,
      executionMode,
      resume,
      stopAfterRecords,
    });
    if (!result.complete) {
      console.log(JSON.stringify({
        output,
        run: result.run,
        resume_command: `node experiments/workstation/candidate-010/runner.mjs factorial --profile ${profile} --splits ${splits.join(",")} --output ${output} --execution-mode ${executionMode} --resume true`,
      }, null, 2));
      return;
    }
    const validation = await validateFactorialRun(output);
    const summary = await analyzeFactorialRun(output);
    console.log(JSON.stringify({ output, run: result.run, summary, validation }, null, 2));
    return;
  }
  const result = await runExperiment({
    config,
    seeds,
    outputDirectory: output,
    resume,
    stopAfterRecords,
  });
  if (!result.complete) {
    console.log(JSON.stringify({ output, run: result.run, resume_command: `node experiments/workstation/candidate-010/runner.mjs ${action} --profile ${profile} --output ${output} --resume true` }, null, 2));
    return;
  }
  const validation = await validateRun(output);
  const summary = await analyzeRun(output);
  console.log(JSON.stringify({ output, run: result.run, summary, validation }, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname.replace(/^\/(.:)/, "$1"))) {
  main().catch((error) => {
    console.error(error.stack ?? error.message);
    process.exitCode = 1;
  });
}
