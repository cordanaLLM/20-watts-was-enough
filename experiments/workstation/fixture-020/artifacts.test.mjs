import assert from "node:assert/strict";
import test from "node:test";
import { worldArtifacts } from "./artifacts.mjs";
import { canonical, sha256 } from "./contract.mjs";
import { generateFixture020World } from "./generator.mjs";
import { evaluateArmA } from "./evaluator.mjs";
import { loadInputs } from "./inputs.mjs";

test("retained generation manifest binds world hash while metrics include observation events", () => {
  const world = generateFixture020World({ seed: 0x54010000 });
  const evaluation = evaluateArmA(world);
  evaluation.uniform_upper_round = world.manifest.uniform_upper_round + 1;
  const artifacts = worldArtifacts(world, evaluation);
  const retained = JSON.parse([...artifacts.sources["world-manifest.json"]()][0]);
  assert.equal(sha256(canonical(retained)), world.world_sha256);
  assert.equal(retained.uniform_upper_round, world.manifest.uniform_upper_round);
  assert.equal(artifacts.metrics.uniform_upper_round, world.manifest.uniform_upper_round + 1);
});

test("receipt command follows profile for one stable resume identity", async () => {
  for (const profile of ["smoke", "development"]) {
    const identity = await loadInputs(profile);
    assert.equal(identity.execution_receipt.command, profile === "smoke" ? "smoke" : "run");
  }
});
