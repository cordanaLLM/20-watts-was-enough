import { createHash } from "node:crypto";

import {
  CMB_X01_ARMS,
  CMB_X01_COUNTERFACTUAL_DRAW_DOMAIN,
  CMB_X01_DESTRUCTIVE_ARMS,
  CMB_X01_FAMILIES,
  CMB_X01_GENERATOR_VERSION,
  CMB_X01_OUTCOME_KEYS,
  CMB_X01_RESOURCE_KEYS,
  CMB_X01_SMOKE_CONFIG,
  generateCmbX01Worlds,
  simulateCmbX01Arm,
  validateCmbX01Config,
} from "./cmb-x01-generator.mjs";

export const CMB_X01_CONSTRUCTION_CONTRACT_VERSION =
  "fixture-029.cmb-x01-aggregate-construction.v3";

export const CMB_X01_RECORD_KIND =
  "aggregate-construction-diagnostic-not-protocol-native-action-events";

export const CMB_X01_INTERPRETATION =
  "NO_RESULT: non-integrated deterministic CMB-X01 aggregate construction diagnostic only; no comparison, scientific, performance, claim, or energy authority.";

const RECORD_KEYS = Object.freeze([
  "schema",
  "contract_version",
  "generator_version",
  "artifact",
  "track",
  "claim_scope",
  "record_kind",
  "status",
  "profile",
  "partition",
  "seed",
  "world_index",
  "world_id",
  "generator_family",
  "arm",
  "config_sha256",
  "public_contract",
  "evaluator_parameters",
  "evaluator_disclosed_only_after_policy_decision",
  "paired_exogenous_sha256",
  "policy_input_sha256",
  "policy_action_sha256",
  "policy_oracle_access",
  "action_authority_sha256",
  "action_authority",
  "counterfactual_draw_domain",
  "mechanism",
  "outcomes",
  "resources",
  "inventories",
  "gates",
  "gate_thresholds",
  "process_metadata",
  "units",
  "result_label",
  "no_result",
  "measured_energy_present",
  "energy_conclusion_allowed",
  "comparison_inference_permitted",
  "claim_eligible",
  "scientific_result",
  "performance_result",
  "interpretation",
  "integrity",
]);

const PUBLIC_CONTRACT_KEYS = Object.freeze([
  "target_slots", "horizon_steps", "target_version", "action_score_threshold_ppm",
  "garbage_collection_period_steps", "mediator_inventory_declared", "target_metadata_bytes",
  "queue_entry_bytes", "mediator_state_bytes", "suppression_state_bytes", "action_authority",
]);

const AUTHORITY_KEYS = Object.freeze([
  "authority_id", "engine_class", "engine_capacity_per_step", "permitted_target_classes",
  "permitted_destructive_action", "destructive_verification_required", "replacement_authorized",
]);

const EVALUATOR_KEYS = Object.freeze([
  "initial_occupancy_ppm", "initial_harmful_ppm", "arrival_ppm", "arrival_harmful_ppm",
  "harmful_conversion_ppm", "useful_recovery_ppm", "resynthesis_ppm",
  "resynthesis_harmful_ppm", "evidence_sensitivity_ppm", "evidence_false_positive_ppm",
  "evidence_delay_steps", "engine_capacity_per_step", "mediator_inventory",
  "target_mediator_compatible", "mediator_engine_compatible", "productive_geometry_ppm",
  "mediator_reuse_enabled", "mediator_leakage_ppm", "replacement_enabled",
  "binary_saturation",
]);

const MECHANISM_KEYS = Object.freeze([
  "perfect_evidence", "harmful_targets_possible", "engine_available",
  "productive_geometry_possible", "mediator_saturation", "resynthesis_enabled",
  "replacement_enabled", "mediator_leakage_possible", "mediator_reuse_enabled",
]);

const GATE_KEYS = Object.freeze([
  "observation_evaluator_separation", "destructive_action_authority_parity",
  "target_conservation_pass", "engine_conservation_pass", "mediator_conservation_pass",
  "resource_ledger_complete", "task_gate_pass", "protected_gate_pass",
  "harm_gate_pass", "queue_tail_gate_pass", "verified_mediator_reuse_pass",
]);

const OPERATION_RESOURCE_KEYS = Object.freeze([
  "evidence_reads", "target_search_operations", "target_transition_operations",
  "queue_insert_operations", "queue_pop_operations", "engine_service_operations",
  "direct_action_operations", "gc_scan_operations", "occupancy_operations",
  "mediator_placement_operations", "mediator_binding_operations",
  "productive_complex_operations", "verification_operations", "replacement_operations",
  "resynthesis_operations", "mediator_release_operations", "mediator_leak_operations",
]);

export function canonicalCmbX01(value) {
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    return JSON.stringify(value);
  }
  if (typeof value === "number" && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalCmbX01).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => {
      if (value[key] === undefined) throw new TypeError(`Undefined canonical field ${key}.`);
      return `${JSON.stringify(key)}:${canonicalCmbX01(value[key])}`;
    }).join(",")}}`;
  }
  throw new TypeError(`Unsupported canonical value ${typeof value}.`);
}

export function sha256CmbX01(value) {
  return createHash("sha256").update(value).digest("hex");
}

function hashObject(value) {
  return sha256CmbX01(canonicalCmbX01(value));
}

export function exactKeys(value, keys) {
  return value && typeof value === "object" && !Array.isArray(value)
    && canonicalCmbX01(Object.keys(value).sort()) === canonicalCmbX01([...keys].sort());
}

function count(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function probabilityPpm(value) {
  return count(value) && value <= 1_000_000;
}

function hash64(value) {
  return typeof value === "string" && /^[0-9a-f]{64}$/u.test(value);
}

export function cmbX01ConstructionPayload(record) {
  const payload = { ...record };
  delete payload.integrity;
  return payload;
}

export function buildCmbX01ConstructionRecord({
  seed,
  world,
  arm,
  config = CMB_X01_SMOKE_CONFIG,
}) {
  const checked = validateCmbX01Config(config);
  const simulation = simulateCmbX01Arm({ seed, world, arm, config: checked });
  const payload = {
    schema: 1,
    contract_version: CMB_X01_CONSTRUCTION_CONTRACT_VERSION,
    generator_version: CMB_X01_GENERATOR_VERSION,
    artifact: "fixture-029",
    track: "CMB-X01",
    claim_scope: ["C-1574"],
    record_kind: CMB_X01_RECORD_KIND,
    status: "non-integrated-development-construction-only",
    profile: checked.profile,
    partition: "public-development-only",
    seed,
    world_index: world.world_index,
    world_id: world.world_id,
    generator_family: world.generator_family,
    arm,
    config_sha256: hashObject(checked),
    public_contract: world.public_contract,
    evaluator_parameters: world.evaluator_parameters,
    evaluator_disclosed_only_after_policy_decision: true,
    paired_exogenous_sha256: simulation.paired_exogenous_sha256,
    policy_input_sha256: simulation.policy_input_sha256,
    policy_action_sha256: simulation.policy_action_sha256,
    policy_oracle_access: simulation.policy_oracle_access,
    action_authority_sha256: simulation.action_authority_sha256,
    action_authority: "same-versioned-engine-service-and-verified-removal-authority-for-every-destructive-arm",
    counterfactual_draw_domain: simulation.counterfactual_draw_domain,
    mechanism: simulation.mechanism,
    outcomes: simulation.outcomes,
    resources: simulation.resources,
    inventories: simulation.inventories,
    gates: simulation.gates,
    gate_thresholds: {
      minimum_accepted_service_fraction_ppm: checked.minimum_accepted_service_fraction_ppm,
      maximum_useful_deletions: checked.maximum_useful_deletions,
      maximum_harmful_target_fraction_ppm: checked.maximum_harmful_target_fraction_ppm,
      maximum_harmful_miss_fraction_ppm: checked.maximum_harmful_miss_fraction_ppm,
      maximum_queue_p99_steps: checked.maximum_queue_p99_steps,
      maximum_queue_pending_fraction_ppm: checked.maximum_queue_pending_fraction_ppm,
    },
    process_metadata: simulation.process_metadata,
    units: {
      target: "target-instance",
      engine: "engine-service-slot",
      mediator: "mediator-instance",
      service: "NSU",
      time: "step",
      bytes: "B",
      energy: "not-measured",
    },
    result_label: "NO_RESULT",
    no_result: true,
    measured_energy_present: false,
    energy_conclusion_allowed: false,
    comparison_inference_permitted: false,
    claim_eligible: false,
    scientific_result: false,
    performance_result: false,
    interpretation: CMB_X01_INTERPRETATION,
  };
  const record = Object.freeze({
    ...payload,
    integrity: Object.freeze({ payload_sha256: hashObject(payload) }),
  });
  return assertCmbX01ConstructionRecord(record, { config: checked });
}

export function assertCmbX01ConstructionRecord(record, { config = CMB_X01_SMOKE_CONFIG } = {}) {
  const checked = validateCmbX01Config(config);
  const publicContract = record?.public_contract ?? {};
  const authority = publicContract.action_authority ?? {};
  const p = record?.evaluator_parameters ?? {};
  const mechanism = record?.mechanism ?? {};
  const outcomes = record?.outcomes ?? {};
  const resources = record?.resources ?? {};
  const inventories = record?.inventories ?? {};
  const target = inventories.target ?? {};
  const engine = inventories.engine ?? {};
  const mediator = inventories.mediator ?? {};
  const gates = record?.gates ?? {};
  const thresholds = record?.gate_thresholds ?? {};
  const process = record?.process_metadata ?? {};
  const expectedLogicalOperations = OPERATION_RESOURCE_KEYS.reduce(
    (total, key) => total + (resources[key] ?? Number.NaN), 0,
  );
  const expectedTargetCreated = outcomes.targets_initial + outcomes.target_arrivals
    + outcomes.target_resyntheses + outcomes.target_replacements;
  const targetConservation = target.created === target.removed + target.present_end;
  const engineConservation = engine.service_capacity === engine.service_used + engine.service_idle;
  const mediatorConservation = mediator.created === mediator.free_end + mediator.bound_end
    + mediator.consumed + mediator.leaked;
  const completionCountsValid = Array.isArray(mediator.verified_completion_counts)
    && mediator.verified_completion_counts.every(count);
  const expectedReuse = completionCountsValid
    ? mediator.verified_completion_counts.reduce(
      (total, completions) => total + Math.max(0, completions - 1), 0,
    ) : Number.NaN;
  const expectedMediatorsReused = completionCountsValid
    ? mediator.verified_completion_counts.filter((completions) => completions > 1).length
    : Number.NaN;
  const expectedMaximumCompletions = completionCountsValid && mediator.verified_completion_counts.length > 0
    ? Math.max(...mediator.verified_completion_counts) : 0;
  const queueConservation = resources.queue_insert_operations
    === resources.queue_pop_operations + outcomes.queue_pending_end
      + outcomes.direct_capacity_misses;
  const expectedBytesRead = (resources.evidence_reads + resources.verification_operations)
      * publicContract.target_metadata_bytes
    + resources.queue_pop_operations * publicContract.queue_entry_bytes;
  const expectedBytesWritten = resources.queue_insert_operations * publicContract.queue_entry_bytes
    + (outcomes.target_arrivals + outcomes.target_resyntheses + outcomes.target_replacements)
      * publicContract.target_metadata_bytes;
  const resourcesComplete = CMB_X01_RESOURCE_KEYS.every((key) => count(resources[key]))
    && queueConservation
    && resources.bytes_read === expectedBytesRead
    && resources.bytes_written === expectedBytesWritten
    && resources.registry_byte_steps === publicContract.target_slots
      * publicContract.horizon_steps * publicContract.target_metadata_bytes
    && resources.suppression_byte_steps
      === (outcomes.harmful_suppression_steps + outcomes.useful_suppression_steps)
        * publicContract.suppression_state_bytes;
  const taskGate = outcomes.potential_service_nsu === 0
    || outcomes.accepted_service_nsu * 1_000_000
      >= outcomes.potential_service_nsu * thresholds.minimum_accepted_service_fraction_ppm;
  const harmGate = outcomes.harmful_target_steps * 1_000_000
      <= publicContract.target_slots * publicContract.horizon_steps
        * thresholds.maximum_harmful_target_fraction_ppm
    && outcomes.harmful_misses_end * 1_000_000
      <= publicContract.target_slots * thresholds.maximum_harmful_miss_fraction_ppm;
  const observedQueueTailGate = outcomes.queue_wait_p99_steps === null
    ? outcomes.queue_pending_end === 0
    : outcomes.queue_wait_p99_steps <= thresholds.maximum_queue_p99_steps;
  const pendingQueueGate = outcomes.queue_pending_end * 1_000_000
    <= publicContract.target_slots * thresholds.maximum_queue_pending_fraction_ppm;
  const queueTailGate = observedQueueTailGate && pendingQueueGate;
  const protectedGate = outcomes.useful_target_deletions <= thresholds.maximum_useful_deletions
    && taskGate && harmGate && queueTailGate;
  const destructive = CMB_X01_DESTRUCTIVE_ARMS.includes(record?.arm);
  const mediatorArm = record?.arm === "X01-RECRUIT" || record?.arm === "X01-ORACLE";
  let regeneratedContractMatches = false;
  try {
    const regeneratedWorlds = generateCmbX01Worlds({ seed: record.seed, config: checked });
    const regeneratedWorld = regeneratedWorlds[record.world_index];
    if (regeneratedWorld && CMB_X01_ARMS.includes(record.arm)) {
      const regenerated = simulateCmbX01Arm({
        seed: record.seed,
        world: regeneratedWorld,
        arm: record.arm,
        config: checked,
      });
      regeneratedContractMatches = (
        record.world_id === regeneratedWorld.world_id
        && record.generator_family === regeneratedWorld.generator_family
        && canonicalCmbX01(publicContract) === canonicalCmbX01(regeneratedWorld.public_contract)
        && canonicalCmbX01(p) === canonicalCmbX01(regeneratedWorld.evaluator_parameters)
        && record.paired_exogenous_sha256 === regenerated.paired_exogenous_sha256
        && record.policy_input_sha256 === regenerated.policy_input_sha256
        && record.policy_action_sha256 === regenerated.policy_action_sha256
        && record.policy_oracle_access === regenerated.policy_oracle_access
        && record.action_authority_sha256 === regenerated.action_authority_sha256
        && record.counterfactual_draw_domain === regenerated.counterfactual_draw_domain
        && canonicalCmbX01(mechanism) === canonicalCmbX01(regenerated.mechanism)
        && canonicalCmbX01(outcomes) === canonicalCmbX01(regenerated.outcomes)
        && canonicalCmbX01(resources) === canonicalCmbX01(regenerated.resources)
        && canonicalCmbX01(inventories) === canonicalCmbX01(regenerated.inventories)
        && canonicalCmbX01(gates) === canonicalCmbX01(regenerated.gates)
        && canonicalCmbX01(process) === canonicalCmbX01(regenerated.process_metadata)
      );
    }
  } catch {
    regeneratedContractMatches = false;
  }
  const familyMechanismValid = (
    (record?.generator_family !== "perfect-evidence" || mechanism.perfect_evidence === true)
    && (record?.generator_family !== "no-harmful-targets" || mechanism.harmful_targets_possible === false)
    && (record?.generator_family !== "no-engine" || mechanism.engine_available === false)
    && (record?.generator_family !== "zero-productive-geometry"
      || mechanism.productive_geometry_possible === false)
    && (record?.generator_family !== "binary-saturation" || mechanism.mediator_saturation === true)
    && (record?.generator_family !== "no-resynthesis-or-replacement"
      || (mechanism.resynthesis_enabled === false && mechanism.replacement_enabled === false))
    && (record?.generator_family !== "cross-compartment-leakage"
      || mechanism.mediator_leakage_possible === true)
  );

  if (
    !exactKeys(record, RECORD_KEYS)
    || !exactKeys(publicContract, PUBLIC_CONTRACT_KEYS)
    || !exactKeys(authority, AUTHORITY_KEYS)
    || !exactKeys(p, EVALUATOR_KEYS)
    || !exactKeys(mechanism, MECHANISM_KEYS)
    || !exactKeys(outcomes, CMB_X01_OUTCOME_KEYS)
    || !exactKeys(resources, CMB_X01_RESOURCE_KEYS)
    || !exactKeys(inventories, ["target", "engine", "mediator"])
    || !exactKeys(target, ["created", "removed", "present_end"])
    || !exactKeys(engine, ["service_capacity", "service_used", "service_idle"])
    || !exactKeys(mediator, [
      "created", "free_end", "bound_end", "consumed", "leaked", "verified_completion_counts",
    ])
    || !exactKeys(gates, GATE_KEYS)
    || !exactKeys(thresholds, [
      "minimum_accepted_service_fraction_ppm", "maximum_useful_deletions",
      "maximum_harmful_target_fraction_ppm", "maximum_harmful_miss_fraction_ppm",
      "maximum_queue_p99_steps", "maximum_queue_pending_fraction_ppm",
    ])
    || !exactKeys(process, [
      "execution_model", "maximum_concurrency", "aggregate_record_only",
      "protocol_native_action_events_present", "per_arm_cpu_time_measured",
      "per_arm_wall_time_measured", "per_arm_peak_memory_measured", "measurement_boundary",
    ])
    || !exactKeys(record?.units, ["target", "engine", "mediator", "service", "time", "bytes", "energy"])
    || !exactKeys(record?.integrity, ["payload_sha256"])
    || !regeneratedContractMatches
    || record.schema !== 1
    || record.contract_version !== CMB_X01_CONSTRUCTION_CONTRACT_VERSION
    || record.generator_version !== CMB_X01_GENERATOR_VERSION
    || record.artifact !== "fixture-029"
    || record.track !== "CMB-X01"
    || canonicalCmbX01(record.claim_scope) !== canonicalCmbX01(["C-1574"])
    || record.record_kind !== CMB_X01_RECORD_KIND
    || record.status !== "non-integrated-development-construction-only"
    || record.profile !== checked.profile
    || record.partition !== "public-development-only"
    || !count(record.seed) || record.seed > 0xffff_ffff
    || !count(record.world_index)
    || !hash64(record.world_id)
    || !CMB_X01_FAMILIES.includes(record.generator_family)
    || !CMB_X01_ARMS.includes(record.arm)
    || record.config_sha256 !== hashObject(checked)
    || !count(publicContract.target_slots) || publicContract.target_slots !== checked.target_slots_per_world
    || !count(publicContract.horizon_steps) || publicContract.horizon_steps !== checked.horizon_steps
    || publicContract.target_version !== 1
    || publicContract.action_score_threshold_ppm !== checked.action_score_threshold_ppm
    || publicContract.garbage_collection_period_steps !== checked.garbage_collection_period_steps
    || !count(publicContract.mediator_inventory_declared)
    || publicContract.target_metadata_bytes !== checked.target_metadata_bytes
    || publicContract.queue_entry_bytes !== checked.queue_entry_bytes
    || publicContract.mediator_state_bytes !== checked.mediator_state_bytes
    || publicContract.suppression_state_bytes !== checked.suppression_state_bytes
    || authority.authority_id !== "cmb-x01-maintenance-authority-v1"
    || authority.engine_class !== "typed-maintenance-engine-v1"
    || authority.engine_capacity_per_step !== p.engine_capacity_per_step
    || canonicalCmbX01(authority.permitted_target_classes)
      !== canonicalCmbX01(["cache-entry", "transient-worker"])
    || authority.permitted_destructive_action !== "verified-remove-v1"
    || authority.destructive_verification_required !== true
    || authority.replacement_authorized !== p.replacement_enabled
    || publicContract.mediator_inventory_declared !== p.mediator_inventory
    || [
      p.initial_occupancy_ppm, p.initial_harmful_ppm, p.arrival_ppm, p.arrival_harmful_ppm,
      p.harmful_conversion_ppm, p.useful_recovery_ppm, p.resynthesis_ppm,
      p.resynthesis_harmful_ppm, p.evidence_sensitivity_ppm, p.evidence_false_positive_ppm,
      p.productive_geometry_ppm, p.mediator_leakage_ppm,
    ].some((value) => !probabilityPpm(value))
    || !count(p.evidence_delay_steps) || !count(p.engine_capacity_per_step)
    || !count(p.mediator_inventory)
    || typeof p.target_mediator_compatible !== "boolean"
    || typeof p.mediator_engine_compatible !== "boolean"
    || typeof p.mediator_reuse_enabled !== "boolean"
    || typeof p.replacement_enabled !== "boolean"
    || typeof p.binary_saturation !== "boolean"
    || Object.values(mechanism).some((value) => typeof value !== "boolean")
    || !familyMechanismValid
    || record.evaluator_disclosed_only_after_policy_decision !== true
    || !hash64(record.paired_exogenous_sha256)
    || !hash64(record.policy_input_sha256)
    || !hash64(record.policy_action_sha256)
    || record.policy_oracle_access !== (record.arm === "X01-ORACLE")
    || record.action_authority_sha256 !== hashObject(authority)
    || record.action_authority
      !== "same-versioned-engine-service-and-verified-removal-authority-for-every-destructive-arm"
    || record.counterfactual_draw_domain !== CMB_X01_COUNTERFACTUAL_DRAW_DOMAIN
    || record.counterfactual_draw_domain.includes(record.arm)
    || CMB_X01_OUTCOME_KEYS.filter((key) => !new Set([
      "queue_wait_p95_steps", "queue_wait_p99_steps",
    ]).has(key)).some((key) => !count(outcomes[key]))
    || (outcomes.queue_wait_p95_steps !== null && !count(outcomes.queue_wait_p95_steps))
    || (outcomes.queue_wait_p99_steps !== null && !count(outcomes.queue_wait_p99_steps))
    || ((outcomes.queue_wait_p95_steps === null) !== (outcomes.queue_wait_p99_steps === null))
    || (outcomes.queue_wait_p95_steps !== null
      && outcomes.queue_wait_p99_steps < outcomes.queue_wait_p95_steps)
    || outcomes.target_slots !== publicContract.target_slots
    || !CMB_X01_RESOURCE_KEYS.every((key) => count(resources[key]))
    || resources.logical_operations !== expectedLogicalOperations
    || ![target.created, target.removed, target.present_end, engine.service_capacity,
      engine.service_used, engine.service_idle, mediator.created, mediator.free_end,
      mediator.bound_end, mediator.consumed, mediator.leaked].every(count)
    || !completionCountsValid
    || target.created !== expectedTargetCreated
    || target.removed !== outcomes.completed_removals
    || engine.service_capacity !== p.engine_capacity_per_step * publicContract.horizon_steps
    || engine.service_used !== outcomes.queue_service_attempts
    || engine.service_used !== resources.engine_service_operations
    || (destructive ? engine.service_used > engine.service_capacity : engine.service_used !== 0)
    || mediator.created !== (mediatorArm ? p.mediator_inventory : 0)
    || mediator.verified_completion_counts.length !== mediator.created
    || outcomes.verified_mediator_reuses !== expectedReuse
    || outcomes.mediators_with_verified_reuse !== expectedMediatorsReused
    || outcomes.maximum_verified_completions_per_mediator !== expectedMaximumCompletions
    || (mediatorArm
      ? resources.mediator_binding_operations !== engine.service_used
      : resources.mediator_binding_operations !== 0)
    || outcomes.productive_recruitment_events > resources.mediator_binding_operations
    || outcomes.completed_removals > resources.verification_operations
    || Object.values(gates).some((value) => typeof value !== "boolean")
    || gates.observation_evaluator_separation !== (record.arm !== "X01-ORACLE")
    || gates.destructive_action_authority_parity !== (engine.service_used <= engine.service_capacity)
    || gates.target_conservation_pass !== targetConservation
    || gates.engine_conservation_pass !== engineConservation
    || gates.mediator_conservation_pass !== mediatorConservation
    || gates.resource_ledger_complete !== resourcesComplete
    || gates.task_gate_pass !== taskGate
    || gates.harm_gate_pass !== harmGate
    || gates.queue_tail_gate_pass !== queueTailGate
    || gates.protected_gate_pass !== protectedGate
    || gates.verified_mediator_reuse_pass !== (outcomes.verified_mediator_reuses === expectedReuse)
    || thresholds.minimum_accepted_service_fraction_ppm
      !== checked.minimum_accepted_service_fraction_ppm
    || thresholds.maximum_useful_deletions !== checked.maximum_useful_deletions
    || thresholds.maximum_harmful_target_fraction_ppm
      !== checked.maximum_harmful_target_fraction_ppm
    || thresholds.maximum_harmful_miss_fraction_ppm
      !== checked.maximum_harmful_miss_fraction_ppm
    || thresholds.maximum_queue_p99_steps !== checked.maximum_queue_p99_steps
    || thresholds.maximum_queue_pending_fraction_ppm
      !== checked.maximum_queue_pending_fraction_ppm
    || process.execution_model
      !== "single-process-deterministic-aggregate-construction-simulation"
    || process.maximum_concurrency !== 1
    || process.aggregate_record_only !== true
    || process.protocol_native_action_events_present !== false
    || process.per_arm_cpu_time_measured !== false
    || process.per_arm_wall_time_measured !== false
    || process.per_arm_peak_memory_measured !== false
    || process.measurement_boundary
      !== "construction diagnostics exclude comparative timing and energy endpoints"
    || canonicalCmbX01(record.units) !== canonicalCmbX01({
      target: "target-instance", engine: "engine-service-slot", mediator: "mediator-instance",
      service: "NSU", time: "step", bytes: "B", energy: "not-measured",
    })
    || record.result_label !== "NO_RESULT"
    || record.no_result !== true
    || record.measured_energy_present !== false
    || record.energy_conclusion_allowed !== false
    || record.comparison_inference_permitted !== false
    || record.claim_eligible !== false
    || record.scientific_result !== false
    || record.performance_result !== false
    || record.interpretation !== CMB_X01_INTERPRETATION
    || !hash64(record.integrity.payload_sha256)
    || record.integrity.payload_sha256 !== hashObject(cmbX01ConstructionPayload(record))
  ) throw new Error("CMB-X01 aggregate construction record violates its frozen contract.");
  return record;
}
