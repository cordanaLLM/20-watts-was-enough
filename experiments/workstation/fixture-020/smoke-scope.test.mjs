import assert from "node:assert/strict";
import test from "node:test";
import { cleanup, temporaryOutput } from "../lib/runner-test-helpers.mjs";
import { main } from "./runner.mjs";

test("in-process smoke resource scope identifies its baseline and memory cap check", async () => {
  const fixture = await temporaryOutput("fixture-020-resource-scope-");
  try {
    const result = await main(["node", "runner.mjs", "smoke", "--profile", "smoke", "--output", fixture.output]);
    assert.equal(result.resources.scope, "in-process main call after module load");
    assert.equal(result.resources.memory_cap_bytes, 134217728);
    assert.equal(result.resources.memory_cap_check,
      process.platform === "linux" ? "linux-peak-resident" : "current-resident-lower-bound");
  } finally { await cleanup(fixture); }
});
