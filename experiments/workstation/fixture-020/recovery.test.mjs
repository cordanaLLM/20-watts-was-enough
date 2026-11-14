import assert from "node:assert/strict";
import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { cleanup, temporaryOutput } from "../lib/runner-test-helpers.mjs";
import { canonical, ExecutionStop, scientificPayload } from "./contract.mjs";
import { analyzeFixture020, executeFixture020 as execute } from "./runner.mjs";
import { hashFile, IoDeadline } from "./storage.mjs";

const worldName = "ICP-T01-0x54010000";

// Recovery contracts use explicit counters, independent of this test process's VmHWM.
function executeFixture020(options) {
  return execute({ ...options, counters: async () => ({ peak_resident_bytes: 1, current_resident_bytes: 1 }) });
}

async function assertUnlocked(output) {
  await assert.rejects(() => readFile(`${output}.fixture-020.lock`), /ENOENT/);
}

test("I/O deadline writes no interruption document and reports unsettled risk", async () => {
  const fixture = await temporaryOutput("fixture-020-io-stop-");
  try {
    await assert.rejects(() => executeFixture020({ profile: "smoke", output: fixture.output,
      append: () => { throw new Error("injected I/O", { cause: new IoDeadline("append", false) }); } }),
    /settled=false.*unsettled operation may still complete.*resume re-verifies ledger and artifacts/);
    assert.equal((await readdir(fixture.output)).some((name) => name.startsWith("interruption-")), false);
    await assertUnlocked(fixture.output);
  } finally { await cleanup(fixture); }
});

test("exclusive lock rejects a competing execute and analysis and releases on success", { timeout: 60000 }, async () => {
  const fixture = await temporaryOutput("fixture-020-lock-");
  let release;
  let entered;
  const held = new Promise((resolve) => { entered = resolve; });
  const wait = new Promise((resolve) => { release = resolve; });
  const running = executeFixture020({ profile: "smoke", output: fixture.output, maxWorkUnits: 1,
    append: async (ledger, record) => { entered(); await wait; return ledger.append(record); } });
  const guard = setTimeout(() => { entered(); release(); }, 30000);
  try {
    await held;
    for (const resume of [false, true]) {
      await assert.rejects(() => executeFixture020({ profile: "smoke", output: fixture.output, resume }),
        /fixture-020.lock.*confirming no process uses the output/);
    }
    await assert.rejects(() => analyzeFixture020(fixture.output), /fixture-020.lock/);
    release();
    await running;
    await assertUnlocked(fixture.output);
  } finally { clearTimeout(guard); release(); await running; await cleanup(fixture); }
});

test("lock releases after ExecutionStop and after an arbitrary thrown error", async () => {
  for (const error of [new ExecutionStop("cancelled"), new Error("injected append failure")]) {
    const fixture = await temporaryOutput("fixture-020-lock-error-");
    try {
      await assert.rejects(() => executeFixture020({ profile: "smoke", output: fixture.output,
        append: () => { throw error; } }), /execution interrupted/);
      const interruption = JSON.parse(await readFile(path.join(fixture.output, "interruption-0.json"), "utf8"));
      assert.ok(interruption.reason.endsWith(error.message));
      await assertUnlocked(fixture.output);
    } finally { await cleanup(fixture); }
  }
});

test("pending stopped outcome survives append failure and resume keeps its original artifacts", async () => {
  const fixture = await temporaryOutput("fixture-020-pending-stop-");
  const pending = path.join(fixture.output, worldName, "pending-outcome.json");
  let ticks = 0;
  let retained;
  try {
    await assert.rejects(() => executeFixture020({ profile: "smoke", output: fixture.output,
      wallMs: 5, clock: () => ++ticks, append: async (_ledger, record) => {
        retained = record;
        await readFile(path.join(fixture.output, worldName, "world-manifest.json"));
        throw new Error("injected append failure after artifacts", { cause: new IoDeadline("injected append", true) });
      } }), /injected append failure after artifacts/);
    assert.equal(retained.execution_stop.reason, "timeout");
    const result = await executeFixture020({ profile: "smoke", output: fixture.output, resume: true });
    assert.equal(result.complete, true);
    const records = (await readFile(path.join(fixture.output, "raw-events.jsonl"), "utf8")).trim().split("\n").map(JSON.parse);
    assert.equal(canonical(scientificPayload(records[0])), canonical(retained));
    for (const [name, digest] of Object.entries(retained.artifacts_sha256)) {
      assert.equal(await hashFile(path.join(fixture.output, worldName, name)), digest);
    }
    await assert.rejects(() => readFile(pending), /ENOENT/);
  } finally { await cleanup(fixture); }
});

test("tampered pending outcome rejects resume and remains byte-identical", async () => {
  const fixture = await temporaryOutput("fixture-020-pending-tamper-");
  const pending = path.join(fixture.output, worldName, "pending-outcome.json");
  try {
    await assert.rejects(() => executeFixture020({ profile: "smoke", output: fixture.output,
      append: () => { throw new Error("injected append failure"); } }), /append failure/);
    const record = JSON.parse(await readFile(pending, "utf8"));
    record.run_id = "f".repeat(64);
    const tampered = `${canonical(record)}\n`;
    await writeFile(pending, tampered);
    await assert.rejects(() => executeFixture020({ profile: "smoke", output: fixture.output, resume: true }), /replay differs/);
    assert.equal(await readFile(pending, "utf8"), tampered);
    await assertUnlocked(fixture.output);
  } finally { await cleanup(fixture); }
});

test("resume removes only a pending outcome identical to an already appended record", async () => {
  const fixture = await temporaryOutput("fixture-020-pending-appended-");
  const pending = path.join(fixture.output, worldName, "pending-outcome.json");
  try {
    await executeFixture020({ profile: "smoke", output: fixture.output });
    const first = JSON.parse((await readFile(path.join(fixture.output, "raw-events.jsonl"), "utf8")).split("\n")[0]);
    await writeFile(pending, `${canonical(scientificPayload(first))}\n`);
    await executeFixture020({ profile: "smoke", output: fixture.output, resume: true });
    await assert.rejects(() => readFile(pending), /ENOENT/);
    first.run_id = "f".repeat(64);
    const tampered = `${canonical(scientificPayload(first))}\n`;
    await writeFile(pending, tampered);
    await assert.rejects(() => executeFixture020({ profile: "smoke", output: fixture.output, resume: true }), /conflicting pending outcome/);
    assert.equal(await readFile(pending, "utf8"), tampered);
  } finally { await cleanup(fixture); }
});

test("run document repairs a strict prefix and preserves malformed non-prefix bytes", async () => {
  const fixture = await temporaryOutput("fixture-020-run-conflict-");
  try {
    await executeFixture020({ profile: "smoke", output: fixture.output });
    const file = path.join(fixture.output, "run.json");
    const expected = await readFile(file, "utf8");
    await writeFile(file, expected.slice(0, 80));
    await executeFixture020({ profile: "smoke", output: fixture.output, resume: true });
    assert.equal(await readFile(file, "utf8"), expected);
    const malformed = '{"unrelated":';
    await writeFile(file, malformed);
    await assert.rejects(() => executeFixture020({ profile: "smoke", output: fixture.output, resume: true }), /complete run document differs/);
    assert.equal(await readFile(file, "utf8"), malformed);
  } finally { await cleanup(fixture); }
});
