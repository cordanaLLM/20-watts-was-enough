import { mkdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  canonicalize, openCheckpointLedger, remainingWorkUnits, sha256Hex,
} from "../lib/checkpoint-ledger.mjs";
import {
  analyzeCmbX01, computeCmbX01Analysis, executeCmbX01, prepareCmbX01,
  validateCmbX01Output,
} from "./cmb-x01-runner.mjs";
import {
  FIXTURE_029_SUITE_ANALYSIS_CONTRACT_VERSION, FIXTURE_029_SUITE_CLAIMS,
  FIXTURE_029_SUITE_AUTHORITY_REASON, FIXTURE_029_SUITE_ANALYSIS_INTERPRETATION,
  FIXTURE_029_SUITE_RECEIPT_CONTRACT_VERSION, FIXTURE_029_SUITE_RUN_CONTRACT_VERSION,
  FIXTURE_029_SUITE_RUN_INTERPRETATION, FIXTURE_029_SUITE_TRACKS,
  assertFixture029SuiteAnalysis, assertFixture029SuiteConfig,
  assertFixture029SuiteReceipt, assertFixture029SuiteRun, fixture029SuiteReceiptPayload,
  fixture029SuiteReceiptWorkKey,
} from "./suite-contract.mjs";
import {
  analyzeFixture029, computeFixture029Analysis, executeFixture029, prepareFixture029,
  validateFixture029Output,
} from "./runner.mjs";
import {
  exists,
  fileSha256,
  loadJson,
  parseRunnerOptions,
  resolveOutput as resolveRunnerOutput,
  validateSeedDocument as validateSeedDoc,
  writeJsonStable,
} from "./runner-io.mjs";

export const FIXTURE_029_SUITE_RUNNER_VERSION = "fixture-029.cmb-x01-x04-suite-runner.v2";

const fixtureRoot = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(fixtureRoot, "../../..");
const suiteLedgerFormat = "fixture-029.cmb-x01-x04-suite-receipt-ledger.v2";
const profileNames = new Set(["smoke", "development"]);
const sourceFiles = Object.freeze({
  checkpoint_ledger: "../lib/checkpoint-ledger.mjs",
  exact_keys: "../lib/exact-keys.mjs",
  percentile: "../lib/percentile.mjs",
  runner_io: "runner-io.mjs",
  suite_contract: "suite-contract.mjs",
  suite_schema: "suite-output.schema.json",
  suite_receipt_schema: "suite-receipt.schema.json",
  suite_runner: "suite-runner.mjs",
  x01_contract: "cmb-x01-contract.mjs",
  x01_ledger_contract: "cmb-x01-ledger-contract.mjs",
  x01_generator: "cmb-x01-generator.mjs",
  x01_schema: "cmb-x01-output.schema.json",
  x01_runner: "cmb-x01-runner.mjs",
  x04_contract: "contract.mjs",
  x04_generator: "generator.mjs",
  x04_schema: "output.schema.json",
  x04_runner: "runner.mjs",
  x01_smoke_configuration: "configs/cmb-x01-smoke.json",
  x01_development_configuration: "configs/cmb-x01-development.json",
  x04_smoke_configuration: "configs/smoke.json",
  x04_development_configuration: "configs/development.json",
  suite_smoke_configuration: "configs/suite-smoke.json",
  suite_development_configuration: "configs/suite-development.json",
  fixture: "../../fixtures/029-clinical-biotechnology-endogenous-machinery.md",
  audit: "../../../research/audits/2026-08-27-clinical-biotechnology-endogenous-machinery.md",
});

const resolveOutput = (value) => resolveRunnerOutput(repositoryRoot, value, "Fixture 029 suite");
const validateSeedDocument = (document) => validateSeedDoc(
  document,
  "Fixture 029 suite shared seed document is invalid.",
);
const parseOptions = (argv) => parseRunnerOptions(argv, { label: "Fixture 029 suite" });

async function loadInputs(profile) {
  if (!profileNames.has(profile)) throw new Error("Fixture 029 suite profile is invalid.");
  const configPath = path.join(fixtureRoot, "configs", `suite-${profile}.json`);
  const config = assertFixture029SuiteConfig(await loadJson(configPath), profile);
  const seedPath = path.resolve(fixtureRoot, config.shared_seed_pack);
  const seedDocument = validateSeedDocument(await loadJson(seedPath));
  const seedSha256 = await fileSha256(seedPath);
  if (seedSha256 !== config.shared_seed_pack_sha256) {
    throw new Error("Fixture 029 suite shared seed pack differs from its frozen SHA-256.");
  }
  const selectedSeeds = profile === "smoke" ? seedDocument.seeds.slice(0, 2) : seedDocument.seeds;
  const trackConfigurations = await Promise.all(config.tracks.map(async (entry) => {
    const file = path.resolve(fixtureRoot, entry.configuration);
    const document = await loadJson(file);
    if (
      document.schema !== 1
      || document.artifact !== "fixture-029"
      || document.profile !== profile
      || document.worlds_per_seed !== config.worlds_per_seed
      || await fileSha256(file) !== entry.configuration_sha256
    ) throw new Error(`Fixture 029 suite configuration disagrees with ${entry.track}.`);
    return Object.freeze({ track: entry.track, file, document });
  }));
  const sourceHashes = Object.fromEntries(await Promise.all(Object.entries(sourceFiles)
    .map(async ([key, relative]) => [key, await fileSha256(path.resolve(fixtureRoot, relative))])));
  return Object.freeze({
    profile,
    config,
    configPath,
    configSha256: await fileSha256(configPath),
    seedPath,
    seedDocument,
    selectedSeeds,
    seedSha256,
    trackConfigurations: Object.freeze(trackConfigurations),
    sourceHashes: Object.freeze(sourceHashes),
  });
}

function buildSuiteIdentity(inputs) {
  const body = {
    schema: 1,
    artifact: "fixture-029",
    suite: "CMB-X01+CMB-X04",
    execution_claims: FIXTURE_029_SUITE_CLAIMS,
    runner_version: FIXTURE_029_SUITE_RUNNER_VERSION,
    run_contract_version: FIXTURE_029_SUITE_RUN_CONTRACT_VERSION,
    receipt_contract_version: FIXTURE_029_SUITE_RECEIPT_CONTRACT_VERSION,
    analysis_contract_version: FIXTURE_029_SUITE_ANALYSIS_CONTRACT_VERSION,
    ledger_format: suiteLedgerFormat,
    profile: inputs.profile,
    partition: "public-development-only",
    suite_configuration: inputs.config,
    suite_configuration_sha256: inputs.configSha256,
    shared_seeds: inputs.selectedSeeds,
    shared_seed_document_sha256: inputs.seedSha256,
    track_configurations: Object.fromEntries(inputs.trackConfigurations.map((entry) => [
      entry.track, entry.document,
    ])),
    source_hashes: inputs.sourceHashes,
    track_order: FIXTURE_029_SUITE_TRACKS,
    result_authority: "NO_RESULT",
  };
  return Object.freeze({ ...body, suite_run_id: sha256Hex(canonicalize(body)) });
}

function suiteWorkUnits() {
  return FIXTURE_029_SUITE_TRACKS.map((track, receiptIndex) => Object.freeze({
    track,
    receiptIndex,
  }));
}

function suiteWorkKey(unit) {
  return `${unit.receiptIndex}:${unit.track}`;
}

function boundReceiptValidator(inputs, identity) {
  return (record, state) => assertFixture029SuiteReceipt(record, {
    ...state,
    runId: identity.suite_run_id,
    profile: inputs.profile,
  });
}

async function openSuiteLedger(directory, inputs, identity) {
  return openCheckpointLedger({
    artifact: "fixture-029",
    ledgerFormat: suiteLedgerFormat,
    rawPath: path.join(directory, "suite-receipts.jsonl"),
    checkpointPath: path.join(directory, "suite-checkpoint.json"),
    runIdentity: identity,
    scientificPayload: fixture029SuiteReceiptPayload,
    workKey: fixture029SuiteReceiptWorkKey,
    assertRecord: boundReceiptValidator(inputs, identity),
  });
}

function trackOutput(directory, track) {
  return path.join(directory, track.toLowerCase());
}

async function executeTrack(track, { profile, output, resume }) {
  if (track === "CMB-X01") return executeCmbX01({ profile, output, resume });
  if (track === "CMB-X04") return executeFixture029({ profile, output, resume });
  throw new Error(`Unsupported Fixture 029 suite track ${track}.`);
}

async function computeTrackAnalysis(track, output) {
  if (track === "CMB-X01") return computeCmbX01Analysis(output);
  if (track === "CMB-X04") return computeFixture029Analysis(output);
  throw new Error(`Unsupported Fixture 029 suite track ${track}.`);
}

async function writeTrackAnalysis(track, output) {
  if (track === "CMB-X01") return analyzeCmbX01(output);
  if (track === "CMB-X04") return analyzeFixture029(output);
  throw new Error(`Unsupported Fixture 029 suite track ${track}.`);
}

async function validateTrack(track, output) {
  if (track === "CMB-X01") return validateCmbX01Output(output);
  if (track === "CMB-X04") return validateFixture029Output(output);
  throw new Error(`Unsupported Fixture 029 suite track ${track}.`);
}

function trackClaims(track) {
  return track === "CMB-X01" ? ["C-1574"] : ["C-1580"];
}

function analysisRecordCount(track, analysis) {
  return track === "CMB-X01" ? analysis.coverage.records : analysis.records;
}

const subtrackNoComparisonInterpretations = Object.freeze({
  "CMB-X01": "NO_RESULT: descriptive CMB-X01 public-development integrity diagnostics only; no arm comparison is inferential.",
  "CMB-X04": "NO_RESULT: descriptive CMB-X04 public-development smoke checks only; no arm comparison is inferential.",
});

async function summarizeSubrun(track, directory, { writeAnalysis = false } = {}) {
  const output = trackOutput(directory, track);
  const runPath = path.join(output, "run.json");
  const rawPath = path.join(output, "raw-events.jsonl");
  const checkpointPath = path.join(output, "checkpoint.json");
  const run = await loadJson(runPath);
  const analysis = writeAnalysis
    ? await writeTrackAnalysis(track, output)
    : await computeTrackAnalysis(track, output);
  const validation = await validateTrack(track, output);
  if (
    run.track !== track
    || !FIXTURE_029_SUITE_TRACKS.includes(track)
    || canonicalize(run.execution_claims) !== canonicalize(trackClaims(track))
    || analysis.track !== track
    || canonicalize(analysis.execution_claims) !== canonicalize(trackClaims(track))
    || validation.valid !== true
    || validation.run_id !== run.run_id
    || validation.decision !== "diagnostic-pass"
    || validation.no_result !== true
    || analysis.decision !== "diagnostic-pass"
    || analysis.result_label !== "NO_RESULT"
    || analysis.no_result !== true
    || analysis.measured_energy_present !== false
    || analysis.energy_conclusion_allowed !== false
    || analysis.comparison_inference_permitted !== false
    || analysis.claim_eligible !== false
    || analysis.scientific_result !== false
    || analysis.performance_result !== false
  ) throw new Error(`Fixture 029 suite ${track} subrun lacks diagnostic-only authority.`);
  const runPayload = { ...run };
  delete runPayload.raw_path;
  delete runPayload.checkpoint_path;
  const summary = Object.freeze({
    run_payload_sha256: sha256Hex(canonicalize(runPayload)),
    raw_events_file_sha256: await fileSha256(rawPath),
    checkpoint_file_sha256: await fileSha256(checkpointPath),
    analysis_payload_sha256: sha256Hex(canonicalize(analysis)),
    expected_work_units: run.expected_work_units,
    ledger_records: run.ledger.records,
    scientific_payload_sha256: run.ledger.scientific_payload_sha256,
    hash_chain_sha256: run.ledger.hash_chain_sha256,
    decision: analysis.decision,
  });
  return Object.freeze({
    track,
    claims: trackClaims(track),
    subrunId: run.run_id,
    records: analysisRecordCount(track, analysis),
    summary,
    analysis,
    validation,
  });
}

function receiptFor(unit, inputs, identity, subrun) {
  return {
    schema: 1,
    contract_version: FIXTURE_029_SUITE_RECEIPT_CONTRACT_VERSION,
    artifact: "fixture-029",
    suite: "CMB-X01+CMB-X04",
    record_kind: "validated-subrun-receipt",
    status: "public-development-diagnostic-only",
    profile: inputs.profile,
    partition: "public-development-only",
    execution_claims: FIXTURE_029_SUITE_CLAIMS,
    suite_run_id: identity.suite_run_id,
    track: unit.track,
    receipt_index: unit.receiptIndex,
    subrun_directory: unit.track.toLowerCase(),
    subrun_id: subrun.subrunId,
    subrun_summary: subrun.summary,
    result_label: "NO_RESULT",
    no_result: true,
    measured_energy_present: false,
    energy_conclusion_allowed: false,
    comparison_inference_permitted: false,
    ranking_permitted: false,
    claim_eligible: false,
    scientific_result: false,
    performance_result: false,
    authority_reason: FIXTURE_029_SUITE_AUTHORITY_REASON,
    interpretation: `NO_RESULT: validated ${unit.track} public-development subrun receipt only.`,
  };
}

async function readReceipts(directory) {
  const raw = await readFile(path.join(directory, "suite-receipts.jsonl"), "utf8");
  if (!raw.endsWith("\n") || raw.includes("\r")) {
    throw new Error("Fixture 029 suite receipt ledger is not canonical LF JSONL.");
  }
  return raw.slice(0, -1).split("\n").map((line) => JSON.parse(line));
}

async function assertReceiptBindsSubrun(receipt, directory, options = {}) {
  const subrun = await summarizeSubrun(receipt.track, directory, options);
  if (
    receipt.subrun_id !== subrun.subrunId
    || canonicalize(receipt.subrun_summary) !== canonicalize(subrun.summary)
  ) throw new Error(`Fixture 029 suite receipt no longer binds ${receipt.track}.`);
  return subrun;
}

export async function prepareFixture029Suite(profile) {
  const inputs = await loadInputs(profile);
  const [x01, x04] = await Promise.all([
    prepareCmbX01(profile),
    prepareFixture029(profile),
  ]);
  if (
    x01.worlds_per_seed !== inputs.config.worlds_per_seed
    || x04.worlds_per_seed !== inputs.config.worlds_per_seed
    || x01.seeds !== x04.seeds
    || canonicalize([...x01.execution_claims, ...x04.execution_claims])
      !== canonicalize(FIXTURE_029_SUITE_CLAIMS)
  ) throw new Error("Fixture 029 suite preparation found a subtrack contract mismatch.");
  return Object.freeze({
    valid: true,
    artifact: "fixture-029",
    suite: "CMB-X01+CMB-X04",
    execution_claims: FIXTURE_029_SUITE_CLAIMS,
    profile,
    partition: "public-development-only",
    seeds: x01.seeds,
    worlds_per_seed: inputs.config.worlds_per_seed,
    tracks: FIXTURE_029_SUITE_TRACKS.length,
    work_units: x01.work_units + x04.work_units,
    receipt_work_units: FIXTURE_029_SUITE_TRACKS.length,
    result_label: "NO_RESULT",
    no_result: true,
    measured_energy_required: false,
    energy_conclusion_allowed: false,
    comparison_inference_permitted: false,
    ranking_permitted: false,
    claim_eligible: false,
  });
}

export async function executeFixture029Suite({
  profile,
  output,
  resume = false,
  maxTracks = Infinity,
}) {
  if (maxTracks !== Infinity && (!Number.isSafeInteger(maxTracks) || maxTracks < 1)) {
    throw new Error("maxTracks must be a positive integer or Infinity.");
  }
  const inputs = await loadInputs(profile);
  const identity = buildSuiteIdentity(inputs);
  const directory = resolveOutput(output);
  const alreadyExists = await exists(directory);
  if (alreadyExists && !resume) {
    throw new Error("Fixture 029 suite output already exists; use --resume true.");
  }
  if (!alreadyExists && resume) {
    throw new Error("Fixture 029 suite cannot resume a missing output directory.");
  }
  if (!alreadyExists) {
    await mkdir(path.dirname(directory), { recursive: true });
    await mkdir(directory);
  } else if (!(await stat(directory)).isDirectory()) {
    throw new Error("Fixture 029 suite output is not a directory.");
  }

  const ledger = await openSuiteLedger(directory, inputs, identity);
  const units = suiteWorkUnits();
  const completedKeys = ledger.completedWorkKeys();
  if (completedKeys.size > 0) {
    const receipts = await readReceipts(directory);
    for (const receipt of receipts) await assertReceiptBindsSubrun(receipt, directory);
  }
  const remaining = remainingWorkUnits(units, completedKeys, suiteWorkKey);
  for (const unit of remaining.slice(0, maxTracks)) {
    const outputDirectory = trackOutput(directory, unit.track);
    const subrunExists = await exists(outputDirectory);
    const execution = await executeTrack(unit.track, {
      profile,
      output: outputDirectory,
      resume: subrunExists,
    });
    if (execution.complete !== true) {
      throw new Error(`Fixture 029 suite ${unit.track} subrun did not complete.`);
    }
    const subrun = await summarizeSubrun(unit.track, directory);
    await ledger.append(receiptFor(unit, inputs, identity, subrun));
    await ledger.saveCheckpoint();
  }

  const summary = ledger.summary();
  const complete = summary.completed_work_units === units.length;
  if (!complete) {
    return Object.freeze({
      directory,
      complete: false,
      suite_run_id: identity.suite_run_id,
      ledger: summary,
      result_label: "NO_RESULT",
      no_result: true,
    });
  }
  const receipts = await readReceipts(directory);
  const run = {
    ...identity,
    expected_receipts: units.length,
    receipt_ledger: summary,
    subrun_ids: Object.fromEntries(receipts.map((receipt) => [receipt.track, receipt.subrun_id])),
    subrun_summaries: Object.fromEntries(receipts.map((receipt) => [
      receipt.track, receipt.subrun_summary,
    ])),
    result_label: "NO_RESULT",
    no_result: true,
    measured_energy_present: false,
    energy_conclusion_allowed: false,
    comparison_inference_permitted: false,
    ranking_permitted: false,
    claim_eligible: false,
    scientific_result: false,
    performance_result: false,
    authority_reason: FIXTURE_029_SUITE_AUTHORITY_REASON,
    interpretation: FIXTURE_029_SUITE_RUN_INTERPRETATION,
  };
  assertFixture029SuiteRun(run, { identity, receipts, ledgerSummary: summary });
  await writeJsonStable(path.join(directory, "suite-run.json"), run);
  return Object.freeze({ directory, complete: true, run, no_result: true });
}

export async function computeFixture029SuiteAnalysis(output, { writeSubtrackAnalyses = false } = {}) {
  const directory = resolveOutput(output);
  const run = await loadJson(path.join(directory, "suite-run.json"));
  const inputs = await loadInputs(run.profile);
  const identity = buildSuiteIdentity(inputs);
  assertFixture029SuiteRun(run, { identity });
  const ledger = await openSuiteLedger(directory, inputs, identity);
  const ledgerSummary = ledger.summary();
  if (
    ledgerSummary.checkpoint_status !== "current"
    || ledgerSummary.completed_work_units !== FIXTURE_029_SUITE_TRACKS.length
  ) throw new Error("Fixture 029 suite run, checkpoint, and receipt ledger disagree.");

  const receipts = await readReceipts(directory);
  if (receipts.length !== FIXTURE_029_SUITE_TRACKS.length) {
    throw new Error("Fixture 029 suite receipt ledger is incomplete.");
  }
  assertFixture029SuiteRun(run, { identity, receipts, ledgerSummary });
  const subruns = [];
  for (const receipt of receipts) {
    subruns.push(await assertReceiptBindsSubrun(receipt, directory, {
      writeAnalysis: writeSubtrackAnalyses,
    }));
  }
  const strictNoResult = subruns.every(({ analysis, validation }) => (
    analysis.result_label === "NO_RESULT"
    && analysis.no_result === true
    && analysis.measured_energy_present === false
    && analysis.energy_conclusion_allowed === false
    && analysis.comparison_inference_permitted === false
    && analysis.claim_eligible === false
    && analysis.scientific_result === false
    && analysis.performance_result === false
    && validation.no_result === true
  ));
  const noCrossTrackComparisonOrRanking = (
    run.comparison_inference_permitted === false
    && run.ranking_permitted === false
    && run.authority_reason === FIXTURE_029_SUITE_AUTHORITY_REASON
    && run.interpretation === FIXTURE_029_SUITE_RUN_INTERPRETATION
    && receipts.every((receipt) => (
      receipt.comparison_inference_permitted === false
      && receipt.ranking_permitted === false
      && receipt.authority_reason === FIXTURE_029_SUITE_AUTHORITY_REASON
      && receipt.interpretation
        === `NO_RESULT: validated ${receipt.track} public-development subrun receipt only.`
    ))
    && subruns.every(({ track, analysis, validation }) => (
      analysis.comparison_inference_permitted === false
      && analysis.interpretation === subtrackNoComparisonInterpretations[track]
      && analysis.no_result === true
      && validation.no_result === true
    ))
  );
  const checks = Object.freeze({
    exact_claim_scope: canonicalize(FIXTURE_029_SUITE_CLAIMS)
      === canonicalize(["C-1574", "C-1580"]),
    fixed_track_order: receipts.every((receipt, index) => (
      receipt.track === FIXTURE_029_SUITE_TRACKS[index] && receipt.receipt_index === index
    )),
    receipt_ledger_complete: receipts.length === FIXTURE_029_SUITE_TRACKS.length
      && ledgerSummary.completed_work_units === FIXTURE_029_SUITE_TRACKS.length,
    receipts_bind_subruns: subruns.every((subrun, index) => (
      receipts[index].subrun_id === subrun.subrunId
      && canonicalize(receipts[index].subrun_summary) === canonicalize(subrun.summary)
    )),
    subtrack_analyses_diagnostic_pass: subruns.every(({ analysis }) => (
      analysis.decision === "diagnostic-pass" && Object.values(analysis.checks).every(Boolean)
    )),
    subtrack_validators_pass: subruns.every(({ validation }) => (
      validation.valid === true && validation.decision === "diagnostic-pass"
    )),
    strict_no_result_boundary: strictNoResult,
    no_cross_track_comparison_or_ranking: noCrossTrackComparisonOrRanking,
  });
  const trackDiagnostics = subruns.map((subrun, index) => ({
    track: subrun.track,
    execution_claims: subrun.claims,
    subrun_id: subrun.subrunId,
    records: subrun.records,
    decision: subrun.analysis.decision,
    receipt_sha256: sha256Hex(canonicalize(receipts[index])),
    result_label: "NO_RESULT",
    no_result: true,
    comparison_inference_permitted: false,
    ranking_permitted: false,
  }));
  const analysis = Object.freeze({
    schema: 1,
    contract_version: FIXTURE_029_SUITE_ANALYSIS_CONTRACT_VERSION,
    artifact: "fixture-029",
    suite: "CMB-X01+CMB-X04",
    profile: inputs.profile,
    partition: "public-development-only",
    execution_claims: FIXTURE_029_SUITE_CLAIMS,
    suite_run_id: identity.suite_run_id,
    receipts: receipts.length,
    track_diagnostics: trackDiagnostics,
    checks,
    decision: Object.values(checks).every(Boolean) ? "diagnostic-pass" : "diagnostic-fail",
    result_label: "NO_RESULT",
    no_result: true,
    measured_energy_present: false,
    energy_conclusion_allowed: false,
    comparison_inference_permitted: false,
    ranking_permitted: false,
    claim_eligible: false,
    scientific_result: false,
    performance_result: false,
    authority_reason: FIXTURE_029_SUITE_AUTHORITY_REASON,
    interpretation: FIXTURE_029_SUITE_ANALYSIS_INTERPRETATION,
  });
  return assertFixture029SuiteAnalysis(analysis, { runId: identity.suite_run_id });
}

export async function analyzeFixture029Suite(output) {
  const directory = resolveOutput(output);
  const analysis = await computeFixture029SuiteAnalysis(output, { writeSubtrackAnalyses: true });
  await writeJsonStable(path.join(directory, "suite-analysis.json"), analysis);
  return analysis;
}

export async function validateFixture029SuiteOutput(output) {
  const analysis = await computeFixture029SuiteAnalysis(output);
  if (analysis.decision !== "diagnostic-pass" || !Object.values(analysis.checks).every(Boolean)) {
    throw new Error("Fixture 029 mixed-suite public-development validation failed.");
  }
  return Object.freeze({
    valid: true,
    suite_run_id: analysis.suite_run_id,
    execution_claims: FIXTURE_029_SUITE_CLAIMS,
    decision: analysis.decision,
    result_label: "NO_RESULT",
    no_result: true,
    comparison_inference_permitted: false,
    ranking_permitted: false,
  });
}

export async function main(argv = process.argv) {
  const { action, options } = parseOptions(argv);
  let result;
  if (action === "prepare") result = await prepareFixture029Suite(options.profile);
  else if (action === "smoke" || action === "run") {
    result = await executeFixture029Suite({
      profile: options.profile,
      output: options.output,
      resume: options.resume === "true",
    });
  } else if (action === "analyze") result = await analyzeFixture029Suite(options.output);
  else result = await validateFixture029SuiteOutput(options.output);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  return result;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error.stack ?? error.message}\n`);
    process.exitCode = 1;
  });
}
