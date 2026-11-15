import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { cleanup, syntheticProcessCounters, temporaryOutput } from "../lib/runner-test-helpers.mjs";
import { main } from "./runner.mjs";

test("in-process smoke resource scope identifies its baseline and memory cap check", async () => {
  const fixture = await temporaryOutput("fixture-020-resource-scope-");
  try {
    const result = await main(["node", "runner.mjs", "smoke", "--profile", "smoke", "--output", fixture.output],
      { counters: syntheticProcessCounters() });
    assert.equal(result.resources.scope, "in-process main call after module load");
    assert.equal(result.resources.memory_cap_bytes, 134217728);
    assert.equal(result.resources.memory_cap_check,
      "linux-peak-resident");
  } finally { await cleanup(fixture); }
});

test("smoke receipt records a current-resident lower bound when peak is unavailable", async () => {
  const fixture = await temporaryOutput("fixture-020-resource-current-");
  try {
    const result = await main(["node", "runner.mjs", "smoke", "--profile", "smoke", "--output", fixture.output],
      { counters: syntheticProcessCounters({ peak_resident_bytes: null }) });
    assert.equal(result.resources.scope, "in-process main call after module load");
    assert.equal(result.resources.memory_cap_bytes, 134217728);
    assert.equal(result.resources.memory_cap_check, "current-resident-lower-bound");
    assert.equal(result.resources.peak_resident_bytes, null);
    assert.equal(result.resources.current_resident_bytes, 1);
  } finally { await cleanup(fixture); }
});

test("smoke rejects an over-cap final peak after recording the resource check", async () => {
  const fixture = await temporaryOutput("fixture-020-resource-over-cap-");
  const low = syntheticProcessCounters();
  const high = syntheticProcessCounters({ peak_resident_bytes: 134217729 });
  let reads = 0;
  try {
    // Two worlds each have a pre/post check; the fifth sample belongs to the receipt.
    await assert.rejects(() => main(["node", "runner.mjs", "smoke", "--profile", "smoke", "--output", fixture.output],
      { counters: () => (++reads <= 4 ? low() : high()) }), /memory-cap/);
    assert.equal(reads, 5);
    const resources = JSON.parse(await readFile(path.join(fixture.output, "resources.json"), "utf8"));
    assert.equal(resources.scope, "in-process main call after module load");
    assert.equal(resources.memory_cap_bytes, 134217728);
    assert.equal(resources.memory_cap_check, "linux-peak-resident");
    assert.equal(resources.peak_resident_bytes, 134217729);
  } finally { await cleanup(fixture); }
});
