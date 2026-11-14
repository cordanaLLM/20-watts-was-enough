import path from "node:path";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";
import { openCheckpointLedger } from "../lib/checkpoint-ledger.mjs";
import { acquireLock } from "../lib/output-lock.mjs";
import { assertFixture020Record, canonical, ExecutionStop, FIXTURE_020_EVENT_CONTRACT_VERSION,
  NO_RESULT, scientificPayload, worldId } from "./contract.mjs";
import { evaluateArmA } from "./evaluator.mjs";
import { generateFixture020World, interruptedWorld } from "./generator.mjs";
import { loadInputs, repositoryRoot } from "./inputs.mjs";
import { memoryCapCheck, processCounters } from "./resources.mjs";
import { verifyWorldArtifacts, worldArtifacts, writeWorldArtifacts } from "./artifacts.mjs";
import { atomicText, io, IoDeadline, json, optionalText, outputBytes, outputDirectory,
  readText, removeText, stableJson, stableText } from "./storage.mjs";

export const FIXTURE_020_RUNNER_VERSION = "fixture-020.icp-t01-runner.v1";
const ledgerFormat = "fixture-020.icp-t01-ledger.v1";

export function executionCheck({ signal, deadline, clock = () => performance.now() }) {
  return () => {
    if (signal?.aborted) throw new ExecutionStop("cancelled");
    if (clock() >= deadline) throw new ExecutionStop("timeout");
  };
}

function makeRecord(identity, world, artifacts, stop) {
  const evaluation = artifacts.metrics;
  return { schema: 1, contract_version: FIXTURE_020_EVENT_CONTRACT_VERSION,
    artifact: "fixture-020", track: "ICP-T01", run_id: identity.run_id,
    profile: identity.profile, pack: "public-development", seed: world.seed,
    world_id: world.world_id, world_sha256: world.world_sha256, arm: "A",
    maximum_loss_mmol: evaluation.maximum_loss_mmol, loss_mmol: evaluation.loss_mmol,
    failure_reason: evaluation.failure_reason, evaluation, execution_stop: stop,
    artifacts_sha256: artifacts.hashes, ...NO_RESULT };
}

function computeWorld(identity, seed, check = () => {}) {
  let index = 0;
  let stop = null;
  const tracked = () => {
    index += 1;
    try { check(); } catch (error) {
      if (error instanceof ExecutionStop) stop = { reason: error.reason, check_index: index };
      throw error;
    }
  };
  const world = generatedOrInterrupted(seed, tracked);
  const evaluation = evaluateArmA(world, { check: tracked });
  const artifacts = worldArtifacts(world, evaluation);
  return { world, artifacts, record: makeRecord(identity, world, artifacts, stop) };
}

function generatedOrInterrupted(seed, check) {
  try { return generateFixture020World({ seed, check }); } catch (error) {
    if (!(error instanceof ExecutionStop)) throw error;
    return interruptedWorld(seed, error.reason);
  }
}

async function openLedger(directory, identity) {
  await optionalText(path.join(directory, "raw-events.jsonl"));
  await optionalText(path.join(directory, "checkpoint.json"));
  return io(() => openCheckpointLedger({ artifact: "fixture-020", ledgerFormat,
    rawPath: path.join(directory, "raw-events.jsonl"),
    checkpointPath: path.join(directory, "checkpoint.json"), runIdentity: identity,
    scientificPayload, workKey: (record) => record.world_id,
    assertRecord: (record, options) => assertFixture020Record(record, { ...options, context: identity }),
  }), "open verified checkpoint ledger");
}

async function rawRecords(directory) {
  const raw = await optionalText(path.join(directory, "raw-events.jsonl"));
  if (!raw) return [];
  if (!raw.endsWith("\n")) throw new Error("ICP-T01 torn raw ledger; refusing repair.");
  return raw.slice(0, -1).split("\n").map((line) => JSON.parse(line));
}

async function verifyReplay(directory, identity, records, check = () => {}) {
  if (records.length > identity.seeds.length) throw new Error("ICP-T01 too many world records.");
  for (let index = 0; index < records.length; index += 1) {
    const fresh = replayedWorld(identity, records[index], identity.seeds[index], check);
    await verifyWorldArtifacts(path.join(directory, fresh.world.world_id), fresh.artifacts);
  }
}

function replayedWorld(identity, record, seed, check) {
  let interrupted;
  const outerCheck = () => {
    try { check(); } catch (error) { interrupted = error; throw error; }
  };
  const fresh = computeWorld(identity, seed, replayCheck(record.execution_stop, outerCheck));
  if (interrupted) throw new Error(`ICP-T01 replay ${interrupted.reason ?? interrupted.message}.`, { cause: interrupted });
  if (canonical(scientificPayload(record)) !== canonical(fresh.record)) {
    throw new Error("ICP-T01 canonical world replay differs from retained payload.");
  }
  return fresh;
}

function replayCheck(stop, check) {
  let index = 0;
  return () => {
    check();
    index += 1;
    if (stop && index === stop.check_index) throw new ExecutionStop(stop.reason);
  };
}

async function initializeOutput(output, resume) {
  const directory = await outputDirectory(repositoryRoot, output);
  const previous = await optionalText(path.join(directory, "identity.json"));
  if (previous !== null && !resume) throw new Error("ICP-T01 output already exists; use --resume true.");
  if (previous === null && resume) throw new Error("ICP-T01 cannot resume missing identity.");
  await outputDirectory(repositoryRoot, output, true);
  return directory;
}

async function appendWorld(directory, ledger, identity, seed, check, append) {
  const pending = path.join(directory, worldId(seed), "pending-outcome.json");
  const retained = await optionalText(pending);
  const fresh = retained === null ? computeWorld(identity, seed, check)
    : replayedWorld(identity, JSON.parse(retained), seed, check);
  const worldDirectory = path.join(directory, fresh.world.world_id);
  await outputDirectory(repositoryRoot, worldDirectory, true);
  await stableJson(pending, fresh.record);
  await writeWorldArtifacts(worldDirectory, fresh.artifacts);
  await outputBytes(directory, identity.config.max_output_bytes);
  await io(() => append(ledger, fresh.record), "append world outcome");
  await removeText(pending);
  await io(() => ledger.saveCheckpoint(), "save checkpoint");
  if (fresh.record.execution_stop && retained === null) throw new ExecutionStop(fresh.record.execution_stop.reason);
}

async function reconcilePending(directory, identity, records, check) {
  for (let index = 0; index < identity.seeds.length; index += 1) {
    const file = path.join(directory, worldId(identity.seeds[index]), "pending-outcome.json");
    const pending = await optionalText(file);
    if (pending === null) continue;
    if (index === records.length) {
      replayedWorld(identity, JSON.parse(pending), identity.seeds[index], check);
      continue;
    }
    if (index > records.length || canonical(JSON.parse(pending)) !== canonical(scientificPayload(records[index]))) {
      throw new Error(`ICP-T01 conflicting pending outcome: ${file}.`);
    }
    await removeText(file);
  }
}

function runDocument(identity, ledger) {
  return { ...identity, runner_version: FIXTURE_020_RUNNER_VERSION,
    expected_work_units: identity.seeds.length, ledger: ledger.summary(), ...NO_RESULT };
}

function assertRepairableRun(previous, body) {
  if (previous.length >= body.length || !body.startsWith(previous)) {
    throw new Error("ICP-T01 complete run document differs.");
  }
}

async function writeRun(directory, identity, ledger, resume) {
  const run = runDocument(identity, ledger);
  const file = path.join(directory, "run.json");
  const previous = await optionalText(file);
  const body = `${canonical(run)}\n`;
  if (previous !== null && previous !== body) {
    if (!resume || previous.endsWith("\n")) throw new Error("ICP-T01 run document differs.");
    assertRepairableRun(previous, body);
    await atomicText(file, body);
  } else await stableText(file, body);
  const records = await rawRecords(directory);
  await stableText(path.join(directory, "seed-outcomes.jsonl"), `${records.map(canonical).join("\n")}\n`);
  return run;
}

export async function executeFixture020(options) {
  try { return await executeBounded(options); } catch (error) {
    if (deadlineCause(error)) throw deadlineInterrupted(error);
    throw error;
  }
}

async function executeBounded({ profile, output, resume = false, maxWorkUnits = 64,
  signal, wallMs, deadline, clock = () => performance.now(), counters = processCounters,
  append = (ledger, record) => ledger.append(record) }) {
  const identity = await loadInputs(profile);
  const budget = executionBudget(identity, maxWorkUnits, wallMs);
  const end = deadline ?? clock() + budget;
  const check = executionCheck({ signal, deadline: end, clock });
  const worldCheck = executionCheck({ deadline: end, clock });
  check();
  const directory = await outputDirectory(repositoryRoot, output, true);
  const lock = await outputLock(directory);
  let result;
  try {
    await initializeOutput(output, resume);
    await stableJson(path.join(directory, "identity.json"), identity);
    const ledger = await openLedger(directory, identity);
    result = await executeLocked({ directory, identity, ledger, maxWorkUnits, resume, check, worldCheck, counters, append });
  } finally { await lock.release(); }
  check();
  return result;
}

async function outputLock(directory) {
  try { return await acquireLock(directory, "fixture-020"); } catch (error) {
    if (error.code !== "EEXIST") throw error;
    throw new Error(`ICP-T01 output lock ${directory}.fixture-020.lock exists; delete it only after confirming no process uses the output.`, { cause: error });
  }
}

async function executeLocked({ directory, identity, ledger, maxWorkUnits, resume, check, worldCheck, counters, append }) {
  const records = await rawRecords(directory);
  await verifyReplay(directory, identity, records, check);
  await reconcilePending(directory, identity, records, check);
  try {
    const remaining = identity.seeds.slice(ledger.summary().records, ledger.summary().records + maxWorkUnits);
    for (const seed of remaining) {
      check();
      await memoryBoundary(identity, counters);
      await appendWorld(directory, ledger, identity, seed, worldCheck, append);
      check();
      await memoryBoundary(identity, counters);
    }
    await io(() => ledger.saveCheckpoint(), "save final checkpoint");
    const complete = ledger.summary().records === identity.seeds.length;
    const run = complete ? await writeRun(directory, identity, ledger, resume) : null;
    await outputBytes(directory, identity.config.max_output_bytes);
    check();
    return { directory, complete, run, ...NO_RESULT };
  } catch (error) { return interruption(directory, ledger, error); }
}

async function memoryBoundary(identity, counters) {
  const observed = await io(() => counters(), "read boundary memory counters");
  try {
    memoryCapCheck({ peakBytes: observed.peak_resident_bytes,
      currentBytes: observed.current_resident_bytes, capBytes: identity.config.memory_bytes });
  } catch (error) {
    const stop = new ExecutionStop("memory-cap");
    stop.cause = error;
    throw stop;
  }
}

async function interruption(directory, ledger, error) {
  if (deadlineCause(error)) throw deadlineInterrupted(error);
  await stableJson(path.join(directory, `interruption-${ledger.summary().records}.json`), {
    completed_worlds: ledger.summary().records, reason: error.message, ...NO_RESULT,
  });
  throw new Error(`ICP-T01 execution interrupted: ${error.message}`, { cause: error });
}

function deadlineInterrupted(error) {
  const deadline = deadlineCause(error);
  return new Error(`ICP-T01 execution interrupted: ${error.message}; operation settled=${deadline.settled}; an unsettled operation may still complete; resume re-verifies ledger and artifacts.`, { cause: error });
}

function deadlineCause(error) {
  let cause = error;
  for (let depth = 0; cause && depth < 64; depth += 1) {
    if (cause instanceof IoDeadline) return cause;
    cause = cause.cause;
  }
  return null;
}

function executionBudget(identity, maxWorkUnits, wallMs) {
  if (!Number.isSafeInteger(maxWorkUnits) || maxWorkUnits < 1 || maxWorkUnits > 64) {
    throw new Error("ICP-T01 maxWorkUnits must be in [1,64].");
  }
  const budget = wallMs ?? identity.config.max_wall_ms;
  if (!Number.isFinite(budget) || budget < 0 || budget > identity.config.max_wall_ms) {
    throw new Error("ICP-T01 wall budget invalid.");
  }
  return budget;
}

async function checkedRun(output, { signal, deadline, clock = () => performance.now() } = {}) {
  const directory = await outputDirectory(repositoryRoot, output);
  const stored = await json(path.join(directory, "identity.json"));
  const identity = await loadInputs(stored.profile);
  await outputBytes(directory, identity.config.max_output_bytes);
  if (canonical(identity) !== canonical(stored)) throw new Error("ICP-T01 run identity differs from fresh inputs.");
  const ledger = await openLedger(directory, identity);
  const records = await rawRecords(directory);
  if (records.length !== identity.seeds.length) throw new Error("ICP-T01 incomplete world denominator.");
  const check = executionCheck({ signal, deadline: deadline ?? clock() + identity.config.max_wall_ms, clock });
  await verifyReplay(directory, identity, records, check);
  const run = await json(path.join(directory, "run.json"));
  if (canonical(run) !== canonical(runDocument(identity, ledger))) {
    throw new Error("ICP-T01 run document differs from authoritative ledger.");
  }
  if (await readText(path.join(directory, "seed-outcomes.jsonl")) !== `${records.map(canonical).join("\n")}\n`) {
    throw new Error("ICP-T01 seed outcome stand-in differs from ledger.");
  }
  check();
  return { directory, identity, records, check };
}

export async function computeFixture020Analysis(output, options = {}) {
  return (await checkedAnalysis(output, options)).summary;
}

async function checkedAnalysis(output, options) {
  const { identity, records, check } = await checkedRun(output, options);
  const summary = { schema: 1, artifact: "fixture-020", track: "ICP-T01", run_id: identity.run_id,
    profile: identity.profile, partition: "public-development-only", readiness: "smoke-ready",
    attempted_worlds: identity.seeds.length, retained_worlds: records.length,
    retained_failures: records.filter((record) => record.failure_reason !== null).length,
    loss_unit: "mmol", resource_unit: "synthetic J", confirmation_partition_present: false,
    transfer_partition_present: false, ...NO_RESULT };
  check();
  return { summary, check };
}

export async function analyzeFixture020(output, options = {}) {
  const directory = await outputDirectory(repositoryRoot, output);
  const lock = await outputLock(directory);
  let analysis;
  try {
    analysis = await checkedAnalysis(output, options);
    await stableJson(path.join(directory, "summary.json"), analysis.summary);
  } finally { await lock.release(); }
  analysis.check();
  return analysis.summary;
}

export async function validateFixture020Output(output, options = {}) {
  const { summary: expected, check } = await checkedAnalysis(output, options);
  const directory = await outputDirectory(repositoryRoot, output);
  if (canonical(await json(path.join(directory, "summary.json"))) !== canonical(expected)) {
    throw new Error("ICP-T01 stored summary differs from replay.");
  }
  check();
  return { valid: true, run_id: expected.run_id, ...NO_RESULT };
}

export async function prepareFixture020(profile) {
  const identity = await loadInputs(profile);
  return { valid: true, artifact: "fixture-020", track: "ICP-T01", profile,
    partition: "public-development-only", seeds: identity.seeds.length, worlds_per_seed: 1,
    work_units: identity.seeds.length, confirmation_seeds_created: false, transfer_seeds_created: false,
    ...NO_RESULT };
}

function parseOptions(argv) {
  const action = argv[2];
  if (!["prepare", "smoke", "run", "analyze", "validate"].includes(action)) throw new Error("ICP-T01 action must be prepare, smoke, run, analyze, or validate.");
  if (argv.length > 11 || (argv.length - 3) % 2 !== 0) throw new Error("ICP-T01 options require --name value pairs.");
  const options = {};
  for (let index = 3; index < argv.length; index += 2) {
    addOption(options, argv[index], argv[index + 1]);
  }
  return validateOptions(action, options);
}

function addOption(options, token, value) {
  const name = token.slice(2);
  if (!token.startsWith("--") || !["profile", "output", "resume"].includes(name)
    || Object.hasOwn(options, name) || !value || value.startsWith("--")) {
    throw new Error("Unknown or duplicate ICP-T01 option or missing value.");
  }
  options[name] = value;
}

function validateOptions(action, options) {
  const executing = ["prepare", "smoke", "run"].includes(action);
  validateActionProfile(action, options.profile, executing);
  if (action === "prepare" && (options.output || options.resume)) throw new Error("prepare accepts only --profile.");
  if (action !== "prepare" && !options.output) throw new Error(`${action} requires --output.`);
  if (!executing && (options.profile || options.resume)) throw new Error("analysis accepts only --output.");
  assertResumeFlag(options.resume);
  return { action, options };
}

function assertResumeFlag(value) {
  if (value !== undefined && !["true", "false"].includes(value)) throw new Error("--resume must be true or false.");
}

function validateActionProfile(action, profile, executing) {
  if (executing && !["smoke", "development"].includes(profile)) throw new Error("ICP-T01 public profiles only.");
  if (action === "smoke" && profile !== "smoke") throw new Error("smoke requires --profile smoke.");
  if (action === "run" && profile !== "development") throw new Error("run requires --profile development.");
}

export async function main(argv = process.argv, { signal, clock = () => performance.now(), fromProcessStart = false } = {}) {
  const commandStarted = clock();
  const { started, cpuStarted, scope } = smokeBaseline(fromProcessStart);
  const { action, options } = parseOptions(argv);
  const execution = { signal, clock };
  if (action === "prepare") {
    const result = await prepareFixture020(options.profile);
    executionCheck(execution)();
    return result;
  }
  if (action === "analyze" || action === "validate") {
    const operation = action === "analyze" ? analyzeFixture020 : validateFixture020Output;
    const result = await operation(options.output, execution);
    executionCheck(execution)();
    return result;
  }
  const identity = await loadInputs(options.profile);
  execution.deadline = commandStarted + identity.config.max_wall_ms;
  const result = await executeFixture020({ profile: options.profile, output: options.output,
    resume: options.resume === "true", ...execution });
  executionCheck(execution)();
  if (action === "run") return result;
  await analyzeFixture020(options.output, execution);
  const validation = await validateFixture020Output(options.output, execution);
  const resources = await smokeResources(options.output, started, cpuStarted, scope, identity.config.memory_bytes);
  executionCheck(execution)();
  return { ...validation, resources };
}

function smokeBaseline(fromProcessStart) {
  return { started: fromProcessStart ? 0 : performance.now(),
    cpuStarted: fromProcessStart ? undefined : process.cpuUsage(),
    scope: fromProcessStart ? "whole smoke command from process start" : "in-process main call after module load" };
}

async function smokeResources(output, started, cpuStarted, scope, capBytes) {
  const directory = await outputDirectory(repositoryRoot, output);
  const cpu = process.cpuUsage(cpuStarted);
  const counters = await processCounters();
  let memoryError;
  let status = counters.peak_resident_bytes === null ? "current-resident-lower-bound" : "linux-peak-resident";
  try {
    status = memoryCapCheck({ peakBytes: counters.peak_resident_bytes,
      currentBytes: counters.current_resident_bytes, capBytes });
  } catch (error) { memoryError = error; }
  const resources = { scope,
    wall_s: (performance.now() - started) / 1000, cpu_s: (cpu.user + cpu.system) / 1e6,
    ...counters, memory_cap_bytes: capBytes, memory_cap_check: status,
    artifact_bytes_before_resource_receipt: await outputBytes(directory),
    ...NO_RESULT };
  const lock = await outputLock(directory);
  try {
    if (await optionalText(path.join(directory, "resources.json")) === null) {
      await stableJson(path.join(directory, "resources.json"), resources);
    }
  } finally { await lock.release(); }
  if (memoryError) throw memoryError;
  return { ...resources, output_bytes: await outputBytes(directory) };
}

async function runCli() {
  const controller = new AbortController();
  const cancel = () => {
    controller.abort();
    for (const signal of ["SIGINT", "SIGTERM"]) process.removeListener(signal, cancel);
  };
  for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, cancel);
  try {
    return await main(process.argv, { signal: controller.signal, fromProcessStart: true });
  } finally {
    for (const signal of ["SIGINT", "SIGTERM"]) process.removeListener(signal, cancel);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runCli().then((value) => process.stdout.write(`${JSON.stringify(value)}\n`), (error) => {
    process.stderr.write(`${error.stack ?? error.message}\n`);
    process.exitCode = 1;
  });
}
