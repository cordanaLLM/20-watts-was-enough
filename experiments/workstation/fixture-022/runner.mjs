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
  FIXTURE_022_ARMS,
  FIXTURE_022_CORRUPTION_FAMILIES,
  FIXTURE_022_EVENT_CONTRACT_VERSION,
  assertFixture022Record,
  canonical,
  fixture022ScientificPayload,
  fixture022WorkKey,
  sha256,
} from "./contract.mjs";
import {
  FIXTURE_022_GENERATOR_VERSION,
  generateFixture022Worlds,
  validateFixture022Config,
  visibleFixture022Observation,
} from "./generator.mjs";

export const FIXTURE_022_RUNNER_VERSION = "fixture-022.dev-t01-runner.v3";

const fixtureRoot = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(fixtureRoot, "../../..");
const ledgerFormat = "fixture-022.dev-t01-ledger.v2";
const sourceFiles = Object.freeze([
  "../lib/checkpoint-ledger.mjs",
  "../lib/pcg64-dxsm.mjs",
  "contract.mjs",
  "generator.mjs",
  "output.schema.json",
  "runner.mjs",
  "configs/smoke.json",
  "configs/development.json",
  "seeds/development.reveal.json",
  "seeds/confirmation.unavailable.json",
  "seeds/transfer.unavailable.json",
]);

function isInside(root, target) {
  const relative = path.relative(root, target);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function parseOptions(argv) {
  const action = argv[2];
  if (!new Set(["prepare", "smoke", "run", "analyze", "validate"]).has(action)) {
    throw new Error("Fixture 022 action must be prepare, smoke, run, analyze, or validate; private partitions are not executable.");
  }
  if ((argv.length - 3) % 2 !== 0) throw new Error("Options require explicit --name value pairs.");
  const options = {};
  for (let index = 3; index < argv.length; index += 2) {
    const token = argv[index];
    const value = argv[index + 1];
    if (!/^--[a-z][a-z-]*$/.test(token ?? "") || !value || value.startsWith("--")) {
      throw new Error("Fixture 022 options require explicit --name value pairs.");
    }
    const key = token.slice(2);
    if (!new Set(["profile", "output", "resume"]).has(key) || Object.hasOwn(options, key)) {
      throw new Error(`Unknown or duplicate Fixture 022 option --${key}.`);
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
  if (!resume) throw new Error("Fixture 022 run.json is torn; resume is required for derivable repair.");
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

function assertFixture022Checkpoint(checkpoint, identity = null) {
  if (!exactObjectKeys(checkpoint, checkpointKeys)) {
    throw new Error("Fixture 022 checkpoint has missing or unknown fields.");
  }
  const { checkpoint_sha256: digest, ...body } = checkpoint;
  if (
    checkpoint.schema !== 1
    || checkpoint.artifact !== "fixture-022"
    || checkpoint.ledger_format !== ledgerFormat
    || !Number.isSafeInteger(checkpoint.records)
    || checkpoint.records < 0
    || !/^[0-9a-f]{64}$/.test(checkpoint.scientific_payload_sha256)
    || !/^[0-9a-f]{64}$/.test(checkpoint.hash_chain_sha256)
    || !/^[0-9a-f]{64}$/.test(checkpoint.completed_work_units_sha256)
    || !/^[0-9a-f]{64}$/.test(digest)
    || digest !== sha256Hex(canonicalize(body))
  ) throw new Error("Fixture 022 checkpoint violates its closed runtime contract.");
  if (identity !== null && canonical(checkpoint.run_identity) !== canonical(identity)) {
    throw new Error("Fixture 022 checkpoint identity differs from the canonical run identity.");
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
    throw new Error(`Fixture 022 checkpoint is not valid JSON: ${error.message}`, { cause: error });
  }
  return assertFixture022Checkpoint(checkpoint, identity);
}

function outputDirectory(value) {
  const resolved = path.resolve(repositoryRoot, value);
  if (!isInside(repositoryRoot, resolved) || resolved === repositoryRoot) {
    throw new Error("Fixture 022 output must stay inside the repository.");
  }
  return resolved;
}

function validateDevelopmentSeeds(document) {
  const expected = Array.from({ length: 64 }, (_, index) => 1516001 + index);
  if (
    document?.schema !== 1
    || document.artifact !== "fixture-022"
    || document.partition !== "development"
    || document.state !== "public-development"
    || document.algorithm !== "fixture-022-dev-t01-public-seeds-v1"
    || document.derivation !== "1506000 + 10000 * 1 + j for j = 1..64"
    || canonical(document.seeds) !== canonical(expected)
  ) throw new Error("Fixture 022 development seed document is invalid.");
  return document;
}

async function loadInputs(profile) {
  const smokeConfigPath = path.join(fixtureRoot, "configs", "smoke.json");
  const developmentConfigPath = path.join(fixtureRoot, "configs", "development.json");
  const activeConfigPath = profile === "smoke" ? smokeConfigPath : developmentConfigPath;
  const seedsPath = path.join(fixtureRoot, "seeds", "development.reveal.json");
  const [smokeConfig, developmentConfig, seedDocument] = await Promise.all([
    loadJson(smokeConfigPath),
    loadJson(developmentConfigPath),
    loadJson(seedsPath),
  ]);
  validateFixture022Config(smokeConfig);
  validateFixture022Config(developmentConfig);
  validateDevelopmentSeeds(seedDocument);
  const config = profile === "smoke" ? smokeConfig : developmentConfig;
  if (config.profile !== profile) throw new Error("Fixture 022 profile/config mismatch.");
  const seeds = profile === "smoke" ? seedDocument.seeds.slice(0, 2) : seedDocument.seeds;
  const sourceEntries = await Promise.all(sourceFiles.map(async (relative) => {
    const absolute = path.resolve(fixtureRoot, relative);
    return [relative.replaceAll("\\", "/"), await fileSha256(absolute)];
  }));
  const immutableInputs = {
    audit: path.join(repositoryRoot, "research", "audits", "2026-08-25-developmental-regeneration-depth.md"),
    fixture: path.join(repositoryRoot, "experiments", "fixtures", "022-regenerative-positional-memory.md"),
    runner: path.join(fixtureRoot, "runner.mjs"),
    config_smoke: smokeConfigPath,
    config_development: developmentConfigPath,
    schema: path.join(fixtureRoot, "output.schema.json"),
  };
  const inputSha256 = Object.freeze(Object.fromEntries(await Promise.all(
    Object.entries(immutableInputs).map(async ([key, file]) => [key, await fileSha256(file)]),
  )));
  return Object.freeze({
    profile,
    config,
    activeConfigPath,
    activeConfigSha256: await fileSha256(activeConfigPath),
    seeds,
    seedsPath,
    seedsSha256: await fileSha256(seedsPath),
    sourceHashes: Object.freeze(Object.fromEntries(sourceEntries)),
    inputSha256,
  });
}

function runIdentity(inputs) {
  const body = {
    schema: 1,
    artifact: "fixture-022",
    track: "DEV-T01",
    runner_version: FIXTURE_022_RUNNER_VERSION,
    generator_version: FIXTURE_022_GENERATOR_VERSION,
    event_contract_version: FIXTURE_022_EVENT_CONTRACT_VERSION,
    ledger_format: ledgerFormat,
    profile: inputs.profile,
    config: inputs.config,
    active_config_sha256: inputs.activeConfigSha256,
    seeds: inputs.seeds,
    development_seed_document_sha256: inputs.seedsSha256,
    arms: FIXTURE_022_ARMS,
    corruption_families: FIXTURE_022_CORRUPTION_FAMILIES,
    source_hashes: inputs.sourceHashes,
    input_sha256: inputs.inputSha256,
    partition: "public-development-only",
    confirmation_seed_state: "not-created",
    transfer_seed_state: "not-created",
    comparison_inference_permitted: false,
  };
  return Object.freeze({ ...body, run_id: sha256Hex(canonicalize(body)) });
}

function gridNeighbors(id, width, height) {
  const x = id % width;
  const y = Math.floor(id / width);
  const neighbors = [];
  if (y > 0) neighbors.push(id - width);
  if (x > 0) neighbors.push(id - 1);
  if (x + 1 < width) neighbors.push(id + 1);
  if (y + 1 < height) neighbors.push(id + width);
  return neighbors;
}

function assertGeneratedWorlds(seed, worlds, config) {
  const perFamily = config.worlds_per_corruption_family;
  const expectedCount = FIXTURE_022_CORRUPTION_FAMILIES.length * perFamily;
  const nodeCount = config.grid_width_nodes * config.grid_height_nodes;
  if (!Array.isArray(worlds) || worlds.length !== expectedCount) {
    throw new Error("Fixture 022 generator cardinality differs from the frozen config.");
  }
  const valid = worlds.every((world, worldIndex) => {
    const expectedFamily = FIXTURE_022_CORRUPTION_FAMILIES[Math.floor(worldIndex / perFamily)];
    if (
      !exactObjectKeys(world, [
        "seed",
        "world_index",
        "world_id",
        "corruption_family",
        "width_nodes",
        "height_nodes",
        "nodes",
        "target_roles",
        "observation_sha256",
      ])
      || world.seed !== seed
      || world.world_index !== worldIndex
      || world.world_id !== `${seed}:${worldIndex}`
      || world.corruption_family !== expectedFamily
      || world.width_nodes !== config.grid_width_nodes
      || world.height_nodes !== config.grid_height_nodes
      || !Array.isArray(world.nodes)
      || world.nodes.length !== nodeCount
      || !Array.isArray(world.target_roles)
      || world.target_roles.length !== nodeCount
      || !/^[0-9a-f]{64}$/.test(world.observation_sha256)
    ) return false;
    let wounded = 0;
    for (let id = 0; id < nodeCount; id += 1) {
      const node = world.nodes[id];
      const targetRole = world.target_roles[id];
      if (
        !exactObjectKeys(node, ["id", "neighbors", "wounded", "observed_role", "memory_role"])
        || node.id !== id
        || canonical(node.neighbors) !== canonical(gridNeighbors(id, world.width_nodes, world.height_nodes))
        || typeof node.wounded !== "boolean"
        || !Number.isSafeInteger(targetRole)
        || targetRole < 0
        || targetRole > 3
      ) return false;
      if (node.wounded) {
        wounded += 1;
        if (node.observed_role !== null || node.memory_role !== null) return false;
      } else if (
        node.observed_role !== targetRole
        || !Number.isSafeInteger(node.memory_role)
        || node.memory_role < 0
        || node.memory_role > 3
      ) return false;
    }
    return wounded > 0
      && wounded < nodeCount
      && world.observation_sha256
        === sha256(canonical(visibleFixture022Observation(world)));
  });
  if (!valid || new Set(worlds.map((world) => world.world_id)).size !== expectedCount) {
    throw new Error("Fixture 022 generated world set is malformed or non-canonical.");
  }
  return worlds;
}

function allWorkUnits(inputs, generators = {}) {
  const generateWorlds = generators.generateFixture022Worlds ?? generateFixture022Worlds;
  const units = [];
  try {
    for (const seed of inputs.seeds) {
      const worlds = generateWorlds({ seed, config: inputs.config });
      assertGeneratedWorlds(seed, worlds, inputs.config);
      for (const world of worlds) {
        for (const arm of FIXTURE_022_ARMS) units.push(Object.freeze({ seed, world, arm }));
      }
    }
  } catch (error) {
    throw new Error(
      "Fixture 022 pack INVALID: generator failed before canonical work-set closure.",
      { cause: error },
    );
  }
  return Object.freeze(units);
}

export { allWorkUnits as buildFixture022CanonicalWorkUnits };

function workUnitKey(unit) {
  return `${unit.seed}:${unit.world.world_index}:${unit.arm}`;
}

function contextualRecordValidator(identity) {
  return (record, position = {}) => assertFixture022Record(record, {
    ...position,
    context: identity,
  });
}

function stableMajority(labels) {
  const counts = [0, 0, 0, 0];
  for (const label of labels) if (label >= 0 && label <= 3) counts[label] += 1;
  let best = -1;
  let bestCount = 0;
  for (let label = 0; label < counts.length; label += 1) {
    if (counts[label] > bestCount) {
      best = label;
      bestCount = counts[label];
    }
  }
  return best;
}

function propagate(world, initialLabels, mutableNodeIds, config, initialMessages = 0) {
  let labels = [...initialLabels];
  let messages = initialMessages;
  let rounds = 0;
  let converged = false;
  const maximumMessages = Math.floor(
    config.message_budget_per_arm_bytes / config.bytes_per_message,
  );
  if (messages > maximumMessages) {
    return {
      labels,
      messages,
      rounds,
      converged: false,
      failureReason: "message-budget-exhausted",
    };
  }
  for (let round = 0; round < config.max_solver_rounds; round += 1) {
    const next = [...labels];
    let changes = 0;
    for (const id of mutableNodeIds) {
      const neighborLabels = world.nodes[id].neighbors
        .map((neighbor) => labels[neighbor])
        .filter((label) => label >= 0);
      if (messages + neighborLabels.length > maximumMessages) {
        return {
          labels,
          messages: messages + neighborLabels.length,
          rounds: round + 1,
          converged: false,
          failureReason: "message-budget-exhausted",
        };
      }
      messages += neighborLabels.length;
      const proposed = stableMajority(neighborLabels);
      if (proposed >= 0 && proposed !== labels[id]) {
        next[id] = proposed;
        changes += 1;
      }
    }
    labels = next;
    rounds = round + 1;
    if (changes === 0) {
      converged = true;
      break;
    }
  }
  return {
    labels,
    messages,
    rounds,
    converged,
    failureReason: converged ? null : "solver-nonconvergence",
  };
}

function memoryGate(world, config) {
  const trusted = new Set();
  const rejected = new Set();
  let gateMessages = 0;
  let mismatchCount = 0;
  for (const node of world.nodes) {
    if (node.wounded) continue;
    const directConsistency = node.memory_role === node.observed_role;
    if (!directConsistency) mismatchCount += 1;
    const comparableNeighbors = node.neighbors
      .map((id) => world.nodes[id])
      .filter((neighbor) => !neighbor.wounded && neighbor.observed_role === node.observed_role);
    gateMessages += comparableNeighbors.length;
    const neighborhoodConsistency = comparableNeighbors.length === 0
      || comparableNeighbors.every((neighbor) => neighbor.memory_role === node.observed_role);
    if (directConsistency && neighborhoodConsistency) trusted.add(node.id);
    else rejected.add(node.id);
  }
  const survivors = world.nodes.length - world.nodes.filter((node) => node.wounded).length;
  return {
    trusted,
    rejected,
    gateMessages,
    mismatchCount,
    commonModeFallback: mismatchCount / survivors >= config.common_mode_mismatch_threshold,
  };
}

function runPolicy(world, arm, config) {
  const observation = visibleFixture022Observation(world);
  const woundedIds = observation.nodes.filter((node) => node.wounded).map((node) => node.id);
  const survivorIds = observation.nodes.filter((node) => !node.wounded).map((node) => node.id);
  let labels = new Array(observation.nodes.length).fill(-1);
  let result;
  let memoryReads = 0;
  let memoryWrites = 0;
  let rollbackCount = 0;
  let memoryAbstentionCount = 0;
  let fallbackInvoked = false;
  let corruptionDetected = false;
  let extraMessages;
  let trustedMemoryIds = new Set();
  if (arm === "open-write-majority") {
    trustedMemoryIds = new Set(survivorIds);
    for (const id of survivorIds) labels[id] = observation.nodes[id].memory_role;
    memoryReads = survivorIds.length;
    result = propagate(observation, labels, observation.nodes.map((node) => node.id), config);
    memoryWrites = observation.nodes.filter((node) => (
      node.wounded
        ? result.labels[node.id] >= 0
        : result.labels[node.id] !== node.memory_role
    )).length;
  } else if (arm === "robust-propagation-null") {
    for (const id of survivorIds) labels[id] = observation.nodes[id].observed_role;
    result = propagate(observation, labels, woundedIds, config);
  } else {
    const gate = memoryGate(observation, config);
    trustedMemoryIds = gate.trusted;
    memoryReads = survivorIds.length + gate.gateMessages;
    extraMessages = gate.gateMessages;
    memoryAbstentionCount = gate.rejected.size;
    rollbackCount = gate.rejected.size;
    corruptionDetected = gate.mismatchCount > 0;
    fallbackInvoked = gate.commonModeFallback;
    for (const id of survivorIds) {
      labels[id] = fallbackInvoked || gate.rejected.has(id)
        ? observation.nodes[id].observed_role
        : observation.nodes[id].memory_role;
    }
    result = propagate(observation, labels, woundedIds, config, extraMessages);
    for (const id of woundedIds) {
      if (result.labels[id] < 0) continue;
      const supporting = observation.nodes[id].neighbors
        .map((neighbor) => result.labels[neighbor])
        .filter((label) => label >= 0);
      if (supporting.length >= 2 && stableMajority(supporting) === result.labels[id]) memoryWrites += 1;
      else rollbackCount += 1;
    }
  }
  return {
    labels: result.labels,
    woundedIds,
    trustedMemoryIds: [...trustedMemoryIds],
    messages: result.messages,
    memoryReads,
    memoryWrites,
    rollbackCount,
    memoryAbstentionCount,
    fallbackInvoked,
    corruptionDetected,
    solverRounds: result.rounds,
    converged: result.converged,
    failureReason: result.failureReason,
  };
}

function evaluatePolicy(world, arm, policy, config) {
  const observation = visibleFixture022Observation(world);
  const { woundedIds } = policy;
  const supportMissCount = policy.trustedMemoryIds
    .filter((id) => observation.nodes[id].memory_role !== world.target_roles[id]).length;
  const acceptedIds = woundedIds.filter((id) => policy.labels[id] >= 0);
  const wrongRoleCount = acceptedIds.filter((id) => policy.labels[id] !== world.target_roles[id]).length;
  let unsafeWriteCount = 0;
  if (arm === "open-write-majority") {
    unsafeWriteCount = observation.nodes.filter((node) => {
      const wrote = node.wounded
        ? policy.labels[node.id] >= 0
        : policy.labels[node.id] !== node.memory_role;
      return wrote && policy.labels[node.id] !== world.target_roles[node.id];
    }).length;
  } else if (arm === "gated-memory-with-null-fallback") {
    unsafeWriteCount = woundedIds.filter((id) => {
      if (policy.labels[id] < 0) return false;
      const supporting = observation.nodes[id].neighbors
        .map((neighbor) => policy.labels[neighbor])
        .filter((label) => label >= 0);
      const wrote = supporting.length >= 2 && stableMajority(supporting) === policy.labels[id];
      return wrote && policy.labels[id] !== world.target_roles[id];
    }).length;
  }
  const attempted = woundedIds.length;
  const accepted = acceptedIds.length;
  const roleErrorRate = (wrongRoleCount + attempted - accepted) / attempted;
  const acceptedServiceFraction = accepted / attempted;
  const wrongRate = wrongRoleCount / attempted;
  const unsafeRate = unsafeWriteCount / Math.max(1, policy.memoryWrites);
  const loss = Math.min(
    config.max_loss,
    40 * roleErrorRate + 30 * (1 - acceptedServiceFraction) + 20 * wrongRate + 10 * unsafeRate,
  );
  return {
    accepted,
    wrongRoleCount,
    unsafeWriteCount,
    supportMissCount,
    roleErrorRate,
    acceptedServiceFraction,
    observedLoss: loss,
  };
}

function safeCounter(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

function closeNumber(left, right) {
  return Math.abs(left - right) <= 1e-12 * Math.max(1, Math.abs(left), Math.abs(right));
}

function policyOutputFailureSignal(policy, world, config) {
  const counters = [
    policy?.messages,
    policy?.memoryReads,
    policy?.memoryWrites,
    policy?.rollbackCount,
    policy?.memoryAbstentionCount,
    policy?.solverRounds,
  ];
  const labels = Array.isArray(policy?.labels) ? policy.labels : [];
  if (
    labels.some((label) => !Number.isFinite(label))
    || counters.some((value) => !Number.isFinite(value))
  ) return "non-finite-policy-output";
  const woundedIds = world.nodes.filter((node) => node.wounded).map((node) => node.id);
  const survivorIds = new Set(world.nodes.filter((node) => !node.wounded).map((node) => node.id));
  const trustedIds = Array.isArray(policy?.trustedMemoryIds) ? policy.trustedMemoryIds : [];
  const maximumMessages = Math.floor(config.message_budget_per_arm_bytes / config.bytes_per_message);
  const failureReasonValid = (
    policy?.failureReason === null
      && policy?.converged === true
      && policy?.messages <= maximumMessages
      && policy?.solverRounds <= config.max_solver_rounds
  ) || (
    policy?.failureReason === "message-budget-exhausted"
      && policy?.converged === false
      && policy?.messages > maximumMessages
  ) || (
    policy?.failureReason === "solver-nonconvergence"
      && policy?.converged === false
      && policy?.messages <= maximumMessages
      && policy?.solverRounds === config.max_solver_rounds
  );
  if (
    !Array.isArray(policy?.labels)
    || policy.labels.length !== world.nodes.length
    || policy.labels.some((label) => !Number.isSafeInteger(label) || label < -1 || label > 3)
    || !Array.isArray(policy?.woundedIds)
    || policy.woundedIds.some((id) => !Number.isSafeInteger(id) || id < 0)
    || canonical(policy.woundedIds) !== canonical(woundedIds)
    || !Array.isArray(policy?.trustedMemoryIds)
    || new Set(trustedIds).size !== trustedIds.length
    || trustedIds.some((id) => !Number.isSafeInteger(id) || !survivorIds.has(id))
    || counters.some((value) => !Number.isSafeInteger(value) || value < 0)
    || typeof policy?.fallbackInvoked !== "boolean"
    || typeof policy?.corruptionDetected !== "boolean"
    || typeof policy?.converged !== "boolean"
    || policy.memoryAbstentionCount > world.nodes.length - woundedIds.length
    || policy.solverRounds > config.max_solver_rounds
    || !failureReasonValid
  ) return "invalid-policy-output";
  return null;
}

function evaluatorOutputFailureSignal(evaluated, world, policy, config) {
  const values = [
    evaluated?.accepted,
    evaluated?.wrongRoleCount,
    evaluated?.unsafeWriteCount,
    evaluated?.supportMissCount,
    evaluated?.roleErrorRate,
    evaluated?.acceptedServiceFraction,
    evaluated?.observedLoss,
  ];
  if (values.some((value) => !Number.isFinite(value))) return "non-finite-evaluator-output";
  const attempted = world.nodes.filter((node) => node.wounded).length;
  const survivors = world.nodes.length - attempted;
  const integers = [
    evaluated.accepted,
    evaluated.wrongRoleCount,
    evaluated.unsafeWriteCount,
    evaluated.supportMissCount,
  ];
  const derivedRoleError = (
    evaluated.wrongRoleCount + attempted - evaluated.accepted
  ) / attempted;
  const derivedService = evaluated.accepted / attempted;
  const derivedLoss = Math.min(
    config.max_loss,
    40 * derivedRoleError
      + 30 * (1 - derivedService)
      + 20 * (evaluated.wrongRoleCount / attempted)
      + 10 * (evaluated.unsafeWriteCount / Math.max(1, policy.memoryWrites)),
  );
  if (
    integers.some((value) => !Number.isSafeInteger(value) || value < 0)
    || evaluated.accepted > attempted
    || evaluated.wrongRoleCount > evaluated.accepted
    || evaluated.unsafeWriteCount > policy.memoryWrites
    || evaluated.supportMissCount > survivors
    || evaluated.roleErrorRate < 0
    || evaluated.roleErrorRate > 1
    || evaluated.acceptedServiceFraction < 0
    || evaluated.acceptedServiceFraction > 1
    || evaluated.observedLoss < 0
    || evaluated.observedLoss > config.max_loss
    || !closeNumber(evaluated.roleErrorRate, derivedRoleError)
    || !closeNumber(evaluated.acceptedServiceFraction, derivedService)
    || !closeNumber(evaluated.observedLoss, derivedLoss)
  ) return "invalid-evaluator-output";
  return null;
}

function maximumChargedResources(nodesTotal, config) {
  const maximumMessages = Math.floor(
    config.message_budget_per_arm_bytes / config.bytes_per_message,
  );
  return {
    messagesCount: maximumMessages,
    messageBytes: maximumMessages * config.bytes_per_message,
    memoryReads: nodesTotal * (1 + 4 * config.max_solver_rounds),
    memoryWrites: config.memory_write_budget_per_arm,
    solverRounds: config.max_solver_rounds,
  };
}

function incompleteFailureMetrics(world, policy, reason, stage, signal) {
  const resourceComplete = stage === "evaluator";
  return {
    accepted: 0,
    wrongRoleCount: 0,
    unsafeWriteCount: 0,
    supportMissCount: 0,
    memoryAbstentionCount: safeCounter(policy?.memoryAbstentionCount),
    fallbackInvoked: typeof policy?.fallbackInvoked === "boolean" ? policy.fallbackInvoked : false,
    corruptionDetected: typeof policy?.corruptionDetected === "boolean"
      ? policy.corruptionDetected
      : false,
    roleErrorRate: 1,
    acceptedServiceFraction: 0,
    messages: safeCounter(policy?.messages),
    memoryReads: safeCounter(policy?.memoryReads),
    memoryWrites: safeCounter(policy?.memoryWrites),
    rollbackCount: safeCounter(policy?.rollbackCount),
    solverRounds: safeCounter(policy?.solverRounds),
    converged: typeof policy?.converged === "boolean" ? policy.converged : false,
    failure: true,
    failureReason: reason,
    failureDetail: {
      stage,
      signal,
      outcome_observation_complete: false,
      resource_observation_complete: resourceComplete,
    },
    observedLoss: null,
    loss: 100,
    chargedResources: maximumChargedResources(world.nodes.length, world.config),
  };
}

function completeMetrics(world, policy, evaluated, config) {
  let failureReason = policy.failureReason;
  if (policy.memoryWrites > config.memory_write_budget_per_arm && failureReason === null) {
    failureReason = "memory-write-budget-exhausted";
  }
  const failureDetails = {
    "message-budget-exhausted": {
      stage: "policy",
      signal: "message-attempt-exceeds-cap",
      outcome_observation_complete: true,
      resource_observation_complete: true,
    },
    "memory-write-budget-exhausted": {
      stage: "policy",
      signal: "memory-write-count-exceeds-cap",
      outcome_observation_complete: true,
      resource_observation_complete: true,
    },
    "solver-nonconvergence": {
      stage: "policy",
      signal: "maximum-rounds-without-convergence",
      outcome_observation_complete: true,
      resource_observation_complete: true,
    },
  };
  const failure = failureReason !== null;
  return {
    ...evaluated,
    memoryAbstentionCount: policy.memoryAbstentionCount,
    fallbackInvoked: policy.fallbackInvoked,
    corruptionDetected: policy.corruptionDetected,
    messages: policy.messages,
    memoryReads: policy.memoryReads,
    memoryWrites: policy.memoryWrites,
    rollbackCount: policy.rollbackCount,
    solverRounds: policy.solverRounds,
    converged: policy.converged,
    failure,
    failureReason,
    failureDetail: failure ? failureDetails[failureReason] : {
      stage: null,
      signal: null,
      outcome_observation_complete: true,
      resource_observation_complete: true,
    },
    loss: failure ? 100 : evaluated.observedLoss,
    chargedResources: failure ? maximumChargedResources(world.nodes.length, config) : {
      messagesCount: policy.messages,
      messageBytes: policy.messages * config.bytes_per_message,
      memoryReads: policy.memoryReads,
      memoryWrites: policy.memoryWrites,
      solverRounds: policy.solverRounds,
    },
  };
}

function simulateWorkUnit(unit, inputs, identity, runtime = {}) {
  const { world, arm } = unit;
  const worldWithConfig = { ...world, config: inputs.config };
  let policy;
  try {
    policy = (runtime.policy ?? runPolicy)(world, arm, inputs.config);
  } catch {
    policy = null;
  }
  let metrics;
  if (policy === null) {
    metrics = incompleteFailureMetrics(
      worldWithConfig,
      null,
      "policy-exception",
      "policy",
      "policy-threw",
    );
  } else if (policyOutputFailureSignal(policy, world, inputs.config) !== null) {
    metrics = incompleteFailureMetrics(
      worldWithConfig,
      policy,
      "numerical-failure",
      "policy",
      policyOutputFailureSignal(policy, world, inputs.config),
    );
  } else {
    let evaluated;
    try {
      evaluated = (runtime.evaluator ?? evaluatePolicy)(world, arm, policy, inputs.config);
    } catch {
      evaluated = null;
    }
    if (evaluated === null) {
      metrics = incompleteFailureMetrics(
        worldWithConfig,
        policy,
        "evaluator-exception",
        "evaluator",
        "evaluator-threw",
      );
    } else if (evaluatorOutputFailureSignal(evaluated, world, policy, inputs.config) !== null) {
      metrics = incompleteFailureMetrics(
        worldWithConfig,
        policy,
        "numerical-failure",
        "evaluator",
        evaluatorOutputFailureSignal(evaluated, world, policy, inputs.config),
      );
    } else {
      metrics = completeMetrics(world, policy, evaluated, inputs.config);
    }
  }
  return {
    schema: 1,
    contract_version: FIXTURE_022_EVENT_CONTRACT_VERSION,
    artifact: "fixture-022",
    track: "DEV-T01",
    run_id: identity.run_id,
    profile: inputs.profile,
    pack: "public-development",
    seed: unit.seed,
    world_index: world.world_index,
    world_id: world.world_id,
    corruption_family: world.corruption_family,
    arm,
    attempt: 0,
    units: { node: "node", count: "count", message: "B", fraction: "1" },
    input_sha256: identity.input_sha256,
    observation_sha256: world.observation_sha256,
    budget: {
      max_solver_rounds: inputs.config.max_solver_rounds,
      bytes_per_message: inputs.config.bytes_per_message,
      message_budget_bytes: inputs.config.message_budget_per_arm_bytes,
      memory_write_budget: inputs.config.memory_write_budget_per_arm,
    },
    budget_equal_by_contract: true,
    hidden_truth_exposed: false,
    nodes_total: world.nodes.length,
    wounded_nodes: world.nodes.filter((node) => node.wounded).length,
    attempted_tasks: world.nodes.filter((node) => node.wounded).length,
    accepted_tasks: metrics.accepted,
    wrong_role_count: metrics.wrongRoleCount,
    unsafe_write_count: metrics.unsafeWriteCount,
    support_miss_count: metrics.supportMissCount,
    memory_abstention_count: metrics.memoryAbstentionCount,
    fallback_invoked: metrics.fallbackInvoked,
    corruption_detected: metrics.corruptionDetected,
    role_error_rate: metrics.roleErrorRate,
    accepted_service_fraction: metrics.acceptedServiceFraction,
    messages_count: metrics.messages,
    message_bytes: metrics.messages * inputs.config.bytes_per_message,
    memory_reads: metrics.memoryReads,
    memory_writes: metrics.memoryWrites,
    rollback_count: metrics.rollbackCount,
    solver_rounds: metrics.solverRounds,
    converged: metrics.converged,
    failure: metrics.failure,
    failure_reason: metrics.failureReason,
    failure_detail: metrics.failureDetail,
    observed_loss: metrics.observedLoss,
    loss: metrics.loss,
    charged_resources: {
      messages_count: metrics.chargedResources.messagesCount,
      message_bytes: metrics.chargedResources.messageBytes,
      memory_reads: metrics.chargedResources.memoryReads,
      memory_writes: metrics.chargedResources.memoryWrites,
      solver_rounds: metrics.chargedResources.solverRounds,
    },
    status: "development-smoke-only",
    measured_energy_present: false,
    energy_conclusion_allowed: false,
    claim_eligible: false,
    scientific_result: false,
    performance_result: false,
  };
}

export {
  runPolicy as runFixture022Policy,
  simulateWorkUnit as simulateFixture022WorkUnit,
};

export async function executeFixture022({
  profile,
  output,
  resume = false,
  maxWorkUnits = Infinity,
  runtime = {},
}) {
  if (!Number.isFinite(maxWorkUnits) && maxWorkUnits !== Infinity) {
    throw new Error("maxWorkUnits must be finite or Infinity.");
  }
  if (maxWorkUnits !== Infinity && (!Number.isSafeInteger(maxWorkUnits) || maxWorkUnits < 1)) {
    throw new Error("maxWorkUnits must be a positive integer.");
  }
  const inputs = await loadInputs(profile);
  const identity = runIdentity(inputs);
  const units = allWorkUnits(inputs);
  const directory = outputDirectory(output);
  const alreadyExists = await exists(directory);
  if (alreadyExists && !resume) throw new Error("Fixture 022 output already exists; use --resume true.");
  if (!alreadyExists && resume) throw new Error("Fixture 022 cannot resume a missing output directory.");
  if (!alreadyExists) {
    await mkdir(path.dirname(directory), { recursive: true });
    await mkdir(directory);
  } else if (!(await stat(directory)).isDirectory()) {
    throw new Error("Fixture 022 output is not a directory.");
  }
  const rawPath = path.join(directory, "raw-events.jsonl");
  const checkpointPath = path.join(directory, "checkpoint.json");
  await readOptionalCheckpoint(checkpointPath, identity);
  const ledger = await openCheckpointLedger({
    artifact: "fixture-022",
    ledgerFormat,
    rawPath,
    checkpointPath,
    runIdentity: identity,
    scientificPayload: fixture022ScientificPayload,
    workKey: fixture022WorkKey,
    assertRecord: contextualRecordValidator(identity),
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
  await ledger.saveCheckpoint();
  const complete = ledger.summary().completed_work_units === units.length;
  if (!complete) {
    return Object.freeze({ directory, complete: false, run_id: identity.run_id, ledger: ledger.summary() });
  }
  const run = {
    ...identity,
    expected_work_units: units.length,
    expected_worlds: units.length / FIXTURE_022_ARMS.length,
    expected_work_order_sha256: sha256Hex(canonicalize(units.map(workUnitKey))),
    ledger: ledger.summary(),
    raw_path: path.relative(repositoryRoot, rawPath).replaceAll("\\", "/"),
    checkpoint_path: path.relative(repositoryRoot, checkpointPath).replaceAll("\\", "/"),
    measured_energy_present: false,
    energy_conclusion_allowed: false,
    claim_eligible: false,
    scientific_result: false,
    performance_result: false,
    interpretation: "NO_RESULT: development-only DEV-T01 smoke plumbing; no comparison is claim-eligible.",
  };
  await writeRunDocument(path.join(directory, "run.json"), run, { resume });
  return Object.freeze({ directory, complete: true, run });
}

async function readValidatedRecords(directory, identity) {
  const rawPath = path.join(directory, "raw-events.jsonl");
  const text = await readFile(rawPath, "utf8");
  if (text.length > 0 && !text.endsWith("\n")) throw new Error("Fixture 022 raw ledger has a torn trailing record.");
  const lines = text.split(/\r?\n/u).filter(Boolean);
  const records = [];
  const seen = new Set();
  let previousHash = "0".repeat(64);
  const payloadDigest = createHash("sha256");
  for (const [sequence, line] of lines.entries()) {
    const record = JSON.parse(line);
    assertFixture022Record(record, { sequence, previousHash, context: identity });
    const key = fixture022WorkKey(record);
    if (seen.has(key)) throw new Error(`Duplicate Fixture 022 work unit ${key}.`);
    seen.add(key);
    payloadDigest.update(canonicalize(fixture022ScientificPayload(record)));
    previousHash = record.integrity.record_sha256;
    records.push(record);
  }
  return Object.freeze({
    records: Object.freeze(records),
    terminalHash: previousHash,
    scientificPayloadSha256: payloadDigest.digest("hex"),
    rawSha256: createHash("sha256").update(text).digest("hex"),
  });
}

function sum(rows, field) {
  return rows.reduce((total, row) => total + row[field], 0);
}

function armFamilyMetrics(records) {
  const metrics = {};
  for (const arm of FIXTURE_022_ARMS) {
    metrics[arm] = {};
    for (const family of FIXTURE_022_CORRUPTION_FAMILIES) {
      const rows = records.filter((record) => record.arm === arm && record.corruption_family === family);
      metrics[arm][family] = {
        records: rows.length,
        attempted_tasks: sum(rows, "attempted_tasks"),
        accepted_tasks: sum(rows, "accepted_tasks"),
        wrong_role_count: sum(rows, "wrong_role_count"),
        unsafe_write_count: sum(rows, "unsafe_write_count"),
        fallback_count: rows.filter((row) => row.fallback_invoked).length,
        memory_abstention_count: sum(rows, "memory_abstention_count"),
        message_bytes: sum(rows, "message_bytes"),
        memory_writes: sum(rows, "memory_writes"),
        observed_loss_records: rows.filter((row) => row.observed_loss !== null).length,
        observed_loss: sum(rows.filter((row) => row.observed_loss !== null), "observed_loss"),
        charged_loss: sum(rows, "loss"),
        charged_message_bytes: rows.reduce((total, row) => total + row.charged_resources.message_bytes, 0),
        charged_memory_writes: rows.reduce((total, row) => total + row.charged_resources.memory_writes, 0),
        failures: rows.filter((row) => row.failure).length,
        failure_reasons: Object.fromEntries([...new Set(
          rows.filter((row) => row.failure).map((row) => row.failure_reason),
        )].sort().map((reason) => [reason, rows.filter((row) => row.failure_reason === reason).length])),
      };
    }
  }
  return metrics;
}

function exactObjectKeys(value, keys) {
  return value
    && typeof value === "object"
    && !Array.isArray(value)
    && canonical(Object.keys(value).sort()) === canonical([...keys].sort());
}

function assertEmbeddedRunIdentity(run, identity, expectedUnits, directory) {
  const extraKeys = [
    "expected_work_units",
    "expected_worlds",
    "expected_work_order_sha256",
    "ledger",
    "raw_path",
    "checkpoint_path",
    "measured_energy_present",
    "energy_conclusion_allowed",
    "claim_eligible",
    "scientific_result",
    "performance_result",
    "interpretation",
  ];
  if (!exactObjectKeys(run, [...Object.keys(identity), ...extraKeys])) {
    throw new Error("Fixture 022 run document has missing or unknown fields.");
  }
  const embeddedIdentity = Object.fromEntries(
    Object.keys(identity).map((key) => [key, run[key]]),
  );
  if (canonical(embeddedIdentity) !== canonical(identity)) {
    throw new Error("Fixture 022 embedded run identity differs from current frozen inputs.");
  }
  const expectedRawPath = path.relative(
    repositoryRoot,
    path.join(directory, "raw-events.jsonl"),
  ).replaceAll("\\", "/");
  const expectedCheckpointPath = path.relative(
    repositoryRoot,
    path.join(directory, "checkpoint.json"),
  ).replaceAll("\\", "/");
  if (
    run.expected_work_units !== expectedUnits.length
    || run.expected_worlds !== expectedUnits.length / FIXTURE_022_ARMS.length
    || run.expected_work_order_sha256 !== sha256Hex(canonicalize(expectedUnits.map(workUnitKey)))
    || run.raw_path !== expectedRawPath
    || run.checkpoint_path !== expectedCheckpointPath
    || run.measured_energy_present !== false
    || run.energy_conclusion_allowed !== false
    || run.claim_eligible !== false
    || run.scientific_result !== false
    || run.performance_result !== false
    || run.interpretation !== "NO_RESULT: development-only DEV-T01 smoke plumbing; no comparison is claim-eligible."
  ) throw new Error("Fixture 022 run document disagrees with derived completion state.");
}

function assertCanonicalWorkSequence(records, units, inputs, identity, { complete }) {
  if (records.length > units.length || (complete && records.length !== units.length)) {
    throw new Error("Fixture 022 raw ledger does not contain the complete canonical work sequence.");
  }
  for (let index = 0; index < records.length; index += 1) {
    const expected = simulateWorkUnit(units[index], inputs, identity);
    const actual = fixture022ScientificPayload(records[index]);
    const transientFailure = actual.failure && new Set([
      "policy-exception",
      "evaluator-exception",
      "numerical-failure",
    ]).has(actual.failure_reason);
    const invariantKeys = [
      "schema",
      "contract_version",
      "artifact",
      "track",
      "run_id",
      "profile",
      "pack",
      "seed",
      "world_index",
      "world_id",
      "corruption_family",
      "arm",
      "attempt",
      "units",
      "input_sha256",
      "observation_sha256",
      "budget",
      "budget_equal_by_contract",
      "hidden_truth_exposed",
      "nodes_total",
      "wounded_nodes",
      "attempted_tasks",
      "status",
      "measured_energy_present",
      "energy_conclusion_allowed",
      "claim_eligible",
      "scientific_result",
      "performance_result",
    ];
    const actualComparable = transientFailure
      ? Object.fromEntries(invariantKeys.map((key) => [key, actual[key]]))
      : actual;
    const expectedComparable = transientFailure
      ? Object.fromEntries(invariantKeys.map((key) => [key, expected[key]]))
      : expected;
    if (canonical(actualComparable) !== canonical(expectedComparable)) {
      throw new Error(`Fixture 022 canonical work content or order mismatch at sequence ${index}.`);
    }
  }
}

function groupedWorlds(records) {
  const groups = new Map();
  for (const record of records) {
    const key = `${record.seed}:${record.world_index}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(record);
  }
  return [...groups.values()];
}

export async function computeFixture022Analysis(output) {
  const directory = outputDirectory(output);
  const run = await loadJson(path.join(directory, "run.json"));
  const inputs = await loadInputs(run.profile);
  const identity = runIdentity(inputs);
  const expectedUnits = allWorkUnits(inputs);
  assertEmbeddedRunIdentity(run, identity, expectedUnits, directory);
  await readOptionalCheckpoint(path.join(directory, "checkpoint.json"), identity);
  const [raw, ledger] = await Promise.all([
    readValidatedRecords(directory, identity),
    openCheckpointLedger({
      artifact: "fixture-022",
      ledgerFormat,
      rawPath: path.join(directory, "raw-events.jsonl"),
      checkpointPath: path.join(directory, "checkpoint.json"),
      runIdentity: identity,
      scientificPayload: fixture022ScientificPayload,
      workKey: fixture022WorkKey,
      assertRecord: contextualRecordValidator(identity),
    }),
  ]);
  const ledgerSummary = ledger.summary();
  assertCanonicalWorkSequence(raw.records, expectedUnits, inputs, identity, { complete: true });
  if (
    canonical(run.ledger) !== canonical(ledgerSummary)
    || ledgerSummary.records !== expectedUnits.length
    || ledgerSummary.completed_work_units !== expectedUnits.length
    || ledgerSummary.scientific_payload_sha256 !== raw.scientificPayloadSha256
    || ledgerSummary.hash_chain_sha256 !== raw.terminalHash
    || ledgerSummary.checkpoint_status !== "current"
  ) throw new Error("Fixture 022 run, checkpoint, and raw ledger disagree.");
  const groups = groupedWorlds(raw.records);
  const commonGroups = groups.filter((rows) => rows[0].corruption_family === "common-mode-shift");
  const commonProposalRows = raw.records.filter((record) => (
    record.arm === "gated-memory-with-null-fallback"
    && record.corruption_family === "common-mode-shift"
  ));
  const validProposalRows = raw.records.filter((record) => (
    record.arm === "gated-memory-with-null-fallback"
    && record.corruption_family === "valid"
  ));
  const checks = {
    expected_development_records_present: raw.records.length === expectedUnits.length,
    every_world_has_all_three_arms: groups.length === expectedUnits.length / FIXTURE_022_ARMS.length
      && groups.every((rows) => rows.length === FIXTURE_022_ARMS.length
        && new Set(rows.map((row) => row.arm)).size === FIXTURE_022_ARMS.length),
    observations_and_budgets_equal_within_world: groups.every((rows) => (
      new Set(rows.map((row) => row.observation_sha256)).size === 1
      && new Set(rows.map((row) => canonical(row.budget))).size === 1
      && rows.every((row) => row.budget_equal_by_contract)
    )),
    corruption_families_balanced: FIXTURE_022_CORRUPTION_FAMILIES.every((family) => (
      raw.records.filter((row) => row.corruption_family === family).length
      === raw.records.length / FIXTURE_022_CORRUPTION_FAMILIES.length
    )),
    common_mode_exercises_abstention_and_null_fallback: commonProposalRows.length > 0
      && commonProposalRows.every((row) => (
        row.corruption_detected
        && row.fallback_invoked
        && row.memory_abstention_count === row.nodes_total - row.wounded_nodes
      )),
    common_mode_fallback_cost_is_charged: commonGroups.every((rows) => {
      const proposal = rows.find((row) => row.arm === "gated-memory-with-null-fallback");
      const nullArm = rows.find((row) => row.arm === "robust-propagation-null");
      return proposal.charged_resources.message_bytes >= nullArm.charged_resources.message_bytes;
    }),
    valid_memory_has_no_false_fallback: validProposalRows.length > 0
      && validProposalRows.every((row) => (
        !row.corruption_detected
        && !row.fallback_invoked
        && row.memory_abstention_count === 0
      )),
    protected_denominators_and_caps_are_retained: raw.records.every((row) => (
      row.attempted_tasks === row.wounded_nodes
      && row.accepted_tasks <= row.attempted_tasks
      && (row.failure || (
        row.message_bytes <= row.budget.message_budget_bytes
        && row.memory_writes <= row.budget.memory_write_budget
        && row.solver_rounds <= row.budget.max_solver_rounds
      ))
    )),
    failures_are_retained_with_finite_maximum_charge: raw.records.every((row) => (
      Number.isFinite(row.loss)
      && (!row.failure || (
        row.loss === 100
        && row.charged_resources.memory_writes === row.budget.memory_write_budget
        && row.charged_resources.solver_rounds === row.budget.max_solver_rounds
        && row.charged_resources.message_bytes <= row.budget.message_budget_bytes
      ))
    )),
    authority_boundary_is_uniform: raw.records.every((row) => (
      row.hidden_truth_exposed === false
      && row.measured_energy_present === false
      && row.energy_conclusion_allowed === false
      && row.claim_eligible === false
      && row.scientific_result === false
      && row.performance_result === false
    )),
  };
  const passed = Object.values(checks).every(Boolean);
  return {
    schema: 1,
    artifact: "fixture-022",
    track: "DEV-T01",
    contract_version: "fixture-022.dev-t01-analysis.v3",
    run_id: run.run_id,
    profile: run.profile,
    raw_events_sha256: raw.rawSha256,
    run_sha256: sha256(canonical(run)),
    metrics: armFamilyMetrics(raw.records),
    checks,
    decision: passed ? "diagnostic-pass" : "diagnostic-fail",
    comparison_inference_permitted: false,
    confirmation_partition_present: false,
    transfer_partition_present: false,
    measured_energy_present: false,
    energy_conclusion_allowed: false,
    claim_eligible: false,
    scientific_result: false,
    performance_result: false,
    protocol_outcome: "NO_RESULT",
    no_result: true,
    interpretation: "NO_RESULT: development-only DEV-T01 smoke validation of balanced corruption paths, equal caps, protected denominators, null fallback accounting, and corruption-evident resume.",
  };
}

export async function analyzeFixture022(output) {
  const directory = outputDirectory(output);
  const summary = await computeFixture022Analysis(output);
  await mkdir(path.join(directory, "analysis"), { recursive: true });
  await writeJsonStable(path.join(directory, "analysis", "summary.json"), summary);
  if (summary.decision !== "diagnostic-pass") throw new Error("Fixture 022 development smoke diagnostics failed.");
  return summary;
}

export async function validateFixture022Output(output) {
  const directory = outputDirectory(output);
  const [expected, stored] = await Promise.all([
    computeFixture022Analysis(output),
    loadJson(path.join(directory, "analysis", "summary.json")),
  ]);
  if (canonical(expected) !== canonical(stored)) {
    throw new Error("Fixture 022 stored analysis is not reproducible from raw events.");
  }
  if (
    stored.comparison_inference_permitted !== false
    || stored.confirmation_partition_present !== false
    || stored.transfer_partition_present !== false
    || stored.energy_conclusion_allowed !== false
    || stored.claim_eligible !== false
    || stored.scientific_result !== false
    || stored.performance_result !== false
    || stored.protocol_outcome !== "NO_RESULT"
    || stored.no_result !== true
  ) throw new Error("Fixture 022 smoke output attempts to claim scientific authority.");
  return Object.freeze({
    valid: true,
    run_id: stored.run_id,
    decision: stored.decision,
    protocol_outcome: "NO_RESULT",
    no_result: true,
  });
}

export async function prepareFixture022(profile) {
  const inputs = await loadInputs(profile);
  const worldsPerSeed = inputs.config.worlds_per_corruption_family
    * FIXTURE_022_CORRUPTION_FAMILIES.length;
  return Object.freeze({
    valid: true,
    artifact: "fixture-022",
    track: "DEV-T01",
    profile,
    partition: "public-development-only",
    seeds: inputs.seeds.length,
    worlds_per_seed: worldsPerSeed,
    work_units: inputs.seeds.length * worldsPerSeed * FIXTURE_022_ARMS.length,
    confirmation_seeds_created: false,
    transfer_seeds_created: false,
    measured_energy_required: false,
    energy_conclusion_allowed: false,
    claim_eligible: false,
    protocol_outcome: "NO_RESULT",
    no_result: true,
  });
}

export async function main(argv = process.argv) {
  const { action, options } = parseOptions(argv);
  if (action === "prepare") return prepareFixture022(options.profile);
  if (action === "smoke") {
    await executeFixture022({
      profile: options.profile,
      output: options.output,
      resume: options.resume === "true",
    });
    await analyzeFixture022(options.output);
    return validateFixture022Output(options.output);
  }
  if (action === "run") {
    return executeFixture022({
      profile: options.profile,
      output: options.output,
      resume: options.resume === "true",
    });
  }
  if (action === "analyze") return analyzeFixture022(options.output);
  return validateFixture022Output(options.output);
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
