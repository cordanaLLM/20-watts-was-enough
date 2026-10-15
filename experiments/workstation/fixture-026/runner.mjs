import { createHash } from "node:crypto";
import {
  access,
  mkdir,
  readFile,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { endianness, release } from "node:os";
import { fileURLToPath } from "node:url";

import {
  canonicalize,
  openCheckpointLedger,
  remainingWorkUnits,
  sha256Hex,
} from "../lib/checkpoint-ledger.mjs";
import {
  FIXTURE_026_ARMS,
  FIXTURE_026_EVENT_CONTRACT_VERSION,
  FIXTURE_026_EVENT_INTERPRETATION,
  assertFixture026Record,
  canonical,
  fixture026ScientificPayload,
  fixture026WorkKey,
  sha256,
} from "./contract.mjs";
import {
  FIXTURE_026_GENERATOR_VERSION,
  FIXTURE_026_RNG_CONTRACT,
  FIXTURE_026_HISTORY_FAMILIES,
  FIXTURE_026_MALFORMED_SENTINELS,
  FIXTURE_026_VALID_FAMILIES,
  FIXTURE_026_VALID_CELLS_PER_SEED,
  assertPolicyViewFirewall,
  buildPolicyView,
  computeTrajectoryDiagnostics,
  generateFixture026World,
  parseFixture026PublicSeed,
  validateFixture026Config,
} from "./generator.mjs";
import {
  FIXTURE_026_IMPLEMENTED_TRACKS,
  FIXTURE_026_TRACK_IDS,
  assertFixture026Registry,
  extractFixture026Registry,
} from "./registry.mjs";
import { mainFixture026RsdT02 } from "./rsd-t02-runner.mjs";

export const FIXTURE_026_RUNNER_VERSION = "fixture-026.rsd-t01-runner.v2";
export const FIXTURE_026_RUNTIME_FINGERPRINT = Object.freeze({
  schema: 2,
  node_version: process.versions.node,
  v8_version: process.versions.v8,
  uv_version: process.versions.uv,
  platform: process.platform,
  architecture: process.arch,
  endianness: endianness(),
  os_release: release(),
  numeric_model: "IEEE-754 binary64 via Node/V8 Number",
  math_boundary: "Node/V8 Math.sin and Math.log implementation supplied by this runtime fingerprint",
});

const fixtureRoot = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(fixtureRoot, "../../..");
const ledgerFormat = "fixture-026.rsd-t01-ledger.v2";
const RAW_FILE = "raw-events.jsonl";
const CHECKPOINT_FILE = "checkpoint.json";
const RUN_FILE = "run.json";
const FIXTURE_026_RUN_INTERPRETATION = "NO_RESULT: public-development RSD-T01 runner integrity and generator-family diagnostic plumbing only.";
const FIXTURE_026_RUN_IDENTITY_KEYS = Object.freeze([
  "schema", "artifact", "track", "claim_scope", "runner_version", "generator_version",
  "rng_contract", "runtime_fingerprint", "runtime_fingerprint_sha256",
  "event_contract_version", "ledger_format", "profile", "config", "config_sha256",
  "seeds", "development_seed_document_sha256", "confirmation_absence_sha256",
  "transfer_absence_sha256", "arms", "source_hashes", "input_sha256", "partition",
  "execution_mode", "gpu_permitted", "confirmation_seed_state", "transfer_seed_state",
  "result_label", "no_result", "claim_eligible", "comparison_inference_permitted",
  "scientific_result", "performance_result", "measured_energy_present",
  "energy_conclusion_allowed", "run_id",
]);
const FIXTURE_026_RUN_LEDGER_KEYS = Object.freeze([
  "records", "scientific_payload_sha256", "hash_chain_sha256",
  "completed_work_units", "checkpoint_status",
]);
const FIXTURE_026_RUN_KEYS = Object.freeze([
  ...FIXTURE_026_RUN_IDENTITY_KEYS,
  "expected_work_units", "ledger", "raw_path", "checkpoint_path", "interpretation",
]);
const sourceFiles = Object.freeze([
  "../lib/checkpoint-ledger.mjs",
  "contract.mjs",
  "generator.mjs",
  "registry.mjs",
  "output.schema.json",
  "runner.mjs",
  "../../fixtures/026-interface-qualified-relative-sensing.md",
  "../../../research/audits/2026-08-25-relative-sensing-scale-symmetry.md",
  "../../../math/interface-qualified-scale-symmetry.md",
  "seeds/confirmation.unavailable.json",
  "seeds/transfer.unavailable.json",
]);

function isInside(root, target) {
  const relative = path.relative(root, target);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function exactKeys(value, keys) {
  return value
    && typeof value === "object"
    && !Array.isArray(value)
    && Object.keys(value).length === keys.length
    && keys.every((key) => Object.hasOwn(value, key));
}

function canonicalRepositoryPath(file) {
  const relative = path.relative(repositoryRoot, file);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Fixture 026 artifact path must stay inside the repository.");
  }
  return relative.replaceAll("\\", "/");
}

function parseOptions(argv) {
  const action = argv[2];
  if (!new Set(["prepare", "smoke", "run", "analyze", "validate"]).has(action)) {
    throw new Error("Fixture 026 action must be prepare, smoke, run, analyze, or validate; private partitions are not executable.");
  }
  if ((argv.length - 3) % 2 !== 0) throw new Error("Options require explicit --name value pairs.");
  const options = {};
  for (let index = 3; index < argv.length; index += 2) {
    const token = argv[index];
    const value = argv[index + 1];
    if (!/^--[a-z][a-z-]*$/.test(token ?? "") || !value || value.startsWith("--")) {
      throw new Error("Fixture 026 options require explicit --name value pairs.");
    }
    const key = token.slice(2);
    if (!new Set(["profile", "output", "resume"]).has(key) || Object.hasOwn(options, key)) {
      throw new Error(`Unknown or duplicate Fixture 026 option --${key}.`);
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

function outputDirectory(value) {
  const resolved = path.resolve(repositoryRoot, value);
  if (!isInside(repositoryRoot, resolved) || resolved === repositoryRoot) {
    throw new Error("Fixture 026 output must stay inside the repository.");
  }
  return resolved;
}

function validateDevelopmentSeeds(document) {
  if (
    document?.schema !== 2
    || document.artifact !== "fixture-026"
    || document.partition !== "development"
    || document.state !== "public-development"
    || document.algorithm !== "literal-public-seed-list-v2"
    || document.encoding !== "unsigned-little-endian-uint64"
    || !Array.isArray(document.seeds)
    || document.seeds.length < 2
    || document.seeds.some((seed) => {
      try {
        parseFixture026PublicSeed(seed);
        return false;
      } catch {
        return true;
      }
    })
    || new Set(document.seeds).size !== document.seeds.length
  ) throw new Error("Fixture 026 development seed document is invalid.");
  return document;
}

function validateUnavailable(document, partition) {
  if (
    document?.schema !== 1
    || document.artifact !== "fixture-026"
    || document.partition !== partition
    || document.state !== "not-created"
    || document.contains_seeds !== false
    || document.contains_commitment !== false
    || document.result_label !== "NO_RESULT"
  ) throw new Error(`Fixture 026 ${partition} absence record is invalid.`);
  return document;
}

async function loadInputs(profile) {
  const configPath = path.join(fixtureRoot, "configs", `${profile}.json`);
  const seedsPath = path.join(fixtureRoot, "seeds", "development.reveal.json");
  const confirmationPath = path.join(fixtureRoot, "seeds", "confirmation.unavailable.json");
  const transferPath = path.join(fixtureRoot, "seeds", "transfer.unavailable.json");
  const fixturePath = path.join(repositoryRoot, "experiments", "fixtures", "026-interface-qualified-relative-sensing.md");
  const [config, seedDocument, confirmation, transfer, fixtureMarkdown] = await Promise.all([
    loadJson(configPath),
    loadJson(seedsPath),
    loadJson(confirmationPath),
    loadJson(transferPath),
    readFile(fixturePath, "utf8"),
  ]);
  validateFixture026Config(config);
  validateDevelopmentSeeds(seedDocument);
  validateUnavailable(confirmation, "confirmation");
  validateUnavailable(transfer, "held-out");
  assertFixture026Registry(extractFixture026Registry(fixtureMarkdown));
  if (config.profile !== profile) throw new Error("Fixture 026 profile/config mismatch.");
  const seeds = profile === "smoke" ? seedDocument.seeds.slice(0, 2) : seedDocument.seeds;
  const sourceEntries = await Promise.all(sourceFiles.map(async (relative) => {
    const absolute = path.resolve(fixtureRoot, relative);
    return [relative.replaceAll("\\", "/"), await fileSha256(absolute)];
  }));
  const immutableInputs = {
    audit: path.join(repositoryRoot, "research", "audits", "2026-08-25-relative-sensing-scale-symmetry.md"),
    fixture: fixturePath,
    math: path.join(repositoryRoot, "math", "interface-qualified-scale-symmetry.md"),
    contract: path.join(fixtureRoot, "contract.mjs"),
    generator: path.join(fixtureRoot, "generator.mjs"),
    runner: path.join(fixtureRoot, "runner.mjs"),
    analysis: path.join(fixtureRoot, "runner.mjs"),
    configuration: configPath,
    schema: path.join(fixtureRoot, "output.schema.json"),
    seed_pack: seedsPath,
  };
  const fileInputSha256 = Object.fromEntries(await Promise.all(
    Object.entries(immutableInputs).map(async ([key, file]) => [key, await fileSha256(file)]),
  ));
  const runtimeFingerprintSha256 = sha256(canonical(FIXTURE_026_RUNTIME_FINGERPRINT));
  const inputSha256 = Object.freeze({
    ...fileInputSha256,
    runtime: runtimeFingerprintSha256,
  });
  return Object.freeze({
    profile,
    config,
    configPath,
    configSha256: await fileSha256(configPath),
    seeds,
    seedsPath,
    seedsSha256: await fileSha256(seedsPath),
    confirmationSha256: await fileSha256(confirmationPath),
    transferSha256: await fileSha256(transferPath),
    sourceHashes: Object.freeze(Object.fromEntries(sourceEntries)),
    inputSha256,
    runtimeFingerprint: FIXTURE_026_RUNTIME_FINGERPRINT,
    runtimeFingerprintSha256,
  });
}

function runIdentity(inputs) {
  const body = {
    schema: 2,
    artifact: "fixture-026",
    track: "RSD-T01",
    claim_scope: ["C-1540"],
    runner_version: FIXTURE_026_RUNNER_VERSION,
    generator_version: FIXTURE_026_GENERATOR_VERSION,
    rng_contract: FIXTURE_026_RNG_CONTRACT,
    runtime_fingerprint: inputs.runtimeFingerprint,
    runtime_fingerprint_sha256: inputs.runtimeFingerprintSha256,
    event_contract_version: FIXTURE_026_EVENT_CONTRACT_VERSION,
    ledger_format: ledgerFormat,
    profile: inputs.profile,
    config: inputs.config,
    config_sha256: inputs.configSha256,
    seeds: inputs.seeds,
    development_seed_document_sha256: inputs.seedsSha256,
    confirmation_absence_sha256: inputs.confirmationSha256,
    transfer_absence_sha256: inputs.transferSha256,
    arms: FIXTURE_026_ARMS,
    source_hashes: inputs.sourceHashes,
    input_sha256: inputs.inputSha256,
    partition: "public-development-only",
    execution_mode: "deterministic-cpu-only",
    gpu_permitted: false,
    confirmation_seed_state: "not-created",
    transfer_seed_state: "not-created",
    result_label: "NO_RESULT",
    no_result: true,
    claim_eligible: false,
    comparison_inference_permitted: false,
    scientific_result: false,
    performance_result: false,
    measured_energy_present: false,
    energy_conclusion_allowed: false,
  };
  return Object.freeze({ ...body, run_id: sha256Hex(canonicalize(body)) });
}

function assertRunDocumentShape(run) {
  if (!exactKeys(run, FIXTURE_026_RUN_KEYS)) {
    throw new Error("Fixture 026 run document has missing or unknown fields.");
  }
  if (!exactKeys(run.ledger, FIXTURE_026_RUN_LEDGER_KEYS)) {
    throw new Error("Fixture 026 run ledger has missing or unknown fields.");
  }
  if (
    !new Set(["smoke", "development"]).has(run.profile)
    || !Number.isSafeInteger(run.expected_work_units)
    || run.expected_work_units < 1
    || !Number.isSafeInteger(run.ledger.records)
    || run.ledger.records < 0
    || !Number.isSafeInteger(run.ledger.completed_work_units)
    || run.ledger.completed_work_units < 0
    || !/^[0-9a-f]{64}$/u.test(run.ledger.scientific_payload_sha256)
    || !/^[0-9a-f]{64}$/u.test(run.ledger.hash_chain_sha256)
    || run.ledger.checkpoint_status !== "current"
    || typeof run.raw_path !== "string"
    || typeof run.checkpoint_path !== "string"
    || run.interpretation !== FIXTURE_026_RUN_INTERPRETATION
  ) throw new Error("Fixture 026 run document violates its closed type or authority contract.");
  return run;
}

function assertRunDocument(run, { identity, directory, expectedWorkUnits }) {
  assertRunDocumentShape(run);
  if (Object.entries(identity).some(([key, value]) => canonical(run[key]) !== canonical(value))) {
    throw new Error("Fixture 026 run identity differs from current frozen inputs, sources, or runtime fingerprint.");
  }
  if (
    run.expected_work_units !== expectedWorkUnits
    || run.ledger.records !== expectedWorkUnits
    || run.ledger.completed_work_units !== expectedWorkUnits
    || run.raw_path !== canonicalRepositoryPath(path.join(directory, RAW_FILE))
    || run.checkpoint_path !== canonicalRepositoryPath(path.join(directory, CHECKPOINT_FILE))
  ) throw new Error("Fixture 026 run counts or canonical artifact paths are invalid.");
  return run;
}

function allWorkUnits(inputs, identity) {
  const units = [];
  for (const seed of inputs.seeds) {
    for (let worldIndex = 0; worldIndex < inputs.config.worlds_per_seed; worldIndex += 1) {
      for (const arm of FIXTURE_026_ARMS) units.push(Object.freeze({
        run_id: identity.run_id,
        profile: inputs.profile,
        seed,
        world_index: worldIndex,
        arm,
      }));
    }
  }
  return Object.freeze(units);
}

function workUnitKey(unit) {
  return `${unit.run_id}:${unit.profile}:${unit.seed}:${unit.world_index}:${unit.arm}`;
}

function assertOrderedWorkKeys(records, inputs, identity) {
  const expected = allWorkUnits(inputs, identity).map(workUnitKey);
  const observed = records.map(fixture026WorkKey);
  if (
    expected.length !== observed.length
    || expected.some((key, index) => key !== observed[index])
  ) throw new Error("Fixture 026 ordered work-key sequence differs from the frozen public grid.");
  return records;
}

function assertOrderedWorkPrefix(records, inputs, identity) {
  const expected = allWorkUnits(inputs, identity).slice(0, records.length).map(workUnitKey);
  const observed = records.map(fixture026WorkKey);
  if (
    records.length > allWorkUnits(inputs, identity).length
    || expected.length !== observed.length
    || expected.some((key, index) => key !== observed[index])
  ) throw new Error("Fixture 026 existing ledger is not an exact prefix of the frozen work grid.");
  return records;
}

function runBoundRecordValidator(identity, inputs) {
  return (record, context = {}) => assertFixture026Record(record, {
    ...context,
    runId: identity.run_id,
    profile: inputs.profile,
    inputSha256: identity.input_sha256,
  });
}

function chargeSerializedRecordBytes(event, { sequence, previousHash }) {
  let bytesWritten = 0;
  for (let iteration = 0; iteration < 8; iteration += 1) {
    const payload = { ...event, serialized_event_bytes_written: bytesWritten };
    const record = {
      ...payload,
      integrity: {
        sequence,
        previous_sha256: previousHash,
        record_sha256: sha256(`${previousHash}\n${canonical(fixture026ScientificPayload(payload))}`),
      },
    };
    const observed = Buffer.byteLength(`${JSON.stringify(record)}\n`, "utf8");
    if (observed === bytesWritten) return payload;
    bytesWritten = observed;
  }
  throw new Error("Fixture 026 serialized byte charge did not converge.");
}

function classifyFullTrajectory(view, config) {
  const diagnostics = computeTrajectoryDiagnostics(view.observation, config);
  let predictedGeneratorFamily;
  if (diagnostics.static_fit_rmse <= config.exact_discrepancy_tolerance) {
    predictedGeneratorFamily = "static-ratio";
  } else if (diagnostics.trajectory_discrepancy <= config.exact_discrepancy_tolerance) {
    predictedGeneratorFamily = "exact-scale-symmetry";
  } else if (
    diagnostics.trajectory_discrepancy >= config.approximate_discrepancy_floor
    && diagnostics.trajectory_discrepancy <= config.approximate_discrepancy_ceiling
  ) {
    predictedGeneratorFamily = "approximate-scale-symmetry";
  } else if (
    diagnostics.peak_discrepancy <= config.peak_tolerance
    && diagnostics.endpoint_discrepancy <= config.endpoint_tolerance
  ) {
    predictedGeneratorFamily = "equal-peak-delayed-trajectory";
  } else {
    predictedGeneratorFamily = "endpoint-return-lookalike";
  }
  return Object.freeze({
    predicted_generator_family: predictedGeneratorFamily,
    estimated_trajectory_discrepancy: diagnostics.trajectory_discrepancy,
  });
}

function classifyPeakEndpoint(view, config) {
  const observation = view.observation;
  let predictedGeneratorFamily = "exact-scale-symmetry";
  const peakBeyondApproximate = observation.peak_discrepancy > config.approximate_discrepancy_ceiling;
  const endpointOutsideTolerance = observation.endpoint_discrepancy > config.endpoint_tolerance;
  if (peakBeyondApproximate || endpointOutsideTolerance) {
    predictedGeneratorFamily = "endpoint-return-lookalike";
  } else if (observation.peak_discrepancy > config.peak_tolerance) {
    predictedGeneratorFamily = "approximate-scale-symmetry";
  }
  return Object.freeze({
    predicted_generator_family: predictedGeneratorFamily,
    estimated_trajectory_discrepancy: observation.peak_discrepancy,
  });
}

function freezePolicyResponse(world, arm, config) {
  const view = assertPolicyViewFirewall(buildPolicyView(world, arm));
  const policyInputSha256 = sha256(canonical(view));
  let response;
  if (!view.trace_valid) {
    response = Object.freeze({
      arm,
      predicted_generator_family: "malformed-sentinel",
      estimated_trajectory_discrepancy: 0,
      policy_input_sha256: policyInputSha256,
    });
  } else {
    const classified = arm === "full-trajectory-diagnostic"
      ? classifyFullTrajectory(view, config)
      : classifyPeakEndpoint(view, config);
    response = Object.freeze({
      arm,
      predicted_generator_family: classified.predicted_generator_family,
      estimated_trajectory_discrepancy: classified.estimated_trajectory_discrepancy,
      policy_input_sha256: policyInputSha256,
    });
  }
  return Object.freeze({
    view,
    response,
    response_sha256: sha256(canonical(response)),
  });
}

function evaluateFrozenResponse(world, frozen, arm, config) {
  const valid = world.validation.trace_valid;
  const diagnostics = valid ? computeTrajectoryDiagnostics(world.trace, config) : {
    trajectory_discrepancy: 0,
    peak_discrepancy: 0,
    endpoint_discrepancy: 0,
    tail_discrepancy: 0,
    latency_discrepancy_s: 0,
    static_fit_rmse: 0,
  };
  const generatorFamilyCorrect = frozen.response.predicted_generator_family === world.generator_family;
  return Object.freeze({
    generator_family: world.generator_family,
    predicted_generator_family: frozen.response.predicted_generator_family,
    estimated_trajectory_discrepancy: frozen.response.estimated_trajectory_discrepancy,
    trajectory_discrepancy_estimation_error: valid
      ? Math.abs(frozen.response.estimated_trajectory_discrepancy - diagnostics.trajectory_discrepancy)
      : 0,
    generator_family_correct: generatorFamilyCorrect,
    semantic_properties_evaluated: valid,
    semantic_properties: valid ? world.semantic_properties : null,
    diagnostics,
    loss: valid && !generatorFamilyCorrect ? config.max_loss : 0,
    gate_decision: valid ? "accepted" : "record-invalid",
    arm,
  });
}

function simulateWorkUnit(unit, inputs, identity, ledgerState) {
  const world = generateFixture026World({
    seed: unit.seed,
    config: inputs.config,
    worldIndex: unit.world_index,
  });
  const frozen = freezePolicyResponse(world, unit.arm, inputs.config);
  const evaluation = evaluateFrozenResponse(world, frozen, unit.arm, inputs.config);
  const valid = world.validation.trace_valid;
  const trajectorySamples = valid && unit.arm === "full-trajectory-diagnostic" ? world.trace.length : 0;
  const summaryValues = valid && unit.arm === "peak-endpoint-lookalike" ? 2 : 0;
  const acceptedBytes = valid ? Buffer.byteLength(JSON.stringify(frozen.view), "utf8") : 0;
  const tailSamples = Math.round(inputs.config.tail_window_s / inputs.config.time_step_s) + 1;
  const operations = valid
    ? unit.arm === "full-trajectory-diagnostic"
      ? world.trace.length * 18 + tailSamples * 4 + 18
      : 3
    : 0;
  const event = {
    schema: 2,
    contract_version: FIXTURE_026_EVENT_CONTRACT_VERSION,
    artifact: "fixture-026",
    track: "RSD-T01",
    run_id: identity.run_id,
    profile: inputs.profile,
    pack: "public-development",
    seed: unit.seed,
    world_index: world.world_index,
    world_id: world.world_id,
    initialization_id: world.initialization_id,
    scale_group: world.scale_group,
    interface: world.interface,
    arm: unit.arm,
    attempt: 0,
    units: { input: "U", output: "1", time: "s", bytes: "B" },
    input_sha256: identity.input_sha256,
    generator_family: evaluation.generator_family,
    history_family: world.history_family,
    corruption: world.corruption,
    gate_decision: evaluation.gate_decision,
    ...world.validation,
    parameters: world.parameters,
    predicted_generator_family: evaluation.predicted_generator_family,
    generator_family_correct: evaluation.generator_family_correct,
    semantic_properties_evaluated: evaluation.semantic_properties_evaluated,
    semantic_properties: evaluation.semantic_properties,
    trajectory_discrepancy: evaluation.diagnostics.trajectory_discrepancy,
    estimated_trajectory_discrepancy: evaluation.estimated_trajectory_discrepancy,
    trajectory_discrepancy_estimation_error: evaluation.trajectory_discrepancy_estimation_error,
    peak_discrepancy: evaluation.diagnostics.peak_discrepancy,
    endpoint_discrepancy: evaluation.diagnostics.endpoint_discrepancy,
    tail_discrepancy: evaluation.diagnostics.tail_discrepancy,
    latency_discrepancy_s: evaluation.diagnostics.latency_discrepancy_s,
    static_fit_rmse: evaluation.diagnostics.static_fit_rmse,
    policy_input_sha256: frozen.response.policy_input_sha256,
    policy_response_sha256: frozen.response_sha256,
    policy_oracle_access: false,
    evaluator_opened_after_response: true,
    work_counter_scope: "exact-serialized-policy-view-bytes-and-frozen-modeled-classifier-counter-only; generator-validator-evaluator-hash-runtime-temporary-memory-excluded",
    accepted_trajectory_samples_read: trajectorySamples,
    accepted_summary_values_read: summaryValues,
    serialized_policy_view_utf8_bytes: acceptedBytes,
    serialized_event_bytes_written: 0,
    modeled_diagnostic_scalar_operations: operations,
    retained_persistent_state_bytes: 0,
    temporary_memory_measured: false,
    peak_memory_measured: false,
    loss: evaluation.loss,
    status: "development-smoke-only",
    result_label: "NO_RESULT",
    no_result: true,
    measured_energy_present: false,
    energy_conclusion_allowed: false,
    claim_eligible: false,
    comparison_inference_permitted: false,
    scientific_result: false,
    performance_result: false,
    interpretation: FIXTURE_026_EVENT_INTERPRETATION,
  };
  return chargeSerializedRecordBytes(event, ledgerState);
}

function materializeRecord(unit, inputs, identity, sequence, previousHash) {
  const payload = simulateWorkUnit(unit, inputs, identity, { sequence, previousHash });
  const record = {
    ...payload,
    integrity: {
      sequence,
      previous_sha256: previousHash,
      record_sha256: sha256(`${previousHash}\n${canonical(payload)}`),
    },
  };
  assertFixture026Record(record, {
    sequence,
    previousHash,
    runId: identity.run_id,
    profile: inputs.profile,
    inputSha256: identity.input_sha256,
  });
  return Object.freeze(record);
}

export async function materializeFixture026DevelopmentRecords(profile, units) {
  if (!new Set(["smoke", "development"]).has(profile) || !Array.isArray(units) || units.length < 1) {
    throw new Error("Fixture 026 public-development materialization requires a profile and work units.");
  }
  const inputs = await loadInputs(profile);
  const identity = runIdentity(inputs);
  const records = [];
  let previousHash = "0".repeat(64);
  for (const [sequence, unit] of units.entries()) {
    if (
      !unit
      || (() => {
        try {
          parseFixture026PublicSeed(unit.seed);
          return false;
        } catch {
          return true;
        }
      })()
      || !Number.isSafeInteger(unit.world_index)
      || unit.world_index < 0
      || unit.world_index >= inputs.config.worlds_per_seed
      || !FIXTURE_026_ARMS.includes(unit.arm)
    ) throw new Error("Fixture 026 public-development materialization unit is invalid.");
    const record = materializeRecord({
      run_id: identity.run_id,
      profile,
      seed: unit.seed,
      world_index: unit.world_index,
      arm: unit.arm,
    }, inputs, identity, sequence, previousHash);
    records.push(record);
    previousHash = record.integrity.record_sha256;
  }
  return Object.freeze(records);
}

export async function assertFixture026OrderedWorkKeys(records, profile) {
  if (!Array.isArray(records)) throw new Error("Fixture 026 ordered work-key audit requires records.");
  const inputs = await loadInputs(profile);
  const identity = runIdentity(inputs);
  return assertOrderedWorkKeys(records, inputs, identity);
}

export async function executeFixture026({ profile, output, resume = false, maxWorkUnits = Infinity }) {
  if (!Number.isFinite(maxWorkUnits) && maxWorkUnits !== Infinity) throw new Error("maxWorkUnits must be finite or Infinity.");
  if (maxWorkUnits !== Infinity && (!Number.isSafeInteger(maxWorkUnits) || maxWorkUnits < 1)) {
    throw new Error("maxWorkUnits must be a positive integer.");
  }
  const inputs = await loadInputs(profile);
  const identity = runIdentity(inputs);
  const directory = outputDirectory(output);
  const alreadyExists = await exists(directory);
  if (alreadyExists && !resume) throw new Error("Fixture 026 output already exists; use --resume true.");
  if (!alreadyExists && resume) throw new Error("Fixture 026 cannot resume a missing output directory.");
  if (!alreadyExists) {
    await mkdir(path.dirname(directory), { recursive: true });
    await mkdir(directory);
  } else if (!(await stat(directory)).isDirectory()) {
    throw new Error("Fixture 026 output is not a directory.");
  }
  const rawPath = path.join(directory, RAW_FILE);
  const checkpointPath = path.join(directory, CHECKPOINT_FILE);
  const runPath = path.join(directory, RUN_FILE);
  const units = allWorkUnits(inputs, identity);
  if (await exists(runPath)) {
    assertRunDocument(await loadJson(runPath), {
      identity,
      directory,
      expectedWorkUnits: units.length,
    });
  }
  const ledger = await openCheckpointLedger({
    artifact: "fixture-026",
    ledgerFormat,
    rawPath,
    checkpointPath,
    runIdentity: identity,
    scientificPayload: fixture026ScientificPayload,
    workKey: fixture026WorkKey,
    assertRecord: runBoundRecordValidator(identity, inputs),
  });
  if (ledger.summary().records > 0) {
    const existing = await readValidatedRecords(directory);
    assertOrderedWorkPrefix(existing.records, inputs, identity);
    for (const record of existing.records) assertSemanticReplay(record, inputs, identity);
  }
  const remaining = remainingWorkUnits(units, ledger.completedWorkKeys(), workUnitKey);
  for (const unit of remaining.slice(0, maxWorkUnits)) {
    const state = ledger.summary();
    const record = await ledger.append(simulateWorkUnit(unit, inputs, identity, {
      sequence: state.records,
      previousHash: state.hash_chain_sha256,
    }));
    if (Buffer.byteLength(`${JSON.stringify(record)}\n`, "utf8") !== record.serialized_event_bytes_written) {
      throw new Error("Fixture 026 observed serialized bytes disagree with the event charge.");
    }
    await ledger.saveCheckpoint();
  }
  const complete = ledger.summary().completed_work_units === units.length;
  if (!complete) {
    return Object.freeze({
      directory,
      complete: false,
      run_id: identity.run_id,
      ledger: ledger.summary(),
      result_label: "NO_RESULT",
      no_result: true,
    });
  }
  if (ledger.summary().checkpoint_status !== "current") await ledger.saveCheckpoint();
  const run = {
    ...identity,
    expected_work_units: units.length,
    ledger: ledger.summary(),
    raw_path: canonicalRepositoryPath(rawPath),
    checkpoint_path: canonicalRepositoryPath(checkpointPath),
    interpretation: FIXTURE_026_RUN_INTERPRETATION,
  };
  assertRunDocument(run, { identity, directory, expectedWorkUnits: units.length });
  await writeJsonStable(runPath, run);
  return Object.freeze({ directory, complete: true, run, result_label: "NO_RESULT", no_result: true });
}

async function readValidatedRecords(directory) {
  const rawPath = path.join(directory, RAW_FILE);
  const text = await readFile(rawPath, "utf8");
  if (text.includes("\r")) {
    throw new Error("Fixture 026 raw ledger must use canonical LF JSONL; CRLF is forbidden.");
  }
  if (text.length > 0 && !text.endsWith("\n")) {
    throw new Error("Fixture 026 raw ledger has a torn trailing record.");
  }
  let lines = [];
  if (text.length > 0) {
    const body = text.slice(0, -1);
    if (body.length === 0) throw new Error("Fixture 026 raw ledger contains a blank JSONL line.");
    lines = body.split("\n");
    if (lines.some((line) => line.length === 0)) {
      throw new Error("Fixture 026 raw ledger contains a blank JSONL line.");
    }
  }
  const records = [];
  const seen = new Set();
  let previousHash = "0".repeat(64);
  const payloadDigest = createHash("sha256");
  for (const [sequence, line] of lines.entries()) {
    const record = JSON.parse(line);
    assertFixture026Record(record, { sequence, previousHash });
    if (record.serialized_event_bytes_written !== Buffer.byteLength(`${line}\n`, "utf8")) {
      throw new Error(`Fixture 026 raw line ${sequence + 1} has a false byte charge.`);
    }
    const key = fixture026WorkKey(record);
    if (seen.has(key)) throw new Error(`Duplicate Fixture 026 work unit ${key}.`);
    seen.add(key);
    payloadDigest.update(canonicalize(fixture026ScientificPayload(record)));
    previousHash = record.integrity.record_sha256;
    records.push(record);
  }
  return Object.freeze({
    records: Object.freeze(records),
    terminalHash: previousHash,
    scientificPayloadSha256: payloadDigest.digest("hex"),
    completedWorkUnitsSha256: sha256Hex(canonicalize([...seen].sort())),
    rawSha256: createHash("sha256").update(text).digest("hex"),
  });
}

function assertSemanticReplay(record, inputs, identity) {
  const expected = simulateWorkUnit({
    run_id: identity.run_id,
    profile: inputs.profile,
    seed: record.seed,
    world_index: record.world_index,
    arm: record.arm,
  }, inputs, identity, {
    sequence: record.integrity.sequence,
    previousHash: record.integrity.previous_sha256,
  });
  if (canonical(expected) !== canonical(fixture026ScientificPayload(record))) {
    throw new Error(`Fixture 026 semantic replay mismatch at sequence ${record.integrity.sequence}.`);
  }
  return record;
}

export async function assertFixture026EventReplay(record) {
  if (!record || typeof record !== "object") throw new Error("Fixture 026 replay requires an event record.");
  const inputs = await loadInputs(record.profile);
  const identity = runIdentity(inputs);
  assertFixture026Record(record, {
    sequence: record.integrity?.sequence,
    previousHash: record.integrity?.previous_sha256,
    runId: identity.run_id,
    profile: inputs.profile,
    inputSha256: identity.input_sha256,
  });
  return assertSemanticReplay(record, inputs, identity);
}

function mean(rows, field) {
  return rows.length === 0 ? 0 : rows.reduce((sum, row) => sum + row[field], 0) / rows.length;
}

function armMetrics(records, arm) {
  const rows = records.filter((record) => record.arm === arm);
  const validRows = rows.filter((record) => record.trace_valid);
  return {
    records: rows.length,
    valid_generator_family_records: validRows.length,
    invalid_gate_records: rows.length - validRows.length,
    generator_family_balanced_accuracy:
      validRows.filter((record) => record.generator_family_correct).length / validRows.length,
    mean_trajectory_discrepancy: mean(validRows, "trajectory_discrepancy"),
    mean_trajectory_discrepancy_estimation_error: mean(validRows, "trajectory_discrepancy_estimation_error"),
    mean_peak_discrepancy: mean(validRows, "peak_discrepancy"),
    mean_endpoint_discrepancy: mean(validRows, "endpoint_discrepancy"),
    mean_tail_discrepancy: mean(validRows, "tail_discrepancy"),
    mean_latency_discrepancy_s: mean(validRows, "latency_discrepancy_s"),
    accepted_trajectory_samples_read: rows.reduce((sum, row) => sum + row.accepted_trajectory_samples_read, 0),
    accepted_summary_values_read: rows.reduce((sum, row) => sum + row.accepted_summary_values_read, 0),
    serialized_policy_view_utf8_bytes: rows.reduce((sum, row) => sum + row.serialized_policy_view_utf8_bytes, 0),
    serialized_event_bytes_written: rows.reduce((sum, row) => sum + row.serialized_event_bytes_written, 0),
    modeled_diagnostic_scalar_operations: rows.reduce((sum, row) => sum + row.modeled_diagnostic_scalar_operations, 0),
    retained_persistent_state_bytes: Math.max(...rows.map((row) => row.retained_persistent_state_bytes)),
    temporary_memory_measured: false,
    peak_memory_measured: false,
    mean_loss: mean(validRows, "loss"),
  };
}

export async function computeFixture026Analysis(output) {
  const directory = outputDirectory(output);
  const run = assertRunDocumentShape(await loadJson(path.join(directory, RUN_FILE)));
  const inputs = await loadInputs(run.profile);
  const identity = runIdentity(inputs);
  const units = allWorkUnits(inputs, identity);
  assertRunDocument(run, { identity, directory, expectedWorkUnits: units.length });
  const [raw, ledger] = await Promise.all([
    readValidatedRecords(directory),
    openCheckpointLedger({
      artifact: "fixture-026",
      ledgerFormat,
      rawPath: path.join(directory, RAW_FILE),
      checkpointPath: path.join(directory, CHECKPOINT_FILE),
      runIdentity: identity,
      scientificPayload: fixture026ScientificPayload,
      workKey: fixture026WorkKey,
      assertRecord: runBoundRecordValidator(identity, inputs),
    }),
  ]);
  const ledgerSummary = ledger.summary();
  if (
    raw.records.length !== run.expected_work_units
    || run.ledger.records !== raw.records.length
    || run.ledger.completed_work_units !== raw.records.length
    || run.ledger.scientific_payload_sha256 !== raw.scientificPayloadSha256
    || run.ledger.hash_chain_sha256 !== raw.terminalHash
    || ledgerSummary.checkpoint_status !== "current"
    || ledgerSummary.completed_work_units !== raw.records.length
  ) throw new Error("Fixture 026 run, checkpoint, and raw ledger disagree.");
  assertOrderedWorkKeys(raw.records, inputs, identity);
  for (const record of raw.records) assertSemanticReplay(record, inputs, identity);

  const metrics = Object.fromEntries(FIXTURE_026_ARMS.map((arm) => [arm, armMetrics(raw.records, arm)]));
  const full = raw.records.filter((record) => record.arm === "full-trajectory-diagnostic");
  const peak = raw.records.filter((record) => record.arm === "peak-endpoint-lookalike");
  const invalid = raw.records.filter((record) => record.generator_family === "malformed-sentinel");
  const validFull = full.filter((record) => record.trace_valid);
  const lookalikeClasses = new Set(["exact-scale-symmetry", "equal-peak-delayed-trajectory", "static-ratio"]);
  const checks = {
    expected_development_records_present: raw.records.length === run.expected_work_units,
    every_seed_has_exact_five_family_by_four_history_grid_plus_four_sentinels:
      inputs.seeds.every((seed) => {
      const rows = full.filter((record) => record.seed === seed);
      const validRows = rows.filter((row) => row.trace_valid);
      const cells = validRows.map((row) => `${row.generator_family}|${row.history_family}`);
      return validRows.length === FIXTURE_026_VALID_CELLS_PER_SEED
        && new Set(cells).size === FIXTURE_026_VALID_CELLS_PER_SEED
        && FIXTURE_026_VALID_FAMILIES.every((family) => (
          FIXTURE_026_HISTORY_FAMILIES.every((history) => (
            cells.includes(`${family}|${history}`)
          ))
        ))
        && rows.filter((row) => row.generator_family === "malformed-sentinel").length
          === FIXTURE_026_MALFORMED_SENTINELS.length
        && new Set(rows.filter((row) => row.generator_family === "malformed-sentinel")
          .map((row) => row.corruption)).size === FIXTURE_026_MALFORMED_SENTINELS.length;
      }),
    invalid_sentinel_is_outside_accuracy_and_has_zero_accepted_classifier_charges: invalid.length > 0 && invalid.every((record) => (
      record.gate_decision === "record-invalid"
      && record.predicted_generator_family === "malformed-sentinel"
      && record.semantic_properties_evaluated === false
      && record.semantic_properties === null
      && record.accepted_trajectory_samples_read === 0
      && record.accepted_summary_values_read === 0
      && record.serialized_policy_view_utf8_bytes === 0
      && record.modeled_diagnostic_scalar_operations === 0
      && record.retained_persistent_state_bytes === 0
      && record.loss === 0
    )),
    histories_share_initialization_within_seed_and_generator_family: inputs.seeds.every((seed) => (
      FIXTURE_026_VALID_FAMILIES.every((family) => {
        const rows = validFull.filter((record) => (
          record.seed === seed && record.generator_family === family
        ));
        return rows.length === FIXTURE_026_HISTORY_FAMILIES.length
          && new Set(rows.map((record) => record.initialization_id)).size === 1
          && new Set(rows.map((record) => record.world_id)).size === rows.length;
      })
    )),
    semantic_trace_facts_are_evaluator_only_and_memory_is_unassessed: validFull.every((record) => (
      record.semantic_properties_evaluated === true
      && record.semantic_properties !== null
      && record.semantic_properties.causal_memory_status === "unassessed"
      && record.semantic_properties.support_membership === "inside"
    )) && validFull.some((record) => (
      record.generator_family === "static-ratio"
      && record.semantic_properties.paired_trajectory_match === "exact"
      && record.semantic_properties.peak_amplitude_equal === true
    )),
    policy_evaluator_firewall_is_uniform: raw.records.every((record) => (
      record.policy_oracle_access === false
      && record.evaluator_opened_after_response === true
      && /^[0-9a-f]{64}$/.test(record.policy_input_sha256)
      && /^[0-9a-f]{64}$/.test(record.policy_response_sha256)
    )),
    full_trajectory_probe_separates_five_constructed_generator_families: validFull.length > 0
      && validFull.every((record) => record.generator_family_correct),
    approximate_generator_family_has_frozen_nonzero_error: validFull
      .filter((record) => record.generator_family === "approximate-scale-symmetry")
      .every((record) => (
        record.trajectory_discrepancy >= inputs.config.approximate_discrepancy_floor
        && record.trajectory_discrepancy <= inputs.config.approximate_discrepancy_ceiling
      )),
    exact_symmetry_is_complete_trajectory_not_endpoint_label: validFull
      .filter((record) => record.generator_family === "exact-scale-symmetry")
      .every((record) => record.trajectory_discrepancy <= inputs.config.exact_discrepancy_tolerance),
    endpoint_and_equal_peak_lookalikes_return_to_own_baselines_while_trajectories_differ: validFull
      .filter((record) => new Set(["endpoint-return-lookalike", "equal-peak-delayed-trajectory"])
        .has(record.generator_family))
      .every((record) => (
        record.semantic_properties.finite_horizon_endpoint_return === true
        && record.endpoint_discrepancy <= inputs.config.endpoint_tolerance
        && record.trajectory_discrepancy > inputs.config.approximate_discrepancy_ceiling
      )),
    equal_peak_generator_family_preserves_peak_but_delays_the_time_indexed_trajectory: validFull
      .filter((record) => record.generator_family === "equal-peak-delayed-trajectory")
      .every((record) => (
        record.peak_discrepancy <= inputs.config.peak_tolerance
        && record.latency_discrepancy_s > 0
      )),
    peak_endpoint_summary_exposes_registered_lookalike_collision: peak
      .filter((record) => record.trace_valid && lookalikeClasses.has(record.generator_family))
      .some((record) => !record.generator_family_correct),
    arm_views_and_work_counters_remain_disjoint: raw.records.every((record) => (
      !record.trace_valid
      || (record.arm === "full-trajectory-diagnostic"
        ? record.accepted_trajectory_samples_read > 0 && record.accepted_summary_values_read === 0
        : record.accepted_trajectory_samples_read === 0 && record.accepted_summary_values_read === 2)
    )),
    authority_boundary_and_no_result_are_uniform: raw.records.every((record) => (
      record.status === "development-smoke-only"
      && record.result_label === "NO_RESULT"
      && record.no_result === true
      && record.measured_energy_present === false
      && record.energy_conclusion_allowed === false
      && record.claim_eligible === false
      && record.comparison_inference_permitted === false
      && record.scientific_result === false
      && record.performance_result === false
      && record.interpretation === FIXTURE_026_EVENT_INTERPRETATION
    )),
  };
  const passed = Object.values(checks).every(Boolean);
  return {
    schema: 2,
    artifact: "fixture-026",
    track: "RSD-T01",
    claim_scope: ["C-1540"],
    contract_version: "fixture-026.rsd-t01-analysis.v2",
    run_id: run.run_id,
    profile: run.profile,
    accuracy_denominator: "five constructed generator families only; malformed sentinels excluded; the cross-cutting trace-fact vector retains its logical dependencies, is evaluator-recorded only, and has no probe prediction or property-performance score",
    trajectory_score: {
      name: "D",
      scale_y: inputs.config.output_scale_y,
      quadrature: inputs.config.trajectory_quadrature,
      time_step_s: inputs.config.time_step_s,
      horizon_s: inputs.config.horizon_s,
      unit: "dimensionless",
    },
    runtime_fingerprint: inputs.runtimeFingerprint,
    runtime_fingerprint_sha256: inputs.runtimeFingerprintSha256,
    raw_events_sha256: raw.rawSha256,
    run_sha256: sha256(canonical(run)),
    metrics,
    checks,
    decision: passed ? "contract-validation-pass" : "contract-validation-fail",
    result_label: "NO_RESULT",
    no_result: true,
    measured_energy_present: false,
    energy_conclusion_allowed: false,
    claim_eligible: false,
    comparison_inference_permitted: false,
    scientific_result: false,
    performance_result: false,
    interpretation: "NO_RESULT: public-development smoke validation of RSD-T01 full-trajectory scoring, weaker lookalikes, firewalling, accounting, and corruption-evident resume.",
  };
}

export async function analyzeFixture026(output) {
  const directory = outputDirectory(output);
  const summary = await computeFixture026Analysis(output);
  await mkdir(path.join(directory, "analysis"), { recursive: true });
  await writeJsonStable(path.join(directory, "analysis", "summary.json"), summary);
  if (summary.decision !== "contract-validation-pass") {
    throw new Error("Fixture 026 development contract validation failed.");
  }
  return summary;
}

export async function validateFixture026Output(output) {
  const directory = outputDirectory(output);
  const [expected, stored] = await Promise.all([
    computeFixture026Analysis(output),
    loadJson(path.join(directory, "analysis", "summary.json")),
  ]);
  if (canonical(expected) !== canonical(stored)) throw new Error("Fixture 026 stored analysis is not reproducible from raw events.");
  if (
    stored.result_label !== "NO_RESULT"
    || stored.no_result !== true
    || stored.measured_energy_present !== false
    || stored.energy_conclusion_allowed !== false
    || stored.claim_eligible !== false
    || stored.comparison_inference_permitted !== false
    || stored.scientific_result !== false
    || stored.performance_result !== false
  ) throw new Error("Fixture 026 smoke output attempts to claim result authority.");
  return Object.freeze({
    valid: true,
    run_id: stored.run_id,
    decision: stored.decision,
    result_label: "NO_RESULT",
    no_result: true,
  });
}

export async function prepareFixture026(profile) {
  const inputs = await loadInputs(profile);
  return Object.freeze({
    valid: true,
    artifact: "fixture-026",
    track: "RSD-T01",
    claim_scope: ["C-1540"],
    profile,
    partition: "public-development-only",
    execution_mode: "deterministic-cpu-only",
    gpu_permitted: false,
    runtime_fingerprint: inputs.runtimeFingerprint,
    runtime_fingerprint_sha256: inputs.runtimeFingerprintSha256,
    seeds: inputs.seeds.length,
    worlds_per_seed: inputs.config.worlds_per_seed,
    valid_generator_families: FIXTURE_026_VALID_FAMILIES.length,
    histories_per_generator_family: FIXTURE_026_HISTORY_FAMILIES.length,
    valid_cartesian_cells_per_seed: FIXTURE_026_VALID_CELLS_PER_SEED,
    malformed_sentinels_per_seed: FIXTURE_026_MALFORMED_SENTINELS.length,
    work_units: inputs.seeds.length * inputs.config.worlds_per_seed * FIXTURE_026_ARMS.length,
    implemented_tracks: FIXTURE_026_IMPLEMENTED_TRACKS.length,
    registered_tracks: FIXTURE_026_TRACK_IDS.length,
    confirmation_seeds_created: false,
    transfer_seeds_created: false,
    measured_energy_required: false,
    energy_conclusion_allowed: false,
    claim_eligible: false,
    comparison_inference_permitted: false,
    scientific_result: false,
    performance_result: false,
    result_label: "NO_RESULT",
    no_result: true,
  });
}

export async function main(argv = process.argv) {
  if (argv[2]?.startsWith("t02-")) return mainFixture026RsdT02(argv);
  const { action, options } = parseOptions(argv);
  if (action === "prepare") return prepareFixture026(options.profile);
  if (action === "smoke") {
    await executeFixture026({ profile: options.profile, output: options.output, resume: options.resume === "true" });
    await analyzeFixture026(options.output);
    return validateFixture026Output(options.output);
  }
  if (action === "run") return executeFixture026({ profile: options.profile, output: options.output, resume: options.resume === "true" });
  if (action === "analyze") return analyzeFixture026(options.output);
  return validateFixture026Output(options.output);
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
