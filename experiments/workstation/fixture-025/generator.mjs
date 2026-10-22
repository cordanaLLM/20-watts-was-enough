import { createHash } from "node:crypto";

import { Pcg64Dxsm } from "../lib/pcg64-dxsm.mjs";

export { Pcg64Dxsm };

export const FIXTURE_025_GENERATOR_VERSION = "fixture-025.ecm-t03-generator.v1";

export const FIXTURE_025_CLASSES = Object.freeze([
  "valid-identifying",
  "valid-equivalent",
  "schema-provenance-invalid",
  "kk-inconsistent",
  "nonlinear-out-of-scope",
]);

export const FIXTURE_025_SENTINEL_INDICES = Object.freeze([0, 7, 15, 22, 30, 38, 45, 53, 60]);

export function publicSeedBytes(seed) {
  if (!Number.isSafeInteger(seed) || seed < 0 || seed > 0xffff_ffff) {
    throw new Error("Fixture 025 public seed must be an unsigned integer.");
  }
  const bytes = Buffer.alloc(8);
  bytes.writeBigUInt64LE(BigInt(seed));
  return bytes;
}

export function publicSeedHex(seed) {
  return publicSeedBytes(seed).toString("hex").toUpperCase();
}

export function fixture025StreamPreimage({ phase, protocol, seed, scope, canonicalId }) {
  if (!new Set(["development", "confirmation", "transfer", "ablation"]).has(phase)) {
    throw new Error("Fixture 025 stream phase is invalid.");
  }
  if (!/^ECM-T(?:0[1-9]|10)$/.test(protocol)) throw new Error("Fixture 025 stream protocol is invalid.");
  if (!new Set(["dgp", "observation", "arm-init", "action-outcome", "analysis"]).has(scope)) {
    throw new Error("Fixture 025 stream scope is invalid.");
  }
  if (!/^(0|[1-9][0-9]*)$/.test(String(canonicalId))) {
    throw new Error("Fixture 025 stream canonical ID must be unpadded ASCII decimal.");
  }
  return `F025-v1|${phase}|${protocol}|${publicSeedHex(seed)}|${scope}|${canonicalId}`;
}

function exactKeys(value, keys) {
  return value
    && typeof value === "object"
    && !Array.isArray(value)
    && JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort());
}

export function validateFixture025Config(config) {
  const keys = [
    "schema",
    "artifact",
    "profile",
    "worlds_per_seed",
    "frequency_count",
    "minimum_frequency_hz",
    "maximum_frequency_hz",
    "diagnostic_bundles_cap",
    "harmonic_ratio_threshold",
    "repeat_residual_threshold",
    "noise_fraction",
    "max_loss",
  ];
  if (
    !exactKeys(config, keys)
    || config.schema !== 1
    || config.artifact !== "fixture-025"
    || !new Set(["smoke", "development"]).has(config.profile)
    || !Number.isSafeInteger(config.worlds_per_seed)
    || config.worlds_per_seed < FIXTURE_025_CLASSES.length
    || config.worlds_per_seed > 100
    || config.worlds_per_seed % FIXTURE_025_CLASSES.length !== 0
    || config.frequency_count !== 61
    || config.minimum_frequency_hz !== 1e-3
    || config.maximum_frequency_hz !== 1e4
    || config.diagnostic_bundles_cap !== FIXTURE_025_SENTINEL_INDICES.length
    || !Number.isFinite(config.harmonic_ratio_threshold)
    || config.harmonic_ratio_threshold <= 0
    || config.harmonic_ratio_threshold >= 0.1
    || !Number.isFinite(config.repeat_residual_threshold)
    || config.repeat_residual_threshold <= 0
    || config.repeat_residual_threshold >= 1
    || !Number.isFinite(config.noise_fraction)
    || config.noise_fraction < 0
    || config.noise_fraction > 0.02
    || config.max_loss !== 100
  ) throw new Error("Fixture 025 configuration is invalid.");
  return config;
}

export function logspace(minimum, maximum, count) {
  if (!(minimum > 0) || !(maximum > minimum) || !Number.isSafeInteger(count) || count < 2) {
    throw new Error("logspace requires positive ordered bounds and at least two points.");
  }
  const start = Math.log(minimum);
  const step = (Math.log(maximum) - start) / (count - 1);
  return Object.freeze(Array.from({ length: count }, (_, index) => Math.exp(start + step * index)));
}

function complexAdd(left, right) {
  return { re: left.re + right.re, im: left.im + right.im };
}

function complexScale(value, scalar) {
  return { re: value.re * scalar, im: value.im * scalar };
}

function parallelRcImpedance(resistanceOhm, capacitanceF, omega) {
  const x = omega * resistanceOhm * capacitanceF;
  const denominator = 1 + x * x;
  return {
    re: resistanceOhm / denominator,
    im: -resistanceOhm * x / denominator,
  };
}

function warburgImpedance(sigma, omega) {
  const scale = sigma / Math.sqrt(2 * omega);
  return { re: scale, im: -scale };
}

export function terminalImpedance(parameters, frequencyHz) {
  const omega = 2 * Math.PI * frequencyHz;
  let impedance = { re: parameters.r0_ohm, im: 0 };
  for (const branch of parameters.branches) {
    impedance = complexAdd(impedance, parallelRcImpedance(branch.r_ohm, branch.c_f, omega));
  }
  if (parameters.warburg_sigma !== 0) {
    impedance = complexAdd(impedance, warburgImpedance(parameters.warburg_sigma, omega));
  }
  return impedance;
}

function canonicalSample(sample) {
  return JSON.stringify({
    ordinal: sample.ordinal,
    timestamp_s: sample.timestamp_s,
    frequency_hz: sample.frequency_hz,
    z_re_ohm: sample.z_re_ohm,
    z_im_ohm: sample.z_im_ohm,
    amplitude_v: sample.amplitude_v,
    unit_token: sample.unit_token,
    calibration_version: sample.calibration_version,
  });
}

export function sampleChecksum(sample) {
  return createHash("sha256").update(canonicalSample(sample)).digest("hex");
}

export function validateExposedSpectrum(samples) {
  if (!Array.isArray(samples) || samples.length !== 61) {
    return Object.freeze({ schema_valid: false, ordering_valid: false, checksum_valid: false, unit_valid: false, calibration_valid: false });
  }
  const orderingValid = samples.every((sample, index) => (
    sample.ordinal === index
    && (index === 0 || sample.timestamp_s > samples[index - 1].timestamp_s)
    && (index === 0 || sample.frequency_hz < samples[index - 1].frequency_hz)
  ));
  const checksumValid = samples.every((sample) => sample.checksum === sampleChecksum(sample));
  const unitValid = samples.every((sample) => sample.unit_token === "Ohm");
  const calibrationValid = samples.every((sample) => sample.calibration_version === "corrected-v2");
  return Object.freeze({
    schema_valid: orderingValid && checksumValid && unitValid && calibrationValid,
    ordering_valid: orderingValid,
    checksum_valid: checksumValid,
    unit_valid: unitValid,
    calibration_valid: calibrationValid,
  });
}

function drawParameters(random) {
  const order = 1 + Math.floor(random.uniform() * 4);
  const branches = [];
  for (let index = 0; index < order; index += 1) {
    branches.push(Object.freeze({
      r_ohm: random.logRange(0.01, 100),
      c_f: random.logRange(1e-5, 10),
    }));
  }
  return Object.freeze({
    circuit_order: order,
    r0_ohm: random.logRange(0.01, 100),
    branches: Object.freeze(branches),
    warburg_sigma: random.uniform() < 0.5 ? random.logRange(0.001, 10) : 0,
  });
}

function classFor(seed, worldIndex) {
  const offset = seed % FIXTURE_025_CLASSES.length;
  return FIXTURE_025_CLASSES[(worldIndex + offset) % FIXTURE_025_CLASSES.length];
}

function buildSamples({ frequencies, parameters, random, config, worldClass, worldIndex }) {
  const descending = [...frequencies].reverse();
  const samples = [];
  let timestamp = 0;
  const drift = worldClass === "kk-inconsistent" ? random.range(0.08, 0.25) : 0;
  const harmonicRatio = worldClass === "nonlinear-out-of-scope" ? random.range(0.015, 0.08) : random.range(0, 0.002);
  for (const [ordinal, frequency] of descending.entries()) {
    timestamp += Math.max(3 / frequency, 1);
    let impedance = terminalImpedance(parameters, frequency);
    const progression = ordinal / (descending.length - 1);
    if (worldClass === "kk-inconsistent") impedance = complexScale(impedance, 1 + drift * progression);
    if (worldClass === "nonlinear-out-of-scope") {
      impedance = complexScale(impedance, 1 - 0.3 * harmonicRatio);
    }
    const magnitude = Math.max(Math.hypot(impedance.re, impedance.im), 0.01);
    const sigma = config.noise_fraction * magnitude / Math.sqrt(2);
    const sample = {
      ordinal,
      timestamp_s: timestamp,
      frequency_hz: frequency,
      z_re_ohm: impedance.re + sigma * random.normal(),
      z_im_ohm: impedance.im + sigma * random.normal(),
      amplitude_v: 0.01,
      unit_token: "Ohm",
      calibration_version: "corrected-v2",
    };
    sample.checksum = sampleChecksum(sample);
    samples.push(sample);
  }

  let corruption = "none";
  if (worldClass === "schema-provenance-invalid") {
    const variants = ["timestamp-swap", "frequency-duplicate", "unit-token", "calibration-version"];
    corruption = variants[worldIndex % variants.length];
    if (corruption === "timestamp-swap") {
      [samples[10].timestamp_s, samples[11].timestamp_s] = [samples[11].timestamp_s, samples[10].timestamp_s];
      samples[10].checksum = sampleChecksum(samples[10]);
      samples[11].checksum = sampleChecksum(samples[11]);
    } else if (corruption === "frequency-duplicate") {
      samples[30].frequency_hz = samples[29].frequency_hz;
      samples[30].checksum = sampleChecksum(samples[30]);
    } else if (corruption === "unit-token") {
      samples[30].unit_token = "mOhm";
    } else {
      samples[30].calibration_version = "uncorrected-v1";
      samples[30].checksum = sampleChecksum(samples[30]);
    }
  }
  return Object.freeze({
    samples: Object.freeze(samples.map((sample) => Object.freeze(sample))),
    corruption,
    drift_fraction: drift,
    harmonic_ratio: harmonicRatio,
  });
}

export function diagnosticBundle(world, sentinelIndex) {
  if (!FIXTURE_025_SENTINEL_INDICES.includes(sentinelIndex)) {
    throw new Error("Fixture 025 diagnostic index is not registered.");
  }
  const sampleIndex = 60 - sentinelIndex;
  const observed = world.samples[sampleIndex];
  const base = terminalImpedance(world.parameters, observed.frequency_hz);
  const baseMagnitude = Math.max(Math.hypot(base.re, base.im), 1e-12);
  const repeatResidual = Math.hypot(observed.z_re_ohm - base.re, observed.z_im_ohm - base.im) / baseMagnitude;
  return Object.freeze({
    sentinel_index: sentinelIndex,
    frequency_hz: observed.frequency_hz,
    harmonic_ratio: world.harmonic_ratio,
    repeat_residual: repeatResidual,
    bytes: 176,
  });
}

export function generateFixture025Worlds({ seed, config }) {
  validateFixture025Config(config);
  if (!Number.isSafeInteger(seed) || seed < 0 || seed > 0xffff_ffff) {
    throw new Error("Fixture 025 seed must be an unsigned 32-bit integer.");
  }
  const frequencies = logspace(config.minimum_frequency_hz, config.maximum_frequency_hz, config.frequency_count);
  const worlds = [];
  for (let worldIndex = 0; worldIndex < config.worlds_per_seed; worldIndex += 1) {
    const random = new Pcg64Dxsm(fixture025StreamPreimage({
      phase: "development",
      protocol: "ECM-T03",
      seed,
      scope: "dgp",
      canonicalId: worldIndex,
    }));
    const worldClass = classFor(seed, worldIndex);
    const parameters = drawParameters(random);
    const generated = buildSamples({ frequencies, parameters, random, config, worldClass, worldIndex });
    worlds.push(Object.freeze({
      seed,
      world_index: worldIndex,
      world_class: worldClass,
      equivalent_graphs: worldClass === "valid-equivalent" ? 2 : 1,
      identifying: worldClass === "valid-identifying",
      parameters,
      ...generated,
    }));
  }
  return Object.freeze(worlds);
}
