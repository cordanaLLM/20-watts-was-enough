import { createHash } from "node:crypto";

import {
  formatSeedHex,
  formatStreamPreimage,
} from "../lib/stream-seed.mjs";
import { exactKeys } from "../lib/exact-keys.mjs";

export const FIXTURE_026_GENERATOR_VERSION = "fixture-026.rsd-t01-generator.v2";
export const FIXTURE_026_RNG_CONTRACT = Object.freeze({
  family: "PCG-CM-DXSM 128/64",
  state_bits: 128,
  output_bits: 64,
  transition_multiplier_hex: "0xda942042e4dd58b5",
  output_permutation: "DXSM applied to the pre-transition 128-bit state",
  seeding: "custom SHA-256-derived 128-bit state and odd 128-bit increment",
  public_seed_grammar: "canonical decimal-string uint64 encoded as eight little-endian bytes",
  numpy_seedsequence_compatible: false,
});
export const FIXTURE_026_VALID_FAMILIES = Object.freeze([
  "exact-scale-symmetry",
  "approximate-scale-symmetry",
  "endpoint-return-lookalike",
  "equal-peak-delayed-trajectory",
  "static-ratio",
]);
export const FIXTURE_026_GENERATOR_FAMILIES = Object.freeze([
  ...FIXTURE_026_VALID_FAMILIES,
  "malformed-sentinel",
]);
export const FIXTURE_026_HISTORY_FAMILIES = Object.freeze([
  "step",
  "pulse",
  "ramp",
  "band-limited-stochastic",
]);
export const FIXTURE_026_MALFORMED_SENTINELS = Object.freeze([
  "time-order",
  "checksum",
  "unit-token",
  "future-normalization",
]);
export const FIXTURE_026_VALID_CELLS_PER_SEED = FIXTURE_026_VALID_FAMILIES.length
  * FIXTURE_026_HISTORY_FAMILIES.length;
export const FIXTURE_026_WORLDS_PER_SEED = FIXTURE_026_VALID_CELLS_PER_SEED
  + FIXTURE_026_MALFORMED_SENTINELS.length;

const MASK_64 = (1n << 64n) - 1n;
const MASK_128 = (1n << 128n) - 1n;
const UINT64_MAX = MASK_64;
const PCG_CM_DXSM_MULTIPLIER = 0xda942042e4dd58b5n;
const TWO_POW_53 = 9007199254740992;

function littleEndianBigInt(bytes) {
  let value = 0n;
  for (let index = bytes.length - 1; index >= 0; index -= 1) value = (value << 8n) | BigInt(bytes[index]);
  return value;
}

export class PcgCmDxsm12864 {
  constructor(literalSeed) {
    const digest = createHash("sha256").update(String(literalSeed), "utf8").digest();
    const initialState = littleEndianBigInt(digest.subarray(0, 16));
    const selector = littleEndianBigInt(digest.subarray(16, 32));
    this.increment = ((selector << 1n) | 1n) & MASK_128;
    this.state = 0n;
    this.advance();
    this.state = (this.state + initialState) & MASK_128;
    this.advance();
  }

  advance() {
    this.state = (this.state * PCG_CM_DXSM_MULTIPLIER + this.increment) & MASK_128;
  }

  nextUint64() {
    const old = this.state;
    this.advance();
    let high = (old >> 64n) & MASK_64;
    const low = (old & MASK_64) | 1n;
    high ^= high >> 32n;
    high = (high * PCG_CM_DXSM_MULTIPLIER) & MASK_64;
    high ^= high >> 48n;
    return (high * low) & MASK_64;
  }

  uniform() {
    return Number(this.nextUint64() >> 11n) / TWO_POW_53;
  }

  range(minimum, maximum) {
    return minimum + (maximum - minimum) * this.uniform();
  }
}

export function parseFixture026PublicSeed(seed) {
  if (typeof seed !== "string" || !/^(0|[1-9][0-9]{0,19})$/u.test(seed)) {
    throw new Error("Fixture 026 public seed must be a canonical decimal-string uint64.");
  }
  const value = BigInt(seed);
  if (value > UINT64_MAX) {
    throw new Error("Fixture 026 public seed exceeds uint64.");
  }
  return value;
}

export function publicSeedBytes(seed) {
  const value = parseFixture026PublicSeed(seed);
  const bytes = Buffer.alloc(8);
  bytes.writeBigUInt64LE(value);
  return bytes;
}

const FIXTURE_026_SCOPES = Object.freeze(new Set([
  "dgp",
  "observation",
  "policy",
  "evaluation",
  "analysis",
]));

export function publicSeedHex(seed) {
  return formatSeedHex(publicSeedBytes(seed));
}

export function fixture026StreamPreimage({ phase, protocol, seed, scope, canonicalId }) {
  return formatStreamPreimage({
    version: "F026-v2",
    phase,
    protocol,
    seedHex: publicSeedHex(seed),
    scope,
    canonicalId,
    label: "Fixture 026",
    isValidProtocol: (candidate) => candidate === "RSD-T01",
    validScopes: FIXTURE_026_SCOPES,
  });
}

export function validateFixture026Config(config) {
  const keys = [
    "schema", "artifact", "profile", "worlds_per_seed", "time_step_s", "horizon_s",
    "trajectory_quadrature", "exact_discrepancy_tolerance", "approximate_discrepancy_floor",
    "approximate_discrepancy_ceiling", "endpoint_tolerance", "peak_tolerance",
    "tail_window_s", "input_floor_u", "output_scale_y", "max_loss",
  ];
  if (
    !exactKeys(config, keys)
    || config.schema !== 2
    || config.artifact !== "fixture-026"
    || !new Set(["smoke", "development"]).has(config.profile)
    || !Number.isSafeInteger(config.worlds_per_seed)
    || config.worlds_per_seed !== FIXTURE_026_WORLDS_PER_SEED
    || config.time_step_s !== 0.02
    || config.horizon_s !== 4
    || config.trajectory_quadrature !== "trapezoid"
    || config.exact_discrepancy_tolerance !== 1e-12
    || config.approximate_discrepancy_floor !== 0.01
    || config.approximate_discrepancy_ceiling !== 0.06
    || config.endpoint_tolerance !== 1e-12
    || config.peak_tolerance !== 1e-12
    || config.tail_window_s !== 0.5
    || config.input_floor_u !== 0.05
    || config.output_scale_y !== 1
    || config.max_loss !== 100
  ) throw new Error("Fixture 026 configuration is invalid.");
  return config;
}

function deterministicHistoryRatio(family, timeS) {
  if (family === "step") return timeS < 0.5 ? 1 : 2;
  if (family === "pulse") return timeS >= 0.5 && timeS < 2.4 ? 2 : 1;
  if (family === "ramp") {
    if (timeS < 0.5) return 1;
    if (timeS < 2.5) return 1 + (timeS - 0.5) / 2;
    return 2;
  }
  throw new Error(`Fixture 026 deterministic history family ${family} is invalid.`);
}

function historyRatios(family, times, horizonS, random) {
  if (family !== "band-limited-stochastic") {
    return times.map((timeS) => deterministicHistoryRatio(family, timeS));
  }
  const harmonics = [1, 2, 3, 4].map((frequency) => Object.freeze({
    frequency,
    amplitude: random.range(0.035, 0.095),
    phase: random.range(0, 2 * Math.PI),
  }));
  return times.map((timeS) => {
    const activeEndS = horizonS - 1.4;
    if (timeS >= activeEndS) return 1;
    const envelope = Math.sin(Math.PI * timeS / activeEndS) ** 2;
    const bandLimitedDraw = harmonics.reduce((sum, term) => (
      sum + term.amplitude * Math.sin(
        2 * Math.PI * term.frequency * timeS / activeEndS + term.phase
      )
    ), 0);
    return 1 + envelope * (0.42 + bandLimitedDraw);
  });
}

function normalizedDynamicTrace(ratios, dt, tauS) {
  let reference = 1;
  return ratios.map((ratio, index) => {
    if (index > 0) reference += dt * (ratios[index - 1] - reference) / tauS;
    return Math.log(ratio / reference);
  });
}

function finiteMemoryHighPass(ratios, lagSamples) {
  if (!Number.isSafeInteger(lagSamples) || lagSamples < 1) {
    throw new Error("Fixture 026 finite-memory lag must be a positive sample count.");
  }
  return ratios.map((ratio, index) => {
    const past = ratios[Math.max(0, index - lagSamples)];
    return Math.log(ratio / past);
  });
}

function causalDelay(values, delaySamples) {
  if (!Number.isSafeInteger(delaySamples) || delaySamples < 1) {
    throw new Error("Fixture 026 causal delay must be a positive sample count.");
  }
  const prestimulus = values[0];
  return values.map((_, index) => (
    index < delaySamples ? prestimulus : values[index - delaySamples]
  ));
}

export function generateFixture026CausalLookalikePair({
  generatorFamily,
  ratios,
  timeStepS,
  endpointGainIncrement = null,
  endpointBaseLagS = null,
  endpointScaledLagS = null,
  equalPeakCommonGain = null,
  equalPeakMemoryLagS = null,
  equalPeakDelayS = null,
}) {
  if (
    !new Set(["endpoint-return-lookalike", "equal-peak-delayed-trajectory"])
      .has(generatorFamily)
    || !Array.isArray(ratios)
    || ratios.length < 2
    || ratios.some((ratio) => !Number.isFinite(ratio) || ratio <= 0)
    || timeStepS !== 0.02
  ) throw new Error("Fixture 026 causal lookalike request is invalid.");
  if (generatorFamily === "endpoint-return-lookalike") {
    if (
      !Number.isFinite(endpointGainIncrement)
      || endpointGainIncrement <= 0
      || endpointBaseLagS !== 0.4
      || endpointScaledLagS !== 0.8
      || equalPeakCommonGain !== null
      || equalPeakMemoryLagS !== null
      || equalPeakDelayS !== null
    ) throw new Error("Fixture 026 endpoint-return parameters are invalid.");
    return Object.freeze({
      base: Object.freeze(finiteMemoryHighPass(ratios, Math.round(endpointBaseLagS / timeStepS))),
      scaled: Object.freeze(finiteMemoryHighPass(ratios, Math.round(endpointScaledLagS / timeStepS))
        .map((value) => value * (1 + endpointGainIncrement))),
    });
  }
  if (
    endpointGainIncrement !== null
    || endpointBaseLagS !== null
    || endpointScaledLagS !== null
    || !Number.isFinite(equalPeakCommonGain)
    || equalPeakCommonGain <= 0
    || equalPeakMemoryLagS !== 0.6
    || equalPeakDelayS !== 0.3
  ) throw new Error("Fixture 026 equal-peak parameters are invalid.");
  const base = finiteMemoryHighPass(ratios, Math.round(equalPeakMemoryLagS / timeStepS))
    .map((value) => value * equalPeakCommonGain);
  return Object.freeze({
    base: Object.freeze(base),
    scaled: Object.freeze(causalDelay(base, Math.round(equalPeakDelayS / timeStepS))),
  });
}

function rmse(left, right, scale = 1) {
  let squared = 0;
  for (let index = 0; index < left.length; index += 1) {
    const error = (left[index] - right[index]) / scale;
    squared += error * error;
  }
  return Math.sqrt(squared / left.length);
}

function trapezoidRmse(left, right, scale, dt) {
  let integral = 0;
  for (let index = 0; index < left.length; index += 1) {
    const error = (left[index] - right[index]) / scale;
    const weight = index === 0 || index === left.length - 1 ? 0.5 : 1;
    integral += weight * error * error * dt;
  }
  const duration = (left.length - 1) * dt;
  return Math.sqrt(integral / duration);
}

function maximumAbsoluteDepartureWithIndex(values) {
  const baseline = values[0];
  let value = -Infinity;
  let index = -1;
  for (const [candidateIndex, candidate] of values.entries()) {
    const departure = Math.abs(candidate - baseline);
    if (departure > value) {
      value = departure;
      index = candidateIndex;
    }
  }
  return { value, index };
}

export function computeTrajectoryDiagnostics(trace, config) {
  if (!Array.isArray(trace) || trace.length < 2) throw new Error("Fixture 026 trajectory is missing.");
  const base = trace.map((sample) => sample.output_base_y);
  const scaled = trace.map((sample) => sample.output_scaled_y);
  const staticBase = trace.map((sample) => Math.log(
    Object.hasOwn(sample, "input_ratio")
      ? sample.input_ratio
      : sample.input_base_u / sample.background_base_u
  ));
  const staticScaled = trace.map((sample) => Math.log(
    Object.hasOwn(sample, "input_ratio")
      ? sample.input_ratio
      : sample.input_scaled_u / sample.background_scaled_u
  ));
  const basePeak = maximumAbsoluteDepartureWithIndex(base);
  const scaledPeak = maximumAbsoluteDepartureWithIndex(scaled);
  const tailCount = Math.round(config.tail_window_s / config.time_step_s) + 1;
  const baseTail = base.slice(-tailCount);
  const scaledTail = scaled.slice(-tailCount);
  return Object.freeze({
    trajectory_discrepancy: trapezoidRmse(base, scaled, config.output_scale_y, config.time_step_s),
    peak_discrepancy: Math.abs(basePeak.value - scaledPeak.value),
    endpoint_discrepancy: Math.abs(base.at(-1) - scaled.at(-1)),
    tail_discrepancy: rmse(baseTail, scaledTail, config.output_scale_y),
    latency_discrepancy_s: Math.abs(basePeak.index - scaledPeak.index) * config.time_step_s,
    static_fit_rmse: 0.5 * (
      trapezoidRmse(base, staticBase, config.output_scale_y, config.time_step_s)
      + trapezoidRmse(scaled, staticScaled, config.output_scale_y, config.time_step_s)
    ),
  });
}

export function computeFixture026SemanticProperties(trace, config) {
  const diagnostics = computeTrajectoryDiagnostics(trace, config);
  const base = trace.map((sample) => sample.output_base_y);
  const scaled = trace.map((sample) => sample.output_scaled_y);
  const pairedTrajectoryMatch = diagnostics.trajectory_discrepancy
    <= config.exact_discrepancy_tolerance
    ? "exact"
    : diagnostics.trajectory_discrepancy <= config.approximate_discrepancy_ceiling
      ? "approximate"
      : "absent";
  const supportInside = trace.every((sample) => (
    sample.input_base_u >= config.input_floor_u
    && sample.input_scaled_u >= config.input_floor_u
    && sample.background_base_u >= config.input_floor_u
    && sample.background_scaled_u >= config.input_floor_u
  ));
  if (!supportInside) throw new Error("Fixture 026 semantic vector requires an inside-support trace.");
  return Object.freeze({
    paired_trajectory_match: pairedTrajectoryMatch,
    finite_horizon_endpoint_return: Math.abs(base.at(-1) - base[0]) <= config.endpoint_tolerance
      && Math.abs(scaled.at(-1) - scaled[0]) <= config.endpoint_tolerance,
    peak_amplitude_equal: diagnostics.peak_discrepancy <= config.peak_tolerance,
    causal_memory_status: "unassessed",
    support_membership: "inside",
  });
}

function samplePayload(sample) {
  return JSON.stringify({
    ordinal: sample.ordinal,
    time_s: sample.time_s,
    input_base_u: sample.input_base_u,
    input_scaled_u: sample.input_scaled_u,
    background_base_u: sample.background_base_u,
    background_scaled_u: sample.background_scaled_u,
    output_base_y: sample.output_base_y,
    output_scaled_y: sample.output_scaled_y,
    input_unit_token: sample.input_unit_token,
    output_unit_token: sample.output_unit_token,
    interface_version: sample.interface_version,
    reference_origin: sample.reference_origin,
  });
}

export function observationChecksum(sample) {
  return createHash("sha256").update(samplePayload(sample)).digest("hex");
}

function validTrace({
  config,
  background,
  scaleFactor,
  generatorFamily,
  parameters,
  historyFamily,
  historyRandom,
}) {
  const count = Math.round(config.horizon_s / config.time_step_s);
  const times = Array.from({ length: count + 1 }, (_, ordinal) => ordinal * config.time_step_s);
  const ratios = historyRatios(historyFamily, times, config.horizon_s, historyRandom);
  let base;
  let scaled;
  if (generatorFamily === "static-ratio") {
    base = ratios.map((ratio) => Math.log(ratio));
    scaled = [...base];
  } else if (new Set(["exact-scale-symmetry", "approximate-scale-symmetry"])
    .has(generatorFamily)) {
    const dynamic = normalizedDynamicTrace(
      ratios,
      config.time_step_s,
      parameters.causal_reference_tau_s,
    );
    base = dynamic;
    scaled = dynamic;
    if (generatorFamily === "approximate-scale-symmetry") {
      scaled = dynamic.map((value, index) => (
        value + parameters.approximate_additive_amplitude_y
          * Math.sin(Math.PI * times[index] / config.horizon_s) ** 2
      ));
    }
  } else if (generatorFamily === "endpoint-return-lookalike") {
    ({ base, scaled } = generateFixture026CausalLookalikePair({
      generatorFamily,
      ratios,
      timeStepS: config.time_step_s,
      endpointGainIncrement: parameters.endpoint_gain_increment,
      endpointBaseLagS: parameters.endpoint_base_lag_s,
      endpointScaledLagS: parameters.endpoint_scaled_lag_s,
    }));
  } else if (generatorFamily === "equal-peak-delayed-trajectory") {
    ({ base, scaled } = generateFixture026CausalLookalikePair({
      generatorFamily,
      ratios,
      timeStepS: config.time_step_s,
      equalPeakCommonGain: parameters.equal_peak_common_gain,
      equalPeakMemoryLagS: parameters.equal_peak_memory_lag_s,
      equalPeakDelayS: parameters.equal_peak_delay_s,
    }));
  } else {
    throw new Error(`Fixture 026 generator family ${generatorFamily} is invalid.`);
  }
  return times.map((timeS, ordinal) => {
    const ratio = ratios[ordinal];
    const sample = {
      ordinal,
      time_s: timeS,
      input_base_u: background * ratio,
      input_scaled_u: background * scaleFactor * ratio,
      background_base_u: background,
      background_scaled_u: background * scaleFactor,
      output_base_y: base[ordinal],
      output_scaled_y: scaled[ordinal],
      input_unit_token: "U",
      output_unit_token: "1",
      interface_version: "rsd-interface-v2",
      reference_origin: generatorFamily === "static-ratio"
        ? "frozen-initial-background"
        : generatorFamily === "equal-peak-delayed-trajectory"
          || generatorFamily === "endpoint-return-lookalike"
          ? "causal-finite-memory"
          : "initialized-causal",
    };
    return { ...sample, checksum: observationChecksum(sample) };
  });
}

function corruptTrace(trace, variant) {
  const mutable = trace.map((sample) => ({ ...sample }));
  const index = Math.floor(mutable.length / 2);
  if (variant === "time-order") {
    [mutable[index].time_s, mutable[index + 1].time_s] = [mutable[index + 1].time_s, mutable[index].time_s];
    mutable[index].checksum = observationChecksum(mutable[index]);
    mutable[index + 1].checksum = observationChecksum(mutable[index + 1]);
  } else if (variant === "checksum") {
    mutable[index].checksum = "f".repeat(64);
  } else if (variant === "unit-token") {
    mutable[index].input_unit_token = "mU";
  } else {
    mutable[index].reference_origin = "full-trajectory-mean";
    mutable[index].checksum = observationChecksum(mutable[index]);
  }
  return Object.freeze(mutable.map((sample) => Object.freeze(sample)));
}

export function validateObservationTrace(trace, config) {
  const expected = Math.round(config.horizon_s / config.time_step_s) + 1;
  const keys = [
    "ordinal", "time_s", "input_base_u", "input_scaled_u", "background_base_u",
    "background_scaled_u", "output_base_y", "output_scaled_y", "input_unit_token",
    "output_unit_token", "interface_version", "reference_origin", "checksum",
  ];
  const shapeValid = Array.isArray(trace) && trace.length === expected && trace.every((sample) => (
    exactKeys(sample, keys)
    && [sample.time_s, sample.input_base_u, sample.input_scaled_u, sample.background_base_u,
      sample.background_scaled_u, sample.output_base_y, sample.output_scaled_y]
      .every((value) => Number.isFinite(value))
    && sample.input_base_u >= config.input_floor_u
    && sample.input_scaled_u >= config.input_floor_u
    && sample.background_base_u >= config.input_floor_u
    && sample.background_scaled_u >= config.input_floor_u
    && typeof sample.input_unit_token === "string"
    && typeof sample.output_unit_token === "string"
    && typeof sample.interface_version === "string"
    && typeof sample.reference_origin === "string"
    && /^[0-9a-f]{64}$/.test(sample.checksum)
  ));
  const orderingValid = shapeValid && trace.every((sample, index) => (
    Number.isSafeInteger(sample.ordinal)
    && sample.ordinal === index
    && sample.time_s === index * config.time_step_s
    && (index === 0 || sample.time_s > trace[index - 1].time_s)
  ));
  const checksumValid = shapeValid && trace.every((sample) => sample.checksum === observationChecksum(sample));
  const unitValid = shapeValid && trace.every((sample) => (
    sample.input_unit_token === "U" && sample.output_unit_token === "1"
  ));
  const interfaceValid = shapeValid && trace.every((sample) => sample.interface_version === "rsd-interface-v2");
  const referenceOrigins = shapeValid ? new Set(trace.map((sample) => sample.reference_origin)) : new Set();
  const causalReferenceValid = shapeValid
    && referenceOrigins.size === 1
    && [...referenceOrigins].every((origin) => (
      origin === "initialized-causal"
      || origin === "frozen-initial-background"
      || origin === "causal-finite-memory"
    ));
  return Object.freeze({
    trace_valid: orderingValid && checksumValid && unitValid && interfaceValid && causalReferenceValid,
    ordering_valid: orderingValid,
    checksum_valid: checksumValid,
    unit_valid: unitValid,
    interface_valid: interfaceValid,
    causal_reference_valid: causalReferenceValid,
  });
}

function gridCellFor(worldIndex) {
  if (worldIndex < FIXTURE_026_VALID_CELLS_PER_SEED) {
    const familyIndex = Math.floor(worldIndex / FIXTURE_026_HISTORY_FAMILIES.length);
    const historyIndex = worldIndex % FIXTURE_026_HISTORY_FAMILIES.length;
    return Object.freeze({
      generatorFamily: FIXTURE_026_VALID_FAMILIES[familyIndex],
      familyIndex,
      historyFamily: FIXTURE_026_HISTORY_FAMILIES[historyIndex],
      corruption: "none",
      sentinelIndex: null,
    });
  }
  const sentinelIndex = worldIndex - FIXTURE_026_VALID_CELLS_PER_SEED;
  return Object.freeze({
    generatorFamily: "malformed-sentinel",
    familyIndex: 0,
    historyFamily: FIXTURE_026_HISTORY_FAMILIES[sentinelIndex],
    corruption: FIXTURE_026_MALFORMED_SENTINELS[sentinelIndex],
    sentinelIndex,
  });
}

export function generateFixture026World({ seed, config, worldIndex }) {
  validateFixture026Config(config);
  parseFixture026PublicSeed(seed);
  if (!Number.isSafeInteger(worldIndex) || worldIndex < 0 || worldIndex >= config.worlds_per_seed) {
    throw new Error("Fixture 026 world index is outside the configured grid.");
  }
  const cell = gridCellFor(worldIndex);
  const systemCanonicalId = cell.generatorFamily === "malformed-sentinel"
    ? FIXTURE_026_VALID_FAMILIES.length + cell.sentinelIndex
    : cell.familyIndex;
  const systemRandom = new PcgCmDxsm12864(fixture026StreamPreimage({
    phase: "development",
    protocol: "RSD-T01",
    seed,
    scope: "dgp",
    canonicalId: systemCanonicalId,
  }));
  const historyRandom = new PcgCmDxsm12864(fixture026StreamPreimage({
    phase: "development",
    protocol: "RSD-T01",
    seed,
    scope: "observation",
    canonicalId: worldIndex,
  }));
  const background = systemRandom.range(0.8, 3.2);
  const scaleFactor = systemRandom.range(2.2, 5.8);
  const usesCausalReferenceTau = new Set([
    "exact-scale-symmetry", "approximate-scale-symmetry", "malformed-sentinel",
  ]).has(cell.generatorFamily);
  const parameters = Object.freeze({
    background_base_u: background,
    scale_factor: scaleFactor,
    input_floor_u: config.input_floor_u,
    causal_reference_tau_s: usesCausalReferenceTau
      ? systemRandom.range(0.45, 1.05)
      : null,
    approximate_additive_amplitude_y: cell.generatorFamily === "approximate-scale-symmetry"
      ? systemRandom.range(0.035, 0.055)
      : null,
    endpoint_gain_increment: cell.generatorFamily === "endpoint-return-lookalike"
      ? systemRandom.range(0.32, 0.52)
      : null,
    endpoint_base_lag_s: cell.generatorFamily === "endpoint-return-lookalike" ? 0.4 : null,
    endpoint_scaled_lag_s: cell.generatorFamily === "endpoint-return-lookalike" ? 0.8 : null,
    equal_peak_common_gain: cell.generatorFamily === "equal-peak-delayed-trajectory"
      ? systemRandom.range(1.15, 1.55)
      : null,
    equal_peak_memory_lag_s: cell.generatorFamily === "equal-peak-delayed-trajectory" ? 0.6 : null,
    equal_peak_delay_s: cell.generatorFamily === "equal-peak-delayed-trajectory" ? 0.3 : null,
  });
  const traceFamily = cell.generatorFamily === "malformed-sentinel"
    ? "exact-scale-symmetry"
    : cell.generatorFamily;
  let trace = validTrace({
    config,
    background,
    scaleFactor,
    generatorFamily: traceFamily,
    parameters,
    historyFamily: cell.historyFamily,
    historyRandom,
  });
  if (cell.generatorFamily === "malformed-sentinel") {
    trace = corruptTrace(trace, cell.corruption);
  } else {
    trace = Object.freeze(trace.map((sample) => Object.freeze(sample)));
  }
  const validation = validateObservationTrace(trace, config);
  const semanticProperties = validation.trace_valid
    ? computeFixture026SemanticProperties(trace, config)
    : null;
  const worldId = createHash("sha256")
    .update(`F026-world-v2|${publicSeedHex(seed)}|${cell.generatorFamily}|${cell.historyFamily}|${worldIndex}`)
    .digest("hex");
  const initializationId = createHash("sha256")
    .update(`F026-init-v2|${publicSeedHex(seed)}|${systemCanonicalId}`)
    .digest("hex");
  return Object.freeze({
    seed,
    world_index: worldIndex,
    world_id: worldId,
    initialization_id: initializationId,
    scale_group: `positive-multiplicative:${scaleFactor}`,
    interface: "paired-normalized-output",
    generator_family: cell.generatorFamily,
    history_family: cell.historyFamily,
    corruption: cell.corruption,
    parameters,
    trace,
    validation,
    semantic_properties: semanticProperties,
  });
}

export function generateFixture026Worlds({ seed, config }) {
  return Object.freeze(Array.from({ length: config.worlds_per_seed }, (_, worldIndex) => (
    generateFixture026World({ seed, config, worldIndex })
  )));
}

export function buildPolicyView(world, arm) {
  if (!new Set(["full-trajectory-diagnostic", "peak-endpoint-lookalike"]).has(arm)) {
    throw new Error("Fixture 026 policy arm is invalid.");
  }
  const common = { trace_valid: world.validation.trace_valid };
  if (!world.validation.trace_valid) return Object.freeze({ ...common, observation: null });
  if (arm === "full-trajectory-diagnostic") {
    const observation = world.trace.map((sample) => Object.freeze({
      ordinal: sample.ordinal,
      time_s: sample.time_s,
      input_ratio: sample.input_base_u / sample.background_base_u,
      output_base_y: sample.output_base_y,
      output_scaled_y: sample.output_scaled_y,
    }));
    return Object.freeze({ ...common, observation: Object.freeze(observation) });
  }
  const base = world.trace.map((sample) => sample.output_base_y);
  const scaled = world.trace.map((sample) => sample.output_scaled_y);
  const basePeak = maximumAbsoluteDepartureWithIndex(base);
  const scaledPeak = maximumAbsoluteDepartureWithIndex(scaled);
  return Object.freeze({
    ...common,
    observation: Object.freeze({
      peak_discrepancy: Math.abs(basePeak.value - scaledPeak.value),
      endpoint_discrepancy: Math.abs(base.at(-1) - scaled.at(-1)),
    }),
  });
}

export function assertPolicyViewFirewall(view) {
  const forbidden = new Set([
    "generator_family", "history_family", "corruption", "parameters", "semantic_properties",
    "trajectory_discrepancy",
    "static_fit_rmse", "expected_label", "evaluator",
    "reference_origin", "checksum", "world_id", "initialization_id", "scale_group",
    "seed", "world_index", "canonical_id", "background_base_u", "background_scaled_u",
    "input_base_u", "input_scaled_u",
    "validation", "ordering_valid", "checksum_valid", "unit_valid", "interface_valid",
    "causal_reference_valid", "interface_version", "input_unit_token", "output_unit_token",
    "input_ratio_unit_token",
  ]);
  const visit = (value) => {
    if (!value || typeof value !== "object") return;
    for (const [key, nested] of Object.entries(value)) {
      if (forbidden.has(key)) throw new Error(`Fixture 026 policy view leaked evaluator field ${key}.`);
      visit(nested);
    }
  };
  visit(view);
  return view;
}
