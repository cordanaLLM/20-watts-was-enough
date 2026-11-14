import assert from "node:assert/strict";
import { open, readFile, rm, writeFile } from "node:fs/promises";
import test from "node:test";
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
