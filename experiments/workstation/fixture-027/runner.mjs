import { createHash } from "node:crypto";
import {
  access,
  mkdir,
  readFile,
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
  FIXTURE_027_ARMS,
  FIXTURE_027_EVENT_CONTRACT_VERSION,
  FIXTURE_027_WORLD_CLASSES,
  assertFixture027Record,
  canonical,
  fixture027ScientificPayload,
  fixture027WorkKey,
  sha256,
} from "./contract.mjs";
import {
  FIXTURE_027_GENERATOR_VERSION,
  generateFixture027World,
  validateFixture027Config,
  validateInterfaceTrace,
} from "./generator.mjs";
import {
  FIXTURE_027_IMPLEMENTED_TRACKS,
  FIXTURE_027_TRACK_IDS,
  assertFixture027Registry,
  extractFixture027Registry,
} from "./registry.mjs";

export const FIXTURE_027_RUNNER_VERSION = "fixture-027.rin-t01-runner.v3";

const fixtureRoot = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(fixtureRoot, "../../..");
const ledgerFormat = "fixture-027.rin-t01-ledger.v1";
const sourceFiles = Object.freeze([
  "../lib/checkpoint-ledger.mjs",
  "../lib/pcg64-dxsm.mjs",
  "contract.mjs",
  "generator.mjs",
  "registry.mjs",
  "output.schema.json",
  "runner.mjs",
  "../../fixtures/027-interface-qualified-retroactivity-insulation.md",
]);

function isInside(root, target) {
  const relative = path.relative(root, target);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function parseOptions(argv) {
  const action = argv[2];
  if (!new Set(["prepare", "smoke", "run", "analyze", "validate"]).has(action)) {
    throw new Error("Fixture 027 action must be prepare, smoke, run, analyze, or validate; private partitions are not executable.");
  }
  if ((argv.length - 3) % 2 !== 0) throw new Error("Options require explicit --name value pairs.");
  const options = {};
  for (let index = 3; index < argv.length; index += 2) {
    const token = argv[index];
    const value = argv[index + 1];
    if (!/^--[a-z][a-z-]*$/.test(token ?? "") || !value || value.startsWith("--")) {
      throw new Error("Fixture 027 options require explicit --name value pairs.");
    }
    const key = token.slice(2);
    if (!new Set(["profile", "output", "resume"]).has(key) || Object.hasOwn(options, key)) {
      throw new Error(`Unknown or duplicate Fixture 027 option --${key}.`);
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
    throw new Error("Fixture 027 output must stay inside the repository.");
  }
  return resolved;
}

function validateDevelopmentSeeds(document) {
  if (
    document?.schema !== 1
    || document.artifact !== "fixture-027"
    || document.partition !== "development"
    || document.state !== "public-development"
    || document.algorithm !== "literal-public-seed-list-v1"
    || !Array.isArray(document.seeds)
    || document.seeds.length < 2
    || document.seeds.some((seed) => !Number.isSafeInteger(seed) || seed < 0 || seed > 0xffff_ffff)
    || new Set(document.seeds).size !== document.seeds.length
  ) throw new Error("Fixture 027 development seed document is invalid.");
  return document;
}

async function loadInputs(profile) {
  const configPath = path.join(fixtureRoot, "configs", `${profile}.json`);
  const seedsPath = path.join(fixtureRoot, "seeds", "development.reveal.json");
  const fixturePath = path.join(repositoryRoot, "experiments", "fixtures", "027-interface-qualified-retroactivity-insulation.md");
  const [config, seedDocument, fixtureMarkdown] = await Promise.all([
    loadJson(configPath),
    loadJson(seedsPath),
    readFile(fixturePath, "utf8"),
  ]);
  validateFixture027Config(config);
  validateDevelopmentSeeds(seedDocument);
  assertFixture027Registry(extractFixture027Registry(fixtureMarkdown));
  if (config.profile !== profile) throw new Error("Fixture 027 profile/config mismatch.");
  const seeds = profile === "smoke" ? seedDocument.seeds.slice(0, 2) : seedDocument.seeds;
  const sourceEntries = await Promise.all(sourceFiles.map(async (relative) => {
    const absolute = path.resolve(fixtureRoot, relative);
    return [relative.replaceAll("\\", "/"), await fileSha256(absolute)];
  }));
  const immutableInputs = {
    contract: path.join(fixtureRoot, "contract.mjs"),
    generator: path.join(fixtureRoot, "generator.mjs"),
    runner: path.join(fixtureRoot, "runner.mjs"),
    configuration: configPath,
    schema: path.join(fixtureRoot, "output.schema.json"),
    seed_pack: seedsPath,
  };
  const inputSha256 = Object.freeze(Object.fromEntries(await Promise.all(
    Object.entries(immutableInputs).map(async ([key, file]) => [key, await fileSha256(file)]),
  )));
  return Object.freeze({
    profile,
    config,
    configPath,
    configSha256: await fileSha256(configPath),
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
    artifact: "fixture-027",
    track: "RIN-T01",
    runner_version: FIXTURE_027_RUNNER_VERSION,
    generator_version: FIXTURE_027_GENERATOR_VERSION,
    event_contract_version: FIXTURE_027_EVENT_CONTRACT_VERSION,
    ledger_format: ledgerFormat,
    profile: inputs.profile,
    config: inputs.config,
    config_sha256: inputs.configSha256,
    seeds: inputs.seeds,
    development_seed_document_sha256: inputs.seedsSha256,
    arms: FIXTURE_027_ARMS,
    source_hashes: inputs.sourceHashes,
    input_sha256: inputs.inputSha256,
    partition: "public-development-only",
    execution_mode: "deterministic-cpu-only",
    confirmation_seed_state: "not-created",
    transfer_seed_state: "not-created",
    result_label: "NO_RESULT",
    no_result: true,
    comparison_inference_permitted: false,
    energy_conclusion_allowed: false,
  };
  return Object.freeze({ ...body, run_id: sha256Hex(canonicalize(body)) });
}

function allWorkUnits(inputs, identity) {
  const units = [];
  for (const seed of inputs.seeds) {
    for (let worldIndex = 0; worldIndex < inputs.config.worlds_per_seed; worldIndex += 1) {
      for (const arm of FIXTURE_027_ARMS) units.push(Object.freeze({
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

function runBoundRecordValidator(identity, inputs) {
  return (record, context = {}) => assertFixture027Record(record, {
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
        record_sha256: sha256(`${previousHash}\n${canonical(fixture027ScientificPayload(payload))}`),
      },
    };
    const observed = Buffer.byteLength(`${JSON.stringify(record)}\n`, "utf8");
    if (observed === bytesWritten) return payload;
    bytesWritten = observed;
  }
  throw new Error("Fixture 027 serialized byte charge did not converge.");
}

function decide(world, arm, config, exposed) {
  if (!exposed.trace_valid) {
    return Object.freeze({
      decision: "record-invalid",
      prediction_rmse_u: 0,
      insulation_rmse_u: 0,
      restoration_fraction: 0,
      driver_saturation_fraction: 0,
      insulation_action_u: 0,
    });
  }
  if (arm === "isolated-assumption") {
    return Object.freeze({
      decision: "isolated-assumption",
      prediction_rmse_u: world.back_action_rmse_u,
      insulation_rmse_u: 0,
      restoration_fraction: 0,
      driver_saturation_fraction: 0,
      insulation_action_u: 0,
    });
  }
  if (arm === "load-aware-interface") {
    return Object.freeze({
      decision: world.back_action_rmse_u <= config.back_action_threshold_u
        ? "within-support"
        : "back-action-detected",
      prediction_rmse_u: 0,
      insulation_rmse_u: 0,
      restoration_fraction: 0,
      driver_saturation_fraction: 0,
      insulation_action_u: 0,
    });
  }
  let decision = "support-exceeded";
  if (world.back_action_rmse_u <= config.back_action_threshold_u) {
    decision = "insulation-not-required";
  } else if (
    world.restoration_fraction >= config.minimum_restoration_fraction
    && world.driver_saturation_fraction < config.saturation_fraction_threshold
  ) {
    decision = "bounded-insulation";
  }
  return Object.freeze({
    decision,
    prediction_rmse_u: world.insulation_rmse_u,
    insulation_rmse_u: world.insulation_rmse_u,
    restoration_fraction: world.restoration_fraction,
    driver_saturation_fraction: world.driver_saturation_fraction,
    insulation_action_u: world.insulation_action_u,
  });
}

function simulateWorkUnit(unit, inputs, identity, ledgerState) {
  const { arm } = unit;
  const world = generateFixture027World({
    seed: unit.seed,
    config: inputs.config,
    worldIndex: unit.world_index,
  });
  const exposed = validateInterfaceTrace(world.trace, inputs.config);
  const result = decide(world, arm, inputs.config, exposed);
  const valid = exposed.trace_valid;
  const steps = valid ? Math.round(inputs.config.horizon_s / inputs.config.time_step_s) : 0;
  const samples = valid ? world.trace.length : 0;
  const bytes = valid ? Buffer.byteLength(JSON.stringify(world.trace), "utf8") : 0;
  const perStepOps = arm === "bounded-insulation-diagnostic" ? 24 : arm === "load-aware-interface" ? 14 : 8;
  const loss = valid
    ? Math.min(inputs.config.max_loss, 100 * Math.min(1, result.prediction_rmse_u / inputs.config.state_scale_u))
    : 0;
  const event = {
    schema: 1,
    contract_version: FIXTURE_027_EVENT_CONTRACT_VERSION,
    artifact: "fixture-027",
    track: "RIN-T01",
    run_id: identity.run_id,
    profile: inputs.profile,
    pack: "public-development",
    seed: unit.seed,
    world_index: world.world_index,
    world_id: world.world_id,
    arm,
    attempt: 0,
    units: { signal: "U", time: "s", rate: "U s^-1", bytes: "B" },
    input_sha256: identity.input_sha256,
    oracle_class: world.world_class,
    corruption: world.corruption,
    decision: result.decision,
    ...exposed,
    parameters: world.parameters,
    mass_closure_residual_u: valid ? world.mass_closure_residual_u : 0,
    no_affinity_rmse_u: valid ? world.no_affinity_rmse_u : 0,
    back_action_rmse_u: valid ? world.back_action_rmse_u : 0,
    prediction_rmse_u: result.prediction_rmse_u,
    insulation_rmse_u: result.insulation_rmse_u,
    restoration_fraction: result.restoration_fraction,
    driver_saturation_fraction: result.driver_saturation_fraction,
    insulation_action_u: result.insulation_action_u,
    work_counter_scope: "accepted-interface-and-declared-arm-model-only; generator-and-validator-work-excluded",
    accepted_model_steps: steps,
    accepted_interface_samples_read: samples,
    accepted_interface_bytes_read: bytes,
    serialized_event_bytes_written: 0,
    declared_arm_scalar_operations: steps * perStepOps,
    loss,
    status: "development-smoke-only",
    result_label: "NO_RESULT",
    no_result: true,
    measured_energy_present: false,
    energy_conclusion_allowed: false,
    claim_eligible: false,
    comparison_inference_permitted: false,
    scientific_result: false,
    performance_result: false,
    interpretation: "NO_RESULT: deterministic synthetic RIN-T01 interface-back-action diagnostic only.",
  };
  return chargeSerializedRecordBytes(event, ledgerState);
}

export async function executeFixture027({ profile, output, resume = false, maxWorkUnits = Infinity }) {
  if (!Number.isFinite(maxWorkUnits) && maxWorkUnits !== Infinity) throw new Error("maxWorkUnits must be finite or Infinity.");
  if (maxWorkUnits !== Infinity && (!Number.isSafeInteger(maxWorkUnits) || maxWorkUnits < 1)) {
    throw new Error("maxWorkUnits must be a positive integer.");
  }
  const inputs = await loadInputs(profile);
  const identity = runIdentity(inputs);
  const directory = outputDirectory(output);
  const alreadyExists = await exists(directory);
  if (alreadyExists && !resume) throw new Error("Fixture 027 output already exists; use --resume true.");
  if (!alreadyExists && resume) throw new Error("Fixture 027 cannot resume a missing output directory.");
  if (!alreadyExists) {
    await mkdir(path.dirname(directory), { recursive: true });
    await mkdir(directory);
  } else if (!(await stat(directory)).isDirectory()) {
    throw new Error("Fixture 027 output is not a directory.");
  }
  const rawPath = path.join(directory, "raw-events.jsonl");
  const checkpointPath = path.join(directory, "checkpoint.json");
  const ledger = await openCheckpointLedger({
    artifact: "fixture-027",
    ledgerFormat,
    rawPath,
    checkpointPath,
    runIdentity: identity,
    scientificPayload: fixture027ScientificPayload,
    workKey: fixture027WorkKey,
    assertRecord: runBoundRecordValidator(identity, inputs),
  });
  const units = allWorkUnits(inputs, identity);
  const remaining = remainingWorkUnits(units, ledger.completedWorkKeys(), workUnitKey);
  for (const unit of remaining.slice(0, maxWorkUnits)) {
    const state = ledger.summary();
    const record = await ledger.append(simulateWorkUnit(unit, inputs, identity, {
      sequence: state.records,
      previousHash: state.hash_chain_sha256,
    }));
    if (Buffer.byteLength(`${JSON.stringify(record)}\n`, "utf8") !== record.serialized_event_bytes_written) {
      throw new Error("Fixture 027 observed serialized bytes disagree with the event charge.");
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
  const run = {
    ...identity,
    expected_work_units: units.length,
    ledger: ledger.summary(),
    raw_path: path.relative(repositoryRoot, rawPath).replaceAll("\\", "/"),
    checkpoint_path: path.relative(repositoryRoot, checkpointPath).replaceAll("\\", "/"),
    measured_energy_present: false,
    energy_conclusion_allowed: false,
    claim_eligible: false,
    comparison_inference_permitted: false,
    scientific_result: false,
    performance_result: false,
    interpretation: "NO_RESULT: public-development RIN-T01 runner integrity and diagnostic plumbing only.",
  };
  await writeJsonStable(path.join(directory, "run.json"), run);
  return Object.freeze({ directory, complete: true, run, result_label: "NO_RESULT", no_result: true });
}

async function readValidatedRecords(directory) {
  const rawPath = path.join(directory, "raw-events.jsonl");
  const text = await readFile(rawPath, "utf8");
  if (text.length > 0 && !text.endsWith("\n")) throw new Error("Fixture 027 raw ledger has a torn trailing record.");
  const lines = text.split(/\r?\n/u).filter(Boolean);
  const records = [];
  const seen = new Set();
  let previousHash = "0".repeat(64);
  const payloadDigest = createHash("sha256");
  for (const [sequence, line] of lines.entries()) {
    const record = JSON.parse(line);
    assertFixture027Record(record, { sequence, previousHash });
    if (record.serialized_event_bytes_written !== Buffer.byteLength(`${line}\n`, "utf8")) {
      throw new Error(`Fixture 027 raw line ${sequence + 1} has a false byte charge.`);
    }
    const key = fixture027WorkKey(record);
    if (seen.has(key)) throw new Error(`Duplicate Fixture 027 work unit ${key}.`);
    seen.add(key);
    payloadDigest.update(canonicalize(fixture027ScientificPayload(record)));
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

function mean(rows, field) {
  return rows.reduce((sum, row) => sum + row[field], 0) / rows.length;
}

function armMetrics(records, arm) {
  const rows = records.filter((record) => record.arm === arm);
  const validRows = rows.filter((record) => record.trace_valid);
  return {
    records: rows.length,
    valid_records: validRows.length,
    invalid_records: rows.length - validRows.length,
    maximum_mass_closure_residual_u: Math.max(...validRows.map((row) => row.mass_closure_residual_u)),
    maximum_no_affinity_rmse_u: Math.max(...validRows.map((row) => row.no_affinity_rmse_u)),
    mean_back_action_rmse_u: mean(validRows, "back_action_rmse_u"),
    mean_prediction_rmse_u: mean(validRows, "prediction_rmse_u"),
    mean_insulation_rmse_u: mean(validRows, "insulation_rmse_u"),
    mean_restoration_fraction: mean(validRows, "restoration_fraction"),
    mean_driver_saturation_fraction: mean(validRows, "driver_saturation_fraction"),
    insulation_action_u: rows.reduce((sum, row) => sum + row.insulation_action_u, 0),
    accepted_model_steps: rows.reduce((sum, row) => sum + row.accepted_model_steps, 0),
    accepted_interface_samples_read: rows.reduce((sum, row) => sum + row.accepted_interface_samples_read, 0),
    accepted_interface_bytes_read: rows.reduce((sum, row) => sum + row.accepted_interface_bytes_read, 0),
    serialized_event_bytes_written: rows.reduce((sum, row) => sum + row.serialized_event_bytes_written, 0),
    declared_arm_scalar_operations: rows.reduce((sum, row) => sum + row.declared_arm_scalar_operations, 0),
    mean_loss: mean(validRows, "loss"),
  };
}

function classRows(records, arm, labels) {
  const allowed = new Set(Array.isArray(labels) ? labels : [labels]);
  return records.filter((record) => record.arm === arm && allowed.has(record.oracle_class));
}

export async function computeFixture027Analysis(output) {
  const directory = outputDirectory(output);
  const run = await loadJson(path.join(directory, "run.json"));
  const inputs = await loadInputs(run.profile);
  const identity = runIdentity(inputs);
  if (run.run_id !== identity.run_id || canonical(run.source_hashes) !== canonical(identity.source_hashes)) {
    throw new Error("Fixture 027 run identity differs from current frozen inputs or sources.");
  }
  const [raw, ledger] = await Promise.all([
    readValidatedRecords(directory),
    openCheckpointLedger({
      artifact: "fixture-027",
      ledgerFormat,
      rawPath: path.join(directory, "raw-events.jsonl"),
      checkpointPath: path.join(directory, "checkpoint.json"),
      runIdentity: identity,
      scientificPayload: fixture027ScientificPayload,
      workKey: fixture027WorkKey,
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
  ) throw new Error("Fixture 027 run, checkpoint, and raw ledger disagree.");

  const metrics = Object.fromEntries(FIXTURE_027_ARMS.map((arm) => [arm, armMetrics(raw.records, arm)]));
  const canonicalArm = raw.records.filter((record) => record.arm === "load-aware-interface");
  const invalid = raw.records.filter((record) => record.oracle_class === "interface-schema-invalid");
  const supported = classRows(raw.records, "load-aware-interface", ["zero-load-control", "weak-load-supported"]);
  const retroactive = classRows(raw.records, "load-aware-interface", [
    "strong-load-retroactive",
    "finite-insulation-effective",
    "insulation-saturated",
  ]);
  const effective = classRows(raw.records, "bounded-insulation-diagnostic", "finite-insulation-effective");
  const saturated = classRows(raw.records, "bounded-insulation-diagnostic", "insulation-saturated");
  const isolatedRetroactive = classRows(raw.records, "isolated-assumption", [
    "strong-load-retroactive",
    "finite-insulation-effective",
    "insulation-saturated",
  ]);
  const checks = {
    expected_development_records_present: raw.records.length === run.expected_work_units,
    every_seed_is_class_balanced: inputs.seeds.every((seed) => {
      const rows = canonicalArm.filter((record) => record.seed === seed);
      const counts = Object.fromEntries(FIXTURE_027_WORLD_CLASSES.map((label) => [
        label,
        rows.filter((row) => row.oracle_class === label).length,
      ]));
      return Object.values(counts).every((count) => count > 0) && new Set(Object.values(counts)).size === 1;
    }),
    malformed_interfaces_stop_before_simulation: invalid.length > 0 && invalid.every((record) => (
      record.decision === "record-invalid"
      && record.accepted_model_steps === 0
      && record.accepted_interface_samples_read === 0
      && record.accepted_interface_bytes_read === 0
      && record.declared_arm_scalar_operations === 0
      && record.insulation_action_u === 0
    )),
    rin_t01_mass_closure_is_binary64_bounded: raw.records
      .filter((record) => record.trace_valid)
      .every((record) => record.mass_closure_residual_u <= 1e-12),
    rin_t01_registered_interventions_remove_the_edge: raw.records
      .filter((record) => record.trace_valid)
      .every((record) => (
        record.no_affinity_rmse_u <= 1e-12
        && (record.oracle_class !== "zero-load-control" || record.back_action_rmse_u <= 1e-12)
      )),
    supported_loads_remain_within_registered_threshold: supported.length > 0 && supported.every((record) => (
      record.decision === "within-support"
      && record.back_action_rmse_u <= inputs.config.back_action_threshold_u
    )),
    load_aware_path_detects_registered_back_action: retroactive.length > 0 && retroactive.every((record) => (
      record.decision === "back-action-detected"
      && record.back_action_rmse_u > inputs.config.back_action_threshold_u
    )),
    finite_insulation_restores_within_registered_support: effective.length > 0 && effective.every((record) => (
      record.decision === "bounded-insulation"
      && record.restoration_fraction >= inputs.config.minimum_restoration_fraction
      && record.driver_saturation_fraction < inputs.config.saturation_fraction_threshold
      && record.insulation_rmse_u < record.back_action_rmse_u
      && record.insulation_action_u > 0
    )),
    saturation_is_reported_as_support_exceeded: saturated.length > 0 && saturated.every((record) => (
      record.decision === "support-exceeded"
      && record.driver_saturation_fraction >= inputs.config.saturation_fraction_threshold
    )),
    isolated_assumption_exposes_registered_miss: isolatedRetroactive.length > 0 && isolatedRetroactive.every((record) => (
      record.decision === "isolated-assumption"
      && record.prediction_rmse_u > inputs.config.back_action_threshold_u
    )),
    synthetic_action_is_bounded_arm_only: raw.records.every((record) => (
      record.arm === "bounded-insulation-diagnostic" || (
        record.insulation_action_u === 0
        && record.insulation_rmse_u === 0
        && record.restoration_fraction === 0
        && record.driver_saturation_fraction === 0
      )
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
      && record.interpretation.startsWith("NO_RESULT:")
    )),
  };
  const passed = Object.values(checks).every(Boolean);
  return {
    schema: 1,
    artifact: "fixture-027",
    track: "RIN-T01",
    contract_version: "fixture-027.rin-t01-analysis.v1",
    run_id: run.run_id,
    profile: run.profile,
    raw_events_sha256: raw.rawSha256,
    run_sha256: sha256(canonical(run)),
    metrics,
    checks,
    decision: passed ? "diagnostic-pass" : "diagnostic-fail",
    result_label: "NO_RESULT",
    no_result: true,
    comparison_inference_permitted: false,
    measured_energy_present: false,
    energy_conclusion_allowed: false,
    claim_eligible: false,
    scientific_result: false,
    performance_result: false,
    interpretation: "NO_RESULT: public-development smoke validation of RIN-T01 interface qualification, bounded insulation, saturation, accounting, and corruption-evident resume.",
  };
}

export async function analyzeFixture027(output) {
  const directory = outputDirectory(output);
  const summary = await computeFixture027Analysis(output);
  await mkdir(path.join(directory, "analysis"), { recursive: true });
  await writeJsonStable(path.join(directory, "analysis", "summary.json"), summary);
  if (summary.decision !== "diagnostic-pass") throw new Error("Fixture 027 development smoke diagnostics failed.");
  return summary;
}

export async function validateFixture027Output(output) {
  const directory = outputDirectory(output);
  const [expected, stored] = await Promise.all([
    computeFixture027Analysis(output),
    loadJson(path.join(directory, "analysis", "summary.json")),
  ]);
  if (canonical(expected) !== canonical(stored)) throw new Error("Fixture 027 stored analysis is not reproducible from raw events.");
  if (
    stored.result_label !== "NO_RESULT"
    || stored.no_result !== true
    || stored.comparison_inference_permitted !== false
    || stored.energy_conclusion_allowed !== false
    || stored.claim_eligible !== false
    || stored.scientific_result !== false
    || stored.performance_result !== false
  ) throw new Error("Fixture 027 smoke output attempts to claim result authority.");
  return Object.freeze({
    valid: true,
    run_id: stored.run_id,
    decision: stored.decision,
    result_label: "NO_RESULT",
    no_result: true,
  });
}

export async function prepareFixture027(profile) {
  const inputs = await loadInputs(profile);
  return Object.freeze({
    valid: true,
    artifact: "fixture-027",
    track: "RIN-T01",
    profile,
    partition: "public-development-only",
    execution_mode: "deterministic-cpu-only",
    seeds: inputs.seeds.length,
    worlds_per_seed: inputs.config.worlds_per_seed,
    work_units: inputs.seeds.length * inputs.config.worlds_per_seed * FIXTURE_027_ARMS.length,
    implemented_tracks: FIXTURE_027_IMPLEMENTED_TRACKS.length,
    registered_tracks: FIXTURE_027_TRACK_IDS.length,
    confirmation_seeds_created: false,
    transfer_seeds_created: false,
    measured_energy_required: false,
    energy_conclusion_allowed: false,
    claim_eligible: false,
    comparison_inference_permitted: false,
    result_label: "NO_RESULT",
    no_result: true,
  });
}

export async function main(argv = process.argv) {
  const { action, options } = parseOptions(argv);
  if (action === "prepare") return prepareFixture027(options.profile);
  if (action === "smoke") {
    await executeFixture027({ profile: options.profile, output: options.output, resume: options.resume === "true" });
    await analyzeFixture027(options.output);
    return validateFixture027Output(options.output);
  }
  if (action === "run") return executeFixture027({ profile: options.profile, output: options.output, resume: options.resume === "true" });
  if (action === "analyze") return analyzeFixture027(options.output);
  return validateFixture027Output(options.output);
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
