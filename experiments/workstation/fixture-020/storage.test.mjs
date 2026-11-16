import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import { cleanup, temporaryOutput } from "../lib/runner-test-helpers.mjs";
import { io, IoDeadline, outputDirectory, syncDirectory } from "./storage.mjs";

test("I/O deadline aborts and reports an operation that never settles", async () => {
  let signal;
  await assert.rejects(() => io((received) => {
    signal = received;
    return new Promise(() => {});
  }, "never settles", 5), (error) => {
    assert.match(error.message, /fixture-020 never settles:/);
    assert.ok(error.cause instanceof IoDeadline);
    assert.equal(error.cause.label, "never settles");
    assert.equal(error.cause.settled, false);
    return true;
  });
  assert.equal(signal.aborted, true);
});

test("I/O deadline waits for settlement after abort and retains its typed cause", async () => {
  let settled = false;
  await assert.rejects(() => io((signal) => new Promise((resolve) => {
    signal.addEventListener("abort", () => { settled = true; resolve("aborted"); }, { once: true });
  }), "settles after abort", 5), (error) => {
    assert.ok(error.cause instanceof IoDeadline);
    assert.equal(error.cause.settled, true);
    return true;
  });
  assert.equal(settled, true);
  assert.equal(await io(() => 42, "success", 5), 42);
});

test("creating two output segments syncs each parent in order", async () => {
  const fixture = await temporaryOutput("fixture-020-parent-sync-");
  const synced = [];
  try {
    const output = await outputDirectory(fixture.parent, "one/two", true, {
      syncDirectory: async (directory) => { synced.push(directory); await syncDirectory(directory); },
    });
    assert.equal(output, path.join(fixture.parent, "one", "two"));
    assert.deepEqual(synced, [fixture.parent, path.join(fixture.parent, "one")]);
    synced.length = 0;
    await outputDirectory(fixture.parent, "one/two", true, {
      syncDirectory: async (directory) => { synced.push(directory); await syncDirectory(directory); },
    });
    assert.deepEqual(synced, []);
  } finally { await cleanup(fixture); }
});
