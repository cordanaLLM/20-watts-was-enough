import { exactKeys } from "../lib/exact-keys.mjs";
import { assertTrackRecord, assertTrackSummary, formatWorldId, NO_RESULT,
  validateTrackConfig } from "./contract.mjs";

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
export const T02_NO_RESULT = NO_RESULT;

export const T02_ARTIFACT_FILES = Object.freeze([
  "world-manifest.json", "tree.json", "regime.json", "designs.jsonl",
  "pressure-ledger.csv", "objective-components.csv", "solver-log.jsonl",
]);

export const T02_EVALUATION_INTEGERS = Object.freeze([
  "evaluations", "golden_iterations", "resource_cap_evaluations", "edges", "terminals", "uniform_upper_round",
]);

export const T02_EVALUATION_NUMBERS = Object.freeze([
  "loss_j", "maximum_loss_j", "objective_w", "pumping_w", "volume_w",
  "pulsatile_w", "wall_floor_w", "pumping_j", "volume_j", "pulsatile_j",
  "wall_floor_j", "material_volume_m3", "alpha", "fitted_exponent",
  "minimum_terminal_margin_pa", "maximum_pressure_shortfall_pa",
  "mean_pressure_shortfall_pa", ...T02_EVALUATION_INTEGERS,
]);

export const T02_EVALUATION_KEYS = Object.freeze([
  ...T02_EVALUATION_NUMBERS, "failure_reason", "design_sha256",
]);

export function t02WorldId(seed) {
  return formatWorldId("ICP-T02", T02_SEEDS, seed);
}

export function validateT02Config(config) {
  const keys = ["schema", "artifact", "track", "profile", "worlds_per_seed",
    "max_rejection_attempts", "resource_cap_evaluations", "golden_relative_width",
    "max_wall_ms", "max_output_bytes", "memory_bytes"];
  return validateTrackConfig(config, {
    track: "ICP-T02",
    keys,
    expected: (c) => ({ schema: 1, artifact: "fixture-020", track: "ICP-T02", worlds_per_seed: 1,
      max_rejection_attempts: 10000, resource_cap_evaluations: 200000, golden_relative_width: 1e-10,
      max_output_bytes: c.profile === "smoke" ? 52428800 : 1073741824,
      memory_bytes: c.profile === "smoke" ? 134217728 : 268435456 }),
  });
}

function assertT02ExtraHeader(record) {
  if (record.regime !== null && !T02_REGIME_LABELS.includes(record.regime)) {
    throw new Error("ICP-T02 regime label invalid.");
  }
}

function assertT02Evaluation(evaluation, record) {
  if (!exactKeys(evaluation, T02_EVALUATION_KEYS)) throw new Error("ICP-T02 evaluation fields are not closed.");
  const nonNegative = T02_EVALUATION_NUMBERS.filter((key) => key !== "minimum_terminal_margin_pa");
  if (nonNegative.some((key) => !Number.isFinite(evaluation[key]) || evaluation[key] < 0)
    || T02_EVALUATION_INTEGERS.some((key) => !Number.isSafeInteger(evaluation[key]))
    || !Number.isFinite(evaluation.minimum_terminal_margin_pa)) {
    throw new Error("ICP-T02 evaluation fields or amounts invalid.");
  }
  if (evaluation.failure_reason !== record.failure_reason
    || evaluation.loss_j !== record.loss_j
    || evaluation.maximum_loss_j !== record.maximum_loss_j
    || !/^[0-9a-f]{64}$/.test(evaluation.design_sha256)) {
    throw new Error("ICP-T02 evaluation disagrees with outcome.");
  }
}

const T02_RECORD_SPEC = Object.freeze({
  track: "ICP-T02", contractVersion: T02_EVENT_CONTRACT_VERSION, worldId: t02WorldId,
  lossKey: "loss_j", maxLossKey: "maximum_loss_j", failureReasons: T02_FAILURE_REASONS,
  artifactFiles: T02_ARTIFACT_FILES, extraKeys: Object.freeze(["regime"]),
  assertExtraHeader: assertT02ExtraHeader, assertEvaluation: assertT02Evaluation,
});

export function assertT02Record(record, options) {
  return assertTrackRecord(record, T02_RECORD_SPEC, options);
}

function validCalibrationBounds(cal) {
  const errs = [cal.alpha_relative_error, cal.power_relative_error, cal.murray_relative_error];
  if (!errs.every((v) => Number.isFinite(v) && v >= 0)) return false;
  return cal.alpha_relative_error <= 1e-6
    && cal.power_relative_error <= 1e-6
    && cal.murray_relative_error <= 1e-12;
}

export function assertT02CalibrationRecord(calibration) {
  const keys = ["status", "alpha_relative_error", "power_relative_error", "murray_relative_error", "b_agreement"];
  if (!exactKeys(calibration, keys) || calibration.status !== "passed"
    || calibration.b_agreement !== "not-built" || !validCalibrationBounds(calibration)) {
    throw new Error("ICP-T02 development calibration invalidates the track.");
  }
  return calibration;
}

export function assertT02Summary(summary) {
  return assertTrackSummary(summary, {
    track: "ICP-T02", lossUnit: "J", resourceUnit: "objective evaluations",
    extraKeys: ["regime_counts", "development_calibration"],
    assertExtra(value) {
      if (!exactKeys(value.regime_counts, T02_REGIME_LABELS)
        || T02_REGIME_LABELS.some((k) => !Number.isSafeInteger(value.regime_counts[k]) || value.regime_counts[k] < 0)) {
        throw new Error("ICP-T02 summary regime counts invalid.");
      }
      assertT02CalibrationRecord(value.development_calibration);
    },
  });
}
