import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import {
  cleanup,
  corruptRawEventsFirstRow,
  temporaryOutput,
} from "../lib/runner-test-helpers.mjs";

import {
  analyzeFixture025,
  executeFixture025,
  main,
  prepareFixture025,
  validateFixture025Output,
} from "./runner.mjs";

test("smoke preparation exposes one of ten tracks and bounded public work", async () => {
  assert.deepEqual(await prepareFixture025("smoke"), {
    valid: true,
    artifact: "fixture-025",
    track: "ECM-T03",
    profile: "smoke",
    partition: "public-development-only",
    seeds: 2,
    worlds_per_seed: 5,
    work_units: 30,
    implemented_tracks: 1,
    registered_tracks: 10,
    confirmation_seeds_created: false,
    transfer_seeds_created: false,
    measured_energy_required: false,
    energy_conclusion_allowed: false,
    claim_eligible: false,
    no_result: true,
  });
});

test("smoke run exercises ordered gate precedence without result authority", async () => {
  const fixture = await temporaryOutput("fixture-025-smoke-");
  try {
    const execution = await executeFixture025({ profile: "smoke", output: fixture.output, resume: false });
    assert.equal(execution.complete, true);
    assert.equal(execution.run.expected_work_units, 30);
    const summary = await analyzeFixture025(fixture.output);
    const validation = await validateFixture025Output(fixture.output);
    assert.equal(summary.decision, "diagnostic-pass");
    assert.ok(Object.values(summary.checks).every(Boolean));
    assert.equal(summary.metrics["ordered-validity-gate"].mean_invalid_error, 0);
    assert.equal(summary.metrics["ordered-validity-gate"].mean_overclaim_error, 0);
    assert.ok(summary.metrics["ungated-fit"].mean_overclaim_error > 0);
    assert.equal(summary.comparison_inference_permitted, false);
    assert.equal(summary.claim_eligible, false);
    assert.deepEqual(validation, { valid: true, run_id: summary.run_id, decision: "diagnostic-pass", no_result: true });
  } finally {
    await cleanup(fixture);
  }
});

test("same public inputs produce byte-identical raw ledgers", async () => {
  const left = await temporaryOutput("fixture-025-left-");
  const right = await temporaryOutput("fixture-025-right-");
  try {
    await executeFixture025({ profile: "smoke", output: left.output });
    await executeFixture025({ profile: "smoke", output: right.output });
    assert.equal(await readFile(path.join(left.output, "raw-events.jsonl"), "utf8"), await readFile(path.join(right.output, "raw-events.jsonl"), "utf8"));
  } finally {
    await cleanup(left, right);
  }
});

test("checkpoint resume reproduces uninterrupted output exactly", async () => {
  const resumed = await temporaryOutput("fixture-025-resume-");
  const complete = await temporaryOutput("fixture-025-complete-");
  try {
    const partial = await executeFixture025({ profile: "smoke", output: resumed.output, maxWorkUnits: 7 });
    assert.equal(partial.complete, false);
    const finished = await executeFixture025({ profile: "smoke", output: resumed.output, resume: true });
    assert.equal(finished.complete, true);
    await executeFixture025({ profile: "smoke", output: complete.output });
    assert.equal(await readFile(path.join(resumed.output, "raw-events.jsonl"), "utf8"), await readFile(path.join(complete.output, "raw-events.jsonl"), "utf8"));
    assert.equal(await readFile(path.join(resumed.output, "checkpoint.json"), "utf8"), await readFile(path.join(complete.output, "checkpoint.json"), "utf8"));
  } finally {
    await cleanup(resumed, complete);
  }
});

test("analysis rejects an altered chained decision", async () => {
  const fixture = await temporaryOutput("fixture-025-corrupt-");
  try {
    await executeFixture025({ profile: "smoke", output: fixture.output });
    await corruptRawEventsFirstRow(fixture.output);
    await assert.rejects(() => analyzeFixture025(fixture.output), /runtime contract|hash/i);
  } finally {
    await cleanup(fixture);
  }
});

test("CLI exposes no private partition or apparatus action", async () => {
  await assert.rejects(() => main(["node", "runner.mjs", "confirmation", "--profile", "development"]), /private partitions are not executable/);
  await assert.rejects(() => main(["node", "runner.mjs", "smoke", "--profile", "smoke"]), /requires --output/);
  await assert.rejects(() => main(["node", "runner.mjs", "prepare", "--profile", "smoke", "--meter", "device.json"]), /Unknown or duplicate/);
});
