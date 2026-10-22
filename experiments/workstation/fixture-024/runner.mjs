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
  FIXTURE_024_ARMS,
  FIXTURE_024_EVENT_CONTRACT_VERSION,
  assertFixture024Record,
  canonical,
  fixture024ScientificPayload,
  fixture024WorkKey,
  sha256,
} from "./contract.mjs";
import {
  FIXTURE_024_GENERATOR_VERSION,
  generateLinearMemorySystems,
  stepLinearState,
  transitionMatrix,
  validateFixture024Config,
} from "./generator.mjs";

export const FIXTURE_024_RUNNER_VERSION = "fixture-024.amr-t01-runner.v1";

const fixtureRoot = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(fixtureRoot, "../../..");
const ledgerFormat = "fixture-024.amr-t01-ledger.v1";
const sourceFiles = Object.freeze([
  "../lib/checkpoint-ledger.mjs",
  "../lib/pcg64-dxsm.mjs",
  "contract.mjs",
  "generator.mjs",
  "output.schema.json",
  "runner.mjs",
]);

function isInside(root, target) {
  const relative = path.relative(root, target);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function parseOptions(argv) {
  const action = argv[2];
  if (!new Set(["prepare", "smoke", "run", "analyze", "validate"]).has(action)) {
    throw new Error("Fixture 024 action must be prepare, smoke, run, analyze, or validate; private partitions are not executable.");
  }
  if ((argv.length - 3) % 2 !== 0) throw new Error("Options require explicit --name value pairs.");
  const options = {};
  for (let index = 3; index < argv.length; index += 2) {
    const token = argv[index];
    const value = argv[index + 1];
    if (!/^--[a-z][a-z-]*$/.test(token ?? "") || !value || value.startsWith("--")) {
      throw new Error("Fixture 024 options require explicit --name value pairs.");
    }
    const key = token.slice(2);
    if (!new Set(["profile", "output", "resume"]).has(key) || Object.hasOwn(options, key)) {
      throw new Error(`Unknown or duplicate Fixture 024 option --${key}.`);
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
  if (action === "smoke" && options.profile !== "smoke") {
    throw new Error("smoke requires --profile smoke.");
  }
  if (action === "run" && options.profile !== "development") {
    throw new Error("run requires --profile development.");
  }
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
    throw new Error("Fixture 024 output must stay inside the repository.");
  }
  return resolved;
}

function validateDevelopmentSeeds(document) {
  if (
    document?.schema !== 1
    || document.artifact !== "fixture-024"
    || document.partition !== "development"
    || document.state !== "public-development"
    || document.algorithm !== "literal-public-seed-list-v1"
    || !Array.isArray(document.seeds)
    || document.seeds.length < 2
    || document.seeds.some((seed) => !Number.isSafeInteger(seed) || seed < 0 || seed > 0xffff_ffff)
    || new Set(document.seeds).size !== document.seeds.length
  ) throw new Error("Fixture 024 development seed document is invalid.");
  return document;
}

async function loadInputs(profile) {
  const configPath = path.join(fixtureRoot, "configs", `${profile}.json`);
  const seedsPath = path.join(fixtureRoot, "seeds", "development.reveal.json");
  const [config, seedDocument] = await Promise.all([
    loadJson(configPath),
    loadJson(seedsPath),
  ]);
  validateFixture024Config(config);
  validateDevelopmentSeeds(seedDocument);
  if (config.profile !== profile) throw new Error("Fixture 024 profile/config mismatch.");
  const seeds = profile === "smoke" ? seedDocument.seeds.slice(0, 2) : seedDocument.seeds;
  const sourceEntries = await Promise.all(sourceFiles.map(async (relative) => {
    const absolute = path.resolve(fixtureRoot, relative);
    return [relative.replaceAll("\\", "/"), await fileSha256(absolute)];
  }));
  const immutableInputs = {
    audit: path.join(repositoryRoot, "research", "audits", "2026-08-25-applied-multiscale-reduction.md"),
    fixture: path.join(repositoryRoot, "experiments", "fixtures", "024-applied-multiscale-reduction.md"),
    math_contract: path.join(repositoryRoot, "math", "multiscale-reduction-contract.md"),
    runner: path.join(fixtureRoot, "runner.mjs"),
    configuration: configPath,
    schema: path.join(fixtureRoot, "output.schema.json"),
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
    artifact: "fixture-024",
    track: "AMR-T01",
    runner_version: FIXTURE_024_RUNNER_VERSION,
    generator_version: FIXTURE_024_GENERATOR_VERSION,
    event_contract_version: FIXTURE_024_EVENT_CONTRACT_VERSION,
    ledger_format: ledgerFormat,
    profile: inputs.profile,
    config: inputs.config,
    config_sha256: inputs.configSha256,
    seeds: inputs.seeds,
    development_seed_document_sha256: inputs.seedsSha256,
    arms: FIXTURE_024_ARMS,
    source_hashes: inputs.sourceHashes,
    input_sha256: inputs.inputSha256,
    partition: "public-development-only",
    confirmation_seed_state: "not-created",
    transfer_seed_state: "not-created",
  };
  return Object.freeze({ ...body, run_id: sha256Hex(canonicalize(body)) });
}

function allWorkUnits(inputs) {
  const units = [];
  for (const seed of inputs.seeds) {
    const systems = generateLinearMemorySystems({ seed, config: inputs.config });
    for (const system of systems) {
      for (const arm of FIXTURE_024_ARMS) units.push(Object.freeze({ seed, system, arm }));
    }
  }
  return Object.freeze(units);
}

function workUnitKey(unit) {
  return `${unit.seed}:${unit.system.system_index}:${unit.arm}`;
}

function exactTrajectory(system, config) {
  const matrix = transitionMatrix(system, config.time_step_s);
  const states = [[system.x0_u, system.y0_u]];
  const count = Math.round(config.horizon_s / config.time_step_s);
  for (let index = 0; index < count; index += 1) {
    states.push(stepLinearState(matrix, states.at(-1)));
  }
  return Object.freeze({ matrix, states: Object.freeze(states) });
}

function predictMarkov(system, config, initialX, steps) {
  const rate = -system.alpha_per_s
    + (system.beta_per_s * system.gamma_per_s) / system.lambda_per_s;
  const factor = Math.exp(rate * config.time_step_s);
  const values = [initialX];
  for (let index = 0; index < steps; index += 1) values.push(values.at(-1) * factor);
  return { values, historyTerms: 0, multiplyAdds: 4 * steps };
}

function recoverPrefixEndY(system, matrix, truthStates, prefixIndex) {
  const previous = truthStates[prefixIndex - 1];
  const currentX = truthStates[prefixIndex][0];
  if (Math.abs(matrix[1]) < 1e-10) {
    return (system.gamma_per_s / system.lambda_per_s) * currentX;
  }
  const previousY = (currentX - matrix[0] * previous[0]) / matrix[1];
  return matrix[2] * previous[0] + matrix[3] * previousY;
}

function predictFiniteMemory(system, config, initialX, initialY, steps) {
  const dt = config.time_step_s;
  const maximumTerms = Math.round(config.memory_window_s / dt);
  const values = [initialX];
  let historyTerms = 0;
  for (let step = 0; step < steps; step += 1) {
    const currentX = values.at(-1);
    const terms = Math.min(step, maximumTerms);
    let memory = 0;
    for (let offset = 1; offset <= terms; offset += 1) {
      const pastIndex = step - offset;
      const lag = offset * dt;
      memory += system.beta_per_s * system.gamma_per_s
        * Math.exp(-system.lambda_per_s * lag) * values[pastIndex] * dt;
    }
    const elapsed = step * dt;
    const transient = system.beta_per_s
      * Math.exp(-system.lambda_per_s * elapsed) * initialY;
    const derivative = -system.alpha_per_s * currentX + transient + memory;
    values.push(currentX + dt * derivative);
    historyTerms += terms;
  }
  return {
    values,
    historyTerms,
    multiplyAdds: 8 * steps + 6 * historyTerms,
  };
}

function predictExactAugmented(matrix, initialState, steps) {
  const values = [initialState[0]];
  let state = initialState;
  for (let index = 0; index < steps; index += 1) {
    state = stepLinearState(matrix, state);
    values.push(state[0]);
  }
  return { values, historyTerms: 0, multiplyAdds: 12 * steps };
}

function finiteOrThrow(value, label) {
  if (!Number.isFinite(value)) throw new Error(`Fixture 024 produced non-finite ${label}.`);
  return value;
}

function simulateWorkUnit(unit, inputs, identity) {
  const { system, arm } = unit;
  const config = inputs.config;
  const truth = exactTrajectory(system, config);
  const prefixIndex = Math.round(config.prefix_s / config.time_step_s);
  const steps = Math.round((config.horizon_s - config.prefix_s) / config.time_step_s);
  const initialState = truth.states[prefixIndex];
  let prediction;
  if (arm === "markov-only") {
    prediction = predictMarkov(system, config, initialState[0], steps);
  } else if (arm === "finite-memory") {
    prediction = predictFiniteMemory(
      system,
      config,
      initialState[0],
      recoverPrefixEndY(system, truth.matrix, truth.states, prefixIndex),
      steps,
    );
  } else {
    prediction = predictExactAugmented(truth.matrix, initialState, steps);
  }
  let squared = 0;
  let maximum = 0;
  for (let offset = 0; offset <= steps; offset += 1) {
    const error = prediction.values[offset] - truth.states[prefixIndex + offset][0];
    squared += error * error;
    maximum = Math.max(maximum, Math.abs(error));
  }
  const rmse = finiteOrThrow(Math.sqrt(squared / (steps + 1)), "RMSE");
  const maxError = finiteOrThrow(maximum, "maximum error");
  const loss = Math.min(config.max_loss, Math.max(0, 100 * rmse / config.state_scale_u));
  const stateReads = arm === "finite-memory" ? steps + prediction.historyTerms : 2 * steps;
  const stateWrites = steps + 1;
  return {
    schema: 1,
    contract_version: FIXTURE_024_EVENT_CONTRACT_VERSION,
    artifact: "fixture-024",
    track: "AMR-T01",
    run_id: identity.run_id,
    profile: inputs.profile,
    pack: "public-development",
    seed: unit.seed,
    system_index: system.system_index,
    world_id: `${unit.seed}:${system.system_index}`,
    arm,
    attempt: 0,
    units: { state: "U", time: "s", rate: "s^-1", kernel: "s^-2" },
    input_sha256: identity.input_sha256,
    parameters: {
      alpha_per_s: system.alpha_per_s,
      beta_per_s: system.beta_per_s,
      gamma_per_s: system.gamma_per_s,
      lambda_per_s: system.lambda_per_s,
      determinant_per_s2: system.determinant_per_s2,
    },
    prefix_end_s: config.prefix_s,
    horizon_s: config.horizon_s,
    memory_window_s: arm === "finite-memory" ? config.memory_window_s : 0,
    final_x_u: finiteOrThrow(prediction.values.at(-1), "final state"),
    rmse_u: rmse,
    max_abs_error_u: maxError,
    loss: finiteOrThrow(loss, "loss"),
    steps,
    history_terms: prediction.historyTerms,
    multiply_add_equivalents: prediction.multiplyAdds,
    bytes_read: stateReads * 8,
    bytes_written: stateWrites * 8,
    status: "development-smoke-only",
    measured_energy_present: false,
    energy_conclusion_allowed: false,
    claim_eligible: false,
    scientific_result: false,
    performance_result: false,
  };
}

export async function executeFixture024({ profile, output, resume = false, maxWorkUnits = Infinity }) {
  if (!Number.isFinite(maxWorkUnits) && maxWorkUnits !== Infinity) {
    throw new Error("maxWorkUnits must be finite or Infinity.");
  }
  if (maxWorkUnits !== Infinity && (!Number.isSafeInteger(maxWorkUnits) || maxWorkUnits < 1)) {
    throw new Error("maxWorkUnits must be a positive integer.");
  }
  const inputs = await loadInputs(profile);
  const identity = runIdentity(inputs);
  const directory = outputDirectory(output);
  const alreadyExists = await exists(directory);
  if (alreadyExists && !resume) throw new Error("Fixture 024 output already exists; use --resume true.");
  if (!alreadyExists && resume) throw new Error("Fixture 024 cannot resume a missing output directory.");
  if (!alreadyExists) {
    await mkdir(path.dirname(directory), { recursive: true });
    await mkdir(directory);
  } else if (!(await stat(directory)).isDirectory()) {
    throw new Error("Fixture 024 output is not a directory.");
  }

  const rawPath = path.join(directory, "raw-events.jsonl");
  const checkpointPath = path.join(directory, "checkpoint.json");
  const ledger = await openCheckpointLedger({
    artifact: "fixture-024",
    ledgerFormat,
    rawPath,
    checkpointPath,
    runIdentity: identity,
    scientificPayload: fixture024ScientificPayload,
    workKey: fixture024WorkKey,
    assertRecord: assertFixture024Record,
  });
  const units = allWorkUnits(inputs);
  const remaining = remainingWorkUnits(units, ledger.completedWorkKeys(), workUnitKey);
  const selected = remaining.slice(0, maxWorkUnits);
  for (const unit of selected) {
    await ledger.append(simulateWorkUnit(unit, inputs, identity));
    await ledger.saveCheckpoint();
  }
  const complete = ledger.summary().completed_work_units === units.length;
  if (!complete) {
    return Object.freeze({ directory, complete: false, run_id: identity.run_id, ledger: ledger.summary() });
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
    scientific_result: false,
    performance_result: false,
    interpretation: "Development-only deterministic smoke plumbing; no comparison is claim-eligible.",
  };
  await writeJsonStable(path.join(directory, "run.json"), run);
  return Object.freeze({ directory, complete: true, run });
}

async function readValidatedRecords(directory) {
  const rawPath = path.join(directory, "raw-events.jsonl");
  const text = await readFile(rawPath, "utf8");
  if (text.length > 0 && !text.endsWith("\n")) {
    throw new Error("Fixture 024 raw ledger has a torn trailing record.");
  }
  const lines = text.split(/\r?\n/u).filter(Boolean);
  const records = [];
  const seen = new Set();
  let previousHash = "0".repeat(64);
  const payloadDigest = createHash("sha256");
  for (const [sequence, line] of lines.entries()) {
    const record = JSON.parse(line);
    assertFixture024Record(record, { sequence, previousHash });
    const key = fixture024WorkKey(record);
    if (seen.has(key)) throw new Error(`Duplicate Fixture 024 work unit ${key}.`);
    seen.add(key);
    payloadDigest.update(canonicalize(fixture024ScientificPayload(record)));
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
  return {
    records: rows.length,
    mean_rmse_u: mean(rows, "rmse_u"),
    max_abs_error_u: Math.max(...rows.map((row) => row.max_abs_error_u)),
    mean_loss: mean(rows, "loss"),
    multiply_add_equivalents: rows.reduce((sum, row) => sum + row.multiply_add_equivalents, 0),
    history_terms: rows.reduce((sum, row) => sum + row.history_terms, 0),
    bytes_read: rows.reduce((sum, row) => sum + row.bytes_read, 0),
    bytes_written: rows.reduce((sum, row) => sum + row.bytes_written, 0),
  };
}

export async function computeFixture024Analysis(output) {
  const directory = outputDirectory(output);
  const run = await loadJson(path.join(directory, "run.json"));
  const inputs = await loadInputs(run.profile);
  const identity = runIdentity(inputs);
  if (run.run_id !== identity.run_id || canonical(run.source_hashes) !== canonical(identity.source_hashes)) {
    throw new Error("Fixture 024 run identity differs from current frozen inputs or sources.");
  }
  const [raw, ledger] = await Promise.all([
    readValidatedRecords(directory),
    openCheckpointLedger({
      artifact: "fixture-024",
      ledgerFormat,
      rawPath: path.join(directory, "raw-events.jsonl"),
      checkpointPath: path.join(directory, "checkpoint.json"),
      runIdentity: identity,
      scientificPayload: fixture024ScientificPayload,
      workKey: fixture024WorkKey,
      assertRecord: assertFixture024Record,
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
  ) throw new Error("Fixture 024 run, checkpoint, and raw ledger disagree.");
  const metrics = Object.fromEntries(FIXTURE_024_ARMS.map((arm) => [arm, armMetrics(raw.records, arm)]));
  const exactRows = raw.records.filter((record) => record.arm === "exact-augmented-state");
  const checks = {
    expected_development_records_present: raw.records.length === run.expected_work_units,
    outputs_finite_and_clipped: raw.records.every((record) => (
      Number.isFinite(record.final_x_u)
      && Number.isFinite(record.rmse_u)
      && Number.isFinite(record.max_abs_error_u)
      && Number.isFinite(record.loss)
      && record.loss >= 0
      && record.loss <= 100
    )),
    exact_augmented_state_matches_evaluator: exactRows.every((record) => record.max_abs_error_u <= 1e-12),
    finite_memory_charges_history: metrics["finite-memory"].history_terms > 0,
    authority_boundary_is_uniform: raw.records.every((record) => (
      record.measured_energy_present === false
      && record.energy_conclusion_allowed === false
      && record.claim_eligible === false
      && record.scientific_result === false
      && record.performance_result === false
    )),
  };
  const passed = Object.values(checks).every(Boolean);
  return {
    schema: 1,
    artifact: "fixture-024",
    track: "AMR-T01",
    contract_version: "fixture-024.amr-t01-analysis.v1",
    run_id: run.run_id,
    profile: run.profile,
    raw_events_sha256: raw.rawSha256,
    run_sha256: sha256(canonical(run)),
    metrics,
    checks,
    decision: passed ? "diagnostic-pass" : "diagnostic-fail",
    comparison_inference_permitted: false,
    measured_energy_present: false,
    energy_conclusion_allowed: false,
    claim_eligible: false,
    scientific_result: false,
    performance_result: false,
    no_result: true,
    interpretation: "NO_RESULT: development-only smoke validation of deterministic generation, three arm paths, accounting, and corruption-evident resume.",
  };
}

export async function analyzeFixture024(output) {
  const directory = outputDirectory(output);
  const summary = await computeFixture024Analysis(output);
  await mkdir(path.join(directory, "analysis"), { recursive: true });
  await writeJsonStable(path.join(directory, "analysis", "summary.json"), summary);
  if (summary.decision !== "diagnostic-pass") {
    throw new Error("Fixture 024 development smoke diagnostics failed.");
  }
  return summary;
}

export async function validateFixture024Output(output) {
  const directory = outputDirectory(output);
  const [expected, stored] = await Promise.all([
    computeFixture024Analysis(output),
    loadJson(path.join(directory, "analysis", "summary.json")),
  ]);
  if (canonical(expected) !== canonical(stored)) {
    throw new Error("Fixture 024 stored analysis is not reproducible from raw events.");
  }
  if (
    stored.comparison_inference_permitted !== false
    || stored.energy_conclusion_allowed !== false
    || stored.claim_eligible !== false
    || stored.scientific_result !== false
    || stored.performance_result !== false
    || stored.no_result !== true
  ) throw new Error("Fixture 024 smoke output attempts to claim scientific authority.");
  return Object.freeze({ valid: true, run_id: stored.run_id, decision: stored.decision, no_result: true });
}

export async function prepareFixture024(profile) {
  const inputs = await loadInputs(profile);
  return Object.freeze({
    valid: true,
    artifact: "fixture-024",
    track: "AMR-T01",
    profile,
    partition: "public-development-only",
    seeds: inputs.seeds.length,
    opportunities_per_seed: inputs.config.opportunities_per_seed,
    work_units: inputs.seeds.length * inputs.config.opportunities_per_seed * FIXTURE_024_ARMS.length,
    confirmation_seeds_created: false,
    transfer_seeds_created: false,
    measured_energy_required: false,
    energy_conclusion_allowed: false,
    claim_eligible: false,
    no_result: true,
  });
}

export async function main(argv = process.argv) {
  const { action, options } = parseOptions(argv);
  if (action === "prepare") return prepareFixture024(options.profile);
  if (action === "smoke") {
    await executeFixture024({
      profile: options.profile,
      output: options.output,
      resume: options.resume === "true",
    });
    await analyzeFixture024(options.output);
    return validateFixture024Output(options.output);
  }
  if (action === "run") {
    return executeFixture024({
      profile: options.profile,
      output: options.output,
      resume: options.resume === "true",
    });
  }
  if (action === "analyze") return analyzeFixture024(options.output);
  return validateFixture024Output(options.output);
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
