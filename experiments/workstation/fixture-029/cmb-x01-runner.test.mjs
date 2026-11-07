import assert from "node:assert/strict";
import {
  readFile,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { createAjv } from "../lib/ajv.mjs";
import {
  duplicateJsonlRow,
  swapJsonlRows,
  tearJsonlFile,
} from "../lib/runner-test-helpers.mjs";

import {
  canonicalCmbX01,
  cmbX01ConstructionPayload,
  sha256CmbX01,
} from "./cmb-x01-contract.mjs";
import {
  assertCmbX01LedgerRecord,
} from "./cmb-x01-ledger-contract.mjs";
import {
  auditCmbX01RecordSet,
  computeCmbX01Analysis,
  executeCmbX01,
  prepareCmbX01,
  validateCmbX01Output,
} from "./cmb-x01-runner.mjs";
import { createFixture029SuiteTestSupport } from "./suite-runner.test-support.mjs";

const support = createFixture029SuiteTestSupport({ defaultSubdir: "run" });
let base;
let config;
let records;

const temporaryOutput = (prefix) => support.temporaryOutput(prefix);
const clonedBase = (prefix) => support.clonedBase(base, prefix);

async function readRecords(output = base.output) {
  const raw = await readFile(path.join(output, "raw-events.jsonl"), "utf8");
  return raw.slice(0, -1).split("\n").map((line) => JSON.parse(line));
}

function rehashCore(record) {
  record.construction.integrity.payload_sha256 = sha256CmbX01(
    canonicalCmbX01(cmbX01ConstructionPayload(record.construction)),
  );
  return record;
}

test.before(async () => {
  base = await temporaryOutput("fixture-029-cmb-x01-base-");
  await executeCmbX01({ profile: "smoke", output: base.output });
  config = JSON.parse(await readFile(
    new URL("./configs/cmb-x01-smoke.json", import.meta.url),
    "utf8",
  ));
  records = await readRecords();
});

test.after(async () => {
  await support.cleanup();
});

test("prepare fixes seven arms over all eight CMB-X01 families per public seed", async () => {
  assert.deepEqual(await prepareCmbX01("smoke"), {
    valid: true,
    artifact: "fixture-029",
    track: "CMB-X01",
    execution_claims: ["C-1574"],
    profile: "smoke",
    partition: "public-development-only",
    seeds: 2,
    worlds_per_seed: 8,
    families_per_seed: 8,
    arms: 7,
    work_units: 112,
    confirmation_seeds_created: false,
    held_out_seeds_created: false,
    measured_energy_required: false,
    energy_conclusion_allowed: false,
    comparison_inference_permitted: false,
    claim_eligible: false,
    no_result: true,
  });
});

test("smoke analysis independently replays the complete matrix without result authority", async () => {
  const analysis = await computeCmbX01Analysis(base.output);
  assert.equal(analysis.decision, "diagnostic-pass");
  assert.deepEqual(analysis.coverage, {
    seeds: 2, worlds: 16, families: 8, arms: 7, records: 112,
  });
  assert.ok(Object.values(analysis.checks).every(Boolean));
  assert.equal(analysis.checks.independent_world_and_payload_regeneration, true);
  assert.equal(analysis.checks.paired_exogenous_hashes_equal_within_world, true);
  assert.equal(analysis.checks.eligible_actionable_input_digests_equal, true);
  assert.equal(analysis.checks.common_action_authority_within_world, true);
  assert.equal(analysis.checks.diagnostic_controls_are_nonvacuous, true);
  assert.equal(analysis.checks.conservation_and_resource_ledgers_hold, true);
  assert.equal(analysis.no_result, true);
  assert.equal(analysis.comparison_inference_permitted, false);
  assert.equal(analysis.measured_energy_present, false);
  assert.deepEqual(await validateCmbX01Output(base.output), {
    valid: true,
    run_id: analysis.run_id,
    decision: "diagnostic-pass",
    no_result: true,
  });
});

test("core payload integrity and outer SHA-256 ledger integrity remain separate", () => {
  for (const record of records) {
    assert.deepEqual(Object.keys(record.construction.integrity), ["payload_sha256"]);
    assert.deepEqual(Object.keys(record.integrity), [
      "sequence", "previous_sha256", "record_sha256",
    ]);
    assert.equal("payload_sha256" in record.integrity, false);
    assert.equal("record_sha256" in record.construction.integrity, false);
    assert.equal(assertCmbX01LedgerRecord(record, {
      config,
      runId: record.run_id,
    }), record);
  }

  const forgedOuterHash = structuredClone(records[0]);
  forgedOuterHash.integrity.record_sha256 = "f".repeat(64);
  assert.throws(
    () => assertCmbX01LedgerRecord(forgedOuterHash, {
      config,
      runId: forgedOuterHash.run_id,
    }),
    /closed outer contract/i,
  );
});

test("standard JSON Schema rejects hostile outer and nested event shapes", async () => {
  const schema = JSON.parse(await readFile(
    new URL("./cmb-x01-output.schema.json", import.meta.url),
    "utf8",
  ));
  const validate = createAjv({ allErrors: true }).compile(schema);
  for (const value of records) {
    assert.equal(validate(value), true, JSON.stringify(validate.errors));
  }

  const hostileCorpus = [
    (value) => { value.schema = "1"; },
    (value) => { value.profile = "confirmation"; },
    (value) => { value.seed = -1; },
    (value) => { value.run_id = "A".repeat(64); },
    (value) => { value.claim_scope.push("C-9999"); },
    (value) => { value.best_arm = "X01-RECRUIT"; },
    (value) => { value.construction.public_contract.target_slots = 15; },
    (value) => { value.construction.evaluator_parameters.productive_geometry_ppm = 1_000_001; },
    (value) => { value.construction.outcomes.completed_removals = -1; },
    (value) => { value.construction.outcomes.queue_wait_p99_steps = "0"; },
    (value) => { value.construction.resources.best_arm_operations = 1; },
    (value) => { value.construction.gates.harm_gate_pass = "true"; },
    (value) => { value.construction.gate_thresholds.maximum_harmful_target_fraction_ppm = 0; },
    (value) => { value.construction.integrity.payload_sha256 = "not-a-hash"; },
    (value) => { value.integrity.sequence = -1; },
  ];
  for (const [index, mutate] of hostileCorpus.entries()) {
    const hostile = structuredClone(records[0]);
    mutate(hostile);
    assert.equal(validate(hostile), false, `hostile schema corpus entry ${index}`);
  }
});

test("same frozen inputs produce a byte-identical ledger", async () => {
  const second = await temporaryOutput("fixture-029-cmb-x01-determinism-");
  await executeCmbX01({ profile: "smoke", output: second.output });
  assert.equal(
    await readFile(path.join(base.output, "raw-events.jsonl"), "utf8"),
    await readFile(path.join(second.output, "raw-events.jsonl"), "utf8"),
  );
});

test("resume reconstructs completed work and is byte-identical to uninterrupted execution", async () => {
  const resumed = await temporaryOutput("fixture-029-cmb-x01-resume-");
  const partial = await executeCmbX01({
    profile: "smoke",
    output: resumed.output,
    maxWorkUnits: 13,
  });
  assert.equal(partial.complete, false);
  assert.equal(partial.ledger.completed_work_units, 13);
  const complete = await executeCmbX01({
    profile: "smoke",
    output: resumed.output,
    resume: true,
  });
  assert.equal(complete.complete, true);
  assert.equal(
    await readFile(path.join(base.output, "raw-events.jsonl"), "utf8"),
    await readFile(path.join(resumed.output, "raw-events.jsonl"), "utf8"),
  );
});

test("ledger rejects inner tamper even when the attacker recomputes the core digest", async () => {
  const fixture = await clonedBase("fixture-029-cmb-x01-tamper-");
  const rawPath = path.join(fixture.output, "raw-events.jsonl");
  const hostile = await readRecords(fixture.output);
  hostile[0].construction.policy_action_sha256 = "a".repeat(64);
  rehashCore(hostile[0]);
  await writeFile(rawPath, `${hostile.map(JSON.stringify).join("\n")}\n`);
  await assert.rejects(
    () => computeCmbX01Analysis(fixture.output),
    /frozen contract|hash-chain mismatch/i,
  );
});

test("ledger rejects reordered, duplicated, and torn raw records", async () => {
  const reordered = await clonedBase("fixture-029-cmb-x01-reordered-");
  const duplicated = await clonedBase("fixture-029-cmb-x01-duplicated-");
  const torn = await clonedBase("fixture-029-cmb-x01-torn-");

  await swapJsonlRows(path.join(reordered.output, "raw-events.jsonl"));
  await assert.rejects(
    () => computeCmbX01Analysis(reordered.output),
    /outer contract|hash-chain/i,
  );

  await duplicateJsonlRow(path.join(duplicated.output, "raw-events.jsonl"));
  await assert.rejects(
    () => computeCmbX01Analysis(duplicated.output),
    /duplicate|outer contract|hash-chain/i,
  );

  await tearJsonlFile(path.join(torn.output, "raw-events.jsonl"));
  await assert.rejects(
    () => computeCmbX01Analysis(torn.output),
    /torn trailing record|canonical LF/i,
  );
});

test("independent matrix audit rejects a missing arm and a regenerated-payload mismatch", () => {
  const options = {
    seeds: [1_580_001, 1_580_002],
    config,
    runId: records[0].run_id,
  };
  assert.throws(
    () => auditCmbX01RecordSet({ records: records.slice(0, -1), ...options }),
    /missing or unexpected work unit/i,
  );

  const hostile = structuredClone(records);
  hostile[0].construction.policy_action_sha256 = "b".repeat(64);
  rehashCore(hostile[0]);
  assert.throws(
    () => auditCmbX01RecordSet({ records: hostile, ...options }),
    /frozen contract|independently regenerated payload differs/i,
  );
});

test("core revalidation rejects hidden state, free engine work, and false reuse", () => {
  const hiddenState = structuredClone(records[0]);
  hiddenState.construction.public_contract.latent_state = "harmful";
  rehashCore(hiddenState);

  const freeEngine = structuredClone(records.find((record) => (
    record.arm === "X01-DIRECT"
    && record.construction.inventories.engine.service_used > 0
  )));
  assert.ok(freeEngine);
  freeEngine.construction.resources.logical_operations -=
    freeEngine.construction.resources.engine_service_operations;
  freeEngine.construction.resources.engine_service_operations = 0;
  rehashCore(freeEngine);

  const falseReuse = structuredClone(records.find((record) => (
    record.arm === "X01-RECRUIT"
    && record.construction.outcomes.verified_mediator_reuses > 0
  )));
  assert.ok(falseReuse);
  falseReuse.construction.outcomes.verified_mediator_reuses += 1;
  rehashCore(falseReuse);

  for (const hostile of [hiddenState, freeEngine, falseReuse]) {
    assert.throws(
      () => assertCmbX01LedgerRecord(hostile, {
        config,
        runId: hostile.run_id,
      }),
      /frozen contract|closed outer contract/i,
    );
  }
});

test("runner refuses overwrite, missing resume, and cross-profile resume", async () => {
  const missing = await temporaryOutput("fixture-029-cmb-x01-missing-resume-");
  await assert.rejects(
    () => executeCmbX01({ profile: "smoke", output: base.output }),
    /already exists/i,
  );
  await assert.rejects(
    () => executeCmbX01({ profile: "smoke", output: missing.output, resume: true }),
    /cannot resume a missing/i,
  );
  await assert.rejects(
    () => executeCmbX01({ profile: "development", output: base.output, resume: true }),
    /identity|contract|profile/i,
  );
});
