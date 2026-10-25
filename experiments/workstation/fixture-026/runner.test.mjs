import assert from "node:assert/strict";
import {
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import {
  assertFixture026Record,
  canonical,
  sha256,
} from "./contract.mjs";
import {
  buildPolicyView,
  generateFixture026World,
} from "./generator.mjs";

import {
  analyzeFixture026,
  assertFixture026EventReplay,
  assertFixture026OrderedWorkKeys,
  executeFixture026,
  main,
  materializeFixture026DevelopmentRecords,
  prepareFixture026,
  FIXTURE_026_RUNTIME_FINGERPRINT,
  validateFixture026Output,
} from "./runner.mjs";
import {
  assertCheckpointSchemaRejections,
  assertCliExecutionRejections,
  assertDeterministicSmokeExecution,
  assertResumeMatchesUninterruptedExecution,
  cleanup,
  temporaryOutput,
} from "../lib/runner-test-helpers.mjs";

function assertNoResult(value) {
  assert.equal(value.result_label, "NO_RESULT");
  assert.equal(value.no_result, true);
}

function executionRuntimeDigest() {
  return sha256(canonical(FIXTURE_026_RUNTIME_FINGERPRINT));
}

test("smoke preparation exposes bounded deterministic CPU-only public work", async () => {
  assert.deepEqual(await prepareFixture026("smoke"), {
    valid: true,
    artifact: "fixture-026",
    track: "RSD-T01",
    claim_scope: ["C-1540"],
    profile: "smoke",
    partition: "public-development-only",
    execution_mode: "deterministic-cpu-only",
    gpu_permitted: false,
    runtime_fingerprint: FIXTURE_026_RUNTIME_FINGERPRINT,
    runtime_fingerprint_sha256: executionRuntimeDigest(),
    seeds: 2,
    worlds_per_seed: 24,
    valid_generator_families: 5,
    histories_per_generator_family: 4,
    valid_cartesian_cells_per_seed: 20,
    malformed_sentinels_per_seed: 4,
    work_units: 96,
    implemented_tracks: 1,
    registered_tracks: 10,
    confirmation_seeds_created: false,
    transfer_seeds_created: false,
    measured_energy_required: false,
    energy_conclusion_allowed: false,
    claim_eligible: false,
    comparison_inference_permitted: false,
    scientific_result: false,
    performance_result: false,
    result_label: "NO_RESULT",
    no_result: true,
  });
});

test("smoke run exercises full-trajectory scoring and lookalikes without result authority", async () => {
  const fixture = await temporaryOutput("fixture-026-smoke-");
  try {
    const execution = await executeFixture026({ profile: "smoke", output: fixture.output, resume: false });
    assert.equal(execution.complete, true);
    assert.equal(execution.run.expected_work_units, 96);
    assert.deepEqual(execution.run.seeds, ["1540001", "1540002"]);
    assertNoResult(execution);
    assertNoResult(execution.run);
    assert.deepEqual(execution.run.runtime_fingerprint, FIXTURE_026_RUNTIME_FINGERPRINT);
    assert.equal(execution.run.runtime_fingerprint_sha256, executionRuntimeDigest());
    assert.equal(execution.run.input_sha256.runtime, executionRuntimeDigest());
    const summary = await analyzeFixture026(fixture.output);
    const validation = await validateFixture026Output(fixture.output);
    assert.equal(summary.decision, "contract-validation-pass");
    assert.ok(Object.values(summary.checks).every(Boolean));
    assert.equal(summary.metrics["full-trajectory-diagnostic"].generator_family_balanced_accuracy, 1);
    assert.ok(summary.metrics["peak-endpoint-lookalike"].generator_family_balanced_accuracy < 1);
    assert.equal(summary.metrics["full-trajectory-diagnostic"].mean_trajectory_discrepancy_estimation_error, 0);
    assert.ok(summary.metrics["peak-endpoint-lookalike"].mean_trajectory_discrepancy_estimation_error > 0);
    for (const metrics of Object.values(summary.metrics)) {
      assert.equal(metrics.valid_generator_family_records + metrics.invalid_gate_records, metrics.records);
      assert.ok(metrics.valid_generator_family_records > 0);
      assert.ok(metrics.invalid_gate_records > 0);
    }
    assert.equal(summary.accuracy_denominator, "five constructed generator families only; malformed sentinels excluded; the cross-cutting trace-fact vector retains its logical dependencies, is evaluator-recorded only, and has no probe prediction or property-performance score");
    assert.deepEqual(summary.trajectory_score, {
      name: "D",
      scale_y: 1,
      quadrature: "trapezoid",
      time_step_s: 0.02,
      horizon_s: 4,
      unit: "dimensionless",
    });
    assert.deepEqual(summary.runtime_fingerprint, FIXTURE_026_RUNTIME_FINGERPRINT);
    assert.equal(summary.runtime_fingerprint_sha256, executionRuntimeDigest());
    assert.equal(summary.comparison_inference_permitted, false);
    assert.equal(summary.claim_eligible, false);
    assert.equal(summary.measured_energy_present, false);
    assert.equal(summary.energy_conclusion_allowed, false);
    assertNoResult(summary);
    assert.deepEqual(validation, {
      valid: true,
      run_id: summary.run_id,
      decision: "contract-validation-pass",
      result_label: "NO_RESULT",
      no_result: true,
    });
  } finally {
    await cleanup(fixture);
  }
});

test("same public inputs produce byte-identical raw ledgers", async () => {
  const left = await temporaryOutput("fixture-026-left-");
  const right = await temporaryOutput("fixture-026-right-");
  try {
    await assertDeterministicSmokeExecution(executeFixture026, left.output, right.output);
  } finally {
    await cleanup(left, right);
  }
});

test("checkpoint resume reproduces uninterrupted output exactly", async () => {
  const resumed = await temporaryOutput("fixture-026-resume-");
  const complete = await temporaryOutput("fixture-026-complete-");
  try {
    await assertResumeMatchesUninterruptedExecution({
      execute: executeFixture026,
      resumed,
      complete,
      maxWorkUnits: 7,
      extraChecks: assertNoResult,
    });
  } finally {
    await cleanup(resumed, complete);
  }
});

test("complete resume repairs stale or missing checkpoints before returning", async () => {
  const fixture = await temporaryOutput("fixture-026-checkpoint-reconcile-");
  try {
    const partial = await executeFixture026({
      profile: "smoke",
      output: fixture.output,
      maxWorkUnits: 1,
    });
    assert.equal(partial.complete, false);
    const checkpointPath = path.join(fixture.output, "checkpoint.json");
    const staleCheckpoint = await readFile(checkpointPath, "utf8");
    await executeFixture026({ profile: "smoke", output: fixture.output, resume: true });
    const currentCheckpoint = await readFile(checkpointPath, "utf8");

    await writeFile(checkpointPath, staleCheckpoint);
    const staleRepair = await executeFixture026({
      profile: "smoke",
      output: fixture.output,
      resume: true,
    });
    assert.equal(staleRepair.complete, true);
    assert.equal(staleRepair.run.ledger.checkpoint_status, "current");
    assert.equal(await readFile(checkpointPath, "utf8"), currentCheckpoint);

    await rm(checkpointPath);
    const missingRepair = await executeFixture026({
      profile: "smoke",
      output: fixture.output,
      resume: true,
    });
    assert.equal(missingRepair.complete, true);
    assert.equal(missingRepair.run.ledger.checkpoint_status, "current");
    assert.equal(await readFile(checkpointPath, "utf8"), currentCheckpoint);
  } finally {
    await cleanup(fixture);
  }
});

test("run and checkpoint authority documents reject unknown fields and type drift", async () => {
  const fixture = await temporaryOutput("fixture-026-authority-closure-");
  try {
    await executeFixture026({ profile: "smoke", output: fixture.output });
    const runPath = path.join(fixture.output, "run.json");
    const checkpointPath = path.join(fixture.output, "checkpoint.json");
    const originalRun = JSON.parse(await readFile(runPath, "utf8"));
    const runMutations = [
      (run) => { run.claim_authority = true; },
      (run) => { run.ledger.claim_eligible = true; },
      (run) => { run.ledger.records = String(run.ledger.records); },
      (run) => { run.raw_path = run.checkpoint_path; },
      (run) => { run.checkpoint_path = run.raw_path; },
      (run) => { run.interpretation = "NO_RESULT: altered authority prose."; },
    ];
    for (const mutate of runMutations) {
      const run = structuredClone(originalRun);
      mutate(run);
      await writeFile(runPath, `${JSON.stringify(run, null, 2)}\n`);
      await assert.rejects(
        () => analyzeFixture026(fixture.output),
        /missing or unknown|closed type|canonical artifact paths|authority contract/i,
      );
    }
    await writeFile(runPath, `${JSON.stringify(originalRun, null, 2)}\n`);

    await assertCheckpointSchemaRejections({
      checkpointPath,
      assertRejection: () => assert.rejects(
        () => executeFixture026({ profile: "smoke", output: fixture.output, resume: true }),
        /missing or unknown fields|identity mismatch/i,
      ),
      hash: sha256,
      canonical,
    });
  } finally {
    await cleanup(fixture);
  }
});

test("resume rejects a different profile even without a checkpoint", async () => {
  const fixture = await temporaryOutput("fixture-026-cross-profile-");
  try {
    const partial = await executeFixture026({ profile: "development", output: fixture.output, maxWorkUnits: 1 });
    assert.equal(partial.complete, false);
    await rm(path.join(fixture.output, "checkpoint.json"));
    await assert.rejects(
      () => executeFixture026({ profile: "smoke", output: fixture.output, resume: true }),
      /runtime contract|run identity|profile/i,
    );
  } finally {
    await cleanup(fixture);
  }
});

test("each event byte charge equals its persisted UTF-8 JSONL line", async () => {
  const fixture = await temporaryOutput("fixture-026-byte-charge-");
  try {
    await executeFixture026({ profile: "smoke", output: fixture.output });
    const raw = await readFile(path.join(fixture.output, "raw-events.jsonl"), "utf8");
    assert.equal(raw.includes("\r"), false);
    assert.equal(raw.endsWith("\n"), true);
    const lines = raw
      .split("\n")
      .filter(Boolean);
    const config = JSON.parse(await readFile(
      "experiments/workstation/fixture-026/configs/smoke.json",
      "utf8",
    ));
    for (const line of lines) {
      const record = JSON.parse(line);
      assert.equal(
        record.serialized_event_bytes_written,
        Buffer.byteLength(`${line}\n`, "utf8"),
      );
      const world = generateFixture026World({
        seed: record.seed,
        config,
        worldIndex: record.world_index,
      });
      const view = buildPolicyView(world, record.arm);
      assert.equal(
        record.serialized_policy_view_utf8_bytes,
        record.trace_valid ? Buffer.byteLength(JSON.stringify(view), "utf8") : 0,
      );
    }
  } finally {
    await cleanup(fixture);
  }
});

test("analysis rejects a hash-chain mutation", async () => {
  const fixture = await temporaryOutput("fixture-026-corrupt-");
  try {
    await executeFixture026({ profile: "smoke", output: fixture.output });
    const rawPath = path.join(fixture.output, "raw-events.jsonl");
    const rows = (await readFile(rawPath, "utf8")).trimEnd().split("\n");
    const first = JSON.parse(rows[0]);
    first.tail_discrepancy += 0.1;
    rows[0] = JSON.stringify(first);
    await writeFile(rawPath, `${rows.join("\n")}\n`);
    await assert.rejects(() => analyzeFixture026(fixture.output), /runtime contract|hash/i);
  } finally {
    await cleanup(fixture);
  }
});

test("semantic replay rejects a validly rehashed but generator-impossible event", async () => {
  const fixture = await temporaryOutput("fixture-026-semantic-replay-");
  try {
    await executeFixture026({ profile: "smoke", output: fixture.output });
    const rawPath = path.join(fixture.output, "raw-events.jsonl");
    const first = JSON.parse((await readFile(rawPath, "utf8")).split("\n")[0]);
    first.history_family = first.history_family === "step" ? "ramp" : "step";
    const payload = { ...first };
    delete payload.integrity;
    const { canonical, sha256 } = await import("./contract.mjs");
    first.integrity.record_sha256 = sha256(`${first.integrity.previous_sha256}\n${canonical(payload)}`);
    await assert.rejects(() => assertFixture026EventReplay(first), /semantic replay mismatch/);
  } finally {
    await cleanup(fixture);
  }
});

test("resume rejects a validly rehashed generator-impossible prefix before deriving remaining work", async () => {
  const fixture = await temporaryOutput("fixture-026-resume-semantic-prefix-");
  try {
    const partial = await executeFixture026({
      profile: "smoke",
      output: fixture.output,
      maxWorkUnits: 1,
    });
    assert.equal(partial.complete, false);
    const rawPath = path.join(fixture.output, "raw-events.jsonl");
    const record = JSON.parse((await readFile(rawPath, "utf8")).trimEnd());
    record.history_family = record.history_family === "step" ? "ramp" : "step";
    const payload = { ...record };
    delete payload.integrity;
    record.integrity.record_sha256 = sha256(
      `${record.integrity.previous_sha256}\n${canonical(payload)}`,
    );
    await writeFile(rawPath, `${JSON.stringify(record)}\n`);
    await rm(path.join(fixture.output, "checkpoint.json"));
    await assert.rejects(
      () => executeFixture026({ profile: "smoke", output: fixture.output, resume: true }),
      /semantic replay mismatch/,
    );
  } finally {
    await cleanup(fixture);
  }
});

test("resume rejects a semantically valid record that is not the exact frozen work-grid prefix", async () => {
  const fixture = await temporaryOutput("fixture-026-resume-work-prefix-");
  try {
    await executeFixture026({ profile: "smoke", output: fixture.output, maxWorkUnits: 1 });
    const [replacement] = await materializeFixture026DevelopmentRecords("smoke", [{
      seed: "1540999",
      world_index: 0,
      arm: "full-trajectory-diagnostic",
    }]);
    await writeFile(
      path.join(fixture.output, "raw-events.jsonl"),
      `${JSON.stringify(replacement)}\n`,
    );
    await rm(path.join(fixture.output, "checkpoint.json"));
    await assert.rejects(
      () => executeFixture026({ profile: "smoke", output: fixture.output, resume: true }),
      /exact prefix/,
    );
  } finally {
    await cleanup(fixture);
  }
});

test("runtime fingerprint is event-bound and reanalysis rejects a changed runtime identity", async () => {
  const fixture = await temporaryOutput("fixture-026-runtime-fingerprint-");
  try {
    await executeFixture026({ profile: "smoke", output: fixture.output });
    const rawPath = path.join(fixture.output, "raw-events.jsonl");
    const first = JSON.parse((await readFile(rawPath, "utf8")).split("\n")[0]);
    first.input_sha256.runtime = first.input_sha256.runtime === "f".repeat(64)
      ? "e".repeat(64)
      : "f".repeat(64);
    const payload = { ...first };
    delete payload.integrity;
    first.integrity.record_sha256 = sha256(`${first.integrity.previous_sha256}\n${canonical(payload)}`);
    assert.equal(assertFixture026Record(first), first);
    await assert.rejects(
      () => assertFixture026EventReplay(first),
      /runtime contract/,
    );

    const runPath = path.join(fixture.output, "run.json");
    const run = JSON.parse(await readFile(runPath, "utf8"));
    run.runtime_fingerprint = {
      ...run.runtime_fingerprint,
      node_version: `${run.runtime_fingerprint.node_version}-mutated`,
    };
    await writeFile(runPath, `${JSON.stringify(run, null, 2)}\n`);
    await assert.rejects(
      () => analyzeFixture026(fixture.output),
      /runtime fingerprint/,
    );
  } finally {
    await cleanup(fixture);
  }
});

test("ordered work-key gate rejects a valid replacement that omits one registered unit", async () => {
  const fixture = await temporaryOutput("fixture-026-work-substitution-");
  try {
    await executeFixture026({ profile: "smoke", output: fixture.output });
    const records = (await readFile(path.join(fixture.output, "raw-events.jsonl"), "utf8"))
      .trimEnd().split("\n").map(JSON.parse);
    assert.equal((await assertFixture026OrderedWorkKeys(records, "smoke")).length, records.length);
    const units = records.map((record) => ({
      seed: record.seed,
      world_index: record.world_index,
      arm: record.arm,
    }));
    units[0] = { ...units[0], seed: "1540999" };
    const regenerated = await materializeFixture026DevelopmentRecords("smoke", units);
    assert.equal(regenerated.length, records.length);
    assert.equal(regenerated[0].seed, "1540999");
    await assert.rejects(
      () => assertFixture026OrderedWorkKeys(regenerated, "smoke"),
      /ordered work-key sequence differs/,
    );
  } finally {
    await cleanup(fixture);
  }
});

test("ordered work-key gate rejects a validly regenerated reordered chain", async () => {
  const fixture = await temporaryOutput("fixture-026-work-reorder-");
  try {
    await executeFixture026({ profile: "smoke", output: fixture.output });
    const records = (await readFile(path.join(fixture.output, "raw-events.jsonl"), "utf8"))
      .trimEnd().split("\n").map(JSON.parse);
    const units = records.map((record) => ({
      seed: record.seed,
      world_index: record.world_index,
      arm: record.arm,
    }));
    [units[0], units[1]] = [units[1], units[0]];
    const regenerated = await materializeFixture026DevelopmentRecords("smoke", units);
    assert.equal(regenerated[0].integrity.sequence, 0);
    assert.equal(regenerated[1].integrity.previous_sha256, regenerated[0].integrity.record_sha256);
    await assert.rejects(
      () => assertFixture026OrderedWorkKeys(regenerated, "smoke"),
      /ordered work-key sequence differs/,
    );
  } finally {
    await cleanup(fixture);
  }
});

test("analysis and resume reject a torn raw-ledger tail", async () => {
  const fixture = await temporaryOutput("fixture-026-torn-");
  try {
    const partial = await executeFixture026({ profile: "smoke", output: fixture.output, maxWorkUnits: 3 });
    assert.equal(partial.complete, false);
    const rawPath = path.join(fixture.output, "raw-events.jsonl");
    const raw = await readFile(rawPath, "utf8");
    await writeFile(rawPath, raw.slice(0, -1));
    await assert.rejects(
      () => executeFixture026({ profile: "smoke", output: fixture.output, resume: true }),
      /torn|newline|JSON|raw/i,
    );
  } finally {
    await cleanup(fixture);
  }
});

test("analysis and resume reject internal or extra-terminal blank JSONL lines", async () => {
  const fixture = await temporaryOutput("fixture-026-blank-jsonl-");
  try {
    await executeFixture026({ profile: "smoke", output: fixture.output });
    const rawPath = path.join(fixture.output, "raw-events.jsonl");
    const raw = await readFile(rawPath, "utf8");
    const firstLineEnd = raw.indexOf("\n");
    assert.notEqual(firstLineEnd, -1, "fixture raw ledger must contain multiple JSONL records");
    const variants = [
      `${raw}\n`,
      `${raw.slice(0, firstLineEnd + 1)}\n${raw.slice(firstLineEnd + 1)}`,
    ];
    for (const corrupted of variants) {
      await writeFile(rawPath, corrupted);
      await assert.rejects(
        () => executeFixture026({ profile: "smoke", output: fixture.output, resume: true }),
        /blank JSONL line/,
      );
      await assert.rejects(
        () => analyzeFixture026(fixture.output),
        /blank JSONL line/,
      );
    }
  } finally {
    await cleanup(fixture);
  }
});

test("analysis and resume reject noncanonical CRLF JSONL", async () => {
  const fixture = await temporaryOutput("fixture-026-crlf-jsonl-");
  try {
    await executeFixture026({ profile: "smoke", output: fixture.output });
    const rawPath = path.join(fixture.output, "raw-events.jsonl");
    const raw = await readFile(rawPath, "utf8");
    await writeFile(rawPath, raw.replaceAll("\n", "\r\n"));
    await assert.rejects(
      () => executeFixture026({ profile: "smoke", output: fixture.output, resume: true }),
      /canonical LF JSONL|CRLF/,
    );
    await assert.rejects(
      () => analyzeFixture026(fixture.output),
      /canonical LF JSONL|CRLF/,
    );
  } finally {
    await cleanup(fixture);
  }
});

test("CLI rejects private partitions, meters, GPUs, and implicit output", async () => {
  await assertCliExecutionRejections({
    main,
    confirmationPattern: /private partitions are not executable/,
    rejectedOptions: [
      ["--meter", "device.json"],
      ["--gpu", "true"],
    ],
  });
});
