import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import test from "node:test";
import { waitForCondition, STALL_FACTOR, WALL_CAP_FACTOR } from "./browser-wait.mjs";

function fakeClock(slowdown = 1) {
  let milliseconds = 0;
  return {
    now: () => milliseconds,
    sleep: async (duration) => { milliseconds += duration * slowdown; },
  };
}

test("a starved clock retains the observations needed for acceptance", async () => {
  let polls = 0;
  assert.equal(await waitForCondition({
    probe: () => ++polls,
    accepts: (value) => value === 10,
    budgetMs: 100,
    intervalMs: 10,
    clock: fakeClock(10),
  }), 10);
});


test("accepted early returns the original observation", async () => {
  const snapshot = { ready: true };
  assert.equal(await waitForCondition({
    probe: () => snapshot, accepts: (value) => value.ready,
    budgetMs: 100, intervalMs: 10, clock: fakeClock(),
  }), snapshot);
});

test("a wrong page exhausts charged time without an UNDECIDED label", async () => {
  let polls = 0;
  await assert.rejects(waitForCondition({
    probe: () => { polls += 1; return false; },
    budgetMs: 100, intervalMs: 10, clock: fakeClock(), label: "wrong page",
  }), (error) => {
    assert.equal(error.message.startsWith("UNDECIDED"), false);
    assert.match(error.message, /wrong page; charged 100 ms, wall 100 ms, stalled 0 ms/u);
    return true;
  });
  assert.equal(polls, 11);
});

test("acceptance on the last charged poll wins", async () => {
  let polls = 0;
  assert.equal(await waitForCondition({
    probe: () => ++polls, accepts: (value) => value === 11,
    budgetMs: 100, intervalMs: 10, clock: fakeClock(),
  }), 11);
});

test("10x starvation retains the full poll count and fails at the wall cap", async () => {
  let polls = 0;
  await assert.rejects(waitForCondition({
    probe: () => { polls += 1; return false; },
    budgetMs: 100, intervalMs: 10, clock: fakeClock(10),
  }), (error) => {
    assert.match(error.message, /^UNDECIDED: host starved/u);
    assert.equal(error.chargedMs, 100);
    assert.equal(error.wallMs, 100 * WALL_CAP_FACTOR);
    assert.equal(error.stalledMs, 900);
    return true;
  });
  assert.equal(STALL_FACTOR, 1);
  assert.equal(polls, 11);
});

test("a probe returning beyond the hard wall cap cannot pass", async () => {
  const clock = fakeClock();
  await assert.rejects(waitForCondition({
    probe: async () => { await clock.sleep(1_001); return true; },
    budgetMs: 100, intervalMs: 10, clock,
  }), /^Error: UNDECIDED: host starved/u);
});

test("a real probe that never settles is bounded by the watchdog", async () => {
  await assert.rejects(waitForCondition({
    probe: () => new Promise(() => {}), budgetMs: 1, intervalMs: 1,
  }), /UNDECIDED: host starved/u);
});

test("invalid budgets fail before probing", async () => {
  for (const budgetMs of [0, -1, Infinity, NaN, 0.5, Number.MAX_SAFE_INTEGER]) {
    await assert.rejects(waitForCondition({ probe: () => true, budgetMs }), TypeError);
  }
});


test("slightly early timer wakes cannot exhaust the poll bound before the budget", async () => {
  let milliseconds = 0;
  await assert.rejects(waitForCondition({
    probe: () => false, budgetMs: 100, intervalMs: 10,
    clock: { now: () => milliseconds, sleep: async (duration) => { milliseconds += Math.max(1, Math.floor(duration - 0.2)); } },
  }), (error) => {
    assert.equal(error.chargedMs, 100);
    assert.equal(error.wallMs, 100);
    return true;
  });
});

test("UNDECIDED requires a stalled share strictly greater than one half", async () => {
  for (const wallMs of [100, 101]) {
    const clock = fakeClock();
    await assert.rejects(waitForCondition({
      probe: async () => { await clock.sleep(wallMs); return false; },
      budgetMs: 50, intervalMs: 50, clock,
    }), (error) => {
      assert.equal(error.message.startsWith("UNDECIDED"), wallMs > 100);
      assert.equal(error.chargedMs, 50);
      assert.equal(error.stalledMs, wallMs - 50);
      return true;
    });
  }
});

// A test that polls against Date.now() lets a stalled host spend its budget;
// test waits go through waitForCondition instead (#207).
const wallClockLoop = /while\s*\(\s*Date\.now\(\)\s*</u;

test("the wall-clock loop detector flags a planted deadline loop", () => {
  // Joined so that this file does not itself contain a planted loop.
  assert.equal(wallClockLoop.test(["const deadline = Date.now() + 30_000;\nwhile (", "Date.now() < deadline) {}"].join("")), true);
  assert.equal(wallClockLoop.test(["while(", "Date.now()<deadline){}"].join("")), true);
  assert.equal(wallClockLoop.test("await waitForCondition({ probe, budgetMs: 30_000 });"), false);
});

test("no tracked test file polls against a wall-clock deadline", async () => {
  const root = new URL("../../", import.meta.url);
  const files = execFileSync("git", ["ls-files", "-z", "--", "*.test.mjs"], {
    cwd: root, encoding: "utf8", maxBuffer: 8 * 1024 * 1024, timeout: 30_000,
  }).split("\0").filter(Boolean);
  assert.ok(files.length > 50, `expected the tracked test inventory, got ${files.length} files`);
  const offenders = [];
  for (const file of files) {
    if (wallClockLoop.test(await readFile(new URL(file, root), "utf8"))) offenders.push(file);
  }
  assert.deepEqual(offenders, []);
});
