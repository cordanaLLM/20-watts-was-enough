import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { cleanup, syntheticProcessCounters, temporaryOutput } from "../lib/runner-test-helpers.mjs";
import { analyzeFixture020, computeFixture020Analysis, executeFixture020,
  main, validateFixture020Output } from "./runner.mjs";

test("smoke shares one deadline across execute, analyze and validate", async () => {
  const fixture = await temporaryOutput("fixture-020-shared-deadline-");
  let now = 0;
  try {
    await assert.rejects(() => main(["node", "runner.mjs", "smoke", "--profile", "smoke",
      "--output", fixture.output], { counters: syntheticProcessCounters(), clock: () => { now += 10; return now; } }), /timeout/);
    // Execution itself fits; a fresh per-phase budget would let the command succeed.
    const raw = (await readFile(path.join(fixture.output, "raw-events.jsonl"), "utf8")).trim().split("\n");
    assert.equal(raw.length, 2);
    assert.ok(raw.every((line) => JSON.parse(line).execution_stop === null));
  } finally { await cleanup(fixture); }
});

test("expired replay reports timeout rather than a payload mismatch", async () => {
  const fixture = await temporaryOutput("fixture-020-replay-deadline-");
  try {
    await executeFixture020({ profile: "smoke", output: fixture.output, counters: syntheticProcessCounters() });
    await assert.rejects(() => computeFixture020Analysis(fixture.output, { deadline: 0, clock: () => 1 }), (error) => {
      assert.match(error.message, /replay.*timeout/);
      assert.doesNotMatch(error.message, /differs/);
      return true;
    });
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(() => analyzeFixture020(fixture.output, { signal: controller.signal }), /cancelled/);
    await assert.rejects(() => validateFixture020Output(fixture.output, { signal: controller.signal }), /cancelled/);
  } finally { await cleanup(fixture); }
});

test("memory cap at the post-world boundary retains an ordinary record and interruption", async () => {
  const fixture = await temporaryOutput("fixture-020-memory-boundary-");
  let reads = 0;
  const low = syntheticProcessCounters();
  const high = syntheticProcessCounters({ peak_resident_bytes: 134217729 });
  try {
    await assert.rejects(() => executeFixture020({ profile: "development", output: fixture.output, maxWorkUnits: 1,
      counters: () => (++reads === 1 ? low() : high()) }), /memory-cap/);
    const interruption = JSON.parse(await readFile(path.join(fixture.output, "interruption-1.json"), "utf8"));
    assert.equal(interruption.completed_worlds, 1);
    assert.match(interruption.reason, /memory-cap/);
    const record = JSON.parse(await readFile(path.join(fixture.output, "raw-events.jsonl"), "utf8"));
    assert.equal(record.execution_stop, null);
  } finally { await cleanup(fixture); }
});

test("both profiles stop at the first boundary when the peak exceeds their cap", async () => {
  for (const profile of ["smoke", "development"]) {
    const fixture = await temporaryOutput("fixture-020-memory-first-boundary-");
    try {
      await assert.rejects(() => executeFixture020({ profile, output: fixture.output, maxWorkUnits: 1,
        counters: syntheticProcessCounters({ peak_resident_bytes: 134217729 }) }), /memory-cap/);
      const interruption = JSON.parse(await readFile(path.join(fixture.output, "interruption-0.json"), "utf8"));
      assert.equal(interruption.completed_worlds, 0);
      assert.match(interruption.reason, /memory-cap/);
      await assert.rejects(() => readFile(path.join(fixture.output, "raw-events.jsonl")), { code: "ENOENT" });
    } finally { await cleanup(fixture); }
  }
});
