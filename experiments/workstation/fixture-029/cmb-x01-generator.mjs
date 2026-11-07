import { createHash } from "node:crypto";

import { percentile } from "../lib/percentile.mjs";

export const CMB_X01_GENERATOR_VERSION = "fixture-029.cmb-x01-generator.v3";

export const CMB_X01_COUNTERFACTUAL_DRAW_DOMAIN =
  "F029/CMB-X01/seed/world/slot/step/stream/attempt; arm-excluded";

export const CMB_X01_ARMS = Object.freeze([
  "X01-NONE",
  "X01-OCCUPY",
  "X01-DIRECT",
  "X01-GC",
  "X01-QUEUE",
  "X01-RECRUIT",
  "X01-ORACLE",
]);

export const CMB_X01_DESTRUCTIVE_ARMS = Object.freeze([
  "X01-DIRECT", "X01-GC", "X01-QUEUE", "X01-RECRUIT", "X01-ORACLE",
]);

export const CMB_X01_FAMILIES = Object.freeze([
  "reference-pressure",
  "perfect-evidence",
  "no-harmful-targets",
  "no-engine",
  "zero-productive-geometry",
  "binary-saturation",
  "no-resynthesis-or-replacement",
  "cross-compartment-leakage",
]);

export const CMB_X01_ACTIONABLE_KEYS = Object.freeze([
  "step",
  "slot_id",
  "target_class",
  "target_version",
  "compartment",
  "evidence_score_ppm",
  "evidence_age_steps",
  "action_score_threshold_ppm",
  "gc_due",
  "engine_class",
  "engine_capacity_per_step",
  "action_authority_id",
  "replacement_authorized",
]);

export const CMB_X01_RESOURCE_KEYS = Object.freeze([
  "logical_operations",
  "evidence_reads",
  "target_search_operations",
  "target_transition_operations",
  "queue_insert_operations",
  "queue_pop_operations",
  "engine_service_operations",
  "direct_action_operations",
  "gc_scan_operations",
  "occupancy_operations",
  "mediator_placement_operations",
  "mediator_binding_operations",
  "productive_complex_operations",
  "verification_operations",
  "replacement_operations",
  "resynthesis_operations",
  "mediator_release_operations",
  "mediator_leak_operations",
  "bytes_read",
  "bytes_written",
  "registry_byte_steps",
  "queue_entry_byte_steps",
  "mediator_byte_steps",
  "suppression_byte_steps",
]);

export const CMB_X01_OUTCOME_KEYS = Object.freeze([
  "target_slots",
  "targets_initial",
  "target_arrivals",
  "target_resyntheses",
  "target_replacements",
  "completed_removals",
  "harmful_removals",
  "useful_target_deletions",
  "harmful_target_steps",
  "useful_target_steps",
  "harmful_suppression_steps",
  "useful_suppression_steps",
  "accepted_service_nsu",
  "potential_service_nsu",
  "harmful_misses_end",
  "evidence_false_positives",
  "evidence_false_negatives",
  "queue_entries",
  "queue_service_attempts",
  "queue_pending_end",
  "direct_capacity_misses",
  "queue_wait_p95_steps",
  "queue_wait_p99_steps",
  "productive_recruitment_events",
  "failed_geometry_events",
  "mediator_starvation_events",
  "verified_mediator_reuses",
  "mediators_with_verified_reuse",
  "maximum_verified_completions_per_mediator",
]);

const PAIRED_EXOGENOUS_CACHE_LIMIT = 512;
const pairedExogenousCache = new Map();

export const CMB_X01_SMOKE_CONFIG = Object.freeze({
  schema: 1,
  artifact: "fixture-029",
  track: "CMB-X01",
  profile: "smoke",
  worlds_per_seed: 8,
  target_slots_per_world: 24,
  horizon_steps: 24,
  action_score_threshold_ppm: 700_000,
  garbage_collection_period_steps: 4,
  base_engine_capacity_per_step: 3,
  base_mediator_inventory: 6,
  target_metadata_bytes: 48,
  queue_entry_bytes: 40,
  mediator_state_bytes: 32,
  suppression_state_bytes: 16,
  minimum_accepted_service_fraction_ppm: 750_000,
  maximum_useful_deletions: 2,
  maximum_harmful_target_fraction_ppm: 250_000,
  maximum_harmful_miss_fraction_ppm: 250_000,
  maximum_queue_p99_steps: 12,
  maximum_queue_pending_fraction_ppm: 500_000,
});

const CONFIG_KEYS = Object.freeze(Object.keys(CMB_X01_SMOKE_CONFIG));

function exactKeys(value, keys) {
  return value && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).length === keys.length
    && keys.every((key) => Object.hasOwn(value, key));
}

function count(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function probabilityPpm(value) {
  return count(value) && value <= 1_000_000;
}

export function validateCmbX01Config(config) {
  if (
    !exactKeys(config, CONFIG_KEYS)
    || config.schema !== 1
    || config.artifact !== "fixture-029"
    || config.track !== "CMB-X01"
    || !new Set(["smoke", "development"]).has(config.profile)
    || !count(config.worlds_per_seed)
    || config.worlds_per_seed < CMB_X01_FAMILIES.length
    || config.worlds_per_seed > 64
    || config.worlds_per_seed % CMB_X01_FAMILIES.length !== 0
    || !count(config.target_slots_per_world)
    || config.target_slots_per_world < 16
    || config.target_slots_per_world > 256
    || !count(config.horizon_steps)
    || config.horizon_steps < 16
    || config.horizon_steps > 256
    || !probabilityPpm(config.action_score_threshold_ppm)
    || config.action_score_threshold_ppm === 0
    || !count(config.garbage_collection_period_steps)
    || config.garbage_collection_period_steps < 2
    || !count(config.base_engine_capacity_per_step)
    || config.base_engine_capacity_per_step === 0
    || config.base_engine_capacity_per_step > config.target_slots_per_world
    || !count(config.base_mediator_inventory)
    || config.base_mediator_inventory < 2
    || config.base_mediator_inventory > config.target_slots_per_world
    || !count(config.target_metadata_bytes)
    || config.target_metadata_bytes === 0
    || !count(config.queue_entry_bytes)
    || config.queue_entry_bytes === 0
    || !count(config.mediator_state_bytes)
    || config.mediator_state_bytes === 0
    || !count(config.suppression_state_bytes)
    || config.suppression_state_bytes === 0
    || !probabilityPpm(config.minimum_accepted_service_fraction_ppm)
    || config.minimum_accepted_service_fraction_ppm === 0
    || !count(config.maximum_useful_deletions)
    || !probabilityPpm(config.maximum_harmful_target_fraction_ppm)
    || config.maximum_harmful_target_fraction_ppm === 0
    || !probabilityPpm(config.maximum_harmful_miss_fraction_ppm)
    || config.maximum_harmful_miss_fraction_ppm === 0
    || !count(config.maximum_queue_p99_steps)
    || !probabilityPpm(config.maximum_queue_pending_fraction_ppm)
    || config.maximum_queue_pending_fraction_ppm === 0
  ) throw new Error("CMB-X01 configuration is invalid.");
  return Object.freeze({ ...config });
}

function canonical(value) {
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    return JSON.stringify(value);
  }
  if (typeof value === "number" && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => {
      if (value[key] === undefined) throw new TypeError(`Undefined canonical field ${key}.`);
      return `${JSON.stringify(key)}:${canonical(value[key])}`;
    }).join(",")}}`;
  }
  throw new TypeError(`Unsupported canonical value ${typeof value}.`);
}

function hash(value) {
  return createHash("sha256").update(canonical(value)).digest("hex");
}

function digestPpm(preimage) {
  const numerator = createHash("sha256").update(preimage, "utf8").digest().readUIntBE(0, 6);
  return Math.floor(numerator * 1_000_000 / 281_474_976_710_656);
}

function drawPpm(seed, worldIndex, slotIndex, step, stream, attempt = 0) {
  return digestPpm(`F029|CMB-X01|${seed}|${worldIndex}|${slotIndex}|${step}|${stream}|${attempt}`);
}

function jitterPpm(seed, worldIndex, stream, radius) {
  return Math.floor((digestPpm(`F029|CMB-X01|${seed}|${worldIndex}|family|${stream}`) * 2 - 1_000_000)
    * radius / 1_000_000);
}

function boundedPpm(value) {
  return Math.max(0, Math.min(1_000_000, value));
}

function familyParameters(family, seed, worldIndex, config) {
  const parameters = {
    initial_occupancy_ppm: 850_000,
    initial_harmful_ppm: boundedPpm(300_000 + jitterPpm(seed, worldIndex, "initial-harm", 30_000)),
    arrival_ppm: boundedPpm(45_000 + jitterPpm(seed, worldIndex, "arrival", 8_000)),
    arrival_harmful_ppm: 450_000,
    harmful_conversion_ppm: 35_000,
    useful_recovery_ppm: 20_000,
    resynthesis_ppm: 180_000,
    resynthesis_harmful_ppm: 850_000,
    evidence_sensitivity_ppm: 900_000,
    evidence_false_positive_ppm: 100_000,
    evidence_delay_steps: 1,
    engine_capacity_per_step: config.base_engine_capacity_per_step,
    mediator_inventory: config.base_mediator_inventory,
    target_mediator_compatible: true,
    mediator_engine_compatible: true,
    productive_geometry_ppm: boundedPpm(780_000 + jitterPpm(seed, worldIndex, "geometry", 30_000)),
    mediator_reuse_enabled: true,
    mediator_leakage_ppm: 0,
    replacement_enabled: true,
    binary_saturation: false,
  };
  if (family === "perfect-evidence") {
    parameters.evidence_sensitivity_ppm = 1_000_000;
    parameters.evidence_false_positive_ppm = 0;
    parameters.evidence_delay_steps = 0;
  }
  if (family === "no-harmful-targets") {
    parameters.initial_harmful_ppm = 0;
    parameters.arrival_harmful_ppm = 0;
    parameters.harmful_conversion_ppm = 0;
    parameters.resynthesis_harmful_ppm = 0;
  }
  if (family === "no-engine") parameters.engine_capacity_per_step = 0;
  if (family === "zero-productive-geometry") parameters.productive_geometry_ppm = 0;
  if (family === "binary-saturation") {
    parameters.mediator_inventory = config.base_mediator_inventory * 4;
    parameters.productive_geometry_ppm = 60_000;
    parameters.binary_saturation = true;
  }
  if (family === "no-resynthesis-or-replacement") {
    parameters.resynthesis_ppm = 0;
    parameters.replacement_enabled = false;
  }
  if (family === "cross-compartment-leakage") parameters.mediator_leakage_ppm = 450_000;
  return Object.freeze(parameters);
}

function actionAuthority(parameters) {
  return Object.freeze({
    authority_id: "cmb-x01-maintenance-authority-v1",
    engine_class: "typed-maintenance-engine-v1",
    engine_capacity_per_step: parameters.engine_capacity_per_step,
    permitted_target_classes: Object.freeze(["cache-entry", "transient-worker"]),
    permitted_destructive_action: "verified-remove-v1",
    destructive_verification_required: true,
    replacement_authorized: parameters.replacement_enabled,
  });
}

export function generateCmbX01Worlds({ seed, config = CMB_X01_SMOKE_CONFIG }) {
  const checked = validateCmbX01Config(config);
  if (!Number.isSafeInteger(seed) || seed < 0 || seed > 0xffff_ffff) {
    throw new Error("CMB-X01 public seed must be an unsigned integer.");
  }
  return Object.freeze(Array.from({ length: checked.worlds_per_seed }, (_, worldIndex) => {
    const generatorFamily = CMB_X01_FAMILIES[worldIndex % CMB_X01_FAMILIES.length];
    const evaluatorParameters = familyParameters(generatorFamily, seed, worldIndex, checked);
    const authority = actionAuthority(evaluatorParameters);
    const publicContract = Object.freeze({
      target_slots: checked.target_slots_per_world,
      horizon_steps: checked.horizon_steps,
      target_version: 1,
      action_score_threshold_ppm: checked.action_score_threshold_ppm,
      garbage_collection_period_steps: checked.garbage_collection_period_steps,
      mediator_inventory_declared: evaluatorParameters.mediator_inventory,
      target_metadata_bytes: checked.target_metadata_bytes,
      queue_entry_bytes: checked.queue_entry_bytes,
      mediator_state_bytes: checked.mediator_state_bytes,
      suppression_state_bytes: checked.suppression_state_bytes,
      action_authority: authority,
    });
    return Object.freeze({
      world_index: worldIndex,
      world_id: createHash("sha256")
        .update(`F029|CMB-X01|public-development|${seed}|${worldIndex}|${generatorFamily}`, "utf8")
        .digest("hex"),
      generator_family: generatorFamily,
      public_contract: publicContract,
      evaluator_parameters: evaluatorParameters,
    });
  }));
}

function initialSlotState(seed, world, slotIndex) {
  const p = world.evaluator_parameters;
  if (drawPpm(seed, world.world_index, slotIndex, -1, "initial-present") >= p.initial_occupancy_ppm) {
    return "absent";
  }
  return drawPpm(seed, world.world_index, slotIndex, -1, "initial-harm") < p.initial_harmful_ppm
    ? "harmful" : "useful";
}

function counterfactualEvidenceState(seed, world, slotIndex, throughStep) {
  let state = initialSlotState(seed, world, slotIndex);
  for (let step = 0; step <= throughStep; step += 1) {
    if (state === "absent") {
      if (drawPpm(seed, world.world_index, slotIndex, step, "arrival")
        < world.evaluator_parameters.arrival_ppm) {
        state = drawPpm(seed, world.world_index, slotIndex, step, "arrival-harm")
          < world.evaluator_parameters.arrival_harmful_ppm ? "harmful" : "useful";
      }
    } else if (state === "useful"
      && drawPpm(seed, world.world_index, slotIndex, step, "harmful-conversion")
        < world.evaluator_parameters.harmful_conversion_ppm) {
      state = "harmful";
    } else if (state === "harmful"
      && drawPpm(seed, world.world_index, slotIndex, step, "useful-recovery")
        < world.evaluator_parameters.useful_recovery_ppm) {
      state = "useful";
    }
  }
  return state;
}

function evidenceForState({ seed, world, slotIndex, step, latentState }) {
  const p = world.evaluator_parameters;
  const draw = drawPpm(seed, world.world_index, slotIndex, step, "paired-evidence");
  const positive = latentState === "harmful"
    ? draw < p.evidence_sensitivity_ppm
    : draw < p.evidence_false_positive_ppm;
  const confidenceJitter = drawPpm(seed, world.world_index, slotIndex, step, "evidence-confidence") % 80_000;
  return positive ? 900_000 + confidenceJitter : 20_000 + confidenceJitter;
}

export function buildCmbX01ActionableObservation({
  seed, world, slotIndex, step, latentState,
}) {
  if (!new Set(["absent", "useful", "harmful"]).has(latentState)) {
    throw new Error("CMB-X01 latent state is invalid.");
  }
  const publicContract = world.public_contract;
  const authority = publicContract.action_authority;
  return Object.freeze({
    step,
    slot_id: `slot-${String(slotIndex).padStart(3, "0")}`,
    target_class: slotIndex % 2 === 0 ? "cache-entry" : "transient-worker",
    target_version: publicContract.target_version,
    compartment: `compartment-${slotIndex % 3}`,
    evidence_score_ppm: evidenceForState({ seed, world, slotIndex, step, latentState }),
    evidence_age_steps: world.evaluator_parameters.evidence_delay_steps,
    action_score_threshold_ppm: publicContract.action_score_threshold_ppm,
    gc_due: step % publicContract.garbage_collection_period_steps === 0,
    engine_class: authority.engine_class,
    engine_capacity_per_step: authority.engine_capacity_per_step,
    action_authority_id: authority.authority_id,
    replacement_authorized: authority.replacement_authorized,
  });
}

export function decideCmbX01Action(arm, observation, oracleTruth = null) {
  if (!CMB_X01_ARMS.includes(arm)) throw new Error("CMB-X01 arm is invalid.");
  if (!exactKeys(observation, CMB_X01_ACTIONABLE_KEYS)) {
    throw new Error("CMB-X01 policy view contains hidden or missing fields.");
  }
  if (arm !== "X01-ORACLE" && oracleTruth !== null) {
    throw new Error("CMB-X01 non-oracle policy cannot receive evaluator truth.");
  }
  if (arm === "X01-ORACLE" && !exactKeys(oracleTruth, ["latent_state", "productive_geometry_available"])) {
    throw new Error("CMB-X01 oracle truth is missing or malformed.");
  }
  const positive = observation.evidence_score_ppm >= observation.action_score_threshold_ppm;
  const destructive = CMB_X01_DESTRUCTIVE_ARMS.includes(arm);
  const candidate = arm === "X01-ORACLE"
    ? oracleTruth.latent_state === "harmful" && oracleTruth.productive_geometry_available
    : positive && (arm !== "X01-GC" || observation.gc_due);
  return Object.freeze({
    mode: arm.slice(4).toLowerCase(),
    suppress: arm === "X01-OCCUPY" && positive,
    nominate: destructive && candidate,
    destructive,
    request_replacement: destructive && observation.replacement_authorized,
  });
}

function potentialGeometryAvailable(seed, world, slotIndex, step, attempt = 0) {
  const p = world.evaluator_parameters;
  return p.target_mediator_compatible
    && p.mediator_engine_compatible
    && drawPpm(seed, world.world_index, slotIndex, step, "productive-geometry", attempt)
      < p.productive_geometry_ppm;
}

function pairedExogenousHash(seed, world, config) {
  const cacheKey = [
    seed, world.world_index, config.target_slots_per_world, config.horizon_steps,
  ].join("/");
  const cached = pairedExogenousCache.get(cacheKey);
  if (cached !== undefined) return cached;
  const singleDrawStreams = [
    "initial-present", "initial-harm", "arrival", "arrival-harm", "harmful-conversion",
    "useful-recovery", "resynthesis", "resynthesis-harm", "paired-evidence",
    "evidence-confidence",
  ];
  const retryDrawStreams = ["productive-geometry", "mediator-leakage"];
  const draws = [];
  for (let slotIndex = 0; slotIndex < config.target_slots_per_world; slotIndex += 1) {
    for (let step = -1; step < config.horizon_steps; step += 1) {
      for (const stream of singleDrawStreams) {
        draws.push(drawPpm(seed, world.world_index, slotIndex, step, stream));
      }
    }
    // A queued slot can consume at most one engine service per step, so
    // horizon_steps is a closed upper bound on every reachable retry index.
    for (let step = 0; step < config.horizon_steps; step += 1) {
      for (const stream of retryDrawStreams) {
        for (let attempt = 0; attempt < config.horizon_steps; attempt += 1) {
          draws.push(drawPpm(seed, world.world_index, slotIndex, step, stream, attempt));
        }
      }
    }
  }
  const digest = hash(draws);
  pairedExogenousCache.set(cacheKey, digest);
  if (pairedExogenousCache.size > PAIRED_EXOGENOUS_CACHE_LIMIT) {
    pairedExogenousCache.delete(pairedExogenousCache.keys().next().value);
  }
  return digest;
}

function emptyResources() {
  return Object.fromEntries(CMB_X01_RESOURCE_KEYS.map((key) => [key, 0]));
}

function freezeInventory(target, engine, mediator) {
  return Object.freeze({
    target: Object.freeze(target),
    engine: Object.freeze(engine),
    mediator: Object.freeze({
      ...mediator,
      verified_completion_counts: Object.freeze([...mediator.verified_completion_counts]),
    }),
  });
}

export function simulateCmbX01Arm({ seed, world, arm, config = CMB_X01_SMOKE_CONFIG }) {
  const checked = validateCmbX01Config(config);
  if (!CMB_X01_ARMS.includes(arm)) throw new Error("CMB-X01 arm is invalid.");
  if (!world || world.public_contract.target_slots !== checked.target_slots_per_world
    || world.public_contract.horizon_steps !== checked.horizon_steps) {
    throw new Error("CMB-X01 world and configuration do not match.");
  }
  const p = world.evaluator_parameters;
  const slots = Array.from({ length: checked.target_slots_per_world }, (_, slotIndex) => {
    const state = initialSlotState(seed, world, slotIndex);
    return {
      state,
      removed_before: false,
    };
  });
  const resources = emptyResources();
  const outcomes = Object.fromEntries(CMB_X01_OUTCOME_KEYS.map((key) => [key, 0]));
  outcomes.target_slots = slots.length;
  outcomes.targets_initial = slots.filter((slot) => slot.state !== "absent").length;
  const queue = [];
  const queuedSlots = new Set();
  const queueWaits = [];
  const policyViews = [];
  const policyActions = [];
  const mediatorArm = arm === "X01-RECRUIT" || arm === "X01-ORACLE";
  const mediatorCompletionCounts = mediatorArm
    ? Array.from({ length: p.mediator_inventory }, () => 0) : [];
  const freeMediators = mediatorCompletionCounts.map((_, index) => index);
  let mediatorsConsumed = 0;
  let mediatorsLeaked = 0;
  let engineServiceUsed = 0;
  let lastSuppressedHarmful = 0;

  const enqueue = (slotIndex, step, score, action) => {
    if (queuedSlots.has(slotIndex)) return;
    queue.push({
      slot_index: slotIndex,
      enqueued_step: step,
      score,
      attempts: 0,
      request_replacement: action.request_replacement,
    });
    queuedSlots.add(slotIndex);
    outcomes.queue_entries += 1;
    resources.queue_insert_operations += 1;
    resources.bytes_written += checked.queue_entry_bytes;
  };

  for (let step = 0; step < checked.horizon_steps; step += 1) {
    for (let slotIndex = 0; slotIndex < slots.length; slotIndex += 1) {
      const slot = slots[slotIndex];
      if (slot.state === "absent") {
        const resynthesizes = slot.removed_before && p.resynthesis_ppm > 0
          && drawPpm(seed, world.world_index, slotIndex, step, "resynthesis") < p.resynthesis_ppm;
        const arrives = !resynthesizes
          && drawPpm(seed, world.world_index, slotIndex, step, "arrival") < p.arrival_ppm;
        if (resynthesizes) {
          slot.state = drawPpm(seed, world.world_index, slotIndex, step, "resynthesis-harm")
            < p.resynthesis_harmful_ppm ? "harmful" : "useful";
          outcomes.target_resyntheses += 1;
          resources.resynthesis_operations += 1;
          resources.bytes_written += checked.target_metadata_bytes;
        } else if (arrives) {
          slot.state = drawPpm(seed, world.world_index, slotIndex, step, "arrival-harm")
            < p.arrival_harmful_ppm ? "harmful" : "useful";
          outcomes.target_arrivals += 1;
          resources.target_transition_operations += 1;
          resources.bytes_written += checked.target_metadata_bytes;
        }
      } else if (slot.state === "useful"
        && drawPpm(seed, world.world_index, slotIndex, step, "harmful-conversion") < p.harmful_conversion_ppm) {
        slot.state = "harmful";
        resources.target_transition_operations += 1;
      } else if (slot.state === "harmful"
        && drawPpm(seed, world.world_index, slotIndex, step, "useful-recovery") < p.useful_recovery_ppm) {
        slot.state = "useful";
        resources.target_transition_operations += 1;
      }
    }

    let suppressedUsefulThisStep = 0;
    let suppressedHarmfulThisStep = 0;
    let counterfactualUsefulThisStep = 0;
    for (let slotIndex = 0; slotIndex < slots.length; slotIndex += 1) {
      const slot = slots[slotIndex];
      const evidenceStep = Math.max(0, step - p.evidence_delay_steps);
      const counterfactualCurrentState = counterfactualEvidenceState(
        seed,
        world,
        slotIndex,
        step,
      );
      if (counterfactualCurrentState === "useful") counterfactualUsefulThisStep += 1;
      const evidenceState = evidenceStep === step ? counterfactualCurrentState
        : counterfactualEvidenceState(seed, world, slotIndex, evidenceStep);
      const observation = buildCmbX01ActionableObservation({
        seed, world, slotIndex, step, latentState: evidenceState,
      });
      const geometryAvailable = potentialGeometryAvailable(seed, world, slotIndex, step);
      const oracleTruth = arm === "X01-ORACLE"
        ? { latent_state: slot.state, productive_geometry_available: geometryAvailable } : null;
      const action = decideCmbX01Action(arm, observation, oracleTruth);
      policyViews.push(arm === "X01-ORACLE"
        ? { ...observation, oracle_truth: oracleTruth } : observation);
      policyActions.push(action);
      resources.evidence_reads += 1;
      resources.target_search_operations += 1;
      resources.bytes_read += checked.target_metadata_bytes;
      const evidencePositive = observation.evidence_score_ppm >= observation.action_score_threshold_ppm;
      if (evidencePositive && evidenceState !== "harmful") outcomes.evidence_false_positives += 1;
      if (!evidencePositive && evidenceState === "harmful") outcomes.evidence_false_negatives += 1;
      if (action.suppress && slot.state !== "absent") {
        resources.occupancy_operations += 1;
        resources.suppression_byte_steps += checked.suppression_state_bytes;
        if (slot.state === "useful") {
          suppressedUsefulThisStep += 1;
          outcomes.useful_suppression_steps += 1;
        } else if (slot.state === "harmful") {
          suppressedHarmfulThisStep += 1;
          outcomes.harmful_suppression_steps += 1;
        }
      }
      if (action.nominate) {
        enqueue(slotIndex, step, observation.evidence_score_ppm, action);
      }
      if (arm === "X01-GC" && observation.gc_due) resources.gc_scan_operations += 1;
    }

    queue.sort((left, right) => right.score - left.score
      || left.enqueued_step - right.enqueued_step || left.slot_index - right.slot_index);
    let remainingEngine = p.engine_capacity_per_step;
    const attemptsThisStep = Math.min(remainingEngine, queue.length);
    for (let attemptIndex = 0; attemptIndex < attemptsThisStep; attemptIndex += 1) {
      const item = queue.shift();
      queuedSlots.delete(item.slot_index);
      resources.queue_pop_operations += 1;
      resources.bytes_read += checked.queue_entry_bytes;
      const usesMediator = mediatorArm;
      if (usesMediator && freeMediators.length === 0) {
        outcomes.mediator_starvation_events += 1;
        queue.push(item);
        queuedSlots.add(item.slot_index);
        resources.queue_insert_operations += 1;
        resources.bytes_written += checked.queue_entry_bytes;
        continue;
      }
      remainingEngine -= 1;
      engineServiceUsed += 1;
      outcomes.queue_service_attempts += 1;
      resources.engine_service_operations += 1;
      queueWaits.push(step - item.enqueued_step);
      item.attempts += 1;
      const slot = slots[item.slot_index];
      let productive = true;
      let mediatorId = null;
      if (usesMediator) {
        mediatorId = freeMediators.shift();
        resources.mediator_placement_operations += 1;
        resources.mediator_binding_operations += 1;
        productive = potentialGeometryAvailable(
          seed, world, item.slot_index, step, item.attempts - 1,
        );
        if (productive) {
          outcomes.productive_recruitment_events += 1;
          resources.productive_complex_operations += 1;
        } else {
          outcomes.failed_geometry_events += 1;
        }
      } else {
        resources.direct_action_operations += 1;
      }
      let verifiedCompletion = false;
      if (productive && slot.state !== "absent") {
        const removedState = slot.state;
        slot.state = "absent";
        slot.removed_before = true;
        outcomes.completed_removals += 1;
        outcomes.harmful_removals += removedState === "harmful" ? 1 : 0;
        outcomes.useful_target_deletions += removedState === "useful" ? 1 : 0;
        resources.verification_operations += 1;
        resources.bytes_read += checked.target_metadata_bytes;
        verifiedCompletion = true;
        if (removedState === "useful" && item.request_replacement && p.replacement_enabled) {
          slot.state = "useful";
          outcomes.target_replacements += 1;
          resources.replacement_operations += 1;
          resources.bytes_written += checked.target_metadata_bytes;
        }
      } else {
        resources.verification_operations += 1;
        resources.bytes_read += checked.target_metadata_bytes;
      }
      if (usesMediator) {
        if (verifiedCompletion) {
          if (mediatorCompletionCounts[mediatorId] > 0) outcomes.verified_mediator_reuses += 1;
          mediatorCompletionCounts[mediatorId] += 1;
        }
        const leaks = drawPpm(seed, world.world_index, item.slot_index, step, "mediator-leakage", item.attempts - 1)
          < p.mediator_leakage_ppm;
        if (leaks) {
          mediatorsLeaked += 1;
          resources.mediator_leak_operations += 1;
        } else if (!p.mediator_reuse_enabled) {
          mediatorsConsumed += 1;
        } else {
          freeMediators.push(mediatorId);
          freeMediators.sort((left, right) => left - right);
          resources.mediator_release_operations += 1;
        }
      }
      if (!productive && slot.state !== "absent") {
        queue.push(item);
        queuedSlots.add(item.slot_index);
        resources.queue_insert_operations += 1;
        resources.bytes_written += checked.queue_entry_bytes;
      }
    }

    // Direct deletion has no durable tagged work queue. Requests that cannot
    // consume the shared engine in this step expire and are reconsidered from
    // fresh evidence later; this keeps it distinct from X01-QUEUE.
    if (arm === "X01-DIRECT" && queue.length > 0) {
      outcomes.direct_capacity_misses += queue.length;
      queue.length = 0;
      queuedSlots.clear();
    }

    outcomes.potential_service_nsu += counterfactualUsefulThisStep;
    outcomes.accepted_service_nsu += Math.max(
      0, slots.filter((slot) => slot.state === "useful").length - suppressedUsefulThisStep,
    );
    outcomes.harmful_target_steps += Math.max(
      0,
      slots.filter((slot) => slot.state === "harmful").length - suppressedHarmfulThisStep,
    );
    outcomes.useful_target_steps += slots.filter((slot) => slot.state === "useful").length;
    resources.registry_byte_steps += slots.length * checked.target_metadata_bytes;
    resources.queue_entry_byte_steps += queue.length * checked.queue_entry_bytes;
    resources.mediator_byte_steps += (freeMediators.length) * checked.mediator_state_bytes;
    lastSuppressedHarmful = suppressedHarmfulThisStep;
  }

  outcomes.queue_pending_end = queue.length;
  outcomes.queue_wait_p95_steps = percentile(queueWaits, 0.95);
  outcomes.queue_wait_p99_steps = percentile(queueWaits, 0.99);
  outcomes.harmful_misses_end = Math.max(
    0,
    slots.filter((slot) => slot.state === "harmful").length - lastSuppressedHarmful,
  );
  outcomes.mediators_with_verified_reuse = mediatorCompletionCounts.filter((value) => value > 1).length;
  outcomes.maximum_verified_completions_per_mediator = mediatorCompletionCounts.length === 0
    ? 0 : Math.max(...mediatorCompletionCounts);
  resources.logical_operations = [
    "evidence_reads", "target_search_operations", "target_transition_operations",
    "queue_insert_operations", "queue_pop_operations", "engine_service_operations",
    "direct_action_operations", "gc_scan_operations", "occupancy_operations",
    "mediator_placement_operations", "mediator_binding_operations",
    "productive_complex_operations", "verification_operations", "replacement_operations",
    "resynthesis_operations", "mediator_release_operations", "mediator_leak_operations",
  ].reduce((total, key) => total + resources[key], 0);

  const targetsCreated = outcomes.targets_initial + outcomes.target_arrivals
    + outcomes.target_resyntheses + outcomes.target_replacements;
  const targetsPresentEnd = slots.filter((slot) => slot.state !== "absent").length;
  const engineCapacity = p.engine_capacity_per_step * checked.horizon_steps;
  const mediatorCreated = mediatorArm ? p.mediator_inventory : 0;
  const inventory = freezeInventory(
    {
      created: targetsCreated,
      removed: outcomes.completed_removals,
      present_end: targetsPresentEnd,
    },
    {
      service_capacity: engineCapacity,
      service_used: engineServiceUsed,
      service_idle: engineCapacity - engineServiceUsed,
    },
    {
      created: mediatorCreated,
      free_end: freeMediators.length,
      bound_end: 0,
      consumed: mediatorsConsumed,
      leaked: mediatorsLeaked,
      verified_completion_counts: mediatorCompletionCounts,
    },
  );
  const targetConservation = inventory.target.created
    === inventory.target.removed + inventory.target.present_end;
  const engineConservation = inventory.engine.service_capacity
    === inventory.engine.service_used + inventory.engine.service_idle;
  const mediatorConservation = inventory.mediator.created
    === inventory.mediator.free_end + inventory.mediator.bound_end
      + inventory.mediator.consumed + inventory.mediator.leaked;
  const queueConservation = resources.queue_insert_operations
    === resources.queue_pop_operations + outcomes.queue_pending_end
      + outcomes.direct_capacity_misses;
  const expectedBytesRead = (resources.evidence_reads + resources.verification_operations)
      * checked.target_metadata_bytes
    + resources.queue_pop_operations * checked.queue_entry_bytes;
  const expectedBytesWritten = resources.queue_insert_operations * checked.queue_entry_bytes
    + (outcomes.target_arrivals + outcomes.target_resyntheses + outcomes.target_replacements)
      * checked.target_metadata_bytes;
  const resourceComplete = CMB_X01_RESOURCE_KEYS.every((key) => count(resources[key]))
    && queueConservation
    && resources.bytes_read === expectedBytesRead
    && resources.bytes_written === expectedBytesWritten
    && resources.registry_byte_steps
      === slots.length * checked.horizon_steps * checked.target_metadata_bytes
    && resources.suppression_byte_steps
      === (outcomes.harmful_suppression_steps + outcomes.useful_suppression_steps)
        * checked.suppression_state_bytes;
  const expectedReuse = mediatorCompletionCounts.reduce((total, completions) => total + Math.max(0, completions - 1), 0);
  const taskGate = outcomes.potential_service_nsu === 0
    || outcomes.accepted_service_nsu * 1_000_000
      >= outcomes.potential_service_nsu * checked.minimum_accepted_service_fraction_ppm;
  const harmGate = outcomes.harmful_target_steps * 1_000_000
      <= slots.length * checked.horizon_steps * checked.maximum_harmful_target_fraction_ppm
    && outcomes.harmful_misses_end * 1_000_000
      <= slots.length * checked.maximum_harmful_miss_fraction_ppm;
  const observedQueueTailGate = outcomes.queue_wait_p99_steps === null
    ? outcomes.queue_pending_end === 0
    : outcomes.queue_wait_p99_steps <= checked.maximum_queue_p99_steps;
  const pendingQueueGate = outcomes.queue_pending_end * 1_000_000
    <= slots.length * checked.maximum_queue_pending_fraction_ppm;
  const queueTailGate = observedQueueTailGate && pendingQueueGate;
  const protectedGate = outcomes.useful_target_deletions <= checked.maximum_useful_deletions
    && taskGate && harmGate && queueTailGate;
  const authorityHash = hash(world.public_contract.action_authority);

  return Object.freeze({
    paired_exogenous_sha256: pairedExogenousHash(seed, world, checked),
    policy_input_sha256: hash(policyViews),
    policy_action_sha256: hash(policyActions),
    policy_oracle_access: arm === "X01-ORACLE",
    action_authority_sha256: authorityHash,
    counterfactual_draw_domain: CMB_X01_COUNTERFACTUAL_DRAW_DOMAIN,
    mechanism: Object.freeze({
      perfect_evidence: p.evidence_sensitivity_ppm === 1_000_000
        && p.evidence_false_positive_ppm === 0 && p.evidence_delay_steps === 0,
      harmful_targets_possible: p.initial_harmful_ppm > 0 || p.arrival_harmful_ppm > 0
        || p.harmful_conversion_ppm > 0 || p.resynthesis_harmful_ppm > 0,
      engine_available: p.engine_capacity_per_step > 0,
      productive_geometry_possible: p.productive_geometry_ppm > 0,
      mediator_saturation: p.binary_saturation,
      resynthesis_enabled: p.resynthesis_ppm > 0,
      replacement_enabled: p.replacement_enabled,
      mediator_leakage_possible: p.mediator_leakage_ppm > 0,
      mediator_reuse_enabled: p.mediator_reuse_enabled,
    }),
    outcomes: Object.freeze(outcomes),
    resources: Object.freeze(resources),
    inventories: inventory,
    gates: Object.freeze({
      observation_evaluator_separation: arm !== "X01-ORACLE",
      destructive_action_authority_parity: engineServiceUsed <= engineCapacity,
      target_conservation_pass: targetConservation,
      engine_conservation_pass: engineConservation,
      mediator_conservation_pass: mediatorConservation,
      resource_ledger_complete: resourceComplete,
      task_gate_pass: taskGate,
      harm_gate_pass: harmGate,
      protected_gate_pass: protectedGate,
      queue_tail_gate_pass: queueTailGate,
      verified_mediator_reuse_pass: outcomes.verified_mediator_reuses === expectedReuse,
    }),
    process_metadata: Object.freeze({
      execution_model: "single-process-deterministic-aggregate-construction-simulation",
      maximum_concurrency: 1,
      aggregate_record_only: true,
      protocol_native_action_events_present: false,
      per_arm_cpu_time_measured: false,
      per_arm_wall_time_measured: false,
      per_arm_peak_memory_measured: false,
      measurement_boundary: "construction diagnostics exclude comparative timing and energy endpoints",
    }),
  });
}
