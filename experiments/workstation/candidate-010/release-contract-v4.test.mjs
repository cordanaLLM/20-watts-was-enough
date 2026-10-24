import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  unlink,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { canonicalJson } from "../lib/canonical-json.mjs";

import { evaluateConfirmationPreflight } from "./confirmation-preflight.mjs";
import { buildCounterbalancedEnergyBlockSchedule } from "./energy-acquisition.mjs";
import { createFrozenSeedReleaseContract } from "./release-contract.mjs";
import {
  FIXTURE_ENERGY_PLAN_VERSION,
  RELEASE_CONTRACT_V4_VERSION,
  RELEASE_V4_ADAPTER_CONTRACT,
  buildFixturePairedEnergyAcquisitionPlan,
  createFixtureGate9ReleaseContractV4,
  openFixtureGate9ReleaseContractV4,
} from "./release-contract-v4.mjs";
import {
  SEED_RELEASE_OPERATOR_VERSION,
  SEED_RELEASE_PLAN_VERSION,
  SEED_REVEAL_ATTESTATION_VERSION,
} from "./seed-release-operator.mjs";
import { seedListCommitment } from "./seeds/seed-pack.mjs";
import { computeSourceBundle } from "./source-bundle.mjs";

function canonical(value) {
  return canonicalJson(value, { strict: false, label: "Test-v4" });
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function digestDocument(document, field) {
  const clone = structuredClone(document);
  delete clone[field];
  return sha256(canonical(clone));
}

function sourceInventoryDigest(files) {
  const digest = createHash("sha256");
  for (const row of files) {
    digest.update(`${Buffer.byteLength(row.path)}:${row.path}:${row.bytes}:${row.sha256}\n`);
  }
  return digest.digest("hex");
}

function makeRuntimeIdentity() {
  const body = {
    schema: 1,
    artifact: "candidate-010",
    contract_version: "candidate-010.runtime-identity.v1",
    confirmation_claim_eligible: false,
    limits: { confirmation_claim_eligible: false, toctou_guarantee: false },
    runtime: {
      version: "v-fixture",
      versions: { node: "fixture" },
      platform: "fixture",
      arch: "x64",
      exec_path: "C:/fixture/node.exe",
      exec_path_realpath: "C:/fixture/node.exe",
      executable_sha256: sha256("fixture-executable"),
      executable_bytes: 1024,
    },
    package_lock: {
      path: "package-lock.json",
      lockfile_version: 3,
      sha256: sha256("fixture-lock"),
      bytes: 128,
    },
    external_production_dependencies: [],
    external_production_dependency_names: [],
  };
  return { ...body, identity_sha256: sha256(canonical(body)) };
}

function makeExecutionDescriptor(sourceBundle, runtimeIdentity) {
  const sourceFiles = sourceBundle.files.map((row) => ({ ...row }));
  const inventory = {
    files: sourceFiles,
    file_count: sourceFiles.length,
    total_bytes: sourceFiles.reduce((sum, row) => sum + row.bytes, 0),
    inventory_sha256: sourceInventoryDigest(sourceFiles),
  };
  const dependencies = {
    names: [],
    inventory: {
      files: [],
      files_count: 0,
      bytes: 0,
      inventory_sha256: sha256(canonical([])),
    },
  };
  const body = {
    schema: 1,
    artifact: "candidate-010",
    contract_version: "candidate-010.execution-capsule.v1",
    confirmation_claim_eligible: false,
    layout: {
      immutable_source_role: "source/generated-immutable-capsule",
      dependency_root: "node_modules",
      shared_node_modules: false,
    },
    source: {
      contract_version: "candidate-010-immutable-capsule-v1",
      head_commit: sourceBundle.vcs.source_commit,
      source_paths: sourceFiles.map((row) => row.path),
      git_objects: sourceFiles.map((row) => ({
        path: row.path,
        git_mode: "100644",
        git_object_id: sha256(`git:${row.path}`).slice(0, 40),
      })),
      inventory,
      inventory_sha256: inventory.inventory_sha256,
    },
    runtime_identity: runtimeIdentity,
    dependencies,
    limits: {
      confirmation_claim_eligible: false,
      execution_authority: "none",
      shared_node_modules_allowed: false,
      malicious_host_toctou_closed: false,
    },
  };
  return { ...body, descriptor_sha256: sha256(canonical(body)) };
}

async function writeJson(file, document) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(document, null, 2)}\n`, "utf8");
}

async function fileBinding(root, relative) {
  return {
    path: relative,
    sha256: sha256(await readFile(path.join(root, relative))),
  };
}

function preflightStatisticalPlan() {
  return {
    independent_unit: "seed",
    alpha_familywise: 0.05,
    power_target: 0.8,
    multiplicity_family_size: 1,
    planned_seed_count: 3,
    endpoints: [{
      id: "paired-energy",
      test: "superiority",
      pilot_variance: 0.0001,
      pilot_input_sha256: sha256("fixture-pilot"),
      variance_unit: "paired-seed-contrast",
      minimum_relevant_effect: 1,
      noninferiority_margin: null,
    }],
  };
}

function preflightInput() {
  return {
    statistical_plan: preflightStatisticalPlan(),
    design: {
      scenario_count: 1,
      arm_count: 2,
      opportunities_per_seed_scenario: 4,
      blocks_per_seed_scenario: 2,
    },
    pilot_projection: {
      projection_basis_sha256: sha256("fixture-projection"),
      p99_work_unit_time_ms: 2,
      p99_work_unit_bytes: 100,
      p99_meter_boundary_time_ms: 50,
      p99_block_index_bytes: 200,
      measurement_session_count: 1,
      p99_files_per_measurement_session: 3,
      fixed_artifact_files: 20,
      fixed_artifact_bytes: 1_000,
      meter_sample_rate_hz: 10,
      meter_bytes_per_sample: 16,
      setup_time_ms: 5_000,
    },
    resource_caps: {
      max_records: 100_000,
      max_measurement_blocks: 100_000,
      max_raw_bytes: 1_000_000_000,
      max_meter_log_bytes: 1_000_000_000,
      max_files: 1_000,
      max_wall_time_s: 100_000,
      minimum_free_disk_reserve_bytes: 1_000_000,
      available_free_disk_bytes: 10_000_000_000,
    },
    meter_block: {
      measurement_semantics: "block",
      minimum_actual_samples: 10,
      maximum_clock_uncertainty_ms: 2,
      minimum_block_duration_ms: 1_000,
      minimum_duration_to_clock_uncertainty_ratio: 100,
      meter_resolution_j: 0.01,
      expanded_measurement_uncertainty_j: 0.02,
      minimum_expected_block_energy_j: 0.2,
      minimum_energy_to_resolution_uncertainty_ratio: 10,
    },
    identities: Object.fromEntries([
      "hardware", "meter", "calibration", "clock", "thermal_protocol", "power_plan",
    ].map((name) => [name, {
      id: `${name}-fixture`,
      identity_sha256: sha256(`identity:${name}`),
    }])),
  };
}

function buildSchedule(seeds) {
  return buildCounterbalancedEnergyBlockSchedule({
    run_id: "candidate-010-v4-fixture",
    scenarios: [{
      scenario_id: "scenario-1",
      task_family: "fixture",
      backend_id: "fixture-backend",
    }],
    seeds,
    arms: ["baseline", "candidate"],
    ordered_input_manifests: seeds.map((seed) => ({
      input_manifest_id: `inputs-${seed}`,
      scenario_id: "scenario-1",
      seed,
      ordered_opportunity_ids: [`op-${seed}-1`, `op-${seed}-2`],
    })),
    opportunities_per_block: 2,
    opportunity_repetitions: 1,
    measurement_repetitions: 2,
    warmup_opportunities: 1,
    meter_capability: {
      sample_interval_s: 0.1,
      energy_resolution_j: 0.01,
      minimum_block_duration_s: 1,
      minimum_energy_delta_j: 0.2,
      minimum_samples_per_block: 10,
      minimum_resolution_quanta: 10,
      maximum_clock_uncertainty_s: 0.002,
      minimum_signal_to_expanded_uncertainty: 10,
    },
  });
}

async function prepareV4FixtureSource(sourceRoot) {
  const sourceBodies = {
    "source-a.mjs": "export const fixture = true;\n",
    "source-b.json": "{\"fixture\":true}\n",
  };
  for (const [relative, body] of Object.entries(sourceBodies)) {
    await writeFile(path.join(sourceRoot, relative), body, "utf8");
  }
  return computeSourceBundle({
    root: sourceRoot,
    sourceFiles: Object.keys(sourceBodies).sort(),
    vcs: {
      source_commit: sha256("fixture-source-commit").slice(0, 40),
      worktree_state: "frozen-fixture",
    },
  });
}

async function writeV4FixtureSnapshots(bindingRoot, snapshots, sourceBundle, executionDescriptor, runtimeIdentity) {
  await writeJson(path.join(bindingRoot, snapshots.source_bundle), sourceBundle);
  await writeJson(path.join(bindingRoot, snapshots.execution_descriptor), executionDescriptor);
  await writeJson(path.join(bindingRoot, snapshots.runtime_identity), runtimeIdentity);
  await writeJson(path.join(bindingRoot, snapshots.config), { profile: "fixture" });
  await writeJson(path.join(bindingRoot, snapshots.design), { scenarios: ["fixture"] });
  await writeJson(path.join(bindingRoot, snapshots.backend_registry), { backends: ["fixture"] });
  await writeJson(path.join(bindingRoot, snapshots.preregistration), { id: "fixture" });
}

function buildFreezeIdentity(sourceBundle, executionDescriptor, runtimeIdentity, planBindings, releaseVersion, confirmationSeeds, heldOutSeeds) {
  return {
    source_sha256: sourceBundle.source_sha256,
    source_commit: sourceBundle.vcs.source_commit,
    execution_descriptor_sha256: executionDescriptor.descriptor_sha256,
    source_inventory_sha256: executionDescriptor.source.inventory_sha256,
    dependency_inventory_sha256: executionDescriptor.dependencies.inventory.inventory_sha256,
    runtime_identity_sha256: runtimeIdentity.identity_sha256,
    runtime_executable_sha256: runtimeIdentity.runtime.executable_sha256,
    package_lock_sha256: runtimeIdentity.package_lock.sha256,
    bindings: planBindings,
    release_version: releaseVersion,
    confirmation_seed_count: confirmationSeeds.length,
    held_out_seed_count: heldOutSeeds.length,
  };
}

function buildV4CommitmentsAndPlan({
  sourceBundle,
  executionDescriptor,
  runtimeIdentity,
  planBindings,
  releaseVersion,
  confirmationSeeds,
  heldOutSeeds,
  releaseSetId,
}) {
  const freezeIdentity = buildFreezeIdentity(
    sourceBundle, executionDescriptor, runtimeIdentity, planBindings, releaseVersion, confirmationSeeds, heldOutSeeds,
  );
  const freezeIdentitySha256 = sha256(canonical(freezeIdentity));
  const commitments = Object.fromEntries([
    ["confirmation", confirmationSeeds],
    ["held-out", heldOutSeeds],
  ].map(([partition, seeds]) => [partition, {
    schema: 1,
    partition,
    state: "sealed",
    algorithm: "sha256-json-array-v1",
    seed_count: seeds.length,
    commitment: seedListCommitment(seeds),
    operator_contract_version: SEED_RELEASE_OPERATOR_VERSION,
    release_set_id: releaseSetId,
    freeze_identity_sha256: freezeIdentitySha256,
    claim_eligible: false,
    generation_method: "injected-fixture-entropy-v1",
  }]));
  const planBody = {
    schema: 1,
    contract_version: SEED_RELEASE_PLAN_VERSION,
    state: "commitments-sealed",
    artifact: "candidate-010",
    release_set_id: releaseSetId,
    release_version: releaseVersion,
    claim_eligible: false,
    generation_method: "injected-fixture-entropy-v1",
    source_identity: {
      source_sha256: sourceBundle.source_sha256,
      source_commit: sourceBundle.vcs.source_commit,
    },
    execution_identity: {
      descriptor_sha256: executionDescriptor.descriptor_sha256,
      source_inventory_sha256: executionDescriptor.source.inventory_sha256,
      dependency_inventory_sha256: executionDescriptor.dependencies.inventory.inventory_sha256,
    },
    runtime_identity: {
      identity_sha256: runtimeIdentity.identity_sha256,
      executable_sha256: runtimeIdentity.runtime.executable_sha256,
      package_lock_sha256: runtimeIdentity.package_lock.sha256,
    },
    bindings: planBindings,
    partitions: Object.fromEntries(["confirmation", "held-out"].map((partition) => [partition, {
      commitment_path: `${partition}.commit.json`,
      seed_count: commitments[partition].seed_count,
      commitment: commitments[partition].commitment,
      escrow_sha256: sha256(`fixture-escrow:${partition}`),
    }])),
    cross_partition: {
      freeze_identity_sha256: freezeIdentitySha256,
      uniqueness_rule: "one jointly generated unsigned-32-bit set split once; duplicates refused",
      total_seed_count: confirmationSeeds.length + heldOutSeeds.length,
    },
  };
  return { commitments, seedPlan: { ...planBody, plan_sha256: sha256(canonical(planBody)) } };
}

async function writeV4SeedArtifacts(bindingRoot, releaseSetId, seedPlan, commitments, confirmationSeeds, heldOutSeeds) {
  const reveals = Object.fromEntries([
    ["confirmation", confirmationSeeds],
    ["held-out", heldOutSeeds],
  ].map(([partition, seeds]) => [partition, {
    schema: 1,
    partition,
    state: "frozen-reveal",
    algorithm: "sha256-json-array-v1",
    commitment: commitments[partition].commitment,
    seeds,
    operator_contract_version: SEED_RELEASE_OPERATOR_VERSION,
    release_set_id: releaseSetId,
    plan_sha256: seedPlan.plan_sha256,
    claim_eligible: false,
  }]));
  const attestationBody = {
    schema: 1,
    contract_version: SEED_REVEAL_ATTESTATION_VERSION,
    state: "explicitly-revealed",
    artifact: "candidate-010",
    release_set_id: releaseSetId,
    plan_sha256: seedPlan.plan_sha256,
    claim_eligible: false,
    partitions: Object.fromEntries(["confirmation", "held-out"].map((partition) => [partition, {
      commitment: commitments[partition].commitment,
      seed_count: commitments[partition].seed_count,
      reveal_sha256: sha256(canonical(reveals[partition])),
    }])),
    disjointness: "verified",
  };
  const attestation = { ...attestationBody, attestation_sha256: sha256(canonical(attestationBody)) };
  await writeJson(path.join(bindingRoot, "seed-release-plan.json"), seedPlan);
  await writeJson(path.join(bindingRoot, "seed-reveal-attestation.json"), attestation);
  for (const partition of ["confirmation", "held-out"]) {
    await writeJson(path.join(bindingRoot, `${partition}.commit.json`), commitments[partition]);
    await writeJson(path.join(bindingRoot, `${partition}.reveal.json`), reveals[partition]);
  }
}

async function writeV4BaseReleaseAndPlans(bindingRoot, sourceRoot, releaseVersion, snapshots, confirmationSeeds) {
  const baseRelease = await createFrozenSeedReleaseContract({
    bindingRoot,
    sourceRoot,
    releaseVersion,
    partition: "confirmation",
    phase: "confirmation",
    sourceBundlePath: snapshots.source_bundle,
    executionDescriptorPath: snapshots.execution_descriptor,
    runtimeIdentityPath: snapshots.runtime_identity,
    configPath: snapshots.config,
    designPath: snapshots.design,
    backendRegistryPath: snapshots.backend_registry,
    preregistrationPath: snapshots.preregistration,
    commitmentPath: "confirmation.commit.json",
    revealPath: "confirmation.reveal.json",
  });
  await writeJson(path.join(bindingRoot, "base-release.json"), baseRelease);

  const preflight = evaluateConfirmationPreflight(preflightInput());
  const schedule = buildSchedule(confirmationSeeds);
  const energyPlan = buildFixturePairedEnergyAcquisitionPlan({
    confirmationPreflight: preflight,
    energyBlockSchedule: schedule,
  });
  await writeJson(path.join(bindingRoot, "confirmation-preflight.json"), preflight);
  await writeJson(path.join(bindingRoot, "energy-block-schedule.json"), schedule);
  await writeJson(path.join(bindingRoot, "energy-acquisition-plan.json"), energyPlan);
  return { preflight, schedule, energyPlan };
}

function buildV4CreateOptions({
  bindingRoot,
  sourceRoot,
  releaseVersion,
  executionDescriptor,
  runtimeIdentity,
}) {
  return {
    bindingRoot,
    sourceRoot,
    releaseVersion,
    baseReleasePath: "base-release.json",
    seedReleasePlanPath: "seed-release-plan.json",
    seedRevealAttestationPath: "seed-reveal-attestation.json",
    confirmationPreflightPath: "confirmation-preflight.json",
    energyAcquisitionPlanPath: "energy-acquisition-plan.json",
    energyBlockSchedulePath: "energy-block-schedule.json",
    heldOutCommitmentPath: "held-out.commit.json",
    heldOutRevealPath: "held-out.reveal.json",
    executionDescriptor,
    runtimeIdentity,
  };
}

const V4_FIXTURE_SNAPSHOTS = {
  source_bundle: "source-bundle.json",
  execution_descriptor: "execution-descriptor.json",
  runtime_identity: "runtime-identity.json",
  config: "config.json",
  design: "design.json",
  backend_registry: "backend-registry.json",
  preregistration: "preregistration.json",
};

async function collectPlanBindings(bindingRoot, snapshots) {
  return Object.fromEntries(await Promise.all(Object.entries(snapshots).map(async ([name, relative]) => [
    name,
    await fileBinding(bindingRoot, relative),
  ])));
}

async function makeFixture() {
  const container = await mkdtemp(path.join(os.tmpdir(), "20w-c010-release-v4-"));
  const bindingRoot = path.join(container, "bindings");
  const sourceRoot = path.join(container, "source");
  await mkdir(bindingRoot);
  await mkdir(sourceRoot);

  const sourceBundle = await prepareV4FixtureSource(sourceRoot);
  const runtimeIdentity = makeRuntimeIdentity();
  const executionDescriptor = makeExecutionDescriptor(sourceBundle, runtimeIdentity);
  await writeV4FixtureSnapshots(bindingRoot, V4_FIXTURE_SNAPSHOTS, sourceBundle, executionDescriptor, runtimeIdentity);

  const confirmationSeeds = [11, 22, 33];
  const heldOutSeeds = [44, 55];
  const releaseVersion = 1;
  const releaseSetId = sha256("fixture-release-set");
  const planBindings = await collectPlanBindings(bindingRoot, V4_FIXTURE_SNAPSHOTS);

  const { commitments, seedPlan } = buildV4CommitmentsAndPlan({
    sourceBundle,
    executionDescriptor,
    runtimeIdentity,
    planBindings,
    releaseVersion,
    confirmationSeeds,
    heldOutSeeds,
    releaseSetId,
  });
  await writeV4SeedArtifacts(bindingRoot, releaseSetId, seedPlan, commitments, confirmationSeeds, heldOutSeeds);
  const { preflight, schedule, energyPlan } = await writeV4BaseReleaseAndPlans(
    bindingRoot, sourceRoot, releaseVersion, V4_FIXTURE_SNAPSHOTS, confirmationSeeds,
  );

  const createOptions = buildV4CreateOptions({
    bindingRoot, sourceRoot, releaseVersion, executionDescriptor, runtimeIdentity,
  });
  const releaseV4 = await createFixtureGate9ReleaseContractV4(createOptions);
  await writeJson(path.join(bindingRoot, "release-v4.json"), releaseV4);
  return {
    container,
    bindingRoot,
    sourceRoot,
    releaseVersion,
    releaseV4,
    createOptions,
    executionDescriptor,
    runtimeIdentity,
    preflight,
    schedule,
    energyPlan,
    seedPlan,
  };
}

async function usingFixture(run) {
  const value = await makeFixture();
  try {
    await run(value);
  } finally {
    assert.ok(value.container.startsWith(os.tmpdir()));
    await rm(value.container, { recursive: true, force: true });
  }
}

function openOptions(value) {
  return {
    bindingRoot: value.bindingRoot,
    sourceRoot: value.sourceRoot,
    releasePath: "release-v4.json",
    executionDescriptor: value.executionDescriptor,
    runtimeIdentity: value.runtimeIdentity,
  };
}

test("v4 binds fixture seed operator, preflight, paired plan, schedule, and v3 source authority", async () => {
  await usingFixture(async (value) => {
    const opened = await openFixtureGate9ReleaseContractV4(openOptions(value));
    assert.equal(value.releaseV4.contract_version, RELEASE_CONTRACT_V4_VERSION);
    assert.equal(value.energyPlan.contract_version, FIXTURE_ENERGY_PLAN_VERSION);
    assert.equal(opened.fixture_gate9_evidence, true);
    assert.equal(opened.claim_eligible, false);
    assert.equal(opened.promotion_authority, false);
    assert.equal(opened.confirmation_preflight_identity.preflight_sha256, value.preflight.preflight_sha256);
    assert.equal(opened.paired_energy_identity.plan_sha256, value.energyPlan.plan_sha256);
    assert.equal(opened.paired_energy_identity.schedule_sha256, value.schedule.schedule_sha256);
    assert.equal(opened.seed_operator_identity.plan_sha256, value.seedPlan.plan_sha256);
    assert.equal(RELEASE_V4_ADAPTER_CONTRACT.mode, "fixture-only");
    assert.equal(
      RELEASE_V4_ADAPTER_CONTRACT.analyzer_handoff.acquisition_policy_identity,
      "paired_energy_identity.acquisition_policy_sha256",
    );
    assert.equal(RELEASE_V4_ADAPTER_CONTRACT.authority.promotion_authority, false);
  });
});

test("bound schedule substitution, held-out substitution, and preflight omission fail closed", async () => {
  await usingFixture(async (value) => {
    await writeFile(
      path.join(value.bindingRoot, "energy-block-schedule.json"),
      `${JSON.stringify(value.schedule)} `,
      "utf8",
    );
    await assert.rejects(
      openFixtureGate9ReleaseContractV4(openOptions(value)),
      /energy_block_schedule binding hash mismatch/,
    );
  });
  await usingFixture(async (value) => {
    const heldOut = JSON.parse(await readFile(path.join(value.bindingRoot, "held-out.reveal.json"), "utf8"));
    heldOut.seeds[0] = 99;
    await writeJson(path.join(value.bindingRoot, "held-out.reveal.json"), heldOut);
    await assert.rejects(
      openFixtureGate9ReleaseContractV4(openOptions(value)),
      /held_out_reveal binding hash mismatch/,
    );
  });
  await usingFixture(async (value) => {
    await unlink(path.join(value.bindingRoot, "confirmation-preflight.json"));
    await assert.rejects(
      openFixtureGate9ReleaseContractV4(openOptions(value)),
      (error) => error?.code === "ENOENT",
    );
  });
});

test("validly rehashed fixture-eligibility relabelling and attestation omission are refused", async () => {
  await usingFixture(async (value) => {
    const plan = structuredClone(value.seedPlan);
    plan.claim_eligible = true;
    plan.generation_method = "system-cryptographic-entropy-v1";
    plan.plan_sha256 = digestDocument(plan, "plan_sha256");
    await writeJson(path.join(value.bindingRoot, "seed-release-plan.json"), plan);
    await assert.rejects(
      createFixtureGate9ReleaseContractV4(value.createOptions),
      /only an exact permanently ineligible fixture seed plan/,
    );
  });
  await usingFixture(async (value) => {
    const file = path.join(value.bindingRoot, "seed-reveal-attestation.json");
    const attestation = JSON.parse(await readFile(file, "utf8"));
    delete attestation.partitions["held-out"];
    attestation.attestation_sha256 = digestDocument(attestation, "attestation_sha256");
    await writeJson(file, attestation);
    await assert.rejects(
      createFixtureGate9ReleaseContractV4(value.createOptions),
      /Seed attestation partitions has an invalid exact shape/,
    );
  });
});

test("a self-consistent schedule and paired plan on substituted seeds cannot bind the release", async () => {
  await usingFixture(async (value) => {
    const substitutedSchedule = buildSchedule([11, 22, 99]);
    const substitutedPlan = buildFixturePairedEnergyAcquisitionPlan({
      confirmationPreflight: value.preflight,
      energyBlockSchedule: substitutedSchedule,
    });
    await writeJson(path.join(value.bindingRoot, "energy-block-schedule.json"), substitutedSchedule);
    await writeJson(path.join(value.bindingRoot, "energy-acquisition-plan.json"), substitutedPlan);
    await assert.rejects(
      createFixtureGate9ReleaseContractV4(value.createOptions),
      /Energy schedule seeds differ from the exact opened confirmation release seeds/,
    );
  });
});

test("rehashed cross-artifact meter tampering and undeclared schedule fields are refused", async () => {
  await usingFixture(async (value) => {
    const preflight = structuredClone(value.preflight);
    preflight.identities.meter = {
      id: "substituted-meter",
      identity_sha256: sha256("substituted-meter"),
    };
    preflight.preflight_sha256 = digestDocument(preflight, "preflight_sha256");
    await writeJson(path.join(value.bindingRoot, "confirmation-preflight.json"), preflight);
    await assert.rejects(
      createFixtureGate9ReleaseContractV4(value.createOptions),
      /Paired energy acquisition plan differs from its exact deterministic reconstruction/,
    );
  });
  await usingFixture(async (value) => {
    const schedule = structuredClone(value.schedule);
    schedule.unregistered_override = true;
    schedule.schedule_sha256 = digestDocument(schedule, "schedule_sha256");
    await writeJson(path.join(value.bindingRoot, "energy-block-schedule.json"), schedule);
    await assert.rejects(
      createFixtureGate9ReleaseContractV4(value.createOptions),
      /Energy block schedule has an invalid exact shape/,
    );
  });
});

test("creation and opening reject undeclared adapter inputs", async () => {
  await usingFixture(async (value) => {
    await assert.rejects(
      createFixtureGate9ReleaseContractV4({ ...value.createOptions, claimEligible: true }),
      /creation options has an invalid exact shape/,
    );
    await assert.rejects(
      openFixtureGate9ReleaseContractV4({ ...openOptions(value), seeds: [11, 22, 33] }),
      /open options has an invalid exact shape/,
    );
  });
});

