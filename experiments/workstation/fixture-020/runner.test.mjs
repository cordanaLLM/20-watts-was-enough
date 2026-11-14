import assert from "node:assert/strict";
import { mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { assertCliExecutionRejections, assertResumeMatchesUninterruptedExecution,
  cleanup, temporaryOutput } from "../lib/runner-test-helpers.mjs";
import { canonical, sha256, scientificPayload } from "./contract.mjs";
import { analyzeFixture020, computeFixture020Analysis, executeFixture020, executionCheck,
  main, prepareFixture020, validateFixture020Output } from "./runner.mjs";
import { atomicText, hashFile, outputBytes, outputDirectory, stableRows, stableText } from "./storage.mjs";

test("public prepare and CLI expose bounded A-only NO_RESULT profiles", async () => {
  const smoke = await prepareFixture020("smoke");
  assert.equal(smoke.seeds, 2);
  assert.equal(smoke.work_units, 2);
  assert.equal(smoke.protocol_outcome, "NO_RESULT");
  assert.deepEqual(smoke.arms_implemented, ["A"]);
  assert.deepEqual(smoke.arms_deferred, ["B", "C", "O"]);
  assert.equal((await prepareFixture020("development")).seeds, 64);
  await assertCliExecutionRejections({ main, confirmationPattern: /action must be/ });
  await assert.rejects(() => main(["node", "runner.mjs", "smoke", "--profile", "development", "--output", "tmp/no"]), /profile smoke/);
});

test("resume matches uninterrupted bytes; analysis, schema boundary and summary retain NO_RESULT", async () => {
  const resumed = await temporaryOutput("fixture-020-resume-");
  const complete = await temporaryOutput("fixture-020-complete-");
  try {
    await assertResumeMatchesUninterruptedExecution({ execute: executeFixture020,
      resumed, complete, maxWorkUnits: 1, extraChecks: (value) => {
        assert.equal(value.protocol_outcome, "NO_RESULT");
      } });
    const summary = await analyzeFixture020(resumed.output);
    assert.equal(summary.retained_worlds, 2);
    assert.equal(summary.attempted_worlds, 2);
    assert.equal(summary.protocol_outcome, "NO_RESULT");
    assert.equal(summary.claim_eligible, false);
    assert.equal(summary.energy_conclusion_allowed, false);
    assert.equal(Object.hasOwn(summary, "D_B_A"), false);
    assert.equal((await validateFixture020Output(resumed.output)).valid, true);
    const firstWorld = path.join(resumed.output, "ICP-T01-0x54010000");
    for (const name of ["demand.jsonl", "observations.jsonl"]) {
      const first = (await readFile(path.join(firstWorld, name), "utf8")).split("\n")[0];
      assert.equal(first, canonical(JSON.parse(first)));
    }
    await assert.rejects(() => executeFixture020({ profile: "smoke", output: resumed.output }), /already exists/);
    const stored = JSON.parse(await readFile(path.join(resumed.output, "summary.json"), "utf8"));
    stored.protocol_outcome = "PASS";
    await writeFile(path.join(resumed.output, "summary.json"), JSON.stringify(stored));
    await assert.rejects(() => validateFixture020Output(resumed.output), /summary differs/);
  } finally { await cleanup(resumed, complete); }
});

test("partial denominator refuses analysis; raw tampering and rehashed substitutions fail closed", async () => {
  const fixture = await temporaryOutput("fixture-020-tamper-");
  try {
    const partial = await executeFixture020({ profile: "smoke", output: fixture.output, maxWorkUnits: 1 });
    assert.equal(partial.complete, false);
    await assert.rejects(() => computeFixture020Analysis(fixture.output), /incomplete world denominator/);
    const rawPath = path.join(fixture.output, "raw-events.jsonl");
    const original = await readFile(rawPath, "utf8");
    const record = JSON.parse(original);
    record.loss_mmol += 1;
    await writeFile(rawPath, `${JSON.stringify(record)}\n`);
    await assert.rejects(() => executeFixture020({ profile: "smoke", output: fixture.output, resume: true }), /evaluation disagrees|hash chain/);
    record.loss_mmol -= 1;
    record.world_sha256 = "f".repeat(64);
    record.integrity.record_sha256 = sha256(`${"0".repeat(64)}\n${canonical(scientificPayload(record))}`);
    await writeFile(rawPath, `${JSON.stringify(record)}\n`);
    await rm(path.join(fixture.output, "checkpoint.json"));
    await assert.rejects(() => executeFixture020({ profile: "smoke", output: fixture.output, resume: true }), /canonical world replay differs/);
    await writeFile(rawPath, original.slice(0, -1));
    await assert.rejects(() => executeFixture020({ profile: "smoke", output: fixture.output, resume: true }), /torn/);
  } finally { await cleanup(fixture); }
});

test("interrupted artifact write repairs only a matching prefix and preserves conflicts", async () => {
  const fixture = await temporaryOutput("fixture-020-write-");
  try {
    await mkdir(fixture.output);
    const file = path.join(fixture.output, "artifact.json");
    await writeFile(`${file}.pending`, '{"fi');
    await atomicText(file, '{"fixture":20}\n');
    assert.equal(await readFile(file, "utf8"), '{"fixture":20}\n');
    await assert.rejects(() => stableText(file, "changed\n"), /artifact differs/);
    await writeFile(`${file}.pending`, "unrelated");
    await assert.rejects(() => atomicText(file, '{"fixture":20}\n'), /conflicting interrupted write/);
    assert.equal(await readFile(`${file}.pending`, "utf8"), "unrelated");
    const streamed = path.join(fixture.output, "stream.jsonl");
    const rows = function* () { yield '{"a":1}\n'; yield '{"a":2}\n'; };
    const digest = sha256('{"a":1}\n{"a":2}\n');
    await writeFile(`${streamed}.pending`, '{"a":1}\n{"');
    await stableRows(streamed, rows, digest);
    assert.equal(await hashFile(streamed), digest);
    await assert.rejects(() => stableRows(streamed, rows, "f".repeat(64)), /artifact differs/);
  } finally { await cleanup(fixture); }
});

test("output byte cap accepts equality and rejects one byte over", async () => {
  const fixture = await temporaryOutput("fixture-020-output-cap-");
  try {
    await mkdir(fixture.output);
    await writeFile(path.join(fixture.output, "bytes"), "1234");
    assert.equal(await outputBytes(fixture.output, 4), 4);
    await assert.rejects(() => outputBytes(fixture.output, 3), /output cap exceeded/);
  } finally { await cleanup(fixture); }
});

test("final durable record resumes with missing checkpoint and a torn derivable run document", async () => {
  const fixture = await temporaryOutput("fixture-020-final-resume-");
  try {
    await executeFixture020({ profile: "smoke", output: fixture.output });
    const raw = await readFile(path.join(fixture.output, "raw-events.jsonl"), "utf8");
    const run = await readFile(path.join(fixture.output, "run.json"), "utf8");
    await rm(path.join(fixture.output, "checkpoint.json"));
    await writeFile(path.join(fixture.output, "run.json"), run.slice(0, 80));
    const result = await executeFixture020({ profile: "smoke", output: fixture.output, resume: true });
    assert.equal(result.complete, true);
    assert.equal(await readFile(path.join(fixture.output, "raw-events.jsonl"), "utf8"), raw);
    assert.equal(await readFile(path.join(fixture.output, "run.json"), "utf8"), run);
    const forged = JSON.parse(run);
    forged.claim_eligible = true;
    await writeFile(path.join(fixture.output, "run.json"), JSON.stringify(forged));
    await assert.rejects(() => executeFixture020({ profile: "smoke", output: fixture.output, resume: true }), /complete run document differs/);
  } finally { await cleanup(fixture); }
});

test("replay rejects modified artifacts independently of the outcome hash chain", async () => {
  const fixture = await temporaryOutput("fixture-020-artifact-tamper-");
  try {
    await executeFixture020({ profile: "smoke", output: fixture.output, maxWorkUnits: 1 });
    await writeFile(path.join(fixture.output, "ICP-T01-0x54010000/graph.json"), "{}\n");
    await assert.rejects(() => executeFixture020({ profile: "smoke", output: fixture.output, resume: true }), /artifact replay differs/);
  } finally { await cleanup(fixture); }
});

test("timeout and cancellation reject before execution and retain an interrupted in-flight attempt", async () => {
  const fixture = await temporaryOutput("fixture-020-timeout-");
  try {
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(() => executeFixture020({ profile: "smoke", output: fixture.output,
      signal: controller.signal }), /cancelled/);
    await assert.rejects(() => main(["node", "runner.mjs", "smoke", "--profile", "smoke",
      "--output", fixture.output], { signal: controller.signal }), /cancelled/);
    await assert.rejects(() => executeFixture020({ profile: "smoke", output: fixture.output, wallMs: 0 }), /timeout/);
    assert.throws(executionCheck({ deadline: 1, clock: () => 1 }), /timeout/);
    let ticks = 0;
    await assert.rejects(() => executeFixture020({ profile: "smoke", output: fixture.output,
      wallMs: 5, clock: () => { ticks += 1; return ticks; } }), /execution interrupted.*timeout/);
    const retained = JSON.parse(await readFile(path.join(fixture.output, "interruption-1.json"), "utf8"));
    assert.equal(retained.completed_worlds, 1);
    assert.equal(retained.protocol_outcome, "NO_RESULT");
    const raw = JSON.parse(await readFile(path.join(fixture.output, "raw-events.jsonl"), "utf8"));
    assert.equal(raw.failure_reason, "generator-failure");
    assert.equal(raw.loss_mmol, raw.maximum_loss_mmol);
    assert.equal(raw.execution_stop.reason, "timeout");
    await assert.rejects(() => computeFixture020Analysis(fixture.output), /incomplete world denominator/);
    await executeFixture020({ profile: "smoke", output: fixture.output, resume: true });
    assert.equal((await analyzeFixture020(fixture.output)).retained_failures, 1);
  } finally { await cleanup(fixture); }
});

test("output paths reject escape and symlink substitution", async () => {
  const fixture = await temporaryOutput("fixture-020-path-");
  try {
    await assert.rejects(() => outputDirectory(process.cwd(), "../outside"), /inside repository/);
    await symlink(fixture.parent, fixture.output, "junction");
    await assert.rejects(() => outputDirectory(process.cwd(), fixture.output, true), /path substitution/);
  } finally { await cleanup(fixture); }
});
