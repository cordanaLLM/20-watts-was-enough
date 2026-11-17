import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { cleanup, syntheticProcessCounters, temporaryOutput } from "../lib/runner-test-helpers.mjs";
import { analyzeFixture020, computeFixture020Analysis, executeFixture020 as execute,
  main as runMain, prepareFixture020, validateFixture020Output } from "./runner.mjs";
import { developmentCalibration } from "./t02-policy.mjs";

function executeFixture020(options) {
  return execute({ ...options, counters: syntheticProcessCounters() });
}

function main(argv, options) {
  return runMain(argv, { counters: syntheticProcessCounters(), ...options });
}

test("T02 smoke end to end: 2 worlds, analyze and validate resolve stored track and calibration", async () => {
  const fixture = await temporaryOutput("fixture-020-t02-smoke-");
  try {
    const result = await executeFixture020({ profile: "smoke", output: fixture.output, track: "ICP-T02" });
    assert.equal(result.complete, true);
    assert.equal(result.protocol_outcome, "NO_RESULT");
    const summary = await analyzeFixture020(fixture.output);
    assert.equal(summary.track, "ICP-T02");
    assert.equal(summary.retained_worlds, 2);
    assert.equal(summary.attempted_worlds, 2);
    assert.equal(summary.loss_unit, "J");
    assert.equal(summary.resource_unit, "objective evaluations");
    assert.ok(summary.regime_counts !== undefined);
    assert.equal(summary.development_calibration.status, "passed");
    assert.equal(summary.protocol_outcome, "NO_RESULT");
    assert.equal((await validateFixture020Output(fixture.output)).valid, true);
    assert.equal((await main(["node", "runner.mjs", "validate", "--output", fixture.output])).valid, true);
    await assert.rejects(() => analyzeFixture020(fixture.output, { track: "ICP-T01" }), /differs from stored/);
    const raw = (await readFile(`${fixture.output}/raw-events.jsonl`, "utf8")).trim().split("\n").map(JSON.parse);
    assert.equal(raw.length, 2);
    for (let i = 0; i < raw.length; i += 1) {
      const record = raw[i];
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
    const summary = await analyzeFixture020(fixture.output);
    assert.equal(summary.retained_worlds, 2);
  } finally { await cleanup(fixture); }
});

test("T02 tampered artifact is refused on both resume and validate", async () => {
  const resumeFix = await temporaryOutput("fixture-020-t02-tamper-resume-");
  const validFix = await temporaryOutput("fixture-020-t02-tamper-validate-");
  try {
    await executeFixture020({ profile: "smoke", output: resumeFix.output, track: "ICP-T02", maxWorkUnits: 1 });
    const partialRec = JSON.parse((await readFile(`${resumeFix.output}/raw-events.jsonl`, "utf8")).trim());
    await writeFile(`${resumeFix.output}/${partialRec.world_id}/tree.json`, "{}\n");
    await assert.rejects(
      () => executeFixture020({ profile: "smoke", output: resumeFix.output, track: "ICP-T02", resume: true }),
      /artifact replay differs/);

    await executeFixture020({ profile: "smoke", output: validFix.output, track: "ICP-T02" });
    await analyzeFixture020(validFix.output);
    assert.equal((await validateFixture020Output(validFix.output)).valid, true);
    const firstRec = JSON.parse((await readFile(`${validFix.output}/raw-events.jsonl`, "utf8")).split("\n")[0]);
    await writeFile(`${validFix.output}/${firstRec.world_id}/designs.jsonl`, "{}\n");
    await assert.rejects(() => validateFixture020Output(validFix.output), /artifact replay differs/);
    await assert.rejects(() => main(["node", "runner.mjs", "validate", "--output", validFix.output]),
      /artifact replay differs/);
  } finally { await cleanup(resumeFix, validFix); }
});

test("--track parse: unknown and prototype names refused, analyze/validate refuse --track, prepare carries calibration", async () => {
  for (const bad of ["UNKNOWN", "toString", "constructor"]) {
    await assert.rejects(
      () => main(["node", "runner.mjs", "prepare", "--profile", "smoke", "--track", bad]),
      /unknown track/);
  }
  const t01 = await prepareFixture020("smoke");
  assert.equal(t01.track, "ICP-T01");
  assert.equal(Object.hasOwn(t01, "development_calibration"), false);
  const t02 = await prepareFixture020("smoke", "ICP-T02");
  assert.equal(t02.track, "ICP-T02");
  assert.equal(t02.seeds, 2);
  assert.equal(t02.development_calibration.status, "passed");

  for (const action of ["analyze", "validate"]) {
    await assert.rejects(
      () => main(["node", "runner.mjs", action, "--output", "tmp/no", "--track", "ICP-T02"]),
      /analysis does not accept --track/);
  }
});

test("ICP-T02 calibration failure invalidates prepare, execute, and analyze", async () => {
  const brokenCal = () => developmentCalibration({ exponent: 0.34 });
  await assert.rejects(() => prepareFixture020("smoke", "ICP-T02", { calibration: brokenCal }),
    /^Error: ICP-T02 development calibration invalidates the track\.$/);
  const fixture = await temporaryOutput("fixture-020-t02-cal-fail-");
  try {
    await assert.rejects(() => executeFixture020({
      profile: "smoke", output: fixture.output, track: "ICP-T02", calibration: brokenCal,
    }), /^Error: ICP-T02 development calibration invalidates the track\.$/);
    await executeFixture020({ profile: "smoke", output: fixture.output, track: "ICP-T02" });
    await assert.rejects(() => analyzeFixture020(fixture.output, { calibration: brokenCal }),
      /^Error: ICP-T02 development calibration invalidates the track\.$/);
  } finally { await cleanup(fixture); }
});

test("T02 wall-deadline stop during generation and during arm retains valid failure record and resumes", async () => {
  const genStop = await temporaryOutput("fixture-020-t02-gen-timeout-");
  const armStop = await temporaryOutput("fixture-020-t02-arm-timeout-");
  try {
    let genTicks = 0;
    await assert.rejects(() => executeFixture020({
      profile: "smoke", output: genStop.output, track: "ICP-T02",
      wallMs: 3, clock: () => { genTicks += 1; return genTicks; },
    }), /ICP-T02 execution interrupted: ICP-T02 timeout\./);
    const genRec = JSON.parse(await readFile(path.join(genStop.output, "raw-events.jsonl"), "utf8"));
    assert.equal(genRec.failure_reason, "generator-failure");
    assert.equal(genRec.regime, null);
    assert.equal(genRec.execution_stop.reason, "timeout");
    await assert.rejects(() => computeFixture020Analysis(genStop.output), /ICP-T02 incomplete world denominator/);
    await executeFixture020({ profile: "smoke", output: genStop.output, track: "ICP-T02", resume: true });
    assert.equal((await analyzeFixture020(genStop.output)).retained_failures, 1);
    assert.equal((await validateFixture020Output(genStop.output)).valid, true);

    let armTicks = 0;
    await assert.rejects(() => executeFixture020({
      profile: "smoke", output: armStop.output, track: "ICP-T02",
      wallMs: 5, clock: () => { armTicks += 1; return armTicks; },
    }), /ICP-T02 execution interrupted: ICP-T02 timeout\./);
    const armRec = JSON.parse(await readFile(path.join(armStop.output, "raw-events.jsonl"), "utf8"));
    assert.equal(armRec.failure_reason, "missing-output");
    assert.notEqual(armRec.regime, null);
    assert.equal(armRec.execution_stop.reason, "timeout");
    await executeFixture020({ profile: "smoke", output: armStop.output, track: "ICP-T02", resume: true });
    assert.equal((await analyzeFixture020(armStop.output)).retained_failures, 1);
    assert.equal((await validateFixture020Output(armStop.output)).valid, true);
  } finally { await cleanup(genStop, armStop); }
});
