import { createHash } from "node:crypto";
import {
  access,
  mkdir,
  open,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  canonicalize,
  openCheckpointLedger,
  remainingWorkUnits,
  sha256Hex,
} from "../lib/checkpoint-ledger.mjs";
import {
  FIXTURE_023_EVENT_CONTRACT_VERSION,
  FIXTURE_023_TRACK_ARMS,
  assertFixture023Record,
  canonical,
  fixture023ScientificPayload,
  fixture023WorkKey,
  sha256,
} from "./contract.mjs";
import {
  FIXTURE_023_GENERATOR_VERSION,
  fixture023OpaqueWorldId,
  generateT01Episodes,
  generateT02Lifecycles,
  projectT01PolicyInput,
  projectT02PolicyInput,
  validateFixture023Config,
} from "./generator.mjs";
import { runT01Policy, runT02Policy } from "./policy.mjs";

export const FIXTURE_023_RUNNER_VERSION = "fixture-023.plm-development-runner.v4";

const fixtureRoot = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(fixtureRoot, "../../..");
const ledgerFormat = "fixture-023.plm-development-ledger.v4";
const sourceFiles = Object.freeze([
  "../lib/checkpoint-ledger.mjs",
  "../lib/pcg64-dxsm.mjs",
  "contract.mjs",
  "generator.mjs",
  "output.schema.json",
  "policy-input.mjs",
  "policy.mjs",
  "runner.mjs",
]);

function isInside(root, target) {
  const relative = path.relative(root, target);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function parseOptions(argv) {
  const action = argv[2];
  if (!new Set(["prepare", "smoke", "run", "analyze", "validate"]).has(action)) {
    throw new Error("Fixture 023 action must be prepare, smoke, run, analyze, or validate; confirmation and transfer are inaccessible.");
  }
  if ((argv.length - 3) % 2 !== 0) throw new Error("Options require explicit --name value pairs.");
  const options = {};
  for (let index = 3; index < argv.length; index += 2) {
    const token = argv[index];
    const value = argv[index + 1];
    if (!/^--[a-z][a-z-]*$/.test(token ?? "") || !value || value.startsWith("--")) {
      throw new Error("Fixture 023 options require explicit --name value pairs.");
    }
    const key = token.slice(2);
    if (!new Set(["profile", "output", "resume"]).has(key) || Object.hasOwn(options, key)) {
      throw new Error(`Unknown or duplicate Fixture 023 option --${key}.`);
    }
    options[key] = value;
  }
  if (new Set(["prepare", "smoke", "run"]).has(action)) {
    if (!new Set(["smoke", "development"]).has(options.profile)) {
      throw new Error(`${action} requires --profile smoke or --profile development.`);
    }
  } else if (options.profile !== undefined || options.resume !== undefined) {
    throw new Error(`${action} does not accept --profile or --resume.`);
  }
  if (action === "smoke" && options.profile !== "smoke") throw new Error("smoke requires --profile smoke.");
  if (action === "run" && options.profile !== "development") throw new Error("run requires --profile development.");
  if (action === "prepare" && (options.output !== undefined || options.resume !== undefined)) {
    throw new Error("prepare does not accept --output or --resume.");
  }
  if (action !== "prepare" && !options.output) throw new Error(`${action} requires --output.`);
  if (options.resume !== undefined && !new Set(["true", "false"]).has(options.resume)) {
    throw new Error("--resume must be true or false.");
  }
  return { action, options };
}

async function loadJson(file) {
  return JSON.parse(await readFile(file, "utf8"));
}

async function fileSha256(file) {
  return createHash("sha256").update(await readFile(file)).digest("hex");
}

async function exists(file) {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

async function writeJsonStable(file, value) {
  const body = `${JSON.stringify(value, null, 2)}\n`;
  try {
    await writeFile(file, body, { flag: "wx" });
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
    const existing = JSON.parse(await readFile(file, "utf8"));
    if (canonical(existing) !== canonical(value)) {
      throw new Error(`Refusing to replace non-identical ${path.basename(file)}.`, { cause: error });
    }
  }
}

async function readOptionalText(file) {
  try {
    return await readFile(file, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

async function replaceJsonAtomic(file, value) {
  const body = `${JSON.stringify(value, null, 2)}\n`;
  const temporary = `${file}.tmp-${process.pid}-${Date.now()}`;
  let replaced = false;
  try {
    const handle = await open(temporary, "wx", 0o600);
    try {
      await handle.writeFile(body, "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
    await rename(temporary, file);
    replaced = true;
    const destination = await open(file, "r+");
    try {
      await destination.sync();
    } finally {
      await destination.close();
    }
  } finally {
    if (!replaced) await rm(temporary, { force: true });
  }
}

async function writeRunDocument(file, value, { resume }) {
  const existing = await readOptionalText(file);
  if (existing === null) {
    await replaceJsonAtomic(file, value);
    return;
  }
  let parsed = null;
  let parseError = null;
  try {
    parsed = JSON.parse(existing);
  } catch (error) {
    parseError = error;
  }
  if (parseError === null && existing.endsWith("\n")) {
    if (canonical(parsed) !== canonical(value)) {
      throw new Error("Refusing to replace non-identical run.json.");
    }
    return;
  }
  if (!resume) throw new Error("Fixture 023 run.json is torn; resume is required for derivable repair.");
  if (parseError === null && canonical(parsed) !== canonical(value)) {
    throw new Error("Refusing to repair a complete but non-identical run.json.");
  }
  await replaceJsonAtomic(file, value);
}

const checkpointKeys = Object.freeze([
  "schema",
  "artifact",
  "ledger_format",
  "records",
  "scientific_payload_sha256",
  "hash_chain_sha256",
  "completed_work_units_sha256",
  "run_identity",
  "checkpoint_sha256",
]);

function assertFixture023Checkpoint(checkpoint, identity = null) {
  if (!exactObjectKeys(checkpoint, checkpointKeys)) {
    throw new Error("Fixture 023 checkpoint has missing or unknown fields.");
  }
  const { checkpoint_sha256: digest, ...body } = checkpoint;
  if (
    checkpoint.schema !== 1
    || checkpoint.artifact !== "fixture-023"
    || checkpoint.ledger_format !== ledgerFormat
    || !Number.isSafeInteger(checkpoint.records)
    || checkpoint.records < 0
    || !/^[0-9a-f]{64}$/.test(checkpoint.scientific_payload_sha256)
    || !/^[0-9a-f]{64}$/.test(checkpoint.hash_chain_sha256)
    || !/^[0-9a-f]{64}$/.test(checkpoint.completed_work_units_sha256)
    || !/^[0-9a-f]{64}$/.test(digest)
    || digest !== sha256Hex(canonicalize(body))
  ) throw new Error("Fixture 023 checkpoint violates its closed runtime contract.");
  if (identity !== null && canonical(checkpoint.run_identity) !== canonical(identity)) {
    throw new Error("Fixture 023 checkpoint identity differs from the canonical run identity.");
  }
  return checkpoint;
}

async function readOptionalCheckpoint(file, identity = null) {
  const raw = await readOptionalText(file);
  if (raw === null) return null;
  let checkpoint;
  try {
    checkpoint = JSON.parse(raw);
  } catch (error) {
    throw new Error(`Fixture 023 checkpoint is not valid JSON: ${error.message}`, { cause: error });
  }
  return assertFixture023Checkpoint(checkpoint, identity);
}

function outputDirectory(value) {
  const resolved = path.resolve(repositoryRoot, value);
  if (!isInside(repositoryRoot, resolved) || resolved === repositoryRoot) {
    throw new Error("Fixture 023 output must stay inside the repository.");
  }
  return resolved;
}

function exactObjectKeys(value, keys) {
  return value
    && typeof value === "object"
    && !Array.isArray(value)
    && canonical(Object.keys(value).sort()) === canonical([...keys].sort());
}

export function validateDevelopmentSeeds(document) {
  const tracks = document?.tracks;
  if (
    !exactObjectKeys(document, [
      "schema",
      "artifact",
      "partition",
      "state",
      "algorithm",
      "derivation",
      "tracks",
    ])
    || document?.schema !== 1
    || document.artifact !== "fixture-023"
    || document.partition !== "development"
    || document.state !== "public-development"
    || document.algorithm !== "fixture-023-public-development-seeds-v1"
    || !exactObjectKeys(document.derivation, ["formula", "track_indices"])
    || document.derivation.formula !== "1516000 + 10000 * k + j for k = 1..2 and j = 1..64"
    || !exactObjectKeys(document.derivation.track_indices, ["PLM-T01", "PLM-T02"])
    || document.derivation.track_indices["PLM-T01"] !== 1
    || document.derivation.track_indices["PLM-T02"] !== 2
    || !tracks
    || canonical(Object.keys(tracks).sort()) !== canonical(["PLM-T01", "PLM-T02"])
  ) throw new Error("Fixture 023 development seed document is invalid.");
  for (const [track, trackIndex] of Object.entries(document.derivation.track_indices)) {
    const expected = Array.from(
      { length: 64 },
      (_, index) => 1516000 + 10000 * trackIndex + index + 1,
    );
    if (canonical(tracks[track]) !== canonical(expected)) {
      throw new Error(`Fixture 023 ${track} development seeds do not match their exact derivation.`);
    }
  }
  if (new Set([...tracks["PLM-T01"], ...tracks["PLM-T02"]]).size !== (
    tracks["PLM-T01"].length + tracks["PLM-T02"].length
  )) throw new Error("Fixture 023 track seed lists must be disjoint.");
  return document;
}

export function validateUnavailablePartition(document, partition) {
  if (
    !new Set(["confirmation", "transfer"]).has(partition)
    || !exactObjectKeys(document, [
      "schema",
      "artifact",
      "partition",
      "state",
      "contains_seeds",
      "contains_commitment",
      "reason",
    ])
    || document.schema !== 1
    || document.artifact !== "fixture-023"
    || document.partition !== partition
    || document.state !== "not-created"
    || document.contains_seeds !== false
    || document.contains_commitment !== false
    || typeof document.reason !== "string"
    || document.reason.trim().length < 20
  ) throw new Error(`Fixture 023 ${partition} unavailable-partition document is invalid.`);
  return document;
}

async function loadInputs(profile) {
  const configPath = path.join(fixtureRoot, "configs", `${profile}.json`);
  const seedsPath = path.join(fixtureRoot, "seeds", "development.reveal.json");
  const confirmationPath = path.join(fixtureRoot, "seeds", "confirmation.unavailable.json");
  const transferPath = path.join(fixtureRoot, "seeds", "transfer.unavailable.json");
  const [config, seedDocument, confirmationDocument, transferDocument] = await Promise.all([
    loadJson(configPath),
    loadJson(seedsPath),
    loadJson(confirmationPath),
    loadJson(transferPath),
  ]);
  validateFixture023Config(config);
  validateDevelopmentSeeds(seedDocument);
  validateUnavailablePartition(confirmationDocument, "confirmation");
  validateUnavailablePartition(transferDocument, "transfer");
  if (config.profile !== profile) throw new Error("Fixture 023 profile/config mismatch.");
  const trackSeeds = Object.fromEntries(Object.entries(seedDocument.tracks).map(([track, seeds]) => [
    track,
    Object.freeze(profile === "smoke" ? seeds.slice(0, 2) : [...seeds]),
  ]));
  const sourceEntries = await Promise.all(sourceFiles.map(async (relative) => {
    const absolute = path.resolve(fixtureRoot, relative);
    return [relative.replaceAll("\\", "/"), await fileSha256(absolute)];
  }));
  const immutableInputs = {
    audit: path.join(repositoryRoot, "research", "audits", "2026-08-25-plant-plasticity-memory-signalling.md"),
    fixture: path.join(repositoryRoot, "experiments", "fixtures", "023-plant-plasticity-memory-signalling.md"),
    runner: path.join(fixtureRoot, "runner.mjs"),
    configuration: configPath,
    schema: path.join(fixtureRoot, "output.schema.json"),
    public_seeds: seedsPath,
    confirmation_partition: confirmationPath,
    transfer_partition: transferPath,
  };
  const inputSha256 = Object.freeze(Object.fromEntries(await Promise.all(
    Object.entries(immutableInputs).map(async ([key, file]) => [key, await fileSha256(file)]),
  )));
  return Object.freeze({
    profile,
    config,
    configPath,
    configSha256: await fileSha256(configPath),
    trackSeeds: Object.freeze(trackSeeds),
    seedsPath,
    seedsSha256: await fileSha256(seedsPath),
    unavailablePartitions: Object.freeze({
      confirmation: Object.freeze({
        document: Object.freeze(confirmationDocument),
        path: confirmationPath,
        sha256: await fileSha256(confirmationPath),
      }),
      transfer: Object.freeze({
        document: Object.freeze(transferDocument),
        path: transferPath,
        sha256: await fileSha256(transferPath),
      }),
    }),
    sourceHashes: Object.freeze(Object.fromEntries(sourceEntries)),
    inputSha256,
  });
}

function runIdentity(inputs) {
  const body = {
    schema: 1,
    artifact: "fixture-023",
    tracks: ["PLM-T01", "PLM-T02"],
    claim_scope: ["C-1516", "C-1517"],
    runner_version: FIXTURE_023_RUNNER_VERSION,
    generator_version: FIXTURE_023_GENERATOR_VERSION,
    event_contract_version: FIXTURE_023_EVENT_CONTRACT_VERSION,
    ledger_format: ledgerFormat,
    profile: inputs.profile,
    config: inputs.config,
    config_sha256: inputs.configSha256,
    track_seeds: inputs.trackSeeds,
    development_seed_document_sha256: inputs.seedsSha256,
    development_seed_derivation: "1516000 + 10000 * k + j for k = 1..2 and j = 1..64",
    track_arms: FIXTURE_023_TRACK_ARMS,
    source_hashes: inputs.sourceHashes,
    input_sha256: inputs.inputSha256,
    partition: "public-development-only",
    unavailable_partitions: {
      confirmation: {
        state: inputs.unavailablePartitions.confirmation.document.state,
        contains_seeds: inputs.unavailablePartitions.confirmation.document.contains_seeds,
        contains_commitment: inputs.unavailablePartitions.confirmation.document.contains_commitment,
        sha256: inputs.unavailablePartitions.confirmation.sha256,
      },
      transfer: {
        state: inputs.unavailablePartitions.transfer.document.state,
        contains_seeds: inputs.unavailablePartitions.transfer.document.contains_seeds,
        contains_commitment: inputs.unavailablePartitions.transfer.document.contains_commitment,
        sha256: inputs.unavailablePartitions.transfer.sha256,
      },
    },
  };
  return Object.freeze({ ...body, run_id: sha256Hex(canonicalize(body)) });
}

function assertTaskRows(rows, count, dimensions) {
  return Array.isArray(rows)
    && rows.length === count
    && rows.every((task) => exactObjectKeys(task, ["features", "label", "evaluator_probability"])
      && Array.isArray(task.features)
      && task.features.length === dimensions
      && task.features.every(Number.isFinite)
      && new Set([0, 1]).has(task.label)
      && Number.isFinite(task.evaluator_probability)
      && task.evaluator_probability >= 0
      && task.evaluator_probability <= 1);
}

function assertGeneratedWorlds(track, seed, worlds, config) {
  const expectedCount = track === "PLM-T01"
    ? config.t01_episodes_per_seed
    : config.t02_lifecycles_per_seed;
  if (!Array.isArray(worlds) || worlds.length !== expectedCount) {
    throw new Error(`Fixture 023 ${track} generator cardinality differs from the frozen config.`);
  }
  const valid = worlds.every((world, worldIndex) => {
    if (
      world.seed !== seed
      || world.world_index !== worldIndex
      || world.world_id !== fixture023OpaqueWorldId(track, seed, worldIndex)
    ) return false;
    if (track === "PLM-T01") {
      const expectedCell = [
        "uninterrupted-low-noise",
        "interrupted-low-noise",
        "interrupted-high-noise",
        "interrupted-aligned-missing",
      ][worldIndex % 4];
      return exactObjectKeys(world, [
        "seed",
        "world_index",
        "world_id",
        "intervention_cell",
        "observations",
        "hidden_duration_s",
        "target_probability",
        "target_label",
      ])
        && world.intervention_cell === expectedCell
        && Array.isArray(world.observations)
        && world.observations.length === config.t01_steps_per_episode
        && world.observations.every((value) => value === null || value === 0 || value === 1)
        && Number.isSafeInteger(world.hidden_duration_s)
        && world.hidden_duration_s >= 0
        && world.hidden_duration_s <= config.t01_steps_per_episode
        && Number.isFinite(world.target_probability)
        && world.target_probability > 0
        && world.target_probability < 1
        && new Set([0, 1]).has(world.target_label);
    }
    const rho = [0, 0.3, 0.7, 0.95][worldIndex % 4];
    const boundaryState = ["authentic", "duplicate", "delayed", "missing"][worldIndex % 4];
    return exactObjectKeys(world, [
      "seed",
      "world_index",
      "world_id",
      "intervention_cell",
      "boundary_state",
      "boundary_authenticated",
      "previous_tasks",
      "current_tasks",
    ])
      && world.intervention_cell === `rho-${rho.toFixed(2)}|boundary-${boundaryState}`
      && world.boundary_state === boundaryState
      && world.boundary_authenticated === (boundaryState === "authentic")
      && assertTaskRows(
        world.previous_tasks,
        config.t02_tasks_per_lifecycle,
        config.t02_feature_dimensions,
      )
      && assertTaskRows(
        world.current_tasks,
        config.t02_tasks_per_lifecycle,
        config.t02_feature_dimensions,
      );
  });
  if (!valid || new Set(worlds.map((world) => world.world_id)).size !== expectedCount) {
    throw new Error(`Fixture 023 ${track} generated world set is malformed or non-canonical.`);
  }
  return worlds;
}

function allWorkUnits(inputs, generators = {}) {
  const generateT01 = generators.generateT01Episodes ?? generateT01Episodes;
  const generateT02 = generators.generateT02Lifecycles ?? generateT02Lifecycles;
  const units = [];
  try {
    for (const seed of inputs.trackSeeds["PLM-T01"]) {
      const worlds = generateT01({ seed, config: inputs.config });
      assertGeneratedWorlds("PLM-T01", seed, worlds, inputs.config);
      for (const world of worlds) {
        for (const arm of FIXTURE_023_TRACK_ARMS["PLM-T01"]) {
          units.push(Object.freeze({ track: "PLM-T01", seed, world, arm }));
        }
      }
    }
    for (const seed of inputs.trackSeeds["PLM-T02"]) {
      const worlds = generateT02({ seed, config: inputs.config });
      assertGeneratedWorlds("PLM-T02", seed, worlds, inputs.config);
      for (const world of worlds) {
        for (const arm of FIXTURE_023_TRACK_ARMS["PLM-T02"]) {
          units.push(Object.freeze({ track: "PLM-T02", seed, world, arm }));
        }
      }
    }
  } catch (error) {
    throw new Error(
      "Fixture 023 pack INVALID: generator failed before canonical work-set closure.",
      { cause: error },
    );
  }
  return Object.freeze(units);
}

export { allWorkUnits as buildFixture023CanonicalWorkUnits };

function workUnitKey(unit) {
  return `${unit.track}:${unit.seed}:${unit.world.world_index}:${unit.arm}`;
}

function evaluateT01(world, policy, config) {
  const brier = (policy.prediction - world.target_label) ** 2;
  return {
    targetProbability: world.target_probability,
    targetLabel: world.target_label,
    brier,
    premature: policy.prediction > 0.9
      && world.hidden_duration_s < config.t01_decision_center_s - 16,
  };
}

function evaluateT02(world, policy) {
  const split = world.current_tasks.length / 2;
  const evaluation = world.current_tasks.slice(split);
  if (evaluation.length !== policy.evaluationPredictions.length) {
    throw new Error("Fixture 023 PLM-T02 evaluator/policy output cardinality mismatch.");
  }
  let logLossSum = 0;
  let predictionSum = 0;
  let targetSum = 0;
  for (let index = 0; index < evaluation.length; index += 1) {
    const prediction = policy.evaluationPredictions[index];
    const task = evaluation[index];
    logLossSum -= task.label * Math.log(prediction) + (1 - task.label) * Math.log(1 - prediction);
    predictionSum += prediction;
    targetSum += task.evaluator_probability;
  }
  return {
    logLossSum,
    logLoss: logLossSum / evaluation.length,
    evaluationCount: evaluation.length,
    predictions: [...policy.evaluationPredictions],
    labels: evaluation.map((task) => task.label),
    prediction: predictionSum / evaluation.length,
    target: targetSum / evaluation.length,
  };
}

function failureReasonFor(result, outcome, config) {
  const counters = [result.operations, result.writes, result.rngUpdates];
  if (
    counters.some((value) => !Number.isSafeInteger(value) || value < 0)
    || (Object.hasOwn(result, "resetFraction")
      && (!Number.isFinite(result.resetFraction)
        || result.resetFraction < 0
        || result.resetFraction > 1))
    || (Object.hasOwn(result, "resetPerformed")
      && typeof result.resetPerformed !== "boolean")
    || (Object.hasOwn(result, "resetFraction")
      && Object.hasOwn(result, "resetPerformed")
      && typeof result.resetPerformed === "boolean"
      && result.resetPerformed !== (result.resetFraction > 0))
    || (Object.hasOwn(result, "abstained") && typeof result.abstained !== "boolean")
    || (outcome.prediction_probability !== null
      && !Number.isFinite(outcome.prediction_probability))
    || (outcome.log_loss !== null && !Number.isFinite(outcome.log_loss))
    || (outcome.brier_loss !== null && !Number.isFinite(outcome.brier_loss))
  ) return "numerical-failure";
  if (counters.some((value) => value > config.operation_budget_per_world)) {
    return "operation-budget-exhausted";
  }
  return null;
}

function safeCounter(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

function t02Targets(world) {
  const split = world.current_tasks.length / 2;
  const evaluation = world.current_tasks.slice(split);
  return Object.freeze({
    count: evaluation.length,
    labels: Object.freeze(evaluation.map((task) => task.label)),
    probability: evaluation.reduce((sum, task) => sum + task.evaluator_probability, 0)
      / evaluation.length,
  });
}

function chargedFailureAccounting(actual, config) {
  return {
    ...actual,
    state_bytes_charged: config.state_budget_bytes,
    operation_count_charged: config.operation_budget_per_world,
    persistent_writes_charged: config.operation_budget_per_world,
    reset_operations_charged: 1,
    cleared_bytes_charged: config.state_budget_bytes,
    rng_updates_charged: config.operation_budget_per_world,
  };
}

function authorityBoundary() {
  return {
    status: "NO_RESULT",
    comparison_inference_permitted: false,
    measured_energy_present: false,
    energy_conclusion_allowed: false,
    claim_eligible: false,
    scientific_result: false,
    performance_result: false,
  };
}

function exceptionWorkUnit(common, unit, visible, result, reason, config) {
  if (unit.track === "PLM-T01") {
    const retainedPrediction = Number.isFinite(result?.prediction)
      && result.prediction >= 0
      && result.prediction <= 1
      ? result.prediction
      : null;
    return {
      ...common,
      outcome: {
        prediction_probability: retainedPrediction,
        target_probability: unit.world.target_probability,
        target_label: unit.world.target_label,
        brier_loss: null,
        log_loss: null,
        log_loss_sum: null,
        evaluation_count: 1,
        evaluation_predictions: null,
        evaluation_labels: null,
        premature_commitment: null,
        boundary_authenticated: null,
        boundary_state: null,
        reset_fraction: 1,
        reset_performed: true,
        abstained: false,
        unauthorized_reset: false,
        observed_loss: null,
        finite_loss: 100,
      },
      accounting: chargedFailureAccounting({
        observations: unit.world.observations.length,
        state_budget_bytes: config.state_budget_bytes,
        state_bytes_charged: config.state_budget_bytes,
        operation_budget: config.operation_budget_per_world,
        operation_count: safeCounter(result?.operations),
        operation_count_charged: 0,
        persistent_writes: safeCounter(result?.writes),
        persistent_writes_charged: 0,
        reset_operations: 1,
        reset_operations_charged: 0,
        cleared_bytes: config.state_budget_bytes,
        cleared_bytes_charged: 0,
        rng_updates: safeCounter(result?.rngUpdates),
        rng_updates_charged: 0,
      }, config),
      failure: { failed: true, reason },
      authority: authorityBoundary(),
    };
  }

  const targets = t02Targets(unit.world);
  const retainedPredictions = Array.isArray(result?.evaluationPredictions)
    && result.evaluationPredictions.length === targets.count
    && result.evaluationPredictions.every((prediction) => (
      Number.isFinite(prediction) && prediction > 0 && prediction < 1
    ))
    ? [...result.evaluationPredictions]
    : Array(targets.count).fill(null);
  const retained = retainedPredictions.every((prediction) => prediction !== null);
  const resetFraction = Number.isFinite(result?.resetFraction)
    && result.resetFraction >= 0
    && result.resetFraction <= 1
    ? result.resetFraction
    : 0;
  const resetPerformed = resetFraction > 0;
  return {
    ...common,
    outcome: {
      prediction_probability: retained
        ? retainedPredictions.reduce((sum, value) => sum + value, 0) / targets.count
        : null,
      target_probability: targets.probability,
      target_label: null,
      brier_loss: null,
      log_loss: null,
      log_loss_sum: null,
      evaluation_count: targets.count,
      evaluation_predictions: retainedPredictions,
      evaluation_labels: [...targets.labels],
      premature_commitment: null,
      boundary_authenticated: unit.world.boundary_authenticated,
      boundary_state: unit.world.boundary_state,
      reset_fraction: resetFraction,
      reset_performed: resetPerformed,
      abstained: typeof result?.abstained === "boolean" ? result.abstained : false,
      unauthorized_reset: false,
      observed_loss: null,
      finite_loss: 100,
    },
    accounting: chargedFailureAccounting({
      observations: visible.previous_tasks.length
        + visible.adaptation_tasks.length
        + visible.evaluation_features.length,
      state_budget_bytes: config.state_budget_bytes,
      state_bytes_charged: config.state_budget_bytes,
      operation_budget: config.operation_budget_per_world,
      operation_count: safeCounter(result?.operations),
      operation_count_charged: 0,
      persistent_writes: safeCounter(result?.writes),
      persistent_writes_charged: 0,
      reset_operations: resetPerformed ? 1 : 0,
      reset_operations_charged: 0,
      cleared_bytes: Math.round(config.state_budget_bytes * resetFraction),
      cleared_bytes_charged: 0,
      rng_updates: safeCounter(result?.rngUpdates),
      rng_updates_charged: 0,
    }, config),
    failure: { failed: true, reason },
    authority: authorityBoundary(),
  };
}

function workUnitContext(unit, inputs, identity) {
  const config = inputs.config;
  const visible = unit.track === "PLM-T01"
    ? projectT01PolicyInput(unit.world)
    : projectT02PolicyInput(unit.world);
  const common = {
    schema: 1,
    contract_version: FIXTURE_023_EVENT_CONTRACT_VERSION,
    artifact: "fixture-023",
    track: unit.track,
    claim_id: unit.track === "PLM-T01" ? "C-1516" : "C-1517",
    run_id: identity.run_id,
    profile: inputs.profile,
    pack: "public-development",
    seed: unit.seed,
    world_index: unit.world.world_index,
    world_id: unit.world.world_id,
    arm: unit.arm,
    intervention_cell: unit.world.intervention_cell,
    input_sha256: identity.input_sha256,
    observation_sha256: sha256(canonical(visible)),
    units: { time: "s", state: "B", loss: "dimensionless" },
  };
  return Object.freeze({ config, visible, common: Object.freeze(common) });
}

function replayExceptionWorkUnit(unit, inputs, identity, reason) {
  const { config, visible, common } = workUnitContext(unit, inputs, identity);
  if (reason === "policy-exception") {
    return exceptionWorkUnit(common, unit, visible, null, reason, config);
  }
  let result;
  try {
    result = unit.track === "PLM-T01"
      ? runT01Policy(visible, unit.arm, config)
      : runT02Policy(visible, unit.arm, config);
  } catch {
    return null;
  }
  return exceptionWorkUnit(common, unit, visible, result, reason, config);
}

function simulateWorkUnit(unit, inputs, identity, runtime = {}) {
  const { config, visible, common } = workUnitContext(unit, inputs, identity);
  let outcome;
  let accounting;
  let result;
  if (unit.track === "PLM-T01") {
    try {
      result = (runtime.runT01Policy ?? runT01Policy)(visible, unit.arm, config);
    } catch {
      return exceptionWorkUnit(common, unit, visible, null, "policy-exception", config);
    }
    let evaluated;
    try {
      evaluated = (runtime.evaluateT01 ?? evaluateT01)(unit.world, result, config);
    } catch {
      return exceptionWorkUnit(common, unit, visible, result, "evaluator-exception", config);
    }
    const observedLoss = Math.min(config.max_loss, 100 * evaluated.brier);
    outcome = {
      prediction_probability: result.prediction,
      target_probability: evaluated.targetProbability,
      target_label: evaluated.targetLabel,
      brier_loss: evaluated.brier,
      log_loss: null,
      log_loss_sum: null,
      evaluation_count: 1,
      evaluation_predictions: null,
      evaluation_labels: null,
      premature_commitment: evaluated.premature,
      boundary_authenticated: null,
      boundary_state: null,
      reset_fraction: 1,
      reset_performed: true,
      abstained: false,
      unauthorized_reset: false,
      observed_loss: observedLoss,
      finite_loss: observedLoss,
    };
    accounting = {
      observations: unit.world.observations.length,
      state_budget_bytes: config.state_budget_bytes,
      state_bytes_charged: config.state_budget_bytes,
      operation_budget: config.operation_budget_per_world,
      operation_count: result.operations,
      operation_count_charged: result.operations,
      persistent_writes: result.writes,
      persistent_writes_charged: result.writes,
      reset_operations: 1,
      reset_operations_charged: 1,
      cleared_bytes: config.state_budget_bytes,
      cleared_bytes_charged: config.state_budget_bytes,
      rng_updates: result.rngUpdates,
      rng_updates_charged: result.rngUpdates,
    };
  } else {
    try {
      result = (runtime.runT02Policy ?? runT02Policy)(visible, unit.arm, config);
    } catch {
      return exceptionWorkUnit(common, unit, visible, null, "policy-exception", config);
    }
    let evaluated;
    try {
      evaluated = (runtime.evaluateT02 ?? evaluateT02)(unit.world, result);
    } catch {
      return exceptionWorkUnit(common, unit, visible, result, "evaluator-exception", config);
    }
    const observedLoss = Math.min(config.max_loss, 100 * evaluated.logLoss);
    outcome = {
      prediction_probability: evaluated.prediction,
      target_probability: evaluated.target,
      target_label: null,
      brier_loss: null,
      log_loss: evaluated.logLoss,
      log_loss_sum: evaluated.logLossSum,
      evaluation_count: evaluated.evaluationCount,
      evaluation_predictions: evaluated.predictions,
      evaluation_labels: evaluated.labels,
      premature_commitment: null,
      boundary_authenticated: unit.world.boundary_authenticated,
      boundary_state: unit.world.boundary_state,
      reset_fraction: result.resetFraction,
      reset_performed: result.resetPerformed,
      abstained: result.abstained,
      unauthorized_reset: false,
      observed_loss: observedLoss,
      finite_loss: observedLoss,
    };
    accounting = {
      observations: visible.previous_tasks.length
        + visible.adaptation_tasks.length
        + visible.evaluation_features.length,
      state_budget_bytes: config.state_budget_bytes,
      state_bytes_charged: config.state_budget_bytes,
      operation_budget: config.operation_budget_per_world,
      operation_count: result.operations,
      operation_count_charged: result.operations,
      persistent_writes: result.writes,
      persistent_writes_charged: result.writes,
      reset_operations: result.resetPerformed ? 1 : 0,
      reset_operations_charged: result.resetPerformed ? 1 : 0,
      cleared_bytes: Math.round(config.state_budget_bytes * result.resetFraction),
      cleared_bytes_charged: Math.round(config.state_budget_bytes * result.resetFraction),
      rng_updates: 0,
      rng_updates_charged: 0,
    };
  }
  const failureReason = failureReasonFor(result, outcome, config);
  if (failureReason !== null) {
    const numericalFailure = failureReason === "numerical-failure";
    const resetFraction = unit.track === "PLM-T01"
      ? 1
      : Number.isFinite(result.resetFraction)
        && result.resetFraction >= 0
        && result.resetFraction <= 1
        ? result.resetFraction
        : 0;
    outcome = {
      ...outcome,
      prediction_probability: numericalFailure ? null : outcome.prediction_probability,
      brier_loss: numericalFailure ? null : outcome.brier_loss,
      log_loss: numericalFailure ? null : outcome.log_loss,
      log_loss_sum: numericalFailure ? null : outcome.log_loss_sum,
      evaluation_predictions: numericalFailure && unit.track === "PLM-T02"
        ? Array(outcome.evaluation_count).fill(null)
        : outcome.evaluation_predictions,
      premature_commitment: numericalFailure ? null : outcome.premature_commitment,
      reset_fraction: resetFraction,
      reset_performed: resetFraction > 0,
      abstained: unit.track === "PLM-T02" && typeof result.abstained === "boolean"
        ? result.abstained
        : false,
      observed_loss: numericalFailure ? null : outcome.observed_loss,
      finite_loss: 100,
    };
    accounting = chargedFailureAccounting({
      ...accounting,
      operation_count: safeCounter(result.operations),
      persistent_writes: safeCounter(result.writes),
      reset_operations: resetFraction > 0 ? 1 : 0,
      cleared_bytes: Math.round(config.state_budget_bytes * resetFraction),
      rng_updates: safeCounter(result.rngUpdates),
    }, config);
  }
  return {
    ...common,
    outcome,
    accounting,
    failure: {
      failed: failureReason !== null,
      reason: failureReason,
    },
    authority: authorityBoundary(),
  };
}

export { simulateWorkUnit as simulateFixture023WorkUnit };

export async function executeFixture023({
  profile,
  output,
  resume = false,
  maxWorkUnits = Infinity,
  runtime = {},
}) {
  const inputs = await loadInputs(profile);
  const identity = runIdentity(inputs);
  const units = allWorkUnits(inputs);
  const directory = outputDirectory(output);
  if (!resume && await exists(directory) && (await stat(directory)).isDirectory()) {
    throw new Error("Fixture 023 output already exists; pass --resume true to reconstruct it.");
  }
  await mkdir(directory, { recursive: true });
  const rawPath = path.join(directory, "raw-events.jsonl");
  const checkpointPath = path.join(directory, "checkpoint.json");
  await readOptionalCheckpoint(checkpointPath, identity);
  const ledger = await openCheckpointLedger({
    artifact: "fixture-023",
    ledgerFormat,
    rawPath,
    checkpointPath,
    runIdentity: identity,
    scientificPayload: fixture023ScientificPayload,
    workKey: fixture023WorkKey,
    assertRecord: (record, context) => assertFixture023Record(record, {
      ...context,
      expectedIdentity: identity,
    }),
  });
  if (ledger.summary().records > 0) {
    const existingRaw = await readValidatedRecords(directory, identity);
    assertCanonicalWorkSequence(existingRaw.records, units, inputs, identity, { complete: false });
  }
  const remaining = remainingWorkUnits(units, ledger.completedWorkKeys(), workUnitKey);
  for (const unit of remaining.slice(0, maxWorkUnits)) {
    await ledger.append(simulateWorkUnit(unit, inputs, identity, runtime));
    await ledger.saveCheckpoint();
  }
  // Reconcile even when the raw chain was already complete. This closes the
  // final-record/checkpoint crash window and recreates a missing checkpoint
  // from raw authority before a run document is emitted.
  await ledger.saveCheckpoint();
  const ledgerSummary = ledger.summary();
  const complete = ledgerSummary.completed_work_units === units.length;
  if (!complete) return Object.freeze({ directory, complete: false, run_id: identity.run_id, ledger: ledger.summary() });
  const run = {
    schema: 1,
    artifact: "fixture-023",
    run_identity: identity,
    expected_work_units: units.length,
    expected_work_order_sha256: sha256Hex(canonicalize(units.map(workUnitKey))),
    ledger: ledgerSummary,
    raw_path: path.relative(repositoryRoot, rawPath).replaceAll("\\", "/"),
    checkpoint_path: path.relative(repositoryRoot, checkpointPath).replaceAll("\\", "/"),
    confirmation_partition_present: inputs.unavailablePartitions.confirmation.document.state !== "not-created",
    transfer_partition_present: inputs.unavailablePartitions.transfer.document.state !== "not-created",
    measured_energy_present: false,
    energy_conclusion_allowed: false,
    claim_eligible: false,
    scientific_result: false,
    performance_result: false,
    interpretation: "NO_RESULT: public-development deterministic plumbing for PLM-T01 and PLM-T02 only.",
  };
  await writeRunDocument(path.join(directory, "run.json"), run, { resume });
  return Object.freeze({ directory, complete: true, run });
}

async function readValidatedRecords(directory, identity) {
  const rawPath = path.join(directory, "raw-events.jsonl");
  const text = await readFile(rawPath, "utf8");
  if (text.length > 0 && !text.endsWith("\n")) {
    throw new Error("Fixture 023 raw ledger has a torn trailing record.");
  }
  const lines = text.split(/\r?\n/u).filter(Boolean);
  const records = [];
  const seen = new Set();
  let previousHash = "0".repeat(64);
  const payloadDigest = createHash("sha256");
  for (const [sequence, line] of lines.entries()) {
    const record = JSON.parse(line);
    assertFixture023Record(record, { sequence, previousHash, expectedIdentity: identity });
    const key = fixture023WorkKey(record);
    if (seen.has(key)) throw new Error(`Duplicate Fixture 023 work unit ${key}.`);
    seen.add(key);
    payloadDigest.update(canonicalize(fixture023ScientificPayload(record)));
    previousHash = record.integrity.record_sha256;
    records.push(record);
  }
  return Object.freeze({
    records: Object.freeze(records),
    terminalHash: previousHash,
    scientificPayloadSha256: payloadDigest.digest("hex"),
    rawSha256: createHash("sha256").update(text).digest("hex"),
    completedWorkKeysSha256: sha256Hex(canonicalize([...seen].sort())),
  });
}

function assertCanonicalWorkSequence(records, units, inputs, identity, { complete }) {
  if (records.length > units.length || (complete && records.length !== units.length)) {
    throw new Error("Fixture 023 raw ledger does not contain the complete canonical work sequence.");
  }
  for (let index = 0; index < records.length; index += 1) {
    const actualPayload = fixture023ScientificPayload(records[index]);
    const expected = new Set(["policy-exception", "evaluator-exception"])
      .has(actualPayload.failure.reason)
      ? replayExceptionWorkUnit(
        units[index],
        inputs,
        identity,
        actualPayload.failure.reason,
      )
      : simulateWorkUnit(units[index], inputs, identity);
    if (expected === null) {
      throw new Error(`Fixture 023 exception replay could not reconstruct sequence ${index}.`);
    }
    if (canonical(actualPayload) !== canonical(expected)) {
      throw new Error(`Fixture 023 canonical work content or order mismatch at sequence ${index}.`);
    }
  }
}

function mean(rows, read) {
  return rows.reduce((sum, row) => sum + read(row), 0) / rows.length;
}

function armMetrics(records, track, arm) {
  const rows = records.filter((record) => record.track === track && record.arm === arm);
  const observedRows = rows.filter((record) => record.outcome.observed_loss !== null);
  return {
    records: rows.length,
    observed_loss_records: observedRows.length,
    observed_loss_sum: observedRows.reduce((sum, row) => sum + row.outcome.observed_loss, 0),
    charged_loss_sum: rows.reduce((sum, row) => sum + row.outcome.finite_loss, 0),
    mean_observed_loss: observedRows.length === 0
      ? null
      : mean(observedRows, (row) => row.outcome.observed_loss),
    mean_charged_loss: mean(rows, (row) => row.outcome.finite_loss),
    persistent_writes: rows.reduce((sum, row) => sum + row.accounting.persistent_writes, 0),
    persistent_writes_charged: rows.reduce(
      (sum, row) => sum + row.accounting.persistent_writes_charged,
      0,
    ),
    reset_operations: rows.reduce((sum, row) => sum + row.accounting.reset_operations, 0),
    reset_operations_charged: rows.reduce(
      (sum, row) => sum + row.accounting.reset_operations_charged,
      0,
    ),
    cleared_bytes: rows.reduce((sum, row) => sum + row.accounting.cleared_bytes, 0),
    cleared_bytes_charged: rows.reduce(
      (sum, row) => sum + row.accounting.cleared_bytes_charged,
      0,
    ),
    rng_updates: rows.reduce((sum, row) => sum + row.accounting.rng_updates, 0),
    rng_updates_charged: rows.reduce(
      (sum, row) => sum + row.accounting.rng_updates_charged,
      0,
    ),
    abstentions: rows.filter((row) => row.outcome.abstained).length,
    failures: rows.filter((row) => row.failure.failed).length,
    failure_reasons: Object.fromEntries([...new Set(rows
      .filter((row) => row.failure.failed)
      .map((row) => row.failure.reason))]
      .sort()
      .map((reason) => [reason, rows.filter((row) => row.failure.reason === reason).length])),
    operation_count: rows.reduce((sum, row) => sum + row.accounting.operation_count, 0),
    operation_count_charged: rows.reduce(
      (sum, row) => sum + row.accounting.operation_count_charged,
      0,
    ),
  };
}

function equalObservationInputs(records) {
  const byWorld = new Map();
  for (const record of records) {
    const key = `${record.track}:${record.seed}:${record.world_index}`;
    if (!byWorld.has(key)) byWorld.set(key, new Set());
    byWorld.get(key).add(record.observation_sha256);
  }
  return [...byWorld.values()].every((digests) => digests.size === 1);
}

export async function computeFixture023Analysis(output) {
  const directory = outputDirectory(output);
  const run = await loadJson(path.join(directory, "run.json"));
  const runKeys = [
    "schema",
    "artifact",
    "run_identity",
    "expected_work_units",
    "expected_work_order_sha256",
    "ledger",
    "raw_path",
    "checkpoint_path",
    "confirmation_partition_present",
    "transfer_partition_present",
    "measured_energy_present",
    "energy_conclusion_allowed",
    "claim_eligible",
    "scientific_result",
    "performance_result",
    "interpretation",
  ];
  if (
    !exactObjectKeys(run, runKeys)
    || run.schema !== 1
    || run.artifact !== "fixture-023"
    || !new Set(["smoke", "development"]).has(run.run_identity?.profile)
    || run.measured_energy_present !== false
    || run.energy_conclusion_allowed !== false
    || run.claim_eligible !== false
    || run.scientific_result !== false
    || run.performance_result !== false
    || run.interpretation !== "NO_RESULT: public-development deterministic plumbing for PLM-T01 and PLM-T02 only."
  ) throw new Error("Fixture 023 run document is invalid or not closed.");
  const inputs = await loadInputs(run.run_identity.profile);
  const identity = runIdentity(inputs);
  if (canonical(run.run_identity) !== canonical(identity)) {
    throw new Error("Fixture 023 run identity differs from current frozen inputs or sources.");
  }
  const units = allWorkUnits(inputs);
  const expectedWorkOrderSha256 = sha256Hex(canonicalize(units.map(workUnitKey)));
  await readOptionalCheckpoint(path.join(directory, "checkpoint.json"), identity);
  const contextualAssert = (record, context) => assertFixture023Record(record, {
    ...context,
    expectedIdentity: identity,
  });
  const [raw, ledger] = await Promise.all([
    readValidatedRecords(directory, identity),
    openCheckpointLedger({
      artifact: "fixture-023",
      ledgerFormat,
      rawPath: path.join(directory, "raw-events.jsonl"),
      checkpointPath: path.join(directory, "checkpoint.json"),
      runIdentity: identity,
      scientificPayload: fixture023ScientificPayload,
      workKey: fixture023WorkKey,
      assertRecord: contextualAssert,
    }),
  ]);
  const ledgerSummary = ledger.summary();
  assertCanonicalWorkSequence(raw.records, units, inputs, identity, { complete: true });
  if (
    run.expected_work_units !== units.length
    || raw.records.length !== units.length
    || run.expected_work_order_sha256 !== expectedWorkOrderSha256
    || raw.completedWorkKeysSha256 !== sha256Hex(canonicalize(units.map(workUnitKey).sort()))
    || canonical(run.ledger) !== canonical(ledgerSummary)
    || ledgerSummary.records !== raw.records.length
    || ledgerSummary.scientific_payload_sha256 !== raw.scientificPayloadSha256
    || ledgerSummary.hash_chain_sha256 !== raw.terminalHash
    || ledgerSummary.checkpoint_status !== "current"
    || ledgerSummary.completed_work_units !== raw.records.length
    || run.raw_path !== path.relative(repositoryRoot, path.join(directory, "raw-events.jsonl")).replaceAll("\\", "/")
    || run.checkpoint_path !== path.relative(repositoryRoot, path.join(directory, "checkpoint.json")).replaceAll("\\", "/")
    || run.confirmation_partition_present !== (
      inputs.unavailablePartitions.confirmation.document.state !== "not-created"
    )
    || run.transfer_partition_present !== (
      inputs.unavailablePartitions.transfer.document.state !== "not-created"
    )
  ) throw new Error("Fixture 023 run, checkpoint, and raw ledger disagree.");
  const metrics = Object.fromEntries(Object.entries(FIXTURE_023_TRACK_ARMS).map(([track, arms]) => [
    track,
    Object.fromEntries(arms.map((arm) => [arm, armMetrics(raw.records, track, arm)])),
  ]));
  const unauthenticatedResetCapable = raw.records.filter((record) => (
    record.track === "PLM-T02"
    && record.arm !== "carry-prior"
    && !record.failure.failed
    && record.outcome.boundary_authenticated === false
  ));
  const checks = {
    expected_development_records_present: raw.records.length === units.length
      && raw.completedWorkKeysSha256 === sha256Hex(canonicalize(units.map(workUnitKey).sort())),
    canonical_work_content_and_order: run.expected_work_order_sha256 === expectedWorkOrderSha256,
    both_tracks_and_all_arms_exercised: Object.entries(FIXTURE_023_TRACK_ARMS).every(([track, arms]) => (
      arms.every((arm) => metrics[track][arm].records > 0)
    )),
    equal_observation_digest_within_world: equalObservationInputs(raw.records),
    outputs_finite_and_clipped: raw.records.every((record) => (
      (new Set(["numerical-failure", "policy-exception", "evaluator-exception"])
        .has(record.failure.reason)
        ? (record.outcome.prediction_probability === null
            || Number.isFinite(record.outcome.prediction_probability))
          && record.outcome.observed_loss === null
          && record.outcome.finite_loss === 100
        : Number.isFinite(record.outcome.prediction_probability))
      && Number.isFinite(record.outcome.target_probability)
      && Number.isFinite(record.outcome.finite_loss)
      && record.outcome.finite_loss >= 0
      && record.outcome.finite_loss <= 100
    )),
    equal_state_and_operation_ceilings: raw.records.every((record) => (
      record.accounting.state_budget_bytes === 256
      && record.accounting.state_bytes_charged === 256
      && record.accounting.operation_count_charged <= record.accounting.operation_budget
    )),
    typed_failures_retain_denominators_and_finite_charges: raw.records.every((record) => (
      record.accounting.observations > 0
      && record.outcome.evaluation_count > 0
      && (!record.failure.failed || (
        record.outcome.finite_loss === 100
        && (record.failure.reason === "operation-budget-exhausted"
          ? Number.isFinite(record.outcome.observed_loss)
          : record.outcome.observed_loss === null)
        && record.accounting.operation_count_charged === record.accounting.operation_budget
        && record.accounting.persistent_writes_charged === record.accounting.operation_budget
        && record.accounting.reset_operations_charged === 1
        && record.accounting.cleared_bytes_charged === record.accounting.state_budget_bytes
        && record.accounting.rng_updates_charged === record.accounting.operation_budget
        && (record.track !== "PLM-T02"
          || record.outcome.evaluation_labels.length === record.outcome.evaluation_count)
      ))
    )),
    t01_episode_reset_closure: raw.records.filter((record) => record.track === "PLM-T01").every((record) => (
      record.outcome.reset_performed
      && record.accounting.reset_operations === 1
      && record.accounting.cleared_bytes === 256
    )),
    t02_corrupt_boundaries_exercised: unauthenticatedResetCapable.length > 0,
    t02_corrupt_boundaries_force_abstention: unauthenticatedResetCapable.every((record) => (
      record.outcome.abstained
      && !record.outcome.reset_performed
      && record.outcome.reset_fraction === 0
      && record.accounting.cleared_bytes === 0
    )),
    no_unauthorized_reset: raw.records.every((record) => !record.outcome.unauthorized_reset),
    authority_boundary_is_uniform: raw.records.every((record) => (
      record.authority.status === "NO_RESULT"
      && record.authority.comparison_inference_permitted === false
      && record.authority.measured_energy_present === false
      && record.authority.energy_conclusion_allowed === false
      && record.authority.claim_eligible === false
      && record.authority.scientific_result === false
      && record.authority.performance_result === false
    )),
  };
  const passed = Object.values(checks).every(Boolean);
  return {
    schema: 1,
    artifact: "fixture-023",
    tracks: ["PLM-T01", "PLM-T02"],
    claim_scope: ["C-1516", "C-1517"],
    contract_version: "fixture-023.plm-development-analysis.v4",
    run_id: identity.run_id,
    profile: identity.profile,
    raw_events_sha256: raw.rawSha256,
    run_sha256: sha256(canonical(run)),
    metrics,
    checks,
    decision: passed ? "diagnostic-pass" : "diagnostic-fail",
    comparison_inference_permitted: false,
    confirmation_partition_present: run.confirmation_partition_present,
    transfer_partition_present: run.transfer_partition_present,
    measured_energy_present: false,
    energy_conclusion_allowed: false,
    claim_eligible: false,
    scientific_result: false,
    performance_result: false,
    no_result: true,
    interpretation: "NO_RESULT: deterministic public-development plumbing, typed nulls, equal ceilings, reset closure, and corrupt-boundary abstention only.",
  };
}

export async function analyzeFixture023(output) {
  const directory = outputDirectory(output);
  const summary = await computeFixture023Analysis(output);
  await mkdir(path.join(directory, "analysis"), { recursive: true });
  await writeJsonStable(path.join(directory, "analysis", "summary.json"), summary);
  if (summary.decision !== "diagnostic-pass") throw new Error("Fixture 023 development diagnostics failed.");
  return summary;
}

export async function validateFixture023Output(output) {
  const directory = outputDirectory(output);
  const [expected, stored] = await Promise.all([
    computeFixture023Analysis(output),
    loadJson(path.join(directory, "analysis", "summary.json")),
  ]);
  if (canonical(expected) !== canonical(stored)) {
    throw new Error("Fixture 023 stored analysis is not reproducible from raw events.");
  }
  if (
    stored.comparison_inference_permitted !== false
    || stored.confirmation_partition_present !== false
    || stored.transfer_partition_present !== false
    || stored.energy_conclusion_allowed !== false
    || stored.claim_eligible !== false
    || stored.scientific_result !== false
    || stored.performance_result !== false
    || stored.no_result !== true
  ) throw new Error("Fixture 023 smoke output attempts to claim scientific authority.");
  return Object.freeze({ valid: true, run_id: stored.run_id, decision: stored.decision, no_result: true });
}

export async function prepareFixture023(profile) {
  const inputs = await loadInputs(profile);
  const units = allWorkUnits(inputs);
  const t01Seeds = inputs.trackSeeds["PLM-T01"].length;
  const t02Seeds = inputs.trackSeeds["PLM-T02"].length;
  return Object.freeze({
    valid: true,
    artifact: "fixture-023",
    tracks: ["PLM-T01", "PLM-T02"],
    profile,
    partition: "public-development-only",
    track_seed_counts: { "PLM-T01": t01Seeds, "PLM-T02": t02Seeds },
    work_units: units.length,
    confirmation_seeds_created: inputs.unavailablePartitions.confirmation.document.contains_seeds,
    transfer_seeds_created: inputs.unavailablePartitions.transfer.document.contains_seeds,
    measured_energy_required: false,
    energy_conclusion_allowed: false,
    claim_eligible: false,
    no_result: true,
  });
}

export async function main(argv = process.argv) {
  const { action, options } = parseOptions(argv);
  if (action === "prepare") return prepareFixture023(options.profile);
  if (action === "smoke") {
    await executeFixture023({
      profile: options.profile,
      output: options.output,
      resume: options.resume === "true",
    });
    await analyzeFixture023(options.output);
    return validateFixture023Output(options.output);
  }
  if (action === "run") {
    return executeFixture023({
      profile: options.profile,
      output: options.output,
      resume: options.resume === "true",
    });
  }
  if (action === "analyze") return analyzeFixture023(options.output);
  return validateFixture023Output(options.output);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then(
    (result) => process.stdout.write(`${JSON.stringify(result)}\n`),
    (error) => {
      process.stderr.write(`${error.stack ?? error.message}\n`);
      process.exitCode = 1;
    },
  );
}
