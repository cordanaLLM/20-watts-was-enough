import { Pcg64Dxsm } from "../lib/pcg64-dxsm.mjs";

export { Pcg64Dxsm };

export const FIXTURE_024_GENERATOR_VERSION = "fixture-024.linear-memory-generator.v1";

function exactKeys(value, keys) {
  return value
    && typeof value === "object"
    && !Array.isArray(value)
    && JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort());
}

export function validateFixture024Config(config) {
  const keys = [
    "schema",
    "artifact",
    "profile",
    "opportunities_per_seed",
    "time_step_s",
    "prefix_s",
    "horizon_s",
    "memory_window_s",
    "state_scale_u",
    "max_loss",
  ];
  if (
    !exactKeys(config, keys)
    || config.schema !== 1
    || config.artifact !== "fixture-024"
    || !new Set(["smoke", "development"]).has(config.profile)
    || !Number.isSafeInteger(config.opportunities_per_seed)
    || config.opportunities_per_seed < 1
    || config.opportunities_per_seed > 24
    || !Number.isFinite(config.time_step_s)
    || config.time_step_s <= 0
    || !Number.isFinite(config.prefix_s)
    || config.prefix_s <= 0
    || !Number.isFinite(config.horizon_s)
    || config.horizon_s <= config.prefix_s
    || !Number.isInteger(config.prefix_s / config.time_step_s)
    || !Number.isInteger(config.horizon_s / config.time_step_s)
    || !Number.isFinite(config.memory_window_s)
    || config.memory_window_s < config.time_step_s
    || !Number.isInteger(config.memory_window_s / config.time_step_s)
    || !Number.isFinite(config.state_scale_u)
    || config.state_scale_u <= 0
    || config.max_loss !== 100
  ) throw new Error("Fixture 024 configuration is invalid.");
  return config;
}

export function generateLinearMemorySystems({ seed, config }) {
  validateFixture024Config(config);
  if (!Number.isSafeInteger(seed) || seed < 0 || seed > 0xffff_ffff) {
    throw new Error("Fixture 024 seed must be an unsigned 32-bit integer.");
  }
  const random = new Pcg64Dxsm(seed);
  const systems = [];
  for (let systemIndex = 0; systemIndex < config.opportunities_per_seed; systemIndex += 1) {
    let accepted = null;
    for (let attempt = 0; attempt < 256; attempt += 1) {
      const alpha = random.logRange(0.25, 4);
      const lambda = random.logRange(0.25, 4);
      const beta = random.range(-1.5, 1.5);
      const gamma = random.range(-1.5, 1.5);
      const determinant = alpha * lambda - beta * gamma;
      const x0 = random.range(-2, 2);
      const y0 = random.range(-2, 2);
      if (determinant >= 0.15) {
        accepted = Object.freeze({
          seed,
          system_index: systemIndex,
          alpha_per_s: alpha,
          beta_per_s: beta,
          gamma_per_s: gamma,
          lambda_per_s: lambda,
          determinant_per_s2: determinant,
          x0_u: x0,
          y0_u: y0,
        });
        break;
      }
    }
    if (!accepted) throw new Error("Fixture 024 generator exhausted its stability rejection cap.");
    systems.push(accepted);
  }
  return Object.freeze(systems);
}

export function transitionMatrix(system, stepSeconds) {
  const a = -system.alpha_per_s;
  const b = system.beta_per_s;
  const c = system.gamma_per_s;
  const d = -system.lambda_per_s;
  const mean = (a + d) / 2;
  const halfDifference = (a - d) / 2;
  const discriminant = halfDifference * halfDifference + b * c;
  const envelope = Math.exp(mean * stepSeconds);
  let diagonalFactor;
  let offDiagonalFactor;
  if (Math.abs(discriminant) < 1e-18) {
    diagonalFactor = 1;
    offDiagonalFactor = stepSeconds;
  } else if (discriminant > 0) {
    const root = Math.sqrt(discriminant);
    diagonalFactor = Math.cosh(root * stepSeconds);
    offDiagonalFactor = Math.sinh(root * stepSeconds) / root;
  } else {
    const root = Math.sqrt(-discriminant);
    diagonalFactor = Math.cos(root * stepSeconds);
    offDiagonalFactor = Math.sin(root * stepSeconds) / root;
  }
  return Object.freeze([
    envelope * (diagonalFactor + offDiagonalFactor * halfDifference),
    envelope * offDiagonalFactor * b,
    envelope * offDiagonalFactor * c,
    envelope * (diagonalFactor - offDiagonalFactor * halfDifference),
  ]);
}

export function stepLinearState(matrix, state) {
  return Object.freeze([
    matrix[0] * state[0] + matrix[1] * state[1],
    matrix[2] * state[0] + matrix[3] * state[1],
  ]);
}
