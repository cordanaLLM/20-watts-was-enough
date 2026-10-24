import { createHash } from "node:crypto";

import { assertT01PolicyInput, assertT02PolicyInput } from "./policy-input.mjs";
import { exactKeys } from "../lib/exact-keys.mjs";
import { Pcg64Dxsm } from "../lib/pcg64-dxsm.mjs";

export { assertT01PolicyInput, assertT02PolicyInput } from "./policy-input.mjs";
export { Pcg64Dxsm };

export const FIXTURE_023_GENERATOR_VERSION = "fixture-023.plm-development-generator.v3";

export function fixture023OpaqueWorldId(track, seed, worldIndex) {
  if (!new Set(["PLM-T01", "PLM-T02"]).has(track)) throw new Error("Unknown Fixture 023 track.");
  seedGuard(seed);
  if (!Number.isSafeInteger(worldIndex) || worldIndex < 0) {
    throw new Error("Fixture 023 world index must be a nonnegative integer.");
  }
  return `w23_${createHash("sha256")
    .update(`fixture-023-public-world-v3|${track}|${seed}|${worldIndex}`, "utf8")
    .digest("hex").slice(0, 32)}`;
}

export function validateFixture023Config(config) {
  const keys = [
    "schema",
    "artifact",
    "profile",
    "tracks",
    "t01_episodes_per_seed",
    "t01_steps_per_episode",
    "t01_decision_center_s",
    "t01_decision_scale_s",
    "t01_flip_probability",
    "t01_missing_probability",
    "t01_latches",
    "t01_latch_hazard",
    "t02_lifecycles_per_seed",
    "t02_tasks_per_lifecycle",
    "t02_feature_dimensions",
    "state_budget_bytes",
    "operation_budget_per_world",
    "max_loss",
  ];
  if (
    !exactKeys(config, keys)
    || config.schema !== 1
    || config.artifact !== "fixture-023"
    || !new Set(["smoke", "development"]).has(config.profile)
    || JSON.stringify(config.tracks) !== JSON.stringify(["PLM-T01", "PLM-T02"])
    || !Number.isSafeInteger(config.t01_episodes_per_seed)
    || config.t01_episodes_per_seed < 4
    || config.t01_episodes_per_seed > 64
    || !Number.isSafeInteger(config.t01_steps_per_episode)
    || config.t01_steps_per_episode < 64
    || config.t01_steps_per_episode > 192
    || !Number.isFinite(config.t01_decision_center_s)
    || config.t01_decision_center_s <= 0
    || !Number.isFinite(config.t01_decision_scale_s)
    || config.t01_decision_scale_s <= 0
    || !Number.isFinite(config.t01_flip_probability)
    || config.t01_flip_probability < 0
    || config.t01_flip_probability > 0.2
    || !Number.isFinite(config.t01_missing_probability)
    || config.t01_missing_probability < 0
    || config.t01_missing_probability > 0.15
    || !Number.isSafeInteger(config.t01_latches)
    || config.t01_latches < 16
    || config.t01_latches > 192
    || !Number.isFinite(config.t01_latch_hazard)
    || config.t01_latch_hazard <= 0
    || config.t01_latch_hazard > 0.2
    || !Number.isSafeInteger(config.t02_lifecycles_per_seed)
    || config.t02_lifecycles_per_seed < 4
    || config.t02_lifecycles_per_seed > 96
    || !Number.isSafeInteger(config.t02_tasks_per_lifecycle)
    || config.t02_tasks_per_lifecycle < 8
    || config.t02_tasks_per_lifecycle > 128
    || config.t02_tasks_per_lifecycle % 2 !== 0
    || config.t02_feature_dimensions !== 8
    || config.state_budget_bytes !== 256
    || !Number.isSafeInteger(config.operation_budget_per_world)
    || config.operation_budget_per_world < 10000
    || config.max_loss !== 100
  ) throw new Error("Fixture 023 configuration is invalid.");
  return config;
}

function logistic(value) {
  if (value >= 0) return 1 / (1 + Math.exp(-value));
  const exponential = Math.exp(value);
  return exponential / (1 + exponential);
}

function seedGuard(seed) {
  if (!Number.isSafeInteger(seed) || seed < 0 || seed > 0xffff_ffff) {
    throw new Error("Fixture 023 seed must be an unsigned 32-bit integer.");
  }
}

const T01_CELLS = Object.freeze([
  "uninterrupted-low-noise",
  "interrupted-low-noise",
  "interrupted-high-noise",
  "interrupted-aligned-missing",
]);

export function generateT01Episodes({ seed, config }) {
  validateFixture023Config(config);
  seedGuard(seed);
  const random = new Pcg64Dxsm(`PLM-T01|${seed}`);
  const episodes = [];
  const offsets = [-20, -8, 8, 20];
  for (let episodeIndex = 0; episodeIndex < config.t01_episodes_per_seed; episodeIndex += 1) {
    const cell = T01_CELLS[episodeIndex % T01_CELLS.length];
    const steps = config.t01_steps_per_episode;
    const intended = Math.max(8, Math.min(
      steps - 8,
      Math.round(config.t01_decision_center_s + offsets[episodeIndex % offsets.length] + 5 * random.gaussian()),
    ));
    const hidden = Array.from({ length: steps }, (_, index) => (index >= 4 && index < 4 + intended ? 1 : 0));
    if (cell !== "uninterrupted-low-noise") {
      const gaps = cell === "interrupted-high-noise" ? 3 : 2;
      for (let gap = 0; gap < gaps; gap += 1) {
        const begin = 8 + random.boundedInteger(Math.max(1, intended - 12));
        const length = 2 + random.boundedInteger(5);
        for (let index = begin; index < Math.min(steps, begin + length); index += 1) hidden[index] = 0;
      }
    }
    const flipProbability = cell === "interrupted-high-noise" ? 0.18 : config.t01_flip_probability / 2;
    const observations = [];
    let hiddenDurationS = 0;
    for (let index = 0; index < steps; index += 1) {
      hiddenDurationS += hidden[index];
      const alignedMissing = cell === "interrupted-aligned-missing" && hidden[index] === 0;
      const missing = random.uniform() < (alignedMissing ? 0.35 : config.t01_missing_probability);
      if (missing) {
        observations.push(null);
      } else {
        observations.push(random.uniform() < flipProbability ? 1 - hidden[index] : hidden[index]);
      }
    }
    const targetProbability = logistic(
      (hiddenDurationS - config.t01_decision_center_s) / config.t01_decision_scale_s,
    );
    const targetLabel = random.uniform() < targetProbability ? 1 : 0;
    episodes.push(Object.freeze({
      seed,
      world_index: episodeIndex,
      world_id: fixture023OpaqueWorldId("PLM-T01", seed, episodeIndex),
      intervention_cell: cell,
      observations: Object.freeze(observations),
      hidden_duration_s: hiddenDurationS,
      target_probability: targetProbability,
      target_label: targetLabel,
    }));
  }
  return Object.freeze(episodes);
}

function dot(left, right) {
  let total = 0;
  for (let index = 0; index < left.length; index += 1) total += left[index] * right[index];
  return total;
}

function makeTasks(random, theta, count, dimensions) {
  const tasks = [];
  for (let taskIndex = 0; taskIndex < count; taskIndex += 1) {
    const features = Array.from({ length: dimensions }, () => random.gaussian());
    const probability = logistic(dot(features, theta));
    tasks.push(Object.freeze({
      features: Object.freeze(features),
      label: random.uniform() < probability ? 1 : 0,
      evaluator_probability: probability,
    }));
  }
  return Object.freeze(tasks);
}

const BOUNDARY_CELLS = Object.freeze(["authentic", "duplicate", "delayed", "missing"]);
const RHO_CELLS = Object.freeze([0, 0.3, 0.7, 0.95]);

export function generateT02Lifecycles({ seed, config }) {
  validateFixture023Config(config);
  seedGuard(seed);
  const random = new Pcg64Dxsm(`PLM-T02|${seed}`);
  const lifecycles = [];
  for (let lifecycleIndex = 0; lifecycleIndex < config.t02_lifecycles_per_seed; lifecycleIndex += 1) {
    const previousTheta = Array.from(
      { length: config.t02_feature_dimensions },
      () => random.gaussian(),
    );
    const rho = RHO_CELLS[lifecycleIndex % RHO_CELLS.length];
    const innovationScale = Math.sqrt(1 - rho * rho);
    const currentTheta = previousTheta.map(
      (value) => rho * value + innovationScale * random.gaussian(),
    );
    const boundaryState = BOUNDARY_CELLS[lifecycleIndex % BOUNDARY_CELLS.length];
    lifecycles.push(Object.freeze({
      seed,
      world_index: lifecycleIndex,
      world_id: fixture023OpaqueWorldId("PLM-T02", seed, lifecycleIndex),
      intervention_cell: `rho-${rho.toFixed(2)}|boundary-${boundaryState}`,
      boundary_state: boundaryState,
      boundary_authenticated: boundaryState === "authentic",
      previous_tasks: makeTasks(
        random,
        previousTheta,
        config.t02_tasks_per_lifecycle,
        config.t02_feature_dimensions,
      ),
      current_tasks: makeTasks(
        random,
        currentTheta,
        config.t02_tasks_per_lifecycle,
        config.t02_feature_dimensions,
      ),
    }));
  }
  return Object.freeze(lifecycles);
}

export function projectT01PolicyInput(world) {
  return Object.freeze(assertT01PolicyInput({
    schema: 1,
    artifact: "fixture-023",
    track: "PLM-T01",
    world_id: world.world_id,
    observations: Object.freeze([...world.observations]),
  }));
}

function visibleTask(task) {
  return Object.freeze({
    features: Object.freeze([...task.features]),
    label: task.label,
  });
}

export function projectT02PolicyInput(world) {
  const split = world.current_tasks.length / 2;
  return Object.freeze(assertT02PolicyInput({
    schema: 1,
    artifact: "fixture-023",
    track: "PLM-T02",
    world_id: world.world_id,
    boundary_event: Object.freeze({
      state: world.boundary_state,
      authenticated: world.boundary_authenticated,
    }),
    previous_tasks: Object.freeze(world.previous_tasks.map(visibleTask)),
    adaptation_tasks: Object.freeze(world.current_tasks.slice(0, split).map(visibleTask)),
    evaluation_features: Object.freeze(world.current_tasks.slice(split).map((task) => (
      Object.freeze([...task.features])
    ))),
  }));
}
