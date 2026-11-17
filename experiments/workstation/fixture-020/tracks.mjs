import { ARTIFACT_FILES, assertFixture020Record, assertFixture020Summary,
  EVALUATION_KEYS, FIXTURE_020_EVENT_CONTRACT_VERSION, NO_RESULT, PUBLIC_SEEDS,
  scientificPayload, validateFixture020Config, worldId } from "./contract.mjs";
import { assertT02CalibrationRecord, assertT02Record, assertT02Summary,
  T02_ARTIFACT_FILES, T02_EVALUATION_KEYS, T02_EVENT_CONTRACT_VERSION,
  T02_NO_RESULT, T02_SEEDS, t02WorldId, validateT02Config } from "./t02-contract.mjs";
import { generateFixture020World, interruptedWorld } from "./generator.mjs";
import { generateT02World, interruptedT02World } from "./t02-generator.mjs";
import { evaluateArmA } from "./evaluator.mjs";
import { evaluateArmAT02 } from "./t02-evaluator.mjs";
import { verifyWorldArtifacts, worldArtifacts, writeWorldArtifacts } from "./artifacts.mjs";
import { t02WorldArtifacts, verifyT02WorldArtifacts, writeT02WorldArtifacts } from "./t02-artifacts.mjs";
import { developmentCalibration } from "./t02-policy.mjs";

const T01_RUNNER_VERSION = "fixture-020.icp-t01-runner.v1";
export const T02_RUNNER_VERSION = "fixture-020.icp-t02-runner.v1";

const t01 = Object.freeze({
  id: "ICP-T01",
  contractVersion: FIXTURE_020_EVENT_CONTRACT_VERSION,
  runnerVersion: T01_RUNNER_VERSION,
  ledgerFormat: "fixture-020.icp-t01-ledger.v1",
  seeds: PUBLIC_SEEDS,
  seedDocument: "seeds/development.reveal.json",
  seedAlgorithm: "fixture-020-icp-t01-public-seeds-v1",
  configFile: (profile) => `configs/${profile}.json`,
  validateConfig: validateFixture020Config,
  worldId,
  generate: generateFixture020World,
  interruptedWorld,
  evaluate: evaluateArmA,
  makeArtifacts: worldArtifacts,
  writeArtifacts: writeWorldArtifacts,
  verifyArtifacts: verifyWorldArtifacts,
  artifactFiles: ARTIFACT_FILES,
  evaluationKeys: EVALUATION_KEYS,
  noResult: NO_RESULT,
  assertRecord: assertFixture020Record,
  assertSummary: assertFixture020Summary,
  scientificPayload,
  makeRecord(identity, world, artifacts, stop) {
    const evaluation = artifacts.metrics;
    return { schema: 1, contract_version: FIXTURE_020_EVENT_CONTRACT_VERSION,
      artifact: "fixture-020", track: "ICP-T01", run_id: identity.run_id,
      profile: identity.profile, pack: "public-development", seed: world.seed,
      world_id: world.world_id, world_sha256: world.world_sha256, arm: "A",
      maximum_loss_mmol: evaluation.maximum_loss_mmol, loss_mmol: evaluation.loss_mmol,
      failure_reason: evaluation.failure_reason, evaluation, execution_stop: stop,
      artifacts_sha256: artifacts.hashes, ...NO_RESULT };
  },
  summaryExtras() { return {}; },
  lossUnit: "mmol",
  resourceUnit: "synthetic J",
  calibration: null,
  runCalibration: null,
});

const t02 = Object.freeze({
  id: "ICP-T02",
  contractVersion: T02_EVENT_CONTRACT_VERSION,
  runnerVersion: T02_RUNNER_VERSION,
  ledgerFormat: "fixture-020.icp-t02-ledger.v1",
  seeds: T02_SEEDS,
  seedDocument: "seeds/t02-development.reveal.json",
  seedAlgorithm: "fixture-020-icp-t02-public-seeds-v1",
  configFile: (profile) => `configs/t02-${profile}.json`,
  validateConfig: validateT02Config,
  worldId: t02WorldId,
  generate: generateT02World,
  interruptedWorld: interruptedT02World,
  evaluate: evaluateArmAT02,
  makeArtifacts: t02WorldArtifacts,
  writeArtifacts: writeT02WorldArtifacts,
  verifyArtifacts: verifyT02WorldArtifacts,
  artifactFiles: T02_ARTIFACT_FILES,
  evaluationKeys: T02_EVALUATION_KEYS,
  noResult: T02_NO_RESULT,
  assertRecord: assertT02Record,
  assertSummary: assertT02Summary,
  scientificPayload,
  makeRecord(identity, world, artifacts, stop) {
    const evaluation = artifacts.metrics;
    return { schema: 1, contract_version: T02_EVENT_CONTRACT_VERSION,
      artifact: "fixture-020", track: "ICP-T02", run_id: identity.run_id,
      profile: identity.profile, pack: "public-development", seed: world.seed,
      world_id: world.world_id, world_sha256: world.world_sha256,
      regime: world.regime ?? null, arm: "A",
      maximum_loss_j: evaluation.maximum_loss_j, loss_j: evaluation.loss_j,
      failure_reason: evaluation.failure_reason, evaluation,
      execution_stop: stop, artifacts_sha256: artifacts.hashes, ...T02_NO_RESULT };
  },
  summaryExtras(records, { calibration } = {}) {
    const development_calibration = assertT02CalibrationRecord((calibration ?? developmentCalibration)());
    const counts = { classic: 0, rheology: 0, pulsatile: 0, "wall-floor": 0 };
    for (let index = 0; index < records.length; index += 1) {
      if (records[index].regime) counts[records[index].regime] += 1;
    }
    return { regime_counts: counts, development_calibration };
  },
  lossUnit: "J",
  resourceUnit: "objective evaluations",
  calibration: developmentCalibration,
  runCalibration(calibration = developmentCalibration) {
    return assertT02CalibrationRecord(calibration());
  },
});

export const TRACKS = Object.freeze({ "ICP-T01": t01, "ICP-T02": t02 });

export const EVENT_CONTRACT_VERSION = "fixture-020.event-dispatch.v1";

export function assertEventRecord(record, options) {
  if (typeof record?.track === "string" && Object.hasOwn(TRACKS, record.track)) {
    return TRACKS[record.track].assertRecord(record, options);
  }
  throw new Error(`fixture-020 unknown track in event: ${record?.track}`);
}

export function getTrack(name) {
  if (typeof name !== "string" || !Object.hasOwn(TRACKS, name)) {
    throw new Error(`fixture-020 unknown track ${name}.`);
  }
  return TRACKS[name];
}
