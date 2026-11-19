import { createHash } from "node:crypto";
import { canonicalJson } from "../lib/canonical-json.mjs";
import { exactKeys } from "../lib/exact-keys.mjs";

export const FIXTURE_020_EVENT_CONTRACT_VERSION = "fixture-020.icp-t01-event.v1";
export const REGISTRATIONS = "fixture-020-icp-t01-registrations-v1";
export const canonical = canonicalJson;
export const sha256 = (value) => createHash("sha256").update(value).digest("hex");
export const PUBLIC_SEEDS = Object.freeze(Array.from({ length: 64 }, (_, index) => 0x54010000 + index));
export const NO_RESULT = Object.freeze({
  protocol_outcome: "NO_RESULT", no_result: true, claim_eligible: false,
  scientific_result: false, performance_result: false, measured_energy_present: false,
  energy_conclusion_allowed: false, comparison_inference_permitted: false,
  arms_implemented: Object.freeze(["A"]), arms_deferred: Object.freeze(["B", "C", "O"]),
});
export const FAILURE_REASONS = Object.freeze([
  "generator-failure", "missing-output", "infeasible-flow", "negative-amount",
  "oracle-key-leak", "broken-closure", "negative-storage", "policy-exception",
  "hotspot-placement", "max-flow-bound",
]);
export const ARTIFACT_FILES = Object.freeze(["world-manifest.json", "graph.json", "demand.jsonl",
  "oxygen-ledger.jsonl", "flows.json", "observations.jsonl", "fallbacks.jsonl"]);
export const EVALUATION_NUMBERS = Object.freeze([
  "loss_mmol", "maximum_loss_mmol", "observed_loss_mmol", "truth_steps",
  "closure_failures_consecutive", "maximum_relative_closure", "delivered_mmol", "consumed_mmol",
  "exported_mmol", "leaked_mmol", "minimum_storage_mmol", "simulated_work_j", "resource_cap_j",
  "edge_flow_exposure_l", "edge_flow_total_variation_l_min", "deprived_node_episodes",
  "node_debt_p95_mmol", "uniform_upper_round",
]);
export const EVALUATION_KEYS = Object.freeze([...EVALUATION_NUMBERS, "failure_reason", "terminated",
  "deprived_episode_durations_min", "oxygen_ledger_sha256", "flows_sha256"]);

export class ExecutionStop extends Error {
  constructor(reason, prefix = "ICP-T01") {
    super(`${prefix} ${reason}.`);
    this.reason = reason;
  }
}

export class GenerationFailure extends Error {
  constructor(stage, detail = "", prefix = "ICP-T01") {
    super(`${prefix} generation exhausted at ${stage}.${detail ? ` ${detail}` : ""}`);
    this.stage = stage;
  }
}

export function formatWorldId(track, seeds, seed) {
  if (!seeds.includes(seed)) throw new Error(`${track} requires a registered public seed.`);
  return `${track}-0x${seed.toString(16).padStart(8, "0")}`;
}

export function worldId(seed) {
  return formatWorldId("ICP-T01", PUBLIC_SEEDS, seed);
}

export function binary64Bytes(values) {
  const bytes = Buffer.alloc(values.length * 8);
  for (let index = 0; index < values.length; index += 1) bytes.writeDoubleLE(values[index], index * 8);
  return bytes;
}

export function validateTrackConfig(config, { track, keys, expected }) {
  if (!exactKeys(config, keys)) throw new Error(`${track} config fields are not closed.`);
  if (!new Set(["smoke", "development"]).has(config.profile)
    || Object.entries(expected(config)).some(([key, value]) => config[key] !== value)
    || !Number.isSafeInteger(config.max_wall_ms) || config.max_wall_ms < 1
    || config.max_wall_ms > 28800000) throw new Error(`${track} config violates frozen bounds.`);
  return config;
}

export function validateFixture020Config(config) {
  const keys = ["schema", "artifact", "profile", "worlds_per_seed", "minutes", "truth_dt_min",
    "decision_interval_min", "max_rejection_attempts", "max_wall_ms", "max_output_bytes", "memory_bytes"];
  return validateTrackConfig(config, {
    track: "ICP-T01",
    keys,
    expected: (c) => ({ schema: 1, artifact: "fixture-020", worlds_per_seed: 1, minutes: 1440,
      truth_dt_min: 0.25, decision_interval_min: 5, max_rejection_attempts: 10000,
      max_output_bytes: c.profile === "smoke" ? 52428800 : 1073741824,
      memory_bytes: c.profile === "smoke" ? 134217728 : 268435456 }),
  });
}

export function scientificPayload(record) {
  const payload = { ...record };
  delete payload.integrity;
  return payload;
}

function assertRecordHeader(record, spec) {
  const fixed = { schema: 1, contract_version: spec.contractVersion,
    artifact: "fixture-020", track: spec.track, arm: "A", pack: "public-development", ...NO_RESULT };
  if (Object.entries(fixed).some(([key, value]) => canonical(record[key]) !== canonical(value))
    || record.world_id !== spec.worldId(record.seed)
    || !new Set(["smoke", "development"]).has(record.profile)) {
    throw new Error(`${spec.track} event authority or identity invalid.`);
  }
  if (spec.assertExtraHeader) spec.assertExtraHeader(record);
}

function validLossAmounts(loss, maxLoss) {
  return Number.isFinite(loss) && loss >= 0
    && Number.isFinite(maxLoss) && maxLoss >= 0
    && loss <= maxLoss + 1e-8;
}

function assertRecordAmounts(record, spec) {
  const loss = record[spec.lossKey];
  const maxLoss = record[spec.maxLossKey];
  const validFailure = record.failure_reason === null || spec.failureReasons.includes(record.failure_reason);
  if (!validLossAmounts(loss, maxLoss) || !validFailure) {
    throw new Error(`${spec.track} event amount or failure reason invalid.`);
  }
  if (record.failure_reason !== null && loss !== maxLoss) {
    throw new Error(`${spec.track} retained failure must receive terminal loss.`);
  }
}

export function assertExecutionStop(stop, failure, track = "ICP-T01") {
  if (stop === null) return;
  if (!exactKeys(stop, ["reason", "check_index"]) || !["timeout", "cancelled"].includes(stop.reason)
    || !Number.isSafeInteger(stop.check_index) || stop.check_index < 1 || stop.check_index > 2 ** 40
    || !["missing-output", "generator-failure"].includes(failure)) {
    throw new Error(`${track} execution stop lacks a terminal failure boundary.`);
  }
}

export function assertIntegrity(integrity, record, sequence, previousHash, track = "ICP-T01") {
  assertIntegrityShape(integrity, track);
  const expectedSequence = sequence ?? integrity.sequence;
  const expectedPrevious = previousHash ?? integrity.previous_sha256;
  if (integrity.sequence !== expectedSequence || integrity.previous_sha256 !== expectedPrevious) {
    throw new Error(`${track} event hash chain invalid.`);
  }
  if (integrity.record_sha256 !== sha256(`${integrity.previous_sha256}\n${canonical(scientificPayload(record))}`)) {
    throw new Error(`${track} event hash chain digest invalid.`);
  }
}

function assertIntegrityShape(integrity, track) {
  if (!exactKeys(integrity, ["sequence", "previous_sha256", "record_sha256"])
    || !Number.isSafeInteger(integrity.sequence) || integrity.sequence < 0
    || !/^[0-9a-f]{64}$/.test(integrity.previous_sha256)
    || (integrity.sequence === 0 && integrity.previous_sha256 !== "0".repeat(64))) {
    throw new Error(`${track} event hash chain invalid.`);
  }
}

export function assertTrackRecord(record, spec, { sequence, previousHash, context } = {}) {
  const keys = ["schema", "contract_version", "artifact", "track", "run_id", "profile", "pack",
    "seed", "world_id", "world_sha256", ...(spec.extraKeys ?? []), "arm", spec.maxLossKey, spec.lossKey,
    "failure_reason", "evaluation", "execution_stop", "artifacts_sha256", "integrity", ...Object.keys(NO_RESULT)];
  if (!exactKeys(record, keys)) throw new Error(`${spec.track} event fields are not closed.`);
  assertRecordHeader(record, spec);
  assertRecordAmounts(record, spec);
  spec.assertEvaluation(record.evaluation, record);
  assertExecutionStop(record.execution_stop, record.failure_reason, spec.track);
  if (!exactKeys(record.artifacts_sha256, spec.artifactFiles)) {
    throw new Error(`${spec.track} artifact digests not closed.`);
  }
  const hashes = [record.run_id, record.world_sha256, ...Object.values(record.artifacts_sha256)];
  if (hashes.some((hash) => !/^[0-9a-f]{64}$/.test(hash))) throw new Error(`${spec.track} event digest invalid.`);
  assertIntegrity(record.integrity, record, sequence, previousHash, spec.track);
  if (context && (record.run_id !== context.run_id || record.profile !== context.profile)) {
    throw new Error(`${spec.track} event differs from fresh run identity.`);
  }
  return record;
}

function validSummaryCounts(summary) {
  if (!/^[0-9a-f]{64}$/.test(summary.run_id)) return false;
  if (!new Set(["smoke", "development"]).has(summary.profile)) return false;
  if (!Number.isSafeInteger(summary.attempted_worlds) || summary.attempted_worlds < 1) return false;
  if (summary.retained_worlds !== summary.attempted_worlds) return false;
  return Number.isSafeInteger(summary.retained_failures)
    && summary.retained_failures >= 0
    && summary.retained_failures <= summary.retained_worlds;
}

export function assertTrackSummary(summary, spec) {
  const keys = ["schema", "artifact", "track", "run_id", "profile", "partition", "readiness",
    "attempted_worlds", "retained_worlds", "retained_failures", "loss_unit", "resource_unit",
    "confirmation_partition_present", "transfer_partition_present", ...(spec.extraKeys ?? []),
    ...Object.keys(NO_RESULT)];
  if (!exactKeys(summary, keys)) throw new Error(`${spec.track} summary fields are not closed.`);
  const fixed = { schema: 1, artifact: "fixture-020", track: spec.track,
    partition: "public-development-only", readiness: "smoke-ready", loss_unit: spec.lossUnit,
    resource_unit: spec.resourceUnit, confirmation_partition_present: false,
    transfer_partition_present: false, ...NO_RESULT };
  if (Object.entries(fixed).some(([key, value]) => canonical(summary[key]) !== canonical(value))
    || !validSummaryCounts(summary)) {
    throw new Error(`${spec.track} summary authority or counts invalid.`);
  }
  if (spec.assertExtra) spec.assertExtra(summary);
  return summary;
}

const T01_RECORD_SPEC = Object.freeze({
  track: "ICP-T01", contractVersion: FIXTURE_020_EVENT_CONTRACT_VERSION, worldId,
  lossKey: "loss_mmol", maxLossKey: "maximum_loss_mmol", failureReasons: FAILURE_REASONS,
  artifactFiles: ARTIFACT_FILES, assertEvaluation,
});

export function assertFixture020Record(record, options) {
  return assertTrackRecord(record, T01_RECORD_SPEC, options);
}

export function assertFixture020Summary(summary) {
  return assertTrackSummary(summary, { track: "ICP-T01", lossUnit: "mmol", resourceUnit: "synthetic J" });
}

function assertEvaluation(evaluation, record) {
  if (!exactKeys(evaluation, EVALUATION_KEYS)
    || EVALUATION_NUMBERS.some((key) => !Number.isFinite(evaluation[key]) || evaluation[key] < 0)
    || typeof evaluation.terminated !== "boolean"
    || !Array.isArray(evaluation.deprived_episode_durations_min)
    || evaluation.deprived_episode_durations_min.some((value) => !Number.isFinite(value) || value <= 0)) {
    throw new Error("ICP-T01 evaluation fields or amounts invalid.");
  }
  assertEvaluationOutcome(evaluation, record);
}

function assertEvaluationOutcome(evaluation, record) {
  const same = ["failure_reason", "loss_mmol", "maximum_loss_mmol"];
  if (same.some((key) => evaluation[key] !== record[key])
    || !Number.isSafeInteger(evaluation.truth_steps) || evaluation.truth_steps > 5760
    || !/^[0-9a-f]{64}$/.test(evaluation.oxygen_ledger_sha256)
    || !/^[0-9a-f]{64}$/.test(evaluation.flows_sha256)) throw new Error("ICP-T01 evaluation disagrees with outcome.");
}
