import assert from "node:assert/strict";
import {
  readFile,
  rm,
} from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import {
  assertCliExecutionRejections,
  assertDeterministicSmokeExecution,
  assertResumeMatchesUninterruptedExecution,
  cleanup,
  corruptRawEventsFirstRow,
  temporaryOutput,
} from "../lib/runner-test-helpers.mjs";

import {
  analyzeFixture027,
  executeFixture027,
  main,
  prepareFixture027,
  validateFixture027Output,
} from "./runner.mjs";

function assertNoResult(value) {
  assert.equal(value.result_label, "NO_RESULT");
  assert.equal(value.no_result, true);
}

test("smoke preparation exposes bounded deterministic CPU-only public work", async () => {
  assert.deepEqual(await prepareFixture027("smoke"), {
    valid: true,
    artifact: "fixture-027",
    track: "RIN-T01",
    profile: "smoke",
    partition: "public-development-only",
    execution_mode: "deterministic-cpu-only",
    seeds: 2,
    worlds_per_seed: 6,
    work_units: 36,
    implemented_tracks: 1,
    registered_tracks: 10,
    confirmation_seeds_created: false,
    transfer_seeds_created: false,
    measured_energy_required: false,
    energy_conclusion_allowed: false,
    claim_eligible: false,
    comparison_inference_permitted: false,
    result_label: "NO_RESULT",
    no_result: true,
  });
});

test("smoke run exercises interface qualification and bounded insulation without result authority", async () => {
  const fixture = await temporaryOutput("fixture-027-smoke-");
  try {
    const execution = await executeFixture027({ profile: "smoke", output: fixture.output, resume: false });
    assert.equal(execution.complete, true);
    assert.equal(execution.run.expected_work_units, 36);
    assertNoResult(execution);
    assertNoResult(execution.run);
    const summary = await analyzeFixture027(fixture.output);
    const validation = await validateFixture027Output(fixture.output);
    assert.equal(summary.decision, "diagnostic-pass");
    assert.ok(Object.values(summary.checks).every(Boolean));
    assert.ok(summary.metrics["bounded-insulation-diagnostic"].insulation_action_u > 0);
    assert.equal(summary.metrics["isolated-assumption"].insulation_action_u, 0);
    for (const metrics of Object.values(summary.metrics)) {
      assert.equal(metrics.valid_records + metrics.invalid_records, metrics.records);
      assert.ok(metrics.valid_records > 0);
      assert.ok(metrics.invalid_records > 0);
    }
    assert.equal(summary.comparison_inference_permitted, false);
    assert.equal(summary.claim_eligible, false);
    assertNoResult(summary);
    assert.deepEqual(validation, {
      valid: true,
      run_id: summary.run_id,
      decision: "diagnostic-pass",
      result_label: "NO_RESULT",
      no_result: true,
    });
  } finally {
    await cleanup(fixture);
  }
});

test("same public inputs produce byte-identical raw ledgers", async () => {
  const left = await temporaryOutput("fixture-027-left-");
  const right = await temporaryOutput("fixture-027-right-");
  try {
    await assertDeterministicSmokeExecution(executeFixture027, left.output, right.output);
  } finally {
    await cleanup(left, right);
  }
});

test("checkpoint resume reproduces uninterrupted output exactly", async () => {
  const resumed = await temporaryOutput("fixture-027-resume-");
  const complete = await temporaryOutput("fixture-027-complete-");
  try {
    await assertResumeMatchesUninterruptedExecution({
      execute: executeFixture027,
      resumed,
      complete,
      maxWorkUnits: 7,
      extraChecks: assertNoResult,
    });
  } finally {
    await cleanup(resumed, complete);
  }
});

test("resume rejects a different profile even when its checkpoint is missing", async () => {
  const fixture = await temporaryOutput("fixture-027-cross-profile-");
  try {
    const partial = await executeFixture027({
      profile: "development",
      output: fixture.output,
      maxWorkUnits: 1,
    });
    assert.equal(partial.complete, false);
    await rm(path.join(fixture.output, "checkpoint.json"));
    await assert.rejects(
      () => executeFixture027({ profile: "smoke", output: fixture.output, resume: true }),
      /runtime contract|run identity|profile/i,
    );
  } finally {
    await cleanup(fixture);
  }
});

test("each serialized-event byte charge equals its persisted UTF-8 JSONL line", async () => {
  const fixture = await temporaryOutput("fixture-027-byte-charge-");
  try {
    await executeFixture027({ profile: "smoke", output: fixture.output });
    const lines = (await readFile(path.join(fixture.output, "raw-events.jsonl"), "utf8"))
      .split("\n")
      .filter(Boolean);
    for (const line of lines) {
      assert.equal(
        JSON.parse(line).serialized_event_bytes_written,
        Buffer.byteLength(`${line}\n`, "utf8"),
      );
    }
  } finally {
    await cleanup(fixture);
  }
});

test("analysis rejects an altered chained diagnostic value", async () => {
  const fixture = await temporaryOutput("fixture-027-corrupt-");
  try {
    await executeFixture027({ profile: "smoke", output: fixture.output });
    await corruptRawEventsFirstRow(fixture.output);
    await assert.rejects(() => analyzeFixture027(fixture.output), /runtime contract|hash/i);
  } finally {
    await cleanup(fixture);
  }
});

test("CLI exposes no private partition, apparatus, meter, or implicit output", async () => {
  await assertCliExecutionRejections({
    main,
    confirmationPattern: /private partitions are not executable/,
    rejectedOptions: [["--meter", "device.json"]],
  });
});
