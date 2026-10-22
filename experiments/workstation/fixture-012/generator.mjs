import { mulberry32, normal } from "../lib/mulberry32.mjs";

export const FIXTURE_012_GENERATOR_VERSION = "fixture-012.layout-population-generator.v1";

const configKeys = Object.freeze([
  "schema",
  "artifact",
  "profile",
  "opportunities_per_seed",
  "studies_per_seed",
  "layouts_per_study",
  "invocations_per_layout",
  "repeats_per_invocation",
  "base_latency_ns",
  "layout_interaction_fraction",
  "layout_offset_fraction",
  "process_noise_fraction",
  "repeat_noise_fraction",
  "order_carryover_fraction",
  "speedup_threshold_fraction",
  "null_tolerance_fraction",
  "modeled_work_units_per_observation",
  "modeled_energy_j_per_observation",
]);

function exactKeys(value, keys) {
  return value
    && typeof value === "object"
    && !Array.isArray(value)
    && JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort());
}

function requireFraction(value, { positive = false } = {}) {
  return Number.isFinite(value) && (positive ? value > 0 : value >= 0) && value < 1;
}

function requireConfig(config) {
  if (
    !exactKeys(config, configKeys)
    || config.schema !== 1
    || config.artifact !== "fixture-012"
    || !new Set(["smoke", "development"]).has(config.profile)
    || !Number.isSafeInteger(config.opportunities_per_seed)
    || config.opportunities_per_seed < 2
    || !Number.isSafeInteger(config.studies_per_seed)
    || config.studies_per_seed < 2
    || config.studies_per_seed !== config.opportunities_per_seed
    || !Number.isSafeInteger(config.layouts_per_study)
    || config.layouts_per_study < 4
    || config.layouts_per_study % 2 !== 0
    || !Number.isSafeInteger(config.invocations_per_layout)
    || config.invocations_per_layout < 1
    || !Number.isSafeInteger(config.repeats_per_invocation)
    || config.repeats_per_invocation < 1
    || !Number.isSafeInteger(config.base_latency_ns)
    || config.base_latency_ns < 1000
    || !requireFraction(config.layout_interaction_fraction, { positive: true })
    || !requireFraction(config.layout_offset_fraction)
    || !requireFraction(config.process_noise_fraction)
    || !requireFraction(config.repeat_noise_fraction)
    || !requireFraction(config.order_carryover_fraction)
    || !requireFraction(config.speedup_threshold_fraction, { positive: true })
    || !requireFraction(config.null_tolerance_fraction, { positive: true })
    || config.null_tolerance_fraction >= config.layout_interaction_fraction
    || !Number.isSafeInteger(config.modeled_work_units_per_observation)
    || config.modeled_work_units_per_observation < 1
    || !Number.isFinite(config.modeled_energy_j_per_observation)
    || config.modeled_energy_j_per_observation <= 0
  ) throw new Error("Fixture 012 configuration is invalid.");
  return config;
}

function latency({
  config,
  layout,
  variant,
  runPosition,
  processNoise,
  repeatNoise,
}) {
  const centeredLayout = config.layouts_per_study === 1
    ? 0
    : (2 * layout - (config.layouts_per_study - 1)) / (config.layouts_per_study - 1);
  const layoutOffset = config.base_latency_ns * config.layout_offset_fraction * centeredLayout;
  const interactionSign = layout % 2 === 0 ? -1 : 1;
  const candidateInteraction = variant === "candidate"
    ? config.base_latency_ns * config.layout_interaction_fraction * interactionSign
    : 0;
  const carryover = runPosition === 1
    ? config.base_latency_ns * config.order_carryover_fraction
    : 0;
  const value = config.base_latency_ns
    + layoutOffset
    + candidateInteraction
    + processNoise
    + repeatNoise
    + carryover;
  return Math.max(1, Math.round(value));
}

function randomizedObservations(seed, study, config) {
  const random = mulberry32((seed ^ Math.imul(study + 1, 0x9e3779b1) ^ 0x51ed270b) >>> 0);
  const observations = [];
  for (let layout = 0; layout < config.layouts_per_study; layout += 1) {
    for (let invocation = 0; invocation < config.invocations_per_layout; invocation += 1) {
      const processNoise = normal(random) * config.base_latency_ns * config.process_noise_fraction;
      for (let repeat = 0; repeat < config.repeats_per_invocation; repeat += 1) {
        const candidateFirst = (layout + invocation + repeat) % 2 === 0;
        const order = candidateFirst ? ["candidate", "baseline"] : ["baseline", "candidate"];
        for (let runPosition = 0; runPosition < order.length; runPosition += 1) {
          const variant = order[runPosition];
          const repeatNoise = normal(random) * config.base_latency_ns * config.repeat_noise_fraction;
          observations.push(Object.freeze({
            observation_id: `randomized-s${study}-l${layout}-i${invocation}-r${repeat}-${variant}`,
            layout_slot: layout,
            layout_id: layout,
            invocation,
            repeat,
            variant,
            run_position: runPosition,
            latency_ns: latency({
              config,
              layout,
              variant,
              runPosition,
              processNoise,
              repeatNoise,
            }),
          }));
        }
      }
    }
  }
  return Object.freeze(observations);
}

function fixedObservations(seed, study, config) {
  const random = mulberry32((seed ^ Math.imul(study + 1, 0x85ebca6b) ^ 0xc2b2ae35) >>> 0);
  const observations = [];
  for (let layoutSlot = 0; layoutSlot < config.layouts_per_study; layoutSlot += 1) {
    for (let invocation = 0; invocation < config.invocations_per_layout; invocation += 1) {
      const processNoise = normal(random) * config.base_latency_ns * config.process_noise_fraction;
      for (let repeat = 0; repeat < config.repeats_per_invocation; repeat += 1) {
        for (const [runPosition, variant] of ["candidate", "baseline"].entries()) {
          const repeatNoise = normal(random) * config.base_latency_ns * config.repeat_noise_fraction;
          observations.push(Object.freeze({
            observation_id: `fixed-s${study}-l${layoutSlot}-i${invocation}-r${repeat}-${variant}`,
            layout_slot: layoutSlot,
            layout_id: 0,
            invocation,
            repeat,
            variant,
            run_position: runPosition,
            latency_ns: latency({
              config,
              layout: 0,
              variant,
              runPosition,
              processNoise,
              repeatNoise,
            }),
          }));
        }
      }
    }
  }
  return Object.freeze(observations);
}

export function generateLayoutStudy({ seed, study, config }) {
  requireConfig(config);
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffff_ffff) {
    throw new Error("Fixture 012 seed must be an unsigned 32-bit integer.");
  }
  if (!Number.isSafeInteger(study) || study < 0 || study >= config.studies_per_seed) {
    throw new Error("Fixture 012 study index is outside the configured profile.");
  }
  return Object.freeze({
    seed,
    study,
    true_population_effect_fraction: 0,
    fixed: fixedObservations(seed, study, config),
    randomized: randomizedObservations(seed, study, config),
  });
}

export function validateFixture012Config(config) {
  return requireConfig(config);
}
