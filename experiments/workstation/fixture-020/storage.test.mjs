import assert from "node:assert/strict";
import test from "node:test";
import { io, IoDeadline } from "./storage.mjs";

test("I/O deadline aborts and reports an operation that never settles", async () => {
  let signal;
  await assert.rejects(() => io((received) => {
    signal = received;
    return new Promise(() => {});
  }, "never settles", 5), (error) => {
    assert.match(error.message, /ICP-T01 never settles:/);
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
