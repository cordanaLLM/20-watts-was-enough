import assert from "node:assert/strict";
import { constants } from "node:fs";
import { open, readFile, rm, writeFile } from "node:fs/promises";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { acquireLock } from "../lib/output-lock.mjs";
import { cleanup, temporaryOutput } from "../lib/runner-test-helpers.mjs";

test("shared fixture-019 lock keeps its path, document bytes and ownership error", async () => {
  const fixture = await temporaryOutput("fixture-020-shared-lock-");
  const file = `${fixture.output}.fixture-019.lock`;
  const lock = await acquireLock(fixture.output, "fixture-019");
  const original = await readFile(file, "utf8");
  try {
    assert.match(original, /^\{"schema":1,"artifact":"fixture-019","token_sha256":"[0-9a-f]{64}"\}\n$/);
    await assert.rejects(() => acquireLock(fixture.output, "fixture-019"), { code: "EEXIST" });
    const forged = JSON.parse(original);
    forged.token_sha256 = "f".repeat(64);
    await writeFile(file, `${JSON.stringify(forged)}\n`);
    await assert.rejects(() => lock.release(), { message: "Fixture 019 lock ownership changed." });
    assert.equal(await readFile(file, "utf8"), `${JSON.stringify(forged)}\n`);
  } finally {
    await writeFile(file, original);
    await lock.release();
    await cleanup(fixture);
  }
  await assert.rejects(() => readFile(file), /ENOENT/);
});

function failingLockOpen(step, failure, closeFailure) {
  return async (...args) => {
    const handle = await open(...args);
    return {
      writeFile: (...values) => step === "write" ? Promise.reject(failure) : handle.writeFile(...values),
      sync: () => step === "sync" ? Promise.reject(failure) : handle.sync(),
      close: async () => { await handle.close(); if (closeFailure) throw closeFailure; },
    };
  };
}

test("failed lock write removes its file, preserves the error and permits another acquire", async () => {
  const fixture = await temporaryOutput("fixture-020-lock-write-failure-");
  const failure = new Error("injected lock write failure");
  const file = fixture.output + ".fixture-020.lock";
  try {
    await assert.rejects(() => acquireLock(fixture.output, "fixture-020", 1000,
      { open: failingLockOpen("write", failure) }), (error) => error === failure);
    await assert.rejects(() => readFile(file), { code: "ENOENT" });
    const lock = await acquireLock(fixture.output, "fixture-020");
    await lock.release();
    await assert.rejects(() => readFile(file), { code: "ENOENT" });
  } finally { await cleanup(fixture); }
});

test("failed lock sync removes its file and preserves the original error", async () => {
  const fixture = await temporaryOutput("fixture-020-lock-sync-failure-");
  const failure = new Error("injected lock sync failure");
  try {
    await assert.rejects(() => acquireLock(fixture.output, "fixture-020", 1000,
      { open: failingLockOpen("sync", failure) }), (error) => error === failure);
    await assert.rejects(() => readFile(fixture.output + ".fixture-020.lock"), { code: "ENOENT" });
  } finally { await cleanup(fixture); }
});

test("failed lock cleanup attempts close and removal and attaches every failure", async () => {
  const fixture = await temporaryOutput("fixture-020-lock-cleanup-failure-");
  const failure = new Error("injected lock write failure");
  const closeFailure = new Error("injected lock close failure");
  const removeFailure = new Error("injected lock remove failure");
  const file = fixture.output + ".fixture-020.lock";
  let removed = false;
  try {
    await assert.rejects(() => acquireLock(fixture.output, "fixture-020", 1000, {
      open: failingLockOpen("write", failure, closeFailure),
      rm: async (...args) => { await rm(...args); removed = true; throw removeFailure; },
    }), (error) => {
      assert.equal(error, failure);
      assert.deepEqual(error.cleanupErrors, [closeFailure, removeFailure]);
      return true;
    });
    assert.equal(removed, true);
    await assert.rejects(() => readFile(file), { code: "ENOENT" });
  } finally { await cleanup(fixture); }
});

async function waitForLockRemoval(file) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try { await readFile(file); }
    catch (error) { if (error.code === "ENOENT") return; throw error; }
    await delay(25);
  }
  assert.fail("late-open lock remained after bounded poll");
}

test("late successful lock open closes and removes the abandoned lock", async () => {
  const fixture = await temporaryOutput("fixture-020-late-open-");
  const file = fixture.output + ".fixture-020.lock";
  let lateHandle;
  let closed = false;
  const pending = acquireLock(fixture.output, "fixture-020", 50, { open: async (...args) => {
    await delay(150);
    lateHandle = await open(...args);
    return { close: async () => { await lateHandle.close(); closed = true; } };
  } });
  try {
    await assert.rejects(() => pending, /Output lock deadline/);
    await delay(175);
    await waitForLockRemoval(file);
    assert.equal(closed, true);
    const lock = await acquireLock(fixture.output, "fixture-020");
    await lock.release();
    await assert.rejects(() => readFile(file), { code: "ENOENT" });
  } finally {
    if (lateHandle) await lateHandle.close();
    await cleanup(fixture);
  }
});

test("existing owner lock stays byte-identical after immediate EEXIST", async () => {
  const fixture = await temporaryOutput("fixture-020-existing-lock-");
  const file = fixture.output + ".fixture-020.lock";
  const original = Buffer.from("other owner's lock\n");
  try {
    await writeFile(file, original);
    await assert.rejects(() => acquireLock(fixture.output, "fixture-020"), { code: "EEXIST" });
    assert.deepEqual(await readFile(file), original);
  } finally { await cleanup(fixture); }
});

test("late failed lock open records EEXIST and preserves the other owner's bytes", async () => {
  const fixture = await temporaryOutput("fixture-020-late-existing-lock-");
  const file = fixture.output + ".fixture-020.lock";
  const original = Buffer.from("other owner's late lock\n");
  let deadline;
  try {
    await writeFile(file, original);
    await assert.rejects(() => acquireLock(fixture.output, "fixture-020", 50, {
      open: async (...args) => { await delay(150); return open(...args); },
    }), (error) => { deadline = error; return /Output lock deadline/.test(error.message); });
    await delay(175);
    assert.equal(deadline.lateOpenError?.code, "EEXIST");
    assert.deepEqual(await readFile(file), original);
  } finally { await cleanup(fixture); }
});

test("release rejects a 4097-byte lock document and leaves it byte-identical", async () => {
  const fixture = await temporaryOutput("fixture-020-oversized-lock-");
  const file = fixture.output + ".fixture-020.lock";
  const lock = await acquireLock(fixture.output, "fixture-020");
  const original = await readFile(file, "utf8");
  const oversized = original.trimEnd().padEnd(4096, " ") + "\n";
  try {
    await writeFile(file, oversized);
    await assert.rejects(() => lock.release(), /Fixture 020.*4096.*bytes/);
    assert.equal(await readFile(file, "utf8"), oversized);
  } finally {
    await writeFile(file, original);
    await lock.release();
    await cleanup(fixture);
  }
});

test("release accepts a valid lock document padded to exactly 4096 bytes", async () => {
  const fixture = await temporaryOutput("fixture-020-boundary-lock-");
  const file = fixture.output + ".fixture-020.lock";
  const lock = await acquireLock(fixture.output, "fixture-020");
  try {
    const original = await readFile(file, "utf8");
    const boundary = original.trimEnd().padEnd(4095, " ") + "\n";
    assert.equal(Buffer.byteLength(boundary), 4096);
    await writeFile(file, boundary);
    await lock.release();
    await assert.rejects(() => readFile(file), { code: "ENOENT" });
  } finally { await cleanup(fixture); }
});

function delayedReadOpen(state, openFailure, closeFailure) {
  return async (...args) => {
    if (args[1] === "wx") {
      state.owner = await open(...args);
      return state.owner;
    }
    assert.equal(args[1], constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    const slowRead = state.slowRead;
    if (slowRead) {
      await delay(150);
      if (openFailure) throw openFailure;
    }
    const reader = await open(...args);
    state.reader = reader;
    return {
      read: (...values) => reader.read(...values),
      stat: () => reader.stat(),
      close: async () => {
        await reader.close();
        if (slowRead) {
          state.closed = true;
          if (closeFailure) throw closeFailure;
        }
      },
    };
  };
}

async function waitForLateReader(predicate) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (predicate()) return;
    await delay(25);
  }
  assert.fail("late reader did not settle after bounded poll");
}

for (const closeFailure of [null, new Error("injected late reader close failure")]) {
  const outcome = closeFailure ? "records late reader close failure" : "closes late reader";
  test(`release deadline ${outcome} and preserves owner bytes`, async () => {
    const fixture = await temporaryOutput("fixture-020-late-reader-");
    const file = fixture.output + ".fixture-020.lock";
    const state = { slowRead: true, closed: false };
    const lock = await acquireLock(fixture.output, "fixture-020", 50, {
      open: delayedReadOpen(state, null, closeFailure),
    });
    const original = await readFile(file);
    let deadline;
    try {
      await assert.rejects(() => lock.release(), (error) => {
        deadline = error;
        return /Output lock deadline/.test(error.message);
      });
      await waitForLateReader(() => state.closed && (!closeFailure || deadline.cleanupErrors?.includes(closeFailure)));
      if (closeFailure) assert.deepEqual(deadline.cleanupErrors, [closeFailure]);
      assert.deepEqual(await readFile(file), original);
      state.slowRead = false;
      await lock.release();
      await assert.rejects(() => readFile(file), { code: "ENOENT" });
    } finally {
      if (state.reader) await state.reader.close();
      await state.owner.close();
      await cleanup(fixture);
    }
  });
}

test("release deadline records late reader open failure and preserves owner bytes", async () => {
  const fixture = await temporaryOutput("fixture-020-late-reader-failure-");
  const file = fixture.output + ".fixture-020.lock";
  const state = { slowRead: true };
  const failure = new Error("injected late reader open failure");
  const lock = await acquireLock(fixture.output, "fixture-020", 50, {
    open: delayedReadOpen(state, failure),
  });
  const original = await readFile(file);
  let deadline;
  try {
    await assert.rejects(() => lock.release(), (error) => {
      deadline = error;
      return /Output lock deadline/.test(error.message);
    });
    await waitForLateReader(() => deadline.lateOpenError === failure);
    assert.equal(deadline.lateOpenError, failure);
    assert.deepEqual(await readFile(file), original);
    state.slowRead = false;
    await lock.release();
    await assert.rejects(() => readFile(file), { code: "ENOENT" });
  } finally {
    if (state.reader) await state.reader.close();
    await state.owner.close();
    await cleanup(fixture);
  }
});
