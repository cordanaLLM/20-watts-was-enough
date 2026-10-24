import { createHash } from "node:crypto";

import { Pcg64Dxsm } from "../lib/pcg64-dxsm.mjs";
import {
  formatSeedHex,
  formatStreamPreimage,
  uint32SeedBytes,
} from "../lib/stream-seed.mjs";
import { exactKeys } from "../lib/exact-keys.mjs";

export { Pcg64Dxsm };

export const FIXTURE_027_GENERATOR_VERSION = "fixture-027.rin-t01-generator.v2";
export const FIXTURE_027_CLASSES = Object.freeze([
  "zero-load-control",
  "weak-load-supported",
  "strong-load-retroactive",
  "finite-insulation-effective",
  "insulation-saturated",
  "interface-schema-invalid",
]);

const FIXTURE_027_SCOPES = Object.freeze(new Set([
  "dgp",
  "observation",
  "arm-init",
  "action-outcome",
  "analysis",
]));

export function publicSeedBytes(seed) {
  return uint32SeedBytes(seed, "Fixture 027 public");
}

export function publicSeedHex(seed) {
  return formatSeedHex(publicSeedBytes(seed));
}

export function fixture027StreamPreimage({ phase, protocol, seed, scope, canonicalId }) {
  return formatStreamPreimage({
    version: "F027-v1",
    phase,
    protocol,
    seedHex: publicSeedHex(seed),
    scope,
    canonicalId,
    label: "Fixture 027",
    isValidProtocol: (candidate) => candidate === "RIN-T01",
    validScopes: FIXTURE_027_SCOPES,
  });
}

export function validateFixture027Config(config) {
  const keys = [
    "schema", "artifact", "profile", "worlds_per_seed", "time_step_s", "horizon_s",
    "back_action_threshold_u", "minimum_restoration_fraction",
    "saturation_fraction_threshold", "state_scale_u", "max_loss",
  ];
  if (
    !exactKeys(config, keys)
    || config.schema !== 1
    || config.artifact !== "fixture-027"
    || !new Set(["smoke", "development"]).has(config.profile)
    || !Number.isSafeInteger(config.worlds_per_seed)
    || config.worlds_per_seed < FIXTURE_027_CLASSES.length
    || config.worlds_per_seed > 120
    || config.worlds_per_seed % FIXTURE_027_CLASSES.length !== 0
    || config.time_step_s !== 0.01
    || config.horizon_s !== 4
    || !Number.isFinite(config.back_action_threshold_u)
    || config.back_action_threshold_u <= 0
    || config.back_action_threshold_u >= 0.1
    || !Number.isFinite(config.minimum_restoration_fraction)
    || config.minimum_restoration_fraction <= 0
    || config.minimum_restoration_fraction >= 1
    || !Number.isFinite(config.saturation_fraction_threshold)
    || config.saturation_fraction_threshold <= 0
    || config.saturation_fraction_threshold >= 1
    || !Number.isFinite(config.state_scale_u)
    || config.state_scale_u <= 0
    || config.max_loss !== 100
  ) throw new Error("Fixture 027 configuration is invalid.");
  return config;
}

function commandAt(timeS) {
  if (timeS < 0.5) return 0.25;
  if (timeS < 1.75) return 1;
  if (timeS < 2.5) return 0.55;
  if (timeS < 3.25) return 0.9;
  return 0.35;
}

function classFor(seed, worldIndex) {
  const offset = seed % FIXTURE_027_CLASSES.length;
  return FIXTURE_027_CLASSES[(worldIndex + offset) % FIXTURE_027_CLASSES.length];
}

function drawParameters(random, worldClass) {
  const common = {
    production_rate_u_per_s: random.range(0.85, 1.25),
    decay_per_s: random.range(0.55, 0.85),
    binding_on_per_u_s: random.range(0.7, 1.2),
    binding_off_per_s: random.range(0.12, 0.32),
    load_total_u: 0,
    driver_gain_per_s: 0,
    driver_capacity_u_per_s: 0,
  };
  if (worldClass === "weak-load-supported") {
    common.binding_on_per_u_s = random.range(0.15, 0.3);
    common.load_total_u = random.range(0.01, 0.025);
  } else if (worldClass === "strong-load-retroactive" || worldClass === "interface-schema-invalid") {
    common.binding_on_per_u_s = random.range(1.2, 2);
    common.load_total_u = random.range(0.65, 1.05);
  } else if (worldClass === "finite-insulation-effective") {
    common.binding_on_per_u_s = random.range(1.1, 1.8);
    common.load_total_u = random.range(0.55, 0.9);
    common.driver_gain_per_s = random.range(9, 13);
    common.driver_capacity_u_per_s = random.range(3.5, 5);
  } else if (worldClass === "insulation-saturated") {
    common.binding_on_per_u_s = random.range(2.2, 3.2);
    common.load_total_u = random.range(2.2, 3.2);
    common.driver_gain_per_s = random.range(9, 13);
    common.driver_capacity_u_per_s = random.range(0.08, 0.16);
  }
  return Object.freeze(common);
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function stepConnected(state, command, parameters, driver, dt) {
  const available = Math.max(0, parameters.load_total_u - state.bound_u);
  const binding = parameters.binding_on_per_u_s * state.free_u * available
    - parameters.binding_off_per_s * state.bound_u;
  const nextFree = Math.max(0, state.free_u + dt * (
    parameters.production_rate_u_per_s * command
    - parameters.decay_per_s * state.free_u
    - binding
    + driver
  ));
  const nextBound = clamp(state.bound_u + dt * binding, 0, parameters.load_total_u);
  const expectedTotal = state.free_u + state.bound_u + dt * (
    parameters.production_rate_u_per_s * command
    - parameters.decay_per_s * state.free_u
    + driver
  );
  return Object.freeze({
    free_u: nextFree,
    bound_u: nextBound,
    binding_u_per_s: binding,
    closure_residual_u: Math.abs(nextFree + nextBound - expectedTotal),
  });
}

function integrateWorld(parameters, config) {
  const count = Math.round(config.horizon_s / config.time_step_s);
  const initialCommand = commandAt(0);
  const initialFree = parameters.production_rate_u_per_s * initialCommand / parameters.decay_per_s;
  let reference = Object.freeze({ free_u: initialFree, bound_u: 0, binding_u_per_s: 0 });
  let connected = Object.freeze({ free_u: initialFree, bound_u: 0, binding_u_per_s: 0 });
  let insulated = Object.freeze({ free_u: initialFree, bound_u: 0, binding_u_per_s: 0 });
  let noAffinity = Object.freeze({ free_u: initialFree, bound_u: 0, binding_u_per_s: 0 });
  const referenceValues = [reference.free_u];
  const connectedValues = [connected.free_u];
  const insulatedValues = [insulated.free_u];
  const noAffinityValues = [noAffinity.free_u];
  const connectedBound = [connected.bound_u];
  const bindingFlux = [0];
  let action = 0;
  let saturatedSteps = 0;
  let massClosureResidual = 0;
  for (let step = 0; step < count; step += 1) {
    const timeS = step * config.time_step_s;
    const command = commandAt(timeS);
    reference = stepConnected(reference, command, { ...parameters, load_total_u: 0 }, 0, config.time_step_s);
    connected = stepConnected(connected, command, parameters, 0, config.time_step_s);
    noAffinity = stepConnected(noAffinity, command, { ...parameters, binding_on_per_u_s: 0 }, 0, config.time_step_s);
    const requested = Math.max(0, parameters.driver_gain_per_s * (reference.free_u - insulated.free_u));
    const driver = Math.min(parameters.driver_capacity_u_per_s, requested);
    if (parameters.driver_capacity_u_per_s > 0 && requested >= parameters.driver_capacity_u_per_s - 1e-15) saturatedSteps += 1;
    action += driver * config.time_step_s;
    insulated = stepConnected(insulated, command, parameters, driver, config.time_step_s);
    referenceValues.push(reference.free_u);
    connectedValues.push(connected.free_u);
    insulatedValues.push(insulated.free_u);
    noAffinityValues.push(noAffinity.free_u);
    connectedBound.push(connected.bound_u);
    bindingFlux.push(connected.binding_u_per_s);
    massClosureResidual = Math.max(massClosureResidual, connected.closure_residual_u);
  }
  return Object.freeze({
    reference: Object.freeze(referenceValues),
    connected: Object.freeze(connectedValues),
    insulated: Object.freeze(insulatedValues),
    no_affinity: Object.freeze(noAffinityValues),
    connected_bound: Object.freeze(connectedBound),
    binding_flux: Object.freeze(bindingFlux),
    insulation_action_u: action,
    driver_saturation_fraction: saturatedSteps / count,
    mass_closure_residual_u: massClosureResidual,
  });
}

function rmse(left, right) {
  let squared = 0;
  for (let index = 0; index < left.length; index += 1) {
    const error = left[index] - right[index];
    squared += error * error;
  }
  return Math.sqrt(squared / left.length);
}

function tracePayload(sample) {
  return JSON.stringify({
    ordinal: sample.ordinal,
    time_s: sample.time_s,
    command: sample.command,
    source_free_u: sample.source_free_u,
    load_bound_u: sample.load_bound_u,
    binding_flux_u_per_s: sample.binding_flux_u_per_s,
    unit_token: sample.unit_token,
    interface_version: sample.interface_version,
  });
}

export function interfaceTraceChecksum(sample) {
  return createHash("sha256").update(tracePayload(sample)).digest("hex");
}

function corruptTrace(trace, worldIndex) {
  const variants = ["time-order", "unit-token", "interface-version", "checksum"];
  const corruption = variants[worldIndex % variants.length];
  const index = Math.floor(trace.length / 2);
  if (corruption === "time-order") {
    [trace[index].time_s, trace[index + 1].time_s] = [trace[index + 1].time_s, trace[index].time_s];
    trace[index].checksum = interfaceTraceChecksum(trace[index]);
    trace[index + 1].checksum = interfaceTraceChecksum(trace[index + 1]);
  } else if (corruption === "unit-token") {
    trace[index].unit_token = "mU";
  } else if (corruption === "interface-version") {
    trace[index].interface_version = "rin-interface-v0";
    trace[index].checksum = interfaceTraceChecksum(trace[index]);
  } else {
    trace[index].checksum = "f".repeat(64);
  }
  return Object.freeze({
    trace: Object.freeze(trace.map((sample) => Object.freeze(sample))),
    corruption,
  });
}

function buildTrace(trajectory, config) {
  const trace = trajectory.connected.map((sourceFree, ordinal) => {
    const timeS = ordinal * config.time_step_s;
    const sample = {
      ordinal,
      time_s: timeS,
      command: commandAt(Math.min(timeS, config.horizon_s - config.time_step_s)),
      source_free_u: sourceFree,
      load_bound_u: trajectory.connected_bound[ordinal],
      binding_flux_u_per_s: trajectory.binding_flux[ordinal],
      unit_token: "U",
      interface_version: "rin-interface-v1",
    };
    return { ...sample, checksum: interfaceTraceChecksum(sample) };
  });
  return Object.freeze({
    trace: Object.freeze(trace.map((sample) => Object.freeze(sample))),
    corruption: "none",
  });
}

function buildMalformedTrace(config, worldIndex) {
  const count = Math.round(config.horizon_s / config.time_step_s);
  const trace = Array.from({ length: count + 1 }, (_, ordinal) => {
    const timeS = ordinal * config.time_step_s;
    const sample = {
      ordinal,
      time_s: timeS,
      command: commandAt(Math.min(timeS, config.horizon_s - config.time_step_s)),
      source_free_u: 0,
      load_bound_u: 0,
      binding_flux_u_per_s: 0,
      unit_token: "U",
      interface_version: "rin-interface-v1",
    };
    return { ...sample, checksum: interfaceTraceChecksum(sample) };
  });
  return corruptTrace(trace, worldIndex);
}

export function validateInterfaceTrace(trace, config) {
  const expected = Math.round(config.horizon_s / config.time_step_s) + 1;
  if (!Array.isArray(trace) || trace.length !== expected) {
    return Object.freeze({ trace_valid: false, ordering_valid: false, checksum_valid: false, unit_valid: false, interface_valid: false });
  }
  const sampleKeys = [
    "ordinal", "time_s", "command", "source_free_u", "load_bound_u",
    "binding_flux_u_per_s", "unit_token", "interface_version", "checksum",
  ];
  const shapeValid = trace.every((sample) => (
    exactKeys(sample, sampleKeys)
    && Number.isFinite(sample.time_s)
    && Number.isFinite(sample.command)
    && sample.command >= 0
    && Number.isFinite(sample.source_free_u)
    && sample.source_free_u >= 0
    && Number.isFinite(sample.load_bound_u)
    && sample.load_bound_u >= 0
    && Number.isFinite(sample.binding_flux_u_per_s)
    && typeof sample.unit_token === "string"
    && typeof sample.interface_version === "string"
    && /^[0-9a-f]{64}$/.test(sample.checksum)
  ));
  const orderingValid = shapeValid && trace.every((sample, index) => (
    Number.isSafeInteger(sample.ordinal)
    && sample.ordinal === index
    && sample.time_s === index * config.time_step_s
    && (index === 0 || sample.time_s > trace[index - 1].time_s)
  ));
  const checksumValid = shapeValid
    && trace.every((sample) => sample.checksum === interfaceTraceChecksum(sample));
  const unitValid = shapeValid && trace.every((sample) => sample.unit_token === "U");
  const interfaceValid = shapeValid
    && trace.every((sample) => sample.interface_version === "rin-interface-v1");
  return Object.freeze({
    trace_valid: orderingValid && checksumValid && unitValid && interfaceValid,
    ordering_valid: orderingValid,
    checksum_valid: checksumValid,
    unit_valid: unitValid,
    interface_valid: interfaceValid,
  });
}

export function generateFixture027World({ seed, config, worldIndex }) {
  validateFixture027Config(config);
  if (!Number.isSafeInteger(seed) || seed < 0 || seed > 0xffff_ffff) {
    throw new Error("Fixture 027 seed must be an unsigned 32-bit integer.");
  }
  if (!Number.isSafeInteger(worldIndex) || worldIndex < 0 || worldIndex >= config.worlds_per_seed) {
    throw new Error("Fixture 027 world index is outside the configured grid.");
  }
  const worldClass = classFor(seed, worldIndex);
  const preimage = fixture027StreamPreimage({
    phase: "development",
    protocol: "RIN-T01",
    seed,
    scope: "dgp",
    canonicalId: worldIndex,
  });
  const random = new Pcg64Dxsm(preimage);
  const parameters = drawParameters(random, worldClass);
  const malformed = worldClass === "interface-schema-invalid";
  const trajectory = malformed ? null : integrateWorld(parameters, config);
  const backActionRmse = malformed ? 0 : rmse(trajectory.reference, trajectory.connected);
  const insulationRmse = malformed ? 0 : rmse(trajectory.reference, trajectory.insulated);
  const noAffinityRmse = malformed ? 0 : rmse(trajectory.reference, trajectory.no_affinity);
  const restoration = !malformed && backActionRmse > 0
    ? clamp(1 - insulationRmse / backActionRmse, 0, 1)
    : 0;
  const exposed = malformed
    ? buildMalformedTrace(config, worldIndex)
    : buildTrace(trajectory, config);
  return Object.freeze({
    seed,
    world_index: worldIndex,
    world_id: `${seed}:${worldIndex}`,
    world_class: worldClass,
    parameters,
    trajectory,
    simulation_performed: !malformed,
    trace: exposed.trace,
    corruption: exposed.corruption,
    back_action_rmse_u: backActionRmse,
    insulation_rmse_u: insulationRmse,
    restoration_fraction: restoration,
    driver_saturation_fraction: malformed ? 0 : trajectory.driver_saturation_fraction,
    insulation_action_u: malformed ? 0 : trajectory.insulation_action_u,
    mass_closure_residual_u: malformed ? 0 : trajectory.mass_closure_residual_u,
    no_affinity_rmse_u: noAffinityRmse,
  });
}

export function generateFixture027Worlds({ seed, config }) {
  return Object.freeze(Array.from(
    { length: config.worlds_per_seed },
    (_, worldIndex) => generateFixture027World({ seed, config, worldIndex }),
  ));
}
