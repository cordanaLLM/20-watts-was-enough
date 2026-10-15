import { createHash, randomBytes } from "node:crypto";
import {
  access,
  lstat,
  mkdir,
  open,
  readFile,
  realpath,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";

import {
  canonicalize,
  openCheckpointLedger,
  remainingWorkUnits,
  sha256Hex,
} from "../lib/checkpoint-ledger.mjs";
import {
  assertCurrentExperimentExecutionIdentity,
  assertExperimentExecutionEnvironment,
  createExperimentExecutionReceipt,
} from "../lib/execution-receipt.mjs";
import {
  assertFixture019Record,
  fixture019ScientificPayload,
  fixture019WorkKey,
} from "./contract.mjs";

export const FIXTURE_019_RUNNER_VERSION = "fixture-019.fm-t02-runner.v1";

const fixtureRoot = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(fixtureRoot, "../../..");
const coreSources = [
  "../lib/checkpoint-ledger.mjs",
  "analysis.py",
  "contract.mjs",
  "evaluator.py",
  "generator.py",
  "output.schema.json",
  "python-environment.lock.json",
  "runner.mjs",
  "simulator.py",
  "worker.py",
];
const allowedCells = ["base", "eta-zero", "overlap-high", "funding-on"];

function isInside(root, target) {
  const relative = path.relative(root, target);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function parseOptions(argv) {
  const action = argv[2];
  if (!new Set(["prepare", "smoke", "run", "analyze", "validate"]).has(action)) {
    throw new Error("Fixture 019 action must be prepare, smoke, run, analyze, or validate.");
  }
  if ((argv.length - 3) % 2 !== 0) throw new Error("Options require explicit --name value pairs.");
  const options = {};
  for (let index = 3; index < argv.length; index += 2) {
    const token = argv[index];
    const value = argv[index + 1];
    if (!/^--[a-z][a-z-]*$/.test(token ?? "") || !value || value.startsWith("--")) {
      throw new Error("Fixture 019 options require explicit --name value pairs.");
    }
    const key = token.slice(2);
    if (!new Set(["profile", "output", "resume"]).has(key) || Object.hasOwn(options, key)) {
      throw new Error(`Unknown or duplicate Fixture 019 option --${key}.`);
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
  if (action === "prepare" && (options.output !== undefined || options.resume !== undefined)) {
    throw new Error("prepare does not accept --output or --resume.");
  }
  if (action !== "prepare" && !options.output) throw new Error(`${action} requires --output.`);
  if (options.resume !== undefined && !new Set(["true", "false"]).has(options.resume)) {
    throw new Error("--resume must be true or false.");
  }
  if (action === "smoke" && options.profile !== "smoke") throw new Error("smoke requires --profile smoke.");
  if (action === "run" && options.profile !== "development") throw new Error("run requires --profile development.");
  return { action, options };
}

async function loadJson(file) {
  return JSON.parse(await readFile(file, "utf8"));
}

function outputDirectory(value) {
  const resolved = path.resolve(repositoryRoot, value);
  if (!isInside(repositoryRoot, resolved) || resolved === repositoryRoot) {
    throw new Error("Fixture 019 output must remain inside the repository.");
  }
  return resolved;
}

async function assertSafeOutputPath(target, { requireExisting = false } = {}) {
  const repositoryReal = await realpath(repositoryRoot);
  const relative = path.relative(repositoryRoot, target);
  let current = repositoryRoot;
  let missing = false;
  for (const component of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, component);
    if (missing) continue;
    let information;
    try {
      information = await lstat(current);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      missing = true;
      continue;
    }
    if (information.isSymbolicLink()) {
      throw new Error("Fixture 019 output refuses symbolic-link or reparse-point traversal.");
    }
    const resolved = await realpath(current);
    if (!isInside(repositoryReal, resolved)) {
      throw new Error("Fixture 019 output resolves outside the repository.");
    }
  }
  if (requireExisting && missing) throw new Error("Fixture 019 output directory does not exist.");
  if (!missing) {
    const information = await lstat(target);
    if (!information.isDirectory()) throw new Error("Fixture 019 output path must be a directory.");
  }
}

async function assertRegularOutputFile(file, { allowMissing = false } = {}) {
  try {
    const information = await lstat(file);
    if (information.isSymbolicLink() || !information.isFile()) {
      throw new Error(`Fixture 019 refuses non-regular output file ${path.basename(file)}.`);
    }
    const resolved = await realpath(file);
    if (!isInside(await realpath(repositoryRoot), resolved)) {
      throw new Error(`Fixture 019 output file ${path.basename(file)} resolves outside the repository.`);
    }
  } catch (error) {
    if (allowMissing && error.code === "ENOENT") return;
    throw error;
  }
}

async function fileSha256(file) {
  return createHash("sha256").update(await readFile(file)).digest("hex");
}

function seedCommitment(seeds) {
  return sha256Hex(JSON.stringify(seeds));
}

function assertUint64Seed(value) {
  return typeof value === "string"
    && /^(?:0|[1-9][0-9]{0,19})$/.test(value)
    && BigInt(value) <= 0xffff_ffff_ffff_ffffn;
}

async function loadInputs(profile) {
  const configPath = path.join(fixtureRoot, "configs", `${profile}.json`);
  const seedsPath = path.join(fixtureRoot, "seeds", "development.reveal.json");
  const environmentPath = path.join(fixtureRoot, "python-environment.lock.json");
  const [config, seedDocument, environment] = await Promise.all([
    loadJson(configPath),
    loadJson(seedsPath),
    loadJson(environmentPath),
  ]);
  if (
    config.schema !== 1
    || config.artifact !== "fixture-019"
    || config.protocol !== "FM-T02-forecast"
    || config.profile !== profile
    || !Number.isInteger(config.seed_count)
    || config.seed_count < 2
    || !Number.isInteger(config.opportunities_per_seed)
    || config.opportunities_per_seed !== allowedCells.length
    || canonicalize(config.cells) !== canonicalize(allowedCells)
    || !Number.isInteger(config.analysis_resamples)
    || config.analysis_resamples < 100
    || config.analysis_resamples > 100000
    || config.max_rounds !== 1000
    || config.convergence_tolerance !== 1e-8
    || config.claim_eligible !== false
  ) throw new Error("Fixture 019 profile is invalid.");
  if (
    seedDocument.schema !== 1
    || seedDocument.state !== "frozen-reveal"
    || seedDocument.partition !== "development"
    || seedDocument.algorithm !== "sha256-json-array-v1"
    || !Array.isArray(seedDocument.seeds)
    || seedDocument.seeds.length < config.seed_count
    || seedDocument.seeds.some((seed) => !assertUint64Seed(seed))
    || new Set(seedDocument.seeds).size !== seedDocument.seeds.length
    || seedDocument.commitment !== seedCommitment(seedDocument.seeds)
  ) throw new Error("Fixture 019 development seed reveal is invalid.");
  if (
    environment.schema !== 1
    || environment.artifact !== "fixture-019"
    || environment.python_implementation !== "CPython"
    || environment.bit_generator !== "PCG64DXSM"
    || environment.network_install_during_run !== false
  ) throw new Error("Fixture 019 Python environment lock is invalid.");
  const sourceHashes = Object.fromEntries(await Promise.all(coreSources.map(async (name) => [
    name,
    await fileSha256(path.join(fixtureRoot, name)),
  ])));
  return {
    config,
    configPath,
    seedDocument,
    seedsPath,
    seeds: seedDocument.seeds.slice(0, config.seed_count),
    environment,
    environmentPath,
    sourceHashes,
  };
}

class PythonWorker {
  constructor() {
    this.child = spawn("python", ["-B", path.join(fixtureRoot, "worker.py")], {
      cwd: fixtureRoot,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    this.spawnError = null;
    this.completion = new Promise((resolve) => {
      this.child.once("error", (error) => {
        this.spawnError = error;
        resolve({ error });
      });
      this.child.once("exit", (code) => resolve({ code }));
    });
    this.lines = createInterface({ input: this.child.stdout, crlfDelay: Infinity });
    this.iterator = this.lines[Symbol.asyncIterator]();
    this.stderr = "";
    this.child.stderr.on("data", (chunk) => {
      this.stderr += chunk.toString("utf8");
      if (this.stderr.length > 8192) this.stderr = this.stderr.slice(-8192);
    });
  }

  async request(value) {
    if (!this.child.stdin.write(`${JSON.stringify(value)}\n`)) {
      await new Promise((resolve) => this.child.stdin.once("drain", resolve));
    }
    const next = await this.iterator.next();
    if (next.done) {
      throw new Error(`Fixture 019 worker exited early: ${this.spawnError?.message ?? this.stderr}`);
    }
    const response = JSON.parse(next.value);
    if (response.ok !== true) throw new Error(`Fixture 019 worker failure: ${response.error}`);
    return response.result;
  }

  async close() {
    this.child.stdin.end();
    this.lines.close();
    const completion = await this.completion;
    if (completion.error) throw completion.error;
    if (completion.code !== 0) throw new Error(`Fixture 019 worker exited ${completion.code}: ${this.stderr}`);
  }
}

async function verifyWorkerEnvironment(inputs, worker) {
  const actual = await worker.request({ action: "environment" });
  if (
    actual.python_implementation !== inputs.environment.python_implementation
    || actual.python_version !== inputs.environment.python_version
    || actual.numpy_version !== inputs.environment.packages.numpy
    || actual.bit_generator !== inputs.environment.bit_generator
    || actual.byteorder !== "little"
  ) throw new Error("Fixture 019 runtime differs from python-environment.lock.json.");
  return actual;
}

function workUnits(inputs) {
  return inputs.seeds.flatMap((seed, replicate) => inputs.config.cells.map((cell) => ({
    seed,
    replicate,
    split: "development",
    cell,
  })));
}

function workUnitKey(unit) {
  return `${unit.split}|${unit.cell}|${unit.replicate}|${unit.seed}`;
}

async function acquireLock(directory) {
  const lockPath = `${directory}.fixture-019.lock`;
  const token = randomBytes(32).toString("hex");
  const handle = await open(lockPath, "wx", 0o600);
  await handle.writeFile(`${JSON.stringify({ schema: 1, artifact: "fixture-019", token_sha256: sha256Hex(token) })}\n`);
  await handle.sync();
  return Object.freeze({
    async release() {
      const document = JSON.parse(await readFile(lockPath, "utf8"));
      if (document.token_sha256 !== sha256Hex(token)) throw new Error("Fixture 019 lock ownership changed.");
      await handle.close();
      await rm(lockPath);
    },
  });
}

async function writeStableJson(file, value) {
  const body = `${JSON.stringify(value, null, 2)}\n`;
  try {
    await writeFile(file, body, { flag: "wx", mode: 0o600 });
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
    await assertRegularOutputFile(file);
    const existing = JSON.parse(await readFile(file, "utf8"));
    if (canonicalize(existing) !== canonicalize(value)) {
      throw new Error(`Refusing to replace non-identical ${path.basename(file)}.`, { cause: error });
    }
  }
}

function runIdentity(inputs) {
  const body = {
    schema: 1,
    artifact: "fixture-019",
    runner_version: FIXTURE_019_RUNNER_VERSION,
    protocol: "FM-T02-forecast",
    claim_scope: ["C-1481"],
    profile: inputs.config.profile,
    config_sha256: sha256Hex(canonicalize(inputs.config)),
    seeds_commitment: inputs.seedDocument.commitment,
    environment_sha256: sha256Hex(canonicalize(inputs.environment)),
    source_hashes: inputs.sourceHashes,
  };
  return { ...body, run_id: sha256Hex(canonicalize(body)) };
}

export async function executeFixture019({
  profile,
  output,
  resume = false,
  executionEnvironment = process.env,
  executionRuntime = process,
}) {
  const inputs = await loadInputs(profile);
  const executionReceipt = createExperimentExecutionReceipt({
    artifact: "fixture-019",
    command: profile === "smoke" ? "smoke" : "run",
    profile,
    environment: executionEnvironment,
    runtime: executionRuntime,
  });
  const directory = outputDirectory(output);
  await assertSafeOutputPath(directory);
  await mkdir(path.dirname(directory), { recursive: true });
  let exists = true;
  try {
    await access(directory);
  } catch {
    exists = false;
  }
  if (exists && !resume) throw new Error("Fixture 019 output already exists; use --resume true.");
  if (!exists && resume) throw new Error("Fixture 019 cannot resume a missing output directory.");
  if (!exists) await mkdir(directory);
  await assertSafeOutputPath(directory, { requireExisting: true });
  await Promise.all([
    "raw-events.jsonl",
    "checkpoint.json",
    "run.json",
  ].map((name) => assertRegularOutputFile(path.join(directory, name), { allowMissing: true })));
  const lock = await acquireLock(directory);
  const identity = runIdentity(inputs);
  const rawPath = path.join(directory, "raw-events.jsonl");
  const checkpointPath = path.join(directory, "checkpoint.json");
  let worker = null;
  try {
    worker = new PythonWorker();
    const environment = await verifyWorkerEnvironment(inputs, worker);
    const ledger = await openCheckpointLedger({
      artifact: "fixture-019",
      ledgerFormat: "fixture-019.fm-t02-ledger.v1",
      rawPath,
      checkpointPath,
      runIdentity: identity,
      scientificPayload: fixture019ScientificPayload,
      workKey: fixture019WorkKey,
      assertRecord: assertFixture019Record,
    });
    const units = workUnits(inputs);
    const remaining = remainingWorkUnits(units, ledger.completedWorkKeys(), workUnitKey);
    for (const unit of remaining) {
      const event = await worker.request({ action: "simulate", ...unit });
      if (fixture019WorkKey({ ...event, seed: event.seed_uint64 }) !== workUnitKey(unit)) {
        throw new Error("Fixture 019 worker returned the wrong work unit.");
      }
      await ledger.append(event);
      await ledger.saveCheckpoint();
    }
    const run = {
      ...identity,
      command_profile: profile,
      execution_receipt: executionReceipt,
      environment,
      expected_work_units: units.length,
      ledger: ledger.summary(),
      raw_path: path.relative(repositoryRoot, rawPath).replaceAll("\\", "/"),
      checkpoint_path: path.relative(repositoryRoot, checkpointPath).replaceAll("\\", "/"),
      confirmation_seed_state: "pending-private-escrow-unavailable",
      held_out_seed_state: "pending-private-escrow-unavailable",
      measured_energy_present: false,
      claim_eligible: false,
      scientific_result: false,
    };
    if (run.ledger.completed_work_units !== units.length) throw new Error("Fixture 019 run is incomplete.");
    await writeStableJson(path.join(directory, "run.json"), run);
    return { directory, run };
  } finally {
    await worker?.close().catch(() => {});
    await lock.release();
  }
}

async function readValidatedRecords(directory) {
  const rawText = await readFile(path.join(directory, "raw-events.jsonl"), "utf8");
  if (rawText.length > 0 && !rawText.endsWith("\n")) throw new Error("Fixture 019 raw ledger has a torn tail.");
  const records = [];
  let previousHash = "0".repeat(64);
  const scientificDigest = createHash("sha256");
  for (const [sequence, line] of rawText.split(/\r?\n/u).filter(Boolean).entries()) {
    const record = JSON.parse(line);
    assertFixture019Record(record, { sequence, previousHash });
    scientificDigest.update(canonicalize(fixture019ScientificPayload(record)));
    previousHash = record.integrity.record_sha256;
    records.push(record);
  }
  return {
    records,
    rawSha256: createHash("sha256").update(rawText).digest("hex"),
    scientificPayloadSha256: scientificDigest.digest("hex"),
    completedWorkUnitsSha256: sha256Hex(canonicalize(records.map(fixture019WorkKey).sort())),
    previousHash,
  };
}

async function verifyFrozenRunIdentity(
  directory,
  run,
  raw,
  inputs,
  { executionEnvironment = process.env, executionRuntime = process } = {},
) {
  const freshIdentity = runIdentity(inputs);
  for (const [field, expected] of Object.entries(freshIdentity)) {
    if (canonicalize(run[field]) !== canonicalize(expected)) {
      throw new Error(`Fixture 019 frozen run identity changed at ${field}.`);
    }
  }
  if (run.command_profile !== run.profile) throw new Error("Fixture 019 command profile is not frozen to the run profile.");
  assertCurrentExperimentExecutionIdentity(run.execution_receipt, {
    artifact: "fixture-019",
    profile: run.profile,
    environment: executionEnvironment,
    runtime: executionRuntime,
  });
  if (
    run.ledger.records !== raw.records.length
    || run.ledger.completed_work_units !== raw.records.length
    || run.ledger.scientific_payload_sha256 !== raw.scientificPayloadSha256
    || run.ledger.hash_chain_sha256 !== raw.previousHash
    || run.ledger.checkpoint_status !== "current"
  ) throw new Error("Fixture 019 run metadata disagree with the recomputed raw ledger.");

  const checkpoint = await loadJson(path.join(directory, "checkpoint.json"));
  const { checkpoint_sha256: checkpointSha256, ...checkpointBody } = checkpoint;
  if (
    checkpointSha256 !== sha256Hex(canonicalize(checkpointBody))
    || canonicalize(checkpoint.run_identity) !== canonicalize(freshIdentity)
    || checkpoint.records !== raw.records.length
    || checkpoint.scientific_payload_sha256 !== raw.scientificPayloadSha256
    || checkpoint.hash_chain_sha256 !== raw.previousHash
    || checkpoint.completed_work_units_sha256 !== raw.completedWorkUnitsSha256
  ) throw new Error("Fixture 019 checkpoint is not bound to the fresh run/source/environment identity.");
  return freshIdentity;
}

export async function computeFixture019Analysis(output, executionIdentity = {}) {
  const directory = outputDirectory(output);
  await assertSafeOutputPath(directory, { requireExisting: true });
  await Promise.all([
    "raw-events.jsonl",
    "checkpoint.json",
    "run.json",
  ].map((name) => assertRegularOutputFile(path.join(directory, name))));
  const [run, raw] = await Promise.all([
    loadJson(path.join(directory, "run.json")),
    readValidatedRecords(directory),
  ]);
  if (
    run.artifact !== "fixture-019"
  ) throw new Error("Fixture 019 run metadata disagree with its raw ledger.");
  const inputs = await loadInputs(run.profile);
  await verifyFrozenRunIdentity(directory, run, raw, inputs, executionIdentity);
  const expected = workUnits(inputs).map(workUnitKey).sort();
  const observed = raw.records.map((record) => fixture019WorkKey(record)).sort();
  if (canonicalize(expected) !== canonicalize(observed)) throw new Error("Fixture 019 work-unit population is incomplete.");

  const base = raw.records.filter((record) => record.cell === "base");
  const contrasts = base.map((record) => (
    0.8 * record.arms["one-pass"].forecast_loss - record.arms["full-fixed-point"].forecast_loss
  ));
  const worker = new PythonWorker();
  let statistical;
  try {
    const currentEnvironment = await verifyWorkerEnvironment(inputs, worker);
    if (canonicalize(currentEnvironment) !== canonicalize(run.environment)) {
      throw new Error("Fixture 019 current worker environment differs from the frozen run environment.");
    }
    const analysisDirectory = path.join(directory, "analysis");
    const resampleDirectory = path.join(analysisDirectory, "resamples");
    await assertSafeOutputPath(analysisDirectory);
    await mkdir(resampleDirectory, { recursive: true });
    await assertSafeOutputPath(resampleDirectory, { requireExisting: true });
    const resampleFiles = [
      path.join(resampleDirectory, "primary-sign-vectors.i8"),
      path.join(resampleDirectory, "primary-bootstrap-indices.u32le"),
    ];
    await Promise.all(resampleFiles.map((file) => assertRegularOutputFile(file, { allowMissing: true })));
    statistical = await worker.request({
      action: "analyze",
      contrasts,
      resamples: inputs.config.analysis_resamples,
      label: `${run.profile}-diagnostic`,
      persist_directory: resampleDirectory,
    });
    await Promise.all(resampleFiles.map((file) => assertRegularOutputFile(file)));
  } finally {
    await worker.close().catch(() => {});
  }
  const checks = {
    complete_work_unit_population: raw.records.length === run.expected_work_units,
    no_terminal_hard_gate_failure: raw.records.every((record) => record.terminal_status === "ok"),
    independent_evaluator_agreement: raw.records.every((record) => record.checks.independent_evaluator_agreement),
    balance_and_sale_identities: raw.records.every((record) => record.checks.balance_and_sale_identities),
    eta_zero_boundary: raw.records.filter((record) => record.cell === "eta-zero")
      .every((record) => record.checks.eta_zero_boundary),
    funding_call_at_most_once: raw.records.filter((record) => record.cell === "funding-on")
      .every((record) => record.truth.funding_call_count <= 1 && record.checks.funding_call_exactly_once),
    confirmation_seed_pack_unavailable: run.confirmation_seed_state === "pending-private-escrow-unavailable",
    held_out_seed_pack_unavailable: run.held_out_seed_state === "pending-private-escrow-unavailable",
    energy_claim_forbidden: run.measured_energy_present === false,
  };
  const contrastMean = contrasts.reduce((sum, value) => sum + value, 0) / contrasts.length;
  const contrastSampleSd = Math.sqrt(contrasts.reduce(
    (sum, value) => sum + (value - contrastMean) ** 2,
    0,
  ) / (contrasts.length - 1));
  const contrastRange = Math.max(...contrasts) - Math.min(...contrasts);
  const distinctWorlds = new Set(base.map((record) => record.world_sha256)).size;
  const seedVariationReachesPrimary = contrastRange > 1e-12;
  return {
    schema: 1,
    artifact: "fixture-019",
    protocol: "FM-T02-forecast",
    claim_scope: ["C-1481"],
    profile: run.profile,
    run_id: run.run_id,
    raw_events_sha256: raw.rawSha256,
    raw_terminal_sha256: raw.previousHash,
    work_units: raw.records.length,
    seed_clusters: base.length,
    diagnostic_primary: {
      estimand: "0.8 * L_one_pass - L_full_fixed_point",
      unit: "1",
      contrasts,
      statistical,
    },
    scientific_eligibility: {
      distinct_generated_worlds: distinctWorlds,
      contrast_sample_sd: contrastSampleSd,
      contrast_range: contrastRange,
      seed_variation_reaches_primary_at_1e_12: seedVariationReachesPrimary,
      confirmation_eligible: false,
      blockers: [
        "confirmation and held-out seed packs are pending fresh private CSPRNG escrow and are unavailable",
        ...(seedVariationReachesPrimary ? [] : [
          "the frozen aggregate FM-T02 forecast endpoint is effectively seed-invariant because the Dirichlet residual allocation cancels under common non-primary shocks and proportional sales",
        ]),
      ],
    },
    checks,
    decision: Object.values(checks).every(Boolean) ? "diagnostic-pass" : "diagnostic-fail",
    multiplicity_placeholder: {
      family: "FM-T01-through-FM-T10",
      unimplemented_protocol_p_values: 9,
      confirmatory_holm_applied: false,
    },
    measured_energy_present: false,
    energy_conclusion_allowed: false,
    confirmation_executed: false,
    transfer_executed: false,
    claim_eligible: false,
    scientific_result: false,
    interpretation: "Development-only plumbing and falsification diagnostics. The current aggregate forecast endpoint is effectively seed-invariant and is not eligible for confirmation; no financial, AI-system, or energy result.",
  };
}

export async function analyzeFixture019(output, executionIdentity = {}) {
  const directory = outputDirectory(output);
  const summary = await computeFixture019Analysis(directory, executionIdentity);
  const analysisDirectory = path.join(directory, "analysis");
  await assertSafeOutputPath(analysisDirectory);
  await mkdir(analysisDirectory, { recursive: true });
  await assertSafeOutputPath(analysisDirectory, { requireExisting: true });
  await writeStableJson(path.join(analysisDirectory, "summary.json"), summary);
  if (summary.decision !== "diagnostic-pass") throw new Error("Fixture 019 diagnostic checks failed.");
  return summary;
}

export async function validateFixture019(output, executionIdentity = {}) {
  const directory = outputDirectory(output);
  await assertSafeOutputPath(directory, { requireExisting: true });
  const expected = await computeFixture019Analysis(directory, executionIdentity);
  const stored = await loadJson(path.join(directory, "analysis", "summary.json"));
  if (canonicalize(expected) !== canonicalize(stored)) throw new Error("Fixture 019 stored analysis is not reproducible.");
  const files = await Promise.all([
    stat(path.join(directory, "raw-events.jsonl")),
    stat(path.join(directory, "checkpoint.json")),
    stat(path.join(directory, "run.json")),
    stat(path.join(directory, "analysis", "summary.json")),
  ]);
  if (files.some((entry) => !entry.isFile())) throw new Error("Fixture 019 output contains a missing required file.");
  await Promise.all([
    "raw-events.jsonl",
    "checkpoint.json",
    "run.json",
    path.join("analysis", "summary.json"),
  ].map((name) => assertRegularOutputFile(path.join(directory, name))));
  return { valid: true, decision: expected.decision, claim_eligible: false, scientific_result: false };
}

export async function prepareFixture019(profile) {
  const inputs = await loadInputs(profile);
  const worker = new PythonWorker();
  try {
    const environment = await verifyWorkerEnvironment(inputs, worker);
    return {
      prepared: true,
      artifact: "fixture-019",
      profile,
      work_units: workUnits(inputs).length,
      environment,
      confirmation_seed_state: "pending-private-escrow-unavailable",
      held_out_seed_state: "pending-private-escrow-unavailable",
      claim_eligible: false,
    };
  } finally {
    await worker.close().catch(() => {});
  }
}

export async function main(
  argv = process.argv,
  executionEnvironment = process.env,
  executionRuntime = process,
) {
  const { action, options } = parseOptions(argv);
  assertExperimentExecutionEnvironment({
    artifact: "fixture-019",
    environment: executionEnvironment,
  });
  const executionIdentity = { executionEnvironment, executionRuntime };
  if (action === "prepare") {
    console.log(JSON.stringify(await prepareFixture019(options.profile), null, 2));
    return;
  }
  if (action === "smoke" || action === "run") {
    const result = await executeFixture019({
      profile: options.profile,
      output: options.output,
      resume: options.resume === "true",
      executionEnvironment,
      executionRuntime,
    });
    console.log(JSON.stringify({ output: path.relative(repositoryRoot, result.directory).replaceAll("\\", "/"), run: result.run }, null, 2));
    return;
  }
  if (action === "analyze") {
    console.log(JSON.stringify(await analyzeFixture019(options.output, executionIdentity), null, 2));
    return;
  }
  console.log(JSON.stringify(await validateFixture019(options.output, executionIdentity), null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.stack ?? error.message);
    process.exitCode = 1;
  });
}
