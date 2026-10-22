import { createHash } from "node:crypto";
import { lstat, readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { canonicalJson } from "../lib/canonical-json.mjs";

import {
  CONFIRMATION_PREFLIGHT_VERSION,
  evaluateConfirmationPreflight,
} from "./confirmation-preflight.mjs";
import {
  ENERGY_BLOCK_SCHEDULE_VERSION,
  buildCounterbalancedEnergyBlockSchedule,
} from "./energy-acquisition.mjs";
import {
  RELEASE_CONTRACT_VERSION,
  openFrozenSeedRelease,
} from "./release-contract.mjs";
import {
  SEED_RELEASE_OPERATOR_VERSION,
  SEED_RELEASE_PLAN_VERSION,
  SEED_REVEAL_ATTESTATION_VERSION,
} from "./seed-release-operator.mjs";
import {
  assertDisjointSeedPacks,
  seedListCommitment,
  validateSeedList,
} from "./seeds/seed-pack.mjs";

export const RELEASE_CONTRACT_V4_VERSION = "candidate-010.frozen-seed-release.v4";
export const FIXTURE_ENERGY_PLAN_VERSION = "candidate-010.paired-energy-acquisition-plan.v1";

const SHA256 = /^[0-9a-f]{64}$/u;
const SHA1_OR_SHA256_COMMIT = /^[0-9a-f]{40,64}$/u;
const PARTITIONS = Object.freeze(["confirmation", "held-out"]);
const SNAPSHOT_NAMES = Object.freeze([
  "source_bundle",
  "execution_descriptor",
  "runtime_identity",
  "config",
  "design",
  "backend_registry",
  "preregistration",
]);
const V4_BINDING_NAMES = Object.freeze([
  "base_release",
  "seed_release_plan",
  "seed_reveal_attestation",
  "confirmation_preflight",
  "energy_acquisition_plan",
  "energy_block_schedule",
  "held_out_commitment",
  "held_out_reveal",
]);

/** Machine-readable boundary for a future runner/Gate9 adapter. */
export const RELEASE_V4_ADAPTER_CONTRACT = Object.freeze({
  contract_version: RELEASE_CONTRACT_V4_VERSION,
  mode: "fixture-only",
  create_inputs: Object.freeze([
    "bindingRoot", "sourceRoot", "releaseVersion", "baseReleasePath", "seedReleasePlanPath",
    "seedRevealAttestationPath", "confirmationPreflightPath", "energyAcquisitionPlanPath",
    "energyBlockSchedulePath", "heldOutCommitmentPath", "heldOutRevealPath",
    "executionDescriptor", "runtimeIdentity",
  ]),
  open_inputs: Object.freeze([
    "bindingRoot", "sourceRoot", "releasePath", "executionDescriptor", "runtimeIdentity",
  ]),
  bound_artifacts: V4_BINDING_NAMES,
  analyzer_handoff: Object.freeze({
    schedule_identity: "paired_energy_identity.schedule_sha256",
    acquisition_policy_identity: "paired_energy_identity.acquisition_policy_sha256",
    seed_unit: "seed",
    required_aggregation: "blocks-and-scenarios-within-seed-before-inference",
  }),
  authority: Object.freeze({
    claim_eligible: false,
    promotion_authority: false,
    real_measurements_present: false,
    aggregate_analysis_present: false,
  }),
});

function canonical(value) {
  return canonicalJson(value, { label: "Release-v4" });
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function digestDocument(document, digestName) {
  const { [digestName]: ignored, ...body } = document;
  void ignored;
  return sha256(canonical(body));
}

function exactKeys(value, keys) {
  return value
    && typeof value === "object"
    && !Array.isArray(value)
    && canonical(Object.keys(value).sort()) === canonical([...keys].sort());
}

function requireExact(value, keys, label) {
  if (!exactKeys(value, keys)) throw new Error(`${label} has an invalid exact shape.`);
  return value;
}

function requireSha256(value, label) {
  if (typeof value !== "string" || !SHA256.test(value)) {
    throw new Error(`${label} must be a lowercase SHA-256 digest.`);
  }
  return value;
}

function requirePositiveInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 1) throw new Error(`${label} must be a positive safe integer.`);
  return value;
}

function requireNonempty(value, label) {
  if (typeof value !== "string" || value.length === 0 || value.trim() !== value) {
    throw new Error(`${label} must be a non-empty trimmed string.`);
  }
  return value;
}

function equalNumber(left, right) {
  return Number.isFinite(left)
    && Number.isFinite(right)
    && Math.abs(left - right) <= Number.EPSILON * Math.max(1, Math.abs(left), Math.abs(right)) * 8;
}

function normalizedPath(value) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error("Release-v4 binding paths must be non-empty strings.");
  }
  const normalized = value.replaceAll("\\", "/");
  if (
    path.isAbsolute(value)
    || normalized === ".."
    || normalized.startsWith("../")
    || normalized.includes("/../")
  ) throw new Error(`Release-v4 binding path escapes its root: ${value}`);
  return normalized;
}

function samePath(left, right) {
  return path.relative(left, right) === "" && path.relative(right, left) === "";
}

function inside(root, target) {
  const relation = path.relative(root, target);
  return relation === "" || (!relation.startsWith("..") && !path.isAbsolute(relation));
}

async function strictDirectory(value, label) {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${label} must be a non-empty path.`);
  const absolute = path.resolve(value);
  const information = await lstat(absolute);
  if (!information.isDirectory() || information.isSymbolicLink()) {
    throw new Error(`${label} must be a real directory, not a link or reparse point.`);
  }
  const resolved = await realpath(absolute);
  if (!samePath(absolute, resolved)) throw new Error(`${label} refuses linked traversal.`);
  return resolved;
}

async function containedRegularFile(root, relative, label) {
  const normalized = normalizedPath(relative);
  const absolute = path.resolve(root, ...normalized.split("/"));
  if (!inside(root, absolute) || samePath(root, absolute)) throw new Error(`${label} escapes its root.`);
  let current = root;
  for (const component of path.relative(root, absolute).split(path.sep).filter(Boolean)) {
    current = path.join(current, component);
    const information = await lstat(current);
    if (information.isSymbolicLink()) throw new Error(`${label} refuses linked traversal.`);
  }
  const [information, resolved] = await Promise.all([lstat(absolute), realpath(absolute)]);
  if (!information.isFile() || information.isSymbolicLink() || !inside(root, resolved)) {
    throw new Error(`${label} must be a contained regular file.`);
  }
  return resolved;
}

async function createBinding(root, relative, name) {
  const normalized = normalizedPath(relative);
  const body = await readFile(await containedRegularFile(root, normalized, `Release-v4 ${name}`));
  return Object.freeze({ path: normalized, sha256: sha256(body) });
}

async function readBinding(root, binding, name) {
  requireExact(binding, ["path", "sha256"], `Release-v4 ${name} binding`);
  requireSha256(binding.sha256, `Release-v4 ${name} binding hash`);
  const file = await containedRegularFile(root, binding.path, `Release-v4 ${name}`);
  const body = await readFile(file);
  if (sha256(body) !== binding.sha256) throw new Error(`Release-v4 ${name} binding hash mismatch.`);
  return { file, body };
}

function parseJson(body, label) {
  try {
    return JSON.parse(body.toString("utf8"));
  } catch (error) {
    throw new Error(`${label} is not valid JSON: ${error.message}`, { cause: error });
  }
}

function assertPreflightExactShapes(document) {
  requireExact(document, [
    "kind", "status", "claim_eligible", "authority", "seeds_generated", "seeds_revealed",
    "statistical_plan", "design", "pilot_projection", "resource_caps", "meter_block",
    "identities", "projected_resources", "preflight_sha256",
  ], "Confirmation preflight");
  requireExact(document.statistical_plan, [
    "independent_unit", "alpha_familywise", "power_target", "multiplicity_family_size", "alpha_star",
    "planned_seed_count", "derived_minimum_seed_count", "endpoints",
  ], "Confirmation preflight statistical plan");
  if (!Array.isArray(document.statistical_plan.endpoints) || document.statistical_plan.endpoints.length === 0) {
    throw new Error("Confirmation preflight endpoints must be non-empty.");
  }
  for (const endpoint of document.statistical_plan.endpoints) {
    requireExact(endpoint, [
      "id", "test", "pilot_variance", "pilot_input_sha256", "variance_unit",
      "minimum_relevant_effect", "noninferiority_margin", "alpha_star", "required_seed_count",
    ], "Confirmation preflight endpoint");
  }
  requireExact(document.design, [
    "scenario_count", "arm_count", "opportunities_per_seed_scenario", "blocks_per_seed_scenario",
  ], "Confirmation preflight design");
  requireExact(document.pilot_projection, [
    "projection_basis_sha256", "p99_work_unit_time_ms", "p99_work_unit_bytes",
    "p99_meter_boundary_time_ms", "p99_block_index_bytes", "measurement_session_count",
    "p99_files_per_measurement_session", "fixed_artifact_files", "fixed_artifact_bytes",
    "meter_sample_rate_hz", "meter_bytes_per_sample", "setup_time_ms",
  ], "Confirmation preflight pilot projection");
  requireExact(document.resource_caps, [
    "max_records", "max_measurement_blocks", "max_raw_bytes", "max_meter_log_bytes", "max_files",
    "minimum_free_disk_reserve_bytes", "available_free_disk_bytes", "max_wall_time_s",
  ], "Confirmation preflight resource caps");
  requireExact(document.meter_block, [
    "measurement_semantics", "minimum_actual_samples", "maximum_clock_uncertainty_ms",
    "minimum_block_duration_ms", "minimum_duration_to_clock_uncertainty_ratio", "meter_resolution_j",
    "expanded_measurement_uncertainty_j", "minimum_expected_block_energy_j",
    "minimum_energy_to_resolution_uncertainty_ratio",
  ], "Confirmation preflight meter block");
  requireExact(document.identities, [
    "hardware", "meter", "calibration", "clock", "thermal_protocol", "power_plan",
  ], "Confirmation preflight identities");
  for (const [name, identity] of Object.entries(document.identities)) {
    requireExact(identity, ["id", "identity_sha256"], `Confirmation preflight ${name} identity`);
  }
  requireExact(document.projected_resources, [
    "records", "measurement_blocks", "raw_bytes", "meter_log_bytes", "total_bytes", "files",
    "wall_time_s", "required_free_disk_bytes",
  ], "Confirmation preflight projected resources");
}

function validatePreflight(document) {
  assertPreflightExactShapes(document);
  const input = {
    statistical_plan: {
      independent_unit: document.statistical_plan.independent_unit,
      alpha_familywise: document.statistical_plan.alpha_familywise,
      power_target: document.statistical_plan.power_target,
      multiplicity_family_size: document.statistical_plan.multiplicity_family_size,
      planned_seed_count: document.statistical_plan.planned_seed_count,
      endpoints: document.statistical_plan.endpoints.map((endpoint) => ({
        id: endpoint.id,
        test: endpoint.test,
        pilot_variance: endpoint.pilot_variance,
        pilot_input_sha256: endpoint.pilot_input_sha256,
        variance_unit: endpoint.variance_unit,
        minimum_relevant_effect: endpoint.minimum_relevant_effect,
        noninferiority_margin: endpoint.noninferiority_margin,
      })),
    },
    design: document.design,
    pilot_projection: document.pilot_projection,
    resource_caps: document.resource_caps,
    meter_block: document.meter_block,
    identities: document.identities,
  };
  let rebuilt;
  try {
    rebuilt = evaluateConfirmationPreflight(input);
  } catch (error) {
    throw new Error(`Confirmation preflight cannot be reproduced: ${error.message}`, { cause: error });
  }
  if (canonical(rebuilt) !== canonical(document)) {
    throw new Error("Confirmation preflight differs from its exact deterministic reconstruction.");
  }
  if (
    document.kind !== CONFIRMATION_PREFLIGHT_VERSION
    || document.status !== "passed"
    || document.claim_eligible !== false
    || document.seeds_generated !== false
    || document.seeds_revealed !== false
  ) throw new Error("Confirmation preflight is not a passed seed-free claim-ineligible artifact.");
  return document;
}

function extractScheduleScenariosAndArms(schedule, manifests) {
  const scenarios = new Map();
  const seeds = new Set();
  for (const manifest of manifests) seeds.add(manifest.seed);
  for (const block of schedule.blocks) {
    if (!block || typeof block !== "object" || Array.isArray(block)) {
      throw new Error("Energy schedule contains a malformed block.");
    }
    const identity = {
      scenario_id: block.scenario_id,
      task_family: block.task_family,
      backend_id: block.backend_id,
    };
    const previous = scenarios.get(block.scenario_id);
    if (previous && canonical(previous) !== canonical(identity)) {
      throw new Error(`Energy schedule changes the identity of scenario ${block.scenario_id}.`);
    }
    scenarios.set(block.scenario_id, identity);
  }
  const firstCluster = schedule.blocks.find((block) => block.phase === "warmup")?.cluster_id;
  const arms = schedule.blocks
    .filter((block) => block.phase === "warmup" && block.cluster_id === firstCluster)
    .sort((left, right) => left.sequence - right.sequence)
    .map((block) => block.arm);
  if (arms.length < 2 || new Set(arms).size !== arms.length) {
    throw new Error("Energy schedule does not expose one exact initial warmup arm order.");
  }
  return {
    scenarios: [...scenarios.values()].sort((left, right) => left.scenario_id.localeCompare(right.scenario_id)),
    seeds: [...seeds].sort((left, right) => left - right),
    arms,
  };
}

function scheduleComponents(schedule) {
  requireExact(schedule, [
    "schema", "contract_version", "run_id", "purpose", "claim_eligibility",
    "analysis_contract_status", "meter_capability", "fixed_work", "ordered_input_manifests",
    "counterbalancing", "idle_policy", "stop_policy", "aggregation_requirement", "blocks",
    "schedule_sha256",
  ], "Energy block schedule");
  requireNonempty(schedule.run_id, "Energy schedule run_id");
  requireExact(schedule.fixed_work, [
    "opportunities_per_block", "opportunity_repetitions", "measurement_repetitions", "warmup_opportunities",
  ], "Energy schedule fixed work");
  requireExact(schedule.meter_capability, [
    "sample_interval_s", "energy_resolution_j", "minimum_block_duration_s", "minimum_energy_delta_j",
    "minimum_samples_per_block", "minimum_resolution_quanta", "maximum_clock_uncertainty_s",
    "minimum_signal_to_expanded_uncertainty",
  ], "Energy schedule meter capability");
  if (!Array.isArray(schedule.ordered_input_manifests) || schedule.ordered_input_manifests.length === 0) {
    throw new Error("Energy schedule must contain ordered input manifests.");
  }
  const manifests = schedule.ordered_input_manifests.map((manifest) => {
    requireExact(manifest, [
      "input_manifest_id", "scenario_id", "seed", "ordered_opportunity_ids", "input_manifest_sha256",
    ], "Energy schedule input manifest");
    return {
      input_manifest_id: manifest.input_manifest_id,
      scenario_id: manifest.scenario_id,
      seed: manifest.seed,
      ordered_opportunity_ids: manifest.ordered_opportunity_ids,
    };
  });
  if (!Array.isArray(schedule.blocks) || schedule.blocks.length === 0) {
    throw new Error("Energy schedule must contain blocks.");
  }
  const extracted = extractScheduleScenariosAndArms(schedule, manifests);
  return {
    ...extracted,
    manifests,
  };
}

function validateSchedule(schedule) {
  const components = scheduleComponents(schedule);
  let rebuilt;
  try {
    rebuilt = buildCounterbalancedEnergyBlockSchedule({
      run_id: schedule.run_id,
      scenarios: components.scenarios,
      seeds: components.seeds,
      arms: components.arms,
      ordered_input_manifests: components.manifests,
      opportunities_per_block: schedule.fixed_work.opportunities_per_block,
      opportunity_repetitions: schedule.fixed_work.opportunity_repetitions,
      measurement_repetitions: schedule.fixed_work.measurement_repetitions,
      warmup_opportunities: schedule.fixed_work.warmup_opportunities,
      meter_capability: schedule.meter_capability,
    });
  } catch (error) {
    throw new Error(`Energy block schedule cannot be reproduced: ${error.message}`, { cause: error });
  }
  if (canonical(rebuilt) !== canonical(schedule)) {
    throw new Error("Energy block schedule differs from its exact deterministic reconstruction.");
  }
  if (
    schedule.contract_version !== ENERGY_BLOCK_SCHEDULE_VERSION
    || schedule.claim_eligibility !== "ineligible-until-aggregate-confirmatory-contract"
    || schedule.analysis_contract_status !== "not-implemented"
  ) throw new Error("Energy block schedule is not the required claim-ineligible pre-analysis schedule.");
  return { schedule, components };
}

function requireSchedulePreflightAgreement(preflight, schedule, components) {
  const measureBlocks = schedule.blocks.filter((block) => block.phase === "measure");
  const observedBlocks = schedule.blocks.filter((block) => block.observed);
  const scenarioCount = components.scenarios.length;
  const seedCount = components.seeds.length;
  const armCount = components.arms.length;
  const opportunitiesPerSeedScenario = schedule.fixed_work.opportunities_per_block
    * schedule.fixed_work.opportunity_repetitions
    * schedule.fixed_work.measurement_repetitions;
  const checks = [
    [preflight.design.scenario_count, scenarioCount, "scenario count"],
    [preflight.design.arm_count, armCount, "arm count"],
    [preflight.statistical_plan.planned_seed_count, seedCount, "planned seed count"],
    [preflight.design.opportunities_per_seed_scenario, opportunitiesPerSeedScenario, "opportunity count"],
    [preflight.design.blocks_per_seed_scenario, schedule.fixed_work.measurement_repetitions, "blocks per arm"],
    [preflight.meter_block.minimum_actual_samples, schedule.meter_capability.minimum_samples_per_block, "meter samples"],
    [preflight.meter_block.meter_resolution_j, schedule.meter_capability.energy_resolution_j, "meter resolution"],
    [preflight.meter_block.minimum_expected_block_energy_j, schedule.meter_capability.minimum_energy_delta_j, "energy floor"],
    [preflight.meter_block.minimum_energy_to_resolution_uncertainty_ratio,
      schedule.meter_capability.minimum_resolution_quanta, "resolution ratio"],
  ];
  for (const [left, right, label] of checks) {
    if (!equalNumber(left, right)) throw new Error(`Preflight and energy schedule disagree on ${label}.`);
  }
  if (!equalNumber(
    preflight.meter_block.maximum_clock_uncertainty_ms / 1_000,
    schedule.meter_capability.maximum_clock_uncertainty_s,
  )) throw new Error("Preflight and energy schedule disagree on clock uncertainty.");
  if (!equalNumber(
    preflight.meter_block.minimum_block_duration_ms / 1_000,
    schedule.meter_capability.minimum_block_duration_s,
  )) throw new Error("Preflight and energy schedule disagree on block duration.");
  if (!equalNumber(
    preflight.meter_block.minimum_expected_block_energy_j
      / preflight.meter_block.expanded_measurement_uncertainty_j,
    schedule.meter_capability.minimum_signal_to_expanded_uncertainty,
  )) throw new Error("Preflight and energy schedule disagree on expanded-uncertainty separation.");
  return {
    scenario_count: scenarioCount,
    seed_count: seedCount,
    arm_count: armCount,
    opportunities_per_seed_scenario: opportunitiesPerSeedScenario,
    measurement_repetitions: schedule.fixed_work.measurement_repetitions,
    measurement_block_count: measureBlocks.length,
    observed_block_count: observedBlocks.length,
    schedule_seed_set_sha256: sha256(canonical(components.seeds)),
  };
}

/**
 * Freeze the identity of a paired block-acquisition rehearsal. This is a plan,
 * not an acquisition or analysis result, and can never carry promotion authority.
 */
export function buildFixturePairedEnergyAcquisitionPlan(options) {
  requireExact(options, ["confirmationPreflight", "energyBlockSchedule"], "Fixture energy-plan options");
  const preflight = validatePreflight(options.confirmationPreflight);
  const { schedule, components } = validateSchedule(options.energyBlockSchedule);
  const designIdentity = requireSchedulePreflightAgreement(preflight, schedule, components);
  const meterContract = {
    preflight_meter_block: preflight.meter_block,
    schedule_meter_capability: schedule.meter_capability,
    meter_identity: preflight.identities.meter,
    calibration_identity: preflight.identities.calibration,
    clock_identity: preflight.identities.clock,
  };
  const acquisitionPolicy = {
    measurement_semantics: "paired-counterbalanced-meter-blocks",
    independent_unit: "seed",
    aggregation_requirement: "aggregate blocks and scenarios within seed before confirmatory inference",
    analysis_contract_status: "not-implemented",
    preflight_sha256: preflight.preflight_sha256,
    schedule_sha256: schedule.schedule_sha256,
    hardware_identity: preflight.identities.hardware,
    thermal_protocol_identity: preflight.identities.thermal_protocol,
    power_plan_identity: preflight.identities.power_plan,
    meter_contract_sha256: sha256(canonical(meterContract)),
  };
  const body = {
    schema: 1,
    contract_version: FIXTURE_ENERGY_PLAN_VERSION,
    state: "fixture-plan-frozen",
    artifact: "candidate-010",
    claim_eligible: false,
    authority: "fixture-rehearsal-only",
    measurement_semantics: "paired-counterbalanced-meter-blocks",
    independent_unit: "seed",
    aggregation_requirement: "aggregate blocks and scenarios within seed before confirmatory inference",
    analysis_contract_status: "not-implemented",
    preflight_sha256: preflight.preflight_sha256,
    schedule_sha256: schedule.schedule_sha256,
    run_id: schedule.run_id,
    identities: structuredClone(preflight.identities),
    design_identity: designIdentity,
    meter_contract_sha256: acquisitionPolicy.meter_contract_sha256,
    acquisition_policy_sha256: sha256(canonical(acquisitionPolicy)),
  };
  return Object.freeze({ ...body, plan_sha256: sha256(canonical(body)) });
}

function validateEnergyPlan(plan, preflight, schedule) {
  requireExact(plan, [
    "schema", "contract_version", "state", "artifact", "claim_eligible", "authority",
    "measurement_semantics", "independent_unit", "aggregation_requirement", "analysis_contract_status",
    "preflight_sha256", "schedule_sha256", "run_id", "identities", "design_identity",
    "meter_contract_sha256", "acquisition_policy_sha256", "plan_sha256",
  ], "Paired energy acquisition plan");
  requireExact(plan.design_identity, [
    "scenario_count", "seed_count", "arm_count", "opportunities_per_seed_scenario",
    "measurement_repetitions", "measurement_block_count", "observed_block_count",
    "schedule_seed_set_sha256",
  ], "Paired energy plan design identity");
  const rebuilt = buildFixturePairedEnergyAcquisitionPlan({
    confirmationPreflight: preflight,
    energyBlockSchedule: schedule,
  });
  if (canonical(rebuilt) !== canonical(plan)) {
    throw new Error("Paired energy acquisition plan differs from its exact deterministic reconstruction.");
  }
  return plan;
}

function validateBaseReleaseShape(release) {
  requireExact(release, [
    "schema", "contract_version", "state", "release_version", "partition", "phase",
    "source_identity", "execution_identity", "runtime_identity", "seed_pack", "bindings", "release_sha256",
  ], "Base release");
  requireExact(release.source_identity, ["source_sha256", "source_commit"], "Base release source identity");
  requireExact(release.execution_identity, [
    "descriptor_sha256", "source_inventory_sha256", "dependency_inventory_sha256",
  ], "Base release execution identity");
  requireExact(release.runtime_identity, [
    "identity_sha256", "executable_sha256", "package_lock_sha256",
  ], "Base release runtime identity");
  requireExact(release.seed_pack, ["algorithm", "seed_count", "commitment"], "Base release seed pack");
  requireExact(release.bindings, [
    "source_bundle", "execution_descriptor", "runtime_identity", "config", "design",
    "backend_registry", "preregistration", "commitment", "reveal",
  ], "Base release bindings");
  for (const [name, binding] of Object.entries(release.bindings)) {
    requireExact(binding, ["path", "sha256"], `Base release ${name} binding`);
  }
  if (
    release.contract_version !== RELEASE_CONTRACT_VERSION
    || release.partition !== "confirmation"
    || release.phase !== "confirmation"
  ) throw new Error("Release-v4 fixture evidence requires one confirmation v3 base release.");
  return release;
}

function validateSeedPlan(plan) {
  requireExact(plan, [
    "schema", "contract_version", "state", "artifact", "release_set_id", "release_version",
    "claim_eligible", "generation_method", "source_identity", "execution_identity", "runtime_identity",
    "bindings", "partitions", "cross_partition", "plan_sha256",
  ], "Seed-release plan");
  requireExact(plan.source_identity, ["source_sha256", "source_commit"], "Seed plan source identity");
  requireExact(plan.execution_identity, [
    "descriptor_sha256", "source_inventory_sha256", "dependency_inventory_sha256",
  ], "Seed plan execution identity");
  requireExact(plan.runtime_identity, [
    "identity_sha256", "executable_sha256", "package_lock_sha256",
  ], "Seed plan runtime identity");
  requireExact(plan.bindings, SNAPSHOT_NAMES, "Seed plan snapshot bindings");
  for (const [name, binding] of Object.entries(plan.bindings)) {
    requireExact(binding, ["path", "sha256"], `Seed plan ${name} binding`);
    normalizedPath(binding.path);
    requireSha256(binding.sha256, `Seed plan ${name} hash`);
  }
  requireExact(plan.partitions, PARTITIONS, "Seed plan partitions");
  for (const partition of PARTITIONS) {
    const row = requireExact(plan.partitions[partition], [
      "commitment_path", "seed_count", "commitment", "escrow_sha256",
    ], `Seed plan ${partition} partition`);
    normalizedPath(row.commitment_path);
    requirePositiveInteger(row.seed_count, `Seed plan ${partition} seed count`);
    requireSha256(row.commitment, `Seed plan ${partition} commitment`);
    requireSha256(row.escrow_sha256, `Seed plan ${partition} escrow hash`);
  }
  requireExact(plan.cross_partition, [
    "freeze_identity_sha256", "uniqueness_rule", "total_seed_count",
  ], "Seed plan cross-partition identity");
  if (
    plan.schema !== 1
    || plan.contract_version !== SEED_RELEASE_PLAN_VERSION
    || plan.state !== "commitments-sealed"
    || plan.artifact !== "candidate-010"
    || !SHA256.test(plan.release_set_id ?? "")
    || !SHA1_OR_SHA256_COMMIT.test(plan.source_identity.source_commit ?? "")
    || !Number.isSafeInteger(plan.release_version)
    || plan.release_version < 1
    || plan.claim_eligible !== false
    || plan.generation_method !== "injected-fixture-entropy-v1"
    || plan.cross_partition.uniqueness_rule
      !== "one jointly generated unsigned-32-bit set split once; duplicates refused"
    || plan.plan_sha256 !== digestDocument(plan, "plan_sha256")
  ) throw new Error("Release-v4 accepts only an exact permanently ineligible fixture seed plan.");
  return plan;
}

function validateOperatorCommitment(document, plan, partition) {
  requireExact(document, [
    "schema", "partition", "state", "algorithm", "seed_count", "commitment",
    "operator_contract_version", "release_set_id", "freeze_identity_sha256",
    "claim_eligible", "generation_method",
  ], `${partition} operator commitment`);
  if (
    document.schema !== 1
    || document.partition !== partition
    || document.state !== "sealed"
    || document.algorithm !== "sha256-json-array-v1"
    || document.operator_contract_version !== SEED_RELEASE_OPERATOR_VERSION
    || document.release_set_id !== plan.release_set_id
    || document.freeze_identity_sha256 !== plan.cross_partition.freeze_identity_sha256
    || document.claim_eligible !== false
    || document.generation_method !== "injected-fixture-entropy-v1"
    || document.seed_count !== plan.partitions[partition].seed_count
    || document.commitment !== plan.partitions[partition].commitment
  ) throw new Error(`${partition} operator commitment disagrees with the fixture seed plan.`);
  return document;
}

function validateOperatorReveal(document, plan, commitment, partition) {
  requireExact(document, [
    "schema", "partition", "state", "algorithm", "commitment", "seeds",
    "operator_contract_version", "release_set_id", "plan_sha256", "claim_eligible",
  ], `${partition} operator reveal`);
  const seeds = validateSeedList(document.seeds, `${partition} operator reveal`);
  if (
    document.schema !== 1
    || document.partition !== partition
    || document.state !== "frozen-reveal"
    || document.algorithm !== "sha256-json-array-v1"
    || document.operator_contract_version !== SEED_RELEASE_OPERATOR_VERSION
    || document.release_set_id !== plan.release_set_id
    || document.plan_sha256 !== plan.plan_sha256
    || document.claim_eligible !== false
    || seeds.length !== commitment.seed_count
    || document.commitment !== commitment.commitment
    || seedListCommitment(seeds) !== commitment.commitment
  ) throw new Error(`${partition} operator reveal disagrees with its commitment or plan.`);
  return { document, seeds };
}

function validateAttestation(attestation, plan, reveals) {
  requireExact(attestation, [
    "schema", "contract_version", "state", "artifact", "release_set_id", "plan_sha256",
    "claim_eligible", "partitions", "disjointness", "attestation_sha256",
  ], "Seed reveal attestation");
  requireExact(attestation.partitions, PARTITIONS, "Seed attestation partitions");
  for (const partition of PARTITIONS) {
    requireExact(attestation.partitions[partition], [
      "commitment", "seed_count", "reveal_sha256",
    ], `Seed attestation ${partition} identity`);
  }
  if (
    attestation.schema !== 1
    || attestation.contract_version !== SEED_REVEAL_ATTESTATION_VERSION
    || attestation.state !== "explicitly-revealed"
    || attestation.artifact !== "candidate-010"
    || attestation.release_set_id !== plan.release_set_id
    || attestation.plan_sha256 !== plan.plan_sha256
    || attestation.claim_eligible !== false
    || attestation.disjointness !== "verified"
    || attestation.attestation_sha256 !== digestDocument(attestation, "attestation_sha256")
  ) throw new Error("Seed reveal attestation is invalid or relabelled.");
  for (const partition of PARTITIONS) {
    const expected = {
      commitment: plan.partitions[partition].commitment,
      seed_count: plan.partitions[partition].seed_count,
      reveal_sha256: sha256(canonical(reveals[partition].document)),
    };
    if (canonical(attestation.partitions[partition]) !== canonical(expected)) {
      throw new Error(`Seed reveal attestation does not bind the exact ${partition} reveal.`);
    }
  }
  return attestation;
}

function seedOperatorAgreement({
  baseRelease,
  openedRelease,
  plan,
  attestation,
  commitments,
  reveals,
}) {
  if (
    canonical(plan.source_identity) !== canonical(openedRelease.source_identity)
    || canonical(plan.execution_identity) !== canonical(openedRelease.execution_binding)
    || canonical(plan.runtime_identity) !== canonical(openedRelease.runtime_binding)
    || plan.release_version !== baseRelease.release_version
  ) throw new Error("Seed operator and base release do not share one source/execution/runtime identity.");
  for (const name of SNAPSHOT_NAMES) {
    if (canonical(plan.bindings[name]) !== canonical(baseRelease.bindings[name])) {
      throw new Error(`Seed operator snapshot ${name} differs from the base release binding.`);
    }
  }
  if (
    baseRelease.bindings.commitment.path !== plan.partitions.confirmation.commitment_path
    || baseRelease.seed_pack.commitment !== commitments.confirmation.commitment
    || baseRelease.seed_pack.seed_count !== commitments.confirmation.seed_count
    || canonical(openedRelease.seeds) !== canonical(reveals.confirmation.seeds)
  ) throw new Error("Base release does not bind the operator's exact confirmation partition.");
  const freezeIdentity = {
    source_sha256: plan.source_identity.source_sha256,
    source_commit: plan.source_identity.source_commit,
    execution_descriptor_sha256: plan.execution_identity.descriptor_sha256,
    source_inventory_sha256: plan.execution_identity.source_inventory_sha256,
    dependency_inventory_sha256: plan.execution_identity.dependency_inventory_sha256,
    runtime_identity_sha256: plan.runtime_identity.identity_sha256,
    runtime_executable_sha256: plan.runtime_identity.executable_sha256,
    package_lock_sha256: plan.runtime_identity.package_lock_sha256,
    bindings: plan.bindings,
    release_version: plan.release_version,
    confirmation_seed_count: commitments.confirmation.seed_count,
    held_out_seed_count: commitments["held-out"].seed_count,
  };
  if (
    sha256(canonical(freezeIdentity)) !== plan.cross_partition.freeze_identity_sha256
    || plan.cross_partition.total_seed_count
      !== commitments.confirmation.seed_count + commitments["held-out"].seed_count
  ) throw new Error("Seed operator cross-partition freeze identity is invalid.");
  assertDisjointSeedPacks(PARTITIONS.map((partition) => ({
    partition,
    seeds: reveals[partition].seeds,
  })));
  validateAttestation(attestation, plan, reveals);
}

function validateV4Document(document) {
  requireExact(document, [
    "schema", "contract_version", "state", "release_version", "partition", "phase",
    "claim_eligible", "authority", "base_release_identity", "source_identity", "execution_identity",
    "runtime_identity", "seed_operator_identity", "confirmation_preflight_identity",
    "paired_energy_identity", "gate9_evidence", "bindings", "release_sha256",
  ], "Release-v4 document");
  requireExact(document.base_release_identity, [
    "contract_version", "release_sha256",
  ], "Release-v4 base release identity");
  requireExact(document.source_identity, ["source_sha256", "source_commit"], "Release-v4 source identity");
  requireExact(document.execution_identity, [
    "descriptor_sha256", "source_inventory_sha256", "dependency_inventory_sha256",
  ], "Release-v4 execution identity");
  requireExact(document.runtime_identity, [
    "identity_sha256", "executable_sha256", "package_lock_sha256",
  ], "Release-v4 runtime identity");
  requireExact(document.seed_operator_identity, [
    "contract_version", "release_set_id", "plan_sha256", "attestation_sha256",
    "generation_method", "confirmation_commitment", "held_out_commitment",
  ], "Release-v4 seed operator identity");
  requireExact(document.confirmation_preflight_identity, [
    "contract_version", "preflight_sha256", "planned_seed_count",
  ], "Release-v4 preflight identity");
  requireExact(document.paired_energy_identity, [
    "contract_version", "plan_sha256", "schedule_sha256", "acquisition_policy_sha256",
    "run_id", "schedule_seed_set_sha256",
  ], "Release-v4 energy identity");
  requireExact(document.gate9_evidence, [
    "status", "fixture_rehearsal", "promotion_authority", "real_measurements_present",
    "aggregate_analysis_present",
  ], "Release-v4 Gate9 evidence state");
  requireExact(document.bindings, V4_BINDING_NAMES, "Release-v4 bindings");
  for (const [name, binding] of Object.entries(document.bindings)) {
    requireExact(binding, ["path", "sha256"], `Release-v4 ${name} binding`);
  }
  if (
    document.schema !== 1
    || document.contract_version !== RELEASE_CONTRACT_V4_VERSION
    || document.state !== "sealed-fixture-release"
    || !Number.isSafeInteger(document.release_version)
    || document.release_version < 1
    || document.partition !== "confirmation"
    || document.phase !== "confirmation"
    || document.claim_eligible !== false
    || document.authority !== "fixture-gate9-rehearsal-only"
    || canonical(document.gate9_evidence) !== canonical({
      status: "structurally-bound-fixture",
      fixture_rehearsal: true,
      promotion_authority: false,
      real_measurements_present: false,
      aggregate_analysis_present: false,
    })
    || document.release_sha256 !== digestDocument(document, "release_sha256")
  ) throw new Error("Invalid, corrupted, or relabelled release-v4 fixture contract.");
  return document;
}

async function verifyEvidenceReleaseAndSeeds({
  bindingRoot,
  sourceRoot,
  resolved,
  bindings,
  executionDescriptor,
  runtimeIdentity,
}) {
  const baseRelease = validateBaseReleaseShape(parseJson(resolved.base_release.body, "Base release"));
  const confirmationCommitmentBinding = await readBinding(
    bindingRoot,
    baseRelease.bindings.commitment,
    "base confirmation commitment",
  );
  const confirmationRevealBinding = await readBinding(
    bindingRoot,
    baseRelease.bindings.reveal,
    "base confirmation reveal",
  );
  const heldOutCommitmentDocument = parseJson(resolved.held_out_commitment.body, "Held-out commitment");
  const heldOutRevealDocument = parseJson(resolved.held_out_reveal.body, "Held-out reveal");
  const openedRelease = await openFrozenSeedRelease({
    bindingRoot,
    sourceRoot,
    releasePath: resolved.base_release.file,
    expectedPartition: "confirmation",
    phase: "confirmation",
    disjointWith: [{ partition: "held-out", seeds: heldOutRevealDocument.seeds }],
    executionDescriptor,
    runtimeIdentity,
  });
  const plan = validateSeedPlan(parseJson(resolved.seed_release_plan.body, "Seed-release plan"));
  if (bindings.held_out_commitment.path !== plan.partitions["held-out"].commitment_path) {
    throw new Error("Held-out commitment binding path differs from the seed-release plan.");
  }
  const commitments = {
    confirmation: validateOperatorCommitment(
      parseJson(confirmationCommitmentBinding.body, "Confirmation commitment"),
      plan,
      "confirmation",
    ),
    "held-out": validateOperatorCommitment(heldOutCommitmentDocument, plan, "held-out"),
  };
  const reveals = {
    confirmation: validateOperatorReveal(
      parseJson(confirmationRevealBinding.body, "Confirmation reveal"),
      plan,
      commitments.confirmation,
      "confirmation",
    ),
    "held-out": validateOperatorReveal(
      heldOutRevealDocument,
      plan,
      commitments["held-out"],
      "held-out",
    ),
  };
  const attestation = parseJson(resolved.seed_reveal_attestation.body, "Seed reveal attestation");
  seedOperatorAgreement({ baseRelease, openedRelease, plan, attestation, commitments, reveals });
  return { baseRelease, openedRelease, plan, attestation, commitments };
}

async function verifyEvidence({ bindingRoot, sourceRoot, bindings, executionDescriptor, runtimeIdentity }) {
  const resolved = Object.fromEntries(await Promise.all(V4_BINDING_NAMES.map(async (name) => [
    name,
    await readBinding(bindingRoot, bindings[name], name),
  ])));
  const {
    baseRelease, openedRelease, plan, attestation, commitments,
  } = await verifyEvidenceReleaseAndSeeds({
    bindingRoot, sourceRoot, resolved, bindings, executionDescriptor, runtimeIdentity,
  });

  const preflight = validatePreflight(parseJson(resolved.confirmation_preflight.body, "Confirmation preflight"));
  const schedule = validateSchedule(parseJson(resolved.energy_block_schedule.body, "Energy block schedule"));
  const energyPlan = validateEnergyPlan(
    parseJson(resolved.energy_acquisition_plan.body, "Paired energy acquisition plan"),
    preflight,
    schedule.schedule,
  );
  if (
    energyPlan.design_identity.seed_count !== openedRelease.seeds.length
    || energyPlan.design_identity.schedule_seed_set_sha256
      !== sha256(canonical([...openedRelease.seeds].sort((left, right) => left - right)))
  ) throw new Error("Energy schedule seeds differ from the exact opened confirmation release seeds.");

  return {
    baseRelease,
    openedRelease,
    plan,
    attestation,
    preflight,
    schedule: schedule.schedule,
    energyPlan,
    commitments,
  };
}

function releaseBody({ releaseVersion, bindings, verified }) {
  if (verified.baseRelease.release_version !== releaseVersion || verified.plan.release_version !== releaseVersion) {
    throw new Error("Release-v4 version must equal the base release and seed-plan version.");
  }
  return {
    schema: 1,
    contract_version: RELEASE_CONTRACT_V4_VERSION,
    state: "sealed-fixture-release",
    release_version: releaseVersion,
    partition: "confirmation",
    phase: "confirmation",
    claim_eligible: false,
    authority: "fixture-gate9-rehearsal-only",
    base_release_identity: {
      contract_version: verified.baseRelease.contract_version,
      release_sha256: verified.baseRelease.release_sha256,
    },
    source_identity: structuredClone(verified.openedRelease.source_identity),
    execution_identity: structuredClone(verified.openedRelease.execution_binding),
    runtime_identity: structuredClone(verified.openedRelease.runtime_binding),
    seed_operator_identity: {
      contract_version: SEED_RELEASE_OPERATOR_VERSION,
      release_set_id: verified.plan.release_set_id,
      plan_sha256: verified.plan.plan_sha256,
      attestation_sha256: verified.attestation.attestation_sha256,
      generation_method: verified.plan.generation_method,
      confirmation_commitment: verified.commitments.confirmation.commitment,
      held_out_commitment: verified.commitments["held-out"].commitment,
    },
    confirmation_preflight_identity: {
      contract_version: CONFIRMATION_PREFLIGHT_VERSION,
      preflight_sha256: verified.preflight.preflight_sha256,
      planned_seed_count: verified.preflight.statistical_plan.planned_seed_count,
    },
    paired_energy_identity: {
      contract_version: FIXTURE_ENERGY_PLAN_VERSION,
      plan_sha256: verified.energyPlan.plan_sha256,
      schedule_sha256: verified.schedule.schedule_sha256,
      acquisition_policy_sha256: verified.energyPlan.acquisition_policy_sha256,
      run_id: verified.schedule.run_id,
      schedule_seed_set_sha256: verified.energyPlan.design_identity.schedule_seed_set_sha256,
    },
    gate9_evidence: {
      status: "structurally-bound-fixture",
      fixture_rehearsal: true,
      promotion_authority: false,
      real_measurements_present: false,
      aggregate_analysis_present: false,
    },
    bindings,
  };
}

/** Build a fixture-only v4 envelope without writing files or minting authority. */
export async function createFixtureGate9ReleaseContractV4(options) {
  requireExact(options, [
    "bindingRoot", "sourceRoot", "releaseVersion", "baseReleasePath", "seedReleasePlanPath",
    "seedRevealAttestationPath", "confirmationPreflightPath", "energyAcquisitionPlanPath",
    "energyBlockSchedulePath", "heldOutCommitmentPath", "heldOutRevealPath",
    "executionDescriptor", "runtimeIdentity",
  ], "Release-v4 creation options");
  const bindingRoot = await strictDirectory(options.bindingRoot, "Release-v4 bindingRoot");
  const sourceRoot = await strictDirectory(options.sourceRoot, "Release-v4 sourceRoot");
  if (samePath(bindingRoot, sourceRoot)) throw new Error("Release-v4 bindingRoot and sourceRoot must be distinct.");
  requirePositiveInteger(options.releaseVersion, "Release-v4 version");
  const paths = {
    base_release: options.baseReleasePath,
    seed_release_plan: options.seedReleasePlanPath,
    seed_reveal_attestation: options.seedRevealAttestationPath,
    confirmation_preflight: options.confirmationPreflightPath,
    energy_acquisition_plan: options.energyAcquisitionPlanPath,
    energy_block_schedule: options.energyBlockSchedulePath,
    held_out_commitment: options.heldOutCommitmentPath,
    held_out_reveal: options.heldOutRevealPath,
  };
  const bindings = Object.fromEntries(await Promise.all(V4_BINDING_NAMES.map(async (name) => [
    name,
    await createBinding(bindingRoot, paths[name], name),
  ])));
  const verified = await verifyEvidence({
    bindingRoot,
    sourceRoot,
    bindings,
    executionDescriptor: options.executionDescriptor,
    runtimeIdentity: options.runtimeIdentity,
  });
  const body = releaseBody({ releaseVersion: options.releaseVersion, bindings, verified });
  return Object.freeze({ ...body, release_sha256: sha256(canonical(body)) });
}

/** Reopen every bound byte and return a non-promotable fixture evidence capability. */
export async function openFixtureGate9ReleaseContractV4(options) {
  requireExact(options, [
    "bindingRoot", "sourceRoot", "releasePath", "executionDescriptor", "runtimeIdentity",
  ], "Release-v4 open options");
  const bindingRoot = await strictDirectory(options.bindingRoot, "Release-v4 bindingRoot");
  const sourceRoot = await strictDirectory(options.sourceRoot, "Release-v4 sourceRoot");
  if (samePath(bindingRoot, sourceRoot)) throw new Error("Release-v4 bindingRoot and sourceRoot must be distinct.");
  const releaseFile = await containedRegularFile(bindingRoot, options.releasePath, "Release-v4 document");
  const release = validateV4Document(parseJson(await readFile(releaseFile), "Release-v4 document"));
  const verified = await verifyEvidence({
    bindingRoot,
    sourceRoot,
    bindings: release.bindings,
    executionDescriptor: options.executionDescriptor,
    runtimeIdentity: options.runtimeIdentity,
  });
  const expectedBody = releaseBody({
    releaseVersion: release.release_version,
    bindings: release.bindings,
    verified,
  });
  const expected = { ...expectedBody, release_sha256: sha256(canonical(expectedBody)) };
  if (canonical(expected) !== canonical(release)) {
    throw new Error("Release-v4 identity metadata disagree with the fully reverified bound evidence.");
  }
  return Object.freeze({
    schema: 1,
    contract_version: RELEASE_CONTRACT_V4_VERSION,
    release_version: release.release_version,
    release_sha256: release.release_sha256,
    fixture_gate9_evidence: true,
    claim_eligible: false,
    promotion_authority: false,
    source_identity: Object.freeze({ ...release.source_identity }),
    execution_binding: Object.freeze({ ...release.execution_identity }),
    runtime_binding: Object.freeze({ ...release.runtime_identity }),
    seed_operator_identity: Object.freeze({ ...release.seed_operator_identity }),
    confirmation_preflight_identity: Object.freeze({ ...release.confirmation_preflight_identity }),
    paired_energy_identity: Object.freeze({ ...release.paired_energy_identity }),
  });
}
