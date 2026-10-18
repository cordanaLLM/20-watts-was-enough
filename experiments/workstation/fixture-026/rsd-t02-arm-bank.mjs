import { isDeepStrictEqual } from "node:util";

import { canonicalize, sha256Hex } from "../lib/checkpoint-ledger.mjs";
import {
  FIXTURE_026_RSD_T02_ACTIONABLE_ARM_IDS,
  FIXTURE_026_RSD_T02_EPISODES,
  FIXTURE_026_RSD_T02_MODEL_CONSTANTS,
  FIXTURE_026_RSD_T02_PROPERTY_KEYS,
  FIXTURE_026_RSD_T02_RECIPES,
} from "./rsd-t02-contract.mjs";
import { buildFixture026RsdT02ExecutionDescriptors } from "./rsd-t02-generator.mjs";
import {
  FIXTURE_026_RSD_T02_TRANSFORM_ARM_IDS,
  FIXTURE_026_RSD_T02_TRANSFORM_POLICY_SPECS,
  evaluateFixture026RsdT02TransformPolicy,
} from "./rsd-t02-transform-policies.mjs";

export const FIXTURE_026_RSD_T02_ARM_BANK_VERSION = "fixture-026.rsd-t02-arm-bank.v2";

export const FIXTURE_026_RSD_T02_ACTIVE_ARM_IDS = Object.freeze([
  ...FIXTURE_026_RSD_T02_ACTIONABLE_ARM_IDS,
]);

export const FIXTURE_026_RSD_T02_INACTIVE_ARM_IDS = Object.freeze(
  FIXTURE_026_RSD_T02_ACTIONABLE_ARM_IDS.filter(
    (armId) => !FIXTURE_026_RSD_T02_ACTIVE_ARM_IDS.includes(armId),
  ),
);

const PACKET_KEYS = Object.freeze([
  "schema", "contract_version", "artifact", "track", "partition", "units",
  "order", "projections",
]);
const PROJECTION_KEYS = Object.freeze([
  "schema", "artifact", "track", "partition", "units", "schedule", "samples",
]);
const SAMPLE_KEYS = Object.freeze([
  "ordinal", "time_s", "input_a_u", "input_b_u", "active_channel",
  "reported_output", "output_clamped", "state_reset_applied", "state_freeze_active",
]);
const PROPERTY_RESULT_KEYS = Object.freeze([
  "closed_values", "action", "decision", "evidence", "reason_codes",
]);
const INFORMATION_KEYS = Object.freeze([
  "system_packet_sha256", "episodes_available", "sample_rows_available",
  "canonical_packet_bytes", "training_labels_seen", "tuning_trials",
  "future_samples_outside_packet_seen", "evaluator_fields_seen", "numeric_model",
  "thread_cap",
]);
const SHARED_ACQUISITION_KEYS = Object.freeze([
  "episodes_acquired", "sample_rows_acquired", "canonical_packet_bytes",
  "input_commands", "internal_resets", "internal_freezes", "output_clamps",
  "channel_switches", "state_writes",
]);
const POLICY_CONSTRUCTION_KEYS = Object.freeze([
  "policy_artifact_sha256", "policy_artifact_bytes", "policy_config_sha256",
  "policy_config_bytes", "total_policy_artifact_bytes", "threshold_provenance",
  "threshold_rationale", "training_labels_seen", "tuning_trials",
  "embedded_candidate_equations", "embedded_candidate_equation_bytes",
  "embedded_property_prior_vectors", "embedded_property_prior_bytes",
]);
const ACTUAL_WORK_KEYS = Object.freeze([
  "episodes_validated", "sample_rows_validated", "policy_sample_rows_read",
  "packet_traversal_scalar_operations", "scalar_operations",
  "transcendental_evaluations", "retained_state_bytes",
  "influential_parameter_bytes", "scratch_peak_bytes",
  "fallback_invocations", "wall_seconds", "later_joules",
]);
const RESOURCE_KEYS = Object.freeze([
  "scope", "common_caps_sha256", "common_caps", "shared_acquisition",
  "policy_construction", "inference",
]);
const INFERENCE_KEYS = Object.freeze(["actual"]);
const COMPATIBLE_PROPERTY_VECTOR_KEYS = Object.freeze([
  "property_vector_id", "property_vector", "compatible_hypothesis_ids",
]);
const ARM_RESPONSE_KEYS = Object.freeze([
  "schema", "contract_version", "artifact", "track", "arm_id", "policy_id",
  "policy_role", "policy_artifact_sha256", "policy_config_sha256",
  "system_packet_sha256", "support", "properties", "compatible_hypothesis_ids",
  "compatible_property_vectors",
  "information_ledger", "resource_ledger", "authority", "comparison_inference_permitted",
  "claim_eligible", "result_label", "no_result",
]);
const INACTIVE_RESPONSE_KEYS = Object.freeze([
  "arm_id", "system_packet_sha256", "action", "reason_codes",
]);
const SUPPORT_KEYS = Object.freeze(["status", "reason_codes"]);
const PACKET_RECORD_KEYS = Object.freeze([
  "packet_ordinal", "seed", "system_slot", "system_packet_sha256",
  "system_packet_utf8_bytes", "active_arm_responses", "inactive_arm_responses",
]);
const COMMITMENT_KEYS = Object.freeze([
  "schema", "contract_version", "artifact", "track", "profile", "partition",
  "active_arm_ids", "inactive_arm_ids", "policy_artifact_sha256",
  "policy_config_sha256", "common_caps_sha256", "packet_records", "authority",
  "comparison_inference_permitted", "claim_eligible", "result_label", "no_result",
  "commitment_sha256",
]);

const CLOSED_VALUES = Object.freeze({
  drive_transform: Object.freeze(["affine-fold", "log-fold"]),
  reported_output_feedback_edge: Object.freeze([false, true]),
  channel_local_state: Object.freeze([false, true]),
  causal_memory: Object.freeze([false, true]),
});
const PACKET_TRAVERSAL_SCALAR_OPERATIONS_PER_ROW = 12;
const LOG_TWO = Math.log(2);
const EXPECTED_COMMON_CAPS = Object.freeze({
  scalar_operations: 1000000,
  transcendental_evaluations: 2000,
  retained_state_bytes: 128,
  influential_parameter_bytes: 4096,
  scratch_peak_bytes: 16777216,
  policy_artifact_bytes: 262144,
  fallback_invocations: 0,
});

const EXPECTED_POLICY_IDENTITIES = Object.freeze({
  ...Object.fromEntries(Object.entries(FIXTURE_026_RSD_T02_TRANSFORM_POLICY_SPECS).map(
    ([armId, spec]) => [armId, Object.freeze({ policy_id: spec.policy_id, role: spec.role })],
  )),
  "B-STATE-SPACE": Object.freeze({
    policy_id: "bounded-arx-signature-reference-v1",
    role: "conformance-reference-not-mature-null",
  }),
  "B-RECURRENT": Object.freeze({
    policy_id: "bounded-causal-recurrence-reference-v1",
    role: "conformance-reference-not-mature-null",
  }),
  "C-MECHANISM-BANK": Object.freeze({
    policy_id: "bounded-source-shaped-signature-bank-v1",
    role: "hypothesis-bank-conformance-reference",
  }),
});

const PROPERTY_PRIOR_VECTORS = Object.freeze(FIXTURE_026_RSD_T02_RECIPES.reduce(
  (vectors, recipe) => {
    let vector = vectors.find(({ property_vector_id: id }) => (
      id === recipe.full_panel_equivalence_class
    ));
    if (!vector) {
      vector = {
        property_vector_id: recipe.full_panel_equivalence_class,
        property_vector: { ...recipe.property_vector },
        compatible_hypothesis_ids: [],
      };
      vectors.push(vector);
    }
    vector.compatible_hypothesis_ids.push(recipe.recipe_id);
    return vectors;
  }, [],
).map((vector) => Object.freeze({
  ...vector,
  property_vector: Object.freeze(vector.property_vector),
  compatible_hypothesis_ids: Object.freeze(vector.compatible_hypothesis_ids),
})));

const PROPERTY_PRIOR_BYTES = Buffer.byteLength(canonicalize(PROPERTY_PRIOR_VECTORS), "utf8");
const CANDIDATE_EQUATION_REGISTRY = Object.freeze(FIXTURE_026_RSD_T02_RECIPES.map((recipe) => (
  Object.freeze({
    recipe_id: recipe.recipe_id,
    equation_id: recipe.equation_id,
    property_vector_id: recipe.full_panel_equivalence_class,
  })
)));
const CANDIDATE_EQUATION_BYTES = Buffer.byteLength(
  canonicalize(CANDIDATE_EQUATION_REGISTRY),
  "utf8",
);
const EXPECTED_POLICY_ACTUALS = Object.freeze({
  "A-RAW": Object.freeze({
    policy_sample_rows_read: 6214,
    scalar_operations: 654960,
    transcendental_evaluations: 0,
    retained_state_bytes: 32,
    influential_parameter_bytes: 993,
  }),
  "B-STATIC-DIV": Object.freeze({
    policy_sample_rows_read: 2,
    scalar_operations: 645544,
    transcendental_evaluations: 0,
    retained_state_bytes: 8,
    influential_parameter_bytes: 961,
  }),
  "B-STREAM": Object.freeze({
    policy_sample_rows_read: 3074,
    scalar_operations: 670140,
    transcendental_evaluations: 3,
    retained_state_bytes: 48,
    influential_parameter_bytes: 993,
  }),
  "B-LOG-RATIO": Object.freeze({
    policy_sample_rows_read: 2,
    scalar_operations: 645544,
    transcendental_evaluations: 1,
    retained_state_bytes: 8,
    influential_parameter_bytes: 961,
  }),
  "B-DIFFERENCE": Object.freeze({
    policy_sample_rows_read: 128,
    scalar_operations: 646117,
    transcendental_evaluations: 0,
    retained_state_bytes: 32,
    influential_parameter_bytes: 969,
  }),
  "B-STATE-SPACE": Object.freeze({
    policy_sample_rows_read: 7685,
    scalar_operations: 688576,
    transcendental_evaluations: 1537,
    retained_state_bytes: 48,
    influential_parameter_bytes: 985,
  }),
  "B-RECURRENT": Object.freeze({
    policy_sample_rows_read: 3074,
    scalar_operations: 667058,
    transcendental_evaluations: 1,
    retained_state_bytes: 32,
    influential_parameter_bytes: 993,
  }),
  "C-MECHANISM-BANK": Object.freeze({
    policy_sample_rows_read: 6215,
    scalar_operations: 654960,
    transcendental_evaluations: 0,
    retained_state_bytes: 32,
    influential_parameter_bytes: 1625,
  }),
  "C-DUAL": Object.freeze({
    policy_sample_rows_read: 6346,
    scalar_operations: 655550,
    transcendental_evaluations: 1,
    retained_state_bytes: 96,
    influential_parameter_bytes: 1057,
  }),
});

const POLICY_BASE_RESULT_KEYS = Object.freeze([
  "schema", "contract_version", "arm_id", "properties", "counter",
  "retained_scalars", "parameter_scalars",
]);
const POLICY_BASE_COUNTER_KEYS = Object.freeze([
  "scalar_operations", "transcendental_evaluations", "policy_sample_rows_read",
]);
export const FIXTURE_026_RSD_T02_POLICY_BASE_VERSION =
  "fixture-026.rsd-t02-policy-base.v2";

function exactKeys(value, keys) {
  return value
    && typeof value === "object"
    && !Array.isArray(value)
    && Object.keys(value).length === keys.length
    && keys.every((key) => Object.hasOwn(value, key));
}

function canonicalUint64(value) {
  if (typeof value !== "string" || !/^(0|[1-9][0-9]{0,19})$/u.test(value)) return false;
  try {
    const parsed = BigInt(value);
    return parsed >= 0n && parsed <= 18446744073709551615n && parsed.toString() === value;
  } catch {
    return false;
  }
}

const EXPECTED_DESCRIPTORS = Object.freeze(buildFixture026RsdT02ExecutionDescriptors());

function expectedSchedules() {
  const episodes = new Map(FIXTURE_026_RSD_T02_EPISODES.map((episode) => [
    episode.episode_id,
    episode.schedule,
  ]));
  return EXPECTED_DESCRIPTORS.map((descriptor) => {
    const episode = FIXTURE_026_RSD_T02_EPISODES.find(
      ({ episode_id: episodeId }) => episodeId === descriptor.episode_id,
    );
    const schedule = episodes.get(descriptor.episode_id);
    if (!schedule || !episode) {
      throw new Error(`Missing RSD-T02 arm packet schedule: ${descriptor.episode_id}`);
    }
    return episode.state_handle === null
      ? schedule
      : { ...schedule, opaque_state_handle: episode.state_handle };
  });
}

const EXPECTED_SCHEDULES = Object.freeze(expectedSchedules());

function assertProjection(projection, index) {
  const descriptor = EXPECTED_DESCRIPTORS[index];
  if (
    !exactKeys(projection, PROJECTION_KEYS)
    || projection.schema !== 1
    || projection.artifact !== "fixture-026"
    || projection.track !== "RSD-T02"
    || projection.partition !== "public-development"
    || !isDeepStrictEqual(projection.units, { input: "U", output: "1", time: "s" })
    || !isDeepStrictEqual(projection.schedule, EXPECTED_SCHEDULES[index])
    || !Array.isArray(projection.samples)
    || projection.samples.length !== FIXTURE_026_RSD_T02_MODEL_CONSTANTS.samples_per_episode
    || projection.samples.some((sample, ordinal) => (
      !exactKeys(sample, SAMPLE_KEYS)
      || sample.ordinal !== ordinal
      || sample.time_s !== ordinal / FIXTURE_026_RSD_T02_MODEL_CONSTANTS.output_rate_hz
      || !Number.isFinite(sample.input_a_u)
      || !Number.isFinite(sample.input_b_u)
      || sample.input_a_u < FIXTURE_026_RSD_T02_MODEL_CONSTANTS.input_floor_u
      || sample.input_b_u < FIXTURE_026_RSD_T02_MODEL_CONSTANTS.input_floor_u
      || !["A", "B"].includes(sample.active_channel)
      || !Number.isFinite(sample.reported_output)
      || typeof sample.output_clamped !== "boolean"
      || typeof sample.state_reset_applied !== "boolean"
      || typeof sample.state_freeze_active !== "boolean"
    ))
    || (projection.schedule.kind === "step" && (
      projection.samples[0].input_a_u !== 2 * descriptor.background_u
      || projection.samples[0].input_b_u !== 2 * descriptor.background_u
      || Math.abs(
        projection.samples[1].reported_output
        - Math.exp(-projection.samples[1].time_s / descriptor.time_constant_s)
      ) > 1e-10
    ))
  ) throw new Error(`Fixture 026 RSD-T02 system packet projection ${index} violates its closed contract.`);
  return projection;
}

export function assertFixture026RsdT02SystemPacket(packet) {
  if (
    !exactKeys(packet, PACKET_KEYS)
    || packet.schema !== 1
    || packet.contract_version !== FIXTURE_026_RSD_T02_ARM_BANK_VERSION
    || packet.artifact !== "fixture-026"
    || packet.track !== "RSD-T02"
    || packet.partition !== "public-development"
    || !isDeepStrictEqual(packet.units, { input: "U", output: "1", time: "s" })
    || packet.order !== "frozen-execution-descriptor-order-v1"
    || !Array.isArray(packet.projections)
    || packet.projections.length !== EXPECTED_SCHEDULES.length
  ) throw new Error("Fixture 026 RSD-T02 system packet violates its closed contract.");
  packet.projections.forEach(assertProjection);
  return packet;
}

// A built packet is a deep-frozen copy whose closed contract and canonical
// bytes are checked once here; arm evaluation and responses over it reuse
// that identity instead of re-checking and re-serialising the packet once per
// arm. Any other packet object takes the full check.
const SEALED_SYSTEM_PACKET_IDENTITIES = new WeakMap();
const MAX_SEALED_PACKET_NODES = 4_000_000;

function deepFreezePacket(packet) {
  const pending = [packet];
  for (let visited = 0; pending.length > 0; visited += 1) {
    if (visited >= MAX_SEALED_PACKET_NODES) {
      throw new RangeError("Fixture 026 RSD-T02 system packet exceeds its freeze bound.");
    }
    const value = pending.pop();
    Object.freeze(value);
    for (const child of Object.values(value)) {
      if (child !== null && typeof child === "object") pending.push(child);
    }
  }
  return packet;
}

function assertSystemPacketUnlessSealed(packet) {
  if (!SEALED_SYSTEM_PACKET_IDENTITIES.has(packet)) assertFixture026RsdT02SystemPacket(packet);
}

function systemPacketIdentity(packet) {
  const sealed = SEALED_SYSTEM_PACKET_IDENTITIES.get(packet);
  if (sealed) return sealed;
  assertFixture026RsdT02SystemPacket(packet);
  const canonical = canonicalize(packet);
  return Object.freeze({
    sha256: sha256Hex(canonical),
    bytes: Buffer.byteLength(canonical, "utf8"),
  });
}

export function buildFixture026RsdT02SystemPacket(projections) {
  const packet = deepFreezePacket(structuredClone({
    schema: 1,
    contract_version: FIXTURE_026_RSD_T02_ARM_BANK_VERSION,
    artifact: "fixture-026",
    track: "RSD-T02",
    partition: "public-development",
    units: { input: "U", output: "1", time: "s" },
    order: "frozen-execution-descriptor-order-v1",
    projections,
  }));
  const identity = systemPacketIdentity(packet);
  SEALED_SYSTEM_PACKET_IDENTITIES.set(packet, identity);
  return Object.freeze({
    packet,
    system_packet_sha256: identity.sha256,
    system_packet_utf8_bytes: identity.bytes,
  });
}

const ARM_BANK_ROOT_KEYS = [
  "schema", "contract_version", "artifact", "track", "authority",
  "active_arm_ids", "inactive_arm_ids",
  "packet", "information", "common_caps", "policies", "comparison_inference_permitted",
  "claim_eligible", "result_label",
];
const ARM_BANK_PACKET_KEYS = [
  "observation_regimes", "episodes", "o0_episodes", "o1_episodes", "rows_per_episode",
  "sample_rows", "input_commands", "internal_resets", "internal_freezes",
  "output_clamps", "channel_switches", "state_writes", "order",
];
const ARM_BANK_INFORMATION_KEYS = [
  "training_labels", "tuning_trials", "future_samples_outside_packet", "evaluator_fields",
  "numeric_model", "thread_cap",
];
const ARM_BANK_CAP_KEYS = [
  "scalar_operations", "transcendental_evaluations", "retained_state_bytes",
  "influential_parameter_bytes", "scratch_peak_bytes", "policy_artifact_bytes",
  "fallback_invocations",
];

function armBankEnvelopeMatches(config) {
  return exactKeys(config, ARM_BANK_ROOT_KEYS)
    && exactKeys(config.packet, ARM_BANK_PACKET_KEYS)
    && exactKeys(config.information, ARM_BANK_INFORMATION_KEYS)
    && exactKeys(config.common_caps, ARM_BANK_CAP_KEYS)
    && exactKeys(config.policies, FIXTURE_026_RSD_T02_ACTIVE_ARM_IDS)
    && config.schema === 1
    && config.contract_version === FIXTURE_026_RSD_T02_ARM_BANK_VERSION
    && config.artifact === "fixture-026"
    && config.track === "RSD-T02"
    && config.authority === "bounded-public-development-policy-conformance-only"
    && isDeepStrictEqual(config.active_arm_ids, FIXTURE_026_RSD_T02_ACTIVE_ARM_IDS)
    && isDeepStrictEqual(config.inactive_arm_ids, FIXTURE_026_RSD_T02_INACTIVE_ARM_IDS);
}

function armBankPacketMatches(packet) {
  return isDeepStrictEqual(packet.observation_regimes, ["O0-MATCHED-STEP", "O1-FULL-PANEL"])
    && packet.episodes === 35
    && packet.o0_episodes === 9
    && packet.o1_episodes === 26
    && packet.rows_per_episode === 1537
    && packet.sample_rows === 53795
    && packet.input_commands === 197
    && packet.internal_resets === 2
    && packet.internal_freezes === 2
    && packet.output_clamps === 1
    && packet.channel_switches === 1
    && packet.state_writes === 2
    && packet.order === "frozen-execution-descriptor-order-v1";
}

function armBankInformationMatches(information) {
  return information.training_labels === 0
    && information.tuning_trials === 0
    && information.future_samples_outside_packet === false
    && information.evaluator_fields === false
    && information.numeric_model === "IEEE-754-binary64"
    && information.thread_cap === 1;
}

function assertArmBankConfigShape(config) {
  if (
    !armBankEnvelopeMatches(config)
    || !armBankPacketMatches(config.packet)
    || !armBankInformationMatches(config.information)
    || !isDeepStrictEqual(config.common_caps, EXPECTED_COMMON_CAPS)
    || config.comparison_inference_permitted !== false
    || config.claim_eligible !== false
    || config.result_label !== "NO_RESULT"
  ) throw new Error("Fixture 026 RSD-T02 arm-bank configuration violates its closed contract.");
  return config;
}

export function validateFixture026RsdT02ArmBankConfig(config) {
  assertArmBankConfigShape(config);
  const policyKeys = {
    ...Object.fromEntries(Object.entries(FIXTURE_026_RSD_T02_TRANSFORM_POLICY_SPECS).map(
      ([armId, spec]) => [armId, [
        "policy_id", "role", "threshold_provenance", "threshold_rationale",
        ...spec.config_keys,
      ]],
    )),
    "B-STATE-SPACE": [
      "policy_id", "role", "threshold_provenance", "threshold_rationale",
      "drive_mse_margin", "memory_true_floor", "memory_false_ceiling",
    ],
    "B-RECURRENT": [
      "policy_id", "role", "threshold_provenance", "threshold_rationale",
      "state_decay_time_s", "feedback_true_floor",
      "feedback_false_ceiling", "channel_local_true_floor", "channel_local_false_ceiling",
    ],
    "C-MECHANISM-BANK": [
      "policy_id", "role", "threshold_provenance", "threshold_rationale",
      "drive_log_floor", "drive_affine_ceiling",
      "feedback_true_floor", "feedback_false_ceiling", "channel_local_true_floor",
      "channel_local_false_ceiling", "memory_true_floor", "memory_false_ceiling",
    ],
  };
  for (const armId of FIXTURE_026_RSD_T02_ACTIVE_ARM_IDS) {
    const policy = config.policies[armId];
    if (
      !exactKeys(policy, policyKeys[armId])
      || typeof policy.policy_id !== "string"
      || typeof policy.role !== "string"
      || policy.threshold_provenance
        !== "construction-tuned-on-five-enumerated-public-worlds-2026-08-27"
      || typeof policy.threshold_rationale !== "string"
      || policy.threshold_rationale.length < 40
      || Object.entries(policy).some(([key, value]) => (
        !["policy_id", "role", "threshold_provenance", "threshold_rationale"].includes(key)
        && (!Number.isFinite(value) || value < 0)
      ))
    ) throw new Error(`Fixture 026 RSD-T02 ${armId} policy configuration is invalid.`);
  }
  return config;
}

function projectionAt(packet, episodeId) {
  const descriptors = buildFixture026RsdT02ExecutionDescriptors();
  const index = descriptors.findIndex((descriptor) => (
    descriptor.regime_membership[0] === "O1-FULL-PANEL"
    && descriptor.episode_id === episodeId
  ));
  if (index < 0) throw new Error(`Missing RSD-T02 arm-bank episode: ${episodeId}`);
  return packet.projections[index];
}

function supDistance(left, right, counter) {
  let maximum = 0;
  for (let index = 0; index < left.samples.length; index += 1) {
    maximum = Math.max(maximum, Math.abs(
      left.samples[index].reported_output - right.samples[index].reported_output,
    ));
    counter.scalar_operations += 3;
    counter.policy_sample_rows_read += 2;
  }
  return maximum;
}

function propertyResult(key, decision, evidence, reason) {
  return Object.freeze({
    closed_values: CLOSED_VALUES[key],
    action: decision === null ? "abstain" : "decide",
    decision,
    evidence,
    reason_codes: Object.freeze([reason]),
  });
}

function blankProperties() {
  return Object.fromEntries(FIXTURE_026_RSD_T02_PROPERTY_KEYS.map((key) => [
    key,
    propertyResult(key, null, null, "outside-bounded-policy-scope"),
  ]));
}

function compatibleHypotheses(properties) {
  const matches = FIXTURE_026_RSD_T02_RECIPES.filter((recipe) => (
    FIXTURE_026_RSD_T02_PROPERTY_KEYS.every((key) => (
      properties[key].decision === null
      || properties[key].decision === recipe.property_vector[key]
    ))
  ));
  return matches.map(({ recipe_id: recipeId }) => recipeId);
}

function compatiblePropertyVectors(properties) {
  const hypothesisIds = new Set(compatibleHypotheses(properties));
  return PROPERTY_PRIOR_VECTORS.filter(({ compatible_hypothesis_ids: ids }) => (
    ids.some((id) => hypothesisIds.has(id))
  )).map((vector) => Object.freeze({
    property_vector_id: vector.property_vector_id,
    property_vector: vector.property_vector,
    compatible_hypothesis_ids: Object.freeze(vector.compatible_hypothesis_ids.filter(
      (id) => hypothesisIds.has(id),
    )),
  }));
}

function assertCompatiblePropertyVectors(response) {
  const expected = compatiblePropertyVectors(response.properties);
  if (
    !Array.isArray(response.compatible_property_vectors)
    || response.compatible_property_vectors.length < 1
    || response.compatible_property_vectors.some((vector) => (
      !exactKeys(vector, COMPATIBLE_PROPERTY_VECTOR_KEYS)
      || typeof vector.property_vector_id !== "string"
      || !exactKeys(vector.property_vector, FIXTURE_026_RSD_T02_PROPERTY_KEYS)
      || !Array.isArray(vector.compatible_hypothesis_ids)
      || vector.compatible_hypothesis_ids.length < 1
    ))
    || !isDeepStrictEqual(response.compatible_property_vectors, expected)
  ) throw new Error("Fixture 026 RSD-T02 arm response has a false joint property-vector set.");
  for (const key of FIXTURE_026_RSD_T02_PROPERTY_KEYS) {
    if (response.properties[key].action === "decide" && response.compatible_property_vectors.some(
      ({ property_vector: vector }) => vector[key] !== response.properties[key].decision,
    )) throw new Error("Fixture 026 RSD-T02 arm marginals contradict its joint property-vector set.");
  }
}

function stateSpacePolicy(packet, policy) {
  const counter = { scalar_operations: 0, transcendental_evaluations: 0, policy_sample_rows_read: 0 };
  const ramp = projectionAt(packet, "RAMP-LIN-UP-0P5");
  const background = ramp.samples[0].input_a_u;
  const deltaT = 1 / FIXTURE_026_RSD_T02_MODEL_CONSTANTS.output_rate_hz;
  let affineState = 0;
  let logState = 0;
  let affineSquaredError = 0;
  let logSquaredError = 0;
  for (const sample of ramp.samples) {
    const activeInput = sample.active_channel === "A" ? sample.input_a_u : sample.input_b_u;
    const fold = activeInput / background;
    const affineDrive = fold - 1;
    const logDrive = Math.log(fold) / LOG_TWO;
    const affineResidual = sample.reported_output - (affineDrive - affineState);
    const logResidual = sample.reported_output - (logDrive - logState);
    affineSquaredError += affineResidual ** 2;
    logSquaredError += logResidual ** 2;
    affineState += deltaT * (affineDrive - affineState);
    logState += deltaT * (logDrive - logState);
    counter.scalar_operations += 22;
    counter.transcendental_evaluations += 1;
    counter.policy_sample_rows_read += 1;
  }
  const driveMargin = (logSquaredError - affineSquaredError) / ramp.samples.length;
  let driveDecision = null;
  if (driveMargin >= policy.drive_mse_margin) driveDecision = "affine-fold";
  else if (driveMargin <= -policy.drive_mse_margin) driveDecision = "log-fold";

  const resetDistance = supDistance(
    projectionAt(packet, "RESET-H0"),
    projectionAt(packet, "RESET-H1"),
    counter,
  );
  const freezeDistance = supDistance(
    projectionAt(packet, "FREEZE-H0"),
    projectionAt(packet, "FREEZE-H1"),
    counter,
  );
  const memoryEvidence = Math.max(resetDistance, freezeDistance);
  let memoryDecision = null;
  if (memoryEvidence >= policy.memory_true_floor) memoryDecision = true;
  else if (memoryEvidence <= policy.memory_false_ceiling) memoryDecision = false;
  const properties = blankProperties();
  properties.drive_transform = propertyResult(
    "drive_transform",
    driveDecision,
    driveMargin,
    driveDecision === null ? "state-space-margin-insufficient" : "state-space-model-margin",
  );
  properties.causal_memory = propertyResult(
    "causal_memory",
    memoryDecision,
    memoryEvidence,
    memoryDecision === null ? "opaque-state-margin-insufficient" : "opaque-state-response-margin",
  );
  return { properties, counter, retainedScalars: 6, parameterScalars: 5 };
}

function recurrentPolicy(packet, policy) {
  const counter = { scalar_operations: 0, transcendental_evaluations: 1, policy_sample_rows_read: 0 };
  const alpha = Math.exp(
    -1 / FIXTURE_026_RSD_T02_MODEL_CONSTANTS.output_rate_hz / policy.state_decay_time_s,
  );
  const clamp = projectionAt(packet, "CLAMP-OUTPUT-01");
  let sharedState = 0;
  let feedbackEvidence = null;
  for (const sample of clamp.samples) {
    if (sample.time_s === 1) feedbackEvidence = Math.abs(sample.reported_output - sharedState);
    sharedState = alpha * sharedState + (1 - alpha) * sample.reported_output;
    counter.scalar_operations += 7;
    counter.policy_sample_rows_read += 1;
  }
  const restimulation = projectionAt(packet, "RESTIM-CROSS-01");
  const channelState = { A: 0, B: 0 };
  let channelEvidence = null;
  for (const sample of restimulation.samples) {
    const channel = sample.active_channel;
    if (sample.time_s === 2) channelEvidence = Math.abs(sample.reported_output - channelState[channel]);
    channelState[channel] = alpha * channelState[channel] + (1 - alpha) * sample.reported_output;
    counter.scalar_operations += 7;
    counter.policy_sample_rows_read += 1;
  }
  let feedbackDecision = null;
  if (feedbackEvidence >= policy.feedback_true_floor) feedbackDecision = true;
  else if (feedbackEvidence <= policy.feedback_false_ceiling) feedbackDecision = false;
  let channelDecision = null;
  if (channelEvidence >= policy.channel_local_true_floor) channelDecision = true;
  else if (channelEvidence <= policy.channel_local_false_ceiling) channelDecision = false;
  const properties = blankProperties();
  properties.reported_output_feedback_edge = propertyResult(
    "reported_output_feedback_edge",
    feedbackDecision,
    feedbackEvidence,
    feedbackDecision === null ? "recurrent-clamp-margin-insufficient" : "recurrent-clamp-innovation",
  );
  properties.channel_local_state = propertyResult(
    "channel_local_state",
    channelDecision,
    channelEvidence,
    channelDecision === null ? "recurrent-channel-margin-insufficient" : "recurrent-channel-innovation",
  );
  return { properties, counter, retainedScalars: 4, parameterScalars: 6 };
}

function sampleAt(projection, timeS) {
  return projection.samples[Math.round(
    timeS * FIXTURE_026_RSD_T02_MODEL_CONSTANTS.output_rate_hz,
  )];
}

function bandDecision(evidence, floor, ceiling, atFloor, atCeiling) {
  if (evidence >= floor) return atFloor;
  if (evidence <= ceiling) return atCeiling;
  return null;
}

function restimulationChannelEvidence(packet, counter) {
  const restimulation = projectionAt(packet, "RESTIM-CROSS-01");
  let channelEvidence = 0;
  for (const sample of restimulation.samples) {
    if (sample.time_s >= 2 && sample.time_s <= 3) {
      channelEvidence = Math.max(channelEvidence, Math.abs(sample.reported_output));
      counter.scalar_operations += 3;
      counter.policy_sample_rows_read += 1;
    }
  }
  return channelEvidence;
}

function opaqueStateEvidence(packet, counter) {
  const resetDistance = supDistance(
    projectionAt(packet, "RESET-H0"),
    projectionAt(packet, "RESET-H1"),
    counter,
  );
  const freezeDistance = supDistance(
    projectionAt(packet, "FREEZE-H0"),
    projectionAt(packet, "FREEZE-H1"),
    counter,
  );
  return Math.max(resetDistance, freezeDistance);
}

function mechanismProperty(key, decision, evidence, indeterminateReason, signatureReason) {
  return propertyResult(key, decision, evidence, decision === null ? indeterminateReason : signatureReason);
}

function mechanismPolicy(packet, policy) {
  const counter = { scalar_operations: 0, transcendental_evaluations: 0, policy_sample_rows_read: 0 };
  const driveEvidence = sampleAt(projectionAt(packet, "RAMP-LIN-UP-0P5"), 0.25).reported_output;
  counter.scalar_operations += 1;
  counter.policy_sample_rows_read += 1;
  const driveDecision = bandDecision(
    driveEvidence, policy.drive_log_floor, policy.drive_affine_ceiling, "log-fold", "affine-fold",
  );

  const feedbackEvidence = Math.abs(sampleAt(projectionAt(packet, "CLAMP-OUTPUT-01"), 1).reported_output);
  counter.scalar_operations += 2;
  counter.policy_sample_rows_read += 1;
  const feedbackDecision = bandDecision(
    feedbackEvidence, policy.feedback_true_floor, policy.feedback_false_ceiling, true, false,
  );

  const channelEvidence = restimulationChannelEvidence(packet, counter);
  const channelDecision = bandDecision(
    channelEvidence, policy.channel_local_true_floor, policy.channel_local_false_ceiling, true, false,
  );

  const memoryEvidence = opaqueStateEvidence(packet, counter);
  const memoryDecision = bandDecision(
    memoryEvidence, policy.memory_true_floor, policy.memory_false_ceiling, true, false,
  );
  const properties = {
    drive_transform: mechanismProperty(
      "drive_transform", driveDecision, driveEvidence,
      "mechanism-drive-band-indeterminate", "mechanism-ramp-signature",
    ),
    reported_output_feedback_edge: mechanismProperty(
      "reported_output_feedback_edge", feedbackDecision, feedbackEvidence,
      "mechanism-feedback-band-indeterminate", "mechanism-clamp-signature",
    ),
    channel_local_state: mechanismProperty(
      "channel_local_state", channelDecision, channelEvidence,
      "mechanism-channel-band-indeterminate", "mechanism-restimulation-signature",
    ),
    causal_memory: mechanismProperty(
      "causal_memory", memoryDecision, memoryEvidence,
      "mechanism-memory-band-indeterminate", "mechanism-opaque-state-signature",
    ),
  };
  return { properties, counter, retainedScalars: 4, parameterScalars: 10 };
}

function policyBaseResult(armId, evaluated) {
  return Object.freeze({
    schema: 1,
    contract_version: FIXTURE_026_RSD_T02_POLICY_BASE_VERSION,
    arm_id: armId,
    properties: evaluated.properties,
    counter: Object.freeze(evaluated.counter),
    retained_scalars: evaluated.retainedScalars,
    parameter_scalars: evaluated.parameterScalars,
  });
}

export function evaluateFixture026RsdT02ArmBase({ armId, packet, config }) {
  assertSystemPacketUnlessSealed(packet);
  validateFixture026RsdT02ArmBankConfig(config);
  if (!FIXTURE_026_RSD_T02_ACTIVE_ARM_IDS.includes(armId)) {
    throw new RangeError(`Fixture 026 RSD-T02 arm is not active in the bounded bank: ${armId}`);
  }
  let evaluated;
  if (FIXTURE_026_RSD_T02_TRANSFORM_ARM_IDS.includes(armId)) {
    evaluated = evaluateFixture026RsdT02TransformPolicy({
      armId,
      packet,
      policy: config.policies[armId],
    });
  } else if (armId === "B-STATE-SPACE") evaluated = stateSpacePolicy(packet, config.policies[armId]);
  else if (armId === "B-RECURRENT") evaluated = recurrentPolicy(packet, config.policies[armId]);
  else evaluated = mechanismPolicy(packet, config.policies[armId]);
  return assertFixture026RsdT02PolicyBaseResult(policyBaseResult(armId, evaluated));
}

function assertPropertyResult(key, result) {
  if (
    !exactKeys(result, PROPERTY_RESULT_KEYS)
    || !isDeepStrictEqual(result.closed_values, CLOSED_VALUES[key])
    || !["decide", "abstain"].includes(result.action)
    || (result.action === "decide" && !CLOSED_VALUES[key].includes(result.decision))
    || (result.action === "abstain" && result.decision !== null)
    || (result.evidence !== null && !Number.isFinite(result.evidence))
    || !Array.isArray(result.reason_codes)
    || result.reason_codes.length !== 1
    || typeof result.reason_codes[0] !== "string"
  ) throw new Error(`Fixture 026 RSD-T02 arm property ${key} violates its closed contract.`);
}

export function assertFixture026RsdT02PolicyBaseResult(result) {
  if (
    !exactKeys(result, POLICY_BASE_RESULT_KEYS)
    || result.schema !== 1
    || result.contract_version !== FIXTURE_026_RSD_T02_POLICY_BASE_VERSION
    || !FIXTURE_026_RSD_T02_ACTIVE_ARM_IDS.includes(result.arm_id)
    || !exactKeys(result.properties, FIXTURE_026_RSD_T02_PROPERTY_KEYS)
    || !exactKeys(result.counter, POLICY_BASE_COUNTER_KEYS)
    || !Number.isSafeInteger(result.counter.scalar_operations)
    || result.counter.scalar_operations < 0
    || !Number.isSafeInteger(result.counter.transcendental_evaluations)
    || result.counter.transcendental_evaluations < 0
    || !Number.isSafeInteger(result.counter.policy_sample_rows_read)
    || result.counter.policy_sample_rows_read < 0
    || !Number.isSafeInteger(result.retained_scalars)
    || result.retained_scalars < 0
    || !Number.isSafeInteger(result.parameter_scalars)
    || result.parameter_scalars < 0
  ) throw new Error("Fixture 026 RSD-T02 policy base result violates its closed contract.");
  for (const key of FIXTURE_026_RSD_T02_PROPERTY_KEYS) {
    assertPropertyResult(key, result.properties[key]);
  }
  const expected = EXPECTED_POLICY_ACTUALS[result.arm_id];
  const expectedShape = {
    ...Object.fromEntries(Object.entries(FIXTURE_026_RSD_T02_TRANSFORM_POLICY_SPECS).map(
      ([armId, spec]) => [armId, {
        retained_scalars: spec.retained_scalars,
        parameter_scalars: spec.parameter_scalars,
      }],
    )),
    "B-STATE-SPACE": { retained_scalars: 6, parameter_scalars: 5 },
    "B-RECURRENT": { retained_scalars: 4, parameter_scalars: 6 },
    "C-MECHANISM-BANK": { retained_scalars: 4, parameter_scalars: 10 },
  }[result.arm_id];
  const packetTraversal = 53795 * PACKET_TRAVERSAL_SCALAR_OPERATIONS_PER_ROW;
  if (
    result.counter.policy_sample_rows_read !== expected.policy_sample_rows_read
    || result.counter.scalar_operations !== expected.scalar_operations - packetTraversal
    || result.counter.transcendental_evaluations !== expected.transcendental_evaluations
    || result.retained_scalars !== expectedShape.retained_scalars
    || result.parameter_scalars !== expectedShape.parameter_scalars
    || compatibleHypotheses(result.properties).length < 1
  ) throw new Error("Fixture 026 RSD-T02 policy base result exceeds or violates its frozen work envelope.");
  return result;
}

function assertActualWithinCaps(actual, caps, armId, canonicalPacketBytes) {
  const expected = EXPECTED_POLICY_ACTUALS[armId];
  if (
    !exactKeys(actual, ACTUAL_WORK_KEYS)
    || actual.episodes_validated !== 35
    || actual.sample_rows_validated !== 53795
    || !Number.isSafeInteger(actual.policy_sample_rows_read)
    || actual.policy_sample_rows_read !== expected.policy_sample_rows_read
    || actual.packet_traversal_scalar_operations
      !== actual.sample_rows_validated * PACKET_TRAVERSAL_SCALAR_OPERATIONS_PER_ROW
    || !Number.isSafeInteger(actual.scalar_operations)
    || actual.scalar_operations !== expected.scalar_operations
    || actual.scalar_operations > caps.scalar_operations
    || !Number.isSafeInteger(actual.transcendental_evaluations)
    || actual.transcendental_evaluations !== expected.transcendental_evaluations
    || actual.transcendental_evaluations > caps.transcendental_evaluations
    || !Number.isSafeInteger(actual.retained_state_bytes)
    || actual.retained_state_bytes !== expected.retained_state_bytes
    || actual.retained_state_bytes > caps.retained_state_bytes
    || !Number.isSafeInteger(actual.influential_parameter_bytes)
    || actual.influential_parameter_bytes !== expected.influential_parameter_bytes
    || actual.influential_parameter_bytes > caps.influential_parameter_bytes
    || !Number.isSafeInteger(actual.scratch_peak_bytes)
    || actual.scratch_peak_bytes !== canonicalPacketBytes
    || actual.scratch_peak_bytes > caps.scratch_peak_bytes
    || actual.fallback_invocations !== caps.fallback_invocations
    || actual.wall_seconds !== null
    || actual.later_joules !== null
  ) throw new Error("Fixture 026 RSD-T02 arm work exceeds or violates its common cap envelope.");
}

function assertSharedAcquisition(ledger, information) {
  if (
    !exactKeys(ledger, SHARED_ACQUISITION_KEYS)
    || ledger.episodes_acquired !== 35
    || ledger.sample_rows_acquired !== 53795
    || ledger.canonical_packet_bytes !== information.canonical_packet_bytes
    || ledger.input_commands !== 197
    || ledger.internal_resets !== 2
    || ledger.internal_freezes !== 2
    || ledger.output_clamps !== 1
    || ledger.channel_switches !== 1
    || ledger.state_writes !== 2
  ) throw new Error("Fixture 026 RSD-T02 shared acquisition ledger is false.");
}

function assertPolicyConstruction(response, ledger, caps) {
  const expectedIdentity = EXPECTED_POLICY_IDENTITIES[response.arm_id];
  const expectedEquationCount = response.arm_id === "C-MECHANISM-BANK"
    ? CANDIDATE_EQUATION_REGISTRY.length
    : 0;
  const expectedEquationBytes = response.arm_id === "C-MECHANISM-BANK"
    ? CANDIDATE_EQUATION_BYTES
    : 0;
  if (
    !exactKeys(ledger, POLICY_CONSTRUCTION_KEYS)
    || ledger.policy_artifact_sha256 !== response.policy_artifact_sha256
    || !Number.isSafeInteger(ledger.policy_artifact_bytes)
    || ledger.policy_artifact_bytes < 1
    || ledger.policy_config_sha256 !== response.policy_config_sha256
    || !Number.isSafeInteger(ledger.policy_config_bytes)
    || ledger.policy_config_bytes < 1
    || ledger.total_policy_artifact_bytes
      !== ledger.policy_artifact_bytes + ledger.policy_config_bytes
    || ledger.total_policy_artifact_bytes > caps.policy_artifact_bytes
    || ledger.threshold_provenance
      !== "construction-tuned-on-five-enumerated-public-worlds-2026-08-27"
    || typeof ledger.threshold_rationale !== "string"
    || ledger.threshold_rationale.length < 40
    || ledger.training_labels_seen !== 0
    || ledger.tuning_trials !== 0
    || ledger.embedded_candidate_equations !== expectedEquationCount
    || ledger.embedded_candidate_equation_bytes !== expectedEquationBytes
    || ledger.embedded_property_prior_vectors !== PROPERTY_PRIOR_VECTORS.length
    || ledger.embedded_property_prior_bytes !== PROPERTY_PRIOR_BYTES
    || response.policy_id !== expectedIdentity.policy_id
    || response.policy_role !== expectedIdentity.role
  ) throw new Error("Fixture 026 RSD-T02 policy construction/prior ledger is false.");
}

function armResponseEnvelopeMatches(response) {
  return exactKeys(response, ARM_RESPONSE_KEYS)
    && response.schema === 1
    && response.contract_version === FIXTURE_026_RSD_T02_ARM_BANK_VERSION
    && response.artifact === "fixture-026"
    && response.track === "RSD-T02"
    && FIXTURE_026_RSD_T02_ACTIVE_ARM_IDS.includes(response.arm_id)
    && typeof response.policy_id === "string"
    && typeof response.policy_role === "string"
    && /^[0-9a-f]{64}$/u.test(response.policy_artifact_sha256)
    && /^[0-9a-f]{64}$/u.test(response.policy_config_sha256)
    && /^[0-9a-f]{64}$/u.test(response.system_packet_sha256)
    && exactKeys(response.support, SUPPORT_KEYS)
    && response.support.status === "inside"
    && Array.isArray(response.support.reason_codes)
    && response.support.reason_codes.length === 0
    && exactKeys(response.properties, FIXTURE_026_RSD_T02_PROPERTY_KEYS)
    && Array.isArray(response.compatible_hypothesis_ids)
    && response.compatible_hypothesis_ids.length >= 1
    && new Set(response.compatible_hypothesis_ids).size
      === response.compatible_hypothesis_ids.length
    && response.compatible_hypothesis_ids.every((id) => (
      FIXTURE_026_RSD_T02_RECIPES.some(({ recipe_id: recipeId }) => recipeId === id)
    ));
}

function armResponseInformationMatches(ledger, systemPacketSha256) {
  return exactKeys(ledger, INFORMATION_KEYS)
    && ledger.system_packet_sha256 === systemPacketSha256
    && ledger.episodes_available === 35
    && ledger.sample_rows_available === 53795
    && Number.isSafeInteger(ledger.canonical_packet_bytes)
    && ledger.canonical_packet_bytes >= 1
    && ledger.training_labels_seen === 0
    && ledger.tuning_trials === 0
    && ledger.future_samples_outside_packet_seen === false
    && ledger.evaluator_fields_seen === false
    && ledger.numeric_model === "IEEE-754-binary64"
    && ledger.thread_cap === 1;
}

function armResponseResourceMatches(ledger) {
  return exactKeys(ledger, RESOURCE_KEYS)
    && ledger.scope === "declared-policy-mathematical-primitives-not-cpu-instructions-or-energy"
    && /^[0-9a-f]{64}$/u.test(ledger.common_caps_sha256)
    && ledger.common_caps_sha256 === sha256Hex(canonicalize(ledger.common_caps))
    && isDeepStrictEqual(ledger.common_caps, EXPECTED_COMMON_CAPS)
    && exactKeys(ledger.inference, INFERENCE_KEYS);
}

export function assertFixture026RsdT02ArmResponse(response) {
  if (
    !armResponseEnvelopeMatches(response)
    || !armResponseInformationMatches(response.information_ledger, response.system_packet_sha256)
    || !armResponseResourceMatches(response.resource_ledger)
    || response.authority !== "public-development-policy-conformance-only"
    || response.comparison_inference_permitted !== false
    || response.claim_eligible !== false
    || response.result_label !== "NO_RESULT"
    || response.no_result !== true
  ) throw new Error("Fixture 026 RSD-T02 arm response violates its closed contract.");
  for (const key of FIXTURE_026_RSD_T02_PROPERTY_KEYS) assertPropertyResult(key, response.properties[key]);
  if (!isDeepStrictEqual(
    response.compatible_hypothesis_ids,
    compatibleHypotheses(response.properties),
  )) throw new Error("Fixture 026 RSD-T02 arm response has a false compatible-hypothesis set.");
  assertCompatiblePropertyVectors(response);
  assertSharedAcquisition(response.resource_ledger.shared_acquisition, response.information_ledger);
  assertPolicyConstruction(
    response,
    response.resource_ledger.policy_construction,
    response.resource_ledger.common_caps,
  );
  assertActualWithinCaps(
    response.resource_ledger.inference.actual,
    response.resource_ledger.common_caps,
    response.arm_id,
    response.information_ledger.canonical_packet_bytes,
  );
  return response;
}

function assertArmPolicyProvenance({
  policyArtifactSha256,
  policyArtifactBytes,
  policyConfigSha256,
  policyConfigBytes,
}) {
  if (
    !/^[0-9a-f]{64}$/u.test(policyArtifactSha256)
    || !Number.isSafeInteger(policyArtifactBytes)
    || policyArtifactBytes < 1
    || !/^[0-9a-f]{64}$/u.test(policyConfigSha256)
    || !Number.isSafeInteger(policyConfigBytes)
    || policyConfigBytes < 1
  ) throw new Error("Fixture 026 RSD-T02 arm policy provenance is invalid.");
}

function armInformationLedger(config, packetSha256, packetBytes) {
  return {
    system_packet_sha256: packetSha256,
    episodes_available: config.packet.episodes,
    sample_rows_available: config.packet.sample_rows,
    canonical_packet_bytes: packetBytes,
    training_labels_seen: config.information.training_labels,
    tuning_trials: config.information.tuning_trials,
    future_samples_outside_packet_seen: config.information.future_samples_outside_packet,
    evaluator_fields_seen: config.information.evaluator_fields,
    numeric_model: config.information.numeric_model,
    thread_cap: config.information.thread_cap,
  };
}

function armSharedAcquisition(config, packetBytes) {
  return {
    episodes_acquired: config.packet.episodes,
    sample_rows_acquired: config.packet.sample_rows,
    canonical_packet_bytes: packetBytes,
    input_commands: config.packet.input_commands,
    internal_resets: config.packet.internal_resets,
    internal_freezes: config.packet.internal_freezes,
    output_clamps: config.packet.output_clamps,
    channel_switches: config.packet.channel_switches,
    state_writes: config.packet.state_writes,
  };
}

function armPolicyConstruction(armId, config, provenance) {
  const mechanismBank = armId === "C-MECHANISM-BANK";
  return {
    policy_artifact_sha256: provenance.policyArtifactSha256,
    policy_artifact_bytes: provenance.policyArtifactBytes,
    policy_config_sha256: provenance.policyConfigSha256,
    policy_config_bytes: provenance.policyConfigBytes,
    total_policy_artifact_bytes: provenance.policyArtifactBytes + provenance.policyConfigBytes,
    threshold_provenance: config.policies[armId].threshold_provenance,
    threshold_rationale: config.policies[armId].threshold_rationale,
    training_labels_seen: config.information.training_labels,
    tuning_trials: config.information.tuning_trials,
    embedded_candidate_equations: mechanismBank ? CANDIDATE_EQUATION_REGISTRY.length : 0,
    embedded_candidate_equation_bytes: mechanismBank ? CANDIDATE_EQUATION_BYTES : 0,
    embedded_property_prior_vectors: PROPERTY_PRIOR_VECTORS.length,
    embedded_property_prior_bytes: PROPERTY_PRIOR_BYTES,
  };
}

function armInferenceActual(config, baseResult, policyConstruction, packetBytes) {
  const packetTraversalScalarOperations = config.packet.sample_rows
    * PACKET_TRAVERSAL_SCALAR_OPERATIONS_PER_ROW;
  return {
    episodes_validated: config.packet.episodes,
    sample_rows_validated: config.packet.sample_rows,
    policy_sample_rows_read: baseResult.counter.policy_sample_rows_read,
    packet_traversal_scalar_operations: packetTraversalScalarOperations,
    scalar_operations: packetTraversalScalarOperations + baseResult.counter.scalar_operations,
    transcendental_evaluations: baseResult.counter.transcendental_evaluations,
    retained_state_bytes: baseResult.retained_scalars * 8,
    influential_parameter_bytes: baseResult.parameter_scalars * 8
      + PROPERTY_PRIOR_BYTES
      + policyConstruction.embedded_candidate_equation_bytes,
    scratch_peak_bytes: packetBytes,
    fallback_invocations: 0,
    wall_seconds: null,
    later_joules: null,
  };
}

export function attachFixture026RsdT02ArmResponse({
  armId,
  packet,
  config,
  policyArtifactSha256,
  policyArtifactBytes,
  policyConfigSha256,
  policyConfigBytes,
  baseResult,
}) {
  const { sha256: packetSha256, bytes: packetBytes } = systemPacketIdentity(packet);
  validateFixture026RsdT02ArmBankConfig(config);
  if (!FIXTURE_026_RSD_T02_ACTIVE_ARM_IDS.includes(armId)) {
    throw new RangeError(`Fixture 026 RSD-T02 arm is not active in the bounded bank: ${armId}`);
  }
  const provenance = { policyArtifactSha256, policyArtifactBytes, policyConfigSha256, policyConfigBytes };
  assertArmPolicyProvenance(provenance);
  assertFixture026RsdT02PolicyBaseResult(baseResult);
  if (baseResult.arm_id !== armId) {
    throw new Error("Fixture 026 RSD-T02 policy base result is bound to another arm.");
  }
  const policyConstruction = armPolicyConstruction(armId, config, provenance);
  const response = {
    schema: 1,
    contract_version: FIXTURE_026_RSD_T02_ARM_BANK_VERSION,
    artifact: "fixture-026",
    track: "RSD-T02",
    arm_id: armId,
    policy_id: config.policies[armId].policy_id,
    policy_role: config.policies[armId].role,
    policy_artifact_sha256: policyArtifactSha256,
    policy_config_sha256: policyConfigSha256,
    system_packet_sha256: packetSha256,
    support: { status: "inside", reason_codes: [] },
    properties: baseResult.properties,
    compatible_hypothesis_ids: compatibleHypotheses(baseResult.properties),
    compatible_property_vectors: compatiblePropertyVectors(baseResult.properties),
    information_ledger: armInformationLedger(config, packetSha256, packetBytes),
    resource_ledger: {
      scope: "declared-policy-mathematical-primitives-not-cpu-instructions-or-energy",
      common_caps_sha256: sha256Hex(canonicalize(config.common_caps)),
      common_caps: config.common_caps,
      shared_acquisition: armSharedAcquisition(config, packetBytes),
      policy_construction: policyConstruction,
      inference: { actual: armInferenceActual(config, baseResult, policyConstruction, packetBytes) },
    },
    authority: "public-development-policy-conformance-only",
    comparison_inference_permitted: false,
    claim_eligible: false,
    result_label: "NO_RESULT",
    no_result: true,
  };
  return Object.freeze(assertFixture026RsdT02ArmResponse(response));
}

export function runFixture026RsdT02Arm({
  armId,
  packet,
  config,
  policyArtifactSha256,
  policyArtifactBytes,
  policyConfigSha256,
  policyConfigBytes,
}) {
  const baseResult = evaluateFixture026RsdT02ArmBase({ armId, packet, config });
  return attachFixture026RsdT02ArmResponse({
    armId,
    packet,
    config,
    policyArtifactSha256,
    policyArtifactBytes,
    policyConfigSha256,
    policyConfigBytes,
    baseResult,
  });
}

function inactiveResponse(armId, systemPacketSha256) {
  return Object.freeze({
    arm_id: armId,
    system_packet_sha256: systemPacketSha256,
    action: "abstain",
    reason_codes: Object.freeze(["not-in-bounded-primary-arm-bank"]),
  });
}

function assertArmCommitmentInputs(profile, packetInputs, activeResponsesByPacket) {
  if (
    !["smoke", "development"].includes(profile)
    || !Array.isArray(packetInputs)
    || (activeResponsesByPacket !== null && (
      !Array.isArray(activeResponsesByPacket)
      || activeResponsesByPacket.length !== packetInputs.length
    ))
  ) {
    throw new Error("Fixture 026 RSD-T02 arm commitment inputs are invalid.");
  }
}

function assertArmPacketEnvelope(input) {
  if (
    !exactKeys(input, ["seed", "system_slot", "packet"])
    || !canonicalUint64(input.seed)
    || !Number.isSafeInteger(input.system_slot)
    || input.system_slot < 0
    || input.system_slot >= FIXTURE_026_RSD_T02_RECIPES.length
  ) throw new Error("Fixture 026 RSD-T02 arm packet envelope is invalid.");
}

function assertSuppliedActiveResponses(activeResponses, built, provenance) {
  if (
    !Array.isArray(activeResponses)
    || activeResponses.length !== FIXTURE_026_RSD_T02_ACTIVE_ARM_IDS.length
  ) throw new Error("Fixture 026 RSD-T02 supplied active arm responses are incomplete.");
  activeResponses.forEach((response, armIndex) => {
    assertFixture026RsdT02ArmResponse(response);
    if (
      response.arm_id !== FIXTURE_026_RSD_T02_ACTIVE_ARM_IDS[armIndex]
      || response.system_packet_sha256 !== built.system_packet_sha256
      || response.policy_artifact_sha256 !== provenance.policyArtifactSha256
      || response.policy_config_sha256 !== provenance.policyConfigSha256
    ) throw new Error("Fixture 026 RSD-T02 supplied active arm response is not bound to its packet and policy inputs.");
  });
  const parityViews = activeResponses.map(({ information_ledger: ledger }) => canonicalize(ledger));
  if (new Set(parityViews).size !== 1) {
    throw new Error("Fixture 026 RSD-T02 active arms did not receive exact information parity.");
  }
}

function buildArmPacketRecord(input, packetOrdinal, config, provenance, suppliedResponses) {
  assertArmPacketEnvelope(input);
  const built = buildFixture026RsdT02SystemPacket(input.packet.projections);
  const activeResponses = suppliedResponses === null
    ? FIXTURE_026_RSD_T02_ACTIVE_ARM_IDS.map((armId) => (
      runFixture026RsdT02Arm({ armId, packet: built.packet, config, ...provenance })
    ))
    : suppliedResponses[packetOrdinal];
  assertSuppliedActiveResponses(activeResponses, built, provenance);
  return Object.freeze({
    packet_ordinal: packetOrdinal,
    seed: input.seed,
    system_slot: input.system_slot,
    system_packet_sha256: built.system_packet_sha256,
    system_packet_utf8_bytes: built.system_packet_utf8_bytes,
    active_arm_responses: Object.freeze(activeResponses),
    inactive_arm_responses: Object.freeze(FIXTURE_026_RSD_T02_INACTIVE_ARM_IDS.map(
      (armId) => inactiveResponse(armId, built.system_packet_sha256),
    )),
  });
}

export function buildFixture026RsdT02ArmCommitment({
  profile,
  packetInputs,
  config,
  policyArtifactSha256,
  policyArtifactBytes,
  policyConfigSha256,
  policyConfigBytes,
  activeResponsesByPacket = null,
}) {
  validateFixture026RsdT02ArmBankConfig(config);
  assertArmCommitmentInputs(profile, packetInputs, activeResponsesByPacket);
  const provenance = { policyArtifactSha256, policyArtifactBytes, policyConfigSha256, policyConfigBytes };
  const packetRecords = packetInputs.map((input, packetOrdinal) => (
    buildArmPacketRecord(input, packetOrdinal, config, provenance, activeResponsesByPacket)
  ));
  const body = {
    schema: 1,
    contract_version: FIXTURE_026_RSD_T02_ARM_BANK_VERSION,
    artifact: "fixture-026",
    track: "RSD-T02",
    profile,
    partition: "public-development",
    active_arm_ids: FIXTURE_026_RSD_T02_ACTIVE_ARM_IDS,
    inactive_arm_ids: FIXTURE_026_RSD_T02_INACTIVE_ARM_IDS,
    policy_artifact_sha256: policyArtifactSha256,
    policy_config_sha256: policyConfigSha256,
    common_caps_sha256: sha256Hex(canonicalize(config.common_caps)),
    packet_records: packetRecords,
    authority: "pre-evaluator-public-development-policy-commitment-only",
    comparison_inference_permitted: false,
    claim_eligible: false,
    result_label: "NO_RESULT",
    no_result: true,
  };
  return Object.freeze({
    ...body,
    commitment_sha256: sha256Hex(canonicalize(body)),
  });
}

export function buildFixture026RsdT02ArmCommitmentFromResponses(options) {
  if (!Array.isArray(options?.activeResponsesByPacket)) {
    throw new Error("Fixture 026 RSD-T02 isolated commitment requires supplied arm responses.");
  }
  return buildFixture026RsdT02ArmCommitment(options);
}

function assertArmPacketRecordShape(record, index) {
  if (
    !exactKeys(record, PACKET_RECORD_KEYS)
    || record.packet_ordinal !== index
    || !canonicalUint64(record.seed)
    || !Number.isSafeInteger(record.system_slot)
    || record.system_slot < 0
    || record.system_slot >= FIXTURE_026_RSD_T02_RECIPES.length
    || !/^[0-9a-f]{64}$/u.test(record.system_packet_sha256)
    || !Number.isSafeInteger(record.system_packet_utf8_bytes)
    || record.system_packet_utf8_bytes < 1
    || !Array.isArray(record.active_arm_responses)
    || record.active_arm_responses.length !== FIXTURE_026_RSD_T02_ACTIVE_ARM_IDS.length
    || !Array.isArray(record.inactive_arm_responses)
    || record.inactive_arm_responses.length !== FIXTURE_026_RSD_T02_INACTIVE_ARM_IDS.length
  ) throw new Error("Fixture 026 RSD-T02 arm packet record violates its closed contract.");
}

function assertCommittedArmResponses(record, commitment) {
  record.active_arm_responses.forEach((response, armIndex) => {
    assertFixture026RsdT02ArmResponse(response);
    if (
      response.arm_id !== FIXTURE_026_RSD_T02_ACTIVE_ARM_IDS[armIndex]
      || response.system_packet_sha256 !== record.system_packet_sha256
      || response.policy_artifact_sha256 !== commitment.policy_artifact_sha256
      || response.policy_config_sha256 !== commitment.policy_config_sha256
      || response.resource_ledger.common_caps_sha256 !== commitment.common_caps_sha256
    ) throw new Error("Fixture 026 RSD-T02 arm response is not bound to its commitment envelope.");
  });
  const parityViews = record.active_arm_responses.map(
    ({ information_ledger: ledger }) => canonicalize(ledger),
  );
  if (new Set(parityViews).size !== 1) {
    throw new Error("Fixture 026 RSD-T02 committed arms lack exact information parity.");
  }
  record.inactive_arm_responses.forEach((response, armIndex) => {
    if (
      !exactKeys(response, INACTIVE_RESPONSE_KEYS)
      || response.arm_id !== FIXTURE_026_RSD_T02_INACTIVE_ARM_IDS[armIndex]
      || response.system_packet_sha256 !== record.system_packet_sha256
      || response.action !== "abstain"
      || !isDeepStrictEqual(response.reason_codes, ["not-in-bounded-primary-arm-bank"])
    ) throw new Error("Fixture 026 RSD-T02 inactive arm failed its forced abstention contract.");
  });
}

export function assertFixture026RsdT02ArmCommitment(commitment) {
  if (
    !exactKeys(commitment, COMMITMENT_KEYS)
    || commitment.schema !== 1
    || commitment.contract_version !== FIXTURE_026_RSD_T02_ARM_BANK_VERSION
    || commitment.artifact !== "fixture-026"
    || commitment.track !== "RSD-T02"
    || !["smoke", "development"].includes(commitment.profile)
    || commitment.partition !== "public-development"
    || !isDeepStrictEqual(commitment.active_arm_ids, FIXTURE_026_RSD_T02_ACTIVE_ARM_IDS)
    || !isDeepStrictEqual(commitment.inactive_arm_ids, FIXTURE_026_RSD_T02_INACTIVE_ARM_IDS)
    || !/^[0-9a-f]{64}$/u.test(commitment.policy_artifact_sha256)
    || !/^[0-9a-f]{64}$/u.test(commitment.policy_config_sha256)
    || !/^[0-9a-f]{64}$/u.test(commitment.common_caps_sha256)
    || !Array.isArray(commitment.packet_records)
    || commitment.packet_records.length < 1
    || commitment.authority !== "pre-evaluator-public-development-policy-commitment-only"
    || commitment.comparison_inference_permitted !== false
    || commitment.claim_eligible !== false
    || commitment.result_label !== "NO_RESULT"
    || commitment.no_result !== true
    || !/^[0-9a-f]{64}$/u.test(commitment.commitment_sha256)
  ) throw new Error("Fixture 026 RSD-T02 arm commitment violates its closed contract.");
  const body = { ...commitment };
  delete body.commitment_sha256;
  if (commitment.commitment_sha256 !== sha256Hex(canonicalize(body))) {
    throw new Error("Fixture 026 RSD-T02 arm commitment hash is false.");
  }
  const packetKeys = new Set();
  for (const [index, record] of commitment.packet_records.entries()) {
    assertArmPacketRecordShape(record, index);
    const packetKey = `${record.seed}:${record.system_slot}`;
    if (packetKeys.has(packetKey)) throw new Error("Fixture 026 RSD-T02 arm commitment has a duplicate packet.");
    packetKeys.add(packetKey);
    assertCommittedArmResponses(record, commitment);
  }
  return commitment;
}

export function fixture026RsdT02ArmCommitmentPayload(commitment) {
  assertFixture026RsdT02ArmCommitment(commitment);
  const payload = { ...commitment };
  delete payload.commitment_sha256;
  return payload;
}
