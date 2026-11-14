import assert from "node:assert/strict";
import test from "node:test";
import { memoryCapCheck } from "./resources.mjs";

test("memory cap checks equality, peak excess and current RSS lower bounds", () => {
  const capBytes = 134217728;
  assert.equal(memoryCapCheck({ peakBytes: capBytes, currentBytes: capBytes + 1, capBytes }), "linux-peak-resident");
  assert.throws(() => memoryCapCheck({ peakBytes: capBytes + 1, currentBytes: 1, capBytes }), /memory-cap/);
  assert.throws(() => memoryCapCheck({ peakBytes: null, currentBytes: capBytes + 1, capBytes }), /memory-cap/);
  assert.equal(memoryCapCheck({ peakBytes: null, currentBytes: capBytes - 1, capBytes }), "current-resident-lower-bound");
});
