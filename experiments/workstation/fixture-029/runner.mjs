import { createHash } from "node:crypto";
import { access, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  canonicalize, openCheckpointLedger, remainingWorkUnits, sha256Hex,
} from "../lib/checkpoint-ledger.mjs";
import {
  FIXTURE_029_EVENT_CONTRACT_VERSION, FIXTURE_029_INTERPRETATION,
  assertFixture029Record, canonical, fixture029ScientificPayload, fixture029WorkKey,
} from "./contract.mjs";
import {
  FIXTURE_029_ARMS, FIXTURE_029_GENERATOR_VERSION, generateFixture029Worlds,
  simulateFixture029Arm, validateFixture029Config,
} from "./generator.mjs";

export const FIXTURE_029_RUNNER_VERSION = "fixture-029.cmb-x04-runner.v3";

const fixtureRoot = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(fixtureRoot, "../../..");
const ledgerFormat = "fixture-029.cmb-x04-ledger.v2";
const sourceFiles = ["../lib/checkpoint-ledger.mjs", "contract.mjs", "generator.mjs", "output.schema.json", "runner.mjs"];

async function exists(file) {
  try { await access(file); return true; } catch { return false; }
}

async function loadJson(file) {
  return JSON.parse(await readFile(file, "utf8"));
}

async function fileSha256(file) {
  return createHash("sha256").update(await readFile(file)).digest("hex");
}

function isInside(root, target) {
  const relative = path.relative(root, target);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function outputDirectory(value) {
  const resolved = path.resolve(repositoryRoot, value);
  if (!isInside(repositoryRoot, resolved) || resolved === repositoryRoot) {
    throw new Error("Fixture 029 output must stay inside the repository.");
  }
  return resolved;
}

async function writeJsonStable(file, value) {
  const body = `${JSON.stringify(value, null, 2)}\n`;
  try {
    await writeFile(file, body, { flag: "wx" });
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
    if (canonical(JSON.parse(await readFile(file, "utf8"))) !== canonical(value)) {
      throw new Error(`Refusing to replace non-identical ${path.basename(file)}.`, { cause: error });
    }
  }
}

function validateSeeds(document) {
  if (
    document?.schema !== 1 || document.artifact !== "fixture-029"
    || document.partition !== "development" || document.state !== "public-development"
    || document.algorithm !== "literal-public-seed-list-v1"
    || document.encoding !== "unsigned-little-endian-uint32"
    || !Array.isArray(document.seeds) || document.seeds.length < 2
    || document.seeds.some((seed) => !Number.isSafeInteger(seed) || seed < 0 || seed > 0xffff_ffff)
    || new Set(document.seeds).size !== document.seeds.length
  ) throw new Error("Fixture 029 public development seed document is invalid.");
  return document;
}

async function loadInputs(profile) {
  if (!new Set(["smoke", "development"]).has(profile)) throw new Error("Fixture 029 profile is invalid.");
  const configPath = path.join(fixtureRoot, "configs", `${profile}.json`);
  const seedPath = path.join(fixtureRoot, "seeds", "development.reveal.json");
  const fixturePath = path.join(repositoryRoot, "experiments", "fixtures", "029-clinical-biotechnology-endogenous-machinery.md");
  const auditPath = path.join(repositoryRoot, "research", "audits", "2026-08-27-clinical-biotechnology-endogenous-machinery.md");
  const [config, seedDocument] = await Promise.all([loadJson(configPath), loadJson(seedPath)]);
  validateFixture029Config(config);
  validateSeeds(seedDocument);
  if (config.profile !== profile) throw new Error("Fixture 029 profile/config mismatch.");
  const sourceEntries = await Promise.all(sourceFiles.map(async (relative) => [
    relative.replaceAll("\\", "/"), await fileSha256(path.resolve(fixtureRoot, relative)),
  ]));
  const immutableFiles = {
    audit: auditPath,
    fixture: fixturePath,
    contract: path.join(fixtureRoot, "contract.mjs"),
    generator: path.join(fixtureRoot, "generator.mjs"),
    runner: path.join(fixtureRoot, "runner.mjs"),
    schema: path.join(fixtureRoot, "output.schema.json"),
    configuration: configPath,
    seed_pack: seedPath,
  };
  const inputSha256 = Object.fromEntries(await Promise.all(Object.entries(immutableFiles)
    .map(async ([key, file]) => [key, await fileSha256(file)])));
  return Object.freeze({
    profile, config, configPath, configSha256: await fileSha256(configPath),
    seeds: profile === "smoke" ? seedDocument.seeds.slice(0, 2) : seedDocument.seeds,
    seedPath, seedSha256: await fileSha256(seedPath),
    sourceHashes: Object.freeze(Object.fromEntries(sourceEntries)),
    inputSha256: Object.freeze(inputSha256),
  });
}

function runIdentity(inputs) {
  const body = {
    schema: 1,
    artifact: "fixture-029",
    track: "CMB-X04",
    execution_claims: ["C-1580"],
    runner_version: FIXTURE_029_RUNNER_VERSION,
    generator_version: FIXTURE_029_GENERATOR_VERSION,
    event_contract_version: FIXTURE_029_EVENT_CONTRACT_VERSION,
    ledger_format: ledgerFormat,
    profile: inputs.profile,
    config: inputs.config,
    config_sha256: inputs.configSha256,
    seeds: inputs.seeds,
    development_seed_document_sha256: inputs.seedSha256,
    arms: FIXTURE_029_ARMS,
    source_hashes: inputs.sourceHashes,
    input_sha256: inputs.inputSha256,
    random_stream_domain: "F029/seed/world/artifact/stream/attempt; arm-excluded",
    partition: "public-development-only",
    confirmation_seed_state: "not-created",
    held_out_seed_state: "not-created",
  };
  return Object.freeze({ ...body, run_id: sha256Hex(canonicalize(body)) });
}

function allWorkUnits(inputs) {
  const units = [];
  for (const seed of inputs.seeds) {
    for (const world of generateFixture029Worlds({ seed, config: inputs.config })) {
      for (const arm of FIXTURE_029_ARMS) units.push(Object.freeze({ seed, world, arm }));
    }
  }
  return Object.freeze(units);
}

function workUnitKey(unit) {
  return `${unit.seed}:${unit.world.world_index}:${unit.arm}`;
}

function eventFor(unit, inputs, identity) {
  const simulation = simulateFixture029Arm({
    seed: unit.seed, world: unit.world, arm: unit.arm, config: inputs.config,
  });
  const p = unit.world.evaluator_parameters;
  return {
    schema: 1,
    contract_version: FIXTURE_029_EVENT_CONTRACT_VERSION,
    artifact: "fixture-029",
    track: "CMB-X04",
    claim_scope: ["C-1580"],
    run_id: identity.run_id,
    profile: inputs.profile,
    pack: "public-development",
    seed: unit.seed,
    world_index: unit.world.world_index,
    world_id: unit.world.world_id,
    arm: unit.arm,
    attempt: 0,
    units: { artifact: "artifact", service: "NSU", time: "step", bytes: "B", energy: "not-measured" },
    input_sha256: inputs.inputSha256,
    generator_family: unit.world.generator_family,
    public_contract: unit.world.public_contract,
    policy_input_sha256: simulation.policy_input_sha256,
    policy_action_sha256: simulation.policy_action_sha256,
    policy_oracle_access: simulation.policy_oracle_access,
    evaluator_opened_after_action: true,
    action_authority: "validate-retry-replicate-reload-rebuild-wrap-release-with-declared-limits",
    evaluator_parameters: p,
    counterfactual_draw_domain: "F029/seed/world/artifact/stream/attempt; arm-excluded",
    mechanism: {
      transit_hazard_present: p.transit_hazard_per_stage > 0,
      release_enabled: p.release_probability > 0,
      wrapper_compatible: p.latent_compatible,
      release_cue_valid: p.release_cue_valid,
      short_lifetime: p.useful_lifetime_steps <= p.transit_stages + 1,
    },
    outcomes: simulation.outcomes,
    resources: simulation.resources,
    gates: simulation.gates,
    process_metadata: simulation.process_metadata,
    maximum_simultaneous_copies_observed: simulation.maximum_simultaneous_copies_observed,
    maximum_lifetime_copies_observed: simulation.maximum_lifetime_copies_observed,
    status: "development-smoke-only",
    result_label: "NO_RESULT",
    no_result: true,
    measured_energy_present: false,
    energy_conclusion_allowed: false,
    claim_eligible: false,
    comparison_inference_permitted: false,
    scientific_result: false,
    performance_result: false,
    interpretation: FIXTURE_029_INTERPRETATION,
  };
}

function auditExactRecordSet(records, inputs, identity) {
  const expectedUnits = allWorkUnits(inputs);
  if (records.length !== expectedUnits.length) {
    throw new Error("Fixture 029 CMB-X04 record set has a missing or unexpected work unit.");
  }
  const byWorkKey = new Map();
  for (const record of records) {
    const key = fixture029WorkKey(record);
    if (byWorkKey.has(key)) throw new Error(`Fixture 029 CMB-X04 duplicate work unit ${key}.`);
    byWorkKey.set(key, record);
  }
  for (const unit of expectedUnits) {
    const key = workUnitKey(unit);
    const record = byWorkKey.get(key);
    if (!record) throw new Error(`Fixture 029 CMB-X04 record set is missing work unit ${key}.`);
    const regenerated = eventFor(unit, inputs, identity);
    if (canonical(fixture029ScientificPayload(record)) !== canonical(regenerated)) {
      throw new Error(`Fixture 029 CMB-X04 independently regenerated payload differs for ${key}.`);
    }
  }
  return true;
}

function runBoundValidator(identity, inputs) {
  return (record, state) => assertFixture029Record(record, {
    ...state, runId: identity.run_id, profile: inputs.profile, inputSha256: inputs.inputSha256,
  });
}

export async function prepareFixture029(profile) {
  const inputs = await loadInputs(profile);
  const units = allWorkUnits(inputs);
  return Object.freeze({
    valid: true, artifact: "fixture-029", track: "CMB-X04", execution_claims: ["C-1580"],
    profile, partition: "public-development-only", seeds: inputs.seeds.length,
    worlds_per_seed: inputs.config.worlds_per_seed, artifacts_per_world: inputs.config.artifacts_per_world,
    arms: FIXTURE_029_ARMS.length, work_units: units.length,
    confirmation_seeds_created: false, held_out_seeds_created: false,
    measured_energy_required: false, energy_conclusion_allowed: false,
    claim_eligible: false, no_result: true,
  });
}

export async function executeFixture029({ profile, output, resume = false, maxWorkUnits = Infinity }) {
  if (maxWorkUnits !== Infinity && (!Number.isSafeInteger(maxWorkUnits) || maxWorkUnits < 1)) {
    throw new Error("maxWorkUnits must be a positive integer or Infinity.");
  }
  const inputs = await loadInputs(profile);
  const identity = runIdentity(inputs);
  const directory = outputDirectory(output);
  const alreadyExists = await exists(directory);
  if (alreadyExists && !resume) throw new Error("Fixture 029 output already exists; use --resume true.");
  if (!alreadyExists && resume) throw new Error("Fixture 029 cannot resume a missing output directory.");
  if (!alreadyExists) {
    await mkdir(path.dirname(directory), { recursive: true });
    await mkdir(directory);
  } else if (!(await stat(directory)).isDirectory()) throw new Error("Fixture 029 output is not a directory.");
  const rawPath = path.join(directory, "raw-events.jsonl");
  const checkpointPath = path.join(directory, "checkpoint.json");
  const ledger = await openCheckpointLedger({
    artifact: "fixture-029", ledgerFormat, rawPath, checkpointPath, runIdentity: identity,
    scientificPayload: fixture029ScientificPayload, workKey: fixture029WorkKey,
    assertRecord: runBoundValidator(identity, inputs),
  });
  const units = allWorkUnits(inputs);
  const remaining = remainingWorkUnits(units, ledger.completedWorkKeys(), workUnitKey);
  for (const unit of remaining.slice(0, maxWorkUnits)) {
    await ledger.append(eventFor(unit, inputs, identity));
    await ledger.saveCheckpoint();
  }
  const complete = ledger.summary().completed_work_units === units.length;
  if (!complete) return Object.freeze({ directory, complete: false, run_id: identity.run_id, ledger: ledger.summary(), no_result: true });
  const run = {
    ...identity,
    expected_work_units: units.length,
    ledger: ledger.summary(),
    raw_path: path.relative(repositoryRoot, rawPath).replaceAll("\\", "/"),
    checkpoint_path: path.relative(repositoryRoot, checkpointPath).replaceAll("\\", "/"),
    result_label: "NO_RESULT", no_result: true, measured_energy_present: false,
    energy_conclusion_allowed: false, claim_eligible: false,
    comparison_inference_permitted: false, scientific_result: false, performance_result: false,
    interpretation: "NO_RESULT: public-development CMB-X04 execution and integrity plumbing only.",
  };
  await writeJsonStable(path.join(directory, "run.json"), run);
  return Object.freeze({ directory, complete: true, run, no_result: true });
}

function sum(rows, selector) {
  return rows.reduce((total, row) => total + selector(row), 0);
}

export async function computeFixture029Analysis(output) {
  const directory = outputDirectory(output);
  const run = await loadJson(path.join(directory, "run.json"));
  const inputs = await loadInputs(run.profile);
  const identity = runIdentity(inputs);
  if (run.run_id !== identity.run_id || canonical(run.source_hashes) !== canonical(identity.source_hashes)) {
    throw new Error("Fixture 029 run identity differs from current frozen inputs.");
  }
  const ledger = await openCheckpointLedger({
    artifact: "fixture-029", ledgerFormat,
    rawPath: path.join(directory, "raw-events.jsonl"),
    checkpointPath: path.join(directory, "checkpoint.json"),
    runIdentity: identity, scientificPayload: fixture029ScientificPayload,
    workKey: fixture029WorkKey, assertRecord: runBoundValidator(identity, inputs),
  });
  const ledgerSummary = ledger.summary();
  if (ledgerSummary.checkpoint_status !== "current"
    || ledgerSummary.completed_work_units !== run.expected_work_units
    || ledgerSummary.hash_chain_sha256 !== run.ledger.hash_chain_sha256) {
    throw new Error("Fixture 029 run, checkpoint, and raw ledger disagree.");
  }
  const raw = await readFile(path.join(directory, "raw-events.jsonl"), "utf8");
  if (!raw.endsWith("\n") || raw.includes("\r")) throw new Error("Fixture 029 raw ledger is not canonical LF JSONL.");
  const records = raw.trimEnd().split("\n").map((line) => JSON.parse(line));
  const exactReplayPass = auditExactRecordSet(records, inputs, identity);
  const byArm = Object.fromEntries(FIXTURE_029_ARMS.map((arm) => {
    const rows = records.filter((record) => record.arm === arm);
    return [arm, {
      records: rows.length,
      accepted_service_nsu: sum(rows, (row) => row.outcomes.accepted_service_nsu),
      rebuilt: sum(rows, (row) => row.outcomes.rebuilt),
      logical_operations: sum(rows, (row) => row.resources.logical_operations),
      copies_transported: sum(rows, (row) => row.outcomes.copies_transported),
      transported_bytes: sum(rows, (row) => row.resources.transported_bytes),
      wrapper_state_bytes_created: sum(rows, (row) => row.resources.wrapper_state_bytes_created),
      transport_bytes_written: sum(rows, (row) => row.resources.transport_bytes_written),
      reconstruction_bytes_written: sum(rows, (row) => row.resources.reconstruction_bytes_written),
      bytes_written: sum(rows, (row) => row.resources.bytes_written),
      wrapper_byte_steps: sum(rows, (row) => row.resources.wrapper_byte_steps),
      task_gate_passes: rows.filter((row) => row.gates.task_gate_pass).length,
      protected_gate_passes: rows.filter((row) => row.gates.protected_gate_pass).length,
      resource_gate_passes: rows.filter((row) => row.gates.resource_gate_pass).length,
    }];
  }));
  const family = (label, arm) => records.filter((record) => record.generator_family === label && record.arm === arm);
  const recordFor = (source, arm) => records.find((record) => (
    record.seed === source.seed && record.world_index === source.world_index && record.arm === arm
  ));
  const sequentialLifecycleRows = records.filter((record) => record.arm === "X04-RETRY").map((retry) => ({
    retry,
    reload: recordFor(retry, "X04-RELOAD"),
    rebuild: recordFor(retry, "X04-REBUILD"),
  }));
  const orderedNullable = (left, right) => (
    left === null ? right === null : right !== null && left <= right
  );
  const checks = {
    independently_regenerated_records_match: exactReplayPass,
    expected_records_present: records.length === run.expected_work_units,
    all_eight_arms_present_per_world: inputs.seeds.every((seed) => (
      generateFixture029Worlds({ seed, config: inputs.config }).every((world) => (
        FIXTURE_029_ARMS.every((arm) => records.some((record) => (
          record.seed === seed && record.world_index === world.world_index && record.arm === arm
        )))
      ))
    )),
    arm_independent_counterfactual_draw_domain: records.every((record) => (
      record.counterfactual_draw_domain === "F029/seed/world/artifact/stream/attempt; arm-excluded"
    )),
    actionable_information_is_equal_except_oracle: records.every((record) => (
      record.gates.information_parity === (record.arm !== "X04-ORACLE")
    )),
    copy_and_artifact_conservation_hold: records.every((record) => (
      record.gates.copy_conservation_pass && record.gates.artifact_conservation_pass
    )),
    resource_and_authority_gates_are_derived_and_pass: records.every((record) => (
      record.gates.resource_ledger_complete && record.gates.resource_gate_pass
      && record.gates.action_authority_parity
    )),
    transport_and_wrapper_accounting_hold: records.every((record) => (
      record.resources.transported_bytes
        === record.outcomes.copies_transported * record.public_contract.artifact_bytes
          + record.resources.wrapper_state_bytes_created
      && record.resources.transport_bytes_written === record.resources.transported_bytes
      && record.resources.reconstruction_bytes_written
        === record.outcomes.rebuilt * record.public_contract.artifact_bytes
      && record.resources.bytes_written
        === record.resources.transport_bytes_written
          + record.resources.reconstruction_bytes_written
      && Number.isSafeInteger(
        record.resources.wrapper_state_bytes_created / record.public_contract.wrapper_state_bytes,
      )
      && record.resources.wrapper_construction_operations
        === record.resources.wrapper_state_bytes_created / record.public_contract.wrapper_state_bytes
      && record.resources.compatibility_check_operations
        === record.resources.wrapper_construction_operations
    )),
    sequential_lifecycle_costs_are_visible: sequentialLifecycleRows.every(({ retry, reload, rebuild }) => (
      reload !== undefined && rebuild !== undefined
      && retry.outcomes.artifacts_active === reload.outcomes.artifacts_active
      && reload.outcomes.artifacts_active === rebuild.outcomes.artifacts_active
      && retry.outcomes.artifacts_lost === reload.outcomes.artifacts_lost
      && reload.outcomes.artifacts_lost === rebuild.outcomes.artifacts_lost
      && retry.outcomes.retried === reload.outcomes.reloaded
      && reload.outcomes.reloaded === rebuild.outcomes.rebuilt
      && retry.outcomes.accepted_service_nsu >= reload.outcomes.accepted_service_nsu
      && reload.outcomes.accepted_service_nsu >= rebuild.outcomes.accepted_service_nsu
      && retry.outcomes.missed_release_deadlines <= reload.outcomes.missed_release_deadlines
      && reload.outcomes.missed_release_deadlines <= rebuild.outcomes.missed_release_deadlines
      && orderedNullable(
        retry.outcomes.activation_latency_p95_steps,
        reload.outcomes.activation_latency_p95_steps,
      )
      && orderedNullable(
        reload.outcomes.activation_latency_p95_steps,
        rebuild.outcomes.activation_latency_p95_steps,
      )
    )) && sequentialLifecycleRows.some(({ retry, reload, rebuild }) => (
      retry.outcomes.retried > 0
      && retry.outcomes.accepted_service_nsu > reload.outcomes.accepted_service_nsu
      && reload.outcomes.accepted_service_nsu > rebuild.outcomes.accepted_service_nsu
    )),
    retry_and_replication_nulls_are_exercised: byArm["X04-RETRY"].logical_operations > 0
      && records.some((record) => record.arm === "X04-RETRY" && record.outcomes.retried > 0)
      && records.some((record) => record.arm === "X04-REPLICA" && record.outcomes.replicated > 0),
    zero_hazard_does_not_create_phase_survival_credit: family("zero-transit-hazard", "X04-NONE")
      .every((row) => row.outcomes.artifacts_lost === 0),
    release_block_prevents_phase_service: family("release-blocked", "X04-PHASE")
      .every((row) => row.outcomes.artifacts_active === 0),
    persistent_incompatibility_is_validation_visible: family("incompatible-artifact", "X04-PERSIST")
      .every((row) => row.outcomes.artifacts_invalid > 0 && row.outcomes.artifacts_bound === 0),
    perfect_compatibility_and_guaranteed_release_control_present: family("guaranteed-release-compatible", "X04-PHASE")
      .every((row) => row.evaluator_parameters.latent_compatible
        && row.evaluator_parameters.release_probability === 1
        && row.evaluator_parameters.release_cue_valid),
    short_lifetime_task_gate_uses_accepted_service: family("short-useful-lifetime", "X04-PHASE")
      .every((row) => row.outcomes.accepted_service_nsu === 0 && !row.gates.task_gate_pass),
    permanent_binding_never_receives_active_credit: records
      .filter((record) => record.arm === "X04-PERSIST")
      .every((record) => record.outcomes.artifacts_active === 0),
    wrapper_accounting_uses_declared_wrapper_state: records
      .filter((record) => new Set(["X04-PERSIST", "X04-PHASE", "X04-ORACLE"]).has(record.arm))
      .every((record) => record.resources.wrapper_state_bytes_created
        % record.public_contract.wrapper_state_bytes === 0),
    authority_and_energy_boundaries_hold: records.every((record) => (
      record.no_result && !record.claim_eligible && !record.comparison_inference_permitted
      && !record.measured_energy_present && !record.energy_conclusion_allowed
      && !record.scientific_result && !record.performance_result
    )),
  };
  return Object.freeze({
    schema: 1, artifact: "fixture-029", track: "CMB-X04", execution_claims: ["C-1580"],
    run_id: run.run_id, profile: run.profile, records: records.length, metrics: byArm, checks,
    decision: Object.values(checks).every(Boolean) ? "diagnostic-pass" : "diagnostic-fail",
    result_label: "NO_RESULT", no_result: true, claim_eligible: false,
    comparison_inference_permitted: false, measured_energy_present: false,
    energy_conclusion_allowed: false, scientific_result: false, performance_result: false,
    interpretation: "NO_RESULT: descriptive CMB-X04 public-development smoke checks only; no arm comparison is inferential.",
  });
}

export async function analyzeFixture029(output) {
  const analysis = await computeFixture029Analysis(output);
  await writeJsonStable(path.join(outputDirectory(output), "analysis.json"), analysis);
  return analysis;
}

export async function validateFixture029Output(output) {
  const analysis = await computeFixture029Analysis(output);
  if (analysis.decision !== "diagnostic-pass" || !Object.values(analysis.checks).every(Boolean)) {
    throw new Error("Fixture 029 development-smoke validation failed.");
  }
  return Object.freeze({ valid: true, run_id: analysis.run_id, decision: analysis.decision, no_result: true });
}

function parseOptions(argv) {
  const action = argv[2];
  if (!new Set(["prepare", "smoke", "run", "analyze", "validate"]).has(action)) {
    throw new Error("Fixture 029 action must be prepare, smoke, run, analyze, or validate; private partitions are not executable.");
  }
  if ((argv.length - 3) % 2 !== 0) throw new Error("Options require explicit --name value pairs.");
  const options = {};
  for (let index = 3; index < argv.length; index += 2) {
    const token = argv[index];
    const value = argv[index + 1];
    if (!/^--[a-z][a-z-]*$/u.test(token ?? "") || !value || value.startsWith("--")) throw new Error("Invalid option pair.");
    const key = token.slice(2);
    if (!new Set(["profile", "output", "resume"]).has(key) || Object.hasOwn(options, key)) {
      throw new Error(`Unknown or duplicate Fixture 029 option --${key}.`);
    }
    options[key] = value;
  }
  if (new Set(["prepare", "smoke", "run"]).has(action)) {
    if (!new Set(["smoke", "development"]).has(options.profile)) throw new Error(`${action} requires --profile.`);
  } else if (options.profile !== undefined || options.resume !== undefined) throw new Error(`${action} does not accept profile or resume.`);
  if (action === "smoke" && options.profile !== "smoke") throw new Error("smoke requires --profile smoke.");
  if (action === "run" && options.profile !== "development") throw new Error("run requires --profile development.");
  if (action === "prepare" && (options.output !== undefined || options.resume !== undefined)) throw new Error("prepare does not accept output or resume.");
  if (action !== "prepare" && !options.output) throw new Error(`${action} requires --output.`);
  if (options.resume !== undefined && !new Set(["true", "false"]).has(options.resume)) throw new Error("--resume must be true or false.");
  return { action, options };
}

export async function main(argv = process.argv) {
  const { action, options } = parseOptions(argv);
  let result;
  if (action === "prepare") result = await prepareFixture029(options.profile);
  else if (action === "smoke" || action === "run") result = await executeFixture029({
    profile: options.profile, output: options.output, resume: options.resume === "true",
  });
  else if (action === "analyze") result = await analyzeFixture029(options.output);
  else result = await validateFixture029Output(options.output);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  return result;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { process.stderr.write(`${error.stack ?? error.message}\n`); process.exitCode = 1; });
}
