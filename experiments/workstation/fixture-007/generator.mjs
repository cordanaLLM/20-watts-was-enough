import { mulberry32, normal } from "../lib/mulberry32.mjs";

export const FIXTURE_007_GENERATOR_VERSION = "fixture-007.null-space-generator.v1";

function requireConfig(config) {
  const exact = [
    "schema",
    "artifact",
    "profile",
    "opportunities_per_seed",
    "base_noise_std",
    "active_noise_std",
    "active_photons",
    "modeled_energy_j_per_active_observation",
  ];
  if (
    !config
    || typeof config !== "object"
    || Array.isArray(config)
    || JSON.stringify(Object.keys(config).sort()) !== JSON.stringify(exact.sort())
    || config.schema !== 1
    || config.artifact !== "fixture-007"
    || !new Set(["smoke", "development"]).has(config.profile)
    || !Number.isSafeInteger(config.opportunities_per_seed)
    || config.opportunities_per_seed < 16
    || !Number.isFinite(config.base_noise_std)
    || config.base_noise_std <= 0
    || !Number.isFinite(config.active_noise_std)
    || config.active_noise_std <= 0
    || !Number.isSafeInteger(config.active_photons)
    || config.active_photons < 1
    || !Number.isFinite(config.modeled_energy_j_per_active_observation)
    || config.modeled_energy_j_per_active_observation <= 0
  ) throw new Error("Fixture 007 configuration is invalid.");
  return config;
}

export function generateNullSpaceEpisodes({ seed, config }) {
  requireConfig(config);
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffff_ffff) {
    throw new Error("Fixture 007 seed must be an unsigned 32-bit integer.");
  }
  const random = mulberry32(seed);
  return Object.freeze(Array.from({ length: config.opportunities_per_seed }, (_, episode) => {
    const trueLabel = random() < 0.5 ? -1 : 1;
    const sharedCoordinate = normal(random);
    const baseObservation = sharedCoordinate + config.base_noise_std * normal(random);
    const activeObservation = trueLabel + config.active_noise_std * normal(random);
    return Object.freeze({
      seed,
      episode,
      true_label: trueLabel,
      base_observation: baseObservation,
      active_observation: activeObservation,
      operator_version: "rank-deficient-base-plus-hidden-axis-v1",
    });
  }));
}

export function validateFixture007Config(config) {
  return requireConfig(config);
}
