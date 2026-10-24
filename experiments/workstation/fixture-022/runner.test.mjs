import assert from "node:assert/strict";
import {
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import {
  canonical,
  fixture022ScientificPayload,
  sha256,
} from "./contract.mjs";
import { generateFixture022Worlds } from "./generator.mjs";

import {
  analyzeFixture022,
  executeFixture022,
  main,
  prepareFixture022,
  runFixture022Policy,
  validateFixture022Output,
} from "./runner.mjs";
import {
  assertCliExecutionRejections,
  assertDeterministicSmokeExecution,
  assertResumeMatchesUninterruptedExecution,
  cleanup,
  temporaryOutput,
} from "../lib/runner-test-helpers.mjs";

const root = process.cwd();

function rehashRecords(records) {
  let previous = "0".repeat(64);
  for (const [sequence, record] of records.entries()) {
    record.integrity = {
      sequence,
      previous_sha256: previous,
      record_sha256: sha256(`${previous}\n${canonical(fixture022ScientificPayload(record))}`),
    };
    previous = record.integrity.record_sha256;
  }
  return records;
}

function smokeWorkOrderSha256() {
  const arms = [
    "open-write-majority",
    "robust-propagation-null",
    "gated-memory-with-null-fallback",
  ];
  const keys = [];
  for (const seed of [1516001, 1516002]) {
    for (let world = 0; world < 4; world += 1) {
      for (const arm of arms) keys.push(`${seed}:${world}:${arm}`);
    }
  }
  return sha256(canonical(keys));
}

test("smoke preparation exposes only bounded public-development work", async () => {
  assert.deepEqual(await prepareFixture022("smoke"), {
    valid: true,
    artifact: "fixture-022",
    track: "DEV-T01",
    profile: "smoke",
    partition: "public-development-only",
    seeds: 2,
    worlds_per_seed: 4,
    work_units: 24,
    confirmation_seeds_created: false,
    transfer_seeds_created: false,
    measured_energy_required: false,
    energy_conclusion_allowed: false,
    claim_eligible: false,
    protocol_outcome: "NO_RESULT",
    no_result: true,
  });
});

test("smoke run exercises balanced corruption, abstention, and charged null fallback without result authority", async () => {
  const fixture = await temporaryOutput("fixture-022-smoke-");
  try {
    const execution = await executeFixture022({ profile: "smoke", output: fixture.output });
    assert.equal(execution.complete, true);
    assert.equal(execution.run.expected_work_units, 24);
    const summary = await analyzeFixture022(fixture.output);
    const validation = await validateFixture022Output(fixture.output);
    assert.equal(summary.decision, "diagnostic-pass");
    assert.equal(summary.checks.common_mode_exercises_abstention_and_null_fallback, true);
    assert.equal(summary.checks.common_mode_fallback_cost_is_charged, true);
    assert.equal(summary.checks.valid_memory_has_no_false_fallback, true);
    assert.equal(summary.comparison_inference_permitted, false);
    assert.equal(summary.energy_conclusion_allowed, false);
    assert.equal(summary.claim_eligible, false);
    assert.equal(summary.protocol_outcome, "NO_RESULT");
    assert.deepEqual(validation, {
      valid: true,
      run_id: summary.run_id,
      decision: "diagnostic-pass",
      protocol_outcome: "NO_RESULT",
      no_result: true,
    });
    const first = JSON.parse((await readFile(path.join(fixture.output, "raw-events.jsonl"), "utf8")).split("\n")[0]);
    assert.deepEqual(Object.keys(first.input_sha256).sort(), [
      "audit",
      "config_development",
      "config_smoke",
      "fixture",
      "runner",
      "schema",
    ]);
    assert.ok(Object.values(first.input_sha256).every((digest) => /^[0-9a-f]{64}$/.test(digest)));
    const records = (await readFile(path.join(fixture.output, "raw-events.jsonl"), "utf8"))
      .trimEnd().split("\n").map(JSON.parse);
    const retainedFailures = records.filter((record) => record.failure);
    assert.ok(retainedFailures.length > 0);
    assert.ok(retainedFailures.every((record) => (
      record.failure_reason === "solver-nonconvergence"
      && record.loss === 100
      && Number.isFinite(record.observed_loss)
      && record.charged_resources.memory_writes === record.budget.memory_write_budget
      && record.charged_resources.solver_rounds === record.budget.max_solver_rounds
    )));
    assert.ok(retainedFailures.some((record) => (
      record.accepted_tasks > 0
      || record.fallback_invoked
      || record.corruption_detected
      || record.rollback_count > 0
    )));
  } finally {
    await cleanup(fixture);
  }
});

test("message-cap failure preserves attempted messages and actual rounds separately from charges", async () => {
  const fixture = await temporaryOutput("fixture-022-message-cap-");
  try {
    const smokeConfig = JSON.parse(await readFile(
      new URL("./configs/smoke.json", import.meta.url),
      "utf8",
    ));
    const tinyBudgetConfig = { ...smokeConfig, message_budget_per_arm_bytes: 8 };
    const [world] = generateFixture022Worlds({ seed: 1516001, config: smokeConfig });
    const directPolicy = runFixture022Policy(
      world,
      "open-write-majority",
      tinyBudgetConfig,
    );
    assert.equal(directPolicy.failureReason, "message-budget-exhausted");
    assert.ok(directPolicy.messages > 1);
    assert.equal(directPolicy.solverRounds, 1);

    const execution = await executeFixture022({
      profile: "smoke",
      output: fixture.output,
      maxWorkUnits: 1,
      runtime: {
        policy(world) {
          return {
            labels: world.nodes.map((node) => (node.wounded ? -1 : node.memory_role)),
            woundedIds: world.nodes.filter((node) => node.wounded).map((node) => node.id),
            trustedMemoryIds: [],
            messages: 25001,
            memoryReads: 0,
            memoryWrites: 0,
            rollbackCount: 0,
            memoryAbstentionCount: 0,
            fallbackInvoked: false,
            corruptionDetected: false,
            solverRounds: 1,
            converged: false,
            failureReason: "message-budget-exhausted",
          };
        },
      },
    });
    assert.equal(execution.complete, false);
    const record = JSON.parse(
      (await readFile(path.join(fixture.output, "raw-events.jsonl"), "utf8")).trimEnd(),
    );
    assert.equal(record.failure_reason, "message-budget-exhausted");
    assert.equal(record.failure_detail.signal, "message-attempt-exceeds-cap");
    assert.equal(record.messages_count, 25001);
    assert.equal(record.message_bytes, 200008);
    assert.equal(record.solver_rounds, 1);
    assert.equal(record.charged_resources.messages_count, 25000);
    assert.equal(record.charged_resources.message_bytes, 200000);
    assert.equal(record.charged_resources.solver_rounds, 24);
    assert.equal(record.attempted_tasks, record.wounded_nodes);
  } finally {
    await cleanup(fixture);
  }
});

test("policy, evaluator, and numerical failures remain typed through clean replay", async () => {
  const policyFailure = await temporaryOutput("fixture-022-policy-exception-");
  const evaluatorFailure = await temporaryOutput("fixture-022-evaluator-exception-");
  const numericalFailure = await temporaryOutput("fixture-022-numerical-failure-");
  try {
    await executeFixture022({
      profile: "smoke",
      output: policyFailure.output,
      maxWorkUnits: 1,
      runtime: { policy() { throw new Error("deterministic policy test fault"); } },
    });
    await executeFixture022({
      profile: "smoke",
      output: evaluatorFailure.output,
      maxWorkUnits: 1,
      runtime: { evaluator() { throw new Error("deterministic evaluator test fault"); } },
    });
    await executeFixture022({
      profile: "smoke",
      output: numericalFailure.output,
      maxWorkUnits: 1,
      runtime: {
        evaluator() {
          return {
            accepted: 0,
            wrongRoleCount: 0,
            unsafeWriteCount: 0,
            supportMissCount: 0,
            roleErrorRate: 1,
            acceptedServiceFraction: 0,
            observedLoss: Number.NaN,
          };
        },
      },
    });
    const records = await Promise.all([
      policyFailure,
      evaluatorFailure,
      numericalFailure,
    ].map(async (entry) => JSON.parse(
      (await readFile(path.join(entry.output, "raw-events.jsonl"), "utf8")).trimEnd(),
    )));
    assert.deepEqual(records.map((record) => record.failure_reason), [
      "policy-exception",
      "evaluator-exception",
      "numerical-failure",
    ]);
    assert.deepEqual(records.map((record) => record.failure_detail.signal), [
      "policy-threw",
      "evaluator-threw",
      "non-finite-evaluator-output",
    ]);
    assert.ok(records.every((record) => (
      record.failure
      && record.attempted_tasks === record.wounded_nodes
      && record.accepted_tasks === 0
      && record.observed_loss === null
      && record.loss === 100
      && record.charged_resources.memory_writes === record.budget.memory_write_budget
      && record.charged_resources.solver_rounds === record.budget.max_solver_rounds
    )));
    assert.equal(records[0].failure_detail.resource_observation_complete, false);
    assert.equal(records[0].messages_count, 0);
    assert.equal(records[1].failure_detail.resource_observation_complete, true);
    assert.ok(records[1].messages_count > 0);
    for (const entry of [policyFailure, evaluatorFailure, numericalFailure]) {
      const resumed = await executeFixture022({
        profile: "smoke",
        output: entry.output,
        resume: true,
      });
      assert.equal(resumed.complete, true);
      assert.equal((await analyzeFixture022(entry.output)).decision, "diagnostic-pass");
    }
  } finally {
    await cleanup(policyFailure, evaluatorFailure, numericalFailure);
  }
});

test("finite invalid policy and evaluator structures retain their denominators", async () => {
  const negative = await temporaryOutput("fixture-022-negative-counter-");
  const fractional = await temporaryOutput("fixture-022-fractional-counter-");
  const identifiers = await temporaryOutput("fixture-022-invalid-identifiers-");
  const evaluator = await temporaryOutput("fixture-022-invalid-evaluator-");
  try {
    const policyMutation = (mutate) => ({
      policy(world, arm, config) {
        return mutate(structuredClone(runFixture022Policy(world, arm, config)));
      },
    });
    await executeFixture022({
      profile: "smoke",
      output: negative.output,
      maxWorkUnits: 1,
      runtime: policyMutation((policy) => ({ ...policy, messages: -1 })),
    });
    await executeFixture022({
      profile: "smoke",
      output: fractional.output,
      maxWorkUnits: 1,
      runtime: policyMutation((policy) => ({ ...policy, memoryReads: 0.5 })),
    });
    await executeFixture022({
      profile: "smoke",
      output: identifiers.output,
      maxWorkUnits: 1,
      runtime: policyMutation((policy) => ({
        ...policy,
        labels: policy.labels.map((label, index) => (index === 0 ? 99 : label)),
        woundedIds: [999],
      })),
    });
    await executeFixture022({
      profile: "smoke",
      output: evaluator.output,
      maxWorkUnits: 1,
      runtime: {
        evaluator() {
          return {
            accepted: 999,
            wrongRoleCount: 999,
            unsafeWriteCount: 999,
            supportMissCount: 999,
            roleErrorRate: 0.5,
            acceptedServiceFraction: 0.5,
            observedLoss: 10,
          };
        },
      },
    });
    const records = await Promise.all([
      negative,
      fractional,
      identifiers,
      evaluator,
    ].map(async (entry) => JSON.parse(
      (await readFile(path.join(entry.output, "raw-events.jsonl"), "utf8")).trimEnd(),
    )));
    assert.deepEqual(records.map((record) => record.failure_reason), Array(4).fill("numerical-failure"));
    assert.deepEqual(records.map((record) => record.failure_detail.signal), [
      "invalid-policy-output",
      "invalid-policy-output",
      "invalid-policy-output",
      "invalid-evaluator-output",
    ]);
    assert.ok(records.every((record) => (
      record.attempted_tasks === record.wounded_nodes
      && record.observed_loss === null
      && record.loss === 100
      && record.charged_resources.memory_writes === record.budget.memory_write_budget
    )));
  } finally {
    await cleanup(negative, fractional, identifiers, evaluator);
  }
});

test("analysis derives the complete work set and rejects an incomplete balanced prefix", async () => {
  const fixture = await temporaryOutput("fixture-022-prefix-forgery-");
  try {
    const partial = await executeFixture022({
      profile: "smoke",
      output: fixture.output,
      maxWorkUnits: 12,
    });
    assert.equal(partial.complete, false);
    const rawRows = (await readFile(path.join(fixture.output, "raw-events.jsonl"), "utf8"))
      .trimEnd().split("\n").map(JSON.parse);
    assert.equal(rawRows.length, 12);
    assert.deepEqual(
      Object.fromEntries([...new Set(rawRows.map((row) => row.corruption_family))]
        .sort().map((family) => [family, rawRows.filter((row) => row.corruption_family === family).length])),
      {
        "common-mode-shift": 3,
        "independent-permutation": 3,
        "local-patch-shift": 3,
        valid: 3,
      },
    );
    const checkpoint = JSON.parse(await readFile(path.join(fixture.output, "checkpoint.json"), "utf8"));
    const forgedRun = {
      ...checkpoint.run_identity,
      expected_work_units: 12,
      expected_worlds: 4,
      expected_work_order_sha256: smokeWorkOrderSha256(),
      ledger: {
        records: checkpoint.records,
        scientific_payload_sha256: checkpoint.scientific_payload_sha256,
        hash_chain_sha256: checkpoint.hash_chain_sha256,
        completed_work_units: checkpoint.records,
        checkpoint_status: "current",
      },
      raw_path: path.relative(root, path.join(fixture.output, "raw-events.jsonl")).replaceAll("\\", "/"),
      checkpoint_path: path.relative(root, path.join(fixture.output, "checkpoint.json")).replaceAll("\\", "/"),
      measured_energy_present: false,
      energy_conclusion_allowed: false,
      claim_eligible: false,
      scientific_result: false,
      performance_result: false,
      interpretation: "NO_RESULT: development-only DEV-T01 smoke plumbing; no comparison is claim-eligible.",
    };
    await writeFile(path.join(fixture.output, "run.json"), `${JSON.stringify(forgedRun, null, 2)}\n`);
    await assert.rejects(
      () => analyzeFixture022(fixture.output),
      /derived completion state/,
    );
    forgedRun.expected_work_units = 24;
    forgedRun.expected_worlds = 8;
    await writeFile(path.join(fixture.output, "run.json"), `${JSON.stringify(forgedRun, null, 2)}\n`);
    await assert.rejects(
      () => analyzeFixture022(fixture.output),
      /complete canonical work sequence/,
    );
  } finally {
    await cleanup(fixture);
  }
});

test("analysis rejects forged embedded run identity metadata", async () => {
  const fixture = await temporaryOutput("fixture-022-run-identity-");
  try {
    await executeFixture022({ profile: "smoke", output: fixture.output });
    const runPath = path.join(fixture.output, "run.json");
    const run = JSON.parse(await readFile(runPath, "utf8"));
    run.config.grid_width_nodes += 1;
    run.input_sha256.audit = "f".repeat(64);
    await writeFile(runPath, `${JSON.stringify(run, null, 2)}\n`);
    await assert.rejects(
      () => analyzeFixture022(fixture.output),
      /embedded run identity/,
    );
  } finally {
    await cleanup(fixture);
  }
});

test("analysis binds each rehashed event budget to the frozen run config", async () => {
  const fixture = await temporaryOutput("fixture-022-budget-binding-");
  try {
    await executeFixture022({ profile: "smoke", output: fixture.output });
    const rawPath = path.join(fixture.output, "raw-events.jsonl");
    const rows = (await readFile(rawPath, "utf8")).trimEnd().split("\n").map(JSON.parse);
    const targetWorld = rows[0].world_id;
    for (const row of rows.filter((entry) => entry.world_id === targetWorld)) {
      row.budget.max_solver_rounds += 1;
      row.budget.message_budget_bytes += row.budget.bytes_per_message;
      row.budget.memory_write_budget += 1;
    }
    let previous = "0".repeat(64);
    for (const [sequence, row] of rows.entries()) {
      row.integrity = {
        sequence,
        previous_sha256: previous,
        record_sha256: sha256(`${previous}\n${canonical(fixture022ScientificPayload(row))}`),
      };
      previous = row.integrity.record_sha256;
    }
    await writeFile(rawPath, `${rows.map(JSON.stringify).join("\n")}\n`);
    await assert.rejects(
      () => analyzeFixture022(fixture.output),
      /fresh run identity/,
    );
  } finally {
    await cleanup(fixture);
  }
});

test("same public inputs produce byte-identical raw ledgers", async () => {
  const left = await temporaryOutput("fixture-022-left-");
  const right = await temporaryOutput("fixture-022-right-");
  try {
    await assertDeterministicSmokeExecution(executeFixture022, left.output, right.output);
  } finally {
    await cleanup(left, right);
  }
});

test("checkpoint resume reproduces uninterrupted output exactly", async () => {
  const resumed = await temporaryOutput("fixture-022-resume-");
  const complete = await temporaryOutput("fixture-022-complete-");
  try {
    await assertResumeMatchesUninterruptedExecution({
      execute: executeFixture022,
      resumed,
      complete,
      maxWorkUnits: 7,
    });
  } finally {
    await cleanup(resumed, complete);
  }
});

test("final-record resume reconstructs missing and stale checkpoints", async () => {
  const missing = await temporaryOutput("fixture-022-missing-checkpoint-");
  const stale = await temporaryOutput("fixture-022-stale-checkpoint-");
  try {
    await executeFixture022({ profile: "smoke", output: missing.output });
    await rm(path.join(missing.output, "checkpoint.json"));
    await rm(path.join(missing.output, "run.json"));
    const recoveredMissing = await executeFixture022({
      profile: "smoke",
      output: missing.output,
      resume: true,
    });
    assert.equal(recoveredMissing.complete, true);
    assert.equal(recoveredMissing.run.ledger.checkpoint_status, "current");
    assert.equal((await analyzeFixture022(missing.output)).decision, "diagnostic-pass");

    await executeFixture022({ profile: "smoke", output: stale.output, maxWorkUnits: 23 });
    const staleCheckpoint = await readFile(path.join(stale.output, "checkpoint.json"), "utf8");
    await executeFixture022({ profile: "smoke", output: stale.output, resume: true });
    await writeFile(path.join(stale.output, "checkpoint.json"), staleCheckpoint);
    await rm(path.join(stale.output, "run.json"));
    const recoveredStale = await executeFixture022({
      profile: "smoke",
      output: stale.output,
      resume: true,
    });
    assert.equal(recoveredStale.complete, true);
    assert.equal(recoveredStale.run.ledger.checkpoint_status, "current");
    assert.equal((await analyzeFixture022(stale.output)).decision, "diagnostic-pass");
  } finally {
    await cleanup(missing, stale);
  }
});

test("resume and analysis reject rehashed canonical work-order and content substitutions", async () => {
  const reordered = await temporaryOutput("fixture-022-reordered-");
  const substituted = await temporaryOutput("fixture-022-substituted-");
  try {
    await executeFixture022({ profile: "smoke", output: reordered.output });
    const reorderedRaw = path.join(reordered.output, "raw-events.jsonl");
    const reorderedRows = (await readFile(reorderedRaw, "utf8"))
      .trimEnd().split("\n").map(JSON.parse);
    [reorderedRows[0], reorderedRows[1]] = [reorderedRows[1], reorderedRows[0]];
    rehashRecords(reorderedRows);
    await writeFile(reorderedRaw, `${reorderedRows.map(JSON.stringify).join("\n")}\n`);
    await rm(path.join(reordered.output, "checkpoint.json"));
    await rm(path.join(reordered.output, "run.json"));
    await assert.rejects(
      () => executeFixture022({ profile: "smoke", output: reordered.output, resume: true }),
      /canonical work content or order mismatch at sequence 0/,
    );

    await executeFixture022({ profile: "smoke", output: substituted.output });
    const substitutedRaw = path.join(substituted.output, "raw-events.jsonl");
    const substitutedRows = (await readFile(substitutedRaw, "utf8"))
      .trimEnd().split("\n").map(JSON.parse);
    substitutedRows[0].corruption_detected = !substitutedRows[0].corruption_detected;
    rehashRecords(substitutedRows);
    await writeFile(substitutedRaw, `${substitutedRows.map(JSON.stringify).join("\n")}\n`);
    await rm(path.join(substituted.output, "checkpoint.json"));
    await assert.rejects(
      () => analyzeFixture022(substituted.output),
      /canonical work content or order mismatch at sequence 0/,
    );
  } finally {
    await cleanup(reordered, substituted);
  }
});

test("closed checkpoint rejects an unknown field even after digest recomputation", async () => {
  const fixture = await temporaryOutput("fixture-022-checkpoint-closure-");
  try {
    await executeFixture022({ profile: "smoke", output: fixture.output });
    const checkpointPath = path.join(fixture.output, "checkpoint.json");
    const checkpoint = JSON.parse(await readFile(checkpointPath, "utf8"));
    checkpoint.unregistered_field = "forged";
    delete checkpoint.checkpoint_sha256;
    checkpoint.checkpoint_sha256 = sha256(canonical(checkpoint));
    await writeFile(checkpointPath, `${JSON.stringify(checkpoint, null, 2)}\n`);
    await assert.rejects(
      () => analyzeFixture022(fixture.output),
      /checkpoint has missing or unknown fields/,
    );
  } finally {
    await cleanup(fixture);
  }
});

test("resume atomically rebuilds only a torn derivable run document", async () => {
  const fixture = await temporaryOutput("fixture-022-torn-run-");
  try {
    await executeFixture022({ profile: "smoke", output: fixture.output });
    const runPath = path.join(fixture.output, "run.json");
    const original = await readFile(runPath, "utf8");
    await writeFile(runPath, original.slice(0, Math.floor(original.length / 2)));
    const repaired = await executeFixture022({
      profile: "smoke",
      output: fixture.output,
      resume: true,
    });
    assert.equal(repaired.complete, true);
    assert.equal(await readFile(runPath, "utf8"), original);

    const nonidentical = JSON.parse(original);
    nonidentical.expected_worlds += 1;
    await writeFile(runPath, `${JSON.stringify(nonidentical, null, 2)}\n`);
    await assert.rejects(
      () => executeFixture022({ profile: "smoke", output: fixture.output, resume: true }),
      /Refusing to replace non-identical run.json/,
    );
  } finally {
    await cleanup(fixture);
  }
});

test("analysis rejects an altered chained protected metric", async () => {
  const fixture = await temporaryOutput("fixture-022-corrupt-");
  try {
    await executeFixture022({ profile: "smoke", output: fixture.output });
    const rawPath = path.join(fixture.output, "raw-events.jsonl");
    const rows = (await readFile(rawPath, "utf8")).trimEnd().split("\n");
    const first = JSON.parse(rows[0]);
    first.wrong_role_count += 1;
    rows[0] = JSON.stringify(first);
    await writeFile(rawPath, `${rows.join("\n")}\n`);
    await assert.rejects(() => analyzeFixture022(fixture.output), /runtime contract|hash/i);
  } finally {
    await cleanup(fixture);
  }
});

test("CLI exposes no confirmation or transfer action and rejects seed injection", async () => {
  await assertCliExecutionRejections({ main, confirmationPattern: /private partitions are not executable/ });
});
