import { createHash } from "node:crypto";

import { percentile } from "../lib/percentile.mjs";

export const FIXTURE_029_GENERATOR_VERSION = "fixture-029.cmb-x04-generator.v4";

export const FIXTURE_029_ARMS = Object.freeze([
  "X04-NONE", "X04-RETRY", "X04-REPLICA", "X04-RELOAD", "X04-REBUILD",
  "X04-PERSIST", "X04-PHASE", "X04-ORACLE",
]);

export const FIXTURE_029_ACTIONABLE_KEYS = Object.freeze([
  "artifact_type", "artifact_version", "artifact_bytes", "transit_stages",
  "deadline_steps", "maximum_simultaneous_copies", "maximum_lifetime_copies",
  "maximum_retries", "checksum_supported", "source_reload_available",
  "approved_source_available", "wrapper_registry_match", "wrapper_state_bytes",
  "release_cue_type", "release_cue_observed",
]);

export const FIXTURE_029_FAMILIES = Object.freeze([
  "guaranteed-release-compatible", "high-fragility", "zero-transit-hazard", "release-blocked",
  "incompatible-artifact", "inverted-release-cue", "short-useful-lifetime",
  "weak-association",
]);

const RELOAD_PREPARATION_STEPS = 2;
const REBUILD_PREPARATION_STEPS = 5;

function exactKeys(value, keys) {
  return value && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).length === keys.length
    && keys.every((key) => Object.hasOwn(value, key));
}

export function validateFixture029Config(config) {
  const keys = [
    "schema", "artifact", "profile", "worlds_per_seed", "artifacts_per_world",
    "maximum_retries", "maximum_simultaneous_copies", "maximum_lifetime_copies",
    "minimum_accepted_service_fraction", "maximum_integrity_failures",
    "maximum_false_releases", "maximum_activation_tail_steps",
  ];
  if (
    !exactKeys(config, keys) || config.schema !== 1 || config.artifact !== "fixture-029"
    || !new Set(["smoke", "development"]).has(config.profile)
    || !Number.isSafeInteger(config.worlds_per_seed)
    || config.worlds_per_seed < FIXTURE_029_FAMILIES.length
    || config.worlds_per_seed > 64
    || config.worlds_per_seed % FIXTURE_029_FAMILIES.length !== 0
    || !Number.isSafeInteger(config.artifacts_per_world)
    || config.artifacts_per_world < 16 || config.artifacts_per_world > 256
    || config.maximum_retries !== 2
    || config.maximum_simultaneous_copies !== 2
    || config.maximum_lifetime_copies !== 3
    || config.minimum_accepted_service_fraction !== 0.25
    || config.maximum_integrity_failures !== 0 || config.maximum_false_releases !== 0
    || config.maximum_activation_tail_steps !== 9
  ) throw new Error("Fixture 029 configuration is invalid.");
  return config;
}

function digestUnit(preimage) {
  return createHash("sha256").update(preimage, "utf8").digest().readUIntBE(0, 6) / 281474976710656;
}

function jitter(seed, worldIndex, label, radius) {
  return (digestUnit(`F029|${seed}|${worldIndex}|${label}`) * 2 - 1) * radius;
}

function bounded(value, minimum = 0, maximum = 1) {
  return Math.min(maximum, Math.max(minimum, value));
}

function familyParameters(family, seed, worldIndex) {
  const base = {
    artifact_bytes: 4096,
    wrapper_state_bytes: 128,
    transit_stages: 5,
    transit_hazard_per_stage: bounded(0.18 + jitter(seed, worldIndex, "hazard", 0.025)),
    latent_compatible: true,
    association_strength: bounded(0.78 + jitter(seed, worldIndex, "association", 0.04)),
    stabilization_fraction: bounded(0.72 + jitter(seed, worldIndex, "stabilization", 0.04)),
    release_probability: bounded(0.88 + jitter(seed, worldIndex, "release", 0.03)),
    release_cue_valid: true,
    useful_lifetime_steps: 18,
    deadline_steps: 9,
  };
  if (family === "guaranteed-release-compatible") {
    base.latent_compatible = true;
    base.release_probability = 1;
    base.release_cue_valid = true;
  }
  if (family === "high-fragility") base.transit_hazard_per_stage = 0.32;
  if (family === "zero-transit-hazard") base.transit_hazard_per_stage = 0;
  if (family === "release-blocked") base.release_probability = 0;
  if (family === "incompatible-artifact") base.latent_compatible = false;
  if (family === "inverted-release-cue") base.release_cue_valid = false;
  if (family === "short-useful-lifetime") base.useful_lifetime_steps = 4;
  if (family === "weak-association") {
    base.association_strength = 0.05;
    base.stabilization_fraction = 0.02;
  }
  return Object.freeze(base);
}

export function generateFixture029Worlds({ seed, config }) {
  validateFixture029Config(config);
  if (!Number.isSafeInteger(seed) || seed < 0 || seed > 0xffff_ffff) {
    throw new Error("Fixture 029 public seed must be an unsigned integer.");
  }
  return Object.freeze(Array.from({ length: config.worlds_per_seed }, (_, worldIndex) => {
    const family = FIXTURE_029_FAMILIES[worldIndex % FIXTURE_029_FAMILIES.length];
    const parameters = familyParameters(family, seed, worldIndex);
    return Object.freeze({
      world_index: worldIndex,
      world_id: createHash("sha256")
        .update(`F029|CMB-X04|development|${seed}|${worldIndex}|${family}`).digest("hex"),
      generator_family: family,
      public_contract: Object.freeze({
        artifact_type: "typed-compiled-module",
        artifact_version: 1,
        artifact_bytes: parameters.artifact_bytes,
        transit_stages: parameters.transit_stages,
        deadline_steps: parameters.deadline_steps,
        maximum_simultaneous_copies: config.maximum_simultaneous_copies,
        maximum_lifetime_copies: config.maximum_lifetime_copies,
        maximum_retries: config.maximum_retries,
        checksum_supported: true,
        source_reload_available: true,
        approved_source_available: true,
        wrapper_registry_match: true,
        wrapper_state_bytes: parameters.wrapper_state_bytes,
        release_cue_type: "destination-load-complete-v1",
      }),
      evaluator_parameters: parameters,
    });
  }));
}

function draw(seed, worldIndex, artifactIndex, stream, attempt = 0) {
  return digestUnit(`F029|${seed}|${worldIndex}|${artifactIndex}|${stream}|${attempt}`);
}

export function buildFixture029ActionableObservation({ seed, world, artifactIndex }) {
  return Object.freeze({
    artifact_type: world.public_contract.artifact_type,
    artifact_version: world.public_contract.artifact_version,
    artifact_bytes: world.public_contract.artifact_bytes,
    transit_stages: world.public_contract.transit_stages,
    deadline_steps: world.public_contract.deadline_steps,
    maximum_simultaneous_copies: world.public_contract.maximum_simultaneous_copies,
    maximum_lifetime_copies: world.public_contract.maximum_lifetime_copies,
    maximum_retries: world.public_contract.maximum_retries,
    checksum_supported: world.public_contract.checksum_supported,
    source_reload_available: world.public_contract.source_reload_available,
    approved_source_available: world.public_contract.approved_source_available,
    wrapper_registry_match: world.public_contract.wrapper_registry_match,
    wrapper_state_bytes: world.public_contract.wrapper_state_bytes,
    release_cue_type: world.public_contract.release_cue_type,
    release_cue_observed: world.generator_family === "guaranteed-release-compatible"
      || draw(seed, world.world_index, artifactIndex, "observable-release-cue") < 0.9,
  });
}

export function decideFixture029Action(arm, observation) {
  if (!FIXTURE_029_ARMS.includes(arm)) throw new Error("Fixture 029 arm is invalid.");
  if (!exactKeys(observation, FIXTURE_029_ACTIONABLE_KEYS)) {
    throw new Error("Fixture 029 policy view contains hidden or missing fields.");
  }
  const table = {
    "X04-NONE": { mode: "single", copies: 1, retries: 0, wrap: false, release_on_cue: false },
    "X04-RETRY": { mode: "retry", copies: 1, retries: observation.maximum_retries, wrap: false, release_on_cue: false },
    "X04-REPLICA": { mode: "replica", copies: observation.maximum_simultaneous_copies, retries: 0, wrap: false, release_on_cue: false },
    "X04-RELOAD": { mode: "reload", copies: 1, retries: observation.maximum_retries, wrap: false, release_on_cue: false },
    "X04-REBUILD": { mode: "rebuild", copies: 1, retries: observation.maximum_retries, wrap: false, release_on_cue: false },
    "X04-PERSIST": { mode: "single", copies: 1, retries: 0, wrap: observation.wrapper_registry_match, release_on_cue: false },
    "X04-PHASE": { mode: "single", copies: 1, retries: 0, wrap: observation.wrapper_registry_match, release_on_cue: observation.release_cue_observed },
    "X04-ORACLE": { mode: "oracle", copies: 1, retries: observation.maximum_retries, wrap: true, release_on_cue: true },
  };
  return Object.freeze(table[arm]);
}

function survives(parameters, unit, wrapped) {
  const base = (1 - parameters.transit_hazard_per_stage) ** parameters.transit_stages;
  const stabilization = wrapped ? parameters.stabilization_fraction * parameters.association_strength : 0;
  return unit < bounded(base + (1 - base) * stabilization);
}

function canonical(value) {
  if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number" && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
}

function hash(value) {
  return createHash("sha256").update(canonical(value)).digest("hex");
}

export function simulateFixture029Arm({ seed, world, arm, config }) {
  if (!FIXTURE_029_ARMS.includes(arm)) throw new Error("Fixture 029 arm is invalid.");
  const p = world.evaluator_parameters;
  const counts = {
    artifacts_attempted: config.artifacts_per_world,
    artifacts_active: 0, artifacts_bound: 0, artifacts_lost: 0, artifacts_invalid: 0,
    copies_created: 0, copies_transported: 0, copies_intact: 0, copies_lost: 0,
    copies_active: 0, copies_bound: 0, copies_invalid: 0, copies_destroyed: 0,
    retried: 0, replicated: 0, reloaded: 0, rebuilt: 0,
    integrity_failures: 0, false_releases: 0, missed_release_deadlines: 0,
    bound_active_impossible: 0,
  };
  const resources = {
    logical_operations: 0, transported_bytes: 0, wrapper_state_bytes_created: 0,
    wrapper_byte_steps: 0, validation_operations: 0, retry_operations: 0,
    replication_operations: 0, reload_operations: 0, rebuild_operations: 0,
    wrapper_construction_operations: 0, compatibility_check_operations: 0,
    release_operations: 0, cleanup_operations: 0, bytes_read: 0,
    transport_bytes_written: 0, reconstruction_bytes_written: 0, bytes_written: 0,
    retained_state_byte_steps: 0,
  };
  const activationLatencies = [];
  const policyViews = [];
  const policyActions = [];
  let acceptedService = 0;
  let maximumSimultaneousCopiesObserved = 0;
  let maximumLifetimeCopiesObserved = 0;

  for (let artifactIndex = 0; artifactIndex < config.artifacts_per_world; artifactIndex += 1) {
    const observation = buildFixture029ActionableObservation({ seed, world, artifactIndex });
    const publicAction = decideFixture029Action(arm, observation);
    const action = arm === "X04-ORACLE"
      ? Object.freeze({
        ...publicAction,
        wrap: p.latent_compatible && p.transit_hazard_per_stage > 0,
        release_on_cue: p.latent_compatible && p.release_cue_valid && p.release_probability > 0,
      })
      : publicAction;
    policyViews.push(arm === "X04-ORACLE" ? { ...observation, oracle_truth: p } : observation);
    policyActions.push(action);
    const wrapped = action.wrap;
    let lifecycleCopies = action.mode === "replica" ? action.copies : 1;
    let lifecycleSteps = p.transit_stages;
    maximumSimultaneousCopiesObserved = Math.max(
      maximumSimultaneousCopiesObserved,
      action.mode === "replica" ? action.copies : 1,
    );
    const copyStates = [];
    const transportCopy = (copyIndex) => {
      counts.copies_created += 1;
      counts.copies_transported += 1;
      const transportedBytes = p.artifact_bytes + (wrapped ? p.wrapper_state_bytes : 0);
      resources.transported_bytes += transportedBytes;
      resources.bytes_read += p.artifact_bytes;
      resources.transport_bytes_written += transportedBytes;
      resources.bytes_written += transportedBytes;
      resources.validation_operations += 1;
      resources.logical_operations += p.transit_stages + 2;
      if (wrapped) {
        resources.wrapper_state_bytes_created += p.wrapper_state_bytes;
        resources.wrapper_construction_operations += 1;
        resources.compatibility_check_operations += 1;
        resources.wrapper_byte_steps += p.wrapper_state_bytes * p.transit_stages;
        resources.logical_operations += 3;
      }
      const intact = survives(p, draw(seed, world.world_index, artifactIndex, "paired-transit", copyIndex), wrapped);
      if (intact) counts.copies_intact += 1;
      else counts.copies_lost += 1;
      copyStates.push({ intact, copyIndex });
      return intact;
    };

    for (let copy = 0; copy < lifecycleCopies; copy += 1) transportCopy(copy);
    if (action.mode === "replica") {
      counts.replicated += lifecycleCopies - 1;
      resources.replication_operations += lifecycleCopies - 1;
      resources.logical_operations += lifecycleCopies - 1;
    }
    if (new Set(["retry", "reload", "rebuild", "oracle"]).has(action.mode)
      && !copyStates.some((copy) => copy.intact)) {
      for (let retry = 1; retry <= action.retries; retry += 1) {
        if (lifecycleCopies >= observation.maximum_lifetime_copies) break;
        lifecycleCopies += 1;
        if (action.mode === "retry" || action.mode === "oracle") {
          counts.retried += 1;
          resources.retry_operations += 1;
        } else if (action.mode === "reload") {
          counts.reloaded += 1;
          resources.reload_operations += 1;
          resources.bytes_read += p.artifact_bytes;
          lifecycleSteps += RELOAD_PREPARATION_STEPS;
        } else {
          counts.rebuilt += 1;
          resources.rebuild_operations += 1;
          resources.bytes_read += p.artifact_bytes;
          resources.reconstruction_bytes_written += p.artifact_bytes;
          resources.bytes_written += p.artifact_bytes;
          lifecycleSteps += REBUILD_PREPARATION_STEPS;
        }
        resources.logical_operations += action.mode === "rebuild" ? 5 : 2;
        lifecycleSteps += p.transit_stages;
        if (transportCopy(retry)) break;
      }
    }
    maximumLifetimeCopiesObserved = Math.max(maximumLifetimeCopiesObserved, lifecycleCopies);
    const intactCopies = copyStates.filter((copy) => copy.intact);
    if (intactCopies.length === 0) {
      counts.artifacts_lost += 1;
      continue;
    }
    if (!p.latent_compatible) {
      counts.artifacts_invalid += 1;
      counts.copies_invalid += intactCopies.length;
      if (arm === "X04-PHASE" && action.release_on_cue) {
        counts.false_releases += 1;
        counts.integrity_failures += 1;
      }
      continue;
    }
    if (arm === "X04-PERSIST") {
      counts.artifacts_bound += 1;
      counts.copies_bound += 1;
      counts.copies_destroyed += intactCopies.length - 1;
      resources.wrapper_byte_steps += p.wrapper_state_bytes * p.useful_lifetime_steps;
      resources.retained_state_byte_steps += (p.artifact_bytes + p.wrapper_state_bytes) * p.useful_lifetime_steps;
      continue;
    }
    if (arm === "X04-PHASE" || arm === "X04-ORACLE") {
      const physicalRelease = action.release_on_cue && p.release_cue_valid
        && draw(seed, world.world_index, artifactIndex, "paired-release") < p.release_probability;
      resources.release_operations += action.release_on_cue ? 1 : 0;
      resources.cleanup_operations += action.release_on_cue ? 1 : 0;
      resources.logical_operations += action.release_on_cue ? 3 : 0;
      if (!physicalRelease) {
        if (action.release_on_cue && !p.release_cue_valid) {
          counts.false_releases += 1;
          counts.integrity_failures += 1;
          counts.artifacts_invalid += 1;
          counts.copies_invalid += 1;
          counts.copies_destroyed += intactCopies.length - 1;
        } else {
          counts.artifacts_bound += 1;
          counts.copies_bound += 1;
          counts.copies_destroyed += intactCopies.length - 1;
          counts.missed_release_deadlines += 1;
          resources.wrapper_byte_steps += p.wrapper_state_bytes * p.useful_lifetime_steps;
          resources.retained_state_byte_steps += (p.artifact_bytes + p.wrapper_state_bytes) * p.useful_lifetime_steps;
        }
        continue;
      }
      resources.wrapper_byte_steps += p.wrapper_state_bytes;
    }
    const latency = lifecycleSteps + (arm === "X04-PHASE" || arm === "X04-ORACLE" ? 1 : 0);
    counts.artifacts_active += 1;
    counts.copies_active += 1;
    counts.copies_destroyed += intactCopies.length - 1;
    activationLatencies.push(latency);
    if (latency > p.deadline_steps) counts.missed_release_deadlines += 1;
    acceptedService += Math.max(0, p.useful_lifetime_steps - latency);
    resources.retained_state_byte_steps += p.artifact_bytes * Math.max(0, p.useful_lifetime_steps - latency);
  }

  const copyConservation = counts.copies_created === counts.copies_lost
    + counts.copies_active + counts.copies_bound + counts.copies_invalid + counts.copies_destroyed;
  const artifactConservation = counts.artifacts_attempted === counts.artifacts_active
    + counts.artifacts_bound + counts.artifacts_lost + counts.artifacts_invalid;
  const resourcesComplete = Object.values(resources).every((value) => Number.isSafeInteger(value) && value >= 0);
  const informationParity = arm !== "X04-ORACLE"
    && policyViews.every((view) => exactKeys(view, FIXTURE_029_ACTIONABLE_KEYS));
  const authorityParity = maximumSimultaneousCopiesObserved <= config.maximum_simultaneous_copies
    && maximumLifetimeCopiesObserved <= config.maximum_lifetime_copies;
  const activationTail = percentile(activationLatencies, 0.95);
  const potentialService = config.artifacts_per_world * p.useful_lifetime_steps;
  const taskGate = potentialService > 0
    && acceptedService / potentialService >= config.minimum_accepted_service_fraction;
  const protectedGate = counts.integrity_failures <= config.maximum_integrity_failures
    && counts.false_releases <= config.maximum_false_releases
    && (activationTail === null || activationTail <= config.maximum_activation_tail_steps);
  return Object.freeze({
    policy_input_sha256: hash(policyViews),
    policy_action_sha256: hash(policyActions),
    policy_oracle_access: arm === "X04-ORACLE",
    outcomes: Object.freeze({
      ...counts,
      accepted_service_nsu: acceptedService,
      active_artifact_steps: acceptedService,
      activation_latency_p95_steps: activationTail,
    }),
    resources: Object.freeze(resources),
    gates: Object.freeze({
      information_parity: informationParity,
      action_authority_parity: authorityParity,
      task_gate_pass: taskGate,
      protected_gate_pass: protectedGate,
      copy_conservation_pass: copyConservation,
      artifact_conservation_pass: artifactConservation,
      resource_ledger_complete: resourcesComplete,
      resource_gate_pass: resourcesComplete && copyConservation && artifactConservation && authorityParity,
    }),
    process_metadata: Object.freeze({
      execution_model: "single-process-deterministic-event-simulation",
      maximum_concurrency: 1,
      per_arm_cpu_time_measured: false,
      per_arm_wall_time_measured: false,
      per_arm_peak_memory_measured: false,
      measurement_boundary: "process timing and peak memory are outside comparative smoke endpoints",
    }),
    maximum_simultaneous_copies_observed: maximumSimultaneousCopiesObserved,
    maximum_lifetime_copies_observed: maximumLifetimeCopiesObserved,
  });
}
