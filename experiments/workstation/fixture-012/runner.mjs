import { createHash } from "node:crypto";
import {
  mkdir,
  open,
  readFile,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  FIXTURE_012_EVENT_CONTRACT_VERSION,
  assertFixture012Event,
  buildFixture012Event,
  canonical,
  sha256,
} from "./contract.mjs";
import {
  FIXTURE_012_GENERATOR_VERSION,
  generateLayoutStudy,
  validateFixture012Config,
} from "./generator.mjs";

export const FIXTURE_012_RUNNER_VERSION = "fixture-012.layout-population-runner.v1";

const fixtureRoot = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(fixtureRoot, "../../..");
const estimand = "candidate-minus-baseline-layout-population-mean-v1";
const arms = Object.freeze([
  "fixed-layout-negative-control",
  "mature-randomized-counterbalanced",
  "operator-qualified-randomized",
]);

function isInside(root, target) {
  const relative = path.relative(root, target);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function parseOptions(argv) {
  const action = argv[2];
  if (!new Set(["prepare", "smoke", "run", "analyze", "validate"]).has(action)) {
    throw new Error("Fixture 012 action must be prepare, smoke, run, analyze, or validate.");
  }
  if ((argv.length - 3) % 2 !== 0) throw new Error("Options require explicit --name value pairs.");
  const options = {};
  for (let index = 3; index < argv.length; index += 2) {
    const token = argv[index];
    const value = argv[index + 1];
    if (!/^--[a-z][a-z-]*$/.test(token ?? "") || !value || value.startsWith("--")) {
      throw new Error("Fixture 012 options require explicit --name value pairs.");
    }
    const key = token.slice(2);
    if (!new Set(["profile", "output"]).has(key) || Object.hasOwn(options, key)) {
      throw new Error(`Unknown or duplicate Fixture 012 option --${key}.`);
    }
    options[key] = value;
  }
  if (new Set(["prepare", "smoke", "run"]).has(action)) {
    if (!new Set(["smoke", "development"]).has(options.profile)) {
      throw new Error(`${action} requires --profile smoke or --profile development.`);
    }
  } else if (options.profile !== undefined) {
    throw new Error(`${action} does not accept --profile.`);
  }
  if (action === "prepare" && options.output !== undefined) {
    throw new Error("prepare does not accept --output.");
  }
  if (action !== "prepare" && !options.output) {
    throw new Error(`${action} requires --output.`);
  }
  return { action, options };
}

async function loadJson(file) {
  return JSON.parse(await readFile(file, "utf8"));
}

async function profileInputs(profile) {
  const configPath = path.join(fixtureRoot, "configs", `${profile}.json`);
  const seedsPath = path.join(fixtureRoot, "seeds", "development.json");
  const [config, seedDocument] = await Promise.all([loadJson(configPath), loadJson(seedsPath)]);
  validateFixture012Config(config);
  if (
    seedDocument.schema !== 1
    || seedDocument.partition !== "development"
    || !Array.isArray(seedDocument.seeds)
    || seedDocument.seeds.length === 0
    || seedDocument.seeds.some((seed) => !Number.isInteger(seed) || seed < 0 || seed > 0xffff_ffff)
    || new Set(seedDocument.seeds).size !== seedDocument.seeds.length
  ) throw new Error("Fixture 012 development seed pack is invalid.");
  const seeds = profile === "smoke" ? seedDocument.seeds.slice(0, 2) : seedDocument.seeds;
  return { config, configPath, seeds, seedsPath };
}

function outputPath(value) {
  const resolved = path.resolve(repositoryRoot, value);
  if (!isInside(repositoryRoot, resolved) || resolved === repositoryRoot) {
    throw new Error("Fixture 012 output must stay inside the repository.");
  }
  return resolved;
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

function observationsForArm(study, arm) {
  return arm === "fixed-layout-negative-control" ? study.fixed : study.randomized;
}

function setupPolicy(arm) {
  return arm === "fixed-layout-negative-control"
    ? "fixed-single-pair-repeated"
    : "randomized-counterbalanced-layout-population";
}

export async function executeFixture012({ profile, output }) {
  const inputs = await profileInputs(profile);
  const directory = outputPath(output);
  await mkdir(path.dirname(directory), { recursive: true });
  await mkdir(directory);
  const identity = {
    schema: 1,
    artifact: "fixture-012",
    runner_version: FIXTURE_012_RUNNER_VERSION,
    generator_version: FIXTURE_012_GENERATOR_VERSION,
    event_contract_version: FIXTURE_012_EVENT_CONTRACT_VERSION,
    profile,
    config: inputs.config,
    seeds: inputs.seeds,
    arms,
    estimand,
  };
  const runId = sha256(canonical(identity));
  const rawPath = path.join(directory, "raw-events.jsonl");
  const handle = await open(rawPath, "wx", 0o600);
  let sequence = 0;
  let previousHash = null;
  try {
    for (const seed of inputs.seeds) {
      for (let studyIndex = 0; studyIndex < inputs.config.studies_per_seed; studyIndex += 1) {
        const study = generateLayoutStudy({ seed, study: studyIndex, config: inputs.config });
        for (const arm of arms) {
          for (const observation of observationsForArm(study, arm)) {
            const event = buildFixture012Event({
              schema: 1,
              contract_version: FIXTURE_012_EVENT_CONTRACT_VERSION,
              artifact: "fixture-012",
              run_id: runId,
              sequence,
              seed,
              study: studyIndex,
              arm,
              estimand,
              setup_policy: setupPolicy(arm),
              observation_id: observation.observation_id,
              layout_slot: observation.layout_slot,
              layout_id: observation.layout_id,
              invocation: observation.invocation,
              repeat: observation.repeat,
              variant: observation.variant,
              run_position: observation.run_position,
              latency_ns: observation.latency_ns,
              true_population_effect_fraction: study.true_population_effect_fraction,
              modeled_work_units: inputs.config.modeled_work_units_per_observation,
              modeled_energy_j: inputs.config.modeled_energy_j_per_observation,
              previous_hash: previousHash,
            });
            assertFixture012Event(event, { previousHash, sequence });
            await handle.write(`${JSON.stringify(event)}\n`);
            previousHash = event.record_sha256;
            sequence += 1;
          }
        }
      }
    }
    await handle.sync();
  } finally {
    await handle.close();
  }
  const run = {
    ...identity,
    run_id: runId,
    config_path: path.relative(repositoryRoot, inputs.configPath).replaceAll("\\", "/"),
    seeds_path: path.relative(repositoryRoot, inputs.seedsPath).replaceAll("\\", "/"),
    total_events: sequence,
    terminal_record_sha256: previousHash,
    measurement_semantics: "synthetic-layout-population-negative-control",
    modeled_work_and_energy_only: true,
    measured_energy_present: false,
    claim_eligible: false,
    scientific_result: false,
    confirmation_state: "pending-implementation-freeze",
    held_out_state: "pending-implementation-freeze",
  };
  await writeJsonStable(path.join(directory, "run.json"), run);
  return Object.freeze({ directory, run });
}

async function readValidatedEvents(directory) {
  const text = await readFile(path.join(directory, "raw-events.jsonl"), "utf8");
  const lines = text.split(/\r?\n/u).filter(Boolean);
  const events = [];
  let previousHash = null;
  for (let sequence = 0; sequence < lines.length; sequence += 1) {
    const event = JSON.parse(lines[sequence]);
    assertFixture012Event(event, { previousHash, sequence });
    previousHash = event.record_sha256;
    events.push(event);
  }
  return {
    events,
    previousHash,
    rawSha256: createHash("sha256").update(text).digest("hex"),
  };
}

function mean(values) {
  if (values.length === 0) throw new Error("Fixture 012 cannot average an empty sample.");
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function standardError(values) {
  if (values.length < 2) return null;
  const center = mean(values);
  const variance = values.reduce((sum, value) => sum + (value - center) ** 2, 0)
    / (values.length - 1);
  return Math.sqrt(variance / values.length);
}

function studyKey(event) {
  return `${event.seed}:${event.study}`;
}

function observationPayload(event) {
  return {
    seed: event.seed,
    study: event.study,
    estimand: event.estimand,
    setup_policy: event.setup_policy,
    observation_id: event.observation_id,
    layout_slot: event.layout_slot,
    layout_id: event.layout_id,
    invocation: event.invocation,
    repeat: event.repeat,
    variant: event.variant,
    run_position: event.run_position,
    latency_ns: event.latency_ns,
    true_population_effect_fraction: event.true_population_effect_fraction,
    modeled_work_units: event.modeled_work_units,
    modeled_energy_j: event.modeled_energy_j,
  };
}

function effectForRows(rows) {
  const baseline = mean(
    rows.filter((row) => row.variant === "baseline").map((row) => row.latency_ns),
  );
  const candidate = mean(
    rows.filter((row) => row.variant === "candidate").map((row) => row.latency_ns),
  );
  return (candidate - baseline) / baseline;
}

function armMetrics(events, arm, config) {
  const rows = events.filter((event) => event.arm === arm);
  const byStudy = new Map();
  for (const row of rows) {
    const key = studyKey(row);
    const bucket = byStudy.get(key) ?? [];
    bucket.push(row);
    byStudy.set(key, bucket);
  }
  const studyEffects = [...byStudy.values()].map((studyRows) => effectForRows(studyRows));
  const meanEffect = mean(studyEffects);
  const se = standardError(studyEffects);
  const halfWidth = se === null ? null : 1.96 * se;
  const lower = halfWidth === null ? null : meanEffect - halfWidth;
  const upper = halfWidth === null ? null : meanEffect + halfWidth;
  let decision = "no-detectable-effect";
  if (upper !== null && upper < -config.speedup_threshold_fraction) decision = "speedup";
  if (lower !== null && lower > config.speedup_threshold_fraction) decision = "slowdown";
  const layoutsPerStudy = [...byStudy.values()].map(
    (studyRows) => new Set(studyRows.map((row) => row.layout_id)).size,
  );
  return {
    observations: rows.length,
    studies: byStudy.size,
    distinct_layouts_per_study_min: Math.min(...layoutsPerStudy),
    distinct_layouts_per_study_max: Math.max(...layoutsPerStudy),
    candidate_first_observations: rows.filter(
      (row) => row.variant === "candidate" && row.run_position === 0,
    ).length,
    baseline_first_observations: rows.filter(
      (row) => row.variant === "baseline" && row.run_position === 0,
    ).length,
    mean_effect_fraction: meanEffect,
    apparent_speedup_fraction: -meanEffect,
    standard_error_by_study: se,
    confidence_interval_95: [lower, upper],
    decision,
    modeled_work_units: rows.reduce((sum, row) => sum + row.modeled_work_units, 0),
    modeled_energy_j: rows.reduce((sum, row) => sum + row.modeled_energy_j, 0),
    observations_sha256: sha256(canonical(rows.map(observationPayload))),
  };
}

export async function computeFixture012Analysis(output) {
  const directory = outputPath(output);
  const [run, raw] = await Promise.all([
    loadJson(path.join(directory, "run.json")),
    readValidatedEvents(directory),
  ]);
  if (
    run.artifact !== "fixture-012"
    || raw.events.length === 0
    || run.run_id !== raw.events[0].run_id
    || run.total_events !== raw.events.length
    || run.terminal_record_sha256 !== raw.previousHash
    || raw.events.some((event) => event.run_id !== run.run_id)
  ) throw new Error("Fixture 012 run metadata disagree with the raw event ledger.");
  validateFixture012Config(run.config);
  const metrics = Object.fromEntries(arms.map((arm) => [arm, armMetrics(raw.events, arm, run.config)]));
  const fixed = metrics["fixed-layout-negative-control"];
  const mature = metrics["mature-randomized-counterbalanced"];
  const qualified = metrics["operator-qualified-randomized"];
  const observationCounts = arms.map((arm) => metrics[arm].observations);
  const modeledWork = arms.map((arm) => metrics[arm].modeled_work_units);
  const modeledEnergy = arms.map((arm) => metrics[arm].modeled_energy_j);
  const checks = {
    negative_control_exposes_spurious_fixed_layout_speedup:
      fixed.decision === "speedup"
      && fixed.apparent_speedup_fraction >= run.config.speedup_threshold_fraction,
    mature_randomized_null_rejects_spurious_speedup:
      mature.decision === "no-detectable-effect"
      && Math.abs(mature.mean_effect_fraction) <= run.config.null_tolerance_fraction,
    complete_mature_null_matches_operator_qualified_exactly:
      canonical(mature) === canonical(qualified),
    identical_randomized_information_path:
      mature.observations_sha256 === qualified.observations_sha256,
    exact_observation_budget_parity:
      new Set(observationCounts).size === 1,
    equal_modeled_work_accounting:
      new Set(modeledWork).size === 1,
    equal_modeled_energy_accounting:
      new Set(modeledEnergy).size === 1,
    randomized_layout_population_is_complete_and_counterbalanced:
      mature.distinct_layouts_per_study_min === run.config.layouts_per_study
      && mature.distinct_layouts_per_study_max === run.config.layouts_per_study
      && mature.candidate_first_observations === mature.baseline_first_observations,
    truth_and_authority_boundary_is_preserved:
      raw.events.every((event) => event.true_population_effect_fraction === 0)
      && run.modeled_work_and_energy_only === true
      && run.measured_energy_present === false
      && run.claim_eligible === false
      && run.scientific_result === false,
  };
  const passed = Object.values(checks).every(Boolean);
  return {
    schema: 1,
    artifact: "fixture-012",
    contract_version: "fixture-012.layout-population-analysis.v1",
    run_id: run.run_id,
    profile: run.profile,
    estimand,
    raw_events_sha256: raw.rawSha256,
    run_sha256: sha256(canonical(run)),
    metrics,
    checks,
    decision: passed ? "diagnostic-pass" : "diagnostic-fail",
    measured_energy_present: false,
    modeled_work_and_energy_only: true,
    claim_eligible: false,
    scientific_result: false,
    interpretation: "The fixture must expose a false fixed-layout speedup while the complete randomized/counterbalanced null and the identically informed operator-qualified arm agree exactly at equal modeled cost.",
  };
}

export async function analyzeFixture012(output) {
  const directory = outputPath(output);
  const summary = await computeFixture012Analysis(directory);
  await mkdir(path.join(directory, "analysis"), { recursive: true });
  await writeJsonStable(path.join(directory, "analysis", "summary.json"), summary);
  if (summary.decision !== "diagnostic-pass") {
    throw new Error("Fixture 012 diagnostic rejection checks failed.");
  }
  return summary;
}

export async function validateFixture012Output(output) {
  const directory = outputPath(output);
  const [expected, stored] = await Promise.all([
    computeFixture012Analysis(directory),
    loadJson(path.join(directory, "analysis", "summary.json")),
  ]);
  if (canonical(expected) !== canonical(stored)) {
    throw new Error("Fixture 012 stored analysis is not reproducible from raw events.");
  }
  if (
    stored.claim_eligible !== false
    || stored.scientific_result !== false
    || stored.measured_energy_present !== false
    || stored.modeled_work_and_energy_only !== true
  ) throw new Error("Fixture 012 smoke output attempts to claim scientific or measured-energy authority.");
  return Object.freeze({ valid: true, run_id: stored.run_id, decision: stored.decision });
}

export async function prepareFixture012(profile) {
  const inputs = await profileInputs(profile);
  const observationsPerArm = inputs.seeds.length
    * inputs.config.studies_per_seed
    * inputs.config.layouts_per_study
    * inputs.config.invocations_per_layout
    * inputs.config.repeats_per_invocation
    * 2;
  return Object.freeze({
    valid: true,
    artifact: "fixture-012",
    profile,
    seeds: inputs.seeds.length,
    studies_per_seed: inputs.config.studies_per_seed,
    layouts_per_study: inputs.config.layouts_per_study,
    observations_per_arm: observationsPerArm,
    events: observationsPerArm * arms.length,
    measured_energy_required: false,
    modeled_work_and_energy_only: true,
    claim_eligible: false,
  });
}

export async function main(argv = process.argv) {
  const { action, options } = parseOptions(argv);
  if (action === "prepare") return prepareFixture012(options.profile);
  if (action === "smoke") {
    await executeFixture012({ profile: options.profile, output: options.output });
    await analyzeFixture012(options.output);
    return validateFixture012Output(options.output);
  }
  if (action === "run") return executeFixture012({ profile: options.profile, output: options.output });
  if (action === "analyze") return analyzeFixture012(options.output);
  return validateFixture012Output(options.output);
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
