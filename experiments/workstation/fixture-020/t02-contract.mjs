import { exactKeys } from "../lib/exact-keys.mjs";
import { canonical, sha256 } from "./contract.mjs";

export const T02_EVENT_CONTRACT_VERSION = "fixture-020.icp-t02-event.v1";
export const T02_REGISTRATIONS = "fixture-020-icp-t02-registrations-v1";
export const T02_SEEDS = Object.freeze(Array.from({ length: 64 }, (_, index) => 0x54020000 + index));
export const T02_FAILURE_REASONS = Object.freeze([
  "generator-failure", "missing-output", "infeasible-design", "broken-closure",
  "non-finite-objective", "resource-cap", "policy-exception",
]);
export const T02_REGIME_LABELS = Object.freeze(["classic", "rheology", "pulsatile", "wall-floor"]);
export const T02_L_MAX = 3600e9;
export const T02_R_MIN = 5e-5;
export const T02_R_MAX = 5e-3;

export const T02_ARTIFACT_FILES = Object.freeze([
  "world-manifest.json", "tree.json", "regime.json", "designs.jsonl",
  "pressure-ledger.csv", "objective-components.csv", "solver-log.jsonl",
]);

export const T02_EVALUATION_NUMBERS = Object.freeze([
  "loss_j", "maximum_loss_j", "objective_w", "pumping_w", "volume_w",
  "pulsatile_w", "wall_floor_w", "pumping_j", "volume_j", "pulsatile_j",
  "wall_floor_j", "material_volume_m3", "alpha", "fitted_exponent",
  "minimum_terminal_margin_pa", "maximum_pressure_shortfall_pa",
  "mean_pressure_shortfall_pa", "evaluations", "golden_iterations",
  "resource_cap_evaluations", "edges", "terminals", "uniform_upper_round",
]);

export const T02_EVALUATION_KEYS = Object.freeze([
  ...T02_EVALUATION_NUMBERS, "failure_reason", "design_sha256",
]);

export const T02_NO_RESULT = Object.freeze({
  protocol_outcome: "NO_RESULT", no_result: true, claim_eligible: false,
  scientific_result: false, performance_result: false, measured_energy_present: false,
  energy_conclusion_allowed: false, comparison_inference_permitted: false,
  arms_implemented: Object.freeze(["A"]), arms_deferred: Object.freeze(["B", "C", "O"]),
});

export function t02WorldId(seed) {
  if (!T02_SEEDS.includes(seed)) throw new Error("ICP-T02 requires a registered public seed.");
  return `ICP-T02-0x${seed.toString(16).padStart(8, "0")}`;
}

export function validateT02Config(config) {
  const keys = ["schema", "artifact", "track", "profile", "worlds_per_seed",
    "max_rejection_attempts", "resource_cap_evaluations", "golden_relative_width",
    "max_wall_ms", "max_output_bytes", "memory_bytes"];
  if (!exactKeys(config, keys)) throw new Error("ICP-T02 config fields are not closed.");
  const expected = { schema: 1, artifact: "fixture-020", track: "ICP-T02", worlds_per_seed: 1,
    max_rejection_attempts: 10000, resource_cap_evaluations: 200000, golden_relative_width: 1e-10,
    max_output_bytes: config.profile === "smoke" ? 52428800 : 1073741824,
    memory_bytes: config.profile === "smoke" ? 134217728 : 268435456 };
  if (!new Set(["smoke", "development"]).has(config.profile)
    || Object.entries(expected).some(([key, value]) => config[key] !== value)
    || !Number.isSafeInteger(config.max_wall_ms) || config.max_wall_ms < 1
    || config.max_wall_ms > 28800000) throw new Error("ICP-T02 config violates frozen bounds.");
  return config;
}

export function assertT02Record(record, { sequence, previousHash, context } = {}) {
  const keys = ["schema", "contract_version", "artifact", "track", "run_id", "profile", "pack",
    "seed", "world_id", "world_sha256", "regime", "arm", "maximum_loss_j", "loss_j",
    "failure_reason", "evaluation", "execution_stop", "artifacts_sha256", "integrity",
    ...Object.keys(T02_NO_RESULT)];
  if (!exactKeys(record, keys)) throw new Error("ICP-T02 event fields are not closed.");
  assertT02RecordHeader(record);
  assertT02RecordAmounts(record);
  assertT02Evaluation(record.evaluation, record);
  assertT02ExecutionStop(record.execution_stop, record.failure_reason);
  if (!exactKeys(record.artifacts_sha256, T02_ARTIFACT_FILES)) throw new Error("ICP-T02 artifact digests not closed.");
  const hashes = [record.run_id, record.world_sha256, ...Object.values(record.artifacts_sha256)];
  if (hashes.some((hash) => !/^[0-9a-f]{64}$/.test(hash))) throw new Error("ICP-T02 event digest invalid.");
  assertT02Integrity(record.integrity, record, sequence, previousHash);
  if (context && (record.run_id !== context.run_id || record.profile !== context.profile)) {
    throw new Error("ICP-T02 event differs from fresh run identity.");
  }
  return record;
}

function assertT02RecordHeader(record) {
  const fixed = { schema: 1, contract_version: T02_EVENT_CONTRACT_VERSION,
    artifact: "fixture-020", track: "ICP-T02", arm: "A", pack: "public-development", ...T02_NO_RESULT };
  if (Object.entries(fixed).some(([key, value]) => canonical(record[key]) !== canonical(value))
    || record.world_id !== t02WorldId(record.seed)
    || !new Set(["smoke", "development"]).has(record.profile)) {
    throw new Error("ICP-T02 event authority or identity invalid.");
  }
  if (record.regime !== null && !T02_REGIME_LABELS.includes(record.regime)) {
    throw new Error("ICP-T02 regime label invalid.");
  }
}

function assertT02RecordAmounts(record) {
  const amounts = [record.loss_j, record.maximum_loss_j];
  if (amounts.some((value) => !Number.isFinite(value) || value < 0)
    || record.loss_j > record.maximum_loss_j + 1e-8
    || (record.failure_reason !== null && !T02_FAILURE_REASONS.includes(record.failure_reason))) {
    throw new Error("ICP-T02 event amount or failure reason invalid.");
  }
  if (record.failure_reason !== null && record.loss_j !== record.maximum_loss_j) {
    throw new Error("ICP-T02 retained failure must receive terminal loss.");
  }
}

function assertT02Evaluation(evaluation, record) {
  if (!exactKeys(evaluation, T02_EVALUATION_KEYS)) throw new Error("ICP-T02 evaluation fields are not closed.");
  const nonNegative = T02_EVALUATION_NUMBERS.filter((key) => key !== "minimum_terminal_margin_pa");
  if (nonNegative.some((key) => !Number.isFinite(evaluation[key]) || evaluation[key] < 0)) {
    throw new Error("ICP-T02 evaluation non-negative field invalid.");
  }
  if (!Number.isFinite(evaluation.minimum_terminal_margin_pa)) {
    throw new Error("ICP-T02 evaluation minimum_terminal_margin_pa must be finite.");
  }
  if (evaluation.failure_reason !== record.failure_reason
    || evaluation.loss_j !== record.loss_j
    || evaluation.maximum_loss_j !== record.maximum_loss_j) {
    throw new Error("ICP-T02 evaluation disagrees with outcome.");
  }
  if (!/^[0-9a-f]{64}$/.test(evaluation.design_sha256)) {
    throw new Error("ICP-T02 evaluation design digest invalid.");
  }
}

function assertT02ExecutionStop(stop, failure) {
  if (stop === null) return;
  if (!exactKeys(stop, ["reason", "check_index"]) || !["timeout", "cancelled"].includes(stop.reason)
    || !Number.isSafeInteger(stop.check_index) || stop.check_index < 1 || stop.check_index > 2 ** 40
    || !["missing-output", "generator-failure"].includes(failure)) {
    throw new Error("ICP-T02 execution stop lacks a terminal failure boundary.");
  }
}

function assertT02Integrity(integrity, record, sequence, previousHash) {
  assertT02IntegrityShape(integrity);
  const expectedSequence = sequence ?? integrity.sequence;
  const expectedPrevious = previousHash ?? integrity.previous_sha256;
  if (integrity.sequence !== expectedSequence || integrity.previous_sha256 !== expectedPrevious) {
    throw new Error("ICP-T02 event hash chain invalid.");
  }
  const payload = { ...record };
  delete payload.integrity;
  if (integrity.record_sha256 !== sha256(`${integrity.previous_sha256}\n${canonical(payload)}`)) {
    throw new Error("ICP-T02 event hash chain digest invalid.");
  }
}

function assertT02IntegrityShape(integrity) {
  if (!exactKeys(integrity, ["sequence", "previous_sha256", "record_sha256"])
    || !Number.isSafeInteger(integrity.sequence) || integrity.sequence < 0
    || !/^[0-9a-f]{64}$/.test(integrity.previous_sha256)
    || (integrity.sequence === 0 && integrity.previous_sha256 !== "0".repeat(64))) {
    throw new Error("ICP-T02 event hash chain invalid.");
  }
}
