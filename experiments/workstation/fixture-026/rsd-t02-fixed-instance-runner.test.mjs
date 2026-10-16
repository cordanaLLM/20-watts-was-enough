import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";

import { createAjv } from "../lib/ajv.mjs";

import { canonicalize, sha256Hex } from "../lib/checkpoint-ledger.mjs";
import {
  FIXTURE_026_RSD_T02_FIXED_INSTANCE_RUNNER_CONFIG_SHA256,
  FIXTURE_026_RSD_T02_FIXED_INSTANCE_RUNNER_CONFIG_VERSION,
  FIXTURE_026_RSD_T02_FIXED_INSTANCE_RUNNER_VERSION,
  assertFixture026RsdT02FixedInstanceRunArtifact,
  assertFixture026RsdT02FixedInstanceRunnerConfig,
  runFixture026RsdT02FixedInstance,
  runFixture026RsdT02FixedInstanceFailureConformanceForTest,
} from "./rsd-t02-fixed-instance-runner.mjs";
import { generateFixture026RsdT02DevelopmentInstance } from "./rsd-t02-system-family-generator.mjs";

const fixtureRoot = path.dirname(fileURLToPath(import.meta.url));

let registry;
let config;
let schema;
let validateSchema;
let instance;
let full;
let partial;
let resumed;
let failureRun;
let failureResumed;
let malformedInput;
let setupCpuMilliseconds;

function digest(value) {
  return sha256Hex(canonicalize(value));
}

function rechain(artifact) {
  let previous = "0".repeat(64);
  for (const [sequence, record] of artifact.ledger.entries()) {
    record.sequence = sequence;
    record.previous_record_sha256 = previous;
    const body = { ...record };
    delete body.record_sha256;
    record.record_sha256 = digest(body);
    previous = record.record_sha256;
  }
  return artifact;
}

before(async () => {
  const started = process.cpuUsage();
  const [registryText, configText, schemaText] = await Promise.all([
    readFile(path.join(fixtureRoot, "configs", "rsd-t02-system-family-registry.json"), "utf8"),
    readFile(path.join(fixtureRoot, "configs", "rsd-t02-fixed-instance-runner.json"), "utf8"),
    readFile(path.join(fixtureRoot, "rsd-t02-fixed-instance-runner.schema.json"), "utf8"),
  ]);
  registry = JSON.parse(registryText);
  config = JSON.parse(configText);
  schema = JSON.parse(schemaText);
  validateSchema = createAjv({ allErrors: true }).compile(schema);
  instance = generateFixture026RsdT02DevelopmentInstance({
    registry,
    family_id: "F-DEV-IFFL-AFFINE",
    draw_index: 0,
  });
  full = runFixture026RsdT02FixedInstance({ config, registry, instance });
  partial = runFixture026RsdT02FixedInstance({
    config, registry, instance, max_new_arm_records: 3,
  });
  resumed = runFixture026RsdT02FixedInstance({
    config,
    registry,
    instance,
    prior_artifact: partial,
    max_new_arm_records: config.arm_ids.length - partial.ledger.length,
  });
  failureRun = runFixture026RsdT02FixedInstanceFailureConformanceForTest({
    config,
    registry,
    instance,
    max_new_arm_records: 2,
    failure_modes_by_arm: {
      [config.arm_ids[0]]: "runtime-failure",
      [config.arm_ids[1]]: "malformed-response",
    },
  });
  failureResumed = runFixture026RsdT02FixedInstance({
    config,
    registry,
    instance,
    prior_artifact: failureRun,
    max_new_arm_records: 1,
  });
  const hostileInstance = structuredClone(instance);
  hostileInstance.packet.episodes[1].time_constant_s *= 2;
  malformedInput = runFixture026RsdT02FixedInstance({
    config, registry, instance: hostileInstance,
  });
  const cpu = process.cpuUsage(started);
  setupCpuMilliseconds = (cpu.user + cpu.system) / 1_000;
}, { timeout: 60_000 * 10 });

after(() => {
  registry = null;
  config = null;
  schema = null;
  validateSchema = null;
  instance = null;
  full = null;
  partial = null;
  resumed = null;
  failureRun = null;
  failureResumed = null;
  malformedInput = null;
});

test("closed runner config is schema-valid, canonical-hash bound, and NO_RESULT", () => {
  assert.equal(validateSchema(config), true, JSON.stringify(validateSchema.errors));
  assert.equal(assertFixture026RsdT02FixedInstanceRunnerConfig(config), config);
  assert.equal(config.contract_version, FIXTURE_026_RSD_T02_FIXED_INSTANCE_RUNNER_CONFIG_VERSION);
  assert.equal(digest(config), FIXTURE_026_RSD_T02_FIXED_INSTANCE_RUNNER_CONFIG_SHA256);
  assert.equal(
    schema["x-runtime-validator"].canonical_config_sha256,
    FIXTURE_026_RSD_T02_FIXED_INSTANCE_RUNNER_CONFIG_SHA256,
  );
  assert.equal(config.comparison_inference_permitted, false);
  assert.equal(config.claim_eligible, false);
  assert.equal(config.result_label, "NO_RESULT");
  assert.equal(config.policy_execution_contract.content_addressed_policy_bundle, false);
  assert.equal(config.policy_execution_contract.fresh_isolated_child_per_packet, false);
  assert.equal(config.policy_execution_contract.custom_success_executor_permitted, false);
  assert.equal(config.policy_execution_contract.design_gate_satisfied, false);
  assert.throws(
    () => runFixture026RsdT02FixedInstance({
      config, registry, instance, arm_executor: () => ({}),
    }),
    /custom success executors are outside/u,
  );
});

test("sampled fixed instance executes all 26 episodes at one exact parameter vector", () => {
  assert.equal(full.contract_version, FIXTURE_026_RSD_T02_FIXED_INSTANCE_RUNNER_VERSION);
  assert.equal(full.status, "complete");
  assert.equal(full.transcript_receipts.length, 26);
  assert.equal(full.acquisition_resource.sample_rows, 39962);
  assert.equal(full.acquisition_resource.input_commands, 188);
  assert.equal(full.acquisition_resource.simulation_internal_steps, 638976);
  assert.equal(full.acquisition_resource.rk4_derivative_evaluations, 2555904);
  assert.equal(new Set(full.transcript_receipts.map((row) => row.parameter_vector_sha256)).size, 1);
  assert.equal(new Set(full.transcript_receipts.map((row) => canonicalize(row.time_constant))).size, 1);
  assert.equal(new Set(full.transcript_receipts.map((row) => row.initialization_id)).size, 1);
  assert.equal(full.transcript_receipts[0].time_constant.numerator, 959000);
  assert.equal(full.transcript_receipts[0].time_constant.denominator, 1_000_000);
  assert.equal(full.transcript_receipts.every((row) => row.sample_rows === 1537), true);
});

test("policy view is a closed causal allowlist without truth, identity, or provenance", () => {
  const serialized = canonicalize(full.policy_view);
  for (const forbidden of config.policy_view_contract.forbidden_recursive_fields) {
    assert.equal(serialized.includes(`"${forbidden}":`), false, forbidden);
  }
  for (const forbiddenValue of [
    instance.family_id,
    instance.recipe_id,
    instance.equation_id,
    instance.manifest.instance_id,
    instance.manifest.structural_lineage_id,
    instance.manifest.parameter_vector_sha256,
    instance.manifest.nuisance_vector_sha256,
    instance.packet.packet_id,
    instance.provenance.registry_sha256,
    instance.provenance.family_registry_identity_sha256,
  ]) assert.equal(serialized.includes(JSON.stringify(forbiddenValue)), false, forbiddenValue);
  assert.deepEqual(Object.keys(full.policy_view), config.policy_view_contract.root_fields);
  assert.equal(full.policy_view.projections.length, 26);
  assert.equal(full.policy_view.projections.every((projection) => (
    projection.samples.every((sample, ordinal) => sample.ordinal === ordinal)
  )), true);
  assert.equal(full.policy_view_utf8_bytes < config.resource_caps.policy_view_utf8_bytes, true);
});

test("every arm receives one identical packet/view and writes an append-only charged ledger", () => {
  assert.equal(full.ledger.length, config.arm_ids.length);
  assert.deepEqual(full.ledger.map(({ arm_id: armId }) => armId), config.arm_ids);
  assert.equal(new Set(full.ledger.map((row) => row.fixed_packet_id)).size, 1);
  assert.equal(new Set(full.ledger.map((row) => row.policy_view_sha256)).size, 1);
  assert.equal(full.ledger.every((row) => row.status === "succeeded"), true);
  assert.equal(full.ledger.every((row) => row.response.action === "abstain"), true);
  assert.equal(full.ledger.every((row) => row.resource_ledger.charged), true);
  assert.equal(full.ledger.every((row) => row.resource_ledger.within_caps), true);
  assert.equal(full.ledger.every((row) => (
    row.resource_ledger.actual.sample_rows_read === 39962
      && row.resource_ledger.actual.scalar_operations === 119886
      && row.resource_ledger.actual.wall_seconds === null
      && row.resource_ledger.actual.later_joules === null
  )), true);
  assert.equal(full.comparison_inference_permitted, false);
  assert.equal(full.claim_eligible, false);
  assert.equal(full.result_label, "NO_RESULT");
});

test("partial resume preserves the exact prefix and equals uninterrupted execution", () => {
  assert.equal(partial.status, "partial");
  assert.equal(partial.ledger.length, 3);
  assert.equal(resumed.status, "complete");
  assert.equal(
    canonicalize(resumed.ledger.slice(0, partial.ledger.length)),
    canonicalize(partial.ledger),
  );
  assert.equal(canonicalize(resumed), canonicalize(full));
  assert.equal(
    assertFixture026RsdT02FixedInstanceRunArtifact({
      config, registry, instance, artifact: resumed,
    }),
    resumed,
  );
});

test("validly rehashed response mutation and ledger reorder are rejected", () => {
  const responseTamper = structuredClone(full);
  responseTamper.ledger[0].response.work_digest_sha256 = "0".repeat(64);
  responseTamper.ledger[0].response_sha256 = digest(responseTamper.ledger[0].response);
  rechain(responseTamper);
  assert.throws(
    () => assertFixture026RsdT02FixedInstanceRunArtifact({
      config, registry, instance, artifact: responseTamper,
    }),
    /successful ledger record 0/u,
  );

  const reorder = structuredClone(full);
  [reorder.ledger[0], reorder.ledger[1]] = [reorder.ledger[1], reorder.ledger[0]];
  rechain(reorder);
  assert.throws(
    () => assertFixture026RsdT02FixedInstanceRunArtifact({
      config, registry, instance, artifact: reorder,
    }),
    /ledger record 0/u,
  );
});

test("runtime and malformed policy responses become explicit terminal charged records", () => {
  assert.deepEqual(failureRun.ledger.map(({ status }) => status), [
    "runtime-failure", "malformed-response",
  ]);
  assert.deepEqual(failureRun.ledger.map(({ failure_record: failure }) => failure.category), [
    "runtime-failure", "malformed-response",
  ]);
  assert.equal(failureRun.ledger[0].resource_ledger.actual.runtime_failures, 1);
  assert.equal(failureRun.ledger[1].resource_ledger.actual.malformed_responses, 1);
  assert.equal(failureRun.ledger.every((record) => record.resource_ledger.charged), true);
  assert.equal(failureRun.ledger.every((record) => record.response.action === "abstain"), true);
  assert.equal(assertFixture026RsdT02FixedInstanceRunArtifact({
    config, registry, instance, artifact: failureRun,
  }), failureRun);
  assert.equal(failureResumed.ledger.length, 3);
  assert.equal(
    canonicalize(failureResumed.ledger.slice(0, failureRun.ledger.length)),
    canonicalize(failureRun.ledger),
  );
  assert.equal(failureResumed.ledger[2].arm_id, config.arm_ids[2]);
  assert.equal(failureResumed.ledger[2].status, "succeeded");
});

test("malformed fixed packet fails closed before transcript or arm output", () => {
  assert.equal(malformedInput.status, "malformed-input");
  assert.equal(malformedInput.failure_record.category, "malformed-input");
  assert.equal(malformedInput.policy_view, null);
  assert.equal(malformedInput.transcript_receipts.length, 0);
  assert.equal(malformedInput.ledger.length, 0);
  assert.equal(malformedInput.result_label, "NO_RESULT");
  const hostileInstance = structuredClone(instance);
  hostileInstance.packet.episodes[1].time_constant_s *= 2;
  assert.equal(assertFixture026RsdT02FixedInstanceRunArtifact({
    config, registry, instance: hostileInstance, artifact: malformedInput,
  }), malformedInput);
});

test("JSON Schema accepts config and outputs and refuses unknown output fields", () => {
  for (const artifact of [full, partial, resumed, failureRun, failureResumed, malformedInput]) {
    assert.equal(validateSchema(artifact), true, JSON.stringify(validateSchema.errors));
  }
  const hostile = structuredClone(malformedInput);
  hostile.unregistered = true;
  assert.equal(validateSchema(hostile), false);
});

test("focused execution stays under the bounded CPU-test envelope", () => {
  assert.ok(setupCpuMilliseconds < 60_000, `setup used ${setupCpuMilliseconds} CPU ms`);
  assert.equal(config.resource_caps.thread_cap, 1);
  assert.equal(config.resource_caps.scalar_operations_per_arm, 120000);
  assert.equal(config.resource_caps.fallback_invocations_per_arm, 0);
});
