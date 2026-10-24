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
  FIXTURE_025_ARMS,
  FIXTURE_025_EVENT_CONTRACT_VERSION,
  assertFixture025Record,
  canonical,
  fixture025ScientificPayload,
  fixture025WorkKey,
  sha256,
} from "./contract.mjs";
import {
  FIXTURE_025_GENERATOR_VERSION,
  FIXTURE_025_SENTINEL_INDICES,
  diagnosticBundle,
  generateFixture025Worlds,
  terminalImpedance,
  validateExposedSpectrum,
  validateFixture025Config,
} from "./generator.mjs";
import {
  FIXTURE_025_AUDIT_SHA256,
  assertFixture025Registry,
  extractFixture025Registry,
} from "./registry.mjs";

export const FIXTURE_025_RUNNER_VERSION = "fixture-025.ecm-t03-runner.v1";

const fixtureRoot = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(fixtureRoot, "../../..");
const ledgerFormat = "fixture-025.ecm-t03-ledger.v1";
const sourceFiles = Object.freeze([
  "../lib/checkpoint-ledger.mjs",
  "../lib/exact-keys.mjs",
  "../lib/pcg64-dxsm.mjs",
  "../lib/stream-seed.mjs",
  "contract.mjs",
  "generator.mjs",
  "registry.mjs",
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
    throw new Error("Fixture 025 action must be prepare, smoke, run, analyze, or validate; private partitions are not executable.");
  }
  if ((argv.length - 3) % 2 !== 0) throw new Error("Options require explicit --name value pairs.");
  const options = {};
  for (let index = 3; index < argv.length; index += 2) {
    const token = argv[index];
    const value = argv[index + 1];
    if (!/^--[a-z][a-z-]*$/.test(token ?? "") || !value || value.startsWith("--")) {
      throw new Error("Fixture 025 options require explicit --name value pairs.");
    }
    const key = token.slice(2);
    if (!new Set(["profile", "output", "resume"]).has(key) || Object.hasOwn(options, key)) {
      throw new Error(`Unknown or duplicate Fixture 025 option --${key}.`);
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
    throw new Error("Fixture 025 output must stay inside the repository.");
  }
  return resolved;
}

function validateDevelopmentSeeds(document) {
  if (
    document?.schema !== 1
    || document.artifact !== "fixture-025"
    || document.partition !== "development"
    || document.state !== "public-development"
    || document.algorithm !== "literal-public-seed-list-v1"
    || !Array.isArray(document.seeds)
    || document.seeds.length < 2
    || document.seeds.some((seed) => !Number.isSafeInteger(seed) || seed < 0 || seed > 0xffff_ffff)
    || new Set(document.seeds).size !== document.seeds.length
  ) throw new Error("Fixture 025 development seed document is invalid.");
  return document;
}

async function loadInputs(profile) {
  const configPath = path.join(fixtureRoot, "configs", `${profile}.json`);
  const seedsPath = path.join(fixtureRoot, "seeds", "development.reveal.json");
  const fixturePath = path.join(repositoryRoot, "experiments", "fixtures", "025-electrochemistry-interface-memory-degradation.md");
  const auditPath = path.join(repositoryRoot, "research", "audits", "2026-08-25-electrochemistry-interface-memory-degradation.md");
  const [config, seedDocument, fixtureMarkdown, auditSha256] = await Promise.all([
    loadJson(configPath),
    loadJson(seedsPath),
    readFile(fixturePath, "utf8"),
    fileSha256(auditPath),
  ]);
  validateFixture025Config(config);
  validateDevelopmentSeeds(seedDocument);
  assertFixture025Registry(extractFixture025Registry(fixtureMarkdown));
  if (auditSha256.toUpperCase() !== FIXTURE_025_AUDIT_SHA256) {
    throw new Error("Fixture 025 audit snapshot differs from the reviewed execution boundary.");
  }
  if (config.profile !== profile) throw new Error("Fixture 025 profile/config mismatch.");
  const seeds = profile === "smoke" ? seedDocument.seeds.slice(0, 2) : seedDocument.seeds;
  const sourceEntries = await Promise.all(sourceFiles.map(async (relative) => {
    const absolute = path.resolve(fixtureRoot, relative);
    return [relative.replaceAll("\\", "/"), await fileSha256(absolute)];
  }));
  const immutableInputs = {
    audit: auditPath,
    fixture: fixturePath,
    runner: path.join(fixtureRoot, "runner.mjs"),
    generator: path.join(fixtureRoot, "generator.mjs"),
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
    artifact: "fixture-025",
    track: "ECM-T03",
    runner_version: FIXTURE_025_RUNNER_VERSION,
    generator_version: FIXTURE_025_GENERATOR_VERSION,
    event_contract_version: FIXTURE_025_EVENT_CONTRACT_VERSION,
    ledger_format: ledgerFormat,
    profile: inputs.profile,
    config: inputs.config,
    config_sha256: inputs.configSha256,
    seeds: inputs.seeds,
    development_seed_document_sha256: inputs.seedsSha256,
    arms: FIXTURE_025_ARMS,
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
    for (const world of generateFixture025Worlds({ seed, config: inputs.config })) {
      for (const arm of FIXTURE_025_ARMS) units.push(Object.freeze({ seed, world, arm }));
    }
  }
  return Object.freeze(units);
}

function workUnitKey(unit) {
  return `${unit.seed}:${unit.world.world_index}:${unit.arm}`;
}

function bounded(value) {
  if (!Number.isFinite(value)) throw new Error("Fixture 025 produced a non-finite diagnostic value.");
  return Math.min(1, Math.max(0, value));
}

function fitError(world) {
  let total = 0;
  for (const sample of world.samples) {
    const reference = terminalImpedance(world.parameters, sample.frequency_hz);
    const scale = Math.max(Math.hypot(reference.re, reference.im), 1e-12);
    total += Math.hypot(sample.z_re_ohm - reference.re, sample.z_im_ohm - reference.im) / scale;
  }
  return bounded(total / world.samples.length);
}

function expectedDecision(worldClass) {
  if (worldClass === "schema-provenance-invalid") return "record-invalid";
  if (worldClass === "kk-inconsistent") return "physics-invalid";
  if (worldClass === "nonlinear-out-of-scope") return "nonlinear-out-of-scope";
  if (worldClass === "valid-equivalent") return "valid-nonidentifying";
  return "valid-candidate-set";
}

function armDecision(world, arm, config) {
  const exposed = validateExposedSpectrum(world.samples);
  if (arm === "ungated-fit") {
    return {
      decision: "valid-candidate-set",
      ...Object.fromEntries(Object.keys(exposed).map((key) => [key, true])),
      amplitude_linear: true,
      kk_consistent: true,
      identifying: true,
      candidate_set_size: 1,
      bundles: [],
      mechanism_fits: 1,
    };
  }
  if (arm === "residual-screen") {
    const bundles = [30, 22, 38].map((index) => diagnosticBundle(world, index));
    const kkConsistent = Math.max(...bundles.map((bundle) => bundle.repeat_residual)) <= config.repeat_residual_threshold;
    return {
      decision: kkConsistent ? "valid-candidate-set" : "physics-invalid",
      schema_valid: true,
      ordering_valid: true,
      checksum_valid: true,
      unit_valid: true,
      calibration_valid: true,
      amplitude_linear: true,
      kk_consistent: kkConsistent,
      identifying: kkConsistent,
      candidate_set_size: kkConsistent ? 1 : 0,
      bundles,
      mechanism_fits: kkConsistent ? 1 : 0,
    };
  }
  if (!exposed.schema_valid) {
    return {
      decision: "record-invalid",
      ...exposed,
      amplitude_linear: false,
      kk_consistent: false,
      identifying: false,
      candidate_set_size: 0,
      bundles: [],
      mechanism_fits: 0,
    };
  }
  const firstBundles = [30, 22, 38].map((index) => diagnosticBundle(world, index));
  const amplitudeLinear = Math.max(...firstBundles.map((bundle) => bundle.harmonic_ratio)) <= config.harmonic_ratio_threshold;
  if (!amplitudeLinear) {
    return {
      decision: "nonlinear-out-of-scope",
      ...exposed,
      amplitude_linear: false,
      kk_consistent: false,
      identifying: false,
      candidate_set_size: 0,
      bundles: firstBundles,
      mechanism_fits: 0,
    };
  }
  const remaining = FIXTURE_025_SENTINEL_INDICES
    .filter((index) => !new Set([30, 22, 38]).has(index))
    .map((index) => diagnosticBundle(world, index));
  const bundles = [...firstBundles, ...remaining];
  const kkConsistent = Math.max(...bundles.map((bundle) => bundle.repeat_residual)) <= config.repeat_residual_threshold;
  if (!kkConsistent) {
    return {
      decision: "physics-invalid",
      ...exposed,
      amplitude_linear: true,
      kk_consistent: false,
      identifying: false,
      candidate_set_size: 0,
      bundles,
      mechanism_fits: 0,
    };
  }
  const equivalent = world.world_class === "valid-equivalent";
  return {
    decision: equivalent ? "valid-nonidentifying" : "valid-candidate-set",
    ...exposed,
    amplitude_linear: true,
    kk_consistent: true,
    identifying: !equivalent,
    candidate_set_size: equivalent ? world.equivalent_graphs : 1,
    bundles,
    mechanism_fits: 1,
  };
}

function simulateWorkUnit(unit, inputs, identity) {
  const { world, arm } = unit;
  const result = armDecision(world, arm, inputs.config);
  const expected = expectedDecision(world.world_class);
  const validWorld = world.world_class === "valid-identifying" || world.world_class === "valid-equivalent";
  const invalidError = validWorld ? 0 : Number(result.decision !== expected);
  const falseRejectError = validWorld ? Number(!result.decision.startsWith("valid-")) : 0;
  const overclaimError = world.world_class === "valid-equivalent"
    ? Number(result.candidate_set_size < world.equivalent_graphs)
    : 0;
  const candidateError = validWorld
    ? Number(result.decision !== expected || result.candidate_set_size < world.equivalent_graphs)
    : 0;
  const fittedError = fitError(world);
  const loss = Math.min(inputs.config.max_loss, (
    35 * invalidError
    + 20 * falseRejectError
    + 25 * overclaimError
    + 10 * candidateError
    + 10 * fittedError
  ));
  const bundleBytes = result.bundles.reduce((sum, bundle) => sum + bundle.bytes, 0);
  return {
    schema: 1,
    contract_version: FIXTURE_025_EVENT_CONTRACT_VERSION,
    artifact: "fixture-025",
    track: "ECM-T03",
    run_id: identity.run_id,
    profile: inputs.profile,
    pack: "public-development",
    seed: unit.seed,
    world_index: world.world_index,
    world_id: `${unit.seed}:${world.world_index}`,
    arm,
    attempt: 0,
    units: { impedance: "Ohm", frequency: "Hz", time: "s", amplitude: "V", bytes: "B" },
    input_sha256: identity.input_sha256,
    oracle_class: world.world_class,
    corruption: world.corruption,
    decision: result.decision,
    schema_valid: result.schema_valid,
    ordering_valid: result.ordering_valid,
    checksum_valid: result.checksum_valid,
    unit_valid: result.unit_valid,
    calibration_valid: result.calibration_valid,
    amplitude_linear: result.amplitude_linear,
    kk_consistent: result.kk_consistent,
    identifying: result.identifying,
    candidate_set_size: result.candidate_set_size,
    diagnostic_bundles: result.bundles.length,
    mechanism_fits: result.mechanism_fits,
    samples_read: 49 + result.bundles.length,
    bytes_read: 49 * 93 + bundleBytes,
    bytes_written: 512 + 64 * result.candidate_set_size,
    multiply_add_equivalents: 61 * world.parameters.circuit_order * 24 + result.bundles.length * 64 + result.mechanism_fits * 2048,
    invalid_error: invalidError,
    false_reject_error: falseRejectError,
    overclaim_error: overclaimError,
    candidate_error: candidateError,
    fit_error: fittedError,
    loss,
    status: "development-smoke-only",
    measured_energy_present: false,
    energy_conclusion_allowed: false,
    claim_eligible: false,
    scientific_result: false,
    performance_result: false,
  };
}

export async function executeFixture025({ profile, output, resume = false, maxWorkUnits = Infinity }) {
  if (!Number.isFinite(maxWorkUnits) && maxWorkUnits !== Infinity) throw new Error("maxWorkUnits must be finite or Infinity.");
  if (maxWorkUnits !== Infinity && (!Number.isSafeInteger(maxWorkUnits) || maxWorkUnits < 1)) {
    throw new Error("maxWorkUnits must be a positive integer.");
  }
  const inputs = await loadInputs(profile);
  const identity = runIdentity(inputs);
  const directory = outputDirectory(output);
  const alreadyExists = await exists(directory);
  if (alreadyExists && !resume) throw new Error("Fixture 025 output already exists; use --resume true.");
  if (!alreadyExists && resume) throw new Error("Fixture 025 cannot resume a missing output directory.");
  if (!alreadyExists) {
    await mkdir(path.dirname(directory), { recursive: true });
    await mkdir(directory);
  } else if (!(await stat(directory)).isDirectory()) {
    throw new Error("Fixture 025 output is not a directory.");
  }
  const rawPath = path.join(directory, "raw-events.jsonl");
  const checkpointPath = path.join(directory, "checkpoint.json");
  const ledger = await openCheckpointLedger({
    artifact: "fixture-025",
    ledgerFormat,
    rawPath,
    checkpointPath,
    runIdentity: identity,
    scientificPayload: fixture025ScientificPayload,
    workKey: fixture025WorkKey,
    assertRecord: assertFixture025Record,
  });
  const units = allWorkUnits(inputs);
  const remaining = remainingWorkUnits(units, ledger.completedWorkKeys(), workUnitKey);
  for (const unit of remaining.slice(0, maxWorkUnits)) {
    await ledger.append(simulateWorkUnit(unit, inputs, identity));
    await ledger.saveCheckpoint();
  }
  const complete = ledger.summary().completed_work_units === units.length;
  if (!complete) return Object.freeze({ directory, complete: false, run_id: identity.run_id, ledger: ledger.summary() });
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
    interpretation: "Development-only ECM-T03 gate-order smoke plumbing; no comparison is claim-eligible.",
  };
  await writeJsonStable(path.join(directory, "run.json"), run);
  return Object.freeze({ directory, complete: true, run });
}

async function readValidatedRecords(directory) {
  const rawPath = path.join(directory, "raw-events.jsonl");
  const text = await readFile(rawPath, "utf8");
  if (text.length > 0 && !text.endsWith("\n")) throw new Error("Fixture 025 raw ledger has a torn trailing record.");
  const lines = text.split(/\r?\n/u).filter(Boolean);
  const records = [];
  const seen = new Set();
  let previousHash = "0".repeat(64);
  const payloadDigest = createHash("sha256");
  for (const [sequence, line] of lines.entries()) {
    const record = JSON.parse(line);
    assertFixture025Record(record, { sequence, previousHash });
    const key = fixture025WorkKey(record);
    if (seen.has(key)) throw new Error(`Duplicate Fixture 025 work unit ${key}.`);
    seen.add(key);
    payloadDigest.update(canonicalize(fixture025ScientificPayload(record)));
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
    mean_invalid_error: mean(rows, "invalid_error"),
    mean_false_reject_error: mean(rows, "false_reject_error"),
    mean_overclaim_error: mean(rows, "overclaim_error"),
    mean_candidate_error: mean(rows, "candidate_error"),
    mean_fit_error: mean(rows, "fit_error"),
    mean_loss: mean(rows, "loss"),
    diagnostic_bundles: rows.reduce((sum, row) => sum + row.diagnostic_bundles, 0),
    mechanism_fits: rows.reduce((sum, row) => sum + row.mechanism_fits, 0),
    bytes_read: rows.reduce((sum, row) => sum + row.bytes_read, 0),
    multiply_add_equivalents: rows.reduce((sum, row) => sum + row.multiply_add_equivalents, 0),
  };
}

export async function computeFixture025Analysis(output) {
  const directory = outputDirectory(output);
  const run = await loadJson(path.join(directory, "run.json"));
  const inputs = await loadInputs(run.profile);
  const identity = runIdentity(inputs);
  if (run.run_id !== identity.run_id || canonical(run.source_hashes) !== canonical(identity.source_hashes)) {
    throw new Error("Fixture 025 run identity differs from current frozen inputs or sources.");
  }
  const [raw, ledger] = await Promise.all([
    readValidatedRecords(directory),
    openCheckpointLedger({
      artifact: "fixture-025",
      ledgerFormat,
      rawPath: path.join(directory, "raw-events.jsonl"),
      checkpointPath: path.join(directory, "checkpoint.json"),
      runIdentity: identity,
      scientificPayload: fixture025ScientificPayload,
      workKey: fixture025WorkKey,
      assertRecord: assertFixture025Record,
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
  ) throw new Error("Fixture 025 run, checkpoint, and raw ledger disagree.");
  const metrics = Object.fromEntries(FIXTURE_025_ARMS.map((arm) => [arm, armMetrics(raw.records, arm)]));
  const ordered = raw.records.filter((record) => record.arm === "ordered-validity-gate");
  const checks = {
    expected_development_records_present: raw.records.length === run.expected_work_units,
    every_seed_is_class_balanced: inputs.seeds.every((seed) => {
      const rows = ordered.filter((record) => record.seed === seed);
      const counts = Object.fromEntries([...new Set(rows.map((row) => row.oracle_class))].map((label) => [label, rows.filter((row) => row.oracle_class === label).length]));
      return Object.keys(counts).length === 5 && new Set(Object.values(counts)).size === 1;
    }),
    schema_gate_precedes_physics: ordered.filter((record) => record.oracle_class === "schema-provenance-invalid").every((record) => record.decision === "record-invalid" && record.diagnostic_bundles === 0),
    amplitude_gate_precedes_kk: ordered.filter((record) => record.oracle_class === "nonlinear-out-of-scope").every((record) => record.decision === "nonlinear-out-of-scope" && record.diagnostic_bundles === 3),
    kk_path_uses_full_registered_menu: ordered.filter((record) => record.oracle_class === "kk-inconsistent").every((record) => record.decision === "physics-invalid" && record.diagnostic_bundles === 9),
    equivalence_is_not_unique_mechanism: ordered.filter((record) => record.oracle_class === "valid-equivalent").every((record) => record.decision === "valid-nonidentifying" && record.candidate_set_size === 2 && record.overclaim_error === 0),
    ungated_arm_never_buys_probes: raw.records.filter((record) => record.arm === "ungated-fit").every((record) => record.diagnostic_bundles === 0),
    authority_boundary_is_uniform: raw.records.every((record) => record.measured_energy_present === false && record.energy_conclusion_allowed === false && record.claim_eligible === false && record.scientific_result === false && record.performance_result === false),
  };
  const passed = Object.values(checks).every(Boolean);
  return {
    schema: 1,
    artifact: "fixture-025",
    track: "ECM-T03",
    contract_version: "fixture-025.ecm-t03-analysis.v1",
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
    interpretation: "NO_RESULT: public-development smoke validation of ECM-T03 generation, gate precedence, equivalence reporting, accounting, and corruption-evident resume.",
  };
}

export async function analyzeFixture025(output) {
  const directory = outputDirectory(output);
  const summary = await computeFixture025Analysis(output);
  await mkdir(path.join(directory, "analysis"), { recursive: true });
  await writeJsonStable(path.join(directory, "analysis", "summary.json"), summary);
  if (summary.decision !== "diagnostic-pass") throw new Error("Fixture 025 development smoke diagnostics failed.");
  return summary;
}

export async function validateFixture025Output(output) {
  const directory = outputDirectory(output);
  const [expected, stored] = await Promise.all([
    computeFixture025Analysis(output),
    loadJson(path.join(directory, "analysis", "summary.json")),
  ]);
  if (canonical(expected) !== canonical(stored)) throw new Error("Fixture 025 stored analysis is not reproducible from raw events.");
  if (stored.comparison_inference_permitted !== false || stored.energy_conclusion_allowed !== false || stored.claim_eligible !== false || stored.scientific_result !== false || stored.performance_result !== false || stored.no_result !== true) {
    throw new Error("Fixture 025 smoke output attempts to claim scientific authority.");
  }
  return Object.freeze({ valid: true, run_id: stored.run_id, decision: stored.decision, no_result: true });
}

export async function prepareFixture025(profile) {
  const inputs = await loadInputs(profile);
  return Object.freeze({
    valid: true,
    artifact: "fixture-025",
    track: "ECM-T03",
    profile,
    partition: "public-development-only",
    seeds: inputs.seeds.length,
    worlds_per_seed: inputs.config.worlds_per_seed,
    work_units: inputs.seeds.length * inputs.config.worlds_per_seed * FIXTURE_025_ARMS.length,
    implemented_tracks: 1,
    registered_tracks: 10,
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
  if (action === "prepare") return prepareFixture025(options.profile);
  if (action === "smoke") {
    await executeFixture025({ profile: options.profile, output: options.output, resume: options.resume === "true" });
    await analyzeFixture025(options.output);
    return validateFixture025Output(options.output);
  }
  if (action === "run") return executeFixture025({ profile: options.profile, output: options.output, resume: options.resume === "true" });
  if (action === "analyze") return analyzeFixture025(options.output);
  return validateFixture025Output(options.output);
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
