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
  constructor(reason) {
    super(`ICP-T01 ${reason}.`);
    this.reason = reason;
  }
}

export class GenerationFailure extends Error {
  constructor(stage, detail = "") {
    super(`ICP-T01 generation exhausted at ${stage}.${detail ? ` ${detail}` : ""}`);
    this.stage = stage;
  }
}

export function worldId(seed) {
  if (!PUBLIC_SEEDS.includes(seed)) throw new Error("ICP-T01 requires a registered public seed.");
  return `ICP-T01-0x${seed.toString(16).padStart(8, "0")}`;
}

export function binary64Bytes(values) {
  const bytes = Buffer.alloc(values.length * 8);
  for (let index = 0; index < values.length; index += 1) bytes.writeDoubleLE(values[index], index * 8);
  return bytes;
}

export function validateFixture020Config(config) {
  const keys = ["schema", "artifact", "profile", "worlds_per_seed", "minutes", "truth_dt_min",
    "decision_interval_min", "max_rejection_attempts", "max_wall_ms", "max_output_bytes", "memory_bytes"];
  if (!exactKeys(config, keys)) throw new Error("ICP-T01 config fields are not closed.");
  const expected = { schema: 1, artifact: "fixture-020", worlds_per_seed: 1, minutes: 1440,
    truth_dt_min: 0.25, decision_interval_min: 5, max_rejection_attempts: 10000,
    max_output_bytes: config.profile === "smoke" ? 52428800 : 1073741824,
    memory_bytes: config.profile === "smoke" ? 134217728 : 268435456 };
  if (!new Set(["smoke", "development"]).has(config.profile)
    || Object.entries(expected).some(([key, value]) => config[key] !== value)
    || !Number.isSafeInteger(config.max_wall_ms) || config.max_wall_ms < 1
    || config.max_wall_ms > 28800000) throw new Error("ICP-T01 config violates frozen bounds.");
  return config;
}

export function scientificPayload(record) {
  const payload = { ...record };
  delete payload.integrity;
  return payload;
}

function assertRecordHeader(record) {
  const fixed = { schema: 1, contract_version: FIXTURE_020_EVENT_CONTRACT_VERSION,
    artifact: "fixture-020", track: "ICP-T01", arm: "A", pack: "public-development", ...NO_RESULT };
  if (Object.entries(fixed).some(([key, value]) => canonical(record[key]) !== canonical(value))
    || record.world_id !== worldId(record.seed)
    || !new Set(["smoke", "development"]).has(record.profile)) {
    throw new Error("ICP-T01 event authority or identity invalid.");
  }
}

export function assertFixture020Record(record, { sequence, previousHash, context } = {}) {
  const keys = ["schema", "contract_version", "artifact", "track", "run_id", "profile", "pack",
    "seed", "world_id", "world_sha256", "arm", "maximum_loss_mmol", "loss_mmol", "failure_reason",
    "evaluation", "execution_stop", "artifacts_sha256", "integrity", ...Object.keys(NO_RESULT)];
  if (!exactKeys(record, keys)) throw new Error("ICP-T01 event fields are not closed.");
  assertRecordHeader(record);
  assertRecordAmounts(record);
  assertEvaluation(record.evaluation, record);
  assertExecutionStop(record.execution_stop, record.failure_reason);
  if (!exactKeys(record.artifacts_sha256, ARTIFACT_FILES)) throw new Error("ICP-T01 artifact digests not closed.");
  const hashes = [record.run_id, record.world_sha256, ...Object.values(record.artifacts_sha256)];
  if (hashes.some((hash) => !/^[0-9a-f]{64}$/.test(hash))) throw new Error("ICP-T01 event digest invalid.");
  const integrity = record.integrity;
  assertIntegrity(integrity, record, sequence, previousHash);
  if (context && (record.run_id !== context.run_id || record.profile !== context.profile)) {
    throw new Error("ICP-T01 event differs from fresh run identity.");
  }
  return record;
}

function assertExecutionStop(stop, failure) {
  if (stop === null) return;
  if (!exactKeys(stop, ["reason", "check_index"]) || !["timeout", "cancelled"].includes(stop.reason)
    || !Number.isSafeInteger(stop.check_index) || stop.check_index < 1 || stop.check_index > 2 ** 40
    || !["missing-output", "generator-failure"].includes(failure)) {
    throw new Error("ICP-T01 execution stop lacks a terminal failure boundary.");
  }
}

function assertIntegrity(integrity, record, sequence, previousHash) {
  assertIntegrityShape(integrity);
  const expectedSequence = sequence ?? integrity.sequence;
  const expectedPrevious = previousHash ?? integrity.previous_sha256;
  if (integrity.sequence !== expectedSequence || integrity.previous_sha256 !== expectedPrevious) {
    throw new Error("ICP-T01 event hash chain invalid.");
  }
  if (integrity.record_sha256 !== sha256(`${integrity.previous_sha256}\n${canonical(scientificPayload(record))}`)) {
    throw new Error("ICP-T01 event hash chain digest invalid.");
  }
}

function assertIntegrityShape(integrity) {
  if (!exactKeys(integrity, ["sequence", "previous_sha256", "record_sha256"])
    || !Number.isSafeInteger(integrity.sequence) || integrity.sequence < 0
    || !/^[0-9a-f]{64}$/.test(integrity.previous_sha256)
    || (integrity.sequence === 0 && integrity.previous_sha256 !== "0".repeat(64))) {
    throw new Error("ICP-T01 event hash chain invalid.");
  }
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

function assertRecordAmounts(record) {
  const amounts = [record.loss_mmol, record.maximum_loss_mmol];
  if (amounts.some((value) => !Number.isFinite(value) || value < 0)
    || record.loss_mmol > record.maximum_loss_mmol + 1e-8
    || (record.failure_reason !== null && !FAILURE_REASONS.includes(record.failure_reason))) {
    throw new Error("ICP-T01 event amount or failure reason invalid.");
  }
  if (record.failure_reason !== null && record.loss_mmol !== record.maximum_loss_mmol) {
    throw new Error("ICP-T01 retained failure must receive terminal loss.");
  }
}
