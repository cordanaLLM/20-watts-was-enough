import assert from "node:assert/strict";
import fs, { readFile, readdir, rm, writeFile } from "node:fs/promises";
import { syncBuiltinESMExports } from "node:module";
import path from "node:path";
import test from "node:test";
import { cleanup, syntheticProcessCounters, temporaryOutput } from "../lib/runner-test-helpers.mjs";
import { canonical, ExecutionStop, scientificPayload } from "./contract.mjs";
import * as runner from "./runner.mjs";
import { hashFile, IoDeadline } from "./storage.mjs";

const worldName = "ICP-T01-0x54010000";
const { analyzeFixture020, executeFixture020: execute, withFixture020OutputLock } = runner;

// Recovery contracts use explicit counters, independent of this test process's VmHWM.
function executeFixture020(options) {
  return execute({ ...options, counters: syntheticProcessCounters() });
}

async function assertUnlocked(output) {
  await assert.rejects(() => readFile(`${output}.fixture-020.lock`), /ENOENT/);
}

test("I/O deadline writes no interruption document and retains the lock until operator removal", async () => {
  const fixture = await temporaryOutput("fixture-020-io-stop-");
  const file = `${fixture.output}.fixture-020.lock`;
  try {
    await assert.rejects(() => executeFixture020({ profile: "smoke", output: fixture.output,
      append: () => { throw new IoDeadline("append", false); } }), (error) => {
      assert.match(error.message, /settled=false/);
      assert.ok(error.message.includes(file));
      assert.match(error.message, /confirming no process uses the output/);
      assert.doesNotMatch(error.message, /resume re-verifies/);
      return true;
    });
    assert.equal((await readdir(fixture.output)).some((name) => name.startsWith("interruption-")), false);
    const original = await readFile(file);
    const document = JSON.parse(original);
    assert.deepEqual(JSON.parse(original), { schema: 1, artifact: "fixture-020",
      token_sha256: document.token_sha256 });
    assert.match(document.token_sha256, /^[0-9a-f]{64}$/);
    await assert.rejects(() => executeFixture020({ profile: "smoke", output: fixture.output, resume: true }),
      /fixture-020.lock.*confirming no process uses the output/);
    assert.deepEqual(await readFile(file), original);
    await assert.rejects(() => analyzeFixture020(fixture.output), /fixture-020.lock/);
    assert.deepEqual(await readFile(file), original);
    // Operator removal after confirming no process uses this synthetic output.
    await rm(file);
    assert.equal((await executeFixture020({ profile: "smoke", output: fixture.output, resume: true })).complete, true);
    await assertUnlocked(fixture.output);
  } finally { await cleanup(fixture); }
});

test("output lock helper returns the body value and releases on success", async () => {
  const fixture = await temporaryOutput("fixture-020-helper-success-");
  const value = { complete: true };
  try {
    assert.equal(await withFixture020OutputLock(fixture.output, async () => {
      await readFile(`${fixture.output}.fixture-020.lock`);
      return value;
    }), value);
    await assertUnlocked(fixture.output);
  } finally { await cleanup(fixture); }
});

for (const error of [new Error("plain failure"), new ExecutionStop("cancelled"),
  new Error("ICP-T01 read: settled failure", { cause: new IoDeadline("read", true) })]) {
  test(`output lock helper releases and preserves the original rejection: ${error.message}`, async () => {
    const fixture = await temporaryOutput("fixture-020-helper-release-");
    try {
      await assert.rejects(() => withFixture020OutputLock(fixture.output, () => { throw error; }),
        (actual) => actual === error);
      await assertUnlocked(fixture.output);
    } finally { await cleanup(fixture); }
  });
}

const directDeadline = new IoDeadline("append", false);
const wrappedDeadline = new Error("outer I/O", {
  cause: new Error("inner I/O", { cause: new IoDeadline("append", false) }),
});
for (const [depth, error] of [[0, directDeadline], [2, wrappedDeadline]]) {
  test(`output lock helper retains unchanged bytes for settled=false at cause depth ${depth}`, async () => {
    const fixture = await temporaryOutput("fixture-020-helper-retain-");
    const file = `${fixture.output}.fixture-020.lock`;
    let original;
    try {
      await assert.rejects(() => withFixture020OutputLock(fixture.output, async () => {
        original = await readFile(file);
        throw error;
      }), (actual) => {
        assert.notEqual(actual, error);
        assert.equal(actual.cause, error);
        assert.ok(actual.message.includes(file));
        assert.match(actual.message, /delete it only after confirming no process uses the output/);
        return true;
      });
      assert.deepEqual(await readFile(file), original);
    } finally { await cleanup(fixture); }
  });
}

test("output lock helper attaches retain failure to the retained-lock error", async (t) => {
  const fixture = await temporaryOutput("fixture-020-helper-retain-failure-");
  const file = `${fixture.output}.fixture-020.lock`;
  const failure = new Error("injected retain close failure");
  const deadline = new IoDeadline("append", false);
  const openFile = fs.open;
  let original;
  t.mock.method(fs, "open", async (...args) => {
    const handle = await openFile(...args);
    if (args[0] !== file || args[1] !== "wx") return handle;
    return { writeFile: (...values) => handle.writeFile(...values), sync: () => handle.sync(),
      close: async () => { await handle.close(); throw failure; } };
  });
  syncBuiltinESMExports();
  try {
    await assert.rejects(() => withFixture020OutputLock(fixture.output, async () => {
      original = await readFile(file);
      throw deadline;
    }), (error) => {
      assert.equal(error.cause, deadline);
      assert.deepEqual(error.cleanupErrors, [failure]);
      assert.ok(error.message.includes(file));
      return true;
    });
    assert.deepEqual(await readFile(file), original);
  } finally {
    t.mock.restoreAll();
    syncBuiltinESMExports();
    await cleanup(fixture);
  }
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
  const suffix = "; operation settled=true; an unsettled operation may still complete; resume re-verifies ledger and artifacts.";
  const message = "ICP-T01 append world outcome: injected append failure after artifacts";
  try {
    await assert.rejects(() => executeFixture020({ profile: "smoke", output: fixture.output,
      wallMs: 5, clock: () => ++ticks, append: async (_ledger, record) => {
        retained = record;
        await readFile(path.join(fixture.output, worldName, "world-manifest.json"));
        throw new Error("injected append failure after artifacts", { cause: new IoDeadline("injected append", true) });
      } }), { message: `ICP-T01 execution interrupted: ICP-T01 execution interrupted: ${message}${suffix}${suffix}` });
    await assertUnlocked(fixture.output);
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
