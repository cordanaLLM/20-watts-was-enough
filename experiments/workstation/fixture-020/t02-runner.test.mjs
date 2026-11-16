import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import test from "node:test";
import { cleanup, syntheticProcessCounters, temporaryOutput } from "../lib/runner-test-helpers.mjs";
import { analyzeFixture020, executeFixture020 as execute, validateFixture020Output,
  prepareFixture020, main as runMain } from "./runner.mjs";

function executeFixture020(options) {
  return execute({ ...options, counters: syntheticProcessCounters() });
}

function main(argv, options) {
  return runMain(argv, { counters: syntheticProcessCounters(), ...options });
}

test("T02 smoke end to end: 2 worlds, analyze and validate pass", async () => {
  const fixture = await temporaryOutput("fixture-020-t02-smoke-");
  try {
    const result = await executeFixture020({ profile: "smoke", output: fixture.output, track: "ICP-T02" });
    assert.equal(result.complete, true);
    assert.equal(result.protocol_outcome, "NO_RESULT");
    const summary = await analyzeFixture020(fixture.output, { track: "ICP-T02" });
    assert.equal(summary.track, "ICP-T02");
    assert.equal(summary.retained_worlds, 2);
    assert.equal(summary.attempted_worlds, 2);
    assert.equal(summary.loss_unit, "J");
    assert.equal(summary.resource_unit, "objective evaluations");
    assert.ok(summary.regime_counts !== undefined);
    assert.equal(summary.protocol_outcome, "NO_RESULT");
    assert.equal((await validateFixture020Output(fixture.output, { track: "ICP-T02" })).valid, true);
    const raw = (await readFile(`${fixture.output}/raw-events.jsonl`, "utf8")).trim().split("\n").map(JSON.parse);
    assert.equal(raw.length, 2);
    for (const record of raw) {
      assert.equal(record.track, "ICP-T02");
      assert.equal(record.artifact, "fixture-020");
      assert.ok(record.world_id.startsWith("ICP-T02-"));
      assert.ok(record.loss_j >= 0);
      assert.ok(record.maximum_loss_j > 0);
    }
  } finally { await cleanup(fixture); }
});

test("T02 resume after interruption recovers correctly", async () => {
  const fixture = await temporaryOutput("fixture-020-t02-resume-");
  try {
    const partial = await executeFixture020({ profile: "smoke", output: fixture.output, track: "ICP-T02", maxWorkUnits: 1 });
    assert.equal(partial.complete, false);
    const result = await executeFixture020({ profile: "smoke", output: fixture.output, track: "ICP-T02", resume: true });
    assert.equal(result.complete, true);
    const summary = await analyzeFixture020(fixture.output, { track: "ICP-T02" });
    assert.equal(summary.retained_worlds, 2);
  } finally { await cleanup(fixture); }
});

test("T02 tampered artifact is refused on resume", async () => {
  const fixture = await temporaryOutput("fixture-020-t02-tamper-");
  try {
    await executeFixture020({ profile: "smoke", output: fixture.output, track: "ICP-T02", maxWorkUnits: 1 });
    const raw = JSON.parse((await readFile(`${fixture.output}/raw-events.jsonl`, "utf8")).trim());
    const worldDir = `${fixture.output}/${raw.world_id}`;
    await writeFile(`${worldDir}/tree.json`, "{}\n");
    await assert.rejects(
      () => executeFixture020({ profile: "smoke", output: fixture.output, track: "ICP-T02", resume: true }),
      /artifact replay differs/);
  } finally { await cleanup(fixture); }
});

test("--track parse: unknown refused, default is ICP-T01", async () => {
  await assert.rejects(
    () => main(["node", "runner.mjs", "prepare", "--profile", "smoke", "--track", "UNKNOWN"]),
    /unknown track/);
  const t01 = await prepareFixture020("smoke");
  assert.equal(t01.track, "ICP-T01");
  const t02 = await prepareFixture020("smoke", "ICP-T02");
  assert.equal(t02.track, "ICP-T02");
  assert.equal(t02.seeds, 2);
});

test("analyze does not accept --track on CLI", async () => {
  await assert.rejects(
    () => main(["node", "runner.mjs", "analyze", "--output", "tmp/no", "--track", "ICP-T02"]),
    /analysis does not accept --track/);
});
