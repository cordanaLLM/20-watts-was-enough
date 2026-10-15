import { createHash } from "node:crypto";
import { access, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  canonicalize,
  openCheckpointLedger,
  remainingWorkUnits,
  sha256Hex,
} from "../lib/checkpoint-ledger.mjs";
import {
  CMB_X01_CONSTRUCTION_CONTRACT_VERSION,
  buildCmbX01ConstructionRecord,
  canonicalCmbX01,
} from "./cmb-x01-contract.mjs";
import {
  CMB_X01_ARMS,
  CMB_X01_COUNTERFACTUAL_DRAW_DOMAIN,
  CMB_X01_FAMILIES,
  CMB_X01_GENERATOR_VERSION,
  generateCmbX01Worlds,
  validateCmbX01Config,
} from "./cmb-x01-generator.mjs";
import {
  CMB_X01_LEDGER_CONTRACT_VERSION,
  CMB_X01_LEDGER_FORMAT,
  assertCmbX01LedgerRecord,
  cmbX01LedgerScientificPayload,
  cmbX01WorkKey,
} from "./cmb-x01-ledger-contract.mjs";

export const CMB_X01_RUNNER_VERSION = "fixture-029.cmb-x01-public-development-runner.v2";

export const CMB_X01_ACTIONABLE_INPUT_PARITY_GROUPS = Object.freeze([
  Object.freeze([
    "X01-NONE", "X01-OCCUPY", "X01-DIRECT", "X01-GC", "X01-QUEUE", "X01-RECRUIT",
  ]),
]);

const fixtureRoot = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(fixtureRoot, "../../..");
const fixtureDocument = path.join(
  repositoryRoot,
  "experiments",
  "fixtures",
  "029-clinical-biotechnology-endogenous-machinery.md",
);
const auditDocument = path.join(
  repositoryRoot,
  "research",
  "audits",
  "2026-08-27-clinical-biotechnology-endogenous-machinery.md",
);
const seedDocumentPath = path.join(fixtureRoot, "seeds", "development.reveal.json");

async function exists(file) {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
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

function resolveOutput(value) {
  const resolved = path.resolve(repositoryRoot, value);
  if (!isInside(repositoryRoot, resolved) || resolved === repositoryRoot) {
    throw new Error("CMB-X01 output must stay inside the repository.");
  }
  return resolved;
}

async function writeJsonStable(file, value) {
  const body = `${JSON.stringify(value, null, 2)}\n`;
  try {
    await writeFile(file, body, { flag: "wx" });
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
    const prior = JSON.parse(await readFile(file, "utf8"));
    if (canonicalize(prior) !== canonicalize(value)) {
      throw new Error(`Refusing to replace non-identical ${path.basename(file)}.`, { cause: error });
    }
  }
}

function validateSeedDocument(document) {
  if (
    document?.schema !== 1
    || document.artifact !== "fixture-029"
    || document.partition !== "development"
    || document.state !== "public-development"
    || document.algorithm !== "literal-public-seed-list-v1"
    || document.encoding !== "unsigned-little-endian-uint32"
    || !Array.isArray(document.seeds)
    || document.seeds.length < 2
    || document.seeds.some((seed) => (
      !Number.isSafeInteger(seed) || seed < 0 || seed > 0xffff_ffff
    ))
    || new Set(document.seeds).size !== document.seeds.length
  ) throw new Error("CMB-X01 public development seed document is invalid.");
  return document;
}

async function loadInputs(profile) {
  if (!new Set(["smoke", "development"]).has(profile)) {
    throw new Error("CMB-X01 profile is invalid.");
  }
  const configPath = path.join(fixtureRoot, "configs", `cmb-x01-${profile}.json`);
  const [config, seedDocument] = await Promise.all([
    loadJson(configPath),
    loadJson(seedDocumentPath),
  ]);
  validateCmbX01Config(config);
  validateSeedDocument(seedDocument);
  if (config.profile !== profile) throw new Error("CMB-X01 profile/config mismatch.");

  const files = Object.freeze({
    configuration: configPath,
    seeds: seedDocumentPath,
    fixture: fixtureDocument,
    audit: auditDocument,
    checkpoint_ledger: path.join(fixtureRoot, "../lib/checkpoint-ledger.mjs"),
    core_generator: path.join(fixtureRoot, "cmb-x01-generator.mjs"),
    core_contract: path.join(fixtureRoot, "cmb-x01-contract.mjs"),
    ledger_contract: path.join(fixtureRoot, "cmb-x01-ledger-contract.mjs"),
    runner: path.join(fixtureRoot, "cmb-x01-runner.mjs"),
    schema: path.join(fixtureRoot, "cmb-x01-output.schema.json"),
  });
  const inputSha256 = Object.freeze(Object.fromEntries(await Promise.all(
    Object.entries(files).map(async ([label, file]) => [label, await fileSha256(file)]),
  )));
  const seeds = profile === "smoke" ? seedDocument.seeds.slice(0, 2) : seedDocument.seeds;
  return Object.freeze({
    profile,
    config,
    configPath,
    seeds: Object.freeze([...seeds]),
    inputSha256,
  });
}

function buildRunIdentity(inputs) {
  const body = {
    schema: 1,
    artifact: "fixture-029",
    track: "CMB-X01",
    execution_claims: ["C-1574"],
    runner_version: CMB_X01_RUNNER_VERSION,
    generator_version: CMB_X01_GENERATOR_VERSION,
    construction_contract_version: CMB_X01_CONSTRUCTION_CONTRACT_VERSION,
    ledger_contract_version: CMB_X01_LEDGER_CONTRACT_VERSION,
    ledger_format: CMB_X01_LEDGER_FORMAT,
    profile: inputs.profile,
    config: inputs.config,
    config_file_sha256: inputs.inputSha256.configuration,
    seeds: inputs.seeds,
    seed_document_sha256: inputs.inputSha256.seeds,
    fixture_sha256: inputs.inputSha256.fixture,
    audit_sha256: inputs.inputSha256.audit,
    core_generator_sha256: inputs.inputSha256.core_generator,
    core_contract_sha256: inputs.inputSha256.core_contract,
    ledger_contract_sha256: inputs.inputSha256.ledger_contract,
    runner_sha256: inputs.inputSha256.runner,
    schema_sha256: inputs.inputSha256.schema,
    checkpoint_ledger_sha256: inputs.inputSha256.checkpoint_ledger,
    arms: CMB_X01_ARMS,
    families: CMB_X01_FAMILIES,
    counterfactual_draw_domain: CMB_X01_COUNTERFACTUAL_DRAW_DOMAIN,
    partition: "public-development-only",
    confirmation_seed_state: "not-created",
    held_out_seed_state: "not-created",
  };
  return Object.freeze({ ...body, run_id: sha256Hex(canonicalize(body)) });
}

function buildWorkUnits(inputs) {
  const units = [];
  for (const seed of inputs.seeds) {
    for (const world of generateCmbX01Worlds({ seed, config: inputs.config })) {
      for (const arm of CMB_X01_ARMS) {
        units.push(Object.freeze({ track: "CMB-X01", seed, world, arm }));
      }
    }
  }
  return Object.freeze(units);
}

function workUnitKey(unit) {
  return [
    unit.track,
    unit.seed,
    unit.world.world_index,
    unit.world.generator_family,
    unit.arm,
  ].join("/");
}

function buildLedgerEvent(unit, inputs, identity) {
  const construction = buildCmbX01ConstructionRecord({
    seed: unit.seed,
    world: unit.world,
    arm: unit.arm,
    config: inputs.config,
  });
  return {
    schema: 1,
    ledger_contract_version: CMB_X01_LEDGER_CONTRACT_VERSION,
    artifact: "fixture-029",
    track: "CMB-X01",
    claim_scope: ["C-1574"],
    run_id: identity.run_id,
    profile: inputs.profile,
    partition: "public-development-only",
    seed: unit.seed,
    world_index: unit.world.world_index,
    world_id: unit.world.world_id,
    generator_family: unit.world.generator_family,
    arm: unit.arm,
    work_key: workUnitKey(unit),
    construction,
    result_label: "NO_RESULT",
    no_result: true,
    measured_energy_present: false,
    energy_conclusion_allowed: false,
    comparison_inference_permitted: false,
    claim_eligible: false,
    scientific_result: false,
    performance_result: false,
  };
}

function boundLedgerValidator(inputs, identity) {
  return (record, state) => assertCmbX01LedgerRecord(record, {
    config: inputs.config,
    runId: identity.run_id,
    ...state,
  });
}

export async function prepareCmbX01(profile) {
  const inputs = await loadInputs(profile);
  const units = buildWorkUnits(inputs);
  return Object.freeze({
    valid: true,
    artifact: "fixture-029",
    track: "CMB-X01",
    execution_claims: ["C-1574"],
    profile,
    partition: "public-development-only",
    seeds: inputs.seeds.length,
    worlds_per_seed: inputs.config.worlds_per_seed,
    families_per_seed: CMB_X01_FAMILIES.length,
    arms: CMB_X01_ARMS.length,
    work_units: units.length,
    confirmation_seeds_created: false,
    held_out_seeds_created: false,
    measured_energy_required: false,
    energy_conclusion_allowed: false,
    comparison_inference_permitted: false,
    claim_eligible: false,
    no_result: true,
  });
}

export async function executeCmbX01({
  profile,
  output,
  resume = false,
  maxWorkUnits = Infinity,
}) {
  if (maxWorkUnits !== Infinity && (
    !Number.isSafeInteger(maxWorkUnits) || maxWorkUnits < 1
  )) throw new Error("maxWorkUnits must be a positive integer or Infinity.");
  const inputs = await loadInputs(profile);
  const identity = buildRunIdentity(inputs);
  const directory = resolveOutput(output);
  const alreadyExists = await exists(directory);
  if (alreadyExists && !resume) throw new Error("CMB-X01 output already exists; use --resume true.");
  if (!alreadyExists && resume) throw new Error("CMB-X01 cannot resume a missing output directory.");
  if (!alreadyExists) {
    await mkdir(path.dirname(directory), { recursive: true });
    await mkdir(directory);
  } else if (!(await stat(directory)).isDirectory()) {
    throw new Error("CMB-X01 output is not a directory.");
  }

  const rawPath = path.join(directory, "raw-events.jsonl");
  const checkpointPath = path.join(directory, "checkpoint.json");
  const ledger = await openCheckpointLedger({
    artifact: "fixture-029",
    ledgerFormat: CMB_X01_LEDGER_FORMAT,
    rawPath,
    checkpointPath,
    runIdentity: identity,
    scientificPayload: cmbX01LedgerScientificPayload,
    workKey: cmbX01WorkKey,
    assertRecord: boundLedgerValidator(inputs, identity),
  });
  const units = buildWorkUnits(inputs);
  const remaining = remainingWorkUnits(units, ledger.completedWorkKeys(), workUnitKey);
  for (const unit of remaining.slice(0, maxWorkUnits)) {
    await ledger.append(buildLedgerEvent(unit, inputs, identity));
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
    input_sha256: inputs.inputSha256,
    ledger: ledger.summary(),
    raw_path: path.relative(repositoryRoot, rawPath).replaceAll("\\", "/"),
    checkpoint_path: path.relative(repositoryRoot, checkpointPath).replaceAll("\\", "/"),
    result_label: "NO_RESULT",
    no_result: true,
    measured_energy_present: false,
    energy_conclusion_allowed: false,
    comparison_inference_permitted: false,
    claim_eligible: false,
    scientific_result: false,
    performance_result: false,
    interpretation: "NO_RESULT: CMB-X01 public-development construction and integrity diagnostics only.",
  };
  await writeJsonStable(path.join(directory, "run.json"), run);
  return Object.freeze({ directory, complete: true, run, no_result: true });
}

function grouped(records, keyOf) {
  const result = new Map();
  for (const record of records) {
    const key = keyOf(record);
    if (!result.has(key)) result.set(key, []);
    result.get(key).push(record);
  }
  return result;
}

/**
 * Reconstruct the complete public matrix from seeds and configuration.  The
 * raw record set supplies no authority for its own worlds, families, or core
 * payloads.
 */
export function auditCmbX01RecordSet({ records, seeds, config, runId }) {
  const checked = validateCmbX01Config(config);
  if (!Array.isArray(records) || !Array.isArray(seeds) || !/^[0-9a-f]{64}$/u.test(runId ?? "")) {
    throw new Error("CMB-X01 record-set audit inputs are invalid.");
  }
  for (const record of records) {
    assertCmbX01LedgerRecord(record, { config: checked, runId });
  }

  const expectedInputs = { seeds, config: checked };
  const expectedUnits = buildWorkUnits(expectedInputs);
  const byWorkKey = new Map(records.map((record) => [cmbX01WorkKey(record), record]));
  if (byWorkKey.size !== records.length) throw new Error("CMB-X01 record set contains a duplicate work key.");
  if (records.length !== expectedUnits.length) {
    throw new Error("CMB-X01 record set has a missing or unexpected work unit.");
  }
  for (const unit of expectedUnits) {
    const key = workUnitKey(unit);
    const record = byWorkKey.get(key);
    if (!record) throw new Error(`CMB-X01 record set is missing work unit ${key}.`);
    const regenerated = buildCmbX01ConstructionRecord({
      seed: unit.seed,
      world: unit.world,
      arm: unit.arm,
      config: checked,
    });
    if (canonicalCmbX01(record.construction) !== canonicalCmbX01(regenerated)) {
      throw new Error(`CMB-X01 independently regenerated payload differs for ${key}.`);
    }
  }

  const byWorld = grouped(records, (record) => `${record.seed}/${record.world_index}`);
  const familyRows = (family) => records.filter((record) => record.generator_family === family);
  const familyArmRows = (family, arm) => familyRows(family)
    .filter((record) => record.arm === arm);
  const perfect = familyRows("perfect-evidence");
  const noHarm = familyRows("no-harmful-targets");
  const noEngine = familyRows("no-engine");
  const noGeometryRecruit = familyArmRows("zero-productive-geometry", "X01-RECRUIT");
  const saturationRecruit = familyArmRows("binary-saturation", "X01-RECRUIT");
  const noRenewal = familyRows("no-resynthesis-or-replacement");
  const leakageRecruit = familyArmRows("cross-compartment-leakage", "X01-RECRUIT");
  const referenceRecruit = familyArmRows("reference-pressure", "X01-RECRUIT");

  const checks = Object.freeze({
    independent_world_and_payload_regeneration: true,
    every_arm_present_per_world: [...byWorld.values()].every((rows) => (
      rows.length === CMB_X01_ARMS.length
      && CMB_X01_ARMS.every((arm) => rows.some((record) => record.arm === arm))
    )),
    every_family_present_per_seed: seeds.every((seed) => {
      const families = new Set(records.filter((record) => record.seed === seed)
        .map((record) => record.generator_family));
      return CMB_X01_FAMILIES.every((family) => families.has(family));
    }),
    paired_exogenous_hashes_equal_within_world: [...byWorld.values()].every((rows) => (
      new Set(rows.map((record) => record.construction.paired_exogenous_sha256)).size === 1
    )),
    eligible_actionable_input_digests_equal: [...byWorld.values()].every((rows) => (
      CMB_X01_ACTIONABLE_INPUT_PARITY_GROUPS.every((arms) => (
        new Set(arms.map((arm) => rows.find((record) => record.arm === arm)
          ?.construction.policy_input_sha256)).size === 1
      ))
    )),
    common_action_authority_within_world: [...byWorld.values()].every((rows) => (
      new Set(rows.map((record) => record.construction.action_authority_sha256)).size === 1
    )),
    observation_and_evaluator_boundaries_hold: records.every((record) => (
      record.construction.evaluator_disclosed_only_after_policy_decision
      && record.construction.policy_oracle_access === (record.arm === "X01-ORACLE")
      && record.construction.gates.observation_evaluator_separation
        === (record.arm !== "X01-ORACLE")
    )),
    diagnostic_controls_are_nonvacuous: (
      perfect.length > 0
      && perfect.every((record) => (
        record.construction.outcomes.evidence_false_positives === 0
        && record.construction.outcomes.evidence_false_negatives === 0
      ))
      && noHarm.length > 0
      && noHarm.every((record) => (
        record.construction.outcomes.harmful_target_steps === 0
        && record.construction.outcomes.harmful_removals === 0
      ))
      && noHarm.some((record) => record.construction.outcomes.useful_target_deletions > 0)
      && noEngine.length > 0
      && noEngine.every((record) => (
        record.construction.inventories.engine.service_capacity === 0
        && record.construction.inventories.engine.service_used === 0
      ))
      && noEngine.some((record) => record.construction.outcomes.queue_entries > 0)
      && noGeometryRecruit.length > 0
      && noGeometryRecruit.every((record) => (
        record.construction.outcomes.productive_recruitment_events === 0
        && record.construction.outcomes.completed_removals === 0
        && record.construction.outcomes.failed_geometry_events > 0
      ))
      && saturationRecruit.length > 0
      && saturationRecruit.every((record) => (
        record.construction.mechanism.mediator_saturation
        && record.construction.inventories.mediator.created === checked.base_mediator_inventory * 4
      ))
      && noRenewal.length > 0
      && noRenewal.every((record) => (
        !record.construction.mechanism.resynthesis_enabled
        && !record.construction.mechanism.replacement_enabled
        && record.construction.outcomes.target_resyntheses === 0
        && record.construction.outcomes.target_replacements === 0
      ))
      && leakageRecruit.length > 0
      && leakageRecruit.every((record) => record.construction.inventories.mediator.leaked > 0)
      && referenceRecruit.length > 0
      && referenceRecruit.some((record) => (
        record.construction.outcomes.productive_recruitment_events > 0
        && record.construction.outcomes.verified_mediator_reuses > 0
      ))
    ),
    conservation_and_resource_ledgers_hold: records.every((record) => {
      const gates = record.construction.gates;
      return gates.target_conservation_pass
        && gates.engine_conservation_pass
        && gates.mediator_conservation_pass
        && gates.resource_ledger_complete
        && gates.destructive_action_authority_parity
        && gates.verified_mediator_reuse_pass;
    }),
    strict_no_result_boundary_holds: records.every((record) => (
      record.result_label === "NO_RESULT"
      && record.no_result
      && !record.measured_energy_present
      && !record.energy_conclusion_allowed
      && !record.comparison_inference_permitted
      && !record.claim_eligible
      && !record.scientific_result
      && !record.performance_result
      && record.construction.result_label === "NO_RESULT"
      && record.construction.no_result
      && !record.construction.measured_energy_present
      && !record.construction.energy_conclusion_allowed
      && !record.construction.comparison_inference_permitted
      && !record.construction.claim_eligible
      && !record.construction.scientific_result
      && !record.construction.performance_result
    )),
  });
  return Object.freeze({
    checks,
    coverage: Object.freeze({
      seeds: seeds.length,
      worlds: byWorld.size,
      families: CMB_X01_FAMILIES.length,
      arms: CMB_X01_ARMS.length,
      records: records.length,
    }),
  });
}

export async function computeCmbX01Analysis(output) {
  const directory = resolveOutput(output);
  const run = await loadJson(path.join(directory, "run.json"));
  const inputs = await loadInputs(run.profile);
  const identity = buildRunIdentity(inputs);
  if (run.run_id !== identity.run_id || canonicalize(run.input_sha256) !== canonicalize(inputs.inputSha256)) {
    throw new Error("CMB-X01 run identity differs from current frozen inputs.");
  }
  const ledger = await openCheckpointLedger({
    artifact: "fixture-029",
    ledgerFormat: CMB_X01_LEDGER_FORMAT,
    rawPath: path.join(directory, "raw-events.jsonl"),
    checkpointPath: path.join(directory, "checkpoint.json"),
    runIdentity: identity,
    scientificPayload: cmbX01LedgerScientificPayload,
    workKey: cmbX01WorkKey,
    assertRecord: boundLedgerValidator(inputs, identity),
  });
  const ledgerSummary = ledger.summary();
  if (
    ledgerSummary.checkpoint_status !== "current"
    || ledgerSummary.completed_work_units !== run.expected_work_units
    || ledgerSummary.hash_chain_sha256 !== run.ledger.hash_chain_sha256
    || ledgerSummary.scientific_payload_sha256 !== run.ledger.scientific_payload_sha256
  ) throw new Error("CMB-X01 run, checkpoint, and raw ledger disagree.");

  const raw = await readFile(path.join(directory, "raw-events.jsonl"), "utf8");
  if (!raw.endsWith("\n") || raw.includes("\r")) {
    throw new Error("CMB-X01 raw ledger is not canonical LF JSONL.");
  }
  const records = raw.slice(0, -1).split("\n").map((line) => JSON.parse(line));
  const audit = auditCmbX01RecordSet({
    records,
    seeds: inputs.seeds,
    config: inputs.config,
    runId: identity.run_id,
  });
  const decision = Object.values(audit.checks).every(Boolean)
    ? "diagnostic-pass" : "diagnostic-fail";
  return Object.freeze({
    schema: 1,
    artifact: "fixture-029",
    track: "CMB-X01",
    execution_claims: ["C-1574"],
    run_id: identity.run_id,
    profile: inputs.profile,
    coverage: audit.coverage,
    checks: audit.checks,
    decision,
    result_label: "NO_RESULT",
    no_result: true,
    measured_energy_present: false,
    energy_conclusion_allowed: false,
    comparison_inference_permitted: false,
    claim_eligible: false,
    scientific_result: false,
    performance_result: false,
    interpretation: "NO_RESULT: descriptive CMB-X01 public-development integrity diagnostics only; no arm comparison is inferential.",
  });
}

export async function analyzeCmbX01(output) {
  const analysis = await computeCmbX01Analysis(output);
  await writeJsonStable(path.join(resolveOutput(output), "analysis.json"), analysis);
  return analysis;
}

export async function validateCmbX01Output(output) {
  const analysis = await computeCmbX01Analysis(output);
  if (analysis.decision !== "diagnostic-pass" || !Object.values(analysis.checks).every(Boolean)) {
    throw new Error("CMB-X01 public-development validation failed.");
  }
  return Object.freeze({
    valid: true,
    run_id: analysis.run_id,
    decision: analysis.decision,
    no_result: true,
  });
}

function parseOptions(argv) {
  const action = argv[2];
  if (!new Set(["prepare", "smoke", "run", "analyze", "validate"]).has(action)) {
    throw new Error("CMB-X01 action must be prepare, smoke, run, analyze, or validate.");
  }
  if ((argv.length - 3) % 2 !== 0) throw new Error("Options require explicit --name value pairs.");
  const options = {};
  for (let index = 3; index < argv.length; index += 2) {
    const token = argv[index];
    const value = argv[index + 1];
    if (!/^--[a-z][a-z-]*$/u.test(token ?? "") || !value || value.startsWith("--")) {
      throw new Error("Invalid CMB-X01 option pair.");
    }
    const key = token.slice(2);
    if (!new Set(["profile", "output", "resume"]).has(key) || Object.hasOwn(options, key)) {
      throw new Error(`Unknown or duplicate CMB-X01 option --${key}.`);
    }
    options[key] = value;
  }
  if (new Set(["prepare", "smoke", "run"]).has(action)) {
    if (!new Set(["smoke", "development"]).has(options.profile)) {
      throw new Error(`${action} requires --profile.`);
    }
  } else if (options.profile !== undefined || options.resume !== undefined) {
    throw new Error(`${action} does not accept profile or resume.`);
  }
  if (action === "smoke" && options.profile !== "smoke") {
    throw new Error("smoke requires --profile smoke.");
  }
  if (action === "run" && options.profile !== "development") {
    throw new Error("run requires --profile development.");
  }
  if (action === "prepare" && (options.output !== undefined || options.resume !== undefined)) {
    throw new Error("prepare does not accept output or resume.");
  }
  if (action !== "prepare" && !options.output) throw new Error(`${action} requires --output.`);
  if (options.resume !== undefined && !new Set(["true", "false"]).has(options.resume)) {
    throw new Error("--resume must be true or false.");
  }
  return { action, options };
}

export async function main(argv = process.argv) {
  const { action, options } = parseOptions(argv);
  let result;
  if (action === "prepare") result = await prepareCmbX01(options.profile);
  else if (action === "smoke" || action === "run") {
    result = await executeCmbX01({
      profile: options.profile,
      output: options.output,
      resume: options.resume === "true",
    });
  } else if (action === "analyze") result = await analyzeCmbX01(options.output);
  else result = await validateCmbX01Output(options.output);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  return result;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error.stack ?? error.message}\n`);
    process.exitCode = 1;
  });
}
