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
  FIXTURE_007_EVENT_CONTRACT_VERSION,
  assertFixture007Event,
  buildFixture007Event,
  canonical,
  sha256,
} from "./contract.mjs";
import {
  FIXTURE_007_GENERATOR_VERSION,
  generateNullSpaceEpisodes,
  validateFixture007Config,
} from "./generator.mjs";
import {
  assertCurrentExperimentExecutionIdentity,
  assertExperimentExecutionEnvironment,
  createExperimentExecutionReceipt,
} from "../lib/execution-receipt.mjs";

export const FIXTURE_007_RUNNER_VERSION = "fixture-007.null-space-runner.v1";

const fixtureRoot = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(fixtureRoot, "../../..");
const arms = Object.freeze([
  "unqualified-point",
  "mature-selective",
  "mature-active",
  "operator-qualified-active",
]);

function isInside(root, target) {
  const relative = path.relative(root, target);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function parseOptions(argv) {
  const action = argv[2];
  if (!new Set(["prepare", "smoke", "run", "analyze", "validate"]).has(action)) {
    throw new Error("Fixture 007 action must be prepare, smoke, run, analyze, or validate.");
  }
  if ((argv.length - 3) % 2 !== 0) throw new Error("Options require explicit --name value pairs.");
  const options = {};
  for (let index = 3; index < argv.length; index += 2) {
    const token = argv[index];
    const value = argv[index + 1];
    if (!/^--[a-z][a-z-]*$/.test(token ?? "") || !value || value.startsWith("--")) {
      throw new Error("Fixture 007 options require explicit --name value pairs.");
    }
    const key = token.slice(2);
    if (!new Set(["profile", "output"]).has(key) || Object.hasOwn(options, key)) {
      throw new Error(`Unknown or duplicate Fixture 007 option --${key}.`);
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
  validateFixture007Config(config);
  if (
    seedDocument.schema !== 1
    || seedDocument.partition !== "development"
    || !Array.isArray(seedDocument.seeds)
    || seedDocument.seeds.length === 0
    || seedDocument.seeds.some((seed) => !Number.isInteger(seed) || seed < 0 || seed > 0xffff_ffff)
    || new Set(seedDocument.seeds).size !== seedDocument.seeds.length
  ) throw new Error("Fixture 007 development seed pack is invalid.");
  const seeds = profile === "smoke" ? seedDocument.seeds.slice(0, 2) : seedDocument.seeds;
  return { config, configPath, seeds, seedsPath };
}

function outputPath(value) {
  const resolved = path.resolve(repositoryRoot, value);
  if (!isInside(repositoryRoot, resolved) || resolved === repositoryRoot) {
    throw new Error("Fixture 007 output must stay inside the repository.");
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

function armDecision(arm, episode, config) {
  if (arm === "mature-selective") {
    return { decision: null, activeObservation: null, photons: 0, energy: 0 };
  }
  if (arm === "unqualified-point") {
    return {
      decision: episode.base_observation < 0 ? -1 : 1,
      activeObservation: null,
      photons: 0,
      energy: 0,
    };
  }
  return {
    decision: episode.active_observation < 0 ? -1 : 1,
    activeObservation: episode.active_observation,
    photons: config.active_photons,
    energy: config.modeled_energy_j_per_active_observation,
  };
}

export async function executeFixture007({
  profile,
  output,
  executionEnvironment = process.env,
  executionRuntime = process,
}) {
  const inputs = await profileInputs(profile);
  const executionReceipt = createExperimentExecutionReceipt({
    artifact: "fixture-007",
    command: profile === "smoke" ? "smoke" : "run",
    profile,
    environment: executionEnvironment,
    runtime: executionRuntime,
  });
  const directory = outputPath(output);
  await mkdir(path.dirname(directory), { recursive: true });
  await mkdir(directory);
  const identity = {
    schema: 1,
    artifact: "fixture-007",
    runner_version: FIXTURE_007_RUNNER_VERSION,
    generator_version: FIXTURE_007_GENERATOR_VERSION,
    event_contract_version: FIXTURE_007_EVENT_CONTRACT_VERSION,
    profile,
    config: inputs.config,
    seeds: inputs.seeds,
    arms,
  };
  const runId = sha256(canonical(identity));
  const rawPath = path.join(directory, "raw-events.jsonl");
  const handle = await open(rawPath, "wx", 0o600);
  let sequence = 0;
  let previousHash = null;
  try {
    for (const seed of inputs.seeds) {
      const episodes = generateNullSpaceEpisodes({ seed, config: inputs.config });
      for (const episode of episodes) {
        for (const arm of arms) {
          const outcome = armDecision(arm, episode, inputs.config);
          const event = buildFixture007Event({
            schema: 1,
            contract_version: FIXTURE_007_EVENT_CONTRACT_VERSION,
            artifact: "fixture-007",
            run_id: runId,
            sequence,
            seed,
            episode: episode.episode,
            arm,
            operator_version: episode.operator_version,
            base_observation: episode.base_observation,
            active_observation: outcome.activeObservation,
            true_label: episode.true_label,
            decision: outcome.decision,
            abstained: outcome.decision === null,
            active_measurement: outcome.activeObservation !== null,
            photons: outcome.photons,
            modeled_energy_j: outcome.energy,
            previous_hash: previousHash,
          });
          assertFixture007Event(event, { previousHash, sequence });
          await handle.write(`${JSON.stringify(event)}\n`);
          previousHash = event.record_sha256;
          sequence += 1;
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
    execution_receipt: executionReceipt,
    config_path: path.relative(repositoryRoot, inputs.configPath).replaceAll("\\", "/"),
    seeds_path: path.relative(repositoryRoot, inputs.seedsPath).replaceAll("\\", "/"),
    total_events: sequence,
    terminal_record_sha256: previousHash,
    measurement_semantics: "synthetic-null-space-fixture",
    measured_energy_present: false,
    claim_eligible: false,
    scientific_result: false,
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
    assertFixture007Event(event, { previousHash, sequence });
    previousHash = event.record_sha256;
    events.push(event);
  }
  return { events, previousHash, rawSha256: createHash("sha256").update(text).digest("hex") };
}

function armMetrics(events, arm) {
  const rows = events.filter((event) => event.arm === arm);
  const decided = rows.filter((event) => !event.abstained);
  const correct = decided.filter((event) => event.decision === event.true_label).length;
  const wrong = decided.length - correct;
  return {
    episodes: rows.length,
    decisions: decided.length,
    correct,
    wrong,
    accuracy: decided.length === 0 ? null : correct / decided.length,
    abstention_rate: rows.length === 0 ? null : (rows.length - decided.length) / rows.length,
    false_specificity_rate: rows.length === 0 ? null : wrong / rows.length,
    active_measurements: rows.filter((event) => event.active_measurement).length,
    photons: rows.reduce((sum, event) => sum + event.photons, 0),
    modeled_energy_j: rows.reduce((sum, event) => sum + event.modeled_energy_j, 0),
  };
}

export async function computeFixture007Analysis(
  output,
  { executionEnvironment = process.env, executionRuntime = process } = {},
) {
  const directory = outputPath(output);
  const [run, raw] = await Promise.all([
    loadJson(path.join(directory, "run.json")),
    readValidatedEvents(directory),
  ]);
  if (
    run.artifact !== "fixture-007"
    || run.run_id !== raw.events[0]?.run_id
    || run.total_events !== raw.events.length
    || run.terminal_record_sha256 !== raw.previousHash
    || raw.events.some((event) => event.run_id !== run.run_id)
  ) throw new Error("Fixture 007 run metadata disagree with the raw event ledger.");
  assertCurrentExperimentExecutionIdentity(run.execution_receipt, {
    artifact: "fixture-007",
    profile: run.profile,
    environment: executionEnvironment,
    runtime: executionRuntime,
  });
  const metrics = Object.fromEntries(arms.map((arm) => [arm, armMetrics(raw.events, arm)]));
  const matureActive = metrics["mature-active"];
  const qualifiedActive = metrics["operator-qualified-active"];
  const checks = {
    negative_control_exposes_false_specificity:
      metrics["unqualified-point"].false_specificity_rate >= 0.25
      && metrics["unqualified-point"].false_specificity_rate <= 0.75,
    selective_baseline_refuses_unidentified_state:
      metrics["mature-selective"].abstention_rate === 1
      && metrics["mature-selective"].false_specificity_rate === 0,
    active_measurement_resolves_fixture:
      matureActive.accuracy >= 0.9
      && qualifiedActive.accuracy >= 0.9,
    complete_mature_null_matches_proposed_composition:
      canonical(matureActive) === canonical(qualifiedActive),
    equal_active_resource_accounting:
      matureActive.photons === qualifiedActive.photons
      && matureActive.modeled_energy_j === qualifiedActive.modeled_energy_j,
  };
  const passed = Object.values(checks).every(Boolean);
  return {
    schema: 1,
    artifact: "fixture-007",
    contract_version: "fixture-007.null-space-analysis.v1",
    run_id: run.run_id,
    profile: run.profile,
    raw_events_sha256: raw.rawSha256,
    run_sha256: sha256(canonical(run)),
    metrics,
    checks,
    decision: passed ? "diagnostic-pass" : "diagnostic-fail",
    claim_eligible: false,
    scientific_result: false,
    interpretation: "The fixture must expose false specificity, reward justified abstention or added evidence, and show no artificial advantage over the complete mature active null.",
  };
}

export async function analyzeFixture007(output, executionIdentity = {}) {
  const directory = outputPath(output);
  const summary = await computeFixture007Analysis(directory, executionIdentity);
  await mkdir(path.join(directory, "analysis"), { recursive: true });
  await writeJsonStable(path.join(directory, "analysis", "summary.json"), summary);
  if (summary.decision !== "diagnostic-pass") {
    throw new Error("Fixture 007 diagnostic rejection checks failed.");
  }
  return summary;
}

export async function validateFixture007Output(output, executionIdentity = {}) {
  const directory = outputPath(output);
  const [expected, stored] = await Promise.all([
    computeFixture007Analysis(directory, executionIdentity),
    loadJson(path.join(directory, "analysis", "summary.json")),
  ]);
  if (canonical(expected) !== canonical(stored)) {
    throw new Error("Fixture 007 stored analysis is not reproducible from raw events.");
  }
  if (stored.claim_eligible !== false || stored.scientific_result !== false) {
    throw new Error("Fixture 007 smoke output attempts to claim scientific authority.");
  }
  return Object.freeze({ valid: true, run_id: stored.run_id, decision: stored.decision });
}

export async function prepareFixture007(profile) {
  const inputs = await profileInputs(profile);
  return Object.freeze({
    valid: true,
    artifact: "fixture-007",
    profile,
    seeds: inputs.seeds.length,
    opportunities_per_seed: inputs.config.opportunities_per_seed,
    events: inputs.seeds.length * inputs.config.opportunities_per_seed * arms.length,
    measured_energy_required: false,
    claim_eligible: false,
  });
}

export async function main(
  argv = process.argv,
  executionEnvironment = process.env,
  executionRuntime = process,
) {
  const { action, options } = parseOptions(argv);
  assertExperimentExecutionEnvironment({
    artifact: "fixture-007",
    environment: executionEnvironment,
  });
  const executionIdentity = { executionEnvironment, executionRuntime };
  if (action === "prepare") return prepareFixture007(options.profile);
  if (action === "smoke") {
    await executeFixture007({
      profile: options.profile,
      output: options.output,
      executionEnvironment,
      executionRuntime,
    });
    await analyzeFixture007(options.output, executionIdentity);
    return validateFixture007Output(options.output, executionIdentity);
  }
  if (action === "run") {
    return executeFixture007({
      profile: options.profile,
      output: options.output,
      executionEnvironment,
      executionRuntime,
    });
  }
  if (action === "analyze") return analyzeFixture007(options.output, executionIdentity);
  return validateFixture007Output(options.output, executionIdentity);
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
